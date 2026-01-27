"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

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
  const router = useRouter();
  const { showToast } = useToast();
  const [lead, setLead] = useState<LeadForm>(defaultLead);
  const [saving, setSaving] = useState(false);
  const [techInput, setTechInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lead.title.trim()) {
      showToast("Job title is required", "error");
      return;
    }
    if (!lead.client.trim()) {
      showToast("Client is required", "error");
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
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const newLead = await res.json();
        showToast("Lead added successfully", "success");
        router.push(`/leads/${newLead.id}`);
      } else {
        showToast("Failed to create lead. Make sure you have a profile set up first.", "error");
        setSaving(false);
      }
    } catch {
      showToast("An error occurred while creating lead", "error");
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
          <h1 className="text-2xl font-bold mb-2">Add New Lead</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Enter the opportunity details. We&apos;ll score it against your profile.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <Section title="Opportunity">
            <Field label="Job Title" required>
              <input
                type="text"
                value={lead.title}
                onChange={(e) => setLead({ ...lead, title: e.target.value })}
                className="input"
                placeholder="e.g., Senior React Developer"
                required
              />
            </Field>
            <Field label="Client / Company" required>
              <input
                type="text"
                value={lead.client}
                onChange={(e) => setLead({ ...lead, client: e.target.value })}
                className="input"
                placeholder="e.g., Acme Corp"
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                value={lead.description}
                onChange={(e) => setLead({ ...lead, description: e.target.value })}
                className="input min-h-[100px]"
                placeholder="Paste the job description or key details..."
              />
            </Field>
          </Section>

          {/* Source */}
          <Section title="Source">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Source">
                <select
                  value={lead.source}
                  onChange={(e) => setLead({ ...lead, source: e.target.value })}
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
                  value={lead.sourceUrl}
                  onChange={(e) => setLead({ ...lead, sourceUrl: e.target.value })}
                  className="input"
                  placeholder="Link to posting"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Name">
                <input
                  type="text"
                  value={lead.contactName}
                  onChange={(e) => setLead({ ...lead, contactName: e.target.value })}
                  className="input"
                  placeholder="Recruiter or hiring manager"
                />
              </Field>
              <Field label="Contact Info">
                <input
                  type="text"
                  value={lead.contactInfo}
                  onChange={(e) => setLead({ ...lead, contactInfo: e.target.value })}
                  className="input"
                  placeholder="Email or phone"
                />
              </Field>
            </div>
          </Section>

          {/* Location & Rate */}
          <Section title="Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Location">
                <input
                  type="text"
                  value={lead.location}
                  onChange={(e) => setLead({ ...lead, location: e.target.value })}
                  className="input"
                  placeholder="e.g., Paris, Remote"
                />
              </Field>
              <Field label="Remote Policy">
                <select
                  value={lead.remotePolicy}
                  onChange={(e) => setLead({ ...lead, remotePolicy: e.target.value })}
                  className="input"
                >
                  <option value="remote">Full Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Offered Rate">
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
                  <span className="text-gray-500">€/day</span>
                </div>
              </Field>
              <Field label="Estimated Duration">
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
                  <span className="text-gray-500">months</span>
                </div>
              </Field>
            </div>
            <Field label="Estimated Start Date">
              <input
                type="date"
                value={lead.estimatedStartDate}
                onChange={(e) => setLead({ ...lead, estimatedStartDate: e.target.value })}
                className="input w-48"
              />
            </Field>
          </Section>

          {/* Requirements */}
          <Section title="Requirements">
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
                  placeholder="e.g., React, TypeScript..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("requiredTechnologies", techInput, setTechInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList
                items={lead.requiredTechnologies}
                onRemove={(v) => removeFromArray("requiredTechnologies", v)}
              />
            </Field>
            <Field label="Domain">
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
                  placeholder="e.g., Fintech, Healthcare..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("requiredDomains", domainInput, setDomainInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList
                items={lead.requiredDomains}
                onRemove={(v) => removeFromArray("requiredDomains", v)}
              />
            </Field>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <Field label="Additional Notes">
              <textarea
                value={lead.notes}
                onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                className="input min-h-[80px]"
                placeholder="Any other relevant information..."
              />
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Add Lead"}
            </button>
            <button type="button" onClick={() => router.push("/leads")} className="btn btn-secondary">
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
