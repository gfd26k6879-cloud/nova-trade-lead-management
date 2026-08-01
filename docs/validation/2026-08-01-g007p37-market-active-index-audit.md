# G-007P37 market/lifecycle/score index audit

Date: 2026-08-01

Source baseline: `fd46f2efebee3fc7b07e3be3868d24e7c3240f43`

Reservation commit: `3375bdc8c45dc1e38ca7a25ad1a6960228ec5513`

Status: accepted RETAIN; future tenant analogue deferred; documentation-only;
independent architecture/source and test/evidence reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_market_active(market_id, archived_at, score DESC)`. Exact current
Coverage, Explore, map, researcher Leads, market-bound business counts,
Quality, and Researcher Workbench families preserve complete results and
source order with the target installed, dropped, and restored. The target is a
natural plan owner only for Coverage's two correlated market-count forms on
the reviewed fixture; every other reviewed structure is target-neutral and
owned by existing siblings, predicates, or sorts.

Platform market IDs are global reference selectors, not tenant or workspace
authority. Current compatibility predicates use `user_market_access.user_id`
and can expose two fixture tenants sharing a granted market. This is recorded
truthfully and is not accepted as tenant isolation. Future tenant-prefixed
forms remain dependency-bound to exact G-009/G-010/G-011 callers.

No material current or durably approved tenant-query plan defect was proven.
P37 creates no candidate, migration, replacement, removal, repository guard,
source edit, test edit, or migration-sequence use. Its disposition is
`retain_healthy_historical_postgres_and_frozen_sqlite_market_lifecycle_score_global_compatibility_index_defer_future_tenant_form_no_DDL_or_removal`.

## Source, reachability, and catalog

- PostgreSQL origin:
  `supabase/migrations/20260602193000_international_markets_and_territories.sql:61`,
  origin commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d`, current file
  SHA-256 `af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.
- Frozen SQLite compatibility mirror: `src/lib/db/schema.ts:2092`, file
  SHA-256 `863e6471f944093551907619d0b427aec0d2a69d579a51bbe4d17d3900c174ff`.
- `market_id` is nullable text with no default or foreign key; `archived_at`
  is nullable text; `score` is non-null double precision with default zero.
- The target is a permanent ordinary nonunique, nonprimary, nonexclusion,
  nonconstraint `btree`: `text_ops` ASC/default NULLS LAST,
  `text_ops` ASC/default NULLS LAST, then `float8_ops` DESC/NULLS FIRST. It has
  three key/total attributes and no INCLUDE, predicate, or expression; it is
  valid, ready, and live. Installed/restored target-catalog SHA-256 is
  `4b34049cf26a1552bfe8a7338ca873b130c75707fbc3a6471fd1ac82791355c8`.
- Full public context contains 208 indexes and 357 constraints with one named
  target across all schemas and no target-owned constraint. V6 initial/final
  context is byte-semantically identical at
  `ed15c305544c5487b377fae7af002744382409d834f4258c6c28db164a2f9fa6`.

Exact SQL fidelity includes forced-unassigned predicates for all Explore and
map callers, AI/quality-aware website-need rank orders, researcher Leads
assigned-self plus market visibility, separate Explore and Leads researcher
business counts, the active/nonexcluded no-market Quality business-count
control, complete Quality projections and correlated artifact subqueries, and
full Workbench ranked projections with five correlated subplans. The sole
PostgreSQL adaptation replaces SQLite `julianday` freshness arithmetic with
equivalent elapsed epoch days; source bind and limit order remains exact.

CSV has no market binder. Admin Kanban has no live market binder and researcher
Kanban redirects. Uncited helper capabilities and future tenant forms remain
controls.

## PostgreSQL workload evidence

The accepted v5 runner was mode 0600, 56,107 bytes, SHA-256
`9b2c3af628a6da95e227b8f9568996550ebf36be828d9a40385bff6aee18cdb7`.
Its mode-0600 790,123-byte artifact SHA-256 was
`845a834bab7c4e2c69330b2f630b4cd30c904799613e48bd586309d7354ca5d3`.
It replayed PostgreSQL 16.14 and the complete 54-discovered/52-applied/two-
runtime-only-skipped chain.

The fixture contained 240,000 physically interleaved leads, 120,000 per
tenant, with 239,999 tenant transitions. It covered shared/selective/common/
absent/NULL/empty/orphan/case-variant markets, active/archived/empty archive,
raw exclusions, assignments, grants, coordinates, geography mismatches,
quality states, unique boundaries, and complete score-tie cohorts. The shared
market contained 108,000 rows across both tenants; an ungranted common market
contained 48,000 rows and returned zero through the compatibility grant.

Thirty-eight exact cases covered two Coverage summaries; eleven Explore,
researcher Leads, and admin-control forms; eight map forms; four business-count
forms; ten Quality forms; and three Workbench forms. All complete canonical
results and source-order digests match installed/drop/restored. All normalized
installed/restored plan structures match. The target appears only in the two
Coverage plans installed/restored and never after drop.

Coverage all-markets raw execution telemetry was 113.006/1132.709/91.172 ms
installed/drop/restored; run-scoped was 114.543/1116.189/96.800 ms. These raw
measurements are noncausal. The structural evidence, not latency alone,
supports RETAIN and does not authorize new DDL.

## Definition-aware catalog supplement

The accepted v6 runner was mode 0600, 60,013 bytes, SHA-256
`f82420ffe32f72a2e9118d96c1bd53ae4439e96870d30889f13b6f35aacee8a5`.
Its mode-0600 53,176-byte artifact SHA-256 was
`a512094c69a6e2354779b293d5949b1cf1f2eb38153c4226e413e793c364a2d8`.
It used a separate fresh PostgreSQL 16.14 54/52/2 replay and did not rerun or
alter the immutable v5 workload.

The supplement inventories all same-name `pg_class` relations and every
`public.leads` index before semantic filtering. Missing-target and healthy-
target alternate-name semantic duplicates, a public same-name non-index
relation, and a wrong-schema same-name index all reject before guard DDL or
workload with unchanged context hashes and healthy rollback. Healthy exact is
a no-op; truly missing creates the exact canonical target; historical
name-only `IF NOT EXISTS` truthfully creates a redundant named index alongside
an alternate duplicate; transactional install rollback restores the exact
missing context before the final healthy restoration.

Together with v5, the matrix covers wrong direction, reversed/partial keys,
expression, INCLUDE, unique, access method, table, predicate, explicit
opclass, nondefault collation, constraint ownership, wrong schema, invalid/
not-ready/not-live flags, near siblings, semantic duplicates, same-name
relations, healthy/missing replay, historical spoof behavior, and rollback.

## Rejected and corrected evidence

- V1 runner `22186425657e22958ba750abeeb6966526447d6c7b245b56a2364d253d244098`
  and artifact `2b6f52345402aa796ddb1a4670fc2d4916b8c38acc4e3e9b4c6ee6408a2b5fd9`
  were rejected for abbreviated Workbench projection/subqueries; the runner
  was also mode 0644.
- V2 runner `888d73e1d030ad215820785b241cfabe56e4b0edebabc56e26f936641e8983d6`
  and artifact `b91b47f7e6e7a72e600957d7e06b5431fb69ff1623b404e6765482cb7cebc3cc`
  were rejected for missing forced-unassigned, real rank, map-count, business-
  count, and definition-aware catalog evidence.
- V3 runner `9e0c65e2af846d3270913eb10e713883c8960e880f898307ad070f453d474b50`
  was rejected before an artifact or workload handoff for those broader
  source-fidelity gaps.
- V4 runner `f3627406ff4b77fa9ca500c5c9f0bfb507a267fa783d97a633dad6f553bea224`
  was interrupted before an artifact by an erroneous root assertion that an
  empty Quality filter produced no WHERE. Source reconciliation proved the
  default active/nonexcluded WHERE; v5 reran it correctly on a fresh service.
- Earlier producer resets corrected ESM resolution, missing fixture references
  and tenant values, an invalid DESC unique-constraint drift attempt, tie and
  authority controls, and asymmetric post-restore ANALYZE fingerprints.
- One root PostgreSQL gate used a database name without the required G-002
  prefix and was rejected before database access; the correctly prefixed fresh
  rerun passed. One independent v6 jq assertion had a read-only syntax error
  and was rerun successfully.

Rejected evidence is never represented as acceptance evidence.

## Separate semantic finding

Coverage names its correlated market count `activeLeads`, but the exact SQL
counts every market row without archive or exclusion predicates. The fixture
reported 108,000 while the canonical active/nonexcluded count was 74,882, an
inflation of 33,118. This P2 semantic issue is index-neutral and cannot become
P37 plan evidence. It requires a separately serialized source/product-contract
decision before any repair.

## Root validation and cleanup

Under Node 24.13.1 and npm 11.8.0, root passed:

- exact focused acceptance suite: 122/122 across 13 files; an earlier broader
  caller suite passed 112/112 across 15 files;
- TypeScript and focused ESLint;
- recovery verification over 37 tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native tests skipped;
- production build: 11/11 pages; and
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A/G-007P20A 2/2, G-005 1/1,
  and T-029 19/19 gates.

No Windows-only G006 durability evidence was run or replaced. Independent
architecture/source and test/evidence reviewers accept combined v5+v6 with no
remaining P0/P1/P2 evidence blocker; the producer did not self-accept.

All P37 containers, databases, volumes, listeners, node/test processes,
runners, and artifacts were removed after hash verification. Final checks
found no task-owned disposable resource or extra worktree.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 47/15, G-003 becomes 24/15, and G-002 remains 13/0. The
strict original plan remains 58/318 accepted with 260 original cards remaining;
parent G-007 remains open.

The exact next residual is
`idx_leads_numeric_filters(review_count, rating, score DESC)` for a separate
P38 read-only audit. P37's durable-document reservation remains held until a
lineage-only commit records the acceptance hash and releases it. No push or
external action occurs.
