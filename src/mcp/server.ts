#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod";
import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { calculateMatchScore } from "../lib/matching";

// Open the same SQLite database that the Tauri app uses
const dbPath =
  process.env.OPPORTUN_DB_PATH ||
  join(
    homedir(),
    ".local/share/com.opportun.app/opportun.db"
  );

let db: Database.Database;
try {
  db = new Database(dbPath, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error(`Failed to open database at ${dbPath}:`, err);
  process.exit(1);
}

// Helper: parse JSON array from DB column
function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

// Create server
const server = new McpServer({
  name: "opportun-leads",
  version: "2.0.0",
});

// Tool: List leads
server.tool(
  "list_leads",
  "List leads from the pipeline with optional filtering",
  {
    stage: z
      .enum(["lead", "qualified", "negotiating", "won", "lost"])
      .optional()
      .describe("Filter by pipeline stage"),
    minScore: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Minimum match score (0-100)"),
    maxScore: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Maximum match score (0-100)"),
    client: z
      .string()
      .optional()
      .describe("Filter by client name (partial match)"),
    technology: z
      .string()
      .optional()
      .describe("Filter by required technology"),
    autoFiltered: z
      .boolean()
      .optional()
      .describe("Filter by auto-filtered status"),
    source: z.string().optional().describe("Filter by source"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results (default: 100)"),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe("Offset for pagination"),
    sortBy: z
      .enum([
        "createdAt",
        "updatedAt",
        "matchScore",
        "client",
        "title",
        "stage",
        "offeredRate",
      ])
      .optional()
      .describe("Field to sort by (default: createdAt)"),
    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Sort order (default: desc)"),
  },
  async (params) => {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.stage) {
      conditions.push('"stage" = ?');
      values.push(params.stage);
    }
    if (params.minScore !== undefined) {
      conditions.push('"matchScore" >= ?');
      values.push(params.minScore);
    }
    if (params.maxScore !== undefined) {
      conditions.push('"matchScore" <= ?');
      values.push(params.maxScore);
    }
    if (params.client) {
      conditions.push('"client" LIKE ?');
      values.push(`%${params.client}%`);
    }
    if (params.technology) {
      conditions.push('"requiredTechnologies" LIKE ?');
      values.push(`%${params.technology}%`);
    }
    if (params.autoFiltered !== undefined) {
      conditions.push('"autoFiltered" = ?');
      values.push(params.autoFiltered ? 1 : 0);
    }
    if (params.source) {
      conditions.push('"source" = ?');
      values.push(params.source);
    }

    const where = conditions.length
      ? ` WHERE ${conditions.join(" AND ")}`
      : "";
    const sortBy = params.sortBy || "createdAt";
    const sortOrder =
      params.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM "Lead"${where}`)
      .get(...values) as { total: number };

    const rows = db
      .prepare(
        `SELECT * FROM "Lead"${where} ORDER BY "${sortBy}" ${sortOrder} LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset);

    const result = {
      data: rows,
      pagination: {
        total: countRow.total,
        limit,
        offset,
        hasMore: offset + limit < countRow.total,
      },
    };

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

// Tool: Get a single lead
server.tool(
  "get_lead",
  "Get detailed information about a specific lead including documents and activities",
  {
    id: z.string().describe("The lead ID"),
  },
  async ({ id }) => {
    const lead = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);
    if (!lead) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    const documents = db
      .prepare('SELECT * FROM "Document" WHERE "leadId" = ?')
      .all(id);
    const activities = db
      .prepare(
        'SELECT * FROM "Activity" WHERE "leadId" = ? ORDER BY "occurredAt" DESC'
      )
      .all(id);

    const result = { ...lead, documents, activities };
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

// Tool: Create a lead
server.tool(
  "create_lead",
  "Create a new lead in the pipeline",
  {
    client: z.string().describe("Company/client name"),
    title: z.string().describe("Opportunity title"),
    source: z.string().describe("Lead source"),
    description: z.string().optional().describe("Detailed description"),
    sourceUrl: z.string().url().optional().describe("URL to original posting"),
    location: z.string().optional().describe("Work location"),
    remotePolicy: z
      .enum(["remote", "hybrid", "onsite"])
      .optional()
      .describe("Remote work policy"),
    offeredRate: z
      .number()
      .optional()
      .describe("Offered daily rate (TJM) in euros"),
    estimatedStartDate: z
      .string()
      .optional()
      .describe("Expected start date (ISO format)"),
    estimatedDuration: z
      .number()
      .optional()
      .describe("Estimated duration in months"),
    requiredTechnologies: z
      .array(z.string())
      .optional()
      .describe("Required technologies"),
    requiredDomains: z
      .array(z.string())
      .optional()
      .describe("Required industry domains"),
    contactName: z.string().optional().describe("Contact person name"),
    contactInfo: z.string().optional().describe("Contact email/phone"),
    notes: z.string().optional().describe("Additional notes"),
    nextAction: z.string().optional().describe("Next action to take"),
    nextActionDate: z
      .string()
      .optional()
      .describe("Date for next action (ISO format)"),
  },
  async (params) => {
    // Get profile
    const profile = db
      .prepare("SELECT * FROM Profile LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    if (!profile) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No profile found. Please set up your profile first.",
          },
        ],
        isError: true,
      };
    }

    const techsJson = params.requiredTechnologies
      ? JSON.stringify(params.requiredTechnologies)
      : null;
    const domainsJson = params.requiredDomains
      ? JSON.stringify(params.requiredDomains)
      : null;

    // Calculate match score
    const matchResult = calculateMatchScore(
      {
        technologies: parseJsonArray(profile.technologies as string),
        domains: parseJsonArray(profile.domains as string),
        minimumTJM: profile.minimumTJM as number | null,
        targetTJM: profile.targetTJM as number | null,
        preferredLocations: parseJsonArray(
          profile.preferredLocations as string
        ),
        blacklistedClients: parseJsonArray(
          profile.blacklistedClients as string
        ),
        blacklistedDomains: parseJsonArray(
          profile.blacklistedDomains as string
        ),
      },
      {
        requiredTechnologies: params.requiredTechnologies || [],
        requiredDomains: params.requiredDomains || [],
        offeredRate: params.offeredRate ?? null,
        location: params.location ?? null,
        client: params.client,
      }
    );

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const autoFiltered = matchResult.autoFiltered;
    const stage = autoFiltered ? "lost" : "lead";
    const estimatedRevenue =
      params.offeredRate && params.estimatedDuration
        ? params.offeredRate * 20 * params.estimatedDuration
        : null;

    db.prepare(
      `INSERT INTO "Lead" (
        "id", "createdAt", "updatedAt", "source", "sourceUrl",
        "client", "title", "description", "requiredTechnologies", "requiredDomains",
        "location", "remotePolicy", "offeredRate", "estimatedRevenue",
        "estimatedStartDate", "estimatedDuration", "stage", "matchScore", "autoFiltered",
        "notes", "contactName", "contactInfo", "nextAction", "nextActionDate", "profileId"
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )`
    ).run(
      id,
      now,
      now,
      params.source,
      params.sourceUrl || null,
      params.client,
      params.title,
      params.description || null,
      techsJson,
      domainsJson,
      params.location || null,
      params.remotePolicy || null,
      params.offeredRate || null,
      estimatedRevenue,
      params.estimatedStartDate || null,
      params.estimatedDuration || null,
      stage,
      matchResult.score,
      autoFiltered ? 1 : 0,
      params.notes || null,
      params.contactName || null,
      params.contactInfo || null,
      params.nextAction || null,
      params.nextActionDate || null,
      profile.id as string
    );

    const created = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(created, null, 2) },
      ],
    };
  }
);

