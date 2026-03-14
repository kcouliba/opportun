use crate::models::{EducationEntry, ParsedJobDescription, ParsedMission, ParsedProfileData};
use regex::Regex;
use std::collections::HashSet;

// ── fetch_url_text ──────────────────────────────────────────────────────────

/// Inner helper reusable from other command modules.
pub(crate) async fn fetch_url_text_inner(url: &str) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error: {}", resp.status()));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    Ok(strip_html_to_text(&html))
}

#[tauri::command]
pub async fn fetch_url_text(url: String) -> Result<String, String> {
    fetch_url_text_inner(&url).await
}

/// Remove HTML tags and convert to clean text.
fn strip_html_to_text(html: &str) -> String {
    let mut text = html.to_string();

    // Remove script, style, nav, footer, header blocks entirely
    for tag in &["script", "style", "nav", "footer", "header", "noscript"] {
        let block_re =
            Regex::new(&format!(r"(?is)<{}\b[^>]*>.*?</{}>", tag, tag)).unwrap();
        text = block_re.replace_all(&text, " ").to_string();
    }

    // Remove HTML comments
    let comment_re = Regex::new(r"(?s)<!--.*?-->").unwrap();
    text = comment_re.replace_all(&text, " ").to_string();

    // Convert block-level tags to newlines
    let block_tag_re = Regex::new(r"(?i)<\s*/?\s*(div|p|br|h[1-6]|li|tr|td|th|dt|dd|section|article|aside|blockquote|pre|hr)\b[^>]*\s*/?\s*>").unwrap();
    text = block_tag_re.replace_all(&text, "\n").to_string();

    // Remove all remaining HTML tags
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    text = tag_re.replace_all(&text, " ").to_string();

    // Decode common HTML entities
    text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&#x27;", "'")
        .replace("&euro;", "€")
        .replace("&#8364;", "€");

    // Decode numeric HTML entities
    let numeric_re = Regex::new(r"&#(\d+);").unwrap();
    text = numeric_re
        .replace_all(&text, |caps: &regex::Captures| {
            caps[1]
                .parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .map(|c| c.to_string())
                .unwrap_or_default()
        })
        .to_string();

    // Collapse whitespace: multiple spaces → single space, multiple newlines → double
    let spaces_re = Regex::new(r"[^\S\n]+").unwrap();
    text = spaces_re.replace_all(&text, " ").to_string();

    let newlines_re = Regex::new(r"\n{3,}").unwrap();
    text = newlines_re.replace_all(&text, "\n\n").to_string();

    text.trim().to_string()
}

// ── read_file_text ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    let path_lower = path.to_lowercase();

    if path_lower.ends_with(".pdf") {
        let bytes =
            std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;
        let text = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("Failed to extract PDF text: {e}. The file may be a scanned/image PDF."))?;
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            return Err(
                "This PDF contains no extractable text — it's likely a screenshot or scanned document. \
                 Try importing via URL instead, or paste the job description text directly."
                    .into(),
            );
        }
        Ok(trimmed)
    } else if path_lower.ends_with(".txt") || path_lower.ends_with(".md") {
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
    } else {
        Err("Unsupported file type. Please use PDF, TXT, or MD files.".into())
    }
}

// ── parse_job_text ──────────────────────────────────────────────────────────

/// Technology alias: (patterns, canonical name)
struct TechAlias {
    patterns: &'static [&'static str],
    canonical: &'static str,
}

