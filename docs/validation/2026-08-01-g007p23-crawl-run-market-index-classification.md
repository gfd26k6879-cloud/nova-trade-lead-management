# G-007P23 crawl-run market index classification

Date: 2026-08-01

Baseline: `21802ce400d8075519079033e2d939a6e2ca16e3`

Branch: `codex/nova-multitenant-integration`

Status: retain/defer structural FK support and compatibility; no live-use claim

Receipt commit: pending

## Exact scope and provenance

G-007P23 classifies only
`idx_crawl_runs_market_created(market_id, created_at DESC)`.

PostgreSQL creates this ordinary nonunique btree in
`20260603110615_discovery_items.sql`. The migration and the equivalent SQLite
`SCHEMA_SQL` definition originated in commit
`fe07602ccfb47f529c8aeb62e249217c8fb1828d`. The migration has no later source
change and its current LF-byte SHA-256 is
`77f12d768de33e3ac3356c77fef848eeed80dcd3305cb3e54dc908dbc213af5c`.

The PostgreSQL DDL uses `CREATE INDEX IF NOT EXISTS` without a definition-aware
catalog guard. Source therefore does not prove a live object's definition,
owner, health, use, or performance. G-007P23 does not start PostgreSQL and makes
no live catalog or plan claim.

## Structural FK support versus query ownership

Accepted G-002 adds
`crawl_runs_market_id_fkey FOREIGN KEY (market_id) REFERENCES
location_markets(id) ON UPDATE RESTRICT ON DELETE RESTRICT`. The target index's
leftmost key exactly matches the nullable child column, so it is structurally
suitable for equality lookup of referencing crawl-run rows during parent
update/delete checks. Its trailing created time does not defeat left-prefix
suitability.

This is a scope-neutral child-side FK-maintenance support candidate. The index
is separately created, not owned or required by `pg_constraint`. No source-only
evidence proves PostgreSQL selected it, a measured RI workload needs it, or the
live object is healthy. Parent-side referenced uniqueness is separately
provided by the `location_markets(id)` primary key.

No current query filters crawl runs by market and orders them by created time.
Current code writes an optional market on create, selects runs by primary key or
global status/created-time visibility, and only projects `market_id` to join a
platform market label. Promotion propagates market metadata from a selected run
by ID. No test names this index, explains it, or exercises parent market
update/delete RI performance.

## Tenant authority and compatibility boundaries

`location_markets` is shared platform reference data. `crawl_runs` is
tenant-owned with optional workspace scope. A market row, ID, or label grants
no tenant authority, and a market-leading index cannot make a run-history query
tenant-safe.

G-010 must preserve platform-reference reads while preventing cross-tenant
operational enumeration. G-013 broadly owns future tenant-scoped crawl
lifecycle operations. Neither card fixes an exact tenant/workspace/null-
workspace market-history predicate, null-market behavior, limit, pagination,
or stable created-time tie-break. A market-only synthetic EXPLAIN would invent
an unsafe/incomplete contract.

SQLite independently defines the same key order in `SCHEMA_SQL`; startup
reapplies it, and the frozen v1 derivation does not replace the name. PostgreSQL
fresh replay creates the historical index, while the opt-in runtime repair path
does not recreate it. These are compatibility and structural source facts, not
cross-engine acceptance or measured-use evidence. Source proves neither safe
removal nor a tenant-prefixed replacement basis.

## Disposition and cleanup

The disposition is RETAIN/DEFER: retain the scope-neutral structural FK support
candidate and historical PostgreSQL/SQLite compatibility; defer live use,
health, performance, tenant-history, tenant-prefix, replacement, and removal
claims. Re-audit only after either a measured parent-market RI workload or an
exact authorized G-010/G-013 tenant-scoped market/run-history contract exists.

No migration, source, test, dependency, package, SQLite, or application file
changes. Counts remain 54/52/2 and sequence `202607310010` stays free. The
crosswalk becomes 32 classified and 30 unclassified, with G-002 at 7/6. No
later card unlocks and the next residual family remains separately unopened.

No test, database, container, listener, process, temporary artifact, extra
worktree, or lock was created. Main and the handoff tag remain unchanged. No
hosted, provider, remote migration, production, deployment, push, pull request,
outreach, credential, or other external action occurred.
