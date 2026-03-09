import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ParsedProfileData } from "@/types/index";

export function useProfileImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromFile = useCallback(async (): Promise<ParsedProfileData | null> => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "LinkedIn PDF",
            extensions: ["pdf", "txt", "md"],
          },
        ],
      });
      if (!selected) return null;

      setLoading(true);
      const text = await invoke<string>("read_file_text", { path: selected });
      const result = await invoke<ParsedProfileData>("parse_profile_text", { text });
      setLoading(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to import file";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  const importFromText = useCallback(async (text: string): Promise<ParsedProfileData | null> => {
    setError(null);
    setLoading(true);
    try {
      const result = await invoke<ParsedProfileData>("parse_profile_text", { text });
      setLoading(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to parse text";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  const importFromPath = useCallback(async (path: string): Promise<ParsedProfileData | null> => {
    setLoading(true);
    setError(null);
    try {
      const text = await invoke<string>("read_file_text", { path });
      const result = await invoke<ParsedProfileData>("parse_profile_text", { text });
      setLoading(false);
      return result;
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to import file";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  // Resume/CV import: AI-first with regex fallback
  const importResumeFromText = useCallback(async (text: string): Promise<ParsedProfileData | null> => {
    setError(null);
    setLoading(true);
    try {
      const result = await invoke<ParsedProfileData>("parse_resume_ai", { text });
      setLoading(false);
      return result;
    } catch {
      // AI failed — fall back to regex parser
      try {
        const result = await invoke<ParsedProfileData>("parse_profile_text", { text });
        setLoading(false);
        return result;
      } catch (e2) {
        const msg = typeof e2 === "string" ? e2 : "Failed to parse resume";
        setError(msg);
        setLoading(false);
        return null;
      }
    }
  }, []);

  const importResumeFromFile = useCallback(async (): Promise<ParsedProfileData | null> => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Resume / CV",
            extensions: ["pdf", "txt", "md", "doc", "docx"],
          },
        ],
      });
      if (!selected) return null;

      setLoading(true);
      const text = await invoke<string>("read_file_text", { path: selected });
      return await importResumeFromText(text);
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to import file";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, [importResumeFromText]);

  const importResumeFromPath = useCallback(async (path: string): Promise<ParsedProfileData | null> => {
    setLoading(true);
    setError(null);
    try {
      const text = await invoke<string>("read_file_text", { path });
      return await importResumeFromText(text);
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to import file";
      setError(msg);
      setLoading(false);
      return null;
    }
  }, [importResumeFromText]);

  return {
    importFromFile, importFromPath, importFromText,
    importResumeFromFile, importResumeFromPath, importResumeFromText,
    loading, error,
  };
}
