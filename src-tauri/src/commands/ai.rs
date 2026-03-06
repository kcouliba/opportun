use crate::db::Database;
use crate::llm::{self, LlmState};
use crate::llm::provider::{LlmError, LlmRequest};
use crate::models::{
    Activity, ActivityInsight, AiSettings, AiSettingsInput, Document, InterviewPrep,
    Lead, LeadAnalysis, Mission, ParsedJobDescription, Profile,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub enabled: bool,
    pub available: bool,
    pub model_available: bool,
    pub model_name: String,
    pub local_models: Vec<String>,
}

#[tauri::command]
pub fn get_ai_settings(db: tauri::State<'_, Database>) -> Result<AiSettings, String> {
    log::info!("[AI] get_ai_settings called");
    let settings = llm::load_settings_from_db(&db);
    log::info!("[AI] get_ai_settings → enabled={}, model={}", settings.enabled, settings.model_name);
    Ok(settings)
}

#[tauri::command]
pub fn update_ai_settings(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    data: AiSettingsInput,
) -> Result<AiSettings, String> {
    log::info!("[AI] update_ai_settings called with: {:?}", data);
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

    log::info!("[AI] update_ai_settings → enabled={}, model={}", new_settings.enabled, new_settings.model_name);
    Ok(new_settings)
}

#[tauri::command]
pub async fn check_ai_status(llm: tauri::State<'_, LlmState>) -> Result<AiStatus, String> {
    log::info!("[AI] check_ai_status called");
    let (enabled, model_name) = {
        let settings = llm.settings.read().map_err(|e| e.to_string())?;
        (settings.enabled, settings.model_name.clone())
    };

    let (available, local_models) = if enabled {
        log::info!("[AI] check_ai_status: AI enabled, checking Ollama availability...");
        let avail = llm.is_available().await;
        log::info!("[AI] check_ai_status: Ollama available={}", avail);
        let models = if avail {
            llm.list_models().await.unwrap_or_default().into_iter().map(|m| m.name).collect::<Vec<_>>()
        } else {
            vec![]
        };
        (avail, models)
    } else {
        log::info!("[AI] check_ai_status: AI disabled");
        (false, vec![])
    };

    let model_available = local_models.iter().any(|m| m == &model_name);
    log::info!("[AI] check_ai_status → enabled={}, available={}, model_available={}, model={}, local={:?}", enabled, available, model_available, model_name, local_models);
    Ok(AiStatus {
        enabled,
        available,
        model_available,
        model_name,
        local_models,
    })
}

