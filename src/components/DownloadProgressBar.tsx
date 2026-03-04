interface DownloadProgressBarProps {
  status: string;
  completed: number | null;
  total: number | null;
}

export default function DownloadProgressBar({ status, completed, total }: DownloadProgressBarProps) {
  const percent = completed && total ? Math.round((completed / total) * 100) : 0;
  const showBar = total && total > 0;

  return (
    <div className="space-y-1">
      {showBar && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{status}</span>
        {showBar && <span>{percent}%</span>}
      </div>
    </div>
  );
}
