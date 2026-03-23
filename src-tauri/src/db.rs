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
    include_str!("migrations/009_watch_sources.sql"),
    include_str!("migrations/010_api_settings.sql"),
    include_str!("migrations/011_discovered_lead_description.sql"),
    include_str!("migrations/012_telemetry.sql"),
    include_str!("migrations/013_watch_source_tls.sql"),
];

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("opportun.db");
        let conn = Connection::open(&db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )?;

        // Auto-backup before running new migrations
        let current_version: u32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let target_version = MIGRATIONS.len() as u32;

        if current_version > 0 && current_version < target_version {
            Self::auto_backup(&conn, &db_path, current_version);
        }

        Self::run_migrations(&conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    /// Create a timestamped backup before running migrations.
    /// Best-effort: if it fails, log and continue (don't block startup).
    fn auto_backup(conn: &Connection, db_path: &std::path::Path, from_version: u32) {
        let backup_dir = db_path.parent().unwrap_or(std::path::Path::new("."));
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_name = format!("opportun_pre_migration_v{}_{}.db", from_version, timestamp);
        let backup_path = backup_dir.join(&backup_name);

        let dest = backup_path.to_str().unwrap_or("").replace('\'', "''");
        match conn.execute(&format!("VACUUM INTO '{}'", dest), []) {
            Ok(_) => log::info!(
                "[DB] Auto-backup created before migration v{} → v{}: {}",
                from_version,
                MIGRATIONS.len(),
                backup_name
            ),
            Err(e) => log::warn!(
                "[DB] Auto-backup failed (continuing anyway): {}",
                e
            ),
        }
    }

    pub fn run_migrations(conn: &Connection) -> Result<()> {
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
        Self::run_migrations(&conn)?;
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
        Database::run_migrations(&conn).expect("second migrate should succeed");
    }
}
