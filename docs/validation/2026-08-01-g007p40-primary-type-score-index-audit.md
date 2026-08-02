# G-007P40 primary-type score index audit

Date: 2026-08-01

Source/evidence baseline: `b060f60a9c8c19bd3315933b338877b50de48e43`

Reservation commit: `f5c1c57a082b255ca0f8154c6ca59bd56976e293`

Status: accepted RETAIN; future tenant analogue deferred; no DDL; independent
architecture/causality and runtime-evidence reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_primary_type_score(primary_type, score DESC)`. Twenty-eight exact
cases across 15 source forms preserved complete projected results, ordering,
pagination, eligible-cohort membership, and same-state access-path structure
through I0/D0/I1/D1/I2.

`primary_type` classifies a lead and `score` ranks it. Neither field authorizes
tenant, workspace, assignment, market, lifecycle, or exclusion access. Each
current form retains the predicates supplied by its exact source contract;
primary type and score add no authority. The two future tenant forms are
measurement-only and cannot authorize present DDL.

No material exact current or durably approved tenant-query defect was proven.
P40 creates no candidate, migration, replacement, removal, repository guard,
source edit, test edit, dependency change, data change, or sequence use. Its
derived disposition is
`RETAIN_healthy_historical_global_compatibility_index_defer_future_tenant_analogue_no_repository_DDL`.

## Source and catalog

- PostgreSQL origin: `supabase/migrations/202605110001_full_schema.sql:302`,
  introduced by `0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c`; file SHA-256
  `1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
- Frozen SQLite compatibility mirror: `src/lib/db/schema.ts:2076`, file
  SHA-256 `863e6471f944093551907619d0b427aec0d2a69d579a51bbe4d17d3900c174ff`.
- The target is a permanent ordinary nonunique, nonprimary, nonexclusion,
  nonconstraint `btree` on `public.leads`: `text_ops` primary type ASC/NULLS
  LAST followed by `float8_ops` score DESC/NULLS FIRST. It has two key/total
  attributes, no INCLUDE, predicate, or expression, and is immediate, valid,
  ready, live, and not `indcheckxmin`.
- PostgreSQL 16.14 reported live attribute numbers 16 and 19, index/column
  collation OIDs `[100,0]`, and raw btree options `[0,3]`.
- Initial and final target identity was OID 16685, relfilenode 18052, 977
  pages, 240,000 tuples, and 8,003,584 bytes. Initial/final digests were exact:
  indexes `dc18479f24879717b0aedbfdd081f8be9d3b35130cd691fa58b407b1b9c0c8f5`,
  constraints `4fc671487c96d8cec8ba2cf692454f4cf24e3317a14531b209772cf8ab87c109`,
  Leads columns `3726e48cf610c52b8366bf54867b725984299154b70600922c258318acedb10f`,
  statistics `33635384637652fc2c31d659aeee5efb7a95032fb14ce33b9d3360028b8690ba`,
  and controlled settings
  `332d768572a788bbb1c6e59d6852148a1d21edb24c6fc57bff2bed6f1a34e7e8`.

## PostgreSQL workload evidence

The accepted V8 runner was mode 0600, 73,403 bytes, SHA-256
`d3f1c2d5056e6695c509524c5fbbd7e684e0c6695a7664fe3d341b6d616eaa88`.
Its valid mode-0600 27,573,805-byte artifact SHA-256 was
`4000bfc316fdd5922067be1a618d1de8cb63fd6d40f1e57200e7bc81c00dae77`.
It used one fresh PostgreSQL 16.14 service and replayed 54 discovered,
52 applied, and the exact two approved runtime-only skips.

The fixture contained 240,000 rows across two tenants, conditioned with the
target-independent primary-key cluster order after trigger-driven heap
rewrites, and then proved 239,999 adjacent tenant transitions by `ctid`.
Primary-type populations were common 120,000, medium 60,000, rare 2,400,
empty 12,000, and null 12,000. It included 24 complete-order tie rows across
both tenants, 240 negative scores, 242 zero scores, no null scores, and 160
controlled dimensions.

