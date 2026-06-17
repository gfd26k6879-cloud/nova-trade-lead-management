# NoSite Leads Production Readiness Audit

Date: 2026-06-16
Repo: `/Users/stevmq/lead-generation`
Branch: `codex/agile-discovery-engine`
Local commit: `59f8bf0`
Live production URL: `https://www.nosite.xyz`
Live health commit: `59f8bf0bf75a`

## Verdict

NoSite Leads is close to a controlled invite-only operator launch. It is not ready for a broad public launch yet.

The blockers are not signup or billing. The real public-launch gaps are:

- safe background-worker mutation semantics,
- admin lockout prevention,
- enrichment/concurrency hardening,
- public health and crawler posture,
- trust/privacy/support surface,
- guided onboarding,
- demo lifecycle controls,
- stale deployment/runbook docs,
- authenticated production smoke coverage.

## Audit Method

This audit combined one main-thread validation pass with four read-only subagent tracks:

- UI/UX and frontend quality,
- backend data flow and logic,
- security/auth/ops/deployment readiness,
- product launch and website/workflow completeness.

The initial audit was read-only. A follow-on remediation pass on 2026-06-16 used four scoped worker agents plus main-thread integration to fix the safest launch blockers first. Status labels below are local unless explicitly marked live or deployed.

## Remediation Update - 2026-06-16

Fixed locally:

- Finding 1: mutating worker `GET` handlers now return `405 Method Not Allowed` with `Allow: POST`.
- Finding 2: public `/api/health` now returns only coarse `status` and `checkedAt`; `next.config.ts` disables `X-Powered-By`.
- Finding 3: role/status updates now block self-demotion, self-disable, last-active-admin demotion, and last-active-admin disable.
- Finding 6: the Supabase runbook no longer recommends applying only the base schema SQL file and now requires all migrations in timestamp order with post-migration checks.
- Finding 7: the legacy batch worker route was deleted; individual scheduler endpoints are the only worker execution API.
- Finding 4: enrichment now leases one lead atomically, recovers stale `running` work, respects retry wait, records attempt/error metadata, and terminalizes repeated failures.
- Finding 5: crawl lead upsert now returns `{ id, created }` from atomic insert/update behavior and metrics count new versus duplicate from that result.
- Finding 8: crawl runs with failed-only units now terminalize as `error`; clean all-done runs still terminalize as `done`.
- Finding 9: user market access replacement validates requested markets before deleting existing access and performs replacement in a DB transaction.
- Finding 10: `/users` degraded-load state now renders a read-only recovery panel and does not mount mutation controls.
- Finding 11: the protected shell passes admins an open fulfillment badge count and fails closed to zero if the summary query fails.
- Finding 12: `/api/explore/map` now returns `401` for unauthenticated requests and `403` for forbidden requests instead of generic `500`.
- Finding 13: CSV formula hardening now ignores leading BOM/control/whitespace before formula detection and quotes carriage-return values.
- Finding 14: confirm dialogs and manual lead dialogs use shared focus trapping/restore behavior, and Kanban cards have keyboard-accessible move controls.
- Product launch gaps: invite-only trust pages, admin launch checklist, demo lifecycle controls, docs refresh, and Statistics value-proof reporting were added locally.

Still open:

- Finding 15: authenticated rendered desktop/mobile QA.
- Pushed/deployed/live-smoked status remains pending until the migration is applied and authenticated admin/researcher smoke is completed.

Remediation validation:

- Focused tests passed for worker methods, enrichment leases, crawl metrics/terminal status, demo lifecycle, trust pages, fulfillment badge source, dialog focus, Kanban keyboard controls, statistics value proof, health, explore map auth, CSV hardening, admin guards, users degraded state, and market-access replacement.
- Full local validation under Node 24 passed: `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`.
- Local production-mode smoke on `http://127.0.0.1:3001` passed for public trust/login rendering at desktop and mobile widths, protected-route unauthenticated redirects, deleted legacy batch route `404`, public trust page `200`s, robots posture, and worker/explore unauthenticated API behavior.
- Local `/api/health` returned only coarse JSON, but its local status was `503` because the dependency check was unhealthy in this machine state; live health still needs post-deploy verification.
- Authenticated rendered browser QA remains blocked until `E2E_STORAGE_STATE` or `E2E_SUPABASE_EMAIL`/`E2E_SUPABASE_PASSWORD` are configured and Playwright Chromium is available.

## Initial Verification Matrix (Pre-Remediation)

### Validated Locally

