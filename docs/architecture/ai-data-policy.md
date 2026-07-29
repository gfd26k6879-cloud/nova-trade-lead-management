# Nova Trade AI-Data Policy (Task D-009)

**Task:** D-009 - Approve model/provider and tenant-data-use policy
**Status:** Parent-conductor accepted local implementation contract; live provider use and production activation remain blocked pending the evidence in Section 4.
**Parent scope:** `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`
**Date:** 2026-07-27
**Evidence source for this policy:** repository code/docs/tests under `nova-trade-lead-management`; no external account/configuration facts are asserted.

## 1) Purpose and production-safe default

This policy moves Nova Trade from local-website-only behavior toward multi-tenant lead intelligence while keeping tenant-data execution fail-closed until approval evidence exists.

The policy intentionally does **not** treat current repository behavior as production approval. It defines execution constraints and required evidence so the adapter can be implemented and tested safely with fixtures before any tenant-data activation.

## 2) Non-negotiables

- The local adapter target is the current `OpenAI Responses` pattern and identifier `gpt-5.4-mini` (exact).
- Live tenant-data provider execution is blocked until all required governance and provider/account evidence packages are verified.
- No silent fallback or provider-model substitution.
- Every failure must be explicit and deterministic (`outcome` + `result_code`).
- Tenant isolation is enforced at policy and model-call boundaries before any outbound call.

## 3) Ground-truth current-state inventory (code-backed)

- `src/lib/ai/config.ts`:
  - `OPENAI_LEAD_VERIFICATION_MODEL = "gpt-5.4-mini"`
  - `OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses"`
  - `assertAllowedOpenAIModel()` rejects any model != `gpt-5.4-mini`.
- `src/lib/ai/lead-verification.ts`, `src/lib/ai/lead-intelligence.ts`: OpenAI Responses payloads currently include `model: gpt-5.4-mini`, `store: false`, and request schema/tooling, with timeout cancellation controls in the route/worker stack.
- `src/lib/__tests__/ai-config.test.ts` and related tests currently lock the model and assert cost handling behavior, but do not verify provider-region/residency/retention details.
- `src/lib/db/schema.ts` default `ai_model` is `gpt-5.4-mini` for several AI artifact/verification records; this is a durable current behavior, not a verified live activation right.
- No repository evidence currently proves region, residency, retention policy, training usage, tool allowlist by contract, or legal/commercial authorization for tenant-data production calls.

## 4) Governance evidence required before production activation

No single stakeholder can approve all activation conditions. D-009 requires all of the following evidence classes before any tenant data may leave local fixtures:

- **Product governance evidence:** approved product contract and PRD-to-contract mapping for production model/provider usage.
- **Security governance evidence:** threat model, logging policy, abuse monitoring expectation, and key-management control.
- **Privacy governance evidence:** lawful basis, data minimization rules, suppression and handling for sensitive/personal data.
- **Legal governance evidence:** DPA/contract terms (if applicable), retention and deletion terms, and prohibited-output/regulatory restrictions.
- **Tenant governance evidence:** tenant policy for provider visibility, consent posture, audit requirements, and support workflows.

These are evidence classes, not implied approvals. Until each required set is present:
- the live provider state remains disabled (`AI_PROVIDER_DISABLED`),
- only fixture/local adapters and deterministic builders may execute,
- no production tenant data can be dispatched to a provider.

## 5) Data classification matrix

Each payload element handled by AI workloads must be tagged as one classification:

1. **Public business facts**: public websites, filings, public certifications.
2. **Tenant confidential business material**: uploaded PDFs, datasheets, catalog pages, internal notes.
3. **Unpublished product/technical data**: formulas, internal specifications, unreleased methods/process notes.
4. **Customer lists/account data**: account names/URLs/tags/sources, internal lead catalogs.
5. **Business contact/role data**: job-level role hypotheses, team structure signals, role maps.
6. **Personal/sensitive data**: personal email/mobile, private identity details.
7. **Credentials/secrets**: secrets, API tokens, passwords, bearer-like strings.
8. **Auth/security data**: internal auth/session identifiers, infra IDs.
9. **Malware/quarantined content**: scanned-suspect payloads, blocked binaries, hostile blobs.
10. **Audit/operational metadata**: request hashes, correlation tokens, policy version, run IDs, status codes.
11. **Prompts/model outputs**: prompt text, tool calls, summaries, confidence fields.

## 6) Data handling by classification (exact defaults)

