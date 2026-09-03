# Contact permitted-use, consent, and suppression policy (D-012)

**Decision:** D-012 - Approve contact permitted-use, consent, and suppression policy
**Status:** Parent-conductor accepted local implementation contract; legal/privacy approval, non-U.S. jurisdictions, and production activation remain gated.
**Task owner:** Task worker (documentation-only)
**Date:** 2026-07-27
**Dependencies:** Accepted D-001, D-002, D-010, and D-011 contracts; `docs/decisions/implementation-authority.md`; and the PRD. D-014, D-015, and D-016 are downstream lifecycle, calibration, and launch gates rather than prerequisites for this contract.

## 1) Purpose and boundaries

D-012 defines deterministic policy gates for whether Nova Trade may:

1. research a contact candidate,
2. generate an approved outreach draft for that contact,
3. hand off approved recipient/content for copy/export, and
4. run administrative/report exports.

This policy governs research and preparation eligibility only. It does not authorize outreach transport.

No automatic send exists in this document or this task.

## 2) Accurate current state vs proposed target state

### 2.1 Current state (repo evidence)

Current app artifacts do not separate:

- tenant-provided vs externally sourced contacts,
- role hypotheses vs verified person-level identity,
- suppression from attestation/legal gating,
- suppression from channel/jurisdiction/purpose checks,
- copy/export handoff decisions from admin/report export decisions.

Observed legacy compatibility surfaces include:

- `src/lib/db/schema.ts` lead/contactability and legacy `outreach_events`,
- copy/preview workflows in current workbench logic,
- admin request/export-like operations without policy-vetted suppressive precedence,
- no first-class suppression table with machine-typed outcomes for D-012.

### 2.2 Proposed target for this task

This task defines:

- explicit typed policy vectors with separate epistemic and suppression dimensions,
- deterministic evaluator ordering for every operation,
- suppression precedence and precedence-consistent merges,
- three distinct copy/export operation classes (not conflated),
- concrete implementation contracts for strict handoff idempotency,
- migration boundary for future implementation work.

## 3) Typed policy dimensions (separation is mandatory)

### 3.1 Epistemic state enum (`EpistemicState`)

These describe **input knowledge quality only**, never permission outcomes:

`KNOWN`, `UNKNOWN`, `CONFLICTED`, `STALE`, `NA`

Epistemic state applies per dimension (`source_auth`, `jurisdiction`, `attestation`,
`freshness`, `lawful_basis`, `channel_authorization`, etc.).

### 3.2 Contact-point class enum (`ContactPointClass`)

- `business_role_mailbox`
- `named_business_email`
- `business_switchboard`
- `personal_email`
- `personal_mobile`
- `unknown`

### 3.3 Suppression disposition enum (`SuppressionDisposition`)

- `clear`
- `opt_out`
- `do_not_contact`
- `complaint`
- `hard_bounce`
- `soft_bounce`
- `deletion_pending`
- `deleted_tombstone`
- `source_prohibited`
- `conflicted`
- `unknown`

`SuppressionDisposition` is independent from `EpistemicState`.

`clear` is the only suppressive state that can continue an operation gate. `unknown` and
`conflicted` are non-permissive and must fail closed.

### 3.4 Operation enum (`OperationCode`)

- `research`
- `draft`
- `outreach_copy_export_handoff`
- `admin_export`
- `report_account_export_no_contact_points`

### 3.5 Required decision vectors

Every decision input includes at minimum:

```
{
  operation: OperationCode,
  tenant_id: string,
  workspace_id?: string,
  contact_point_class: ContactPointClass,
  suppression_disposition: SuppressionDisposition,
  epistemic: {
    source_policy: EpistemicState,
    jurisdiction: EpistemicState,
    attestation: EpistemicState,
    identity: EpistemicState,
    freshness: EpistemicState,
    channel_authorization: EpistemicState,
    legal_basis: EpistemicState,
    consent_signal: EpistemicState
  },
  source_connector: string,
  purpose: "discovery" | "qualification" | "draft" | "outreach_handoff" | "internal_export" | string,
  channel?: string,
  idempotency_key?: string,
  input_hash?: string,
  policy_version: string
}
```

## 4) Source/jurisdiction/attestation and consent semantics

### 4.1 Source authorization and unknown handling

Research, draft, and outreach handoff use source authorization as hard gate inputs:

- If `source_policy` is anything except explicit `KNOWN`, treat as blocked.
- If D-010 marks the source connector/operation as disallowed, return blocked.
- `source_prohibited` suppression must always dominate operation outcome for all relevant operations.

### 4.2 Distinguish legal-basis dimensions

- `attestation` is a required evidence dimension for tenant governance, not a legal basis.
- `lawful_basis` is separate and may be e.g. contractual/public-interest/policy-approved internal reason.
- `consent_signal` is conditional and channel/jurisdiction-dependent:
  - When consent is required, `consent_signal` must be `KNOWN`.
  - When consent is not required, `consent_signal` must be `NA`.
  - `UNKNOWN|CONFLICTED|STALE` blocks only when consent is required.
  - `consent_signal` is never a generic substitute for lawful basis.

Attestation and lawful-basis resolution are separate:
- `attestation == KNOWN` is required for tenant governance.
- lawful-basis resolution must be explicit (`KNOWN`) and is not interchangeable with attestation.

## 5) Tenant-provided contacts and personal contact handling

Tenant upload creates a candidate source record, not an allowed recipient.

- Tenant-uploaded `email/phone/name` never auto-authorizes outreach.
- Named business email and business role mailboxes can be approved only after source/attestation/jurisdiction/channel checks pass.
- `personal_email` and `personal_mobile` are never eligible for handoff in default launch policy.
- Any conversion to personal-use mode requires explicit future legal/prod override.

## 6) Policy constants (provisional launch defaults, versioned)

These values are launch defaults for implementation and **not legal truth claims**:

- policy version: `d012_v2026_07_27_02`
- `contact_observation_freshness_days_for_research = 365`
- `contact_business_point_staleness_days = 180`
- `draft_readiness_freshness_days = 90`
- `handoff_content_freshness_days = 30`
- `soft_bounce_recovery_after_days = 14` (policy threshold; can be adjusted by future D-015 quality calibration)
- `quiet_hours_default = 21:00-08:00` (recipient local timezone; enforced at handoff planning stage)
- `handoff_frequency_cap_per_contact_per_day = 3`
- `allowed_handoff_hours_per_day = 10`

If required policy values are missing/malformed, fail closed.

## 7) Suppression precedence and dominance

1. `hard_bounce`
2. `deleted_tombstone`
3. `deletion_pending`
4. `do_not_contact`
5. `complaint`
6. `opt_out`
7. `source_prohibited`
8. `conflicted`
9. `unknown`
10. `soft_bounce`
11. `clear`

Dominance rules:

- `clear` is the only state that may pass suppression gates.
- Every non-`clear` disposition blocks by default, including `soft_bounce`, `conflicted`, and `unknown`.
- `soft_bounce` blocks draft and handoff by default until re-verification threshold logic executes.
- Most-restrictive ordering never treats `unknown` as less restrictive than `clear`.

## 8) Cross-cutting fail-closed preconditions (global order)

Apply this chain before recipient research, drafting, or outreach handoff logic:

1. malformed input and malformed values -> invalid operation
2. scope boundary mismatch / cross-tenant selector error -> scope block
3. role/action permission failure -> permission block
4. role hypothesis mismatch -> block if operation requires person-level contact point verification
5. source connector precheck failure -> source block
6. jurisdiction fail (including unknown/unapproved/missing/expired) -> jurisdiction block
7. attestation failure -> attestation block
8. suppression effective state from precedence -> suppression block
9. channel/frequency/quiet-hour rule check for handoff only
10. freshness check for operations where required

No step may be skipped and no defaults may be inferred.

Administrative and account-report exports apply scope, permission, purpose, retention, and field-mask checks first. Their own evaluators may include a minimum protective tombstone or redacted record for an authorized administrative purpose; they never use this exception to produce a recipient handoff or expose a prohibited contact point.

## 9) Deterministic operation evaluators

All evaluators are pure functions: deterministic input vector -> deterministic output.

### 9.1 Research evaluator (`research`)

#### Required fields

`tenant_id`, `operation`, `contact_point_class`, `suppression_disposition`, `epistemic`, `source_connector`,
`jurisdiction`, `purpose`, `policy_version`, `input_hash`.

#### Ordered decision rules