- `git status --short` was clean before the audit artifact was created.
- Shell Node was `v22.22.3`, which does not satisfy `package.json` `>=24 <25`.
- Switched verification to bundled Node `v24.14.0`.
- `npx tsc --noEmit` passed.
- `npm run lint` passed.
- `npm test` passed: 75 files, 365 tests.
- `npm run build` passed.
- Local dev server started at `http://localhost:3000`.
- `npm audit --omit=dev` reported the known moderate PostCSS advisory through `next@16.2.6`; npm's force fix proposes a breaking downgrade to Next 9, so it should not be applied blindly.

### Verified Live, Unauthenticated

- `GET https://www.nosite.xyz/api/health` returned `200` and detailed readiness JSON.
- Health response reported production runtime, `gitRef: codex/agile-discovery-engine`, `gitSha: 59f8bf0bf75a`, and OK checks for database, Supabase Auth/admin, worker cron secret, OpenAI, and Google Places.
- `GET https://www.nosite.xyz/login` returned `200`.
- `GET https://www.nosite.xyz/dashboard` redirected to `/login` with `307`.
- `GET https://www.nosite.xyz/scheduler` redirected to `/login` with `307`.
- `GET https://www.nosite.xyz/api/export/csv` returned `401` with `{"error":"Authentication required"}`.
- `GET https://www.nosite.xyz/api/explore/map` returned `500` with a generic map unavailable payload.
- `GET https://www.nosite.xyz/robots.txt` returned Cloudflare-managed content with `Allow: /`, then app content with `User-Agent: *` and `Disallow: /`. This live crawler policy should be owner-verified before public launch.

### Blocked Or Not Performed

- Authenticated rendered browser QA was blocked. Playwright was installed, but Chromium was missing; `npx playwright install chromium` stalled silently for roughly five minutes and had to be killed.
- Mutating authenticated E2E was not run against production-like data because those tests can create/archive leads and update settings.
- Vercel project settings, production branch ownership, Supabase migration status, RLS grants, Vault secrets, and cron history were not verified because this audit did not use account-owner dashboards/connectors.
- Authenticated production smoke for admin/researcher workflows still remains required.

## P0 / P1 Findings

### 1. Worker endpoints mutate state on GET

Severity: P0 for public launch.

Evidence:

- `src/app/api/crawl/process-next/route.ts:5` and `:9` expose `POST` and `GET` to the same worker.
- `src/app/api/crawl/enrich-next/route.ts:5` and `:9` do the same.
- `src/app/api/ai/verify-next/route.ts:5` and `:9` do the same.
- `src/app/api/ai/artifacts/process-next/route.ts:5` and `:9` do the same.
- `src/app/api/scores/recompute-stale/route.ts:7` and `:16` do the same.

Risk:

GET is a safe method by web convention. A logged-in admin/session or cron bearer token should not be able to trigger paid or mutating background work through navigation, prefetch, link preview, or CSRF-style top-level GET.

Fix:

Return `405 Method Not Allowed` for GET on every mutating worker route. Keep worker execution POST-only. Add tests for authenticated and unauthenticated GET returning 405 and not changing worker state.

### 2. Public health endpoint leaks deployment and secret readiness

Severity: P1.

Evidence:

- `src/app/api/health/route.ts:21` exposes unauthenticated health.
- `src/app/api/health/route.ts:66-73` returns `status`, timestamp, duration, runtime, and detailed checks.
- `src/lib/runtime-log-context.ts:8-14` includes Vercel env, Vercel URL, git ref, and short SHA.
- Live `/api/health` exposed production branch, deploy hostname, commit SHA, and service readiness for database, Supabase admin, worker secret, OpenAI, and Google Places.
- Live `/login` also returned `x-powered-by: Next.js`; `next.config.ts` does not set `poweredByHeader: false`.

Risk:

Public callers can fingerprint the deployment, active branch, configured third-party services, and operational readiness.

Fix:

Make public health coarse: `{ "status": "ok" }` or `ok/degraded/error`. Move detailed dependency checks behind admin auth or a probe secret. Set `poweredByHeader: false` in `next.config.ts`.

### 3. Admin role/status changes can lock out the workspace

Severity: P1.

Evidence:

- `src/lib/users/actions.ts:110-117` updates a user role with no self-demotion or last-admin guard.
- `src/lib/users/actions.ts:120-127` updates user status with no self-disable or last-admin guard.
- `src/lib/users/actions.ts:130-143` has those guards for user removal, so the missing guard is inconsistent.
- `src/lib/app-users.ts:34-63` only bootstraps the admin when no existing admin profile is present; it will not repair an existing disabled/demoted bootstrap user.

Risk:

An admin can demote or disable the last active admin and leave no path to manage users.

