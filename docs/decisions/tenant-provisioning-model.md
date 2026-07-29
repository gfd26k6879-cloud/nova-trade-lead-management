# D-003 Tenant Provisioning Model

**Decision:** D-003 — Approve tenant provisioning model
**Status:** Parent-conductor accepted local implementation contract; production email, self-service, billing, SSO, transfer, and customer enrollment remain gated.
**Date:** 2026-07-27
**Decision owner:** Repository/product owner
**Dependencies:** D-001 tenant/workspace contract; D-002 launch RBAC and authorization matrix
**Product source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
**Implementation authority:** `docs/decisions/implementation-authority.md`

This is a product, security, and data-lifecycle decision. It does not authorize a production migration, a production email provider, customer enrollment, billing, SSO, account transfer, external communication, or outreach.

## 1. Decision summary

Nova Trade will launch with **invite-only, operator-controlled tenant provisioning**.

- An authorized Nova Trade platform operator creates a pending tenant from an operator-reviewed provisioning request.
- The operator nominates one initial owner identity. The initial owner receives a tenant-bound invitation and must authenticate with the invited identity, verify that identity through the configured Auth flow, and explicitly accept the invitation.
- The server creates and activates tenant membership and the owner role only after the acceptance transaction durably establishes every required invariant.
- A tenant becomes `active` only after the initial owner membership, owner role binding, baseline policy, initial workspace state, and audit record are durable.
- Tenant self-service signup, billing-led provisioning, organization transfer, SSO, and a production email provider are deferred. They are not required for the invite-only local implementation.
- No browser-supplied tenant ID, workspace ID, role, email, or “owner” flag grants authority. The server resolves all authority from authenticated identity, invitation, membership, role binding, tenant state, and policy.

The rejected alternative is unrestricted tenant self-service. It is deferred because it would add an unowned organization-creation path, abuse and verification controls, billing/account-transfer decisions, and support obligations that are not needed to validate the tenant-safe product foundation.

## 2. Scope and normative rules

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

This decision applies to creating and operating a tenant, its initial workspace, its first owner, and the provisioning records that make those resources usable. It also defines how provisioning interacts with suspension, recovery, archival, deletion handoff, tenant switching, and the existing local-website compatibility workflow.

The model inherits these accepted boundaries:

1. A tenant is one client organization. It is immutable and cannot be transferred to another tenant.
2. A workspace is an optional subdivision inside exactly one tenant. The first workspace MAY be created as a default workspace, but a tenant may remain tenant-wide without one.
3. Tenant-owned records always carry tenant scope. A workspace selector is a narrowing selector, not proof of access.
4. The launch roles are the fixed D-002 roles. The initial membership role is `owner`; custom roles are not created by provisioning.
5. The final active owner cannot be removed, disabled, revoked, or demoted without an atomic replacement-owner operation.
6. Suspended, archived, deletion-pending, and deleted tenants cannot create ordinary new business side effects.
7. Invite delivery and identity verification are separate from durable tenant authorization. A delivered message does not create membership; a verified identity does not by itself create tenant access.

## 3. Actors and authority separation

| Actor | Allowed provisioning responsibility | Explicitly not trusted for |
|---|---|---|
| Platform operator | Review an intake request, create or resume a pending tenant, choose an initial owner identity, select the approved baseline policy, and inspect privacy-safe provisioning status. | Automatically becoming a tenant member, bypassing owner acceptance, granting itself tenant content access, or approving a production capability. |
| Nominated initial owner | Authenticate as the invited identity, complete required identity verification, inspect the invitation summary, accept the tenant invitation, and then perform owner actions allowed by D-002. | Choosing a different tenant, changing the invite target, becoming owner of an unrelated tenant, or activating a tenant before the server commits the acceptance transaction. |
| Existing tenant owner/admin | Invite additional members after activation using D-002 membership permissions. | Creating a new tenant, bypassing operator provisioning, or changing final-owner protections. |
| Platform support actor | Assist under a separate, time-bound, reason-coded support grant naming one tenant and exact actions. | Receiving default tenant membership, self-granting access, accepting an owner invitation for someone else, or seeing private content without an explicit grant. |
| Supabase Auth / identity provider | Authenticate the identity and provide the verified subject used by the server. | Assigning tenant membership, role, workspace scope, or business-data permission. |
| Invite delivery adapter | Deliver or expose an invitation through an approved adapter. The local adapter may expose a synthetic inbox/link fixture. | Authorizing a user, changing tenant state, or proving that the recipient is the intended owner. |
| Worker/agent/system job | Retry bounded provisioning work under an immutable server-issued lease and record outcomes. | Creating an owner, approving itself, changing tenant scope, or treating a caller-supplied tenant/role as authority. |

The invitation identifies an expected identity using a provider-supported subject when available and a normalized invite address only as a delivery/routing value. Email address, organization name, domain, and browser parameters are not authorization by themselves.

## 4. Launch state machine

### 4.1 Canonical workflow states

The provisioning workflow has one deterministic state machine. The `tenant_state` column follows D-001; `workflow_state` records the exact provisioning step. A tenant is not considered active merely because the tenant row exists.