1. Run cross-cutting preconditions.
2. If `source_policy != KNOWN` -> `RESEARCH_BLOCKED_SCOPE`.
3. If `jurisdiction != KNOWN` -> `RESEARCH_BLOCKED_SCOPE`.
4. If `attestation == UNKNOWN|CONFLICTED|STALE|NA` -> `RESEARCH_BLOCKED_SCOPE`.
5. Resolve suppression:
   - any non-`clear` suppression -> `RESEARCH_BLOCKED_SUPPRESSED`.
   - `clear` -> continue.
   - `unknown`, `conflicted`, or any non-clear status -> `RESEARCH_BLOCKED_SUPPRESSED`.
6. If `contact_point_class == unknown` and no alternative verified class is available in same tuple -> `RESEARCH_REQUIRES_CONTACTPOINT`.
7. If `contact_point_class` in {`personal_email`,`personal_mobile`} -> `RESEARCH_BLOCKED_PERSONAL_POINT`.
8. If `freshness == STALE` -> `RESEARCH_REVIEW_STALE`.
9. If `identity == CONFLICTED` -> `RESEARCH_REVIEW_CONFLICT`.
10. If checks pass -> `RESEARCH_ALLOWED`.

#### Research outputs

- `RESEARCH_ALLOWED`
- `RESEARCH_REQUIRES_CONTACTPOINT`
- `RESEARCH_REVIEW_STALE`
- `RESEARCH_REVIEW_CONFLICT`
- `RESEARCH_BLOCKED_SCOPE`
- `RESEARCH_BLOCKED_PERSONAL_POINT`
- `RESEARCH_BLOCKED_SUPPRESSED`
- `RESEARCH_BLOCKED_MALFORMED`

### 9.2 Draft evaluator (`draft`)

#### Required fields

All research fields plus: `research_decision_code`, `human_approval_context`, `channel`,
`attestation`, `lawful_basis`, `consent_signal`, `channel_requires_consent`,
`consent_required_reason`, `recipient_verification_state`.

`draft` must capture intended `channel` and optionally `planned_handoff_at`/`recipient_timezone` for downstream handoff scheduling.

#### Ordered decision rules

1. Run cross-cutting preconditions.
2. Require `research_decision_code == RESEARCH_ALLOWED`; else `DRAFT_BLOCKED_NO_RESEARCH`.
3. If suppression effective position 1-11 -> `DRAFT_BLOCKED_SUPPRESSED`.
4. If `channel_authorization != KNOWN` -> `DRAFT_BLOCKED_CHANNEL`.
5. If `attestation != KNOWN` -> `DRAFT_BLOCKED_ATT`.
6. If `lawful_basis != KNOWN` -> `DRAFT_BLOCKED_LEGAL`.
7. Consent handling:
   - If `channel_requires_consent == true` and `consent_signal != KNOWN` -> `DRAFT_BLOCKED_LEGAL`.
   - If `channel_requires_consent == false` and `consent_signal != NA` -> `DRAFT_BLOCKED_LEGAL`.
8. If `contact_point_class` in personal classes -> `DRAFT_BLOCKED_PERSONAL_POINT`.
9. If `freshness in {STALE, UNKNOWN}` -> `DRAFT_REVIEW_STALE`.
10. If checks pass -> `DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF`.

#### Draft outputs

- `DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF`
- `DRAFT_BLOCKED_NO_RESEARCH`
- `DRAFT_BLOCKED_SUPPRESSED`
- `DRAFT_BLOCKED_CHANNEL`
- `DRAFT_BLOCKED_ATT`
- `DRAFT_BLOCKED_LEGAL`
- `DRAFT_BLOCKED_PERSONAL_POINT`
- `DRAFT_REVIEW_STALE`

Draft creation is time-of-day independent; quiet-hour and frequency constraints are enforced at handoff only.

### 9.3 Outreach copy/export handoff evaluator (`outreach_copy_export_handoff`)

#### Required fields

All draft fields plus:
`approved_draft_id`, `approved_version_hash`, `approved_recipient_snapshot_id`, `hmac_subject_hash`,
`recipient_contact_point_class`, `planned_handoff_at`, `recipient_timezone`, `frequency_counter`,
`idempotency_key`, `input_hash`.

#### Ordered decision rules

1. Run cross-cutting preconditions and draft-specific fields.
2. Validate `approved_draft_id` + version hashes; mismatch -> `HANDOFF_BLOCKED_SCOPE`.
3. Run idempotency:
   - same `idempotency_key` + same `input_hash` -> same durable decision output and no repeated side effect.
   - same `idempotency_key` + different `input_hash` -> `HANDOFF_BLOCKED_IDEMPOTENCY_CONFLICT`.
