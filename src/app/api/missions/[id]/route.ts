import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Fetch a single mission
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const mission = await prisma.mission.findUnique({
    where: { id },
  });

  if (!mission) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  return NextResponse.json(mission);
}

// PUT - Update a mission
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();

  const mission = await prisma.mission.update({
    where: { id },
    data: {
      client: data.client,
      title: data.title,
      description: data.description || null,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      rate: data.rate,
      daysPerWeek: data.daysPerWeek,
      status: data.status,
    },
  });

  return NextResponse.json(mission);
}

// DELETE - Delete a mission
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.mission.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
