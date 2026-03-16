/// GBNF grammar strings for constrained JSON generation with llama.cpp.
///
/// Each grammar enforces valid JSON matching the expected output schema,
/// preventing small models from producing malformed or off-schema output.

// ── Shared GBNF primitives ──────────────────────────────────────────────────
//
// Every grammar must be self-contained, so we define a macro that appends
// the common JSON primitives to a schema-specific set of rules.

macro_rules! gbnf {
    ($specific:expr) => {
        concat!(
            $specific,
            "\n",
            // ── primitives ──
            r#"ws ::= [ \t\n\r]*
string ::= "\"" ([^"\\] | "\\" ["\\/bfnrt])* "\""
number ::= "-"? [0-9]+ ("." [0-9]+)?
opt-string ::= string | "null"
opt-number ::= number | "null"
string-array ::= "[" ws "]" | "[" ws string (ws "," ws string)* ws "]"
opt-string-array ::= string-array | "null"
"#
        )
    };
}

// ── ParsedJobDescription (basic) ────────────────────────────────────────────

pub const JOB_PARSING_BASIC: &str = gbnf!(
    r#"root ::= "{" ws
  "\"title\"" ws ":" ws opt-string ws "," ws
  "\"client\"" ws ":" ws opt-string ws "," ws
  "\"technologies\"" ws ":" ws opt-string-array ws "," ws
  "\"rate\"" ws ":" ws opt-number ws "," ws
  "\"location\"" ws ":" ws opt-string ws "," ws
  "\"remotePolicy\"" ws ":" ws opt-string ws "," ws
  "\"description\"" ws ":" ws opt-string
ws "}"
"#
);

// ── LeadAnalysis (basic) ────────────────────────────────────────────────────

pub const LEAD_ANALYSIS_BASIC: &str = gbnf!(
    r#"root ::= "{" ws
  "\"overallFit\"" ws ":" ws string ws "," ws
  "\"fitSummary\"" ws ":" ws string ws "," ws
  "\"strengths\"" ws ":" ws string-array ws "," ws
  "\"risks\"" ws ":" ws string-array ws "," ws
  "\"rateAdvice\"" ws ":" ws opt-string
ws "}"
"#
);

// ── ActivityInsight ─────────────────────────────────────────────────────────

pub const ACTIVITY_INSIGHT: &str = gbnf!(
    r#"root ::= "{" ws
  "\"summary\"" ws ":" ws string ws "," ws
  "\"tone\"" ws ":" ws string ws "," ws
  "\"keyTopics\"" ws ":" ws string-array ws "," ws
  "\"nextStepSuggestion\"" ws ":" ws opt-string
ws "}"
"#
);

// ── Resume basic info (decomposed call 1) ───────────────────────────────────

pub const RESUME_BASIC_INFO: &str = gbnf!(
    r#"root ::= "{" ws
  "\"name\"" ws ":" ws opt-string ws "," ws
  "\"title\"" ws ":" ws opt-string ws "," ws
  "\"bio\"" ws ":" ws opt-string ws "," ws
  "\"yearsExperience\"" ws ":" ws opt-number ws "," ws
  "\"location\"" ws ":" ws opt-string ws "," ws
  "\"technologies\"" ws ":" ws opt-string-array ws "," ws
  "\"domains\"" ws ":" ws opt-string-array ws "," ws
  "\"languages\"" ws ":" ws opt-string-array
ws "}"
"#
);

// ── Resume basic missions (decomposed call 2) ──────────────────────────────

pub const RESUME_BASIC_MISSIONS: &str = gbnf!(
    r#"mission ::= "{" ws
  "\"client\"" ws ":" ws string ws "," ws
  "\"title\"" ws ":" ws string ws "," ws
  "\"description\"" ws ":" ws opt-string ws "," ws
  "\"startDate\"" ws ":" ws opt-string ws "," ws
  "\"endDate\"" ws ":" ws opt-string
ws "}"
missions-array ::= "[" ws "]" | "[" ws mission (ws "," ws mission)* ws "]"
root ::= "{" ws "\"missions\"" ws ":" ws missions-array ws "}"
"#
);

// ── Interview prep: technical questions (decomposed call 1) ─────────────────

pub const INTERVIEW_PREP_TECHNICAL: &str = gbnf!(
    r#"question-obj ::= "{" ws
  "\"question\"" ws ":" ws string ws "," ws
  "\"suggestedAnswer\"" ws ":" ws string ws "," ws
  "\"tips\"" ws ":" ws string
ws "}"
question-array ::= "[" ws question-obj (ws "," ws question-obj)* ws "]"
root ::= "{" ws "\"technicalQuestions\"" ws ":" ws question-array ws "}"
"#
);

