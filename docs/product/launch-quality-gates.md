# D-015 — Nova Trade launch quality gates

**Status:** Accepted local implementation contract; calibration and activation blockers remain
**Decision:** Define the local implementation contract for launch-quality measurement, phase entry/exit, rollback, and kill gates.
**Scope:** Documentation only. This file does not activate a cohort, approve a provider, authorize customer data, or claim that any gate has passed.
**Authority:** The PRD defines product intent; the implementation plan defines phase ordering and stop conditions; accepted D-005, D-007–D-014 contracts define the inherited policy boundaries. Where this file is silent, the more restrictive accepted contract wins.
**Date:** 2026-07-27

## 1. Decision and boundary

D-015 converts the product metrics into deterministic release gates. A gate is a measured claim about a named fixture, cohort, version, and window. A gate is not a feature-completeness checklist. No phase advances because a feature exists; it advances only when its required evidence receipt, owner assignment, approval record, and quality result are present.

This is a local contract. Parent acceptance of this file is not Product, Engineering/Security, Privacy/Legal, or Support/Operations sign-off. It is not calibrated golden-set evidence, production readiness, legal compliance, provider approval, live enrollment, customer outcome evidence, or deployment approval.

### 1.1 Current state versus future state

The current Nova Trade repository is a local Next.js application with SQLite compatibility, existing website-oriented lead discovery, Google Places primitives, worker/retry patterns, AI artifacts, scoring, audit, budgets, and copy-oriented operational workflows. Existing release evidence and the baseline document describe current repository checks only. They do not prove future tenant isolation, RLS, generalized account identity, evidence graphs, adaptive questions, calibrated quality, or live cohort readiness.

The future product uses tenant and optional workspace boundaries, arbitrary authorized materials, evidence-backed business understanding, adaptive questions, versioned ICPs and lead plays, compliant source connectors, canonical accounts, buying-center hypotheses, reviewable qualification, and human-approved draft/copy/export workflows. The specialty-chemicals fixture—metalworking-fluid components/packages, epoxy resins, formulators, coatings makers, flooring/civil-engineering suppliers, adhesives/composites/pipe manufacturers, and distributors—is a calibration slice, not a platform limitation.

### 1.2 Inherited non-negotiables

The following values are inherited exactly from the plan/PRD and are not invented by this document:

| Invariant | Required result | Evidence needed |
|---|---|---|
| Cross-tenant isolation | Zero cross-tenant disclosure and zero cross-tenant writes across UI, API, worker, cache, retrieval, model context, export, logs, and RLS | Target-perspective negative tests and sanitized receipts |
| Autonomous outreach | Zero autonomous sends; D-017 remains artifact-only | Static/route/worker/dependency guard and no-send scenarios |
| Unsupported consequential claims | Zero unsupported-claim escape | Policy evaluation and adversarial review receipt |
| Qualification/outreach citations | 100% of required citations resolve under the authorized tenant scope | Citation receipt with numerator and denominator |
| Automatic exact account links | At least 99% precision | Reviewed exact-link golden/canary report; comparison is not rounded before evaluation |
| Durable side effects | Zero duplicate durable side effects under replay/retry | Idempotency/replay receipt |
| Critical security | All critical security tests pass | Versioned security receipt; one failure blocks |
| Critical accessibility | Zero critical WCAG 2.2 AA issues in critical journeys | Keyboard, semantics, status/error, evidence-review receipt |
| Ordinary reads | p95 under 500 ms, excluding provider calls | Versioned performance report |
| First usable ingestion status | Under 5 seconds | Local performance receipt with request and status timestamps |
| Queued work progress | Progress shown within 30 seconds | Worker/UI progress receipt |
| Tenant-facing availability | 99.9% monthly after production hardening | Only applicable to a separately authorized production measurement window |

Every other quality, cost, extraction, question, scoring, merge, and service target is blocked until an approved calibration record supplies its threshold. A model, worker, or parent agent must never fill that gap with a guess.

## 2. Terminology and result semantics

- **Gate result:** A deterministic result for one gate, slice, version, and measurement window.
- **Evidence receipt:** An immutable, content-minimized record containing the gate ID, source artifact IDs, fixture/cohort identity, numerator, denominator, slice, threshold version, evaluator version, timestamps, code, and side-effect result.
- **Numeric gate:** A comparison against an inherited numeric target or an approved calibration target. Empty or zero denominators never pass.
- **Binary gate:** A finite control test whose required result is pass or fail, such as no-send or isolation. Missing evidence fails closed.
- **Calibration record:** An approved, versioned record that supplies a missing numeric threshold and its measurement method. It must identify the owner, approver role(s), data set, labels, denominator rule, slices, window, revision, and expiry/review date.
- **Golden set:** Synthetic or separately authorized, provenance-labeled evaluation data excluded from training and tuning for the evaluated version.
- **Critical journey:** A tenant onboarding, evidence review, account review, policy review, draft review, or administrative journey named by the release receipt. A critical issue is any issue that prevents access, exposes data, permits a prohibited action, or prevents understanding a consequential state.
- **Unsupported-claim escape:** A consequential or outreach claim reaches qualification, draft, copy/export, or an approval state despite missing, unresolvable, stale, conflicted, revoked, prohibited, or insufficient evidence.
- **Exact account link:** A deterministic, policy-permitted link using an accepted strong identity rule. Fuzzy or model similarity never qualifies as an automatic exact link or irreversible merge.

HTTP status codes, if exposed by an implementation, are transport mappings only. The canonical domain result code in this file remains the source of product meaning and is stored in the receipt.

## 3. Phase model

The six launch phases below are the D-015 release overlay on the plan’s implementation phases 0–10 and the PRD’s phases 0–4. A later implementation phase may be built while an earlier launch phase remains activation-blocked. No phase grants permission to use a source, contact, channel, or provider by itself.

| D-015 phase | Plan/PRD alignment | Permitted state | Hard entry | Hard exit |
|---|---|---|---|---|
| Local foundation | Plan Phase 0 decisions/contracts and local portions of Phases 1–10 | Local code, docs, synthetic fixtures, disposable services, compatibility checks | Repository source-of-truth docs read; authority boundary recorded | Required contracts exist; all missing activation evidence remains visibly blocked |
| Tenant-isolation acceptance | Plan Phases 1–2 and tenant boundary work | Two-tenant local/isolated validation; no live cohort | Foundation contracts accepted; migration rehearsal target exists | Cross-tenant negative tests pass across database, API, worker, cache, retrieval, logs, exports, and model context; authoritative Postgres RLS evidence, recovery, and compatibility evidence exist |
| Internal synthetic validation | Plan Phases 3–10 applicable to synthetic scope; PRD Phases 0–3 | Synthetic/authorized fixtures only; no customer enrollment; no send | Isolation exit; golden-set manifests and evaluators versioned | Required D-015 gates pass for the synthetic slices; owners and approver roles are recorded; no live permission is implied |
| Design partner | PRD Phase 3 bounded design-partner activation | Only separately invited U.S. B2B tenants under D-016 caps; draft/copy/export only | Internal exit, actual individuals assigned, current policy/source/retention/support evidence, separate invitation and opt-in | Cohort receipt shows every active gate, cap, rollback, kill switch, support coverage, and policy result |
| Paid launch | PRD Phase 3 bounded paid state and D-016 paid gate | Current paid cap remains zero until separately activated; no send transport | Design-partner evidence, D-015 pass, isolation evidence on authoritative target, named approvals, support readiness, legal/privacy scope | Paid state remains within approved caps and is suspended or rolled back on any kill condition |
| Expansion | PRD Phase 4 controlled scale | New jurisdictions, sources, data classes, connectors, channels, or caps only by a new decision | Baseline-to-expansion diff, new golden set, policy/evidence/owner/rollback records | Separate expansion approval and passing delta gates; prior phase approval never carries forward automatically |

