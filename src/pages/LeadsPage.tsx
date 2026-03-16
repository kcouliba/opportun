import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@/components/LoadingSpinner";
import { useToast } from "@/components/Toast";
import KanbanBoard from "@/components/KanbanBoard";
import ConfirmDialog from "@/components/ConfirmDialog";

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface Lead {
  id: string;
  client: string;
  title: string;
  source: string;
  stage: string;
  offeredRate: number | null;
  matchScore: number | null;
  createdAt: string;
}

const stageColors: Record<string, string> = {
  lead: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  negotiating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  won: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  lost: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function LeadsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">(
    () => (localStorage.getItem("leadsViewMode") as "list" | "kanban") || "list"
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Clear selection when filter, search, or view mode changes
  useEffect(() => {
    setSelected(new Set());
  }, [filter, debouncedSearch, viewMode]);

  const fetchLeads = useCallback(async (query: string) => {
    try {
      const filters: Record<string, string> = {};
      if (query) filters.q = query;
      const result = await invoke<{ data: Lead[]; pagination: unknown }>("list_leads", { filters });
      setLeads(result.data || []);
    } catch {
      // Keep existing leads on error
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads(debouncedSearch);
  }, [debouncedSearch, fetchLeads]);

  const filteredLeads = filter === "all" ? leads : leads.filter((l) => l.stage === filter);

  const pipelineStats = {
    lead: leads.filter((l) => l.stage === "lead").length,
    qualified: leads.filter((l) => l.stage === "qualified").length,
    negotiating: leads.filter((l) => l.stage === "negotiating").length,
    won: leads.filter((l) => l.stage === "won").length,
    lost: leads.filter((l) => l.stage === "lost").length,
  };

  const handleViewMode = (mode: "list" | "kanban") => {
    setViewMode(mode);
    localStorage.setItem("leadsViewMode", mode);
  };

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      await invoke("update_lead_stage", { id: leadId, stage: newStage });
      await fetchLeads(debouncedSearch);
      showToast(t("leads.movedToStage", { stage: t(`stages.${newStage}`) }), "success");
    } catch {
      showToast(t("leads.failedUpdateStage"), "error");
    }
  };

  const toggleSelection = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      const ids = Array.from(selected);
      const count = await invoke<number>("batch_delete_leads", { ids });
      showToast(t("leads.leadsDeleted", { count }), "success");
      setSelected(new Set());
      await fetchLeads(debouncedSearch);
    } catch {
      showToast(t("leads.failedDelete"), "error");
    }
  };

  const handleBatchMoveStage = async (stage: string) => {
    try {
      const ids = Array.from(selected);
      const count = await invoke<number>("batch_update_leads_stage", { ids, stage });
      showToast(t("leads.leadsMoved", { count, stage: t(`stages.${stage}`) }), "success");
      setSelected(new Set());
      await fetchLeads(debouncedSearch);
    } catch {
      showToast(t("leads.failedUpdateStage"), "error");
    }
  };

  const handleExportCSV = async () => {
    try {
      const filters: Record<string, string> = {};
      if (filter !== "all") filters.stage = filter;
      const csv = await invoke<string>("export_leads_csv", { filters });
      const date = new Date().toISOString().split("T")[0];
      const filePath = await save({
        defaultPath: `leads-export-${date}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, csv);
        showToast(t("leads.csvExported"), "success");
      }
    } catch {
      showToast(t("leads.failedExportCsv"), "error");
    }
  };

  if (initialLoad) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">{t("leads.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t("leads.totalLeads", { count: leads.length })}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => handleViewMode("list")}
                className={`px-3 py-2 text-sm ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                title={t("leads.listView")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => handleViewMode("kanban")}
                className={`px-3 py-2 text-sm ${viewMode === "kanban" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                title={t("leads.kanbanView")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </button>
            </div>
            <Link
              to="/leads/quick?mode=file"
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {t("leads.importFile")}
            </Link>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {t("leads.exportCsv")}
            </button>
          </div>
        </header>

        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder={t("leads.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {debouncedSearch && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("leads.showingResults", { query: debouncedSearch })}
            </p>
          )}
        </div>

        {viewMode === "kanban" ? (
          /* Kanban View */
          leads.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-gray-500 mb-4">{t("leads.noLeads")}</p>
              <Link to="/leads/new" className="text-blue-600 hover:text-blue-700 font-medium">
                {t("leads.addFirstLead")}
              </Link>
            </div>
          ) : (
            <KanbanBoard leads={leads} onStageChange={handleStageChange} />
          )
        ) : (
          <>
            {/* Pipeline Overview */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
              <FilterButton
                label={t("common.all")}
                count={leads.length}
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              {Object.entries(pipelineStats).map(([stage, count]) => (
                <FilterButton
                  key={stage}
                  label={t(`stages.${stage}`)}
                  count={count}
                  active={filter === stage}
                  onClick={() => setFilter(stage)}
                />
              ))}
            </div>

            {/* Batch Toolbar */}
            {selected.size > 0 && (
              <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {t("common.selected", { count: selected.size })}
                </span>
                <button
                  onClick={() => setSelected(new Set(filteredLeads.map((l) => l.id)))}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("common.selectAll")}
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("common.deselectAll")}
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleBatchMoveStage(e.target.value);
                      e.target.value = "";
                    }}
                    defaultValue=""
                    className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    <option value="" disabled>{t("leads.moveTo")}</option>
                    {Object.keys(stageColors).map((key) => (
                      <option key={key} value={key}>{t(`stages.${key}`)}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBatchDelete}
                    className="text-sm px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            )}

            {/* Leads List */}
            {filteredLeads.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-gray-500 mb-4">{t("leads.noLeads")}</p>
                <Link
                  to="/leads/new"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  {t("leads.addFirstLead")}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    selected={selected.has(lead.id)}
                    onToggle={toggleSelection}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("leads.deleteLeads")}
        message={t("leads.deleteConfirm", { count: selected.size })}
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={confirmBatchDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </main>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function LeadCard({
  lead,
  selected,
  onToggle,
}: {
  lead: Lead;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const stageColor = stageColors[lead.stage] || stageColors.lead;
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [actType, setActType] = useState("note");
  const [actTitle, setActTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle.trim()) return;
    setSaving(true);
    try {
      await invoke("create_activity", {
        leadId: lead.id,
        data: { type: actType, title: actTitle.trim() },
      });
      showToast(t("leads.activityAdded"), "success");
      setActTitle("");
      setShowQuickAdd(false);
    } catch {
      showToast(t("leads.failedAddActivity"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {onToggle && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggle(lead.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 shrink-0"
        />
      )}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
        <div className="flex items-center">
          <Link
            to={`/leads/${lead.id}`}
            className="flex-1 p-4"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{lead.title}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageColor}`}>
                    {t(`stages.${lead.stage}`)}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{lead.client}</p>
                <p className="text-gray-500 text-xs mt-1">
                  via {lead.source} • {new Date(lead.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                {lead.offeredRate && (
                  <p className="font-semibold">{lead.offeredRate}€/day</p>
                )}
                {lead.matchScore !== null && (
                  <p className={`text-sm ${lead.matchScore >= 70 ? "text-green-600" : lead.matchScore >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                    {t("leads.match", { score: lead.matchScore })}
                  </p>
                )}
              </div>
            </div>
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickAdd(!showQuickAdd);
            }}
            title={t("leads.quickAddActivity")}
            className="px-3 py-2 mr-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {showQuickAdd && (
          <form onSubmit={handleQuickAdd} className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <select
              value={actType}
              onChange={(e) => setActType(e.target.value)}
              className="text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="note">{t("activityTypes.note")}</option>
              <option value="call">{t("activityTypes.call")}</option>
              <option value="email">{t("activityTypes.email")}</option>
              <option value="meeting">{t("activityTypes.meeting")}</option>
              <option value="interview">{t("activityTypes.interview")}</option>
              <option value="follow_up">{t("activityTypes.follow_up")}</option>
              <option value="other">{t("activityTypes.other")}</option>
            </select>
            <input
              type="text"
              value={actTitle}
              onChange={(e) => setActTitle(e.target.value)}
              placeholder={t("leads.activityTitle")}
              autoFocus
              className="flex-1 text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <button
              type="submit"
              disabled={saving || !actTitle.trim()}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : t("common.add")}
            </button>
            <button
              type="button"
              onClick={() => setShowQuickAdd(false)}
              className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {t("common.cancel")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
