# G-006A SQLite fresh schema and whole-schema coordinator preparation

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Accepted code baseline: `a7c296298bf33f1cfb670741863c0ffe1629002c`

Dispatch/control head: `88e49440d2ff52b4db249bd199b2b2a3547fe9a3`

Rejected round-0 source: `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2`

Rejected round-1 source: `ff479d95ef624996b019968a489917a740ec2071`

Rejected round-2 source: `868efdcda51c07da26f9b75fa0f34528126fb328`

Rejected round-3 source: `b2843b8bff6d44d2861318c9523fe8780f12395e`

Rejected round-4 source: `c23d280773f1594c7a2a28598bf5dd0c780f1440`

Rejected round-5 source: `9756f93ff6d296c851539f2486ebe48ac4838d28`

## Result

G-006A is prepared locally as an inert, deterministic SQLite final-catalog
artifact plus a whole-schema coordinator. It is not wired into `getDb()`,
startup, normal writes, recovery, or any runtime route. This producer did not
perform a destructive legacy finalization, push, deployment, acceptance, or
external mutation.

The final catalog contains exactly the existing 37 application tables. The
T-028 `compatibility_backfill_receipts` table is included with its accepted
binding and append-only guards; no 38th coordinator or control table was
introduced. Durable coordinator state is represented only by an exact catalog
digest paired with a rigorously checked `PRAGMA user_version`.

The private catalog constructor transforms exactly these 17 non-audit T-028
operational tables:

```text
settings
user_market_access
leads
place_cache
places_master
place_observations
api_usage_events
ai_usage_events
crawl_runs
crawl_units
lead_notes
outreach_events
admin_requests
demos
ai_lead_verifications
lead_ai_artifacts
ai_feedback_events
```

`audit_logs` remains an explicit non-authorizing history exception and is not
transformed. It is still covered by preservation checks. No application seed,
tenant, workspace, owner, or source identity is inferred or defaulted. The old
unscoped `settings` seed is absent from the final SQL.

## Frozen catalog boundary

The constructor accepts only the repository's exact frozen `SCHEMA_SQL`:

- accepted source digest:
  `b47346d186f2768f577b6e9b52f6112ee09c5d94b05aad3ef31303343c07a8f8`
- final SQL definition digest:
  `fd28b893542b08248df08f58706f2947d1c3bef5aeecf920ee19ea2eeeb280d2`
- exact SQLite catalog digest:
  `080477dd8fce09c3e8d8ca7461f2bc0a8b2222edab26afe7297367bdfe6362cf`
- exact physical metadata manifest digest:
  `07e10bb5c43d98d6f561d3c0b0f9f39a9ad2d579ed1a73b9e2a7a455367fdf79`
- accepted T-028-prepared legacy catalog digest:
  `07091889ff9806c20356f092d3812ff325f22537c63a56149eea7dab0a529ade`
- accepted T-028-prepared legacy SQLite-internal catalog digest (53 rows):
  `eb29b4dec23fa7311cd93c298515b871b94fe109d00a3d9db149ef6726f1637c`
- exact G-006B prepared-legacy application-catalog digest:
  `11db5719be3e6d3b0bb9a11111d867235f2837ed02a23b3af4901fd7690e3cbb`
- exact G-006B prepared-legacy SQLite-internal catalog digest (53 rows):
  `eb29b4dec23fa7311cd93c298515b871b94fe109d00a3d9db149ef6726f1637c`
- exact G-006B prepared-legacy physical-manifest digest:
  `90117968b064e6bded92dbf82c18fffa31951c0998c727f662eee56e78721ba6`
- exact staged/final SQLite-internal catalog digest (57 rows):
  `2d866e21e5a30454bcfb7ea709aac96cdda17a1e7ab813b7e161265c0a060844`

