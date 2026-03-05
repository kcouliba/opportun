import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";
import { useAiSettings } from "@/hooks/useAiSettings";
import { useAiParse } from "@/hooks/useAiParse";
import { useImport } from "@/hooks/useImport";
import FileDropZone from "@/components/FileDropZone";
import { toWslPath, validateFileExtension } from "@/lib/wslPath";
import type { ParsedJobDescription } from "@/types/index";

type InputMode = "paste" | "url" | "file";

interface AutoFilledFields {
  technologies: boolean;
  rate: boolean;
  location: boolean;
  remotePolicy: boolean;
  title: boolean;
  client: boolean;
  domains: boolean;
  duration: boolean;
  startDate: boolean;
  contactName: boolean;
  contactInfo: boolean;
  description: boolean;
}

const EMPTY_AUTOFILLED: AutoFilledFields = {
  technologies: false,
  rate: false,
  location: false,
  remotePolicy: false,
  title: false,
  client: false,
  domains: false,
  duration: false,
  startDate: false,
  contactName: false,
  contactInfo: false,
  description: false,
};

type ParseSource = "auto" | "ai";

export default function QuickCapturePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAiEnabled } = useAiSettings();
  const { parseWithAi, parsing: aiParsing } = useAiParse();
  const { fetchUrl, readFile, readFilePath, parseText, loading: importLoading, error: importError } = useImport();

  const [searchParams] = useSearchParams();
  const fileAutoOpened = useRef(false);

  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(
    searchParams.get("mode") === "file" ? "file" : "paste",
  );
  const [jobDescription, setJobDescription] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [parseSource, setParseSource] = useState<ParseSource | null>(null);
  const [autoFilled, setAutoFilled] = useState<AutoFilledFields>({ ...EMPTY_AUTOFILLED });

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
    rateDisplay: "",
    location: "",
    remotePolicy: "",
  });

  // Apply parsed result to form fields
  const applyParsedResult = useCallback(
    (parsed: ParsedJobDescription, source: ParseSource) => {
      const newAutoFilled: AutoFilledFields = { ...EMPTY_AUTOFILLED };
      const updates: Partial<typeof form> = {};

      if (parsed.technologies && parsed.technologies.length > 0) {
        updates.technologies = parsed.technologies;
        newAutoFilled.technologies = true;
      }
      if (parsed.rate !== null) {
        updates.rate = parsed.rate;
        updates.rateDisplay = `${parsed.rate}€/day`;
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
      if (parsed.client) {
        updates.client = parsed.client;
        newAutoFilled.client = true;
      }
      if (parsed.contactName) {
        updates.contactName = parsed.contactName;
        newAutoFilled.contactName = true;
      }
      if (parsed.contactInfo) {
        updates.contactInfo = parsed.contactInfo;
        newAutoFilled.contactInfo = true;
      }

      setForm((prev) => ({ ...prev, ...updates }));
      setAutoFilled(newAutoFilled);
      setParseSource(source);

      const count = Object.values(newAutoFilled).filter(Boolean).length;
      return count;
    },
    [],
  );

  // Auto-parse text using Rust rule-based parser
  const autoParseText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const parsed = await parseText(text);
      if (parsed) {
        const count = applyParsedResult(parsed, "auto");
        if (count > 0) {
          showToast(
            `Extracted ${count} field${count > 1 ? "s" : ""} from description`,
            "success",
          );
        } else {
          showToast("No fields could be extracted", "info");
        }
      }
    },
    [parseText, applyParsedResult, showToast],
  );

  // Handle text arriving from any source
  const handleTextImported = useCallback(
    async (text: string) => {
      setJobDescription(text);
      await autoParseText(text);
    },
    [autoParseText],
  );

  // URL import
  const handleUrlImport = async () => {
    if (!urlInput.trim()) {
      showToast("Enter a URL first", "error");
      return;
    }
    const text = await fetchUrl(urlInput.trim());
    if (text) {
      await handleTextImported(text);
      showToast("Text imported from URL", "success");
    }
  };

  // File import
  const handleFileImport = async () => {
    const text = await readFile();
    if (text) {
      await handleTextImported(text);
      showToast("Text imported from file", "success");
    }
  };

  // Drag-and-drop file import
  const handleFileDrop = async (path: string) => {
    const text = await readFilePath(path);
    if (text) {
      setInputMode("file");
      await handleTextImported(text);
      showToast("Text imported from file", "success");
    }
  };

  // Import from pasted file path (Windows or WSL)
  const handlePathImport = async () => {
    if (!pathInput.trim()) {
      showToast("Paste a file path first", "error");
      return;
    }
    const wslPath = toWslPath(pathInput);
    const extError = validateFileExtension(wslPath);
    if (extError) {
      showToast(extError, "error");
      return;
    }
    const text = await readFilePath(wslPath);
    if (text) {
      setPathInput("");
      await handleTextImported(text);
      showToast("Text imported from file", "success");
    }
  };

  // Show import errors as toasts (e.g. image-based PDFs)
  useEffect(() => {
    if (importError) {
      showToast(importError, "error");
    }
  }, [importError, showToast]);

  // Auto-open file dialog when navigated with ?mode=file
  useEffect(() => {
    if (searchParams.get("mode") === "file" && !fileAutoOpened.current) {
      fileAutoOpened.current = true;
      readFile().then((text) => {
        if (text) {
          handleTextImported(text);
          showToast("Text imported from file", "success");
        }
      });
    }
  }, [searchParams, readFile, handleTextImported, showToast]);

  // Manual parse button (for paste mode)
  const handleParse = async () => {
    if (!jobDescription.trim()) {
      showToast("Paste a job description first", "error");
      return;
    }
    await autoParseText(jobDescription);
  };

  // Enhance with AI: overwrites auto-parsed fields, fills gaps, preserves nothing from rule parser
  const handleEnhanceWithAi = async () => {
    if (!jobDescription.trim()) {
      showToast("No text to enhance", "error");
      return;
    }

    const aiResult = await parseWithAi(jobDescription);
    if (!aiResult) {
      showToast("AI enhancement failed", "error");
      return;
    }

    // AI overwrites all fields it has values for — user explicitly asked for AI enhancement
    const updates: Partial<typeof form> = {};
    const newAutoFilled = { ...EMPTY_AUTOFILLED };
    let count = 0;

    if (aiResult.technologies && aiResult.technologies.length > 0) {
      updates.technologies = aiResult.technologies;
      newAutoFilled.technologies = true;
      count++;
    }
    if (aiResult.rate !== null) {
      updates.rate = aiResult.rate;
      updates.rateDisplay = `${aiResult.rate}€/day`;
      newAutoFilled.rate = true;
      count++;
    }
    if (aiResult.location) {
      updates.location = aiResult.location;
      newAutoFilled.location = true;
      count++;
    }
    if (aiResult.remotePolicy) {
      updates.remotePolicy = aiResult.remotePolicy;
      newAutoFilled.remotePolicy = true;
      count++;
    }
    if (aiResult.client) {
      updates.client = aiResult.client;
      newAutoFilled.client = true;
      count++;
    }
    if (aiResult.contactName) {
      updates.contactName = aiResult.contactName;
      newAutoFilled.contactName = true;
      count++;
    }
    if (aiResult.contactInfo) {
      updates.contactInfo = aiResult.contactInfo;
      newAutoFilled.contactInfo = true;
      count++;
    }

    if (count > 0) {
      setForm((prev) => ({ ...prev, ...updates }));
      setAutoFilled(newAutoFilled);
      setParseSource("ai");
      showToast(
        `AI extracted ${count} field${count > 1 ? "s" : ""}`,
        "success",
      );
    } else {
      showToast("AI could not extract any fields", "info");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      await invoke("create_lead", { data: payload });
      showToast("Lead captured!", "success");
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
      setUrlInput("");
      setAutoFilled({ ...EMPTY_AUTOFILLED });
      setParseSource(null);
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
      const lead = await invoke<{ id: string }>("create_lead", {
        data: payload,
      });
      showToast("Lead captured!", "success");
      navigate(`/leads/${lead.id}`);
    } catch {
      showToast("An error occurred", "error");
      setSaving(false);
    }
  };

  const badgeClass = (source: ParseSource | null) =>
    source === "ai"
      ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300"
      : "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300";

  const badgeLabel = (source: ParseSource | null) =>
    source === "ai" ? "AI" : "auto";

  const isLoading = importLoading || aiParsing;

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

        {/* Import Section */}
        <FileDropZone
          onFileDrop={handleFileDrop}
          onError={(msg) => showToast(msg, "error")}
          enabled={!isLoading}
          label="Drop job description file here"
        >
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Input mode tabs */}
          <div className="flex gap-1 mb-3 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
            {(["paste", "url", "file"] as InputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setInputMode(mode)}
                className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
                  inputMode === mode
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {mode === "paste" && "Paste"}
                {mode === "url" && "URL"}
                {mode === "file" && "File"}
              </button>
            ))}
          </div>

          {/* Paste mode */}
          {inputMode === "paste" && (
            <>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] text-sm"
                placeholder="Paste the job description here to auto-extract technologies, rate, location..."
                rows={4}
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={isLoading}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? "Parsing..." : "Parse Description"}
                </button>
                {isAiEnabled && parseSource === "auto" && (
                  <button
                    type="button"
                    onClick={handleEnhanceWithAi}
                    disabled={aiParsing}
                    className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
                  >
                    {aiParsing ? "Enhancing..." : "Enhance with AI"}
                  </button>
                )}
              </div>
            </>
          )}

          {/* URL mode */}
          {inputMode === "url" && (
            <>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="https://example.com/job-posting"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUrlImport();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleUrlImport}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {importLoading ? "Importing..." : "Import"}
                </button>
              </div>
              {jobDescription && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Imported text (editable)
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleParse}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      Re-parse
                    </button>
                    {isAiEnabled && parseSource === "auto" && (
                      <button
                        type="button"
                        onClick={handleEnhanceWithAi}
                        disabled={aiParsing}
                        className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
                      >
                        {aiParsing ? "Enhancing..." : "Enhance with AI"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* File mode */}
          {inputMode === "file" && (
            <>
              <button
                type="button"
                onClick={handleFileImport}
                disabled={isLoading}
                className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {importLoading
                  ? "Reading file..."
                  : "Choose File (PDF, TXT, MD)"}
              </button>
              <div className="flex gap-2 mt-2">
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
                  disabled={isLoading || !pathInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  Import
                </button>
              </div>
              {jobDescription && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Extracted text (editable)
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleParse}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      Re-parse
                    </button>
                    {isAiEnabled && parseSource === "auto" && (
                      <button
                        type="button"
                        onClick={handleEnhanceWithAi}
                        disabled={aiParsing}
                        className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
                      >
                        {aiParsing ? "Enhancing..." : "Enhance with AI"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </FileDropZone>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client - Most important */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client / Company <span className="text-red-500">*</span>
              {autoFilled.client && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${badgeClass(parseSource)}`}
                >
                  {badgeLabel(parseSource)}
                </span>
              )}
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
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Name
                {autoFilled.contactName && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${badgeClass(parseSource)}`}
                  >
                    {badgeLabel(parseSource)}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) =>
                  setForm({ ...form, contactName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Recruiter name"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Info
                {autoFilled.contactInfo && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${badgeClass(parseSource)}`}
                  >
                    {badgeLabel(parseSource)}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={form.contactInfo}
                onChange={(e) =>
                  setForm({ ...form, contactInfo: e.target.value })
                }
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
                onChange={(e) =>
                  setForm({ ...form, nextActionDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Parsed Fields Section */}
          {(form.technologies.length > 0 ||
            form.rate !== null ||
            form.location ||
            form.remotePolicy) && (
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
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${badgeClass(parseSource)}`}
                      >
                        {badgeLabel(parseSource)}
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
                              technologies: prev.technologies.filter(
                                (t) => t !== tech,
                              ),
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
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded ${badgeClass(parseSource)}`}
                        >
                          {badgeLabel(parseSource)}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={form.rate}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rate: e.target.value
                            ? parseInt(e.target.value, 10)
                            : null,
                        })
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 600"
                    />
                    {form.rateDisplay &&
                      form.rateDisplay !== `${form.rate}€/day` && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Parsed: {form.rateDisplay}
                        </p>
                      )}
                  </div>
                )}
                {form.location && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Location
                      {autoFilled.location && (
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded ${badgeClass(parseSource)}`}
                        >
                          {badgeLabel(parseSource)}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {form.remotePolicy && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Remote
                      {autoFilled.remotePolicy && (
                        <span
                          className={`text-[10px] px-1 py-0.5 rounded ${badgeClass(parseSource)}`}
                        >
                          {badgeLabel(parseSource)}
                        </span>
                      )}
                    </label>
                    <select
                      value={form.remotePolicy}
                      onChange={(e) =>
                        setForm({ ...form, remotePolicy: e.target.value })
                      }
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
          Tip: Import from URL or file, or paste — the parser extracts details
          instantly
        </p>
      </div>
    </main>
  );
}