### 3.1 Accountable roles and actual-person blocker

The accountable approver roles are Product, Engineering/Security, Privacy/Legal, and Support/Operations. Their responsibilities are respectively product scope and metric meaning; isolation, security, reliability, and technical evidence; source/jurisdiction/data-class/claim/retention/channel interpretation; and staffed support, incident, cap, kill, rollback, and communication operation.

An actual individual assigned to each required role, with a current scope and expiry/review date, is a separate activation prerequisite. A role label is not an assignment. Missing or expired assignment returns `D015_OWNER_MISSING` and blocks the affected phase.

## 4. Master gate matrix

The matrix is the single gate register. “N” means the measured numerator; “D” means the measured denominator. An empty denominator is `D015_NO_SAMPLE`, never a pass. A row marked calibration-blocked has no selected numeric target yet; it requires the calibration protocol in Section 5.

| Gate | Metric and exact N/D | Required slice | Threshold | Evidence artifact and window/sample rule | Owner | Approver(s) | Entry / exit | Failure, retry, reset | Kind |
|---|---|---|---|---|---|---|---|---|---|
| QG-001 | Cross-tenant disclosure/write: N prohibited reads, writes, payloads, cache hits, retrieval hits, model-context inclusions, exports, logs, or RLS results; D all required isolation-negative checks | Tenant, workspace, route, verb, worker, cache, export, log, prompt, RLS path, failure mode | N = 0 | Target-perspective two-tenant receipt; each required check has an identity and result; rerun after any boundary change | Engineering/Security | Engineering/Security, Product | Isolation acceptance entry/exit | Stop, quarantine evidence, fix boundary, rerun full affected set; no partial activation | Binary |
| QG-002 | Autonomous send: N transport attempts or send-state transitions caused by Nova Trade code; D all no-send static, route, action, worker, dependency, and artifact probes | Channel, route, worker, actor class, artifact state | N = 0 | D-017 no-send receipt; no live provider call; synthetic probes only | Engineering/Security | Product, Privacy/Legal | Every phase; paid/design partner exit | Kill affected cohort and remove path; rerun structural guard; no reset without new receipt | Binary |
| QG-003 | Unsupported consequential/outreach claim escape: N escaped claims; D all evaluated consequential/outreach claims | Claim class, tenant, play, source, jurisdiction, model/parser version, channel, failure mode | N = 0 | Adversarial policy report with claim/evidence IDs and review decision; golden and boundary fixtures | Privacy/Legal | Product, Privacy/Legal | Synthetic exit and every draft/handoff activation | Block artifact, preserve evidence, invalidate affected version, re-evaluate; one escape kills live scope | Binary |
| QG-004 | Resolvable citations: N required claim citations that resolve under authorized tenant scope; D required citations used in qualification/outreach | Tenant, workspace, play, claim class, source, content class, jurisdiction, model version | 100% | Immutable citation receipt; all required citations included; no sample-size invention | Engineering/Security | Product, Privacy/Legal | Any qualification/outreach gate | Block claim/artifact; repair citation or mark unknown; rerun exact version | Numeric |
| QG-005 | Automatic exact-link precision: N correct automatic exact links confirmed by reviewed labels; D all automatic exact links | Tenant, workspace, cohort, source, account class, jurisdiction, resolver version | ≥ 99% | Reviewed golden/canary report; exact-link labels, rule IDs, exclusions, and denominator; do not round before comparison | Product | Product, Engineering/Security | Internal validation and any account-link activation | Fail link activation, route candidates to review, recalibrate through approved record; reset requires new version | Numeric |
| QG-006 | Duplicate durable side effects: N duplicate observations, messages, outcomes, approvals, exports, ledger entries, or mutations from same idempotency identity; D all replay/retry/concurrency cases | Tenant, workspace, worker, operation, provider, retry class, failure mode | N = 0 | Replay/concurrency receipt with idempotency key and durable-state diff | Engineering/Security | Engineering/Security, Product | Every worker/connector/release gate | Stop worker class, reconcile ledger, replay from immutable input; no “best effort” success | Binary |
| QG-007 | Critical security tests: N passed critical tests; D all tests classified critical in the versioned security manifest | Tenant, workspace, auth role, RLS, cache, export, worker, log, prompt, recovery | N = D | Security test receipt and manifest hash; no denominator reduction after failure | Engineering/Security | Engineering/Security | Isolation and all live-scope exits | Stop rollout, preserve incident evidence, fix and rerun full manifest | Binary |
| QG-008 | Critical accessibility: N critical issues; D critical journeys evaluated against WCAG 2.2 AA criteria and keyboard/semantics/status evidence | Journey, viewport, role, assistive-technology path, failure mode | N = 0; WCAG 2.2 AA required | Accessibility receipt with journey list and issue severity; no issue suppression without documented non-critical classification | Engineering/Security | Product, Engineering/Security | Internal UI exit and any user-facing activation | Block affected journey; remediate and rerun complete journey | Binary |
| QG-009 | Ordinary authenticated read p95: N is the ordered latency distribution’s p95 value in ms; D all measured eligible ordinary reads excluding provider calls | Tenant size, route/API, role, cache state, browser/device, version | p95 < 500 ms | Versioned performance report with raw observations, dataset profile, concurrency, clock, and exclusions | Engineering/Security | Product, Engineering/Security | Performance release gate | Block release, investigate, rerun same profile after fix | Numeric |
| QG-010 | First usable ingestion status: N eligible requests whose first usable status is returned in under 5.000 seconds; D all eligible ingestion requests in the run | Format, file size/page/row/image envelope, parser, tenant, worker version | N = D; each request < 5.000 seconds | Local synthetic performance receipt with one request/status timestamp pair per eligible request; failed requests retained and count in D | Engineering/Security | Product | Ingestion activation | Block ingestion activation; repeat the same profile after remediation | Numeric |
| QG-011 | Queued progress visibility: N eligible jobs whose visible progress appears within 30.000 seconds of queue acceptance; D all eligible queued jobs | Worker class, tenant, job size, retry state, UI route, provider-simulated state | N = D; each job ≤ 30.000 seconds | Queue/UI trace with one acceptance/progress timestamp pair per eligible job; provider calls disabled for local evidence | Engineering/Security | Product, Support/Operations | Worker/user-facing exit | Keep the job non-terminal, surface retry/support state, fix and rerun | Numeric |
| QG-012 | Tenant-facing availability: N eligible monthly service minutes available; D eligible monthly minutes | Authorized production cohort, route class, incident state | 99.9% monthly after production hardening | Production-only authorized SLO receipt; not claimable from local baseline | Support/Operations | Product, Engineering/Security | Paid/production activation only | Incident response, suspend expansion, review monthly window; local results do not reset it | Numeric |
| QG-013 | Extraction quality: N correctly labeled required extraction fields/spans/tables; D labeled fields/spans/tables evaluated | Tenant, workspace, format, parser/OCR version, content/data class, language, failure mode | BLOCKED_THRESHOLD_UNAPPROVED until calibration | Versioned golden-set report with locator-level labels, missing/partial/error policy, owner and approver; no invented target | Product | Product, Engineering/Security | Internal validation entry/exit | Quarantine or review extraction; calibration or parser fix; no activation | Numeric |
| QG-014 | Evidence coverage: N material assertions with required evidence support; D material assertions requiring support | Tenant, play, claim class, content class, source, freshness, jurisdiction | 100% only for required qualification/outreach citations; other coverage BLOCKED_THRESHOLD_UNAPPROVED | Evidence graph report with assertion inventory and support edges; stale/revoked/conflicted states explicit | Product | Product, Privacy/Legal | Understanding, qualification, outreach | Mark unknown/review, block downstream use, rerun exact version | Numeric / binary |
| QG-015 | Merge/unmerge correctness: N reviewed resolutions with incorrect merge, lost provenance, suppression bypass, or incorrect unmerge; D reviewed resolutions | Tenant, account class, relationship, source, resolver version, failure mode | BLOCKED_THRESHOLD_UNAPPROVED; fuzzy auto-merge prohibited by D-011 | Adjudicated resolution report with before/after IDs, evidence, preserved counts, and reversible ledger | Product | Product, Engineering/Security | Account activation and expansion | Disable automatic action; preserve distinct accounts; review/recalibrate | Numeric |
| QG-016 | Question usefulness: N questions rated useful and decision-changing under the approved rubric; D questions adjudicated | Tenant, workspace, business type, play, uncertainty class, question version, reviewer role | BLOCKED_THRESHOLD_UNAPPROVED | Double-reviewed/adjudicated question report with answerability, effort, uncertainty delta, decision unlocked, and unknown outcome | Product | Product | Adaptive-question exit | Continue with safe unknown/review; do not substitute fixed questionnaire; calibrate or revise | Numeric |
| QG-017 | Scoring/reviewer agreement: N adjudicated decisions matching the approved rubric; D all adjudicated decisions | Tenant, play/version, account class, score version, reviewer role, claim class | BLOCKED_THRESHOLD_UNAPPROVED | Independent review and adjudication report; score factors/citations/overrides included | Product | Product, Engineering/Security | Qualification and play activation | Route all affected results to review; recalibrate version; no silent threshold change | Numeric |
| QG-018 | Source/contact/outreach policy decision correctness: N evaluated operations whose allow/block decision exactly matches D-010/D-012/D-013; D all evaluated operations | Tenant, workspace, source, jurisdiction, data class, role, channel, policy version, allowed/prohibited case | N = D, plus zero prohibited operations allowed or executed | D-010/D-012/D-013 policy receipt; allowed and prohibited cases both included with expected decision, source card, terms, authority, freshness, suppression, purpose, and channel fields | Privacy/Legal | Privacy/Legal, Product | Connector/contact/draft gates | Block the operation, preserve provenance, and disable the affected source/channel; no fallback | Binary |
| QG-019 | Worker completion/retry reliability: N jobs reaching correct terminal state without lost provenance; D eligible jobs | Tenant, workspace, worker, job state, retry count, provider-simulated failure, version | BLOCKED_THRESHOLD_UNAPPROVED; required reliability calibration | Job receipt with attempts, leases, backoff, cancellation, checkpoints, terminal state, and cost | Engineering/Security | Engineering/Security, Support/Operations | Internal and live-worker exits | Retry within policy, then bounded dead letter; no duplicate effect; calibrate before activation | Numeric |
| QG-020 | Dead-letter handling: N dead letters with complete reason, owner, replay identity, and safe terminal action; D all dead letters | Tenant, worker, failure mode, source, provider-simulated state | N = D; missing receipt fails | Dead-letter receipt and runbook evidence; no raw prompts/secrets | Support/Operations | Engineering/Security, Support/Operations | Worker/support exit | Hold in dead letter, page owner, replay only from immutable input | Binary |
| QG-021 | Cost per qualified account: N attributable approved local/provider cost; D qualified accounts under the same scope | Tenant, workspace, play, source, model/parser, account class, period | BLOCKED_THRESHOLD_UNAPPROVED | Usage ledger report with currency, estimate/actual, reservation/reconciliation, qualified-account definition, owner and approver | Product | Product, Support/Operations | Discovery/paid/expansion gates | Preview/block uncalibrated spend; no paid call; calibrate with approved record | Numeric |
| QG-022 | Other operation latency: N p95 per named operation; D eligible operation observations | Tenant, route/job, dataset profile, provider state, version | BLOCKED_THRESHOLD_UNAPPROVED; only QG-009 has an inherited p95 target. QG-010 and QG-011 have inherited per-item boundaries, not p95 targets | Raw performance report with synchronous/async boundary and provider exclusion; QG-010/QG-011 receipts retain every eligible request/job | Engineering/Security | Product, Engineering/Security | Before activation of the named operation | Keep operation disabled; calibrate or remediate | Numeric |
| QG-023 | Isolation surfaces beyond RLS: N prohibited cache, log, prompt, export, retrieval, worker, or support-access results; D required surface tests | Tenant, workspace, role, surface, data class, failure mode | N = 0 | Surface-specific negative receipt, redaction diff, prompt-context manifest, export manifest, support audit | Engineering/Security | Engineering/Security, Privacy/Legal | Tenant acceptance and every boundary change | Kill surface, revoke artifacts, investigate; full rerun | Binary |
| QG-024 | Recovery/deletion: N required primary/application-visible checkpoints verified; D required checkpoints in the D-014 deletion manifest | Tenant, data concept, store, legal hold, source/provider, checkpoint | N = D for unheld scope; held scope is explicitly excluded and recorded | D-014 deletion ledger, receipts, backup aging, tombstone and recovery dry-run evidence | Engineering/Security | Privacy/Legal, Engineering/Security | Lifecycle/recovery and paid exit | `deletion_pending` or `deletion_failed`; never report deleted early; retry from checkpoint | Binary |
| QG-025 | Provider/integration readiness: N requested operations with approved source/connector card and executable local contract; D requested operations | Tenant, source, jurisdiction, operation, field, provider version, policy state | N = D; unknown provider/terms fails | Connector conformance receipt; no network call required for local validation | Privacy/Legal | Privacy/Legal, Engineering/Security, Product | Connector or expansion entry | Disable connector, return provider-unknown block, preserve historical evidence | Binary |
| QG-026 | Support/operations readiness: N required runbook, owner, alert, escalation, cap, kill, rollback, and communication items tested; D required items in the activation manifest | Cohort, tenant, worker, source, channel, incident class | N = D; absent actual owner fails | Support readiness receipt and tabletop/synthetic incident evidence | Support/Operations | Support/Operations, Product | Design partner/paid/expansion entry | Keep cohort pending or suspend; assign actual owner and rerun | Binary |
| QG-027 | D-016 cohort ceilings: N active/pending records after requested operation; D hard ceiling from D-016 for the exact cohort dimension | Cohort, tenant, workspace, play, account, contact, channel | Design partner: 3 tenants, 2 workspaces/tenant, 3 active plays/tenant, 100 accounts/tenant, 25 business contact points/tenant, 1 copy/export channel, 0 sends. Paid proposed: 3 tenants, 2 workspaces/tenant, 3 active plays/tenant, 250 accounts/tenant, 50 business contact points/tenant, 1 copy/export channel, 0 sends. Current paid live remains 0. | Cohort cap receipt with exact counters and requested delta; no partial eviction | Product | Product, Support/Operations | Cohort activation/expansion | Reject operation, preserve prior state, remain pending or suspend | Numeric |
| QG-028 | D-007 ingestion envelope: N requested value within limit; D one applicable limit check per file | Format, tenant, content class, parser | 50 MB/file; 500 PDF pages; 100,000 spreadsheet rows; 20 MB/image; encrypted files rejected; unsupported content quarantined | Validation receipt with file metadata, signature, parser state, quarantine reason | Engineering/Security | Product, Privacy/Legal | Ingestion entry | Quarantine/reject before parser; no silent empty document | Binary |
| QG-029 | D-014 lifecycle enforcement: N records violating effective shortest-retention or deletion rule; D all lifecycle checks | Tenant, data concept, store, source, jurisdiction, legal hold | Exports 7 days; operational/model logs 30 days; raw observations/contact freshness 180 days; primary deletion within 30 days; backups age out within 35 days; minimal audit/security tombstones 7 years; shorter rule wins | Lifecycle policy receipt and clock-controlled dry run; freshness is not deletion | Privacy/Legal | Privacy/Legal, Engineering/Security | Lifecycle and cohort exit | Block/export revoke/delete retry; preserve allowed tombstone only | Binary |
| QG-030 | D-012 contact-use decision correctness: N requested contact points whose allow/block decision exactly matches D-012; D all contact points evaluated for research/draft/handoff | Tenant, source, jurisdiction, role, channel, suppression state, allowed/prohibited case | N = D, plus zero prohibited contact points used; the 180-day business-contact threshold and all non-clear/suppressed/unknown blocks remain mandatory | Contact-use policy receipt with expected decision, source, attestation, suppression, purpose, freshness, and policy version | Privacy/Legal | Privacy/Legal, Product | Contact/draft gate | Block and require re-verification; no personal-data fallback | Binary |