const TECH_ALIASES: &[TechAlias] = &[
    // Frontend
    TechAlias { patterns: &["react", "reactjs", "react.js"], canonical: "React" },
    TechAlias { patterns: &["vue", "vuejs", "vue.js"], canonical: "Vue.js" },
    TechAlias { patterns: &["angular", "angularjs"], canonical: "Angular" },
    TechAlias { patterns: &["next.js", "nextjs", "next js"], canonical: "Next.js" },
    TechAlias { patterns: &["nuxt", "nuxtjs", "nuxt.js"], canonical: "Nuxt" },
    TechAlias { patterns: &["svelte", "sveltekit"], canonical: "Svelte" },
    TechAlias { patterns: &["typescript", "ts"], canonical: "TypeScript" },
    TechAlias { patterns: &["javascript", "js", "ecmascript"], canonical: "JavaScript" },
    TechAlias { patterns: &["html5", "html"], canonical: "HTML" },
    TechAlias { patterns: &["css3", "css"], canonical: "CSS" },
    TechAlias { patterns: &["tailwind", "tailwindcss"], canonical: "Tailwind CSS" },
    TechAlias { patterns: &["sass", "scss"], canonical: "SASS" },
    TechAlias { patterns: &["redux"], canonical: "Redux" },
    TechAlias { patterns: &["zustand"], canonical: "Zustand" },
    TechAlias { patterns: &["graphql", "graph ql"], canonical: "GraphQL" },
    TechAlias { patterns: &["webpack"], canonical: "Webpack" },
    TechAlias { patterns: &["vite"], canonical: "Vite" },
    TechAlias { patterns: &["jquery"], canonical: "jQuery" },
    TechAlias { patterns: &["storybook"], canonical: "Storybook" },
    TechAlias { patterns: &["cypress"], canonical: "Cypress" },
    TechAlias { patterns: &["playwright"], canonical: "Playwright" },
    TechAlias { patterns: &["jest"], canonical: "Jest" },
    TechAlias { patterns: &["vitest"], canonical: "Vitest" },
    TechAlias { patterns: &["remix"], canonical: "Remix" },
    TechAlias { patterns: &["astro"], canonical: "Astro" },
    // Backend
    TechAlias { patterns: &["node.js", "nodejs", "node js"], canonical: "Node.js" },
    TechAlias { patterns: &["express", "expressjs"], canonical: "Express" },
    TechAlias { patterns: &["nestjs", "nest.js"], canonical: "NestJS" },
    TechAlias { patterns: &["fastify"], canonical: "Fastify" },
    TechAlias { patterns: &["python"], canonical: "Python" },
    TechAlias { patterns: &["django"], canonical: "Django" },
    TechAlias { patterns: &["fastapi", "fast api"], canonical: "FastAPI" },
    TechAlias { patterns: &["flask"], canonical: "Flask" },
    TechAlias { patterns: &["java"], canonical: "Java" },
    TechAlias { patterns: &["spring boot", "springboot"], canonical: "Spring Boot" },
    TechAlias { patterns: &["spring"], canonical: "Spring" },
    TechAlias { patterns: &["kotlin"], canonical: "Kotlin" },
    TechAlias { patterns: &["golang", "go lang"], canonical: "Go" },
    TechAlias { patterns: &["rust"], canonical: "Rust" },
    TechAlias { patterns: &["ruby"], canonical: "Ruby" },
    TechAlias { patterns: &["rails", "ruby on rails"], canonical: "Rails" },
    TechAlias { patterns: &["php"], canonical: "PHP" },
    TechAlias { patterns: &["laravel"], canonical: "Laravel" },
    TechAlias { patterns: &["symfony"], canonical: "Symfony" },
    TechAlias { patterns: &[".net", "dotnet", "asp.net"], canonical: ".NET" },
    TechAlias { patterns: &["c#", "csharp"], canonical: "C#" },
    TechAlias { patterns: &["scala"], canonical: "Scala" },
    TechAlias { patterns: &["elixir"], canonical: "Elixir" },
    TechAlias { patterns: &["phoenix"], canonical: "Phoenix" },
    // Databases
    TechAlias { patterns: &["postgresql", "postgres", "psql", "pgsql"], canonical: "PostgreSQL" },
    TechAlias { patterns: &["mysql", "mariadb"], canonical: "MySQL" },
    TechAlias { patterns: &["mongodb", "mongo"], canonical: "MongoDB" },
    TechAlias { patterns: &["redis"], canonical: "Redis" },
    TechAlias { patterns: &["elasticsearch", "elastic search", "opensearch"], canonical: "Elasticsearch" },
    TechAlias { patterns: &["dynamodb", "dynamo db"], canonical: "DynamoDB" },
    TechAlias { patterns: &["cassandra"], canonical: "Cassandra" },
    TechAlias { patterns: &["sqlite"], canonical: "SQLite" },
    TechAlias { patterns: &["oracle db", "oracle database"], canonical: "Oracle" },
    TechAlias { patterns: &["sql server", "mssql"], canonical: "SQL Server" },
    TechAlias { patterns: &["sql"], canonical: "SQL" },
    TechAlias { patterns: &["nosql", "no-sql"], canonical: "NoSQL" },
    // Messaging
    TechAlias { patterns: &["kafka", "apache kafka"], canonical: "Kafka" },
    TechAlias { patterns: &["rabbitmq", "rabbit mq"], canonical: "RabbitMQ" },
    // Cloud & DevOps
    TechAlias { patterns: &["aws", "amazon web services"], canonical: "AWS" },
    TechAlias { patterns: &["azure", "microsoft azure"], canonical: "Azure" },
    TechAlias { patterns: &["gcp", "google cloud", "google cloud platform"], canonical: "GCP" },
    TechAlias { patterns: &["docker"], canonical: "Docker" },
    TechAlias { patterns: &["kubernetes", "k8s", "kube"], canonical: "Kubernetes" },
    TechAlias { patterns: &["terraform"], canonical: "Terraform" },
    TechAlias { patterns: &["ansible"], canonical: "Ansible" },
    TechAlias { patterns: &["jenkins"], canonical: "Jenkins" },
    TechAlias { patterns: &["gitlab ci", "gitlab-ci", "gitlab ci/cd"], canonical: "GitLab CI" },
    TechAlias { patterns: &["github actions"], canonical: "GitHub Actions" },
    TechAlias { patterns: &["ci/cd", "cicd"], canonical: "CI/CD" },
    TechAlias { patterns: &["linux"], canonical: "Linux" },
    TechAlias { patterns: &["nginx"], canonical: "Nginx" },
    TechAlias { patterns: &["helm"], canonical: "Helm" },
    TechAlias { patterns: &["argocd", "argo cd"], canonical: "ArgoCD" },
    TechAlias { patterns: &["prometheus"], canonical: "Prometheus" },
    TechAlias { patterns: &["grafana"], canonical: "Grafana" },
    TechAlias { patterns: &["datadog"], canonical: "Datadog" },
    TechAlias { patterns: &["pulumi"], canonical: "Pulumi" },
    // Mobile
    TechAlias { patterns: &["react native", "react-native"], canonical: "React Native" },
    TechAlias { patterns: &["flutter"], canonical: "Flutter" },
    TechAlias { patterns: &["ios"], canonical: "iOS" },
    TechAlias { patterns: &["android"], canonical: "Android" },
    TechAlias { patterns: &["swift"], canonical: "Swift" },
    TechAlias { patterns: &["objective-c", "objectivec", "obj-c"], canonical: "Objective-C" },
    // AI/ML
    TechAlias { patterns: &["machine learning"], canonical: "Machine Learning" },
    TechAlias { patterns: &["tensorflow", "tensor flow"], canonical: "TensorFlow" },
    TechAlias { patterns: &["pytorch", "py torch"], canonical: "PyTorch" },
    TechAlias { patterns: &["llm", "large language model"], canonical: "LLM" },
    TechAlias { patterns: &["nlp", "natural language processing"], canonical: "NLP" },
    TechAlias { patterns: &["deep learning"], canonical: "Deep Learning" },
    TechAlias { patterns: &["scikit-learn", "sklearn"], canonical: "scikit-learn" },
    TechAlias { patterns: &["pandas"], canonical: "Pandas" },
    TechAlias { patterns: &["numpy"], canonical: "NumPy" },
    // Data
    TechAlias { patterns: &["spark", "apache spark"], canonical: "Spark" },
    TechAlias { patterns: &["hadoop"], canonical: "Hadoop" },
    TechAlias { patterns: &["airflow", "apache airflow"], canonical: "Airflow" },
    TechAlias { patterns: &["dbt"], canonical: "dbt" },
    TechAlias { patterns: &["snowflake"], canonical: "Snowflake" },
    TechAlias { patterns: &["bigquery", "big query"], canonical: "BigQuery" },
    // Other
    TechAlias { patterns: &["git"], canonical: "Git" },
    TechAlias { patterns: &["rest", "restful", "rest api"], canonical: "REST" },
    TechAlias { patterns: &["grpc", "g-rpc"], canonical: "gRPC" },
    TechAlias { patterns: &["microservices", "micro-services"], canonical: "Microservices" },
    TechAlias { patterns: &["agile", "scrum"], canonical: "Agile" },
    TechAlias { patterns: &["jira"], canonical: "Jira" },
    TechAlias { patterns: &["figma"], canonical: "Figma" },
    TechAlias { patterns: &["rabbitmq"], canonical: "RabbitMQ" },
    TechAlias { patterns: &["solidity"], canonical: "Solidity" },
    TechAlias { patterns: &["blockchain"], canonical: "Blockchain" },
    TechAlias { patterns: &["web3"], canonical: "Web3" },
    TechAlias { patterns: &["tauri"], canonical: "Tauri" },
    TechAlias { patterns: &["electron"], canonical: "Electron" },
];

