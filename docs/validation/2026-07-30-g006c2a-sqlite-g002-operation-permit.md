# G-006C2A SQLite G002 storage-operation permit

Date: 2026-07-30
Producer: `/root/g004a_terra`, `gpt-5.6-terra`, medium reasoning
Branch: `codex/nova-g006c2a-permit`
Exact baseline: `fb13a103153a970eb472d2f0b66d092940504135`
Status: implemented and locally validated; pending independent review and parent acceptance

## Delivered boundary

This replacement packet implements only an unwired, non-authorizing SQLite
storage primitive. It is not exported from `src/lib/db/index.ts` and has no
production caller.

`createSqliteG002StorageOperationPermit(input)` accepts exactly:

- explicit `fresh` or `upgraded` lifecycle;
- the lifecycle-corresponding genuine C1 or C0 `SqliteCompatibilityBinding`;
- exact database path, tenant ID and storage workspace ID;
- required `operationWorkspaceId`, either the exact storage workspace or
  explicit `null` for a tenant-wide row; and
- one fixed operation: `user_market_access`, `crawl_runs` or `crawl_units`.

Creation narrows a genuine, previously verified binding by calling
`requireFreshSqliteCompatibilityScope` or `requireSqliteCompatibilityScope`.
Those calls assert the lifecycle-corresponding module-private binding state and
exact selectors; they do not reopen or read the database. C2A performs no table
access or mutation. Omitted/undefined operation workspace, scope inference, a
non-null different operation workspace, a wrong lifecycle map, a wrong
selector, or a forged binding fails closed.

The resulting permit is frozen, fieldless, null-prototype and meaningful only
through a module-private `WeakMap`. `requireSqliteG002StorageOperationPermit`
deletes that private state before validating the expectation, making success,
mismatch and hostile-expectation failures terminal. Copies, spreads, proxies,
fabrications, prototypes and replays do not carry the private state.

Successful consumption returns only a frozen plain record containing the exact
backend/lifecycle/database/tenant/storage-workspace/nullable-operation-workspace/
operation facts plus:

```text
authority: storage-operation-scope-only
grantsAuthentication: false
grantsAuthorization: false
grantsWorkerExecution: false
grantsProviderExecution: false
```

The module exposes no actor, policy, session, worker, cron, provider, source,
play, callback, database handle, serialization helper or persistent audit.

## Trust and freshness boundary

The permit carries only the selectors captured from a genuine, previously
verified C0/C1 binding. Creation and consumption do not reopen or read the
database, recheck its current canonical path or physical file identity, recheck
current schema, foundation, tenant/workspace facts or rows, hold a database
lease, or prove current database state or target-row existence.

Before mutation, C2B/C must freshly open the exact bound database and
atomically revalidate, with exact SQL predicates, the canonical path and file
identity as applicable, current schema/foundation/tenant/workspace facts, the
exact crawl-run parent for a unit, and persisted location-mode/reference
integrity. The permit remains non-authority and never replaces the interactive
or worker scope owned by G009/G010/G013.

## Exact write scope

1. `src/lib/db/sqlite-g002-operation-permit.ts`
2. `src/lib/__tests__/sqlite-g002-operation-fixtures.ts`
3. `src/lib/__tests__/sqlite-g002-operation-permit.test.ts`
4. `docs/validation/2026-07-30-g006c2a-sqlite-g002-operation-permit.md`

No existing tracked path changed. The primitive remains deliberately unwired;
G-006C2B/C may consume it only under their later detached-writer packets.

## Fixture and adversarial matrix

The focused suite creates one genuine, previously verified C1 fresh binding and
one genuine, previously verified C0 upgraded binding. The upgraded path
performs the accepted-legacy backfill, G006B execute/commit and G006B replay
before C0 mints its binding. Both roots are owned direct children of the
resolved Windows temp directory with exact `g006c2a-fresh-` or
`g006c2a-upgraded-` prefixes.

Returned fixture records are frozen and registered in a private `WeakMap`.
Cleanup accepts only an exact registered fixture, clears ownership before the
attempt, re-resolves an existing direct temp child, rechecks the owned prefix
and database containment, uses five Windows retries at 100 ms, and verifies the
root, database, WAL, SHM and journal sidecars are absent. Setup-failure and
`afterAll` cleanup references are optional, cleared before use and consumed at
most once.

