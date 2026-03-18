import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";

type TaskStatus = "pending" | "running";

interface QueueTask {
  id: string;
  label: string;
  status: TaskStatus;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  command: string;
  args: Record<string, unknown>;
}

interface AiQueueContextType {
  enqueue: <T>(command: string, args: Record<string, unknown>, label: string) => Promise<T>;
  cancel: (taskId: string) => void;
  tasks: ReadonlyArray<{ id: string; label: string; status: TaskStatus }>;
}

const AiQueueContext = createContext<AiQueueContextType | null>(null);

export function useAiQueue() {
  const context = useContext(AiQueueContext);
  if (!context) {
    throw new Error("useAiQueue must be used within an AiQueueProvider");
  }
  return context;
}

export function AiQueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const processNext = useCallback(() => {
    if (!mountedRef.current) return;
    const queue = tasksRef.current;
    if (processingRef.current) return;
    const next = queue.find((t) => t.status === "pending");
    if (!next) return;

    processingRef.current = true;
    setTasks((prev) =>
      prev.map((t) => (t.id === next.id ? { ...t, status: "running" as const } : t))
    );

    invoke(next.command, next.args)
      .then((result) => next.resolve(result))
      .catch((err) => next.reject(err))
      .finally(() => {
        processingRef.current = false;
        if (!mountedRef.current) return;
        setTasks((prev) => {
          const updated = prev.filter((t) => t.id !== next.id);
          tasksRef.current = updated;
          return updated;
        });
        setTimeout(() => { if (mountedRef.current) processNext(); }, 0);
      });
  }, []);

  const enqueue = useCallback(
    <T,>(command: string, args: Record<string, unknown>, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const task: QueueTask = {
          id: Math.random().toString(36).slice(2),
          label,
          status: "pending",
          resolve: resolve as (v: unknown) => void,
          reject,
          command,
          args,
        };

        setTasks((prev) => {
          const updated = [...prev, task];
          tasksRef.current = updated;
          return updated;
        });
        setTimeout(() => processNext(), 0);
      });
    },
    [processNext]
  );

  const cancel = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task || task.status !== "pending") return;

      task.reject(new Error("Cancelled"));
      setTasks((prev) => {
        const updated = prev.filter((t) => t.id !== taskId);
        tasksRef.current = updated;
        return updated;
      });
    },
    []
  );

  const publicTasks = tasks.map(({ id, label, status }) => ({ id, label, status }));

  return (
    <AiQueueContext.Provider value={{ enqueue, cancel, tasks: publicTasks }}>
      {children}
      {tasks.length > 0 && <QueueStatusBar tasks={tasks} onCancel={cancel} />}
    </AiQueueContext.Provider>
  );
}

function QueueStatusBar({
  tasks,
  onCancel,
}: {
  tasks: QueueTask[];
  onCancel: (id: string) => void;
}) {
  const running = tasks.find((t) => t.status === "running");
  const pending = tasks.filter((t) => t.status === "pending");

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-lg p-3 max-w-xs text-sm space-y-1.5">
      {running && (
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 animate-spin shrink-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="truncate">{running.label}</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="border-t border-gray-700 pt-1.5 space-y-1">
          <span className="text-xs text-gray-400">{pending.length} pending</span>
          {pending.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-300 truncate">{t.label}</span>
              <button
                onClick={() => onCancel(t.id)}
                className="text-xs text-gray-400 hover:text-red-400 shrink-0"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
