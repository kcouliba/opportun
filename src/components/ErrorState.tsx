import { useTranslation } from "react-i18next";

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          {t("common.somethingWentWrong")}
        </h2>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4">
          {message || t("common.unexpectedError")}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            {t("common.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
