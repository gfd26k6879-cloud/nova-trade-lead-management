# Nova Trade Multi-Tenant Lead Intelligence Platform Implementation Plan

## Planner metadata

- **Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
- **Branch inspected:** `main`
- **Date:** 2026-07-27
- **Planning mode:** Full planning-orchestrator worker run; planning only
- **Primary source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
- **Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres, local SQLite fallback, Zod, Vitest, Playwright
- **Current dirty state preserved:** The PRD is untracked; this plan is an additional documentation artifact. No application implementation has started.
- **Worker scopes:** tenancy/security/data; ingestion/agent/evidence; connectors/accounts/scoring; product workflow/UI; QA/operations/release
- **External research:** None. No external product or website was supplied, and current repository evidence is sufficient for this decomposition.
- **Primary assumptions:** evolve the existing application in place; keep the current website-lead workflow available as a compatibility play during migration; automatic outbound sending remains out of scope; production and paid-provider mutation require separate explicit approval.

## Executive goal

Implement the PRD through small, independently assignable tasks that a low-capability model can complete without rediscovering architecture or inventing policy. The plan changes Nova Trade's durable product boundary from one internal, Google-Places-and-website-centered lead workflow to a tenant-isolated platform for business-material ingestion, adaptive understanding, ICPs and lead plays, compliant discovery, account and buying-center intelligence, evidence-backed qualification, human-approved outreach drafts, and outcome learning.

This is a dependency-ordered implementation backlog, not authorization to implement, deploy, migrate production, call paid providers, or send outreach.

## Source-of-truth contract

- **Intent:** Build the multi-tenant, agent-driven B2B lead-intelligence and human-approved outreach platform defined by the PRD.
- **Current behavior:** One invite-only application with `admin` and `researcher` roles, market access, Google Places/local-business discovery, website opportunity scoring, lead-centric AI verification/artifacts, CRM/outreach events, copy-only outreach, worker leases, budgets, audit, and Postgres/SQLite data paths.
- **Expected outcome:** Tenant-scoped, versioned, evidence-backed workflows spanning onboarding through outcome learning, while preserving the current workflow as a compatibility play until cutover criteria pass.
- **Truth owner:** The PRD owns product intent; versioned database/API contracts own implemented behavior; tenant policy owns source/contact/outreach permissions; source observations and audit events own provenance.
- **Contract boundary:** Every tenant-owned row, object, queue item, cache key, retrieval index, worker run, prompt context, export, and log reference must be tenant-scoped. Every consequential assertion must be traceable to evidence or clearly labeled as inference/unknown.
- **Displaced path:** Direct assumptions that every prospect is a `lead` found through Google Places and scored for website weakness. These become a legacy website lead play over generalized account/source/play contracts.
- **Cutover:** Additive schema and compatibility adapters first; dual-read/dual-write only where explicitly designed; backfill and reconcile; compare old/new outputs; move routes/workers to generalized services; retire legacy paths only after parity, rollback, and acceptance evidence.
- **Acceptance evidence:** Real tenant-scoped records, API payloads, rendered authenticated routes, worker traces, resolved citations, audit entries, isolation-negative tests, migration rehearsal, and rollback evidence. Unit tests alone are not completion proof.
- **Evidence lane:** Local fixtures and SQLite for fast tests; isolated Supabase project for Postgres/RLS/migration evidence; authenticated local browser state for UI; approved staging for end-to-end provider and operational evidence.
- **Kill criteria:** Stop rollout on any cross-tenant read/write, missing provenance after processing, unbounded provider cost, unsupported outbound claim escaping a gate, non-idempotent duplicate side effect, unrecoverable migration, or unexplained parity loss in the compatibility play.
- **Forbidden moves:** No production mutation, paid-provider execution, outreach send, secret exposure, destructive down-migration, blanket `supabase db push`, history rewrite, weakening of deny-by-default access, or deletion of the legacy workflow without explicit approval and rollback evidence.

## Native planning superiority

- **Codex Native baseline risk:** A flat feature list would leave weaker agents to invent schema, sequence, policy, and verification.
- **What this plan does better:** Anchors the live worktree; isolates human decisions; defines atomic task cards, dependencies, file boundaries, validation evidence, stop rules, migration/cutover, and an implementation-orchestrator handoff.
- **User-specific context used:** Windows/PowerShell worktree, Node 24 release gate, current independent Nova Trade repository, preference for end-to-end ownership, and explicit desire to use many cheaper models one task at a time.
- **Superiority score target:** 5/5.
- **Proof artifacts:** This saved plan, orchestration receipt, worker-lane synthesis, task dependency index, verification matrix, and closeout receipt.

## Orchestration decision

- **Mode:** Full worker run
- **Worker count:** 5
- **Decision reason:** The PRD spans at least five independent technical/product surfaces and must be executable by agents that cannot fill in missing strategy.
- **Independent surfaces:** tenant/security/data; ingestion/agents/evidence; connectors/accounts/scoring; user workflows/UI; quality/operations/release.
- **Workers used:** Five read-only planning workers with non-overlapping scopes.
- **Workers skipped:** No external-research or background-browser worker because no external references were requested and no live UI comparison is needed to decompose this PRD.
- **Thread decision:** No user-visible child task. The planning work belongs in one parent-owned artifact.
- **Reconsider trigger:** Add a focused planning pass only if implementation reveals a contract conflict not represented here or a blocker decision changes the product boundary.

## Background browser lane

- **Needed:** No during planning.
- **Target/surface:** None.
- **Safety boundary:** Future implementation browser checks use local or approved staging only; mutating E2E requires explicit opt-in and approved fixtures.
- **Required receipt:** Route, viewport, auth role, fixture tenant, interaction, observed result, screenshot/trace path, and whether data was mutated.
- **Stop condition:** Stop immediately on wrong tenant, unexpected external request, or any attempt to send outreach.

## Current-state implementation anchors

- `src/lib/db/schema.ts` and `src/lib/db/index.ts` define the SQLite path; `supabase/migrations/` defines production Postgres evolution.
- `src/lib/db/queries.ts` is a large typed data-access layer and should be split by new bounded domains rather than expanded indefinitely.
- `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/lib/lead-access.ts`, and `src/lib/app-users.ts` implement current session, two-role permission, market, and assignment rules.
- `src/lib/crawl/*`, `src/lib/google-places.ts`, internal worker auth, worker metadata, retry/lease tests, and usage events are reusable orchestration primitives.
- `src/lib/ai/*` already demonstrates typed model output, evidence/source fields, confidence, prompt/input hashes, bounded models, review passes, retries, and cost tracking.
- Protected routes already cover dashboard, coverage, explore, leads, quality, queue, scheduler, settings, statistics, team, users, and fulfillment.
- Current release evidence is `npm run release:check`; authenticated and mutating Playwright lanes require explicit credentials/state and mutation opt-in.
- Recovery currently covers 23 application tables but excludes Auth, Vault, Storage, environment, and migrations. The future contract must add object-storage and tenant-deletion recovery behavior.
- Repository docs warn of historical linked Supabase migration drift. Every migration task must verify linked state before applying anything; no task below authorizes a live migration.

## Future-state architecture boundaries

1. **Identity and policy:** tenant/workspace membership, RBAC, tenant policy, connector authorization, support elevation.
2. **Knowledge:** documents, versions, chunks/tables, evidence, claims, reviews, questions/answers, approved business understanding.
3. **Strategy:** ICP and lead-play versions, examples/counterexamples, source/query plans, scoring and outreach policy.
4. **Research:** connector registry, source runs/observations, canonical accounts, entity resolution, contacts, buying centers.
5. **Decisioning:** qualification assessments, score snapshots/factors, review tasks, manual overrides, freshness and uncertainty.
6. **Engagement:** cited outreach drafts, approvals, copy/export events, suppressions, outcomes, and learning proposals. Automatic sending stays disabled.
7. **Platform operations:** agent runs/steps/tool calls, usage/budgets, worker leases, audit, retention/export/delete, health and observability.

Each boundary gets a dedicated module, typed contract, tenant-scoped query layer, permission checks, focused tests, and route/UI adapter. No new feature should issue ad hoc SQL from a React component or route.

## Rules for assigning tasks to low-capability models

### One task, one agent, one bounded outcome

- Assign exactly one task ID per agent run.
- Give the agent the PRD, this plan, the listed dependency receipts, and only the relevant files.
- Do not ask the agent to redesign the task, choose policy, or implement a neighboring task.
- Default to one migration, one module, one API contract, one worker behavior, one route, or one test family per task.
- If the task touches more files than listed, the agent must explain why before editing. It must stop if the expansion crosses a domain boundary.

### Required agent execution sequence

1. Confirm repository path, branch, `git status --short`, task ID, and dependency task receipts.
2. Read the PRD section, this task card, applicable repository docs, and every listed existing file before editing.
3. Restate the exact input/output contract and list files to change. If a required contract is missing or contradictory, stop.
4. Add or update the smallest focused test/fixture that proves the task.
5. Implement only the task behavior using existing patterns and typed validation.
6. Run the task's focused checks, then `npm run typecheck` unless the card explicitly says documentation/SQL-only.
7. Inspect `git diff --check`, `git diff -- <listed-files>`, and `git status --short`.
8. Return a receipt: files changed, behavior, commands/results, target-perspective evidence, assumptions, and remaining blockers. Never claim deployment or live verification unless it occurred on the named target.

### Mandatory stop and escalation rules

Stop without improvising when:

- a human decision task that changes this task's contract is unresolved; capability-specific legal/provider decisions block only that capability's activation;
- a dependency receipt is absent or failed;
- a required table/API/type differs from the plan;
- production credentials, secrets, paid calls, live migration, external messaging, or personal data would be needed;
- unrelated dirty changes overlap the same lines/files;
- a migration would drop/rename data, modify remote history, or cannot be rehearsed on an isolated copy;
- a source's terms, retention, or permitted-use contract is unknown;
- the implementation would allow a worker, cache, query, or model context to operate without `tenant_id`;
- tests pass but target-perspective evidence contradicts them.

### Standard task receipt

```text
Task: <ID and title>
Status: implemented | locally validated | browser verified | blocked
Files changed:
Dependencies verified:
Commands and exact results:
Target-perspective evidence:
Tenant/isolation evidence:
Assumptions made:
Blocked or unverified:
Git status:
```

## Phase and dependency map

| Phase | Scope | Hard entry gate | Hard exit gate |
|---|---|---|---|
| 0 | Decisions and safety contracts | PRD accepted | D-001 through D-004 approved; other decisions approved or their affected capabilities explicitly disabled behind tested gates |
| 1 | Tenant, workspace, membership, RBAC, audit | Phase 0 identity/data decisions | Cross-tenant negative tests pass in isolated real Postgres; bounded local compatibility checks pass where supported |
| 2 | Tenant-scoped operational primitives and compatibility | Phase 1 | Existing website play passes parity fixtures through generalized boundaries |
| 3 | Documents, extraction, evidence, claims | Phases 1-2 | Representative materials produce resolvable, reviewable evidence without leakage |
| 4 | Business understanding and adaptive questions | Phase 3 | Approved version and adaptive question loop pass golden fixtures |
| 5 | ICPs and lead plays | Phase 4 | Multiple versioned plays activate only through human gates |
| 6 | Connectors, source runs, accounts, entity resolution | Phases 2 and 5 | Bounded connector run creates provenance-preserving canonical accounts |
| 7 | Contacts, buying centers, qualification, scoring | Phase 6 | Role hypotheses, permissions, scores, and review queues are evidence-backed |
| 8 | Outreach drafts, outcomes, learning proposals | Phases 4, 5, and 7 | Unsupported/suppressed drafts are blocked; no automatic send path exists |
| 9 | Product UI, reporting, and tenant administration | Corresponding backend slices | Authenticated desktop/mobile workflows produce browser evidence |
| 10 | Reliability, compliance, migration, release, cutover | All required feature phases | Staging acceptance, rollback, isolation, and release gates pass |

Parallelism is allowed only between tasks whose dependencies are complete and whose listed write sets do not overlap. Schema migrations, central session types, `permissions.ts`, shared navigation, and compatibility cutover tasks are serialized.

### Task inventory

The backlog contains **318 single-owner task cards**: 18 decision and authority tasks (`D`), 33 tenant/security/data tasks (`T`), 25 generalization/compatibility tasks (`G`), 30 ingestion/evidence tasks (`I`), 26 adaptive-agent tasks (`A`), 20 ICP/lead-play tasks (`P`), 35 connector/account tasks (`C`), 24 buying-center/contact/scoring tasks (`B`), 25 outreach/outcome/learning tasks (`O`), 42 product-workflow/UI tasks (`UI`, including its design gate), and 40 quality/operations/release tasks (`Q`). Every card includes purpose, dependencies, likely files, procedural steps, success criteria, validation evidence, and a stop/escalate rule.

## Blocker-minimization and continuous-execution protocol

This protocol governs implementation orchestration and overrides any interpretation that one unavailable provider, credential, legal approval, or environment should stop unrelated work.

### Blocker classes

| Class | Examples | Orchestrator response |
|---|---|---|
| Global safety or architecture blocker | Contradictory tenant ownership; unresolved auth authority; cross-tenant exposure; destructive or ambiguous migration; repository/worktree mismatch | Pause affected integration immediately; continue only work that cannot encode or conceal the unresolved boundary; obtain the named decision before dependent work resumes |
| Capability activation blocker | Connector terms; target-jurisdiction approval; model data-use approval; malware scanner; CRM credentials; paid-provider budget | Implement the typed adapter, fixture/replay path, policy gate, disabled feature flag, UI blocked state, and tests; continue the rest of the backlog; block only live activation of that capability |
| Environment evidence blocker | No linked Supabase access; no staging tenant; no authenticated browser state; no provider sandbox | Complete local/unit/contract work and record the missing target-perspective evidence; move to the next independent task; return when access is supplied |
| Task-local defect or dependency | Failing focused test, incompatible nearby type, overlapping dirty file, missing dependency receipt | Preserve evidence; route to a repair/dependency task; dispatch a different non-overlapping ready task rather than ending the program |

### Orchestrator continuation rules

1. Maintain ready, blocked, active, review, and accepted queues. A blocked task moves to `blocked` with its exact unblock condition; it does not end the execution goal while any safe ready task exists.
2. Prefer fixtures, provider replays, local storage, deterministic model/tool recordings, and disabled adapters when live access is unavailable. Never represent those as live verification.
3. Land schema and security contracts before consumers. For a capability-activation blocker, land interfaces, policy enforcement, negative tests, and disabled UI before waiting for provider or legal activation.
4. Revisit blocked tasks at each phase gate and after any dependency/authority receipt changes. Do not poll unavailable external state repeatedly.
5. If a task can be decomposed around a blocker without changing product semantics, add child task suffixes to the execution ledger while preserving the parent ID. Do not silently weaken acceptance criteria.
6. Continue through later independent phases when their hard dependencies are accepted. A phase can be `implemented but activation-blocked`; the overall goal remains active until no safe ready work remains.
7. Pause the whole program only for a confirmed or credible tenant-isolation/security incident, unclear destructive target, contradictory source-of-truth contract, unauthorized production/external action that is essential to proceed, or exhaustion of every safe independent task.

### Proposed default decision pack

These conservative defaults are intended to let implementation proceed with minimal rediscovery. They become authoritative only after the product owner approves the pack or records an override. Provider-, jurisdiction-, and production-dependent capabilities remain disabled until their activation evidence exists.

| Decision | Recommended launch default | What remains safely deferrable |
|---|---|---|
| D-001 tenant/workspace | Tenant is one client organization. Workspace is an optional, immutable-tenant subdivision for a brand, region, team, or business unit. Canonical accounts/contacts and source evidence are tenant-wide; strategies, runs, qualification, outreach, and reporting may be workspace-scoped. | Workspace transfer between tenants and cross-tenant shared data are prohibited rather than deferred. |
| D-002 roles | Fixed launch roles: owner, admin, strategist/manager, researcher, reviewer, outreach operator, analyst/read-only. Platform support is grant-based only. Owner/admin may self-approve in a one-person tenant with an explicit audited confirmation; tenant policy can require dual approval. | Custom roles and arbitrary permission bundles. |
| D-003 provisioning | Invite-only tenant creation by an authorized operator; creator assigns the initial verified owner. No self-service signup, billing, or organization transfer at launch. | Self-service and billing-led provisioning. |
| D-004 databases | Postgres is authoritative for all new platform capabilities and isolation evidence. SQLite remains a bounded legacy/local compatibility path and may use test adapters; it does not block Postgres-only platform features. | Full dual-database feature parity and eventual SQLite retirement date. |
| D-005 migration evidence | Develop and rehearse against clean/disposable Postgres immediately. Linked remote migration reconciliation is required before any staging/production migration, not before local implementation. | Remote cutover until authorized read-only access and an isolated rehearsal target exist. |
| D-006 storage/scanning | Private Supabase Storage behind a storage adapter, quarantine-first object state, signed short-lived access, and a pluggable malware-scanner contract. Synthetic/local fixtures may bypass scanning only in test mode. | Production document ingestion activation until an approved scanner and region are configured. |
| D-007 document support | English launch; PDF, DOCX, XLSX/CSV, TXT/Markdown, JPEG/PNG, tenant notes, and bounded authorized URLs. Defaults: 50 MB/file, 500 PDF pages, 100,000 spreadsheet rows, 20 MB/image, encrypted files rejected, unsupported content quarantined with a clear error. | Additional languages, archive formats, audio/video, unusually large catalogs, and handwritten OCR. |
| D-008 evidence policy | Grades: direct source, client-provided, extracted, inferred, corroborated, conflicted, stale, unknown. Absence is never inferred from missing evidence. Technical, regulatory, certification, performance, price, and safety claims require direct/corroborated citations and human review before outreach use. | Tenant-specific reliability weighting and additional regulated claim classes. |
| D-009 model policy | Preserve the existing OpenAI Responses API path for launch behind a provider/model policy registry; no unapproved fallback provider. Use fixtures/replays when data-use approval or credentials are absent. Never send secrets or prohibited personal/customer-list data to a model. | Additional providers/models, sensitive-data classes, and automatic model fallback. |
| D-010 source allowlist | Launch with tenant uploads/lists, tenant-authorized URLs, ordinary public company websites where terms permit, and existing Google Places API access. Every observation keeps source/time/query provenance. | Directories, associations, social networks, people-data vendors, licensed databases, and scraping that requires bypassing controls. |
| D-011 account identity | Tenant-wide canonical account; exact stable provider IDs and normalized domain plus jurisdiction are strong links. Fuzzy/name/address similarity creates review candidates, never irreversible auto-merges. Legal entities/branches remain distinct unless approved; every merge is reversible and provenance-preserving. | More aggressive tenant-tuned entity resolution. |
| D-012 contact use | Launch only with tenant-provided contacts or published business-role contact data from approved sources; no personal email/mobile enrichment. Suppression, opt-out, deletion, source prohibition, and expired permission dominate all other states. | Enrichment vendors, personal channels, and non-approved jurisdictions. |
| D-013 outreach | Email-oriented draft, human approval, copy, and controlled CSV/CRM-style export only. No send transport, mailbox connection, LinkedIn automation, or autonomous approval. Unsupported technical/regulatory/pricing claims are blocked. | Any sending channel or automated sequence. |
| D-014 lifecycle | Default retention: exports 7 days; operational/model logs 30 days; raw connector observations and contact freshness 180 days; active tenant materials/derived records while subscribed or until deletion; primary deletion within 30 days; backups age out within 35 days; minimal redacted security/audit tombstones 7 years. Tenant policy may shorten non-audit periods; legal hold is explicit. | Longer tenant-specific retention and jurisdiction-specific variants pending policy review. |
| D-015 quality gates | Zero cross-tenant disclosures/writes, zero autonomous sends, zero unsupported-claim escape, 100% resolvable citations for claims used in qualification/outreach, at least 99% precision for automatic exact account links, WCAG 2.2 AA for critical journeys, no duplicate durable side effects, and all critical security tests passing. Other quality/cost thresholds start as measurable canary gates, not invented promises. | Calibration targets that require golden-dataset and canary evidence. |
| D-016 launch market | U.S. B2B design partners first; specialty chemicals is the first benchmark fixture/vertical but not a product limitation. No claims of regulatory approval or sector expertise beyond evidence. | Canada, EU/UK, and other jurisdictions until their contact/outreach policy is approved. |
| D-017 CRM boundary | CSV import/export and internal outcome events at launch; no live external CRM is required for product completion. All future CRM integrations use the connector contract. | First live CRM selection and bidirectional synchronization. |
| D-018 execution authority | Full local implementation, tests, disposable local services, and documentation may continue. Branch/commit/push/PR, paid calls, staging/production mutation, account changes, and external communication follow the separately approved authority matrix. | Any authority not explicitly granted. |

## Phase 0 — Blocking decisions and invariant contracts

These are decision-producing tasks. Assign them to a product owner, architect, security/privacy reviewer, or capable planning agent with the required stakeholder input. Cheaper implementation models consume the approved outputs; they do not decide them.

### D-001 — Approve tenant and workspace semantics

- **Purpose:** Define whether workspaces are optional subdivisions and which objects may be tenant-wide.
- **Dependencies:** PRD sections 4, 9 FR-1, 11, 15, and 22.
- **Likely files:** New `docs/architecture/tenant-workspace-contract.md`; no code.
- **Steps:** (1) List every future resource family. (2) Mark tenant-only, workspace-required, or workspace-optional. (3) Define tenant/workspace lifecycle states and transfer rules. (4) Define behavior when a workspace is archived. (5) Obtain product/security approval.
- **Success criteria:** Every resource has one unambiguous ownership rule; no resource can exist without a tenant; archive/delete behavior is explicit.
- **Validation/evidence:** Approved contract table linked from this plan; architecture reviewer signs off.
- **Stop/escalate:** Stop if a workspace might cross tenants or if ownership transfer is requested without audit/consent rules.

### D-002 — Approve launch roles and permission matrix

- **Purpose:** Replace implicit `admin`/`researcher` assumptions with launch RBAC.
- **Dependencies:** D-001 and PRD personas/security sections.
- **Likely files:** New `docs/architecture/rbac-matrix.md`; no code.
- **Steps:** (1) Enumerate owner/admin/manager/researcher/outreach/reviewer/analyst/read-only/platform-support actions. (2) Mark allow/deny per action. (3) Define tenant and workspace scope. (4) Define separation-of-duty gates for play activation, contact use, and outreach approval. (5) Approve defaults.
- **Success criteria:** Every API mutation/read family and UI route maps to named permissions; deny is default.
- **Validation/evidence:** Matrix has no blank cells and includes negative examples.
- **Stop/escalate:** Stop if custom roles are required at launch without a permission-bundle contract.

### D-003 — Approve tenant provisioning model

- **Purpose:** Decide invite-only operator provisioning versus tenant self-service for the first release.
- **Dependencies:** D-001, D-002.
- **Likely files:** New decision record under `docs/decisions/`; no code.
- **Steps:** Compare invite-only and self-service needs; define creator identity, initial owner, email verification, duplicate organization handling, suspension, and recovery; select one launch path; define deferred path.
- **Success criteria:** One provisioning flow is selected with abuse, support, and ownership rules.
- **Validation/evidence:** Product/security decision record with rejected alternative.
- **Stop/escalate:** Stop if billing or account-transfer behavior is required but unspecified.

### D-004 — Approve database and SQLite compatibility horizon

- **Purpose:** Decide how long every feature must support both Postgres and local SQLite.
- **Dependencies:** D-001; current `src/lib/db/index.ts` and recovery contract.
- **Likely files:** New architecture decision record; no code.
- **Steps:** Inventory Postgres-only requirements (RLS, storage, vector/search, cron); define local test/dev needs; select full dual support, bounded emulation, or scheduled SQLite retirement; define phase/date and migration path.
- **Success criteria:** Each future subsystem has a declared local data strategy and tests know which backend is authoritative.
- **Validation/evidence:** Approved matrix covering every Phase 1-8 subsystem.
- **Stop/escalate:** No schema implementation starts if this decision is absent.

### D-005 — Verify migration baseline and choose rehearsal target

- **Purpose:** Establish safe migration evidence before new schema work.
- **Dependencies:** D-004.
- **Likely files:** `docs/architecture/migration-baseline.md`; no migration changes.
- **Steps:** (1) Record local migration list. (2) With authorized read-only access, run `supabase migration list --linked` and `supabase db pull`; if access is absent, mark blocked. (3) Compare historical drift. (4) Select an isolated Supabase rehearsal project or disposable database. (5) Define snapshot/restore owner.
- **Success criteria:** Exact baseline, drift, rehearsal target, and prohibited commands are documented.
- **Validation/evidence:** Timestamped command output or explicit access blocker; no remote mutation.
- **Stop/escalate:** Stop on unrecognized remote-only migrations or any prompt to repair/apply history.

### D-006 — Approve object storage, upload, and malware-scanning providers

- **Purpose:** Select the storage and scanning boundary for private tenant documents.
- **Dependencies:** D-001 and launch deployment constraints.
- **Likely files:** New decision record; no configuration.
- **Steps:** Define size/types/regions; compare Supabase Storage or approved alternative; select quarantine/scanning flow; define encryption, signed URL, retention, deletion, and backup behavior; complete security/privacy review.
- **Success criteria:** One launch storage flow has a data-region, security, lifecycle, and failure contract.
- **Validation/evidence:** Approved provider decision with cost and data-processing constraints.
- **Stop/escalate:** Stop if malware scanning or regional processing cannot meet policy.

### D-007 — Approve launch document formats and extraction quality thresholds

- **Purpose:** Bound ingestion so agents do not implement arbitrary parsers.
- **Dependencies:** D-006.
- **Likely files:** `docs/product/document-support-matrix.md`; no code.
- **Steps:** Select PDF, DOCX, XLSX/CSV, text/Markdown, images/OCR, and URL support; define max size/page/row limits; language scope; table/OCR quality threshold; unsupported/encrypted-file behavior.
- **Success criteria:** Every format has supported/deferred status, limits, parser choice class, and user-facing failure state.
- **Validation/evidence:** Product/security-approved support matrix with sample fixture list.
- **Stop/escalate:** Stop if a parser requires a paid or externally hosted service not approved.

### D-008 — Approve evidence grades and claim-review policy

- **Purpose:** Define what counts as observed, client-provided, inferred, corroborated, conflicted, stale, and unknown.
- **Dependencies:** D-007 and PRD evidence contract.
- **Likely files:** `docs/architecture/evidence-claim-contract.md`; no code.
- **Steps:** Define evidence fields, source reliability tiers, freshness rules, confidence semantics, absence-claim rules, claim classes, and which classes require domain review.
- **Success criteria:** Every claim status transition and review gate is deterministic and testable.
- **Validation/evidence:** Examples include specialty-chemical technical claims and a non-industrial case.
- **Stop/escalate:** Stop if confidence thresholds are used as proof without evidence rules.

### D-009 — Approve model/provider and data-use policy

- **Purpose:** Define which AI providers/models may receive which tenant data.
- **Dependencies:** D-001, D-006, D-008.
- **Likely files:** `docs/architecture/ai-data-policy.md`; no secrets/config.
- **Steps:** Classify data; map allowed model/provider by class; define retention/training settings, region, redaction, prompt logging, fallback, and no-provider behavior; define model change approval.
- **Success criteria:** Every agent role has an allowed data envelope and provider/model policy.
- **Validation/evidence:** Security/privacy approval and explicit forbidden data examples.
- **Stop/escalate:** Stop if provider contract or data retention is unknown.

### D-010 — Approve source connector launch allowlist

- **Purpose:** Bound discovery integrations and compliance.
- **Dependencies:** D-001 and legal/source review.
- **Likely files:** `docs/product/source-connector-allowlist.md`; no connector calls.
- **Steps:** List Google Places, customer uploads, customer-authorized URLs, public company websites, directories, associations, licensed providers, and CRM candidates; document terms, permitted operations, stored fields, personal data, retention, cost, and launch/deferred status.
- **Success criteria:** At least one launch connector is approved; every other source is explicitly blocked or deferred.
- **Validation/evidence:** Legal/product-approved source cards with review dates.
- **Stop/escalate:** Unknown terms or scraping requirements block the connector.

### D-011 — Approve account identity and merge policy

- **Purpose:** Define canonical account identity without collapsing distinct entities.
- **Dependencies:** D-010.
- **Likely files:** `docs/architecture/account-resolution-policy.md`; no code.
- **Steps:** Rank stable IDs, domains, names, addresses, phone, corporate registration, and source IDs; define parent/subsidiary/branch handling; auto-link thresholds; manual merge/unmerge; conflict and audit requirements.
- **Success criteria:** Deterministic match tiers and reversible merge rules cover ambiguous examples.
- **Validation/evidence:** Golden duplicate/non-duplicate fixture table approved by product/data reviewer.
- **Stop/escalate:** Stop if a proposed merge discards observations or crosses tenants.

### D-012 — Approve contact permitted-use, consent, and suppression policy

- **Purpose:** Prevent contact research and draft generation from outrunning legal policy.
- **Dependencies:** D-002, D-010, target jurisdictions.
- **Likely files:** `docs/compliance/contact-use-policy.md`; no code.
- **Steps:** Define business-contact data classes, source authorization, lawful basis/customer responsibility, freshness, channel eligibility, opt-out, bounce, do-not-contact, deletion, and precedence rules.
- **Success criteria:** One deterministic state machine decides whether a contact can be researched, drafted for, exported, or blocked.
- **Validation/evidence:** Legal/privacy approval and scenario table for suppression conflicts.
- **Stop/escalate:** No contact enrichment or outreach task begins without approval.

### D-013 — Approve outreach launch boundary and claim policy

- **Purpose:** Lock the product to human-approved drafts/copy/export and define prohibited claims.
- **Dependencies:** D-008, D-012.
- **Likely files:** `docs/compliance/outreach-policy.md`; no code.
- **Steps:** Define allowed channels/actions; require human approval; list prohibited technical/regulatory/pricing/performance/personalization claims; define citation display, opt-out language, frequency/quiet-hour policy, and copy/export audit event.
- **Success criteria:** Automatic send is explicitly absent; every draft transition and policy block is testable.
- **Validation/evidence:** Product/legal approval with allowed/blocked sample messages.
- **Stop/escalate:** Any request for automatic sending becomes a separate approved program.

### D-014 — Approve retention, export, deletion, and audit-retention policy

- **Purpose:** Define lifecycle across database, object storage, cache, embeddings, logs, backups, and audit tombstones.
- **Dependencies:** D-001, D-006, D-009, D-012.
- **Likely files:** `docs/compliance/data-lifecycle-policy.md`; no code.
- **Steps:** Define retention by data class; tenant-configurable bounds; legal holds; export contents; deletion SLA; backup expiration; audit tombstone minimum; provider deletion propagation.
- **Success criteria:** Every future data concept in PRD section 15 has an owner, retention, export, and delete rule.
- **Validation/evidence:** Security/privacy/legal approval and deletion-flow diagram.
- **Stop/escalate:** Stop if audit and deletion requirements conflict without counsel resolution.

### D-015 — Approve launch quality thresholds and phase gates

- **Purpose:** Turn PRD metrics into pass/fail release thresholds.
- **Dependencies:** D-005, D-007 through D-014.
- **Likely files:** `docs/product/launch-quality-gates.md`; no code.
- **Steps:** Set thresholds for evidence coverage/citation resolution, extraction quality, account precision/merge error, question usefulness, scoring agreement, unsupported-claim escape, worker reliability, p95 latency, cost per qualified account, accessibility, and isolation.
- **Success criteria:** Every phase has numeric or binary entry/exit criteria and a named approver.
- **Validation/evidence:** Product/engineering/security sign-off; unresolved thresholds are explicit launch blockers.
- **Stop/escalate:** Do not replace missing thresholds with a model's guess.

### D-016 — Approve the initial segment, jurisdictions, and launch cohort

- **Purpose:** Bound the first real-world policy and quality target so implementation does not pretend one compliance model fits every market.
- **Dependencies:** D-010, D-012, D-013, and PRD success metrics/open questions.
- **Likely files:** `docs/product/launch-cohort-contract.md`; no code or customer enrollment.
- **Steps:** Select the first customer segment and benchmark vertical; list launch jurisdictions; define internal/design-partner/paid cohort boundaries; identify data/contact/outreach exclusions; name the product, legal/privacy, and support owners; state what evidence is required before adding another jurisdiction.
- **Success criteria:** One launch cohort has an explicit segment, jurisdiction list, policy scope, support owner, and expansion gate; unapproved markets fail closed.
- **Validation/evidence:** Product-owner approval plus legal/privacy review requirement recorded for any live contact/outreach activation.
- **Stop/escalate:** Missing jurisdiction does not stop tenant/knowledge/strategy implementation; it blocks live contact/outreach activation and enrollment in that jurisdiction only.

