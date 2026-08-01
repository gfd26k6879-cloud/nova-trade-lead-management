# G-007 retained global-index crosswalk

Date: 2026-08-01

Catalog baseline: `c15cf94c24093769a1f1648deb4d4f392474ad7b`

Status: exact appendix reconstructed and accepted during G-007P19 closeout

Receipt commit: `4adc7bd09c84d8890b1950221b78255b0af38564`

## Definition and arithmetic

This appendix enumerates every retained valid secondary btree on the sixteen
G-002/G-003/G-004A/G-005 tenant-owned PostgreSQL tables whose first key is not
`tenant_id` and which is not owned by a `pg_constraint`. A fresh PostgreSQL
16.14 replay discovered 53 migrations, applied 51, and skipped the same two
runtime-only files.

The exact catalog arithmetic is:

- G-002: 13;
- G-003: 39;
- G-004A: 10;
- G-005: 0;
- total: 62.

The P17 partition is reproduced as 28 mapped or queued and 34 unclassified:

- mapped/queued: G-002 3 + G-003 15 + G-004A 10 = 28;
- unclassified: G-002 10 + G-003 24 = 34.

After the accepted P21 dispositions, 30 names are mapped or accepted and 32
remain unclassified: G-002 is now 5 classified and 8 unclassified; the G-003
and G-004A partitions are unchanged.

After the accepted P22 source classification, 31 names are mapped or accepted
and 31 remain unclassified: G-002 is now 6 classified and 7 unclassified.

After the accepted P23 source classification, 32 names are mapped or accepted
and 30 remain unclassified: G-002 is now 7 classified and 6 unclassified.

After the accepted P24 plan audit, 33 names are mapped or accepted and 29 remain
unclassified: G-002 is now 8 classified and 5 unclassified.

After the accepted P25 plan audit, 34 names are mapped or accepted and 28 remain
unclassified: G-002 is now 9 classified and 4 unclassified.

After the accepted P26 source classification, 35 names are mapped or accepted
and 27 remain unclassified: G-002 is now 10 classified and 3 unclassified.

After the accepted P27 two-index source classification, 37 names are mapped or
accepted and 25 remain unclassified: G-002 is now 12 classified and 1
unclassified.

After the accepted P28 plan audit, 38 names are mapped or accepted and 24
remain unclassified: G-002 is complete at 13 classified and 0 unclassified.

After the accepted P29 plan audit, 39 names are mapped or accepted and 23
remain unclassified. G-003 is now 16 classified and 23 unclassified.

After the accepted P30 plan audit, 40 names are mapped or accepted and 22
remain unclassified. G-003 is now 17 classified and 22 unclassified.

After the accepted P31 plan audit, 41 names are mapped or accepted and 21
remain unclassified. G-003 is now 18 classified and 21 unclassified.

After the accepted P32 plan audit, 42 names are mapped or accepted and 20
remain unclassified. G-003 is now 19 classified and 20 unclassified.

After the accepted P33 plan audit, 43 names are mapped or accepted and 19
remain unclassified. G-003 is now 20 classified and 19 unclassified.

For this reconstruction, an exact audit target or named plan/control owner is
mapped. Merely appearing as a migration foundation guard does not classify a
tenant-query family. P18 and P19 each classify two names already inside the 28,
so the arithmetic does not change. `M` means mapped/queued, `A` means accepted
audit disposition, and `U` means not yet classified by a bounded G-007 audit.

## G-002 — 13 indexes

