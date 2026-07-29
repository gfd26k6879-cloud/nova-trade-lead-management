# Nova Trade Launch RBAC and Authorization Matrix

**Decision:** D-002 — Approve launch roles and permission matrix

**Status:** Parent-conductor accepted local implementation contract; production activation and jurisdiction-specific approval remain gated.

**Date:** 2026-07-27

**Depends on:** [`tenant-workspace-contract.md`](tenant-workspace-contract.md) (D-001)

**Product intent:** [`product-requirements-multi-tenant-lead-intelligence-platform.md`](../product-requirements-multi-tenant-lead-intelligence-platform.md)

**Implementation authority:** [`implementation-authority.md`](../decisions/implementation-authority.md)

This document defines the launch authorization contract for Nova Trade's move from a single internal `admin`/`researcher` application to a tenant-scoped B2B lead-intelligence and human-approved outreach platform. It is a product and security design artifact. It does not claim legal approval for contact use, outreach, data processing, or any jurisdiction.

The matrix is intentionally fixed at launch. Custom roles and arbitrary permission bundles are deferred. The platform must deny by default, enforce authorization at the server/API/data boundary, and use the UI only as an affordance—not as a security control.

## 1. Decision summary

### 1.1 Launch roles

The tenant roles are:

| Role ID | Display name | Primary responsibility | Role boundary |
|---|---|---|---|
| `owner` | Owner | Owns the tenant, final governance, deletion/export, and emergency policy decisions. | One or more owners may exist only if the tenant policy permits it; the last active owner cannot be removed or demoted. |
| `admin` | Administrator | Runs day-to-day tenant administration, membership, policy, connector, budget, audit, and lifecycle operations. | Cannot bypass tenant policy, human gates, suppression, source terms, or owner protection. |
| `strategist_manager` | Strategist / Manager | Authors and operates business understanding, ICPs, plays, discovery plans, qualification, and research queues. | Cannot grant platform support, export/delete an entire tenant, or bypass approval/separation-of-duty gates. |
| `researcher` | Researcher | Performs approved ingestion, source research, evidence collection, account/contact research, qualification suggestions, and bounded runs. | Cannot approve its own consequential work, manage membership, export/delete tenant data, or send outreach. |
| `reviewer` | Reviewer | Reviews evidence, claims, ICPs, plays, qualification, contacts, and governed decisions. | Review authority is constrained by the review type, tenant policy, conflict-of-interest rule, and required evidence. |
| `outreach_operator` | Outreach Operator | Uses approved account/contact context to prepare, review, copy, and record human-approved outreach outcomes. | Cannot send automatically, use suppressed contacts, approve its own draft, or create unsupported claims. |
| `analyst_read_only` | Analyst / Read-only | Reads permitted tenant/workspace records and reports. | No mutations, approvals, exports, contact-use actions, or operational controls. Sensitive content remains policy-filtered. |

`platform_support` is **not** a tenant role. A Nova Trade support actor can act for a tenant only through a separate, time-bound, reason-coded, audited support grant defined in Section 7. A support grant never creates a normal membership and never grants broad content visibility by implication.

### 1.2 Non-negotiable defaults

1. Every decision begins as deny. A role bundle, tenant policy, object scope, lifecycle state, and human gate must all permit the operation.
2. Authentication identity, identity/profile, tenant membership, role binding, workspace assignment, and temporary support grant are separate records and separate trust decisions.
3. A tenant selector supplied by a browser, API client, job payload, or worker is only a requested selector. It is never proof of access.
4. A workspace is inside exactly one tenant and can narrow scope; it can never broaden tenant access.
5. Disabled, revoked, removed, archived, suspended, or deleted principals cannot create new business side effects. Read/export/delete access, when retained for recovery, is separately and explicitly granted.
6. Agents, workers, service keys, API routes, and database connections do not receive approval authority merely because they can execute work.
7. Owner/admin self-approval is allowed only for a one-person tenant, only when tenant policy allows it, and only with an explicit audited confirmation tied to the exact version/hash and decision. A tenant policy may require a second human even in a one-person tenant.
8. Suppression, opt-out, deletion, policy prohibition, unsupported claims, expired evidence, and source restrictions dominate role permissions.
9. Direct URL, server action, API, worker, export, search, cache, embedding, log, and database access must produce the same authorization decision as the corresponding UI affordance.
10. Existing website-lead behavior remains a compatibility play; old `admin`/`researcher` checks are not the future authorization model.

## 2. Scope, vocabulary, and decision inputs

### 2.1 Scope classes from D-001

| Scope class | Authorization meaning | Examples |
|---|---|---|
| `platform-global` | Product infrastructure or non-private reference data; it is not a tenant grant. | Role definitions, connector type definitions, file-type policy, geography reference data, platform health. |
| `tenant-wide` | Owned by one tenant and visible only to authorized members of that tenant. Workspace selection cannot hide or expand the ownership rule. | Canonical accounts, contacts, source observations, documents, customer lists, tenant policies, memberships, suppressions. |
| `workspace-optional` | Tenant-owned and either tenant-wide or attached to one workspace. `workspace_id = null` means tenant-wide, never “all tenants.” | ICPs, plays, runs, qualification, outreach drafts, outcomes, reports, agent runs. |
| `workspace-required` | Must carry one workspace that belongs to the same tenant. | Workspace membership/assignment and explicitly workspace-local work. |

### 2.2 Principal layers

| Layer | Source/record | Grants | Does not grant |
|---|---|---|---|
| Auth identity | Supabase Auth identity, represented by `auth.users` or its provider-equivalent subject | Proof that a login identity authenticated successfully. | Tenant access, role, workspace access, support access, or permission. |
| Identity/profile | Tenant-independent application profile derived from the auth identity | Display name, email, identity status, login metadata, and platform-level profile state. | Any tenant data access. A legacy `app_users.role` must not remain authoritative. |
| Tenant membership | Tenant-owned membership linking identity/profile to one tenant | Eligibility to request tenant-scoped access while active and in policy. | Access to another tenant, a role, a workspace, or sensitive content by itself. |
| Role binding | Approved fixed launch role on a membership, with optional explicit workspace restriction | The role bundle in the matrix, subject to scope, policy, lifecycle, and separation-of-duty checks. | Cross-tenant access, support access, approval of forbidden/suppressed data, or overriding tenant policy. |
| Workspace assignment | Tenant-owned relationship between membership and an active workspace | Additional narrowing to the assigned workspace for workspace-scoped operations. | Access to another tenant or tenant-wide records that the role cannot read. |
| Support grant | Platform-owned, time-bound grant naming tenant, permitted action set, reason, actor, approver, expiry, and audit ID | Only the listed support actions for the named tenant and time window. | Membership, role administration, default document/customer-list/contact visibility, self-granting, or unlimited browsing. |
| Worker lease | Tenant/workspace-scoped job lease issued by the server | The worker may execute the exact leased job under its immutable scope. | Changing tenant/workspace scope, approving the result, or using caller-supplied scope. |

