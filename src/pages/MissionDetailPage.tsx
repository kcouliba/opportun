import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import { PageLoader } from "@/components/LoadingSpinner";
import { ErrorState } from "@/components/ErrorState";
import Breadcrumbs from "@/components/Breadcrumbs";
import type { Mission } from "@/types/index";

export default function MissionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    client: "",
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    rate: 0,
    daysPerWeek: 5,
    status: "active",
  });

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    invoke<Mission>("get_mission", { id })
      .then((data) => {
        setMission(data);
        setForm({
          client: data.client,
          title: data.title,
          description: data.description || "",
          startDate: data.startDate ? data.startDate.split("T")[0] : "",
          endDate: data.endDate ? data.endDate.split("T")[0] : "",
          rate: data.rate,
          daysPerWeek: data.daysPerWeek,
          status: data.status,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Failed to load mission");
        setLoading(false);
      });
  };

  useEffect(() => { loadData(); }, [id]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast(t("newMission.titleRequired"), "error");
      return;
    }
    if (!form.client.trim()) {
      showToast(t("newMission.clientRequired"), "error");
      return;
    }

    setSaving(true);

    try {
      const updated = await invoke<Mission>("update_mission", { id, data: form });
      setMission(updated);
      setEditing(false);
      showToast(t("missions.missionUpdated"), "success");
    } catch {
      showToast(t("missions.failedUpdate"), "error");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    try {
      await invoke("delete_mission", { id });
      showToast(t("missions.missionDeleted"), "success");
      navigate("/missions");
    } catch {
      showToast(t("missions.failedDelete"), "error");
      setShowDeleteConfirm(false);
    }
  };

  const markAsCompleted = async () => {
    setForm({ ...form, status: "completed" });
    setSaving(true);

    try {
      await invoke("update_mission", {
        id,
        data: { ...form, status: "completed" },
      });

      setMission({ ...mission!, status: "completed" });
      showToast(t("missions.missionUpdated"), "success");
    } catch {
      showToast(t("missions.failedUpdate"), "error");
    }
    setSaving(false);
  };

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  if (!mission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t("common.noResults")}</p>
      </div>
    );
  }

  const daysUntilEnd = mission.endDate
    ? Math.max(0, Math.ceil(
        (new Date(mission.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : null;

  const estimatedRevenue =
    form.rate && form.startDate && form.endDate
      ? calculateRevenue(form.rate, form.daysPerWeek, form.startDate, form.endDate)
      : null;

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <Breadcrumbs items={[
            { label: t("missions.title"), to: "/missions" },
            { label: mission.client },
            { label: mission.title },
          ]} />
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">{mission.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">{mission.client}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  mission.status === "active"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : mission.status === "completed"
                    ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}
              >
                {t(`missions.${mission.status}`)}
              </span>
            </div>
          </div>
        </header>

        {/* Quick Stats */}
        {mission.status === "active" && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500">{t("missions.dailyRate")}</p>
              <p className="text-xl font-bold">{mission.rate}€</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500">{t("missions.daysPerWeek")}</p>
              <p className="text-xl font-bold">{mission.daysPerWeek}</p>
            </div>
            <div
              className={`rounded-lg border p-4 ${
                daysUntilEnd !== null && daysUntilEnd <= 30
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : daysUntilEnd !== null && daysUntilEnd <= 60
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              <p className="text-sm text-gray-500">{t("missions.endDate")}</p>
              <p className="text-xl font-bold">
                {daysUntilEnd !== null ? (daysUntilEnd <= 0 ? t("common.ended") : `${daysUntilEnd}d`) : t("common.ongoing")}
              </p>
            </div>
          </div>
        )}

        {/* Edit Form or Details */}
        {editing ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold mb-4">{t("missions.missionDetails")}</h2>
            <div className="space-y-4">
              <Field label={t("missions.missionTitle")}>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label={t("missions.client")}>
                <input
                  type="text"
                  value={form.client}
                  onChange={(e) => setForm({ ...form, client: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label={t("missions.description")}>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input min-h-[80px]"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("missions.startDate")}>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label={t("missions.endDate")}>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("missions.dailyRate")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form.rate}
                      onChange={(e) => setForm({ ...form, rate: parseInt(e.target.value) || 0 })}
                      className="input w-28"
                    />
                    <span className="text-gray-500">{t("common.perDay")}</span>
                  </div>
                </Field>
                <Field label={t("missions.daysPerWeek")}>
                  <select
                    value={form.daysPerWeek}
                    onChange={(e) => setForm({ ...form, daysPerWeek: parseFloat(e.target.value) })}
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
              <Field label={t("missions.status")}>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="input w-40"
                >
                  <option value="active">{t("missions.active")}</option>
                  <option value="completed">{t("missions.completed")}</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>

              {estimatedRevenue && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {t("missions.estimatedRevenue", { amount: estimatedRevenue.toLocaleString() })}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-semibold mb-4">{t("missions.missionDetails")}</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t("missions.timeline")}</dt>
                  <dd>
                    {new Date(mission.startDate).toLocaleDateString()} →{" "}
                    {mission.endDate
                      ? new Date(mission.endDate).toLocaleDateString()
                      : t("common.ongoing")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t("missions.dailyRate")}</dt>
                  <dd>{mission.rate}{t("common.perDay")} × {mission.daysPerWeek} {t("common.days")}/week</dd>
                </div>
                {mission.description && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 mb-1">{t("missions.description")}</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{mission.description}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => setEditing(true)}
                  className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {t("common.edit")}
                </button>
                {mission.status === "active" && (
                  <button
                    onClick={markAsCompleted}
                    disabled={saving}
                    className="w-full py-2 px-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                  >
                    {saving ? t("common.saving") : t("missions.markCompleted")}
                  </button>
                )}
                {showDeleteConfirm ? (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      {t("common.confirm")}?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                      >
                        {t("common.delete")}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 px-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  >
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
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
