# Nova Trade Outreach Launch Boundary and Claim Policy (D-013)

**Decision:** D-013 - Approve the outreach launch boundary and claim policy
**Status:** Parent-conductor accepted as the local implementation contract; external sending and production provider activation remain disabled and require separate governance approval.
**Date:** 2026-07-27
**Dependencies:** Accepted D-001 tenant/workspace contract, D-002 RBAC matrix, D-008 evidence/claim contract, D-010 source allowlist, D-011 account-resolution policy, D-012 contact-use policy, D-018 implementation authority, and the product requirements document.

This is a product, security, privacy, and implementation contract. It does not constitute legal advice, legal approval, provider approval, production approval, permission to use customer data, or permission to send outreach.

## 1. Decision summary

Nova Trade launch outreach is limited to:

1. Preparing a tenant-scoped internal draft from approved, cited business and account evidence.
2. Human review of the exact draft version, recipient snapshot, channel, claims, citations, and policy evaluation.
3. A server-authorized payload release for optional local copy or a controlled export artifact.
4. Manual recording of what an operator reports happened afterward.

There is no launch capability for email, SMS, phone, social, mailbox, CRM-send, or other external transport. Automatic send is explicitly absent at launch. There is no background dispatch, autonomous sequence, automatic follow-up, autonomous approval, provider activation, delivery observation, or claim that copying/exporting caused a message to be sent.

Any request to add a send transport, provider connection, mailbox, social automation, sequence, or automated approval is a separate product, legal, security, and implementation program. It is blocked by this contract.

The launch decision is intentionally conservative:

- Exact approved content, recipient, channel, tenant identity, policy version, and evidence snapshot are the only material that may be copied or exported.
- Every protective change invalidates prior approval and requires transactional revalidation.
- Agents and workers may propose, extract, cite, classify, or block. They never satisfy a human approval gate.
- Unsupported, inferred-only, conflicted, stale, revoked, unresolvable, prohibited, or jurisdictionally unknown high-impact claims fail closed.
- A copy or export event proves only an internal handoff. It does not prove delivery, sending, receipt, or recipient awareness.

## 2. Scope and normative language

`MUST` and `MUST NOT` are binding requirements for the future implementation. `SHOULD` and `SHOULD NOT` are strong defaults that require a recorded decision to deviate. `MAY` is permitted only when all other policy gates pass.

This policy governs:

- internal outreach draft creation and versioning;
- recipient and evidence snapshots;
- claim and citation review;
- human review and approval;
- copy and controlled export handoff;
- manual outcome recording and protective-state updates;
- audit, redaction, retention, and compatibility behavior.

It does not define a send provider, a legal conclusion, a consent model for an unapproved jurisdiction, or a future automated sequence.

## 3. Current repository state versus target contract

### 3.1 Current repository facts

The current application is a local/single-tenant compatibility system. Relevant evidence includes:

- `src/lib/outreach-package.ts` creates a deterministic copy-oriented `OutreachPackage` from a legacy `Lead`, including an opener, value propositions, call to action, and `fullMessage`.
- `src/lib/__tests__/outreach-package.test.ts` verifies the legacy package fields and message assembly.
- `src/app/(protected)/leads/[id]/lead-detail-client.tsx` has browser copy actions for phones, demo links, pitches, artifacts, and the legacy outreach package. The browser clipboard result is local UI evidence only.
- The same lead-detail surface allows an operator to record channels such as `call`, `text`, `email`, `walkin`, and `other`, with manual outcomes and notes. These values are historical compatibility events, not proof of transport or delivery.
- `src/lib/db/schema.ts` currently defines `outreach_events` without the future tenant-scoped draft, recipient-snapshot, citation, approval, handoff, and outcome separation required here.
- Existing administrative request actions include an internal `send to Steve` style fulfillment handoff. This is an internal workflow and is not external outreach transport.
- The current CSV export route and legacy lead data are not evidence that the future contact-use or outreach gates are enforced.
- Existing OpenAI and AI-worker paths are model execution paths, not approval authority and not a send provider.
- Legacy data and caches predate complete tenant isolation. Current behavior must not be presented as production evidence for this contract.

### 3.2 Future target

The future system introduces tenant-scoped, versioned concepts for:

| Concept | Required purpose | Immutable or append-only requirements |
|---|---|---|
| Draft content version | Subject, body, channel, sender identity, opt-out language, and structured claims | Content, normalized representation, and content hash are immutable after version creation. |
| Recipient snapshot | Exact account, contact/role, contact point class, address/value reference, source, jurisdiction, timezone, and permitted-use state used by the draft | Snapshot is immutable; corrections create a new snapshot and invalidate affected approvals. |
| Account/contact evidence snapshot | Account identity, role/buying-center evidence, freshness, account-resolution version, and source observations used for drafting | Snapshot records exact IDs, versions, hashes, and policy state. |
| Citation set | Claim-to-source locators, source versions, hashes, timestamps, freshness, and redaction state | Citation references resolve to immutable source versions or an explicit unavailable state. |
| Policy evaluation | D-002/D-008/D-012 results, rule IDs, effective policy versions, inputs, and hashes | Evaluation is reproducible and replaced by a new evaluation, never edited in place. |
| Review decision | Human review decision, role, reason, exact object/version hashes, and conflicts | Every decision is an immutable event. |
| Approval | Explicit authorization of the exact draft, recipient, channel, policy, and evidence versions | Approval is immutable; a changed input makes it stale rather than silently updating it. |
| Handoff attempt/event | One requested copy or controlled-export attempt against an approved package/version, with request, policy result, release/artifact result, actor, time, and manifest hash | Immutable and append-only; records only what Nova Trade observed. A new attempt gets a new ID, even for the same approved package. |
| Manual outcome | A human- or approved-import-recorded observation such as `sent_manually`, bounced, replied, or meeting | Separate append-only record with occurrence/recording provenance; never fabricated from a handoff attempt. |

## 4. Absolute launch no-send boundary

The following surfaces MUST NOT exist in launch outreach modules, routes, actions, workers, configuration, or dependency wiring:

- SMTP, email API, mailbox, SMS, phone dialer, social-network, LinkedIn, or CRM-send transport;
- background job that dispatches a message or retries a message send;
- automatic sequence, cadence, follow-up, or reply-triggered send;
- provider credentials or send scopes;
- a `send` action that is reachable through a route, server action, worker lease, export, or UI;
- a status transition that treats `copied`, `exported`, `queued`, or `approved` as `sent`;
- a worker, agent, service role, browser automation, or integration that approves or sends on behalf of a human;
- a delivery, open, click, or reply event inferred from a local clipboard, file export, timestamp, or UI toast.