### 2.3 Effective authorization algorithm

Every server action, API handler, route loader, worker, export, search, retrieval, and delete operation must evaluate this sequence:

1. Authenticate the identity; return `AUTH_REQUIRED` when no valid session exists.
2. Resolve the identity/profile; do not use email, display name, or a client-provided role as authority.
3. Resolve an active membership or an explicit support grant for the requested tenant. A missing, pending, disabled, revoked, or expired membership cannot be upgraded by the request.
4. Resolve the fixed role binding and workspace assignment. Reject a workspace from another tenant, an unassigned workspace, and an invalid scope class.
5. Derive the effective tenant/workspace scope on the server. Treat request selectors as assertions to validate, never as ownership.
6. Load the action's atomic permission and object/resource ownership. Every object must have a resolvable tenant; every non-null workspace must belong to the same tenant.
7. Evaluate lifecycle state, tenant policy, source authorization, data classification, budget, retention, suppression, freshness, approval state, and conflict-of-interest rules.
8. Evaluate separation of duty and human approval for consequential actions. An agent, worker, or service identity fails a human approval check.
9. Execute only after all checks pass. Record an audit event with actor layer, tenant/workspace, permission, object, policy version, decision, reason code, and correlation ID.
10. Return a stable decision/error code. Do not reveal whether a protected object exists when doing so would enable enumeration.

The same evaluator must be used by UI loaders, server actions, route handlers, background workers, exports, search/retrieval, and data-access functions. A hidden button is not an authorization implementation.

## 3. Permission decision semantics

### 3.1 Matrix cell codes

Every role cell in Section 5 is explicit:

| Code | Meaning |
|---|---|
| `A` | Role has the atomic permission when membership, scope, lifecycle, tenant policy, and data-policy checks pass. It is not a bypass of those checks. |
| `C` | Role may request the operation only conditionally: the listed permission exists, but a human gate, separation-of-duty rule, object assignment, approved plan, policy, or explicit confirmation must also pass. A role alone is insufficient. |
| `D` | Denied for the role at launch. No UI, URL, API, worker, or client payload can elevate it. |

`C` is not a soft allow. If its required condition is absent, the result is deny with the relevant stable reason code.

### 3.2 Stable result codes

The authorization service returns a typed decision internally and a stable public error envelope. Internal details may be logged to the tenant-scoped audit stream, but protected-object existence must not leak.

| Code | HTTP/result behavior | Use |
|---|---|---|
| `AUTH_REQUIRED` | `401` for HTTP; unauthenticated result for UI | No valid authenticated identity. |
| `MEMBERSHIP_REQUIRED` | `403`, or `404` for protected-object lookups | No membership or support grant for the selected tenant. |
| `MEMBERSHIP_INACTIVE` | `403` | Membership is pending, disabled, suspended, revoked, removed, or expired. |
| `ROLE_REQUIRED` | `403` | Active membership exists but its fixed role has `D`. |
| `TENANT_SCOPE_REQUIRED` | `400`/`403` | Tenant-owned operation omitted its required effective tenant context. |
| `TENANT_SCOPE_MISMATCH` | `403` | Requested selector, object, parent, lease, cache, or query scope conflicts with the effective tenant. |
| `WORKSPACE_SCOPE_INVALID` | `403` | Workspace is missing when required, belongs to another tenant, is not assigned, or attempts to broaden scope. |
| `SCOPE_LIFECYCLE_BLOCKED` | `403` | Tenant/workspace/object is provisioning, suspended, paused, archived, deletion-pending, or deleted for the requested side effect. |
| `PERMISSION_DENIED` | `403` | Fixed role or support grant does not contain the requested permission. |
| `POLICY_BLOCKED` | `403` | Tenant policy, source authorization, data classification, jurisdiction, feature flag, or provider restriction blocks the operation. |
| `HUMAN_APPROVAL_REQUIRED` | `409`/`403` | Required approved version, reviewer decision, or explicit confirmation is absent. |
| `SEPARATION_OF_DUTY` | `409`/`403` | Actor authored the item they are attempting to approve, or required dual approval is missing. |
| `STALE_APPROVAL` | `409` | Content hash, source policy, contact state, evidence, or version changed after review. |
| `SUPPRESSION_BLOCKED` | `403` | Opt-out, bounce, do-not-contact, deletion, source prohibition, or suppression state wins. |
| `OWNER_GUARD` | `409` | Operation would remove/demote the final active owner or leave the tenant without an owner. |
| `SUPPORT_GRANT_REQUIRED` | `403` | A platform support actor lacks a valid, scoped, unexpired grant. |
| `TENANT_SWITCH_REQUIRED` | `409` | Browser/client context is stale or still references the prior tenant. |
| `RESOURCE_NOT_FOUND_OR_FORBIDDEN` | `404` | Safe response for a protected object that is absent or not visible to the caller. |
| `INVALID_INPUT` | `400` | Permission/action input is malformed, unknown, or not part of the fixed launch vocabulary. |

Audit records must retain the more specific internal reason when safe; response bodies must not expose role names, hidden account existence, private evidence, customer lists, prompts, or contact data to unauthorized callers.

## 4. Role administration and lifecycle rules

### 4.1 Membership and invitation

- Tenant owner/admin may invite a verified identity to a tenant and assign one launch role, subject to tenant policy and invite limits.
- An invite is `pending` until accepted and authenticated; it has no tenant data access.
- A membership becomes `active` only after the identity is verified and the tenant's invitation rules pass.
- Role changes, workspace assignment changes, disablement, revocation, removal, and reactivation are explicit, audited mutations.
- A disabled, revoked, removed, or expired membership must fail closed for new reads and all writes unless a separately authorized retention/export/deletion operation applies.
- Membership state must not be inferred from an old browser session. Every request rechecks membership or a short-lived, revocable authorization context.
- Role changes invalidate or revalidate sessions and clear tenant/workspace client caches before rendering new data.
- A user may have active memberships in multiple tenants. Membership in tenant A never implies membership in tenant B.

### 4.2 Final owner and tenant lifecycle

- A tenant must always have at least one active owner while it is `provisioning`, `active`, or `suspended`.
- The final active owner cannot be removed, disabled, revoked, demoted, or moved out of the tenant without an atomic replacement-owner operation.
- Owner replacement requires an explicit actor, target identity, reason, old/new role, and audit event. A support grant cannot silently replace an owner.
- `archived`, `deletion_pending`, and `deleted` tenant states restrict normal work according to D-001; they do not create a permission bypass.
- Tenant deletion is an owner/admin lifecycle operation only when policy, verification, legal hold, retention, and deletion workflow checks pass. It is not a generic `delete` permission on arbitrary rows.

