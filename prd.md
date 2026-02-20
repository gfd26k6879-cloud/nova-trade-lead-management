# NoSite Leads — Product Requirements Document (PRD)

## 1. Overview

**NoSite Leads** is a lead generation + outreach CRM application that helps a user:
1) discover local businesses likely to have **high customer volume** and **high revenue potential** (via reliable proxies),
2) identify businesses that **lack a website** or only have **social/basic sites**,
3) generate a **1-page demo website** quickly,
4) manage outreach and conversion (pipeline + logging),
5) export prioritized lead lists.

The core insight: **website absence** (or weak presence) + **strong demand proxies** (reviews/ratings/category) = high-value web design leads.

Deployment model: private online web application (single-user, single-tenant) so long-running enrichment and coverage jobs continue even when the local Mac is offline.

Geographic strategy for MVP: Colorado-first, zip-code-by-zip-code sequential coverage with persistent run memory and resume behavior.

---

## 2. Goals and Success Metrics

### Goals
- Create a repeatable pipeline from discovery → ranking → outreach → demo → close.
- Minimize time from “search” to “call list” to **minutes**.
- Support “demo-first selling”: user can show a branded preview immediately.
- Run continuously with deterministic sequential coverage over Colorado zip codes.
- Improve conversion speed from discovery to first contact and from first contact to meeting booked.

### Success Metrics (MVP)
- Generate ≥ 200 qualified leads per target metro in < 10 minutes.
- ≥ 80% of generated leads have complete phone + address (from API).
- Lead ranking correlates with real-world “busy” businesses: review_count and rating.
- User can create and publish a demo page in < 3 minutes per lead.
- Export CSV for outreach within 1 click.
- Sequential coverage reaches 100% of active Colorado target zip codes for selected categories.
- Resume reliability: interrupted runs continue without duplicate crawl units or duplicate leads.
- Top-priority leads are contacted within 24 hours at a higher rate than baseline.

---

## 3. Non-Goals (MVP)
- No scraping of Google pages or review text.
- No automated cold-email/SMS (short message service) sending (only tracking + copy-to-clipboard).
- No revenue “truth” estimation (only proxies).
- No multi-tenant agency features beyond a single user account (team support can come later).
- No replacement of third-party tools for invoicing, contracts, or long-term project management.
- No in-app outbound delivery execution (email, call, SMS (short message service) sending remains in third-party tools).

---

## 4. Users and Personas

### Primary User
- Solo web designer / small agency owner who sells websites to local businesses.

### Key Jobs-to-be-Done
- “Find businesses that are busy and don’t have a real website.”
- “Show them a preview quickly and close the deal.”
- “Track follow-ups so I don’t lose leads.”

---

## 5. Key Concepts

### “High customer” proxy
- Primarily: **userRatingCount** (review count) and **rating**.

### “High revenue” proxy
- **Category weighting** (dentists, med spas, HVAC, lawyers, etc.).
- Optional: priceLevel/priceRange when provided by Places API.
- Optional: multi-location signals (later).

### Website Status Categories
1. **none**: `websiteUri` missing
2. **social-only**: websiteUri points to social platforms (facebook/instagram/linktree/tiktok/yelp)
3. **basic-site**: websiteUri points to `business.site` / Google Sites (or other “weak site” list)
4. **custom-domain**: a real domain site

Default target leads: **none, social-only, basic-site**.

---

## 6. Functional Requirements

### 6.0 UI/UX Design First (Phase 0)
- UI/UX (user interface and user experience) design is the first implementation phase before backend coding begins.
- The product is designed for a solo operator, private usage, and action-first workflows.
- Visual system direction: Apple Liquid Glass-inspired interface style with:
  - minimal and clean layout,
  - subtle translucent surfaces,
  - high legibility and low visual noise,
  - consistent components and interaction patterns.
