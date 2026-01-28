import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateMatchScore } from "@/lib/matching";
import { optionalAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// GET - Fetch leads with filtering, pagination, and sorting
export async function GET(request: NextRequest) {
  // Optional API key authentication
  const authResult = await optionalAuth(
    request.headers.get("Authorization")
  );
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // Full-text search
  const q = searchParams.get("q");

  // Filtering
  const stage = searchParams.get("stage");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const client = searchParams.get("client");
  const technology = searchParams.get("technology");
  const autoFiltered = searchParams.get("autoFiltered");
  const source = searchParams.get("source");

  // Pagination
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Sorting
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";

  // Build where clause
  const where: Prisma.LeadWhereInput = {};

  if (stage) {
    where.stage = stage;
  }

  if (minScore) {
    where.matchScore = { ...where.matchScore as object, gte: parseInt(minScore, 10) };
  }

  if (maxScore) {
    where.matchScore = { ...where.matchScore as object, lte: parseInt(maxScore, 10) };
  }

  if (client) {
    where.client = { contains: client };
  }

  if (technology) {
    where.requiredTechnologies = { contains: technology };
  }

  if (autoFiltered !== null && autoFiltered !== undefined && autoFiltered !== "") {
    where.autoFiltered = autoFiltered === "true";
  }

  if (source) {
    where.source = source;
  }

  // Valid sort fields
  const validSortFields = [
    "createdAt",
    "updatedAt",
    "matchScore",
    "client",
    "title",
    "stage",
    "offeredRate",
  ];
  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";

  // Helper function for case-insensitive search filtering
  const matchesSearch = (lead: {
    client: string;
    title: string;
    description: string | null;
    notes: string | null;
    contactName: string | null;
    contactInfo: string | null;
  }, searchTerm: string): boolean => {
    const term = searchTerm.toLowerCase();
    const searchFields = [
      lead.client,
      lead.title,
      lead.description,
      lead.notes,
      lead.contactName,
      lead.contactInfo,
    ];
    return searchFields.some(
      (field) => field && field.toLowerCase().includes(term)
    );
  };

  // Fetch all leads matching the where clause first
  let allLeads = await prisma.lead.findMany({
    where,
    orderBy: { [actualSortBy]: sortOrder },
  });

  // Apply full-text search filter in memory for case-insensitive matching
  // (SQLite's contains is case-sensitive)
  if (q) {
    allLeads = allLeads.filter((lead) => matchesSearch(lead, q));
  }

  // Calculate total after search filtering
  const total = allLeads.length;

  // Apply pagination to filtered results
  const leads = allLeads.slice(offset, offset + limit);

  return NextResponse.json({
    data: leads,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + leads.length < total,
    },
  });
}

// POST - Create a new lead
export async function POST(request: NextRequest) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

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
