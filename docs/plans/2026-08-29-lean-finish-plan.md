# Nova Trade Lean Finish Plan

- **Status:** Active execution queue
- **Authority:** The product requirements and accepted decision records define behavior; this file defines remaining deliverables, status, order, and concurrency.
- **Date:** 2026-08-29
- **Baseline:** `58e58f81e6a9b80b87f4aaab428cbf3a703082ac`
- **Product source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`

This plan replaces the remaining execution sequence and task counts in the 318-card implementation plan. The old plan and its append-only ledger remain historical traceability, not a queue that must be ceremonially exhausted. Accepted decision records still define product, security, privacy, and provider boundaries.

## What “done” means

Nova Trade is done for the first launch when an invited U.S. B2B design partner can:

1. Work inside an isolated tenant and workspace with enforced permissions.
2. Upload approved business materials and receive traceable extracted evidence.
3. Review a versioned business understanding, answer useful follow-up questions, and approve an ICP and lead play.
4. Run bounded discovery through launch-approved sources, resolve accounts, and review explainable qualification, contacts, and buying-center hypotheses.
5. Create a cited outreach draft, explicitly approve it, copy or export it without any automatic send, and record outcomes.
6. Use the critical workflow accessibly in the authenticated product UI.
7. Complete a staging rehearsal proving tenant isolation, migration and rollback safety, worker recovery, observability, and the existing release gate.

This is a launchable first product, not every possible future connector, format, jurisdiction, or automation.

## Execution rules

- A task owns its schema, domain code, API or action surface, focused tests, fixtures, and necessary documentation. Do not split those into separate cards just to create handoffs.
- The implementer runs focused checks while working. Run the full release gate after integrating a coherent batch that changed shared foundations, and again on the F-18 release candidate.
- Review depth follows risk. Tenant isolation, authorization, migrations, deletion, provider policy, and outreach guardrails need a second reviewer; ordinary bounded work does not need multiple ceremonial signoffs.
- Update the status table below when a deliverable changes state. Do not add dispatch, receipt, lineage, lock-release, or “review of the review” tasks.
- A blocker pauses only the affected task. Other ready tasks continue.
- Human approval is required only for a real business or external-state decision: production credentials, paid provider use, customer data, remote migration, deployment, cohort activation, or outreach sending. Automatic sending remains outside this plan.
- A deliverable is complete when its user-visible outcome works, its material failure paths are covered, and its focused checks pass. A document or test count alone is not completion.
- F-IDs are outcome buckets, not indivisible agent assignments. Split an active deliverable into short, path-bounded work packets when that creates safe parallel work; do not add those packets to the permanent task list.

## Current position

- All 18 policy and architecture decisions are accepted for local implementation.
- The tenant/workspace/RBAC foundation and its core PostgreSQL isolation checkpoint are implemented.
- Legacy tables have substantial tenant-column coverage. Member-context RLS now covers the lead/CRM tables; worker access remains safely denied until an approved SQL-visible lease relationship and action matrix exist. The complete data-access, route, export, and backfill boundary is not yet accepted.
- The existing application release gate passes on Node 24 at this baseline.
- The seven-file UI specification is useful implementation input. Its five-signature receipt is not a prerequisite; material feedback is resolved in the UI deliverable it affects.
- G-007P41 and the per-index audit sequence are discontinued. Existing evidence says to retain the current index and shows no material product defect. No more custom harness or receipt work is justified unless a real workload test exposes a regression.

## Active finish list

Statuses are `READY`, `WAITING`, `IN PROGRESS — <owner>`, `BLOCKED — <condition>`, or `DONE`. `READY` means at least one useful slice can start. `WAITING` means no useful slice can start because a code dependency is incomplete. `Depends on` is a completion gate unless a row says otherwise: independent work may start earlier, but the deliverable cannot become `DONE`. Use `BLOCKED` only when an external dependency or unresolved technical condition prevents all useful work.

| ID | Status | Deliverable | Done when | Depends on | Legacy coverage |
|---|---|---|---|---|---|
| F-01 | IN PROGRESS — root | Complete tenant enforcement | Every existing read, write, route, worker, export, cache, and aggregate carries tenant context; remaining PostgreSQL RLS policies use the restricted runtime role; two-tenant negative tests pass on real PostgreSQL. | — | G-002–G-007, G-009–G-021, Q-006–Q-012 |
| F-02 | WAITING | Backfill and cut over the legacy lead workflow | Legacy rows reconcile to a compatibility tenant, the website-lead play runs through tenant-scoped services, parity checks pass, and rollback is rehearsed before old paths are retired. | F-01 | G-008, G-023–G-025, C-030–C-033, Q-034–Q-036 |
| F-03 | WAITING | Finish tenant operations | Membership administration, policy settings, support grants, quotas, audit, export, retention, deletion, and suspension work end to end with non-enumerating failures. It publishes the data-lifecycle registration contract used by later domains. | F-01 | T-020–T-024, T-031–T-032, Q-010–Q-011, Q-029–Q-030 |
| F-04 | IN PROGRESS — root | Ship secure document intake | A tenant can upload every launch-approved format through private storage, signature and size validation, quarantine, malware scanning, deduplication, retention, and safe failure states. | — | I-001–I-010, I-018 |
| F-05 | IN PROGRESS — root | Extract evidence and resolve citations | Launch parsers, bounded URL intake, extraction jobs, blocks/tables, chunks, evidence, claims, review state, and render-safe citations work on golden and adversarial fixtures. | F-04 | I-011–I-030, Q-013 |
| F-06 | IN PROGRESS — root | Generalize bounded agent execution | Tenant-safe model access, versioned prompts, run/step/tool records, budgets, leases, prompt-injection isolation, replay, and failure handling support later agent workflows. | — | A-003–A-009, A-024–A-025, Q-014, Q-023–Q-026 |
| F-07 | IN PROGRESS — root | Deliver business understanding and adaptive questions | Evidence produces a reviewable versioned understanding; questions reduce unresolved uncertainty without repetition; answers propose traceable claim updates; industrial and non-industrial fixtures pass. | F-05, F-06 | A-001–A-002, A-010–A-023, A-026 |
| F-08 | IN PROGRESS — root | Deliver versioned ICPs and lead plays | Users can propose, edit, validate, simulate, approve, activate, supersede, and roll back ICP and play versions with explicit evidence, exclusions, budgets, and policies. | F-07 | P-001–P-020 |
| F-09 | IN PROGRESS — root | Build the launch connector platform | The registry, deny-by-default policy, source runs, observations, budgets, resumable runner, Google Places adapter, and customer-list adapter pass one shared conformance suite. | — | G-022, C-001–C-021, Q-015 |
| F-10 | WAITING | Deliver discovery and canonical accounts | An approved play creates a bounded discovery plan, runs it, preserves observations, resolves exact matches, queues ambiguous matches, supports reversible merge/unmerge, and evaluates freshness. | F-08, F-09 | C-007–C-016, C-022–C-029, C-034–C-035 |
| F-11 | WAITING | Deliver contacts and buying centers | Contacts retain source, freshness, permitted-use, consent, and suppression state; buying-center roles clearly separate hypotheses from verified people and support review/correction. | F-10 | B-001–B-012 |
| F-12 | WAITING | Deliver qualification, scoring, and review | Play-specific qualification and factor scores are explainable, overridable, reproducible, and routed through one reusable review queue; regression fixtures pass. Engine work may start after F-10; contact-aware completion waits for F-11. | F-11 | B-013–B-024, Q-016 |
| F-13 | WAITING | Deliver cited outreach drafts | Approved facts and account evidence produce drafts whose material claims resolve to citations; policy and suppression checks fail closed; a human can approve, copy, or export; structural tests prove there is no send path. Contract and citation-validator work may start before the full lifecycle is available. | F-12 | O-001–O-012, Q-017 |
| F-14 | WAITING | Deliver outcomes and controlled learning | Users can record and correct outcomes; reporting attributes them to account, play, and outreach versions; learning proposes reviewable, reversible changes and never silently changes active policy. | F-13 | O-013–O-025 |
| F-15 | IN PROGRESS — root | Build shell, onboarding, and knowledge UI | The authenticated responsive shell supports tenant/workspace switching, permissions, reusable async/access/evidence states, onboarding, source intake, extraction review, understanding review, and adaptive questions. Fixture-backed UI work starts now; completion uses the real services. | F-01, F-07 for completion | UI-000–UI-014 |
| F-16 | WAITING | Build strategy and discovery UI | Users can author and activate ICPs/plays, preview and run discovery, recover runs, inspect accounts and merge history, and see evidence and uncertainty at each decision. Strategy screens may start after F-08; completion waits for discovery and the shared shell. | F-10, F-15 | UI-015–UI-025 |
| F-17 | WAITING | Build contact, review, outreach, reporting, and admin UI | Critical researcher, reviewer, outreach, reporting, membership, connector, governance, export/delete, and support workflows are usable on desktop and mobile with keyboard and screen-reader coverage. Feature slices may start as their owning service lands. | F-03, F-14, F-16 | UI-026–UI-041, Q-020 |
| F-18 | WAITING | Prove and launch the design-partner release | One automated happy path and key degraded paths pass in staging; every downstream domain is registered with the F-03 lifecycle contract; security, accessibility, performance, idempotency, recovery, migration, rollback, logs/alerts, budgets, and kill switches meet the accepted launch thresholds; the named owner makes one go/no-go decision. | F-02, F-17 | Q-001–Q-040 |

F-18 `DONE` means the release candidate and go/no-go record are complete. It does not itself authorize deployment, customer enrollment, paid-provider use, or outreach; those remain separately approved external actions.

## Concurrent execution model

Use one integration owner and fill every other available slot with a conflict-free work packet. Do not wait for an entire wave: when a dependency or stable contract lands, dispatch the next useful packet immediately.

| Lane | Delivery flow | Useful work that can start now |
|---|---|---|
| Platform | F-01 → F-02 and F-03 | Tenant data access, RLS, route/worker/export scoping |
| Knowledge | F-04 → F-05 | Intake contracts, private storage, validation, scanning, fixtures |
| Intelligence | F-06 → F-07 → F-08 | Model gateway, run records, tool policy, replay and injection defenses |
| Research | F-09 → F-10 → F-11 → F-12 → F-13 → F-14 | Connector contracts, policy, runners, budgets, adapters and conformance |
| Product UI | F-15 → F-16 → F-17 | Shell, navigation, shared states, onboarding and fixture-backed knowledge screens |
| Release | F-18 | Planning only until F-02 and F-17 are done |

### Dispatch loop

1. Keep one integration owner; all remaining slots are worker slots.
2. Give each worker one objective, exact read/write paths, and one focused verifier. Use names such as `F-04/storage-adapter`; these are temporary work packets, not new plan tasks.
3. Each deliverable has one integration owner even when several workers contribute packets.
4. A worker claims its exact paths in one short message before editing. If paths overlap, serialize only that overlap and continue all unrelated work.
5. Integrate a finished packet as soon as its focused checks and any required high-risk review pass. Do not wait for a batch or create a receipt task.
6. Do not create a conductor hierarchy, branch, worktree, lock file, or ledger event per packet. Use an isolated worktree only when write scopes cannot otherwise be separated.
7. Update this table only when an F-level status changes. A worker handoff needs only the task/packet name, changed files, checks run, and a real blocker if one exists.

### Shared-surface ownership

| Conflict key | Exclusive surface | Rule |
|---|---|---|
| `db-shape` | `supabase/migrations/`, SQLite schema, migration inventory, recovery/export schema registry | One writer at a time. Rotate the owner as soon as the current schema change integrates; domain work continues in parallel. |
| `legacy-db-core` | `src/lib/db/index.ts`, `src/lib/db/queries.ts`, tenant DB context and transaction plumbing | F-01 owns the retrofit. New domains use dedicated repositories rather than expanding the monolith; the integration owner handles unavoidable glue. |
| `contract:<name>` | Shared DTO, event, job, connector, or repository contract | The producing deliverable owns additive/versioned changes. Consumers use adapters and do not rewrite the producer's contract. |
| `ui-shell` | Protected layout, navigation, global styles, shared page/async/access/evidence components | F-15 owns the shell. F-16 and F-17 own feature pages and briefly claim this key only to register navigation or shared primitives. |
| `test-infra` | Global fixtures, shared PostgreSQL/E2E harnesses, release scripts | F-01 owns tenant fixtures, F-15 owns shared UI harnesses, and F-18 owns final E2E/release wiring. Domain-local tests do not claim this key. |
| `toolchain` | `package.json`, lockfile, TypeScript/Vitest/Playwright/Next config, CI | Integration owner only. Workers request the smallest needed change and continue non-toolchain work. |

Tests run concurrently by default. Any test using a disposable database, container, filesystem path, or port uses a task-specific name; a shared local service is never assumed.

### Capacity example

With 16 available slots, use one integration owner and 15 workers:

| Active area | Workers | Initial packet split |
|---|---:|---|
| Integration | 1 | Shared-surface changes, status, focused integration checks |
| F-01 | 3 | DB/RLS; repositories/services; routes/workers/exports |
| F-04 | 3 | Intake/storage; validation/scanning; fixtures/focused tests |
| F-06 | 3 | Gateway/prompt policy; run/lease services; replay/security tests |
| F-09 | 3 | Registry/source policy; runner/budgets; adapters/conformance |
| F-15 | 3 | Shell/shared states; onboarding; knowledge/review/accessibility UI |

The F-01 DB/RLS packet initially owns `db-shape`. Other lanes work in new domain files until that key rotates. With fewer slots, keep the same priority order and fill every available worker slot; with more slots, split only when paths and outcomes remain independent.

### Dependency unlocks

- F-01 unlocks completion of F-02 and F-03.
- F-04 unlocks F-05; F-05 plus F-06 unlock F-07; F-07 unlocks F-08.
- F-08 plus F-09 unlock F-10; F-10 unlocks F-11 and the discovery portion of F-16.
- F-11 unlocks completion of F-12; F-12 unlocks completion of F-13; F-13 unlocks F-14.
- F-03, F-14, and F-16 unlock completion of F-17.
- F-02 and F-17 unlock F-18.

The graph is acyclic. Its strict completion-graph width is five deliverables, but packet-level splitting can safely use 15 workers while preserving the six conflict keys above. The launch critical path is F-04/F-06 → F-07 → F-08 → F-10 → F-11 → F-12 → F-13 → F-14 → F-17 → F-18, so completed packets on that path integrate first.

## Deliberately deferred from the first launch

- Automatic sending, mailbox access, LinkedIn automation, and autonomous campaign sequences.
- Live bidirectional CRM synchronization; controlled CSV/JSON import and export remain in scope.
- Self-serve billing and unrestricted public signup; launch provisioning remains invite/operator controlled.
- Connectors beyond Google Places, customer-authorized URLs, and customer-provided lists unless a design partner makes one essential.
- Non-U.S. outreach policy, non-English extraction, encrypted or archive inputs, legacy binary office formats, and audio/video ingestion.
- Silent or automatic learning changes, custom roles, and generalized workflow builders.
- Performance tuning without a failing representative workload or measured launch threshold.

Deferred items become separate product decisions only when there is a concrete customer or operational need. They do not block F-18.

## Historical-plan disposition

- Accepted implementation and security work remains accepted; this plan does not reopen it.
- Remaining legacy cards map into F-01–F-18 through the “Legacy coverage” column. A legacy phase gate is satisfied inside the corresponding deliverable rather than as a separate task.
- The old concurrent-conductor topology is optional operating history. Teams may parallelize ready deliverables directly and coordinate only shared migrations, contracts, or files.