- Deliverables before implementation:
  - wireframes for Dashboard, Coverage, Leads, Lead Detail, and Settings,
  - click paths for daily tasks (start run, resume run, retry failed unit, contact next lead),
  - compact design tokens (spacing, typography, status colors, glass surface levels).

---

### 6.1 Authentication and Data Ownership
- Supabase Auth (email/password) for MVP.
- Each user sees only their data.
- RLS policies enforced for all tables.

---

### 6.2 Lead Discovery (Search)
User builds a search/crawl plan:
- Location strategy: zip-code coverage for Colorado (default)
- Optional city/region targeting for ad-hoc runs
- Categories (multi-select)
- Optional keywords
- Max results target (e.g., 200)
- Optional advanced filters:
  - min reviews
  - min rating
  - include/exclude website statuses
  - exclude chains (heuristic, later)

**Data Source:** Google Places API (New), official endpoints.

**Process:**
- For each crawl unit (`zip + category + optional keyword`), call **Text Search (New)**.
- Store each returned place ID.
- Dedupe by place ID globally for the user.
- Store the search parameters + run metadata + crawl unit state.

**Acceptance Criteria:**
- Search run creates a record with counts: discovered, enriched, errors.
- Dedupe works: same place ID not duplicated across searches.
- Pagination handled when nextPageToken is returned.
- Crawl units are persisted and can be resumed deterministically.

---

### 6.2.1 Sequential Coverage Orchestration (Colorado-first)
- Create crawl units from active Colorado zip codes and selected categories.
- Process units sequentially (`concurrency = 1`) in deterministic order:
  - zip asc, then category priority, then created_at.
- Persist crawl unit statuses: `pending`, `running`, `retry_wait`, `done`, `failed`.
- Recover stale `running` units after timeout and re-queue safely.
- Never re-run `done` units unless refresh mode is explicitly selected.

**Acceptance Criteria:**
- A run can be stopped and resumed without reprocessing completed units.
- Failed units can be retried without creating duplicate leads.
- Coverage progress is visible per zip code and globally.

---

### 6.3 Lead Enrichment (Place Details)
For each place ID:
- Call Place Details (New).
- Request only minimal fields via FieldMask:
  - `id`, `displayName`, `formattedAddress`, `nationalPhoneNumber`
  - `websiteUri`, `googleMapsUri`
  - `rating`, `userRatingCount`
  - `types`, `businessStatus`
  - `priceLevel`/`priceRange` if available

**Reliability:**
- Retry with exponential backoff for 429 and 5xx errors.
- Rate limiting: configurable delay between calls (MVP).

**Acceptance Criteria:**
- ≥ 90% of discovered place IDs successfully enriched (assuming valid API key and typical Places results).
- Errors logged and visible in UI.

---

### 6.4 Website Classification
Given `websiteUri`:
- If missing/empty → `none`
- If host matches **social list** → `social-only`
- If host matches **basic-site list** → `basic-site`
- Else → `custom-domain`

Configurable host lists in Settings.

**Acceptance Criteria:**
- Classification displayed in Leads table and detail.
- User can toggle inclusion/exclusion by status.

---

### 6.5 Scoring and Ranking
Compute lead score to prioritize outreach.

**Default formula:**
- `base = log(1 + userRatingCount) * rating`
- `score = base * niche_weight(category) * website_multiplier(status)`

Default multipliers:
- none: 1.2
- social-only: 1.1
- basic-site: 1.0
- custom-domain: 0.0 (excluded by default)

Niche weights editable in Settings.

**Acceptance Criteria:**
- Leads sortable by score.
- Score recalculates when settings change (or via “recompute scores” action).
- Score has explainable factor breakdown for operator trust.

---

### 6.5.1 Priority Queue (Now Queue)
- Build a focused queue of top actionable leads.
- Include leads that are:
  - high score,
  - contactable,
  - not recently contacted,
  - in currently targeted zip coverage areas.
- Queue sorting should support weighted prioritization combining lead quality, contactability, and freshness.

