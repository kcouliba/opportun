# Opportun Roadmap

> Freelance pipeline manager — Tauri 2 desktop app (Rust + React)

## Current State (v0.2.0)

**What works:**
- 12 pages: Dashboard, Leads (list/kanban/detail/new/quick-capture), Missions (list/detail/new), Activities, Analytics, Profile, Settings
- Full CRUD on all entities with SQLite backend
- Lead match scoring (tech/domain/rate/location/blacklist)
- Local AI via Ollama — job parsing, lead analysis, cover letter generation, interview prep
- AI task queue — serialized requests with progress in status bar
- Lead analysis persists as Document, auto-triggers on lead create, loads from cache on revisit
- File import from Leads list (PDF/TXT/MD via Quick Capture)
- Content language setting (FR/EN) on profile with per-lead override for AI-generated content
- LinkedIn profile import (PDF upload or paste) with mission extraction and selection wizard
- Document generation (AI-powered cover letters, interview prep, template-based key questions)
- CSV export, search with debounce, pagination
- Database backup (VACUUM INTO) and restore (SQLite backup API) from Settings
- Kanban board view with drag-and-drop between pipeline stages
- Startup alerts (in-app toasts) for overdue follow-ups and ending missions
- Income forecasting dashboard with 6-month projection and intelligent alerts
- Error boundaries per page with fallback UI
- Dynamic lead sources management in Settings
- MCP server with 18 tools (direct SQLite)
- Dark mode, responsive layout, toast notifications

**What's missing:**
- No release automation (CI runs on push/PR)
- Desktop features underutilized (no app menu, no keyboard shortcuts)
- No accessibility (0 aria labels)

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

## Phase 2 — Local AI Integration

_On-device intelligence — private, offline, no API keys required._

### Design decisions

- **AI is optional** — App works fully without AI. Current regex parser and templates remain as fallback. AI features are enhancements toggled on in settings.
- **Ollama-based** — AI features use Ollama (HTTP to localhost:11434). User installs Ollama separately and pulls models.
- **Model-agnostic** — Default suggestion: Llama 3.2 3B. User can switch to Mistral 7B or others in settings. Runtime doesn't care.

### Architecture

```
LlmProvider trait
└── OllamaProvider  (HTTP to localhost:11434)

Config: user picks model in Settings, stored in DB
```

### DONE

- [x] **Local LLM runtime** — `LlmProvider` trait + Ollama backend + settings UI ("Enable AI" toggle, model picker, download progress).
- [x] **Job description parsing v2** — Replace regex-based QuickCapture with LLM extraction. Input: raw job post text → Output: structured JSON (title, client, technologies, rate, location, remote policy, requirements). Fallback to current regex if AI disabled.
- [x] **Smart lead analysis** — AI summary per lead: strengths, risks, talking points, fit assessment beyond numeric score. Persisted as Document, auto-triggers on lead create, loads from cache on revisit.
- [x] **Cover letter rewrite** — Use local LLM to personalize generated cover letters instead of rigid templates
- [x] **Interview prep** — Generate contextual questions and answers based on lead requirements + profile match
- [x] **Content language** — Profile-level default (FR/EN) with per-lead override, injected into all AI prompts
- [x] **LinkedIn profile import** — PDF upload or paste text, AI-powered extraction, mission selection wizard
- [x] **Auto-analyze on lead create** — Triggers analysis on first visit to LeadDetail, persists result, loads from cache on revisit
- [x] **Parse lead from document** — "Import File" button on Leads list, opens Quick Capture in file mode with auto file dialog

- [x] **Activity insights** — Summarize activity history per lead ("3 calls over 2 weeks, last contact 5 days ago, tone: positive")

---

## Phase 3 — Daily Essentials ✓

_High-impact features for daily pipeline management._

- [x] **Database backup/restore** — Export full DB (VACUUM INTO), restore via SQLite backup API, validate before import
- [x] **Follow-up reminders** — In-app toasts on startup for overdue and due-today follow-ups
- [x] **System notifications** — Startup alerts when a mission ends within 30 days
- [x] **Kanban board view** — Drag-and-drop leads between pipeline stages (@hello-pangea/dnd), with list/kanban toggle persisted in localStorage
- [x] **Error boundaries** — React error boundary wrapping App + per-page boundaries with fallback UI
- [x] **AI task queue** — Serialize AI requests, prevent overlapping calls, show progress in a status bar

---

## Phase 4 — UX Improvements

_Make daily use faster and more pleasant._

- [ ] **Bulk actions** — Select multiple leads to change stage, delete, or export
- [ ] **Activity quick-add** — Add activity directly from leads list without navigating to detail
- [ ] **Breadcrumbs** — Show page hierarchy in detail views (Leads > ClientName > Edit)
- [ ] **Localize application** — i18n support (French/English at minimum). Extract all UI strings, use a translation framework (e.g., react-i18next). Locale follows profile `contentLanguage` setting or system locale.

---

## Phase 5 — Desktop & Distribution

_Leverage Tauri properly — make it feel native and shippable._

- [ ] **Window state persistence** — Remember window size/position between sessions
- [ ] **App menu** — File (New Lead, Export), Edit (Undo), View (Dark mode toggle), Help (About, Docs)
- [ ] **Keyboard shortcuts** — `Ctrl+K` search, `Ctrl+N` new lead, `Ctrl+S` save, `Escape` close/cancel
- [ ] **Auto-update** — Tauri updater plugin for self-updating from GitHub releases
- [ ] **Release workflow** — GitHub Actions to build + publish installers (Linux .deb/.AppImage, macOS .dmg, Windows .msi)

---

## Phase 6 — Advanced Features

_Deeper value for power users._

- [x] **Revenue dashboard** — Forecast income based on pipeline probability and mission schedule (6-month projection, secured + weighted pipeline income)
- [ ] **Email template system** — Customizable outreach templates (not just generated cover letters)
- [ ] **Lead source analytics** — Which sources convert best? Track ROI per source
- [ ] **Calendar view** — Visualize missions timeline and upcoming activities
- [ ] **Tagging system** — Custom tags on leads for flexible categorization beyond stages
- [ ] **Document versioning** — Edit and track versions of generated documents
- [ ] **Data sync** — Optional cloud backup (encrypted) for cross-device access

---

## Phase 7 — Ecosystem

_Extend beyond the app._

- [ ] **MCP improvements** — Add document generation, mission management, and profile tools to MCP server
- [ ] **Browser extension** — Capture leads from job boards (Malt, Crème de la Crème, LinkedIn) with one click

---

## Non-Goals

Things explicitly out of scope:

- **Multi-user / team features** — This is a personal tool for solo freelancers
- **Web version** — Desktop-first, no plans to return to web deployment
- **Mobile app** — Desktop is the primary workspace for pipeline management
- **Built-in invoicing** — Dedicated tools (e.g., Pennylane, Freebe) handle this better
- **CRM features** — No contact management beyond what's attached to leads

---

_Last updated: 2026-03-06_
