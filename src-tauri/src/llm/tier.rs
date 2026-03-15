/// Model capability tier — determines prompting strategy.
///
/// Detected automatically from provider + model name.
/// Never user-configured.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelTier {
    /// Small models (< 4B params): simplified prompts, GBNF grammars, decomposed calls
    Basic,
    /// Medium local models (7B+): full prompts
    Standard,
    /// Cloud APIs (OpenAI, Anthropic): full prompts, most capable
    Advanced,
}

impl ModelTier {
    /// Detect tier from provider name and model identifier.
    pub fn detect(provider: &str, model_name: &str) -> Self {
        match provider {
            "embedded" => ModelTier::Basic,
            "openai" | "anthropic" => ModelTier::Advanced,
            _ => {
                // Ollama: infer from model name size tags
                let lower = model_name.to_lowercase();
                if lower.contains(":1b")
                    || lower.contains(":1.5b")
                    || lower.contains(":3b")
                    || lower.contains("-1b")
                    || lower.contains("-3b")
                {
                    ModelTier::Basic
                } else {
                    ModelTier::Standard
                }
            }
        }
    }

    pub fn is_basic(&self) -> bool {
        *self == ModelTier::Basic
    }
}