One ordered read of every `main.sqlite_schema` row is partitioned in JavaScript
by the case-insensitive literal `sqlite_` prefix. The application and internal
sets are therefore exhaustive and disjoint without relying on SQLite LIKE
wildcards or `case_sensitive_like`. Non-string schema identities reject closed.
The internal-catalog digest covers each internal row as the exact `type`,
`name`, `tbl_name`, and SQL tuple, in binary type/name/table order. It
intentionally excludes unstable root-page numbers. Raw `SCHEMA_SQL` alone
produces 51 rows and digest
`19fac76630dc9db2dcbc4654958e3def38a1dd416e01107832ad5d452f69b823`;
that intermediate shape is evidence, not an accepted source state. ANALYZE
contamination produces explicit unknown-state evidence (`sqlite_stat1` and
`sqlite_stat4`): 55 rows and digest
`21d42cd8a262f076a2535d5994f4490c90e4a78af7772ded610f854d15bd4436`
over the accepted legacy source, or 59 rows and digest
`8d1b322b9f0a25edc9192522d7593265c76c302dcecf2d1d5bafd71b57726c42`
over the target. Both are rejected before either digest can authorize any
transition.

Every named table and replacement anchor has exact per-table cardinality.
Construction fails immediately if the frozen source, table set, or anchor
shape drifts. The definition digest is a literal production pin and the
generated definition is asserted against it during module construction; it is
not computed into its own accepted value. Post-construction checks require
exactly 37 table definitions,
all 17 tenant columns, the expected source/location scope, the exact
null-workspace user-market unique-index family, and removal of the superseded
unscoped keys and indexes. The transformer is private; the module does not
expose a general-purpose or runtime SQL rewriter.

The catalog mirrors the accepted G-002 through G-005 tenant/source structure
and G-006R logical identity. In particular, it includes compound tenant parent
keys and foreign keys, fixed `google_places_legacy` source identity, scoped
place/cache/observation/usage keys and indexes, and both physical SQLite
partial unique indexes required for nullable `user_market_access.workspace_id`.
SQLite delete triggers implement the accepted column-list `SET NULL` behavior
for optional references while retaining the required tenant component.

## Coordinator states and activation gate

- `fresh`: empty catalog at `user_version=0`. The coordinator installs the
  exact catalog in one `BEGIN IMMEDIATE` transaction and records staged
  `user_version=6001`.
- `accepted-legacy`: exact T-028-prepared legacy catalog at `user_version=0`.
  G-006A does not migrate or rebuild it by itself.
- `prepared-legacy`: exact G-006B-prepared legacy catalog at
  `user_version=6000`, with nullable `source_card_id TEXT` on only
  `place_cache`, `places_master`, `place_observations`, and
  `api_usage_events`; `crawl_units.location_mode` remains absent. Recognition
  requires the exact application, internal, and physical pins and reports the
  exact 31/32 target-column shape.
- `staged`: exact final catalog at `user_version=6001`.
- `final`: exact final catalog at `user_version=6002`.
- `unknown`, `partial`, and `drift`: rejected closed with no mutation.

Whole-schema finalization requires an opaque later-finalizer capability whose
state exists only in a private `WeakMap`. Minting accepts an exact canonical
existing file path, exact non-empty handoff binding ID, target digest, and a
finite plain declarative operation plan. It independently opens the exact file
read-only, first retains a private mint-time filesystem descriptor lease, then
uses a separate inspector to verify the connection boundary and source health.
Capability state captures source kind/user version/catalog and internal-catalog
digests, the complete physical-manifest digest, and the exact all-37
preservation snapshot. The inspector closes, but the mint-time descriptor stays
open through writer commit and fresh verification. No caller database handle
is accepted or retained.

The operation plan is a closed discriminated union: single-statement
create-table/index/trigger; insert/update/delete with scalar binds; and
identifier-validated drop/rename operations. A single typed internal
`restore-autoincrement-high-water` operation is available only after a
validated rebuild of the sole catalog AUTOINCREMENT table,
`tenant_deletion_checkpoint_events`; arbitrary SQL can never write
`sqlite_sequence`. Minting inspects own property
descriptors, rejects accessors, proxies, functions, async/thenable values,
symbols, unknown keys, non-plain prototypes, malformed arrays, and non-scalar
bind objects, and clones byte binds. Declared array lengths are rejected before
descriptor enumeration, proportional allocation, iteration, or `Set`
construction: plans are capped at 4,096 operations and each bind list at
32,766 values. It freezes a deep private copy; no caller
object, callback, method, thenable, closure, or mutable bind reference enters
capability state or the transaction.

