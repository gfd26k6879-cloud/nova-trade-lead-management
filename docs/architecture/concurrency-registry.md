# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 3 pilot accepted; Stage 4 active; G-003 accepted; G-004A ready under locks; G-004B preserved for G-013/G-014; Q-002 domain-conductor repair active.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` is the exact start revision for all five domain branches and worktrees. G-002 was independently reviewed, repaired, merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`, and passed the final integration gate. G-003 passed fresh domain/security and Quality review, merged at `ba1b646974e1bf91234f37567ca8b4a9a6342171`, and passed the final merged integration gate. Dual G-004 preflight proved that the runtime lacks durable job/run/lease correlation and currently stores tenant content in `worker_runs`; the final conductor therefore applied the accepted ownership map by splitting structural `G-004A` from runtime `G-004B` without closing the parent card or dropping any success criterion. Q-002 candidate `6dbc7879e9669e5b934211ff1d3c73ffc302bd31` remains under the bounded Quality conductor repair. Sol remains the sole final integration/acceptance authority, and the observed four-total-agent ceiling remains binding.

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
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | Refreshed cleanly to `7289b0d848cafc2cf4f6a6e2e084edada2ee258c`; one Terra-medium worker is implementing the exact six-file structural `G-004A` packet under three locks. Runtime `G-004B` remains preserved for G-013/G-014. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | UI-000 seven-artifact design packet completed read-only at `feb6ecd2c0772879ae86b3949fa688cd7607c35d`; complete UI-001–UI-041 state matrix prepared; implementation and product/design/accessibility approval remain pending. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Q-002 repair-round-3 candidate `a6f05e7bf84a71c1b48b353c4c75b811a2d87aff` is clean and under fresh independent rereview; it remains unaccepted. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | `G-004A` / Discovery | Held for the exact serialized six-file packet | Release on accepted integration, rejection, or source-truth blocker; stop on sequencing or scope expansion. |
| `migration-harness` | `G-004A` / Discovery | Held for only the 44/42/2 reconciliation | Preserve the accepted T029 boundary and do not change recovery semantics. |
| `sqlite-schema` | None | Available | Accepted task receipt. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | `G-004A` / Discovery | Held only for the named full-chain count assertions; semantics frozen | T029 remains blocked at its accepted `user_market_access` key boundary. |
| `full-release-gate` | None | Available; merged G-002 gate passed | `npm run release:check` exited 0 at merge `cb329b4a6adaaa0c940f16b433198297e2712c7f`. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

