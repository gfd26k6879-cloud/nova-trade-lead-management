# Legacy tenant ownership and migration map

Status: G-001 architecture/security baseline for Phase 2.

Scope: current Nova Trade tables and entry points only; proposed generalized domains are outside this inventory.

Reconciled on: 2026-07-29 against the active worktree.

## 1. Decision summary

Phase 2 will preserve the current website-lead workflow inside the compatibility tenant while replacing every accidental global application-data assumption with an explicit ownership rule.

The ownership vocabulary is:

- **Platform reference** — non-customer reference data readable through a named platform-only path; tenant writes are forbidden.
- **Platform identity/control** — platform authentication, operational control, or recovery metadata; tenant access is mediated by memberships/permissions rather than an application-data `tenant_id` shortcut.
- **Tenant root** — a tenant-bound row carrying `tenant_id` directly.
- **Tenant child** — ownership is copied from and enforced against a tenant parent through a compound key/foreign key; caller-supplied child scope never overrides the parent.
- **Tenant/workspace child** — tenant is parent-derived and workspace is either parent-derived or supplied by a validated active workspace context belonging to that tenant.
- **Explicit mixed scope** — the row must declare an exact scope kind. A nullable tenant is allowed only for a named platform or preserved-legacy case, never as an implicit global fallback.

Default decisions:

1. `zip_codes`, `location_markets`, and `location_cells` remain platform reference data. Tenant market-access grants, crawls, leads, CRM rows, source/cache rows, usage, and AI rows become tenant-owned.
2. Raw Google/provider cache content is not shared between tenants. A future shared cache requires a separate licensing, de-identification, field-policy, and threat-model decision.
3. `app_users` remains a platform identity compatibility projection. Tenant authorization comes from `tenant_memberships` and `tenant_role_bindings`; the legacy `role` column is not future tenant authority.
4. The singleton `settings` record is migrated to a tenant-owned compatibility configuration. Platform/provider credentials must be split behind a platform secret boundary before generalized activation; a secret is never copied into a tenant export, hash receipt, log, or client payload.
5. `worker_runs` remains a platform scheduler/health envelope and must not contain tenant-owned payloads or grant tenant authority. `audit_logs` becomes tenant-owned for tenant activity; platform audit uses a separate platform resource. Existing explicit platform and `legacy_unscoped` audit rows remain immutable transition history and cannot authorize tenant access.
6. A missing, empty, malformed, ambiguous, or contradictory tenant/workspace context fails closed. No compatibility fallback may assign a real row based on whichever tenant happens to be active.

## 2. Mechanical reconciliation

This map uses the 37-table order in `scripts/data-transfer-contract.mjs` as the exact recovery inventory. The earlier plan wording that referred to a 23-table contract is historical; the active recovery contract has 37 entries after the Phase 1 tenant-foundation additions.

| Inventory | Expected | Reconciled source |
|---|---:|---|
| Recovery tables | 37 | `TABLE_NAMES` in `scripts/data-transfer-contract.mjs` |
| Current API route files | 9 | recursive `src/app/api/**/route.ts` inventory |
| Current server action modules | 9 | 5 business action modules plus 4 authentication action modules |
| Current business worker modules | 4 | crawl, enrichment, AI verification, AI artifact processing; score recompute is a worker route/query family |
| Compatibility-scoped legacy tables in T-028 | 18 | `COMPATIBILITY_TENANT_TABLES` in `src/lib/tenancy/compatibility-backfill.ts` |

Table definitions are distributed across `src/lib/db/schema.ts`, the Phase 1 Postgres migrations, and the dynamically prepared compatibility-backfill receipt table. A table is not omitted merely because it is created by a migration or preparation routine rather than the base SQLite schema string.

## 3. Exact 37-table ownership matrix

“Current” describes the active repository before G-002 through G-007. “Phase 2 rule” is the required destination contract.

