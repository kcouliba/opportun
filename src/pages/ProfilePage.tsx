import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import { PageLoader } from "@/components/LoadingSpinner";
import { ErrorState } from "@/components/ErrorState";
import { useProfileImport } from "@/hooks/useProfileImport";
import { useResumeGeneration } from "@/hooks/useResumeGeneration";
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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileForm>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const [importTab, setImportTab] = useState<"linkedin" | "resume">("linkedin");

  const {
    importFromFile, importFromPath, importFromText,
    importResumeFromFile, importResumeFromPath, importResumeFromText,
    loading: importing, error: importError,
  } = useProfileImport();

  const { generateResume, generating } = useResumeGeneration();

  const handleGenerateResume = () => {
    generateResume(profile);
  };

  const loadData = () => {
    setLoading(true);
    setError(null);
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
      .catch((err) => {
        setError(typeof err === "string" ? err : "Failed to load profile");
        setLoading(false);
      });
  };

  useEffect(() => { loadData(); }, []);

  const applyImport = (data: ParsedProfileData) => {
    setProfile((prev) => mergeImportData(prev, data));
    if (data.missions && data.missions.length > 0) {
      setImportedMissions(data.missions);
      setSelectedMissions(new Set(data.missions.map((_, i) => i)));
      setMissionFromYear("");
    }
    const missionCount = data.missions?.length ?? 0;
    const missionMsg = missionCount > 0 ? ` — ${missionCount} missions` : "";
    showToast(t("profile.dataImported", { missionMsg }), "success");
  };

  const handleImportFile = async () => {
    const fn = importTab === "resume" ? importResumeFromFile : importFromFile;
    const data = await fn();
    if (data) applyImport(data);
  };

  const handleFileDrop = async (path: string) => {
    const fn = importTab === "resume" ? importResumeFromPath : importFromPath;
    const data = await fn(path);
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
    const fn = importTab === "resume" ? importResumeFromPath : importFromPath;
    const data = await fn(wslPath);
    if (data) {
      setPathInput("");
      applyImport(data);
    }
  };

  const handleImportPaste = async () => {
    if (!pasteText.trim()) return;
    const fn = importTab === "resume" ? importResumeFromText : importFromText;
    const data = await fn(pasteText);
    if (data) {
      applyImport(data);
      setPasteText("");
      setPasteOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile.name.trim()) {
      showToast(t("profile.nameRequired"), "error");
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
          showToast(t("profile.profileSavedWithMissions", { count: created }), "success");
        } else {
          showToast(t("profile.profileSaved"), "success");
        }
        setImportedMissions([]);
        setSelectedMissions(new Set());
      } else {
        showToast(t("profile.profileSaved"), "success");
      }

      setSaving(false);
    } catch {
      showToast(t("profile.failedSave"), "error");
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

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">{t("profile.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t("profile.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateResume}
            disabled={generating || !profile.name}
            className="btn btn-secondary whitespace-nowrap"
          >
            {generating ? t("profile.generating") : t("profile.exportResume")}
          </button>
        </header>

        {/* Import profile data */}
        <FileDropZone
          onFileDrop={handleFileDrop}
          onError={(msg) => showToast(msg, "error")}
          enabled={!importing}
          label={t("profile.dropProfile")}
        >
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setImportOpen(!importOpen)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>{importOpen ? "▾" : "▸"}</span>
            {t("profile.importProfile")}
          </button>

          {importOpen && (
            <div className="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setImportTab("linkedin")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    importTab === "linkedin"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {t("profile.linkedin")}
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab("resume")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                    importTab === "resume"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {t("profile.resume")}
                  <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                    {t("profile.ai")}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleImportFile}
                  disabled={importing}
                  className="btn btn-secondary text-sm"
                >
                  {importing
                    ? t("profile.parsing")
                    : importTab === "resume"
                      ? t("profile.uploadResume")
                      : t("profile.uploadLinkedin")}
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(!pasteOpen)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {pasteOpen ? t("profile.hidePaste") : t("profile.pasteText")}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder={
                    importTab === "resume"
                      ? t("profile.pasteResumeFilePath")
                      : t("profile.pasteFilePath")
                  }
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
                  {t("common.import")}
                </button>
              </div>

              {pasteOpen && (
                <div className="space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="input w-full h-32 text-sm"
                    placeholder={
                      importTab === "resume"
                        ? t("profile.pasteResumePlaceholder")
                        : t("profile.pasteLinkedinPlaceholder")
                    }
                  />
                  <button
                    type="button"
                    onClick={handleImportPaste}
                    disabled={importing || !pasteText.trim()}
                    className="btn btn-secondary text-sm"
                  >
                    {importing ? t("profile.parsing") : t("profile.parse")}
                  </button>
                </div>
              )}

              {importError && (
                <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
              )}

              <p className="text-xs text-gray-500">
                {importTab === "resume"
                  ? t("profile.parseHint")
                  : t("profile.importHint")}
              </p>
            </div>
          )}

          {importedMissions.length > 0 && (
            <div className="mt-3 p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {t("profile.missionsSelected", { selected: selectedMissions.size, total: importedMissions.length })}
                </p>
                <button
                  type="button"
                  onClick={() => { setImportedMissions([]); setSelectedMissions(new Set()); }}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  {t("profile.dismissAll")}
                </button>
              </div>

              {/* Filter + bulk actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400">{t("profile.fromYear")}</label>
                  <input
                    type="number"
                    min="1990"
                    max="2030"
                    placeholder={t("common.all")}
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
                  {t("common.selectAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMissions(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {t("common.deselectAll")}
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
                        {m.startDate?.slice(0, 7) ?? "?"} → {m.endDate?.slice(0, 7) ?? t("common.present")}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                {t("profile.missionImportHint")}
              </p>
            </div>
          )}
        </section>
        </FileDropZone>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Identity */}
          <Section title={t("profile.identity")}>
            <Field label={t("profile.name")} required>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="input"
                required
              />
            </Field>
            <Field label={t("profile.jobTitle")} hint={t("profile.titlePlaceholder")}>
              <input
                type="text"
                value={profile.title}
                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t("profile.bio")} hint={t("profile.bioPlaceholder")}>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="input w-full"
                rows={4}
              />
            </Field>
            <Field label={t("profile.yearsExperience")}>
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
          <Section title={t("profile.rateExpectations")}>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("profile.minimumTjm")} hint={t("profile.minimumTjmHint")}>
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
                  <span className="text-gray-500">{t("common.perDay")}</span>
                </div>
              </Field>
              <Field label={t("profile.targetTjm")} hint={t("profile.targetTjmHint")}>
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
                  <span className="text-gray-500">{t("common.perDay")}</span>
                </div>
              </Field>
            </div>
            <Field label={t("profile.legalStructure")}>
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
          <Section title={t("profile.locationPreferences")}>
            <Field label={t("profile.preferredLocations")}>
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
                  placeholder={t("profile.locationsPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("preferredLocations", locationInput, setLocationInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList
                items={profile.preferredLocations}
                onRemove={(v) => removeFromArray("preferredLocations", v)}
              />
            </Field>
            <Field label={t("profile.maxCommuteDays")} hint={t("profile.maxCommuteDaysHint")}>
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
          <Section title={t("profile.skills")}>
            <Field label={t("profile.technologies")}>
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
                  placeholder={t("profile.technologiesPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("technologies", techInput, setTechInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList items={profile.technologies} onRemove={(v) => removeFromArray("technologies", v)} />
            </Field>
            <Field label={t("profile.domains")}>
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
                  placeholder={t("profile.domainsPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("domains", domainInput, setDomainInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList items={profile.domains} onRemove={(v) => removeFromArray("domains", v)} />
            </Field>
            <Field label={t("profile.languages")}>
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
                  placeholder={t("profile.languagesPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => addToArray("languages", langInput, setLangInput)}
                  className="btn btn-secondary"
                >
                  {t("common.add")}
                </button>
              </div>
              <TagList items={profile.languages} onRemove={(v) => removeFromArray("languages", v)} />
            </Field>
          </Section>

          {/* Background */}
          <Section title={t("profile.background")}>
            <Field label={t("profile.education")}>
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
                {t("profile.educationHint")}
              </p>
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? t("common.saving") : t("profile.saveProfile")}
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn btn-secondary">
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
