import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DashboardStats {
  missionDaysLeft: number | null;
  missionClient: string | null;
  pipelineCount: number;
  qualifiedCount: number;
}

interface SyncInfo {
  available: boolean;
  paired: boolean;
  lastSyncedAt: string | null;
}

export default function Navigation() {
  const location = useLocation();
  const pathname = location.pathname;
  const [stats, setStats] = useState<DashboardStats>({
    missionDaysLeft: null,
    missionClient: null,
    pipelineCount: 0,
    qualifiedCount: 0,
  });
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({
    available: false,
    paired: false,
    lastSyncedAt: null,
  });

  useEffect(() => {
    Promise.all([
      invoke<unknown[]>("list_missions"),
      invoke<{ data: unknown[] }>("list_leads", { filters: {} }),
    ]).then(([missions, leadsResponse]) => {
      const leads = (leadsResponse as { data: { stage: string }[] }).data || [];
      const activeMission = (missions as { status: string; endDate: string | null; client: string }[]).find(
        (m) => m.status === "active"
      );
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
    }).catch(() => {
      // Silently fail if backend isn't ready yet
    });

    invoke<{ paired: boolean; lastSyncedAt: string | null }>("get_sync_status")
      .then((s) => setSyncInfo({ available: true, paired: s.paired, lastSyncedAt: s.lastSyncedAt }))
      .catch(() => {});
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const syncDotColor = (() => {
    if (!syncInfo.paired) return "bg-gray-400";
    if (!syncInfo.lastSyncedAt) return "bg-gray-400";
    const mins = (Date.now() - new Date(syncInfo.lastSyncedAt).getTime()) / 60000;
    if (mins < 5) return "bg-green-500";
    if (mins < 60) return "bg-green-500";
    return "bg-orange-500";
  })();

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
            <Link to="/" className="font-bold text-xl">
              Opportun
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <NavLink to="/" active={isActive("/") && pathname === "/"}>
                Dashboard
              </NavLink>
              <NavLink to="/leads" active={isActive("/leads")}>
                Pipeline
                {stats.pipelineCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                    {stats.pipelineCount}
                  </span>
                )}
              </NavLink>
              <NavLink to="/activities" active={isActive("/activities")}>
                Activity
              </NavLink>
              <NavLink to="/missions" active={isActive("/missions")}>
                Missions
              </NavLink>
              <NavLink to="/analytics" active={isActive("/analytics")}>
                Analytics
              </NavLink>
              <NavLink to="/profile" active={isActive("/profile")}>
                Profile
              </NavLink>
              <NavLink to="/settings" active={isActive("/settings")}>
                Settings
                {syncInfo.available && (
                  <span className={`ml-1.5 w-2 h-2 rounded-full ${syncDotColor}`} />
                )}
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

            {/* Quick Capture - Primary Action */}
            <Link
              to="/leads/quick"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <PlusIcon />
              <span className="hidden sm:inline">Quick Add</span>
            </Link>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden border-t border-gray-100 dark:border-gray-800 -mx-4 px-4">
          <MobileNavLink to="/" active={isActive("/") && pathname === "/"}>
            <HomeIcon />
            <span>Home</span>
          </MobileNavLink>
          <MobileNavLink to="/leads" active={isActive("/leads")}>
            <PipelineIcon />
            <span>Pipeline</span>
            {stats.pipelineCount > 0 && (
              <span className="ml-1 text-xs text-blue-600">{stats.pipelineCount}</span>
            )}
          </MobileNavLink>
          <MobileNavLink to="/activities" active={isActive("/activities")}>
            <ActivityIcon />
            <span>Activity</span>
          </MobileNavLink>
          <MobileNavLink to="/missions" active={isActive("/missions")}>
            <BriefcaseIcon />
            <span>Missions</span>
          </MobileNavLink>
          <MobileNavLink to="/analytics" active={isActive("/analytics")}>
            <ChartIcon />
            <span>Analytics</span>
          </MobileNavLink>
          <MobileNavLink to="/profile" active={isActive("/profile")}>
            <UserIcon />
            <span>Profile</span>
          </MobileNavLink>
          <MobileNavLink to="/settings" active={isActive("/settings")}>
            <GearIcon />
            <span>Settings</span>
          </MobileNavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
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
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
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

function ActivityIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
