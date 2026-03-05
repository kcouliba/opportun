use crate::models::{Lead, Mission, Profile};

pub const JOB_PARSING_SYSTEM: &str = r#"You are a job description parser for French freelance IT markets. Extract structured data from job postings.

Return a JSON object with these fields (use null for missing data):
{
  "title": "job title",
  "client": "company/client name",
  "technologies": ["tech1", "tech2"],
  "rate": 600,
  "location": "city name",
  "remotePolicy": "full-remote|hybrid|on-site|remote",
  "description": "brief summary of the role",
  "requirements": ["requirement1", "requirement2"],
  "domains": ["domain1", "domain2"],
  "startDate": "YYYY-MM-DD or descriptive like 'ASAP'",
  "duration": "e.g., '6 months', '12 months'",
  "contactName": "recruiter/contact name",
  "contactInfo": "email or phone"
}

Rules:
- Normalize technology names: "ReactJS" → "React", "node" → "Node.js", "postgres" → "PostgreSQL"
- Convert all rates to daily (TJM). If yearly, divide by 218. If hourly, multiply by 7.
- Detect both French and English terms: "télétravail" = remote, "présentiel" = on-site
- For rate ranges like "500-600€/jour", use the average as the rate value
- Extract the actual company name, not the recruitment agency
- Domains examples: Fintech, E-commerce, Healthcare, SaaS, Banking, Insurance
- Be thorough with technologies — include frameworks, languages, databases, cloud providers, tools
- Only return valid JSON, no markdown fences"#;

pub const LEAD_ANALYSIS_SYSTEM: &str = r#"You are a freelance career advisor analyzing job opportunities for a French independent consultant. Provide honest, actionable analysis.

Return a JSON object:
{
  "overallFit": "Excellent|Good|Moderate|Poor",
  "fitSummary": "2-3 sentence summary of the fit",
  "strengths": ["strength1", "strength2", "strength3"],
  "risks": ["risk1", "risk2"],
  "talkingPoints": ["point1", "point2", "point3"],
  "questions": ["question1", "question2"],
  "rateAdvice": "advice about the rate negotiation"
}

Rules:
- Be specific — reference actual technologies, domains, and rates from the data
- Strengths should map to concrete profile matches — reference past missions when relevant
- Risks should be honest — flag skill gaps, rate mismatches, or red flags
- Talking points should reference specific past missions and achievements the freelancer can highlight
- Questions are what they should ask the client
- Rate advice should consider their target TJM vs offered rate
- Only return valid JSON, no markdown fences"#;

pub const COVER_LETTER_SYSTEM: &str = r#"You are a professional cover letter writer for French freelance IT consultants applying to contract opportunities.

Write a warm, personalized cover letter based on the freelancer's profile and the job description provided.

Rules:
- Use a professional but approachable tone — not stiff or corporate
- Highlight specific technology matches between the profile and the job requirements
- If there's a rate gap, frame it positively (value brought, flexibility, negotiation openness)
- Structure: 3-4 paragraphs (introduction, skills match, value proposition, closing)
- Adapt language (French or English) based on the job description language
- Reference the client by name and the specific role
- Include concrete details from the profile (years of experience, domain expertise) and reference relevant past missions
- End with a clear call to action
- Output plain text only — no JSON, no markdown fences"#;

pub const INTERVIEW_PREP_SYSTEM: &str = r#"You are a career coach specializing in preparing French freelance IT consultants for client interviews.

Analyze the freelancer's profile against the job opportunity and return structured interview preparation.

Return a JSON object with this exact structure:
{
  "opening": "A suggested opening pitch (2-3 sentences)",
  "technicalQuestions": [
    {
      "question": "Expected technical question",
      "suggestedAnswer": "How to answer this based on the profile",
      "tips": "Extra coaching tips for this question"
    }
  ],
  "behavioralQuestions": ["Expected behavioral/situational question 1", "question 2"],
  "rateNegotiation": {
    "strategy": "Overall negotiation strategy based on offered vs target rate",
    "talkingPoints": ["point1", "point2"]
  },
  "questionsToAsk": [
    {
      "question": "Question the freelancer should ask",
      "why": "Why this question is strategic"
    }
  ],
  "redFlags": ["Potential red flag to watch for"],
  "closingAdvice": "How to close the interview strongly"
}

