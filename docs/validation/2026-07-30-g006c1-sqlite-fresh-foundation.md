# G-006C1 SQLite fresh foundation validation

Date: 2026-07-30
Baseline and dispatch control: `b38641f707cadd97a5a740b76edba38f3a7937ae`
Branch: `codex/nova-g006c1-foundation`
Worktree: `C:\Users\Masih\Documents\NovaTradeWorktrees\g006c1-foundation`

## Result

G-006C1 adds an explicit, detached fresh-SQLite provisioning and verification
boundary. It does not wire startup or ordinary writers. The existing C0
`verifyCompatibilityScope`, `requireSqliteCompatibilityScope`, upgraded input
and storage-scope types, and exact typed `{ backend: "sqlite", lifecycle:
"fresh" }` rejection remain unchanged.

The new C0-facing API consists of:

- `provisionFreshSqliteCompatibilityScope`, which synchronously snapshots the
  complete caller input before the only dynamic import of the producer;
- `requireFreshSqliteCompatibilityScope`, which reveals only exact-selector
  storage evidence from a separate private fresh `WeakMap`;
- `FreshSqliteCompatibilityStorageScope`, which is distinct from the upgraded
  scope while using the same fieldless `SqliteCompatibilityBinding` type.

Fresh and upgraded bindings cannot cross their private state maps. The fresh
scope exposes no database object, path, receipt, manifest, request, session,
permission, actor capability, or provider executor. Its three authority flags
are exactly false and its authority label is `storage-scope-only`.

## Provisioning and proof contract

The fresh input is an exact descriptor-safe deep snapshot. It names the
canonical existing caller-owned database path; decimal device/FileId; DELETE or
WAL journal mode; all columns for one active tenant, active workspace, active
owner membership, current owner role binding, and tenant policy; the fixed
`google_places_legacy` card plus its canonical source hash; the accepted legacy
website play seed/id/version/configuration hash/binding ID; exact G006A staged
catalog/internal/physical/table-count/user-version pins; and caller-computed
policy, foundation, and canonical binding hashes. Accessors, proxies, symbols,
non-plain records, sparse arrays, missing or extra keys, source aliases, path
aliases, FileId replacement, deep mutation, and mismatched hashes reject before
authority can be minted.

The producer retains an `r+` descriptor and checks its identity against the
canonical path before, during, and after direct uncached SQLite connections.
One outer `BEGIN IMMEDIATE` contains the existing nested
`createFreshSqliteSchemaV1` transaction and exactly five explicit inserts:

1. `tenants`
2. `workspaces`
3. `tenant_memberships`
4. `tenant_role_bindings`
5. `tenant_policies`

The persisted state remains staged at `user_version=6001`. No final 6002
transition, T-028 receipt, source/play/location row, new schema object, SQL
default authority, or inferred identity is created. Every other one of the 37
application tables must have zero rows. The proof checks exact row values and
relationships, table counts, zero relationship and foreign-key orphans,
integrity, policy/foundation/source/play/binding hashes, catalog/internal and
physical digests, journal mode, and file identity.

Pre-commit errors roll back both schema and rows and never delete the caller
file. An exact staged foundation is an idempotent byte-identical replay. Empty,
partial, extra-row, different-row, noncanonical, or finalized staged state is
rejected without repair. After commit the writer closes and an independent
readonly connection repeats the full proof under the retained descriptor.
Writer close, verifier open/proof/close, final retained identity, and retained
descriptor-close uncertainty after commit produce the typed
`G006C1_COMMITTED_UNVERIFIED` error with `committed=true`,
`recoveryRequired=true`, deterministic primary evidence, and ordered cleanup
evidence.

Two actual Vitest subprocess race cases close the caller-collision matrix. Two
same-input callers serialize to exactly one `provisioned` and one `replayed`
result. Two different-input callers serialize to exactly one `provisioned`
winner and one `G006C1_FOUNDATION_MISMATCH`; replay of the winner is
byte-identical. The test-only hold is fieldless, accepted only under
`NODE_ENV=test`, carries no storage authority, and creates no persistent lock.

The readonly proof-to-C0 mint path is synchronous after the dynamic import:
there is no JavaScript await or local event-loop interleaving between the
completed proof, exact result validation, and private-map mint. The capability
attests the exact verified storage snapshot; it is not an indefinite database
lease and does not block later authorized storage evolution.

## Focused validation matrix

Command:

`npx vitest run src/lib/__tests__/sqlite-fresh-compatibility-scope.test.ts --reporter=dot`

- PASS: 1 file, 50 tests passed and one internal subprocess-worker case
  skipped in the parent process; Vitest duration 11.24 seconds.
