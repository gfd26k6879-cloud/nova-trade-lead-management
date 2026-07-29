# Launch Cohort Contract (D-016)

**Task:** D-016 - approve the initial segment, jurisdictions, and launch cohort
**Status:** Accepted local implementation contract; no cohort activated
**Date:** 2026-07-27
**Scope:** Product and implementation contract; no customer enrollment, contact activation, outreach, provider call, database write, deployment, or external action
**Dependencies:** Accepted D-010 source allowlist, D-012 contact-use policy, D-013 outreach policy, D-017 integration boundary, D-018 execution authority, D-015 plan/quality-gate context pending separate parent acceptance, and the PRD

## 1. Decision summary

Nova Trade's first bounded market is evidence-rich B2B organizations that sell complex technical products through relationship-led sales. The calibration benchmark is industrial specialty chemicals: metalworking-fluid components and packages, epoxy resins, and target account types such as formulators, coatings makers, flooring and civil-engineering suppliers, adhesives and composites manufacturers, pipe makers, and distributors. This benchmark makes the first knowledge and play fixtures concrete; it is never a product, sector, or geography limitation.

The initial jurisdiction envelope is **United States B2B business-account research** using approved public, licensed, or tenant-provided business data. "Approved" means that the applicable D-010 source card, operation, field, terms state, tenant authorization, freshness rule, and policy version all pass. State, local, and channel rules remain policy inputs and are not inferred from this document.

Canada, the EU/EEA, the UK, and every other jurisdiction are deferred for contact use and outreach until explicit legal/privacy and product approval exists for the applicable jurisdiction, source, purpose, and channel. Missing jurisdiction evidence fails closed.

Document acceptance alone does not authorize:

- live contact research, contact handoff, or outreach activation;
- real design-partner enrollment or customer-data use;
- any send transport, mailbox, CRM-send, social automation, or autonomous sequence;
- a claim of legal approval, provider approval, production readiness, delivery, or customer outcome.

Tenant, knowledge, ICP, and lead-play work may proceed on synthetic fixtures and, where separately authorized, tenant-provided business materials. Automatic sending is absent. The launch handoff boundary is an exact, human-approved copy or controlled export artifact only after D-012 and D-013 gates pass, with separate legal/privacy activation for the relevant use.

This contract supplies a bounded implementation target. It does not itself approve the market, enroll a tenant, assign an individual owner, or change any upstream decision.

## 2. Source-of-truth alignment

The following rules are inherited rather than redefined here:

| Dependency | Binding input to this contract |
|---|---|
| PRD | Evidence-first understanding, adaptive questions, versioned ICPs/plays, human control, tenant isolation, privacy, audit, no autonomous cold outreach, and no universal industry/geography limitation. |
| D-010 | Deny-by-default sources. Current implementation-capable cards are `google_places_legacy`, `tenant_upload_document`, `customer_list_csv_upload`, `tenant_authorized_urls`, and `public_official_company_website`; their multi-tenant live states remain separately gated. Directories, associations, social profiles, people-data vendors, licensed databases without an approved connector contract, and bypass scraping are not silently enabled. Google Places remains official API-only, with no Search/Maps scraping and no review-body storage/display. |
| D-012 | Separate epistemic state from suppression. `clear` is the only passing suppression state; unknown, conflicted, stale, prohibited, opt-out, bounce, deletion, and other protective states block contact-capable operations. Tenant-provided contact data is not automatically an eligible recipient. Personal email and personal mobile are blocked by default. |
| D-013 | Draft, review, approval, copy, and controlled export are distinct. A human member approves the exact versions and snapshots. Copy/export proves only a Nova Trade handoff/artifact, never send, delivery, receipt, or engagement. Unsupported or unresolvable claims fail closed. |
| D-017 | Nova Trade remains the system of record for accounts, observations, evidence, plays, qualification, approvals, suppression, outcomes, and audit. Launch uses deterministic import/export artifacts; no live bidirectional CRM, credential storage, webhook, public integration write API, or automatic transport. |
| D-018 | Local documentation, fixtures, and non-production checks are allowed within task scope. Customer data, enrollment, external communication, provider calls, production mutation, remote database access, and outreach transport remain prohibited or separately approval-required. |
| D-015 | Quality targets are phase gates, not permission to invent calibration. The plan's non-negotiable defaults include zero cross-tenant disclosure/write, zero autonomous send, zero unsupported-claim escape, 100% resolvable citations for claims used in qualification/outreach, at least 99% precision for automatic exact account links, critical accessibility, no duplicate durable side effects, and passing critical security tests. Missing calibration evidence blocks the relevant gate. |

## 3. Current state versus future state

### 3.1 Current state

- The repository is a local/single-tenant compatibility application with legacy Google Places, Colorado/local-website assumptions, lead-centric records, copy-oriented outreach, and incomplete future tenant isolation.
- D-010 source cards are implementation guidance, not proof that new tenant-scoped production connectors are live.
- D-012 and D-013 define policy evaluators and result codes, but this document does not claim that every legacy route enforces them today.
- D-017's artifact-only launch boundary is the integration target; no live CRM is required for product completion.
- D-015 quality calibration, golden sets, production Postgres isolation evidence, and activation approvals are not supplied by this artifact.
- No cohort is active and no individual is assigned to an accountable activation role by this document.

### 3.2 Future target

The implementation target is a tenant-scoped, versioned workflow in which:

1. A tenant is eligible only after invite-only provisioning, verified ownership, policy acknowledgment, source authorization, and required evidence are recorded.
2. Business knowledge, ICPs, and lead plays can be built from authorized materials without requiring a live contact or outreach capability.
3. Account research is separated from person-level contact enrichment; role hypotheses are not verified people.
4. Every source observation, data class, jurisdiction, channel, claim, decision, and export is versioned, auditable, and tenant-scoped.
5. Contact research, draft creation, and copy/export handoff run ordered D-012/D-013 gates and fail closed on unknown or conflicting inputs.
6. Handoff creates an immutable, controlled copy/export artifact and no send state.
7. Expansion is a new activation decision with evidence, owners, caps, kill switches, and rollback; it is not implied by prior cohort success.

## 4. Initial segment and benchmark

### 4.1 Segment definition

The initial segment is an organization that:

- sells a complex technical product, component, package, material, system, or technical service;
- sells business-to-business through relationship-led discovery, technical evaluation, procurement, distribution, or channel relationships;
- can provide or authorize business materials and account-level evidence;
- can describe a bounded ICP hypothesis, buying trigger, disqualifier, and evidence threshold;
- accepts human review for knowledge, ICP/play, contact use, and any copy/export handoff; and
- can operate within the U.S. B2B account envelope and the applicable source and channel policies.

The segment is a quality target, not an eligibility shortcut. A tenant is not eligible merely because its label resembles the segment. Evidence of product, buyer, use case, geography, source authorization, and policy fit is required.

### 4.2 Specialty-chemicals calibration benchmark

The benchmark fixture set covers synthetic account records for:

- metalworking-fluid component and package suppliers or buyers;
- epoxy-resin suppliers or buyers;
- fluid formulators;
- coatings manufacturers;
- flooring and civil-engineering suppliers;
- adhesives and composites manufacturers;
- pipe manufacturers; and
- distributors and channel partners.

The fixture design must vary finished products, components, packages, private-label supply, technical service, and distribution so that adaptive questions and play logic are tested. It must include positive signals, disqualifiers, unknowns, stale evidence, conflicting legal-entity/relationship evidence, channel position, and role hypotheses. It must not encode a fixed questionnaire, fixed score, automatic product-fit claim, or assumption that every organization is a chemical or manufacturing organization.

Synthetic fixture IDs use opaque labels such as `fixture-account-001`; no real company names, domains, contact points, enrollment records, customer lists, or outreach recipients are included.

### 4.3 Non-industrial transfer test

At least one non-industrial synthetic fixture family must exercise the same contracts with different questions, signals, and claim classes. A technical B2B software, equipment, or service example is permitted when it uses fictional identifiers only. The expected result is generalized account/knowledge/play behavior, not a second live vertical.

## 5. Jurisdiction and policy envelope

### 5.1 Current launch envelope

| Dimension | Initial rule | Fail-closed condition |
|---|---|---|
| Market | United States | Country is absent, ambiguous, outside the U.S. envelope, or cannot be tied to the account/jurisdiction evidence. |
| Purpose | B2B business-account research; knowledge, ICP, and play design | Purpose would use a person-level contact, consumer target, or outreach without the downstream policy decision. |
| Data | Approved public, licensed, or tenant-provided business data | Source card, operation, field, terms, tenant attestation, lawful-basis interpretation, or retention state is missing, stale, revoked, or unapproved. |
| Account scope | Business entity, branch, distributor, facility, or relationship evidence with D-011 identity handling | Legal-entity, jurisdiction, parent/branch, or relationship ambiguity would cause an automatic merge or unsupported claim. |
| Contact scope | No live contact use from this document; if separately activated, business-role mailbox, named business email, or business switchboard only | Personal email/mobile, unknown class, role-only hypothesis presented as a person, suppression other than `clear`, or missing D-012 vector. |
| Channel | Draft and controlled copy/export only after D-013 gates | Any send, mailbox, CRM transport, social, phone/SMS automation, sequence, or channel without explicit jurisdiction approval. |
| State/local rules | Inputs to tenant policy and legal/privacy review | A state/local rule is assumed, generalized, or unavailable for the intended purpose/channel. |
| Claim class | Evidence-backed account/fit reasoning and conditional draft language within approved scope | Technical, application-fit, regulatory, certification, safety, performance, price, capacity, lead-time, supply, customer-identity, relationship, or personalization claim lacks required evidence/review. |

### 5.2 Deferred jurisdictions

Canada, every EU/EEA member state, the UK, and all other jurisdictions are `deferred` for contact research, contact-use decisions, copy/export handoff, and outreach activation. A deferred jurisdiction may be represented in synthetic fixtures to test denial behavior and may support non-contact account/knowledge contract work only when the data source and tenant policy permit that implementation fixture. It is not a live-market authorization.

Expansion requires a jurisdiction-specific record covering purpose, data classes, source terms, lawful-basis interpretation, consent/opt-out treatment, retention/deletion, state/local/channel rules, claim restrictions, support handling, and explicit legal/privacy and product approval. No absence of a rule is permission.

## 6. Accountable owner roles and activation ownership

The contract names accountable roles, not invented individuals:

| Role | Accountability before activation | Required evidence |
|---|---|---|
| Product | Own segment, cohort caps, product success metrics, tenant eligibility, play/user acceptance, and activation decision record. | Named individual assigned in the activation record; approval scope and date; accepted cohort version. |
| Engineering/Security | Own tenant isolation, authorization, immutable artifacts, secrets boundary, no-send guard, observability, kill switch, rollback, and technical evidence. | Named individual assigned in the activation record; test/review receipt; target environment and rollback owner. |
| Privacy/Legal | Own jurisdiction, source terms, lawful-basis/consent interpretation, contact classes, claims, retention, channel, and expansion review. | Named individual assigned in the activation record; jurisdiction/source/channel decision and expiry/review date. |
| Support/Operations | Own support readiness, incident route, tenant communications, queue/runbook coverage, cap monitoring, and suspension/rollback operation. | Named individual assigned in the activation record; staffed coverage, runbook, escalation path, and acknowledgement. |

An actual individual assignment for every required role is an activation prerequisite. This document does not fabricate names, infer that a role is staffed, or treat parent acceptance as an individual approval. If an owner is absent or the assignment is expired, the affected cohort remains blocked and returns `COHORT_OWNER_UNASSIGNED`.

## 7. Tenant eligibility

### 7.1 Required eligibility record

Each tenant candidate must have a tenant-scoped, versioned eligibility record containing:

1. Invite-only provisioning and a verified owner/membership context.
2. Organization type and B2B operating purpose.
3. Product/service description and the relationship-led sales motion.
4. Initial ICP/play hypothesis, target account classes, disqualifiers, and success definition.
5. Data inventory by source, data class, owner/authorization, jurisdiction, freshness, retention, and permitted operation.
6. Tenant attestation that uploaded materials and lists are authorized for the declared use; attestation is not a legal conclusion.
7. Contact-use policy version, suppression state handling, and channel/jurisdiction policy inputs.
8. Claim-class inventory identifying technical, regulatory, safety, performance, commercial, relationship, and personalization risks.
9. Workspace and cap assignment that cannot broaden tenant scope.
10. Named activation owners and evidence references, when the cohort state requires activation.

