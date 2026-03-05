use crate::db::Database;
use crate::models::{
    DashboardAlert, DashboardForecast, Lead, Mission, MissionIncome, MonthlyProjection,
    PipelineIncome, SecuredIncome,
};
use chrono::{Datelike, Months, NaiveDate, Utc};
use tauri::State;

fn row_to_mission(row: &rusqlite::Row) -> rusqlite::Result<Mission> {
    Ok(Mission {
        id: row.get("id")?,
        created_at: row.get("createdAt")?,
        updated_at: row.get("updatedAt")?,
        client: row.get("client")?,
        title: row.get("title")?,
        description: row.get("description")?,
        start_date: row.get("startDate")?,
        end_date: row.get("endDate")?,
        rate: row.get("rate")?,
        days_per_week: row.get("daysPerWeek")?,
        status: row.get("status")?,
        profile_id: row.get("profileId")?,
    })
}

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

fn parse_date(s: &str) -> Option<NaiveDate> {
    // Try common formats
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d"))
        .ok()
}

fn month_key(date: NaiveDate) -> String {
    let names = [
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    format!("{} {}", names[date.month() as usize], date.year())
}

/// Check if a mission overlaps a given month (year, month)
fn mission_overlaps_month(
    start: NaiveDate,
    end: Option<NaiveDate>,
    year: i32,
    month: u32,
) -> bool {
    let month_start = NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    let month_end = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .unwrap()
    .pred_opt()
    .unwrap();

    let mission_end = end.unwrap_or(month_end); // if no end, assume it covers
    start <= month_end && mission_end >= month_start
}

#[tauri::command]
pub fn get_dashboard_forecast(db: State<Database>) -> Result<DashboardForecast, String> {
    let conn = db.conn.lock().unwrap();

    // Load active missions
    let mut stmt = conn
        .prepare("SELECT * FROM \"Mission\" WHERE status = 'active'")
        .map_err(|e| e.to_string())?;
    let active_missions: Vec<Mission> = stmt
        .query_map([], row_to_mission)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Load all non-closed leads
    let mut stmt = conn
        .prepare("SELECT * FROM \"Lead\" WHERE stage NOT IN ('won', 'lost')")
        .map_err(|e| e.to_string())?;
    let active_leads: Vec<Lead> = stmt
        .query_map([], row_to_lead)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Load all leads (for alert: high-match recent)
    let mut stmt = conn
        .prepare("SELECT * FROM \"Lead\"")
        .map_err(|e| e.to_string())?;
    let all_leads: Vec<Lead> = stmt
        .query_map([], row_to_lead)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let today = Utc::now().date_naive();

    // === SECURED INCOME ===
    let mut mission_incomes: Vec<MissionIncome> = Vec::new();
    let mut total_secured: i64 = 0;
    let mut total_monthly: i64 = 0;

    for m in &active_missions {
        let monthly_income = (m.rate as f64 * m.days_per_week * 4.33).round() as i64;
        let remaining_income = if let Some(ref end_str) = m.end_date {
            if let Some(end_date) = parse_date(end_str) {
                let remaining_days = (end_date - today).num_days().max(0);
                let remaining_weeks = remaining_days as f64 / 7.0;
                (m.rate as f64 * m.days_per_week * remaining_weeks).round() as i64
            } else {
                monthly_income * 6
            }
        } else {
            monthly_income * 6
        };

        total_secured += remaining_income;
        total_monthly += monthly_income;

        mission_incomes.push(MissionIncome {
            mission_id: m.id.clone(),
            client: m.client.clone(),
            title: m.title.clone(),
            remaining_income,
            monthly_income,
            ends_at: m.end_date.clone(),
        });
    }

    let secured_income = SecuredIncome {
        total: total_secured,
        monthly_avg: total_monthly,
        missions: mission_incomes,
    };

    // === PIPELINE INCOME ===
    let mut qualified_value: i64 = 0;
    let mut negotiating_value: i64 = 0;

    for lead in &active_leads {
        if let (Some(rate), Some(duration)) = (lead.offered_rate, lead.estimated_duration) {
            let value = rate * 20 * duration;
            match lead.stage.as_str() {
                "qualified" => qualified_value += value,
                "negotiating" => negotiating_value += value,
                _ => {}
            }
        }
    }

    let pipeline_income = PipelineIncome {
        total_weighted: (qualified_value as f64 * 0.30).round() as i64
            + (negotiating_value as f64 * 0.60).round() as i64,
        qualified_value: (qualified_value as f64 * 0.30).round() as i64,
        negotiating_value: (negotiating_value as f64 * 0.60).round() as i64,
    };

    // === MONTHLY PROJECTION (6 months) ===
    let mut monthly_projection: Vec<MonthlyProjection> = Vec::new();

    for i in 0..6u32 {
        let target = if i == 0 {
            today
        } else {
            today.checked_add_months(Months::new(i)).unwrap_or(today)
        };
        let year = target.year();
        let month = target.month();
        let label = month_key(target);

        // Secured: sum of prorated mission incomes for this month
        let month_start = NaiveDate::from_ymd_opt(year, month, 1).unwrap();
        let next_month_start = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1)
        }
        .unwrap();
        let month_end = next_month_start.pred_opt().unwrap();
        let days_in_month = (next_month_start - month_start).num_days() as f64;

        let mut month_secured: i64 = 0;
        for m in &active_missions {
            if let Some(start) = parse_date(&m.start_date) {
                let end = m.end_date.as_deref().and_then(parse_date);
                if mission_overlaps_month(start, end, year, month) {
                    let full_monthly = (m.rate as f64 * m.days_per_week * 4.33).round() as i64;
                    // Prorate: clamp mission start/end to the month boundaries
                    let effective_start = start.max(month_start);
                    let effective_end = end.unwrap_or(month_end).min(month_end);
                    let active_days = (effective_end - effective_start).num_days() + 1;
                    let fraction = active_days as f64 / days_in_month;
                    month_secured += (full_monthly as f64 * fraction).round() as i64;
                }
            }
        }

        // Potential: distribute weighted pipeline across estimated duration
        let mut month_potential: i64 = 0;
        for lead in &active_leads {
            if let (Some(rate), Some(duration)) = (lead.offered_rate, lead.estimated_duration) {
                let weight = match lead.stage.as_str() {
                    "qualified" => 0.30,
                    "negotiating" => 0.60,
                    _ => continue,
                };
                let total_value = rate * 20 * duration;
                let weighted = (total_value as f64 * weight).round() as i64;
                let monthly_portion = if duration > 0 {
                    weighted / duration
                } else {
                    weighted
                };

                let lead_start = lead
                    .estimated_start_date
                    .as_deref()
                    .and_then(parse_date)
                    .unwrap_or(today);

                // Check if this month falls within the lead's estimated duration
                let lead_end = lead_start
                    .checked_add_months(Months::new(duration as u32))
                    .unwrap_or(lead_start);

                if lead_start <= month_end && lead_end >= month_start {
                    month_potential += monthly_portion;
                }
            }
        }

        monthly_projection.push(MonthlyProjection {
            month: label,
            secured: month_secured,
            potential: month_potential,
        });
    }

    // === ALERTS ===
    let mut alerts: Vec<DashboardAlert> = Vec::new();

    // 1. Mission ending + thin pipeline
    for m in &active_missions {
        if let Some(ref end_str) = m.end_date {
            if let Some(end_date) = parse_date(end_str) {
                let days_until = (end_date - today).num_days();
                if days_until <= 60 {
                    let pipeline_count = active_leads
                        .iter()
                        .filter(|l| l.stage == "qualified" || l.stage == "negotiating")
                        .count();
                    if pipeline_count == 0 {
                        alerts.push(DashboardAlert {
                            id: "mission-ending-thin-pipeline".to_string(),
                            severity: "critical".to_string(),
                            title: "Mission ending with empty pipeline".to_string(),
                            message: format!(
                                "{} ends in {} days and you have no qualified or negotiating leads",
                                m.client, days_until
                            ),
                            action_label: Some("Add a lead".to_string()),
                            action_link: Some("/leads/new".to_string()),
                        });
                    }
                }
            }
        }
    }

    // 2. Pipeline empty (no active leads at all)
    if active_leads.is_empty() && !active_missions.is_empty() {
        alerts.push(DashboardAlert {
            id: "pipeline-empty".to_string(),
            severity: "critical".to_string(),
            title: "Pipeline is empty".to_string(),
            message: "You have no active leads in your pipeline".to_string(),
            action_label: Some("Add a lead".to_string()),
            action_link: Some("/leads/new".to_string()),
        });
    }

    // 3. Follow-ups overdue
    let overdue_leads: Vec<&Lead> = active_leads
        .iter()
        .filter(|l| {
            l.next_action_date
                .as_deref()
                .and_then(parse_date)
                .map(|d| d < today)
                .unwrap_or(false)
        })
        .collect();
    if !overdue_leads.is_empty() {
        let count = overdue_leads.len();
        let names: Vec<String> = overdue_leads.iter().take(3).map(|l| l.client.clone()).collect();
        alerts.push(DashboardAlert {
            id: "follow-ups-overdue".to_string(),
            severity: "critical".to_string(),
            title: format!("{} overdue follow-up{}", count, if count > 1 { "s" } else { "" }),
            message: if count <= 3 {
                format!("Follow up with {}", names.join(", "))
            } else {
                format!("Follow up with {} and {} more", names.join(", "), count - 3)
            },
            action_label: Some("View leads".to_string()),
            action_link: Some("/leads".to_string()),
        });
    }

    // 4. Stalled deals (qualified/negotiating not updated in 14+ days)
    let stalled: Vec<&Lead> = active_leads
        .iter()
        .filter(|l| {
            (l.stage == "qualified" || l.stage == "negotiating")
                && parse_date(&l.updated_at)
                    .or_else(|| {
                        // Try parsing as datetime
                        chrono::NaiveDateTime::parse_from_str(&l.updated_at, "%Y-%m-%d %H:%M:%S")
                            .ok()
                            .map(|dt| dt.date())
                            .or_else(|| {
                                chrono::DateTime::parse_from_rfc3339(&l.updated_at)
                                    .ok()
                                    .map(|dt| dt.date_naive())
                            })
                    })
                    .map(|d| (today - d).num_days() > 14)
                    .unwrap_or(false)
        })
        .collect();
    if !stalled.is_empty() {
        let count = stalled.len();
        let names: Vec<String> = stalled.iter().take(3).map(|l| l.client.clone()).collect();
        alerts.push(DashboardAlert {
            id: "stalled-deals".to_string(),
            severity: "warning".to_string(),
            title: format!("{} stalled deal{}", count, if count > 1 { "s" } else { "" }),
            message: format!(
                "{} {} not been updated in over 2 weeks",
                names.join(", "),
                if count == 1 { "has" } else { "have" }
            ),
            action_label: Some("View leads".to_string()),
            action_link: Some("/leads".to_string()),
        });
    }

    // 5. No active mission
    if active_missions.is_empty() {
        alerts.push(DashboardAlert {
            id: "no-mission".to_string(),
            severity: "warning".to_string(),
            title: "No active mission".to_string(),
            message: "Add your current mission to track income and plan ahead".to_string(),
            action_label: Some("Add a mission".to_string()),
            action_link: Some("/missions/new".to_string()),
        });
    }

    // 6. High-match recent leads
    let seven_days_ago = today - chrono::Duration::days(7);
    let high_match: Vec<&Lead> = all_leads
        .iter()
        .filter(|l| {
            l.stage == "lead"
                && l.match_score.map(|s| s >= 80).unwrap_or(false)
                && parse_date(&l.created_at)
                    .or_else(|| {
                        chrono::NaiveDateTime::parse_from_str(&l.created_at, "%Y-%m-%d %H:%M:%S")
                            .ok()
                            .map(|dt| dt.date())
                            .or_else(|| {
                                chrono::DateTime::parse_from_rfc3339(&l.created_at)
                                    .ok()
                                    .map(|dt| dt.date_naive())
                            })
                    })
                    .map(|d| d >= seven_days_ago)
                    .unwrap_or(false)
        })
        .collect();
    if !high_match.is_empty() {
        let count = high_match.len();
        let names: Vec<String> = high_match.iter().take(2).map(|l| l.client.clone()).collect();
        alerts.push(DashboardAlert {
            id: "high-match-lead".to_string(),
            severity: "info".to_string(),
            title: format!(
                "{} high-match lead{}",
                count,
                if count > 1 { "s" } else { "" }
            ),
            message: if count <= 2 {
                format!("{} — 80%+ match, worth reviewing", names.join(", "))
            } else {
                format!(
                    "{} and {} more — 80%+ match, worth reviewing",
                    names.join(", "),
                    count - 2
                )
            },
            action_label: Some("View leads".to_string()),
            action_link: Some("/leads".to_string()),
        });
    }

    // Sort alerts: critical first, then warning, then info
    alerts.sort_by(|a, b| {
        let severity_order = |s: &str| -> u8 {
            match s {
                "critical" => 0,
                "warning" => 1,
                "info" => 2,
                _ => 3,
            }
        };
        severity_order(&a.severity).cmp(&severity_order(&b.severity))
    });

    Ok(DashboardForecast {
        secured_income,
        pipeline_income,
        monthly_projection,
        alerts,
    })
}
