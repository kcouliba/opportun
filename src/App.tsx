import { Routes, Route } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { ToastProvider } from "@/components/Toast";
import DashboardPage from "@/pages/DashboardPage";
import LeadsPage from "@/pages/LeadsPage";
import NewLeadPage from "@/pages/NewLeadPage";
import QuickCapturePage from "@/pages/QuickCapturePage";
import LeadDetailPage from "@/pages/LeadDetailPage";
import MissionsPage from "@/pages/MissionsPage";
import NewMissionPage from "@/pages/NewMissionPage";
import MissionDetailPage from "@/pages/MissionDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import ActivitiesPage from "@/pages/ActivitiesPage";
import AnalyticsPage from "@/pages/AnalyticsPage";

export default function App() {
  return (
    <ToastProvider>
      <Navigation />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/new" element={<NewLeadPage />} />
        <Route path="/leads/quick" element={<QuickCapturePage />} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/missions/new" element={<NewMissionPage />} />
        <Route path="/missions/:id" element={<MissionDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </ToastProvider>
  );
}
