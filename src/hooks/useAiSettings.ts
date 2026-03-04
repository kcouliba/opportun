import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiSettings, AiSettingsInput, AiStatus } from "@/types/index";

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const data = await invoke<AiSettings>("get_ai_settings");
      setSettings(data);
    } catch {
      // AI settings table may not exist yet
    }
    setLoading(false);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const s = await invoke<AiStatus>("check_ai_status");
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings?.enabled) {
      checkStatus();
    }
  }, [settings?.enabled, checkStatus]);

  const updateSettings = useCallback(async (data: AiSettingsInput) => {
    const updated = await invoke<AiSettings>("update_ai_settings", { data });
    setSettings(updated);
    return updated;
  }, []);

  return {
    settings,
    status,
    loading,
    isAiEnabled: settings?.enabled ?? false,
    updateSettings,
    checkStatus,
    reload: loadSettings,
  };
}
