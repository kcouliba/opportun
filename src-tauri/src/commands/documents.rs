use crate::db::Database;
use crate::matching::parse_json_array;
use crate::models::{ApplicationMessageOptions, Document};
use chrono::Utc;
use tauri::State;

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

struct LeadData {
    client: String,
    title: String,
    required_technologies: Option<String>,
    remote_policy: Option<String>,
    offered_rate: Option<i64>,
    estimated_start_date: Option<String>,
}

struct ProfileData {
    name: String,
    title: Option<String>,
    years_experience: Option<i64>,
    technologies: Option<String>,
    domains: Option<String>,
    target_tjm: Option<i64>,
}

fn generate_cover_letter(profile: &ProfileData, lead: &LeadData) -> String {
    let profile_title = profile.title.as_deref().unwrap_or("Developer");

    let experience_text = match profile.years_experience {
        Some(years) => format!("with {}+ years of experience", years),
        None => String::new(),
    };

    let technologies = parse_json_array(&profile.technologies);
    let required_technologies = parse_json_array(&lead.required_technologies);

    // Find matching technologies
    let tech_lower: Vec<String> = technologies.iter().map(|t| t.to_lowercase()).collect();
    let matching_techs: Vec<&String> = required_technologies
        .iter()
        .filter(|t| tech_lower.contains(&t.to_lowercase()))
        .collect();

    let tech_highlight = if !matching_techs.is_empty() {
        let names: Vec<&str> = matching_techs.iter().map(|s| s.as_str()).collect();
        format!(
            "I have hands-on experience with {}, which aligns directly with your requirements.",
            names.join(", ")
        )
    } else if !technologies.is_empty() {
        let top5: Vec<&str> = technologies.iter().take(5).map(|s| s.as_str()).collect();
        format!("My technical stack includes {}.", top5.join(", "))
    } else {
        String::new()
    };

    let domains = parse_json_array(&profile.domains);
    let domain_text = if !domains.is_empty() {
        let top3: Vec<&str> = domains.iter().take(3).map(|s| s.as_str()).collect();
        format!("I've worked across {} domains.", top3.join(", "))
    } else {
        String::new()
    };

    let remote_text = match lead.remote_policy.as_deref() {
        Some("remote") => {
            "I'm fully set up for remote work and experienced in async collaboration.".to_string()
        }
        Some("hybrid") => "I'm comfortable with hybrid arrangements and can adapt to your on-site requirements.".to_string(),
        _ => String::new(),
    };

    format!(
        "Dear {} Team,

I am writing to express my strong interest in the {} position.

As a {} {}, I believe I would be a valuable addition to your team.

{}

{}

{}

I am excited about the opportunity to contribute to {} and would welcome the chance to discuss how my skills and experience align with your needs.

Best regards,
{}

---
Note: This is a generated template. Please personalize before sending.",
        lead.client,
        lead.title,
        profile_title,
        experience_text,
        tech_highlight,
        domain_text,
        remote_text,
        lead.client,
        profile.name,
    )
}

