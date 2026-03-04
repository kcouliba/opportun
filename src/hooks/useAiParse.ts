import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ParsedJobDescription } from "@/types/index";

export function useAiParse() {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseWithAi = useCallback(async (text: string): Promise<ParsedJobDescription | null> => {
    setParsing(true);
    setError(null);

    try {
      const result = await invoke<ParsedJobDescription>("parse_job_ai", { text });
      setParsing(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : "AI parsing failed";
      setError(msg);
      setParsing(false);
      return null;
    }
  }, []);

  return { parseWithAi, parsing, error };
}
