# Nova Trade Multi-Tenant Lead Intelligence and Outreach Platform

## Product Requirements Document

**Status:** Proposed product evolution
**Date:** 2026-07-27
**Owner:** Nova Trade
**Scope:** Product and system behavior; documentation only

## 1. Executive summary

Nova Trade should evolve from an invite-only, local-business website-lead tool into a multi-tenant, agent-driven B2B lead-intelligence and outreach platform. Each client should be able to provide the materials that make its business understandable—product PDFs, data sheets, catalogs, websites, notes, customer lists, market descriptions, and other authorized sources. Nova Trade agents should turn that evidence into a working business model, expose uncertainty, ask adaptive high-value questions, and then find and qualify companies using search logic specific to that client.

The platform is not a fixed questionnaire, a generic lead list, or an autonomous spam sender. It is a human-supervised research and revenue workflow. It should produce an evidence-backed ideal-customer profile (ICP), multiple reusable lead plays, candidate accounts, buying-center hypotheses, relevant contacts, explainable scores, recommended next actions, and human-reviewable outreach drafts. Outcomes should feed back into the client’s play definitions, questions, scoring, and source strategy without silently changing the client’s operating rules.

The industrial specialty-chemicals example makes the target product concrete: a client may sell metalworking-fluid components or packages and epoxy resins. Useful target segments may include fluid formulators, coatings makers, flooring and civil-engineering suppliers, adhesives and composites manufacturers, pipe manufacturers, and distributors. The platform must support this example without making chemicals, manufacturing, or any one geography a product limitation.

The recommendation is to evolve the existing Nova Trade foundation—Next.js App Router, Supabase/Postgres, local SQLite development fallback, server actions, worker leasing, Google Places API integration, explainable scoring, AI verification/artifacts, role checks, audit logging, budgets, quality workbench, and copy-only outreach—while replacing or generalizing assumptions that currently bind discovery to local websites, Colorado zip coverage, `place_id`-centric leads, and a single internal account model.

## 2. Product vision and principles

### Vision

For every client business, Nova Trade becomes a trusted research teammate that understands what the client sells, who buys it, why they buy, and how to reach the right people—while showing the evidence and leaving consequential decisions with humans.

### Product principles

1. **Evidence before confidence.** Every material claim should link to source evidence, extraction context, freshness, and confidence. Unknown is a valid result.
2. **Adaptive discovery, not a fixed questionnaire.** The next question, search query, connector, and qualification test should depend on the client’s materials, prior answers, uncertainty, and observed outcomes.
3. **Human control at consequential boundaries.** A human approves ICP changes, lead-play activation, high-impact search runs, contact use, and every outbound send in early phases.
4. **Tenant data is client property.** Tenant data, private documents, customer lists, prompts, scores, contacts, and outcomes must be isolated and must not become another tenant’s context or training data by default.
5. **Compliant by construction.** Connectors honor provider terms, source restrictions, privacy obligations, consent and opt-out signals, rate limits, and retention policies. The product must not encourage scraping or evasion.
6. **Explainable prioritization.** Scores are decision support, not truth. Users can inspect factor contributions, source evidence, uncertainty, and what would change the score.
7. **Composable plays.** A client may run different lead plays at the same time, each with its own ICP slice, search logic, qualification rubric, buying-center strategy, outreach motion, and success definition.
8. **Learning with provenance.** Feedback can improve recommendations, but learned changes are proposed, versioned, reviewable, and reversible.
9. **Operational resilience.** Long-running ingestion, research, enrichment, scoring, and reporting are resumable, idempotent, observable, budgeted, and safe to retry.
10. **Generalize the foundation.** Preserve proven Nova Trade primitives where they fit; remove local-website assumptions from contracts rather than layering exceptions on top.

## 3. Personas and actors

| Persona | Job to be done | Primary needs | Authority |
|---|---|---|---|
| Client owner / revenue leader | Turn business knowledge into a repeatable pipeline | Fast setup, trustworthy recommendations, approval control, outcome visibility | Tenant-wide business decisions |
| Commercial researcher | Find, verify, and prepare target accounts | Search workbench, evidence, queues, dedupe, notes, handoffs | Research within assigned tenants/plays |
| Sales or outreach operator | Convert approved research into conversations | Buying-center context, safe drafts, contact state, reminders, outcome capture | Send only where policy allows |
| Technical/domain reviewer | Validate technical fit and claims | Product facts, application context, evidence, uncertainty flags | Approve or correct domain assertions |
| Tenant administrator | Govern people, connectors, retention, and policies | RBAC, billing/usage view, audit, data export/delete, integrations | Tenant configuration and membership |
| Nova Trade operator / support admin | Operate platform and assist clients | Health, queues, connector controls, support access with justification | Platform operations; no default content access |
| Platform service/agent | Ingest, reason, search, qualify, draft, and learn | Scoped tools, typed outputs, budgets, traceability | No independent send authority unless explicitly enabled later |

## 4. Terminology

