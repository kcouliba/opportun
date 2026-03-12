use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

/// Each entry is a .sql file loaded at compile time.
/// Index 0 = migration from version 0→1, index 1 = version 1→2, etc.
///
/// To add a new migration:
///   1. Create src/migrations/NNN_description.sql
///   2. Append include_str!("migrations/NNN_description.sql") below
///   3. Never modify or reorder existing entries
const MIGRATIONS: &[&str] = &[
    include_str!("migrations/001_initial_schema.sql"),
    include_str!("migrations/002_ai_settings.sql"),
    include_str!("migrations/003_profile_import_fields.sql"),
    include_str!("migrations/004_content_language.sql"),
    include_str!("migrations/005_app_settings.sql"),
    include_str!("migrations/006_ai_provider.sql"),
    include_str!("migrations/007_sync.sql"),
    include_str!("migrations/008_mcp_token.sql"),
];

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("opportun.db");
        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;",
        )?;

        Self::migrate(&conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    fn migrate(conn: &Connection) -> Result<()> {
        let current_version: u32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        for (i, migration) in MIGRATIONS.iter().enumerate() {
            let version = i as u32;
            if version >= current_version {
                conn.execute_batch(migration)?;
                conn.pragma_update(None, "user_version", version + 1)?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
impl Database {
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        Self::migrate(&conn)?;
        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_expected_tables() {
        let db = Database::in_memory().expect("in_memory DB should initialize");
        let conn = db.conn.lock().unwrap();
        let expected = ["Profile", "Lead", "Mission", "Activity", "Document"];
        for table in &expected {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "Table '{}' should exist after migrations", table);
        }
    }

    #[test]
    fn migrations_are_idempotent() {
        let db = Database::in_memory().expect("first init");
        let conn = db.conn.lock().unwrap();
        // Running migrate again should not fail
        Database::migrate(&conn).expect("second migrate should succeed");
    }
}
