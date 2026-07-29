# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 3 pilot accepted; Stage 4 resumed under the user-approved Terra-medium fallback.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` is the exact start revision for all five domain branches and worktrees. G-002 was independently reviewed, repaired, merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`, and passed the final integration gate. On 2026-07-29 the user explicitly authorized `gpt-5.6-terra` with medium reasoning as the runtime-contingent implementation fallback when Spark/Luna are unavailable. Sol remains the sole final integration/acceptance authority, and the observed four-total-agent ceiling remains binding.

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
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | Read-only G-006/G-008 recovery-boundary packet completed cleanly at `9afedb757bb3a3bb70b58d956cc3b0ece25d70ea`; G-006 waits for accepted G-003–G-005 keys, and G-008 then waits for G-006/G-007; no lock or change. |
| Knowledge, Evidence, and Strategy | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\knowledge-strategy` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | G-003 five-file launch packet independently accepted at clean baseline `ca6747659761c74875086933c9f0b03557a4d294`; Terra-medium implementation is now authorized, with branch refresh, lock acquisition, and dispatch next. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | UI-000 seven-artifact design packet completed read-only at `feb6ecd2c0772879ae86b3949fa688cd7607c35d`; complete UI-001–UI-041 state matrix prepared; implementation and product/design/accessibility approval remain pending. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Q-002 six-file fixture packet completed read-only at `feb6ecd2c0772879ae86b3949fa688cd7607c35d`; second-workspace, look-alike, cleanup, Postgres, shared-factory, and E2E-selector gaps are bounded; ready when the migration-critical G-003 producer/review slots permit. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | None | Available; G-003 released after both approved worker models were rejected before agent creation | Reacquire only after an approved implementation worker is actually dispatchable. |
| `migration-harness` | None | Available; G-003 released with zero changes | Reacquire with G-003 only for the G-002 pre-cutoff and 43/41/2 reconciliation. |
| `sqlite-schema` | None | Available | Accepted task receipt. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | None | Available; G-003 released with zero changes | Reacquire with G-003 only for the 43/41/2 inventory/log reconciliation; recovery semantics remain frozen. |
| `full-release-gate` | None | Available; merged G-002 gate passed | `npm run release:check` exited 0 at merge `cb329b4a6adaaa0c940f16b433198297e2712c7f`. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

The opt-in T-029 recovery rehearsal stops after the 42-discovered/40-portable migration replay because its legacy `user_market_access` key contract predates G-002 tenant-inclusive identity. This is recorded as blocked—not passing—and is deferred to the planned G-006 SQLite parity and G-008 reconciliation boundary after G-002 through G-005 are structurally accepted. G-002 did not weaken tenant identity or expand the recovery design around only the first of those four migrations.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Accepted | Ownership contract repaired, independently verified, and reaccepted through append-only event 205. |
| `G-002` | Accepted | Independently reviewed repair merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`; final local release gate passed. |
| `G-003` | Ready for Terra-medium dispatch | Five-file packet and acceptance matrix are accepted. Refresh the Discovery branch to the amended control baseline, then acquire its exact three locks and dispatch one Terra-medium worker. |
| `G-004` | Blocked on `G-003` | AI tenant derivation requires tenant-scoped leads; platform `worker_runs` stays global. |
| `G-005` | Blocked on `G-004` | Serialized final Phase 2 structural migration producer. |
| `G-023` | Accepted | Included in transition baseline; no new work. |
| `Q-002` | Ready; capacity-queued | Dependencies and six-file packet are ready. Terra-medium is authorized, but G-003's serialized migration producer and independent review take priority within the four-agent ceiling. |
| `UI-000` | Ready; capacity/approval-queued | Seven-artifact design packet is ready. Terra-medium is authorized, but implementation remains capacity-queued and explicit product/design/accessibility approval is still required before task acceptance. |

## Capacity receipt

