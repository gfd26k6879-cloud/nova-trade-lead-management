# Account Identity and Merge Policy (D-011)

**Status:** Parent-conductor accepted local implementation contract; runtime enforcement and production activation are not claimed by this document.

**Task:** D-011 — Approve account identity and merge policy

**Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`

**Dependencies:** D-001 tenant/workspace contract and D-010 source connector allowlist

**Evidence tier:** Standard evidence for a high-integrity data decision. Production activation requires the golden fixtures, isolation tests, migration rehearsal, and review gates named below.

**Scope:** Account identity, source observations, candidate resolution, relationships, reversible merges, and the consequences for scoring, contacts, suppressions, outcomes, and outreach.

**Out of scope:** Contact permitted-use policy (D-012), source approval itself (D-010), scoring formula design, CRM synchronization, production migrations, and any change to the current application or database.

## 1. Decision summary

Nova Trade will maintain one **canonical account** per real-world organization or location within a tenant. The canonical account is tenant-owned, while source observations remain immutable historical evidence. A source record may be linked to an account, left as a candidate, or linked as a relationship without becoming the same entity.

Identity is deliberately conservative:

1. A stable identifier is strong evidence only inside its **source namespace and tenant**.
2. A normalized registrable domain plus jurisdiction can be a strong link only when the domain is attributable to the same operating organization and no branch, parent, subsidiary, distributor, or conflict evidence contradicts it.
3. Exact, high-precision conditions may auto-link a new observation to an existing account.
4. Fuzzy name, address, phone, geographic, embedding, and model similarity may create a review candidate, but never an irreversible automatic merge.
5. Separate legal entities, branches, plants, offices, parents, subsidiaries, brands, distributors, and resellers remain distinct unless an approved relationship or merge decision is supported by evidence.
6. A merge is a reversible state transition that preserves every source observation, external identifier, evidence item, score snapshot, contact, suppression, outcome, audit event, and original identifier.
7. Every identity key is tenant-local and source-scoped. No provider ID, domain, email, phone, or global registry may identify an account across tenants.

The legacy repository does not yet enforce this contract. Current `leads.place_id`, `places_master.place_id`, and `place_cache.place_id` are globally keyed compatibility structures, and current `place_observations` are not tenant-scoped. They must be adapted or isolated in later implementation work before tenant-facing account resolution is activated.

## 2. Canonical vocabulary

| Term | Required meaning | Not to be confused with |
|---|---|---|
| **Source observation** | An immutable, tenant-scoped record of what an approved source returned or what a tenant supplied at a point in time. It contains source namespace, external ID when present, retrieval time, raw/derived evidence references, and parser/policy provenance. | A canonical account or a current field value |
| **Candidate account** | A source-backed potential organization that has not yet been resolved with sufficient evidence. It may have multiple proposed matches and may remain unresolved. | A qualified lead |
| **Canonical account** | The tenant-local durable representation used by product workflows after identity resolution. It owns current projections and relationships but does not replace observations. | A source record, contact, or lead play |
| **Alias** | A historical or alternate name, domain, phone, address, brand, trade name, or source label associated with an account with provenance and validity dates. | Proof that two legal entities are the same |
| **Relationship** | A typed, directional or symmetric association such as `parent_of`, `subsidiary_of`, `branch_of`, `plant_of`, `distributor_for`, `brand_of`, `reseller_of`, or `same_network_as`. | A merge |
| **Merged redirect** | A tombstone-like reference from a retired account ID to its surviving account ID, with merge decision, actor, timestamp, reason, and reversible history. It must not delete the retired account's history. | A hard delete |
| **Account-play association** | A tenant/workspace/play-scoped membership connecting an account to an ICP/lead play, with qualification state, score snapshots, research status, and outcome context. | Canonical identity |
| **External identifier** | A source-provided identifier such as Google Places `place_id`, a customer-list row key, or a future CRM ID. It is namespaced by tenant and source connector. | A globally unique account ID |
| **Identity decision** | A deterministic record of `auto_link`, `review`, `relationship`, `no_match`, `merge_approved`, `merge_rejected`, `unmerge`, or `stale`. | An unrecorded model suggestion |

## 3. Scope and ownership rules

### 3.1 Tenant and workspace scope

- The canonical account registry is **tenant-wide**.
- A workspace may have its own account-play associations, notes, assignments, research state, and display projections, but cannot create a second canonical identity for the same tenant solely because a different workspace encountered it.
- Workspace visibility never grants access to another tenant's account, observation, contact, source identifier, suppression, or outcome.
- A source observation must carry `tenant_id`; it may carry `workspace_id` when the source action was workspace-specific. If the source is tenant-wide, `workspace_id` is nullable but the tenant is mandatory.
- Any request that lacks a resolved tenant context, contains a caller-supplied tenant mismatch, or attempts to reuse a source key from another tenant fails closed.

### 3.2 Source namespace rules

Use a typed namespace tuple rather than a bare value:

```text
(tenant_id, source_connector_id, source_dataset_or_region, external_identifier_type, normalized_external_identifier)
```

Examples:

- `(tenant-A, google_places, us, place_id, ChIJ...)`
- `(tenant-A, customer_list_csv, import-2026-07-27, row_key, file123:row42)`
- `(tenant-A, authorized_website, example.com, registrable_domain, example.com)`

The following are never globally unique:

- Google Places `place_id`.
- Registrable domain, subdomain, website URL, email domain, phone number, or address.
- Person email or phone.
- Customer-list IDs, CRM IDs, distributor codes, or source row numbers.

The canonical account's internal ID is generated by Nova Trade and is unique only within the tenant's account namespace. A future physical database key may be globally unique for storage, but all authorization, uniqueness, matching, caching, and retrieval predicates still include `tenant_id`.

## 4. Entity and lifecycle contract

### 4.1 Required durable concepts

The future model must be able to represent the following separately, whether implemented as tables or another typed persistence boundary:

| Concept | Minimum identity/provenance fields | Lifecycle requirement |
|---|---|---|
| Source observation | tenant, source, namespace key, observed time, source policy version, raw/derived evidence reference, checksum/input hash | Append-only; corrections create a new observation or explicit correction event |
| Candidate account | tenant, candidate ID, source observation links, normalized identity fields, resolution state | `open`, `auto_linked`, `review`, `resolved_no_match`, `converted`, `rejected`, `stale` |
| Canonical account | tenant, account ID, display fields, jurisdiction, account type, status, created/updated timestamps | `active`, `archived`, `deleted_tombstone`; never silently reused |
| Alias | tenant, account, alias type/value, source, first/last observed, evidence link | Validity can end; historical aliases remain queryable |
| Relationship | tenant, from account, relationship type, to account, evidence, confidence, validity, approver | Can be proposed, approved, rejected, expired, or superseded |
| External identity | tenant, source connector, identifier type/value, account or candidate, observation link | Unique within tenant/source namespace; never reassigned silently |
| Merged redirect | tenant, retired account, surviving account, merge transaction, actor, reason, timestamps | Redirect remains for historical reads and reversible unmerge |
| Account-play association | tenant, workspace/play, account, qualification state, score references, assignment, outcomes | Independent lifecycle; merge remaps it transactionally and preserves history |

### 4.2 Account identity versus account location

An organization and its physical operating locations are different dimensions. The model must support an organization-level account with one or more location records, but may also represent a location as its own account when it has independent ownership, procurement, or outreach relevance.

The default is:

- Same organization, same legal/operating identity, multiple sites: one account plus location records, unless the play requires site-level qualification.
- Independent branch, plant, franchise, or subsidiary with separate buying authority or legal identity: separate account plus an explicit relationship.
- A Google Places result: initially a source observation for a candidate location; it does not automatically define the tenant's canonical organization boundary.

## 5. Normalization rules

Normalization makes exact comparisons deterministic; it does not make two entities identical.

### 5.1 Name

Store both the original value and a comparison form. The comparison form must:

1. Unicode-normalize and case-fold.
2. Trim and collapse whitespace.
3. Normalize punctuation and common separators.
4. Preserve meaningful tokens and legal suffix information in separate fields.
5. Remove a legal suffix only for a secondary comparison key, never from the evidence or display value.
6. Avoid translating, inventing abbreviations, or removing words such as `distributor`, `coatings`, `resins`, `plant`, or `group` unless a documented vocabulary rule applies.

`Acme Resins, Inc.` and `Acme Resins LLC` may share a normalized base-name candidate, but they are not an exact identity match without another high-precision condition.

### 5.2 Domain and URL

- Parse URLs with a standards-compliant URL parser; reject malformed, credential-bearing, non-HTTP(S), private-network, or unresolved values before matching.
- Lowercase the host, remove a trailing dot, apply IDNA processing, and store the registrable domain separately from the full host.
- Strip default ports and normalize a trailing slash for comparison.
- Do not treat a shared platform domain, marketplace, social host, URL shortener, free-hosting domain, or email provider as an organization domain.
- A domain is a strong identity signal only after ownership/attribution evidence and jurisdiction are compatible.
- Multiple accounts may legitimately share a distributor, parent, franchise, or hosted domain; route this to review or relationship modeling.

### 5.3 Address and jurisdiction

- Preserve the source address exactly and store a parsed comparison form.
- Normalize Unicode, case, whitespace, punctuation, postal-code formatting, country code, and approved administrative names.
- Keep `country_code`, `admin_area1`, `admin_area2`, locality, postal code, and geocoded coordinates as separate evidence-backed fields.
- Never use distance alone as identity proof.
- Jurisdiction is part of a domain-based identity key because the same name/domain can represent separate operating entities in different countries or legal markets.

### 5.4 Phone

- Store the original display value and an E.164-like comparison form only when the country context is known.
- Extensions remain separate.
- Shared switchboards, distributor numbers, call centers, and parent-company numbers are not exact account proof.
- Phone similarity is review evidence only unless paired with another independent high-precision signal.

### 5.5 Source identifiers and email

- Treat provider identifiers as opaque strings after validation; never parse them into a global identity.
- Normalize email for comparison only after source permission is established; lowercase the domain and preserve the original address.
- A role mailbox (`procurement@`, `sales@`) may support account attribution but does not identify a person.
- A personal email address or mobile number is not an account identity key and is governed by D-012.

## 6. Deterministic resolution tiers

Every resolution attempt must produce one deterministic rule ID, input snapshot/hash, candidate set, decision state, and evidence references. Do not invent numeric precision thresholds before benchmark data exists.

| Tier | Rule ID | Preconditions | Result | Required handling |
|---|---|---|---|---|
| 0 | `NO_MATCH_OR_INSUFFICIENT_EVIDENCE` | No safe exact rule; evidence missing, malformed, conflicting, or outside tenant scope | `no_match` or `review` depending on candidate quality | Keep the candidate and explain missing evidence; never silently attach |
| 1 | `EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE` | Same tenant; same approved connector; same identifier type/value; existing identity has no unresolved source conflict | `auto_link` to the existing account or candidate | Record source-key uniqueness and the exact observation proving the link |
| 2 | `EXACT_VERIFIED_DOMAIN_SAME_TENANT_JURISDICTION` | Same tenant; registrable domain is attributable to the same business; same compatible jurisdiction; domain is not shared/platform/marketplace; no conflicting legal/entity/branch evidence | `auto_link` only when the account is the same operating entity | If a parent/branch/distributor conflict exists, route to `review` or `relationship` |
| 3 | `EXACT_SOURCE_ID_TO_EXISTING_ALIAS` | Same tenant/source namespace and identifier matches a previously approved alias or historical identity | `auto_link` with alias provenance | Do not treat an unapproved alias as exact proof |
| 4 | `EXACT_MULTI_FIELD_HIGH_PRECISION` | At least two independent exact fields agree, including an attributable domain or source ID, and no conflict exists | `auto_link` only for the same operating entity | The rule must enumerate the fields; name/address/phone alone is insufficient |
| 5 | `FUZZY_OR_PARTIAL_SIMILARITY` | Name, address, phone, geography, category, embeddings, or model similarity suggests a possible match | `review` | Never auto-merge; show the matched fields and counterevidence |
| 6 | `RELATIONSHIP_SIGNAL_NOT_IDENTITY` | Evidence indicates parent, subsidiary, branch, plant, distributor, brand, reseller, or same network | `relationship` proposal | Preserve distinct account IDs unless a human approves a true identity merge |
| 7 | `CONFLICTING_HIGH_VALUE_EVIDENCE` | Exact-looking signals disagree or new evidence contradicts a prior decision | `review` or `stale` | Freeze automatic mutation; require fresh human decision |

### 6.1 Explicit auto-link boundary

Auto-link is allowed only when all of these are true:

- The tenant context is verified server-side and cannot be selected solely by the caller.
- The source connector and identifier namespace are approved by D-010.
- The matching value passed canonical normalization and validation.
- The rule is Tier 1, Tier 2, Tier 3, or a precisely enumerated Tier 4 rule.
- No conflicting observation indicates a distinct legal entity, location, branch, parent, subsidiary, distributor, or shared domain.
- The target account is active and belongs to the same tenant.
- The decision is idempotent and records its input evidence.

There is no fuzzy auto-merge threshold. No model confidence score, cosine similarity, name ratio, address distance, or phone similarity may bypass these preconditions. Such signals can prioritize a review queue only.

## 7. Parent, branch, legal-entity, and distributor policy

The resolver must not collapse organizational relationships into identity.

### 7.1 Relationship types

At minimum support:

- `parent_of` / `subsidiary_of`
- `branch_of`
- `plant_of`
- `legal_entity_of`
- `brand_of`
- `distributor_for`
- `reseller_for`
- `contract_manufacturer_for`
- `same_network_as`
- tenant-defined relationship type with an explicit review policy

Each relationship stores direction, source evidence, effective dates when known, confidence state, reviewer/approver, and whether the relationship affects play qualification or outreach routing.

### 7.2 Specialty-chemicals examples

1. **Distributor and manufacturer:** `Northwest Chemical Distribution LLC` sells an epoxy resin from `Apex Materials Inc.` A distributor website and catalog mentioning Apex create a `distributor_for` relationship; they do not merge the distributor into Apex.
2. **Branch versus legal entity:** `Apex Materials — Houston Plant` and `Apex Materials — Chicago Plant` may be locations under one organization when ownership and procurement are centralized. If each plant buys independently, retain distinct location-level account-play associations or separate accounts related by `plant_of`.
3. **Parent and subsidiary:** `Apex Holdings` and `Apex Resins North America, Inc.` remain separate accounts with `parent_of` evidence unless legal and operating evidence supports a true identity equivalence.
4. **Formulator customer:** A fluid formulator using Apex's metalworking-fluid package is a separate target account, even when it publishes Apex product names on its site.
5. **Same-name distributors:** `Precision Resins` in Texas and `Precision Resins` in Ontario are not merged because the name is the same; jurisdiction, domain, legal details, and source evidence must establish identity.

### 7.3 Non-industrial edge cases

- `Acme Plumbing` and `Acme Plumbing` in two cities are distinct until a common legal/operating identity is proven.
- A franchise brand's public domain may be shared by many independently operated locations; use branch/franchise relationships, not domain-only auto-linking.
- A business using a parent company's email domain may still be a subsidiary or distributor.
- Two unrelated companies may share a name and a hosted website platform; platform domains cannot auto-link them.
- A rebrand creates an alias and an effective-date event; it does not erase the old name or source evidence.

## 8. Review states and human decisioning

### 8.1 Candidate review states

Use explicit states:

```text
new -> auto_linked
new -> review
new -> resolved_no_match
review -> approved_link
review -> approved_relationship
review -> rejected_match
review -> needs_more_evidence
review -> stale
needs_more_evidence -> review
```

Rules:

- `approved_link` may attach a candidate to an existing canonical account but is not itself a merge of two existing accounts.
- `approved_relationship` keeps both accounts distinct.
- `rejected_match` must record the rejected target and reason so the same bad suggestion is not repeatedly shown without new evidence.
- `needs_more_evidence` must identify the next permitted source or human question; it must not trigger unapproved enrichment.
- A decision becomes `stale` when a new high-value observation conflicts with the decision, the source authorization expires, or the identity input changes materially.

### 8.2 Required review display

The workbench must show, side by side:

- original source values and normalized values;
- source, namespace, observed time, policy version, and citations;
- candidate and target account identifiers;
- exact signals, fuzzy signals, and counterevidence separately;
- existing aliases and relationships;
- affected play memberships, scores, contacts, suppressions, outcomes, and pending outreach;
- the proposed action, rule ID, reason codes, and what new evidence would change it.

The reviewer can approve, reject, request research, mark unknown, create a relationship, or defer. Every action records actor, role, timestamp, before/after state, evidence references, and reason.

## 9. Merge and unmerge policy

### 9.1 Merge preconditions

Merging two existing canonical accounts is a high-impact human-gated action. It requires:

- same tenant;
- both accounts active and accessible to the reviewer;
- explicit evidence that they are the same real-world account, not merely related;
- no unresolved legal-entity, branch, parent, subsidiary, distributor, or jurisdiction conflict;
- a selected survivor and reason;
- a complete impact preview;
- an idempotency key and expected versions for both accounts;
- an audit event created in the same transaction as the state change.

No AI-generated suggestion can execute a merge. An exact source ID may auto-link an observation, but it cannot silently merge two existing canonical accounts.

### 9.2 Merge transaction behavior

Execute the merge as one tenant-scoped transaction with row locks or an equivalent optimistic concurrency check:

1. Re-check tenant, account status, permissions, expected versions, and current redirects.
2. Lock the two account records in deterministic ID order to avoid deadlocks.
3. Re-read all high-value observations, identities, relationships, aliases, contacts, suppressions, play associations, scores, outcomes, outreach drafts, and audit references.
4. If new conflicting evidence appeared since the review decision, abort as `stale_decision` and require a new review.
5. Create a merge transaction record with survivor, retired account, evidence, policy version, actor, and idempotency key.
6. Move or associate child records to the survivor without deleting their original IDs or provenance.
7. Create a merged redirect from the retired account to the survivor.
8. Preserve the retired account as a historical shell; direct mutation of the shell is blocked except for an authorized unmerge workflow.
9. Recompute only current projections that are explicitly merge-safe; preserve all pre-merge score snapshots and outcome history.
10. Write one audit event for the merge and any controlled child-association changes.
11. Commit. A retry with the same idempotency key returns the original result and causes no duplicate side effect.

### 9.3 Preservation requirements

A merge must preserve:

- every source observation and raw/derived evidence reference;
- every external ID and its tenant/source namespace;
- aliases, relationship history, and original observed values;
- account-play associations, qualification decisions, score inputs, score snapshots, and manual overrides;
- contacts, role hypotheses, permission/suppression/consent states, and contact provenance;
- outreach drafts, approvals, exports, sent/outcome events, opt-outs, bounces, and do-not-contact states;
- notes, assignments, reminders, support access events, and audit logs;
- original canonical account IDs and the redirect chain.

The survivor's display projection is resolved field-by-field using the approved projection policy. It is never treated as a replacement for historical evidence.

### 9.4 Unmerge behavior

Unmerge is available only to an authorized tenant administrator or platform operator acting under the D-018 authority matrix and requires a reason. It must:

1. Lock the merge transaction and affected accounts.
2. Verify that the merge has not already been superseded by a later merge or relationship conversion.
3. Restore pre-merge associations using the recorded merge ledger.
4. Preserve subsequent events by attaching them to the restored account or survivor according to their original entity reference and a visible post-unmerge attribution event.
5. Retain the merge and unmerge events permanently in the tenant audit history.
6. Recompute current projections only after restoration; never rewrite historical scores or outcomes.
7. Return a deterministic result for a repeated idempotency key.

If an irreversible external side effect already occurred, unmerge cannot pretend it did not happen. It restores identity associations and records the limitation for outreach, exports, CRM handoffs, and outcomes.

## 10. Conflicts, stale decisions, and idempotency

### 10.1 Conflict policy

Conflicts are visible and blocking. Examples include:

- one source ID already belongs to another account in the same tenant;
- a domain points to multiple distinct legal entities;
- a new observation identifies a different parent or jurisdiction;
- a merge survivor was archived, deleted, or merged again;
- an account's external identity was reassigned by a provider;
- a contact suppression or opt-out conflicts with a proposed account remap.

On conflict, keep all observations, create a review item with a reason code, and prevent automatic reattachment or outreach. Do not choose the newest record simply because it is newer.

### 10.2 Stale decision policy

An identity decision is stale when its input hash/version no longer matches current identity evidence, or when any new high-value observation lands after the decision and changes a protected field. A stale decision:

- cannot be applied automatically;
- remains visible with the original proposed action;
- points to the new conflicting observation;
- requires a new review and new idempotency key;
- does not delete or overwrite the original decision.

### 10.3 Concurrent requests

- Use tenant-scoped unique constraints for source identity tuples and canonical account identity keys.
- Use expected version checks for account and merge records.
- Acquire locks in stable order when row locking is used.
- Treat uniqueness violations as a re-read-and-resolve outcome, not as permission to create a duplicate.
- Ensure worker retries and browser double-clicks are safe through idempotency keys.
- A failed transaction must leave no redirect, partial child remap, or audit gap.

## 11. Effects on downstream data

### 11.1 Accounts and observations

The canonical account is a projection over evidence. New observations may update a current display field only under field-specific freshness and conflict rules. Historical observations remain queryable by source, time, and original candidate ID.

### 11.2 Leads and account-play associations

The legacy `leads` row is currently the product's working lead record and is tied to `place_id`. Future account resolution must introduce an account-level identity boundary rather than treating a lead row as the canonical account.

- A candidate can produce a lead-play association without creating a duplicate canonical account.
- The same account can belong to multiple plays with independent qualification and scores.
- Merging accounts unions associations by tenant/play key while preserving each association's original account ID, score snapshots, and outcome history.
- A relationship such as distributor-for may be relevant to one play and irrelevant to another; relationship semantics must not silently change account identity.

### 11.3 Scoring

- Identity resolution may change the evidence set available to a current score, but must not rewrite historical score snapshots.
- After an approved link or merge, schedule a deterministic re-evaluation with a new evidence/version reference.
- Preserve the pre-resolution score, factors, citations, and model/policy version.
- Never combine scores from two accounts by averaging them.
- If evidence is conflicting or stale, lower evidence quality or route to review rather than inventing certainty.

### 11.4 Contacts, buying centers, and suppressions

- Contacts remain separately identified people or role hypotheses with their own provenance and permitted-use state.
- A merge may associate contacts with the survivor only when the contact identity and source evidence are compatible; duplicate people go to review.
- Suppression, opt-out, deletion, bounce, and do-not-contact states are tenant-wide protective controls and must survive the merge.
- When two account records contain conflicting suppression states, the most restrictive state wins until a human resolves the conflict.
- Buying-center role hypotheses retain their source, confidence, freshness, and original account association.

### 11.5 Outreach and outcomes

- Pending drafts and approvals must be revalidated after a link, merge, or unmerge.
- A merge cannot authorize an outreach action that was previously blocked or unapproved.
- Historical outreach events and outcomes retain their original account reference plus the current redirect for reporting.
- Exports must show the canonical account and preserve an auditable original-ID column where policy allows.
- An opt-out or policy block attached to either account must not be lost during resolution.

## 12. Tenant isolation and authorization invariants

The implementation is not complete until tests and database/application controls prove:

- a source observation, candidate, account, alias, relationship, redirect, merge transaction, and account-play association can be read only with the correct tenant context;
- a source identity tuple from tenant A cannot link to or reveal tenant B's account;
- cache keys, retrieval keys, search indexes, agent context, exports, and audit queries include tenant scope;
- a worker's tenant authority comes from its leased job/run, not from mutable user input;
- support access is explicit, time-bound, justified, audited, and cannot be used as a merge shortcut;
- deleted or archived tenant records cannot be resurrected by a stale source observation;
- workspace membership cannot widen tenant access;
- unique constraints and merge locks are tenant-local.

## 13. Proposed resolution algorithm

For each new source observation:

1. Validate source card, tenant context, workspace context, source policy, and allowed fields.
2. Normalize fields while retaining originals and normalization version.
3. Build only tenant-scoped, source-namespaced exact lookup keys.
4. Check exact source identity matches.
5. Check verified domain plus jurisdiction and attribution rules.
6. Check approved aliases and exact multi-field rules.
7. Collect fuzzy/partial candidates for review only; include counterevidence.
8. Detect relationship signals separately from identity signals.
9. Emit a deterministic identity decision with rule ID, evidence IDs, input hash, and policy version.
10. Apply an auto-link only when the exact rule's preconditions pass.
11. Otherwise create a review/no-match/relationship state without mutating a canonical account.
12. Re-check for concurrent writes before commit and retry idempotently.
13. Invalidate or revalidate downstream scores, contacts, and outreach drafts according to Section 11.

## 14. Golden fixture table

The following fixtures are required before production activation. They are expected outcomes, not claims about current runtime behavior.

| Fixture | Inputs | Expected result | Why |
|---|---|---|---|
| G01 exact Google Places duplicate | Same tenant, same `google_places` namespace, same `place_id`, compatible observations | Tier 1 `auto_link` | Stable provider ID is exact only within tenant/source namespace |
| G02 cross-tenant same Google ID | Tenant A and tenant B submit the same `place_id` | Two tenant-local identities; no disclosure or cross-link | Provider ID is never global |
| G03 verified website duplicate | Same tenant, same attributable `apexmaterials.com`, same jurisdiction, compatible legal/operating evidence | Tier 2 `auto_link` | Domain plus jurisdiction and attribution is high precision |
| G04 shared parent domain | `apexmaterials.com` appears for parent and two subsidiaries | `review` or explicit relationships | Shared domain is not identity proof |
| G05 same-name different jurisdiction | `Precision Resins` in Texas and Ontario | Two accounts; no auto-link | Same name is insufficient |
| G06 fuzzy same name/address | `Acme Co.` and `Acme Company`, similar address/phone, no exact domain/source ID | Tier 5 `review` | Similarity never auto-merges |
| G07 specialty distributor | Distributor catalog names Apex epoxy products | Distinct accounts plus `distributor_for` proposal | Commercial relationship is not identity |
| G08 branch | Apex Houston and Apex Chicago with separate plant evidence | One organization with locations or two related accounts; never silent merge | Branch boundary requires evidence and play context |
| G09 subsidiary | Apex Holdings and Apex Resins NA | `parent_of` proposal | Parent/subsidiary remains distinct |
| G10 rebrand | Old legal name and new verified name with dated evidence | Alias plus one account | Historical name is preserved |
| G11 shared switchboard | Two companies share a phone number | `review` | Phone is not unique account proof |
| G12 hosted website | Two unrelated companies use the same website platform host | `no_match` or `review` | Platform domain excluded from strong matching |
| G13 stale merge | Merge review created, then a new conflicting legal observation arrives | `stale_decision`; merge blocked | New high-value evidence invalidates old decision |
| G14 concurrent merge retry | Two requests merge the same pair with the same idempotency key | One merge result, no duplicate redirect/audit side effect | Merge is idempotent |
| G15 competing merge | Two workers propose different survivors for the same pair | One serialized decision; loser re-reads or becomes stale | Deterministic concurrency behavior |
| G16 unmerge with later outcome | Merge occurs, outreach outcome is recorded, then unmerge is approved | Associations restored; outcome retained with explicit attribution | Unmerge cannot erase later history |
| G17 suppressed duplicate | One account has tenant suppression, another duplicate has an approved draft | Survivor remains suppressed; draft revalidation blocks action | Protective state wins |
| G18 malformed identifier | Invalid URL, malformed provider ID, or cross-namespace key | Rejected before lookup/mutation | Input validation is fail closed |
| G19 customer-list row collision | Same row number appears in two tenant imports | Two source identities | Row keys are import- and tenant-scoped |
| G20 non-industrial franchise | Same brand domain across independently operated locations | Distinct location accounts/relationships; review if uncertain | Shared brand/domain is not legal identity |

Fixture acceptance requires at least 20 cases above, with duplicate, non-duplicate, relationship, review, conflict, concurrency, tenant isolation, and reversible-transition coverage. Each fixture must assert the rule ID, state, target IDs, preserved provenance count, and whether a downstream action is blocked or revalidated.

## 15. Implementation boundary and migration guidance

### 15.1 Current compatibility model

The current repository contains:

- `leads` with globally unique `place_id` and many website/local-business fields;
- `places_master` keyed by `place_id`;
- `place_cache` keyed by `place_id`;
- `place_observations` with `place_id`, crawl IDs, optional `lead_id`, endpoint, SKU, field mask, raw JSON, and timestamps;
- `outreach_events`, `demos`, `lead_notes`, AI artifacts, usage events, and audit logs tied primarily to `lead_id`.

These are useful compatibility primitives but do not satisfy the future tenant-local canonical account contract. Do not retrofit a global `place_id` into a tenant-wide identity without namespacing and migration evidence.

### 15.2 Future migration requirements

Before activation, implementation work must:

1. Create tenant-scoped identity and observation boundaries in authoritative Postgres.
2. Preserve legacy IDs as source identities or compatibility aliases, never discard them.
3. Assign legacy rows to an explicit tenant or quarantine them as unassigned; never expose unassigned rows to a new tenant.
4. Add source connector and namespace columns to every identity lookup and cache path.
5. Backfill candidates from observations before creating automatic canonical links.
6. Produce a dry-run resolution report with exact, review, relationship, and unresolved counts.
7. Rehearse duplicate, conflict, merge, unmerge, rollback, and recovery paths on disposable Postgres.
8. Prove that SQLite remains a bounded legacy compatibility path and cannot silently substitute for tenant-isolation evidence.

### 15.3 No current-enforcement claim

This document is a contract for future implementation. It does not claim that the current app, RLS policies, local SQLite schema, queries, workers, exports, caches, or UI enforce tenant isolation, namespaced identity, reversible merges, or these resolution tiers today.

## 16. Required audit and observability events

Emit tenant-scoped, redacted events for:

- `identity_observation_created`
- `identity_candidate_created`
- `identity_auto_linked`
- `identity_review_requested`
- `identity_review_decided`
- `identity_relationship_proposed`
- `identity_relationship_approved`
- `identity_merge_previewed`
- `identity_merge_approved`
- `identity_merge_applied`
- `identity_merge_blocked_conflict`
- `identity_merge_stale`
- `identity_unmerge_applied`
- `identity_resolution_rejected`

Each event includes tenant, actor or worker lease, source/policy version, rule ID, input hash, affected internal IDs, evidence references, idempotency key, correlation ID, and redacted reason. Raw personal data and secret material do not belong in logs.

## 17. Security and failure rules

- Treat source content, names, notes, URLs, and model suggestions as untrusted input; prompt injection cannot alter identity policy or authorization.
- Reject malformed identifiers, unsafe URLs, private-network targets, invalid tenant/workspace context, and policy-disallowed sources before lookup or network activity.
- Do not use a global cache or embedding index for identity lookup unless the tenant namespace is enforced at write and read time.
- If tenant context, source namespace, provenance, merge ledger, or expected version is missing, fail closed.
- If a merge partially fails, transaction rollback must leave both original accounts and all children queryable.
- If a recovery restore cannot prove merge-ledger completeness, keep the affected accounts in a blocked review state.
- Never report a successful merge from a UI response unless the durable transaction and audit event committed.

## 18. Acceptance criteria

D-011 is ready for parent-conductor acceptance when the artifact and future implementation plan demonstrate all of the following:

- Source observation, candidate account, canonical account, alias, relationship, merged redirect, external identity, and account-play association are distinct and defined.
- Every identifier class is tenant- and source-namespaced; no global provider ID/domain/email/phone registry is permitted.
- Normalization rules preserve originals, versions, jurisdiction, and meaningful legal/entity tokens.
- Match tiers are deterministic and include exact source ID, verified domain, exact multi-field, fuzzy review, relationship, no-match, and conflict/stale paths.
- No fuzzy or model-based signal can auto-merge, and no fabricated numeric precision threshold is used.
- Parent, branch, plant, subsidiary, legal entity, distributor, reseller, rebrand, franchise, shared-domain, same-name, and shared-phone scenarios are covered.
- Human review shows evidence and counterevidence and records reason, actor, policy version, before/after, and decision state.
- Merge and unmerge preserve observations, external IDs, evidence, scores, contacts, suppressions, outcomes, audit events, and original IDs.
- Concurrent and repeated operations are deterministic and idempotent; stale decisions are rejected after conflicting evidence.
- Downstream score, contact, suppression, outreach, export, and outcome behavior is specified.
- Tenant isolation, worker authority, cache/index scope, and legacy migration boundaries are explicit.
- At least 20 golden fixtures cover duplicate, non-duplicate, relationship, review, conflict, concurrency, tenant isolation, and reversible-transition behavior.
- Production activation remains gated on implementation tests and database evidence; this document does not self-verify runtime enforcement.

## 19. Implementation handoff

The next implementation workers should use this file with D-001, D-010, D-012, D-015, and the migration baseline. The recommended order is:

1. Define typed tenant-scoped identity/observation contracts and migration-safe IDs.
2. Add deterministic normalization and exact lookup helpers with unit tests.
3. Add candidate resolution and review states without automatic merges.
4. Add account relationships and account-play association boundaries.
5. Add merge preview, transactional merge ledger, redirects, and idempotency.
6. Add unmerge and downstream revalidation.
7. Add golden fixtures, tenant-isolation tests, migration rehearsal, and recovery evidence.

Workers must not broaden D-011 into provider enrichment, contact acquisition, live outreach, CRM synchronization, or an unapproved global identity service. If a source contract, tenant context, or database authorization is missing, create a review/block state and continue safe local work; do not invent a fallback.

## 20. Validation receipt for this documentation slice

The parent conductor should run and record the following checks; this worker does not self-verify the artifact:

```powershell
$target = 'docs/architecture/account-resolution-policy.md'
Test-Path $target
git diff --check -- $target
$trailing = Select-String -Path $target -Pattern '[ \t]+$'
if ($trailing) { $trailing; exit 2 }
$required = @(
  'Source observation', 'Candidate account', 'Canonical account', 'Alias',
  'Relationship', 'Merged redirect', 'Account-play association',
  'EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE',
  'FUZZY_OR_PARTIAL_SIMILARITY', 'RELATIONSHIP_SIGNAL_NOT_IDENTITY',
  'Merge and unmerge policy', 'Golden fixture table', 'tenant-scoped',
  'Google Places', 'distributor_for', 'stale_decision', 'idempotency'
)
foreach ($term in $required) {
  if (-not (Select-String -Path $target -Pattern ([regex]::Escape($term)))) { throw "Missing required term: $term" }
}
```

Expected checks are: target exists; the whitespace command emits no diagnostics; the required-term check completes without throwing; the golden table contains at least 20 rows; every match rule ID is unique; and the file is the only file changed by this worker. No application tests, database calls, provider calls, migrations, package changes, commits, pushes, or external changes belong to D-011.

## 21. Risks and explicit follow-up gates

- **Legacy global IDs:** Current `place_id` keys are not tenant-safe. Tenant assignment and namespaced migration must precede activation.
- **Ambiguous legal structure:** Specialty-chemical distributors, plants, brands, and subsidiaries can look identical from public sources. Default to review/relationship states.
- **Domain overconfidence:** Shared parent, franchise, hosted, and distributor domains make domain-only matching unsafe.
- **Historical preservation cost:** Merge/unmerge requires a durable ledger and recovery coverage, not only foreign-key updates.
- **Contact side effects:** A merge can accidentally bypass suppression or reauthorize a draft; downstream revalidation is mandatory.
- **Benchmark uncertainty:** Automatic-link precision cannot be claimed until a reviewed golden set and canary measurement exist. Until then, only the binary exact preconditions in this policy permit auto-link.
- **Support and recovery:** Cross-tenant support access and restore procedures require separate authorization and audit evidence before any production use.