Fix:

Apply the same safety rules to role/status changes as removal: no self-disable, no self-demote, no demoting/disabling the last active admin. Audit old and new role/status values.

### 4. Enrichment has no lease, retry backoff, or terminal failure state

Severity: P1.

Evidence:

- `src/lib/crawl/enrichment.ts:40-45` selects one pending lead from `getUnenrichedLeads(1)`.
- `src/lib/db/queries.ts:7814-7821` selects `enrichment_status = 'pending'`.
- `src/lib/crawl/enrichment.ts:48-167` performs Place Details, observation logging, website health, scoring, and enrichment update without first marking the lead running.
- `src/lib/crawl/enrichment.ts:212-221` logs an error and returns `status: "error"`, but it does not update the lead out of `pending`.
- `src/lib/db/queries.ts:7824-7935` only terminalizes success as `enriched`.

Risk:

Concurrent cron ticks can process the same pending lead and duplicate paid Google Place Details / website checks. One failing high-score lead can loop forever.

Fix:

Add an atomic `leaseNextEnrichmentLead` path with statuses like `pending`, `running`, `retry_wait`, `error`, and `enriched`; add attempt counts, `next_retry_at`, stale lease recovery, and retry exhaustion tests.

### 5. Crawl lead upsert is not concurrency-safe

Severity: P1.

Evidence:

- `src/lib/db/schema.ts:290` makes `leads.place_id` unique.
- `src/lib/crawl/worker.ts:204-210` checks `leadExists(placeId)` before writing.
- `src/lib/crawl/worker.ts:241-267` calls `upsertLead`.
- `src/lib/db/queries.ts:4489` checks for an existing lead with `SELECT id FROM leads WHERE place_id = ?`.
- `src/lib/db/queries.ts:4507-4568` updates if found, while `:4571-4608` inserts if not found.

Risk:

Two crawl units discovering the same place can both miss the precheck; one insert wins and the other can unique-violate, failing the unit or causing noisy retries.

Fix:

Make `upsertLead` a single Postgres-safe `INSERT ... ON CONFLICT(place_id) DO UPDATE ... RETURNING id`, and use the returned metadata to count inserted versus updated leads. Add a concurrent same-place test.

### 6. Supabase deployment runbook has an unsafe manual migration fallback

Severity: P1.

Evidence:

- `docs/VERCEL_SUPABASE_DEPLOYMENT.md:42` says manual fallback can paste only `supabase/migrations/202605110001_full_schema.sql`.
- RLS and anon/authenticated revokes are in `supabase/migrations/202605120002_supabase_auth_roles.sql:52-96`.
- Scheduler cron wiring is in `supabase/migrations/20260514163203_scheduler_v2_sales_ready_pipeline.sql:108-120` and following lines.

Risk:

Following the documented fallback can create a database with tables but missing security grants, RLS posture, and scheduler infrastructure.

Fix:

Remove the single-file SQL fallback. Require all migrations in order, then validate RLS, revokes/default privileges, Vault secrets, and cron jobs.

## P2 Findings

### 7. Deleted legacy batch worker route bypassed scheduler wrapper controls

Evidence:

- The deleted legacy batch worker route directly ran every worker class.
- It does not use `src/lib/internal-worker-route.ts:33-89`, which handles scheduler enablement, `worker_runs`, deadlines, timeout classification, and route telemetry.
- Current worker metadata points to individual worker endpoints, not the batch route.

Risk:

If an old cron or admin hit still calls this route, paused paid workers can run and telemetry will be incomplete.

Fix:

Delete the route if unused. If retained, gate it behind a disabled-by-default environment flag and route each worker through the same scheduler wrapper semantics.

### 8. Crawl runs can finish as clean `done` while failed units remain

Evidence:

- `src/lib/crawl/worker.ts:75-79` marks a run `done` when `pending === 0 && running === 0`.
- `src/lib/db/queries.ts:4079-4100` tracks `failed`, but that count is not considered in the `done` decision.
- `src/lib/db/queries.ts:3976-3986` terminalizes failed units.

Risk:

Operators can see a run as complete even though work failed and needs intervention.

Fix:

Use `error`, `done_with_errors`, or keep the run actionable when `failed > 0`. Add a failed-only completion test.

### 9. User territory replacement is non-transactional

Evidence:

- `src/lib/users/actions.ts:183-196` calls `replaceUserMarketAccess`.
- `src/lib/db/queries.ts:3067-3078` deletes all existing access, then inserts the new market IDs one by one.
- `src/lib/lead-access.ts:44-47` uses market access to determine lead visibility for researchers.

