# Source Connector Allowlist (D-010)

**Task:** Implementation worker for D-010 (Approve source connector launch allowlist)
**Repository:** `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
**Source of truth:** `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`, `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`, `docs/architecture/tenant-workspace-contract.md`
**Dependencies:** D-001 accepted, implementation authority per `docs/decisions/implementation-authority.md`
**Slice:** D-010 only
**Mode:** Documentation for implementation guidance and activation control, not runtime configuration
**Status:** Accepted D-010 implementation allowlist; all new multi-tenant live activation remains policy-gated.

## 1) Scope, invariants, and non-goals

- Source discovery and ingestion is deny-by-default. If a source, operation, field, or connector path is not in this allowlist with an explicit status, it is blocked.
- D-010 does not edit code, run live calls, change config, or alter plans/ledgers.
- No source can treat "public" as permission. A source that is public, unknown, or implied is blocked until terms and tenant authorization are recorded.
- Existing platform rule remains unchanged: **Google Places is official API-only; no Google Search/Maps scraping; no Google review-body storage/display**.
- `tenant_id` and legal attestation are required for tenant-scoped sources; source-operator compliance ownership remains a platform/product/compliance responsibility.

## 2) Source-card schema used by this task

Each card must have these exact required fields:

- `source card` - canonical ID
- `status` - exact one of:
  - `allowed-live`
  - `allowed-for-implementation`
  - `launch-deferred`
  - `blocked-default`
- `owner` - legal/compliance/operations owner and tenant authorization owner (if any)
- `allowed operations` - fetch/parse/store/persist/score/gate operations
- `stored fields` - explicit allowlist fields persisted as observations
- `personal-data classes` - business and personal data classes allowed for this source
- `raw retention` - retention class and cleanup timing
- `attribution` - required provenance records
- `jurisdiction` - jurisdictional/routing scope for execution
- `cost/budget` - budget class and kill thresholds
- `terms-review state/date` - legal/commercial review outcome and date state
- `credential class` - secrets/keys required
- `freshness` - staleness constraints and re-check behavior
- `rate/kill behavior` - rate handling and hard-fail behavior

## 3) Source-card matrix (current)

| Source card | Status | Owner | Allowed operations | Stored fields | Personal-data classes | Raw retention | Attribution | Jurisdiction | Cost / budget | Terms-review state/date | Credential class | Freshness | Rate / kill behavior |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `google_places_legacy` | `allowed-for-implementation` | Platform legal/compliance & platform operations own provider terms/compliance posture; tenant owner controls only tenant-authz scope for any tenant-coupled work | `search_text`, `place_details`, `observation_log`, `lead_projection` | `place_id`, `business_name`, `formatted_address`, `website`, `phone`, `maps_uri`, `category`, `rating`, `review_count`, optional `operating_hours_metadata`, `business_status` | Business entities and location data only. **No personal contact details by source contract.** | Current schema uses shared legacy compatibility cache (`place_cache`, place observations) and is **not tenant-scoped** today. For D-010, this is allowed for implementation only; tenant-scoped migration is pending. No review text persistence. | Source, endpoint, query hash, normalized terms, tenant context, run id, response metadata, policy version, query time, and correlation identifiers | U.S. baseline only until policy expands | Existing Google Places caps and legacy compatibility controls apply; no tenant MT cost envelope is approved yet. | `launch terms review` currently pending for new multi-tenant activation; existing compatibility checks remain active | Server-side secret (`settings.google_places_api_key_*` class) | Bounded TTL exists in current compatibility flow; stale reads allowed only with stale flag and explicit refresh policy | Backoff on transport/API failures; repeated permission or policy failures produce run kill |
| `tenant_upload_document` | `allowed-for-implementation` | Platform legal/compliance owns source policy and retention/contract controls; tenant owns material authorization attestation for uploaded assets | `create_reservation`, `upload`, `quarantine`, `parse`, `version`, `provenance_capture` | Tenant-uploaded text chunks/tables/sections, parser outputs required for evidence, checksum/size metadata | Tenant-provided business and technical details; avoid unapproved personal-contact enrichment in this slice | Bound by D-006/D-014 alignment; exact final retention for long-term raw artifacts remains pending | `tenant_id`, `document_id`, `version_id`, checksum, parser source, source time, operator id, run id, policy/version tag, evidence locator | U.S. baseline only pending wider jurisdiction review | D-006 infrastructure and storage costs only; no approved MT launch spend plan is attached | Terms-review state/date is pending for launch in this task slice | Tenant storage credentials + malware scanner/verifier adapter required where available | Freshness per object/version; rehash mismatch triggers re-parse/re-scan | Upload/parse errors or scanner failures cause connector kill for that run |
| `customer_list_csv_upload` | `allowed-for-implementation` | Platform legal/compliance owns provider/contract posture; tenant owns customer-data submission attestation and allowed-use declaration | `upload`, `parse_list`, `normalize`, `dedupe`, `link_candidate`, `provenance_capture` | Tenant-supplied list fields (`account_name`, `website`, `industry`, tenant IDs), user-approved tags | Tenant-owned account identity fields; do not ingest personal contact enrichment without D-012 alignment | Same alignment as tenant uploads; retention policy remains pending until D-014 outcome | Same provenance pattern as upload; add file row IDs, parse schema/version, tenant operator, normalization timestamp | U.S. baseline only pending broader jurisdiction policy | Internal parsing/storage costs only; no approved external usage budget for non-manual enrichment | Terms-review state/date is pending for launch in this task slice | Tenant document ingestion adapter + tenant upload path | List parse staleness: must be re-attested before reuse | Malformed rows/encodings or repeated parse failures cause hard stop |
| `tenant_authorized_urls` | `allowed-for-implementation` | Platform legal/compliance owns provider/compliance controls; tenant owns URL authorization attestation | `fetch` (strict GET/HEAD), `safe_parse`, `extract`, `citation_capture`, `domain_tagging` | `origin_domain`, `resolved_url`, page title/meta, verified business facts, link-hash evidence snippets | Business facts from tenant-authorized materials; no unsupported personal data | Raw page body retention by evidence need only; derivative-first where possible | `source_url`, redirect target, TLS result, fetch timestamp, query hash, tenant id, run id, parser version, policy version | U.S. baseline only until jurisdiction policy expands | Network/run costs are bounded by tenant-run limits and infrastructure limits | Terms-review state/date is pending; URL-authorized launch use needs explicit policy update | Tenant-scoped auth record, optional per-target credentials where required | Re-fetch when staleness policy window expires or stale-claims path indicates risk | Redirect loops/private targets/transport failures trigger run kill |
| `public_official_company_website` | `allowed-for-implementation` | Platform legal/compliance owns crawler/provider policy; tenant owns official-domain authorization + use intent | `crawl_discovery` on pre-approved domains, `domain_verification`, `fetch`, `canonicality_check`, `extract` | Official-domain fields, canonical host, claim evidence, evidence snippets required by policy | Business-level claims from official pages | Raw retention stricter than URL path until terms attached; evidence-derived artifacts only after approval | `source_query`, `domain_source`, discovered_path, observed time, policy version, attestation id, refusal reason when blocked | U.S. baseline only pending broader jurisdiction policy | No explicit global launch cost envelope approved for official public-web crawl in this slice | Terms-review state/date pending in this slice; explicit approval required before non-manual discovery | Standard platform-safe fetch config; credentials optional for public pages | Content revalidation requires positive re-crawl reason and current policy window | Safe transport restrictions apply; unknown terms or legal blocks produce connector block and escalation |
| `directories` | `launch-deferred` | Platform/legal/compliance owner | `crawl_candidates` (disabled in D-010) | `directory_url`, `profile_url`, extracted contacts | Contact-like fields from directories are deferred | N/A for this slice | N/A | N/A | Defer explicit budget and kill state until contract task | Pending explicit contract owner and legal decision for directory terms | Credential model pending | N/A | Deferred/inactive |
| `associations` | `launch-deferred` | Platform/legal/compliance owner | `find_associations` (disabled in D-010) | N/A | N/A | N/A | N/A | N/A | N/A | Pending legal and product approval | Pending | N/A | Deferred/inactive |
| `social_network_profiles` | `launch-deferred` | Platform/legal/compliance owner | `profile_lookup` (disabled in D-010) | `profile_url`, `business_profile_meta` | Person-related profile data is deferred | N/A | N/A | N/A | N/A | Pending explicit terms and privacy controls | N/A | N/A | Disabled in this slice |
| `people_data_vendors` | `launch-deferred` | Platform/legal/compliance owner; tenant attestation is not sufficient | `person_match` / `enrich` (disabled in D-010) | `person_record_id`, `role`, `confidence` (not active) | Person-level data blocked for this slice | N/A | N/A | N/A | N/A | Pending privacy and contract review and D-012 sequencing | N/A | N/A | Disabled in this slice |
| `licensed_databases` | `launch-deferred` | Platform/legal/compliance owner | `query_licensed`, `map_to_account` (disabled in D-010) | Contract-specific fields not yet approved | Contract-defined classes pending review | N/A | N/A | N/A | N/A | Pending licensing and commercial terms review | N/A | N/A | Disabled until connector-specific approval |
| `bypass_scraping` | `blocked-default` | Platform/legal/compliance and security incident owner | `none` | `none` | `none` | N/A | N/A | N/A | N/A | Explicitly disallowed by policy and never permitted for activation in this slice | N/A | N/A | Any invocation is a policy violation and triggers security event |

**Source-card count:** 11 cards.

## 4) Fixture-capable connectors vs live-activation connectors

### Implementation-capable today (fixture/adapters required)

The following sources are implementation-ready for fixtures and adapter contracts:

- `google_places_legacy` — fixture set for search and place-detail payload shapes
- `tenant_upload_document` — fixture parser and metadata extractor payloads
- `customer_list_csv_upload` — fixture rows (valid and malformed) with deterministic normalization
- `tenant_authorized_urls` — offline-safe fetch/safe-http fixtures
- `public_official_company_website` — domain discovery fixtures and allowed hostpath blocks

### Multi-tenant live activation state (requires legal + tenancy gates)

- `google_places_legacy`: legacy compatibility execution preserved, but new tenant-scoped production live activation is blocked until:
  - tenant-isolated caching/provenance/isolation gates are complete (per D-001),
  - source policy/version state is approved,
  - live cost budget is set,
  - and current legal/terms review receipt exists.
- `tenant_upload_document`: implementation allowed; live activation deferred pending same D-010 legal and policy gates.
- `customer_list_csv_upload`: implementation allowed; live activation deferred pending same gates.
- `tenant_authorized_urls`: implementation allowed; live activation deferred pending same gates.
- `public_official_company_website`: implementation allowed; live activation deferred while terms review remains pending.
- `directories`, `associations`, `social_network_profiles`, `people_data_vendors`, `licensed_databases`, `bypass_scraping`: blocked/deferred as declared above.

## 5) Tenant responsibility attestations and URL authorization

Tenant responsibilities are limited to scope/authorization attestations, not source provider terms ownership:

- For tenant-upload/list sources:
  - tenant-owned data submission attestations,
  - lawful basis and usage scope,
  - retention and operator exposure acknowledgment.
- For URL-authorized sources:
  - explicit URL and/or domain authorization per tenant,
  - approved scope/intent for each URL,
  - expiry and revocation tracking.
- For public company websites:
  - no implicit permission from "publicness",
  - explicit domain-authorization and terms gating before non-manual discovery,
  - no extraction from unknown pages without legal/terms approval.

## 6) Deny-by-default selection algorithm (contract algorithm)

1. Resolve request to `source_card_id`, connector, and requested operation.
2. Reject if source card missing from matrix.
3. Reject immediately if `status` is not one of the exact allow values for this slice.
4. Reject if row `status` is `blocked-default`.
5. Reject if D-001 tenant context/authorization is missing or malformed.
6. Reject if required terms review is not approved (`pending`, `missing`, `expired`, `revoked`).
7. Reject if source operation is not in matrix `allowed operations` or field is not in `stored fields`.
8. For `google_places_legacy`, route only through existing official Google Places API and deny all Google Search/Maps scraping.
9. For URL/document/list sources, require explicit tenant attestation and platform/legal source-owner review state for the run.
10. Resolve freshness: stale data may be reused only when staleness policy allows and no re-evaluation signals are present.
11. Evaluate budget/rate limits and kill behavior before execution:
    - budget breach -> run kill,
    - repeated transport/API failures -> kill threshold -> disable for tenant run.
12. Emit provenance atomically before/with action:
    - `source_card`, `status`, `tenant_id`, `operation`, `fields`, `policy_version`, `source`, `query`, `time`, `run_id`, `result`.

## 7) Activation checklist per source card

Each card requires this baseline before production release:

- legal/commercial review recorded with date,
- source policy version and terms state,
- data class mapping to evidence contracts,
- freshness/staleness policy,
- run budget and kill thresholds,
- raw retention and deletion policy,
- cross-tenant denial test,
- malformed input negative tests,
- at least one positive and one negative fixture set for implementation behavior.

## 8) Unknown terms and deferred/disabled sources

- If terms are unknown, stale, expired, or missing:
  - source `status` must remain `launch-deferred` or `blocked-default` where applicable,
  - no live run permitted.
- `directories`, `associations`, `social_network_profiles`, `people_data_vendors`, `licensed_databases`, and `bypass_scraping` are excluded from D-010 live activation.
- Never infer authorization from "public means unrestricted."

## 9) Compliance evidence and kill behavior

Every connector run must record:

- source card and matrix status,
- tenant_id/workspace,
- operation and allowed field names,
- query/fetch time and query hash,
- provenance IDs and storage references,
- reason code for every block/retry/kill,
- stale decision and budget impact.

Kill behavior MUST include:

- budget kill on tenant-level cap exceedance,
- terms kill on unknown/unapproved terms,
- repeated transport/API failures -> kill,
- stale authorization kill on expired attestation,
- cross-tenant mismatch kill (no fallback).

## 10) Evidence states required by this task

For D-010, evidence states are split into:

- `implementation-state` (fixtures/adapters + contract clarity),
- `multi-tenant live activation-state` (terms/jurisdiction/authorization + budget gates).

Current state:

- `google_places_legacy`: implementation-state `allowed-for-implementation`; live activation-state `blocked` (legacy compatibility preserved).
- `tenant_upload_document`: implementation-state `allowed-for-implementation`; live activation-state `deferred`.
- `customer_list_csv_upload`: implementation-state `allowed-for-implementation`; live activation-state `deferred`.
- `tenant_authorized_urls`: implementation-state `allowed-for-implementation`; live activation-state `deferred`.
- `public_official_company_website`: implementation-state `allowed-for-implementation`; live activation-state `deferred`.
- `directories`, `associations`, `social_network_profiles`, `people_data_vendors`, `licensed_databases`, `bypass_scraping`: states per matrix with no new live activation.

## 11) Open questions before go-live

1. Final legal/commercial term-review date and owner for:
   - customer list enrichment boundaries,
   - official public-company web terms,
   - storage/retention linkage in D-014.
2. D-014 raw-retention final policy for uploaded artifacts and web observations.
3. Tenant-scoped source policy version, migration acceptance, and final multi-tenant budget class for `google_places_legacy`.

## 12) Adversarial probes for this slice

- `prompt_injection`: policy text in input should never alter connector state.
- `malformed_input`: invalid URLs, encoded redirects, unsupported file types, duplicate headers, hostile schemas.
- `dirty_worktree`: this task modifies only `docs/product/source-connector-allowlist.md`.
- `stale_state`: stale source cache or stale approvals are invalid for live execution decisions.
- `misleading_success_output`: no claim of launch without explicit checklist + activation-state transition.

## 13) Implementation receipts for future tasks

- Preserve default-deny behavior for all non-listed operations.
- Bind provenance to tenant + run context with explicit policy version.
- Reject missing/expired attestation, unknown terms, and jurisdiction mismatches before network calls.
- Keep Google Places review-text restrictions enforced: no review-body persistence or display.
- Keep global compatibility/legacy source state separated from multi-tenant production state.
