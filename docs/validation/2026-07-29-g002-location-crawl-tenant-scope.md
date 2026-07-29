# G-002 Location and Crawl Tenant Scope Validation

Date: 2026-07-29
Baseline: `1c9647d76c35dbac991b07eb962de5a54135bce2`
Branch: `codex/nova-platform-tenancy`
Scope: synthetic local tests and one disposable stock PostgreSQL 16 database only
Status: implemented and locally rehearsed; no production or remote mutation performed

## Changed files

- `supabase/migrations/202607290001_add_location_crawl_tenant_scope.sql`
- `src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts`
- this validation receipt

No other tracked file, integration ledger, application configuration, production database, remote database, customer data, account, credential, or outreach system was changed.

## Ownership result

`zip_codes`, `location_markets`, and `location_cells` remain platform reference data and receive no `tenant_id`. The migration makes `user_market_access`, `crawl_runs`, and `crawl_units` tenant-owned and requires non-null `tenant_id` after a safe transition. Workspace scope remains optional, but every non-null workspace must belong to the same tenant.

Market grants use a null-safe tenant/workspace/user/market identity, so the same Auth identity and platform market can be granted independently in different tenants. Existing and new grants require an active membership in the grant tenant and compatible workspace. The grant creator, when present, is held to the same active-membership boundary.

Each crawl unit is database-bound to its parent run through `(tenant_id, crawl_run_id)`. A hardened trigger copies the parent's tenant/workspace, rejects caller-supplied scope conflicts, requires an exact run market, and rejects a location cell from another market. A run's tenant/workspace/market scope cannot change after it owns units.

## Compatibility and generalized locations

T-028 remains the only authority for choosing legacy tenant/workspace ownership. A non-empty upgrade with nullable G-002 tenant columns fails before mutation unless scope is complete and a completed PostgreSQL T-028 receipt with zero relationship orphans matches the current target-table counts and content checksums. Unreconciled rows produce `G002_UNRECONCILED_T028_SCOPE`; receipt absence or drift fails closed. There is no inferred tenant and no automatic legacy owner selection.

`crawl_units.location_mode` makes location interpretation explicit:

| mode | required reference |
|---|---|
| `legacy_zip` | an existing platform `zip_codes.zip` row |
| `platform_cell` | an existing cell in the unit's exact platform market |
| `generalized` | no ZIP-table row; international or other generalized tokens are valid |

Legacy rows are classified deterministically. New inserts default to `legacy_zip` for compatibility, while generalized callers must state `generalized` explicitly. Tenant authority is never derived from a ZIP, market, cell, label, or token.

## Database enforcement and hardening

- Tenant-first indexes cover grant lookup, run queues, unit queues, market/status filtering, and retry-ready work.
- Compound foreign keys enforce run/unit tenant equality and cell/market equality.
- Trigger functions use `SET search_path = pg_catalog, public` and schema-qualified relations.
- Function execution is revoked from `PUBLIC`, `anon`, and `authenticated`.
- Direct table privileges on the three tenant-owned tables are revoked from `anon` and `authenticated`; later tenant RLS work must grant only the required operations.
- The migration uses a bounded lock timeout and a single transaction. Failed preflight or DDL rolls back without partial G-002 objects.
- The migration is forward-only. Recovery is snapshot restore or a corrective forward migration, not a down migration.

## PostgreSQL 16 rehearsal

The focused test used only a uniquely named disposable resource:

```text
container: g002-platform-tenancy-019fae23-r4
image: postgres:16-alpine
database: g002_location_crawl_rehearsal_019fae23_r4
host binding: 127.0.0.1:51046
data: synthetic only
```

Command (connection credentials redacted):

```text
G002_RUN_DISPOSABLE_PG_TESTS=1
G002_DATABASE_URL=postgres://postgres:[redacted]@127.0.0.1:51046/g002_location_crawl_rehearsal_019fae23_r4
npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
```

Result: exit 0; 1 file and 2 tests passed. The dynamic test proved:

- fresh-install application and immediate idempotent replay;
- no tenant column on any platform location reference table;
- unreconciled pre-T-028 rejection with unchanged rows, nullable scope, and no partial `location_mode` residue;
- completed T-028 receipt acceptance with legacy payload preservation;
- inactive platform-market grant rejection before DDL;
- migration safety under a hostile `search_path` with same-named shadow tables left untouched;
- non-null target tenant scope, fixed function `search_path`, revoked function execution, and revoked direct table reads;
- same-market grants in separate tenants;
- inactive and cross-workspace membership rejection;
- crawl-unit tenant, workspace, market, and cell mismatch rejection;
- parent run scope immutability once a unit exists;
- explicit legacy ZIP reference enforcement; and
- a generalized international location token succeeding without a `zip_codes` row.

## Local command evidence

```text
npm ci
exit 0; 448 packages installed
note: npm reported 14 dependency audit findings (2 low, 1 moderate, 10 high, 1 critical); no automatic audit fix was run

npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
exit 0; 1 static test passed and the opt-in PostgreSQL test was skipped by default

G002_RUN_DISPOSABLE_PG_TESTS=1 G002_DATABASE_URL=[redacted] npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
exit 0; 2 tests passed

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

All four exact owned rehearsal containers (`g002-platform-tenancy-019fae23`, `g002-platform-tenancy-019fae23-r2`, `g002-platform-tenancy-019fae23-r3`, and the final `g002-platform-tenancy-019fae23-r4`) were stopped with Docker's `--rm` lifecycle. A follow-up prefix query returned no owned G-002 container. Docker Desktop itself was left running; no unrelated container or Docker resource was stopped or removed.

The work is locally implemented and PostgreSQL-rehearsed only. No authenticated browser path, deployed environment, production data, or remote database was exercised. Broader repository checks and the final scoped diff are reported in the task DoneClaim.
