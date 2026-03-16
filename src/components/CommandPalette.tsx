import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface Command {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = [
    // Navigation
    { id: "dashboard", label: t("nav.dashboard"), section: t("nav.pipeline"), action: () => navigate("/") },
    { id: "pipeline", label: t("nav.pipeline"), section: t("nav.pipeline"), action: () => navigate("/leads") },
    { id: "sources", label: t("nav.sources"), section: t("nav.pipeline"), action: () => navigate("/sources") },
    { id: "activities", label: t("nav.activity"), section: t("nav.pipeline"), action: () => navigate("/activities") },
    { id: "missions", label: t("nav.missions"), section: t("nav.pipeline"), action: () => navigate("/missions") },
    { id: "analytics", label: t("nav.analytics"), section: t("nav.pipeline"), action: () => navigate("/analytics") },
    { id: "profile", label: t("nav.profile"), section: t("nav.pipeline"), action: () => navigate("/profile") },
    { id: "settings", label: t("nav.settings"), section: t("nav.pipeline"), action: () => navigate("/settings") },
    // Actions
    { id: "new-lead", label: t("newLead.title"), section: "Actions", shortcut: "Ctrl+N", action: () => navigate("/leads/new") },
    { id: "quick-capture", label: t("quickCapture.title"), section: "Actions", shortcut: "Ctrl+Shift+N", action: () => navigate("/leads/quick") },
    { id: "new-mission", label: t("newMission.title"), section: "Actions", action: () => navigate("/missions/new") },
  ];

  const filtered = query.trim()
    ? commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.section.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const execute = useCallback((cmd: Command) => {
    setOpen(false);
    setQuery("");
    cmd.action();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Don't trigger shortcuts when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Ctrl+N — new lead
      if ((e.ctrlKey || e.metaKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        navigate("/leads/new");
        return;
      }

      // Ctrl+Shift+N — quick capture
      if ((e.ctrlKey || e.metaKey) && e.key === "N" && e.shiftKey) {
        e.preventDefault();
        navigate("/leads/quick");
        return;
      }

      // Escape — close palette
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, open]);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation within palette
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      execute(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  // Group by section
  const sections = new Map<string, Command[]>();
  for (const cmd of filtered) {
    const list = sections.get(cmd.section) || [];
    list.push(cmd);
    sections.set(cmd.section, list);
  }

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => { setOpen(false); setQuery(""); }}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("common.search") + "..."}
            className="flex-1 px-3 py-3 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs text-gray-400 border border-gray-300 dark:border-gray-600 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">{t("common.noResults")}</p>
          ) : (
            Array.from(sections.entries()).map(([section, cmds]) => (
              <div key={section}>
                <p className="px-4 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {section}
                </p>
                {cmds.map((cmd) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => execute(cmd)}
                      className={`w-full px-4 py-2 flex items-center justify-between text-sm text-left transition-colors ${
                        idx === selectedIndex
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-xs text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