| Workflow state | Tenant state | Meaning | Allowed next states |
|---|---|---|---|
| `request_received` | none | A request exists with an opaque request ID, requester/owner information, requested organization label, and requested policy inputs. No tenant exists yet. | `operator_approved`, `request_rejected`, `request_expired` |
| `operator_approved` | none | An authorized platform operator accepted the request for invite-only provisioning and selected the initial owner identity. | `provisioning`, `request_rejected` |
| `provisioning` | `provisioning` | The server has created the pending tenant shell and baseline resources, or is retrying a bounded initialization operation. Normal tenant work is blocked. | `owner_verification_pending`, `provisioning` for an idempotent retry, `provisioning_failed` after a terminal failure |
| `owner_verification_pending` | `provisioning` | The owner invitation exists; the nominated identity has not completed the required Auth verification. | `owner_acceptance_pending`, `owner_verification_pending` for an audited invite reissue, `provisioning` for operator recovery |
| `owner_acceptance_pending` | `provisioning` | The invited identity is authenticated and verified, but explicit acceptance has not committed owner membership. | `activation_ready`, `owner_acceptance_pending` for an audited replacement invitation, `provisioning` for operator recovery |
| `activation_ready` | `provisioning` | The acceptance command passed validation and is executing or has staged all required durable invariants. It is not yet active. | `active` only after the activation transaction commits, or `provisioning` on a retryable failure |
| `active` | `active` | The initial owner is active, the owner role is bound, policy baseline and workspace baseline are durable, and ordinary tenant work may begin. | `suspended`, `archived`, `deletion_pending` through their verified workflows |
| `suspended` | `suspended` | New ingestion, discovery, contact use, outreach, approvals, and other ordinary side effects are blocked. Recovery/read/export/remediation are separately authorized. | `active`, `archived`, `deletion_pending` |
| `recovery` | `provisioning`, `suspended`, or `archived` | A bounded operator/admin recovery workflow is executing after a failed initialization, suspension, stale invite, or operational incident. It cannot grant new access by itself. | `provisioning`, `owner_verification_pending`, `active` after all guards pass, `suspended`, `archived`, `deletion_pending` |
| `archived` | `archived` | Tenant history is retained and normal work is read-only or lifecycle-only. | `deletion_pending` |
| `deletion_pending` | `deletion_pending` | A verified deletion handoff is executing or awaiting legal-hold/retention handling. Normal tenant content access is blocked. | `deleted`, `archived` only when the approved deletion workflow permits recovery before irreversible work |
| `deleted` | `deleted` | Tenant content deletion is complete. Only a minimal non-reconstructive tombstone may remain. | none |
| `provisioning_failed` | `provisioning` | A terminal initialization attempt failed its invariant checks. The tenant is not available to users; the operator must retry through the same request or enter recovery. | `provisioning` on an auditable retry, `recovery` |
| `request_rejected` | none | The request was rejected before a tenant was created. A tenant that already exists remains in its non-active lifecycle and must use recovery, archival, or deletion handoff rather than this request-only state. | none |
| `request_expired` | none | A pre-creation request exceeded its expiry window. A new request and operator decision are required; no automatic activation occurs. An invitation expiry for an existing tenant is handled within its non-active provisioning state, not as this request-only state. | none |

The state machine has these invariants:

- `active` is impossible unless one and only one accepted activation transaction has established an active owner membership and active `owner` role binding, unless a previously active tenant has an audited owner replacement that still leaves at least one active owner.
- `provisioning`, `owner_verification_pending`, `owner_acceptance_pending`, `activation_ready`, and `provisioning_failed` permit setup and recovery bookkeeping only. They do not permit document ingestion, discovery, contact use, outreach, or ordinary tenant business work.
- A retry is idempotent. It advances the same logical request and tenant; it never creates a second tenant, workspace, membership, role binding, policy baseline, or activation event. Invite reissue is an audited event that increments the invitation generation inside the existing provisioning state; it is not a separate workflow state.
- Every transition records the actor layer, request ID, tenant ID where one exists, prior state, next state, guard result, reason code, idempotency key, correlation ID, and policy/version context.
- A failed transition does not report the next state or success until the durable state and required audit event are committed.

### 4.2 Transition guards

