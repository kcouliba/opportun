# MCP Server Documentation

Opportun includes an MCP (Model Context Protocol) server that provides programmatic access to your pipeline data. It supports two transports: stdio (for CLI tools) and HTTP (for external services).

## Setup

### Stdio (Claude Code, Claude Desktop)

```bash
npm run mcp
```

#### Claude Desktop configuration

Add to `~/.config/Claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "opportun": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/opportun",
      "env": {
        "OPPORTUN_DB_PATH": "/home/you/.local/share/com.opportun.app/opportun.db"
      }
    }
  }
}
```

### HTTP (external services)

```bash
OPPORTUN_MCP_TOKEN=your-secret-token npm run mcp:http
```

The server listens on `http://127.0.0.1:3100/mcp` by default.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `OPPORTUN_DB_PATH` | `~/.local/share/com.opportun.app/opportun.db` | Path to the SQLite database |
| `OPPORTUN_MCP_TOKEN` | *(from database)* | Bearer token for HTTP auth |
| `OPPORTUN_MCP_PORT` | `3100` | HTTP server port |
| `OPPORTUN_MCP_HOST` | `127.0.0.1` | HTTP bind address |

The token can also be auto-generated from Settings in the app.

## Available Tools (18)

### Lead Management

| Tool | Description |
|------|-------------|
| `list_leads` | List leads with filtering (stage, score, client, technology, source, pagination, sorting) |
| `get_lead` | Get a lead with its documents and activities |
| `create_lead` | Create a new lead (auto-calculates match score) |
| `update_lead` | Update lead fields |
| `delete_lead` | Delete a lead |
| `move_lead_stage` | Move a lead to a different pipeline stage |
| `add_lead_note` | Add or replace notes on a lead |
| `set_next_action` | Set the next action and due date for a lead |
| `get_pipeline_stats` | Get pipeline statistics (counts, scores, revenue) |

### Activity Management

| Tool | Description |
|------|-------------|
| `list_activities` | List all activities for a lead |
| `add_activity` | Add an activity (call, email, meeting, interview, note, other) |
| `update_activity` | Update an existing activity |
| `delete_activity` | Delete an activity |

## Examples

### Using with Claude

Once configured, you can ask:

- "Show me my pipeline stats"
- "What leads do I have in the qualified stage?"
- "Create a new lead for Acme Corp, Senior Developer, from LinkedIn"
- "Move the TechCorp lead to negotiating"
- "Add a note to the Acme lead: Great first call, scheduling technical interview"
- "Set the next action for TechCorp to 'Send proposal' due next Monday"
- "Log a 30-minute call with the Fondation du Patrimoine lead"

### Testing the HTTP endpoint

```bash
# Check auth
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```
