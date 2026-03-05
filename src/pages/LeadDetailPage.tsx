import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useToast } from "@/components/Toast";
import { PageLoader } from "@/components/LoadingSpinner";
import { useAiSettings } from "@/hooks/useAiSettings";
import LeadAnalysisCard from "@/components/LeadAnalysisCard";

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

const stageLabels: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-gray-100 text-gray-800" },
  qualified: { label: "Qualified", color: "bg-blue-100 text-blue-800" },
  negotiating: { label: "Negotiating", color: "bg-yellow-100 text-yellow-800" },
  won: { label: "Won", color: "bg-green-100 text-green-800" },
  lost: { label: "Lost", color: "bg-red-100 text-red-800" },
};

const activityTypes: Record<string, { label: string; icon: string }> = {
  call: { label: "Call", icon: "\ud83d\udcde" },
  email: { label: "Email", icon: "\ud83d\udce7" },
  meeting: { label: "Meeting", icon: "\ud83e\udd1d" },
  interview: { label: "Interview", icon: "\ud83d\udcbc" },
  note: { label: "Note", icon: "\ud83d\udcdd" },
  other: { label: "Other", icon: "\ud83d\udccb" },
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAiEnabled } = useAiSettings();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  useEffect(() => {
    if (!id) return;
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
      .catch(() => setLoading(false));
  }, [id]);

  const updateStage = async (newStage: string) => {
    if (!lead || !id) return;

    try {
      const updated = await invoke<Lead>("update_lead", {
        id,
        data: { ...lead, stage: newStage },
      });
      setLead({ ...lead, stage: newStage, matchScore: updated.matchScore });
      showToast(`Moved to ${stageLabels[newStage].label}`);
    } catch {
      showToast("Failed to update stage", "error");
    }
  };

  const handleSave = async () => {
    if (!id) return;

    // Validation
    if (!form.title.trim()) {
      showToast("Job title is required", "error");
      return;
    }
    if (!form.client.trim()) {
      showToast("Client is required", "error");
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
      showToast("Lead updated successfully");
    } catch {
      showToast("Failed to save changes", "error");
    }
    setSaving(false);
  };

  const docLabels: Record<string, string> = {
    cover_letter: "Cover Letter",
    key_questions: "Key Questions",
    interview_prep: "Interview Prep",
    lead_analysis: "Lead Analysis",
  };

  const generateDocument = async (type: string) => {
    if (!id) return;
    setGenerating(type);

    try {
      let doc: Document;

      if (type === "cover_letter" && isAiEnabled) {
        try {
          doc = await invoke<Document>("generate_cover_letter_ai", { leadId: id });
        } catch (aiErr) {
          console.warn("AI cover letter failed, falling back to template:", aiErr);
          // Fallback to template
          doc = await invoke<Document>("generate_document", { leadId: id, docType: type });
        }
      } else if (type === "interview_prep") {
        doc = await invoke<Document>("generate_interview_prep_ai", { leadId: id });
      } else {
        doc = await invoke<Document>("generate_document", { leadId: id, docType: type });
      }

      if (lead) {
        setLead({ ...lead, documents: [...lead.documents, doc] });
        setActiveDoc(doc);
      }
      showToast(`${docLabels[type] || type} generated`);
    } catch (err) {
      console.error("Document generation failed:", err);
      showToast("Failed to generate document", "error");
    }
    setGenerating(null);
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      showToast("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  const handleSaveDocument = async (doc: Document) => {
    if (!lead) return;
    const ext = doc.type === "cover_letter" ? "txt" : "md";

    const filePath = await save({
      defaultPath: `${lead.client}-${doc.type}.${ext}`,
      filters: [{ name: "Text", extensions: [ext] }],
    });
    if (filePath) {
      await writeTextFile(filePath, doc.content);
      showToast("Document saved to file", "success");
    }
  };

  const deleteLead = async () => {
    if (!id) return;
    try {
      await invoke("delete_lead", { id });
      showToast("Lead deleted");
      navigate("/leads");
    } catch {
      showToast("Failed to delete lead", "error");
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
      showToast("Title is required", "error");
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
        showToast("Activity updated");
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
        showToast("Activity added");
        resetActivityForm();
      }
    } catch {
      showToast("Failed to save activity", "error");
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
      showToast("Activity deleted");
    } catch {
      showToast("Failed to delete activity", "error");
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
          <Link
            to="/leads"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
          >
            ← Back to Pipeline
          </Link>
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
                  {lead.matchScore}% match
                </div>
              )}
              {lead.autoFiltered && (
                <p className="text-sm text-red-500">Auto-filtered</p>
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
                    ? stageLabels[stage].color
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {stageLabels[stage].label}
              </button>
            ))}
          </div>
        </div>

        {editing ? (
          /* Edit Form */
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold mb-6">Edit Lead</h2>
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Job Title">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Client">
                  <input
                    type="text"
                    value={form.client}
                    onChange={(e) => setForm({ ...form, client: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input min-h-[100px]"
                />
              </Field>

              {/* Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Source">
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="input"
                  >
                    <option value="recruiter">Recruiter</option>
                    <option value="freework">Freework.com</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="comet">Comet</option>
                    <option value="referral">Referral</option>
                    <option value="direct">Direct</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Source URL">
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
                <Field label="Location">
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Remote Policy">
                  <select
                    value={form.remotePolicy}
                    onChange={(e) => setForm({ ...form, remotePolicy: e.target.value })}
                    className="input"
                  >
                    <option value="remote">Full Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">On-site</option>
                  </select>
                </Field>
                <Field label="Offered Rate">
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
                    <span className="text-gray-500">€/day</span>
                  </div>
                </Field>
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Estimated Start">
                  <input
                    type="date"
                    value={form.estimatedStartDate}
                    onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Duration">
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
                    <span className="text-gray-500">months</span>
                  </div>
                </Field>
              </div>

              {/* Technologies */}
              <Field label="Required Technologies">
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
                    placeholder="Add technology..."
                  />
                  <button
                    type="button"
                    onClick={() => addToArray("requiredTechnologies", techInput, setTechInput)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Add
                  </button>
                </div>
                <TagList items={form.requiredTechnologies} onRemove={(v) => removeFromArray("requiredTechnologies", v)} />
              </Field>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Contact Name">
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Contact Info">
                  <input
                    type="text"
                    value={form.contactInfo}
                    onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              {/* Content Language */}
              <Field label="Content Language" hint="Override profile default for AI content">
                <select
                  value={form.contentLanguage}
                  onChange={(e) => setForm({ ...form, contentLanguage: e.target.value })}
                  className="input w-48"
                >
                  <option value="">Profile Default</option>
                  <option value="FR">Français</option>
                  <option value="EN">English</option>
                </select>
              </Field>

              {/* Notes */}
              <Field label="Notes">
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
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
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
                  <h2 className="font-semibold">Details</h2>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {lead.offeredRate && (
                    <div>
                      <dt className="text-gray-500">Rate</dt>
                      <dd className="font-medium">{lead.offeredRate}€/day</dd>
                    </div>
                  )}
                  {lead.location && (
                    <div>
                      <dt className="text-gray-500">Location</dt>
                      <dd className="font-medium">{lead.location}</dd>
                    </div>
                  )}
                  {lead.remotePolicy && (
                    <div>
                      <dt className="text-gray-500">Remote Policy</dt>
                      <dd className="font-medium capitalize">{lead.remotePolicy}</dd>
                    </div>
                  )}
                  {lead.estimatedDuration && (
                    <div>
                      <dt className="text-gray-500">Duration</dt>
                      <dd className="font-medium">{lead.estimatedDuration} months</dd>
                    </div>
                  )}
                  {lead.estimatedStartDate && (
                    <div>
                      <dt className="text-gray-500">Start Date</dt>
                      <dd className="font-medium">
                        {new Date(lead.estimatedStartDate).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-500">Source</dt>
                    <dd className="font-medium capitalize">{lead.source}</dd>
                  </div>
                  {lead.contentLanguage && (
                    <div>
                      <dt className="text-gray-500">Content Language</dt>
                      <dd className="font-medium">{lead.contentLanguage === "FR" ? "Français" : "English"}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Technologies */}
              {requiredTechs.length > 0 && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">Required Technologies</h2>
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
                  <h2 className="font-semibold mb-4">Description</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {lead.description}
                  </p>
                </section>
              )}

              {/* Notes */}
              {lead.notes && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">Notes</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {lead.notes}
                  </p>
                </section>
              )}

              {/* Activities */}
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold">Activities</h2>
                  <button
                    onClick={openAddActivity}
                    className="text-sm px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    + Add
                  </button>
                </div>

                {/* Activity Form */}
                {showActivityForm && (
                  <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium mb-3">
                      {editingActivity ? "Edit Activity" : "New Activity"}
                    </h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            Type
                          </label>
                          <select
                            value={activityForm.type}
                            onChange={(e) =>
                              setActivityForm({ ...activityForm, type: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                          >
                            {Object.entries(activityTypes).map(([value, { label, icon }]) => (
                              <option key={value} value={value}>
                                {icon} {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            Date & Time
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
                          Title
                        </label>
                        <input
                          type="text"
                          value={activityForm.title}
                          onChange={(e) =>
                            setActivityForm({ ...activityForm, title: e.target.value })
                          }
                          placeholder="Brief description..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Description (optional)
                        </label>
                        <textarea
                          value={activityForm.description}
                          onChange={(e) =>
                            setActivityForm({ ...activityForm, description: e.target.value })
                          }
                          placeholder="Detailed notes..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                        />
                      </div>
                      {(activityForm.type === "call" || activityForm.type === "meeting" || activityForm.type === "interview") && (
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                            Duration (minutes)
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
                          {savingActivity ? "Saving..." : editingActivity ? "Update" : "Add"}
                        </button>
                        <button
                          onClick={resetActivityForm}
                          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Activity List */}
                {(lead.activities?.length ?? 0) === 0 && !showActivityForm ? (
                  <p className="text-gray-500 text-sm">No activities recorded yet.</p>
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
                              {activityTypes[activity.type]?.icon || "\ud83d\udccb"}
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
                              Edit
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
                        Save to File
                      </button>
                      <button
                        onClick={() => copyToClipboard(activeDoc.content)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {copied ? "Copied!" : "Copy to clipboard"}
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
                <h2 className="font-semibold mb-4">Generate Documents</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => generateDocument("cover_letter")}
                    disabled={generating !== null}
                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {generating === "cover_letter"
                      ? "Generating..."
                      : isAiEnabled
                      ? "Cover Letter (AI)"
                      : "Cover Letter"}
                  </button>
                  <button
                    onClick={() => generateDocument("key_questions")}
                    disabled={generating !== null}
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {generating === "key_questions"
                      ? "Generating..."
                      : "Key Questions"}
                  </button>
                  {isAiEnabled && (
                    <button
                      onClick={() => generateDocument("interview_prep")}
                      disabled={generating !== null}
                      className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {generating === "interview_prep"
                        ? "Generating..."
                        : "Interview Prep"}
                    </button>
                  )}
                </div>
              </section>

              {/* AI Analysis */}
              {id && (
                <LeadAnalysisCard leadId={id} documents={lead.documents} />
              )}

              {/* Contact */}
              {(lead.contactName || lead.contactInfo) && (
                <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold mb-4">Contact</h2>
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
                  <h2 className="font-semibold mb-4">Generated Documents</h2>
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
                <h2 className="font-semibold mb-4">Actions</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Edit Lead
                  </button>
                  {lead.sourceUrl && (
                    <a
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-2 px-4 text-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      View Original Posting
                    </a>
                  )}
                  {confirmDelete ? (
                    <div className="flex gap-2">
                      <button
                        onClick={deleteLead}
                        className="flex-1 py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full py-2 px-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    >
                      Delete Lead
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
