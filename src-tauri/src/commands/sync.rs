use crate::db::Database;
use crate::sync::{self, crypto, pairing, relay, snapshot};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use sha2::Digest;
use tauri::{Emitter, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub paired: bool,
    pub device_id: String,
    pub device_name: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingOffer {
    pub text_code: String,
    pub qr_code_png: String, // base64 PNG
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub action: String, // "pushed" | "pulled" | "up_to_date" | "conflict"
    pub timestamp: Option<String>,
}

#[tauri::command]
pub fn get_sync_status(db: State<Database>) -> Result<SyncStatus, String> {
    let state = sync::ensure_sync_state(&db)?;
    Ok(SyncStatus {
        paired: state.sync_key.is_some(),
        device_id: state.device_id,
        device_name: state.device_name,
        last_synced_at: state.last_synced_at,
    })
}

#[tauri::command]
pub fn update_device_name(db: State<Database>, name: String) -> Result<(), String> {
    let mut state = sync::ensure_sync_state(&db)?;
    state.device_name = name;
    sync::save_sync_state(&db, &state)
}

#[tauri::command]
pub fn initiate_pairing(db: State<Database>) -> Result<PairingOffer, String> {
    let mut state = sync::ensure_sync_state(&db)?;

    // Generate or reuse sync key
    if state.sync_key.is_none() {
        state.sync_key = Some(crypto::generate_sync_key());
        sync::save_sync_state(&db, &state)?;
    }

    let payload = pairing::PairingPayload {
        sync_key: state.sync_key.clone().unwrap(),
        device_id: state.device_id.clone(),
        relay_url: state.relay_url.clone(),
    };

    let text_code =
        pairing::generate_pairing_code(&payload).map_err(|e| format!("Pairing failed: {}", e))?;

    let qr_png =
        pairing::generate_qr_png(&text_code).map_err(|e| format!("QR generation failed: {}", e))?;
    let qr_b64 = BASE64.encode(&qr_png);

    Ok(PairingOffer {
        text_code,
        qr_code_png: qr_b64,
    })
}

#[tauri::command]
pub fn complete_pairing(db: State<Database>, code: String) -> Result<SyncStatus, String> {
    let payload =
        pairing::parse_pairing_code(&code).map_err(|e| format!("Invalid pairing code: {}", e))?;

    // Validate key is valid
    crypto::decode_sync_key(&payload.sync_key)
        .map_err(|_| "Invalid sync key in pairing code".to_string())?;

    let mut state = sync::ensure_sync_state(&db)?;
    state.sync_key = Some(payload.sync_key);
    state.relay_url = payload.relay_url;
    sync::save_sync_state(&db, &state)?;

    Ok(SyncStatus {
        paired: true,
        device_id: state.device_id,
        device_name: state.device_name,
        last_synced_at: state.last_synced_at,
    })
}

#[tauri::command]
pub async fn sync_push(db: State<'_, Database>) -> Result<SyncResult, String> {
    let state = sync::load_sync_state(&db)?
        .ok_or("Sync not initialized")?;

    let sync_key_b64 = state.sync_key.as_deref().ok_or("Device not paired")?;
    let key = crypto::decode_sync_key(sync_key_b64)
        .map_err(|e| format!("Invalid sync key: {}", e))?;

    // Create snapshot and check for changes
    let data = snapshot::create_snapshot(&db)?;
    let hash = hex::encode(sha2::Sha256::digest(&data));

    if state.last_snapshot_hash.as_deref() == Some(&hash) {
        return Ok(SyncResult {
            action: "up_to_date".to_string(),
            timestamp: state.last_synced_at,
        });
    }

    // Encrypt and push
    let blob =
        crypto::encrypt_snapshot(&data, &key).map_err(|e| format!("Encryption failed: {}", e))?;

    let client = relay::RelayClient::new(
        &state.relay_url,
        &state.device_id,
        sync_key_b64.as_bytes(),
    );
    client
        .push(&blob)
        .await
        .map_err(|e| format!("Push failed: {}", e))?;

    // Update state
    let now = chrono::Utc::now().to_rfc3339();
    let mut updated = state;
    updated.last_synced_at = Some(now.clone());
    updated.last_snapshot_hash = Some(hash);
    sync::save_sync_state(&db, &updated)?;

    Ok(SyncResult {
        action: "pushed".to_string(),
        timestamp: Some(now),
    })
}

#[tauri::command]
pub async fn sync_pull(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
) -> Result<SyncResult, String> {
    let state = sync::load_sync_state(&db)?
        .ok_or("Sync not initialized")?;

    let sync_key_b64 = state.sync_key.as_deref().ok_or("Device not paired")?;
    let key = crypto::decode_sync_key(sync_key_b64)
        .map_err(|e| format!("Invalid sync key: {}", e))?;

    let client = relay::RelayClient::new(
        &state.relay_url,
        &state.device_id,
        sync_key_b64.as_bytes(),
    );

    // Check remote metadata
    let meta = client
        .get_meta()
        .await
        .map_err(|e| format!("Failed to check relay: {}", e))?;

    let meta = match meta {
        Some(m) => m,
        None => {
            return Ok(SyncResult {
                action: "up_to_date".to_string(),
                timestamp: state.last_synced_at,
            });
        }
    };

    // Check if remote is newer
    let local_ts = state
        .last_synced_at
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp() as u64)
        .unwrap_or(0);

    if meta.timestamp <= local_ts {
        return Ok(SyncResult {
            action: "up_to_date".to_string(),
            timestamp: state.last_synced_at,
        });
    }

    // Check for local changes (conflict detection)
    let local_hash = snapshot::compute_db_hash(&db)?;
    if state.last_snapshot_hash.is_some()
        && state.last_snapshot_hash.as_deref() != Some(&local_hash)
    {
        // Local changes exist AND remote has newer data → conflict
        return Ok(SyncResult {
            action: "conflict".to_string(),
            timestamp: Some(
                chrono::DateTime::from_timestamp(meta.timestamp as i64, 0)
                    .unwrap_or_default()
                    .to_rfc3339(),
            ),
        });
    }

    // Download and restore
    let blob = client
        .pull()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let (snapshot_data, _ts) =
        crypto::decrypt_snapshot(&blob, &key).map_err(|e| format!("Decryption failed: {}", e))?;

    // Restore database
    snapshot::restore_snapshot(&db, &snapshot_data)?;

    // Re-insert sync state (restore may have overwritten it)
    let now = chrono::Utc::now().to_rfc3339();
    let new_hash = snapshot::compute_db_hash(&db)?;
    let mut restored_state = state;
    restored_state.last_synced_at = Some(now.clone());
    restored_state.last_snapshot_hash = Some(new_hash);
    sync::save_sync_state(&db, &restored_state)?;

    let _ = app_handle.emit("sync:restored", ());

    Ok(SyncResult {
        action: "pulled".to_string(),
        timestamp: Some(now),
    })
}