// Tool: Update a lead
server.tool(
  "update_lead",
  "Update an existing lead",
  {
    id: z.string().describe("The lead ID to update"),
    client: z.string().optional().describe("Company/client name"),
    title: z.string().optional().describe("Opportunity title"),
    source: z.string().optional().describe("Lead source"),
    description: z.string().optional().describe("Detailed description"),
    sourceUrl: z.string().optional().describe("URL to original posting"),
    location: z.string().optional().describe("Work location"),
    remotePolicy: z
      .enum(["remote", "hybrid", "onsite"])
      .optional()
      .describe("Remote work policy"),
    offeredRate: z
      .number()
      .optional()
      .describe("Offered daily rate (TJM) in euros"),
    estimatedStartDate: z
      .string()
      .optional()
      .describe("Expected start date (ISO format)"),
    estimatedDuration: z
      .number()
      .optional()
      .describe("Estimated duration in months"),
    requiredTechnologies: z
      .array(z.string())
      .optional()
      .describe("Required technologies"),
    requiredDomains: z
      .array(z.string())
      .optional()
      .describe("Required industry domains"),
    contactName: z.string().optional().describe("Contact person name"),
    contactInfo: z.string().optional().describe("Contact email/phone"),
    notes: z.string().optional().describe("Additional notes"),
    stage: z
      .enum(["lead", "qualified", "negotiating", "won", "lost"])
      .optional()
      .describe("Pipeline stage"),
    nextAction: z.string().optional().describe("Next action to take"),
    nextActionDate: z
      .string()
      .optional()
      .describe("Date for next action (ISO format)"),
  },
  async (params) => {
    const { id, ...updateData } = params;

    const existing = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    // Merge updates
    const merged = { ...existing };
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        if (key === "requiredTechnologies" || key === "requiredDomains") {
          (merged as Record<string, unknown>)[key] = JSON.stringify(value);
        } else {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
    }

    const now = new Date().toISOString();

    db.prepare(
      `UPDATE "Lead" SET
        "updatedAt" = ?, "client" = ?, "title" = ?, "description" = ?,
        "source" = ?, "sourceUrl" = ?, "location" = ?, "remotePolicy" = ?,
        "offeredRate" = ?, "estimatedStartDate" = ?, "estimatedDuration" = ?,
        "requiredTechnologies" = ?, "requiredDomains" = ?,
        "contactName" = ?, "contactInfo" = ?, "notes" = ?,
        "stage" = ?, "nextAction" = ?, "nextActionDate" = ?
      WHERE "id" = ?`
    ).run(
      now,
      merged.client,
      merged.title,
      merged.description,
      merged.source,
      merged.sourceUrl,
      merged.location,
      merged.remotePolicy,
      merged.offeredRate,
      merged.estimatedStartDate,
      merged.estimatedDuration,
      merged.requiredTechnologies,
      merged.requiredDomains,
      merged.contactName,
      merged.contactInfo,
      merged.notes,
      merged.stage,
      merged.nextAction,
      merged.nextActionDate,
      id
    );

    const updated = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(updated, null, 2) },
      ],
    };
  }
);