- **Tenant:** An isolated client organization and its users, data, configuration, usage, and policies.
- **Workspace:** An optional tenant subdivision for teams, brands, regions, or business units; it never weakens tenant isolation.
- **Business knowledge base:** Evidence and normalized facts derived from uploaded materials, public websites, notes, customer-provided records, and approved integrations.
- **Evidence item:** A source passage, page, table, record, API response, or observation with provenance and freshness.
- **Business understanding:** A versioned synthesis of products, applications, differentiators, constraints, markets, buying triggers, exclusions, and uncertainty.
- **Question:** An adaptive request for information or confirmation, selected for expected reduction in decision-relevant uncertainty.
- **ICP:** A versioned ideal-customer profile containing positive signals, disqualifiers, segments, geography, economics, operational fit, and evidence requirements.
- **Lead play:** A reusable, bounded growth motion combining an ICP slice, search strategy, qualification rules, buying-center approach, outreach policy, and outcome metrics.
- **Candidate account:** A potential organization discovered from an approved source; it is not a qualified lead until evidence meets the play’s criteria.
- **Contact:** A person or role associated with an account, with provenance and permitted-use state.
- **Buying center:** The roles involved in a purchase, such as economic buyer, technical evaluator, user, procurement, operations, and influencer.
- **Qualification:** Evidence-backed assessment of fit, intent, timing, access, and disqualifiers.
- **Agent run:** A traceable execution of a bounded workflow with inputs, tools, outputs, costs, approvals, and errors.
- **Human gate:** A required user decision before a state transition or external side effect.

## 5. Current-state inventory

The active repository is the source of truth for the current product. The following facts are current-state constraints, not future requirements.

### Existing foundation

- Next.js 16 App Router, React 19, TypeScript, Tailwind, Zod, Vitest, and Playwright.
- Supabase Postgres in production and SQLite when `DATABASE_URL` is absent for local development.
- Supabase Auth with invite-only access; current application roles are primarily `admin` and `researcher`, with market-access controls.
- Server Actions for mutations and API route handlers for worker polling, export, health, and AI processing.
- Resumable crawl runs and crawl units with worker leasing, retries, stale-work recovery, and budget controls.
- Official Google Places API (New) text search and details integration with field masks, retry behavior, caching, usage tracking, and no Google Search/Maps-page scraping. Review text is not stored or displayed.
- Discovery is currently local-business oriented and Colorado-zip-code-first, with market/location-cell extensions already present in the schema.
- Website classification (`none`, `social`, `basic`, `custom`), website health checks, AI website verification, lead quality review, competitive snapshots, and explainable scoring with factor breakdowns.
- AI lead artifacts include typed business-detail and competitive-report content, source URLs/evidence, confidence, input hashes, usage tracking, retryable workers, and a review pass.
- CRM states include new, verified, contacted, preview sent, meeting set, and closed outcomes; outreach events, notes, assignments, reminders, demos, CSV export, queue, team accountability, and statistics exist.
- Outreach is currently template-generated and copy-to-clipboard. The application does not automatically send outreach.
- Audit logs, admin requests, worker runs, API/AI usage events, settings, and data recovery documentation provide useful operational primitives.

### Current limitations to replace or generalize

- No tenant entity or complete tenant-scoped data contract; the current model is an internal invite-only account.
- No self-serve onboarding, billing, tenant-level retention policy, or tenant-level connector authorization.
- Lead identity and discovery assumptions are strongly tied to Google Places, local geography, websites, reviews, ratings, and website opportunity.
- No arbitrary document ingestion pipeline or general business knowledge graph.
- AI context is lead-centric and website-verification-centric rather than a tenant’s product and market understanding.
- No adaptive question planner, versioned ICP authoring flow, or multiple lead-play model.
- No general source connector registry, source-specific licensing policy, or evidence normalization across heterogeneous sources.
- No first-class account/contact/buying-center model; current outreach is largely attached to a lead/business.
- No general contact consent/preference model or send-provider integration. Do not infer permission to add one from this PRD.

## 6. Problem statement

Businesses with complex or specialized offerings often cannot describe their best prospects in a single static form. Product value may depend on formulation, process, certification, geography, channel, plant capability, regulatory context, replacement cycle, or a specific buying committee. A generic search produces noisy accounts; a generic score hides why an account matters; a generic email risks unsupported claims and poor targeting.

The current Nova Trade foundation solves a narrower problem well: discover local businesses with weak or missing websites, enrich them through Google Places, score them, and support manual website-sales outreach. The next product must preserve its operational discipline while changing the unit of understanding from “a local business and its website” to “a tenant’s business, a play, an account, a buying center, and evidence-backed next action.”

## 7. Goals and non-goals

### Goals

