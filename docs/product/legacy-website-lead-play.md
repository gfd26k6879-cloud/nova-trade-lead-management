# Legacy website-lead compatibility play

Status: implemented configuration boundary; not a new-tenant default and not a live-source authorization.

Authoritative implementation: `src/lib/tenancy/compatibility-play.ts`

Focused contract tests: `src/lib/__tests__/compatibility-play.test.ts`

## Purpose and boundary

Nova Trade's current local-business website-lead workflow is preserved as one explicit, versioned compatibility play while the platform evolves toward tenant-configurable ICPs and lead plays. The compatibility play describes current behavior; it does not make local businesses, Google Places, website gaps, Colorado-style geography, or the current scoring model a platform-wide default.

The in-code record is deliberately a pure interim adapter. Creating or parsing it performs no database write, source call, AI call, export, copy, or outreach action. Binding requires the exact tenant and workspace from a completed T-028 compatibility-backfill receipt whose manifest hash, source engine, checksum algorithm, identity, policy, and zero-orphan state all reconcile. There is no hard-coded real tenant or workspace ID.

New tenants must receive a separately reviewed business understanding, ICP, lead play, source plan, policy, and feature configuration. They never inherit this play automatically.

## Version and integrity contract

| Field | Value |
|---|---|
| Play ID | `compatibility.legacy-website-lead` |
| Schema version | `1` |
| Play version | `1` |
| Hash algorithm | `novatrade-canonical-json-sha256-v1` |
| Compatibility-only | `true` |
| Default for new tenants | `false` |

The SHA-256 configuration hash uses UTF-8 canonical JSON with recursive code-unit key ordering. Unknown fields, unknown enum values, non-finite numbers, semantic drift, wrong hashes, engine/checksum mismatches, and tenant/workspace/receipt mismatches fail closed with stable reason codes. Returned seed and binding snapshots are detached and deeply frozen so callers cannot mutate shared configuration.

## Current-state snapshot

### Website classification

The exact current states are `none`, `social`, `basic`, and `custom`. Social-host and basic-site-host lists are copied from `src/lib/classify-website.ts` when the seed is constructed. The compatibility parser rejects a re-hashed record whose values differ from the current versioned payload.

### Google Places source boundary

`google_places_legacy` is the only source represented by this compatibility play. The declared operations are:

- `search_text`
- `place_details`
- `observation_log`
- `lead_projection`

The stored-field allowlist is business/place data only: place ID, business name, formatted address, website, business phone, Maps URI, category, rating, review count, optional operating-hours metadata, and business status. Review text is excluded from persistence and display. The configuration is `allowed-for-implementation`, while new multi-tenant live activation remains `blocked` pending the source-policy, tenancy, terms, budget, credential, and authorization gates in `docs/product/source-connector-allowlist.md`.

Possessing or binding the compatibility configuration never authorizes a provider call. Every execution still requires current tenant authorization, terms state, budget, credential, jurisdiction, field policy, and source kill-switch evaluation.

### Legacy geography

The snapshot records the current local-market/cell assumptions:

- search radius: 8 km;
- discovery mode: `coverage_probe`;
- pagination policy: `auto_yield_based`;
- compatibility geography model: `legacy_local_market_cells`.

These values preserve the existing workflow only. They are explicitly not the new-tenant default; future lead plays can use arbitrary approved regions, account lists, industries, channels, and source-specific search logic.

### Scoring and qualification

The seed copies `DEFAULT_WEBSITE_MULTIPLIERS` and `DEFAULT_NICHE_WEIGHTS` from `src/lib/scoring.ts`; tests fail if the snapshot no longer reconciles with those code constants. It records the current factors: reviews, rating, niche/category, website status, photos, opening hours, opportunity band, website health, competitive density, contactability, and estimated deal value.

Current qualification thresholds are preserved:

- score at least 8: `qualified`, subject to earlier disqualifiers and contactability;
- score at least 4: `needs_verification`;
- contactability below 0.55: `needs_verification` before the score decision;
- a custom website or a closed business is disqualified by the current compatibility logic.

The exact qualification states are `qualified`, `needs_verification`, `unqualified`, and `disqualified`.

### Queue contracts

AI verification states are `not_checked`, `queued`, `running`, `verified`, and `error`. A ready job must be queued, retry-due, below the attempt limit, not excluded, not archived, not closed, and not a closed business. Ordering is:

1. sales-priority score descending;
2. raw-opportunity score descending;
3. score descending;
4. update time ascending.

Enrichment states are `pending`, `running`, `retry_wait`, `enriched`, `error`, and `skipped`. The current backlog requires pending status, score above zero, not excluded, and not archived.

Artifact states are `queued`, `running`, `complete`, and `error`; the retry-ready index order is status, next-retry time, and creation time.

### Legacy lifecycle interpretation

The existing lead states remain intact, but none is treated as proof of a Nova Trade transport action:

| Current state | Compatibility interpretation |
|---|---|
| `new` | legacy new record |
| `verified` | legacy verified record |
| `contacted` | historical manual-contact observation |
| `preview_sent` | historical preview-handoff observation |
| `meeting_set` | historical meeting observation |
| `closed_won` | historical closed-won observation |
| `closed_lost` | historical closed-lost observation |

The mappings do not silently upgrade legacy rows to future `approved`, `sent`, `delivered`, or legally eligible outreach states.

## Feature and outreach guardrails

The play references the six T-008 feature IDs, but a feature flag is never treated as provider, source, contact, jurisdiction, legal, permission, or human-review authorization:

- AI processing, source research, outreach drafting, and copy/export are required only when that capability is invoked and after all separate gates pass.
- Contact research is not part of this legacy play.
- Autonomous send is permanently forbidden.

Outreach is artifact-only. An authorized human must review the exact draft and supporting evidence before any copy or controlled export. Copy/export does not prove a clipboard change, external use, send, delivery, opening, click, or reply. The compatibility record permits no external side effect.

The existing generated phrases that assert a visitor-abandonment percentage after three seconds or a mobile local-search percentage are explicitly `evidence-review-required`. They are not approved facts merely because they exist in legacy copy. A future evidence-aware draft must cite approved current evidence or omit/rewrite those claims as non-factual language.

## Supersession path

G-023 is the bounded compatibility snapshot. It will be consumed by later parity and translator work, then superseded operationally by persisted, tenant-scoped business understanding, ICP, lead-play, source-plan, scoring, account, contact, evidence, and outreach-policy domains. Supersession must preserve historical provenance and parity receipts; it must not make this configuration the generalized platform model or delete the compatibility path before its cutover gate passes.

Any future change to current website statuses, host lists, Google field policy, geography defaults, scoring constants, qualification thresholds, queue eligibility/order, lifecycle meaning, or outreach handling requires a new play/schema version and updated tests. Existing hashes remain immutable historical identifiers.