| Status | Table | Index and ordered keys | Current/future owner |
|---|---|---|---|
| A:P22 retain/defer | `crawl_runs` | `idx_crawl_runs_blocked_created(status, blocked_at DESC, created_at DESC) WHERE status='blocked'` | no exact current reader; PK-scoped lifecycle and created-time display; retain historical replay compatibility, re-audit after exact G-013 contract; G-020 alone is not an owner |
| A:P21 retain | `crawl_runs` | `idx_crawl_runs_created_desc(created_at DESC)` | exact current global visibility/history owner; future G-013 form deferred |
| A:P23 retain/defer | `crawl_runs` | `idx_crawl_runs_market_created(market_id, created_at DESC)` | scope-neutral child-side FK-maintenance support candidate for accepted `crawl_runs_market_id_fkey`; not constraint-owned or measured; platform market is not tenant authority; no exact current market-history reader; retain PostgreSQL/SQLite compatibility and defer tenant history to an exact G-010/G-013 contract |
| A:P21 retain | `crawl_runs` | `idx_crawl_runs_status_created(status, created_at DESC)` | current global status-filter compatibility support; future G-013 form deferred |
| A:P24 retain | `crawl_units` | `idx_crawl_units_budget_pages(crawl_run_id, status, pages_fetched, max_pages)` | exact current remaining-search-call aggregate owner; natural index-only plans use 5-20 buffers and zero heap fetches; transactional drop regresses to 2,503-2,750-buffer heap plans; future tenant/workspace form deferred to exact G-013/G-021 contract |
| A:P25 retain | `crawl_units` | `idx_crawl_units_cell_status(location_cell_id, status, category)` | exact current cell-coverage and cell-ledger compatibility owner; target-led natural plans avoid sequential scans; platform cells never authorize tenant units; future tenant/workspace forms remain G-010/G-013 work |
| A:P26 retain/defer | `crawl_units` | `idx_crawl_units_market_status(market_id, status, category)` | no exact current reader; scope-neutral child-side support candidate for the single-column market FK, not constraint-owned or measured and incomplete for the compound market/cell FK; platform market is not tenant authority; retain PostgreSQL/SQLite compatibility and defer tenant/workspace market-unit query semantics and any tenant-prefixed replacement to an exact G-010/G-013 contract |
| A:P4 retain | `crawl_units` | `idx_crawl_units_retry_ready(crawl_run_id, status, next_retry_at, created_at) WHERE status='retry_wait'` | retry reset; G-013 |
| M:P4 RI/current run | `crawl_units` | `idx_crawl_units_run(crawl_run_id)` | run-child RI and compatibility; G-013 |
| M:P4 plan control | `crawl_units` | `idx_crawl_units_run_status(crawl_run_id, status)` | run/status reads; G-013 |
| A:P28 retain/defer | `crawl_units` | `idx_crawl_units_status_zip(status, zip)` | healthy PostgreSQL target plus historical PostgreSQL/SQLite compatibility and measured mode-filtered/structural-control support only; exact failed-error, reset/lease, statistics, and full geography paths use accepted siblings or sequential plans; platform/generalized ZIP-token pollution is separate G-010/G-013 semantic debt, never authority or an index defect; no necessity, replacement, or removal claim |
| A:P27 retain/defer | `user_market_access` | `idx_user_market_access_market(market_id, user_id)` | no current runtime application market-leading reader; test-only market predicates prove no plan ownership; unmeasured non-constraint-owned PostgreSQL CASCADE lookup/maintenance candidate and SQLite NO ACTION enforcement-lookup candidate; never platform-market tenant authority or cross-engine equivalence; retain compatibility and defer live RI/replacement/removal claims |
| A:P27 retain/defer | `user_market_access` | `idx_user_market_access_user(user_id, market_id)` | current user-led compatibility-query candidate, but no natural plan-owner, identity, uniqueness, necessity, duplication, or removal claim; G-002/frozen identities differ from legacy/current-prepared SQLite; defer scoped query semantics to G-009/G-010/G-011/G-016/G-018 |

## G-003 — 39 indexes