#[tauri::command]
pub async fn parse_job_ai(
    llm: tauri::State<'_, LlmState>,
    text: String,
) -> Result<ParsedJobDescription, LlmError> {
    log::info!("[AI] parse_job_ai called, text length={}", text.len());

    let request = LlmRequest {
        system_prompt: llm::prompts::JOB_PARSING_SYSTEM.to_string(),
        user_prompt: text,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
    };

    log::info!("[AI] parse_job_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!(
                "[AI] parse_job_ai: LLM responded in {}ms, tokens={:?}, content length={}",
                r.duration_ms, r.tokens_used, r.content.len()
            );
            r
        }
        Err(e) => {
            log::error!("[AI] parse_job_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    log::debug!("[AI] parse_job_ai: raw response: {}", response.content);

    let cleaned = match llm::clean_json_response(&response.content) {
        Ok(c) => {
            log::info!("[AI] parse_job_ai: JSON cleaned, length={}", c.len());
            c
        }
        Err(e) => {
            log::error!("[AI] parse_job_ai: JSON cleaning failed: {}", e);
            return Err(e);
        }
    };

    match serde_json::from_str::<ParsedJobDescription>(&cleaned) {
        Ok(parsed) => {
            log::info!(
                "[AI] parse_job_ai: parsed successfully — title={:?}, techs={:?}, rate={:?}, location={:?}",
                parsed.title, parsed.technologies, parsed.rate, parsed.location
            );
            Ok(parsed)
        }
        Err(e) => {
            log::error!("[AI] parse_job_ai: JSON deserialization failed: {} — cleaned JSON: {}", e, cleaned);
            Err(LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
        }
    }
}

fn fetch_lead_and_profile(
    db: &tauri::State<'_, Database>,
    lead_id: &str,
) -> Result<(Lead, Profile, Vec<Mission>), LlmError> {
    let conn = db.conn.lock().map_err(|e| {
        LlmError::InferenceFailed(format!("DB lock failed: {}", e))
    })?;

    let lead = conn
        .query_row(
            "SELECT id, createdAt, updatedAt, source, sourceUrl, client, title, description,
                    requiredTechnologies, requiredDomains, location, remotePolicy, offeredRate,
                    estimatedRevenue, estimatedStartDate, estimatedDuration, stage, matchScore,
                    autoFiltered, notes, contactName, contactInfo, nextAction, nextActionDate, profileId,
                    contentLanguage
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
                    content_language: row.get(25)?,
                })
            },
        )
        .map_err(|e| LlmError::InferenceFailed(format!("Lead not found: {}", e)))?;

    let profile = conn
        .query_row(
            "SELECT id, createdAt, updatedAt, name, title, yearsExperience, legalStructure,
                    minimumTjm, targetTjm, preferredLocations, maxCommuteDays, technologies,
                    domains, blacklistedClients, blacklistedDomains, bio, languages, education,
                    contentLanguage
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
                    bio: row.get(15)?,
                    languages: row.get(16)?,
                    education: row.get(17)?,
                    content_language: row.get(18)?,
                })
            },
        )
        .map_err(|e| LlmError::InferenceFailed(format!("Profile not found: {}", e)))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, createdAt, updatedAt, client, title, description, startDate, endDate, rate, daysPerWeek, status, profileId
             FROM \"Mission\" WHERE profileId = ?1 ORDER BY startDate DESC",
        )
        .map_err(|e| LlmError::InferenceFailed(format!("Mission query failed: {}", e)))?;

    let missions = stmt
        .query_map([&profile.id], |row| {
            Ok(Mission {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                client: row.get(3)?,
                title: row.get(4)?,
                description: row.get(5)?,
                start_date: row.get(6)?,
                end_date: row.get(7)?,
                rate: row.get(8)?,
                days_per_week: row.get(9)?,
                status: row.get(10)?,
                profile_id: row.get(11)?,
            })
        })
        .map_err(|e| LlmError::InferenceFailed(format!("Mission query failed: {}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    Ok((lead, profile, missions))
}

fn resolve_content_language(profile: &Profile, lead: &Lead) -> String {
    lead.content_language
        .clone()
        .or_else(|| profile.content_language.clone())
        .unwrap_or_else(|| "FR".to_string())
}

fn build_user_prompt(profile: &Profile, lead: &Lead, missions: &[Mission]) -> String {
    let profile_text = llm::prompts::format_profile_for_prompt(profile);
    let lead_text = llm::prompts::format_lead_for_prompt(lead);
    let missions_text = llm::prompts::format_missions_for_prompt(missions);
    if missions_text.is_empty() {
        format!(
            "## Freelancer Profile\n{}\n\n## Job Opportunity\n{}",
            profile_text, lead_text
        )
    } else {
        format!(
            "## Freelancer Profile\n{}\n\n## Professional Experience\n{}\n\n## Job Opportunity\n{}",
            profile_text, missions_text, lead_text
        )
    }
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
    log::info!("[AI] analyze_lead_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] analyze_lead_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let lang = resolve_content_language(&profile, &lead);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    let request = LlmRequest {
        system_prompt: format!("{}\n\n{}", llm::prompts::LEAD_ANALYSIS_SYSTEM, llm::prompts::language_instruction(&lang)),
        user_prompt,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
    };

    log::info!("[AI] analyze_lead_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!("[AI] analyze_lead_ai: LLM responded in {}ms, tokens={:?}", r.duration_ms, r.tokens_used);
            r
        }
        Err(e) => {
            log::error!("[AI] analyze_lead_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    let cleaned = match llm::clean_json_response(&response.content) {
        Ok(c) => c,
        Err(e) => {
            log::error!("[AI] analyze_lead_ai: JSON cleaning failed: {}", e);
            return Err(e);
        }
    };

    match serde_json::from_str::<LeadAnalysis>(&cleaned) {
        Ok(analysis) => {
            log::info!("[AI] analyze_lead_ai: parsed successfully — fit={}", analysis.overall_fit);

            // Persist analysis as a Document so it survives navigation
            let json_content = serde_json::to_string_pretty(&analysis)
                .map_err(|e| LlmError::InvalidJson(e.to_string()))?;
            save_document(&db, &lead_id, "lead_analysis", &json_content)?;

            Ok(analysis)
        }
        Err(e) => {
            log::error!("[AI] analyze_lead_ai: JSON deserialization failed: {} — cleaned JSON: {}", e, cleaned);
            Err(LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
        }
    }
}

#[tauri::command]
pub async fn generate_cover_letter_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_cover_letter_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] generate_cover_letter_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let lang = resolve_content_language(&profile, &lead);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    let request = LlmRequest {
        system_prompt: format!("{}\n\n{}", llm::prompts::COVER_LETTER_SYSTEM, llm::prompts::language_instruction(&lang)),
        user_prompt,
        temperature: 0.5,
        max_tokens: 0,
        json_mode: false,
    };

    log::info!("[AI] generate_cover_letter_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!("[AI] generate_cover_letter_ai: LLM responded in {}ms, tokens={:?}, content length={}", r.duration_ms, r.tokens_used, r.content.len());
            r
        }
        Err(e) => {
            log::error!("[AI] generate_cover_letter_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    let content = response.content.trim().to_string();
    log::info!("[AI] generate_cover_letter_ai: saving document...");

    match save_document(&db, &lead_id, "cover_letter", &content) {
        Ok(doc) => {
            log::info!("[AI] generate_cover_letter_ai: saved document id={}", doc.id);
            Ok(doc)
        }
        Err(e) => {
            log::error!("[AI] generate_cover_letter_ai: save failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn generate_interview_prep_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_interview_prep_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] generate_interview_prep_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let lang = resolve_content_language(&profile, &lead);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    let request = LlmRequest {
        system_prompt: format!("{}\n\n{}", llm::prompts::INTERVIEW_PREP_SYSTEM, llm::prompts::language_instruction(&lang)),
        user_prompt,
        temperature: 0.0,
        max_tokens: 4096,
        json_mode: true,
    };

    // Small local LLMs (3B-7B) with json_mode can still produce truncated or
    // malformed JSON when the structured output is large (interview prep has 7
    // nested fields). Retry once on parse failure before surfacing the error.
    let mut last_err = None;
    for attempt in 0..2 {
        log::info!("[AI] generate_interview_prep_ai: attempt {} — sending request to LLM...", attempt + 1);
        let response = match llm.generate(request.clone()).await {
            Ok(r) => {
                log::info!("[AI] generate_interview_prep_ai: attempt {} — LLM responded in {}ms, tokens={:?}", attempt + 1, r.duration_ms, r.tokens_used);
                r
            }
            Err(e) => {
                log::error!("[AI] generate_interview_prep_ai: attempt {} — LLM generation failed: {}", attempt + 1, e);
                return Err(e);
            }
        };

        let cleaned = match llm::clean_json_response(&response.content) {
            Ok(c) => {
                log::info!("[AI] generate_interview_prep_ai: attempt {} — JSON cleaned, length={}", attempt + 1, c.len());
                c
            }
            Err(e) => {
                log::error!("[AI] generate_interview_prep_ai: attempt {} — JSON cleaning failed: {}", attempt + 1, e);
                last_err = Some(e);
                continue;
            }
        };

        match serde_json::from_str::<InterviewPrep>(&cleaned) {
            Ok(prep) => {
                log::info!("[AI] generate_interview_prep_ai: parsed successfully, saving document...");
                let markdown = format_interview_prep_as_markdown(&prep, &lead.client, &lead.title);
                match save_document(&db, &lead_id, "interview_prep", &markdown) {
                    Ok(doc) => {
                        log::info!("[AI] generate_interview_prep_ai: saved document id={}", doc.id);
                        return Ok(doc);
                    }
                    Err(e) => {
                        log::error!("[AI] generate_interview_prep_ai: save failed: {}", e);
                        return Err(e);
                    }
                }
            }
            Err(e) => {
                log::error!("[AI] generate_interview_prep_ai: attempt {} — JSON deserialization failed: {} — cleaned JSON: {}", attempt + 1, e, cleaned);
                last_err = Some(LlmError::InvalidJson(format!("{}: {}", e, cleaned)));
            }
        }
    }

    log::error!("[AI] generate_interview_prep_ai: all attempts failed");
    Err(last_err.unwrap_or_else(|| LlmError::InferenceFailed("Interview prep generation failed".to_string())))
}

#[tauri::command]
pub async fn pull_ai_model(
    llm: tauri::State<'_, LlmState>,
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<(), LlmError> {
    log::info!("[AI] pull_ai_model called for model={}", model_name);
    match llm.pull_model(app_handle, &model_name).await {
        Ok(()) => {
            log::info!("[AI] pull_ai_model: completed for model={}", model_name);
            Ok(())
        }
        Err(e) => {
            log::error!("[AI] pull_ai_model: failed for model={}: {}", model_name, e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn analyze_activities_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
) -> Result<ActivityInsight, LlmError> {
    log::info!("[AI] analyze_activities_ai called for lead_id={}", lead_id);

    // Fetch activities for the lead
    let activities = {
        let conn = db.conn.lock().map_err(|e| {
            LlmError::InferenceFailed(format!("DB lock failed: {}", e))
        })?;
        let mut stmt = conn
            .prepare(
                "SELECT id, createdAt, updatedAt, type, title, description, occurredAt, duration, leadId
                 FROM \"Activity\" WHERE leadId = ?1 ORDER BY occurredAt DESC",
            )
            .map_err(|e| LlmError::InferenceFailed(format!("Activity query failed: {}", e)))?;

        let rows = stmt.query_map([&lead_id], |row| {
            Ok(Activity {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                activity_type: row.get(3)?,
                title: row.get(4)?,
                description: row.get(5)?,
                occurred_at: row.get(6)?,
                duration: row.get(7)?,
                lead_id: row.get(8)?,
            })
        })
        .map_err(|e| LlmError::InferenceFailed(format!("Activity query failed: {}", e)))?;
        let result: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        result
    };

    if activities.is_empty() {
        return Err(LlmError::InferenceFailed("No activities to analyze".to_string()));
    }

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    let lang = resolve_content_language(&profile, &lead);
    let base_prompt = build_user_prompt(&profile, &lead, &missions);
    let activities_text = llm::prompts::format_activities_for_prompt(&activities);
    let user_prompt = format!("{}\n\n## Activities\n{}", base_prompt, activities_text);

    let request = LlmRequest {
        system_prompt: format!(
            "{}\n\n{}",
            llm::prompts::ACTIVITY_INSIGHTS_SYSTEM,
            llm::prompts::language_instruction(&lang)
        ),
        user_prompt,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
    };

    log::info!("[AI] analyze_activities_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!(
                "[AI] analyze_activities_ai: LLM responded in {}ms, tokens={:?}",
                r.duration_ms, r.tokens_used
            );
            r
        }
        Err(e) => {
            log::error!("[AI] analyze_activities_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    let cleaned = match llm::clean_json_response(&response.content) {
        Ok(c) => c,
        Err(e) => {
            log::error!("[AI] analyze_activities_ai: JSON cleaning failed: {}", e);
            return Err(e);
        }
    };

    match serde_json::from_str::<ActivityInsight>(&cleaned) {
        Ok(insight) => {
            log::info!("[AI] analyze_activities_ai: parsed successfully — tone={}", insight.tone);
            let json_content = serde_json::to_string_pretty(&insight)
                .map_err(|e| LlmError::InvalidJson(e.to_string()))?;
            save_document(&db, &lead_id, "activity_insights", &json_content)?;
            Ok(insight)
        }
        Err(e) => {
            log::error!(
                "[AI] analyze_activities_ai: JSON deserialization failed: {} — cleaned JSON: {}",
                e, cleaned
            );
            Err(LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
        }
    }
}
