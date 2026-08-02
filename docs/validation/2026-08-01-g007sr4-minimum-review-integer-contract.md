# G-007SR4 minimum-review integer contract

Date: 2026-08-01

Opening commit: `fabf46ac706911349c8c0f1c10e8f054d3543236`

Implementation commit: `fe7bd66ccea83a63bdfa8681bdba386b790dc668`

Status: accepted source/test repair; independent architecture/security and
test/evidence reviews accepted; lineage receipt pending

## Result

Sol accepts the bounded `minReviews` integer-domain repair. One shared pure
parser now normalizes Explore URL/command input, protected Leads, CSV export,
the list server action, and the final shared query seam. PostgreSQL no longer
receives fractional, nonfinite, unsafe, or out-of-`int4` review-count binds.

The accepted contract is:

- strings are trimmed and accept only ASCII decimal digits with an optional
  single leading `+`; leading zeros are allowed;
- negative spelling including string `-0`, fractions, partial text,
  exponent/base notation, separators, Unicode digits, nonfinite spelling, and
  unsafe integers are omitted;
- primitive runtime numbers must be finite nonnegative safe integers; numeric
  `-0` canonicalizes to zero; other runtime types are omitted;
- zero is a valid no-filter compatibility value and preserves NULL/negative
  review-count inclusion;
- values 1 through 2,147,483,647 bind once to inclusive
  `l.review_count >= ?`; and
- larger safe integers add literal `1 = 0` without a review-count parameter.

The final defensive branch is shared by list/count, map, export, business-type
counts, and Kanban. Following parameter positions remain stable. No attacker-
controlled SQL is interpolated.

## Preserved boundaries

`minReviews` is nonauthorizing. `view:workspace` and `export:csv` permissions,
researcher assignment/market/lifecycle/exclusion constraints, and tenant/
workspace behavior are unchanged. The action spreads input before the access
clamp, so clamp fields still override caller input before query execution.

`minRating` and `minScore` retain their floating-point parsing and query
behavior. Existing `reviews>` and `reviews>=` commands remain inclusive
aliases. Their `Reviews >` label mismatch, repeated-key selection, raw invalid
chips, and the explicitly chosen invalid-input omission/broadening behavior are
recorded debt, not claimed repaired.

No client, access-policy, permission, schema, migration, index, stored data,
dependency, migration-count, sequence, or Windows-lane change occurred.

## Exact write set

Production:

- new `src/lib/lead-filter-parsing.ts`;
- `src/lib/explore-filters.ts`;
- `src/app/(protected)/leads/page.tsx`;
- `src/app/api/export/csv/route.ts`;
- `src/lib/leads/actions.ts`; and
- `src/lib/db/queries.ts`.

Tests:

- new `src/lib/__tests__/lead-filter-parsing.test.ts`;
- `src/lib/__tests__/explore-filters.test.ts`;
- new `src/app/__tests__/leads-page.test.tsx`;
- new `src/app/__tests__/csv-export-route.test.ts`;
- `src/lib/__tests__/lead-ownership.actions.test.ts`;
- new `src/lib/__tests__/lead-min-reviews.query.test.ts`; and
- new opt-in `src/lib/__tests__/lead-min-reviews-postgres.test.ts`.

The PostgreSQL test is disabled by default, permits only a task-prefixed
loopback database on PostgreSQL 16, creates UUID-scoped fixture rows, exercises
the real application PostgreSQL adapter and `getLeads`, restores environment
state, and cleans only its fixture. The operator owns service/database setup
and teardown.

## Validation

Node 24.13.1 and npm 11.8.0 evidence:

- producer, independent reviewer, and root focused runs each passed 112/112
  across eight portable files with the single opt-in PostgreSQL test skipped by
  default;
- producer and root each ran a different fresh loopback PostgreSQL 16.14
  service and database after exact 54-discovered/52-applied/two-skipped
  migration replay; the real adapter regression passed 1/1 in each;
- adjacent query/access/Quality/CSV regressions passed 63/63 across six files;
- TypeScript and focused ESLint over all 13 changed paths passed;
- recovery verification matched 37 application tables;
- Fedora-portable coordinator passed 12 with 26 Windows-native tests skipped;
- production build generated 11/11 static pages; and
- independent fresh G-003 PostgreSQL passed 6/6 on PostgreSQL 16.14 with exact
  54/52/2 assertions.

Architecture/security and test/evidence reviewers independently accept with no
P0/P1/P2 finding. The implementer did not self-accept.

## Rejected and corrected invocations

- The first SR4 opening-event JSON draft contained one surplus closing brace;
  `jq` rejected it before the opening commit, and the corrected JSONL passed.
- The implementer's first typecheck rejected a test-only BigInt literal under
  the ES2017 target. Replacing only `42n` with `BigInt(42)` preserved rejection
  coverage; corrected TypeScript and all tests passed.
- The producer PostgreSQL cleanup's immediate listener check observed a
  transient closing socket. A repeated exact check confirmed zero listener,
  container, process, and payload residue; its empty temporary verification
  file was removed.
- The producer and root container-only removals initially left one anonymous
  PostgreSQL data volume each. Podman volume/container events correlated the
  two unmounted volume IDs exactly with the two SR4 container creation times;
  both explicit volumes were removed and the corrected zero check passed.
- The independent document reviewer created three task-specific verification
  files under `/tmp`. Root removed all three exact paths after review and the
  reviewer independently rechecked that no SR4 temporary artifact remained.
- Root's first final process-count expression matched its own shell command and
  reported three false positives. A corrected exact process-name check and a
  separately scoped container-name check each returned zero.

Rejected or invalid evidence is not represented as acceptance evidence.

## Cleanup and closeout

Both SR4 PostgreSQL containers/databases and the independent G-003 container/
anonymous volume were removed. The three reviewer-created temporary files were
also removed by exact path. Final checks found no SR4 container, volume,
listener, node/test process, temporary payload, or extra worktree. The one
remaining anonymous volume in the validation-window candidate set was
independently event-correlated to the unrelated
`nova-next-country-preflight-3a4866c` task and was left untouched.

Inventory remains 54/52/2, crosswalk remains 48/14 (G-003 25/14, G-002 13/0),
sequence `202607310010` remains free, original arithmetic remains 58/318/260,
and parent G-007 remains open. P39 `idx_leads_phone_quality` is next but stays
unopened until a lineage-only commit records the SR4 acceptance hash and
releases the durable-document reservation. No push or external action occurs.
