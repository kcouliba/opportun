use crate::db::Database;
use crate::models::{
    Activity, ActivityFilters, ActivityInput, ActivityWithLead, LeadSummary, PaginatedResponse,
    Pagination,
};
use tauri::State;

const VALID_ACTIVITY_TYPES: &[&str] = &[
    "call",
    "email",
    "meeting",
    "interview",
    "follow_up",
    "note",
    "other",
];

fn row_to_activity(row: &rusqlite::Row) -> rusqlite::Result<Activity> {
    Ok(Activity {
        id: row.get("id")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
        activity_type: row.get("type")?,
        title: row.get("title")?,
        description: row.get("description")?,
        occurred_at: row.get("occurredAt")?,
        duration: row.get("duration")?,
        lead_id: row.get("leadId")?,
    })
}

#[tauri::command]
pub fn list_activities(
    db: State<Database>,
    filters: Option<ActivityFilters>,
) -> Result<PaginatedResponse<ActivityWithLead>, String> {
    let conn = db.conn.lock().unwrap();
    let filters = filters.unwrap_or_default();

    let limit = filters.limit.unwrap_or(50);
    let offset = filters.offset.unwrap_or(0);

    // Build WHERE clauses
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref activity_type) = filters.activity_type {
        conditions.push(format!("a.\"type\" = ?{}", param_idx));
        params.push(Box::new(activity_type.clone()));
        param_idx += 1;
    }

    if let Some(ref from) = filters.from {
        conditions.push(format!("a.occurredAt >= ?{}", param_idx));
        params.push(Box::new(from.clone()));
        param_idx += 1;
    }

    if let Some(ref to) = filters.to {
        conditions.push(format!("a.occurredAt <= ?{}", param_idx));
        params.push(Box::new(to.clone()));
        param_idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Count total
    let count_sql = format!(
        "SELECT COUNT(*) FROM Activity a JOIN Lead l ON a.leadId = l.id {}",
        where_clause
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total: usize = conn
        .query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Fetch data with pagination
    let data_sql = format!(
        "SELECT a.id, a.createdAt, a.updatedAt, a.\"type\", a.title, a.description, a.occurredAt, a.duration, a.leadId,
                l.id as lead_id_ref, l.client as lead_client, l.title as lead_title
         FROM Activity a JOIN Lead l ON a.leadId = l.id
         {} ORDER BY a.occurredAt DESC LIMIT ?{} OFFSET ?{}",
        where_clause, param_idx, param_idx + 1
    );

    // Rebuild filter params for the data query (adding limit/offset)
    let mut data_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref activity_type) = filters.activity_type {
        data_params.push(Box::new(activity_type.clone()));
    }
    if let Some(ref from) = filters.from {
        data_params.push(Box::new(from.clone()));
    }
    if let Some(ref to) = filters.to {
        data_params.push(Box::new(to.clone()));
    }
    data_params.push(Box::new(limit));
    data_params.push(Box::new(offset));

    let data_param_refs: Vec<&dyn rusqlite::types::ToSql> =
        data_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&data_sql).map_err(|e| e.to_string())?;
    let activities = stmt
        .query_map(data_param_refs.as_slice(), |row| {
            Ok(ActivityWithLead {
                activity: Activity {
                    id: row.get("id")?,
                    created_at: row.get("createdAt")?,
                    updated_at: row.get("updatedAt")?,
                    activity_type: row.get("type")?,
                    title: row.get("title")?,
                    description: row.get("description")?,
                    occurred_at: row.get("occurredAt")?,
                    duration: row.get("duration")?,
                    lead_id: row.get("leadId")?,
                },
                lead: LeadSummary {
                    id: row.get("lead_id_ref")?,
                    client: row.get("lead_client")?,
                    title: row.get("lead_title")?,
                },
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(PaginatedResponse {
        data: activities,
        pagination: Pagination {
            total,
            limit,
            offset,
            has_more: (offset + limit) < total as i64,
        },
    })
}

#[tauri::command]
pub fn list_lead_activities(db: State<Database>, lead_id: String) -> Result<Vec<Activity>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM Activity WHERE leadId = ?1 ORDER BY occurredAt DESC")
        .map_err(|e| e.to_string())?;
    let activities = stmt
        .query_map(rusqlite::params![lead_id], |row| row_to_activity(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(activities)
}

#[tauri::command]
pub fn create_activity(
    db: State<Database>,
    lead_id: String,
    data: ActivityInput,
) -> Result<Activity, String> {
    let conn = db.conn.lock().unwrap();

    // Verify lead exists
    let lead_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM Lead WHERE id = ?1",
            rusqlite::params![lead_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| e.to_string())?;

    if !lead_exists {
        return Err(format!("Lead not found: {}", lead_id));
    }

    // Validate activity type
    if !VALID_ACTIVITY_TYPES.contains(&data.activity_type.as_str()) {
        return Err(format!(
            "Invalid activity type: '{}'. Valid types: {}",
            data.activity_type,
            VALID_ACTIVITY_TYPES.join(", ")
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let occurred_at = data.occurred_at.unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT INTO Activity (id, createdAt, updatedAt, \"type\", title, description, occurredAt, duration, leadId)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            id,
            now,
            now,
            data.activity_type,
            data.title,
            data.description,
            occurred_at,
            data.duration,
            lead_id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Return the created activity
    let mut stmt = conn
        .prepare("SELECT * FROM Activity WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![id], |row| row_to_activity(row))
        .map_err(|e| format!("Failed to create activity: {}", e))
}

#[tauri::command]
pub fn update_activity(
    db: State<Database>,
    id: String,
    data: ActivityInput,
) -> Result<Activity, String> {
    let conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Verify activity exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM Activity WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("Activity not found: {}", id));
    }

    // Validate activity type
    if !VALID_ACTIVITY_TYPES.contains(&data.activity_type.as_str()) {
        return Err(format!(
            "Invalid activity type: '{}'. Valid types: {}",
            data.activity_type,
            VALID_ACTIVITY_TYPES.join(", ")
        ));
    }

    let occurred_at = data.occurred_at.unwrap_or_else(|| now.clone());

    conn.execute(
        "UPDATE Activity SET updatedAt=?1, \"type\"=?2, title=?3, description=?4, occurredAt=?5, duration=?6 WHERE id=?7",
        rusqlite::params![
            now,
            data.activity_type,
            data.title,
            data.description,
            occurred_at,
            data.duration,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Return the updated activity
    let mut stmt = conn
        .prepare("SELECT * FROM Activity WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![id], |row| row_to_activity(row))
        .map_err(|e| format!("Failed to retrieve updated activity: {}", e))
}

#[tauri::command]
pub fn delete_activity(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let affected = conn
        .execute("DELETE FROM Activity WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Activity not found: {}", id));
    }
    Ok(())
}