| Transition | Required guards |
|---|---|
| `request_received -> operator_approved` | Authenticated platform operator; request is not expired/rejected; required owner identity and policy inputs are present; idempotency key is new or matches the same request. |
| `operator_approved -> provisioning` | Server-generated tenant ID; explicit tenant label/slug candidate; baseline policy version; initial workspace choice; initial owner invite intent; all records can be created in one local transaction. |
| `provisioning -> owner_verification_pending` | Tenant shell, policy baseline, initial workspace if selected, pending owner membership, pending owner role binding, invite record, and `provisioning_started` audit event are durable. |
| `owner_verification_pending -> owner_acceptance_pending` | Auth subject is verified by the configured identity flow; the current invitation is unexpired, unrevoked, one-time, and bound to that subject; request tenant selector matches the invitation, not a browser choice. |
| `owner_acceptance_pending -> activation_ready` | Explicit acceptance intent is present; identity, invite, tenant, membership, and expected content/version hashes match; no suspension/revocation/deletion guard is active. |
| `activation_ready -> active` | The activation transaction commits the owner membership, owner binding, initial policy/workspace baseline, activation audit event, and tenant state change together. |
| `active -> suspended` | Authorized owner/admin or platform support workflow; reason code; scope; correlation ID; running jobs are paused/canceled according to their own leases; no new side effect can pass after suspension. |
| `suspended -> recovery` | Authorized owner/admin/support actor; bounded recovery plan; no expired support grant; all repairs are tenant-scoped and audited. |
| `recovery -> provisioning|owner_verification_pending` | Initialization/identity repair is complete but activation still requires the normal invitation and acceptance guards; a durable recovery-complete audit event commits with the repaired state. |
| `recovery -> active` | At least one active owner remains; membership, policy, tenant state, and queued-work guards pass; a durable recovery-complete audit event commits with the state change. |
| `active|suspended|archived -> deletion_pending` | Verified owner/admin deletion workflow, policy and retention checks, legal-hold decision where applicable, owner protection, and an idempotent deletion job handoff. |
| `deletion_pending -> deleted` | All required tenant content, storage, indexes, caches, queues, derived artifacts, and agent context are processed according to policy; only allowed tombstone metadata remains; deletion completion is audited. |

## 5. Provisioning transaction and compensation contract

### 5.1 Initialization transaction

The operator's `provisionTenant` command MUST use one database transaction for the durable tenant foundation. The transaction includes:

1. The `tenants` row in `provisioning` state with a server-generated immutable ID.
2. The selected default workspace row, if the operator selected a workspace; it is also `provisioning` and references the same tenant. A tenant-wide-only tenant may omit it.
3. The tenant policy baseline row, including policy version, locale/timezone defaults, allowed launch scope, retention policy state, source/outreach capability gates, and a disabled-by-default activation posture. The baseline must not claim legal or provider approval.
4. The initial owner membership in `pending` state, linked to one global Auth identity or a pending identity invitation reference. The profile is not a tenant authorization grant.
5. The initial `owner` role binding in `pending` state. No role supplied by the browser is used.
6. A one-time invitation record with tenant ID, membership ID, expected identity binding, expiry, issue count, revocation state, and a non-reversible token reference or provider invitation reference. Raw tokens MUST NOT be stored or logged.
7. A durable audit event such as `tenant.provisioning_started`, containing privacy-safe identifiers, the operator, scope, policy version, and correlation ID.
8. An idempotency record binding the operator command key to the logical provisioning request and tenant ID.

The transaction commits only if all required rows and constraints pass. If any insert, foreign-key check, uniqueness check, state guard, or audit append fails, the transaction rolls back as one unit. The operator receives a retryable, privacy-safe failure and not a tenant ID that appears usable.

Invite delivery is not part of this database transaction. The transaction records an invitation intent; an allowlisted delivery adapter consumes that intent. This prevents an external delivery response from being mistaken for tenant authorization. At launch, the production email adapter is disabled. Local implementation may use a deterministic synthetic inbox or test invitation link.

### 5.2 Owner acceptance transaction

The server's `acceptTenantInvitation` command MUST use one transaction for activation. It must:

1. Lock or otherwise serialize the invitation, membership, tenant, and request records by their server IDs.
2. Validate the invitation is unexpired, unrevoked, unused, and bound to the currently authenticated verified identity.
3. Validate the tenant is still `provisioning`, the membership is `pending`, the role binding is `pending`, and no deletion/suspension guard blocks activation.
4. Re-check the exact invitation version/content hash, tenant ID, membership ID, policy version, and initial workspace relationship.
5. Mark the invitation accepted exactly once.
6. Activate the initial owner membership and `owner` role binding.
7. Mark the initial workspace `active` if one was selected and its baseline is complete; otherwise preserve the tenant-wide-only posture.
8. Mark the tenant `active` and workflow `active`.
9. Append the durable `tenant.provisioned` audit event with actor identity, invitation ID, tenant/workspace scope, policy version, and correlation ID.
10. Mark the idempotency record completed with the committed result.

The client may render “tenant active” only after the transaction commit is confirmed. A browser response, redirect, Auth session, or delivery callback before commit is not proof of activation.

### 5.3 Failure and compensation boundaries

