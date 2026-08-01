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

The G-007P13 deferred-audit receipt commit is
`ab18b8e2b103775886cc467a36ff0364eedb6daf`.

## G-007P14 deferred-defect receipt

G-007P14 proves a tenant/shared-creator defect but accepts no migration. On a
160,000-row interleaved PostgreSQL 16.14 fixture, the global creator LIMIT 100
path removes 44,000 wrong-tenant rows and reads 3,257 buffers. Nullable
creators were exercised through the real auth foreign key's SET NULL behavior.

The 9,240,576-byte full and 8,052,736-byte creator-nonnull candidates improve
standalone tenant counts to 318 buffers and half-open ranges to 11 buffers, but
neither naturally serves LIMIT 25/100, workspace LIMIT 100, or the joined
creator-history form. The current global creator, P11, team-lead, null-creator,
lead-local, tenant-lead, and PK owners remain intact. Independent architecture
and quality reviews pass DEFER/no migration.

Both candidates and all disposable resources were removed; all eight baseline
admin-request indexes are healthy and the repository is clean. Counts remain
52/50/2, sequence 008 remains available, and no full upstream matrix was run
because no source or migration survived. The obligation transfers to strict
G-015/G-017 cutover, with G-018 owning scope propagation. Parent G-007 stays
open.

After the local receipt commit, the next action is a separate read-only P15
audit of
`idx_admin_requests_assigned_created(assigned_admin_user_id,created_at DESC)`.
No migration is assumed and no remote or external action occurred.

The G-007P14 deferred-audit receipt commit is
`d4fad818b301d25934bddf760c641dd6cf47ec8e`.

## G-007P15 deferred-defect receipt

G-007P15 proves a future tenant/shared-assignee defect but accepts no
migration. On a 160,000-row interleaved PostgreSQL 16.14 fixture, natural
LIMIT 25/100/200 plans each remove 44,000 wrong-tenant rows through the global
assignee index. Null assignees were produced through the real auth FK SET NULL
path, and no current SELECT filters by assignee.

The 9,175,040-byte full candidate improves shared/null counts and null paths,
but leaves the core nonnull and workspace history on the global index. The
7,585,792-byte nonnull partial leaves the same core defect and cannot serve
real null semantics. Independent architecture and quality reviews pass
DEFER/no migration; exact caller shapes transfer to G-015/G-017, with G-018
owning scope propagation.

Both candidates and all disposable resources were removed; all eight baseline
admin-request indexes are healthy and the repository is clean. Counts remain
52/50/2, sequence 008 remains available, and no full upstream matrix was run
because no source or migration survived. Parent G-007 stays open.

The catalog appendix's initial audit-log recommendation was corrected because
T-015 audit logs are outside this G-002 through G-005 lane. After the local
receipt commit, P16 is the read-only classification of deliberately global
`idx_demos_public_slug`, followed by P17 read-only audit of
`idx_demos_lead_id`. No migration or external action is assumed.

The G-007P15 deferred-audit receipt commit is
`6f3279dbd6af85ce05df731f6a3071216a2c72f9`.

## G-007P16 deliberate-public-index receipt

G-007P16 retains `idx_demos_public_slug` with no migration. On a 100,008-row
PostgreSQL 16.14 fixture, the approved anonymous function accepts only a
globally unique slug and naturally resolves it through unique
`demos_slug_key` in 4 demo/5 total buffers. No tenant predicate belongs in this
public contract. Nonselection of the larger public-slug composite is not a
tenant defect, and removing it would require a separate cleanup packet.

The exact function owner, fixed search path, ACL, RLS/base-table denials,
bounded projection, private-key stripping, lifecycle negatives, duplicate-slug
rejection, and stable result/catalog digests all pass. Independent architecture
and quality reviews pass RETAIN/no migration. The current broad direct-table
application lookup remains a separate G-015/G-024 privacy cutover obligation.

All disposable resources were removed and the repository is clean. Counts
remain 52/50/2, sequence 008 remains available, and no full upstream matrix was
run because no source or migration survived. Parent G-007 stays open.

After the local receipt commit, P17 is the read-only audit of
`idx_demos_lead_id`. P17 is not terminal: P18/P19 reference families and later
AI query-history and G002/G005 residual families still require explicit
classification. No migration or external action is assumed.

The G-007P16 retain/classification receipt commit is
`dfac6a1b5716e2bfab716a54c4ba2fbf8e01dac5`.

## G-007P17 no-defect receipt

G-007P17 retains `idx_demos_lead_id` for current unscoped compatibility with
no migration. The legacy single-column FK is gone; exact
`idx_demos_tenant_lead(tenant_id,lead_id)` owns the operative composite cascade
and future scoped reads.

On 100,000 interleaved demos with a realistic mostly-one lifecycle and a
sixteen-row high-churn tail, future tenant+lead reads use both composite keys,
read 3–19 buffers, and filter zero wrong-tenant rows. Counts and cascade use
the same index. History sorts remain bounded to sixteen rows/26 KiB, so no
three-key hypothetical or DDL is justified. Digests, half-open/workspace/join
controls, cascade rollback, exact catalog, and independent reviews pass.

All resources were removed and the repository is clean. Counts remain 52/50/2
and sequence 008 remains available. Retain the global until G-015/G-018 scopes
current callers; re-audit if unbounded history or materially larger real churn
appears. Parent G-007 stays open.

P18 AI-feedback references are next. The reconciled source inventory contains
62 retained non-tenant-leading/non-constraint secondary indexes: 28 are
mapped/queued and 34 G-002/G-003 names remain unclassified. G-005 has zero
residual globals, correcting earlier broad G002/G005 wording. No migration or
external action is assumed.

The G-007P17 no-defect receipt commit is
`ff44228dc0205943f5b427db15d769b3fcdc4bc8`.

## G-007P18 no-defect receipt

G-007P18 retains `idx_ai_feedback_events_verification_id` and
`idx_ai_feedback_events_artifact_id` with no migration. They are scope-neutral
lookup aids for G-004A's exact composite SET NULL constraints. The referenced
IDs remain globally unique, so tenant-prefixing cannot reduce a valid lookup
set and no current or approved feedback read filters by either reference.

On 160,000 interleaved feedback rows, valid hot 20,000-row tenant/reference
paths use the globals with zero filtering. Real parent deletes null exactly the
target 20,000 references, preserve the other reference, and roll back to the
exact row digest. Executable wrong-tenant guessed-ID probes filter 20,000 rows,
but a matching relationship cannot survive the accepted FK/guard and no caller
owns that query. Cross-tenant mutations reject with zero residue.

