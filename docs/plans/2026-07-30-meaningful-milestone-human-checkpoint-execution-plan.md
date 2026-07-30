# Nova Trade Meaningful-Milestone and Human-Checkpoint Execution Plan

## Document control

- **Date:** 2026-07-30
- **Status:** User-directed execution overlay; ready for final-conductor integration
- **Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
- **Integration branch:** `codex/nova-multitenant-integration`
- **Overlay baseline:** `b9fb91314bf5338127b0a6ea632579ec1371b988`
- **Immediate instruction:** Finish only the already-active G006C2A Repair-4 atomic source packet to its next clean, locally validated source checkpoint, then pause globally for the user before review, merge, acceptance, C2B, or any new dispatch.

This document changes execution order, reporting, concurrency allocation, and
human pause behavior. It does not replace, delete, complete, renumber, or weaken
any product requirement, implementation card, dependency, success criterion,
security requirement, validation requirement, or external-action boundary.

## Preserved source of truth

The following baseline blobs are preserved as the immutable inputs to this
overlay:

| Source | Baseline Git blob |
|---|---|
| Product requirements | `574fc5020e4a6c4dd93ea28d626fa3ed112e8b0c` |
| 318-card implementation plan | `e102f469c45b0afa907e3d6dc48f18dd4a1b3ed8` |
| Concurrent multi-conductor plan | `a057f66dd8d06c5b9366dd80f2b1889c217e4007` |
| Append-only implementation ledger | `b9d0f561638506b73f03e2614fd5ffeff55f1b06` |

Preservation rules:

1. All 318 original cards remain in scope.
2. Q-040 remains the final program gate.
3. Accepted cards remain accepted; this overlay does not reopen them.
4. Open and blocked cards remain present with their original dependencies.
5. Internal G-004/G-006 packets remain implementation detail beneath their
   original cards and do not inflate the original-card completion count.
6. The ledger remains append-only. Existing events may not be edited or removed.
7. User-owned changes, active worktrees, source commits, fixtures, receipts, and
   validation evidence are preserved.
8. No remote, production, provider, customer, credential, account, outreach,
   destructive, push, PR, or deployment authority is added.

## Current progress baseline

At the overlay baseline:

- 58 of 318 original cards are accepted: 18 D cards, 33 T cards, G-001,
  G-002, G-003, G-005, G-023, Q-001, and Q-002.
- Eight additional internal milestones are accepted inside open original cards:
  G-004A, G-006R, G-006A preparation, G-006A-P, G-006B-B1, G-006C0,
  G-006C1, and G-006C2A.
- Parent G-004 and G-006 remain open.
- G006C2B stopped before implementation because accepted C2A did not retain the
  prior verified storage anchors required for safe current-state proof.
- The only active source packet is the exact five-path G006C2A Repair-4 in
  `C:\Users\Masih\Documents\NovaTradeWorktrees\g006c2a-anchor-repair`.

The raw original-card completion measure is therefore 58/318 (18.2%). The main
progress indicator from this point is the next meaningful product milestone,
not the number of internal packets or ledger events.

## Goal-state vocabulary

The final conductor must keep the user-facing goal status synchronized with the
actual execution state:

| State | Meaning |
|---|---|
| `in_progress` | Authorized implementation or review is active. |
| `converging_to_checkpoint` | No new work may start; already-active work is being brought to a safe commit and cleanup point. |
| `user_checkpoint_required` | All execution is paused and only the user may resume it. |
| `blocked` | No safe in-scope work can progress without new authority, unavailable evidence, or a source-truth decision. |
| `accepted` | The named original card or milestone passed its required gate. |

A stale capacity error is not a permanent global blocker after the user approves
an available fallback. A stopped child packet is not a global blocker when a
safe prerequisite repair is active. A human checkpoint is a pause, not a block.

## Immediate checkpoint: CP-0

The next safe checkpoint is **CP-0: G006C2A Repair-4 source complete**.

The active producer may do only the following before the pause:

1. Finish the already-authorized five files.
2. Run its authorized focused and regression checks.
3. Create one attributable local source commit.
4. Leave its worktree clean and remove only task-owned temporary resources.
5. Return the exact source commit, diff, tests, failures, residue, and risks.

At CP-0 the final conductor must not:

- dispatch architecture, security, quality, or other reviewers;
- merge the source into integration;
- append acceptance or merge events;
- start C2B, C2C, C3-C6, or another implementation card;
- push, open a PR, deploy, or perform any external action;
- auto-resume after a timeout.

The final conductor sets the goal to `user_checkpoint_required`, reports the
checkpoint package described below, and waits for an explicit user command.

## Human checkpoint protocol

Every mandatory checkpoint follows this protocol:

1. Stop new dispatches.
2. Bring already-active work within the checkpoint scope to attributable clean
   commits; do not broaden scope merely to make the checkpoint look green.
