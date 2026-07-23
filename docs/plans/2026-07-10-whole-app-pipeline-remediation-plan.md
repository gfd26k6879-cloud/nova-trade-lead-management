# NoSite Leads Whole-Application Remediation Plan

## Planner Metadata

- Repository: `/Users/stevmq/lead-generation`
- Branch: `codex/agile-discovery-engine`
- Date: July 10, 2026
- Mode: full audit-to-remediation checkpoint with three read-only audit workers and parent-owned implementation
- Primary workflow: discovery -> crawl -> enrichment -> AI verification -> quality/queue -> outreach/fulfillment -> scheduler/admin
- Baseline: clean worktree; Node 24.14.0; TypeScript, ESLint, 85 Vitest files / 405 tests, and production build passed
- Browser baseline: local production-mode `/login` and `/privacy` passed desktop/mobile overflow and runtime-error checks; protected rendered QA lacks an authenticated storage state

## Executive Goal

Make the current invite-only operator application reliable and maintainable end to end, remove confirmed pipeline and access defects, and consolidate UI state/dialog/contracts without replacing the product architecture or creating a second source of truth.

## Source Of Truth Contract

- Intent: a working lead-discovery and manual-outreach operating system, not a marketing site.
- Current behavior: Supabase Postgres is production truth; SQLite is the local adapter; server actions and worker routes own mutations; route clients own interaction state.
- Expected outcome: no known in-scope P0/P1 code defect, material P2 workflow/UI defects remediated or explicitly deferred, and honest local/browser/live release evidence.
- Truth owners: `src/lib/db/queries.ts` for persisted contracts, `src/lib/scheduler/worker-metadata.ts` for worker identity, server actions for authorization/mutation orchestration, and shared components/tokens for UI behavior.
- Contract boundary: browser clients consume typed projections and actions; they do not own database or worker contracts.
- Displaced paths: duplicated client-side lead/worker/artifact/settings interfaces are replaced by browser-safe canonical types; ad hoc status and dialog implementations are replaced by shared primitives.
- Cutover: one slice at a time with focused tests; old paths are removed in the same patch.
- Acceptance evidence: focused failure-first tests, full Node 24 validation, real local routes/screenshots, safe live read-only checks, and an owner-style acceptance review.
- Evidence lane: `.implementation/whole-app-remediation-ledger.jsonl` plus command/browser receipts.
- Kill criteria: stop a slice if it needs live mutation, paid provider calls, credential creation, destructive schema changes, or a second authoritative data path.
- Forbidden moves: weakening auth/types/tests, blanket migration push, production worker enablement, fake E2E success, storing Google review text, or patching generated output as source.

## Orchestration Decision

- Mode: full worker run for audit; parent-owned integration for implementation.
- Worker count: three audit workers (backend/data/security, frontend/accessibility, release/runtime).
- Reason: independent evidence across code/data, rendered workflow, and production/release state.
- Visible threads: not used; this is one user-owned task.
- Reconsider trigger: use an independent validation worker after high-risk auth/network/data edits or when acceptance evidence conflicts.

## Audit Receipt

### Confirmed P1 code defects

1. `getPlaceDetails()` uses async cache reads/writes without `await`, so the default cache path returns a Promise as a place and skips Place Details.
2. A rejected `ensureDbReady()` Promise is cached for the life of the warm process.
3. Worker routes initialize/clean the DB before authorization and persist a `worker_runs` row for rejected public requests.
4. Website probes accept untrusted HTTP(S) destinations, follow redirects automatically, and do not block private/loopback/link-local targets.
5. Stage-B Place Details responses persist raw Google review text despite the documented no-review-storage invariant.
6. AI verification/artifact success can be demoted to error/retry by later usage/audit bookkeeping failures.
7. Worker route deadlines race mutating tasks without cancellation propagation.
8. Quality's Mark Contacted path can report outreach success after ignoring a failed status action; the underlying event and lead updates are not transactional.
9. Dark mode uses light-theme hard-coded foregrounds for critical state badges and a near-white Coverage confirmation surface with dark-theme text tokens.
10. Health checks perform repeated sequential DB/settings reads with no overall deadline.

### Confirmed P2 code/product defects selected for remediation

