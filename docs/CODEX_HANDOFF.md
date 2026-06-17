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
- Latest deployed commit at handoff: `9a05b43`
- Latest deployment ID at handoff: `dpl_CDrrrd8C32nKzcT1WHd3U2jkY8jP`
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

June 16 continuation evidence:

- No local `.auth` storage-state file or E2E credential env vars were present.
- 1Password Environments MCP authenticated successfully, but no visible Environment was named for NoSite or this repo.
- Vercel production env names include Supabase/runtime/admin variables, but no `E2E_STORAGE_STATE`, `E2E_SUPABASE_EMAIL`, or `E2E_SUPABASE_PASSWORD` variables. Do not treat `NOSITE_ADMIN_PASSWORD` as proof of a Supabase E2E login; the app login path uses Supabase `signInWithPassword`.
- Wrangler is logged in with zone read and Workers-related scopes, but not zone settings/admin write. The Cloudflare API connector also returned an invalid-token error for a read call, so the Managed robots block still needs dashboard/owner-token access.

Local production-mode smoke:

- `next start` passed on `http://127.0.0.1:3001`.
- `/privacy`, `/terms`, `/support`, `/data-sources`, and `/login` rendered at desktop and mobile widths with no detected horizontal overflow.
- `/dashboard`, `/coverage`, `/explore`, `/leads`, `/quality`, `/team`, `/statistics`, `/users`, and `/scheduler` all landed on `/login` when unauthenticated.
- The deleted legacy batch worker route returned `404`.
- `/api/health` returned only coarse JSON, but local status was `503` because the local dependency check was unhealthy.

Production smoke checks after deploy:

- `https://www.nosite.xyz/api/health` returned `{"status":"ok","checkedAt":"..."}` with no dependency details.
- `/privacy`, `/terms`, `/support`, `/data-sources`, and `/login` rendered live at desktop and mobile widths with no detected horizontal overflow.
- The live trust pages no longer trigger Cloudflare Email Obfuscation injection or React hydration errors; support contact is rendered as `support [at] nosite.xyz`.
- `/dashboard`, `/coverage`, `/explore`, `/leads`, `/quality`, `/team`, `/statistics`, `/users`, and `/scheduler` all landed on `/login` when unauthenticated.
- The deleted legacy batch worker route returned `404`.
- Unauthenticated worker and explore API probes returned `401`.
- Production deployment is ready and aliased to `https://www.nosite.xyz`, `https://nosite.xyz`, and existing Vercel aliases.
- Still not performed: authenticated admin/researcher browser smoke, because `E2E_STORAGE_STATE` and `E2E_SUPABASE_EMAIL`/`E2E_SUPABASE_PASSWORD` were unavailable.
- Still owner-level follow-up: Cloudflare Managed robots content still prepends a broad `User-agent: *` / `Allow: /` block before the app's stricter invite-only robots rules.

## Important Caveats

- `npm audit --omit=dev` still reports a moderate advisory from Next's bundled PostCSS under `next@16.2.6`. npm suggests a breaking downgrade to `next@9.3.3`, so it was intentionally not applied.
- `supabase/migrations/202606160001_launch_readiness_reliability.sql` was applied directly through `supabase db query --linked --file ...`, and `supabase migration repair --linked --status applied 202606160001` succeeded.
- Supabase migration history is still broadly drifted from prior remote repairs, so do not run a blanket `supabase db push` without first reconciling local and remote migration history.

## Next Best Tasks

1. Reconcile Supabase migration history before the next schema migration:

   ```bash
   supabase migration list --linked
   supabase db pull
   ```

2. Add local E2E credentials or storage state so authenticated browser QA can actually run:

   ```bash
   E2E_STORAGE_STATE=.auth/admin.json
   E2E_SUPABASE_EMAIL=<admin email>
   E2E_SUPABASE_PASSWORD=<password>
   ```

   Then run the read-only launch screenshot audit:

   ```bash
   E2E_BASE_URL=https://www.nosite.xyz npx playwright test e2e/launch-auth-screenshots.spec.ts
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