The allowed launch action names are intentionally explicit: `create_draft`, `edit_draft`, `request_review`, `review`, `approve`, `cancel`, `copy_approved`, `export_approved`, and `record_outcome`. `send`, `dispatch`, `deliver`, `sequence`, `auto_follow_up`, and equivalent aliases are not launch actions.

A structural no-send guard must fail if an outreach implementation adds a provider dependency, transport route, transport job, provider credential/scope, automatic transport action, or automatic transport state. It MUST allow the provenance-labeled manual outcome value `sent_manually` as data entered by an authorized operator; that value is not a transport status, route, job, credential, or automatic side effect. Compatibility wording in the existing UI may be retained only where it is explicitly scoped to legacy manual history or internal handoff.

## 5. Actors, authority, and separation of duty

### 5.1 Actor layers

The canonical D-002 actor-layer enum is exactly:

The only permitted values are `member`, `support`, `worker`, `agent`, and `system`.

- `member`: authenticated tenant member with a D-002 fixed role; only this layer can satisfy tenant outreach review and approval, and only an eligible human member may perform launch handoff/outcome actions;
- `support`: separate, time-bound, reason-coded D-002 support grant;
- `worker`: leased background execution under immutable tenant/workspace scope;
- `agent`: bounded model execution proposing or evaluating work;
- `system`: deterministic application components, including policy evaluation and import processing.

`policy_evaluator` is not a sixth actor layer; it is a `system` component. `imported_external_observation` is not an actor layer; it is provenance/source metadata on an event. An imported observation is processed under the importing `member`, `worker`, or `system` actor decision and never becomes approval authority.

Only an eligible `member` actor representing a human tenant member can satisfy the tenant outreach review and approval gate. A `support` actor can diagnose or repair implementation/operational state only within a valid D-002 support grant; support can never review, approve, copy, export, or record a tenant outreach handoff at launch, even if a grant lists a related diagnostic action. `agent`, `worker`, and `system` actors can propose, evaluate, block, or process provenance, but never satisfy a human gate.

### 5.2 D-002 permission requirements

The future service MUST evaluate effective tenant and workspace scope server-side and deny by default. It MUST use the exact D-002 atomic permissions below; an implementer MUST NOT invent a generic outreach bundle. The role matrix still determines whether a role has each permission as `A`, `C`, or `D`, and unknown permissions are denied.

| Operation | Exact D-002 permission requirement | Additional deterministic gates |
|---|---|---|
| Read draft/package, recipient, claims, citations, approval, handoff, or outcome | `outreach:read` | Apply field-level classification, tenant/workspace scope, suppression visibility, and least-content policy; `knowledge:read` and `contact:read` are also required when those private source/contact fields are requested. |
| Create a draft/package | `outreach:draft` plus `contact:use` when a recipient/contact point is attached | Approved account/play context, D-008 claim/citation checks, D-012 contact-use state, and no autonomous send. A draft without a recipient may not be upgraded to handoff eligibility without a new `contact:use` decision. |
| Edit a draft/package version | `outreach:edit` | Creates a new immutable version; re-runs claim, citation, recipient, and policy checks. `contact:use` is required again if recipient/contact fields change. |
| Review/approve exact draft/package | `outreach:approve` | Human-only gate, separation of duty, exact version/hash, D-008/D-012 revalidation, and tenant policy. `review:decide` is additionally required only when the action is also deciding a distinct review-queue task. |
| Request copy or controlled export | `outreach:copy_export` plus current `contact:use` and the D-012 handoff gates | Exact approved version, recipient snapshot, channel, policy evaluation, suppression epoch, planned handoff, timezone, quiet-hour, frequency, redaction, and transactional revalidation. This creates an attempt/event, not a package-state transition and not a send. |
| Record or correct a manual outcome | `outcome:write` | Append-only outcome/correction, exact package/handoff linkage where known, truthful actor/source, and no inference from clipboard/export. |
| Add or mutate protective suppression | `suppression:manage` | Immediate effective-state computation, exact account/contact/point scope, provenance, and invalidation of affected approvals/attempt reuse. |

`knowledge:read`, `contact:read`, `suppression:read`, and any additional field-policy permission remain required for the fields actually requested. `contact:approve` is required when the operation separately approves contact-ready state. `review:read` is required to read a review queue and `review:decide` only for deciding that queue item. `PERMISSION_DENIED`, `SEPARATION_OF_DUTY`, `STALE_APPROVAL`, `SUPPRESSION_BLOCKED`, `TENANT_SCOPE_MISMATCH`, and `WORKSPACE_SCOPE_INVALID` remain the stable denial classes for the corresponding failures.

### 5.3 One-person owner/admin exception

The bounded D-002 exception permits an owner/admin to self-approve only when all conditions hold at the same transaction:

1. Exactly one active human membership exists in the tenant.
2. The actor is the active owner or admin and is not acting through platform support.
3. Tenant policy permits self-approval and does not require dual approval.
4. The UI/API requires a distinct, explicit confirmation, not an ordinary save or submit action.
5. Confirmation records canonical actor layer `member`, actor ID, reason, object/version IDs, content hash, policy version, and timestamp.
6. No suppression, prohibited claim, stale input, unresolved citation, legal hold, jurisdiction failure, or other block exists.
7. The audit event is durable before copy/export can proceed.

If any condition fails, return `SEPARATION_OF_DUTY` or the more specific policy result. This exception never authorizes sending and never allows an agent or worker to impersonate the human.

## 6. Outreach package and snapshot contract

An outreach package is a versioned internal decision object, not a message that has been sent. Every package must include:

```text
tenant_id
workspace_id (nullable only under D-001 workspace-optional rules)
draft_id
draft_version_id
content_hash
recipient_snapshot_id
account_evidence_snapshot_id
citation_set_id
policy_evaluation_id
channel
sender_identity_snapshot
subject
body
required_opt_out_text
planned_handoff_at
recipient_timezone
author_id
created_at
```

The package must also record a normalized claim list. Each claim has a stable span or structured field location, claim class, evidence IDs, citation IDs, status, review state, and whether it is allowed in the selected channel and jurisdiction.

The recipient snapshot must distinguish:

- canonical account ID from account display name;
- verified person identity from a role hypothesis;
- business-role mailbox, named business email, business switchboard, personal email, and personal mobile;
- source namespace, source version, observed/retrieved times, freshness, and permitted-use disposition;
- jurisdiction and recipient timezone evidence;
- D-012 suppression epoch and contact-policy version.

The account/evidence snapshot must preserve D-011 account ID, resolution tier/rule, source observations, parent/branch/legal-entity/distributor relationship, and the exact account-play association. A later merge or unmerge never rewrites an older snapshot.

The system MUST NOT build an approved package from a mutable query result called “the current contact” or “the current draft.” It must name exact immutable IDs and hashes.