A private lifecycle transitions `READY` to `CONSUMING` synchronously before
post-handoff validation and reaches one terminal state on every success or
failure path. A recognizably conveyed capability and its retained root lease
are claimed before coordinate options are inspected, so unknown options,
accessors, proxies, and fake boundaries consume and terminalize that authority.
An authority hidden behind an accessor or proxy is neither inspected nor
seized. Only an exactly `undefined` handoff selects replay. Runtime `null`,
`false`, numeric zero or negative zero, zero BigInt, `NaN`, and empty string enter
handoff validation and reject before options, path, or lease work. Copies,
spread/prototype forgeries, path aliases, path or binding
mismatch, cross-file use, plan failure, and second use reject closed and cannot
retry with the same token. The exported cancellation operation deterministically
disposes an unused capability; a `FinalizationRegistry` fallback holds only the
minimal descriptor lease, uses a unique unregister token, and cannot retain the
capability. Descriptor close is idempotent, clears its numeric descriptor
before attempting close, and never retries that descriptor. Minting records
exact physical file identity as BigInt `dev` plus `ino`; content-identical
same-path clones are different files and reject before plan execution. Each
private SQLite open acquires a separate coordinator-owned descriptor lease,
proves descriptor/path identity, opens its own exact-path connection, and
proves the same identity again. Identity is rechecked at every transaction and
verifier phase, and every descriptor and SQLite connection closes
deterministically. The separate-writer
replacement-exclusion proof relies on Windows/NTFS SQLite open-handle behavior,
so this preparation fails closed with `G006A_FILE_IDENTITY_UNAVAILABLE` on
other platforms. The coordinator opens its own exact-path writer,
acquires `BEGIN IMMEDIATE`, and revalidates every mint-time source invariant and
snapshot under the lock before executing the private plan. A quote/comment-
aware token scanner denies transaction/savepoint control, PRAGMA,
`writable_schema`, ATTACH/DETACH, VACUUM, catalog targets, TEMP/TEMPORARY, and
qualified or attached-schema routes. Every `sqlite_*` identifier is rejected
globally, including quoted identifiers and trigger bodies. Each statement is revalidated and
compiled with single-statement `prepare` before execution. The coordinator
alone controls `user_version`, commit, and rollback.

Every inspector, writer, and verifier requires `database_list` to contain only
the exact `main` file plus SQLite's optional empty `temp` entry, and requires
zero `sqlite_temp_schema` objects. The only test boundary is an opaque token
with a closed enumerated internal fault mode; it cannot carry a callback,
connection, path, or arbitrary success result. This remains a local
program-integrity boundary only. G-006B/C still own the receipt/sidecar
authority that permits a real handoff.

The compatibility receipt remains evidence bound by later work; its presence
does not authorize a tenant choice or catalog transition. The coordinator does
not interpret it as authority.

Prepared-legacy recognition is classification only. Fresh construction,
later-finalizer capability minting, and the current whole-upgrade coordinator
all reject it without mutation. Capability state remains restricted to
`accepted-legacy` and `staged`; no writer predicate, handoff, backup, sidecar,
transaction, startup, recovery, or runtime activation path was added.

At capability minting, the coordinator snapshots all 37 application
tables. For every table it records the complete source-column order, row
count, and deterministic type-tagged canonical row-payload digest. This
includes platform/reference tables, ZIP rows, `audit_logs`, the receipt table,
and existing T-028 tenant/workspace values. A final catalog may add
migration-owned columns, but it cannot remove or change any source-state value.

