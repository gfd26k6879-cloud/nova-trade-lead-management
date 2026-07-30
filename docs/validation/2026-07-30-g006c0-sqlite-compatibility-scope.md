# G-006C0 SQLite compatibility storage-scope validation

Date: 2026-07-30

Branch: `codex/nova-g006c0-binding`

Exact implementation baseline/control: `b79a10c7d97a82e65f77741aaa1410bc4d745cd6`

Authority is limited to the three new paths named in this receipt. This change
does not wire startup, modify a writer, create a fresh foundation, finalize a
schema, grant authentication or authorization, execute a provider, restore a
database, or perform remote, production, customer, paid, push, or deployment
activity.

## Result

G-006C0 adds a fail-closed storage-scope verifier with an explicit backend
union. Exact `{ backend: "postgresql" }` input returns a newly frozen exact-key
pass-through value without calling G-006B or consulting environment state.

Upgraded SQLite accepts only exact outer
`{ backend: "sqlite", lifecycle: "upgraded", replay }` input where `replay` is
the complete `SqliteG006bReplayInput`. Before G-006B reaches an asynchronous
boundary, C0 reads data-property descriptors and synchronously snapshots only
the primitive database/scope/play/handoff facts it may retain. Proxies,
accessors, non-plain prototypes, symbols, missing/extra outer keys, falsey
records, unknown backends/lifecycles, and execute/resume evidence reject closed.

C0 invokes the accepted `runSqliteG006bPreFinalization` itself. It never accepts
a caller-supplied result, receipt, binding hash, inferred path, latest record,
or default identity. Original G-006B errors pass through unchanged. Only exact
`replay` / `replayed` success with the expected PREPARED and COMMITTED handoff
IDs can mint a capability.

The minted value is frozen, fieldless, null-prototype, and privately registered
in a `WeakMap`. Spreads, copies, prototype-derived objects, proxies, and fresh
lookalikes have no authority. `requireSqliteCompatibilityScope` accepts an exact
plain `{ databasePath, tenantId, workspaceId }` expectation and returns a frozen
scope only on an exact match. Returned evidence contains the verified tenant,
workspace, owner, policy, fixed `google_places_legacy` source card, play/config
pins, handoff IDs, and canonical binding hash. It contains no database object,
manifest, database/backup/archive/record path, permission, actor, request, or
provider-execution authority; its three authority booleans are literal false.

Fresh SQLite accepts only exact `{ backend: "sqlite", lifecycle: "fresh" }`
input and throws `G006C0_FRESH_FOUNDATION_REQUIRED` without calling G-006B.
G-006C1 remains responsible for explicitly provisioning and verifying every
fresh tenant, workspace, owner membership/role, policy, source, play, catalog,
count/checksum, and zero-orphan fact. C0 creates or infers none and fabricates no
T-028 receipt.

## Closed C0 error taxonomy

- `G006C0_INPUT_REJECTED`
- `G006C0_FRESH_FOUNDATION_REQUIRED`
- `G006C0_CAPABILITY_REQUIRED`
- `G006C0_SCOPE_MISMATCH`

G-006B failures retain their original `SqliteG006bError` instance and code.

## Executable matrix

The focused test file contains 12 Vitest cases covering:

- explicit frozen PostgreSQL isolation with a G-006B invocation counter;
- real upgraded `delete/normal` and `wal/normal` execute, replay, capability
  mint, exact scope assertion, and restart reconstruction;
- unchanged main database, backup, PREPARED, COMMITTED, archive-parent, and all
  archive-child bytes plus volume/FileId across replay, with zero lock/temp
  residue;
- outer falsey, primitive, missing/extra, symbol/prototype, proxy, accessor,
  unknown backend/lifecycle, execute, and resume rejection;
- nested replay/manifest proxy and accessor rejection without getter execution
  or G-006B invocation;
- unchanged propagation of handoff, path, native identity, physical catalog,
  receipt, G-023 binding, configuration, preservation, journal, and raw record
  tamper errors;