## 7. Deterministic outreach state machine

### 7.1 States

Draft package/version lifecycle state is one of:

`draft`, `review_pending`, `review_rejected`, `approved`, `stale`, `canceled`, `superseded`.

Policy evaluation is separate and uses `allowed`, `blocked`, `requires_review`, `stale`, `conflicted`, or `unresolvable`. A package lifecycle state alone never overrides a blocked policy evaluation.

Each copy/export request creates a separate immutable `handoff_attempt` and append-only `handoff_event`. A handoff attempt has its own state: `requested`, `allowed`, `blocked`, `released`, or `artifact_created`. `released` means Nova Trade released the approved payload to the authorized client response; `artifact_created` means Nova Trade created the controlled export artifact. Neither means the browser clipboard changed or an external recipient used the content. An operator may separately record a `copied` manual outcome if they attest to that local observation. Manual outcomes are separate append-only records and never change package lifecycle state.

### 7.2 Allowed transitions

| Current | Event and required preconditions | Next | Actor |
|---|---|---|---|
| none | Valid tenant-scoped draft inputs and policy-evaluable content | `draft` | `member` or `agent` proposal; actor recorded |
| `draft` | New immutable content version is saved; all referenced snapshots are captured | `draft` | `member` or `agent` proposal |
| `draft` | Draft has required fields and requests review | `review_pending` | `member` or `agent` request; no approval |
| `review_pending` | Reviewer rejects with reason and current hashes | `review_rejected` | `member` reviewer |
| `review_rejected` | A new content version is created after rejection | `draft` | Authorized `member` |
| `review_pending` | Evidence/policy/recipient check changes before decision | `stale` | `system` policy evaluation |
| `review_pending` | Authorized human reviews exact package, acknowledges citations/claims, and passes all gates | `approved` | Eligible human `member` only |
| `approved` | Any protected input, claim, citation, recipient, source, account resolution, policy, suppression, or tenant state changes | `stale` | `system` transactional revalidation |
| `approved` | Authorized human cancels before a new handoff attempt | `canceled` | Authorized `member` |
| `draft`, `review_pending`, `review_rejected`, `stale` | Authorized cancellation with reason | `canceled` | Authorized `member` |
| `draft`, `review_pending`, `review_rejected`, `approved`, `stale`, `canceled` | New compatible immutable content/recipient/evidence version replaces this version | `superseded` | `system` version service |

Handoff-attempt transitions are independent of package lifecycle:

| Handoff attempt current | Event and required preconditions | Handoff attempt next | Actor |
|---|---|---|---|
| none | Human `member` with `outreach:copy_export` submits an idempotent copy/export request naming an approved package/version | `requested` | Eligible human `member` |
| `requested` | Transactional scope, permission, evidence, citation, D-012, schedule, redaction, and hash checks pass | `allowed` | `system` policy evaluator |
| `requested` | Any required check fails | `blocked` | `system` policy evaluator |
| `allowed` | Copy response payload is released by Nova Trade to the authorized client request | `released` | `system` server action/service |
| `allowed` | Controlled export artifact is created and access is returned | `artifact_created` | `system` export service |
| `released` or `artifact_created` | Optional operator reports a local copy/use observation | No handoff-state change; create separate manual outcome | Human `member` |

No transition exists from any package or handoff state to `sent`, `delivered`, `opened`, `clicked`, or `replied` as an automatic side effect. Those are manual/imported outcome values entered as observations, not package or handoff states.

### 7.3 Transition invariants

- A transition uses an expected version and expected hash. A mismatch returns `OUTREACH_VERSION_CONFLICT` or `STALE_APPROVAL`; it never uses last-write-wins.
- A retry with the same idempotency key and the same input hash returns the original durable attempt/result and creates no duplicate handoff event or artifact.
- The same idempotency key with a different input hash returns `OUTREACH_IDEMPOTENCY_CONFLICT`.
- Concurrent edits create separate versions or an explicit conflict. One review cannot approve a different version.
- Approval records the exact draft version, recipient snapshot, evidence snapshot, citation set, policy evaluation, actor, timestamp, and hash.
- Protective changes invalidate approval immediately, even when the change is made by another workflow.
- Cancellation does not delete prior versions, reviews, approvals, or audit events.
- An approved package is not an eternal capability token. Every handoff attempt re-reads and re-evaluates the exact package, snapshots, policy, suppression epoch, schedule, and actor permission transactionally.
- An allowed handoff attempt does not consume, mutate, or advance the approved package lifecycle. Multiple bounded attempts may be made while the package remains approved and all gates continue to pass; each attempt has a new immutable ID and idempotency key.
- Copy/export is transactional: re-read, re-evaluate, authorize, create the attempt/event or artifact, and return only what Nova Trade observed in one server-side decision boundary.

## 8. D-012 recipient and contact-use gate

The outreach evaluator MUST call the D-012 operation `outreach_copy_export_handoff` with the exact recipient snapshot. D-012 remains authoritative for contact permitted use. The required order is:

1. Validate schema, required IDs, hashes, tenant/workspace scope, and idempotency input.
2. Resolve actor and D-002 permission; reject agents/workers as human approvers.
3. Verify D-010 source connector, source terms, tenant authorization, and allowed operation.
4. Require known, approved jurisdiction. Unknown, stale, conflicted, missing, or unapproved jurisdiction fails closed.
5. Require known tenant attestation and the explicit lawful-basis/consent interpretation for the channel and jurisdiction. Attestation is not a substitute for legal basis.
6. Apply D-012 suppression precedence. Only `clear` can pass. `hard_bounce`, `deleted_tombstone`, `deletion_pending`, `do_not_contact`, `complaint`, `opt_out`, `source_prohibited`, `conflicted`, `unknown`, and `soft_bounce` block by default.
7. Require a permitted contact point: `business_role_mailbox`, `named_business_email`, or `business_switchboard`. `personal_email` and `personal_mobile` are blocked at launch.
8. Require verified role/person evidence appropriate to the draft. A role hypothesis cannot be treated as a verified person.
9. Verify required freshness: contact/business point within D-012 limits, evidence within the selected claim policy, and no revoked/deleted source.
10. Verify channel authorization, frequency count, planned handoff time, recipient timezone, quiet hours, and policy version.
11. Recheck all inputs in the same transaction immediately before copy/export.

The launch defaults inherited from D-012 are versioned, not legal truth claims: policy `d012_v2026_07_27_02`, 30-day handoff-content freshness, 180-day business-contact staleness, 21:00-08:00 recipient-local quiet hours, maximum three handoffs per contact per day, and ten allowed handoff hours per day. Missing or malformed policy values fail closed.

