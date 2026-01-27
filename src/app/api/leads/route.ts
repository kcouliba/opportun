import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateMatchScore } from "@/lib/matching";

// GET - Fetch all leads
export async function GET() {
  const leads = await prisma.lead.findMany({
    orderBy: [
      { stage: "asc" },
      { matchScore: "desc" },
      { createdAt: "desc" },
    ],
  });
  return NextResponse.json(leads);
}

// POST - Create a new lead
export async function POST(request: Request) {
  const data = await request.json();

  // Get the profile for matching
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json(
      { error: "No profile found. Please set up your profile first." },
      { status: 400 }
    );
  }

  // Parse profile arrays
  const profileData = {
    technologies: profile.technologies ? JSON.parse(profile.technologies) : [],
    domains: profile.domains ? JSON.parse(profile.domains) : [],
    minimumTJM: profile.minimumTJM,
    targetTJM: profile.targetTJM,
    preferredLocations: profile.preferredLocations ? JSON.parse(profile.preferredLocations) : [],
    blacklistedClients: profile.blacklistedClients ? JSON.parse(profile.blacklistedClients) : [],
    blacklistedDomains: profile.blacklistedDomains ? JSON.parse(profile.blacklistedDomains) : [],
  };

  // Parse lead arrays
  const leadData = {
    requiredTechnologies: data.requiredTechnologies ? JSON.parse(data.requiredTechnologies) : [],
    requiredDomains: data.requiredDomains ? JSON.parse(data.requiredDomains) : [],
    offeredRate: data.offeredRate,
    location: data.location,
    client: data.client,
  };

  // Calculate match score
  const { score, autoFiltered } = calculateMatchScore(profileData, leadData);

  const lead = await prisma.lead.create({
    data: {
      profileId: profile.id,
      client: data.client,
      title: data.title,
      description: data.description || null,
      source: data.source,
      sourceUrl: data.sourceUrl || null,
      location: data.location || null,
      remotePolicy: data.remotePolicy || null,
      offeredRate: data.offeredRate || null,
      estimatedStartDate: data.estimatedStartDate ? new Date(data.estimatedStartDate) : null,
      estimatedDuration: data.estimatedDuration || null,
      requiredTechnologies: data.requiredTechnologies || null,
      requiredDomains: data.requiredDomains || null,
      contactName: data.contactName || null,
      contactInfo: data.contactInfo || null,
      notes: data.notes || null,
      nextAction: data.nextAction || null,
      nextActionDate: data.nextActionDate ? new Date(data.nextActionDate) : null,
      matchScore: score,
      autoFiltered,
      stage: autoFiltered ? "lost" : "lead",
    },
  });

  return NextResponse.json(lead);
}
