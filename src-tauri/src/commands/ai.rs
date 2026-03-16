use crate::db::Database;
use crate::llm::{self, LlmState};
use crate::llm::provider::{LlmError, LlmRequest};
use crate::llm::tier::ModelTier;
use crate::models::{
    Activity, ActivityInsight, AiSettings, AiSettingsInput, ApplicationMessageOptions,
    Document, InterviewPrep, InterviewPrepQuestion, Lead, LeadAnalysis,
    Mission, ParsedJobDescription, ParsedMission, ParsedProfileData, Profile, QuestionToAsk,
    RateNegotiation,
};

/// Get the current ModelTier from LlmState settings.
fn detect_tier(llm: &LlmState) -> ModelTier {
    let settings = llm.settings.read().unwrap();
    ModelTier::detect(&settings.provider, &settings.model_name)
}

/// Get GBNF grammar string for a given schema (only available with embedded-llm feature).
fn basic_grammar(name: &str) -> Option<String> {
    #[cfg(feature = "embedded-llm")]
    {
        let g = match name {
            "job_parsing" => crate::llm::grammars::JOB_PARSING_BASIC,
            "lead_analysis" => crate::llm::grammars::LEAD_ANALYSIS_BASIC,
            "activity_insight" => crate::llm::grammars::ACTIVITY_INSIGHT,
            "resume_info" => crate::llm::grammars::RESUME_BASIC_INFO,
            "resume_missions" => crate::llm::grammars::RESUME_BASIC_MISSIONS,
            "interview_technical" => crate::llm::grammars::INTERVIEW_PREP_TECHNICAL,
            "interview_behavioral" => crate::llm::grammars::INTERVIEW_PREP_BEHAVIORAL,
            "interview_rate" => crate::llm::grammars::INTERVIEW_PREP_RATE,
            "job_board_extract" => crate::llm::grammars::JOB_BOARD_EXTRACT,
            _ => return None,
        };
        Some(g.to_string())
    }
    #[cfg(not(feature = "embedded-llm"))]
    {
        let _ = name;
        None
    }
}

