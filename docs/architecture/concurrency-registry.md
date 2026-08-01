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

## G-006C1 fresh-foundation reconciliation

- All three preflights completed read-only against clean launch `43209da` with
  no edits, tests, locks, temporary resources or blocked-root access. They agree
  C1 is a detached explicit fresh-foundation producer/verifier only. It must not
  call `getDb()`, `ensureDbReady()`, wire startup, seed geography, edit ordinary
  writers, alter PostgreSQL, fabricate T-028, or create source/play/location
  records absent from the accepted schema.
- Quality found 123 `ensureDbReady()` call sites across 21 files and 224 direct
  `getDb()` calls, making any C1 runtime hook unbounded. The legacy SQLite path
  reaches 191 conditional column migrations, a four-DDL leads rebuild, 190
  schema objects, business-type repair, 179 ZIP upserts, geography seeds and
  repairs. These paths remain byte-identical and disconnected from C1.
- Sol selects a four-path contract: modify
  `src/lib/db/sqlite-compatibility-scope.ts`; add
  `src/lib/db/sqlite-fresh-compatibility-scope.ts`; add
  `src/lib/__tests__/sqlite-fresh-compatibility-scope.test.ts`; and add
  `docs/validation/2026-07-30-g006c1-sqlite-fresh-foundation.md`. Existing C0
  `verifyCompatibilityScope`, `requireSqliteCompatibilityScope`, upgraded scope
  type and typed fresh rejection remain exact. New separately named fresh
  provision/require APIs use the same fieldless `SqliteCompatibilityBinding`
  type but a private fresh state map and fresh storage-scope result. Only the
  explicit fresh API dynamically loads the new SQLite producer.
- Fresh input is an exact descriptor-safe deep snapshot naming a canonical
  caller-owned existing empty database, expected device/FileId and journal
  mode, tenant/workspace, owner identity/membership/role, every persisted tenant
  and policy fact, fixed `google_places_legacy` source card, explicit accepted
  compatibility-play seed/version/configuration/binding pins, staged G006A
  catalog/internal/physical/user-version pins, and caller-pinned canonical
  foundation/binding hashes. No first/only/latest/environment/request/default
  selection or SQL default establishes authority.
- C1 retains the exact file descriptor and verifies path identity before opening
  an uncached direct connection. One outer `BEGIN IMMEDIATE` owns both accepted
  `createFreshSqliteSchemaV1` and the five named foundation inserts. A local
  disposable probe proved the existing nested immediate transaction becomes a
  savepoint: outer rollback removes both schema and rows. Exact staged state
  with the identical full foundation is replay; empty/partial/extra/different
  staged state and every other catalog kind reject without repair.
- The only successful durable rows are exactly one tenant, workspace, active
  owner membership, current owner role binding and tenant policy. Every other
  application table, including T-028 receipts and location reference data,
  remains empty. After commit C1 closes, independently reopens read-only under
  the retained identity, and repeats catalog, row, relationship, count, orphan,
  policy/source/play/hash and journal verification before C0 mints a capability.
  Post-commit uncertainty is typed committed-unverified recovery-required;
  pre-commit failure rolls back and never deletes the caller-owned file.
- Logical producer locks are `sqlite-schema`, `sqlite-compatibility-binding` and
  `fresh-foundation`. C1 creates no G006B lock and transfers no descriptor or
  lock beyond the call. The focused matrix must contain at least 24 substantive
  fresh/create/replay/race/failure/input/trust cases; existing C0, G006A, G006B,
  PostgreSQL/readiness/session, typecheck, zero-warning lint, build, recovery,
  four-path/protected-blob and zero-residue gates are mandatory. Stop on a fifth
  path, signature drift, non-atomicity, unsafe cleanup, final user-version 6002,
  startup/writer/G006A/B edit, new schema/receipt, location ownership need,
  inference/defaulting, external activity or blocked-root access.

## G-006C1 producer result and validation-exception disposition

- Terra-medium produced exactly one clean commit, `28b04d8`, over dispatch
  control `b38641f`. It changes only the four reconciled paths: the C0 bridge,
  new fresh producer, focused test and validation receipt. Protected startup,
  query, schema, G006A, G006B, PostgreSQL, package and recovery-contract blobs
  remain unchanged.
- The producer's C1 matrix passes 50 cases, with one internal worker case skipped
  only in the parent and executed successfully in four child processes. Exact
  simultaneous same-input callers serialize to one provision and one replay;
  different-input callers serialize to one provision and one typed foundation
  rejection while preserving the winner bytes. C0 passes 12/12, G006A 37/37,
  PostgreSQL/readiness/session 27/27, and typecheck, zero-warning lint, build and
  37-table recovery all pass.
- The mandatory full inherited G006B run completed 70/71 in 934.98 seconds. Its
  sole failure was the existing Windows two-publisher fixture receiving Win32
  sharing violation 32; the exact failed case passed 1/1 immediately in
  isolation. No G006B implementation, helper or test changed. Two earlier runs
  ended only at harness bounds below the known accepted runtime and produced no
  verdict.
- Those two harness timeouts left exact recoverable `%TEMP%` roots
  `g006b-b1-ZKgBDT` and `g006b-b1-Y18U0Y`. Both have no owner process, but native
  guarded cleanup was policy-blocked and no bypass was attempted. Therefore the
  producer truthfully does not claim a green full-G006B or zero-new-residue
  gate. The known `g006b-identity-cleanup-qjkSgV` root remains excluded and
  untouched.
- Under the failure/recovery protocol, Sol authorizes the accurate bounded
  producer commit to proceed to independent review only. G006C1 remains
  implemented with validation exceptions, not accepted, and is not eligible to
  merge until Sol adjudicates both exceptions after independent review.

## G-006C1 immutable-source review launch

- Architecture and security independently review exact immutable source
  `28b04d8`. Architecture owns API/lifecycle minimality, G006A transaction and
  staged-replay correctness, five-row/zero-other-table semantics, C0 and later
  writer compatibility, and receipt/scope accuracy.
- Security owns descriptor-safe snapshotting, canonical path/FileId and journal
  binding, race/rollback/postcommit uncertainty, hash/source/play/policy trust,
  capability forgery and cross-lifecycle rejection, and literal non-authority.
- Reviewers may run focused disposable local checks but make no source edits,
  commits, merges, acceptance claims, external calls or blocked-root access.
  Sol remains the sole authority for repair, exception disposition, merge and
  acceptance; C2-C6 and all parent completion remain closed.

## G-006C1 immutable-source review result and repair delta

- Architecture ACCEPTS exact source `28b04d8` with no P0-P3 finding. It confirms
  one-commit/four-path scope, additive C0 compatibility, atomic nested G006A
  creation plus five-row foundation, exact staged replay/rejection, independent
  read-only proof, later-writer deferral and truthful exception disclosure. Its
  independently run focused gate passed 50 tests with one parent-only worker
  skip executed in child processes, in 11.93 seconds.
- Security REJECTS the source with one P1. After the read-only verifier commits
  its snapshot, only path and device/FileId identity are rechecked before the
  private fresh capability is minted. A separate process can modify the same
  SQLite file in place during that pre-mint window without changing those
  identifiers. The focused gate passed 50 tests with the same parent-only skip
  in 11.58 seconds but does not exercise that exact window.
- Sol accepts the finding and keeps G006C1 unmerged. The bounded repair remains
  inside the same four paths and must establish a genuine SQLite no-write lease
  across a final exact logical-state attestation and the actual private-WeakMap
  mint. Any uncertainty after mint but before successful lease release must
  revoke the WeakMap entry and return typed committed-unverified recovery. No
  capability may escape an unsuccessful mint/release sequence.
- The repair adds an adversarial external-process mutation at the former
  post-proof/pre-mint window and proves deterministic ordering: mutation either
  wins before the final lease and the full reproof rejects without minting, or
  waits until after successful mint/release. It also proves post-mint failure
  revocation and preserves all existing 50 focused cases, C0 behavior, source
  boundaries and validation-exception disclosures. No fifth path, schema,
  startup, writer, G006A/B, PostgreSQL, receipt-as-authority or external action
  is authorized.

## G-006C1 repair producer result and immutable review launch

- Terra-medium completed repair commit `141aa2c` directly atop rejected source
  `28b04d8`, with exactly the same four authorized paths and a clean worktree.
  The repair preserves public C0 signatures and moves the actual private-map
  mint under a final no-write `BEGIN IMMEDIATE` lease after complete logical
  reproof. The binding and idempotent revoker remain private until rollback,
  close, final identity and descriptor checks succeed; every post-mint failure
  revokes, with a C0 deletion backstop.
- The repaired focused matrix passes 53/53 with one intentional parent worker
  skip executed by child processes in 20.12 seconds. It proves pre-lease
  external mutation rejection without mint, post-mint writer exclusion until
  lease release, and post-mint failure revocation followed by successful replay.
  C0 passes 12/12, G006A 37/37, PostgreSQL/readiness/session 27/27, and typecheck,
  zero-warning lint, build and 37-table recovery pass.
- The repair did not rerun the unchanged full G006B suite. Its prior truthful
  70/71 plus targeted 1/1 exception remains, as do the policy-blocked
  `g006b-b1-ZKgBDT` and `g006b-b1-Y18U0Y` roots. Zero C1 roots or owning task
  processes remain, and `g006b-identity-cleanup-qjkSgV` stays excluded and
  untouched.
- Architecture and the original security reviewer now inspect immutable repair
  `141aa2c`. They may run focused disposable checks but cannot edit, commit,
  merge, accept, touch blocked roots or perform external activity. Security must
  explicitly verify P1 closure and capability revocation; architecture must
  verify API/transaction compatibility and unchanged C1 scope. Sol alone decides
  repair acceptance, exception disposition and merge.

## G-006C1 repaired-source review result and merge eligibility

- Architecture ACCEPTS cumulative source `141aa2c` with no P0-P3 finding. It
  independently confirms exact two-commit/four-path lineage, unchanged public C0
  behavior, compatible final lease/reproof/mint flow, no persistent resource
  transfer, preserved staged/five-row/C2-C6 boundaries and truthful receipt. Its
  focused gate passes 53/53 with one parent-only worker skip in 17.92 seconds.
- Security ACCEPTS the same immutable repair and closes its P1 with no remaining
  P0-P3 finding. It confirms the sole private-map mint occurs synchronously
  after full reproof under `BEGIN IMMEDIATE`, pre-lease mutation rejects,
  post-mint writers wait for release, every post-mint uncertainty revokes, and
  no failed capability escapes. Its focused gate passes 53/53 with the same
  intentional parent skip in 18.29 seconds.
- Sol's cumulative audit confirms exact dispatch parent `b38641f`, source commits
  `28b04d8` then `141aa2c`, exactly four authorized paths, clean source worktree,
  clean diff and accurate receipt. No implementation repair remains.
- Sol classifies the unchanged full-G006B 70/71 result as an inherited Windows
  fixture sharing race because the exact failed case passes 1/1, both immutable
  G006B source and helper blobs remain unchanged, and no C1 behavior participates
  in that publisher path. The two timeout roots are recoverable, ownerless and
  policy-blocked; they remain explicit environmental residue rather than a
  concealed green gate. These exceptions permit reviewed local merge but are not
  represented as passing and remain visible in acceptance evidence.
- Source is eligible for a non-fast-forward local merge. G006C1 remains
  unaccepted until Sol verifies source-blob equivalence and runs the mandatory
  merged-control focused, regression, release, recovery, scope, JSONL and residue
  gates. C2-C6 and all parent completion remain closed.

## G-006C1 accepted fresh-foundation milestone

- Sol locally merged reviewed cumulative source `141aa2c` with non-fast-forward
  merge `4b681d3`, whose first parent is exact source-review control `0dc41da`.
  The first-parent delta is exactly the four authorized C1 paths, and every
  merged source blob is byte-identical to the independently reviewed source.
- On merged control, focused C1 passes 53/53 with one intentional parent-only
  worker skip in 20.98 seconds. The combined C0, G006A, PostgreSQL/readiness and
  tenant-session regression family passes 76/76 in 160.17 seconds.
- Mandatory `npm run release:check` passes end to end in 1112.7 seconds:
  TypeScript, full ESLint, 37-table recovery, the entire Vitest suite including
  inherited G006B, Next.js production build and local public read-only Playwright
  smoke are green. This merged full-suite pass resolves the producer's inherited
  G006B 70/71 validation exception without changing G006B source.
- Final diff/scope, source-blob, JSONL (551 records), worktree and process audits
  pass. No C1 temp root or task Node process remains. The two previously disclosed
  ownerless `g006b-b1-ZKgBDT` and `g006b-b1-Y18U0Y` roots remain recoverable only
  because guarded cleanup is policy-blocked; no new root was created by merged
  validation. The known `g006b-identity-cleanup-qjkSgV` root remains excluded and
  untouched.
- G006C1 is accepted only as the local explicit fresh-foundation provisioning,
  verification and fieldless storage-binding milestone. It does not wire startup
  or ordinary writers, grant authentication/authorization/provider execution,
  complete G006C/G006B/G006, or authorize external activity. The next serialized
  child is G006C2.

## G-006C2 access-and-crawl writer preflight launch

- G006C2 begins from clean accepted C1 control `7049d16` and is limited to the
  accepted G002 runtime writer family: `user_market_access`, `crawl_runs` and
  `crawl_units`. `zip_codes`, `location_markets` and `location_cells` remain
  non-authorizing platform reference data. C2 cannot edit their ownership,
  change PostgreSQL migrations or behavior, wire unrelated startup/writers,
  grant authority from the C1 storage binding, or enter G003-C6 scope.
- Architecture maps the exact current access/crawl call graph and accepted G002
  table/parent/location-mode contract to the smallest compile-safe SQLite writer
  slice, public-signature transition and path ceiling. It must preserve explicit
  fresh/upgraded binding use, unchanged PostgreSQL behavior and later C3-C6
  boundaries.
- Security maps the required actor/request/worker authorization input separately
  from storage scope; exact tenant and nullable-workspace agreement; access/run/
  unit parent integrity; platform-reference non-authority; legacy ZIP versus
  platform/generalized cell modes; idempotency/race/audit requirements; and every
  default/inference/receipt/session/environment stop condition.
- Quality inventories every read/write helper, action, route, worker, caller,
  test and mutation touching the three tables; identifies shared `queries.ts` and
  fixture collisions; defines the executable two-tenant/same-reference/parent-
  mismatch/mode/restart/PostgreSQL-invariance matrix; and recommends a bounded
  producer split and exact regression gates.
- All three preflights are read-only, lock-free and local. They may inspect source
  and run non-mutating discovery only; they cannot edit, test mutable shared
  fixtures, commit, merge, accept, access blocked roots or perform external work.
  Sol must reconcile one exact Terra-medium producer packet before any C2 edit.

## G-006C2 preflight result and serialized execution reconciliation

- Architecture and security both STOP a single broad C2 implementation. The
  three accepted G002 tables currently span more than twenty mutable exports and
  share the 10,000-line `queries.ts` surface with later G006C3-C6 work. Changing
  those helpers or their callers now would cross the accepted parent boundary,
  couple storage verification to authorization and create avoidable collision
  risk. No preflight made a source edit or ran a mutable fixture.
- Quality inventories 75 effective SQL templates, 50 SQL-bearing helpers, 21
  mutable exports and nine direct production caller modules for the three-table
  family. It gives a conditional GO only for three serialized detached packets:
  C2A operation permit, C2B `user_market_access` writer, then C2C crawl writer.
  These are execution packets beneath the existing G006C2 card; they do not add,
  remove, complete or renumber any implementation card, and G006C2 remains open
  until all three packets pass independent review and merged-control acceptance.
- Sol accepts that reconciliation. C2A owns only an opaque operation permit and
  its seam tests. C2B owns only the access writer. C2C owns only the crawl writer.
  None may edit or activate legacy query/action/route/worker call sites. Startup,
  public integration, audit persistence and final caller conversion remain in
  their already planned later G006C packets. PostgreSQL behavior and public
  legacy signatures stay byte-identical throughout the detached sequence.
- The accepted G002 contract is unchanged: only `user_market_access`,
  `crawl_runs` and `crawl_units` are tenant-owned; nullable workspace scope must
  match the exact tenant; units inherit exact tenant/workspace from their parent
  run. `zip_codes`, `location_markets` and `location_cells` remain platform-global
  references and never grant authority. Legacy ZIP, platform-cell and generalized
  modes require explicit persisted discriminants and exact reference checks; no
  identifier, market, token, session default, receipt or caller result may infer
  scope or authority.