### 4.3 Workspace inheritance

- Tenant-wide objects remain visible only to tenant members whose role allows the corresponding read; workspace selection does not hide the ownership invariant.
- A workspace-scoped object is visible only when the membership is authorized for that workspace and the action permits that object.
- A workspace assignment narrows access; it never upgrades role permissions.
- A workspace-scoped action with `workspace_id = null` fails when the resource is `workspace-required`.
- A non-null workspace for a tenant-wide-only operation fails rather than being silently ignored.
- Archived or paused workspaces are read-only for historical review, export, reassignment, or deletion workflows as explicitly permitted; they cannot create new runs, contact use, approvals, or outreach side effects.

### 4.4 Tenant switching

On tenant switch, the client must discard prior tenant query results, selected records, drafts, search/retrieval context, optimistic mutations, and workspace selectors. The server must reissue or revalidate an effective context before returning tenant data. A stale call fails with `TENANT_SWITCH_REQUIRED` or `TENANT_SCOPE_MISMATCH`; it must not fall back to the previous tenant or a global singleton.

## 5. Complete launch role-permission matrix

Role columns are `O` owner, `A` admin, `M` strategist/manager, `R` researcher, `V` reviewer, `X` outreach operator, and `N` analyst/read-only. Every cell is one of `A`, `C`, or `D`; conditions are expanded in the gate column and in Section 6.