## 5. Calibration protocol for missing numeric targets

The following exact protocol applies to QG-013, QG-015, QG-016, QG-017, QG-019, QG-021, QG-022, and any other metric without an inherited target. Until every field is present and approved, the gate result is `D015_CALIBRATION_MISSING` or `D015_METRIC_MISSING`; the affected capability remains disabled.

1. **Declare scope.** Record tenant/workspace/cohort/play, source, content/data class, jurisdiction, channel, role, account class, model/parser/version, failure modes, and the intended phase.
2. **Declare the metric.** Give an unambiguous N and D, units, inclusion/exclusion rules, treatment of abstain/unknown/conflict, empty-denominator behavior, window, clock, and aggregation. Averages cannot replace a required p95 or rate.
3. **Create the evaluation manifest.** Identify synthetic or separately authorized records, provenance, label authority, train/tune/eval separation, counterexamples, adversarial cases, freshness, and leakage checks. No customer record is required or implied.
4. **Set the target.** A numeric threshold may be proposed only from the versioned evaluation record and must name the Product owner and the relevant Engineering/Security, Privacy/Legal, or Support/Operations approver role. The approver must record the rationale and expiry/review date.
5. **Run double review where judgment exists.** Independent reviewers label the records; disagreements are adjudicated and preserved. Account links, extraction labels, question usefulness, and scoring agreement require rule IDs and disagreement counts.
6. **Run slices.** Report every declared slice separately. A small or zero slice is `D015_NO_SAMPLE`, not an aggregate pass. Do not backfill a denominator from another tenant, cohort, source, jurisdiction, role, model, parser, or version.
7. **Freeze and compare.** Hash the manifest, labels, evaluator, policy, model/parser version, and clock. Compare without rounding at the decision boundary. A result cannot approve its own threshold.
8. **Record the decision.** Store the calibration record, receipt, approval roles, actual-person assignment prerequisite, expiry, and reset rule. Threshold changes create a new version and invalidate the affected prior receipt.

