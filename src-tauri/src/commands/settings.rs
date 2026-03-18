use crate::db::Database;
use rand::Rng;

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill(&mut bytes);
    hex::encode(bytes)
}

#[tauri::command]
pub fn get_api_token(db: tauri::State<'_, Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let token: Option<String> = conn
        .query_row(
            "SELECT mcpToken FROM appSettings WHERE id = 'singleton'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if let Some(t) = token {
        return Ok(t);
    }

    let new_token = generate_token();
    conn.execute(
        "UPDATE appSettings SET mcpToken = ?1 WHERE id = 'singleton'",
        [&new_token],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_token)
}

#[tauri::command]
pub fn regenerate_api_token(db: tauri::State<'_, Database>) -> Result<String, String> {
    let new_token = generate_token();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE appSettings SET mcpToken = ?1 WHERE id = 'singleton'",
        [&new_token],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_token)
}

#[tauri::command]
pub fn get_lead_sources(db: tauri::State<'_, Database>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let json: String = conn
        .query_row(
            "SELECT leadSources FROM appSettings WHERE id = 'singleton'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lead_sources(
    db: tauri::State<'_, Database>,
    sources: Vec<String>,
) -> Result<Vec<String>, String> {
    let json = serde_json::to_string(&sources).map_err(|e| e.to_string())?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE appSettings SET leadSources = ?1 WHERE id = 'singleton'",
        [&json],
    )
    .map_err(|e| e.to_string())?;
    Ok(sources)
}

#[tauri::command]
pub fn is_sync_available() -> bool {
    cfg!(feature = "sync")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSettings {
    pub enabled: bool,
    pub port: u16,
    pub host: String,
    pub token: String,
}

#[tauri::command]
pub fn get_api_settings(db: tauri::State<'_, Database>) -> Result<ApiSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Ensure token exists
    let token: Option<String> = conn
        .query_row("SELECT mcpToken FROM appSettings WHERE id = 'singleton'", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if token.is_none() {
        let new_token = generate_token();
        conn.execute("UPDATE appSettings SET mcpToken = ?1 WHERE id = 'singleton'", [&new_token])
            .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        "SELECT apiEnabled, apiPort, apiHost, mcpToken FROM appSettings WHERE id = 'singleton'",
        [],
        |row| {
            Ok(ApiSettings {
                enabled: row.get::<_, i64>(0)? != 0,
                port: row.get::<_, i64>(1)? as u16,
                host: row.get(2)?,
                token: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApiSettings {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub host: Option<String>,
}

#[tauri::command]
pub fn update_api_settings(
    db: tauri::State<'_, Database>,
    data: UpdateApiSettings,
) -> Result<ApiSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if let Some(enabled) = data.enabled {
        conn.execute(
            "UPDATE appSettings SET apiEnabled = ?1 WHERE id = 'singleton'",
            [if enabled { 1i64 } else { 0 }],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(port) = data.port {
        conn.execute(
            "UPDATE appSettings SET apiPort = ?1 WHERE id = 'singleton'",
            [port as i64],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(ref host) = data.host {
        conn.execute(
            "UPDATE appSettings SET apiHost = ?1 WHERE id = 'singleton'",
            [host],
        ).map_err(|e| e.to_string())?;
    }

    drop(conn);
    get_api_settings(db)
}
