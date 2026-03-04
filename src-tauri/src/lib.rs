mod commands;
mod db;
mod llm;
mod matching;
mod models;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database in app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let database =
                Database::new(app_data_dir).expect("Failed to initialize database");

            // Initialize AI/LLM state
            let ai_settings = llm::load_settings_from_db(&database);
            let llm_state = llm::create_llm_state(ai_settings);
            app.manage(llm_state);

            app.manage(database);

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            // Profile
            commands::profile::get_profile,
            commands::profile::create_profile,
            commands::profile::update_profile,
            // Leads
            commands::leads::list_leads,
            commands::leads::get_lead,
            commands::leads::create_lead,
            commands::leads::update_lead,
            commands::leads::delete_lead,
            commands::leads::get_lead_stats,
            commands::leads::export_leads_csv,
            // Missions
            commands::missions::list_missions,
            commands::missions::get_mission,
            commands::missions::create_mission,
            commands::missions::update_mission,
            commands::missions::delete_mission,
            // Activities
            commands::activities::list_activities,
            commands::activities::list_lead_activities,
            commands::activities::create_activity,
            commands::activities::update_activity,
            commands::activities::delete_activity,
            // Documents
            commands::documents::generate_document,
            // Analytics
            commands::analytics::get_analytics,
            // AI
            commands::ai::get_ai_settings,
            commands::ai::update_ai_settings,
            commands::ai::check_ai_status,
            commands::ai::parse_job_ai,
            commands::ai::analyze_lead_ai,
            commands::ai::generate_cover_letter_ai,
            commands::ai::generate_interview_prep_ai,
            commands::ai::pull_ai_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
