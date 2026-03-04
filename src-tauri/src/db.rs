use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("opportun.db");
        let conn = Connection::open(db_path)?;

        // Enable WAL mode and foreign keys
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;",
        )?;

        // Create tables
        conn.execute_batch(include_str!("schema.sql"))?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}