## G-006C2A SQLite G002 operation-permit launch packet

- Terra-medium receives a four-path ceiling: new
  `src/lib/db/sqlite-g002-operation-permit.ts`, shared test fixtures at
  `src/lib/__tests__/sqlite-g002-operation-fixtures.ts`, focused tests at
  `src/lib/__tests__/sqlite-g002-operation-permit.test.ts`, and validation receipt
  `docs/validation/2026-07-30-g006c2a-sqlite-g002-operation-permit.md`.
- Before editing, the producer must return a GO/STOP API checkpoint. A GO design
  must expose a small fieldless, private-WeakMap permit and a narrow exact-match
  consumer seam for C2B/C. Permit creation requires an explicit fresh or upgraded
  lifecycle, the corresponding genuine C0/C1 binding, exact database/tenant and
  nullable operation-workspace selectors, and independently resolved authority.
  A non-null operation workspace must equal the storage binding's named workspace;
  a null operation workspace is explicit tenant-wide scope, never a default.
- Interactive authority must be resolved inside the permit boundary through
  `requireTenantPermission` with an operation-fixed tenant permission, action and
  policy evaluation. A caller-supplied session shape or boolean is not authority.
  Worker authority must come from the active `requireWorkerTenantContext()` value
  established by the durable lease authorization flow, with exact tenant,
  nullable workspace, worker name and action agreement. Cron authentication alone
  is never tenant authority. Copying, spreading, proxying or fabricating a permit
  must fail closed.
- C2A performs no table mutation and grants no provider execution. Its focused
  matrix contains at least 18 substantive fresh/upgraded, member/worker, nullable-
  workspace, operation, mismatch, forgery, proxy and no-context cases. Existing
  C0 12-case and C1 53-case gates, G006A, PostgreSQL/readiness/session, typecheck,
  zero-warning lint, protected-blob/four-path and owned-prefix residue checks are
  mandatory. A fifth path, writer/query/caller/startup/schema/auth implementation
  edit, PostgreSQL change, plain authority object, receipt authority, inferred
  selector, persistent audit, external activity or self-acceptance is a stop.

## G-006C2A API-checkpoint stop and contract reconciliation

- Terra-medium returns STOP before editing. The fieldless permit and consumer
  seam are technically feasible, but all three proposed interactive permissions
  require conditional domain policy for at least the owner/admin roles that need
  them. `requireTenantPermission` correctly fails with `POLICY_BLOCKED` when a
  conditional decision has no evaluator, and the repository contains no trusted
  production evaluator for membership grants, source execution or queue control.
  A caller-supplied allow callback, fabricated session or partial worker-only
  implementation is forbidden. The producer worktree remains clean at dispatch
  control `5bb4633`; it made no edit, fixture, test, temporary root or commit.
- Sol does not resolve that stop by inventing or pulling forward a broad policy
  engine. The previously accepted G006 activation contract says G006C is a
  storage-scope compatibility adapter that grants no authentication or
  authorization, while G009-G022 later replace it with generalized request and
  worker scope. The stopped packet may therefore have crossed its parent contract
  by trying to make a G006 storage adapter own later domain authorization.
- Architecture and security now perform a local read-only reconciliation against
  the exact accepted G006 activation decision, G006C0/C1 APIs, T012 authorization
  boundary and G009/G010/G013 successors. They must decide whether C2A should be
  rewritten as an explicitly non-authorizing storage-operation capability for
  detached writers, or whether all C2 writer implementation must pause until a
  named later authority dependency exists. They cannot edit, test mutable
  fixtures, acquire locks, touch blocked roots, perform external activity or
  waive the no-default/no-inference rules. Sol alone may reconcile a replacement
  packet; the stopped packet authorizes no implementation.

## G-006C2A replacement storage-operation packet

- Architecture and security independently return GO for a replacement C2A only
  as an unwired, non-authorizing SQLite storage primitive. That is the original
  G006C boundary: it constrains compatibility mutations to the exact verified
  database, tenant, nullable row workspace and G002 operation, but it neither
  decides nor represents who may invoke them. T012/T013 and the later G009,
  G010 and G013 cutover continue to own interactive and worker authority.
- The stopped authority-aware packet is superseded, not waived. Its exact four
  paths and Terra-medium producer remain, but C2A must not import or call tenant
  permission, policy, session, worker-context or cron authorization. It defines a
  fieldless private-WeakMap storage-operation capability with literal
  `storage-operation-scope-only` meaning and literal false authentication,
  authorization, worker and provider grants. It is not exported from a public
  barrel or wired to production callers.
- Creation consumes only a genuine C0 upgraded or C1 fresh binding through the
  lifecycle-corresponding assertion, plus exact `databasePath`, `tenantId`,
  `storageWorkspaceId`, explicit `operationWorkspaceId` and one fixed G002 table
  operation. A non-null operation workspace must equal the storage workspace;
  null explicitly denotes a tenant-wide row and can never be omitted, defaulted
  or inferred. A one-shot exact-match consumer deletes private state before
  returning frozen storage evidence. Copies, spreads, proxies, prototypes,
  fabrications, replays and cross-lifecycle/database/tenant/workspace/operation
  uses fail closed.
- C2A mutates no table and exposes no callback or database handle. Its focused
  matrix has at least 24 genuine fresh/upgraded, exact-null/exact-workspace,
  lifecycle, database, tenant, operation, input-shape, forgery, proxy, copy,
  replay and one-shot cases. It must prove the returned evidence contains only
  storage facts and the literal false grants. Existing C0/C1/G006A and
  PostgreSQL/readiness/session regressions, typecheck, zero-warning lint,
  four-path/protected-blob and owned-prefix residue gates remain mandatory.
- C2B/C may later consume this primitive only in detached SQLite writer modules;
  no route, action, worker, scheduler, startup, legacy public signature or
  PostgreSQL branch may use it inside C2. Any need for a policy evaluator,
  actor/session/worker fact, persistent audit, caller activation, scope inference
  or an additional path is a stop. This replacement preserves all 318 cards and
  defers—not deletes or duplicates—the G009/G010/G013 authority conversion.

## G-006C2A producer result and immutable-source review launch

- Terra-medium produced exact source `db501cc` as one clean commit over
  replacement dispatch control `fb13a10`. Its four new paths are the permit
  module, owned fixture, focused test and validation receipt; every previously
  tracked path is unchanged. The implementation is fieldless, private-WeakMap,
  lifecycle-bound, exact-scope, one-shot and explicitly non-authorizing, with no
  SQL, database handle, public barrel or production caller wiring.
- Focused C2A passes 36/36. Mandatory regressions pass: C0 12/12, C1 53/53 with
  its intentional parent-only worker skip, G006A 37/37, PostgreSQL client/session
  27/27 and supplemental readiness 30/30. Typecheck and full zero-warning ESLint
  pass. The producer reports 458 preserved baseline blobs, zero unexpected call
  sites, zero C2A/C0/C1 temporary roots and zero worktree-bound processes.
- Two corrected attempts remain disclosed: a fixture imported a digest from the
  wrong owner before any test case ran, and a two-database immutability proof hit
  Vitest's default five-second case timeout only while deliberately contending
  with three other heavy gates. The corrected import passes; the filesystem case
  has a bounded 15-second timeout and passes in the final isolated 36/36 run.
- Sol's pre-review scope and protected-blob audit passes, but finds one P3 receipt
  accuracy issue: this worktree did run `npm ci` before producer dispatch and the
  resulting 14 audit findings were observed in this packet environment. The
  receipt instead says `node_modules` was already present and attributes the
  finding only to an inherited G002 run. Source remains unmerged and unaccepted;
  that wording must be repaired together with any independent review findings.
- Architecture and security now review immutable source `db501cc` independently.
  Architecture owns deep-module/API minimality, lifecycle and one-shot semantics,
  C2B/C consumption compatibility, non-activation and later-card preservation.
  Security owns binding forgery, selector snapshot/proxy/accessor behavior,
  capability copying/replay/burn semantics, confused-deputy/non-authority claims,
  cleanup containment and failure disclosure. Reviewers may run focused local
  checks but cannot edit, commit, merge, accept, access blocked roots or perform
  external activity. Sol alone authorizes a bounded repair and final merge.

## G-006C2A immutable review result and documentation repair

- Architecture and security both ACCEPT immutable implementation source
  `db501cc` with no P0-P2 finding. Each independently reruns the focused suite
  36/36 and leaves zero C2A roots. They confirm the three-operation deep module,
  genuine lifecycle binding, explicit nullable workspace, terminal one-shot
  consumption, literal non-authority, four-path scope and non-activation.
- Both reviewers confirm Sol's dependency-record P3. Architecture adds one P3
  trust-description correction: the permit narrows a genuine binding whose
  storage facts were verified earlier; it does not reopen/read the database,
  hold a SQLite lease or prove current file/row state at permit creation or
  consumption. The runtime API remains correct, but its comment and receipt must
  say so precisely.
- One Terra-medium repair commit is authorized on top of `db501cc`, limited to
  the module comment and existing validation receipt. It must record the actual
  pre-dispatch `npm ci` and observed 14 findings, distinguish that preparation
  from producer implementation, and retain that no remediation occurred. It
  must describe the capability as narrowing previously verified C0/C1 evidence,
  not current-state proof, and state that C2B/C own current canonical file/schema,
  tenant/workspace, parent and persisted location-mode checks in their atomic
  operations. No code behavior, test, fixture, API, third path, authority,
  caller, startup, PostgreSQL or external change is permitted.
- Source remains unmerged and unaccepted. Both reviewers must verify the exact
  repair delta before Sol may adjudicate merge eligibility.

## G-006C2A documentation-repair result and rereview launch

- Terra-medium completed repair commit `27582d1` directly atop `db501cc`, with
  exactly the authorized module comment and validation receipt paths. The
  cumulative source remains the original four paths and the worktree is clean.
- The receipt now records root's exact pre-dispatch `npm ci`, normal package-
  registry traffic, 448 installed/449 audited packages and 14 findings, while
  preserving that no remediation or prohibited external action occurred. The
  comment and receipt now state that C2A narrows previously verified binding
  evidence only and assigns current file/schema/scope/parent/location checks to
  the atomic C2B/C writers.
- Repair validation passes focused C2A 36/36, typecheck and focused zero-warning
  ESLint. Comment-stripped TypeScript output remains byte-equivalent, the fixture
  and test blobs are unchanged, cumulative scope is four paths, and C2A residue
  and worktree-bound process counts are zero.
- The original architecture and security reviewers now verify immutable repair
  tip `27582d1`. They may inspect and run focused local checks but cannot edit,
  commit, merge, accept, touch blocked roots or perform external activity. They
  must confirm both P3s are closed, behavior remains unchanged and the receipt's
  repair lineage is unambiguous. Sol alone decides merge eligibility.

## G-006C2A repair rereview and lineage-only correction

- Both original reviewers confirm the dependency/activity and current-state
  trust P3s are closed, with no runtime, API, security or scope finding. One P3
  receipt ambiguity remains: `Repair source: db501cc` identifies the pre-repair
  parent but does not identify reviewed repair tip `27582d1`.
- Sol authorizes one receipt-only Terra-medium correction on top of `27582d1`:
  replace that line with the full immutable pre-repair baseline `db501cc...` and
  full repair commit/tip `27582d1...`. No other text, code, test, fixture,
  validation result, behavior, third cumulative path, external action or
  self-acceptance is permitted. The same reviewers must verify the exact one-line
  delta before merge eligibility.

## G-006C2A lineage-repair result and final rereview

- Terra-medium completed receipt-only commit `3cba1d0` directly atop `27582d1`.
  Its exact delta is one path and one hunk: one ambiguous lineage line becomes
  explicit full pre-repair baseline `db501cc...` and repair commit `27582d1...`.
  `git diff --check` passes, cumulative scope remains four paths and the source
  worktree is clean. Tests were correctly not rerun for this receipt-only edit.
- The same architecture and security reviewers now inspect exact tip `3cba1d0`
  only for lineage closure and delta integrity. No edit, commit, merge,
  acceptance, blocked-root access or external activity is authorized. Sol alone
  decides source eligibility and merged-control validation.

## G-006C2A self-reference-safe receipt lineage correction

- Architecture ACCEPTS `3cba1d0` as the exact one-path/one-hunk correction.
  Security finds that `Repair commit (this receipt): 27582d1` still mislabels
  the current receipt revision. Sol accepts the wording defect but rejects the
  proposed insertion of `3cba1d0` as a durable solution: any commit changing
  the receipt necessarily has a different hash, so a Git commit cannot contain
  its own final hash.
- A final receipt-only Terra-medium correction is authorized on top of
  `3cba1d0`: name `db501cc` the pre-repair baseline and `27582d1` the Repair-1
  content commit, then state that the receipt-only lineage commit is recorded in
  the append-only implementation ledger because the receipt cannot self-embed
  its own Git hash. No second path, other text, code, test, result, validation,
  external action or self-acceptance is permitted. The ledger will record the
  resulting immutable tip after it exists; both reviewers must verify closure.

## G-006C2A self-reference-safe repair result

- Terra-medium completed exact receipt-only commit `05d2e2a` atop `3cba1d0`.
  The one-path/one-hunk delta names the pre-repair baseline and Repair-1 content
  commit, then delegates the receipt-only tip to this append-only ledger without
  embedding a self-invalidating hash. `git diff --check` passes, cumulative scope
  remains four paths and the source worktree is clean; no tests were required.
- Architecture and security now perform the final exact-delta closure check on
  immutable source `05d2e2a`. No edits, tests, commits, merge, acceptance,
  blocked-root access or external activity are authorized.

## G-006C2A final source review and merge eligibility

- Architecture and security both ACCEPT exact clean source tip `05d2e2a` with
  no remaining P0-P3 finding. They verify the one-path/one-hunk final delta,
  self-reference-safe receipt lineage, preserved dependency/current-state facts,
  unchanged behavior and exact four-path cumulative scope.
- Sol's cumulative audit confirms dispatch baseline `fb13a10`, implementation
  `db501cc`, trust/receipt repair `27582d1`, intermediate lineage correction
  `3cba1d0` and final receipt correction `05d2e2a`. Previously tracked blobs and
  protected surfaces remain unchanged; the source worktree is clean. The extra
  commits are attributable documentation repairs required by independent review,
  not hidden implementation expansion.
- Source is eligible for a non-fast-forward local merge. G006C2A remains
  unaccepted until Sol verifies merged first-parent scope/source-blob equality,
  reruns focused and mandatory regression/static gates, validates JSONL and
  residue/process state, and records the acceptance boundary. C2B/C and every
  parent remain open.

## G-006C2A accepted storage-operation milestone

- Sol locally merged reviewed source `05d2e2a` with non-fast-forward merge
  `69ef626`, whose first parent is exact source-review control `dc779a3`. The
  first-parent delta is exactly the four authorized C2A paths and every merged
  blob is byte-identical to the independently reviewed source.
- On merged control, focused C2A passes 36/36; C0 passes 12/12; C1 passes 53/53
  with its intentional parent-only worker skip; G006A passes 37/37; and
  PostgreSQL client/session passes 27/27. Typecheck and full-repository ESLint
  with zero warnings pass. The slow C0 replay remains within its known bound.
- Final audits pass: 592 pre-acceptance JSONL records parse, protected source
  mismatches and unexpected C2A call sites are zero, C2A/C0/C1 temp roots are
  zero, worktree-bound processes are zero, and both integration and producer
  worktrees are clean. The package-registry preparation and 14 dependency
  findings remain truthfully recorded without remediation.
- G006C2A is accepted only as an unwired, fieldless, one-shot SQLite storage-
  operation narrowing primitive. It proves no current database state and grants
  no authentication, authorization, worker or provider execution. C2B/C must
  perform atomic current file/schema/scope/parent/location revalidation, and
  G009/G010/G013 retain runtime request/worker authority. G006C2, G006C, G006B,
  G006A and parent G006 remain open; the next serialized packet is G006C2B.

## G-006C2B user-market-access writer preflight launch

- G006C2B begins from clean accepted C2A control `2f5ad55` and is limited to one
  unwired SQLite `user_market_access` writer, one focused test and one validation
  receipt. It may consume only the one-shot `user_market_access` C2A storage
  permit. It cannot modify C2A, legacy queries/actions/callers, startup, schema,
  migrations, PostgreSQL behavior, public barrels, audit persistence or C2C-C6.