Independent reviews pass RETAIN/no defect. P18 did not repeat G-004A's live
ACL/RLS gate, and differently constructed catalog digests are not presented as
equal; exact final catalog reread, no DDL, cleanup, clean tree, and unchanged
refs pass. Counts remain 52/50/2 and sequence 008 remains available. Parent
G-007 stays open; P19 AI-usage references are next. No external action is
assumed.

The G-007P18 no-defect receipt commit is
`3f624aac0ef7aa43672942aa0a4d3c4ba1d9c392`.

## G-007P19 stopped on G-004A combined-cascade defect

P19 did not reach an index disposition. On a fresh PostgreSQL 16.14 chain, a
minimal legal two-tenant graph proved that deleting a lead with a both-linked
usage event fails atomically with `G004A_VERIFICATION_PARENT_REQUIRED`. The
complete six-row digest remains
`d75d4ab85520fe063d6597686577bdae4cb45349e4e188b0f1d7fa8309aafdc0`
and tenant B is untouched after rollback.

Existing tests cover independent lead-only and verification-only SET NULL
actions, not the combined path. This is a G-004A guard-order defect, not an
index defect. P19 remains open and must resume only after an accepted
G-004A-R1 forward repair. The repair may use reserved migration sequence
`202607310008`; it must not edit the accepted migration or absorb open G-004B.

All P19 containers, databases, listeners, and processes were removed. Counts
remain 52/50/2 until the repair is accepted. Sol holds the serialized migration,
guard, focused test, and durable-document surfaces while read-only design
reviews run. No external action is assumed.

The G-007P19 blocker discovery receipt commit is
`50a96cd13feb3a852e526c59815b3d3e7bd2d71a`.

## G-004A-R1 forward repair acceptance receipt

G-004A-R1 is accepted as a forward-only PostgreSQL repair. Migration
`202607310008_harden_ai_usage_transitive_lead_delete.sql` makes the legitimate
combined lead/verification SET NULL sequence order-independent without editing
accepted G-004A migration `202607290003` or weakening its immutable-reference
rules. Direct mutations, cross-tenant references, attribution changes,
catalog spoofing, partial installation, hostile concurrent DDL/ACL changes,
and existing reference mismatches still reject.

Both foreign-key creation orders, exact replay and rollback, full non-reference
row preservation, trigger binding/order, RLS/ACL, and ten-lock serialization
pass on PostgreSQL 16.14. The corrected implementer matrix passed 1/1 in
128.31 seconds and the independent Sol rerun passed 1/1 in 128.07 seconds.
G-002, G-003, G-005, T-029, canonical tenant fixtures, TypeScript, focused
ESLint, recovery verification, production build, and diff checks pass.
Independent security/catalog and quality reviewers report no remaining
P0/P1/P2 findings.

The inventory is now 53 discovered / 51 applied / 2 runtime-only skipped.
Sequence `202607310008` is consumed and `202607310009` is next available.
Source and validation receipt commit
`e6e72b213e840af7365fd08bd26ed4e493f97386` contains the accepted repair. P19
is unblocked and resumes read-only on a fresh chain; it still has no RETAIN,
DEFER, or migration disposition. Parent G-007 and G-004 stay open, and G-004B
remains a separate runtime correlation/redaction card.

Lineage correction: the prior lineage expansion of short hash `e6e72b2` named
the nonexistent object `e6e72b2cb04189ef1b445e74ad57e5204685f316`.
`69e6f9a6e51c4807f7c7542ad91921db19b6786e` has the corrected source commit as
its parent; the append-only ledger records the superseding correction.

The invalid Fedora invocation of the Windows-only release lane is retained in
the validation receipt and supplies no Windows evidence. The historical native
Windows/NTFS 111/111 acceptance remains authoritative, that lane remains
paused, and G-006C2B remains unopened. All repair containers, listeners,
processes, databases, worktrees, and locks are released with the lineage
commit. No remote or external action occurred.

## G-007P19 no-defect continuation receipt

G-007P19 resumes on the repaired 53/51/2 chain and retains
`idx_ai_usage_events_lead_id` and
`idx_ai_usage_events_verification_id` as scope-neutral child-side maintenance
indexes for the exact composite SET NULL foreign keys. No current or approved
usage read filters either reference. Parent IDs are globally unique, so adding
tenant first cannot narrow a valid maintenance set.

On 160,002 interleaved usage rows, both valid reference paths naturally use
their target, return six rows with zero filtering, and touch four buffers. A
real rolled-back combined lead delete increments each target by one scan/six
tuples, succeeds after G-004A-R1, and restores all rows. Separate fresh
verification-only and lead-only deletes preserve every nonreference field and
tenant B, then restore exact data/catalog/constraint digests on rollback.

Independent architecture and quality reviews pass RETAIN/no defect/no
migration with no P0/P1/P2 finding. No hypothetical or candidate remains.
Counts stay 53/51/2 and sequence `202607310009` stays free. Parent G-007 remains
open.

The exact 62-name residual appendix now makes the former 28/34 summary
reproducible: G-002 13 + G-003 39 + G-004A 10 + G-005 0; 28 mapped/queued and
34 unclassified. The next bounded work is the unnumbered read-only AI-usage
query-history family `idx_ai_usage_actor_created`, `idx_ai_usage_created`, and
`idx_ai_usage_model_created`. No P20 identifier is opened yet.

The first crosswalk bootstrap omitted `auth`; its entire container and partial
catalog were rejected and removed. The fresh corrected replay passed. All P19
containers, databases, ports, processes, candidates, and worktrees are gone.
Main/tag remain unchanged and no remote or external action occurred. The P19
receipt and exact crosswalk commit is
`4adc7bd09c84d8890b1950221b78255b0af38564`.

## G-007P20 AI-usage query-history audit opened

After P19 receipt/lineage commit and clean-state verification, Sol opens the
next exact crosswalk family as G-007P20:
`idx_ai_usage_actor_created(actor_user_id,created_at DESC)`,
`idx_ai_usage_created(created_at DESC)`, and
`idx_ai_usage_model_created(model,created_at DESC)`. This is a read-only
PostgreSQL 16 catalog, caller, and natural-EXPLAIN audit. No defect, migration,
hypothetical, or index disposition is assumed.

Counts remain 53/51/2, sequence `202607310009` remains free, and no serialized
write lock is held. Current actor/source/time and global compatibility
aggregates must be separated from approved future tenant/platform query
contracts. A migration may open only after a real tenant-query plan defect is
proven for one coherent subfamily. Parent G-007 remains open; G-004B and the
paused G-006 boundary are unchanged.

## G-007P20 actor-plan defect receipt