| # | Table | Current ownership/state | Phase 2 ownership rule | Parent/derivation and required enforcement | Migration/backfill owner |
|---:|---|---|---|---|---|
| 1 | `zip_codes` | Global local-geography reference | Platform reference | No tenant column. Read-only through a named reference-data path; no tenant mutation. Coverage involving tenant runs joins through tenant-owned run/unit rows. | G-002 confirms no ownership column; G-010 separates reference reads from tenant coverage. |
| 2 | `location_markets` | Global geography reference | Platform reference | No tenant column. Keep a platform-unique stable identity and expose only through named read-only reference-data paths. Tenant selection and authorization are represented by tenant-owned policy/access rows, never by duplicating or mutating the market definition. | G-002 confirms no ownership column; G-010 separates reference reads from tenant access and coverage. |
| 3 | `location_cells` | Global child of a platform market | Platform reference child | No tenant column. Enforce the existing platform market parent and stable platform identity. A tenant crawl may reference a cell only through its tenant-scoped run/unit contract; the reference row itself grants no tenant authority. | G-002 confirms no ownership column; G-010 separates reference reads from tenant coverage. |
| 4 | `tenants` | Phase 1 root table | Platform control / tenant boundary root | No parent. Platform provisioning creates it; tenant access resolves to this exact active tenant. Slug/global identity stays platform-unique. | Already Phase 1; G-017/G-018 consume. |
| 5 | `workspaces` | Phase 1 tenant child | Tenant root child | Required `tenant_id`; `(tenant_id, id)` identity and lifecycle must match active tenant. | Already Phase 1; G-017/G-018 consume. |
| 6 | `tenant_memberships` | Phase 1 tenant auth row, optional workspace | Tenant/workspace authorization child | Tenant required; optional workspace must belong to same tenant. Auth identity is platform-owned; membership is tenant-owned. | Already Phase 1; G-017/G-018 consume. |
| 7 | `tenant_role_bindings` | Phase 1 tenant authorization row | Tenant child | Tenant must match membership; active/revoked state and role are evaluated with membership lifecycle. | Already Phase 1; G-017/G-018 consume. |
| 8 | `tenant_policies` | Phase 1 tenant policy row | Tenant root | Required tenant and monotonically versioned policy; no global fallback policy. | Already Phase 1; G-017/G-018 consume. |
| 9 | `support_access_grants` | Phase 1 audited support elevation | Tenant/workspace control child | Required tenant; optional workspace must be in tenant. Actor, approval, time window, permission, and data-class rows all must match. | Already Phase 1; no Phase 2 broadening. |
| 10 | `support_access_grant_permissions` | Child of support grant | Tenant child by grant | Tenant is derived only through exact `grant_id`; child value cannot authorize a different tenant. | Already Phase 1. |
| 11 | `support_access_grant_data_classes` | Child of support grant | Tenant child by grant | Tenant is derived only through exact `grant_id`; data-class allowlist is additive to, not a replacement for, permission checks. | Already Phase 1. |
| 12 | `tenant_export_jobs` | Phase 1 tenant/workspace job | Tenant/workspace child | Required tenant; optional workspace validated against tenant. Snapshot scope and every exported row must match job scope. | Already Phase 1; G-015 scopes current CSV; later export domain consumes. |
| 13 | `tenant_deletion_jobs` | Phase 1 tenant lifecycle job | Tenant root or tenant/workspace job per requested scope | Required tenant. Workspace scope, if present in the request contract, must belong to tenant. State machine never restores access on failure. | Already Phase 1; later lifecycle implementation consumes. |
| 14 | `tenant_deletion_checkpoints` | Child of deletion job | Tenant child by deletion job | Derive scope from job; compound parent rule and immutable completion receipt. | Already Phase 1. |
| 15 | `tenant_deletion_checkpoint_events` | Append-only checkpoint history | Tenant child by checkpoint/job | Derive tenant through checkpoint and job; append-only, no cross-job event. | Already Phase 1. |
| 16 | `tenant_deletion_tombstones` | Non-reconstructive tenant deletion proof | Tenant child by deletion job | Required tenant/job consistency; must not contain recoverable customer content or secrets. | Already Phase 1. |
| 17 | `compatibility_backfill_receipts` | Dynamically prepared, immutable T-028 receipt | Tenant/workspace control child | Exact manifest tenant/workspace/policy/engine/hash binding; append-only. It proves a completed backfill but grants no live-source authority. | T-028 complete; G-023 consumes. |
| 18 | `settings` | Singleton global settings and encrypted key storage | Tenant root for compatibility settings; platform-secret split for provider credentials | Compatibility settings receive validated manifest tenant. Scoring, discovery, budgets, scheduler and AI policy are read with tenant scope. Encrypted provider keys move behind a named platform/tenant secret resolver and are excluded from ordinary export. No “row 1” global fallback. | G-006 schema mirror; G-016 actions/reads; later connector credential tasks split secrets. |
| 19 | `app_users` | Global legacy user directory and role/status projection | Platform identity compatibility | No tenant ownership column. Map `user_id` to tenant memberships. Legacy `role`, team fields, and status may support compatibility display but cannot grant tenant access. | G-016 removes authorization dependence; G-008 verifies identity mapping. |
| 20 | `user_market_access` | Global user-to-platform-market join | Tenant root with optional workspace narrowing | Required tenant; optional workspace must belong to that tenant. The user must have an active membership in the tenant and the target market must be an active platform reference. Use tenant-inclusive identity/uniqueness; the market row has no tenant to match and grants no authority by itself. | G-002/G-006/G-007; G-010 and G-016 scope calls. |
| 21 | `crawl_runs` | Global run | Tenant root with optional workspace | Required tenant from validated request/worker context; optional workspace must belong to that tenant. Selection and counters remain inside the exact persisted scope. | G-002/G-006/G-007/G-008; G-013/G-014 scope workers/actions. |
| 22 | `crawl_units` | Child of global crawl run | Tenant child with inherited optional workspace | Derive tenant and workspace exactly from `crawl_runs`; caller-supplied scope cannot broaden or differ. Market/cell identifiers resolve to platform references and never authorize the unit. The legacy `zip` field is a compatibility location token: require a `zip_codes` reference only for an explicitly ZIP-mode legacy unit, while generalized units may retain a normalized postal code, raw postal code, or cell identifier. | G-002/G-006/G-007/G-008; G-013/G-014. |
| 23 | `leads` | Global row keyed globally by Google place ID | Tenant root | Required tenant. Place identity and other dedupe keys become tenant-inclusive. Phase 2 does not infer a workspace column where legacy evidence is ambiguous; workspace access is constrained by validated tenant/workspace context and related rows until a later domain model makes workspace ownership explicit. | G-003/G-006/G-007/G-008; G-011/G-012. |
| 24 | `lead_notes` | Global child of lead | Tenant/workspace child | Tenant derives from lead. Workspace comes from validated active context and must belong to tenant; compound child/lead scope prevents cross-tenant reference. | G-003/G-006/G-007/G-008; G-012. |
| 25 | `outreach_events` | Global lead history | Tenant/workspace child | Tenant derives from lead; workspace and actor must be authorized in tenant. Existing values are historical/manual observations, never proof of platform send. | G-003/G-006/G-007/G-008; G-012 and outreach guardrails. |
| 26 | `admin_requests` | Global lead/admin workflow | Tenant/workspace child | Tenant derives from lead; creator/assignee memberships and workspace must be in tenant. Open-request uniqueness becomes tenant-inclusive. | G-003/G-006/G-007/G-008; G-016. |
| 27 | `demos` | Global lead child with public slug lookup | Tenant/workspace child with explicit public projection | Tenant derives from lead; workspace from validated context. Public lookup is only by an approved published, not revoked artifact and returns a bounded projection, never tenant-internal fields. | G-003/G-006/G-007/G-008; G-012/G-017; public parity in G-024. |
| 28 | `place_cache` | Global cache keyed by Google place ID | Tenant root cache | Required tenant in cache key. Raw provider response from tenant A cannot satisfy tenant B. No review text persistence. | G-005/G-006/G-007/G-008; G-022. |
| 29 | `places_master` | Global canonical place keyed by Google place ID | Tenant root source projection | Required tenant and tenant-inclusive source identity. A future global entity-resolution layer is a separate domain, not implicit sharing of this row. | G-005/G-006/G-007/G-008; G-022. |
| 30 | `place_observations` | Global provider observation | Tenant child/source observation | Required tenant and source/run provenance. Parent place identity must match tenant. Raw field policy and retention apply; no review text. | G-005/G-006/G-007/G-008; G-022. |
| 31 | `api_usage_events` | Global API usage ledger | Tenant root usage event | Required tenant plus run/source/correlation attribution. Budget aggregation always starts with tenant predicate; platform billing aggregate uses a named platform-only path. | G-005/G-006/G-007/G-008; G-020/G-022. |
| 32 | `ai_lead_verifications` | Global child of lead | Tenant/workspace child | Tenant derives from lead; workspace/actor/request context must match. Input/output/source evidence cannot cross tenant. | G-004/G-006/G-007/G-008; G-013/G-014. |
| 33 | `ai_usage_events` | Global AI usage ledger | Tenant root usage event | Required tenant; actor/run/artifact attribution must resolve inside tenant. Platform aggregate is named and permissioned, never missing-scope fallback. | G-004/G-006/G-007/G-008; G-020. |
| 34 | `lead_ai_artifacts` | Global child/queue record | Tenant/workspace child | Tenant derives from lead; workspace/requester must match. Queue lease key and idempotency include tenant. Artifact content/source arrays remain tenant-bound. | G-004/G-006/G-007/G-008; G-013/G-014. |
| 35 | `ai_feedback_events` | Global child of lead/artifact | Tenant/workspace child | Tenant derives from lead and referenced artifact; workspace/actor must match. No cross-tenant model-evaluation aggregate through ordinary paths. | G-004/G-006/G-007/G-008; G-012/G-020. |
| 36 | `worker_runs` | Global platform scheduler/health record | Platform identity/control | No tenant ownership column. Retain only bounded non-content worker health, status, timing, and correlation metadata. Tenant execution authority and details live in tenant-scoped crawl/source/agent runs linked through an immutable job/run/lease; a `worker_runs` row cannot supply or broaden tenant authority. | G-004 confirms no tenant column; G-013/G-014 link tenant execution to the platform envelope without copying tenant payloads into it. |
| 37 | `audit_logs` | Phase 1 transition table with explicit tenant/platform rows and preserved `legacy_unscoped` history | Tenant root, append-only | New tenant audit requires tenant and validated optional workspace. Platform-only events move to a separate platform audit resource instead of weakening this tenant-owned contract. Existing `platform` and `legacy_unscoped` rows remain immutable, non-authorizing transition history until the bounded cutover/recovery task migrates or archives them. | G-018 propagates tenant context; G-020 and the later audit cutover separate platform operations while preserving Phase 1 history. |

