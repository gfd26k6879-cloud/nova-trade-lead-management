# Nova Trade Linux handoff checkpoint

Date: 2026-07-31

Status: **Paused after accepted G-006B-B2; do not start a later card.**

## Checkpoint identity

- Source-of-truth repository:
  `https://github.com/Masih-0x3/nova-trade-lead-management.git`
- Integration branch: `codex/nova-multitenant-integration`
- Accepted implementation merge:
  `77f8d652100b0f2d52c32218c38dca50e83876e3`
- Accepted repair branch: `codex/nova-g006b-finalization-resume`
- Accepted repair source:
  `e235d173ec1c5550f2d1f49d8b643daa0a38bf43`
- Rejected predecessor retained in history:
  `5d246fa477fffd9abb8615862f76e8836c1b0f7a`
- The checkpoint control commit is the commit containing this file. Resolve it
  after checkout with:

  ```bash
  git log -1 --format=%H -- docs/handoffs/2026-07-31-linux-handoff.md
  ```

The integration branch was local and had no upstream configured at checkpoint
time. No push was performed. The user will push the approved branch.

## Accepted program progress

The accepted original-card and serialized milestone set is preserved:

- G-001, G-002, G-003, G-005, G-023, and Q-002 are accepted.
- G-004A is accepted; parent G-004 remains open for G-004B.
- G-006R is accepted.
- G-006A staged-artifact and G-006A-P recognition milestones are accepted;
  startup activation remains open.
- G-006B-B1 is an accepted pre-adapter milestone.
- G-006C0, G-006C1, and G-006C2A are accepted unwired milestones.
- G-006B-B2 is now accepted and merged as a startup-disabled API/artifact
  checkpoint.
- Parent G-006B, G-006A activation, G-006C2, G-006C, and G-006 remain open.
- All 318 implementation cards remain in scope. Q-040 and T-029 remain open.
- Rejected Repair-4
  `1d2931d30222957a7dad856360607bc3b7121558` remains unmerged and unaccepted.

## Current phase and exact next action

There is no active implementation card. The program is paused inside the
G-006 finalization-first sequence immediately after G-006B-B2 acceptance.

After the user explicitly resumes:

1. Verify the fresh Linux clone and integration checkpoint using the commands
   below.
2. Re-read the source-of-truth files listed in the next section.
3. Have the Sol final conductor perform a read-only reconciliation for
   finalized-only G-006C0/G-006C1 reminting and G-006C2A consumption against the
   accepted B2 final contract.
4. Only after that reconciliation may a new exact write set, locks, tests, and
   independent review packet be authorized.

Do not begin G-006C2B directly. Do not activate B2, wire startup, execute it
against a persistent database, or infer authority from the accepted artifact.

## Required files to read

Read these repository-relative files before authorizing work:

1. `docs/handoffs/2026-07-31-linux-handoff.md`
2. `docs/plans/2026-07-29-concurrent-multi-conductor-execution-plan.md`
3. `docs/architecture/concurrency-registry.md`
4. The final records in
   `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan-implementation-ledger.jsonl`
5. `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`
6. `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
7. `docs/validation/2026-07-30-g006b-pre-finalization.md`
8. `docs/validation/2026-07-29-g006a-sqlite-fresh-schema-coordinator.md`
9. `src/lib/db/sqlite-g006b-pre-finalization.ts`
10. `src/lib/db/sqlite-schema-coordinator.ts`
11. Their two focused test files under `src/lib/__tests__/`
12. The G-006C0, G-006C1, and G-006C2A validation receipts under
    `docs/validation/`

The live branch and files are authoritative. Historical chat, Windows paths,
and memory are context only.

## Linux toolchain

Use the repository lockfile and these validated versions:

- Node.js `24.13.1` (`package.json` requires `>=24 <25`; `.nvmrc` and
  `.node-version` specify major 24)
- npm `11.8.0`
- TypeScript `5.9.3`
- Vitest `4.0.18`
- Next.js `16.2.6`
- better-sqlite3 `12.9.0`
- SQLite runtime `3.53.0`
- Playwright test package `1.58.2`

Use `npm ci`, not `npm install`, in a fresh clone. If a native
better-sqlite3 prebuild is unavailable, install the normal Linux native build
prerequisites (`python3`, `make`, and `g++`) without changing the lockfile.

## Windows-only validation boundary

G-006B B1/B2 durability is intentionally Windows-specific. It pins
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` and validates
Win32/NTFS file IDs, share modes, retained handles, delete-on-close locks,
sidecar identity, no-replace publication, helper-process death, and a 512 MiB
rename/write race.