- Researcher admin-request creation omits the territory read boundary.
- Shared lead, worker, artifact, settings, status, and notification contracts are duplicated and drifting.
- Coverage, Workbench, and Lead Archive dialogs bypass the existing focus-trapped dialog system.
- Location scope loading can hang permanently and form controls are not properly labelled.
- Scheduler/Statistics are missing from global navigation; a Coverage discovery anchor is broken; hash active-state handling is ambiguous.
- Explore token search lacks combobox semantics; informational badges create excessive tab stops.
- Explore cleanup aborts are misreported as timeouts.
- Success and failure notices share the same visual tone.
- Default E2E can exit zero with every authenticated test skipped; read-only and mutating suites are mixed.
- SQLite export/import omits current operational tables and one encrypted-key field.

### Live/release blockers that are not authorized mutations

- A fresh July 12 read-only Supabase snapshot confirms all five production scheduler toggles are off, no worker run occurred in the last seven days, one crawl run is paused, and 5,744 leads are in the AI `queued` state (last updated June 12). Re-enabling the pipeline is a cost-bearing production mutation and requires an owner decision.
- Remote Supabase history is now read-only verified through `202606160001_launch_readiness_reliability`; the three newer tracked migrations remain unapplied. Historical remote-only drift is still unresolved, so do not use a blanket `supabase db push`.
- Authenticated admin/researcher browser state, clean-database migration replay, backup/restore, and production rollback are not currently provable.

## Native Planning Superiority

- Baseline risk: a generic rewrite would polish screens while missing the broken enrichment cache, live paused workers, compliance drift, and skipped E2E.
- Improvement: this plan binds every slice to canonical owners, failure-first evidence, browser/live boundaries, cleanup, and explicit kill criteria.
- Target score: 5/5 implementation-ready audit-to-remediation handoff.

## Background Browser Lane

- Target: isolated local production-mode app first; public live routes only for read-only verification.
- Safety: no account or production mutations; protected checks require supplied auth state.
- Required receipt: target, surface, viewport, auth state, console/page errors, overflow, screenshots, durable state, and cleanup.
- Stop condition: local server/browser closed and temporary artifacts removed or explicitly retained as evidence.

## Phase Plan

### Phase 1 - Pipeline correctness, data safety, and boundary hardening

1. Repair Place Details cache ordering/await behavior and add hit/miss/Stage-B/write-failure tests.
2. Strip reviews before cache/observation persistence and add a tracked Postgres cleanup migration for existing JSONB rows (do not apply live).
3. Make DB readiness single-flight retryable after failure.
4. Authorize worker requests before initialization and eliminate rejected-request worker-row writes.
5. Add a shared safe outbound HTTP fetcher with DNS/IP and redirect validation; migrate website-health and AI viability probes.
6. Separate successful AI result persistence from best-effort bookkeeping and guard retry transitions from rewriting complete artifacts.
7. Introduce cooperative worker cancellation where provider/task boundaries support it; keep provider deadlines inside the route deadline.

### Phase 2 - Atomic lifecycle and authorization

1. Wrap outreach event plus lead lifecycle updates in a DB transaction; make score recompute explicitly repairable.
2. Make Quality Mark Contacted use the canonical outreach action and surface typed errors with `try/finally` busy cleanup.
3. Apply the market-access read boundary before researcher fulfillment requests.
4. Add focused failure/rollback/revoked-territory tests.

### Phase 3 - Shared modern UI/UX system

1. Add theme-aware semantic tone tokens and shared `StatusNotice`/badge styling; migrate critical AI/worker/quality/leads/fulfillment feedback.
2. Extend the existing focus-managed dialog primitive for async/form content; migrate Coverage confirmation first, then Workbench and Archive where scope remains coherent.
3. Repair LocationScopePicker error/retry/labels/live feedback.
4. Complete navigation for Scheduler/Statistics, correct the discovery anchor, and make menu/hash state keyboard- and route-safe.
5. Add combobox/listbox semantics to token search, remove informational badge tab stops, and distinguish map deadline aborts from cleanup.
6. Verify light/dark desktop/mobile surfaces; do not broadly restyle already sound PageShell/table layouts without rendered evidence.

### Phase 4 - Contracts and honest release tooling