### D-017 — Approve the launch CRM and integration boundary

- **Purpose:** Prevent an unspecified CRM from blocking the canonical account/contact/outcome model.
- **Dependencies:** D-010, D-011, D-012, and the PRD API/integration section.
- **Likely files:** `docs/product/launch-integration-boundary.md`; no provider calls or configuration.
- **Steps:** Select file import/export, webhook, or named CRM scope; define system-of-record ownership for accounts, contacts, suppressions, outcomes, and field conflicts; define idempotency/deletion behavior; either approve one launch connector or explicitly defer all live CRM integrations behind the connector contract.
- **Success criteria:** Core product completion has no implicit CRM dependency; any selected integration has a bounded direction, authority, data map, and failure contract.
- **Validation/evidence:** Product/data-owner decision record with deferred providers listed explicitly.
- **Stop/escalate:** An unavailable CRM blocks only its adapter and activation; canonical product workflows continue with fixtures and file import/export.

### D-018 — Approve the implementation execution-authority matrix

- **Purpose:** Let the orchestrator run continuously without repeatedly asking for the same class of safe action while preserving external and destructive boundaries.
- **Dependencies:** Repository/worktree and account owners identified.
- **Likely files:** `docs/decisions/implementation-authority.md`; no account, repository, deployment, or provider mutation in this task.
- **Steps:** Mark allowed/approval-required/prohibited for local edits, dependency installation, disposable local databases/storage, local browser mutation, branch creation, commits, push, pull request, CI changes, test/staging deployment, paid provider calls with caps, linked database read-only checks, remote migrations, production deployment, customer-data use, user enrollment, and outreach; name approver and reusable limits for each approved class.
- **Success criteria:** The orchestrator can distinguish reusable authorization from one-time approval; no secret or destructive/external action is inferred from general implementation authority.
- **Validation/evidence:** Product/repository owner signs the matrix; environment-specific approvals name target and spending/mutation limits.
- **Stop/escalate:** Lack of remote authority never stops safe local work; pause only when all remaining ready tasks require an ungranted boundary.

## Task backlog

The remaining sections contain implementation tasks. IDs are stable; do not renumber them after work begins. A task may be split only by updating this plan and preserving the original ID as a parent.

## Phase 1 tasks — Tenant, workspace, RBAC, audit, and lifecycle foundation

### T-001 — Create tenant-domain TypeScript contracts

- **Purpose:** Establish one typed vocabulary before schema/UI work.
- **Dependencies:** D-001, D-002, D-003.
- **Likely files:** New `src/lib/tenancy/types.ts`, `src/lib/tenancy/schemas.ts`, focused tests.
- **Steps:** Define tenant/workspace/member/role/lifecycle types from approved records; add strict Zod schemas for IDs and mutation inputs; export no database functions; add valid/invalid fixture tests.
- **Success criteria:** Types contain no website/Google/Colorado assumptions; invalid IDs, roles, and states are rejected.
- **Validation/evidence:** Focused Vitest file plus `npm run typecheck`.
- **Stop/escalate:** Stop if approved decision values do not match one another.

### T-002 — Add Postgres tenant tables migration

- **Purpose:** Create tenant records and lifecycle fields in Postgres.
- **Dependencies:** T-001, D-005.
- **Likely files:** One new timestamped `supabase/migrations/*.sql`; SQL verification fixture/script if established.
- **Steps:** Add `tenants` with explicit primary key, slug/name, status, locale/timezone, timestamps, and constraints from D-001/D-003; add indexes; add comments where semantics are non-obvious; do not apply remotely.
- **Success criteria:** Migration applies cleanly to the approved empty/rehearsal baseline and rejects invalid status/duplicate slug.
- **Validation/evidence:** Transactional migration rehearsal output and schema inspection; `git diff --check`.
- **Stop/escalate:** No remote apply; stop on migration-history mismatch.

### T-003 — Add SQLite tenant schema

- **Purpose:** Mirror T-002 in the supported local backend.
- **Dependencies:** T-002, D-004 requiring SQLite support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Add equivalent table, constraints representable in SQLite, indexes, and additive migration handling; avoid silently swallowing non-duplicate migration errors; create schema parity assertions.
- **Success criteria:** Fresh and upgraded SQLite databases expose the approved tenant columns and constraints.
- **Validation/evidence:** Focused DB tests on fresh and pre-change fixtures; `npm run typecheck`.
- **Stop/escalate:** If D-004 retires SQLite for this subsystem, replace with an explicit unsupported-backend guard task.

### T-004 — Add Postgres workspace tables migration

- **Purpose:** Store optional tenant subdivisions without weakening ownership.
- **Dependencies:** T-002.
- **Likely files:** One new Postgres migration.
- **Steps:** Add `workspaces` with tenant foreign key, tenant-scoped slug uniqueness, status, timestamps, and archive semantics; add compound indexes and foreign keys; prevent cross-tenant relationship targets by design.
- **Success criteria:** Same slug may exist in different tenants but not twice in one tenant; orphan workspace is impossible.
- **Validation/evidence:** Migration rehearsal and constraint-negative SQL checks.
- **Stop/escalate:** Stop if workspace transfer between tenants is requested.

### T-005 — Add SQLite workspace schema

- **Purpose:** Mirror T-004 locally.
- **Dependencies:** T-003, T-004, D-004 requiring SQLite support.
- **Likely files:** `src/lib/db/schema.ts`, DB schema tests.
- **Steps:** Add table/indexes/foreign key; add upgrade path; add same-tenant uniqueness tests and archive-state tests.
- **Success criteria:** SQLite behavior matches the approved ownership contract.
- **Validation/evidence:** Focused fresh/upgrade DB tests.
- **Stop/escalate:** Stop on parity behavior that cannot be emulated and record a D-004 amendment need.

### T-006 — Add tenant membership and role tables in Postgres

- **Purpose:** Decouple authentication identity from tenant authorization.
- **Dependencies:** T-002, T-004, D-002.
- **Likely files:** One Postgres migration.
- **Steps:** Add memberships with tenant, optional workspace scope per D-002, auth/app user identity, role or role-binding, status, inviter, timestamps, and unique constraints; add indexes for session lookup; avoid storing credentials.
- **Success criteria:** One user can hold approved memberships without duplicate active bindings; disabled/pending states are enforceable.
- **Validation/evidence:** Migration rehearsal and positive/negative constraint queries.
- **Stop/escalate:** Stop if custom roles are requested without D-002 update.

### T-007 — Add tenant membership and role schema in SQLite

- **Purpose:** Mirror T-006 locally.
- **Dependencies:** T-005, T-006, D-004 requiring SQLite support.
- **Likely files:** `src/lib/db/schema.ts`, DB tests.
- **Steps:** Add equivalent tables, indexes, upgrade columns, foreign keys, and membership fixtures; test duplicate and inactive states.
- **Success criteria:** Local session fixtures can represent at least two tenants and every launch role.
- **Validation/evidence:** Focused DB tests.
- **Stop/escalate:** Stop if auth-user foreign keys cannot be represented; document the local surrogate contract rather than omitting identity checks.

### T-008 — Add tenant-scoped policy settings schema

- **Purpose:** Replace global settings assumptions with tenant policy records.
- **Dependencies:** T-002, T-003, D-014.
- **Likely files:** Postgres migration, `src/lib/db/schema.ts`, tenancy schemas/tests.
- **Steps:** Add one tenant policy/settings table with locale/timezone, retention profile, AI/source/outreach flags, review gates, and version; keep secrets in approved secret storage, not policy JSON; add strict default creation behavior.
- **Success criteria:** Each tenant has one current policy; missing/unknown keys fail safely; global legacy settings remain readable during compatibility.
- **Validation/evidence:** Both-backend schema tests and invalid-policy tests.
- **Stop/escalate:** Do not store connector credentials or arbitrary unvalidated JSON.

### T-009 — Create tenant query repository

- **Purpose:** Provide bounded data access for tenants/workspaces/memberships.
- **Dependencies:** T-003, T-005, T-007, T-008.
- **Likely files:** New `src/lib/tenancy/queries.ts`, focused query tests.
- **Steps:** Implement create/read/list/status methods using current `DbClient`; require tenant context on workspace/member reads; use transactions for provisioning; return typed domain objects; add two-tenant fixtures.
- **Success criteria:** No method can list tenant-owned records without an explicit tenant ID except platform-authorized lookup functions named as such.
- **Validation/evidence:** Focused SQLite tests and Postgres contract query review.
- **Stop/escalate:** Stop before adding a convenience method that bypasses tenant scope.

### T-010 — Add tenant provisioning service

- **Purpose:** Atomically create tenant, default workspace/policy, and owner membership.
- **Dependencies:** T-009, D-003.
- **Likely files:** New `src/lib/tenancy/provisioning.ts`, tests.
- **Steps:** Validate request; run one transaction; create records in approved order; make operation idempotent with request key; emit audit through a later-compatible interface; roll back on failure.
- **Success criteria:** Retry returns the same tenant and creates no duplicates; partial failure leaves no orphan records.
- **Validation/evidence:** Transaction rollback/idempotency tests.
- **Stop/escalate:** Do not expose self-service if D-003 selected operator-only provisioning.

### T-011 — Extend application session with tenant context

- **Purpose:** Make active tenant/workspace explicit in every authenticated request.
- **Dependencies:** T-006 through T-010.
- **Likely files:** `src/lib/auth.ts`, `src/lib/app-users.ts`, session/auth tests.
- **Steps:** Resolve active membership after Supabase user lookup; include tenant ID, optional workspace ID, membership ID, and role; fail closed for no/pending/disabled membership; define multi-membership selection behavior from D-001/D-003.
- **Success criteria:** Session never fabricates tenant scope; disabled membership cannot authenticate into tenant routes; current migrated user can resolve the compatibility tenant.
- **Validation/evidence:** Positive/negative/multi-tenant session tests and `npm run typecheck`.
- **Stop/escalate:** Stop if active-tenant selection UX/API contract is absent.

### T-012 — Replace two-role permission constants with approved permission matrix

- **Purpose:** Encode D-002 in one pure authorization module.
- **Dependencies:** T-001, D-002.
- **Likely files:** `src/lib/permissions.ts`, `src/lib/__tests__/permissions.test.ts`.
- **Steps:** Define granular permissions by resource/action; map each launch role; keep legacy role aliases only through explicit compatibility mapping; add exhaustive allow/deny table tests.
- **Success criteria:** Every matrix cell is tested; unknown role/permission denies; no route-specific policy is hidden in UI code.
- **Validation/evidence:** Focused exhaustive unit test and typecheck.
- **Stop/escalate:** Central permission file is serialized; stop if another task changes it concurrently.

### T-013 — Add tenant-context authorization helpers

- **Purpose:** Combine session permission and resource tenant ownership checks.
- **Dependencies:** T-011, T-012.
- **Likely files:** New `src/lib/tenancy/authorize.ts`, auth tests.
- **Steps:** Implement `requireTenantSession`, `requireTenantPermission`, workspace-scope check, and resource-tenant assertion; return 401 vs 403 consistently; avoid existence leaks for cross-tenant IDs.
- **Success criteria:** Cross-tenant resource probes fail without revealing whether the object exists.
- **Validation/evidence:** Two-tenant negative tests covering read and mutation.
- **Stop/escalate:** Do not accept tenant ID only from request input without matching session membership.

### T-014 — Add request-scoped tenant context

- **Purpose:** Make tenant scope available to audit/log/query helpers without mutable globals.
- **Dependencies:** T-011, T-013.
- **Likely files:** New `src/lib/tenancy/context.ts`, existing audit/runtime context integration, tests.
- **Steps:** Use `AsyncLocalStorage` or approved request mechanism; set context only after authorization; expose read/assert helpers; clear automatically per request; test concurrent tenant requests.
- **Success criteria:** Concurrent requests cannot observe each other's tenant context; missing context fails loudly in tenant-only operations.
- **Validation/evidence:** Concurrency/isolation unit tests.
- **Stop/escalate:** Never use a module-level mutable tenant variable.

### T-015 — Add tenant IDs to audit events

- **Purpose:** Make every tenant action attributable without cross-tenant log ambiguity.
- **Dependencies:** T-002/T-003, T-014, D-014.
- **Likely files:** Postgres migration, `src/lib/db/schema.ts`, `src/lib/audit-context.ts`, `src/lib/db/queries.ts` audit functions, tests.
- **Steps:** Add tenant/workspace/correlation fields; populate from request/worker context; define platform-only events; update indexes and serialization; preserve existing rows as compatibility/platform scope according to backfill contract.
- **Success criteria:** New tenant events always contain tenant ID; platform events are explicitly typed; existing audit views still load.
- **Validation/evidence:** Both-backend tests and example audit row from a tenant action.
- **Stop/escalate:** Stop if nullable tenant rows could represent tenant actions silently.

### T-016 — Tenant-scope operational logs and redaction

- **Purpose:** Add useful correlation without leaking tenant content.
- **Dependencies:** T-014, T-015.
- **Likely files:** `src/lib/operational-logging.ts`, `src/lib/runtime-log-context.ts`, tests.
- **Steps:** Add tenant/workspace/correlation/run IDs; hash or omit disallowed identifiers; extend sensitive-key redaction for documents, contacts, tokens, prompts, and source content; test nested metadata.
- **Success criteria:** Logs support per-tenant incident tracing but contain no secrets, raw document content, contact details, or prompt bodies.
- **Validation/evidence:** Redaction fixture tests and captured sanitized event.
- **Stop/escalate:** Stop if observability vendor/data policy is required but undecided.

### T-017 — Tenant-scope internal worker authentication context

- **Purpose:** Prevent cron/service authorization from becoming global tenant access.
- **Dependencies:** T-013, T-014.
- **Likely files:** `src/lib/internal-worker-auth.ts`, `src/lib/internal-worker-route.ts`, worker auth tests.
- **Steps:** Require worker payload/run to identify tenant; resolve allowed tenant from signed/queued record, not arbitrary header alone; set request context; preserve session fallback with tenant permission; reject mismatches.
- **Success criteria:** A valid cron secret cannot process an arbitrary tenant ID without a valid queued/run object for that tenant.
- **Validation/evidence:** Cross-tenant forged-payload tests and existing worker auth regression tests.
- **Stop/escalate:** Do not broaden cron secrets or include them in logs.

### T-018 — Add tenant-safe identifier/cache-key helpers

- **Purpose:** Prevent accidental key collisions in caches, idempotency, and storage.
- **Dependencies:** T-001.
- **Likely files:** New `src/lib/tenancy/keys.ts`, tests.
- **Steps:** Define validated tenant/workspace prefixes for cache, object storage, idempotency, and jobs; hash user-provided components; reject traversal/empty IDs; document formats as internal contracts.
- **Success criteria:** Identical resource IDs in two tenants produce different keys; unsafe path components are rejected.
- **Validation/evidence:** Table-driven tests.
- **Stop/escalate:** Do not expose raw secret or personal values in keys.

### T-019 — Add tenant feature-flag service

- **Purpose:** Gate the new platform and compatibility paths by tenant.
- **Dependencies:** T-008, T-009.
- **Likely files:** New `src/lib/tenancy/features.ts`, tests.
- **Steps:** Define typed flags for platform phases; resolve tenant override with safe global default; prohibit request-controlled flags; audit high-risk flag changes through service boundary.
- **Success criteria:** Unconfigured tenants remain on legacy-safe behavior; disabled features cannot be invoked by direct route calls.
- **Validation/evidence:** Resolution and direct-call denial tests.
- **Stop/escalate:** Do not use environment flags as a substitute for per-tenant authorization.

### T-020 — Add platform support-access grant schema

- **Purpose:** Represent time-bound, reason-coded support elevation separately from tenant membership.
- **Dependencies:** D-002, D-014, T-002/T-003.
- **Likely files:** Postgres migration, `src/lib/db/schema.ts`, types/tests.
- **Steps:** Add grant target, platform actor, requested/approved by, reason, allowed scopes, start/expiry/revocation, and audit link; prevent self-approval if D-002 requires separation.
- **Success criteria:** Expired/revoked grants cannot authorize access; no permanent wildcard grant exists.
- **Validation/evidence:** Constraint and expiry tests on both supported backends.
- **Stop/escalate:** Stop if platform identity model is undefined.

### T-021 — Implement support-access authorization service

- **Purpose:** Enforce T-020 with explicit tenant visibility and audit.
- **Dependencies:** T-013, T-015, T-020.
- **Likely files:** New `src/lib/tenancy/support-access.ts`, tests.
- **Steps:** Create/request/approve/revoke/check grants; require approved permissions; set support actor plus target tenant context; write immutable events; expose current grants to tenant admin queries.
- **Success criteria:** Access denies outside time/scope and every attempt is audited; tenant admin can see active/history records.
- **Validation/evidence:** Authorization/time-travel tests and audit-row assertions.
- **Stop/escalate:** No silent “super admin” bypass.

### T-022 — Add tenant lifecycle state service

- **Purpose:** Centralize suspend/archive/reactivate rules.
- **Dependencies:** T-009, D-014.
- **Likely files:** New `src/lib/tenancy/lifecycle.ts`, tests.
- **Steps:** Define allowed transitions; block tenant workers/mutations on suspension; allow approved read/export behavior; require reason/actor; transactionally update state and audit.
- **Success criteria:** Invalid transitions fail; suspended tenant cannot start new work; archive behavior matches D-001/D-014.
- **Validation/evidence:** State-machine tests and direct-worker denial test.
- **Stop/escalate:** Deletion is not an archive transition; use dedicated deletion jobs.

### T-023 — Add tenant export job schema and state machine

- **Purpose:** Represent asynchronous, auditable exports without doing export work in a request.
- **Dependencies:** T-002/T-003, D-014.
- **Likely files:** Postgres migration, SQLite schema, new types/state-machine tests.
- **Steps:** Add job scope, requester, status, format/version, snapshot time, storage reference, expiry, counts/checksum, error, and lease fields; define transitions and idempotency key.
- **Success criteria:** Duplicate request key returns same job; completed artifact expires; failed/retry states are explicit.
- **Validation/evidence:** Both-backend state tests.
- **Stop/escalate:** No export artifact may be placed in a public path.

### T-024 — Add tenant deletion/retention job schema and state machine

- **Purpose:** Track staged deletion across all data stores.
- **Dependencies:** T-002/T-003, D-014.
- **Likely files:** Postgres migration, SQLite schema, lifecycle types/tests.
- **Steps:** Add request/approval, legal-hold check, scheduled/started/completed/failed states, per-store checkpoints, tombstone, retries, and correlation; define cancel window if approved.
- **Success criteria:** Job cannot complete until every required store checkpoint is complete or explicitly exempted; retry is idempotent.
- **Validation/evidence:** State transition and partial-failure tests.
- **Stop/escalate:** Never hard-delete directly from a tenant UI action.

### T-025 — Create canonical two-tenant test fixtures

- **Purpose:** Give every later task cheap, repeatable isolation fixtures.
- **Dependencies:** T-003/T-005/T-007/T-008.
- **Likely files:** `src/lib/__tests__/test-helpers.ts` or new `src/test/tenants.ts`, tests.
- **Steps:** Build tenant A/B, workspaces, users for each role, overlapping resource IDs/names, suspended membership, support grant; expose setup/cleanup helpers; avoid real personal data.
- **Success criteria:** Fixtures are deterministic, isolated per test, and usable with SQLite plus approved Postgres test harness.
- **Validation/evidence:** Self-test proves no shared IDs/rows except intentional platform fixtures.
- **Stop/escalate:** Do not put production credentials or customer data in fixtures.

### T-026 — Add tenant authorization contract test suite

- **Purpose:** Prove UI-independent permission and ownership behavior.
- **Dependencies:** T-012/T-013/T-025.
- **Likely files:** New `src/lib/__tests__/tenant-authorization.test.ts`.
- **Steps:** Generate role/action matrix tests; test no session, pending, disabled, wrong tenant, wrong workspace, expired support grant, and allowed cases; verify non-enumerating errors.
- **Success criteria:** 100% of D-002 matrix covered; every denied action has a negative test.
- **Validation/evidence:** Focused test output and matrix coverage report/table.
- **Stop/escalate:** Gaps in D-002 block test completion; do not infer them.

### T-027 — Add isolated Postgres RLS policies for tenant foundation

- **Purpose:** Enforce database-layer defense in depth.
- **Dependencies:** T-002/T-004/T-006/T-008/T-020, D-005.
- **Likely files:** One new Postgres migration, RLS integration tests/scripts.
- **Steps:** Enable/force RLS where appropriate; define authenticated policies through approved claims/session strategy; keep service access least-privileged; deny anon; add policies for tenant/workspace/member/policy/support tables.
- **Success criteria:** Tenant A cannot select/insert/update/delete tenant B rows; anon gets none; approved service operation requires explicit tenant scope.
- **Validation/evidence:** Isolated Supabase/Postgres test transcript for all CRUD verbs.
- **Stop/escalate:** Do not apply to production; stop if JWT claim strategy is unresolved.

### T-028 — Build compatibility-tenant backfill migration

- **Purpose:** Attach existing users and legacy data to one controlled compatibility tenant without data loss.
- **Dependencies:** T-002 through T-008, D-005, approved compatibility identity.
- **Likely files:** One forward-only Postgres migration; SQLite migration/backfill function; tests.
- **Steps:** Create deterministic compatibility tenant/workspace; map existing app users to memberships/roles; add nullable tenant columns only where scheduled; backfill in batches/transactions; record counts; keep rollback via snapshot, not down-migration.
- **Success criteria:** Row/user counts reconcile; rerun is idempotent; no existing relationship is orphaned or reassigned across owners.
- **Validation/evidence:** Rehearsal copy before/after counts and checksum/query receipt.
- **Stop/escalate:** Stop on unknown user IDs, duplicate mappings, or migration drift.

### T-029 — Update recovery contract for tenant foundation tables

- **Purpose:** Make new foundation data exportable/restorable before features depend on it.
- **Dependencies:** T-023/T-024/T-028.
- **Likely files:** `scripts/data-transfer-contract.mjs`, export/import/verification tests, `docs/DATA_RECOVERY.md`.
- **Steps:** Add tables in FK-safe order; exclude secrets; add tenant integrity checks; version manifest; document Auth/Storage exclusions; add dry-run restore fixture.
- **Success criteria:** Recovery verification detects missing tenant rows, cross-tenant foreign keys, protected fields, and checksum/count mismatch.
- **Validation/evidence:** `npm run db:verify:recovery` plus focused transfer tests.
- **Stop/escalate:** Do not claim Storage recovery until a separate storage backup task exists.

### T-030 — Install transaction-local Postgres tenant context and restricted runtime role

- **Purpose:** Ensure pooled server SQL cannot bypass tenant RLS or retain another request's context.
- **Dependencies:** D-005, T-013/T-014, verified Supabase connection mode.
- **Likely files:** `src/lib/db/index.ts`, `.env.example`, deployment docs, Postgres-client tests.
- **Steps:** Verify actual runtime role/table ownership/`BYPASSRLS`; provision or document a non-owner/non-bypass application role in isolated rehearsal; add `withTenantDbContext` transaction wrapper; set tenant/workspace/actor/support grant with transaction-local `set_config`; require tenant queries inside wrapper; assert SQLite scope; test pooled concurrent requests.
- **Success criteria:** No scoped query executes before context installation; transaction completion clears context; runtime role is proven non-owner/non-bypass.
- **Validation/evidence:** Postgres integration tests plus `current_user`/role-attribute/table-owner receipt from isolated target.
- **Stop/escalate:** Stop if only owner/service/bypass role is available or transaction boundaries cannot contain an operation.

### T-031 — Implement tenant membership administration service

- **Purpose:** Replace global user-role/status mutation with tenant memberships.
- **Dependencies:** T-009/T-012/T-013, D-002.
- **Likely files:** New `src/lib/tenancy/memberships.ts`, later users-action adapters, tests.
- **Steps:** List/invite/update/disable/reactivate/remove memberships; preserve Auth identity/other tenants; enforce workspace scope, last-owner, self-demotion, ownership transfer, and pending invite rules; audit before/after.
- **Success criteria:** Removing user from tenant A leaves tenant B and Auth identity intact; final owner cannot be removed/demoted without approved transfer.
- **Validation/evidence:** Two-tenant/last-owner/concurrency tests.
- **Stop/escalate:** Ordinary membership removal must not call `auth.admin.deleteUser`.

### T-032 — Add tenant-aware rate-limit and kill-switch service

- **Purpose:** Prevent one tenant or actor from exhausting shared capacity.
- **Dependencies:** T-008/T-014/T-019/T-022.
- **Likely files:** New `src/lib/tenancy/limits.ts`, tests.
- **Steps:** Define platform hard and tenant policy limits; key by tenant/actor/action; cover invites, support grants, uploads, exports/deletion requests, worker starts, and expensive plans; provide tenant/platform kill switches; audit changes; return non-leaking retry metadata.
- **Success criteria:** Tenant A saturation does not consume tenant B allowance; suspended/killed tenant starts no new work; horizontally safe backend is used.
- **Validation/evidence:** Concurrent two-tenant and kill propagation tests.
- **Stop/escalate:** Process-memory-only limiting is not acceptable for scaled production.

### T-033 — Phase 1 tenant-isolation acceptance gate

- **Purpose:** Block dependent work until foundation is proven from target perspectives.
- **Dependencies:** T-001 through T-032 applicable to approved launch scope.
- **Likely files:** Test/receipt docs only unless defects are found; defects become separate tasks.
- **Steps:** Run focused suites, full typecheck/lint/test, fresh/upgrade SQLite, isolated Postgres migration/RLS CRUD, session role matrix, support expiry, suspension, audit/log redaction, recovery dry-run; capture real records/payloads.
- **Success criteria:** Zero cross-tenant access across all tested verbs/layers; compatibility tenant loads existing workflow; all Phase 1 thresholds from D-015 pass.
- **Validation/evidence:** Named acceptance receipt under `docs/validation/` plus command outputs and sanitized record examples.
- **Stop/escalate:** Any leakage, orphan, unaudited elevation, or unrehearsed migration fails the phase.

## Phase 2 tasks — Tenant-scope existing primitives and preserve the website-lead compatibility play

### G-001 — Produce legacy-table tenant ownership map

- **Purpose:** Prevent partial scoping of the current 23-table recovery contract.
- **Dependencies:** D-001, T-033.
- **Likely files:** New `docs/architecture/legacy-tenant-ownership-map.md`; no code.
- **Steps:** List every current table, query family, route, worker, cache, export, and setting; classify tenant-owned/platform-owned/derived; name parent ownership path; identify current global reads; obtain architecture/security review.
- **Success criteria:** Every current table and entry point has one tenant ownership rule and migration order.
- **Validation/evidence:** Map reconciles exactly with `src/lib/db/schema.ts`, migrations, API routes, and recovery contract.
- **Stop/escalate:** Any unclassified table blocks G-002 onward for that domain.

### G-002 — Add tenant scope to market access and crawl tables in Postgres

- **Purpose:** Tenant-scope market-access grants, runs, and units while preserving ZIP, market, and cell definitions as platform reference data.
- **Dependencies:** G-001, D-005.
- **Likely files:** One forward-only Postgres migration.
- **Steps:** Leave `zip_codes`, `location_markets`, and `location_cells` without tenant columns; add/backfill required tenant scope and optional validated workspace narrowing on `user_market_access` and `crawl_runs`; copy the run's exact tenant/workspace scope into `crawl_units`; add tenant-inclusive grant/run/unit constraints and indexes; preserve market/cell references as non-authorizing platform references; treat `crawl_units.zip` as a compatibility token and require a `zip_codes` relationship only for explicitly ZIP-mode legacy units; stage `NOT NULL` only after reconciliation.
- **Success criteria:** Two tenants can use the same platform market/cell definitions without duplicating them or gaining authority from them; every access grant and crawl row is tenant-isolated; every unit exactly matches its parent run's tenant and nullable workspace.
- **Validation/evidence:** Fresh and upgrade rehearsal counts; schema inspection proving no tenant columns on ZIP/market/cell reference tables; two-tenant same-reference tests; cross-tenant membership/workspace/grant/run/unit negative queries; generalized non-ZIP cell regression.
- **Stop/escalate:** Stop on an ambiguous access-grant owner, crawl parent, compatibility ZIP mode, or workspace derivation. Never assign tenant ownership to a platform reference row as a fallback.

### G-003 — Add tenant scope to leads and CRM tables in Postgres

- **Purpose:** Tenant-scope existing prospects and operator work.
- **Dependencies:** G-002, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add/backfill tenant IDs to `leads`, `lead_notes`, `outreach_events`, `admin_requests`, and `demos`; derive child tenant from lead; add compound indexes/FKs; preserve public demo isolation through explicit published lookup policy.
- **Success criteria:** No child row can reference a lead in another tenant; public demo lookup returns only approved published artifact fields.
- **Validation/evidence:** Rehearsal reconciliation and cross-tenant child-insert failures.
- **Stop/escalate:** Stop if any child references a missing lead.

### G-004 — Add tenant scope to AI tables and link the platform worker envelope

- **Purpose:** Prevent cross-tenant model context, usage, and queue processing.
- **Dependencies:** G-003, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add/backfill tenant IDs to `ai_lead_verifications`, `lead_ai_artifacts`, `ai_feedback_events`, and `ai_usage_events`; derive from the already tenant-scoped lead/run; add tenant/status lease indexes; leave `worker_runs` without tenant ownership and link tenant execution to that platform scheduler/health envelope only through immutable job/run/lease correlation with no tenant payload or authority copied into the platform row.
- **Success criteria:** Every AI artifact, feedback, usage event, and tenant execution detail resolves to one tenant; `worker_runs` remains a bounded non-content platform envelope and cannot supply tenant authority.
- **Validation/evidence:** Rehearsal orphan report is empty; queue indexes inspected; worker-envelope schema has no tenant ownership column; two-tenant correlation tests prove a platform worker row cannot select, broaden, or expose tenant work.
- **Stop/escalate:** Stop if tenant execution cannot be linked without putting tenant-owned content or caller-supplied authority into `worker_runs`.

### G-005 — Add tenant scope to source/cache/usage tables in Postgres

- **Purpose:** Remove cross-tenant cache and observation ambiguity.
- **Dependencies:** G-004, D-005, D-010.
- **Likely files:** One Postgres migration.
- **Steps:** Scope `place_cache`, `places_master`, `place_observations`, and `api_usage_events` according to G-001; decide whether raw provider observations can be shared (default no); add tenant-inclusive cache keys, source IDs, and usage indexes.
- **Success criteria:** Identical Google place IDs in two tenants cannot leak cached raw data or usage attribution.
- **Validation/evidence:** Two-tenant same-place rehearsal and cache-key inspection.
- **Stop/escalate:** Any shared provider cache requires a separate approved de-identification/licensing design.

### G-006 — Mirror legacy tenant columns in SQLite

- **Purpose:** Keep local schema compatible with G-002 through G-005 when D-004 requires it.
- **Dependencies:** G-002 through G-005.
- **Likely files:** `src/lib/db/schema.ts`, SQLite migration helpers, schema tests.
- **Steps:** Add columns and indexes in FK-safe groups; create deterministic compatibility tenant before backfill; rebuild tables only where constraint changes require it; test interrupted upgrade recovery.
- **Success criteria:** Fresh and upgraded SQLite have no tenantless tenant-owned row and retain all current data.
- **Validation/evidence:** Before/after row counts, FK checks, and focused upgrade tests.
- **Stop/escalate:** Stop before any destructive rebuild lacking backup/recovery fixture.

### G-007 — Add tenant-scoped composite constraints and indexes

