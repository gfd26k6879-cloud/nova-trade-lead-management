# Nova Trade Agent Handoff

Current as of September 2, 2026. This document replaces the historical June/July handoff state. Older plans and audits remain useful history, but they are not the current task queue.

## Start here

- Workspace: `/home/Masih/Projects/nova-trade-lead-management`
- GitHub: `https://github.com/Masih-0x3/nova-trade-lead-management`
- Branch: `codex/nova-multitenant-integration`
- Checkpoint base: `320fcb3` (`fix: tenant-scope bulk lead ai operations`)
- Pre-push remote baseline: `58e58f81e6a9b80b87f4aaab428cbf3a703082ac`
- This handoff is committed with the checkpoint it describes; use `git rev-parse HEAD` and `git status --short --branch` for its final SHA and live remote position.
- Active plan: `docs/plans/2026-08-29-lean-finish-plan.md`
- Product requirements: `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`

The checkpoint includes the newest tenant-hardening and worker work. After the checkpoint, the only expected working-tree entry is the unrelated local `.commandcode/` directory: do not edit, stage, or commit it.

Do not stage, commit, push, deploy, run CI/CD, apply remote migrations, enable paid provider work, or mutate production unless the user explicitly asks. The present goal is a complete local application first.

## What is implemented

The existing lead-management application is largely implemented and its current code gates are green. Recent work completed these areas:

- Tenant-safe lead reads, writes, ownership changes, quality actions, exclusions, lifecycle actions, outreach/demo actions, dashboard analytics, API usage, cache access, and score recomputation.
- Compare-and-swap and lease protections for concurrency-sensitive lead, crawl, enrichment, AI-verification, and worker operations.
- Fail-closed authorization at protected pages, settings/admin actions, exports, and worker routes.
- Hardened authentication callback redirects.
- Local SQLite tenant-membership administration with a durable mutation journal, tenant-scoped history, role assignment, and authorization checks.
- PostgreSQL worker-dispatch migration, lease store, lease runtime, exact worker/action binding, generations, replay protection, cancellation, and restricted-role inspection.
- Exact lazy lease resolution on all five worker routes:
  - `/api/crawl/process-next`
  - `/api/crawl/enrich-next`
  - `/api/ai/verify-next`
  - `/api/ai/artifacts/process-next`
  - `/api/scores/recompute-stale`
- Tenant-scoped canonical-place backfill, crawl/enrichment queueing, place cache, aggregates, and worker selection.
- Windows-only durability tests are capability-gated instead of failing other platforms.

The branch history also contains foundations for tenant/workspace/RBAC, document intake and extraction, bounded agent execution, connector policy/runtime, lifecycle jobs, audit context, exports, deletion, support access, and private document storage. Treat these as foundations, not proof that their complete user-facing workflows are finished.

## What is not implemented or proven

### Immediate local-runtime gap

The code compiles, tests, and builds, but the authenticated application and durable workers have not yet been exercised end to end against a local Supabase stack.

To close that gap:

1. Start a local Supabase Auth + PostgreSQL environment and apply the repository migrations locally.
2. Configure local environment values without committing them.
3. Seed an admin identity, tenant, workspace, membership, role binding, and policy.
4. Provision the restricted worker lease issuer/resolver roles.
5. Add a small local dispatcher that acquires a durable lease and calls the matching worker route.
6. Run authenticated browser tests for admin and researcher paths, then exercise each worker route.

Authentication is Supabase-only. Without Supabase configuration, public pages and the SQLite-backed application shell can run, but protected pages cannot be used. When `DATABASE_URL` is absent, application data falls back to `nosite-leads.db`; this does not replace Supabase Auth or the PostgreSQL worker lease path.

Required worker runtime variables include:

- `TENANT_WORKER_LEASE_ISSUER_DATABASE_URL`
- `TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL`