// ── Intermediate structs for decomposed Basic-tier responses ────────────────

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicResumeInfo {
    pub name: Option<String>,
    pub title: Option<String>,
    pub bio: Option<String>,
    pub years_experience: Option<i64>,
    pub location: Option<String>,
    pub technologies: Option<Vec<String>>,
    pub domains: Option<Vec<String>>,
    pub languages: Option<Vec<String>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicResumeMissions {
    pub missions: Option<Vec<ParsedMission>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicInterviewTechnical {
    pub technical_questions: Vec<InterviewPrepQuestion>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicInterviewBehavioral {
    pub opening: String,
    pub behavioral_questions: Vec<String>,
    pub questions_to_ask: Vec<QuestionToAsk>,
    pub red_flags: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicInterviewRate {
    pub rate_negotiation: RateNegotiation,
    pub closing_advice: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub enabled: bool,
    pub available: bool,
    pub model_available: bool,
    pub model_name: String,
    pub local_models: Vec<String>,
    pub provider: String,
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
    log::info!("[AI] update_ai_settings called (provider={:?}, model={:?})", data.provider, data.model_name);
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
    if let Some(ref provider) = data.provider {
        updates.push("provider = ?");
        params.push(Box::new(provider.clone()));
    }
    if let Some(ref api_key) = data.api_key {
        updates.push("apiKey = ?");
        params.push(Box::new(api_key.clone()));
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
    let (enabled, model_name, provider) = {
        let settings = llm.settings.read().map_err(|e| e.to_string())?;
        (settings.enabled, settings.model_name.clone(), settings.provider.clone())
    };

    let (available, model_available, local_models) = if enabled {
        match provider.as_str() {
            "embedded" => {
                let avail = llm.is_available().await;
                log::info!("[AI] check_ai_status: embedded available={}", avail);
                // For embedded, model_available = is_available (model downloaded)
                (true, avail, vec![])
            }
            "openai" | "anthropic" => {
                let avail = llm.is_available().await;
                log::info!("[AI] check_ai_status: {} available={}", provider, avail);
                (avail, true, vec![])
            }
            _ => {
                log::info!("[AI] check_ai_status: AI enabled, checking Ollama availability...");
                let avail = llm.is_available().await;
                log::info!("[AI] check_ai_status: Ollama available={}", avail);
                let models = if avail {
                    llm.list_models().await.unwrap_or_default().into_iter().map(|m| m.name).collect::<Vec<_>>()
                } else {
                    vec![]
                };
                let model_avail = models.iter().any(|m| m == &model_name);
                (avail, model_avail, models)
            }
        }
    } else {
        log::info!("[AI] check_ai_status: AI disabled");
        (false, false, vec![])
    };

    log::info!("[AI] check_ai_status → provider={}, enabled={}, available={}, model_available={}, model={}", provider, enabled, available, model_available, model_name);
    Ok(AiStatus {
        enabled,
        available,
        model_available,
        model_name,
        local_models,
        provider,
    })
}

#[tauri::command]
pub async fn parse_job_ai(
    llm: tauri::State<'_, LlmState>,
    text: String,
) -> Result<ParsedJobDescription, LlmError> {
    log::info!("[AI] parse_job_ai called, text length={}", text.len());
    let tier = detect_tier(&llm);

    let (system_prompt, gbnf_grammar) = if tier.is_basic() {
        (
            llm::prompts_basic::JOB_PARSING_BASIC_SYSTEM.to_string(),
            basic_grammar("job_parsing"),
        )
    } else {
        (llm::prompts::JOB_PARSING_SYSTEM.to_string(), None)
    };

    let request = LlmRequest {
        system_prompt,
        user_prompt: text,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar,
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

#[tauri::command]
pub async fn parse_resume_ai(
    llm: tauri::State<'_, LlmState>,
    text: String,
) -> Result<ParsedProfileData, LlmError> {
    log::info!("[AI] parse_resume_ai called, text length={}", text.len());
    let tier = detect_tier(&llm);

    if tier.is_basic() {
        return parse_resume_ai_basic(&llm, text).await;
    }

    let request = LlmRequest {
        system_prompt: llm::prompts::RESUME_PARSING_SYSTEM.to_string(),
        user_prompt: text,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar: None,
    };

    log::info!("[AI] parse_resume_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!(
                "[AI] parse_resume_ai: LLM responded in {}ms, tokens={:?}, content length={}",
                r.duration_ms, r.tokens_used, r.content.len()
            );
            r
        }
        Err(e) => {
            log::error!("[AI] parse_resume_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    log::debug!("[AI] parse_resume_ai: raw response: {}", response.content);

    let cleaned = match llm::clean_json_response(&response.content) {
        Ok(c) => {
            log::info!("[AI] parse_resume_ai: JSON cleaned, length={}", c.len());
            c
        }
        Err(e) => {
            log::error!("[AI] parse_resume_ai: JSON cleaning failed: {}", e);
            return Err(e);
        }
    };

    match serde_json::from_str::<ParsedProfileData>(&cleaned) {
        Ok(parsed) => {
            log::info!(
                "[AI] parse_resume_ai: parsed successfully — name={:?}, techs={:?}",
                parsed.name, parsed.technologies
            );
            Ok(parsed)
        }
        Err(e) => {
            log::error!("[AI] parse_resume_ai: JSON deserialization failed: {} — cleaned JSON: {}", e, cleaned);
            Err(LlmError::InvalidJson(format!("{}: {}", e, cleaned)))
        }
    }
}

/// Basic-tier resume parsing: decomposed into 2 simpler calls.
async fn parse_resume_ai_basic(
    llm: &LlmState,
    text: String,
) -> Result<ParsedProfileData, LlmError> {
    log::info!("[AI] parse_resume_ai_basic: decomposed mode (2 calls)");

    // Call 1: basic info
    let info_request = LlmRequest {
        system_prompt: llm::prompts_basic::RESUME_PARSING_BASIC_INFO_SYSTEM.to_string(),
        user_prompt: text.clone(),
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar: basic_grammar("resume_info"),
    };

    let info_response = llm.generate(info_request).await?;
    let info_cleaned = llm::clean_json_response(&info_response.content)?;
    let info: BasicResumeInfo = serde_json::from_str(&info_cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("Resume info parse failed: {}: {}", e, info_cleaned)))?;

    log::info!("[AI] parse_resume_ai_basic: info parsed — name={:?}", info.name);

    // Call 2: missions
    let missions_request = LlmRequest {
        system_prompt: llm::prompts_basic::RESUME_PARSING_BASIC_MISSIONS_SYSTEM.to_string(),
        user_prompt: text,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar: basic_grammar("resume_missions"),
    };

    let missions_response = llm.generate(missions_request).await?;
    let missions_cleaned = llm::clean_json_response(&missions_response.content)?;
    let missions: BasicResumeMissions = serde_json::from_str(&missions_cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("Resume missions parse failed: {}: {}", e, missions_cleaned)))?;

    log::info!("[AI] parse_resume_ai_basic: missions parsed — count={}", missions.missions.as_ref().map(|m| m.len()).unwrap_or(0));

    // Assemble the full ParsedProfileData
    Ok(ParsedProfileData {
        name: info.name,
        title: info.title,
        bio: info.bio,
        years_experience: info.years_experience,
        location: info.location,
        technologies: info.technologies,
        domains: info.domains,
        languages: info.languages,
        education: None, // Basic tier skips education parsing
        missions: missions.missions,
    })
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

fn resolve_content_language(lead: &Lead, app_locale: &Option<String>) -> String {
    lead.content_language
        .clone()
        .or_else(|| {
            app_locale.as_ref().map(|l| {
                if l.starts_with("fr") { "FR".to_string() } else { "EN".to_string() }
            })
        })
        .unwrap_or_else(|| "EN".to_string())
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
    locale: Option<String>,
) -> Result<LeadAnalysis, LlmError> {
    log::info!("[AI] analyze_lead_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] analyze_lead_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let tier = detect_tier(&llm);
    let lang = resolve_content_language(&lead, &locale);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    let (system_prompt, gbnf_grammar) = if tier.is_basic() {
        (
            format!("{}\n\n{}", llm::prompts_basic::LEAD_ANALYSIS_BASIC_SYSTEM, llm::prompts::language_instruction(&lang)),
            basic_grammar("lead_analysis"),
        )
    } else {
        (
            format!("{}\n\n{}", llm::prompts::LEAD_ANALYSIS_SYSTEM, llm::prompts::language_instruction(&lang)),
            None,
        )
    };

    let request = LlmRequest {
        system_prompt,
        user_prompt,
        temperature: 0.0,
        max_tokens: 0,
        json_mode: true,
        gbnf_grammar,
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
    locale: Option<String>,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_cover_letter_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] generate_cover_letter_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let lang = resolve_content_language(&lead, &locale);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    let request = LlmRequest {
        system_prompt: format!("{}\n\n{}", llm::prompts::COVER_LETTER_SYSTEM, llm::prompts::language_instruction(&lang)),
        user_prompt,
        temperature: 0.5,
        max_tokens: 0,
        json_mode: false,
        gbnf_grammar: None,
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
    locale: Option<String>,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_interview_prep_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] generate_interview_prep_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let tier = detect_tier(&llm);
    let lang = resolve_content_language(&lead, &locale);
    let user_prompt = build_user_prompt(&profile, &lead, &missions);

    if tier.is_basic() {
        return generate_interview_prep_basic(&llm, &db, &lead_id, &lead, &user_prompt, &lang).await;
    }

    let request = LlmRequest {
        system_prompt: format!("{}\n\n{}", llm::prompts::INTERVIEW_PREP_SYSTEM, llm::prompts::language_instruction(&lang)),
        user_prompt,
        temperature: 0.0,
        max_tokens: 4096,
        json_mode: true,
        gbnf_grammar: None,
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

/// Basic-tier interview prep: decomposed into 3 simpler calls, then assembled.
async fn generate_interview_prep_basic(
    llm: &LlmState,
    db: &tauri::State<'_, Database>,
    lead_id: &str,
    lead: &Lead,
    user_prompt: &str,
    lang: &str,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_interview_prep_basic: decomposed mode (3 calls)");

    // Call 1: technical questions
    let tech_request = LlmRequest {
        system_prompt: format!(
            "{}\n\n{}",
            llm::prompts_basic::INTERVIEW_PREP_BASIC_TECHNICAL_SYSTEM,
            llm::prompts::language_instruction(lang)
        ),
        user_prompt: user_prompt.to_string(),
        temperature: 0.0,
        max_tokens: 2048,
        json_mode: true,
        gbnf_grammar: basic_grammar("interview_technical"),
    };

    let tech_response = llm.generate(tech_request).await?;
    let tech_cleaned = llm::clean_json_response(&tech_response.content)?;
    let tech: BasicInterviewTechnical = serde_json::from_str(&tech_cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("Technical Qs parse failed: {}: {}", e, tech_cleaned)))?;

    log::info!("[AI] generate_interview_prep_basic: technical parsed — {} questions", tech.technical_questions.len());

    // Call 2: behavioral + opening
    let behav_request = LlmRequest {
        system_prompt: format!(
            "{}\n\n{}",
            llm::prompts_basic::INTERVIEW_PREP_BASIC_BEHAVIORAL_SYSTEM,
            llm::prompts::language_instruction(lang)
        ),
        user_prompt: user_prompt.to_string(),
        temperature: 0.0,
        max_tokens: 2048,
        json_mode: true,
        gbnf_grammar: basic_grammar("interview_behavioral"),
    };

    let behav_response = llm.generate(behav_request).await?;
    let behav_cleaned = llm::clean_json_response(&behav_response.content)?;
    let behav: BasicInterviewBehavioral = serde_json::from_str(&behav_cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("Behavioral parse failed: {}: {}", e, behav_cleaned)))?;

    log::info!("[AI] generate_interview_prep_basic: behavioral parsed");

    // Call 3: rate negotiation + closing
    let rate_request = LlmRequest {
        system_prompt: format!(
            "{}\n\n{}",
            llm::prompts_basic::INTERVIEW_PREP_BASIC_RATE_SYSTEM,
            llm::prompts::language_instruction(lang)
        ),
        user_prompt: user_prompt.to_string(),
        temperature: 0.0,
        max_tokens: 1024,
        json_mode: true,
        gbnf_grammar: basic_grammar("interview_rate"),
    };

    let rate_response = llm.generate(rate_request).await?;
    let rate_cleaned = llm::clean_json_response(&rate_response.content)?;
    let rate: BasicInterviewRate = serde_json::from_str(&rate_cleaned)
        .map_err(|e| LlmError::InvalidJson(format!("Rate parse failed: {}: {}", e, rate_cleaned)))?;

    log::info!("[AI] generate_interview_prep_basic: rate parsed");

    // Assemble the full InterviewPrep
    let prep = InterviewPrep {
        opening: behav.opening,
        technical_questions: tech.technical_questions,
        behavioral_questions: behav.behavioral_questions,
        rate_negotiation: rate.rate_negotiation,
        questions_to_ask: behav.questions_to_ask,
        red_flags: behav.red_flags,
        closing_advice: rate.closing_advice,
    };

    let markdown = format_interview_prep_as_markdown(&prep, &lead.client, &lead.title);
    let doc = save_document(db, lead_id, "interview_prep", &markdown)?;
    log::info!("[AI] generate_interview_prep_basic: saved document id={}", doc.id);
    Ok(doc)
}

#[tauri::command]
pub async fn pull_ai_model(
    llm: tauri::State<'_, LlmState>,
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<(), LlmError> {
    log::info!("[AI] pull_ai_model called for model={}", model_name);
    {
        let settings = llm.settings.read().map_err(|_| LlmError::InferenceFailed("Failed to read settings".to_string()))?;
        let provider = &settings.provider;
        if provider != "ollama" && provider != "embedded" {
            return Err(LlmError::InferenceFailed("Model pulling is only supported for Ollama or Embedded".to_string()));
        }
    }
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
    locale: Option<String>,
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

    let tier = detect_tier(&llm);
    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    let lang = resolve_content_language(&lead, &locale);
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
        gbnf_grammar: if tier.is_basic() { basic_grammar("activity_insight") } else { None },
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

#[tauri::command]
pub async fn generate_application_message_ai(
    db: tauri::State<'_, Database>,
    llm: tauri::State<'_, LlmState>,
    lead_id: String,
    options: ApplicationMessageOptions,
    locale: Option<String>,
) -> Result<Document, LlmError> {
    log::info!("[AI] generate_application_message_ai called for lead_id={}", lead_id);

    let (lead, profile, missions) = fetch_lead_and_profile(&db, &lead_id)?;
    log::info!("[AI] generate_application_message_ai: fetched lead '{}' and profile '{}'", lead.title, profile.name);

    let lang = resolve_content_language(&lead, &locale);
    let mut user_prompt = build_user_prompt(&profile, &lead, &missions);

    let char_target = options.char_limit.unwrap_or(match options.length_preset.as_str() {
        "short" => 150,
        "long" => 1000,
        _ => 500,
    });

    user_prompt.push_str(&format!(
        "\n\n## Message Parameters\n- Target length: ~{} characters\n- Tone: {}",
        char_target, options.tone
    ));
    if let Some(ref focus) = options.custom_focus {
        if !focus.is_empty() {
            user_prompt.push_str(&format!("\n- Focus: {}", focus));
        }
    }

    let request = LlmRequest {
        system_prompt: format!(
            "{}\n\n{}",
            llm::prompts::APPLICATION_MESSAGE_SYSTEM,
            llm::prompts::language_instruction(&lang)
        ),
        user_prompt,
        temperature: 0.7,
        max_tokens: 0,
        json_mode: false,
        gbnf_grammar: None,
    };

    log::info!("[AI] generate_application_message_ai: sending request to LLM...");
    let response = match llm.generate(request).await {
        Ok(r) => {
            log::info!(
                "[AI] generate_application_message_ai: LLM responded in {}ms, tokens={:?}, content length={}",
                r.duration_ms, r.tokens_used, r.content.len()
            );
            r
        }
        Err(e) => {
            log::error!("[AI] generate_application_message_ai: LLM generation failed: {}", e);
            return Err(e);
        }
    };

    let content = response.content.trim().to_string();
    log::info!("[AI] generate_application_message_ai: saving document...");

    match save_document(&db, &lead_id, "application_message", &content) {
        Ok(doc) => {
            log::info!("[AI] generate_application_message_ai: saved document id={}", doc.id);
            Ok(doc)
        }
        Err(e) => {
            log::error!("[AI] generate_application_message_ai: save failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn is_embedded_available() -> bool {
    cfg!(feature = "embedded-llm")
}

#[cfg(feature = "embedded-llm")]
#[tauri::command]
pub fn unload_embedded_model(llm: tauri::State<'_, LlmState>) -> Result<(), String> {
    log::info!("[AI] unload_embedded_model called");
    llm.embedded.unload();
    Ok(())
}