- Architecture maps the exact final SQLite table/triggers, database-client and
  transaction seams, one-shot permit consumption order, current-state facts that
  can be proven from accepted C0/C1/C2A interfaces, deterministic replacement
  semantics and the three-path API ceiling. It must stop if safe current-state
  verification requires an upstream API or fourth path.
- Security maps canonical-path/file-state handling, current tenant/workspace and
  active target/creator membership, active platform-market integrity, nullable-
  workspace identity, transaction/TOCTOU/rollback behavior, creator non-authority,
  audit-fact-only output and every inference/default/confused-deputy stop. No
  policy/session/worker authorization may be invented in this storage packet.
- Quality inventories exact schema columns/indexes/triggers and legacy behavior,
  then defines an executable at-least-20-case fresh/upgraded, two-tenant, null/
  named-workspace, membership, market, replace/replay, rollback, restart, DB-swap,
  no-caller and PostgreSQL-invariance matrix with protected blobs and residue
  gates. All three preflights are local, read-only, lock-free and cannot edit,
  run mutable shared fixtures, commit, merge, accept, touch blocked roots or use
  external services. Sol must reconcile one Terra-medium producer packet first.

## G-006C2B preflight stop and C2A Repair-4 reconciliation

- Architecture, security and Terra-medium Quality independently STOP C2B before
  implementation. Accepted C2A retains only exact lifecycle/path/tenant/storage-
  workspace/operation-workspace/operation selectors. It deliberately discards
  the C0/C1 file, journal, catalog, physical-manifest and foundation anchors that
  C2B must compare against current state. A writer could validate the current
  path in isolation but could not prove it is the physical database previously
  bound by C0/C1. `BEGIN IMMEDIATE` closes only races after open and cannot repair
  that missing provenance. All preflights were read-only and made no source,
  fixture, test, lock, temporary-resource, blocked-root or external change.
- The table inventory is preserved for the resumed writer packet. Fresh/staged
  SQLite has explicit tenant scope, nullable workspace scope, no legacy primary
  key and two null-safe partial unique identities. Upgraded/prepared-legacy keeps
  the global `(user_id, market_id)` primary key while its backfilled tenant and
  workspace columns remain nullable. Neither lifecycle has a SQLite access-table
  validation trigger. The legacy helper remains unsafe because it deletes only
  by user, inserts no scope and validates markets outside its transaction.
- Sol preserves the original G006C2 card and all 318-card/Q-040/T-029 scope. C2B
  remains open and unimplemented; C2C and C3-C6 remain ordered behind it. The
  smallest unblock is C2A Repair-4, an evidence-propagation repair beneath the
  already accepted C2A milestone, not a new card or authority expansion.
- Repair-4 has an exact five-path ceiling: `sqlite-compatibility-scope.ts`, its
  focused test, `sqlite-g002-operation-permit.ts`, its focused test, and the
  existing C2A validation receipt. The shared fixture, C1, G006B, schemas,
  migrations, legacy queries/actions/callers, startup, PostgreSQL paths, public
  barrels and persistent audit stay byte-identical.
- C0 must mint a fieldless, non-barrel, private-WeakMap storage-anchor capability
  only from a genuine lifecycle binding and exact selectors. Fresh private state
  may retain the already verified C1 file/journal/catalog/physical/foundation
  facts. Upgraded private state must retain the already snapshotted and verified
  G006B replay proof, including its native identity and journal pin, so C2B can
  repeat the authoritative current proof. Caller-supplied anchors, receipts,
  hashes, paths, callbacks or reconstructed trust are forbidden. A post-replay
  `stat` alone is insufficient and cannot replace the sealed replay proof.
- C2A must keep its existing public selector-only, literal-non-authority evidence
  stable. It stores only the fieldless C0 anchor with private permit state and
  adds a deep, non-barrel writer-consumer seam that burns both one-shot states
  before hostile expectation processing. It must not expose replay payloads,
  identity details, PII, a database handle or an authority callback. Every grant
  remains literal false; G009/G010/G013 still own actor/request/worker authority.
- Repair tests must directly cover the new C0 contract for both lifecycles and
  the C2A propagation/burn boundary: genuine-binding-only minting, exact selector
  matching, frozen/fieldless/copy/proxy/forgery denial, cross-lifecycle denial,
  replay and terminal failure, sealed upgraded proof, fresh anchor preservation,
  no serialization or PII exposure, stable public evidence and zero mutation or
  activation. Existing C0/C1/C2A/G006A, PostgreSQL/readiness/session, typecheck,
  zero-warning lint, five-path/protected-blob and residue/process gates remain
  mandatory. The producer must return GO/STOP API choreography before editing.

## G-006C2A Repair-4 producer result and immutable review launch

- Terra-medium returned GO before editing, and Sol authorized the corrected
  ownership design: a deep-module exported but fieldless anchor brand backed by
  C0 private state; terminal upgraded current proof repeats the sealed verified
  G006B replay; fresh proof transfers only prior frozen C1 storage anchors; and
  C2A separates ordinary consumption from writer transfer without changing its
  public evidence shape or running current proof too early.
- Producer commit `1d2931d30222957a7dad856360607bc3b7121558` is one commit
  directly over dispatch control `b9fb91314bf5338127b0a6ea632579ec1371b988`.
  Its delta is exactly the five authorized paths. The shared fixture, C1, G006B,
  schema/migrations, legacy queries/actions/callers, startup, PostgreSQL and
  barrels remain unchanged; the producer worktree is clean.
- Producer validation passes C0 14/14, C2A 38/38, and the combined C1/G006A/
  schema/PostgreSQL/readiness/session family with 83 passed and one intentional
  subprocess skip. Typecheck, focused ESLint, full repository zero-warning lint,
  diff-check, exact-five-path, no-barrel/caller and owned-residue gates pass.
  Dependencies came from a local integration `node_modules` junction; no install,
  registry access or other external activity occurred in Repair-4.
- A pre-commit scope audit found that the producer initially replaced the prior
  validation receipt instead of appending. Sol required correction before any
  commit. Final source preserves the accepted 246-line receipt byte-for-byte and
  appends only a 31-line Repair-4 section; the discarded uncommitted rewrite is
  not represented as accepted evidence.
- Architecture and security now review immutable `1d2931d` independently.
  Architecture owns API compatibility, deep-module minimality, lifecycle proof,
  terminal ownership, C2B usability and exact five-path/later-card preservation.
  Security owns sealed-proof provenance, async burn/revoke ordering, file-swap
  and in-place mutation coverage, forgery/proxy/serialization/PII exposure and
  literal non-authority. They must explicitly examine upgraded null-prototype
  replay compatibility and whether the receipt records all Repair-4 validation.
  Reviewers may run local focused checks but cannot edit, commit, merge, accept,
  touch blocked roots or perform external activity. Sol retains sole authority.

## G-006C2A Repair-4 review rejection and Repair-5 proof preflight

- Architecture STOPs and security requires repair on immutable `1d2931d`; Sol
  rejects it for merge. The principal P1 is availability: every upgraded anchor
  consumes the original G006B historical replay, whose COMMITTED comparison pins
  immutable database/full-row evidence. The first legitimate G002 write changes
  that evidence, so every later consume, idempotent replacement and fresh-process
  C0 remint fails permanently. The focused tests exercise upgraded proof only
  before mutation and C2A writer transfer only on fresh storage, so they do not
  expose this failure.
- Security adds a P1 sequencing gap: terminal anchor proof completes only after
  G006B releases its native lease and returns no retained file/connection/lease
  token. C2A then transfers only evidence and a fieldless anchor. Repair-4 alone
  therefore does not prove the same file remains continuously bound through a
  later C2B `BEGIN IMMEDIATE`; current proof and mutation are still separated.
- Both reviewers identify the upgraded snapshotter regression. Reusing C1's
  plain-record copier rejects nested null-prototype values accepted by G006B and
  silently drops decorated non-enumerable string properties instead of rejecting
  them, changing accepted C0 input semantics. Architecture also finds that the
  proof returns full fresh/upgraded scope objects with identity/membership/role/
  policy/source/play fields beyond C2B's minimal storage needs. The receipt does
  not record actual Repair-4 commands/results and its no-PII statement overclaims.
- The source remains a clean, attributable rejected commit in its isolated
  worktree; it is not merged, accepted or discarded. C2B remains unopened. No
  review test, edit, lock, temporary root, blocked-root or external action ran.
- Repair-5 is a read-only reconciliation before any further edit. Architecture
  must decide whether an operational proof distinct from immutable historical
  G006B replay can support repeated prepared-legacy mutations, exact restart
  reminting and later C3-C6 writers without weakening provenance or requiring a
  persistent mutable checkpoint. Security must design continuous file/lease/
  transaction identity across proof and future writer mutation without exposing
  a database handle, arbitrary callback or authority. Terra-medium Quality must
  define the mutation-then-reconsume, restart/remint, exact-clone swap, in-place
  mutation, null-prototype/decorated-input and receipt/gate matrix and the honest
  path ceiling. A need to change G006B, reorder finalization, add a durable proof
  record or exceed the existing packet is a reported STOP, not an inferred waiver.
- This reconciliation remains beneath the same original G006C2 card and may
  change its internal packet sequencing only after Sol adjudication. All 318
  cards, Q-040, T-029, G006C2B/C, C3-C6 and G009/G010/G013 authority remain open
  and preserved. No implementation is authorized by this preflight launch.

## G-006C2A Repair-5 stop and finalization-first sequencing preflight

- Architecture STOPs Repair-5 inside C0/C2A. Immutable G006B generation-zero
  history and process-local capabilities cannot, after a legitimate prepared-
  legacy write and process restart, distinguish that authorized change from an
  identically shaped offline in-place mutation. A retained lease can close one
  proof-to-write window but cannot survive restart. A checkpoint stored only in
  the mutable database is equally insufficient against offline rewrite.
- Terra-medium Quality confirms that the old five-path ceiling is dishonest and
  supplies the required second-write, restart/remint, clone/swap, in-place drift,
  concurrency, crash, input-semantics and receipt matrix. Its follow-up fixed-
  operation runner proposal could own one lease-held transaction without a raw
  handle or arbitrary callback, but it has no independent durable restart trust
  root. Sol therefore rejects that nine-path proposal as incomplete rather than
  authorizing speculative source.
- The original security reviewer did not return a verdict after bounded stop
  requests and was interrupted without repository activity. Under the user's
  approved fallback, a Terra-medium security review independently accepts the
  restart indistinguishability finding and STOPs the fixed runner as a complete
  solution. It recommends finalization-first only after a narrow compatibility
  preflight; the alternative is an externally trusted mutable checkpoint chain
  atomically advanced by every C2-C6 writer, a much broader recovery contract
  that Sol does not infer or authorize.
- Sol closes Repair-5 without code. Accepted C2A at `2f5ad55` remains exactly an
  unwired, non-authorizing, one-shot selector permit; rejected Repair-4 source
  `1d2931d` remains clean, attributable and unmerged. C2B remains unopened and
  G006C2C/C3-C6 plus every parent, all 318 cards, Q-040 and T-029 remain open.
- The next step is read-only finalization-first sequencing proof. Architecture
  maps the remaining G006B finalization dependencies and decides whether final
  constraints/startup proof can precede C2-C6 without losing their contracts.
  Security defines the finalized-state operational binding, immutable-versus-
  mutable trust boundary, retained lease/transaction sequence and restart/tamper
  behavior. Terra-medium Quality inventories the exact prepared/final schema and
  creates the executable finalization, first-write, second-write, restart, swap,
  rollback and regression matrix with an honest path ceiling.
- These preflights are local, read-only, lock-free and source-free. They cannot
  edit, test mutable fixtures, create temporary resources, access blocked roots,
  perform external activity or authorize finalization, C2B/C, C3-C6, startup or
  later-card implementation. Sol must reconcile their evidence before any edit.

## G-006 finalization-first reconciliation and G-006B-B2 launch packet

- Architecture returns GO for finalizer implementation first and STOP for
  finalizer activation first. The existing product order remains binding for the
  durable database and startup: G006B finalization is not executed or activated
  until C2-C6 writer coverage passes. Source implementation and disposable-
  fixture proof do not depend on those writers and may run first so every writer
  subsequently targets the same final schema.
- Security and Terra-medium Quality return REPAIR because current control has no
  remaining-finalizer contract. They agree on the safe runtime boundary: the
  final handoff authenticates historical B1 lineage, canonical/native file
  identity, final catalog/physical schema, immutable receipt/foundation/scope,
  journal and health. Operational rows are mutable by design after finalization.
  The binding does not claim detection or provenance for a constraint-valid
  offline in-place operational-row edit; a stronger claim would require a
  separately approved external mutable integrity root that is not inferred here.
- B2 implements only the exact quiescent `prepared-legacy@6000` to `final@6002`
  transition. It authenticates the existing B1 PREPARED/COMMITTED chain, publishes
  a separately versioned finalization PREPARED record, retains the same-file
  native lease through one `BEGIN IMMEDIATE`, losslessly rebuilds the seventeen
  transformation tables, explicitly derives `crawl_units.location_mode` only
  from validated legacy facts, preserves audit/receipt and sequence state, then
  close/reopen-verifies and durably publishes finalization COMMITTED evidence.
  Execute, resume, replay and every ambiguous artifact/database crash pairing are
  explicit; B1 artifacts are never overwritten or reinterpreted.
- The B2 producer ceiling is seven existing paths:
  `sqlite-g006b-pre-finalization.ts`, its focused test, the Windows durable-
  publisher script, the existing G006B receipt, `sqlite-schema-coordinator.ts`,
  its focused test, and the existing G006A receipt. The producer must first return
  a GO/STOP API/state-machine choreography with zero changes. The publisher path
  may remain unchanged if its existing closed command vocabulary suffices; an
  eighth path, schema-definition change, generic prepared-state capability,
  C0/C1/C2A/C2B edit, startup/caller/PostgreSQL change, persistent database
  execution or external action is a stop.
- C0/C1 finalized-only remint and C2A finalized-binding consumption remain a
  separate serialized repair after accepted B2 source. C2B/C and C3-C6 remain
  their original cards and will be implemented/tested against disposable fresh-
  final and upgraded-final fixtures. Final activation and startup remain last.
  G006A/B/C and parent G006 stay open; no card, Q-040 or T-029 scope is removed.
- Terra-medium owns isolated branch `codex/nova-g006b-finalization` in
  `C:\Users\Masih\Documents\NovaTradeWorktrees\g006b-finalization` from this
  launch control. It has no acceptance authority. Architecture/security review,
  Sol merged-control gates and truthful receipt evidence remain mandatory.

## G-006B-B2 API review and corrected producer authorization

- Terra-medium returns GO with six changed paths and confirms the existing
  Windows publisher vocabulary can durably publish B2 PREPARED/COMMITTED without
  a script edit. Its first choreography proposed an exported coordinator helper
  accepting a caller-owned `better-sqlite3` connection inside an existing
  transaction. Architecture and security both REPAIR that seam before any edit:
  an intended sole caller is not runtime enforcement, and raw prepared-database
  possession must not bypass B1/B2 lineage, native lease or terminal ownership.
- Sol requires the corrected ownership boundary. G006B authenticates B1,
  publishes durable B2 PREPARED and retains its native no-replace lease. It then
  privately mints an unexposed, fieldless, one-shot WeakMap handoff bound to the
  exact B1/B2 IDs and hashes, canonical/native identity, prepared preservation/
  foundation/catalog evidence and fixed final target. No database, lease,
  callback, replay payload or raw artifact crosses the boundary.
- The coordinator receives only that handoff, burns it before hostile input or
  database work, then owns exact-path open, its own file/connection lease,
  `BEGIN IMMEDIATE`, the fixed seventeen-table rebuild, rollback/commit, close
  and postcommit final verification. G006B remains awaiting with the native lease,
  independently reopens and native-verifies the result, then publishes B2
  COMMITTED. Forgery/copy/proxy/replay/cross-file/cross-binding attempts fail.
- A static live-binding module cycle is permitted only with no top-level
  dereference or invocation and a focused initialization regression. The
  existing generic later-finalizer capability continues rejecting prepared
  state. Any raw-DB prepared helper, public prepared mint, seventh changed path,
  publisher change, C0/C1/C2/startup edit or activation is a stop.