- Onboard a tenant from arbitrary authorized business materials and build a versioned, evidence-backed understanding.
- Ask adaptive questions that maximize decision value and avoid repeating known facts.
- Produce and human-approve one or more ICPs and lead plays, each with explicit evidence requirements and exclusions.
- Discover candidate accounts through compliant, pluggable sources, including existing Google Places where appropriate.
- Deduplicate and resolve accounts across sources without erasing provenance.
- Qualify and score accounts and contacts with interpretable evidence, uncertainty, freshness, and play-specific reasoning.
- Map likely buying centers and recommend role-specific contacts or research gaps.
- Generate context-aware outreach packages that use only approved facts and follow tenant policy.
- Keep humans in control of approval, contact use, sending, suppression, and material profile changes.
- Learn from approvals, corrections, replies, meetings, disqualifications, and wins through versioned recommendations.
- Provide tenant isolation, RBAC, privacy, auditability, retention, usage, and operational controls from the start.

### Non-goals

- Fully autonomous cold outreach or automatic bulk sending in the initial product.
- Circumventing provider terms, access controls, robots rules, rate limits, or privacy requirements.
- Buying or reselling personal data without a documented lawful basis and provider contract.
- Treating AI-generated text, intent, fit, or contact identity as verified without evidence.
- Requiring one universal questionnaire, one universal score, or one universal sales motion.
- Making chemicals, manufacturing, Colorado, Google Places, or local website sales the product’s permanent scope.
- Replacing a customer’s CRM, marketing automation, ERP, or regulated decision system in the first phases.
- Changing the current application or configuration as part of this PRD.

## 8. Product experience and detailed user journeys

### 8.1 Tenant onboarding and business understanding

1. A tenant admin creates a workspace, selects data policies, invites users, and acknowledges source and outreach responsibilities.
2. The client uploads or links materials: PDFs, data sheets, catalogs, websites, notes, customer lists, spreadsheets, CRM exports, product pages, certifications, and other authorized sources.
3. Ingestion creates immutable source records, extracts text/tables/metadata, detects duplicates, and reports unsupported or low-quality files.
4. An understanding agent proposes structured facts: products, applications, customer types, industries, geographies, differentiators, constraints, certifications, substitutes, triggers, buying process, pricing/economic signals, and claims requiring review.
5. Each fact shows evidence, confidence, freshness, and whether it was explicit, inferred, user-confirmed, or unresolved.
6. The question agent asks only the highest-value unresolved questions, grouped into a small review session. The user can answer, correct, defer, or mark unknown.
7. The system produces a versioned business understanding summary. The user approves it or requests another question round.

### 8.2 ICP and lead-play design

1. The user asks the agent to propose ICPs from the approved understanding or starts from a business objective.
2. The agent proposes segments, positive signals, disqualifiers, buying triggers, geography, size/economics, operational fit, evidence thresholds, and likely buying-center roles.
3. The user can create multiple plays, for example “formulator replacement,” “epoxy resin channel expansion,” or “industrial distributor development.”
4. Each play contains search hypotheses and bounded source/query plans, not just keywords.
5. The user reviews simulated examples and counterexamples before activation. The agent must explain why each example passes or fails.
6. Activation creates a versioned play with budgets, cadence, connector permissions, review gates, and success metrics.

### 8.3 Candidate discovery and research

1. A researcher selects an active play and market scope. The agent proposes a research plan based on missing coverage, past yield, source reliability, and tenant policy.
2. The plan may use Google Places for place-based businesses, public company websites, permitted directories, trade associations, customer-authorized lists, or future approved connectors.
3. The system previews expected cost, source terms, query families, geographic scope, dedupe approach, and stop conditions before execution.
4. Workers execute bounded, resumable runs. Each account and observation retains source provenance and retrieval time.
5. The agent qualifies candidates against the play, flags uncertainty and conflicts, suggests additional evidence, and routes low-confidence or high-impact cases to review.

### 8.4 Account, buying-center, and contact workbench

1. A researcher opens an account with its evidence timeline, source records, fit factors, open questions, play memberships, and related contacts.
2. The agent proposes a buying-center map: roles, likely responsibilities, influence, confidence, and evidence. It must distinguish a role hypothesis from a verified person.
3. The user confirms, edits, rejects, or requests more research. Contact recommendations must show source, freshness, permitted use, and suppression/consent status.
4. The system assembles a research brief and recommended next action. Duplicate accounts, stale contacts, and contradictory sources are visible rather than silently merged.

### 8.5 Human-approved outreach

1. The user selects an approved account, contact, and lead play.
2. The agent drafts an outreach package using only approved tenant facts and account evidence, with claim citations and uncertainty warnings.
3. Policy checks block unsupported technical, regulatory, pricing, performance, or personalization claims; suppressed or unapproved contacts cannot proceed.
4. A human reviews recipient, channel, claims, source links, opt-out language, and proposed CTA. Approval is explicit and auditable.
5. Initial releases support copy/export or a controlled draft handoff. Any future send integration must require a separate connector authorization, policy gate, and kill switch.
6. The user records sent, bounced, replied, opted out, meeting, disqualified, won, lost, and other outcomes. The learning system uses these outcomes only within permitted tenant/play scope.

### 8.6 Learning and refinement