| Status | Table | Index and ordered keys | Current/future owner |
|---|---|---|---|
| A:P15 defer | `admin_requests` | `idx_admin_requests_assigned_created(assigned_admin_user_id, created_at DESC)` | G-015/G-017/G-018 |
| A:P14 defer | `admin_requests` | `idx_admin_requests_creator_created(created_by_user_id, created_at DESC)` | G-015/G-017 |
| M:P11 control | `admin_requests` | `idx_admin_requests_lead_created(lead_id, created_at DESC)` | lead-local requests; G-015 |
| M:P11 current list | `admin_requests` | `idx_admin_requests_status_type_created(status, request_type, created_at DESC)` | open/admin lists; G-015/G-017 |
| A:P17 retain | `demos` | `idx_demos_lead_id(lead_id)` | compatibility; G-015 |
| A:P16 public | `demos` | `idx_demos_public_slug(slug, is_published, revoked_at)` | bounded public demo resolution; G-024 |
| A:P13 defer | `lead_notes` | `idx_lead_notes_author_created(author_user_id, created_at DESC)` | G-015/G-017 |
| M:P13 control | `lead_notes` | `idx_lead_notes_lead_created(lead_id, created_at DESC)` | lead-local notes; G-015 |
| A:P9 defer | `leads` | `idx_leads_active_discovered_at(archived_at, is_excluded, discovered_at)` | active statistics; G-017/G-018 |
| A:P7 | `leads` | `idx_leads_ai_status_checked(ai_verification_status, ai_checked_at DESC)` | AI viability/current compatibility; G-011/G-014 |
| A:P29 retain/defer | `leads` | `idx_leads_archived_active(archived_at, updated_at DESC)` | healthy historical PostgreSQL catalog and frozen SQLite compatibility definitions; no exact primary plan owner or demonstrated necessity; target-only drop was plan/result/buffer neutral; accepted P10 tenant score-recompute defect remains deferred to G-009/G-011/G-012/G-014/G-019/G-020 plus G-017/G-018 projections; no removal, replacement, candidate, or migration |
| A:P30 retain/defer | `leads` | `idx_leads_assigned_to_user(assigned_to_user_id, updated_at DESC)` | healthy historical PostgreSQL catalog and frozen SQLite compatibility definition; exact local assignee-null cleanup naturally uses the target, but target-only drop shows no material necessity; ordinary assignment readers and helper-capability export controls do not use it, the live CSV route supplies no assignment filter, and no current reader owns the `updated_at` order; visible parent-delete plan cannot attribute nested FK support; assignee is never tenant/workspace authority; no tenant defect, candidate, migration, replacement, test edit, or removal |
| A:P31 retain | `leads` | `idx_leads_business_type_score(business_type, score DESC)` | healthy exact PostgreSQL catalog and frozen SQLite compatibility definition; ordinary shared-plumbing live route plans use accepted siblings, while the independently reproduced measured reachable canonical `local_services` equality-plus-score query-function shape at limit 100 naturally uses this target and target-only drop materially increases buffers and filtered rows; NULL/empty/COALESCE semantic debt is not an index defect; business type/score never authorize tenant/workspace scope; no target-attributable tenant index defect, tenant candidate, migration, replacement, test edit, or removal |
| A:P32 retain; future tenant analogue defer | `leads` | `idx_leads_component_scores(raw_opportunity_score DESC, verification_score DESC)` | healthy exact PostgreSQL catalog and frozen SQLite compatibility definition; independently reproduced current direct raw-opportunity ASC/DESC readers naturally use the target and target-only drop materially increases buffer work and requires scan/sort; verification-only, default opportunity/map, queue, backfill, candidate, and repair shapes are target-neutral; future tenant prefix remains measurement-only until G-009/G-011 and exact downstream owners; component scores never authorize tenant/workspace scope; no target-attributable tenant defect, candidate, migration, replacement, test edit, or removal |
| A:P33 retain; future tenant analogue defer | `leads` | `idx_leads_country_admin(country_code, admin_area1, locality)` | healthy exact PostgreSQL catalog and frozen SQLite compatibility definition; independently reproduced selective current Explore, Quality, and map country filters naturally use the leading country key, while target-only drop materially increases scan/filter/sort/buffer work; common US, city-only, admin/locality suffix, stored-anomaly, and live country-neutral CSV controls are target-neutral; no current country/admin, full-key, or trailing-key authority owner; future tenant prefix remains measurement-only until G-009/G-010/G-011; geography never authorizes tenant/workspace scope; no target-attributable defect, candidate, migration, replacement, test edit, or removal |
| A:P8 | `leads` | `idx_leads_discovered_at(discovered_at)` | discovery counts; G-011/G-017 |
| A:P34 retain; tenant forms defer | `leads` | `idx_leads_enrichment(enrichment_status, score DESC)` | healthy PostgreSQL compatibility owner for current stale-running recovery, selected pending/admin Kanban reads, exact lease ordering support, and scheduler status aggregation; lease/score/P6 siblings own broad active lists, exact Quality, CSV, and fallback controls; Explore/map enrichment shapes are query-function controls only; historical sibling catalog fast-path debt recorded; no current tenant-scoped caller, migration, replacement, test edit, or removal |
| A:P5 defer / M:P6 control | `leads` | `idx_leads_enrichment_lease(enrichment_status, enrichment_next_retry_at, score DESC) WHERE archived_at IS NULL AND COALESCE(is_excluded,0)=0` | enrichment selector/lease; G-013/G-014/G-020 |
| U | `leads` | `idx_leads_exclusion_score(is_excluded, score DESC)` | exclusion/aggregates; G-011/G-012/G-017 |
| U | `leads` | `idx_leads_location_cell(location_cell_id, score DESC)` | cell reads; G-010/G-011 |
| U | `leads` | `idx_leads_market_active(market_id, archived_at, score DESC)` | market reads; G-010/G-011 |
| U | `leads` | `idx_leads_numeric_filters(review_count, rating, score DESC)` | filters; G-011/G-017 |
| U | `leads` | `idx_leads_phone_quality(phone_verification_status, lead_quality_score DESC)` | quality filtering; G-011/G-017 |
| U | `leads` | `idx_leads_primary_type_score(primary_type, score DESC)` | filtering/statistics; G-011/G-017 |
| U | `leads` | `idx_leads_qualification_score(qualification_status, score DESC)` | qualification; G-011/G-017 |
| U | `leads` | `idx_leads_quality_bucket_score(quality_bucket, lead_quality_score DESC)` | quality lists/statistics; G-011/G-017 |
| U | `leads` | `idx_leads_quality_offer(recommended_offer, lead_quality_score DESC)` | offer/quality lists; G-011/G-017 |
| U | `leads` | `idx_leads_queue_candidates(website_status, status, score DESC)` | queue/statistics; G-011/G-014/G-017 |
| U | `leads` | `idx_leads_queue_timing(reminder_date, last_contacted_at)` | follow-up/workbench; G-011/G-012 |
| U | `leads` | `idx_leads_sales_priority(sales_priority_score DESC)` | sales priority; G-011/G-017 |
| U | `leads` | `idx_leads_score(score DESC)` | general ordering; G-011/G-017 |
| A:P10 defer | `leads` | `idx_leads_score_recompute_stale(updated_at DESC, last_quality_scored_at)` | score recompute; G-012/G-017/G-020 |
| U | `leads` | `idx_leads_selling_niche_score(selling_niche, score DESC)` | filtering/statistics; G-011/G-017 |
| U | `leads` | `idx_leads_status(status)` | status reads/mutations; G-011/G-012/G-017 |
| U | `leads` | `idx_leads_website_status(website_status)` | website/queue; G-011/G-014/G-017 |
| U | `leads` | `idx_leads_win_probability(win_probability_score DESC)` | quality/sales; G-011/G-017 |
| U | `leads` | `idx_leads_workbench_active_candidates(assigned_to_user_id, website_status, qualification_status, status, quality_bucket, sales_priority_score DESC, lead_quality_score DESC, score DESC) WHERE archived_at IS NULL AND COALESCE(is_excluded,0)=0 AND score>0` | workbench candidates; G-011/G-017 |
| A:P12 defer | `outreach_events` | `idx_outreach_events_actor_created(actor_user_id, created_at DESC)` | G-015/G-017 |
| M:P12 control | `outreach_events` | `idx_outreach_events_lead(lead_id, created_at DESC)` | lead-local outreach; G-015 |

