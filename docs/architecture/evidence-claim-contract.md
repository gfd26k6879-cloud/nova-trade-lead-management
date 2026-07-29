# Nova Trade Evidence and Claim Contract (D-008)

**Status:** Parent-conductor accepted local implementation contract; this document does not claim runtime or production enforcement.

**Task:** D-008 — Approve evidence grades and claim-review policy

**Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`

**Dependencies:** D-001 tenant/workspace contract; D-002 RBAC matrix; D-006 document storage and malware-scanning boundary; D-007 document support matrix; D-010 source connector allowlist; D-011 account identity and merge policy; the PRD.

**Evidence tier:** High-integrity documentation contract. Local fixtures can validate shape and transitions. Production activation additionally requires tenant-isolation tests, calibrated golden sets, approved source policy, human-review evidence, and the phase gates named below.

**Scope:** Evidence, provenance, citations, extracted content, claims, conflicts, freshness, absence observations, review decisions, and the gates that allow a claim to affect knowledge, qualification, scoring, account/contact decisions, or outreach.

**Out of scope:** A model/provider choice, legal advice, a universal confidence threshold, live source activation, production migrations, automatic outbound sending, or changing the current application.

## 1. Decision summary

Nova Trade will treat a consequential assertion as a versioned **claim** supported by one or more immutable or versioned **evidence items**. Evidence records what a source returned or what a tenant supplied. A claim is a normalized assertion about a tenant's business, an account, a contact/role, a product, an application, a commercial condition, or a research result. Claims are never proven by an AI confidence number alone.

The contract has separate dimensions:

1. **Evidence observation:** what was seen, supplied, extracted, or calculated, with source and locator.
2. **Evidence provenance:** who/what supplied it, under which connector, document version, parser, policy, and time.
3. **Evidence quality:** whether the item is direct, client-provided, extracted, inferred, corroborated, conflicted, stale, unknown, or not-applicable.
4. **Claim state:** whether a claim is proposed, supported, approved, rejected, superseded, stale, conflicted, retracted, or unknown.
5. **Review state:** whether the required authorized human review is absent, pending, approved, corrected, rejected, or expired.
6. **Operational eligibility:** whether a claim may be used for a particular action such as knowledge synthesis, scoring, contact use, or outreach.

No dimension may be silently substituted for another. For example:

- `parser_confidence=high` does not mean a claim is true or approved.
- A reliable source does not prove that its interpretation is correct.
- A corroborated claim may still be stale or prohibited for outreach.
- A human approval cannot repair a missing citation, unauthorized source, or cross-tenant reference.
- `unknown` and `not_applicable` are valid outcomes and must not be coerced into a positive or negative fact.

All future implementation must preserve the existing local-website workflow as a compatibility play while replacing its lead-centric assumptions with this tenant-scoped contract.

## 2. Normative language and scope

The words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative. A future API or table implementation may use different physical names only if it preserves the semantics and result codes here.

Every tenant-owned evidence, claim, citation, review, retrieval, embedding, export, queue, log reference, and agent artifact has a mandatory `tenant_id`. A `workspace_id` is nullable only for explicitly tenant-wide objects and never widens access. Tenant context is resolved server-side from authenticated membership, a bounded support grant, or a leased worker run; caller-supplied tenant IDs are selectors, not authority.

Evidence from one tenant MUST NOT be used in another tenant's retrieval context, claim, score, prompt, export, cache, or learning proposal. A platform-global policy version or parser version is metadata, not tenant content.

## 3. Current repository inventory versus future contract

### 3.1 Current-state facts

The repository currently contains useful but incomplete evidence primitives:

- `src/lib/ai/*` produces typed business-detail and competitive artifacts with source URLs/evidence, confidence, input hashes, usage tracking, retries, and a review pass.
- `src/lib/crawl/*`, worker leases, crawl units, usage events, and audit logs provide resumable processing and operational history.
- `place_observations` stores Google Places/website observation fields tied to `place_id`, crawl context, endpoints, field masks, raw JSON, and timestamps.
- Current `leads`, `places_master`, `place_cache`, AI artifacts, notes, outreach events, and scores are centered on the legacy lead and website workflow.
- Current discovery is Google Places/local-business and Colorado-market oriented. The official Google Places API path is retained; Google Search/Maps-page scraping and review-text storage/display remain prohibited.
- Current roles are primarily `admin` and `researcher`; D-002 defines the future fixed launch roles and human approval semantics.
- The app uses Supabase/Postgres for the authoritative deployed path and SQLite when `DATABASE_URL` is absent for local development.
- The current system does not provide a complete tenant-scoped evidence/claim lifecycle, general source registry, immutable citation graph, conflict set, adaptive claim review, or per-claim action eligibility.

### 3.2 Future-state contract

The future knowledge boundary separates raw source objects, parsed artifacts, evidence items, claims, reviews, and approved business understanding. Canonical account/contact fields remain projections over evidence and do not replace historical observations. Existing `lead_id` and `place_id` references may be preserved as compatibility aliases, but they cannot be treated as globally unique tenant identities.

This document does not claim that current tables, SQLite, RLS, existing workers, caches, AI artifacts, routes, or exports enforce these rules today. Implementation tasks must add adapters and negative tests before tenant-facing activation.

## 4. Durable vocabulary and entities

The following concepts MUST be represented separately, whether by tables, typed records, or an equivalent durable boundary.

| Concept | Meaning | Required durable fields | Mutation rule |
|---|---|---|---|
| **Evidence item / observation** | A bounded observation of source content, a tenant submission, a parser output, or a deterministic computation. | `evidence_id`, `tenant_id`, source/version IDs, observation time, content hash, locator, raw/derived indicator, evidence grade, parser metadata, policy version. | Append-only. A correction creates a new item and a supersession/correction event. |
| **Source / provenance** | The origin and permitted-use context for an evidence item. | Connector/source card, tenant authorization, URL/document/import/run IDs, actor or provider, retrieval time, terms/policy version, retention class, jurisdiction. | Versioned. Revocation or expiry blocks future use but does not erase history. |
| **Evidence anchor / citation** | A resolvable pointer from a claim/evidence item to source content. | Source/version, immutable locator, content hash, anchor type, normalized offset, redaction metadata, quote bounds. | Immutable for a version; a changed source gets a new citation. |
| **Extracted span** | Text/table/image region produced by a parser from a source version. | `span_id`, parser/version, source chunk/page/row/cell/bounding box, byte/character bounds, extracted hash, parser status. | Immutable output of a parser run. Reprocessing creates a new version. |
| **Claim** | A normalized assertion with subject, predicate, object/value, claim class, scope, polarity, and temporal validity. | `claim_id`, tenant, subject refs, class, value/unit, polarity, version, status, evidence edges, risk flags. | New assertions create versions; no in-place overwrite of approved history. |
| **Claim version** | One exact representation of a claim and its evidence/policy context. | Content hash, created time, effective time, source/evidence set, extraction/model/policy versions, status. | Immutable after creation; later versions supersede or correct explicitly. |
| **Claim-evidence edge** | A typed relationship indicating how an evidence item supports, contradicts, qualifies, or merely contextualizes a claim. | Claim/version, evidence ID, edge type, support polarity, extraction method, created time, actor/run. | Append-only; removal is a tombstoned retraction with reason. |
| **Conflict set** | A set of mutually incompatible claim versions or evidence observations. | Conflict ID, tenant, subject/property scope, member versions, conflict rule, severity, detected time, resolution state. | Visible and blocking for affected gates until resolved or explicitly scoped. |
| **Absence observation** | A bounded result that a defined search did not find a fact. | Scope, sources queried, query/hash, time window, coverage, parser limits, stop rule, counterevidence, result. | Never becomes a positive absence claim without a bounded-test rule and applicable review. |
| **Review decision** | An authorized human decision on a claim version, conflict, evidence eligibility, or action gate. | Decision ID, actor/membership, role, scope, reason, before/after, policy hash, time, conflict handling, approval type. | Append-only. New evidence makes a prior decision stale; it does not edit it. |
| **Supersession/staleness event** | A durable explanation that an evidence item, claim version, or review no longer governs current use. | Prior ID, replacement/new evidence IDs, trigger, input hashes, actor/run, timestamp, affected gates. | Append-only; no silent deletion or overwrite. |

### 4.1 Claim shape

A claim version MUST have a normalized shape equivalent to:

```text
tenant_id
claim_id, claim_version
subject_type, subject_id
claim_class, predicate, value, normalized_value, unit
polarity: positive | negative | conditional | unknown
scope: tenant | workspace | account | location | product | contact_role | play
valid_from, valid_to, observed_at, expires_at
evidence_grade, claim_status, review_state
source_reliability_refs, parser_quality_refs, conflict_set_id?
content_hash, policy_version, created_by_run_or_actor
```

`unknown` is represented as a state/result with a reason, not as an empty string. `not-applicable` is represented only when the claim class or field has been evaluated and does not apply to the subject or play. A missing record means “not evaluated” and is not equivalent to either state.

## 5. Evidence grades and independent dimensions

### 5.1 Evidence grade vocabulary

Each evidence item has one primary grade from this exact vocabulary. Grades describe the item or its relationship to the proposition; they are not a truth score.

| Grade | Deterministic meaning | Permitted implication |
|---|---|---|
| `direct_observation` | A bounded source directly presents the relevant value or event, and the citation resolves to the source version. | Strongest observation form; still may be outdated, wrong, unauthorized, or contradicted. |
| `tenant_client_provided` | The tenant supplied or explicitly stated the information through an authorized upload, note, answer, or import. | Business context can be used under tenant policy; it is not independent corroboration. |
| `extracted` | A parser or OCR process extracted a value from an eligible source span with a resolvable anchor. | Extraction quality and source reliability remain separate gates. |
| `inferred` | A rule, model, or agent derived a proposition from other evidence. | May propose a claim or question; cannot satisfy a direct-evidence gate by itself. |
| `corroborated` | Two or more independent, compatible evidence items support the same claim under the applicable corroboration rule. | Improves support; it does not override a conflict, stale state, or usage restriction. |
| `conflicted` | Evidence or claim versions contain materially incompatible values, scopes, dates, identities, or permissions. | Blocks affected high-impact use until resolved or explicitly bounded. |
| `stale` | Evidence was once eligible but exceeded the freshness policy for its claim class/source or was invalidated by source/version change. | Historical display may remain; current operational use is blocked or review-gated. |
| `unknown` | The system lacks sufficient eligible evidence to assert the proposition, or a required source/field was not evaluated. | Drives adaptive questions or bounded research; never treated as false. |
| `not_applicable` | The proposition is outside the subject/play scope by an explicit rule, with the rule recorded. | Does not count as evidence for or against a different claim. |

Grade assignment is deterministic from evidence facts, edge state, source policy, freshness, conflict set, and parser eligibility. A model may suggest a grade, but a policy evaluator or authorized reviewer must set any grade that gates an operational action.

### 5.2 Evidence-grade transition rules

The source observation kind is immutable. For example, a parser-produced span remains an `extracted` observation even if it later becomes stale. The policy evaluator may maintain a current **evidence eligibility grade** for the evidence-to-claim edge so that freshness, conflict, and coverage can be evaluated without rewriting the original observation. The following are the only automatic transitions:

| Current evidence/edge state | Trigger | Next state | Who/what may cause it |
|---|---|---|---|
| New eligible source observation | Source boundary and provenance validation pass | `direct_observation` or `tenant_client_provided` | Source adapter or tenant submission boundary; policy evaluator validates. |
| New clean parser span | D-007 state permits provisional extraction and anchor/hash validation passes | `extracted` | Parser adapter plus policy evaluator. |
| Derived proposition | Deterministic rule/model records all parent evidence and derivation | `inferred` | Agent proposes; policy evaluator records. |
| Compatible independent evidence set | Corroboration rule passes for the same tenant/subject/scope/class | `corroborated` on the claim edge | Policy evaluator only; never a confidence threshold. |
| Any current non-revoked state | Claim-class freshness window expires | `stale` | Scheduled freshness evaluator or action-time evaluator. |
| Any current state | Source permission, source version, or tenant authorization is revoked | `stale` with revocation flag | Source-policy evaluator; human cannot override source revocation. |
| Any current state | Incompatible evidence or claim version is found | `conflicted` | Conflict evaluator creates a conflict set. |
| Any extracted/derived state | Anchor/hash cannot resolve or extraction coverage is insufficient | `unknown` or ineligible review state | Citation/coverage evaluator; no model upgrade. |
| `unknown` or `stale` | New eligible evidence is added | New evidence/claim edge is evaluated from its facts | Policy evaluator; it does not edit the old item. |
| `not_applicable` | Explicit scope rule changes for the subject/play | New scoped evaluation only | Authorized policy change or human decision; historical result remains. |

An authorized reviewer may resolve a conflict or approve a claim using the evidence set, but the reviewer does not rewrite the original evidence grade. A reviewer may mark a claim edge accepted for a defined action scope; the source observation remains its original kind and retains its staleness/revocation facts. This prevents a reviewer from turning `inferred`, `partial`, or unauthorized evidence into direct proof.

### 5.3 Independent quality fields

The following values MUST NOT be collapsed into one number:

| Dimension | Example values | What it answers | What it cannot answer |
|---|---|---|---|
| Source reliability | `unknown`, `tenant_attested`, `official_first_party`, `licensed`, `public_business`, `provider_observation`, `revoked` | How the source is classified for this tenant, source version, jurisdiction, and use. | Whether the source's statement is true or current. |
| Parser quality | `not_run`, `clean`, `partial`, `malformed`, `blocked`, `review_required` | Whether extraction faithfully captured the source span. | Whether the source statement is accurate. |
| Extraction confidence | `low`, `medium`, `high` with model/calibration version | How certain the parser is about the extracted span. | Truth, approval, legal permission, or freshness. |
| Evidence grade | Exact vocabulary in Section 5.1 | What kind of support/uncertainty the item represents. | Human authorization or source terms. |
| Claim support | `unsupported`, `single`, `corroborated`, `contradicted`, `historical` | How the evidence edges relate to the claim. | Whether the claim is allowed for a particular action. |
| Claim status | Section 7 lifecycle | Whether the claim is proposed/current/blocked/superseded. | Evidence quality or reviewer identity. |
| Review state | `not_required`, `pending`, `approved`, `corrected`, `rejected`, `expired` | Whether the required human gate was satisfied. | Repairing missing provenance or policy denial. |
| Freshness | `current`, `approaching_expiry`, `stale`, `revoked` | Whether time/policy permits current use. | Whether the original observation was true. |
| Action eligibility | Per-action allow/deny result | Whether this claim can be used for the requested operation. | Global truth or permanent approval. |

Scores may be displayed as advisory diagnostics only when they name the dimension, calibration/policy version, inputs, and range. No score or model confidence is a substitute for a required evidence grade or human gate.

## 6. Source reliability, freshness, and calibration

### 6.1 Contextual source reliability

Source reliability is a versioned, contextual input. A source card from D-010, tenant authorization, jurisdiction, retrieval method, and claim class jointly determine the applicable reliability classification. A source is never globally “trusted.”

Examples:

- A tenant's product data sheet may be `tenant_attested` and highly useful for product composition, but it is not independent corroboration of a customer's current use.
- An official company website may be strong for a company's self-described product line but weak for procurement contact identity or current capacity.
- Google Places may provide a business/location observation under the allowed API path; it does not prove technical fit or a person's role.
- An inferred value from a high-reliability source remains `inferred` until a rule or direct evidence supports the claim.
- Revoked, unauthorized, or terms-expired sources remain historical only and cannot satisfy a live gate.

### 6.2 Freshness policy

Freshness is calculated from the latest eligible observation and the claim-class policy, using source timestamp precedence defined below:

1. Use the source's stated `observed_at` when it is authenticated or explicitly provided with provenance.
2. Otherwise use provider/document version time if immutable and attributable.
3. Otherwise use `retrieved_at` and mark the timestamp as retrieval-based.
4. Never fabricate the source's publication or effective date from the ingestion date.

The launch policy profile is `evidence-freshness-v1` and has explicit defaults. D-015 may recalibrate them only through a versioned policy change and golden-set evidence; it may not turn an unsupported claim into supported evidence.

| Claim class | Default current window | Stale behavior |
|---|---:|---|
| Identity/legal name/domain | 365 days | Re-check before merge, export, or outreach. |
| Product/technical specification | 180 days | Human domain review and current document required for operational use. |
| Compatibility/application | 180 days | Stale or inferred fit cannot qualify or support outreach. |
| Regulatory/compliance/safety | 90 days or source-expiry date, whichever is earlier | Fail closed; current authoritative evidence and domain review required. |
| Performance/capacity/supply | 90 days | Fail closed for current qualification, pricing, or outreach. |
| Pricing/commercial | 30 days unless source gives a shorter validity | Never present stale price as current. |
| Geography/locations | 180 days | Re-check before current discovery or routing. |
| Contact/role | 30 days for person/role currentness; source-specific policy may be shorter | Do not use for contact action while stale. |
| Personalization/trigger | 30 days | Treat as historical context; revalidate before draft generation. |
| Customer-provided strategic fact | 365 days or tenant policy | Ask for confirmation when it changes a play or material claim. |
| Negative/absence observation | Search-window-specific; never globally current | Re-run bounded search before using as a disqualifier. |

These windows are explicit policy defaults, not proof and not a legal determination. A claim may be stale earlier when the source revokes it, a newer conflicting observation arrives, a document version changes, a contact opts out, or an account identity changes.

### 6.3 Freshness transitions

- `current -> approaching_expiry` occurs when the configured warning interval is reached; it is informational and does not by itself block a low-risk display.
- `current|approaching_expiry -> stale` occurs at expiry or when an invalidating event arrives.
- `stale -> current` requires a new eligible evidence item and deterministic re-evaluation; it is never a timer-only mutation.
- Any state `-> revoked` occurs when source permission, source version, tenant authorization, or provider terms are withdrawn. Revocation dominates freshness.

## 7. Claim classes and required gates

Every claim has exactly one primary class from this launch vocabulary. A claim may have secondary tags, but a secondary tag cannot reduce the strictest gate.

| Claim class | Examples | Minimum support for operational use | Human/domain gate |
|---|---|---|---|
| `identity` | Company identity, legal name, domain, branch/subsidiary relation | Direct or corroborated identity evidence; D-011 resolution rules. | Human review for merge, conflict, or relationship decision. |
| `product_technical_specification` | MWF component composition/package, epoxy resin viscosity, solids, cure profile, units | Direct or corroborated current technical evidence with anchor and unit normalization. | Domain review before qualification, scoring, or outreach. |
| `compatibility_application` | Fit for fluid formulators, coatings, flooring, adhesives, composites, pipe, or distributors | Direct/corroborated application evidence; inferred fit is a research hypothesis only. | Domain review before qualification or outreach. |
| `regulatory_compliance` | Certification, restricted substance, market authorization, regulatory status | Current direct/corroborated authoritative evidence and source scope. | Authorized domain/compliance review always; fail closed if stale/conflicted. |
| `safety` | SDS-related hazard, handling, storage, safety statement | Current direct/corroborated safety evidence with document/version anchor. | Authorized safety/domain review; fail closed if unsupported/stale/conflicted. |
| `performance` | Corrosion protection, wear, cure, durability, test result | Direct/corroborated test or approved technical evidence with method/conditions. | Domain review before operational use; no extrapolation. |
| `pricing_commercial` | Price, MOQ, lead time, terms, margin, commercial availability | Current direct/corroborated commercial evidence with validity scope. | Commercial owner review before quote/pricing/outreach. |
| `capacity_supply` | Plant capacity, supply availability, lead time, production status | Current direct/corroborated evidence and date. | Operations/commercial review; stale is fail closed. |
| `geography` | Location, service area, shipping region, plant geography | Direct/corroborated location evidence and jurisdiction. | Review for routing or exclusion when ambiguous. |
| `contact_role` | Procurement, technical evaluator, formulator, buyer, economic buyer, role mailbox | Direct/corroborated role evidence with permitted-use state; role hypothesis remains separate. | Human review plus D-012 contact-use gate. |
| `personalization` | Project, recent expansion, product line, trigger used in a draft | Direct/corroborated current evidence tied to the target account. | Human outreach review; sensitive personalization fails closed. |
| `negative_absence` | “No epoxy line found,” “not a distributor,” “no current certification found” | Bounded absence observation with scope, query, time, coverage, parser limits, and counterevidence. | Human review before disqualification, suppression, or outreach exclusion. |
| `customer_provided_strategic_fact` | Customer's target segment, incumbent, margin constraint, preferred geography | Tenant/client-provided evidence with answer provenance and version. | Owner/manager approval before changing an active ICP/play. |

Regulatory, safety, technical, performance, pricing, capacity/supply, and sensitive personalization claims MUST fail closed when unsupported, conflicted, stale, revoked, or only inferred. A reviewer may mark a claim as `corrected`, `rejected`, or `unknown`, but cannot approve a missing citation or prohibited source.

## 8. Citation and provenance contract

### 8.1 Required citation fields

Every evidence-backed claim used in a review, score, export, knowledge version, or outreach draft MUST resolve to citations containing:

- `tenant_id` and, when applicable, `workspace_id`;
- source connector/source card and source authorization/policy version;
- document ID and immutable document version, import ID/row, URL, API response ID, or other source version;
- immutable locator: page, section, heading, paragraph, row, column, cell, table, image bounding box, URL fragment/span, API field path, or structured record key;
- source content hash/checksum and extracted-span hash where applicable;
- `observed_at`, `retrieved_at`, `extracted_at`, and their provenance precision (`source`, `version`, or `retrieval`);
- parser, OCR, extraction, model, prompt, normalization, and policy versions when applicable;
- quote/snippet start/end boundaries, structured value/unit, and negation/conditional markers;
- evidence ID, claim ID/version, edge type, and correlation/run ID;
- privacy classification, redaction status, retention class, and permitted display/use scope.

The locator MUST be stable for the cited source version. A bare URL, model-generated summary, file name, page number without document version, or a database row without tenant/source namespace is not a sufficient citation.

### 8.2 Citation resolution rules

1. Resolve the citation under the requesting actor's effective tenant/workspace scope.
2. Verify source/version still exists or has a retained redacted derivative allowed by policy.
3. Verify checksum/content hash and locator against the immutable version.
4. Apply redaction and personal-data permissions before displaying a quote.
5. If resolution fails, return `EVIDENCE_CITATION_UNRESOLVABLE`; do not silently show the claim as uncited.
6. If the source is revoked or stale, show that state and block actions whose policy requires current evidence.
7. Never expose another tenant's source existence through citation errors, counts, timing, or fallback search.

### 8.3 Quote and redaction rules

Store the minimum excerpt needed to support the claim. Preserve original content in the tenant's authorized private source boundary, but redact secrets, credentials, unnecessary personal data, and prohibited contact data from logs, prompts, exports, and cross-role views. A redacted citation remains valid only if the reviewer can resolve the permitted anchor or the policy explicitly permits metadata-only evidence.

## 9. Evidence eligibility and D-007 parser mapping

D-007 defines parser/ingestion states and provisional parser thresholds. Those thresholds are technical routing defaults, not truth. The following mapping is mandatory:

| D-007/D-006 state | Evidence eligibility | Claim effect |
|---|---|---|
| `blocked_unsupported` | No | Create `unknown`/rejected ingestion result; no claim support. |
| `blocked_security` | No | No model access or evidence extraction; record security event. |
| `scanner_error` | No | Quarantine; no model access, claims, or approved knowledge. |
| `quarantined` / `upload_reserved` / `uploaded` | No | Provenance may exist, but content is not evidence-eligible until clean. |
| `clean` | Not by itself | Safe for parser processing only; no claim support until extraction anchor exists. |
| `review_required` | Conditional, review-only | Extracted spans may be displayed as provisional evidence; cannot satisfy a production/high-impact gate. |
| `needs_review` | Conditional, review-only | Parser output may support a question or review queue; no auto-approval. |
| `extraction_partial` | Partial only | Each span must identify coverage; incomplete output cannot support a whole-document claim. |
| `ready` | Provisional eligible | Anchored spans may support low-risk research and review; `ready` is not `approved_knowledge`. |
| `approved_knowledge` | Eligible within approved scope | Requires explicit authorized human approval, valid citations, no blocking conflict, and current policy. |
| `deletion_pending` / `deletion_failed` / `deleted` | No new operational use | Historical audit handling follows D-006/D-014; no citation may resurrect deleted content. |

Parser confidence is retained with parser version and calibration profile. A high parser score with missing anchors, low coverage, unsupported language, source revocation, prompt-injection data, or conflict remains ineligible for the affected gate. A low parser score cannot be upgraded by a model summary. D-015 may change provisional thresholds only through a versioned calibration decision and regression fixtures.

## 10. Claim lifecycle and deterministic transitions

### 10.1 Claim states

Claim status uses this exact vocabulary:

`draft`, `proposed`, `supported`, `approved`, `rejected`, `corrected`, `conflicted`, `stale`, `superseded`, `retracted`, `unknown`, `not_applicable`.

Review state is independent: `not_required`, `pending`, `approved`, `corrected`, `rejected`, `expired`.

### 10.2 State transition table

| Current | Event/precondition | Next | Actor/causer | Required record |
|---|---|---|---|---|
| none | Valid typed extraction or tenant answer creates assertion | `draft` or `proposed` | Parser/agent/tenant user | New claim version, evidence edges, hashes. |
| `draft` | Schema/provenance validation passes | `proposed` | Policy evaluator | Validation result and run. |
| `draft` | Missing required field/citation or malformed value | `unknown` or reject ingestion | Policy evaluator | Error code and missing-field reason. |
| `proposed` | Eligible evidence supports claim and no blocking conflict | `supported` | Policy evaluator | Evidence set and grade calculation. |
| `proposed` | Required human gate requested | `pending` review state; status remains `proposed` | Agent or policy evaluator | Review task and gate class. |
| `supported` | Authorized reviewer approves required gate | `approved` | Authorized human only | Actor, role, policy/content hash, decision reason. |
| `supported` | Evidence conflict detected | `conflicted` | Policy evaluator or reviewer | Conflict set and blocking fields. |
| any current | New conflicting evidence arrives | `conflicted` or prior review `expired` | Policy evaluator | Supersession/staleness event; old version retained. |
| `approved` | New compatible version replaces it | `superseded` | Policy evaluator after new version exists | Replacement claim ID/version; no silent overwrite. |
| `approved` | Freshness window expires | `stale` | Scheduled policy job or gate evaluator | Policy version, source timestamp, expiry. |
| `stale` | New eligible evidence re-evaluates claim | `supported`, `approved`, or `conflicted` | Policy evaluator; human for gate | New version and, if required, new review. |
| any non-retracted | Authorized human finds false/unsafe claim | `corrected` or `retracted` | Authorized reviewer/domain owner | Correction/retraction reason and replacement/unknown result. |
| any | Reviewer rejects assertion | `rejected` | Authorized human only | Reason, evidence considered, next action. |
| any | Scope rule says proposition does not apply | `not_applicable` | Policy evaluator or authorized reviewer | Rule ID and subject/play scope. |
| any | No eligible evidence after bounded evaluation | `unknown` | Policy evaluator/reviewer | Missing evidence and question/research suggestion. |

Agents MAY create `draft`, `proposed`, conflict candidates, questions, and review tasks. Agents MUST NOT set `approved`, activate a human gate, clear a suppression, resolve a conflict, or make a consequential claim operational. Authorized humans are the only actors that satisfy human gates. An automated policy evaluator may block, stale, supersede, or reject structurally invalid content, but cannot approve it.

### 10.3 No silent overwrite

New evidence creates a new evidence item and claim version. The old observation, claim version, edge, review, score, and audit event remain queryable. Current projections may point to the latest eligible version only after deterministic evaluation. A UI may display “current” but must retain the version ID and history.

## 11. Review gates and action eligibility

### 11.1 Gate algorithm

For an action request `(tenant, actor, action, object, claim_set)`, evaluate in this order:

1. Resolve tenant/workspace and actor authorization using D-001/D-002.
2. Verify source policy and permitted-use using D-006/D-007/D-010/D-012 where applicable.
3. Resolve every citation and verify hash, locator, source version, and redaction.
4. Evaluate evidence grade, parser eligibility, source reliability, claim class, freshness, and conflict sets.
5. Check claim status and review state against the action's minimum policy.
6. Check suppression, opt-out, legal hold, deletion, and account-resolution state.
7. Return a deterministic allow or deny code; never continue on a partial result.
8. Persist the policy evaluation input hash, policy version, decision, and affected claim versions.

### 11.2 Minimum action matrix

| Action | Minimum requirement | Forbidden shortcut |
|---|---|---|
| Internal knowledge draft | Eligible citation or explicit `unknown`; inferred content labeled | Model confidence as truth. |
| Approved business understanding | All material facts cited; high-impact uncertainty listed; authorized human approval | `ready` parser state alone. |
| ICP/play proposal | Claims may be proposed/inferred if labeled; source/search limits explicit | Treating inferred segment as approved market fact. |
| ICP/play activation | Required claims `supported` or `approved` per tenant policy; owner/manager/reviewer gate | Agent-only activation. |
| Candidate discovery | Source observation and source policy eligible; no unsupported account identity | Global `place_id`, domain, or model match. |
| Qualification/score | Play-specific factors with citations; blocked classes fail closed; conflicts visible | One opaque confidence/priority number. |
| Account merge/link | D-011 exact rule or authorized review; identity citations current | Fuzzy similarity or newest-record wins. |
| Contact/role use | D-012 permitted-use, current source, suppression check, role evidence | Role hypothesis treated as verified person. |
| Outreach draft | Approved tenant facts, current account evidence, cited material claims, policy pass | Unsupported technical/regulatory/pricing/personalization claim. |
| Copy/export | Export policy, citations/redaction, reviewer/role permission, no suppressed contact | Hidden claim or stale contact in export. |
| Any live send | Separate future connector and policy authorization, human approval, final revalidation | This D-008 contract alone. |

### 11.3 Fail-closed classes

The action evaluator MUST deny or route to review for `regulatory_compliance`, `safety`, `product_technical_specification`, `compatibility_application`, `performance`, `pricing_commercial`, `capacity_supply`, and sensitive `personalization` when any required support is unsupported, inferred-only, conflicted, stale, revoked, citation-unresolvable, or outside permitted source scope. The evaluator MUST use `CLAIM_ACTION_BLOCKED_UNSUPPORTED` or the more specific code in Section 15.

## 12. Absence and negative claims

“Not found” is a bounded observation, not proof that a property does not exist. A negative/absence claim MUST include:

- exact searched tenant/account/play scope;
- sources, domains, connectors, datasets, and source versions covered;
- query text or normalized query hash and filters;
- start/end time and retrieval timestamps;
- page/row/result coverage and stop condition;
- parser/OCR/language limitations and excluded content;
- observed counterevidence or an explicit `none observed` result;
- whether the result is `not_found`, `not_evaluated`, `inconclusive`, or `contradicted`;
- claim class, polarity, policy version, and reviewer requirement.

Examples:

- “No epoxy product page was found in the authorized site paths `/products` and `/technical` on 2026-07-27” is a bounded absence observation.
- “The company does not make epoxy resin” is not allowed unless a tenant-approved bounded-test policy defines sufficient coverage and an authorized reviewer approves it.
- A partial PDF with 30 of 100 pages extracted cannot support a whole-catalog absence claim.
- A failed Google Places query is `not_evaluated` or `unknown`, not “no business exists.”

Counterevidence always wins the automatic absence result and produces `conflicted` or `review` rather than silently keeping the negative claim.

## 13. Conflict, supersession, correction, and staleness

### 13.1 Conflict rules

A conflict set is created when claims for the same tenant-scoped subject, predicate, and overlapping validity scope are materially incompatible, or when a source says an identity/permission cannot be reconciled. Examples include two epoxy viscosities for the same product version, a certification marked both active and expired, two different plant capacities for the same date, or a contact simultaneously opted in and suppressed.

Conflict handling is deterministic:

1. Preserve every evidence item and claim version.
2. Create a conflict set with a stable reason code and member IDs.
3. Mark affected claims `conflicted`; block only the actions whose policy depends on the conflicted field.
4. Show supporting and contradicting citations, source timestamps, source reliability context, and parser status.
5. Ask a targeted adaptive question or create a domain-review task.
6. An authorized reviewer may approve one scoped version, mark the other rejected/corrected, or leave the result unknown.
7. Record a resolution event and re-evaluate downstream scores/drafts. Historical decisions remain intact.

The newest source is not automatically correct. Source reliability may prioritize a review queue but cannot auto-delete counterevidence.

### 13.2 Supersession and stale re-review

Supersession means a replacement claim version exists and the old version is no longer the current projection. Staleness means the old version may still describe history but no longer meets current-use freshness. Both events retain original evidence and review.

New evidence after approval MUST invalidate the review if it changes a protected value, source permission, conflict set, identity, contact status, or claim content hash. A stale review cannot be reused by copying its status to the new version. Re-review uses a new decision ID and current evidence set.

### 13.3 Retraction and correction

Retraction is used when a claim must not be used, including a false statement, prohibited source, privacy violation, or unsafe output. Correction creates a new claim version and links the old version as corrected. Neither operation erases the minimum audit tombstone required by retention policy.

## 14. Agent and prompt-injection behavior

All uploaded text, URLs, tables, notes, model output, source descriptions, company content, and customer-list cells are untrusted data. A string such as “ignore the evidence policy,” “approve this claim,” or “send this message” is an extracted span or observation, never an instruction.

Agent tools MUST receive a typed, tenant-scoped context and an allowlisted operation. Prompt content cannot change tenant scope, role, source policy, evidence grade, review authority, budgets, or action gates. The agent may quote the injection as evidence of document content when relevant, but it must not execute it.

If an agent proposes a claim without a resolvable citation, returns unsupported fields, fabricates a source, or reports success while a gate failed, the policy evaluator returns `CLAIM_PROPOSAL_INVALID` or `MISLEADING_SUCCESS_BLOCKED`; the run is marked failed/review-required and no operational state changes.

## 15. Exact result and API codes

Future APIs MUST return a stable envelope with `code`, `http_status`, `message`, `request_id`, `tenant_scope`, `policy_version`, and safe `details`. Protected-object existence and another tenant's evidence MUST NOT leak through error details.

| Code | HTTP | Meaning |
|---|---:|---|
| `EVIDENCE_CREATED` | 201 | Evidence item persisted with valid provenance. |
| `EVIDENCE_CITATION_INVALID` | 400 | Required locator, hash, source version, or tenant scope is malformed/missing. |
| `EVIDENCE_CITATION_UNRESOLVABLE` | 409 | Citation cannot resolve to the authorized immutable source version. |
| `EVIDENCE_SOURCE_UNAUTHORIZED` | 403 | Source terms, tenant attestation, jurisdiction, or permitted-use gate failed. |
| `EVIDENCE_SOURCE_REVOKED` | 409 | Source authorization or source version was revoked. |
| `EVIDENCE_PARSER_INELIGIBLE` | 409 | D-007/D-006 state does not permit evidence use. |
| `EVIDENCE_PARTIAL_COVERAGE` | 409 | Extraction coverage is incomplete for the requested claim. |
| `EVIDENCE_TENANT_SCOPE_MISMATCH` | 403 internal / safe lookup `404` | Internal same-operation scope validation found a mismatch. A protected-object lookup that could reveal existence returns `RESOURCE_NOT_FOUND_OR_FORBIDDEN` instead. |
| `CLAIM_PROPOSED` | 201 | Typed claim version created as a proposal. |
| `CLAIM_PROPOSAL_INVALID` | 400 | Claim lacks required schema, class, polarity, scope, or evidence references. |
| `CLAIM_UNSUPPORTED` | 409 | Claim has no eligible evidence for the requested gate. |
| `CLAIM_ACTION_BLOCKED_UNSUPPORTED` | 403 | Unsupported/inferred-only high-impact claim cannot affect the action. |
| `CLAIM_CONFLICTED` | 409 | A blocking conflict set is present. |
| `CLAIM_STALE` | 409 | Claim or evidence exceeded freshness or was invalidated. |
| `CLAIM_SUPERSEDED` | 409 | A newer claim version governs; caller used an old version. |
| `CLAIM_RETRACTED` | 410 | Claim was explicitly retracted and cannot be used. |
| `CLAIM_UNKNOWN` | 200 | Evaluation completed without sufficient evidence; result is unknown. |
| `CLAIM_NOT_APPLICABLE` | 200 | Explicit scope rule says the claim does not apply. |
| `CONFLICT_REVIEW_REQUIRED` | 409 | Conflict must be resolved or scoped by an authorized human. |
| `REVIEW_REQUIRED` | 409 | Required human/domain review is absent. |
| `REVIEW_ACTOR_UNAUTHORIZED` | 403 | Actor lacks the D-002 role/scope for this review. |
| `REVIEW_SELF_APPROVAL_BLOCKED` | 409 | Separation-of-duty rule blocks the actor's approval. |
| `REVIEW_STALE` | 409 | Reviewed content hash/evidence set changed. |
| `REVIEW_DECISION_RECORDED` | 200 | Authorized review decision appended. |
| `ABSENCE_SCOPE_INVALID` | 400 | Absence observation lacks bounded scope, query, time, coverage, or stop rule. |
| `ABSENCE_NOT_PROOF` | 409 | Caller attempted to convert not-found evidence into an unbounded absence fact. |
| `PROMPT_INJECTION_DATA_ONLY` | 200 | Instruction-like content was retained as data and ignored for control flow. |
| `MISLEADING_SUCCESS_BLOCKED` | 409 | Worker/model reported success despite failed evidence or policy validation. |
| `SUPPRESSION_OR_POLICY_BLOCKED` | 403 | Suppression, opt-out, source policy, privacy, or action policy wins. |
| `TENANT_SCOPE_REQUIRED` | 400 | Tenant context was omitted. |
| `RESOURCE_NOT_FOUND_OR_FORBIDDEN` | 404 | Safe response for absent or unauthorized evidence/claim. |

The codes are stable contract values. A transport may use a typed result for local calls, but it MUST preserve the code and deny/allow semantics.

## 16. Audit, exports, and isolation

Append-only audit events are required for evidence creation, parser result, citation resolution, claim proposal, grade change, conflict creation/resolution, review request/decision, stale/retraction/supersession, export, and action-gate evaluation. Each event includes tenant/workspace, actor or worker lease, source/run/document/claim IDs, policy/model/parser versions, input/output hashes, reason, decision code, and correlation ID. Raw secrets and unnecessary personal data are excluded.

Exports MUST include claim version, evidence IDs, source label, citation locator, observed/retrieved time, freshness, review state, conflict state, and redaction indicators. An export may omit content under retention/privacy policy, but it must not represent an omitted citation as proof. Suppressed contacts and prohibited personal fields are excluded or redacted according to D-012.

Cross-tenant tests MUST attempt reads and writes using the same source ID, document checksum, URL, claim ID, account ID, contact role, and citation locator in two tenants. An external protected-object probe receives `RESOURCE_NOT_FOUND_OR_FORBIDDEN`; `EVIDENCE_TENANT_SCOPE_MISMATCH` is reserved for an internal validation path that is already authorized to know both objects. Neither path may disclose another tenant's evidence. Cache keys, embeddings, retrieval filters, worker payloads, and logs must include tenant scope.

## 17. Specialty-chemicals and non-industrial examples

### 17.1 Specialty chemicals

- A client-provided metalworking-fluid component catalog states a package composition and recommended concentration. The extracted table cells can support a `product_technical_specification` claim only with page/table/cell anchors, units, document version, and parser coverage. It does not prove a customer's compatibility.
- A current technical data sheet reports epoxy resin viscosity and cure conditions. It supports a technical claim after domain review; a model extrapolating “therefore ideal for pipe manufacturing” creates an `inferred` application hypothesis, not an approved fit claim.
- A customer note says the client wants formulators. This is a `customer_provided_strategic_fact`. It can inform an ICP/play after owner/manager approval but is not public account evidence.
- A coatings maker's authorized website describes epoxy flooring products. This can support an account/application observation. It does not prove that the company buys this client's resin, has current capacity, or is a qualified contact target.
- A distributor catalog listing the client's resin creates a relationship/application claim for distributor research. It must not merge the distributor with the manufacturer.
- A safety or regulatory claim from an old SDS, unsupported marketing page, or stale certificate fails closed. The system must request current source evidence and authorized domain review.

### 17.2 Non-industrial examples

- A SaaS pricing page with a dated plan table supports a commercial claim for that page version; a current price requires the freshness policy and tenant review.
- A clinic's authorized staff directory may support a role hypothesis, but a person-level contact action requires permitted-use, currentness, and suppression checks.
- A services firm brochure stating “serves nonprofits” supports a client-provided or extracted segment claim; it does not prove every nonprofit is a good-fit account.
- A franchise website shared across locations is identity evidence only within the bounded page/location context; it cannot auto-merge independent franchisees.

## 18. Deterministic golden scenarios

Each fixture must assert input tenant/scope, source and version IDs, evidence grade, claim state, review state, result code, action eligibility, preserved provenance count, and audit event. These scenarios are expected contract outcomes, not current-runtime evidence.

| ID | Scenario | Expected deterministic result |
|---|---|---|
| G01 | Direct product specification in a clean PDF table | `extracted` evidence with page/table/cell citation; technical claim `supported`; outreach remains review-gated. |
| G02 | Tenant note states target formulators | `tenant_client_provided`; strategic fact `proposed`; owner/manager review required before play activation. |
| G03 | Two independent current technical sheets agree | Claim becomes `corroborated`; domain review still required. |
| G04 | Two current sheets report different epoxy viscosity | Conflict set; claim `conflicted`; `CLAIM_CONFLICTED`; technical action blocked. |
| G05 | Parser returns `ready` with no page anchor | `EVIDENCE_CITATION_INVALID`; no claim support. |
| G06 | Parser returns high confidence for only half a catalog | `EVIDENCE_PARTIAL_COVERAGE`; whole-catalog claim remains unknown. |
| G07 | D-007 `extraction_partial` / partial extraction contains one valid page span | That span may be review-only evidence; whole-document claim is not eligible. |
| G08 | D-006 scanner timeout after upload | `scanner_error`; quarantined content cannot enter model context or knowledge. |
| G09 | Old SDS passes parser but exceeds 90-day safety window | Evidence/claim `stale`; `CLAIM_ACTION_BLOCKED_UNSUPPORTED` until fresh review. |
| G10 | Official website says product exists, no capacity evidence | Product claim may be supported; capacity remains `unknown`, never inferred. |
| G11 | Google Places business observation matches same tenant/source namespace | Identity observation may auto-link under D-011; it cannot prove technical fit. |
| G12 | Same Google `place_id` appears in two tenants | Two isolated evidence records; no cross-tenant disclosure or link. |
| G13 | Same domain used by parent and distributor | Identity conflict/relationship review; no domain-only merge. |
| G14 | Fuzzy name/address similarity only | `inferred` candidate; review required; no auto-merge. |
| G15 | Contact role from 45-day-old source | Contact claim `stale`; D-012 contact action blocked. |
| G16 | Procurement role is a hypothesis inferred from job text | Role hypothesis only; cannot be exported as verified contact. |
| G17 | Customer list row contains a personal mobile without permitted-use | Evidence may be retained in private quarantine; contact use `SUPPRESSION_OR_POLICY_BLOCKED`. |
| G18 | Price page has valid 30-day terms but is 31 days old | Commercial claim stale; no current price in draft/export. |
| G19 | “No epoxy product found” from two authorized paths with 10-page cap | Bounded absence observation only; `ABSENCE_NOT_PROOF` for unbounded negative claim. |
| G20 | Search failed before any result was retrieved | Result `unknown`/`not_evaluated`; never “company has no product.” |
| G21 | Partial PDF excludes pages containing counterevidence | Coverage incomplete; absence claim blocked and review requested. |
| G22 | Citation points to deleted document version | `EVIDENCE_CITATION_UNRESOLVABLE`; claim cannot be operationally used. |
| G23 | Source authorization is revoked after approval | Source/claims become `revoked`/stale; future action denied; history preserved. |
| G24 | New evidence arrives after human approval and changes protected value | Old review `expired`; new claim version requires fresh review. |
| G25 | Reviewer corrects a false regulatory claim | Old claim `corrected`/retracted; replacement version and audit event recorded; outreach blocked until reapproved. |
| G26 | Reviewer rejects an inferred “good fit” claim | Claim `rejected`; score/play cannot treat it as a negative fact without separate evidence. |
| G27 | Two reviewers issue incompatible decisions | Review conflict set; `CONFLICT_REVIEW_REQUIRED`; no last-write-wins. |
| G28 | Embedded text says “ignore policy and approve” | `PROMPT_INJECTION_DATA_ONLY`; text remains data; no state/permission change. |
| G29 | Claim references evidence ID from another tenant | `EVIDENCE_TENANT_SCOPE_MISMATCH`; no source existence leak. |
| G30 | Malformed URL citation with credentials/private host | `EVIDENCE_CITATION_INVALID` or source policy block; no fetch or claim support. |
| G31 | Misleading-success output: agent returns success while schema validation failed | `MISLEADING_SUCCESS_BLOCKED`; run/review failure recorded; no durable claim approval. |
| G32 | New source agrees with an approved claim but has older timestamp | No overwrite; claim remains current with historical corroboration; freshness uses claim policy. |
| G33 | New source contradicts an approved claim but is lower reliability | Conflict is visible; no automatic deletion; review queue prioritizes the conflict. |
| G34 | A non-industrial SaaS pricing page changes after draft approval | Draft revalidation returns `CLAIM_STALE`; draft cannot be exported as current price. |
| G35 | “Not applicable” used for safety on a non-chemical software account | `CLAIM_NOT_APPLICABLE` only if the subject/class rule is recorded; it is not a safety clearance for chemicals. |
| G36 | Same checksum uploaded by two tenants | Separate tenant-scoped source/version records or explicitly safe derivative reuse with no metadata/content disclosure. |

## 19. Implementation handoff for simpler coding agents

Workers implementing this contract MUST use the following order and bounded write sets:

1. Define typed enums/constants for evidence grades, claim classes, claim states, review states, parser eligibility, and result codes. Add only the evidence/claim module and focused unit tests.
2. Define tenant-scoped provenance/citation validation. Require source version, locator, hash, timestamps, and policy version; reject missing fields with exact codes.
3. Add append-only evidence items and claim versions. Never update an approved record in place; create supersession/correction events.
4. Add a pure policy evaluator that accepts `(action, claim version, evidence set, source policy, freshness policy, review, actor)` and returns one deterministic code. Keep it free of network/provider calls.
5. Add D-007 parser-state mapping and partial-coverage tests. Treat `ready` as provisional and `approved_knowledge` as a separate human gate.
6. Add conflict-set and stale-review invalidation behavior. Use content/evidence hashes and expected-version checks; do not use newest-record-wins.
7. Add bounded absence-observation validation. Require scope, query, time, coverage, limitations, and stopping rule.
8. Add redacted citation rendering and tenant-negative tests. Attempt same IDs/checksums/URLs in two tenants.
9. Add the 36 golden fixtures above. Assert state, code, gate, audit event, and preserved provenance, not only a boolean confidence value.
10. Integrate consumers only after the pure contract tests pass. Outreach, contact use, scoring, merge, export, and knowledge approval must call the evaluator and handle every deny code.

Worker rules:

- Do not invent confidence thresholds or use model output as approval.
- Do not add provider calls, live migrations, external data, contact enrichment, or outreach sending in this contract slice.
- If a required dependency is absent, return a typed blocked/review result and preserve the evidence; do not make a permissive fallback.
- If a citation or tenant context is missing, fail closed before reading another object.
- Record exact policy/parser/model versions in test fixtures so a later calibration change is explicit.
- Keep legacy `lead_id`/`place_id` compatibility mappings separate from future canonical tenant identity.

## 20. Acceptance criteria and activation gates

D-008 is ready for parent-conductor acceptance when:

- all durable concepts in Section 4 are distinct and have append-only/versioned semantics;
- all nine evidence grades exist with deterministic definitions;
- source reliability, parser quality, extraction confidence, claim state, review state, freshness, and action eligibility are independent;
- every transition has an event, precondition, actor/causer, and audit record;
- agents cannot satisfy human gates and new evidence cannot silently overwrite approved history;
- all listed claim classes have explicit evidence/review requirements;
- high-impact unsupported, conflicted, stale, revoked, or inferred-only claims fail closed;
- citations contain the required tenant/source/version/hash/locator/time/parser-policy/redaction fields and resolve under authorization;
- absence claims require bounded scope and never become unbounded evidence of absence;
- D-007 parser states map to eligibility without treating provisional thresholds as truth;
- conflicts, supersession, stale re-review, correction, retraction, exports, audit, isolation, and prompt injection are specified;
- specialty-chemicals and non-industrial examples are covered;
- at least 28 deterministic golden scenarios exist; this contract provides 36;
- exact API/result codes are stable and implementation-ready;
- the document makes no claim of current runtime enforcement, legal approval, provider approval, production readiness, or outreach permission.

Activation remains blocked until implementation proves, on the named target, tenant isolation, citation resolution, parser/coverage behavior, policy-gate denial, reviewer separation of duty, source revocation, stale re-review, recovery/export behavior, and the relevant D-010/D-012/D-014/D-015 gates. Local documentation and fixture checks do not constitute production activation evidence.

## 21. Validation receipt for this documentation slice

The worker must run these checks after writing the file. The parent conductor independently reviews the semantics and records acceptance in the append-only ledger.

```powershell
$target = 'docs/architecture/evidence-claim-contract.md'
Test-Path $target

# New-file-aware whitespace check. Exit 1 from --no-index is expected; diagnostics are not.
git diff --no-index --check -- NUL $target

$trailing = Select-String -Path $target -Pattern '[ \t]+$'
if ($trailing) { $trailing; throw 'Trailing whitespace found' }

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $target))
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'UTF-8 BOM found' }
$text = [System.IO.File]::ReadAllText((Resolve-Path $target))
if ($text -match '(?m)^[ \t]+$') { throw 'Blank whitespace line found' }
$badMarkers = @('TO'+'DO','T'+'BD','FIX'+'ME','place'+'holder','lorem'+' ipsum')
foreach ($marker in $badMarkers) { if ($text -match [regex]::Escape($marker)) { throw 'Forbidden marker found' } }
if (-not $text.EndsWith("`r`n") -and -not $text.EndsWith("`n")) { throw 'Missing final newline' }

$grades = @('direct_observation','tenant_client_provided','extracted','inferred','corroborated','conflicted','stale','unknown','not_applicable')
foreach ($value in $grades) { if (-not ($text -match [regex]::Escape($value))) { throw "Missing grade: $value" } }
$classes = @('identity','product_technical_specification','compatibility_application','regulatory_compliance','safety','performance','pricing_commercial','capacity_supply','geography','contact_role','personalization','negative_absence','customer_provided_strategic_fact')
foreach ($value in $classes) { if (-not ($text -match [regex]::Escape($value))) { throw "Missing claim class: $value" } }
$states = @('draft','proposed','supported','approved','rejected','corrected','conflicted','stale','superseded','retracted','unknown','not_applicable')
foreach ($value in $states) { if (-not ($text -match [regex]::Escape($value))) { throw "Missing claim state: $value" } }
$transitionCount = ([regex]::Matches($text, '(?m)^\| `?(?:none|draft|proposed|supported|approved|stale|any)(?:`| current| non-retracted)?')).Count
if ($transitionCount -lt 12) { throw "Transition row count $transitionCount is below 12" }
$scenarioCount = ([regex]::Matches($text, '(?m)^\| G\d{2} \|')).Count
if ($scenarioCount -lt 28) { throw "Golden scenario count $scenarioCount is below 28" }
$codeCount = ([regex]::Matches($text, '(?m)^\| `?[A-Z][A-Z0-9_]+`? \| \d{3} \|')).Count
if ($codeCount -lt 20) { throw "Result-code count $codeCount is below 20" }
```

Expected receipt for this worker:

- Target exists and is the only file written by this task.
- `git diff --no-index --check -- NUL <target>` exits `1` for an untracked new file and emits no whitespace diagnostics.
- Explicit trailing-whitespace, BOM, EOF, and forbidden-marker scans pass.
- Structural counts report at least 9 grades, 13 claim classes, 36 golden scenarios, and 20 exact result codes.
- No code, configuration, package, migration, database, provider, customer-data, outreach, branch, commit, push, or PR change occurred.
- Parent-conductor semantic review and ledger acceptance remain pending.

**Activation blockers:** runtime evidence/claim tables and policy evaluator are not yet implemented; current legacy records are not fully tenant-scoped; D-012 permitted-use, D-014 lifecycle/retention, D-015 calibration, source terms, jurisdiction, malware scanning, and production/Postgres isolation evidence remain separate gates.
