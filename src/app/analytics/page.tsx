"use client";

import { useState, useEffect } from "react";
import { PageLoader } from "@/components/LoadingSpinner";

interface AnalyticsData {
  conversionRates: {
    leadToQualified: number;
    qualifiedToNegotiating: number;
    negotiatingToWon: number;
  };
  winRate: number;
  avgTimeInStage: Record<string, number | null>;
  totalPipelineValue: number;
  sourceBreakdown: { source: string; count: number }[];
  avgMatchScoreByStage: Record<string, number | null>;
  monthlyLeadCount: { month: string; count: number }[];
  stageCounts: Record<string, number>;
  totalLeads: number;
}

const stageLabels: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  if (error || !data) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-red-600 dark:text-red-400">
              {error || "Failed to load analytics"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const maxMonthlyCount = Math.max(...data.monthlyLeadCount.map((m) => m.count), 1);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Pipeline Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Insights and metrics for your pipeline performance
          </p>
        </header>

        {/* Key Metrics */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Key Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Win Rate"
              value={`${data.winRate}%`}
              sublabel="Won / (Won + Lost)"
              color="green"
            />
            <StatCard
              label="Pipeline Value"
              value={formatCurrency(data.totalPipelineValue)}
              sublabel="Active leads value"
              color="blue"
            />
            <StatCard
              label="Total Leads"
              value={data.totalLeads.toString()}
              sublabel="All time"
              color="gray"
            />
            <StatCard
              label="Active Leads"
              value={(
                data.stageCounts.lead +
                data.stageCounts.qualified +
                data.stageCounts.negotiating
              ).toString()}
              sublabel="In pipeline"
              color="yellow"
            />
          </div>
        </section>

        {/* Conversion Funnel */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Conversion Funnel</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="space-y-4">
              <FunnelStage
                from="Lead"
                to="Qualified"
                rate={data.conversionRates.leadToQualified}
                count={data.stageCounts.lead}
              />
              <FunnelStage
                from="Qualified"
                to="Negotiating"
                rate={data.conversionRates.qualifiedToNegotiating}
                count={data.stageCounts.qualified}
              />
              <FunnelStage
                from="Negotiating"
                to="Won"
                rate={data.conversionRates.negotiatingToWon}
                count={data.stageCounts.negotiating}
              />
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-green-600 dark:text-green-400">
                    Won
                  </span>
                  <span className="text-sm text-gray-500">{data.stageCounts.won} deals</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{data.stageCounts.lost} lost</span>
                  <span className="w-24 text-sm font-medium text-red-600 dark:text-red-400 text-right">
                    Lost
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Average Time in Stage */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Average Time in Stage</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-3">
                {Object.entries(data.avgTimeInStage).map(([stage, days]) => (
                  <div key={stage} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {stageLabels[stage] || stage}
                    </span>
                    <span className="font-medium">
                      {days !== null ? `${days} days` : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Average Match Score by Stage */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Avg Match Score by Stage</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-3">
                {Object.entries(data.avgMatchScoreByStage).map(([stage, score]) => (
                  <div key={stage} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {stageLabels[stage] || stage}
                    </span>
                    <span
                      className={`font-medium ${
                        score !== null
                          ? score >= 70
                            ? "text-green-600"
                            : score >= 40
                            ? "text-yellow-600"
                            : "text-red-600"
                          : ""
                      }`}
                    >
                      {score !== null ? `${score}%` : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Leads by Source */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Leads by Source</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              {data.sourceBreakdown.length === 0 ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.sourceBreakdown.map(({ source, count }) => {
                    const maxCount = Math.max(...data.sourceBreakdown.map((s) => s.count), 1);
                    const percentage = (count / maxCount) * 100;
                    return (
                      <div key={source}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                            {source}
                          </span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Monthly Trend */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Monthly Lead Trend</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              {data.monthlyLeadCount.every((m) => m.count === 0) ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="flex items-end gap-2 h-32">
                  {data.monthlyLeadCount.map(({ month, count }) => {
                    const height = maxMonthlyCount > 0 ? (count / maxMonthlyCount) * 100 : 0;
                    return (
                      <div key={month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{count}</span>
                        <div
                          className="w-full bg-blue-500 rounded-t min-h-[4px]"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {month.split(" ")[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: "green" | "blue" | "yellow" | "gray";
}) {
  const colorClasses = {
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    yellow: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    gray: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
  };

  const valueClasses = {
    green: "text-green-700 dark:text-green-400",
    blue: "text-blue-700 dark:text-blue-400",
    yellow: "text-yellow-700 dark:text-yellow-400",
    gray: "text-gray-700 dark:text-gray-300",
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClasses[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
    </div>
  );
}

function FunnelStage({
  from,
  to,
  rate,
  count,
}: {
  from: string;
  to: string;
  rate: number;
  count: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">
        {from}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <span className="text-sm font-medium w-12 text-right">{rate}%</span>
        </div>
        <p className="text-xs text-gray-500">{count} in stage</p>
      </div>
      <svg
        className="w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
      <span className="w-24 text-sm text-gray-600 dark:text-gray-400">{to}</span>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
}
