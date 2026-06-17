# Vercel + Supabase Deployment Runbook

This is the production path for NoSite Leads. It keeps the app invite-only with admin-created users and uses Supabase as the server-side Postgres database.

## 1. Codebase Checks

Run these before pushing:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

For the launch screenshot QA pass, run the dedicated authenticated screenshot
spec after setting either `E2E_STORAGE_STATE` or both Supabase E2E credentials:

```bash
E2E_BASE_URL=https://www.nosite.xyz \
E2E_STORAGE_STATE=.auth/admin.json \
npm run test:e2e:launch
```

If no storage state is available, use:

```bash
E2E_BASE_URL=https://www.nosite.xyz \
E2E_SUPABASE_EMAIL=<admin email> \
E2E_SUPABASE_PASSWORD=<password> \
npm run test:e2e:launch
```

Do not assume `NOSITE_ADMIN_PASSWORD` is a valid E2E login password. Production
login uses Supabase `signInWithPassword`, so the screenshot audit needs a real
Supabase auth password or a captured `E2E_STORAGE_STATE` file.

Confirm these stay untracked:

- `.env.local`
- `nosite-leads.db`
- `nosite-leads.db-wal`
- `nosite-leads.db-shm`
- `data-export*/`
- `.next/`
- `test-results/`

## 2. Supabase Setup

Manual steps:

1. Create a Supabase project.
2. Pick a US region close to your Vercel region. US East is the safest default for Vercel's default serverless footprint.
3. Save the database password securely.
4. Copy the Transaction Pooler connection string, not the direct connection string.
5. Put that connection string in `DATABASE_URL`; do not commit it.

Apply schema:

```bash
supabase db push
```

If you do not use the Supabase CLI, run every file in `supabase/migrations/`
through the Supabase SQL editor in timestamp order. Do not apply only
`202605110001_full_schema.sql`; later migrations add auth-role revokes, RLS
policy posture, scheduler tables/jobs, Vault-backed worker configuration, and
location-access hardening that production depends on.

After applying migrations, verify at minimum:

- auth-role table access is revoked except where intentionally granted;
- RLS/default-privilege hardening migrations have run;
- `202606160001_launch_readiness_reliability.sql` has run, adding enrichment lease fields and demo lifecycle fields;
- `worker_cron_secret` and `worker_base_url` exist in Supabase Vault before
  applying scheduler cron migrations;
- `cron.job` contains the expected NoSite worker jobs;
- the Scheduler page reports the same worker set as `src/lib/scheduler/worker-metadata.ts`.

## 3. Migrate Local Data

Export local SQLite data:

```bash
npm run db:export:sqlite
```

By default this writes ignored JSON files to `data-export/` and intentionally blanks encrypted API keys from `settings`. To migrate encrypted key values, run with `MIGRATE_ENCRYPTED_KEYS=1` only if production will reuse the same `NOSITE_SESSION_SECRET`.

Import into Supabase:

```bash
$env:DATABASE_URL="postgresql://..."
npm run db:import:supabase
```

Validate expected row counts after import:

- `leads`: 5,653
- `crawl_units`: 4,280
- `place_observations`: 4,652
- `places_master`: 3,113
- `settings`: 1

## 4. GitHub

Manual steps:

1. Create a private GitHub repository.
2. Give Codex the repo URL when you want the first push.
3. Keep it private until login, secrets, and migration are verified.

Recommended branch:

```bash
git checkout -b codex/vercel-supabase
```

Before committing, review:

```bash
git status --short
```

Do not stage `.env*`, SQLite DB files, or `data-export*/`.

## 5. Vercel

Manual steps:

1. Import the private GitHub repo into Vercel.
2. Select Next.js defaults.
3. Set production branch to `main`.
4. Add environment variables:

```bash
DATABASE_URL=
POSTGRES_MAX_CONNECTIONS=1
NEXT_PUBLIC_APP_URL=https://www.nosite.xyz
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NOSITE_BOOTSTRAP_ADMIN_EMAIL=
NOSITE_ENCRYPTION_SECRET=
NOSITE_SESSION_SECRET=
WORKER_CRON_SECRET=
WORKER_ROUTE_TIMEOUT_MS=45000
GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_AI_COST_RESERVATION_USD=0.05
```

Redeploy after any environment variable change.

`NEXT_PUBLIC_APP_URL` should be set in Production because welcome invite and reset
links are generated server-side. Set it to the canonical production origin:
`https://www.nosite.xyz`. In Supabase Auth, set the Site URL to the same origin
and allow both callback entries as redirect URLs:

```text
https://www.nosite.xyz/auth/callback
https://www.nosite.xyz/auth/callback**
```

The `**` entry covers invite/reset links that include the app's `next` query
parameter. Without a matching callback redirect URL, Supabase can ignore the
app-provided `redirectTo` and fall back to the Site URL.

Invite and recovery emails must use the app-provided redirect URL, not
`{{ .SiteURL }}`, for their primary action links. The app sends Supabase this
exact redirect URL:

```text
https://www.nosite.xyz/auth/callback?next=%2Freset-password
```

The custom Supabase email templates should link to that redirect and append the
one-time token hash:

```html
<!-- Invite user template action link -->
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=invite">Set up account</a>

<!-- Reset password template action link -->
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
```

