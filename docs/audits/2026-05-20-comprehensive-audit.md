# NoSite Leads Comprehensive Audit

> Superseded: the admin credentials were later corrected and a new authenticated audit was completed in `docs/audits/2026-05-20-authenticated-admin-audit.md`.

Date: 2026-05-20  
Target: https://lead-generation-orcin.vercel.app and current workspace implementation  
Audit stance: external auditing firm, safe testing only  
Admin login status: supplied admin credentials were rejected by production

## Executive Summary

The previous live-only audit was incomplete because no valid authenticated session was available. A new login attempt with the supplied admin email/password reached `/login?error=invalid_credentials`, displayed `Invalid email or password.`, and created no auth cookies. This prevents true authenticated live testing until the password/account is corrected or a fresh audit account is created.

The broader audit found a deployment gap and several product/security boundary issues:

- Production is behind the current implementation: `/fulfillment` and `/team` return `404` live, while the local build contains both routes.
- The researcher role can still directly access broad operational pages in code, including `/leads`, `/quality`, and `/statistics`, even though the intended product is Workbench/My Leads/Team Board for non-technical researchers.
- `/leads` accepts arbitrary `owner` filtering, so a researcher can turn `My Leads` into another user's leads by changing the URL.
- Researchers still have `ai:verify` and `demo:create`, which conflicts with the newer fulfillment model where website/demo work should come to Steve/admin.
- The proxy route list was not updated for `/fulfillment` and `/team`, reducing edge-level protection and redirect consistency.
- Public responses still lack several security hardening headers.
- Primary auth buttons fail WCAG AA contrast by a narrow margin.

The implementation also has important strengths:

- Local lint, unit tests, and production build pass.
- Lead ownership checks are present for status, notes, reminders, phone verification, outreach, demos, and admin requests.
- Claiming is atomic at the SQL update level.
- Open admin request duplication is protected by a partial unique index in the migration/schema.
- Anonymous live probes show protected APIs returning `401`, protected legacy pages redirecting to login, and source maps returning `404`.
- Fake bearer probes against worker endpoints returned clean `401 Authentication required` responses.

## Evidence

Evidence folders:

- `test-results/live-audit-2026-05-20/`
- `test-results/live-auth-audit-2026-05-20/`

Key screenshots:

- `login-failed-detail.png`
- `fulfillment-404.png`
- `team-404-mobile.png`
- `login-desktop.png`
- `login-mobile.png`

Verification commands:

```bash
npm run lint
npm run test
npm run build
npm audit --omit=dev --json
E2E_BASE_URL=https://lead-generation-orcin.vercel.app npm run test:e2e
```

Results:

- `npm run lint`: passed.
- `npm run test`: passed, `33` files and `160` tests.
- `npm run build`: passed; local build includes `/fulfillment` and `/team`.
- `npm audit --omit=dev`: `2` moderate production advisories, both through Next's bundled PostCSS advisory.
- Live E2E without valid credentials: skipped authenticated tests.

## Findings

### F-001: Supplied production admin credentials are invalid

Severity: Critical operational blocker  
Status: Confirmed live issue  
Affected surface: Production login

Evidence:

- Login attempt stayed on `/login`.
- Follow-up detailed attempt ended at `/login?error=invalid_credentials`.
- Visible page text included `Invalid email or password.`
- No auth cookies were created.

Impact:

The admin cannot be used for live audit, and possibly cannot operate the production business dashboard. This blocks validation of the exact money path: Workbench, dashboard, lead ownership, admin fulfillment queue, team rollups, and role boundaries.

Recommendation:

Reset or recreate the admin account, then create separate disposable audit users:

- Admin test user.
- Team-lead researcher test user.
- Regular researcher test user.

Validation:

Login lands on `/queue`, auth cookies are present with `Secure`, `HttpOnly`, and appropriate `SameSite`, and each role can be tested independently.

### F-002: Production is behind the current implementation

Severity: High  
Status: Confirmed live issue  
Affected surface: Fulfillment and Team workflows

Evidence:

- Live `/fulfillment` returns `404`.
- Live `/team` returns `404`.
- Local `npm run build` lists both `/fulfillment` and `/team` as dynamic routes.

Impact:

The production product does not yet support the admin fulfillment queue or team accountability workflow. Researchers cannot send website/quote work to Steve in the intended live UI, and Steve cannot review the queue from production.