3. Stop task-owned processes and release task-owned locks.
4. Preserve every worktree and commit needed for repair or comparison.
5. Report exact integration and source revisions, dirty states, changed files,
   tests, failures, skipped checks, blocked actions, and remaining cards.
6. Provide a copy-ready manual test runbook with commands, local URLs, fixture
   identities, expected results, negative cases, and cleanup instructions.
7. Set the goal to `user_checkpoint_required` and wait indefinitely.

Only these explicit user commands leave the checkpoint:

- `RESUME <checkpoint-id>`: continue according to this overlay.
- `REPAIR <checkpoint-id>: <finding>`: open the smallest bounded repair.
- `HOLD <checkpoint-id>`: remain paused without polling or new work.
- `STOP`: preserve state and end execution.

Silence, elapsed time, a passing test, or an agent recommendation never resumes
execution.

## Checkpoint package returned to the user

The final conductor returns this exact information at every checkpoint:

```text
Checkpoint:
Goal state: user_checkpoint_required
Meaningful milestone:
Integration branch and commit:
Source branches, worktrees, and commits:
Accepted original cards: <count>/318
Accepted cards since the prior checkpoint:
Files changed:
Behavior now available:
Focused checks and exact results:
Full or phase checks and exact results:
Failures and skipped checks:
Security and tenant-isolation evidence:
Temporary-resource and process state:
External/live actions not performed:
Known risks:
Manual test prerequisites:
Manual test commands and URLs:
Expected positive results:
Expected negative/isolation results:
Cleanup instructions:
Resume command: RESUME <checkpoint-id>
```

## Runtime concurrency allocation

The current environment has a hard four-total-agent ceiling. Until the user
explicitly changes it, earlier 12-to-20-worker scaling targets are superseded by:

- one final integration conductor;
- up to three other active agents total;
- normally two or three implementation lanes plus final-conductor integration;
- one writer on an exclusive shared surface;
- specialist review only when the change is security-, migration-, tenancy-,
  recovery-, or authorization-sensitive.

Do not use three parallel reviewers around one writer as the normal operating
mode. When only one critical-path writer is safe, other slots work on genuinely
dependency-ready, disjoint original cards or remain idle. Concurrency is a
throughput tool, not a requirement to create review activity.

Terra medium remains an approved bounded implementation fallback. It receives
an exact accepted write set and cannot perform domain or final acceptance. Sol
retains source-truth, integration, security, migration, and final acceptance
authority.

## Review and validation economy

Safety gates remain binding, but evidence is consolidated:

1. Focused tests run while implementing a card.
2. Domain regressions run once when the card or coherent wave is source-complete.
3. Full release checks run once per integration wave or mandatory checkpoint,
   unless a failure requires a focused rerun.
4. P0-P2 behavior, security, migration, isolation, data-loss, and correctness
   findings are repaired before acceptance.
5. P3 wording and documentation corrections are collected into one final
   checkpoint pass unless they make evidence materially false.
6. Validation receipts never attempt to embed their own Git commit hash. The
   append-only ledger records the final immutable source and merge revisions.
7. Documentation-only repairs do not trigger full functional reruns when source
   blobs are unchanged; diff and truthfulness checks are sufficient.
8. One final-conductor review can satisfy architecture, quality, and integration
   review for ordinary bounded changes. A separate specialist is added only when
   the risk requires it.

## Progress reporting

Every status update reports:

- accepted original cards out of 318;
- current meaningful milestone and checkpoint;
- active original cards and internal packets beneath them;
- product behavior that became usable;
- time spent on implementation, validation, review, and rework;
- rework caused only by documentation;
- exact blocker and unblock condition when blocked.

Internal packets, preflights, reviewer turns, ledger events, and receipt-only
commits are not counted as additional completed original cards.

## Meaningful Milestone 1: two-tenant legacy product

The nearest product outcome is **G-025, the Phase 2 generalized-boundary
acceptance gate**. It proves that the existing Nova Trade workflow works for two
isolated tenants across storage, queries, actions, routes, workers, caches,
usage, and compatibility behavior.

### Phase 2 execution waves

Original dependencies and write locks still control readiness.

| Wave | Scope | Integration outcome |
|---|---|---|
| W-0 | Finish Repair-4, C2B, C2C, G006C3-C6, and close G-006 | SQLite fresh/upgraded compatibility and scoped legacy writers are complete. |
| W-1 | G-007 through G-010 | Tenant-inclusive constraints, reconciliation, and shared access/location interfaces are complete. |
| W-2 | G-011 through G-017; complete G-004B with its accepted G-013/G-014 relationship and close G-004 | Domain read/write interfaces are tenant-scoped without cross-tenant defaults. |
| W-3 | G-018 through G-022 | Tenant scope reaches actions, routes, workers, budgets, providers, and caches. |
| W-4 | G-024 and G-025 | The two-tenant legacy/new-boundary parity suite and Phase 2 gate pass. |