| Failure point | Durable result | Required response and compensation |
|---|---|---|
| Input validation or authorization fails before a transaction | No new tenant or membership | Return a stable privacy-safe error. Do not reveal whether a similar organization or invite exists. |
| Initialization transaction fails before commit | No partial tenant foundation is visible | Roll back the transaction. Retain only an allowed request-level failure/audit record if it contains no reconstructive tenant content. Retry with the same idempotency key. |
| Initialization commits but invite delivery is unavailable | Tenant remains `provisioning` / `owner_verification_pending` | Do not activate or roll back the tenant. Retry the delivery intent, expose only safe status to the operator, and allow an audited reissue after policy checks. |
| Delivery adapter returns success but the recipient is wrong or the token is stale | Tenant remains provisioning; membership remains pending | Revoke the invitation, invalidate the token, record the incident reason, and issue a replacement only to the operator-selected identity. Do not transfer the invitation after delivery. |
| Auth verification succeeds but acceptance transaction fails before commit | Tenant remains provisioning; invite remains unused or acceptance is safely retryable | Return a retryable error; retry the same idempotency key. Never create a second membership or activate based on the Auth event alone. |
| Acceptance transaction commits but the response is lost | Tenant is active exactly once | A retry with the same idempotency key returns the committed result after reauthorization. A new idempotency key cannot repeat activation. |
| Concurrent operator creation or owner acceptance | One serialized transition wins | The losing command re-reads the committed state and returns the same result or a stable stale/conflict code. No duplicate owner, workspace, invitation, or audit side effect is allowed. |
| Post-commit audit delivery to a separate telemetry sink fails | Database audit remains the authority | Keep the tenant state committed only if the durable in-transaction audit row exists; retry non-authoritative telemetry without changing tenant state. |
| Terminal initialization defect | Tenant remains non-active in `provisioning_failed` | Require an operator recovery or rejection action. Do not silently activate, copy data, or delete user-owned work. |

There is no compensation that moves a created tenant into another tenant. If an operator chose the wrong organization label or owner identity, the safe remedy is to suspend/close the pending record through an audited workflow and create a new request; no account transfer is available at launch.

## 6. Invitations and identity verification

### 6.1 Invitation rules

- Every invitation is scoped to exactly one tenant, one pending membership, one proposed role (`owner` for initial provisioning), and one expected identity.
- Invitations are one-time, expire after a configured launch interval, and carry an issue/reissue counter. The exact interval is a policy configuration, not a reason to block local implementation; the default must be finite and documented in the tenant policy.
- Reissue invalidates the prior invitation before creating the replacement. A reissue never changes tenant ID, membership ID, role, or ownership.
- An invitation is not transferable. The server rejects acceptance by an authenticated subject that does not match the expected identity with `INVITE_RECIPIENT_MISMATCH` and does not disclose the expected recipient.
- A verified Auth identity is necessary but insufficient. The server also validates the invitation, tenant lifecycle, membership state, role binding, and exact scope.
- A user who authenticates through a different browser account, uses a forwarded link, or changes an email/role/tenant request parameter cannot change the invite target.
- The invitation UI may display a privacy-safe organization label only if the product owner accepts that label as disclosable to the invited identity. It must not reveal other tenant records or duplicate-organization details.
- Raw invitation tokens, provider secrets, access tokens, and customer data are never placed in logs, audit payloads, URLs retained beyond the one-time exchange, or model context.

### 6.2 Verification and nonacceptance

If the nominated owner does not accept:

1. The tenant remains `provisioning`; it never becomes active due to elapsed time, an Auth signup, or operator impatience.
2. The operator sees an opaque status such as “owner invitation pending/expired,” with delivery and retry metadata but no private recipient disclosure beyond the operator's authorization.
3. The invitation may be reissued only through an authorized operator action, with a reason, new expiry, new token, and audit event. The old token is invalid immediately.
4. After the configured maximum attempts or invitation expiry, the invitation is expired and the existing tenant remains non-active in provisioning until an authorized operator reissues or closes it. A pre-creation request may enter `request_expired`. Reactivation requires a new operator decision; it is not automatic.
5. If the intended owner is unavailable, the operator may nominate a replacement only before acceptance and through a new invitation/membership target. Once active, owner replacement follows D-002 and must preserve the final-owner invariant.

## 7. Duplicate organizations and idempotency

Organization name, domain, email domain, address, Google `place_id`, and other business attributes are **hints**, not a cross-tenant identity registry and not hard uniqueness constraints for tenant creation.

The duplicate policy is:

- A repeated command with the same operator/request idempotency key returns the original logical request/tenant result after authorization. It never creates a second tenant.
- A different request with a similar name/domain may proceed to operator review. It must not receive a “duplicate tenant exists” response based on another tenant's existence.
- Only an authorized platform operator may privately inspect candidate duplicates across the platform. That inspection is audited, bounded, and does not make the matching domain/name a global account identity.
- A possible duplicate is a review outcome, not an automatic merge, transfer, membership grant, or cross-tenant link. The request may be held, rejected, or provisioned as a distinct tenant according to operator decision.
- The system MUST NOT use a tenant's customer list, private documents, contacts, notes, or outcomes to resolve another tenant's provisioning request.
- If a same-request replay supplies a different owner identity, policy, workspace choice, or organization fields, return `PROVISIONING_IDEMPOTENCY_CONFLICT`; do not silently update the original request.
- A concurrency race on the same request is resolved by a server-side unique idempotency constraint and transaction lock, not by browser timing.

This deliberately permits two legitimate tenant records to have the same display name or domain. Tenant identity is the server-generated tenant ID plus its audited lifecycle, not a guessed organization match.

