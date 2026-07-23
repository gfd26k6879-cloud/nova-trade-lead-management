# NoSite Leads Live Website Audit

Date: 2026-05-20  
Target: https://lead-generation-orcin.vercel.app  
Audit mode: Live-only external audit, safe unauthenticated testing completed  
Authenticated testing status: Blocked because no live test credentials were available locally

## Executive Summary

This audit confirmed that the deployed site is online, protected pages redirect anonymous users to login, protected API endpoints reject anonymous requests, source maps are not exposed, and the public auth pages load without browser runtime errors.

The most important business finding is that the live deployment does not currently expose the new revenue/accountability surfaces expected by the latest product plan: `/fulfillment` and `/team` both return `404`. That means the live product cannot yet support the admin fulfillment queue or team lead accountability workflow described in the plan.

The most important security finding from the unauthenticated surface is missing HTTP hardening headers on public pages and API responses. HSTS is present, but CSP, frame protection, MIME sniffing protection, referrer policy, and permissions policy are absent.

The most important UX/accessibility finding is that primary auth buttons fail WCAG AA color contrast by a narrow margin across login, forgot-password, and reset-password screens.

## Evidence Collected

Local evidence folder:

`test-results/live-audit-2026-05-20/`

Artifacts:

- `browser-diagnostics.json`
- `axe-performance.json`
- `api-method-probes.json`
- `header-inventory.json`
- `static-js-probes.json`
- `login-desktop.png`
- `login-mobile.png`
- `forgot-password-desktop.png`
- `reset-password-mobile.png`
- `dashboard-redirect.png`
- `fulfillment-404.png`
- `team-404-mobile.png`

Commands and tools used:

- Playwright Chromium screenshots and browser diagnostics
- axe-core accessibility scan on public auth pages
- HTTPS route/header/API method probes
- Existing Playwright E2E suite against production base URL

## Positive Findings

- `GET /` redirects to `/login`.
- `GET /dashboard`, `/queue`, `/users`, `/settings`, `/scheduler`, `/quality`, `/statistics`, `/coverage`, and `/leads` redirect anonymous users to `/login`.
- `GET /api/export/csv`, worker endpoints, and score recompute endpoints reject anonymous users.
- `/api/health` returns `200` and only minimal health JSON.
- HSTS is enabled: `strict-transport-security: max-age=63072000; includeSubDomains; preload`.
- Static JavaScript source-map probes returned `404`.
- Auth pages showed no console errors or page exceptions in the captured browser run.
- Auth page load timings were fast in the Playwright environment, roughly 386-523 ms for measured public auth pages.

## Findings

### F-001: Live deployment is missing Fulfillment and Team routes

Severity: High business impact  
Category: Revenue workflow / deployment readiness  
Status: Confirmed live issue

Evidence:

- `GET /fulfillment` returned `404`.
- `GET /team` returned `404`.
- Screenshots: `fulfillment-404.png`, `team-404-mobile.png`.

Impact:

The live product cannot yet support the planned admin fulfillment queue, "Send to Steve" work item review, or team lead accountability surfaces. This blocks the agency workflow where researchers escalate website/quote needs and the admin/designer sees what needs attention.

Recommendation:

Deploy the implementation containing `/fulfillment`, `/team`, admin request handling, and team lead rollups. After deployment, rerun authenticated route and role tests for admin, team lead, and researcher accounts.

Validation:

- Admin can load `/fulfillment` and see request cards.
- Researcher cannot load `/fulfillment` by direct URL.
- Admin and permitted users can load `/team` as intended.
- Navigation links, dashboard badges, and direct route access match the permission model.

### F-002: Authenticated audit workstreams could not run

Severity: Audit blocker  
Category: Verification coverage  
Status: Blocked

Evidence:

- `E2E_SUPABASE_EMAIL`, `E2E_SUPABASE_PASSWORD`, and `NOSITE_BOOTSTRAP_ADMIN_EMAIL` were not present in the local environment.
- `E2E_BASE_URL=https://lead-generation-orcin.vercel.app npm run test:e2e` completed with `20 skipped`.

Impact:

The most important security and revenue checks require authenticated role coverage. The following scenarios remain unverified on live:

- Researcher vs admin route access.
- Claim ownership enforcement.
- Other-owner mutation denial.
- Fulfillment request creation and duplicate prevention.
- Admin fulfillment status controls.
- Team lead/member rollups.
- CSV export authorization.
- IDOR resistance against direct lead/request IDs.
- CSRF posture for authenticated mutating actions.

