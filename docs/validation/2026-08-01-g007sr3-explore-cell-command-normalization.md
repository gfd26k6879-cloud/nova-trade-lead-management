# G-007SR3 Explore cell-command lowercase normalization

Date: 2026-08-01

Opening commit: `6f012021bb2a9a5377e34f5ce8ff0111a78023db`

Implementation commit: `b1bb12c34952cdfd3a5ebb8d227980962365b9ed`

Status: accepted; independent architecture/security and test/evidence reviews
accepted

## Decision and scope

Sol accepts the bounded two-file P2 repair. `parseExploreCommand` already
trims, unquotes, and lowercases command values. The `cell:` branch now passes
that normalized value through instead of uppercasing it a second time.
Canonical lowercase platform cell IDs therefore survive command parsing and
reach the unchanged exact parameterized SQL equality predicate.

The exact write set is:

- `src/lib/explore-filters.ts`; and
- `src/lib/__tests__/explore-filters.test.ts`.

No Explore client/page/map, database-query implementation/SQL, access,
permission, schema, migration, dependency, data, index, tenant-cutover, or
visual behavior changed. Direct URL query-state trimming and URL/chip casing
remain unchanged. Postal commands remain uppercase.

## Evidence

At opening commit, root and the independent test reviewer reproduced the
defect under Node 24.13.1: `cell:cell-us-co-80202` produced
`CELL-US-CO-80202`, and an exact lowercase assertion failed. Direct URL state
already preserved its input case and postal commands already produced
uppercase postal tokens.

The implementation changes one production expression. Tests now cover:

- lowercase, uppercase, and mixed-case command keys/values;
- single- and double-quoted uppercase/mixed-case cell IDs;
- canonical lowercase filter and Cell-chip values;
- parsed command state passed through `buildExploreQueryState`;
- direct mixed-case URL query state and chips preserved unchanged; and
- postal `m5v` preserved as uppercase `M5V`.

The implementer passed 29/29 focused Explore parser/client/page/map tests,
TypeScript, focused ESLint, and diff checks. The committed worktree was clean;
the implementer did not self-accept.

Independent test/evidence review repeated the 29/29 focused suite, an exact
adversarial command/URL/postal matrix, TypeScript, focused ESLint, scope/diff
checks, and clean-status verification. Independent architecture/security
review passed the parser's 15/15 tests, a 26/26 parser/page/client subset,
TypeScript, focused ESLint, and exact scope checks. Both reviewers report no
P0/P1/P2 finding.

Root independently passed:

- focused Explore parser/client/page/map: 29/29;
- TypeScript and focused ESLint;
- recovery verification over 37 application tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native skipped; and
- production build: 11/11 static pages.

Root incorrectly invoked the unfiltered full Vitest suite on Fedora. It crossed
the paused Windows-native G006 boundary and reported 87 failures plus 81
uncaught missing-PowerShell errors after 2,337 portable tests passed. A second
broader invocation used the handoff's historical single-file G006B exclusion,
but current G006C compatibility tests also require the Windows lease helper; it
reported 15 failures and ten missing-PowerShell errors after 2,336 tests passed.
Both invocations are invalid environment evidence, created no durable state,
left no process or temporary residue, and are excluded. The focused SR3 gates
and the required Fedora-portable coordinator were rerun/preserved green. No
Windows acceptance was claimed or replaced.

## Closeout

Counts remain 54/52/2, crosswalk remains 46/16 (G-003 23/16, G-002 13/0),
sequence `202607310010` remains free, original-plan arithmetic remains
58/318/260, and parent G-007 remains open. The next source-order residual is
P37 `idx_leads_market_active(market_id, archived_at, score DESC)`. SR3's
durable-document reservation remains held until a lineage-only commit records
the acceptance hash and releases it. No push or external action occurs.