/// Domain keyword → canonical domain name
const DOMAIN_MAPPINGS: &[(&[&str], &str)] = &[
    (&["banque", "banking", "bancaire"], "Banking"),
    (&["fintech", "fin-tech"], "Fintech"),
    (&["assurance", "insurance"], "Insurance"),
    (&["e-commerce", "ecommerce", "commerce en ligne"], "E-commerce"),
    (&["santé", "sante", "health", "healthcare", "e-santé", "e-sante"], "Healthcare"),
    (&["telecom", "télécommunication", "telecommunication"], "Telecom"),
    (&["retail", "distribution"], "Retail"),
    (&["logistique", "logistics", "supply chain"], "Logistics"),
    (&["énergie", "energie", "energy"], "Energy"),
    (&["média", "media", "médias", "medias"], "Media"),
    (&["éducation", "education", "edtech", "ed-tech"], "Education"),
    (&["immobilier", "real estate", "proptech"], "Real Estate"),
    (&["automobile", "automotive"], "Automotive"),
    (&["aéronautique", "aeronautique", "aerospace", "aviation"], "Aerospace"),
    (&["défense", "defense", "military"], "Defense"),
    (&["luxe", "luxury"], "Luxury"),
    (&["saas"], "SaaS"),
    (&["iot", "objets connectés", "internet of things"], "IoT"),
    (&["cybersécurité", "cybersecurite", "cybersecurity", "cyber"], "Cybersecurity"),
    (&["gaming", "jeu vidéo", "jeux vidéo", "game"], "Gaming"),
];

/// French cities/regions for location detection
const LOCATIONS: &[&str] = &[
    "Paris",
    "Lyon",
    "Marseille",
    "Toulouse",
    "Nice",
    "Nantes",
    "Strasbourg",
    "Montpellier",
    "Bordeaux",
    "Lille",
    "Rennes",
    "Reims",
    "Le Havre",
    "Grenoble",
    "Rouen",
    "Toulon",
    "Clermont-Ferrand",
    "Aix-en-Provence",
    "Sophia Antipolis",
    "La Défense",
    "Île-de-France",
    "Ile-de-France",
    "IDF",
];

#[tauri::command]
pub fn parse_job_text(text: String) -> Result<ParsedJobDescription, String> {
    let text_lower = text.to_lowercase();

    let technologies = extract_technologies(&text_lower);
    let rate = extract_rate(&text);
    let location = extract_location(&text);
    let remote_policy = extract_remote_policy(&text_lower);
    let title = extract_title(&text);
    let client = extract_client(&text);
    let duration = extract_duration(&text_lower);
    let start_date = extract_start_date(&text_lower);
    let (contact_name, contact_info) = extract_contact(&text);
    let domains = extract_domains(&text_lower);
    let description = extract_description(&text);

    Ok(ParsedJobDescription {
        title,
        client,
        technologies: if technologies.is_empty() {
            None
        } else {
            Some(technologies)
        },
        rate,
        location,
        remote_policy,
        description,
        requirements: None,
        domains: if domains.is_empty() {
            None
        } else {
            Some(domains)
        },
        start_date,
        duration,
        contact_name,
        contact_info,
    })
}

fn extract_technologies(text_lower: &str) -> Vec<String> {
    let mut found: HashSet<String> = HashSet::new();

    for alias in TECH_ALIASES {
        if found.contains(alias.canonical) {
            continue;
        }
        for pattern in alias.patterns {
            // Build word-boundary regex for each pattern
            let escaped = regex::escape(pattern);
            let re_str = format!(r"(?i)\b{}\b", escaped);
            if let Ok(re) = Regex::new(&re_str) {
                if re.is_match(text_lower) {
                    found.insert(alias.canonical.to_string());
                    break;
                }
            }
        }
    }

    // Deduplicate: if we have "Spring Boot", remove standalone "Spring"
    if found.contains("Spring Boot") {
        found.remove("Spring");
    }
    if found.contains("React Native") {
        found.remove("React");
    }
    if found.contains("Ruby on Rails") || found.contains("Rails") {
        // Keep both Ruby and Rails as they're distinct
    }

    let mut result: Vec<String> = found.into_iter().collect();
    result.sort();
    result
}

fn extract_rate(text: &str) -> Option<i64> {
    // Order matters: try more specific patterns first
    let patterns: &[(&str, RateType)] = &[
        // Annual salary: XXXk€/an or XXX k€ annuel
        (r"(\d{2,3})\s*k\s*€?\s*(?:/\s*an|annuel|brut|net|par\s*an)", RateType::Annual),
        // Hourly: XXX€/h or XXX €/heure
        (r"(\d{2,4})\s*€\s*/\s*(?:h|heure|hour)", RateType::Hourly),
        // Range with /jour or /j: 500-700€/j
        (r"(\d{3,4})\s*[-–à]\s*(\d{3,4})\s*€\s*/\s*(?:jour|day|j)\b", RateType::DailyRange),
        // TJM range: TJM 500-700
        (r"(?i)tjm\s*:?\s*(\d{3,4})\s*[-–à]\s*(\d{3,4})", RateType::DailyRange),
        // XXX€/jour, XXX€/day, XXX€/j
        (r"(\d{3,4})\s*€\s*/\s*(?:jour|day|j)\b", RateType::Daily),
        // €XXX/jour
        (r"€\s*(\d{3,4})\s*/\s*(?:jour|day|j)\b", RateType::Daily),
        // TJM: XXX or TJM XXX€
        (r"(?i)tjm\s*:?\s*(\d{3,4})\s*€?", RateType::Daily),
        // Range: 500-700€
        (r"(\d{3,4})\s*[-–à]\s*(\d{3,4})\s*€", RateType::DailyRange),
        // €XXX-YYY
        (r"€\s*(\d{3,4})\s*[-–à]\s*(\d{3,4})", RateType::DailyRange),
    ];

    for (pattern, rate_type) in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(caps) = re.captures(text) {
                return match rate_type {
                    RateType::Daily => caps.get(1).and_then(|m| m.as_str().parse::<i64>().ok()),
                    RateType::DailyRange => {
                        let low = caps.get(1).and_then(|m| m.as_str().parse::<i64>().ok())?;
                        let high = caps.get(2).and_then(|m| m.as_str().parse::<i64>().ok())?;
                        Some((low + high) / 2)
                    }
                    RateType::Hourly => {
                        caps.get(1)
                            .and_then(|m| m.as_str().parse::<i64>().ok())
                            .map(|h| h * 7) // 7h/day
                    }
                    RateType::Annual => {
                        caps.get(1)
                            .and_then(|m| m.as_str().parse::<i64>().ok())
                            .map(|k| k * 1000 / 218) // 218 working days/year
                    }
                };
            }
        }
    }
    None
}

enum RateType {
    Daily,
    DailyRange,
    Hourly,
    Annual,
}

