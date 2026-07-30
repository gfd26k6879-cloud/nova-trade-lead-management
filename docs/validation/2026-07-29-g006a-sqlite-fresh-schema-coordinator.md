# G-006A SQLite fresh schema and whole-schema coordinator preparation

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Accepted code baseline: `a7c296298bf33f1cfb670741863c0ffe1629002c`

Dispatch/control head: `88e49440d2ff52b4db249bd199b2b2a3547fe9a3`

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
- accepted T-028-prepared legacy catalog digest:
  `07091889ff9806c20356f092d3812ff325f22537c63a56149eea7dab0a529ade`

Every named table and replacement anchor has exact per-table cardinality.
Construction fails immediately if the frozen source, table set, or anchor
shape drifts. Post-construction checks require exactly 37 table definitions,
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

Whole-schema finalization requires a typed later-finalizer capability bound to
the exact classified source state, source digest, target digest, and final
user version. Absence, stale state, or any mismatch is rejected before
`BEGIN IMMEDIATE` is opened and before any mutation. Only a later G-006B/C
implementation can supply the callback that performs and proves finalization.
The callback must leave the exact final catalog and `user_version=6002` in the
same transaction. An exact final state replays without invoking a callback.

The compatibility receipt remains evidence bound by later work; its presence
does not authorize a tenant choice or catalog transition. The coordinator does
not interpret it as authority.

Before a later finalizer runs, the coordinator snapshots every transformed
table, `audit_logs`, and the receipt table. It records every source-state
column (including existing T-028 tenant/workspace values), row counts, and
deterministic type-tagged row-payload digests. A final catalog may add columns,
but it cannot remove or change any source-state value. Before commit the
coordinator requires identical payloads and counts, exactly 37 application
tables, an empty
`foreign_key_check`, `integrity_check=ok`, and the exact final catalog digest.
An exception rolls the entire transaction back and leaves the accepted source
classifiable for a clean restart.

## Local validation evidence

- `npx vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=verbose`
  - PASS: 1 file, 9/9 tests, final pre-close run 1.70 s.
  - Covers deterministic fresh construction, exact catalog metadata, tenant
    and source key enforcement, both nullable-workspace unique identities,
    cross-tenant and invalid-source rejection, all coordinator classifications,
    pre-transaction capability rejection, rollback/restart, final replay, and
    row-count/payload/FK/integrity guards.
- `npm run typecheck`
  - PASS: `tsc --noEmit --pretty false`, final run 4.8 s.
- `npm run lint`
  - PASS: full repository ESLint, final run 21.7 s.
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

All database exercises were in-memory SQLite instances with synthetic rows.
No legacy file was rebuilt, no backup or recovery fixture was altered, no
Docker resource was created, and no customer, credential, provider, paid,
remote, or production system was accessed. G-006A remains preparation only;
G-006B/C, startup activation, recovery reconciliation, and later acceptance
remain out of scope.
