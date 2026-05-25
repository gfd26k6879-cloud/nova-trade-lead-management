# Live Website Audit Remediation Backlog

Date: 2026-05-20  
Target: https://lead-generation-orcin.vercel.app

## P1

### Deploy and verify revenue/accountability surfaces

Finding: F-001  
Impact: The live app does not expose `/fulfillment` or `/team`, blocking the admin fulfillment queue and team accountability workflow.

Acceptance criteria:

- `/fulfillment` loads for admin and shows the fulfillment queue.
- `/team` loads for the intended authenticated roles.
- Unauthorized users are redirected or denied consistently.
- Dashboard links and badges point to live working pages.
- Mobile screenshots confirm the pages are usable.

Suggested tests:

- Playwright admin smoke for `/fulfillment`.
- Playwright researcher direct-route denial for `/fulfillment`.
- Playwright team page visibility test.
- API/route probe confirming anonymous users cannot access protected surfaces.

### Complete authenticated live audit with disposable test accounts

Finding: F-002  
Impact: Role, ownership, IDOR, claim race, fulfillment creation, and admin-only actions remain unverified on live.

Acceptance criteria:

- Admin, team-lead researcher, and regular researcher test accounts are available.
- Audit-prefixed test data is created or approved.
- Authenticated audit evidence is captured for all planned scenarios.
- Any confirmed findings are added to the audit report.

Suggested tests:

- Run existing E2E against `E2E_BASE_URL=https://lead-generation-orcin.vercel.app`.
- Add role-specific E2E checks for researcher denial and admin access.
- Use two browser contexts for claim race and ownership checks.

## P2

### Add HTTP security hardening headers

Finding: F-003  
Impact: Missing defense-in-depth against clickjacking, MIME sniffing, referrer leakage, and injection blast radius.

Acceptance criteria:

- Public pages, protected redirects, and API responses include:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - either `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`
- `X-Powered-By` is removed if practical.
- Supabase auth, fonts, Next.js assets, and API calls continue working under CSP.

Suggested tests:

- Header probe for `/login`, `/dashboard`, `/queue`, `/api/health`, `/api/export/csv`.
- Browser smoke test after CSP.
- Authenticated E2E once credentials are available.

### Fix auth page button contrast

Finding: F-004  
Impact: Login, forgot-password, and reset-password primary buttons fail WCAG AA contrast.

Acceptance criteria:

- Primary button contrast is at least `4.5:1` at normal text sizes.
- axe-core reports zero color contrast violations on `/login`, `/forgot-password`, and `/reset-password`.
- Visual styling still matches the product.

Suggested tests:

- axe-core desktop and mobile checks.
- Screenshot comparison for auth pages.

## P3

### Minimize public health endpoint response

Finding: F-005  
Impact: Low-sensitivity fingerprinting from service name and exact timestamp.

Acceptance criteria:

- `/api/health` still returns `200`.
- Response only includes fields required by monitoring.
- Deployment health checks continue passing.

Suggested tests:

- `GET /api/health` returns expected minimal JSON.
- Vercel or external health monitor still recognizes the endpoint as healthy.

## Verification Command Set

Run after fixes:

```bash
npm run lint
npm run test
npm run build
E2E_BASE_URL=https://lead-generation-orcin.vercel.app npm run test:e2e
```

Run the authenticated E2E command only after setting live/staging test credentials:

```bash
E2E_BASE_URL=https://lead-generation-orcin.vercel.app \
E2E_SUPABASE_EMAIL=<admin-test-email> \
E2E_SUPABASE_PASSWORD=<admin-test-password> \
npm run test:e2e
```
