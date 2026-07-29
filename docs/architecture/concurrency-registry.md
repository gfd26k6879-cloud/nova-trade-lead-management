# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 1 repository topology active.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` records baseline acceptance and is the exact start revision for all five domain branches and worktrees. Runtime conductor lanes are still capacity- and tool-gated.

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
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | G-002 commit `8c48db28653e2b287de6a94cc45d6c5439371d0e` is in bounded repair through `/root/baseline_ownership`; `migration-sequence` and a one-file `recovery-contract` expansion are held. |
| Knowledge, Evidence, and Strategy | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\knowledge-strategy` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | Pilot read-only G-003/G-004/G-005 preflight completed through `/root/discovery_conductor`; exact next migration packets prepared and correctly dependency-blocked; no lock or change. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Independent review of G-002 commit `8c48db28653e2b287de6a94cc45d6c5439371d0e` completed through `/root/baseline_validation`; four actionable findings; rework required. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | `G-002` final-conductor-authorized Platform takeover | Held for exactly `supabase/migrations/202607290001_add_location_crawl_tenant_scope.sql` | Accepted or blocked G-002 migration receipt plus final review. |
| `sqlite-schema` | None | Available | Accepted task receipt. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | `G-002` repair delta | Held only for `src/lib/__tests__/data-transfer-contract.test.ts` migration-count reconciliation and opt-in T-029 rerun | Repaired full-chain and recovery rehearsal receipt plus final review. |
| `full-release-gate` | None | Available; latest local gate passed | Gate process exited and receipt recorded. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

The opt-in T-029 recovery rehearsal is currently expected to stop after the 42-discovered/40-portable migration replay because its legacy `user_market_access` key contract predates G-002 tenant-inclusive identity. This is recorded as blocked—not passing—and is deferred to the planned G-006 SQLite parity and G-008 reconciliation boundary after G-002 through G-005 are structurally accepted. G-002 may not weaken tenant identity or expand the recovery design around only the first of those four migrations.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Accepted | Ownership contract repaired, independently verified, and reaccepted through append-only event 205. |
| `G-002` | Ready | Sole first migration producer under the corrected contract; requires the `migration-sequence` lock at dispatch. |
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
- The pilot preflight used two active domain conductors (Platform and Quality), no implementation worker, and no migration producer. The first Platform conductor was interrupted after two bounded no-output requests; a replacement takeover receipt and independent Quality receipt both approved the same three-file G-002 packet.
- G-002 now runs as the previously authorized bounded parent/domain-conductor takeover after the two approved worker-model failures recorded in ledger events 198 through 200. No unapproved worker model substitution is claimed.
- The Discovery preflight is complete. Platform remains the sole active producer while it repairs the independently rejected G-002 batch; Quality is inactive until the repair commit is ready for a fresh review.