The system summarizes recurring false positives, false negatives, unanswered questions, source yield, contact usefulness, reply patterns, and conversion by play. It proposes changes to questions, ICP rules, query families, score weights, and outreach guidance. A qualified human accepts, edits, schedules, or rejects each proposal; historical versions remain reproducible.

## 9. Functional requirements

### FR-1 Tenant and workspace lifecycle

- Create, suspend, archive, export, and delete tenants according to policy.
- Scope every object and query to a tenant; workspace scope is additive, never a bypass.
- Support tenant-level defaults for locale, timezone, allowed countries/markets, retention, connectors, AI usage, review gates, and outreach policy.
- Prevent cross-tenant retrieval through UI, server actions, APIs, workers, search indexes, caches, embeddings, logs, exports, and agent context.

### FR-2 Adaptive business understanding

- Accept arbitrary supported material types and URLs with size/type/virus checks.
- Extract facts into typed domains while preserving raw evidence and extraction version.
- Track fact status: proposed, confirmed, corrected, disputed, rejected, unknown, expired.
- Generate questions dynamically from uncertainty, contradiction, expected impact on ICP/search/qualification, and user history.
- Never ask for information already confirmed unless it is stale, conflicting, or needed for an explicitly different decision.
- Let users answer in natural language, attach evidence, skip, or mark “not applicable.”

### FR-3 ICP and lead plays

- Support many ICPs and plays per tenant/workspace, with drafts, review, active, paused, superseded, and archived versions.
- Define segment, use case, buying trigger, firmographic/operational signals, disqualifiers, geography, channel, expected value, evidence threshold, and buying-center roles.
- Define play-specific search strategies, source allowlists, budgets, stop conditions, scoring rubric, review gates, outreach policy, and outcome events.
- Show examples, counterexamples, and rationale before activation.

### FR-4 Discovery and source connectors

- Provide a connector registry with source type, authorization, terms, capabilities, fields, cost, rate limits, retention restrictions, and health.
- Treat Google Places as one optional connector, useful for place-based discovery and enrichment, not the canonical source for all B2B accounts.
- Support public websites, customer-provided files/lists, trade directories, associations, licensed data providers, CRM systems, and future connectors only when approved and contractually permitted.
- Record query, parameters, response metadata, source policy version, retrieved time, and normalized observations.
- Do not scrape Google Search or Maps pages, bypass access controls, or store restricted content outside allowed retention.

### FR-5 Account and contact intelligence

- Maintain canonical accounts with aliases, domains, locations, subsidiaries, parent relationships, source identities, and merge history.
- Maintain observations separately from the canonical record so new evidence never destroys historical context.
- Represent contacts as people and role hypotheses, with source, confidence, freshness, role, department, geography, and permitted-use state.
- Support buying-center roles: economic buyer, technical evaluator, user/operator, procurement, quality/regulatory, executive sponsor, distributor/channel partner, and custom tenant roles.
- Track contact discovery, verification, suppression, consent/legal basis, opt-out, bounce, and do-not-contact states.

### FR-6 Qualification and scoring

- Compute play-specific fit, intent, access/contactability, timing, evidence quality, freshness, risk, and priority components.
- Show factor-level rationale and source citations; distinguish observed facts from inferences.
- Support hard disqualifiers and manual overrides with required reason and audit event.
- Do not combine incomparable scores across plays without a clearly labeled normalization.
- Re-score when the play, evidence, source freshness, user correction, or outcome model changes; preserve score snapshots for historical reporting.

### FR-7 Human review

- Provide queues for low confidence, conflicting evidence, high-value accounts, new source types, contact use, outbound drafts, and model-policy exceptions.
- Show evidence side by side with proposed fact, score, contact, or message.
- Support approve, edit, reject, request research, defer, and mark unknown.
- Require reason codes for overrides and preserve before/after values.

### FR-8 Outreach support

- Generate role- and play-specific drafts, call briefs, follow-up suggestions, and objection hypotheses.
- Show every material claim’s evidence or label it as a suggestion requiring validation.
- Apply tenant tone, approved claims, prohibited claims, channel rules, frequency caps, quiet hours, regional requirements, and opt-out handling.
- Default to copy/export or draft-only workflows. Sending is disabled unless separately authorized and gated.
- Capture outcomes and suppress future outreach immediately after an opt-out or policy block.

### FR-9 Reporting and learning

- Report funnel counts and rates from source observation through account qualification, contact readiness, approval, outreach, reply, meeting, opportunity, and outcome.
- Break down by tenant, workspace, play version, source, market, segment, researcher, contact role, and time period.
- Report evidence coverage, confidence distribution, stale-data rate, duplicate rate, false-positive/false-negative feedback, cost, latency, and agent failure/retry rates.
- Propose, version, and approve learning changes; never silently rewrite prior decisions.

### FR-10 Administration and operations

- Administer membership, role, SSO/auth options where supported, connector credentials, data policies, budgets, queues, retention, exports, deletion, and audit access.
- Provide worker health, run status, retries, stale leases, provider errors, cost, and kill switches.
- Support tenant-scoped support access with time-bound, reason-coded, audited elevation and no default document visibility.