- Terra-medium confirms GO on that exact correction with zero edits. Sol now
  authorizes implementation in the isolated B2 worktree within the six changed
  paths; publisher bytes are a mandatory protected invariant. Producer tests,
  truthful append-only receipts, one attributable commit and clean source are
  required before immutable architecture/security review. No self-acceptance,
  integration merge, persistent finalization or external activity is authorized.

## CP-0 resume and immutable G-006B-B2 checkpoint review

- The user resumed CP-0 on 2026-07-31. Integration remains clean at
  `64ed00c722f648e27f2aeba46dc1a82abf5d5e63`; checkpoint control
  `cfbb65005d38200da8911af1de076448271c09f1`, planning control
  `ecb5c660f1f1e2886294ef2c3f2b524fccf38615`, rejected Repair-4
  `1d2931d30222957a7dad856360607bc3b7121558`, and every prior ledger event,
  branch, worktree, accepted card, all 318 cards, Q-040 and T-029 remain
  preserved.
- The interrupted G006B-B2 producer state is preserved as clean, attributable
  checkpoint commit `1e778f4b650dfc97dc599735af8539c8ba26f528`. It changes only
  `sqlite-g006b-pre-finalization.ts` and `sqlite-schema-coordinator.ts`, contains
  no completed B2 tests or receipt updates, and remains unmerged and unaccepted.
  Resume uses this immutable source as the repair base; it does not restart the
  card or revive either rejected Repair-4 or stopped Repair-5.
- Before any writer resumes, three Terra-medium read-only lanes independently
  review the checkpoint: architecture/API/state-machine ownership, security/
  provenance/capability/lease/crash behavior, and quality/test/receipt/path
  completeness. Each reviewer has zero edit, commit, merge, test-process,
  external-action or acceptance authority.
- Actual runtime capacity is four total slots: this Sol final conductor plus at
  most three bounded non-root agents. The three review lanes consume the pilot
  capacity. Their findings must be reconciled into one minimal repair-delta
  packet before a single bounded producer may continue in an authorized,
  writable repair worktree.

## G-006B-B2 checkpoint repair-delta reconciliation

- All three read-only lanes return `REPAIR`. Architecture accepts the private
  one-shot handoff, coordinator-owned connection/transaction, terminal burn,
  static live-binding cycle and absence of activation, but finds the two tests
  and two append-only receipt updates missing. Quality confirms the checkpoint
  contains only the two source paths and therefore has no executable B2 packet.
- Security identifies a concrete P1. `verifyCurrentPreparedForFinalization`
  calls the native broker's one-shot `settle` before the coordinator writer.
  The resulting `OpenSettledRead` handle uses `FILE_SHARE_READ`, so it prevents
  the coordinator's write-open. If execution reached the later boundary,
  `verifyFinalizedDatabase` calls `settle` again and the unchanged broker rejects
  it as `database already settled`. Execute/resume therefore cannot produce
  truthful B2 COMMITTED evidence from the checkpoint.
- Sol retains the corrected ownership design from control: G006B holds the
  original native no-replace lease and lock while the coordinator owns its own
  exact-path file lease, connection and `BEGIN IMMEDIATE` transaction. The
  quality lane's proposed transfer of a raw/native lease into the coordinator is
  rejected because the accepted boundary intentionally transfers only the
  opaque fieldless evidence handoff. The coordinator must continue reopening
  and independently pinning canonical/native identity.
- The smallest repair keeps both checkpoint source files. Pre-finalization
  verification uses native inspection under the still-held root lease and lock
  without consuming the broker's settled boundary. Final verification calls
  `settle` exactly once after coordinator commit, then reopens, checks sidecars,
  publishes B2 COMMITTED and supports exact replay/recovery. The publisher
  script remains byte-identical.
- The repair ceiling is exactly the existing six paths: the two source files,
  their two focused test files, and the two append-only receipts. Required
  evidence covers execute/resume/replay, prepared/final and artifact crash
  pairings, committed-unverified recovery, B1/B2 pins, copy/proxy/forgery/
  cross-file rejection, cycle/direct-bypass initialization, fixed seventeen-
  table preservation, `6000` to `6002`, validated `legacy_zip` derivation,
  exact scope and protected-publisher gates. No activation, startup, C0/C1/C2,
  PostgreSQL, persistent database or external action is authorized.

## G-006B-B2 repair producer continuation

- A writable continuation branch `codex/nova-g006b-finalization-resume` was
  created from integration control `d823324bfae7073885b6bdc7266647630ce8a3c8`
  at
  `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\g006b-finalization-resume`.
  Preserved WIP `1e778f4b650dfc97dc599735af8539c8ba26f528` was carried
  without content loss as `88f71cb`; the original branch and worktree remain
  intact. The continuation worktree started clean.
- Terra-medium producer `/root/g006b_b2_repair_producer` owns the exact
  six-path repair packet under `sqlite-schema` and `database-adapter` locks.
  It must keep the publisher, schema definition and all C0/C1/C2/startup/
  PostgreSQL surfaces byte-identical, produce one repair commit, and leave a
  clean worktree. It has no merge or acceptance authority.
- The worktree uses a conductor-created junction to the integration
  `node_modules`; no install or registry access is authorized. The junction is
  temporary, does not enter Git, and must be removed after all repair validation
  completes. Independent immutable architecture and security review follow the
  producer; Sol remains the sole final acceptance and merge authority.

## Linux cross-OS checkpoint after G-006B-B2

Date: 2026-07-31

Status: **Paused with G-006B-B2 accepted and merged; no later card is active.**

- Rejected source `5d246fa477fffd9abb8615862f76e8836c1b0f7a`
  remains preserved in history. Architecture, security, and Quality each
  rejected it because full retained policy payload and coordinator-transaction
  preservation binding were incomplete.
- Corrected source `e235d173ec1c5550f2d1f49d8b643daa0a38bf43`
  on `codex/nova-g006b-finalization-resume` passed independent architecture,
  security, and Quality review with no blocking finding. It remains a relevant
  provenance branch but is already included in integration.
- The source was merged non-fast-forward into
  `codex/nova-multitenant-integration` at
  `77f8d652100b0f2d52c32218c38dca50e83876e3`.
- The startup-disabled B2 API/artifact checkpoint is accepted. Parent G-006B,
  final G-006A activation, G-006C, and parent G-006 remain open. All 318 cards,
  Q-040, and T-029 remain preserved.
- Source validation passed on Windows: focused 3/3, complete two-file 111/111,
  TypeScript, focused ESLint, and diff checks. The merged focused matrix also
  passed 3/3. Full application tests, build, browser, PostgreSQL, Linux, remote,
  and production checks were not run for this proportional checkpoint.
- Runtime capacity remains four total agents: one Sol final conductor and at
  most three bounded non-root agents. Terra-medium remains the approved fallback
  implementer only; it cannot accept its own work. All three review agents are
  complete and active non-root agent count is zero.
- `sqlite-schema`, `database-adapter`, and `integration-ledger` are released for
  the pause. No card or resource lock is held. The next conductor must reacquire
  exact locks only after explicit resume and a fresh source-truth review.
- Thirteen registered worktrees were audited clean; none was removed. The
  repair worktree's conductor-created `node_modules` junction was removed after
  its exact link and target were verified. The real integration
  `node_modules` directory was not touched.
- Zero G006B test/helper processes remain. Three unrecorded synthetic roots
  (`g006b-b1-nNolsg`, `g006b-b1-RCR62L`, and `g006b-b1-YeaNOl`) remain
  untouched as Windows-only pre-Linux residuals; all three roots and descendants
  contain zero reparse points. The previously documented `g006b-b1-ZKgBDT`,
  `g006b-b1-Y18U0Y`, and `g006b-identity-cleanup-qjkSgV` residuals also remain
  untouched. These absolute paths are immutable Windows provenance and do not
  transfer through Git.
- No push, PR, deployment, remote migration, provider/paid call, production or
  customer-data access, outreach, account change, credential change, or
  destructive Git operation occurred.

The next permissible action is not G-006C2B. After an explicit user resume on
Linux, first verify the fresh clone and current integration tip, then perform a
read-only Sol reconciliation for finalized-only G-006C0/G-006C1 reminting and
G-006C2A consumption against the accepted B2 final contract. Implementation
requires a new bounded packet and fresh locks. Silence is not approval.

## Fedora/Supabase resume reconciliation

Date: 2026-07-31

- The user explicitly resumed local implementation on Fedora and confirmed
  Supabase/Postgres as the application database direction. Repository identity,
  branch, handoff tag, clean baseline, and pinned Node/npm versions matched.
- Sol reconciles the required finalized-only order as C0 final remint, C1 final
  remint, then C2A finalized-binding consumption before any C2B. The order is
  preserved but paused because its upgraded-path proof is the accepted Windows
  native lease contract; Fedora cannot replace that evidence.
- D-004 makes Postgres authoritative and explicitly prevents SQLite parity from
  blocking Postgres-only work. The next eligible preflight is therefore the
  Postgres-only child `G-007P`, preserving parent G-007 and its SQLite dependency.
- `G-007P` initially holds no migration lock. It is read-only over G-002 through
  G-005 migrations/tests and may request `migration-sequence` only after proving
  a missing tenant constraint or index and defining one exact SQL/test packet.
- The coordinator test classification changes one test path only: 12 portable
  cases run on Fedora and 26 native file-identity/finalization cases skip there
  while remaining active on Windows. Production SQLite source is unchanged.
- Active non-root agents remain zero. No G-006C2B, startup, persistent database,
  remote, provider, deployment, production, credential, or outreach action is
  authorized by this reconciliation.

## G-007P1 tenant-prefixed AI artifact index packet

- Read-only G-007P plan inspection proved one concrete Postgres defect: a
  tenant-filtered AI-artifact queue plan selected the inherited global status
  index. `migration-sequence` was then acquired for one exact migration.
- G-007P1 replaces only the four global `lead_ai_artifacts` hot-path indexes
  with tenant-prefixed lead/type, status, retry-ready, and requester indexes.
  Exact final replay returns without DDL; partial or spoofed baseline/final
  catalog raises `G007P1_INDEX_CATALOG_DRIFT`.
- Real disposable PostgreSQL 16 gates pass for G-002 2/2, G-003 2/2, G-004A
  1/1, G-005/G-007P1 1/1, and T-029 19/19. Static, recovery, and build gates
  pass. The initial synthetic plan failure and null-unsafe optional-regclass
  preflight failure are retained in the validation receipt.
- G-007P1 releases `migration-sequence` after final gates. Parent G-007 remains
  open. The next read-only child is G-007P2, auditing remaining global indexes
  on G-002 through G-005 tenant-owned tables before any further migration.
- The SQLite portion of G-007 remains dependent on paused G-006 finalized-
  binding work. G-006C2B remains unopened and no external action is authorized.

## G-007P2 tenant-prefixed AI verification index packet

- Parent-only read-only preflight audited the remaining G-002 through G-005
  tenant-owned-table indexes. Active non-root agents remained zero.
- PostgreSQL 16 plan evidence showed tenant-filtered AI-verification status and
  requester reads using global indexes and applying `tenant_id` as a filter;
  the tenant-plus-lead path was already correct.
- `migration-sequence` and `integration-ledger` were bounded to migration
  `202607310002_tenant_prefix_ai_verification_indexes.sql`, its focused G-004A
  test, migration-count expectations, and append-only acceptance documents.
- The packet retains the accepted tenant/lead index, removes three global
  secondary indexes, and adds tenant-prefixed status and requester indexes.
  Exact final replay succeeds; partial or spoofed catalogs fail closed.
- G-004A/G-007P2, G-002, G-003, G-005, T-029, TypeScript, focused ESLint,
  recovery, Fedora-portable coordinator, build, and diff gates pass.
- Both locks are released after the local acceptance commit. Parent G-007
  remains open; the next child is read-only G-007P3 preflight. G-006C2B remains
  unopened, and no remote or external action is authorized.

## G-007P3 tenant-prefixed lead AI queue index packet

- Three bounded read-only lanes audited the PostgreSQL catalog/query plans,
  downstream dependency readiness, and the existing acceptance harnesses. No
  lane edited the repository or held a lock.
- PostgreSQL 16.14 plan evidence over 80,000 representative two-tenant `leads`
  rows showed the tenant-scoped AI queue read selecting the inherited global
  queue index, scanning 8,000 candidates, and removing 4,000 wrong-tenant rows.
  The stale-running path likewise scanned 8,000 global candidates.
- A bounded tenant-first replacement reduced each index scan to the 4,000-row
  target tenant and removed the tenant post-filter. This proves one exact
  `leads` AI queue index-family defect; no other family is included.
- `migration-sequence` and `integration-ledger` are held for migration
  `202607310003_tenant_prefix_lead_ai_queue_indexes.sql`, the owning G-003
  PostgreSQL harness, all full-chain migration-count expectations, and the
  append-only acceptance records. One implementer may edit that exact packet;
  it has no acceptance or external-action authority.
- Required evidence is exact final replay, definition-aware missing/partial/
  spoof rejection before DDL, rollback without residue, tenant-bearing query
  plans, all applicable upstream PostgreSQL gates, static/recovery/portable
  coordinator/build checks, clean teardown, and independent Sol review.
- Parent G-007, the paused G-006 lane, and G-006C2B remain open. G-008, G-009,
  and G-004B remain dependency-blocked. No remote or external action is
  authorized.
- Independent architecture and quality review rejected the first implementation
  draft before acceptance. The plan regression used an empty forced plan, the
  required G-003 tenant unique constraint did not verify its backing-index
  health, and the supported runtime Postgres repair path would recreate global
  indexes removed by G-007P1, G-007P2, and G-007P3.
- Sol therefore acquires `database-adapter` and expands the same serialized
  repair packet only to `src/lib/db/queries.ts` and
  `src/lib/__tests__/db-ready-retry.test.ts`. The repair must preserve the exact
  accepted tenant-prefixed catalogs by removing the four legacy runtime index
  synthesis statements that collide with G-007P1/P2/P3; serialized migrations
  remain the sole owner of those families. It must also add representative
  two-tenant natural-plan evidence, bind the foundation constraint to a healthy
  unique backing index, and extend adversarial catalog coverage. No query API,
  SQLite behavior, dependency, or external-action change is authorized.
- The repaired packet passed fresh architecture and quality re-review. A final
  quality-only check found two bounded harness omissions; status-index runtime
  assertions and inherited environment restoration were repaired and rechecked
  PASS without production or migration changes.
- Root acceptance passed G-002 2/2, G-003/G-007P3 2/2 with natural 80,000-row
  two-tenant plans, G-004A 1/1, G-005 1/1, T-029 19/19 at 48/46/2, Q-002 1/1,
  TypeScript, focused ESLint, runtime-repair unit 2/2, recovery over 37 tables,
  Fedora coordinator 12 pass/26 Windows-native skip, production build 11/11,
  diff, JSONL, and cleanup checks.
- G-007P3 is accepted pending attributable local source and lineage commits.
  Parent G-007 remains open. The three held locks release only after the
  acceptance-lineage commit and final clean-resource check.
- Source commit `5a16a2602cb02e36b61e5c8dc2881902d80a7816` contains the
  validated packet. `migration-sequence`, `integration-ledger`, and
  `database-adapter` are released after the lineage commit. No task-owned
  container, process, database, worktree, or lock remains.
- The next permissible action is a new read-only G-007P4 real-EXPLAIN audit.
  Source preflight ranks the single `crawl_units` retry-ready family as the
  clearest independently bounded candidate; it is not yet a proven defect and
  holds no migration lock.

## G-007P4 crawl-unit retry-ready no-defect audit

- Read-only source, dependency, test, and PostgreSQL 16.14 lanes reconciled the
  exact future due-retry reset as tenant plus explicit nullable workspace plus
  globally unique run plus retry status/due time. No lock was held.
- The corrective real-plan fixture used 120,000 interleaved units across two
  tenants, exact-workspace and tenant-wide runs, due/future retries, pending,
  and terminal noise. Parent-inherited scope mismatches were zero.
- Natural baseline plans inspected only the exact run's 7,500 retry rows and
  filtered only 3,750 future rows. A 5,088 KiB hypothetical tenant/run retry
  index was never selected naturally and did not improve either workspace
  form. No wrong-tenant or wrong-workspace candidate was observed.
- G-007P4 closes with no defect, migration, lock, test-count change, runtime
  repair, or application edit. The hypothetical was dropped, all 12 baseline
  indexes were healthy, and all task resources were removed.
- Parent G-007 remains open. The next child must be another separately bounded
  read-only audit; no later Phase 2 write card is unlocked.