- **Purpose:** Make database constraints enforce ownership rather than relying on code.
- **Dependencies:** G-002 through G-006.
- **Likely files:** Postgres migration plus SQLite schema/index definitions.
- **Steps:** Add tenant-inclusive uniqueness for source IDs, names/slugs where required, and idempotency keys; add composite parent/child FKs where supported; add query/lease indexes with tenant prefix; inspect query plans for hot paths.
- **Success criteria:** Cross-tenant child references fail; tenant-filtered queue/read queries use intended indexes.
- **Validation/evidence:** Negative constraint tests and `EXPLAIN` receipts on representative data.
- **Stop/escalate:** Do not add global uniqueness that prevents legitimate same identifiers across tenants.

### G-008 — Build legacy data backfill reconciler

- **Purpose:** Make tenant backfill measurable and resumable.
- **Dependencies:** G-002 through G-007, T-028.
- **Likely files:** New read/report script under `scripts/`, tests; migration may call equivalent SQL.
- **Steps:** Count rows per table; derive tenant through parent paths; report missing/ambiguous ownership; support dry-run; output machine-readable manifest/checksum; refuse writes unless explicit isolated rehearsal flag.
- **Success criteria:** Every row is assigned once or appears in an explicit blocker report; rerun is stable.
- **Validation/evidence:** Dry-run against sanitized copy and expected manifest fixture.
- **Stop/escalate:** Never auto-assign ambiguous rows.

### G-009 — Create tenant-scoped data-access helper contract

- **Purpose:** Standardize mandatory tenant parameters before editing query families.
- **Dependencies:** T-014, G-007.
- **Likely files:** New `src/lib/db/tenant-scope.ts`, tests.
- **Steps:** Define typed `TenantScope`; add SQL predicate/bind helpers that cannot accept empty IDs; provide assertion for returned rows; document platform-only escape hatch requiring named permission and audit.
- **Success criteria:** Helper tests reject missing/mismatched tenant scope; no string-concatenated tenant SQL.
- **Validation/evidence:** Focused unit tests and typecheck.
- **Stop/escalate:** Do not build a global “optional tenant” helper.

### G-010 — Tenant-scope location/market query functions

- **Purpose:** Prevent cross-tenant market enumeration.
- **Dependencies:** G-002, G-006, G-009.
- **Likely files:** `src/lib/db/queries.ts` initially or new `src/lib/markets/queries.ts`, related tests.
- **Steps:** Inventory market/cell/zip functions; require `TenantScope` for tenant-owned rows; preserve platform reference reads explicitly; update callers in a separate compile-safe sequence or same bounded family; add two-tenant tests.
- **Success criteria:** Tenant A cannot list/use tenant B markets/cells; global reference data remains read-only if approved.
- **Validation/evidence:** Focused query tests and call-site typecheck.
- **Stop/escalate:** Stop if ownership map is unclear for zip reference data.

### G-011 — Tenant-scope lead read query functions

- **Purpose:** Make all lead list/detail/count reads tenant-safe.
- **Dependencies:** G-003, G-006, G-009.
- **Likely files:** Lead query module(s), existing lead/explore/dashboard/statistics tests.
- **Steps:** Inventory every read returning leads/counts; add required scope predicate before other filters; assert returned tenant; update callers; include wrong-tenant ID tests and filter combinations.
- **Success criteria:** No lead read or aggregate crosses tenant; direct guessed ID yields non-enumerating not-found/forbidden behavior.
- **Validation/evidence:** Focused query suites, typecheck, SQL review.
- **Stop/escalate:** Split the task if file overlap is too large; never combine read and mutation rewrites without an updated child task.

### G-012 — Tenant-scope lead mutation query functions

- **Purpose:** Make create/update/archive/assign/score mutations tenant-safe.
- **Dependencies:** G-011.
- **Likely files:** Lead query modules and mutation tests.
- **Steps:** Require scope on every mutation; include tenant predicate in update/delete; set tenant on insert from authorized context; validate referenced user/market/workspace belongs to tenant; audit zero-row mismatch.
- **Success criteria:** Wrong-tenant mutations change zero rows and emit no sensitive existence detail; valid mutations preserve tenant.
- **Validation/evidence:** Two-tenant mutation tests and affected-row assertions.
- **Stop/escalate:** Do not trust tenant IDs in form data.

### G-013 — Tenant-scope crawl run/unit query functions

- **Purpose:** Isolate discovery scheduling and leases.
- **Dependencies:** G-010, G-002, G-009.
- **Likely files:** Crawl-related query functions/modules, planner/scheduler/crawl tests.
- **Steps:** Scope create/list/state transitions/lease/retry/count; require child tenant equals run/market/cell tenant; include tenant in idempotency and lease selection; update callers.
- **Success criteria:** Worker for tenant A never leases tenant B unit; pause/resume/status affects only scoped run.
- **Validation/evidence:** Concurrency lease tests with two tenants.
- **Stop/escalate:** Stop if existing scheduler invokes a global lease without an explicit fair dispatcher design.

### G-014 — Tenant-scope AI verification/artifact query functions

- **Purpose:** Isolate queue selection, artifacts, feedback, and usage.
- **Dependencies:** G-004, G-009, G-011.
- **Likely files:** AI query functions, worker/query tests.
- **Steps:** Scope enqueue/lease/retry/complete/read/feedback/usage; include tenant in input hash/idempotency where inputs might match; validate lead ownership; update artifact context calls.
- **Success criteria:** AI job cannot resolve lead/evidence from another tenant; usage is attributed correctly.
- **Validation/evidence:** Two-tenant queue/artifact tests including identical lead IDs in fixtures where possible.
- **Stop/escalate:** Missing tenant in model context is a phase-kill defect.

### G-015 — Tenant-scope outreach, notes, admin-request, and demo queries

- **Purpose:** Isolate current CRM children and public artifacts.
- **Dependencies:** G-003, G-009, G-011.
- **Likely files:** Query/action modules and related tests.
- **Steps:** Require scope on create/list/update; derive tenant from parent lead; validate actor/assignee membership; restrict public demo query to published/revoked contract and safe projection; update callers.
- **Success criteria:** Child records cannot cross leads/tenants; public route reveals no tenant-private data.
- **Validation/evidence:** Cross-tenant tests and public projection snapshot.
- **Stop/escalate:** Public demo changes require privacy review if new fields are exposed.

### G-016 — Tenant-scope settings and user administration queries

- **Purpose:** Replace global admin/settings behavior with tenant administration.
- **Dependencies:** T-008/T-009/T-012, G-009.
- **Likely files:** Settings/users/app-users query/action modules and tests.
- **Steps:** Separate platform config from tenant policy; scope users by membership; validate invitations/role changes within tenant; keep provider secrets tenant-scoped in approved secret boundary; update callers.
- **Success criteria:** Tenant admin cannot list/change another tenant or platform config; platform action is separately authorized/audited.
- **Validation/evidence:** Role and two-tenant query/action tests.
- **Stop/escalate:** Do not migrate secrets into ordinary tenant rows.

### G-017 — Tenant-scope statistics and dashboard aggregates

- **Purpose:** Prevent aggregate leakage even when row endpoints are safe.
- **Dependencies:** G-011 through G-016.
- **Likely files:** Statistics/dashboard query modules and tests.
- **Steps:** Inventory count/sum/group queries; add scope first; test empty tenant and equal category names; ensure fallback data is tenant-safe; update cache keys.
- **Success criteria:** Every metric equals values computed from that tenant's fixture rows only.
- **Validation/evidence:** Two-tenant aggregate assertions and cache-key tests.
- **Stop/escalate:** Never use a global cached aggregate for tenant UI.

### G-018 — Thread tenant scope through server actions

- **Purpose:** Ensure mutations use authorized session scope, not client input.
- **Dependencies:** T-013, G-010 through G-017.
- **Likely files:** `src/lib/*/actions.ts`, action tests.
- **Steps:** For each action family, call tenant permission helper; pass session scope to queries; validate workspace/resource ownership; normalize 401/403/not-found; remove optional tenant form fields.
- **Success criteria:** Direct action invocation cannot override tenant; all current action tests pass with scoped fixtures.
- **Validation/evidence:** Focused action suites plus source search showing no untrusted tenant assignment.
- **Stop/escalate:** Serialize overlapping action files; split by domain if needed.

### G-019 — Thread tenant scope through route handlers

- **Purpose:** Isolate exports, map reads, health detail, and worker endpoints.
- **Dependencies:** T-017, G-018.
- **Likely files:** `src/app/api/**/route.ts`, route tests.
- **Steps:** Classify public/session/worker route; derive tenant from session or queued run; validate resource ownership; tenant-scope cache/response; keep public health coarse; add wrong-tenant tests.
- **Success criteria:** No route accepts arbitrary tenant override; public endpoints expose no tenant data; worker routes require scoped run.
- **Validation/evidence:** Route test suite and curl-like local response examples.
- **Stop/escalate:** Any new public endpoint requires separate threat/privacy review.

### G-020 — Add fair tenant-aware worker dispatcher

- **Purpose:** Preserve resumable workers without allowing one tenant to starve others.
- **Dependencies:** G-013/G-014, T-017, tenant budget policy.
- **Likely files:** New scheduler/dispatcher module, worker metadata/query tests.
- **Steps:** Select eligible tenant/run under per-tenant concurrency/budget; lease within that tenant; rotate/fairly order; respect suspend/kill flags; record tenant/run/correlation metadata.
- **Success criteria:** Two active tenants both make progress under load; suspended/exhausted tenant is skipped; retries remain scoped.
- **Validation/evidence:** Deterministic fairness, budget, and stale-lease tests.
- **Stop/escalate:** Do not use nondeterministic fairness assertions without bounded tolerance.

### G-021 — Tenant-scope provider usage and budget service

- **Purpose:** Attribute cost and stop expensive work per tenant/play/run.
- **Dependencies:** G-005, T-008, G-020.
- **Likely files:** New or refactored usage/budget module, Google/AI pricing helpers, tests.
- **Steps:** Define provider/SKU events with tenant/workspace/play/run; calculate soft/hard limits; reserve/reconcile estimated vs actual cost; auto-pause; expose preview; preserve current Google/AI caps as compatibility defaults.
- **Success criteria:** Hard cap prevents next call; failed/reserved calls reconcile deterministically; one tenant cannot consume another budget.
- **Validation/evidence:** Boundary tests at cap and concurrent reservation tests.
- **Stop/escalate:** Paid calls are not part of validation unless separately approved.

### G-022 — Tenant-scope place cache and current Google adapter

- **Purpose:** Make current source reusable without cross-tenant data sharing.
- **Dependencies:** G-005, G-018/G-019, G-021.
- **Likely files:** `src/lib/google-places.ts`, place-cache contract/query helpers, tests.
- **Steps:** Pass tenant/source context through search/details/cache; include allowed field policy and TTL; preserve no-review-text rule; attribute usage; reject unapproved tenant connector.
- **Success criteria:** Tenant A cache cannot satisfy tenant B unless a separately approved shared-cache policy exists; restricted fields never persist.
- **Validation/evidence:** Existing Google tests plus two-tenant cache/usage tests with mocked responses.
- **Stop/escalate:** Do not call live Google in unit validation.

### G-023 — Seed the legacy website lead play

- **Purpose:** Represent current behavior as an explicit compatibility configuration before generalized play implementation.
- **Dependencies:** D-008/D-010/D-013, T-008, feature flags.
- **Likely files:** Seed/config module or migration, tests, compatibility documentation.
- **Steps:** Capture current website statuses, Google source allowance, geography defaults, score factors, queue thresholds, outreach copy-only rule, and status mapping in a versioned immutable seed record or interim adapter; bind to compatibility tenant.
- **Success criteria:** Existing current-state behavior can be described without hard-coding “all tenants” or losing its factor definitions.
- **Validation/evidence:** Snapshot of compatibility configuration and mapping to current code/tests.
- **Stop/escalate:** This seed must not become the default ICP/play for new tenants.

### G-024 — Add legacy/new-boundary parity fixture suite

- **Purpose:** Detect regressions while extracting generalized services.
- **Dependencies:** G-011 through G-023.
- **Likely files:** New compatibility fixtures/tests.
- **Steps:** Freeze representative no/social/basic/custom leads, scoring, queue order, crawl state, AI status, outreach package, export row, and dashboard counts; run old path and scoped compatibility path; compare approved fields.
- **Success criteria:** Differences are zero or documented/approved contract changes; fixtures include retries and excluded/archived leads.
- **Validation/evidence:** Machine-readable parity report in test output.
- **Stop/escalate:** Any unexplained difference blocks cutover.

### G-025 — Phase 2 generalized-boundary acceptance gate

- **Purpose:** Prove current workflows are tenant-safe before adding new domains.
- **Dependencies:** G-001 through G-024.
- **Likely files:** Validation receipt only unless defects become separate tasks.
- **Steps:** Run focused scopes, full release check, two-tenant route/action/worker/cache/aggregate tests, compatibility parity, recovery dry-run, isolated Postgres RLS checks, and authenticated local legacy workflow smoke.
- **Success criteria:** All existing capabilities function in compatibility tenant; zero cross-tenant rows/payloads/cache/model context; Phase 2 D-015 thresholds pass.
- **Validation/evidence:** `docs/validation/phase-2-generalized-boundary.md` with commands, browser route evidence, SQL receipts, and parity artifact.
- **Stop/escalate:** No Phase 3 paid/provider or UI work proceeds on a leaking or non-parity foundation.

## Phase 3 tasks — Document ingestion, evidence, claims, and reviewable knowledge

### I-001 — Define document-ingestion domain contracts

- **Purpose:** Fix types/states before choosing parsers or routes.
- **Dependencies:** D-006, D-007, D-008, G-025.
- **Likely files:** New `src/lib/knowledge/types.ts`, `src/lib/knowledge/schemas.ts`, tests.
- **Steps:** Define source/document/version/blob/parser/extraction/chunk/table/evidence/claim/review states; encode format/size/language limits; add strict Zod inputs and state-transition tests.
- **Success criteria:** All D-007/D-008 states are represented; unknown format/status fails closed; tenant/workspace IDs are required.
- **Validation/evidence:** Focused schema/state tests and typecheck.
- **Stop/escalate:** Stop if support matrix or evidence policy is unapproved.

### I-002 — Add Postgres document and version tables

- **Purpose:** Store immutable source identity and content versions.
- **Dependencies:** I-001, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add tenant-scoped `documents` and `document_versions` with source kind, original name/URL, MIME, size, hash, storage reference, status, parser/version, language, quality, error, timestamps, uploader; use tenant-scoped dedupe constraints.
- **Success criteria:** New content creates a version; identical retry is idempotent; storage key cannot be public/raw path input.
- **Validation/evidence:** Migration rehearsal and constraint/idempotency SQL tests.
- **Stop/escalate:** No raw file bytes in ordinary database fields.

### I-003 — Add SQLite document and version schema

- **Purpose:** Support local fixture ingestion per D-004.
- **Dependencies:** I-002, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Mirror metadata/state/constraints; represent storage reference as local test adapter key; add fresh/upgrade tests; preserve immutable version behavior.
- **Success criteria:** Local schema matches state/uniqueness semantics and never embeds production secrets.
- **Validation/evidence:** Fresh/upgrade SQLite tests.
- **Stop/escalate:** Do not emulate external storage by writing arbitrary files under the repo.

### I-004 — Define private object-storage adapter interface

- **Purpose:** Keep storage provider details out of ingestion logic.
- **Dependencies:** I-001, D-006, T-018.
- **Likely files:** New `src/lib/knowledge/storage.ts`, fake adapter/tests.
- **Steps:** Define put/finalize/read-range/signed-download/delete/metadata operations; require tenant-prefixed keys and content length/type; separate quarantine and accepted namespaces; add fake in-memory/local test adapter.
- **Success criteria:** Interface cannot create public object or unscoped key; tests cover traversal, overwrite, wrong tenant, and expiry.
- **Validation/evidence:** Adapter contract tests and typecheck.
- **Stop/escalate:** Provider-specific SDK belongs in I-005 only.

### I-005 — Implement approved production storage adapter

- **Purpose:** Connect I-004 to the provider selected by D-006.
- **Dependencies:** I-004.
- **Likely files:** New provider adapter, environment schema/example updates, tests with mocked SDK.
- **Steps:** Use server-only credentials; create private/quarantine operations; issue short-lived signed URLs; verify metadata and tenant prefix; implement idempotent delete; redact provider errors.
- **Success criteria:** No client bundle contains credentials; cross-tenant key access is rejected before provider call; signed URLs expire.
- **Validation/evidence:** Mocked contract suite and build bundle/source review.
- **Stop/escalate:** Do not create buckets/change cloud settings without explicit external-change approval.

### I-006 — Add document upload-initiation service

- **Purpose:** Validate and reserve an upload without processing content.
- **Dependencies:** I-002/I-003, I-004/I-005, T-013.
- **Likely files:** New `src/lib/knowledge/uploads.ts`, tests.
- **Steps:** Authorize `document:create`; validate filename/MIME/declared size; create pending document/version and tenant key; return bounded upload instructions; create audit event; use idempotency key.
- **Success criteria:** Invalid/oversize/unsupported input creates no accepted document; retry is stable; wrong tenant cannot reserve key.
- **Validation/evidence:** Service tests for each support-matrix case.
- **Stop/escalate:** Do not trust client MIME or hash as final validation.

### I-007 — Add upload-finalization service

- **Purpose:** Verify stored object before queueing security checks.
- **Dependencies:** I-006.
- **Likely files:** Upload service module/tests.
- **Steps:** Fetch provider metadata; verify size/type/hash where available; reject mismatch; atomically move status to quarantined and enqueue scan job; make finalization idempotent; audit errors without content.
- **Success criteria:** Missing/mismatched objects never enter extraction; duplicate finalize creates one scan job.
- **Validation/evidence:** Fake-adapter mismatch/idempotency tests.
- **Stop/escalate:** No extraction before malware disposition is clean/exempt under D-006.

### I-008 — Add file-signature and resource-limit validation

- **Purpose:** Validate real content type and defend parsers.
- **Dependencies:** I-004, D-007.
- **Likely files:** New `src/lib/knowledge/file-validation.ts`, fixtures/tests.
- **Steps:** Inspect bounded header/range; detect supported signatures; enforce compressed expansion/page/row/dimension limits; reject polyglots/encrypted/password files per policy; return typed reason codes.
- **Success criteria:** Extension/MIME spoofing, zip bombs, oversized tables/images, and unsupported encryption fail before parser execution.
- **Validation/evidence:** Malicious/safe fixture tests within repository-safe small samples.
- **Stop/escalate:** Do not execute macros or embedded scripts.

### I-009 — Add malware-scan job schema and state machine

- **Purpose:** Make scanning asynchronous, resumable, and auditable.
- **Dependencies:** I-002/I-003, D-006.
- **Likely files:** Postgres migration, SQLite schema, state types/tests.
- **Steps:** Add one job per document version with queued/running/clean/infected/error/retry states, lease, attempts, provider result code, timestamps; tenant-index queues; define terminal quarantine behavior.
- **Success criteria:** Retry is idempotent; infected objects cannot transition to extraction; stale lease recovers.
- **Validation/evidence:** State/lease tests on supported backends.
- **Stop/escalate:** Do not store raw scanner reports if they contain content or secrets.

### I-010 — Implement malware-scan worker adapter

- **Purpose:** Execute D-006 scanning policy without coupling to ingestion.
- **Dependencies:** I-005, I-009, T-017/G-020.
- **Likely files:** New `src/lib/knowledge/scan-worker.ts`, route if needed, tests.
- **Steps:** Lease one scoped job; stream object through approved scanner; enforce time/size limits; record clean/infected/retry/error; delete or retain quarantine per policy; emit sanitized audit/usage.
- **Success criteria:** Infected fixture is terminally blocked; provider timeout retries within cap; worker cannot scan another tenant key.
- **Validation/evidence:** Mock scanner worker tests and trace receipt.
- **Stop/escalate:** Do not invoke paid/live scanner in local tests without approval.

### I-011 — Define parser registry and normalized extraction contract

- **Purpose:** Make format parsers interchangeable and bounded.
- **Dependencies:** I-001, I-008.
- **Likely files:** New `src/lib/knowledge/parsers/index.ts`, `types.ts`, tests.
- **Steps:** Define parser capability/limits/version; normalized blocks with page/section/row/cell locators; warnings and quality; registry selection by validated signature; cancellation/time budgets.
- **Success criteria:** Unsupported format yields typed failure; every block has stable locator and parser version; parser cannot perform network calls.
- **Validation/evidence:** Fake parser and registry tests.
- **Stop/escalate:** No parser may silently return empty success.

### I-012 — Implement bounded PDF parser

- **Purpose:** Extract page-located text/tables from approved PDFs.
- **Dependencies:** I-011, D-007 PDF support.
- **Likely files:** New PDF parser and fixtures/tests; package files only if approved dependency is necessary.
- **Steps:** Select existing/approved library; parse within page/size/time limits; preserve page numbers and reading-order caveats; detect scanned/no-text pages; return OCR-needed warning; never execute embedded content.
- **Success criteria:** Text PDF fixture produces deterministic page locators; encrypted/malformed/oversize/scanned cases produce approved states.
- **Validation/evidence:** Focused fixtures, typecheck, dependency/license review.
- **Stop/escalate:** New dependency needs explicit review; do not add an unmaintained/native binary casually.

### I-013 — Implement bounded DOCX parser

- **Purpose:** Extract headings, paragraphs, and tables with stable locators.
- **Dependencies:** I-011, D-007 DOCX support.
- **Likely files:** DOCX parser/fixtures/tests.
- **Steps:** Validate archive; ignore macros/external relationships; extract document order, headings, tables, footnotes if approved; cap expanded size; return warnings for unsupported objects.
- **Success criteria:** Fixture preserves heading/table boundaries; malicious relationship/macro fixture is ignored/rejected per policy.
- **Validation/evidence:** Focused parser tests and dependency review.
- **Stop/escalate:** Do not fetch linked resources.

### I-014 — Implement bounded spreadsheet/CSV parser

- **Purpose:** Extract tabular customer/product material safely.
- **Dependencies:** I-011, D-007 spreadsheet support.
- **Likely files:** Spreadsheet parser/fixtures/tests.
- **Steps:** Support approved CSV/XLSX sheets; cap sheets/rows/columns/cells; preserve sheet/row/cell locators and raw/formatted value; prevent formula execution; mark hidden sheets according to policy.
- **Success criteria:** Formula cells are treated as data, not executed; oversized workbook fails clearly; row/cell citations resolve.
- **Validation/evidence:** CSV/XLSX fixture tests including formula injection strings.
- **Stop/escalate:** Never evaluate formulas/macros.

### I-015 — Implement text and Markdown parser

- **Purpose:** Ingest notes with minimal transformation.
- **Dependencies:** I-011, D-007 text support.
- **Likely files:** Text parser/tests.
- **Steps:** Detect approved encoding; normalize line endings without changing meaning; preserve line/heading locators; cap bytes/lines; identify invalid binary content.
- **Success criteria:** Citations resolve to exact line ranges; malformed encoding has typed warning/error.
- **Validation/evidence:** Encoding/line-locator tests.
- **Stop/escalate:** Do not render/execute embedded HTML or scripts.

### I-016 — Implement image/OCR adapter

- **Purpose:** Extract text only when OCR is approved.
- **Dependencies:** I-011, D-006/D-007 OCR decision.
- **Likely files:** OCR interface/provider adapter/tests.
- **Steps:** Validate dimensions/type; strip unsafe metadata if processing copy; submit through approved provider/local engine; return bounding boxes/page coordinates, confidence, language, cost; flag low quality for review.
- **Success criteria:** Low-confidence OCR never becomes confirmed claim automatically; wrong-tenant/provider context is rejected.
- **Validation/evidence:** Mocked OCR fixture and threshold tests.
- **Stop/escalate:** No external OCR of private content outside D-006/D-009 policy.

### I-017 — Implement authorized URL-source validator and fetcher

- **Purpose:** Ingest customer-authorized web material safely.
- **Dependencies:** D-010, I-001, existing `src/lib/safe-http.ts`.
- **Likely files:** New `src/lib/knowledge/url-source.ts`, safe HTTP extensions, tests.
- **Steps:** Validate scheme/domain/authorization; block private/reserved networks and unsafe redirects; apply robots/access/rate/size/type rules; capture URL, retrieval time, status, headers/hash; do not crawl beyond approved scope.
- **Success criteria:** SSRF/DNS/redirect tests fail closed; fetch creates one version with provenance; blocked robots/access yields typed state.
- **Validation/evidence:** Mock server tests, no live fetch required.
- **Stop/escalate:** Stop if source terms or tenant authorization are not recorded.

### I-018 — Add document-version deduplication service

- **Purpose:** Avoid duplicate processing while preserving source identity.
- **Dependencies:** I-002/I-003, I-006/I-007.
- **Likely files:** New `src/lib/knowledge/deduplication.ts`, tests.
- **Steps:** Compare tenant-scoped content hashes and source identity; distinguish duplicate upload from new version; link safely without cross-tenant blob reuse; record decision/audit; handle concurrent finalize.
- **Success criteria:** Concurrent identical uploads create one processing version per approved policy; cross-tenant hashes never expose existence.
- **Validation/evidence:** Concurrency and cross-tenant tests.
- **Stop/escalate:** Do not globally dedupe private content without approved encryption/privacy design.

### I-019 — Add extraction-job schema and leasing

- **Purpose:** Queue parsing as resumable tenant work.
- **Dependencies:** I-009, I-011, G-020.
- **Likely files:** Postgres migration, SQLite schema, query/state tests.
- **Steps:** Add parser/version, queued/running/retry/review/complete/error/cancel states, lease, attempts, budgets, quality/warnings; enforce one active compatible extraction per document version.
- **Success criteria:** Clean scan queues once; stale lease recovers; cancellation stops before persistence checkpoint.
- **Validation/evidence:** State, lease, idempotency, cancellation tests.
- **Stop/escalate:** No job without tenant/document version and parser version.

### I-020 — Implement extraction worker

- **Purpose:** Turn one clean document version into normalized extraction output.
- **Dependencies:** I-010 through I-019.
- **Likely files:** New `src/lib/knowledge/extraction-worker.ts`, route if needed, tests.
- **Steps:** Lease scoped job; verify clean scan; stream object; select parser; enforce abort/time/resource budget; persist output transactionally; store warnings/quality; schedule downstream chunk/evidence task; record usage/audit.
- **Success criteria:** Retry does not duplicate output; parser crash leaves recoverable state; wrong tenant/unclean input is blocked.
- **Validation/evidence:** Worker tests for success/retry/cancel/partial failure.
- **Stop/escalate:** Do not catch and mark success on empty or partial parser output.

### I-021 — Add normalized document-block and extracted-table tables

- **Purpose:** Persist located parser output separately from claims.
- **Dependencies:** I-011, I-019.
- **Likely files:** Postgres migration, SQLite schema, data-access/tests.
- **Steps:** Add tenant/document-version/parser-version/order/locator/text-or-cell metadata/hash/quality; make output append-only per extraction version; add pagination/retrieval indexes.
- **Success criteria:** Every block/table resolves to immutable source version and stable locator; rerun with new parser preserves prior output.
- **Validation/evidence:** Both-backend query and version coexistence tests.
- **Stop/escalate:** Do not overwrite old extraction versions.

### I-022 — Add deterministic chunking service

- **Purpose:** Create retrieval units while preserving citations.
- **Dependencies:** I-021.
- **Likely files:** New `src/lib/knowledge/chunking.ts`, tests.
- **Steps:** Chunk by structural blocks within size limits; never split table cells/negations blindly; carry source locator list and content hash; version algorithm; make output deterministic.
- **Success criteria:** Same extraction/version/config yields identical chunks/hashes; each chunk maps back to exact blocks.
- **Validation/evidence:** Golden chunk snapshots for PDF, DOCX, sheet, Markdown.
- **Stop/escalate:** No embedding/provider call in this task.

### I-023 — Add evidence-item schema and repository

- **Purpose:** Persist evidence independently from agent claims.
- **Dependencies:** I-021/I-022, D-008.
- **Likely files:** Postgres migration, SQLite schema, new knowledge query module/tests.
- **Steps:** Add source/version/block/locator/excerpt-or-structured-value/hash/freshness/reliability/access fields; enforce tenant chain; expose paginated get/resolve methods; prevent unauthorized excerpt retrieval.
- **Success criteria:** Citation ID resolves to exact allowed source location; wrong tenant gets no existence signal; stale status is computable.
- **Validation/evidence:** Two-tenant resolution and freshness tests.
- **Stop/escalate:** Respect source retention restrictions before storing excerpt content.

### I-024 — Add claim and claim-support schema

- **Purpose:** Separate assertions from the evidence that supports/conflicts with them.
- **Dependencies:** I-023, D-008.
- **Likely files:** Postgres migration, SQLite schema, types/tests.
- **Steps:** Add typed predicate/subject/value/unit/status/origin/confidence/evidence grade/freshness; many-to-many support/conflict links; supersession/version; human review state; constraints for absence claims.
- **Success criteria:** Claim cannot be “confirmed” without required evidence/reviewer under D-008; conflicts coexist visibly.
- **Validation/evidence:** State/constraint tests with technical-claim examples.
- **Stop/escalate:** Do not encode arbitrary model JSON as the canonical claim.

### I-025 — Implement evidence and claim repositories

- **Purpose:** Provide transactional, tenant-safe claim operations.
- **Dependencies:** I-023/I-024.
- **Likely files:** New `src/lib/knowledge/evidence-queries.ts`, `claim-queries.ts`, tests.
- **Steps:** Create evidence; propose claim; attach support/conflict; supersede; list by source/subject/status; resolve citation; require review reasons; enforce tenant/workspace scope.
- **Success criteria:** Duplicate evidence/hash is idempotent within tenant/version; transitions follow D-008; cross-tenant links fail.
- **Validation/evidence:** Two-tenant query/state tests.
- **Stop/escalate:** No hard-delete of evidence needed by retained decisions.

### I-026 — Implement citation resolver and render-safe citation DTO

- **Purpose:** Give agents/UI one safe way to display provenance.
- **Dependencies:** I-023/I-025, D-014.
- **Likely files:** New `src/lib/knowledge/citations.ts`, tests.
- **Steps:** Resolve authorized evidence to source label, locator, short allowed excerpt/structured value, freshness, grade, URL only if permitted; redact private storage keys; return unavailable/expired state without broken claim.
- **Success criteria:** Citation never leaks raw object key or another tenant; expired/deleted source is visibly unresolved.
- **Validation/evidence:** DTO snapshots for upload, URL, table, API observation, expired source.
- **Stop/escalate:** Do not generate public signed URLs for citations.

### I-027 — Add knowledge-review task schema and service

- **Purpose:** Route low-quality extraction and claim conflicts to humans.
- **Dependencies:** I-019/I-024/I-025, D-002.
- **Likely files:** Postgres migration, SQLite schema, new review service/tests.
- **Steps:** Add task type/priority/reason/source/claim/assignee/status/decision/before-after; create on parser warning/conflict/policy gate; authorize assignment/decision; audit all transitions.
- **Success criteria:** One unresolved issue does not create duplicate open tasks; decision updates claim/extraction state transactionally.
- **Validation/evidence:** Dedupe, role, and decision transaction tests.
- **Stop/escalate:** Agent cannot approve its own high-risk claim.

### I-028 — Add document/knowledge API contracts

- **Purpose:** Expose bounded server-side operations for future UI.
- **Dependencies:** I-006/I-007/I-017/I-025/I-027.
- **Likely files:** Server actions or versioned route handlers, DTO schemas, tests.
- **Steps:** Add list/detail/upload-init/finalize/URL-add/retry/cancel/evidence/claim/review endpoints as approved; authorize each permission; paginate; return typed statuses/reason codes; no raw parser/provider payload.
- **Success criteria:** Direct calls are tenant-safe; every mutation is idempotent/audited; response schemas are stable.
- **Validation/evidence:** Contract tests for roles, wrong tenant, malformed input, pagination.
- **Stop/escalate:** Do not add anonymous upload or URL fetch.

### I-029 — Build ingestion golden and adversarial fixture suite

- **Purpose:** Make parser/security quality reproducible without customer data.
- **Dependencies:** I-012 through I-028.
- **Likely files:** `src/test/fixtures/knowledge/**`, fixture manifest, tests.
- **Steps:** Add small synthetic specialty-chemical PDF/data sheet/catalog/spreadsheet/notes, non-industrial set, malformed files, spoofed MIME, formula strings, prompt injection, contradictory claims, scanned/low-quality sample; document expected outputs/licenses.
- **Success criteria:** Fixtures cover every launch format/status and contain no secrets/real personal data; expected locators/claims are deterministic.
- **Validation/evidence:** Fixture manifest validator and focused suite.
- **Stop/escalate:** Avoid copyrighted/proprietary customer materials.

