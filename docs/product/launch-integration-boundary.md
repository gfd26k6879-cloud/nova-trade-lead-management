# Launch Integration Boundary (D-017)

**Task:** D-017  -  Approve launch CRM and integration boundary
**Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
**Status:** Parent-conductor accepted as the local launch integration contract; live connector and production integration activation remain disabled and require separate governance approval.
**Scope:** Documentation only (no implementation, code, config, migration, credentials, provider keys, database write, CRM/provider change, outreach transport, commit, push, branch changes, or PRs)
**Decision references:** D-010, D-011, D-012, D-013, D-018, implementation plan, and current repository code/tests.

## 1. Executive summary

This document defines the launch integration boundary for the product's next phase: tenant-scoped, evidence-led, non-send outreach that can use versioned exports and controlled copy workflows without selecting or calling a live CRM at launch.

Launch posture:

- Nova Trade remains system of record for lead intelligence research, evidence, plays, account resolution, qualification snapshots, approvals, suppression, outcomes, and audit.
- No live bidirectional CRM sync.
- No CRM credential storage.
- No CRM webhooks.
- No public write API for CRM or integration control.
- No automatic transport (send, dispatch, provider integration).
- Launch allows controlled human-approved copy/export artifacts.
- Export/import formats are versioned and deterministic.

This is the low-risk boundary used to preserve compatibility while removing unsafe implicit integration assumptions.

## 2. Current-state inventory vs launch target

### 2.1 Current-state (as implemented today)

1. CSV export exists via `src/app/api/export/csv/route.ts` and emits legacy `csv_exported` events.
2. Lead actions and outcome logging are compatible legacy behavior in `src/lib/leads/actions.ts`.
3. Google Places and `place_id` are still special in legacy schemas (`places_master`, `place_observations`, `leads.place_id` patterns).
4. No general, tenant-safe, production-grade CRM adapter for live sync exists today.
5. A full tenant/system boundary for role- and workspace-scoped external writes is not yet active for all surfaces.

### 2.2 Launch target state

1. Export/import is **contract-based** and versioned.
2. Canonical account intelligence and suppression are authoritative inside Nova Trade.
3. Copy/export artifacts are append-only records, never interpreted as delivery.
4. Identity and suppression precedence are tenant-scoped and deterministic.
5. Cross-tenant data is blocked at auth boundary and at import-time envelope checks.

## 3. Exact actor-layer model (D-002 aligned)

Launch actor layers are exactly:

- `member`
- `support`
- `worker`
- `agent`
- `system`

`operator` is **not** an actor layer. At launch, operator-like platform behavior is represented only through:

- an eligible `member` role and permission context,
- support workflow tooling used for diagnostics/repair with auditable grants (not outbound request/approval),
- `system` runtime tasks inside the platform process.

Authorization and safety rules:

1. Only an eligible `member` may satisfy human approval for outreach copy/export handoff workflow gates.
2. `support` can diagnose and repair with reasoned, audited grants; it cannot approve or request controlled outbound copy/export on its own.
3. `agent` cannot request or authorize controlled outbound operations; it can propose and evaluate.
4. `worker` can only materialize pre-approved human requests under an immutable lease.
5. `system` executes platform rules and creates immutable handoff attempt/outcome records but cannot satisfy human gates.

## 4. Launch inclusion and exclusion

### 4.1 Included in launch

- Controlled, human-approved copy and export attempts (server-authorized).
- D-011 identity modeling contract for namespace, exact merge/review behavior, and merged redirects.
- D-012 suppression and consent evaluation as a blocking gate.
- D-013 handoff and outcome provenance contract.
- Tenant/workspace policy and RBAC enforcement (D-001/D-002).
- D-010 source allowlist workflow for approved non-CRM sources.
- Deterministic import/export schemas and integrity checks.
- Retry semantics and cancellation checkpoints.

### 4.2 Excluded in launch

- Live CRM sync, credential storage, webhook ingestion, or outbound provider writes.
- Public write APIs for integration control.
- Any claim that copy/export means send/delivery.
- Automatic send/distribution from code paths, workers, agents, or systems.
- Out-of-band CRM auth handshakes and production connector rollout.

