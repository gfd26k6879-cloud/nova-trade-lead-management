# Vercel + Supabase Deployment Runbook

This is the first production path for NoSite Leads. It keeps the app single-admin and uses Supabase only as the server-side Postgres database.

## 1. Codebase Checks

Run these before pushing:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

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

If you do not use the Supabase CLI, paste `supabase/migrations/202605110001_full_schema.sql` into the Supabase SQL editor and run it once.

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
NOSITE_ADMIN_USERNAME=
NOSITE_ADMIN_PASSWORD=
NOSITE_SESSION_SECRET=
GOOGLE_PLACES_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_AI_COST_RESERVATION_USD=0.05
```

Redeploy after any environment variable change.

## 6. Production Smoke Test

After deploy:

1. Log in.
2. Confirm lead count matches Supabase.
3. Open `/leads`, `/queue`, `/dashboard`, `/statistics`, and `/settings`.
4. Confirm CSV export requires login.
5. Save or verify Google/OpenAI keys in Settings.
6. Run one low-cost Places test after fixing the Google API key.
7. Run one AI verification and confirm the model remains locked to `gpt-5.4-mini`.

## 7. First Hardening Pass

Do these after the first working deployment:

- Add Supabase backups or upgrade to Pro before heavy production usage.
- Add Vercel and Supabase log review to the weekly operating routine.
- Keep crawl/enrichment manual and chunked.
- Keep outbound messaging manual until compliance is designed.
- Move to Supabase Auth only when multi-user accounts are needed.
