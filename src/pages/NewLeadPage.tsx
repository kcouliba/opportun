import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import LeadSourceSelect from "@/components/LeadSourceSelect";

interface LeadForm {
  client: string;
  title: string;
  description: string;
  source: string;
  sourceUrl: string;
  location: string;
  remotePolicy: string;
  offeredRate: number | null;
  estimatedStartDate: string;
  estimatedDuration: number | null;
  requiredTechnologies: string[];
  requiredDomains: string[];
  contactName: string;
  contactInfo: string;
  notes: string;
}

const defaultLead: LeadForm = {
  client: "",
  title: "",
  description: "",
  source: "recruiter",
  sourceUrl: "",
  location: "",
  remotePolicy: "remote",
  offeredRate: null,
  estimatedStartDate: "",
  estimatedDuration: null,
  requiredTechnologies: [],
  requiredDomains: [],
  contactName: "",
  contactInfo: "",
  notes: "",
};

export default function NewLeadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [lead, setLead] = useState<LeadForm>(defaultLead);
  const [saving, setSaving] = useState(false);
  const [techInput, setTechInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lead.title.trim()) {
      showToast(t("newLead.titleRequired"), "error");
      return;
    }
    if (!lead.client.trim()) {
      showToast(t("newLead.clientRequired"), "error");
      return;
    }

    setSaving(true);

    const payload = {
      ...lead,
      requiredTechnologies: JSON.stringify(lead.requiredTechnologies),
      requiredDomains: JSON.stringify(lead.requiredDomains),
      estimatedStartDate: lead.estimatedStartDate || null,
    };

    try {
      const newLead = await invoke<{ id: string }>("create_lead", { data: payload });
      showToast(t("newLead.leadAdded"), "success");
      navigate(`/leads/${newLead.id}`);
    } catch {
      showToast(t("newLead.failedCreate"), "error");
      setSaving(false);
    }
  };

  const addToArray = (
    field: "requiredTechnologies" | "requiredDomains",
    value: string,
    setter: (v: string) => void
  ) => {
    if (value.trim() && !lead[field].includes(value.trim())) {
      setLead({ ...lead, [field]: [...lead[field], value.trim()] });
      setter("");
    }
  };

  const removeFromArray = (field: "requiredTechnologies" | "requiredDomains", value: string) => {
    setLead({ ...lead, [field]: lead[field].filter((v) => v !== value) });
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{t("newLead.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t("newLead.subtitle")}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Section title={t("newLead.opportunity")}>
            <Field label={t("newLead.jobTitle")} required>
              <input
                type="text"
                value={lead.title}
                onChange={(e) => setLead({ ...lead, title: e.target.value })}
                className="input"
                placeholder={t("newLead.jobTitlePlaceholder")}
                required
              />
            </Field>
            <Field label={t("newLead.client")} required>
              <input
                type="text"
                value={lead.client}
                onChange={(e) => setLead({ ...lead, client: e.target.value })}
                className="input"
                placeholder={t("newLead.clientPlaceholder")}
                required
              />
            </Field>
            <Field label={t("newLead.description")}>
              <textarea
                value={lead.description}
                onChange={(e) => setLead({ ...lead, description: e.target.value })}
                className="input min-h-[100px]"
                placeholder={t("newLead.descriptionPlaceholder")}
              />
            </Field>
          </Section>

          {/* Source */}
          <Section title={t("newLead.source")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("newLead.source")}>
                <LeadSourceSelect
                  value={lead.source}
                  onChange={(v) => setLead({ ...lead, source: v })}
                  className="input"
                />
              </Field>
              <Field label={t("newLead.sourceUrl")}>
                <input
                  type="url"
                  value={lead.sourceUrl}
                  onChange={(e) => setLead({ ...lead, sourceUrl: e.target.value })}
                  className="input"
                  placeholder={t("newLead.sourceUrlPlaceholder")}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("newLead.contactName")}>
                <input
                  type="text"
                  value={lead.contactName}
                  onChange={(e) => setLead({ ...lead, contactName: e.target.value })}
                  className="input"
                  placeholder={t("newLead.contactNamePlaceholder")}
                />
              </Field>
              <Field label={t("newLead.contactInfo")}>
                <input
                  type="text"
                  value={lead.contactInfo}
                  onChange={(e) => setLead({ ...lead, contactInfo: e.target.value })}
                  className="input"
                  placeholder={t("newLead.contactInfoPlaceholder")}
                />
              </Field>
            </div>
          </Section>

          {/* Location & Rate */}
          <Section title={t("newLead.details")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("newLead.location")}>
                <input
                  type="text"
                  value={lead.location}
                  onChange={(e) => setLead({ ...lead, location: e.target.value })}
                  className="input"
                  placeholder={t("newLead.locationPlaceholder")}
                />
              </Field>
              <Field label={t("newLead.remotePolicy")}>
                <select
                  value={lead.remotePolicy}
                  onChange={(e) => setLead({ ...lead, remotePolicy: e.target.value })}
                  className="input"
                >
                  <option value="remote">{t("newLead.remote")}</option>
                  <option value="hybrid">{t("newLead.hybrid")}</option>
                  <option value="onsite">{t("newLead.onsite")}</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("newLead.offeredRate")}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={lead.offeredRate ?? ""}
                    onChange={(e) =>
                      setLead({ ...lead, offeredRate: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="input w-28"
                    min={0}
                  />
                  <span className="text-gray-500">{t("common.perDay")}</span>
                </div>
              </Field>
              <Field label={t("newLead.estimatedDuration")}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={lead.estimatedDuration ?? ""}
                    onChange={(e) =>
                      setLead({ ...lead, estimatedDuration: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="input w-20"
                    min={1}
                  />
                  <span className="text-gray-500">{t("common.months")}</span>
                </div>
              </Field>
            </div>
            <Field label={t("newLead.estimatedStart")}>
              <input
                type="date"
                value={lead.estimatedStartDate}
                onChange={(e) => setLead({ ...lead, estimatedStartDate: e.target.value })}
                className="input w-48"
              />
            </Field>
          </Section>

          {/* Requirements */}
          <Section title={t("newLead.requirements")}>
            <Field label={t("newLead.technologies")}>
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
                  placeholder={t("newLead.technologiesPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("requiredTechnologies", techInput, setTechInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList
                items={lead.requiredTechnologies}
                onRemove={(v) => removeFromArray("requiredTechnologies", v)}
              />
            </Field>
            <Field label={t("newLead.domain")}>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToArray("requiredDomains", domainInput, setDomainInput);
                    }
                  }}
                  className="input flex-1"
                  placeholder={t("newLead.domainPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("requiredDomains", domainInput, setDomainInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList
                items={lead.requiredDomains}
                onRemove={(v) => removeFromArray("requiredDomains", v)}
              />
            </Field>
          </Section>

          {/* Notes */}
          <Section title={t("newLead.notes")}>
            <Field label={t("newLead.additionalNotes")}>
              <textarea
                value={lead.notes}
                onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                className="input min-h-[80px]"
                placeholder={t("newLead.notesPlaceholder")}
              />
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? t("common.saving") : t("newLead.addLead")}
            </button>
            <button type="button" onClick={() => navigate("/leads")} className="btn btn-secondary">
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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
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
