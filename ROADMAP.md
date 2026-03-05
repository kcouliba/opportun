# Opportun Roadmap

> Freelance pipeline manager — Tauri 2 desktop app (Rust + React)

## Current State (v0.2.0)

**What works:**
- 11 pages: Dashboard, Leads (list/detail/new/quick-capture), Missions (list/detail/new), Activities, Analytics, Profile
- Full CRUD on all entities with SQLite backend
- Lead match scoring (tech/domain/rate/location/blacklist)
- Local AI via Ollama — job parsing, lead analysis, cover letter generation, interview prep
- Lead analysis persists as Document, auto-triggers on lead create, loads from cache on revisit
- File import from Leads list (PDF/TXT/MD via Quick Capture)
- Content language setting (FR/EN) on profile with per-lead override for AI-generated content
- LinkedIn profile import (PDF upload or paste) with mission extraction and selection wizard
- Document generation (AI-powered cover letters, interview prep, template-based key questions)
- CSV export, search with debounce, pagination
- MCP server with 18 tools (direct SQLite)
- Dark mode, responsive layout, toast notifications

**What's missing:**
- No CI/CD or release automation
- No error boundaries or retry logic
- Testing limited to matching algorithm (28 Vitest + 7 Rust tests)
- Desktop features underutilized (notifications registered but unused, no app menu)
- No accessibility (0 aria labels)
- No database backup/restore
- No embedded LLM runtime (Ollama required for AI features)

---

## Phase 1 — Stability & Quality

_Foundation work before adding features._

- [ ] **Error boundaries** — React error boundary wrapping App + per-page boundaries with fallback UI
- [ ] **Retry on failure** — Show retry button when backend calls fail instead of just a toast
- [ ] **README** — Setup instructions, dev workflow, architecture overview
- [ ] **GitHub Actions CI** — Run `npm run check` + `npm run test:all` on push/PR
- [ ] **Component tests** — Cover critical flows (Dashboard data loading, LeadDetail edit/delete, ProfilePage save)
- [ ] **Rust command tests** — Test commands with in-memory SQLite

---

## Phase 2 — Local AI Integration

_On-device intelligence — private, offline, no API keys required._

### Design decisions

- **AI is optional** — App works fully without AI. Current regex parser and templates remain as fallback. AI features are enhancements toggled on in settings.
- **Dual runtime** — Dev uses Ollama (HTTP to localhost:11434). Release builds embed llama.cpp via Rust bindings. Both use GGUF model format — same models, same prompts, same results.
- **No bundled model** — Installer stays lightweight (~15MB). Model (~2-4GB) downloads on first AI use, stored in app data dir.
- **Model-agnostic** — Default suggestion: Llama 3.2 3B. User can switch to Mistral 7B or others in settings. Runtime doesn't care.

### Architecture

```
LlmProvider trait
├── OllamaProvider  (dev: HTTP to localhost:11434)
└── EmbeddedProvider (release: llama-cpp-rs, compiled in via cargo feature flag)

Model storage: ~/.local/share/com.opportun.app/models/
Config: user picks model in Settings, stored in DB
```

### DONE

- [x] **Local LLM runtime** — `LlmProvider` trait + Ollama backend + settings UI ("Enable AI" toggle, model picker, download progress). Cargo feature `embedded-llm` for release builds with llama-cpp-rs.
- [x] **Job description parsing v2** — Replace regex-based QuickCapture with LLM extraction. Input: raw job post text → Output: structured JSON (title, client, technologies, rate, location, remote policy, requirements). Fallback to current regex if AI disabled.
- [x] **Smart lead analysis** — AI summary per lead: strengths, risks, talking points, fit assessment beyond numeric score. Persisted as Document, auto-triggers on lead create, loads from cache on revisit.
- [x] **Cover letter rewrite** — Use local LLM to personalize generated cover letters instead of rigid templates
- [x] **Interview prep** — Generate contextual questions and answers based on lead requirements + profile match
- [x] **Content language** — Profile-level default (FR/EN) with per-lead override, injected into all AI prompts
- [x] **LinkedIn profile import** — PDF upload or paste text, AI-powered extraction, mission selection wizard
- [x] **Auto-analyze on lead create** — Triggers analysis on first visit to LeadDetail, persists result, loads from cache on revisit
- [x] **Parse lead from document** — "Import File" button on Leads list, opens Quick Capture in file mode with auto file dialog

