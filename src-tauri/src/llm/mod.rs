pub mod anthropic;
#[cfg(feature = "embedded-llm")]
pub mod embedded;
#[cfg(feature = "embedded-llm")]
pub mod grammars;
pub mod ollama;
pub mod openai;
pub mod prompts;
pub mod prompts_basic;
pub mod provider;
pub mod tier;

use crate::db::Database;
use crate::models::AiSettings;
use anthropic::AnthropicProvider;
use ollama::OllamaProvider;
use openai::OpenAiProvider;
use provider::{LlmError, LlmRequest, LlmResponse};
use std::sync::RwLock;

pub struct LlmState {
    pub settings: RwLock<AiSettings>,
    #[cfg(feature = "embedded-llm")]
    pub embedded: embedded::EmbeddedProvider,
}

impl LlmState {
    fn read_settings(&self) -> Result<AiSettings, LlmError> {
        self.settings
            .read()
            .map(|s| s.clone())
            .map_err(|_| LlmError::InferenceFailed("Failed to read settings".to_string()))
    }

    fn require_api_key(settings: &AiSettings) -> Result<String, LlmError> {
        match &settings.api_key {
            Some(key) if !key.is_empty() => Ok(key.clone()),
            _ => Err(LlmError::ApiKeyMissing),
        }
    }

    pub async fn generate(&self, mut request: LlmRequest) -> Result<LlmResponse, LlmError> {
        let settings = self.read_settings()?;

        if !settings.enabled {
            log::warn!("[LLM] generate called but AI is not enabled");
            return Err(LlmError::NotEnabled);
        }

        if request.temperature == 0.0 {
            request.temperature = settings.temperature;
        }
        if request.max_tokens == 0 {
            request.max_tokens = settings.max_tokens;
        }

        log::info!(
            "[LLM] generate: provider={}, model={}, json_mode={}, temp={}, max_tokens={}",
            settings.provider, settings.model_name, request.json_mode, request.temperature, request.max_tokens
        );

        match settings.provider.as_str() {
            #[cfg(feature = "embedded-llm")]
            "embedded" => {
                self.embedded
                    .generate_with_model(&settings.model_name, request)
                    .await
            }
            "openai" => {
                let api_key = Self::require_api_key(&settings)?;
                let base_url = if settings.ollama_url.is_empty()
                    || settings.ollama_url == "http://localhost:11434"
                {
                    "https://api.openai.com/v1".to_string()
                } else {
                    settings.ollama_url.clone()
                };
                let provider = OpenAiProvider::new(api_key, base_url);
                provider
                    .generate_with_model(&settings.model_name, request)
                    .await
            }
            "anthropic" => {
                let api_key = Self::require_api_key(&settings)?;
                let base_url = if settings.ollama_url.is_empty()
                    || settings.ollama_url == "http://localhost:11434"
                {
                    "https://api.anthropic.com".to_string()
                } else {
                    settings.ollama_url.clone()
                };
                let provider = AnthropicProvider::new(api_key, base_url);
                provider
                    .generate_with_model(&settings.model_name, request)
                    .await
            }
            _ => {
                // Default to Ollama
                let provider = OllamaProvider::new(settings.ollama_url.clone());
                provider
                    .generate_with_model(&settings.model_name, request)
                    .await
            }
        }
    }

    pub async fn is_available(&self) -> bool {
        let settings = match self.read_settings() {
            Ok(s) => s,
            Err(e) => {
                log::error!("[LLM] is_available: failed to read settings: {}", e);
                return false;
            }
        };

        match settings.provider.as_str() {
            #[cfg(feature = "embedded-llm")]
            "embedded" => {
                let avail = self.embedded.is_available();
                log::info!("[LLM] is_available (embedded): {}", avail);
                avail
            }
            "openai" | "anthropic" => {
                let avail = settings
                    .api_key
                    .as_ref()
                    .map(|k| !k.is_empty())
                    .unwrap_or(false);
                log::info!("[LLM] is_available ({}): api_key_set={}", settings.provider, avail);
                avail
            }
            _ => {
                let provider = OllamaProvider::new(settings.ollama_url.clone());
                let avail = provider.is_available().await;
                log::info!("[LLM] is_available (ollama): {}", avail);
                avail
            }
        }
    }

    pub async fn list_models(&self) -> Result<Vec<provider::ModelInfo>, LlmError> {
        let settings = self.read_settings()?;
        match settings.provider.as_str() {
            #[cfg(feature = "embedded-llm")]
            "embedded" => Ok(self.embedded.list_models()),
            "openai" | "anthropic" => Ok(vec![]),
            _ => {
                let provider = OllamaProvider::new(settings.ollama_url.clone());
                provider.list_models().await
            }
        }
    }

    pub async fn pull_model(
        &self,
        app_handle: tauri::AppHandle,
        model_name: &str,
    ) -> Result<(), LlmError> {
        let settings = self.read_settings()?;
        match settings.provider.as_str() {
            #[cfg(feature = "embedded-llm")]
            "embedded" => self.embedded.download_model(app_handle).await,
            "openai" | "anthropic" => Err(LlmError::InferenceFailed(
                "Model pulling is only supported for Ollama or Embedded".to_string(),
            )),
            _ => {
                let provider = OllamaProvider::new(settings.ollama_url.clone());
                provider.pull_model(app_handle, model_name).await
            }
        }
    }
}

pub fn load_settings_from_db(db: &Database) -> AiSettings {
    let conn = db.conn.lock().expect("Failed to lock database");
    conn.query_row(
        "SELECT id, enabled, modelName, ollamaUrl, temperature, maxTokens, provider, apiKey FROM aiSettings WHERE id = 'singleton'",
        [],
        |row| {
            Ok(AiSettings {
                id: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                model_name: row.get(2)?,
                ollama_url: row.get(3)?,
                temperature: row.get(4)?,
                max_tokens: row.get(5)?,
                provider: row.get(6)?,
                api_key: row.get(7)?,
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
        provider: "ollama".to_string(),
        api_key: None,
    })
}

#[cfg(feature = "embedded-llm")]
pub fn create_llm_state(
    settings: AiSettings,
    models_dir: std::path::PathBuf,
) -> LlmState {
    LlmState {
        settings: RwLock::new(settings),
        embedded: embedded::EmbeddedProvider::new(models_dir),
    }
}

#[cfg(not(feature = "embedded-llm"))]
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