Required calibration fields are: `calibration_id`, `metric_id`, `version`, `scope`, `slice_dimensions`, `numerator_definition`, `denominator_definition`, `unit`, `threshold`, `comparison`, `empty_denominator_result`, `window`, `sample_manifest_id`, `provenance`, `train_tune_eval_separation`, `counterexample_manifest_id`, `label_protocol`, `adjudication_protocol`, `freshness`, `leakage_check`, `owner_role`, `approver_roles`, `actual_assignment_required`, `effective_at`, `expires_at`, `evaluator_version`, `policy_version`, `reset_rule`, and `decision_receipt_id`.

## 6. Golden-set contract

Golden sets are synthetic or explicitly authorized. They must not contain unapproved customer data, personal contact data, secrets, or provider responses obtained outside the authority matrix. Each manifest is immutable after evaluation and contains provenance for every record, source/document identifier, data class, jurisdiction, tenant/workspace fixture, play/version, expected labels, allowed unknown state, and freshness.

The manifest must identify train/tune/evaluation separation and prevent leakage through shared source hashes, copied chunks, prompt fixtures, derived labels, or evaluator-generated outputs. It includes positive examples, negatives, ambiguous cases, contradictions, stale/revoked evidence, malformed inputs, prompt-injection text treated as data, duplicate organizations, branches/subsidiaries, and replay/recovery cases. Specialty chemicals and a non-industrial business are required benchmark slices; neither is the universal domain.

Judgment-bearing records require independent review and explicit adjudication. Each record stores the rule ID, expected state, evidence references, labels, disagreement, adjudication reason, evaluator version, and decision effect. Freshness is checked at evaluation time; stale evidence must remain stale. A golden-set version cannot be changed in place. If the manifest becomes stale, leaks into tuning, loses provenance, or has a changed label protocol, it is invalid and produces `D015_EVIDENCE_MISSING`.

