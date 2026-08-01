# G-007P35 exclusion/score index audit

Date: 2026-08-01

Source baseline: `ab583892ddf1e3bb6e3061876edbe0f1d3bf65de`

Reservation commit: `4e98c3d3d3dd09c1a2515b5351ce00ea4cf14d0e`

Opening correction commit: `ce8c3afc4b100477f61d0f05b76778297c720b04`

Status: accepted RETAIN/DEFER; documentation-only; independent architecture
and test/evidence reviews accepted

## Decision

Sol accepts RETAIN/DEFER for the exact healthy historical PostgreSQL index
`idx_leads_exclusion_score(is_excluded, score DESC)` and its frozen SQLite
compatibility mirror. The target is retained as historical global
compatibility state, but no current source owner or material current
tenant-query plan defect was proven. Future tenant-prefixed forms remain
dependency-bound to the exact later tenant-aware caller cutovers.

Every authoritative current PostgreSQL exclusion predicate found in this
packet uses `COALESCE(is_excluded, 0) = 0` or `= 1`. The historical target's
leading key is the raw integer expression, so it cannot satisfy those
predicates. With that leading key unconstrained, the target also cannot provide
the exact global score, opportunity, Quality, monitor, or lease order. It was
selected only by explicit raw-integer controls, which are not current source
authority.

No migration, candidate, replacement, removal, constraint, data cleanup, test
edit, or migration-sequence use opens. The exact disposition is
`retain_healthy_historical_postgres_and_frozen_sqlite_exclusion_score_global_compatibility_index_defer_exact_future_tenant_forms_no_current_source_owner_no_proven_tenant_plan_defect_no_DDL_constraint_cleanup_or_removal`.

## Source and authority