Vitest enumerates 36 substantive cases. The matrix covers both lifecycles, all
three operations, named and explicit-null row scope, exact/frozen evidence,
fieldless permits, database bytes and G002 row immutability, lifecycle-map and
database/tenant/storage-workspace/operation mismatches, omitted/undefined and
unknown selectors, extra/symbol/accessor/proxy/inherited/null-prototype inputs,
binding and permit forgery/copy/spread/proxy/prototype attacks, cross-fixture
selection, mismatch burn, hostile-expectation burn, replay rejection, detached
input snapshots, no authority imports, no SQL/database handle, no barrel export
and no runtime wiring.

## Validation evidence

Environment: Windows, Node 24.13.1, Vitest 4.0.18,
better-sqlite3 12.9.0, TypeScript 5.x and ESLint 9.x from the lockfile.

### Required focused and regression gates

- `npm exec -- vitest run src/lib/__tests__/sqlite-g002-operation-permit.test.ts --reporter=dot`
  - Final isolated PASS: 1 file, 36/36; Vitest 14.85 seconds; shell
    16.353 seconds.
- `npm exec -- vitest run src/lib/__tests__/sqlite-compatibility-scope.test.ts --reporter=dot`
  - PASS: 1 file, 12/12; Vitest 157.51 seconds; shell 159.161 seconds.
- `npm exec -- vitest run src/lib/__tests__/sqlite-fresh-compatibility-scope.test.ts --reporter=dot`
  - PASS: 1 file, 53 passed and the parent-only subprocess case skipped as
    designed; Vitest 18.85 seconds; shell 20.410 seconds.
- `npm exec -- vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=dot`
  - PASS: 1 file, 37/37; Vitest 19.38 seconds; shell 20.969 seconds.
- `npm exec -- vitest run src/lib/__tests__/db-postgres-client.test.ts src/lib/__tests__/tenant-session.test.ts --reporter=dot`
  - PASS: 2 files, 27/27; Vitest 1.20 seconds; shell 2.675 seconds.
- Supplemental readiness coverage:
  `npm exec -- vitest run src/lib/__tests__/db-postgres-client.test.ts src/lib/__tests__/db-ready-retry.test.ts src/lib/__tests__/db-ready-runtime-guard.test.ts src/lib/__tests__/tenant-session.test.ts --reporter=dot`
  - PASS: 4 files, 30/30; Vitest 3.24 seconds; shell 4.841 seconds.
- `npm run typecheck`
  - Final PASS: `tsc --noEmit --pretty false`, exit 0; 2.935 seconds with the
    warmed incremental cache. The earlier cold concurrent run also passed in
    24.5 seconds.
- `npm exec -- eslint src/lib/db/sqlite-g002-operation-permit.ts src/lib/__tests__/sqlite-g002-operation-fixtures.ts src/lib/__tests__/sqlite-g002-operation-permit.test.ts --max-warnings=0`
  - PASS: zero warnings, exit 0; 49.1 seconds under concurrent load.
- `npm run lint -- --max-warnings=0`
  - Final full-repository PASS: zero warnings, exit 0; 19.928 seconds.

### Corrected attempts retained as evidence

- The first focused invocation failed during `beforeAll`, before any test case,
  because the fixture imported `SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST` from
  `sqlite-schema-v1.ts`; that constant is owned and exported by
  `sqlite-schema-coordinator.ts`. Vitest reported one failed suite, 36 skipped,
  5.19 seconds. The initial PowerShell wrapper printed its timing after the
  native command without preserving `$LASTEXITCODE`, so the wrapper itself
  misleadingly exited 0. The import and wrapper were corrected before any gate
  result was accepted. The next focused run passed 36/36 in 14.46 seconds
  Vitest / 15.865 seconds shell.
- A later focused run was intentionally launched concurrently with typecheck,
  full ESLint and another Vitest lane. Its two-database byte/row immutability
  case exceeded Vitest's default 5-second per-test timeout under contention:
  35 passed, 1 timed out; Vitest 16.66 seconds; shell 18.335 seconds. No bound
  process remained. That bounded Windows filesystem proof now has an explicit
  15-second test timeout; the final isolated 36/36 result above is authoritative.

### Scope, preservation and cleanup gates

