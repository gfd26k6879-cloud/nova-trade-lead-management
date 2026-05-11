# NoSite Leads - Implementation Planning Document

## 1) Purpose
This document is the implementation plan for building NoSite Leads as a reliable, continuously usable application. The product requirements document (PRD) in `prd.md` remains the source of truth for requirements.

Primary outcomes:
- discover businesses with high demand proxies and weak website presence,
- manage outreach in a lightweight customer relationship management (CRM) flow (customer relationship management),
- generate one-page demos quickly,
- run sequential coverage across Colorado zip codes with clear resume behavior.

## 2) Product Strategy
### Core strategy
- Build a strong data ingestion and coverage engine first.
- Keep the first user interface (UI) simple, fast, and operationally clear (user interface).
- Deploy as a private online application (single-tenant) so sequential jobs continue running even when the Mac is offline.
- Add intelligent scoring in two layers:
  - rules-based score (MVP),
  - large language model (LLM) score as a later overlay (large language model).

### Why this order
- Reliable ingestion and state tracking are the highest-risk technical pieces.
- A simple UI enables immediate use while reducing build complexity.
- Private online deployment improves reliability for long-running sequential coverage jobs.
- LLM scoring depends on stable and complete source data, so it should be layered after the core pipeline is trusted.

## 3) Scope by Phase
### Phase 0 - UI/UX Blueprint First
- Define a private solo-operator interface focused on speed and clarity.
- Define a visual direction using Apple Liquid Glass styling principles:
  - soft translucency,
  - layered depth,
  - minimal chrome,
  - high readability and contrast.
- Produce low-fidelity wireframes for:
  - Dashboard,
  - Coverage,
  - Leads,
  - Lead Detail,
  - Settings.
- Finalize the interaction model before coding:
  - what actions are primary,
  - where decisions happen,
  - what should be hidden by default.
- Create a compact design system:
  - spacing scale,
  - typography scale,
  - simple status color map,
  - reusable table/action patterns.
- Validate flow with a clickable prototype (or static screen flow) before implementation starts.

### Phase 1 - Foundations
- Next.js app scaffold, local auth, SQLite schema migrations, and baseline access control.
- Simple UI shells:
  - Dashboard
  - Coverage
  - Leads
  - Lead Detail
  - Settings
- Basic run controls:
  - start sequential run,
  - pause,
  - resume.
- Private deployment baseline:
  - production environment setup,
  - secrets management,
  - basic uptime/error monitoring.

### Phase 2 - Colorado Zip Coverage Engine
- Load all Colorado zip codes into `zip_codes`.
- Create crawl units per zip code and category.
- Process units sequentially only (concurrency = 1).
- Persist per-unit status and progress.
- Resume safely from previous state.
- Integrate Google Places discovery and enrichment with retries.

### Phase 3 - Lead Management and Export
- Lead lifecycle statuses and outreach events.
- Simple table-first operations for daily use.
- CSV export with active filters.

### Phase 4 - Demo Page Builder
- One-page demo generation and publishing.
- Public share URL for published demo pages.

### Phase 5 - LLM Scoring Layer (Later)
- Add a model pipeline that scores:
  - website-need likelihood,
  - close-likelihood as potential customer.
- Keep this as a separate asynchronous process that never blocks ingestion.

## 3.1) Private Solo-Operator UI/UX Principles
This product is intentionally single-user and private, so interface design should optimize for operator throughput, not multi-user collaboration.

- One-screen decisions:
  - avoid deep page nesting,
  - keep key context and actions visible together.
- Action-first layout:
  - every screen should answer "what should I do next?"
  - make primary actions obvious and secondary actions collapsed.
- Defaults over configuration:
  - ship with strong defaults,
  - keep advanced controls hidden behind an "Advanced" toggle.
- Information density with clarity:
  - table-first views,
  - progressive disclosure for details,
  - avoid unnecessary visual noise.
