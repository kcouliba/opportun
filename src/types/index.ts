// Shared types for the Opportun application

export interface Profile {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  title: string | null;
  yearsExperience: number | null;
  legalStructure: string | null;
  minimumTJM: number | null;
  targetTJM: number | null;
  preferredLocations: string | null; // JSON array
  maxCommuteDays: number | null;
  technologies: string | null; // JSON array
  domains: string | null; // JSON array
  blacklistedClients: string | null; // JSON array
  blacklistedDomains: string | null; // JSON array
}

export interface Mission {
  id: string;
  createdAt: string;
  updatedAt: string;
  client: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  rate: number;
  daysPerWeek: number;
  status: string;
  profileId: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  sourceUrl: string | null;
  client: string;
  title: string;
  description: string | null;
  requiredTechnologies: string | null; // JSON array
  requiredDomains: string | null; // JSON array
  location: string | null;
  remotePolicy: string | null;
  offeredRate: number | null;
  estimatedRevenue: number | null;
  estimatedStartDate: string | null;
  estimatedDuration: number | null;
  stage: string;
  matchScore: number | null;
  autoFiltered: boolean;
  notes: string | null;
  contactName: string | null;
  contactInfo: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  profileId: string;
}

export interface LeadWithRelations extends Lead {
  documents: Document[];
  activities: Activity[];
}

export interface Document {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  content: string;
  version: number;
  leadId: string;
}

export interface Activity {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  duration: number | null;
  leadId: string;
}

export interface ActivityWithLead extends Activity {
  lead: {
    id: string;
    client: string;
    title: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface LeadStats {
  total: number;
  byStage: Record<string, number>;
  activeLeads: number;
  autoFiltered: number;
  averageMatchScore: number | null;
  totalEstimatedRevenue: number;
  highValueLeads: number;
  actions: {
    overdue: number;
    upcoming: number;
  };
}

export interface AnalyticsData {
  conversionRates: {
    leadToQualified: number;
    qualifiedToNegotiating: number;
    negotiatingToWon: number;
  };
  winRate: number;
  avgTimeInStage: Record<string, number | null>;
  totalPipelineValue: number;
  sourceBreakdown: { source: string; count: number }[];
  avgMatchScoreByStage: Record<string, number | null>;
  monthlyLeadCount: { month: string; count: number }[];
  stageCounts: Record<string, number>;
  totalLeads: number;
}

export interface DashboardData {
  hasProfile: boolean;
  profileName: string | null;
  activeMission: Mission | null;
  daysUntilEnd: number | null;
  pipelineCount: number;
  qualifiedCount: number;
  highMatchCount: number;
  recentLeads: Lead[];
  followUps: FollowUpLead[];
  overdueCount: number;
  todayCount: number;
  totalFollowUps: number;
}

export interface FollowUpLead extends Lead {
  isOverdue: boolean;
  isToday: boolean;
  daysUntil: number;
}