Do not build invite/recovery action links from `{{ .SiteURL }}`. If the
Supabase Site URL ever drifts back to a Vercel domain, `{{ .SiteURL }}` links
will send users to the wrong host. `{{ .RedirectTo }}` uses the URL passed by
the app for that specific invite/reset request.

With a Supabase Management API personal access token, check or reapply the
production Auth URL/template settings from this repo:

```bash
SUPABASE_ACCESS_TOKEN=... npm run auth:supabase:check
SUPABASE_ACCESS_TOKEN=... npm run auth:supabase:apply
```

The apply command also removes the known legacy
`lead-generation-orcin.vercel.app` redirect entry from the Auth allowlist.

`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is optional and only enables the Explorer's
manual Google map switch. It must be a browser-restricted Maps JavaScript API key
with HTTP referrer restrictions for the production and preview domains, plus a
low quota/budget in Google Cloud. Do not reuse `GOOGLE_PLACES_API_KEY` here. The
Explorer does not request Places, Geocoding, Routes, or Map Tiles libraries from
this browser map.

### Google Places cost guardrails

The app has internal Google Places caps, but Google Cloud quotas and billing
alerts are still required as the external safety net. Configure both before
starting Canada, U.K., or broad Colorado discovery.

Default app caps for the max-free posture:

- Text Search Pro: `4,900` calls/month.
- Enterprise Places SKUs: `900` calls/month.
- Google calls/day: `300`.
- Google calls/run: `500`.
- Test run cap: `50`.

Recommended Google Cloud setup:

1. Restrict `GOOGLE_PLACES_API_KEY` to the server-side Places API only.
2. Restrict `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` by HTTP referrer and Maps
   JavaScript API only.
3. Set Google Cloud quota caps at or below the app caps where the console allows
   it.
4. Add billing budget alerts below the free-safe threshold. Budget alerts are
   notification-only; they do not hard-stop usage.
5. Use Dashboard discovery in `Coverage probe` mode first. Switch to
   `Lead harvest` only for cells/categories whose probe yield justifies richer
   lead data.

Preview deployments should either point at a dedicated staging Supabase project
with the same required variables or be treated as build-only. Do not point PR
previews at production Supabase unless the test plan is explicitly read-only.
At minimum, production and any usable preview environment need:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOSITE_BOOTSTRAP_ADMIN_EMAIL`
- `NOSITE_ENCRYPTION_SECRET`
- `NOSITE_SESSION_SECRET`
- `WORKER_CRON_SECRET` or Supabase Vault `worker_cron_secret`

### Admin password recovery

Use the app's `/forgot-password` page for normal password resets. Supabase
recovery links are one-time-use; after the first click, later clicks can show
`One-time token not found` or an expired-link message.

If the admin is locked out and app-generated reset links still fail after the
env and Supabase Auth URL settings above are confirmed, use Supabase Dashboard
as the emergency path: set a temporary password for `masihation@gmail.com`,
sign in, and immediately change the password. Do not use dashboard-generated
reset emails as the normal recovery path.

## 6. Supabase Cron Scheduler

Production scheduling is owned by Supabase Cron, not Vercel Cron.

1. Save `WORKER_CRON_SECRET` in Supabase Vault as `worker_cron_secret`. The worker can read this from Vault through `DATABASE_URL`; keeping the same value in Vercel env is still recommended as a fast path.
2. Save the production app URL in Supabase Vault as `worker_base_url`.
3. Apply `supabase/migrations/20260514161714_supabase_ai_verification_cron.sql`.
4. Confirm the job exists:

```sql
select jobid, schedule, jobname, active
from cron.job
where jobname = 'nosite-ai-verification-worker';
```

5. Confirm calls are succeeding:

```sql
select status_code, error_msg, created
from net._http_response
order by created desc
limit 20;
```

## 7. Production Smoke Test

After deploy:

1. Log in.
2. Confirm the bootstrap admin gets an admin role.
3. Open `/users` and create the researcher account.
4. Open `/dashboard`, `/coverage`, `/explore`, `/leads`, `/quality`, `/team`, `/statistics`, `/users`, and `/scheduler` on desktop and mobile widths.
5. Confirm lead count matches Supabase.
6. Confirm CSV export requires admin login.
7. Confirm `/privacy`, `/terms`, `/support`, and `/data-sources` load publicly.
8. Confirm the deleted legacy batch worker route returns `404`.
9. Save or verify Google/OpenAI keys in Settings.
10. Run one low-cost Places test after fixing the Google API key.
11. Run one AI verification and confirm the model remains locked to `gpt-5.4-mini`.
12. Confirm the Supabase cron jobs drain queued worker work over several minutes.
13. Create a draft demo, publish it, open the public link, confirm view count increments best effort, then unpublish/revoke and confirm the public link stops serving.

## 8. First Hardening Pass

Do these after the first working deployment:

- Add Supabase backups or upgrade to Pro before heavy production usage.
- Add Vercel and Supabase log review to the weekly operating routine.
- Keep crawl/enrichment chunked through the scheduler endpoints.
- Keep outbound messaging manual until compliance is designed.
- Move to Supabase Auth only when multi-user accounts are needed.