The accepted Windows evidence is:

- Corrected source focused matrix: 3/3 passed; 108 skipped; 50.70 seconds.
- Corrected source complete G006B/coordinator suite: 111/111 passed;
  1001.88 seconds Vitest duration.
- TypeScript and focused ESLint passed.
- Independent architecture, security, and Quality reviews all accepted.
- Merged focused matrix: 3/3 passed; 108 skipped; 49.98 seconds.

Linux cannot replace that evidence. Do not treat a skipped or unavailable
Windows helper test as a Linux pass. The portable coordinator tests, static
checks, recovery verifier, build, and non-G006B tests can be rerun on Linux.

## Runtime concurrency and model constraints

- Runtime ceiling: four total agents, including the final conductor.
- At most three bounded non-root agents may run concurrently.
- Final integration, security, migration, source-truth, and acceptance
  decisions require `gpt-5.6-sol` with extra-high reasoning.
- `gpt-5.6-terra` with medium reasoning is the approved fallback implementer
  only when Spark/Luna are unavailable.
- Terra receives one bounded card and exact write set. It cannot change
  sequencing, policy, scope, dependencies, or acceptance criteria and cannot
  accept its own work.
- Independent review and final Sol inspection are mandatory.
- At this checkpoint, active non-root agent count is zero and no lock is held.

## Authority boundaries

After explicit resume, allowed local actions remain limited to read-only source
inspection and, once a new packet is accepted, task-scoped local branches,
worktrees, commits, tests, and reviewed local merges.

Prohibited without new explicit authority:

- push or pull request creation;
- deployment or remote migration;
- provider or paid calls;
- production or customer-data access;
- outreach or messages;
- account, credential, permission, or security-setting changes;
- destructive Git operations, history rewrites, or worktree deletion;
- B2 activation, startup wiring, or persistent database execution;
- any later-card implementation before the finalized C0/C1/C2A reconciliation.

## Remote, deployment, and migration state

- No push or PR was performed for this checkpoint.
- No deployment was performed or verified.
- No remote migration was run.
- No migration file changed in G-006B-B2.
- Remote database and production state were not queried and remain unverified.
- T-029 remains open. Do not run a blanket `supabase db push`.
- No production/customer data, credentials, provider service, or paid API was
  accessed.

## Ignored and Windows-local state not transferred by Git

The following are not carried by a Git clone:

- `node_modules`, `.next`, `coverage`, `test-results`, `playwright-report`,
  `.auth`, `.vercel`, `supabase/.temp`, TypeScript build info, logs, and local
  export directories;
- `.env*` except `.env.example`;
- local SQLite `*.db`, `*.db-journal`, `*.db-shm`, and `*.db-wal` files;
- the Windows fnm installation and Playwright browser cache;
- all Windows `%TEMP%` roots.

The repair worktree's task-created `node_modules` junction was removed after
verification. The real integration `node_modules` directory was preserved.
No worktree was removed.

Three synthetic pre-Linux residuals remain untouched, have no owning G006B
process, and have no root or descendant reparse points:

- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-nNolsg`
- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-RCR62L`
- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-YeaNOl`

These previously documented policy-blocked residuals also remain untouched:

- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-ZKgBDT`
- `C:\Users\Masih\AppData\Local\Temp\g006b-b1-Y18U0Y`
- `C:\Users\Masih\AppData\Local\Temp\g006b-identity-cleanup-qjkSgV`

Those absolute paths are immutable Windows provenance. Do not rewrite prior
ledger entries and do not attempt to use or remove these paths from Linux.

## Fresh-clone verification

After the user pushes the integration branch:

```bash
git clone --branch codex/nova-multitenant-integration --single-branch \
  https://github.com/Masih-0x3/nova-trade-lead-management.git
cd nova-trade-lead-management

git status --short
git rev-parse HEAD
git log -1 --format=%H -- docs/handoffs/2026-07-31-linux-handoff.md

nvm install 24.13.1
nvm use 24.13.1
node --version
npm --version
npm ci

npm run typecheck
npx eslint \
  src/lib/db/sqlite-g006b-pre-finalization.ts \
  src/lib/db/sqlite-schema-coordinator.ts \
  src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts \
  src/lib/__tests__/sqlite-schema-coordinator.test.ts
npx vitest run src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=dot
npm run db:verify:recovery
npm run build
git status --short
```