Any suppression, opt-out, complaint, hard/soft bounce, deletion, source revocation, jurisdiction change, recipient change, account merge/unmerge, channel policy change, or frequency counter update invalidates pending approval. The next copy/export attempt must re-run the full gate.

## 9. D-008 evidence, citation, and claim gate

The D-008 evidence contract is authoritative for evidence grades, claim states, citation resolution, and prompt-injection handling. A claim used in an outreach package must have:

- a claim class and exact text/span;
- a current claim version and status;
- tenant-scoped source/evidence IDs;
- a resolvable citation to an immutable source version and locator;
- source authorization, observed/retrieved time, freshness, parser/model/policy versions where applicable;
- redaction and permitted-display/use state;
- review state and reviewer identity when the claim class requires human review.

The following claim classes are blocked for outreach when unsupported, inferred-only, conflicted, stale, revoked, citation-unresolvable, prohibited by source policy, or otherwise outside the allowed scope:

- product technical specification;
- compatibility or application fit;
- regulatory status, certification, or compliance conclusion;
- safety or hazard conclusion;
- performance, quality, or guaranteed result;
- price, discount, commercial term, capacity, lead time, or supply availability;
- customer identity, relationship, incumbent, or named reference;
- sensitive or fabricated personalization.

Absence is never inferred from silence. “We did not find” requires bounded search scope and is not an outreach claim that a company does not have a product, capability, or relationship.

Prompt instructions inside tenant documents, websites, source responses, contact notes, or model output are untrusted data. They cannot authorize a claim, override a policy, reveal private content, change a recipient, or approve a draft. Prompt injection results in `OUTREACH_CLAIM_BLOCKED` or `OUTREACH_POLICY_BLOCKED` as appropriate.

## 10. Content policy

### 10.1 Allowed low-risk phrasing

Allowed content is factual, conditional, attributable, and useful without pretending certainty. Examples include:

- “I am reaching out because your public company materials describe metalworking-fluid formulation activity.”
- “We would welcome a conversation about whether our metalworking-fluid component packages are relevant to your current formulation work.”
- “If epoxy resin materials are part of your coatings or flooring supply chain, we can share an internal overview for your review.”
- “Would the person responsible for formulation or procurement be the right contact for a short technical conversation?”
- “If this is not relevant, please use the opt-out instruction below and we will record the request.”

Every factual proposition must be supported by the displayed evidence set. Conditional language does not rescue an unsupported factual premise.

### 10.2 Prohibited content

Do not generate or approve:

- guarantees of performance, savings, compatibility, quality, safety, uptime, or commercial results;
- statements that a product is certified, compliant, approved, non-hazardous, or suitable for a regulated use without a direct current citation and required domain review;
- pricing, discounts, availability, capacity, lead-time, inventory, or supply promises without approved current evidence and commercial review;
- “we know you use X,” “we know you are buying Y,” or any claim about a customer’s identity, incumbent, project, intent, revenue, or internal process without direct authorized evidence;
- fabricated personalization based on role guesses, scraped personal information, sensitive traits, or unsupported inferred interests;
- impersonation, deceptive sender identity, false affiliation, fake reply-to, misleading urgency, or hidden advertising identity;
- any claim or source data prohibited by D-008, D-010, D-011, or D-012.

The UI must show a block reason and evidence gap instead of silently softening a prohibited claim into an apparently factual statement.

### 10.3 Specialty-chemicals examples

These examples are synthetic product examples, not real outreach to real recipients.

Allowed draft for a fluid formulator, when the cited tenant material supports the premise:

> Subject: Question about metalworking-fluid component packages
>
> Hello {{verified business contact or role mailbox}},
>
> I am reaching out because your public materials describe metalworking-fluid formulation activity. We work with metalworking-fluid component packages and would like to understand whether a formulation discussion is relevant to your current work. Would the person responsible for formulation or procurement be the right contact for a brief conversation? If this is not relevant, please use the opt-out instruction below.

Blocked draft because it makes unsupported technical and performance claims:

> “Our package is guaranteed to improve tool life, meet every regulatory requirement, and outperform your current formulation.”

Allowed conditional draft for an epoxy-resin channel:

> Subject: Epoxy-resin supply-chain question
>
> Hello {{verified business contact or business-role mailbox}},
>
> Your cited materials indicate activity in coatings and civil-engineering flooring. We would like to learn whether epoxy-resin materials are part of your current supply chain and whether a supplier conversation would be useful. If another team owns procurement or technical evaluation, could you point us to the appropriate business role? If this is not relevant, please use the opt-out instruction below.

Blocked draft for the same account when the evidence only shows a distributor listing:

> “We know you use our epoxy system in pipe manufacturing and can guarantee immediate capacity and certified compliance.”

The same evidence rules apply to formulators, coatings makers, flooring/civil-engineering suppliers, adhesives/composites/pipe manufacturers, and distributors. The vertical examples do not limit the product; an unrelated tenant business uses its own evidence and questions.

### 10.4 Non-industrial examples

Allowed synthetic example for a software company:

> “Your public materials describe a multi-location service team. We would like to learn whether you are evaluating a shared workflow for that team. If the operations owner is different, please direct us to the relevant business role.”

Blocked example:

> “We know your company is about to replace its current software and can guarantee a 40% reduction in operating cost.”

Allowed synthetic example for a commercial training provider:

> “Your published program catalog shows training for field supervisors. Would the person responsible for supervisor enablement be the right role for a short conversation?”

Blocked example:

> “Your employees are struggling with safety compliance, so our certified program will fix the problem.”

## 11. Sender, subject, body, and opt-out requirements

### 11.1 Truthful identity

The package must contain a versioned sender identity snapshot: tenant display name, truthful operator identity or approved business mailbox label, reply/response identity if one is shown, and policy version. It must not imply Nova Trade is the client, imply a relationship that does not exist, or impersonate a person, brand, distributor, regulator, or customer.

The future system must not invent sender addresses, domains, phone numbers, signatures, or legal entity names. Missing identity data blocks draft approval or handoff.

### 11.2 Subject and body

The subject must be non-deceptive, concise, and based on the approved account/play context. The body must:

- identify the truthful sender and relevant business purpose;
- use only approved claims and exact approved content;
- keep conditional or uncertain statements clearly labeled;
- avoid hidden citations, private document text, secrets, or prohibited personal data;
- include the required versioned opt-out/do-not-contact language for the selected channel and jurisdiction;
- avoid pressure, fake urgency, fabricated familiarity, and misleading reply instructions.

The policy engine, not a model, selects the required opt-out language from the versioned channel/jurisdiction policy input. If the required language is unknown, missing, or incompatible with the package, handoff is blocked. This document does not declare any jurisdiction's legal language sufficient.

## 12. Citation display, review UX, and export manifest