Risk:

An invalid market ID or transient DB failure after delete can strip a user of territory access and hide work.

Fix:

Validate market IDs first. Wrap delete and insert in a transaction. Add a failure test that preserves previous access.

### 10. Users degraded-load state still renders mutation controls

Evidence:

- `src/app/(protected)/users/page.tsx:17-37` catches load errors and falls back to empty arrays.
- `src/app/(protected)/users/page.tsx:59-67` shows a warning but still renders `UsersClient`.
- `src/app/(protected)/users/users-client.tsx:259-302` renders the create-user invite form.

Risk:

When user/territory data is unavailable, an admin can still see a normal management workspace and attempt mutations against incomplete state.

Fix:

Make degraded user-load state read-only with a retry path, or pass an explicit degraded flag that disables invite, remove, territory, team, role, and status controls.

### 11. Fulfillment pressure is hidden in the global shell

Evidence:

- `src/app/(protected)/layout.tsx:47` hardcodes `fulfillmentCount={0}`.
- `src/components/nav-header.tsx:11` accepts `fulfillmentCount`, and `:67-70` shows a badge only when positive.
- `src/app/(protected)/fulfillment/page.tsx:75-88` already has real summary counts.

Risk:

Admin request pressure is only visible after navigating into Fulfillment; the global nav cannot alert the operator.

Fix:

Fetch a lightweight open fulfillment count in the protected shell or a cached header query and pass it into `NavHeader`.

### 12. `/api/explore/map` misclassifies auth failures as server failure

Evidence:

- `src/app/api/explore/map/route.ts:24-29` requires `view:workspace`.
- `src/app/api/explore/map/route.ts:55-75` catches all errors and returns `500` unless it detects a timeout.
- Live unauthenticated request returned `500` with generic map unavailable JSON.

Risk:

Auth failures look like incidents and pollute monitoring.

Fix:

Handle `UnauthorizedError` and `ForbiddenError` explicitly, matching `src/app/api/export/csv/route.ts:128-137`.

### 13. CSV formula hardening misses leading whitespace/control characters

Evidence:

- `src/lib/csv.ts:1-7` only prefixes values that start directly with `=`, `+`, `-`, or `@`.

Risk:

Spreadsheet formulas prefixed with tabs, carriage returns, or spaces can still execute in some spreadsheet clients.

Fix:

Guard on the first non-BOM/control/whitespace character. Add tests for `\t=`, `\r=`, and space-prefixed formulas.

### 14. Dialog and Kanban accessibility remain incomplete

Evidence:

- `src/components/confirm-dialog.tsx:24-36` handles Escape but has no initial focus, focus trap, or focus restore.
- `src/components/manual-lead-modal.tsx:80-160` renders a dialog but lacks focus trap/restore and Escape handling.
- `src/app/(protected)/leads/kanban-client.tsx:133-135` registers only `PointerSensor`, so Kanban movement is pointer-first.

Risk:

Keyboard and assistive-tech users have degraded workflows in destructive confirmations, manual lead creation, and Kanban movement.

Fix:

Centralize on a tested dialog primitive or shared focus-management hook. Add `KeyboardSensor` support or explicit per-card status actions.

### 15. Table-heavy routes need rendered mobile validation

Evidence:

The UI audit found multiple large tables wrapped in horizontal overflow containers without consistent minimum widths or mobile card fallbacks. Key routes include Explore, Leads, Quality, Team, and Statistics.

Risk:

Operational screens can become cramped or hard to scan on narrow devices. Browser screenshot validation is still blocked by the missing Playwright browser binary.

Fix:

Run authenticated desktop and mobile browser QA once browser tooling is restored. Add explicit min widths, truncation, and mobile card fallbacks where the screenshots prove issues.

## Product And Website Launch Gaps Beyond Signup/Billing

### 1. Decide launch posture: invite-only workspace or public product

Evidence:

- Root redirects to `/queue` if signed in, otherwise `/login`: `src/app/page.tsx:5-12`.
- Login copy says private workspace: `src/app/login/page.tsx:152-154`.
- Metadata disallows indexing: `src/app/layout.tsx:45-52`.
- `src/app/robots.ts:3-10` disallows all.
- Manifest says private workspace: `public/site.webmanifest:2-5`.
- README still describes a private single-user tool: `README.md:7` and `:173-178`.

Requirement:

If this remains invite-only, say that deliberately and add trust/support docs. If it is public, add a public homepage/onboarding/value-proof path before marketing traffic.

### 2. Add guided admin onboarding

The app has the pieces: settings, users, markets, discovery, coverage probe, lead harvest, quality, demos, and researcher assignment. It does not have a guided first-run sequence.

