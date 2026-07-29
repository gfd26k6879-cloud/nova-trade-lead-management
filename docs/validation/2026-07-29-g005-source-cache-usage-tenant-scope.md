# G-005 source cache, observation, and usage tenant scope

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Baseline: `88ac0314a0cebfa1f7cec131a27c14a0e7c65da0`

Accepted dependency integration: `634ffe99ea9d35877429e57b38301138f18b6c2c`

## Result

G-005 is implemented locally as the structural tenant/source boundary for
`place_cache`, `places_master`, `place_observations`, and
`api_usage_events`. These records are tenant-wide and do not gain a
`workspace_id`. The only source identity introduced is the exact
`google_places_legacy` card ID. It is explicitly documented as identity only;
this change does not invent or activate connector authorization, licensing,
policy versions, credentials, or live provider use.

The migration replaces global place/cache identity with
`(tenant_id, source_card_id, place_id)` and replaces global observation/usage
IDs with tenant/source IDs. All replacement search indexes begin with
`tenant_id, source_card_id`; the old global place, observation, and usage
indexes are removed. Raw cache rows and raw observations can therefore use the
same provider place ID in two tenants without sharing identity or payloads.

## Enforcement

- `tenant_id` and `source_card_id` are required on all four tables. Four exact
  source checks allow only `google_places_legacy`.
- Observation scope is derived from and checked against every supplied
  crawl-run, crawl-unit, lead, and place parent. Unit/run pairing, lead/place
  pairing, tenant agreement, and the tenant/source/place master are enforced.
- Usage scope is derived from and checked against every supplied run, unit, and
  lead parent. New parentless runtime writes fail closed with
  `G005_USAGE_RUNTIME_PARENT_REQUIRED`; the T-028 historical parentless row can
  remain until G-020/G-021/G-022 propagate runtime correlation.
- A recursive JSON validator rejects case- and separator-varied review bodies,
  reviewer/author attribution, and credential/secret keys at any object/array
  depth on cache, master JSON projections, observations, and usage metadata.
  It runs on both insert and update.
- Seven tenant-aware parent FKs use PostgreSQL 16 column-list `SET NULL` where
  optional references are cleared, preserving required tenant scope.
- RLS remains enabled with no policies. Table and helper-function access is
  revoked from `PUBLIC`, `anon`, and `authenticated`; helpers have the exact
  target-table owner and `search_path=pg_catalog, public`.

## Activation and replay safety

The migration takes one advisory lock plus deterministic
`SHARE ROW EXCLUSIVE` locks on the receipt, tenant, parent, and target tables.
Nonempty upgrades require exactly one completed PostgreSQL T-028 receipt whose
four target counts and post-backfill checksums exactly match and whose tenant
matches every target row. Existing parent/orphan disagreement aborts before
catalog mutation.

Replay is definition-aware: it verifies the exact columns/defaults/checks,
compound primary keys, all 11 target FKs, the crawl-unit compound identity,
all 12 non-primary index definitions, four trigger definitions, both function
signatures/properties/owners/comments/body hashes, RLS, policies, and ACLs.
Partial/manual objects, definition drift, extra global-first indexes, or a
spoofed familiar name fail with `G005_PARTIAL_OR_SPOOFED_CATALOG`. Failed
preflight transactions leave no G-005 install residue.

## PostgreSQL 16 evidence

All database rehearsals used the pinned image:

`postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`

The committed G-005 harness discovered 45 migrations, applied 43, and skipped
only the two named `pg_net`/`pg_cron` scheduler migrations:

- `20260514161714_supabase_ai_verification_cron.sql`
- `20260514163203_scheduler_v2_sales_ready_pipeline.sql`

Validated cases include fresh install, exact T-028 nonempty upgrade, exact
replay, missing/tampered receipt rejection, checksum rebinding followed by
orphan rejection, partial catalog and function-definition spoof rejection,
two-tenant same-place isolation, parent derivation and cross-tenant mismatch,
new parentless usage denial, historical parentless usage preservation, nested
case-varied review/reviewer/credential denial on insert and update, hostile
`search_path`, exact catalog/owner/ACL/RLS checks, rollback, and two-client
writer-lock serialization.

## Commands and outcomes

- `G005_RUN_DISPOSABLE_PG_TESTS=1 npx vitest run src/lib/__tests__/source-cache-usage-tenant-scope-postgres.test.ts --reporter=verbose`
  - PASS: 1/1, final replay-hardened run 21.38 s.
- G-004A disposable PG16 regression with `G004A_RUN_DISPOSABLE_PG_TESTS=1`
  - PASS: 1/1, 66.81 s.
- G-002 named-loopback PG16 regression with its opt-in environment and URL
  - PASS: 2/2, 8.22 s.
- G-003 named-loopback PG16 regression with its opt-in environment and URL
  - PASS: 2/2, 37.05 s.
- `npm run typecheck`
  - PASS.
- `npm run lint`
  - PASS.
- Focused default Vitest run across the five touched harnesses
  - PASS: 13 passed; five explicit opt-in PostgreSQL tests skipped by default.
- `npm run build`
  - PASS: Next.js 16.2.6 production build, TypeScript, and 11 static pages.

One combined G-002/G-003 invocation was initially started without the required
named loopback database URLs; its static tests passed and both opt-in tests
reported their explicit missing-URL guard. G-002 and G-003 were then rerun with
correct disposable PG16 databases and passed as recorded above. No repository
change was made to work around that harness setup error.

## Frozen T-029 boundary

The opt-in T-029 rehearsal logged
`applied=43, skipped=2` and then stopped at the accepted blocker:

`user_market_access: target primary key does not match the recovery contract`

T-029 is therefore not passing. Its behavior and recovery definitions remain
unchanged except for the required 45/43/2 inventory log. G-006/G-008 still own
the recovery-contract reconciliation; G-005 does not weaken the accepted
tenant-inclusive database keys or patch around the blocker.

All runs were local and used synthetic fixtures. No provider call, credential,
remote database, production system, customer data, push, deployment, or
external mutation was used. Every task-owned disposable Docker container was
stopped and removed.