The 28 cases comprise 21 live current cases, one latent current-source case,
one route-control case, three adversarial cases, and two future
measurement-only tenant probes. They cover Leads count/list, map count/rows,
CSV rows, business grouped counts, Kanban count/list, density count/statistics,
AI competitor full/top rows, direct-domain queries, and future tenant
count/list measurements. Researcher CSV/Kanban denial or redirect, omitted
empty-category routes, density no-query controls, AI fallback, canonical CSV,
and SQLite backfill remain explicit non-authoritative source negatives.

Five phases produced 140 executions and 112 cross-phase comparisons. Phase
presence was `[true,false,true,false,true]`; target selection was
`8/0/8/0/8`. Natural installed-state ownership was limited to four live
current compatibility forms, three deliberate route/adversarial controls, and
one future measurement-only list probe. No planner setting was forced and no
sibling index was dropped.

All full result fingerprints and 84 ordered comparisons were exact. Ordered
evidence proved 14,524 complete cohorts and 20 valid split cohorts using full
projected-row multisets, declared ordering keys, authoritative eligible-source
descriptors, multiplicity, and boundary containment. All 84 comparable
installed/dropped same-state structures were exact; the expected 28 D0
baseline references were null. Every live current form stayed nonempty.

## Definition-aware guard and rollback evidence

The 14-receipt matrix contains ten hostile rejects before guard DDL or workload
and four controls: healthy no-op, exact missing install, historical name-only
replay spoof, and forced transactional rollback. Every receipt restored its
complete pre-state. All ten hostile receipts executed zero guard DDL and zero
workload.

The guard validates relation/schema/parent, permanence, btree method, key and
total arity, direct attribute identity/order, opclass metadata, raw collation
OIDs, raw options, canonical definition, ownership flags, validity/readiness/
liveness/checkxmin, predicate/expression absence, and semantic collisions. H6
reported exactly opclass, collation, sort/null, and index-definition mismatch;
H8 included real constraint/unique ownership; H9 included checkxmin and
invalid/unready/not-live state. C2 installed only the exact missing definition,
C3 rejected a spoofed historical replay, and C4 proved rollback left no
partial installation.

## Rejected and corrected evidence

- Attempt 1 artifact
  `92bcdd5a328185229e6fa708ec3c6f733703e36b0b0654b346b8a745fd921767`
  (3,533 bytes) was rejected after migration and before fixture on SQLSTATE
  42883 because the catalog inventory compared `integer[]` with `smallint[]`.
- Attempt 2 artifact
  `b9c818fd2eb116491a62d2f3783de7bfe88948fece2e68104f1fe241662664ae`
  (4,212 bytes) was rejected before fixture on SQLSTATE 23514 because the seed
  omitted required tenant/workspace membership. A benign pre-run readiness
  probe also met the PostgreSQL image's normal initialization shutdown; a
  repeated `SELECT 1` readiness gate succeeded against the untouched database.
- Attempt 3 artifact
  `68f8d1d8a8c40f0af7e79588c2b05fc46da03b41647990a57395d2fb0764b534`
  (5,212 bytes) was rejected before phases because trigger heap rewrites left
  237,791 rather than 239,999 adjacent tenant transitions. Controlled primary-
  key clustering corrected physical interleaving before later evidence.
- Attempt 4 was aborted after fixture construction and before evidence because
  static review found `pg_index.indcheckxmin` absent from the fingerprint and
  hostile classifier. It emitted no artifact.
- Attempt 5 artifact
  `655ef4a380885f93e23a9c6d157e173ef7d8321081c94215e46e06ab340b281c`
  (11,855 bytes) was rejected before phases on SQLSTATE 42P18 because an
  eligible-cohort statement received unused source LIMIT/OFFSET parameters.
