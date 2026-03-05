# Opportun

Freelance Pipeline Manager — a Tauri v2 desktop app for managing freelance leads, proposals, and job opportunities.

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend:** Rust (Tauri v2), SQLite (rusqlite)
- **AI:** Local LLM integration for job parsing, lead analysis, cover letters & interview prep
- **MCP:** Model Context Protocol server (`tsx src/mcp/server.ts`)

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Rust** | ≥ 1.77.2 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **System libs** (Linux) | — | see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |

### Linux system dependencies (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
  libssl-dev pkg-config
```

## Getting Started

```bash
# Install JS dependencies
npm install

# Run the desktop app (frontend + Rust backend)
npx tauri dev

# Or run frontend only (no Tauri shell)
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (frontend only) |
| `npx tauri dev` | Full desktop app (frontend + Rust) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run test` | Run Vitest tests |
| `npm run test:rust` | Run Rust tests |
| `npm run test:all` | Run JS + Rust tests |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript type check |
| `npm run check` | Lint + type-check + Rust clippy |
| `npm run mcp` | Start MCP server |

## Project Structure

```
src/               # React frontend
  components/      # UI components
  pages/           # Route pages
  hooks/           # React hooks
  lib/             # Utilities
  types/           # TypeScript types
  mcp/             # MCP server
src-tauri/         # Rust backend (Tauri)
docs/              # Design docs
```