## 5. Launch boundary contract

Nova Trade remains source of truth for:

- Canonical accounts (tenant-wide).
- Candidate observations.
- Merge redirects.
- Approval and handoff lifecycle.
- Suppression and outcome truth.
- Audit and correlation lineage.

External systems may provide observations and IDs only; they never own truth.

### 5.1 Invariants

1. Workspace is an association/observation context only; it is not part of canonical identity uniqueness.
2. Canonical identity uniqueness is tenant-wide; workspace-scoped records must reference tenant-canonical accounts.
3. Most restrictive suppression state dominates downstream behavior.
4. Merge/unmerge operations never remove external/source references.
5. All export/import paths must be idempotent, replay-safe, and non-lossy.

## 6. Tenant scope and non-enumeration

1. Every request resolves tenant and workspace context from authenticated server context.
2. `tenant_id` and `workspace_id` in payloads are treated as assertions, not authority.
3. If an artifact payload contains rows that belong to a foreign tenant, reject the **entire artifact** as `BLOCKED_SCOPE_TENANT_MISMATCH`; no partial row success.
4. External callers must receive non-enumerating `404/NOT_FOUND` for foreign protected objects; internal full mismatch reasons are auditable only after both objects are independently authorized.
5. Tenant/workspace context mismatch returns non-enumerating errors and a stable no-leak code.

## 7. Identity namespace, merging, and merge safety (D-011 aligned)

### 7.1 External identity tuple (exact)

External identifiers must use this exact tuple:

`(tenant_id, source_connector_id, source_dataset_or_region, external_identifier_type, normalized_external_identifier)`

Notes:

- Workspace is **not** part of the uniqueness key.
- Connector namespace is first-class and stable.
- Same tenant may re-use a global identifier only under separate connector namespace and normalized ID context.

### 7.2 Merge semantics

1. `tenant_id`-scoped external IDs are tenant-local and cannot cross tenant.
2. Exact auto-link is allowed only via D-011 exact-path rules.
3. Fuzzy matching is review-only and can never trigger automatic merge.
4. Jurisdiction/legal-entity/relationship conflicts must block automatic merge and route to `review` or `stale`.
5. Merge/unmerge must preserve:
   - all source observations,
   - all external IDs,
   - all contacts and relationship state,
   - all outcomes and suppression history.
6. Conflicting suppression states **do not** block a proven identity merge; effective suppression for merge output is the most restrictive protective state.
7. Merge result can be undone by explicit unmerge workflow; historical references remain.

## 8. Suppression semantics (D-012 aligned, no invented states)

Suppression precedence (highest restrictive first):

`hard_bounce > deleted_tombstone > deletion_pending > do_not_contact > complaint > opt_out > source_prohibited > conflicted > unknown > soft_bounce > clear`

Rules:

- `clear` is the only terminal pass state.
- Any other effective state blocks operations that require a contact-capable handoff.
- Soft/hard bounce, conflict, unknown, and legal blocks are never downgraded.
- Most restrictive state dominates merge-safe merges and export decisions.

## 9. Stable artifact envelope and schema

All export/import artifacts must use versioned contracts.

### 9.1 Top-level envelope fields

- `schema_version`
- `contract_version`
- `artifact_id` (UUID/ULID)
- `artifact_type` (`lead_account_export`, `copy_handoff`, `outcome_import`, `suppression_audit_export`, `reconciliation_dump`)
- `artifact_purpose` (stable enum)
- `tenant_id` (asserted by client, validated against authenticated context)
- `workspace_id` (nullable if context is tenant-scoped)
- `generated_by_actor_layer` (`system`/`worker`/`agent`/`member`/`support`)
- `generated_by_actor_id`
- `requested_by_actor_layer` + `requested_by_actor_id`
- `requested_at_utc`
- `generated_at_utc`
- `expires_at_utc` (where relevant)
- `policy_version`
- `policy_snapshot` (`d001`, `d002`, `d010`, `d011`, `d012`, `d013`, `connector_allowlist_version`)
- `result_code`
- `result_message`
- `idempotency_key`
- `input_hash`
- `correlation_id`
- `checksums` (`payload_sha256`, `record_hashes`, `source_record_hash`)
- `counts` (`requested`, `included`, `excluded`, `redacted`, `errored`)
- `counts_reasons` (deterministic array)
- `signature` (optional) and `schema_signature_version`

