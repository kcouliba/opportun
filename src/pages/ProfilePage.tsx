import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";
import { PageLoader } from "@/components/LoadingSpinner";
import { useProfileImport } from "@/hooks/useProfileImport";
import FileDropZone from "@/components/FileDropZone";
import { toWslPath, validateFileExtension } from "@/lib/wslPath";
import type { Profile, EducationEntry, ParsedProfileData, ParsedMission } from "@/types/index";

interface ProfileForm {
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
  bio: string;
  languages: string[];
  education: EducationEntry[];
  contentLanguage: string;
}

const defaultProfile: ProfileForm = {
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
  bio: "",
  languages: [],
  education: [],
  contentLanguage: "FR",
};

/** Merge parsed data into profile: fill empty scalars, union-dedupe arrays */
function mergeImportData(current: ProfileForm, data: ParsedProfileData): ProfileForm {
  const unionDedupe = (existing: string[], incoming: string[] | null): string[] => {
    if (!incoming) return existing;
    const set = new Set(existing);
    for (const item of incoming) {
      set.add(item);
    }
    return [...set];
  };

  return {
    ...current,
    name: current.name || data.name || "",
    title: current.title || data.title || "",
    bio: current.bio || data.bio || "",
    yearsExperience: current.yearsExperience ?? data.yearsExperience ?? null,
    technologies: unionDedupe(current.technologies, data.technologies),
    domains: unionDedupe(current.domains, data.domains),
    languages: unionDedupe(current.languages, data.languages),
    preferredLocations: data.location && !current.preferredLocations.includes(data.location)
      ? [...current.preferredLocations, data.location]
      : current.preferredLocations,
    education: data.education && data.education.length > 0
      ? dedupeEducation(current.education, data.education)
      : current.education,
  };
}