### I-030 — Phase 3 ingestion/evidence acceptance gate

- **Purpose:** Prove private material becomes safe, resolvable evidence.
- **Dependencies:** I-001 through I-029 applicable to launch formats.
- **Likely files:** Validation receipt only unless separate defects are filed.
- **Steps:** Upload/fetch all approved fixtures through real local/staging path; exercise scan, parse, retry, cancel, duplicate, wrong tenant, review; resolve citations; inspect storage privacy and logs; run release check.
- **Success criteria:** D-007/D-008/D-015 thresholds pass; no cross-tenant/object-key leak; every accepted block/evidence citation resolves; blocked files never reach extraction.
- **Validation/evidence:** `docs/validation/phase-3-ingestion-evidence.md`, sanitized job rows, route payloads, citation screenshots/JSON, command output.
- **Stop/escalate:** Any unresolved citation, silent empty extraction, unsafe file acceptance, or private URL exposure fails the phase.

## Phase 4 tasks — Bounded agents, approved business understanding, and adaptive questions

### A-001 — Define business-understanding ontology and schemas

- **Purpose:** Give agents typed targets instead of free-form summaries.
- **Dependencies:** D-008, I-030.
- **Likely files:** New `src/lib/understanding/types.ts`, `schemas.ts`, tests.
- **Steps:** Define products, variants, applications, industries, customer types, channel positions, differentiators, constraints, certifications, substitutes, triggers, buying process, geography, economics, exclusions, and uncertainty; require claim/evidence references; include extensible custom facts without arbitrary canonical JSON.
- **Success criteria:** Specialty-chemical and non-industrial fixtures serialize without domain-specific hard-coding; material facts require provenance/status.
- **Validation/evidence:** Schema fixture tests and typecheck.
- **Stop/escalate:** Do not treat an ontology field as verified simply because a model populates it.

### A-002 — Add business-understanding version tables

- **Purpose:** Persist draft/approved/superseded understanding snapshots.
- **Dependencies:** A-001, T/G tenant foundation.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add tenant/workspace, version, status, structured content, input claim-set hash, model/prompt/policy versions, created/reviewed/approved actor/time, supersedes ID, confidence/coverage metrics; enforce immutable approved versions.
- **Success criteria:** New approval creates a reproducible version; old version remains readable; only approved role can approve.
- **Validation/evidence:** Both-backend state/version tests.
- **Stop/escalate:** Do not overwrite an approved version in place.

### A-003 — Add agent-run and step tables

- **Purpose:** Trace every bounded agent execution independently of feature artifacts.
- **Dependencies:** T/G tenant foundation, D-009.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add agent role/version, objective, tenant/workspace, input artifact hashes, status, budget, usage, error, cancellation, start/end; add ordered steps with tool/policy/result references but no raw secrets/content by default; index queues/status.
- **Success criteria:** Every agent artifact resolves to one run and immutable input/version metadata; canceled/error states are explicit.
- **Validation/evidence:** State/tenant/idempotency tests.
- **Stop/escalate:** Do not store unredacted prompts or source content in generic trace fields.

### A-004 — Add agent tool-call and artifact metadata tables

- **Purpose:** Audit permitted tools and outputs without leaking payloads.
- **Dependencies:** A-003, D-009.
- **Likely files:** Postgres migration, SQLite schema, types/tests.
- **Steps:** Add tool name/version, permission decision, input/output hashes, source IDs, cost/latency, status/error, redacted summary; add artifact type/schema version/storage reference/confidence; enforce tenant/run chain.
- **Success criteria:** Unauthorized tool attempt is recorded and blocked; artifact cannot reference another tenant/run.
- **Validation/evidence:** Constraint and redaction tests.
- **Stop/escalate:** Tool payload retention must follow D-009/D-014.

### A-005 — Create versioned prompt and policy registry

- **Purpose:** Keep agent instructions reviewable and reproducible.
- **Dependencies:** D-008/D-009, A-003.
- **Likely files:** New `src/lib/agents/registry.ts`, prompt files/modules, tests.
- **Steps:** Register agent role, prompt version/hash, output schema, allowed tools, model class, temperature/reasoning settings, max tokens/time/calls/cost, evidence and review policy; reject unregistered combinations.
- **Success criteria:** Run records identify exact registry entry; changing a prompt creates a new version; no runtime free-form system prompt.
- **Validation/evidence:** Registry uniqueness/hash/snapshot tests.
- **Stop/escalate:** Provider/model change requires D-009 approval and new version.

### A-006 — Create tenant-safe AI model gateway

- **Purpose:** Centralize provider policy, cancellation, validation, usage, and redaction.
- **Dependencies:** A-003 through A-005, G-021, D-009.
- **Likely files:** New `src/lib/agents/model-gateway.ts`, existing `src/lib/ai/config.ts` integration, tests.
- **Steps:** Resolve approved model by agent/data class; enforce server-only key, timeout/abort, structured schema, usage capture, tenant budget reservation/settlement, retry taxonomy, response-size limit, and sanitized errors; no silent provider fallback.
- **Success criteria:** Unapproved data/model fails before network call; malformed output fails typed; usage always reconciles.
- **Validation/evidence:** Mock provider tests for success/timeout/abort/malformed/budget denial.
- **Stop/escalate:** No live paid call in local validation without approval.

### A-007 — Implement agent-run repository and lease service

- **Purpose:** Make agents resumable/idempotent like current workers.
- **Dependencies:** A-003/A-004, G-020.
- **Likely files:** New `src/lib/agents/runs.ts`, tests.
- **Steps:** Create/dedupe/lease/heartbeat/checkpoint/complete/retry/fail/cancel; require tenant; use attempt caps/backoff; persist artifact only after schema validation; handle stale lease.
- **Success criteria:** Concurrent workers lease once; retry cannot duplicate final artifact; cancel prevents later success.
- **Validation/evidence:** Lease/concurrency/cancellation tests.
- **Stop/escalate:** Do not reuse lead-specific queue functions without removing lead assumptions.

### A-008 — Implement agent tool-policy evaluator

- **Purpose:** Enforce allowlists per tenant, agent, play, and run.
- **Dependencies:** A-005, T-008/T-012, D-009/D-010.
- **Likely files:** New `src/lib/agents/tool-policy.ts`, tests.
- **Steps:** Evaluate registered tool, tenant feature/policy, connector authorization, data class, run budget, human gate; return reason code; record denial; provide no dynamic code/tool execution.
- **Success criteria:** Default deny; forged tool name/source/tenant is blocked; policy version appears in run.
- **Validation/evidence:** Exhaustive decision-table tests.
- **Stop/escalate:** No “admin bypass” around source/provider policy.

### A-009 — Add prompt-injection content isolation

- **Purpose:** Treat uploaded/web text as evidence, never instructions.
- **Dependencies:** I-022/I-023, A-005/A-008.
- **Likely files:** New `src/lib/agents/context-builder.ts`, tests.
- **Steps:** Serialize evidence in clearly delimited data envelopes; strip/escape control markup; include source IDs not executable URLs/tools; add explicit system policy; cap and rank context; mark untrusted instruction-like text; test indirect injection.
- **Success criteria:** Fixtures asking agent to reveal secrets/change tools/ignore policy cannot alter tool calls, tenant, or output schema.
- **Validation/evidence:** Adversarial replay tests with tool-call assertions.
- **Stop/escalate:** Stop if provider/tool framework automatically executes content-specified tools.

### A-010 — Implement claim-extraction agent contract

- **Purpose:** Propose typed claims from evidence without auto-confirmation.
- **Dependencies:** A-001/A-005 through A-009, I-025.
- **Likely files:** New `src/lib/agents/claim-extractor.ts`, prompt/schema/tests.
- **Steps:** Build bounded evidence context; request strict claims with evidence IDs/locators, origin, confidence, uncertainties; validate citations exist and support text; persist as proposed; route high-risk/low-evidence to review.
- **Success criteria:** No claim without resolvable tenant evidence; technical/regulatory/pricing claims remain review-gated; malformed/hallucinated IDs fail.
- **Validation/evidence:** Golden and adversarial fixture tests.
- **Stop/escalate:** Do not mark model output confirmed.

### A-011 — Implement deterministic claim-support validator

- **Purpose:** Check model citations and simple contradictions before synthesis.
- **Dependencies:** A-010, D-008.
- **Likely files:** New `src/lib/knowledge/claim-validation.ts`, tests.
- **Steps:** Resolve cited evidence; verify tenant/source/current version; check excerpt/value/units/negation and absence search scope; detect duplicate/conflicting claims; downgrade or reject per D-008; produce reason codes.
- **Success criteria:** Hallucinated citation, wrong unit, negation reversal, and stale/expired support cannot pass as corroborated.
- **Validation/evidence:** Table-driven chemical/non-industrial tests.
- **Stop/escalate:** Semantic ambiguity routes to review; deterministic code must not invent meaning.

### A-012 — Implement business-understanding synthesis agent

- **Purpose:** Turn reviewed claims into a structured draft understanding.
- **Dependencies:** A-001, A-006/A-009/A-011, approved claims.
- **Likely files:** New `src/lib/agents/understanding-synthesizer.ts`, prompt/schema/tests.
- **Steps:** Select confirmed/proposed/conflicted claims by policy; build cited context; produce strict A-001 schema; distinguish observed/client/inferred/unknown; compute coverage; persist draft with claim-set hash.
- **Success criteria:** Every material field links to claims/evidence or is explicitly unknown; contradictions appear as uncertainty; rerun with same inputs/version is semantically stable.
- **Validation/evidence:** Golden replay tests and citation resolution check.
- **Stop/escalate:** No unsupported narrative filler.

### A-013 — Implement business-understanding version repository

- **Purpose:** Manage draft/review/approve/supersede lifecycle.
- **Dependencies:** A-002, A-012, T-012/T-015.
- **Likely files:** New `src/lib/understanding/queries.ts`, `service.ts`, tests.
- **Steps:** Create draft idempotently; diff versions by domain/claim; assign review; record edits with reason; approve transactionally; supersede prior approved; expose current approved.
- **Success criteria:** Only one current approved version per scope; approval is audited; old versions and citations remain reproducible.
- **Validation/evidence:** State/role/concurrency/version-diff tests.
- **Stop/escalate:** No direct row update bypassing service.

### A-014 — Add uncertainty inventory schema and service

- **Purpose:** Make unknowns/conflicts first-class inputs to questions.
- **Dependencies:** A-001/A-013.
- **Likely files:** Postgres/SQLite schema if persisted separately; new `src/lib/questions/uncertainty.ts`, tests.
- **Steps:** Represent subject/domain, unknown/conflict/stale/missing-threshold type, impact areas, evidence/claim links, status, resolution; derive inventory deterministically from approved/draft understanding and policies.
- **Success criteria:** Same state yields same unresolved inventory; resolved item links to answer/claim/version; no generic “need more info” without domain.
- **Validation/evidence:** Golden inventory tests.
- **Stop/escalate:** Do not ask questions directly in this task.

### A-015 — Add adaptive-question and answer tables

- **Purpose:** Persist dynamic question provenance and user responses.
- **Dependencies:** A-014, D-002.
- **Likely files:** Postgres migration, SQLite schema, state tests.
- **Steps:** Add question run, uncertainty link, text, rationale, expected decision impact, effort/risk/value scores, rank, status, asked/deferred/expired timestamps; add answer text/evidence attachments, unknown/not-applicable/corrected states, actor; version prompts/policy.
- **Success criteria:** Every question explains why it matters and what it may change; answer history is immutable/versioned.
- **Validation/evidence:** Both-backend state/constraint tests.
- **Stop/escalate:** No fixed questionnaire table with universal mandatory rows.

### A-016 — Implement deterministic question-value scorer

- **Purpose:** Rank uncertainty by expected decision value before generation.
- **Dependencies:** A-014/A-015, D-015 metrics.
- **Likely files:** New `src/lib/questions/value-score.ts`, tests.
- **Steps:** Score potential impact on ICP/play/search/qualification/outreach safety, uncertainty severity, user effort, sensitivity/risk, prior deferrals; expose factor breakdown; use versioned weights; cap low-value repeats.
- **Success criteria:** High-impact safety/segmentation gaps outrank cosmetic facts; factor math is deterministic/explainable.
- **Validation/evidence:** Table-driven score/order tests across chemical/non-industrial fixtures.
- **Stop/escalate:** Missing weights/thresholds require approved defaults, not model guessing.

### A-017 — Implement adaptive question-generation agent

- **Purpose:** Turn top uncertainty into a small, discriminating question set.
- **Dependencies:** A-005/A-006/A-009, A-014 through A-016.
- **Likely files:** New `src/lib/agents/question-planner.ts`, prompt/schema/tests.
- **Steps:** Provide top scored uncertainties, existing facts/questions/answers, tenant language; generate bounded questions with target uncertainty and rationale; validate no duplicate/answer-known/sensitive-unnecessary question; persist ranked run.
- **Success criteria:** Different business fixtures produce materially different questions; known answers are not asked; each question maps to uncertainty and expected decision.
- **Validation/evidence:** Golden semantic assertions, duplicate test, fixed-question absence search.
- **Stop/escalate:** Sensitive data request requires policy review.

### A-018 — Implement question dedupe and repeat-prevention service

- **Purpose:** Prevent rephrased repetition and user fatigue.
- **Dependencies:** A-015/A-017.
- **Likely files:** New `src/lib/questions/deduplication.ts`, tests.
- **Steps:** Compare target uncertainty, normalized semantics/hash, prior answer status, expiry/freshness, defer window; merge or suppress; allow re-ask only with stale/conflict/new-decision reason.
- **Success criteria:** Equivalent question cannot reopen immediately; legitimate stale/conflicting re-ask shows reason.
- **Validation/evidence:** History/time-based tests.
- **Stop/escalate:** Do not use cross-tenant semantic index.

### A-019 — Implement answer submission service

- **Purpose:** Validate, persist, and audit human answers.
- **Dependencies:** A-015, T-013/T-015.
- **Likely files:** New `src/lib/questions/answers.ts`, tests.
- **Steps:** Authorize respondent; validate open question and answer state; store natural language plus attached evidence IDs/files; support unknown/not-applicable/defer/correct; close/supersede question; emit audit.
- **Success criteria:** Wrong-tenant/closed-question answer fails; corrections preserve history; evidence attachment belongs to tenant.
- **Validation/evidence:** Role/state/two-tenant tests.
- **Stop/escalate:** Answers do not become confirmed claims automatically.

### A-020 — Implement answer-to-claim proposal processor

- **Purpose:** Convert user answers into client-provided claims with review rules.
- **Dependencies:** A-011, A-019, I-025.
- **Likely files:** New `src/lib/questions/answer-processor.ts`, tests.
- **Steps:** Parse bounded answer into proposed typed claims; mark origin client-provided; attach answer/evidence; detect conflict; apply D-008 review threshold; resolve uncertainty only after accepted claim/status.
- **Success criteria:** Corrections supersede rather than overwrite; conflicts reopen review; unknown/not-applicable creates no factual claim.
- **Validation/evidence:** Golden answer/correction/conflict tests.
- **Stop/escalate:** Technical high-risk answers require domain review if policy says so.

### A-021 — Add understanding/question API contracts

- **Purpose:** Expose safe backend operations to future UI.
- **Dependencies:** A-013/A-017 through A-020.
- **Likely files:** Server actions/routes, DTO schemas, tests.
- **Steps:** Add current/draft/version/diff/regenerate/request-review/approve understanding; list/answer/defer questions; enforce permissions and idempotency; paginate; return citations/uncertainty/reason codes.
- **Success criteria:** Direct API cannot approve as wrong role or answer cross-tenant; responses contain no raw prompts/tool payloads.
- **Validation/evidence:** Contract/action/route tests.
- **Stop/escalate:** No endpoint may accept arbitrary approved status from client.

### A-022 — Build specialty-chemicals understanding golden expectations

- **Purpose:** Ground quality in the PRD's concrete domain.
- **Dependencies:** I-029, A-001, domain reviewer availability.
- **Likely files:** Golden expectation JSON/Markdown under test fixtures; no production code.
- **Steps:** Define expected products/components/packages/resins, target applications/segments, channel ambiguity, finished-vs-component questions, evidence links, conflicts, prohibited assumptions; obtain domain review.
- **Success criteria:** Expectations cover fluid formulators, coatings, flooring/civil engineering, adhesives/composites/pipe, and distributors without making all mandatory targets.
- **Validation/evidence:** Fixture schema/checksum and reviewer sign-off.
- **Stop/escalate:** Unverified technical facts remain synthetic/explicit assumptions.

### A-023 — Build non-industrial understanding golden expectations

- **Purpose:** Prove the ontology/question planner is not chemical-specific.
- **Dependencies:** I-029, A-001.
- **Likely files:** Non-industrial expectation fixtures.
- **Steps:** Choose approved unlike B2B business; define evidence/unknowns/questions/segments; avoid reusing chemical fields as required; obtain product review.
- **Success criteria:** Same pipeline yields useful but materially different understanding/questions with no manufacturing assumptions.
- **Validation/evidence:** Fixture tests and semantic comparison report.
- **Stop/escalate:** Do not choose regulated/sensitive vertical without policy.

### A-024 — Add agent replay/evaluation harness

- **Purpose:** Compare agent versions semantically before rollout.
- **Dependencies:** A-005/A-006, A-010/A-012/A-017, A-022/A-023.
- **Likely files:** New `scripts/evaluate-agents.mjs` or TS test harness, fixtures/reports, package script.
- **Steps:** Run pinned fixture inputs through mocked/recorded or approved model path; score citation validity, schema, unsupported claims, unknown preservation, question relevance/diversity, cost/latency; emit diff by version; fail thresholds from D-015.
- **Success criteria:** Report is reproducible and names regressions; no exact-prose requirement; provider calls are off by default.
- **Validation/evidence:** Local replay command against stored approved outputs.
- **Stop/escalate:** Live evaluation needs explicit paid/data approval.

### A-025 — Add adversarial agent-policy regression suite

- **Purpose:** Test prompt injection, conflicting evidence, sensitive data, and tool abuse.
- **Dependencies:** A-008/A-009/A-011/A-017, I-029.
- **Likely files:** New agent security test file/fixtures.
- **Steps:** Inject instructions in PDF/URL/table, false citations, cross-tenant IDs, huge context, source asking external fetch, protected-trait targeting, unsupported compliance claims; assert denial/unknown/review.
- **Success criteria:** Zero unauthorized tool call, tenant leak, secret request, protected-trait inference, or unsupported confirmed claim.
- **Validation/evidence:** Focused adversarial tests and tool-call ledger assertions.
- **Stop/escalate:** Any failure is a kill criterion, not a tolerated flaky case.

### A-026 — Phase 4 understanding/adaptive-question acceptance gate

- **Purpose:** Prove the system understands unlike businesses through evidence and useful questions.
- **Dependencies:** A-001 through A-025.
- **Likely files:** Validation receipt only unless defects become separate tasks.
- **Steps:** Run chemical/non-industrial/adversarial fixtures end to end; review citations and unknowns; answer/correct/defer; approve version; replay; inspect agent/tool/usage/audit traces; run release check.
- **Success criteria:** D-008/D-009/D-015 thresholds pass; questions differ by business and avoid known facts; every material assertion resolves or is unknown; approvals are human/audited.
- **Validation/evidence:** `docs/validation/phase-4-understanding-questions.md`, sanitized artifacts, citation sample, replay report, reviewer receipt.
- **Stop/escalate:** Fixed questionnaire behavior, unsupported claim, hidden contradiction, or untraceable agent output fails the phase.

## Phase 5 tasks — Versioned ICPs and lead plays

### P-001 — Define ICP domain contracts

- **Purpose:** Encode one reusable ICP shape independent of any vertical.
- **Dependencies:** A-026, D-008/D-015.
- **Likely files:** New `src/lib/icps/types.ts`, `schemas.ts`, tests.
- **Steps:** Define segment/use case/jobs/pains/positive signals/disqualifiers/size-capability/geography/channel/buying triggers/economics/evidence thresholds/uncertainty tolerance/buying-center roles; distinguish rule, rationale, and evidence; strict Zod validation.
- **Success criteria:** Chemical and non-industrial ICPs validate without special code; no fixed company-size/industry field is universally required.
- **Validation/evidence:** Schema fixture tests and typecheck.
- **Stop/escalate:** Unapproved evidence threshold names block contract finalization.

### P-002 — Add Postgres ICP and version tables

- **Purpose:** Persist immutable reviewed ICP history.
- **Dependencies:** P-001, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add `icps`, `icp_versions`, and optional `icp_examples` with tenant/workspace, stable key, version, status, content/hash, source understanding version, reviewer/approval, supersession, timestamps; tenant uniqueness/indexes.
- **Success criteria:** Activated/approved version is immutable; same stable key can exist in another tenant; history remains reproducible.
- **Validation/evidence:** Migration rehearsal and constraint tests.
- **Stop/escalate:** Serialize with other schema tasks.

### P-003 — Add SQLite ICP and version schema

- **Purpose:** Mirror P-002 for local development/testing.
- **Dependencies:** P-002, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Add equivalent tables/indexes/upgrade path; test tenant uniqueness, immutable state through service, and fresh/upgrade behavior.
- **Success criteria:** Local fixtures support multiple versions and tenants with same stable key.
- **Validation/evidence:** Focused schema tests.
- **Stop/escalate:** No schema shortcut that changes lifecycle semantics.

### P-004 — Implement ICP repository and lifecycle

- **Purpose:** Centralize draft, review, approve, supersede, and archive operations.
- **Dependencies:** P-002/P-003, T-012/T-015.
- **Likely files:** New `src/lib/icps/repository.ts`, `lifecycle.ts`, tests.
- **Steps:** Add tenant-scoped CRUD for drafts; clone approved version for edits; enforce transitions; transactionally approve one current version; audit actor/reason; expose version diff inputs.
- **Success criteria:** Two concurrent approvals cannot create two current versions; old approved rows cannot mutate.
- **Validation/evidence:** Lifecycle/concurrency/role tests.
- **Stop/escalate:** No direct approval via generic update.

### P-005 — Implement ICP validation and explainability

- **Purpose:** Detect incomplete, contradictory, or untestable profiles before approval.
- **Dependencies:** P-001/P-004, D-008.
- **Likely files:** New `src/lib/icps/validator.ts`, tests.
- **Steps:** Validate signal/disqualifier conflicts, missing evidence rule, impossible geography/channel, empty segment/use case, undefined thresholds, sensitive/protected targeting, and source-understanding references; return blocking/warning reasons.
- **Success criteria:** Approval readiness is deterministic; every failure names path, reason, and suggested required decision.
- **Validation/evidence:** Table-driven valid/invalid fixture tests.
- **Stop/escalate:** Protected-trait or unsupported regulatory targeting is a policy block.

### P-006 — Implement ICP proposal agent

- **Purpose:** Propose—not approve—one or more ICP drafts from approved understanding.
- **Dependencies:** A-006/A-009, A-013, P-001/P-005.
- **Likely files:** New `src/lib/agents/icp-proposer.ts`, prompt/schema/tests.
- **Steps:** Build context from approved understanding/claims; request multiple segments where evidence supports them; require rationale/evidence/unknowns; validate schema/citations; persist drafts; route to human review.
- **Success criteria:** Output cannot activate itself; material rules cite approved knowledge; chemical fixture yields distinct relevant segments without making all industries mandatory.
- **Validation/evidence:** Golden/adversarial agent replay tests.
- **Stop/escalate:** Unsupported segmentation stays unknown/review-required.

### P-007 — Add ICP examples and counterexamples service

- **Purpose:** Make profile boundaries concrete before plays use them.
- **Dependencies:** P-004/P-005.
- **Likely files:** New `src/lib/icps/examples.ts`, tests.
- **Steps:** Store synthetic/real-authorized example label, input facts, expected fit/no-fit/review result, rationale, evidence; evaluate with deterministic validator; version with ICP; preserve reviewer correction.
- **Success criteria:** Each launch ICP has at least one positive, counterexample, and ambiguous example with expected reasons.
- **Validation/evidence:** Example evaluation tests.
- **Stop/escalate:** Do not store customer identity in public/shared fixtures.

### P-008 — Add ICP review and approval service

- **Purpose:** Enforce human gate and domain-review requirements.
- **Dependencies:** P-004 through P-007, T-012, I-027.
- **Likely files:** New `src/lib/icps/review.ts`, tests.
- **Steps:** Create review task; show validation/evidence/unknowns/examples; record approve/edit/reject/request-info; require approved role/domain reviewer for high-risk claims; update lifecycle transactionally.
- **Success criteria:** Agent or unauthorized role cannot approve; approval captures reviewer and exact content hash.
- **Validation/evidence:** Role/state/audit tests.
- **Stop/escalate:** High-risk unresolved review blocks approval.

### P-009 — Define lead-play contracts

- **Purpose:** Combine an ICP slice with one bounded growth motion.
- **Dependencies:** P-001, D-010/D-013/D-015.
- **Likely files:** New `src/lib/lead-plays/types.ts`, `schemas.ts`, tests.
- **Steps:** Define play lifecycle, objective, ICP version, segment overrides, search hypotheses/query families, source allowlist, qualification rubric, scoring weights, buying-center strategy, outreach policy, budgets/cadence/stop conditions/success metrics; hash/version strict content.
- **Success criteria:** Metalworking-fluid formulators and epoxy distributor expansion can be separate plays; no source or send action is implicit.
- **Validation/evidence:** Strict schema fixtures and typecheck.
- **Stop/escalate:** Conflicting score dimension names require architecture decision before continuing.

### P-010 — Add Postgres lead-play tables

- **Purpose:** Persist stable plays, immutable versions, and examples.
- **Dependencies:** P-009, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add `lead_plays`, `lead_play_versions`, `lead_play_examples`; tenant/workspace and ICP version FKs; stable/version uniqueness; lifecycle/review/activation fields; content hash; tenant-prefixed indexes.
- **Success criteria:** One current active version per play; activated content immutable; cross-tenant references impossible.
- **Validation/evidence:** Migration rehearsal and negative constraint queries.
- **Stop/escalate:** Serialize schema edits.

### P-011 — Add SQLite lead-play schema

- **Purpose:** Mirror P-010 locally.
- **Dependencies:** P-010, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Add equivalent tables/indexes/upgrade handling; test two tenants, multiple versions, examples, ICP FK, and fresh/upgrade.
- **Success criteria:** Local behavior matches lifecycle/ownership contract.
- **Validation/evidence:** Focused DB tests.
- **Stop/escalate:** No flattening all version content into mutable settings.

### P-012 — Implement lead-play repository and lifecycle

- **Purpose:** Provide transaction-safe draft, review, activate, pause, supersede, archive.
- **Dependencies:** P-010/P-011, T-012/T-015.
- **Likely files:** New `src/lib/lead-plays/repository.ts`, `lifecycle.ts`, tests.
- **Steps:** Add scoped reads/draft create/clone; enforce transition table; activate one version and supersede previous in transaction; pause execution without mutating version; audit every transition.
- **Success criteria:** Concurrent activation yields one winner; paused play starts no runs; activated version is immutable.
- **Validation/evidence:** Concurrency/state/role tests.
- **Stop/escalate:** Do not equate archive with deleting outcomes/history.

### P-013 — Implement search-strategy contract validator

- **Purpose:** Ensure a play contains bounded, connector-neutral search logic.
- **Dependencies:** P-009, D-010.
- **Likely files:** New `src/lib/lead-plays/search-strategy.ts`, tests.
- **Steps:** Validate hypotheses, query families, geography/scope, source operation, required observations, exclusions, stop conditions, dedupe approach; ensure every requested connector/operation is allowlisted; no raw scraper instructions.
- **Success criteria:** Strategy is executable into bounded units or fails with explicit missing data; different plays can define different logic.
- **Validation/evidence:** Chemical/non-industrial strategy tests.
- **Stop/escalate:** Unknown source terms or unbounded web search blocks readiness.

### P-014 — Implement qualification-rubric validator

- **Purpose:** Make fit/disqualifier/evidence logic deterministic and evidence-aware.
- **Dependencies:** P-009, D-008.
- **Likely files:** New `src/lib/lead-plays/qualification-rubric.ts`, tests.
- **Steps:** Validate positive/hard disqualifier/unknown/review rules, claim paths, evidence grades/freshness, inferred-vs-observed allowance, conflict handling; produce rule IDs and reason templates.
- **Success criteria:** Every rule can be evaluated from evidence or return unknown/review; no opaque free-text criterion controls qualification.
- **Validation/evidence:** Rule fixture tests.
- **Stop/escalate:** Undefined claim path or evidence grade blocks activation.

### P-015 — Implement play score-rubric validator

- **Purpose:** Validate fit/evidence/need/access/timing/risk/priority dimensions and weights.
- **Dependencies:** P-009, D-015.
- **Likely files:** New `src/lib/lead-plays/scoring-rubric.ts`, tests.
- **Steps:** Validate dimensions, factor IDs, weights/ranges, hard-disqualifier effect, missing-evidence behavior, normalization label, thresholds, version; reject cross-play comparison claims.
- **Success criteria:** Weights and thresholds are finite/bounded and explainable; raw score semantics stay play-local.
- **Validation/evidence:** Boundary/invalid-rubric tests.
- **Stop/escalate:** Missing approved thresholds block activation.

### P-016 — Implement play source/budget/outreach policy validator

- **Purpose:** Block plays that request unauthorized sources, spend, contacts, or sending.
- **Dependencies:** P-009, D-010/D-012/D-013.
- **Likely files:** New `src/lib/lead-plays/policy-validator.ts`, tests.
- **Steps:** Resolve connector allowlist/policy version, fields/data classes/geography/retention, budget/cadence, contact-use states, draft-only outreach, human gates; return blocking reasons.
- **Success criteria:** Missing/expired source policy, no hard budget, automatic-send request, or contact-policy conflict blocks activation before any work.
- **Validation/evidence:** Decision-table tests with zero provider-call spies.
- **Stop/escalate:** Legal/policy ambiguity cannot be downgraded to warning by a model.

### P-017 — Implement play example evaluator

- **Purpose:** Simulate positive/counter/ambiguous accounts before activation.
- **Dependencies:** P-012 through P-016.
- **Likely files:** New `src/lib/lead-plays/example-evaluator.ts`, tests.
- **Steps:** Evaluate stored facts against qualification and score rubrics; list passes/fails/unknowns/disqualifiers, expected score vector, and evidence gaps; compare to reviewer expectation; store validator version/result.
- **Success criteria:** Mismatched expected outcome blocks readiness with factor-level explanation.
- **Validation/evidence:** Chemical play example tests.
- **Stop/escalate:** Do not change expected examples automatically to make evaluator green.

### P-018 — Implement lead-play proposal agent

- **Purpose:** Propose multiple bounded plays from approved understanding/ICPs.
- **Dependencies:** A agent runtime, P-008/P-009/P-013 through P-017.
- **Likely files:** New `src/lib/agents/lead-play-proposer.ts`, prompt/schema/tests.
- **Steps:** Select approved ICP/context; generate distinct play objectives/search hypotheses/buying roles/outcome definitions; require citations/rationale/unknowns; validate source/budget/outreach policy; persist drafts only.
- **Success criteria:** Chemical fixture proposes distinct formulator/channel/application plays where supported; unsupported source/contact/send settings are omitted or blocked.
- **Validation/evidence:** Golden/adversarial replay tests.
- **Stop/escalate:** Agent cannot activate or choose legal policy.

### P-019 — Add ICP/lead-play API contracts

- **Purpose:** Expose safe operations to future builder UI.
- **Dependencies:** P-004/P-008/P-012/P-017/P-018.
- **Likely files:** Server actions/routes, DTO schemas, tests.
- **Steps:** Add list/detail/version/diff/create/clone/propose/validate/review/approve/activate/pause/archive/example-evaluate endpoints; enforce permissions/idempotency; paginate; return reason codes/citations.
- **Success criteria:** Wrong tenant/role cannot read or transition; client cannot set approved/active directly; activated version payload matches preview hash.
- **Validation/evidence:** Contract/action/route tests.
- **Stop/escalate:** No endpoint triggers discovery during activation unless a separately approved explicit action is called.

### P-020 — Phase 5 ICP/play acceptance gate