### 9.2 Record-level fields

- `record_id`
- `tenant_id`
- `workspace_id` (nullable when tenant-only scope is valid)
- `canonical_account_id` (required)
- `current_account_id` (optional if redirected)
- `source_observations` (array/set of IDs, optional and repeatable)
- `external_reference_type` (optional string)
- `external_reference_id` (required for imported external identities, nullable for Nova-native export records)
- `external_connector_id` (required for external connector-origin rows)
- `source_dataset_or_region`
- `canonical_source_namespace` (derived from D-011 tuple)
- `identity_state`
- `suppression_state`
- `suppression_reason_codes` (array)
- `qualification_snapshot_id` (optional)
- `score_snapshot_id` (optional)
- `approval_state` / `approval_version_hash`
- `artifact_lineage` (`source_record_ids`, `observation_ids`, `parent_record_ids`, `redirected_from_ids`)
- `evidence_refs`
- `citation_digest`
- `redaction_flags`
- `counts` per-record optional metrics for deterministic export reconciliation

`external_reference_id` is mandatory for any record linked to imported external identities and nullable for purely Nova-native records.

### 9.3 Artifact actor constraints

- For outbound-style `artifact_type` values (for example `copy_handoff` and similar handoff/request records):
  - `requested_by_actor_layer` MUST be `member`.
  - `requested_by_actor_id` MUST identify an eligible tenant member with active approval authority.
  - `generated_by_actor_layer` MUST be `worker` or `system` under an immutable worker lease for materialization of a pre-approved member request, or `member` for direct responses.
  - `generated_by_actor_layer` MUST NOT be `agent` or `support`.
- For non-outbound proposal/reconciliation artifacts (for example research drafts, qualification snapshots, reconciliation dumps, suppression audit records):
  - `agent` MAY generate/revise these records.
  - no actor MAY treat these records as approved handoff outcomes until they are upgraded via a member-approved `copy_handoff`.

### 9.4 Deterministic CSV/JSON encoding

1. CSV arrays are serialized with deterministic order and delimiter format (JSON array string with stable sort) and RFC 4180 quoting.
2. Deterministic object field ordering is fixed by schema order.
3. Dangerous spreadsheet-injection values are sanitized at per-cell level with a preserved raw field:
    - normalize cell text by removing BOM and leading Unicode whitespace/control before evaluation,
    - detect dangerous prefixes on the normalized string: `=`, `+`, `-`, `@`,
    - preserve raw source text only in protected internal source/provenance records (never as `raw_<field>_data` in the export payload),
    - write CSV-safe value prefixed with `'` (apostrophe) where export policy requires safe transport.
4. For non-contact, account-only exports, dangerous values may be sanitized and preserved as redacted-safe text when allowed by policy.

## 10. Export/import and idempotency semantics

### 10.1 Event/import identity

The durable idempotency identity for imported external outcomes/events is:

`(tenant_id, connector_namespace, external_event_id)`

`input_hash` is tracked separately for replay correctness.

- same identity tuple + same hash = replay-safe idempotent return
- same identity tuple + different hash = deterministic conflict code below

### 10.2 Outcome and event idempotency

- `REPLAY_SAFE_DUPLICATE` (same event identity + same hash)
- `INTEGRATION_EVENT_IDEMPOTENCY_CONFLICT` (same event identity + different hash)

### 10.3 Handoff event behavior

1. Handoff and export attempts must be append-only.
2. Approved package snapshots are immutable.
3. Copy/export attempts do not imply send, delivered, opened, clicked, or successful receipt.
4. Cancellation must add a `CANCELLED_BY_MEMBER` checkpoint event with immutable reason and member context.
5. Late suppression discovered before artifact release must revoke/withdraw the candidate artifact and prevent exposure.
6. Blocked post-close input must append an audit attempt event only; no outcome mutation is performed.