## 10. Adaptive agent behavior and evidence requirements

### Agent roles

Agents should be bounded specialists with typed contracts rather than one unrestricted agent. Initial roles are ingestion/extraction, business-understanding, question planning, ICP/play design, discovery planning, source research, entity resolution, qualification/scoring, buying-center research, outreach drafting, review/policy, and learning analysis.

### Planning loop

Every consequential run should follow: inspect approved context → state objective and constraints → select permitted tools/sources → execute bounded calls → validate outputs against schemas and policy → attach evidence → calculate confidence and uncertainty → request human review when required → persist an immutable run record.

### Question selection

Questions should be ranked by expected value: how much resolving the uncertainty could change a play, search scope, qualification outcome, buying-center path, or outreach safety, divided by user effort and risk. The agent should prefer one discriminating question over a long form. It should explain why the question matters and what decisions it unlocks.

### Evidence contract

Every extracted or inferred claim must include, where applicable:

- source ID, source kind, locator (page, section, row, URL, or API field), retrieved/created time, and content hash;
- quoted or structured supporting excerpt within allowed retention;
- extraction method and model/prompt version;
- confidence, evidence grade, freshness, and conflict state;
- claim status and reviewer decision;
- a clear distinction between “observed,” “client-provided,” “inferred,” “not found,” and “unknown.”

Absence claims require a defined search scope and stopping rule; “not found” is not “does not exist.” Agents must not invent product performance, certifications, customer names, revenue, intent, contact identity, or regulatory status. Source citations must be rendered to users and remain resolvable under tenant permissions.

### Agent safety and reliability

- Tool permissions are allowlisted per agent, tenant, play, and run.
- Prompts and retrieved documents are untrusted input; defend against prompt injection and instruction collision.
- Enforce token, time, API-call, financial, row, and source-domain budgets.
- Validate structured output with schemas and reject unsupported fields.
- Make jobs idempotent, resumable, cancellable, and safe to retry.
- Log decisions and tool calls without leaking secrets or unnecessary personal data.

## 11. Tenant isolation, RBAC, security, privacy, consent, and audit

### Isolation and authorization

- Tenant ID is mandatory on all tenant-owned tables, events, object paths, queues, cache keys, search indexes, and embeddings.
- Enforce authorization at database and application layers; never rely on UI filtering.
- Use row-level security or equivalent defense-in-depth for Postgres; service-role jobs must receive an explicit tenant scope and be audited.
- Roles should include tenant owner/admin, manager, researcher, outreach operator, reviewer, analyst, and read-only, with custom permission bundles only where safe.
- Separate platform operator access from tenant access; support access is time-limited and visible to the tenant.

### Security

- Encrypt data in transit and at rest; protect connector tokens and secrets with a managed secret store and rotation process.
- Scan uploads for malware, validate file types, isolate parser execution, and cap decompression/processing resources.
- Apply SSRF protections to fetched URLs, including private-network blocking, redirect limits, DNS rebinding defenses, and content-size limits.
- Rate-limit login, uploads, connector calls, agent runs, exports, and outreach actions.
- Use least privilege for workers, provider keys, database roles, and support tooling.
- Redact secrets and sensitive personal data from logs, prompts, traces, and error reports.

### Privacy and consent

- Record the purpose, source, lawful basis or customer authorization, permitted use, retention, and deletion state for personal data.
- Treat customer lists and CRM exports as private tenant data; never use them for another tenant’s discovery or model improvement by default.
- Maintain suppression and opt-out records that override play eligibility and outreach generation.
- Support data subject access, correction, export, deletion, and retention workflows where applicable.
- Provide tenant-visible source disclosures and policy acknowledgements. Legal review is required for launch markets and outreach channels.

### Audit

Audit events must capture actor/service, tenant/workspace, object, action, before/after or decision, reason, source/run IDs, policy version, timestamp, IP/device metadata where appropriate, and correlation ID. Audit logs are append-only to authorized users and retained according to policy.

## 12. Document ingestion and knowledge base

The ingestion pipeline should accept PDF, DOCX, XLSX/CSV, TXT/Markdown, images where OCR is permitted, web URLs, and structured integrations. It must preserve original file metadata, normalize text and tables, identify language, classify content, detect duplicates, and expose extraction quality.

The knowledge base should separate raw sources, extracted evidence, normalized entities, claims, relationships, and approved business understanding. Chunking and retrieval must retain page/section/row locators. Tables, product variants, units, ranges, safety/certification statements, and negations require special handling. A parser failure should produce an actionable review state, not a silent empty document.

Customer lists may seed account identity and historical outcome learning but must not be treated as public discovery evidence. Website ingestion must respect robots/access policies, domain authorization, rate limits, and retention rules.

## 13. ICP, lead plays, accounts, contacts, and scoring

### ICP structure

An ICP version contains target segments, use cases, jobs/pains, positive signals, disqualifiers, size/capability proxies, geography, supply-chain/channel position, buying triggers, expected economics, required evidence, uncertainty tolerance, and likely buying-center roles.