### 7.2 Included tenant work

- Tenant/workspace contracts, RBAC, audit, policy versions, and isolation fixtures.
- Ingestion and evidence modeling for synthetic or explicitly authorized business materials.
- Business understanding, adaptive questions, ICP authoring, play versioning, account research, qualification proposals, and review queues.
- Account-only reports and deterministic fixture import/export under D-017.
- Synthetic contact-use, claim, suppression, jurisdiction, handoff, and rollback fixtures.

### 7.3 Excluded tenant work

- Personal contact enrichment, buying or reselling personal data, or inferring a person's identity from a role hypothesis.
- Consumer outreach, minors, sensitive traits, protected characteristics, discriminatory targeting, or sensitive-trait proxies.
- High-risk regulated sectors or regulated, safety, export-controlled, medical, financial, or other high-impact claims without a separate approved policy; exclusion applies where the product, target, claim, or use would require such review.
- Live customer-data use, real enrollment, provider credentials, remote data, or external communication in this task.

## 8. Cohort boundaries and numeric caps

Caps below are hard ceilings for the named cohort state, not a promise of capacity. Counts are tenant-scoped and include active, pending, and retained-in-window records where the policy says so. A cap breach blocks the operation; it never silently evicts or samples records.

### 8.1 Internal validation cohort

**Current cap:** 2 fixture tenants, 3 workspaces per tenant, 5 active play versions per tenant, 25 synthetic accounts per tenant, 0 live contact points, 0 contact handoffs, 0 outreach operations, and 0 real enrollments.

**Entry gates:** this contract exists locally; fixture identifiers are synthetic; no customer data or external provider is used; the fixture source manifest, data-class labels, policy versions, and expected result codes are present; and the worktree scope is limited to the assigned artifact.

**Allowed work:** knowledge ingestion, adaptive questions, ICP/play design, account-only discovery fixtures, evidence/citation evaluation, synthetic contact and outreach policy evaluation, D-017 artifact shape tests, and kill/rollback rehearsal.

**Exit gates:** two-tenant isolation tests pass; deterministic scenarios pass; no-send and non-enumeration checks pass; fixture provenance and claim coverage are complete; D-015 measurement definitions have owners; and Product plus Engineering/Security review the local evidence. Exit does not activate a design partner or paid cohort.

### 8.2 Design-partner cohort

**Current live cap:** 0 enrolled organizations and 0 live contact points. Document acceptance does not enroll a design partner.

**Proposed future cap after separate activation:** 3 design-partner tenants total; 1 tenant per design partner; 2 workspaces per tenant; 3 active play versions per tenant; 100 account records per tenant; 25 business contact points per tenant; 1 approved draft/copy-export channel; and 0 automatic sends. These are bounded pilot ceilings, not an enrollment request.

**Entry gates:** internal exit gates pass; a real design-partner organization is separately invited and accepts; tenant ownership and data authorization are recorded; actual Product, Engineering/Security, Privacy/Legal, and Support/Operations individuals are assigned; U.S. jurisdiction/source/channel decisions are current; D-012 contact-use and D-013 draft/handoff policy evaluations are implemented and tested; D-017 artifact-only boundary is enforced; and the design partner has a documented stop/rollback contact.

**Permitted progression:** account-only knowledge and play work may be enabled at a lower cap before live contact use if the tenant data and source gates pass. Live contact research, draft use, and copy/export each require their own D-012/D-013 decision; one gate does not grant the next. The design-partner state never adds a send transport.

**Exit gates:** a design partner may remain active only while cap, source, jurisdiction, suppression, claim, support, isolation, and incident metrics remain within policy. Exit to paid is prohibited unless every paid gate in Section 8.3 passes. Suspension or rollback returns the tenant to a safe non-live state and invalidates affected approvals.

### 8.3 Paid live cohort

**Current cap:** 0 paid live tenants, 0 paid live workspaces, 0 live contact points, 0 handoffs, and 0 outreach operations. Paid live cohort remains zero until D-015 gates, accountable individuals, security/privacy/legal approval, support readiness, and tenant-isolation evidence all exist.

**Proposed future cap after explicit activation:** 3 paid tenants total; 2 workspaces per tenant; 3 active play versions per tenant; 250 account records per tenant; 50 business contact points per tenant; 1 approved copy/export channel; and 0 automatic sends. Any larger cohort is a new expansion decision.

**Required entry gates:**

1. D-015 quality and phase thresholds are approved, measured on the relevant golden sets, and passed, including isolation, citation resolution, unsupported-claim escape, account-link precision, critical security, and duplicate-side-effect checks.
2. Product, Engineering/Security, Privacy/Legal, and Support/Operations individuals are assigned with current approvals and explicit responsibilities.
3. Tenant isolation evidence exists on the authoritative target; local SQLite compatibility is not substituted for Postgres isolation evidence.
4. D-010 source terms/operations, D-012 contact-use, D-013 outreach boundary/claim policy, D-014 lifecycle requirements, and D-017 integration contracts are implemented, versioned, and tested for the requested scope.
5. Privacy/legal approves the U.S. purpose, data classes, state/local inputs, channel, claims, retention, suppression, and tenant authorization interpretation.
6. Support/Operations has staffed coverage, incident and suppression handling, cap monitoring, customer communication, and tested kill/rollback runbooks.
7. The tenant passes eligibility review, accepts the policy version, and opts into the exact cap and artifact-only boundary through a separately recorded enrollment decision.

**Exit gates:** paid live is suspended, reduced, or closed on any kill criterion; expansion requires new evidence and approval; and closeout preserves audit, suppression, source, and immutable artifact history.

## 9. Data, source, and evidence contract

### 9.1 Required evidence dimensions

No tenant, source, data class, jurisdiction, channel, claim, or expansion is eligible based on a single unlabeled assertion. The minimum evidence record is:

| Dimension | Minimum required evidence | Passing rule |
|---|---|---|
| Tenant | Tenant ID, verified owner/membership, policy version, purpose, attestation, workspace scope, retention/deletion profile, approval references | All identities and policies resolve in the authenticated tenant scope; assertions in payloads are not authority. |
| Source | D-010 source card, status, owner, operation, allowed fields, terms-review state/date, credential class, query/fetch time, freshness, rate/budget rule, provenance IDs | Source is explicitly listed, operation/field is allowed, terms are current, and no bypass or unknown authorization is used. |
| Data class | Account, business role, business contact point, personal contact point, technical material, claim, suppression, audit, or artifact classification; owner and retention | The class is allowed for the operation and is not silently promoted to a more permissive class. Personal contact classes remain blocked by default. |
| State/jurisdiction | Country, state/local policy inputs, account/legal-entity relation, source region, purpose, lawful-basis interpretation, consent signal where required, policy version and expiry | U.S. B2B account research is known and approved; deferred or unknown jurisdiction blocks contact use and outreach. |
| Channel | Channel name, purpose, authorization, consent requirement, opt-out language, recipient timezone, quiet-hour/frequency policy, D-013 version | Only the approved draft/copy-export channel may proceed; no transport capability is inferred. |
| Claim class | Exact claim text/span, class, source/evidence IDs, immutable citation locator, observation/retrieval time, freshness, redaction/display state, confidence/uncertainty, reviewer when required | Direct or corroborated evidence and required review exist; unsupported, inferred-only, conflicted, stale, revoked, or unresolvable claims block. |
| Expansion | Baseline-to-expanded diff, new jurisdictions/sources/data classes/channels, sample/golden set, quality results, isolation/security evidence, cap, owners, legal/privacy/product/support approvals, kill and rollback plan | Expansion is versioned and separately approved; prior approval does not authorize the new scope. |

### 9.2 Source handling

The source decision is made before any connector execution. A public website is not permission by itself. Tenant authorization does not transfer provider-term ownership to the tenant. A missing, expired, revoked, or unknown source terms state returns a source block. Every observation records source card, tenant, operation, fields, query/fetch time, policy version, run/correlation ID, freshness, and block/retry/kill reason.

The following remain excluded or deferred unless an upstream decision changes them explicitly: directories, associations, social-network profiles, people-data vendors, unapproved licensed databases, Google Search/Maps scraping, robots/access-control evasion, rate-limit circumvention, and any source not listed with an active operation and field allowlist.

### 9.3 Contact-use handling

Contact research is not account research. A contact point is eligible only after the exact D-012 vector passes: tenant/workspace scope, source policy, jurisdiction, attestation, identity/role evidence, freshness, lawful basis, consent interpretation, channel authorization, and effective suppression. `clear` is the only passing disposition. `personal_email`, `personal_mobile`, unknown contact class, personal-data enrichment, and role-hypothesis-as-person behavior are blocked.

Tenant-provided contact fields create candidate source records, not recipients. Deletion, opt-out, complaint, do-not-contact, hard/soft bounce, source prohibition, conflict, unknown state, or policy change invalidates affected decisions and approvals immediately.

### 9.4 Outreach and handoff handling

The only launch handoff is a human-approved, immutable, tenant-scoped copy/export artifact. It must contain exact draft, recipient, evidence, citation, policy, actor, version/hash, channel, time, timezone, suppression epoch, idempotency key, and result code. The system must re-evaluate the protected inputs transactionally before releasing the artifact.

No file, clipboard event, export, queue state, timestamp, manual outcome, or UI message may be represented as sent, delivered, opened, clicked, or replied automatically. A member may separately record a truthful manual outcome under D-013; that observation is not transport authority.

## 10. Benchmark dataset design

The benchmark is synthetic and versioned. It is a test instrument, not a customer list and not an enrollment mechanism.

### 10.1 Dataset partitions

| Partition | Contents | Required use |
|---|---|---|
| `knowledge_core` | Synthetic product sheets, catalogs, technical notes, market descriptions, and authorized-source metadata | Business understanding, evidence extraction, unknown preservation, adaptive questions. |
| `account_fit` | Fictional account records across the specialty-chemicals categories and one non-industrial family | ICP/play retrieval, account identity, positive/disqualifying signals, relationship and legal-entity ambiguity. |
| `contact_policy` | Synthetic role hypotheses and business contact classes, including personal and unknown classes | D-012 state/evaluator behavior without real people or contact points. |
| `claim_review` | Direct, corroborated, inferred-only, conflicted, stale, revoked, and unresolvable evidence for each high-impact class | D-008/D-013 claim gates and citation resolution. |
| `jurisdiction_channel` | U.S. approved, U.S. missing-state/local-input, Canada/EU/EEA/UK/other deferred, unknown, and channel variants | Non-enumerating jurisdiction blocks and expansion gates. |
| `cohort_ops` | Cap, owner, support, isolation, kill, rollback, idempotency, and scope fixtures | State machine and operational failure behavior. |

### 10.2 Dataset invariants

- Every record has a synthetic ID, tenant ID, fixture version, source/data-class label, expected policy outcome, and no real organization or person name.
- Every claim has an expected evidence state; unknown remains unknown and absence is never inferred from silence.
- At least two synthetic tenants and two workspaces exercise same-looking account/source identifiers without cross-tenant leakage.
- At least one fixture covers each D-010 implementation-capable source card and each deferred/blocked source family.
- At least one fixture covers every numeric cap boundary and one-over-cap rejection.
- Fixture replay is deterministic: same fixture version and policy snapshot produce the same result code and side-effect assertion.
- Data is suitable for local tests only; it is not a substitute for legal approval, production data, or D-015 golden-set acceptance.

## 11. Cohort progression state machine

The cohort state is separate from tenant status, play status, contact suppression, and outreach package state. It is versioned and append-only.

### 11.1 States

`PROPOSED` -> `INTERNAL_VALIDATION` -> `FIXTURE_VALIDATED` -> `DESIGN_PARTNER_PENDING` -> `DESIGN_PARTNER_ACTIVE` -> `PAID_GATE_PENDING` -> `PAID_LIVE` -> `SUSPENDED` -> `ROLLED_BACK` -> `CLOSED`

`DESIGN_PARTNER_PENDING` and `PAID_GATE_PENDING` are review states, not permissions. No state grants a live connector, contact use, handoff, or send by itself.

### 11.2 Transition contract