No wave completion deletes unfinished cards. A blocked card stays visible and
only its dependents pause; other dependency-ready, disjoint cards may continue.

## Mandatory product checkpoints

The program pauses globally at the following checkpoints. The user may add an
extra checkpoint at any time.

| Checkpoint | Required accepted gate | What becomes meaningful | Minimum manual test |
|---|---|---|---|
| CP-0 | Repair-4 clean source commit; not merged | Safe provenance repair ready for inspection | Inspect five-path diff and focused results; confirm no public authority or data loss. |
| CP-1 | G-006 | Fresh and upgraded SQLite compatibility is complete | Exercise fresh and upgraded fixtures; replace access/crawl state; restart; prove cross-scope rejection and rollback. |
| CP-2 | G-025 | Existing Nova Trade product works for two isolated tenants | Log in as two tenant users; create/read/update equivalent records; run crawl/worker paths; prove no cross-tenant visibility or mutation. |
| CP-3 | I-030 | Documents become reviewable evidence and claims | Upload approved PDF, DOCX, CSV, text, and image fixtures; verify extraction, citations, rejection limits, dedupe, and tenant isolation. |
| CP-4 | A-026 | Adaptive business understanding is usable | Generate understanding from evidence, inspect uncertainty, answer adaptive questions, reject unsupported claims, and replay deterministically. |
| CP-5 | P-020 | Versioned ICP and lead-play workflow is usable | Draft, review, approve, supersede, and replay an ICP/play; prove citations, version history, and tenant isolation. |
| CP-6 | C-035 | Bounded discovery and account intelligence is usable | Run an approved fixture/replay source plan, inspect observations/accounts, reject unapproved sources, and verify budget and tenant limits. |
| CP-7 | B-024 | Contacts, buying centers, qualification, and review routing are usable | Review contact provenance, suppression/permitted-use state, scoring factors, buying-center roles, and tenant-isolated queues. |
| CP-8 | O-025 | Cited outreach drafting and human approval are usable | Produce drafts from approved evidence, exercise approval/rejection/suppression/copy-export, and prove that no message is sent. |
| CP-9 | UI-041 | The authenticated product workflow is usable end to end | Walk onboarding through reporting on desktop and mobile; verify loading/empty/error states, access control, accessibility, and no overflow. |
| CP-10 | Q-040 | Local production-readiness evidence is complete | Run the final manual acceptance, security, recovery, reliability, accessibility, cost, and compliance runbook; identify still-unperformed live actions. |

The final conductor creates the exact repository-specific manual runbook at each
checkpoint from current scripts, routes, fixtures, and configuration. It must not
invent credentials or imply production/live verification from local fixtures.

## Phase-gate continuation map

The preserved implementation-plan sequence remains:

1. G-025: generalized two-tenant compatibility boundary.
2. I-030: document ingestion, evidence, claims, and review.
3. A-026: approved business understanding and adaptive questions.
4. P-020: versioned ICPs and lead plays.
5. C-035: connector registry, discovery, observations, and accounts.
6. B-024: contacts, buying centers, qualification, and decisioning.
7. O-025: cited outreach drafts, human approval, outcomes, and learning.
8. UI-041: authenticated product-workflow acceptance.
9. Q-040: final production-readiness and compliance gate.

This is milestone scheduling over the original cards, not a rewritten backlog.

## Definition of meaningful progress

Progress is meaningful when a user-testable workflow crosses a deep module seam
and produces an observable, isolated outcome. Code volume, worker count, ledger
volume, review turns, internal packet count, and passing tests without usable
behavior are supporting evidence, not the outcome.

Each integration wave must state which caller behavior became available and
which manual checkpoint it advances. If a proposed internal packet neither
unblocks downstream work nor adds necessary safety evidence, it should be folded
into its owning original card instead of becoming a separate execution cycle.

## No-data-loss closeout check

Before integrating this overlay, and again at every checkpoint, the final
conductor verifies:

- the implementation plan still contains exactly 318 unique cards;
- the PRD and implementation-plan baseline blobs remain available in Git;
- the ledger parses as standalone append-only JSONL;
- accepted original-card IDs have not decreased or been silently reopened;
- every active worktree and attributable source commit is recorded;
- no unrelated or user-owned change was discarded;
- no destructive Git command or history rewrite occurred;
- no remote or external action was inferred from this planning change.

## Overlay acceptance criteria

This overlay is correctly applied when:

1. The main task pauses at CP-0 before review or merge.
2. The user-facing goal no longer incorrectly remains globally blocked while
   authorized work is active.
3. Original-card progress is reported as `<accepted>/318`.
4. G-025 is the next meaningful product milestone.
5. Four-agent runtime allocation follows the two/three-writer plus integrator
   rule when dependencies permit.
6. Mandatory checkpoints require explicit user resume.
7. Every checkpoint includes a manual test runbook and exact evidence.
8. All original requirements, cards, evidence, and active source work remain
   preserved.