- Keyboard efficiency:
  - support fast navigation and bulk actions with shortcut-friendly controls.
- Reliability visibility:
  - always show run status, errors, and queue progress in plain language.
- Consistent interaction patterns:
  - same filter bar behavior across pages,
  - same status chips, same action button locations.
- Apple Liquid Glass application:
  - use subtle glass surfaces only on key containers (not everywhere),
  - prioritize legibility over visual effects,
  - keep motion minimal and purposeful.

## 3.2) UI/UX Deliverables Before Build
- User flow map from "start run" to "contact lead".
- Wireframes for all primary pages (desktop-first).
- Click path spec for top daily tasks:
  - start/pause/resume run,
  - inspect failed unit and retry,
  - open next lead and generate outreach package.
- Component inventory:
  - status chips, score breakdown panel, queue card, lead table row actions.
- Visual token sheet:
  - spacing, typography, colors, states.
- Apple Liquid Glass token spec:
  - blur levels,
  - surface opacity levels,
  - border glow/highlight intensity,
  - fallback tokens for low-performance rendering.
- Usability checklist for solo operation:
  - no critical action deeper than 2 clicks from its main screen,
  - top daily actions reachable within 1 screen.

## 3.3) Deployment Model and Environments
- Deployment model: private online web app, single tenant.
- Environments:
  - local development on Mac,
  - staging,
  - production.
- Runtime expectations:
  - sequential crawler keeps running server-side without requiring laptop uptime,
  - restart-safe jobs via persisted crawl unit state.
- Access control:
  - single-user auth,
  - restricted access policy (allowlist and strong credentials),
  - server-only key storage.

## 4) Data Model Plan
### New/updated core tables
- `zip_codes`
  - `zip`, `city`, `state`, `lat`, `lng`, `is_active`
- `crawl_runs`
  - run metadata, start/end timestamps, totals, status
- `crawl_units`
  - `zip`, `category`, optional keyword, status, attempts, last_error, timing, optional page token state
- `leads`
  - one row per `user_id + place_id` (unique)
- `lead_sources`
  - links each lead to discovery context (`zip`, `category`, run)
- `outreach_events`
  - channel, note, timestamp
- `settings`
  - niche weights, host lists, rate limit values

### Future tables for LLM layer
- `lead_ai_scores`
  - `lead_id`, `model_name`, `website_need_score`, `close_likelihood_score`, `confidence`, `rationale`, `computed_at`
- `lead_ai_jobs`
  - queue/status for scoring tasks, retries, errors

## 5) Sequential Coverage Logic (Colorado-first)
### Coverage unit definition
A unit is: `(zip_code, category, optional_keyword_variant)`.

### Deterministic execution order
- order by `zip_code asc`,
- then category priority,
- then creation time.

### Run behavior
- pick next `pending` unit,
- mark `running`,
- complete all pages for the unit,
- mark `done` or `failed` with structured error.

### Resume behavior
- on startup, recover stale `running` units (timeout-based),
- continue with `pending`, then retry queue,
- never re-run `done` units unless user selects refresh mode.

### Incremental behavior
- dedupe by `user_id + place_id`,
- if lead exists, update mutable fields and keep source history,
- maintain last-seen timestamps for re-enrichment policy.

## 6) Simple UI Plan
### Dashboard page
- current run status,
- leads discovered today,
- failed units count,
- quick actions: start, pause, resume.

### Coverage page
- zip-level progress table:
  - total units, done, failed, remaining, completion percent,
- filters by city and status,
- retry failed units action.

### Leads page
- simple table with filters:
  - status, website status, zip code, category, minimum reviews, minimum rating,
- sort by rules score (default).

### Lead detail page
- profile fields,
- outreach timeline,
- status update,
- notes and reminder date,
- future AI section placeholder:
  - "AI score pending" or latest score snapshot.