fn extract_location(text: &str) -> Option<String> {
    // First try prefix-based: "Lieu: Paris", "Localisation: Lyon", etc.
    let prefix_re = Regex::new(
        r"(?im)(?:lieu|localisation|location|ville|place|site)\s*:?\s*(.+?)(?:\n|$)"
    )
    .ok()?;
    if let Some(caps) = prefix_re.captures(text) {
        let value = caps[1].trim();
        // Check if any known location appears in the value
        for loc in LOCATIONS {
            let loc_re = Regex::new(&format!(r"(?i)\b{}\b", regex::escape(loc))).ok()?;
            if loc_re.is_match(value) {
                return Some(loc.to_string());
            }
        }
        // Return the raw value if it's short enough (likely a location)
        if !value.is_empty() && value.len() < 50 {
            return Some(value.to_string());
        }
    }

    // Fallback: scan for known locations anywhere in text
    for loc in LOCATIONS {
        let loc_re = Regex::new(&format!(r"(?i)\b{}\b", regex::escape(loc))).ok()?;
        if loc_re.is_match(text) {
            return Some(loc.to_string());
        }
    }

    None
}

fn extract_remote_policy(text_lower: &str) -> Option<String> {
    // Check full-remote first
    let full_remote = Regex::new(
        r"(?i)(?:full\s*remote|100\s*%?\s*(?:remote|télétravail|teletravail)|télétravail\s+(?:complet|total|intégral))"
    ).ok()?;
    if full_remote.is_match(text_lower) {
        return Some("remote".to_string());
    }

    // Check hybrid
    let hybrid = Regex::new(r"(?i)(?:hybride|hybrid|(?:2|3)\s*j(?:ours?)?\s*/?\s*semaine\s*(?:remote|télétravail|teletravail|présentiel|presentiel))").ok()?;
    if hybrid.is_match(text_lower) {
        return Some("hybrid".to_string());
    }

    // Check on-site
    let onsite = Regex::new(r"(?i)(?:présentiel|presentiel|sur\s*site|on[\s-]?site|pas\s+de\s+(?:remote|télétravail))").ok()?;
    if onsite.is_match(text_lower) {
        return Some("on-site".to_string());
    }

    // Generic remote/télétravail (without "no" qualifier)
    let remote = Regex::new(r"(?i)(?:remote|télétravail|teletravail)").ok()?;
    let no_remote = Regex::new(r"(?i)(?:no\s+remote|pas\s+de\s+(?:remote|télétravail))").ok()?;
    if remote.is_match(text_lower) && !no_remote.is_match(text_lower) {
        return Some("remote".to_string());
    }

    None
}

fn extract_title(text: &str) -> Option<String> {
    // Try prefix-based patterns first
    let prefix_re = Regex::new(
        r"(?im)(?:poste|mission|role|rôle|intitulé|titre|job\s*title|position)\s*:?\s*(.+?)(?:\n|$)"
    ).ok()?;
    if let Some(caps) = prefix_re.captures(text) {
        let value = caps[1].trim();
        if !value.is_empty() && value.len() < 120 {
            return Some(value.to_string());
        }
    }

    // Fallback: first non-empty line that looks like a title (no colon, reasonable length)
    let label_re = Regex::new(r"^[A-ZÀ-Ÿa-z]+\s*:").ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.len() < 5 {
            continue;
        }
        // Skip lines that are labels ("Client:", "Lieu:", etc.)
        if label_re.is_match(trimmed) {
            continue;
        }
        if trimmed.len() <= 120 {
            return Some(trimmed.to_string());
        }
    }

    None
}

fn extract_client(text: &str) -> Option<String> {
    let patterns: &[&str] = &[
        r"(?im)(?:client|entreprise|company|société|societe|employeur)\s*:?\s*(.+?)(?:\n|$)",
        r"(?im)pour\s+(?:notre\s+)?client\s+(.+?)(?:\n|,|$)",
        r"(?im)(?:chez|at|for)\s+(.+?)(?:\n|,|$)",
    ];

    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            if let Some(caps) = re.captures(text) {
                let value = caps[1].trim().to_string();
                if !value.is_empty() && value.len() < 80 {
                    return Some(value);
                }
            }
        }
    }

    None
}

fn extract_duration(text_lower: &str) -> Option<String> {
    let patterns: &[&str] = &[
        r"(?i)(?:durée|duree|duration)\s*:?\s*(\d+)\s*(mois|months?|ans?|years?|semaines?|weeks?)",
        r"(?i)(\d+)\s*(mois|months?)\s*(?:renouvelable|renewable)?",
    ];

    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            if let Some(caps) = re.captures(text_lower) {
                let num = &caps[1];
                let unit = &caps[2];
                let unit_normalized = if unit.starts_with("mois") || unit.starts_with("month") {
                    "mois"
                } else if unit.starts_with("an") || unit.starts_with("year") {
                    "ans"
                } else {
                    "semaines"
                };
                return Some(format!("{} {}", num, unit_normalized));
            }
        }
    }

    None
}

fn extract_start_date(text_lower: &str) -> Option<String> {
    // Check for ASAP / immédiat
    let asap_re = Regex::new(r"(?i)(?:asap|immédiat|immediat|dès que possible|des que possible|au plus tôt|au plus tot)").ok()?;
    if asap_re.is_match(text_lower) {
        return Some("ASAP".to_string());
    }

    // Prefix-based: "Début: janvier 2025"
    let prefix_re = Regex::new(
        r"(?im)(?:début|debut|démarrage|demarrage|start\s*date|date\s*de\s*début)\s*:?\s*(.+?)(?:\n|$)"
    ).ok()?;
    if let Some(caps) = prefix_re.captures(text_lower) {
        let value = caps[1].trim();
        if !value.is_empty() && value.len() < 50 {
            return Some(value.to_string());
        }
    }

    None
}

fn extract_contact(text: &str) -> (Option<String>, Option<String>) {
    let mut contact_info = None;

    // Email
    let email_re = Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").ok();
    if let Some(ref re) = email_re {
        if let Some(m) = re.find(text) {
            contact_info = Some(m.as_str().to_string());
        }
    }

    // Phone (French formats)
    if contact_info.is_none() {
        let phone_re = Regex::new(r"(?:(?:\+33|0)\s*[1-9])(?:[\s.\-]?\d{2}){4}").ok();
        if let Some(ref re) = phone_re {
            if let Some(m) = re.find(text) {
                contact_info = Some(m.as_str().to_string());
            }
        }
    }

    // Contact name via prefix
    let mut contact_name = None;
    let name_re = Regex::new(
        r"(?im)(?:contact|recruteur|recruiter|consultant)\s*:?\s*(.+?)(?:\n|$)"
    ).ok();
    if let Some(ref re) = name_re {
        if let Some(caps) = re.captures(text) {
            let value = caps[1].trim();
            if !value.is_empty() && value.len() < 60 {
                contact_name = Some(value.to_string());
            }
        }
    }

    (contact_name, contact_info)
}