Optional broader portable regression:

```bash
npx vitest run \
  --exclude=src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts \
  --reporter=dot
```

Do not run or report the Windows G006B durability file on Linux as acceptance
evidence. A later Windows-capable runner must continue to own that boundary.

## Pause receipt

- G-006B-B2: merged and accepted.
- Integration implementation merge:
  `77f8d652100b0f2d52c32218c38dca50e83876e3`.
- Relevant repair source:
  `e235d173ec1c5550f2d1f49d8b643daa0a38bf43`.
- Worktrees: 13 registered, 13 clean, 0 deleted.
- Active non-root agents: 0.
- G006B processes: 0.
- Locks held: 0.
- Remote/external actions: 0.
- Next card: none until explicit resume.

Silence is not approval. Remain paused.

## Fedora resume receipt

Date: 2026-07-31

The user explicitly resumed the local implementation process and selected
Fedora/Linux as the continuing development environment and Supabase/Postgres as
the application database direction. The checkout was verified at the handoff
tagged commit before edits, with a clean worktree, Node 24.13.1, npm 11.8.0,
and lockfile installation through `npm ci`.

Read-only reconciliation reached these conclusions:

1. G-006B-B2 remains accepted, merged, startup-disabled Windows/NTFS evidence.
2. Finalized-only G-006C0/G-006C1 reminting followed by G-006C2A finalized-
   binding consumption is still the correct order if legacy SQLite activation
   resumes. G-006C2B cannot precede it.
3. That sequence depends on the Windows native lease contract and is therefore
   paused, not reinterpreted or reimplemented with weaker Linux filesystem
   claims.
4. Accepted D-004 already makes Postgres authoritative and states that SQLite
   compatibility does not block Postgres-only platform features. The Linux move
   therefore permits the next explicitly split Postgres dependency slice while
   preserving every original card and SQLite retirement condition.

The coordinator test file now distinguishes its 12 portable cases from 26
Windows file-identity/finalization cases. Fedora observed 12 passing and 26
skipped; the historical Windows 111/111 result is unchanged. The exact next
implementation preflight is the Postgres-only portion of G-007: audit the
accepted G-002 through G-005 constraints and indexes, identify only missing
tenant-prefixed ownership enforcement, then issue a one-migration/test packet
if a real delta exists. The SQLite portion of G-007 remains dependent on the
paused G-006 legacy lane.

The first bounded Postgres result is G-007P1. Real PostgreSQL 16 plan evidence
showed the legacy global AI-artifact status index winning over the tenant queue
index. Migration `202607310001_tenant_prefix_ai_artifact_indexes.sql` replaces
the four inherited global `lead_ai_artifacts` hot-path indexes with exact
tenant-prefixed equivalents and fails closed on catalog drift. Parent G-007 is
still open; the next preflight is G-007P2 over the remaining G-002 through G-005
global indexes. No hosted Supabase or remote migration was used.

## G-007P2 continuation receipt

Date: 2026-07-31

G-007P2 audited the live PostgreSQL 16 catalog and split one exact remaining
family. Tenant-filtered AI-verification status and requester reads selected
global indexes and applied tenant scope as a filter, while the tenant/lead path
already used the accepted G-004A index. Migration
`202607310002_tenant_prefix_ai_verification_indexes.sql` removes the three
global secondary indexes, retains the accepted tenant/lead index, and adds
tenant-prefixed status and requester indexes. Exact replay is a no-op and
partial/spoofed catalog state fails closed.

All local gates passed: G-004A/G-007P2 1/1, G-002 2/2, G-003 2/2, G-005 1/1,
T-029 19/19 with 47 discovered/45 applied/2 runtime-only skipped migrations,
TypeScript, focused ESLint, recovery over 37 tables, Fedora coordinator 12
passed/26 Windows-native skipped, and the production build with 11/11 static
pages. Historical Windows acceptance remains unchanged.

Parent G-007 remains open. The exact next step is read-only G-007P3 preflight
over the remaining global-index families, followed by another bounded packet
only if real tenant-filtered plan evidence proves it. The SQLite portion remains
paused behind G-006 finalized-binding work; G-006C2B is unopened. No hosted
Supabase, remote migration, push, PR, deployment, production, provider, or
credential action occurred.

