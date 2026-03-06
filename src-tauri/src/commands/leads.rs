use crate::db::Database;
use crate::matching::{calculate_match_score, parse_json_array, LeadMatchData, ProfileMatchData};
use crate::models::{
    Activity, Document, Lead, LeadFilters, LeadInput, LeadStats, LeadWithRelations,
    PaginatedResponse, Pagination, ActionCounts, StageCounts,
};
use chrono::Utc;
use tauri::State;

/// Profile fields needed for match score calculation
struct ProfileForMatching {
    id: String,
    technologies: Option<String>,
    domains: Option<String>,
    minimum_tjm: Option<i64>,
    target_tjm: Option<i64>,
    preferred_locations: Option<String>,
    blacklisted_clients: Option<String>,
    blacklisted_domains: Option<String>,
}

fn row_to_lead(row: &rusqlite::Row) -> rusqlite::Result<Lead> {
    Ok(Lead {
        id: row.get("id")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
        source: row.get("source")?,
        source_url: row.get("sourceUrl")?,
        client: row.get("client")?,
        title: row.get("title")?,
        description: row.get("description")?,
        required_technologies: row.get("requiredTechnologies")?,
        required_domains: row.get("requiredDomains")?,
        location: row.get("location")?,
        remote_policy: row.get("remotePolicy")?,
        offered_rate: row.get("offeredRate")?,
        estimated_revenue: row.get("estimatedRevenue")?,
        estimated_start_date: row.get("estimatedStartDate")?,
        estimated_duration: row.get("estimatedDuration")?,
        stage: row.get("stage")?,
        match_score: row.get("matchScore")?,
        auto_filtered: row.get::<_, i64>("autoFiltered")? != 0,
        notes: row.get("notes")?,
        contact_name: row.get("contactName")?,
        contact_info: row.get("contactInfo")?,
        next_action: row.get("nextAction")?,
        next_action_date: row.get("nextActionDate")?,
        profile_id: row.get("profileId")?,
        content_language: row.get("contentLanguage")?,
    })
}

fn row_to_document(row: &rusqlite::Row) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get("id")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
        doc_type: row.get("type")?,
        content: row.get("content")?,
        version: row.get("version")?,
        lead_id: row.get("leadId")?,
    })
}

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

/// Check if a sort field is valid
fn is_valid_sort_field(field: &str) -> bool {
    matches!(
        field,
        "createdAt"
            | "updatedAt"
            | "matchScore"
            | "client"
            | "title"
            | "stage"
            | "offeredRate"
    )
}

/// Case-insensitive search across lead text fields
pub(crate) fn matches_search(lead: &Lead, term: &str) -> bool {
    let term_lower = term.to_lowercase();
    let fields: Vec<Option<&str>> = vec![
        Some(lead.client.as_str()),
        Some(lead.title.as_str()),
        lead.description.as_deref(),
        lead.notes.as_deref(),
        lead.contact_name.as_deref(),
        lead.contact_info.as_deref(),
    ];
    fields
        .iter()
        .any(|f| f.is_some_and(|v| v.to_lowercase().contains(&term_lower)))
}

/// Escape a value for CSV output
fn escape_csv(value: Option<&str>) -> String {
    match value {
        None => String::new(),
        Some(s) => {
            if s.contains(',') || s.contains('"') || s.contains('\n') {
                format!("\"{}\"", s.replace('"', "\"\""))
            } else {
                s.to_string()
            }
        }
    }
}

/// Parse a JSON array string into a comma-separated display string
fn json_array_to_display(json: &Option<String>) -> String {
    match json {
        Some(s) if !s.is_empty() => {
            let arr: Vec<String> = serde_json::from_str(s).unwrap_or_default();
            arr.join(", ")
        }
        _ => String::new(),
    }
}

