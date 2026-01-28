import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";

// GET - List activities for a lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;

  // Verify lead exists
  const lead = await prisma.lead.findUnique({
    where: { id },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const activities = await prisma.activity.findMany({
    where: { leadId: id },
    orderBy: { occurredAt: "desc" },
  });

  return NextResponse.json(activities);
}

// POST - Create a new activity for a lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  // Verify lead exists
  const lead = await prisma.lead.findUnique({
    where: { id },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Validate required fields
  if (!data.type || !data.title) {
    return NextResponse.json(
      { error: "type and title are required" },
      { status: 400 }
    );
  }

  // Validate activity type
  const validTypes = ["call", "email", "meeting", "interview", "note", "other"];
  if (!validTypes.includes(data.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const activity = await prisma.activity.create({
    data: {
      type: data.type,
      title: data.title,
      description: data.description || null,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      duration: data.duration || null,
      leadId: id,
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
