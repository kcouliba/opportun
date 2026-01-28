"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageLoader } from "@/components/LoadingSpinner";

interface Lead {
  id: string;
  client: string;
  title: string;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  duration: number | null;
  lead: Lead;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const activityTypes: Record<string, { label: string; icon: string }> = {
  call: { label: "Call", icon: "\ud83d\udcde" },
  email: { label: "Email", icon: "\ud83d\udce7" },
  meeting: { label: "Meeting", icon: "\ud83e\udd1d" },
  interview: { label: "Interview", icon: "\ud83d\udcbc" },
  note: { label: "Note", icon: "\ud83d\udcdd" },
  other: { label: "Other", icon: "\ud83d\udccb" },
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
    return "Today";
  } else if (activityDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else if (activityDate >= weekAgo) {
    return "This Week";
  } else {
    return "Earlier";
  }
}

function groupActivitiesByDate(activities: Activity[]): Record<string, Activity[]> {
  const groups: Record<string, Activity[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Earlier: [],
  };

  activities.forEach((activity) => {
    const group = getDateGroup(activity.occurredAt);
    groups[group].push(activity);
  });

  return groups;
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
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

    const params = new URLSearchParams();
    params.set("limit", "50");
    params.set("offset", offset.toString());

    if (typeFilter) {
      params.set("type", typeFilter);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }

    try {
      const res = await fetch(`/api/activities?${params.toString()}`);
      const data = await res.json();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const groupOrder = ["Today", "Yesterday", "This Week", "Earlier"];

  if (loading && activities.length === 0) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Activity Timeline</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Recent interactions across all leads
          </p>
        </header>

        {/* Filters */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-[150px]"
              >
                <option value="">All types</option>
                {Object.entries(activityTypes).map(([value, { label, icon }]) => (
                  <option key={value} value={value}>
                    {icon} {label}
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From
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
                To
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
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {activities.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">No activities found</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-blue-600 hover:text-blue-700"
              >
                Clear filters
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
                    {groupName}
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
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}

            {/* Total count */}
            {pagination && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Showing {activities.length} of {pagination.total} activities
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const typeInfo = activityTypes[activity.type] || activityTypes.other;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 text-2xl">{typeInfo.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Type badge and title */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                  {typeInfo.label}
                </span>
                <span className="font-medium text-gray-900 dark:text-white truncate">
                  {activity.title}
                </span>
              </div>

              {/* Lead link */}
              <Link
                href={`/leads/${activity.lead.id}`}
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