- **Purpose:** Prove tenants can create multiple evidence-backed, human-approved strategies.
- **Dependencies:** P-001 through P-019.
- **Likely files:** Validation receipt only unless defects become tasks.
- **Steps:** Propose/edit/review/approve ICPs; create at least two chemical plays and one non-industrial play; evaluate examples/counterexamples; activate/pause; inspect hashes/audit; attempt role/tenant/policy bypass; run release check.
- **Success criteria:** D-015 thresholds pass; active play is immutable, policy-safe, source/budget-bounded, and explainable; no fixed questionnaire/source/score/send assumption.
- **Validation/evidence:** `docs/validation/phase-5-icp-lead-plays.md`, sanitized DB/API artifacts and reviewer receipt.
- **Stop/escalate:** Any unapproved source, automatic send, unresolved blocking example, or cross-tenant transition fails the phase.

## Phase 6 tasks — Connector registry, bounded discovery, source observations, accounts, and compatibility migration

### C-001 — Define connector adapter contracts

- **Purpose:** Create the provider-neutral seam between source execution and platform data.
- **Dependencies:** P-020, D-010.
- **Likely files:** New `src/lib/connectors/contracts.ts`, fixture adapter/tests.
- **Steps:** Define descriptor, operation, authorization mode, policy requirements, estimate, bounded page request/result, cursor, usage, normalized observation draft, abort/context; prohibit account/qualification mutation imports; add in-memory adapter.
- **Success criteria:** Fixture and Google adapters can implement the same `estimate`/`execute` interface; one call performs one bounded page.
- **Validation/evidence:** Contract tests, typecheck, static import-boundary test.
- **Stop/escalate:** Source incapable of bounded/idempotent execution needs a special approved design.

### C-002 — Add Postgres connector registry and connector-account tables

- **Purpose:** Record global capabilities and tenant-authorized instances without credentials.
- **Dependencies:** C-001, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add connectors/descriptors and tenant connector accounts with version, operations, auth mode, health, enable/disable, credential reference, timestamps; tenant uniqueness/indexes; no secret fields.
- **Success criteria:** Disabling one tenant account does not disable another; unregistered version cannot execute.
- **Validation/evidence:** Migration rehearsal and constraint tests.
- **Stop/escalate:** Credential storage contract must be approved.

### C-003 — Add SQLite connector registry schema

- **Purpose:** Mirror metadata/authorization state locally.
- **Dependencies:** C-002, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Add equivalent registry/account tables, indexes, upgrade behavior, fake credential references only; test tenant isolation.
- **Success criteria:** Local fixture connectors can be enabled per tenant without secrets.
- **Validation/evidence:** Focused DB tests.
- **Stop/escalate:** No production token in SQLite fixtures.

### C-004 — Implement connector registry service

- **Purpose:** Resolve exact adapter/version and tenant account safely.
- **Dependencies:** C-001 through C-003.
- **Likely files:** New `src/lib/connectors/registry.ts`, tests.
- **Steps:** Register known code adapters; read descriptor/account; verify version/capability/health/tenant; resolve secret through approved server boundary only at execution; audit enable/disable/health changes.
- **Success criteria:** Unknown/mismatched/disabled connector fails before secret/provider access.
- **Validation/evidence:** Registry resolution and two-tenant tests.
- **Stop/escalate:** No dynamic code loading from database values.

### C-005 — Add versioned source-policy tables

- **Purpose:** Reproduce terms, allowed operations/fields/data classes/retention/geography/cost policy for every run.
- **Dependencies:** C-002/C-003, D-010.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add stable policy and immutable versions with connector, tenant/global scope, allowed operations/fields, personal-data classes, raw retention, expiry, attribution, jurisdiction, rate/cost limits, terms locator/review date; link connector account current version.
- **Success criteria:** Every execution can name exact policy version; expired/missing version is distinguishable.
- **Validation/evidence:** Both-backend lifecycle/constraint tests.
- **Stop/escalate:** Legal/source owner must approve policy content.

### C-006 — Implement deny-by-default connector policy evaluator

- **Purpose:** Block unauthorized source work before provider access.
- **Dependencies:** C-004/C-005, tenant features, D-010/D-012.
- **Likely files:** New `src/lib/connectors/policy.ts`, tests.
- **Steps:** Evaluate tenant account, exact policy version, operation, fields, data classes, geography, retention, health, feature/kill switch, role/human gate, budget precondition; return structured allow/block/review reason; audit block.
- **Success criteria:** Disabled/expired/unapproved/field-ineligible request causes zero provider/secret calls.
- **Validation/evidence:** Exhaustive decision-table tests with spies.
- **Stop/escalate:** Missing policy is always deny.

### C-007 — Add discovery-plan tables

- **Purpose:** Persist approved plan separately from execution.
- **Dependencies:** P lead-play tables, C-005, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add plan/version/unit with tenant/workspace/play version/market/query family/connector/policy snapshot/estimate/dedupe/approval/stop conditions/content hash; prevent execution before approved state.
- **Success criteria:** Stored plan exactly reproduces preview; unit cannot reference unapproved connector/policy.
- **Validation/evidence:** Both-backend repository/constraint tests.
- **Stop/escalate:** Plan approval role must be defined.

### C-008 — Implement adaptive discovery planner

- **Purpose:** Convert a play and scope into bounded connector-specific units.
- **Dependencies:** P-017, C-006/C-007.
- **Likely files:** New `src/lib/discovery/planner.ts`, `query-families.ts`, tests.
- **Steps:** Read play search strategies/coverage; filter eligible connectors; generate different query families per strategy; estimate cost/yield; add dedupe/stop rules; return preview/reasons; never add unlisted source.
- **Success criteria:** Chemical plays produce different query logic; no fixed category list; unknown estimate/policy blocks approval.
- **Validation/evidence:** Golden planner tests.
- **Stop/escalate:** Unbounded query or cost is not executable.

### C-009 — Implement discovery-plan approval service

- **Purpose:** Enforce human approval of cost/sources/scope before runs.
- **Dependencies:** C-007/C-008, T-012/T-015.
- **Likely files:** New `src/lib/discovery/plan-approval.ts`, tests.
- **Steps:** Persist preview hash; assign review; show source terms/cost/query scope/dedupe/stop rules; record approve/edit/reject; ensure approved hash matches executed content; audit.
- **Success criteria:** Agent cannot approve; edits require new preview/version; high-cost plan obeys separate gate.
- **Validation/evidence:** Role/hash/state tests.
- **Stop/escalate:** No execution from draft/rejected/stale-policy plan.

### C-010 — Add source-run and run-unit tables

- **Purpose:** Generalize reliable crawl leasing without ZIP/category requirements.
- **Dependencies:** C-007/C-009, D-005.
- **Likely files:** Postgres migration, SQLite schema, state/query tests.
- **Steps:** Add run/unit with tenant/workspace/plan/connector/policy/request/cursor/lease/attempt/retry/idempotency/counters/terminal reason; implement pause/resume/cancel/block/retry/complete/stale lease states and tenant indexes.
- **Success criteria:** Two workers cannot lease same unit; aborted work not successful; no unit without approved plan.
- **Validation/evidence:** Both-backend lease/concurrency/state tests.
- **Stop/escalate:** Backend parity issue returns to D-004.

### C-011 — Add source-observation tables

- **Purpose:** Create append-only provenance consumed by account resolution.
- **Dependencies:** C-001/C-005/C-010, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add tenant/workspace/source run/unit/connector/policy/external ID/retrieved/observed/locator/query hash/normalized claims/identity hints/retention/raw payload reference/idempotency; immutable content and tenant uniqueness.
- **Success criteria:** Replay does not duplicate or overwrite; raw payload reference allowed only by policy.
- **Validation/evidence:** Both-backend idempotency/immutability/cross-tenant tests.
- **Stop/escalate:** No raw provider response in unrestricted JSON.

### C-012 — Implement source-observation ingestion repository

- **Purpose:** Validate adapter output and persist one page transactionally.
- **Dependencies:** C-011, evidence contracts.
- **Likely files:** New `src/lib/observations/ingest.ts`, query module/tests.
- **Steps:** Validate tenant/run/connector/policy; validate claim fields/data classes; calculate stable idempotency; insert observations/usage/page checkpoint transactionally; preserve duplicate receipt; emit downstream resolution jobs.
- **Success criteria:** Partial page failure writes neither observations nor cursor; retry is no-op/consistent.
- **Validation/evidence:** Transaction/idempotency/policy tests.
- **Stop/escalate:** Adapter cannot write canonical account directly.

### C-013 — Add generic source budget/reservation/usage tables

- **Purpose:** Generalize Google-only caps by tenant/workspace/play/connector/operation.
- **Dependencies:** C-002/C-010, D-015.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add budgets, periods/currency/soft-hard limits/dimensions; reservations with idempotency/expiry; usage with estimate/actual/provider metadata; indexes/report fields; keep legacy events during migration.
- **Success criteria:** Totals can be computed at every required dimension; no unattributed event.
- **Validation/evidence:** Both-backend schema/accounting tests.
- **Stop/escalate:** Currency/owner precedence ambiguity blocks implementation.

### C-014 — Implement atomic source-budget ledger

- **Purpose:** Prevent concurrent workers exceeding hard caps.
- **Dependencies:** C-013, C-006.
- **Likely files:** New `src/lib/discovery/budget-ledger.ts`, tests.
- **Steps:** Reserve worst-case cost transactionally; deny insufficient hard limit; settle actual; release unused; handle unknown final charge/reconciliation; expire stale; idempotent retry; audit overrun.
- **Success criteria:** Concurrent reservations stay under cap; retry does not double count; soft/hard behaviors match policy.
- **Validation/evidence:** Concurrency/boundary/failure tests.
- **Stop/escalate:** Provider operation with unbounded cost requires manual maximum.

### C-015 — Implement generic connector runner

- **Purpose:** Execute exactly one bounded source-run page.
- **Dependencies:** C-004/C-006/C-010/C-012/C-014.
- **Likely files:** New `src/lib/discovery/runner.ts`, integration tests.
- **Steps:** Lease scoped unit; re-evaluate policy; reserve budget; resolve adapter/credential; execute one page with abort; ingest observations; settle usage; save cursor/complete; classify retry/block/fail; record trace/audit; never mutate account.
- **Success criteria:** Safe retry; one bounded call; no duplicate observation/cost; suspend/kill/cancel honored.
- **Validation/evidence:** Fixture-adapter success/retry/cancel/policy/budget integration tests.
- **Stop/escalate:** Hidden multipage work or account mutation violates contract.

### C-016 — Add source-run worker endpoint and scheduler metadata

- **Purpose:** Integrate runner with existing worker conventions.
- **Dependencies:** C-015, T-017/G-020.
- **Likely files:** New `src/app/api/source-runs/process-next/route.ts`, scheduler metadata, route tests.
- **Steps:** POST-only internal worker wrapper; authenticate service then derive tenant from leased run; pass abort/deadline; record status; expose enable/disable only through approved setting; leave old crawl route active.
- **Success criteria:** GET 405; unauthorized 401/403; forged tenant ignored/rejected; canceled request propagates abort.
- **Validation/evidence:** Route method/auth/abort tests.
- **Stop/escalate:** No scheduler enablement in production.

### C-017 — Implement Google Places connector adapter

- **Purpose:** Reuse current HTTP/retry/cache logic behind C-001.
- **Dependencies:** C-001/C-015, existing Google client tests.
- **Likely files:** New `src/lib/connectors/google-places-adapter.ts`, existing `src/lib/google-places.ts`, tests.
- **Steps:** Implement discover/enrich operations; map generic request to text search/details; translate cursor/page token; return usage/observations; inject key/clock/HTTP; no account/lead repository import.
- **Success criteria:** Contract tests pass; existing Google tests remain green; one execute is one API page/operation.
- **Validation/evidence:** Existing plus new adapter tests with mocks.
- **Stop/escalate:** No live paid call.

### C-018 — Implement Google result normalizer

- **Purpose:** Remove `PlaceResult → lead` coupling.
- **Dependencies:** C-011/C-017.
- **Likely files:** New `src/lib/connectors/google-places-normalizer.ts`, tests.
- **Steps:** Map place ID/name/domain/phone/address/types/status/rating/location to observed claims/identity hints; preserve absent vs explicit; attach locator/retrieval/policy; stable idempotency; do not classify website opportunity.
- **Success criteria:** Normalization creates observation only; deterministic output; restricted fields omitted.
- **Validation/evidence:** Field/absence/idempotency tests.
- **Stop/escalate:** Requested field outside policy blocks before API call.

### C-019 — Enforce Google field, storage, review, and attribution policy

- **Purpose:** Preserve current compliance while making policy version explicit.
- **Dependencies:** C-005/C-006/C-017/C-018.
- **Likely files:** Adapter/normalizer/cache policy tests, `src/app/data-sources/page.tsx` later UI/docs.
- **Steps:** Encode permitted masks per operation/SKU; apply TTL/raw retention; preserve recursive review removal/no review display; record attribution; reject policy-ineligible field; add policy review date.
- **Success criteria:** No raw reviews stored; policy-ineligible request makes zero call; required attribution metadata available.
- **Validation/evidence:** Google policy/cache/recovery tests.
- **Stop/escalate:** Official terms must be reverified before release; this plan does not freeze them.

### C-020 — Implement customer-list fixture connector

- **Purpose:** Prove connector model supports tenant-provided structured data without paid source.
- **Dependencies:** C-001/C-005/C-015, ingestion spreadsheet evidence.
- **Likely files:** New `src/lib/connectors/customer-list-adapter.ts`, tests.
- **Steps:** Read approved uploaded table/version; map configured columns to account observations; preserve row/cell locator and client-provided origin; validate permitted purpose; paginate rows; record zero provider cost.
- **Success criteria:** Produces cited observations, not canonical accounts; malformed/missing columns create review/block; cross-tenant document denied.
- **Validation/evidence:** Spreadsheet fixture contract/integration tests.
- **Stop/escalate:** Customer list cannot be treated as public evidence or shared across tenants.

### C-021 — Add connector contract conformance suite

- **Purpose:** Make every adapter pass the same reliability/compliance tests.
- **Dependencies:** C-001/C-006/C-015/C-017/C-020.
- **Likely files:** New reusable test suite under `src/lib/connectors/__tests__` or current convention.
- **Steps:** Test descriptor, auth, policy, estimate, bounded page, cursor, cancellation, idempotency, usage, provenance, field retention, 401/403/404/429/5xx/malformed, disabled/expired/kill.
- **Success criteria:** Every enabled adapter passes; unsupported adapter fails closed; no live provider by default.
- **Validation/evidence:** One package script/focused Vitest command.
- **Stop/escalate:** Source-specific exception requires policy owner sign-off and explicit test.

### C-022 — Add Postgres canonical-account tables

- **Purpose:** Replace global `place_id` identity with tenant-scoped organizations.
- **Dependencies:** C-011, D-011, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add accounts, aliases, source identities, relationships, observation links, status/projection metadata; tenant/workspace every row; tenant-scoped uniqueness/indexes; no global name/domain uniqueness.
- **Success criteria:** Same organization can exist independently across tenants; source identity resolves within tenant.
- **Validation/evidence:** Migration rehearsal and cross-tenant duplicate/relationship tests.
- **Stop/escalate:** Ownership/resolution policy ambiguity blocks.

### C-023 — Add SQLite canonical-account schema

- **Purpose:** Mirror C-022 locally.
- **Dependencies:** C-022, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, schema tests.
- **Steps:** Add equivalent tables/FKs/indexes/upgrades; test two tenants, aliases, source identities, relationships, links.
- **Success criteria:** Local account fixtures preserve same ownership and identity semantics.
- **Validation/evidence:** Focused DB tests.
- **Stop/escalate:** No global domain uniqueness.

### C-024 — Implement account projection repository

- **Purpose:** Derive canonical fields without destroying observations.
- **Dependencies:** C-012/C-022/C-023, D-011.
- **Likely files:** New `src/lib/accounts/repository.ts`, `projector.ts`, tests.
- **Steps:** Link observations; apply approved reliability/freshness/precedence per field; store winning evidence reference; surface conflicts; rebuild idempotently; never edit observation.
- **Success criteria:** Rebuild yields same projection; every field has source; conflicts visible.
- **Validation/evidence:** Deterministic projection/conflict tests.
- **Stop/escalate:** Missing precedence rule routes to review, not guess.

### C-025 — Implement exact account resolution

- **Purpose:** Auto-link only strong deterministic identity.
- **Dependencies:** C-022/C-024, D-011.
- **Likely files:** New `src/lib/accounts/exact-resolution.ts`, tests.
- **Steps:** Match tenant+connector external ID; verified normalized domain; approved phone+location combination; detect conflicts; return matched/new/ambiguous with rule/evidence/version; no merge.
- **Success criteria:** Repeated place/row dedupes; cross-tenant impossible; conflicting exact signals become ambiguous.
- **Validation/evidence:** Golden exact-match tests.
- **Stop/escalate:** Exact conflict requires human review.

### C-026 — Implement fuzzy account-resolution candidates

- **Purpose:** Rank possible duplicates without destructive auto-merge.
- **Dependencies:** C-025, D-011/D-015 thresholds.
- **Likely files:** New `src/lib/accounts/fuzzy-resolution.ts`, tests.
- **Steps:** Normalize names/domains/addresses/phones; create tenant blocking keys; calculate explainable similarity factors; emit candidate/confidence; auto-link only approved threshold; create review task otherwise.
- **Success criteria:** Similar names/different locations stay separate; aliases/matching domains produce explainable candidate; benchmark threshold met.
- **Validation/evidence:** Labeled duplicate/non-duplicate fixture precision report.
- **Stop/escalate:** No production threshold without labeled benchmark.

### C-027 — Implement reviewed account merge/unmerge

- **Purpose:** Make merges transactional, auditable, and recoverable.
- **Dependencies:** C-026, T-012/T-015.
- **Likely files:** New merge-event schema if not in C-022, `src/lib/accounts/merge.ts`, tests.
- **Steps:** Require target/source/reason/actor/evidence; validate tenant/conflicts/downstream activity; move aliases/identities/links/memberships/contacts transactionally; mark source merged; preserve event/prior projection; allow controlled reversal before irreversible activity.
- **Success criteria:** No hard delete; every move reconstructable; conflicting verified identity blocks.
- **Validation/evidence:** Merge/rollback/concurrency/two-tenant tests.
- **Stop/escalate:** Irreversible outreach/outcome conflict requires specialist review.

### C-028 — Add account-play membership and rediscovery records

- **Purpose:** Let one account join multiple plays without duplicate research.
- **Dependencies:** P play tables, C-024/C-025.
- **Likely files:** Postgres/SQLite schema, repository/tests.
- **Steps:** Add membership by account/play version/status and discovery occurrence by source run/query/observation; unique active membership; preserve rediscovery events; no duplicate account creation.
- **Success criteria:** Two plays produce one account, two memberships, and visible source occurrences.
- **Validation/evidence:** Overlap/idempotency tests.
- **Stop/escalate:** Suppression scope across plays must follow D-012.

### C-029 — Implement evidence freshness evaluator and refresh suggestions

- **Purpose:** Make staleness policy/field/source aware.
- **Dependencies:** C-005/C-011/C-024/C-028.
- **Likely files:** New `src/lib/accounts/freshness.ts`, tests.
- **Steps:** Evaluate observation/claim age by policy/class/play threshold; mark current/stale/expired/unknown without mutation; compute account required-evidence freshness; create bounded refresh suggestion, not automatic call; update qualification trigger.
- **Success criteria:** Durable ID can remain current while phone stale; stale evidence visible and penalized; no call without approval/budget.
- **Validation/evidence:** Time-based field/play tests.
- **Stop/escalate:** Personal-data field without policy blocks use.

### C-030 — Seed legacy website lead play and translator

- **Purpose:** Represent current product as specialized compatibility play.
- **Dependencies:** P lead-play persistence, C-002/C-005/C-007/C-019, G-023.
- **Likely files:** Seed migration/config, new `src/lib/compatibility/website-lead-play.ts`, tests.
- **Steps:** Seed Google connector/policy and local website opportunity play for compatibility tenant; map categories/geography/website states/masks/pagination/current scoring/budgets/copy-only outreach; translate current dashboard payload to discovery-plan request while preserving response shape.
- **Success criteria:** Current dashboard preview estimates equivalent plan without UI changes; new tenants do not inherit it automatically.
- **Validation/evidence:** Snapshot/parity/dashboard tests.
- **Stop/escalate:** Cost/unit discrepancy blocks cutover.

### C-031 — Backfill legacy accounts and observations

- **Purpose:** Populate generalized truth while retaining all old rows.
- **Dependencies:** C-022 through C-030, D-005.
- **Likely files:** Forward-only migration or explicit backfill script/tests.
- **Steps:** Create accounts from places master then leads; add Google source identity; convert allowed place observations with policy tags; link leads/accounts/compatibility play; map crawl/source runs where possible; counts/checksums/idempotent rerun; no deletion.
- **Success criteria:** Every active lead maps once; observations reconcile; ambiguous/conflicting IDs block/report.
- **Validation/evidence:** Sanitized rehearsal manifest, duplicate fixture, second-run no-op.
- **Stop/escalate:** One place ID to multiple accounts or non-idempotent output blocks.

### C-032 — Cut legacy execution to generic runner behind rollback flag

- **Purpose:** Use generalized discovery without breaking current routes/UI or duplicating calls.
- **Dependencies:** C-015 through C-031, G parity suite.
- **Likely files:** Crawl actions/worker/enrichment, compatibility projector, feature flags/tests.
- **Steps:** Create generic plan/run from old action; execute Google via adapter; project account/play result back to legacy lead/counters; prevent both workers leasing same work; retain old route/shape; add tenant rollback flag; compare parity before default.
- **Success criteria:** One provider call per unit/page; dashboard/coverage/leads/quality/enrichment remain operational; rollback restores old path.
- **Validation/evidence:** Existing and new integration suites plus authenticated compatibility smoke/parity report.
- **Stop/escalate:** Duplicate calls, missing leads, counter/status/score drift outside tolerance triggers rollback.

### C-033 — Update recovery contract for discovery/account tables

- **Purpose:** Make all durable Phase 5/6 data restorable in FK-safe order.
- **Dependencies:** C schema/backfill tasks.
- **Likely files:** `scripts/data-transfer-contract.mjs`, recovery tests/docs.
- **Steps:** Add plays/connectors/policies/plans/runs/units/observations/budgets/accounts/aliases/relationships/links/memberships/merge events; declare JSON fields/exclusions; sanitize restricted payloads; version manifest; test dry-run restore.
- **Success criteria:** Every durable table covered; credentials/raw restricted content excluded; tenant/relationship integrity verified.
- **Validation/evidence:** Recovery verification and focused transfer tests.
- **Stop/escalate:** Data without legal export permission is excluded/documented.

### C-034 — Add industrial discovery/account golden scenario

- **Purpose:** Verify different chemical plays produce relevant, traceable accounts.
- **Dependencies:** C-008 through C-029, fixture adapter.
- **Likely files:** Golden fixtures/integration tests.
- **Steps:** Create formulator, coatings, flooring/civil, adhesives/composites/pipe, distributor positives/negatives/duplicates/stale/conflicts; run planner/fixture connector/observations/resolution/projection/membership; assert source lineage and no overgeneralized targets.
- **Success criteria:** Each play yields distinct expected candidates; duplicates resolve per D-011; every account field links to observation.
- **Validation/evidence:** End-to-end fixture integration report.
- **Stop/escalate:** Do not change expectations to hide poor precision.

### C-035 — Phase 6 connector/discovery/account acceptance gate

- **Purpose:** Prove bounded compliant discovery and canonical account creation while legacy flow survives.
- **Dependencies:** C-001 through C-034.
- **Likely files:** Validation receipt only unless defects become tasks.
- **Steps:** Run connector conformance; approved plan preview/approval; fixture run success/retry/cancel/budget/kill; Google mocked adapter; customer-list adapter; account exact/fuzzy/merge/freshness; legacy parity/rollback; recovery; release check.
- **Success criteria:** D-010/D-011/D-015 thresholds pass; no adapter mutates account; provenance intact; no duplicate/unbounded calls; compatibility workflow works.
- **Validation/evidence:** `docs/validation/phase-6-connectors-discovery-accounts.md`, run/usage/observation/account rows, parity and reviewer artifacts.
- **Stop/escalate:** Policy violation, missing provenance, cross-tenant data, destructive merge, unbounded cost, or parity loss fails phase.

## Phase 7 tasks — Contacts, buying centers, qualification, scoring, and review routing

### B-001 — Define contact and permitted-use contracts

- **Purpose:** Separate person identity, role, provenance, verification, and allowed use.
- **Dependencies:** D-012, C-035.
- **Likely files:** New `src/lib/contacts/types.ts`, `schemas.ts`, tests.
- **Steps:** Define contact/person/role hypothesis/observation/source/freshness/verification/purpose/legal basis/channel eligibility/suppression/bounce/opt-out states; strict transitions and DTOs; no email/phone implies permission.
- **Success criteria:** A role hypothesis can exist without person; a person can be discovered but blocked; unknown states fail closed.
- **Validation/evidence:** Schema/state decision-table tests.
- **Stop/escalate:** No implementation before D-012 approval.

### B-002 — Add Postgres contact and observation tables

- **Purpose:** Persist people separately from account projections.
- **Dependencies:** B-001, C account schema, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add contacts, contact observations, account-contact links with tenant/workspace/source/confidence/freshness/verification; append-only observations; tenant-scoped uniqueness/indexes; no global personal identifier uniqueness.
- **Success criteria:** Contact can link to accounts only within tenant; observations remain historical; same person data in two tenants is isolated.
- **Validation/evidence:** Migration rehearsal and cross-tenant constraints.
- **Stop/escalate:** Source policy must permit each stored field.

### B-003 — Add SQLite contact and observation schema

- **Purpose:** Mirror B-002 locally.
- **Dependencies:** B-002, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, tests.
- **Steps:** Add tables/FKs/indexes/upgrades and fixtures; test append-only behavior through service.
- **Success criteria:** Local schema supports isolated contact observations and links.
- **Validation/evidence:** Fresh/upgrade DB tests.
- **Stop/escalate:** No real personal data in fixtures.

### B-004 — Implement contact repository and projection

- **Purpose:** Derive canonical contact fields while retaining source conflicts.
- **Dependencies:** B-002/B-003, D-012.
- **Likely files:** New `src/lib/contacts/repository.ts`, `projector.ts`, tests.
- **Steps:** Ingest/link observations; apply approved source/freshness precedence; store winning evidence; surface conflicts; rebuild idempotently; tenant-safe lookup; never infer permission.
- **Success criteria:** Every projected field cites observation; conflicts visible; no cross-tenant lookup.
- **Validation/evidence:** Projection/conflict/two-tenant tests.
- **Stop/escalate:** Ambiguous identity routes to review.

### B-005 — Add contact-permission and suppression tables

- **Purpose:** Persist purpose/channel eligibility and dominant blocks.
- **Dependencies:** B-001, D-012/D-014.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add permission decisions with purpose/legal basis/authorization/source/jurisdiction/channel/status/expiry/reviewer; suppressions by contact/account/domain/address/tenant scope per policy; opt-out/bounce/do-not-contact priority; immutable history.
- **Success criteria:** Suppression dominance is representable; permission expiry/review required explicit; tenant isolation enforced.
- **Validation/evidence:** Both-backend constraints/state tests.
- **Stop/escalate:** Global suppression semantics require counsel approval.

### B-006 — Implement contact permitted-use evaluator

- **Purpose:** Return allowed/blocked/review with deterministic reasons.
- **Dependencies:** B-004/B-005, D-012/D-013.
- **Likely files:** New `src/lib/contacts/eligibility.ts`, tests.
- **Steps:** Evaluate source authorization, purpose, jurisdiction, channel, freshness/verification, suppression/opt-out/bounce, play outreach policy, role permission; dominant block first; record policy version.
- **Success criteria:** Existing email/phone alone never allows drafting; missing/expired policy is block/review; reasons visible.
- **Validation/evidence:** Exhaustive scenario tests.
- **Stop/escalate:** No default allow.

### B-007 — Implement suppression and correction service

- **Purpose:** Apply opt-out/bounce/do-not-contact immediately and audibly.
- **Dependencies:** B-005/B-006, T audit.
- **Likely files:** New `src/lib/contacts/suppressions.ts`, tests.
- **Steps:** Create suppression transactionally; normalize match keys safely; invalidate eligibility/drafts/queues; preserve source/outcome/reason; authorize correction/removal with reason and policy; audit.
- **Success criteria:** Opt-out blocks future drafting immediately; retry idempotent; unauthorized removal denied.
- **Validation/evidence:** State/concurrency/cross-tenant tests.
- **Stop/escalate:** Eventually consistent unblock is unsafe; remain blocked until recomputation.

### B-008 — Define buying-center contracts and role catalog

- **Purpose:** Model purchase committee roles separately from verified contacts.
- **Dependencies:** P play buying-role contract, B-001.
- **Likely files:** New `src/lib/buying-centers/types.ts`, schemas/tests.
- **Steps:** Define center/status, standard and tenant-custom roles, responsibility/influence/priority, hypothesis vs verified assignment, evidence/confidence/rationale/review; include economic/technical/user/procurement/quality-regulatory/executive/channel custom.
- **Success criteria:** Role can exist with no contact; verified assignment requires reviewed contact/evidence; custom role remains tenant-scoped.
- **Validation/evidence:** Schema/state tests including chemical roles.
- **Stop/escalate:** No model may define a verified person assignment directly.

### B-009 — Add Postgres buying-center tables

- **Purpose:** Persist centers, roles, hypotheses, and assignments.
- **Dependencies:** B-008, C accounts, D-005.
- **Likely files:** One Postgres migration.
- **Steps:** Add buying centers, role definitions, role hypotheses, contact assignments, evidence links/review states with tenant/account/play version; indexes/uniqueness; separate hypothesis and verified FKs/status.
- **Success criteria:** Cross-tenant/account assignment impossible; history preserved.
- **Validation/evidence:** Migration rehearsal/constraint tests.
- **Stop/escalate:** Serialize schema tasks.

### B-010 — Add SQLite buying-center schema

- **Purpose:** Mirror B-009 locally.
- **Dependencies:** B-009, D-004 requiring support.
- **Likely files:** `src/lib/db/schema.ts`, tests.
- **Steps:** Add tables/FKs/indexes/upgrades; fixture standard/custom roles and hypotheses.
- **Success criteria:** Local state matches separation of hypothesis/verified contact.
- **Validation/evidence:** Focused DB tests.
- **Stop/escalate:** Do not flatten roles into account JSON.

### B-011 — Implement buying-center repository and review transitions

- **Purpose:** Manage role hypotheses and human decisions.
- **Dependencies:** B-009/B-010, T permissions/audit.
- **Likely files:** New `src/lib/buying-centers/repository.ts`, service/tests.
- **Steps:** Create/list center/roles; propose hypothesis with evidence; confirm/edit/reject/request-research/unknown; link verified eligible contact; require role/actor/reason; preserve prior state.
- **Success criteria:** Unauthorized/agent direct confirm denied; stale version conflict detected; all transitions audited.
- **Validation/evidence:** Role/state/concurrency tests.
- **Stop/escalate:** Contact eligibility conflict blocks assignment/use.

### B-012 — Implement buying-center hypothesis agent

- **Purpose:** Propose likely roles/research gaps without inventing people.
- **Dependencies:** A agent runtime, B-008/B-011, account/play evidence.
- **Likely files:** New `src/lib/agents/buying-center-proposer.ts`, prompt/schema/tests.
- **Steps:** Provide account/play/approved business context; request roles/responsibilities/influence/evidence/confidence/gaps; validate citations; persist hypotheses only; route low-confidence/high-impact to review; prohibit named-person fabrication.
- **Success criteria:** Chemical account can propose procurement/technical/quality/user/economic roles when supported; no person becomes verified.
- **Validation/evidence:** Golden/adversarial replay tests.
- **Stop/escalate:** Unsupported role rationale stays unknown/review.

### B-013 — Add qualification-assessment tables

