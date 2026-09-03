# Nova Trade Tenant and Workspace Contract

**Status:** Accepted D-001 architecture contract — parent-verified for local implementation
**Date:** 2026-07-27
**Scope:** Tenant/workspace ownership, lifecycle, authorization, compatibility, and deletion semantics
**Source decisions:** PRD sections 4, 9, 11, 15, 22, and 23; implementation-plan decision D-001
**Authority:** This document is the implementation contract for tenant/workspace behavior. It does not authorize production migrations, customer enrollment, cross-tenant sharing, or outreach.

## 1. Decision

Nova Trade models a **tenant** as one client organization. A tenant owns its users, business materials, knowledge, policies, usage, research, accounts, contacts, decisions, outcomes, and audit history.

A **workspace** is an optional subdivision inside exactly one tenant. It may represent a brand, region, team, or business unit. A workspace is never an organization, never an authorization boundary above the tenant, and never transferable to another tenant. A tenant may operate without any workspace.

Canonical accounts, contacts, source evidence, documents, claims, and business knowledge are tenant-wide by default. A tenant may organize strategies, runs, qualification, outreach, and reporting by workspace. A workspace scope is an additive filter and ownership relationship; it can never grant access to another tenant's records.

The implementation must preserve the existing local-website workflow as one compatibility lead play. It must generalize the surrounding contracts so that a tenant can instead sell specialty chemicals, industrial components, services, software, or another evidenced B2B offering. Website status, reviews, ratings, Colorado ZIP coverage, and Google Places are characteristics of that compatibility play, not universal tenant or account requirements.

## 2. Normative language and scope classes

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

Every resource instance has exactly one scope class:

| Scope class | Meaning | Examples |
|---|---|---|
| `platform-global` | Owned by Nova Trade as product infrastructure or non-tenant reference data. It contains no tenant-private content and cannot be used as an implicit authorization grant. | Role definitions, connector type definitions, supported file-type policy, geography reference data, platform health. |
| `tenant-wide` | Belongs to one tenant and is visible only to authorized members of that tenant, regardless of the selected workspace. `workspace_id` is absent or explicitly null, except where a tenant-wide policy relation uses it only as a target restriction. | Canonical accounts, contacts, source evidence, documents, tenant policy, memberships, customer lists, suppressions. |
| `workspace-optional` | Belongs to one tenant and may either be tenant-wide or attached to exactly one workspace. The creator or owning policy must record which scope was chosen; it cannot silently change scope. | ICPs, lead plays, play versions, discovery runs, qualification assessments, outreach drafts, reports, agent runs. |
| `workspace-required` | The relationship is meaningful only within one workspace and MUST carry one workspace belonging to the same tenant. At launch, this class applies to workspace membership/assignment rows and to an instance explicitly created as workspace-local; no canonical knowledge or account record is intrinsically workspace-required. | A user-to-workspace membership, a workspace-local play execution, a workspace-local approval task. |

For a `workspace-optional` resource, `workspace_id = null` means tenant-wide. A tenant-wide access grant or policy relation MAY carry a workspace ID as a target restriction, but that binding does not make the grant workspace-owned. A null workspace ID never means “all tenants,” “unknown tenant,” or “use the user's default workspace.”

## 3. Core invariants

1. Every tenant-owned row, object, event, queue item, cache key, search-index entry, embedding, export, log record containing tenant content, and agent context MUST have a resolvable `tenant_id`.
2. Every non-null `workspace_id` MUST resolve to an active or retained workspace whose immutable `tenant_id` equals the row's `tenant_id`.
3. A request-supplied tenant or workspace ID is a **selector only**. It is never proof of authorization. The server derives the effective scope from the authenticated principal, membership, support grant, job lease, and policy.
4. Every read, write, export, retrieval, tool call, background job, cache lookup, and delete operation MUST enforce effective tenant scope in the data-access layer and at the application boundary. UI filtering is not a security control.
5. A service role, worker secret, queue token, API route, or database connection MUST NOT widen scope. A worker receives tenant/workspace authority from an authenticated, audited job lease, not from a caller-controlled payload.
6. Tenant-wide records are not duplicated into workspaces to simulate access. Workspace views reference the tenant-wide canonical record and apply an authorized workspace filter to related scoped work.
7. A canonical account or contact cannot be owned by two tenants. A source observation may describe the same external organization for multiple tenants, but each tenant receives an isolated observation and provenance record; no tenant can retrieve another tenant's observation.
8. A workspace cannot be moved, copied, merged, or attached to another tenant. Cross-tenant sharing is prohibited at launch.
9. Archived or suspended scope is not an authorization bypass. It limits allowed transitions while retaining the scope needed for authorized read, export, retention, and deletion operations.
10. Deletion removes tenant content from primary data, object storage, indexes, caches, queues, derived artifacts, and agent context according to policy. Required audit tombstones may remain content-minimized and non-reconstructive.
11. Versioned decisions retain their tenant/workspace scope and provenance. A later version never rewrites the ownership or evidence context of an earlier version.
12. A tenant switch invalidates the prior effective context, clears or namespaces client caches, and rechecks membership before any data is rendered or mutated.

