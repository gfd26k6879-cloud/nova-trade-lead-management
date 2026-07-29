# G-003 Lead CRM Tenant Scope Validation

Baseline: `bf373a0822215d12e2a1f651142a4773b3f5a28b` on `codex/nova-discovery-decisioning`.

G-003 adds a transactional PostgreSQL-only hardening migration for `leads`,
`lead_notes`, `outreach_events`, `admin_requests`, and `demos`. A nonempty
upgrade accepts exactly one completed PostgreSQL T-028 receipt with zero
orphans and exact table counts/checksums/scope; manual scope assignment and a
manual `NOT NULL` bypass do not substitute for that receipt. Replays recognize
only the complete named catalog.

`leads.tenant_id` is required and immutable, while `leads` has no
`workspace_id`. The legacy global text key remains the primary key; `(tenant_id,
id)` and `(tenant_id, place_id)` provide tenant-safe parent and duplicate keys.
Each child has required immutable parent-derived `tenant_id`, nullable
same-tenant `workspace_id`, and a compound `(tenant_id, lead_id)` cascade FK.
The hardened trigger rejects parent/tenant/workspace transfer and foreign
actors. Preflight rejects orphaned or cross-tenant children and all failures
roll back transactionally.

The public database entry point is exact-slug only and returns a published,
unrevoked projection of `slug`, `template_id`, the bounded renderer config
keys, and the listed public lead business fields; it excludes tenant, lead,
internal config, and revocation data. Base-table access is revoked from
public runtime roles. Trigger functions use `pg_catalog, public` search-path
hardening and direct function access is revoked.

## Validation evidence

- The focused packet passed 13 tests with the three opt-in PostgreSQL cases
  skipped: `npx vitest run src/lib/__tests__/lead-crm-tenant-scope-postgres.test.ts src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts src/lib/__tests__/data-transfer-contract.test.ts`.
- G-003 passed 2/2 on disposable PostgreSQL 16 container
  `g003-root-final-r4-019fae23`, database
  `g003_lead_crm_rehearsal_root_final_r4`, using the locally pinned image
  `postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`.
  The database case exercised the 43 discovered / 41 applied / two named-skip
  fresh chain; a real nonempty T-028 to G-002 to G-003 upgrade; absent,
  mismatched, and duplicate receipts; receipt scope drift; transactional
  rollback for all four child orphan paths; hostile search-path objects;
  definition-aware replay; tenant/workspace/slug/actor isolation; and actual
  `SET ROLE anon` projection, base-table denial, malformed-config, revoked, and
  missing-slug behavior.
- The G-002 regression passed 2/2 in independent disposable container
  `g002-root-regression-r2-019fae23` against the updated 43/41/2 chain.
- T-029 replayed the same 43/41/2 chain in disposable container
  `t029-root-boundary-019fae23`, then stopped at the accepted recovery boundary:
  `user_market_access: target primary key does not match the recovery contract`.
  No G-006/G-008 recovery behavior or recovery expectation was weakened.
- `npm run typecheck`, focused ESLint, and `git diff --check` passed. All named
  disposable containers were removed after their runs. No deployed,
  authenticated, production, remote-database, or remote-repository path was
  exercised.