// ── Interview prep: behavioral + opening (decomposed call 2) ────────────────

pub const INTERVIEW_PREP_BEHAVIORAL: &str = gbnf!(
    r#"question-to-ask ::= "{" ws
  "\"question\"" ws ":" ws string ws "," ws
  "\"why\"" ws ":" ws string
ws "}"
qta-array ::= "[" ws question-to-ask (ws "," ws question-to-ask)* ws "]"
root ::= "{" ws
  "\"opening\"" ws ":" ws string ws "," ws
  "\"behavioralQuestions\"" ws ":" ws string-array ws "," ws
  "\"questionsToAsk\"" ws ":" ws qta-array ws "," ws
  "\"redFlags\"" ws ":" ws string-array
ws "}"
"#
);

// ── Interview prep: rate + closing (decomposed call 3) ──────────────────────

pub const INTERVIEW_PREP_RATE: &str = gbnf!(
    r#"rate-neg ::= "{" ws
  "\"strategy\"" ws ":" ws string ws "," ws
  "\"talkingPoints\"" ws ":" ws string-array
ws "}"
root ::= "{" ws
  "\"rateNegotiation\"" ws ":" ws rate-neg ws "," ws
  "\"closingAdvice\"" ws ":" ws string
ws "}"
"#
);

// ── Job board extract (array of listings) ───────────────────────────────────

pub const JOB_BOARD_EXTRACT: &str = gbnf!(
    r#"listing ::= "{" ws
  "\"title\"" ws ":" ws opt-string ws "," ws
  "\"client\"" ws ":" ws opt-string ws "," ws
  "\"location\"" ws ":" ws opt-string ws "," ws
  "\"rate\"" ws ":" ws opt-number ws "," ws
  "\"snippet\"" ws ":" ws opt-string ws "," ws
  "\"url\"" ws ":" ws opt-string
ws "}"
root ::= "[" ws "]" | "[" ws listing (ws "," ws listing)* ws "]"
"#
);

#[cfg(test)]
mod tests {
    use super::*;

    /// Validate structural integrity of a GBNF grammar string.
    fn validate_grammar_structure(grammar: &str, name: &str) {
        assert!(!grammar.is_empty(), "{name}: grammar is empty");
        assert!(
            grammar.contains("root ::="),
            "{name}: missing root ::= rule"
        );

        // In GBNF, all bracket types are globally balanced:
        // - character classes [...]
        // - grouping (...)
        // - string literals "{" / "}" appear in matching pairs
        let open_parens = grammar.matches('(').count();
        let close_parens = grammar.matches(')').count();
        assert_eq!(open_parens, close_parens, "{name}: unbalanced parentheses");

        let open_brackets = grammar.matches('[').count();
        let close_brackets = grammar.matches(']').count();
        assert_eq!(open_brackets, close_brackets, "{name}: unbalanced square brackets");

        let open_braces = grammar.matches('{').count();
        let close_braces = grammar.matches('}').count();
        assert_eq!(open_braces, close_braces, "{name}: unbalanced curly braces");

        // Check balanced quotes
        let quote_count = grammar.matches('"').count();
        assert_eq!(
            quote_count % 2,
            0,
            "{name}: unbalanced quotes ({quote_count} total)"
        );
    }

    #[test]
    fn validate_all_grammars() {
        validate_grammar_structure(JOB_PARSING_BASIC, "JOB_PARSING_BASIC");
        validate_grammar_structure(LEAD_ANALYSIS_BASIC, "LEAD_ANALYSIS_BASIC");
        validate_grammar_structure(ACTIVITY_INSIGHT, "ACTIVITY_INSIGHT");
        validate_grammar_structure(RESUME_BASIC_INFO, "RESUME_BASIC_INFO");
        validate_grammar_structure(RESUME_BASIC_MISSIONS, "RESUME_BASIC_MISSIONS");
        validate_grammar_structure(INTERVIEW_PREP_TECHNICAL, "INTERVIEW_PREP_TECHNICAL");
        validate_grammar_structure(INTERVIEW_PREP_BEHAVIORAL, "INTERVIEW_PREP_BEHAVIORAL");
        validate_grammar_structure(INTERVIEW_PREP_RATE, "INTERVIEW_PREP_RATE");
        validate_grammar_structure(JOB_BOARD_EXTRACT, "JOB_BOARD_EXTRACT");
    }
}
