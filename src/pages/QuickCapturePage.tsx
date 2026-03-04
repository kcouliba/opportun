import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";
import { useAiSettings } from "@/hooks/useAiSettings";
import { useAiParse } from "@/hooks/useAiParse";

// Common technology keywords to detect
const TECH_KEYWORDS = [
  // Frontend
  "React", "Vue", "Angular", "Next.js", "Nuxt", "Svelte", "TypeScript", "JavaScript",
  "HTML", "CSS", "Tailwind", "SASS", "SCSS", "Redux", "Zustand", "GraphQL",
  // Backend
  "Node.js", "Node", "Express", "NestJS", "Python", "Django", "FastAPI", "Flask",
  "Java", "Spring", "Spring Boot", "Kotlin", "Go", "Golang", "Rust", "Ruby", "Rails",
  "PHP", "Laravel", "Symfony", ".NET", "C#",
  // Data
  "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka",
  "RabbitMQ", "SQL", "NoSQL", "DynamoDB", "Cassandra",
  // Cloud & DevOps
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "K8s", "Terraform",
  "CI/CD", "Jenkins", "GitLab", "GitHub Actions", "Ansible", "Linux",
  // Mobile
  "React Native", "Flutter", "iOS", "Android", "Swift", "Objective-C",
  // AI/ML
  "Machine Learning", "ML", "AI", "TensorFlow", "PyTorch", "LLM", "NLP",
];

// French cities and remote keywords
const LOCATIONS = [
  "Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Strasbourg",
  "Montpellier", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Grenoble",
  "Ile-de-France", "IDF", "La Défense",
];

interface ParsedData {
  technologies: string[];
  rate: number | null;
  rateDisplay: string | null; // For showing the original parsed text
  location: string | null;
  remotePolicy: string | null;
}

interface AutoFilledFields {
  technologies: boolean;
  rate: boolean;
  location: boolean;
  remotePolicy: boolean;
}

type ParseSource = "auto" | "ai";

function parseJobDescription(text: string): ParsedData {
  const result: ParsedData = {
    technologies: [],
    rate: null,
    rateDisplay: null,
    location: null,
    remotePolicy: null,
  };

  const textLower = text.toLowerCase();

  // Extract technologies (case-insensitive matching)
  const foundTechs = new Set<string>();
  for (const tech of TECH_KEYWORDS) {
    // Create a regex that matches the tech as a whole word
    const regex = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(text)) {
      foundTechs.add(tech);
    }
  }
  result.technologies = Array.from(foundTechs);

  // Extract rate patterns
  // Patterns: "€600/day", "600€/jour", "TJM 600", "600-700€", "TJM: 600€", etc.
  const ratePatterns = [
    /(\d{3,4})\s*[-–]\s*(\d{3,4})\s*€/i, // 600-700€
    /€\s*(\d{3,4})\s*[-–]\s*(\d{3,4})/i, // €600-700
    /(\d{3,4})\s*€\s*[/\\]?\s*(jour|day|j)/i, // 600€/jour
    /€\s*(\d{3,4})\s*[/\\]?\s*(jour|day|j)/i, // €600/jour
    /tjm\s*:?\s*(\d{3,4})/i, // TJM 600 or TJM: 600
    /(\d{3,4})\s*€/i, // Simple 600€
    /€\s*(\d{3,4})/i, // Simple €600
  ];

  for (const pattern of ratePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Check if it's a range pattern (second capture group is also a number)
      if (match[2] && /^\d+$/.test(match[2])) {
        const low = parseInt(match[1], 10);
        const high = parseInt(match[2], 10);
        // Use the average of the range
        result.rate = Math.round((low + high) / 2);
        result.rateDisplay = `${match[1]}-${match[2]}€/day`;
      } else if (match[1]) {
        result.rate = parseInt(match[1], 10);
        result.rateDisplay = `${match[1]}€/day`;
      }
      break;
    }
  }

  // Extract location
  for (const location of LOCATIONS) {
    const regex = new RegExp(`\\b${location}\\b`, "i");
    if (regex.test(text)) {
      result.location = location;
      break;
    }
  }

  // Extract remote policy
  if (/\b(full\s*remote|100%?\s*remote|télétravail\s*(complet|total|100%?))\b/i.test(textLower)) {
    result.remotePolicy = "full-remote";
  } else if (/\b(remote|télétravail)\b/i.test(textLower) && !/\b(no\s*remote|pas\s*de\s*télétravail)\b/i.test(textLower)) {
    // Check for hybrid indicators
    if (/\b(hybrid|hybride|partiel|2j|3j|2\s*jours?|3\s*jours?)\b/i.test(textLower)) {
      result.remotePolicy = "hybrid";
    } else {
      result.remotePolicy = "remote";
    }
  } else if (/\b(on[\s-]?site|présentiel|sur\s*site|bureau)\b/i.test(textLower)) {
    result.remotePolicy = "on-site";
  } else if (/\b(hybrid|hybride)\b/i.test(textLower)) {
    result.remotePolicy = "hybrid";
  }

  return result;
}

