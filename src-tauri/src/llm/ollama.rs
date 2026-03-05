use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::Emitter;

use super::provider::{DownloadProgress, LlmError, LlmRequest, LlmResponse, ModelInfo};

pub struct OllamaProvider {
    client: reqwest::Client,
    base_url: String,
}

#[derive(Serialize)]
struct GenerateRequest {
    model: String,
    system: String,
    prompt: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    options: GenerateOptions,
}

#[derive(Serialize)]
struct GenerateOptions {
    temperature: f64,
    num_predict: i64,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
    #[serde(default)]
    eval_count: Option<u64>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct TagsResponse {
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct TagModel {
    name: String,
    size: Option<u64>,
    modified_at: Option<String>,
}

#[derive(Deserialize)]
struct PullProgress {
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
}

impl OllamaProvider {
    pub fn new(base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_default();

        Self { client, base_url }
    }

    pub async fn generate_with_model(
        &self,
        model: &str,
        request: LlmRequest,
    ) -> Result<LlmResponse, LlmError> {
        let start = Instant::now();
        let url = format!("{}/api/generate", self.base_url);

        log::info!("[Ollama] POST {} — model={}, json_mode={}, temp={}, max_tokens={}", url, model, request.json_mode, request.temperature, request.max_tokens);
        log::debug!("[Ollama] system_prompt length={}, user_prompt length={}", request.system_prompt.len(), request.user_prompt.len());

        let body = GenerateRequest {
            model: model.to_string(),
            system: request.system_prompt,
            prompt: request.user_prompt,
            stream: false,
            format: if request.json_mode {
                Some("json".to_string())
            } else {
                None
            },
            options: GenerateOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            },
        };

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    log::error!("[Ollama] Request timed out after 120s");
                    LlmError::Timeout(120)
                } else if e.is_connect() {
                    log::error!("[Ollama] Connection failed to {} — is Ollama running?", self.base_url);
                    LlmError::OllamaUnavailable
                } else {
                    log::error!("[Ollama] Request failed: {}", e);
                    LlmError::InferenceFailed(e.to_string())
                }
            })?;

        let status = resp.status();
        log::info!("[Ollama] Response status: {}", status);

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            log::error!("[Ollama] Error response: {}", text);
            if text.contains("not found") {
                return Err(LlmError::ModelNotFound(model.to_string()));
            }
            return Err(LlmError::InferenceFailed(format!(
                "HTTP {}: {}",
                status, text
            )));
        }

        let gen_resp: GenerateResponse = resp
            .json()
            .await
            .map_err(|e| {
                log::error!("[Ollama] Failed to parse JSON response: {}", e);
                LlmError::InferenceFailed(e.to_string())
            })?;

        let elapsed = start.elapsed().as_millis() as u64;
        log::info!(
            "[Ollama] Completed in {}ms — tokens={:?}, response length={}",
            elapsed, gen_resp.eval_count, gen_resp.response.len()
        );

        Ok(LlmResponse {
            content: gen_resp.response,
            tokens_used: gen_resp.eval_count,
            duration_ms: elapsed,
        })
    }

    pub async fn is_available(&self) -> bool {
        log::info!("[Ollama] Checking availability at {}", self.base_url);
        match self
            .client
            .get(&self.base_url)
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
        {
            Ok(resp) => {
                log::info!("[Ollama] Available — status: {}", resp.status());
                true
            }
            Err(e) => {
                log::warn!("[Ollama] Unavailable — {}", e);
                false
            }
        }
    }

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, LlmError> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map_err(|_| LlmError::OllamaUnavailable)?;

        let tags: TagsResponse = resp
            .json()
            .await
            .map_err(|e| LlmError::InferenceFailed(e.to_string()))?;

        Ok(tags
            .models
            .into_iter()
            .map(|m| ModelInfo {
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
            })
            .collect())
    }

    pub async fn pull_model(
        &self,
        app_handle: tauri::AppHandle,
        model_name: &str,
    ) -> Result<(), LlmError> {
        let resp = self
            .client
            .post(format!("{}/api/pull", self.base_url))
            .json(&serde_json::json!({
                "name": model_name,
                "stream": true
            }))
            .timeout(std::time::Duration::from_secs(3600))
            .send()
            .await
            .map_err(|_| LlmError::OllamaUnavailable)?;

        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;

        let mut buf = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| LlmError::InferenceFailed(e.to_string()))?;
            buf.extend_from_slice(&chunk);

            // Parse NDJSON lines
            while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                let line: Vec<u8> = buf.drain(..=pos).collect();
                if let Ok(progress) = serde_json::from_slice::<PullProgress>(&line) {
                    let _ = app_handle.emit(
                        "llm-download-progress",
                        DownloadProgress {
                            status: progress.status.clone(),
                            completed: progress.completed,
                            total: progress.total,
                        },
                    );
                }
            }
        }

        // Handle remaining data in buffer
        if !buf.is_empty() {
            if let Ok(progress) = serde_json::from_slice::<PullProgress>(&buf) {
                let _ = app_handle.emit(
                    "llm-download-progress",
                    DownloadProgress {
                        status: progress.status,
                        completed: progress.completed,
                        total: progress.total,
                    },
                );
            }
        }

        Ok(())
    }
}