**Acceptance Criteria:**
- User can open a "Now Queue" view with top actionable leads.
- Queue updates as lead status and contact timestamps change.

---

### 6.6 Lead Management (CRM)
Each lead has:
- status: `new`, `verified`, `contacted`, `preview_sent`, `meeting_set`, `closed_won`, `closed_lost`
- notes
- reminder_date (optional)
- outreach log entries

Views:
- Table view with filters + bulk actions
- Kanban pipeline by status (MVP optional but preferred)

**Acceptance Criteria:**
- Update status from table and lead detail.
- Log outreach events with timestamp + channel + notes.

---

### 6.6.1 Outreach Package Generator
- For each lead, generate a copy-ready outreach package:
  - short personalized opener,
  - identified website issue summary,
  - value proposition bullets,
  - demo link snippet (when available).
- Delivery remains external to the app (copy/export/integration).

**Acceptance Criteria:**
- User can generate outreach package in one action from lead detail or queue.
- Generated package includes business-specific context fields.

---

### 6.7 Demo Website Generator (1-page)
Goal: create a “good enough” one-page preview quickly.

Demo page includes:
- Business name (from Places)
- Category
- Address + phone
- Call-to-action buttons:
  - Call Now (tel:)
  - Request Appointment (simple mailto: or a small form)
- Services list (editable)
- Rating + review count (no scraped review text)
- Google Maps link

Capabilities:
- Create demo from a lead with one click.
- Edit fields and preview.
- Publish demo at a public share URL (slug).
- Optionally export as static HTML (download) in later version.

**Acceptance Criteria:**
- Demo can be created and shared for any enriched lead.
- Demo URL loads without auth.

---

### 6.8 Export
Export leads to CSV with chosen filters.

Default columns:
- name, phone, address, category
- rating, review_count
- website_status, website_uri
- google_maps_url
- score
- status
- last_contacted

**Acceptance Criteria:**
- CSV downloads successfully.
- Export respects active filters.

---

### 6.9 Settings
- Niche weights editor
- Website host lists (social/basic)
- Rate limit settings (delay between API calls)
- Crawl settings:
  - active zip scope,
  - category priorities,
  - stale unit timeout,
  - refresh policy (re-run done units after N days, optional)
- Compliance note:
  - “This app uses official Google Places API endpoints; no scraping.”

**Acceptance Criteria:**
- Settings persist and affect scoring/classification.

---

## 7. Non-Functional Requirements

### Security
- Google API key stored only server-side.
- RLS enforced.
- Input validation with Zod.
- Audit log table for key actions (search runs, enrichment runs).

### Reliability
- Idempotent enrichment: if lead exists, update fields instead of duplicating.
- Retries on transient API errors.
- Resume-safe sequential runs with persisted crawl unit state.

### Performance
- Use indexes on:
  - leads(user_id, place_id)
  - leads(user_id, score)
  - leads(user_id, status)
- Pagination for tables.
- Queue and coverage queries indexed for deterministic sequential worker speed.

### Availability / Operations
- Private online deployment with always-on worker execution for sequential crawling.
- Basic uptime and run-failure monitoring for crawl and enrichment jobs.

### Cost Control
- Build and run on the cheapest viable stack first (free/low-cost tiers where stable).
- Enforce Google Places API (application programming interface) budget guardrails:
  - max calls per day,
  - max calls per run,
  - stop run when budget threshold is hit.
- Include run-level estimated API cost reporting and cost per qualified lead visibility.
- Prioritize score and conversion improvements over broad API expansion.

### Compliance / TOS
- Use only official Google Places API (New).
- Do not scrape Google search/maps pages.
- Do not store or display scraped review text.
- User responsible for compliant outreach practices (local laws).

---

## 8. Data Model (Postgres)

### Tables

#### users (managed by Supabase Auth)
- id (uuid)

