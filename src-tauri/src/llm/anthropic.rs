use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::provider::{LlmError, LlmRequest, LlmResponse};

pub struct AnthropicProvider {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

#[derive(Serialize)]
struct MessagesRequest {
    model: String,
    system: String,
    messages: Vec<Message>,
    temperature: f64,
    max_tokens: i64,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct MessagesResponse {
    content: Vec<ContentBlock>,
    #[serde(default)]
    usage: Option<AnthropicUsage>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    output_tokens: Option<u64>,
}

impl AnthropicProvider {
    pub fn new(api_key: String, base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_default();

        Self {
            client,
            base_url,
            api_key,
        }
    }

    pub async fn generate_with_model(
        &self,
        model: &str,
        request: LlmRequest,
    ) -> Result<LlmResponse, LlmError> {
        let start = Instant::now();
        let url = format!("{}/v1/messages", self.base_url);

        log::info!(
            "[Anthropic] POST {} — model={}, json_mode={}, temp={}, max_tokens={}",
            url, model, request.json_mode, request.temperature, request.max_tokens
        );

        let system_prompt = if request.json_mode {
            format!("Reply with valid JSON only.\n\n{}", request.system_prompt)
        } else {
            request.system_prompt
        };

        let body = MessagesRequest {
            model: model.to_string(),
            system: system_prompt,
            messages: vec![Message {
                role: "user".to_string(),
                content: request.user_prompt,
            }],
            temperature: request.temperature,
            max_tokens: request.max_tokens,
        };

        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    log::error!("[Anthropic] Request timed out after 120s");
                    LlmError::Timeout(120)
                } else if e.is_connect() {
                    log::error!("[Anthropic] Connection failed to {}", self.base_url);
                    LlmError::ProviderUnavailable
                } else {
                    log::error!("[Anthropic] Request failed: {}", e);
                    LlmError::InferenceFailed(e.to_string())
                }
            })?;

        let status = resp.status();
        log::info!("[Anthropic] Response status: {}", status);

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            log::error!("[Anthropic] Error response: {}", text);
            return Err(LlmError::InferenceFailed(format!(
                "HTTP {}: {}",
                status, text
            )));
        }

        let msg_resp: MessagesResponse = resp.json().await.map_err(|e| {
            log::error!("[Anthropic] Failed to parse JSON response: {}", e);
            LlmError::InferenceFailed(e.to_string())
        })?;

        let content = msg_resp
            .content
            .into_iter()
            .next()
            .map(|c| c.text)
            .unwrap_or_default();

        let tokens_used = msg_resp.usage.and_then(|u| u.output_tokens);

        let elapsed = start.elapsed().as_millis() as u64;
        log::info!(
            "[Anthropic] Completed in {}ms — tokens={:?}, response length={}",
            elapsed, tokens_used, content.len()
        );

        Ok(LlmResponse {
            content,
            tokens_used,
            duration_ms: elapsed,
        })
    }
}
