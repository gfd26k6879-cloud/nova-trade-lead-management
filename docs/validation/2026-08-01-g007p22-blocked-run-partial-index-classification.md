# G-007P22 blocked-run partial-index classification

Date: 2026-08-01

Baseline: `bf718e615fb4df6b208136c4ebe14b9730ff6b35`

Branch: `codex/nova-multitenant-integration`

Status: retain/defer from source ownership; no migration or plan claim

Receipt commit: `2922e32d434ee9f23efb4148da791551a7c3d4ec`

## Exact scope and provenance

G-007P22 classifies only
`idx_crawl_runs_blocked_created(status, blocked_at DESC, created_at DESC)
WHERE status='blocked'`.

The index was added once in commit
`59f8bf0bf75abd2a34a7ea2d171ee81d54320988` by
`20260611010000_agile_discovery_blocked_retry.sql`. The same migration added
the blocked run state and nullable `blocked_reason`, `blocked_at`, and
`blocked_error_code` columns. Its current LF-byte SHA-256 is
`122ea735cbcbb2c70f766ea689364feb01f97f83af59bf58665d58689dd906c4`.
No later commit changes the migration file.

The historical DDL is an unqualified `CREATE INDEX IF NOT EXISTS`, without a
definition-aware catalog guard. Source therefore does not prove the installed
object's live definition, owner, health, or use. This packet makes no catalog
claim and does not start PostgreSQL.

## Current readers, writers, and nonowners

No current query filters blocked runs and orders or limits them by
`blocked_at`. Repository searches find no `ORDER BY blocked_at`.

Current behavior is primary-key scoped or uses created-time history:

- supplied run IDs resolve through `getCrawlRun(id)`;
- blocking and block-metadata clearing update one run by `id`;
- stop, resume, cancel, and retry actions operate on a selected run ID;
- the no-ID resume fallback selects only the newest paused run, not a blocked
  run;
- generic discovery history projects block metadata but orders by
  `created_at DESC` with a 1-50 limit;
- UI actions pass the selected run ID; and
- operational status counts and failure aggregates do not order by
  `blocked_at` and do not own this partial index.

The runtime PostgreSQL repair path adds missing block columns but does not
create this index. SQLite contains the nullable block columns but neither the
current schema nor frozen v1 defines this partial index. Fresh portable
PostgreSQL replay still executes the unchanged historical migration and creates
it.

## Durable authority boundary

G-013 broadly requires tenant-scoped crawl lifecycle and lease operations, but
does not define a blocked-run predicate, order, limit, tie-break, or
tenant/workspace/null-workspace visibility contract. G-020 defines fair
eligible-run dispatch; it does not approve blocked-time history and is not an
owner of this index.

`blocked_at` is nullable. PostgreSQL `DESC` uses `NULLS FIRST` by default, and
the index has no stable ID tie-break. G-007P22 must not infer “latest blocked”
semantics from the index definition.

Because there is no exact query owner, a live EXPLAIN or candidate would be
synthetic and could not authorize DDL. Because the index is part of accepted
historical fresh replay and source does not prove upgraded catalogs or unknown
compatibility readers, absence of a repository reader also does not prove safe
removal. Any removal requires a separately authorized forward-only,
definition-aware packet with live catalog, fresh/upgrade/final replay, exact
approved query ownership, rollback, and drift evidence.

## Tests, disposition, and cleanup

Root passed 67/67 current behavior tests under Node 24.13.1 and npm 11.8.0:

- `crawl-actions.test.ts`;
- `worker.integration.test.ts`;
- `coverage-client.test.tsx`; and
- `planner-queries.test.ts`.

These tests cover block creation, explicit-ID resume and metadata clearing,
blocked UI actions, and generic created-time history. They do not assert
blocked-time selection, index definition, natural plan use, or safe removal.

The disposition is RETAIN/DEFER: retain historical migration/upgrade
compatibility because no drop basis is proven; defer exact query, performance,
tenant-prefix, replacement, and removal decisions until G-013 defines a real
blocked-run selection/history contract. G-020 alone is not an owner.

No migration, test, dependency, or application source changes. Counts remain
54/52/2 and sequence `202607310010` stays free. Crosswalk arithmetic becomes 31
classified and 31 unclassified, with G-002 at 6/7. Market-created remains a
separate unopened family and no other card unlocks.

No database, container, port, process, temporary artifact, extra worktree, or
lock was created. Main and the handoff tag remain unchanged. No hosted,
provider, remote migration, production, deployment, push, pull request,
outreach, credential, or other external action occurred.
