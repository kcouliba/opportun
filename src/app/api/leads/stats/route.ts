import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";

// GET - Pipeline statistics
export async function GET(request: NextRequest) {
  // Optional API key authentication
  const authResult = await optionalAuth(
    request.headers.get("Authorization")
  );
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const leads = await prisma.lead.findMany();

  // Count by stage
  const byStage = {
    lead: 0,
    qualified: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
  };

  let totalMatchScore = 0;
  let matchScoreCount = 0;
  let totalEstimatedRevenue = 0;
  let autoFilteredCount = 0;
  let activeLeadsCount = 0;

  for (const lead of leads) {
    // Count by stage
    if (lead.stage in byStage) {
      byStage[lead.stage as keyof typeof byStage]++;
    }

    // Match score average (exclude nulls)
    if (lead.matchScore !== null) {
      totalMatchScore += lead.matchScore;
      matchScoreCount++;
    }

    // Estimated revenue (from won or negotiating leads)
    if (
      (lead.stage === "won" || lead.stage === "negotiating") &&
      lead.estimatedRevenue
    ) {
      totalEstimatedRevenue += lead.estimatedRevenue;
    }

    // Auto-filtered count
    if (lead.autoFiltered) {
      autoFilteredCount++;
    }

    // Active leads (not won or lost)
    if (lead.stage !== "won" && lead.stage !== "lost") {
      activeLeadsCount++;
    }
  }

  // Leads with upcoming actions
  const leadsWithNextAction = leads.filter(
    (l) =>
      l.nextActionDate &&
      l.stage !== "won" &&
      l.stage !== "lost"
  );

  const now = new Date();
  const overdueActions = leadsWithNextAction.filter(
    (l) => l.nextActionDate && l.nextActionDate < now
  ).length;

  const upcomingActions = leadsWithNextAction.filter(
    (l) => l.nextActionDate && l.nextActionDate >= now
  ).length;

  // High-value leads (score >= 70, not won/lost)
  const highValueLeads = leads.filter(
    (l) =>
      l.matchScore !== null &&
      l.matchScore >= 70 &&
      l.stage !== "won" &&
      l.stage !== "lost"
  ).length;

  return NextResponse.json({
    total: leads.length,
    byStage,
    activeLeads: activeLeadsCount,
    autoFiltered: autoFilteredCount,
    averageMatchScore:
      matchScoreCount > 0 ? Math.round(totalMatchScore / matchScoreCount) : null,
    totalEstimatedRevenue,
    highValueLeads,
    actions: {
      overdue: overdueActions,
      upcoming: upcomingActions,
    },
  });
}