### Lead-play structure

Each play adds a specific hypothesis: who to find, why now, what evidence proves fit, which sources can find them, what questions remain, how to prioritize, which roles to approach, what outreach is allowed, and what outcome validates the play. Plays may overlap; the system must show overlap and avoid duplicate work.

### Industrial example

For a specialty-chemicals client, one play could target metalworking-fluid formulators needing component packages; another could target epoxy-resin buyers serving coatings, flooring/civil engineering, adhesives, composites, pipe manufacturing, or distribution. Search logic may look for formulation capability, manufacturing/process language, product families, technical documentation, plant footprint, channel role, certifications, or application-specific signals. The system should ask whether the client sells finished products, components, packages, private-label supply, technical service, or distribution; those answers materially change search and qualification. This is an example of adaptive reasoning, not a fixed domain template.

### Score model

Use a transparent vector rather than a single opaque number:

- **Fit:** matches to the active ICP and use case.
- **Evidence quality:** source reliability, corroboration, freshness, and completeness.
- **Need/trigger:** observable problem, change, project, capacity, or replacement signal.
- **Access:** relevant role/contact readiness and permitted-use state.
- **Timing:** likely buying window and urgency evidence.
- **Risk:** disqualifiers, compliance concerns, contradiction, or unsupported assumptions.
- **Priority:** play economics, strategic value, and human queue context.

Weights and thresholds are play-version data. Users can see “what would change this score,” and all manual overrides are versioned.

## 14. Source connector model

Every connector should declare: authorization method, tenant owner, source terms, allowed operations, fields, personal-data classes, cost, rate limits, freshness, retention, geographic availability, failure modes, and evidence quality. A source adapter returns normalized observations plus raw provenance metadata; it does not directly mutate canonical accounts.

The platform should support source health and connector kill switches. A source can be disabled for a tenant or globally without deleting historical evidence. Google Places remains valuable for organizations discoverable by place and location, but it should be one source among public websites, licensed business data, trade associations, customer-provided files, CRM records, and future approved systems.

## 15. Data model concepts

The future schema should use explicit tenant scope, immutable provenance, and versioned decisions. Names below are conceptual contracts, not an implementation mandate.

| Concept | Purpose and key relationships |
|---|---|
| `tenants`, `workspaces`, `memberships`, `roles` | Ownership, isolation, membership, permission, lifecycle, locale, and policy boundaries. |
| `connector_accounts`, `source_policies`, `source_runs`, `source_observations` | Tenant-authorized connectors, terms/limits, execution metadata, raw observations, and source health. |
| `documents`, `document_versions`, `document_chunks`, `extracted_tables` | Original uploads/URLs, immutable versions, located retrieval units, parser quality, and structured tables. |
| `evidence_items`, `claims`, `claim_support`, `claim_reviews` | Evidence with locator/hash/freshness, normalized assertions, supporting evidence, conflicts, and human decisions. |
| `questions`, `question_runs`, `answers`, `business_understanding_versions` | Adaptive-question history, answers, skipped/unknown states, and approved business models. |
| `icps`, `icp_versions`, `lead_plays`, `lead_play_versions` | Reusable target definitions, search/qualification/outreach policy, examples, activation, and supersession. |
| `accounts`, `account_aliases`, `account_relationships`, `account_observations` | Canonical organizations, aliases/domains, parent/subsidiary/channel relationships, and source-specific history. |
| `contacts`, `contact_observations`, `contact_permissions`, `suppressions` | Person/role records, provenance, freshness, permitted use, consent/legal basis, opt-outs, and bounces. |
| `buying_centers`, `buying_center_roles`, `role_hypotheses` | Account-level purchase committees, tenant/custom roles, confidence, evidence, and verification state. |
| `qualification_assessments`, `score_snapshots`, `score_factors`, `manual_overrides` | Play-specific decisions, reproducible scores, factor evidence, reviewer changes, and reasons. |
| `agent_runs`, `agent_steps`, `tool_calls`, `agent_artifacts`, `agent_feedback` | Bounded execution trace, inputs/outputs, tool permissions, cost, retries, artifacts, and learning feedback. |
| `review_tasks`, `approvals`, `outreach_drafts`, `outreach_events`, `outcomes` | Human gates, approval history, drafts, copy/send events, replies, meetings, wins/losses, and attribution. |
| `usage_events`, `budgets`, `audit_events`, `retention_jobs` | Cost attribution, limits, immutable audit, deletion/export processing, and operational accountability. |

Required modeling rules:

- Every tenant-owned record has `tenant_id`; workspace scope is nullable only when explicitly tenant-wide and policy-checked.
- Source observations and evidence are append-only or versioned; canonical account/contact fields are projections that can be recomputed.
- Foreign keys, unique constraints, row-level policies, and background-job payloads all include tenant scope.
- Personal-data records have purpose, source, legal-basis/authorization, permitted-use, freshness, retention, and suppression fields.
- Versioned ICPs, plays, understanding, prompts, policies, score models, and agent artifacts make every decision reproducible.
- Deletion and export workflows preserve required audit tombstones without retaining content beyond policy.

