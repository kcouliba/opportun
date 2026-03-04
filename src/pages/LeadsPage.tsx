import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { PageLoader } from "@/components/LoadingSpinner";
import { useToast } from "@/components/Toast";

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

const stageLabels: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
  qualified: { label: "Qualified", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  negotiating: { label: "Negotiating", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  won: { label: "Won", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  lost: { label: "Lost", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export default function LeadsPage() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchLeads = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (query) filters.q = query;
      const result = await invoke<{ data: Lead[]; pagination: unknown }>("list_leads", { filters });
      setLeads(result.data || []);
    } catch {
      // Keep existing leads on error
    } finally {
      setLoading(false);
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
        showToast("CSV exported successfully", "success");
      }
    } catch {
      showToast("Failed to export CSV", "error");
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">Pipeline</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {leads.length} total leads
            </p>
          </div>
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
            Export CSV
          </button>
        </header>

        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search leads by client, title, description, notes, contact..."
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
              Showing results for &quot;{debouncedSearch}&quot;
            </p>
          )}
        </div>

        {/* Pipeline Overview */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          <FilterButton
            label="All"
            count={leads.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {Object.entries(pipelineStats).map(([stage, count]) => (
            <FilterButton
              key={stage}
              label={stageLabels[stage].label}
              count={count}
              active={filter === stage}
              onClick={() => setFilter(stage)}
            />
          ))}
        </div>

        {/* Leads List */}
        {filteredLeads.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-gray-500 mb-4">No leads yet</p>
            <Link
              to="/leads/new"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Add your first opportunity →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
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

function LeadCard({ lead }: { lead: Lead }) {
  const stage = stageLabels[lead.stage] || stageLabels.lead;

  return (
    <Link
      to={`/leads/${lead.id}`}
      className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{lead.title}</h3>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${stage.color}`}>
              {stage.label}
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
              {lead.matchScore}% match
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
