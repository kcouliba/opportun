"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface DashboardStats {
  missionDaysLeft: number | null;
  missionClient: string | null;
  pipelineCount: number;
  qualifiedCount: number;
}

export default function Navigation() {
  const pathname = usePathname();
  const [stats, setStats] = useState<DashboardStats>({
    missionDaysLeft: null,
    missionClient: null,
    pipelineCount: 0,
    qualifiedCount: 0,
  });

  useEffect(() => {
    // Fetch stats for nav indicators
    Promise.all([
      fetch("/api/missions").then((r) => r.json()),
      fetch("/api/leads").then((r) => r.json()),
    ]).then(([missions, leads]) => {
      const activeMission = missions.find((m: { status: string }) => m.status === "active");
      const daysLeft = activeMission?.endDate
        ? Math.ceil(
            (new Date(activeMission.endDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      const activeLeads = leads.filter(
        (l: { stage: string }) => !["won", "lost"].includes(l.stage)
      );
      const qualified = leads.filter(
        (l: { stage: string }) => l.stage === "qualified" || l.stage === "negotiating"
      );

      setStats({
        missionDaysLeft: daysLeft,
        missionClient: activeMission?.client || null,
        pipelineCount: activeLeads.length,
        qualifiedCount: qualified.length,
      });
    });
  }, [pathname]); // Refresh when route changes

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const urgencyColor =
    stats.missionDaysLeft !== null
      ? stats.missionDaysLeft <= 30
        ? "text-red-500"
        : stats.missionDaysLeft <= 60
        ? "text-yellow-500"
        : "text-green-500"
      : "text-gray-400";

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo + Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="font-bold text-xl">
              Opportun
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <NavLink href="/" active={isActive("/") && pathname === "/"}>
                Dashboard
              </NavLink>
              <NavLink href="/leads" active={isActive("/leads")}>
                Pipeline
                {stats.pipelineCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                    {stats.pipelineCount}
                  </span>
                )}
              </NavLink>
              <NavLink href="/missions" active={isActive("/missions")}>
                Missions
              </NavLink>
              <NavLink href="/profile" active={isActive("/profile")}>
                Profile
              </NavLink>
            </div>
          </div>

          {/* Right side: Stats + Add Lead */}
          <div className="flex items-center gap-4">
            {/* Mission countdown - desktop */}
            <div className="hidden lg:flex items-center gap-4 text-sm">
              {stats.missionDaysLeft !== null ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Mission ends:</span>
                  <span className={`font-semibold ${urgencyColor}`}>
                    {stats.missionDaysLeft > 0 ? `${stats.missionDaysLeft}d` : "ended"}
                  </span>
                </div>
              ) : (
                <span className="text-gray-400">No active mission</span>
              )}

              {stats.qualifiedCount > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500">Qualified:</span>
                  <span className="font-semibold text-green-600">{stats.qualifiedCount}</span>
                </div>
              )}
            </div>

            {/* Add Lead - Primary Action */}
            <Link
              href="/leads/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <PlusIcon />
              <span className="hidden sm:inline">Add Lead</span>
            </Link>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden border-t border-gray-100 dark:border-gray-800 -mx-4 px-4">
          <MobileNavLink href="/" active={isActive("/") && pathname === "/"}>
            <HomeIcon />
            <span>Home</span>
          </MobileNavLink>
          <MobileNavLink href="/leads" active={isActive("/leads")}>
            <PipelineIcon />
            <span>Pipeline</span>
            {stats.pipelineCount > 0 && (
              <span className="ml-1 text-xs text-blue-600">{stats.pipelineCount}</span>
            )}
          </MobileNavLink>
          <MobileNavLink href="/missions" active={isActive("/missions")}>
            <BriefcaseIcon />
            <span>Missions</span>
          </MobileNavLink>
          <MobileNavLink href="/profile" active={isActive("/profile")}>
            <UserIcon />
            <span>Profile</span>
          </MobileNavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
        active
          ? "text-blue-600 dark:text-blue-400"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {children}
    </Link>
  );
}

// Icons
function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
