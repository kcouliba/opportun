import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LeadAnalysis } from "@/types/index";

export function useAiAnalysis() {
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeLead = useCallback(async (leadId: string) => {
    setAnalyzing(true);
    setError(null);

    try {
      const result = await invoke<LeadAnalysis>("analyze_lead_ai", { leadId });
      setAnalysis(result);
      setAnalyzing(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : "AI analysis failed";
      setError(msg);
      setAnalyzing(false);
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return { analysis, analyzeLead, analyzing, error, reset };
}