- **Allowed-by-default under policy-compliant context:** Public business facts only.
- **Allowed with tenant-approved, workload-specific envelope:** Tenant confidential business material; unpublished product/technical data; customer/account data; business contact/role data; audit metadata.
- **Forbidden by default / always blocked from model payloads:** credentials/secrets, auth/security data, malware/quarantined content, raw cross-tenant content, and undocumented personal contact defaults.

Tenant confidential and unpublished materials are therefore **not categorically unusable**; they are disallowed unless approved workload-specific minimization and contract gates are met.

## 7) Agent workload envelopes (all required fields)

`tenant_id` and `workspace_id` are tenancy selectors and are **never prompt payload defaults**.

For each workload, the policy defines what may be sent, mandatory minimization/redaction, forbidden fields, and gates:

| Workload | May be sent to provider | Required minimization/redaction | Forbidden fields | Mandatory gates |
|---|---|---|---|---|
| Intake / extraction | source locator, parser mode, deterministic extraction config, content checksums, policy tag, request token | redact credentials, personal contacts, large raw blobs, malware indicators | secrets, raw personal contacts, raw tenant IDs (unless tokenized), quarantined bodies, raw cross-tenant data | D-010 source status, D-006 malware status, schema checks |
| Business-understanding synthesis | evidence IDs, uncertainty map, contradiction map, confidence intervals | no raw blobs, only evidence references, role-level summarization | unpublished formulas by default, unverified claims, personal contact points | D-008 evidence completeness, uncertainty policy |
| Question generation | adaptive uncertainty state, data gaps, play constraints | no raw customer lists unless reduced to question candidates | raw phone/email, unrestricted source bodies | D-012, review path for high-risk domains |
| ICP / play design | candidate segment IDs, disqualifier/rule set, play intent (versioned) | only features, exclusions, and thresholds | raw formulas/specs, raw internal strategy docs | product + security signoff for ICP model |
| Discovery planner | source connector IDs, query templates, legal filters, budget caps | bounded query templates, no direct credentials | credentials, forbidden domains, raw content bodies | D-010 connector policy, tenancy scope checks |
| Source worker | connector reference, allowed fields map, source config, policy evidence refs | no cross-tenant fields, no credentials, no secret strings | raw credentials, quarantined payload, disallowed source output | connector governance + source region/capability policy |
| Qualification / scoring | evidence references, freshness, confidence, conflict state | do not include full narratives or raw notes | personal contact details, unpublished raw extracts | stale evidence and conflict gates + D-008 citations |
| Contact / buying-center | account/contact role hypotheses, suppressions, confidence, source tags | role abstraction, confidence-only summaries | raw contact roles from sensitive lists, personal contact numbers/emails | D-012 suppression and tenant policy |
| Outreach drafting | approved claims, channel safety constraints, role hypotheses | no raw narrative dumps, no unsupported absolute claims | raw personal contacts, safety/medical/regulated claims without policy gates | manual outreach approval + evidence validation |
| Learning / reporting | aggregate signals, correction history, trend deltas | de-identified aggregates and tenant partitioning only | raw prompts/outputs, IDs that can reveal source user | retention policy + audit controls |
| Support / admin | policy actions, reason codes, request and result versions | pseudonymized actor IDs and policy versioning | prompts, raw tenant data, secrets | immutable audit chain and escalation path |

## 8) Registry model and state separation

- **Implementation allowlist:** OpenAI adapter target for local code/test execution; implementation can be verified with fixtures or mocks, but not live tenant execution.
- **Fixture provider:** deterministic local stub provider for unit/integration tests.
- **No-provider state:** explicit fail-closed mode used for production tenant data.

### 8.1 Provider registry required fields

Every provider row must carry:

- `provider`, `model`, `provider_version`
- `api_endpoint` (endpoint location only)
- `endpoint_region_hint` (if known, not assumed true)
- `processing_residency` (if verified, separate from endpoint)
- `contract_state` (`unverified` / `verified`) for product/security/privacy/tenant/legal terms
- `retention`, `training_policy`, `abuse_monitoring`
- `account_project_control_evidence`
- `allowed_classifications`, `disallowed_classifications`
- `limits` (`max_context_tokens`, `max_output_tokens`, `rate_limits`)
- `tool_capabilities` (tool/schema allowlist)
- `cost_controls` (kill-switch keys, run and tenant caps, review expiry)
- `evaluation_status`, `review_expiry`, `evaluator_owner`

