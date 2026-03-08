import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "@/components/Toast";
import DownloadProgressBar from "@/components/DownloadProgressBar";
import type { AiSettings, DownloadProgress } from "@/types/index";

const OLLAMA_MODEL_PRESETS = ["llama3.2:3b", "mistral:7b", "phi3:mini"];
const OPENAI_MODEL_PRESETS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
const ANTHROPIC_MODEL_PRESETS = [
  "claude-sonnet-4-5-20250514",
  "claude-haiku-4-5-20251001",
];

const PROVIDERS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
] as const;

interface AiSettingsPanelProps {
  /** Controlled mode: external state + onChange instead of auto-saving */
  value?: AiSettings | null;
  onChange?: (settings: AiSettings) => void;
}

export default function AiSettingsPanel({ value, onChange }: AiSettingsPanelProps) {
  const controlled = value !== undefined && onChange !== undefined;

  const { showToast } = useToast();
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<DownloadProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [showBaseUrl, setShowBaseUrl] = useState(false);

  // Internal state for uncontrolled mode
  const [internalSettings, setInternalSettings] = useState<AiSettings | null>(null);
  const [internalStatus, setInternalStatus] = useState<{
    available: boolean;
    modelAvailable: boolean;
    localModels: string[];
    provider: string;
  } | null>(null);

  // Status check (used in both modes)
  const [status, setStatus] = useState<{
    available: boolean;
    modelAvailable: boolean;
    localModels: string[];
    provider: string;
  } | null>(null);

  const settings = controlled ? value : internalSettings;

  useEffect(() => {
    if (!controlled) {
      invoke<AiSettings>("get_ai_settings")
        .then(setInternalSettings)
        .catch(() => {});
    }
  }, [controlled]);

  useEffect(() => {
    if (settings?.enabled) {
      invoke<{
        available: boolean;
        modelAvailable: boolean;
        localModels: string[];
        provider: string;
      }>("check_ai_status")
        .then((s) => {
          setStatus(s);
          if (!controlled) setInternalStatus(s);
        })
        .catch(() => {
          setStatus(null);
          if (!controlled) setInternalStatus(null);
        });
    }
  }, [settings?.enabled, settings?.provider, controlled]);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("llm-download-progress", (event) => {
      setPullProgress(event.payload);
      if (event.payload.status === "success") {
        setPulling(false);
        setPullProgress(null);
        showToast("Model downloaded successfully", "success");
        handleCheckStatus();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showToast]);

  if (!settings) return null;

  const provider = settings.provider || "ollama";
  const isOllama = provider === "ollama";
  const isApiProvider = provider === "openai" || provider === "anthropic";

  const update = async (patch: Partial<AiSettings>) => {
    const updated = { ...settings, ...patch };
    if (controlled) {
      onChange(updated);
    } else {
      try {
        const saved = await invoke<AiSettings>("update_ai_settings", { data: patch });
        setInternalSettings(saved);
      } catch {
        showToast("Failed to update AI settings", "error");
      }
    }
  };

  const handleToggle = () => update({ enabled: !settings.enabled });
  const handleModelChange = (modelName: string) => update({ modelName });
  const handleUrlChange = (ollamaUrl: string) => update({ ollamaUrl });
  const handleApiKeyChange = (apiKey: string) => update({ apiKey: apiKey || null });
  const handleProviderChange = (newProvider: string) => {
    const patch: Partial<AiSettings> = { provider: newProvider };
    // Set sensible defaults when switching providers
    if (newProvider === "ollama") {
      patch.modelName = "llama3.2:3b";
      patch.ollamaUrl = "http://localhost:11434";
    } else if (newProvider === "openai") {
      patch.modelName = "gpt-4o-mini";
      patch.ollamaUrl = "https://api.openai.com/v1";
    } else if (newProvider === "anthropic") {
      patch.modelName = "claude-sonnet-4-5-20250514";
      patch.ollamaUrl = "https://api.anthropic.com";
    }
    update(patch);
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const s = await invoke<{
        available: boolean;
        modelAvailable: boolean;
        localModels: string[];
        provider: string;
      }>("check_ai_status");
      setStatus(s);
      if (!controlled) setInternalStatus(s);
    } catch {
      setStatus(null);
    }
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
      handleCheckStatus();
    } catch (e) {
      setPulling(false);
      setPullProgress(null);
      showToast(typeof e === "string" ? e : "Failed to pull model", "error");
    }
  };

  const displayStatus = controlled ? status : internalStatus;

  const modelPresets = isOllama
    ? OLLAMA_MODEL_PRESETS
    : provider === "openai"
      ? OPENAI_MODEL_PRESETS
      : ANTHROPIC_MODEL_PRESETS;

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Enable AI Features</p>
          <p className="text-xs text-gray-500">
            {isOllama
              ? "Requires Ollama running locally"
              : `Uses ${provider === "openai" ? "OpenAI" : "Anthropic"} API with your key`}
          </p>
        </div>
        <button
          type="button"
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

      {/* Provider Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Provider
        </label>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleProviderChange(p.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                provider === p.value
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* Status */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  displayStatus?.available ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {isOllama
                  ? displayStatus?.available
                    ? "Ollama connected"
                    : "Ollama not reachable"
                  : displayStatus?.available
                    ? "API key configured"
                    : "API key missing"}
              </span>
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={checking}
                className="text-xs text-blue-600 hover:text-blue-700 ml-auto"
              >
                {checking ? "Checking..." : "Refresh"}
              </button>
            </div>
            {isOllama &&
              displayStatus?.available &&
              (() => {
                const modelReady = displayStatus.localModels?.includes(
                  settings.modelName,
                );
                return (
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        modelReady ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {modelReady
                        ? `${settings.modelName} ready`
                        : `${settings.modelName} not pulled`}
                    </span>
                  </div>
                );
              })()}
          </div>

          {/* API Key (for OpenAI / Anthropic) */}
          {isApiProvider && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={settings.apiKey || ""}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={
                  provider === "openai"
                    ? "sk-..."
                    : "sk-ant-..."
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored locally on your device. Never sent to our servers.
              </p>
            </div>
          )}

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
                placeholder={
                  isOllama
                    ? "e.g., llama3.2:3b"
                    : provider === "openai"
                      ? "e.g., gpt-4o-mini"
                      : "e.g., claude-sonnet-4-5-20250514"
                }
              />
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {modelPresets.map((preset) => {
                const isSelected = settings.modelName === preset;
                const isLocal =
                  isOllama && displayStatus?.localModels?.includes(preset);
                return (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => handleModelChange(preset)}
                    className={`text-xs px-2 py-0.5 rounded ${
                      isSelected
                        ? "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"
                        : isLocal
                          ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ollama URL (only for Ollama) */}
          {isOllama && (
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
          )}

          {/* Base URL override (for OpenAI — advanced) */}
          {provider === "openai" && (
            <div>
              <button
                type="button"
                onClick={() => setShowBaseUrl(!showBaseUrl)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showBaseUrl ? "Hide" : "Show"} advanced options
              </button>
              {showBaseUrl && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://api.openai.com/v1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Override for OpenAI-compatible APIs (Azure, OpenRouter, Groq, etc.)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Pull Model (Ollama only) */}
          {isOllama && (
            <div>
              <button
                type="button"
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
          )}
        </>
      )}
    </div>
  );
}
