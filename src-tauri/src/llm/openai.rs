use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::provider::{LlmError, LlmRequest, LlmResponse};

pub struct OpenAiProvider {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<ResponseFormat>,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

#[derive(Deserialize)]
struct Usage {
    completion_tokens: Option<u64>,
}

impl OpenAiProvider {
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
        let url = format!("{}/chat/completions", self.base_url);

        log::info!(
            "[OpenAI] POST {} — model={}, json_mode={}, temp={}, max_tokens={}",
            url, model, request.json_mode, request.temperature, request.max_tokens
        );

        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: request.system_prompt,
            },
            ChatMessage {
                role: "user".to_string(),
                content: request.user_prompt,
            },
        ];

        let response_format = if request.json_mode {
            Some(ResponseFormat {
                format_type: "json_object".to_string(),
            })
        } else {
            None
        };

        let body = ChatRequest {
            model: model.to_string(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            response_format,
        };

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    log::error!("[OpenAI] Request timed out after 120s");
                    LlmError::Timeout(120)
                } else if e.is_connect() {
                    log::error!("[OpenAI] Connection failed to {}", self.base_url);
                    LlmError::ProviderUnavailable
                } else {
                    log::error!("[OpenAI] Request failed: {}", e);
                    LlmError::InferenceFailed(e.to_string())
                }
            })?;

        let status = resp.status();
        log::info!("[OpenAI] Response status: {}", status);

        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            log::error!("[OpenAI] Error response: {}", text);
            return Err(LlmError::InferenceFailed(format!(
                "HTTP {}: {}",
                status, text
            )));
        }

        let chat_resp: ChatResponse = resp.json().await.map_err(|e| {
            log::error!("[OpenAI] Failed to parse JSON response: {}", e);
            LlmError::InferenceFailed(e.to_string())
        })?;

        let content = chat_resp
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_default();

        let tokens_used = chat_resp
            .usage
            .and_then(|u| u.completion_tokens);

        let elapsed = start.elapsed().as_millis() as u64;
        log::info!(
            "[OpenAI] Completed in {}ms — tokens={:?}, response length={}",
            elapsed, tokens_used, content.len()
        );

        Ok(LlmResponse {
            content,
            tokens_used,
            duration_ms: elapsed,
        })
    }
}