All 37 tables are classified. No table may proceed to a scope migration using a different rule without updating this document and obtaining architecture/security review.

## 4. Query-family inventory and target rule

Most current data access is concentrated in `src/lib/db/queries.ts`; the global function signatures are a primary Phase 2 risk. The families below cover every exported current business-data query or mutation by domain, including aggregates and queues.

| Query family | Current entry points/examples | Current global behavior | Required Phase 2 rule / task |
|---|---|---|---|
| Database initialization/runtime repair | `ensureDbReady`, geography repair, stale worker repair | Schema/runtime work has no request tenant | Schema repair remains platform control; any data repair must accept an explicit bounded tenant or exact platform maintenance authorization. G-006/G-008. |
| Settings and secrets | `getSettings`, `updateSettings`, stored OpenAI/Google key getters/setters, scheduler feature checks | Reads singleton `settings.id=1` | Tenant settings require `TenantScope`; secret resolution uses named server-only credential scope. G-016. |
| Worker health/history | `startWorkerRun`, completion/interruption, scheduler health/history/operations summaries | Platform worker envelope is global and current summaries may mix it with tenant queues | Keep `worker_runs` as a permissioned platform-health projection with no customer content. Tenant operational views read tenant-scoped crawl/source/agent runs and join only through immutable job/run/lease correlation. G-013/G-014/G-020. |
| Platform geography reference | active zip/count/state/county/zip-list functions | Global reads | Keep named, read-only platform-reference functions. They cannot return tenant run/lead coverage. G-010. |
| Platform markets/cells and tenant access | market/cell lists, planner options, cell coverage, user market-access replacement/list/check | Global reference enumeration mixed with tenant operational joins | Keep market/cell definitions behind named read-only platform-reference functions. Require tenant plus validated optional workspace before access-grant, coverage, or operational predicates; assert every tenant-owned result. G-010/G-016. |
| Crawl run/unit lifecycle | run create/list/get/status/cancel/counters, unit create/lease/retry/progress/coverage/candidate functions | IDs are globally guessable and workers lease globally | Require scope, compound parent checks, tenant-prefixed lease/index. G-013/G-014. |
| Lead discovery/upsert/manual creation | `upsertLead`, `createManualLead`, `leadExists` | Global Google place uniqueness and ID access | Require tenant; dedupe on tenant + source identity; parent market/cell must match. G-012. |
| Lead reads/maps/export/counts | lead list/detail/map, business-type counts, Kanban/grouping, qualified counts, score bands, export reads | Filters omit mandatory tenant predicate | Require `TenantScope` first; wrong-tenant ID is non-enumerating; assert rows/aggregates. G-011/G-015. |
| Lead/CRM mutations | status, facts, notes, assignment/claim, exclusion/archive/bulk, reminders/timestamps | Mutates by global ID | Authorize tenant/workspace and action, then update with tenant predicate; child parent scope is database-enforced. G-012. |
| AI verification and quality | verification create/read/apply/correct, quality score/bucket/manual-review, quality lists/candidates | Lead IDs and AI context are global | Tenant/workspace required through lead; queue and result updates include tenant; evidence/model context is isolated. G-011–G-014. |
| AI artifact queue | artifact create/read/lease/complete/error/retry and badges | Global queue and artifact IDs | Tenant-prefixed lease/idempotency and exact actor/lead scope. G-013/G-014. |
| AI feedback and usage | feedback create/list/summary; AI usage log/actor totals | Ordinary summaries can aggregate globally | Tenant required for all ordinary writes/reads/aggregates; platform evaluation path is named and permissioned. G-012/G-020. |
| API usage/budget | today/run/monthly usage, SKU totals, event logging | Usage totals can mix clients | Tenant-first aggregation and event attribution; no shared budget fallback. G-020/G-022. |
| Place cache/master/observations | cache read/write, observation record, master existence/upsert/export/backfill | Global place ID serves every caller | Tenant-inclusive key and source/run policy; no cross-tenant reuse or review text. G-022. |
| Enrichment queue | unenriched list/lease/failure/update/stats | Global queue | Tenant worker context, tenant-prefixed lease/order and update predicate. G-013/G-014. |
| Demo/public artifact | demo create/publish/unpublish/revoke/view; published slug lookup | Internal writes and public lookup start from global records | Tenant-authorized writes; public lookup uses only bounded published projection and cannot enumerate tenant. G-012/G-017/G-024. |
| Outreach history | outreach event create/list/count; `src/lib/outreach-package.ts` artifact generator | Global lead IDs; legacy wording may imply unsupported claims | Tenant/workspace and actor required; artifact only, human review, no send. G-012/G-023/G-024. |
| Admin request/workbench/team | admin request lifecycle/summary, now queue, workbench/team/focus/follow-up | IDs and aggregates can span the whole dataset | Scope every row and aggregate to tenant, then enforce workspace/assignment visibility. G-011/G-012/G-016/G-020. |
| Dashboard/statistics/conversion | dashboard stats, conversion metrics, statistics summary, quality/economics/operations breakdowns | Global aggregates | Tenant predicate is mandatory inside each source subquery; platform aggregate is separate. G-020. |
| Audit writing | tenant/platform/legacy audit functions | Phase 1 transition APIs share one table; legacy wrapper remains compatibility-only | New tenant events use the tenant audit contract. New platform events use a separate platform audit resource. Existing platform/legacy rows remain immutable and non-authorizing; tenantless legacy writes are denied outside the preserved compatibility contract. G-018/G-020. |
| Tenant foundation queries | `src/lib/tenancy/queries.ts` | Already explicit tenant/auth identity queries | Preserve required scope, lifecycle and result assertions; no optional-tenant wrapper. G-017/G-018. |

