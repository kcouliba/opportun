import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import { useAiQueue } from "@/components/AiQueue";
import { PageLoader } from "@/components/LoadingSpinner";
import { ErrorState } from "@/components/ErrorState";
import { useAiSettings } from "@/hooks/useAiSettings";
import LeadAnalysisCard from "@/components/LeadAnalysisCard";
import ActivityInsightsCard from "@/components/ActivityInsightsCard";
import LeadSourceSelect from "@/components/LeadSourceSelect";
import Breadcrumbs from "@/components/Breadcrumbs";

interface Lead {
  id: string;
  client: string;
  title: string;
  description: string | null;
  source: string;
  sourceUrl: string | null;
  stage: string;
  location: string | null;
  remotePolicy: string | null;
  offeredRate: number | null;
  estimatedStartDate: string | null;
  estimatedDuration: number | null;
  requiredTechnologies: string | null;
  requiredDomains: string | null;
  matchScore: number | null;
  autoFiltered: boolean;
  contactName: string | null;
  contactInfo: string | null;
  notes: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  contentLanguage: string | null;
  createdAt: string;
  documents: Document[];
  activities: Activity[];
}

interface Document {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  leadId: string;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  duration: number | null;
  createdAt: string;
}

const stages = ["lead", "qualified", "negotiating", "won", "lost"];