// Tool: Delete a lead
server.tool(
  "delete_lead",
  "Delete a lead from the pipeline",
  {
    id: z.string().describe("The lead ID to delete"),
  },
  async ({ id }) => {
    const result = db
      .prepare('DELETE FROM "Lead" WHERE "id" = ?')
      .run(id);

    if (result.changes === 0) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ deleted: true }) },
      ],
    };
  }
);

// Tool: Get pipeline stats
server.tool(
  "get_pipeline_stats",
  "Get statistics about the lead pipeline",
  {},
  async () => {
    const leads = db.prepare('SELECT * FROM "Lead"').all() as Record<
      string,
      unknown
    >[];

    const stageCounts: Record<string, number> = {
      lead: 0,
      qualified: 0,
      negotiating: 0,
      won: 0,
      lost: 0,
    };
    let autoFilteredCount = 0;
    let totalScore = 0;
    let scoreCount = 0;
    let totalRevenue = 0;

    for (const lead of leads) {
      const stage = lead.stage as string;
      if (stage in stageCounts) stageCounts[stage]++;
      if (lead.autoFiltered) autoFilteredCount++;
      if (lead.matchScore != null) {
        totalScore += lead.matchScore as number;
        scoreCount++;
      }
      if (
        (stage === "won" || stage === "negotiating") &&
        lead.estimatedRevenue
      ) {
        totalRevenue += lead.estimatedRevenue as number;
      }
    }

    const result = {
      total: leads.length,
      byStage: stageCounts,
      activeLeads:
        leads.length - stageCounts.won - stageCounts.lost,
      autoFiltered: autoFilteredCount,
      averageMatchScore:
        scoreCount > 0 ? Math.round(totalScore / scoreCount) : null,
      totalEstimatedRevenue: totalRevenue,
    };

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

// Tool: Move lead to stage
server.tool(
  "move_lead_stage",
  "Move a lead to a different pipeline stage",
  {
    id: z.string().describe("The lead ID"),
    stage: z
      .enum(["lead", "qualified", "negotiating", "won", "lost"])
      .describe("The new stage"),
  },
  async ({ id, stage }) => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        'UPDATE "Lead" SET "stage" = ?, "updatedAt" = ? WHERE "id" = ?'
      )
      .run(stage, now, id);

    if (result.changes === 0) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    const updated = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(updated, null, 2) },
      ],
    };
  }
);