fn generate_key_questions(profile: &ProfileData, lead: &LeadData) -> String {
    let profile_title = profile.title.as_deref().unwrap_or("Developer");

    let experience_text = match profile.years_experience {
        Some(years) => format!("{}+", years),
        None => "several".to_string(),
    };

    let technologies = parse_json_array(&profile.technologies);
    let required_technologies = parse_json_array(&lead.required_technologies);

    let tech_lower: Vec<String> = technologies.iter().map(|t| t.to_lowercase()).collect();
    let matching_techs: Vec<String> = required_technologies
        .iter()
        .filter(|t| tech_lower.contains(&t.to_lowercase()))
        .cloned()
        .collect();

    let relevant_techs: Vec<String> = if !matching_techs.is_empty() {
        matching_techs
    } else {
        technologies.into_iter().take(5).collect()
    };

    let availability_text = match &lead.estimated_start_date {
        Some(date) => format!("I am available to start from {}.", date),
        None => {
            "I am flexible on the start date and can discuss timing based on your needs."
                .to_string()
        }
    };

    let rate_text = match (lead.offered_rate, profile.target_tjm) {
        (Some(offered), Some(target)) => {
            if offered >= target {
                format!("The proposed rate of {}\u{20ac}/day works for me.", offered)
            } else {
                format!(
                    "My target rate is {}\u{20ac}/day. I'm open to discussing the proposed {}\u{20ac}/day based on the full scope of the role.",
                    target, offered
                )
            }
        }
        (None, Some(target)) => {
            format!(
                "My target rate is {}\u{20ac}/day, negotiable based on the role scope.",
                target
            )
        }
        _ => "I'm open to discussing rate based on the full scope of the engagement.".to_string(),
    };

    let top3_techs: Vec<&str> = relevant_techs.iter().take(3).map(|s| s.as_str()).collect();
    let top3_text = top3_techs.join(", ");

    let tech_answers: String = relevant_techs
        .iter()
        .map(|tech| {
            format!(
                "**{}:** I have production experience with {}. [Add specific project or achievement here]",
                tech, tech
            )
        })
        .collect::<Vec<String>>()
        .join("\n\n");

    let work_setup_text = match lead.remote_policy.as_deref() {
        Some("remote") => "I'm fully equipped for remote work with a dedicated home office, reliable internet, and experience with async communication tools (Slack, Notion, etc.).",
        Some("hybrid") => "I'm comfortable with hybrid arrangements. I appreciate face-to-face collaboration for certain activities while valuing the focus time that remote work provides.",
        _ => "I'm flexible and can adapt to on-site requirements. I understand the value of in-person collaboration, especially during onboarding and key project phases.",
    };

    format!(
        r#"# Prepared Answers for {} at {}

## "Tell me about yourself / Why are you interested in this role?"

I'm {}, a {} with {} years of experience. I'm particularly interested in this role at {} because it aligns well with my expertise in {}.

I thrive in environments where I can deliver impact while continuing to grow technically. This opportunity seems to offer both.

---

## "What's your experience with [required technologies]?"

{}

---

## "What's your availability and rate?"

{}

{}

---

## "What's your preferred work setup?"

{}

---

## "Do you have any questions for us?"

Suggested questions to ask:
1. What does success look like in the first 3 months?
2. What's the team structure and who would I be working closely with?
3. What's the biggest challenge the team is currently facing?
4. Is there potential for extension beyond the initial contract?

---
*Generated for {} | Customize before your interview*"#,
        lead.title,
        lead.client,
        profile.name,
        profile_title,
        experience_text,
        lead.client,
        top3_text,
        tech_answers,
        availability_text,
        rate_text,
        work_setup_text,
        profile.name,
    )
}

fn resolve_char_target(options: &ApplicationMessageOptions) -> u32 {
    options.char_limit.unwrap_or(match options.length_preset.as_str() {
        "short" => 150,
        "long" => 1000,
        _ => 500, // "standard"
    })
}

fn generate_application_message_template(
    profile: &ProfileData,
    lead: &LeadData,
    options: &ApplicationMessageOptions,
) -> String {
    let target = resolve_char_target(options) as usize;
    let profile_title = profile.title.as_deref().unwrap_or("Developer");

    let technologies = parse_json_array(&profile.technologies);
    let required_technologies = parse_json_array(&lead.required_technologies);

    let tech_lower: Vec<String> = technologies.iter().map(|t| t.to_lowercase()).collect();
    let matching_techs: Vec<&String> = required_technologies
        .iter()
        .filter(|t| tech_lower.contains(&t.to_lowercase()))
        .collect();

    let tech_mention = if !matching_techs.is_empty() {
        let names: Vec<&str> = matching_techs.iter().take(3).map(|s| s.as_str()).collect();
        format!("I work with {} daily", names.join(", "))
    } else if !technologies.is_empty() {
        let top: Vec<&str> = technologies.iter().take(3).map(|s| s.as_str()).collect();
        format!("My stack includes {}", top.join(", "))
    } else {
        String::new()
    };

    let experience = match profile.years_experience {
        Some(y) => format!(" with {}+ years of experience", y),
        None => String::new(),
    };

    let focus = options
        .custom_focus
        .as_deref()
        .map(|f| format!(" {}", f))
        .unwrap_or_default();

    let greeting = match options.tone.as_str() {
        "friendly" => format!("Hi {} team!", lead.client),
        "direct" => "Hello,".to_string(),
        _ => format!("Hello {} team,", lead.client),
    };

    let cta = match options.tone.as_str() {
        "friendly" => "Would love to chat if this sounds like a fit!",
        "direct" => "Available to discuss — let me know.",
        _ => "I'd welcome the opportunity to discuss this further.",
    };

    let mut msg = format!(
        "{}\n\nI'm {}, a {}{}, and I'm interested in the {} role.{} {}.\n\n{}\n\n---\nGenerated template — personalize before sending.",
        greeting,
        profile.name,
        profile_title,
        experience,
        lead.title,
        focus,
        tech_mention,
        cta,
    );

    // Truncate to target if over
    if msg.len() > target + target / 10 {
        msg.truncate(target);
        if let Some(last_space) = msg.rfind(' ') {
            msg.truncate(last_space);
        }
        msg.push_str("...");
    }

    msg
}

