# NoSite Leads Authenticated Admin Audit

Date: 2026-05-20  
Auditor stance: external auditing firm, safe authenticated testing  
Local target: `http://localhost:3000`  
Production target: `https://lead-generation-orcin.vercel.app`  
Admin account tested: `masihation@gmail.com`  

## Executive Summary

Remediation loop status: the confirmed live blockers found in this audit have been fixed and re-verified on production. The admin account lands on `/queue` as an `admin`, production now serves the Workbench, Revenue Dashboard, Team Board, Fulfillment, Coverage, Users, Leads, Quality, Statistics, and Settings routes, and the final authenticated browser pass found no page errors, no app HTTP failures, no horizontal overflow, and no axe WCAG A/AA violations across the tested desktop/mobile surfaces.

Security hardening has also been deployed: protected routes redirect unauthenticated users to `/login`, CSV export returns `401` without auth, production auth cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`, core browser security headers are present, and `/api/health` now returns only `{"status":"ok"}`.

The remaining audit limitation is not a confirmed code defect: the live audit still does not have dedicated researcher/team-lead test accounts or clearly marked `AUDIT-2026-05-20-*` records, so destructive or state-changing tests such as claim races, researcher-created fulfillment requests, duplicate request creation, and admin status transitions were intentionally not performed against real leads.

## Evidence Collected

Authenticated local evidence:

- JSON: `test-results/authenticated-full-audit-2026-05-20/authenticated-full-audit.json`
- Screenshots: `test-results/authenticated-full-audit-2026-05-20/`
- Key screenshots: `queue-mobile.png`, `dashboard-desktop.png`, `fulfillment-mobile.png`, `users-desktop.png`, `settings-desktop.png`

Authenticated production evidence:

- JSON: `test-results/production-auth-audit-2026-05-20/production-auth-audit.json`
- Screenshots: `test-results/production-auth-audit-2026-05-20/`
- Key screenshots: `after-login.png`, `fulfillment.png`, `team.png`

Final remediation evidence:

- Final live audit JSON: `test-results/live-remediation-2026-05-20-final-2/live-authenticated-audit.json`
- Final live screenshots: `test-results/live-remediation-2026-05-20-final-2/`
- Deployment verified: `https://lead-generation-orcin.vercel.app`

Supporting verification already completed earlier on 2026-05-20:

- `npm run lint`: passed.
- `npm run test`: passed, `33` test files and `160` tests.
- `npm run build`: passed.
- `npm audit --omit=dev`: 2 moderate advisories via Next's bundled PostCSS dependency.

## Tested Coverage

Local authenticated admin routes tested:

- `/queue`
- `/dashboard`
- `/fulfillment`
- `/team`
- `/leads`
- `/leads?assigned=me`
- `/leads?view=kanban`
- `/quality`
- `/statistics`
- `/scheduler`
- `/coverage`
- `/settings`
- `/users`

Local mobile routes tested at phone viewport:

- `/queue`
- `/dashboard`
- `/fulfillment`
- `/team`
- `/leads`
- `/users`

Production authenticated admin routes tested:

- `/queue`: `200`
- `/dashboard`: `200`
- `/users`: `200`
- `/leads`: `200`
- `/fulfillment`: `200`
- `/team`: `200`
- `/coverage`: `200`
- `/quality`: `200`
- `/statistics`: `200`
- `/settings`: `200`

Public production probes:

- `GET /queue` redirects unauthenticated users to `/login`.
- `GET /api/export/csv?limit=1` returns `401 Authentication required`.
- `GET /api/crawl/process-next` without auth returns `401 Authentication required`.
- `GET /api/crawl/process-next` with fake bearer returns `401 Authentication required`.
- `GET /api/health` returns `200` with only `{"status":"ok"}`.

## Findings

### F-001: Production is behind the revenue/accountability implementation

Severity: Critical business blocker  
Status: Fixed and production-verified  
Affected surface: Production deployment

Evidence:

- Production admin login lands on `/queue`, but the page title is `Queue | NoSite Leads` and the visible UI says `Now Queue`.
- Production `/dashboard` title is `Discover | NoSite Leads`, not `Revenue Dashboard | NoSite Leads`.
- Production `/fulfillment` returns `404`.
- Production `/team` returns `404`.
- Local authenticated admin has the intended new route titles: `Workbench`, `Revenue Dashboard`, `Fulfillment`, and `Team Board`.

Impact:

The live business app does not yet contain the most important workflow for making money: researchers sending website/quote work to Steve and Steve seeing that work in Fulfillment. This also means the live admin dashboard cannot answer who is generating design/quote opportunities.