The accepted G-007P2 source commit is
`a0472e6d13839d27d6ae133f92e1202f1f7c9185`.

## G-007P3 continuation receipt

Date: 2026-07-31

G-007P3 audited all remaining G-002-through-G-005 tenant-owned indexes and
proved one bounded `leads` AI queue defect on PostgreSQL 16.14. With 80,000
representative rows, global baseline indexes scanned both tenants and applied
tenant scope as a filter. Migration
`202607310003_tenant_prefix_lead_ai_queue_indexes.sql` replaces only the ready
and status queue indexes with tenant-first definitions. Natural final plans use
the intended indexes and no longer apply tenant scope as a post-filter.

The first draft was rejected and repaired before acceptance. The final packet
also prevents the supported runtime Postgres repair path from recreating four
global indexes retired by G-007P1/P2/P3; migrations remain their sole owner.
Exact replay, rollback, missing/partial/spoofed/non-index catalogs, foundation
backing-index health, runtime repair, and complete migration inventory are
covered. Fresh independent architecture and quality reviews pass.

All root gates pass: G-002 2/2, G-003/G-007P3 2/2, G-004A 1/1, G-005 1/1,
T-029 19/19 with 48 discovered/46 applied/2 skipped, Q-002 1/1, TypeScript,
focused ESLint, runtime-repair unit 2/2, recovery over 37 tables, Fedora
coordinator 12 passed/26 Windows-native skipped, and production build 11/11.
Invalid TLS, undersized-plan-fixture, and pre-process launcher invocations are
retained in the validation receipt and are not counted as passes.

Parent G-007 remains open. Next work is another read-only, separately justified
G-007P audit; no later Phase 2 write card is unlocked by this child alone.
G-006 remains paused, G-006C2B is unopened, and historical Windows evidence is
unchanged. No hosted Supabase, remote migration, push, PR, deployment,
production, provider, credential, customer-data, or outreach action occurred.

The accepted G-007P3 source commit is
`5a16a2602cb02e36b61e5c8dc2881902d80a7816`. The next exact action is a
read-only G-007P4 PostgreSQL 16 EXPLAIN audit of one separately bounded family,
starting with the `crawl_units` retry-ready candidate. No migration is assumed.

## G-007P4 no-defect receipt

Date: 2026-07-31

The `crawl_units` retry-ready candidate does not require a migration. Natural
PostgreSQL 16.14 plans over 120,000 interleaved rows and both explicit workspace
forms inspected only the globally unique target run. No wrong-tenant or
wrong-workspace candidate appeared; filtered rows were future retries only.
The proposed 5,088 KiB tenant/run retry index was not selected naturally and
did not improve the read or UPDATE plans.

The hypothetical was dropped, all 12 baseline indexes were healthy, all audit
resources were removed, and the repository remained clean at
`ad2ada5744e32dec864aeec4b04dbf8d7254ddd2`. Parent G-007 remains open. The
next action is another read-only, separately justified G-007P family audit. No
migration, external action, or downstream dependency unlock is implied.

The G-007P4 no-defect audit receipt commit is
`b44896a0a23293341d2d44df411337f8eca7b752`.

## G-007P5 deferred-defect receipt

Date: 2026-07-31

G-007P5 proves a real tenant-query defect in the lead enrichment-ready family
but does not open a migration. On PostgreSQL 16.14 with the complete 48/46/2
chain and 100,000 interleaved leads, the global ready path considered 12,500
wrong-tenant rows. The exact 984 KiB tenant-ready candidate reduced the scoped
selector to 3 buffers with no filtering.

A required fresh compatibility replay rejected that standalone candidate. The
exact current unscoped query naturally chose the new tenant-first index even
while both globals remained healthy, scanned all 20,000 eligible cross-tenant
rows, and sorted them at 2,231 buffers and 22.227 ms. Removing the globals or
editing current callers would cross the later tenant-query/worker cutover.

The migration is therefore deferred to the G-011/G-012/G-014/G-019/G-020
compatibility boundary. All hypotheticals and disposable services were removed,
35/35 baseline lead indexes were healthy, and the repository stayed clean at
`b548172286e1d0dbb7cd5345dbd4f3b2d1427928`. Parent G-007 remains open. The
next safe action is a separately bounded, read-only G-007P6 recovery-family
audit; no migration is assumed.

