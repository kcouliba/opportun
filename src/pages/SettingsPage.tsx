import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import AiSettingsPanel from "@/components/AiSettingsPanel";
import McpPanel from "@/components/McpPanel";
import SyncPanel from "@/components/SyncPanel";
import { useLeadSources } from "@/hooks/useLeadSources";
import { useToast } from "@/components/Toast";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [sourceInput, setSourceInput] = useState("");
  const { sources: leadSources, addSource, removeSource } = useLeadSources();
  const [restoring, setRestoring] = useState(false);

  const handleExportBackup = async () => {
    try {
      const date = new Date().toISOString().split("T")[0];
      const filePath = await save({
        defaultPath: `opportun-backup-${date}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (filePath) {
        await invoke("backup_database", { destPath: filePath });
        showToast("Backup exported successfully", "success");
      }
    } catch (e) {
      showToast(`Backup failed: ${e}`, "error");
    }
  };

  const handleImportBackup = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
        directory: false,
      });
      if (!filePath) return;

      await invoke("validate_database", { path: filePath });
      setRestoring(true);
      await invoke("restore_database", { sourcePath: filePath });
      showToast("Database restored! Reloading...", "success");
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setRestoring(false);
      showToast(`Restore failed: ${e}`, "error");
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">
            App configuration for lead sources and AI features.
          </p>
        </header>

        <div className="space-y-8">
          {/* Lead Sources */}
          <Section title="Lead Sources">
            <Field label="Sources" hint="Manage the dropdown options for lead source">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (sourceInput.trim()) {
                        addSource(sourceInput);
                        setSourceInput("");
                      }
                    }
                  }}
                  className="input flex-1"
                  placeholder="e.g., malt, welcometothejungle..."
                />
                <button
                  type="button"
                  onClick={() => {
                    if (sourceInput.trim()) {
                      addSource(sourceInput);
                      setSourceInput("");
                    }
                  }}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList items={leadSources} onRemove={removeSource} />
            </Field>
          </Section>

          {/* AI Settings */}
          <Section title="AI Settings">
            <AiSettingsPanel />
          </Section>

          {/* MCP Integration */}
          <Section title="MCP Integration">
            <McpPanel />
          </Section>

          {/* Sync (feature-flagged in backend) */}
          <SyncSection />

          {/* Data */}
          <Section title="Data">
            <Field label="Export Backup" hint="Save a full copy of your database">
              <button onClick={handleExportBackup} className="btn btn-secondary">
                Export Backup
              </button>
            </Field>
            <Field label="Import Backup" hint="Restore from a previous backup">
              <button
                onClick={handleImportBackup}
                disabled={restoring}
                className="btn btn-secondary"
              >
                {restoring ? "Restoring..." : "Import Backup"}
              </button>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                This will replace all current data and reload the app.
              </p>
            </Field>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {hint && <span className="font-normal text-gray-500 ml-2">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function SyncSection() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    invoke("get_sync_status")
      .then(() => setAvailable(true))
      .catch((e) => setAvailable(!String(e).includes("unknown command")));
  }, []);

  if (available === null || !available) return null;

  return (
    <Section title="Sync">
      <SyncPanel />
    </Section>
  );
}

function TagList({ items, onRemove }: { items: string[]; onRemove: (item: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="hover:text-red-600 dark:hover:text-red-400"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
