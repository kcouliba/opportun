import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";

interface LeadWithDates {
  id: string;
  stage: string;
  source: string;
  matchScore: number | null;
  offeredRate: number | null;
  estimatedDuration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// GET - Analytics and reporting metrics
export async function GET(request: NextRequest) {
  // Optional API key authentication
  const authResult = await optionalAuth(
    request.headers.get("Authorization")
  );
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const leads = await prisma.lead.findMany() as LeadWithDates[];

  // Count by stage
  const stageCounts = {
    lead: 0,
    qualified: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
  };

  // Count by source
  const sourceCounts: Record<string, number> = {};

  // Match scores by stage
  const matchScoresByStage: Record<string, number[]> = {
    lead: [],
    qualified: [],
    negotiating: [],
    won: [],
    lost: [],
  };

  // For time in stage calculation (simplified: using days since creation for current stage)
  const timeInStage: Record<string, number[]> = {
    lead: [],
    qualified: [],
    negotiating: [],
    won: [],
    lost: [],
  };

  let totalPipelineValue = 0;

  const now = new Date();

  for (const lead of leads) {
    // Count by stage
    if (lead.stage in stageCounts) {
      stageCounts[lead.stage as keyof typeof stageCounts]++;
    }

    // Count by source
    sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1;

    // Match scores by stage
    if (lead.matchScore !== null && lead.stage in matchScoresByStage) {
      matchScoresByStage[lead.stage].push(lead.matchScore);
    }

    // Time in current stage (days since last update or creation)
    if (lead.stage in timeInStage) {
      const daysInStage = Math.floor(
        (now.getTime() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      timeInStage[lead.stage].push(daysInStage);
    }

    // Pipeline value (for active leads: lead, qualified, negotiating)
    if (
      lead.stage !== "won" &&
      lead.stage !== "lost" &&
      lead.offeredRate &&
      lead.estimatedDuration
    ) {
      // Estimate: rate * working days per month (20) * duration in months
      totalPipelineValue += lead.offeredRate * 20 * lead.estimatedDuration;
    }
  }

  // Calculate conversion rates
  const totalNotLost = stageCounts.lead + stageCounts.qualified + stageCounts.negotiating + stageCounts.won;
  const leadsToQualified = totalNotLost > 0
    ? ((stageCounts.qualified + stageCounts.negotiating + stageCounts.won) / totalNotLost) * 100
    : 0;

  const qualifiedPool = stageCounts.qualified + stageCounts.negotiating + stageCounts.won;
  const qualifiedToNegotiating = qualifiedPool > 0
    ? ((stageCounts.negotiating + stageCounts.won) / qualifiedPool) * 100
    : 0;

  const negotiatingPool = stageCounts.negotiating + stageCounts.won;
  const negotiatingToWon = negotiatingPool > 0
    ? (stageCounts.won / negotiatingPool) * 100
    : 0;

  // Win rate: won / (won + lost)
  const completedDeals = stageCounts.won + stageCounts.lost;
  const winRate = completedDeals > 0
    ? (stageCounts.won / completedDeals) * 100
    : 0;

  // Calculate average time in each stage
  const avgTimeInStage: Record<string, number | null> = {};
  for (const [stage, times] of Object.entries(timeInStage)) {
    avgTimeInStage[stage] = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null;
  }

  // Calculate average match score by stage
  const avgMatchScoreByStage: Record<string, number | null> = {};
  for (const [stage, scores] of Object.entries(matchScoresByStage)) {
    avgMatchScoreByStage[stage] = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  }

  // Monthly lead count (last 6 months)
  const monthlyLeadCount: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    const count = leads.filter((lead) => {
      const createdAt = new Date(lead.createdAt);
      return createdAt >= monthStart && createdAt <= monthEnd;
    }).length;

    const monthName = date.toLocaleString("default", { month: "short" });
    monthlyLeadCount.push({ month: `${monthName} ${year}`, count });
  }

  // Sort sources by count
  const sourceBreakdown = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    conversionRates: {
      leadToQualified: Math.round(leadsToQualified * 10) / 10,
      qualifiedToNegotiating: Math.round(qualifiedToNegotiating * 10) / 10,
      negotiatingToWon: Math.round(negotiatingToWon * 10) / 10,
    },
    winRate: Math.round(winRate * 10) / 10,
    avgTimeInStage,
    totalPipelineValue,
    sourceBreakdown,
    avgMatchScoreByStage,
    monthlyLeadCount,
    stageCounts,
    totalLeads: leads.length,
  });
}