## G-004A — 10 indexes

| Status | Table | Index and ordered keys | Current/future owner |
|---|---|---|---|
| M | `ai_feedback_events` | `idx_ai_feedback_events_actor_created(actor_user_id, created_at DESC)` | feedback/evaluation; G-014/G-020 |
| A:P18 retain | `ai_feedback_events` | `idx_ai_feedback_events_artifact_id(artifact_id)` | scope-neutral artifact SET NULL maintenance |
| M | `ai_feedback_events` | `idx_ai_feedback_events_kind_verdict(feedback_kind, verdict, created_at DESC)` | feedback evaluation; G-014/G-020 |
| M:P18 control | `ai_feedback_events` | `idx_ai_feedback_events_lead_created(lead_id, created_at DESC)` | lead history; G-014 |
| A:P18 retain | `ai_feedback_events` | `idx_ai_feedback_events_verification_id(verification_id)` | scope-neutral verification SET NULL maintenance |
| A:P20 retain | `ai_usage_events` | `idx_ai_usage_actor_created(actor_user_id, created_at DESC)` | current actor totals; P20A tenant-cap support added separately; generic G-014 remains open |
| A:P20 retain | `ai_usage_events` | `idx_ai_usage_created(created_at DESC)` | current time-window aggregate; tenant form G-017 |
| A:P19 retain | `ai_usage_events` | `idx_ai_usage_events_lead_id(lead_id)` | scope-neutral lead SET NULL maintenance |
| A:P19 retain | `ai_usage_events` | `idx_ai_usage_events_verification_id(verification_id)` | scope-neutral verification SET NULL maintenance |
| A:P20 retain/defer | `ai_usage_events` | `idx_ai_usage_model_created(model, created_at DESC)` | no drop basis and no approved query owner |

G-005 contributes zero residual indexes under this definition. G-007P20A adds
`idx_g007p20a_ai_usage_tenant_actor_created` outside the 62-name residual set
and leaves the retained global owners intact. After accepted P33, the next
unclassified read-only family in exact residual order is
`idx_leads_enrichment(enrichment_status, score DESC)`; the separately proven
P1 researcher archive/exclusion authorization repair takes precedence. This
appendix does not open or number either packet.

## Origin mapping and replay correction

Origins are source-derived from the migrations that create the definitions:

- `202605110001_full_schema.sql`: base crawl-unit, lead, outreach, AI-usage
  created/model indexes;
- `202605120002_supabase_auth_roles.sql`: lead-note indexes;
- `202605130001_lead_quality_command_center.sql` and
  `202605130002_ai_verified_quality_pipeline.sql`: lead quality indexes;
- `20260515123000_researcher_workbench_outreach.sql` and
  `20260520114232_admin_fulfillment_queue.sql`: outreach/admin indexes;
- `20260602033000_score_recompute_stale_index.sql` through
  `202606160001_launch_readiness_reliability.sql`: stale/archive/workbench,
  international-market, dashboard, discovery, budget, retry, and public-demo
  indexes;
