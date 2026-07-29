# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 1 implementation baseline committed.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. No domain branch, worktree, or conductor lane is active until the control commit containing `concurrency_baseline_accepted` is created.

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
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | Ready for creation from the control commit containing baseline acceptance. |
| Knowledge, Evidence, and Strategy | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\knowledge-strategy` | Ready for creation from the control commit containing baseline acceptance. |
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | Ready for creation from the control commit containing baseline acceptance. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | Ready for creation from the control commit containing baseline acceptance. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Ready for creation from the control commit containing baseline acceptance. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | None | Available; first eligible owner is `G-002` after pilot dispatch | Accepted or blocked migration receipt plus final review. |
| `sqlite-schema` | None | Available | Accepted task receipt. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | None | Available | Accepted task receipt. |
| `full-release-gate` | None | Available; latest local gate passed | Gate process exited and receipt recorded. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Final review | Ownership contract repaired; requires append-only reacceptance after repair verification. |
| `G-002` | Blocked until `G-001` reacceptance, then ready | Sole first migration producer under the corrected contract. |
| `G-003` | Blocked on `G-002` | Migration chain is explicit. |
| `G-004` | Blocked on `G-003` | AI tenant derivation requires tenant-scoped leads; platform `worker_runs` stays global. |
| `G-005` | Blocked on `G-004` | Serialized final Phase 2 structural migration producer. |
| `G-023` | Accepted | Included in transition baseline; no new work. |

## Capacity receipt

- Runtime ceiling observed: four total active agents, including the final conductor.
- Approved Luna/Spark worker selections and visible task-thread tools are not exposed in this runtime.
- The plan's target remains pilot maximum 4 workers, then 12, 16, and hard maximum 20 after its gates.
- No unavailable concurrency or model is claimed. The pilot must use only available in-policy capacity and may run fewer workers; capacity does not weaken task evidence or completion criteria.
- Three separate `gpt-5.6-sol` extra-high read-only reviewers were used during Stage 1 for G-001, file ownership, and validation/resource audits. Their output was evidence only and final disposition remained with the root task.
