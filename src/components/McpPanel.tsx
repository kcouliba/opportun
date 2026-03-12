import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";

export default function McpPanel() {
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
    showToast("Token copied to clipboard", "success");
  };

  const handleRegenerate = async () => {
    try {
      const newToken = await invoke<string>("regenerate_mcp_token");
      setToken(newToken);
      setRevealed(true);
      showToast("Token regenerated", "success");
    } catch (e) {
      showToast(`Failed to regenerate token: ${e}`, "error");
    }
  };

  if (token === null) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const masked = "\u2022".repeat(20);

  return (
    <div className="space-y-4">
      {/* Token display */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Bearer Token
          <span className="font-normal text-gray-500 ml-2">
            (used for HTTP transport authentication)
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
            {revealed ? "Hide" : "Reveal"}
          </button>
          <button onClick={handleCopy} className="btn btn-secondary text-sm">
            Copy
          </button>
        </div>
      </div>

      {/* Regenerate */}
      <div>
        <button onClick={handleRegenerate} className="btn btn-secondary text-sm">
          Regenerate Token
        </button>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Existing MCP client connections will need to be updated.
        </p>
      </div>

      {/* How to use */}
      <div>
        <button
          onClick={() => setShowHelp((h) => !h)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showHelp ? "Hide setup instructions" : "How to use"}
        </button>
        {showHelp && (
          <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono overflow-x-auto whitespace-pre">
{`// MCP client config (e.g., Claude Desktop)
{
  "mcpServers": {
    "opportun": {
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}`}
          </pre>
        )}
      </div>
    </div>
  );
}