#### searches
- id (uuid)
- user_id (uuid)
- location_text (text)
- categories (text[])
- keywords (text)
- max_results (int)
- created_at (timestamp)
- status (enum: queued/running/done/error)
- discovered_count (int)
- enriched_count (int)
- error_count (int)
- last_error (text)

#### zip_codes
- zip (text, primary key)
- city (text)
- state (text) // default strategy begins with CO
- lat (numeric)
- lng (numeric)
- is_active (bool)

#### crawl_runs
- id (uuid)
- user_id (uuid)
- mode (enum: coverage/manual/refresh)
- status (enum: queued/running/paused/done/error)
- started_at, ended_at (timestamps)
- discovered_count (int)
- enriched_count (int)
- error_count (int)
- last_error (text)

#### crawl_units
- id (uuid)
- user_id (uuid)
- crawl_run_id (uuid)
- zip (text)
- category (text)
- keyword (text)
- status (enum: pending/running/retry_wait/done/failed)
- next_page_token (text)
- attempt_count (int)
- started_at, finished_at (timestamps)
- last_error (text)

#### leads
- id (uuid)
- user_id (uuid)
- place_id (text, unique per user)
- name (text)
- address (text)
- phone (text)
- categories (text[])
- rating (numeric)
- review_count (int)
- website_uri (text)
- website_status (enum: none/social/basic/custom)
- maps_uri (text)
- business_status (text)
- score (numeric)
- status (enum crm status)
- notes (text)
- reminder_date (date)
- created_at, updated_at (timestamps)
- last_contacted_at (timestamp)
- discovered_at (timestamp)
- first_contacted_at (timestamp)
- first_reply_at (timestamp)
- meeting_booked_at (timestamp)

#### place_cache
- place_id (text)
- raw_json (jsonb)
- fetched_at (timestamp)

#### outreach_events
- id (uuid)
- user_id (uuid)
- lead_id (uuid)
- channel (enum: call/text/email/walkin/other)
- note (text)
- created_at (timestamp)

#### lead_sources
- id (uuid)
- user_id (uuid)
- lead_id (uuid)
- crawl_unit_id (uuid)
- zip (text)
- category (text)
- created_at (timestamp)

#### website_checks
- id (uuid)
- user_id (uuid)
- lead_id (uuid)
- has_https (bool)
- has_contact_form (bool)
- has_primary_cta (bool)
- check_confidence (numeric)
- checked_at (timestamp)

#### lead_score_factors
- id (uuid)
- user_id (uuid)
- lead_id (uuid)
- score_version (text)
- factor_name (text)
- factor_value (numeric)
- normalized_value (numeric)
- weighted_contribution (numeric)
- created_at (timestamp)

#### demos
- id (uuid)
- user_id (uuid)
- lead_id (uuid)
- slug (text unique)
- template_id (text)
- config_json (jsonb)  // services, headline, CTA text, etc.
- is_published (bool)
- created_at, updated_at

---

## 9. System Architecture

### Frontend
- Next.js App Router
- Pages:
  - /dashboard
  - /coverage
  - /search (optional ad-hoc)
  - /queue
  - /leads
  - /leads/[id]
  - /demos
  - /demos/[id]
  - /settings

### Backend
- Next.js Server Actions / Route Handlers:
  - Create Crawl Plan
  - Run Sequential Coverage
  - Resume/Pause Coverage
  - Enrich Leads
  - Update Lead
  - Generate Outreach Package
  - Create Demo / Publish Demo
  - Export CSV

### Integrations
- Google Places API (New):
  - POST /v1/places:searchText
  - GET /v1/places/{place_id}

### Background Processing (MVP)
- Sequential crawl unit worker with rate limiting and resume-safe checkpoints.
- Later upgrade path:
  - job queue (e.g., pg-based or Redis-based) + workers.

### Deployment
- Private online deployment (single-tenant, single-user).
- Local Mac used for development, not required to stay online for production runs.

---

## 10. UI Requirements