## 4. Tenant lifecycle

Tenant state is one of the following:

| State | Meaning | Allowed operations |
|---|---|---|
| `provisioning` | Operator-created shell is being initialized; no normal tenant work is available. | Complete setup, assign verified owner, create initial policy, record audit events. No discovery, ingestion, contact use, or outreach. |
| `active` | Normal operating state. | Authorized reads and writes subject to role, workspace, policy, budget, and human gates. |
| `suspended` | Access or execution is temporarily stopped for security, billing, policy, abuse, or operational reasons. | Authorized administrators/support may inspect status, export, remediate, and restore. New runs, ingestion, contact use, and outreach are blocked. Existing jobs are paused or canceled safely. |
| `archived` | Tenant is retained but no longer operating. | Read-only access for authorized administrators, policy-compliant export, retention processing, and deletion request. No new business data or side effects. |
| `deletion_pending` | A verified deletion request is executing or waiting on an explicit legal hold review. | Authorized deletion workflow, status inspection, legal-hold handling, and minimal audit. Normal tenant content access is blocked. |
| `deleted` | Tenant content deletion is complete; only non-reconstructive tombstone metadata may remain. | No login, read, write, restore, transfer, or reuse. An external identity may be invited into a new tenant but does not recover the deleted tenant. |

Tenant transitions MUST be explicit, audited, idempotent, and policy-checked:

```text
provisioning -> active -> suspended -> active
active -> archived
suspended -> archived
archived -> deletion_pending -> deleted
active -> deletion_pending only through an explicit verified deletion workflow
```

There is no tenant-to-tenant transfer transition. A tenant rename, owner replacement, or membership change does not change tenant identity or ownership of its records.

## 5. Workspace lifecycle

Workspace state is one of the following:

| State | Meaning | Allowed operations |
|---|---|---|
| `provisioning` | Workspace exists inside an active tenant but is not ready for normal work. | Configure name/label, assign members, set permitted workspace policy, and activate. |
| `active` | Workspace accepts authorized scoped work. | Create and update allowed workspace-scoped strategies, runs, reviews, outreach drafts, outcomes, and reports. Read tenant-wide records permitted by role. |
| `paused` | Workspace work is temporarily stopped without deleting history. | Read retained data, export where authorized, finish safe bookkeeping, and restore. New runs, ingestion, or outreach side effects are blocked unless an administrator explicitly permits a recovery operation. |
| `archived` | Workspace is retained for history but no longer operating. | Read-only review, export, reassignment within the same tenant, and deletion processing. No new scoped objects or side effects. |
| `deletion_pending` | Workspace-scoped content is being removed. | Idempotent deletion and audit status only. |
| `deleted` | Workspace-scoped content is removed; the workspace identifier is not reusable. | No read, write, restore, transfer, or recreation under the old identifier. |

Archiving a workspace MUST NOT archive or delete tenant-wide accounts, contacts, source evidence, documents, claims, suppressions, or business understanding. Workspace-scoped plays, runs, qualification records, review tasks, outreach drafts, outcomes, and reports become read-only until they are either retained as historical records, reassigned to another active workspace in the same tenant through an explicit audited operation, or deleted under policy. Reassignment is not automatic and MUST preserve the original workspace ID in history.

Deleting a workspace deletes only its workspace-owned content and workspace-specific associations. A tenant administrator must resolve or explicitly retain any workspace-scoped jobs before deletion. Canonical tenant-wide records remain available to other authorized workspaces. A deleted workspace cannot be restored or attached to another tenant.

## 6. Authorization and tenant switching

The effective scope for a request is computed from:

1. The authenticated identity and current session.
2. An active tenant membership or an explicitly granted, time-bound support elevation.
3. The requested tenant selector, which MUST match an authorized membership/grant.
4. The requested workspace selector, if any, which MUST belong to the selected tenant and be permitted by membership, role, and policy.
5. The action's object ownership, lifecycle state, role permission, retention state, and human-gate requirements.