## 8. Abuse, rate limits, and privacy-safe errors

The invite-only model reduces the attack surface but does not remove abuse controls.

### 8.1 Required controls

- Rate-limit provisioning requests, operator retries, invitation sends/reissues, token redemption, failed identity verification, and acceptance attempts by actor, request, tenant, and network/device risk signal where available.
- Apply bounded invite-attempt and reissue limits. A limit returns a generic retry-later status to an unauthorized caller and an audited reason to an authorized operator.
- Require an authenticated platform operator for tenant creation. There is no public “create organization” endpoint at launch.
- Validate input length, Unicode normalization, control characters, URL/domain syntax where supplied, and policy enum values. Reject malformed input before any tenant row is created.
- Keep provisioning queues and delivery intents tenant/request scoped. A worker lease cannot be retargeted through request payload edits.
- Apply kill switches for provisioning and invite delivery independently. Stopping delivery must not accidentally activate tenants or erase pending requests.
- Redact email addresses, tokens, organization-match candidates, and private request notes from general logs. Audit records contain stable privacy-safe references and only the minimum necessary data.

### 8.2 Stable outcomes

Use D-002 result codes where they apply and these provisioning-specific codes for deterministic client behavior:

| Code | Meaning | Privacy behavior |
|---|---|---|
| `PROVISIONING_REQUEST_NOT_FOUND` | The request is absent or not visible to the caller | Use the same safe response for absent and unauthorized requests. |
| `PROVISIONING_IDEMPOTENCY_CONFLICT` | Same key was reused with different material inputs | Reveal only to the authorized request owner/operator. |
| `PROVISIONING_NOT_AUTHORIZED` | Caller is not an authorized platform operator or allowed tenant admin action | Do not reveal tenant/request existence. |
| `PROVISIONING_STATE_BLOCKED` | Current workflow/tenant state cannot accept the requested transition | Show only the minimum state detail allowed to that actor. |
| `INVITE_EXPIRED` | Invitation is expired | Do not reveal whether another invitation exists; route authorized operator to reissue. |
| `INVITE_REVOKED` | Invitation was revoked or superseded | Do not accept or disclose the replacement token. |
| `INVITE_RECIPIENT_MISMATCH` | Authenticated identity does not match the invitation | Generic failure to the wrong recipient; audit the attempt. |
| `OWNER_ACCEPTANCE_REQUIRED` | Identity is verified but explicit acceptance is missing | Show the invited identity only to that identity and authorized operator. |
| `OWNER_GUARD` | An owner operation would leave no active owner | Follow D-002 replacement-owner workflow. |
| `PROVISIONING_RETRYABLE` | A safe local/operational failure may be retried | Never claim activation; retain the same idempotency key. |
| `PROVISIONING_CONFLICT` | Stale version or concurrent transition lost | Re-read by server ID and return the committed state or request retry. |
| `TENANT_STATE_BLOCKED` | Tenant is suspended, archived, deletion-pending, or deleted for the action | Do not turn lifecycle state into a permission bypass. |

Unauthorized callers receive a generic `404`/`403` envelope consistent with `RESOURCE_NOT_FOUND_OR_FORBIDDEN`; they must not learn whether a requested organization, domain, owner, or tenant exists.

## 9. Suspension, recovery, archival, and deletion handoff

### Suspension

Suspension is an explicit audited transition initiated by an authorized owner/admin or a bounded platform-support grant. On suspension:

- New ingestion, discovery, scoring, contact use, approval, outreach drafting/export, and other tenant side effects fail closed with `TENANT_STATE_BLOCKED` or a more specific policy result.
- In-flight workers stop at a safe checkpoint or are canceled using their immutable leases. A retry cannot resume under a different tenant or workspace.
- Existing audit, status, and policy-remediation reads remain available only to authorized actors.
- Export, retention, and deletion workflows remain separately gated; suspension is not a data-access bypass.
- Restoration requires an owner/admin/support recovery workflow, a reason, a fresh policy and membership check, and a durable `recovery_complete` audit event before the tenant returns to `active`.

### Recovery

Recovery handles expired invitations, failed initialization, stale workers, policy repair, and operational suspension. It MUST be idempotent and MUST NOT create a second tenant or infer a new owner. A recovery operation that cannot prove the expected tenant, membership, workspace, role, and policy identities moves the tenant to a safe non-active state and requires operator review.

### Archival and deletion handoff

Archival is read-only/lifecycle-only and retains tenant history. A deletion request requires verified owner/admin authority, policy and retention checks, legal-hold handling where applicable, and an idempotent handoff to the deletion job. Provisioning itself never deletes a tenant to resolve a duplicate.

Deletion must cover tenant-owned primary rows, object storage, indexes, caches, queues, derived artifacts, agent context, and customer-provided materials according to the later retention/deletion decision. Only a minimal non-reconstructive audit tombstone may remain. Deleted tenant IDs and workspace IDs are never reused.

## 10. Tenant switching and final-owner rules