- Runtime ceiling observed: four total active agents, including the final conductor.
- Approved Luna/Spark worker selections are not exposed in this runtime. The user explicitly approved available `gpt-5.6-terra` at medium reasoning as the fallback implementation worker on 2026-07-29.
- The plan's target remains pilot maximum 4 workers, then 12, 16, and hard maximum 20 after its gates.
- No unavailable concurrency or model is claimed. The pilot must use only available in-policy capacity and may run fewer workers; capacity does not weaken task evidence or completion criteria.
- Three separate `gpt-5.6-sol` extra-high read-only reviewers were used during Stage 1 for G-001, file ownership, and validation/resource audits. Their output was evidence only and final disposition remained with the root task.
- The pilot preflight used two active domain conductors (Platform and Quality), no implementation worker, and no migration producer. The first Platform conductor was interrupted after two bounded no-output requests; a replacement takeover receipt and independent Quality receipt both approved the same three-file G-002 packet.
- G-002 now runs as the previously authorized bounded parent/domain-conductor takeover after the two approved worker-model failures recorded in ledger events 198 through 200. No unapproved worker model substitution is claimed.
- The Stage 3 pilot is accepted. Platform produced one attributable two-commit G-002 batch, Quality required one bounded repair delta and then passed it independently, Discovery prepared the serialized G-003 through G-005 packets, and the final integration gate passed with no overlaps, stale baselines, unattributable files, invalid ledger events, or owned temporary-resource residue.
- Stage 4's planned 12-worker level is not claimable in this runtime: only four total agent slots are exposed. Terra-medium work may proceed only inside the explicit amendment; the runtime remains below the planned scale and may not claim 12 or 16 concurrent workers.
- All five domain branches were fast-forwarded cleanly between batches to accepted integration baseline `ac9d9ebadb747c01e9b5019061cedbcbb213e4c4`; no domain branch contains an unmerged or unattributable delta.
- Discovery and Quality independently accepted an exact five-file G-003 packet. The conventional three files expand only to reconcile the accepted G-002 and T029 full-migration harnesses with 43/41/2 and to stop the pre-G-002 fixture before G-002 and later migrations.
- Both plan-approved G-003 worker dispatches were rejected before agent creation: `gpt-5.3-codex-spark` and `gpt-5.6-luna` are unknown to this runtime, which exposes only `gpt-5.6-sol` and `gpt-5.6-terra`. Zero repository/resource change resulted. The available models remain unauthorized for implementation, the initial-task conductor-takeover exception does not apply, and all three G-003 locks were released.
- Platform's independent recovery-boundary preflight is complete. G-006 must consume the accepted exact keys from G-003–G-005 before SQLite/recovery parity is designed; G-008 then follows accepted G-006/G-007. The current 37-table recovery verifier passes, and the accepted T029 blocker remains preserved rather than patched around prematurely.
- Q-002 and UI-000 independent packets are complete with zero changes. Q-002 bounds the missing reusable four-workspace fixture and disposable-Postgres cleanup contract. UI-000 bounds a complete local seven-artifact specification/wireframe/sign-off package without application code, generated imagery, external service, credit use, or premature approval claim.

## Formal blocked checkpoint

- Checkpoint before the blocking event: `f9f7e15241a1bdebe28d55338dc848b116039b46` on `codex/nova-multitenant-integration`.
- Same blocker observed for three consecutive goal turns: Spark and Luna are the only authorized implementation workers, but neither is callable; Sol and Terra are available but unauthorized as workers.
- Resume instruction: explicit user approval to add `gpt-5.6-terra` at high reasoning as the fallback implementation worker, while retaining Sol as final integration/acceptance authority and the four-total-agent ceiling; alternatively resume in a runtime exposing Spark or Luna.
- Resume order: reacquire G-003's exact three locks, implement/review/merge its five-file packet, then continue serialized G-004 and G-005; Q-002 and UI-000 may run in disjoint lanes when approved worker capacity permits.
- Preservation: all 318 cards, phase gates, Q-040, remote/production prohibitions, independent acceptance requirements, and the accepted T029 recovery blocker remain unchanged.

## Resume and authority-amendment receipt

- The user explicitly resumed the goal on 2026-07-29 and approved `gpt-5.6-terra` with medium reasoning as the fallback implementation worker when Spark/Luna are unavailable.
- This is a narrow worker-model amendment only. It does not change the PRD, the 318-card completion target, task dependencies, write sets, locks, evidence, phase gates, Q-040, T029 disposition, or external-action prohibitions.
- Terra may implement one bounded, already accepted card at a time. For migration work it must follow the accepted contract and named locks exactly and must stop for any sequencing, scope, security, or source-of-truth decision.
- Terra cannot accept its own work or act as a domain/final acceptance authority. Independent review remains mandatory, and Sol remains the sole final integration and acceptance authority.
- The observed runtime ceiling remains four total active agents. G-003 resumes first; G-004 and G-005 remain serialized behind it, while Q-002 and UI-000 stay queued for disjoint capacity.

## Pilot acceptance receipt

- Batch: `platform-tenancy-001`.
- Domain task commits: `8c48db28653e2b287de6a94cc45d6c5439371d0e`, `4fa948ae3af6900227f2351ec359b6016d1af64a`.
- Integration merge: `cb329b4a6adaaa0c940f16b433198297e2712c7f` using a non-fast-forward merge.
- Independent PostgreSQL 16 review: 2/2 passed with 42 migrations discovered, 40 applied, and only the two documented cron migrations skipped through portable shims.
- Final integration gate: TypeScript, ESLint, 37-table recovery schema verification, 124 passing test files with 2,201 passing tests, Next.js 16.2.6 production build, and 5/5 public read-only Playwright checks.
- Known blocker: opt-in T029 recovery restore remains blocked at the accepted G-006/G-008 boundary; it is not represented as passing.
- External boundary: local-only. Nothing was pushed, deployed, applied to a remote database, or exercised against customer data or paid providers.
