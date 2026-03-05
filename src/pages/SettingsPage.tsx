import { useState } from "react";
import AiSettingsPanel from "@/components/AiSettingsPanel";
import { useLeadSources } from "@/hooks/useLeadSources";

export default function SettingsPage() {
  const [sourceInput, setSourceInput] = useState("");
  const { sources: leadSources, addSource, removeSource } = useLeadSources();

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
