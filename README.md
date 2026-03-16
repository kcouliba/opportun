# Opportun

Freelance pipeline manager — track leads, missions, and revenue with AI-powered analysis. Desktop app built with Tauri 2, Rust, React, and SQLite.

## Features

- **Lead pipeline** — kanban board and list view with drag-and-drop, batch actions, search, filtering, and CSV export
- **Match scoring** — automatically score leads against your profile (technologies, domains, rate, location, blacklists)
- **AI-powered** — job description parsing, lead analysis, cover letters, interview prep, application messages, activity insights. Supports Ollama (local), OpenAI, Anthropic (BYOK), or embedded llama.cpp with GPU acceleration
- **Watch sources** — monitor job boards for new opportunities with AI-powered listing extraction
- **Resume export** — generate a professional PDF resume from your profile and mission history
- **Income forecast** — 6-month projection with secured + weighted pipeline income
- **Cross-device sync** — end-to-end encrypted sync via ephemeral relay (XChaCha20-Poly1305, feature-flagged)
- **MCP server** — 18 tools for programmatic access via stdio or HTTP with bearer token auth
- **Internationalization** — French and English, with browser locale detection
- **Command palette** — Ctrl+K to search and navigate anywhere

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Backend | Rust, Tauri v2, SQLite (rusqlite) |
| AI | Ollama, OpenAI, Anthropic, llama.cpp (optional) |
| i18n | react-i18next |
| MCP | @modelcontextprotocol/sdk (stdio + HTTP) |

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 18 | [nodejs.org](https://nodejs.org) |
| Rust | >= 1.77.2 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| System libs (Linux) | -- | See below |

### Linux system dependencies (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
  libssl-dev pkg-config
```

## Getting Started

```bash
# Install dependencies
npm install

# Run the desktop app (frontend + Rust backend)
npx tauri dev

# Or run frontend only (no Tauri shell)
npm run dev
```

### Feature flags

```bash
# Embedded LLM (CPU)
npx tauri dev --features embedded-llm

# Embedded LLM with GPU acceleration
LIBRARY_PATH=/usr/lib/x86_64-linux-gnu npx tauri dev --features embedded-llm-cuda

# Cross-device sync
npx tauri dev --features sync
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (frontend only) |
| `npx tauri dev` | Full desktop app (frontend + Rust) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run check` | Lint + type-check + Rust clippy |
| `npm run test` | Run Vitest tests |
| `npm run test:rust` | Run Rust tests |
| `npm run test:all` | Run JS + Rust tests |
| `npm run mcp` | Start MCP server (stdio) |
| `npm run mcp:http` | Start MCP server (HTTP, requires token) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+N` | New lead |
| `Ctrl+Shift+N` | Quick capture |
| `Escape` | Close palette / cancel |

## Architecture

```
+--------------------------------------------------+
|                  React Frontend                   |
|    Pages --- Components --- Hooks --- Types       |
+------------------------+-------------------------+
                         | invoke("command", { args })
                         | (Tauri IPC)
+------------------------v-------------------------+
|                  Rust Backend                     |
|  commands/    --- #[tauri::command] handlers      |
|  llm/         --- Multi-provider AI abstraction   |
|    ollama.rs     Ollama (local HTTP)              |
|    openai.rs     OpenAI-compatible APIs           |
|    anthropic.rs  Anthropic Claude API             |
|    embedded.rs   llama.cpp (optional, GPU)        |
|  sync/        --- Encrypted cross-device sync     |
|  matching.rs  --- Profile <-> lead scoring        |
|  db.rs        --- SQLite setup + migrations       |
+------------------------+-------------------------+
                         |
                  +------v------+
                  |   SQLite    |
                  | opportun.db |
                  +-------------+

+--------------------------------------------------+
|              MCP Server (Node.js)                 |
|  stdio or HTTP transport, direct SQLite access    |
|  18 tools: leads, activities, stats, stages       |
+--------------------------------------------------+
```

## Project Structure

```
src/                        # React frontend
  pages/                    # Route pages (13)
  components/               # Reusable UI components
  hooks/                    # React hooks (AI, sync, resume, etc.)
  locales/                  # i18n translation files (en, fr)
  types/                    # TypeScript interfaces
  mcp/                      # MCP server (stdio + HTTP)
  i18n.ts                   # i18n configuration
src-tauri/                  # Rust backend
  src/
    commands/               # Tauri command handlers
    llm/                    # Multi-provider LLM layer
    sync/                   # Encrypted sync (feature-flagged)
    migrations/             # SQL migration files (009)
    db.rs                   # Database setup + migrations
    matching.rs             # Lead scoring engine
    models.rs               # Serde structs
    lib.rs                  # Tauri app setup
  capabilities/             # Tauri permission config
  .cargo/config.toml        # Build config (CUDA paths)
.github/workflows/
  ci.yml                    # Lint + test on push/PR
  release.yml               # Cross-platform builds on tag
```

## MCP Server

The MCP server provides programmatic access to your pipeline data.

**Stdio** (for Claude Code, Claude Desktop):
```bash
npm run mcp
```

**HTTP** (for external services):
```bash
OPPORTUN_MCP_TOKEN=your-token npm run mcp:http
# Connects to http://127.0.0.1:3100/mcp
```

The token can also be auto-generated in Settings. Configure in Claude Desktop:

```json
{
  "mcpServers": {
    "opportun": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": { "OPPORTUN_DB_PATH": "/path/to/opportun.db" }
    }
  }
}
```

## Releasing

Releases are built automatically by GitHub Actions when you push a version tag:

```bash
git tag v0.3.0
git push github main --tags
```

This builds installers for all platforms (Linux .deb/.AppImage, macOS .dmg, Windows .msi/.exe) and creates a draft GitHub Release.

## Testing

```bash
# Frontend tests (Vitest + React Testing Library)
npm run test

# Rust tests (SQLite in-memory, matching, backup validation)
npm run test:rust

# Both
npm run test:all
```

## Adding a Language

1. Copy `src/locales/en.json` to `src/locales/xx.json` and translate the values
2. In `src/i18n.ts`, add `import xx from "./locales/xx.json"` and register it in resources
3. Add an `<option>` in the Settings language dropdown

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full development roadmap and current status.