- `202607120001_reconcile_researcher_ai_feedback_schema.sql` and
  `202607120002_harden_database_function_access_and_fk_indexes.sql`: AI actor,
  feedback, demo, and reference-maintenance indexes.

The exact per-name origin map is:

```json
{
  "202605110001_full_schema.sql": [
    "idx_crawl_units_run", "idx_crawl_units_status_zip",
    "idx_leads_ai_status_checked",
    "idx_leads_business_type_score", "idx_leads_enrichment",
    "idx_leads_exclusion_score", "idx_leads_numeric_filters",
    "idx_leads_primary_type_score", "idx_leads_qualification_score",
    "idx_leads_queue_candidates", "idx_leads_queue_timing",
    "idx_leads_score", "idx_leads_selling_niche_score", "idx_leads_status",
    "idx_leads_website_status", "idx_leads_win_probability",
    "idx_outreach_events_lead", "idx_ai_usage_created",
    "idx_ai_usage_model_created"
  ],
  "202605120002_supabase_auth_roles.sql": [
    "idx_lead_notes_author_created", "idx_lead_notes_lead_created",
    "idx_leads_assigned_to_user"
  ],
  "202605130001_lead_quality_command_center.sql": [
    "idx_leads_phone_quality", "idx_leads_quality_bucket_score",
    "idx_leads_quality_offer"
  ],
  "202605130002_ai_verified_quality_pipeline.sql": [
    "idx_leads_component_scores", "idx_leads_sales_priority"
  ],
  "20260515123000_researcher_workbench_outreach.sql": [
    "idx_outreach_events_actor_created"
  ],
  "20260520114232_admin_fulfillment_queue.sql": [
    "idx_admin_requests_assigned_created", "idx_admin_requests_creator_created",
    "idx_admin_requests_lead_created", "idx_admin_requests_status_type_created"
  ],
  "20260602033000_score_recompute_stale_index.sql": [
    "idx_leads_score_recompute_stale"
  ],
  "20260602061959_add_lead_archive_fields.sql": [
    "idx_leads_archived_active"
  ],
  "20260602070000_workbench_candidate_index.sql": [
    "idx_leads_workbench_active_candidates"
  ],
  "20260602193000_international_markets_and_territories.sql": [
    "idx_crawl_units_cell_status", "idx_crawl_units_market_status",
    "idx_leads_country_admin", "idx_leads_location_cell",
    "idx_leads_market_active", "idx_user_market_access_market",
    "idx_user_market_access_user"
  ],
  "20260603103649_dashboard_count_indexes.sql": [
    "idx_leads_active_discovered_at", "idx_leads_discovered_at"
  ],
  "20260603110615_discovery_items.sql": [
    "idx_crawl_runs_market_created", "idx_crawl_runs_status_created",
    "idx_crawl_units_run_status"
  ],
  "20260603130558_discovery_items_latest_index.sql": [
    "idx_crawl_runs_created_desc"
  ],
  "20260603143000_google_places_budget_planner.sql": [
    "idx_crawl_units_budget_pages"
  ],
  "20260611010000_agile_discovery_blocked_retry.sql": [
    "idx_crawl_runs_blocked_created", "idx_crawl_units_retry_ready"
  ],
  "202606160001_launch_readiness_reliability.sql": [
    "idx_demos_public_slug", "idx_leads_enrichment_lease"
  ],
  "202607120001_reconcile_researcher_ai_feedback_schema.sql": [
    "idx_ai_feedback_events_actor_created",
    "idx_ai_feedback_events_kind_verdict",
    "idx_ai_feedback_events_lead_created", "idx_ai_usage_actor_created"
  ],
  "202607120002_harden_database_function_access_and_fk_indexes.sql": [
    "idx_ai_feedback_events_artifact_id",
    "idx_ai_feedback_events_verification_id", "idx_ai_usage_events_lead_id",
    "idx_ai_usage_events_verification_id", "idx_demos_lead_id"
  ]
}
```

The first reconstruction replay was invalid because the local bootstrap omitted
the `auth` schema and failed while creating `app_users`. Its entire container
was destroyed and none of its partial catalog was used. A newly named container
was bootstrapped with `auth.users`, local `anon`/`authenticated` roles,
`worker_runs`, and the same compatibility columns used by repository PostgreSQL
tests before replay. That fresh catalog produced the 53/51/2 and 62-name
evidence above. Both containers and ports were removed; no process, database,
candidate, or worktree remains.

G-007P20 audit receipt commit
`ef6d4154d86cbe0e71aac56a55484424db32d77d` accepts the three AI-usage
query-history dispositions. The bounded researcher-cap write packet remains
unnumbered; this crosswalk does not open it or a P21 audit.

