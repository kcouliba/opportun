import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Fetch the profile (we assume single user for MVP)
export async function GET() {
  const profile = await prisma.profile.findFirst();
  return NextResponse.json(profile);
}

// POST - Create a new profile
export async function POST(request: Request) {
  const data = await request.json();

  // Delete existing profile if any (single user MVP)
  await prisma.profile.deleteMany();

  const profile = await prisma.profile.create({
    data: {
      name: data.name,
      title: data.title || null,
      yearsExperience: data.yearsExperience || null,
      legalStructure: data.legalStructure || null,
      minimumTJM: data.minimumTJM || null,
      targetTJM: data.targetTJM || null,
      preferredLocations: data.preferredLocations || null,
      maxCommuteDays: data.maxCommuteDays || null,
      technologies: data.technologies || null,
      domains: data.domains || null,
      blacklistedClients: data.blacklistedClients || null,
      blacklistedDomains: data.blacklistedDomains || null,
    },
  });

  return NextResponse.json(profile);
}

// PUT - Update existing profile
export async function PUT(request: Request) {
  const data = await request.json();

  const profile = await prisma.profile.update({
    where: { id: data.id },
    data: {
      name: data.name,
      title: data.title || null,
      yearsExperience: data.yearsExperience || null,
      legalStructure: data.legalStructure || null,
      minimumTJM: data.minimumTJM || null,
      targetTJM: data.targetTJM || null,
      preferredLocations: data.preferredLocations || null,
      maxCommuteDays: data.maxCommuteDays || null,
      technologies: data.technologies || null,
      domains: data.domains || null,
      blacklistedClients: data.blacklistedClients || null,
      blacklistedDomains: data.blacklistedDomains || null,
    },
  });

  return NextResponse.json(profile);
}
