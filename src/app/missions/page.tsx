"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/LoadingSpinner";

interface Mission {
  id: string;
  client: string;
  title: string;
  startDate: string;
  endDate: string | null;
  rate: number;
  daysPerWeek: number;
  status: string;
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/missions")
      .then((res) => res.json())
      .then((data) => {
        setMissions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeMission = missions.find((m) => m.status === "active");
  const pastMissions = missions.filter((m) => m.status !== "active");

  if (loading) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2">Missions</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Track your current and past work
            </p>
          </div>
          <Link
            href="/missions/new"
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            + Add Mission
          </Link>
        </header>

        {/* Active Mission */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Current Mission</h2>
          {activeMission ? (
            <MissionCard mission={activeMission} isActive />
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
              <p className="text-amber-800 dark:text-amber-200 mb-2">
                No active mission
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                Add your current work to track when your income will end.
              </p>
              <Link
                href="/missions/new"
                className="text-amber-800 dark:text-amber-200 font-medium hover:underline"
              >
                Add your current mission →
              </Link>
            </div>
          )}
        </section>

        {/* Past Missions */}
        {pastMissions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Past Missions</h2>
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
  const daysUntilEnd = mission.endDate
    ? Math.ceil(
        (new Date(mission.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
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
      href={`/missions/${mission.id}`}
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
            <span>{mission.rate}€/day</span>
            <span>{mission.daysPerWeek} days/week</span>
          </div>
        </div>
        {isActive && daysUntilEnd !== null && (
          <div className="text-right">
            <p className={`text-2xl font-bold ${urgencyColor}`}>
              {daysUntilEnd > 0 ? daysUntilEnd : 0} days
            </p>
            <p className="text-sm text-gray-500">until end</p>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm text-gray-500">
        <span>
          {new Date(mission.startDate).toLocaleDateString()} →{" "}
          {mission.endDate
            ? new Date(mission.endDate).toLocaleDateString()
            : "Ongoing"}
        </span>
        {!isActive && (
          <span className="capitalize">{mission.status}</span>
        )}
      </div>
    </Link>
  );
}