fn extract_domains(text_lower: &str) -> Vec<String> {
    let mut found: HashSet<String> = HashSet::new();

    for (keywords, canonical) in DOMAIN_MAPPINGS {
        for kw in *keywords {
            let re_str = format!(r"(?i)\b{}\b", regex::escape(kw));
            if let Ok(re) = Regex::new(&re_str) {
                if re.is_match(text_lower) {
                    found.insert(canonical.to_string());
                    break;
                }
            }
        }
    }

    let mut result: Vec<String> = found.into_iter().collect();
    result.sort();
    result
}

fn extract_description(text: &str) -> Option<String> {
    // Try to find description after common headers
    let desc_re = Regex::new(
        r"(?im)(?:description|descriptif|contexte|context|about\s*(?:the\s*)?(?:role|mission|job))\s*:?\s*\n((?:.+\n?){1,5})"
    ).ok()?;
    if let Some(caps) = desc_re.captures(text) {
        let value = caps[1].trim();
        if !value.is_empty() && value.len() > 20 {
            return Some(value.to_string());
        }
    }

    // Fallback: take first 2-3 meaningful paragraphs (skip very short lines)
    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if current.len() > 30 {
                paragraphs.push(current.clone());
                if paragraphs.len() >= 3 {
                    break;
                }
            }
            current.clear();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(trimmed);
        }
    }
    if current.len() > 30 && paragraphs.len() < 3 {
        paragraphs.push(current);
    }

    if paragraphs.is_empty() {
        None
    } else {
        Some(paragraphs.join("\n\n"))
    }
}

// ── parse_profile_text ──────────────────────────────────────────────────────

/// All known LinkedIn PDF section headers — both sidebar and main content.
/// Sidebar headers act as boundaries so sidebar content doesn't leak into
/// main content parsing.
const PROFILE_SECTION_HEADERS: &[&str] = &[
    // Sidebar (French / English)
    "Coordonnées",
    "Contact",
    "Principales compétences",
    "Top Skills",
    "Langues",
    "Languages",
    "Certifications",
    "Licenses & Certifications",
    "Licences et certifications",
    // Main content (French / English)
    "Résumé",
    "Summary",
    "À propos",
    "A propos",
    "About",
    "Expérience",
    "Experience",
    "Formation",
    "Education",
    "Compétences",
    "Skills",
    "Bénévolat",
    "Volunteering",
    "Projets",
    "Projects",
    "Publications",
    "Honors & Awards",
    "Recommandations",
    "Recommendations",
];

/// Split text into named sections based on LinkedIn PDF headers.
/// Returns Vec<(header, body)>. The first entry has header "" for content before any header.
fn split_into_sections(text: &str) -> Vec<(String, String)> {
    let mut sections: Vec<(String, String)> = Vec::new();
    let mut current_header = String::new();
    let mut current_body = String::new();

    for line in text.lines() {
        let trimmed = line.trim();
        // Check if this line is a section header
        let is_header = PROFILE_SECTION_HEADERS.iter().any(|h| {
            trimmed.eq_ignore_ascii_case(h)
        });

        if is_header {
            // Save previous section
            sections.push((current_header.clone(), current_body.trim().to_string()));
            current_header = trimmed.to_string();
            current_body.clear();
        } else {
            current_body.push_str(trimmed);
            current_body.push('\n');
        }
    }
    // Save last section
    sections.push((current_header, current_body.trim().to_string()));

    sections
}

fn find_section_body(sections: &[(String, String)], headers: &[&str]) -> Option<String> {
    for (header, body) in sections {
        for h in headers {
            if header.eq_ignore_ascii_case(h) && !body.is_empty() {
                return Some(body.clone());
            }
        }
    }
    None
}

/// Extract name by scanning backwards from "Résumé"/"Expérience" section.
/// In LinkedIn PDFs the main content has: Name \n Title \n Location \n [Résumé section].
/// The name ends up inside the last sidebar section body (e.g., "Certifications")
/// because there's no header between the sidebar end and the main content start.
fn extract_profile_name_from_sections(sections: &[(String, String)]) -> Option<String> {
    // Strategy: find the section body that immediately precedes "Résumé" or "Expérience".
    // The name/title/location block sits at the tail of that body.
    let target_headers = ["Résumé", "Summary", "À propos", "A propos", "About", "Expérience", "Experience"];
    let mut preceding_body: Option<&str> = None;
    for i in 1..sections.len() {
        let header_lower = sections[i].0.to_lowercase();
        if target_headers.iter().any(|h| h.to_lowercase() == header_lower) {
            preceding_body = Some(&sections[i - 1].1);
            break;
        }
    }

    let body = preceding_body?;
    // The last 3 meaningful lines of this body are: Name, Title, Location
    // Location line matches "City, Region, Country" or just "City, Country"
    let lines: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() >= 3 {
        // The name is 3 lines before the end (before title and location)
        let name = lines[lines.len() - 3];
        // Validate: name should be short, not contain "Page X of Y", not be a URL
        if name.len() < 60 && !name.contains("Page ") && !name.contains("linkedin.com")
            && !name.contains('@') && !name.contains("http")
        {
            return Some(name.to_string());
        }
    } else if !lines.is_empty() {
        // Fallback: just take the last line
        let name = lines[lines.len() - 1];
        if name.len() < 60 {
            return Some(name.to_string());
        }
    }
    None
}

/// Extract title (headline) — line after name, before location.
fn extract_profile_title_from_sections(sections: &[(String, String)]) -> Option<String> {
    let target_headers = ["Résumé", "Summary", "À propos", "A propos", "About", "Expérience", "Experience"];
    let mut preceding_body: Option<&str> = None;
    for i in 1..sections.len() {
        let header_lower = sections[i].0.to_lowercase();
        if target_headers.iter().any(|h| h.to_lowercase() == header_lower) {
            preceding_body = Some(&sections[i - 1].1);
            break;
        }
    }

    let body = preceding_body?;
    let lines: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() >= 3 {
        let title = lines[lines.len() - 2];
        if title.len() < 120 && !title.contains("Page ") {
            return Some(title.to_string());
        }
    }
    None
}