Recommendation:

Provide disposable live/staging audit accounts for admin, team lead, and researcher roles, plus one agreed test lead or permission to create audit-prefixed records. Then rerun the authenticated phase.

Validation:

The authenticated phase is complete only when the role matrix and revenue workflow scenarios pass with screenshots, network traces, and reproduction notes.

### F-003: Public pages and APIs are missing several HTTP hardening headers

Severity: Medium  
Category: Security hardening  
Status: Confirmed live issue

Evidence:

`/login` did not return:

- `content-security-policy`
- `x-frame-options`
- `x-content-type-options`
- `referrer-policy`
- `permissions-policy`

The same general header gap was visible across sampled public/protected/API responses. HSTS was present.

Impact:

Missing hardening headers reduce defense-in-depth against clickjacking, MIME-sniffing, accidental referrer leakage, and script/style injection blast radius. The absence of CSP is especially important for a CRM-like internal app that stores lead notes, outreach history, admin requests, and contact details.

Recommendation:

Add site-wide response headers in the Next/Vercel layer:

- `Content-Security-Policy` with a staged policy appropriate for Next.js, Supabase, fonts, and required connect targets.
- `X-Frame-Options: DENY` or `frame-ancestors 'none'` in CSP.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disabling unused browser capabilities.
- Consider removing `X-Powered-By`.

Validation:

Re-run header probes for public pages, protected redirects, and API endpoints. Confirm app functionality still works after CSP is enabled.

### F-004: Auth primary buttons fail WCAG AA contrast

Severity: Medium  
Category: Accessibility / usability  
Status: Confirmed live issue

Evidence:

axe-core reported `color-contrast` violations on:

- `/login` desktop and mobile: `Sign in` button.
- `/forgot-password` desktop and mobile: `Send reset link` button.
- `/reset-password` desktop and mobile: `Send new reset link` button.

Observed contrast:

- Foreground: `#ffffff`
- Background: `#6366f1`
- Ratio: `4.46:1`
- Required: `4.5:1`

Impact:

This is a narrow but real WCAG AA failure. It matters because the product is intended for non-technical team members who need low-friction access on different screens.

Recommendation:

Darken the primary button color slightly or increase text weight/size so contrast passes consistently. Validate with axe on desktop and mobile.

Validation:

axe-core reports zero color contrast violations on `/login`, `/forgot-password`, and `/reset-password`.

### F-005: Public health endpoint exposes service name and exact timestamp

Severity: Low  
Category: Information disclosure  
Status: Confirmed live observation

Evidence:

`GET /api/health` returned:

```json
{"status":"ok","service":"nosite-leads","timestamp":"2026-05-20T12:22:02.857Z"}
```

Impact:

This is not a serious issue by itself. The service name and timestamp are low sensitivity. If the app becomes more public or attracts scanning, a minimal health response reduces unnecessary fingerprinting.

Recommendation:

Keep the health endpoint if needed for deployment monitoring, but consider returning only `{"status":"ok"}` unless the timestamp is actively used.

Validation:

Health monitoring still works after response minimization.

## Method Notes

This was a live-only audit, so source code, database schema, migrations, dependency advisories, Supabase RLS, and server action internals were not reviewed as findings. Local workspace files were used only to identify the production URL and existing E2E credential conventions.

No destructive testing was performed. No password attacks, fuzzing, spam, data scraping, or real lead mutations were attempted.

## Required Authenticated Follow-Up

To complete the planned audit, provide:

- Live or staging URL if different from `https://lead-generation-orcin.vercel.app`.
- One admin test account.
- One researcher/team-lead test account.
- One regular researcher/member test account.
- Permission to create or use test data named `AUDIT-2026-05-20-*`.

Authenticated audit scenarios to run next:

- Login landing to Workbench.
- Researcher role nav and direct-route restrictions.
- Admin-only dashboard, users, fulfillment, scheduler, settings, export, and quality access.
- Claim/release race behavior across two sessions.
- Ownership-required lead updates, notes, outreach, reminders, and admin request creation.
- Duplicate website/quote request prevention.
- Admin fulfillment status transitions.
- Team lead rollup accuracy.
- CSV export authorization and formula injection behavior.
- Stored-input rendering safety in notes, admin requests, contact names, next steps, and summaries.