P20 proves one bounded researcher-cap/budget defect and defers its migration to
a separate write packet. On 300,000 interleaved usage rows with null sources,
the exact lower-bound-only tenant/shared-actor/two-source form uses
tenant-created, returns 12,845, and filters 31,796 same-tenant nonowner/source
rows at 3,177 buffers and 9.752 ms. The smallest fixed-source partial three-key
candidate returns the identical digest with zero filtering at 3,057 buffers and
4.623 ms, 52.6% faster.

Retain the global actor index for the current unscoped compatibility query.
Retain global created-time; existing tenant-created owns the G-017 tenant-time
form. Retain/defer model because P20 proves neither a drop basis nor an exact
approved query owner. Independent architecture and quality review pass
DEFECT PROVEN / migration deferred with no remaining P0/P1/P2 finding.

The write packet is narrowly the current researcher cap and must pin
`request_source IN ('researcher_ai_check','researcher_pitch_pack')`. It must
preserve global actor/current and generic alternate-source owners; broader
G-014 actor optimization remains open. It may use guarded, replay-safe migration
sequence `202607310009` only after its source-value ownership regression passes.
Counts remain 53/51/2 and 009 remains free at P20 audit close.

All candidate DDL rolled back; fixture/catalog/foundation digests match and
residue is zero. The rejected half-open actor evidence, exact lower-only rerun,
fixed-source comparison, and all corrected invocations are retained in the
validation receipt. All containers, databases, ports, processes, temporary
files, candidates, and worktrees are gone. Parent G-007 remains open; no remote
or external action occurred. The P20 audit receipt commit is
`ef6d4154d86cbe0e71aac56a55484424db32d77d`.

## G-007P20A implementation packet opened

After clean P20 lineage at `a6b6e504e7af3a8347788ea427e4d00b2896f535`,
Sol opens G-007P20A for the proven researcher-cap index only. Migration sequence
`202607310009` and the focused AI PostgreSQL/count-test surfaces are reserved to
one implementer. Root retains all durable program documents and acceptance.

The exact target is an additive partial btree on
`ai_usage_events(tenant_id, actor_user_id, created_at DESC)` where actor is
non-null and source is exactly `researcher_ai_check` or
`researcher_pitch_pack`. It must preserve current global actor and generic
alternate-source behavior; G-014 and G-021 remain open. Counts stay 53/51/2
until acceptance, when the intended full chain would become 54/52/2. No remote
or hosted action is authorized.

## G-007P20A accepted locally

Sol accepts implementation commit
`5076979cdef1c43f2ed404cd10c511f727ec642f`. Independent architecture and
quality reviews report no P0/P1/P2 finding. The exact committed write set is
migration 009, the focused AI PostgreSQL harness, five migration-count tests,
and its validation receipt; no caller, authorization, provider, SQLite, or
compatibility cutover changed.

Root fresh PostgreSQL 16 reruns pass G-004A/P20A 2/2 in 203.57 seconds,
G-002 2/2, G-003 6/6, G-005 1/1, and corrected T-029 19/19. Counts are now
54 discovered, 52 portable applied, and two runtime-only skipped. Root also
passes the exact caller/adapter preflight 23/23, default reserved tests 20/20
with 11 opt-in skips, TypeScript, focused ESLint, 37-table recovery,
Fedora-portable coordinator 12 with 26 native Windows skips, production build,
JSONL parsing, and diff checks. Historical Windows 111/111 evidence remains
unchanged and was not rerun on Fedora.

The initial root T-029 URL used a unique database suffix, conflicting with the
test's exact database-name assertion; it failed before PostgreSQL rehearsal and
the fresh exact-name retry passed. The first implementation commit command
failed before object creation because Git identity was unset; no configuration
changed, and a one-shot established identity created the source commit without
history rewrite. Both events are retained in the validation receipt/ledger.

Sequence 009 is consumed; 010 is next available. All P20A locks and disposable
resources are released. The next residual audit remains unnumbered and begins,
after a fresh catalog, with the current crawl-run visibility pair
`idx_crawl_runs_status_created` and `idx_crawl_runs_created_desc`; no migration
is assumed. Parent G-007 and G-004B remain open. G-006 stays paused with native
Windows evidence preserved; G-006C2B remains unopened. No remote or external
action occurred. The P20A acceptance commit is
`c8c3dba2ce980f2bfcbf7e0f6d71e1bf6a7d83d2`.

## G-007P21 crawl-run visibility audit opened

After clean P20A lineage at `7cc9c516334815d333fd97c4085986384819dd00`,
Sol opens the next exact residual family as G-007P21:
`idx_crawl_runs_status_created(status, created_at DESC)` and
`idx_crawl_runs_created_desc(created_at DESC)`. This is a read-only PostgreSQL
16 catalog, caller, natural-plan, and result audit. No defect, candidate, or
migration is assumed.

Current newest-running/queued, paused, latest-run, and bounded history queries
are global compatibility paths. The audit may measure exact tenant/workspace
controls but may not infer public/platform authority or invent G-013/G-020
visibility/dispatch contracts. Counts remain 54/52/2; sequence
`202607310010` is free and no write lock is held. Blocked-run and actual
market-created indexes remain later separate unnumbered families. Parent G-007,
G-004B, and the paused G-006 boundary are unchanged.

## G-007P21 accepted without migration

Sol accepts the crawl-run visibility audit at open baseline
`f3be206fa64ba69efd0fd0414dfe9e7f12518506`. Fresh PostgreSQL 16.14 replayed
54/52/2 and measured 280,000 interleaved rows. The created-time index naturally
served processing, paused, latest, and bounded-history global compatibility
queries. The status-leading index had zero measured scans and is retained as
logical compatibility support; the earlier opening wording is not a natural
ownership claim.

Six transactional tenant/workspace candidates provided no material gain, all
11 result digests matched, and rollback left no candidate residue. G-009/G-013
has not fixed the exact tenant/workspace visibility contract, so no DDL is
authorized. Counts remain 54/52/2 and sequence 010 remains free. Independent
readiness and test audits agree; root current compatibility tests pass 16/16.
All disposable resources are removed. Blocked-created and market-created remain
separate unopened families; parent G-007 stays open.

The accepted receipt commit is
`47ce318a0acf7fd40b41798ee8154915da29bc04`. Its documentation reservation is
released. This lineage update does not open or number the next residual audit.

## G-007P22 blocked-run index classification opened

After clean P21 lineage at `19f004bbb26f8c8ff4745083622274849cd2cf2f`,
Sol opens one source-only classification for
`idx_crawl_runs_blocked_created`. Current block, resume, cancel, and retry
operations select by run primary key; generic display uses created-time history,
and no current query orders by `blocked_at`.

