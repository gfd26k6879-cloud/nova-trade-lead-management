# G-007P38 numeric-filter index audit

Date: 2026-08-01

Source baseline: `50004281bd3c2bd73bc5f0f660b3f535ddb1f6ea`

Reservation commit: `80b02ed9a17454d25e0ee55fac23d4e8efbfa721`

Status: accepted RETAIN; future tenant analogue deferred; documentation-only;
independent architecture/causality and test/evidence reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_numeric_filters(review_count, rating, score DESC)`. Exact current
Leads, Explore, map, CSV export, and admin-control numeric forms preserve
complete results, source order, and normalized plan structure through two
installed/drop/restored cycles. The target is a natural plan owner for seven
unscoped/global admin, Explore, map, and export controls. Five market- or
researcher-scoped numeric forms avoid it in every phase and keep identical
plans.

Review count, rating, and score never authorize tenant or workspace access.
No material current or durably approved tenant-query plan defect was proven.
P38 creates no candidate, migration, replacement, removal, repository guard,
source edit, test edit, or migration-sequence use. Its disposition is
`retain_healthy_historical_postgres_and_frozen_sqlite_numeric_filter_global_compatibility_index_defer_future_tenant_form_no_DDL_or_removal`.

## Source and catalog

- Current PostgreSQL definition:
  `supabase/migrations/202605110001_full_schema.sql:303`; introduced by commit
  `0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c` at original line 279; current
  file SHA-256
  `1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
- Frozen SQLite compatibility mirror: `src/lib/db/schema.ts:2077`, file
  SHA-256 `863e6471f944093551907619d0b427aec0d2a69d579a51bbe4d17d3900c174ff`.
- The target is a permanent ordinary nonunique, nonprimary, nonexclusion,
  nonconstraint `btree`: `int4_ops` review count ASC, `float8_ops` rating ASC,
  then `float8_ops` score DESC. It has three key/total attributes and no
  INCLUDE, predicate, or expression; it is valid, ready, and live.
- Healthy installed/restored combined target catalog-and-physical SHA-256 is
  `07cc10ecbd4c79bbcceafed2b4711859e7457e1a429876c7ad75a0dc5551ba64`.
  The target retained OID 16687, relfilenode 16687, 1,189 pages, 240,000
  tuples, and 9,740,288 bytes through every installed, rollback, and final
  healthy state; both deliberate drop phases correctly contained no target.
- Full public context contained 208 indexes and 357 constraints. The complete
  same-name, semantic-equivalent, all-`leads`-index, public-index, and public-
  constraint contexts were exact before and after the audit.

## PostgreSQL workload evidence

The accepted v5 runner was mode 0600, 91,393 bytes, SHA-256
`2557e495d5926df86374852e941468c5eb87a18575a10afb786266f9c5d5d3ba`.
Its mode-0600 23,569,629-byte artifact SHA-256 was
`abf3533d382dd6ee62c4ca70c58cfea8147c18d7784216e52df23647337faf5a`.
It used one fresh PostgreSQL 16.14 service and replayed the complete
54-discovered/52-applied/two-runtime-only-skipped chain.

The fixture contained 240,000 physically interleaved leads, 120,000 per
tenant, with 239,996 tenant transitions. It included exact review/rating/score
thresholds, independent and correlated selectivity, NULL/zero/negative/extreme
values, lifecycle and exclusion states, assignments, grants, coordinates, and
complete tie cohorts. Active included rows were 211,876, mapped rows 201,399,
and unassigned rows 192,000.

Ninety-one exact cases ran in phases I0/D0/I1/D1/I2. All complete canonical
results and source orders match, all installed phase structures match, both
dropped phase structures match, and every immediate repeat is stable. Target
selection was exactly 7/0/7/0/7. The seven target-owning global controls were
admin review descending and ascending, admin combined score, admin NULL/zero/
negative, Explore review descending, map review descending, and export review
ascending. Five researcher or market-scoped numeric cases avoided the target
and preserved identical five-phase plans.

The audit controlled planner settings, `pg_stats`, heap state, maintenance
telemetry, and sibling indexes across all phases. Their respective SHA-256
digests were
`70c3b2f697568c75aa38e9e0a7cd3ffbc232b2526b7cdaa36e85b8fff80932a1`,
`08cb489aed35a8e4db64e8d33806e8b8ae24a6279f494b6ec74114506ad7fa89`,
`bdd56dea6b13737e74bd0ba67d3e28d5a232d610f00992971c0a22f8d3a0bf5f`,
`70502869fec04de09e000bfe158b48b8b111cabde7529a749e7a01d0b59a5b6f`,
and `9e8a751b7cd4f5dddaa39a59f4a67d02f713bf9b298df968825684d87080f0e6`.
Manual VACUUM and ANALYZE ran exactly once for `leads` and
`user_market_access`; automatic maintenance remained zero. Both relations
were held under `SHARE UPDATE EXCLUSIVE`, and baseline reloptions were restored
exactly.

