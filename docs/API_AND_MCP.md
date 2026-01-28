# Opportun API & MCP Server Documentation

This document covers the REST API endpoints and the MCP (Model Context Protocol) server for managing leads programmatically.

## Table of Contents

- [REST API](#rest-api)
  - [Authentication](#authentication)
  - [Leads Endpoints](#leads-endpoints)
  - [Stats Endpoint](#stats-endpoint)
- [MCP Server](#mcp-server)
  - [Setup](#setup)
  - [Configuration](#configuration)
  - [Available Tools](#available-tools)
- [Examples](#examples)

---

## REST API

### Authentication

The API supports optional API key authentication. When an API key is provided, it must be valid. When no key is provided, the request is allowed (for frontend/browser access).

**Header format:**
```
Authorization: Bearer opp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys are stored hashed in the database. To create an API key, use the `generateApiKey()` helper from `src/lib/auth.ts`.

### Leads Endpoints

#### List Leads

```
GET /api/leads
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `stage` | string | Filter by stage: `lead`, `qualified`, `negotiating`, `won`, `lost` |
| `minScore` | number | Minimum match score (0-100) |
| `maxScore` | number | Maximum match score (0-100) |
| `client` | string | Filter by client name (partial match, case-sensitive) |
| `technology` | string | Filter by required technology (partial match) |
| `autoFiltered` | boolean | Filter by auto-filtered status (`true` or `false`) |
| `source` | string | Filter by source: `platform`, `recruiter`, `referral`, `direct` |
| `limit` | number | Maximum results to return (default: 100) |
| `offset` | number | Number of results to skip (for pagination) |
| `sortBy` | string | Sort field: `createdAt`, `updatedAt`, `matchScore`, `client`, `title`, `stage`, `offeredRate` |
| `sortOrder` | string | Sort direction: `asc` or `desc` (default: `desc`) |

**Response:**
```json
{
  "data": [
    {
      "id": "cmkwoz4680001x4fzx22jiam7",
      "client": "TechCorp",
      "title": "Senior Developer",
      "stage": "lead",
      "matchScore": 75,
      ...
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

**Examples:**
```bash
# Get all leads
curl http://localhost:3000/api/leads

# Get qualified leads with high match scores
curl "http://localhost:3000/api/leads?stage=qualified&minScore=70"

# Search by client name, sorted by match score
curl "http://localhost:3000/api/leads?client=Tech&sortBy=matchScore&sortOrder=desc"

# Paginate results
curl "http://localhost:3000/api/leads?limit=10&offset=20"
```

#### Get Single Lead

```
GET /api/leads/:id
```

Returns the lead with its associated documents.

**Response:**
```json
{
  "id": "cmkwoz4680001x4fzx22jiam7",
  "client": "TechCorp",
  "title": "Senior Developer",
  "description": "...",
  "requiredTechnologies": "[\"React\",\"Node.js\"]",
  "matchScore": 75,
  "stage": "lead",
  "documents": [
    {
      "id": "...",
      "type": "cover_letter",
      "content": "..."
    }
  ],
  ...
}
```

#### Create Lead

```
POST /api/leads
```

**Request Body:**
```json
{
  "client": "TechCorp",
  "title": "Senior React Developer",
  "source": "platform",
  "description": "Looking for a senior developer...",
  "sourceUrl": "https://example.com/job/123",
  "location": "Paris",
  "remotePolicy": "hybrid",
  "offeredRate": 650,
  "estimatedStartDate": "2026-03-01",
  "estimatedDuration": 6,
  "requiredTechnologies": "[\"React\",\"TypeScript\"]",
  "requiredDomains": "[\"Fintech\"]",
  "contactName": "John Doe",
  "contactInfo": "john@techcorp.com",
  "notes": "Referred by a colleague",
  "nextAction": "Send CV",
  "nextActionDate": "2026-02-01"
}
```

**Notes:**
- `requiredTechnologies` and `requiredDomains` must be JSON-encoded arrays
- `matchScore` and `autoFiltered` are calculated automatically based on your profile
- If `autoFiltered` is true, the lead is automatically set to `lost` stage

#### Update Lead

```
PUT /api/leads/:id
```

Same body format as create. All fields are optional - only provided fields will be updated.

The match score is recalculated when relevant fields change.

#### Delete Lead

```
DELETE /api/leads/:id
```

**Response:**
```json
{
  "success": true
}
```

### Stats Endpoint

```
GET /api/leads/stats
```

Returns pipeline statistics.

**Response:**
```json
{
  "total": 42,
  "byStage": {
    "lead": 15,
    "qualified": 10,
    "negotiating": 5,
    "won": 8,
    "lost": 4
  },
  "activeLeads": 30,
  "autoFiltered": 3,
  "averageMatchScore": 65,
  "totalEstimatedRevenue": 125000,
  "highValueLeads": 12,
  "actions": {
    "overdue": 3,
    "upcoming": 7
  }
}
```

**Fields:**
- `total`: Total number of leads
- `byStage`: Count of leads in each pipeline stage
- `activeLeads`: Leads not in `won` or `lost` stage
- `autoFiltered`: Leads that were auto-filtered due to blacklist/rate
- `averageMatchScore`: Average match score across all leads
- `totalEstimatedRevenue`: Sum of estimated revenue from `won` and `negotiating` leads
- `highValueLeads`: Active leads with match score >= 70
- `actions.overdue`: Actions past their due date
- `actions.upcoming`: Actions with future due dates

---

## MCP Server

The MCP server allows AI assistants (like Claude) to interact with your leads pipeline using natural language.

### Setup

1. **Install dependencies** (already done if you ran `npm install`):
   ```bash
   npm install @modelcontextprotocol/sdk
   ```

2. **Run the MCP server**:
   ```bash
   npm run mcp
   ```

   The server communicates over stdio using JSON-RPC.

### Configuration

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `OPPORTUN_API_URL` | `http://localhost:3000` | Base URL of the Opportun API |
| `OPPORTUN_API_KEY` | (empty) | Optional API key for authentication |

### Claude Desktop Integration

Add to `~/.config/Claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "opportun": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/opportun",
      "env": {
        "OPPORTUN_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Important:** The Next.js app must be running (`npm run dev`) for the MCP server to work.

### Available Tools

#### list_leads

List leads with optional filtering.

**Parameters:**
- `stage` (optional): Filter by stage
- `minScore` (optional): Minimum match score
- `maxScore` (optional): Maximum match score
- `client` (optional): Filter by client name
- `technology` (optional): Filter by technology
- `autoFiltered` (optional): Filter by auto-filtered status
- `source` (optional): Filter by source
- `limit` (optional): Max results (1-100)
- `offset` (optional): Pagination offset
- `sortBy` (optional): Sort field
- `sortOrder` (optional): `asc` or `desc`

#### get_lead

Get detailed information about a specific lead.

**Parameters:**
- `id` (required): The lead ID

#### create_lead

Create a new lead in the pipeline.

**Parameters:**
- `client` (required): Company name
- `title` (required): Opportunity title
- `source` (required): Lead source
- `description` (optional): Detailed description
- `sourceUrl` (optional): URL to original posting
- `location` (optional): Work location
- `remotePolicy` (optional): `remote`, `hybrid`, or `onsite`
- `offeredRate` (optional): Daily rate in euros
- `estimatedStartDate` (optional): ISO date string
- `estimatedDuration` (optional): Duration in months
- `requiredTechnologies` (optional): Array of technologies
- `requiredDomains` (optional): Array of domains
- `contactName` (optional): Contact person
- `contactInfo` (optional): Contact details
- `notes` (optional): Additional notes
- `nextAction` (optional): Next action to take
- `nextActionDate` (optional): Due date for next action

#### update_lead

Update an existing lead.

**Parameters:**
- `id` (required): The lead ID
- All other fields from `create_lead` (optional)
- `stage` (optional): New pipeline stage

#### delete_lead

Delete a lead from the pipeline.

**Parameters:**
- `id` (required): The lead ID

#### get_pipeline_stats

Get statistics about the lead pipeline. No parameters required.

#### move_lead_stage

Quickly move a lead to a different stage.

**Parameters:**
- `id` (required): The lead ID
- `stage` (required): New stage (`lead`, `qualified`, `negotiating`, `won`, `lost`)

#### add_lead_note

Add or update notes for a lead.

**Parameters:**
- `id` (required): The lead ID
- `notes` (required): Notes content (replaces existing)

#### set_next_action

Set the next action for a lead.

**Parameters:**
- `id` (required): The lead ID
- `nextAction` (required): Description of the action
- `nextActionDate` (optional): Due date (ISO format)

---

## Examples

### Using the API with curl

```bash
# Get pipeline overview
curl http://localhost:3000/api/leads/stats

# List high-value leads in negotiation
curl "http://localhost:3000/api/leads?stage=negotiating&minScore=70"

# Create a new lead
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "client": "Startup Inc",
    "title": "Full-stack Developer",
    "source": "referral",
    "offeredRate": 600,
    "requiredTechnologies": "[\"React\", \"Node.js\", \"PostgreSQL\"]"
  }'

# Move lead to qualified stage
curl -X PUT http://localhost:3000/api/leads/LEAD_ID \
  -H "Content-Type: application/json" \
  -d '{"stage": "qualified"}'

# Delete a lead
curl -X DELETE http://localhost:3000/api/leads/LEAD_ID
```

### Using with Claude Desktop

Once configured, you can ask Claude things like:

- "Show me my pipeline stats"
- "What leads do I have in the qualified stage?"
- "Create a new lead for company Acme Corp, title Senior Developer, from LinkedIn"
- "Move the TechCorp lead to negotiating"
- "Add a note to the Acme lead: Had a great first call, they want to schedule technical interview"
- "Set the next action for TechCorp to 'Send proposal' due next Monday"
- "Show me all leads with React as a required technology"
- "What are my high-scoring leads?"
- "Delete the old lead from StartupXYZ"

### Using the MCP Server Directly

For testing or integration with other tools:

```bash
# Initialize and list tools
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npm run mcp

# Call a tool
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_pipeline_stats","arguments":{}}}' | npm run mcp
```
