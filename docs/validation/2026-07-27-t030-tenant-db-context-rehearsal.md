# T-030 tenant DB context rehearsal

Status: implementation evidence captured for independent parent review; not an activation or live-environment verification.

## Scope and changed files

- `src/lib/db/index.ts`
- `src/lib/__tests__/tenant-db-context.test.ts`
- `docs/architecture/tenant-db-runtime-context.md`
- `docs/validation/2026-07-27-t030-tenant-db-context-rehearsal.md`

No migration, schema, query, route, package, lockfile, UI, remote database, Supabase, production, customer-data, account, credential, commit, push, or deployment action was performed. The shared `main` worktree was already dirty; unrelated changes were preserved.

## Disposable PostgreSQL 16 rehearsal

Target: local Docker container `nova-trade-t030-pg16`, image `postgres:16`, synthetic empty database only. The container exposed an ephemeral loopback port and was accessed with a synthetic local password that was not written to the repository or output.

Bootstrap used a migration/admin role `t030_migration_admin` and a dedicated LOGIN runtime role `t030_runtime_app`. The synthetic table `public.t030_tenant_probe` was owned by the admin role. The runtime role received only schema USAGE and SELECT on that probe table.

Observed receipt from the runtime role:

| Observation | Result |
|---|---|
| `current_user` | `t030_runtime_app` |
| `rolsuper` | `false` |
| `rolbypassrls` | `false` |
| schema USAGE | `true` |
| probe SELECT | `true` |
| probe table owner | `t030_migration_admin` |
| probe RLS flags | `relrowsecurity=false`, `relforcerowsecurity=false` |

Inside a transaction, parameterized `set_config(..., true)` exposed the synthetic tenant, workspace, actor, and empty support-grant context. After commit, `NULLIF(current_setting(..., true), '')` returned NULL for tenant, workspace, actor, and support values. The Vitest Postgres run additionally proved concurrent tenant A/B transaction isolation and rollback cleanup through the application adapter.

This is isolated local PostgreSQL 16 evidence only. Remote, staging, and production role ownership, pooler mode, RLS policy state, and connection configuration remain unverified and activation-blocked.

## Commands and results

- `npm run typecheck` — exit 0.
- `npx eslint src/lib/db/index.ts src/lib/__tests__/tenant-db-context.test.ts` — exit 0, no warnings after the final patch.
- `npx vitest run src/lib/__tests__/tenant-db-context.test.ts src/lib/__tests__/tenant-context.test.ts src/lib/__tests__/worker-context.test.ts` — 3 files, 27 tests passed on SQLite.
- `DATABASE_URL=<local disposable runtime URL> DATABASE_SSL=disable POSTGRES_MAX_CONNECTIONS=2 npx vitest run src/lib/__tests__/tenant-db-context.test.ts` — 1 file, 7 tests passed on PostgreSQL 16.
- `npx vitest run src/lib/__tests__/db-postgres-client.test.ts src/lib/__tests__/db-ready-retry.test.ts src/lib/__tests__/db-ready-runtime-guard.test.ts src/lib/__tests__/tenant-context.test.ts src/lib/__tests__/worker-context.test.ts src/lib/__tests__/internal-worker-auth.test.ts src/lib/__tests__/internal-worker-route.test.ts` — 7 files, 59 tests passed.
- `npm test` — 119 files, 2,088 tests passed.
- `git diff --check -- src/lib/db/index.ts src/lib/__tests__/tenant-db-context.test.ts` — exit 0; new-file whitespace was separately scanned.

## Adversarial probes

- Stale pooled state: transaction-local GUCs were checked after commit/rollback and on pooled reuse; no semantic tenant/workspace/actor/support value remained.
- Concurrent tenant requests: tenant A/B ran concurrently against separate PostgreSQL pool transactions and remained isolated; SQLite callbacks also remained scope-separated, with serialized SQLite transaction handling.
- Malformed input: missing context, malformed worker context, extra support argument, and invalid nested authority were rejected before the scoped callback.
- Nested scope broadening: a member scope combined with a different worker scope was rejected; identical nested scope reused the active transaction client.
- Misleading success output: role, ownership, GUC, test counts, exit codes, and cleanup were captured separately; no live-state claim is made.
- Hung cleanup: container identity was verified before removal, and post-removal Docker inspection was required.

## Cleanup

The disposable container was created only for this rehearsal and was removed after evidence capture. Cleanup verified `/nova-trade-t030-pg16|postgres:16|running` before `docker rm -f`, then reported `CLEANUP_CONTAINER=absent`. No repository temp file or credential file was created.

## Cutover obligation and blockers

`withTenantDbContext` is the canonical wrapper, but this task does not claim every existing query is tenant-scoped. Later query adapters and T-027 RLS work must move tenant-owned queries into this boundary and prove policy behavior under the restricted role. T-021 support authority is not accepted, so support context remains fail-closed with no spoofable extension path. Live role, pooler, and RLS state remains unverified.