The packet may inspect source, migration provenance, tests, and durable
G-013/G-020 dependencies. It must stop before PostgreSQL candidates or DDL
unless it finds a real owned blocked-time query. Counts remain 54/52/2,
sequence 010 stays free, and market-created remains separate and unopened.

## G-007P22 accepted as source-only retain/defer

Sol finds no exact current blocked-time reader. Current lifecycle actions use
run IDs, generic display orders by created time, and G-013 has not fixed a
blocked-run query contract. G-020 fair dispatch is not an owner. Root focused
behavior tests pass 67/67 but do not prove index use.

The partial index remains in the unchanged historical migration, while runtime
repair and SQLite do not recreate it. Source proves neither use nor safe
removal, so Sol retains historical replay compatibility and defers plan,
tenant-prefix, replacement, and removal claims. No PostgreSQL service or DDL was
used. Counts remain 54/52/2, sequence 010 stays free, and the crosswalk is now
31/31. Market-created remains separate and unopened; no later card unlocks.

The accepted receipt commit is
`2922e32d434ee9f23efb4148da791551a7c3d4ec`. Its documentation reservation is
released. No P23 card is opened by this lineage update.

## G-007P23 market-created index classification opened

After clean P22 lineage at `b2d929188020685676e64de0354c9e25bdeb56e3`,
Sol opens a source-only classification for
`idx_crawl_runs_market_created(market_id, created_at DESC)`. There is no current
market-filtered run-history reader. The leading market key may support the
accepted child-side market FK, but source cannot claim live use or health.

Platform markets are shared reference data, not tenant authority. The packet
must stop before PostgreSQL plans, candidates, DDL, or removal until G-010/G-013
defines an exact tenant/workspace-scoped market-history contract. Counts remain
54/52/2 and sequence 010 remains free.

## G-007P23 accepted as source-only retain/defer

Sol finds no current market-filtered crawl-run history reader. The separate
market/created btree is structurally suitable as scope-neutral child-side
support for the accepted market FK's RESTRICT checks, but it is not
constraint-owned and no live use, health, necessity, or performance is claimed.

Shared platform markets never authorize tenant-owned runs, and G-010/G-013 has
not fixed an exact tenant/workspace market-history contract. Historical
PostgreSQL replay and accepted SQLite schema retain the index, so Sol retains
compatibility and defers tenant-history, replacement, and removal claims. No
PostgreSQL service, test, candidate, or DDL was used. Counts remain 54/52/2,
sequence 010 stays free, the crosswalk is 32/30, and no later card unlocks.

The accepted receipt commit is
`e9ac62457d874d8f3fa5d9aa4f4354d90acec593`. Its documentation reservation is
released. This lineage update opens no next residual card.

## G-007P24 budget-pages aggregate audit opened

After clean P23 lineage at `0158101797063d2fa420658371d4c5489a2bf0e2`,
Sol opens one read-only PostgreSQL 16 audit for
`idx_crawl_units_budget_pages`. The exact current query filters one run plus
mode-specific statuses and sums positive `max_pages - pages_fetched` before
resume/retry safety checks.

The audit compares natural plans and exact scalar results with P4 sibling
indexes and a transactional target drop. Run-ID-only behavior is current
compatibility, not tenant authority; G-013 controls are measurements and G-021
is not a current owner. No defect, candidate, migration, or removal is assumed.
Counts remain 54/52/2 and sequence 010 remains free.

## G-007P24 accepted; retain exact aggregate owner

Fresh PostgreSQL 16.14 replayed 54/52/2 and measured 120,000 interleaved units.
All three aggregate modes naturally used the budget-pages index through
index-only scans with zero heap fetches and 5-20 buffers. Transactional removal
kept the 24-result scalar digest exact but regressed to 2,503-2,750-buffer
bitmap/heap plans; explicit rollback restored the exact definition, digest, and
plan.

Sol retains the exact current compatibility owner. Tenant/workspace controls do
not complete G-013 and G-021 is not a current owner. No defect, candidate,
migration, test edit, or removal packet is opened. Root behavior tests pass
60/60. Counts remain 54/52/2, sequence 010 stays free, the crosswalk is 33/29,
and all disposable resources are removed. Receipt commit
`290c7aee65d16397c896f91eb044e2687fa456b0` records the accepted RETAIN
decision. This lineage update opens no next residual family.

## G-007P25 cell-status audit opened

After clean P24 lineage at `7843412d850379b3515763502198ecfb809d9e29`,
Sol opens one read-only PostgreSQL 16 audit for
`idx_crawl_units_cell_status(location_cell_id, status, category)`. Current
owners include exact cell coverage and adjacent cell-ledger aggregates, with
optional run-scoped forms measured against accepted P4 controls.

The audit uses interleaved tenant/run/cell/category/status fixtures, natural
plans, canonical results, and a transactional target drop. Platform cells are
never tenant authority; tenant/workspace controls are future G-010/G-013
measurements only, and generalized null-cell units cannot authorize or pollute
cell-owned shapes. The target is not constraint-owned and does not cover the
full market/cell child key. No defect, candidate, migration, test edit, or
removal is assumed. Counts remain 54/52/2, crosswalk 33/29, and sequence 010
remains free.

## G-007P25 accepted; retain exact cell-status owner

Fresh PostgreSQL 16.14 replayed 54/52/2 and measured 120,000 interleaved units:
96,000 cell-owned shapes plus 24,000 generalized null-cell controls. Every
constructed cell included both tenants and all six statuses/categories, with
zero inherited-scope mismatch.

Four current/current-derived shapes and one bounded market control naturally
used the target. Transactional removal preserved the canonical result SHA
`a6e5cdd6c8d52e4d59067c624ce3c99cf882ed813a633979679815568b6b2521`
but changed all five plans to sequential or P4 run-status-only fallbacks.
Explicit rollback restored exact definition, catalog, results, and plan
fingerprints.

Sol retains the exact current compatibility owner. Platform cells remain
non-authorizing, G-010/G-013 controls are measurements only, and no defect,
candidate, migration, test edit, or removal packet is opened. Root behavior and
proportional gates pass. Counts remain 54/52/2, sequence 010 stays free, the
crosswalk is 34/28, and all disposable resources are removed. Receipt commit
`381ff0a45fcf03677fdb90dbfd06984287b5bff8` records the accepted RETAIN
decision. This lineage update opens no next residual family.

## G-007P26 market-status source classification opened

