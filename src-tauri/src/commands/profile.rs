use crate::db::Database;
use crate::models::{Profile, ProfileInput};
use tauri::State;

#[tauri::command]
pub fn get_profile(db: State<Database>) -> Result<Option<Profile>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM Profile LIMIT 1")
        .map_err(|e| e.to_string())?;
    let profile = stmt
        .query_row([], |row| {
            Ok(Profile {
                id: row.get("id")?,
                created_at: row.get("createdAt")?,
                updated_at: row.get("updatedAt")?,
                name: row.get("name")?,
                title: row.get("title")?,
                years_experience: row.get("yearsExperience")?,
                legal_structure: row.get("legalStructure")?,
                minimum_tjm: row.get("minimumTJM")?,
                target_tjm: row.get("targetTJM")?,
                preferred_locations: row.get("preferredLocations")?,
                max_commute_days: row.get("maxCommuteDays")?,
                technologies: row.get("technologies")?,
                domains: row.get("domains")?,
                blacklisted_clients: row.get("blacklistedClients")?,
                blacklisted_domains: row.get("blacklistedDomains")?,
            })
        })
        .ok();
    Ok(profile)
}

#[tauri::command]
pub fn create_profile(db: State<Database>, data: ProfileInput) -> Result<Profile, String> {
    let conn = db.conn.lock().unwrap();
    // Delete existing (single user)
    conn.execute("DELETE FROM Profile", [])
        .map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO Profile (id, createdAt, updatedAt, name, title, yearsExperience, legalStructure, minimumTJM, targetTJM, preferredLocations, maxCommuteDays, technologies, domains, blacklistedClients, blacklistedDomains)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        rusqlite::params![
            id,
            now,
            now,
            data.name,
            data.title,
            data.years_experience,
            data.legal_structure,
            data.minimum_tjm,
            data.target_tjm,
            data.preferred_locations,
            data.max_commute_days,
            data.technologies,
            data.domains,
            data.blacklisted_clients,
            data.blacklisted_domains
        ],
    )
    .map_err(|e| e.to_string())?;

    // Return the created profile
    drop(conn);
    get_profile(db)?.ok_or_else(|| "Failed to create profile".to_string())
}

#[tauri::command]
pub fn update_profile(db: State<Database>, data: ProfileInput) -> Result<Profile, String> {
    let conn = db.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let id = data.id.as_ref().ok_or("Profile ID required for update")?;

    conn.execute(
        "UPDATE Profile SET updatedAt=?1, name=?2, title=?3, yearsExperience=?4, legalStructure=?5, minimumTJM=?6, targetTJM=?7, preferredLocations=?8, maxCommuteDays=?9, technologies=?10, domains=?11, blacklistedClients=?12, blacklistedDomains=?13 WHERE id=?14",
        rusqlite::params![
            now,
            data.name,
            data.title,
            data.years_experience,
            data.legal_structure,
            data.minimum_tjm,
            data.target_tjm,
            data.preferred_locations,
            data.max_commute_days,
            data.technologies,
            data.domains,
            data.blacklisted_clients,
            data.blacklisted_domains,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    drop(conn);
    get_profile(db)?.ok_or_else(|| "Failed to update profile".to_string())
}
