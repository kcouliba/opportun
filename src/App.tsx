import { type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { ToastProvider } from "@/components/Toast";
import { AiQueueProvider } from "@/components/AiQueue";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CommandPalette from "@/components/CommandPalette";
import { useStartupAlerts } from "@/hooks/useStartupAlerts";
import DashboardPage from "@/pages/DashboardPage";
import LeadsPage from "@/pages/LeadsPage";
import NewLeadPage from "@/pages/NewLeadPage";
import QuickCapturePage from "@/pages/QuickCapturePage";
import LeadDetailPage from "@/pages/LeadDetailPage";
import MissionsPage from "@/pages/MissionsPage";
import NewMissionPage from "@/pages/NewMissionPage";
import MissionDetailPage from "@/pages/MissionDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import SettingsPage from "@/pages/SettingsPage";
import ActivitiesPage from "@/pages/ActivitiesPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import WatchSourcesPage from "@/pages/WatchSourcesPage";

function Page({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function StartupAlerts() {
  useStartupAlerts();
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <AiQueueProvider>
        <StartupAlerts />
        <CommandPalette />
        <div className="flex min-h-screen">
          <Navigation />
          <div className="flex-1 min-w-0 pb-16 md:pb-0 md:ml-16 lg:ml-55">
            <Routes>
              <Route path="/" element={<Page><DashboardPage /></Page>} />
              <Route path="/leads" element={<Page><LeadsPage /></Page>} />
              <Route path="/leads/new" element={<Page><NewLeadPage /></Page>} />
              <Route path="/leads/quick" element={<Page><QuickCapturePage /></Page>} />
              <Route path="/leads/:id" element={<Page><LeadDetailPage /></Page>} />
              <Route path="/missions" element={<Page><MissionsPage /></Page>} />
              <Route path="/missions/new" element={<Page><NewMissionPage /></Page>} />
              <Route path="/missions/:id" element={<Page><MissionDetailPage /></Page>} />
              <Route path="/profile" element={<Page><ProfilePage /></Page>} />
              <Route path="/settings" element={<Page><SettingsPage /></Page>} />
              <Route path="/activities" element={<Page><ActivitiesPage /></Page>} />
              <Route path="/sources" element={<Page><WatchSourcesPage /></Page>} />
              <Route path="/analytics" element={<Page><AnalyticsPage /></Page>} />
            </Routes>
          </div>
        </div>
      </AiQueueProvider>
    </ToastProvider>
  );
}
