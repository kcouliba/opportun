import { useEffect, useRef } from "react";
import { useActivityInsights } from "@/hooks/useActivityInsights";
import type { Document } from "@/types/index";

const toneColors: Record<string, string> = {
  Positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Neutral: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  Cautious: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface Props {
  leadId: string;
  documents: Document[];
  activities: readonly unknown[];
}

export default function ActivityInsightsCard({ leadId, documents, activities }: Props) {
  const { insight, analyzeActivities, analyzing, error, loadSavedInsight } = useActivityInsights();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || activities.length === 0) return;
    initialized.current = true;

    const hasSaved = loadSavedInsight(documents);
    if (!hasSaved) {
      analyzeActivities(leadId);
    }
  }, [leadId, documents, activities, loadSavedInsight, analyzeActivities]);

  if (activities.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-purple-800 dark:text-purple-200">
          Activity Insights
        </h3>
        {insight && (
          <button
            onClick={() => analyzeActivities(leadId)}
            disabled={analyzing}
            className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 disabled:opacity-50"
          >
            Refresh
          </button>
        )}
      </div>

      {analyzing && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analyzing activities...
        </div>
      )}

      {error && !analyzing && !insight && (
        <div className="text-sm text-red-500">
          <p>{error}</p>
          <button
            onClick={() => analyzeActivities(leadId)}
            className="text-xs text-purple-600 hover:text-purple-700 mt-1"
          >
            Retry
          </button>
        </div>
      )}

      {insight && !analyzing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${toneColors[insight.tone] || toneColors.Neutral}`}>
              {insight.tone}
            </span>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300">
            {insight.summary}
          </p>

          {insight.keyTopics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {insight.keyTopics.map((topic, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded text-xs"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {insight.nextStepSuggestion && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">Next step:</span> {insight.nextStepSuggestion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
