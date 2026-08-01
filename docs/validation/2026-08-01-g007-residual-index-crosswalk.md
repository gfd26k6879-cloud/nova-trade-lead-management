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

For this reconstruction, an exact audit target or named plan/control owner is
mapped. Merely appearing as a migration foundation guard does not classify a
tenant-query family. P18 and P19 each classify two names already inside the 28,
so the arithmetic does not change. `M` means mapped/queued, `A` means accepted
audit disposition, and `U` means not yet classified by a bounded G-007 audit.

## G-002 — 13 indexes

| Status | Table | Index and ordered keys | Current/future owner |
|---|---|---|---|
| U | `crawl_runs` | `idx_crawl_runs_blocked_created(status, blocked_at DESC, created_at DESC) WHERE status='blocked'` | crawl operations; G-013/G-020 |
| A:P21 retain | `crawl_runs` | `idx_crawl_runs_created_desc(created_at DESC)` | exact current global visibility/history owner; future G-013 form deferred |
| U | `crawl_runs` | `idx_crawl_runs_market_created(market_id, created_at DESC)` | market/run history; G-010/G-013 |
| A:P21 retain | `crawl_runs` | `idx_crawl_runs_status_created(status, created_at DESC)` | current global status-filter compatibility support; future G-013 form deferred |
| U | `crawl_units` | `idx_crawl_units_budget_pages(crawl_run_id, status, pages_fetched, max_pages)` | run budget calculation; G-013/G-021 |
| U | `crawl_units` | `idx_crawl_units_cell_status(location_cell_id, status, category)` | cell coverage; G-010/G-013 |
| U | `crawl_units` | `idx_crawl_units_market_status(market_id, status, category)` | market coverage; G-010/G-013 |
| A:P4 retain | `crawl_units` | `idx_crawl_units_retry_ready(crawl_run_id, status, next_retry_at, created_at) WHERE status='retry_wait'` | retry reset; G-013 |
| M:P4 RI/current run | `crawl_units` | `idx_crawl_units_run(crawl_run_id)` | run-child RI and compatibility; G-013 |
| M:P4 plan control | `crawl_units` | `idx_crawl_units_run_status(crawl_run_id, status)` | run/status reads; G-013 |
| U | `crawl_units` | `idx_crawl_units_status_zip(status, zip)` | unit status/geography; G-010/G-013 |
| U | `user_market_access` | `idx_user_market_access_market(market_id, user_id)` | market access membership; G-010/G-016 |
| U | `user_market_access` | `idx_user_market_access_user(user_id, market_id)` | user access list/check; G-010/G-016 |

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
| U | `leads` | `idx_leads_archived_active(archived_at, updated_at DESC)` | archive/list; G-011/G-012/G-017 |
| U | `leads` | `idx_leads_assigned_to_user(assigned_to_user_id, updated_at DESC)` | assignment/workbench; G-011/G-012 |
| U | `leads` | `idx_leads_business_type_score(business_type, score DESC)` | filtering/statistics; G-011/G-017 |
| U | `leads` | `idx_leads_component_scores(raw_opportunity_score DESC, verification_score DESC)` | quality/scoring; G-011/G-012/G-017 |
| U | `leads` | `idx_leads_country_admin(country_code, admin_area1, locality)` | geography; G-010/G-011 |
| A:P8 | `leads` | `idx_leads_discovered_at(discovered_at)` | discovery counts; G-011/G-017 |
| U | `leads` | `idx_leads_enrichment(enrichment_status, score DESC)` | legacy enrichment; G-013/G-014 |
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
and leaves the retained global owners intact. The next unclassified read-only
family starts with the `crawl_runs` current-visibility pair
`idx_crawl_runs_status_created` and `idx_crawl_runs_created_desc`; this
appendix does not open or number that audit.

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