## 16. APIs and integrations

The future API surface should be tenant-scoped and versioned. Core resource families are tenants/workspaces, members/roles, sources/connectors, documents, evidence, claims, questions/answers, business-understanding versions, ICPs, plays, runs, accounts, observations, contacts, buying centers, qualifications, scores, reviews, outreach drafts/approvals, outcomes, reports, usage, and audit events.

Integrations should be additive and permissioned: Supabase Auth and Postgres as the existing foundation; object storage and malware scanning for documents; official Google Places where enabled; public/licensed research sources; CRM import/export; email/calendar or outreach providers only after separate policy and consent work; and analytics/observability systems with redaction. Webhooks must be signed, replay-safe, tenant-scoped, and configurable.

## 17. Nonfunctional requirements

- **Isolation:** zero cross-tenant data exposure in automated tests, authorization tests, exports, caches, retrieval, and agent traces.
- **Availability:** tenant-facing read operations target 99.9% monthly availability after production hardening; long jobs may be asynchronous but must expose status.
- **Performance:** p95 ordinary authenticated page/API reads under 500 ms excluding provider calls; first usable ingestion status under 5 seconds; queued work shows progress within 30 seconds.
- **Scalability:** horizontally scalable workers; no tenant can starve others; per-tenant concurrency and budget controls.
- **Durability:** source and decision records are recoverable; idempotency keys prevent duplicate observations, messages, and outcomes.
- **Freshness:** configurable TTLs by source and claim type; stale evidence is labeled and never silently presented as current.
- **Accessibility:** keyboard navigation, semantic structure, clear status/error states, and usable evidence review for desktop and mobile.
- **Internationalization:** timezone, locale, language, geography, and units are tenant-aware; no Colorado-specific assumptions in shared contracts.
- **Observability:** structured logs, traces, metrics, per-tenant cost, provider health, queue depth, retries, dead letters, and correlation IDs.
- **Cost control:** preview estimates, hard/soft budgets, auto-pause, per-run usage attribution, and human approval for unusually expensive plans.

## 18. Quality and reliability

Quality gates should include schema validation, evidence coverage, citation resolution, source freshness, duplicate/entity-resolution accuracy, score stability, policy checks, and human-review agreement. Maintain golden datasets for several unlike businesses, including the specialty-chemicals example and at least one non-industrial example. Test adversarial documents, prompt injection, contradictory catalogs, stale sites, duplicate companies, ambiguous subsidiaries, opt-outs, unsupported claims, provider outages, retries, cancellation, and partial ingestion.

The existing Nova Trade release discipline—typecheck, lint, unit tests, read-only browser smoke, recovery checks, and explicit authenticated/mutating boundaries—should be extended rather than discarded. Future agent changes require replayable fixtures and regression comparisons against approved outputs.

## 19. Compliance and risk controls

Key risks are inaccurate claims, unlawful or unwanted outreach, personal-data misuse, provider-policy violations, tenant leakage, prompt injection, discriminatory targeting, stale contacts, source outages, runaway agent cost, and overreliance on scores. Mitigations include evidence contracts, explicit consent/suppression states, source allowlists, legal review per jurisdiction, tenant isolation tests, content/policy gates, human approval, audit, budgets, kill switches, and clear user disclosures.

The product must distinguish business-account research from personal-data enrichment. It should not infer sensitive traits or use protected characteristics for targeting. High-risk sectors, regulated claims, export-controlled products, safety data, and jurisdiction-specific outreach require configurable review or exclusion. Compliance requirements must be confirmed with counsel before enabling a market or channel; this PRD does not declare legal compliance by itself.

## 20. Phased rollout strategy

### Phase 0 — Generalized foundation and contracts

Define tenant-scoped contracts, evidence/provenance, source registry, account identity, play versioning, policy states, and agent-run traces. Keep current website-lead workflows functioning while introducing generalized names and boundaries.

### Phase 1 — Tenant onboarding and adaptive understanding

Deliver document/URL ingestion, evidence review, business-understanding versions, adaptive questions, tenant RBAC, retention, and audit. Do not activate broad autonomous discovery yet.

### Phase 2 — ICPs, plays, and account discovery

Deliver multiple play authoring, simulated examples, compliant connector execution, account dedupe, observations, play-specific qualification, and review queues. Reuse Google Places where it fits, alongside customer-provided and approved public/licensed sources.

### Phase 3 — Buying centers and human-approved outreach

Deliver role hypotheses, contact provenance and suppression, buying-center workbench, claim-cited drafts, policy gates, copy/draft handoff, outcome capture, and operator reporting. Keep automatic sending off by default.

### Phase 4 — Learning and controlled scale

Deliver versioned recommendations, outcome-driven play refinement, additional connectors, CRM synchronization, stronger tenant self-service, and carefully reviewed send integrations with independent authorization and kill switches.