SQLite-owned state is a separate exact invariant. At capability mint, under
the writer lock, after plan execution, before commit, after commit, on the
fresh verifier, and during replay, the coordinator requires both the pinned
complete SQLite-internal catalog and the canonical `sqlite_sequence` table
schema and exact BigInt-safe row set. Sequence validation reads `COUNT(*)` and
`MAX(id)` independently as exact decimal text and verifies SQLite's reported
MAX type. Any nonempty AUTOINCREMENT table requires its sequence row, even when
its maximum ID is zero or negative. Unknown or duplicate names,
non-integer/negative/out-of-range sequence values, or high-water below
`max(0, MAX(id))` reject closed. The only permitted rebuild restoration is
copied from the private mint-time snapshot; historical high-water above current
rows is preserved exactly.

Before plan execution under the owned writer lock, it requires the exact
mint-time state, user version, catalog, physical metadata, all-table payloads,
and healthy FK/integrity results. Before commit it again requires identical
all-table payloads and counts, exact catalog and physical metadata, an empty
`foreign_key_check`, and `integrity_check=ok`. Normal plan or validation failure
rolls back the owned transaction and the writer closes exactly once. The first
plan, validation, open, commit, or post-commit failure remains primary;
coexisting rollback, database-close, descriptor-close, capability-terminal,
and root-close failures are retained in ordered `g006aCleanupFailures`
diagnostics. Cleanup-only failure is surfaced directly, rollback is attempted
only before commit while a transaction is open, and no rollback runs after a
successful commit. A writer-close failure after commit is therefore reported
as committed-unverified. After
commit the writer closes, then the coordinator opens a distinct fresh read-only
connection to the exact canonical file path and rechecks final state/user version/catalog,
37-table and target cardinalities, the pinned full table/index/index-xinfo/
partial-predicate/FK manifest, all-table preservation, FK health, and
integrity. On that same connection it validates nonnegative safe-integer
`main.data_version` immediately before `BEGIN DEFERRED`; every logical,
catalog, manifest, preservation, sequence, health, connection, TEMP,
writable-schema, and identity check then runs inside that one read snapshot.
After read `COMMIT`, the immediately adjacent same-connection data-version
sample must be unchanged. This detects a separate WAL commit anywhere from the
pre-BEGIN sample through read COMMIT; a commit after the post-sample is outside
the returned verification interval. Descriptor/path identity is rechecked
after every verifier phase, again after the post-sample, and once more from the
retained mint-time descriptor after the verifier closes. A pre-COMMIT verifier
error rolls back its read transaction; rollback, close, and final-root cleanup
failures never replace the primary failure. Only this verification can return
`finalized`. A post-application-commit verification failure throws the distinct
`committed-unverified-recovery-required` outcome and never claims rollback.
Replay uses the same self-baselined read-only verifier and read transaction
under one retained root lease, with no writer or writable gap; replay drift is
an ordinary noncommitted error. In-memory finalization fails closed.

## Local validation evidence

