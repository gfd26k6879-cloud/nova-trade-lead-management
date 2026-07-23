# Codex Handoff

Historical handoff: June 16, 2026. The July 12, 2026 remediation checkpoint below supersedes its unqualified current-state claims.

## Active Workspace

Use this repo only:

`/Users/stevmq/lead-generation`

The old local folder was archived because it was stale:

`/Users/stevmq/lead-generation-main.archived-20260514-223729`

GitHub and Vercel deploy from the active repo. Do not continue work from the archived folder.

## July 12, 2026 Remediation Checkpoint

- The active local branch is `codex/agile-discovery-engine`; the whole-app remediation is intentionally uncommitted, unpushed, undeployed, and includes three unapplied tracked Supabase migrations.
- Node 24 `npm run release:check` passed: TypeScript, ESLint, 96 Vitest files / 515 tests, recovery-contract verification, a production build, and five public read-only Playwright checks.
- Protected-page proxy coverage now has one canonical route list and includes `/explore`; the current production build redirects an unauthenticated `/explore` request to `/login` with private no-store caching before the protected layout runs.
- AI queue audit bookkeeping is now non-critical: an audit-write failure cannot reprocess discovery or enrichment after the core queue operation succeeds, and a failed queue attempt's audit write cannot turn completed discovery/enrichment work into a retry.
- Isolated local desktop/mobile browser QA passed for the public login/privacy flow, password-recovery navigation, and unauthenticated protected-route redirects. Authenticated admin/researcher browser QA remains blocked by absent approved E2E state or credentials.
- Live read-only checks confirmed `https://www.nosite.xyz/api/health` and `/login` return 200 and `/queue` redirects to `/login` with the expected security headers. This does not prove the local branch is deployed.
- Live `https://www.nosite.xyz/robots.txt` now contains the intended invite-only rules without a prepended Cloudflare-wide `Allow: /` policy. The former Managed-robots follow-up is resolved as of this checkpoint.
- The local workspace still has no `DATABASE_URL` or linked Supabase CLI project, but read-only Supabase/Vercel connector checks now verify current migration, scheduler/backlog, privilege, deployment, and runtime-error state. Production backup/restore and authenticated browser workflows remain explicitly unverified.

## July 12, 2026 Read-Only Production Evidence

- Supabase `nosite-leads-prod` is `ACTIVE_HEALTHY`; its tracked remote migration history currently ends at `202606160001_launch_readiness_reliability`. The three newer local migrations (`202607100001`, `202607120001`, and `202607120002`) are not applied.
- All 23 public application tables deny direct `SELECT` and `INSERT` to both `anon` and `authenticated`; the advisor's repeated RLS-with-no-policy notices are intentional deny-by-default, not an observed data-access leak.
- Production is operationally paused: all five scheduler flags are disabled, no worker run exists in the last seven days, 5,744 leads remain in the AI `queued` state (last updated June 12), and one crawl run is paused. Re-enabling this will trigger provider work and was not performed.
- Vercel production deployment `dpl_9ozH32aFsC6qgtJdK9tiWNetUec7` is `READY` at commit `783127179c8db009c388aa34d8078452063736c5`; it is the pre-remediation baseline, not this uncommitted local work. Vercel reported no runtime error clusters in the last seven days.

## Current Production State

- GitHub repo: `https://github.com/Masihhedayati/lead-generation`
- Production app: `https://www.nosite.xyz`
- Latest deployed commit confirmed July 12: `783127179c8db009c388aa34d8078452063736c5`
- Latest production deployment confirmed July 12: `dpl_9ozH32aFsC6qgtJdK9tiWNetUec7`
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
- Superseded July 12, 2026: live `robots.txt` no longer prepends a broad Cloudflare `Allow: /` block; the invite-only policy is now the full observed response.

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
   E2E_BASE_URL=https://www.nosite.xyz npm run test:e2e:launch
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
