"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

export default function QuickCapturePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

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
  });

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
      requiredTechnologies: "[]",
      requiredDomains: "[]",
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("Lead captured!", "success");
        // Reset form for another entry
        setForm({
          client: "",
          contactName: "",
          contactInfo: "",
          source: "recruiter",
          nextActionDate: tomorrowStr,
          notes: "",
        });
      } else {
        const error = await res.json();
        showToast(error.error || "Failed to save lead", "error");
      }
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
      requiredTechnologies: "[]",
      requiredDomains: "[]",
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const lead = await res.json();
        showToast("Lead captured!", "success");
        router.push(`/leads/${lead.id}`);
      } else {
        const error = await res.json();
        showToast(error.error || "Failed to save lead", "error");
        setSaving(false);
      }
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
            href="/leads"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
          >
            ← Back to Pipeline
          </Link>
          <h1 className="text-xl font-bold">Quick Capture</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Capture now, details later
          </p>
        </header>

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
