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

Validation results: `npx vitest run src/lib/__tests__/lead-crm-tenant-scope-postgres.test.ts src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts src/lib/__tests__/data-transfer-contract.test.ts` passed 13 tests with three opt-in PostgreSQL cases skipped. `G003_RUN_DISPOSABLE_PG_TESTS=1` on a disposable loopback PostgreSQL 16 container passed 2/2 fresh-install, hostile-search-path, cross-tenant, immutability, exact-slug projection/revocation, and idempotent-replay cases. `G002_RUN_DISPOSABLE_PG_TESTS=1` passed 2/2 and exercised its existing T-028 upgrade/rollback/orphan gate with the updated chain. `npm run typecheck`, focused ESLint, and `git diff --check` passed.
The migration inventory is 43 discovered, 41 applied, and two named portable
runtime skips. T-029 changes only its inventory/log assertions and remains
blocked at the accepted G-006/G-008 recovery boundary; no recovery contract
semantics changed.