- `npm exec vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts`
  - PASS: 1 file, 37/37 tests, final G-006A-P run 22.60 s.
  - Covers deterministic fresh construction, exact catalog metadata, tenant
    and source key enforcement, both nullable-workspace unique identities,
    cross-tenant and invalid-source rejection, all coordinator classifications,
    descriptor-level hostile-plan rejection, callback/raw-handle structural
    exclusion, caller-plan and byte-bind copying, opaque one-shot identity,
    path alias/binding/cross-file/failure reuse rejection, every forbidden SQL
    family including TEMP and qualified schemas, mint-time row/value/table/
    catalog/index/user-version drift, connection-list/temp-schema guards, normal and accepted-
    legacy rollback/restart, all-37 preservation, close/reopen finalization,
    committed-unverified reporting, persistent physical-index spoof rejection,
    exact and poisoned same-path clone swaps, deterministic unsafe-integer
    BigInt identity comparison, retained capability-root lease ordering,
    deterministic unused-capability cancellation, terminal close after every
    ownership/failure/success path, full SQLite-internal catalog pins, ANALYZE
    poisoning at mint/lock/replay, late-verifier replacement/removal reporting,
    capability consumption before hostile options inspection without touching
    accessor/proxy-hidden authority, exhaustive case-insensitive literal-prefix
    partitioning of `sqlite`, `sqliteX`, `SQLITEX`, `sqlite_`, and `SQLITE_`
    names, pre-existing and plan-created table/view/trigger/index rejection,
    one explicit fresh-verifier read transaction, concurrent WAL mutation and
    exact `main.data_version` 2-to-3 detection for both finalization and replay,
    global direct/quoted/trigger-body `sqlite_*` denial, exact
    `sqlite_sequence` poison detection including zero/negative-ID nonempty
    tables, legitimate historical AUTOINCREMENT high-water rebuild and
    restoration, pre-allocation huge sparse-array bounds, single-read-only-
    verifier replay, row-count/payload/FK/integrity guards, exact-undefined
    replay selection with the complete malformed-falsey matrix rejected before
    options/path/lease work, writer-open/rollback/close primary-failure
    precedence, ordered cleanup diagnostics, real-cleanup sentinel boundaries,
    exact-once writer close, and committed writer-close recovery by later
    read-only replay, exact G-006B prepared-legacy recognition at version
    6000 with 31/32 target columns, exact application/internal/physical pins,
    nullable source-column type/default/nullability and table placement,
    `location_mode` absence, cross-catalog and wrong-version rejection,
    missing/wrong/additional column/index/trigger/check rejection, isolated
    ANALYZE internal-catalog and physical index-xinfo spoof rejection, and
    mutation-free fresh/mint/whole-upgrade rejection with exact lease cleanup.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, final run 4.7 s.
- `npm run lint`
  - PASS: full repository ESLint, final run 95.3 s.
- `npm run db:verify:recovery`
  - PASS: all 37 application tables match SQLite schema and tracked
    migrations, 1.7 s.
- `git diff --cached --check`
  - PASS: no whitespace errors.
- `git diff --cached --name-only` plus `git diff --name-only`
  - PASS: only modified paths inside the four-path G-006A authorization are
    staged and there is no unstaged delta.
- Task residue checks
  - PASS: zero `novatrade-g006a-*` temporary directories and zero lingering
    task Vitest, ESLint, TypeScript, or recovery-verification processes.
- Runtime: Node.js `v24.13.1`.

The first focused Vitest attempt stopped during module import because the
source guard counted a shared replacement anchor globally across two tables.
The guard was corrected to extract each exact named table block and enforce
anchor cardinality within that block. The fresh focused run then passed all
9 tests. No catalog SQL or accepted digest was weakened to resolve the defect.

After the final-replay health guard was strengthened, one intermediate focused
run expected an FK-health error while its fixture was still correctly
classified as staged and therefore stopped earlier at the required finalizer
gate. The fixture was marked with the final user version so that it exercised
the intended replay-health path; the subsequent fresh run passed all 9 tests.

## Repair round 1 notes

Round-0 source `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2`
was rejected because it exposed the raw database handle to a copyable
capability callback, preserved only selected tables, trusted same-connection
final checks, and computed its accepted definition digest from the generated
value. Repair round 1 replaces each of those boundaries while retaining every
catalog and tenant/source invariant.

The first complete repair-focused run passed 13/14 tests. The only failure was
the adversarial test fixture: Better SQLite safety mode correctly refused the
fixture's deliberate `sqlite_schema` spoof before the coordinator ran. Unsafe
mode is now enabled only while constructing that synthetic persisted spoof and
is disabled immediately afterward. The isolated spoof regression and fresh
complete matrices then passed. No production guard, catalog pin, or finalizer
boundary was weakened.

## Repair round 2 notes

Round-1 source `ff479d95ef624996b019968a489917a740ec2071` was
rejected because the coordinator still accepted a caller-owned writable
database handle and invoked arbitrary caller JavaScript inside its transaction.
Repair round 2 removes the callback/session mechanism entirely, replaces it
with the copied declarative plan above, and makes inspection, writing, locking,
rollback, close, and post-commit read-only verification coordinator-owned.