/// Extract location from the line right before the first main section.
fn extract_profile_location(sections: &[(String, String)]) -> Option<String> {
    let target_headers = ["Résumé", "Summary", "À propos", "A propos", "About", "Expérience", "Experience"];
    let mut preceding_body: Option<&str> = None;
    for i in 1..sections.len() {
        let header_lower = sections[i].0.to_lowercase();
        if target_headers.iter().any(|h| h.to_lowercase() == header_lower) {
            preceding_body = Some(&sections[i - 1].1);
            break;
        }
    }

    let body = preceding_body?;
    let lines: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() >= 3 {
        let loc_line = lines[lines.len() - 1];
        // Location line: "City, Region, Country" or just a city name
        if loc_line.len() < 80 && !loc_line.contains("Page ") {
            // Try to extract a known location from this line
            for loc in LOCATIONS {
                let loc_re = Regex::new(&format!(r"(?i)\b{}\b", regex::escape(loc))).ok()?;
                if loc_re.is_match(loc_line) {
                    return Some(loc.to_string());
                }
            }
            // Return the raw location line if it looks like "City, Region, Country"
            if loc_line.contains(',') {
                return Some(loc_line.to_string());
            }
        }
    }

    // Fallback: scan known locations in the full text of the first few sections
    None
}

fn extract_bio(sections: &[(String, String)]) -> Option<String> {
    let body = find_section_body(sections, &["Résumé", "Summary", "À propos", "A propos", "About"])?;
    // Clean up: collapse multiple blank lines from PDF extraction into single newlines
    let cleaned: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    let result = cleaned.join("\n");
    if result.is_empty() { None } else { Some(result) }
}

fn extract_years_of_experience(sections: &[(String, String)], full_text: &str) -> Option<i64> {
    // Try explicit pattern: "X ans d'expérience" or "X years of experience"
    let pattern_re = Regex::new(
        r"(?i)(\d{1,2})\s*(?:ans?|years?)\s*(?:d'expérience|d'experience|of experience)"
    ).ok()?;
    if let Some(caps) = pattern_re.captures(full_text) {
        return caps[1].parse::<i64>().ok();
    }

    // Compute year span (earliest start to latest end) — avoids double-counting overlapping jobs
    let exp_body = find_section_body(sections, &["Expérience", "Experience"])?;
    let year_re = Regex::new(r"\b((?:19|20)\d{2})\b").ok()?;
    let current_year = chrono::Utc::now().format("%Y").to_string().parse::<i64>().unwrap_or(2026);

    let mut min_year: Option<i64> = None;
    let mut max_year: Option<i64> = None;

    // Check if "Present"/"présent" appears → max is current year
    let present_re = Regex::new(r"(?i)\b(?:présent|present|actuel|current|now)\b").ok()?;
    if present_re.is_match(&exp_body) {
        max_year = Some(current_year);
    }

    for caps in year_re.captures_iter(&exp_body) {
        if let Ok(year) = caps[1].parse::<i64>() {
            if year >= 1990 && year <= current_year + 1 {
                min_year = Some(min_year.map_or(year, |m: i64| m.min(year)));
                max_year = Some(max_year.map_or(year, |m: i64| m.max(year)));
            }
        }
    }

    match (min_year, max_year) {
        (Some(min), Some(max)) if max > min => Some(max - min),
        _ => None,
    }
}

fn extract_profile_languages(sections: &[(String, String)]) -> Option<Vec<String>> {
    let body = find_section_body(sections, &["Langues", "Languages"])?;
    let mut langs = Vec::new();
    // Strip proficiency in parentheses: "Français (Native or Bilingual)" → "Français"
    let paren_re = Regex::new(r"\s*\(.*\)\s*$").ok()?;
    // Strip proficiency after dash/colon
    let proficiency_re = Regex::new(
        r"(?i)\s*[-–:]\s*(?:natif|native|bilingue|bilingual|courant|fluent|professionnel|professional|intermédiaire|intermediate|élémentaire|elementary|notions|basique|basic|compétence|full professional|limited working|professional working).*$"
    ).ok()?;

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.len() > 80 {
            continue;
        }
        // Strip parenthesized proficiency first, then dash-based
        let lang = paren_re.replace(trimmed, "");
        let lang = proficiency_re.replace(&lang, "").trim().to_string();
        if !lang.is_empty() && !langs.contains(&lang) {
            langs.push(lang);
        }
    }

    if langs.is_empty() { None } else { Some(langs) }
}

