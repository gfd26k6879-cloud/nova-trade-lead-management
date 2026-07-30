# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 3 pilot accepted; Stage 4 active; G-003, G-004A, G-005, G-006R, and Q-002 accepted; parent G-006 remains open; G-004B preserved for G-013/G-014.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` is the exact start revision for all five domain branches and worktrees. G-002 was independently reviewed, repaired, merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`, and passed the final integration gate. G-003 passed fresh domain/security and Quality review, merged at `ba1b646974e1bf91234f37567ca8b4a9a6342171`, and passed the final merged integration gate. G-004A passed fresh dual review, merged at `8383fa70a2bac8de71413ae135918bbaedf907b4`, and passed the final merged release gate; parent G-004 remains open for preserved runtime G-004B. G-005 passed repaired fresh dual review, merged at `d2d6e7f4d84c8ed94f15f9c2988b786f765f75b6`, and passed the final merged release gate. Q-002 remains accepted at `f95681062200d13be71f85797c38f6dfa28edcbb`. G-006 preflight proved that archive identity must be versioned before SQLite physical keys can change, so Sol preserved the full card as serialized children G-006R, G-006A, G-006B, and the compatibility-adapter G-006C sequence. Repaired G-006R source `3443816f0e2dbe98c12a95aafb36ba03a3040e37` passed fresh dual review, merged at `43a2387e7e9b7b63dabbf1341c5c0e54178771ff`, and passed the final merged release gate; `recovery-contract` is released. Sol remains the sole final integration/acceptance authority, and the four-total-agent ceiling remains binding.

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
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | G-006A source `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2` is rejected by fresh dual review; repair round 1 is bounded to the same four paths with no startup activation. |
| Knowledge, Evidence, and Strategy | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\knowledge-strategy` | Created clean at `1c9647d76c35dbac991b07eb962de5a54135bce2`; implementation lane not yet dispatched. |
| Discovery, Accounts, and Decisioning | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\Documents\NovaTradeWorktrees\discovery-decisioning` | G-004A source `c0892a06325b33657e5b73813635fec6a4081012` is accepted through integration `8383fa70a2bac8de71413ae135918bbaedf907b4`; runtime G-004B remains preserved and blocked for co-delivery with G-013/G-014. |
| Product Workflow and UI | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\Documents\NovaTradeWorktrees\product-workflow` | UI-000 seven-artifact design packet completed read-only at `feb6ecd2c0772879ae86b3949fa688cd7607c35d`; complete UI-001–UI-041 state matrix prepared; implementation and product/design/accessibility approval remain pending. |
| Quality, Compatibility, and Release | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\Documents\NovaTradeWorktrees\quality-release` | Q-002 source `a6f05e7bf84a71c1b48b353c4c75b811a2d87aff` passed independent review, merged at `f95681062200d13be71f85797c38f6dfa28edcbb`, and is accepted after the final release gate. |

The non-OneDrive root is selected to avoid sync churn and lock contention. The authoritative repository remains in its existing OneDrive path.

## Initial lock registry

| Lock | Holder | State | Release evidence |
|---|---|---|---|
| `integration-ledger` | Final integration conductor | Held | Released only when final integration authority ends. |
| `migration-sequence` | None | Available after accepted G-005 | G-006 must declare whether this PostgreSQL sequence lock is needed before acquisition. |
| `migration-harness` | None | Available after accepted G-005 | G-006 must name any shared inventory harness before acquisition. |
| `sqlite-schema` | G-006A | Held for the staged final-schema catalog and coordinator | Release only after attributable commit, focused fresh/upgrade/fault tests, fresh dual review, local merge, and merged release gate. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | None | Available | Accepted task receipt. |
| `recovery-contract` | G-006A | Held read-compatible with the accepted G-006R archive contract | G-006A may not edit recovery files; release with accepted staged-artifact evidence or on a recorded stop. |
| `full-release-gate` | None | Available; merged G-006R gate passed | `npm run release:check` exited 0 in 94.6 seconds at merge `43a2387e7e9b7b63dabbf1341c5c0e54178771ff`. |