Remediation:

Deployed the current revenue workflow, added additive runtime Postgres repairs for missing workbench/fulfillment schema, fixed a Postgres UUID comparison bug in unassigned-lead queries, and fixed `.vercelignore` so the `/coverage` route is included in production deployments. Final production audit verified `/queue`, `/dashboard`, `/fulfillment`, `/team`, `/users`, `/leads`, `/quality`, `/statistics`, `/coverage`, and `/settings`.

### F-002: Production session cookie is not marked `Secure` or `HttpOnly`

Severity: High  
Status: Fixed and production-verified  
Affected surface: Supabase auth session cookie

Evidence:

The authenticated production browser context reported the Supabase auth cookie as:

- `httpOnly: false`
- `secure: false`
- `sameSite: Lax`

Impact:

`secure: false` means the cookie is not explicitly restricted to HTTPS. `httpOnly: false` means browser JavaScript can read the cookie. Supabase browser auth often uses JavaScript-readable session storage, but for this admin-heavy application the combination increases damage from any future XSS or injected third-party script. The risk is higher because production also lacks a CSP.

Remediation:

Centralized Supabase cookie options. Production browser verification now shows the Supabase auth cookie as `httpOnly: true`, `secure: true`, and `sameSite: Lax`.

### F-003: Production lacks core browser security headers

Severity: High  
Status: Fixed and production-verified  
Affected surface: Production HTTP responses

Evidence:

Production responses include HSTS, but the audited responses did not include:

- `Content-Security-Policy`
- `X-Frame-Options` or CSP `frame-ancestors`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`

`next.config.ts:3-8` has no `headers()` configuration.

Impact:

The app handles admin actions, lead data, phone numbers, notes, and account controls. Missing CSP and framing protections make future XSS, clickjacking, and data-leakage bugs easier to exploit.

Remediation:

Added enforced CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` in `next.config.ts`. Production `/queue` and `/api/health` responses include the headers.

### F-004: Researchers can still reach broad operational surfaces in code

Severity: High  
Status: Fixed in code; researcher-account live validation pending  
Affected files:

- `src/app/(protected)/leads/page.tsx:31`
- `src/app/(protected)/quality/page.tsx:28`
- `src/app/(protected)/statistics/page.tsx:17`
- `src/lib/permissions.ts:44-53`

Evidence:

`/leads`, `/quality`, and `/statistics` require only `view:workspace`. Researchers have `view:workspace`.

Impact:

This conflicts with the intended operating model. Researchers should have a simple workflow: Workbench, My Leads, Team Board, owned lead detail, and guided outreach. Broad lead lists, quality screens, and statistics are admin/operations surfaces and expose more data and complexity than researchers need.

Remediation:

Restricted researcher data access and operations routes in code. `/quality` and `/statistics` now require admin operations permission, and researcher lead-list access is forced to owned leads. Production admin routes were verified; researcher denial still needs dedicated researcher accounts.

### F-005: Researcher URL filtering can expose another user's lead list

Severity: High  
Status: Fixed in code; researcher-account live validation pending  
Affected file: `src/app/(protected)/leads/page.tsx:50-51`

Evidence:

The server accepts `owner` from the URL:

```ts
assignedToUserId: params.assigned === "me" ? session.userId : params.owner
```

Impact:

A researcher could potentially change the URL to view another user's claimed leads. That undercuts the accountability model and creates unnecessary privacy/data exposure inside the team.

Remediation:

Added `src/lib/lead-access.ts` and updated lead actions/pages so researchers cannot use arbitrary owner filters or fetch other-owned lead details/notes/outreach/demo/score data. Unit tests cover the ownership boundary.

### F-006: Researcher permissions still include AI/demo creation

Severity: Medium  
Status: Fixed  
Affected file: `src/lib/permissions.ts:44-53`

Evidence:

Researchers currently have:

- `lead:apply_ai_opportunity`
- `demo:create`
- `ai:verify`

Impact:

The newer business flow says researchers should research, claim, contact, log, and send website/quote requests to Steve. Allowing researchers to run AI or demo actions can create cost, noise, and premature design work outside the admin fulfillment queue.

Remediation:

Removed researcher permissions for AI opportunity application, demo creation, and AI verification. Permission tests were updated.

### F-007: Proxy route inventory misses `/fulfillment` and `/team`

Severity: Medium  
Status: Fixed and production-verified  
Affected file: `src/proxy.ts:13-16` and `src/proxy.ts:99`

Evidence:

The proxy protected-route and canonical-route lists include the older routes but do not include `/fulfillment` or `/team`.

Impact:

