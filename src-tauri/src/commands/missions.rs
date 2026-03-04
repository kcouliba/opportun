use crate::db::Database;
use crate::models::{Mission, MissionInput};
use tauri::State;

fn row_to_mission(row: &rusqlite::Row) -> rusqlite::Result<Mission> {
    Ok(Mission {
        id: row.get("id")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
        client: row.get("client")?,
        title: row.get("title")?,
        description: row.get("description")?,
        start_date: row.get("startDate")?,
        end_date: row.get("endDate")?,
        rate: row.get("rate")?,
        days_per_week: row.get("daysPerWeek")?,
        status: row.get("status")?,
        profile_id: row.get("profileId")?,
    })
}

#[tauri::command]
pub fn list_missions(db: State<Database>) -> Result<Vec<Mission>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM Mission ORDER BY status ASC, startDate DESC")
        .map_err(|e| e.to_string())?;
    let missions = stmt
        .query_map([], row_to_mission)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(missions)
}

#[tauri::command]
pub fn get_mission(db: State<Database>, id: String) -> Result<Mission, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM Mission WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![id], row_to_mission)
        .map_err(|e| format!("Mission not found: {}", e))
}

#[tauri::command]
pub fn create_mission(db: State<Database>, data: MissionInput) -> Result<Mission, String> {
    let conn = db.conn.lock().unwrap();

    // Get profile ID (required foreign key)
    let profile_id: String = conn
        .query_row("SELECT id FROM Profile LIMIT 1", [], |row| row.get(0))
        .map_err(|_| "No profile found. Create a profile first.".to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let days_per_week = data.days_per_week.unwrap_or(5.0);
    let status = data.status.unwrap_or_else(|| "active".to_string());

    conn.execute(
        "INSERT INTO Mission (id, createdAt, updatedAt, client, title, description, startDate, endDate, rate, daysPerWeek, status, profileId)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            id,
            now,
            now,
            data.client,
            data.title,
            data.description,
            data.start_date,
            data.end_date,
            data.rate,
            days_per_week,
            status,
            profile_id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Return the created mission
    let mut stmt = conn
        .prepare("SELECT * FROM Mission WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![id], row_to_mission)
        .map_err(|e| format!("Failed to create mission: {}", e))
}

#[tauri::command]
pub fn update_mission(
    db: State<Database>,
    id: String,
    data: MissionInput,
) -> Result<Mission, String> {
    let conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Verify mission exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM Mission WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("Mission not found: {}", id));
    }

    let days_per_week = data.days_per_week.unwrap_or(5.0);
    let status = data.status.unwrap_or_else(|| "active".to_string());

    conn.execute(
        "UPDATE Mission SET updatedAt=?1, client=?2, title=?3, description=?4, startDate=?5, endDate=?6, rate=?7, daysPerWeek=?8, status=?9 WHERE id=?10",
        rusqlite::params![
            now,
            data.client,
            data.title,
            data.description,
            data.start_date,
            data.end_date,
            data.rate,
            days_per_week,
            status,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Return the updated mission
    let mut stmt = conn
        .prepare("SELECT * FROM Mission WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![id], row_to_mission)
        .map_err(|e| format!("Failed to retrieve updated mission: {}", e))
}

#[tauri::command]
pub fn delete_mission(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let affected = conn
        .execute("DELETE FROM Mission WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Mission not found: {}", id));
    }
    Ok(())
}
