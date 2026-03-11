use crate::db::Database;
use sha2::{Digest, Sha256};
use std::io::Read;

/// Create a snapshot of the current database as raw bytes.
///
/// Uses VACUUM INTO to produce a consistent, self-contained copy.
pub fn create_snapshot(db: &Database) -> Result<Vec<u8>, String> {
    let conn = db.conn.lock().unwrap();
    let tmp = std::env::temp_dir().join(format!("opportun_snapshot_{}.db", uuid::Uuid::new_v4()));
    let tmp_path = tmp
        .to_str()
        .ok_or("Invalid temp path")?
        .replace('\'', "''");

    conn.execute(&format!("VACUUM INTO '{}'", tmp_path), [])
        .map_err(|e| format!("Snapshot failed: {}", e))?;
    drop(conn);

    let mut file =
        std::fs::File::open(&tmp).map_err(|e| format!("Cannot read snapshot: {}", e))?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)
        .map_err(|e| format!("Cannot read snapshot: {}", e))?;
    drop(file);
    std::fs::remove_file(&tmp).ok();

    Ok(data)
}

/// Validate that raw bytes represent a valid Opportun database.
fn validate_snapshot_bytes(data: &[u8]) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("opportun_validate_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, data).map_err(|e| format!("Cannot write temp file: {}", e))?;

    let result = (|| {
        let conn = rusqlite::Connection::open_with_flags(
            &tmp,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("Cannot open snapshot: {}", e))?;

        let expected = ["Profile", "Lead", "Mission", "Activity", "Document"];
        for table in &expected {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Validation error: {}", e))?;
            if !exists {
                return Err(format!("Invalid snapshot: missing table '{}'", table));
            }
        }
        Ok(())
    })();

    std::fs::remove_file(&tmp).ok();
    result
}

/// Restore the database from raw snapshot bytes.
///
/// Validates the snapshot, then uses the SQLite backup API to overwrite the current database.
pub fn restore_snapshot(db: &Database, data: &[u8]) -> Result<(), String> {
    validate_snapshot_bytes(data)?;

    let tmp = std::env::temp_dir().join(format!("opportun_restore_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, data).map_err(|e| format!("Cannot write temp file: {}", e))?;

    let result = (|| {
        let src = rusqlite::Connection::open(&tmp)
            .map_err(|e| format!("Cannot open snapshot: {}", e))?;
        let mut conn = db.conn.lock().unwrap();
        let backup = rusqlite::backup::Backup::new(&src, &mut conn)
            .map_err(|e| format!("Backup init failed: {}", e))?;
        backup
            .run_to_completion(5, std::time::Duration::from_millis(250), None)
            .map_err(|e| format!("Restore failed: {}", e))?;
        Ok(())
    })();

    std::fs::remove_file(&tmp).ok();
    result
}

/// Compute SHA-256 hash of the current database snapshot for change detection.
pub fn compute_db_hash(db: &Database) -> Result<String, String> {
    let data = create_snapshot(db)?;
    let hash = Sha256::digest(&data);
    Ok(hex::encode(hash))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrip() {
        let db = Database::in_memory().unwrap();
        let data = create_snapshot(&db).unwrap();
        assert!(!data.is_empty());

        // Restore into a fresh DB
        let db2 = Database::in_memory().unwrap();
        restore_snapshot(&db2, &data).unwrap();
    }

    #[test]
    fn hash_is_deterministic() {
        let db = Database::in_memory().unwrap();
        let h1 = compute_db_hash(&db).unwrap();
        let h2 = compute_db_hash(&db).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn invalid_snapshot_rejected() {
        let db = Database::in_memory().unwrap();
        let result = restore_snapshot(&db, b"not a database");
        assert!(result.is_err());
    }
}
