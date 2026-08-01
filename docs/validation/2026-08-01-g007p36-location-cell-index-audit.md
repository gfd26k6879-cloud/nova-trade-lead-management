# G-007P36 location-cell/score index audit

Date: 2026-08-01

Source baseline: `a1aef99558255a85889f31f7501bf6dc27ca8999`

Reservation commit: `644dff4a36efdb903b505f8188b3e5fcd0b09040`

Status: accepted RETAIN; future tenant analogue deferred; documentation-only;
independent architecture and test/evidence reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_location_cell(location_cell_id, score DESC)`. Exact current
Coverage, Explore, map, and Quality readers use the target naturally on the
reviewed fixture. Target-only drop preserves every result and source order but
changes the plan honestly; restored structures and the exact semantic catalog
match the installed state.

Location cells are global platform reference identifiers. Cell, market, and
score predicates never grant tenant or workspace authority. The current
researcher compatibility query uses market visibility and can observe both
fixture tenants in one shared cell; this is recorded as an authority control,
not represented as an accepted tenant cutover. Any future
`tenant_id, location_cell_id, score` form remains dependency-bound to exact
G-009/G-010/G-011 callers.

No material current or durably approved tenant-query plan defect was proven.
P36 creates no candidate, migration, replacement, removal, repository guard,
test edit, or migration-sequence use. Its exact disposition is
`retain_healthy_historical_postgres_and_frozen_sqlite_location_cell_score_global_compatibility_index_for_exact_current_cell_reads_defer_future_tenant_form_no_DDL_or_removal`.

## Source, reachability, and catalog

- PostgreSQL origin:
  `supabase/migrations/20260602193000_international_markets_and_territories.sql:62`,
  origin commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d`, current file
  SHA-256 `af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.
- Frozen SQLite compatibility mirror: `src/lib/db/schema.ts:2093`, file
  SHA-256 `863e6471f944093551907619d0b427aec0d2a69d579a51bbe4d17d3900c174ff`.
- `location_cell_id` is nullable text with no default, CHECK, or foreign key;
  `score` is non-null double precision with default zero.
- The target is a permanent, ordinary, nonunique, nonprimary, nonexclusion,
  nonconstraint `btree`. It has two key attributes: `text_ops` ASC/default
  NULLS LAST and `float8_ops` DESC/NULLS FIRST, with no predicate, expression,
  or INCLUDE column. It is valid, ready, and live.
- Direct `pg_constraint.conindid` inspection is empty installed and restored.
  Persistence, owner, table/schema, access method, flags, keys, options,
  opclasses, collations, dependencies, and definitions were captured. The
  installed/restored semantic SHA-256 is
  `7ce6a8217d7025ae0d7102faed89ffe927bb87976b8d48a7a74b396fdcdea774`.
- Exact live families include global and run-scoped Coverage, Explore count/
  full page at page size 60 and nonzero OFFSET, map optional count and full
  projection at limits 1/200/600, and Quality summary/removed/list/AI/action
  families at their source limits. Full projections, assignment LEFT JOINs,
  Quality correlated artifact subqueries, bind order, and source ordering were
  retained where present.
- Live `/leads` and CSV routes do not bind a cell. Kanban/export/helper forms
  without a cited live cell binder are controls. Quality AI candidate limits
  10/25/100 use the accepted workbench candidate index rather than the target.

## Producer evidence and rejected packets

Faraday replayed PostgreSQL 16.14 with the full 54-discovered/52-applied/two-
runtime-only-skipped chain. The original 240,000-row fixture had 120,000 rows
per tenant, 131,501 physical tenant transitions, 24,000 lowercase target-cell
rows, and explicit common, NULL, empty, orphan, mixed-case, mismatched-
geography, archive, raw-exclusion, assignment, coordinate, quality, and score
states.

The accepted original artifact was jq-valid, mode 0600, 401,287 bytes, SHA-256
`49e557963ac59480b340c18e33e67d1985d73b0e543845af3e70c6e4f02a008d`.
Its 39,049-byte runner SHA-256 was
`f4824c1885e5edc85b3ec3cd192ee2e842317a55afa283099caa97c7cf1bba80`.
It captured 26 exact current SQL cases. All installed/drop/restored results and
source orders matched, all installed/restored normalized structures matched,
and 23 honest drop structures differed. Catalog counts were 38/37/38 with ten
constraints. No planner forcing or telemetry-causality claim was used.

Six earlier producer attempts were rejected or corrected without acceptance:

- two fixture grants violated accepted G-002 membership/workspace contracts;
- a cross-tenant actor assignment violated G-003;
- the artifact status used `completed` instead of canonical `complete`;
- the first complete artifact collided its mixed-case fixture with the
  uppercase-command empty control; and
- the second complete artifact copied Explore's middle-key order into the fast
  map default order.

Independent review then rejected the otherwise sound original artifact for
bounded evidence gaps: the run-scoped Coverage and researcher-visible Explore
branches were absent, the exact selective cell contained one tenant, and the
catalog/replay matrix needed richer nonconstraint and spoof evidence. No
product or index defect was inferred from that rejection.

## Corrective supplement

The immutable v4 supplement was jq-valid, mode 0600, 568,455 bytes, SHA-256
`565a7e447370c3cec91971dd52812eea52b65066c4bd1aa7d798eb7bc590722d`.
Its 30,138-byte runner SHA-256 was
`c6ad0909010978d19f11900d69922ec3603a790ef38ab17ab350e4ea15a79c28`.
It left the original artifact and runner byte-identical.

The supplement truthfully added 12,000 deterministic tenant-B rows to the
exact lowercase cell as a fixture-only correction. The cell then contained
24,000 tenant-A and 12,000 tenant-B rows with 24,000 physical tenant
transitions. The supplement seeded one valid run/unit and reused the retained
original fixture's researcher market grant.
The exact researcher compatibility predicate returned 18,509 eligible rows,
split 9,255/9,254 across the two tenants; this demonstrates that platform cell
identity is not tenant authority.

Three exact supplemental cases covered run-scoped Coverage and researcher
Explore count/full page at LIMIT 60 OFFSET 3540. Every result and source-order
digest matched installed/drop/restored, every installed/restored normalized
structure matched, and the target was present in installed/restored plans and
absent after drop.

The definition-aware evidence isolated reversed keys, same-name wrong-table
index, wrong access method, valid unique, alternate-name semantic duplicate
with missing or healthy named target, near wrong-order and partial siblings,
truly missing, and healthy states. Reject states executed neither guard DDL nor
workload and retained exact catalog hashes. Near siblings and truly missing
states created the exact canonical target; healthy state was an exact no-op.
Historical name-only `IF NOT EXISTS` behavior was executed and reported
separately, including its redundant-create behavior when only an alternate-
name semantic duplicate exists. Transactional creation followed by rollback
left the target missing with the pre-state hash unchanged.

One host `psql` preflight failed with exit 127 before any database statement;
container `psql` corrected it. Root also issued three invalid jq projections
while inspecting array/object paths; each failed read-only and was corrected
against the actual artifact schema. These invalid invocations are excluded
from acceptance evidence.

## Separate semantic finding

`parseExploreCommand("cell:cell-us-co-80202")` currently returns uppercase
`CELL-US-CO-80202`, while canonical platform cell IDs and direct URL bindings
are lowercase and PostgreSQL equality is exact. The resulting empty query was
reproduced as a nonauthoritative P2 semantic control, never as index evidence.
P36 grants no source edit. A separately bounded two-file parser/test repair
must follow P36 lineage before the next residual index packet.

## Root validation and cleanup

Root independently inspected source fidelity, catalog fields, all artifact
hashes, comparison invariants, replay cases, and restored public catalog.
Before documentation-only acceptance it passed:

- 49/49 focused Coverage, Explore, map, and Quality source tests;
- TypeScript and focused ESLint;
- recovery verification over 37 tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native tests skipped;
- production build: 11/11 pages; and
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A/G-007P20A 2/2, G-005 1/1,
  and T-029 19/19 gates.

An invalid root attempt named the unavailable short Bookworm PostgreSQL image;
it created no container and was corrected with the accepted fully qualified
PostgreSQL 16.14 Alpine image. No Windows-only evidence was run or replaced.

Independent architecture/authority and test/evidence reviews accept the full
artifact set with no unresolved P0/P1/P2 evidence defect. The producer did not
self-accept. After review, Sol removed the exact disposable container,
database, 21 audit schemas, listener/port, anonymous volume, both runners, and
both artifacts. The first combined cleanup command was locally rejected before
execution because it contained direct `rm`; Fedora then rejected trashing
`/tmp` files, so Sol used four exact single-file unlink operations. Final
checks found zero matching task containers, volumes, processes, or temporary
files. The temporary evidence and disposable database are not recoverable;
their accepted hashes and conclusions are retained here.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The crosswalk becomes 46/16, G-003 becomes 23/16, and G-002 remains 13/0. The
strict original plan remains 58/318 accepted with 260 original cards remaining;
parent G-007 remains open.

The separately proven Explore command P2 repair is the exact next serialized
packet. After it closes, the next source-order residual is
`idx_leads_market_active(market_id, archived_at, score DESC)` for P37. P36's
durable-document reservation remains held until a lineage-only commit records
the acceptance hash and releases it. No push or external action occurs.