- immediate caller mutation of database/scope/play input after invocation,
  proving the stored result uses the synchronous verified snapshot;
- typed fresh-foundation failure and rejection of receipt-shaped extra input;
- fieldless/deep-frozen authority, forged/spread/copied/prototype/proxy
  rejection, exact expectation keys, and cross-database/tenant/workspace
  mismatch;
- source-level absence of `getDb`, environment selection, initialization,
  schema, queries, app-users, actions/workers, or direct SQL execution.

## Observed validation evidence

Environment: Windows, Node 24.13.1, Next.js 16.2.6, Vitest 4.0.18,
better-sqlite3 12.9.0.

- Focused C0 gate:
  `npm exec -- vitest run src/lib/__tests__/sqlite-compatibility-scope.test.ts --reporter=dot`
  - PASS: 1 file, 12/12 tests, exit 0.
  - Vitest duration 156.47 seconds; test time 155.46 seconds; tool wall
    158.4 seconds.
- Frozen full G-006B gate:
  `npm exec -- vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts --reporter=dot`
  - PASS: 1 file, 71/71 tests, exit 0.
  - Vitest duration 924.47 seconds; test time 923.51 seconds; tool wall
    926.3 seconds.
- Coordinator/PostgreSQL-client/tenant-session regression gate:
  `npm exec -- vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts src/lib/__tests__/db-postgres-client.test.ts src/lib/__tests__/tenant-session.test.ts --reporter=dot`
  - PASS: 3 files, 64/64 tests, exit 0; duration 17.24 seconds.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, exit 0.
- `npm run lint -- --max-warnings=0`
  - PASS: full repository ESLint, zero warnings, exit 0.
- `npm run build`
  - PASS: production build, exit 0; compilation 7.7 seconds, TypeScript
    20.9 seconds, 11/11 static pages generated.
- `npm run db:verify:recovery`
  - PASS: all 37 application tables match SQLite schema and tracked migrations,
    exit 0.
- Pre-receipt residue audit:
  - PASS: zero `g006c0-*` task fixture roots in the system temporary directory.
  - PASS: zero G-006B lock/temp/staging residue in the worktree.

The first focused run passed 10/12 cases. One expectation incorrectly predicted
`G006B_RECOVERY_REQUIRED` for a trailing-byte COMMITTED record although the
accepted verifier correctly returned `G006B_EVIDENCE_DRIFT`. The other guard
matched JavaScript `Object.create` as SQL `CREATE`. Only those two test
expectations were corrected; production code and G-006B were unchanged. The
fresh focused run then passed 12/12. The first zero-warning lint run also found
one unused test import; removing that import produced the recorded clean lint.

## Scope and exclusion evidence

The implementation changes exactly these three new paths:

1. `src/lib/db/sqlite-compatibility-scope.ts`
2. `src/lib/__tests__/sqlite-compatibility-scope.test.ts`
3. `docs/validation/2026-07-30-g006c0-sqlite-compatibility-scope.md`

No existing file was edited. Git diff comparison with the control reports no
change to `index.ts`, `schema.ts`, `queries.ts`, `app-users.ts`, G-006B,
the G-006B PowerShell helper, the schema coordinator, actions, workers, routes,
package configuration, migrations, or recovery contracts. The final staged
audit passed before the single implementation commit:

- exactly three staged paths, all additions, with zero unexpected or missing
  paths;
- `git diff --cached --check` passed;
- the unstaged tracked diff was empty;
- no existing control blob was changed;
- zero `g006c0-*` task fixture roots and zero G-006B lock/temp/staging residue
  remained.

The known policy-blocked synthetic root
`C:\Users\Masih\AppData\Local\Temp\g006b-identity-cleanup-qjkSgV` was not read,
modified, deleted, or counted as task residue. No external service or production
system was accessed. This receipt is local implementation evidence, not
self-acceptance or activation authority.
