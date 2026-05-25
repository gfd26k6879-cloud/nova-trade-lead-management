# Authenticated Admin Audit Remediation Backlog

Date: 2026-05-20  
Source report: `docs/audits/2026-05-20-authenticated-admin-audit.md`

## P0

### Deploy the current revenue workflow to production

Findings: F-001
Status: Done, production-verified in `test-results/live-remediation-2026-05-20-final-2/live-authenticated-audit.json`

Acceptance criteria:

- Production `/queue` is titled `Workbench | NoSite Leads`.
- Production `/dashboard` is titled `Revenue Dashboard | NoSite Leads`.
- Production `/fulfillment` returns `200` for admin.
- Production `/team` returns `200` for admin and intended researcher roles.
- Production navigation includes Workbench, My Leads, Team Board, Revenue, Fulfillment, and admin operations in the intended role-specific layout.
- Required Supabase migrations are applied, including `admin_requests` and team lead metadata.

Validation:

```bash
E2E_BASE_URL=https://lead-generation-orcin.vercel.app \
E2E_SUPABASE_EMAIL=<admin-audit-email> \
E2E_SUPABASE_PASSWORD=<admin-audit-password> \
npm run test:e2e
```

### Seed safe audit data and users

Findings: F-010
Status: Still needed for destructive/state-changing workflow tests

Acceptance criteria:

- Admin audit user exists.
- Team-lead researcher audit user exists.
- Regular researcher audit user exists.
- Test records use names prefixed with `AUDIT-2026-05-20-`.
- Test dataset includes unclaimed leads, claimed leads, overdue follow-ups, website requests, quote requests, and waiting-on-researcher requests.

Validation:

- No production real leads are modified during audit.
- Claim, log outcome, Send to Steve, duplicate request, and status transition tests run only against audit records.

## P1

### Harden production session cookie handling

Findings: F-002
Status: Done, production-verified

Acceptance criteria:

- Production auth cookie is explicitly `Secure`.
- Session storage strategy is documented.
- If JavaScript-readable Supabase sessions remain, CSP is enforced and stored-input surfaces are tested for script injection.

Validation:

- Authenticated production browser context shows `secure: true`.
- Authenticated admin login, logout, reset-password, and callback flows still work.

### Add production security headers

Findings: F-003
Status: Done, production-verified

Acceptance criteria:

- `Content-Security-Policy` is deployed, starting report-only if needed.
- `frame-ancestors 'none'` or `X-Frame-Options: DENY` is active.
- `X-Content-Type-Options: nosniff` is active.
- `Referrer-Policy` is active.
- `Permissions-Policy` denies unused browser capabilities.

Validation:

```bash
curl -sS -D - -o /dev/null https://lead-generation-orcin.vercel.app/queue
curl -sS -D - -o /dev/null https://lead-generation-orcin.vercel.app/api/health
```

### Restrict researcher route and data access

Findings: F-004, F-005
Status: Fixed in code and covered by unit tests; live researcher-account validation still needed

Acceptance criteria:

- Researchers can access Workbench, My Leads, Team Board, owned lead detail, and allowed unclaimed lead cards.
- Researchers cannot directly access `/dashboard`, `/fulfillment`, `/users`, `/settings`, `/coverage`, `/scheduler`, `/quality`, `/statistics`, exports, or unfiltered All Leads.
- Researchers cannot use `owner=<other-user-id>` to see another user's leads.
- Admin owner filtering continues to work.

Validation:

- E2E tests cover admin, team-lead researcher, and regular researcher direct URL attempts.
- Server-side page tests or action tests verify the permission boundary.

## P2

### Move AI/demo creation out of researcher permissions

Findings: F-006
Status: Done, covered by permission tests

Acceptance criteria:

- Researchers cannot run AI verification batches.
- Researchers cannot create demos directly unless explicitly reintroduced as a scoped workflow.
- Researchers can still claim, log outcomes, and create website/quote requests for owned leads.
- Admin can still run AI/demo workflows.

Validation:

- Permission matrix unit tests updated.
- Server action tests confirm researcher denial and admin success.

### Update protected route inventory

Findings: F-007
Status: Done, production-verified

Acceptance criteria:

- `/fulfillment` and `/team` are included in proxy protected-page handling.
- Protected route paths are centralized or covered by tests.
- Anonymous visits get consistent redirects/denials.

Validation:

```bash
curl -sS -D - -o /dev/null https://lead-generation-orcin.vercel.app/fulfillment
curl -sS -D - -o /dev/null https://lead-generation-orcin.vercel.app/team
```

### Fix critical accessibility defects

Findings: F-008
Status: Done, production-verified with zero axe violations in the final pass

Acceptance criteria:

- `/leads` selects have accessible names.
- `/settings` inputs have visible labels or correct `aria-label`s.
- `/users` role/team controls have accessible names.
- Primary buttons pass WCAG AA contrast.
- Functional muted labels pass contrast.

Validation:

- axe scans pass for `/queue`, `/dashboard`, `/fulfillment`, `/team`, `/leads`, `/settings`, and `/users` on desktop and mobile.

## P3

### Minimize public health response

Findings: F-009
Status: Done, production-verified

Acceptance criteria:

- Public `/api/health` returns only necessary uptime data.
- Detailed health requires an internal monitor token if needed.

Validation:

```bash
curl -sS https://lead-generation-orcin.vercel.app/api/health
```

### Track Next/PostCSS advisory

Related risk: dependency maintenance

Acceptance criteria:

- Advisory is tracked in dependency maintenance notes.
- Next.js is upgraded when a compatible fix is available.
- No major downgrade is applied just to satisfy npm's automated suggestion.

Validation:

```bash
npm audit --omit=dev
```

## Required Regression Suite

Latest completed validation:

```bash
npm run lint
npm run test
npm run build
E2E_SUPABASE_EMAIL=<admin-audit-email> E2E_SUPABASE_PASSWORD=<admin-audit-password> npm run test:e2e
```

Final production validation:

```text
test-results/live-remediation-2026-05-20-final-2/live-authenticated-audit.json
```

Run before shipping changes:

```bash
npm run lint
npm run test
npm run build
```

Run after deploying with audit accounts:

```bash
E2E_BASE_URL=https://lead-generation-orcin.vercel.app \
E2E_SUPABASE_EMAIL=<admin-audit-email> \
E2E_SUPABASE_PASSWORD=<admin-audit-password> \
npm run test:e2e
```