## 7. Canonical evaluation data model

Every implementation of a gate must be able to serialize the following logical record. Field names are contract concepts, not a requirement to add code in this task.

```text
GateReceipt {
  receipt_id, gate_id, phase, status, canonical_code,
  tenant_id, workspace_id, cohort_id, play_id, source_id,
  content_class, jurisdiction, channel, role, account_class,
  model_version, parser_version, policy_version,
  metric_definition, numerator, denominator, unit, comparison,
  threshold_value, threshold_version, empty_denominator_result,
  sample_manifest_id, evidence_artifact_ids, evidence_hash,
  started_at, measured_at, expires_at, evaluator_version,
  owner_role, approver_roles, actual_assignment_state,
  idempotency_key, input_hash, side_effect_summary,
  retry_count, failure_mode, reset_rule, notes
}
```

The receipt is immutable. Corrections append a superseding receipt and preserve the prior result. A receipt is valid only if its tenant/workspace scope, policy/model/parser version, clock, evidence hash, and calibration version match the gate request. No client-provided payload field is authority for scope, approval, or phase.

## 8. Deterministic evaluation handoff

A low-capability implementer must evaluate in this order:

1. Load the gate manifest and verify the gate ID, phase, scope, policy version, source authority, and requested operation.
2. Resolve authentication first. If authentication is absent or invalid, return `D015_AUTH_REQUIRED`; then resolve the authenticated tenant and optional workspace, rejecting missing or conflicting scope before loading data.
3. Verify the actual accountable-person assignment prerequisite for the requested activation. Role labels alone are insufficient.
4. Verify source, data class, jurisdiction, channel, retention, suppression, and no-send policy states.
5. Load the exact immutable golden/canary manifest and validate provenance, freshness, version, leakage, and train/eval separation.
6. Verify calibration fields. If an inherited threshold is absent or a required calibration field is missing, return the relevant blocking code without measuring a guessed target.
7. Collect only the declared numerator and denominator. Do not add records to make a slice non-empty; do not remove failures; do not average away a slice.
8. Apply the exact comparison with full precision. For binary gates, every required check must pass. For p95, sort the declared observations using the approved percentile rule and retain raw values.
9. Run the required replay, adversarial, isolation, security, accessibility, recovery, or policy checks for the gate.
10. Write one immutable receipt using the request idempotency key. A same-input replay returns the prior receipt and creates no duplicate durable effect.
11. Transition only to `passed`, `review`, `blocked`, `suspended`, or `rolled_back` through the phase state machine. Never infer activation from a pass alone.
12. Emit the canonical result code and exactly one side-effect/failure action. Preserve safe audit metadata without raw prompts, secrets, document bodies, source excerpts, or prohibited contact data.

```text
evaluate(request):
  validate_shape(request) or return D015_MALFORMED
  auth = resolve_authentication(request) or return D015_AUTH_REQUIRED
  scope = resolve_scope(auth, request) or return D015_SCOPE_FAIL
  owner = resolve_actual_assignment(request.phase) or return D015_OWNER_MISSING
  policy = resolve_policy(scope) or return D015_SCOPE_FAIL
  enforce_no_send_and_source_contact_policy(policy) or return policy_code
  manifest = load_immutable_manifest(request.manifest_id)
  validate_manifest(manifest) or return D015_EVIDENCE_MISSING
  threshold = inherited_or_approved_calibration(request.gate_id)
  threshold or return D015_CALIBRATION_MISSING
  receipt = collect_exact_observations(request, manifest)
  receipt.denominator == 0 and return D015_NO_SAMPLE
  result = compare_without_rounding(receipt, threshold)
  result = run_required_control_tests(result, request)
  write_once(receipt, request.idempotency_key)
  return result
```

Clock rules use the declared UTC measurement timestamps and the policy’s effective version. Version rules require exact model/parser/policy/evaluator hashes. A retry reuses the input hash and idempotency key; a changed input, version, scope, or policy is a new evaluation. Stop immediately on cross-tenant evidence, autonomous-send behavior, unsupported claim escape, unresolved required citation, critical security/accessibility failure, duplicate durable effect, missing owner, missing threshold, or unknown provider authority.

## 9. Canonical result codes

These are domain codes. If an HTTP API exposes them, use the separate transport mapping: authentication required → 401; permission → 403; non-enumerating scope failure → 404 where applicable; `D015_CONFLICT` → 409; malformed → 400; rate limit → 429; internal → 500; provider response → 502; disabled/retry/dead-letter → 503; timeout → 504. `D015_REPLAY_SAME_INPUT` returns the original request's transport status and result, typically success; it is not mapped to 409 merely because it is a replay. HTTP status must never replace the canonical domain code.