- **Purpose:** Persist play-specific evidence-backed decisions.
- **Dependencies:** P qualification rubric, C accounts/observations, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add assessment/version/status qualified/disqualified/review/unknown; account/play version/engine version; observed/inferred facts, disqualifiers, unknowns, evidence links, freshness/policy; immutable snapshots/supersession.
- **Success criteria:** Same account has independent assessments per play; history reproducible; cross-tenant references fail.
- **Validation/evidence:** Both-backend schema/state tests.
- **Stop/escalate:** No mutable single `qualification_status` as future truth.

### B-014 — Implement deterministic qualification engine

- **Purpose:** Evaluate play rules against account evidence.
- **Dependencies:** B-013, P-014, C-024/C-029.
- **Likely files:** New `src/lib/qualification/assessment-engine.ts`, tests.
- **Steps:** Load exact play rubric/account projection/claims/freshness; evaluate rule IDs; separate observed/inferred/unknown; apply hard disqualifiers/conflicts/evidence threshold; output status/reasons/evidence/gaps/engine version; persist snapshot.
- **Success criteria:** Account can qualify for epoxy distribution and fail formulator play with different cited reasons; deterministic replay.
- **Validation/evidence:** Chemical/non-industrial golden tests.
- **Stop/escalate:** Uncited criterion cannot decide qualification.

### B-015 — Add score snapshot/factor/override tables

- **Purpose:** Preserve transparent vector history and manual decisions.
- **Dependencies:** B-013, P-015, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add score snapshots/factors/manual overrides with account/play/assessment/model version/dimension/raw/weight/contribution/rationale/evidence/calculated/supersedes; override actor/reason/expiry; queue indexes.
- **Success criteria:** Historical score does not depend on current projection; computed snapshot remains after override.
- **Validation/evidence:** Both-backend schema/history tests.
- **Stop/escalate:** Score version/normalization must be defined.

### B-016 — Implement transparent score-vector engine

- **Purpose:** Compute fit, evidence quality, need, access, timing, risk, priority.
- **Dependencies:** B-014/B-015, P-015, B-006/B-011.
- **Likely files:** New `src/lib/scoring/score-vector.ts`, tests.
- **Steps:** Parse exact play rubric; evaluate dimensions independently; apply evidence reliability/freshness/conflicts/disqualifiers/contact access/buying gaps; output factors and “what changes”; persist; never compare raw scores across plays.
- **Success criteria:** Every contribution cited/reasoned; deterministic; blocked contact reduces access but not invent fit.
- **Validation/evidence:** Boundary/golden/replay tests.
- **Stop/escalate:** Opaque model-only factor is not allowed.

### B-017 — Implement manual qualification/score overrides

- **Purpose:** Support expert judgment without rewriting computed history.
- **Dependencies:** B-013/B-015/B-016, T RBAC/audit.
- **Likely files:** New `src/lib/scoring/overrides.ts`, tests.
- **Steps:** Require allowed actor/type/reason/evidence/before-after/expiry; append override; compute new effective snapshot; preserve base; revoke/expire; audit.
- **Success criteria:** Override visible/reversible; old snapshot immutable; wrong role/tenant denied.
- **Validation/evidence:** Role/history/expiry tests.
- **Stop/escalate:** No silent admin override.

### B-018 — Implement rescore/requalification trigger service

- **Purpose:** Recompute when relevant evidence/config changes.
- **Dependencies:** B-014/B-016/B-017, C freshness, P versioning.
- **Likely files:** New `src/lib/scoring/triggers.ts`, job schema if needed, tests.
- **Steps:** Trigger on play supersession, observation/claim/review/freshness/contact/buying-center/merge/override/model change; coalesce by account/play/input hash; enqueue scoped job; preserve reason/version.
- **Success criteria:** Each relevant change creates at most one pending recompute; unrelated change does not; old snapshots remain.
- **Validation/evidence:** Trigger matrix/idempotency tests.
- **Stop/escalate:** Missing dependency lineage blocks coalescing.

### B-019 — Implement qualification/score worker

- **Purpose:** Run bounded assessment and scoring reliably.
- **Dependencies:** B-018, worker infrastructure.
- **Likely files:** New worker/route/scheduler metadata/tests.
- **Steps:** Lease scoped job; verify current input hash/policy/play; run qualification then score transactionally per outputs; create review tasks for conflicts/low evidence/high impact; checkpoint usage; retry/cancel/stale lease.
- **Success criteria:** Retry no duplicate snapshots/reviews; stale inputs superseded/ignored; no cross-tenant evidence.
- **Validation/evidence:** Worker integration tests.
- **Stop/escalate:** No provider call needed unless separately approved model factor exists (default none).

### B-020 — Add generalized review-task tables/service

- **Purpose:** Route knowledge/account/contact/buying/qualification/draft issues through one queue.
- **Dependencies:** I review tasks, T permissions/audit, B domains.
- **Likely files:** Extend/replace review schema/service, tests.
- **Steps:** Define typed subject/proposal/current/evidence/impact/reason/priority/assignee/status/allowed decisions/version; dedupe open task; assignment/defer/decision; transactional subject update; audit.
- **Success criteria:** Queue mechanics shared but type rules preserved; stale decisions fail; no agent approves.
- **Validation/evidence:** Cross-type/role/dedupe tests.
- **Stop/escalate:** Review type lacking decision/evidence contract cannot register.

### B-021 — Add contact/buying/qualification/score API contracts

- **Purpose:** Expose tenant-safe workbench operations.
- **Dependencies:** B-004/B-006/B-007/B-011/B-014/B-016/B-017/B-020.
- **Likely files:** Server actions/routes/DTO schemas/tests.
- **Steps:** Add account contacts/detail/review/suppress, buying center list/review/assign, qualification/score/factors/history/override/recompute, review queue/detail/decision; permission/idempotency/pagination/non-enumerating errors; citations.
- **Success criteria:** Direct cross-tenant/role/status bypass denied; no client-set verified/qualified/approved field.
- **Validation/evidence:** Contract/action/route tests.
- **Stop/escalate:** Missing authoritative DTO blocks UI task.

### B-022 — Build contact and buying-center golden fixtures

- **Purpose:** Define expected roles, contacts, eligibility, and suppressions.
- **Dependencies:** B contracts, synthetic data only.
- **Likely files:** Test fixtures/expectations.
- **Steps:** Add chemical accounts with role hypotheses, verified/ambiguous contacts, procurement/technical/quality/channel roles, stale/blocked/opted-out/bounced contacts; non-industrial variant; expected reviews.
- **Success criteria:** No real PII; hypotheses distinct from verified people; every expected field/source/policy explicit.
- **Validation/evidence:** Fixture schema/checksum tests and domain/policy review.
- **Stop/escalate:** Legal assumptions must be synthetic/approved.

### B-023 — Add qualification/scoring regression and precision harness

- **Purpose:** Measure deterministic quality before rollout.
- **Dependencies:** B-014/B-016/B-022, D-015.
- **Likely files:** Evaluation harness/tests/reports.
- **Steps:** Run accounts across multiple play versions; compare expected status/vector/factors/gaps; test duplicates/freshness/conflicts/overrides; calculate reviewer agreement/precision and change by model version; fail threshold.
- **Success criteria:** D-015 quality thresholds met; identical input/version identical output; no uncited factor.
- **Validation/evidence:** Machine-readable evaluation report.
- **Stop/escalate:** Missing labeled benchmark blocks production threshold claims.

### B-024 — Phase 7 contact/buying/qualification acceptance gate

- **Purpose:** Prove account decision support and contact safety.
- **Dependencies:** B-001 through B-023.
- **Likely files:** Validation receipt only unless defects become tasks.
- **Steps:** Run contact projection/eligibility/suppression; buying hypotheses/review; qualification/score/override/recompute/review; chemical/non-industrial/adversarial fixtures; two-tenant bypasses; run release check.
- **Success criteria:** D-012/D-015 thresholds pass; no person invented/auto-verified; suppressed contact blocked; every assessment/factor cited; review/human gates enforced.
- **Validation/evidence:** `docs/validation/phase-7-buying-qualification.md`, sanitized DTO/rows/review and evaluation artifacts.
- **Stop/escalate:** Personal-data policy breach, unsupported role/person claim, uncited decision, or cross-tenant access fails phase.

## Phase 8 tasks — Cited outreach drafts, human approval, outcomes, and controlled learning

### O-001 — Define outreach-draft and policy-check contracts

- **Purpose:** Separate drafting, approval, copy/export, and delivery semantics.
- **Dependencies:** D-013, B-024.
- **Likely files:** New `src/lib/outreach/types.ts`, `schemas.ts`, tests.
- **Steps:** Define draft/version/status, recipient/account/play/channel/tone/subject/body/CTA/opt-out, material claim spans/citations, warning/policy checks, human approval, copy/export/handoff events; explicitly omit send/delivered transition.
- **Success criteria:** “Approved” never means sent; every material claim span has evidence or blocking status; unknown fields rejected.
- **Validation/evidence:** Strict schema/state tests and typecheck.
- **Stop/escalate:** Any requested automatic-send field is a separate program.

### O-002 — Add outreach draft/version/check tables

- **Purpose:** Persist immutable draft history and policy results.
- **Dependencies:** O-001, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add drafts, versions, claim spans/evidence links, policy checks, approvals, handoff events with tenant/account/contact/play/policy/prompt/model/input hashes/status/actors/timestamps; tenant indexes; immutable approved versions.
- **Success criteria:** Edit creates new version and invalidates prior approval; cross-tenant references fail; no send-provider fields.
- **Validation/evidence:** Both-backend schema/state tests.
- **Stop/escalate:** Serialize schema edits.

### O-003 — Implement outreach policy evaluator

- **Purpose:** Block unsafe recipient/channel/content before approval.
- **Dependencies:** O-001/O-002, B-006/B-007, D-013.
- **Likely files:** New `src/lib/outreach/policy.ts`, tests.
- **Steps:** Evaluate contact eligibility/suppression/freshness, channel/jurisdiction, tenant/play policy, quiet/frequency where relevant, opt-out requirements, claim classes/evidence/freshness/conflicts, tone/prohibited phrases, reviewer separation; return blocking/warning/pass reasons/version.
- **Success criteria:** Suppressed/unapproved/stale/unsupported/prohibited cases block; missing policy fails closed.
- **Validation/evidence:** Exhaustive policy scenario tests.
- **Stop/escalate:** Legal ambiguity cannot be warning by default.

### O-004 — Implement material-claim span and citation validator

- **Purpose:** Ensure draft text remains linked to approved facts after edits.
- **Dependencies:** O-001, evidence citation resolver, D-008/D-013.
- **Likely files:** New `src/lib/outreach/claim-spans.ts`, tests.
- **Steps:** Validate non-overlapping spans/text hashes; resolve claim/evidence; classify technical/regulatory/pricing/performance/personalization; reject stale/unsupported/mismatched citation; recompute/invalidate on body edit; handle inference/unknown warnings.
- **Success criteria:** Editing claim text invalidates old approval/check; every material span resolves or blocks.
- **Validation/evidence:** Span mutation/Unicode/citation tests.
- **Stop/escalate:** Do not approve body if claim extraction misses an obvious material claim in golden fixtures.

### O-005 — Implement outreach drafting agent

- **Purpose:** Generate a draft from approved context without sending.
- **Dependencies:** A agent runtime, O-001/O-003/O-004, approved understanding/account/contact/play.
- **Likely files:** New `src/lib/agents/outreach-drafter.ts`, prompt/schema/tests.
- **Steps:** Build minimal approved context; require role/play-specific draft, CTA/opt-out, claim spans and citations; prohibit unsupported high-risk claims/personal inference; validate output/schema/citations/policy; persist draft version needing review.
- **Success criteria:** Agent cannot call send tools; blocked contact creates no draft; chemical claims cite approved facts; uncertainty uses cautious/omitted wording.
- **Validation/evidence:** Golden/adversarial replay and zero-send-tool assertions.
- **Stop/escalate:** No direct provider/email integration.

### O-006 — Implement no-browse outreach review agent

- **Purpose:** Detect unsupported or policy-violating draft content independently.
- **Dependencies:** O-005, O-003/O-004.
- **Likely files:** New `src/lib/agents/outreach-reviewer.ts`, tests.
- **Steps:** Review only approved context/draft/checks; cannot browse/tools/send; identify unsupported spans, overstated confidence, prohibited claims, missing opt-out, tone/personalization risk; return corrected proposal or findings; never approve.
- **Success criteria:** Seeded unsafe claims detected; source-backed facts unchanged; review result versioned.
- **Validation/evidence:** Adversarial draft tests.
- **Stop/escalate:** Human remains final approver.

### O-007 — Implement outreach draft repository and lifecycle

- **Purpose:** Manage create/edit/recheck/review/approve/archive immutably.
- **Dependencies:** O-002 through O-006, T audit/RBAC.
- **Likely files:** New `src/lib/outreach/repository.ts`, `service.ts`, tests.
- **Steps:** Create idempotent draft; add version; run checks; assign review; update status from authoritative checks; prevent edit of approved version; invalidate on contact/policy/evidence change; audit.
- **Success criteria:** One current version; stale approval cannot be copied/exported; wrong role/tenant denied.
- **Validation/evidence:** Lifecycle/concurrency/invalidation tests.
- **Stop/escalate:** No generic status update endpoint.

### O-008 — Implement human outreach approval service

- **Purpose:** Enforce explicit actor decision on exact checked version.
- **Dependencies:** O-007, D-002/D-013.
- **Likely files:** New `src/lib/outreach/approval.ts`, tests.
- **Steps:** Re-evaluate recipient/contact/policy/claims at approval; compare version/hash/check versions; enforce separation/permission; require confirmation/reason; append approval; audit; return approved version.
- **Success criteria:** Any changed/blocked/stale input denies; agent cannot approve; exact human/time/version recorded.
- **Validation/evidence:** Race/role/policy-change tests.
- **Stop/escalate:** No approval if target policy requires unresolved domain review.

### O-009 — Implement approved copy-to-clipboard receipt service

- **Purpose:** Record external handoff without claiming delivery.
- **Dependencies:** O-008.
- **Likely files:** Server action/service, tests.
- **Steps:** Authorize approved exact version; recheck suppression/expiry; return copy payload; append `copied` handoff event with actor/time/version; do not record sent; redact unavailable fields.
- **Success criteria:** Unapproved/stale/suppressed version cannot copy; event never implies recipient delivery.
- **Validation/evidence:** Action/state tests and current copy-only compatibility tests.
- **Stop/escalate:** Browser clipboard success itself is client evidence, not email send.

### O-010 — Implement approved draft export/handoff service

- **Purpose:** Support controlled export without a send provider.
- **Dependencies:** O-008, D-013/D-014.
- **Likely files:** Export service/route/tests.
- **Steps:** Authorize exact version; recheck policy/suppression; generate approved text/structured format with citations/policy metadata; formula-injection safe CSV if used; short-lived private artifact or direct response; append exported event; never provider-send.
- **Success criteria:** Export contains tenant/version/policy provenance, no secrets/forbidden personal data, no other tenant.
- **Validation/evidence:** Export manifest/content/two-tenant tests.
- **Stop/escalate:** External CRM/email handoff needs separate connector policy.

### O-011 — Add structural no-send guard tests

- **Purpose:** Prevent accidental automatic outreach capability during development.
- **Dependencies:** O contracts/services.
- **Likely files:** New static/source/route tests; policy docs.
- **Steps:** Assert no send-provider dependency/config/route/action/status in platform outreach modules; assert approval exposes only copy/export; spy all adapters in E2E; add CI grep/contract check with explicit legacy wording exclusions.
- **Success criteria:** Any future send surface makes tests fail until separate approved program updates contract.
- **Validation/evidence:** Focused guard suite and dependency inventory.
- **Stop/escalate:** Do not “fix” by renaming a send call.

### O-012 — Add outreach API contracts

- **Purpose:** Expose safe draft queue/detail/create/edit/recheck/review/approve/copy/export.
- **Dependencies:** O-007 through O-010.
- **Likely files:** Server actions/routes/DTO schemas/tests.
- **Steps:** Add typed endpoints; permission/idempotency/version conflict; pagination; no raw prompt/provider payload; copy/export exact approved version; non-enumerating errors; audit.
- **Success criteria:** Direct state/tenant/role bypass denied; no send endpoint exists.
- **Validation/evidence:** Contract/action/route tests.
- **Stop/escalate:** UI waits for authoritative DTO.

### O-013 — Define outcome taxonomy and contracts

- **Purpose:** Standardize external result capture without assuming causality.
- **Dependencies:** PRD metrics, D-012/D-013.
- **Likely files:** New `src/lib/outcomes/types.ts`, schemas/tests.
- **Steps:** Define sent-manually, bounced, replied, opt-out, meeting, disqualified, opportunity, won/lost and approved custom; occurred/recorded time, channel, account/contact/play/draft version, actor/source, notes, attribution confidence, suppression effect; strict transitions.
- **Success criteria:** “Sent” means user-recorded external event only; opt-out and bounce effects explicit; unknown/custom bounded.
- **Validation/evidence:** Schema/taxonomy tests.
- **Stop/escalate:** Taxonomy changes need product/analytics approval.

### O-014 — Add outcome and attribution tables

- **Purpose:** Persist append-only outcomes linked to exact strategy/draft.
- **Dependencies:** O-013, D-005.
- **Likely files:** Postgres migration, SQLite schema, tests.
- **Steps:** Add outcomes, attribution links, correction/supersession, source/idempotency, tenant/account/contact/play/draft version/occurred/recorded/actor/channel/metadata; tenant indexes; no delete/update except correction service.
- **Success criteria:** Historical outcome retains exact play/draft version; retry no duplicate; cross-tenant impossible.
- **Validation/evidence:** Both-backend tests.
- **Stop/escalate:** No mutable status field as only outcome history.

### O-015 — Implement outcome capture/correction service

- **Purpose:** Validate and record human/imported outcomes safely.
- **Dependencies:** O-013/O-014, T audit/RBAC.
- **Likely files:** New `src/lib/outcomes/service.ts`, tests.
- **Steps:** Authorize; validate account/contact/play/draft same tenant and occurrence; append idempotently; apply approved correction as superseding event; trigger suppression for opt-out/bounce; trigger reports/learning; audit.
- **Success criteria:** Opt-out blocks immediately; correction preserves old event; recording sent calls no provider.
- **Validation/evidence:** State/two-tenant/idempotency/suppression tests.
- **Stop/escalate:** Do not infer outcome from email provider because none is integrated.

### O-016 — Implement outcome attribution service

- **Purpose:** Link outcomes to plays/sources/drafts with confidence, not false certainty.
- **Dependencies:** O-014/O-015, C discovery lineage.
- **Likely files:** New `src/lib/outcomes/attribution.ts`, tests.
- **Steps:** Prefer explicit user links; derive bounded candidate lineage; record direct/assisted/unknown and rationale/confidence; allow review/correction; never overwrite; separate occurrence and attribution times.
- **Success criteria:** Ambiguous outcome remains multi/unknown; every attribution explains evidence/path.
- **Validation/evidence:** Golden multi-play/source tests.
- **Stop/escalate:** No last-touch assumption unless approved/labeled.

### O-017 — Add reporting aggregate/query service

- **Purpose:** Support funnel/quality/cost/outcome metrics by versioned dimensions.
- **Dependencies:** O-014/O-016 and prior usage/account data.
- **Likely files:** New `src/lib/reporting/queries.ts`, tests.
- **Steps:** Define denominators; tenant/workspace/play version/source/market/segment/researcher/contact role/time filters; activation/discovery/quality/revenue/trust metrics; empty cohort semantics; performance indexes/materialized strategy only if measured.
- **Success criteria:** Metrics reconcile from fixture rows; no cross-tenant aggregate; denominator/version returned.
- **Validation/evidence:** Two-tenant metric reconciliation tests.
- **Stop/escalate:** Undefined metric formula blocks display.

### O-018 — Add learning-proposal tables and contracts

- **Purpose:** Ensure learning proposes versioned changes rather than silently mutating active config.
- **Dependencies:** O-017, P/A versioning.
- **Likely files:** Postgres migration, SQLite schema, new `src/lib/learning/types.ts`, tests.
- **Steps:** Add proposal target type/version/current/proposed diff/supporting outcome/evidence/analysis version/impact/confidence/status/reviewer/schedule; immutable decision history; tenant indexes.
- **Success criteria:** Proposal cannot directly alter target; exact current version referenced; old proposals remain.
- **Validation/evidence:** Both-backend state/constraint tests.
- **Stop/escalate:** No free-form executable config change.

### O-019 — Implement deterministic learning diagnostics

- **Purpose:** Identify repeatable patterns before model recommendations.
- **Dependencies:** O-017/O-018, D-015 minimum sample thresholds.
- **Likely files:** New `src/lib/learning/diagnostics.ts`, tests.
- **Steps:** Calculate false positive/negative feedback, unanswered questions, source yield, contact usefulness, replies/meetings/conversion by version; enforce sample size/confidence; detect drift; output findings/evidence, not changes.
- **Success criteria:** Small/biased sample yields insufficient-data, not recommendation; numbers reconcile.
- **Validation/evidence:** Statistical boundary/golden tests.
- **Stop/escalate:** Protected traits/sensitive data excluded.

### O-020 — Implement learning-proposal agent

- **Purpose:** Convert approved diagnostics into reviewable strategy suggestions.
- **Dependencies:** A runtime, O-018/O-019, approved target schemas.
- **Likely files:** New `src/lib/agents/learning-proposer.ts`, prompt/schema/tests.
- **Steps:** Supply diagnostics/current version/allowed edit schema; propose question/ICP/query/score/outreach-guidance diff with evidence/impact/risk/unknowns; validate schema/policy; persist proposal only; no activation.
- **Success criteria:** Agent cannot modify active target; low evidence remains no-proposal/review; citations resolve.
- **Validation/evidence:** Golden/adversarial replay tests.
- **Stop/escalate:** Outreach policy/legal changes cannot be agent-approved.

### O-021 — Implement learning proposal validator/simulator

- **Purpose:** Test proposed changes against historical/golden examples before review.
- **Dependencies:** O-020, P validators/evaluators, B regression harness.
- **Likely files:** New `src/lib/learning/validator.ts`, tests.
- **Steps:** Apply proposal in isolated draft; run examples/counterexamples/historical holdout where allowed; compare quality/cost/coverage/policy; identify regressions; store report/version.
- **Success criteria:** Proposal with blocked policy or unacceptable regression cannot be approval-ready.
- **Validation/evidence:** Simulation/golden report tests.
- **Stop/escalate:** Do not train/evaluate on tenant data outside permitted purpose.

### O-022 — Implement learning review/approval service

- **Purpose:** Make qualified human create a new target version.
- **Dependencies:** O-018/O-021, T RBAC/audit.
- **Likely files:** New `src/lib/learning/review.ts`, tests.
- **Steps:** Assign/review current/proposed/evidence/simulation; approve/edit/schedule/reject/request analysis; verify target current version unchanged; on approval create new draft/version through target service, never in-place edit; audit.
- **Success criteria:** Stale target blocks; no auto-activation; history/diff preserved.
- **Validation/evidence:** Role/concurrency/version creation tests.
- **Stop/escalate:** Missing owner/threshold/simulation blocks approval.

### O-023 — Add outcome/reporting/learning API contracts

- **Purpose:** Expose capture, metrics, and proposal review safely.
- **Dependencies:** O-015/O-017/O-022.
- **Likely files:** Server actions/routes/DTO schemas/tests.
- **Steps:** Add outcome create/correct/list, reports summary/details, learning list/detail/analyze/review; permissions/idempotency/pagination/filters/version metadata; no raw PII/agent traces; non-enumerating errors.
- **Success criteria:** Direct mutation cannot activate changes; metrics tenant-safe; outcome sent does not send.
- **Validation/evidence:** Contract/action/route tests.
- **Stop/escalate:** UI does not invent formulas or states.

### O-024 — Build outreach/outcome/learning golden and adversarial fixtures

- **Purpose:** Define safe expected behavior before UI/release.
- **Dependencies:** O services, synthetic data.
- **Likely files:** Test fixtures/reports.
- **Steps:** Add supported/unsupported/prohibited/stale/conflicting claims; permitted/suppressed/opted-out contacts; approval races; copy/export; manually sent/reply/meeting/win/loss; ambiguous attribution; small-sample learning; malicious prompt/personalization; no real PII.
- **Success criteria:** Every block/approval/outcome/proposal expected; zero send; zero unsupported approval.
- **Validation/evidence:** Fixture validator and integrated regression tests.
- **Stop/escalate:** Do not weaken fixtures to pass.

### O-025 — Phase 8 outreach/outcome/learning acceptance gate

- **Purpose:** Prove human-approved cold-outreach support and controlled learning without autonomous sending.
- **Dependencies:** O-001 through O-024.
- **Likely files:** Validation receipt only unless defects become tasks.
- **Steps:** Draft/review/edit/recheck/approve/copy/export; policy/suppression/role/version bypass attempts; outcome and opt-out; report reconciliation; learning proposal/simulation/review/version; no-send guard; two tenants; release check.
- **Success criteria:** Zero unsupported-claim escape; suppressed contacts blocked; every approval exact/audited; no send path; outcomes/learning versioned and human-gated; D-015 thresholds pass.
- **Validation/evidence:** `docs/validation/phase-8-outreach-learning.md`, sanitized draft spans/citations/checks/events/outcomes/report/proposal artifacts.
- **Stop/escalate:** Any automatic send, unsupported approved claim, opt-out bypass, cross-tenant metric, or silent config rewrite fails phase.

## Phase 9 tasks — Tenant-aware product shell, workflows, reporting, and administration

### UI-000 — Approve the future visual and interaction specification

- **Purpose:** Prevent cheap implementation agents from inventing inconsistent product design.
- **Dependencies:** D-001/D-002, PRD journeys, approved route IA; high-capability design owner.
- **Likely files:** New `docs/design/multi-tenant-platform-ui-spec.md` plus approved wireframes/screens; no application code.
- **Steps:** Define shell/navigation, density/type/color/spacing/components, onboarding, evidence review, ICP/play builder, discovery preview, account/buying/contact workbench, outreach, reports/admin; desktop 1440×1100 and mobile 390×900; loading/empty/error/forbidden/stale/partial states; accessibility/motion; obtain approval.
- **Success criteria:** Every UI task below has a named approved screen/component/state reference and responsive behavior.
- **Validation/evidence:** Design/product/accessibility sign-off and complete screen/state inventory.
- **Stop/escalate:** Cheap agents do not choose visual direction; no image-generation/external-credit use without approval.

### UI-001 — Define tenant-aware UI DTOs and action-result contracts

- **Purpose:** Give every route one exact view vocabulary.
- **Dependencies:** UI-000 and backend API contracts for implemented slices.
- **Likely files:** New `src/lib/ui-contracts/**`, fixtures/tests.
- **Steps:** Define tenant context, async states, evidence/claim/question/understanding/ICP/play/discovery/account/score/buying/contact/review/draft/outcome/report/learning DTOs; discriminated success/failure; two tenants/roles/chemical/non-industrial fixtures; prohibit DB/provider rows and `any`.
- **Success criteria:** Contracts contain no universal website/rating/Google/Colorado/chemical assumption; cross-tenant IDs not interchangeable.
- **Validation/evidence:** Contract tests, typecheck, lint.
- **Stop/escalate:** Missing backend authority/version/permission blocks DTO invention.

### UI-002 — Add tenant/workspace context to protected shell

- **Purpose:** Make active authorization scope visible and stable.
- **Dependencies:** UI-001, tenant session/context API.
- **Likely files:** `src/app/(protected)/layout.tsx`, new switcher, tests.
- **Steps:** Load scope server-side; show tenant/workspace/role; accessible switcher by stable ID; invalidate scoped data before switch render; handle no/pending/disabled/suspended/error; never free-form tenant input.
- **Success criteria:** Switch cannot display stale prior-workspace data; each state follows approved design.
- **Validation/evidence:** Component tests plus authenticated desktop/mobile browser trace.
- **Stop/escalate:** Active-scope policy ambiguity blocks.

### UI-003 — Implement permission-aware product navigation

- **Purpose:** Expose Strategy, Research, Engagement, Reports, Administration, and legacy compatibility clearly.
- **Dependencies:** UI-001/UI-002, D-002.
- **Likely files:** `src/lib/navigation.ts`, `src/components/nav-header.tsx`, tests.
- **Steps:** Define route groups/permissions/onboarding state; preserve nested active path; label legacy routes; accessible desktop/mobile disclosures; Escape/route-change close/focus restore; no role-name UI shortcuts.
- **Success criteria:** Each persona sees only permitted routes; mobile no overflow; legacy routes remain reachable.
- **Validation/evidence:** Navigation/header tests and role-specific browser screenshots.
- **Stop/escalate:** Serialize shared navigation edits.

### UI-004 — Build reusable async and access-state components

- **Purpose:** Standardize loading, empty, error, forbidden, stale, partial, suspended states.
- **Dependencies:** UI-001/UI-000.
- **Likely files:** New `src/components/async-view-state.tsx`, status/error integrations, tests.
- **Steps:** Semantic skeletons; contextual empty action; typed retryable/terminal error with correlation; forbidden/suspended; stale/partial warning; live announcements; no fake business values.
- **Success criteria:** States are keyboard/screen-reader usable and distinguish no data/no access/failure.
- **Validation/evidence:** Component tests and accessibility check.
- **Stop/escalate:** Raw provider/PII error cannot render.

### UI-005 — Build reusable evidence and decision primitives

- **Purpose:** Show provenance consistently across every workflow.
- **Dependencies:** UI-001/UI-004, D-008.
- **Likely files:** New `src/components/evidence/**`, tests.
- **Steps:** Claim/confidence/freshness/conflict indicators; evidence row and citation drawer; observed/client/inferred/not-found/unknown styles; inaccessible/expired explanation; factor rationale; keyboard/focus behavior.
- **Success criteria:** Every material claim opens permitted evidence or clearly states unavailable; “not found” never means nonexistence.
- **Validation/evidence:** Component snapshots/interactions/accessibility tests.
- **Stop/escalate:** Missing locator/access state blocks component use.

### UI-006 — Build resumable onboarding frame and tenant/workspace step

- **Purpose:** Create controlled client entry flow.
- **Dependencies:** UI-002/UI-004, provisioning/onboarding API.
- **Likely files:** New `src/app/(protected)/onboarding/**`, tests.
- **Steps:** Load authoritative stage; render progress/saved/resume; collect tenant/workspace validated server-side; save one stage; prevent query-param skipping; redirect completed to knowledge with setup link; support invite/operator provisioned.
- **Success criteria:** Reload resumes exact stage; wrong role/tenant cannot mutate.
- **Validation/evidence:** Page tests and approved local mutating E2E desktop/mobile.
- **Stop/escalate:** Provisioning/workspace semantics unresolved.

### UI-007 — Add policy/source-responsibility acknowledgement step

- **Purpose:** Capture versioned acknowledgment before material/source/outreach work.
- **Dependencies:** UI-006, tenant policy API.
- **Likely files:** Onboarding policy step/tests.
- **Steps:** Display upload/source/personal-data/outreach/retention/suppression responsibilities; required vs optional; unchecked default; policy version links; block continue until required; show actor/time/version after save.
- **Success criteria:** No prechecked blanket consent; reload preserves exact approved version.
- **Validation/evidence:** Component/action tests and mutating E2E.
- **Stop/escalate:** Unapproved policy text/version blocks.

### UI-008 — Add business-material upload and link intake step

- **Purpose:** Accept approved files, URLs, notes, and customer lists.
- **Dependencies:** UI-007, I-028 APIs.
- **Likely files:** Onboarding materials step/upload queue/tests.
- **Steps:** Render server-declared types/limits; independent item progress/retry/cancel/remove; source label/authorization/description; preserve successes amid failures; distinguish customer-list purpose; never implement provider logic client-side.
- **Success criteria:** Mixed inputs show authoritative states; unsupported/oversize actionable; no storage key exposed.
- **Validation/evidence:** Unit/action tests and local mutating E2E with safe fixtures.
- **Stop/escalate:** Missing storage/scan/limit policy blocks.

### UI-009 — Add ingestion progress and onboarding completion step

- **Purpose:** Make long processing transparent/resumable.
- **Dependencies:** UI-008, ingestion status APIs.
- **Likely files:** Onboarding progress/list/tests.
- **Steps:** Show queued/processing/ready/review/duplicate/unsupported/failed/canceled/partial; quality/language/page/table/issues; retry/cancel/review if allowed; link source detail; background-continuation explanation; complete only from server.
- **Success criteria:** Partial never appears success; reload preserves state; completion routes understanding.
- **Validation/evidence:** Read-only browser progress fixtures at both viewports.
- **Stop/escalate:** Undefined retry/cancel/error codes block.

