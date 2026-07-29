# Nova Trade Concurrent Multi-Conductor Execution Plan

## Document control

- **Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
- **Date:** 2026-07-29
- **Primary product source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
- **Primary implementation source:** `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`
- **Canonical execution ledger:** `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan-implementation-ledger.jsonl`
- **Purpose:** Transfer execution from one shared conductor/worktree into a safely concurrent hierarchy of conductor threads and isolated worktrees.
- **Scope:** Planning and operating contract only. This document does not create threads, branches, worktrees, commits, migrations, provider calls, outreach, deployments, or external changes.

## Executive decision

Nova Trade will use one final integration conductor and five bounded domain conductors. Each conductor receives a dedicated thread, branch, and worktree. Domain conductors may supervise multiple workers, but they cannot merge into the integration branch or declare program-level acceptance.

The final integration conductor is the single authority for:

- source-of-truth interpretation;
- dependency readiness;
- cross-domain architecture;
- shared-file ownership;
- migration ordering;
- review of domain-conductor DoneClaims;
- integration and merge decisions;
- consolidated validation;
- ledger acceptance events;
- final completion or blocked status.

The final integration conductor must run on **`gpt-5.6-sol` with `extra-high` reasoning** for every source-truth, integration, security, migration, acceptance, and completion decision. It may not downgrade itself to a worker model for final judgment.

## Outcomes

This plan is successful when:

1. Every conductor has a separate thread, branch, and worktree.
2. The existing dirty workspace is reconciled into one known integration baseline without discarding work.
3. Each task card has one owner and one declared write set.
4. Shared surfaces are protected by explicit locks.
5. Domain conductors can supervise workers and request repair without involving the user for routine implementation issues.
6. Every accepted domain batch returns to the final conductor for independent review and integration.
7. Only the final conductor merges into the integration branch.
8. The existing append-only implementation ledger remains the durable execution truth.
9. No production, paid, remote, outreach, destructive, account, or credential action occurs without separate explicit authority.
10. Concurrency increases without weakening tenant isolation, evidence, compatibility, validation, or human-review requirements.

## Non-goals

This plan does not:

- replace the PRD or 318-card implementation plan;
- authorize implementation by itself;
- authorize commits, branches, worktrees, pushes, pull requests, or remote mutation;
- allow autonomous outreach or provider execution;
- allow peer conductors to merge independently;
- allow multiple workers to edit the same shared file concurrently;
- permit a domain conductor to redefine product policy;
- accept worker output solely because tests pass or a DoneClaim was returned;
- require all conductors to be active when dependencies do not support useful work.

## Source-of-truth hierarchy

When sources conflict, use this order:

1. Explicit current user decision.
2. Product requirements document.
3. Accepted decision records under `docs/decisions`, `docs/architecture`, and `docs/product`.
4. The implementation plan task card and dependency graph.
5. Accepted implementation-ledger events.
6. Current repository implementation and test contracts.
7. Domain-conductor or worker recommendations.

The final conductor resolves conflicts. A domain conductor records the conflict and pauses only the dependent tasks. It must continue other dependency-ready work.

## Operating topology

```text
Final Integration Conductor: gpt-5.6-sol, extra-high
|
+-- Platform, Tenancy, and Security Conductor
|   +-- 3 to 5 implementation workers
|
+-- Knowledge, Evidence, and Strategy Conductor
|   +-- 3 to 5 implementation workers
|
+-- Discovery, Accounts, and Decisioning Conductor
|   +-- 3 to 5 implementation workers
|
+-- Product Workflow and UI Conductor
|   +-- 3 to 5 implementation workers
|
+-- Quality, Compatibility, and Release Conductor
    +-- 2 to 4 verification workers
```

The recommended initial limit is 12 active workers. Increase to 16 only after the pilot wave completes without ownership conflicts, ledger drift, or integration rework. The hard maximum is 20 active workers across all domain conductors.

## Thread and worktree registry

