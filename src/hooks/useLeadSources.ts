import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useLeadSources() {
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await invoke<string[]>("get_lead_sources");
      setSources(data);
    } catch {
      setSources(["recruiter", "linkedin", "freework", "comet", "referral", "direct", "other"]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addSource = useCallback(async (source: string) => {
    const trimmed = source.trim().toLowerCase();
    if (!trimmed || sources.includes(trimmed)) return;
    const updated = await invoke<string[]>("update_lead_sources", {
      sources: [...sources, trimmed],
    });
    setSources(updated);
  }, [sources]);

  const removeSource = useCallback(async (source: string) => {
    const updated = await invoke<string[]>("update_lead_sources", {
      sources: sources.filter((s) => s !== source),
    });
    setSources(updated);
  }, [sources]);

  return { sources, loading, addSource, removeSource };
}
