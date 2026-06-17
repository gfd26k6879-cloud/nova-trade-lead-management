# Codex Handoff

Last updated: June 16, 2026

## Active Workspace

Use this repo only:

`/Users/stevmq/lead-generation`

The old local folder was archived because it was stale:

`/Users/stevmq/lead-generation-main.archived-20260514-223729`

GitHub and Vercel deploy from the active repo. Do not continue work from the archived folder.

## Current Production State

- GitHub repo: `https://github.com/Masihhedayati/lead-generation`
- Production app: `https://www.nosite.xyz`
- Latest deployed commit before this remediation batch: `59f8bf0bf75a`
- Latest deployment ID at handoff: not re-verified in this local pass
- Vercel project: `lead-generation`
- Runtime: Next.js 16.2.6, React 19.2.6, Node 24.x on Vercel
- Database: Supabase Postgres in production, SQLite locally when `DATABASE_URL` is not set
- Launch posture: invite-only public. The app stays private/admin-invited; `/privacy`, `/terms`, `/support`, `/data-sources`, and published demo links are public.

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
- Removed the legacy batch worker route so individual scheduler endpoints are the only worker execution API.
- Added enrichment lease/retry/error terminal state, atomic lead upsert metadata, and failed-run terminal status.
- Added admin launch readiness checklist, fulfillment pressure badge, public trust pages, demo draft/publish/unpublish/revoke/view lifecycle, and Statistics value-proof reporting.
- Added shared dialog focus management and keyboard-safe Kanban move controls.

## Verification From Last Remediation Batch

These passed locally under Node 24 in the June 16 launch-readiness remediation:

```bash
npm run lint
npm run test
npm run build
```

Also passed:

```text
npx tsc --noEmit --pretty false
85 test files passed
405 tests passed
```

E2E status:

```text
Authenticated rendered QA is still blocked until E2E_STORAGE_STATE or E2E_SUPABASE_EMAIL/E2E_SUPABASE_PASSWORD are configured.
```

Local production-mode smoke:

- `next start` passed on `http://127.0.0.1:3001`.
- `/privacy`, `/terms`, `/support`, `/data-sources`, and `/login` rendered at desktop and mobile widths with no detected horizontal overflow.
- `/dashboard`, `/coverage`, `/explore`, `/leads`, `/quality`, `/team`, `/statistics`, `/users`, and `/scheduler` all landed on `/login` when unauthenticated.
- The deleted legacy batch worker route returned `404`.
- `/api/health` returned only coarse JSON, but local status was `503` because the local dependency check was unhealthy.

Production smoke checks after deploy:

- Not yet re-run for this local remediation batch.
- Required after deploy: `/api/health`, trust pages, protected redirects, deleted legacy worker route 404, admin/researcher authenticated smoke, Supabase migration/RLS/Vault/cron state, and robots posture.

## Important Caveats

- `npm audit --omit=dev` still reports a moderate advisory from Next's bundled PostCSS under `next@16.2.6`. npm suggests a breaking downgrade to `next@9.3.3`, so it was intentionally not applied.
- Direct `supabase db push` was not run in the June 16 pass. Apply `supabase/migrations/202606160001_launch_readiness_reliability.sql` before live smoke.
- Supabase migrations should still be applied through the normal linked Supabase workflow when available.

## Next Best Tasks

1. Link this repo to the production Supabase project locally, then run migration status/push:

   ```bash
   supabase link --project-ref <production-project-ref>
   supabase db push --dry-run
   supabase db push
   ```

2. Add local E2E credentials or storage state so authenticated browser QA can actually run:

   ```bash
   E2E_STORAGE_STATE=.auth/admin.json
   E2E_SUPABASE_EMAIL=<admin email>
   E2E_SUPABASE_PASSWORD=<password>
   ```

3. Open `/scheduler` in production after login and verify:
   - worker toggles display correctly,
   - AI verification queue is draining,
   - worker auth failures, if any, show clear messages,
   - score recompute repairs AI-found usable websites out of no-site queues,
   - the legacy batch worker route returns 404 in production.

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
