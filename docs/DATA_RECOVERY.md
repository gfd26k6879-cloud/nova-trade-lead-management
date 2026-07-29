# Data recovery contract

This runbook covers the application-owned SQLite/PostgreSQL data contract. The
current manifest schema is version **3** and the versioned tenant-integrity
contract is **1**. The contract contains exactly **37 tables** in this restore
order:

```text
zip_codes, location_markets, location_cells,
tenants, workspaces, tenant_memberships, tenant_role_bindings, tenant_policies,
support_access_grants, support_access_grant_permissions,
support_access_grant_data_classes,
tenant_export_jobs, tenant_deletion_jobs, tenant_deletion_checkpoints,
tenant_deletion_checkpoint_events, tenant_deletion_tombstones,
compatibility_backfill_receipts,
settings, app_users, user_market_access, crawl_runs, crawl_units, leads,
lead_notes, outreach_events, admin_requests, demos, place_cache, places_master,
place_observations, api_usage_events, ai_lead_verifications, ai_usage_events,
lead_ai_artifacts, ai_feedback_events, worker_runs, audit_logs
```

The first three tables are the legacy reference roots. The next fourteen are
the tenant foundation and operations tables accepted by T-023, T-024, and
T-028. The remaining 20 are the original legacy/operations tables. The order
is part of the manifest and is checked exactly; it is not an operator hint.

`compatibility_backfill_receipts` is a T-028 dynamically prepared SQLite
table. It is not required to be present in static `SCHEMA_SQL` before the
preparation function runs. Export and recovery verification fail clearly when
the preparation is absent. SQLite receipts use the exact pair
`sourceEngine=sqlite` and
`checksumAlgorithm=novatrade-sqlite-canonical-json-v1`. A PostgreSQL receipt
created by the operator uses `sourceEngine=postgres` and
`checksumAlgorithm=novatrade-postgres-jsonb-text-v1`; generic `sha256` labels
are not accepted as the binding.

## Export and exclusions

Run against a stopped or quiesced SQLite writer:

```bash
npm run db:export:sqlite -- --db nosite-leads.db --out data-export
npm run db:verify:recovery -- --db nosite-leads.db --dir data-export
npm run db:import:supabase -- --dir data-export --dry-run
```

The manifest records the exact columns, primary keys, row counts, file bytes,
SHA-256 checksums, exclusions, and sanitizations. Encrypted settings columns
are never exported:

```text
settings.openai_api_key_encrypted
settings.google_places_api_key_encrypted
settings.google_maps_browser_api_key_encrypted
```

`MIGRATE_ENCRYPTED_KEYS=1` remains rejected. Raw tokens, credentials, API
keys, refresh/access tokens, passwords, and secret-bearing fields are excluded
or rejected. Legacy `place_cache.raw_json` and
`place_observations.raw_json` recursively remove Google `reviews`, review text,
and reviewer attribution while preserving safe artifact metadata and derived
review-insight metadata. The manifest records both sanitizations. Storage
objects themselves are **not restored or verified by this contract**;
`artifact_storage_ref`, checksum, and related export metadata are retained only
as database metadata. Supabase Storage, Vault, environment variables, and Auth
credentials/users are outside this archive.

Offline validation is fail-closed for missing or unexpected tables/columns,
empty or duplicate keys, row/file/checksum mismatch, protected fields,
missing tenant/workspace/policy/membership/grant/job/checkpoint parents,
cross-tenant composite relationships, unmapped tenant/workspace IDs on scoped
legacy rows, malformed receipt scope/policy/engine/checksum bindings, and
immutable job/checkpoint/event/tombstone fact violations. Errors name the
table and rule without printing row contents.

## Operator prerequisites

1. Reconcile and apply the target migrations separately. The import never runs
   migration SQL, changes migration history, repairs schema drift, or changes
   scheduler configuration.
2. Restore Auth users/identities first, preserving UUIDs. Credentials remain
   excluded. Validation covers every configured Auth reference, including
   `user_market_access.user_id`, `user_market_access.created_by_user_id`, and
   `crawl_runs.created_by_user_id`, plus tenant foundation identity fields.
3. Prepare the SQLite source with T-028 before export. Keep the archive
   encrypted at rest and access-controlled.
4. Ordinary imports are only for archives with no historical/stateful rows.
   Archives containing non-requested export states, any deletion job or
   checkpoint rows, events, tombstones, receipts, or non-pending support grant
   children require the explicit `--restore-historical` flag.
5. The target must be freshly migrated and empty for a recovery run. The
   contract intentionally does not support idempotent re-upsert of historical
   state; rerun recovery by recreating the target from its migration baseline.
   Pre-existing portable reference rows in `location_markets` and
   `location_cells` are preserved only when their archive keys and checksums
   match.

Nonempty rows in any migration-009 `FORCE ROW LEVEL SECURITY` table require an
effective `BYPASSRLS` role or superuser; table ownership alone is insufficient.
Historical restore trigger bypass additionally requires a privileged table-owner
transaction (or superuser). The operator must use the Supabase transaction
pooler or an explicitly approved local disposable database, never a production
or remote database for rehearsal.