### 12.1 Reviewer experience

The review surface must show, for each material claim:

- the exact claim text span or structured field;
- claim class, status, evidence grade, freshness, and conflict state;
- source label, immutable source/document version, locator, observed/retrieved date, and freshness deadline;
- citation resolution state and redaction status;
- counterevidence, unresolved uncertainty, and any D-012 contact restriction;
- policy rule/result code and the version/hash evaluated;
- whether the claim is allowed, conditional, requires domain review, or blocked.

The reviewer must acknowledge the displayed claims/citations and exact recipient before approval. A collapsed citation panel may improve layout, but it cannot hide a required source, conflict, redaction, or block from the reviewer.

### 12.2 Recipient-visible content

Recipients must never receive private tenant documents, hidden citations, internal notes, prompts, source credentials, model traces, customer lists, suppressed contact details, or reviewer-only risk labels. The copy/export payload includes recipient-facing text only, plus a separately controlled internal manifest for the tenant operator.

### 12.3 Controlled export manifest

Every controlled export must include an internal manifest with:

- tenant/workspace ID and export actor;
- draft/version/content hash;
- recipient snapshot ID and a permitted contact-point reference, subject to redaction policy;
- account/evidence/citation/policy version IDs and hashes;
- sender identity and channel;
- approval actor/time/reason and review acknowledgements;
- planned handoff time/timezone and revalidation result;
- handoff event ID, idempotency key, and export expiry;
- explicit statement: `internal handoff only; not proof of send or delivery`.

Exports must use least data, short-lived private artifacts or direct controlled responses, tenant-scoped authorization, formula-injection-safe CSV handling where CSV exists, and deterministic redaction. No export can include another tenant, a hidden private source excerpt, a prohibited personal contact point, a secret, or an unapproved claim.

## 13. Planned handoff time, quiet hours, and frequency

`planned_handoff_at` is the intended time at which an operator will use the copied/exported material. It is not a send schedule and does not create a background job.

At draft review, the system may show a proposed handoff time. At copy/export, the system MUST re-read:

- the planned time;
- recipient timezone evidence and its freshness;
- jurisdiction and channel policy;
- quiet-hour window;
- per-contact/per-account frequency counters;
- prior handoff and protective outcomes;
- current approval/content/recipient/evidence hashes.

If recipient timezone, jurisdiction, channel policy, or frequency state is unknown, conflicted, stale, or malformed, fail closed with `OUTREACH_SCHEDULE_BLOCKED`. The operator may choose a new time only by creating a new policy evaluation or approved handoff decision; editing the time behind an existing approval is not allowed.

The default quiet window is 21:00-08:00 in the recipient's local timezone. The default frequency cap is three handoffs per contact per day and ten allowed handoff hours per day. These are versioned implementation defaults, not a legal conclusion. A suppressed or protective state always dominates a frequency allowance.

## 14. Copy and controlled-export behavior

### 14.1 Copy

`copy_approved` must:

1. Resolve tenant/workspace and human actor authorization.
2. Load the exact approved draft/version and snapshots named by the request.
3. Compare expected content, recipient, evidence, citation, policy, and approval hashes.
4. Run the complete D-012 handoff evaluator and all D-008 claim/citation gates.
5. Create an immutable handoff attempt in `requested` state, then persist either a blocked result or an allowed result.
6. When allowed, release the exact recipient-facing subject/body and authorized internal manifest in the server response, then record `OUTREACH_HANDOFF_PAYLOAD_RELEASED` with actor, time, exact IDs/hashes, and observed result.
7. Return only the approved recipient-facing subject/body and the authorized internal manifest. The package remains `approved`; the handoff attempt is the record that advances to `released`.

The client may attempt to write the released payload to a local clipboard after the server response. Nova Trade cannot prove browser clipboard success. An authorized operator may separately record a manual `copied` observation with truthful provenance. Neither the release event nor that optional observation is a send, delivery, or recipient-use event.

### 14.2 Controlled export

`export_approved` follows the same sequence as copy, then creates a short-lived private export artifact or controlled response. It records `OUTREACH_HANDOFF_ARTIFACT_CREATED`, expiry, manifest hash, and redaction decisions. The package remains `approved`; the handoff attempt advances to `artifact_created`. It does not call an email, CRM, SMS, phone, or social provider.

If copy or export is retried with the same idempotency key and input hash, the original immutable attempt/result is returned. If the payload, recipient, package version, or policy input differs, return `OUTREACH_IDEMPOTENCY_CONFLICT` and require a new key. An allowed attempt does not consume or mutate approval; a later attempt must still pass all current gates.

## 15. Manual outcome taxonomy and provenance

Outcomes are observations entered manually by an authorized `member` or processed from an approved file/event with source provenance. Every outcome records canonical `actor_layer` and actor decision separately from `provenance.source_kind`; `imported_external_observation` is source metadata, not an actor. A `worker` or `system` may process an imported observation under its leased/authorized decision, but it cannot thereby satisfy outreach approval. Outcomes are never inferred from copy, export, approval, browser state, or a model.

Minimum taxonomy:

| Outcome | Meaning | Required provenance |
|---|---|---|
| `copied` | Operator reports they copied the released payload locally | Link to the handoff attempt, actor, observation time, and truthful local-observation note; no external action implied |
| `exported` | Operator reports they used or transferred the created artifact locally | Link to the handoff attempt, actor, observation time, artifact/manifest reference, and truthful note; no recipient use implied |
| `sent_manually` | Operator reports they manually sent or delivered the content outside Nova Trade | Actor, occurrence time, channel, exact draft version, recipient snapshot, and truthful note; no provider confirmation |
| `delivery_unknown` | Operator attempted an action but cannot establish delivery | Actor, occurrence time, channel, and uncertainty reason |
| `bounced` | Operator or approved source reports a classified `hard_bounce` or `soft_bounce` | Source, observed time, channel, recipient point, exact bounce classification, and D-012 protective suppression event |
| `unknown_bounce` | A bounce-like signal exists but cannot be classified as hard or soft | Outcome classification maps to D-012 effective `SuppressionDisposition=unknown` with stable reason `bounce_unclassified`; create a scoped D-012 suppression event with that effective disposition and never clear eligibility |
| `opted_out` | Recipient or authorized source requests no further contact | Exact request source/time, scope, actor, and immediate suppression update |
| `complaint` | Complaint or abuse signal is reported | Source/time, scope, reason, and immediate protective update |
| `replied` | Operator records a response | Source/actor, occurrence time, channel, exact package link, and response classification if provided |
| `meeting_set` | Operator records a meeting | Actor/source, occurrence time, account/contact/play link, and no fabricated attendance |
| `opportunity` | Operator records an opportunity | Actor/source, occurrence time, account/play link, and confidence/notes |
| `won` | Operator records a won result | Actor/source, occurrence time, account/play link, and evidence/notes |
| `lost` | Operator records a lost/disqualified result | Actor/source, occurrence time, reason, and correction path |
| `not_interested` | Operator records a rejection or non-interest | Actor/source, occurrence time, scope, and whether it is also an opt-out |
| `unknown` | Outcome is not known | Actor/source and uncertainty reason |