export default function QuickCapturePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAiEnabled } = useAiSettings();
  const { parseWithAi, parsing: aiParsing } = useAiParse();
  const [saving, setSaving] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [parseSource, setParseSource] = useState<ParseSource | null>(null);
  const [autoFilled, setAutoFilled] = useState<AutoFilledFields>({
    technologies: false,
    rate: false,
    location: false,
    remotePolicy: false,
  });

  // Get tomorrow's date as default for follow-up
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const [form, setForm] = useState({
    client: "",
    contactName: "",
    contactInfo: "",
    source: "recruiter",
    nextActionDate: tomorrowStr,
    notes: "",
    technologies: [] as string[],
    rate: null as number | null,
    rateDisplay: "", // For showing the parsed rate in UI
    location: "",
    remotePolicy: "",
  });

  const applyRegexParse = () => {
    const parsed = parseJobDescription(jobDescription);
    const newAutoFilled: AutoFilledFields = {
      technologies: false,
      rate: false,
      location: false,
      remotePolicy: false,
    };

    const updates: Partial<typeof form> = {};

    if (parsed.technologies.length > 0) {
      updates.technologies = parsed.technologies;
      newAutoFilled.technologies = true;
    }
    if (parsed.rate !== null) {
      updates.rate = parsed.rate;
      updates.rateDisplay = parsed.rateDisplay || `${parsed.rate}€/day`;
      newAutoFilled.rate = true;
    }
    if (parsed.location) {
      updates.location = parsed.location;
      newAutoFilled.location = true;
    }
    if (parsed.remotePolicy) {
      updates.remotePolicy = parsed.remotePolicy;
      newAutoFilled.remotePolicy = true;
    }

    setForm((prev) => ({ ...prev, ...updates }));
    setAutoFilled(newAutoFilled);
    setParseSource("auto");

    const count = Object.values(newAutoFilled).filter(Boolean).length;
    if (count > 0) {
      showToast(`Extracted ${count} field${count > 1 ? "s" : ""} from description`, "success");
    } else {
      showToast("No fields could be extracted", "info");
    }
  };

  const handleParse = async () => {
    if (!jobDescription.trim()) {
      showToast("Paste a job description first", "error");
      return;
    }

    // Try AI parsing first if enabled
    if (isAiEnabled) {
      const aiResult = await parseWithAi(jobDescription);

      if (aiResult) {
        const newAutoFilled: AutoFilledFields = {
          technologies: false,
          rate: false,
          location: false,
          remotePolicy: false,
        };
        const updates: Partial<typeof form> = {};

        if (aiResult.technologies && aiResult.technologies.length > 0) {
          updates.technologies = aiResult.technologies;
          newAutoFilled.technologies = true;
        }
        if (aiResult.rate !== null) {
          updates.rate = aiResult.rate;
          updates.rateDisplay = `${aiResult.rate}€/day`;
          newAutoFilled.rate = true;
        }
        if (aiResult.location) {
          updates.location = aiResult.location;
          newAutoFilled.location = true;
        }
        if (aiResult.remotePolicy) {
          updates.remotePolicy = aiResult.remotePolicy;
          newAutoFilled.remotePolicy = true;
        }
        if (aiResult.client) {
          updates.client = aiResult.client;
        }
        if (aiResult.contactName) {
          updates.contactName = aiResult.contactName;
        }
        if (aiResult.contactInfo) {
          updates.contactInfo = aiResult.contactInfo;
        }

        setForm((prev) => ({ ...prev, ...updates }));
        setAutoFilled(newAutoFilled);
        setParseSource("ai");

        const count = Object.values(newAutoFilled).filter(Boolean).length;
        showToast(`AI extracted ${count} field${count > 1 ? "s" : ""}`, "success");
        return;
      }

      // AI failed, fall back to regex
      showToast("AI unavailable, using pattern matching", "info");
    }

    applyRegexParse();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.client.trim()) {
      showToast("Client/Company is required", "error");
      return;
    }

    setSaving(true);

    // Build payload with auto-generated title
    const payload = {
      client: form.client.trim(),
      title: `Opportunity from ${form.client.trim()}`,
      source: form.source,
      contactName: form.contactName || null,
      contactInfo: form.contactInfo || null,
      nextAction: "Follow up",
      nextActionDate: form.nextActionDate || null,
      notes: form.notes || null,
      requiredTechnologies: JSON.stringify(form.technologies),
      requiredDomains: "[]",
      offeredRate: form.rate || null,
      location: form.location || null,
      remotePolicy: form.remotePolicy || null,
    };

    try {
      await invoke("create_lead", { data: payload });
      showToast("Lead captured!", "success");
      // Reset form for another entry
      setForm({
        client: "",
        contactName: "",
        contactInfo: "",
        source: "recruiter",
        nextActionDate: tomorrowStr,
        notes: "",
        technologies: [],
        rate: null,
        rateDisplay: "",
        location: "",
        remotePolicy: "",
      });
      setJobDescription("");
      setAutoFilled({
        technologies: false,
        rate: false,
        location: false,
        remotePolicy: false,
      });
    } catch {
      showToast("An error occurred", "error");
    }

    setSaving(false);
  };

  const handleSubmitAndView = async () => {
    if (!form.client.trim()) {
      showToast("Client/Company is required", "error");
      return;
    }

    setSaving(true);

    const payload = {
      client: form.client.trim(),
      title: `Opportunity from ${form.client.trim()}`,
      source: form.source,
      contactName: form.contactName || null,
      contactInfo: form.contactInfo || null,
      nextAction: "Follow up",
      nextActionDate: form.nextActionDate || null,
      notes: form.notes || null,
      requiredTechnologies: JSON.stringify(form.technologies),
      requiredDomains: "[]",
      offeredRate: form.rate || null,
      location: form.location || null,
      remotePolicy: form.remotePolicy || null,
    };

    try {
      const lead = await invoke<{ id: string }>("create_lead", { data: payload });
      showToast("Lead captured!", "success");
      navigate(`/leads/${lead.id}`);
    } catch {
      showToast("An error occurred", "error");
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="mb-6">
          <Link
            to="/leads"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
          >
            ← Back to Pipeline
          </Link>
          <h1 className="text-xl font-bold">Quick Capture</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Capture now, details later
          </p>
        </header>

        {/* Job Description Parser */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Paste Job Description
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] text-sm"
            placeholder="Paste the job description here to auto-extract technologies, rate, location..."
            rows={4}
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={aiParsing}
            className="mt-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {aiParsing ? "AI Parsing..." : isAiEnabled ? "Parse with AI" : "Parse Description"}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client - Most important */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client / Company <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Who is it?"
              autoFocus
            />
          </div>

          {/* Contact Info - Critical for follow-up */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Name
              </label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Recruiter name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Info
              </label>
              <input
                type="text"
                value={form.contactInfo}
                onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Email or phone"
              />
            </div>
          </div>

          {/* Source and Follow-up date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source
              </label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recruiter">Recruiter</option>
                <option value="linkedin">LinkedIn</option>
                <option value="freework">Freework</option>
                <option value="comet">Comet</option>
                <option value="referral">Referral</option>
                <option value="direct">Direct</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Follow up
              </label>
              <input
                type="date"
                value={form.nextActionDate}
                onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Parsed Fields Section */}
          {(form.technologies.length > 0 || form.rate !== null || form.location || form.remotePolicy) && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Extracted from description (review and edit)
              </p>

              {/* Technologies */}
              {form.technologies.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Technologies
                    {autoFilled.technologies && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${parseSource === "ai" ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"}`}>
                        {parseSource === "ai" ? "AI" : "auto"}
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {form.technologies.map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                      >
                        {tech}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              technologies: prev.technologies.filter((t) => t !== tech),
                            }))
                          }
                          className="text-gray-400 hover:text-red-500 text-xs"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rate, Location, Remote in a grid */}
              <div className="grid grid-cols-3 gap-2">
                {form.rate !== null && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Rate (€/day)
                      {autoFilled.rate && (
                        <span className={`text-[10px] px-1 py-0.5 rounded ${parseSource === "ai" ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"}`}>
                          {parseSource === "ai" ? "AI" : "auto"}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={form.rate}
                      onChange={(e) => setForm({ ...form, rate: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 600"
                    />
                    {form.rateDisplay && form.rateDisplay !== `${form.rate}€/day` && (
                      <p className="text-[10px] text-gray-500 mt-0.5">Parsed: {form.rateDisplay}</p>
                    )}
                  </div>
                )}
                {form.location && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Location
                      {autoFilled.location && (
                        <span className={`text-[10px] px-1 py-0.5 rounded ${parseSource === "ai" ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"}`}>
                          {parseSource === "ai" ? "AI" : "auto"}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {form.remotePolicy && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Remote
                      {autoFilled.remotePolicy && (
                        <span className={`text-[10px] px-1 py-0.5 rounded ${parseSource === "ai" ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300"}`}>
                          {parseSource === "ai" ? "AI" : "auto"}
                        </span>
                      )}
                    </label>
                    <select
                      value={form.remotePolicy}
                      onChange={(e) => setForm({ ...form, remotePolicy: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="full-remote">Full Remote</option>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="on-site">On-site</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quick notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
              placeholder="Key points from the call..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save & Add Another"}
            </button>
            <button
              type="button"
              onClick={handleSubmitAndView}
              disabled={saving}
              className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Save & View Details
            </button>
          </div>
        </form>

        {/* Tip */}
        <p className="mt-6 text-xs text-center text-gray-500">
          Tip: Add full job details later when the email arrives
        </p>
      </div>
    </main>
  );
}
