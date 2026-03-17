import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";
import { useTranslation } from "react-i18next";

interface SourceCheckerState {
  running: boolean;
  currentSourceId: string | null;
  progress: { done: number; total: number } | null;
  checkAll: (sourceIds: string[]) => void;
  checkOne: (sourceId: string) => void;
}

const SourceCheckerContext = createContext<SourceCheckerState>({
  running: false,
  currentSourceId: null,
  progress: null,
  checkAll: () => {},
  checkOne: () => {},
});

export function SourceCheckerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const runningRef = useRef(false);

  const runChecks = useCallback(
    async (sourceIds: string[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setProgress({ done: 0, total: sourceIds.length });

      let totalFound = 0;

      for (let i = 0; i < sourceIds.length; i++) {
        setCurrentSourceId(sourceIds[i]);
        setProgress({ done: i, total: sourceIds.length });

        try {
          const newLeads = await invoke<{ id: string }[]>("check_watch_source", {
            sourceId: sourceIds[i],
          });
          totalFound += newLeads.length;
        } catch {
          // Continue checking other sources
        }
      }

      setProgress(null);
      setCurrentSourceId(null);
      setRunning(false);
      runningRef.current = false;

      showToast(
        totalFound > 0
          ? t("watchSources.found", { count: totalFound })
          : t("common.noResults"),
        totalFound > 0 ? "success" : "info",
      );
    },
    [showToast, t],
  );

  const checkAll = useCallback(
    (sourceIds: string[]) => {
      runChecks(sourceIds);
    },
    [runChecks],
  );

  const checkOne = useCallback(
    (sourceId: string) => {
      runChecks([sourceId]);
    },
    [runChecks],
  );

  return (
    <SourceCheckerContext.Provider value={{ running, currentSourceId, progress, checkAll, checkOne }}>
      {children}
    </SourceCheckerContext.Provider>
  );
}

export function useSourceChecker() {
  return useContext(SourceCheckerContext);
}
