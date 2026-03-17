# Opportun Roadmap

> Freelance pipeline manager — Tauri 2 desktop app (Rust + React)

## Current State (v0.2.0)

**What works:**
- 13 pages: Dashboard, Leads (list/kanban/detail/new/quick-capture), Missions (list/detail/new), Activities, Analytics, Profile, Settings, Watch Sources
- Full CRUD on all entities with SQLite backend
- Lead match scoring (tech/domain/rate/location/blacklist)
- Multi-provider AI: Ollama (local), OpenAI, Anthropic via BYOK, optional embedded LLM (llama.cpp with GPU acceleration)
- AI task queue — serialized requests with progress in status bar
- Lead analysis persists as Document, auto-triggers on lead create, loads from cache on revisit
- File import from Leads list (PDF/TXT/MD via Quick Capture)
- Content language setting (FR/EN) on profile with per-lead override for AI-generated content
- LinkedIn profile import (PDF upload or paste) with mission extraction and selection wizard
- Document generation (AI-powered cover letters, interview prep, application messages)
- Resume PDF export from profile
- CSV export, search with debounce, pagination, batch actions (bulk delete/stage update)
- Database backup (VACUUM INTO) and restore (SQLite backup API) from Settings
- Kanban board view with drag-and-drop between pipeline stages
- Startup alerts (in-app toasts) for overdue follow-ups and ending missions
- Income forecasting dashboard with 6-month projection and intelligent alerts
- Error boundaries per page with fallback UI
- Dynamic lead sources management in Settings
- Watch sources for automated job board monitoring with bulk import
- MCP server with 18 tools (direct SQLite), HTTP transport with bearer token auth
- Encrypted cross-device sync via relay (feature-flagged `--features sync`)
- Responsive left sidebar navigation with sync indicator
- Dark mode, toast notifications

**What's missing:**
- No code signing (unsigned installers show OS warnings)
- No auto-update (users download new versions manually)
- No accessibility (0 aria labels)
- Resume PDF layout needs polish

---

## Phase 1 — Stability & Quality ✓

_Foundation work before adding features._

- [x] **Error boundaries** — React error boundary wrapping App + per-page boundaries with fallback UI
- [x] **Retry on failure** — ErrorState component with retry button on all 6 data-fetching pages
- [x] **README** — Architecture diagram, dev workflow, testing guide, expanded project structure
- [x] **GitHub Actions CI** — Lint + type-check + clippy + vitest + cargo test on push/PR
- [x] **Component tests** — 10 tests: DashboardPage (4), LeadDetailPage (3), ProfilePage (3) with Tauri mock infrastructure
- [x] **Rust command tests** — 8 tests: db migrations (2), leads filtering/search (4), backup validation (2) with in-memory SQLite

---

## Phase 2 — AI Integration ✓

_Multi-provider AI — local-first with optional cloud providers._

### Architecture

```
LlmProvider trait
├── OllamaProvider     (HTTP to localhost:11434)
├── OpenAiProvider     (BYOK — OpenAI-compatible APIs)
├── AnthropicProvider  (BYOK — Claude API)
└── EmbeddedProvider   (llama.cpp via llama-cpp-2, feature-flagged)
    ├── CPU inference (default)
    ├── CUDA (--features embedded-llm-cuda)
    ├── Metal (--features embedded-llm-metal)
    └── Vulkan (--features embedded-llm-vulkan)

Config: user picks provider + model in Settings, stored in DB
```

### DONE

- [x] **Local LLM runtime** — `LlmProvider` trait + Ollama backend + settings UI ("Enable AI" toggle, model picker, download progress)
- [x] **BYOK providers** — OpenAI and Anthropic API support with API key management in Settings
- [x] **Embedded LLM** — llama.cpp integration (feature-flagged `embedded-llm`), auto-download from HuggingFace, GPU acceleration, auto-unload idle models, GGUF chat template support
- [x] **Job description parsing v2** — LLM extraction of structured JSON from raw job text, fallback to regex if AI disabled
- [x] **Smart lead analysis** — AI summary per lead: strengths, risks, talking points, fit assessment. Persisted as Document, auto-triggers on create
- [x] **Cover letter rewrite** — LLM-personalized cover letters
- [x] **Interview prep** — Contextual questions and answers based on lead requirements + profile match
- [x] **Application messages** — AI-generated outreach messages with tone/length presets
- [x] **Content language** — Profile-level default (FR/EN) with per-lead override, injected into all AI prompts
- [x] **LinkedIn profile import** — PDF upload or paste text, AI extraction, mission selection wizard
- [x] **AI resume import** — Parse resume PDFs/text into structured profile data
- [x] **Auto-analyze on lead create** — Triggers analysis on first visit to LeadDetail, persists result
- [x] **Parse lead from document** — "Import File" button on Leads list, opens Quick Capture with auto file dialog
- [x] **Activity insights** — Summarize activity history per lead

