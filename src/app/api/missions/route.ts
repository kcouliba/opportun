import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Fetch all missions
export async function GET() {
  const missions = await prisma.mission.findMany({
    orderBy: [
      { status: "asc" },
      { startDate: "desc" },
    ],
  });
  return NextResponse.json(missions);
}

// POST - Create a new mission
export async function POST(request: Request) {
  const data = await request.json();

  // Get the profile
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json(
      { error: "No profile found. Please set up your profile first." },
      { status: 400 }
    );
  }

  const mission = await prisma.mission.create({
    data: {
      profileId: profile.id,
      client: data.client,
      title: data.title,
      description: data.description || null,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      rate: data.rate,
      daysPerWeek: data.daysPerWeek || 5,
      status: "active",
    },
  });

  return NextResponse.json(mission);
}