The G-007P5 deferred-defect audit receipt commit is
`f2465e6c6e764f7c02712083e5b89e70f675d8be`.

## G-007P6 continuation receipt

Date: 2026-07-31

G-007P6 proves and corrects one PostgreSQL-only stale-running/due-retry
enrichment recovery defect. On 100,000 interleaved leads, each tenant-scoped
baseline considered 35,000 status rows including 17,500 from the wrong tenant.
The additive 3,736 KiB partial index on
`(tenant_id,enrichment_status,score DESC)` for only `running/retry_wait`
eliminates wrong-tenant candidates. Pending-ready G-007P5 and exhausted
terminalization are structurally excluded.

Both global enrichment indexes remain exact for current unscoped compatibility.
Paired plans prove current unscoped stale, due, exhausted, ready-list, and
ready-lease ownership does not change; live runtime repair leaves the complete
P6 catalog unchanged. Exact replay, rollback, missing/spoofed/unhealthy/non-index
states, literal-prefix siblings, column/constraint/foundation drift, and later
authorized global/P5 evolution are covered.

Final independent architecture and quality reviews pass after bounded repairs.
Root gates pass: G-003/G-007P6 3/3, G-002 2/2, G-004A 1/1, G-005 1/1, T-029
19/19 and Q-002 1/1 at 49 discovered/47 applied/2 skipped, runtime ownership
2/2, TypeScript, focused ESLint, recovery over 37 tables, Fedora coordinator 12
pass/26 Windows-native skip, and production build 11/11. Invalid fixture,
planner-assertion, host-client, and concurrent Q-002 cleanup invocations remain
truthfully recorded in the validation receipt.

Parent G-007 remains open and G-007P5 remains deferred to the later tenant
query/worker cutover. After attributable local commits and lock release, the
next safe action is a read-only G-007P7 PostgreSQL 16 audit of the single
website-viability repair read behind `idx_leads_ai_status_checked`. No migration
is assumed. No remote or external action occurred.

The accepted G-007P6 source commit is
`672f14a99aa9224d307ebfe2e0bd25b11e884507`.

## G-007P7 continuation receipt

Date: 2026-07-31

G-007P7 proves and corrects one PostgreSQL-only tenant website-viability repair
read defect. On 100,000 interleaved leads, the scoped baseline used the retained
global `idx_leads_ai_status_checked`, removed 35,036 rows including 35,000
newer rows from the wrong tenant, and read 5,883 buffers. The additive 1,616 KiB
partial index on `(tenant_id,ai_checked_at DESC)` for exact current eligibility
reduces the scoped plan to 17 buffers with tenant in `Index Cond`, zero residual
filtering, no sort, and identical ordered IDs.

The current unscoped query retains the global index and identical results at
limits 1, 50, and 200. Exact replay, rollback, foundation drift, catalog spoofs,
health, literal-prefix siblings, later global/P5 evolution, P6 coexistence,
nullable ordering, and live runtime ownership are covered. No query, caller,
worker, provider, route, runtime repair, SQLite, or external behavior changed.
Independent architecture and quality reviews both pass.

Root gates pass: G-003/P6/P7 4/4, G-002 2/2, G-004A 1/1, G-005 1/1, T-029
19/19 and isolated Q-002 1/1 at 50 discovered/48 applied/2 skipped, focused
runtime and SQLite AI verification 15/15, TypeScript, focused ESLint, recovery
over 37 tables, Fedora coordinator 12 pass/26 Windows-native skip, and build
11/11. Two invalid root setup invocations are truthfully retained in the
validation receipt and are not counted as evidence.

Parent G-007 remains open and G-007P5 remains deferred. After attributable
local commits and lock release, the next exact action is a read-only G-007P8
PostgreSQL 16 audit of the dashboard `idx_leads_discovered_at` family. No
migration is assumed. No remote or external action occurred.

The accepted G-007P7 source commit is
`8eccf9108211c0a45878f50214bd6fff19fbec9d`.

## G-007P8 continuation receipt

Date: 2026-07-31

