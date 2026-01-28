import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";

// PUT - Update an activity
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  // Verify activity exists
  const existing = await prisma.activity.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  // Validate activity type if provided
  if (data.type) {
    const validTypes = ["call", "email", "meeting", "interview", "note", "other"];
    if (!validTypes.includes(data.type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const activity = await prisma.activity.update({
    where: { id },
    data: {
      type: data.type !== undefined ? data.type : undefined,
      title: data.title !== undefined ? data.title : undefined,
      description: data.description !== undefined ? data.description : undefined,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
      duration: data.duration !== undefined ? data.duration : undefined,
    },
  });

  return NextResponse.json(activity);
}

// DELETE - Delete an activity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;

  // Verify activity exists
  const existing = await prisma.activity.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await prisma.activity.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