- An identity may have memberships in multiple tenants. Active membership in tenant A does not grant tenant B access.
- On tenant switch, the client discards prior tenant query results, selected rows, drafts, optimistic updates, retrieval context, and workspace selector. The server revalidates the selected active membership before every request.
- A stale request that names the old tenant or workspace fails with `TENANT_SWITCH_REQUIRED` or `TENANT_SCOPE_MISMATCH`; it does not fall back to a global singleton or the prior tenant.
- The initial owner membership is tenant-wide. A workspace assignment is separate and cannot broaden access.
- Before activation there must be one pending owner target; after activation, every tenant in `provisioning`, `active`, or `suspended` state must have at least one active owner.
- Owner replacement is an atomic operation containing the new owner membership/role binding, old-owner change, final-owner guard, and audit event. A support grant cannot silently replace an owner.
- The final active owner cannot be demoted, removed, disabled, revoked, or moved out of the tenant without an atomic replacement. Requests that would violate this rule return `OWNER_GUARD`.

## 11. Audit, observability, and recovery evidence

Every request and transition must be attributable without retaining unnecessary private content. Minimum durable event fields are:

- event ID, timestamp, request/correlation ID, idempotency key reference, actor identity/layer, and authentication context;
- tenant ID and optional workspace ID derived by the server;
- provisioning request ID, invitation ID, membership ID, role-binding ID, and workflow transition;
- previous state, next state, result code, reason code, policy version, input/content hash, and retry count;
- delivery adapter/provider class and attempt status without secret/token values;
- whether the event was durable before the response was returned; and
- safe redaction classification and retention class.

Operational metrics SHOULD include request counts by safe outcome, time in each state, invite delivery latency/failure, verification and acceptance conversion, reissue count, expired invites, duplicate-review outcomes, concurrency conflicts, retry/dead-letter count, suspension/recovery duration, and deletion-handoff completion. Metrics must be tenant-scoped when they contain tenant data; platform aggregates must not include reconstructive content.

The durable database audit event is authoritative. External telemetry is a retryable projection and cannot be used to claim activation, ownership, or deletion completion.

## 12. Current-state repository inventory

The repository currently supports a narrower invite-only internal application. This inventory is factual current state and is not evidence that future tenant isolation already exists.

| Current repository evidence | Provisioning implication |
|---|---|
| `src/lib/auth.ts` obtains the authenticated Supabase Auth user and uses `ensureAppUserForAuthUser`; the current session includes a global application profile and role context. | Authentication/profile must remain separate from future tenant membership. A profile row cannot grant access to a tenant. |
| `src/lib/permissions.ts` currently defines the legacy `admin` and `researcher` roles and the current permission set. | D-002 fixed launch roles and permissions replace these as future tenant authorization. Legacy role values are migration inputs only. |
| Existing application authorization includes market-access behavior and routes/actions for users, team, settings, leads, crawl, queues, exports, AI processing, and admin requests. | Tenant creation must not assume current global user/team behavior is a tenant membership implementation. |
| `src/lib/db/schema.ts` and `docs/DATA_RECOVERY.md` describe the current application tables, including `app_users`, `settings`, `leads`, crawl/AI/CRM/outreach/audit tables. | The current store predates a complete tenant boundary. It is a legacy single-tenant compatibility store until explicit ownership migration and isolation evidence exist. |
| `src/lib/db/index.ts` supports the repository's local SQLite fallback when the Postgres connection is absent; Supabase/Postgres is the authoritative future isolation path. | Local tests may use bounded adapters, but local SQLite behavior must not be presented as Postgres/RLS or production provisioning proof. |
| Current access is invite-oriented and outreach is copy-only; there is no billing-led or self-service organization creation flow. | Invite-only operator provisioning extends the existing direction without inventing a production email or send integration. |

## 13. Migration and compatibility boundary

Provisioning does not backfill or infer ownership. Later migration work must follow this boundary:

1. Create one explicitly approved **legacy compatibility tenant** for the existing local-website lead workflow, with an explicit tenant ID and an audited owner/membership mapping.
2. Label the existing Google Places/Colorado/local-website behavior as a compatibility play such as `legacy-website-lead`. Website status, reviews, ratings, ZIP coverage, and `place_id` remain play-specific.
3. Never infer tenant ownership from a legacy row's email, role, domain, organization name, Google `place_id`, market, or current singleton settings. A row without reliable ownership is migration-blocked and must be assigned to the approved compatibility tenant, quarantined for review, or handled by a later approved retention decision.
4. Do not copy unassigned legacy rows into every tenant. Do not expose them to a newly provisioned tenant merely because it is the first active tenant.
5. Keep global Auth identities/profiles separate from tenant memberships. The legacy `app_users.role` value does not become an active role binding for a new tenant.
6. Keep provisioning records and future tenant tables on the Postgres-authoritative path for isolation evidence. SQLite may receive a bounded local compatibility adapter; full dual-database parity is not implied.
7. Preserve legacy workflow availability during migration, but require tenant scope, D-002 permissions, audit, compatibility-play labeling, parity checks, rollback evidence, and negative isolation tests before tenant-facing activation.

