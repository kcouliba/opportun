use crate::db::Database;
use tauri::State;

#[tauri::command]
pub fn backup_database(db: State<Database>, dest_path: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(&format!("VACUUM INTO '{}'", dest_path.replace('\'', "''")), [])
        .map_err(|e| format!("Backup failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn validate_database(path: String) -> Result<bool, String> {
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("Cannot open file: {}", e))?;

    let expected_tables = ["Profile", "Lead", "Mission", "Activity", "Document"];
    for table in &expected_tables {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![table],
                |row| row.get(0),
            )
            .map_err(|e| format!("Validation error: {}", e))?;
        if !exists {
            return Err(format!("Invalid backup: missing table '{}'", table));
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn restore_database(
    db: State<Database>,
    source_path: String,
) -> Result<(), String> {
    let mut conn = db.conn.lock().unwrap();

    // Open source database
    let src = rusqlite::Connection::open(&source_path)
        .map_err(|e| format!("Cannot open backup: {}", e))?;

    // Use SQLite backup API to copy source → current DB (no file lock issues)
    let backup = rusqlite::backup::Backup::new(&src, &mut conn)
        .map_err(|e| format!("Backup init failed: {}", e))?;
    backup
        .run_to_completion(5, std::time::Duration::from_millis(250), None)
        .map_err(|e| format!("Restore failed: {}", e))?;

    Ok(())
}
