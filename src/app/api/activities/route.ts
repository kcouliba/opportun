import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";

// GET - List activities across all leads
export async function GET(request: NextRequest) {
  const authResult = await optionalAuth(request.headers.get("Authorization"));
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Pagination
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Filtering by type
  const type = searchParams.get("type");
  const validTypes = ["call", "email", "meeting", "interview", "note", "other"];

  // Date range filtering
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Build where clause
  const where: {
    type?: string;
    occurredAt?: { gte?: Date; lte?: Date };
  } = {};

  if (type && validTypes.includes(type)) {
    where.type = type;
  }

  if (from || to) {
    where.occurredAt = {};
    if (from) {
      where.occurredAt.gte = new Date(from);
    }
    if (to) {
      where.occurredAt.lte = new Date(to);
    }
  }

  // Get total count for pagination
  const total = await prisma.activity.count({ where });

  // Fetch activities with lead info
  const activities = await prisma.activity.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    skip: offset,
    take: limit,
    include: {
      lead: {
        select: {
          id: true,
          client: true,
          title: true,
        },
      },
    },
  });

  return NextResponse.json({
    data: activities,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total,
    },
  });
}