| Role | Thread title | Branch | Preferred worktree |
|---|---|---|---|
| Final conductor | `Nova Trade - Final Integration Conductor` | `codex/nova-multitenant-integration` | Current authoritative repository worktree after baseline stabilization |
| Platform conductor | `Nova Trade - Platform Tenancy Security` | `codex/nova-platform-tenancy` | `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\platform-tenancy` |
| Knowledge conductor | `Nova Trade - Knowledge Evidence Strategy` | `codex/nova-knowledge-strategy` | `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\knowledge-strategy` |
| Discovery conductor | `Nova Trade - Discovery Accounts Decisioning` | `codex/nova-discovery-decisioning` | `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\discovery-decisioning` |
| Product conductor | `Nova Trade - Product Workflow UI` | `codex/nova-product-workflow` | `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\product-workflow` |
| Quality conductor | `Nova Trade - Quality Compatibility Release` | `codex/nova-quality-release` | `C:\Users\Masih\OneDrive\Documents\Nova Trade\.worktrees\quality-release` |

If Codex can authorize a non-OneDrive workspace root, prefer `C:\Users\Masih\Documents\NovaTradeWorktrees` for worktrees to reduce sync churn and file-lock risk. Do not move the authoritative repository or create these directories without activation authority.

## Model policy

### Final integration conductor

- Model: `gpt-5.6-sol`.
- Reasoning: `extra-high`.
- Required for all final integration, source-truth conflict, security, migration, and acceptance decisions.
- May implement a repair directly after two failed bounded worker attempts or when a cross-domain integration fix is too coupled to delegate safely.
- Must independently inspect evidence before accepting any domain batch.

### Domain conductors

- Preferred: `gpt-5.6-luna` with `high` reasoning.
- May use `gpt-5.6-luna` with `medium` reasoning only when high-capacity is unavailable and the domain task is not a final security, migration, or acceptance decision.
- Must review every worker result before sending it to the final conductor.
- Cannot issue final program acceptance.

### Workers

- First choice when capacity exists: `gpt-5.3-codex-spark` with the highest available reasoning.
- Fallback: `gpt-5.6-luna` with `high` reasoning.
- Last approved fallback: `gpt-5.6-luna` with `medium` reasoning for bounded, low-risk tasks.
- Runtime-contingent fallback approved by the user on 2026-07-29: `gpt-5.6-terra` with `medium` reasoning when Spark and Luna are unavailable. Terra receives one bounded card with an exact, already accepted write set and contract. It may execute an accepted migration packet under its named locks, but it may not change migration sequencing, source-of-truth, tenant/security policy, task scope, dependencies, acceptance requirements, or the execution model.
- Terra cannot perform domain or final acceptance. A separate reviewer must inspect its result, and `gpt-5.6-sol` remains the sole final integration and acceptance authority.
- No other model family or Terra reasoning level is authorized by this plan without another explicit amendment.
- One worker receives exactly one primary task card.
- A worker may not alter its task, dependencies, policy, or write set without conductor approval.

### Verifiers

- Verifiers must not be the same worker that produced the change.
- A domain conductor may use a separate approved worker for focused adversarial review.
- The final conductor remains the mandatory independent verifier for merge acceptance.
- Failed or unavailable verifier capacity does not convert missing evidence into a pass.

## Conductor authority matrix

| Action | Domain conductor | Final conductor | Separate user approval |
|---|---:|---:|---:|
| Dispatch dependency-ready worker task | Yes | Yes | No |
| Request worker repair | Yes | Yes | No |
| Edit inside assigned domain worktree | Yes | Yes | Existing local-edit authority required |
| Run focused local tests | Yes | Yes | Existing local-test authority required |
| Use disposable local services | Within assigned limits | Yes | Existing disposable-service authority required |
| Commit to domain branch | Only after activation authorization | Yes | Required before activation |
| Merge domain branch into integration branch | No | Yes | Required before activation |
| Change shared contract ownership | Request only | Yes | No unless product policy changes |
| Resolve product-policy ambiguity | No | Recommend or escalate | User decision when source truth does not resolve it |
| Apply staging or production migration | No | No by default | Always required |
| Push, open PR, or deploy | No by default | No by default | Always required unless separately granted |
| Use paid provider or external data source | No | No by default | Always required |
| Send outreach or external communication | Never | Never by default | Explicit action-specific approval required |
| Mark task accepted in canonical ledger | No | Yes | No |
| Mark phase or program complete | No | Yes | No, subject to evidence gates |