- Audit receipt commit `b44896a0a23293341d2d44df411337f8eca7b752`
  durably records the no-defect result. No G-007P4 lock or resource remains.

## G-007P5 lead enrichment-ready deferred-defect audit

- Read-only source, architecture, test, and PostgreSQL 16.14 lanes reconciled
  the exact future tenant-ready selector and tenant-guarded atomic lease.
  `leads.tenant_id` is required; `leads.workspace_id` is deliberately absent.
- On 100,000 interleaved leads, the global partial enrichment index considered
  25,000 candidates and removed 12,500 wrong-tenant plus 2,500 same-tenant
  exhausted rows. The tenant-query plan defect is proven.
- A 984 KiB ready-only candidate naturally reduced the scoped selector to 3
  buffers with tenant in `Index Cond` and zero filtering. However, a fresh
  standalone run proved that the same additive index captured the exact current
  unscoped compatibility query, scanned all 20,000 eligible cross-tenant rows,
  and sorted them at 2,231 buffers and 22.227 ms despite both globals remaining.
- No migration or lock is opened. Installing the index, removing the global
  indexes, or editing callers would cross the G-011/G-012/G-014/G-019/G-020
  compatibility cutover boundary. Recovery remains a separate G-007P6 audit.
- All hypothetical indexes, containers, ports, and processes were removed; 35
  of 35 baseline lead indexes are valid, ready, and live. Parent G-007 remains
  open and no later Phase 2 card is unlocked.
- Audit receipt commit `f2465e6c6e764f7c02712083e5b89e70f675d8be`
  durably records the deferred defect. No G-007P5 lock or resource remains.

## G-007P6 tenant enrichment recovery index packet

- Natural PostgreSQL 16.14 plans over 100,000 interleaved leads prove one
  bounded stale-running/due-retry defect: each global baseline considered
  35,000 status rows including 17,500 from the wrong tenant.
- The accepted candidate is additive and exact:
  `(tenant_id, enrichment_status, score DESC) WHERE enrichment_status IN
  ('running','retry_wait')`. It occupied 3,736 KiB in the audit fixture,
  eliminated wrong-tenant candidates, and did not capture the exact current
  unscoped recovery, ready-list, or ready-lease plans.
- Exhausted terminalization remains naturally sequential and is excluded;
  deferred G-007P5 pending-ready work is not reopened.
- Sol holds `migration-sequence` and `integration-ledger`. One implementer may
  edit migration `202607310004_tenant_enrichment_recovery_index.sql`, its
  owning G-003 harness, runtime-ownership assertion, and migration-count
  expectations only. Root owns acceptance documents and final review.
- PostgreSQL globals remain unchanged; no query, runtime repair source, SQLite,
  worker, route, fairness, provider, or external-action change is authorized.
- The first completed draft received architecture PASS and quality REPAIR for
  wildcard protected-family matching and missing live runtime preservation.
  Literal prefix matching, a wildcard-lookalike control, and an exact live
  before/after P6 catalog snapshot repair both findings. Final architecture and
  quality reviews pass.
- Root acceptance passes G-003/G-007P6 3/3, G-002 2/2, G-004A 1/1, G-005 1/1,
  T-029 19/19, Q-002 1/1, runtime ownership 2/2, TypeScript, focused ESLint,
  37-table recovery, Fedora coordinator 12 pass/26 Windows-native skip,
  production build 11/11 static pages, diff, JSONL, and resource cleanup.
- G-007P6 is accepted pending attributable local source and lineage commits.
  The two locks release only after the lineage commit and final clean-resource
  check. Parent G-007 and deferred G-007P5 remain open; P7 begins read-only.
- Source commit `672f14a99aa9224d307ebfe2e0bd25b11e884507` contains the
  validated packet. `migration-sequence` and `integration-ledger` release after
  this lineage commit. No P6 container, process, listener, database, worktree,
  or lock remains.

## G-007P7 tenant AI website-repair index packet

- A fresh PostgreSQL 16.14 audit over 100,000 interleaved leads proves the exact
  future tenant-scoped website-viability repair read filters 35,000 newer
  wrong-tenant rows through global `idx_leads_ai_status_checked`.
- The accepted 1,616 KiB hypothetical is exact and additive:
  `(tenant_id, ai_checked_at DESC)` with the current `site_found`, nonempty URL,
  and non-usable viability predicates. It reduces the scoped plan to 17 buffers
  with zero filtering while the exact current unscoped query remains on the
  retained global index at 18 buffers.
- Sol holds `migration-sequence` and `integration-ledger`. One implementer may
  edit migration `202607310005_tenant_ai_website_repair_index.sql`, the owning
  G-003 PostgreSQL harness, runtime-ownership assertion, and migration-count
  expectations only. Root owns acceptance documents and final review.
- No current query/caller, batch mutation, AI worker, provider, route, runtime
  repair source, SQLite, P3, P5/P6, consistency-repair, or score-recompute
  change is authorized. The global compatibility index remains exact.
- The sole implementation packet passed independent architecture and quality
  review without repair. Exact replay, rollback, drift/spoof rejection,
  literal-prefix protection, forward evolution, runtime ownership, nullable
  ordering, and limits 1/50/200 compatibility are covered.
- Root acceptance passes G-003/P6/P7 4/4, G-002 2/2, G-004A 1/1, G-005 1/1,
  T-029 19/19 at 50/48/2, isolated Q-002 1/1, focused runtime/AI 15/15,
  TypeScript, focused ESLint, 37-table recovery, Fedora coordinator 12
  pass/26 Windows-native skip, build 11/11, diff, JSONL, and cleanup.
- G-007P7 is accepted pending attributable local source and lineage commits.
  Both locks release only after the lineage commit and final invariant check.
  Parent G-007 and deferred G-007P5 remain open; P8 starts read-only with the
  dashboard `idx_leads_discovered_at` family and assumes no migration.
- Source commit `8eccf9108211c0a45878f50214bd6fff19fbec9d` contains the
  validated packet. `migration-sequence` and `integration-ledger` release with
  this lineage commit. No P7 container, process, listener, database, worktree,
  or lock remains.

## G-007P8 tenant dashboard discovered-today index packet

- A fresh PostgreSQL 16.14 audit over 200,000 physically interleaved leads
  proves the future tenant-scoped dashboard today count filters 10,000
  wrong-tenant rows through global `idx_leads_discovered_at`, reading 2,079
  buffers.
- The accepted additive hypothetical is `(tenant_id, discovered_at)`. It reads
  53 buffers with both keys in `Index Cond` and no residual filter. The exact
  current unscoped count remains on `idx_leads_discovered_at`, returns the same
  20,000 rows, and reads 80 buffers. Both dashboard globals remain installed.
- Sol holds `migration-sequence` and `integration-ledger`. One implementer may
  edit migration `202607310006_tenant_dashboard_discovered_at_index.sql`, the
  owning G-003 PostgreSQL harness, runtime-ownership assertion, and migration-
  count expectations only. Root owns acceptance documents and final review.
- No query/caller, UTC date boundary, archived/excluded semantics, workspace,
  runtime repair source, SQLite, active-statistics P9 family, permission,
  navigation, provider, or external behavior change is authorized.
- The sole implementation packet passed independent architecture and quality
  review without repair. Exact replay, rollback, catalog/foundation drift,
  literal-prefix protection, unrelated-family evolution, runtime ownership,
  boundary and archived/excluded inclusion, and current-query compatibility
  are covered.
- Root acceptance passes G-003/P6/P7/P8 5/5, G-002 2/2, isolated G-004A 1/1,
  G-005 1/1, T-029 19/19 at 51/49/2, isolated Q-002 1/1, focused
  runtime/actions 23/23, TypeScript, focused ESLint, 37-table recovery, Fedora
  coordinator 12 pass/26 Windows-native skip, build 11/11, diff, JSONL, and
  cleanup.
- G-007P8 is accepted pending attributable local source and lineage commits.
  Both locks release only after the lineage commit and final invariant check.
  Parent G-007 and deferred G-007P5 remain open; P9 starts read-only against
  the accepted P8 chain and assumes no migration.
- Source commit `defaffe73cad4b79c49d914e67b274dfbc35a942` contains the
  validated packet. `migration-sequence` and `integration-ledger` release with
  this lineage commit. No P8 container, process, listener, database, worktree,
  or lock remains.

## G-007P9 active statistics deferred-defect audit

- The accepted P8 chain still leaves material tenant ranged and all-time active
  count work. On 160,000 interleaved leads, tenant ranged read 7,061 buffers;
  tenant all-time read 8,791 and filtered 48,000 wrong-tenant rows.
- The exact active `(tenant_id,discovered_at)` partial candidate reduced those
  paths to 11 and 45 buffers with no residual filtering, but naturally captured
  both exact current unscoped query owners. Expression-full, structural, and
  tenant-only alternatives either regressed buffers or failed a required form.
- Independent architecture and quality review pass DEFER. No migration or lock
  opens. All candidates and services were removed; 38/38 baseline lead indexes
  are healthy and the repository remained clean.
- The obligation transfers explicitly to strict G-017/G-018 statistics/action
  cutover. Reconcile the ownership map's G-020 citation before functional work;
  strict G-020 is the fair worker dispatcher. Parent G-007 remains open.
- Receipt commit `95c2c7ab2cf726927ba43aef50ef9d816c558217` durably records
  the deferred defect. No P9 lock, container, listener, process, or worktree
  remains.

## G-007P10 score-recompute stale deferred-defect audit

- A fresh 51/49/2 PostgreSQL 16.14 audit over 180,000 interleaved leads proves
  severe wrong-tenant work in the ordered score-recompute selector.
- Only the covering archive-partial tenant index corrects limits through 100000
  and the tenant stale count. It also captures the current limit-100000 selector
  and both current count owners; smaller candidates are incomplete or capture.
- Independent architecture and quality reviews pass DEFER. No migration/lock
  opens; all candidates/resources were removed and 38/38 indexes are healthy.
- Transfer the obligation to G-009/G-011/G-012/G-014/G-019/G-020, with
  G-017/G-018 governing any ordinary dashboard projection. Parent G-007 stays
  open and current runtime/global ownership remains unchanged.
- Receipt commit `0883f9d0764ededcc6de8cf2ebd8023c4cbc6780` durably records
  the deferral. No P10 lock or resource remains.

## G-007P11 tenant-wide open admin-request list index packet

- Fresh PostgreSQL 16.14 plans over 144,000 interleaved requests prove every
  future tenant list baseline scans/sorts globally and considers 48,000 open
  wrong-tenant rows. A 4,800,512-byte tenant/open/CASE-order partial index
  removes wrong-tenant work and Sort for typed and untyped limits 6/50/100/200.
- Exact current unscoped typed/untyped lists and the adjacent fulfillment
  summary retain their original plans, resources, results, and ordering; the
  candidate is absent. The runtime-owned global remains unchanged.
- Migration `202607310007_tenant_open_admin_request_list_index.sql`, the owning
  G003 PostgreSQL harness, runtime non-ownership assertion, and six count
  consumers pass root validation. Fresh independent architecture and quality
  reviews pass after the required fixture and compatibility repairs.
- This packet is tenant-wide list DDL only. Workspace-scoped authority, summary
  correction, lead-local lookup, mutation, caller/session, G015/G016 ownership
  reconciliation, runtime repair, SQLite, UI, and workbench behavior are barred.
- Source commit `30eb1b086d7581143487d4997786ac55beed9661` contains the
  validated packet. `migration-sequence` and `integration-ledger` release with
  this lineage commit. No P11 container, process, listener, database, worktree,
  or lock remains. Parent G-007 stays open; the next action is lock-free,
  read-only G-007P12 actor-outreach index audit.

## G-007P12 tenant actor outreach-history index packet

- Fresh PostgreSQL 16.14 plans over 160,000 interleaved outreach events prove
  the future tenant/shared-actor list filters 48,000 wrong-tenant rows through
  global `idx_outreach_events_actor_created`, reading 3,678 buffers. One auth
  actor is deliberately active in both tenants; actor identity is not scope.
- The initial actor-nonnull partial candidate is
  `(tenant_id,actor_user_id,created_at DESC) WHERE actor_user_id IS NOT NULL`.
  It is 21.9% smaller than the equivalent full index, but root acceptance could
  not reproduce its natural selection on the representative interleaved heap.
- Current actor/global, lead-local, tenant-lead, joined activity, and
  tenant/workspace-wide paths retain their existing owners. A separate
  workspace index is rejected as disproportionate and is outside this packet.
- With tenant correlation about 0.507, PostgreSQL keeps the global at estimated
  LIMIT cost 29.58 versus candidate-only 35.10 and actually filters 48,000 rows.
  The candidate wins only on a perfectly tenant-batched heap at correlation 1.0;
  that physical-order dependency is rejected as overfit.
- Independent architecture and quality reviews pass DEFER. Receipt commit
  `7fe3eb2e62dbdfec8f65128571de5331e85c7e16` records the result. No migration
  or test/source change remains; `migration-sequence` and `integration-ledger`
  release with this lineage commit. Transfer the
  obligation to strict G015/G017 cutover; parent G-007 remains open. P13 is the
  next lock-free read-only audit and assumes no migration. Counts remain
  52/50/2 and sequence `202607310008` remains unused/available. No P12
  container, listener, database, process, worktree, or lock remains.

## G-007P13 lead-note author-history deferred-defect audit

- A fresh 52/50/2 PostgreSQL 16.14 audit over 160,000 interleaved notes proves
  a shared author can cause the global LIMIT 100 path to filter 48,000
  wrong-tenant rows at 2,719 buffers. Author identity is not tenant scope.
- The 9,469,952-byte full tenant/author/time candidate improves counts/ranges
  but is not naturally selected for LIMIT 25/100. The 7,110,656-byte active-note
  partial also misses those limits and captures a current unscoped count owner.
  `author_user_id` is already NOT NULL; no nonnull partial is legitimate.
- Independent architecture and quality reviews pass DEFER. No migration,
  source/test/count change, or lock opened. Both candidates/resources were
  removed and all four baseline note indexes are healthy.
- Transfer the unresolved family to strict G015/G017 cutover, with G018 scope
  propagation. Parent G-007 stays open. Counts remain 52/50/2 and sequence 008
  stays free. P14 creator-history is the next lock-free read-only audit.
- The attributable local receipt is
  `ab18b8e2b103775886cc467a36ff0364eedb6daf`. No P13 resource, process,
  worktree, or lock remains.

## G-007P14 admin-request creator-history deferred-defect audit

- A fresh 52/50/2 PostgreSQL 16.14 audit over 160,000 interleaved requests
  proves tenant/shared-creator LIMIT 100 filters 44,000 wrong-tenant rows
  through the global creator index at 3,257 buffers. Creator identity is not
  tenant authority; 12,000 null creators per tenant exercise real FK SET NULL.
- Full and creator-nonnull tenant/creator/time candidates improve standalone
  counts from 5,636 to 318 buffers and bounded ranges to 11 buffers. Neither is
  naturally selected for LIMIT 25/100, workspace LIMIT 100, or the joined
  creator-history form, so neither repairs the coherent workflow.
- Independent architecture and quality reviews pass DEFER/no migration. P11,
  current creator, team-lead, null-creator, lead-local, tenant-lead, and PK
  owners remain intact. Both candidates were removed and all eight baseline
  admin-request indexes are healthy.
- Transfer the unresolved family to strict G015/G017 cutover, with G018 scope
  propagation. Parent G-007 stays open. Counts remain 52/50/2, sequence 008 is
  free, and P15 assigned-admin history is the next lock-free read-only audit.
- The attributable local receipt is
  `d4fad818b301d25934bddf760c641dd6cf47ec8e`. No P14 container, listener,
  database, process, worktree, or lock remains.

## G-007P15 admin-request assignee-history deferred-defect audit

- A fresh 52/50/2 PostgreSQL 16.14 audit over 160,000 interleaved requests
  proves future tenant/shared-assignee LIMIT 25/100/200 paths each filter
  44,000 wrong-tenant rows through the global assignee index. Real FK SET NULL
  produced 16,000 null-assignee rows per tenant.
- The 9,175,040-byte full candidate improves shared/null counts and null paths,
  but leaves nonnull bounded/workspace history global. The 7,585,792-byte
  nonnull partial has the same core failure and cannot serve null semantics.
  No current SELECT supplies an exact assignee-history caller contract.
- Independent architecture and quality reviews pass DEFER/no migration. P11,
  creator, summary, lead-local, tenant-lead, PK, activity, results, and the
  global cleanup/FK owner remain intact. Both candidates/resources were removed
  and all eight baseline admin-request indexes are healthy.
