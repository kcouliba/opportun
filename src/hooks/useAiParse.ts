import { useState, useCallback } from "react";
import { useAiQueue } from "@/components/AiQueue";
import type { ParsedJobDescription } from "@/types/index";

export function useAiParse() {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enqueue } = useAiQueue();

  const parseWithAi = useCallback(async (text: string): Promise<ParsedJobDescription | null> => {
    setParsing(true);
    setError(null);

    try {
      const result = await enqueue<ParsedJobDescription>("parse_job_ai", { text }, "Parsing job description");
      setParsing(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : (e instanceof Error ? e.message : "AI parsing failed");
      setError(msg);
      setParsing(false);
      return null;
    }
  }, [enqueue]);

  return { parseWithAi, parsing, error };
}