The server MUST reject, rather than reinterpret, these conditions:

- a tenant selector that is not an authorized membership or support grant;
- a workspace selector that belongs to another tenant;
- a row whose `tenant_id` conflicts with its parent, workspace, job lease, or authenticated scope;
- an omitted tenant ID when the operation could touch tenant-owned data;
- a non-null workspace selector for a tenant-wide-only operation;
- a workspace-scoped operation with no workspace when the resource instance is `workspace-required`;
- a job payload that attempts to change its leased tenant or workspace;
- a stale, revoked, archived, or deleted scope for a new side effect.

On tenant switch, the client MUST discard the previous tenant's in-memory query results, selected rows, drafts, optimistic mutations, search/retrieval context, and workspace selector. The server MUST reissue or revalidate a tenant-scoped session context. API and server-action handlers MUST reauthorize every call; a stale browser state must fail closed. Background jobs continue under their immutable leased scope and are not switched by a user's browser action.

Platform support access is separate from tenant membership. It requires a time-bound, reason-coded, audited grant naming the tenant and permitted action set. Support access does not automatically expose documents, customer lists, contacts, prompts, or agent context.

## 7. Resource ownership matrix: current repository

The current repository has 23 application tables listed in `docs/DATA_RECOVERY.md` and created in `src/lib/db/schema.ts`. They predate multi-tenancy and currently do not provide a complete tenant boundary. Until migration and isolation evidence are complete, the current database is treated as a legacy single-tenant compatibility store, not as proof that records are safe to share.

