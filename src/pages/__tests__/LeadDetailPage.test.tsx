import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { AiQueueProvider } from "@/components/AiQueue";
import { onInvoke, clearInvokeHandlers } from "@/test/tauri-mock";
import LeadDetailPage from "@/pages/LeadDetailPage";

const mockLead = {
  id: "l1",
  client: "Beta Inc",
  title: "Senior React Developer",
  description: "Build frontend features",
  source: "recruiter",
  sourceUrl: null,
  stage: "qualified",
  location: "Paris",
  remotePolicy: "hybrid",
  offeredRate: 600,
  estimatedStartDate: "2024-06-01",
  estimatedDuration: 6,
  requiredTechnologies: '["React","TypeScript"]',
  requiredDomains: '["Fintech"]',
  matchScore: 82,
  autoFiltered: false,
  contactName: "John Doe",
  contactInfo: "john@beta.com",
  notes: "Good fit",
  nextAction: null,
  nextActionDate: null,
  profileId: "p1",
  contentLanguage: "EN",
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-01-15T10:00:00Z",
  documents: [],
  activities: [],
};

function renderLeadDetail() {
  return render(
    <MemoryRouter initialEntries={["/leads/l1"]}>
      <ToastProvider>
        <AiQueueProvider>
          <Routes>
            <Route path="/leads/:id" element={<LeadDetailPage />} />
          </Routes>
        </AiQueueProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("LeadDetailPage", () => {
  beforeEach(() => clearInvokeHandlers());
  afterEach(() => {
    cleanup();
    clearInvokeHandlers();
  });

  it("renders lead details after loading", async () => {
    onInvoke("get_lead", () => mockLead);
    onInvoke("get_ai_settings", () => ({ enabled: false }));

    renderLeadDetail();

    await waitFor(() => {
      expect(screen.getAllByText("Beta Inc").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Senior React Developer").length).toBeGreaterThan(0);
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it("shows error with retry on failure", async () => {
    onInvoke("get_lead", () => {
      throw "Network error";
    });
    onInvoke("get_ai_settings", () => ({ enabled: false }));

    renderLeadDetail();

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders correct data fields", async () => {
    onInvoke("get_lead", () => mockLead);
    onInvoke("get_ai_settings", () => ({ enabled: false }));

    renderLeadDetail();

    await waitFor(() => {
      expect(screen.getAllByText("Beta Inc").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Senior React Developer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Qualified").length).toBeGreaterThan(0);
  });
});
