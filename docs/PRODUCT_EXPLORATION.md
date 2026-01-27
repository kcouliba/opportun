# Opportun - Product Exploration

> **Document Purpose:** Capture exploration of building a tool for freelance developers/consultants managing their opportunity pipeline and business decisions.

---

## Context

As a French solo entrepreneur (experienced web developer), the founder faces daily challenges that likely resonate with thousands of other freelancers.

**Key insight:** This is a first-hand problem, not a hypothetical market. Authenticity matters.

**Core problem (refined):** "I'd like to create a client funnel so I can guarantee my incomes" — meaning peace of mind knowing that planning is properly booked to meet financial goals.

---

## Market Research (2026-01-26)

### Specialized Tools That Exist

#### Income Forecasting (closest to our need)

| Tool | Focus | Gap |
|------|-------|-----|
| [Cushion](https://cushionapp.com/) | Schedule visualization + income forecasting | Focuses on **existing projects**, not pipeline of leads |
| [Harpoon](https://harpoonapp.com/) ($9-99/mo) | Financial goals + revenue forecasting | Same - forecasts from booked work, not prospecting pipeline |

Both solve "when will I get paid for current work" — not "will I have work after this mission ends?"

#### All-in-One Freelance Platforms

| Tool | What it does | Gap |
|------|--------------|-----|
| [Bonsai](https://www.hellobonsai.com/) | Proposals, contracts, invoicing, time tracking | Client management after you win, not pipeline before |
| [Zodot](https://zodot.co/) | Similar all-in-one | Same gap |
| [Flowlu](https://www.flowlu.com/) | CRM + project management | More generic, not freelance-income focused |

#### Lead Generation

[SolidGigs](https://solidgigs.com/) curates freelance job leads and sends them to you. Solves "finding opportunities" but not "managing the pipeline."

### Common Alternatives (What People Actually Use)

**1. Spreadsheets** — Most common starting point
- Free, flexible
- Pain: data chaos, no reminders, version hell, things slip through cracks
- *"The customer list that worked with 30 names becomes frustrating with 300"*

**2. Generic CRMs** — Pipedrive, HubSpot, Capsule
- Good pipeline visualization
- Pain: not freelance-aware (no TJM, no mission end dates, no income forecasting)
- Overkill features, complexity tax

**3. Notion DIY** — Very popular among devs
- Fully customizable
- Pain: you have to build everything yourself, no automation, no forecasting

**4. Nothing** — Memory, email, ad-hoc notes
- Reactive mode, scramble when mission ends

### The Gap

Existing tools split into two camps:

```
Camp A: Project/Income Management       Camp B: Sales CRM
(Cushion, Harpoon, Bonsai)             (Pipedrive, HubSpot, Notion)
         ↓                                       ↓
"Manage work you already have"          "Track leads and contacts"
         ↓                                       ↓
Doesn't help you FIND next work         Not freelance-income aware
```

**What's missing:** A tool that bridges both — showing "mission ends in X days" alongside "pipeline has Y qualified leads" with income forecasting that includes potential future work.

The specific pain — **"prospect while busy delivering"** — isn't directly addressed by any tool found.

### Is It Worth Building?

**Arguments for YES:**
- Clear gap in the market (pipeline + forecasting + freelance-aware)
- Pain is real (everyone scrambles, confirmed in conversations)
- Simple tools win with freelancers (€14/mo tool that saves 2hrs/week = €800+/year value)
- Existing solutions require stitching multiple tools together

**Arguments for CAUTION:**
- Cushion and Harpoon exist — would compete with established players
- Freelancers are notoriously cheap / reluctant to pay for tools
- The "use nothing" crowd may not convert easily
- Small market? Or large but fragmented?

**Key validation question:** Would I pay €15-30/month for this tool if someone else built it?

### Summary

| Question | Answer |
|----------|--------|
| Tools exist? | Yes, but fragmented. Forecasting OR pipeline, not both. |
| Alternatives painful? | Spreadsheets break down. CRMs aren't freelance-aware. |
| Worth building? | Potentially — if we nail the "pipeline + forecast" combo simply. |
| Extend to startups? | Yes — the "runway visibility" angle works for solopreneurs/founders too. |

**Leverage opportunity:** Build something that combines Cushion's forecasting with Pipedrive's pipeline, but freelance-native (TJM, mission dates, French tax context).

---

## Pain Points Identified

### 1. Opportunity Pipeline Management
- **Search** for opportunities (active prospecting)
- **Filter** incoming opportunities (passive/inbound)
- Not all opportunities are worth pursuing

### 2. Position Evaluation
- **Technical fit** - Do my skills match?
- **Challenge level** - Is it interesting work?
- **Learning opportunities** - Will I grow?

### 3. Financial Decision-Making
- **Income evaluation** - What's the total value?
- **Daily rate (TJM) calculation** - What should I charge?
- **Budget planning** - Cash flow, taxes, expenses

### 4. Logistics Assessment
- **Work location** - Remote / Partial remote / On-site
- **Transportation** - Commute time, costs, feasibility

### 5. Risk Evaluation
- Client reliability?
- Contract terms?
- Payment delays?
- Project scope clarity?

### 6. Document Production
- Produce **spot-on documents** (CV, proposals, cover letters?)
- Tailored to maximize selection chances
- "All lights green" decision framework

### 7. Skills Gap Analysis
- Across multiple offers, detect patterns
- "If I learned X, I'd qualify for 30% more opportunities"
- Learning investment decisions

---

## Layered Product Vision

The features from earlier exploration still matter, but they **stack**:

```
Layer 1: Pipeline Visibility (peace of mind)
    ↓
Layer 2: Opportunity Evaluation (work smarter)
    ↓
Layer 3: Document Generation (convert faster)
```

**Layer 1 — Pipeline Visibility (Foundation)**
- See what's coming, know if you're covered
- Dashboard: mission end date, pipeline health, income forecast
- Early warning: "Pipeline empty, mission ends in 30 days"

**Layer 2 — Opportunity Evaluation**
- When leads come in, quickly assess: worth my time?
- Don't waste energy on bad fits
- Prioritize the pipeline

**Layer 3 — Document Generation**
- For opportunities worth pursuing, produce tailored docs quickly
- Reduce friction between "yes I want this" and "proposal sent"

**Why this order matters:**
- Dashboard without evaluation = you see leads but waste time on bad ones
- Evaluation without docs = you know what's good but slow to act
- Docs without pipeline = you're still reactive

The dashboard is the **entry point** — the thing that gives peace of mind and pulls you into using the rest.

---

## Willingness to Pay Validation (2026-01-26)

**Would pay for:**
1. **Low-friction lead acquisition** — Few/no actions to get leads (LinkedIn, job boards, spreadsheet integrations)
2. **Smart filtering** — Automatically filter leads based on profile and expectations
3. **One-click doc generation** — CV, cover letter, proposal generated instantly

**Would pay extra for:**
1. **Intelligent notifications** — "Top lead incoming + mission ends in < 3 months"
2. **Interview scheduling** — Propose slots, sync with calendar
3. **Workflow streamlining** — Maximize automation, minimize manual work

### Key Reframe: Automation-First, Not Dashboard-First

The "would pay" criteria inverts our layering:

| Original Plan | What User Would Pay For |
|---------------|-------------------------|
| Layer 1: Dashboard (visibility) | Integrations (lead acquisition) |
| Layer 2: Evaluation (scoring) | Smart filtering (matching) |
| Layer 3: Document generation | One-click docs |

**The dashboard becomes a byproduct of automation, not the starting point.**

---

## Core Value Proposition

> **"Leads come to you, filtered and ready. One click to apply. Never scramble again."**

Evolution:
1. *"Stop winging it. Make confident decisions..."* — too focused on confidence/imposter syndrome
2. *"Never scramble... See your pipeline..."* — visibility-focused, but passive
3. **Current:** Automation-focused. The tool does the work, you make decisions.

---

## Feature Set (Priority Order — Automation-First)

### P0 - Must Have for MVP (Automation Core)
1. **Profile & Expectations Setup**
   - Skills, experience, preferences
   - Deal-breakers, minimum TJM, location constraints
   - This is the "filter" the system uses

2. **Lead Acquisition** *(hardest part)*
   - Import from sources (CSV minimum, integrations later)
   - Quick manual entry as fallback
   - Goal: minimize friction to get leads into system

3. **Smart Filtering & Matching**
   - Auto-score leads against profile
   - Surface best matches, hide poor fits
   - "Here are 3 leads worth your time"

4. **One-Click Document Generation**
   - Cover letter / pitch (priority)
   - Key questions — prepared answers tailored to the lead
   - Based on profile + lead requirements

### P1 - High Value (Visibility Layer)
5. **Mission Tracking**
   - Current mission with end date
   - "When does the money stop?"

6. **Pipeline Dashboard**
   - Pipeline health (count per stage)
   - Income forecast (booked + potential)
   - Goal tracking (billable days × TJM)

7. **Intelligent Alerts**
   - "Mission ends in 60 days, pipeline thin"
   - "High-match lead detected"
   - Contextual, not spammy

### P2 - Premium Features (Workflow Streamlining)
8. **Interview Scheduling**
   - Propose available slots
   - Google Calendar integration
   - Reduce back-and-forth

9. **Integrations**
   - LinkedIn (browser extension?)
   - French job boards (Malt, Comet, etc.)
   - Auto-import leads

10. **TJM Calculator**
    - SASU-aware (charges, taxes, expenses)
    - "This lead at €X/day = €Y net after charges"

### P3 - Future
11. **Skills Gap Radar**
    - Across all leads seen, what skills appear often?
    - Learning investment recommendations

12. **Referral/Network Management**
    - Track past clients, colleagues
    - Reminders to stay visible

---

## Data Model

### Core Entities

#### Profile (Foundation for Everything)
```
Profile {
  // Identity
  name
  title                   // "Senior Fullstack Developer"
  yearsExperience
  legalStructure          // SASU, EURL, etc.

  // Expectations (used for filtering)
  minimumTJM              // Won't consider below this
  targetTJM               // Ideal rate
  preferredLocations[]    // Remote, Paris, Hybrid...
  maxCommuteDays          // Days/week willing to commute

  // Skills (used for matching)
  technologies[]          // React, Node.js, PostgreSQL...
  domains[]               // Fintech, e-commerce, SaaS...

  // Deal-breakers
  blacklistedClients[]    // Companies to avoid
  blacklistedDomains[]    // Industries to avoid
}
```

#### Mission (Current/Past Work)
```
Mission {
  id
  client                  // "Acme Corp"
  title                   // "Platform Migration"
  startDate
  endDate                 // When does the money stop?
  rate                    // TJM
  daysPerWeek             // 4, 5, etc.
  status                  // active, completed, cancelled
}
```

#### Lead (Pipeline Entry)
```
Lead {
  id
  client                  // Company name
  title                   // "React Developer for Fintech"
  source                  // platform, recruiter, referral, direct
  sourceUrl               // Link to original posting
  stage                   // lead, qualified, negotiating, won, lost

  // From job posting (for matching)
  requiredTechnologies[]
  requiredDomains[]
  location
  offeredRate             // If disclosed
  estimatedStartDate

  // Computed
  matchScore              // % match against profile
  autoFiltered            // true if below thresholds

  // Tracking
  notes
  createdAt
  updatedAt
}
```

---

## MVP Decisions

### Lead Sources (in order of use)
1. **Recruiters** — Inbound, manual entry OK
2. **Freework.com** — Check for API/scraping feasibility
3. **LinkedIn** — Hard (hostile to automation), manual entry for now
4. **Comet** — Check for API/scraping feasibility

**MVP approach:** Manual entry for V1. Explore integrations for V2.

### Documents for One-Click Generation
**Priority for MVP:**
1. **Cover letter / pitch** — First impression, high leverage
2. **Key questions** — Prepared answers tailored to the specific lead

**Deferred:** Tailored CV, Technical proposal

### Core User Loop
```
1. Leads come in (manual entry for V1)
         ↓
2. System scores & filters → "3 worth your time"
         ↓
3. Review lead → "Generate docs"
         ↓
4. One-click: cover letter + key questions
         ↓
5. Apply externally (copy/paste or send)
         ↓
6. Update lead stage (applied, interviewing, etc.)
         ↓
7. Dashboard shows pipeline health
```

---

## Build Progress

### MVP v1 — COMPLETE (2026-01-27)

- [x] Fresh project setup (Next.js 15, TypeScript, Prisma, Tailwind)
- [x] Profile entity (name, skills, TJM, location, deal-breakers)
- [x] Lead entity (manual entry, match scoring)
- [x] Mission entity (current work, end date tracking)
- [x] Smart filtering (score leads against profile)
- [x] Document generation (cover letter + key questions)
- [x] Dashboard (pipeline health, mission countdown, alerts)
- [x] Navigation system with key stats
- [x] Lead & mission editing
- [x] Polish: toast notifications, validation, loading states

### Next Steps (Prioritized)

1. **Reduce friction** — Browser extension or bookmarklet for quick lead capture
2. **Smarter filtering** — Focus mode, auto-archive low-match leads
3. **Activity tracking** — Log calls, emails, interviews per lead
4. **Real-world validation** — Use the app for actual lead tracking

---

*Document will be updated as the product evolves.*