| Current table | Scope class after migration | Ownership and relationship | Lifecycle, archive, delete, transfer rule |
|---|---|---|---|
| `zip_codes` | `platform-global` | Non-private geographic reference data. | Active/archived reference rows; archive stops new selection but does not delete historical labels. Never transfer or expose as tenant content. |
| `location_markets` | `platform-global` | Supported market reference definitions. Tenant policy selects allowed markets. | Active/paused/archived as reference data. Historical runs retain the market ID/label. No tenant transfer. |
| `location_cells` | `platform-global` | Market subdivisions used by discovery coverage. | Active/archived reference lifecycle. Historical run units retain their original cell reference. No tenant transfer. |
| `settings` | `tenant-wide` | The current singleton is a legacy tenant policy record. After migration, platform defaults are a separate `platform-global` resource; tenant settings remain tenant-wide; workspace-specific settings are explicit `workspace-optional` child overrides; secret references remain tenant-owned. | Tenant settings follow tenant lifecycle; sensitive values are deleted through secret-retention policy. Never use a global singleton for tenant authorization or transfer settings between tenants. |
| `app_users` | `platform-global` | Supabase Auth owns the global authentication identity; a profile row contains identity-level display/status data and grants no tenant access. The legacy row's `user_id`, email, display name, and identity status map to that global identity/profile. Its legacy role, market access, and tenant-use meaning map to new tenant-owned `memberships` and role bindings for the explicitly approved legacy tenant; they are not copied into a global profile. One Auth identity may have memberships in many tenants, and each membership belongs to exactly one tenant. | Global identity/profile lifecycle is independent of tenant membership. Membership may be invited, active, suspended, revoked, or removed. Removing one membership does not delete the identity, tenant data, or another tenant's membership. No legacy row may authorize a tenant until its membership mapping is explicit. |
| `user_market_access` | `tenant-wide` | Compatibility market access becomes a tenant-owned access-grant/policy relation with an optional workspace ID that narrows its target. The grant remains tenant-wide ownership; the optional workspace binding is not an alternate scope class and never grants access to another tenant. | Revoke access immediately; preserve audit history. A market grant cannot authorize another tenant or transfer a user-owned record. |
| `crawl_runs` | `workspace-optional` | Legacy discovery run maps to `source_runs`/agent runs. It inherits tenant from its play or explicit tenant-wide compatibility play and may carry a workspace. | Queued/running/paused/blocked/done/error/canceled. Archived runs are immutable history. Delete only under tenant retention; never move across tenants. |
| `crawl_units` | `workspace-optional` | Unit is owned by its `crawl_run` and inherits the parent's tenant-wide or workspace scope exactly. It cannot choose, broaden, or change scope independently; a workspace ID is present only when the parent run has that same workspace ID. | Retry/cancel/complete with the parent run. Delete with the parent according to retention. No independent transfer or scope change. |
| `leads` | `tenant-wide` | Current lead becomes a compatibility candidate/account view. Canonical organization identity is tenant-owned; a separate workspace-optional play association carries any workspace context; website fields are play-specific observations. | New/verified/contacted/etc. and archived are retained as history. Hard delete follows tenant policy. Reassignment between workspaces changes only the separate scoped association with audit; never transfer tenant ownership. |
| `lead_notes` | `workspace-optional` | A note is tenant-owned through its lead/association and may be attached to a tenant-wide account or workspace-scoped play context. | Active/deleted with author and audit history. Deletion removes content when policy allows; no cross-tenant move. |
| `outreach_events` | `workspace-optional` | Legacy event maps to `outreach_events`/outcomes through the approved draft/play/account and inherits the owning tenant. | Append-only event history; redaction/deletion follows personal-data and retention policy. An event cannot be reassigned to another tenant or rewritten to hide a send/copy action. |
| `admin_requests` | `workspace-optional` | Fulfillment or quote request is tenant-owned through the lead/play and may carry workspace context. | New/seen/in-progress/waiting/done/canceled. Archive with tenant history; delete content under policy. No cross-tenant transfer. |
| `demos` | `workspace-optional` | Published demo is tenant-owned through the compatibility lead/play; its public URL is not a data-sharing grant. | Draft/published/unpublished/revoked. Revoke before tenant/workspace archive. Delete or tombstone on tenant deletion; never attach a slug or demo to another tenant. |
| `place_cache` | `tenant-wide` | Legacy raw provider response cache must be partitioned by tenant, connector policy, query/source context, or replaced by scoped source observations. It cannot become a global private-data cache. | Expire by source retention/TTL; purge on tenant deletion. Cache hits must recheck tenant and policy scope. No transfer or cross-tenant reuse of private observations. |
| `places_master` | `tenant-wide` | Current provider-centric master record is a compatibility account projection, not a universal global account registry. It maps into the tenant's canonical account and source-observation model. | Recomputed from observations; archive when no longer active, retain provenance. Merge is reversible and tenant-local. No cross-tenant canonical merge. |
| `place_observations` | `tenant-wide` | Immutable source observations linked to a tenant-scoped run/unit/account. A Google `place_id` is a source identity, not a global Nova Trade owner identity. | Append-only/versioned and retained by source policy. Delete on tenant deletion; preserve only allowed redacted audit metadata. Never transfer observations between tenants. |
| `api_usage_events` | `tenant-wide` | The migrated usage event is the accounting record for tenant work and is attributed to tenant, workspace, run, connector, and actor/job where applicable. Platform-only health metrics are a separate `platform-global` operational resource, not an unscoped row in this table. | Append-only accounting; retention may aggregate after the raw period. Never merge tenant usage into another tenant's budget or export. |
| `ai_lead_verifications` | `workspace-optional` | Legacy verification becomes an evidence-backed agent artifact through the tenant lead and applicable play/run. | Queued/running/complete/error with immutable input/output provenance. Supersede rather than overwrite; delete tenant content under policy. No model-context or artifact transfer. |
| `ai_usage_events` | `tenant-wide` | AI cost and invocation metadata for tenant work inherits tenant scope, with sensitive prompt/output content separated and redacted. Platform-only model health metrics are a separate platform resource. | Append-only cost/audit history; aggregate or delete content by retention policy. Never use one tenant's usage or context for another. |
| `lead_ai_artifacts` | `workspace-optional` | Legacy business-detail/competitive artifacts map to versioned agent artifacts and claims through the lead/run. | Queued/running/complete/error; superseded versions remain provenance-preserving until retention. Delete on tenant deletion; no cross-tenant reuse. |
| `ai_feedback_events` | `workspace-optional` | Feedback is tenant-owned learning input through the lead/artifact and must preserve actor, artifact, play, and scope. | Append-only; corrections create new feedback. Delete or redact under tenant policy; never train or tune another tenant by default. |
| `worker_runs` | `platform-global` | Current worker health is a platform scheduler envelope. Tenant-specific execution detail belongs to tenant-scoped source/agent runs linked by an immutable lease; a worker health row cannot carry implicit tenant authority. | Running/completed/error/stale/canceled. Platform health retains only non-content operational history; tenant child runs delete with the tenant. No transfer of a leased run. |
| `audit_logs` | `tenant-wide` | The migrated compatibility audit log records tenant actions and includes tenant/workspace, object, before/after or decision, reason, policy version, source/run IDs, and correlation ID. Platform-only audit events use a separate `platform-global` audit resource rather than weakening this row's class. | Append-only. Tenant deletion leaves only minimum non-reconstructive tombstones required by policy; no transfer or content rewriting. |