### UI-010 — Build knowledge source library

- **Purpose:** Centralize uploaded/linked/integrated source records.
- **Dependencies:** UI-004, source list API.
- **Likely files:** New `/knowledge/sources` route/components/tests.
- **Steps:** Server-load summaries; search/filter type/status/freshness/quality in URL; show version/owner/evidence/issues/processed; link detail; paginate; empty/partial/access states; mobile layout.
- **Success criteria:** No other tenant/workspace source; shareable filters; no request waterfall.
- **Validation/evidence:** Page tests and authenticated desktop/mobile browser.
- **Stop/escalate:** Stable scoped IDs required.

### UI-011 — Build source detail and extraction-quality review

- **Purpose:** Let reviewer inspect exact extracted content.
- **Dependencies:** UI-005/UI-010, source detail API.
- **Likely files:** `/knowledge/sources/[sourceId]`, lazy viewer, tests.
- **Steps:** Immutable metadata/version; parser/quality/duplicate/warnings; located pages/sections/rows/tables; units/negations/ranges/certification warning; retry/review; lazy heavy viewer with text fallback; protected originals.
- **Success criteria:** Citation resolves to matching locator; no raw storage URL; desktop/mobile usable.
- **Validation/evidence:** Page tests and browser screenshot/interaction.
- **Stop/escalate:** Missing locator or secure original access blocks viewer.

### UI-012 — Build versioned business-understanding overview

- **Purpose:** Present evidence-backed model for review/approval.
- **Dependencies:** UI-005, A-021 API.
- **Likely files:** `/knowledge/understanding`, tests.
- **Steps:** Version/status/run/time/approval; generic domains and uncertainty; evidence coverage/conflicts; previous-version diff; links to fact review/questions; immutable approved display; chemical/nonindustrial fixtures.
- **Success criteria:** Same components render unlike businesses; no domain hard-code; all material facts evidence-accessible.
- **Validation/evidence:** Page tests and authenticated browser at both viewports.
- **Stop/escalate:** Version/approval semantics undefined.

### UI-013 — Build fact-by-fact evidence review and correction

- **Purpose:** Support reasoned human decisions with history.
- **Dependencies:** UI-005/UI-012, A-021 review APIs.
- **Likely files:** Understanding review drawer/dialog/tests.
- **Steps:** Current/proposed beside support/conflict; approve/edit/reject/request/defer/unknown; reason codes; retain drawer on validation; authoritative response; before/after/reviewer; stale-version handling.
- **Success criteria:** Citation/history preserved; conflicts not silently bulk-approved; wrong role denied.
- **Validation/evidence:** Unit/action tests and local mutating E2E.
- **Stop/escalate:** Missing reason/version conflict contract blocks.

### UI-014 — Build adaptive question sessions

- **Purpose:** Ask dynamic high-value questions with rationale.
- **Dependencies:** UI-012, A-021 question APIs.
- **Likely files:** `/knowledge/questions`, tests.
- **Steps:** Load current-version questions; show why/decisions unlocked; render server-declared response; answer/correct/defer/unknown; progress without fixed total; refresh next set; summary/review next round.
- **Success criteria:** Different fixtures show different questions/order; no static universal list in client.
- **Validation/evidence:** Page/action tests and mutating E2E for two fixture tenants.
- **Stop/escalate:** Question missing rationale/decision/version is invalid.

### UI-015 — Build ICP list and version history

- **Purpose:** Manage multiple target definitions.
- **Dependencies:** UI-004, P-019 API.
- **Likely files:** `/icps`, tests.
- **Steps:** Show name/objective/status/version/owner/time/plays; separate draft/active/superseded; create-from-understanding/duplicate; warnings; empty/forbidden; links.
- **Success criteria:** Multiple ICP versions inspectable; active distinct but immutable.
- **Validation/evidence:** Page tests and authenticated browser.
- **Stop/escalate:** Stable version semantics required.

### UI-016 — Build ICP editor and activation diff

- **Purpose:** Edit generic evidence-backed profile.
- **Dependencies:** UI-015/UI-005, P-019 actions.
- **Likely files:** `/icps/[icpId]`, tests.
- **Steps:** Edit all P-001 domains and buying roles; link approved facts; server validation; dirty navigation warning; save draft; show immutable version diff; submit review/approve only per role.
- **Success criteria:** Chemical/nonindustrial fixtures work; no hardcoded industries; active version never edited.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Approval/evidence threshold unresolved.

### UI-017 — Build lead-play list and overlap indicators

- **Purpose:** Manage multiple bounded motions and shared accounts.
- **Dependencies:** UI-015, P-019 API.
- **Likely files:** `/plays`, tests.
- **Steps:** Show hypothesis/ICP/status/sources/market/budget/last run/outcomes; draft/active/paused/superseded; overlap count; links editor/simulate/discovery/reports; empty states.
- **Success criteria:** Overlap visible without implying duplicate account; version/status clear.
- **Validation/evidence:** Page tests and browser.
- **Stop/escalate:** Overlap must use canonical IDs.

### UI-018 — Build lead-play editor

- **Purpose:** Configure complete play without activation.
- **Dependencies:** UI-016/UI-017, P-019 actions.
- **Likely files:** `/plays/[playId]`, route-local sections/tests.
- **Steps:** Select immutable ICP; edit hypothesis/evidence/disqualifiers/markets/sources/queries/qualification/score/buying roles/outreach policy/budgets/cadence/gates/stops/metrics; show policy blockers; save draft.
- **Success criteria:** Distinct chemical plays configured through generic UI; no implicit Google/send.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Missing source/score/outreach contract blocks.

### UI-019 — Build play simulation and activation review

- **Purpose:** Require examples/explanation/complete bounded plan before activation.
- **Dependencies:** UI-018, P-017/P-019 APIs.
- **Likely files:** `/plays/[playId]/simulate`, tests.
- **Steps:** Examples/counterexamples and factor pass/fail; expected overlap/dedupe; sources/cost/cadence/policies/gates/stops; block unresolved; explicit confirmation bound to hash; return immutable active version.
- **Success criteria:** User can explain outcomes; activation only from simulation/review; hash consistency.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Simulation/activation hash mismatch blocks.

### UI-020 — Build discovery home and new-run setup

- **Purpose:** Select active play, market, and permitted source capabilities.
- **Dependencies:** UI-003/UI-017, C plan APIs.
- **Likely files:** `/discovery`, `/discovery/new`, tests.
- **Steps:** Recent runs with versions; select active play; derive permitted sources; collect market and bounded options; preserve safe draft state; disable preview until valid; show Google controls only for capability.
- **Success criteria:** No universal Google/geography fields; wrong policy/source unavailable.
- **Validation/evidence:** Page tests and authenticated browser.
- **Stop/escalate:** Missing terms/active version blocks preview.

### UI-021 — Build discovery plan preview and confirmation

- **Purpose:** Expose source terms, scope, queries, cost, dedupe, and stop rules before execution.
- **Dependencies:** UI-020, C-008/C-009 APIs.
- **Likely files:** Discovery preview step/generalized run-scope components/tests.
- **Steps:** Request after valid setup; source-by-source plan/terms/query/calls/cost/time/evidence; dedupe/overlap; blockers/budgets/stops; confirmation bound to version hash; invalidate on change; explicit dialog.
- **Success criteria:** Stale/blocked preview cannot run; confirmation contains full plan.
- **Validation/evidence:** Unit/action tests and local mutating E2E.
- **Stop/escalate:** Missing cost/terms/dedupe/stops blocks.

### UI-022 — Build discovery run detail and recovery controls

- **Purpose:** Show resumable execution and partial results.
- **Dependencies:** UI-021, C run APIs.
- **Likely files:** `/discovery/runs/[runId]`, tests.
- **Steps:** Objective/play/source versions/actor/budget; per-source/step progress; observations/accounts/duplicates/cost/provenance; states; permission-gated pause/resume/retry/cancel; explain partial retained results; link accounts.
- **Success criteria:** Progress survives reload; retry/cancel never implies deleting completed evidence.
- **Validation/evidence:** Unit/action tests and mutating E2E with fixture runner.
- **Stop/escalate:** Actions require idempotent authoritative status.

### UI-023 — Build account list and researcher work queue

- **Purpose:** Replace universal lead list with play-specific account intelligence.
- **Dependencies:** C account APIs, UI-004/UI-005.
- **Likely files:** `/accounts`, tests.
- **Steps:** Identity/lifecycle/play memberships/score/evidence/freshness/conflicts/owner/next action; filters/sort by play/segment/market/source/reviewer/factors; saved my/review views; URL filters; pagination; nested links.
- **Success criteria:** No required place/website/review/local category; role/tenant isolation; mobile usable.
- **Validation/evidence:** Page tests and researcher browser both viewports.
- **Stop/escalate:** Canonical identity/pagination undefined.

### UI-024 — Build modular account layout and overview

- **Purpose:** Establish future workbench without extending legacy monolith.
- **Dependencies:** UI-023, account overview API.
- **Likely files:** `/accounts/[accountId]/layout.tsx`, `/overview`, tests.
- **Steps:** Server account layout; identity/aliases/lifecycle/owners/plays/conflicts/next action; nested Overview/Evidence/Buying Center/Contacts/Activity; score vector/factor evidence/what changes; mobile breadcrumbs; independent loading.
- **Success criteria:** Subroutes share authoritative account context; no new work added to legacy `lead-detail-client.tsx`.
- **Validation/evidence:** Layout/overview tests and browser.
- **Stop/escalate:** Inconsistent child account reads block.

### UI-025 — Build account evidence, conflict, and merge-history view

- **Purpose:** Make provenance/entity resolution inspectable.
- **Dependencies:** UI-005/UI-024, account evidence API.
- **Likely files:** `/accounts/[accountId]/evidence`, tests.
- **Steps:** Chronological observations; claims/support/conflict/freshness/review; aliases/duplicate candidates/merge decisions/surviving fields; distinguish observation/projection; reasoned merge/reject/research controls; never hide conflicts.
- **Success criteria:** User reconstructs canonical account and every merge; originals retained.
- **Validation/evidence:** Page/action tests and browser.
- **Stop/escalate:** Missing merge history/observations blocks.

### UI-026 — Build buying-center map and role review

- **Purpose:** Review evidence-backed committee hypotheses.
- **Dependencies:** UI-024, B-021 APIs.
- **Likely files:** `/accounts/[accountId]/buying-center`, tests.
- **Steps:** Roles/responsibility/influence/confidence/evidence/status; hypothesis vs verified styling; confirm/edit/reject/research/unknown; tenant custom roles; missing priority roles/recommended research; no person fabrication.
- **Success criteria:** Proposed role never appears verified person; decisions audited/reload stable.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Contract must separate hypothesis/verified.

### UI-027 — Build account contact list and permitted-use status

- **Purpose:** Assess contact readiness safely.
- **Dependencies:** UI-024, B-021 APIs.
- **Likely files:** `/accounts/[accountId]/contacts`, tests.
- **Steps:** Identity/role/provenance/freshness/confidence/channels/verification; legal basis/permission/suppression/bounce/opt-out; role/readiness/risk filters; disable blocked drafting; explain block; link detail/role.
- **Success criteria:** Blocked/stale/unapproved contacts cannot reach drafting; no policy hidden.
- **Validation/evidence:** Page tests and researcher browser.
- **Stop/escalate:** Missing permitted-use/freshness blocks.

### UI-028 — Build contact detail and human review

- **Purpose:** Confirm identity/role/use before drafting.
- **Dependencies:** UI-027, B-021 actions.
- **Likely files:** `/accounts/[accountId]/contacts/[contactId]`, tests.
- **Steps:** Observations vs canonical; role/buying links; sources/freshness/basis/suppression history; approve/edit/reject/research/suppress; reason for overrides/removal; prepare draft only from authoritative eligible state.
- **Success criteria:** Reload shows decision; blocked stays blocked; wrong role denied.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Suppression removal authority undefined.

### UI-029 — Build unified review queue

- **Purpose:** Triage cross-domain human work.
- **Dependencies:** B-020/B-021, UI-004.
- **Likely files:** `/reviews`, tests.
- **Steps:** List knowledge/account/conflict/high-value/source/contact/draft/policy types; impact/age/confidence/assignee/scope/reason; filters; my/overdue views; URL state; typed detail links; pagination.
- **Success criteria:** Shared mechanics preserve type-specific decisions; no unregistered review type.
- **Validation/evidence:** Page tests and browser.
- **Stop/escalate:** Type missing allowed decisions/evidence blocks registration.

### UI-030 — Build review decision workspace

- **Purpose:** Present evidence beside proposal for reasoned action.
- **Dependencies:** UI-005/UI-029, review detail/actions.
- **Likely files:** `/reviews/[reviewId]`, tests.
- **Steps:** Subject/current/proposed/impact; support/conflict evidence; only allowed actions; reason/notes; stale conflict; before/after/audit; next-review preserving filters; keyboard/focus.
- **Success criteria:** Unsupported action not rendered; override reasoned; stale decision rejected.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** No version check means stop.

### UI-031 — Build outreach draft queue

- **Purpose:** Separate research-ready drafts from delivery.
- **Dependencies:** O-012 API, UI-004.
- **Likely files:** `/outreach`, tests.
- **Steps:** Status/channel/account/contact/play/owner/age; citation completeness/policy; filters needs review/blocked/approved/copied/exported/archived; block explanation; no send button/language; detail links.
- **Success criteria:** Suppressed contact never approval-ready; statuses do not imply delivery.
- **Validation/evidence:** Page tests and authenticated browser.
- **Stop/escalate:** Mixed approval/export/delivery status semantics block.

### UI-032 — Build cited outreach draft editor

- **Purpose:** Let human inspect/edit every material claim.
- **Dependencies:** UI-005/UI-031, O-012 actions.
- **Likely files:** `/outreach/[draftId]`, claim-highlighting editor/tests.
- **Steps:** Recipient/account/play/channel/subject/body/CTA/opt-out; claim spans/citations; fact/inference/unknown/unsupported; tone/prohibited policy; edit preserving/recomputing spans; high-risk warnings; new version on edit.
- **Success criteria:** Unsupported claims visibly blocked; edit invalidates approval/check; accessible text editing.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Claim-span/citation integrity missing.

### UI-033 — Build outreach policy gate, approval, copy, and export

- **Purpose:** Enforce human approval while keeping sending disabled.
- **Dependencies:** UI-032, O-008/O-009/O-010/O-012.
- **Likely files:** Draft approval panel/dialog/tests.
- **Steps:** Recipient/suppression/claim/channel/frequency/quiet/regional/opt-out checks; disable blocking; explicit approval exact version/policy; enable copy/export exact version; label external handoff; revoke on state change; no provider/send control.
- **Success criteria:** No send transition/action; blocked cannot approve/copy/export; all exact version/audited.
- **Validation/evidence:** Unit/action tests, mutating E2E, no-send guard.
- **Stop/escalate:** Messaging provider request is out-of-scope.

### UI-034 — Build outcome capture and immediate suppression feedback

- **Purpose:** Record external outcomes without sending.
- **Dependencies:** O-023 APIs, account activity UI.
- **Likely files:** Account Activity route/reusable dialog/tests.
- **Steps:** Outcome types/time/channel/notes/contact/account/play/attribution; confirm opt-out/bounce; authoritative suppression update; prevent future draft; append activity after reload; sent label says user-recorded.
- **Success criteria:** Opt-out blocks throughout UI immediately; sent records no provider call.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Unsafe eventual consistency remains blocked.

### UI-035 — Build multi-dimensional reporting dashboard

- **Purpose:** Show activation, discovery, quality, revenue, trust, operations.
- **Dependencies:** O-017/O-023, UI-001/UI-004.
- **Likely files:** `/reports`, filters/charts/tables/tests.
- **Steps:** Versioned filters; understanding/evidence/question metrics; candidate/precision/duplicate/stale/source yield; approval/optout/bounce/reply/meeting/opportunity/win/loss/time; citation/agent/latency/cost/override; denominator/date/version; accessible tables; lazy charts.
- **Success criteria:** Empty cohorts not misleading; no cross-tenant aggregate; every metric defines denominator.
- **Validation/evidence:** Reconciliation page tests and browser.
- **Stop/escalate:** Undefined metric formula blocks component.

### UI-036 — Build learning-proposal review and history

- **Purpose:** Make outcome-driven changes explicit/versioned.
- **Dependencies:** UI-035, O-023 APIs.
- **Likely files:** `/reports/learning`, tests.
- **Steps:** Findings; current/proposed question/ICP/query/score/outreach guidance; evidence/impact/simulation; approve/edit/schedule/reject/analyze; new version on approval; history/diff.
- **Success criteria:** No active config changes without approval; stale target blocks.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** In-place overwrite prohibited.

### UI-037 — Build tenant/workspace administration

- **Purpose:** Manage identity/lifecycle after onboarding.
- **Dependencies:** UI-002/UI-003, tenant admin APIs.
- **Likely files:** `/admin/tenant`, tests.
- **Steps:** Tenant status/locale/onboarding; workspaces purpose/status/owner/member count; create/rename/archive/reactivate; reasons/confirmation; prevent last required workspace; show impact on plays/runs; refresh shell.
- **Success criteria:** Lifecycle authoritative after reload; archived cannot activate accidentally.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Undefined lifecycle effects block.

### UI-038 — Build membership and RBAC administration

- **Purpose:** Replace global user admin with tenant/workspace membership.
- **Dependencies:** T-031, D-002, UI-003.
- **Likely files:** `/admin/members`, tests; avoid concurrent legacy users edits.
- **Steps:** List member/status/roles/workspaces/activity; invite/resend/disable/reactivate/remove; capability descriptions; final-owner guard; lost-permission preview; incomplete read-only state; no Auth deletion.
- **Success criteria:** All launch roles representable without hardcoded admin checks; other memberships preserved.
- **Validation/evidence:** Unit/action tests and mutating E2E.
- **Stop/escalate:** Role/inheritance/owner rules unresolved.

### UI-039 — Build connector/budget/health/kill-switch administration

- **Purpose:** Expose connector governance without provider implementation.
- **Dependencies:** C connector APIs, UI-003.
- **Likely files:** `/admin/connectors`, tests.
- **Steps:** Name/owner/auth/ops/terms/fields/data classes/cost/limits/freshness/retention/geography/health; mask secrets; tenant/play enable vs global; budgets/caps; disable/kill confirm/impact; preserve history.
- **Success criteria:** Disable removes new selection but not evidence; browser receives no secret; no live call in tests.
- **Validation/evidence:** Unit/action tests and mutating E2E with fixture connector.
- **Stop/escalate:** Terms/credential/kill semantics missing.

### UI-040 — Build data-governance, audit, export/delete, and support console

- **Purpose:** Govern highest-risk tenant operations.
- **Dependencies:** T lifecycle/audit/support APIs, D-014, UI-003/UI-004.
- **Likely files:** `/admin/data-governance`, tests.
- **Steps:** Retention by class; export jobs/scope/status/expiry/download; deletion scope/consequences/cooling/status/tombstone; scoped audit actor/action/target/reason/before-after/correlation; support grants reason/duration/approval/revoke; step-up confirmations; no default document visibility; safe audit CSV.
- **Success criteria:** Support time-bound/reasoned/audited; export/delete are jobs not immediate success; no secret/content leak.
- **Validation/evidence:** Unit/action tests and mutating E2E in disposable tenant.
- **Stop/escalate:** Policy/cooling/export/audit-redaction/support approval unresolved.

### UI-041 — Phase 9 authenticated product-workflow acceptance gate

- **Purpose:** Verify complete user journeys at desktop/mobile and role boundaries.
- **Dependencies:** UI-000 through UI-040 for launch scope; corresponding backend phase gates.
- **Likely files:** Playwright specs/validation receipt only unless defects become tasks.
- **Steps:** Run owner/admin/reviewer/researcher/outreach/read-only flows; onboarding→knowledge→questions→ICP→play→preview/run→account→buying/contact→review→draft approve copy/export→outcome→report/learning→admin; loading/empty/error/forbidden/stale/partial; keyboard/focus/accessibility; tenant A/B.
- **Success criteria:** No overflow/page errors/leak/send; authoritative state after reload; legacy compatibility routes functional; approved design fidelity at 1440×1100 and 390×900.
- **Validation/evidence:** `docs/validation/phase-9-product-ui.md`, Playwright traces/screenshots, route/role matrix, real fixture DTO/record IDs.
- **Stop/escalate:** Missing E2E auth is blocker, not skipped green; any wrong-tenant/unsupported claim/send capability fails phase.

## Phase 10 — Quality, reliability, security, operations, rollout, and launch

### Q-001 — Record the pre-implementation verification baseline

- **Purpose:** Preserve an auditable view of repository health before product work starts.
- **Dependencies:** D-001; clean enough worktree to attribute output without discarding user changes.
- **Likely files:** `docs/validation/baseline.md`; no application edits.
- **Steps:** Record commit and branch; record dirty files without changing them; run current lint, test, typecheck, and build scripts exactly as declared in `package.json`; record environment prerequisites and every pass/fail/skip with command output references.
- **Success criteria:** Later regressions can be distinguished from pre-existing failures; no baseline failure is silently normalized.
- **Validation/evidence:** Baseline receipt containing timestamp, commit SHA, Node/npm versions, commands, exit codes, and failure excerpts.
- **Stop/escalate:** Stop if a command would require secrets, paid services, production access, or destructive setup; mark it blocked with the missing prerequisite.

### Q-002 — Create the deterministic multi-tenant test-fixture contract

- **Purpose:** Give every test lane stable tenant, workspace, user, role, and record identities.
- **Dependencies:** T-025 and T-026.
- **Likely files:** Existing test fixture/factory modules, test database seed helpers, fixture documentation.
- **Steps:** Audit the fixtures created in Phase 2; add Tenant A and Tenant B, two workspaces per tenant, all launch roles, disabled membership, cross-tenant look-alike records, and deterministic IDs; expose helpers rather than copy-pasted seeds; prohibit production identifiers and network calls.
- **Success criteria:** Unit, integration, and E2E suites share the same named fixtures and can prove both allowed and denied paths.
- **Validation/evidence:** Fixture unit tests plus a seed/cleanup smoke test against the disposable test database.
- **Stop/escalate:** Do not invent role or workspace inheritance when D-003/D-004 remain unresolved.

### Q-003 — Create representative golden business datasets

- **Purpose:** Test the product against concrete, reproducible business material rather than toy strings.
- **Dependencies:** I-029, D-009, legal approval for synthetic or redistributable inputs.
- **Likely files:** `tests/fixtures/businesses/**`, fixture manifest, expected-output snapshots.
- **Steps:** Reuse/expand Phase 4 fixtures for a specialty-chemicals supplier, a materially different business, sparse evidence, contradictory evidence, malformed files, OCR needs, duplicate materials, and prompt-injection text; label every input as synthetic or licensed; define expected facts, uncertainties, citations, ICP/play boundaries, and forbidden claims.
- **Success criteria:** Fixtures exercise adaptive behavior across businesses and contain no confidential customer data or unlicensed corpus.
- **Validation/evidence:** Fixture manifest validation, checksum check, and golden-dataset review receipt.
- **Stop/escalate:** Quarantine any input whose ownership, license, sensitivity, or expected truth cannot be established.

### Q-004 — Version API, event, and job contract fixtures

- **Purpose:** Detect accidental breaking changes across routes, actions, workers, and integrations.
- **Dependencies:** T-024, G-012, C-003, and implemented domain schemas.
- **Likely files:** Contract schema modules, `tests/contracts/**`, event/job fixture files.
- **Steps:** Inventory public/internal API envelopes and event/job payloads; assign schema versions; create valid, boundary, and invalid fixtures; add backward-read fixtures for supported versions; redact secrets and raw document content; fail on undocumented field removal or semantic type changes.
- **Success criteria:** Every launch API/event/job has an owner, version, schema, fixture, and compatibility policy.
- **Validation/evidence:** Contract suite in CI and generated compatibility report.
- **Stop/escalate:** Stop if an endpoint has no defined audience or compatibility owner.

### Q-005 — Test authentication and authorization across every launch role

- **Purpose:** Prove the capability matrix at the user-facing boundary.
- **Dependencies:** T-028, Q-002, UI-003.
- **Likely files:** Auth integration tests, Playwright role matrix, test auth helpers.
- **Steps:** Exercise unauthenticated, expired session, disabled membership, owner, admin, strategist, researcher, reviewer, outreach operator, and read-only states; test direct URLs as well as hidden controls; cover workspace-scoped roles and final-owner constraints; assert stable error envelopes.
- **Success criteria:** UI visibility and server authorization agree; no role gains a capability through direct request construction.
- **Validation/evidence:** Role-by-capability report with positive and negative cases and retained Playwright traces for failures.
- **Stop/escalate:** Any server action authorized only by UI state is a launch blocker.

### Q-006 — Test tenant isolation in repositories and services

- **Purpose:** Catch missing tenant predicates below the route layer.
- **Dependencies:** T-027, Q-002.
- **Likely files:** Repository/service integration tests and SQL assertion helpers.
- **Steps:** For each tenant-owned entity, test list/get/create/update/delete using matching tenant, wrong tenant, missing context, forged ID, and same-slug records; inspect compound uniqueness behavior; include bulk operations and pagination cursors.
- **Success criteria:** Wrong-tenant reads reveal no existence and wrong-tenant writes change zero rows; missing context fails closed.
- **Validation/evidence:** Entity coverage matrix mapped to tests and disposable-database row counts before/after.
- **Stop/escalate:** Do not waive an entity because its route is currently hidden or internal.

### Q-007 — Test tenant isolation at routes, actions, and exports

- **Purpose:** Prove application entry points cannot bypass lower-layer controls.
- **Dependencies:** Q-005, Q-006, implemented tenant-aware endpoints.
- **Likely files:** Route/action integration tests, Playwright cross-tenant tests.
- **Steps:** Replay Tenant A identifiers under Tenant B sessions for HTML routes, route handlers, server actions, downloads, exports, audit filters, and legacy compatibility routes; test guessed IDs and stale links; verify logs and error bodies disclose no foreign metadata.
- **Success criteria:** Every protected entry point returns the specified not-found/forbidden result without cross-tenant payload, side effect, or existence oracle.
- **Validation/evidence:** Route matrix with response code, body-shape, database-effect, and log-redaction assertions.
- **Stop/escalate:** A single cross-tenant disclosure or mutation blocks all rollout phases.

### Q-008 — Test queue, lease, and worker tenant isolation

- **Purpose:** Ensure asynchronous execution carries authority from persisted work, not caller-supplied tenant input.
- **Dependencies:** T-030, I-007, implemented job framework.
- **Likely files:** Worker integration tests, job fixtures, queue test harness.
- **Steps:** Lease mixed-tenant jobs; assert tenant/workspace context derives from the leased row; test forged payload fields, retry, dead-letter, cancellation, expired lease, and concurrent workers; verify transaction-local context is reset between jobs.
- **Success criteria:** No worker can read/write Tenant B while processing Tenant A; pooled connections do not retain tenant state.
- **Validation/evidence:** Real-Postgres worker test with query/audit correlation and before/after row assertions.
- **Stop/escalate:** In-memory or SQLite-only results cannot approve this task.

### Q-009 — Test cache, search, retrieval, and agent-context isolation

- **Purpose:** Prevent indirect tenant leakage through derived or cached data.
- **Dependencies:** T-029, I-021, A-004, implemented cache/search/retrieval layers.
- **Likely files:** Cache-key tests, retrieval integration tests, agent-run fixtures.
- **Steps:** Populate same-named records in two tenants; exercise caches, search indexes, chunk retrieval, prompt/context assembly, and response caching; assert namespace keys include tenant/workspace and policy version; test eviction and stale-index behavior.
- **Success criteria:** Tenant A inputs can never influence Tenant B retrieval results, prompt context, citations, or cached responses.
- **Validation/evidence:** Adversarial isolation suite and captured cache/index keys with sensitive values redacted.
- **Stop/escalate:** Disable the affected shared cache/index path until isolation is mechanically enforced.

### Q-010 — Test export and deletion isolation end to end

- **Purpose:** Validate the most consequential tenant data-lifecycle operations.
- **Dependencies:** T-023, UI-040, Q-002.
- **Likely files:** Export/deletion integration tests, disposable object-storage fixtures, E2E specs.
- **Steps:** Request tenant/workspace/entity-scoped export and deletion; test wrong-tenant IDs, cancellation, cooling period, retries, partial failure, expired downloads, tombstones, audit entries, and object cleanup; inspect archives for foreign records and secrets.
- **Success criteria:** Exports contain only authorized scope; deletions affect only approved scope and produce resumable, auditable terminal state.
- **Validation/evidence:** Archive manifest comparison, database/storage row checks, and E2E trace.
- **Stop/escalate:** Do not approve destructive testing outside disposable tenants and disposable storage prefixes.

### Q-011 — Test support-access grants and revocation

- **Purpose:** Prove privileged support access is exceptional, scoped, time-bound, and visible.
- **Dependencies:** T-022, UI-040, D-014.
- **Likely files:** Support-access integration tests, admin E2E specs, audit assertions.
- **Steps:** Request, approve, deny, use, expire, and revoke grants; test scope, reason, approver separation, step-up authentication, concurrent revocation, and direct-route bypass; verify the support actor sees only granted tenant/workspace/data classes.
- **Success criteria:** No standing support bypass exists; grant use and attempted overreach are audited; expiry and revocation take effect immediately.
- **Validation/evidence:** State-transition matrix, audit rows, and E2E traces for allowed and denied access.
- **Stop/escalate:** Launch blocks if support access depends on a shared credential or undocumented database-owner path.

### Q-012 — Run real-Postgres row-level-security verification

- **Purpose:** Validate database enforcement under the actual application role and pooler semantics.
- **Dependencies:** T-030, Q-002, disposable Postgres environment matching deployment topology.
- **Likely files:** Postgres integration suite, database test setup, validation receipt.
- **Steps:** Connect as the exact non-owner, non-`BYPASSRLS` runtime role; set transaction-local tenant/workspace context; test every tenant table, view, function, trigger, and migration helper; test omitted/malformed context, transaction rollback, connection reuse, and direct SQL attempts.
- **Success criteria:** Policies fail closed; pooled connections never inherit prior tenant context; privileged migration/admin roles are not used by application traffic.
- **Validation/evidence:** Role attributes, policy inventory, SQL test output, and connection-reuse trace recorded in `docs/validation/phase-2-postgres-isolation.md`.
- **Stop/escalate:** SQLite, service-role, owner-role, or mocked-policy tests cannot satisfy this gate.

### Q-013 — Test the document-ingestion pipeline end to end

- **Purpose:** Prove safe intake through evidence-ready material status.
- **Dependencies:** I-030, Q-003, disposable storage and worker runtime.
- **Likely files:** Ingestion integration/E2E tests, worker harness, fixture storage.
- **Steps:** Cover PDF, image/OCR, text, spreadsheet/catalog, URL snapshot, notes, customer-list classes, duplicates, updates, unsupported files, oversized/encrypted/malicious inputs, parser timeout, retry, quarantine, redaction, citation anchors, and deletion; assert status and lineage after every stage.
- **Success criteria:** Supported inputs become retrievable cited chunks; failures are explicit and recoverable; quarantined content never reaches agents.
- **Validation/evidence:** Fixture-by-stage matrix, job history, checksum/lineage assertions, and selected UI traces.
- **Stop/escalate:** Do not use live customer materials or production storage.

### Q-014 — Build deterministic adaptive-agent replay tests

- **Purpose:** Verify agent behavior without relying on nondeterministic live model calls.
- **Dependencies:** A-026, Q-003, versioned model/tool policy fixtures.
- **Likely files:** Agent replay harness, recorded tool/model fixtures, semantic assertions.
- **Steps:** Replay complete, sparse, contradictory, and adversarial business contexts; assert evidence selection, uncertainty, question utility/ranking, stop conditions, contradiction handling, abstention, and prohibition on fixed questionnaires; use schema assertions plus bounded semantic checks, not brittle prose equality.
- **Success criteria:** Equivalent evidence yields stable structured decisions; unsupported facts are not promoted; different businesses produce materially different question paths.
- **Validation/evidence:** Replay report with run/model/prompt/policy versions and explicit expected/actual decision fields.
- **Stop/escalate:** Any golden assertion that depends on exact natural-language wording must be replaced with a semantic contract.