// Tool: Add note to lead
server.tool(
  "add_lead_note",
  "Add or update notes for a lead",
  {
    id: z.string().describe("The lead ID"),
    notes: z
      .string()
      .describe("Notes to add (will replace existing notes)"),
  },
  async ({ id, notes }) => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        'UPDATE "Lead" SET "notes" = ?, "updatedAt" = ? WHERE "id" = ?'
      )
      .run(notes, now, id);

    if (result.changes === 0) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    const updated = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(updated, null, 2) },
      ],
    };
  }
);

// Tool: Set next action
server.tool(
  "set_next_action",
  "Set the next action for a lead",
  {
    id: z.string().describe("The lead ID"),
    nextAction: z
      .string()
      .describe("Description of the next action to take"),
    nextActionDate: z
      .string()
      .optional()
      .describe("Due date for the action (ISO format)"),
  },
  async ({ id, nextAction, nextActionDate }) => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        'UPDATE "Lead" SET "nextAction" = ?, "nextActionDate" = ?, "updatedAt" = ? WHERE "id" = ?'
      )
      .run(nextAction, nextActionDate || null, now, id);

    if (result.changes === 0) {
      return {
        content: [{ type: "text" as const, text: "Lead not found" }],
        isError: true,
      };
    }

    const updated = db
      .prepare('SELECT * FROM "Lead" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(updated, null, 2) },
      ],
    };
  }
);

// =============================================================================
// ACTIVITY TOOLS
// =============================================================================

// Tool: List activities for a lead
server.tool(
  "list_activities",
  "List all activities for a specific lead",
  {
    leadId: z
      .string()
      .describe("The lead ID to get activities for"),
  },
  async ({ leadId }) => {
    const activities = db
      .prepare(
        'SELECT * FROM "Activity" WHERE "leadId" = ? ORDER BY "occurredAt" DESC'
      )
      .all(leadId);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(activities, null, 2),
        },
      ],
    };
  }
);

