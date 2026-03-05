use crate::db::Database;

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
