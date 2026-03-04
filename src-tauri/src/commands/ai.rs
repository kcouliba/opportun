use crate::db::Database;
use crate::llm::{self, LlmState};
use crate::llm::provider::{LlmError, LlmRequest};
use crate::models::{
    AiSettings, AiSettingsInput, Document, InterviewPrep, Lead, LeadAnalysis,
    ParsedJobDescription, Profile,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub enabled: bool,
    pub available: bool,
    pub model_name: String,
}

#[tauri::command]
pub fn get_ai_settings(db: tauri::State<'_, Database>) -> Result<AiSettings, String> {
    Ok(llm::load_settings_from_db(&db))
}

#[tauri::command]
pub fn update_ai_settings(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    data: AiSettingsInput,
) -> Result<AiSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Build dynamic update
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(enabled) = data.enabled {
        updates.push("enabled = ?");
        params.push(Box::new(if enabled { 1i64 } else { 0i64 }));
    }
    if let Some(ref model_name) = data.model_name {
        updates.push("modelName = ?");
        params.push(Box::new(model_name.clone()));
    }
    if let Some(ref ollama_url) = data.ollama_url {
        updates.push("ollamaUrl = ?");
        params.push(Box::new(ollama_url.clone()));
    }
    if let Some(temperature) = data.temperature {
        updates.push("temperature = ?");
        params.push(Box::new(temperature));
    }
    if let Some(max_tokens) = data.max_tokens {
        updates.push("maxTokens = ?");
        params.push(Box::new(max_tokens));
    }

    if !updates.is_empty() {
        let sql = format!(
            "UPDATE aiSettings SET {} WHERE id = 'singleton'",
            updates.join(", ")
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    drop(conn);

    // Reload settings from DB and update the LlmState cache
    let new_settings = llm::load_settings_from_db(&db);

    // Update the cached settings
    if let Ok(mut settings) = llm.settings.write() {
        *settings = new_settings.clone();
    }

    Ok(new_settings)
}

#[tauri::command]
pub async fn check_ai_status(llm: tauri::State<'_, LlmState>) -> Result<AiStatus, String> {
    let (enabled, model_name) = {
        let settings = llm.settings.read().map_err(|e| e.to_string())?;
        (settings.enabled, settings.model_name.clone())
    };

    let available = if enabled {
        llm.is_available().await
    } else {
        false
    };

    Ok(AiStatus {
        enabled,
        available,
        model_name,
    })
}

#[tauri::command]
pub async fn parse_job_ai(
    llm: tauri::State<'_, LlmState>,
    text: String,
) -> Result<ParsedJobDescription, LlmError> {
    let request = LlmRequest {
        system_prompt: llm::prompts::JOB_PARSING_SYSTEM.to_string(),
        user_prompt: text,
        temperature: 0.0, // Will use settings default
        max_tokens: 0,    // Will use settings default
        json_mode: true,
    };

    let response = llm.generate(request).await?;

    let cleaned = llm::clean_json_response(&response.content)?;

    serde_json::from_str::<ParsedJobDescription>(&cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
}

fn fetch_lead_and_profile(
    db: &tauri::State<'_, Database>,
    lead_id: &str,
) -> Result<(Lead, Profile), LlmError> {
    let conn = db.conn.lock().map_err(|e| {
        LlmError::InferenceFailed(format!("DB lock failed: {}", e))
    })?;

    let lead = conn
        .query_row(
            "SELECT id, createdAt, updatedAt, source, sourceUrl, client, title, description,
                    requiredTechnologies, requiredDomains, location, remotePolicy, offeredRate,
                    estimatedRevenue, estimatedStartDate, estimatedDuration, stage, matchScore,
                    autoFiltered, notes, contactName, contactInfo, nextAction, nextActionDate, profileId
             FROM \"Lead\" WHERE id = ?",
            [lead_id],
            |row| {
                Ok(Lead {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    updated_at: row.get(2)?,
                    source: row.get(3)?,
                    source_url: row.get(4)?,
                    client: row.get(5)?,
                    title: row.get(6)?,
                    description: row.get(7)?,
                    required_technologies: row.get(8)?,
                    required_domains: row.get(9)?,
                    location: row.get(10)?,
                    remote_policy: row.get(11)?,
                    offered_rate: row.get(12)?,
                    estimated_revenue: row.get(13)?,
                    estimated_start_date: row.get(14)?,
                    estimated_duration: row.get(15)?,
                    stage: row.get(16)?,
                    match_score: row.get(17)?,
                    auto_filtered: row.get::<_, i64>(18)? != 0,
                    notes: row.get(19)?,
                    contact_name: row.get(20)?,
                    contact_info: row.get(21)?,
                    next_action: row.get(22)?,
                    next_action_date: row.get(23)?,
                    profile_id: row.get(24)?,
                })
            },
        )
        .map_err(|e| LlmError::InferenceFailed(format!("Lead not found: {}", e)))?;

    let profile = conn
        .query_row(
            "SELECT id, createdAt, updatedAt, name, title, yearsExperience, legalStructure,
                    minimumTjm, targetTjm, preferredLocations, maxCommuteDays, technologies,
                    domains, blacklistedClients, blacklistedDomains
             FROM \"Profile\" LIMIT 1",
            [],
            |row| {
                Ok(Profile {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    updated_at: row.get(2)?,
                    name: row.get(3)?,
                    title: row.get(4)?,
                    years_experience: row.get(5)?,
                    legal_structure: row.get(6)?,
                    minimum_tjm: row.get(7)?,
                    target_tjm: row.get(8)?,
                    preferred_locations: row.get(9)?,
                    max_commute_days: row.get(10)?,
                    technologies: row.get(11)?,
                    domains: row.get(12)?,
                    blacklisted_clients: row.get(13)?,
                    blacklisted_domains: row.get(14)?,
                })
            },
        )
        .map_err(|e| LlmError::InferenceFailed(format!("Profile not found: {}", e)))?;

    Ok((lead, profile))
}

fn build_user_prompt(profile: &Profile, lead: &Lead) -> String {
    let profile_text = llm::prompts::format_profile_for_prompt(profile);
    let lead_text = llm::prompts::format_lead_for_prompt(lead);
    format!(
        "## Freelancer Profile\n{}\n\n## Job Opportunity\n{}",
        profile_text, lead_text
    )
}

fn save_document(
    db: &tauri::State<'_, Database>,
    lead_id: &str,
    doc_type: &str,
    content: &str,
) -> Result<Document, LlmError> {
    let conn = db.conn.lock().map_err(|e| {
        LlmError::InferenceFailed(format!("DB lock failed: {}", e))
    })?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO \"Document\" (\"id\", \"createdAt\", \"updatedAt\", \"type\", \"content\", \"version\", \"leadId\")
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        rusqlite::params![id, now, now, doc_type, content, lead_id],
    )
    .map_err(|e| LlmError::InferenceFailed(format!("Failed to save document: {}", e)))?;

    Ok(Document {
        id,
        created_at: now.clone(),
        updated_at: now,
        doc_type: doc_type.to_string(),
        content: content.to_string(),
        version: 1,
        lead_id: lead_id.to_string(),
    })
}

fn format_interview_prep_as_markdown(prep: &InterviewPrep, client: &str, title: &str) -> String {
    let mut md = format!("# Interview Prep: {} at {}\n\n", title, client);

    md.push_str("## Opening Pitch\n\n");
    md.push_str(&prep.opening);
    md.push_str("\n\n---\n\n");

    md.push_str("## Technical Questions\n\n");
    for q in &prep.technical_questions {
        md.push_str(&format!("### Q: {}\n\n", q.question));
        md.push_str(&format!("**Suggested Answer:** {}\n\n", q.suggested_answer));
        md.push_str(&format!("**Tips:** {}\n\n", q.tips));
    }

    md.push_str("---\n\n## Behavioral Questions\n\n");
    for q in &prep.behavioral_questions {
        md.push_str(&format!("- {}\n", q));
    }

    md.push_str(&format!(
        "\n---\n\n## Rate Negotiation\n\n**Strategy:** {}\n\n",
        prep.rate_negotiation.strategy
    ));
    for point in &prep.rate_negotiation.talking_points {
        md.push_str(&format!("- {}\n", point));
    }

    md.push_str("\n---\n\n## Questions to Ask\n\n");
    for q in &prep.questions_to_ask {
        md.push_str(&format!("- **{}**\n  *Why:* {}\n", q.question, q.why));
    }

    md.push_str("\n---\n\n## Red Flags to Watch\n\n");
    for flag in &prep.red_flags {
        md.push_str(&format!("- {}\n", flag));
    }

    md.push_str(&format!(
        "\n---\n\n## Closing Advice\n\n{}\n",
        prep.closing_advice
    ));

    md
}

#[tauri::command]
pub async fn analyze_lead_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<LeadAnalysis, LlmError> {
    let (lead, profile) = fetch_lead_and_profile(&db, &lead_id)?;
    let user_prompt = build_user_prompt(&profile, &lead);

    let request = LlmRequest {
        system_prompt: llm::prompts::LEAD_ANALYSIS_SYSTEM.to_string(),
        user_prompt,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
    };

    let response = llm.generate(request).await?;
    let cleaned = llm::clean_json_response(&response.content)?;

    serde_json::from_str::<LeadAnalysis>(&cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
}

#[tauri::command]
pub async fn generate_cover_letter_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<Document, LlmError> {
    let (lead, profile) = fetch_lead_and_profile(&db, &lead_id)?;
    let user_prompt = build_user_prompt(&profile, &lead);

    let request = LlmRequest {
        system_prompt: llm::prompts::COVER_LETTER_SYSTEM.to_string(),
        user_prompt,
        temperature: 0.5,
        max_tokens: 0,
        json_mode: false,
    };

    let response = llm.generate(request).await?;
    let content = response.content.trim().to_string();

    save_document(&db, &lead_id, "cover_letter", &content)
}

#[tauri::command]
pub async fn generate_interview_prep_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<Document, LlmError> {
    let (lead, profile) = fetch_lead_and_profile(&db, &lead_id)?;
    let user_prompt = build_user_prompt(&profile, &lead);

    let request = LlmRequest {
        system_prompt: llm::prompts::INTERVIEW_PREP_SYSTEM.to_string(),
        user_prompt,
        temperature: 0.0,
        max_tokens: 4096,
        json_mode: true,
    };

    // Small local LLMs (3B-7B) with json_mode can still produce truncated or
    // malformed JSON when the structured output is large (interview prep has 7
    // nested fields). Retry once on parse failure before surfacing the error.
    let mut last_err = None;
    for _ in 0..2 {
        let response = llm.generate(request.clone()).await?;
        let cleaned = match llm::clean_json_response(&response.content) {
            Ok(c) => c,
            Err(e) => { last_err = Some(e); continue; }
        };
        match serde_json::from_str::<InterviewPrep>(&cleaned) {
            Ok(prep) => {
                let markdown = format_interview_prep_as_markdown(&prep, &lead.client, &lead.title);
                return save_document(&db, &lead_id, "interview_prep", &markdown);
            }
            Err(e) => {
                last_err = Some(LlmError::InvalidJson(format!("{}: {}", e, cleaned)));
            }
        }
    }
    Err(last_err.unwrap_or_else(|| LlmError::InferenceFailed("Interview prep generation failed".to_string())))
}

#[tauri::command]
pub async fn pull_ai_model(
    llm: tauri::State<'_, LlmState>,
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<(), LlmError> {
    llm.pull_model(app_handle, &model_name).await
}
