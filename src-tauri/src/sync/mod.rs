pub mod crypto;
pub mod pairing;
pub mod relay;
pub mod snapshot;

use crate::db::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// Persisted sync state loaded from the `syncState` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub device_id: String,
    pub device_name: String,
    pub sync_key: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_snapshot_hash: Option<String>,
    pub relay_url: String,
}

/// Load sync state from the database. Returns None if no row exists yet.
pub fn load_sync_state(db: &Database) -> Result<Option<SyncState>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT deviceId, deviceName, syncKey, lastSyncedAt, lastSnapshotHash, relayUrl
             FROM syncState WHERE id = 'singleton'",
        )
        .map_err(|e| format!("Failed to prepare sync state query: {}", e))?;

    let result = stmt
        .query_row([], |row| {
            Ok(SyncState {
                device_id: row.get(0)?,
                device_name: row.get(1)?,
                sync_key: row.get(2)?,
                last_synced_at: row.get(3)?,
                last_snapshot_hash: row.get(4)?,
                relay_url: row.get(5)?,
            })
        })
        .ok();

    Ok(result)
}

/// Initialize sync state with a new device ID if no row exists yet.
pub fn ensure_sync_state(db: &Database) -> Result<SyncState, String> {
    if let Some(state) = load_sync_state(db)? {
        return Ok(state);
    }

    let device_id = uuid::Uuid::new_v4().to_string();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO syncState (id, deviceId) VALUES ('singleton', ?1)",
        params![device_id],
    )
    .map_err(|e| format!("Failed to initialize sync state: {}", e))?;
    drop(conn);

    load_sync_state(db)?
        .ok_or_else(|| "Failed to load sync state after initialization".to_string())
}

/// Save/update sync state in the database.
pub fn save_sync_state(db: &Database, state: &SyncState) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO syncState (id, deviceId, deviceName, syncKey, lastSyncedAt, lastSnapshotHash, relayUrl)
         VALUES ('singleton', ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
             deviceName = excluded.deviceName,
             syncKey = excluded.syncKey,
             lastSyncedAt = excluded.lastSyncedAt,
             lastSnapshotHash = excluded.lastSnapshotHash,
             relayUrl = excluded.relayUrl",
        params![
            state.device_id,
            state.device_name,
            state.sync_key,
            state.last_synced_at,
            state.last_snapshot_hash,
            state.relay_url,
        ],
    )
    .map_err(|e| format!("Failed to save sync state: {}", e))?;

    Ok(())
}

/// Atomic flag to signal that the database has been mutated since last sync push.
pub type SyncDirtyFlag = Arc<AtomicBool>;

pub fn create_dirty_flag() -> SyncDirtyFlag {
    Arc::new(AtomicBool::new(false))
}

/// Mark the database as dirty (needing sync push).
pub fn mark_dirty(flag: &SyncDirtyFlag) {
    flag.store(true, Ordering::Relaxed);
}

/// Background sync task: checks every 30 seconds if the DB is dirty and paired,
/// then pushes an encrypted snapshot to the relay.
pub async fn background_sync_loop(
    db: Database,
    dirty_flag: SyncDirtyFlag,
    app_handle: tauri::AppHandle,
) {
    use tokio::time::{interval, Duration};

    let mut tick = interval(Duration::from_secs(30));

    loop {
        tick.tick().await;

        // Only act if dirty
        if !dirty_flag.load(Ordering::Relaxed) {
            continue;
        }

        // Check if paired
        let state = match load_sync_state(&db) {
            Ok(Some(s)) if s.sync_key.is_some() => s,
            _ => continue,
        };

        let sync_key = state.sync_key.as_deref().unwrap();
        let key = match crypto::decode_sync_key(sync_key) {
            Ok(k) => k,
            Err(_) => continue,
        };

        // Create snapshot and check hash
        let snapshot_data = match snapshot::create_snapshot(&db) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Background sync: snapshot failed: {}", e);
                continue;
            }
        };

        let hash = hex::encode(sha2::Sha256::digest(&snapshot_data));

        if state.last_snapshot_hash.as_deref() == Some(&hash) {
            dirty_flag.store(false, Ordering::Relaxed);
            continue;
        }

        // Encrypt and push
        let blob = match crypto::encrypt_snapshot(&snapshot_data, &key) {
            Ok(b) => b,
            Err(e) => {
                log::error!("Background sync: encryption failed: {}", e);
                continue;
            }
        };

        let client =
            relay::RelayClient::new(&state.relay_url, &state.device_id, sync_key.as_bytes());
        if let Err(e) = client.push(&blob).await {
            log::error!("Background sync: push failed: {}", e);
            continue;
        }

        // Update state
        let now = chrono::Utc::now().to_rfc3339();
        let mut updated = state.clone();
        updated.last_synced_at = Some(now);
        updated.last_snapshot_hash = Some(hash);
        if let Err(e) = save_sync_state(&db, &updated) {
            log::error!("Background sync: save state failed: {}", e);
        }

        dirty_flag.store(false, Ordering::Relaxed);
        let _ = app_handle.emit("sync:pushed", ());
    }
}