fn extract_education_entries(sections: &[(String, String)]) -> Option<Vec<EducationEntry>> {
    let body = find_section_body(sections, &["Formation", "Education"])?;

    // LinkedIn PDF extraction puts empty lines between every real line.
    // First, collapse: strip empty lines and join multi-line entries.
    // The pattern is: School \n Detail (degree, field · (years))
    // Detail lines contain "·" and/or year ranges.
    let page_re = Regex::new(r"(?i)^page\s+\d+\s+of\s+\d+$").ok()?;
    let year_range_re = Regex::new(r"\(?\s*(\d{4})\s*[-–]\s*(\d{4})?\s*\)?").ok()?;
    let single_year_re = Regex::new(r"\((\d{4})\)").ok()?;
    let dot_sep_re = Regex::new(r"\s*·\s*").ok()?;

    // Filter non-empty, non-page lines
    let meaningful: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !page_re.is_match(l))
        .collect();

    // A "detail" line contains "·" or a year range like "(2013 - 2015)" or "(2005)"
    let is_detail = |line: &str| -> bool {
        line.contains('·') || year_range_re.is_match(line) || single_year_re.is_match(line)
            || line.starts_with('-')
    };

    // Group into (school, detail_text) pairs.
    // School = line that is NOT a detail line. Detail = subsequent detail lines joined.
    // In LinkedIn PDFs, degree descriptions can span multiple non-detail lines
    // before the "· (YYYY - YYYY)" line, e.g.:
    //   ASTON                               ← school
    //   Certification Développeur...         ← looks like school but is degree text
    //   informatique · (2015 - 2016)         ← detail with year
    // Strategy: a non-detail line is only a school if its subsequent lines eventually
    // lead to detail lines. If not, it's a continuation of the previous entry.
    let mut entries: Vec<(String, String)> = Vec::new();
    let mut i = 0;
    while i < meaningful.len() {
        let line = meaningful[i];

        if is_detail(line) {
            // Detail line — attach to the last entry
            if let Some(last) = entries.last_mut() {
                let detail: &mut String = &mut last.1;
                if !detail.is_empty() {
                    detail.push(' ');
                }
                detail.push_str(line);
            }
            i += 1;
            continue;
        }

        // Non-detail line: is this a school name or a continuation of the previous entry?
        // Look ahead: if the NEXT non-detail line exists before a detail line,
        // then this might be a multi-line degree text (not a school).
        // Heuristic: if this line has no detail after it and is followed by another
        // non-detail line that eventually leads to a detail, merge them.

        // Simpler heuristic: collect consecutive non-detail lines. The FIRST one
        // is the school; the rest are degree text if they eventually end with a detail line.
        let start = i;
        let mut non_detail_lines = Vec::new();
        while i < meaningful.len() && !is_detail(meaningful[i]) {
            non_detail_lines.push(meaningful[i]);
            i += 1;
        }

        // Collect subsequent detail lines
        let mut detail_text = String::new();
        while i < meaningful.len() && is_detail(meaningful[i]) {
            if !detail_text.is_empty() {
                detail_text.push(' ');
            }
            detail_text.push_str(meaningful[i]);
            i += 1;
        }

        if non_detail_lines.len() == 1 {
            // Single non-detail line followed by detail(s) or nothing → school + detail
            entries.push((non_detail_lines[0].to_string(), detail_text));
        } else if non_detail_lines.len() >= 2 {
            // Multiple non-detail lines: first is school, rest are degree description
            let school = non_detail_lines[0].to_string();
            let degree_parts: Vec<&str> = non_detail_lines[1..].to_vec();
            // Merge degree parts + detail lines into one detail text
            let mut full_detail = degree_parts.join(" ");
            if !detail_text.is_empty() {
                if !full_detail.is_empty() {
                    full_detail.push(' ');
                }
                full_detail.push_str(&detail_text);
            }
            entries.push((school, full_detail));
        }
        let _ = start; // suppress unused warning
    }

    // Parse each (school, detail_text) into EducationEntry
    let mut result = Vec::new();
    for (school, detail_text) in entries {
        if school.len() <= 1 || school.len() >= 120 {
            continue;
        }

        let mut degree: Option<String> = None;
        let mut field: Option<String> = None;
        let mut end_year: Option<String> = None;

        if !detail_text.is_empty() {
            // Extract year range
            if let Some(caps) = year_range_re.captures(&detail_text) {
                end_year = caps.get(2)
                    .or(caps.get(1))
                    .map(|m| m.as_str().to_string());
            } else if let Some(caps) = single_year_re.captures(&detail_text) {
                end_year = Some(caps[1].to_string());
            }

            // Remove year range and "·" to get degree + field
            let cleaned = year_range_re.replace_all(&detail_text, "");
            let cleaned = single_year_re.replace_all(&cleaned, "");
            let cleaned = cleaned.trim().to_string();

            if !cleaned.is_empty() {
                // Split on "·" first
                let parts: Vec<&str> = dot_sep_re.split(&cleaned).collect();
                let degree_field = parts[0].trim().trim_end_matches(',').trim();

                // The part before "·" may be "Degree, Field" or just "Degree"
                if !degree_field.is_empty() {
                    if let Some(comma_idx) = degree_field.find(',') {
                        let d = degree_field[..comma_idx].trim();
                        let f = degree_field[comma_idx + 1..].trim();
                        if !d.is_empty() { degree = Some(d.to_string()); }
                        if !f.is_empty() { field = Some(f.to_string()); }
                    } else {
                        degree = Some(degree_field.to_string());
                    }
                }

                // If there's a part after "·", it's the field
                if parts.len() >= 2 && field.is_none() {
                    let f = parts[1..].join(" ").trim().to_string();
                    // Remove any leftover year artifacts
                    let f = f.trim_matches(|c: char| c == '(' || c == ')' || c == ' ').to_string();
                    if !f.is_empty() {
                        field = Some(f);
                    }
                }
            }
        }

        result.push(EducationEntry { school, degree, field, end_year });
    }

    if result.is_empty() { None } else { Some(result) }
}

/// Extract domains with context awareness — avoid false positives from location names
/// and hobby mentions.
fn extract_profile_domains(text_lower: &str) -> Vec<String> {
    let mut domains = extract_domains(text_lower);

    // "La Défense" is a business district, not the Defense domain
    let la_defense_re = Regex::new(r"(?i)\bla\s+défense\b").ok();
    if let Some(ref re) = la_defense_re {
        if re.is_match(text_lower) {
            // Only keep "Defense" if it also appears outside "La Défense" context
            let without = re.replace_all(text_lower, "");
            let defense_re = Regex::new(r"(?i)\b(?:défense|defense)\b").ok();
            if let Some(ref dre) = defense_re {
                if !dre.is_match(&without) {
                    domains.retain(|d| d != "Defense");
                }
            }
        }
    }

    // "jeu vidéo" in a bio/hobby context shouldn't trigger Gaming — only keep if
    // it appears in an experience/job description context
    // Heuristic: remove Gaming if it only appears near hobby words
    if domains.contains(&"Gaming".to_string()) {
        let gaming_context_re = Regex::new(
            r"(?i)(?:studio|game\s*dev|unity|unreal|jeux?\s*vidéo\s*(?:studio|développ|develop|programm))"
        ).ok();
        if let Some(ref re) = gaming_context_re {
            if !re.is_match(text_lower) {
                domains.retain(|d| d != "Gaming");
            }
        }
    }

    // "automobile"/"automotive" in "parc automobile" context is not Automotive domain
    if domains.contains(&"Automotive".to_string()) {
        let auto_context_re = Regex::new(
            r"(?i)(?:industrie\s+automobile|constructeur|automotive|véhicule|vehicule)"
        ).ok();
        if let Some(ref re) = auto_context_re {
            if !re.is_match(text_lower) {
                domains.retain(|d| d != "Automotive");
            }
        }
    }

    domains
}

