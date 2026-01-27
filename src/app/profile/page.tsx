"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { PageLoader } from "@/components/LoadingSpinner";

interface Profile {
  id?: string;
  name: string;
  title: string;
  yearsExperience: number | null;
  legalStructure: string;
  minimumTJM: number | null;
  targetTJM: number | null;
  preferredLocations: string[];
  maxCommuteDays: number | null;
  technologies: string[];
  domains: string[];
  blacklistedClients: string[];
  blacklistedDomains: string[];
}

const defaultProfile: Profile = {
  name: "",
  title: "",
  yearsExperience: null,
  legalStructure: "SASU",
  minimumTJM: null,
  targetTJM: null,
  preferredLocations: [],
  maxCommuteDays: null,
  technologies: [],
  domains: [],
  blacklistedClients: [],
  blacklistedDomains: [],
};

export default function ProfilePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [techInput, setTechInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setProfile({
            ...defaultProfile,
            ...data,
            preferredLocations: data.preferredLocations ? JSON.parse(data.preferredLocations) : [],
            technologies: data.technologies ? JSON.parse(data.technologies) : [],
            domains: data.domains ? JSON.parse(data.domains) : [],
            blacklistedClients: data.blacklistedClients ? JSON.parse(data.blacklistedClients) : [],
            blacklistedDomains: data.blacklistedDomains ? JSON.parse(data.blacklistedDomains) : [],
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile.name.trim()) {
      showToast("Name is required", "error");
      return;
    }

    setSaving(true);

    const payload = {
      ...profile,
      preferredLocations: JSON.stringify(profile.preferredLocations),
      technologies: JSON.stringify(profile.technologies),
      domains: JSON.stringify(profile.domains),
      blacklistedClients: JSON.stringify(profile.blacklistedClients),
      blacklistedDomains: JSON.stringify(profile.blacklistedDomains),
    };

    try {
      const res = await fetch("/api/profile", {
        method: profile.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("Profile saved successfully", "success");
        router.push("/");
      } else {
        showToast("Failed to save profile", "error");
        setSaving(false);
      }
    } catch {
      showToast("An error occurred while saving", "error");
      setSaving(false);
    }
  };

  const addToArray = (
    field: keyof Pick<Profile, "technologies" | "domains" | "preferredLocations">,
    value: string,
    setter: (v: string) => void
  ) => {
    if (value.trim() && !profile[field].includes(value.trim())) {
      setProfile({ ...profile, [field]: [...profile[field], value.trim()] });
      setter("");
    }
  };

  const removeFromArray = (
    field: keyof Pick<Profile, "technologies" | "domains" | "preferredLocations">,
    value: string
  ) => {
    setProfile({ ...profile, [field]: profile[field].filter((v) => v !== value) });
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Your Profile</h1>
          <p className="text-gray-600 dark:text-gray-400">
            This powers the smart filtering. Leads will be scored against your preferences.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Identity */}
          <Section title="Identity">
            <Field label="Name" required>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="input"
                required
              />
            </Field>
            <Field label="Title" hint="e.g., Senior Fullstack Developer">
              <input
                type="text"
                value={profile.title}
                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Years of Experience">
              <input
                type="number"
                value={profile.yearsExperience ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, yearsExperience: e.target.value ? parseInt(e.target.value) : null })
                }
                className="input w-24"
                min={0}
              />
            </Field>
          </Section>

          {/* Financial */}
          <Section title="Rate Expectations">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Minimum TJM" hint="Won't consider below">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={profile.minimumTJM ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, minimumTJM: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="input w-28"
                    min={0}
                  />
                  <span className="text-gray-500">€/day</span>
                </div>
              </Field>
              <Field label="Target TJM" hint="Ideal rate">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={profile.targetTJM ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, targetTJM: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="input w-28"
                    min={0}
                  />
                  <span className="text-gray-500">€/day</span>
                </div>
              </Field>
            </div>
            <Field label="Legal Structure">
              <select
                value={profile.legalStructure}
                onChange={(e) => setProfile({ ...profile, legalStructure: e.target.value })}
                className="input w-40"
              >
                <option value="SASU">SASU</option>
                <option value="EURL">EURL</option>
                <option value="EI">EI</option>
                <option value="Auto-entrepreneur">Auto-entrepreneur</option>
              </select>
            </Field>
          </Section>

          {/* Location */}
          <Section title="Location Preferences">
            <Field label="Preferred Locations">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToArray("preferredLocations", locationInput, setLocationInput);
                    }
                  }}
                  className="input flex-1"
                  placeholder="e.g., Remote, Paris, Lyon..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("preferredLocations", locationInput, setLocationInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList
                items={profile.preferredLocations}
                onRemove={(v) => removeFromArray("preferredLocations", v)}
              />
            </Field>
            <Field label="Max Commute Days" hint="Days/week willing to go on-site">
              <input
                type="number"
                value={profile.maxCommuteDays ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, maxCommuteDays: e.target.value ? parseInt(e.target.value) : null })
                }
                className="input w-20"
                min={0}
                max={5}
              />
            </Field>
          </Section>

          {/* Skills */}
          <Section title="Skills">
            <Field label="Technologies">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToArray("technologies", techInput, setTechInput);
                    }
                  }}
                  className="input flex-1"
                  placeholder="e.g., React, Node.js, PostgreSQL..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("technologies", techInput, setTechInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList items={profile.technologies} onRemove={(v) => removeFromArray("technologies", v)} />
            </Field>
            <Field label="Domains">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToArray("domains", domainInput, setDomainInput);
                    }
                  }}
                  className="input flex-1"
                  placeholder="e.g., Fintech, E-commerce, SaaS..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("domains", domainInput, setDomainInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList items={profile.domains} onRemove={(v) => removeFromArray("domains", v)} />
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button type="button" onClick={() => router.push("/")} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .input {
          @apply px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500;
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