- Transfer the unresolved family to strict G015/G017 cutover, with G018 scope
  propagation. Parent G-007 stays open. Counts remain 52/50/2 and sequence 008
  stays free. P16 public-slug classification is next, followed by P17 demos
  lead-index audit. The withdrawn audit-log proposal was outside G002-G005.
- The attributable local receipt is
  `6f3279dbd6af85ce05df731f6a3071216a2c72f9`. No P15 container, listener,
  database, process, worktree, or lock remains.

## G-007P16 deliberate public demo-slug classification

- A fresh 52/50/2 PostgreSQL 16.14 audit over 100,008 demos confirms public
  resolution accepts one globally unique slug and has no tenant input. Natural
  lookup uses unique `demos_slug_key` at 4 demo/5 total buffers.
- The 8,249,344-byte `idx_demos_public_slug` remains deliberately global. Its
  nonselection is not a tenant defect; tenant-prefixing cannot serve the anon
  route, and removal would be a separate cleanup decision.
- RLS, base-table revokes, exact SECURITY DEFINER owner/search-path/ACL,
  bounded projection, private-key stripping, lifecycle negatives, result
  digests, and cross-tenant duplicate rejection pass. Independent architecture
  and quality reviews pass RETAIN/no migration.
- Catalog is unchanged, resources are removed, counts remain 52/50/2, and
  sequence 008 stays free. P17 demos lead-index audit is next but not terminal;
  later G004 and G002/G005 retained families require explicit classification.
- The attributable local receipt is
  `dfac6a1b5716e2bfab716a54c4ba2fbf8e01dac5`. No P16 container, listener,
  database, process, worktree, or lock remains.

## G-007P17 demo lead-index no-defect audit

- A fresh 52/50/2 PostgreSQL 16.14 audit covers 100,000 interleaved demos over
  a realistic mostly-one history distribution with a sixteen-row churn tail.
  The global lead index remains the current lead-only compatibility owner.
- Future tenant+lead reads naturally use exact `idx_demos_tenant_lead` with
  both keys, 3–19 buffers, and zero tenant filtering. Counts and composite
  cascade use the same index; bounded histories sort at most sixteen rows in
  26 KiB. No three-key hypothetical or migration is justified.
- Independent architecture and quality reviews pass RETAIN/no defect. Catalog,
  digests, half-open/workspace/join controls, cascade rollback, cleanup, and
  clean/diff checks pass. Sequence 008 stays free.
- Retain the global for current compatibility until G015/G018 cutover. Re-audit
  if callers add unbounded history or real churn grows materially. P18 is next.
  The 62-name crosswalk has 28 mapped/queued and 34 unclassified; G005 has no
  residual global secondary index, so P17 is not terminal.
- The attributable local receipt is
  `ff44228dc0205943f5b427db15d769b3fcdc4bc8`. No P17 container, listener,
  database, process, worktree, or lock remains.

## G-007P18 AI-feedback reference-index no-defect audit

- A fresh 52/50/2 PostgreSQL 16.14 audit covers 160,000 physically
  interleaved feedback rows across two tenants. The verification and artifact
  globals are scope-neutral lookup aids for the exact composite SET NULL FKs;
  globally unique parent IDs make a tenant prefix non-selective.
- Valid hot 20,000-row paths use the existing indexes with zero filtering.
  Real verification/artifact deletes null exactly their own 20,000 references,
  preserve the other reference, and roll back to the exact row digest.
- Executable guessed wrong-tenant probes filter 20,000 rows, but a matching
  cross-tenant relationship is invalid and no current/approved caller owns the
  query. Cross-tenant insert/update controls reject without residue.
- Independent architecture and quality reviews pass RETAIN/no defect. No DDL
  ran; final exact catalog reread and cleanup pass. Counts stay 52/50/2,
  sequence 008 remains free, and P19 AI-usage references are next.
- The attributable local receipt is
  `3f624aac0ef7aa43672942aa0a4d3c4ba1d9c392`. No P18 container, listener,
  database, process, worktree, or lock remains.

## G-007P19 stop and G-004A-R1 serialized repair

- P19's required combined-cascade control reproduced an accepted-G-004A
  defect on a fresh 52/50/2 PostgreSQL 16.14 chain. Deleting a lead whose usage
  event holds both lead and verification references fails atomically with
  `G004A_VERIFICATION_PARENT_REQUIRED`. The exact six-row graph and tenant-B
  sentinel are unchanged after rollback.
- P19 stopped before index disposition. The defect is in the order-dependent
  scope guard, not an index plan. G-004A-R1 is the next dependency repair and
  must be a forward-only migration; open G-004B remains separate.
- Sol exclusively holds `postgres-migration-sequence:202607310008`,
  `ai-scope-guard`, `ai-tenant-scope-postgres-test`, and the serialized durable
  documentation surfaces. Three agents may perform read-only design/review;
  at most one implementer may write after reconciliation.
- The initial ceiling is one new migration, the existing G-004A PostgreSQL
  test, proven migration-count expectations, and one repair receipt. No
  runtime-repair, SQLite, G-004B, provider, hosted, or external surface is in
  scope. P19 resumes only after independent repair acceptance and cleanup.
- The attributable local discovery receipt is
  `50a96cd13feb3a852e526c59815b3d3e7bd2d71a`. No P19 container, listener,
  database, process, candidate, or worktree remains; the repair locks above
  remain held by Sol.

## G-004A-R1 accepted and G-007P19 resumed

- G-004A-R1 is independently accepted on PostgreSQL 16.14. Exact install and
  replay, both foreign-key orders, full-row preservation, direct and nested
  spoof rejection, rollback, catalog/RLS/ACL guards, and hostile ten-lock
  serialization pass. The implementer matrix passed 1/1 in 128.31 seconds and
  Sol's independent matrix passed 1/1 in 128.07 seconds; security/catalog and
  quality reviewers report no remaining P0/P1/P2 findings.
- The authoritative migration inventory is 53 discovered / 51 applied / 2
  runtime-only skipped. Sequence `202607310008` is consumed and
  `202607310009` is available.
- With the local lineage commit, Sol releases
  `postgres-migration-sequence:202607310008`, `ai-scope-guard`,
  `ai-tenant-scope-postgres-test`, and the G-004A-R1 exclusive durable-document
  reservation. No repair implementer lock, container, listener, process,
  database, temporary worktree, or candidate remains.
- G-007P19 resumes read-only against a fresh 53/51/2 chain and still has no
  index disposition. G-004B remains open and separate. The paused native
  Windows/NTFS G-006 lane and unopened G-006C2B boundary are unchanged.
- Source and validation receipt commit
  `e6e72b213e840af7365fd08bd26ed4e493f97386` is accepted. The repair locks and
  durable-document reservation are released by this lineage commit.
- The prior lineage expansion of short hash `e6e72b2` named nonexistent object
  `e6e72b2cb04189ef1b445e74ad57e5204685f316`. The corrected object above is the
  parent of lineage commit `69e6f9a6e51c4807f7c7542ad91921db19b6786e`;
  the append-only ledger retains a superseding correction event.

## G-007P19 accepted RETAIN and residual queue made exact

- P19 independently passes RETAIN/no tenant-query-plan defect/no migration for
  `idx_ai_usage_events_lead_id` and
  `idx_ai_usage_events_verification_id`. Fresh PostgreSQL 16.14 natural plans,
  combined and isolated parent actions, exact rollback/data/catalog/constraint
  digests, composite-FK ownership, G-004A-R1 behavior, and cleanup pass with no
  P0/P1/P2 finding.
- No migration or source/test/count edit is authorized. Counts stay 53/51/2,
  sequence `202607310009` remains free, and no G-007 write lock is held.
- The exact residual appendix records 62 names: G-002 13, G-003 39, G-004A 10,
  and G-005 zero. The reconstructed partition is 28 mapped/queued and 34
  unclassified. P18 and P19 classify names already inside the 28.
- The next exact dependency-safe family is an unnumbered read-only audit of
  `idx_ai_usage_actor_created`, `idx_ai_usage_created`, and
  `idx_ai_usage_model_created`. Opening and numbering that packet belongs to
  Sol's next durable transition; this receipt does not invent P20.
- The invalid auth-missing crosswalk bootstrap was destroyed; the corrected
  fresh 53/51/2 replay is authoritative. No P19 container, database, listener,
  process, candidate, worktree, or lock remains. G-004B and the paused native
  Windows/NTFS G-006 boundary remain unchanged.
- P19 receipt and exact crosswalk commit
  `4adc7bd09c84d8890b1950221b78255b0af38564` is accepted; its documentation
  reservation releases with this lineage commit.

## G-007P20 read-only AI-usage query-history audit

- G-007P20 is opened after clean P19 lineage at
  `75259319ca8927ebf4faed05d3f95f9a796c7f20`. Exact targets are
  `idx_ai_usage_actor_created`, `idx_ai_usage_created`, and
  `idx_ai_usage_model_created`.
- The packet is read-only: live PostgreSQL 16 catalog/query/EXPLAIN evidence,
  source ownership, and independent acceptance review may run concurrently.
  No migration or write lock is opened and no hypothetical is assumed.
- Counts remain 53/51/2 and `202607310009` remains free. Any defect must be
  proven on a real current or durably approved tenant query before one coherent
  write packet can be proposed. Current compatibility and named platform-global
  owners must remain explicit.

## G-007P20 defect proven; actor write packet pending

- Fresh PostgreSQL 16.14 evidence over 300,000 interleaved rows proves the exact
  lower-bound-only researcher-cap form with tenant added filters 31,796 rows
  through tenant-created. The fixed two-source partial three-key candidate
  eliminates residual filtering, preserves exact results, and improves
  9.752 ms to 4.623 ms naturally.
- P20 closes read-only as DEFECT PROVEN / migration deferred. Retain global
  actor for current compatibility, retain global/tenant created-time owners,
  and retain/defer model because no drop basis or approved query owner exists.
- No migration lock is held yet. Counts stay 53/51/2 and sequence
  `202607310009` stays free until Sol opens the researcher-cap write packet.
  DDL must pin the exact two-source predicate, preserve current and generic
  alternate-source owners, and reject catalog/source-ownership spoofing.
- Independent architecture and quality reviews pass with no remaining
  P0/P1/P2 finding. Candidate rollback, exact digests, residue, repository, and
  disposable-resource cleanup pass. Parent G-007 remains open.
- P20 audit receipt commit `ef6d4154d86cbe0e71aac56a55484424db32d77d`
  is accepted; its documentation reservation releases with this lineage
  commit. The bounded researcher-cap write packet remains unnumbered and holds
  no lock until Sol opens it separately.

## G-007P20A tenant researcher-cap index packet opened

- Sol opens G-007P20A after clean P20 lineage at
  `a6b6e504e7af3a8347788ea427e4d00b2896f535`. It is the one bounded,
  additive PostgreSQL packet proven by P20; it does not complete the generic
  G-014 actor-query cutover or G-021 budget authorization.
- Sol exclusively holds `postgres-migration-sequence:202607310009`,
  `ai-tenant-scope-postgres-test`, `migration-count-expectations`, and the
  G-007P20A durable-document reservation. One implementer may edit only the
  reserved migration, focused PostgreSQL test, and five migration-count tests;
  Sol retains ledger, registry, handoff, crosswalk, integration, and acceptance.
- The migration must add the exact tenant/actor/created partial btree for the
  two production researcher sources, be replay-safe and definition-aware, and
  reject missing, partial, or spoofed foundation/final catalog states before
  DDL. Current global actor, alternate-source, created-time, model, nullable
  history, RLS/ACL, and G-004A/R1 behavior must remain intact.
- Acceptance requires fresh PostgreSQL 16 replay/upgrade/final replay,
  adversarial catalog guards, rollback with zero partial installation, natural
  exact-caller index use and identical results, upstream PostgreSQL gates,
  TypeScript, focused ESLint, recovery verification, Fedora-portable
  coordinator/release gates, build, diff/JSONL checks, and exact cleanup.

## G-007P20A accepted; serialized resources released

- Sol accepts source commit `5076979cdef1c43f2ed404cd10c511f727ec642f`
  after exact-diff inspection and independent architecture/quality review with
  no P0/P1/P2 finding. The packet adds only guarded migration 009, its focused
  PostgreSQL harness, five count updates, and the validation receipt.
- Root fresh PostgreSQL 16 reruns pass G-004A/P20A 2/2, G-002 2/2, G-003 6/6,
  G-005 1/1, and T-029 19/19 at 54/52/2. Root static/caller/recovery,
  Fedora-portable coordinator, build, diff, and JSONL gates pass. Current
  unscoped/global and generic alternate-source owners remain; G-014 and G-021
  are not completed.
- Sequence `202607310009` is consumed and `202607310010` is next available.
  Sol releases `postgres-migration-sequence:202607310009`,
  `ai-tenant-scope-postgres-test`, `migration-count-expectations`, and the
  G-007P20A durable-document reservation. No task container, listener, process,
  worktree, or lock remains.
- The next read-only residual audit remains unnumbered. Its first coherent
  current-visibility family is `idx_crawl_runs_status_created` plus
  `idx_crawl_runs_created_desc`; no migration is assumed. Parent G-007,
  G-004B, the native Windows G-006 lane, and G-006C2B remain open/paused as
  previously recorded.
- P20A acceptance commit `c8c3dba2ce980f2bfcbf7e0f6d71e1bf6a7d83d2`
  is final locally; this lineage commit records the release. No P21 card or
  replacement objective is opened.

## G-007P21 read-only crawl-run visibility audit

- After clean P20A lineage at `7cc9c516334815d333fd97c4085986384819dd00`,
  Sol opens G-007P21 for exactly `idx_crawl_runs_status_created` and
  `idx_crawl_runs_created_desc`. The pair supports current newest-running,
  newest-paused, newest-run, and bounded discovery-history compatibility reads;
  measured natural ownership is resolved by the audit receipt below.
- The packet is read-only: source ownership, live PostgreSQL 16 catalog,
  interleaved two-tenant fixture, natural EXPLAIN/BUFFERS, ordered-result
  digests, and independent review may run concurrently. Current queries are
  global compatibility paths, not public/platform authority.
- Counts remain 54/52/2 and `202607310010` remains free. No migration, sequence,
  test, or durable-document write lock is held. Tenant/workspace controls may
  measure the accepted foundation but must not invent workspace visibility or
  G-013/G-020 dispatch contracts.
- Stop before DDL unless one exact current or durably approved tenant query
  proves a material plan defect. `idx_crawl_runs_blocked_created` and the real
  `idx_crawl_runs_market_created` remain later, separate, unnumbered families.

## G-007P21 accepted without migration

- Fresh PostgreSQL 16.14 replay passes at 54/52/2. On 280,000 interleaved
  two-tenant rows, `idx_crawl_runs_created_desc` naturally serves all four exact
  global caller shapes; the status-leading index has zero measured scans and is
  retained as logical compatibility support, not claimed natural ownership.
- Six transactional tenant/workspace candidates produce no material plan gain.
  PostgreSQL selects only a workspace-paused candidate, duplicating the exact
  accepted G-002 plan at four buffers. All 11 result digests match and every
  candidate rolls back with zero residue.
- G-009/G-013 has not fixed tenant/workspace/null-workspace visibility or query
  ordering, so synthetic controls cannot authorize DDL. Counts stay 54/52/2,
  sequence `202607310010` remains free, and no migration/test lock is acquired.
- Independent source/dependency and test/acceptance reviews agree with retain/no
  defect. Root current compatibility tests pass 16/16. All disposable resources
  are removed. The receipt reservation is held only through its local commit;
  blocked-created and market-created remain separate unopened families.
- Receipt commit `47ce318a0acf7fd40b41798ee8154915da29bc04` is final locally.
  The durable-document reservation is released; no G-007P22 or replacement
  objective is opened by this lineage update.

## G-007P22 blocked-run partial-index classification opened

- After clean P21 lineage at `19f004bbb26f8c8ff4745083622274849cd2cf2f`,
  Sol opens G-007P22 for exactly
  `idx_crawl_runs_blocked_created(status, blocked_at DESC, created_at DESC)
  WHERE status='blocked'`.
- This packet is read-only and source-first. It traces every caller, migration
  origin, test owner, and G-013/G-020 dependency. No exact current query orders
  blocked rows by `blocked_at`; current block/resume/cancel operations use the
  primary key and display uses P21 created-time history.
