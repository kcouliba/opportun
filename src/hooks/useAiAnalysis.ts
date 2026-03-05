import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LeadAnalysis, Document } from "@/types/index";

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

  const loadSavedAnalysis = useCallback((documents: Document[]): boolean => {
    const analysisDoc = documents
      .filter((d) => d.type === "lead_analysis")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (!analysisDoc) return false;

    try {
      const parsed = JSON.parse(analysisDoc.content) as LeadAnalysis;
      setAnalysis(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return { analysis, analyzeLead, analyzing, error, reset, loadSavedAnalysis };
}