### Global Design Direction
- Apple Liquid Glass-inspired visual design system:
  - subtle translucency and depth for key panels,
  - high readability,
  - minimal visual clutter,
  - fast and consistent interaction patterns for solo operation.

### Leads Table
- Filters: status, website status, category, min reviews, min rating
- Sorting: score desc default
- Bulk actions: update status, export CSV, create demo

### Lead Detail
- Quick actions: copy phone, open maps
- Outreach log timeline
- Status dropdown + notes editor
- Verification checklist

### Demo Builder
- Live preview
- Publish toggle
- Share link copy

### Coverage + Queue Views
- Coverage view:
  - zip-level progress, done/pending/failed counts, retry controls
- Queue view:
  - top actionable leads only ("Now Queue")
  - one-click outreach package generation

---

## 11. MVP Milestones

### Milestone 0: UI/UX Blueprint
- Solo operator workflow mapping
- Wireframes for core pages
- Apple Liquid Glass-inspired token and component spec

### Milestone 1: Foundations + Private Deployment Baseline
- Next.js + Supabase Auth
- DB schema + RLS
- Private online environment setup
- Leads table + lead detail (manual entry ok)

### Milestone 2: Colorado Sequential Coverage + Enrichment
- Coverage planner (zip-code units)
- Sequential worker (concurrency 1)
- Places Text Search + Place Details
- Deduping + caching
- Website classification + scoring

### Milestone 3: CRM + Queue + Export
- Status pipeline + outreach logs
- Now Queue + outreach package generation
- CSV export

### Milestone 4: Demo Generator
- Template demo page
- Publish/share URL

---

## 12. Testing and QA

### Unit Tests (minimum)
- classifyWebsite(uri)
- scoring computation
- dedupe logic

### Integration Tests
- Places client handles retries and FieldMask usage.
- Sequential runner resumes correctly after interruption.
- Coverage run creates leads and enriches them without duplicate units.

### Manual QA Checklist
- Search produces leads
- Sequential coverage across selected Colorado zips works and resumes safely
- Leads filtered correctly by website status
- Score sorting correct
- Demo publish/share works
- CSV export matches filters

---

## 13. Risks and Mitigations

- **API cost/quota**: implement strict FieldMasks and rate limiting; show usage stats per run.
- **False “no website”**: add manual verification checklist; optional search verification later.
- **Data quality**: store raw response + fetched_at; allow re-enrichment.
- **Low willingness to pay**: target businesses may not value website upgrades enough to buy; mitigate via niche selection and offer positioning tests.
- **Low response rates**: outreach conversion may be too low for positive economics; mitigate via tighter prioritization and stronger outreach package quality.
- **Time economics failure**: demo and follow-up effort can exceed side-hustle capacity; mitigate with strict process templates and a top-action queue.
- **Pricing mismatch**: deal values may not justify acquisition effort; mitigate with productized packages and minimum deal-size thresholds.

---

## 14. Future Enhancements
- Multi-location detection by fuzzy matching name/address
- Auto-verification via lightweight web search API (optional)
- Outreach automation integrations (Twilio, SendGrid) with compliance safeguards
- Team accounts + shared pipelines
- Template library + per-niche landing pages

---

## 15. Unit Economics and Validation Gates

### Validation Objective
Prove this is a viable side-hustle workflow before expanding feature scope.

### Initial Validation Window
- First 100 to 150 high-priority contacts generated by the system.

### Track Weekly
- high-priority leads contacted within 24 hours,
- reply rate,
- meeting booked rate,
- first paid closes,
- estimated API/tool spend,
- effective hourly earnings.

### Continue Criteria (default)
- reply rate >= 5 percent,
- meeting booked rate >= 2 percent,
- at least one paid close during initial validation window,
- discovery-to-first-contact median <= 24 hours.

### Pivot or Stop Criteria
- two consecutive windows below core conversion thresholds,
- estimated monthly costs exceed expected side-hustle revenue,
- effective hourly earnings remain below personal minimum threshold.