| Code | Meaning and required action |
|---|---|
| `D015_PASS` | Gate passed; append immutable receipt and permit only the explicitly scoped next state. |
| `D015_REVIEW` | Evidence is present but a human review/adjudication is required; hold the affected action. |
| `D015_METRIC_MISSING` | Required metric definition or observation is absent; block the gate. |
| `D015_CALIBRATION_MISSING` | Required numeric calibration is absent, expired, or incomplete; block the gate. |
| `D015_OWNER_MISSING` | Actual accountable individual is absent or expired; block activation. |
| `D015_EVIDENCE_MISSING` | Required evidence receipt, provenance, or manifest is absent/invalid; block use. |
| `D015_THRESHOLD_FAIL` | Measured result fails its approved comparison; block and preserve the report. |
| `D015_NO_SAMPLE` | Denominator is empty or a required slice has no observations; do not aggregate around it. |
| `D015_SCOPE_FAIL` | Tenant/workspace/policy/jurisdiction/source scope is missing, conflicting, or not permitted. |
| `D015_ISOLATION_FAIL` | Cross-tenant disclosure or write occurred or could occur; kill affected scope. |
| `D015_SECURITY_FAIL` | Critical security control failed; stop rollout. |
| `D015_ACCESSIBILITY_FAIL` | Critical WCAG 2.2 AA journey issue exists; block affected journey. |
| `D015_RELIABILITY_FAIL` | Worker or service did not complete safely or lost provenance; hold operation. |
| `D015_CITATION_FAIL` | Required citation is absent, unresolvable, unauthorized, stale, revoked, or scoped incorrectly. |
| `D015_CLAIM_FAIL` | Unsupported, conflicted, prohibited, or stale consequential claim reached a gate. |
| `D015_COST_FAIL` | Approved cost ceiling/result was exceeded or attributable cost was unsafe. |
| `D015_LATENCY_FAIL` | Approved latency gate failed. |
| `D015_EXTRACTION_FAIL` | Required extraction is invalid, partial without state, or below approved quality. |
| `D015_ACCOUNT_PRECISION_FAIL` | Automatic exact-link precision is below the inherited 99% target. |
| `D015_MERGE_ERROR_FAIL` | Merge/unmerge lost identity/provenance or made an incorrect durable decision. |
| `D015_QUESTION_FAIL` | Question usefulness/answerability/uncertainty result failed calibration or safety. |
| `D015_SCORING_FAIL` | Scoring/reviewer agreement or factor evidence failed. |
| `D015_SOURCE_POLICY_FAIL` | Source operation, terms, authorization, field, freshness, or jurisdiction is not approved. |
| `D015_CONTACT_POLICY_FAIL` | Contact permitted-use, suppression, freshness, role, or jurisdiction rule failed. |
| `D015_OUTREACH_SEND_FAIL` | Any autonomous or transport send behavior was attempted; kill no-send boundary. |
| `D015_DUPLICATE_SIDE_EFFECT` | A replay/retry/concurrency path created a duplicate durable effect. |
| `D015_RECOVERY_FAIL` | Required recovery/deletion checkpoint or restore evidence failed. |
| `D015_PROVIDER_UNKNOWN` | Provider, terms, operation, field, or integration readiness is unknown. |
| `D015_SUPPORT_FAIL` | Required support/operations owner, alert, runbook, cap, or rollback evidence is absent. |
| `D015_RLS_FAIL` | Authoritative Postgres RLS test failed or was not run for a required scope. |
| `D015_CACHE_FAIL` | Cache key, hit, invalidation, or attribution crossed scope or policy. |
| `D015_LOG_REDACTION_FAIL` | Logs/export/audit emitted prohibited raw content, secret, or personal data. |
| `D015_PROMPT_ISOLATION_FAIL` | Prompt/retrieval context included another tenant or treated untrusted data as authority. |
| `D015_PHASE_BLOCKED` | A required prerequisite, gate, cap, owner, or activation record is missing. |
| `D015_PHASE_ROLLBACK` | A phase must return to its prior bounded state after a kill condition. |
| `D015_REPLAY_SAME_INPUT` | Same input/version/idempotency key replayed; return prior result with no new effect. |
| `D015_CONFLICT` | Version, policy, scope, state, approval, or durable identity conflict prevents evaluation. |
| `D015_MALFORMED` | Request, manifest, metric, timestamp, or required field is malformed. |
| `D015_INTERNAL` | Unexpected local evaluator/store failure; do not report success. |
| `D015_RETRY_PENDING` | Safe retry remains pending after a transient failure; no terminal success. |
| `D015_DEAD_LETTER_FAIL` | Retry budget exhausted or dead letter lacks safe owner/replay evidence. |
| `D015_PERMISSION_FAIL` | Actor lacks the required permission; do not enumerate protected state. |
| `D015_AUTH_REQUIRED` | Authentication is absent or invalid; require authentication before scope resolution. |
| `D015_P95_MISSING` | Required p95 observations or inherited operation threshold are missing. |
| `D015_COST_THRESHOLD_MISSING` | Cost-per-qualified-account target is not approved; block paid/cost-bearing activation. |

## 10. Deterministic scenarios

Each scenario has exactly one canonical code and one side-effect/failure action. Scenario IDs are sequential and stable. A scenario may be replayed, but its expected code and action do not change without a new contract version.