Recommendation:

Deploy the current implementation and confirm the required Supabase migration is applied. Then rerun the authenticated audit against production.

Validation:

- `/fulfillment` loads for admin.
- `/team` loads for intended roles.
- Admin dashboard links and fulfillment badge point to working routes.
- Researcher direct access to admin-only fulfillment is denied.

### F-003: Researchers can directly access broad lead and operational data

Severity: High  
Status: Confirmed code issue  
Affected files:

- `src/app/(protected)/leads/page.tsx:31`
- `src/app/(protected)/quality/page.tsx:28`
- `src/app/(protected)/statistics/page.tsx:17`

Evidence:

- `/leads` requires only `view:workspace`.
- `/quality` requires only `view:workspace`.
- `/statistics` requires only `view:workspace`.
- Researchers have `view:workspace` in `src/lib/permissions.ts:44-53`.

Impact:

This conflicts with the intended simplified researcher UX and weakens accountability. Non-admin researchers can directly load dense operational/admin-style pages if they know the URL. This also exposes more lead/team/business data than the Workbench workflow needs.

Recommendation:

Make the researcher route surface explicit:

- Researchers: `/queue`, `/leads?assigned=me`, `/team`, owned lead detail, and controlled unclaimed lead views.
- Admins: `/dashboard`, `/fulfillment`, `/leads` all-leads view, `/quality`, `/statistics`, `/coverage`, `/scheduler`, `/settings`, `/users`, exports.

Validation:

Researcher direct visits to `/quality`, `/statistics`, and unfiltered `/leads` should redirect or return a friendly access-denied page. Admins should retain access.

### F-004: `owner` query allows researchers to view other users' lead lists

Severity: High  
Status: Confirmed code issue  
Affected file: `src/app/(protected)/leads/page.tsx:50-51`

Evidence:

The leads page sets:

```ts
assignedToUserId: params.assigned === "me" ? session.userId : params.owner
```

For a researcher, `assigned=me` is safe, but `owner=<other-user-id>` is accepted when `assigned` is absent.

Impact:

The UI label says `My Leads`, but URL manipulation can show another user's leads. This is not consistent with the “each person works their own claimed leads” model.

Recommendation:

For researchers, ignore `owner` and force `assignedToUserId = session.userId` except for explicitly allowed unclaimed/best-leads views. Keep arbitrary `owner` filtering admin-only.

Validation:

Researcher visiting `/leads?owner=<other-user-id>` still sees only their own leads or receives a denial. Admin keeps owner filtering.

### F-005: Researcher permission set still includes AI and demo creation

Severity: Medium  
Status: Confirmed code issue  
Affected file: `src/lib/permissions.ts:44-53`

Evidence:

Researchers have:

- `demo:create`
- `ai:verify`
- `lead:apply_ai_opportunity`

Impact:

This conflicts with the newer admin fulfillment model. Researchers should be able to research, claim, contact, log outcomes, and send website/quote requests to Steve. AI verification and demo generation can create cost, operational noise, or premature demo work outside the intended admin/designer queue.

Recommendation:

Move `demo:create` and most `ai:verify` flows to admin-only, or add a separate limited permission for safe researcher-visible AI summaries without allowing batch/work queue actions.

Validation:

Researcher cannot trigger AI batch verification, artifact creation, or demo generation directly. Researcher can still create website/quote requests for owned leads.

### F-006: Proxy protected route inventory misses new routes

Severity: Medium  
Status: Confirmed code issue  
Affected file: `src/proxy.ts:13-16` and `src/proxy.ts:99`

Evidence:

The proxy protected-page list includes `/dashboard`, `/coverage`, `/scheduler`, `/quality`, `/leads`, `/queue`, `/statistics`, `/settings`, and `/users`, but not `/fulfillment` or `/team`.

Impact:

The route group layout and page-level permission checks still provide server-side protection, so this is not currently direct data exposure. It is still a defense-in-depth and consistency problem: anonymous requests to those routes bypass the proxy's early redirect behavior, and route alias/canonical handling is incomplete.

Recommendation:

Centralize protected route definitions and include `/fulfillment` and `/team`. Avoid maintaining separate lists in proxy, nav, and page code.

Validation:

Anonymous direct requests to every protected route redirect consistently at the proxy layer, and mixed-case/trailing-slash canonical routes behave consistently.

### F-007: Missing security hardening headers

Severity: Medium  
Status: Confirmed live issue  
Affected surface: Public pages, protected redirects, API responses

Evidence:

Live `/login` did not return:

- `content-security-policy`
- `x-frame-options`
- `x-content-type-options`
- `referrer-policy`
- `permissions-policy`

HSTS is present.

Impact:

The app handles CRM-like lead data, notes, outreach history, and admin requests. Missing headers reduce protection against clickjacking, MIME sniffing, referrer leakage, and XSS blast radius.

Recommendation:

Add site-wide headers in Next/Vercel:

- CSP with `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disabling unused capabilities.
- Remove `X-Powered-By` if practical.

Validation:

Header probes pass on `/login`, protected redirects, and API endpoints; auth and Supabase flows continue working.

### F-008: Primary button color fails WCAG AA contrast

Severity: Medium  
Status: Confirmed live/code issue  
Affected files:

- `src/app/globals.css:16`
- `src/app/globals.css:150-160`

Evidence:

axe-core reported `color-contrast` violations on `/login`, `/forgot-password`, and `/reset-password`.

Observed:

- White text on `#6366f1`.
- Contrast ratio `4.46:1`.
- Required ratio `4.5:1`.

Impact:

This is a narrow failure, but it affects the first screen every team member uses and matters for a non-technical operator audience.

Recommendation:

Darken `--accent` slightly or raise primary button text weight/size enough to pass AA.

Validation:

axe-core reports zero color contrast violations on auth pages.

### F-009: Public health endpoint exposes service/timestamp

Severity: Low  
Status: Confirmed live/code issue  
Affected file: `src/app/api/health/route.ts:3-10`

Evidence:

`GET /api/health` returns `status`, `service`, and an exact timestamp.

Impact:

Low sensitivity, but unnecessary fingerprinting for a private internal business app.

Recommendation:

Return only fields needed by monitoring, usually `{"status":"ok"}`.

Validation:

Health check still returns `200` and monitoring still passes.

### F-010: Moderate production dependency advisory remains

Severity: Medium  
Status: Confirmed local dependency audit  
Affected package: `next` bundled `postcss`

Evidence:

`npm audit --omit=dev --json` reports:

- `postcss` advisory `GHSA-qx2v-qp2m-jg93`
- surfaced through `next`
- severity `moderate`

Impact:

The reported fix path is not straightforward because npm suggests a breaking downgrade path through Next. This should be tracked, not blindly applied.

Recommendation:

Monitor Next releases and upgrade when Next ships a compatible dependency resolution. Do not downgrade major framework versions to satisfy npm's current suggested fix.

Validation:

`npm audit --omit=dev` no longer reports the advisory after a safe Next upgrade.

## Positive Controls

- Lead ownership mutations are guarded by `requireLeadOwnershipForMutation`.
- Admin-only close/won/lost logic is enforced in status and outreach actions.
- Atomic claim uses a conditional SQL update that only succeeds for unassigned/self-owned leads.
- Open admin request duplicates are protected by a partial unique index.
- CSV export uses formula-injection protection through `csvEscape`.
- Worker routes validate bearer secrets or authenticated permissions; fake bearer live probes returned `401`.
- Source map probes for live static chunks returned `404`.
- Unit tests now include admin request and lead ownership action coverage.

## Blocked Audit Areas

These remain unverified on live until valid test accounts exist:

- Admin dashboard after login.
- Researcher Workbench after login.
- Researcher vs admin direct-route denial.
- Claim/release race behavior across two live sessions.
- Other-owner lead mutation denial in production.
- Fulfillment request creation and duplicate prevention in production.
- Admin fulfillment status transitions.
- Team lead/member rollup correctness in production.
- Authenticated CSV export behavior.
- Stored-input rendering safety using real live notes/admin requests.

## Recommended Remediation Order

1. Restore production admin access and create audit users.
2. Deploy the current implementation and apply the Supabase migrations.
3. Lock researcher routing/data access to Workbench/My Leads/Team Board only.
4. Remove AI/demo creation from researcher permissions unless there is a deliberate business reason.
5. Add security headers.
6. Fix auth button contrast.
7. Rerun authenticated E2E and live audit.
