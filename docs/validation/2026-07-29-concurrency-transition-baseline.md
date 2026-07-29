# Concurrency transition baseline receipt

Date: 2026-07-29

Repository: `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`

Source branch and revision: `main` at `8225df619a96a088f18ff7f574a36b157d55dd2f`

Implementation baseline commit: `3b1135c1c781a5a806a6053a01987a91b63e0bf3` on `codex/nova-multitenant-integration`.

Decision: **PASS.** The reviewed transition manifest is now immutable in the local implementation baseline commit. The separate `concurrency_baseline_accepted` ledger event that binds this commit must itself be committed before any domain worktree is created.

## Preserved checkpoint

- The canonical ledger contained 203 valid standalone JSON objects before this transition receipt.
- Phase 1 acceptance `T-033` remains accepted.
- `G-023` remains accepted and its three compatibility-play artifacts are included in the transition baseline.
- `G-001` was reopened after acceptance because its geography ownership text contradicted `D-001`; the artifact was preserved and repaired in place.
- `G-002` produced no migration, test, or validation receipt before it was paused.
- `G-003`, `G-004`, and `G-005` produced no preflight artifacts.

## Dirty-state ownership manifest

The pre-receipt worktree contained 109 status paths: 24 tracked modifications and 85 untracked files.

| Classification | Tracked | Untracked | Total | Disposition |
|---|---:|---:|---:|---|
| Accepted task output | 24 | 80 | 104 | Preserve in the transition baseline. |
| Reopened `G-001` artifact | 0 | 1 | 1 | Preserve, repair against `D-001`, independently review, then reaccept through a new ledger event. |
| Governing program source | 0 | 4 | 4 | Preserve the PRD, implementation plan, canonical ledger, and concurrent execution plan. |
| User-owned or genuinely unowned | 0 | 0 | 0 | No unowned substantive path found. |

The five-byte untracked file `docs/product/launch-integration-boundary.applytest.md` contained only `temp`, had no ledger owner or repository reference, and was removed as an abandoned D-017 conductor artifact. No other existing file was removed, reset, or overwritten.

The baseline commit also includes this receipt and the concurrency registry created by the final conductor. They are transition-control artifacts, not implementation-card output.

## G-001 source-truth reconciliation

The final-conductor repair applies the accepted `D-001` contract:

- `zip_codes`, `location_markets`, and `location_cells` remain platform reference data without tenant ownership columns;
- `user_market_access` is tenant-owned with optional workspace narrowing;
- `crawl_runs` is tenant-owned with optional workspace;
- `crawl_units` inherits tenant and nullable workspace exactly from its parent run;
- market/cell references do not authorize tenant access;
- `crawl_units.zip` remains a compatibility location token and is bound to `zip_codes` only for explicitly ZIP-mode legacy units;
- `worker_runs` remains a bounded platform scheduler/health envelope with no tenant authority or tenant-owned payload;
- tenant activity uses tenant-owned `audit_logs`; new platform audit uses a separate platform resource, while existing platform and `legacy_unscoped` rows remain immutable transition history;
- the Postgres migration producers are dependency-serialized as `G-002` -> `G-003` -> `G-004` -> `G-005`.

The implementation-plan cards were corrected so a worker cannot reintroduce the rejected ownership model.

## Fresh validation

`npm run release:check` ran on Node `v24.13.1` against the integrated dirty worktree and exited `0` in 245.1 seconds.

| Gate | Result |
|---|---|
| TypeScript | Pass |
| ESLint | Pass |
| Recovery contract verifier | Pass; 37 application tables match SQLite schema and tracked migrations |
| Vitest | 123 files passed, 1 file skipped; 2,200 tests passed, 8 skipped |
| Next production build | Pass; Next.js 16.2.6 |
| Public read-only Playwright | 5 of 5 passed |

The skipped Vitest file is the opt-in disposable-Postgres RLS suite. This turn did not rerun Postgres because Docker Desktop and its daemon were unavailable. The unchanged Phase 1 Postgres evidence remains the accepted `T-033`, `T-027`, `T-028`, `T-029`, and `T-030` receipts; any change to those migrations or isolation contracts requires a fresh disposable-Postgres rehearsal before acceptance.

## Resource and Git audit

- No staged files existed at the start of stabilization.
- Only `main` and its single authoritative worktree existed.
- The release-check process tree exited; no Nova Trade Node/npm/Next/Playwright process or listener remained afterward.
- Docker could not have a running container while its Windows/WSL daemon was stopped, but stopped containers, networks, and volumes could not be enumerated in this turn.
- Ignored `.next` and `test-results` outputs were produced by the successful gate. An attempted exact-path cleanup was blocked by the shell safety policy; neither path is part of the baseline commit.
- The local SQLite database and its WAL/SHM files were not treated as disposable and were not changed or deleted by stabilization.
- No push, pull request, deployment, remote migration, provider call, outreach, production mutation, account change, credential change, or destructive Git operation occurred.

## Baseline commit gate

Before committing, the final conductor must:

1. Verify the exact staged names contain only the owned transition manifest and these control artifacts.
2. Run `git diff --cached --check` and inspect the staged diff/stat.
3. Confirm the ledger is valid JSONL and contains the current authority and G-001 reconciliation events.
4. Confirm no active Nova Trade validation process remains.
5. Create the local integration branch and the single reviewed transition-baseline commit.
6. Append the resulting commit identity through a later `concurrency_baseline_accepted` event, commit that control event, and create all domain branches/worktrees from the resulting integration commit.