No migration, data backfill, Auth enrollment, remote database action, production email, or customer-data operation is performed by this decision record.

## 14. Concrete examples

### 14.1 Specialty chemicals

**Apex Materials** sells metalworking-fluid component packages and epoxy resins. A Nova Trade operator creates a pending tenant for Apex and nominates its verified commercial owner. The owner accepts the tenant invitation; the tenant becomes active with a default workspace such as `North America Industrial` only after the activation transaction commits.

After activation, Apex may create a second workspace for distribution if policy permits. Its tenant-wide documents include product PDFs, data sheets, safety/certification material, catalogs, authorized websites, notes, and customer lists. Lead plays may target fluid formulators, coatings makers, flooring/civil-engineering suppliers, adhesives/composites manufacturers, pipe manufacturers, and distributors. Those plays and discovery runs may be workspace-scoped, while canonical accounts, documents, contacts, suppressions, and evidence remain tenant-owned. A duplicate distributor name in another tenant does not make the tenants the same organization, and no legacy Google Places record is silently assigned to Apex.

### 14.2 Non-industrial example

**Harbor Ledger** provides compliance-oriented accounting software for regional nonprofit organizations. Its operator-created tenant may start without a workspace or may create `U.S. Nonprofit Sales` as the first workspace. The owner uploads product documentation, implementation notes, pricing guidance, customer-approved case studies, and an authorized customer list. One lead play may target nonprofit finance teams; another may target outsourced accounting firms as channel partners. The platform must ask different questions about reporting standards, deployment model, organization size, and partner economics instead of reusing a chemicals questionnaire. The same invite, owner acceptance, tenant isolation, suppression, audit, suspension, and deletion rules apply.

## 15. Golden scenario and adversarial test table

These scenarios are acceptance fixtures for the provisioning contract. Each result is deterministic and must be represented in focused tests and/or a replayable local fixture before activation claims are made.

| # | Scenario | Expected result |
|---:|---|---|
| 1 | Authorized operator submits a well-formed new request | Request becomes `request_received`; no tenant exists until operator approval. |
| 2 | Unauthenticated caller submits a create-tenant request | `PROVISIONING_NOT_AUTHORIZED`; no existence or duplicate information is disclosed. |
| 3 | Researcher or tenant member calls the platform provisioning endpoint | Denied; tenant membership cannot create a tenant. |
| 4 | Operator approves a request with a malformed owner identity | `INVALID_INPUT`; no tenant, invite, or membership is created. |
| 5 | Operator repeats the same approval with the same idempotency key | Same logical request/tenant result; no duplicate rows or audit side effects. |
| 6 | Same idempotency key is reused with a different owner or policy | `PROVISIONING_IDEMPOTENCY_CONFLICT`; original request remains unchanged. |
| 7 | Two concurrent operators approve the same request | One serialized transition wins; the loser observes the committed state; exactly one tenant foundation exists. |
| 8 | Initialization fails while inserting policy baseline | Entire foundation transaction rolls back; no usable tenant or partial owner membership is visible. |
| 9 | Initialization commits but invite delivery is unavailable | Tenant remains `provisioning` / `owner_verification_pending`; retryable delivery status, never active. |
| 10 | Wrong authenticated identity redeems a forwarded invitation | `INVITE_RECIPIENT_MISMATCH`; token is not consumed and expected recipient is not disclosed. |
| 11 | Correct identity verifies Auth but does not click explicit accept | Tenant remains provisioning; no membership access and no activation. |
| 12 | Correct identity accepts an expired invitation | `INVITE_EXPIRED`; no activation; operator may revoke/reissue under policy. |
| 13 | Operator reissues an invite | Old invite is invalid immediately; exactly one current invite can be accepted; audit records the reissue. |
| 14 | Owner acceptance is submitted twice concurrently | One activation commit; the second idempotent request returns the committed result; no duplicate owner or audit event. |
| 15 | Auth verification succeeds but the activation transaction fails | Tenant remains non-active; same acceptance idempotency key can retry; no Auth event alone grants access. |
| 16 | Organization name/domain matches another tenant | No client-visible duplicate leak; operator may privately review; no automatic merge or transfer. |
| 17 | A duplicate-looking request uses a new idempotency key | It remains a separate operator-reviewed request; name/domain is not a global uniqueness key. |
| 18 | Browser submits another tenant's ID or workspace ID during acceptance | `TENANT_SCOPE_MISMATCH` or `WORKSPACE_SCOPE_INVALID`; invitation-bound server scope wins. |
| 19 | Owner tries to activate a second workspace during initial acceptance without operator authorization | Initial activation follows the recorded baseline only; unauthorized workspace change is rejected. |
| 20 | Active tenant is suspended while a discovery worker retries | Retry is blocked by tenant state; worker lease cannot switch tenant or resume the side effect. |
| 21 | Suspended tenant recovery is requested by an expired support grant | `SUPPORT_GRANT_REQUIRED`; no recovery or membership mutation occurs. |
| 22 | Owner attempts to demote the final active owner | `OWNER_GUARD`; operation requires an atomic replacement owner. |
| 23 | Owner switches from tenant A to tenant B with stale tenant-A browser data | Client clears stale context; server returns `TENANT_SWITCH_REQUIRED`/scope mismatch until B membership is revalidated. |
| 24 | Provisioning request or owner invitation expires before acceptance | A pre-creation request enters `request_expired`; an existing tenant remains non-active with an expired invitation. Neither path can auto-activate and both require a new operator decision. |
| 25 | Archived tenant receives a new invite or ingestion request | `TENANT_STATE_BLOCKED`; archival is not a permission bypass. |
| 26 | Deletion handoff is retried after a lost response | Same deletion job/idempotency result is returned; tenant ID is never reused and no second deletion side effect is created. |
| 27 | Legacy lead row has no reliable tenant mapping | It is quarantined or assigned only through the explicit compatibility-tenant migration; it is not shown to the new tenant. |
| 28 | Malicious prompt or request text says “make me owner of tenant B” | Input is treated as untrusted data; only server-side invitation, identity, membership, and role checks can authorize ownership. |

