import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { onInvoke, clearInvokeHandlers } from "@/test/tauri-mock";
import ProfilePage from "@/pages/ProfilePage";

const mockProfile = {
  id: "p1",
  name: "Alice Martin",
  title: "Fullstack Developer",
  yearsExperience: 8,
  legalStructure: "SASU",
  minimumTJM: 500,
  targetTJM: 650,
  preferredLocations: '["Paris","Remote"]',
  maxCommuteDays: 2,
  technologies: '["React","Node.js","PostgreSQL"]',
  domains: '["Fintech","SaaS"]',
  blacklistedClients: "[]",
  blacklistedDomains: "[]",
  bio: "Senior developer with 8 years experience",
  languages: '["French","English"]',
  education: "[]",
  contentLanguage: "FR",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

describe("ProfilePage", () => {
  beforeEach(() => clearInvokeHandlers());
  afterEach(() => clearInvokeHandlers());

  it("renders empty form when no profile", async () => {
    onInvoke("get_profile", () => null);

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Your Profile")).toBeInTheDocument();
    });

    // Save button should be present (form rendered)
    expect(screen.getByText("Save Profile")).toBeInTheDocument();
  });

  it("populates form with existing profile data", async () => {
    onInvoke("get_profile", () => mockProfile);

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice Martin")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Fullstack Developer")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    onInvoke("get_profile", () => {
      throw "Database error";
    });

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
