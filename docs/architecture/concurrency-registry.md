# Nova Trade concurrency registry

Date: 2026-07-29

Status: **Stage 3 pilot accepted; Stage 4 active; G-003, G-004A, G-005, G-006R, the G-006A staged-artifact milestone, G-006A-P, and Q-002 accepted; G-006B B1 is ready; parent G-006 and final G-006A activation remain open; G-004B preserved for G-013/G-014.** Commit `3b1135c1c781a5a806a6053a01987a91b63e0bf3` contains the reviewed transition manifest. Control commit `1c9647d76c35dbac991b07eb962de5a54135bce2` is the exact start revision for all five domain branches and worktrees. G-002 was independently reviewed, repaired, merged at `cb329b4a6adaaa0c940f16b433198297e2712c7f`, and passed the final integration gate. G-003 passed fresh domain/security and Quality review, merged at `ba1b646974e1bf91234f37567ca8b4a9a6342171`, and passed the final merged integration gate. G-004A passed fresh dual review, merged at `8383fa70a2bac8de71413ae135918bbaedf907b4`, and passed the final merged release gate; parent G-004 remains open for preserved runtime G-004B. G-005 passed repaired fresh dual review, merged at `d2d6e7f4d84c8ed94f15f9c2988b786f765f75b6`, and passed the final merged release gate. Q-002 remains accepted at `f95681062200d13be71f85797c38f6dfa28edcbb`. G-006 preflight proved that archive identity must be versioned before SQLite physical keys can change, so Sol preserved the full card as serialized children G-006R, G-006A, G-006B, and the compatibility-adapter G-006C sequence. Repaired G-006R passed its final merged gate. G-006A round-6 source `87795a7ade9eb8ce51ee249d8adc7ac3e3d34341` passed fresh dual review, merged at `f340752fe4c76df6952982f8e742332b88193d65`, and passed the final merged release gate as a startup-disabled preparation artifact. G-006A-P source `c7d6e8e2848d993f7af178dae287d46522738e8b` passed fresh dual review, merged at `10a46dba346e3c62aff54e0785f552e04bcced72`, and passed the full merged release gate as an exact recognition-only prerequisite. Its lock is released and G-006B B1 may now launch explicitly. Sol remains the sole final integration/acceptance authority, and the four-total-agent ceiling remains binding.

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
| Platform, Tenancy, and Security | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\Documents\NovaTradeWorktrees\platform-tenancy` | Fast-forwarded cleanly to accepted integration baseline `99d3227`; G-006B B1 is authorized for one four-file Terra-medium packet. Startup activation remains blocked. |
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
| `sqlite-schema` | `G-006B-B1` | Held for legacy pre-finalization | Protects the exact accepted-legacy to prepared-legacy@6000 transaction and classifier boundary. |
| `auth-session` | None | Available | Accepted task receipt. |
| `permissions` | None | Available | Accepted task receipt. |
| `database-adapter` | None | Available | Accepted task receipt. |
| `package-config` | None | Available | Accepted task receipt. |
| `protected-shell` | `G-006B-B1` | Held for bounded Windows durable publisher | One static PowerShell/C# helper path only; no shell interpolation, arbitrary command, or external activity. |
| `recovery-contract` | `G-006B-B1` | Held read/freeze-only for backup and schema-3 binding | Existing recovery files and schema-3 contract may be consumed and tested but not edited or reinterpreted. |
| `full-release-gate` | None | Available; merged G-006A-P gate passed | `npm run release:check` exited 0 in 140.5 seconds at merge `10a46dba346e3c62aff54e0785f552e04bcced72`. |

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
| `G-006A` | Accepted staged-artifact milestone; child remains open | Round-6 source `87795a7` passed fresh dual review, merged at `f340752`, and passed the full merged release gate. Startup activation remains blocked until G-006B and G-006C0-C6 complete. |
| `G-006A-P` | Accepted recognition-only prerequisite | Source `c7d6e8e` passed fresh dual review, merged at `10a46db`, and passed the full merged release gate. It grants no prepared-state finalizer or startup authority. |
| `G-006B` | B1 Terra-medium producer active at `99d3227` | B1 is legacy-only: verified backup/schema-3 archive and source binding, four nullable source columns, exact backfill, durable prepared/committed evidence, and restart proof. Final constraints, `location_mode`, and startup remain later work. |
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

- Repair source `ff479d95ef624996b019968a489917a740ec2071` is exactly
  one commit over rejected `7286bc6`, changes the same four paths, and leaves
  the Platform worktree clean. Producer gates are focused Vitest 15/15,
  typecheck, full lint, 37-table recovery verification, diff/scope checks, and
  zero G-006A temporary residue.
- Fresh domain/security and independent Quality rereviews are active against
  the immutable repair. They must independently replay every transaction,
  capability, all-37 preservation, physical-index spoof, reopen, and
  committed-unverified recovery boundary. No merge or acceptance is authorized.

## G-006A repair round 2

- Repair `ff479d95ef624996b019968a489917a740ec2071` is rejected. Both lanes
  independently closed over the raw writable DB passed to the capability
  factory, bypassed the bounded session, committed partial data/catalog changes,
  and then threw. Rollback and preservation were no longer possible.
- Quality also proved that the token is not bound to the all-37 source payload
  at mint time, async callbacks can continue after a false finalized result,
  and a TEMP trigger can evade main-catalog/reopen verification and mutate data
  on a later ordinary write.
- Round 2 must execute no caller JavaScript inside the owned transaction. The
  capability stores a deeply validated/copied synchronous declarative operation
  plan, canonical file binding, exact mint-time source catalog/physical/all-37
  snapshot, and one-shot private state. The coordinator privately opens, locks,
  executes, verifies, and closes the writable file connection.
- Only main-schema, single-statement, bounded DDL/DML operations are allowed.
  Accessors, functions, thenables, mutable parameter objects, TEMP/TEMPORARY,
  attached databases, transaction/PRAGMA/writable-schema/catalog-control, and
  multi-statement routes fail closed. Fresh post-commit read-only reopen and
  committed-unverified recovery semantics remain mandatory.
- The same four files and both locks remain exclusive. Every prior passing
  catalog, source-identity, preservation, digest, physical-manifest, cleanup,
  and scope invariant must remain green. Fresh dual rereview is mandatory.

- Round-2 source `868efdcda51c07da26f9b75fa0f34528126fb328` is
  exactly one commit over rejected `ff479d9`, changes the same four paths, and
  leaves the Platform worktree clean. Producer gates are focused Vitest 18/18,
  typecheck, full lint, 37-table recovery verification, diff/scope checks, and
  zero temporary or task-process residue.
- Fresh domain/security and independent Quality rereviews are active. They own
  callback/reference absence, deep-plan validation, canonical mint-time source
  binding, main-only/temp/attached isolation, private writer transaction,
  all-37 preservation, physical spoof, fresh reopen, recovery-required, and all
  prior invariant reproduction. No merge or acceptance is authorized.

## G-006A repair round 3

- Round-2 source `868efdcda51c07da26f9b75fa0f34528126fb328` is rejected and must not
  be merged or accepted. Both fresh lanes proved that a capability minted for
  one database can finalize an exact clone swapped onto the same canonical
  path because the private state binds only the pathname and application-level
  snapshots, not the physical file identity.
- Both lanes also proved that declarative trigger bodies can mutate hidden
  `sqlite_sequence` rows and then remove every transient application object.
  The coordinator still reported `finalized` after the fresh read-only reopen,
  with the exact catalog and physical digests, 37 application tables, clean
  foreign-key results, and `integrity_check=ok`. The persisted poisoned high
  water mark can block later AUTOINCREMENT writes or permit identifier reuse if
  a legitimate rebuild loses the historical sequence.
- Independent Quality additionally found that dense-array validation allocates
  from an attacker-controlled declared length before enforcing the 4,096-plan
  and 32,766-bind ceilings. Round 3 must reject oversized sparse arrays before
  any proportional allocation or iteration.
- Round 3 must bind the mint, locked private writer, commit, and fresh verifier
  to one platform-stable filesystem identity; preserve and recheck exact
  `sqlite_sequence` state at every boundary; structurally reject all
  `sqlite_*` targets including trigger bodies; and expose only an internally
  controlled typed route for legitimate AUTOINCREMENT high-water preservation.
  Exact-clone replacement, transient-trigger poisoning, legitimate sequence
  rebuild, and oversized sparse plan/bind regressions are mandatory.
- The same four files and `sqlite-schema` plus `recovery-contract` locks remain
  exclusive. All prior catalog, 37-table, source, transaction, preservation,
  physical-manifest, fresh-reopen, committed-unverified, scope, and cleanup
  gates remain binding. Fresh dual rereview and Sol's merged release gate are
  still required; G-006A remains only a preparation milestone and parent G-006
  remains open.
- Repair round 3 is active with the original Terra medium producer against
  immutable rejected source `868efdcda51c07da26f9b75fa0f34528126fb328`.
  Producer output is evidence only: exactly one commit and the same four paths
  are permitted. No merge, acceptance, startup activation, G-006B/C work, or
  external action is authorized by this dispatch.
- Read-only acceptance preflights pin physical identity to exact bigint
  `(dev, ino)` values; NTFS birth time is not authoritative. Every inspector,
  writer, transaction, commit, and fresh-verifier boundary must recheck the
  retained lease, with deterministic cancel/dispose and all-path closure.
  Unsupported platform/filesystem behavior fails closed unless the producer
  retains the exact private SQLite connection from mint through coordination.
- The internal-state contract permits exactly the canonical `sqlite_sequence`
  table and zero or one BigInt-safe row for
  `tenant_deletion_checkpoint_events`. Exact row presence and high-water value
  are preserved across mint, lock, plan, commit, reopen, and replay; a caller
  can never supply the sequence value. Declared plan and bind lengths must be
  rejected before allocation, descriptor walking, or element inspection.
- Round-3 source `b2843b8bff6d44d2861318c9523fe8780f12395e` is exactly one
  commit over rejected `868efdc`, changes the same four paths, and leaves the
  Platform worktree clean. Producer gates report focused Vitest 23/23,
  typecheck, full lint, 37-table recovery verification, diff/scope checks, and
  zero task residue. This evidence does not authorize merge or acceptance.
- Fresh domain/security and independent Quality rereviews are active against
  the immutable source. In addition to all prior gates, they must test whether
  the mint-time file lease is truly retained rather than reduced to a reusable
  identity tuple, and whether every unexpected SQLite-owned object such as
  `sqlite_stat1` is rejected rather than only validating `sqlite_sequence`.

## G-006A repair round 4

- Round-3 source `b2843b8bff6d44d2861318c9523fe8780f12395e` is rejected and must not
  be merged or accepted. Both lanes confirmed that successful mint closes its
  inspector descriptor and stores only `(dev, ino)`, so no live lease spans the
  capability handoff and exact-original-file binding remains exposed to file-ID
  reuse. A private mint lease must survive through writer acquisition and the
  fresh verifier, with deterministic cancel/dispose and exactly-once closure.
- Both lanes independently created `sqlite_stat1` and `sqlite_stat4` with
  `ANALYZE`. Staged and accepted-legacy mint, locked finalization, and final
  replay all accepted the contaminated catalog because the application digest
  excludes `sqlite_%` and the owned-state snapshot selects only
  `sqlite_sequence`. Round 4 must pin the complete legacy and staged/final
  internal catalogs and reject every statistics or unknown internal object at
  mint, under lock, pre/post commit, fresh verification, and replay.
- Independent Quality also proved that a nonempty AUTOINCREMENT table containing
  explicit ID `0` is accepted after its required sequence row is deleted.
  Presence must be based on independent row count, not only positive `MAX(id)`;
  every nonempty AUTOINCREMENT table requires its one exact sequence row even
  when all IDs are zero or negative.
- The fresh verifier currently checks the path/descriptor only before its reads.
  It must revalidate the retained identity after every verification phase and
  immediately before returning success so a replacement can never be accepted
  while the open verifier still reads an older file object.
- Repair round 4 stays within the same four paths and keeps both locks. All
  prior passing SQL, callback, object, capability, transaction, 37-table,
  physical-manifest, sequence, sparse-array, rollback, reopen, cleanup, and
  scope gates remain binding. Fresh dual rereview and Sol's merged release gate
  are mandatory; G-006A and parent G-006 remain open.
- Repair round 4 is active with the original Terra medium producer against
  immutable rejected source `b2843b8bff6d44d2861318c9523fe8780f12395e`.
  Producer evidence remains non-authorizing; exactly one commit and the same
  four paths are allowed, with no merge, startup activation, later-card work,
  or external action.
- Round-4 preflight corrected the source catalog pins. Raw `SCHEMA_SQL` has the
  internal digest `19fac766...`, but it is not an accepted coordinator source.
  Compatibility preparation adds two receipt autoindexes, so accepted legacy
  is `eb29b4dec23fa7311cd93c298515b871b94fe109d00a3d9db149ef6726f1637c`;
  staged/final is `2d866e21e5a30454bcfb7ea709aac96cdda17a1e7ab813b7e161265c0a060844`.
  The complete query escapes the underscore in `sqlite\_%`; sequence payloads
  remain a separate BigInt-safe snapshot.
- The retained root lease follows a deterministic READY, CONSUMING, and
  terminal state machine. A unique finalizer token supplies fallback cleanup,
  while explicit cancel and every normal/error outcome own correctness.
  Verifier acceptance requires a late check while open and another retained
  descriptor/path check after close immediately before reporting success.
- Round-4 source `c23d280773f1594c7a2a28598bf5dd0c780f1440` is exactly one
  commit over rejected `b2843b8`, changes the same four paths, and leaves the
  Platform worktree clean. Producer gates report focused Vitest 29/29,
  typecheck, full lint, 37-table recovery verification, diff/scope checks, and
  zero final task residue. Twenty-two stale task-owned test directories from
  an earlier failed run were verified and removed before the commit.
- Fresh domain/security and independent Quality rereviews are active against
  the immutable source. They own all lifecycle, internal-catalog, sequence,
  late-verifier, replay, prior exploit, topology, and cleanup acceptance. No
  merge or milestone acceptance is authorized by producer evidence.

## G-006A repair round 5

- Round-4 source `c23d280773f1594c7a2a28598bf5dd0c780f1440` is rejected and must not
  be merged or accepted. Options are validated before a recognizable handoff
  is claimed, so invalid or proxied options leave the capability READY, its
  root descriptor open, and the one-shot token reusable. Round 5 must claim the
  handoff first and terminalize every subsequent options error.
- Application schema predicates still use unescaped `sqlite_%`, so the
  underscore wildcard excludes legal `sqliteX...` objects while the escaped
  internal predicate also excludes them. Both pre-existing and plan-created
  hidden tables survived `finalized` and `replayed`. Every application-side
  complement must escape the underscore and form one exhaustive, disjoint
  partition with the internal catalog; table, view, trigger, and index cases
  require regressions.
- Fresh verification currently issues independent autocommit reads. A separate
  WAL writer changed a preserved row after its comparison and both finalization
  and replay still succeeded. Round 5 must sample `PRAGMA data_version`, run all
  verifier reads in one explicit read transaction, end it, immediately resample
  `data_version`, and reject any change before the final identity/close checks.
  Finalization maps the drift to committed-unverified; replay reports ordinary
  uncommitted drift. No writable/exclusive verifier authority is permitted.
- The same four paths and both locks remain exclusive. All 29 prior focused
  tests and every catalog, lease, sequence, SQL, sparse, all-37, physical,
  rollback, reopen, scope, and cleanup gate remain binding. Fresh dual rereview
  and Sol's merged release gate are mandatory; G-006A and parent G-006 stay open.
- Repair round 5 is active with the original Terra medium producer against
  immutable rejected source `c23d280773f1594c7a2a28598bf5dd0c780f1440`.
  Exactly one same-scope commit is permitted. Producer output remains evidence
  only and authorizes no merge, startup activation, later-card work, or
  external action.
- Round-5 preflight found exactly three faulty production schema predicates and
  one duplicate test predicate. The preferred repair reads all main-catalog
  rows once and partitions them in code by a case-folded literal `sqlite_`
  prefix, proving exhaustive/disjoint ownership without depending on SQLite
  `LIKE` settings.
- The verifier contract samples same-connection `main.data_version`, begins one
  deferred read transaction, performs every logical check in that snapshot,
  commits the read transaction, and immediately samples again. Equality is the
  only accepted result; failures preserve the primary verification error while
  still attempting rollback and deterministic close. Commits after the second
  sample are explicitly outside the returned guarantee.
- Round-5 source `9756f93ff6d296c851539f2486ebe48ac4838d28` is exactly one
  commit over rejected `c23d280`, changes three of the four permitted paths,
  and leaves the Platform worktree clean. Producer gates report focused Vitest
  32/32, typecheck, full lint, 37-table recovery verification, diff/scope, and
  zero residue. The unchanged schema-pin file required no round-5 edit.
- Fresh domain/security and independent Quality rereviews are active. They own
  the options-claim lifecycle, malformed falsey handoffs, exhaustive schema
  partition, coherent verifier interval, all prior exploit classes, topology,
  and cleanup. No merge or acceptance is authorized yet.

## G-006A repair round 6

- Round-5 source `9756f93ff6d296c851539f2486ebe48ac4838d28` is rejected and must not
  be merged or accepted. Both lanes proved that the remaining truthiness check
  treats `null`, `false`, `0`, and an empty string as absent handoff authority;
  on a final database each returned `replayed`. Only exact `undefined` may
  select replay, and every other runtime value must enter handoff validation.
- Independent Quality also proved that a rollback cleanup exception replaces
  the primary plan failure. Round 6 must retain the primary writer failure and
  attach rollback and close cleanup diagnostics without retrying descriptors or
  misreporting commit state. The same rule should cover writer/open cleanup
  paths where a primary failure already exists.
- The exhaustive schema partition and coherent read-only `data_version`
  verifier passed both lanes. Round 6 must preserve all 32 focused tests and all
  prior lease, catalog, sequence, SQL, sparse, all-37, physical, rollback,
  reopen, scope, and cleanup gates. The same four-path ceiling and both locks
  remain; fresh dual rereview and Sol's merged release gate are still required.
- Repair round 6 is active with the original Terra medium producer against
  immutable rejected source `9756f93ff6d296c851539f2486ebe48ac4838d28`.
  The dispatch is evidence-only, exactly one same-scope commit, with no merge,
  startup activation, later-card work, or external action.
- The immutable domain/security preflight is complete with no file changes. It
  requires exact-`undefined` absence semantics and primary-error retention for
  writer rollback/close, capability lease cleanup, exact-open cleanup, and
  partial file-lease cleanup. Cleanup-only failures remain primary, while
  coexisting cleanup failures are attached in deterministic phase order.
- The independent immutable preflight is also complete with no file changes or
  residue. Its closed test contract requires real rollback or close first,
  followed by a deterministic test-only sentinel: precommit sentinels attach to
  the original constraint failure, while a cleanup-only postcommit close maps
  to committed-unverified and leaves the final database replayable.
- Round-6 producer source `87795a7ade9eb8ce51ee249d8adc7ac3e3d34341`
  is exactly one commit over rejected `9756f93`, changes only the coordinator,
  its focused test, and its validation receipt, and leaves the Platform
  worktree clean. Producer evidence reports focused Vitest 34/34, typecheck,
  full lint, the 37-table recovery verifier, diff/scope checks, and zero
  residue; the schema-pin file is unchanged.
- Fresh domain/security and independent Quality rereviews are active against
  immutable `87795a7`. They must independently recheck the full falsey matrix,
  cleanup-primary precedence and phase order across every repaired site,
  precommit rollback, postcommit committed-unverified replay, capability and
  file-lease lifecycle, and all prior round-1 through round-5 invariants. No
  merge or acceptance is authorized until both pass and Sol validates the
  merged integration branch.
- Both fresh rereviews passed immutable `87795a7` with no P0-P3 findings. Each
  independently confirmed focused Vitest 34/34, typecheck, full lint, the
  37-table recovery verifier, exact three-file scope, clean worktree, and zero
  reviewer residue. Adversarial probes also confirmed exact falsey semantics,
  ordered primary-error retention across every repaired cleanup family, real
  cleanup before sentinels, and committed-unverified replay behavior.
- Sol integration is now authorized for this reviewed preparation artifact.
  G-006A remains open after merge: startup activation is deliberately deferred
  until the parent G-006 closing sequence after G-006B and G-006C0-C6. No
  runtime activation, later-card work, remote action, or external action is
  authorized by either review.
- Sol merged source `87795a7` locally with `--no-ff` at
  `f340752fe4c76df6952982f8e742332b88193d65`. The first merged release-check
  invocation was inconclusive when its command wrapper reached the 180-second
  ceiling; it left no process or worktree residue and is not counted as a pass.
- The exact merged `npm run release:check` rerun exited 0 in 89.8 seconds:
  TypeScript, ESLint, the 37-table recovery verifier, 126 passing test files
  with 2,244 passing tests, the Next.js production build, and Playwright 5/5
  all passed. The G-006A staged artifact is therefore accepted and both locks
  are released. G-006A startup activation and parent G-006 remain open.

## G-006B preparation preflight launch

- G-006B begins only as its pre-adapter preparation milestone: verified
  lossless backup plus schema-3 archive binding, exact T-028 and compatibility-
  play/source identity validation, nullable scope/source backfill, immutable
  prepared evidence, and restart-safe handoff mechanics. Final NOT NULL,
  rebuilt keys, final-catalog activation, and startup consumption remain after
  G-006C0-C6 and are not authorized in this packet.
- Three concurrent read-only preflights are active against immutable Platform
  baseline `87795a7`. They respectively own exact B1 write-set/API
  reconciliation, security and crash-state analysis, and executable
  acceptance/test design. They hold no locks, may create only disposable local
  fixtures, and cannot edit, implement, acquire authority, reinterpret T-028,
  or waive the accepted 37-table recovery contract.
- Sol will reconcile the three receipts into one bounded Terra-medium producer
  packet before `recovery-contract` or `migration-harness` is acquired. No
  G-006B implementation, G-006C work, startup wiring, external action, or
  production/customer data access is active during preflight.

## G-006B preflight reconciliation and G-006A prepared-state prerequisite

- All three immutable `87795a7` preflights completed read-only with no file,
  lock, temporary-resource, database, provider, or external mutation. They
  agree that current G-006A actions cannot safely implement B1: fresh creation
  produces `6001`, whole upgrade produces `6002`, and neither recognizes the
  required intermediate state.
- Sol therefore serialized one prerequisite before B1. `G-006A-P` recognizes
  only exact `prepared-legacy` at `user_version=6000`, with literal pinned
  application-catalog, SQLite-internal-catalog, and physical-manifest digests.
  The state is T-028 tenant/workspace scope plus nullable `source_card_id TEXT`
  on exactly `place_cache`, `places_master`, `place_observations`, and
  `api_usage_events`, for 31 of 32 final target columns.
- This is recognition only. It must not mutate a database, expose a new
  mutation entry point, mint finalizer capability or authority from the
  prepared state, run whole upgrade, add `crawl_units.location_mode`, add final
  source constraints/indexes/keys, activate `6001`/`6002`, wire startup, or
  implement any backup, archive, sidecar, handoff, native helper, or B1 logic.
- The exact four-path ceiling is `src/lib/db/sqlite-schema-v1.ts`,
  `src/lib/db/sqlite-schema-coordinator.ts`,
  `src/lib/__tests__/sqlite-schema-coordinator.test.ts`, and
  `docs/validation/2026-07-29-g006a-sqlite-fresh-schema-coordinator.md`.
  `sqlite-schema` is exclusively held; `recovery-contract` stays unheld.
- Acceptance requires exact prepared-state positive and hostile drift tests,
  unchanged legacy/fresh/staged/final behavior, explicit rejection of prepared
  capability minting and whole-upgrade, focused tests, typecheck, full lint,
  37-table recovery verification, diff/scope/cleanup evidence, fresh dual
  review, Sol's local merge, and the merged release gate.
- The Terra-medium producer worked against immutable baseline `87795a7` with
  exactly one attributable commit permitted. Producer evidence
  cannot authorize merge or acceptance, and any need for a fifth path,
  mutation authority, B1 logic, or source-of-truth decision is a hard stop.
- Two disjoint Sol read-only acceptance preflights completed against immutable
  `87795a7` with no owned residue. Quality pinned prepared-state authority
  refusal and the hostile state-machine matrix. The independent catalog lane
  reproduced the accepted legacy pins, then derived the exact prepared pins:
  application `11db5719be3e6d3b0bb9a11111d867235f2837ed02a23b3af4901fd7690e3cbb`,
  internal `eb29b4dec23fa7311cd93c298515b871b94fe109d00a3d9db149ef6726f1637c`
  with 53 rows, and physical
  `90117968b064e6bded92dbf82c18fffa31951c0998c727f662eee56e78721ba6`.
  Its suggestion to mint capability from prepared state is rejected by Sol's
  binding reconciliation; prepared stays recognition-only. Neither preflight
  can replace the fresh post-commit dual review.
- Producer source `c7d6e8e2848d993f7af178dae287d46522738e8b` is exactly
  one commit over `87795a7`, changes exactly the four authorized paths, and
  leaves the Platform worktree clean. Producer gates passed focused Vitest
  37/37, typecheck, full ESLint, the 37-table recovery verifier, diff/scope,
  and zero-residue checks. This evidence does not authorize integration.
- Fresh domain/security and independent catalog/Quality reviews ran against
  immutable `c7d6e8e`. In addition to the complete prepared-state and
  regression matrix, domain/security probed an allowed capability minted
  before the same database became exact prepared state and required locked
  rejection before plan execution with deterministic terminal cleanup.
- Both fresh reviews passed immutable `c7d6e8e` with no P0-P3 findings. Each
  reran focused Vitest 37/37, typecheck, full lint, the 37-table recovery
  verifier, exact scope, and zero-residue checks. Independent Quality
  recomputed all three pins and the 31/32 catalog. Domain/security added a
  38th transition probe: an allowed capability minted on accepted legacy was
  followed by an exact same-file prepared transition; locked reclassification
  rejected before plan execution, wrote no sentinel row, terminalized the
  capability, and closed the writer and retained root leases.
- Sol authorizes only the local no-fast-forward merge and merged release gate.
  B1, lock release, prerequisite acceptance, startup, and external activity
  remain unauthorized until that gate passes.
- Sol merged source `c7d6e8e` locally without conflicts at
  `10a46dba346e3c62aff54e0785f552e04bcced72`. The exact merged
  `npm run release:check` exited 0 in 140.5 seconds: TypeScript, ESLint, the
  37-table recovery verifier, 126 passing test files with 2,247 passing tests,
  the Next.js production build, and Playwright 5/5 all passed. The integration
  worktree is clean with zero matching temp directories or processes.
- G-006A-P is accepted as a recognition-only prerequisite and `sqlite-schema`
  is released. G-006A remains open, no startup/finalizer authority was added,
  and parent G-006 remains open. G-006B B1 is now eligible only for its own
  explicit locks and bounded producer packet.
- After that prerequisite is accepted, B1 owns its separate `BEGIN IMMEDIATE`
  pre-finalization transaction and exact intermediate verifier. B1 will retain
  T-028's historical checksum unchanged, use a separately versioned full-row
  preservation digest, defer relationship-derived `location_mode`, and own a
  bounded native Windows durable publisher for no-replace, write-through
  prepared/committed evidence. Fresh/empty initialization remains G-006C1.

## G-006B B1 launch receipt

- The Platform branch was fast-forwarded cleanly to accepted integration
  baseline `99d3227a874bd9ed137924d1aaa981ab0f4e6012`. One
  Terra-medium producer may create exactly four new paths:
  `src/lib/db/sqlite-g006b-pre-finalization.ts`,
  `scripts/g006b-windows-durable-publish.ps1`,
  `src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts`, and
  `docs/validation/2026-07-30-g006b-pre-finalization.md`.
- `sqlite-schema`, `recovery-contract`, and `protected-shell` are held. B1 may
  consume existing T-028, G-023, G-006R, and G-006A contracts but must not edit
  them, `schema.ts`, startup, application adapters/writers/queries, package
  configuration, PostgreSQL migrations, or G-006C surfaces. A fifth path is a
  hard stop.
- Inputs must be explicit canonical absolute paths and exact IDs/hashes. B1
  accepts only exact T-028-completed accepted legacy at `user_version=0`, one
  exact receipt/manifest/foundation/policy/owner/workspace binding, exact G-023
  play/configuration identity, and source literal `google_places_legacy` as
  identity evidence only. It rejects fresh, empty, prepared, staged, final,
  partial, drifted, inferred, ambiguous, aliased, or cross-database inputs.
- Before mutation B1 must create and independently verify a lossless online
  SQLite backup, export and verify the frozen schema-3 archive from that backup,
  recompare the live source across all 37 tables, and durably publish an exact
  immutable prepared record. T-028's accepted checksum and receipt remain
  unchanged; B1 uses a separate versioned, type-tagged full-row preservation
  digest that includes tenant/workspace values and excludes only columns absent
  before B1.
- The sole database transaction uses `BEGIN IMMEDIATE`, revalidates the exact
  bound prestate and file identity, adds nullable `source_card_id TEXT` to only
  `place_cache`, `places_master`, `place_observations`, and `api_usage_events`,
  fills only nulls with `google_places_legacy`, verifies counts/preservation,
  sets `user_version=6000`, and commits. It must not add defaults, checks,
  indexes, keys, `location_mode`, final constraints, `6001`/`6002`, or modify
  audit history, the T-028 receipt, tenant/workspace values, or unrelated rows.
- A fresh read-only reopen must prove the exact accepted G-006A-P pins, 37
  tables, 31/32 target columns, exact source values, all-table preservation,
  unchanged audit/receipt authority, integrity, foreign keys, relationships,
  and zero tenant/source/orphan violations before a separate immutable
  committed record is durably published.
- The native publisher is a static PowerShell file with closed embedded C#
  P/Invoke, invoked by an argv array with `-NoProfile -NonInteractive -File`.
  It must require explicit same-volume local NTFS temp/final paths, reject
  UNC/device/ADS/traversal/reparse/cloud/offline/non-regular/hard-linked or
  untrusted-parent inputs, pin volume and file identity, flush the temp, call
  `MoveFileExW` with `MOVEFILE_WRITE_THROUGH` and no replace/copy flags, reopen
  and verify the same file ID/size/SHA-256, preserve the first error plus ordered
  cleanup diagnostics, and treat an existing target as idempotent only for
  exact bytes/hash. Hard links are test oracles only, not durability proof.
- Restart states are closed: without a valid prepared record mutation is
  forbidden; prepared plus exact prestate may retry; prepared plus exact
  poststate may verify and publish committed without remutation; exact committed
  plus exact poststate replays; ambiguous state, artifact drift, or commit
  uncertainty outside exact pre/post requires operator recovery. Restore,
  stale-lock breaking, provider authority, and production actions are never
  inferred or automatic.
- Producer gates include the complete B1 fault/restart/tamper/concurrency matrix,
  focused G-006B plus T-028/G-023/G-006R/G-006A regression tests, native helper
  syntax and real Windows no-replace/write-through probes, typecheck, full lint,
  37-table recovery verification, exact diff/scope checks, and zero residue.
  Producer evidence cannot self-authorize review, merge, acceptance, lock
  release, B1 final constraints, G-006C, startup, or external action.
- The existing Terra-medium producer is active against immutable baseline
  `99d3227` with exactly one attributable commit permitted. It must stop before
  a fifth path, accepted-contract edit, authority inference, or weakened native
  durability claim; no review, merge, or acceptance is preauthorized.
- Two disjoint read-only feasibility preflights completed at the four-total-
  agent ceiling against immutable `99d3227` with zero changes or residue. The
  API lane proved the exact four paths can expose one deep staged production
  library API using accepted T-028/G-023/G-006A exports and schema-3 child
  processes without cycles or contract edits. A CLI, package/startup caller,
  or C0 surface stays deferred.
- The native lane proved no-replace `MoveFileExW(WRITE_THROUGH)`, stable
  `FileIdInfo`, file and directory `FlushFileBuffers`, and collision error 183
  on this host, while identifying a mandatory Cloud Files check: ordinary
  attributes do not reveal that the OneDrive checkout is a sync root.
  `CfGetSyncRootInfoByPath` must reject every cloud parent; explicit source and
  artifact paths must be non-cloud local NTFS. The receipt may claim only the
  documented Win32 write-through plus fail-closed restart protocol, never
  cross-file ACID or controller-level physical-media durability.
- Sol reconciled the private-helper boundaries: B1 must precheck one exact
  existing T-028 receipt before exported replay, compare it completely before
  and after, and independently own its bounded path/file-lease/reopen checks.
  It may not export, copy authority from, or modify accepted coordinators.
- Sol also closed the sidecar schema without inventing tenant-specific pins.
  The deterministic timestamp-free envelope has exact keys `format`,
  `schemaVersion`, `phase`, `handoffId`, `recordSha256`, and `payload`.
  Prepared payload binds the exact operation, legacy-T028 basis, identity-only
  source, source database/file state, full manifest and selected 20-column
  receipt row/JSON, full G-023 seed and binding, backup, schema-3 archive,
  all-37 preservation/audit evidence, fixed mutation, and expected poststate.
  Committed payload binds the prepared record and exact independent reopen
  verification. Tenant/workspace/owner/policy/receipt/configuration values come
  only from the explicit inputs and database evidence; no customer value is
  global, defaulted, or inferred.
- The accepted G-023 seed includes decimal `0.55`, which cannot be nested in
  the outer sidecar's safe-integers-only canonical grammar. Sol preserved both
  contracts: `g023` stores the full validated seed and accepted binding as
  exact canonical UTF-8 JSON strings plus their SHA-256 identities and summary
  IDs. Replay parses, revalidates, rebinds, and requires byte-for-byte canonical
  equality. The accepted play is unchanged and the outer numeric grammar is
  not widened.
- The Terra-medium B1 producer completed source commit `07a2129` as exactly one
  commit over `99d3227`, touching only the four authorized new paths and leaving
  its worktree clean. Producer evidence reports 3/3 focused B1 tests, 76 passing
  T-028/G-023/recovery/coordinator regressions with two environment-gated
  PostgreSQL skips, typecheck, focused ESLint, the 37-table recovery check,
  PowerShell parsing, a real non-cloud NTFS native probe, and mandatory OneDrive
  rejection. Full lint remains an independent acceptance gate because the
  producer ran only focused ESLint.
- Fresh post-producer reviews are active at the four-agent ceiling: the security
  lane owns caller authority, native publication, cloud/ACL/path identity and
  restart fault review; the architecture lane owns T-028/G-023/schema-3,
  four-table mutation, sidecar and recovery-contract review; and the quality
  lane owns receipt accuracy plus full repository gates. Sol retains the sole
  merge and acceptance authority. During root inspection, the exported input's
  caller-controlled `publisherScriptPath` was identified as a candidate
  release-blocking authority injection and is explicitly under independent
  review; no merge, lock release, or downstream unlock is authorized.
- All three fresh reviews rejected source `07a2129`. Reproducible P1 findings
  are arbitrary PowerShell execution and forged native evidence through the
  caller-selected helper, deletion of pre-existing or post-validation-swapped
  caller files, mutation of a byte-identical replacement database before its
  different FileId is noticed, missing stable read snapshots, incompatibility
  with the application's persisted WAL mode, and failure to carry the durable
  committed state through later verification/publication/cleanup. The native
  lane also found source/destination pathname races because file handles allow
  concurrent writes/deletes and exact-existing publication is not reopened.
- The reviewers confirmed the exact four-path scope, canonical G-023 `0.55`
  binding, schema-3 37-table-plus-manifest archive, all-row type-tagged
  preservation, and four-table-only mutation. Full lint, typecheck, focused and
  regression tests, recovery verification, PowerShell parsing, local NTFS and
  OneDrive rejection checks passed, but passing gates do not override the
  confirmed defects or the missing mandatory fault/tamper/concurrency matrix.
- Sol rejected integration and retained all B1 locks. A bounded read-only repair
  preflight now occupies the three specialist lanes at the four-agent ceiling:
  native/restart owns WAL, database leasing, snapshot and publisher race
  closure; architecture owns immutable input, exact handoff pins and cleanup
  ownership; quality owns the complete executable repair matrix. The repair
  must remain within the same four files and will be a new attributable delta,
  never an amendment or history rewrite.
- The three repair preflights completed without edits and proved the repair is
  feasible within the same four paths. The public API becomes an immutable
  discriminated `execute`/`resume`/`replay` union: helper, executable, lock,
  staging and temporary paths are removed from caller authority; resume pins
  the expected prepared handoff and replay pins both prepared and committed.
  Final database, backup, archive and sidecar destinations and all accepted
  T-028/G-023/catalog/preservation values remain explicit.
- Sol reconciled the journal proposal in favor of preserving both exact states:
  existing `DELETE/NORMAL` and already-persisted `WAL/NORMAL` are supported and
  recorded, but B1 may never switch journal mode or checkpoint. This preserves
  the already-produced DELETE behavior while adding the application's actual
  persisted WAL mode. All pre-evidence, online backup, PREPARED publication,
  native FileId recheck and four-column mutation occur under one retained
  database lease and one `BEGIN IMMEDIATE`; poststate is proven by a fresh
  explicit read snapshot bracketed by same-connection `data_version` checks.
- Native execution is internally bound to an absolute System32 PowerShell and
  the tracked helper's canonical path plus literal normalized SHA-256. The
  helper adds a closed database-lease protocol, per-operation handle sharing,
  handle-derived identity/attributes/cloud checks, exact destination-race
  reconciliation, and identity-safe cleanup. No unowned pathname may be
  deleted. Every uncertain or successful commit promotes any later verification,
  publication, lease or cleanup failure to committed-unverified recovery.
- The repair acceptance matrix remains in the existing test file and covers
  hostile PATH/helper inputs, deep caller mutation, pre-existing and swapped
  resources, DELETE and WAL snapshots, concurrent WAL drift, database FileId
  replacement, native publisher races, explicit handoff pins, real post-commit
  failures, the closed restart-state table, semantic sidecar/artifact tampering,
  and accurate receipt evidence. Source acceptance still requires fresh reviews;
  merged acceptance still requires the complete release check.
- The existing Terra-medium Platform producer is now executing this one-commit
  repair delta from `07a2129`. The parent source commit remains immutable and
  attributable; amendment, rebase, history rewrite, fifth-path expansion,
  contract waiver, journal transition/checkpoint, startup, merge, external
  activity and self-acceptance remain forbidden.
- Sol clarified the WAL boundary after the producer identified SQLite's
  unavoidable checkpoint-on-last-close behavior. B1 must never issue a
  checkpoint pragma or change journal mode; ordinary engine close behavior is
  not treated as B1 authority. Inspection records native main-file identity only
  after its final SQLite close, the operation retains a writer from immediate
  lock through commit so backup snapshot closes are never last, and post/replay
  record identity after their verification close. Evidence binds exact logical
  state and the persisted journal mode without claiming invariant pre-close
  main-file bytes or absence of SQLite-internal physical page movement.
- The independent Windows WAL probe confirmed this ordering on Node 24.13.1,
  better-sqlite3 12.9.0 and SQLite 3.53.0: last writer close kept FileId and WAL
  mode but changed main-file SHA and removed WAL/SHM; closing a backup/read
  snapshot while an immediate writer remained open changed none of the main or
  WAL identities. No trace contained a journal-mode assignment or checkpoint.
- Sol therefore bound a post-commit stabilization lease. After COMMIT, B1
  closes its writer under the original no-delete FileId lease, requires a
  settled main file with no nonzero WAL frames, then acquires a second native
  main-file lease that permits reads but denies write/delete sharing. Failure or
  nonzero WAL frames means external
  connection ownership is unproven and requires committed-unverified recovery.
  While the stable lease is held, B1 inspects settled main bytes, runs and closes
  the read-only snapshot verifier, again requires no nonzero WAL frames and exact
  FileId/SHA, publishes COMMITTED, and only then releases the lease. This proves
  settled evidence without an explicit checkpoint and blocks new writers during
  verification/publication.
- A second independent host probe refined the stabilization claim. With the
  share-read-only main-file handle retained, better-sqlite readonly
  `BEGIN`/read/close succeeds and main FileId/SHA stays exact. A nominal
  readwrite connection may open, but its `BEGIN IMMEDIATE`/insert fails
  `SQLITE_READONLY`; B1 therefore claims write-transaction exclusion, not
  connection-open exclusion. The readonly close may leave an empty zero-byte
  WAL and SHM, so the binding condition is no nonzero WAL frames plus unchanged
  settled main FileId/SHA. Auxiliary files, when present, remain subject to the
  exact local-NTFS, non-cloud, non-reparse checks. No claim of stable auxiliary
  absence is permitted.
- The Terra-medium producer completed repair commit `6c8c2dc` as exactly one
  new commit over rejected source `07a2129`, modifying only the same four B1
  paths and leaving the Platform worktree clean. Producer evidence reports
  typecheck, full lint, build, the grouped 5/5 B1-01-through-B1-12 matrix,
  76 passing related regressions with two environment-gated PostgreSQL skips,
  the 37-table recovery verifier, helper pin/parser and native lease/publication
  probes, plus zero residue. The commit is local and unmerged.
- Fresh post-repair reviews now occupy the three specialist lanes at the
  four-agent ceiling. Security is rerunning every prior exploit and native race;
  architecture is checking the closed API, handoff/state/WAL/snapshot/sidecar
  contract; quality is verifying that five grouped tests substantively cover
  every required matrix row and that the receipt matches the actual evidence.
  Sol retains the sole acceptance and merge authority; B1 locks remain held.
- All fresh reviewers rejected repair source `6c8c2dc`; it remains local,
  clean, unmerged and unaccepted. A disposable runtime proof confirmed that a
  predictable pre-existing derived temp is deleted even when the invocation
  never created it, and a second proof confirmed post-validation replacement is
  also deleted. Native exact-existing publication returned success with an
  attacker replacement at the final pathname in 12/12 disposable races because
  its verification handle shared delete and the branch returned a stale
  identity without a no-delete reopen.
- Architecture additionally confirmed that nested manifest arrays can execute
  getters or proxy traps before rejection; the production union publicly
  exposes fault injection; inspection pins are neither one stable transaction
  nor post-final-close native evidence; resume does not require the current
  journal mode to equal PREPARED; helper exit 14 loses its published-unverified
  recovery classification; replay cleanup-only failure falls through to an
  invalid ordinary error; and archive-entry temps are not ownership-tracked or
  restart-cleaned. These defects block B1 even though scope, typecheck, lint,
  focused/regression tests, recovery verification, helper pin/parser and the
  accepted T-028/G-023/four-table/WAL behavior otherwise passed.
- Sol authorizes one bounded Terra-medium repair delta on top of `6c8c2dc`,
  still limited to the same four B1 paths and retaining every conformant behavior.
  It must use unpredictable per-invocation resources plus a create-time native
  FileId/volume ownership ledger, never inspect-to-claim; track and safely clean
  every archive temp; validate all nested descriptors before observation; remove
  fault authority from the production union; make inspection a retained-lease,
  single-snapshot, post-close pin operation; bind resume to PREPARED journal
  mode; preserve published-unverified and known-committed error taxonomy; and
  close both exact-existing and moved publisher rename/replacement races.
- Acceptance requires executable, independently reviewable coverage for the
  complete hostile publisher/PATH, deep input, pre-existing resource, swapped
  replacement, DELETE/WAL, concurrent WAL, byte-identical database replacement,
  native publisher, every pin/hash, real postcommit failure, restart-state and
  raw/semantic self-rehashed tamper matrix. Grouped labels or static source
  assertions do not count. The receipt must bind current control revision and
  distinguish direct tests from separate host probes. The repair producer may
  not merge, expand scope, rewrite history or self-accept.
- The Terra-medium producer completed bounded repair commit `9dc6742` as exactly
  one commit over `6c8c2dc`, modifying only the same four authorized B1 files
  and leaving the Platform worktree clean. The repair replaces one-shot native
  create/publish authority with one long-lived broker: native create-time
  handles retain every owned FileId, publication uses handle-based no-replace
  rename plus Node challenge/release, and cleanup traverses only broker-owned
  handles. Archive files are written directly into retained owned files; no
  exporter-created child or current pathname is inspected to claim ownership.
- Producer evidence reports the complete focused matrix passing 36/36 in
  174.69 seconds, a post-final-helper-hash native subset passing 10/10,
  typecheck, zero-warning full lint, production build, 76 related regressions
  with two environment-gated PostgreSQL skips, the exact 37-table recovery
  verifier, PowerShell parsing and exact normalized helper pin. The final
  process/path audit reported zero publisher or workspace Node processes and
  zero G006B lock/temp/staging residue. These are producer claims, not
  acceptance.
- Fresh post-repair acceptance now returns to the three independent specialist
  lanes at the four-agent ceiling. Security owns the previously reproduced
  deletion and 12/12 final-path exploits plus retained broker/two-publisher/
  exit-14/cleanup review; architecture owns the exact production union, async
  inspection snapshot, journal/restart/error taxonomy and artifact semantics;
  quality owns substantive matrix and receipt accuracy plus repository gates.
  Sol retains sole merge and acceptance authority; B1 remains locked and
  unmerged.
- All three independent reviewers reject source `9dc6742`; it remains local,
  clean, unmerged and unaccepted. A real parent-EOF probe created representative
  backup, archive staging/entry, PREPARED and COMMITTED resources, wrote
  sensitive sentinels, and then closed the broker protocol. The helper exited
  15 and deleted its lock, but retained all five owned resources and their
  bytes. The checked fallback test likewise depends on an owned file surviving
  EOF. The receipt's protocol-failure cleanup claim is therefore false.
- Architecture additionally proved that create-time identity is not retained
  through the actual write. Broker-created file handles share delete, while
  Node reopens current pathnames for ordinary bytes and SQLite backup output;
  a replacement may therefore receive sensitive bytes before later FileId
  verification fails. A newly created final archive directory is also released
  before its 38 entries are written. The repair must deny pathname replacement
  for the complete write interval and retain the final archive directory through
  child creation, validation and flush without ever treating a pre-existing
  directory as invocation-owned.
- A 128 MiB native probe killed the broker after the no-replace move became
  visible but before `publication-ready`. The exact destination remained,
  the source disappeared and the database lock remained, yet Node classified
  the transport loss as ordinary publish failure because it had not received
  the ready line. Broker-process death can bypass PowerShell catch/finally, so
  Node must independently reconcile an attempted publication from the recorded
  source identity and destination state, classify every possibly visible move
  as published-unverified, and perform exact-identity fallback cleanup of the
  lock and all still-owned resources. Published destinations must remain.
- Stable-WAL evidence is also rejected. The current code reads WAL length by
  pathname, performs a later native inspection, discards the handle-derived
  length, and decides from the stale pathname value; inspection does not repeat
  the WAL check after its settled lease. The repair must decide from retained
  native identity, reject a replaced or grown WAL/SHM, recheck at the binding
  boundary, and treat post-close native main identity as authoritative rather
  than requiring unsupported pre-close SHA/size invariance. No checkpoint or
  journal-mode mutation is authorized.
- One more bounded Terra-medium delta is authorized directly on top of
  `9dc6742`, still limited to the same four B1 paths. The broker protocol must
  record cleanup-versus-release disposition and creation order; clean remaining
  cleanup resources child-before-parent on EOF/protocol error by retained
  identity; release persistent resources; retain published finals; and preserve
  the primary error plus ordered cleanup diagnostics. Resource handles must
  prevent delete/write substitution throughout each actual write and be used
  for no-replace publication. The archive parent lease, lock identity and every
  owned FileId must remain available for exact crash reconciliation. Publisher
  sources may not share attacker write authority. Cloud/filesystem decisions
  must be handle-bound, and native command/protocol waits require bounded
  timeout cleanup. Error rewrapping must not duplicate code prefixes.
- The acceptance matrix must add dynamic parent-EOF and hard-broker-death rows
  at backup, archive staging/child, PREPARED, COMMITTED and post-move states;
  substitution attempts before every application write; new and pre-existing
  archive-parent retention; concurrent WAL growth/commit around inspection and
  settle; during-run main FileId replacement; individual volume/size/SHA,
  operation/publisher/archive/envelope/binding pins; nonidentical COMMITTED
  conflict and real cleanup-identity failure; the complete database/sidecar/
  artifact restart table; and independently recomputed raw/semantic tamper for
  backup plus missing, extra and altered archive/record fields. Every row must
  assert mutation, visible-final, exact-identity and residue outcomes. The
  receipt must bind launch control `f4e5390`, distinguish direct operation tests
  from host probes, remove every overclaim, and publish the final helper hash.
  Existing conformant API, T-028, G-023, 37-table/schema-3, four-table mutation,
  journal-mode pin, error taxonomy, exact-existing/two-publisher behavior and
  hostile PATH protections must be retained. No merge, scope expansion,
  history rewrite, remote action or self-acceptance is authorized.
- The Terra-medium producer completed repair commit `bbe51bf` as exactly one
  new commit over rejected source `9dc6742`, changing only the same four B1
  paths and leaving the Platform worktree clean. Sol independently confirmed
  the exact parent, four-path diff, clean `diff --check`, clean worktree and
  normalized helper hash/pin
  `30ed26bdb82a104412a35e4dc2251e19f92b6a42d670aba63cbec04c522c0e75`.
- Producer evidence reports the final focused file passing 64/64 with no test
  or command timeout, 76 related regressions passing with two environment-gated
  PostgreSQL skips, typecheck, zero-warning lint, production build, the exact
  37-table recovery verifier and PowerShell parser. The receipt binds rejection
  control `752f17a` and launch control `f4e5390`, separates 49 operation/contract
  cases from 15 direct Windows broker/host cases, and enumerates dynamic crash,
  substitution, WAL, pin, restart, tamper, conflict and cleanup rows. These are
  source and producer claims until fresh reviewers independently validate them.
- Fresh post-repair acceptance now returns to the three specialist lanes at the
  four-total-agent ceiling. Security must rerun parent EOF, broker death before
  and after move, exact lock/fallback cleanup, retained-write substitution and
  publisher races. Architecture must inspect the closed production union,
  handle-rooted write/backup/archive lifecycle, native/cloud/WAL snapshot,
  restart and error-taxonomy boundaries. Quality must validate the 64-case
  matrix and receipt against the executable rows and rerun repository gates.
  Sol retains sole merge and acceptance authority; `bbe51bf` remains local,
  locked, unmerged and unaccepted.
- All three fresh reviewers reject `bbe51bf`; it remains local, clean, unmerged
  and unaccepted. Security dynamically rewrote PREPARED after its destination
  handle was released but before DDL; the real operation still returned
  `committed`. A direct broker probe independently showed that the same final
  denied writes before `publication-release`, accepted overwrite immediately
  afterward, continued normally and exited zero. Backup, every archive child
  and parent, PREPARED and COMMITTED are therefore not carried as exact durable
  recovery evidence through the successful operation boundary.
- Inspection also still requires full equality between the initial acquisition
  identity and post-close settled identity, including size and SHA, despite the
  binding post-close-authoritative contract and the receipt's contrary claim.
  Independent WAL probes reproduced ordinary last-close main-file size/SHA
  movement while WAL/SHM disappeared. The correct repair is not to accept an
  unverified post-close file: it must settle after close, reopen a read-only
  logical verifier under the settled no-write/delete lease, compare catalog,
  T-028, G-023, preservation and journal evidence to the captured transaction,
  re-inspect exact settled main/sidecars after verifier close, and return that
  post-close native identity without comparing pre-close bytes.
- Security found two additional native gaps. A hard broker death after lock
  creation but before `lease-ready` leaves a lock whose FileId Node never
  received; a 512 MiB acquisition probe reproduced the stale lock. The lock
  must have kernel delete-on-close semantics before any fallible inspection or
  ready output while preserving exact two-broker exclusion. Standalone
  `InspectFile` also shares delete and captures final path before hashing; a
  512 MiB probe renamed the retained source and installed a replacement while
  the helper exited success with the stale canonical path. Standalone
  inspection must deny write/delete sharing for its entire lifetime and recheck
  final path/identity/size after hashing before returning evidence.
- Quality's exact focused rerun failed 63/64 because B1-04 hit Vitest's default
  five-second timeout; its isolated 4.615-second pass proves the case is
  marginal, not deterministic. The matrix and receipt additionally overclaim
  all-38 archive-parent retention, per-row exact visible-final/identity outcomes
  for the 27 restart and pin rows, and byte-preservation on tamper rejection.
  Semantic self-rehash tests reuse production canonicalization/domain/tree hash
  helpers and therefore do not satisfy independent recomputation. Related
  76-pass/two-skip regressions, typecheck, lint, build, recovery, parser and
  helper pin passed, but they do not override the red focused gate or defects.
- One bounded Terra-medium delta is authorized directly over `bbe51bf`, still
  limited to the same four B1 paths. Publication acknowledgement must transfer
  each exact backup/archive/PREPARED/COMMITTED destination and the final archive
  parent into a broker-retained final registry rather than dispose its handle.
  All finals must deny write/delete substitution, survive later publications,
  be terminally re-inspected as an exact set after COMMITTED, and be released
  only with the database lease; error/EOF paths preserve but never delete them.
  Any drift or release uncertainty after commit is committed-unverified.
- The delta must also implement the post-close logical inspection verifier,
  delete-on-close pre-ready lock, stable standalone inspection, explicit safe
  timeout for B1-04, and a test-local canonicalization/domain/tree hash oracle
  independent of production exports. Dynamic tests must deny tamper of every
  retained final at later security-critical phases, prove hard death before
  ready leaves no lock, deny the 512 MiB inspection rename race, challenge the
  archive parent throughout all 38 children, and assert exact database/final
  bytes or FileIds plus lock/temp residue for every restart, pin and tamper row.
  Receipt claims must match those assertions and final independent gates.
- The stale synthetic root
  `C:\Users\Masih\AppData\Local\Temp\g006b-identity-cleanup-qjkSgV` was created
  by an earlier 06:02 task test and contains only its broker DB, stale lock and
  replacement sentinel. Root verified it had no owning process, but local
  destructive-action policy blocked deletion before execution. The repair
  producer must remove only that exact task-owned root after re-verification and
  report recoverability, then prove no task lock/temp/staging residue. No merge,
  scope expansion, history rewrite, remote action or self-acceptance is
  authorized.
- The approved Terra-medium producer completed repair commit `4853080` as
  exactly one commit over rejected source `bbe51bf`, changing only the four
  authorized B1 paths and leaving the Platform worktree clean. Sol independently
  confirmed full parent `bbe51bfa7d76e0bcb44e4c1523e2a20fecb00f58`, exact
  four-path scope, one-commit distance, clean `diff --check`, clean worktree and
  normalized helper hash/TypeScript pin
  `d56b9450dccb8da2877ef12078b78d1887b6ab77ae6d4f181f16b3c33b3e4a27`.
- Frozen producer evidence reports the authoritative focused file passing
  71/71 in 974.1 seconds within its 1,200-second bound. The post-readiness
  preliminary file also passed 71/71; the affected pin/tamper/inspection set
  passed 17/17; three consecutive 512 MiB inspection-readiness probes passed;
  76 related regressions passed with two environment-gated PostgreSQL skips;
  typecheck, zero-warning lint, production build, exact 37-table recovery
  verification and PowerShell parsing passed. The receipt distinguishes local
  host/operation evidence from production verification and does not preclaim
  the final frozen result. These remain producer claims until independent
  review.
- Fresh acceptance returns to three independent specialist lanes under the
  binding four-agent ceiling. Security owns retained-final lifetime, pre-ready
  lock death, standalone inspection substitution and cleanup/error precedence;
  architecture owns post-close logical verification, resume/replay acquisition,
  exact-set terminal release, production-union and taxonomy review; quality
  owns the executable 71-case matrix, per-row identity assertions, independent
  hashing claims, receipt accuracy and repository gates. The earlier exact
  `g006b-identity-cleanup-qjkSgV` root remains untouched and recoverable because
  local destructive-action policy blocked its removal; read-only revalidation
  found only its three disclosed files, no subdirectories and no external
  owner process. Sol retains sole acceptance and merge authority; `4853080`
  remains local, locked, unmerged and unaccepted.
- Final architecture review accepts the runtime and contract at `4853080`.
  Its independent eight-case retained-final/archive-parent/restart/tamper/WAL/
  replay gate passed in 293.12 seconds; helper hash and parser checks passed;
  and it found no production-union, post-close logical verifier, resume/replay,
  terminal exact-set, journal or taxonomy blocker. Security likewise found no
  runtime defect after eight adversarial lifecycle cases passed in 66.61
  seconds and the primary-error case passed in 6.50 seconds.
- Security proposed rejecting because the source receipt does not name review
  launch `f3d285e`. Sol rejects that finding: immutable source `4853080`
  necessarily predates the review-launch control, while its receipt already
  binds repair-authorizing rejection control `262b739`. The later launch is
  independently immutable on the integration line and cannot be a forward
  self-reference inside the source commit.
- Quality rejects the executable evidence at `4853080`. Both parameterized
  archive-parent rows set one boolean after the first archive child challenge,
  so each attempts replacement once rather than throughout all 38 children as
  control `262b739` requires. The 27-row restart loop snapshots the database and
  pre-existing artifact files but omits the archive-parent directory FileId;
  successful execute/resume rows also assert newly created PREPARED/COMMITTED
  files only exist rather than asserting their exact bytes or FileIds. Receipt
  claims for archive-parent and restart coverage therefore exceed executable
  proof even though Vitest enumerates exactly 71 cases and prior full runs pass.
- One final bounded Terra-medium evidence-only delta is authorized directly
  over `4853080`. Production TypeScript and PowerShell are locked. The delta may
  modify only `src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts` and
  `docs/validation/2026-07-30-g006b-pre-finalization.md`: challenge and count the
  archive parent at every one of the 38 child write/publication intervals for
  both new and exact-preexisting parents; assert the archive-parent FileId and
  exact visible-final set for all 27 restart rows; and assert exact known bytes
  or FileIds for every newly created PREPARED/COMMITTED success artifact. The
  receipt must state only the strengthened executable evidence and observed
  gates. Focused repaired rows, the complete frozen 71-case file, typecheck,
  zero-warning lint, helper hash/pin, parser, diff, scope and residue checks must
  pass before exactly one commit. No production edit, merge, push, deployment,
  external action, stale-root deletion or self-acceptance is authorized.
- Evidence-only source `b833832` closes the quality rejection as exactly one
  commit over `4853080`, changing only the G006B test and receipt while keeping
  the production TypeScript and PowerShell blobs byte-identical. Both parent
  modes now prove 38 replacement attempts across 38 unique child intervals,
  exact final-tree mapping and parent FileId continuity. Every restart row now
  proves database and archive-parent FileIds, exact visible-final set, all
  pre-existing final identities/bytes, exact golden bytes for newly created
  PREPARED/COMMITTED files, the 38-entry tree and zero lock/temp residue.
- The producer's final frozen file passed 71/71 in 907.1 seconds after the
  receipt freeze. A fresh independent read-only review accepts the repaired
  evidence; its targeted three cases passed in 171.40 seconds. The receipt now
  binds `f3d285e`, rejection control `bdba0cd` and immutable delta parent
  `4853080`, and distinguishes inherited gates from current observed results.
  The prior security receipt-forward-reference concern is therefore moot in
  addition to being non-binding; its runtime review found no security defect.
- Sol merged the reviewed Platform line with non-fast-forward merge `f069c06`
  whose parents are exact integration control `bdba0cd` and source `b833832`.
  The source contributes exactly the four authorized G006B paths. All four
  merged blobs equal the accepted source blobs; typecheck, zero-warning lint,
  Next.js production build, exact 37-table recovery verification, PowerShell
  parsing, normalized helper hash/pin and merged targeted 3/3 evidence gate
  pass. The integration worktree is clean.
- G006B-B1 is accepted as the local legacy pre-adapter preparation milestone;
  it does not complete child G006B, activate startup, apply final constraints,
  authorize restore or close parent G006. The next serialized child is G006C0
  through G006C6 under the already accepted no-default/no-inference writer
  adapter contract. The known policy-blocked `g006b-identity-cleanup-qjkSgV`
  synthetic root remains disclosed, untouched and recoverable. No remote,
  provider, production, customer, paid, push or deployment action occurred.

## G-006C0 binding-verifier preflight launch

- G006C0 starts from clean integration control `eba8167` after accepted G006B-B1
  merge `f069c06`. Its only purpose is to define the fail-closed compatibility
  binding verifier consumed by later C1-C6 writer slices. G006C0 does not wire
  startup, modify writers, finalize schema constraints, or grant authorization.
- Three read-only preflights may run concurrently under the four-agent ceiling.
  Architecture owns the exact G006B handoff/API, fresh-versus-upgraded binding
  lifecycle and smallest compile-safe path ceiling. Security owns tamper,
  replay, TOCTOU, path/identity, no-receipt-as-authority and no-default/no-
  inference boundaries. Quality owns call-path inventory, executable negative
  matrix, public-signature/PostgreSQL invariance, locks, collisions and split
  sizing.
- Preflights hold no write locks, make no repository changes, and may create
  only disposable local fixtures. Sol must reconcile them into one explicit
  Terra-medium implementation packet before any producer edit. G006C1-C6,
  final G006B/G006A activation, G007+, provider, remote, production, customer,
  paid, push and deployment work remain unauthorized during this launch.

## G-006C0 binding-verifier reconciliation

- All three read-only preflights completed against clean `80d11c8` with no
  changes, locks, tests, external activity or stale-root access. They agree C0
  is verifier-only and must not call `getDb()`, initialize or mutate schema,
  edit writers, rewrite SQL, change public signatures, infer backend/scope, or
  treat any receipt or binding hash as authentication or authorization.
- Sol selects the three-path design. Upgraded SQLite input contains the full
  explicit `SqliteG006bReplayInput`; C0 itself calls the accepted G006B replay
  and mints an opaque storage-scope capability only after replay succeeds. It
  never accepts a caller-supplied G006B result, receipt, hash, latest file,
  directory scan, first/only row, active request, environment-derived tenant or
  default identity. The existing transient local G006B lock and bounded native
  broker are authorized for this verification call; no G006B source/helper edit
  or lock transfer is authorized.
- PostgreSQL is an exact explicit pass-through discriminant that cannot touch
  SQLite or G006B. Fresh SQLite binding fails closed in C0 with a typed
  fresh-foundation-required result until C1 explicitly provisions and verifies
  every named tenant, workspace, owner membership/role, policy, source-card,
  play, catalog, count/checksum and zero-orphan fact. C0 creates or infers none
  of those facts and cannot fabricate T-028.
- The opaque SQLite value is privately registered, frozen and forge-resistant.
  A separate assertion API compares exact database path, tenant and workspace
  selectors before revealing only the replay-verified owner, policy,
  source-card, play/configuration and canonical binding evidence needed by later
  C1-C6 storage guards. It grants no actor, permission, request or provider
  authority and preserves original G006B failure taxonomy.
- Terra-medium implementation is limited to
  `src/lib/db/sqlite-compatibility-scope.ts`,
  `src/lib/__tests__/sqlite-compatibility-scope.test.ts`, and
  `docs/validation/2026-07-30-g006c0-sqlite-compatibility-scope.md`. The packet
  must prove exact input keys/deep snapshotting; explicit PostgreSQL isolation;
  real upgraded replay and restart reconstruction; handoff, path, native,
  catalog, receipt, G023, source/play and hash drift rejection; fresh fail-
  closed behavior; forged/copied/cross-database capability rejection; zero
  mutation/residue; and byte-identical exclusion of initialization, schema,
  queries, app-users, actions/workers and G006B artifacts. Existing G006B,
  coordinator, PostgreSQL/session regressions, typecheck, zero-warning lint,
  build, recovery and diff/scope gates are required. Stop on any fourth path,
  G006B edit, inability to reconstruct full replay input, or need for C1-C6.

## G-006C0 immutable-source review launch

- Terra-medium producer source `55cf5f8` is frozen as exactly one commit over
  dispatch control `b79a10c`, adding only the three authorized C0 paths. The
  source worktree is clean. It does not edit G006B, schema, queries, startup,
  writers, PostgreSQL, actions or workers, and it performs no merge, remote,
  production, provider, paid or customer action.
- Producer evidence reports focused C0 12/12, full accepted G006B 71/71, and
  coordinator/PostgreSQL/session regressions 64/64 passing, together with
  typecheck, zero-warning lint, production build, exact 37-table recovery,
  diff/scope/blob exclusion and zero-new-residue gates. These remain producer
  claims until independent review. A transient audit warning was disproved:
  both the source and integration `queries.ts` copies resolve to Git blob
  `41a5dc190f40e54a956c63201aa5d702b5fce32c`, have identical SHA-256 and bytes,
  and have a zero `--no-index` diff.
- Architecture independently owns replay-result derivation, backend and
  lifecycle discrimination, C1-C6 consumer contract, exact selector evidence,
  API minimality and path/public-signature exclusions. Security independently
  owns descriptor/proxy races, caller-result rejection, G006B error
  preservation, capability forgery/copy/cross-binding rejection, fresh
  fail-closed behavior, PostgreSQL isolation and storage-scope-not-auth.
- Both reviews are read-only against exact source
  `55cf5f8fe9d2e249c51535fc4f60bca3a3851310`; neither may accept, merge, repair
  or expand scope. Sol separately owns executable quality, receipt accuracy,
  source attribution, gate reproduction and final acceptance. G006C1-C6 and
  final G006B/G006 activation remain closed.

## G-006C0 immutable-source review result

- Architecture ACCEPTS `55cf5f8` with no finding. It independently confirmed
  exact replay-derived scope, closed backend/lifecycle discrimination, the
  fieldless selector-gated capability, C1-C6 deferral, truthful receipt and
  protected-path/public-signature exclusions. Its focused native gate passed
  12/12 in 175.95 seconds.
- Security ACCEPTS the same immutable source with no P0-P3 finding. It
  independently confirmed descriptor/proxy and post-invocation mutation
  defenses, caller-result rejection, raw G006B error propagation, capability
  forgery/copy/prototype/proxy rejection, fresh fail-closed behavior,
  PostgreSQL isolation and literal non-authority. Its focused native gate
  passed 12/12 in 178.12 seconds.
- Sol's source-quality audit confirms exact parent `b79a10c`, one-commit
  distance, three added paths only, clean source worktree, zero focused-test
  residue, clean diff and accurate local-only receipt. No finding requires a
  repair delta. Source is reviewed and eligible for a non-fast-forward local
  merge; C0 is not accepted until merged gates pass.

## G-006C0 accepted binding-verifier milestone

- Sol merged reviewed source `55cf5f8` with non-fast-forward merge `57ee0d6`,
  whose first parent is exact review control `59e7e94`. The merge contributes
  exactly the three authorized new C0 paths, and every merged blob is identical
  to its independently reviewed source blob.
- On the merged integration line, focused C0 passes 12/12 in 165.78 seconds and
  coordinator/PostgreSQL/session regressions pass 64/64 in 17.92 seconds.
  Typecheck, zero-warning lint, Next.js 16.2.6 production build with 11/11
  static pages, exact 37-table recovery verification, diff/scope, JSONL,
  protected-blob, worktree and residue gates all pass. Producer's frozen full
  accepted G006B gate passed 71/71; its G006B blobs are unchanged by C0 and the
  merged focused matrix executes the real verifier.
- G006C0 is accepted only as the local storage-scope verifier milestone. It does
  not wire startup or writers, provision fresh foundations, grant access,
  complete parent G006C/G006B/G006, or authorize external activity. The next
  serialized child is G006C1 initialization and explicit fresh binding. The
  known policy-blocked `g006b-identity-cleanup-qjkSgV` root remains untouched.

## G-006C1 initialization and fresh-binding preflight launch

- G006C1 begins from clean accepted C0 control `dbad727`. It may define the
  smallest explicit fresh-foundation provisioning/verification boundary and
  the initialization handoff required by later writer slices. It cannot wire
  ordinary C2-C6 writers, apply final G006B constraints, activate final G006A
  startup, infer a tenant/workspace/owner/policy/source/play identity, fabricate
  T-028, or grant authentication/authorization/provider authority.
- Three read-only preflights run under the four-agent ceiling. Architecture owns
  the current initialization call graph, staged G006A/B contracts, fresh versus
  upgraded lifecycle handoff and smallest compile-safe path ceiling. Security
  owns explicit-foundation trust, idempotency, transaction/race/failure
  boundaries, no defaults or receipt-as-authority, and storage-only capability
  semantics. Quality owns every initialization/catalog mutation, PostgreSQL and
  public-signature invariance, executable fresh/upgraded/restart/negative matrix,
  path collisions, locks and split sizing.
- Preflights are lock-free and read-only, may use only disposable local fixtures,
  and cannot edit, implement, accept, merge or touch the known blocked root.
  Sol must reconcile one explicit bounded Terra-medium packet before any C1
  producer edit. C2-C6 and final G006B/G006A/G006 remain closed.