## Definition-aware guard and rollback evidence

The 26-receipt matrix comprises 21 guard-classified hostile-definition or
collision rejects before guard DDL or workload, one healthy no-op, one exact-
missing install, two historical name-only replay controls, and one
transactional missing-install rollback. All 26 avoid workload and restore
exact state. No rejected hostile-state receipt executes guard DDL or workload.
Post-validation DDL occurs only in the two historical-replay and two exact-
missing controls. The final healthy target and all controlled context digests
match their pre-audit values.

## Rejected and corrected evidence

- V1 runner SHA-256
  `004a18108b987310a92848386c8e0a2bfbc9d346314b2337ad46916088fe1feb`
  was corrected from initial Add File mode 0644 to mode 0600 before syntax
  check or execution, then failed its own structural checks and produced no
  artifact.
- V2 runner SHA-256
  `4ea8c7a31fa1aaedbd363196aa55cfcec665d87ae6e4c93723a84e9862d6a4c4`
  and artifact SHA-256
  `57d60503704f6519284408cbd615526f9b83eed0babf9f661cb9732976a2261b`
  are retained only as truthful diagnostic failure evidence because automatic
  maintenance contaminated the installed/drop comparison.
- V3 runner SHA-256
  `3086a6a42dfa97b7dc51b2325da0c75649e08c65c4a88a18aa8cfc468042e657`
  was rejected unexecuted for permanent-target rebuild and final target-
  identity gaps.
- V4 runner SHA-256
  `76d901aa3570ab39b80ef689c16eab7e29113b6342e5a27475ddf2a6ceeed5ae`
  was rejected unexecuted for cached statistics, incomplete relation locking,
  inexact reloptions restoration, and post-drift gate ordering.
- V4's first static `rg` invocation had invalid shell-backtick quoting; the
  corrected static rerun passed without database or runner execution.
- One focused ESLint invocation named a nonexistent Leads page and was
  rejected; the corrected live-path invocation passed. Initial G-002 and
  G-003 database prefixes were rejected before database access and rerun with
  exact fresh names. T-029 first passed 18 with one disabled adapter skipped,
  then passed the required fresh enabled 19/19 gate. An initial cleanup check
  self-matched its shell through `pgrep`; the corrected `ps -C node` check
  passed.
- One independent credential-pattern `rg` invocation split shell quoting and
  was rejected; the corrected read-only scan passed cleanly.
- The first exact payload-cleanup invocation incorrectly supplied seven paths
  to single-operand `unlink` and removed nothing; seven explicit corrected
  invocations removed only the verified P38 files and the zero check passed.
- One independent final process filter matched its own `awk` command; the
  corrected comm-excluding inventory returned zero P38 processes.
- The first local acceptance-commit attempt stopped before commit because Git
  had no configured author identity. The corrected attempt reused HEAD's
  recorded author through command-scoped settings and changed no Git config or
  credentials.

Rejected or invalid evidence is never represented as acceptance evidence.

## Separate source-contract finding

Explore preserves fractional `minReviews`, and PostgreSQL rejects a 4.5 bind
to the integer review-count comparison with SQLSTATE `22P02`. Leads and CSV
truncate the same input with `parseInt`; nonpositive values are omitted; and
the command parser collapses `>` and `>=`. These behaviors are index-neutral.
They authorize no P38 DDL or source edit. A separately serialized SR4 packet
must define and test the shared integer-domain contract before P39.

The current competitor-snapshot helper is also unscoped, but is a separate
future authority debt and cannot become P38 evidence.

## Root validation and cleanup

Under Node 24.13.1 and npm 11.8.0, root passed:

- exact focused acceptance suite: 88/88 across 12 files;
- TypeScript and corrected focused ESLint;
- recovery verification over 37 tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native tests skipped;
- production build: 11/11 pages; and
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A/G-007P20A 2/2,
  G-005 1/1, and enabled T-029 19/19 gates.

No Windows-only G006 durability evidence was run or replaced. Independent
architecture/causality and test/evidence reviewers accepted the v5 evidence
with no remaining P0/P1/P2 blocker; the producer did not self-accept.

All P38 containers, databases, volumes, listeners, node/test processes,
runners, and artifacts were removed after hash verification. Final checks
found no task-owned disposable resource or extra worktree.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 48/14, G-003 becomes 25/14, and G-002 remains 13/0. The
strict original plan remains 58/318 accepted with 260 original cards
remaining; parent G-007 remains open.

G-007SR4 remains unopened until P38 acceptance is committed and its lineage
receipt releases P38's durable-document reservation. P39 remains blocked until
SR4 is accepted, committed, and lineage-released. Its residual is
`idx_leads_phone_quality(phone_verification_status, lead_quality_score DESC)`
for a separate read-only audit. No push or external action occurs.
