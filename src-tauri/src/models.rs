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
    #[serde(rename = "minimumTJM")]
    pub minimum_tjm: Option<i64>,
    #[serde(rename = "targetTJM")]
    pub target_tjm: Option<i64>,
    pub preferred_locations: Option<String>,
    pub max_commute_days: Option<i64>,
    pub technologies: Option<String>,
    pub domains: Option<String>,
    pub blacklisted_clients: Option<String>,
    pub blacklisted_domains: Option<String>,
    pub bio: Option<String>,
    pub languages: Option<String>,
    pub education: Option<String>,
    pub content_language: Option<String>,
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
    pub content_language: Option<String>,
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
    #[serde(alias = "minimumTJM")]
    pub minimum_tjm: Option<i64>,
    #[serde(alias = "targetTJM")]
    pub target_tjm: Option<i64>,
    pub preferred_locations: Option<String>,
    pub max_commute_days: Option<i64>,
    pub technologies: Option<String>,
    pub domains: Option<String>,
    pub blacklisted_clients: Option<String>,
    pub blacklisted_domains: Option<String>,
    pub bio: Option<String>,
    pub languages: Option<String>,
    pub education: Option<String>,
    pub content_language: Option<String>,
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
    pub content_language: Option<String>,
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

// AI types
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub id: String,
    pub enabled: bool,
    pub model_name: String,
    pub ollama_url: String,
    pub temperature: f64,
    pub max_tokens: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsInput {
    pub enabled: Option<bool>,
    pub model_name: Option<String>,
    pub ollama_url: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedJobDescription {
    pub title: Option<String>,
    pub client: Option<String>,
    pub technologies: Option<Vec<String>>,
    pub rate: Option<i64>,
    pub location: Option<String>,
    pub remote_policy: Option<String>,
    pub description: Option<String>,
    pub requirements: Option<Vec<String>>,
    pub domains: Option<Vec<String>>,
    pub start_date: Option<String>,
    pub duration: Option<String>,
    pub contact_name: Option<String>,
    pub contact_info: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeadAnalysis {
    pub overall_fit: String,
    pub fit_summary: String,
    pub strengths: Vec<String>,
    pub risks: Vec<String>,
    pub talking_points: Vec<String>,
    pub questions: Vec<String>,
    pub rate_advice: Option<String>,
}

// Interview prep types
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InterviewPrepQuestion {
    pub question: String,
    pub suggested_answer: String,
    pub tips: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RateNegotiation {
    pub strategy: String,
    pub talking_points: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionToAsk {
    pub question: String,
    pub why: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InterviewPrep {
    pub opening: String,
    pub technical_questions: Vec<InterviewPrepQuestion>,
    pub behavioral_questions: Vec<String>,
    pub rate_negotiation: RateNegotiation,
    pub questions_to_ask: Vec<QuestionToAsk>,
    pub red_flags: Vec<String>,
    pub closing_advice: String,
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

// Profile import types
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EducationEntry {
    pub school: String,
    pub degree: Option<String>,
    pub field: Option<String>,
    pub end_year: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedMission {
    pub client: String,
    pub title: String,
    pub description: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedProfileData {
    pub name: Option<String>,
    pub title: Option<String>,
    pub bio: Option<String>,
    pub years_experience: Option<i64>,
    pub location: Option<String>,
    pub technologies: Option<Vec<String>>,
    pub domains: Option<Vec<String>>,
    pub languages: Option<Vec<String>>,
    pub education: Option<Vec<EducationEntry>>,
    pub missions: Option<Vec<ParsedMission>>,
}

// Startup notification types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupAlert {
    pub title: String,
    pub body: String,
}

// Dashboard forecast types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardForecast {
    pub secured_income: SecuredIncome,
    pub pipeline_income: PipelineIncome,
    pub monthly_projection: Vec<MonthlyProjection>,
    pub alerts: Vec<DashboardAlert>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuredIncome {
    pub total: i64,
    pub monthly_avg: i64,
    pub missions: Vec<MissionIncome>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionIncome {
    pub mission_id: String,
    pub client: String,
    pub title: String,
    pub remaining_income: i64,
    pub monthly_income: i64,
    pub ends_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineIncome {
    pub total_weighted: i64,
    pub qualified_value: i64,
    pub negotiating_value: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyProjection {
    pub month: String,
    pub secured: i64,
    pub potential: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardAlert {
    pub id: String,
    pub severity: String,
    pub title: String,
    pub message: String,
    pub action_label: Option<String>,
    pub action_link: Option<String>,
}