## 11. Manual outcomes (D-013 canonical, version-locked)

Manual outcome taxonomy is not recreated and is mapped one-to-one to the accepted D-013 canonical version for this release:

- `copied`
- `exported`
- `sent_manually` (authorized-member observation only, not transport truth)
- `delivery_unknown`
- `bounced` (legacy alias from existing UI imports; launch contracts require explicit `bounce_classification` one of `hard_bounce`, `soft_bounce`, `unknown_bounce`)
- `opted_out`
- `complaint`
- `replied`
- `meeting_set`
- `opportunity`
- `won`
- `lost`
- `not_interested`
- `unknown`

`delivered`, `opened`, `clicked` are **not** produced at launch and must not be inferred from handoff/copy activity.
Protective outcomes must update suppression immediately (`opted_out`, `complaint`, `bounced` with `hard_bounce|soft_bounce|unknown_bounce` classification, deletion-like states).

Any third-party manual naming must be mapped one-to-one into this canonical list or rejected.

Dependency check:

- The D-013 canonical names and version in scope are immutable for launch. If a runtime or implementation-time comparison detects a mismatch against the accepted D-013 version and canonical outcome names, contract validation MUST fail (`BLOCKED_SCHEMA_MISMATCH`) rather than silently accepting a duplicated or remapped taxonomy.
- `d013_version` and canonical mapping metadata must be treated as config assertions and audited with every intake attempt.

## 12. Protected data and artifact safety

1. `tenant_id` is never accepted as privilege authority.
2. `external_reference_id` for imported external identities is required.
3. Source observations may be missing; therefore they are represented as a set/array.
4. No raw documents, secrets, credentials, API keys, or private notes in copy/export payload.
5. No automatic evidence creation from suppression/credential state changes.
6. If suppression becomes active after candidate generation but before artifact release, revoke candidate artifacts rather than mutate them into sent outcomes.

## 13. API and endpoint boundary

### 13.1 Public APIs

- No public integration write API at launch.
- Existing public read endpoints remain unchanged where documented.
- Export/import of lead intelligence uses internal authenticated surfaces only.

### 13.2 Future APIs

Future public integrations must remain versioned and governance-reviewed, with:

- tenant/workspace authorization,
- non-enumeration semantics,
- idempotency with conflict codes,
- explicit actor/audit separation,
- anti-bypass guardrails,
- cannot bypass human approval gates.

## 14. Non-enumerating behavior

For external callers:

- foreign protected object => `404/NOT_FOUND`.
- unsupported authorization context => `403` only when caller is authenticated and object scope is partially known from valid context.

Internal mismatch detail may be logged and audited after both sides are independently authorized.

## 15. Connector contract and future activation checklist

### 15.1 Required launch-time behavior for connectors

- Launch connector behavior not selected => `BLOCKED_CONNECTOR_DISABLED` and no network call.
- Deferred connectors and webhooks stay dormant at launch.
- Network call is only allowed in later phases after product/security/legal/provider/account/tenant approval gates.

### 15.2 Future activation checklist (must be complete before production CRM enablement)

1. Product approval including product owner, legal, and privacy signoff.
2. Security review and secret-handling pattern approved.
3. Provider legal terms and jurisdictional policy accepted.
4. Account governance and tenant policy explicit (including support/access/audit rights).
5. Tenant opt-in and tenant-level kill policy configured.
6. Scope controls, rate limits, budget controls, retry policy, and replay safety approved.
7. Reconciliation and rollback playbook signed.
8. D-018 expanded for this phase only if outbound execution is involved.

Parent-conductor acceptance alone does **not** authorize production connector rollout.

## 16. Conflict/recovery matrix (exact single-code outcomes)

### 16.1 Matrix