`sent_manually` means only that an operator reported a manual external action. It is not a provider-confirmed send. `delivered`, `opened`, and `clicked` require an approved, future source and are not produced at launch. A user may correct an outcome only by appending a superseding correction event; the original record remains auditable.

Protective outcomes (`opted_out`, `complaint`, classified `hard_bounce`/`soft_bounce`, or `unknown_bounce`) create an immediate D-012 suppression event at the exact contact-point, contact, account, or tenant scope recorded by the observation. `unknown_bounce` is only an outcome classification: it maps to D-012 effective `SuppressionDisposition=unknown` with reason `bounce_unclassified`; it is not a new D-012 disposition. Deletion requests and do-not-contact requests map to their existing D-012 dispositions. All such events invalidate pending approvals and cached handoff decisions for that scope. A merge or unmerge applies the most restrictive effective disposition and revalidates linked packages.

## 16. Exact domain/API result codes

The service returns a typed envelope containing `operation`, `tenant_id`-scoped object identifiers, `policy_version`, result code, required fields, input hash, idempotency key, and audit/correlation IDs. Protected-object existence must not leak.

### 16.1 Success and lifecycle codes

- `OUTREACH_DRAFT_CREATED`
- `OUTREACH_DRAFT_VERSION_CREATED`
- `OUTREACH_REVIEW_REQUESTED`
- `OUTREACH_REVIEW_RECORDED`
- `OUTREACH_APPROVED`
- `OUTREACH_CANCELED`
- `OUTREACH_HANDOFF_ATTEMPT_REQUESTED`
- `OUTREACH_HANDOFF_ATTEMPT_BLOCKED`
- `OUTREACH_HANDOFF_PAYLOAD_RELEASED`
- `OUTREACH_HANDOFF_ARTIFACT_CREATED`
- `OUTREACH_OUTCOME_RECORDED`
- `OUTREACH_OUTCOME_CORRECTED`
- `OUTREACH_REVALIDATED`

### 16.2 Deterministic block/conflict codes

- `OUTREACH_INVALID_INPUT` - required field, enum, hash, or schema failure.
- `OUTREACH_SCOPE_FAIL` - tenant/workspace/object scope cannot be proven.
- `OUTREACH_PERMISSION_DENIED` - D-002 permission is absent.
- `OUTREACH_SEPARATION_OF_DUTY` - author/approver or required dual approval conflict.
- `OUTREACH_AGENT_APPROVAL_FORBIDDEN` - agent, worker, or evaluator attempted human approval.
- `OUTREACH_VERSION_CONFLICT` - expected version/hash does not match current immutable version.
- `OUTREACH_STALE_APPROVAL` - protected input changed after review/approval.
- `OUTREACH_POLICY_BLOCKED` - policy result is blocking or required policy input is unknown.
- `OUTREACH_RECIPIENT_BLOCKED` - recipient/contact point is not eligible.
- `OUTREACH_SUPPRESSION_BLOCKED` - D-012 protective state dominates.
- `OUTREACH_SOURCE_BLOCKED` - source is disallowed, revoked, or terms are unknown.
- `OUTREACH_JURISDICTION_BLOCKED` - jurisdiction is missing, unknown, stale, or unapproved.
- `OUTREACH_CHANNEL_BLOCKED` - channel is not authorized for the policy context.
- `OUTREACH_PERSONAL_POINT_BLOCKED` - personal email/mobile is not eligible at launch.
- `OUTREACH_CLAIM_BLOCKED` - prohibited or unsupported claim exists.
- `OUTREACH_CITATION_UNRESOLVABLE` - required citation cannot be resolved/redacted safely.
- `OUTREACH_CLAIM_CONFLICTED` - claim has unresolved counterevidence.
- `OUTREACH_CLAIM_STALE` - required evidence freshness has expired.
- `OUTREACH_CLAIM_REVOKED` - source or claim was revoked/deleted.
- `OUTREACH_REVIEW_REQUIRED` - required domain or human review is not complete.
- `OUTREACH_SCHEDULE_BLOCKED` - timezone, quiet-hour, frequency, or planned time is unknown/invalid.
- `OUTREACH_IDEMPOTENCY_CONFLICT` - same key was used with a different input hash.
- `OUTREACH_EXPORT_REDACTED` - export allowed only after deterministic redaction.
- `OUTREACH_EXPORT_BLOCKED` - requested field or export purpose is not allowed.
- `OUTREACH_HANDOFF_NOT_PROOF_OF_SEND` - informational annotation attached to release/artifact results; never a send status.
- `OUTREACH_NOT_FOUND` - object is absent or not visible in the effective scope.

HTTP mapping is deterministic: malformed input is `400`; missing/foreign protected objects are `404` or a non-enumerating equivalent; permission/policy/suppression blocks are `403`; stale/version/idempotency/concurrency conflicts are `409`; allowed handoff/outcome records are `200` or `201` according to the endpoint contract.

The implementation may map D-012 codes such as `HANDOFF_BLOCKED_SUPPRESSED`, `HANDOFF_BLOCKED_LEGAL`, and `HANDOFF_BLOCKED_RATE_OR_QUIET` into the outreach envelope, but it must preserve the underlying D-012 code and policy version.

## 17. Audit, redaction, retention, and export controls

Every draft/version/review/approval/handoff/outcome event must record:

- event ID, tenant/workspace, object IDs, correlation ID, idempotency key, and input hash;
- canonical `actor_layer` (`member`, `support`, `worker`, `agent`, or `system`), actor ID/role, and decision/provenance source;
- `support_grant_id` is populated only for a denied support attempt or an allowed support diagnostic/repair action. It is absent/null on any allowed tenant-member review, approval, handoff, or outcome mutation; a support grant is never authority for those operations.
- action, before/after state, result code, reason, policy versions, and exact content/recipient/evidence hashes;
- source/run/claim/citation IDs and account-resolution version where relevant;
- occurred time, recorded time, planned handoff time, timezone, and client metadata only where policy permits.

Logs and audit views must redact secrets, credentials, prompt bodies, unnecessary personal data, personal contact points outside authorized views, full customer lists, and private document excerpts. A hash or internal ID may identify a protected object without revealing its content.