- Attempt 6 artifact
  `25136769112a3cee11b9210513c132805505efdda2454a250d9e22a0669dba73`
  (8,603,394 bytes) completed I0/D0 and I1 execution but failed the I1/N3
  comparison because runtime-only EXPLAIN ANALYZE worker/sort/filter fields
  remained in the structural fingerprint. The rejected artifact did not
  retain fresh I1/N3, so that triage observation is explicitly unretained,
  non-reproducible, and non-authoritative.
- V6 artifact
  `91fc556dd1c7a877b733338ee5fe741b0534d573339b91510b2ea8c9e6609ac4`
  (27,571,216 bytes) passed its runtime gates but is rejected because its
  embedded attempt-6 diagnostic mislabeled the unretained observation and
  omitted the external one-trailing-LF serialization convention.
- V7 runner
  `d645c3dba1b460c6b67e22197a6b157c5769e48f2ff38ccabf74cef2d5ad91b8`
  (71,214 bytes) was rejected static and unexecuted because it did not enforce
  current-run-only disposition scope. V8 pins the retained I0 diagnostic,
  labels fresh I1 as unretained, and asserts
  `evidenceScope=current_v8_run_only` and
  `rejectedRunDiagnosticsUsed=false` before disposition.

Rejected, aborted, or static-only evidence is never represented as acceptance
evidence.

## Root validation and cleanup

Under Node 24.13.1 and npm 11.8.0, root passed the focused portable scope
134/134 across 13 files, TypeScript, focused ESLint, recovery verification over
37 tables, Fedora-portable coordinator 12 passed/26 Windows-native skipped,
and production build 11/11 pages. Fresh PostgreSQL 16.14 gates passed G-002
2/2, G-003 6/6, G-004A/G-007P20A 2/2, G-005 1/1, and enabled T-029 19/19.

The first G-003 invocation used invalid database name
`g007p40_root_catalog`; one static test passed and five integration tests
rejected the name before database work. A correctly prefixed fresh `_01` run
was rejected overall at 5/6 because its final G-007P3 queue-plan assertion
selected a sibling bitmap path. A wholly fresh `_02` run passed 6/6 and is the
accepted G-003 gate. No deliberately mutated database was reused.

Two independent final reviewers accepted the complete V8 artifact with no
P0/P1/P2 finding; the producer did not self-accept. After hash verification,
all P40 containers, databases, volumes, listeners, runner processes, runners,
artifacts, and compact extracts were removed. Final checks found no task-owned
disposable resource, runtime/non-durable lock, or extra worktree. The
serialized durable-document reservation remains held through lineage.

`git diff --check` and full-ledger `jq` validation are acceptance gates. No
Windows-only G006 durability evidence was run or replaced; the historical
Windows 111/111 acceptance remains authoritative for that lane.

Main remains `8225df619a96a088f18ff7f574a36b157d55dd2f`; handoff tag object
`a3f8278f600be87962642842a3fdd7600242cffd` still peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`. No push, pull request,
deployment, hosted or remote migration, provider call, production/customer
access, credential change, or external communication occurred.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 50/12, G-003 becomes 27/12, and G-002 remains 13/0.
Strict original-plan arithmetic remains 58/318 accepted with 260 original
cards remaining; parent G-007 remains open.

P41 `idx_leads_qualification_score(qualification_status, score DESC)` is the
next source-order residual but remains unopened until the P40 acceptance
commit is followed by a lineage-only receipt releasing P40's durable-document
reservation. No remote or external action occurs.

## Lineage receipt

The attributable local acceptance commit is
`a4d36061573406bb95da42f9585a3104e2ec0a7e`. This lineage-only receipt
releases P40's durable-document reservation. No migration, source, test,
sequence, service, payload, process, database, or worktree lock remains.

Inventory stays 54/52/2; crosswalk stays 50/12 (G-003 27/12, G-002 13/0);
sequence `202607310010` remains free; parent G-007 remains open. P41 is next
but remains unopened for its own separate reservation. Main and the handoff
tag remain unchanged, and no remote or external action occurred.