G-007P20A acceptance commit
`c8c3dba2ce980f2bfcbf7e0f6d71e1bf6a7d83d2` consumes sequence 009 and
accepts the separate tenant-cap support index. The next crawl-run visibility
audit remains unnumbered and no migration is assumed.

G-007P21 audits the current crawl-run visibility pair on a fresh 54/52/2
PostgreSQL 16.14 chain. `idx_crawl_runs_created_desc` naturally serves every
exact current global query in the representative fixture. The status-leading
index remains logical compatibility filter support but was not naturally
selected. Six transactional tenant/workspace candidates prove no material
defect and roll back without residue. Both globals are retained, sequence 010
remains free, and blocked-created plus market-created remain separate unopened
families.

G-007P21 receipt commit `47ce318a0acf7fd40b41798ee8154915da29bc04`
records the accepted no-defect disposition. This lineage update does not open
the next residual family.

G-007P22 classifies the blocked-run partial index RETAIN/DEFER from exact source
ownership. No current query orders by `blocked_at`; lifecycle operations use
run IDs and display uses created-time history. Source does not prove safe
removal of the unchanged historical replay object. No PostgreSQL plan or live
catalog claim is made. G-020 alone is not an owner; any re-audit waits for an
exact G-013 blocked-run query contract. Counts stay 54/52/2, sequence 010 stays
free, and market-created remains a separate unopened family.

G-007P22 receipt commit `2922e32d434ee9f23efb4148da791551a7c3d4ec`
records the accepted retain/defer classification. This lineage update does not
open the market-created family.

G-007P23 classifies the market-created index RETAIN/DEFER. Its leading market
key is structurally suitable for scope-neutral child-side maintenance of the
accepted market FK, but the index is not constraint-owned and no live use,
health, or performance is claimed. Platform markets never authorize tenant
runs, and no exact market-history reader exists. Historical PostgreSQL and
SQLite compatibility is retained; tenant-history, replacement, and removal
wait for exact G-010/G-013 authority or measured RI evidence. Counts stay
54/52/2 and sequence 010 remains free.

G-007P23 receipt commit `e9ac62457d874d8f3fa5d9aa4f4354d90acec593`
records the accepted retain/defer classification. This lineage update opens no
next residual family.

G-007P24 retains the budget-pages index as the exact current aggregate owner.
All three modes naturally use index-only scans with zero heap fetches. A
transactional drop preserves the exact scalar digest but materially regresses
to P4 run-status bitmap/heap plans; rollback restores the target definition,
digest, and plan. No defect, candidate, migration, or removal packet is opened.
Counts stay 54/52/2 and sequence 010 remains free.

G-007P24 receipt commit `290c7aee65d16397c896f91eb044e2687fa456b0`
records the accepted RETAIN decision. This lineage update opens no next
residual family.

G-007P25 retains the cell-status index as the exact current cell-coverage and
ledger compatibility owner. Four current/current-derived and one bounded-control
target-led plans preserved exact results through a transactional drop but fell
back to sequential or P4
run-status-only work; rollback restored the definition, catalog, result, and
plan digests. Platform cells never authorize tenant units. No defect, candidate,
migration, test edit, or removal packet is opened. Counts stay 54/52/2 and
sequence 010 remains free.

G-007P25 receipt commit `381ff0a45fcf03677fdb90dbfd06984287b5bff8`
records the accepted RETAIN decision. This lineage update opens no next
residual family.

G-007P26 classifies the market-status index RETAIN/DEFER from source. No exact
current reader exists. Its leading market key is a scope-neutral, unmeasured
single-FK support candidate, but it is not constraint-owned and does not cover
the compound market/cell key. No live catalog, plan, health, use, performance,
necessity, duplicate, replacement, or removal claim is made. Counts stay
54/52/2 and sequence 010 remains free.

G-007P26 receipt commit `18e6e7a92bde686ea7e45850e030710a75b68074`
records the accepted RETAIN/DEFER decision. This lineage update opens no next
residual family.

G-007P27 classifies both historical user-market-access indexes RETAIN/DEFER.
The user-leading target is only a compatibility-query candidate; the
market-leading target is an unmeasured PostgreSQL CASCADE and SQLite NO ACTION
enforcement candidate. Identity lifecycles differ, neither key authorizes a
tenant grant, and no live plan, necessity, cross-engine equivalence,
replacement, or removal claim is made. Counts stay 54/52/2 and sequence 010
remains free.

G-007P27 receipt commit `0636a4ff3aee28c5c965ac239567523d3c8ced67`
records the accepted two-index RETAIN/DEFER decision. This lineage update opens
no next residual family.

