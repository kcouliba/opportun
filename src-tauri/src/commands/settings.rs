use crate::db::Database;
use rand::Rng;

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill(&mut bytes);
    hex::encode(bytes)
}

#[tauri::command]
pub fn get_mcp_token(db: tauri::State<'_, Database>) -> Result<String, String> {
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
pub fn regenerate_mcp_token(db: tauri::State<'_, Database>) -> Result<String, String> {
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