### Settings page
- niche weights,
- social/basic host lists,
- rate limit and retry settings,
- compliance note.

## 7) LLM Layer Plan (Future, but UI-ready now)
### Objectives
- score probability that business needs a better website,
- score probability of becoming a paying customer.

### Design principles
- asynchronous and non-blocking,
- versioned prompts and model metadata,
- re-runnable scoring jobs,
- explainable short rationale for each score.

### MVP-ready placeholder now
- include nullable score fields or joined read model in lead detail/list,
- show "Not scored yet" state in UI,
- add action to queue scoring for selected leads (disabled or hidden until enabled).

### Later activation
- background job pulls leads missing fresh scores,
- calls model provider,
- writes scores and rationales,
- updates UI automatically.

## 8) Reliability and Scalability Plan
- strict server-only keys and validated inputs.
- idempotent upserts for leads and units.
- bounded retries with exponential backoff for external calls.
- audit log records for search and enrichment runs.
- required indexes:
  - unique `(user_id, place_id)` on leads,
  - `(user_id, score)`, `(user_id, status)`,
  - `(status, zip)` on crawl units.
- pagination for large tables.
- queue-ready boundary for runner logic so concurrency can be increased later without rewriting core logic.

## 9) Quality Gates
### Unit tests
- website classification,
- scoring math,
- crawl unit state transitions,
- dedupe/idempotent upsert behavior.

### Integration tests
- Google Places retry and field masks,
- sequential runner picks exactly one next unit at a time,
- resume behavior after interruption,
- export respects active filters.

### Manual checks
- run over a small Colorado zip subset,
- pause/resume works,
- failed units can be retried,
- coverage view reflects reality,
- lead detail shows expected fields and statuses.

## 10) Implementation Roadmap (Recommended Order)
1) Complete Phase 0 UI/UX blueprint and sign-off.
2) Build schema and migrations for coverage engine.
3) Seed Colorado zip codes.
4) Build private deployment baseline and environment configuration.
5) Build sequential runner service and run controls.
6) Integrate discovery and enrichment with dedupe.
7) Build coverage and leads UI pages based on approved blueprint.
8) Add CRM operations and CSV export.
9) Add demo builder.
10) Add LLM scoring job pipeline and UI integration.

## 11) Immediate Next Actions
- approve this planning document as baseline,
- complete Phase 0 UI/UX blueprint first,
- implement Phase 1 and Phase 2 next,
- run pilot on a small set of Colorado zip codes,
- validate run/resume/coverage behavior before scaling to all zip codes.

## 12) Lead Quality Optimization Plan (Do This Early)
Goal: improve lead quality without expanding into full business software replacements.

### Lead score v2 (rules layer first)
- Keep current demand score, then add new factors:
  - website weakness signals (no secure transport layer, poor mobile friendliness proxy, missing contact form, missing clear calls to action),
  - business activity signals (high reviews with recent recency when available),
  - niche buying-intent weights by category and zip code competitiveness,
  - contactability signals (phone present, website status, listing completeness).
- Store factor-level breakdown so each score is explainable in the user interface (UI) (user interface).

### Data points to add
- `website_checks` per lead:
  - `has_https`, `has_contact_form`, `has_primary_cta`, `checked_at`, `check_confidence`
- `lead_score_factors`:
  - per-factor values, normalized values, and weighted contribution
- `lead_score_versions`:
  - model versioning so score changes are auditable over time

### Acceptance target
- top-ranked leads should show a higher meeting-booked rate than baseline ranking after at least 2 to 4 weeks of data.

## 13) Faster Conversion Plan (From Discovery to First Contact)
Goal: shorten time from lead discovery to meaningful outreach.

### Now Queue (priority action list)
- Add a focused queue that only includes leads that are:
  - high score,
  - contactable,
  - not recently contacted,
  - in active target zip codes.
- Default sorting:
  - `priority_score = lead_quality_score * 0.6 + contactability_score * 0.2 + freshness_score * 0.2`