- Stop before a disposable database, candidate, DDL, sequence reservation, or
  migration unless an exact current or durably approved blocked-time query is
  found. Counts stay 54/52/2 and sequence `202607310010` remains free.
- `idx_crawl_runs_market_created` remains a separate unopened family. No
  migration, test, or durable-document write lock is held after this opening
  commit.

## G-007P22 accepted as source-only retain/defer

- Exact source tracing finds no `ORDER BY blocked_at` or matching current
  reader. Block/resume/cancel/retry are run-ID scoped; blocked metadata is shown
  through the P21 created-time history path. Root behavior tests pass 67/67 but
  do not assert blocked-time ordering or index use.
- The index remains in the unchanged historical migration from commit
  `59f8bf0bf75abd2a34a7ea2d171ee81d54320988`; runtime PostgreSQL repair and
  SQLite do not recreate it. No reader proves use, but source alone also cannot
  prove a forward drop safe across upgraded/compatibility catalogs.
- G-013 has no exact blocked-run query contract. G-020 fair dispatch is not a
  blocked-time owner. Nullable `blocked_at`, implicit descending null order,
  and no stable tie-break forbid inferred “latest blocked” semantics.
- Retain/defer requires no PostgreSQL, migration, count update, or lock. Counts
  remain 54/52/2, sequence `202607310010` stays free, and the crosswalk becomes
  31 classified/31 unclassified. Market-created remains separate and unopened.
- Receipt commit `2922e32d434ee9f23efb4148da791551a7c3d4ec` is final locally.
  The documentation reservation is released; this lineage update opens no P23
  card or other write surface.

## G-007P23 market-created index classification opened

- After clean P22 lineage at `b2d929188020685676e64de0354c9e25bdeb56e3`,
  Sol opens G-007P23 for exactly
  `idx_crawl_runs_market_created(market_id, created_at DESC)`.
- The packet is read-only and source-first. It must distinguish the accepted
  scope-neutral child-side maintenance candidate for
  `crawl_runs_market_id_fkey` from unimplemented tenant-safe market/run history.
  A platform market reference never authorizes a tenant-owned run.
- Stop before PostgreSQL, EXPLAIN, candidates, DDL, or removal. No exact current
  or approved G-010/G-013 market-history predicate fixes tenant/workspace/null-
  workspace visibility, ordering, limit, or tie semantics.
- Counts remain 54/52/2 and sequence `202607310010` remains free. No migration,
  test, or durable-document write lock is held after this opening commit.

## G-007P23 accepted as source-only retain/defer

- Exact source review finds no market-filtered crawl-run history reader. Current
  reads use run IDs or global status/created-time visibility and only project a
  platform market label. No direct index or RI-plan test exists.
- The separately created btree's leading `market_id` is structurally suitable
  as scope-neutral child-side support for accepted
  `crawl_runs_market_id_fkey` UPDATE/DELETE RESTRICT checks. It is not
  constraint-owned; live selection, health, necessity, and performance remain
  unmeasured.
- Platform market references never grant tenant run authority. G-010/G-013 has
  not defined exact tenant/workspace/null-workspace market-history semantics,
  so no synthetic plan, tenant-prefix, replacement, DDL, or removal is allowed.
- Historical PostgreSQL replay and accepted SQLite schema retain the index.
  Counts remain 54/52/2, sequence 010 stays free, and the crosswalk becomes
  32 classified/30 unclassified. No later card unlocks.
- Receipt commit `e9ac62457d874d8f3fa5d9aa4f4354d90acec593` is final locally.
  The documentation reservation is released and no next residual card is
  opened by this lineage update.

## G-007P24 budget-pages aggregate index audit opened

- After clean P23 lineage at `0158101797063d2fa420658371d4c5489a2bf0e2`,
  Sol opens G-007P24 for exactly
  `idx_crawl_units_budget_pages(crawl_run_id, status, pages_fetched,
  max_pages)` and the three-mode current remaining-search-call aggregate.
- The packet is read-only PostgreSQL 16 catalog, realistic interleaved fixture,
  natural EXPLAIN/BUFFERS, scalar-result digest, and transactional target-drop
  comparison. P4 run, run-status, retry-ready, and tenant-run-status indexes are
  controls, not reopened families.
- Current run-ID-only behavior is compatibility/performance evidence, not tenant
  authorization. Tenant/workspace controls measure future G-013 form without
  inventing it; G-021 is not a current query owner.
- Stop before candidate DDL, sequence reservation, migration, test edits, or
  removal unless a material exact current or durably approved tenant-plan defect
  is proven. Counts remain 54/52/2 and sequence `202607310010` stays free.

## G-007P24 accepted; retain exact aggregate owner

- Fresh PostgreSQL 16.14 replay passes 54/52/2. On 120,000 interleaved units,
  every exact mode naturally uses the target through an index-only scan with
  zero heap fetches, 5-20 buffers, and correct scalar results.
- Transactional target removal preserves the 24-result scalar digest but
  regresses to P4 run-status bitmap/heap plans with 2,503-2,750 buffers. Explicit
  rollback restores the exact target definition, result digest, and plan.
- Tenant/workspace controls are G-013 measurements only and authorize no
  candidate. G-021 is not a current owner; P4 control dispositions are unchanged.
  No defect, migration, test edit, or removal packet is opened.
- Root behavior tests pass 60/60. Counts remain 54/52/2, sequence 010 stays
  free, and the crosswalk becomes 33 classified/29 unclassified. All disposable
  resources are removed. Receipt commit
  `290c7aee65d16397c896f91eb044e2687fa456b0` releases the reservation; no next
  residual family is opened by this lineage update.

## G-007P25 cell-status index audit opened

- After clean P24 lineage at `7843412d850379b3515763502198ecfb809d9e29`,
  Sol opens G-007P25 for exactly
  `idx_crawl_units_cell_status(location_cell_id, status, category)` and the
  current cell-coverage/ledger query family.
- The packet is a read-only PostgreSQL 16 catalog audit with realistic
  interleaved tenant/run/cell/category/status fixtures, natural
  EXPLAIN/BUFFERS, canonical result digests, and a transactional target-drop
  comparison. Run-scoped P4 indexes and the market-status sibling are controls,
  not reopened or combined families.
- Platform cell identity never supplies tenant authority. Exact run-ID forms
  are compatibility/performance evidence; tenant/workspace and null-workspace
  controls measure future G-010/G-013 contracts without inventing them.
  Generalized units with null cells are excluded from cell-owned shapes.
- The target is not constraint-owned and does not cover the full accepted
  `(market_id, location_cell_id)` child key. Stop before candidate DDL, sequence
  reservation, migration, test edits, or removal unless a material exact current
  or durably approved tenant-plan defect is proven. Counts remain 54/52/2,
  crosswalk 33/29, and sequence `202607310010` stays free.

## G-007P25 accepted; retain exact cell-status owner

- Fresh PostgreSQL 16.14 replay passes 54/52/2. The accepted 120,000-row
  interleaved fixture includes 96,000 cell units and 24,000 generalized null-cell
  units; every constructed cell spans both tenants and all statuses/categories,
  with zero scope mismatch.
- Four current/current-derived shapes and one bounded market control naturally
  use the exact target. Transactional removal preserves canonical result SHA
  `a6e5cdd6c8d52e4d59067c624ce3c99cf882ed813a633979679815568b6b2521`
  but falls back to sequential or P4 run-status-only work. Explicit rollback
  restores the definition, catalog, results, and all five plan fingerprints.
- Platform cells remain non-authorizing. Tenant/workspace controls are future
  G-010/G-013 measurements; the target neither owns nor fully covers the
  market/cell FK. No defect, candidate, migration, test edit, or removal opens.
- Root behavior and proportional gates pass, including fresh G-002 2/2 and
  T-029 19/19. Counts remain 54/52/2, sequence 010 stays free, and the
  crosswalk becomes 34/28. All task resources are removed; the receipt
  commit is `381ff0a45fcf03677fdb90dbfd06984287b5bff8`. The reservation is released,
  and this lineage update opens no next residual family.

## G-007P26 market-status source classification opened

- After clean P25 lineage at `f3e403aea62b7ff90f10465f5a982c264493b87a`,
  Sol opens G-007P26 for exactly
  `idx_crawl_units_market_status(market_id, status, category)`.
- The packet is read-only source/provenance/query/caller/test/authority and
  structural-RI classification. Current market coverage joins units by cell,
  not `crawl_units.market_id`; the geography backfill writes market identity but
  is not an exact target-index reader.
- Platform markets never supply tenant authority. G-010/G-013 have not fixed an
  exact tenant/workspace market-unit predicate, and G-021 is not a current owner.
  The target may be a scope-neutral child-side support candidate for the
  single-column market FK, but it is not constraint-owned and does not cover the
  full market/cell child key.
- No live catalog, plan, health, use, performance, necessity, duplicate, or safe
  removal claim is authorized. Stop before PostgreSQL, candidate DDL, sequence
  reservation, migration, test edits, replacement, or removal absent an exact
  approved query or separately authorized RI workload. Counts remain 54/52/2,
  crosswalk 34/28, and sequence `202607310010` stays free.

## G-007P26 accepted; retain/defer market-status compatibility

- Source and caller tracing finds no exact current market-led crawl-unit reader.
  Current coverage joins units by cell; the geography backfill is a writer, not
  target-index ownership evidence.
- The leading market key is structurally suitable only as an unmeasured,
  scope-neutral child-side candidate for the single-column market FK. The target
  is not constraint-owned and does not cover the compound market/cell key.
- PostgreSQL and current/frozen SQLite compatibility are retained. Platform
  markets never authorize tenant units; exact tenant/workspace market-unit query
  semantics wait for G-010/G-013, and G-021 is not a current owner.
- No PostgreSQL service or live catalog/plan claim was used. No defect,
  candidate, migration, test edit, replacement, or removal packet is opened.
  Counts remain 54/52/2, sequence 010 stays free, and the crosswalk becomes
  35/27. Receipt commit `18e6e7a92bde686ea7e45850e030710a75b68074`
  releases the reservation; this lineage update opens no next residual family.

## G-007P27 user-market-access compatibility family opened

- After clean P26 lineage at `3bf6c4502f0bd2584ee727fd5687f93208a55def`,
  Sol opens G-007P27 for exactly the coherent pair
  `idx_user_market_access_user(user_id, market_id)` and
  `idx_user_market_access_market(market_id, user_id)`.
- The packet is read-only source/provenance/query/caller/test/identity/lifecycle,
  authority, and structural-RI classification. User-leading compatibility
  readers exist, but source alone does not prove exact natural plan ownership.
  No current runtime application market-leading reader is known.
- G-002 replaced the legacy global PostgreSQL identity with tenant/workspace
  null-safe uniqueness. Current/frozen SQLite lifecycle distinctions and the
  paused G-006C2B writer boundary remain explicit. Neither user nor platform
  market supplies tenant authority.
- The market-leading target is only an unmeasured PostgreSQL market-FK cascade
  support candidate; SQLite has different FK action semantics. Stop before
  PostgreSQL, live claims, candidate DDL, migration, test edits, identity rewrite,
  replacement, or removal. Counts remain 54/52/2, crosswalk 35/27, and sequence
  `202607310010` stays free.

## G-007P27 accepted; retain/defer user-market-access pair

- The user-leading target supports current compatibility-query shapes, but
  source cannot prove natural plan ownership. It is not the final PostgreSQL or
  frozen SQLite tenant/workspace identity, uniqueness, or authorization owner.
- The market-leading target has no current runtime application market-led
  reader. It remains an unmeasured, non-constraint-owned PostgreSQL CASCADE
  support candidate and only a SQLite NO ACTION enforcement-lookup candidate;
  engines are not equivalent.
- Legacy/current/prepared/frozen identity lifecycles remain distinct.
  G-006C2B stays unopened, and G-009/G-010/G-011/G-016/G-018 retain their
  future scoped contracts. No writer safety or SQLite activation is inferred.
- No PostgreSQL service or live catalog/plan claim was used. No defect,
  candidate, migration, test edit, identity rewrite, replacement, or removal
  packet opens. Counts remain 54/52/2, sequence 010 stays free, and the
  crosswalk becomes 37/25. Receipt commit
  `0636a4ff3aee28c5c965ac239567523d3c8ced67` releases the reservation; this
  lineage update opens no next residual family.

## G-007P28 status-ZIP crawl-unit audit reservation

Date: 2026-08-01

- After clean G-007P27 lineage at
  `db8f3940fbb8255e39cd775ffc314573c43498d4`, Sol reserves the serialized
  G-007 durable-document surfaces for one read-only PostgreSQL 16 audit of
  `idx_crawl_units_status_zip(status, zip)` only. It is the sole remaining
  unclassified G-002 residual.
- The packet measures the complete current lease reset-and-selection flow,
  failed-error and failed-count shapes, and exact ZIP/county/state/geography
  controls against the target, accepted P4 siblings, and accepted P24 budget
  index. A fresh full-chain fixture must independently cross two tenants, named
  and null workspaces, all three location modes, runs, statuses, and categories.
  Legacy-ZIP rows use only their exact active ZIP reference; platform-cell and
  generalized rows each include colliding and noncolliding compatibility-token
  controls.