## Domain ownership

### Platform, Tenancy, and Security Conductor

Primary task families:

- `T-*`
- `G-001` through `G-010` where schema, tenancy, ownership, RLS, worker scope, or compatibility boundaries dominate
- security and lifecycle portions of `Q-*`

Primary surfaces:

- `src/lib/tenancy/**`
- tenant-scoped database contracts
- authentication/session integration
- permissions and authorization
- RLS and restricted runtime role
- migrations assigned by the final conductor
- tenant audit, support access, export, deletion, retention, and recovery

Serialized surfaces:

- `supabase/migrations/**`
- `src/lib/auth.ts`
- `src/lib/permissions.ts`
- `src/lib/db/schema.ts`
- shared tenant session types

### Knowledge, Evidence, and Strategy Conductor

Primary task families:

- `I-*`
- `A-*`
- `P-*`

Primary surfaces:

- document ingestion contracts
- storage adapter boundaries
- extraction, chunks, tables, evidence, claims, and reviews
- agent runs, tools, citations, and replay fixtures
- adaptive questions and business-understanding versions
- ICP and lead-play versions

This conductor cannot activate production storage, scanning, OCR, or model-provider use without the relevant authority receipt.

### Discovery, Accounts, and Decisioning Conductor

Primary task families:

- remaining `G-*` query and worker generalization tasks
- `C-*`
- `B-*`

Primary surfaces:

- connector registry and source observations
- existing Google Places compatibility adapter
- discovery plans and source runs
- account identity and entity resolution
- contacts and buying centers
- qualification, scoring, evidence factors, and review queues

This conductor cannot add or activate unapproved sources, people-data vendors, scraping, or paid provider calls.

### Product Workflow and UI Conductor

Primary task families:

- `O-*`
- `UI-*`

Primary surfaces:

- cited outreach drafts and human approval
- suppressions, copy/export, outcomes, and learning proposals
- onboarding and tenant-aware shell
- document, understanding, ICP, play, discovery, account, contact, review, and reporting workflows
- responsive and accessible UI behavior

No send transport, autonomous approval, mailbox connection, or social automation may be introduced.

### Quality, Compatibility, and Release Conductor

Primary task families:

- `Q-*`
- cross-phase acceptance receipts
- compatibility and parity fixtures

Primary surfaces:

- static, unit, contract, integration, database, worker, E2E, and operational evidence
- legacy website-lead compatibility
- accessibility, performance, reliability, recovery, and cost gates
- disposable migration and rollback rehearsals
- release-readiness documentation

This conductor is read-only against other domain worktrees unless the final conductor assigns a bounded repair task.

## Exclusive shared-surface locks

The final conductor owns the lock registry. Only one active task may hold each lock.

| Lock | Protected surface | Maximum holders |
|---|---|---:|
| `migration-sequence` | `supabase/migrations/**` and migration numbering | 1 |
| `sqlite-schema` | `src/lib/db/schema.ts` and upgrade mechanics | 1 |
| `auth-session` | authentication and active tenant/session types | 1 |
| `permissions` | central permission matrix and role aliases | 1 |
| `database-adapter` | shared database adapter and transaction contracts | 1 |
| `package-config` | dependencies, package scripts, TypeScript, Vitest, Playwright, Next configuration | 1 |
| `protected-shell` | root protected layout and shared navigation | 1 |
| `recovery-contract` | export/import/recovery schema and scripts | 1 |
| `full-release-gate` | full test, build, and broad browser execution | 1 |
| `integration-ledger` | canonical acceptance and authority events | final conductor only |

A lock request includes task ID, files, expected duration, dependency baseline, and release evidence. A lock expires when the task is accepted, rejected, blocked, or returned for rework outside the shared surface.

## Baseline stabilization before concurrency

The existing ledger records substantial accepted work plus a dirty worktree. Concurrent execution must not begin from an ambiguous baseline.

The final conductor performs this sequence:

1. Read the current implementation ledger to the final valid JSONL event.
2. Inventory tracked modifications, untracked files, migrations, generated artifacts, and temporary files.
3. Map every implementation-owned file to an accepted task, active task, rework task, or unowned change.
4. Preserve user-owned and unrelated changes without modification.
5. Reconcile active tasks whose workers no longer exist.
6. Confirm that no temporary server, browser, database container, or background worker remains from abandoned validation.
7. Produce a baseline receipt with repository path, branch, revision, dirty-state manifest, accepted tasks, active tasks, blockers, and authority.
8. Obtain explicit authority for local branch creation, local commits, worktrees, and local merges.
9. Create the integration branch only after the baseline receipt is accepted.
10. Make one local baseline commit containing only reviewed implementation-owned files if authorized.
11. Create all domain branches and worktrees from that exact baseline commit.
12. Append `concurrency_baseline_accepted` to the canonical ledger.

If local commits are not authorized, multi-worktree implementation remains blocked because uncommitted dependencies cannot be safely distributed. Read-only planning and review threads may still be created, but implementation stays in the final conductor's worktree.

## Current transition anchor

The ledger snapshot inspected for this plan ends with:

- Phase 1 acceptance `T-033` accepted.
- Phase 2 locally authorized to begin.
- `G-001` reopened because the geography ownership map conflicts with accepted `D-001` semantics.
- `G-002` paused pending that reconciliation.
- `G-003`, `G-004`, and `G-005` read-only preflight attempts produced no output because approved worker capacity was unavailable.
- No `G-002` migration file was created by the failed workers according to the ledger.

The first final-conductor action after activation is to reconcile `G-001` against the accepted tenant/workspace contract. The recommended default is:

- `zip_codes`, `location_markets`, and `location_cells` remain platform-global reference data;
- `user_market_access` is tenant-scoped;
- `crawl_runs` and `crawl_units` are tenant-scoped and may be workspace-scoped under the accepted contract;
- no tenant-specific operational row may derive authorization from a global reference row alone.

If current source truth contradicts that default, the final conductor pauses `G-002` and requests the narrow product decision. It may still dispatch non-overlapping work whose contract is independent of geography ownership.

## Thread creation contract

Each domain-conductor thread receives one immutable launch packet containing:

```text
role: domain conductor
parent: Nova Trade - Final Integration Conductor
repository: absolute worktree path
branch: exact domain branch
baseline: exact integration commit
source_documents:
  - PRD
  - implementation plan
  - canonical ledger
owned_task_families: exact IDs or ranges
owned_files: allowed domain paths
forbidden_files: shared or other-domain paths
held_locks: current lock names
worker_models: approved model order
local_authority: exact allowed actions
external_authority: forbidden unless separately approved
receipt_format: domain batch receipt
stop_conditions: source conflict, shared-file collision, security leak, destructive or external action
```

Domain conductors must not inherit implicit authority from the final conductor. Their packet is the complete authority boundary.

## Worker dispatch contract

Each worker receives exactly one task card and this packet:

```text
task_id: one implementation-plan ID
task_text: exact card text
dependencies: accepted task receipts and integration baseline
worktree: absolute domain worktree
branch: domain branch
allowed_files: exhaustive intended write set
forbidden_files: shared and unrelated files
input_contract: exact types, schemas, fixtures, and decisions
output_contract: exact behavior and artifacts
required_tests: focused checks for this card
required_evidence: success criteria mapped to commands or inspection
non_goals: adjacent capabilities not included
authority: local-only unless explicitly stated
stop_conditions: dependency conflict, write-set expansion, external need, destructive change, tenant-scope ambiguity
return_format: standardized DoneClaim receipt
```

Workers cannot approve their own file expansion. The domain conductor decides whether to split the task, transfer a lock, or reject the expansion.

## Worker DoneClaim receipt

```text
Task: <ID and title>
Status: implemented | locally validated | browser verified | blocked
Baseline commit:
Domain branch:
Files changed:
Files intentionally not changed:
Dependencies verified:
Behavior implemented:
Focused commands and exact results:
Success criteria evidence:
Tenant and isolation evidence:
Security and privacy evidence:
Assumptions:
Blocked or unverified:
Temporary resources and cleanup:
Commit:
```