| Permission ID | Action family | Scope | O | A | M | R | V | X | N | Gate / boundary |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `tenant:read` | Tenant metadata and active-state read | tenant-wide | A | A | A | A | A | A | A | Only non-sensitive tenant metadata permitted by policy. |
| `tenant:manage` | Tenant name, locale, timezone, market, policy configuration | tenant-wide | C | C | D | D | D | D | D | Owner/admin; policy version, audit, and active membership required. |
| `tenant:lifecycle` | Suspend, archive, restore, deletion request/status | tenant-wide | C | C | D | D | D | D | D | Owner/admin; verified workflow, owner guard, retention/legal-hold checks. |
| `workspace:read` | List/read workspace metadata | tenant/workspace | A | A | A | A | A | A | A | Membership and workspace assignment still apply. |
| `workspace:manage` | Create, pause, archive, configure, reassign workspace | workspace-required | C | C | C | D | D | D | D | Owner/admin/manager; same-tenant reassignment, audit, lifecycle checks. |
| `membership:read` | List membership status, role, workspace assignment | tenant-wide | A | A | D | D | D | D | D | Membership directory is restricted administration data. |
| `membership:invite` | Invite a user and propose role/workspace | tenant-wide | C | C | D | D | D | D | D | Invite-only launch; verified identity, policy, limits, and audit. |
| `membership:manage` | Disable, revoke, remove, reactivate membership | tenant-wide | C | C | D | D | D | D | D | Final-owner guard and session invalidation required. |
| `role:assign` | Assign or change fixed launch role | tenant-wide | C | C | D | D | D | D | D | Cannot create custom roles; target identity and reason audited. |
| `support:grant` | Grant/revoke platform-support elevation | tenant-wide | C | C | D | D | D | D | D | Tenant owner/admin may grant only bounded support actions; no self-grant. |
| `knowledge:read` | Read documents, extracted content, claims, citations, customer materials | tenant-wide | A | A | A | A | A | C | C | Data classification, workspace view, source policy, and least-content view apply. |
| `knowledge:upload` | Add tenant materials, URLs, notes, lists, and files | tenant/workspace | A | A | A | C | D | D | D | Type/size/scan/authorization checks; researcher may add only within assignment. |
| `knowledge:manage` | Replace, classify, quarantine, reprocess, or retire material | tenant-wide | C | C | C | C | D | D | D | Source owner, scan state, retention, and immutable-version rules apply. |
| `knowledge:review` | Decide extraction, evidence, conflict, or claim review task | tenant/workspace | C | C | C | D | A | D | D | Reviewer or designated approver; no unsupported claim promotion. |
| `knowledge:export` | Export source materials or derived knowledge | tenant-wide | C | C | D | D | D | D | D | Explicit export policy, audit, redaction, and retention checks. |
| `knowledge:delete` | Delete/quarantine tenant material or derived content | tenant-wide | C | C | D | D | D | D | D | Verified deletion workflow; legal hold and cascade rules. |
| `understanding:read` | Read approved/draft business understanding and uncertainty | tenant/workspace | A | A | A | A | A | C | C | Draft/private notes and restricted claims remain policy-filtered. |
| `understanding:edit` | Edit or propose a business-understanding version | tenant/workspace | C | C | A | C | C | D | D | Versioned edits; researcher/reviewer suggestions remain unapproved. |
| `understanding:approve` | Approve or supersede business understanding | tenant/workspace | C | C | C | D | C | D | D | Human gate, evidence completeness, SoD, and one-person self-approval rule. |
| `question:manage` | Generate, rank, defer, expire, or reopen adaptive questions | tenant/workspace | C | C | A | C | C | D | D | Must be tied to an uncertainty and expected decision impact; no fixed questionnaire. |
| `question:answer` | Answer, correct, defer, or mark unknown/not-applicable | tenant/workspace | A | A | A | A | A | C | D | Answer preserves history and cannot silently confirm a claim. |
| `icp:read` | Read ICP versions, examples, counterexamples, and evidence | tenant/workspace | A | A | A | A | A | C | C | Version and workspace policy apply. |
| `icp:edit` | Draft, edit, clone, or request changes to an ICP | tenant/workspace | C | C | A | C | C | D | D | Draft only until approval; all changes retain version history. |
| `icp:approve` | Approve, reject, or supersede ICP version | tenant/workspace | C | C | C | D | C | D | D | Human reviewer, SoD, evidence/unknown gates, and policy checks. |
| `play:read` | Read play, search hypotheses, rubric, and activation state | tenant/workspace | A | A | A | A | A | C | C | Secrets, restricted connectors, and private notes remain filtered. |
| `play:edit` | Draft, edit, clone, pause-request, or archive-request a play | tenant/workspace | C | C | A | C | C | D | D | Versioned immutable active content; no direct mutable active update. |
| `play:approve` | Approve play definition and high-impact search/qualification policy | tenant/workspace | C | C | C | D | C | D | D | Human gate; source, cost, evidence, and SoD checks. |
| `play:activate` | Activate a reviewed play version | tenant/workspace | C | C | C | D | C | D | D | Approved version, budgets, connector policy, kill switch, and activation audit. |
| `play:archive` | Archive/supersede a play without deleting history | tenant/workspace | C | C | C | D | C | D | D | No deletion of outcomes; active runs must be resolved safely. |
| `connector:read` | Read connector capabilities, policy, health, and authorization state | tenant-wide | A | A | A | C | C | C | D | Secret values never returned; capability visibility is policy-filtered. |
| `connector:manage` | Configure, authorize, disable, rotate reference, or test connector | tenant-wide | C | C | D | D | D | D | D | No secret output; terms, region, budget, and policy approval required. |
| `connector:use` | Request an approved connector for a bounded run | tenant/workspace | C | C | A | C | D | D | D | Connector enabled, source permitted, plan approved, budget available. |
| `source:plan` | Create bounded source/query/discovery plan | workspace-optional | C | C | A | C | C | D | D | Includes source allowlist, terms, query, cost, rate, retention, and stop rules. |
| `source:approve` | Approve discovery plan or source use | workspace-optional | C | C | C | D | C | D | D | Human approval; reviewer/manager cannot approve conflicting author work. |
| `source:execute` | Execute an approved source run | workspace-optional | C | C | A | C | D | D | D | Immutable leased tenant/workspace, approved plan hash, budget, and cancellation. |
| `source:review` | Review observations, source conflicts, freshness, and provenance | tenant-wide | C | C | C | C | A | C | C | Reviewer decisions are versioned and cannot erase raw observations. |
| `account:read` | Read canonical account, aliases, locations, evidence, and play memberships | tenant-wide/workspace | A | A | A | A | A | A | C | Tenant-wide canonical account; workspace relationship filters scoped work. |
| `account:edit` | Correct account facts, aliases, links, qualification context, or notes | tenant-wide/workspace | C | C | A | C | C | C | D | Evidence/citation and field-level audit required. |
| `account:merge` | Merge/unmerge canonical accounts | tenant-wide | C | C | C | D | C | D | D | Same tenant only; reversible provenance-preserving merge; conflicts require review. |
| `account:archive` | Archive account or compatibility candidate view | tenant-wide/workspace | C | C | C | C | C | C | D | Does not erase observations, outreach, outcomes, or suppressions. |
| `contact:read` | Read contact/role hypothesis, provenance, freshness, and permitted-use state | tenant-wide | A | A | A | A | A | A | C | Published business-role data and tenant-provided data only; policy filtering applies. |
| `contact:research` | Research a business contact or role hypothesis | tenant-wide/workspace | C | C | A | C | C | C | D | Approved source, data class, jurisdiction, freshness, and budget checks. |
| `contact:edit` | Correct role, provenance, freshness, suppression, or research notes | tenant-wide | C | C | A | C | C | C | D | Must preserve prior state and evidence; no personal-data enrichment by default. |
| `contact:use` | Mark a contact eligible for a governed outreach draft/export | tenant-wide/workspace | C | C | C | D | C | C | D | Permitted-use, suppression, freshness, channel, jurisdiction, and approval policy. |
| `contact:approve` | Approve contact use or contact-ready state | tenant-wide/workspace | C | C | C | D | C | C | D | Human gate; no self-approval except approved one-person exception. |
| `buying_center:read` | Read buying-center role map and role hypotheses | tenant-wide/workspace | A | A | A | A | A | A | C | Role hypotheses are not verified-person facts. |
| `buying_center:edit` | Add/correct buying-center roles and evidence | tenant-wide/workspace | C | C | A | C | C | C | D | Evidence and uncertainty labels required. |
| `buying_center:approve` | Approve role map for a play/account action | tenant-wide/workspace | C | C | C | D | C | C | D | Human evidence review; no conversion of hypothesis to fact without proof. |
| `qualification:read` | Read fit, intent, evidence, freshness, risks, and decisions | tenant/workspace | A | A | A | A | A | A | C | Play-specific and policy-filtered. |
| `qualification:edit` | Propose or edit qualification factors and disqualifiers | workspace-optional | C | C | A | C | C | C | D | Required reason, evidence, and versioned assessment. |
| `qualification:approve` | Approve qualification decision or hard disqualifier | workspace-optional | C | C | C | D | C | D | D | Human review, evidence threshold, conflict check, and audit. |
| `score:read` | Read factor breakdown, score snapshots, and calibration | tenant/workspace | A | A | A | A | A | A | A | No score is presented as truth; play/version is always shown. |
| `score:recompute` | Recompute scores for an approved play/version | workspace-optional | C | C | A | C | D | D | D | Bounded, idempotent, budgeted, and preserves historical snapshots. |
| `score:override` | Override score/priority with evidence and reason | workspace-optional | C | C | C | D | C | D | D | Human review; override cannot suppress policy or create unsupported claims. |
| `review:read` | Read review queues and proposed decisions | tenant/workspace | A | A | A | A | A | C | C | Assignment and restricted-content policy apply. |
| `review:decide` | Approve, reject, edit, defer, request research, or mark unknown | tenant/workspace | C | C | C | D | A | D | D | Reviewer decision must name object/version, evidence, reason, and conflict status. |
| `audit:read` | Read tenant audit history and decision evidence | tenant-wide | C | C | C | D | C | D | D | Redacted least-content view; support requires a separate grant. |
| `audit:export` | Export audit records | tenant-wide | C | C | D | D | D | D | D | Owner/admin only; immutable export record, redaction, and retention policy. |
| `outreach:read` | Read drafts, approvals, claims, recipient state, and outcomes | tenant/workspace | A | A | A | A | A | A | C | Suppressed/private content remains blocked. |
| `outreach:draft` | Create an outreach draft/package from approved context | workspace-optional | C | C | A | C | D | A | D | Approved play/account/contact, policy claims, citations, and no autonomous send. |
| `outreach:edit` | Edit a draft or follow-up proposal | workspace-optional | C | C | A | C | D | A | D | Revalidation required after changes; unsupported claims blocked. |
| `outreach:approve` | Approve exact draft/recipient/channel for copy/export handoff | workspace-optional | C | C | C | D | C | C | D | Human gate, SoD, suppression, contact policy, exact hash, and tenant policy. |
| `outreach:copy_export` | Copy approved draft or controlled CSV/CRM-style export | workspace-optional | C | C | C | C | C | A | D | Approved exact version, export policy, audit; no transport send. |
| `suppression:read` | Read suppression/opt-out/bounce/do-not-contact state | tenant-wide | A | A | A | C | C | A | D | Minimum necessary contact-state view. |
| `suppression:manage` | Add/remove governed suppression or record opt-out/bounce | tenant-wide | C | C | A | D | C | C | D | Additions are immediate; removal requires evidence and policy authorization. |
| `outcome:write` | Record sent/copy/export/reply/bounce/meeting/won/lost/disqualified outcome | workspace-optional | C | C | A | C | C | A | D | Append-only outcome; actor cannot rewrite history to hide a side effect. |
| `report:read` | Read funnel, evidence, quality, cost, latency, and outcome reports | tenant/workspace | A | A | A | C | C | C | A | Tenant/workspace scope and sensitive-field redaction apply. |
| `report:manage` | Define report views, saved filters, and learning-analysis proposals | tenant/workspace | C | C | A | D | C | D | D | No silent model/play change; proposals remain versioned. |
| `usage:read` | Read tenant usage, budget consumption, retries, and cost attribution | tenant-wide | C | C | C | D | C | D | C | Costs and provider identifiers are least-content and policy-filtered. |
| `budget:manage` | Configure tenant/play/connector budgets and kill switches | tenant-wide/workspace | C | C | C | D | D | D | D | Explicit limits, audit, no bypass of provider/source policy. |
| `queue:read` | Read work queues, leases, retries, and dead letters | tenant/workspace | A | A | A | A | C | C | C | Worker payloads and private content are redacted by policy. |
| `queue:operate` | Retry, cancel, pause, or requeue a tenant-scoped job | tenant/workspace | C | C | A | C | C | D | D | Lease ownership, idempotency, cancellation, and audit checks. |
| `feature:manage` | Enable/disable tenant-scoped capability flags | tenant-wide | C | C | D | D | D | D | D | Cannot replace security policy; prerequisite and rollback checks required. |
| `data:export` | Export tenant data package | tenant-wide | C | C | D | D | D | D | D | Verified request, policy/retention/redaction, audit, and short-lived artifact. |
| `data:delete` | Request or execute tenant/workspace data deletion | tenant/workspace | C | C | D | D | D | D | D | Verified workflow, legal hold, retention cascade, owner guard, and audit. |

