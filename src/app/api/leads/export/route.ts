import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// Helper to escape CSV values
function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Parse JSON array string into comma-separated string
function parseJsonArray(jsonString: string | null): string {
  if (!jsonString) return "";
  try {
    const arr = JSON.parse(jsonString);
    if (Array.isArray(arr)) {
      return arr.join(", ");
    }
    return "";
  } catch {
    return "";
  }
}

// GET - Export leads as CSV
export async function GET(request: NextRequest) {
  // Optional API key authentication
  const authResult = await optionalAuth(
    request.headers.get("Authorization")
  );
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // Filtering (same as list endpoint)
  const stage = searchParams.get("stage");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const client = searchParams.get("client");
  const technology = searchParams.get("technology");
  const autoFiltered = searchParams.get("autoFiltered");
  const source = searchParams.get("source");

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

  // Fetch all leads matching filters (no pagination for export)
  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // CSV headers
  const headers = [
    "id",
    "client",
    "title",
    "description",
    "source",
    "stage",
    "location",
    "remotePolicy",
    "offeredRate",
    "estimatedStartDate",
    "estimatedDuration",
    "matchScore",
    "contactName",
    "contactInfo",
    "notes",
    "nextAction",
    "nextActionDate",
    "requiredTechnologies",
    "requiredDomains",
    "createdAt",
  ];

  // Build CSV content
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.join(","));

  // Data rows
  for (const lead of leads) {
    const row = [
      escapeCSV(lead.id),
      escapeCSV(lead.client),
      escapeCSV(lead.title),
      escapeCSV(lead.description),
      escapeCSV(lead.source),
      escapeCSV(lead.stage),
      escapeCSV(lead.location),
      escapeCSV(lead.remotePolicy),
      escapeCSV(lead.offeredRate?.toString()),
      escapeCSV(lead.estimatedStartDate?.toISOString().split("T")[0]),
      escapeCSV(lead.estimatedDuration?.toString()),
      escapeCSV(lead.matchScore?.toString()),
      escapeCSV(lead.contactName),
      escapeCSV(lead.contactInfo),
      escapeCSV(lead.notes),
      escapeCSV(lead.nextAction),
      escapeCSV(lead.nextActionDate?.toISOString().split("T")[0]),
      escapeCSV(parseJsonArray(lead.requiredTechnologies)),
      escapeCSV(parseJsonArray(lead.requiredDomains)),
      escapeCSV(lead.createdAt.toISOString()),
    ];
    csvRows.push(row.join(","));
  }

  const csvContent = csvRows.join("\n");

  // Generate filename with current date
  const date = new Date().toISOString().split("T")[0];
  const filename = `leads-export-${date}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}