| From | Event | Required gates | To | On failure |
|---|---|---|---|---|
| `PROPOSED` | Parent accepts contract version | Product review of segment/jurisdiction/caps; no enrollment | `INTERNAL_VALIDATION` | Remain proposed; no live action. |
| `INTERNAL_VALIDATION` | Fixture run requested | Synthetic-only inputs, source manifests, expected codes, cap and scope checks | `FIXTURE_VALIDATED` | `COHORT_MALFORMED`; no durable cohort activation. |
| `FIXTURE_VALIDATED` | Design-partner candidate proposed | Separate invitation/consent process, owner assignments, U.S. policy evidence, support and rollback plan | `DESIGN_PARTNER_PENDING` | `COHORT_ENROLLMENT_NOT_AUTHORIZED`. |
| `DESIGN_PARTNER_PENDING` | Design-partner activation approved | Tenant eligibility, D-010/D-012/D-013/D-017 gates, isolation and support evidence, cap reservation | `DESIGN_PARTNER_ACTIVE` | `COHORT_APPROVAL_REQUIRED` or specific stable block. |
| `DESIGN_PARTNER_ACTIVE` | Paid review requested | D-015 evidence, named owners, security/privacy/legal approval, support readiness, isolation evidence, tenant opt-in | `PAID_GATE_PENDING` | Active design-partner state remains bounded; no paid access. |
| `PAID_GATE_PENDING` | Paid activation approved | All paid entry gates, cap, policy versions, artifact-only handoff, kill switch and rollback test | `PAID_LIVE` | `COHORT_D015_GATE_MISSING` or specific stable block. |
| Any active state | Protective failure or kill event | Record reason, affected scope, policy versions, and actor | `SUSPENDED` | Freeze affected runs and handoffs; preserve history. |
| `SUSPENDED` | Recovery evidence accepted | Root cause addressed, revalidation, owner approval, cap reconciliation | Prior bounded active state or `ROLLED_BACK` | Remain suspended. |
| `SUSPENDED` | Rollback invoked | Freeze external integration, revoke candidates, invalidate approvals, preserve audit/suppression | `ROLLED_BACK` | No partial reactivation. |
| `ROLLED_BACK` | Closeout | Retention/deletion handoff and final audit | `CLOSED` | Remain rolled back. |

### 11.3 State invariants

- A state transition is idempotent by `(tenant_id, cohort_version, event_id, input_hash)`; same identity and hash replays the same result, while a different hash returns a conflict.
- A tenant/workspace assertion never supplies authorization. Server-resolved scope is authoritative.
- Foreign protected objects and unknown cohort identifiers use non-enumerating `404`/`COHORT_NOT_FOUND_OR_FORBIDDEN` behavior to external callers.
- Cohort activation cannot clear contact suppression, source prohibition, jurisdiction deferral, claim block, or a prior kill.
- A rollback invalidates pending contact/outreach approvals and releases no copy/export artifact.

## 12. Stable result codes and non-enumerating failures

Result codes are stable domain outcomes, not user-facing evidence that a protected tenant or contact exists. External callers receive the least revealing code and status permitted by scope; internal reason detail is available only after independent authorization and is audited.

| Code | Meaning | Required side effect |
|---|---|---|
| `COHORT_PROPOSED` | Contract is recorded as proposed, not active | Append decision record; no enrollment or activation. |
| `COHORT_REPLAY_SAME_INPUT` | Same event identity and input hash returns the original durable result | No duplicate transition or side effect. |
| `COHORT_NOT_FOUND_OR_FORBIDDEN` | Cohort/tenant/object absent or outside caller scope | Non-enumerating 404-like response; no mutation. |
| `COHORT_TENANT_INELIGIBLE` | Tenant fails segment, B2B, authorization, or data eligibility | No activation; preserve review reason internally. |
| `COHORT_JURISDICTION_BLOCKED` | Jurisdiction missing, deferred, stale, conflicted, or unapproved | No contact use, handoff, or outreach; account-only fixture work may continue where allowed. |
| `COHORT_SOURCE_BLOCKED` | D-010 card, terms, operation, field, attestation, or source authorization fails | No connector call or source-derived recipient output. |
| `COHORT_DATA_CLASS_BLOCKED` | Requested data class is not allowed for the purpose | Redact or reject; no promotion to a permissive class. |
| `COHORT_CONTACT_BLOCKED` | D-012 contact class, suppression, identity, freshness, or permission fails | No contact research/handoff mutation. |
| `COHORT_CHANNEL_BLOCKED` | Channel or state/local/channel rule is not authorized | No draft/handoff artifact. |
| `COHORT_CLAIM_BLOCKED` | Claim is unsupported, conflicted, stale, revoked, sensitive, or unresolvable | No claim-approved draft or handoff. |
| `COHORT_APPROVAL_REQUIRED` | A required human/product/legal/privacy/security/support decision is absent | Remain in review state; no activation. |
| `COHORT_OWNER_UNASSIGNED` | Actual accountable individual is not assigned or assignment expired | Remain blocked; no inferred owner. |
| `COHORT_CAP_EXCEEDED` | Tenant/cohort/record/channel cap would be exceeded | Reject whole requested operation; no partial success unless an explicit artifact contract allows it. |
| `COHORT_ISOLATION_EVIDENCE_MISSING` | Authoritative tenant isolation evidence is absent or failed | Paid/live activation remains zero; no claim of isolation. |
| `COHORT_D015_GATE_MISSING` | Required quality threshold, golden-set result, or approver is absent | Do not advance to paid live. |
| `COHORT_SUPPORT_NOT_READY` | Staffing, runbook, incident, suppression, or rollback readiness is absent | Do not activate live cohort. |
| `COHORT_ENROLLMENT_NOT_AUTHORIZED` | No separate, explicit tenant invitation/acceptance/opt-in exists | No tenant or design partner is created. |
| `COHORT_INTEGRATION_DISABLED` | CRM/provider/transport is outside launch boundary or deferred | No network call, credential use, retry, or external write. |
| `COHORT_HANDOFF_NOT_SEND` | Copy/export artifact was prepared or released; no transport occurred | Append artifact/handoff evidence only; no send/delivery inference. |
| `COHORT_SCOPE_FAIL` | Authenticated scope and asserted tenant/workspace/object scope conflict | Non-enumerating external response; no partial mutation. |
| `COHORT_MALFORMED` | Input, policy value, fixture, hash, or version is malformed | Reject before evaluation or mutation. |
| `COHORT_IDEMPOTENCY_CONFLICT` | Same identity/key has a different input hash | Append conflict audit; no second mutation. |
| `COHORT_KILLED` | Kill switch or protective condition stopped the cohort/run | Freeze affected work; preserve audit and suppression. |
| `COHORT_ROLLBACK_COMPLETE` | Rollback completed with invalidation and preserved history | No reactivation without a new approval and evidence set. |

