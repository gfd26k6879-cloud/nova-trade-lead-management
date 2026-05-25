# Comprehensive Audit Remediation Backlog

Date: 2026-05-20

## P0

### Restore production admin access

Finding: F-001

Acceptance criteria:

- The admin account can sign in successfully.
- Login lands on `/queue`.
- A fresh admin audit account, team-lead researcher account, and regular researcher account exist.
- Audit credentials are tested without exposing passwords in docs or logs.

Verification:

```bash
E2E_BASE_URL=https://lead-generation-orcin.vercel.app \
E2E_SUPABASE_EMAIL=<admin-audit-email> \
E2E_SUPABASE_PASSWORD=<admin-audit-password> \
npm run test:e2e
```

## P1

### Deploy current revenue/accountability implementation

Finding: F-002

Acceptance criteria:

- `/fulfillment` and `/team` no longer return `404`.
- Dashboard links to Fulfillment and Team Board work.
- Required Supabase migrations are applied.
- Live smoke screenshots are captured for desktop and mobile.

Verification:

- Anonymous `/fulfillment` redirects or denies consistently.
- Admin `/fulfillment` loads queue cards.
- Researcher `/team` loads only intended team/accountability data.

### Restrict researcher route/data access

Findings: F-003, F-004

Acceptance criteria:

- Researcher direct access to `/quality`, `/statistics`, and unfiltered `/leads` is denied or redirected.
- Researcher `/leads?assigned=me` only shows that researcher's leads.
- Researcher `/leads?owner=<other-user-id>` does not show another user's leads.
- Admin owner filtering continues to work.

Suggested implementation:

- Add explicit page-level admin permission checks for admin surfaces.
- In `/leads`, force researcher filters server-side.
- Add E2E tests for researcher direct URL access.

## P2

### Remove researcher AI/demo creation permissions unless intentionally retained

Finding: F-005

Acceptance criteria:

- Researchers cannot run AI verification batches, queue AI artifacts, or create demos directly.
- Researchers can still log outcomes and create website/quote admin requests for owned leads.
- Admin can still create demos and run AI workflows.

Verification:

- Unit tests update the researcher permission matrix.
- Server action tests confirm researcher denial and admin success.

### Update proxy protected route inventory

Finding: F-006

Acceptance criteria:

- `/fulfillment` and `/team` are included in proxy protected route handling.
- Protected route definitions are centralized or covered by tests.
- Anonymous route probes show consistent redirects/denials.

Verification:

- Unit or route tests for protected path inventory.
- Live curl probes after deployment.

### Add security headers

Finding: F-007

Acceptance criteria:

- CSP is deployed in report-only first if needed, then enforced.
- `frame-ancestors 'none'` or `X-Frame-Options: DENY` is active.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` are active.
- Supabase auth and Next assets still work.

Verification:

- Header probes for auth pages, protected pages, and APIs.
- Authenticated browser smoke after CSP.

### Fix auth contrast

Finding: F-008

Acceptance criteria:

- `btn-primary` passes WCAG AA contrast.
- Auth pages have zero axe color-contrast violations.

Verification:

- axe-core scan of `/login`, `/forgot-password`, and `/reset-password` on desktop and mobile.

## P3

### Minimize health endpoint response

Finding: F-009

Acceptance criteria:

- `/api/health` still returns `200`.
- Response omits nonessential service/timestamp details unless monitoring needs them.

### Track Next/PostCSS advisory

Finding: F-010

Acceptance criteria:

- Advisory is tracked in dependency maintenance.
- Next is upgraded when a safe compatible version resolves the bundled PostCSS advisory.
- No major downgrade is applied just to satisfy npm's suggested fix.

## Regression Suite

Run before shipping fixes:

```bash
npm run lint
npm run test
npm run build
```

Run with live/staging audit users:

```bash
E2E_BASE_URL=https://lead-generation-orcin.vercel.app \
E2E_SUPABASE_EMAIL=<admin-audit-email> \
E2E_SUPABASE_PASSWORD=<admin-audit-password> \
npm run test:e2e
```