### Remaining

- [ ] **Activity insights** — Summarize activity history per lead ("3 calls over 2 weeks, last contact 5 days ago, tone: positive")
- [ ] **Natural language search** — "Show me remote React leads above 600€/day added this month"
- [ ] **Rate negotiation helper** — Suggest counter-offers based on market positioning and lead context

---

## Phase 3 — Daily Essentials

_High-impact features for daily pipeline management._

- [ ] **Database backup/restore** — Export full DB as file, restore from backup (via dialog). Data safety is non-negotiable.
- [ ] **Follow-up reminders** — Desktop notifications when a lead's next action date arrives (plugin already registered but unused)
- [ ] **System notifications** — Notify on app startup when a mission ends within 30 days
- [ ] **Kanban board view** — Drag-and-drop leads between pipeline stages (alternate view to list). Pipeline management is visual by nature.
- [ ] **Error boundaries** — React error boundary wrapping App + per-page boundaries with fallback UI (moved up from Phase 1 if not done)
- [ ] **AI task queue** — Serialize AI requests, prevent overlapping calls, show progress in a status bar

---

## Phase 4 — UX Improvements

_Make daily use faster and more pleasant._

- [ ] **Bulk actions** — Select multiple leads to change stage, delete, or export
- [ ] **CSV/JSON import** — Bulk import leads with validation and duplicate detection
- [ ] **Saved filters** — Save and recall frequently used lead filter combinations
- [ ] **Activity quick-add** — Add activity directly from leads list without navigating to detail
- [ ] **Breadcrumbs** — Show page hierarchy in detail views (Leads > ClientName > Edit)
- [ ] **Localize application** — i18n support (French/English at minimum). Extract all UI strings, use a translation framework (e.g., react-i18next). Locale follows profile `contentLanguage` setting or system locale.

---

## Phase 5 — Desktop & Distribution

_Leverage Tauri properly — make it feel native and shippable._

- [ ] **Embedded LLM runtime** — llama-cpp-rs for release builds (currently Ollama-only). Only needed for distribution.
- [ ] **Window state persistence** — Remember window size/position between sessions
- [ ] **App menu** — File (New Lead, Export), Edit (Undo), View (Dark mode toggle), Help (About, Docs)
- [ ] **Keyboard shortcuts** — `Ctrl+K` search, `Ctrl+N` new lead, `Ctrl+S` save, `Escape` close/cancel
- [ ] **Auto-update** — Tauri updater plugin for self-updating from GitHub releases
- [ ] **Release workflow** — GitHub Actions to build + publish installers (Linux .deb/.AppImage, macOS .dmg, Windows .msi)

---

## Phase 6 — Advanced Features

_Deeper value for power users._

- [ ] **Revenue dashboard** — Forecast income based on pipeline probability and mission schedule
- [ ] **Email template system** — Customizable outreach templates (not just generated cover letters)
- [ ] **Lead source analytics** — Which sources convert best? Track ROI per source
- [ ] **Calendar view** — Visualize missions timeline and upcoming activities
- [ ] **Multi-profile support** — Switch between different freelance identities/brands
- [ ] **Tagging system** — Custom tags on leads for flexible categorization beyond stages
- [ ] **Document versioning** — Edit and track versions of generated documents
- [ ] **Data sync** — Optional cloud backup (encrypted) for cross-device access

---

## Phase 7 — Ecosystem

_Extend beyond the app._

- [ ] **MCP improvements** — Add document generation, mission management, and profile tools to MCP server
- [ ] **Browser extension** — Capture leads from job boards (Malt, Crème de la Crème, LinkedIn) with one click
- [ ] **API mode** — Optional REST API for custom integrations (webhook on stage change, etc.)
- [ ] **Plugin system** — User-defined scoring rules, custom fields, import adapters

---

## Non-Goals

Things explicitly out of scope:

- **Multi-user / team features** — This is a personal tool for solo freelancers
- **Web version** — Desktop-first, no plans to return to web deployment
- **Mobile app** — Desktop is the primary workspace for pipeline management
- **Built-in invoicing** — Dedicated tools (e.g., Pennylane, Freebe) handle this better
- **CRM features** — No contact management beyond what's attached to leads

---

_Last updated: 2026-03-05_