Rules:
- Generate 3-5 technical questions relevant to the required technologies — suggested answers should reference past missions when applicable
- Generate 2-3 behavioral questions — use past missions as basis for STAR-method answers
- Rate negotiation should be specific to the numbers (offered vs target TJM)
- Suggest 3-4 strategic questions to ask the client
- Red flags should be honest — flag concerns from the job description
- Be specific — reference actual technologies, rates, and domains from the data
- Only return valid JSON, no markdown fences"#;

pub fn language_instruction(lang: &str) -> String {
    match lang {
        "FR" => "IMPORTANT: Write your entire response in French.".to_string(),
        _ => "IMPORTANT: Write your entire response in English.".to_string(),
    }
}

pub fn format_profile_for_prompt(profile: &Profile) -> String {
    let mut parts = vec![format!("Name: {}", profile.name)];

    if let Some(ref title) = profile.title {
        parts.push(format!("Title: {}", title));
    }
    if let Some(years) = profile.years_experience {
        parts.push(format!("Experience: {} years", years));
    }
    if let Some(ref techs) = profile.technologies {
        parts.push(format!("Technologies: {}", techs));
    }
    if let Some(ref domains) = profile.domains {
        parts.push(format!("Domains: {}", domains));
    }
    if let Some(min_tjm) = profile.minimum_tjm {
        parts.push(format!("Minimum TJM: {}€/day", min_tjm));
    }
    if let Some(target_tjm) = profile.target_tjm {
        parts.push(format!("Target TJM: {}€/day", target_tjm));
    }
    if let Some(ref locations) = profile.preferred_locations {
        parts.push(format!("Preferred locations: {}", locations));
    }
    if let Some(ref blacklisted) = profile.blacklisted_clients {
        parts.push(format!("Blacklisted clients: {}", blacklisted));
    }
    if let Some(ref blacklisted) = profile.blacklisted_domains {
        parts.push(format!("Blacklisted domains: {}", blacklisted));
    }
    if let Some(ref bio) = profile.bio {
        parts.push(format!("Bio: {}", bio));
    }
    if let Some(ref languages) = profile.languages {
        parts.push(format!("Languages: {}", languages));
    }
    if let Some(ref education) = profile.education {
        parts.push(format!("Education: {}", education));
    }

    parts.join("\n")
}

pub fn format_missions_for_prompt(missions: &[Mission]) -> String {
    if missions.is_empty() {
        return String::new();
    }
    let mut parts = Vec::new();
    for m in missions {
        let mut line = format!("- {} at {} ({}", m.title, m.client, m.start_date);
        if let Some(ref end) = m.end_date {
            line.push_str(&format!(" → {})", end));
        } else {
            line.push_str(" → ongoing)");
        }
        line.push_str(&format!(", {}€/day, {}d/week", m.rate, m.days_per_week));
        if let Some(ref desc) = m.description {
            if !desc.is_empty() {
                line.push_str(&format!(" — {}", desc));
            }
        }
        parts.push(line);
    }
    parts.join("\n")
}

pub fn format_lead_for_prompt(lead: &Lead) -> String {
    let mut parts = vec![
        format!("Title: {}", lead.title),
        format!("Client: {}", lead.client),
    ];

    if let Some(ref desc) = lead.description {
        parts.push(format!("Description: {}", desc));
    }
    if let Some(ref techs) = lead.required_technologies {
        parts.push(format!("Required technologies: {}", techs));
    }
    if let Some(ref domains) = lead.required_domains {
        parts.push(format!("Required domains: {}", domains));
    }
    if let Some(rate) = lead.offered_rate {
        parts.push(format!("Offered rate: {}€/day", rate));
    }
    if let Some(ref location) = lead.location {
        parts.push(format!("Location: {}", location));
    }
    if let Some(ref policy) = lead.remote_policy {
        parts.push(format!("Remote policy: {}", policy));
    }
    if let Some(ref start) = lead.estimated_start_date {
        parts.push(format!("Start date: {}", start));
    }
    if let Some(duration) = lead.estimated_duration {
        parts.push(format!("Duration: {} months", duration));
    }
    if let Some(score) = lead.match_score {
        parts.push(format!("Current match score: {}%", score));
    }

    parts.join("\n")
}