Progression between phases depends on isolation, evidence, quality, cost, and human-approval metrics—not feature completeness alone.

## 21. Success metrics

### Activation and understanding

- Time from first upload to approved business understanding.
- Percentage of material claims with resolvable evidence.
- Questions answered per session and reduction in decision-relevant uncertainty.
- User correction and “unknown” rates.

### Discovery and quality

- Candidate-to-qualified-account rate by play and source.
- Precision of top-ranked accounts and reviewer agreement with qualification.
- Duplicate/merge error rate, stale-evidence rate, and source yield per dollar.
- Coverage of required ICP signals and buying-center roles.

### Revenue workflow

- Approval rate of research briefs and outreach drafts.
- Contact-use rejection, opt-out, bounce, reply, meeting, opportunity, win, and loss rates.
- Time from qualified account to approved next action.
- Outcome attribution by play version and source.

### Trust and operations

- Cross-tenant authorization test pass rate: 100%.
- Unsupported-claim escape rate: zero tolerated for production-gated channels.
- Citation resolution rate and evidence freshness SLA.
- Worker success/retry/dead-letter rates, p95 latency, availability, and cost per qualified account.
- Human override rate and percentage of learning changes explicitly approved.

## 22. Open questions and assumptions

- Which initial customer segment and jurisdictions justify the first paid launch?
- Which document types, languages, OCR quality, and maximum file sizes are required at launch?
- Which public, licensed, CRM, and directory sources are legally and economically available to Nova Trade?
- What is the tenant’s required retention, deletion, export, and support-access policy?
- Which roles can approve ICPs, activate plays, approve contacts, and approve outreach?
- What evidence threshold is required for each claim class, such as technical performance, certification, pricing, or regulatory status?
- Should a workspace represent a brand, region, sales team, or independent business unit?
- Which account-resolution rules should be global versus tenant-specific?
- Which outreach channels, if any, will be enabled after draft-only validation, and what consent model applies to each?
- What CRM is the first integration target, and which system is authoritative for contacts and outcomes?
- What quality benchmark and golden datasets will define “good enough” for each initial vertical?
- Assumption: existing Nova Trade users and data remain available during migration, with old website-specific plays represented as one specialized play rather than deleted.
- Assumption: tenants own or are authorized to provide uploaded materials and customer lists.
- Assumption: all future provider integrations are opt-in, tenant-scoped, budgeted, and independently reviewable.

## 23. Acceptance criteria

The future product is acceptable when all of the following are true for the agreed launch scope:

1. A tenant can create an isolated workspace, invite users, set policies, and verify that another tenant cannot retrieve any of its records through UI, API, worker, export, cache, search, or agent context.
2. A tenant can upload representative PDFs, data sheets, catalogs, websites, notes, and customer lists; the system reports ingestion status and produces typed facts with source locators, confidence, freshness, and review state.
3. The system asks adaptive questions based on unresolved, conflicting, or decision-relevant facts; it does not require or present a fixed universal questionnaire.
4. A reviewer can approve a versioned business understanding, create multiple ICPs and lead plays, inspect examples/counterexamples, and see what differs between play versions.
5. A play can execute a bounded discovery run through at least one approved connector, with Google Places available only where enabled and compliant; every observation retains source provenance and run metadata.
6. The system produces canonical accounts, preserves source observations and merge history, and avoids duplicate work across overlapping plays.
7. Qualification and scores are play-specific, explainable, evidence-backed, freshness-aware, and auditable; low-confidence or conflicting results route to human review.
8. The system can represent buying-center role hypotheses separately from verified contacts and shows contact provenance, permitted-use state, freshness, suppression, and opt-out information.
9. Outreach drafts use approved tenant knowledge and account evidence, cite material claims, block unsupported or prohibited claims, and cannot be sent without the required human approval.
10. Outcomes, corrections, and disqualifications are captured and reported by play/source/version; learning changes are proposed and versioned rather than silently applied.
11. Tenant admins can manage members, connectors, budgets, retention, exports/deletion, and audit access; platform support access is time-bound, reason-coded, and audited.
12. Long-running ingestion and agent workflows survive retries, cancellation, provider errors, stale leases, and partial failure without duplicate side effects or lost provenance.
13. Quality, security, privacy, compliance, performance, cost, and accessibility checks meet the launch thresholds agreed for the selected market and channels.
14. Existing Nova Trade local-website workflows remain functional during the transition, but shared product contracts no longer require websites, reviews, ratings, Colorado zip codes, or Google Places as universal assumptions.

## 24. Recommendation

Proceed by evolving the current Nova Trade foundation in place, using its worker, queue, audit, budget, scoring, AI artifact, and review patterns as proven infrastructure. Generalize the domain model and policy boundaries first; then add tenant business understanding, adaptive questions, play versioning, connector abstraction, account/buying-center intelligence, and human-approved outreach. Keep the current local-website workflow as one compatibility play during migration, while making the platform’s durable center of gravity the tenant’s evidence-backed business strategy and measurable learning loop.