- The worker case ran successfully inside four child Vitest processes owned by
  the two parent race tests.
- Coverage includes exact fresh creation, five-row/37-table state, DELETE and
  WAL, readonly replay, byte identity, fieldless scope, cross-map denial,
  selector mismatch, forged/copied capabilities, outer/deep accessors,
  proxies, symbols, non-plain records, missing/extra keys, path aliases,
  expected and replaced FileIds, journal mismatch, policy/foundation/binding
  hashes, source aliases/hash, play seed/configuration/binding, 6002 pin denial,
  partial/final/empty/extra/different staged states, caller-file retention,
  precommit rollback, deterministic cleanup evidence, six postcommit
  uncertainty points, caller mutation after invocation, immediate-lock
  contention, simultaneous same-input callers, simultaneous different-input
  callers, and zero source/play/T-028/location rows.

## Observed regression and build evidence

Environment: Windows, Node 24.13.1, Next.js 16.2.6, Vitest 4.0.18,
better-sqlite3 12.9.0.

- Existing C0:
  `npx vitest run src/lib/__tests__/sqlite-compatibility-scope.test.ts --reporter=dot`
  - PASS: 12/12; Vitest 158.73 seconds; shell 160.6 seconds.
- G006A coordinator:
  `npx vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=dot`
  - PASS: 37/37; Vitest 17.98 seconds; shell 19.7 seconds.
- PostgreSQL client/readiness and tenant session:
  `npx vitest run src/lib/__tests__/db-postgres-client.test.ts src/lib/__tests__/tenant-session.test.ts --reporter=dot`
  - PASS: 2 files, 27/27; Vitest 3.02 seconds.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, exit 0.
- `npm run lint -- --max-warnings=0`
  - PASS: full repository ESLint, zero warnings, exit 0.
- `npm run build`
  - PASS: Next.js production build; compile 4.1 seconds, TypeScript 11.3
    seconds, 11/11 static pages.
- `npm run db:verify:recovery`
  - PASS: all 37 application tables match the SQLite schema and tracked
    migrations.

### Inherited G006B disclosure

The mandatory full inherited G006B command was run with a bound longer than its
accepted 924.47-second reference:

`npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts --reporter=dot`

- The completed run reported 70/71 passed in 934.98 seconds. The sole failure
  was the inherited Windows two-publisher test: `OpenSettledRead` received
  Win32 error 32 (sharing violation) on its disposable `identical.json`.
- An immediate exact-name rerun of only
  `reconciles identical two-publisher races and rejects different-byte races`
  passed in 2.708 seconds (Vitest 6.90 seconds, 1 passed / 70 skipped).
- No G006B implementation, helper, test, or durable fixture was changed. The
  full-run result is disclosed as 70/71 plus the targeted pass; it is not
  represented as an unqualified fresh 71/71 full pass.
- Two earlier runs had only harness timeouts at 304.05 and 724.04 seconds,
  before the accepted baseline duration; neither produced a test verdict and
  neither is classified as a product test failure.

## Scope, protected blobs, and residue

The intended implementation delta is exactly four paths:

1. `src/lib/db/sqlite-compatibility-scope.ts`
2. `src/lib/db/sqlite-fresh-compatibility-scope.ts`
3. `src/lib/__tests__/sqlite-fresh-compatibility-scope.test.ts`
4. `docs/validation/2026-07-30-g006c1-sqlite-fresh-foundation.md`

No startup, route, action, worker, PostgreSQL, package, lockfile, migration,
schema, query, G006A, G006B, helper, app-user, recovery-contract, source-card,
play, or location implementation path is edited. `getDb()` and
`ensureDbReady()` remain disconnected. No push, merge, deploy, production
mutation, external service, credential, or self-acceptance occurred.

The final fixture audit found zero `g006c1-*` roots and no owning G006B or C1
process. Two exact G006B full-suite roots created by the harness timeouts remain
recoverable in `%TEMP%`:

- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-ZKgBDT`
- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-Y18U0Y`

Both roots were verified as exact task-pattern directories under `%TEMP%` with
no owning process. Native PowerShell cleanup was attempted only after path and
descendant containment checks; local destructive-action policy rejected both
the recursive and bottom-up guarded forms. No alternative deletion mechanism
was used. Therefore the zero-new-residue gate is not claimed as passing.

The separate known policy-blocked
`g006b-identity-cleanup-qjkSgV` root was excluded by exact name from audits and
was not opened, modified, deleted, or counted as this task's residue.

This is local producer evidence only. It does not authorize acceptance,
integration, startup wiring, activation, push, deployment, or external work.