1. Replace duplicated lead/worker/artifact contracts with canonical browser-safe types or `Pick` projections.
2. Add `typecheck` and composed read-only release scripts; ensure an all-skipped authenticated gate fails clearly.
3. Add unauthenticated public/redirect visual QA and expand protected screenshot routes to Queue/Fulfillment/Settings.
4. Split or guard mutating E2E so non-loopback targets are refused unless explicitly enabled.
5. Complete export/import table policy, encrypted-key redaction, schema-versioned manifest, and dry-run validation.
6. Bound and deduplicate health checks; add hung-dependency tests.
7. Refresh README/atlas/runbook runtime, auth, encryption-secret, rollback, and known-blocker guidance.
8. Track (do not force) the moderate Next/PostCSS advisory until a stable Next release ships a fixed bundled PostCSS.

## Validation Plan

- Focused Vitest after each slice, including new failure-injection and access-boundary tests.
- Node 24.14.0: `tsc --noEmit`, ESLint, full Vitest, Next production build.
- Playwright: public desktop/mobile and protected screenshot gate when auth exists; fail-closed redirect/API checks otherwise.
- Security probes: private IPv4/IPv6, DNS-private answer, redirect-to-private, auth-before-init, and anonymous no-write.
- Data probes: persisted Place payload has no `reviews`; transaction rollback leaves no orphan event; migration SQL is syntactically reviewed but not applied live.
- Live read-only: health, security headers, worker/toggle/backlog state, deploy identity when available.
- Cleanup: local server, browser, temp screenshots, and transient files accounted for before pass status.

## Acceptance Criteria

- All selected P1 code defects have direct tests and pass the full validation ladder.
- No Google review content is written by current code; historical production cleanup remains an explicit unapplied migration/manual step.
- Rejected worker requests do not initialize/repair/seed/clean or create worker history.
- Untrusted website URLs cannot reach private/reserved destinations, including through redirects.
- Quality/outreach state cannot contradict because of ignored action results or partial event/lifecycle writes.
- Critical statuses and confirmation copy remain readable in light and dark themes.
- Release commands distinguish executed, skipped, read-only, mutating, local, live, and blocked checks.
- Remaining production pause/migration/auth/backup decisions have exact owner actions and are never represented as locally fixed.

## Current Release Validation Receipt - July 12, 2026

- `npm run release:check` passed under Node 24: TypeScript, full ESLint, the 23-table recovery verifier, 96 Vitest files / 515 tests, a Next production build, a temporary loopback production server, and all five public read-only Playwright tests.
- Acceptance review found `/explore` missing from the proxy's protected-page list. The route list is now canonicalized and table-tested across all 12 protected base paths; the rebuilt application returns a 307 to `/login` with `Cache-Control: private, no-store, max-age=0, must-revalidate, no-transform` for unauthenticated `/explore` before the protected layout runs.
- Acceptance re-review found that an AI queue audit failure could demote otherwise completed discovery/enrichment work. Queue audits and failed-enqueue audits now use the existing best-effort AI bookkeeping boundary, with abort propagation preserved. A SQLite trigger regression test proves discovery remains complete and queued when audit storage is unavailable.
- Isolated browser inspection of the current local build passed at desktop and 390x844 mobile widths: login and privacy screens had meaningful rendered content, no relevant console errors, no framework overlay, and no horizontal overflow. The public `Forgot?` route reached the reset-password screen and an unauthenticated `/queue` redirected to `/login`.
- Current live read-only checks passed: `https://www.nosite.xyz/api/health` and `/login` returned HTTP 200, `/queue` returned 307 to `/login`, and all three responses carried CSP, HSTS, nosniff, frame, and permissions-policy headers. These checks do not prove authenticated workflows, database state, or deployment of this local branch.
- A fresh live `robots.txt` check returned only the intended invite-only rules and no longer contained the historical Cloudflare-wide `Allow: /` prefix.
- The unapplied Google-review cleanup migration was exercised against a disposable PostgreSQL 16 database with top-level, nested, and array-contained review keys. It removed every review key, preserved unrelated values, and dropped its temporary helper function. This is local migration-syntax/behavior evidence only; it did not touch Supabase.
- Read-only Supabase checks confirmed the production migration head, scheduler/backlog state, and that all 23 application tables deny direct `SELECT` and `INSERT` to `anon` and `authenticated`. The live advisor exposed a publicly executable `public.rls_auto_enable()` SECURITY DEFINER helper; `202607120002_harden_database_function_access_and_fk_indexes.sql` revokes that unnecessary execution surface and adds six advisor-reported foreign-key indexes. It passed in a disposable PostgreSQL 16 rehearsal and remains unapplied to production.
- Vercel confirms production is `READY` at `783127179c8db009c388aa34d8078452063736c5`, the pre-remediation baseline. There were no Vercel runtime error clusters in the last seven days; this does not make the uncommitted local remediation deployed.