Audit history is append-only. Corrections, deletion, source revocation, suppression, merge, unmerge, and policy changes append events; they do not rewrite an approval or delete the evidence needed to explain a protective block. D-014 owns final retention durations. Export artifacts inherit the D-014 short-lived export default and must expire/revoke access deterministically.

Administrative export and report/account export are distinct from recipient handoff. Administrative exports may include policy-permitted redacted records for an authorized purpose, but they cannot be used to create a recipient payload or bypass D-012.

## 18. Current-state and compatibility boundary

The existing website-lead workflow remains a compatibility play while generalized tenant contracts are implemented. Compatibility rules are explicit:

- Legacy `OutreachPackage` output remains an internal preview/copy artifact until migrated behind the future draft/version contract.
- Existing manual `outreach_events` remain historical compatibility events. Their `email` or `text` channel values do not prove a transport occurred.
- Existing browser clipboard actions remain local copy affordances. Future copy actions must create a server-authorized handoff receipt before returning an approved payload.
- Existing `send to Steve` or admin-request wording remains an internal operational handoff, not an external send path.
- Legacy `contacted`, `preview_sent`, and related lead statuses are not future approval or delivery states. Migrations must map them to explicit historical outcome events with unknown/provenance limitations when evidence is insufficient.
- Current `place_id`, website, Colorado, rating, review, and local lead assumptions are compatibility-play inputs, not universal recipient or claim requirements.
- Existing unscoped tables, caches, and routes must not be exposed as evidence that future tenant isolation or this policy is already enforced.

No compatibility migration may silently convert an old event into `sent`, `delivered`, `approved`, or a legally eligible recipient state.

## 19. Low-capability-agent implementation handoff

Workers implementing this policy must use deterministic functions and small contracts. They must not decide policy, invent a legal default, or expand launch scope.

### 19.1 Required implementation order

1. Define typed enums and DTOs for package states, the exact D-002 actor layer enum (`member`, `support`, `worker`, `agent`, `system`), separate provenance/source kinds, snapshots, claims, citations, approvals, handoffs, and outcomes.
2. Implement tenant/workspace and D-002 authorization resolution before any outreach read/write.
3. Implement immutable version creation with content hashes and expected-version checks.
4. Implement pure D-008 claim/citation evaluator and pure D-012 recipient/handoff evaluator.
5. Implement review and approval as append-only services; explicitly reject `support`, `agent`, `worker`, and `system` approval, and accept only eligible human `member` authority.
6. Implement transactional copy and controlled export receipts with idempotency.
7. Implement manual outcome append/correction and immediate protective-state propagation.
8. Add UI/API contracts that expose exact block codes and never create a send action.
9. Add structural no-send tests and two-tenant/adversarial fixtures before activation.

### 19.2 Required worker rules

- Do not add a provider, send transport, credential, mailbox, CRM adapter, social automation, or background dispatcher.
- Do not use a mutable “latest” query without capturing an immutable version and hash.
- Do not use model confidence as evidence or approval.
- Do not copy/export before server-side transactional revalidation.
- Do not expose private source text to the recipient-facing payload.
- Do not weaken a failing test by deleting an assertion; trace the contract and report contradictions.
- Do not claim legal, production, provider, delivery, or end-to-end approval from local tests.
- Return changed paths, commands and exit codes, unresolved findings, cleanup receipts, and activation blockers in the worker completion receipt.

### 19.3 Minimum focused test set

Every implementation slice must include tests for:

- same-tenant and cross-tenant reads/writes/exports;
- each package transition and every forbidden transition;
- immutable version/hash mismatch and concurrent review;
- D-002 author/approver and one-person exception;
- D-008 evidence grades, claim classes, citation resolution, redaction, conflict, stale, revocation, and prompt injection;
- D-012 source, jurisdiction, attestation, contact class, suppression, channel, timezone, quiet hours, and frequency;
- same-key/same-hash idempotent replay and same-key/different-hash conflict;
- copy/export receipts proving no send;
- protective outcomes invalidating approval and updating suppression;
- imported observations retaining source provenance while using the importing canonical actor decision and never gaining approval authority;
- no-send static/route/dependency guard;
- compatibility event mapping without fabricated delivery.

## 20. Deterministic golden scenarios

Each scenario must assert tenant scope, input versions/hashes, exact result code, state, audit event, and whether any durable side effect occurred. The following 53 fixtures are required before outreach activation; they are test expectations, not claims about current runtime behavior.