The evidence-boundary script ran these checks after the final gates and before
this receipt was created:

```text
git update-index --refresh
git diff-files --quiet
git diff-index --cached --quiet fb13a103153a970eb472d2f0b66d092940504135 --
git ls-tree -r fb13a103153a970eb472d2f0b66d092940504135
git ls-files -s
git status --porcelain=v1
rg -l 'sqlite-g002-operation-permit|createSqliteG002StorageOperationPermit|requireSqliteG002StorageOperationPermit' src [owned-file exclusions]
Get-ChildItem [resolved temp directory] for g006c2a-*, g006c0-* and g006c1-*
Get-CimInstance Win32_Process filtered to this exact worktree
```

Results:

- baseline/index Git blobs: 458 compared, 0 mismatches;
- tracked worktree versus refreshed index: identical;
- pre-receipt changed paths: exactly the three implementation/test paths;
- unexpected callsite files: 0;
- `g006c2a-*` temp roots: 0;
- old `g006c0-*` and `g006c1-*` temp roots: 0 each;
- worktree-bound processes: 0.

An earlier diagnostic used raw `git hash-object` without `--path` and therefore
misclassified six CRLF-smudged working-tree files as blob mismatches. Git status
reported them unchanged. The accepted preservation gate compares the baseline
tree to refreshed index blob IDs and separately requires a clean tracked
worktree, so repository clean filters are applied correctly.

## Dependency and activity record

Before producer dispatch, root ran `npm ci` in this exact worktree as task
environment preparation. It completed in 43.8 seconds, added 448 packages,
audited 449 packages and accessed the package registry through normal npm
installation traffic. The install occurred outside the producer's four-path
source implementation, but it is part of this task environment and is not
described as merely inherited evidence.

That preparation observed 14 dependency findings: 2 low, 1 moderate, 10 high
and 1 critical. No `npm audit fix`, dependency or lockfile change, advisory
remediation, paid service, provider API, customer-data access, production
mutation, deployment or remote Git operation occurred. After dispatch, the
producer implementation and this repair performed no further external or
blocked-root activity.

## Repair-1 P3 correction and validation

Repair baseline (pre-repair source): db501cced3ab4be459e9f5b7caad86da43ef65c5.
Repair commit (this receipt): 27582d1f9cb8702dba8c2b2231ece6b63627401c.

Repair-1 corrects two documentation findings only:

- the dependency/activity record now includes root's exact pre-dispatch
  `npm ci` and package-registry activity instead of describing the audit result
  as merely inherited; and
- the source comment and receipt now delimit previously verified binding facts
  from current database state and state the fresh atomic C2B/C revalidation
  obligation.

There is no runtime, type, API, permit, error, fixture or test behavior change.
The repair changes exactly the production-file comment and this receipt.

Repair validation:

- `npm exec -- vitest run src/lib/__tests__/sqlite-g002-operation-permit.test.ts --reporter=dot`
  - PASS: 1 file, 36/36; Vitest 14.82 seconds; shell 16.272 seconds.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, exit 0; 12.769 seconds.
- `npm exec -- eslint src/lib/db/sqlite-g002-operation-permit.ts --max-warnings=0`
  - PASS: zero warnings, exit 0; 58.372 seconds.
- TypeScript `transpileModule` with `removeComments: true` over the source file
  at `db501cc` and the repaired working copy produced identical output:
  SHA-256 `6c5925c31bd831eb6415d75246762a89de284423230027bb0ea282cb89b2f997`.
- `git diff --check`: PASS.
- repair delta from `db501cc`: exactly 2 paths; cumulative delta from
  `fb13a103153a970eb472d2f0b66d092940504135`: the original exact 4 paths.
- the original fixture blob `746d2bf58a9a1b1f8eac17fbbb382252ebc9e1ca`
  and focused-test blob `2979835a09bb7ad7982738e5cc762ef278154ee8`
  remain byte-identical.
- owned `g006c2a-*` temp residue: 0; worktree-bound processes: 0.

## Acceptance boundary

This receipt is implementation evidence, not authorization or self-acceptance.
The packet preserves all 318 implementation cards and leaves G-006C2 open for
the serialized C2B/C writers and independent review. G009/G010/G013 and the
accepted T012/T013 boundaries continue to own later interactive and worker
authority.
