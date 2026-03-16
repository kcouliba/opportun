import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mission, setMission] = useState<MissionForm>(defaultMission);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mission.title.trim()) {
      showToast(t("newMission.titleRequired"), "error");
      return;
    }
    if (!mission.client.trim()) {
      showToast(t("newMission.clientRequired"), "error");
      return;
    }
    if (!mission.startDate) {
      showToast(t("newMission.startDateRequired"), "error");
      return;
    }
    if (!mission.rate) {
      showToast(t("newMission.rateRequired"), "error");
      return;
    }

    setSaving(true);

    try {
      await invoke("create_mission", {
        data: {
          ...mission,
          startDate: mission.startDate || null,
          endDate: mission.endDate || null,
        },
      });

      showToast(t("newMission.missionAdded"), "success");
      navigate("/missions");
    } catch {
      showToast(t("newMission.failedCreate"), "error");
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{t("newMission.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t("newMission.subtitle")}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Section title={t("missions.missionDetails")}>
            <Field label={t("missions.missionTitle")} required>
              <input
                type="text"
                value={mission.title}
                onChange={(e) => setMission({ ...mission, title: e.target.value })}
                className="input"
                placeholder={t("newMission.titlePlaceholder")}
                required
              />
            </Field>
            <Field label={t("missions.client")} required>
              <input
                type="text"
                value={mission.client}
                onChange={(e) => setMission({ ...mission, client: e.target.value })}
                className="input"
                placeholder={t("newMission.clientPlaceholder")}
                required
              />
            </Field>
            <Field label={t("missions.description")}>
              <textarea
                value={mission.description}
                onChange={(e) => setMission({ ...mission, description: e.target.value })}
                className="input min-h-[80px]"
                placeholder={t("newMission.descriptionPlaceholder")}
              />
            </Field>
          </Section>

          {/* Timeline */}
          <Section title={t("missions.timeline")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("missions.startDate")} required>
                <input
                  type="date"
                  value={mission.startDate}
                  onChange={(e) => setMission({ ...mission, startDate: e.target.value })}
                  className="input"
                  required
                />
              </Field>
              <Field label={t("missions.endDate")} hint={t("missions.endDateHint")}>
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
          <Section title={t("missions.financial")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("missions.dailyRate")} required>
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
                  <span className="text-gray-500">{t("common.perDay")}</span>
                </div>
              </Field>
              <Field label={t("missions.daysPerWeek")}>
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
                  {t("missions.estimatedRevenue", { amount: calculateRevenue(
                    mission.rate,
                    mission.daysPerWeek,
                    mission.startDate,
                    mission.endDate
                  ).toLocaleString() })}
                </p>
              </div>
            )}
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? t("common.saving") : t("newMission.title")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/missions")}
              className="btn btn-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
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