After clean P25 lineage at `f3e403aea62b7ff90f10465f5a982c264493b87a`,
Sol opens one read-only source classification for
`idx_crawl_units_market_status(market_id, status, category)`. Current coverage
readers join units by cell rather than `crawl_units.market_id`; the compatibility
geography backfill writer is not an exact target-index reader.

The packet traces provenance, PostgreSQL/SQLite retention, current callers,
tests, G-010/G-013 authority, and the single-column market FK versus incomplete
compound market/cell coverage. Platform markets never authorize tenant units.
No PostgreSQL service, live catalog/plan claim, defect, candidate, migration,
test edit, replacement, or removal is assumed. Counts remain 54/52/2,
crosswalk 34/28, and sequence 010 remains free.

## G-007P26 accepted; retain/defer market-status compatibility

Source and caller tracing finds no exact current market-led crawl-unit reader.
Current coverage joins units by cell; the geography backfill is a writer, not
target-index ownership evidence. The leading market key is only an unmeasured,
scope-neutral child-side support candidate for the single-column market FK. The
target is not constraint-owned and does not cover the compound market/cell key.

Sol retains PostgreSQL and current/frozen SQLite compatibility and defers live
plan, RI-necessity, tenant-query, replacement, and removal claims. Platform
markets never authorize tenant units; G-010/G-013 still own the future query
contract and G-021 is not a current owner. No PostgreSQL service, defect, candidate,
migration, test edit, replacement, or removal packet is opened. Counts remain
54/52/2, sequence 010 stays free, and the crosswalk is 35/27. Receipt commit
`18e6e7a92bde686ea7e45850e030710a75b68074` records the accepted RETAIN/DEFER
decision. This lineage update opens no next residual family.

## G-007P27 user-market-access compatibility family opened

After clean P26 lineage at `3bf6c4502f0bd2584ee727fd5687f93208a55def`,
Sol opens one read-only source classification for
`idx_user_market_access_user(user_id, market_id)` and
`idx_user_market_access_market(market_id, user_id)`.

The packet distinguishes current user-leading compatibility readers from
unproven natural plan ownership, the market-leading PostgreSQL FK-cascade
support candidacy from SQLite's different FK action, and legacy global identity
from G-002 tenant/workspace null-safe uniqueness. Current, prepared/upgraded,
and frozen SQLite lifecycle differences remain explicit. User and
platform-market IDs never authorize tenant grants, and G-006C2B remains
unopened. No PostgreSQL, live claim, defect, candidate, migration, test edit,
identity rewrite, replacement, or removal is assumed. Counts remain 54/52/2,
crosswalk 35/27, and sequence 010 remains free.

## G-007P27 accepted; retain/defer user-market-access pair

The user-leading target remains only a current compatibility-query candidate;
source does not prove natural plan ownership, and it is not final
tenant/workspace identity, uniqueness, or authorization. The market-leading
target has no current runtime application market-led reader and remains an
unmeasured PostgreSQL CASCADE support candidate versus a SQLite NO ACTION
enforcement candidate.

Sol keeps legacy/current/prepared/frozen lifecycle differences explicit.
G-006C2B stays unopened; user and platform-market IDs never authorize grants;
future scoped contracts remain with G-009/G-010/G-011/G-016/G-018. No
PostgreSQL service, live claim, defect, candidate, migration, test edit, identity
rewrite, replacement, removal, writer-safety, SQLite-activation, or cross-engine
equivalence claim is opened. Counts remain 54/52/2, sequence 010 stays free,
and the crosswalk is 37/25. Receipt commit
`0636a4ff3aee28c5c965ac239567523d3c8ced67` records the accepted RETAIN/DEFER
decision. This lineage update opens no next residual family.

## G-007P28 status-ZIP crawl-unit audit opened

After clean P27 lineage at `db8f3940fbb8255e39cd775ffc314573c43498d4`,
Sol opens one read-only PostgreSQL 16 catalog and natural-plan audit for the
sole remaining G-002 residual,
`idx_crawl_units_status_zip(status, zip)`.

The bounded packet measures the complete current lease reset-and-selection
flow, failed-error and failed-count shapes, and exact ZIP/county/state/geography
controls. Its fresh full-chain fixture independently crosses two tenants, named
and null workspaces, all three location modes, runs, statuses, and categories.
Legacy-ZIP rows use exact active ZIP references only; platform-cell and
generalized rows each include colliding and noncolliding compatibility-token
controls. Persisted `location_mode` governs location shape, and a platform-cell
reference never grants tenant authority. The audit compares deterministic or
canonicalized results and natural JSON plan fingerprints with the target
installed, during a
transactional target-only drop, and after explicit rollback, using accepted P4
and P24 controls. ZIP is a compatibility location token, never tenant/workspace
authority; G-010/G-013/G-017 remain measurement boundaries. No defect,
candidate, migration, test edit, replacement, or removal is assumed. Counts
remain 54/52/2, crosswalk 37/25 (G-002 12/1), and sequence 010 remains free.

## G-007P28 accepted; retain/defer status-ZIP compatibility

Sol accepts the combined r3k and exact-geography-supplement evidence. Fresh
PostgreSQL 16.14 services replayed the exact 54/52/2 chain on corrected
124,416-row two-tenant fixtures. Results and restored plans are exact across
target installed/drop/rollback. The exact failed-error reader, complete
stale-reset/due-retry/atomic-lease flow, all-time and bounded failure statistics,
and full current geography CTE do not use `idx_crawl_units_status_zip`; accepted
run, budget, retry, tenant-run, or sequential controls own them. The target is
retained/deferred for historical PostgreSQL/SQLite compatibility and measured
mode-filtered or structural-control access only.

Current ZIP joins admit 2,592 platform-cell and 2,592 generalized colliding
rows beside 5,184 valid legacy rows for the selected run. This is separate
G-010/G-013 query-semantics debt and a G-017 validation boundary, never tenant
or workspace authority and not an index defect. No candidate, migration, test
edit, replacement, necessity, or removal packet opens. Independent reviews
report no remaining P0/P1/P2. Root gates pass, all task resources are removed,
counts remain 54/52/2, sequence 010 stays free, the crosswalk becomes 38/24,
and G-002 is complete at 13/0. Parent G-007 remains open. Receipt commit
`9a01e888a5d90c4133e182c5998f723de1ffc6e4` records the accepted RETAIN/DEFER
decision. This lineage update opens no next residual family.

## G-007P29 archived-active lead-index audit opened

After clean P28 lineage at `552e123f49a9ad7aed3fc58731df9594f8c4a503`,
Sol opens one read-only PostgreSQL 16 catalog and natural-plan audit for
`idx_leads_archived_active(archived_at, updated_at DESC)`, the first remaining
G-003 residual.