G-009 must introduce one required `TenantScope` contract before broad query edits. It must not offer an optional tenant parameter or a helper that silently drops the tenant predicate.

## 5. Route and public-entry inventory

There are exactly nine current API route files.

| Route | Current domain | Required ownership/authorization rule |
|---|---|---|
| `POST /api/ai/artifacts/process-next` (`GET` exists only to return 405) | AI artifact worker | Resolve signed internal worker identity and exact tenant/workspace job context; lease/update only that tenant. No GET mutation. G-013/G-014. |
| `POST /api/ai/verify-next` (`GET` exists only to return 405) | AI verification worker | Same worker-context rule; model inputs, sources, usage and lead update remain tenant-bound. G-013/G-014. |
| `POST /api/crawl/enrich-next` (`GET` exists only to return 405) | Enrichment worker | Exact tenant worker context and queue lease; source authorization remains separate. G-013/G-014/G-022. |
| `POST /api/crawl/process-next` (`GET` exists only to return 405) | Crawl worker | Exact tenant/workspace run context; run/unit/source usage all reconcile. G-013/G-014. |
| `GET /api/explore/map` | Lead/map read | Authenticated tenant/workspace context; tenant-filter before geography filters; no cross-tenant points/counts. G-017. |
| `GET /api/export/csv` | Lead CSV export | Tenant export permission and tenant/workspace snapshot; formula hardening remains. G-015/G-017. |
| `GET /api/health` | Coarse service health | Platform-safe public projection only; no tenant IDs, counts, errors, secrets, or customer data. |
| `GET /api/health/db-activity` | Operational database diagnostics | Named platform operations permission; no ordinary tenant fallback and no raw customer query payload. |
| `POST /api/scores/recompute-stale` (`GET` exists only to return 405) | Score worker | Exact tenant worker context and bounded tenant queue; no GET mutation. G-013/G-014. |

