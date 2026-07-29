# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 3 pilot accepted; Stage 4 is capacity-gated.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` is the exact start revision for all five domain branches and worktrees. G-002 was independently reviewed, repaired, merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`, and passed the final integration gate. G-003 is the next dependency-ready migration card. Runtime scaling remains limited by the observed four-agent ceiling and unavailable approved worker models.

## Final integration authority

- User-facing task: current Nova Trade goal task (`019fae23-6627-7d61-a9f3-f5e68d72093e`).
- Canonical repository: `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`.
- Integration branch: `codex/nova-multitenant-integration`.
- Authority: source truth, dependency readiness, shared locks, final review, local merge, ledger acceptance, phase acceptance, and completion decisions.
- External authority: none. Push, PR, deploy, remote migration, paid/provider calls, outreach, production/customer-data access, account/credential/security changes, and destructive operations remain prohibited.

The concurrent execution plan requires the final integration conductor to run `gpt-5.6-sol` with extra-high reasoning. The current root task does not expose a separately verifiable model identity or visible-thread creation tools, so this criterion is not represented as satisfied. Repository topology may be prepared locally, but runtime conductor activation remains capacity- and tool-gated.

## Domain registry

| Domain | Thread title | Branch | Worktree | Current state |
|---|---|---|---|---|
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | Refreshed clean to `9afedb757bb3a3bb70b58d956cc3b0ece25d70ea`; read-only G-006/G-008 recovery-boundary preparation is active through `/root/baseline_ownership`; no lock or implementation worker. |
| Knowledge, Evidence, and Strategy | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\knowledge-strategy` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | Refreshed clean to `ca6747659761c74875086933c9f0b03557a4d294`; read-only G-003 launch-packet refresh is active through `/root/discovery_conductor`; no lock or implementation worker. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Refreshed clean to `ca6747659761c74875086933c9f0b03557a4d294`; independent read-only G-003 acceptance-matrix and collision audit is active through `/root/baseline_validation`; no lock or implementation worker. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | None | Available; G-002 released after acceptance and merge validation | Next acquisition requires a G-003 dispatch event with its exact migration path and accepted `cb329b4a6adaaa0c940f16b433198297e2712c7f` integration baseline. |
| `sqlite-schema` | None | Available | Accepted task receipt. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | None | Available; G-002 released after the authorized migration-count-only reconciliation | T029 remains a deferred blocker for G-006/G-008 and is not a passing receipt. |
| `full-release-gate` | None | Available; merged G-002 gate passed | `npm run release:check` exited 0 at merge `cb329b4a6adaaa0c940f16b433198297e2712c7f`. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

The opt-in T-029 recovery rehearsal stops after the 42-discovered/40-portable migration replay because its legacy `user_market_access` key contract predates G-002 tenant-inclusive identity. This is recorded as blocked—not passing—and is deferred to the planned G-006 SQLite parity and G-008 reconciliation boundary after G-002 through G-005 are structurally accepted. G-002 did not weaken tenant identity or expand the recovery design around only the first of those four migrations.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Accepted | Ownership contract repaired, independently verified, and reaccepted through append-only event 205. |
| `G-002` | Accepted | Independently reviewed repair merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`; final local release gate passed. |
| `G-003` | Ready | G-002 is accepted; it is the sole next migration producer and must claim `migration-sequence` against the current integration baseline. |
| `G-004` | Blocked on `G-003` | AI tenant derivation requires tenant-scoped leads; platform `worker_runs` stays global. |
| `G-005` | Blocked on `G-004` | Serialized final Phase 2 structural migration producer. |
| `G-023` | Accepted | Included in transition baseline; no new work. |

## Capacity receipt

- Runtime ceiling observed: four total active agents, including the final conductor.
- Approved Luna/Spark worker selections and visible task-thread tools are not exposed in this runtime.
- The plan's target remains pilot maximum 4 workers, then 12, 16, and hard maximum 20 after its gates.
- No unavailable concurrency or model is claimed. The pilot must use only available in-policy capacity and may run fewer workers; capacity does not weaken task evidence or completion criteria.
- Three separate `gpt-5.6-sol` extra-high read-only reviewers were used during Stage 1 for G-001, file ownership, and validation/resource audits. Their output was evidence only and final disposition remained with the root task.
- The pilot preflight used two active domain conductors (Platform and Quality), no implementation worker, and no migration producer. The first Platform conductor was interrupted after two bounded no-output requests; a replacement takeover receipt and independent Quality receipt both approved the same three-file G-002 packet.
- G-002 now runs as the previously authorized bounded parent/domain-conductor takeover after the two approved worker-model failures recorded in ledger events 198 through 200. No unapproved worker model substitution is claimed.
- The Stage 3 pilot is accepted. Platform produced one attributable two-commit G-002 batch, Quality required one bounded repair delta and then passed it independently, Discovery prepared the serialized G-003 through G-005 packets, and the final integration gate passed with no overlaps, stale baselines, unattributable files, invalid ledger events, or owned temporary-resource residue.
- Stage 4's planned 12-worker level is not claimable in this runtime: only four total agent slots are exposed and the plan-approved Spark/Luna worker models are unavailable. No unapproved model is substituted. Dependency preparation and final-conductor work may continue, but implementation dispatch must remain inside the plan's model and capacity rules.
- All five domain branches were fast-forwarded cleanly between batches to accepted integration baseline `ac9d9ebadb747c01e9b5019061cedbcbb213e4c4`; no domain branch contains an unmerged or unattributable delta.
- Current Stage 4 preflight capacity is fully occupied: one final conductor plus three read-only domain conductors (Discovery G-003 packet, Quality G-003 acceptance matrix, Platform G-006/G-008 recovery boundary), zero implementation workers, and zero held shared locks.

## Pilot acceptance receipt

- Batch: `platform-tenancy-001`.
- Domain task commits: `8c48db28653e2b287de6a94cc45d6c5439371d0e`, `4fa948ae3af6900227f2351ec359b6016d1af64a`.
- Integration merge: `cb329b4a6adaaa0c940f16b433198297e2712c7f` using a non-fast-forward merge.
- Independent PostgreSQL 16 review: 2/2 passed with 42 migrations discovered, 40 applied, and only the two documented cron migrations skipped through portable shims.
- Final integration gate: TypeScript, ESLint, 37-table recovery schema verification, 124 passing test files with 2,201 passing tests, Next.js 16.2.6 production build, and 5/5 public read-only Playwright checks.
- Known blocker: opt-in T029 recovery restore remains blocked at the accepted G-006/G-008 boundary; it is not represented as passing.
- External boundary: local-only. Nothing was pushed, deployed, applied to a remote database, or exercised against customer data or paid providers.