| ID | Scenario | Expected result code | Side effect |
|---|---|---|---|
| D017-S001 | Tenant A export with valid request and context | `ARTIFACT_PREPARED` | Artifact prepared with manifest and checksums generated |
| D017-S002 | Wrong tenant context in request header | `BLOCKED_SCOPE_TENANT_MISMATCH` | Entire run rejected |
| D017-S003 | Missing required artifact field | `BLOCKED_SCOPE_MALFORMED` | No mutation |
| D017-S004 | Duplicate request with same request identity + same hash | `REPLAY_SAFE_DUPLICATE` | Same result returned |
| D017-S005 | Duplicate request with same event identity + different hash | `INTEGRATION_EVENT_IDEMPOTENCY_CONFLICT` | No mutation, conflict recorded |
| D017-S006 | Handoff candidate with suppression `opt_out` | `BLOCKED_SUPPRESSION_DOMINANCE` | Candidate redacted and blocked |
| D017-S007 | Handoff candidate with suppression `do_not_contact` | `BLOCKED_SUPPRESSION_DOMINANCE` | Candidate redacted and blocked |
| D017-S008 | Handoff candidate with suppression `hard_bounce` | `BLOCKED_SUPPRESSION_DOMINANCE` | Candidate redacted and blocked |
| D017-S009 | Candidate suppressed with `unknown` state | `BLOCKED_SUPPRESSION_DOMINANCE` | Fail closed |
| D017-S010 | Candidate with unresolved `soft_bounce` for contact operation | `BLOCKED_SUPPRESSION_DOMINANCE` | Contact-blocked behavior |
| D017-S011 | Candidate mapped to non-candidate external namespace not in allowlist | `BLOCKED_SOURCE_NOT_ALLOWED` | No row accepted |
| D017-S012 | Source terms missing for approved connector type | `BLOCKED_SOURCE_TERMS_MISSING` | No handoff attempt |
| D017-S013 | Launch-deferred connector selected | `BLOCKED_CONNECTOR_DISABLED` | No network call, no retry |
| D017-S014 | Connector auth missing at run start (future-activation fixture) | `BLOCKED_CONNECTOR_DISABLED` | Future-activation fixture: no network calls at launch; request blocked before any connector touch |
| D017-S015 | CSV cell starts with formula prefix `=` after BOM/whitespace normalization | `BLOCKED_FORMULA_INJECTION` | Cell sanitized and blocked for unsafe operation |
| D017-S016 | CSV formula risk in non-contact export | `FORMULA_EXPORTED_SAFE` | Raw stored separately; safe apostrophe value emitted |
| D017-S017 | Import row has malformed tenant assertion or malformed tenant row id | `BLOCKED_SCOPE_MALFORMED` | 400; entire payload rejected |
| D017-S018 | Import row has malformed JSON or broken CSV delimiter | `BLOCKED_MALFORMED_INPUT` | Entire run rejected |
| D017-S019 | Import with one malformed row in per-row mode | `PARTIAL_IMPORT` | Valid rows processed |
| D017-S020 | Partial run reaches row limit | `PARTIAL_EXPORT` | Resume token generated |
| D017-S021 | Import has mixed external schemas | `BLOCKED_SCHEMA_MISMATCH` | No mutation |
| D017-S022 | Import reuses older schema than expected | `BLOCKED_SCHEMA_VERSION_REGRESSION` | Rejected |
| D017-S023 | Supported schema upgrade required | `BLOCKED_SCHEMA_UPGRADE_REQUIRED` | Upgrade required |
| D017-S024 | Same source ID maps to stale canonical redirect | `BLOCKED_STALE_ID_MAPPING` | Manual review required |
| D017-S025 | Merge blocked by jurisdiction/legal-entity conflict | `BLOCKED_MERGE_LEGAL_ENTITY_CONFLICT` | Review queue entry created |
| D017-S026 | Merge blocked by relationship domain conflict (parent/branch/subsidiary ambiguity) | `BLOCKED_MERGE_RELATIONSHIP_CONFLICT` | Review queue entry created |
| D017-S027 | Merge with differing suppression states and proven identity match | `MERGE_PRESERVED_WITH_RESTRICTIVE_SUPPRESSION` | Merge proceeds; most restrictive suppression preserved |
| D017-S028 | External event arrives for closed record (post-close) | `BLOCKED_POST_CLOSE_OUTCOME` | Audit-only attempt row created |
| D017-S029 | Member cancels active run with valid approval context | `CANCELLED_BY_MEMBER` | Cancellation checkpoint appended |
| D017-S030 | Duplicate import on closed artifact with same identity + hash | `REPLAY_SAFE_DUPLICATE` | Replay metadata returned |
| D017-S031 | Duplicate import on closed artifact with same identity + different hash | `INTEGRATION_EVENT_IDEMPOTENCY_CONFLICT` | No mutation |
| D017-S032 | Connector transient timeout before run start (future-activation fixture) | `BLOCKED_CONNECTOR_DISABLED` | Future-activation fixture: no network calls at launch; request blocked before any connector touch |
| D017-S033 | Connector timeout during run with persisted checkpoint (future-activation fixture) | `BLOCKED_CONNECTOR_DISABLED` | Future-activation fixture: no network calls at launch; request blocked before any connector touch |
| D017-S034 | Connector revoked mid-run (future-activation fixture) | `BLOCKED_CONNECTOR_DISABLED` | Future-activation fixture: no network calls at launch; request blocked before any connector touch |
| D017-S035 | Unsupported connector mapping or field-map drift (future-activation fixture) | `BLOCKED_CONNECTOR_DISABLED` | Future-activation fixture: no network calls at launch; request blocked before any connector touch |
| D017-S036 | Wrong-tenant row in otherwise-valid artifact | `BLOCKED_SCOPE_TENANT_MISMATCH` | Entire artifact rejected |
| D017-S037 | External object not visible to caller | `BLOCKED_NON_ENUMERATION` | 404-like non-enumerating response |
| D017-S038 | Support actor requests outbound handoff (including with support grant) | `OUTREACH_GATE_DENIED` | No outbound operation |
| D017-S039 | Agent actor requests outbound handoff | `OUTREACH_GATE_DENIED` | No outbound operation |
| D017-S040 | Worker executes non-approved materialization request | `WORKER_SCOPE_DENIED` | Run aborted, no mutation |

