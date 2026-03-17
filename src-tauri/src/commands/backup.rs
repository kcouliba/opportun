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

    // Flush WAL to release any active readers, then set a busy timeout
    // so the backup retries on transient locks instead of failing immediately
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("WAL checkpoint failed: {}", e))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    // Open source database
    let src = rusqlite::Connection::open(&source_path)
        .map_err(|e| format!("Cannot open backup: {}", e))?;

    // Use SQLite backup API to copy source → current DB
    let backup = rusqlite::backup::Backup::new(&src, &mut conn)
        .map_err(|e| format!("Backup init failed: {}", e))?;
    backup
        .run_to_completion(5, std::time::Duration::from_millis(250), None)
        .map_err(|e| format!("Restore failed: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_database_accepts_valid_db() {
        // Create a temporary valid database
        let dir = std::env::temp_dir().join(format!("opportun_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");

        let db = crate::db::Database::in_memory().expect("in_memory DB");
        let conn = db.conn.lock().unwrap();
        conn.execute(
            &format!("VACUUM INTO '{}'", db_path.to_str().unwrap()),
            [],
        )
        .unwrap();
        drop(conn);

        let result = validate_database(db_path.to_str().unwrap().to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn validate_database_rejects_invalid_file() {
        let dir = std::env::temp_dir().join(format!("opportun_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("invalid.db");

        // Create an empty SQLite database (no tables)
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute_batch("CREATE TABLE dummy (id INTEGER)").unwrap();
        drop(conn);

        let result = validate_database(db_path.to_str().unwrap().to_string());
        assert!(result.is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
