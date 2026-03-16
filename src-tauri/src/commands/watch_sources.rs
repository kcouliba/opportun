use crate::db::Database;
use crate::llm::LlmState;
use crate::llm::provider::LlmRequest;
use crate::matching::{calculate_match_score, parse_json_array, LeadMatchData, ProfileMatchData};
use crate::models::{
    BulkImportResult, DiscoveredLead, ExtractedListing, Lead, WatchSource, WatchSourceInput,
};
use chrono::Utc;
use tauri::State;

// ── CRUD ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_watch_sources(db: State<Database>) -> Result<Vec<WatchSource>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT \"id\", \"createdAt\", \"updatedAt\", \"name\", \"url\",
                    \"lastCheckedAt\", \"lastFoundCount\", \"profileId\"
             FROM \"WatchSource\" ORDER BY \"createdAt\" DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(WatchSource {
                id: row.get("id")?,
                created_at: row.get("createdAt")?,
                updated_at: row.get("updatedAt")?,
                name: row.get("name")?,
                url: row.get("url")?,
                last_checked_at: row.get("lastCheckedAt")?,
                last_found_count: row.get("lastFoundCount")?,
                profile_id: row.get("profileId")?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_watch_source(
    db: State<Database>,
    data: WatchSourceInput,
) -> Result<WatchSource, String> {
    let conn = db.conn.lock().unwrap();

    let profile_id: String = conn
        .query_row("SELECT \"id\" FROM \"Profile\" LIMIT 1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "No profile found. Please set up your profile first.".to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO \"WatchSource\" (\"id\", \"createdAt\", \"updatedAt\", \"name\", \"url\", \"profileId\")
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, now, now, data.name, data.url, profile_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(WatchSource {
        id,
        created_at: now.clone(),
        updated_at: now,
        name: data.name,
        url: data.url,
        last_checked_at: None,
        last_found_count: None,
        profile_id,
    })
}

#[tauri::command]
pub fn update_watch_source(
    db: State<Database>,
    id: String,
    data: WatchSourceInput,
) -> Result<WatchSource, String> {
    let conn = db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE \"WatchSource\" SET \"name\" = ?1, \"url\" = ?2, \"updatedAt\" = ?3 WHERE \"id\" = ?4",
            rusqlite::params![data.name, data.url, now, id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("Watch source not found".to_string());
    }

    conn.query_row(
        "SELECT \"id\", \"createdAt\", \"updatedAt\", \"name\", \"url\",
                \"lastCheckedAt\", \"lastFoundCount\", \"profileId\"
         FROM \"WatchSource\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        |row| {
            Ok(WatchSource {
                id: row.get("id")?,
                created_at: row.get("createdAt")?,
                updated_at: row.get("updatedAt")?,
                name: row.get("name")?,
                url: row.get("url")?,
                last_checked_at: row.get("lastCheckedAt")?,
                last_found_count: row.get("lastFoundCount")?,
                profile_id: row.get("profileId")?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_watch_source(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM \"WatchSource\" WHERE \"id\" = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Discovery ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_watch_source(
    db: State<'_, Database>,
    llm: State<'_, LlmState>,
    source_id: String,
) -> Result<Vec<DiscoveredLead>, String> {
    // 1. Get the source
    let (url, profile_id) = {
        let conn = db.conn.lock().unwrap();
        conn.query_row(
            "SELECT \"url\", \"profileId\" FROM \"WatchSource\" WHERE \"id\" = ?1",
            rusqlite::params![source_id],
            |row| Ok((row.get::<_, String>("url")?, row.get::<_, String>("profileId")?)),
        )
        .map_err(|_| "Watch source not found".to_string())?
    };

    // 2. Fetch page text
    let page_text = super::import::fetch_url_text_inner(&url).await?;

    // Truncate to ~12k chars to fit context
    let truncated = if page_text.len() > 12000 {
        &page_text[..12000]
    } else {
        &page_text
    };

    // 3. AI extraction
    let tier = {
        let settings = llm.settings.read().unwrap();
        crate::llm::tier::ModelTier::detect(&settings.provider, &settings.model_name)
    };

    let gbnf_grammar = if tier.is_basic() {
        #[cfg(feature = "embedded-llm")]
        { Some(crate::llm::grammars::JOB_BOARD_EXTRACT.to_string()) }
        #[cfg(not(feature = "embedded-llm"))]
        { None }
    } else {
        None
    };

    let request = LlmRequest {
        system_prompt: crate::llm::prompts::JOB_BOARD_EXTRACT_SYSTEM.to_string(),
        user_prompt: truncated.to_string(),
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar,
    };

    let response = llm
        .generate(request)
        .await
        .map_err(|e| format!("AI extraction failed: {e}"))?;

    let cleaned = crate::llm::clean_json_response(&response.content)
        .map_err(|e| format!("Failed to parse AI response: {e}"))?;

    let listings: Vec<ExtractedListing> =
        serde_json::from_str(&cleaned).map_err(|e| format!("Invalid JSON from AI: {e}"))?;

    // 4. Deduplicate and insert
    let conn = db.conn.lock().unwrap();

    // Collect existing listing URLs for this source
    let mut existing_urls: std::collections::HashSet<String> = std::collections::HashSet::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT \"listingUrl\" FROM \"DiscoveredLead\" WHERE \"sourceId\" = ?1 AND \"listingUrl\" IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![source_id], |row| {
                row.get::<_, String>("listingUrl")
            })
            .map_err(|e| e.to_string())?;
        for u in rows.flatten() {
            existing_urls.insert(u);
        }
    }

    // Also check existing Lead sourceUrls to avoid rediscovering imported leads
    {
        let mut stmt = conn
            .prepare(
                "SELECT \"sourceUrl\" FROM \"Lead\" WHERE \"profileId\" = ?1 AND \"sourceUrl\" IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![profile_id], |row| {
                row.get::<_, String>("sourceUrl")
            })
            .map_err(|e| e.to_string())?;
        for u in rows.flatten() {
            existing_urls.insert(u);
        }
    }

    let now = Utc::now().to_rfc3339();
    let mut new_leads = Vec::new();

    for listing in &listings {
        // Skip if URL already known
        if let Some(ref u) = listing.url {
            if existing_urls.contains(u) {
                continue;
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let title = listing.title.clone().unwrap_or_else(|| "Unknown".to_string());

        conn.execute(
            "INSERT INTO \"DiscoveredLead\" (\"id\", \"createdAt\", \"sourceId\", \"title\", \"client\", \"location\", \"rate\", \"snippet\", \"listingUrl\", \"status\")
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new')",
            rusqlite::params![
                id, now, source_id, title, listing.client, listing.location,
                listing.rate, listing.snippet, listing.url,
            ],
        )
        .map_err(|e| e.to_string())?;

        new_leads.push(DiscoveredLead {
            id,
            created_at: now.clone(),
            source_id: source_id.clone(),
            title,
            client: listing.client.clone(),
            location: listing.location.clone(),
            rate: listing.rate,
            snippet: listing.snippet.clone(),
            listing_url: listing.url.clone(),
            status: "new".to_string(),
            imported_lead_id: None,
        });
    }

    // Update source metadata
    conn.execute(
        "UPDATE \"WatchSource\" SET \"lastCheckedAt\" = ?1, \"lastFoundCount\" = ?2, \"updatedAt\" = ?1 WHERE \"id\" = ?3",
        rusqlite::params![now, new_leads.len() as i64, source_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(new_leads)
}

// ── Review ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_discovered_leads(
    db: State<Database>,
    source_id: Option<String>,
    status: Option<String>,
) -> Result<Vec<DiscoveredLead>, String> {
    let conn = db.conn.lock().unwrap();

    let mut sql = String::from(
        "SELECT \"id\", \"createdAt\", \"sourceId\", \"title\", \"client\", \"location\",
                \"rate\", \"snippet\", \"listingUrl\", \"status\", \"importedLeadId\"
         FROM \"DiscoveredLead\" WHERE 1=1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref sid) = source_id {
        params.push(Box::new(sid.clone()));
        sql.push_str(&format!(" AND \"sourceId\" = ?{}", params.len()));
    }
    if let Some(ref s) = status {
        params.push(Box::new(s.clone()));
        sql.push_str(&format!(" AND \"status\" = ?{}", params.len()));
    }

    sql.push_str(" ORDER BY \"createdAt\" DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(DiscoveredLead {
                id: row.get("id")?,
                created_at: row.get("createdAt")?,
                source_id: row.get("sourceId")?,
                title: row.get("title")?,
                client: row.get("client")?,
                location: row.get("location")?,
                rate: row.get("rate")?,
                snippet: row.get("snippet")?,
                listing_url: row.get("listingUrl")?,
                status: row.get("status")?,
                imported_lead_id: row.get("importedLeadId")?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dismiss_discovered_leads(db: State<Database>, ids: Vec<String>) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    for id in &ids {
        conn.execute(
            "UPDATE \"DiscoveredLead\" SET \"status\" = 'dismissed' WHERE \"id\" = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn count_new_discovered_leads(db: State<Database>) -> Result<i64, String> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM \"DiscoveredLead\" WHERE \"status\" = 'new'",
        [],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// ── Import ──────────────────────────────────────────────────────────────────

/// Profile fields needed for match score calculation (mirrors leads.rs)
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

#[tauri::command]
pub async fn import_discovered_lead(
    db: State<'_, Database>,
    llm: State<'_, LlmState>,
    discovered_id: String,
    use_ai: bool,
) -> Result<Lead, String> {
    // 1. Get the discovered lead
    let discovered = {
        let conn = db.conn.lock().unwrap();
        conn.query_row(
            "SELECT \"id\", \"createdAt\", \"sourceId\", \"title\", \"client\", \"location\",
                    \"rate\", \"snippet\", \"listingUrl\", \"status\", \"importedLeadId\"
             FROM \"DiscoveredLead\" WHERE \"id\" = ?1",
            rusqlite::params![discovered_id],
            |row| {
                Ok(DiscoveredLead {
                    id: row.get("id")?,
                    created_at: row.get("createdAt")?,
                    source_id: row.get("sourceId")?,
                    title: row.get("title")?,
                    client: row.get("client")?,
                    location: row.get("location")?,
                    rate: row.get("rate")?,
                    snippet: row.get("snippet")?,
                    listing_url: row.get("listingUrl")?,
                    status: row.get("status")?,
                    imported_lead_id: row.get("importedLeadId")?,
                })
            },
        )
        .map_err(|_| "Discovered lead not found".to_string())?
    };

    // 2. Get full description: fetch listing URL if available, else use snippet
    let mut description = discovered.snippet.clone();
    let mut parsed_title = discovered.title.clone();
    let mut parsed_client = discovered.client.clone();
    let mut parsed_location = discovered.location.clone();
    let mut parsed_rate = discovered.rate;
    let mut parsed_technologies: Option<String> = None;
    let mut parsed_domains: Option<String> = None;
    let mut parsed_remote_policy: Option<String> = None;
    let mut parsed_contact_name: Option<String> = None;
    let mut parsed_contact_info: Option<String> = None;
    let source_url = discovered.listing_url.clone();

    if let Some(ref listing_url) = discovered.listing_url {
        if let Ok(page_text) = super::import::fetch_url_text_inner(listing_url).await {
            if use_ai {
                // Parse with AI for full extraction
                let request = LlmRequest {
                    system_prompt: crate::llm::prompts::JOB_PARSING_SYSTEM.to_string(),
                    user_prompt: page_text.clone(),
                    temperature: 0.0,
                    max_tokens: 0,
                    json_mode: true,
                    gbnf_grammar: None,
                };

                if let Ok(response) = llm.generate(request).await {
                    if let Ok(cleaned) = crate::llm::clean_json_response(&response.content) {
                        if let Ok(parsed) =
                            serde_json::from_str::<crate::models::ParsedJobDescription>(&cleaned)
                        {
                            if let Some(t) = parsed.title {
                                parsed_title = t;
                            }
                            if let Some(c) = parsed.client {
                                parsed_client = Some(c);
                            }
                            if let Some(l) = parsed.location {
                                parsed_location = Some(l);
                            }
                            if parsed.rate.is_some() {
                                parsed_rate = parsed.rate;
                            }
                            if let Some(ref d) = parsed.description {
                                description = Some(d.clone());
                            }
                            if let Some(ref techs) = parsed.technologies {
                                if !techs.is_empty() {
                                    parsed_technologies =
                                        Some(serde_json::to_string(techs).unwrap_or_default());
                                }
                            }
                            if let Some(ref doms) = parsed.domains {
                                if !doms.is_empty() {
                                    parsed_domains =
                                        Some(serde_json::to_string(doms).unwrap_or_default());
                                }
                            }
                            parsed_remote_policy = parsed.remote_policy;
                            parsed_contact_name = parsed.contact_name;
                            parsed_contact_info = parsed.contact_info;
                        }
                    }
                }
            } else {
                // Use the fetched text as description
                description = Some(if page_text.len() > 2000 {
                    page_text[..2000].to_string()
                } else {
                    page_text
                });
            }
        }
    }

    // 3. Create the lead (same logic as leads.rs create_lead)
    let conn = db.conn.lock().unwrap();

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
        .map_err(|_| "No profile found.".to_string())?;

    let profile_match = ProfileMatchData {
        technologies: parse_json_array(&profile.technologies),
        domains: parse_json_array(&profile.domains),
        minimum_tjm: profile.minimum_tjm,
        target_tjm: profile.target_tjm,
        preferred_locations: parse_json_array(&profile.preferred_locations),
        blacklisted_clients: parse_json_array(&profile.blacklisted_clients),
        blacklisted_domains: parse_json_array(&profile.blacklisted_domains),
    };

    let client_name = parsed_client.unwrap_or_else(|| "Unknown".to_string());

    let lead_match = LeadMatchData {
        required_technologies: parse_json_array(&parsed_technologies),
        required_domains: parse_json_array(&parsed_domains),
        offered_rate: parsed_rate,
        location: parsed_location.clone(),
        client: client_name.clone(),
    };

    let match_result = calculate_match_score(&profile_match, &lead_match);
    let lead_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let auto_filtered = match_result.auto_filtered;
    let stage = if auto_filtered { "lost" } else { "lead" };

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
            lead_id, now, now,
            "watch-source", source_url,
            client_name, parsed_title, description,
            parsed_technologies, parsed_domains,
            parsed_location, parsed_remote_policy, parsed_rate,
            Option::<i64>::None,  // estimated_revenue
            Option::<String>::None,  // estimated_start_date
            Option::<i64>::None,  // estimated_duration
            stage, match_result.score,
            if auto_filtered { 1i64 } else { 0i64 },
            Option::<String>::None,  // notes
            parsed_contact_name, parsed_contact_info,
            Some("Review listing"), Option::<String>::None,
            profile.id,
            Option::<String>::None,  // content_language
        ],
    )
    .map_err(|e| e.to_string())?;

    // 4. Update discovered lead status
    conn.execute(
        "UPDATE \"DiscoveredLead\" SET \"status\" = 'imported', \"importedLeadId\" = ?1 WHERE \"id\" = ?2",
        rusqlite::params![lead_id, discovered_id],
    )
    .map_err(|e| e.to_string())?;

    // 5. Return the created lead
    conn.query_row(
        "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
        rusqlite::params![lead_id],
        |row| {
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
                auto_filtered: row.get::<_, i64>("autoFiltered").map(|v| v != 0).unwrap_or(false),
                notes: row.get("notes")?,
                contact_name: row.get("contactName")?,
                contact_info: row.get("contactInfo")?,
                next_action: row.get("nextAction")?,
                next_action_date: row.get("nextActionDate")?,
                profile_id: row.get("profileId")?,
                content_language: row.get("contentLanguage")?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_import_discovered_leads(
    db: State<'_, Database>,
    llm: State<'_, LlmState>,
    ids: Vec<String>,
    use_ai: bool,
) -> Result<BulkImportResult, String> {
    let mut imported = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();

    for id in ids {
        match import_discovered_lead(db.clone(), llm.clone(), id.clone(), use_ai).await {
            Ok(_) => imported += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!("{}: {}", id, e));
            }
        }
    }

    Ok(BulkImportResult {
        imported,
        failed,
        errors,
    })
}