---

## Phase 3 — Daily Essentials ✓

_High-impact features for daily pipeline management._

- [x] **Database backup/restore** — Export full DB (VACUUM INTO), restore via SQLite backup API, validate before import
- [x] **Follow-up reminders** — In-app toasts on startup for overdue and due-today follow-ups
- [x] **System notifications** — Startup alerts when a mission ends within 30 days
- [x] **Kanban board view** — Drag-and-drop leads between pipeline stages, list/kanban toggle persisted
- [x] **Error boundaries** — React error boundary wrapping App + per-page boundaries with fallback UI
- [x] **AI task queue** — Serialize AI requests, prevent overlapping calls, show progress in a status bar
- [x] **Resume PDF export** — Generate and save resume from profile + missions data
- [x] **Watch sources** — Automated job board monitoring with AI-powered listing extraction and bulk import

---

## Phase 4 — UX Improvements ✓

_Make daily use faster and more pleasant._

- [x] **Bulk actions** — Select multiple leads to change stage or delete
- [x] **Responsive sidebar** — Replace top nav with collapsible left sidebar, mobile bottom nav
- [x] **Activity quick-add** — Inline activity form on each lead card in list view (type + title)
- [x] **Breadcrumbs** — Hierarchical navigation on LeadDetail, MissionDetail, QuickCapture pages
- [x] **Localize application** — i18n with react-i18next (French/English). Browser locale detection, language switcher in Settings, AI content follows app locale with per-lead override
- [x] **Resume layout polish** — Professional PDF template with blue section titles, smart bullet parsing, proper page wrapping

---

## Phase 5 — Desktop & Distribution ✓

_Leverage Tauri properly — make it feel native and shippable._

- [x] **Window state persistence** — tauri-plugin-window-state saves/restores size and position automatically
- [x] **Keyboard shortcuts** — Ctrl+K command palette (search + navigate), Ctrl+N new lead, Ctrl+Shift+N quick capture
- [x] **Release workflow** — GitHub Actions builds cross-platform installers on tag push (Linux .deb/.AppImage, macOS .dmg, Windows .msi/.exe). Version bump script (`npm run release <version>`)
- [x] **Auto-backup before migrations** — timestamped backup created automatically before schema upgrades, stored in app data directory
- [ ] **App menu** — deprioritized (sidebar covers navigation)
- [ ] **Auto-update** — deferred until code signing is set up (Tauri updater plugin)

---

## Phase 6 — Advanced Features

_Deeper value for power users._

- [x] **Revenue dashboard** — Forecast income based on pipeline probability and mission schedule (6-month projection, secured + weighted pipeline income)
- [x] **Encrypted cross-device sync** — Signal-like peer-to-peer sync (feature-flagged `--features sync`). XChaCha20-Poly1305 encryption, zstd-compressed full-DB snapshots, QR/text code pairing, ephemeral relay protocol. Relay is self-hostable, app connects to any relay URL
- [ ] **Email template system** — Customizable outreach templates (not just generated cover letters)
- [ ] **Lead source analytics** — Which sources convert best? Track ROI per source
- [ ] **Calendar view** — Visualize missions timeline and upcoming activities
- [ ] **Tagging system** — Custom tags on leads for flexible categorization beyond stages
- [ ] **Document versioning** — Edit and track versions of generated documents

---

## Phase 7 — Ecosystem

_Extend beyond the app._

- [x] **MCP HTTP transport** — HTTP/SSE transport with bearer token auth (alongside existing stdio), configurable via Settings
- [ ] **MCP improvements** — Add document generation, mission management, and profile tools to MCP server

---

## Non-Goals

Things explicitly out of scope:

- **Multi-user / team features** — This is a personal tool for solo freelancers
- **Web version** — Desktop-first, no plans to return to web deployment
- **Mobile app** — Desktop is the primary workspace for pipeline management
- **Built-in invoicing** — Dedicated tools (e.g., Pennylane, Freebe) handle this better
- **CRM features** — No contact management beyond what's attached to leads

---

_Last updated: 2026-03-18_