const stageColors: Record<string, string> = {
  lead: "bg-gray-100 text-gray-800",
  qualified: "bg-blue-100 text-blue-800",
  negotiating: "bg-yellow-100 text-yellow-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

const activityIcons: Record<string, string> = {
  call: "\ud83d\udcde",
  email: "\ud83d\udce7",
  meeting: "\ud83e\udd1d",
  interview: "\ud83d\udcbc",
  note: "\ud83d\udcdd",
  other: "\ud83d\udccb",
};

export default function LeadDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAiEnabled } = useAiSettings();
  const { enqueue } = useAiQueue();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Application message options
  const [showMsgOptions, setShowMsgOptions] = useState(false);
  const [msgLengthPreset, setMsgLengthPreset] = useState<"short" | "standard" | "long">("standard");
  const [msgCharLimit, setMsgCharLimit] = useState<string>("");
  const [msgTone, setMsgTone] = useState<"professional" | "friendly" | "direct">("professional");
  const [msgCustomFocus, setMsgCustomFocus] = useState("");

  // Activity state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityForm, setActivityForm] = useState({
    type: "note",
    title: "",
    description: "",
    occurredAt: "",
    duration: null as number | null,
  });
  const [savingActivity, setSavingActivity] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    client: "",
    title: "",
    description: "",
    source: "recruiter",
    sourceUrl: "",
    location: "",
    remotePolicy: "remote",
    offeredRate: null as number | null,
    estimatedStartDate: "",
    estimatedDuration: null as number | null,
    requiredTechnologies: [] as string[],
    requiredDomains: [] as string[],
    contactName: "",
    contactInfo: "",
    notes: "",
    contentLanguage: "",
  });
  const [techInput, setTechInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    invoke<Lead>("get_lead", { id })
      .then((data) => {
        setLead(data);
        setForm({
          client: data.client || "",
          title: data.title || "",
          description: data.description || "",
          source: data.source || "recruiter",
          sourceUrl: data.sourceUrl || "",
          location: data.location || "",
          remotePolicy: data.remotePolicy || "remote",
          offeredRate: data.offeredRate,
          estimatedStartDate: data.estimatedStartDate ? data.estimatedStartDate.split("T")[0] : "",
          estimatedDuration: data.estimatedDuration,
          requiredTechnologies: data.requiredTechnologies ? JSON.parse(data.requiredTechnologies) : [],
          requiredDomains: data.requiredDomains ? JSON.parse(data.requiredDomains) : [],
          contactName: data.contactName || "",
          contactInfo: data.contactInfo || "",
          notes: data.notes || "",
          contentLanguage: data.contentLanguage || "",
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Failed to load lead details");
        setLoading(false);
      });
  };

  useEffect(() => { loadData(); }, [id]);

  const updateStage = async (newStage: string) => {
    if (!lead || !id) return;

    try {
      const updated = await invoke<Lead>("update_lead", {
        id,
        data: { ...lead, stage: newStage },
      });
      setLead({ ...lead, stage: newStage, matchScore: updated.matchScore });
      showToast(t("leads.movedToStage", { stage: t(`stages.${newStage}`) }));
    } catch {
      showToast(t("leads.failedUpdateStage"), "error");
    }
  };

  const handleSave = async () => {
    if (!id) return;

    // Validation
    if (!form.title.trim()) {
      showToast(t("newLead.titleRequired"), "error");
      return;
    }
    if (!form.client.trim()) {
      showToast(t("newLead.clientRequired"), "error");
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      requiredTechnologies: JSON.stringify(form.requiredTechnologies),
      requiredDomains: JSON.stringify(form.requiredDomains),
      estimatedStartDate: form.estimatedStartDate || null,
      contentLanguage: form.contentLanguage || null,
      stage: lead?.stage,
    };

    try {
      const updated = await invoke<Lead>("update_lead", {
        id,
        data: payload,
      });
      setLead({
        ...lead!,
        ...updated,
        documents: lead!.documents,
      });
      setEditing(false);
      showToast(t("leadDetail.leadUpdated"));
    } catch {
      showToast(t("leadDetail.failedUpdate"), "error");
    }
    setSaving(false);
  };

  const docLabels: Record<string, string> = {
    cover_letter: t("leadDetail.coverLetter"),
    key_questions: t("leadDetail.keyQuestions"),
    interview_prep: t("leadDetail.interviewPrep"),
    lead_analysis: t("leadDetail.analysis"),
    application_message: t("leadDetail.applicationMessage"),
  };

  const generateDocument = async (type: string) => {
    if (!id) return;
    setGenerating(type);

    try {
      let doc: Document;

      if (type === "cover_letter" && isAiEnabled) {
        try {
          doc = await enqueue<Document>("generate_cover_letter_ai", { leadId: id, locale: i18n.language }, "Generating cover letter");
        } catch (aiErr) {
          console.warn("AI cover letter failed, falling back to template:", aiErr);
          // Fallback to template
          doc = await invoke<Document>("generate_document", { leadId: id, docType: type });
        }
      } else if (type === "interview_prep") {
        doc = await enqueue<Document>("generate_interview_prep_ai", { leadId: id, locale: i18n.language }, "Generating interview prep");
      } else {
        doc = await invoke<Document>("generate_document", { leadId: id, docType: type });
      }

      if (lead) {
        setLead({ ...lead, documents: [...lead.documents, doc] });
        setActiveDoc(doc);
      }
      showToast(t("leadDetail.docGenerated", { type: docLabels[type] || type }));
    } catch (err) {
      console.error("Document generation failed:", err);
      showToast(t("leadDetail.failedGenerateDoc"), "error");
    }
    setGenerating(null);
  };

  const generateApplicationMessage = async () => {
    if (!id) return;
    setGenerating("application_message");

    const options = {
      lengthPreset: msgLengthPreset,
      charLimit: msgCharLimit ? parseInt(msgCharLimit, 10) : undefined,
      tone: msgTone,
      customFocus: msgCustomFocus || undefined,
    };

    try {
      let doc: Document;
      if (isAiEnabled) {
        try {
          doc = await enqueue<Document>(
            "generate_application_message_ai",
            { leadId: id, options, locale: i18n.language },
            "Generating application message"
          );
        } catch (aiErr) {
          console.warn("AI application message failed, falling back to template:", aiErr);
          doc = await invoke<Document>("generate_application_message", {
            leadId: id,
            options,
          });
        }
      } else {
        doc = await invoke<Document>("generate_application_message", {
          leadId: id,
          options,
        });
      }

      if (lead) {
        setLead({ ...lead, documents: [...lead.documents, doc] });
        setActiveDoc(doc);
      }
      showToast(t("leadDetail.docGenerated", { type: docLabels["application_message"] }));
    } catch (err) {
      console.error("Application message generation failed:", err);
      showToast(t("leadDetail.failedUpdate"), "error");
    }
    setGenerating(null);
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      showToast(t("common.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("common.error"), "error");
    }
  };

  const handleSaveDocument = async (doc: Document) => {
    if (!lead) return;
    const ext = doc.type === "cover_letter" || doc.type === "application_message" ? "txt" : "md";

    const filePath = await save({
      defaultPath: `${lead.client}-${doc.type}.${ext}`,
      filters: [{ name: "Text", extensions: [ext] }],
    });
    if (filePath) {
      await writeTextFile(filePath, doc.content);
      showToast(t("leadDetail.downloadDoc"), "success");
    }
  };

  const deleteLead = async () => {
    if (!id) return;
    try {
      await invoke("delete_lead", { id });
      showToast(t("leadDetail.leadDeleted"));
      navigate("/leads");
    } catch {
      showToast(t("leadDetail.failedDelete"), "error");
    }
  };

  const resetActivityForm = () => {
    setActivityForm({
      type: "note",
      title: "",
      description: "",
      occurredAt: "",
      duration: null,
    });
    setEditingActivity(null);
    setShowActivityForm(false);
  };

  const openAddActivity = () => {
    resetActivityForm();
    setShowActivityForm(true);
  };

  const openEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setActivityForm({
      type: activity.type,
      title: activity.title,
      description: activity.description || "",
      occurredAt: activity.occurredAt ? activity.occurredAt.slice(0, 16) : "",
      duration: activity.duration,
    });
    setShowActivityForm(true);
  };

  const handleSaveActivity = async () => {
    if (!id) return;
    if (!activityForm.title.trim()) {
      showToast(t("newLead.titleRequired"), "error");
      return;
    }

    setSavingActivity(true);

    const payload = {
      type: activityForm.type,
      title: activityForm.title,
      description: activityForm.description || null,
      occurredAt: activityForm.occurredAt || null,
      duration: activityForm.duration,
    };

    try {
      if (editingActivity) {
        // Update existing activity
        const updated = await invoke<Activity>("update_activity", {
          id: editingActivity.id,
          data: payload,
        });
        setLead({
          ...lead!,
          activities: (lead!.activities ?? []).map((a) =>
            a.id === editingActivity.id ? updated : a
          ).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
        });
        showToast(t("leadDetail.leadUpdated"));
        resetActivityForm();
      } else {
        // Create new activity
        const newActivity = await invoke<Activity>("create_activity", {
          leadId: id,
          data: payload,
        });
        setLead({
          ...lead!,
          activities: [newActivity, ...(lead!.activities ?? [])],
        });
        showToast(t("leads.activityAdded"));
        resetActivityForm();
      }
    } catch {
      showToast(t("leads.failedAddActivity"), "error");
    }

    setSavingActivity(false);
  };

  const handleDeleteActivity = async (activityId: string) => {
    setDeletingActivityId(activityId);

    try {
      await invoke("delete_activity", { id: activityId });
      setLead({
        ...lead!,
        activities: (lead!.activities ?? []).filter((a) => a.id !== activityId),
      });
      showToast(t("leadDetail.activityDeleted"));
    } catch {
      showToast(t("leadDetail.failedDeleteActivity"), "error");
    }

    setDeletingActivityId(null);
  };

  const addToArray = (
    field: "requiredTechnologies" | "requiredDomains",
    value: string,
    setter: (v: string) => void
  ) => {
    if (value.trim() && !form[field].includes(value.trim())) {
      setForm({ ...form, [field]: [...form[field], value.trim()] });
      setter("");
    }
  };

  const removeFromArray = (field: "requiredTechnologies" | "requiredDomains", value: string) => {
    setForm({ ...form, [field]: form[field].filter((v) => v !== value) });
  };

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Lead not found</p>
      </div>
    );
  }

  const requiredTechs = lead.requiredTechnologies
    ? JSON.parse(lead.requiredTechnologies)
    : [];
  const requiredDomains = lead.requiredDomains
    ? JSON.parse(lead.requiredDomains)
    : [];

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <Breadcrumbs items={[
            { label: t("leads.title"), to: "/leads" },
            { label: lead.client },
            { label: lead.title },
          ]} />
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-1">{lead.title}</h1>
              <p className="text-gray-600 dark:text-gray-400">{lead.client}</p>
            </div>
            <div className="text-right">
              {lead.matchScore !== null && (
                <div
                  className={`text-2xl font-bold ${
                    lead.matchScore >= 70
                      ? "text-green-600"
                      : lead.matchScore >= 40
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {t("leads.match", { score: lead.matchScore })}
                </div>
              )}
              {lead.autoFiltered && (
                <p className="text-sm text-red-500">{t("leadDetail.autoFiltered")}</p>
              )}
            </div>
          </div>
        </header>

        {/* Stage Pipeline */}
        <div className="mb-8">
          <div className="flex gap-2">
            {stages.map((stage) => (
              <button
                key={stage}
                onClick={() => updateStage(stage)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  lead.stage === stage
                    ? stageColors[stage]
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {t(`stages.${stage}`)}
              </button>
            ))}
          </div>
        </div>

        {editing ? (
          /* Edit Form */
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold mb-6">{t("common.edit")}</h2>
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t("leadDetail.title")}>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label={t("leadDetail.client")}>
                  <input
                    type="text"
                    value={form.client}
                    onChange={(e) => setForm({ ...form, client: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              <Field label={t("leadDetail.description")}>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input min-h-[100px]"
                />
              </Field>

              {/* Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t("leadDetail.source")}>
                  <LeadSourceSelect
                    value={form.source}
                    onChange={(v) => setForm({ ...form, source: v })}
                    className="input"
                  />
                </Field>
                <Field label={t("leadDetail.sourceUrl")}>
                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              {/* Location & Rate */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label={t("leadDetail.location")}>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label={t("leadDetail.remotePolicy")}>
                  <select
                    value={form.remotePolicy}
                    onChange={(e) => setForm({ ...form, remotePolicy: e.target.value })}
                    className="input"
                  >
                    <option value="remote">{t("leadDetail.remote")}</option>
                    <option value="hybrid">{t("leadDetail.hybrid")}</option>
                    <option value="onsite">{t("leadDetail.onsite")}</option>
                  </select>
                </Field>
                <Field label={t("leadDetail.offeredRate")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form.offeredRate ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, offeredRate: e.target.value ? parseInt(e.target.value) : null })
                      }
                      className="input w-28"
                      min={0}
                    />
                    <span className="text-gray-500">{t("common.perDay")}</span>
                  </div>
                </Field>
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t("leadDetail.estimatedStart")}>
                  <input
                    type="date"
                    value={form.estimatedStartDate}
                    onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label={t("leadDetail.estimatedDuration")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form.estimatedDuration ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, estimatedDuration: e.target.value ? parseInt(e.target.value) : null })
                      }
                      className="input w-20"
                      min={1}
                    />
                    <span className="text-gray-500">{t("common.months")}</span>
                  </div>
                </Field>
              </div>

              {/* Technologies */}
              <Field label={t("leadDetail.technologies")}>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToArray("requiredTechnologies", techInput, setTechInput);
                      }
                    }}
                    className="input flex-1"
                    placeholder={t("leadDetail.addTechPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => addToArray("requiredTechnologies", techInput, setTechInput)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    {t("common.add")}
                  </button>
                </div>
                <TagList items={form.requiredTechnologies} onRemove={(v) => removeFromArray("requiredTechnologies", v)} />
              </Field>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t("leadDetail.contactName")}>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label={t("leadDetail.contactInfo")}>
                  <input
                    type="text"
                    value={form.contactInfo}
                    onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              {/* Content Language */}
              <Field label={t("leadDetail.contentLanguage")}>
                <select
                  value={form.contentLanguage}
                  onChange={(e) => setForm({ ...form, contentLanguage: e.target.value })}
                  className="input w-48"
                >
                  <option value="">{t("leadDetail.profileDefault")}</option>
                  <option value="FR">Français</option>
                  <option value="EN">English</option>
                </select>
              </Field>

              {/* Notes */}
              <Field label={t("leadDetail.notes")}>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input min-h-[80px]"
                />
              </Field>

              {/* Actions */}
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
          /* View Mode */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lead Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Info */}
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold">{t("leadDetail.details")}</h2>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {t("common.edit")}
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {lead.offeredRate && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.offeredRate")}</dt>
                      <dd className="font-medium">{lead.offeredRate}€/day</dd>
                    </div>
                  )}
                  {lead.location && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.location")}</dt>
                      <dd className="font-medium">{lead.location}</dd>
                    </div>
                  )}
                  {lead.remotePolicy && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.remotePolicy")}</dt>
                      <dd className="font-medium capitalize">{lead.remotePolicy}</dd>
                    </div>
                  )}
                  {lead.estimatedDuration && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.estimatedDuration")}</dt>
                      <dd className="font-medium">{lead.estimatedDuration} {t("common.months")}</dd>
                    </div>
                  )}
                  {lead.estimatedStartDate && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.estimatedStart")}</dt>
                      <dd className="font-medium">
                        {new Date(lead.estimatedStartDate).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-500">{t("leadDetail.source")}</dt>
                    <dd className="font-medium capitalize">{lead.source}</dd>
                    {lead.sourceUrl && (
                      <dd className="flex items-center gap-1.5 mt-1">
                        <a
                          href={lead.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 truncate max-w-[200px]"
                          title={lead.sourceUrl}
                        >
                          {lead.sourceUrl.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/")}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(lead.sourceUrl!);
                            showToast(t("common.copied"), "success");
                          }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                          title={t("common.copyToClipboard")}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </dd>
                    )}
                  </div>
                  {lead.contentLanguage && (
                    <div>
                      <dt className="text-gray-500">{t("leadDetail.contentLanguage")}</dt>
                      <dd className="font-medium">{lead.contentLanguage === "FR" ? "Français" : "English"}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Technologies */}
              {requiredTechs.length > 0 && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">{t("leadDetail.technologies")}</h2>
                  <div className="flex flex-wrap gap-2">
                    {requiredTechs.map((tech: string) => (
                      <span
                        key={tech}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Description */}
              {lead.description && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">{t("leadDetail.description")}</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {lead.description}
                  </p>
                </section>
              )}

              {/* Notes */}
              {lead.notes && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">{t("leadDetail.notes")}</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {lead.notes}
                  </p>
                </section>
              )}

              {/* Activities */}
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold">{t("leadDetail.activities")}</h2>
                  <button
                    onClick={openAddActivity}
                    className="text-sm px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    + {t("common.add")}
                  </button>
                </div>

                {isAiEnabled && id && (lead.activities?.length ?? 0) > 0 && (
                  <ActivityInsightsCard
                    leadId={id}
                    documents={lead.documents}
                    activities={lead.activities ?? []}
                  />
                )}

                {/* Activity Form */}
                {showActivityForm && (
                  <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium mb-3">
                      {editingActivity ? t("leadDetail.editActivity") : t("leadDetail.addActivity")}
                    </h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {t("leadDetail.type")}
                          </label>
                          <select
                            value={activityForm.type}
                            onChange={(e) =>
                              setActivityForm({ ...activityForm, type: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                          >
                            {Object.entries(activityIcons).map(([value, icon]) => (
                              <option key={value} value={value}>
                                {icon} {t(`activityTypes.${value}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {t("leadDetail.occurredAt")}
                          </label>
                          <input
                            type="datetime-local"
                            value={activityForm.occurredAt}
                            onChange={(e) =>
                              setActivityForm({ ...activityForm, occurredAt: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {t("leadDetail.title")}
                        </label>
                        <input
                          type="text"
                          value={activityForm.title}
                          onChange={(e) =>
                            setActivityForm({ ...activityForm, title: e.target.value })
                          }
                          placeholder={t("leadDetail.briefDescription")}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {t("leadDetail.description")}
                        </label>
                        <textarea
                          value={activityForm.description}
                          onChange={(e) =>
                            setActivityForm({ ...activityForm, description: e.target.value })
                          }
                          placeholder={t("leadDetail.detailedNotes")}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                        />
                      </div>
                      {(activityForm.type === "call" || activityForm.type === "meeting" || activityForm.type === "interview") && (
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {t("leadDetail.duration")}
                          </label>
                          <input
                            type="number"
                            value={activityForm.duration ?? ""}
                            onChange={(e) =>
                              setActivityForm({
                                ...activityForm,
                                duration: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="e.g., 30"
                            min={1}
                            className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                          />
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSaveActivity}
                          disabled={savingActivity}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingActivity ? t("common.saving") : editingActivity ? t("leadDetail.saveActivity") : t("common.add")}
                        </button>
                        <button
                          onClick={resetActivityForm}
                          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Activity List */}
                {(lead.activities?.length ?? 0) === 0 && !showActivityForm ? (
                  <p className="text-gray-500 text-sm">{t("leadDetail.noActivities")}</p>
                ) : (
                  <div className="space-y-3">
                    {(lead.activities ?? []).map((activity) => (
                      <div
                        key={activity.id}
                        className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex gap-2">
                            <span className="text-lg">
                              {activityIcons[activity.type] || "\ud83d\udccb"}
                            </span>
                            <div>
                              <p className="font-medium">{activity.title}</p>
                              {activity.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {activity.description}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(activity.occurredAt).toLocaleString()}
                                {activity.duration && ` (${activity.duration} min)`}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditActivity(activity)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              disabled={deletingActivityId === activity.id}
                              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                            >
                              {deletingActivityId === activity.id ? "..." : "\u00d7"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Generated Document */}
              {activeDoc && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-semibold">
                      {docLabels[activeDoc.type] || activeDoc.type}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveDocument(activeDoc)}
                        className="text-sm text-green-600 hover:text-green-700"
                      >
                        {t("leadDetail.downloadDoc")}
                      </button>
                      <button
                        onClick={() => copyToClipboard(activeDoc.content)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {copied ? t("common.copied") : t("common.copyToClipboard")}
                      </button>
                    </div>
                  </div>
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                      {activeDoc.content}
                    </pre>
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Generate Documents */}
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold mb-4">{t("leadDetail.generateDoc")}</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => generateDocument("cover_letter")}
                    disabled={generating !== null}
                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {generating === "cover_letter"
                      ? t("leadDetail.generating")
                      : isAiEnabled
                      ? `${t("leadDetail.coverLetter")} (AI)`
                      : t("leadDetail.coverLetter")}
                  </button>
                  <button
                    onClick={() => generateDocument("key_questions")}
                    disabled={generating !== null}
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {generating === "key_questions"
                      ? t("leadDetail.generating")
                      : "Key Questions"}
                  </button>
                  {isAiEnabled && (
                    <button
                      onClick={() => generateDocument("interview_prep")}
                      disabled={generating !== null}
                      className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {generating === "interview_prep"
                        ? t("leadDetail.generating")
                        : t("leadDetail.interviewPrep")}
                    </button>
                  )}

                  {/* Application Message */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                    <button
                      onClick={() => setShowMsgOptions(!showMsgOptions)}
                      className="w-full py-2 px-4 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      disabled={generating !== null}
                    >
                      {generating === "application_message"
                        ? t("leadDetail.generating")
                        : isAiEnabled
                        ? `${t("leadDetail.applicationMessage")} (AI)`
                        : t("leadDetail.applicationMessage")}
                      <span className="text-xs">{showMsgOptions ? "\u25B2" : "\u25BC"}</span>
                    </button>
                    {showMsgOptions && (
                      <div className="mt-3 space-y-3 text-sm">
                        <div>
                          <label className="block text-gray-600 dark:text-gray-400 mb-1">{t("leadDetail.lengthPreset")}</label>
                          <select
                            value={msgLengthPreset}
                            onChange={(e) => setMsgLengthPreset(e.target.value as "short" | "standard" | "long")}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="short">{t("leadDetail.short")} (~150 chars)</option>
                            <option value="standard">{t("leadDetail.standard")} (~500 chars)</option>
                            <option value="long">{t("leadDetail.long")} (~1000 chars)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-600 dark:text-gray-400 mb-1">{t("leadDetail.lengthPreset")} (optional)</label>
                          <input
                            type="number"
                            value={msgCharLimit}
                            onChange={(e) => setMsgCharLimit(e.target.value)}
                            placeholder={t("leadDetail.overridePreset")}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 dark:text-gray-400 mb-1">{t("leadDetail.tone")}</label>
                          <select
                            value={msgTone}
                            onChange={(e) => setMsgTone(e.target.value as "professional" | "friendly" | "direct")}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm"
                          >
                            <option value="professional">{t("leadDetail.professional")}</option>
                            <option value="friendly">{t("leadDetail.friendly")}</option>
                            <option value="direct">{t("leadDetail.direct")}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-600 dark:text-gray-400 mb-1">{t("leadDetail.customFocus")}</label>
                          <input
                            type="text"
                            value={msgCustomFocus}
                            onChange={(e) => setMsgCustomFocus(e.target.value)}
                            placeholder="e.g. Highlight React experience"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-sm"
                          />
                        </div>
                        <button
                          onClick={generateApplicationMessage}
                          disabled={generating !== null}
                          className="w-full py-2 px-4 bg-orange-700 text-white rounded-md hover:bg-orange-800 disabled:opacity-50 transition-colors text-sm font-medium"
                        >
                          {generating === "application_message" ? t("leadDetail.generating") : t("leadDetail.generate")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* AI Analysis */}
              {id && (
                <LeadAnalysisCard leadId={id} documents={lead.documents} />
              )}

              {/* Contact */}
              {(lead.contactName || lead.contactInfo) && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">{t("leadDetail.contact")}</h2>
                  {lead.contactName && (
                    <p className="font-medium">{lead.contactName}</p>
                  )}
                  {lead.contactInfo && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {lead.contactInfo}
                    </p>
                  )}
                </section>
              )}

              {/* Previous Documents */}
              {lead.documents.length > 0 && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">{t("leadDetail.documents")}</h2>
                  <ul className="space-y-2">
                    {lead.documents.map((doc) => (
                      <li key={doc.id}>
                        <button
                          onClick={() => setActiveDoc(doc)}
                          className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            activeDoc?.id === doc.id
                              ? "bg-gray-100 dark:bg-gray-700"
                              : ""
                          }`}
                        >
                          {docLabels[doc.type] || doc.type}
                          <span className="text-gray-500 ml-2">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Actions */}
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold mb-4">{t("common.edit")}</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t("common.edit")}
                  </button>
                  {lead.sourceUrl && (
                    <div className="flex gap-2">
                      <a
                        href={lead.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {t("leadDetail.openListing")}
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lead.sourceUrl!);
                          showToast(t("common.copied"), "success");
                        }}
                        className="py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        title={t("common.copyToClipboard")}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await invoke("resync_lead_from_source", { leadId: id });
                        loadData();
                        showToast(t("leadDetail.resyncSuccess"), "success");
                      } catch (e) {
                        showToast(String(e), "error");
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t("leadDetail.refreshFromSource")}
                  </button>
                  {confirmDelete ? (
                    <div className="flex gap-2">
                      <button
                        onClick={deleteLead}
                        className="flex-1 py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                      >
                        {t("common.confirm")}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full py-2 px-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    >
                      {t("leadDetail.deleteLead")}
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {hint && <span className="font-normal text-gray-500 ml-2">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function TagList({ items, onRemove }: { items: string[]; onRemove: (item: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="hover:text-red-600 dark:hover:text-red-400"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