G-007P28 classifies the final G-002 residual RETAIN/DEFER. On the authoritative
124,416-row r3k fixture, exact failed-error, complete reset/lease, all-time and
bounded statistics, and current ZIP-ledger paths do not use the target. A fresh
supplement executes the exact full geography CTE; `idx_crawl_units_run` owns it
and target removal changes neither result nor plan. Only mode-filtered or
structural controls use the target. Platform-cell and generalized tokens pollute
current ZIP joins, but that is separate G-010/G-013 semantic debt and never
tenant/workspace authority or an index defect. No candidate, migration,
replacement, necessity, or removal packet opens. Counts stay 54/52/2, sequence
010 stays free, the crosswalk becomes 38/24, and G-002 is complete at 13/0.

G-007P28 receipt commit `9a01e888a5d90c4133e182c5998f723de1ffc6e4`
records the accepted RETAIN/DEFER decision and completes the G-002 residual
partition. This lineage update opens no next residual family.

G-007P29 classifies `idx_leads_archived_active` RETAIN/DEFER. On a 153,600-row
PostgreSQL 16.14 fixture the healthy target has no exact primary plan owner;
target-only transactional drop changes none of 15 canonical results, structural
plans, or buffer counts. Tenant score-recompute inefficiency remains the
accepted G-007P10 cutover obligation, not a P29 target defect. Historical frozen
SQLite compatibility is retained without claiming fresh SQLite validation.
No candidate, migration, replacement, necessity, or removal packet opens.
Counts stay 54/52/2, sequence 010 stays free, and the crosswalk becomes 39/23
with G-003 at 16/23. Parent G-007 remains open.

G-007P29 receipt commit `9f55ca6c1c8469b975fe5a0ffe9091787e2b5707`
records the accepted RETAIN/DEFER disposition. This lineage update opens no next
residual family.

G-007P30 classifies `idx_leads_assigned_to_user` RETAIN/DEFER. Fresh PostgreSQL
16.14 replayed 54/52/2 migrations over 368,640 physically interleaved
two-tenant leads. The healthy target and exact SET NULL FK restored identically;
catalog counts were 38/37/38 indexes and 10 invariant constraints. All 33
canonical results were exact installed/drop/rollback and all 33 installed plan
fingerprints restored after rollback. Ordinary assigned/unassigned readers and
query-function export controls did not select the target; the live CSV route
does not supply assignment filters. Structural assigned-plus-updated controls selected it,
but are not current readers. Exact local assignment-null cleanup selected the
target; target-only drop after `VACUUM FULL` showed no material advantage.
Nested FK maintenance was not visible in the parent-delete plan.

The factorial fixture's 50,000/100,000 assigned and NULL export-helper controls
were nonbinding full sets at 30,720 rows. A separate fresh 200,010-row PostgreSQL
16.14 supplement closed all four exact LIMIT boundaries: full-row and ordered
digests were exact installed/drop/rollback, every natural plan remained owned
by `idx_leads_enrichment_lease`, and the target was absent. These are shared
helper-capability controls, not live CSV-route behavior; the route passes no
assignment filter. The supplement changes no disposition or arithmetic.

Assignee remains a selector, never tenant or workspace authority; leads remain
tenant-wide with no workspace dimension. No tenant defect, candidate, migration,
replacement, test edit, removal, or fresh SQLite claim opens. Counts stay
54/52/2, sequence 010 stays free, the crosswalk becomes 40/22, G-003 becomes
17/22, G-002 remains 13/0, and parent G-007 remains open.

G-007P30 receipt commit `e3e2c9759f2e8f53cc8299d746237a928fb9674f`
records the accepted RETAIN/DEFER disposition plus the fresh binding-export
supplement. This lineage update releases the durable reservation and opens no
next residual family.

G-007P31 classifies `idx_leads_business_type_score` RETAIN. Fresh PostgreSQL
16.14 replayed the 54/52/2 migration chain over a 160,010-row two-tenant
fixture. Corrected admin/researcher bindings, exact 50,000/100,000 exports,
maps through 1,000, semantic controls, and broader quality/AI/aggregate readers
were exact installed/drop/restored; installed plan structures and the 38-index,
10-constraint catalog restored exactly. Shared-plumbing live routes selected
accepted siblings. The independently reproduced measured reachable canonical
literal `local_services` equality-plus-score query-function shape at limit 100
naturally selected the target and materially regressed when it was
transactionally dropped, so removal is not authorized.

Twelve isolated spoof states rejected before workload. Root independently
reproduced the disposition on a different fresh 100,019-row fixture with exact
I/D/R results, exact rollback, unchanged replay, and a separately rejected
reversed-key spoof. Business type, score, assignment, and market visibility are
selectors only; future tenant analogs remain G-011/G-017 measurements, and no
target-attributable tenant index defect was proven. Generic tenant-plan debt
cannot authorize P31 DDL. Counts stay 54/52/2, sequence 010 stays free, the
crosswalk becomes 41/21, G-003 becomes 18/21, G-002 remains 13/0, and parent
G-007 remains open. The original-card total remains 58/318 accepted with 260
remaining.