These are not yet documented in `.env.example`. Missing or malformed worker configuration correctly results in `401` and zero work; there is no SQLite or application-role fallback.

Initial provisioning still explicitly reports these blockers in `src/lib/tenancy/provisioning.ts`:

- `OWNER_ACCEPTANCE_REQUIRED`
- `INVITATION_RECORD_NOT_IMPLEMENTED`
- `INVITATION_DELIVERY_NOT_IMPLEMENTED`
- `AUTH_USER_CREATION_NOT_IMPLEMENTED`

### Broader product gap

The expanded multi-tenant lead-intelligence product is not “done except for the database.” Major end-to-end product work remains in:

- invitation acceptance and full tenant operations;
- document upload, scanning, extraction, evidence review, and citations;
- business understanding, adaptive questions, ICPs, and lead plays;
- generalized connectors, canonical accounts, contacts, and buying centers;
- explainable qualification and reusable review queues;
- cited outreach approval/export and outcome learning;
- the complete authenticated UI over real services;
- local acceptance, then staging/release work after explicit authorization.

The existing lead-management application is much closer to completion than that expanded product vision. Do not conflate the two scopes.

## Runtime configuration

Copy `.env.example` to an ignored `.env.local` and use local-only values. Never commit credentials. Relevant configuration includes:

- `DATABASE_URL` and `POSTGRES_MAX_CONNECTIONS`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOSITE_BOOTSTRAP_ADMIN_EMAIL`
- `NOSITE_ENCRYPTION_SECRET`
- `WORKER_CRON_SECRET`
- the two worker lease database URLs above
- optional Google Places, Google Maps, and OpenAI keys when real provider calls are intentionally enabled

Real provider credentials are not required for the first local structural/authentication pass. Keep paid work disabled until explicitly approved.

## Last verified state

On September 2, 2026, with Node 24:

- TypeScript passed.
- Full ESLint passed.
- Vitest passed: 265 files, 3,990 tests; 16 files and 186 environment/capability-dependent tests skipped.
- Next.js production build passed and generated all 11 static pages.
- `git diff --check` passed.
- The Git index was empty.
- `/login` returned `200` under `next start`.
- `/dashboard` returned the expected unauthenticated `307` redirect.
- `/api/health` returned `503` because required local deployment/auth/runtime configuration was absent.

Use the repository's Node 24-compatible commands:

```bash
npx -y node@24 ./node_modules/typescript/bin/tsc --noEmit
npx -y node@24 ./node_modules/eslint/bin/eslint.js .
npx -y node@24 ./node_modules/vitest/vitest.mjs run
npx -y node@24 ./node_modules/next/dist/bin/next build
git diff --check
```

Run focused tests while editing. Run the full set after a shared foundation or complete workflow changes; do not rerun the entire gate after every tiny edit.

## Git and secret safety

A September 2 pre-push scan found:

- no copy of the exposed callback token in the working tree or outgoing history;
- no committed `.env`, credential, private-key, or secret files;
- no outgoing blobs larger than 5 MB;
- only deliberate fake credential strings inside security tests;
- an empty staging index.

The GitHub/CodeRabbit credential pasted into the prior conversation must still be revoked or rotated because chat exposure is enough to compromise it.

GitHub will not transfer ignored local state such as `.env.local`, SQLite databases, Supabase local metadata, or provider credentials. Transfer required local secrets through an approved secret channel and recreate disposable local data where possible.

## Next agent workflow

1. Read this file and the lean finish plan.
2. Run `git status --short --branch` and inspect overlapping changes before editing.
3. Take the first ready outcome that does not overlap another active writer.
4. Implement the smallest complete vertical slice and run its focused checks.
5. Report only changed files, checks, and a real blocker. Update the plan only when an outcome changes state.

The immediate priority is `L-01` in the lean finish plan: make the current application genuinely usable locally with local Supabase, seeded tenant identity, worker roles, dispatcher, and authenticated browser proof.