The bounded packet measures the exact current stale-quality recompute reader,
bound to accepted G-007P10 semantics: `archived_at IS NULL AND
(last_quality_scored_at IS NULL OR julianday(updated_at) >
julianday(last_quality_scored_at)) ORDER BY updated_at DESC LIMIT ?` in SQLite,
and the faithful PostgreSQL text-timestamp analog using
`(updated_at)::timestamptz > (last_quality_scored_at)::timestamptz`. It must
exercise limits 1, 100, 500, and 100000, including unique LIMIT boundaries and
canonicalized complete tie groups at every limit. Active/archived list and
aggregate shapes are controls on a fresh, independently crossed two-tenant
fixture. Leads are tenant-wide and have no workspace dimension.
Retained stale-score, score, workbench, discovered-time, exclusion, and quality
indexes remain installed as controls. Results and natural plans are compared
with the target installed, during target-only transactional drop, and after
explicit rollback. No defect, tenant-prefixed candidate, migration, test edit,
replacement, or removal is assumed. Counts remain 54/52/2, crosswalk 38/24
(G-003 15/24), and sequence 010 remains free.

## G-007P29 accepted; retain/defer archived-active compatibility

Fresh PostgreSQL 16.14 replayed 54/52/2 migrations on a 153,600-row fully
crossed two-tenant fixture with no workspace dimension. The target was an exact,
healthy ordinary index with zero constraint owners. Installed/drop/rollback
catalog counts were 38/37/38 indexes with all 10 constraints invariant. All 15
canonical results and structural plan fingerprints were identical across the
three phases, and target-only drop changed no selected plan or buffer count.

`idx_leads_score_recompute_stale` owned current limits 1, 100, and 500; limit
100000 used sequential scan and sort. The tenant analog read 2.37x buffers at
100 and 1.96x at 500, with 118 and 513 wrong-tenant eligible rows respectively.
That remains the accepted G-007P10 cutover defect, not a target-specific P29
defect. Its full obligation remains G-009/G-011/G-012/G-014/G-019/G-020, with
G-017/G-018 for dashboard projections.

Sol accepts RETAIN/DEFER for the healthy historical PostgreSQL catalog
definition plus the frozen SQLite compatibility definition only. This PostgreSQL
audit does not freshly validate SQLite. The target has no exact primary owner or
demonstrated necessity, and no removal, replacement, candidate, migration, or
test edit opens. Independent reviews report no P0/P1/P2. Root gates pass and all
resources are gone. Crosswalk becomes 39/23, G-003 becomes 16/23, counts remain
54/52/2, sequence 010 stays free, and parent G-007 remains open.
Receipt commit `9f55ca6c1c8469b975fe5a0ffe9091787e2b5707` records the
accepted disposition and releases the durable-document reservation. This
lineage update opens no next residual family.

## G-007P30 assigned-lead index audit opened

After clean P29 lineage at `48872851107561d36d8d02857369260c50e556e1`,
Sol opens one read-only PostgreSQL 16 catalog and natural-plan audit for
`idx_leads_assigned_to_user(assigned_to_user_id, updated_at DESC)`, the next
unclassified G-003 residual.

The packet measures exact current assigned/unassigned list, workbench, team
aggregate, local assignee-cleanup, and FK `SET NULL` forms against a physically
interleaved two-tenant fixture. One active identity must be a valid member of
both tenants so assignee identity cannot masquerade as tenant authority. Leads
remain tenant-wide with no workspace. Current readers do not order assigned
rows by `updated_at`; any such shape is structural control only. PostgreSQL uses
nullable UUID assignment and must reject empty-string UUID input; SQLite's
empty-string compatibility branch is not PostgreSQL evidence. Remote Auth user
deletion is forbidden.

The binding reader matrix covers assigned and NULL-unassigned `getLeads` count
and score-ordered list at page sizes 1/25/100/200 plus nonzero OFFSET; Kanban at
100; map at default/max 600/1000; export at default/max 50000/100000; and
`getNowQueue` output 25 with its exact 500-row candidate bound and source
multi-key orders. Team/workbench aggregates are canonicalized. Every binding
list boundary must be unique or use a wholly included canonical tie cohort.
PK-led assign/claim remain target-neutral controls; suspended/other-tenant and
empty UUID assignments must reject unchanged. Local cleanup and rollback-only
local `auth.users` deletion exercise assignment nulling without remote Auth.

Natural JSON EXPLAIN, canonical results, target-only transactional drop, and
exact rollback restoration are required. Mutation evidence uses rollback-only
transactions or identical clean clones. No defect, tenant-prefixed candidate,
migration, test edit, replacement, or removal is assumed. Counts remain 54/52/2,
crosswalk 39/23 (G-003 16/23), and sequence 010 remains free.

## G-007P30 accepted; retain/defer assigned-lead compatibility

Fresh PostgreSQL 16.14 replayed the full 54/52/2 chain over 368,640 physically
interleaved two-tenant leads. The exact target and SET NULL FK were healthy;
installed/drop/rollback held 38/37/38 lead indexes and 10 invariant constraints.
All 33 canonical results were exact across phases, and every installed plan and
catalog fingerprint restored after rollback. Drop-phase plans are not claimed
equal.

Ordinary assigned/unassigned readers and query-function export controls did not
select the target; the live CSV route supplies no assignment filter. Three
synthetic assigned-plus-updated controls selected it but are not current readers. Exact
local assignment-null cleanup changed 61,440 rows and selected the target, while
the post-`VACUUM FULL` drop comparison showed no material advantage. A
rollback-only local Auth deletion proved SET NULL outcome, but its visible plan
exposed only `users_pkey`; nested RI support remains unproven. No remote Auth
operation occurred.

Sol accepts RETAIN/DEFER for the healthy historical PostgreSQL catalog and
frozen SQLite compatibility definition. Assignee is never tenant or workspace
authority; leads remain tenant-wide with no workspace. No tenant defect,
candidate, migration, replacement, test edit, removal, or fresh SQLite claim
opens. Independent reviews report no P0/P1/P2; root gates pass and all task
resources are gone. Crosswalk becomes 40/22, G-003 becomes 17/22, G-002 remains
13/0, counts remain 54/52/2, sequence 010 stays free, and parent G-007 remains
open. The durable reservation remains until the attributable local receipt
commit.