/// Build the filtered lead query and return matching leads
pub(crate) fn query_leads_filtered(
    conn: &rusqlite::Connection,
    filters: &LeadFilters,
) -> Result<Vec<Lead>, String> {
    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref stage) = filters.stage {
        where_clauses.push(format!("\"stage\" = ?{}", params.len() + 1));
        params.push(Box::new(stage.clone()));
    }

    if let Some(min_score) = filters.min_score {
        where_clauses.push(format!("\"matchScore\" >= ?{}", params.len() + 1));
        params.push(Box::new(min_score));
    }

    if let Some(max_score) = filters.max_score {
        where_clauses.push(format!("\"matchScore\" <= ?{}", params.len() + 1));
        params.push(Box::new(max_score));
    }

    if let Some(ref client) = filters.client {
        where_clauses.push(format!("\"client\" LIKE ?{}", params.len() + 1));
        params.push(Box::new(format!("%{}%", client)));
    }

    if let Some(ref technology) = filters.technology {
        where_clauses.push(format!(
            "\"requiredTechnologies\" LIKE ?{}",
            params.len() + 1
        ));
        params.push(Box::new(format!("%{}%", technology)));
    }

    if let Some(auto_filtered) = filters.auto_filtered {
        where_clauses.push(format!("\"autoFiltered\" = ?{}", params.len() + 1));
        params.push(Box::new(if auto_filtered { 1i64 } else { 0i64 }));
    }

    if let Some(ref source) = filters.source {
        where_clauses.push(format!("\"source\" = ?{}", params.len() + 1));
        params.push(Box::new(source.clone()));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    // Sorting
    let sort_by = filters
        .sort_by
        .as_deref()
        .filter(|f| is_valid_sort_field(f))
        .unwrap_or("createdAt");
    let sort_order = filters
        .sort_order
        .as_deref()
        .filter(|o| *o == "asc" || *o == "ASC")
        .map(|_| "ASC")
        .unwrap_or("DESC");

    let sql = format!(
        "SELECT * FROM \"Lead\"{} ORDER BY \"{}\" {}",
        where_sql, sort_by, sort_order
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let leads: Vec<Lead> = stmt
        .query_map(param_refs.as_slice(), row_to_lead)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(leads)
}

#[tauri::command]
pub fn list_leads(
    db: State<Database>,
    filters: LeadFilters,
) -> Result<PaginatedResponse<Lead>, String> {
    let conn = db.conn.lock().unwrap();

    let mut leads = query_leads_filtered(&conn, &filters)?;

    // Apply full-text search filter in memory
    if let Some(ref q) = filters.q {
        leads.retain(|lead| matches_search(lead, q));
    }

    // Pagination
    let total = leads.len();
    let limit = filters.limit.unwrap_or(100);
    let offset = filters.offset.unwrap_or(0);

    let start = (offset as usize).min(total);
    let end = ((offset + limit) as usize).min(total);
    let data = leads[start..end].to_vec();

    let has_more = end < total;

    Ok(PaginatedResponse {
        data,
        pagination: Pagination {
            total,
            limit,
            offset,
            has_more,
        },
    })
}

#[tauri::command]
pub fn get_lead(db: State<Database>, id: String) -> Result<LeadWithRelations, String> {
    let conn = db.conn.lock().unwrap();

    // Fetch the lead
    let lead = conn
        .query_row(
            "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![id],
            row_to_lead,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Lead not found".to_string(),
            _ => e.to_string(),
        })?;

    // Fetch documents
    let mut doc_stmt = conn
        .prepare("SELECT * FROM \"Document\" WHERE \"leadId\" = ?1")
        .map_err(|e| e.to_string())?;
    let documents: Vec<Document> = doc_stmt
        .query_map(rusqlite::params![id], row_to_document)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Fetch activities ordered by occurredAt DESC
    let mut act_stmt = conn
        .prepare("SELECT * FROM \"Activity\" WHERE \"leadId\" = ?1 ORDER BY \"occurredAt\" DESC")
        .map_err(|e| e.to_string())?;
    let activities: Vec<Activity> = act_stmt
        .query_map(rusqlite::params![id], row_to_activity)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(LeadWithRelations {
        lead,
        documents,
        activities,
    })
}