## 13. Kill, suspension, and rollback

### 13.1 Kill criteria

Kill the affected tenant, source, run, channel, or cohort immediately on any of the following:

- cross-tenant read, write, export, cache, prompt-context, or artifact exposure;
- missing, stale, revoked, or unresolvable provenance for a material claim or recipient;
- unsupported technical, regulatory, safety, performance, commercial, customer-identity, or personalization claim escaping its gate;
- source terms, tenant authorization, state/local rule, jurisdiction, or channel approval becoming unknown or invalid;
- personal contact point, suppressed contact, minor, consumer target, sensitive trait, or excluded sector/claim entering a contact-capable path;
- cap, budget, rate, freshness, or retention boundary being exceeded or unmeasurable;
- duplicate durable handoff or non-idempotent side effect;
- no-send guard, authorization, support, security, or audit invariant failing;
- D-015 quality regression, incident threshold, or required evidence becoming invalid; or
- an owner, legal/privacy reviewer, or support operator invoking a documented stop.

### 13.2 Rollback procedure

1. Set the affected state to `SUSPENDED` and record the exact stable code, scope, policy versions, actor, and correlation ID.
2. Stop connector runs and external integration attempts; deferred/disabled connectors receive no retry.
3. Stop contact research, draft advancement, and copy/export release for affected scope.
4. Invalidate affected approvals, recipient snapshots, claim snapshots, and reusable decision-cache entries.
5. Revoke or redact unreleased candidate artifacts; do not mutate history into a success or send state.
6. Preserve source observations, suppression history, audit events, immutable versions, and incident evidence under retention policy.
7. Re-run isolation, source, policy, claim, cap, and support checks before recovery; otherwise transition to `ROLLED_BACK`.

Rollback is reversible only through a new versioned activation decision. It never restores eligibility by deleting a protective record.

## 14. Low-capability implementation handoff

Workers consuming this contract must remain within the named task and use deterministic, small functions:

1. Read the cohort version, policy snapshot, tenant scope, cap assignment, and state before acting.
2. Treat payload tenant/workspace/jurisdiction/source fields as assertions; resolve authority from server context in future implementation.
3. Validate source card, operation, data class, and provenance before connector execution; deny unknown or deferred cards without network calls.
4. Keep account research, contact research, claim evaluation, draft, approval, and handoff as separate typed operations.
5. Call D-012 for contact decisions and D-013 for claim/draft/handoff decisions; do not duplicate or weaken their precedence.
6. Use exact version/hash/idempotency inputs and one expected result code per fixture row.
7. Make foreign-object failures non-enumerating and avoid response text that reveals tenant, account, contact, or cohort existence.
8. Never add a provider, credential, CRM adapter, send transport, mailbox, social automation, sequence, or public integration write API.
9. Preserve synthetic-only fixtures and do not use real company names, people, contact points, customer lists, or enrollment records.
10. Report changed files, local commands, exit codes, unresolved activation blockers, and scope; do not report an activation or legal result from local checks alone.

## 15. Deterministic scenario matrix

Each row is a unique synthetic input with one expected stable result code and one side-effect assertion. Scenarios are contract expectations; they are not evidence that the current runtime already enforces them.