// Tool: Add activity to a lead
server.tool(
  "add_activity",
  "Add a new activity (call, email, meeting, interview, note, other) to a lead",
  {
    leadId: z
      .string()
      .describe("The lead ID to add activity to"),
    type: z
      .enum([
        "call",
        "email",
        "meeting",
        "interview",
        "follow_up",
        "note",
        "other",
      ])
      .describe("Type of activity"),
    title: z.string().describe("Brief description of the activity"),
    description: z
      .string()
      .optional()
      .describe("Detailed notes about the activity"),
    occurredAt: z
      .string()
      .optional()
      .describe("When it happened (ISO format, defaults to now)"),
    duration: z
      .number()
      .optional()
      .describe("Duration in minutes (for calls/meetings)"),
  },
  async ({ leadId, type, title, description, occurredAt, duration }) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO "Activity" ("id", "createdAt", "updatedAt", "type", "title", "description", "occurredAt", "duration", "leadId")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      now,
      now,
      type,
      title,
      description || null,
      occurredAt || now,
      duration || null,
      leadId
    );

    const created = db
      .prepare('SELECT * FROM "Activity" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(created, null, 2) },
      ],
    };
  }
);

// Tool: Update an activity
server.tool(
  "update_activity",
  "Update an existing activity",
  {
    id: z.string().describe("The activity ID to update"),
    type: z
      .enum([
        "call",
        "email",
        "meeting",
        "interview",
        "follow_up",
        "note",
        "other",
      ])
      .optional()
      .describe("Type of activity"),
    title: z
      .string()
      .optional()
      .describe("Brief description of the activity"),
    description: z
      .string()
      .optional()
      .describe("Detailed notes about the activity"),
    occurredAt: z
      .string()
      .optional()
      .describe("When it happened (ISO format)"),
    duration: z.number().optional().describe("Duration in minutes"),
  },
  async ({ id, type, title, description, occurredAt, duration }) => {
    const existing = db
      .prepare('SELECT * FROM "Activity" WHERE "id" = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return {
        content: [
          { type: "text" as const, text: "Activity not found" },
        ],
        isError: true,
      };
    }

    const now = new Date().toISOString();

    db.prepare(
      `UPDATE "Activity" SET "updatedAt" = ?, "type" = ?, "title" = ?, "description" = ?, "occurredAt" = ?, "duration" = ? WHERE "id" = ?`
    ).run(
      now,
      type ?? existing.type,
      title ?? existing.title,
      description !== undefined ? description : existing.description,
      occurredAt ?? existing.occurredAt,
      duration !== undefined ? duration : existing.duration,
      id
    );

    const updated = db
      .prepare('SELECT * FROM "Activity" WHERE "id" = ?')
      .get(id);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(updated, null, 2) },
      ],
    };
  }
);

// Tool: Delete an activity
server.tool(
  "delete_activity",
  "Delete an activity from a lead",
  {
    id: z.string().describe("The activity ID to delete"),
  },
  async ({ id }) => {
    const result = db
      .prepare('DELETE FROM "Activity" WHERE "id" = ?')
      .run(id);

    if (result.changes === 0) {
      return {
        content: [
          { type: "text" as const, text: "Activity not found" },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ deleted: true }),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Transport: stdio (default) or HTTP (--http flag)
// ---------------------------------------------------------------------------

async function startStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Opportun MCP Server v2 running on stdio (direct SQLite)");
}

async function startHttp() {
  const token = process.env.OPPORTUN_MCP_TOKEN;
  if (!token) {
    console.error(
      "ERROR: OPPORTUN_MCP_TOKEN must be set when running in HTTP mode.\n" +
        "  OPPORTUN_MCP_TOKEN=my-secret npm run mcp:http"
    );
    process.exit(1);
  }

  const port = Number(process.env.OPPORTUN_MCP_PORT) || 3100;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    // Only serve /mcp
    if (req.url !== "/mcp") {
      res.writeHead(404).end("Not found");
      return;
    }

    // Auth check
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${token}`) {
      res.writeHead(401, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: "Unauthorized" })
      );
      return;
    }

    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error(
      `Opportun MCP Server v2 running on http://127.0.0.1:${port}/mcp`
    );
  });
}

const isHttp = process.argv.includes("--http");
(isHttp ? startHttp() : startStdio()).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