G-007P31 receipt commit `8c724ff7ef74f6a3f1a4b42015c5bea98bfadeb5`
records this accepted RETAIN disposition and releases its durable reservation
without opening or numbering P32.

G-007P32 classifies `idx_leads_component_scores` RETAIN and defers any future
tenant-prefixed analogue. Fresh PostgreSQL 16.14 replayed the 54/52/2 chain
over 160,000 physically alternating two-tenant leads. Sixteen I/D/R shapes had
exact results and exact I/R structures; exact current raw-score `getLeads`
selected the target, while target-only drop required parallel scan/sort.
Verification-only and default opportunity/map/queue/backfill/candidate/repair
shapes were target-neutral controls.

Root independently reproduced current raw DESC and backward raw ASC ownership
on a separate 100,019-row fixture. The valid retry had 18 exact canonical
result sets and ordered score sequences I/D/R, exact I/R structures, 38/37/38
catalog rollback, unchanged constraints,
statement replay no-op, and reversed-key spoof rejection. Its future tenant
measurement was target-neutral, reinforcing that no universal tenant candidate
is authorized before G-009/G-011. Component scores are selectors only. Counts
remain 54/52/2, sequence 010 remains free, crosswalk becomes 42/20, G-003
becomes 19/20, G-002 stays 13/0, and parent G-007 remains open. The original
plan remains 58/318 accepted with 260 remaining. The next source-order residual
is `idx_leads_country_admin`, but P32 does not open or number it.

G-007P32 acceptance commit `ca2a4cf3f0ea93474121c1541f769086311d6291`
records this classification locally. Its lineage-only successor releases the
P32 durable reservation without opening or numbering the next residual.

G-007P33 classifies `idx_leads_country_admin` RETAIN and defers any future
tenant-prefixed analogue. Faraday's fresh PostgreSQL 16.14 audit used a
200,000-row, physically interleaved two-tenant fixture and proved 24/24 exact
canonical result identities I/D/R plus 24/24 exact normalized structures I/R.
Root independently reproduced the disposition on a fresh 120,000-row fixture
with 13/13 exact results and 13/13 exact restored structures. Both audits
restored 38/37/38 distinct lead-index catalogs and unchanged constraints.

Selective current country-filtered Explore, Quality, and map shapes naturally
use the target. Common US, suffix-only, stored anomaly, and actual country-
neutral CSV shapes are controls. No current country/admin, full-key, or
trailing-key owner authorizes a replacement; tenant forms remain measurements
until G-009/G-010/G-011. Counts remain 54/52/2, sequence 010 stays free,
crosswalk becomes 43/19, G-003 becomes 20/19, G-002 stays 13/0, and parent
G-007 remains open. The next residual is `idx_leads_enrichment`, but a separately
proven P1 researcher archive/exclusion authorization repair takes precedence;
neither is opened or numbered here.

G-007P33 acceptance commit `3b069a418b2b144bf39f84709aedd0d82de4fd2c`
records this classification locally. Its lineage-only successor releases the
P33 reservation without opening the security repair or P34.

G-007P34 classifies `idx_leads_enrichment` RETAIN and defers tenant forms.
Three fresh PostgreSQL 16.14 remedy fixtures plus the initial producer audit
replayed 54/52/2. The final retained manifests provide exact I/D/R results and
I/R structures for all reserved limits, exact current lease ordering, live
admin Kanban selector semantics, source-order-correct Quality selectors, all
six enrichment states, aggregates, and a complete tie cohort. The target owns
current stale-running recovery and selected pending/status reads; target-only
drop uses accepted P6 or score fallbacks with exact results. Broad active lists,
CSV 50,000/100,000, exact Quality, direct Explore/map controls, and most larger
pages use accepted lease/score siblings.

Explore/map routes cannot express enrichment. No measured current shape is
tenant-scoped, and fixture tenant diversity grants no authority. The origin's
name-only statement and the installed P6 fast path leave explicitly recorded
historical sibling catalog-guard debt, not a P34 tenant-query defect or DDL
grant. Counts remain 54/52/2, sequence 010 stays free, crosswalk becomes 44/18,
G-003 becomes 21/18, G-002 stays 13/0, and parent G-007 remains open. Original
plan arithmetic stays 58/318 accepted with 260 remaining. The next source-order
residual is `idx_leads_exclusion_score`, but P34 does not open or number P35.

G-007P34 acceptance commit `f61379c998df912abdbdb7a95a1a37836c89637c`
records this classification locally. Its lineage-only successor releases the
P34 reservation without opening or numbering P35.