The primary factorial export-helper rows were nonbinding complete sets at
30,720 rows. A separate fresh PostgreSQL 16.14 54/52/2 supplement seeded
100,005 assigned and 100,005 SQL-NULL eligible leads across both tenants and
closed exact 50,000/50,001 and 100,000/100,001 boundaries. All four full-row and
ordered digests were exact installed/drop/rollback; every natural plan remained
owned by `idx_leads_enrichment_lease`, omitted the target, and restored the
38/37/38-index, 10-constraint catalog exactly. Root independently reproduced
the result on a second fresh database and the proportional helper suites pass
14/14. These are helper-capability controls, not live CSV-route evidence. The
supplement changes no disposition, authority boundary, count, sequence, or
reservation state.

Receipt commit `e3e2c9759f2e8f53cc8299d746237a928fb9674f` records the
accepted classification and supplement, releases the durable-document
reservation, and opens no next residual family.

## G-007P31 business-type score-index audit opened

After clean P30 lineage at `77f7816cb77bbbbfee713e874f6d56a11006c25f`,
Sol opens one read-only PostgreSQL 16 catalog and natural-plan audit for
`idx_leads_business_type_score(business_type, score DESC)`, the next
unclassified G-003 residual.

Exact business-type equality plus score order is live by default for the leads
table at 25, Kanban 100, and CSV export 50000/100000. Explore list 60 and the
always-fast map route at 200/600 are live score-order shapes only with explicit
`sortBy=score`; their defaults use opportunity order. Page-two offsets are
exactly 25 and 60. GetLeads 1/100/200, normal-map 200/600, and normal-map 1000
are helper/source controls. Quality, AI, competitor, business-count, and
statistics readers remain prefix/filter or aggregate controls. The fresh
two-tenant fixture has no workspace and must make export limits binding with at
least 100,001 active/nonexcluded rows for one literal shared type. At least
1,001 must also be coordinate-eligible and score-interleaved across both tenants,
with exact map ranks 200/201, 600/601, and 1000/1001.

Literal `local_services`, SQL NULL, empty text, and other canonical business
types remain distinct. Equality filters exclude NULL while counts/statistics may
coalesce it to `local_services`; that semantic mismatch cannot authorize index
DDL. Business type and score are selectors only. Tenant-prefixed analogs are
measurement-only until exact G-011/G-017 contracts.

The live catalog must prove the exact healthy btree definition, collation,
opclasses, directions, null ordering, and absence of include/predicate/
expression/constraint/duplicate/spoof drift before EXPLAIN. Natural plans,
canonical results, exact binding boundaries, target-only transactional drop,
and rollback restoration are required. Full results must be exact I/D/R;
structures and catalogs exact I/R, with D reported honestly. Raw telemetry is
noncausal and target selection alone is not necessity. No defect, candidate,
migration, test edit, replacement, or removal is assumed. Counts remain
54/52/2, crosswalk 40/22 (G-003 17/22), and sequence 010 remains free.

## G-007P31 accepted; retain measured local-services score plan owner

Sol accepts RETAIN for the healthy historical PostgreSQL
`idx_leads_business_type_score(business_type, score DESC)` catalog definition
and frozen SQLite compatibility definition. Fresh PostgreSQL 16.14 replayed the
54/52/2 chain over 160,010 physically interleaved two-tenant leads. The final
21-shape admin/researcher session matrix and broader 31-shape family matrix had
exact installed/drop/restored results, exact installed/restored structures, and
exact catalog rollback at 38 indexes and 10 constraints. Twelve isolated spoof
states rejected before workload.

Shared-plumbing admin Leads/Kanban/Explore/fast-map/CSV and researcher Leads/
Explore/fast-map shapes naturally use accepted siblings. Researcher Kanban
redirect and researcher export denial remain source negatives, not executed
SQL. The independently reproduced, measured, reachable canonical
`local_services` equality-plus-score query-function shape at limit 100 uses the
target; target-only drop materially increases buffers and filtered rows, so
redundancy/removal is not proven. Root independently reproduced this
classification on a different fresh 100,019-row fixture with 18 exact I/D/R
shapes, exact rollback, unchanged replay, and an independently rejected
reversed-key spoof.

Business type, score, assignment, and market visibility are selectors only.
Future tenant analogs remain measurement-only until G-011/G-017; no target-
attributable tenant index defect was proven, and generic tenant-plan debt stays
deferred. NULL/empty/COALESCE semantic debt is not an index defect. No
candidate, migration, replacement, test edit, removal, fresh SQLite claim, or
Fedora-for-Windows substitution opens.

Root gates pass: proportional behavior 42/42, TypeScript, focused ESLint,
recovery over 37 tables, Fedora-portable coordinator 12 passed/26 Windows-
native skipped, production build 11/11 pages, fresh PostgreSQL G-002 2/2,
G-003 6/6, and T-029 19/19. All P31 and root resources are removed. Crosswalk
becomes 41/21, G-003 becomes 18/21, G-002 stays 13/0, counts remain 54/52/2,
sequence 010 stays free, original-plan arithmetic remains 58/318 accepted with
260 remaining, and parent G-007 remains open. This receipt releases the durable
reservation and deliberately does not open or number P32.

Receipt commit `8c724ff7ef74f6a3f1a4b42015c5bea98bfadeb5` records the
accepted P31 RETAIN classification locally and releases its serialized
documentation reservation.

## G-007P32 component-score index audit opened

Sol opens G-007P32 from clean baseline
`436506064a411eaa443493b4292ce433c7469cbc` as a read-only PostgreSQL 16
catalog and real-EXPLAIN audit of
`idx_leads_component_scores(raw_opportunity_score DESC,
verification_score DESC)`. Its PostgreSQL source is
`202605130002_ai_verified_quality_pipeline.sql`; the frozen SQLite definition
is compatibility evidence only.

Three independent read-only lanes cover catalog/EXPLAIN evidence,
source/authority and dependency readiness, and test/acceptance requirements.
Sol alone owns the serialized ledger, registry, handoff, crosswalk,
integration, and acceptance surfaces. The current state is 54/52/2 migrations,
41/21 crosswalk (G-003 18/21, G-002 13/0), and free sequence 010; conditional
classification would be 42/20 and G-003 19/20. No candidate, migration, test
edit, replacement, or removal is authorized unless the audit first proves an
exact tenant-query plan defect. P32 does not change the original 58/318
accepted-card arithmetic, and parent G-007 remains open.

## G-007P32 accepted; retain historical target and defer tenant analogue

Sol accepts RETAIN for the healthy historical PostgreSQL
`idx_leads_component_scores(raw_opportunity_score DESC,
verification_score DESC)` catalog definition and frozen SQLite compatibility
definition. Current direct raw-opportunity ASC/DESC readers are independently
reproduced plan owners. Target-only drop preserves results but materially
increases shared-buffer work and requires scan/sort. Verification-only,
default opportunity/map, queue, backfill, candidate, and repair families are
target-neutral controls.