No domain lane may claim a lock implicitly. Every acquisition must name the task, exhaustive protected paths, integration baseline, expected release evidence, and stop conditions in the ledger.

The opt-in T-029 recovery rehearsal currently stops after the 44-discovered/42-portable migration replay because its legacy `user_market_access` key contract predates G-002 tenant-inclusive identity. This is recorded as blocked—not passing—and is deferred to the planned G-006 SQLite parity and G-008 reconciliation boundary after G-002 through G-005 are structurally accepted. G-002 through accepted G-004A did not weaken tenant identity or expand the recovery design around only part of that migration sequence.

## Ready-queue checkpoint

| Task | Queue | Reason |
|---|---|---|
| `G-001` | Accepted | Ownership contract repaired, independently verified, and reaccepted through append-only event 205. |
| `G-002` | Accepted | Independently reviewed repair merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`; final local release gate passed. |
| `G-003` | Accepted | Source `7b305e6` passed dual review and merged at `ba1b646`; final merged release gate passed with 2,202 tests, build, and Playwright 5/5. |
| `G-004A` | Accepted structural milestone | Source `c0892a0` passed fresh domain/security and Quality review, merged at `8383fa7`, and passed the full merged release gate. |
| `G-004B` | Preserved; blocked on G-004A/G-009/G-011 | Co-deliver immutable per-attempt job/run/lease/generation correlation and bounded non-content `worker_runs` hardening with G-013/G-014. |
| `G-004` | Parent open | Accept only after independently accepted G-004A and G-004B. Every original success criterion and the two-tenant runtime proof remain required. |
| `G-005` | Accepted | Source `28005a3` passed repaired dual review, merged at `d2d6e7f`, and passed the full merged release gate. Runtime propagation and T029 reconciliation remain later cards. |
| `G-006` | Parent split open | Preserve every success criterion through serialized G-006R recovery identity, staged G-006A fresh schema/coordinator, G-006B receipt-bound finalization, and the G-006C compatibility-adapter sequence. Accept only after all children independently pass and startup activation is proven. |
| `G-006R` | Accepted | Repaired source `3443816` passed fresh domain/security and independent Quality review, merged at `43a2387`, and passed the full merged release gate. |
| `G-006A` | Repair round 1 authorized | Source `7286bc6` is rejected for rollback escape, copyable/reusable capability, incomplete 37-table preservation, same-connection physical-schema trust, and an unpinned definition digest. The same four-path ceiling remains binding. |
| `G-006B` | Blocked on accepted G-006A | Consume exactly one verified T028 SQLite receipt and verified backup to atomically finalize 17 non-audit tables with interruption/replay proof. |
| `G-023` | Accepted | Included in transition baseline; no new work. |
| `Q-002` | Accepted | Source `a6f05e7` passed independent exact PostgreSQL 16 review; merge `f956810` passed the full release gate. |
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

## G-004A final-conductor repair receipt

- Two failed bounded worker generations activated the binding plan's
  final-conductor exception. The repair remains inside the accepted six-file
  aggregate ceiling and is sealed at source commit
  `c0892a06325b33657e5b73813635fec6a4081012` over parent
  `3572d60ee3643b9c042a5aaf1c4fafd0d3bc15ef`.
- The three-file repair delta makes tenant-column nullability part of exact
  replay identity and rejects non-owner column ACLs plus effective anonymous
  or authenticated column privileges during activation and replay. Live
  nullable-column and column-ACL spoofs are covered without residue.
- Producer evidence is G-004A PostgreSQL 16 1/1, G-003 2/2, G-002 2/2,
  typecheck, focused lint, and diff check. T029 remains truthfully stopped only
  at the accepted `user_market_access` recovery-contract mismatch after 42
  applied migrations and 2 named skips.
- This is not acceptance. Fresh domain/security and independent Quality
  rereviews own the immutable commit. The `migration-sequence`,
  `migration-harness`, and `recovery-contract` locks remain held; G-005 stays
  preflight-ready but cannot execute until both reviews pass, G-004A is merged
  and accepted, and the locks are released.

## G-004A structural milestone acceptance receipt

- Accepted source: `c0892a06325b33657e5b73813635fec6a4081012`;
  integration merge: `8383fa70a2bac8de71413ae135918bbaedf907b4`.
- Independent domain/security review reproduced the full PostgreSQL 16 G-004A,
  G-003, G-002, and accepted T029 boundary. Independent Quality reproduced the
  exact G-004A matrix and both final spoof repairs; its interrupted downstream
  wrapper is recorded separately and is not represented as evidence.
- The merged `npm run release:check` passed TypeScript, ESLint, the 37-table
  recovery verifier, Vitest, the Next.js 16.2.6 production build, and public
  read-only Playwright smoke in 186.3 seconds.
- G-004A is accepted only as the structural AI tenant-scope milestone. Parent
  G-004 remains open: G-004B still owns immutable worker correlation and the
  `worker_runs.result_json` content boundary required before G-013/G-014.
- `migration-sequence`, `migration-harness`, and `recovery-contract` are
  released for serialized G-005 execution after its domain branch refresh.
  All validation was local; nothing was pushed, deployed, or applied to a
  remote database or production system.

## G-005 Terra-medium dispatch receipt

- Baseline: accepted G-004A integration
  `634ffe99ea9d35877429e57b38301138f18b6c2c` on clean branch
  `codex/nova-platform-tenancy`.
- Worker policy: one `gpt-5.6-terra` worker at medium reasoning, one bounded
  preaccepted card, no self-acceptance, and stop for sequencing, source-policy,
  recovery, runtime-writer, security, or scope decisions.
- Exact seven-file ceiling: migration
  `202607290004_add_source_cache_usage_tenant_scope.sql`, its dedicated
  PostgreSQL test and validation receipt, plus count/log-only reconciliation in
  the G-002, G-003, accepted G-004A, and T029 harnesses.
- Contract: tenant-wide `place_cache`, `places_master`,
  `place_observations`, and `api_usage_events`; exact source card
  `google_places_legacy`; tenant/source/place identity; no shared raw provider
  observations; nested review and credential rejection; receipt, rollback,
  hostile-path, RLS, ACL, concurrency, and two-tenant PostgreSQL 16 proof at
  `45 discovered / 43 applied / 2 named scheduler skips`.
- `migration-sequence`, `migration-harness`, and `recovery-contract` are
  reacquired. Application/runtime propagation remains G-020/G-021/G-022,
  T029 recovery behavior remains frozen at its accepted blocker, and no
  external action is authorized.

## G-005 producer and review receipt

- Producer commit `fdb067d8d8fcaf833f11e810758e615f2a8b68cb` is exactly
  one commit over dispatch control `88ac0314a0cebfa1f7cec131a27c14a0e7c65da0`,
  changes exactly the seven authorized paths, and leaves the producer worktree
  clean.
- Producer evidence reports G-005 PostgreSQL 16 1/1 at 45/43/2, G-004A 1/1,
  G-003 2/2, G-002 2/2, focused defaults, typecheck, focused lint, production
  build, and only the accepted T029 recovery-key stop after 43/2.
- This is evidence, not acceptance. Fresh domain/security and independent
  Quality reviewers own the immutable commit. All three migration locks remain
  held until Sol's merged release gate and acceptance decision.

## G-005 repair round 1

- Fresh domain/security and Quality review independently live-proved the same
  four defects on PostgreSQL 16.14: unsupported `min(uuid)` on valid
  place-only tenant derivation, replay acceptance of tenant defaults, replay
  acceptance of client column privileges, and replay acceptance of executable
  same-name helper overloads.
- Passing receipt, isolation, parent, content, hostile-path, lock, downstream,
  and T029 evidence is retained as evidence for `fdb067d8` only. It does not
  waive fresh repaired-commit validation.
- Repair round 1 remains inside the same seven-file aggregate ceiling and is
  expected to touch only the migration, dedicated PostgreSQL harness, and
  validation receipt. The three migration locks remain held, and fresh dual
  review is mandatory after repair.

- Repair commit `28005a3f44faf31328f0d5998d91957cb7fa4e1a` is exactly
  one commit over `fdb067d8`, changes only those three expected files, and
  leaves the producer worktree clean. Its passing producer evidence is now
  under fresh domain/security and independent Quality rereview; it is not yet
  merged or accepted.

## G-005 acceptance receipt

- Accepted source: `28005a3f44faf31328f0d5998d91957cb7fa4e1a`;
  integration merge: `d2d6e7f4d84c8ed94f15f9c2988b786f765f75b6`.
- Fresh domain/security and Quality rereviews independently closed all four
  PostgreSQL 16 findings and reproduced G-005 at 45/43/2, G-004A, G-003,
  G-002, and only the accepted T029 recovery-key boundary.
- The merged `npm run release:check` passed TypeScript, ESLint, the 37-table
  recovery verifier, Vitest, the Next.js 16.2.6 production build, and public
  read-only Playwright smoke in 201.3 seconds.
- The three serialized locks are released. G-006 dependency preflight may now
  inspect the accepted G-002 through G-005 structural keys, but must not treat
  G-004B, runtime propagation, T029 reconciliation, Q-040, or later phase gates
  as satisfied.
- All work was local. Nothing was pushed, deployed, applied to a remote
  database, or exercised against provider/customer production data.

## G-006 dual-preflight receipt

- Platform branch `codex/nova-platform-tenancy` was fast-forwarded cleanly from
  accepted G-005 source `28005a3f44faf31328f0d5998d91957cb7fa4e1a` to
  accepted integration baseline `9dfd4f5f9119edc86692e9689e1d51f3e655377a`.
- Domain and independent Quality reviewers are inspecting the actual SQLite
  schema, upgrade helpers, recovery tests, accepted G-002 through G-005 keys,
  and T029 boundary read-only. They must return exhaustive file packets,
  lock/collision needs, fresh and nonempty upgrade behavior, deterministic
  compatibility-tenant handling, interruption and destructive-rebuild stop
  conditions, and row-count/FK/checksum evidence.
- No implementation worker, lock, temporary resource, repository change, or
  external action is authorized by this receipt. Sol will reconcile both
  packets before accepting a G-006 write set or dispatching Terra-medium.

## G-006 split and G-006R launch receipt

- The domain packet and independent source trace both rejected one-shot G-006:
  SQLite currently lacks a whole-upgrade journal/recovery fixture, and T029
  schema version 3 incorrectly equates archive identity with physical primary
  keys that G-006 must replace. Sol's direct schema probe confirmed all sixteen
  G-002 through G-005 tables retain legacy SQLite keys and no tenant columns.
- Parent G-006 remains open. G-006R first versions logical archive identity;
  G-006A then introduces final fresh shapes and the fail-closed coordinator;
  G-006B finally consumes an exact T028 receipt plus verified online backup to
  rebuild the seventeen non-audit compatibility tables atomically. G-008 still
  owns generalized dry-run reconciliation and every ambiguous ownership case.
- G-006R owns exactly `scripts/data-transfer-contract.mjs`,
  `scripts/export-sqlite-data.mjs`, `scripts/import-supabase-data.mjs`,
  `scripts/verify-data-recovery.mjs`,
  `src/lib/__tests__/data-transfer-contract.test.ts`, `docs/DATA_RECOVERY.md`,
  and `docs/validation/2026-07-29-g006r-recovery-logical-identity.md`.
- Only `recovery-contract` is held. PostgreSQL migration sequence, SQLite
  schema, application/runtime, G-004B worker envelope, generalized G-008
  reconciler, provider/customer systems, and remote/production state are out of
  scope. Terra-medium cannot self-review or accept this packet.

## G-006R producer and review receipt

- Producer source `9087af7d73b7174a3683b771b877bf40eb0fd1ab` is
  exactly one commit over baseline `9dfd4f5f9119edc86692e9689e1d51f3e655377a`,
  changes exactly the seven authorized paths, and leaves the Platform worktree
  clean. The producer did not review or accept its work.
- Producer evidence: focused Vitest 13 passed with one explicit opt-in skip;
  fresh disposable PostgreSQL 16 rehearsal 14/14 with 45 discovered, 43
  applied, and two named scheduler skips; the 37-table recovery verifier,
  typecheck, full lint, four script syntax checks, and diff check passed.
  Task-owned PostgreSQL resources were removed.
- Fresh domain and independent Quality reviews must reproduce both schema-3
  frozen behavior and schema-4 logical identity behavior, inspect exact target
  uniqueness including `NULLS NOT DISTINCT`, audit the seven-path ceiling, and
  confirm G-006A/B, G-007/G-008, runtime, G-004B, and external boundaries remain
  untouched. `recovery-contract` remains held during review.

## G-006R review rejection and repair round 1

- Source `9087af7d73b7174a3683b771b877bf40eb0fd1ab` is rejected and must not be
  merged or accepted. Both independent reviewers reproduced a P1: schema 4
  encodes an empty physical-primary-key column list as the same `[]` tuple for
  every row, so the second valid logical row is falsely rejected after G-006
  removes the legacy SQLite primary key.
- Independent Quality review also reproduced a P2: PostgreSQL target discovery
  accepts a deferrable exact unique constraint even though it cannot arbitrate
  the later `ON CONFLICT`. Target preflight must require an immediate unique
  arbiter and reject `indimmediate = false` before import.
- Repair round 1 remains within the same seven-path G-006R ceiling. Required
  regressions cover two distinct rows with no physical primary key, duplicate
  nullable logical identity rejection, null versus the literal string `null`,
  and rejection of deferrable PostgreSQL uniqueness. Existing schema-3 and
  schema-4 evidence must be rerun on the repaired immutable commit.
- SQLite partial-index enforcement for the nullable `user_market_access`
  workspace identity is a mandatory G-006A handoff: that child must either
  validate the exact null/non-null partial-index family or define and validate
  an equivalent explicit NULL guard. G-006R may validate logical rows but must
  not claim that the current ordinary SQLite unique index physically enforces
  NULL equality.
- `recovery-contract` remains held. No merge, acceptance, release, external
  action, SQLite schema change, or G-006A implementation is authorized during
  this repair.
- The original Terra-medium producer is repairing the immutable rejected
  source within that same ceiling. Fresh dual review is mandatory on the new
  one-commit repair tip before Sol may merge or accept it.
- Two read-only G-006A preflights may run concurrently with that repair because
  they hold no locks and make no changes. They cannot authorize G-006A or cross
  its accepted-G-006R dependency; their only output is Sol-reconciled launch
  evidence for the next child.
- Repair source `f11cb1abcb6b36734b8dee637bc832aad82811f5` is exactly
  one commit over rejected `9087af7`, changes the same seven paths, and leaves
  the producer worktree clean. Producer evidence is green; fresh independent
  rereview is active and the source is not merged or accepted.
- The G-006A domain preflight found that its final schema/coordinator can be a
  four-path structural artifact, but startup activation before current SQLite
  writers receive an explicit compatibility scope would break the preserved
  local workflow. A bounded G-006C compatibility adapter is therefore under
  Sol reconciliation; tenant defaults, inferred scope, and early startup wiring
  remain forbidden.

## G-006 activation sequencing reconciliation

- G-006A first stages a new final-schema/catalog artifact, version coordinator,
  focused fault/restart tests, and validation receipt without changing
  `getDb()` or the frozen legacy `SCHEMA_SQL`. This is a reviewed preparation
  milestone only: G-006A stays open and cannot unlock downstream cards.
- G-006B then creates a verified recovery backup, consumes one explicit T-028
  manifest, provisions/validates the named compatibility identity, backfills
  nullable scope columns, and records the immutable completed receipt. This is
  also an internal milestone; G-006B stays open before final constraints.
- G-006C adds the bounded SQLite compatibility adapter. It selects the exact
  configured completed receipt or explicit fresh binding, validates the named
  tenant/workspace relationships, and makes every legacy compatibility writer
  bind scope explicitly. It is storage scope only and grants no authentication
  or authorization.
- After G-006C writer coverage passes, G-006B may atomically rebuild/finalize
  the seventeen non-audit tables against the staged catalog, and G-006A may wire
  the coordinator into startup. Parent G-006 closes only after both upgraded
  and explicitly provisioned fresh fixtures pass the merged release gate.
- Hardcoded identities, first/only-row selection, active-browser or request
  tenant inference, SQL defaults/triggers/UDF fill, statement rewriting,
  nullable final ownership, early startup activation, and treating a receipt as
  access authority are forbidden. G-009 through G-022 later replace the bounded
  adapter with ordinary required request/worker scope.

## G-006R repair round 2

- Source `f11cb1abcb6b36734b8dee637bc832aad82811f5` is rejected and must not be
  merged or accepted. Both fresh lanes reproduced locale-dependent ordering of
  schema-4 SQLite unique-key metadata. Independent Quality review also found
  that predicate extraction treats a lexical `WHERE` inside a quoted index
  identifier as the start of the partial-index predicate.
- All earlier physical-key, logical-identity, SQLite partial-family, schema-3,
  PostgreSQL immediate-arbiter, rollback, hostile-path, scope, and cleanup
  findings are closed on this source, but their evidence must be rerun after
  repair. Round 2 is limited to a binary/code-unit comparator, a top-level
  quote/comment-aware final `WHERE` extractor, focused regressions, and truthful
  receipt wording within the same seven-path ceiling.
- `recovery-contract` remains held. Fresh dual rereview of the new immutable
  repair commit is mandatory; no merge, acceptance, G-006A implementation, or
  external action is authorized.
- The original Terra-medium producer is executing round 2 from `f11cb1a`; the
  repair holds the recovery contract. Two lock-free, read-only G-006C source
  inventories may run beside it; they cannot implement or waive G-006R,
  G-006A, or G-006B dependencies.
- Round-2 source `295dac10b414439d54e07b0d6e2976c074bf0185` is
  exactly one three-path repair commit over `f11cb1a`; the full aggregate still
  contains exactly the original seven G-006R paths and the worktree is clean.
  Fresh domain and independent Quality rereview are active.
- G-006C domain inventory found roughly 120 mutations across the seventeen
  ordinary T-028-owned tables, including scoped candidate/parent reads and
  hidden startup repairs. It cannot be reduced to INSERT/UPSERT or transparent
  SQL rewriting. Its implementation must use serialized compile-safe slices,
  unchanged PostgreSQL SQL, an opaque G-006B finalizer handoff containing exact
  source identity, and a fail-closed non-rewriting SQLite mutation guard.

## G-006C serialized internal split

- G-006C remains one parent compatibility-adapter child but is too large for
  one honest write packet: independent source counts found 122 operational
  tenant-table mutation starts across 91 functions plus initialization/catalog
  writes and high-collision fixtures.
- C0 owns the opaque binding contract/verifier and backend discriminant; C1
  owns initialization/fresh binding with G-006A/B; C2 bridges G-002 access and
  crawl writers; C3 bridges G-003 lead/CRM/demo writers and user cleanup; C4
  bridges G-004 AI writers; C5 bridges G-005 source/cache/usage writers; C6
  owns settings, explicit audit semantics, mutation coverage, and the merged
  integration gate.
- C0 through C6 run serially because `queries.ts`, `index.ts`, schema fixtures,
  and the runtime-writer boundary collide. They preserve current exported
  function signatures and the PostgreSQL SQL branch; G-009 through G-022 retain
  generalized request/worker scope and later adapter retirement.
- The G-006B handoff must include exact tenant, workspace, policy/owner,
  receipt, final catalog, source-card, compatibility-play, count/checksum, and
  zero-orphan bindings under one canonical hash. Without exact source-card
  identity or an explicitly provisioned fresh binding, mutable SQLite startup
  fails closed.

## G-006R repair round 3

- Source `295dac10b414439d54e07b0d6e2976c074bf0185` is rejected and must not be
  merged or accepted. Both fresh lanes persisted a SQLite `writable_schema`
  spoof where a physically wrong partial index retained duplicate NULL-workspace
  identities, stored DDL appended a second top-level exact `WHERE`, read-only
  reopen and `integrity_check` succeeded, and metadata validation falsely passed.
- Round 3 must require one balanced CREATE INDEX statement with exactly one
  top-level `WHERE`, no parenthesis underflow/unbalanced depth, and no statement
  separator or trailing tokens beyond an optional terminal semicolon plus
  whitespace/comments. A persisted close/reopen spoof regression is mandatory.
- The binary comparator and valid quote/comment/escape handling remain closed
  findings and must be preserved. Repair stays inside the existing seven-path
  ceiling, with fresh dual rereview and the recovery lock retained.
- The original Terra-medium producer is executing round 3 from `295dac1`; no
  dependent implementation or overlapping recovery-contract work is active.
- Two lock-free G-006B handoff preflights may inspect the immutable T-028 and
  recovery contracts beside round 3. They cannot implement, modify the T-028
  receipt, acquire locks, or waive any G-006R/G-006A dependency.
- Round-3 source `3443816f0e2dbe98c12a95aafb36ba03a3040e37` is
  one three-path repair commit over `295dac1`; the full aggregate remains the
  exact original seven G-006R paths and the worktree is clean. Fresh dual
  rereview is active.

## G-006B handoff storage decision

- G-006B will use an append-only, backup-bound, content-addressed sidecar with
  separate prepared and committed records. It will not add a 38th SQLite table,
  change the current 37-table recovery inventory, or reinterpret T-028.
- The operator must provide the exact sidecar path and expected handoff ID.
  C0 never scans a directory, selects latest, or infers identity. Both records
  bind the lossless SQLite backup, schema-3 logical archive, T-028 evidence for
  legacy mode, explicit fresh-provisioning evidence for fresh mode, scope,
  source/play, catalog, counts/checksums, audit preservation, and zero-orphan
  postconditions under canonical hashes.
- The prepared record is written and fsynced before SQLite commit. After commit
  and exact reopen verification, a separate immutable committed record is
  atomically published and directory-fsynced. C0 permits startup only for the
  explicitly pinned committed record and exact database state; every ambiguous
  crash state fails closed or resumes only from the bound archive.
- Database-only restore remains intentionally blocked without the pinned
  sidecar. If unattended database-only restore becomes a requirement, it needs
  a separate approved recovery-contract/version expansion. Fresh mode requires
  an explicit owner/foundation manifest and never fabricates a T-028 receipt.

## G-006R round-3 review receipt

- Fresh domain/security and independent Quality rereviews both PASS immutable
  source `3443816f0e2dbe98c12a95aafb36ba03a3040e37` with no P1/P2.
- Both lanes reproduced the persisted two-`WHERE` spoof after read-only reopen
  and `integrity_check=ok`; export, metadata validation, and the verifier now
  fail closed. Zero/multiple predicates, prefix, balance/underflow, separators,
  trailing tokens, qualified/quoted identifiers, comments/escapes, and binary
  ordering all passed.
- Each lane reran 18 focused tests plus one explicit opt-in skip, the 19-case
  PostgreSQL 16 matrix at 45 discovered/43 applied/two named skips, the
  deferrable-arbiter negative, rollback/hostile path, 37-table recovery,
  typecheck, lint, four syntax checks, diff/scope checks, and resource cleanup.
- G-006R is ready for local integration and the merged release gate. It is not
  accepted and `recovery-contract` is not released until that gate passes.

## G-006R acceptance receipt

- Sol locally merged reviewed source
  `3443816f0e2dbe98c12a95aafb36ba03a3040e37` as integration merge
  `43a2387e7e9b7b63dabbf1341c5c0e54178771ff`. The merge has the prior control
  commit `3866a320cef00bea47fe68b0aa6c555d9226ddb2` and the reviewed source as its
  two parents, and the integration worktree was clean.
- The exact merged `npm run release:check` exited 0 in 94.6 seconds under Node
  24.13.1. It passed TypeScript, ESLint, the 37-table recovery contract and
  schema verifier, Vitest, the Next production build, and the public read-only
  Playwright smoke suite.
- G-006R is accepted and `recovery-contract` is released. Parent G-006 remains
  open. G-006A may stage only its final schema catalog, fail-closed coordinator,
  focused tests, and receipt; mutable SQLite startup activation remains blocked
  until the G-006B and G-006C sequence is complete.
- All work and validation were local. Nothing was pushed, deployed, applied to
  a remote database, or sent to a provider or customer system.

## G-006A staged-artifact launch receipt

- Accepted launch baseline is control commit
  `a7c296298bf33f1cfb670741863c0ffe1629002c`, which contains accepted G-006R.
  The Platform worktree must be clean and fast-forwarded to this exact commit
  before any write.
- One Terra-medium producer owns exactly `src/lib/db/sqlite-schema-v1.ts`,
  `src/lib/db/sqlite-schema-coordinator.ts`,
  `src/lib/__tests__/sqlite-schema-coordinator.test.ts`, and
  `docs/validation/2026-07-29-g006a-sqlite-fresh-schema-coordinator.md`.
  `sqlite-schema` and `recovery-contract` are held; no other lane may overlap.
- The packet must derive final SQLite ownership columns, keys, foreign keys,
  indexes, and nullable-workspace uniqueness from accepted G-002 through G-005
  and G-006R source truth. It must expose a deterministic catalog digest and a
  fail-closed versioned whole-upgrade coordinator with focused fresh, legacy,
  interruption, replay, catalog-drift, row-count, foreign-key, and uniqueness
  evidence. Unknown or partially upgraded states must stop without inference.
- This is a preparation milestone, not G-006A acceptance. The producer must not
  edit or wire `schema.ts`, `db/index.ts`, queries/writers, T-028, recovery
  scripts, package configuration, or startup. It must not perform a destructive
  legacy rebuild, invent a tenant/workspace/source identity, grant authority
  from a receipt, or expand into G-006B, G-006C, G-007, or G-008.
- Required producer output is one attributable commit, clean worktree, focused
  tests, typecheck, lint, diff/scope checks, and a truthful receipt. Fresh dual
  review and Sol's final integration gate remain mandatory; no external action
  is authorized.

## G-006A producer and review receipt

- Terra-medium source `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2`
  is exactly one commit over dispatch control
  `88e49440d2ff52b4db249bd199b2b2a3547fe9a3`, changes exactly the four
  authorized paths, and leaves the Platform worktree clean.
- Producer evidence is focused Vitest 9/9, full typecheck, full lint, diff and
  scope checks. The pinned source, definition, final-catalog, and accepted
  legacy digests are recorded in the source receipt. The artifact claims 37
  application tables, 17 transform targets, no coordinator table, no identity
  defaults, preserved audit history, and no runtime/startup/recovery wiring.
- This is producer evidence only. Fresh domain/security review owns exact
  migration/key/FK/index/partial-uniqueness and hostile-catalog validation.
  Independent Quality owns capability-gate, transaction, interruption,
  rollback, replay, preservation, and milestone-boundary validation.
- `sqlite-schema` and `recovery-contract` remain held. No merge, acceptance,
  startup activation, destructive finalization, or external action may occur
  until both reviews pass and Sol completes the local merged gate.

## G-006A review rejection and repair round 1

- Source `7286bc6b2ee15cba2d19de0cd57b74c86f979fa2` is rejected and must not be
  merged or accepted. Both lanes proved that the raw database callback can issue
  `COMMIT` or `END`, escape the wrapper transaction, persist partial data or
  catalog changes, and still make the coordinator throw or misreport success.
- Independent Quality also proved that the enumerable symbol capability can be
  copied with a spread, its callback replaced, and one minted capability reused
  across multiple staged databases. Repair must use private identity-backed
  state, exact database/source/handoff binding, and one-shot consumption.
- Domain review proved that preservation omits non-target tables: deleting a
  `zip_codes` row still returned finalized. Repair must snapshot the source
  columns, counts, and canonical payload of all 37 application tables. The
  generated definition digest must be a pinned literal asserted by production
  code, not only a live computation or test literal.
- Quality persisted an exact-SQL-digest but physically wrong partial index that
  passed same-connection postconditions. A new connection exposed the missing
  index entry and failed integrity. Repair must prevent transaction/writable
  schema control through its bounded executor and require a file-backed,
  post-commit fresh-connection catalog, physical-index, FK, integrity, and
  preservation verification before reporting finalized.
- Repair round 1 stays inside the existing four paths. `schema.ts`, `getDb()`,
  writers, T-028, recovery files, package/startup wiring, G-006B/C/G-007/G-008,
  provider/customer systems, and remote/production state remain out of scope.
  Fresh dual rereview is mandatory; both locks remain held.