- Natural `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, canonical results, exact
  installed/drop/rollback digests and plan fingerprints, and a transactional
  target-only drop with explicit rollback are required. Lease identity is
  deterministic; failed-error ordering guarantees nondecreasing ZIP only, so
  ties and unordered aggregates are canonicalized before comparison.
- ZIP is a compatibility location token across `legacy_zip`, `platform_cell`,
  and `generalized` modes, never tenant or workspace authority. Persisted
  `location_mode` governs location shape; an active non-ZIP cell is required
  for platform-cell rows but never grants tenant authority. G-010/G-013/
  G-017 are measurement boundaries only. No defect, candidate, migration, test
  edit, replacement, or removal is assumed. Stop before any write packet unless
  the audit proves a material exact current or durably approved tenant-query
  plan defect. Counts remain 54/52/2, crosswalk 37/25 (G-002 12/1), and
  sequence `202607310010` stays free.

## G-007P28 accepted; retain/defer status-ZIP compatibility

Date: 2026-08-01

- Sol accepts the combined authoritative r3k audit and exact-geography
  supplement. PostgreSQL 16.14 replayed 54/52/2 migrations on independently
  crossed 124,416-row fixtures. Exact failed-error, complete reset/lease,
  all-time/bounded statistics, and full geography queries do not use the target;
  only mode-filtered status-ZIP and structural controls do.
- Platform-cell and generalized compatibility tokens contaminate current ZIP
  joins. That is separate G-010/G-013 query-semantics debt and a G-017 validation
  boundary, not tenant/workspace authority or a G-007 index defect. No candidate,
  migration, test edit, replacement, necessity, or removal packet opens.
- Independent test/evidence and architecture/authority review report no
  remaining P0/P1/P2 finding. The crosswalk becomes 38/24 and G-002 13/0;
  counts remain 54/52/2 and sequence 010 stays free. All disposable resources
  are gone. The durable-document reservation remains only through the
  attributable local receipt commit. Receipt commit
  `9a01e888a5d90c4133e182c5998f723de1ffc6e4` releases the reservation; this
  lineage update opens no next residual family.

## G-007P29 archived-active lead-index audit reservation

Date: 2026-08-01

- After clean G-007P28 lineage at
  `552e123f49a9ad7aed3fc58731df9594f8c4a503`, Sol reserves the serialized
  G-007 durable-document surfaces for one read-only PostgreSQL 16 audit of
  `idx_leads_archived_active(archived_at, updated_at DESC)` only. It is the
  first remaining unclassified G-003 residual.
- The packet measures the exact current stale-quality recompute reader under
  the accepted G-007P10 timestamp and LIMIT contract. SQLite's exact predicate
  is `archived_at IS NULL AND (last_quality_scored_at IS NULL OR
  julianday(updated_at) > julianday(last_quality_scored_at)) ORDER BY
  updated_at DESC LIMIT ?`; PostgreSQL must use the faithful analog
  `(updated_at)::timestamptz > (last_quality_scored_at)::timestamptz`.
  Limits 1, 100, 500, and 100000 must each cover unique boundaries and
  canonicalized complete tie groups. Active/archived list or aggregate shapes
  remain controls against the target and retained stale-score, score,
  workbench, discovered-time, exclusion, and quality siblings. A fresh
  full-chain fixture must independently cross two tenants, active/archived
  state, stale/fresh score state, exclusion, timestamps, and stable ordering
  ties. Leads are tenant-wide and have no workspace scope.
- Natural JSON EXPLAIN, canonical results, target-only transactional drop, and
  exact rollback restoration are required. No defect, tenant-prefixed candidate,
  migration, test edit, replacement, or removal is assumed. Counts remain
  54/52/2, crosswalk 38/24 (G-003 15/24), and sequence
  `202607310010` stays free.

## G-007P29 accepted; retain/defer archived-active compatibility

Date: 2026-08-01

- PostgreSQL 16.14 replayed the exact 54/52/2 chain on 153,600 independently
  crossed two-tenant leads. The target was healthy and non-constraint-owned;
  installed/drop/rollback held 38/37/38 indexes and 10 invariant constraints.
  All 15 canonical results and structural plan fingerprints were exact across
  phases, while target removal changed no natural plan or buffer count.
- Current operational limits use `idx_leads_score_recompute_stale`; the complete
  limit-100000 form uses sequential scan and sort. Tenant analog inefficiency is
  accepted G-007P10 evidence, not a P29 target defect. The deferred cutover set
  remains G-009/G-011/G-012/G-014/G-019/G-020 plus G-017/G-018 projections.
- Sol accepts RETAIN/DEFER for the healthy historical PostgreSQL catalog
  definition and the frozen SQLite compatibility definition only; no fresh
  SQLite validation is claimed. No
  exact primary owner, necessity, candidate, migration, replacement, removal,
  or test edit is accepted. Independent reviews report no P0/P1/P2. Counts stay
  54/52/2, crosswalk becomes 39/23 (G-003 16/23), and sequence 010 stays free.
  The serialized durable-document reservation remains until the attributable
  local receipt commit; parent G-007 remains open. Receipt commit
  `9f55ca6c1c8469b975fe5a0ffe9091787e2b5707` releases the reservation; this
  lineage update opens no next residual family.

## G-007P30 assigned-lead index audit reservation

Date: 2026-08-01

- After clean G-007P29 lineage at
  `48872851107561d36d8d02857369260c50e556e1`, Sol reserves the serialized
  G-007 durable-document surfaces for one read-only PostgreSQL 16 audit of
  `idx_leads_assigned_to_user(assigned_to_user_id, updated_at DESC)` only.
- Exact current assigned/unassigned generic lists and counts, workbench queues,
  team joins/aggregates, local assignee cleanup, and FK `SET NULL` are measured.
  Current sources do not order assigned rows by `updated_at`; that suffix is a
  structural control only. The fixture crosses two tenants and reuses one active
  identity across both, plus tenant-local and null assignees, so actor identity
  never becomes tenant or workspace authority. Leads have no workspace scope.
- Binding reads cover `getLeads` page sizes 1/25/100/200 plus nonzero OFFSET,
  Kanban 100, map 600/1000, export 50000/100000, and `getNowQueue` output 25
  with candidate bound 500 and exact source order. Lists require unique
  boundaries or wholly included canonical tie cohorts. Team/workbench aggregates
  are canonicalized. Assigned/updated structural controls are separately labeled.
- PostgreSQL assignment is nullable UUID; empty-string UUID input is a rejected
  portability control, not fixture data. SQLite's empty-string compatibility
  branch cannot establish PostgreSQL behavior. No remote Auth deletion is
  authorized. Retained and unclassified sibling indexes remain installed and
  are labeled accurately.
- Natural JSON EXPLAIN, canonical results, target-only transactional drop, and
  exact rollback restoration are required. Mutations use rollback-only phases
  or identical clean clones. Suspended/other-tenant and empty UUID assignments
  reject unchanged; PK-led assign/claim are target-neutral controls. Exact local
  cleanup and rollback-only local `auth.users` deletion exercise nulling without
  remote Auth. No defect, tenant-prefixed candidate, migration,
  test edit, replacement, or removal is assumed. Counts remain 54/52/2,
  crosswalk 39/23 (G-003 16/23), and sequence `202607310010` stays free.

## G-007P30 accepted; retain/defer assigned-lead compatibility

Date: 2026-08-01

- Fresh PostgreSQL 16.14 replayed the 54/52/2 chain over 368,640 physically
  interleaved two-tenant leads. The target and exact SET NULL FK were healthy;
  installed/drop/rollback held 38/37/38 lead indexes and 10 invariant
  constraints. All 33 canonical results were exact across phases and all 33
  installed plan fingerprints were restored after rollback. Drop-phase plans
  are not asserted equal.
- Ordinary assigned/unassigned lists, maps, Kanban, NowQueue, workbench, team,
  and query-function export-control shapes did not select the target; the live
  CSV route supplies no assignment filter. Three assigned-plus-
  updated structural controls selected it but have no current reader. The exact
  local lead cleanup changed 61,440 assignments and selected the target;
  post-`VACUUM FULL` drop comparison showed no material buffer or runtime
  advantage. The rollback-only local Auth deletion proved SET NULL outcome but
  exposed only `users_pkey`; nested RI target support remains unproven.
- Sol accepts RETAIN/DEFER for the healthy historical PostgreSQL catalog and
  frozen SQLite compatibility definition. Assignee is a selector, never tenant
  or workspace authority; leads have no workspace. No tenant defect, candidate,
  DDL, migration, replacement, test edit, removal, remote Auth, or fresh SQLite
  claim is accepted. Independent reviews report no P0/P1/P2.
- Counts stay 54/52/2, crosswalk becomes 40/22 (G-003 17/22; G-002 13/0),
  sequence 010 stays free, and parent G-007 remains open. The serialized durable
  reservation remains held until the attributable local receipt commit.
- The primary export-helper rows were nonbinding complete sets at 30,720 rows.
  A separate fresh PostgreSQL 16.14 54/52/2 replay seeded 100,005 assigned and
  100,005 SQL-NULL eligible leads across two tenants. Exact 50,000/50,001 and
  100,000/100,001 boundaries had unique scores; all four full-row and ordered
  digests were exact installed/drop/rollback. Natural plans stayed on
  `idx_leads_enrichment_lease` with the target absent, and catalog restoration
  was exact at 38/37/38 indexes and 10 constraints. This closes the helper LIMIT
  contract only; the live CSV route passes no assignment filter. Retain/defer,
  no-DDL/no-removal, authority, counts, and reservation state are unchanged.
- Receipt commit `e3e2c9759f2e8f53cc8299d746237a928fb9674f` records the
  accepted classification and supplement, releases the serialized durable-
  document reservation, and opens no next residual family.

## G-007P31 business-type score-index audit reservation

Date: 2026-08-01

- After clean G-007P30 lineage at
  `77f7816cb77bbbbfee713e874f6d56a11006c25f`, Sol reserves the serialized
  G-007 durable-document surfaces for one read-only PostgreSQL 16 audit of
  `idx_leads_business_type_score(business_type, score DESC)` only.
- Exact business-type equality plus score order is live by default for the leads
  table at 25, Kanban at 100, and CSV export at 50000/100000. Explore list 60
  and its always-fast map route at 200/600 are live score-order shapes only when
  `sortBy=score`; their defaults use opportunity order. Exact page-two offsets
  are 25 and 60. GetLeads 1/100/200, normal-map 200/600, and normal-map 1000 are
  helper/source controls only. Quality, AI, competitor, business-count, and
  statistics shapes are separately labelled prefix/filter or aggregate controls.
- The fresh two-tenant fixture has no workspace dimension and must make exact
  export limits binding with at least 100,001 active/nonexcluded rows for one
  literal shared business type. Literal `local_services`, SQL NULL, empty text,
  and other canonical types remain distinct. Equality filters exclude NULL,
  while count/statistics readers may coalesce it to `local_services`; that is
  query-semantic debt, never index DDL authority. Tenant-prefixed analogs are
  measurement-only and business type/score never become tenant authority.
  At least 1,001 shared-type rows must also have non-NULL coordinates, physically
  score-interleaved across both tenants, with exact map ranks 200/201, 600/601,
  and 1000/1001. Exact offset boundaries are required at 25 and 60.
- Catalog preflight requires exactly one healthy ordinary btree with
  business-type ASC NULLS LAST using `text_ops` and the resolved column
  collation, then score DESC NULLS FIRST using `float8_ops`; two key/total
  attributes; no INCLUDE, predicate, expression, uniqueness, constraint owner,
  alternate duplicate, spoof, or drift. Name-only `IF NOT EXISTS` replay is not
  definition proof. Any mismatch stops before EXPLAIN and is not repaired.
- Natural JSON EXPLAIN, canonical full results, exact kth/k+1 or wholly included
  tie boundaries, target-only transactional drop, and exact rollback restoration
  are required. Full result digests must be exact installed/drop/rollback;
  structures and catalogs must be exact installed/restored, with drop reported
  honestly. Raw telemetry is noncausal and target selection alone is not
  necessity. No defect, tenant-prefixed candidate, migration, test edit,
  replacement, or removal is assumed. Counts remain 54/52/2, crosswalk 40/22
  (G-003 17/22), and sequence `202607310010` stays free.

## G-007P31 accepted; retain measured local-services plan owner

Date: 2026-08-01

- Sol accepts RETAIN for the exact healthy historical PostgreSQL
  `idx_leads_business_type_score(business_type, score DESC)` definition and its
  frozen SQLite compatibility definition. The target is the sole exact healthy
  semantic candidate. Ordinary shared-plumbing admin Leads/Kanban/Explore/map/
  CSV and researcher Leads/Explore/map shapes use accepted sibling indexes, but
  the independently reproduced measured reachable canonical `local_services`
  equality-plus-score query-function shape at limit 100 naturally selects this
  target and materially regresses in buffers and filtered rows when it is
  transactionally absent. Researcher Kanban/export remain source negatives.
- Fresh PostgreSQL 16.14 replayed 54/52/2 migrations over 160,010 physically
  interleaved two-tenant leads. The corrected 21-shape live/session matrix and
  broader 31-shape family matrix had exact installed/drop/restored results and
  exact installed/restored structures. Catalogs restored at 38 indexes and 10
  constraints. Twelve isolated spoof states rejected before workload.
- Root independently reproduced the classification on a separately generated
  100,019-row fresh PostgreSQL 16.14 fixture: 18 representative shapes were
  exact I/D/R, catalog and structures restored exactly, healthy replay was a
  semantic no-op, and a reversed-key same-name spoof failed preflight before
  workload.
- Business type, score, assignment, and market visibility remain selectors,
  never tenant or workspace authority. Future tenant-filtered analogs are
  measurement-only until G-011/G-017. No target-attributable tenant index defect
  was proven; generic tenant-plan debt remains deferred. NULL/empty/COALESCE
  semantic debt cannot authorize index DDL. No candidate, migration,
  replacement, test edit,
  removal, or fresh SQLite/Windows acceptance opens.
- Root gates pass: proportional behavior 42/42, TypeScript, focused ESLint,
  recovery over 37 tables, Fedora-portable coordinator 12 passed/26 Windows-
  native skipped, build 11/11 pages, fresh PostgreSQL G-002 2/2, G-003 6/6,
  and T-029 19/19. All containers, ports, scripts, processes, temporary
  artifacts, and extra worktrees are gone.
- Counts remain 54/52/2, sequence `202607310010` stays free, crosswalk becomes
  41/21 (G-003 18/21; G-002 13/0), original-plan arithmetic remains 58/318
  accepted and 260 remaining, and parent G-007 remains open. The serialized
  durable-document reservation is released by the attributable local receipt
  commit; no P32 reservation is opened by this receipt.
- Receipt commit `8c724ff7ef74f6a3f1a4b42015c5bea98bfadeb5` records the
  accepted P31 classification locally and releases the durable-document
  reservation.

## G-007P32 component-score index audit reservation

Date: 2026-08-01

- Sol opens a read-only audit of the exact remaining G-003 family
  `idx_leads_component_scores(raw_opportunity_score DESC,
  verification_score DESC)` from
  `202605130002_ai_verified_quality_pipeline.sql`. The baseline is
  `436506064a411eaa443493b4292ce433c7469cbc`.
- Sol exclusively holds the serialized registry, ledger, handoff, and
  crosswalk surfaces. Three independent agents own non-writing catalog/real
  EXPLAIN, source/authority, and test/acceptance lanes. No agent may edit the
  repository or accept its own work.
- Current dynamic readers can independently request raw-opportunity or
  verification score ordering through shared lead query functions; the AI
  queue places sales-priority ahead of raw opportunity and is only a sibling
  control. Exact route reachability, permissions, bindings, limits, and
  target ownership must be proven rather than inferred from the allowlist.
- The accepted inventory is 54/52/2 and the crosswalk is 41/21 (G-003 18/21,
  G-002 13/0). Conditional acceptance would make it 42/20 (G-003 19/20);
  sequence `202607310010` remains free and no migration is assumed.
- Stop before candidate DDL, migration, test edits, replacement, or removal
  unless a material exact current or durably approved tenant-query defect is
  proven with fresh PostgreSQL 16 catalog and real EXPLAIN evidence. Component
  scores remain selectors, never tenant or workspace authority.

## G-007P32 accepted; retain historical target and defer tenant analogue

Date: 2026-08-01

- Sol accepts RETAIN for the exact healthy historical PostgreSQL
  `idx_leads_component_scores(raw_opportunity_score DESC,
  verification_score DESC)` definition and frozen SQLite compatibility
  definition. Independently reproduced current raw-opportunity ASC/DESC
  readers naturally select the target; target-only drop preserves results but
  materially increases buffer work and requires scan/sort.
- Verification-only, default opportunity/map, AI queue, backfill, candidate,
  and repair shapes are target-neutral controls. No current query uses the
  exact two-column order, but the leading raw key has a current direct route
  owner. The target is retained, not ambiguous or removal-eligible.
- Future tenant-prefixed component-score forms remain measurements only until
  G-009/G-011 and their exact downstream owner authorize real signatures.
  Component scores never grant tenant/workspace authority. No candidate,
  migration, replacement, removal, or test edit opens; sequence
  `202607310010` stays free.
- Fresh PostgreSQL 16.14 evidence used 160,000 and independently generated
  100,019-row two-tenant fixtures. Faraday had 16 exact I/D/R results and exact
  I/R structures. Root retry 3 had 18 exact canonical result sets and ordered
  score sequences I/D/R, exact I/R structures, 38/37/38 catalog restoration,
  unchanged 10-constraint
  catalog, statement replay no-op, and reversed-key spoof rejection. Earlier
  root attempts are excluded and recorded truthfully.
- All P32 containers, databases, ports, scripts, processes, and temporary
  artifacts are removed. Counts remain 54/52/2; crosswalk becomes 42/20
  (G-003 19/20, G-002 13/0); original-card arithmetic remains 58/318 accepted
  and 260 remaining; parent G-007 stays open. Independent architecture and
  test/evidence reviews report no P0/P1/P2. Root gates pass: behavior 63/63,
  TypeScript, ESLint, recovery, coordinator, build, G-002 2/2, G-003 6/6,
  G-004A 2/2, G-005 1/1, and T-029 19/19. The reservation remains held only
  until the attributable local receipt commit.
- Acceptance commit `ca2a4cf3f0ea93474121c1541f769086311d6291` records the
  reviewed P32 classification. Its lineage-only successor releases the P32
  durable-document reservation; it does not open or number the country/admin
  residual.

## G-007P33 country/admin index audit reservation

Date: 2026-08-01

- Sol opens a read-only audit of exact G-003 residual
  `idx_leads_country_admin(country_code, admin_area1, locality)` from
  `20260602193000_international_markets_and_territories.sql` at clean baseline
  `3dcbe7f6cfdbae0e2c3543a336180f6bdc411046`.
- Sol exclusively holds registry, ledger, handoff, crosswalk, integration, and
  acceptance writes. Three agents own disjoint read-only catalog/EXPLAIN,
  source/authority, and test/evidence lanes; no producer may self-accept.
- The accepted inventory is 54/52/2 and crosswalk 42/20 (G-003 19/20,
  G-002 13/0). Conditional classification would make it 43/19 and G-003
  20/19. Sequence `202607310010` remains free; no migration is assumed.
- Fresh evidence must distinguish leading-country ownership from unused
  trailing admin/locality keys, skew/selectivity effects, NULL/empty/case
  semantics, and future tenant-prefixed measurement. Geography selectors never
  grant tenant/workspace authority.
- Stop before candidate DDL, migration, replacement, removal, or test edits
  unless an exact current or durably approved tenant-query defect is proven.