4. If suppression effective position 1-11 -> `HANDOFF_BLOCKED_SUPPRESSED`.
5. Require `recipient_contact_point_class` in
   {`business_role_mailbox`,`named_business_email`,`business_switchboard`}; personal classes -> `HANDOFF_BLOCKED_PERSONAL_POINT`.
6. Require `channel_authorization == KNOWN` and channel permitted by jurisdiction -> if not, `HANDOFF_BLOCKED_LEGAL`.
7. Evaluate lawful basis and consent with the same consent-channel logic as draft.
8. Apply quiet-hour/frequency gate for planned handoff:
   - evaluate quiet window with `planned_handoff_at` and `recipient_timezone`.
   - enforce frequency cap with `frequency_counter`.
   - breach -> `HANDOFF_BLOCKED_RATE_OR_QUIET`.
9. If all checks pass -> `HANDOFF_ALLOWED`.

#### Handoff outputs

- `HANDOFF_ALLOWED`
- `HANDOFF_BLOCKED_SCOPE`
- `HANDOFF_BLOCKED_IDEMPOTENCY_CONFLICT`
- `HANDOFF_BLOCKED_SUPPRESSED`
- `HANDOFF_BLOCKED_PERSONAL_POINT`
- `HANDOFF_BLOCKED_LEGAL`
- `HANDOFF_BLOCKED_RATE_OR_QUIET`

Important: no separate `COPY_ALLOWED_NO_CONTACT` output exists in this policy.

### 9.4 Administrative export evaluator (`admin_export`)

#### Required fields

`tenant_scope`, `actor_permission`, `export_purpose`, `requested_fields`, `sensitivity_profile`,
`include_contact_points` (boolean).

#### Ordered decision rules

1. Cross-cutting scope and permission preconditions.
2. Validate purpose in allowed export set.
3. If unsupported purpose -> `ADMIN_EXPORT_REJECTED_PURPOSE`.
4. If rows include suppressed records -> include redacted fields or tombstones.
5. If `include_contact_points = true` and field mask requests forbidden contact fields, apply deterministic
   redaction or explicit field-mask rejection:
   - redaction -> `ADMIN_EXPORT_ALLOWED_REDACTED`
   - explicit disallowed mask -> `ADMIN_EXPORT_REJECTED_PURPOSE`
6. If sensitivity profile == restricted -> `ADMIN_EXPORT_ALLOWED_REDACTED`.
7. Else `ADMIN_EXPORT_ALLOWED`.

### 9.5 Report/account export without recipient points (`report_account_export_no_contact_points`)

#### Required fields

`tenant_scope`, `report_scope`, `field_mask`, `caller_role`, `include_suppression`.

#### Ordered decision rules

1. Scope permissions.
2. Validate `field_mask` for forbidden recipient-contact keys.
3. If `field_mask` contains forbidden recipient-contact keys without report-specific allowed override -> `REPORT_EXPORT_ALLOWED_REDACTED`.
4. If suppression requires account-only lock and purpose is recipient-bound -> `REPORT_EXPORT_BLOCKED_SCOPE`.
5. Else `REPORT_EXPORT_ALLOWED`.

## 10) Idempotency and concurrency (concurrency/idempotency)

Idempotency rule is exact:

- same `idempotency_key` + same `input_hash` returns the same durable code and same audit record; no duplicate mutation side effects.
- same `idempotency_key` + different `input_hash` is a deterministic conflict and returns
  `HANDOFF_BLOCKED_IDEMPOTENCY_CONFLICT`.
- concurrent colliding writes must not produce last-write-wins side effects; conflict or stale decision state must be explicit.

## 11) Merge/unmerge behavior (D-011 consistent)

Most restrictive protection wins across merged identities:

- merge cannot clear suppression/disposition or re-enable blocked operations.
- provenance and suppression history are retained.
- unmerge preserves all source and suppression provenance; tombstones cannot be removed.
- if either side has blocking suppression, merged state remains blocked.

## 12) Delete/purge and retention handoff

Deletion and purge cannot recreate eligibility.

- minimum immutable protective evidence required by D-014 (including redacted tombstones and audit trail) remains.
- suppression history and reason codes cannot be silently dropped.
- derived permissions cannot be inferred from non-authoritative records after purge.

