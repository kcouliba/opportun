import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import AiSettingsPanel from "@/components/AiSettingsPanel";
import ApiPanel from "@/components/ApiPanel";
import SyncPanel from "@/components/SyncPanel";
import { useLeadSources } from "@/hooks/useLeadSources";
import { useToast } from "@/components/Toast";

export default function SettingsPage() {
  const { t } = useTranslation();
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
        showToast(t("settings.backupExported"), "success");
      }
    } catch (e) {
      showToast(t("settings.backupFailed", { error: e }), "error");
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
      showToast(t("settings.dbRestored"), "success");
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setRestoring(false);
      showToast(t("settings.restoreFailed", { error: e }), "error");
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{t("settings.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t("settings.subtitle")}
          </p>
        </header>

        <div className="space-y-8">
          {/* Lead Sources */}
          <Section title={t("settings.leadSources")}>
            <Field label={t("settings.sources")} hint={t("settings.sourcesHint")}>
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
                  placeholder={t("settings.sourcePlaceholder")}
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
                  {t("common.add")}
                </button>
              </div>
              <TagList items={leadSources} onRemove={removeSource} />
            </Field>
          </Section>

          {/* Language */}
          <Section title={t("settings.language")}>
            <Field label={t("settings.language")} hint={t("settings.languageHint")}>
              <select
                value={i18n.language?.startsWith("fr") ? "fr" : "en"}
                onChange={(e) => {
                  i18n.changeLanguage(e.target.value);
                  localStorage.setItem("opportun-locale", e.target.value);
                }}
                className="input w-48"
              >
                <option value="en">{t("settings.english")}</option>
                <option value="fr">{t("settings.french")}</option>
              </select>
            </Field>
          </Section>

          {/* AI Settings */}
          <Section title={t("settings.aiSettings")}>
            <AiSettingsPanel />
          </Section>

          {/* API Integration */}
          <Section title={t("settings.apiIntegration")}>
            <ApiPanel />
          </Section>

          {/* Sync (feature-flagged in backend) */}
          <SyncSection />

          {/* Telemetry */}
          <TelemetrySection />

          {/* Data */}
          <Section title={t("settings.data")}>
            <Field label={t("settings.exportBackup")} hint={t("settings.exportBackupHint")}>
              <button onClick={handleExportBackup} className="btn btn-secondary">
                {t("settings.exportBackup")}
              </button>
            </Field>
            <Field label={t("settings.importBackup")} hint={t("settings.importBackupHint")}>
              <button
                onClick={handleImportBackup}
                disabled={restoring}
                className="btn btn-secondary"
              >
                {restoring ? t("settings.restoring") : t("settings.importBackup")}
              </button>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {t("settings.importWarning")}
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

function TelemetrySection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>("get_telemetry_enabled").then(setEnabled).catch(() => {});
  }, []);

  const toggle = async () => {
    try {
      const newVal = await invoke<boolean>("set_telemetry_enabled", { enabled: !enabled });
      setEnabled(newVal);
    } catch {
      // ignore
    }
  };

  if (enabled === null) return null;

  return (
    <Section title={t("settings.telemetry")}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{t("settings.telemetryLabel")}</p>
          <p className="text-xs text-gray-500">{t("settings.telemetryHint")}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">{t("settings.telemetryDetails")}</p>
    </Section>
  );
}

function SyncSection() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    invoke<boolean>("is_sync_available").then(setAvailable).catch(() => {});
  }, []);

  if (!available) return null;

  return (
    <Section title={t("settings.sync")}>
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