#[tauri::command]
pub fn unpair_device(db: State<Database>) -> Result<(), String> {
    let mut state = sync::ensure_sync_state(&db)?;
    state.sync_key = None;
    state.last_synced_at = None;
    state.last_snapshot_hash = None;
    sync::save_sync_state(&db, &state)
}

#[tauri::command]
pub async fn resolve_conflict(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    choice: String,
) -> Result<SyncResult, String> {
    match choice.as_str() {
        "keep_remote" => {
            // Force pull, ignoring local changes
            let state = sync::load_sync_state(&db)?
                .ok_or("Sync not initialized")?;
            let sync_key_b64 = state.sync_key.as_deref().ok_or("Not paired")?;
            let key = crypto::decode_sync_key(sync_key_b64)
                .map_err(|e| format!("Invalid key: {}", e))?;
            let client = relay::RelayClient::new(
                &state.relay_url,
                &state.device_id,
                sync_key_b64.as_bytes(),
            );

            let blob = client
                .pull()
                .await
                .map_err(|e| format!("Download failed: {}", e))?;
            let (data, _) = crypto::decrypt_snapshot(&blob, &key)
                .map_err(|e| format!("Decryption failed: {}", e))?;
            snapshot::restore_snapshot(&db, &data)?;

            let now = chrono::Utc::now().to_rfc3339();
            let hash = snapshot::compute_db_hash(&db)?;
            let mut updated = state;
            updated.last_synced_at = Some(now.clone());
            updated.last_snapshot_hash = Some(hash);
            sync::save_sync_state(&db, &updated)?;

            let _ = app_handle.emit("sync:restored", ());

            Ok(SyncResult {
                action: "pulled".to_string(),
                timestamp: Some(now),
            })
        }
        "keep_local" => {
            // Force push local to relay
            sync_push(db).await
        }
        "export_first" => {
            // Just signal — frontend handles the export, then calls keep_remote
            Ok(SyncResult {
                action: "conflict".to_string(),
                timestamp: None,
            })
        }
        _ => Err(format!("Unknown conflict choice: {}", choice)),
    }
}