The first complete round-2 focused run passed 16/18 tests. Both failures used
the same persistent partial-index spoof fixture without the probe rows needed
for SQLite `integrity_check` to distinguish forged catalog SQL from the actual
index predicate. The two null/non-null workspace probe rows from round 1 were
restored, and source health is now revalidated under `BEGIN IMMEDIATE` before
any plan operation. The fresh 18-test matrix then passed. No production
catalog, manifest pin, SQL denial, or connection boundary was weakened.

## Repair round 3 notes

Round-2 source `868efdcda51c07da26f9b75fa0f34528126fb328` was
rejected because the capability was bound to path and content rather than exact
physical file identity, finalizer SQL could address SQLite-owned objects,
`sqlite_sequence` was outside the preservation contract, and hostile array
lengths were bounded only after proportional inspection. Repair round 3 adds
the BigInt physical identity/lease protocol, exact SQLite-owned-state snapshots
and typed AUTOINCREMENT high-water restoration, global `sqlite_*` rejection,
and pre-inspection length bounds while retaining the declarative one-shot
capability and all prior catalog/preservation invariants.

The first expanded round-3 focused run passed 20/23 tests. Two adversarial
fixtures had bound JavaScript numbers into no-affinity `sqlite_sequence`,
correctly producing REAL rather than INTEGER values; they now bind BigInt. The
third failure exposed an overbroad trigger scanner that rejected canonical
table-alias column references. The scanner now distinguishes trigger-body
schema routes from ordinary alias expressions while continuing to reject
attached targets and every `sqlite_*` token. One subsequent run exposed a
nonportable test assumption that every NTFS inode exceeds
`Number.MAX_SAFE_INTEGER`; deterministic colliding high-BigInt identities now
exercise the exact comparison directly, while real clone swaps still exercise
the filesystem boundary. The fresh 23-test matrix then passed. No catalog pin,
physical manifest, preservation check, or SQL denial was weakened.

## Repair round 4 notes

Round-3 source `b2843b8bff6d44d2861318c9523fe8780f12395e` was
rejected because the capability did not retain its mint-time filesystem
descriptor through commit and fresh verification, SQLite's complete private
catalog was not pinned, sequence validation could miss nonempty zero/negative-ID
tables, and identity was not rechecked across every verifier phase and the
final return gap. Repair round 4 adds the persistent root lease with explicit
cancel plus GC fallback, the synchronous lifecycle, exact full internal-
catalog pins, independent exact BigInt COUNT/MAX validation, phase-by-phase
verifier identity checks, and one self-baselined read-only replay verifier.

The first expanded round-4 focused run failed all 29 tests because the
JavaScript source string for SQLite's canonical `ESCAPE '\\'` clause contained
one runtime backslash too few, so SQLite rejected the escape expression before
classification. The source literal was corrected without changing the query,
catalog pins, or accepted states. The subsequent complete matrix passed 29/29,
and the final matrix after cleanup passed 29/29 again.

## Repair round 5 notes

Round-4 source `c23d280773f1594c7a2a28598bf5dd0c780f1440` was
rejected because coordinate options were inspected before a recognizable
capability was claimed, unescaped underscore wildcards left `sqliteX...`
objects outside both schema partitions, and fresh-verifier logical reads were
not one coherent snapshot guarded against concurrent WAL commits. Repair round
5 claims authority before options inspection, partitions every
`main.sqlite_schema` row by the literal case-insensitive `sqlite_` prefix, and
runs every read-only verifier check inside one data-version-guarded
`BEGIN DEFERRED` transaction.

