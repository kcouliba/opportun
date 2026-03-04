mod commands;
mod db;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
