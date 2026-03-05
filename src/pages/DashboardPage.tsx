import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { PageLoader } from "@/components/LoadingSpinner";
import type { Profile, Mission, Lead, FollowUpLead, DashboardForecast, DashboardAlert } from "@/types";

interface DashboardData {
  hasProfile: boolean;
  profileName: string | null;
  activeMission: Mission | null;
  daysUntilEnd: number | null;
  pipelineCount: number;
  qualifiedCount: number;
  highMatchCount: number;
  recentLeads: Lead[];
  followUps: FollowUpLead[];
  overdueCount: number;
  todayCount: number;
  totalFollowUps: number;
}

function formatEuro(n: number): string {
  if (n === 0) return "0 EUR";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/,/g, " ") + " EUR";
}

function computeDashboardData(
  profile: Profile | null,
  missions: Mission[],
  leads: Lead[]
): DashboardData {
  const activeMission = missions.find((m) => m.status === "active") || null;
  const daysUntilEnd = activeMission?.endDate
    ? Math.ceil(
        (new Date(activeMission.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const activeLeads = leads.filter((l) => !["won", "lost"].includes(l.stage));
  const qualifiedLeads = leads.filter((l) => l.stage === "qualified" || l.stage === "negotiating");
  const highMatchLeads = leads.filter((l) => (l.matchScore ?? 0) >= 70 && l.stage === "lead");

  // Follow-up logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const leadsWithFollowUp = activeLeads
    .filter((l) => l.nextActionDate)
    .map((l) => {
      const actionDate = new Date(l.nextActionDate!);
      actionDate.setHours(0, 0, 0, 0);
      const isOverdue = actionDate < today;
      const isToday = actionDate.getTime() === today.getTime();
      const daysUntil = Math.ceil((actionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { ...l, isOverdue, isToday, daysUntil };
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isToday && !b.isToday) return -1;
      if (!a.isToday && b.isToday) return 1;
      return a.daysUntil - b.daysUntil;
    });

  const overdueCount = leadsWithFollowUp.filter((l) => l.isOverdue).length;
  const todayCount = leadsWithFollowUp.filter((l) => l.isToday).length;

  return {
    hasProfile: !!profile,
    profileName: profile?.name || null,
    activeMission,
    daysUntilEnd,
    pipelineCount: activeLeads.length,
    qualifiedCount: qualifiedLeads.length,
    highMatchCount: highMatchLeads.length,
    recentLeads: leads.slice(0, 5),
    followUps: leadsWithFollowUp.slice(0, 5),
    overdueCount,
    todayCount,
    totalFollowUps: leadsWithFollowUp.length,
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [forecast, setForecast] = useState<DashboardForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      invoke<Profile | null>("get_profile"),
      invoke<Mission[]>("list_missions"),
      invoke<{ data: Lead[] }>("list_leads", { filters: {} }),
      invoke<DashboardForecast>("get_dashboard_forecast"),
    ])
      .then(([profile, missions, leadsResponse, forecastData]) => {
        const leads = leadsResponse.data || [];
        setData(computeDashboardData(profile, missions, leads));
        setForecast(forecastData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <PageLoader />;
  }

  const isSetUp = data.hasProfile;

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-1">
            {data.profileName ? `Welcome back, ${data.profileName.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isSetUp
              ? "Your pipeline at a glance"
              : "Set up your profile to get started"}
          </p>
        </header>

        {!isSetUp ? (
          /* Getting Started - Show when not set up */
          <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Get Started</h2>
            <ol className="space-y-4">
              <Step number={1} title="Set up your profile" to="/profile" done={data.hasProfile}>
                Add your skills, rate expectations, and deal-breakers.
                This powers the smart filtering.
              </Step>
              <Step number={2} title="Add your current mission" to="/missions/new" done={!!data.activeMission}>
                Track when your income stops so you know when to act.
              </Step>
              <Step number={3} title="Add leads to your pipeline" to="/leads/new" done={data.pipelineCount > 0}>
                Manual entry for now. We&apos;ll match them against your profile.
              </Step>
              <Step number={4} title="Generate documents" to="/leads" done={false}>
                One-click cover letters and key questions for qualified leads.
              </Step>
            </ol>
          </section>
        ) : (
          /* Dashboard - Show when set up */
          <>
            {/* Key Metrics */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <DashboardCard
                title="Mission Ends In"
                value={
                  data.daysUntilEnd !== null
                    ? `${data.daysUntilEnd} days`
                    : data.activeMission
                    ? "Ongoing"
                    : "No mission"
                }
                subtitle={data.activeMission?.client || "Add your current work"}
                to="/missions"
                variant={
                  !data.activeMission
                    ? "warning"
                    : data.daysUntilEnd === null
                    ? "success"
                    : data.daysUntilEnd <= 30
                    ? "danger"
                    : data.daysUntilEnd <= 60
                    ? "warning"
                    : "success"
                }
              />
              <DashboardCard
                title="Pipeline"
                value={`${data.pipelineCount} leads`}
                subtitle={
                  data.qualifiedCount > 0
                    ? `${data.qualifiedCount} qualified`
                    : "No qualified leads yet"
                }
                to="/leads"
                variant={data.pipelineCount === 0 ? "warning" : "default"}
              />
              <DashboardCard
                title="High Match"
                value={`${data.highMatchCount} leads`}
                subtitle="70%+ match score"
                to="/leads"
                variant={data.highMatchCount > 0 ? "success" : "default"}
              />
            </section>

            {/* Alerts Section */}
            {forecast && forecast.alerts.length > 0 && (
              <AlertsSection alerts={forecast.alerts} />
            )}

            {/* Income Forecast Section */}
            {forecast && (
              <IncomeForecastSection forecast={forecast} />
            )}

            {/* Follow-ups Section */}
            {data.followUps.length > 0 && (
              <section className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Follow-ups</h2>
                    <p className="text-sm text-gray-500">
                      {data.overdueCount > 0 && (
                        <span className="text-red-600 font-medium">{data.overdueCount} overdue</span>
                      )}
                      {data.overdueCount > 0 && data.todayCount > 0 && " · "}
                      {data.todayCount > 0 && (
                        <span className="text-amber-600 font-medium">{data.todayCount} today</span>
                      )}
                      {(data.overdueCount > 0 || data.todayCount > 0) && data.totalFollowUps > data.overdueCount + data.todayCount && " · "}
                      {data.totalFollowUps > data.overdueCount + data.todayCount && (
                        <span>{data.totalFollowUps - data.overdueCount - data.todayCount} upcoming</span>
                      )}
                    </p>
                  </div>
                  <Link to="/leads" className="text-sm text-blue-600 hover:text-blue-700">
                    View all →
                  </Link>
                </div>
                <div className="space-y-2">
                  {data.followUps.map((lead) => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      className={`block p-4 rounded-lg border transition-colors ${
                        lead.isOverdue
                          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                          : lead.isToday
                          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{lead.client}</p>
                          <p className="text-sm text-gray-500">{lead.contactName || lead.title}</p>
                          {lead.nextAction && (
                            <p className="text-xs text-gray-400 mt-1">{lead.nextAction}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-sm font-medium ${
                              lead.isOverdue
                                ? "text-red-600 dark:text-red-400"
                                : lead.isToday
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-gray-500"
                            }`}
                          >
                            {lead.isOverdue
                              ? `${Math.abs(lead.daysUntil)}d overdue`
                              : lead.isToday
                              ? "Today"
                              : `in ${lead.daysUntil}d`}
                          </span>
                          {lead.contactInfo && (
                            <p className="text-xs text-gray-400 mt-1">{lead.contactInfo}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Leads - only show if no follow-ups to avoid clutter */}
            {data.recentLeads.length > 0 && data.followUps.length === 0 && (
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Recent Leads</h2>
                  <Link to="/leads" className="text-sm text-blue-600 hover:text-blue-700">
                    View all →
                  </Link>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                  {data.recentLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      className="flex justify-between items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{lead.title}</p>
                        <p className="text-sm text-gray-500">{lead.client}</p>
                      </div>
                      <div className="text-right">
                        {lead.matchScore !== null && (
                          <span
                            className={`text-sm font-medium ${
                              lead.matchScore >= 70
                                ? "text-green-600"
                                : lead.matchScore >= 40
                                ? "text-yellow-600"
                                : "text-gray-400"
                            }`}
                          >
                            {lead.matchScore}%
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function AlertsSection({ alerts }: { alerts: DashboardAlert[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? alerts : alerts.slice(0, 4);

  const severityStyles = {
    critical: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
    warning: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
    info: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
  };

  const actionStyles = {
    critical: "text-red-700 dark:text-red-300",
    warning: "text-amber-700 dark:text-amber-300",
    info: "text-blue-700 dark:text-blue-300",
  };

  return (
    <section className="mb-8 space-y-2">
      {visible.map((alert) => (
        <div
          key={alert.id}
          className={`p-4 border rounded-lg ${severityStyles[alert.severity]}`}
        >
          <p className="font-medium">{alert.title}</p>
          <p className="text-sm mt-1 opacity-90">
            {alert.message}
            {alert.actionLink && alert.actionLabel && (
              <>
                {" "}
                <Link to={alert.actionLink} className={`underline font-medium ${actionStyles[alert.severity]}`}>
                  {alert.actionLabel} →
                </Link>
              </>
            )}
          </p>
        </div>
      ))}
      {alerts.length > 4 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Show all ({alerts.length}) →
        </button>
      )}
    </section>
  );
}

function IncomeForecastSection({ forecast }: { forecast: DashboardForecast }) {
  const { securedIncome, pipelineIncome, monthlyProjection } = forecast;
  const hasData = securedIncome.missions.length > 0 || pipelineIncome.totalWeighted > 0;

  if (!hasData) return null;

  const maxTotal = Math.max(
    ...monthlyProjection.map((m) => m.secured + m.potential),
    1
  );

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4">Income Forecast</h2>

      {/* Income summary - 2 column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Secured Income</h3>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            {formatEuro(securedIncome.total)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            ~{formatEuro(securedIncome.monthlyAvg)}/mo from active missions
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Pipeline (weighted)</h3>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
            {formatEuro(pipelineIncome.totalWeighted)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            qualified @ 30%, negotiating @ 60%
          </p>
        </div>
      </div>

      {/* Monthly projection bars */}
      {monthlyProjection.some((m) => m.secured > 0 || m.potential > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">6-Month Projection</h3>
          <div className="space-y-3">
            {monthlyProjection.map((m) => {
              const total = m.secured + m.potential;
              const securedWidth = maxTotal > 0 ? (m.secured / maxTotal) * 100 : 0;
              const potentialWidth = maxTotal > 0 ? (m.potential / maxTotal) * 100 : 0;
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-20 shrink-0">
                    {m.month}
                  </span>
                  <div className="flex-1 flex h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    {securedWidth > 0 && (
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${securedWidth}%` }}
                      />
                    )}
                    {potentialWidth > 0 && (
                      <div
                        className="h-full bg-blue-400/60"
                        style={{ width: `${potentialWidth}%` }}
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium w-28 text-right shrink-0">
                    {formatEuro(total)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
              Secured
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-400/60 inline-block" />
              Potential
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function DashboardCard({
  title,
  value,
  subtitle,
  to,
  variant = "default",
}: {
  title: string;
  value: string;
  subtitle: string;
  to: string;
  variant?: "default" | "primary" | "warning" | "danger" | "success";
}) {
  const variantStyles = {
    default: "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
    primary: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    warning: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    danger: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    success: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  };

  const valueColor = {
    default: "",
    primary: "text-blue-700 dark:text-blue-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-red-700 dark:text-red-300",
    success: "text-green-700 dark:text-green-300",
  };

  return (
    <Link
      to={to}
      className={`block p-6 rounded-lg border ${variantStyles[variant]} hover:shadow-md transition-shadow`}
    >
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
        {title}
      </h3>
      <p className={`text-2xl font-bold mb-1 ${valueColor[variant]}`}>{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
    </Link>
  );
}

function Step({
  number,
  title,
  to,
  done,
  children,
}: {
  number: number;
  title: string;
  to: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
          done
            ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
            : "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <div>
        <Link
          to={to}
          className={`font-medium hover:text-blue-600 dark:hover:text-blue-400 ${
            done ? "text-gray-400 line-through" : ""
          }`}
        >
          {title}
        </Link>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{children}</p>
      </div>
    </li>
  );
}
