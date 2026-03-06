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

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  React Frontend                  │
│    Pages ─── Components ─── Hooks ─── Types      │
└────────────────────┬─────────────────────────────┘
                     │  invoke("command", { args })
                     │  (Tauri IPC)
┌────────────────────▼─────────────────────────────┐
│                 Rust Backend                      │
│  commands/     ─── #[tauri::command] handlers     │
│  matching.rs   ─── profile ↔ lead scoring         │
│  llm/          ─── Ollama integration             │
│  db.rs         ─── SQLite setup + migrations      │
│  migrations/   ─── SQL schema files               │
└────────────────────┬─────────────────────────────┘
                     │
              ┌──────▼──────┐
              │   SQLite    │
              │ opportun.db │
              └─────────────┘
```

**Data flow:** React components call `invoke("command_name", { args })` from `@tauri-apps/api/core`. This triggers a Rust function annotated with `#[tauri::command]`. Commands interact with SQLite through a shared `Database` struct (connection behind a `Mutex`). AI features call the local Ollama server via HTTP (`reqwest`).

**Migrations** are SQL files in `src-tauri/src/migrations/`, compiled into the binary with `include_str!`. They run automatically on startup via a `user_version` pragma check.

## Getting Started

```bash
# Install JS dependencies
npm install

# Run the desktop app (frontend + Rust backend)
npx tauri dev

# Or run frontend only (no Tauri shell)
npm run dev
```

## Development Workflow

1. **`npx tauri dev`** starts both Vite (with HMR) and the Rust backend. Frontend changes hot-reload instantly; Rust changes trigger a recompile (~15s).
2. **Before committing**, run `npm run check` — this runs ESLint, TypeScript type-checking, and `cargo clippy` in one pass.
3. **CI** runs automatically on push to `main` and on pull requests (see `.github/workflows/ci.yml`).

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

## Testing

| Command | What it runs |
|---------|-------------|
| `npm run test` | Vitest — React component tests + JS unit tests |
| `npm run test:rust` | `cargo test` — Rust unit tests (DB, commands, matching) |
| `npm run test:all` | Both of the above |
| `npm run test:watch` | Vitest in watch mode |

### Adding React tests

1. Create `src/pages/__tests__/YourPage.test.tsx` (or `src/components/__tests__/`)
2. Import `renderWithProviders` from `@/test/render` — wraps your component in `MemoryRouter`, `ToastProvider`, and `AiQueueProvider`
3. Import `onInvoke` / `clearInvokeHandlers` from `@/test/tauri-mock` to mock Tauri `invoke` calls

```tsx
import { onInvoke, clearInvokeHandlers } from "@/test/tauri-mock";
import { renderWithProviders } from "@/test/render";

beforeEach(() => clearInvokeHandlers());

it("loads data", async () => {
  onInvoke("get_profile", () => ({ id: "1", name: "Alice" }));
  renderWithProviders(<ProfilePage />);
  await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
});
```

### Adding Rust tests

Use `Database::in_memory()` for tests that need a database — it creates an in-memory SQLite instance with all migrations applied:

```rust
#[cfg(test)]
mod tests {
    use crate::db::Database;

    #[test]
    fn my_test() {
        let db = Database::in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        // insert test data, call functions, assert
    }
}
```

## Project Structure

```
src/                        # React frontend
  components/               # Reusable UI components
    ErrorBoundary.tsx        #   React error boundary
    ErrorState.tsx           #   Error display with retry
    Toast.tsx                #   Toast notifications
    AiQueue.tsx              #   AI task queue
    KanbanBoard.tsx          #   Drag-and-drop kanban
  pages/                    # Route pages
    DashboardPage.tsx        #   Overview + income forecast
    LeadsPage.tsx            #   Lead pipeline list
    LeadDetailPage.tsx       #   Lead details + documents
    ProfilePage.tsx          #   User profile
    MissionsPage.tsx         #   Mission list
    AnalyticsPage.tsx        #   Pipeline analytics
  pages/__tests__/          # Component tests
  hooks/                    # React hooks
  lib/                      # Utilities (matching, WSL paths)
  test/                     # Test infrastructure
    setup.ts                 #   jest-dom matchers
    tauri-mock.ts            #   Mock @tauri-apps/api
    render.tsx               #   renderWithProviders helper
  types/                    # TypeScript types
  mcp/                      # MCP server
src-tauri/                  # Rust backend (Tauri)
  src/
    commands/               # Tauri command handlers
      leads.rs               #   Lead CRUD + filtering
      missions.rs            #   Mission CRUD
      profile.rs             #   Profile management
      analytics.rs           #   Pipeline analytics
      backup.rs              #   DB backup/restore
      dashboard.rs           #   Dashboard data
      ai.rs                  #   AI document generation
      import.rs              #   File import (PDF/text)
    llm/                    # LLM integration
      ollama.rs              #   Ollama HTTP client
      prompts.rs             #   Prompt templates
      provider.rs            #   Provider abstraction
    migrations/             # SQL migration files
    db.rs                   # Database setup + migrations
    matching.rs             # Profile ↔ lead scoring
    models.rs               # Serde structs
    lib.rs                  # Tauri app setup
docs/                       # Design docs
.github/workflows/ci.yml   # GitHub Actions CI
```