### 16.2 Result codes used by this boundary

- `ARTIFACT_PREPARED`
- `PARTIAL_EXPORT`
- `PARTIAL_IMPORT`
- `REPLAY_SAFE_DUPLICATE`
- `INTEGRATION_EVENT_IDEMPOTENCY_CONFLICT`
- `MERGE_PRESERVED_WITH_RESTRICTIVE_SUPPRESSION`
- `BLOCKED_SCOPE_MALFORMED`
- `BLOCKED_SCOPE_TENANT_MISMATCH`
- `BLOCKED_NON_ENUMERATION`
- `BLOCKED_SOURCE_NOT_ALLOWED`
- `BLOCKED_SOURCE_TERMS_MISSING`
- `BLOCKED_MALFORMED_INPUT`
- `BLOCKED_SCHEMA_MISMATCH`
- `BLOCKED_SCHEMA_VERSION_REGRESSION`
- `BLOCKED_SCHEMA_UPGRADE_REQUIRED`
- `BLOCKED_CONNECTOR_DISABLED`
- `BLOCKED_FORMULA_INJECTION`
- `FORMULA_EXPORTED_SAFE`
- `BLOCKED_SUPPRESSION_DOMINANCE`
- `BLOCKED_STALE_ID_MAPPING`
- `BLOCKED_MERGE_LEGAL_ENTITY_CONFLICT`
- `BLOCKED_MERGE_RELATIONSHIP_CONFLICT`
- `BLOCKED_POST_CLOSE_OUTCOME`
- `CANCELLED_BY_MEMBER`
- `WORKER_SCOPE_DENIED`
- `OUTREACH_GATE_DENIED`

## 17. Specialty-chemicals and non-industrial examples

### 17.1 Specialty-chemicals

