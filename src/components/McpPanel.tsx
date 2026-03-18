import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";

interface ApiSettings {
  enabled: boolean;
  port: number;
  host: string;
  token: string;
}

export default function McpPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [hostInput, setHostInput] = useState("");

  const load = () => {
    invoke<ApiSettings>("get_api_settings").then((s) => {
      setSettings(s);
      setPortInput(String(s.port));
      setHostInput(s.host);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const update = async (patch: { enabled?: boolean; port?: number; host?: string }) => {
    try {
      const updated = await invoke<ApiSettings>("update_api_settings", { data: patch });
      setSettings(updated);
      showToast(t("settings.apiUpdated"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleCopy = async () => {
    if (!settings?.token) return;
    await navigator.clipboard.writeText(settings.token);
    showToast(t("mcp.tokenCopied"), "success");
  };

  const handleRegenerate = async () => {
    try {
      const newToken = await invoke<string>("regenerate_mcp_token");
      setSettings((s) => s ? { ...s, token: newToken } : s);
      setRevealed(true);
      showToast(t("mcp.tokenRegenerated"), "success");
    } catch (e) {
      showToast(t("mcp.failedRegenerate", { error: e }), "error");
    }
  };

  if (!settings) {
    return <p className="text-sm text-gray-500">{t("common.loading")}</p>;
  }

  const masked = "\u2022".repeat(20);

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{t("settings.apiEnable")}</p>
          <p className="text-xs text-gray-500">{t("settings.apiEnableHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => update({ enabled: !settings.enabled })}
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

      {/* Port and Host */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("settings.apiPort")}
          </label>
          <input
            type="number"
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={() => {
              const p = parseInt(portInput, 10);
              if (p && p > 0 && p < 65536 && p !== settings.port) {
                update({ port: p });
              }
            }}
            className="input w-full"
            min={1}
            max={65535}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("settings.apiHost")}
          </label>
          <input
            type="text"
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            onBlur={() => {
              if (hostInput.trim() && hostInput !== settings.host) {
                update({ host: hostInput.trim() });
              }
            }}
            className="input w-full"
          />
        </div>
      </div>

      <p className="text-xs text-amber-600 dark:text-amber-400">
        {t("settings.apiRestartHint")}
      </p>

      {/* Token */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("mcp.bearerToken")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={revealed ? settings.token : masked}
            className="input flex-1 font-mono text-sm"
            onClick={(e) => {
              if (revealed) (e.target as HTMLInputElement).select();
            }}
          />
          <button
            onClick={() => setRevealed((r) => !r)}
            className="btn btn-secondary text-sm"
          >
            {revealed ? t("common.hide") : t("common.reveal")}
          </button>
          <button onClick={handleCopy} className="btn btn-secondary text-sm">
            {t("common.copyToClipboard")}
          </button>
        </div>
      </div>

      {/* Regenerate */}
      <div>
        <button onClick={handleRegenerate} className="btn btn-secondary text-sm">
          {t("mcp.regenerateToken")}
        </button>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          {t("mcp.regenerateWarning")}
        </p>
      </div>

      {/* How to use */}
      <div>
        <button
          onClick={() => setShowHelp((h) => !h)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showHelp ? t("mcp.hideInstructions") : t("mcp.howToUse")}
        </button>
        {showHelp && (
          <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono overflow-x-auto whitespace-pre">
{`// REST API (embedded in the app)
// Base URL: http://${settings.host}:${settings.port}/api

curl http://${settings.host}:${settings.port}/api/leads \\
  -H "Authorization: Bearer <your-token>"

curl -X POST http://${settings.host}:${settings.port}/api/leads \\
  -H "Authorization: Bearer <your-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"client":"Acme","title":"Dev Fullstack","source":"n8n"}'`}
          </pre>
        )}
      </div>
    </div>
  );
}