No cell is intentionally blank. Any permission not listed is unknown and therefore invalid input/denied, not an implicit permission.

## 6. Human approval and separation-of-duty gates

Role membership only makes an actor eligible. The following gates are mandatory for the corresponding action families:

| Consequential action | Required preconditions | Default approvers | Self-approval |
|---|---|---|---|
| Approve business understanding | Versioned facts, citations, uncertainty list, unresolved high-impact questions, content hash, tenant/workspace scope | Owner, admin, strategist/manager, or reviewer according to policy | Owner/admin only in a one-person tenant with explicit audited confirmation if policy permits. |
| Approve ICP | Evidence-backed segment, exclusions, examples/counterexamples, source and claim policy | Owner, admin, strategist/manager, or reviewer | Same one-person exception. |
| Approve/activate play | ICP version, search hypothesis, source allowlist, budget, stop rules, scoring rubric, review gates, success metrics | Owner, admin, strategist/manager, or reviewer | Same one-person exception; activation still records exact version/hash. |
| Approve discovery/source plan | Connector authorization, permitted source, terms, query/scope, cost/rate/retention, dedupe, cancellation, and plan hash | Owner, admin, strategist/manager, or reviewer | Same one-person exception when tenant policy permits. |
| Approve qualification/score override | Evidence, freshness, factor breakdown, reason, hard disqualifier handling, and play version | Owner, admin, strategist/manager, or reviewer | Same one-person exception for eligible owner/admin only. |
| Approve contact use | Published business-role or tenant-provided provenance, permitted-use state, freshness, jurisdiction/channel policy, suppression check | Owner, admin, strategist/manager, reviewer, or designated outreach operator | Same one-person exception; no contact may be used while suppressed or policy-blocked. |
| Approve outreach draft/export | Exact recipient, channel, content hash, citations, claim review, opt-out language, contact state, frequency/quiet-hour policy | Owner, admin, strategist/manager, reviewer, or outreach operator | Same one-person exception; no automatic send path exists at launch. |
| Grant platform support | Named tenant, support actor, exact actions, reason, start/expiry, data restrictions, approver, audit ID | Tenant owner/admin plus platform support control plane | Never self-grant; support actor cannot approve its own grant. |
| Export/delete tenant data | Verified requester, scope, legal hold/retention, redaction, artifact expiry/cascade, owner protection | Owner/admin according to policy; deletion may require separate platform workflow | Not a normal self-approval path; explicit lifecycle confirmation still required. |

### 6.1 Separation-of-duty algorithm

1. Store the author/creator identity and content hash for every draft, version, plan, assessment, contact-use decision, and outreach package.
2. At approval time, compare the approving identity to the author and any prior approver. A same-actor approval returns `SEPARATION_OF_DUTY` unless the one-person owner/admin exception is active and explicitly confirmed.
3. Re-evaluate all policy, evidence, suppression, contact, source, and lifecycle state at approval time. A changed hash or changed policy returns `STALE_APPROVAL`.
4. Persist the exact approved version, hash, actor, timestamp, reason, policy version, and tenant/workspace scope. Never approve “the current draft” without an immutable identifier.
5. Agents and workers never satisfy a human approval requirement, even when their lease can write a proposed result.

### 6.2 One-person exception

The launch default permits an owner/admin to self-approve a human-gated action only when all of these are true:

- the tenant has exactly one active human membership at decision time;
- the actor is the active owner or admin and is not a platform-support actor;
- tenant policy has not disabled self-approval or required dual approval;
- the UI/API requires an explicit confirmation distinct from the ordinary save/approve button;
- the confirmation records actor, reason, action, object/version ID, content hash, policy version, and timestamp;
- the action is not suppressed, prohibited, unsupported, stale, or under legal hold; and
- the audit event is durable before the side effect proceeds.

If any condition is absent, return `SEPARATION_OF_DUTY` or the more specific policy code. A tenant may require dual approval at any time; that policy change applies on the next authorization decision and invalidates pending approvals as required.

## 7. Platform-support access

Support is a separate trust boundary, not a privileged tenant role.

### 7.1 Grant requirements

A support grant must contain:

- support actor identity and platform role;
- exactly one tenant ID;
- optional workspace ID that belongs to that tenant;
- an explicit allowlist of atomic permissions/actions;
- reason code and human-readable reason;
- approver identity and approval timestamp;
- start time, expiry time, and revocation state;
- data-class restrictions, with documents, customer lists, contacts, prompts, and agent context denied unless individually listed and approved;
- correlation/audit ID; and
- support-session banner/context visible to the operator.

### 7.2 Support restrictions

- A support actor without a valid grant receives `SUPPORT_GRANT_REQUIRED`.
- A grant for tenant A cannot be replayed for tenant B or a different workspace.
- Support cannot grant itself, change its own grant, become a tenant owner, approve its own support work, or use a tenant grant as a cross-tenant search key.
- Support access is read-minimum by default. A grant may permit safe diagnostics, queue inspection, or configuration repair, but not broad content export or contact use by implication.
- Support actions are always audited with the grant ID and are visible to tenant administrators according to policy.
- Expiry or revocation is checked on every action, not only at session start.

## 8. Current-state inventory and compatibility mapping

This section records the current repository as observed while preparing D-002. It is a migration map, not permission to preserve the old authorization shortcuts.

### 8.1 Current roles and shortcuts