function dedupeEducation(existing: EducationEntry[], incoming: EducationEntry[]): EducationEntry[] {
  const key = (e: EducationEntry) => `${e.school}|${e.degree ?? ""}`.toLowerCase();
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const entry of incoming) {
    if (!seen.has(key(entry))) {
      merged.push(entry);
      seen.add(key(entry));
    }
  }
  return merged;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileForm>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [techInput, setTechInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [langInput, setLangInput] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [importedMissions, setImportedMissions] = useState<ParsedMission[]>([]);
  const [selectedMissions, setSelectedMissions] = useState<Set<number>>(new Set());
  const [missionFromYear, setMissionFromYear] = useState<string>("");

  const { importFromFile, importFromPath, importFromText, loading: importing, error: importError } = useProfileImport();

  useEffect(() => {
    invoke<Profile | null>("get_profile")
      .then((data) => {
        if (data) {
          setProfile({
            id: data.id,
            name: data.name,
            title: data.title ?? "",
            yearsExperience: data.yearsExperience,
            legalStructure: data.legalStructure ?? "SASU",
            minimumTJM: data.minimumTJM,
            targetTJM: data.targetTJM,
            maxCommuteDays: data.maxCommuteDays,
            preferredLocations: data.preferredLocations ? JSON.parse(data.preferredLocations) : [],
            technologies: data.technologies ? JSON.parse(data.technologies) : [],
            domains: data.domains ? JSON.parse(data.domains) : [],
            blacklistedClients: data.blacklistedClients ? JSON.parse(data.blacklistedClients) : [],
            blacklistedDomains: data.blacklistedDomains ? JSON.parse(data.blacklistedDomains) : [],
            bio: data.bio ?? "",
            languages: data.languages ? JSON.parse(data.languages) : [],
            education: data.education ? JSON.parse(data.education) : [],
            contentLanguage: data.contentLanguage ?? "FR",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const applyImport = (data: ParsedProfileData) => {
    setProfile((prev) => mergeImportData(prev, data));
    if (data.missions && data.missions.length > 0) {
      setImportedMissions(data.missions);
      setSelectedMissions(new Set(data.missions.map((_, i) => i)));
      setMissionFromYear("");
    }
    const missionCount = data.missions?.length ?? 0;
    const missionMsg = missionCount > 0 ? ` — ${missionCount} missions found` : "";
    showToast(`Profile data imported${missionMsg} — review and save`, "success");
  };

  const handleImportFile = async () => {
    const data = await importFromFile();
    if (data) applyImport(data);
  };

  const handleFileDrop = async (path: string) => {
    const data = await importFromPath(path);
    if (data) {
      setImportOpen(true);
      applyImport(data);
    }
  };

  const handlePathImport = async () => {
    if (!pathInput.trim()) return;
    const wslPath = toWslPath(pathInput);
    const extError = validateFileExtension(wslPath);
    if (extError) {
      showToast(extError, "error");
      return;
    }
    const data = await importFromPath(wslPath);
    if (data) {
      setPathInput("");
      applyImport(data);
    }
  };

  const handleImportPaste = async () => {
    if (!pasteText.trim()) return;
    const data = await importFromText(pasteText);
    if (data) {
      applyImport(data);
      setPasteText("");
      setPasteOpen(false);
    }
  };

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
      languages: JSON.stringify(profile.languages),
      education: JSON.stringify(profile.education),
    };

    try {
      if (profile.id) {
        await invoke("update_profile", { data: payload });
      } else {
        await invoke("create_profile", { data: payload });
      }

      // Create selected imported missions
      const missionsToImport = importedMissions.filter((_, i) => selectedMissions.has(i));
      if (missionsToImport.length > 0) {
        let created = 0;
        for (const m of missionsToImport) {
          try {
            await invoke("create_mission", {
              data: {
                client: m.client,
                title: m.title,
                description: m.description,
                startDate: m.startDate ?? "2000-01-01",
                endDate: m.endDate,
                rate: 0,
                daysPerWeek: 5.0,
                status: m.endDate ? "completed" : "active",
              },
            });
            created++;
          } catch {
            // Skip duplicates or errors
          }
        }
        if (created > 0) {
          showToast(`Profile saved — ${created} missions imported`, "success");
        } else {
          showToast("Profile saved successfully", "success");
        }
        setImportedMissions([]);
        setSelectedMissions(new Set());
      } else {
        showToast("Profile saved successfully", "success");
      }

      navigate("/");
    } catch {
      showToast("An error occurred while saving", "error");
      setSaving(false);
    }
  };

  const addToArray = (
    field: keyof Pick<ProfileForm, "technologies" | "domains" | "preferredLocations" | "languages">,
    value: string,
    setter: (v: string) => void
  ) => {
    if (value.trim() && !profile[field].includes(value.trim())) {
      setProfile({ ...profile, [field]: [...profile[field], value.trim()] });
      setter("");
    }
  };

  const removeFromArray = (
    field: keyof Pick<ProfileForm, "technologies" | "domains" | "preferredLocations" | "languages">,
    value: string
  ) => {
    setProfile({ ...profile, [field]: profile[field].filter((v) => v !== value) });
  };

  const removeEducation = (index: number) => {
    setProfile({ ...profile, education: profile.education.filter((_, i) => i !== index) });
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

        {/* Import from LinkedIn */}
        <FileDropZone
          onFileDrop={handleFileDrop}
          onError={(msg) => showToast(msg, "error")}
          enabled={!importing}
          label="Drop LinkedIn PDF here"
        >
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setImportOpen(!importOpen)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>{importOpen ? "▾" : "▸"}</span>
            Import from LinkedIn
          </button>

          {importOpen && (
            <div className="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleImportFile}
                  disabled={importing}
                  className="btn btn-secondary text-sm"
                >
                  {importing ? "Parsing..." : "Upload LinkedIn PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(!pasteOpen)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {pasteOpen ? "Hide paste" : "Or paste profile text"}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Or paste file path from Explorer"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlePathImport();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handlePathImport}
                  disabled={importing || !pathInput.trim()}
                  className="btn btn-secondary text-sm"
                >
                  Import
                </button>
              </div>

              {pasteOpen && (
                <div className="space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="input w-full h-32 text-sm"
                    placeholder="Paste your LinkedIn profile text here..."
                  />
                  <button
                    type="button"
                    onClick={handleImportPaste}
                    disabled={importing || !pasteText.trim()}
                    className="btn btn-secondary text-sm"
                  >
                    {importing ? "Parsing..." : "Parse"}
                  </button>
                </div>
              )}

              {importError && (
                <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
              )}

              <p className="text-xs text-gray-500">
                Extracted data will auto-fill empty fields. Existing data is preserved.
              </p>
            </div>
          )}

          {importedMissions.length > 0 && (
            <div className="mt-3 p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {selectedMissions.size}/{importedMissions.length} missions selected
                </p>
                <button
                  type="button"
                  onClick={() => { setImportedMissions([]); setSelectedMissions(new Set()); }}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  Dismiss all
                </button>
              </div>

              {/* Filter + bulk actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400">From year:</label>
                  <input
                    type="number"
                    min="1990"
                    max="2030"
                    placeholder="All"
                    value={missionFromYear}
                    onChange={(e) => {
                      const year = e.target.value;
                      setMissionFromYear(year);
                      if (year) {
                        const newSet = new Set<number>();
                        importedMissions.forEach((m, i) => {
                          const startYear = m.startDate ? parseInt(m.startDate.slice(0, 4), 10) : 0;
                          if (startYear >= parseInt(year, 10)) newSet.add(i);
                        });
                        setSelectedMissions(newSet);
                      } else {
                        setSelectedMissions(new Set(importedMissions.map((_, i) => i)));
                      }
                    }}
                    className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMissions(new Set(importedMissions.map((_, i) => i)))}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMissions(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Deselect all
                </button>
              </div>

              {/* Mission list with checkboxes */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {importedMissions.map((m, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-2 text-sm p-1.5 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 ${
                      selectedMissions.has(i) ? "" : "opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMissions.has(i)}
                      onChange={() => {
                        setSelectedMissions((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                      }}
                      className="mt-0.5 rounded border-gray-300"
                    />
                    <div className="min-w-0">
                      <span className="font-medium">{m.title}</span>
                      <span className="text-gray-500"> at {m.client}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {m.startDate?.slice(0, 7) ?? "?"} → {m.endDate?.slice(0, 7) ?? "Present"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                Selected missions will be created when you save. Rate defaults to 0 — edit them in Missions after import.
              </p>
            </div>
          )}
        </section>
        </FileDropZone>

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
            <Field label="Bio" hint="Short professional summary">
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="input w-full"
                rows={4}
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
            <Field label="Content Language" hint="Default language for AI-generated content">
              <select
                value={profile.contentLanguage}
                onChange={(e) => setProfile({ ...profile, contentLanguage: e.target.value })}
                className="input w-40"
              >
                <option value="FR">Français</option>
                <option value="EN">English</option>
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
            <Field label="Languages">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToArray("languages", langInput, setLangInput);
                    }
                  }}
                  className="input flex-1"
                  placeholder="e.g., French, English, Spanish..."
                />
                <button
                  type="button"
                  onClick={() => addToArray("languages", langInput, setLangInput)}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
              <TagList items={profile.languages} onRemove={(v) => removeFromArray("languages", v)} />
            </Field>
          </Section>

          {/* Background */}
          <Section title="Background">
            <Field label="Education">
              {profile.education.length > 0 && (
                <div className="space-y-2 mb-3">
                  {profile.education.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="text-sm">
                        <p className="font-medium">{entry.school}</p>
                        {entry.degree && (
                          <p className="text-gray-600 dark:text-gray-400">{entry.degree}</p>
                        )}
                        {entry.field && (
                          <p className="text-gray-500 dark:text-gray-500">{entry.field}</p>
                        )}
                        {entry.endYear && (
                          <p className="text-gray-400 text-xs">{entry.endYear}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEducation(idx)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-sm ml-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Education entries can be added via LinkedIn import above.
              </p>
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn btn-secondary">
              Cancel
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