Missing evidence produces `rework` or `blocked`, not acceptance.

## Domain-conductor review

Before reporting a batch to the final conductor, the domain conductor must:

1. Confirm the worker changed only its declared write set.
2. Compare implementation against the exact task success criteria.
3. Inspect security, tenant isolation, evidence, idempotency, and compatibility implications.
4. Run or independently reproduce focused checks.
5. Confirm temporary resources were cleaned up.
6. Request repair-delta rework for specific defects.
7. Commit one accepted task per commit when local commit authority exists.
8. Run the domain batch integration checks.
9. Submit a domain batch receipt to the final conductor.

The conductor should preserve correct work and request the smallest repair. Full restarts are reserved for unrecoverable bases.

## Repair-delta contract

```text
base: current worker commit or uncommitted diff
task: task ID
status: rejected | incomplete | unverifiable
failing_items:
  - exact defect or missing evidence
keep:
  - accepted behavior and files that must remain
repair_instruction:
  - smallest required correction
allowed_files:
  - exact repair write set
verification:
  - focused proof that closes each failing item
next_gate:
  - condition for domain-conductor acceptance
```

After two failed worker generations on the same repair, the domain conductor may implement the bounded repair. Cross-domain or security-sensitive takeover returns to the final conductor.

## Domain batch receipt

```text
Batch ID: <domain>-<sequence>
Domain conductor:
Baseline commit:
Task commits:
Accepted task IDs:
Reworked task IDs:
Blocked task IDs and exact unblock conditions:
Changed files:
Shared locks used and released:
Focused checks:
Domain integration checks:
Known risks:
External or live verification not performed:
Recommended merge order:
```

The final conductor rejects a batch whose baseline is stale, locks overlap, task commits are not attributable, or evidence is incomplete.

## Communication protocol

### Immediate messages

Thread messages are used for:

- dispatch;
- completion notification;
- rework requests;
- blockers;
- lock requests;
- contract-change requests;
- integration decisions.

### Durable events

The canonical implementation ledger records every material state change. Each line remains valid standalone JSON.

Required event fields:

```json
{
  "timestamp": "ISO-8601 with offset",
  "event": "task_dispatched",
  "task_id": "G-003",
  "conductor_thread": "thread identifier",
  "worker": {"model": "approved model", "agent_id": "identifier"},
  "baseline": "commit SHA",
  "write_scope": ["exact paths"],
  "dependencies": ["accepted task IDs"],
  "locks": ["lock names"],
  "authority": "local-only",
  "status": "in_progress"
}
```

Only the final conductor appends `task_accepted`, `phase_accepted`, `integration_merged`, `goal_complete`, or `goal_blocked` events. Domain conductors send proposed event payloads in their receipts.

### Communication rules

- Domain conductors report to the final conductor, not directly to the user.
- Domain-to-domain clarification is allowed, but the final conductor must record any binding contract decision.
- Thread messages are not durable acceptance evidence unless summarized in the ledger.
- A conductor must report within five minutes of a security, ownership, destructive-action, or source-truth blocker.
- Unchanged blocked state should not be repeatedly polled.

## Ready-queue algorithm

The final conductor maintains five queues:

```text
ready -> active -> domain_review -> final_review -> accepted
                \-> rework
ready -> blocked
```

A card is `ready` only when:

- every hard dependency is accepted;
- no unresolved decision changes its contract;
- its write set is known;
- required locks are available;
- its baseline is current;
- its evidence lane is locally available or explicitly activation-blocked;
- it requires no unauthorized external action.

Dispatch priority:

1. Security and source-truth repairs blocking several tasks.
2. Shared contracts that unlock several independent consumers.
3. Migration producers, one at a time.
4. Independent domain modules and tests.
5. UI consumers after backend contracts stabilize.
6. Cross-phase validation and acceptance gates.

Within the same priority, prefer tasks with the highest number of downstream dependents and disjoint write sets.

## Concurrency policy

### Initial pilot