#[tauri::command]
pub fn create_lead(db: State<Database>, data: LeadInput) -> Result<Lead, String> {
    let conn = db.conn.lock().unwrap();

    // Get profile (required)
    let profile = conn
        .query_row("SELECT * FROM \"Profile\" LIMIT 1", [], |row| {
            Ok(ProfileForMatching {
                id: row.get("id")?,
                technologies: row.get("technologies")?,
                domains: row.get("domains")?,
                minimum_tjm: row.get("minimumTJM")?,
                target_tjm: row.get("targetTJM")?,
                preferred_locations: row.get("preferredLocations")?,
                blacklisted_clients: row.get("blacklistedClients")?,
                blacklisted_domains: row.get("blacklistedDomains")?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                "No profile found. Please set up your profile first.".to_string()
            }
            _ => e.to_string(),
        })?;

    // Build match data
    let profile_match = ProfileMatchData {
        technologies: parse_json_array(&profile.technologies),
        domains: parse_json_array(&profile.domains),
        minimum_tjm: profile.minimum_tjm,
        target_tjm: profile.target_tjm,
        preferred_locations: parse_json_array(&profile.preferred_locations),
        blacklisted_clients: parse_json_array(&profile.blacklisted_clients),
        blacklisted_domains: parse_json_array(&profile.blacklisted_domains),
    };

    let lead_match = LeadMatchData {
        required_technologies: parse_json_array(&data.required_technologies),
        required_domains: parse_json_array(&data.required_domains),
        offered_rate: data.offered_rate,
        location: data.location.clone(),
        client: data.client.clone(),
    };

    let match_result = calculate_match_score(&profile_match, &lead_match);

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let auto_filtered = match_result.auto_filtered;
    let stage = if auto_filtered {
        "lost"
    } else {
        data.stage.as_deref().unwrap_or("lead")
    };

    conn.execute(
        "INSERT INTO \"Lead\" (
            \"id\", \"createdAt\", \"updatedAt\", \"source\", \"sourceUrl\",
            \"client\", \"title\", \"description\", \"requiredTechnologies\", \"requiredDomains\",
            \"location\", \"remotePolicy\", \"offeredRate\", \"estimatedRevenue\",
            \"estimatedStartDate\", \"estimatedDuration\", \"stage\", \"matchScore\", \"autoFiltered\",
            \"notes\", \"contactName\", \"contactInfo\", \"nextAction\", \"nextActionDate\", \"profileId\",
            \"contentLanguage\"
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18, ?19,
            ?20, ?21, ?22, ?23, ?24, ?25,
            ?26
        )",
        rusqlite::params![
            id,
            now,
            now,
            data.source,
            data.source_url,
            data.client,
            data.title,
            data.description,
            data.required_technologies,
            data.required_domains,
            data.location,
            data.remote_policy,
            data.offered_rate,
            data.offered_rate.and_then(|rate| {
                data.estimated_duration.map(|dur| rate * 20 * dur)
            }),
            data.estimated_start_date,
            data.estimated_duration,
            stage,
            match_result.score,
            if auto_filtered { 1i64 } else { 0i64 },
            data.notes,
            data.contact_name,
            data.contact_info,
            data.next_action,
            data.next_action_date,
            profile.id,
            data.content_language,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Fetch and return the created lead
    conn.query_row(
        "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        row_to_lead,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lead(db: State<Database>, id: String, data: LeadInput) -> Result<Lead, String> {
    let conn = db.conn.lock().unwrap();

    // Verify lead exists
    let _existing = conn
        .query_row(
            "SELECT \"id\" FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![id],
            |row| row.get::<_, String>("id"),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Lead not found".to_string(),
            _ => e.to_string(),
        })?;

    // Get profile for recalculating match score
    let profile = conn.query_row("SELECT * FROM \"Profile\" LIMIT 1", [], |row| {
        Ok(ProfileForMatching {
            id: row.get("id")?,
            technologies: row.get("technologies")?,
            domains: row.get("domains")?,
            minimum_tjm: row.get("minimumTJM")?,
            target_tjm: row.get("targetTJM")?,
            preferred_locations: row.get("preferredLocations")?,
            blacklisted_clients: row.get("blacklistedClients")?,
            blacklisted_domains: row.get("blacklistedDomains")?,
        })
    });

    let (match_score, auto_filtered) = if let Ok(p) = profile {
        let profile_match = ProfileMatchData {
            technologies: parse_json_array(&p.technologies),
            domains: parse_json_array(&p.domains),
            minimum_tjm: p.minimum_tjm,
            target_tjm: p.target_tjm,
            preferred_locations: parse_json_array(&p.preferred_locations),
            blacklisted_clients: parse_json_array(&p.blacklisted_clients),
            blacklisted_domains: parse_json_array(&p.blacklisted_domains),
        };

        let lead_match = LeadMatchData {
            required_technologies: parse_json_array(&data.required_technologies),
            required_domains: parse_json_array(&data.required_domains),
            offered_rate: data.offered_rate,
            location: data.location.clone(),
            client: data.client.clone(),
        };

        let result = calculate_match_score(&profile_match, &lead_match);
        (Some(result.score), result.auto_filtered)
    } else {
        (None, false)
    };

    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE \"Lead\" SET
            \"updatedAt\" = ?1, \"client\" = ?2, \"title\" = ?3, \"description\" = ?4,
            \"source\" = ?5, \"sourceUrl\" = ?6, \"location\" = ?7, \"remotePolicy\" = ?8,
            \"offeredRate\" = ?9, \"estimatedStartDate\" = ?10, \"estimatedDuration\" = ?11,
            \"requiredTechnologies\" = ?12, \"requiredDomains\" = ?13,
            \"contactName\" = ?14, \"contactInfo\" = ?15, \"notes\" = ?16,
            \"stage\" = ?17, \"nextAction\" = ?18, \"nextActionDate\" = ?19,
            \"matchScore\" = ?20, \"autoFiltered\" = ?21, \"contentLanguage\" = ?22
        WHERE \"id\" = ?23",
        rusqlite::params![
            now,
            data.client,
            data.title,
            data.description,
            data.source,
            data.source_url,
            data.location,
            data.remote_policy,
            data.offered_rate,
            data.estimated_start_date,
            data.estimated_duration,
            data.required_technologies,
            data.required_domains,
            data.contact_name,
            data.contact_info,
            data.notes,
            data.stage.as_deref().unwrap_or("lead"),
            data.next_action,
            data.next_action_date,
            match_score,
            if auto_filtered { 1i64 } else { 0i64 },
            data.content_language,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Fetch and return the updated lead
    conn.query_row(
        "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        row_to_lead,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_lead(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();

    let rows = conn
        .execute(
            "DELETE FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err("Lead not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_lead_stats(db: State<Database>) -> Result<LeadStats, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT * FROM \"Lead\"")
        .map_err(|e| e.to_string())?;
    let leads: Vec<Lead> = stmt
        .query_map([], row_to_lead)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut by_stage = StageCounts {
        lead: 0,
        qualified: 0,
        negotiating: 0,
        won: 0,
        lost: 0,
    };

    let mut total_match_score: i64 = 0;
    let mut match_score_count: usize = 0;
    let mut total_estimated_revenue: i64 = 0;
    let mut auto_filtered_count: usize = 0;
    let mut active_leads_count: usize = 0;
    let mut high_value_count: usize = 0;
    let mut overdue_count: usize = 0;
    let mut upcoming_count: usize = 0;

    let now = Utc::now();

    for lead in &leads {
        // Count by stage
        match lead.stage.as_str() {
            "lead" => by_stage.lead += 1,
            "qualified" => by_stage.qualified += 1,
            "negotiating" => by_stage.negotiating += 1,
            "won" => by_stage.won += 1,
            "lost" => by_stage.lost += 1,
            _ => {}
        }

        // Match score average
        if let Some(score) = lead.match_score {
            total_match_score += score;
            match_score_count += 1;
        }

        // Estimated revenue (from won or negotiating leads)
        if lead.stage == "won" || lead.stage == "negotiating" {
            if let Some(rev) = lead.estimated_revenue {
                total_estimated_revenue += rev;
            }
        }

        // Auto-filtered count
        if lead.auto_filtered {
            auto_filtered_count += 1;
        }

        // Active leads (not won or lost)
        if lead.stage != "won" && lead.stage != "lost" {
            active_leads_count += 1;
        }

        // High-value leads (score >= 70, not won/lost)
        if let Some(score) = lead.match_score {
            if score >= 70 && lead.stage != "won" && lead.stage != "lost" {
                high_value_count += 1;
            }
        }

        // Action counts
        if lead.stage != "won" && lead.stage != "lost" {
            if let Some(ref next_action_date) = lead.next_action_date {
                if let Ok(action_date) = chrono::DateTime::parse_from_rfc3339(next_action_date) {
                    if action_date < now {
                        overdue_count += 1;
                    } else {
                        upcoming_count += 1;
                    }
                } else if let Ok(action_date) =
                    chrono::NaiveDateTime::parse_from_str(next_action_date, "%Y-%m-%dT%H:%M:%S")
                {
                    let action_utc = action_date.and_utc();
                    if action_utc < now {
                        overdue_count += 1;
                    } else {
                        upcoming_count += 1;
                    }
                } else if let Ok(action_date) =
                    chrono::NaiveDate::parse_from_str(next_action_date, "%Y-%m-%d")
                {
                    let action_utc = action_date
                        .and_hms_opt(23, 59, 59)
                        .unwrap()
                        .and_utc();
                    if action_utc < now {
                        overdue_count += 1;
                    } else {
                        upcoming_count += 1;
                    }
                }
            }
        }
    }

    let average_match_score = if match_score_count > 0 {
        Some((total_match_score as f64 / match_score_count as f64).round() as i64)
    } else {
        None
    };

    Ok(LeadStats {
        total: leads.len(),
        by_stage,
        active_leads: active_leads_count,
        auto_filtered: auto_filtered_count,
        average_match_score,
        total_estimated_revenue,
        high_value_leads: high_value_count,
        actions: ActionCounts {
            overdue: overdue_count,
            upcoming: upcoming_count,
        },
    })
}

#[tauri::command]
pub fn update_lead_stage(db: State<Database>, id: String, stage: String) -> Result<Lead, String> {
    let conn = db.conn.lock().unwrap();

    let valid_stages = ["lead", "qualified", "negotiating", "won", "lost"];
    if !valid_stages.contains(&stage.as_str()) {
        return Err(format!("Invalid stage: {}", stage));
    }

    let now = Utc::now().to_rfc3339();
    let rows = conn
        .execute(
            "UPDATE \"Lead\" SET \"stage\" = ?1, \"updatedAt\" = ?2 WHERE \"id\" = ?3",
            rusqlite::params![stage, now, id],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err("Lead not found".to_string());
    }

    conn.query_row(
        "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        row_to_lead,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_leads_csv(db: State<Database>, filters: LeadFilters) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();

    let mut leads = query_leads_filtered(&conn, &filters)?;

    // Apply full-text search filter in memory
    if let Some(ref q) = filters.q {
        leads.retain(|lead| matches_search(lead, q));
    }

    // CSV headers
    let headers = vec![
        "id",
        "client",
        "title",
        "description",
        "source",
        "stage",
        "location",
        "remotePolicy",
        "offeredRate",
        "estimatedStartDate",
        "estimatedDuration",
        "matchScore",
        "contactName",
        "contactInfo",
        "notes",
        "nextAction",
        "nextActionDate",
        "requiredTechnologies",
        "requiredDomains",
        "createdAt",
    ];

    let mut csv_rows: Vec<String> = Vec::new();
    csv_rows.push(headers.join(","));

    for lead in &leads {
        let row = vec![
            escape_csv(Some(&lead.id)),
            escape_csv(Some(&lead.client)),
            escape_csv(Some(&lead.title)),
            escape_csv(lead.description.as_deref()),
            escape_csv(Some(&lead.source)),
            escape_csv(Some(&lead.stage)),
            escape_csv(lead.location.as_deref()),
            escape_csv(lead.remote_policy.as_deref()),
            escape_csv(lead.offered_rate.map(|r| r.to_string()).as_deref()),
            escape_csv(
                lead.estimated_start_date
                    .as_deref()
                    .map(|s| s.split('T').next().unwrap_or(s)),
            ),
            escape_csv(lead.estimated_duration.map(|d| d.to_string()).as_deref()),
            escape_csv(lead.match_score.map(|s| s.to_string()).as_deref()),
            escape_csv(lead.contact_name.as_deref()),
            escape_csv(lead.contact_info.as_deref()),
            escape_csv(lead.notes.as_deref()),
            escape_csv(lead.next_action.as_deref()),
            escape_csv(
                lead.next_action_date
                    .as_deref()
                    .map(|s| s.split('T').next().unwrap_or(s)),
            ),
            escape_csv(Some(&json_array_to_display(&lead.required_technologies))),
            escape_csv(Some(&json_array_to_display(&lead.required_domains))),
            escape_csv(Some(&lead.created_at)),
        ];
        csv_rows.push(row.join(","));
    }

    Ok(csv_rows.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db_with_profile_and_leads() -> Database {
        let db = Database::in_memory().expect("in_memory DB");
        let conn = db.conn.lock().unwrap();

        // Create a profile
        conn.execute(
            "INSERT INTO \"Profile\" (\"id\", \"createdAt\", \"updatedAt\", \"name\", \"technologies\", \"domains\")
             VALUES ('p1', '2024-01-01', '2024-01-01', 'Test User', '[\"React\",\"Rust\"]', '[\"Fintech\"]')",
            [],
        ).unwrap();

        // Create test leads
        let leads = vec![
            ("l1", "Acme Corp", "Frontend Developer", "lead", 85),
            ("l2", "Beta Inc", "Backend Developer", "qualified", 60),
            ("l3", "Gamma LLC", "Fullstack Engineer", "negotiating", 45),
        ];

        for (id, client, title, stage, score) in leads {
            conn.execute(
                "INSERT INTO \"Lead\" (\"id\", \"createdAt\", \"updatedAt\", \"source\", \"client\", \"title\", \"stage\", \"matchScore\", \"autoFiltered\", \"profileId\")
                 VALUES (?1, '2024-01-01', '2024-01-01', 'recruiter', ?2, ?3, ?4, ?5, 0, 'p1')",
                rusqlite::params![id, client, title, stage, score],
            ).unwrap();
        }

        drop(conn);
        db
    }

    #[test]
    fn query_leads_returns_all() {
        let db = setup_db_with_profile_and_leads();
        let conn = db.conn.lock().unwrap();
        let filters = LeadFilters::default();
        let leads = query_leads_filtered(&conn, &filters).unwrap();
        assert_eq!(leads.len(), 3);
    }

    #[test]
    fn filter_by_stage() {
        let db = setup_db_with_profile_and_leads();
        let conn = db.conn.lock().unwrap();
        let filters = LeadFilters {
            stage: Some("qualified".to_string()),
            ..Default::default()
        };
        let leads = query_leads_filtered(&conn, &filters).unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].client, "Beta Inc");
    }

    #[test]
    fn filter_by_min_score() {
        let db = setup_db_with_profile_and_leads();
        let conn = db.conn.lock().unwrap();
        let filters = LeadFilters {
            min_score: Some(70),
            ..Default::default()
        };
        let leads = query_leads_filtered(&conn, &filters).unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].client, "Acme Corp");
    }

    #[test]
    fn matches_search_finds_client_and_title() {
        let db = setup_db_with_profile_and_leads();
        let conn = db.conn.lock().unwrap();
        let filters = LeadFilters::default();
        let leads = query_leads_filtered(&conn, &filters).unwrap();

        assert!(matches_search(&leads[0], "Acme"));
        assert!(matches_search(&leads[0], "frontend"));
        assert!(!matches_search(&leads[0], "nonexistent"));
    }
}
