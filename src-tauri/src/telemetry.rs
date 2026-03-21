use crate::db::Database;
use serde::Serialize;
use std::sync::Arc;

/// Telemetry endpoint — change this when the server is deployed.
/// If empty or unreachable, telemetry silently does nothing.
const TELEMETRY_URL: &str = "";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Heartbeat {
    id: String,
    app_version: String,
    os: String,
    leads_count: i64,
    missions_count: i64,
    ai_generations_count: i64,
    watch_sources_count: i64,
    locale: String,
}

/// Load telemetry state from DB: (enabled, telemetry_id)
fn load_telemetry_state(db: &Database) -> (bool, Option<String>) {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT telemetryEnabled, telemetryId FROM appSettings WHERE id = 'singleton'",
        [],
        |row| {
            Ok((
                row.get::<_, i64>(0).unwrap_or(0) != 0,
                row.get::<_, Option<String>>(1).unwrap_or(None),
            ))
        },
    )
    .unwrap_or((false, None))
}

/// Ensure a telemetry ID exists (generated once, persisted).
fn ensure_telemetry_id(db: &Database) -> Option<String> {
    let (enabled, existing_id) = load_telemetry_state(db);
    if !enabled {
        return None;
    }
    if let Some(id) = existing_id {
        return Some(id);
    }

    let new_id = uuid::Uuid::new_v4().to_string();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE appSettings SET telemetryId = ?1 WHERE id = 'singleton'",
        [&new_id],
    )
    .ok();
    Some(new_id)
}

/// Collect aggregate counts for the heartbeat.
fn collect_counts(db: &Database) -> (i64, i64, i64, i64) {
    let conn = db.conn.lock().unwrap();

    let leads: i64 = conn
        .query_row("SELECT COUNT(*) FROM \"Lead\"", [], |row| row.get(0))
        .unwrap_or(0);
    let missions: i64 = conn
        .query_row("SELECT COUNT(*) FROM \"Mission\"", [], |row| row.get(0))
        .unwrap_or(0);
    let ai_docs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM \"Document\" WHERE \"type\" IN ('cover_letter', 'interview_prep', 'application_message', 'lead_analysis')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let sources: i64 = conn
        .query_row("SELECT COUNT(*) FROM \"WatchSource\"", [], |row| row.get(0))
        .unwrap_or(0);

    (leads, missions, ai_docs, sources)
}

/// Send a heartbeat to the telemetry endpoint. Silently fails if disabled or unreachable.
async fn send_heartbeat(db: &Database) {
    if TELEMETRY_URL.is_empty() {
        return;
    }

    let telemetry_id = match ensure_telemetry_id(db) {
        Some(id) => id,
        None => return, // telemetry disabled
    };

    let (leads, missions, ai_docs, sources) = collect_counts(db);

    let heartbeat = Heartbeat {
        id: telemetry_id,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        leads_count: leads,
        missions_count: missions,
        ai_generations_count: ai_docs,
        watch_sources_count: sources,
        locale: String::new(), // filled by frontend if needed
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    match client.post(TELEMETRY_URL).json(&heartbeat).send().await {
        Ok(resp) => {
            log::debug!("[Telemetry] Heartbeat sent — status: {}", resp.status());
        }
        Err(e) => {
            log::debug!("[Telemetry] Heartbeat failed (silent): {}", e);
        }
    }
}

/// Start the background telemetry loop. Sends a heartbeat on startup and then weekly.
pub fn start_telemetry_loop(db: Arc<Database>) {
    tauri::async_runtime::spawn(async move {
        // Initial heartbeat after 60s (let the app settle)
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        send_heartbeat(&db).await;

        // Weekly heartbeat
        let week = std::time::Duration::from_secs(7 * 24 * 60 * 60);
        loop {
            tokio::time::sleep(week).await;
            send_heartbeat(&db).await;
        }
    });
}