The first expanded round-5 matrix passed 31/32 tests. Its only failure was the
new lease-audit expectation, which included mint events even though the test
intentionally reset the audit after mint; the expectation was corrected to the
writer, verifier, and retained-root close interval. The stronger prefix matrix
then exposed a test-fixture collision because SQLite identifiers are
case-insensitive, so `sqliteX...` and `SQLITEX...` with identical suffixes name
the same object. Distinct suffixes now exercise `sqlite`, `sqliteX`, and
`SQLITEX` application prefixes without changing production partition logic.
The resulting 32-test matrix passed. No catalog pin, accepted state, SQL denial,
or preserved payload rule was weakened.

## Repair round 6 notes

Round-5 source `9756f93ff6d296c851539f2486ebe48ac4838d28` was
rejected because truthiness allowed falsey malformed handoffs to enter replay,
and writer rollback or close cleanup could replace the original operation
failure. Repair round 6 makes only exact `undefined` select replay and applies
the established ordered cleanup-diagnostic contract to writer rollback/close,
writer-open cleanup, verifier cleanup, capability registration/cancel/claim/
terminalization, connection cleanup, and partial descriptor cleanup.

Closed test-only modes execute a real rollback or close, verify the resource is
no longer active, and only then raise a fixed sentinel. Duplicate primary-key
plans prove the original `SQLITE_CONSTRAINT_PRIMARYKEY` code and UNIQUE message
survive rollback and close sentinels while the database remains staged and
unchanged. A cleanup-only writer-close sentinel after a successful commit is
reported committed-unverified, leaves the database final, and permits later
read-only replay. The first expanded round-6 matrix passed 34/34; no production
guard was weakened to obtain that result.

## G-006A-P prepared-state recognition notes

Immutable source `87795a7ade9eb8ce51ee249d8adc7ac3e3d34341` did not
recognize the externally prepared G-006B state. G-006A-P adds only the exact
`prepared-legacy` classifier prerequisite at `user_version=6000`. Its catalog
is the accepted T-028 legacy shape plus nullable `source_card_id TEXT` on the
four named source tables and no `crawl_units.location_mode`, producing exactly
37 application tables and 31/32 target columns.

The application, complete 53-row SQLite-internal catalog, and physical manifest
are independently literal-pinned. The hostile matrix rejects missing, wrong-
typed, non-null/defaulted, checked, misplaced, and additional columns;
additional indexes/triggers; the otherwise missing location-mode column;
wrong and cross-catalog versions; ANALYZE statistics; and a catalog-spoofed
index whose physical xinfo differs. Fresh creation, capability minting, and
whole-upgrade rejection leave the recognized file unchanged and close every
coordinator-owned descriptor and connection in the expected order. All prior
34 focused tests remain green. No mutation or activation authority was added.

The initial pin-derivation run intentionally compared the canonical fixture
against placeholder literals, exposing all three actual digests. That run also
showed that the existing final-schema partial-index spoof helper did not apply
to the accepted legacy catalog. The prepared-state physical-only adversary now
rebuilds the existing `idx_leads_score` with a different index column while
restoring its catalog SQL, so the application and internal pins remain exact
and only index xinfo changes. The targeted prepared matrix and subsequent full
37-test matrix passed.

All database exercises used in-memory or task-owned temporary file-backed
SQLite instances with synthetic rows. Every temporary directory and verifier
connection was closed and removed. No legacy file was rebuilt, no backup or
recovery fixture was altered, no Docker resource was created, and no customer,
credential, provider, paid, remote, or production system was accessed. G-006A
remains preparation only; G-006B/C, startup activation, recovery reconciliation,
and later acceptance remain out of scope.

## G-006B-B2 private coordinator finalization receipt

Date: 2026-07-31

The coordinator now exposes one narrowly typed G-006B finalization entry point.
It accepts only the opaque runtime capability minted after G-006B has
authenticated B1 and durably published B2 PREPARED. The weak-map capability is
claimed before evidence validation and is terminal on success or failure.
Forged direct calls fail with `G006B_STATE_REJECTED`; no generic database,
transaction, SQL-plan, callback, or lease API was added.

