use super::ApiState;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};

/// Build all API routes.
pub fn router() -> Router<ApiState> {
    Router::new()
        .route("/leads", get(list_leads))
        .route("/leads", post(create_lead))
        .route("/leads/{id}", get(get_lead))
        .route("/leads/{id}", put(update_lead))
        .route("/leads/{id}", delete(delete_lead))
        .route("/leads/{id}/stage", put(update_stage))
        .route("/leads/{id}/activities", get(list_activities))
        .route("/leads/{id}/activities", post(create_activity))
        .route("/stats", get(get_stats))
        .route("/health", get(health))
}

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LeadFilters {
    pub q: Option<String>,
    pub stage: Option<String>,
    pub source: Option<String>,
    pub min_score: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLeadInput {
    pub client: String,
    pub title: String,
    pub source: String,
    pub description: Option<String>,
    pub source_url: Option<String>,
    pub location: Option<String>,
    pub remote_policy: Option<String>,
    pub offered_rate: Option<i64>,
    pub estimated_start_date: Option<String>,
    pub estimated_duration: Option<i64>,
    pub required_technologies: Option<String>,
    pub required_domains: Option<String>,
    pub contact_name: Option<String>,
    pub contact_info: Option<String>,
    pub notes: Option<String>,
    pub next_action: Option<String>,
    pub next_action_date: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLeadInput {
    pub client: Option<String>,
    pub title: Option<String>,
    pub source: Option<String>,
    pub description: Option<String>,
    pub source_url: Option<String>,
    pub location: Option<String>,
    pub remote_policy: Option<String>,
    pub offered_rate: Option<i64>,
    pub estimated_start_date: Option<String>,
    pub estimated_duration: Option<i64>,
    pub required_technologies: Option<String>,
    pub required_domains: Option<String>,
    pub contact_name: Option<String>,
    pub contact_info: Option<String>,
    pub notes: Option<String>,
    pub next_action: Option<String>,
    pub next_action_date: Option<String>,
    pub stage: Option<String>,
}

#[derive(Deserialize)]
pub struct StageInput {
    pub stage: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityInput {
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub description: Option<String>,
    pub occurred_at: Option<String>,
    pub duration: Option<i64>,
}

#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub data: T,
}

#[derive(Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub total: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadRow {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub source: String,
    pub source_url: Option<String>,
    pub stage: String,
    pub match_score: Option<i64>,
    pub offered_rate: Option<i64>,
    pub location: Option<String>,
    pub remote_policy: Option<String>,
    pub contact_name: Option<String>,
    pub contact_info: Option<String>,
    pub notes: Option<String>,
    pub next_action: Option<String>,
    pub next_action_date: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRow {
    pub id: String,
    pub created_at: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub description: Option<String>,
    pub occurred_at: String,
    pub duration: Option<i64>,
    pub lead_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsResponse {
    pub total: usize,
    pub by_stage: std::collections::HashMap<String, usize>,
    pub active_leads: usize,
    pub average_match_score: Option<i64>,
}

// ── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn list_leads(
    State(state): State<ApiState>,
    Query(filters): Query<LeadFilters>,
) -> Result<Json<PaginatedResponse<LeadRow>>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = filters.q {
        conditions.push("(\"client\" LIKE ?1 OR \"title\" LIKE ?1 OR \"description\" LIKE ?1)");
        params.push(Box::new(format!("%{}%", q)));
    }
    if let Some(ref stage) = filters.stage {
        let idx = params.len() + 1;
        conditions.push(&*Box::leak(format!("\"stage\" = ?{}", idx).into_boxed_str()));
        params.push(Box::new(stage.clone()));
    }
    if let Some(ref source) = filters.source {
        let idx = params.len() + 1;
        conditions.push(&*Box::leak(format!("\"source\" = ?{}", idx).into_boxed_str()));
        params.push(Box::new(source.clone()));
    }
    if let Some(min_score) = filters.min_score {
        let idx = params.len() + 1;
        conditions.push(&*Box::leak(format!("\"matchScore\" >= ?{}", idx).into_boxed_str()));
        params.push(Box::new(min_score));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let limit = filters.limit.unwrap_or(100).min(500);
    let offset = filters.offset.unwrap_or(0);

    let count_sql = format!("SELECT COUNT(*) FROM \"Lead\"{}", where_clause);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total: usize = conn
        .query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let sql = format!(
        "SELECT \"id\", \"createdAt\", \"updatedAt\", \"client\", \"title\", \"description\",
                \"source\", \"sourceUrl\", \"stage\", \"matchScore\", \"offeredRate\",
                \"location\", \"remotePolicy\", \"contactName\", \"contactInfo\",
                \"notes\", \"nextAction\", \"nextActionDate\"
         FROM \"Lead\"{} ORDER BY \"createdAt\" DESC LIMIT {} OFFSET {}",
        where_clause, limit, offset
    );

    let mut stmt = conn.prepare(&sql).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(LeadRow {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                client: row.get(3)?,
                title: row.get(4)?,
                description: row.get(5)?,
                source: row.get(6)?,
                source_url: row.get(7)?,
                stage: row.get(8)?,
                match_score: row.get(9)?,
                offered_rate: row.get(10)?,
                location: row.get(11)?,
                remote_policy: row.get(12)?,
                contact_name: row.get(13)?,
                contact_info: row.get(14)?,
                notes: row.get(15)?,
                next_action: row.get(16)?,
                next_action_date: row.get(17)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(PaginatedResponse { data: rows, total }))
}

async fn get_lead(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<LeadRow>>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let lead = fetch_lead_row(&conn, &id)?;
    Ok(Json(ApiResponse { data: lead }))
}

async fn create_lead(
    State(state): State<ApiState>,
    Json(input): Json<CreateLeadInput>,
) -> Result<(StatusCode, Json<ApiResponse<LeadRow>>), StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Get profile for match scoring
    let profile_id: Option<String> = conn
        .query_row("SELECT \"id\" FROM \"Profile\" LIMIT 1", [], |row| row.get(0))
        .ok();

    let profile_id = profile_id.ok_or(StatusCode::BAD_REQUEST)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Calculate match score
    let match_result = crate::matching::calculate_match_score_from_db(&conn, &profile_id, &input);
    let stage = if match_result.auto_filtered { "lost" } else { "lead" };

    conn.execute(
        "INSERT INTO \"Lead\" (\"id\", \"createdAt\", \"updatedAt\", \"source\", \"sourceUrl\",
            \"client\", \"title\", \"description\", \"requiredTechnologies\", \"requiredDomains\",
            \"location\", \"remotePolicy\", \"offeredRate\", \"estimatedStartDate\", \"estimatedDuration\",
            \"stage\", \"matchScore\", \"autoFiltered\", \"notes\", \"contactName\", \"contactInfo\",
            \"nextAction\", \"nextActionDate\", \"profileId\")
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
        rusqlite::params![
            id, now, input.source, input.source_url,
            input.client, input.title, input.description,
            input.required_technologies, input.required_domains,
            input.location, input.remote_policy, input.offered_rate,
            input.estimated_start_date, input.estimated_duration,
            stage, match_result.score, if match_result.auto_filtered { 1 } else { 0 },
            input.notes, input.contact_name, input.contact_info,
            input.next_action, input.next_action_date, profile_id,
        ],
    ).map_err(|e| {
        log::error!("[API] create_lead failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Fetch back the created lead
    let lead = conn
        .query_row(
            "SELECT \"id\", \"createdAt\", \"updatedAt\", \"client\", \"title\", \"description\",
                    \"source\", \"sourceUrl\", \"stage\", \"matchScore\", \"offeredRate\",
                    \"location\", \"remotePolicy\", \"contactName\", \"contactInfo\",
                    \"notes\", \"nextAction\", \"nextActionDate\"
             FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![id],
            |row| {
                Ok(LeadRow {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    updated_at: row.get(2)?,
                    client: row.get(3)?,
                    title: row.get(4)?,
                    description: row.get(5)?,
                    source: row.get(6)?,
                    source_url: row.get(7)?,
                    stage: row.get(8)?,
                    match_score: row.get(9)?,
                    offered_rate: row.get(10)?,
                    location: row.get(11)?,
                    remote_policy: row.get(12)?,
                    contact_name: row.get(13)?,
                    contact_info: row.get(14)?,
                    notes: row.get(15)?,
                    next_action: row.get(16)?,
                    next_action_date: row.get(17)?,
                })
            },
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(ApiResponse { data: lead })))
}

fn fetch_lead_row(conn: &std::sync::MutexGuard<rusqlite::Connection>, id: &str) -> Result<LeadRow, StatusCode> {
    conn.query_row(
        "SELECT \"id\", \"createdAt\", \"updatedAt\", \"client\", \"title\", \"description\",
                \"source\", \"sourceUrl\", \"stage\", \"matchScore\", \"offeredRate\",
                \"location\", \"remotePolicy\", \"contactName\", \"contactInfo\",
                \"notes\", \"nextAction\", \"nextActionDate\"
         FROM \"Lead\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        |row| {
            Ok(LeadRow {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                client: row.get(3)?,
                title: row.get(4)?,
                description: row.get(5)?,
                source: row.get(6)?,
                source_url: row.get(7)?,
                stage: row.get(8)?,
                match_score: row.get(9)?,
                offered_rate: row.get(10)?,
                location: row.get(11)?,
                remote_policy: row.get(12)?,
                contact_name: row.get(13)?,
                contact_info: row.get(14)?,
                notes: row.get(15)?,
                next_action: row.get(16)?,
                next_action_date: row.get(17)?,
            })
        },
    )
    .map_err(|_| StatusCode::NOT_FOUND)
}

async fn update_lead(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateLeadInput>,
) -> Result<Json<ApiResponse<LeadRow>>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let now = chrono::Utc::now().to_rfc3339();

    let mut sets = vec!["\"updatedAt\" = ?1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    macro_rules! add_field {
        ($field:expr, $col:expr) => {
            if let Some(ref val) = $field {
                let idx = params.len() + 1;
                sets.push(format!("\"{}\" = ?{}", $col, idx));
                params.push(Box::new(val.clone()));
            }
        };
    }

    add_field!(input.client, "client");
    add_field!(input.title, "title");
    add_field!(input.source, "source");
    add_field!(input.description, "description");
    add_field!(input.source_url, "sourceUrl");
    add_field!(input.location, "location");
    add_field!(input.remote_policy, "remotePolicy");
    add_field!(input.notes, "notes");
    add_field!(input.contact_name, "contactName");
    add_field!(input.contact_info, "contactInfo");
    add_field!(input.next_action, "nextAction");
    add_field!(input.next_action_date, "nextActionDate");
    add_field!(input.stage, "stage");
    add_field!(input.required_technologies, "requiredTechnologies");
    add_field!(input.required_domains, "requiredDomains");

    if let Some(val) = input.offered_rate {
        let idx = params.len() + 1;
        sets.push(format!("\"offeredRate\" = ?{}", idx));
        params.push(Box::new(val));
    }
    if let Some(val) = input.estimated_duration {
        let idx = params.len() + 1;
        sets.push(format!("\"estimatedDuration\" = ?{}", idx));
        params.push(Box::new(val));
    }
    if let Some(ref val) = input.estimated_start_date {
        let idx = params.len() + 1;
        sets.push(format!("\"estimatedStartDate\" = ?{}", idx));
        params.push(Box::new(val.clone()));
    }

    let id_idx = params.len() + 1;
    params.push(Box::new(id.clone()));

    let sql = format!(
        "UPDATE \"Lead\" SET {} WHERE \"id\" = ?{}",
        sets.join(", "),
        id_idx
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let lead = fetch_lead_row(&conn, &id)?;
    Ok(Json(ApiResponse { data: lead }))
}

async fn delete_lead(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows = conn
        .execute("DELETE FROM \"Lead\" WHERE \"id\" = ?1", rusqlite::params![id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if rows == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn update_stage(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    Json(input): Json<StageInput>,
) -> Result<Json<ApiResponse<LeadRow>>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE \"Lead\" SET \"stage\" = ?1, \"updatedAt\" = ?2 WHERE \"id\" = ?3",
        rusqlite::params![input.stage, now, id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let lead = fetch_lead_row(&conn, &id)?;
    Ok(Json(ApiResponse { data: lead }))
}

async fn list_activities(
    State(state): State<ApiState>,
    Path(lead_id): Path<String>,
) -> Result<Json<Vec<ActivityRow>>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut stmt = conn
        .prepare(
            "SELECT \"id\", \"createdAt\", \"type\", \"title\", \"description\", \"occurredAt\", \"duration\", \"leadId\"
             FROM \"Activity\" WHERE \"leadId\" = ?1 ORDER BY \"occurredAt\" DESC",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = stmt
        .query_map(rusqlite::params![lead_id], |row| {
            Ok(ActivityRow {
                id: row.get(0)?,
                created_at: row.get(1)?,
                activity_type: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                occurred_at: row.get(5)?,
                duration: row.get(6)?,
                lead_id: row.get(7)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

async fn create_activity(
    State(state): State<ApiState>,
    Path(lead_id): Path<String>,
    Json(input): Json<ActivityInput>,
) -> Result<(StatusCode, Json<ApiResponse<ActivityRow>>), StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let occurred_at = input.occurred_at.unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT INTO \"Activity\" (\"id\", \"createdAt\", \"updatedAt\", \"type\", \"title\", \"description\", \"occurredAt\", \"duration\", \"leadId\")
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, now, input.activity_type, input.title, input.description, occurred_at, input.duration, lead_id],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let activity = ActivityRow {
        id,
        created_at: now,
        activity_type: input.activity_type,
        title: input.title,
        description: input.description,
        occurred_at,
        duration: input.duration,
        lead_id,
    };

    Ok((StatusCode::CREATED, Json(ApiResponse { data: activity })))
}

async fn get_stats(
    State(state): State<ApiState>,
) -> Result<Json<StatsResponse>, StatusCode> {
    let conn = state.db.conn.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut stmt = conn
        .prepare("SELECT \"stage\", \"matchScore\" FROM \"Lead\"")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows: Vec<(String, Option<i64>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter_map(|r| r.ok())
        .collect();

    let mut by_stage = std::collections::HashMap::new();
    let mut scores = Vec::new();

    for (stage, score) in &rows {
        *by_stage.entry(stage.clone()).or_insert(0usize) += 1;
        if let Some(s) = score {
            scores.push(*s);
        }
    }

    let active = rows.iter().filter(|(s, _)| s != "won" && s != "lost").count();
    let avg = if scores.is_empty() {
        None
    } else {
        Some((scores.iter().sum::<i64>() as f64 / scores.len() as f64).round() as i64)
    };

    Ok(Json(StatsResponse {
        total: rows.len(),
        by_stage,
        active_leads: active,
        average_match_score: avg,
    }))
}