## 13) API domain result schema and error/domain mapping

Standard result shape:

```json
{
  "operation": "research|draft|outreach_copy_export_handoff|admin_export|report_account_export_no_contact_points",
  "policy_version": "d012_v2026_07_27_02",
  "result": {
    "code": "...",
    "reason": "...",
    "required_fields_missing": [],
    "effective_epistemics": {
      "source_policy": "KNOWN|UNKNOWN|... ",
      "jurisdiction": "KNOWN|UNKNOWN|..."
    },
    "effective_disposition": "clear|opt_out|...",
    "cache": {
      "decision_cache_key": "d012|tenant_id|workspace_id|contact_id|operation|hash:v2",
      "version_state": "policy_version|jurisdiction_set|source_allowlist|attestation_set|suppression_epoch",
      "eligible_for_reuse": true|false
    }
  },
  "audit": {
    "event_code": "D012_DECISION",
    "correlation_id": "",
    "input_hash": "",
    "idempotency_key": ""
  }
}
```

Interpretation:
- `eligible_for_reuse` may be `true` only when suppression/jurisdiction/source/version state matches exactly.
- allowed research/draft/handoff outputs **must** be re-evaluated when any of `policy_version`, source allowlist, suppression state, or contact proof graph changes.
- if a cache hint exists for denied results, it is valid only within the same immutable decision record and must be invalidated on any protective mutation (suppression/source/jurisdiction/policy/contact).
- handoff decisions must re-evaluate in the same transaction before copy/export handoff execution.

Result-code families:

- `RESEARCH_ALLOWED`
- `RESEARCH_REQUIRES_CONTACTPOINT`
- `RESEARCH_REVIEW_STALE`
- `RESEARCH_REVIEW_CONFLICT`
- `RESEARCH_BLOCKED_SCOPE`
- `RESEARCH_BLOCKED_MALFORMED`
- `RESEARCH_BLOCKED_PERSONAL_POINT`
- `RESEARCH_BLOCKED_SUPPRESSED`
- `DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF`
- `DRAFT_BLOCKED_NO_RESEARCH`
- `DRAFT_BLOCKED_SUPPRESSED`
- `DRAFT_BLOCKED_ATT`
- `DRAFT_BLOCKED_CHANNEL`
- `DRAFT_BLOCKED_LEGAL`
- `DRAFT_BLOCKED_PERSONAL_POINT`
- `DRAFT_REVIEW_STALE`
- `HANDOFF_ALLOWED`
- `HANDOFF_BLOCKED_SCOPE`
- `HANDOFF_BLOCKED_IDEMPOTENCY_CONFLICT`
- `HANDOFF_BLOCKED_SUPPRESSED`
- `HANDOFF_BLOCKED_PERSONAL_POINT`
- `HANDOFF_BLOCKED_LEGAL`
- `HANDOFF_BLOCKED_RATE_OR_QUIET`
- `ADMIN_EXPORT_ALLOWED`
- `ADMIN_EXPORT_ALLOWED_REDACTED`
- `ADMIN_EXPORT_REJECTED_PURPOSE`
- `REPORT_EXPORT_ALLOWED`
- `REPORT_EXPORT_BLOCKED_SCOPE`
- `INVALID_INPUT`
- `PERMISSION_DENIED`
- `SCOPE_FAIL`

Transport mapping:

- suppression/policy deny -> `403`
- stale / mutation conflict (including idempotency conflict) -> `409`
- malformed / malformed payload -> `400`
- not found / absent or foreign object -> `404`
- allowed output -> `200`

## 14) Channel and source constraints

- Quiet window and frequency are independent hard gates for handoff only.
- Source terms uncertainty is a hard stop.
- Prompt injection in policy fields is malformed input.
- role-mailbox contact points are allowed only for operational class rules tied to class verification.

## 15) Audit trail requirements

Every denied or allowed policy decision that changes workflow state must append one immutable audit row containing:

- `event_id`, `tenant_id`, `operation`, `actor_id`, `requester_layer`, `policy_version`,
  `result_code`, `effective_disposition`, `effective_epistemics`, `input_hash`,
  `idempotency_key`, `suppression_trace`, `jurisdiction`, `channel`, `timestamp`.

- For suppressed decisions, suppression reason and governing rule IDs are recorded.
- Export redaction actions keep tombstone and reason evidence references.

