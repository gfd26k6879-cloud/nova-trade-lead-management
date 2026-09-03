# G-002 Location and Crawl Tenant Scope Validation

Date: 2026-07-29
Baseline: `1c9647d76c35dbac991b07eb962de5a54135bce2`
Initial G-002 commit: `8c48db28653e2b287de6a94cc45d6c5439371d0e`
Branch: `codex/nova-platform-tenancy`
Scope: synthetic local tests and disposable stock PostgreSQL 16 databases only
Status: G-002 repair implemented and locally validated; T029 recovery parity remains blocked as described below; no production or remote mutation performed

## Changed files

- `supabase/migrations/202607290001_add_location_crawl_tenant_scope.sql`
- `src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts`
- `src/lib/__tests__/data-transfer-contract.test.ts` (migration inventory assertions only)
- this validation receipt

No integration ledger, application configuration, recovery implementation, production database, remote database, customer data, account, credential, or outreach system was changed.

## Repair disposition

| Finding | Repair | PostgreSQL 16 evidence |
|---|---|---|
| P1: setting the three tenant columns `NOT NULL` could bypass T-028 receipt validation | Replay is recognized only when the complete named G-002 catalog already exists. Every other non-empty upgrade requires exactly one completed PostgreSQL T-028 receipt with zero orphans whose three counts and checksums match, and every target row must match the receipt tenant/workspace. | Missing/unreconciled scope, manually forced `NOT NULL`, and receipt-scope tampering all fail and roll back without G-002 residue. A matching receipt succeeds, preserves payload/counts, and complete-catalog replay succeeds. |
| P1: crawl-run tenant/workspace/market could change while a run had no units | The run-scope trigger now rejects any change to tenant, workspace, or market, independent of child-unit count. | Tenant, workspace, and market mutations against an empty run each fail with `G002_CRAWL_RUN_SCOPE_IMMUTABLE`; a populated run remains immutable too. |
| P1: location interpretation depended on identifier/ZIP-existence heuristics | Null-mode upgrade classification uses persisted active cell type, exact market, and postal token relationships. Runtime behavior follows the explicitly persisted mode. An explicit `generalized` row requires no cell, but its free compatibility token may also exist in global `zip_codes`; only `legacy_zip` establishes ZIP/cell/token authority. | A null-mode row with no cell and a known ZIP token fails closed, as does a ZIP-cell/token mismatch. Runtime rejects invalid ZIP/non-ZIP cell combinations and accepts explicit `generalized` with token `80202` already present in `zip_codes` and no cell. |
| P2: migration harness inventory was stale and could omit G-002 | Both PostgreSQL harnesses discover the exact sorted migration directory at runtime, assert 42 discovered migrations, apply 40, and skip only the two cron migrations already represented by portable worker/scheduler shims. | The G-002 rehearsal completed the full 42/40/2 chain and passed 2/2 tests. T029 also reached 42/40/2 before the separate recovery-key blocker below. |

## Ownership result

`zip_codes`, `location_markets`, and `location_cells` remain platform reference data and receive no `tenant_id`. The migration makes `user_market_access`, `crawl_runs`, and `crawl_units` tenant-owned and requires non-null `tenant_id` after a fail-closed transition. Workspace scope remains optional, but every non-null workspace must belong to the same tenant.

Market grants use a null-safe tenant/workspace/user/market identity, so the same Auth identity and platform market can be granted independently in different tenants. Existing and new grants require an active membership in the grant tenant and compatible workspace. The grant creator, when present, is held to the same active-membership boundary.

Each crawl unit is database-bound to its parent run through `(tenant_id, crawl_run_id)`. A hardened trigger copies the parent's tenant/workspace, rejects caller-supplied scope conflicts, requires an exact run market, and rejects invalid cell relationships. A run's tenant/workspace/market scope is immutable from creation onward, including while it has zero units.

## Compatibility and explicit location modes

T-028 remains the only authority for choosing legacy tenant/workspace ownership. A non-empty upgrade fails before mutation unless either the entire G-002 catalog is already present for replay or an exact completed T-028 receipt matches current rows. There is no inferred tenant and no automatic legacy owner selection.

`crawl_units.location_mode` is authoritative after it is persisted:

| mode | required relationship |
|---|---|
| `legacy_zip` | active `zip` cell in the exact market, cell postal token equal to the unit token, and matching global `zip_codes.zip` row |
| `platform_cell` | active non-`zip` cell in the exact platform market |
| `generalized` | no `location_cell_id`; the free compatibility token may or may not equal a global ZIP token |

For legacy rows whose mode is null, classification stays fail closed. A known ZIP token without its exact persisted ZIP-cell relationship is ambiguous and aborts the migration; a token is inferred as generalized only when it has no cell and no matching global ZIP reference. New inserts default to `legacy_zip` for compatibility, while generalized callers must state `generalized` explicitly. Tenant authority is never derived from a ZIP, market, cell, label, or token.

## Database enforcement and hardening

- Tenant-first indexes cover grant lookup, run queues, unit queues, market/status filtering, and retry-ready work.
- Compound foreign keys enforce run/unit tenant equality and cell/market equality.
- Trigger functions use `SET search_path = pg_catalog, public` and schema-qualified relations.
- Function execution is revoked from `PUBLIC`, `anon`, and `authenticated`.
- Direct table privileges on the three tenant-owned tables are revoked from `anon` and `authenticated`; later tenant RLS work must grant only required operations.
- The migration uses a bounded lock timeout and one transaction. Failed preflight or DDL rolls back without partial G-002 objects.
- The migration is forward-only. Recovery is snapshot restore or a corrective forward migration, not a down migration.