**Legacy migration rule:** A row without a reliable tenant assignment is migration-blocked for tenant-facing use. It must be assigned to the explicitly approved legacy tenant, quarantined for review, or discarded under an approved deletion decision. It must never be copied to every tenant or treated as platform-global merely because the old schema lacked `tenant_id`.

## 8. Resource ownership matrix: future PRD concepts

The following covers every conceptual family in PRD section 15. The grouped names are conceptual contracts; the implementation may use different table names only if the same ownership and lifecycle guarantees remain testable.

| Future concept family | Scope class | Ownership rule and workspace behavior | Lifecycle, archive, delete, transfer rule |
|---|---|---|---|
| `auth identities`, `auth profiles`, `roles` | `platform-global` | Supabase Auth owns the global authentication identity and identity profile. A profile has no tenant authorization. The global role catalog defines role names and permissions but does not assign a user to a tenant. | Auth/profile disablement is independent of membership revocation; role definitions are versioned. No profile, role definition, or Auth identity is transferred between tenants. |
| `tenants`, `workspaces`, `memberships` | `tenant-wide` | The tenant is the root owner. A workspace references exactly one tenant. A membership binds one global Auth identity to exactly one tenant; a workspace assignment is a separate `workspace-required` binding whose workspace belongs to that membership's tenant. One identity may have many memberships, but no membership crosses tenants. | Tenant/workspace lifecycle above. Membership revoke is immediate and auditable. No tenant/workspace transfer; removing a membership does not delete the global identity or tenant data. |
| `connector_accounts`, `source_policies` | `tenant-wide` | Credentials, authorization, terms acknowledgement, and tenant connector policy belong to one tenant. A policy may restrict a workspace as a target without changing tenant ownership. | Connector can be disabled/revoked; credentials purge under tenant/source retention. No transfer of credentials or authorization. |
| `source_runs` | `workspace-optional` | A source run belongs to one tenant and inherits the explicit scope of its play or tenant-wide request; it may carry one workspace ID or null. | Runs pause/cancel/complete and are archived as immutable history. Delete under tenant retention; no transfer or independent scope change. |
| `source_observations` | `tenant-wide` | Observations belong to one tenant and retain source/run provenance. They may reference a workspace-scoped run, but observation ownership remains tenant-wide. | Append-only/versioned. Purge under tenant/source retention; no cross-tenant citation or transfer. |
| `documents`, `document_versions`, `document_chunks`, `extracted_tables` | Tenant-wide | Uploaded files, authorized URLs, versions, chunks, and extracted tables belong to the tenant knowledge base. A workspace may filter or reference them but does not own the canonical source. | Upload/quarantine/processing/ready/failed/archived/deleted. New versions supersede old versions without rewriting provenance. Delete all derivatives on tenant deletion; no cross-tenant copy or shared retrieval. |
| `evidence_items`, `claims`, `claim_support`, `claim_reviews` | Tenant-wide | Evidence and normalized claims are tenant-owned. Review decisions retain the workspace/run/play context that produced them but cannot change tenant ownership. | Proposed/confirmed/corrected/disputed/rejected/unknown/expired/superseded. Delete content under policy while preserving minimal decision tombstone if required. No transfer or cross-tenant citation. |
| `questions`, `answers`, `business_understanding_versions` | `tenant-wide` | Adaptive questions, answers, and approved understanding use the tenant knowledge base and history. A workspace may request a filtered view, but cannot create a second hidden tenant context. | Draft/asked/answered/skipped/not-applicable/expired; understanding proposed/review/approved/superseded/archived. Supersede versions; delete tenant content together. No cross-tenant learning by default. |
| `question_runs` | `workspace-optional` | A question run belongs to one tenant and may be tenant-wide or attached to one workspace. It inherits the selected understanding context and cannot broaden it. | Queued/running/complete/failed/canceled/archived. Delete with tenant retention; no transfer or independent scope change. |
| `icps`, `icp_versions`, `lead_plays`, `lead_play_versions` | `workspace-optional` | Tenant owns reusable ICPs and plays. Each version explicitly records tenant-wide or one-workspace scope. A workspace-local play may consume tenant-wide knowledge and accounts. | Draft/review/active/paused/superseded/archived. Activation and supersession are audited. A scoped play may be reassigned only within the same tenant if policy allows; immutable versions retain original scope. |
| `accounts`, `account_aliases`, `account_relationships`, `account_observations` | Tenant-wide | One tenant owns its canonical account graph and source history. Branches, parents, subsidiaries, distributors, and legal entities remain distinct until reviewed. | Candidate/active/archived/merged/rejected with reversible merge history. Archive does not delete evidence. Merge/unmerge is tenant-local and audited; no cross-tenant account merge or transfer. |
| `contacts`, `contact_observations`, `contact_permissions`, `suppressions` | Tenant-wide | Person/role records and permitted-use state belong to the tenant. Workspace plays may reference a contact, but do not create a second owner. Suppression is tenant-wide and dominates every play. | Discovered/needs-review/verified/suppressed/opted-out/bounced/deleted/expired. Opt-out/suppression applies immediately across all workspaces. Delete personal content under policy; never transfer contacts or consent. |
| `buying_centers`, `buying_center_roles` | `tenant-wide` | Account buying-center knowledge and tenant-defined role definitions are tenant-owned. Workspace plays may reference them without creating another owner. | Proposed/verified/disputed/expired/archived. Delete with tenant or redact personal data as required. No cross-tenant role sharing. |
| `role_hypotheses` | `workspace-optional` | A role hypothesis belongs to one tenant account and may carry one workspace through the play that produced it. Verified tenant-wide role facts and hypotheses remain distinguishable. | Proposed/verified/disputed/expired/archived. Delete with tenant or redact personal data as required. Reassignment is only within the same tenant and is audited. |
| `qualification_assessments`, `score_snapshots`, `score_factors`, `manual_overrides` | `workspace-optional` | Assessment and score belong to the tenant and a specific play/version; workspace scope is required when the play is workspace-local. Account facts remain tenant-wide. | Proposed/reviewed/approved/superseded/expired. Snapshots are immutable; overrides require reason and audit. Re-score creates a new snapshot. No moving a score to another tenant or silently changing its play scope. |
| `agent_runs`, `agent_steps`, `tool_calls`, `agent_artifacts`, `agent_feedback` | `workspace-optional` | Every execution family belongs to one tenant and inherits the run's nullable workspace scope exactly. Tenant-wide understanding runs use null; workspace-local runs use one workspace. Worker credentials do not define tenant authority. | Queued/running/paused/blocked/complete/failed/canceled/expired. Retry/idempotency preserves one logical run and provenance. Delete tenant content by retention; no run/artifact/context transfer. |
| `review_tasks`, `approvals`, `outreach_drafts`, `outreach_events`, `outcomes` | `workspace-optional` | Human gates and outreach history belong to the tenant, usually to a play and optionally a workspace. Contact suppression and tenant policy override workspace convenience. | Open/assigned/approved/rejected/deferred/completed/canceled; drafts versioned; events/outcomes append-only. Archive with history, delete under policy, and never transfer approvals or outreach events across tenants. |
| `usage_events`, `budgets` | `tenant-wide` | Costs and limits are attributed to one tenant and may include a workspace target restriction. | Usage append-only/aggregated; budgets active/paused/exhausted. Delete tenant content while preserving required accounting tombstones. No budget or usage transfer. |
| `audit_events` | `tenant-wide` | A tenant audit event records tenant actions with effective tenant/workspace scope. Platform-only audit events use the separate platform audit resource. | Append-only. Tenant deletion leaves only required non-reconstructive tombstones. No transfer or content rewriting. |
| `retention_jobs` | `tenant-wide` | A retention job executes only one tenant's policy and carries that tenant's immutable deletion/export scope. Platform scheduler health is not a retention job. | Queued/running/complete/failed/canceled. Delete execution detail with the tenant while preserving required job tombstones. No transfer or scope broadening. |