1. Fluid-formulator prospect with customer-list row + customer website + Google Places row:
   separate records for `tenant_A` and `tenant_B` can share place-level fields but must not auto-merge until D-011 exact rules pass.
2. Epoxy resin buyer with same domain + different legal entity evidence:
   no auto-merge by shared domain; review state required.
3. Coatings manufacturer + flooring/civil-engineering distributor relationship:
   relationship may be `distributor_for` with distinct accounts where legal/operating identity differs.
4. Adhesive/composite or pipe supplier with shared web crawler signal and phone support:
   same-type indicators are review-only unless high-precision exact fields prove same legal identity.
5. Franchise brand with one domain and multiple plants:
   domain alone cannot merge; parent/branch resolution required.

### 17.2 Non-industrial

1. Regional healthcare clinic network:
   same marketing phrase and similar contact names require evidence-based disambiguation, not auto-merge.
2. Franchise retail software reseller:
   location-level accounts remain separate unless evidence proves same legal operating entity and procurement profile.
3. SaaS reseller with shared supplier IDs:
   shared IDs become reviewed relationship, not proof of merge.

## 18. Low-capability worker handoff guidance

1. Use one deterministic mapper for D-011 namespace tuple and source observation lineage.
2. Validate tenant context from server session before tuple construction.
3. Implement one canonical serializer and one deterministic checksum path.
4. Implement one non-enumerating mismatch handler and one public error mapper.
5. Implement explicit tests for:
   - idempotency replay/conflict,
   - suppression dominance,
   - wrong-tenant artifact rejection,
   - formula injection handling,
   - cancellation checkpoint,
   - late suppression revocation,
   - partial import/export resume.

## 19. Rollout, rollback, and production guard

### 19.1 Phased rollout

- **Phase A (launch):** export/import contracts only, no connector writes, no public integration write API.
- **Phase B (stabilization):** read-only connectors under explicit downstream approval.
- **Phase C (future production integration):** production connectors after separate product/security/legal/provider/account/tenant approvals.

### 19.2 Rollback

1. Global integration kill switch on all external connector invocations.
2. Freeze connector jobs and external events.
3. Re-run in artifact-only mode only.
4. Preserve audit, suppression, and immutable history.

## 20. Acceptance criteria for parent-conductor

1. File contains exact D-011 namespace tuple and explicit note that workspace is association context.
2. Actor layers are exactly `member`, `support`, `worker`, `agent`, `system`; only eligible `member` actors may request/approve controlled handoff, and `support`/`agent` may not.
3. Suppression follows D-012 ordering with no invented `blocked` disposition.
4. Merge rules align to D-011, including stale/ambiguous cases that route to review/stale and preserve observations.
5. Manual outcomes map only to D-013 canon; launch excludes delivered/opened/clicked as produced values.
6. Idempotency identity and conflict behavior are explicit and deterministic; no `HANDOFF_IDEMPOTENCY_CONFLICT`.
7. Artifact tenant/workspace assertions are handled as assertions, with foreign mismatch as full reject.
8. Non-enumerating external behavior is defined (`404/NOT_FOUND` route for unauthorized/protected objects).
9. Formula injection detection and serialization details are deterministic and preserve raw source separately.
10. At least 40 deterministic scenarios are present and each has one expected result code and side effect.
11. No public integration write API remains in launch boundary.
12. Production connector activation explicitly requires product/security/privacy/legal/provider/account/tenant governance evidence and explicit phase approvals, beyond D-018.
13. Cancellation and post-close semantics are deterministic and append-only.
14. D-013 dependency/version enforcement is present so canonical-name mismatches fail validation rather than creating duplicate taxonomies.
15. Outbound handoff actor constraints are explicit: `copy_handoff` requires `requested_by=member`, and generated-by `worker/system` only through immutable lease-based materialization of member-approved requests.

## 21. External blockers

- CRM provider contracts and terms for production connector phase.
- Legal approvals by jurisdiction and product policy signoff.
- Provider security, SOC/VPN/network, and tenant data governance reviews.
- D-018 extension for any external writes, provider credentials, or deployment actions.
