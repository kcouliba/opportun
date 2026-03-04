import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAiSettings } from "@/hooks/useAiSettings";
import { useToast } from "@/components/Toast";
import DownloadProgressBar from "@/components/DownloadProgressBar";
import type { DownloadProgress } from "@/types/index";

const MODEL_PRESETS = ["llama3.2:3b", "mistral:7b", "phi3:mini"];

export default function AiSettingsPanel() {
  const { settings, status, updateSettings, checkStatus } = useAiSettings();
  const { showToast } = useToast();
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<DownloadProgress | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("llm-download-progress", (event) => {
      setPullProgress(event.payload);
      if (event.payload.status === "success") {
        setPulling(false);
        setPullProgress(null);
        showToast("Model downloaded successfully", "success");
        checkStatus();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showToast, checkStatus]);

  if (!settings) return null;

  const handleToggle = async () => {
    try {
      await updateSettings({ enabled: !settings.enabled });
    } catch {
      showToast("Failed to update AI settings", "error");
    }
  };

  const handleModelChange = async (modelName: string) => {
    try {
      await updateSettings({ modelName });
    } catch {
      showToast("Failed to update model", "error");
    }
  };

  const handleUrlChange = async (ollamaUrl: string) => {
    try {
      await updateSettings({ ollamaUrl });
    } catch {
      showToast("Failed to update URL", "error");
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    await checkStatus();
    setChecking(false);
  };

  const handlePullModel = async () => {
    setPulling(true);
    setPullProgress({ status: "starting...", completed: null, total: null });
    try {
      await invoke("pull_ai_model", { modelName: settings.modelName });
      setPulling(false);
      setPullProgress(null);
      showToast("Model downloaded successfully", "success");
      checkStatus();
    } catch (e) {
      setPulling(false);
      setPullProgress(null);
      showToast(typeof e === "string" ? e : "Failed to pull model", "error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Enable AI Features</p>
          <p className="text-xs text-gray-500">
            Requires Ollama running locally
          </p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {settings.enabled && (
        <>
          {/* Status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                status?.available ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {status?.available ? "Ollama connected" : "Ollama not reachable"}
            </span>
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="text-xs text-blue-600 hover:text-blue-700 ml-auto"
            >
              {checking ? "Checking..." : "Refresh"}
            </button>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Model
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.modelName}
                onChange={(e) => handleModelChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., llama3.2:3b"
              />
            </div>
            <div className="flex gap-1 mt-1">
              {MODEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleModelChange(preset)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    settings.modelName === preset
                      ? "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Ollama URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ollama URL
            </label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://localhost:11434"
            />
          </div>

          {/* Pull Model */}
          <div>
            <button
              onClick={handlePullModel}
              disabled={pulling || !settings.modelName}
              className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {pulling ? "Downloading..." : `Pull "${settings.modelName}"`}
            </button>
            {pullProgress && (
              <div className="mt-2">
                <DownloadProgressBar
                  status={pullProgress.status}
                  completed={pullProgress.completed}
                  total={pullProgress.total}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