Fields not yet evidenced must be `null`/`unknown`/`[]` exactly.

### 8.2 Registry rows

| Registry row | State | Endpoint | Notes |
|---|---|---|---|
| `openai/responses/gpt-5.4-mini` | implementation-only local/test target | `https://api.openai.com/v1/responses` | Not tenant-data live unless all evidence fields verified. |
| `fixture/openai_responses_stub` | local deterministic fixture | `local://stub/openai-responses` | Used for tests and adapters. |
| `null/disabled` | explicit no-provider hold | N/A | Blocks tenant-data dispatch. |

### 8.3 Runtime row example (unverified fields explicit)

```json
{
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "provider_version": null,
  "api_endpoint": "https://api.openai.com/v1/responses",
  "endpoint_region_hint": null,
  "processing_residency": null,
  "contract_state": {
    "product_approval": "unverified",
    "security_approval": "unverified",
    "privacy_approval": "unverified",
    "tenant_approval": "unverified",
    "legal_approval": "unverified",
    "account_control": "unverified"
  },
  "retention": {
    "destination": null,
    "retention_days": null,
    "training_policy": "unknown",
    "abuse_monitoring": "unknown"
  },
  "allowed_classifications": [
    "public_business_facts",
    "customer_lists_account_data",
    "business_contact_role_data"
  ],
  "disallowed_classifications": [
    "credentials_secrets",
    "auth_security_data",
    "malware_quarantined_content",
    "cross_tenant_data"
  ],
  "limits": {
    "max_context_tokens": null,
    "max_output_tokens": null,
    "rate_limits_per_minute": null
  },
  "tool_capabilities": [],
  "cost_controls": {
    "run_cost_cap_usd": null,
    "tenant_cost_cap_usd": null,
    "kill_switch_key": null
  },
  "evaluation_status": {
    "last_checked_at": null,
    "reviewer": null,
    "result": "pending"
  },
  "review_expiry": null,
  "provider_policy_state": "implementation_only"
}
```

This row is a prospective allowlist for an unverified implementation target only. Even with explicit allowed classifications declared, tenant-data execution remains disabled until every workload-specific envelope gate and approval evidence is verified and non-null.

## 9) Prompt, schema, tool, citation, and hallucination gates

- **Canonical injection code:** `REJECTED_INJECTION` (single canonical code for all request-injection outcomes).
- `prompt` and schema validation run before any provider call.
- Allowed tools must match strict request schema and be reduced to the allowed list; no unbounded tool calls.
- Missing or malformed citations are policy failures (`REVIEW_MISSING_EVIDENCE`).
- Evidence conflict/staleness must stop escalation (`REVIEW_STALE_EVIDENCE`, `REVIEW_CONFLICT`).
- Unsubstantiated "success" or safety/regulatory claims are downgraded (`REVIEW_MISLEADING_RISK`).
- Model outputs are proposals only and never execute outbound actions by themselves.

## 10) Tenant context and identifier policy

- `tenant_id` and `workspace_id` remain internal context fields.
- Models receive policy-safe identifiers only and never raw IDs by default (e.g., `request_correlation_token`, `tenant_token`, `workspace_token`).
- Provider prompt payloads must not receive raw tenancy identifiers.
- Internal operational/audit logs may and generally must retain raw `tenant_id`/`workspace_id` for incident tracing under D-001/D-002 controls, with documented access control, retention, and query auditing.

## 11) Logging and storage posture

- Provider payloads and external/third-party logs must not store raw prompts, raw model outputs, raw customer rows, raw identities, raw cross-tenant content, or token strings not needed for operations.
- Internal operational/audit logs may include raw tenancy IDs when D-001/D-002 controls are in force; no other internal logs may carry unnecessary raw tenant identifiers.
- Allowed internal audit/event fields: tenant_id, workspace_id, request-correlation token, policy version, idempotency key, model identifier, timing, result code, reason code, evidence refs, input hash, retry metadata, retention tags.
- Provider request/response payload retention is only permitted under explicit provider/data-use approval and private storage.
- Log redaction is performed before emission. If redaction fails or unsafe fields are still present, emit a privacy-safe incident/audit record only, return `REJECTED_LOG_REDACTION`, and block subsequent work.

## 12) Control results and resilient behavior