G-007P8 proves and corrects one PostgreSQL-only future tenant dashboard today
count defect. On 200,000 physically interleaved leads, the scoped baseline used
global `idx_leads_discovered_at`, removed 10,000 wrong-tenant rows, and read
2,079 buffers. The additive 7,960 KiB `(tenant_id,discovered_at)` index reduces
the scoped count to 53 buffers with both keys in `Index Cond`, no residual
filter, and the same result.

The exact current unscoped count retains its global owner and identical result
at 80 buffers. UTC date-boundary and archived/excluded inclusion semantics are
unchanged; the adjacent all-leads count is also unchanged. Replay, rollback,
foundation/global/final catalog drift, literal-prefix siblings, unrelated
P5/P9 evolution, P6/P7 coexistence, and live runtime ownership are covered.
No query, caller, action, runtime repair, SQLite, permission, or external
behavior changed. Independent architecture and quality reviews pass.

Root gates pass: G-003/P6/P7/P8 5/5, G-002 2/2, isolated G-004A 1/1, G-005
1/1, T-029 19/19 and isolated Q-002 1/1 at 51 discovered/49 applied/2 skipped,
focused runtime/actions 23/23, TypeScript, focused ESLint, recovery over 37
tables, Fedora coordinator 12 pass/26 Windows-native skip, and build 11/11.
The rejected concurrent G-004A connection-reset run and three audit setup
errors remain truthfully recorded and are not acceptance evidence.

Parent G-007 remains open and G-007P5 remains deferred. After attributable
local commits and lock release, the next exact action is a read-only post-P8
G-007P9 PostgreSQL 16 audit of the active statistics
`idx_leads_active_discovered_at` family. No migration is assumed. The strict
G-017/G-018 versus ownership-map G-020 functional-owner discrepancy must be
reconciled before any later statistics caller cutover, but does not block the
read-only index audit. No remote or external action occurred.

The accepted G-007P8 source commit is
`defaffe73cad4b79c49d914e67b274dfbc35a942`.

## G-007P9 deferred-defect receipt

Date: 2026-07-31

G-007P9 proves a material post-P8 tenant-plan defect in ranged and all-time
active statistics counts, but does not open a migration. On 160,000 interleaved
leads, the tenant ranged baseline read 7,061 buffers and tenant all-time read
8,791 while filtering 48,000 wrong-tenant rows.

The only complete correction, an exact active partial on
`(tenant_id,discovered_at)`, reduced those paths to 11 and 45 buffers with no
filtering. It also captured both current unscoped query owners. Three other
coherent candidates either materially regressed tenant I/O or failed one form.
Independent architecture and quality reviews therefore pass DEFER.

No migration or lock opened. All candidates and resources were removed and
38/38 baseline lead indexes are healthy. The obligation transfers explicitly
to strict G-017/G-018 statistics/action cutover, where the candidate must be
rerun after the unscoped path is retired or split. The ownership map's G-020
citation conflicts with strict G-020's worker-dispatch card and must be
reconciled before caller changes. Parent G-007 and deferred G-007P5 remain open.
No remote or external action occurred.

The G-007P9 deferred-audit receipt commit is
`95c2c7ab2cf726927ba43aef50ef9d816c558217`.

## G-007P10 deferred-defect receipt

G-007P10 proves a score-recompute tenant-plan defect but opens no migration.
On 180,000 adversarially ordered leads, the global selector removed 90,000
newer wrong-tenant rows at limit 1. Only a covering archive-partial tenant index
fixed all supported limits and the stale count, but it captured the current
limit-100000 selector and both scheduler count owners. Other candidates were
incomplete or also captured current paths. Independent reviews pass DEFER.

The obligation transfers to G-009/G-011/G-012/G-014/G-019/G-020, with
G-017/G-018 applying to any ordinary dashboard projection. All candidates and
resources were removed; 38/38 indexes are healthy. Parent G-007 remains open,
and no remote or external action occurred.

The G-007P10 deferred-audit receipt commit is
`0883f9d0764ededcc6de8cf2ebd8023c4cbc6780`.

## G-007P11 continuation receipt

G-007P11 proves and corrects one PostgreSQL-only future tenant-wide open
admin-request list defect. On 144,000 interleaved requests, every tenant
baseline scanned and sorted globally and considered 48,000 wrong-tenant open
rows. The additive 4,800,512-byte tenant/priority-CASE/status-CASE/created
partial index serves typed and untyped limits 6/50/100/200 with tenant in
`Index Cond`, no sort, no residual tenant filter, and identical ordered IDs.

