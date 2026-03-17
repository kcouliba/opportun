use crate::db::Database;
use std::collections::HashSet;
use tauri::State;

#[tauri::command]
pub fn backup_database(db: State<Database>, dest_path: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")
        .map_err(|e| format!("WAL checkpoint failed: {}", e))?;
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
    let conn = db.conn.lock().unwrap();

    // Set busy timeout so SQLite retries on transient WAL locks
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    // Read the source file into memory and write it via SQL
    // This avoids backup API lock issues by working within the existing connection
    let src_data = std::fs::read(&source_path)
        .map_err(|e| format!("Cannot read backup file: {}", e))?;

    // Write to a temp file, then use VACUUM INTO in reverse:
    // open source as a separate connection, use backup API from it
    let tmp = std::env::temp_dir().join(format!("opportun_restore_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, &src_data)
        .map_err(|e| format!("Cannot write temp file: {}", e))?;

    let result = (|| {
        let _src = rusqlite::Connection::open(&tmp)
            .map_err(|e| format!("Cannot open backup: {}", e))?;

        // Attach source DB and copy tables via SQL
        let tmp_escaped = tmp.to_str().unwrap_or("").replace('\'', "''");
        conn.execute_batch("DETACH DATABASE IF EXISTS restore_src;").ok();
        conn.execute_batch(&format!(
            "ATTACH DATABASE '{}' AS restore_src;", tmp_escaped
        )).map_err(|e| format!("Attach failed: {}", e))?;

        // Helper to query a list of strings from a SQL statement
        fn query_strings(conn: &rusqlite::Connection, sql: &str, col: usize) -> Result<HashSet<String>, String> {
            let mut stmt = conn.prepare(sql).map_err(|e| format!("Prepare failed: {}", e))?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(col))
                .map_err(|e| format!("Query failed: {}", e))?;
            let result: HashSet<String> = rows.filter_map(|r| r.ok()).collect();
            Ok(result)
        }

        // Get tables that exist in BOTH source and destination
        let src_tables = query_strings(&conn,
            "SELECT name FROM restore_src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", 0)?;
        let dest_tables = query_strings(&conn,
            "SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", 0)?;

        let common_tables: Vec<&String> = src_tables.intersection(&dest_tables).collect();

        // For each common table, find shared columns and copy data
        for table in &common_tables {
            let src_cols = query_strings(&conn,
                &format!("PRAGMA restore_src.table_info(\"{}\")", table), 1)?;
            let dest_cols = query_strings(&conn,
                &format!("PRAGMA main.table_info(\"{}\")", table), 1)?;

            // Only copy columns that exist in both
            let shared_cols: Vec<&String> = src_cols.intersection(&dest_cols).collect();
            if shared_cols.is_empty() {
                continue;
            }

            let col_list = shared_cols.iter()
                .map(|c| format!("\"{}\"", c))
                .collect::<Vec<_>>()
                .join(", ");

            conn.execute(&format!("DELETE FROM main.\"{}\"", table), [])
                .map_err(|e| format!("Failed to clear table '{}': {}", table, e))?;
            conn.execute_batch(&format!(
                "INSERT INTO main.\"{}\" ({}) SELECT {} FROM restore_src.\"{}\"",
                table, col_list, col_list, table
            )).map_err(|e| format!("Failed to copy table '{}': {}", table, e))?;

            log::info!("[Restore] Copied table '{}' ({} columns)", table, shared_cols.len());
        }

        conn.execute_batch("DETACH DATABASE restore_src;")
            .map_err(|e| format!("Detach failed: {}", e))?;

        // Re-create singleton rows that may be missing from older backups
        conn.execute_batch(
            "INSERT OR IGNORE INTO aiSettings (id) VALUES ('singleton');
             INSERT OR IGNORE INTO appSettings (id) VALUES ('singleton');"
        ).map_err(|e| format!("Failed to restore singleton rows: {}", e))?;

        // Re-run migrations to bring schema up to date
        // (adds any columns/tables the backup didn't have)
        crate::db::Database::run_migrations(&conn)
            .map_err(|e| format!("Post-restore migration failed: {}", e))?;

        log::info!("[Restore] Complete — {} tables restored", common_tables.len());

        Ok(())
    })();

    std::fs::remove_file(&tmp).ok();
    result
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