## Remaining External Risks And Owner Actions

- **Provider timeout billing:** when a provider accepts a request but the route is aborted before a response arrives, the application cannot know final token usage from that response. Owner: application operations. Next action: reconcile persisted AI usage against the OpenAI project usage view on a daily cadence while worker deadlines are enabled; if the configured budgets must be strict hard limits, add conservative pre-call reservation and release/settlement rather than relying only on post-response accounting.
- **Cross-window AI cap precision:** artifact retries persist cumulative canonical usage so a failed usage-event insert cannot permit overspend. If an artifact is updated in the active cap window and one or more attempt events are missing, reconciliation conservatively charges the full cumulative artifact cost to that window. This can stop work early across a window boundary, but it cannot weaken the cap. Owner: application engineering. Next action: only if exact cross-window attribution becomes operationally necessary, add a transactional per-attempt usage ledger with immutable timestamps and migrate the fallback calculation to it.
- **Dependency advisory:** `npm audit --omit=dev` currently reports two moderate PostCSS XSS advisories bundled through Next 16.2.6. The only offered automated fix is a breaking forced change to Next 9.3.3, so it was not applied. Owner: application engineering. Next action: track the upstream Next/PostCSS release that removes the bundled advisory, then update deliberately and rerun `npm run release:check`.
- **Stale-session server log noise:** the installed Supabase SSR/Auth SDK path logs an expected `refresh_token_not_found` error while it removes an invalid refresh cookie, even though the application turns that condition into a private redirect to `/login`. The proxy’s focused test proves the redirect and cookie expiry; the direct installed-SDK simulation showed the same removal behavior and no user-facing failure. Owner: application engineering. Next action: retain the authenticated `getUser()` boundary and cookie-expiry response; do not globally suppress errors. Re-evaluate this noise during the next deliberate Supabase dependency update.
- **Protected browser proof:** no admin/researcher storage state or credentials were available. Owner: workspace administrator. Next action: provide an approved `E2E_STORAGE_STATE` (or disposable E2E credentials) and run `npm run test:e2e:auth` plus `npm run test:e2e:launch`; use a disposable target and explicit mutation flags for `npm run test:e2e:mutating`.
- **Production operations:** the scheduler is currently paused with a stale AI backlog. Owner: production operator. Next action: review provider budgets and worker secrets, take a backup, decide which scheduler(s) may be enabled, and observe a bounded first worker run; do not enable all workers by default.
- **Supabase security configuration:** the advisor reports leaked-password protection disabled. It also reports `pg_net` installed in `public`; `anon` and `authenticated` currently have `USAGE` on `net` plus `EXECUTE` on its outbound HTTP functions. The database migration role is `postgres`, while those functions are owned by `supabase_admin` and `postgres` lacks grant option, so this privilege remediation cannot be safely automated from the repository. Owner: Supabase project owner/support. Next action: revoke API-role `USAGE`/`EXECUTE` from `net` while retaining the cron owner's access, then rerun the security advisor.
- **Schema cutover:** `202607100001_remove_stored_google_reviews.sql`, `202607120001_reconcile_researcher_ai_feedback_schema.sql`, and `202607120002_harden_database_function_access_and_fk_indexes.sql` remain unapplied, and the remote-only historical migration version remains unresolved. Owner: database operator. Next action: take a backup, review the tracked SQL, reconcile linked history, apply intentionally, then run authenticated read-only smoke and recovery verification.

## Implementation Orchestrator Handoff

- First slice: Place Details cache + review-storage invariant because it currently breaks enrichment and data policy.
- Next: DB readiness and worker auth/no-write, then safe outbound fetch, then atomic outreach/authz, then UI/release consolidation.
- Evidence tier: HIGH for network/auth/data/AI/worker slices; STANDARD for UI/contracts/tooling.
- Triggered probes: malformed input, stale state, dirty worktree, misleading success output, hung command/task, and live/local confusion.
- Do not claim complete until the engineering acceptance review and production-readiness gate have re-run against the final diff.