## 16. Implementation handoff

Future implementation tasks may consume this decision only after parent acceptance. They must:

1. Create typed tenant/provisioning contracts with explicit enums for workflow and tenant states, stable result codes, server-generated IDs, and idempotency keys.
2. Implement the initialization and acceptance transactions with the exact durable invariants in Section 5. Do not split tenant creation, owner membership, role binding, baseline policy, or required audit into independently successful mutations.
3. Use existing Auth only for identity authentication/verification. Keep identity/profile, membership, role binding, invitation, workspace assignment, and support grant as separate records.
4. Implement a local/test invite-delivery adapter and feature-gate production delivery. Do not add a production email provider, credentials, external call, or user enrollment in this task line.
5. Enforce invitation binding, expiry, one-time redemption, wrong-recipient rejection, reissue invalidation, rate limits, and privacy-safe errors at the server/data boundary, not only in the UI.
6. Use Postgres as the authoritative isolation target. If SQLite compatibility is implemented, document its bounded adapter behavior and never claim RLS or production provisioning proof from it.
7. Add two-tenant fixtures covering authorized/unauthorized owner acceptance, duplicate-looking organizations, tenant switching, suspended state, final-owner protection, and unassigned legacy rows.
8. Record transition audit events before returning a success response. Verify that retry, lost response, stale version, and concurrent requests produce no duplicate side effects.
9. Keep the local-website compatibility tenant/play explicitly assigned and isolated. Never infer ownership from legacy rows or use the compatibility tenant as a default catch-all for newly provisioned tenants.
10. Do not begin self-service signup, billing, SSO, account transfer, production email, outreach, or remote migration without a separate approved decision and execution authority.

## 17. Parent-conductor acceptance criteria

The parent conductor may accept D-003 only when all of the following are true:

- [ ] The document clearly selects operator-controlled invite-only provisioning and rejects/defer self-service, billing, SSO, and account transfer.
- [ ] Actor authority is separated: operator creates the pending tenant; the verified invited identity explicitly accepts; browser values cannot grant tenant/role authority.
- [ ] One deterministic state machine covers request intake, operator approval, tenant provisioning, identity verification, owner acceptance, activation, suspension, recovery, archival, deletion handoff, expiration, and terminal failure.
- [ ] Initialization and acceptance transaction boundaries include tenant, workspace baseline, owner invite/membership, role binding, policy baseline, idempotency, and durable audit, with explicit compensation behavior for external delivery and partial failure.
- [ ] Duplicate organization handling is privacy-safe, idempotent, tenant-local where appropriate, and does not create a cross-tenant name/domain registry or automatic merge/transfer.
- [ ] Abuse controls, expiry/reissue, wrong-recipient behavior, owner nonacceptance, concurrent requests, final-owner protection, tenant switching, support grants, audit, and stable privacy-safe errors are explicit.
- [ ] The current repository inventory is accurate and distinguishes existing invite-only/global-role behavior from future tenant membership.
- [ ] The legacy local-website workflow is assigned to an explicit compatibility tenant/play; ownership is never inferred from unmapped legacy rows.
- [ ] Both a specialty-chemicals example and a non-industrial example are included.
- [ ] The golden scenario table contains at least 18 cases, including malformed input, duplicate, stale, concurrency, final-owner, cross-tenant, suspension, recovery, and partial-failure cases.
- [ ] The record contains no incomplete claims, fabricated production/email/legal approval, implementation completion claim, or external side effect.

## 18. Decision status and remaining activation gates

This record is **accepted for local implementation by the parent conductor**. The following remain independently gated and do not block tenant-safe local implementation:

- production email or other invitation delivery provider;
- legal/privacy approval and jurisdiction-specific launch policy;
- billing, self-service signup, SSO, and account transfer;
- customer-data enrollment or migration;
- remote database migration, production deployment, and external communications;
- future outreach channels and any automatic send transport.

No claim in this document should be read as approval for those capabilities.