The public page `src/app/demo/[slug]/page.tsx` is also an external read entry. It may resolve only the explicit published, not revoked `PublishedDemo` projection. Internal tenant/workspace, lead, notes, contact data, audit data, and draft configuration must not be exposed.

## 6. Server-action and authentication inventory

| Module(s) | Current responsibility | Target rule |
|---|---|---|
| `src/lib/leads/actions.ts` | Lead/CRM actions | Resolve server-derived actor and tenant/workspace; authorize exact action; call scoped query. G-012/G-019. |
| `src/lib/crawl/actions.ts` | Crawl planning/lifecycle | Tenant/workspace plus source/market authorization; no provider call from a flag alone. G-013/G-019. |
| `src/lib/admin-requests/actions.ts` | Admin fulfillment workflow | Tenant/workspace and assignee membership; platform support path remains distinct. G-016/G-019. |
| `src/lib/settings/actions.ts` | Settings and key changes | Tenant feature/policy settings use tenant authority; platform/provider secrets use a named secret-management path and audit. G-016/G-019. |
| `src/lib/users/actions.ts` | User, role, territory/team administration | Auth identity is platform-owned; all membership/role/market changes target one tenant and expected version. G-016/G-019. |
| `src/app/auth/callback/actions.ts`, `login/actions.ts`, `forgot-password/actions.ts`, `reset-password/actions.ts` | Platform authentication/recovery | Platform identity operations only. After authentication, tenant selection is resolved from active membership; untrusted redirect/form data never selects tenant authority. |