The current `src/lib/permissions.ts` defines exactly two roles: `admin` and `researcher`. It defines 19 permission identifiers. `ADMIN_PERMISSIONS` contains all 19. `RESEARCHER_PERMISSIONS` contains six: `view:workspace`, `lead:update`, `lead:assign`, `outreach:create`, `admin_request:create`, and `ai:researcher_tools`.

The current `src/lib/auth.ts` obtains one global `app_users` profile through `ensureAppUserForAuthUser`, rejects inactive users, and returns a session containing `userId`, email, display name, and one global role. `requirePermission` checks only that role. `requireRole` exists but no call site was found in the source inventory. The current `src/lib/lead-access.ts` treats `admin` as unrestricted and constrains researchers to assigned/unassigned and market-access filters. These mechanisms are compatibility behavior only.

| Current permission | Current use/meaning | Current admin | Current researcher | Future permission(s) | Compatibility rule |
|---|---|---:|---:|---|---|
| `view:workspace` | View protected workspace/lead inventory | A | A | `tenant:read`, `workspace:read`, `account:read`, `legacy:lead_read` | Replace role check with active membership, scope, and object permission. |
| `lead:update` | Edit lead facts, notes, status, and related fields | A | A | `account:edit`, `qualification:edit`, `legacy:lead_edit` | Keep website-specific fields inside the compatibility play. |
| `lead:close` | Move a lead to closed outcome | A | D | `qualification:approve`, `outcome:write`, `legacy:lead_edit` | Closed outcomes require play/workspace scope and append-only outcome audit. |
| `lead:exclude` | Exclude/restore/archive candidate lead | A | D | `account:archive`, `qualification:edit`, `legacy:lead_edit` | Preserve reason, evidence, and history; no hidden delete. |
| `lead:apply_ai_usable_website` | Apply AI website viability result | A | D | `knowledge:review`, `qualification:edit`, `legacy:ai_review` | AI output is a proposal until reviewed. |
| `lead:apply_ai_opportunity` | Apply AI website opportunity result | A | D | `qualification:approve`, `legacy:ai_review` | Unsupported or stale claims remain blocked. |
| `lead:assign` | Assign/claim a lead | A | A | `workspace:read`, `queue:operate`, `account:edit`, `legacy:lead_edit` | Assignment must be same tenant and permitted workspace; researcher cannot broaden scope. |
| `lead:admin_assign` | Administrative assignment to another user | A | D | `membership:read`, `workspace:manage`, `account:edit`, `legacy:lead_admin` | Only active same-tenant memberships and audited assignment changes. |
| `outreach:create` | Create template-based outreach package | A | A | `outreach:draft` | Future draft must cite approved knowledge and contact/account evidence. |
| `admin_request:create` | Create fulfillment/admin request | A | A | `review:read`, `outcome:write`, `legacy:fulfillment` | Map to a tenant/workspace review or fulfillment workflow, not a global admin inbox. |
| `admin_request:manage` | Manage fulfillment/admin request status | A | D | `review:decide`, `queue:operate`, `legacy:fulfillment` | Scope by tenant/workspace and preserve history. |
| `demo:create` | Create/publish/revoke demo | A | D | `outreach:copy_export`, `legacy:demo` | Public demo URLs never grant tenant data access; publication remains gated. |
| `ai:verify` | Run/apply AI verification | A | D | `source:execute`, `knowledge:review`, `legacy:ai_review` | Worker lease and review policy replace global role shortcut. |
| `ai:researcher_tools` | Use researcher AI tools/artifacts | A | A | `source:research` represented by `source:plan`, `knowledge:read`, `qualification:edit`, `legacy:ai_research` | Tenant-scoped tools, budgets, provider/data policy, and no approval authority. |
| `crawl:manage` | Start/control/read discovery crawl and dashboard operations | A | D | `source:plan`, `source:approve`, `source:execute`, `queue:operate`, `legacy:crawl_manage` | Google/Colorado assumptions remain only in the compatibility play. |
| `settings:manage` | Mutate global settings/scheduler controls | A | D | `tenant:manage`, `connector:manage`, `budget:manage`, `feature:manage`, `legacy:settings` | Split platform settings, tenant policy, workspace policy, and secret references. |
| `export:csv` | Export current lead inventory | A | D | `data:export`, `outreach:copy_export`, `legacy:csv_export` | Explicit export scope, redaction, retention, audit, and short-lived artifact. |
| `users:manage` | Create/update/remove global app users | A | D | `membership:read`, `membership:invite`, `membership:manage`, `role:assign` | Map to tenant membership; never let a global user row grant tenant access. |
| `scores:recompute` | Recompute all lead scores | A | D | `score:recompute`, `score:override` | Recompute by approved play/version, budget, tenant, workspace, and idempotency. |

Current role/shortcut mapping:

| Current behavior | Future treatment |
|---|---|
| `role === "admin"` grants all current permissions and unrestricted lead access | Replace with owner/admin fixed bundles plus tenant membership, workspace, policy, human-gate, and audit checks. |
| Non-admin lead lists are forced to assigned-to-me/unassigned views | Preserve as a compatibility-play default where appropriate, but use explicit workspace assignment and `account:read`/`queue:operate`. |
| `userCanAccessMarket(userId, marketId)` narrows researcher access | Convert market/geography access to a tenant/workspace policy and source plan constraint. It is not a replacement for tenant isolation. |
| `app_users.role` is a single global role | Migrate identity/profile separately from tenant memberships and role bindings. A profile must grant no tenant access. |
| `requirePermission` and route-level checks are the primary gate | Retain adapter helpers during migration, but every query/data-access/worker/export path must enforce effective tenant scope and the same atomic permission decision. |

### 8.2 Current route/action family inventory

Current protected pages and actions include dashboard, coverage, explore, leads, lead detail, quality, queue, scheduler, statistics, settings, team, users, fulfillment, crawl actions, lead actions, settings actions, user actions, admin-request actions, `/api/explore/map`, `/api/export/csv`, and `/api/health/db-activity`. Current worker endpoints include crawl and AI processing paths. The future permission map must cover each family as follows:

| Current family | Current gate | Future authorization boundary |
|---|---|---|
| Dashboard, coverage, scheduler, crawl actions | `crawl:manage` | `source:plan`, `source:approve`, `source:execute`, `queue:read`, `queue:operate`, `usage:read`; read-only dashboards use `report:read`. |
| Explore/map and leads list/detail | `view:workspace` plus lead access | `workspace:read`, `account:read`, `legacy:lead_read`, object tenant/workspace scope, policy-filtered fields. |
| Lead update/status/assignment/exclusion | `lead:update`, `lead:close`, `lead:assign`, `lead:admin_assign`, `lead:exclude` | `account:edit`, `account:archive`, `qualification:edit`, `qualification:approve`, `outcome:write`, workspace assignment, audit. |
| AI verification and researcher tools | `ai:verify`, `ai:researcher_tools` | `knowledge:read`, `knowledge:review`, `source:execute`, `qualification:edit`, worker lease, provider/data policy, no approval. |
| Outreach package and events | `outreach:create` | `outreach:draft`, `outreach:edit`, `outreach:read`, `contact:use`, `outreach:approve`, `outreach:copy_export`, `outcome:write`; send transport absent. |
| Fulfillment/admin requests | `admin_request:create/manage` | `review:read`, `review:decide`, `queue:operate`, `outcome:write` with tenant/workspace scope. |
| Settings and scheduler controls | `settings:manage` | `tenant:manage`, `connector:manage`, `budget:manage`, `feature:manage`, with secret references never exposed. |
| Users/team | `users:manage`, `view:workspace` | `membership:*`, `role:assign`, `workspace:manage`, final-owner guard, identity/membership separation. |
| Statistics/quality/reporting | `crawl:manage` or view gate | `report:read`, `report:manage`, `score:read`, `review:read`, `audit:read`, tenant/workspace/report scope. |
| CSV export | `export:csv` | `data:export` or `outreach:copy_export`, explicit export purpose, redaction, audit, TTL, and suppression handling. |
| Health and DB activity | `settings:manage` | Platform health is platform-global and tenant-sensitive activity is `usage:read`/`queue:read`; support requires grant. |

### 8.3 Authorization-code inventory receipt

The repository inventory used for this decision was performed with `rg` across `src` for `Permission`, `AppRole`, `ADMIN_PERMISSIONS`, `RESEARCHER_PERMISSIONS`, `requireSession(`, `requireRole(`, `requirePermission(`, `hasPermission(`, and direct role comparisons. The resulting shape is:

| Inventory item | Observed result | D-002 implication |
|---|---|---|
| Current declared permission identifiers | 19 unique IDs | All 19 are listed in Section 8.1 and mapped to future permissions. |
| Current declared app roles | `admin`, `researcher` | These remain migration inputs only; they are not launch role vocabulary. |
| `requirePermission(` matches | 123 source matches including its definition; 122 call sites | Existing route/action gates are broad compatibility gates and must be migrated to atomic, tenant-aware checks. |
| `requireRole(` matches | 1 source match, the helper definition; no call sites | No current route may be assumed to have a role-specific route gate merely because the helper exists. |
| `requireSession(` matches | 3 source matches including its definition; 2 helper calls | Session authentication and active-profile checks are not tenant authorization. |
| `hasPermission(` matches | 24 source/test matches including its definition | Role-set tests prove current behavior only; future tests must include tenant, workspace, policy, lifecycle, and negative cases. |
| Direct role comparisons | Present in lead access, admin-request, user administration, and UI code | Replace authorization meaning with permission/scope evaluation; retain display/compatibility labels only where harmless. |

## 9. Future PRD action-family coverage

The following action families are the complete launch surface derived from the PRD's journeys, FR-1 through FR-10, agent roles, security requirements, and acceptance criteria. New action families must be added to this contract before implementation; an unlisted family is denied.

| PRD family | Read permissions | Mutating/proposal permissions | Approval/administration permissions | Required boundary |
|---|---|---|---|---|
| Identity, session, and tenant context | `tenant:read`, `workspace:read` | none from role alone | membership and role evaluation | Identity/profile is not membership; stale context fails closed. |
| Tenant/workspace lifecycle | `tenant:read`, `workspace:read` | `workspace:manage` | `tenant:manage`, `tenant:lifecycle` | D-001 state machine, owner guard, no cross-tenant transfer. |
| Membership and RBAC | `membership:read` | `membership:invite`, `membership:manage`, `role:assign` | `tenant:manage`, `support:grant` | Fixed roles only; invite-only launch; disabled/revoked fail closed. |
| Documents, URLs, notes, lists, and knowledge | `knowledge:read` | `knowledge:upload`, `knowledge:manage`, `knowledge:delete` | `knowledge:review`, `knowledge:export` | Quarantine/scan, source authorization, citations, classification, retention. |
| Business understanding and adaptive questions | `understanding:read`, `review:read` | `understanding:edit`, `question:manage`, `question:answer` | `understanding:approve`, `review:decide` | No fixed questionnaire; every question has uncertainty and expected impact. |
| ICPs and lead plays | `icp:read`, `play:read` | `icp:edit`, `play:edit`, `play:archive` | `icp:approve`, `play:approve`, `play:activate` | Versioned immutable active content; examples/counterexamples and gates. |
| Connectors and discovery | `connector:read`, `queue:read` | `connector:use`, `source:plan`, `source:execute`, `queue:operate` | `connector:manage`, `source:approve` | Allowlist, terms, cost, rate, source provenance, approved plan hash. |
| Accounts and entity resolution | `account:read`, `source:review` | `account:edit`, `account:archive`, `account:merge` | `review:decide` | Tenant-wide canonical account; reversible, provenance-preserving merge. |
| Contacts and buying centers | `contact:read`, `buying_center:read` | `contact:research`, `contact:edit`, `buying_center:edit` | `contact:approve`, `buying_center:approve` | Role hypotheses separate from people; permitted use/suppression dominates. |
| Qualification and scoring | `qualification:read`, `score:read` | `qualification:edit`, `score:recompute`, `score:override` | `qualification:approve`, `review:decide` | Play-specific, evidence-backed, freshness-aware, historical snapshots. |
| Human review | `review:read` | `queue:operate` for routing only | `review:decide` | Side-by-side evidence, approve/edit/reject/request/defer/unknown. |
| Outreach support | `outreach:read`, `suppression:read` | `outreach:draft`, `outreach:edit`, `outcome:write` | `contact:use`, `contact:approve`, `outreach:approve` | Draft/copy/export only at launch; no automatic transport send. |
| Outcomes and learning | `report:read`, `outreach:read` | `outcome:write`, `report:manage` | `review:decide`, `play:approve`, `understanding:approve` | Proposals are versioned; no silent changes to scoring/questions/plays. |
| Reporting and usage | `report:read`, `usage:read`, `audit:read` | `report:manage` | `audit:export`, `data:export` | Tenant/workspace/play/source dimensions; least-content sensitive fields. |
| Administration and operations | `membership:read`, `connector:read`, `queue:read`, `usage:read` | `workspace:manage`, `queue:operate`, `budget:manage`, `feature:manage` | `tenant:manage`, `tenant:lifecycle`, `connector:manage`, `support:grant` | No security control may be implemented only as a feature flag. |
| Retention, export, deletion | status-specific read | no generic delete | `knowledge:delete`, `data:export`, `data:delete`, `audit:export` | Verified request, legal hold, cascade, artifact TTL, tombstones. |
| Local-website compatibility play | `legacy:lead_read`, `score:read`, `outreach:read` | mapped legacy permissions above | mapped review/approval permissions above | Google Places, Colorado geography, website status, and `place_id` are play-specific. |