#[tauri::command]
pub fn generate_application_message(
    db: State<Database>,
    lead_id: String,
    options: ApplicationMessageOptions,
) -> Result<Document, String> {
    let conn = db.conn.lock().unwrap();

    let lead = conn
        .query_row(
            "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![lead_id],
            |row| -> rusqlite::Result<LeadData> {
                Ok(LeadData {
                    client: row.get("client")?,
                    title: row.get("title")?,
                    required_technologies: row.get("requiredTechnologies")?,
                    remote_policy: row.get("remotePolicy")?,
                    offered_rate: row.get("offeredRate")?,
                    estimated_start_date: row.get("estimatedStartDate")?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Lead not found".to_string(),
            _ => e.to_string(),
        })?;

    let profile = conn
        .query_row(
            "SELECT * FROM \"Profile\" LIMIT 1",
            [],
            |row| -> rusqlite::Result<ProfileData> {
                Ok(ProfileData {
                    name: row.get("name")?,
                    title: row.get("title")?,
                    years_experience: row.get("yearsExperience")?,
                    technologies: row.get("technologies")?,
                    domains: row.get("domains")?,
                    target_tjm: row.get("targetTJM")?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                "No profile found. Please set up your profile first.".to_string()
            }
            _ => e.to_string(),
        })?;

    let content = generate_application_message_template(&profile, &lead, &options);

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO \"Document\" (\"id\", \"createdAt\", \"updatedAt\", \"type\", \"content\", \"version\", \"leadId\")
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        rusqlite::params![id, now, now, "application_message", content, lead_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT * FROM \"Document\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        row_to_document,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_document(
    db: State<Database>,
    lead_id: String,
    doc_type: String,
) -> Result<Document, String> {
    let conn = db.conn.lock().unwrap();

    // Validate doc_type
    if doc_type != "cover_letter" && doc_type != "key_questions" {
        return Err("Invalid document type. Must be 'cover_letter' or 'key_questions'.".to_string());
    }

    // Get the lead
    let lead = conn
        .query_row(
            "SELECT * FROM \"Lead\" WHERE \"id\" = ?1",
            rusqlite::params![lead_id],
            |row| -> rusqlite::Result<LeadData> {
                Ok(LeadData {
                    client: row.get("client")?,
                    title: row.get("title")?,
                    required_technologies: row.get("requiredTechnologies")?,
                    remote_policy: row.get("remotePolicy")?,
                    offered_rate: row.get("offeredRate")?,
                    estimated_start_date: row.get("estimatedStartDate")?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "Lead not found".to_string(),
            _ => e.to_string(),
        })?;

    // Get the profile (via the lead's profileId or just the first profile)
    let profile = conn
        .query_row(
            "SELECT * FROM \"Profile\" LIMIT 1",
            [],
            |row| -> rusqlite::Result<ProfileData> {
                Ok(ProfileData {
                    name: row.get("name")?,
                    title: row.get("title")?,
                    years_experience: row.get("yearsExperience")?,
                    technologies: row.get("technologies")?,
                    domains: row.get("domains")?,
                    target_tjm: row.get("targetTJM")?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                "No profile found. Please set up your profile first.".to_string()
            }
            _ => e.to_string(),
        })?;

    // Generate content
    let content = match doc_type.as_str() {
        "cover_letter" => generate_cover_letter(&profile, &lead),
        "key_questions" => generate_key_questions(&profile, &lead),
        _ => unreachable!(),
    };

    // Save the document
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO \"Document\" (\"id\", \"createdAt\", \"updatedAt\", \"type\", \"content\", \"version\", \"leadId\")
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        rusqlite::params![id, now, now, doc_type, content, lead_id],
    )
    .map_err(|e| e.to_string())?;

    // Fetch and return the created document
    conn.query_row(
        "SELECT * FROM \"Document\" WHERE \"id\" = ?1",
        rusqlite::params![id],
        row_to_document,
    )
    .map_err(|e| e.to_string())
}