## Atomic historical restore

The importer inserts all 37 tables in the manifest order inside one transaction.
For historical rows it disables only these exact user guard triggers, after
catalog preflight confirms they are enabled:

```text
support_access_grants.trg_novatrade_support_access_grants_validate
support_access_grant_permissions.trg_novatrade_support_access_grant_permissions_guard
support_access_grant_data_classes.trg_novatrade_support_access_grant_data_classes_guard
tenant_export_jobs.trg_novatrade_tenant_export_jobs_guard_and_touch
tenant_deletion_jobs.trg_novatrade_tenant_deletion_jobs_insert_guard
tenant_deletion_jobs.trg_novatrade_tenant_deletion_jobs_guard_and_touch
tenant_deletion_checkpoints.trg_novatrade_tenant_deletion_checkpoints_insert_guard
tenant_deletion_checkpoints.trg_novatrade_tenant_deletion_checkpoints_guard
tenant_deletion_checkpoint_events.trg_novatrade_tenant_deletion_checkpoint_events_insert_guard
tenant_deletion_tombstones.trg_novatrade_tenant_deletion_tombstones_insert_guard
compatibility_backfill_receipts.trg_novatrade_compatibility_backfill_receipt_guard
```

Constraint triggers, foreign keys, checks, RLS, and internal triggers remain
enabled. After all rows are inserted, the importer verifies row counts,
checksums, tenant integrity, and immutable fact bindings, then runs
`SET CONSTRAINTS ALL IMMEDIATE` while constraint triggers remain enabled. Only
after deferred FK events have fired does it re-enable the exact user guards and
catalog-verify every trigger. Identity values for
`tenant_deletion_checkpoint_events` use `OVERRIDING SYSTEM VALUE`; a
transactional identity restart is the final mutation before commit and is
verified with `last_value=max(restored_id)+1`, `is_called=false`, and a
subsequent generated insert whose ID is greater than the restored maximum.

On success, trigger state is checked again after commit. On any failure,
PostgreSQL rollback restores rows, trigger state, and identity restart; cleanup
verification runs only after rollback so an aborted transaction cannot mask the
original error. The rehearsal proves that a malformed artifact fails after
earlier foundation/support work has been attempted, leaves zero archive rows,
the original sequence state, and all exact triggers enabled. A successful
restore is then run against the fresh target.

## Validation and rollback

Before commit, validation rejects Auth prerequisite failures, protected fields,
unexpected/missing columns, tenant integrity violations, JSON/JSONB binding
errors, and row-count/checksum differences. JSONB values are parsed and
canonicalized recursively, so object-key ordering does not create a false
mismatch. SQLite 0/1 values are converted to booleans only when the target
column is PostgreSQL `boolean`; other values fail closed.

A failed import is transactionally rolled back. Do not retry against a partially
mutated target; recreate the freshly migrated target and resolve the reported
contract or schema error. A successful import has no automatic inverse because
existing target rows may have been changed; use the pre-import database
snapshot/PITR backup for rollback. Code rollback and data rollback are separate
operations.

## Portable PostgreSQL16 rehearsal

The opt-in test creates only a temporary SQLite fixture and the exact local
database `t029_tenant_foundation_rehearsal` in a stock PostgreSQL16 container.
It applies the accepted portable T-027 baseline in lexicographic order:

```text
applied: 39 migrations
skipped: 2
20260514161714_supabase_ai_verification_cron.sql  (pg_net/pg_cron/Vault runtime)
20260514163203_scheduler_v2_sales_ready_pipeline.sql (pg_net/pg_cron/Vault runtime)
```

The fixture-only baseline supplies the minimal `worker_runs` shape required by
the downstream stale-cleanup index and the five scheduler/feedback columns
normally added by the skipped runtime migration. This is portability
scaffolding, not an application schema workaround. `pgcrypto`, `pg_net`, and
`pg_cron` remain absent. The rehearsal uses two tenants, an approved grant
whose historical approver binding is later revoked, a completed deletion job
retaining its tombstone, earlier and latest checkpoint events, the T-028
receipt, exact checksums/counts, policy booleans, JSONB object types, sequence
proof, trigger cleanup, and negative rollback. It never uses `nosite-leads.db`,
customer data, Supabase, a remote database, or external writes.

Before final validation, reread
`supabase/migrations/202607270010_add_compatibility_tenant_backfill.sql` so the
receipt shape and composite tenant-policy binding are taken from the current
migration rather than a frozen older shape.

## Migration-history note

The July 2026 audit found remote-only migration version `20260610045957`
(`researcher_ai_quality_feedback`) absent from this repository.
`202607120001_reconcile_researcher_ai_feedback_schema.sql` is a forward-only,
idempotent reconciliation for fresh tracked environments; it does not rewrite
or mark the missing historical version. Before any linked migration operation,
verify live state with `supabase migration list --linked` and `supabase db pull`.