- 1 final conductor.
- 2 active domain conductors.
- Up to 4 workers total.
- One migration producer.
- One quality verifier.
- Duration: one complete batch cycle.

Pilot success requires:

- no overlapping write sets;
- no stale-baseline work;
- no invalid ledger events;
- no unattributable files;
- domain receipts accepted without major reconstruction;
- final integration passes the required gate;
- all temporary resources cleaned up.

### Normal operation

- 1 final conductor.
- 4 to 5 active domain conductors as dependencies permit.
- 12 active workers initially.
- Increase to 16 after two clean integration batches.
- Hard maximum 20.

### Resource semaphores

| Resource | Limit |
|---|---:|
| Migration producer | 1 |
| Shared auth/permission/schema editor | 1 |
| Full release gate | 1 |
| Disposable Postgres migration rehearsal | 2 simultaneous, unique names and ports |
| Authenticated browser mutation lane | 0 without separate approval |
| Read-only browser lane | 2 |
| UI route-family editors | 3 with disjoint routes |
| Documentation or fixture-only workers | 6 |

If final-review queue depth exceeds three domain batches, stop new worker dispatch in the busiest domain until the final conductor catches up. Review saturation is treated as a throughput constraint, not solved by adding more workers.

## Branch and merge strategy

When local branch and commit authority is approved:

1. The final conductor creates `codex/nova-multitenant-integration` from the accepted baseline.
2. Domain branches are created from the same integration commit.
3. Each accepted task is one attributable commit on its domain branch.
4. Domain conductors do not merge integration into their branch during an active worker batch.
5. At batch close, the domain conductor reports commit order and baseline.
6. The final conductor refreshes or merges the domain branch only after reviewing the batch.
7. The final conductor uses a non-fast-forward batch merge into the integration branch so domain provenance remains visible.
8. Merge conflicts return to the owning domain conductor as a repair-delta packet unless the final conductor determines the correction is purely mechanical and cross-domain safe.
9. After merge validation, the final conductor appends `integration_merged` and publishes the new integration baseline.
10. Domain conductors refresh to the new baseline only between batches.

No force push, history rewrite, destructive reset, or silent conflict resolution is allowed.

## Final-conductor integration gate

The final conductor uses `gpt-5.6-sol` at `extra-high` reasoning and performs this gate for every batch:

1. Verify task dependencies and source-truth alignment.
2. Verify the domain branch started from the declared baseline.
3. Inspect every changed file and commit in the batch.
4. Confirm changed files match assigned write sets and locks.
5. Review data ownership, tenant isolation, authorization, evidence, idempotency, audit, privacy, and compatibility implications.
6. Reproduce focused checks or obtain stronger evidence when DoneClaims are indirect.
7. Merge into the integration branch only after review passes.
8. Run the batch-appropriate integration checks.
9. Reject or repair any cross-domain regression.
10. Append accepted task and merge events to the ledger.
11. Publish the new baseline and newly ready tasks.

The final conductor cannot accept a task based only on a domain-conductor statement, screenshot, test count, or absence of obvious failures.

## Validation schedule

### Per worker

- focused unit, contract, schema, or component checks;
- strict type validation when applicable;
- scoped lint when applicable;
- exact success-criteria evidence;
- temporary-resource cleanup.

### Per domain batch

- focused regression families;
- domain typecheck or application typecheck as required;
- schema or contract checks;
- two-tenant negative tests for tenant-owned behavior;
- no-send and no-external-side-effect assertions where relevant.

### Per integration batch

- final-conductor diff and contract review;
- typecheck;
- scoped or full lint based on risk;
- focused cross-domain tests;
- migration rehearsal for migration batches;
- build for shared runtime or UI changes.

### Per phase gate

- full release check;
- real disposable Postgres/RLS evidence where required;
- compatibility parity;
- recovery dry-run;
- authenticated local browser evidence where credentials are approved;
- accessibility and responsive checks for critical UI journeys;
- direct acceptance receipt under `docs/validation`.

Skipped or blocked validation is recorded explicitly and cannot be represented as passing.

## Security and external-action boundaries

All conductors and workers must preserve these rules:

- no production mutation;
- no remote migration application;
- no paid provider call;
- no outreach send;
- no mailbox or social automation;
- no account, credential, permission, billing, or security-setting change;
- no secret, raw environment file, private token, or customer data in prompts or receipts;
- no destructive Git or data operation;
- no unapproved source connector or scraping;
- no tenant-owned query, job, cache key, object, model context, export, or log without fail-closed tenant scope;
- no consequential claim without evidence or explicit inference/unknown status.

An external blocker should result in a disabled adapter, fixture/replay path, policy gate, blocked UI state, and tests when those can be implemented safely. It should not stop unrelated local work.

## Failure and recovery protocol

### Worker failure

- Preserve any correct bounded output.
- Issue a repair-delta packet.
- Replace the worker after two non-responsive or no-output interventions.
- Domain conductor may take over after two failed worker generations.

### Domain-conductor failure

- Final conductor freezes that domain branch.
- Record active task, commits, uncommitted files, locks, and temporary resources.
- Close or abandon only the failed thread, not the worktree.
- Assign a replacement conductor from the exact branch state.
- Require a takeover receipt before new worker dispatch.

### Stale baseline

- Stop the affected batch before additional edits.
- Compare shared contracts changed since the batch baseline.
- Rebase or merge only at the conductor boundary.
- Rerun affected focused checks.

### Merge conflict

- Final conductor identifies ownership and semantic conflict.
- Return a minimal repair packet to the owning conductor.
- Do not choose one side based on recency alone.
- Revalidate both task contracts after resolution.

### Security or tenant-isolation finding

- Pause all dependent integration immediately.
- Preserve evidence and current state.
- Stop affected workers and release unrelated locks.
- Final conductor performs root-cause review at `extra-high` reasoning.
- Resume only after regression evidence proves containment and correction.

### Capacity exhaustion

- Mark the unavailable model and stop repeated dispatch loops.
- Route to the next approved model according to policy.
- Keep read-only or independent work moving.
- Final conductor may take over only after the allowed repair/failure threshold.
- Never route to an unapproved model to preserve throughput.

## Activation sequence

### Stage 0: approve execution authority

Required explicit local authority:

- create local branches;
- create local worktrees;
- make local task commits;
- merge local domain branches into the integration branch;
- run local tests and disposable services;
- clean up only conductor-created temporary resources.

Still prohibited:

- push, PR, deploy, remote migration, paid call, production access, outreach, account changes, and destructive data operations.

### Stage 1: stabilize and record baseline

Owner: final conductor, `gpt-5.6-sol`, `extra-high`.

Deliverables:

- exact dirty-state ownership manifest;
- accepted/active/rework/blocked task reconciliation;
- temporary-resource check;
- integration baseline commit if authorized;
- `concurrency_baseline_accepted` ledger event.

### Stage 2: create worktrees and conductor threads

Owner: final conductor.

Deliverables:

- five domain branches;
- five isolated worktrees;
- five domain-conductor threads;
- thread registry with IDs, paths, branches, baseline, domain, model, and authority;
- initial lock registry.

### Stage 3: run pilot wave

Recommended pilot:

- Platform conductor resolves the `G-001` ownership reconciliation and prepares the exact `G-002` contract.
- Discovery conductor performs read-only and fixture preparation for dependency-ready `G-003` through `G-005` work without taking the migration lock.
- Quality conductor independently checks ownership-map completeness and migration acceptance requirements.
- Maximum four implementation workers.
- One domain batch merged by the final conductor.

### Stage 4: ramp to normal concurrency

After pilot acceptance:

- activate all dependency-useful conductors;
- allow 12 workers;
- retain one migration producer;
- dispatch next batches while the final conductor reviews completed batches;
- increase to 16 only after two clean integration cycles.

### Stage 5: phase-based scaling

