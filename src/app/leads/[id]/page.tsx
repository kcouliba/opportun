"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  createdAt: string;
  documents: Document[];
}

interface Document {
  id: string;
  type: string;
  content: string;
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

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setLead(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const updateStage = async (newStage: string) => {
    if (!lead) return;

    await fetch(`/api/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, stage: newStage }),
    });

    setLead({ ...lead, stage: newStage });
  };

  const generateDocument = async (type: string) => {
    setGenerating(type);

    const res = await fetch(`/api/leads/${id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });

    const doc = await res.json();
    setGenerating(null);

    if (lead) {
      setLead({ ...lead, documents: [...lead.documents, doc] });
      setActiveDoc(doc);
    }
  };

  const deleteLead = async () => {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    router.push("/leads");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
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
            href="/leads"
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Lead Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Info */}
            <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold mb-4">Details</h2>
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

            {/* Generated Document */}
            {activeDoc && (
              <section className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold">
                    {activeDoc.type === "cover_letter"
                      ? "Cover Letter"
                      : "Key Questions"}
                  </h2>
                  <button
                    onClick={() => navigator.clipboard.writeText(activeDoc.content)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Copy to clipboard
                  </button>
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
              </div>
            </section>

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
                        {doc.type === "cover_letter"
                          ? "Cover Letter"
                          : "Key Questions"}
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
                <button
                  onClick={deleteLead}
                  className="w-full py-2 px-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                >
                  Delete Lead
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