| ID | Deterministic input | Expected result | Side effect |
|---|---|---|---|
| SC-001 | Accepted local D-016 contract is read by an authorized implementation worker while the cohort itself remains only proposed | `COHORT_PROPOSED` | Cohort record remains proposed; no activation. |
| SC-002 | Foreign caller requests a known cohort ID without authorized tenant scope | `COHORT_NOT_FOUND_OR_FORBIDDEN` | Non-enumerating 404-like response; no mutation. |
| SC-003 | Caller requests a nonexistent cohort ID | `COHORT_NOT_FOUND_OR_FORBIDDEN` | Same non-enumerating response as SC-002. |
| SC-004 | Candidate tenant describes consumer-only sales rather than B2B technical sales | `COHORT_TENANT_INELIGIBLE` | No enrollment or policy expansion. |
| SC-005 | Candidate tenant sells a complex technical product and provides only synthetic business materials | `COHORT_PROPOSED` | Internal fixture review may continue; no live enrollment. |
| SC-006 | Internal fixture request contains a real company name | `COHORT_MALFORMED` | Fixture rejected; no data retained. |
| SC-007 | Internal request contains a real personal contact point | `COHORT_DATA_CLASS_BLOCKED` | Contact value is rejected/redacted; no contact operation. |
| SC-008 | Internal request uses two synthetic tenants with identical external account text | `COHORT_PROPOSED` | Records remain tenant-separated; no cross-tenant merge. |
| SC-009 | Internal request would create the third fixture tenant over the cap of two | `COHORT_CAP_EXCEEDED` | Whole request rejected; existing fixtures unchanged. |
| SC-010 | Internal request would create a sixth active play version for one fixture tenant | `COHORT_CAP_EXCEEDED` | No play activation. |
| SC-011 | U.S. account-only fixture uses an allowed D-010 tenant-upload source card | `COHORT_PROPOSED` | Provenance fixture may be stored locally. |
| SC-012 | Source card is a deferred directory and request asks for candidate contacts | `COHORT_SOURCE_BLOCKED` | No connector call or contact output. |
| SC-013 | Public website is selected with unknown terms-review state | `COHORT_SOURCE_BLOCKED` | No fetch/crawl; block reason is audited internally. |
| SC-014 | Google Places request attempts Google Maps page scraping | `COHORT_SOURCE_BLOCKED` | No network call; official API-only boundary preserved. |
| SC-015 | Tenant-authorized URL has expired authorization attestation | `COHORT_SOURCE_BLOCKED` | No fetch; run is stopped. |
| SC-016 | Source operation asks for a field outside the D-010 stored-field allowlist | `COHORT_DATA_CLASS_BLOCKED` | No disallowed field persisted or exported. |
| SC-017 | Account research has U.S. country but no state/local policy input for a state-sensitive purpose | `COHORT_JURISDICTION_BLOCKED` | Account-only safe work may remain; contact/outreach path is blocked. |
| SC-018 | Contact jurisdiction is Canada with otherwise complete source and attestation evidence | `COHORT_JURISDICTION_BLOCKED` | No contact research, draft, or handoff. |
| SC-019 | Contact jurisdiction is an EU/EEA member state with a role mailbox | `COHORT_JURISDICTION_BLOCKED` | No recipient decision or artifact. |
| SC-020 | Contact jurisdiction is the UK with clear suppression and current source evidence | `COHORT_JURISDICTION_BLOCKED` | Deferred-market block; no legal approval inferred. |
| SC-021 | Contact jurisdiction is absent from the recipient snapshot | `COHORT_JURISDICTION_BLOCKED` | No contact-capable operation. |
| SC-022 | Contact is a synthetic U.S. business-role mailbox but suppression is `opt_out` | `COHORT_CONTACT_BLOCKED` | Handoff blocked; suppression remains dominant. |
| SC-023 | Contact is a synthetic U.S. named business email with suppression `unknown` | `COHORT_CONTACT_BLOCKED` | No fallback to clear; no handoff. |
| SC-024 | Contact class is `personal_email` and all other D-012 inputs are known | `COHORT_CONTACT_BLOCKED` | No research/draft/handoff for the personal point. |
| SC-025 | Contact is only a role hypothesis with no verified person/contact class | `COHORT_CONTACT_BLOCKED` | Research requires a permitted verified class; no recipient snapshot. |
| SC-026 | Tenant-uploaded contact lacks an authorization attestation | `COHORT_CONTACT_BLOCKED` | No recipient eligibility; candidate source remains non-permitted. |
| SC-027 | Business contact is 181 days stale against the D-012 180-day default | `COHORT_CONTACT_BLOCKED` | Reverification required; no handoff. |
| SC-028 | Draft contains an inferred compatibility claim without direct or corroborated evidence | `COHORT_CLAIM_BLOCKED` | Draft cannot advance to review approval. |
| SC-029 | Draft contains a regulatory claim with no current citation and domain review | `COHORT_CLAIM_BLOCKED` | Claim is blocked; no handoff artifact. |
| SC-030 | Draft contains a guaranteed savings/performance statement from a general description | `COHORT_CLAIM_BLOCKED` | Unsupported claim is rejected; no silent softening. |
| SC-031 | Draft contains a customer-identity or incumbent claim based on a role guess | `COHORT_CLAIM_BLOCKED` | Personalization/relationship claim is blocked. |
| SC-032 | Draft has approved business evidence, but the selected channel lacks jurisdiction authorization | `COHORT_CHANNEL_BLOCKED` | No draft release or copy/export. |
| SC-033 | Approved package requests copy/export without a human member approval | `COHORT_APPROVAL_REQUIRED` | No handoff attempt release. |
| SC-034 | Approved package requests a live CRM write under D-017 launch scope | `COHORT_INTEGRATION_DISABLED` | No CRM credential, webhook, or network call. |
| SC-035 | Exact approved package passes D-012/D-013 and requests controlled copy/export | `COHORT_HANDOFF_NOT_SEND` | Immutable artifact/handoff record only; no transport state. |
| SC-036 | Same handoff idempotency key and same input hash is replayed | `COHORT_HANDOFF_NOT_SEND` | Original result returned; no duplicate artifact. |
| SC-037 | Same handoff idempotency key is submitted with a different input hash | `COHORT_IDEMPOTENCY_CONFLICT` | Conflict audit only; no second release. |
| SC-038 | Design-partner activation is requested immediately after document acceptance with no invitation/opt-in | `COHORT_ENROLLMENT_NOT_AUTHORIZED` | No real tenant enrollment. |
| SC-039 | Design-partner proposal requests a fourth tenant over the proposed cap of three | `COHORT_CAP_EXCEEDED` | No candidate activation or partial reservation. |
| SC-040 | Design-partner proposal has no actual Privacy/Legal individual assigned | `COHORT_OWNER_UNASSIGNED` | Remains pending; no contact activation. |
| SC-041 | Design-partner candidate has tenant eligibility but no support runbook or staffed coverage | `COHORT_SUPPORT_NOT_READY` | No live cohort activation. |
| SC-042 | Paid activation is requested while the current paid cap is zero | `COHORT_CAP_EXCEEDED` | Paid live remains zero. |
| SC-043 | Paid activation has owner assignments and support readiness but no D-015 golden-set result | `COHORT_D015_GATE_MISSING` | No paid transition. |
| SC-044 | Paid activation has D-015 results but no authoritative Postgres isolation evidence | `COHORT_ISOLATION_EVIDENCE_MISSING` | No paid transition; SQLite evidence is insufficient. |
| SC-045 | Paid activation has isolation evidence but no Privacy/Legal approval for the U.S. channel | `COHORT_APPROVAL_REQUIRED` | No contact or handoff activation. |
| SC-046 | Active cohort exceeds its account cap by one record | `COHORT_CAP_EXCEEDED` | Whole operation rejected; no partial account import. |
| SC-047 | Active cohort receives a cross-tenant export row | `COHORT_SCOPE_FAIL` | Entire artifact rejected; no partial row success. |
| SC-048 | Active cohort source terms are revoked after a draft is approved | `COHORT_SOURCE_BLOCKED` | Approval/artifact becomes unusable; no release. |
| SC-049 | Active cohort suppression changes to `hard_bounce` before handoff | `COHORT_CONTACT_BLOCKED` | Approval invalidated; no release. |
| SC-050 | Active cohort receives a prompt-injection instruction inside a tenant document to approve/send | `COHORT_CLAIM_BLOCKED` | Document is untrusted data; no approval or transport. |
| SC-051 | D-015 unsupported-claim escape threshold is violated in a live review sample | `COHORT_KILLED` | Affected cohort is suspended; evidence preserved. |
| SC-052 | Cross-tenant read is detected in an active cohort | `COHORT_KILLED` | Freeze affected scope; incident and rollback path start. |
| SC-053 | Kill switch is invoked after an unapproved connector request | `COHORT_KILLED` | Connector is disabled; no retry or external call. |
| SC-054 | Rollback invalidates pending approvals and preserves suppression/audit history | `COHORT_ROLLBACK_COMPLETE` | No artifact released; history remains append-only. |
| SC-055 | Suspended cohort presents complete recovery evidence but owner assignment expired | `COHORT_OWNER_UNASSIGNED` | Remains suspended; no reactivation. |
| SC-056 | Recovered cohort requests a new jurisdiction without expansion evidence | `COHORT_JURISDICTION_BLOCKED` | Prior scope remains bounded; no new-market operation. |
| SC-057 | Cohort state event repeats with the same event identity and input hash | `COHORT_REPLAY_SAME_INPUT` | Original durable result returned; no duplicate transition or side effect. |
| SC-058 | Cohort state event repeats with the same event identity and a different input hash | `COHORT_IDEMPOTENCY_CONFLICT` | Conflict is audited; state is unchanged. |
| SC-059 | External caller asks whether a foreign account is enrolled in the paid cohort | `COHORT_NOT_FOUND_OR_FORBIDDEN` | No enrollment existence disclosure. |
| SC-060 | Account-only report requests contact fields under a no-contact fixture mask | `COHORT_DATA_CLASS_BLOCKED` | Deterministic redaction or rejection; no contact leak. |

