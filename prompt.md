You are an expert full-stack and product engineer. Build a production-ready lead generation web application called "NoSite Leads" based on the project PRD at the repository root. If `prd.md` exists, treat it as the source of truth and do not invent requirements that conflict with it.

## 1) Mission and Scope
- Build a reliable application that identifies high-demand local businesses with weak or missing websites, prioritizes them, supports outreach workflow, and generates a one-page demo.
- Deliver an MVP (minimum viable product) first, then extend in later phases.
- Optimize for continuous use: stable data model, idempotent jobs, clear error visibility, and maintainable architecture.

## 2) Non-Negotiable Constraints
- Use only official Google Places API (application programming interface) (New) endpoints under `places.googleapis.com/v1/...`.
- Do not scrape Google Search or Google Maps pages.
- Keep all secrets server-side only. Never expose provider keys to client code.
- Implement this end-to-end flow: discovery -> enrichment -> website classification -> scoring -> CRM (customer relationship management) pipeline -> demo generation -> CSV (comma-separated values) export.
- Build so local setup is minimal and repeatable.

## 3) Required Technology Stack
- Next.js 14+ App Router with TypeScript.
- Tailwind CSS (Cascading Style Sheets) plus shadcn/ui.
- Local single-user authentication (authentication) and SQLite via `better-sqlite3`.
- Zod for validation.
- TanStack Table for lead lists.
- React Hook Form for forms.
- Server Actions first; use Route Handlers where appropriate.
- Background processing for MVP is sequential with rate limits, but code must include a queue abstraction boundary for future workers.

## 4) Implementation Phases (Hard Gated)
Execute in phases and stop after each phase with a status report.

### Phase 1: Foundations
- Project scaffold, auth, schema migrations, row-level security (RLS), base layouts.
- Core pages exist as routes with initial functional shells:
  - `/dashboard`, `/search`, `/leads`, `/leads/[id]`, `/demos`, `/demos/[id]`, `/settings`.
- Stop and report after Phase 1.

### Phase 2: Discovery and Enrichment Core
- Search builder and run lifecycle.
- Places text search integration with pagination.
- Place details enrichment with retries and backoff.
- Deduplication and idempotent updates by `user_id + place_id`.
- Website classification and scoring.
- Leads table with filters/sorting.
- Stop and report after Phase 2.

### Phase 3: CRM and Export
- Lead status lifecycle, outreach events, reminders.
- Table-first CRM workflows; Kanban is preferred but optional for MVP.
- Filter-aware CSV export.
- Stop and report after Phase 3.

### Phase 4: Demo Generator
- One-page demo builder with editable fields and preview.
- Public share route by slug; unauthenticated read access for published demos.
- For MVP, hosted route is required. Static HTML export is deferred.
- Stop and report after Phase 4.

## 5) Functional Requirements (MVP)
### A) Authentication and Ownership
- Single username/password authentication through local session cookies.
- Every user can only access their own records.
- Enforce row-level security on all user-owned tables.

### B) Lead Discovery
- Search inputs:
  - Location text
  - Multi-select categories
  - Optional keywords
  - Max result target
  - Optional filters (minimum reviews, minimum rating, include/exclude website statuses)
- For each category and location pair, call:
  - `POST /v1/places:searchText` using `X-Goog-FieldMask`.
- Persist search runs with discovered/enriched/error counts and status.
- Handle `nextPageToken` pagination.

### C) Lead Enrichment
- For each place identifier, call:
  - `GET /v1/places/{place_id}` with strict field masks.
- Required fields:
  - `id`, `displayName`, `formattedAddress`, `nationalPhoneNumber`
  - `websiteUri`, `googleMapsUri`
  - `rating`, `userRatingCount`, `types`, `businessStatus`
  - `priceLevel` or `priceRange` when present
- Cache raw JSON payload for debugging and reprocessing.
- Implement retry with exponential backoff for `429` and `5xx`.

### D) Website Classification
- Missing `websiteUri` -> `none`
- Social host list -> `social-only`
- Basic host list -> `basic-site`
- Otherwise -> `custom-domain`
- Exclude `custom-domain` by default in lead targeting.
- Host lists must be configurable in Settings.

### E) Scoring and Ranking
- Score formula:
  - `score = log(1 + review_count) * rating * niche_weight * website_multiplier`
- Default multipliers:
  - `none=1.2`, `social-only=1.1`, `basic-site=1.0`, `custom-domain=0.0`
- Niche weights editable in Settings.
- Leads sortable/filterable by score, reviews, rating, category, and website status.

### F) CRM and Outreach Tracking
- Lead statuses:
  - `new`, `verified`, `contacted`, `preview_sent`, `meeting_set`, `closed_won`, `closed_lost`
- Outreach event logging with timestamp, channel, and notes.
- Optional reminder date on lead records.

### G) Demo Generator
- One-page demo includes:
  - Name, category, address, phone
  - Editable services list
  - Call-to-action buttons (Call Now, Request Appointment)
  - Map link
  - Rating and review count only (no review text scraping)
- Public share URL by slug for published demos.

### H) Export
- CSV export must include filtered leads and key columns:
  - name, phone, address, category, rating, review_count, website_status, website_uri, maps_url, score, status, last_contacted

## 6) Reliability, Security, and Scalability Requirements
- Idempotent enrichment: update existing lead by `user_id + place_id`, never duplicate.
- Retry policy with bounded backoff and error capture.
- Configurable rate limiting to protect quotas and reduce failures.
- Clear run-level observability in UI (counts, status, last error).
- Server-only key access and strict validation on inputs.
- Audit logs for key operations (search runs, enrichment runs).
- Database indexes at minimum:
  - `leads(user_id, place_id)` unique
  - `leads(user_id, score)`
  - `leads(user_id, status)`
- Use pagination for large tables and result sets.
- Keep architecture queue-ready: isolate enrichment runner from transport so workers can be added later without core rewrites.

## 7) Required Repository Outputs
- Complete Next.js codebase with all required routes and core components.
- `lib/googlePlaces.ts` typed client for Places API (application programming interface).
- `lib/classifyWebsite.ts` with configurable host lists.
- `lib/scoring.ts` with defaults and settings-driven overrides.
- SQLite schema and migration layer including schema, indexes, and constraints.
- `.env.example` with required environment variables only (no secrets).
- `README.md` with:
  - setup steps
  - API (application programming interface) key instructions
  - migration steps
  - local run commands
  - architecture notes and file tree
  - known limitations and next-phase roadmap

## 8) Testing and Quality Gates (Mandatory)
Before declaring a phase complete, pass these checks:

### Unit Tests
- Website classification function.
- Scoring computation.
- Deduplication/idempotent upsert logic.

### Integration Tests
- Places client retry behavior on `429` and `5xx`.
- Field-mask usage for text search and details calls.
- Search run persists counts and statuses correctly.

### Manual Verification Checklist
- Search produces lead records.
- Website status filters work.
- Score sorting is correct.
- CSV export respects active filters.
- Published demo URL loads without authentication.

## 9) Definition of Done Per Phase
At each phase stop point, output:
1) Completed scope and acceptance criteria results.
2) File tree for changed areas.
3) Migration summary and policy summary.
4) Test results with command output summary.
5) Risks, gaps, and exact next actions.

Do not silently continue to the next phase. Stop, report, and wait for approval.