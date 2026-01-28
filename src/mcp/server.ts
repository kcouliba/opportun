#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Configuration
const API_BASE_URL = process.env.OPPORTUN_API_URL || "http://localhost:3000";
const API_KEY = process.env.OPPORTUN_API_KEY || "";

// Helper to make API calls
async function apiCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Create server
const server = new McpServer({
  name: "opportun-leads",
  version: "1.0.0",
});

// Tool: List leads
server.tool(
  "list_leads",
  "List leads from the pipeline with optional filtering",
  {
    stage: z.enum(["lead", "qualified", "negotiating", "won", "lost"]).optional()
      .describe("Filter by pipeline stage"),
    minScore: z.number().min(0).max(100).optional()
      .describe("Minimum match score (0-100)"),
    maxScore: z.number().min(0).max(100).optional()
      .describe("Maximum match score (0-100)"),
    client: z.string().optional()
      .describe("Filter by client name (partial match)"),
    technology: z.string().optional()
      .describe("Filter by required technology"),
    autoFiltered: z.boolean().optional()
      .describe("Filter by auto-filtered status"),
    source: z.string().optional()
      .describe("Filter by source (platform, recruiter, referral, direct)"),
    limit: z.number().min(1).max(100).optional()
      .describe("Maximum number of results (default: 100)"),
    offset: z.number().min(0).optional()
      .describe("Offset for pagination"),
    sortBy: z.enum(["createdAt", "updatedAt", "matchScore", "client", "title", "stage", "offeredRate"]).optional()
      .describe("Field to sort by (default: createdAt)"),
    sortOrder: z.enum(["asc", "desc"]).optional()
      .describe("Sort order (default: desc)"),
  },
  async (params) => {
    const queryParams = new URLSearchParams();

    if (params.stage) queryParams.set("stage", params.stage);
    if (params.minScore !== undefined) queryParams.set("minScore", params.minScore.toString());
    if (params.maxScore !== undefined) queryParams.set("maxScore", params.maxScore.toString());
    if (params.client) queryParams.set("client", params.client);
    if (params.technology) queryParams.set("technology", params.technology);
    if (params.autoFiltered !== undefined) queryParams.set("autoFiltered", params.autoFiltered.toString());
    if (params.source) queryParams.set("source", params.source);
    if (params.limit) queryParams.set("limit", params.limit.toString());
    if (params.offset) queryParams.set("offset", params.offset.toString());
    if (params.sortBy) queryParams.set("sortBy", params.sortBy);
    if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);

    const result = await apiCall(`/api/leads?${queryParams.toString()}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get a single lead
server.tool(
  "get_lead",
  "Get detailed information about a specific lead",
  {
    id: z.string().describe("The lead ID"),
  },
  async ({ id }) => {
    const result = await apiCall(`/api/leads/${id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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
    source: z.string().describe("Lead source (platform, recruiter, referral, direct)"),
    description: z.string().optional().describe("Detailed description of the opportunity"),
    sourceUrl: z.string().url().optional().describe("URL to original posting"),
    location: z.string().optional().describe("Work location"),
    remotePolicy: z.enum(["remote", "hybrid", "onsite"]).optional().describe("Remote work policy"),
    offeredRate: z.number().optional().describe("Offered daily rate (TJM) in euros"),
    estimatedStartDate: z.string().optional().describe("Expected start date (ISO format)"),
    estimatedDuration: z.number().optional().describe("Estimated duration in months"),
    requiredTechnologies: z.array(z.string()).optional().describe("Required technologies"),
    requiredDomains: z.array(z.string()).optional().describe("Required industry domains"),
    contactName: z.string().optional().describe("Contact person name"),
    contactInfo: z.string().optional().describe("Contact email/phone"),
    notes: z.string().optional().describe("Additional notes"),
    nextAction: z.string().optional().describe("Next action to take"),
    nextActionDate: z.string().optional().describe("Date for next action (ISO format)"),
  },
  async (params) => {
    const body = {
      ...params,
      requiredTechnologies: params.requiredTechnologies
        ? JSON.stringify(params.requiredTechnologies)
        : undefined,
      requiredDomains: params.requiredDomains
        ? JSON.stringify(params.requiredDomains)
        : undefined,
    };

    const result = await apiCall("/api/leads", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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
    remotePolicy: z.enum(["remote", "hybrid", "onsite"]).optional().describe("Remote work policy"),
    offeredRate: z.number().optional().describe("Offered daily rate (TJM) in euros"),
    estimatedStartDate: z.string().optional().describe("Expected start date (ISO format)"),
    estimatedDuration: z.number().optional().describe("Estimated duration in months"),
    requiredTechnologies: z.array(z.string()).optional().describe("Required technologies"),
    requiredDomains: z.array(z.string()).optional().describe("Required industry domains"),
    contactName: z.string().optional().describe("Contact person name"),
    contactInfo: z.string().optional().describe("Contact email/phone"),
    notes: z.string().optional().describe("Additional notes"),
    stage: z.enum(["lead", "qualified", "negotiating", "won", "lost"]).optional()
      .describe("Pipeline stage"),
    nextAction: z.string().optional().describe("Next action to take"),
    nextActionDate: z.string().optional().describe("Date for next action (ISO format)"),
  },
  async (params) => {
    const { id, ...updateData } = params;

    const body = {
      ...updateData,
      requiredTechnologies: updateData.requiredTechnologies
        ? JSON.stringify(updateData.requiredTechnologies)
        : undefined,
      requiredDomains: updateData.requiredDomains
        ? JSON.stringify(updateData.requiredDomains)
        : undefined,
    };

    const result = await apiCall(`/api/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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
    const result = await apiCall(`/api/leads/${id}`, {
      method: "DELETE",
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get pipeline stats
server.tool(
  "get_pipeline_stats",
  "Get statistics about the lead pipeline",
  {},
  async () => {
    const result = await apiCall("/api/leads/stats");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Move lead to stage
server.tool(
  "move_lead_stage",
  "Move a lead to a different pipeline stage",
  {
    id: z.string().describe("The lead ID"),
    stage: z.enum(["lead", "qualified", "negotiating", "won", "lost"])
      .describe("The new stage"),
  },
  async ({ id, stage }) => {
    const result = await apiCall(`/api/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify({ stage }),
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Add note to lead
server.tool(
  "add_lead_note",
  "Add or update notes for a lead",
  {
    id: z.string().describe("The lead ID"),
    notes: z.string().describe("Notes to add (will replace existing notes)"),
  },
  async ({ id, notes }) => {
    const result = await apiCall(`/api/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Set next action
server.tool(
  "set_next_action",
  "Set the next action for a lead",
  {
    id: z.string().describe("The lead ID"),
    nextAction: z.string().describe("Description of the next action to take"),
    nextActionDate: z.string().optional().describe("Due date for the action (ISO format)"),
  },
  async ({ id, nextAction, nextActionDate }) => {
    const result = await apiCall(`/api/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify({ nextAction, nextActionDate }),
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Opportun MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