## 16) Migration boundary

This document does not include:

- schema migrations,
- implementation code,
- network/provider calls,
- database writes,
- outreach transport, or
- deletion automation.

Migration boundary for D-012 is implementation contracts, not runtime behavior.

## 17) Implementation handoff for next workers

Implementation must be pure and ordered:

- typed enums for every dimension in section 3 and section 12.2.1,
- pure evaluators per operation,
- shared suppression-resolution function,
- deterministic result-code mapping,
- test fixture generation from scenario matrix.

Avoid any "documentation-only test" task language in implementation handoff.

### 17.1 Pseudo-types

```ts
type DecisionInput = {
  operation: "research" | "draft" | "outreach_copy_export_handoff" | "admin_export" | "report_account_export_no_contact_points";
  tenantId: string;
  workspaceId?: string;
  contactPointClass: ContactPointClass;
  suppressionDisposition: SuppressionDisposition;
  epistemic: {
    sourcePolicy: EpistemicState;
    jurisdiction: EpistemicState;
    attestation: EpistemicState;
    identity: EpistemicState;
    freshness: EpistemicState;
    channelAuthorization: EpistemicState;
    lawfulBasis: EpistemicState;
    consentSignal: EpistemicState;
  };
  sourceConnector: string;
  purpose: string;
  jurisdiction: string;
  channel?: string;
  idempotencyKey?: string;
  inputHash?: string;
  researchDecisionCode?: string;
};

function evaluateDecision(input: DecisionInput): DecisionResult; // pure deterministic
```

### 17.2 Invariants to enforce

- deterministic output for identical input,
- no hidden defaults,
- no `KNOWN` meaning suppression,
- unknown `source/jurisdiction/attestation` never maps to allowed,
- suppression precedence is always dominant,
- same-key same-hash idempotency replay is durable;
- same-key different-hash conflict is never mutating.

### 17.3 Test-generation requirements

- Use scenario rows as machine-readable fixtures.
- each row maps to exactly one expected result.
- assertions:
  - same input -> same result,
  - suppression precedence dominates non-suppression checks,
  - unknown/blocked scope/jurisdiction/source/attestation remain blocked,
  - idempotency conflict deterministic,
  - personal classes never reach handoff.

## 18) Scenario matrix (>= 28 deterministic rows)

`contact_class` and `suppression_disposition` are explicit in each row; outputs are aligned to evaluator order. Unless a row highlights an exception, every other required field is present, current, authorized, and valid.

