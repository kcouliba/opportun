pub mod ollama;
pub mod prompts;
pub mod provider;

use crate::db::Database;
use crate::models::AiSettings;
use ollama::OllamaProvider;
use provider::{LlmError, LlmRequest, LlmResponse};
use std::sync::RwLock;

pub struct LlmState {
    pub settings: RwLock<AiSettings>,
}

impl LlmState {
    fn read_settings(&self) -> Result<AiSettings, LlmError> {
        self.settings
            .read()
            .map(|s| s.clone())
            .map_err(|_| LlmError::InferenceFailed("Failed to read settings".to_string()))
    }

    fn make_provider(&self) -> Result<OllamaProvider, LlmError> {
        let settings = self.read_settings()?;
        Ok(OllamaProvider::new(settings.ollama_url))
    }

    pub async fn generate(&self, mut request: LlmRequest) -> Result<LlmResponse, LlmError> {
        let settings = self.read_settings()?;

        if !settings.enabled {
            return Err(LlmError::NotEnabled);
        }

        if request.temperature == 0.0 {
            request.temperature = settings.temperature;
        }
        if request.max_tokens == 0 {
            request.max_tokens = settings.max_tokens;
        }

        let provider = OllamaProvider::new(settings.ollama_url.clone());
        provider
            .generate_with_model(&settings.model_name, request)
            .await
    }

    pub async fn is_available(&self) -> bool {
        match self.make_provider() {
            Ok(provider) => provider.is_available().await,
            Err(_) => false,
        }
    }

    #[allow(dead_code)]
    pub async fn list_models(&self) -> Result<Vec<provider::ModelInfo>, LlmError> {
        self.make_provider()?.list_models().await
    }

    pub async fn pull_model(
        &self,
        app_handle: tauri::AppHandle,
        model_name: &str,
    ) -> Result<(), LlmError> {
        self.make_provider()?
            .pull_model(app_handle, model_name)
            .await
    }
}

pub fn load_settings_from_db(db: &Database) -> AiSettings {
    let conn = db.conn.lock().expect("Failed to lock database");
    conn.query_row(
        "SELECT id, enabled, modelName, ollamaUrl, temperature, maxTokens FROM aiSettings WHERE id = 'singleton'",
        [],
        |row| {
            Ok(AiSettings {
                id: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                model_name: row.get(2)?,
                ollama_url: row.get(3)?,
                temperature: row.get(4)?,
                max_tokens: row.get(5)?,
            })
        },
    )
    .unwrap_or(AiSettings {
        id: "singleton".to_string(),
        enabled: false,
        model_name: "llama3.2:3b".to_string(),
        ollama_url: "http://localhost:11434".to_string(),
        temperature: 0.3,
        max_tokens: 2048,
    })
}

pub fn create_llm_state(settings: AiSettings) -> LlmState {
    LlmState {
        settings: RwLock::new(settings),
    }
}

/// Strip markdown code fences and extract JSON object from raw LLM output
pub fn clean_json_response(raw: &str) -> Result<String, LlmError> {
    let mut text = raw.trim().to_string();

    // Strip markdown code fences
    if text.starts_with("```json") {
        text = text.trim_start_matches("```json").to_string();
    } else if text.starts_with("```") {
        text = text.trim_start_matches("```").to_string();
    }
    if text.ends_with("```") {
        text = text.trim_end_matches("```").to_string();
    }

    let text = text.trim();

    // Find the first { and last }
    let start = text.find('{');
    let end = text.rfind('}');

    match (start, end) {
        (Some(s), Some(e)) if s < e => Ok(text[s..=e].to_string()),
        _ => Err(LlmError::InvalidJson(
            "No valid JSON object found in response".to_string(),
        )),
    }
}
