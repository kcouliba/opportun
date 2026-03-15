use crate::llm::provider::{DownloadProgress, LlmError, LlmRequest, LlmResponse, ModelInfo};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

const DEFAULT_HF_REPO: &str = "bartowski/Phi-3.5-mini-instruct-GGUF";
const DEFAULT_MODEL_FILE: &str = "Phi-3.5-mini-instruct-Q4_K_M.gguf";

struct LoadedModel {
    backend: LlamaBackend,
    model: LlamaModel,
}

pub struct EmbeddedProvider {
    loaded: Arc<Mutex<Option<LoadedModel>>>,
    pub models_dir: PathBuf,
}

impl EmbeddedProvider {
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            loaded: Arc::new(Mutex::new(None)),
            models_dir,
        }
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
        let start = std::time::Instant::now();

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
                let model =
                    LlamaModel::load_from_file(&backend, &model_path, &model_params).map_err(
                        |e| LlmError::InferenceFailed(format!("Model load failed: {}", e)),
                    )?;

                log::info!("[Embedded] Model loaded successfully");
                *guard = Some(LoadedModel { backend, model });
            }

            let loaded_ref = guard.as_ref().unwrap();

            // Build the full prompt using chat template format
            let full_prompt = format!(
                "<|system|>\n{}<|end|>\n<|user|>\n{}<|end|>\n<|assistant|>\n",
                request.system_prompt, request.user_prompt
            );

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

            // Create batch and fill with prompt tokens
            let mut batch = LlamaBatch::new(512, 1);
            let last_idx = tokens.len() as i32 - 1;
            for (i, token) in (0_i32..).zip(tokens.iter()) {
                batch.add(*token, i, &[0], i == last_idx).map_err(|e| {
                    LlmError::InferenceFailed(format!("Batch add failed: {}", e))
                })?;
            }

            // Decode prompt
            ctx.decode(&mut batch).map_err(|e| {
                LlmError::InferenceFailed(format!("Prompt decode failed: {}", e))
            })?;

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
            let max_tokens = if request.max_tokens > 0 {
                request.max_tokens as i32
            } else {
                2048
            };

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
        })
        .await
        .map_err(|e| LlmError::InferenceFailed(format!("Inference task failed: {}", e)))?
    }
}