Every action must derive actor, tenant, workspace, membership, role and policy on the server. Client-supplied IDs are targets to validate, not proof of authority.

## 7. Worker and queue inventory

| Worker path | Durable rows touched | Phase 2 rule |
|---|---|---|
| `src/lib/crawl/worker.ts` | crawl runs/units, leads, place/source and API usage rows | Tenant/workspace comes from signed worker context and leased run; all created rows copy the same tenant; source call separately authorized. |
| `src/lib/crawl/enrichment.ts` | leads, place cache/master/observations, API usage | Tenant comes from leased lead/job; cache keys include tenant; no review text; stop on scope/source mismatch. |
| `src/lib/ai/verification-worker.ts` | leads, AI verifications/usage, source evidence | Tenant/workspace comes from leased lead/job; model context and usage never cross tenant. |
| `src/lib/ai/artifact-worker.ts` | AI artifacts/usage and lead context | Tenant/workspace comes from artifact/lead compound scope; artifact-only output, no transport. |
| score recompute route/query family | leads and worker runs | Tenant-prefixed candidate query/lease/update; platform-wide maintenance requires a separately named platform job and audit. |

Worker signatures must carry `TenantWorkerContext`; queue selection, lease, renewal, completion, retry, dead-letter/error and counters all include tenant. A global “next job” function is not allowed after cutover.