- **No provider configured / disabled:** `AI_PROVIDER_DISABLED` (immediate fail-closed).
- **Transient provider failures:** bounded retries with idempotent replay and `PENDING_RETRY`.
- **Provider timeout:** `FAILED_PROVIDER_TIMEOUT` (HTTP 504-style) and no partial completion side effects.
- **Provider outage:** `PENDING_RETRY` while below retry cap; `FAILED_PROVIDER_OUTAGE` (HTTP 503-style) beyond cap.
- **Cancellation:** `RUN_CANCELLED` with deterministic no-partial-write outcome.
- **Region mismatch:** `REJECTED_PROVIDER_REGION_MISMATCH` for provider processing/residency mismatch; `REJECTED_SOURCE_REGION_MISMATCH` for source policy mismatch.
- **Model retirement/version drift:** `REJECTED_MODEL_VERSION_DRIFT`.
- **Retention/training/abuse unknown:** `REJECTED_MODEL_POLICY_GAP` (provider gate, not source gate).
- **Policy revocation while running:** `RUN_REVALIDATE_REQUIRED` and immediate pause/cancel for in-flight work.
- **Cost policy breach:** pre-run `REJECTED_COST_CAP`; mid-run breach `RUN_REVALIDATE_REQUIRED`.
- **Idempotency:** `REJECTED_IDEMPOTENCY_REQUIRED` if no `idempotency_key` on mutation-sensitive paths; `REJECTED_IDEMPOTENCY_CONFLICT` for same `idempotency_key` with different `input_hash`; same `idempotency_key` and same `input_hash` must replay the durable result and may not execute duplicate work.
- **Unknown result code path:** `REJECTED_UNKNOWN_CODE`.

## 13) Stable result code taxonomy and API mapping

Result families:

- `AI_POLICY` - governance, tenant boundary, evidence, suppression, output integrity
- `AI_PROVIDER` - model/provider/config/readiness
- `AI_RUNTIME` - schema, citation, worker orchestration, idempotency
- `AI_CONTROL` - retries, cancellation, and policy revalidation

Canonical codes:

- `OK_PROPOSAL`
- `REVIEW_REQUIRED`
- `REVIEW_MISSING_EVIDENCE`
- `REVIEW_STALE_EVIDENCE`
- `REVIEW_CONFLICT`
- `REVIEW_MISLEADING_RISK`
- `REJECTED_SCOPE_TENANT_MISMATCH`
- `REJECTED_PERSONAL_DEFAULT`
- `REJECTED_SECRET`
- `REJECTED_QUARANTINE`
- `REJECTED_INJECTION`
- `REJECTED_RATE_LIMIT`
- `REJECTED_COST_CAP`
- `REJECTED_SOURCE_DISALLOWED`
- `REJECTED_SOURCE_REGION_MISMATCH`
- `REJECTED_PROVIDER_REGION_MISMATCH`
- `REJECTED_MODEL_DISALLOWED`
- `REJECTED_MODEL_VERSION_DRIFT`
- `REJECTED_MODEL_POLICY_GAP`
- `REJECTED_OUTPUT_SCHEMA`
- `REJECTED_LOG_REDACTION`
- `REJECTED_IDEMPOTENCY_REQUIRED`
- `REJECTED_IDEMPOTENCY_CONFLICT`
- `REJECTED_UNKNOWN_CODE`
- `FAILED_PROVIDER_TIMEOUT`
- `FAILED_PROVIDER_OUTAGE`
- `REJECTED_SUPPRESSION`
- `AI_PROVIDER_DISABLED`
- `PENDING_RETRY`
- `RUN_CANCELLED`
- `RUN_REVALIDATE_REQUIRED`

HTTP semantics are security-aware and non-enumerating for unauthorized object access:

- 200: `OK_PROPOSAL`, `REVIEW_*`, and a durable `RUN_CANCELLED` response initiated through the cancellation operation.
- 400: malformed caller input, including `REJECTED_INJECTION` and `REJECTED_IDEMPOTENCY_REQUIRED`. A required key that is absent is invalid input, not a concurrency conflict.
- 403: authorized-but-disallowed governance or data use, including `REJECTED_SECRET`, `REJECTED_QUARANTINE`, `REJECTED_SOURCE_DISALLOWED`, source/provider region restrictions, model policy/allowlist/version blocks, `REJECTED_PERSONAL_DEFAULT`, and `REJECTED_SUPPRESSION`.
- 404: a cross-tenant protected-object probe where the caller lacks tenant authorization (`REJECTED_SCOPE_TENANT_MISMATCH`).
- 409: `REJECTED_IDEMPOTENCY_CONFLICT` and `RUN_REVALIDATE_REQUIRED`.
- 429: `REJECTED_RATE_LIMIT` and `REJECTED_COST_CAP`.
- 502: `REJECTED_OUTPUT_SCHEMA` when a provider returned an invalid response; caller request validation failures remain 400.
- 503: `AI_PROVIDER_DISABLED`, `FAILED_PROVIDER_OUTAGE`, and `PENDING_RETRY`, with bounded retry metadata only where retry is permitted.
- 504: `FAILED_PROVIDER_TIMEOUT`.
- 500: `REJECTED_LOG_REDACTION`, `REJECTED_UNKNOWN_CODE`, and unexpected internal failures, always with a privacy-safe body and operator review path.

No `202` is used to imply approval/dispatch. `REVIEW_*` responses remain explicit proposals requiring explicit user/policy review.

## 14) Deterministic golden scenarios (41)

1. **S-01** cross-tenant scope mismatch -> `REJECTED_SCOPE_TENANT_MISMATCH` | immediate 404, no content leak, no job-state mutation.
2. **S-02** secret in payload -> `REJECTED_SECRET` | request rejected before provider dispatch.
3. **S-03** personal email present by default -> `REJECTED_PERSONAL_DEFAULT` | no role/contact expansion.
4. **S-04** personal mobile present by default -> `REJECTED_PERSONAL_DEFAULT` | no role/contact expansion.
5. **S-05** injection pattern in prompt/system fragment -> `REJECTED_INJECTION` | no parse/dispatch.
6. **S-06** malformed provider output schema -> `REJECTED_OUTPUT_SCHEMA` | deterministic parse failure and audit event.
7. **S-07** unsupported schema fields in output -> `REJECTED_OUTPUT_SCHEMA` | proposal rejected before downstream scoring.
8. **S-08** missing citation for required claim -> `REVIEW_MISSING_EVIDENCE` | proposal downgraded and blocked from draft emission.
9. **S-09** stale evidence used for safety claim -> `REVIEW_STALE_EVIDENCE` | require evidence refresh.
10. **S-10** legal claim with stale or missing policy evidence -> `REVIEW_MISSING_EVIDENCE` | publication path blocked.
11. **S-11** authorized connector policy disallow -> `REJECTED_SOURCE_DISALLOWED` | immediate 403, no source run.
12. **S-12** source-region restriction mismatch -> `REJECTED_SOURCE_REGION_MISMATCH` | immediate 403 and no source run.
13. **S-13** provider region mismatch -> `REJECTED_PROVIDER_REGION_MISMATCH` | no provider request dispatch.
14. **S-14** provider retention/abuse/training unknown -> `REJECTED_MODEL_POLICY_GAP` | terminal block until evidence attached.
15. **S-15** no-provider/disabled state -> `AI_PROVIDER_DISABLED` | immediate 503 fail-closed, no dispatch.
16. **S-16** alternate provider/model fallback requested -> `REJECTED_MODEL_DISALLOWED` | run rejected with no fallback attempts.
17. **S-17** cancellation before first provider call -> `RUN_CANCELLED` | no side effects.
18. **S-18** cancellation after idempotent preflight -> `RUN_CANCELLED` | cleanup partial internal queue locks only.
19. **S-19** transient failure and retry budget > 0 -> `PENDING_RETRY` | record retry state and use same `idempotency_key`/`input_hash` on retries.
20. **S-20** transient outage beyond retry cap -> `FAILED_PROVIDER_OUTAGE` | terminal hold, 503, resume only after operator policy reset.
21. **S-21** provider timeout with active abort signal -> `FAILED_PROVIDER_TIMEOUT` | no partial write; retry path preserved with same `idempotency_key` and hash.
22. **S-22** model drift/version invalid -> `REJECTED_MODEL_VERSION_DRIFT` | dispatch denied and evidence event recorded.
23. **S-23** env override mismatch on configured model -> `REJECTED_MODEL_DISALLOWED` | no dispatch.
24. **S-24** pre-run tenant budget exhausted -> `REJECTED_COST_CAP` | no request initiated.
25. **S-25** mid-run cost overrun detected -> `RUN_REVALIDATE_REQUIRED` | stop subsequent calls; retain partial audit + cost usage.
26. **S-26** malformed citation locator syntax -> `REVIEW_MISSING_EVIDENCE` | claim blocked until citation fix.
27. **S-27** evidence conflict across sources -> `REVIEW_CONFLICT` | unresolved claims excluded from proposal.
28. **S-28** adaptive question engine with missing required uncertainty signal -> `REVIEW_REQUIRED` | do not send adaptive question set to user.
29. **S-29** contact suppression policy violation -> `REJECTED_SUPPRESSION` | suppressed contact must be removed before proposal output.
30. **S-30** malware payload reaches extractor -> `REJECTED_QUARANTINE` | extraction stops and artifact quarantined.
31. **S-31** cross-tenant content passed in ingestion metadata -> `REJECTED_SCOPE_TENANT_MISMATCH` | no tenant leakage and no provider dispatch; boundary-violation audit event only.
32. **S-32** disallowed source is invoked -> `REJECTED_SOURCE_DISALLOWED` | source run blocked by connector policy.
33. **S-33** source result includes unsupported personal data -> `REJECTED_PERSONAL_DEFAULT` | blocked before source-to-provider handoff, no provider call.
34. **S-34** model output contains raw prompt/response leakage in logs -> `REJECTED_LOG_REDACTION` | only a privacy-safe incident record is written.
35. **S-35** unknown worker result code -> `REJECTED_UNKNOWN_CODE` | safe hold and escalation path.
36. **S-36** weak safety/regulated claim with plausible wording -> `REVIEW_MISLEADING_RISK` | proposal review required.
37. **S-37** success claim emitted without evidence -> `REVIEW_MISSING_EVIDENCE` | claim removed until evidence exists.
38. **S-38** role hypothesis marked verified without required support -> `REVIEW_REQUIRED` | require explicit evidence review path.
39. **S-39** two concurrent runs share same `idempotency_key` and same `input_hash` -> `OK_PROPOSAL` | one execution occurs; duplicates receive the same durable replay result only.
40. **S-40** one run uses same `idempotency_key` with different `input_hash` -> `REJECTED_IDEMPOTENCY_CONFLICT` | reject without execution and require caller to resubmit with new key.
41. **S-41** one run without `idempotency_key` in mutation-sensitive path -> `REJECTED_IDEMPOTENCY_REQUIRED` | operator escalation and no execution.

