"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/LoadingSpinner";

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/leads")
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredLeads = filter === "all" ? leads : leads.filter((l) => l.stage === filter);

  const pipelineStats = {
    lead: leads.filter((l) => l.stage === "lead").length,
    qualified: leads.filter((l) => l.stage === "qualified").length,
    negotiating: leads.filter((l) => l.stage === "negotiating").length,
    won: leads.filter((l) => l.stage === "won").length,
    lost: leads.filter((l) => l.stage === "lost").length,
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Pipeline</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {leads.length} total leads
          </p>
        </header>

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
              href="/leads/new"
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
      href={`/leads/${lead.id}`}
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