The opt-in T-029 recovery rehearsal stops after the 42-discovered/40-portable migration replay because its legacy `user_market_access` key contract predates G-002 tenant-inclusive identity. This is recorded as blocked—not passing—and is deferred to the planned G-006 SQLite parity and G-008 reconciliation boundary after G-002 through G-005 are structurally accepted. G-002 did not weaken tenant identity or expand the recovery design around only the first of those four migrations.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Accepted | Ownership contract repaired, independently verified, and reaccepted through append-only event 205. |
| `G-002` | Accepted | Independently reviewed repair merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`; final local release gate passed. |
| `G-003` | Accepted | Source `7b305e6` passed dual review and merged at `ba1b646`; final merged release gate passed with 2,202 tests, build, and Playwright 5/5. |
| `G-004A` | Terra-medium implementation in progress under three locks | Exact six-file structural tenant-scope packet at baseline `7289b0d`; it must not invent runtime correlation or claim the current worker envelope is non-content. |
| `G-004B` | Preserved; blocked on G-004A/G-009/G-011 | Co-deliver immutable per-attempt job/run/lease/generation correlation and bounded non-content `worker_runs` hardening with G-013/G-014. |
| `G-004` | Parent open | Accept only after independently accepted G-004A and G-004B. Every original success criterion and the two-tenant runtime proof remain required. |
| `G-005` | Blocked on accepted `G-004A` structural milestone | Serialized final Phase 2 structural migration producer; parent G-004 remains a phase-gate obligation. |
| `G-023` | Accepted | Included in transition baseline; no new work. |
| `Q-002` | Independent rereview in progress | Round-3 candidate `a6f05e7` reports all prior blockers closed inside the same six-file ceiling; no acceptance before fresh reproduction. |
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

## G-003 Terra-medium dispatch receipt

- Dispatch baseline: `bf373a0822215d12e2a1f651142a4773b3f5a28b` on clean branch `codex/nova-discovery-decisioning`.
- Worker policy: one `gpt-5.6-terra` worker at medium reasoning; one primary card; no self-acceptance; stop for any contract, sequencing, security, or source-of-truth decision.
- Exact write set: `supabase/migrations/202607290002_add_lead_crm_tenant_scope.sql`, `src/lib/__tests__/lead-crm-tenant-scope-postgres.test.ts`, `docs/validation/2026-07-29-g003-lead-crm-tenant-scope.md`, the pre-G-002 cutoff plus 43/41/2 expectations in `src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts`, and only the 43/41/2 inventory/log expectations in `src/lib/__tests__/data-transfer-contract.test.ts`.
- Locks: `migration-sequence`, `migration-harness`, and `recovery-contract`. Recovery behavior remains frozen; the last two files cannot expand beyond the named reconciliation.
- Required outcome: one attributable implementation commit plus focused PostgreSQL 16, hostile-search-path, transaction/idempotency, rollback/orphan, migration-count, typecheck, lint, and diff evidence. No push, deploy, provider call, customer data, or remote database.

## G-003 review round 1

- Producer commit: `dd871b775ea0df95e3e7435c921ce13185f13e67`, exactly one attributable commit over `bf373a0822215d12e2a1f651142a4773b3f5a28b`, with exactly the five authorized paths and a clean producer worktree.
- Correct portions: tenant/place and compound parent keys, parent-derived child tenant, bounded 43/41/2 inventory edits, preserved T029 recovery boundary, and no G-004/G-005/SQLite/recovery implementation expansion.
- P1 rework: exhaustive definition-aware replay catalog so partial/wrong named objects cannot bypass the exact T028 receipt; real nonempty upgrade, receipt drift/duplication, orphan/rollback, and hostile-search-path application evidence; complete actor isolation or removal of selectively incomplete actor policy; an explicitly grounded, nested-shape-bounded public demo DTO tested under actual anonymous/default-deny privileges.
- P2 rework: tenant-inclusive open-admin-request uniqueness; pre-G-002 harness must stop before G-002 and every later migration; full catalog/workspace/global-slug/RLS/privilege/inheritance/replay invariant tests.
- Disposition: `repair_delta_required`. Locks remain held. The same Terra-medium producer may amend only the existing five files, must correct the validation receipt to match observed evidence, and must return one bounded repair commit for new independent review.

## G-003 repair round 2

- Repair 1 commit: `dd8930b8361ba4df10edf0991cc0cf93f27644bc`, one attributable commit over `dd871b775ea0df95e3e7435c921ce13185f13e67`, four authorized files, clean producer worktree.
- Corrected: pre-G-002 mode no longer applies G-003 or later migrations; open admin uniqueness is tenant-inclusive; the safe public DTO is grounded in fields read by the current public renderer; actor fields are enumerated independently rather than coalesced.
- Still unaccepted: replay detection remains insufficiently definition-aware; lead actor checks do not fire on insert or actor-only update; existing actor scope is not preflighted; the committed test still lacks the mandatory nonempty legacy T028-to-G002-to-G003 receipt/rollback/orphan/hostile-path matrix and actual anonymous/default-deny proof.
- Repair-round-2 requirement: close all remaining P1 behavior and evidence gaps in the same five-file ceiling, or return an explicit blocker with no commit. No partial evidence claim can advance to acceptance.
- Repair-round-2 result: explicit blocker with a clean worktree at `dd8930b8361ba4df10edf0991cc0cf93f27644bc`, zero file/resource change, and no third commit. The remaining coupled migration/harness rewrite activates the binding plan's final-conductor repair exception after two failed bounded repair attempts. Final-conductor implementation does not waive independent domain and Quality review.

## G-003 final-conductor review rounds

- Final-conductor candidate 0fe3854370a99811558ce9a50a394520b2175195
  passed independent Quality validation but was not accepted. Independent
  domain/security review retained all locks for writer TOCTOU, incomplete
  replay-definition/owner recognition, historical-actor authorization,
  renderer type-gating, and redundant-index findings.
- Repair candidate 717fa10fd2773f522a3a3fa4dc6815fa2fa0fc15
  remains within the same authorized five-file aggregate scope. The three-file
  delta adds writer-conflicting locks through commit, exact portable function
  fingerprints and catalog metadata, historical-versus-active actor semantics,
  nested renderer type gates, and redundant-index removal.
- Producer evidence is G-003 PostgreSQL 16 2/2 with the expanded two-client
  race and five catalog spoofs, G-002 2/2 at 43/41/2, focused 13/3, typecheck,
  lint, diff check, and the preserved T029 recovery-key stop. This is evidence
  only: both independent conductors are rereviewing the immutable repair.
- Locks migration-sequence, migration-harness, and recovery-contract remain
  held. No merge, acceptance, release-lock change, G-004 dispatch, or external
  action may occur until both rereviews pass.
- The `717fa10` Quality rereview passed the full local release gate, but domain
  rereview still found the partial admin index and overload-insensitive ACL
  classifier spoofable plus FK deparsing sensitive to a hostile `search_path`.
  Quality evidence is retained as evidence for that immutable commit only; it
  cannot accept the repaired successor. Final repair round 3 is limited to
  exact index/function privilege identity, catalog-based FK classification,
  two matching spoof cases, and a true no-receipt replay under hostile search
  path. Fresh domain and Quality reviews remain mandatory.

## Q-002 Terra-medium repair receipt

- Initial candidate `a4953680cbd2781890b5fe022c2a71edc472f963` changed five
  authorized paths and added sibling workspaces, but its named PostgreSQL test
  was only a static catalog assertion and left the database empty.
- Independent review retained the card for missing deterministic cross-tenant
  look-alike records, committed exact-ID cleanup, real PostgreSQL 16 seed and
  cleanup twice, suspended and same-tenant sibling-workspace denials, and E2E
  selectors derived from the shared browser-safe fixture catalog.
- Terra repair round 1 may change only the original six-file ceiling, creates
  no lock, and must return real disposable-loopback PostgreSQL 16 evidence plus
  focused unit, authorization, type, lint, and diff checks. It cannot accept or
  merge its own result.
- Repair round 1 stopped cleanly at `a4953680` with no files, commit, or local
  resource because the worker judged the missing database adapter and cleanup
  flow too large for a narrow patch. Repair round 2 retains the same scope and
  contract, but explicitly permits a test-local postgres.js adapter and minimal
  disposable schema inside the authorized PostgreSQL test file. It still cannot
  change product schema or accept its own result.
- Repair round 2 candidate `6dbc7879e9669e5b934211ff1d3c73ffc302bd31`
  closed the look-alike selector, authorization-negative, and shared E2E
  findings. It remains unaccepted because cleanup deletes immutable support
  history only after the SQLite test drops real guards, while the PostgreSQL
  test substitutes a reduced eight-table schema and replacement repository.
- Two failed worker repair generations activate the binding plan's bounded
  domain-conductor takeover. Repair round 3 must keep the correct work, never
  drop or bypass immutable history guards, separate rollback-only history from
  committed cleanup-safe fixtures if necessary, validate against the tracked
  PostgreSQL schema/migration and adapter contract, require PostgreSQL 16
  exactly, and return to a separate independent reviewer.

## G-003 acceptance receipt

- Accepted source: `7b305e69efc05d9ec0d032aeca3e8a763a28e4d2`;
  integration merge: `ba1b646974e1bf91234f37567ca8b4a9a6342171`.
- Independent domain/security review closed every index, ACL, FK, replay,
  search-path, lock, actor, JSON, and recovery-boundary finding with no P1/P2
  remainder. Independent Quality reproduced PostgreSQL 16 G-003 2/2, G-002
  2/2 at 43/41/2, and only the accepted T029 recovery-key stop.
- The merged integration `npm run release:check` passed TypeScript, ESLint, the
  37-table recovery verifier, 125 Vitest files with 2,202 passing tests, the
  Next.js 16.2.6 production build, and 5/5 public read-only Playwright checks.
- `migration-sequence`, `migration-harness`, and `recovery-contract` are
  released. G-004 is ready only after the Discovery branch is refreshed to the
  accepted control baseline and its exact serialized packet is reacquired.
- All activity was local and disposable. Nothing was pushed, deployed, sent to
  a remote database, or exercised against customer data or paid providers.

## Pilot acceptance receipt

- Batch: `platform-tenancy-001`.
- Domain task commits: `8c48db28653e2b287de6a94cc45d6c5439371d0e`, `4fa948ae3af6900227f2351ec359b6016d1af64a`.
- Integration merge: `cb329b4a6adaaa0c940f16b433198297e2712c7f` using a non-fast-forward merge.
- Independent PostgreSQL 16 review: 2/2 passed with 42 migrations discovered, 40 applied, and only the two documented cron migrations skipped through portable shims.
- Final integration gate: TypeScript, ESLint, 37-table recovery schema verification, 124 passing test files with 2,201 passing tests, Next.js 16.2.6 production build, and 5/5 public read-only Playwright checks.
- Known blocker: opt-in T029 recovery restore remains blocked at the accepted G-006/G-008 boundary; it is not represented as passing.
- External boundary: local-only. Nothing was pushed, deployed, applied to a remote database, or exercised against customer data or paid providers.