## Authoritative G-002 PostgreSQL 16 rehearsal

```text
container: g002-repair-r2-019fae23
container id: e9d80be5fda2f5cada7024410ad267d9fb94696d1fc7bde364ab98ab20378180
image: postgres:16-alpine
image digest: sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
database: g002_location_crawl_rehearsal_repair_r2_019fae23
host binding: 127.0.0.1:62091
data: synthetic tmpfs only (/var/lib/postgresql/data, 1 GiB, nosuid, nodev)
```

Command (connection credentials redacted):

```text
G002_RUN_DISPOSABLE_PG_TESTS=1
G002_DATABASE_URL=postgres://postgres:[redacted]@127.0.0.1:62091/g002_location_crawl_rehearsal_repair_r2_019fae23
npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
```

Result: exit 0; 1 file and 2 tests passed; dynamic scenario 6.877 seconds. The harness discovered 42 migrations, applied 40, and skipped only:

- `20260514161714_supabase_ai_verification_cron.sql`
- `20260514163203_scheduler_v2_sales_ready_pipeline.sql`

This run covers fresh install, complete-catalog replay, exact T-028 receipt binding, rollback/no-residue failures, hostile `search_path`, platform-reference ownership, grant membership isolation, empty/populated run immutability, unit tenant/workspace/market inheritance and conflicts, null and non-null parent workspace permutations, legacy ZIP validation, active non-ZIP platform cells, fail-closed null-mode classification, and authoritative explicit generalized mode.

An earlier pre-correction G-002 repair rehearsal also passed in `g002-repair-r1-019fae23` (container ID `85c8ced2b555e6a4c0f43c46840ed3eba73873deedfd421b98e72ce0033e85c1`, database `g002_location_crawl_rehearsal_repair_r1_019fae23`, port `57406`, same image digest). The repair-r2 run above is authoritative because it includes the final explicit-generalized regression.

## T029 recovery-parity status

T029 used disposable container `t029-repair-r1-019fae23` (ID `15cd2a8a941c3790b93bdff74b824b85848bfacd203ad368c40c76b086c7777a`), database `t029_tenant_foundation_rehearsal`, port `57066`, the same PostgreSQL 16 image digest, and the same synthetic tmpfs boundary.

```text
T029_RUN_DISPOSABLE_PG_TESTS=1
T029_DATABASE_URL=[redacted]
npm test -- --run src/lib/__tests__/data-transfer-contract.test.ts
```

Result: exit 1; 11 tests passed and 1 failed. The full migration replay itself reached the expected `discovered=42`, `applied=40`, `skipped=2`. Restore then stopped before its intended artifact-reference assertion because `scripts/data-transfer-contract.mjs` still declares `user_market_access` primary key `(user_id, market_id)`, while G-002 deliberately replaces that cross-tenant key with the tenant-inclusive null-safe unique identity. `scripts/import-supabase-data.mjs` rejects that target-key mismatch with:

```text
user_market_access: target primary key does not match the recovery contract
```

T029 is therefore **not passing**. Per the accepted sequencing disposition, recovery-contract parity is deferred to G-006/G-008 after G-002 through G-005. This repair does not weaken the tenant-inclusive database key and does not expand into the forbidden recovery implementation.

## Local command evidence

```text
npm ci
exit 0; 448 packages installed
note: npm reported 14 dependency audit findings (2 low, 1 moderate, 10 high, 1 critical); no automatic audit fix was run

npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts src/lib/__tests__/data-transfer-contract.test.ts
exit 0; 2 files passed; 12 tests passed; 2 opt-in tests skipped

npx eslint src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts src/lib/__tests__/data-transfer-contract.test.ts
exit 0

G002_RUN_DISPOSABLE_PG_TESTS=1 G002_DATABASE_URL=[redacted] npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
exit 0; 1 file and 2 tests passed

T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[redacted] npm test -- --run src/lib/__tests__/data-transfer-contract.test.ts
exit 1; migration replay reached 42/40/2, then restore hit the accepted deferred user_market_access key-contract blocker

npm run typecheck
exit 0

npm run lint
exit 0

npm test
exit 0; 124 files and 2,201 tests passed; 1 file and 9 opt-in tests skipped

npm run db:verify:recovery
exit 0; 37 application tables match the SQLite schema and tracked migrations

npm run build
exit 0; Next.js 16.2.6 production build completed

git diff --check
exit 0
```

## Cleanup and remaining boundary

The repair containers `g002-repair-r1-019fae23`, `g002-repair-r2-019fae23`, and `t029-repair-r1-019fae23` were stopped and auto-removed. Final exact checks across the owned names and ports returned 0 containers, 0 volumes, 0 networks, 0 listeners, and 0 matching test processes. Docker Desktop itself was left running; no unrelated container or Docker resource was stopped or removed.

The work is locally implemented and PostgreSQL-rehearsed only. No authenticated browser path, deployed environment, production data, or remote database was exercised. The T029 recovery-contract mismatch is the sole known deferred validation blocker and is not represented as a pass.
