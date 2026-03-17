use crate::db::Database;
use crate::models::{
    AnalyticsResponse, ConversionRates, Lead, MonthlyCount, SourceAnalytics, SourceCount,
    StageCounts,
};
use chrono::{Datelike, Months, Utc};
use std::collections::HashMap;
use tauri::State;

fn row_to_lead(row: &rusqlite::Row) -> rusqlite::Result<Lead> {
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
        auto_filtered: row.get::<_, i64>("autoFiltered")? != 0,
        notes: row.get("notes")?,
        contact_name: row.get("contactName")?,
        contact_info: row.get("contactInfo")?,
        next_action: row.get("nextAction")?,
        next_action_date: row.get("nextActionDate")?,
        profile_id: row.get("profileId")?,
        content_language: row.get("contentLanguage")?,
    })
}

/// Short month name from month number (1-12)
fn month_short_name(month: u32) -> &'static str {
    match month {
        1 => "Jan",
        2 => "Feb",
        3 => "Mar",
        4 => "Apr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Aug",
        9 => "Sep",
        10 => "Oct",
        11 => "Nov",
        12 => "Dec",
        _ => "???",
    }
}

/// Round to 1 decimal place
fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[tauri::command]
pub fn get_analytics(db: State<Database>) -> Result<AnalyticsResponse, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT * FROM \"Lead\"")
        .map_err(|e| e.to_string())?;
    let leads: Vec<Lead> = stmt
        .query_map([], row_to_lead)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Stage counts
    let mut stage_counts = StageCounts {
        lead: 0,
        qualified: 0,
        negotiating: 0,
        won: 0,
        lost: 0,
    };

    // Source counts
    let mut source_counts: HashMap<String, usize> = HashMap::new();

    // Match scores by stage
    let mut match_scores_by_stage: HashMap<String, Vec<i64>> = HashMap::new();
    for stage in &["lead", "qualified", "negotiating", "won", "lost"] {
        match_scores_by_stage.insert(stage.to_string(), Vec::new());
    }

    // Time in stage
    let mut time_in_stage: HashMap<String, Vec<i64>> = HashMap::new();
    for stage in &["lead", "qualified", "negotiating", "won", "lost"] {
        time_in_stage.insert(stage.to_string(), Vec::new());
    }

    let mut total_pipeline_value: i64 = 0;
    let now = Utc::now();

    for lead in &leads {
        // Count by stage
        match lead.stage.as_str() {
            "lead" => stage_counts.lead += 1,
            "qualified" => stage_counts.qualified += 1,
            "negotiating" => stage_counts.negotiating += 1,
            "won" => stage_counts.won += 1,
            "lost" => stage_counts.lost += 1,
            _ => {}
        }

        // Count by source
        *source_counts.entry(lead.source.clone()).or_insert(0) += 1;

        // Match scores by stage
        if let Some(score) = lead.match_score {
            if let Some(scores) = match_scores_by_stage.get_mut(&lead.stage) {
                scores.push(score);
            }
        }

        // Time in current stage (days since last update)
        if let Some(times) = time_in_stage.get_mut(&lead.stage) {
            if let Ok(updated) = chrono::DateTime::parse_from_rfc3339(&lead.updated_at) {
                let days = (now - updated.with_timezone(&Utc)).num_days();
                times.push(days);
            } else if let Ok(updated) = chrono::NaiveDateTime::parse_from_str(
                &lead.updated_at,
                "%Y-%m-%d %H:%M:%S",
            ) {
                let days = (now - updated.and_utc()).num_days();
                times.push(days);
            }
        }

        // Pipeline value (for active leads: not won, not lost)
        if lead.stage != "won" && lead.stage != "lost" {
            if let (Some(rate), Some(duration)) = (lead.offered_rate, lead.estimated_duration) {
                total_pipeline_value += rate * 20 * duration;
            }
        }
    }

    // Conversion rates (same formula as TypeScript)
    let total_not_lost =
        stage_counts.lead + stage_counts.qualified + stage_counts.negotiating + stage_counts.won;
    let lead_to_qualified = if total_not_lost > 0 {
        ((stage_counts.qualified + stage_counts.negotiating + stage_counts.won) as f64
            / total_not_lost as f64)
            * 100.0
    } else {
        0.0
    };

    let qualified_pool = stage_counts.qualified + stage_counts.negotiating + stage_counts.won;
    let qualified_to_negotiating = if qualified_pool > 0 {
        ((stage_counts.negotiating + stage_counts.won) as f64 / qualified_pool as f64) * 100.0
    } else {
        0.0
    };

    let negotiating_pool = stage_counts.negotiating + stage_counts.won;
    let negotiating_to_won = if negotiating_pool > 0 {
        (stage_counts.won as f64 / negotiating_pool as f64) * 100.0
    } else {
        0.0
    };

    // Win rate: won / (won + lost)
    let completed_deals = stage_counts.won + stage_counts.lost;
    let win_rate = if completed_deals > 0 {
        (stage_counts.won as f64 / completed_deals as f64) * 100.0
    } else {
        0.0
    };

    // Average time in each stage
    let mut avg_time_in_stage: HashMap<String, Option<i64>> = HashMap::new();
    for (stage, times) in &time_in_stage {
        if times.is_empty() {
            avg_time_in_stage.insert(stage.clone(), None);
        } else {
            let sum: i64 = times.iter().sum();
            avg_time_in_stage.insert(
                stage.clone(),
                Some((sum as f64 / times.len() as f64).round() as i64),
            );
        }
    }

    // Average match score by stage
    let mut avg_match_score_by_stage: HashMap<String, Option<i64>> = HashMap::new();
    for (stage, scores) in &match_scores_by_stage {
        if scores.is_empty() {
            avg_match_score_by_stage.insert(stage.clone(), None);
        } else {
            let sum: i64 = scores.iter().sum();
            avg_match_score_by_stage.insert(
                stage.clone(),
                Some((sum as f64 / scores.len() as f64).round() as i64),
            );
        }
    }

    // Monthly lead count (last 6 months)
    let mut monthly_lead_count: Vec<MonthlyCount> = Vec::new();
    for i in (0..6).rev() {
        let target_date = if i == 0 {
            now.date_naive()
        } else {
            now.date_naive() - Months::new(i)
        };
        let year = target_date.year();
        let month = target_date.month();

        let month_start = format!("{:04}-{:02}-01", year, month);
        // Calculate last day of month
        let next_month = if month == 12 {
            chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
        } else {
            chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
        };
        let last_day = next_month
            .unwrap()
            .pred_opt()
            .unwrap();
        let month_end = format!("{} 23:59:59", last_day.format("%Y-%m-%d"));

        let count = leads
            .iter()
            .filter(|lead| {
                let created = &lead.created_at;
                // Compare as string prefixes - works for ISO/RFC3339 date formats
                created.as_str() >= month_start.as_str()
                    && created.as_str() <= month_end.as_str()
            })
            .count();

        let month_label = format!("{} {}", month_short_name(month), year);
        monthly_lead_count.push(MonthlyCount {
            month: month_label,
            count,
        });
    }

    // Sort sources by count desc
    let mut source_breakdown: Vec<SourceCount> = source_counts
        .into_iter()
        .map(|(source, count)| SourceCount { source, count })
        .collect();
    source_breakdown.sort_by(|a, b| b.count.cmp(&a.count));

    // Per-source analytics
    let mut source_data: HashMap<String, Vec<&Lead>> = HashMap::new();
    for lead in &leads {
        source_data.entry(lead.source.clone()).or_default().push(lead);
    }

    let mut source_analytics: Vec<SourceAnalytics> = source_data
        .into_iter()
        .map(|(source, src_leads)| {
            let total = src_leads.len();
            let won = src_leads.iter().filter(|l| l.stage == "won").count();
            let lost = src_leads.iter().filter(|l| l.stage == "lost").count();
            let active = total - won - lost;

            let completed = won + lost;
            let conversion_rate = if completed > 0 {
                round1((won as f64 / completed as f64) * 100.0)
            } else {
                0.0
            };

            let scores: Vec<i64> = src_leads
                .iter()
                .filter_map(|l| l.match_score)
                .collect();
            let avg_match_score = if scores.is_empty() {
                None
            } else {
                Some((scores.iter().sum::<i64>() as f64 / scores.len() as f64).round() as i64)
            };

            let rates: Vec<i64> = src_leads
                .iter()
                .filter_map(|l| l.offered_rate)
                .filter(|r| *r > 0)
                .collect();
            let avg_offered_rate = if rates.is_empty() {
                None
            } else {
                Some((rates.iter().sum::<i64>() as f64 / rates.len() as f64).round() as i64)
            };

            // Average days from creation to "won" stage
            let won_days: Vec<i64> = src_leads
                .iter()
                .filter(|l| l.stage == "won")
                .filter_map(|l| {
                    let created = chrono::DateTime::parse_from_rfc3339(&l.created_at)
                        .or_else(|_| {
                            chrono::NaiveDateTime::parse_from_str(&l.created_at, "%Y-%m-%d %H:%M:%S")
                                .map(|dt| dt.and_utc().fixed_offset())
                        })
                        .ok()?;
                    let updated = chrono::DateTime::parse_from_rfc3339(&l.updated_at)
                        .or_else(|_| {
                            chrono::NaiveDateTime::parse_from_str(&l.updated_at, "%Y-%m-%d %H:%M:%S")
                                .map(|dt| dt.and_utc().fixed_offset())
                        })
                        .ok()?;
                    Some((updated - created).num_days())
                })
                .collect();
            let avg_days_to_win = if won_days.is_empty() {
                None
            } else {
                Some((won_days.iter().sum::<i64>() as f64 / won_days.len() as f64).round() as i64)
            };

            SourceAnalytics {
                source,
                total,
                won,
                lost,
                active,
                conversion_rate,
                avg_match_score,
                avg_offered_rate,
                avg_days_to_win,
            }
        })
        .collect();
    source_analytics.sort_by(|a, b| b.total.cmp(&a.total));

    Ok(AnalyticsResponse {
        conversion_rates: ConversionRates {
            lead_to_qualified: round1(lead_to_qualified),
            qualified_to_negotiating: round1(qualified_to_negotiating),
            negotiating_to_won: round1(negotiating_to_won),
        },
        win_rate: round1(win_rate),
        avg_time_in_stage,
        total_pipeline_value,
        source_breakdown,
        source_analytics,
        avg_match_score_by_stage,
        monthly_lead_count,
        stage_counts,
        total_leads: leads.len(),
    })
}