## 8. Cache, source and export inventory

### Caches and source projections

- `place_cache`: currently raw place-detail JSON keyed globally by place ID. Target key begins with tenant and source policy/version; sanitizer continues stripping review bodies.
- `places_master`: currently a global canonical place projection. In Phase 2 it is tenant-owned; future generalized account resolution must not be simulated by sharing this raw row.
- `place_observations`: tenant/source/run provenance is required; raw retention and allowed fields follow D-010/D-014.
- `ai_lead_verifications` and `lead_ai_artifacts`: treated as tenant-bound model-result caches/artifacts; input hash or source ID never enables cross-tenant reuse.
- In-process/runtime caches, if introduced or discovered, must key tenant/workspace before object ID and must be cleared/invalidation-scoped by tenant.

### User-facing CSV export

`/api/export/csv` uses `getLeadsForExport` and `src/lib/csv.ts`. G-015 must add tenant/workspace scope to the query and preserve row-limit, escaping and spreadsheet-formula hardening. Export success means an authorized response/artifact was created; it does not mean external delivery.

### Recovery export/import

`scripts/export-sqlite-data.mjs`, `scripts/import-supabase-data.mjs`, `scripts/verify-data-recovery.mjs`, and `scripts/data-transfer-contract.mjs` cover all 37 tables. They are platform recovery tooling, not a tenant-user bypass. Restore requires the T-029 isolated privilege/preflight/manifest/hash/trigger/sequence procedure. Secrets remain excluded. No production or customer snapshot is authorized by this map.

### Public demo projection

Public demo reads are not ordinary exports. They expose only the explicit published projection for an unrevoked slug. Publishing/unpublishing/revocation remains tenant-authorized and audited; view counting cannot reveal tenant-internal data.

## 9. Settings ownership split

The current `settings` singleton mixes several concerns. Phase 2 must scope it without freezing that mixture into the future architecture.

| Current field family | Compatibility owner | Future boundary |
|---|---|---|
| Niche weights, website multipliers/host lists | Compatibility tenant/play | Versioned lead-play configuration; G-023 snapshot until generalized play persistence. |
| Search radius, discovery mode, pagination policy | Compatibility tenant/workspace play | Versioned source/discovery plan, not a platform default. |
| Rate limits, call caps, cache TTL, monthly source budget | Tenant source policy plus platform hard ceiling | Effective limit is the more restrictive tenant/platform/source policy. |
| Enrichment/website-health switches and limits | Tenant feature/source policy | Feature enabled does not authorize provider, field, jurisdiction or budget. |
| AI enablement, model, budgets, batch/retry/concurrency | Tenant policy plus platform model allowlist/hard ceiling | Model credentials and provider approval remain separate. |
| Scheduler worker switches | Tenant operational policy; platform kill switch may override | Worker context remains tenant-scoped. |
| Encrypted OpenAI/Google server keys | Platform/tenant secret boundary, never ordinary settings export | Named credential resolver, least privilege, rotation/audit, server-only. |
| Browser Google Maps key | Explicit public-client credential class with domain restrictions | Never reuse server key; tenant/source authorization still required. |

The migration first binds the existing row to the validated compatibility tenant. G-016 then removes global reads/writes. Provider-secret extraction can occur later behind the approved connector/secret adapter, but the compatibility row must never be duplicated to arbitrary new tenants.

## 10. Mandatory migration and cutover order

