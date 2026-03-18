import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";

export default function McpPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    invoke<string>("get_mcp_token").then(setToken).catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    showToast(t("mcp.tokenCopied"), "success");
  };

  const handleRegenerate = async () => {
    try {
      const newToken = await invoke<string>("regenerate_mcp_token");
      setToken(newToken);
      setRevealed(true);
      showToast(t("mcp.tokenRegenerated"), "success");
    } catch (e) {
      showToast(t("mcp.failedRegenerate", { error: e }), "error");
    }
  };

  if (token === null) {
    return <p className="text-sm text-gray-500">{t("common.loading")}</p>;
  }

  const masked = "\u2022".repeat(20);

  return (
    <div className="space-y-4">
      {/* Token display */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("mcp.bearerToken")}
          <span className="font-normal text-gray-500 ml-2">
            {t("mcp.tokenHint")}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={revealed ? token : masked}
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
{`// REST API (embedded in the app, starts automatically)
// Base URL: http://127.0.0.1:3100/api

curl http://127.0.0.1:3100/api/leads \\
  -H "Authorization: Bearer <your-token>"

curl -X POST http://127.0.0.1:3100/api/leads \\
  -H "Authorization: Bearer <your-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"client":"Acme","title":"Dev Fullstack","source":"n8n"}'`}
          </pre>
        )}
      </div>
    </div>
  );
}