## 15) Low-capability worker handoff

For downstream agents with low model budgets:

- **Input envelope** (minimal):
  `provider_request_token`, `policy_version`, `idempotency_key`, `input_hash`, classification tags, `result_schema`, `allowed_classifications`, and approved tokenized tenant/workspace references.
- **Output envelope** (minimal):
  `{result_code, reason_code, allowed_fields, blocked_fields, evidence_refs, next_gate, next_step, run_metadata}`.

No high-confidence claim can proceed to draft execution without explicit human approval evidence at the destination layer.

## 16) Specialty-chemical + non-industrial examples

**Specialty-chemicals (metalworking-fluid + epoxy):**
Candidate plays may target fluid formulators, coatings makers, distributors, and construction/composite manufacturers. Unpublished formulations and technical specs are admitted only under approved envelope and minimization. Safety/regulatory claims (e.g., VOC/REACH/SDS-level assertions) require explicit evidence and `REVIEW_*` signoff.

**Non-industrial example (e.g., software/service tenant):**
Confidential roadmaps, pricing models, private hiring/financial notes, or unpublished product architecture remain disallowed by default for provider calls and may be escalated with explicit workload envelope and evidence minimization.

## 17) Acceptance criteria for this document (for parent ledger)

- No fabricated provider/account facts remain in this policy.
- Exact canonical model/provider identifier is `gpt-5.4-mini` where the repository asserts model locking.
- Unverified activation fields are explicit (`null`/`unknown`/`[]`) with endpoint-versus-residency separation.
- One canonical prompt-injection code only: `REJECTED_INJECTION`.
- Internal logs may retain raw `tenant_id`/`workspace_id` for D-001/D-002 traceability; provider prompts and external logs remain privacy-reduced.
- Parent-conductor acceptance is not treated as a direct production control; named governance evidence classes are required.
- Tenant mismatch, source mismatch, and 202 semantics are corrected to deterministic API/status semantics.
- Provider-policy gaps (retention/region/training/abuse) map to `REJECTED_MODEL_POLICY_GAP`.
- At least 36 deterministic scenarios are defined with explicit exact codes and side effects (41 scenarios present).
- Current scope remains one file only.
