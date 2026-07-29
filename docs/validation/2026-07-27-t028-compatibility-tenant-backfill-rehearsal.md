# T-028 Compatibility-Tenant Backfill Rehearsal

Date: 2026-07-27
Scope: synthetic local SQLite and disposable stock PostgreSQL 16 only
Status: implemented and rehearsed; real activation remains blocked

## Changed files

- `supabase/migrations/202607270010_add_compatibility_tenant_backfill.sql`
- `src/lib/tenancy/compatibility-backfill.ts`
- `src/lib/__tests__/compatibility-tenant-backfill.test.ts`
- this validation receipt

No application configuration, production database, remote database, customer data, real SQLite database, outreach system, or parent ledger was changed. No commit was created.

## Boundary and activation blocker

T-028 is an explicit, snapshot-bound compatibility mapping. It adds nullable ownership columns only to the accepted D-001 legacy ownership map, preserves historical `audit_logs` rows as deliberately `legacy_unscoped`, creates one manifest-selected tenant/workspace/policy foundation, and maps users, market access, memberships, roles, and disabled status only from the approved manifest.

Real activation remains blocked: there is no approved compatibility owner/auth identity and no authorized rehearsal snapshot. T-028 does not pre-complete G-002 through G-004; compound child ownership FKs, general query scoping, worker scoping, and compatibility-table RLS remain later Phase-2 work. The migration does not infer an owner from email, domain, name, browser input, or arbitrary existing identity, and it does not run a real backfill automatically. Rollback is snapshot/restore only; there is no down migration.

## Cross-engine contract

The PostgreSQL receipt accepts exactly these two source-engine/checksum pairs:

| source engine | checksum algorithm |
|---|---|
| `sqlite` | `novatrade-sqlite-canonical-json-v1` |
| `postgres` | `novatrade-postgres-jsonb-text-v1` |

The PostgreSQL operator backfill function itself accepts only the PostgreSQL pair. A historical SQLite receipt may be restored under the recovery contract, but it is not replayable through the PostgreSQL operator.

Both engines bind `sourceEngine` and `checksumAlgorithm` into the manifest, typed receipt row, receipt JSON, and replay validation. SQLite canonical JSON uses code-unit key ordering and requires `PRAGMA foreign_keys=ON`; the two-connection harness also proves that its bounded `BEGIN IMMEDIATE` writer lock is enforced. PostgreSQL uses the stock built-in `pg_catalog.sha256(pg_catalog.convert_to(..., 'UTF8'))` plus `pg_catalog.encode(..., 'hex')`, without `pgcrypto` or `digest`.

## Mapping and policy safety

`user_market_access.user_id` maps to `app_users.user_id`, which is the auth identity (`authIdentityId`), not the app row `id`. The same auth-identity contract applies to mapped auth references such as `created_by_user_id`; every unmapped reference fails closed before mutation. Historical audit actors remain deliberately `legacy_unscoped` with null tenant/workspace scope.

The receipt policy FK is composite: `(tenant_id, policy_id)` references `(tenant_id, id)` and is backed by the unique tenant policy key. Cross-tenant policy substitution is rejected. The receipt row and JSON binding cover the engine/checksum pair, manifest and snapshot fingerprints, tenant/workspace/owner, policy fields, counts, checksums, relationship orphan count, status, and receipt identity. Append-only protection, forced receipt RLS, deny-by-default grants, deterministic locking, precondition checks, replay checks, and exact baseline-policy validation remain in force.

## Final round-4 evidence

The focused default suite finished with 14 passed and 1 skipped (the opt-in PostgreSQL test). Focused ESLint exited 0 and `git diff --check` exited 0.

The exact fresh conductor target was:

```text
container novatrade-t028-parent-r4-pg16
postgres:16-alpine
database t028_compatibility_rehearsal
port 55446
```

The conductor ran:

```text
env T028_RUN_DISPOSABLE_PG_TESTS=1
T028_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55446/t028_compatibility_rehearsal
npx vitest run src/lib/__tests__/compatibility-tenant-backfill.test.ts --reporter=verbose
```

Result: exit 0; 1 file / 15 tests passed. The conductor suite verified the PostgreSQL engine/checksum binding, auth-identity mapping and fail-closed references, preserved `legacy_unscoped` audit scope, composite policy FK including cross-tenant rejection, historical SQLite receipt restoration without PostgreSQL replay, idempotent convergence, checksum/policy replay drift rejection, receipt immutability, and runtime privilege/RLS boundaries. All rows were synthetic.

The full typecheck was attempted during this conductor round but transiently failed solely in the concurrently edited T-029 test. The earlier standalone `npx tsc --noEmit --pretty false` exit-0 result is preserved as earlier evidence; a fresh full typecheck is not claimed as re-proven in round 4 until integration.

## Earlier SQLite and PostgreSQL evidence retained

The local SQLite rehearsal used only `:memory:` databases and a temporary lock fixture; the real `nosite-leads.db` was not opened or modified. Earlier evidence recorded the standalone focused suite and typecheck as passing before the round-4 conductor update. The disposable PostgreSQL rehearsal likewise used only synthetic rows and verified PostgreSQL 16, the built-in SHA-256 path, no `pgcrypto` extension, zero residue after pre-activation rejection, exact tenant/workspace/membership/role outcomes, disabled-user suspension/revocation, receipt idempotency, checksum/policy drift denial, and browser/runtime denial of receipt access.

## Cleanup

Both exact disposable containers were removed:

```text
docker rm -f novatrade-t028-pg16
docker rm -f novatrade-t028-parent-r4-pg16

docker ps -a --filter name=novatrade-t028-pg16
no rows
docker ps -a --filter name=novatrade-t028-parent-r4-pg16
no rows
```

No production, remote, or customer data was used, and no other container, database, file, or external system was targeted.