- PostgreSQL origin:
  `supabase/migrations/202605110001_full_schema.sql:304`, origin commit
  `0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c`, current file SHA-256
  `1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
- Frozen SQLite mirror: `src/lib/db/schema.ts:2078`. Fedora evidence does not
  replace the paused Windows/NTFS G-006 lane or historical 111/111 acceptance.
- `is_excluded` is PostgreSQL `integer NOT NULL DEFAULT 0`, without a 0/1
  CHECK. `score` is `double precision NOT NULL DEFAULT 0`.
- The target is an ordinary, nonunique, nonprimary, nonexclusion,
  nonconstraint two-key btree with `int4_ops` ASC/default NULLS LAST followed
  by `float8_ops` DESC/NULLS FIRST, no INCLUDE, predicate, or expression, and
  valid/ready/live flags set.
- The opening ledger's descriptive sibling name
  `idx_leads_archived_excluded_discovered` was incorrect. Append-only
  correction `ce8c3af` records the real
  `idx_leads_active_discovered_at(archived_at, is_excluded, discovered_at)`
  from `20260603103649_dashboard_count_indexes.sql` (SHA-256
  `ca92d07f52e37a8c2b361ddf2e0c9c36e59755caf0ac28a3c31178fd91c5bc2c`).
  No evidence relied on the incorrect name.
- Exclusion and score are selectors, never tenant/workspace authority. Fixture
  tenant diversity and future tenant measurements grant no cutover authority.

## PostgreSQL 16 evidence

Faraday replayed the 54/52/2 local migration inventory on PostgreSQL 16.14 and
seeded 220,012 physically interleaved rows across two tenants and four markets.
The fixture retained 132,012 raw zero rows, 44,000 raw one rows, and 44,000
schema-valid anomalous rows distributed across `2`, `-1`, and `7`.

The accepted cumulative evidence set is:

- v1 `00c71a55345ca16a5addf2242993ace672a56d3088b6b59902f0d722029e2e4d`
  (356,430 bytes): 29/29 installed/drop/restored result and source-order
  identities, 29/29 installed/restored normalized structures, 38/37/38 index
  catalogs, ten constraints, raw anomaly controls, aggregates, Quality, queue,
  CSV, and worker shapes;
- v2 `219380b370f99671b3f550f35db5fb93f460dff3d7215d0b5acaecbdfac3c874`
  (101,900 bytes): eight additional exact result/order identities and eight
  structures, reachable limits, scheduler backlog, drift families, and source
  claim corrections;
- v3 `d143c0777181ee3ab56760ef828428eb78f309f582f02f49102afb61ad04ce6b`
  (13,026 bytes): rejected immutable lineage only because its client-side
  lease tuple counter incorrectly reported zero and uniqueness false;
- v4 `890094ca4a9337d4643d03ef6c866973cd38392dc0ebc42604f1936465b6a38e`
  (92,864 bytes): five corrected exact result/order identities and structures,
  exact source order, live monitor and lease semantics, missing-target replay,
  and an invalid/not-ready failed-concurrent-index spoof;
- v5 `634347b36c35e36b422564e8a6e57bcda1543d9dc540858ffe179a281873ebf7`
  (56,744 bytes): three corrected default Explore/map boundary proofs. The
  60/200/600 kth complete source-order tuples each have eligible cardinality
  one, are wholly included, differ from k+1, remain result/order-identical
  installed/drop/restored, and never select the target.

The live `getUnenrichedLeads(1)` monitor supplies only `score DESC`; LIMIT 1
cuts a 12-row equal-score cohort and no deterministic identity claim is made.
The enrichment lease supplies `score DESC, updated_at ASC`; server-rendered
microseconds prove its kth complete tuple is unique. Accepted score,
enrichment-lease, workbench, Quality, queue, archival, and discovery siblings
own the observed current plans. Raw `is_excluded = 0/1/2/-1` target-selecting
controls are explicitly nonauthoritative.

## Selector fidelity boundary

The default Explore/map and Quality evidence preserves exact current
WHERE/ORDER/LIMIT semantics, including the exact five-key Quality order and
reachable 60/200/600 boundaries. It intentionally reduces some live
projections and omits `app_users` LEFT JOINs, correlated artifact subqueries,
and OFFSET surfaces. Those omissions can affect PostgreSQL costing and sibling
choice, so this receipt does not claim full-route EXPLAIN identity or causal
timing/buffer conclusions.

Both independent reviewers accept this bounded selector read-equivalence for
this classification-only, no-DDL decision: omitted projection and join
surfaces cannot make the raw leading key satisfy the authoritative COALESCE
predicate or provide the unconstrained global order. This waiver does not
authorize future DDL and cannot be reused for a migration candidate without
fresh exact full-query evidence.

## Replay and catalog debt

Installed/restored catalogs contain 38 distinct lead indexes; target-drop
contains 37. All ten constraints remain unchanged. The canonical target is
restored with its exact keys, opclasses, directions, null ordering, relation
kind, persistence, definition, and healthy flags.

The historical name-only `CREATE INDEX IF NOT EXISTS` creates the canonical
target when it is missing, but does not repair same-name drift. Reversed keys,
score ASC, partial predicate, expression, INCLUDE, and same-name wrong-table
states were rejected by the audit validator. A standard failed
`CREATE UNIQUE INDEX CONCURRENTLY` on duplicate fixture values left a
same-name invalid/not-ready one-key index; historical replay left it unchanged,
the validator rejected it, and explicit cleanup restored the canonical target.
This is catalog-guard debt, not a proven P35 plan defect or DDL grant.

## Separate G-007SR2 security finding

The audit found a separate P1 compatibility-security defect: schema-valid
stored nonzero values such as `2` and `-1` are excluded by neither current SQL
list predicate, while several row mappings interpret only exact `1` as
excluded. A known-ID, assigned, market-visible anomalous lead can therefore be
mapped as nonexcluded and reach ordinary researcher object policy. Import also
preserves nonzero integers. This contradicts the accepted G-007SR1 fail-closed
contract.

This is not an index defect and grants no P35 migration, CHECK, cleanup, or SQL
predicate change. A separately serialized G-007SR2 compatibility repair must
complete before P36. Its bounded preflight recommends a shared fail-closed row
normalizer and focused parser/query/access evidence while preserving canonical
exports and admin compatibility.

## Invalid attempts and corrections

Producer attempts excluded from acceptance were: a historical full-chain
second replay that reached a pre-G-003 `ON CONFLICT` incompatibility (`42P10`),
a UUID-typed membership fixture mismatch (`22P02`), and an integer-width
catalog projection mismatch (`42883`). All three databases were excluded from
acceptance and abandoned: the first before fixture creation, the second before
the lead fixture, and the third after fixture creation but before any I/D/R
workload. Each correction was rerun on a fresh database. V3 is retained only
as rejected lineage. V1/v2 claims were corrected: the anomaly statistics raw
projection, `getUnenrichedLeads(25)`, explicit Explore score sort, and explicit
map score sort are controls rather than the live bindings asserted initially.

Root's first read-only jq summary used an incorrect `with_entries` expression;
the corrected query succeeded without changing evidence or database state.
The first combined G-004A/P20A upstream run hit an adversarial `40P01`
deadlock after G-004A passed; a fresh database rerun passed 2/2. The first T-029
invocation used a suffixed database name and was rejected before database work;
the exact required database name rerun passed 19/19. All invalid invocations
are excluded from acceptance evidence.

## Validation and cleanup

Root validation passed with Node 24.13.1 and npm 11.8.0:

- focused source behavior: 75/75 across nine files;
- TypeScript and focused ESLint;
- recovery verification over 37 tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native tests skipped;
- production build: 11/11 pages;
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A/G-007P20A 2/2 after the
  recorded deadlock retry, G-005 1/1, and T-029 19/19 after the recorded
  exact-name retry;
- `git diff --check` and JSONL jq validation.

Independent architecture/authority and test/evidence reviews accept the
cumulative packet with no remaining P0/P1/P2. The producer did not self-accept.
After review, the producer removed the PostgreSQL container/database/listener,
port 37203, five runners, and all five evidence artifacts. Sol independently
verified zero matching containers, listeners, processes, or temporary files.
No extra worktree remains.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 45/17, G-003 becomes 22/17, and G-002 remains 13/0. The
strict original plan remains 58/318 accepted with 260 original cards remaining;
parent G-007 remains open.

G-007SR2 is the exact next serialized packet because the independently proven
P1 security defect takes precedence. After its acceptance, the next source
residual is `idx_leads_location_cell(location_cell_id, score DESC)` for P36.
The P35 durable-document reservation remains held until a lineage-only commit
records the acceptance hash and releases it. No push or external action occurs.

## Lineage

Acceptance commit `8215c7ee1148a0b6b01125c245b00ce0f9487dfd` records this
reviewed RETAIN/DEFER decision locally. The following lineage-only commit
releases the P35 durable-document reservation without opening G-007SR2 or P36.
No task-owned disposable resource or lock remains, and no push or external
action occurs.
