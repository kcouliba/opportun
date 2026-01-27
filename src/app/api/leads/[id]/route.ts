import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateMatchScore } from "@/lib/matching";

// GET - Fetch a single lead
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { documents: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead);
}

// PUT - Update a lead
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();

  // Get profile for recalculating match score
  const profile = await prisma.profile.findFirst();

  let matchScore = null;
  let autoFiltered = false;

  if (profile) {
    const profileData = {
      technologies: profile.technologies ? JSON.parse(profile.technologies) : [],
      domains: profile.domains ? JSON.parse(profile.domains) : [],
      minimumTJM: profile.minimumTJM,
      targetTJM: profile.targetTJM,
      preferredLocations: profile.preferredLocations ? JSON.parse(profile.preferredLocations) : [],
      blacklistedClients: profile.blacklistedClients ? JSON.parse(profile.blacklistedClients) : [],
      blacklistedDomains: profile.blacklistedDomains ? JSON.parse(profile.blacklistedDomains) : [],
    };

    const leadData = {
      requiredTechnologies: data.requiredTechnologies ? JSON.parse(data.requiredTechnologies) : [],
      requiredDomains: data.requiredDomains ? JSON.parse(data.requiredDomains) : [],
      offeredRate: data.offeredRate,
      location: data.location,
      client: data.client,
    };

    const result = calculateMatchScore(profileData, leadData);
    matchScore = result.score;
    autoFiltered = result.autoFiltered;
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      client: data.client,
      title: data.title,
      description: data.description,
      source: data.source,
      sourceUrl: data.sourceUrl,
      location: data.location,
      remotePolicy: data.remotePolicy,
      offeredRate: data.offeredRate,
      estimatedStartDate: data.estimatedStartDate ? new Date(data.estimatedStartDate) : null,
      estimatedDuration: data.estimatedDuration,
      requiredTechnologies: data.requiredTechnologies,
      requiredDomains: data.requiredDomains,
      contactName: data.contactName,
      contactInfo: data.contactInfo,
      notes: data.notes,
      stage: data.stage,
      nextAction: data.nextAction,
      nextActionDate: data.nextActionDate ? new Date(data.nextActionDate) : null,
      matchScore,
      autoFiltered,
    },
  });

  return NextResponse.json(lead);
}

// DELETE - Delete a lead
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
