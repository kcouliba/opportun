use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub name: String,
    pub title: Option<String>,
    pub years_experience: Option<i64>,
    pub legal_structure: Option<String>,
    pub minimum_tjm: Option<i64>,
    pub target_tjm: Option<i64>,
    pub preferred_locations: Option<String>,
    pub max_commute_days: Option<i64>,
    pub technologies: Option<String>,
    pub domains: Option<String>,
    pub blacklisted_clients: Option<String>,
    pub blacklisted_domains: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub rate: i64,
    pub days_per_week: f64,
    pub status: String,
    pub profile_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lead {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
    pub source_url: Option<String>,
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub required_technologies: Option<String>,
    pub required_domains: Option<String>,
    pub location: Option<String>,
    pub remote_policy: Option<String>,
    pub offered_rate: Option<i64>,
    pub estimated_revenue: Option<i64>,
    pub estimated_start_date: Option<String>,
    pub estimated_duration: Option<i64>,
    pub stage: String,
    pub match_score: Option<i64>,
    pub auto_filtered: bool,
    pub notes: Option<String>,
    pub contact_name: Option<String>,
    pub contact_info: Option<String>,
    pub next_action: Option<String>,
    pub next_action_date: Option<String>,
    pub profile_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeadWithRelations {
    #[serde(flatten)]
    pub lead: Lead,
    pub documents: Vec<Document>,
    pub activities: Vec<Activity>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub content: String,
    pub version: i64,
    pub lead_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub description: Option<String>,
    pub occurred_at: String,
    pub duration: Option<i64>,
    pub lead_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityWithLead {
    #[serde(flatten)]
    pub activity: Activity,
    pub lead: LeadSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeadSummary {
    pub id: String,
    pub client: String,
    pub title: String,
}

// Input types for commands
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub title: Option<String>,
    pub years_experience: Option<i64>,
    pub legal_structure: Option<String>,
    pub minimum_tjm: Option<i64>,
    pub target_tjm: Option<i64>,
    pub preferred_locations: Option<String>,
    pub max_commute_days: Option<i64>,
    pub technologies: Option<String>,
    pub domains: Option<String>,
    pub blacklisted_clients: Option<String>,
    pub blacklisted_domains: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionInput {
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub rate: i64,
    pub days_per_week: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadInput {
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub source: String,
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

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LeadFilters {
    pub q: Option<String>,
    pub stage: Option<String>,
    pub min_score: Option<i64>,
    pub max_score: Option<i64>,
    pub client: Option<String>,
    pub technology: Option<String>,
    pub auto_filtered: Option<bool>,
    pub source: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityInput {
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: String,
    pub description: Option<String>,
    pub occurred_at: Option<String>,
    pub duration: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityFilters {
    #[serde(rename = "type")]
    pub activity_type: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// Response types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub total: usize,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadStats {
    pub total: usize,
    pub by_stage: StageCounts,
    pub active_leads: usize,
    pub auto_filtered: usize,
    pub average_match_score: Option<i64>,
    pub total_estimated_revenue: i64,
    pub high_value_leads: usize,
    pub actions: ActionCounts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageCounts {
    pub lead: usize,
    pub qualified: usize,
    pub negotiating: usize,
    pub won: usize,
    pub lost: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionCounts {
    pub overdue: usize,
    pub upcoming: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsResponse {
    pub conversion_rates: ConversionRates,
    pub win_rate: f64,
    pub avg_time_in_stage: std::collections::HashMap<String, Option<i64>>,
    pub total_pipeline_value: i64,
    pub source_breakdown: Vec<SourceCount>,
    pub avg_match_score_by_stage: std::collections::HashMap<String, Option<i64>>,
    pub monthly_lead_count: Vec<MonthlyCount>,
    pub stage_counts: StageCounts,
    pub total_leads: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionRates {
    pub lead_to_qualified: f64,
    pub qualified_to_negotiating: f64,
    pub negotiating_to_won: f64,
}

#[derive(Debug, Serialize)]
pub struct SourceCount {
    pub source: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct MonthlyCount {
    pub month: String,
    pub count: usize,
}