The fixture contains exactly 36,000 null-workspace and 36,000 non-null-workspace
rows per tenant. P11 is tenant-wide only and does not claim workspace authority.
Current unscoped lists and summary retain their plans and results. Both exact
current lead-local forms retain `idx_admin_requests_lead_created` and identical
planned shapes/results. Runtime repair does not own P11.

Replay, rollback, exact definition, literal-prefix, missing/partial/spoofed and
unhealthy catalog states, foundation drift, later global removal, and unrelated
index evolution are covered. Initial architecture and quality findings were
repaired; fresh independent re-reviews pass.

Root gates pass: G-003/P6/P7/P8/P11 6/6, G-002 2/2, G-004A 1/1, G-005 1/1,
T-029 19/19 at 52/50/2, isolated Q-002 1/1, focused runtime/workbench/actions
32/32, TypeScript, focused ESLint, 37-table recovery, Fedora coordinator 12
pass/26 Windows-native skip, and build 11/11. All rejected and invalid setup,
plan-stability, image-name, database-name, and focused-path attempts are
truthfully retained in the validation receipt and are not acceptance evidence.

Parent G-007 remains open. After attributable local commits and lock release,
the next exact action is a read-only G-007P12 PostgreSQL 16 audit of the
`idx_outreach_events_actor_created` family. No migration is assumed. No remote
or external action occurred.

The accepted G-007P11 source commit is
`30eb1b086d7581143487d4997786ac55beed9661`.

## G-007P12 deferred-defect receipt

G-007P12 proves that actor identity is not tenant authority and that the future
tenant/shared-actor list can filter 48,000 wrong-tenant rows through global
`idx_outreach_events_actor_created`. It does not accept a migration.

The 7,110,656-byte actor-nonnull tenant candidate looked complete in the initial
audit, but the fresh implementation harness did not reproduce its natural
selection on the representative interleaved heap. PostgreSQL chose the global
at estimated LIMIT cost 29.58 versus candidate-only 35.10, then actually read
3,029 buffers and removed the same 48,000 rows. The candidate won only after
changing the heap to perfectly tenant-batched order and tenant correlation 1.0.
That physical-order dependency is rejected as overfit.

Fresh independent architecture and quality reviews pass DEFER after the
superseded migration authority was repaired in the durable documents.

All migration/test/count/runtime draft edits were removed. Both candidates,
the disposable container, listener, database, and task processes are gone;
the four baseline outreach indexes remain healthy. No full upstream gate was
run because the decisive corrected-plan requirement failed and there is no
source to accept. Invalid and rejected setup, diagnostic, and batched-heap
attempts are recorded in the validation receipt.

The obligation transfers to strict G-015/G-017 cutover, when current global
actor ownership can be retired or redesigned. Strict G-018 owns scope
propagation; G-020 is unrelated worker dispatch. Parent G-007 remains open.
After the local audit receipt and lock release, the next action is a separate
read-only G-007P13 audit of `idx_lead_notes_author_created`. No migration is
assumed; counts remain 52/50/2 and sequence `202607310008` remains available.
Any later proven P13 migration would use 008 and produce 53/51/2. No remote or
external action occurred.

The G-007P12 deferred-audit receipt commit is
`7fe3eb2e62dbdfec8f65128571de5331e85c7e16`.

## G-007P13 deferred-defect receipt

G-007P13 proves a shared-author tenant defect but accepts no migration. On
160,000 interleaved notes, the global author/time LIMIT 100 path removes 48,000
wrong-tenant rows and reads 2,719 buffers.

The full tenant/author/time candidate improves counts and bounded ranges but
does not naturally serve LIMIT 25/100. The live-note partial also misses those
ordered paths and captures the exact current unscoped active-author count.
Because `author_user_id` is already NOT NULL, no author-nonnull partial can
supply a smaller legitimate alternative. Independent reviews pass DEFER.

Both hypotheticals and all disposable resources were removed; the four baseline
indexes remain healthy and the repository stayed clean. Counts remain 52/50/2,
sequence 008 remains available, and no full upstream matrix was run because no
source or migration survived. The obligation transfers to strict G-015/G-017
cutover, with G-018 owning scope propagation. Parent G-007 stays open.

After the local receipt commit, the next action is a separate read-only P14
audit of `idx_admin_requests_creator_created`. No migration is assumed and no
remote or external action occurred.
