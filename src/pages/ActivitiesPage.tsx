import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@/components/LoadingSpinner";
import type { ActivityWithLead, PaginatedResponse } from "@/types/index";

const activityTypeIcons: Record<string, string> = {
  call: "\ud83d\udcde",
  email: "\ud83d\udce7",
  meeting: "\ud83e\udd1d",
  interview: "\ud83d\udcbc",
  note: "\ud83d\udcdd",
  other: "\ud83d\udccb",
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDateGroup(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (activityDate.getTime() === today.getTime()) {
    return "today";
  } else if (activityDate.getTime() === yesterday.getTime()) {
    return "yesterday";
  } else if (activityDate >= weekAgo) {
    return "thisWeek";
  } else {
    return "earlier";
  }
}

function groupActivitiesByDate(activities: ActivityWithLead[]): Record<string, ActivityWithLead[]> {
  const groups: Record<string, ActivityWithLead[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  activities.forEach((activity) => {
    const group = getDateGroup(activity.occurredAt);
    groups[group].push(activity);
  });

  return groups;
}

export default function ActivitiesPage() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityWithLead[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<ActivityWithLead>["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const fetchActivities = async (offset = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    const filters: Record<string, string | number> = {
      limit: 50,
      offset,
    };

    if (typeFilter) {
      filters.type = typeFilter;
    }
    if (fromDate) {
      filters.from = fromDate;
    }
    if (toDate) {
      filters.to = toDate;
    }

    try {
      const data = await invoke<PaginatedResponse<ActivityWithLead>>("list_activities", { filters });

      if (append) {
        setActivities((prev) => [...prev, ...data.data]);
      } else {
        setActivities(data.data);
      }
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    fetchActivities(0, false);
  }, [typeFilter, fromDate, toDate]);

  const handleLoadMore = () => {
    if (pagination && pagination.hasMore) {
      fetchActivities(pagination.offset + pagination.limit, true);
    }
  };

  const clearFilters = () => {
    setTypeFilter("");
    setFromDate("");
    setToDate("");
  };

  const hasFilters = typeFilter || fromDate || toDate;
  const groupedActivities = groupActivitiesByDate(activities);
  const groupOrder = ["today", "yesterday", "thisWeek", "earlier"];

  if (loading && activities.length === 0) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{t("activities.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t("activities.subtitle")}
          </p>
        </header>

        {/* Filters */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("activities.type")}
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-[150px]"
              >
                <option value="">{t("activities.allTypes")}</option>
                {Object.entries(activityTypeIcons).map(([value, icon]) => (
                  <option key={value} value={value}>
                    {icon} {t(`activityTypes.${value}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("activities.from")}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("activities.to")}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              />
            </div>

            {/* Clear Filters */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                {t("activities.clearFilters")}
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {activities.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">{t("activities.noActivities")}</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-blue-600 hover:text-blue-700"
              >
                {t("activities.clearFilters")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {groupOrder.map((groupName) => {
              const groupActivities = groupedActivities[groupName];
              if (groupActivities.length === 0) return null;

              return (
                <div key={groupName}>
                  {/* Group Header */}
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                    {t(`common.${groupName}`)}
                  </h2>

                  {/* Activities */}
                  <div className="space-y-3">
                    {groupActivities.map((activity) => (
                      <ActivityItem key={activity.id} activity={activity} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {pagination?.hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? t("common.loading") : t("common.loadMore")}
                </button>
              </div>
            )}

            {/* Total count */}
            {pagination && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                {t("activities.showing", { count: activities.length, total: pagination.total })}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ActivityItem({ activity }: { activity: ActivityWithLead }) {
  const { t } = useTranslation();
  const icon = activityTypeIcons[activity.type] || activityTypeIcons.other;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 text-2xl">{icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Type badge and title */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                  {t(`activityTypes.${activity.type}`, activity.type)}
                </span>
                <span className="font-medium text-gray-900 dark:text-white truncate">
                  {activity.title}
                </span>
              </div>

              {/* Lead link */}
              <Link
                to={`/leads/${activity.lead.id}`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
              >
                {activity.lead.client} - {activity.lead.title}
              </Link>
            </div>

            {/* Time */}
            <div className="flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">
              {formatTime(activity.occurredAt)}
              {activity.duration && (
                <span className="ml-1">({activity.duration}m)</span>
              )}
            </div>
          </div>

          {/* Description */}
          {activity.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
              {activity.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