## 9. Cross-resource consistency rules

The following parent-child rules are mandatory and must be enforced by foreign keys or equivalent application/database checks:

| Parent | Child | Required consistency |
|---|---|---|
| Tenant | Every tenant-owned resource | `child.tenant_id = tenant.id`; tenant state permits the requested action. |
| Workspace | Any workspace-scoped resource | `child.workspace_id = workspace.id` and `child.tenant_id = workspace.tenant_id`; workspace state permits the requested action. |
| Tenant membership | User request | Membership is active for the selected tenant; workspace access is separately checked. |
| Tenant/workspace play | Run, qualification, review, outreach, report | Child inherits immutable tenant and play scope. A child cannot become broader than its parent. |
| Tenant account | Contact, buying center, observation, qualification | Child references the same tenant account; canonical account ownership is never inferred from a provider ID alone. |
| Source run | Observation, usage, agent step | Child keeps source/run/job tenant scope and source policy version. |
| Document/evidence/claim | Understanding, question, ICP, play, draft | Citation must resolve within the same tenant; an absent or unauthorized citation is a validation error, not an unknown tenant fallback. |
| Contact suppression | Every contact-use decision | Suppression, opt-out, deletion, expired permission, or source prohibition blocks use in every workspace and play. |

## 10. Forbidden states and adversarial examples

