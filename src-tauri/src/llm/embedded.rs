use crate::llm::provider::{DownloadProgress, LlmError, LlmRequest, LlmResponse, ModelInfo};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

const DEFAULT_HF_REPO: &str = "bartowski/Phi-3.5-mini-instruct-GGUF";
const DEFAULT_MODEL_FILE: &str = "Phi-3.5-mini-instruct-Q4_K_M.gguf";

struct LoadedModel {
    backend: LlamaBackend,
    model: LlamaModel,
}

#[derive(Clone)]
pub struct EmbeddedProvider {
    loaded: Arc<Mutex<Option<LoadedModel>>>,
    pub models_dir: PathBuf,
    last_used: Arc<Mutex<Instant>>,
}

impl EmbeddedProvider {
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            loaded: Arc::new(Mutex::new(None)),
            models_dir,
            last_used: Arc::new(Mutex::new(Instant::now())),
        }
    }

    /// How long since the model was last used for inference.
    pub fn idle_duration(&self) -> Duration {
        self.last_used
            .lock()
            .map(|t| t.elapsed())
            .unwrap_or(Duration::ZERO)
    }

    /// Whether a model is currently loaded in memory.
    pub fn is_loaded(&self) -> bool {
        self.loaded.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    fn default_model_path(&self) -> PathBuf {
        self.models_dir.join(DEFAULT_MODEL_FILE)
    }

    /// Check if the default model file exists on disk.
    pub fn is_available(&self) -> bool {
        self.default_model_path().exists()
    }

    /// List GGUF model files in the models directory.
    pub fn list_models(&self) -> Vec<ModelInfo> {
        let Ok(entries) = std::fs::read_dir(&self.models_dir) else {
            return vec![];
        };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "gguf")
                    .unwrap_or(false)
            })
            .map(|e| {
                let meta = e.metadata().ok();
                ModelInfo {
                    name: e.file_name().to_string_lossy().to_string(),
                    size: meta.as_ref().map(|m| m.len()),
                    modified_at: None,
                }
            })
            .collect()
    }

    /// Download the default model from Hugging Face.
    pub async fn download_model(&self, app_handle: tauri::AppHandle) -> Result<(), LlmError> {
        let models_dir = self.models_dir.clone();

        // Ensure models directory exists
        std::fs::create_dir_all(&models_dir).map_err(|e| {
            LlmError::InferenceFailed(format!("Failed to create models dir: {}", e))
        })?;

        let _ = app_handle.emit(
            "llm-download-progress",
            DownloadProgress {
                status: "downloading".to_string(),
                completed: Some(0),
                total: None,
            },
        );

        // Download using hf-hub on a blocking thread
        let dest = models_dir.join(DEFAULT_MODEL_FILE);
        let app_handle_clone = app_handle.clone();

        tokio::task::spawn_blocking(move || {
            let api = hf_hub::api::sync::ApiBuilder::new()
                .with_progress(false)
                .build()
                .map_err(|e| LlmError::InferenceFailed(format!("HF API init failed: {}", e)))?;

            let repo = api.model(DEFAULT_HF_REPO.to_string());

            let _ = app_handle_clone.emit(
                "llm-download-progress",
                DownloadProgress {
                    status: "downloading".to_string(),
                    completed: Some(50),
                    total: Some(100),
                },
            );

            let downloaded_path = repo
                .get(DEFAULT_MODEL_FILE)
                .map_err(|e| LlmError::InferenceFailed(format!("Model download failed: {}", e)))?;

            // hf-hub caches to its own dir; copy/symlink to our models_dir
            if downloaded_path != dest {
                std::fs::copy(&downloaded_path, &dest).map_err(|e| {
                    LlmError::InferenceFailed(format!("Failed to copy model file: {}", e))
                })?;
                // Clean HF cache: path is {cache}/models--org--repo/snapshots/{hash}/{file}
                if let Some(model_cache_dir) = downloaded_path.ancestors().nth(3) {
                    let _ = std::fs::remove_dir_all(model_cache_dir);
                    log::info!("[Embedded] Cleaned HF cache at {:?}", model_cache_dir);
                }
            }

            let _ = app_handle_clone.emit(
                "llm-download-progress",
                DownloadProgress {
                    status: "success".to_string(),
                    completed: Some(100),
                    total: Some(100),
                },
            );

            Ok::<(), LlmError>(())
        })
        .await
        .map_err(|e| LlmError::InferenceFailed(format!("Download task failed: {}", e)))??;

        Ok(())
    }

    /// Drop the loaded model from memory to free RAM.
    pub fn unload(&self) {
        if let Ok(mut guard) = self.loaded.lock() {
            *guard = None;
            log::info!("[Embedded] Model unloaded from memory");
        }
    }

    /// Ensure the model is loaded, then run inference.
    pub async fn generate_with_model(
        &self,
        _model_name: &str,
        request: LlmRequest,
    ) -> Result<LlmResponse, LlmError> {
        let model_path = self.default_model_path();
        if !model_path.exists() {
            return Err(LlmError::ModelNotFound(
                "Embedded model not downloaded. Please download it first in Settings.".to_string(),
            ));
        }

        let loaded = self.loaded.clone();
        let last_used = self.last_used.clone();
        let start = Instant::now();

        // Compute max_tokens before moving into closure
        let max_tokens = if request.max_tokens > 0 {
            request.max_tokens as i32
        } else {
            2048
        };

        // Timeout: 60s base + 100ms per max_token, capped at 300s
        let timeout_secs = (60 + (max_tokens as u64) / 10).min(300);

        let result = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            tokio::task::spawn_blocking(move || {
                let mut guard = loaded.lock().map_err(|_| {
                    LlmError::InferenceFailed("Failed to acquire model lock".to_string())
                })?;

                // Load model if not already loaded
                if guard.is_none() {
                    log::info!("[Embedded] Loading model from {:?}...", model_path);
                    let backend = LlamaBackend::init().map_err(|e| {
                        LlmError::InferenceFailed(format!("Backend init failed: {}", e))
                    })?;

                    let model_params = LlamaModelParams::default();
                    #[cfg(any(
                        feature = "embedded-llm-cuda",
                        feature = "embedded-llm-metal",
                        feature = "embedded-llm-vulkan",
                    ))]
                    let model_params = model_params.with_n_gpu_layers(1000);

                    let model =
                        LlamaModel::load_from_file(&backend, &model_path, &model_params).map_err(
                            |e| LlmError::InferenceFailed(format!("Model load failed: {}", e)),
                        )?;

                    log::info!("[Embedded] Model loaded successfully");
                    *guard = Some(LoadedModel { backend, model });
                }

                let loaded_ref = guard.as_ref().unwrap();

                // Build the full prompt — try to read chat template from GGUF metadata
                let full_prompt = {
                    let messages = vec![
                        LlamaChatMessage::new("system".into(), request.system_prompt.clone())
                            .map_err(|e| LlmError::InferenceFailed(format!("Chat message error: {}", e)))?,
                        LlamaChatMessage::new("user".into(), request.user_prompt.clone())
                            .map_err(|e| LlmError::InferenceFailed(format!("Chat message error: {}", e)))?,
                    ];

                    match loaded_ref.model.chat_template(None) {
                        Ok(tmpl) => {
                            loaded_ref.model.apply_chat_template(&tmpl, &messages, true)
                                .map_err(|e| LlmError::InferenceFailed(format!("Chat template apply failed: {}", e)))?
                        }
                        Err(_) => {
                            // Fallback for models without embedded template
                            log::warn!("[Embedded] No chat template in GGUF, using Phi-3.5 fallback");
                            format!(
                                "<|system|>\n{}<|end|>\n<|user|>\n{}<|end|>\n<|assistant|>\n",
                                request.system_prompt, request.user_prompt
                            )
                        }
                    }
                };

                // Create context
                let ctx_size = NonZeroU32::new(4096).unwrap();
                let ctx_params = LlamaContextParams::default().with_n_ctx(Some(ctx_size));
                let mut ctx = loaded_ref
                    .model
                    .new_context(&loaded_ref.backend, ctx_params)
                    .map_err(|e| {
                        LlmError::InferenceFailed(format!("Context creation failed: {}", e))
                    })?;

                // Tokenize
                let tokens = loaded_ref
                    .model
                    .str_to_token(&full_prompt, AddBos::Always)
                    .map_err(|e| {
                        LlmError::InferenceFailed(format!("Tokenization failed: {}", e))
                    })?;

                // Guard: prompt must leave room for generation (ctx=4096, reserve 256 min)
                if tokens.len() > 3840 {
                    return Err(LlmError::InferenceFailed(format!(
                        "Prompt too long: {} tokens (max 3840 to leave room for generation)",
                        tokens.len()
                    )));
                }

                // Process prompt tokens in chunks to avoid batch overflow
                let chunk_size: usize = 512;
                let mut batch = LlamaBatch::new(chunk_size, 1);
                let last_idx = tokens.len() as i32 - 1;

                for chunk_start in (0..tokens.len()).step_by(chunk_size) {
                    batch.clear();
                    let chunk_end = (chunk_start + chunk_size).min(tokens.len());
                    for i in chunk_start..chunk_end {
                        batch.add(tokens[i], i as i32, &[0], i as i32 == last_idx).map_err(|e| {
                            LlmError::InferenceFailed(format!("Batch add failed: {}", e))
                        })?;
                    }
                    ctx.decode(&mut batch).map_err(|e| {
                        LlmError::InferenceFailed(format!("Prompt decode failed: {}", e))
                    })?;
                }

                // Set up sampler with optional grammar
                let sampler = if let Some(ref grammar_str) = request.gbnf_grammar {
                    let grammar_sampler =
                        LlamaSampler::grammar(&loaded_ref.model, grammar_str, "root").map_err(
                            |e| LlmError::InferenceFailed(format!("Grammar init failed: {}", e)),
                        )?;

                    let temp = request.temperature as f32;
                    if temp < 0.01 {
                        LlamaSampler::chain_simple([grammar_sampler, LlamaSampler::greedy()])
                    } else {
                        LlamaSampler::chain_simple([
                            grammar_sampler,
                            LlamaSampler::temp(temp),
                            LlamaSampler::dist(1234),
                        ])
                    }
                } else {
                    let temp = request.temperature as f32;
                    if temp < 0.01 {
                        LlamaSampler::greedy()
                    } else {
                        LlamaSampler::chain_simple([
                            LlamaSampler::temp(temp),
                            LlamaSampler::dist(1234),
                        ])
                    }
                };

                // Generate tokens
                let mut n_cur = batch.n_tokens();
                let mut output = String::new();
                let mut decoder = encoding_rs::UTF_8.new_decoder();
                let mut sampler = sampler;
                let mut tokens_generated = 0u64;

                while n_cur <= tokens.len() as i32 + max_tokens {
                    let token = sampler.sample(&ctx, batch.n_tokens() - 1);
                    sampler.accept(token);

                    // Check end of generation
                    if loaded_ref.model.is_eog_token(token) {
                        break;
                    }

                    // Decode token to string
                    if let Ok(piece) =
                        loaded_ref
                            .model
                            .token_to_piece(token, &mut decoder, true, None)
                    {
                        output.push_str(&piece);
                    }

                    tokens_generated += 1;

                    batch.clear();
                    batch.add(token, n_cur, &[0], true).map_err(|e| {
                        LlmError::InferenceFailed(format!("Batch add failed: {}", e))
                    })?;

                    n_cur += 1;

                    ctx.decode(&mut batch).map_err(|e| {
                        LlmError::InferenceFailed(format!("Decode failed: {}", e))
                    })?;
                }

                // Update last_used timestamp
                if let Ok(mut t) = last_used.lock() {
                    *t = Instant::now();
                }

                let duration_ms = start.elapsed().as_millis() as u64;
                log::info!(
                    "[Embedded] Generated {} tokens in {}ms ({:.1} t/s)",
                    tokens_generated,
                    duration_ms,
                    tokens_generated as f64 / (duration_ms as f64 / 1000.0)
                );

                Ok(LlmResponse {
                    content: output,
                    tokens_used: Some(tokens_generated),
                    duration_ms,
                })
            }),
        )
        .await;

        match result {
            Ok(inner) => inner.map_err(|e| LlmError::InferenceFailed(format!("Inference task failed: {}", e)))?,
            Err(_) => Err(LlmError::Timeout(timeout_secs)),
        }
    }
}
