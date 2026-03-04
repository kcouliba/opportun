/// Calculate match score between a lead and a profile
pub fn calculate_match_score(
    profile: &ProfileMatchData,
    lead: &LeadMatchData,
) -> MatchResult {
    let mut score: i64 = 50; // Base score

    // Check blacklist - automatic filter
    if !profile.blacklisted_clients.is_empty() {
        let client_lower = lead.client.to_lowercase();
        if profile
            .blacklisted_clients
            .iter()
            .any(|c| client_lower.contains(&c.to_lowercase()))
        {
            return MatchResult {
                score: 0,
                auto_filtered: true,
            };
        }
    }

    if !profile.blacklisted_domains.is_empty() && !lead.required_domains.is_empty() {
        let has_blacklisted = lead.required_domains.iter().any(|d| {
            profile
                .blacklisted_domains
                .iter()
                .any(|bd| d.to_lowercase().contains(&bd.to_lowercase()))
        });
        if has_blacklisted {
            return MatchResult {
                score: 0,
                auto_filtered: true,
            };
        }
    }

    // Check minimum rate - automatic filter
    if let (Some(min_tjm), Some(offered)) = (profile.minimum_tjm, lead.offered_rate) {
        if offered < min_tjm {
            return MatchResult {
                score: 0,
                auto_filtered: true,
            };
        }
    }

    // Technology match (up to +30 points)
    if !profile.technologies.is_empty() && !lead.required_technologies.is_empty() {
        let profile_tech_lower: Vec<String> = profile
            .technologies
            .iter()
            .map(|t| t.to_lowercase())
            .collect();
        let matching_count = lead
            .required_technologies
            .iter()
            .filter(|t| profile_tech_lower.contains(&t.to_lowercase()))
            .count();
        let tech_match_ratio =
            matching_count as f64 / lead.required_technologies.len() as f64;
        let tech_points = (tech_match_ratio * 30.0).round() as i64;
        score += tech_points;
    }

    // Domain match (up to +15 points)
    if !profile.domains.is_empty() && !lead.required_domains.is_empty() {
        let profile_domain_lower: Vec<String> = profile
            .domains
            .iter()
            .map(|d| d.to_lowercase())
            .collect();
        let has_match = lead
            .required_domains
            .iter()
            .any(|d| profile_domain_lower.contains(&d.to_lowercase()));
        if has_match {
            score += 15;
        }
    }

    // Rate bonus (up to +10 points)
    if let (Some(target), Some(offered)) = (profile.target_tjm, lead.offered_rate) {
        if offered >= target {
            score += 10;
        } else if let Some(min) = profile.minimum_tjm {
            if offered >= min {
                score += 5;
            }
        }
    }

    // Location match (up to +10 points)
    if !profile.preferred_locations.is_empty() {
        if let Some(ref loc) = lead.location {
            let loc_lower = loc.to_lowercase();
            let location_match = profile.preferred_locations.iter().any(|l| {
                loc_lower.contains(&l.to_lowercase()) || l.to_lowercase().contains(&loc_lower)
            });
            if location_match {
                score += 10;
            }
        }
    }

    // Cap score at 100
    score = score.clamp(0, 100);

    MatchResult {
        score,
        auto_filtered: false,
    }
}

pub struct ProfileMatchData {
    pub technologies: Vec<String>,
    pub domains: Vec<String>,
    pub minimum_tjm: Option<i64>,
    pub target_tjm: Option<i64>,
    pub preferred_locations: Vec<String>,
    pub blacklisted_clients: Vec<String>,
    pub blacklisted_domains: Vec<String>,
}

pub struct LeadMatchData {
    pub required_technologies: Vec<String>,
    pub required_domains: Vec<String>,
    pub offered_rate: Option<i64>,
    pub location: Option<String>,
    pub client: String,
}

pub struct MatchResult {
    pub score: i64,
    pub auto_filtered: bool,
}

/// Parse a JSON array string into Vec<String>
pub fn parse_json_array(json: &Option<String>) -> Vec<String> {
    match json {
        Some(s) if !s.is_empty() => serde_json::from_str(s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_profile() -> ProfileMatchData {
        ProfileMatchData {
            technologies: vec!["React".into(), "TypeScript".into(), "Node.js".into()],
            domains: vec!["Fintech".into(), "E-commerce".into()],
            minimum_tjm: Some(500),
            target_tjm: Some(700),
            preferred_locations: vec!["Paris".into(), "Remote".into()],
            blacklisted_clients: vec!["BadCompany".into(), "AvoidCorp".into()],
            blacklisted_domains: vec!["Gambling".into(), "Tobacco".into()],
        }
    }

    fn base_lead() -> LeadMatchData {
        LeadMatchData {
            required_technologies: vec!["React".into(), "TypeScript".into()],
            required_domains: vec!["Fintech".into()],
            offered_rate: Some(600),
            location: Some("Paris".into()),
            client: "GoodClient".into(),
        }
    }

    #[test]
    fn test_full_tech_match() {
        let result = calculate_match_score(&base_profile(), &base_lead());
        assert!(result.score >= 80);
        assert!(!result.auto_filtered);
    }

    #[test]
    fn test_blacklisted_client() {
        let mut lead = base_lead();
        lead.client = "BadCompany Inc".into();
        let result = calculate_match_score(&base_profile(), &lead);
        assert_eq!(result.score, 0);
        assert!(result.auto_filtered);
    }

    #[test]
    fn test_below_minimum_rate() {
        let mut lead = base_lead();
        lead.offered_rate = Some(400);
        let result = calculate_match_score(&base_profile(), &lead);
        assert_eq!(result.score, 0);
        assert!(result.auto_filtered);
    }

    #[test]
    fn test_rate_meets_target() {
        let mut lead = base_lead();
        lead.offered_rate = Some(700);
        let result = calculate_match_score(&base_profile(), &lead);
        assert!(!result.auto_filtered);
        // Rate meets target = +10, so score should be higher than base lead (600 = +5)
        assert!(result.score > 80);
    }

    #[test]
    fn test_base_score_empty_profile() {
        let profile = ProfileMatchData {
            technologies: vec![],
            domains: vec![],
            minimum_tjm: None,
            target_tjm: None,
            preferred_locations: vec![],
            blacklisted_clients: vec![],
            blacklisted_domains: vec![],
        };
        let lead = LeadMatchData {
            required_technologies: vec![],
            required_domains: vec![],
            offered_rate: None,
            location: None,
            client: "SomeClient".into(),
        };
        let result = calculate_match_score(&profile, &lead);
        assert_eq!(result.score, 50);
        assert!(!result.auto_filtered);
    }

    #[test]
    fn test_score_capped_at_100() {
        let mut lead = base_lead();
        lead.required_technologies = vec!["React".into(), "TypeScript".into(), "Node.js".into()];
        lead.offered_rate = Some(800);
        let result = calculate_match_score(&base_profile(), &lead);
        assert!(result.score <= 100);
    }

    #[test]
    fn test_blacklisted_domain() {
        let mut lead = base_lead();
        lead.required_domains = vec!["Gambling".into()];
        let result = calculate_match_score(&base_profile(), &lead);
        assert_eq!(result.score, 0);
        assert!(result.auto_filtered);
    }
}