Requirement:

Add an admin-only launch checklist:

- verify Supabase/Auth environment,
- set Google/OpenAI keys and budgets,
- choose first market/cell/categories,
- run a coverage probe,
- promote to lead harvest,
- review quality queue,
- assign researcher access,
- create and share one demo,
- confirm worker scheduler health.

### 3. Complete demo lifecycle controls

Evidence:

- Public demo pages exist at `src/app/demo/[slug]/page.tsx:18-121`.
- Demo creation sets `is_published = 1` immediately: `src/lib/db/queries.ts:8380-8383`.
- Published lookup only checks `slug` and `is_published = 1`: `src/lib/db/queries.ts:8388-8404`.
- Lead detail can create/copy demo links: `src/app/(protected)/leads/[id]/lead-detail-client.tsx:1753-1771`.
- PRD expects edit/preview/publish/share controls: `prd.md:254-270` and `prd.md:552-555`.

Requirement:

Before public launch, add unpublish/revoke, preview versus published state, owner/audit visibility, basic view/share tracking, and a clear correction/removal path.

### 4. Publish trust, privacy, support, and data-source surfaces

Evidence:

- README says the app uses official Google Places API and does not store/display review text: `README.md:166-178`.
- PRD says no automated outbound delivery in MVP: `prd.md:41-47`.
- There is no visible public privacy/terms/support/data-source page in the route map.

Requirement:

Even for invite-only, publish clear pages or docs covering:

- data source and API compliance,
- no review scraping/no automated outbound sending,
- correction/removal requests from businesses,
- support contact,
- retention and export policy,
- who owns generated demo pages.

### 5. Refresh stale docs and runbooks

Evidence:

- README route map omits current routes like Explore, Team, Users, Quality, Statistics, Fulfillment, Scheduler, and Demos: `README.md:32-45`.
- System atlas route map is stale: `docs/ULTRA_SYSTEM_ATLAS.md:22-32`.
- System atlas still says demo generation is out of code path: `docs/ULTRA_SYSTEM_ATLAS.md:196-200`.
- Handoff references an older deployed commit and deployment ID: `docs/CODEX_HANDOFF.md:17-22`.
- Deployment runbook says production branch should be `main`: `docs/VERCEL_SUPABASE_DEPLOYMENT.md:97`, while live health reports `codex/agile-discovery-engine`.

Requirement:

Update docs before launch. Stale runbooks are operational risk, not cosmetic debt.

### 6. Add value-proof reporting

The app has lead quality, AI verification, outreach events, demos, meetings, wins/losses, costs, and statistics. Public or buyer-facing launch needs a concise value report:

- qualified no-site leads found,
- correction/false-positive rate,
- cost per qualified lead,
- contactable leads,
- demos shared,
- demo-to-meeting,
- stale/failure/blocked rates.

## Recommended Launch Sequence

### Before Any Public Exposure

1. Make worker mutations POST-only.
2. Minimize or protect `/api/health`; disable `X-Powered-By`.
3. Add last-admin guards to role/status changes.
4. Delete the legacy batch worker route.
5. Repair `/api/explore/map` auth status handling.
6. Update deployment runbook so all migrations apply in order.
7. Verify Vercel production branch and Cloudflare robots/content-signal behavior.

### Before Invite-Only Beta

1. Verify enrichment leasing/retry/error terminal states after migration.
2. Verify atomic `upsertLead` behavior against production Supabase after migration.
3. Verify crawl completion status when failed units remain.
4. Make user territory replacement transactional.
5. Add guided admin onboarding checklist.
6. Run authenticated production smoke with a test admin and researcher.
7. Restore Playwright browser tooling and capture desktop/mobile screenshots.

### Before Broad Public Launch

1. Decide and implement public posture: invite-only entry or marketing/onboarding site.
2. Publish privacy/terms/support/data-source pages.
3. Add demo unpublish/revoke/preview/share lifecycle.
4. Add value-proof launch reporting.
5. Refresh README, system atlas, deployment runbook, and handoff docs.
6. Run a full production smoke with non-mutating probes plus a dedicated disposable test workspace or fixture data.

## What "Done" Should Mean For Public Launch

Do not treat public launch as done until all are true:

- validated locally under Node 24,
- authenticated production smoke passed for admin and researcher,
- live health and robots posture reviewed by owner,
- background workers cannot mutate from GET,
- last-admin lockout is impossible,
- enrichment/crawl concurrency risks are covered by tests,
- public trust/support/data pages exist,
- demo links can be revoked,
- docs match current production.
