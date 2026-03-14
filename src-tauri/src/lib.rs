mod commands;
mod db;
mod llm;
mod matching;
mod models;
#[cfg(feature = "sync")]
mod sync;

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
            commands::leads::update_lead_stage,
            commands::leads::batch_delete_leads,
            commands::leads::batch_update_leads_stage,
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
            commands::documents::generate_application_message,
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
            commands::ai::analyze_activities_ai,
            commands::ai::generate_application_message_ai,
            commands::ai::parse_resume_ai,
            // Import
            commands::import::fetch_url_text,
            commands::import::read_file_text,
            commands::import::parse_job_text,
            commands::import::parse_profile_text,
            // Dashboard
            commands::dashboard::get_dashboard_forecast,
            commands::dashboard::get_startup_alerts,
            // Backup
            commands::backup::backup_database,
            commands::backup::validate_database,
            commands::backup::restore_database,
            // Watch Sources
            commands::watch_sources::list_watch_sources,
            commands::watch_sources::create_watch_source,
            commands::watch_sources::update_watch_source,
            commands::watch_sources::delete_watch_source,
            commands::watch_sources::check_watch_source,
            commands::watch_sources::list_discovered_leads,
            commands::watch_sources::dismiss_discovered_leads,
            commands::watch_sources::count_new_discovered_leads,
            commands::watch_sources::import_discovered_lead,
            commands::watch_sources::batch_import_discovered_leads,
            // Settings
            commands::settings::get_lead_sources,
            commands::settings::update_lead_sources,
            commands::settings::get_mcp_token,
            commands::settings::regenerate_mcp_token,
            // Sync (behind feature flag)
            #[cfg(feature = "sync")]
            commands::sync::get_sync_status,
            #[cfg(feature = "sync")]
            commands::sync::update_device_name,
            #[cfg(feature = "sync")]
            commands::sync::initiate_pairing,
            #[cfg(feature = "sync")]
            commands::sync::complete_pairing,
            #[cfg(feature = "sync")]
            commands::sync::sync_push,
            #[cfg(feature = "sync")]
            commands::sync::sync_pull,
            #[cfg(feature = "sync")]
            commands::sync::unpair_device,
            #[cfg(feature = "sync")]
            commands::sync::resolve_conflict,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
