# G-007P39 phone-quality index audit

Date: 2026-08-01

Source/evidence baseline: `4f0aa036b0ad73103a89ea6f553d7241ae490b7a`

Reservation commit: `e91b409a9bea696fc3f3236a224ba41610cd5812`

Status: accepted RETAIN; future tenant analogue deferred; no DDL; independent
architecture/causality and test/evidence reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_phone_quality(phone_verification_status, lead_quality_score DESC)`.
Six exact live Quality summary, list, AI-candidate, and action forms, eight
latent current-source shared-filter forms, and three synthetic future tenant
measurements preserved complete source semantics through I0/D0/I1/D1/I2.
Every live form was nonempty in every phase.

Phone status and quality score never authorize tenant, workspace, assignment,
market, lifecycle, or exclusion scope. Current compatibility authority remains
role, assignment, and user-market based. The three future G-011/G-017 tenant
forms are measurement-only and cannot authorize present DDL. Target selection
is recorded but is deliberately noncausal in the disposition.

No material current or durably approved tenant-query plan defect was proven.
P39 creates no candidate, migration, replacement, removal, repository guard,
source edit, test edit, dependency change, data change, or sequence use. Its
derived disposition is
`RETAIN_healthy_historical_global_compatibility_index_defer_future_tenant_analogue_no_repository_DDL`.

## Source and catalog

- PostgreSQL origin:
  `supabase/migrations/202605130001_lead_quality_command_center.sql:15`,
  introduced by commit `087264630b60ea0f8121817434489c9b6839f6bc`;
  file SHA-256
  `eb52fbd5848270ebc14e7e16b6741fe8c65cbfd944765d4d908efd40aff595b8`.
- Frozen SQLite compatibility mirror: `src/lib/db/schema.ts:2086`, file
  SHA-256 `863e6471f944093551907619d0b427aec0d2a69d579a51bbe4d17d3900c174ff`.
- The target is a permanent ordinary nonunique, nonprimary, nonexclusion,
  nonconstraint `btree`: `text_ops` phone status ASC/NULLS LAST followed by
  `float4_ops` quality score DESC/NULLS FIRST. It has two key/total attributes,
  no INCLUDE, predicate, or expression, and is valid, ready, and live.
- PostgreSQL 16.14 reported bare direct key definitions, live attribute numbers
  70 and 62, default `pg_catalog.text_ops` and `pg_catalog.float4_ops`, index
  collation OIDs equal to column OIDs `[100,0]`, and raw btree options `[0,3]`.
- Initial and final target identity was OID/relfilenode 16794, 1,168 pages,
  240,000 tuples, and 9,568,256 bytes. Initial/final digests were exact:
  indexes `63dd7ae0be2a5a5910d106595d7d44fc7f5e71850323d64f251c6ee50d7f9c22`,
  constraints `1c458d6d23ef8c6bebda05809683c6b6134da4c81d0faf37585668013b624257`,
  index catalog `0ecd67bd13bf3dc680e98a2b9d0459f312785b6247ba881ee6e16a9c2a9b967f`,
  Leads columns `98cec33eaad2520c7012ef768ddf5cbb9976172f05f2d9eb050e1b4ced40e0e6`,
  and statistics `adda4f34d7566adb663a7b9d0d1f4f4bc69a0ea62460f96657601583b674f97e`.

## PostgreSQL workload evidence

The accepted V9 runner is mode 0600, 109,277 bytes, SHA-256
`eee0dbbe56dc2703a1f6367cd8e110243276ae9b29694f7972b9032c7af9855b`.
Its valid mode-0600 19,027,699-byte artifact SHA-256 is
`fdba2c52dba2659c070f6e1947fac8689fd68b3b7caeb5580f8b4ed54edf0631`.
It used one fresh PostgreSQL 16.14 service and replayed 54 discovered,
52 applied, and the exact two approved runtime-only skips.

The fixture contained 240,000 physically alternating rows across two tenants
with 239,999 tenant transitions, seven stored phone-status classes plus an
absent query, negative/zero/extreme `real` quality values, assignments,
markets, exact grants, lifecycle and exclusion states, and complete order ties.
The exact inline map pair contained two rows and two tenants, was active,
geocoded, and `bad`, had computed map rank 2, and formed exactly one six-key
map-order cohort. Tie buckets were AI 4,998, lead-quality 1,003, map 1, and
quality 91,057. All L1-L6 qualifying populations were positive.

Seventeen exact cases ran in five phases for 85 executions and 68 cross-phase
comparisons. Phase presence was `[true,false,true,false,true]`; installed
physical identity, dropped absence, and rollback identity were exact. Target
selection was I0 13, D0 0, I1 13, D1 0, and I2 13.

All eight unordered results were exact in every comparison phase. All nine
ordered forms preserved cardinality, declared-key sequences, complete-cohort
full projected-row multisets, authoritative eligible-source descriptors, and
multiplicity-aware same-phase cohort membership. Only dynamically proven
leading or trailing split cohorts permitted member substitution, with exact
boundary keys/counts and eligible-source containment. Independent review
audited all 45 ordered executions and 1,585 cohort proofs: 1,545 complete and
40 split. Installed and dropped same-state structures were exact; final
catalog, physical identity, columns, constraints, and statistics matched the
initial state.

## Definition-aware guard and rollback evidence

The 14-receipt matrix contains ten hostile rejects before guard DDL or workload
and four controls: healthy no-op, exact missing install, historical name-only
replay spoof, and forced transactional rollback. Every receipt restored its
complete pre-state. Hostile receipts executed zero guard DDL and zero workload.

The guard independently validates relation/schema/parent, persistence, btree
method, arity, direct key attribute identity/order, default opclass metadata,
raw collation OIDs, raw options `[0,3]`, canonical index definition, ownership
flags, validity/readiness/liveness, predicate/expression absence, and namespace
or semantic collisions. H6 rejected with exactly
`opclass_mismatch`, `collation_mismatch`, `sort_null_mismatch`, and
`indexdef_mismatch`. C2 and C4 canonical installs normalized to the healthy
catalog fingerprint. Target physical identity and all catalog contexts were
exact after every rollback and at final closeout.

## Rejected and corrected evidence

- V1 runner `a0f480d3efb7c76c095fda8763e34f1576ec5f944530dbfa812e4de04fecad67`
  (40,699 bytes) and artifact
  `80d4383972ca0416496948bc62efdffb5a84909b7b4efca527a16a740c9d55ec`
  (1,826 bytes) are rejected pre-phase runtime evidence. Earlier corrected
  attempts covered active same-tenant membership, a transient fixed-port race,
  and the first-row transition count.
- V2 `bf0535b44efa8e31214ec24fbbafe6ed97b82edb0a6d92817a77d9d0ed480bb8`
  (52,799 bytes), V3
  `334bdf2247f3c546249f38fd00ce59a0217bc253b0cc1ea3bc0fcc910d5dbd45`
  (64,175 bytes), and V4
  `6c03d1ae2f88f8ca845ebf54c7aec1c20f6c6cb4fd63a9fcc689aca0af416868`
  (74,183 bytes) were rejected static and unexecuted for incomplete result,
  boundary, eligible-source, restoration, disposition, or adversarial gates.
  V3's first offline scan self-matched its own forbidden token and was
  corrected without a service.
- V5 `df2e5eb3799cd007cbe009cbf68c625d63abcd1769e6a4e7fb4f114e074025fa`
  (83,496 bytes) and artifact
  `538c7f7dc1b12c1923d1267afb380e7b53b16328f9fdf703cf889cc8f0346d78`
  (7,238 bytes) are rejected pre-phase runtime evidence. The fixture produced
  AI 4,997, lead-quality 1,002, map 0, and quality 91,058 tie buckets; fixture
  assignment, phases, comparisons, and receipts stayed null/zero.
- V6 `f58deddbf63d9ab5efff6abcf9631b1982c1468afbd858c00fd5bc631fbaae54`
  (93,534 bytes) was rejected static and unexecuted because its map-family gate
  accepted greater-than-zero rather than exactly one cohort.
- V7 `17116ceb3b3a231590a76edc17bed406c97257e9de4bc857faf3c17cd06562f1`
  (96,826 bytes) and artifact
  `352b9c9951083c0fd0f0cb0c72c8a7d429ab713ec486747dad8471ee331773fd`
  (13,054 bytes) are rejected pre-phase runtime evidence. The corrected
  fixture passed with map 1, but the guard falsely expected DESC decoration in
  the per-key deparse. Context, phases, comparisons, and receipts stayed empty.
- V8 `66197f1c753e191f4b79f0f09b032420686e88304b0908d341befdea4894b253`
  (107,552 bytes) was rejected static and unexecuted because decorated H6 key
  text could add an extra causal reason. V9 classifies direct key identity only
  from raw attribute positions/names and requires H6's exact four reasons.
- One root catalog probe ran after V7 cleanup and truthfully returned no such
  container; the executor's pre-cleanup probe supplied the valid PostgreSQL
  evidence. One broad temporary-file cleanup form was policy-rejected during
  V8 construction; the exact task temporary file was removed with targeted
  `unlink`. Neither invocation changed repository state.
- V9 cleanup briefly observed the just-removed port; the first follow-up found
  it free. Broad process searches that matched their own inspection shells were
  discarded in favor of exact executable/process checks.

Rejected or invalid evidence is never represented as acceptance evidence.

## Adjacent SR5 repair and upstream gates

The initial P39 portable scope passed 75/75 across 13 files. The adjacent
researcher-AI suite failed 0/6 because its stale fixture omitted canonical
`archived_at` and `is_excluded`; this was not a product, access, or P39 index
defect. SR5 opened at `748371621172d80a16254b5a01beed1a78b79df2`,
implemented at `c6933af531f31bfc23d1ac0e76eb0afc6dc88bf6`, was accepted at
`bbe261295bbe39ec1cf36f90990d6afbae766a0b`, and lineage-released at
`4f0aa036b0ad73103a89ea6f553d7241ae490b7a`. The repaired combined scope
passed 83/83 before P39 acceptance resumed.

The mode-0600 upstream receipt at baseline `4f0aa036...` had SHA-256
`4d7b7ff38ee1917996a71d3102e26a6c121614c3a1b85b7eb620c27b7fa04fef`
and 2,069 bytes. Fresh PostgreSQL 16.14 gates passed G-002 2/2, G-003 6/6,
G-004A/G-007P20A 2/2, G-005 1/1, and enabled T-029 19/19. It contained no
invalid invocation and all cleanup flags were true.

## Root validation and cleanup

Under Node 24.13.1 and npm 11.8.0, root passed the repaired portable 83/83,
TypeScript, focused ESLint, recovery verification over 37 tables, Fedora-
portable coordinator 12 passed/26 Windows-native skipped, and production build
11/11 pages. `git diff --check` and full-ledger `jq` validation are acceptance
gates. No Windows-only G006 durability evidence was run or replaced; the
historical Windows 111/111 evidence remains authoritative for that lane.

Two independent final reviewers accepted the complete V9 artifact with no
P0/P1/P2 finding; the producer did not self-accept. After hash verification,
all P39 containers, databases, volumes, listeners, runner processes, runners,
artifacts, compact extracts, and upstream receipt were removed. Final checks
found no task-owned disposable resource, runtime/non-durable lock, or extra
worktree. The serialized durable-document reservation remains held through the
lineage receipt.

Main remains `8225df619a96a088f18ff7f574a36b157d55dd2f`; handoff tag object
`a3f8278f600be87962642842a3fdd7600242cffd` still peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`. No push, pull request,
deployment, hosted or remote migration, provider call, production/customer
access, credential change, or external communication occurred.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 49/13, G-003 becomes 26/13, and G-002 remains 13/0.
Strict original-plan arithmetic remains 58/318 accepted with 260 original
cards remaining; parent G-007 remains open.

The next source-order residual is P40
`idx_leads_primary_type_score(primary_type, score DESC)`. P40 remains unopened
until this acceptance is committed and a lineage-only receipt releases P39's
durable-document reservation. No remote or external action occurs.
