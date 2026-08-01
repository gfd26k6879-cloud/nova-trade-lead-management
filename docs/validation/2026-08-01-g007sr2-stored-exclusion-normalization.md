# G-007SR2 stored-exclusion fail-closed normalization

Date: 2026-08-01

Opening baseline: `43699d1fca4dede22b04e30df60d67542b769d9f`

Reservation commit: `dcab6060995a225193bfaa1179ff6aaa50735b2b`

Implementation commit: `d4affb65173470415802ea2a8f695ebf3080222b`

Status: accepted bounded compatibility-security repair; independent
architecture/security and test/evidence reviews accepted

## Result

Sol accepts the bounded G-007SR2 repair. Stored PostgreSQL/SQLite exclusion
values now fail closed at the shared row-mapping boundary: only numeric `0`
(including JavaScript `-0`) or compatibility boolean `false` maps to active.
Every other runtime value maps to excluded.

The repair closes the P1 defect found during G-007P35. Schema-valid stored
nonzero integers such as `2`, `-1`, or `7` previously mapped false in several
query results. A known-ID, assigned, market-visible anomalous row could then
reach the accepted G-007SR1 researcher object policy as if active.

Researcher read and claim policy now requires `is_excluded === false` after the
row-mapping boundary. Admin early returns remain unchanged. Existing default
list and atomic researcher-claim SQL already used
`COALESCE(is_excluded, 0) = 0` and continue rejecting anomalous rows.

## Exact implementation

Implementation commit `d4affb6` changes exactly seven authorized files:

- new `src/lib/db/lead-exclusion.ts` exports the pure fail-closed normalizer;
- `src/lib/db/queries.ts` applies it to canonical `parseLeadRow`, Kanban,
  NowQueue, and discovery-candidate mappings;
- discovery preserves a LEFT JOIN miss as a directory candidate through the
  explicit `hasLead ? normalize(value) : false` guard;
- `src/lib/lead-access.ts` requires exact false for researcher active/
  nonexcluded lifecycle eligibility;
- new helper tests and focused real-SQLite query, discovery, and access tests
  cover the compatibility boundary.

The adversarial helper matrix proves numeric `0`/`-0` and boolean false active;
`1`, `2`, `-1`, NaN, positive infinity, true, null, undefined, strings,
BigInt, object, and array values excluded. Real SQLite evidence covers stored
`0/1/2/-1` through `getLeadById`, default and include-excluded lists, Kanban,
SQL-filtered NowQueue, researcher atomic claim, and the preserved admin claim
path. It does not claim anomalous rows can pass the NowQueue SQL predicate.

Discovery evidence proves a joined raw `2` row is labeled excluded while an
unjoined place remains `leadIsExcluded: false` and a directory candidate.
Malformed researcher access values are rejected before market lookup; admin
read and claim early returns remain unrestricted.

## Preserved boundaries

No SQL predicate, schema, migration, CHECK, stored-data cleanup, backfill,
lead-data import, canonical export, writer, index, dependency, or package file
changes. No tenant cutover or P36 implementation opens. The repair does not
reinterpret Fedora evidence as Windows/NTFS acceptance.

The normalizer intentionally does not coerce string zero. Current SQLite and
PostgreSQL `int4` adapters return canonical numeric values; treating malformed
runtime strings as active would weaken the fail-closed boundary. The exact-
false access check also rejects malformed values even if a future caller
bypasses the mapper.

## Validation and review

All validation used Node 24.13.1 and npm 11.8.0:

- implementer focused stable suite: 85/85 across helper, query, discovery, and
  access files;
- independent architecture/security suite: 85/85, with a complete production
  mapper sweep and no P0/P1/P2;
- independent test/evidence suite: 106/106 across helper, query, discovery,
  access, ownership actions, and metadata, with no P0/P1/P2;
- Sol focused suite: 112/112 across eight helper/query/access/action/page/map
  files;
- TypeScript and exact seven-file ESLint pass independently;
- recovery contract: 37 application tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native tests skipped;
- production build: 11/11 pages;
- `git diff --check` passes.

Two initial test-only invocations are excluded from acceptance. A Vitest `%j`
case title attempted to serialize BigInt and failed before collection; explicit
labels corrected it. TypeScript ES2017 rejected `0n`; `BigInt(0)` corrected the
syntax. The corrected helper 16/16, focused suites, typecheck, and build pass.
Neither invalid invocation caused a production change.

The implementer did not self-accept. Both independent review lanes waited for
the stable seven-file diff before review. No external disposable service,
container, listener, or persistent database was started. In-memory SQLite
fixtures and foreground validation processes exited cleanly, no task-owned
residue remains, and the implementation commit leaves a clean worktree.

## Closeout

Migration inventory remains 54/52/2, crosswalk remains 45/17 (G-003 22/17,
G-002 13/0), and sequence `202607310010` remains free. Original-plan arithmetic
remains 58/318 accepted with 260 original cards remaining. Parent G-007 remains
open.

After the acceptance receipt releases the serialized SR2 source/test locks,
the exact next eligible residual is P36 for
`idx_leads_location_cell(location_cell_id, score DESC)`. This receipt does not
open or number P36. No push or external action occurs.

## Lineage

The following lineage-only commit will record the SR2 acceptance receipt hash
and release the remaining durable-document reservation without opening P36.
