# G-006A SQLite fresh schema and whole-schema coordinator preparation

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Accepted code baseline: `a7c296298bf33f1cfb670741863c0ffe1629002c`

Dispatch/control head: `88e49440d2ff52b4db249bd199b2b2a3547fe9a3`

Rejected round-0 source: `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2`

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
- `staged`: exact final catalog at `user_version=6001`.
- `final`: exact final catalog at `user_version=6002`.
- `unknown`, `partial`, and `drift`: rejected closed with no mutation.

Whole-schema finalization requires an opaque later-finalizer capability whose
state exists only in a private `WeakMap`. It is bound to the exact Database
object, classified source state and digest, non-empty exact handoff binding ID,
target digest, and captured callback. A private `WeakSet` consumes it before
`BEGIN IMMEDIATE`; callback or pre-commit failure leaves it consumed. Copies,
spread/prototype forgeries, callback replacement, cross-database use, binding
mismatch, and second use reject before mutation. This is a local
program-integrity boundary only. G-006B/C still own the receipt/sidecar
authority that permits a real handoff.

The callback receives a frozen bounded session, never a `better-sqlite3`
handle. It exposes only single-statement create-table/index/trigger,
insert/update/delete, identifier-validated drop, and table-rename operations.
A quote/comment-aware token scanner enforces the leading operation grammar and
denies transaction control, PRAGMA, `writable_schema`, ATTACH/DETACH, VACUUM,
and SQLite catalog targets. Every accepted statement is then compiled with
single-statement `prepare` before execution. The coordinator forces
`writable_schema=OFF`, exclusively owns `BEGIN IMMEDIATE`/commit/rollback, and
sets `user_version=6002` itself.

The compatibility receipt remains evidence bound by later work; its presence
does not authorize a tenant choice or catalog transition. The coordinator does
not interpret it as authority.

Before a later finalizer runs, the coordinator snapshots all 37 application
tables. For every table it records the complete source-column order, row
count, and deterministic type-tagged canonical row-payload digest. This
includes platform/reference tables, ZIP rows, `audit_logs`, the receipt table,
and existing T-028 tenant/workspace values. A final catalog may add
migration-owned columns, but it cannot remove or change any source-state value.

Before commit the coordinator requires identical all-table payloads and
counts, exact catalog and physical metadata, an empty `foreign_key_check`, and
`integrity_check=ok`. Normal callback or validation failure rolls back the
owned transaction. After commit it opens a distinct fresh read-only connection
to the exact resolved file path, rechecks final state/user version/catalog,
37-table and target cardinalities, the pinned full table/index/index-xinfo/
partial-predicate/FK manifest, all-table preservation, FK health, and
integrity, and closes the verifier in `finally`. Only that fresh verification
can return `finalized`. A post-commit reopen failure throws the distinct
`committed-unverified-recovery-required` outcome and never claims rollback.
In-memory finalization fails closed.

## Local validation evidence

- `npx vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=verbose`
  - PASS: 1 file, 15/15 tests, final repair run 5.50 s.
  - Covers deterministic fresh construction, exact catalog metadata, tenant
    and source key enforcement, both nullable-workspace unique identities,
    cross-tenant and invalid-source rejection, all coordinator classifications,
    opaque identity and one-shot handoff enforcement, every forbidden SQL
    family, caller-transaction rejection, normal and accepted-legacy
    rollback/restart, all-37 preservation, close/reopen finalization,
    committed-unverified reporting, verifier cleanup, persistent physical-index
    spoof rejection, final replay, and row-count/payload/FK/integrity guards.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, final run 4.8 s.
- `npm run lint`
  - PASS: full repository ESLint, final run 23.0 s.
- `npm run db:verify:recovery`
  - PASS: all 37 application tables match SQLite schema and tracked
    migrations, 2.1 s.
- `git diff --cached --check`
  - PASS: no whitespace errors.
- `git diff --cached --name-only` plus `git diff --name-only`
  - PASS: exactly the four authorized G-006A paths are staged and there is no
    unstaged delta.
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

All database exercises used in-memory or task-owned temporary file-backed
SQLite instances with synthetic rows. Every temporary directory and verifier
connection was closed and removed. No legacy file was rebuilt, no backup or
recovery fixture was altered, no Docker resource was created, and no customer,
credential, provider, paid, remote, or production system was accessed. G-006A
remains preparation only; G-006B/C, startup activation, recovery reconciliation,
and later acceptance remain out of scope.