The following states are invalid and MUST produce a clear authorization or integrity error rather than an empty successful response:

- A workspace row references a different tenant than its parent.
- A request names tenant B while the authenticated member is authorized only for tenant A.
- A workspace selector from tenant B is combined with a tenant A request.
- A tenant-wide account appears twice solely because two workspaces discovered it.
- A Google `place_id`, domain, or email is used as a cross-tenant identity key without a tenant namespace.
- A cache, embedding, retrieval index, prompt, log, or export is keyed only by account ID, document ID, lead ID, or provider ID without tenant scope.
- A worker receives `tenant_id` in a request body that differs from its immutable job lease and continues anyway.
- A platform support user sees private documents or customer lists without an active, reason-coded grant.
- An archived workspace creates a new outreach draft, sends an event, or starts a discovery run.
- A deleted tenant's account, contact, claim, customer list, or model context is copied into another tenant.
- A suppressed or opted-out contact is selected because a workspace or play has a higher score.
- A workspace archive deletes a tenant-wide specialty-chemicals account that another workspace still uses.
- The same industrial supplier is auto-merged across two tenants because both sell epoxy resins to it.
- A legacy `leads` row with no tenant assignment is exposed to a newly onboarded tenant.

## 11. Concrete specialty-chemicals example

Tenant **Apex Materials** sells metalworking-fluid components/packages and epoxy resins. It creates:

- tenant-wide documents containing data sheets, product PDFs, safety/certification statements, customer-provided lists, and authorized website evidence;
- tenant-wide canonical accounts such as a fluid formulator, coatings maker, flooring supplier, pipe manufacturer, adhesive/composites producer, or distributor;
- workspace **North America Industrial** for one commercial team and workspace **EU Distribution** only if the relevant market and contact policy are activated;
- a tenant-wide account record for a distributor that is referenced by both workspaces;
- a workspace-local lead play for metalworking-fluid formulators and another workspace-local play for epoxy flooring/civil-engineering suppliers;
- workspace-scoped discovery runs, qualification assessments, buying-center hypotheses, and outreach drafts for each play;
- tenant-wide contact suppression so an opt-out discovered in one workspace blocks use in the other workspace.

The two plays may score the same canonical account differently because fit, buying trigger, evidence threshold, and buying-center roles are play-specific. They may not create two tenant-owned copies of the account, cite the other workspace's private notes without authorization, or move an account to another tenant. A product claim such as “improves corrosion protection” must resolve to tenant A's direct or corroborated evidence and pass the configured review gate before it can appear in an outreach draft.

## 12. Existing website-lead compatibility play

The current local-business workflow is preserved as a tenant-owned, optional compatibility play with an explicit migration label such as `legacy-website-lead`. It may retain:

- Google Places Text Search as an approved connector where enabled;
- Colorado ZIP codes, markets, and location cells as platform reference coverage;
- website classification values `none`, `social`, `basic`, and `custom`;
- review/rating-based score factors as play-specific signals;
- the existing lead status and copy-only outreach workflow;
- legacy crawl, enrichment, quality, fulfillment, demo, and export behavior while migration is in progress.

The compatibility play MUST be tenant-scoped when used by a tenant. It MUST NOT require every future account to have a website, Google `place_id`, review count, rating, ZIP code, or local-business shape. The migration should map its lead/account projections and source observations into the general contracts above, preserving source IDs and history rather than deleting the old workflow abruptly.

## 13. Activation-only matters

The implementation baseline is **U.S. B2B design partners**, with specialty chemicals as the first benchmark vertical and not a product limitation. Live legal/privacy approval for the selected launch jurisdictions, customer agreements, contact sources, and outreach channels remains pending. That activation approval does not make the implementation baseline unspecified and does not change the ownership model.

The following are intentionally unresolved product or launch-activation choices from PRD section 22. They do not change the ownership model or block local implementation of this contract:

