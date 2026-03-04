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
