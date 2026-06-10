# Codex Handoff

Last updated: May 15, 2026

## Active Workspace

Use this repo only:

`/Users/stevmq/lead-generation`

The old local folder was archived because it was stale:

`/Users/stevmq/lead-generation-main.archived-20260514-223729`

GitHub and Vercel deploy from the active repo. Do not continue work from the archived folder.

## Current Production State

- GitHub repo: `https://github.com/Masihhedayati/lead-generation`
- Production app: `https://www.nosite.xyz`
- Latest deployed commit at handoff: `700ffcda021f1ca1c9b919eda4fe1d85c53d83aa`
- Latest deployment ID at handoff: `dpl_HusAKCbXQqVSumyTAJtXUbT59onV`
- Vercel project: `lead-generation`
- Runtime: Next.js 16.2.6, React 19.2.6, Node 24.x on Vercel
- Database: Supabase Postgres in production, SQLite locally when `DATABASE_URL` is not set

## Major Work Completed

- Built the AI-verified lead quality pipeline around `gpt-5.4-mini` only.
- Added automatic AI verification queueing for eligible discovered leads.
- Added lead intelligence artifacts:
  - Business Detail / Website Build Brief
  - Competitive Report / Pitch Brief
- Added Scheduler Operations Center at `/scheduler`.
- Added Supabase Cron worker endpoints and shared worker auth support.
- Improved Discovery/Coverage controls with pause, resume, stop, retry, and clearer run progress.
- Fixed stale AI website state handling so AI-found usable websites are repaired out of no-site/ready queues.
- Added atomic worker leasing for:
  - AI verification jobs
  - lead AI artifact jobs
  - crawl units
- Added artifact retry metadata and retry behavior.
- Fixed welcome invite and password reset links to use canonical `NEXT_PUBLIC_APP_URL`.
- Replaced temporary password display with welcome invite/reset email flow.
- Added CSV formula-injection protection.
- Added route aliases for `/discover`, `/run-monitor`, `/monitor`, and `/stats`.
- Archived the stale local repo and documented the active source of truth.

## Verification From Last Remediation Batch

These passed locally before deploy:

```bash
npm run lint
npm run test
npm run build
```

Test count at handoff:

```text
30 test files passed
149 tests passed
```

E2E status:

```text
npm run test:e2e
19 skipped because local E2E auth credentials were not configured.
```

Production smoke checks after deploy:

- `/api/health` returned `200`.
- `/discover` redirected to `/dashboard`.
- `/run-monitor` redirected to `/coverage`.
- `/scheduler` redirected to login when unauthenticated.
- `/forgot-password` loaded.

## Important Caveats

- `npm audit --omit=dev` still reports a moderate advisory from Next's bundled PostCSS under `next@16.2.6`. npm suggests a breaking downgrade to `next@9.3.3`, so it was intentionally not applied.
- Direct `supabase db push` was not possible from the local shell because the active workspace was not Supabase-linked and the pulled Vercel `DATABASE_URL` was empty. The migration is committed, and the app also has a runtime additive guard for the new artifact retry columns/indexes.
- Supabase migrations should still be applied through the normal linked Supabase workflow when available.

## Next Best Tasks

1. Link this repo to the production Supabase project locally, then run migration status/push:

   ```bash
   supabase link --project-ref <production-project-ref>
   supabase db push --dry-run
   supabase db push
   ```

2. Add local E2E credentials so Playwright tests can actually run:

   ```bash
   E2E_SUPABASE_EMAIL=<admin email>
   E2E_SUPABASE_PASSWORD=<password>
   ```

3. Open `/scheduler` in production after login and verify:
   - worker toggles display correctly,
   - AI verification queue is draining,
   - worker auth failures, if any, show clear messages,
   - score recompute repairs AI-found usable websites out of no-site queues.

4. Continue improving lead quality:
   - review several AI-verified leads manually,
   - mark false positives/incorrect websites,
   - tune scoring weights based on actual pitch outcomes.

5. Later, add a true historical coverage ledger across all runs. Current Coverage/Discovery Monitor is intentionally scoped to the selected/latest run.

## Safe Startup For A New Codex Project

Open the new Codex project at:

`/Users/stevmq/lead-generation`

Then run:

```bash
git status
git pull origin main
npm install
npm run lint
npm run test
npm run build
```

If the old chat says "Current working directory missing", that is expected because it started from the archived stale folder. Start new work from the active repo above.