## 16. Success metrics linkage

The cohort contract makes PRD metrics measurable without converting them into permission to expand:

| PRD metric area | Cohort measure | Required slice and guard |
|---|---|---|
| Activation and understanding | Time from authorized fixture/tenant material to approved business understanding; material-claim citation resolution; questions answered and uncertainty reduction; correction/unknown rate | Break down by tenant, fixture version, source, data class, and play; unknown must remain visible. |
| Discovery and quality | Candidate-to-qualified-account rate; top-account precision; reviewer agreement; duplicate/merge error; stale-evidence rate; source yield | Use synthetic benchmark first; report legal-entity and relationship ambiguity separately; do not auto-merge from similarity. |
| Revenue workflow | Research-brief/draft approval; contact-use rejection; opt-out/bounce blocks; time from qualified account to approved next action | Contact metrics remain zero/unmeasured for internal and current paid state; no denominator is fabricated. |
| Trust and operations | Cross-tenant test pass rate; unsupported-claim escape; citation resolution; freshness; worker/retry/dead-letter; p95; cost; human override/learning approval | D-015 thresholds and owners are recorded before activation; a missing metric is a gate failure, not a pass. |
| Cohort safety | Cap utilization, source blocks, jurisdiction blocks, policy blocks, kill events, rollback duration, support response, duplicate durable side effects | Track by cohort version and stable result code; cap counts cannot be hidden by sampling. |

No metric authorizes a new jurisdiction, contact class, source, channel, claim, tenant, or paid seat. Expansion still requires the evidence and approval record in Section 9.1.

## 17. Acceptance checklist

Parent acceptance of D-016 should verify:

- [x] Status records local parent acceptance while explicitly preserving every activation blocker.
- [x] The first segment is evidence-rich B2B organizations selling complex technical products through relationship-led sales.
- [x] Industrial specialty chemicals is the calibration benchmark with the required product and target-account examples, and is explicitly not a product limitation.
- [x] The initial jurisdiction envelope is U.S. B2B business-account research with approved public/licensed/tenant-provided business data.
- [x] State/local and channel rules are policy inputs; Canada, EU/EEA, UK, and all other jurisdictions fail closed for contact use/outreach until explicit approval.
- [x] Document acceptance does not enroll a design partner or authorize live contact research, handoff, outreach, provider, or production action.
- [x] Automatic sending is explicitly absent and D-017 artifact-only handoff is preserved.
- [x] Internal, design-partner, and paid cohorts have numeric caps and independent entry/exit gates; paid live is zero until D-015, owners, security/privacy/legal, support, and isolation evidence pass.
- [x] Accountable Product, Engineering/Security, Privacy/Legal, and Support/Operations roles are named, while actual individual assignment remains an activation prerequisite.
- [x] Tenant eligibility, source/data-class/jurisdiction/channel/claim/expansion evidence is explicit.
- [x] Personal enrichment, consumer outreach, minors, sensitive traits, high-risk regulated sectors/claims, prohibited sources, unapproved states/channels, scraping, and evasion are excluded.
- [x] Benchmark fixtures contain no real company names, people, contact points, customer data, or enrollment.
- [x] State machine, kill criteria, rollback, non-enumerating failures, stable result codes, idempotency, and scope invariants are explicit.
- [x] At least 32 unique deterministic scenarios exist; this contract contains 60.
- [x] Success metrics link to PRD measures without inventing denominators or treating metrics as expansion permission.
- [x] Mechanical checks pass: UTF-8 without BOM, final newline, no trailing whitespace, scenario count, and one-file diff scope.

## 18. Open assumptions and activation blockers

These are explicit assumptions or blockers, not hidden defaults:

1. The parent conductor accepted this local contract; that acceptance does not activate a cohort or satisfy any live gate.
2. D-015 will provide calibrated golden sets, quality thresholds, denominators, and approvers; this contract does not invent missing thresholds.
3. Legal/privacy will determine the applicable U.S. state/local, source, data-class, lawful-basis, consent, retention, and channel requirements before live contact use.
4. D-010's current implementation-capable source cards do not imply live multi-tenant activation; each source remains subject to its source-card checklist and kill behavior.
5. D-012 and D-013 remain authoritative if a future implementation attempts to reuse these cohort codes for contact or handoff decisions.
6. D-017 remains the launch integration boundary until a separate CRM/provider decision is accepted; no CRM is required for cohort completion.
7. Postgres-authoritative tenant isolation evidence is required for paid live activation; local SQLite compatibility is not evidence of production isolation.
8. Actual individuals, budgets, support coverage, security review, retention/deletion owners, and rollback owners must be assigned in the activation record; role labels in this document are insufficient.
9. Synthetic benchmark success does not prove legal compliance, provider terms compliance, customer value, deliverability, or production readiness.
10. If any assumption changes, the cohort version must be revised and the affected state re-evaluated; prior approval does not carry forward silently.

Until these blockers are resolved, safe local tenant/knowledge/strategy implementation and synthetic/authorized fixture work may continue, while live contact use, real enrollment, handoff activation, outreach transport, paid live operation, and external actions remain blocked.