- final legal/privacy activation approval, customer agreements, and exact launch-jurisdiction allowlist around the U.S. B2B baseline;
- exact document languages, OCR scope, and operational limits beyond the approved baseline;
- legally and economically approved connectors beyond tenant materials, authorized websites, ordinary public company websites, and the existing Google Places integration;
- tenant-specific retention shortening, support-access review, and legal-hold process;
- final role-to-action approval matrix from D-002;
- evidence thresholds for regulated, technical, certification, pricing, and safety claims;
- whether a particular workspace represents a brand, region, team, or business unit;
- global versus tenant-tuned account-resolution thresholds;
- future outbound channels and their consent model;
- first live CRM integration and system-of-record choice;
- golden datasets and vertical quality thresholds.

These choices may disable or gate a connector, role, jurisdiction, claim class, workspace workflow, or channel. They MUST NOT cause an implementation to invent a tenant, infer authorization from a selector, make a workspace cross tenants, or treat tenant-wide data as workspace-owned.

## 14. Implementation acceptance criteria

This D-001 contract is accepted when all of the following are true:

1. Tenant and workspace are defined as one client organization and an optional immutable subdivision.
2. The four scope classes are defined and used consistently.
3. Every one of the 23 current repository tables appears in the current-resource matrix with an ownership, lifecycle, deletion, and transfer rule.
4. Every future concept family in PRD section 15 appears in the future-resource matrix with an ownership, lifecycle, deletion, and transfer rule.
5. Tenant and workspace lifecycle states, archive behavior, deletion behavior, and non-transfer rules are explicit.
6. Tenant-switch and request-selector authorization behavior is explicit and fail-closed.
7. Forbidden cross-tenant, cross-workspace, cache, worker, support, suppression, and legacy-data states are explicit.
8. The existing local-website workflow remains represented as a compatibility play without making local websites universal product assumptions.
9. Activation-only questions are recorded without leaving ownership or authorization semantics ambiguous.
10. The Apex Materials specialty-chemicals example demonstrates tenant-wide knowledge, shared canonical accounts, workspace-scoped plays, play-specific scores, and tenant-wide suppression.

## 15. Validation receipt for D-001

The implementation worker must verify this document against the repository, not merely rely on its prose:

- `rg -n -i 'CREATE TABLE IF NOT EXISTS' src/lib/db/schema.ts` identifies the current table inventory.
- `rg -n 'zip_codes|location_markets|location_cells|settings|app_users|user_market_access|crawl_runs|crawl_units|leads|lead_notes|outreach_events|admin_requests|demos|place_cache|places_master|place_observations|api_usage_events|ai_lead_verifications|ai_usage_events|lead_ai_artifacts|ai_feedback_events|worker_runs|audit_logs' docs/architecture/tenant-workspace-contract.md` confirms every current table is covered.
- `rg -n 'tenants|workspaces|memberships|roles|connector_accounts|source_policies|source_runs|source_observations|documents|document_versions|document_chunks|extracted_tables|evidence_items|claims|claim_support|claim_reviews|questions|question_runs|answers|business_understanding_versions|icps|icp_versions|lead_plays|lead_play_versions|accounts|account_aliases|account_relationships|account_observations|contacts|contact_observations|contact_permissions|suppressions|buying_centers|buying_center_roles|role_hypotheses|qualification_assessments|score_snapshots|score_factors|manual_overrides|agent_runs|agent_steps|tool_calls|agent_artifacts|agent_feedback|review_tasks|approvals|outreach_drafts|outreach_events|outcomes|usage_events|budgets|audit_events|retention_jobs' docs/architecture/tenant-workspace-contract.md` confirms PRD section 15 coverage.
- Because this contract is a new untracked file during this task, use `git diff --no-index --check -- NUL docs/architecture/tenant-workspace-contract.md`. Exit `1` is acceptable only when it represents the expected new-file difference and the command emits no trailing-whitespace diagnostics; any diagnostic line is a failure.
- Run an explicit trailing-whitespace check that exits `0` only when no line matches `[ \t]+$`, for example: `$m = Select-String -Path docs/architecture/tenant-workspace-contract.md -Pattern '[ \t]+$'; if ($m) { $m; exit 2 } else { exit 0 }`.

This contract intentionally does not claim that application code, migrations, Postgres policies, or the legacy SQLite path already enforce these rules. Those are later implementation tasks and must supply separate isolation evidence before tenant-facing activation.