## 10. Forbidden states and negative examples

The following must be represented in tests, service contracts, route behavior, and review evidence. Each is a deny outcome even if the caller has a broad role.

1. A user authenticates successfully but has no active membership in the requested tenant.
2. A membership is pending, disabled, revoked, removed, or expired but an old session still presents an active role.
3. A client supplies tenant B's ID while authenticated through tenant A; the server trusts the selector.
4. A workspace ID belongs to tenant B, is not assigned to the membership, or is archived for a new side effect.
5. A tenant-wide object is copied into a workspace and becomes visible to a member who could not read the tenant-wide record.
6. A job payload, cache key, embedding query, retrieval context, or worker secret changes the leased tenant/workspace.
7. A direct URL, server action, API call, export, or route bypasses a hidden UI permission.
8. A researcher calls an admin-only legacy route by changing the URL or request body.
9. A researcher changes `assignedToUserId`, market, workspace, or owner selector to see another member's records.
10. An agent or worker approves its own ICP, play, contact, qualification, or outreach draft.
11. A same actor authors and approves a consequential artifact in a multi-person tenant.
12. A one-person owner/admin self-approves without explicit confirmation, policy allowance, exact hash, reason, and durable audit.
13. Tenant policy requires dual approval but one approval is treated as sufficient.
14. A contact is suppressed, opted out, bounced, deleted, stale, unpermitted, or in an unapproved jurisdiction.
15. A draft contains an unsupported technical, regulatory, safety, performance, price, or personalization claim.
16. A play, source plan, connector, or policy version changed after approval but the old approval is reused.
17. A support actor uses an expired grant, an unlisted action, a different tenant, or a different workspace.
18. A support actor attempts to grant itself access or obtain default document/customer-list/contact visibility.
19. The final active owner is demoted, disabled, removed, or deleted without an atomic replacement owner.
20. A tenant/workspace is suspended, archived, deletion-pending, or deleted but a new discovery, ingestion, contact-use, outreach, or approval side effect proceeds.
21. An export contains another tenant's rows, suppressed contacts, private prompts, secrets, or unredacted evidence.
22. A delete removes primary data but leaves the same tenant material in storage, indexes, caches, queues, derived artifacts, or agent context.
23. A current `admin` shortcut is used to justify cross-tenant access or to bypass a policy gate.
24. A role name or permission identifier unknown to this document is silently treated as admin, researcher, or allow.

## 11. Audit and evidence requirements

Every authorization decision with a mutation, export, approval, support action, sensitive read, or denial that could indicate abuse must be auditable. The minimum event fields are:

- event ID, timestamp, correlation/request ID, actor identity ID, actor layer (`member`, `support`, `worker`, `agent`, `system`), and authentication context;
- tenant ID and optional workspace ID derived by the server;
- membership ID, fixed role, support-grant ID, or worker-lease ID used for the decision;
- atomic permission ID, action family, object type, object ID or privacy-safe reference;
- allow/deny result, stable reason code, policy version, feature/connector version where relevant;
- content/version/hash and evidence references for approvals or consequential decisions;
- source, contact, suppression, and retention state where relevant; and
- safe redaction status, without secrets, raw tokens, or unnecessary customer content.

Audit logs are tenant-scoped for tenant activity. Platform operational logs may be platform-global only when they contain no tenant-private content; otherwise they must carry tenant scope and retention behavior. Audit records are append-only; correcting a decision appends a correction event.

## 12. Implementation contract and cutover rules

1. The future authorization source of truth is the fixed permission vocabulary and role matrix in this document, combined with D-001 scope rules and tenant policy.
2. During migration, compatibility adapters may translate current `admin`/`researcher` checks to future permissions, but they must not create a second semantic policy. The adapter must fail closed when tenant membership or scope is absent.
3. New code must not add a role-name shortcut or unscoped query. It must call the shared authorization evaluator and tenant-scoped data-access layer.
4. The `app_users.role` column may remain as legacy migration input only. It cannot grant access to any new tenant/workspace capability after membership cutover.
5. Current website-lead routes remain available only as the compatibility play until generalized routes pass parity, tenant-isolation, audit, and rollback gates. They cannot become a cross-tenant global inventory.
6. Permission identifiers are stable API/domain vocabulary. Renaming or removing one requires a compatibility mapping, migration, tests, and a documented cutover; unknown identifiers deny.
7. A permission check is necessary but not sufficient. Queries must also constrain tenant/workspace scope at the database/data-access boundary, and Postgres isolation evidence must be demonstrated before activation.
8. SQLite may use test adapters for local compatibility, but Postgres is authoritative for tenant isolation and RLS evidence as specified by the implementation plan.

## 13. Acceptance criteria for D-002

- [x] All seven fixed launch tenant roles are defined; custom roles are explicitly deferred.
- [x] Platform support is separate from tenant membership and is grant-based only.
- [x] Authentication identity/profile, membership, role binding, workspace assignment, support grant, and worker lease are distinguished.
- [x] Every atomic launch permission has an explicit `A`, `C`, or `D` cell for every launch role.
- [x] Tenant-wide, workspace-optional, and workspace-required behavior is explicit and derived from D-001.
- [x] Invite, role change, disabled/revoked membership, tenant switch, workspace inheritance, final owner, and lifecycle rules are explicit.
- [x] ICP, play, source/discovery, qualification, contact-use, buying-center, outreach, export, delete, audit, support, and learning gates are explicit.
- [x] Owner/admin one-person self-approval is bounded by explicit confirmation, policy, exact version/hash, and audit; dual approval can override it.
- [x] Current repository permissions (19), role shortcuts, `requirePermission` usage, `requireRole` availability, and compatibility mappings are inventoried.
- [x] Future PRD action families and current route/action families have named permission boundaries.
- [x] Deny-by-default, stable decision/error semantics, forbidden states, and negative examples are documented.
- [x] Direct UI/URL/API/server-action/worker/data-access authorization equivalence is required.
- [x] No legal approval, provider approval, production migration, or implementation completion is fabricated by this artifact.

## 14. Questions resolved for implementation; decisions still external

The implementation can proceed against the following defaults without rediscovery: fixed roles; no custom roles; invite-only membership; tenant as the client organization; optional immutable-tenant workspaces; Postgres as the authority for new isolation evidence; copy/export-only outreach; suppressed contacts always blocked; and support grants separate from memberships.

The following are not silently decided by this document and must remain policy inputs or capability gates: jurisdiction-specific contact law, lawful basis, provider terms, retention variants, SSO implementation, exact support control-plane ownership, external CRM authority, and any future autonomous send transport. Until their evidence exists, the affected capability remains disabled or draft-only; it does not block unrelated tenant-safe work.