| ID | Fixture/input | Expected code | One side-effect/failure action |
|---|---|---|---|
| S-001 | Two tenants query each other’s account by API | `D015_ISOLATION_FAIL` | Deny and record one safe isolation incident. |
| S-002 | Worker writes an observation with tenant A scope and tenant B ID | `D015_ISOLATION_FAIL` | Reject the write and preserve no cross-tenant row. |
| S-003 | Postgres RLS negative read returns a foreign row | `D015_RLS_FAIL` | Stop the RLS gate and suspend affected scope. |
| S-004 | Cache key omits tenant ID for identical provider IDs | `D015_CACHE_FAIL` | Invalidate the unsafe cache entry. |
| S-005 | Model prompt contains a document chunk from another tenant | `D015_PROMPT_ISOLATION_FAIL` | Abort the run without model execution. |
| S-006 | Export contains a record outside the requested tenant | `D015_ISOLATION_FAIL` | Revoke the export artifact and emit one incident receipt. |
| S-007 | Log includes a raw customer-list cell | `D015_LOG_REDACTION_FAIL` | Suppress the log payload and retain redacted incident metadata. |
| S-008 | Critical security manifest has one failed test | `D015_SECURITY_FAIL` | Stop the phase transition. |
| S-009 | Keyboard-only evidence review cannot reach the citation action | `D015_ACCESSIBILITY_FAIL` | Block the affected critical journey. |
| S-010 | Static scan finds a send provider dependency in launch scope | `D015_OUTREACH_SEND_FAIL` | Kill the launch no-send boundary. |
| S-011 | Worker attempts autonomous send from an approved draft | `D015_OUTREACH_SEND_FAIL` | Reject transport and suspend the affected cohort. |
| S-012 | Unsupported pricing claim reaches copy/export | `D015_CLAIM_FAIL` | Block the artifact and require claim correction/review. |
| S-013 | Citation locator resolves to a different tenant | `D015_CITATION_FAIL` | Block the claim and invalidate the draft. |
| S-014 | All required citations resolve at exact tenant scope | `D015_PASS` | Append one immutable passing receipt. |
| S-015 | Citation coverage is 99.99% with one required unresolved citation | `D015_CITATION_FAIL` | Block the qualification/outreach artifact. |
| S-016 | Citation coverage is 100% and every locator resolves | `D015_PASS` | Append one passing citation receipt. |
| S-017 | Exact-link precision is 98.99% without rounding | `D015_ACCOUNT_PRECISION_FAIL` | Disable automatic exact links and route candidates to review. |
| S-018 | Exact-link precision is exactly 99.00% | `D015_PASS` | Permit only the declared exact-link rule set. |
| S-019 | Fuzzy name similarity proposes a merge | `D015_REVIEW` | Create a review candidate and preserve both accounts. |
| S-020 | Approved merge loses an observation count during unmerge | `D015_MERGE_ERROR_FAIL` | Freeze merge/unmerge and preserve the original ledger. |
| S-021 | Extraction calibration target is absent | `D015_CALIBRATION_MISSING` | Quarantine quality-dependent extraction use. |
| S-022 | PDF exceeds the 500-page D-007 limit | `D015_EXTRACTION_FAIL` | Reject or quarantine before parser execution. |
| S-023 | Spreadsheet exceeds the 100,000-row D-007 limit | `D015_EXTRACTION_FAIL` | Reject or quarantine before parser execution. |
| S-024 | Encrypted file is submitted | `D015_EXTRACTION_FAIL` | Reject the file with its policy reason. |
| S-025 | Partial extraction omits a declared table without a review state | `D015_EXTRACTION_FAIL` | Mark the document review-required and block absence claims. |
| S-026 | Required extraction labels have a valid approved calibration record | `D015_PASS` | Append the extraction evaluation receipt. |
| S-027 | Question usefulness threshold is absent | `D015_CALIBRATION_MISSING` | Keep adaptive-question activation blocked. |
| S-028 | Question repeats a confirmed fact without stale/conflict reason | `D015_QUESTION_FAIL` | Suppress that question and record the policy failure. |
| S-029 | Question asks a high-value unresolved safety classification | `D015_REVIEW` | Hold for reviewer judgment and preserve rationale. |
| S-030 | Scoring comparison has no adjudicated reviewer labels | `D015_EVIDENCE_MISSING` | Block score activation. |
| S-031 | Scoring agreement target is not approved | `D015_CALIBRATION_MISSING` | Keep affected play results review-only. |
| S-032 | Score factor has no citation or explicit unknown state | `D015_SCORING_FAIL` | Remove the factor from downstream qualification. |
| S-033 | Source terms are unknown for a requested connector | `D015_SOURCE_POLICY_FAIL` | Disable the connector operation before access. |
| S-034 | Provider operation is not present in the approved source card | `D015_PROVIDER_UNKNOWN` | Reject the operation without a provider call. |
| S-035 | Contact is 181 days old against the D-012 180-day freshness default | `D015_CONTACT_POLICY_FAIL` | Block contact use and require re-verification. |
| S-036 | Contact is suppressed or opt-out is present | `D015_CONTACT_POLICY_FAIL` | Block draft/handoff and append the suppression result. |
| S-037 | Unknown jurisdiction is requested for a contact handoff | `D015_SOURCE_POLICY_FAIL` | Block the handoff and do not infer permission. |
| S-038 | Draft contains a guaranteed performance claim from general material | `D015_CLAIM_FAIL` | Reject the claim without silently softening it. |
| S-039 | Exact D-017 draft is approved for controlled copy/export | `D015_PASS` | Create one immutable artifact-only handoff receipt. |
| S-040 | Copy/export event is interpreted as proof of send | `D015_OUTREACH_SEND_FAIL` | Reject the send interpretation and preserve artifact semantics. |
| S-041 | Retry repeats the same observation idempotency key | `D015_REPLAY_SAME_INPUT` | Return the prior receipt without a new durable effect. |
| S-042 | Same input arrives with a different policy version | `D015_CONFLICT` | Reject the stale request and require a new evaluation. |
| S-043 | Two workers race on one durable approval | `D015_DUPLICATE_SIDE_EFFECT` | Keep one winner and quarantine the duplicate attempt. |
| S-044 | Worker transient provider failure has remaining retry budget | `D015_RETRY_PENDING` | Schedule one bounded retry with the same input identity. |
| S-045 | Worker retry budget is exhausted without terminal evidence | `D015_DEAD_LETTER_FAIL` | Move to dead letter and assign the support runbook. |
| S-046 | Required p95 observation set is empty | `D015_P95_MISSING` | Block the latency gate. |
| S-047 | Ordinary authenticated read p95 is 501 ms | `D015_LATENCY_FAIL` | Block that release profile. |
| S-048 | Ordinary authenticated read p95 is 499 ms | `D015_PASS` | Record the passing performance receipt. |
| S-049 | Cost-per-qualified-account threshold is absent | `D015_COST_THRESHOLD_MISSING` | Block cost-bearing or paid activation. |
| S-050 | Attributable cost exceeds its approved calibration target | `D015_COST_FAIL` | Pause the affected plan and require budget review. |
| S-051 | Deletion checkpoint is missing for an unheld primary store | `D015_RECOVERY_FAIL` | Keep deletion pending and schedule checkpoint retry. |
| S-052 | Legal hold covers one document version in a deletion request | `D015_REVIEW` | Exclude only the held scope and preserve the hold receipt. |
| S-053 | Backup is still inside the D-014 35-day aging window after primary deletion checkpoints are verified | `D015_PHASE_BLOCKED` | Keep backup-aging/recovery exit pending while preserving separately verified primary deletion truth. |
| S-054 | Support runbook has no actual assigned individual | `D015_OWNER_MISSING` | Keep cohort activation pending. |
| S-055 | Assigned privacy approver has expired | `D015_OWNER_MISSING` | Block the jurisdiction/channel gate. |
| S-056 | Required support alert and rollback drill are absent | `D015_SUPPORT_FAIL` | Keep the cohort in its prior bounded state. |
| S-057 | Design-partner request would create a fourth tenant | `D015_PHASE_BLOCKED` | Reject the operation at the D-016 cap. |
| S-058 | Paid activation requested while current paid live cap is zero | `D015_PHASE_BLOCKED` | Keep paid live at zero. |
| S-059 | Expansion adds an unapproved jurisdiction without a delta record | `D015_SCOPE_FAIL` | Reject expansion and preserve the baseline cohort. |
| S-060 | Phase kill condition is triggered by one cross-tenant disclosure | `D015_PHASE_ROLLBACK` | Suspend the affected phase and revoke new work. |
| S-061 | Gate request omits tenant ID and manifest ID | `D015_MALFORMED` | Reject before data access. |
| S-062 | Actor lacks permission to approve the gate | `D015_PERMISSION_FAIL` | Deny without revealing protected gate state. |
| S-063 | Evaluator store returns an unexpected local error | `D015_INTERNAL` | Return non-success and preserve no partial receipt. |
| S-064 | Required metric definition is absent from the activation manifest | `D015_METRIC_MISSING` | Block the phase until the metric contract exists. |
| S-065 | A result is present but the evidence artifact hash is absent | `D015_EVIDENCE_MISSING` | Reject the receipt and block activation. |
| S-066 | A zero-denominator source slice is hidden by an aggregate pass | `D015_NO_SAMPLE` | Mark the slice unapproved and prevent aggregate activation. |
| S-067 | An approved source returns a malformed required field | `D015_MALFORMED` | Quarantine the observation and stop that operation. |
| S-068 | A stale technical claim is used in qualification | `D015_CITATION_FAIL` | Block the claim until current direct/corroborated evidence exists. |
| S-069 | A worker log exposes a prompt containing a secret | `D015_LOG_REDACTION_FAIL` | Redact the event and suspend the affected logging path. |
| S-070 | A route permits an unapproved workspace to be selected | `D015_SCOPE_FAIL` | Reject the request and emit a non-enumerating scope result. |
| S-071 | A recovery dry run cannot restore the required receipt manifest | `D015_RECOVERY_FAIL` | Block recovery exit and preserve the failure record. |
| S-072 | A human reviewer corrects a claim and the prior receipt is overwritten | `D015_CONFLICT` | Append a superseding receipt and retain the prior immutable record. |
| S-073 | A canary result passes for one model version but is reused for another | `D015_CONFLICT` | Reject the reused receipt and require version-matched evaluation. |
| S-074 | A new source is added during expansion without a kill switch | `D015_PROVIDER_UNKNOWN` | Keep the source disabled until the connector contract is complete. |
| S-075 | A reviewer disagreement is resolved without an adjudication record | `D015_EVIDENCE_MISSING` | Hold the quality result pending adjudication. |
| S-076 | A failed gate is retried after its calibration expiry | `D015_CALIBRATION_MISSING` | Reject the expired calibration and require a new version. |
| S-077 | A measured rate is below its approved numeric threshold | `D015_THRESHOLD_FAIL` | Block the gate and preserve the failed measurement receipt. |
| S-078 | A worker loses provenance while reaching a terminal state | `D015_RELIABILITY_FAIL` | Hold the job and require checkpointed replay. |
| S-079 | First usable ingestion status arrives in 4.999 seconds | `D015_PASS` | Append one passing per-request ingestion-boundary receipt. |
| S-080 | First usable ingestion status arrives in exactly 5.000 seconds | `D015_LATENCY_FAIL` | Block ingestion activation and preserve the boundary failure receipt. |
| S-081 | Queued-job progress appears in exactly 30.000 seconds | `D015_PASS` | Append one passing per-job progress-boundary receipt. |
| S-082 | Queued-job progress appears in 30.001 seconds | `D015_LATENCY_FAIL` | Block the worker/user-facing exit and preserve the boundary failure receipt. |
| S-083 | Gate evaluation request has no valid authentication | `D015_AUTH_REQUIRED` | Reject before tenant or workspace scope resolution. |