- Show only the top actionable set (for example, top 25) to reduce decision friction.

### One-click outreach package
- For each lead, generate:
  - short opener,
  - website issue summary,
  - value proposition bullets,
  - demo link snippet.
- Keep this as copy-and-send output so external systems handle delivery.

### Conversion-focused tracking
- Add explicit timestamps:
  - `discovered_at`,
  - `first_contacted_at`,
  - `first_reply_at`,
  - `meeting_booked_at`.
- Measure and display:
  - median hours from discovery to first contact,
  - reply rate by score band,
  - meeting rate by score band.

## 14) Third-Party Tool Boundary (Integration-First)
Goal: avoid rebuilding tools that are already best-in-class.

### Keep inside NoSite Leads
- lead discovery and enrichment,
- lead scoring and prioritization,
- zip coverage memory and sequential execution,
- demo generation,
- lead intelligence and recommended next actions.

### Keep outside NoSite Leads
- mass email sending and sequencing,
- calling and text messaging delivery,
- invoicing, contracts, and accounting,
- long-term project management.

### Integration style
- Start with simple exports and copy-ready payloads.
- Then add lightweight connectors or webhooks to selected providers.
- Do not block core lead workflow on third-party service availability.

### Delivery scope clarification
- No in-application outbound delivery is required for minimum viable product (MVP) (minimum viable product).
- Outreach content generation is in scope, but actual sending stays in external tools.
- Primary in-app action is "prepare best next lead and message package", not "send".

## 15) Metrics That Define Success for This Product Focus
Track these key performance indicators (KPI) (key performance indicators) weekly:
- high-priority leads contacted within 24 hours,
- reply rate of top-score leads,
- meeting booked rate of top-score leads,
- time from discovery to first contact,
- time from first contact to meeting booked.

If these improve while keeping stable run reliability, the product is succeeding on its core mission.

## 16) Cost-First Build Constraints (Cheapest Viable Operation)
Goal: run profitably as a side-hustle tool with minimal fixed cost.

- Default to free or low-cost tiers for hosting and database where reliable enough.
- Enforce strict Google Places API (application programming interface) budget controls:
  - daily call cap,
  - per-run call cap,
  - emergency stop when budget threshold is reached.
- Use narrow field masks and sequential execution to reduce wasted calls.
- Prioritize scoring/filter improvements over broad data expansion.
- Defer non-revenue-critical features until validation thresholds are met.

### Required budget controls in product
- `max_calls_per_day`
- `max_calls_per_run`
- `max_monthly_api_spend` (estimated guardrail)
- `stop_on_budget_limit` toggle
- run summary with estimated API cost and cost per qualified lead

## 17) Business Thesis Failure Modes and Mitigations
This business can fail if assumptions are wrong. Track these risks explicitly.

### Failure modes
- target businesses do not value websites enough to pay,
- response rates remain too low for cold outreach economics,
- demo creation time per lead is too high for side-hustle throughput,
- offer positioning is generic and fails to differentiate,
- deal sizes are too small to cover acquisition effort.

### Mitigations
- run short validation cycles with strict thresholds,
- focus on niches with stronger buying intent and proven budget,
- productize one clear offer and fixed turnaround,
- prioritize fastest path from lead discovery to first contact.

## 18) Validation and Kill Gates (Before Scaling)
Use hard gates to decide whether to continue, iterate, or stop.

### Initial validation window
- first 100 to 150 high-priority contacts.

### Continue criteria (example defaults)
- reply rate >= 5 percent,
- meeting booked rate >= 2 percent,
- at least one paid close within initial validation window,
- average time from discovery to first contact <= 24 hours.

### Stop-or-pivot criteria
- two consecutive validation windows below all core thresholds,
- estimated monthly tool plus API spend exceeds expected revenue,
- effective hourly earnings remain below your personal minimum target.