| Implementation phase | Primary active conductors | Expected worker range |
|---|---|---:|
| Phase 2 generalization | Platform, Discovery, Quality | 8 to 12 |
| Phase 3 ingestion/evidence | Platform, Knowledge, Quality | 8 to 14 |
| Phases 4-5 agents/strategy | Knowledge, Product, Quality | 10 to 16 |
| Phases 6-7 research/decisioning | Discovery, Knowledge, Product, Quality | 12 to 16 |
| Phases 8-9 outreach/UI | Product, Discovery, Knowledge, Quality | 12 to 16 |
| Phase 10 release/cutover | Final, Platform, Quality | 6 to 10 |

### Stage 6: completion integration

The final conductor:

1. Confirms every in-scope task is accepted or genuinely authority/environment blocked.
2. Runs requirement-by-requirement completion audit against the PRD and implementation plan.
3. Verifies every phase-gate receipt.
4. Confirms no temporary conductor resources remain.
5. Records unresolved external activation boundaries.
6. Produces the final local integration status.
7. Requests separate authority for push, PR, deployment, migration, or live verification if desired.

## Progress and timing targets

The concurrency design targets:

- initial setup and baseline reconciliation: 1 to 2 hours;
- pilot wave: 1 to 2 hours;
- stable normal throughput: 12 to 20 active workers with 4 to 5 domain conductors;
- locally executable remainder: approximately 10 to 18 active hours after stabilization, subject to task complexity and rework;
- external activation evidence: separate calendar time based on credentials, policy, staging, provider, and production authority.

These are operating estimates, not acceptance promises. Security, migration, integration, and phase-gate work remains evidence-driven even when it reduces throughput.

## Throughput metrics

The final conductor tracks per batch:

- tasks dispatched, accepted, reworked, and blocked;
- median worker cycle time;
- median domain-review time;
- median final-review and merge time;
- first-pass acceptance rate;
- rework rounds per task;
- stale-baseline incidents;
- write-set conflicts;
- shared-lock wait time;
- failed worker generations;
- validation failures found by domain conductor;
- validation failures found only by final conductor;
- final-review queue depth.

Concurrency increases only when:

- final-review queue depth remains at three or fewer batches;
- write-set conflicts remain zero for two batches;
- no stale-baseline work is accepted;
- first-pass domain-batch acceptance is at least 80 percent;
- security and tenant-isolation defects are not increasing.

Concurrency decreases when any threshold reverses.

## Acceptance criteria for applying this plan

The concurrent operating model is considered activated only when all conditions are true:

1. The user has explicitly approved local branch, commit, worktree, and merge authority.
2. The final conductor runs `gpt-5.6-sol` at `extra-high` reasoning.
3. The final conductor thread is the sole user-facing integration authority.
4. The dirty workspace has an accepted ownership manifest and integration baseline.
5. All conductor branches and worktrees start from the same baseline.
6. Every domain conductor has an exact thread launch packet.
7. The canonical ledger remains append-only and valid JSONL.
8. Only the final conductor can append acceptance, merge, phase, or completion events.
9. Shared-surface locks are active and migration production is serialized.
10. Every worker has one task and an exhaustive write set.
11. Every worker DoneClaim is reviewed by its domain conductor.
12. Every domain batch is independently reviewed by the final conductor.
13. Integration uses reviewed, attributable task commits.
14. Pilot-wave validation passes before worker count exceeds four.
15. No external or production authority is inferred from local execution authority.
16. The root conductor can pause one domain without stopping safe work in other domains.
17. The completion definition remains the full PRD and implementation plan, not the number of tasks merged.

## Immediate owner decisions before activation

Only one new authority decision is required to apply this plan:

> Authorize the final conductor to create local `codex/*` branches, create isolated local worktrees, make task-scoped local commits, and locally merge reviewed domain branches into `codex/nova-multitenant-integration`. This authority does not include push, pull request, deployment, remote migration, provider calls, outreach, production mutation, account changes, or destructive operations.

The geography ownership reconciliation remains a product/architecture decision only if the accepted `D-001` contract and current repository evidence do not resolve it. The final conductor should first attempt source-truth reconciliation using the recommended default in this plan.

## Final operating rule

Many workers may implement. Several domain conductors may review and coordinate. Only one final conductor may integrate, merge, accept, and declare completion. That final conductor is `gpt-5.6-sol` running at `extra-high` reasoning, and every material claim must return to it with source-linked evidence.