## 11. Phase entry, exit, rollback, and kill decisions

### Local foundation

Entry requires the PRD, plan, migration baseline, validation baseline, accepted decision contracts, and execution authority to be recorded. Exit requires all applicable contract rows and result-code/scenario mechanics to exist; missing numbers remain blocked. Rollback means discard only unaccepted local artifacts and preserve the working tree. The kill condition is any request to use customer data, production, paid providers, external communication, or an unapproved destructive operation.

### Tenant-isolation acceptance

Entry requires local foundation exit and a disposable or isolated Postgres migration target. Exit requires QG-001, QG-006, QG-007, QG-023, QG-024, and QG-001 authoritative Postgres RLS evidence, plus compatibility evidence for the existing workflow. Rollback suspends the generalized path and leaves the compatibility path bounded; it does not erase history. Kill immediately on any cross-tenant read/write, cache or prompt leak, unaudited elevation, unrehearsed migration, or non-idempotent durable effect.

### Internal synthetic validation

Entry requires isolation exit, versioned golden manifests, and D-007/D-008/D-009/D-010/D-012/D-013/D-014 policy inputs. Exit requires applicable QG-003–QG-020 and QG-023–QG-030 receipts, with every absent calibration marked blocked. Rollback returns the affected feature to fixture-only review. Kill on unsupported claim escape, unresolved required citation, fixed-questionnaire behavior, unsupported source, prompt injection treated as authority, or critical accessibility/security failure.

### Design partner

Entry requires internal exit; separate invitation and opt-in; actual Product, Engineering/Security, Privacy/Legal, and Support/Operations assignments; U.S. B2B scope; D-010/D-012/D-013/D-014/D-017 evidence; support/rollback contact; and D-016 design-partner caps. Exit is an active bounded cohort receipt with all applicable gates current. Rollback suspends new work, revokes unreleased artifacts, preserves suppression/audit/evidence history, and returns to `DESIGN_PARTNER_PENDING` or `SUSPENDED`. Kill on any isolation failure, autonomous send attempt, unsupported escape, cap breach, owner expiry, or policy violation.

### Paid launch

Paid live is currently zero. Entry requires a separate activation record after design-partner evidence, all D-015 required gates, authoritative-target isolation/RLS evidence, actual named-role assignments, Privacy/Legal scope, Support/Operations coverage, D-017 artifact-only enforcement, and D-016 paid caps. Exit means only that the bounded paid cohort remains within its approved cap and has current receipts; it does not mean the product is generally available. Rollback returns to suspended/zero paid state. Kill on any critical gate regression, missing owner, budget/cost failure, provider uncertainty, recovery failure, or no-send violation.

### Expansion

Entry requires a baseline-to-expansion diff, new or changed golden slices, threshold/calibration records, source/jurisdiction/data-class/channel policy, cap, provider readiness, isolation/security evidence, support runbook, actual assignments, and explicit Product plus Privacy/Legal approval roles. Exit requires all delta gates pass. Rollback removes only the expanded scope and returns to the last accepted bounded state. Kill on any unapproved new scope, unbounded cost, unknown provider terms, policy conflict, or failure in the prior phase’s hard invariant.

## 12. Acceptance checklist and activation blockers

This document is locally acceptable only when all of the following are true:

- [x] Status records local parent acceptance without claiming calibration, role sign-off, or activation.
- [x] Every master-matrix row has an owner role, approver role(s), entry/exit, failure action, retry/reset, and evidence rule.
- [x] All inherited numeric values match the PRD/plan/accepted contracts; absent values are visibly calibration-blocked.
- [x] QG-001 through QG-008 and QG-023 are fail-closed and have deterministic negative tests.
- [x] The golden-set manifest contains provenance, versioning, train/tune/eval separation, counterexamples, freshness, leakage prevention, and review/adjudication fields.
- [x] Every phase has entry, exit, rollback, and kill gates; actual-person assignment is a separate prerequisite.
- [x] Every scenario has exactly one canonical result code and one action; every defined code is scenario-covered.
- [x] D-016 remains accepted as a local contract but its cohort is not activated; D-017 remains artifact-only/no-send.
- [x] D-014 lifecycle/deletion and D-012/D-013 policy guards remain authoritative.
- [x] The current validation baseline is not used as future gate passage.
- [x] Local mechanical validation reports exact scenario/code/row counts, UTF-8 without BOM, final newline, no trailing whitespace, and exact one-file scope.

The following remain explicit blockers and cannot be inferred from local parent acceptance: actual named-person assignment; calibrated extraction/question/scoring/merge/reliability/cost/other-latency targets; golden-set evidence; production Postgres/RLS evidence; security/privacy/legal approval; provider terms/readiness; support staffing and runbooks; live tenant enrollment; customer outcomes; production availability; legal compliance; and deployment.

## 13. Source alignment

This contract was written against:

- `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`
- `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
- `docs/architecture/migration-baseline.md`
- `docs/validation/baseline.md`
- `docs/architecture/evidence-claim-contract.md`
- `docs/architecture/account-resolution-policy.md`
- `docs/architecture/ai-data-policy.md`
- `docs/product/document-support-matrix.md`
- `docs/product/source-connector-allowlist.md`
- `docs/compliance/contact-use-policy.md`
- `docs/compliance/outreach-policy.md`
- `docs/compliance/data-lifecycle-policy.md`
- `docs/product/launch-cohort-contract.md`
- `docs/product/launch-integration-boundary.md`
- `docs/decisions/implementation-authority.md`

The accepted artifacts remain authoritative for their own domains. This document supplies release measurement and gating semantics; it does not widen any upstream permission or replace any policy contract.