1. **Freeze this map (G-001).** Any ownership ambiguity blocks only its affected domain; no migration guesses.
2. **Postgres structural scope:** G-002 tenant-scopes market-access grants and crawl runs/units while leaving ZIP, market, and cell reference tables platform-global; then G-003 scopes leads/CRM, G-004 AI/worker, and G-005 source/cache/usage. These migration producers run one at a time against the shared migration sequence.
3. **SQLite compatibility mirror (G-006).** Create/validate compatibility identity before backfill; preserve every row and recover interrupted upgrades.
4. **Compound constraints/indexes (G-007).** Add parent/child scope keys, tenant-inclusive uniqueness and tenant-prefixed hot-path indexes. Do not add a global uniqueness constraint that prevents identical provider IDs in two tenants.
5. **Reconciliation (G-008).** Count every row, derive scope by this map, emit deterministic manifest/hash, and stop on missing/ambiguous/contradictory ownership. No auto-assignment.
6. **Required data-access scope (G-009).** Introduce the mandatory typed scope and named platform escape hatch before widespread call-site changes.
7. **Read/mutation/worker/action cutover (G-010–G-022).** Scope queries before routes, actions and workers consume them. Maintain compile-safe bounded families.
8. **Compatibility play/parity (G-023/G-024).** Preserve exact approved current behavior and explain every intentional difference.
9. **Phase gate (G-025).** Require two-tenant route/action/worker/cache/aggregate tests, compatibility parity, recovery dry run, Postgres RLS evidence, and authenticated local smoke before Phase 3.

Within a migration transaction, use the order parent table -> nullable scope column -> deterministic backfill/reconciliation -> compound unique parent key -> child scope copy -> compound foreign key -> tenant-prefixed indexes -> validate -> `NOT NULL` only after zero-orphan proof. Migrations are forward-only and rehearsed on disposable SQLite/Postgres fixtures before acceptance.

## 11. Security invariants and negative tests

Every affected G-002–G-025 acceptance must prove the applicable invariants:

1. Tenant A cannot read, count, map, export, mutate, lease, cache-hit, enrich, score, verify, draft from, or aggregate Tenant B data.
2. A guessed row ID is non-enumerating and has no durable side effect.
3. A child row cannot carry a tenant different from its parent, including direct SQL negative tests.
4. A tenant cache miss cannot fall back to another tenant's cache row.
5. A worker without exact signed tenant/workspace context cannot lease work; a platform worker is explicitly typed and cannot receive customer payload by default.
6. `app_users.role` alone never authorizes tenant work; inactive/suspended/revoked membership fails immediately.
7. Support access remains time-bound, approved, permission/data-class constrained, audited, and incapable of satisfying outreach review/copy/export.
8. A feature flag never substitutes for source/provider terms, tenant authorization, contact use, jurisdiction, budget, credential, permission, or human review.
9. Review text, secrets, raw credential values, cross-tenant identifiers and unsupported outreach claims do not leak through caches, exports, logs, health responses, public demos, or model artifacts.
10. Legacy `contacted` and `preview_sent` values remain historical observations, not proof of send/delivery or future approval.
11. Historical `legacy_unscoped` audit rows remain immutable and cannot be queried as tenant-authoritative history without an explicit migration/review decision.
12. Every ordinary aggregate begins with tenant scope inside each contributing query, not only after a global aggregate is computed.

## 12. Architecture/security review checklist

G-001 is accepted only when review confirms:

- [x] all 37 recovery-contract tables appear exactly once in the matrix;
- [x] all nine API route files and the public demo read are classified;
- [x] all current business/authentication action modules are classified;
- [x] all worker, queue, cache, source, export, settings, query and aggregate families are classified;
- [x] each table has one explicit ownership/derivation rule and migration owner;
- [x] platform reference, identity, health, support, recovery and audit paths are named rather than inferred from missing tenant context;
- [x] raw provider sharing defaults to denied;
- [x] application/user authorization does not rely on legacy global role fields;
- [x] migration order is parent-first, reconciled, constraint-backed and forward-only;
- [x] Phase 2 negative-test expectations cover reads, writes, queues, caches, aggregates, public projection and recovery boundaries.

Any code or migration that conflicts with this map must stop and update the decision with a new architecture/security review before proceeding.
