import { useEffect, useRef } from "react";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
import type { Document } from "@/types/index";

const fitColors: Record<string, string> = {
  Excellent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Good: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Poor: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function LeadAnalysisCard({ leadId, documents }: { leadId: string; documents: Document[] }) {
  const { analysis, analyzeLead, analyzing, error, loadSavedAnalysis } = useAiAnalysis();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const hasSaved = loadSavedAnalysis(documents);
    if (!hasSaved) {
      analyzeLead(leadId);
    }
  }, [leadId, documents, loadSavedAnalysis, analyzeLead]);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="font-semibold mb-4">AI Analysis</h2>

      {!analysis && !analyzing && (
        <div>
          <button
            onClick={() => analyzeLead(leadId)}
            disabled={analyzing}
            className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            Analyze with AI
          </button>
          {error && (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          )}
        </div>
      )}

      {analyzing && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analyzing lead...
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* Overall Fit */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-sm font-medium ${fitColors[analysis.overallFit] || fitColors.Moderate}`}>
              {analysis.overallFit}
            </span>
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {analysis.fitSummary}
          </p>

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Strengths</h3>
              <ul className="space-y-1">
                {analysis.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-green-700 dark:text-green-300 flex gap-1">
                    <span className="shrink-0">+</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {analysis.risks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Risks</h3>
              <ul className="space-y-1">
                {analysis.risks.map((r, i) => (
                  <li key={i} className="text-sm text-red-700 dark:text-red-300 flex gap-1">
                    <span className="shrink-0">-</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Talking Points */}
          {analysis.talkingPoints.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Talking Points</h3>
              <ul className="space-y-1">
                {analysis.talkingPoints.map((t, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    &bull; {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions */}
          {analysis.questions.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Questions to Ask</h3>
              <ul className="space-y-1">
                {analysis.questions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                    ? {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rate Advice */}
          {analysis.rateAdvice && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Rate Advice</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">{analysis.rateAdvice}</p>
            </div>
          )}

          {/* Re-analyze button */}
          <button
            onClick={() => analyzeLead(leadId)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Re-analyze
          </button>
        </div>
      )}
    </section>
  );
}
