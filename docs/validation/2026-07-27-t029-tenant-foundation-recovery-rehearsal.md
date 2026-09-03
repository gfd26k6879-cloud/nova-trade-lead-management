# T-029 tenant-foundation recovery rehearsal

Validation was run on 2026-07-28 in the shared worktree against a temporary
SQLite fixture and a stock `postgres:16` container only. No real
`nosite-leads.db`, customer data, Supabase project, remote database, Storage
object, Vault value, credential, or external write was used.

## Contract evidence

- Manifest schema: `3`; tenant-integrity contract: `1`.
- Restore order: exactly 37 application-owned tables, with the 14 foundation /
  operations tables inserted after the three legacy reference roots and before
  legacy scoped rows.
- T-028 SQLite preparation ran before export. The receipt bound
  `sqlite/novatrade-sqlite-canonical-json-v1`; the contract also recognizes the
  exact PostgreSQL pair
  `postgres/novatrade-postgres-jsonb-text-v1`.
- Protected encrypted settings columns were excluded. Google review arrays,
  review text, and reviewer attribution were recursively stripped. Storage
  objects were not restored or verified; only artifact metadata was retained.
- Auth reference coverage included `user_market_access.user_id`,
  `user_market_access.created_by_user_id`, and `crawl_runs.created_by_user_id`.
- Offline negative coverage exercised missing tenant, cross-tenant FK,
  protected column, count mismatch, checksum mismatch, malformed receipt
  binding, missing Auth prerequisite, malformed checkpoint-event facts, and
  historical restore fail-closed behavior.

## SQLite fixture

The fixture was created from `SCHEMA_SQL` with `foreign_keys=ON`, then T-028
receipt preparation was applied. It contained two tenants and workspaces,
memberships, policies, an approved support grant with child permission/data
class rows, an approver binding revoked after the historical approval time, a
historical export artifact, a completed deletion job retaining its tombstone,
ten checkpoints, and both an earlier `running` event and the latest `complete`
event for one checkpoint. The fixture used a narrowly scoped trigger drop only
while constructing those historical SQLite facts; `PRAGMA foreign_key_check`
was empty and all expected SQLite triggers were present again before export.

The artifact reference used the migration-required shape:
`tenants/<tenant UUID>/exports/<export job UUID>/package`.

## PostgreSQL16 baseline and restore

The exact disposable database name was
`t029_tenant_foundation_rehearsal`. The accepted portable baseline replayed all
migrations lexicographically except the two runtime-only files below:

```text
applied=39
skipped=2
20260514161714_supabase_ai_verification_cron.sql: pg_net/pg_cron/Vault runtime
20260514163203_scheduler_v2_sales_ready_pipeline.sql: pg_net/pg_cron/Vault runtime
```

The fixture-only `worker_runs` shape allowed the downstream stale-cleanup
index to be created. Role creation/reset was idempotent. `pgcrypto`, `pg_net`,
and `pg_cron` were asserted absent.

The disposable database then set a database-level hostile `search_path` to
`t029_shadow, public`. Shadow objects covered all 37 manifest tables plus the
identity sequence. Every shadow table count and the shadow sequence state were
compared before and after both the failed rollback attempt and the successful
restore; all remained unchanged. Public trigger catalog state and the public
identity-sequence postconditions were verified after restore.

The opt-in focused test passed **12/12**. It verified exact archive counts and
digests, tenant policy booleans (`true/false` and `false/true`), legacy JSONB
sanitization, receipt JSONB object types for all four receipt objects, the
approved historical grant, completed-job tombstone, event progression/latest
event binding, tenant integrity, and the identity sequence. Restoring identity
values for the `GENERATED ALWAYS` event key used `OVERRIDING SYSTEM VALUE`;
transactional sequence restart left `last_value=max_id+1` and `is_called=false`,
and the next generated event ID exceeded the restored maximum.

Historical restore disabled only the exact user guard triggers listed in
`docs/DATA_RECOVERY.md`. FKs, check constraints, RLS, and internal constraint
triggers stayed active. Before re-enabling guards, the importer ran
`SET CONSTRAINTS ALL IMMEDIATE`, which fired/validated deferred anchor-FK
events. It then re-enabled and catalog-verified every exact trigger before
commit and verified them again after commit.

The negative archive was attempted **first** against the fresh migrated target;
its export artifact reference was changed to `invalid-artifact-ref`. The
attempt progressed through earlier foundation/support inserts with the exact
historical trigger plan, then failed at
`tenant_export_jobs_artifact_ref_shape_chk`. Post-rollback assertions proved:

- zero archive rows remained;
- every target row count/digest matched the pre-attempt fresh-target snapshot;
- the event identity sequence (`last_value` and `is_called`) was unchanged;
- all exact support/export/deletion/checkpoint/event/tombstone/receipt triggers
  were enabled.

The good archive was then restored into that same still-clean target and passed
the full verification above. Ordinary import without `--restore-historical`
failed closed before opening the target connection. Recovery reruns require a
freshly migrated/empty target; historical idempotent upsert is not claimed.

## Commands and results

```text
npm test -- --run src/lib/__tests__/data-transfer-contract.test.ts
  PASS: 11 passed, 1 skipped (default mode)

T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=...
npm test -- --run src/lib/__tests__/data-transfer-contract.test.ts
  PASS: 12 passed, 0 skipped (portable PostgreSQL16 rehearsal)

npm run typecheck
  PASS

node scripts/verify-data-recovery.mjs
  PASS: 37 application tables match SQLite schema and tracked migrations
```

The final validation reread
`supabase/migrations/202607270010_add_compatibility_tenant_backfill.sql`
immediately before testing. The disposable `novatrade-t029-pg16` container and
temporary fixture were removed after the final rehearsal; no other container,
database, file, or user data was cleaned.