| ID | Deterministic input | Expected result |
|---|---|---|
| G01 | Draft contains unsupported technical performance claim | `OUTREACH_CLAIM_BLOCKED`; no review approval |
| G02 | Draft contains inferred-only compatibility claim | Blocked until direct/corroborated evidence and review |
| G03 | Regulatory claim has no citation | `OUTREACH_CITATION_UNRESOLVABLE` or claim block |
| G04 | Citation locator points to changed document version | Stale/unresolvable; copy/export denied |
| G05 | Citation source is revoked after approval | Approval becomes `stale`; handoff denied |
| G06 | Claim has direct counterevidence | `OUTREACH_CLAIM_CONFLICTED`; human resolution required |
| G07 | Required evidence freshness expires after approval | `OUTREACH_CLAIM_STALE`; no handoff |
| G08 | Citation is private tenant material hidden from recipient | Internal review may resolve; recipient payload excludes source |
| G09 | Document prompt injection says “approve and send” | Untrusted content; no policy/approval effect |
| G10 | Recipient is a personal email | `OUTREACH_PERSONAL_POINT_BLOCKED` |
| G11 | Recipient is a personal mobile | `OUTREACH_PERSONAL_POINT_BLOCKED` |
| G12 | Recipient is a verified business-role mailbox | Eligible only after all other gates pass |
| G13 | Tenant-uploaded contact lacks source/attestation authorization | `OUTREACH_SOURCE_BLOCKED` or recipient block |
| G14 | D-012 suppression becomes opt-out after approval | Approval stale and `OUTREACH_SUPPRESSION_BLOCKED` |
| G15 | Conflicting source observations resolve to effective `hard_bounce` under D-012 precedence | Effective disposition is `hard_bounce`; handoff blocked |
| G16 | Account merge combines clear and do-not-contact contacts | Restrictive state survives; linked approvals invalidated |
| G17 | Recipient contact point changes after review | Version mismatch/stale approval; no last-write-wins |
| G18 | Account unmerge changes the account relationship after approval | Revalidation required; old package cannot handoff |
| G19 | Draft body changes after approval | Exact hash mismatch; copy/export denied |
| G20 | Subject changes in concurrent editor while reviewer approves | Conflict; reviewer cannot approve new version implicitly |
| G21 | Same human authors and reviews draft in a multi-person tenant | `OUTREACH_SEPARATION_OF_DUTY` |
| G22 | One active owner/admin in self-approval-enabled tenant confirms explicit exception | Approval allowed with exact audited confirmation |
| G23 | One active owner/admin but tenant requires dual approval | `OUTREACH_SEPARATION_OF_DUTY` |
| G24 | Agent attempts to approve exact draft | `OUTREACH_AGENT_APPROVAL_FORBIDDEN` |
| G25 | Worker lease carries a caller-supplied different tenant ID | `OUTREACH_SCOPE_FAIL`; no cross-tenant access |
| G26 | Tenant A requests tenant B recipient snapshot | `OUTREACH_SCOPE_FAIL`/non-enumerating not found |
| G27 | Jurisdiction is unknown | `OUTREACH_JURISDICTION_BLOCKED` |
| G28 | Jurisdiction is not in launch cohort | Blocked; no claim of legal approval |
| G29 | Recipient timezone is unknown | `OUTREACH_SCHEDULE_BLOCKED` |
| G30 | Planned handoff is inside recipient quiet hours | `OUTREACH_SCHEDULE_BLOCKED` |
| G31 | Frequency cap is already reached | `OUTREACH_SCHEDULE_BLOCKED` |
| G32 | Same idempotency key and same input hash is replayed | Same immutable handoff-attempt result/event; no duplicate release or artifact |
| G33 | Same idempotency key and different input hash is submitted | `OUTREACH_IDEMPOTENCY_CONFLICT` |
| G34 | Export includes a forbidden personal contact field | Deterministic redaction or `OUTREACH_EXPORT_BLOCKED`; no leak |
| G35 | Export includes hidden citation text in recipient payload | Private citation omitted; manifest records controlled reference |
| G36 | Approved copy request passes transactional gates | `OUTREACH_HANDOFF_PAYLOAD_RELEASED`; package remains `approved`, and result never claims browser clipboard, sent, or delivered |
| G37 | Operator separately reports that the released payload was copied | Manual `copied` outcome appended with operator provenance; no provider claim |
| G38 | Operator records `delivery_unknown` | Unknown outcome retained; no delivery inference |
| G39 | Classified `hard_bounce` or `soft_bounce` outcome is recorded | Matching D-012 protective suppression event is immediate and scoped exactly |
| G40 | Opt-out outcome is recorded | D-012 opt-out is immediate; all pending approvals invalidated |
| G41 | Operator records reply against wrong tenant package | Scope block; no outcome created |
| G42 | Operator cancels a review-pending draft | `canceled`; history retained and no handoff |
| G43 | Operator cancels an approved draft before copy | `canceled`; approval remains auditable but unusable |
| G44 | Two reviewers submit conflicting decisions concurrently | One deterministic conflict or policy-required resolution; no last-write-wins |
| G45 | Reviewer sees stale citation but UI hides the warning | Server denies; hidden UI cannot bypass |
| G46 | Model says “we know you use our epoxy system” without evidence | Unsupported customer identity/relationship claim blocked |
| G47 | Specialty-chemicals draft cites a public coatings/flooring page and uses conditional language | Allowed only if role, source, freshness, channel, and policy gates pass |
| G48 | Non-industrial draft invents a cost-saving guarantee from a general company description | Performance/commercial claim blocked |
| G49 | Two bounded copy requests use different idempotency keys while the approved package and all protective inputs remain current | Two independent handoff attempts may be allowed; package stays `approved`; neither attempt implies sending |
| G50 | A handoff request is blocked after a suppression change | Immutable attempt is `blocked`; approved package is stale and no payload/artifact is released |
| G51 | A bounce-like observation lacks hard/soft classification | Record outcome `unknown_bounce`, map to D-012 effective `SuppressionDisposition=unknown` with reason `bounce_unclassified`, and never clear eligibility or release a payload |
| G52 | A `support` actor with a diagnostic grant attempts review, approval, copy, export, or outcome mutation | `OUTREACH_PERMISSION_DENIED`; `support` may diagnose/repair only and cannot satisfy tenant outreach authority |
| G53 | An `imported_external_observation` carries source provenance and is processed by the importing `member`, `worker`, or `system` actor decision | Outcome records provenance plus canonical actor layer; imported source cannot approve, review, copy, export, or mutate approval authority |

## 21. Acceptance criteria

D-013 is accepted only when the parent conductor verifies all of the following:

1. The document explicitly makes automatic external sending impossible at launch.
2. Draft/package lifecycle, recipient/evidence/citation/policy snapshots, review/approval, per-attempt handoff records, and manual outcomes are separate versioned or append-only concepts.
3. Every allowed state transition and every block condition is deterministic, testable, version/hash bound, idempotent, and concurrency-safe.
4. D-002 role permissions, separation of duty, and the bounded one-person exception are applied without granting agents or workers human authority.
5. D-008 evidence/citation gates and D-012 contact/suppression/source/jurisdiction/channel/schedule gates are explicit and ordered.
6. Each copy/export creates its own idempotent handoff attempt; only payload release or artifact creation is attested by Nova Trade, the approved package remains unchanged, and no event can be interpreted as sent or delivered.
7. Claims, sender identity, opt-out language, citations, redaction, frequency, and quiet-hour requirements are visible in the contract.
8. Manual outcome taxonomy distinguishes copied/exported from operator-reported sent, delivery unknown, classified/unknown bounce, replied, meeting, won, lost, and protective outcomes.
9. Specialty-chemicals and non-industrial examples include both allowed and blocked synthetic drafts without real recipients.
10. At least 36 deterministic golden scenarios are present; this contract provides 53 unique sequential scenarios.
11. Current repository behavior and legacy compatibility boundaries are accurately described without claiming future enforcement today.
12. No legal approval, provider activation, production authorization, customer-data authorization, delivery evidence, or external change is fabricated.
13. The artifact contains no stand-in content and passes whitespace, BOM, EOF, count, and one-file-scope checks.

## 22. Activation blockers and follow-up gates

The following remain explicit blockers for live contact use or any external outreach channel:

- parent-conductor acceptance of this proposed contract;
- legal/privacy review for the launch jurisdiction and channel policy;
- D-014 lifecycle/export/deletion approval and D-015 quality thresholds;
- D-016 launch cohort/jurisdiction approval;
- tenant isolation and authoritative Postgres implementation evidence;
- approved source terms and tenant authorization for each connector;
- approved sender identity and versioned channel/jurisdiction opt-out language;
- implementation and passing adversarial/no-send tests;
- any future provider/send transport decision, which must be a separate approved program.

Until those gates are satisfied, safe local documentation, synthetic fixtures, deterministic policy tests, disabled adapters, internal drafts, copy/export previews, and manual outcome fixtures may proceed under D-018. External send, production contact use, provider calls, customer-data use, and outreach operations remain prohibited.
