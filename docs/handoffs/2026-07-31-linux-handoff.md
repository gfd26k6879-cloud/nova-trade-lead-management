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
