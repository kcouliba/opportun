import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