No current lead reader is tenant-scoped. Future tenant-prefixed component-score
forms remain measurement-only until G-009/G-011 and exact downstream ownership;
component scores never establish tenant/workspace authority. No target-
attributable tenant defect, candidate, migration, replacement, test edit, or
removal is accepted, and sequence 010 stays free.

Faraday’s fresh PostgreSQL 16.14 audit used 160,000 alternating two-tenant rows
and 16 exact I/D/R shapes. Root independently reproduced the disposition on a
fresh 100,019-row fixture with 18 exact canonical result sets and ordered score
sequences I/D/R, exact I/R structures, 38/37/38 catalog rollback, unchanged
constraints, statement
replay no-op, and reversed-key spoof rejection. Invalid root attempts were
discarded and are recorded in the validation receipt. All P32 resources are
removed. Crosswalk becomes 42/20, G-003 becomes 19/20, G-002 remains 13/0,
counts remain 54/52/2, original-plan arithmetic remains 58/318 accepted with
260 remaining, and parent G-007 stays open. The next source-order residual is
`idx_leads_country_admin`, but P32 does not open or number it.

Independent architecture/authority and test/evidence reviews accept the P32
receipt with no P0/P1/P2. Root gates pass under Node 24.13.1 and npm 11.8.0:
behavior 63/63, TypeScript, focused ESLint, recovery over 37 tables,
Fedora-portable coordinator 12 passed/26 Windows-native skipped, production
build 11/11 pages, PostgreSQL G-002 2/2, G-003 6/6, G-004A 2/2, G-005 1/1,
and T-029 19/19. No hosted or external operation occurred.

P32 acceptance commit `ca2a4cf3f0ea93474121c1541f769086311d6291` records the
reviewed RETAIN classification locally. Its lineage-only successor releases the
P32 durable-document reservation without opening or numbering the country/admin
residual.

## G-007P33 country/admin index audit opened

From clean baseline `3dcbe7f6cfdbae0e2c3543a336180f6bdc411046`, Sol opens a
read-only PostgreSQL 16 catalog and real-EXPLAIN audit of
`idx_leads_country_admin(country_code, admin_area1, locality)`. Its PostgreSQL
origin is `20260602193000_international_markets_and_territories.sql`, origin
commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d`, file SHA-256
`af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`;
the SQLite mirror is frozen compatibility evidence only.

Three read-only lanes own formal catalog/EXPLAIN, source/authority, and
test/evidence work. Sol alone owns durable writes and acceptance. Starting
state is 54/52/2 migrations and crosswalk 42/20 (G-003 19/20, G-002 13/0);
conditional classification is 43/19 and G-003 20/19. No migration, candidate,
test edit, replacement, or removal is authorized without a proven exact
tenant-query defect. Country/admin/locality are selectors, never tenant or
workspace authority; future tenant-prefixed forms remain measurements until
G-010/G-011 and exact downstream ownership.

## G-007P33 accepted; retain country/admin target and defer tenant analogue

Sol accepts RETAIN for the exact healthy PostgreSQL
`idx_leads_country_admin(country_code, admin_area1, locality)` definition and
frozen SQLite compatibility mirror. Selective current country-filtered Explore,
Quality, and map shapes naturally use the leading key and materially regress on
target-only drop. Common US, suffix-only, storage-anomaly, and actual country-
neutral CSV shapes are target-neutral controls. No current country/admin,
full-key, or trailing-key owner authorizes a replacement. Future tenant forms
remain measurements until G-009/G-010/G-011; geography is never authority.

Faraday's fresh PostgreSQL 16.14 audit proves 24/24 exact canonical result
identities I/D/R and 24/24 exact normalized structures I/R on 200,000 rows.
Root independently proves 13/13 and 13/13 on a fresh 120,000-row fixture after
discarding two invalid databases. Both restore 38/37/38 distinct lead-index
catalogs and unchanged constraints. Healthy replay is a no-op and definition
checks reject name-only spoofs. No migration, candidate, replacement, test edit,
or removal opens; counts stay 54/52/2 and sequence 010 stays free.

Root gates pass: behavior 67/67 plus CSV 2/2, TypeScript, focused ESLint,
recovery over 37 tables, Fedora coordinator 12 passed/26 Windows-native skipped,
build 11/11 pages, PostgreSQL G-002 2/2, G-003 6/6, G-004A 2/2, G-005 1/1,
and T-029 19/19. All P33 resources are removed. Crosswalk becomes 43/19,
G-003 becomes 20/19, G-002 stays 13/0, and parent G-007 remains open.

A separate P1 compatibility-security defect was independently reproduced:
researcher Explore can preserve archived/direct excluded selectors, same-market
detail is not owned-only, and claim lacks archive/exclusion guards. This is not
an index defect. A bounded serialized repair takes precedence over P34; neither
P34 nor the repair is opened by this P33 receipt.

Independent architecture and test/evidence reviews accept the repaired P33
packet with no remaining P0/P1/P2. The producer factual cross-check closes
without self-acceptance. One P2 wording repair correctly labels common US as
low-selectivity; the evidence and RETAIN disposition are unchanged.

P33 acceptance commit `3b069a418b2b144bf39f84709aedd0d82de4fd2c` records the
reviewed classification locally. Its lineage-only successor releases the P33
reservation without opening the security repair or P34.

## G-007SR1 researcher lifecycle authorization repair opened

At clean baseline `00e263266ba826160fc8feda01ea56029d16ba41`, Sol opens a
bounded compatibility-security repair before P34. Independent triage proved
that researcher Directory/direct Explore parameters can preserve archived or
excluded inventory; same-market detail is not owned-only; and claim lacks
archive/exclusion guards.

The repair separates server policies. Researcher Explore remains available but
is clamped to active, nonexcluded, unclaimed, market-visible inventory.
Researcher detail and ordinary mutation require owned, active, nonexcluded,
market-visible leads. Claim separately permits only unassigned, active,
nonexcluded, market-visible leads and repeats lifecycle conditions atomically in
the update. Admin behavior is preserved. One implementer owns only the bounded
source/test set; independent architecture/security and test/evidence review are
required. No migration, tenant-cutover completion, P34, or external action opens.

Independent test review then confirmed a second path within the same detail
defect: protected lead-detail metadata reads and emits the lead name before the
page-body authorization check. The bounded repair is amended to include only
`src/app/(protected)/leads/[id]/page.tsx` and one focused metadata access test.
Metadata must authenticate and reuse the same read policy; denied and missing
objects must not disclose a lead identity. No other page or UI scope opens.
