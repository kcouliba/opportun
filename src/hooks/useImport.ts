import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ParsedJobDescription } from "@/types/index";

export function useImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = useCallback(async (url: string): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const text = await invoke<string>("fetch_url_text", { url });
      setLoading(false);
      return text;
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to fetch URL";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  const readFile = useCallback(async (): Promise<string | null> => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Documents",
            extensions: ["pdf", "txt", "md"],
          },
        ],
      });
      if (!selected) return null;

      setLoading(true);
      const text = await invoke<string>("read_file_text", { path: selected });
      setLoading(false);
      return text;
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to read file";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  const parseText = useCallback(
    async (text: string): Promise<ParsedJobDescription | null> => {
      setError(null);
      try {
        const result = await invoke<ParsedJobDescription>("parse_job_text", {
          text,
        });
        return result;
      } catch (e) {
        const msg = typeof e === "string" ? e : "Failed to parse text";
        setError(msg);
        return null;
      }
    },
    [],
  );

  return { fetchUrl, readFile, parseText, loading, error };
}