For this one boundary the coordinator retains exclusive ownership of an
independent exact-path root lease, writer, `BEGIN IMMEDIATE`, commit, close,
and read-only reopen. G-006B continues to own the separate Windows native
no-replace lease, lock, evidence artifacts, and terminal settle. The cyclic
module binding is live only at call time and the focused direct-bypass test
loads both modules and rejects a forged capability.

The fixed finalization rebuild set is 19 tables: all 17 schema-v1 transform
tables plus the two source-proven transitional shapes,
`tenant_policies` and `compatibility_backfill_receipts`. The only permitted
column delta is addition of `crawl_units.location_mode='legacy_zip'` and
removal of receipt-bound `tenant_policies.compatibility_policy_hash`.
Canonical application indexes and triggers are recreated from
`SQLITE_SCHEMA_V1_SQL`; the final catalog, internal catalog, physical manifest,
37-table set, row counts, canonical payloads, SQLite-owned state, health, and
file identity are verified before commit and again after reopen.

Observed local validation:

- Full `sqlite-g006b-pre-finalization.test.ts` plus
  `sqlite-schema-coordinator.test.ts`: 111/111 passed, exit 0, 1051.90 seconds.
- Focused execute/resume/replay plus forged-boundary matrix: 3/3 passed, exit 0.
- Node 24.13.1 TypeScript no-emit check: passed.
- Focused ESLint for both source files and both test files: passed with zero output.
- Diff whitespace check: passed.

This remains an artifact-only finalization capability. It does not wire
startup, activate the database, authorize providers, or expand G-006A's
existing general finalizer surface. No external or production activity
occurred.

## G-006B-B2 preservation-binding repair

The first immutable finalization source,
`5d246fa477fffd9abb8615862f76e8836c1b0f7a`, was independently rejected by
architecture, security, and quality review. The decisive defects were that the
post-commit verifier compared only the projected `tenant_policies` columns and
row count rather than its retained payload, and that the coordinator no longer
reproved the authenticated B1 preservation aggregate inside its own
`BEGIN IMMEDIATE` transaction. That source remains preserved as rejected
history and is not accepted by this receipt.

The repair derives a full compatibility-column-excluded tenant-policy
projection from the retained, authenticated B1 backup. B2 PREPARED binds both
the G-006B domain payload hash and the coordinator-compatible payload digest.
Exact PREPARED validation independently re-derives that projection from the
backup on execute, resume, and replay. The opaque handoff carries only the
bound digest.

After acquiring its exact-path root lease, opening the writer, and entering
`BEGIN IMMEDIATE`, the coordinator now recomputes the complete B1
37-application-table preservation aggregate. It excludes only the four
B1-added `source_card_id` columns that were absent from the accepted legacy
baseline. The aggregate must match the authenticated B1 pin before any rebuild.
The coordinator then captures the B2 preservation projection and requires the
tenant-policy payload digest to match B2 PREPARED before mutation. The
post-settle verifier compares the complete retained policy projection again.

The repaired negative coverage rejects wrong B2 PREPARED and COMMITTED handoff
pins, rejects a changed retained tenant-policy payload during
committed-unverified resume, preserves the absent B2 COMMITTED artifact on that
rejection, and rejects null-prototype, frozen-plain-object, and proxy handoff
forgeries through both private entry points.

Observed Windows validation for this repair:

- Focused execute/replay, committed-unverified resume, and direct-forgery
  matrix: 3/3 selected tests passed across 2 files; 108 skipped; exit 0;
  50.70 seconds.
- Complete B2/B1 and coordinator regression: 111/111 tests passed across
  2 files; exit 0; 1001.88 seconds Vitest duration and 1003.1 seconds command
  wall time.
- Node 24.13.1, Vitest 4.0.18 TypeScript no-emit check: passed.
- Focused ESLint over both source files and both test files: passed with zero
  output.
- Diff whitespace check: passed.

No publisher or canonical schema-v1 source file changed. No later card,
startup activation, provider call, customer data, remote migration, push,
deployment, paid activity, or production mutation was authorized or performed.
