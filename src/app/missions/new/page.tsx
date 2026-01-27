"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface MissionForm {
  client: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  rate: number | null;
  daysPerWeek: number;
}

const defaultMission: MissionForm = {
  client: "",
  title: "",
  description: "",
  startDate: "",
  endDate: "",
  rate: null,
  daysPerWeek: 5,
};

export default function NewMissionPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [mission, setMission] = useState<MissionForm>(defaultMission);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mission.title.trim()) {
      showToast("Title is required", "error");
      return;
    }
    if (!mission.client.trim()) {
      showToast("Client is required", "error");
      return;
    }
    if (!mission.startDate) {
      showToast("Start date is required", "error");
      return;
    }
    if (!mission.rate) {
      showToast("Daily rate is required", "error");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mission,
          startDate: mission.startDate || null,
          endDate: mission.endDate || null,
        }),
      });

      if (res.ok) {
        showToast("Mission added successfully", "success");
        router.push("/missions");
      } else {
        showToast("Failed to create mission. Make sure you have a profile set up first.", "error");
        setSaving(false);
      }
    } catch {
      showToast("An error occurred while creating mission", "error");
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Add Mission</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track your current or upcoming work
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Section title="Mission Details">
            <Field label="Title" required>
              <input
                type="text"
                value={mission.title}
                onChange={(e) => setMission({ ...mission, title: e.target.value })}
                className="input"
                placeholder="e.g., Platform Migration"
                required
              />
            </Field>
            <Field label="Client" required>
              <input
                type="text"
                value={mission.client}
                onChange={(e) => setMission({ ...mission, client: e.target.value })}
                className="input"
                placeholder="e.g., Acme Corp"
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                value={mission.description}
                onChange={(e) => setMission({ ...mission, description: e.target.value })}
                className="input min-h-[80px]"
                placeholder="Brief description of the work..."
              />
            </Field>
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date" required>
                <input
                  type="date"
                  value={mission.startDate}
                  onChange={(e) => setMission({ ...mission, startDate: e.target.value })}
                  className="input"
                  required
                />
              </Field>
              <Field label="End Date" hint="Leave empty if ongoing">
                <input
                  type="date"
                  value={mission.endDate}
                  onChange={(e) => setMission({ ...mission, endDate: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
          </Section>

          {/* Financial */}
          <Section title="Financial">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Daily Rate" required>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={mission.rate ?? ""}
                    onChange={(e) =>
                      setMission({ ...mission, rate: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="input w-28"
                    min={0}
                    required
                  />
                  <span className="text-gray-500">€/day</span>
                </div>
              </Field>
              <Field label="Days per Week">
                <select
                  value={mission.daysPerWeek}
                  onChange={(e) =>
                    setMission({ ...mission, daysPerWeek: parseFloat(e.target.value) })
                  }
                  className="input w-24"
                >
                  <option value={5}>5</option>
                  <option value={4.5}>4.5</option>
                  <option value={4}>4</option>
                  <option value={3.5}>3.5</option>
                  <option value={3}>3</option>
                  <option value={2.5}>2.5</option>
                  <option value={2}>2</option>
                </select>
              </Field>
            </div>
            {mission.rate && mission.startDate && mission.endDate && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Estimated revenue:{" "}
                  <strong>
                    {calculateRevenue(
                      mission.rate,
                      mission.daysPerWeek,
                      mission.startDate,
                      mission.endDate
                    ).toLocaleString()}
                    €
                  </strong>
                </p>
              </div>
            )}
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Add Mission"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/missions")}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .input {
          @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500;
        }
        .btn {
          @apply px-4 py-2 rounded-md font-medium transition-colors;
        }
        .btn-primary {
          @apply bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50;
        }
        .btn-secondary {
          @apply bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600;
        }
      `}</style>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {hint && <span className="font-normal text-gray-500 ml-2">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function calculateRevenue(
  rate: number,
  daysPerWeek: number,
  startDate: string,
  endDate: string
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const weeks = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7);
  return Math.round(rate * daysPerWeek * weeks);
}
