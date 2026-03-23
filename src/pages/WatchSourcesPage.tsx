import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import { useSourceChecker } from "@/hooks/useSourceChecker";
import ConfirmDialog from "@/components/ConfirmDialog";

interface WatchSource {
  id: string;
  name: string;
  url: string;
  lastCheckedAt: string | null;
  lastFoundCount: number | null;
  skipTlsVerify?: boolean;
}

interface DiscoveredLead {
  id: string;
  createdAt: string;
  sourceId: string;
  title: string;
  client: string | null;
  location: string | null;
  rate: number | null;
  snippet: string | null;
  listingUrl: string | null;
  status: string;
  importedLeadId: string | null;
}

type FilterTab = "new" | "all" | "dismissed";

export default function WatchSourcesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Sources state
  const [sources, setSources] = useState<WatchSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addSkipTls, setAddSkipTls] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSkipTls, setEditSkipTls] = useState(false);
  const { running: checkingAll, currentSourceId: checkingId, checkAll, checkOne } = useSourceChecker();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Discovered leads state
  const [leads, setLeads] = useState<DiscoveredLead[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>("new");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [useAi, setUseAi] = useState(true);

  // Load sources
  const loadSources = useCallback(async () => {
    try {
      const data = await invoke<WatchSource[]>("list_watch_sources");
      setSources(data);
    } catch {
      showToast(t("watchSources.failedLoadSources"), "error");
    }
  }, [showToast, t]);

  // Load discovered leads
  const loadLeads = useCallback(
    async (sourceId: string | null) => {
      try {
        const statusFilter = filterTab === "all" ? null : filterTab === "new" ? "new" : "dismissed";
        const data = await invoke<DiscoveredLead[]>("list_discovered_leads", {
          sourceId,
          status: statusFilter,
        });
        setLeads(data);
        setSelectedIds(new Set());
      } catch {
        showToast(t("watchSources.failedLoadDiscovered"), "error");
      }
    },
    [filterTab, showToast, t],
  );

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    loadLeads(selectedSourceId);
  }, [selectedSourceId, filterTab, loadLeads]);

  // Add source
  const handleAdd = async () => {
    if (!addName.trim() || !addUrl.trim()) {
      showToast(t("watchSources.nameAndUrlRequired"), "error");
      return;
    }
    setAddLoading(true);
    try {
      await invoke("create_watch_source", {
        data: { name: addName.trim(), url: addUrl.trim(), skipTlsVerify: addSkipTls },
      });
      setAddName("");
      setAddUrl("");
      setAddSkipTls(false);
      setShowAddForm(false);
      showToast(t("watchSources.sourceAdded"), "success");
      await loadSources();
    } catch {
      showToast(t("watchSources.failedAddSource"), "error");
    }
    setAddLoading(false);
  };

  // Edit source
  const handleEdit = async (id: string) => {
    if (!editName.trim() || !editUrl.trim()) return;
    try {
      await invoke("update_watch_source", {
        id,
        data: { name: editName.trim(), url: editUrl.trim(), skipTlsVerify: editSkipTls },
      });
      setEditingId(null);
      showToast(t("watchSources.sourceUpdated"), "success");
      await loadSources();
    } catch {
      showToast(t("watchSources.failedUpdateSource"), "error");
    }
  };

  // Delete source
  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_watch_source", { id });
      if (selectedSourceId === id) setSelectedSourceId(null);
      showToast(t("watchSources.sourceDeleted"), "success");
      setDeleteConfirm(null);
      await loadSources();
    } catch {
      showToast(t("watchSources.failedDeleteSource"), "error");
    }
  };

  // Check source (AI discovery) — runs in background context
  const handleCheck = (id: string) => {
    checkOne(id);
  };

  const handleCheckAll = () => {
    checkAll(sources.map((s) => s.id));
  };

  // Refresh data when background check finishes
  useEffect(() => {
    if (!checkingAll && !checkingId) {
      loadSources();
      if (selectedSourceId) loadLeads(selectedSourceId);
    }
  }, [checkingAll, checkingId, loadSources, loadLeads, selectedSourceId]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  // Batch import
  const handleBatchImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const result = await invoke<{ imported: number; failed: number; errors: string[] }>(
        "batch_import_discovered_leads",
        { ids: Array.from(selectedIds), useAi },
      );
      if (result.imported > 0) {
        showToast(t("watchSources.importedCount", { count: result.imported }), "success");
      }
      if (result.failed > 0) {
        showToast(t("watchSources.importFailedCount", { count: result.failed }), "error");
      }
      setSelectedIds(new Set());
      await loadLeads(selectedSourceId);
    } catch (e) {
      showToast(t("watchSources.importFailed", { error: e }), "error");
    }
    setImporting(false);
  };

  // Dismiss selected
  const handleDismiss = async () => {
    if (selectedIds.size === 0) return;
    try {
      await invoke("dismiss_discovered_leads", { ids: Array.from(selectedIds) });
      showToast(t("watchSources.dismissedCount", { count: selectedIds.size }), "success");
      setSelectedIds(new Set());
      await loadLeads(selectedSourceId);
    } catch {
      showToast(t("watchSources.failedDismiss"), "error");
    }
  };

  // Import single
  const handleImportSingle = async (discoveredId: string) => {
    setImporting(true);
    try {
      const lead = await invoke<{ id: string }>("import_discovered_lead", {
        discoveredId,
        useAi,
      });
      showToast(t("watchSources.leadImported"), "success");
      await loadLeads(selectedSourceId);
    } catch (e) {
      showToast(t("watchSources.importFailed", { error: e }), "error");
    }
    setImporting(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return t("watchSources.never");
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{t("watchSources.title")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("watchSources.subtitle")}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: Sources */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t("watchSources.title")}
              </h2>
              <div className="flex items-center gap-2">
                {sources.length > 0 && (
                  <button
                    onClick={handleCheckAll}
                    disabled={checkingAll || !!checkingId}
                    className="text-sm text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
                  >
                    {checkingAll ? t("watchSources.checking") : t("watchSources.checkAll")}
                  </button>
                )}
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showAddForm ? t("common.cancel") : `+ ${t("common.add")}`}
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={t("watchSources.namePlaceholder")}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="url"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder={t("watchSources.urlPlaceholder")}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                />
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={addSkipTls}
                    onChange={(e) => setAddSkipTls(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {t("watchSources.skipTlsVerify")}
                </label>
                <button
                  onClick={handleAdd}
                  disabled={addLoading}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addLoading ? t("common.loading") : t("watchSources.addSource")}
                </button>
              </div>
            )}

            {/* Sources list */}
            <div className="space-y-2">
              {sources.length === 0 && !showAddForm && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  No sources yet. Add a job board search URL to get started.
                </p>
              )}

              {sources.map((source) => (
                <div
                  key={source.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSourceId === source.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                  onClick={() => setSelectedSourceId(source.id)}
                >
                  {editingId === source.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(source.id)}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium truncate">{source.name}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {source.url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {source.lastCheckedAt
                            ? `${t("watchSources.lastChecked")} ${formatDate(source.lastCheckedAt)}`
                            : t("watchSources.never")}
                          {source.lastFoundCount !== null && ` · ${t("watchSources.found", { count: source.lastFoundCount })}`}
                        </span>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleCheck(source.id)}
                            disabled={checkingId === source.id}
                            className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
                            title={t("watchSources.check")}
                          >
                            {checkingId === source.id ? (
                              <span className="inline-flex items-center gap-1">
                                <Spinner /> {t("watchSources.checking")}
                              </span>
                            ) : (
                              t("watchSources.check")
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(source.id);
                              setEditName(source.name);
                              setEditUrl(source.url);
                              setEditSkipTls(source.skipTlsVerify ?? false);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title={t("common.edit")}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(source.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title={t("common.delete")}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right panel: Discovered leads */}
          <div className="lg:col-span-2">
            {selectedSourceId ? (
              <>
                {/* Filter tabs */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-1 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
                    {(["new", "all", "dismissed"] as FilterTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFilterTab(tab)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          filterTab === tab
                            ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        {tab === "new" ? t("watchSources.new") : tab === "all" ? t("common.all") : t("watchSources.dismissed")}
                      </button>
                    ))}
                  </div>

                  {/* Select all */}
                  {leads.length > 0 && filterTab !== "dismissed" && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      {selectedIds.size === leads.length ? t("common.deselectAll") : t("common.selectAll")}
                    </button>
                  )}
                </div>

                {/* Batch toolbar */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {t("common.selected", { count: selectedIds.size })}
                    </span>
                    <div className="flex-1" />
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={useAi}
                        onChange={(e) => setUseAi(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Use AI
                    </label>
                    <button
                      onClick={handleBatchImport}
                      disabled={importing}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {importing ? t("quickCapture.importing") : `${t("common.import")} ${selectedIds.size}`}
                    </button>
                    <button
                      onClick={handleDismiss}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg"
                    >
                      {t("watchSources.dismiss")}
                    </button>
                  </div>
                )}

                {/* Leads list */}
                {leads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">
                      {filterTab === "new"
                        ? "No new discoveries. Click \"Check\" to scan for listings."
                        : filterTab === "dismissed"
                        ? "No dismissed leads."
                        : "No discovered leads yet."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <div
                        key={lead.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          selectedIds.has(lead.id)
                            ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                            : "border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          {lead.status !== "imported" && lead.status !== "dismissed" && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(lead.id)}
                              onChange={() => toggleSelect(lead.id)}
                              className="mt-1 rounded border-gray-300"
                            />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium truncate">{lead.title}</h3>
                              {lead.status === "imported" && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                  Imported
                                </span>
                              )}
                              {lead.status === "dismissed" && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
                                  Dismissed
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {lead.client && <span>{lead.client}</span>}
                              {lead.rate && <span>{lead.rate}{t("common.perDay")}</span>}
                              {lead.location && <span>{lead.location}</span>}
                            </div>

                            {lead.listingUrl && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <a
                                  href={lead.listingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 truncate max-w-xs"
                                  onClick={(e) => e.stopPropagation()}
                                  title={lead.listingUrl}
                                >
                                  {lead.listingUrl.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/")}
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(lead.listingUrl!);
                                    showToast(t("common.copied"), "success");
                                  }}
                                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                                  title={t("common.copyToClipboard")}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              </div>
                            )}

                            {lead.snippet && (
                              <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                {lead.snippet}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lead.status === "new" && (
                              <>
                                <button
                                  onClick={() => handleImportSingle(lead.id)}
                                  disabled={importing}
                                  className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                  {t("watchSources.importLead")}
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await invoke("dismiss_discovered_leads", { ids: [lead.id] });
                                      await loadLeads(selectedSourceId);
                                    } catch {
                                      showToast(t("watchSources.failedDismiss"), "error");
                                    }
                                  }}
                                  className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-300 dark:border-gray-600 rounded transition-colors whitespace-nowrap"
                                >
                                  {t("watchSources.dismiss")}
                                </button>
                              </>
                            )}
                            {lead.status === "dismissed" && (
                              <button
                                onClick={async () => {
                                  try {
                                    await invoke("undismiss_discovered_leads", { ids: [lead.id] });
                                    await loadLeads(selectedSourceId);
                                  } catch {
                                    showToast(t("common.error"), "error");
                                  }
                                }}
                                className="px-2.5 py-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 border border-blue-300 dark:border-blue-600 rounded transition-colors whitespace-nowrap"
                              >
                                {t("watchSources.restore")}
                              </button>
                            )}
                            {lead.status === "imported" && lead.importedLeadId && (
                              <Link
                                to={`/leads/${lead.importedLeadId}`}
                                className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                              >
                                View Lead
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                <p className="text-sm">
                  {sources.length > 0
                    ? "Select a source to view discovered leads"
                    : "Add a source to get started"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={t("common.delete")}
        message="This will delete the source and all its discovered leads. This cannot be undone."
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </main>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
