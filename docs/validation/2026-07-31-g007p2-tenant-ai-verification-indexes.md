# G-007P2 tenant-prefixed AI verification indexes

Date: 2026-07-31

## Scope and finding

This is the second bounded Postgres-only child of G-007. It does not change
SQLite, application queries, RLS policy, grants, hosted Supabase, or any remote
database.

The read-only PostgreSQL 16 catalog audit found 79 indexes on tenant-owned
G-002 through G-005 tables whose first key was not `tenant_id`, including
primary keys and deliberate public identifiers. G-007P2 was split to the
`ai_lead_verifications` table only. Real `EXPLAIN (COSTS OFF)` probes with
sequential scans disabled showed tenant-filtered status and requester reads
using the inherited global indexes and applying `tenant_id` as a filter. The
tenant-plus-lead read already used the accepted G-004A tenant-prefixed index.

Migration `202607310002_tenant_prefix_ai_verification_indexes.sql` therefore:

- retains `idx_ai_verifications_tenant_lead_created`;
- removes the redundant global lead index;
- replaces the global status and requester indexes with exact tenant-prefixed
  equivalents; and
- returns on an exact final catalog while rejecting every partial or spoofed
  catalog with `G007P2_INDEX_CATALOG_DRIFT` before DDL.

## PostgreSQL 16 evidence

Fedora, Node 24.13.1, npm 11.8.0, and local disposable PostgreSQL 16:

- G-007P2 plus the complete G-004A hostile-path matrix: 1/1 passed in 80.58
  seconds. It covered exact replay, final catalog shape, tenant query plans,
  partial baseline rejection, spoofed final-name rejection, rollback, tenant
  isolation, lifecycle, and writer serialization.
- G-002: 2/2 passed in 14.42 seconds.
- G-003: 2/2 passed in 46.72 seconds.
- G-005: 1/1 passed in 62.65 seconds.
- T-029: 19/19 passed in 8.40 seconds; 47 migrations were discovered, 45
  applied, and the same 2 Supabase-runtime-only migrations were skipped.
- The corrected status plan used
  `idx_g007p_ai_verifications_tenant_status_created` with both `tenant_id` and
  `status` in `Index Cond`.
- The corrected requester plan used
  `idx_g007p_ai_verifications_tenant_requester_created` with both `tenant_id`
  and `requested_by_user_id` in `Index Cond`.

The first combined upstream invocation omitted the required unique database
URLs for G-002/G-003 and reused the deliberately mutated audit database for
T-029. Those environment-invalid runs were not counted. Each was rerun on its
own fresh loopback PostgreSQL 16 database and passed as recorded above.

## Fedora and application gates

- TypeScript: passed.
- Focused ESLint over all changed TypeScript tests: passed with zero warnings.
- Recovery verifier: 37 application tables passed.
- Portable SQLite coordinator: 12 passed and 26 Windows-native cases skipped;
  no Windows acceptance claim was rerun or replaced.
- Next.js 16.2.6 production build: passed, 11/11 static pages generated.
- `git diff --check`: passed.
- Disposable containers remaining after cleanup: zero.

## Disposition

G-007P2 is accepted as a child milestone. Parent G-007 remains open. The next
step is a new read-only G-007P3 audit/split over the remaining global indexes;
the likely next family must still be proven by real tenant-filtered plan
evidence before any migration is opened. The SQLite portion remains behind the
paused G-006 finalized-binding lane, and G-006C2B remains unopened.

No push, pull request, deployment, hosted Supabase access, remote migration,
production access, provider call, credential change, or other external mutation
occurred.
