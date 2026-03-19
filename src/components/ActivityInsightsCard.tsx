import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useActivityInsights } from "@/hooks/useActivityInsights";
import type { Document } from "@/types/index";

interface ActivityLike {
  type: string;
  occurredAt: string;
}

const toneColors: Record<string, string> = {
  Positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Neutral: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  Cautious: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface Props {
  leadId: string;
  documents: Document[];
  activities: ActivityLike[];
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function computeFactualSummary(activities: ActivityLike[]) {
  if (activities.length === 0) return null;

  const sorted = [...activities].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const last = sorted[0];
  const first = sorted[sorted.length - 1];
  const spanDays = Math.ceil(
    (new Date(last.occurredAt).getTime() - new Date(first.occurredAt).getTime()) / 86400000
  );

  const typeCounts: Record<string, number> = {};
  for (const act of activities) {
    typeCounts[act.type] = (typeCounts[act.type] || 0) + 1;
  }

  return {
    count: activities.length,
    lastType: last.type,
    lastDate: last.occurredAt,
    firstDate: first.occurredAt,
    spanDays,
    typeCounts,
  };
}

export default function ActivityInsightsCard({ leadId, documents, activities }: Props) {
  const { t } = useTranslation();
  const { insight, analyzeActivities, analyzing, error, loadSavedInsight } = useActivityInsights();
  const initialized = useRef(false);

  // Load saved insight only (don't auto-trigger AI)
  useEffect(() => {
    if (initialized.current || activities.length === 0) return;
    initialized.current = true;
    loadSavedInsight(documents);
  }, [leadId, documents, activities, loadSavedInsight]);

  const summary = computeFactualSummary(activities);
  if (!summary) return null;

  return (
    <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-purple-800 dark:text-purple-200">
          {t("leadDetail.activityInsights")}
        </h3>
        <button
          onClick={() => analyzeActivities(leadId)}
          disabled={analyzing}
          className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 disabled:opacity-50"
        >
          {analyzing ? t("leadDetail.generating") : insight ? t("common.refresh") : t("leadDetail.generateInsight")}
        </button>
      </div>

      {/* Factual header — always shown */}
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
        <span className="font-medium">{summary.count}</span> {t("leads.activities")}
        <span className="text-gray-400 mx-1">|</span>
        {t("leadDetail.lastActivity")}: {t(`activityTypes.${summary.lastType}`)}, {formatRelativeDate(summary.lastDate)}
        {summary.count > 1 && (
          <>
            <span className="text-gray-400 mx-1">|</span>
            {summary.spanDays > 0
              ? `${summary.spanDays}d ${t("leadDetail.activeSpan")}`
              : t("common.today")}
          </>
        )}
      </div>

      {/* Type breakdown */}
      <div className="flex flex-wrap gap-1 mb-2">
        {Object.entries(summary.typeCounts).map(([type, count]) => (
          <span
            key={type}
            className="px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded text-xs"
          >
            {t(`activityTypes.${type}`)} ({count})
          </span>
        ))}
      </div>

      {/* AI loading */}
      {analyzing && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t("leadDetail.generating")}
        </div>
      )}

      {/* AI error */}
      {error && !analyzing && !insight && (
        <div className="text-sm text-red-500">
          <p>{error}</p>
          <button
            onClick={() => analyzeActivities(leadId)}
            className="text-xs text-purple-600 hover:text-purple-700 mt-1"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* AI insight — shown when available */}
      {insight && !analyzing && (
        <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-700 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${toneColors[insight.tone] || toneColors.Neutral}`}>
              {insight.tone}
            </span>
          </div>

          {insight.nextStepSuggestion && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{t("leadDetail.nextStep")}:</span> {insight.nextStepSuggestion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