| # | Operation | Contact class | Suppression disposition | Epistemic highlights | Example | Expected result |
|---|---|---|---|---|---|---|
| S01 | research | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, source_terms=KNOWN | Tenant-uploaded named procurement email from validated domain | RESEARCH_ALLOWED |
| S02 | research | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN | Public role mailbox `procurement@` from approved source | RESEARCH_ALLOWED |
| S03 | research | business_switchboard | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN | Tenant-uploaded switchboard with website-confirmed business point | RESEARCH_ALLOWED |
| S04 | research | unknown | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN | Class unresolved until enrichment/inspection | RESEARCH_REQUIRES_CONTACTPOINT |
| S05 | research | personal_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN | Candidate appears in internal note but personal Gmail | RESEARCH_BLOCKED_PERSONAL_POINT |
| S06 | research | personal_mobile | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN | Personal mobile appears on uploaded list | RESEARCH_BLOCKED_PERSONAL_POINT |
| S07 | research | business_role_mailbox | source_prohibited | source=KNOWN, attn=KNOWN, juris=KNOWN | Source terms forbid this connector/term combination | RESEARCH_BLOCKED_SUPPRESSED |
| S08 | research | named_business_email | opt_out | source=KNOWN, attn=KNOWN, juris=KNOWN | Metalworking-fluid distributor explicitly opted out | RESEARCH_BLOCKED_SUPPRESSED |
| S09 | research | named_business_email | do_not_contact | source=KNOWN, attn=KNOWN, juris=KNOWN | Coatings buyer in tenant-level DNC flag list | RESEARCH_BLOCKED_SUPPRESSED |
| S10 | research | named_business_email | complaint | source=KNOWN, attn=KNOWN, juris=KNOWN | Complaint logged on previous outreach attempt | RESEARCH_BLOCKED_SUPPRESSED |
| S11 | research | named_business_email | soft_bounce | source=KNOWN, attn=KNOWN, juris=KNOWN | One soft bounce recorded | RESEARCH_BLOCKED_SUPPRESSED |
| S12 | research | named_business_email | hard_bounce | source=KNOWN, attn=KNOWN, juris=KNOWN | Hard-bounce threshold exceeded | RESEARCH_BLOCKED_SUPPRESSED |
| S13 | research | named_business_email | clear | source=KNOWN, attn=UNKNOWN, juris=KNOWN | Missing attestation for uploaded contact | RESEARCH_BLOCKED_SCOPE |
| S14 | research | named_business_email | clear | source=UNKNOWN, attn=KNOWN, juris=KNOWN | Source connector status unknown | RESEARCH_BLOCKED_SCOPE |
| S15 | research | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=UNKNOWN | Jurisdiction not approved for launch | RESEARCH_BLOCKED_SCOPE |
| S16 | research | named_business_email | unknown | source=KNOWN, attn=KNOWN, juris=KNOWN | External suppression state unresolved | RESEARCH_BLOCKED_SUPPRESSED |
| S17 | research | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=STALE | Contact last verified 400 days ago | RESEARCH_REVIEW_STALE |
| S18 | research | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, identity=CONFLICTED, freshness=KNOWN | Conflicting identity claims across sources | RESEARCH_REVIEW_CONFLICT |
| S19 | research | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, malformed payload | Malformed email token in request | RESEARCH_BLOCKED_MALFORMED |
| S20 | research | named_business_email | deletion_pending | source=KNOWN, attn=KNOWN, juris=KNOWN | Account deletion in progress | RESEARCH_BLOCKED_SUPPRESSED |
| S21 | draft | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, research=RESEARCH_ALLOWED | Approved research result for epoxy-resin maker procurement mailbox | DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF |
| S22 | draft | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, research=RESEARCH_ALLOWED | Valid role mailbox for floor-system buyer | DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF |
| S23 | draft | business_role_mailbox | unknown | source=KNOWN, attn=KNOWN, juris=KNOWN, research=RESEARCH_ALLOWED | suppression provenance unknown | DRAFT_BLOCKED_SUPPRESSED |
| S24 | draft | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, research=RESEARCH_ALLOWED, consent=UNKNOWN, legal=UNKNOWN | Missing lawful basis and consent for human-directed draft | DRAFT_BLOCKED_LEGAL |
| S25 | draft | personal_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, research=RESEARCH_ALLOWED | Personal email target for technical role | DRAFT_BLOCKED_PERSONAL_POINT |
| S26 | draft | named_business_email | do_not_contact | source=KNOWN, attn=KNOWN, juris=KNOWN, research=RESEARCH_ALLOWED | Tenant-level do_not_contact applied | DRAFT_BLOCKED_SUPPRESSED |
| S27 | draft | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=STALE, research=RESEARCH_ALLOWED | Stale freshness beyond 90 days | DRAFT_REVIEW_STALE |
| S28 | draft | business_switchboard | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=UNKNOWN, research=RESEARCH_ALLOWED | Missing freshness proof in scanner output | DRAFT_REVIEW_STALE |
| S29 | draft | business_switchboard | clear | source=KNOWN, attn=CONFLICTED, juris=KNOWN, research=RESEARCH_ALLOWED | Attestation conflict over role evidence | DRAFT_BLOCKED_ATT |
| S30 | draft | named_business_email | soft_bounce | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, research=RESEARCH_ALLOWED | Prior soft-bounce on same mailbox | DRAFT_BLOCKED_SUPPRESSED |
| S31 | outreach_copy_export_handoff | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, channel=EMAIL, research=RESEARCH_ALLOWED, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF, idempotency=keyA/ha | Same key + same hash repeated handoff | HANDOFF_ALLOWED |
| S32 | outreach_copy_export_handoff | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, channel=EMAIL, research=RESEARCH_ALLOWED, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF, idempotency=keyA/hb | Same key with different hash | HANDOFF_BLOCKED_IDEMPOTENCY_CONFLICT |
| S33 | outreach_copy_export_handoff | business_role_mailbox | complaint | source=KNOWN, attn=KNOWN, juris=KNOWN, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Complaint record exists for account | HANDOFF_BLOCKED_SUPPRESSED |
| S34 | outreach_copy_export_handoff | personal_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Handoff with personal email class | HANDOFF_BLOCKED_PERSONAL_POINT |
| S35 | outreach_copy_export_handoff | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=UNKNOWN, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Cross-border route missing jurisdiction allowlist | HANDOFF_BLOCKED_SCOPE |
| S36 | outreach_copy_export_handoff | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, planned_handoff_at=2026-08-01T10:00:00Z, recipient_timezone=UTC, freq=over_cap, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Frequency cap reached | HANDOFF_BLOCKED_RATE_OR_QUIET |
| S37 | outreach_copy_export_handoff | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, planned_handoff_at=2026-08-01T23:30:00Z, recipient_timezone=America/Denver, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Quiet-hour request window hit | HANDOFF_BLOCKED_RATE_OR_QUIET |
| S38 | outreach_copy_export_handoff | named_business_email | deleted_tombstone | source=KNOWN, attn=KNOWN, juris=KNOWN, draft=DRAFT_ALLOWED_PENDING_REVIEW_SIGNOFF | Contact row is tombstoned | HANDOFF_BLOCKED_SUPPRESSED |
| S39 | admin_export | named_business_email | opt_out | role=admin, fields include contacts, redaction=restricted | Opted-out account requested in admin export | ADMIN_EXPORT_ALLOWED_REDACTED |
| S40 | admin_export | named_business_email | clear | role missing export permission | Missing required admin permission | PERMISSION_DENIED |
| S41 | admin_export | named_business_email | clear | role=admin, unsupported export purpose | Unsupported purpose argument | ADMIN_EXPORT_REJECTED_PURPOSE |
| S42 | admin_export | named_business_email | source_prohibited | role=admin, fields mixed | Source-prohibited records requested | ADMIN_EXPORT_ALLOWED_REDACTED |
| S43 | report_account_export_no_contact_points | named_business_email | clear | tenant scope, field_mask includes account only | Account-only report with no contact fields | REPORT_EXPORT_ALLOWED |
| S44 | report_account_export_no_contact_points | named_business_email | clear | tenant scope, field_mask includes email phone | Field mask includes forbidden contact fields | REPORT_EXPORT_ALLOWED_REDACTED |
| S45 | report_account_export_no_contact_points | named_business_email | deleted_tombstone | account-only report but suppression policy enabled | Account row with tombstone and allowed scope | REPORT_EXPORT_ALLOWED |
| S46 | research | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, cross_tenant_subject=TRUE | Same id from different tenant due mapping error | RESEARCH_BLOCKED_SCOPE |
| S47 | draft | named_business_email | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, freshness=KNOWN, malformed email payload, research=RESEARCH_ALLOWED | Draft request contains malformed email token | INVALID_INPUT |
| S48 | outreach_copy_export_handoff | business_role_mailbox | clear | source=KNOWN, attn=KNOWN, juris=KNOWN, hmac mismatch, draft valid | Approved hash mismatch in handoff | HANDOFF_BLOCKED_SCOPE |
| S49 | research | named_business_email | unknown | source=KNOWN, attn=KNOWN, juris=KNOWN, purpose=unknown | Purpose classification missing | RESEARCH_BLOCKED_SCOPE |

## 19) Open blockers and explicit external dependencies

- D-015 quality calibration remains external; it does not set legal basis or jurisdiction policy.
- D-016 broader-jurisdiction/cross-cohort policy calibration and legal/privacy approvals remain explicitly external.
- Non-U.S. launch market permissions remain explicit blockers.
- Soft-bounce recovery details require separate activation decision.

No implementation, network, migration, outreach, provider, or production action is performed in this task.

## 20) Parent acceptance criteria for this revision

- Separate epistemic vectors and suppression dispositions with no cross-use.
- Unknown `source/jurisdiction/attestation` fail closed.
- Deterministic ordered evaluators for `research`, `draft`, `outreach_copy_export_handoff`, `admin_export`,
  and `report_account_export_no_contact_points`.
- idempotency replay/conflict rules are explicit and deterministic.
- Consent/lawful basis/attestation are distinct dimensions and enforced separately.
- Tenant-provided contacts require full gates before any recipient use.
- Personal contact enrichment remains blocked by default.
- 180/365/90/30-day values are explicit policy-versioned defaults only.
- deletion/purge rules retain immutable suppression and audit.
- scenario matrix has >=28 unique rows and explicit class/disposition vectors.
- No suggestion that automatic send exists.
