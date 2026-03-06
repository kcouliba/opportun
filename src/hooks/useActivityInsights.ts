import { useState, useCallback } from "react";
import { useAiQueue } from "@/components/AiQueue";
import type { ActivityInsight, Document } from "@/types/index";

export function useActivityInsights() {
  const [insight, setInsight] = useState<ActivityInsight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enqueue } = useAiQueue();

  const analyzeActivities = useCallback(async (leadId: string) => {
    setAnalyzing(true);
    setError(null);

    try {
      const result = await enqueue<ActivityInsight>("analyze_activities_ai", { leadId }, "Analyzing activities");
      setInsight(result);
      setAnalyzing(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : (e instanceof Error ? e.message : "Activity analysis failed");
      setError(msg);
      setAnalyzing(false);
      return null;
    }
  }, [enqueue]);

  const loadSavedInsight = useCallback((documents: Document[]): boolean => {
    const insightDoc = documents
      .filter((d) => d.type === "activity_insights")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (!insightDoc) return false;

    try {
      const parsed = JSON.parse(insightDoc.content) as ActivityInsight;
      setInsight(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { insight, analyzeActivities, analyzing, error, loadSavedInsight };
}