### Q-015 — Certify every source connector against the adapter contract

- **Purpose:** Keep providers interchangeable, governed, and unable to mutate canonical accounts directly.
- **Dependencies:** C-034, Q-004, approved fixture or sandbox for each provider.
- **Likely files:** Connector conformance suite, provider fixtures, usage ledger tests.
- **Steps:** Run capability discovery, query validation, pagination, rate-limit, retry-after, timeout, partial result, malformed response, usage/cost reporting, provenance, terms metadata, disable/kill switch, and replay tests; assert output is normalized source observations only.
- **Success criteria:** A connector passes the same contract suite before enablement; no test performs uncontrolled live discovery or consumes paid quota without approval.
- **Validation/evidence:** Per-connector certification receipt with fixture versions and any explicitly approved sandbox-call IDs.
- **Stop/escalate:** Missing terms owner, retention policy, field provenance, or kill switch blocks connector activation.

### Q-016 — Test account resolution, qualification, and scoring regressions

- **Purpose:** Protect evidence-backed decisions as data and policies change.
- **Dependencies:** B-024, C-035, Q-003.
- **Likely files:** Resolution/scoring golden tests, policy-version fixtures, calibration reports.
- **Steps:** Test exact/fuzzy matches, parent/subsidiary, distributors, same-name entities, manual merge/split, conflicting observations, missing dimensions, stale evidence, hard exclusions, confidence caps, re-score, and replay under old/new policy versions; compare explanations and citations, not only totals.
- **Success criteria:** Scores are reproducible from versioned inputs; missing evidence cannot increase confidence; merges/splits preserve provenance and audit history.
- **Validation/evidence:** Golden decision ledger with per-dimension expected result and resolver/scorer version.
- **Stop/escalate:** A score that cannot be reconstructed from persisted evidence and policy is invalid.

### Q-017 — Test approval and outreach guardrails

- **Purpose:** Prove Nova Trade supports preparation and controlled handoff without autonomous sending.
- **Dependencies:** O-024, UI-033, Q-005.
- **Likely files:** Outreach policy unit tests, approval action tests, E2E specs.
- **Steps:** Test prohibited/missing citations, disputed facts, stale data, opt-out/do-not-contact, regional policy, frequency cap, duplicate recipient, invalid address, role permission, approval expiry, content mutation after approval, copy/export, and attempted send/API bypass; inspect audit and suppression effects.
- **Success criteria:** No unapproved or policy-failing draft reaches export/copy; no Nova Trade endpoint sends communication; approved artifact invalidates after material change.
- **Validation/evidence:** Guardrail matrix, negative route tests, E2E traces, and outbound-network assertion.
- **Stop/escalate:** Any automatic-send capability or suppression bypass is a release blocker.

### Q-018 — Automate the complete approved happy-path journey

- **Purpose:** Prove the platform works as one coherent product across phases.
- **Dependencies:** All phase acceptance gates through UI-041; Q-003 fixtures.
- **Likely files:** Playwright E2E spec, deterministic seed, validation receipt.
- **Steps:** Create tenant/workspace and members; acknowledge policies; upload materials and URL; review extraction; answer adaptive questions; approve business understanding; activate ICP and lead plays; preview/run discovery; review account, buying center, contacts, and score; approve/copy or export cited draft; record outcome; inspect report and learning proposal.
- **Success criteria:** The journey completes with authoritative persisted state after reload, correct citations/audit/versions, no live outreach, and no manual database edits.
- **Validation/evidence:** Trace, screenshots, fixture IDs, audit correlation IDs, and final state assertions.
- **Stop/escalate:** Do not replace missing product steps with test-only backdoors.

### Q-019 — Automate degraded and recovery journeys

- **Purpose:** Make partial failure a designed, observable workflow rather than an exception.
- **Dependencies:** Q-013 through Q-018.
- **Likely files:** Playwright/integration recovery specs, fault-injection fixtures.
- **Steps:** Inject parser failure, model timeout, connector quota, provider 429/5xx, stale lease, partial discovery, duplicate event, scoring error, approval race, expired export, and revoked permission; verify user-visible states, safe retry/resume/cancel, idempotency, and audit history.
- **Success criteria:** Every injected fault ends in a documented recoverable or terminal state without duplicate side effects, false success, or tenant leakage.
- **Validation/evidence:** Fault matrix with injected condition, expected state transition, retry count, and final data assertions.
- **Stop/escalate:** A silent partial result represented as complete blocks release.

### Q-020 — Enforce accessibility across critical workflows

- **Purpose:** Make keyboard and assistive-technology access a release requirement.
- **Dependencies:** UI-041, approved accessibility target in D-002.
- **Likely files:** Accessibility test config, Playwright/axe specs, manual review receipt.
- **Steps:** Run automated rules on every critical route/state; manually test keyboard order, focus restoration, dialogs, live progress, tables, evidence controls, status not conveyed by color, zoom/reflow, error association, and screen-reader names for primary journeys.
- **Success criteria:** Agreed WCAG target is met; no serious/critical automated violation; every blocker has owner and retest evidence.
- **Validation/evidence:** Automated reports plus a manual keyboard/screen-reader checklist at desktop and mobile widths.
- **Stop/escalate:** Do not waive inaccessible approval, governance, or data-correction controls for launch.

### Q-021 — Build a representative performance test fixture and harness

- **Purpose:** Measure realistic workload shapes with repeatable data.
- **Dependencies:** Q-002, Q-003, D-015.
- **Likely files:** Performance seed scripts, read-only load scenarios, metrics helpers, fixture manifest.
- **Steps:** Define small/medium/large tenant profiles; seed documents/chunks/accounts/contacts/runs/audit/events without paid calls; create scenarios for dashboards, paginated work queues, retrieval, ingestion enqueue, discovery enqueue, review, and export; tag synthetic data for cleanup.
- **Success criteria:** The harness reproduces agreed data volumes and emits latency, throughput, error, queue, database, and cost-proxy metrics.
- **Validation/evidence:** Seed counts/checksums, harness smoke run, and reproducibility instructions.
- **Stop/escalate:** Never point load tests at production or uncontrolled external providers.

### Q-022 — Establish and verify latency and throughput thresholds

- **Purpose:** Convert nonfunctional aspirations into release gates.
- **Dependencies:** Q-021 and targets approved in D-015.
- **Likely files:** Performance scenarios, `docs/validation/performance.md`, CI/nightly config.
- **Steps:** Measure p50/p95/p99 for key reads and writes, ingestion queueing, retrieval, scoring, dashboard loads, and exports; record dataset size and concurrency; separate synchronous response time from async completion; define regression tolerance and owner.
- **Success criteria:** Each critical operation has an approved threshold, measurement method, environment, and pass/fail result; failures are not averaged away.
- **Validation/evidence:** Versioned performance report with raw result artifact links and comparison to baseline.
- **Stop/escalate:** If targets are absent, mark the release decision blocked rather than inventing acceptable numbers.

### Q-023 — Verify queue fairness, concurrency, and tenant quotas

- **Purpose:** Prevent one tenant or job class from starving the system.
- **Dependencies:** Q-021, implemented scheduler/budget controls.
- **Likely files:** Queue load tests, scheduler unit tests, operational validation receipt.
- **Steps:** Enqueue mixed job classes and tenant sizes; test global/per-tenant/per-connector concurrency, priority, aging, quota exhaustion, kill switch, and cancellation; observe pool pressure and retry amplification.
- **Success criteria:** Work respects configured limits, makes bounded progress for every eligible tenant, and emits actionable saturation metrics.
- **Validation/evidence:** Timeline of lease/start/finish per tenant and assertions for fairness, caps, and queue depth.
- **Stop/escalate:** Unbounded tenant concurrency or starvation blocks multi-tenant rollout.

### Q-024 — Verify retry, backoff, dead-letter, and replay behavior

- **Purpose:** Make failure handling bounded and operable.
- **Dependencies:** Implemented job framework, Q-019.
- **Likely files:** Worker integration tests, clock/fault helpers, dead-letter admin tests.
- **Steps:** Inject retryable and non-retryable errors; assert exponential backoff/jitter policy, maximum attempts, lease expiry, dead-letter reason, operator visibility, replay authorization, replay idempotency, and audit correlation; test provider `Retry-After` handling.
- **Success criteria:** Retries cannot loop forever or stampede providers; replay is explicit and does not duplicate durable effects.
- **Validation/evidence:** State-transition test output and dead-letter/replay audit rows.
- **Stop/escalate:** A job type without classified error semantics cannot be enabled.

### Q-025 — Prove end-to-end idempotency for every mutation boundary

- **Purpose:** Prevent duplicate records, charges, drafts, and outcomes under retries.
- **Dependencies:** Q-004, implemented mutation endpoints/events/jobs.
- **Likely files:** Idempotency integration tests, event dedupe tests, database constraints.
- **Steps:** Submit identical and concurrent requests with same key; redeliver events; retry jobs after ambiguous completion; test key scope by tenant/workspace/operation, payload mismatch, expiry, and replay; verify usage ledger and audit behavior.
- **Success criteria:** Same logical operation produces one durable effect; conflicting payload reuse fails explicitly; idempotency cannot cross tenant boundaries.
- **Validation/evidence:** Before/after row and usage counts plus concurrency-test output.
- **Stop/escalate:** Do not rely on in-process locks as the sole idempotency mechanism.

### Q-026 — Test cancellation and partial-failure semantics

- **Purpose:** Make cancellation safe across multi-stage workflows.
- **Dependencies:** I-009, C-013, implemented cancellable runs/jobs.
- **Likely files:** State-machine tests, worker integration tests, UI recovery E2E.
- **Steps:** Cancel queued and running ingestion/discovery/export tasks; race cancel with completion/retry; test child-job propagation and provider calls already in flight; preserve completed evidence and billable usage; prohibit terminal-state reversal without explicit replay.
- **Success criteria:** Cancellation reaches a documented terminal state, creates no orphaned work, preserves truthful partial results, and never reports unperformed rollback.
- **Validation/evidence:** Transition matrix, job-tree assertions, usage rows, and UI trace.
- **Stop/escalate:** Undefined provider-cancellation or partial-billing semantics require product/operations decision.

### Q-027 — Standardize correlation IDs, structured logs, and redaction tests

- **Purpose:** Make cross-service diagnosis possible without leaking sensitive data.
- **Dependencies:** T-021, job/run framework, D-010.
- **Likely files:** Logging/telemetry helpers, middleware, worker wrappers, redaction tests.
- **Steps:** Define request/run/job/tenant-safe correlation fields; propagate them through routes, services, jobs, connector calls, agent runs, and audit events; classify prohibited log fields; test redaction for secrets, document content, prompts, contacts, and provider payloads; avoid raw tenant names when stable opaque IDs suffice.
- **Success criteria:** One correlation ID traces a workflow end to end; automated tests fail on prohibited fields; logs remain useful for incident triage.
- **Validation/evidence:** Synthetic trace across components and redaction test corpus/report.
- **Stop/escalate:** Do not log sensitive content merely to satisfy observability.

### Q-028 — Define and verify service-level objectives, health checks, and alerts

- **Purpose:** Establish measurable reliability and actionable operations signals.
- **Dependencies:** D-015, Q-027, implemented metrics.
- **Likely files:** SLO/alert documentation, health endpoints, dashboard definitions or infrastructure manifests.
- **Steps:** Define availability/freshness/completion SLOs for core UI, ingestion, discovery, agent, scoring, export, and outreach-preparation paths; implement shallow/dependency health signals; define burn-rate/queue-stall/provider-error alerts with owner, severity, runbook, and test signal.
- **Success criteria:** Every launch-critical service has SLI formula, target, window, alert, owner, and tested runbook link; health does not expose secrets.
- **Validation/evidence:** Alert test or synthetic trigger, dashboard screenshot/export, and SLO review receipt.
- **Stop/escalate:** An alert with no owner or response action is not a release control.

### Q-029 — Verify tenant/provider/job cost attribution

- **Purpose:** Make variable-cost behavior explainable and governable.
- **Dependencies:** C-011, A-020, implemented usage ledger.
- **Likely files:** Usage-ledger reconciliation tests, admin reporting tests, cost fixture tables.
- **Steps:** Record model tokens, connector units, storage/processing proxies, retries, cached calls, cancelled work, and adjustments; reconcile usage to runs/jobs/tenant/workspace/provider; test duplicate events, missing provider cost, currency/unit versions, and redacted admin visibility.
- **Success criteria:** Every billable or budgeted operation has one attributable ledger trail; unknown cost is explicit, never silently zero.
- **Validation/evidence:** Fixture reconciliation report with expected/actual quantities and lineage IDs.
- **Stop/escalate:** Do not label estimates as invoices or expose one tenant's costs to another.

### Q-030 — Test budgets, quotas, circuit breakers, and kill switches

- **Purpose:** Bound spend and operational blast radius.
- **Dependencies:** T-032, C-012, Q-029.
- **Likely files:** Policy/action tests, worker integration tests, admin E2E specs.
- **Steps:** Exercise soft warning, hard cap, per-run/per-day/per-tenant/provider quotas, concurrency cap, global connector disable, tenant disable, and emergency kill; race changes with queued/running work; verify read/review remains available and history is retained.
- **Success criteria:** New costly work stops at hard limits, warnings arrive before limits, existing evidence remains reviewable, and every override is authorized/audited.
- **Validation/evidence:** Policy matrix with usage before/after, job outcomes, UI state, and audit rows.
- **Stop/escalate:** Any expensive path that bypasses the central budget check blocks activation.

### Q-031 — Split continuous integration into explicit verification lanes

- **Purpose:** Give contributors fast feedback while preserving strong release gates.
- **Dependencies:** Q-001 and implemented test suites.
- **Likely files:** CI workflow files, package scripts only when necessary, CI documentation.
- **Steps:** Define formatting/lint, typecheck, unit, contract, SQLite compatibility, real-Postgres integration/RLS, E2E, accessibility, security, migration, and scheduled performance lanes; document triggers, dependencies, timeouts, artifacts, secrets, and required status checks; cache only safe dependencies.
- **Success criteria:** Every required gate is visible and independently diagnosable; no required suite is hidden behind an always-green wrapper.
- **Validation/evidence:** CI configuration validation and a run showing each lane/artifact, with skipped lanes carrying an explicit reason.
- **Stop/escalate:** CI changes that require repository settings or paid infrastructure need owner approval before mutation.

### Q-032 — Add automated security and compliance verification

- **Purpose:** Catch common security, privacy, and policy regressions continuously.
- **Dependencies:** D-010 through D-014, Q-031.
- **Likely files:** CI workflows/config, security test scripts, policy checklists.
- **Steps:** Add dependency/secret scanning, static analysis, migration/RLS checks, authorization negative tests, log-redaction tests, connector allowlist/terms metadata checks, retention/export/delete tests, and prompt-injection corpus; define severity policy, false-positive process, owner, and update cadence.
- **Success criteria:** Agreed blocking severities fail CI; exceptions are time-limited, reasoned, owned, and auditable.
- **Validation/evidence:** Clean or triaged scan reports plus test findings proving the gates fail when seeded with safe synthetic violations.
- **Stop/escalate:** Do not upload proprietary code, secrets, or customer data to a scanner without approval and contract review.

### Q-033 — Build and test the feature-flag registry

- **Purpose:** Make phased exposure explicit, reversible, tenant-aware, and auditable.
- **Dependencies:** T-018, rollout decisions.
- **Likely files:** Feature-flag schema/service, admin tests, flag registry documentation.
- **Steps:** Register each major capability with owner, default, scope, prerequisites, expiry/review date, fallback behavior, and rollback effect; test global/tenant/workspace evaluation, unknown flags, cache invalidation, authorization of changes, and audit; prevent flags from bypassing security policy.
- **Success criteria:** Every rollout phase has a documented controlling flag; disabling restores the promised safe state without data loss.
- **Validation/evidence:** Registry validation test, evaluation matrix, and admin action audit rows.
- **Stop/escalate:** A permanent flag without owner/removal criterion or a security control implemented only as a flag is invalid.

### Q-034 — Rehearse database migration, backfill, and compatibility

- **Purpose:** Prove legacy data can evolve without corruption or avoidable downtime.
- **Dependencies:** G-025, all schema migrations for the candidate phase, representative sanitized data snapshot or synthetic equivalent.
- **Likely files:** Migration rehearsal scripts, validation queries, `docs/validation/migration-rehearsal.md`.
- **Steps:** Start from the oldest supported schema; apply migrations in deployment order; run resumable backfills; interrupt and resume; verify tenant assignment, constraints, RLS, row counts, checksums, compatibility reads/writes, and timing; test rollback only where contract says reversible.
- **Success criteria:** Rehearsal is repeatable; no orphaned or cross-tenant data; backfill can resume safely; deployment window and lock risk are known.
- **Validation/evidence:** Migration transcript, timings, before/after counts/checksums, and reconciliation queries.
- **Stop/escalate:** Never rehearse destructive migrations on the sole copy of data or claim rollback where irreversible data transformation occurred.

### Q-035 — Verify legacy Google Places and local-site compatibility

- **Purpose:** Preserve the useful existing foundation while generalizing its assumptions.
- **Dependencies:** G-025, C-033, compatible UI routes.
- **Likely files:** Compatibility integration/E2E tests, fixture adapters, validation receipt.
- **Steps:** Replay existing local-site qualification, lead listing/detail, CSV/export, status, note, suppression, and Google Places fixture flows through compatibility adapters; compare field semantics and known intentional differences; test SQLite local mode where still supported and Postgres canonical mode.
- **Success criteria:** Approved legacy workflows remain functional or have explicit migration/deprecation behavior; Google Places is one governed connector, not a privileged domain model.
- **Validation/evidence:** Legacy parity matrix with old/new fixture outputs and route traces.
- **Stop/escalate:** Do not preserve a legacy shortcut that violates tenant isolation, evidence, consent, or outreach guardrails.

### Q-036 — Rehearse application rollback and forward recovery

- **Purpose:** Verify failed rollout can return to a safe operable state.
- **Dependencies:** Q-033, Q-034, deployable candidate artifact.
- **Likely files:** Rollback runbook, deployment validation scripts/config under existing conventions.
- **Steps:** Define code, flag, worker, connector, and migration rollback boundaries; deploy candidate to disposable/staging environment; create in-flight jobs and new-version data; disable flags/rollback code as permitted; verify old version behavior, worker compatibility, queue handling, and data readability; document forward-fix path for irreversible migrations.
- **Success criteria:** Operators can execute the documented safe response within the agreed recovery target without deleting tenant data or duplicating side effects.
- **Validation/evidence:** Timed rehearsal transcript and before/after health/data checks.
- **Stop/escalate:** If rollback is impossible, release requires an approved forward-only recovery plan and narrower canary.

### Q-037 — Write and tabletop queue/provider incident runbooks

- **Purpose:** Prepare operators for stalled work, provider outages, and runaway cost.
- **Dependencies:** Q-024, Q-028, Q-030.
- **Likely files:** `docs/runbooks/queue-provider-incident.md`, tabletop receipt.
- **Steps:** Document detection, severity, ownership, correlation lookup, safe pause/kill, queue inspection, provider disable, retry/dead-letter policy, customer-impact assessment, communications owner, recovery, reconciliation, and post-incident actions; run a scenario for provider 429/outage plus queue buildup.
- **Success criteria:** An on-call operator can stop blast radius, preserve evidence/history, recover bounded work, and identify affected tenants without database improvisation.
- **Validation/evidence:** Tabletop timeline, participant/owner signoff, gaps converted to explicit follow-up tasks.
- **Stop/escalate:** Do not include raw production secrets or destructive ad-hoc SQL in the runbook.

### Q-038 — Write and tabletop suspected tenant-leakage response

- **Purpose:** Provide a precise response to the highest-severity privacy incident.
- **Dependencies:** T-021, Q-027, legal/security contacts approved in D-011/D-012.
- **Likely files:** `docs/runbooks/tenant-isolation-incident.md`, tabletop receipt.
- **Steps:** Document detection, immediate containment, evidence preservation, access revocation, flag/connector/worker shutdown, affected-scope analysis, log/audit queries, legal/privacy escalation, notification decision owner, remediation, validation, and restart criteria; run a synthetic suspected-leak scenario.
- **Success criteria:** Roles and decision authority are explicit; containment does not destroy evidence; restart requires isolation proof and approval.
- **Validation/evidence:** Tabletop record, timed actions, query/runbook verification, and resolved gap list.
- **Stop/escalate:** Do not simulate with real cross-tenant exposure or include regulated data in tabletop artifacts.

### Q-039 — Execute canary rollout gates and decision ledger

- **Purpose:** Expose capability gradually with measurable promotion and rollback criteria.
- **Dependencies:** Q-001 through Q-038 relevant to the candidate phase; approved rollout cohort.
- **Likely files:** `docs/validation/canary-rollout.md`, feature-flag/audit records; no production mutation without explicit authorization.
- **Steps:** Define internal/synthetic, design-partner, limited tenant, and broader stages; set entry/exit metrics, duration, cohort, support coverage, budgets, stop conditions, rollback owner, and evidence sources; capture every promote/hold/rollback decision with approver and timestamp.
- **Success criteria:** No stage advances on intuition alone; tenant isolation/security/consent failures force immediate stop; metrics and qualitative feedback meet approved thresholds.
- **Validation/evidence:** Stage-by-stage decision ledger referencing dashboards, incidents, feedback, costs, and gate receipts.
- **Stop/escalate:** Planning this task grants no authority to enable production flags, enroll tenants, or contact users.

### Q-040 — Run the final production-readiness and compliance gate

- **Purpose:** Produce the explicit go/no-go decision for launch scope.
- **Dependencies:** All in-scope phase gates and Q-001 through Q-039; decision owners assigned.
- **Likely files:** `docs/validation/production-readiness.md`, linked evidence only.
- **Steps:** Review functional acceptance, open defects, tenant/RBAC/RLS evidence, privacy/security/consent, source terms, outreach guardrails, data lifecycle, accessibility, performance/SLOs, costs/budgets, migration/rollback, runbooks/on-call, support, metrics, flags, and canary results; record exclusions and residual risks; obtain named approvals.
- **Success criteria:** Every launch criterion is pass, explicitly accepted risk, or out of scope with disabled capability; no critical/high unresolved isolation, authorization, privacy, consent, or autonomous-outreach risk; decision is signed and time-bounded.
- **Validation/evidence:** Final readiness matrix with direct links to commands, CI runs, traces, receipts, policies, and approvers.
- **Stop/escalate:** Missing evidence is not a pass; launch remains blocked until the accountable owner decides and records disposition.

## Cross-phase acceptance criteria

The implementation is acceptable only when all criteria below are demonstrably true for the approved launch scope:

1. Existing useful Nova Trade capabilities are preserved through explicit compatibility contracts, while local-site, Google-Places-first, `leads`, synchronous-workflow, and global-settings assumptions are generalized or isolated behind adapters.
2. Every tenant-owned read, write, job, cache key, search/retrieval operation, export, deletion, audit query, and administrative action has fail-closed tenant and workspace boundaries.
3. The deployed Postgres runtime uses a verified non-owner, non-`BYPASSRLS` application role and transaction-local tenant context; real-Postgres tests prove pooled-connection safety.
4. Arbitrary approved business materials can be ingested safely, versioned, quarantined, deleted, and traced to stable evidence anchors without silently promoting unsupported extraction.
5. Business understanding, adaptive questions, ICPs, lead plays, discovery plans, qualification, scores, buying-center hypotheses, contacts, drafts, and learning proposals are versioned and reconstructable from inputs, policy, model/tool versions, and citations.
6. The question system is adaptive and uncertainty-driven; it does not reduce all tenants to a fixed questionnaire and can stop when expected information gain is below the approved threshold.
7. Sources are governed connectors with declared terms, ownership, fields, provenance, cost, retention, geography, limits, health, and kill behavior. Google Places is one connector, not the canonical domain.
8. Candidate observations never become canonical accounts without resolution/provenance logic; manual merge/split and evidence correction remain auditable and reversible where defined.
9. Scores expose dimensions, evidence, uncertainty, conflicts, policy/version, and explanation; missing evidence cannot masquerade as a negative fact or increase confidence.
10. Human approval is required before any outreach artifact leaves the product; Nova Trade performs no autonomous sending in launch scope; suppression, consent, regional policy, frequency, and prohibited-claim checks fail closed.
11. Role permissions are enforced server-side and match UI affordances; support access is scoped, reasoned, approved, time-bound, revocable, and audited.
12. Export, deletion, retention, legal-hold, audit, and backup behavior matches approved policy and is verified on disposable data before production use.
13. Critical journeys meet approved accessibility, performance, reliability, recovery, observability, cost, and operational-readiness targets with retained evidence.
14. No phase is called complete from implementation or inspection alone: its acceptance gate and required negative tests pass in the named environment.

## Validation matrix

| Layer | Required proof | Minimum environment | Blocking examples |
|---|---|---|---|
| Static | Format/lint/typecheck/build and schema validation | Local/CI | Invalid types, undocumented contract break |
| Unit | Domain invariants, policies, state machines, parsers, scoring, redaction | Local/CI | Unsupported claim promoted, invalid transition accepted |
| Contract | Route/action/event/job/connector version fixtures | CI | Breaking field removal, connector mutates account |
| Database | Migrations, constraints, repository isolation, RLS, backfill | Disposable real Postgres | Owner-role test only, pooled tenant context leak |
| Worker | Lease, retry, idempotency, cancellation, tenant context, budgets | Disposable queue/worker + Postgres | Duplicate effects, stale context, unbounded retries |
| Integration | Ingestion, agents/replay, connectors, resolution/scoring, outreach gates | Fixture providers/replays | Live paid call required, false success on partial failure |
| E2E | Authenticated role journeys, cross-tenant negatives, recovery, responsive UI | Production-like test environment | Direct URL bypass, inaccessible approval, overflow |
| Operational | SLO/alert tests, runbooks, migration/rollback, canary | Staging/disposable infrastructure | No rollback/forward recovery, alert without owner |
| Compliance | Source terms, consent, privacy, lifecycle, audit, security review | Named accountable review | Unapproved source, missing lawful basis/retention owner |

Every validation receipt must name the commit, environment, fixture IDs, commands or test run, exit/result, timestamp, and reviewer. Screenshots alone do not prove authorization, database isolation, or data integrity.

## Principal risks and dependencies

| Risk or dependency | Why it matters | Required mitigation/owner action |
|---|---|---|
| Tenant-context design and pooler behavior | A single stale context can leak data | Approve D-004; implement T-030; block on Q-012 |
| Auth provider and workspace inheritance | Changes schema, UI, invitations, and support | Resolve D-003/D-004 before tenant UI work |
| Source licensing and permitted use | Discovery/contact use can be contractually or legally restricted | Approve D-011/D-012; require connector terms owner/certification |
| Outreach legal scope | Consent, suppression, and regional rules affect every export | Approve D-013; keep launch no-send; block on Q-017 |
| Customer materials and prompt injection | Inputs may be sensitive, hostile, or misleading | Classification, quarantine, sandboxing, redaction, evidence boundaries |
| Model/provider nondeterminism | Reproducibility and claims can drift | Version everything, replay fixtures, semantic contracts, abstention |
| Identity resolution errors | Bad merges contaminate qualification/outreach | Conservative confidence, manual merge/split, immutable provenance |
| Provider cost/rate limits | Agents can create unbounded spend or queue pressure | Central ledger/budgets/fairness/kill switches and approved limits |
| Legacy SQLite and route compatibility | Premature removal can break current users/local development | Compatibility layer, parity matrix, explicit deprecation decision |
| Migration/backfill scale | Locks or partial backfills can interrupt service | Resumable jobs, rehearsal, compatibility reads, canary, forward recovery |
| Operations ownership | Alerts and incidents are ineffective without responders | Assign owners, SLOs, runbooks, tabletop, launch coverage |
| Success metric definitions | Product learning can optimize misleading proxies | Resolve D-015 and preserve denominators/cohorts/version attribution |

## Implementation-orchestrator handoff

The implementation orchestrator must treat this file and the PRD as paired source of truth: the PRD defines product intent; this plan defines decomposition, ordering, validation, and stop conditions. If they conflict, stop and request a product decision rather than silently editing either contract.

### Recommended first implementation slice

Start after D-001 through D-004 and the local/disposable portion of D-005 are approved. Remote-baseline evidence may remain activation-blocked while local work continues. Dispatch the first slice in this order: Q-001, T-001 through T-006, T-010 through T-013, T-019 through T-021, T-025 through T-030, then T-033. Do not integrate ingestion, agent, connector, or UI tenancy paths until the Phase 2 gate proves the boundary on real Postgres; independent fixtures, contracts, and disabled adapters may proceed in parallel.

### Dispatch protocol for one-task agents

For each task, the implementation orchestrator must create a fresh task receipt using the template earlier in this plan and assign exactly one primary task ID. It may bundle only inseparable validation inside that ID. The worker prompt must include:

- the exact task text, dependencies already satisfied, allowed write set, and files it must not change;
- the applicable `AGENTS.md`, README/docs, nearby implementation patterns, and current branch/worktree state;
- required commands and environment, including whether network, provider credentials, paid calls, or production access are forbidden;
- the expected tests/evidence and the exact stop/escalate condition;
- an instruction to return changed paths, commands with exit codes, unresolved findings, and no commit unless authorized.

The orchestrator must review every returned diff, run or independently verify required checks, update the durable plan/receipt, and close the worker before dispatching overlapping write scopes. A worker’s assertion that a task is complete is not acceptance evidence.

### Parallelism rules

- Decision tasks can run in parallel by owner, but implementation depending on them cannot start.
- Within a phase, tasks with disjoint write sets and satisfied dependencies may run concurrently; schema/interface producers land before consumers.
- Only one worker may modify a shared migration sequence, central schema, auth middleware, route shell, job framework, or shared contract at a time.
- Read-only fixture, documentation, and test-design work may run beside implementation when it does not assume an undecided contract.
- Run each phase acceptance gate after integration, not independently in worker forks.
- Never run provider/live outreach, production mutation, account/security changes, destructive data operations, or paid services without explicit approval.

### Required skills and tools during implementation

Use repository-native search (`rg`/`rg --files`), `apply_patch` for targeted edits, package scripts as declared, disposable SQLite/Postgres fixtures, and browser/E2E tools for visible workflows. Consult current primary documentation for Next.js, Supabase/Postgres/RLS/pooler behavior, authentication, source/provider APIs, and compliance-sensitive integrations when implementing; record versions/links in decision or validation receipts. Use specialized security, accessibility, database, and browser review lanes when the corresponding phase begins. Do not add infrastructure, a model provider, a connector, or an outreach transport because it seems convenient; each requires the relevant decision task.

### Completion and escalation rules

- Mark a task complete only after its success criteria and validation/evidence are satisfied in the named environment.
- Mark a phase complete only after its phase gate passes and linked evidence is reviewed.
- If a task reveals missing product policy, schema ownership, source permission, security boundary, migration strategy, or acceptance target, pause dependent work and add/resolve a decision task.
- If current code contradicts a current-state PRD fact, record the discrepancy and use repository/runtime evidence; do not rewrite history silently.
- If the worktree contains overlapping user changes, preserve them and escalate the collision.
- Do not claim deployed, live, production-verified, legally approved, or end-to-end verified unless that exact event occurred and evidence is linked.

At the beginning of implementation, the implementation orchestrator should create its own persistent execution goal, keep the durable phase/task status current, and continue until the authorized slice is accepted or a genuine decision/authority blocker remains.

## Planning orchestration closeout

Five read-only planning workers examined distinct surfaces: tenant/security/data foundations; ingestion/agent/evidence; connectors/accounts/scoring; product workflows/UI; and QA/operations/release. The parent planner reconciled their recommendations against the repository and PRD and owns this integrated artifact. Workers did not edit application files, configuration, or this plan.

The plan intentionally favors many small, explicit tasks over broad epics. Overlap is retained only when one task implements a capability and a later task independently certifies it. Repeated implementation work should instead be treated as a dependency or integration check.

No background browser research lane was needed: current-state facts came from the repository, and external provider/legal/technical choices remain explicit decision or implementation-time primary-source verification tasks. No outreach, external changes, commits, application changes, or configuration changes are authorized by this plan.
