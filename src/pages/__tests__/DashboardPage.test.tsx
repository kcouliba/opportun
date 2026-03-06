import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { onInvoke, clearInvokeHandlers } from "@/test/tauri-mock";
import DashboardPage from "@/pages/DashboardPage";

const mockProfile = {
  id: "p1",
  name: "Alice Martin",
  title: "Fullstack Developer",
  technologies: '["React","Node.js"]',
  domains: '["Fintech"]',
  preferredLocations: '["Paris"]',
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

const mockMissions = [
  {
    id: "m1",
    client: "Acme Corp",
    title: "Frontend Dev",
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    rate: 500,
    daysPerWeek: 5,
    status: "active",
    profileId: "p1",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  },
];

const mockLeads = {
  data: [
    {
      id: "l1",
      client: "Beta Inc",
      title: "Senior Dev",
      stage: "lead",
      matchScore: 85,
      source: "recruiter",
      autoFiltered: false,
      profileId: "p1",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
  ],
  pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
};

const mockForecast = {
  securedIncome: { total: 0, monthlyAvg: 0, missions: [] },
  pipelineIncome: { totalWeighted: 0, qualifiedValue: 0, negotiatingValue: 0 },
  monthlyProjection: [],
  alerts: [],
};

function setupSuccessMocks() {
  onInvoke("get_profile", () => mockProfile);
  onInvoke("list_missions", () => mockMissions);
  onInvoke("list_leads", () => mockLeads);
  onInvoke("get_dashboard_forecast", () => mockForecast);
}

describe("DashboardPage", () => {
  beforeEach(() => clearInvokeHandlers());
  afterEach(() => clearInvokeHandlers());

  it("shows loading then renders dashboard data", async () => {
    setupSuccessMocks();
    renderWithProviders(<DashboardPage />);

    // Initially shows loading
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // After data loads, shows welcome message
    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Alice/)).toBeInTheDocument();
    });
  });

  it("shows error state with retry on backend failure", async () => {
    onInvoke("get_profile", () => {
      throw "Connection failed";
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("retries successfully after error", async () => {
    let callCount = 0;
    onInvoke("get_profile", () => {
      callCount++;
      if (callCount === 1) throw "Connection failed";
      return mockProfile;
    });
    onInvoke("list_missions", () => mockMissions);
    onInvoke("list_leads", () => mockLeads);
    onInvoke("get_dashboard_forecast", () => mockForecast);

    renderWithProviders(<DashboardPage />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getAllByText(/Something went wrong/).length).toBeGreaterThan(0);
    });

    // Click retry (use first if multiple from StrictMode)
    const user = userEvent.setup();
    const retryButtons = screen.getAllByRole("button", { name: /retry/i });
    await user.click(retryButtons[0]);

    // Now dashboard should render
    await waitFor(() => {
      expect(screen.getAllByText(/Welcome back, Alice/).length).toBeGreaterThan(0);
    });
  });

  it('shows "Get Started" when no profile', async () => {
    onInvoke("get_profile", () => null);
    onInvoke("list_missions", () => []);
    onInvoke("list_leads", () => ({
      data: [],
      pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
    }));
    onInvoke("get_dashboard_forecast", () => mockForecast);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Get Started/)).toBeInTheDocument();
    });
  });
});