The protected layout and page-level permission checks still protect the local routes, but the proxy no longer represents the full protected surface. This weakens defense in depth and creates inconsistent unauthenticated behavior.

Remediation:

Updated proxy protected/canonical route inventory to include `/fulfillment` and `/team`. Production anonymous checks redirect protected routes to `/login`.

### F-008: Local new UI has critical accessibility failures

Severity: Medium  
Status: Fixed and production-verified  
Affected surfaces: Leads, Settings, Users, Dashboard, Fulfillment, Workbench mobile

Evidence from axe scans:

- `/leads`: `select-name`, critical, 3 nodes.
- `/settings`: unlabeled form inputs, critical, 19 nodes.
- `/users`: unlabeled role/team selects, critical, 2 nodes.
- `/dashboard`: `color-contrast`, serious, 19 desktop nodes and 35 mobile nodes.
- `/fulfillment`: primary button contrast, serious, 1 node.
- `/queue` mobile: section-label contrast, serious, 2 nodes.

Impact:

This matters even if the team is small. Non-technical researchers are more likely to struggle when controls do not have clear names, contrast is weak, and screen-reader/keyboard behavior is incomplete. It also makes later delegation to more workers harder.

Remediation:

Added missing accessible names, fixed invalid ARIA usage, removed server/client timestamp hydration mismatches, and darkened low-contrast badge/status colors. Final production axe pass reported zero violations across the tested routes.

### F-009: Public health endpoint exposes service/timestamp metadata

Severity: Low  
Status: Fixed and production-verified  
Affected file: `src/app/api/health/route.ts:3-10`

Evidence:

Production `GET /api/health` returns public JSON with `status`, `service`, and `timestamp`.

Impact:

This is low severity, but it gives scanners a stable application fingerprint. If external uptime monitoring does not need service/timestamp details, minimize the response.

Remediation:

Public `/api/health` now returns only `{"status":"ok"}`.

### F-010: Local authenticated audit could not validate the full revenue workflow because local data is empty

Severity: Medium operational gap  
Status: Remaining audit limitation  
Affected surface: Mutating researcher/team workflow tests

Evidence:

The final production audit used one admin account only. It did not include safe researcher/team-lead accounts or clearly marked audit records.

Impact:

Read-only route behavior can be inspected, but the destructive/state-changing parts of the money workflow still need a seeded audit dataset.

Recommendation:

Create a dedicated local/staging audit seed with at least:

- 3 unclaimed ready leads.
- 1 lead claimed by Steve/admin.
- 1 lead claimed by researcher A.
- 1 lead claimed by researcher B.
- 1 open website request.
- 1 open quote request.
- 1 waiting-on-researcher request.
- 1 overdue request.

## Positive Controls Verified

- Local admin login works and no longer shows `Access Pending`.
- Production admin login works with the supplied current credentials.
- Local new admin routes load with no page runtime errors and no failed app requests in the tested browser session.
- Local mobile pages tested did not show horizontal overflow.
- Final production desktop/mobile pages tested did not show horizontal overflow.
- Final production axe pass found no WCAG A/AA violations on the tested pages.
- Final production browser pass found no React page errors on the tested pages.
- Production auth cookie is now `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Production security headers are present.
- Production `/api/health` now returns only `{"status":"ok"}`.
- Anonymous production `/queue` redirects to login.
- Anonymous production CSV export returns `401`.
- Anonymous and fake-bearer worker probes return `401`.
- `createAdminRequestAction` enforces ownership for researchers and admin-only status updates.
- `claimLeadAction` uses the atomic `claimLeadForUser` database path and returns `Taken by ...` when a claim loses.
- The admin request migration includes a partial unique index that prevents duplicate open website/quote requests for the same lead.
- CSV export uses `csvEscape` for values.

## Remaining Validation Needed

These were not safely testable with only one admin account and no dedicated audit records:

- Researcher direct URL denial on production.
- Team-lead researcher behavior.
- Researcher claim conflict with two active sessions.
- Researcher-owned fulfillment request creation.
- Duplicate open fulfillment request prevention through the UI.
- Admin status transitions on real fulfillment cards.
- Role-specific navigation for brother/Mahyar/team-member hierarchy.
- Researcher route denial on production with real researcher credentials.

## Bottom Line

You are recognized as admin locally and on production, and the production app now serves the intended revenue workflow. The remaining audit work is controlled live mutation testing with one admin account, one team-lead researcher account, one regular researcher account, and seeded `AUDIT-2026-05-20-*` leads so the complete claim, outreach, send-to-Steve, duplicate-prevention, and fulfillment-status workflow can be verified without touching real leads.