/// Extract missions/positions from the "Expérience"/"Experience" section.
///
/// LinkedIn PDF format per position:
///   Company Name
///   Job Title
///   date_start - date_end (duration)
///   [Optional: Location line]
///   [Optional: Description paragraphs]
///
/// Date lines match patterns like:
///   "mars 2020 - Present (6 ans 1 mois)"
///   "juin 2023 - décembre 2023 (7 mois)"
fn extract_missions(sections: &[(String, String)]) -> Option<Vec<ParsedMission>> {
    let body = find_section_body(sections, &["Expérience", "Experience"])?;

    // Regex for date lines: "month year - month year (duration)" or "month year - Present (...)"
    let date_re = Regex::new(
        r"(?i)^([a-zéûôàâ]+\s+\d{4})\s*-\s*(.+?)\s*\(.*\)\s*$"
    ).ok()?;

    // Page marker to filter out
    let page_re = Regex::new(r"(?i)^Page\s+\d+\s+of\s+\d+$").ok()?;

    // Filter out empty lines and page markers
    let lines: Vec<&str> = body.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !page_re.is_match(l))
        .collect();

    let address_re = Regex::new(r"^\d+\s+rue\s").ok()?;

    let mut missions: Vec<ParsedMission> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        // Look for a date line — it identifies a position.
        // The company is 2 lines before, the title is 1 line before.
        if let Some(caps) = date_re.captures(lines[i]) {
            if i >= 2 {
                let client = lines[i - 2].to_string();
                let title = lines[i - 1].to_string();
                let start_raw = caps[1].to_string();
                let end_raw = caps[2].trim().to_string();

                let start_date = parse_french_date(&start_raw);
                let end_date = if end_raw.to_lowercase().contains("present")
                    || end_raw.to_lowercase().contains("présent")
                    || end_raw.to_lowercase().contains("actuel")
                {
                    None
                } else {
                    parse_french_date(&end_raw)
                };

                // Collect description lines: everything after the date line until the next
                // position header (detected by the next date line's company, i.e. 2 lines
                // before the next date line).
                let mut desc_lines: Vec<&str> = Vec::new();
                let mut j = i + 1;

                // Find the index of the next date line
                let next_date_idx = (j..lines.len()).find(|&k| date_re.is_match(lines[k]));
                // Description runs until 2 lines before next date, or end
                let desc_end = match next_date_idx {
                    Some(k) if k >= 2 => k - 2,
                    Some(k) => k,
                    None => lines.len(),
                };

                while j < desc_end {
                    desc_lines.push(lines[j]);
                    j += 1;
                }

                // First desc line might be a location or address — skip it
                if !desc_lines.is_empty() {
                    let first = desc_lines[0].to_lowercase();
                    let looks_like_location =
                        first.contains("france")
                        || first.contains("île-de-france")
                        || first.contains("ile de france")
                        || first.contains("remote")
                        // Short line that's just a city name or address
                        || (desc_lines[0].len() < 50 && !desc_lines[0].contains('-') && (
                            first.starts_with("paris")
                            || first.contains("la défense")
                            || first.contains("lyon")
                            || first.contains("marseille")
                            || first.contains("toulouse")
                            || first.contains("nantes")
                            || first.contains("bordeaux")
                            || first.contains("lille")
                            || address_re.is_match(&first)
                        ));
                    if looks_like_location {
                        desc_lines.remove(0);
                    }
                }

                let description = if desc_lines.is_empty() {
                    None
                } else {
                    Some(desc_lines.join("\n"))
                };

                missions.push(ParsedMission {
                    client,
                    title,
                    description,
                    start_date,
                    end_date,
                });
            }
            i += 1;
        } else {
            i += 1;
        }
    }

    if missions.is_empty() { None } else { Some(missions) }
}

/// Parse a French date like "mars 2020" or "décembre 2023" into "YYYY-MM-DD".
fn parse_french_date(s: &str) -> Option<String> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() != 2 {
        return None;
    }
    let month = match parts[0].to_lowercase().as_str() {
        "janvier" | "january" => "01",
        "février" | "february" => "02",
        "mars" | "march" => "03",
        "avril" | "april" => "04",
        "mai" | "may" => "05",
        "juin" | "june" => "06",
        "juillet" | "july" => "07",
        "août" | "august" => "08",
        "septembre" | "september" => "09",
        "octobre" | "october" => "10",
        "novembre" | "november" => "11",
        "décembre" | "december" => "12",
        _ => return None,
    };
    let year = parts[1];
    Some(format!("{}-{}-01", year, month))
}

#[tauri::command]
pub fn parse_profile_text(text: String) -> Result<ParsedProfileData, String> {
    // Normalize non-breaking spaces to regular spaces
    let text = text.replace('\u{a0}', " ");
    let text_lower = text.to_lowercase();
    let sections = split_into_sections(&text);

    let name = extract_profile_name_from_sections(&sections);
    let title = extract_profile_title_from_sections(&sections);
    let bio = extract_bio(&sections);
    let years_experience = extract_years_of_experience(&sections, &text);
    let location = extract_profile_location(&sections);
    let technologies = {
        let t = extract_technologies(&text_lower);
        if t.is_empty() { None } else { Some(t) }
    };
    let domains = {
        let d = extract_profile_domains(&text_lower);
        if d.is_empty() { None } else { Some(d) }
    };
    let languages = extract_profile_languages(&sections);
    let education = extract_education_entries(&sections);
    let missions = extract_missions(&sections);

    Ok(ParsedProfileData {
        name,
        title,
        bio,
        years_experience,
        location,
        technologies,
        domains,
        languages,
        education,
        missions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_profile_text_basic() {
        let text = r#"Coordonnées
0665632240 (Mobile)
test@example.com

Principales compétences
PostgreSQL
NestJS

Languages
Français (Native or Bilingual)
Anglais (Professional Working)

Certifications
Some cert
 Jane Doe
Développeur full stack senior
Paris, Île-de-France, France

Résumé
Passionate developer with 10 years of experience.

Expérience
ACME Corp
Développeur Full Stack
mars 2020 - Present (4 ans)

Formation
42
Développement informatique · (2013 - 2015)
"#;
        let result = parse_profile_text(text.to_string()).unwrap();
        assert_eq!(result.name, Some("Jane Doe".to_string()));
        assert_eq!(result.title, Some("Développeur full stack senior".to_string()));
        assert!(result.bio.unwrap().contains("Passionate developer"));
        assert_eq!(result.languages, Some(vec!["Français".to_string(), "Anglais".to_string()]));
        assert_eq!(result.location, Some("Paris".to_string()));
        assert!(result.education.is_some());
        let edu = result.education.unwrap();
        assert_eq!(edu[0].school, "42");
        assert_eq!(edu[0].end_year, Some("2015".to_string()));

        // Missions
        let missions = result.missions.expect("should have missions");
        assert_eq!(missions.len(), 1);
        assert_eq!(missions[0].client, "ACME Corp");
        assert_eq!(missions[0].title, "Développeur Full Stack");
        assert_eq!(missions[0].start_date, Some("2020-03-01".to_string()));
        assert!(missions[0].end_date.is_none()); // Present
    }

    #[test]
    fn test_extract_missions_from_pdf() {
        let pdf_path = "/home/kevin/Downloads/Profile (1).pdf";
        if !std::path::Path::new(pdf_path).exists() {
            eprintln!("Skipping: PDF not found at {}", pdf_path);
            return;
        }
        let bytes = std::fs::read(pdf_path).unwrap();
        let raw = pdf_extract::extract_text_from_mem(&bytes).unwrap();
        let result = parse_profile_text(raw).unwrap();
        let missions = result.missions.expect("should have missions");
        eprintln!("Found {} missions:", missions.len());
        for m in &missions {
            eprintln!("  {} at {} ({:?} → {:?})", m.title, m.client, m.start_date, m.end_date);
            if let Some(ref d) = m.description {
                let preview: String = d.chars().take(80).collect();
                eprintln!("    desc: {}...", preview);
            }
        }
        assert!(missions.len() >= 5, "should find at least 5 missions");
        // First mission should be the most recent
        assert_eq!(missions[0].client, "Ministère de la Culture");
        assert!(missions[0].end_date.is_none()); // Present
    }
}
