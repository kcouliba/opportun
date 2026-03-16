import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@/components/LoadingSpinner";
import { ErrorState } from "@/components/ErrorState";
import type { Mission } from "@/types/index";

export default function MissionsPage() {
  const { t } = useTranslation();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    invoke<Mission[]>("list_missions")
      .then((data) => {
        setMissions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Failed to load missions");
        setLoading(false);
      });
  };

  useEffect(() => { loadData(); }, []);

  const activeMission = missions.find((m) => m.status === "active");
  const pastMissions = missions.filter((m) => m.status !== "active");

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2">{t("missions.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t("missions.subtitle")}
            </p>
          </div>
          <Link
            to="/missions/new"
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t("missions.addMission")}
          </Link>
        </header>

        {/* Active Mission */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">{t("missions.currentMission")}</h2>
          {activeMission ? (
            <MissionCard mission={activeMission} isActive />
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
              <p className="text-amber-800 dark:text-amber-200 mb-2">
                {t("missions.noActiveMission")}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                {t("missions.noActiveDesc")}
              </p>
              <Link
                to="/missions/new"
                className="text-amber-800 dark:text-amber-200 font-medium hover:underline"
              >
                {t("missions.addCurrent")}
              </Link>
            </div>
          )}
        </section>

        {/* Past Missions */}
        {pastMissions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">{t("missions.pastMissions")}</h2>
            <div className="space-y-4">
              {pastMissions.map((mission) => (
                <MissionCard key={mission.id} mission={mission} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function MissionCard({ mission, isActive }: { mission: Mission; isActive?: boolean }) {
  const { t } = useTranslation();
  const daysUntilEnd = mission.endDate
    ? Math.max(0, Math.ceil(
        (new Date(mission.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : null;

  const urgencyColor =
    daysUntilEnd !== null
      ? daysUntilEnd <= 30
        ? "text-red-600"
        : daysUntilEnd <= 60
        ? "text-yellow-600"
        : "text-green-600"
      : "";

  return (
    <Link
      to={`/missions/${mission.id}`}
      className={`block bg-white dark:bg-gray-800 rounded-lg border p-6 hover:shadow-md transition-shadow ${
        isActive
          ? "border-blue-200 dark:border-blue-800"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{mission.title}</h3>
          <p className="text-gray-600 dark:text-gray-400">{mission.client}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>{mission.rate}{t("common.perDay")}</span>
            <span>{mission.daysPerWeek} {t("common.days")}/week</span>
          </div>
        </div>
        {isActive && daysUntilEnd !== null && (
          <div className="text-right">
            <p className={`text-2xl font-bold ${urgencyColor}`}>
              {t("missions.daysLeft", { count: daysUntilEnd > 0 ? daysUntilEnd : 0 })}
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm text-gray-500">
        <span>
          {new Date(mission.startDate).toLocaleDateString()} →{" "}
          {mission.endDate
            ? new Date(mission.endDate).toLocaleDateString()
            : t("common.ongoing")}
        </span>
        {!isActive && (
          <span className="capitalize">{t(`missions.${mission.status}`)}</span>
        )}
      </div>
    </Link>
  );
}
