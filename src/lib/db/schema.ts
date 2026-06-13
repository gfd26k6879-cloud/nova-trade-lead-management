export const MIGRATION_COLUMNS: Array<{ table: string; column: string; type: string }> = [
  { table: "zip_codes", column: "county", type: "TEXT NOT NULL DEFAULT ''" },
  { table: "leads", column: "photo_count", type: "INTEGER DEFAULT 0" },
  { table: "leads", column: "has_opening_hours", type: "INTEGER DEFAULT 0" },
  { table: "leads", column: "primary_type", type: "TEXT" },
  { table: "leads", column: "lat", type: "REAL" },
  { table: "leads", column: "lng", type: "REAL" },
  { table: "leads", column: "enrichment_status", type: "TEXT NOT NULL DEFAULT 'pending'" },
  { table: "leads", column: "enriched_at", type: "TEXT" },
  { table: "leads", column: "review_highlights", type: "TEXT" },
  { table: "leads", column: "editorial_summary", type: "TEXT" },
  { table: "leads", column: "website_health", type: "TEXT" },
  { table: "leads", column: "website_checked_at", type: "TEXT" },
  { table: "settings", column: "search_radius_km", type: "REAL NOT NULL DEFAULT 8.0" },
  { table: "settings", column: "enrichment_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "max_enrichment_per_run", type: "INTEGER NOT NULL DEFAULT 50" },
  { table: "settings", column: "website_health_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "cache_ttl_days", type: "INTEGER NOT NULL DEFAULT 30" },
  { table: "settings", column: "enrichment_stage_b_min_score", type: "REAL NOT NULL DEFAULT 9.0" },
  { table: "settings", column: "max_atmosphere_enrichment_per_run", type: "INTEGER NOT NULL DEFAULT 25" },
  { table: "settings", column: "cost_engine_v2_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "leads", column: "verification", type: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "leads", column: "is_excluded", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "exclusion_reason", type: "TEXT" },
  { table: "leads", column: "excluded_at", type: "TEXT" },
  { table: "leads", column: "archived_at", type: "TEXT" },
  { table: "leads", column: "archived_by_user_id", type: "TEXT" },
  { table: "leads", column: "archive_reason", type: "TEXT" },
  { table: "leads", column: "selling_niche", type: "TEXT" },
  { table: "leads", column: "qualification_status", type: "TEXT NOT NULL DEFAULT 'needs_verification'" },
  { table: "leads", column: "disqualification_reason", type: "TEXT" },
  { table: "leads", column: "website_verified_at", type: "TEXT" },
  { table: "leads", column: "contactability_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "estimated_deal_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "business_type", type: "TEXT" },
  { table: "leads", column: "win_probability_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "lead_quality_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "quality_bucket", type: "TEXT NOT NULL DEFAULT 'needs_ai_verify'" },
  { table: "leads", column: "easy_build_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "cash_speed_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "need_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "quality_reason", type: "TEXT" },
  { table: "leads", column: "recommended_offer", type: "TEXT NOT NULL DEFAULT 'starter_site'" },
  { table: "leads", column: "next_best_action", type: "TEXT" },
  { table: "leads", column: "phone_verification_status", type: "TEXT NOT NULL DEFAULT 'unknown'" },
  { table: "leads", column: "last_quality_scored_at", type: "TEXT" },
  { table: "leads", column: "quality_checked_by_user_id", type: "TEXT" },
  { table: "leads", column: "ai_verification_status", type: "TEXT NOT NULL DEFAULT 'not_checked'" },
  { table: "leads", column: "ai_confidence", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "ai_found_website_url", type: "TEXT" },
  { table: "leads", column: "ai_recommendation", type: "TEXT" },
  { table: "leads", column: "ai_summary", type: "TEXT" },
  { table: "leads", column: "ai_checked_at", type: "TEXT" },
  { table: "leads", column: "ai_website_viability_status", type: "TEXT" },
  { table: "leads", column: "ai_website_health", type: "TEXT" },
  { table: "leads", column: "ai_queue_status", type: "TEXT NOT NULL DEFAULT 'not_checked'" },
  { table: "leads", column: "ai_attempt_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "ai_last_error", type: "TEXT" },
  { table: "leads", column: "ai_next_retry_at", type: "TEXT" },
  { table: "leads", column: "ai_input_hash", type: "TEXT" },
  { table: "leads", column: "raw_opportunity_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "verification_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "sales_priority_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "pitch_outcome", type: "TEXT" },
  { table: "leads", column: "objection_reason", type: "TEXT" },
  { table: "leads", column: "decision_maker_reached", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "quoted_amount", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "close_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "demo_sent_at", type: "TEXT" },
  { table: "leads", column: "assigned_to_user_id", type: "TEXT" },
  { table: "settings", column: "ai_enabled", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "settings", column: "ai_model", type: "TEXT NOT NULL DEFAULT 'gpt-5.4-mini'" },
  { table: "settings", column: "ai_daily_budget_usd", type: "REAL NOT NULL DEFAULT 2.0" },
  { table: "settings", column: "ai_monthly_budget_usd", type: "REAL NOT NULL DEFAULT 25.0" },
  { table: "settings", column: "ai_batch_limit", type: "INTEGER NOT NULL DEFAULT 25" },
  { table: "settings", column: "researcher_ai_daily_run_cap", type: "INTEGER NOT NULL DEFAULT 10" },
  { table: "settings", column: "researcher_ai_daily_budget_usd", type: "REAL NOT NULL DEFAULT 2.0" },
  { table: "settings", column: "researcher_ai_monthly_budget_usd", type: "REAL NOT NULL DEFAULT 25.0" },
  { table: "settings", column: "ai_cache_ttl_days", type: "INTEGER NOT NULL DEFAULT 30" },
  { table: "settings", column: "ai_manual_apply_required", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_auto_verify_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_verify_after_discovery", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_reverify_after_enrichment", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_verification_concurrency", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "settings", column: "scheduler_ai_verification_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_crawl_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_enrichment_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_artifact_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_score_recompute_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "openai_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_places_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_maps_browser_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_text_search_monthly_cap", type: "INTEGER NOT NULL DEFAULT 4900" },
  { table: "settings", column: "google_enterprise_monthly_cap", type: "INTEGER NOT NULL DEFAULT 900" },
  { table: "settings", column: "google_test_run_call_cap", type: "INTEGER NOT NULL DEFAULT 50" },
  { table: "settings", column: "google_auto_pagination_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "google_auto_pagination_min_new_candidates", type: "INTEGER NOT NULL DEFAULT 6" },
  { table: "settings", column: "google_auto_pagination_max_duplicate_rate", type: "REAL NOT NULL DEFAULT 0.6" },
  { table: "settings", column: "google_default_discovery_mode", type: "TEXT NOT NULL DEFAULT 'coverage_probe'" },
  { table: "settings", column: "google_default_pagination_policy", type: "TEXT NOT NULL DEFAULT 'auto_yield_based'" },
  { table: "crawl_runs", column: "blocked_reason", type: "TEXT" },
  { table: "crawl_runs", column: "blocked_at", type: "TEXT" },
  { table: "crawl_runs", column: "blocked_error_code", type: "TEXT" },
  { table: "crawl_units", column: "next_retry_at", type: "TEXT" },
  { table: "crawl_units", column: "max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "crawl_units", column: "last_error_code", type: "TEXT" },
  { table: "leads", column: "ai_website_feedback_status", type: "TEXT" },
  { table: "leads", column: "ai_corrected_website_url", type: "TEXT" },
  { table: "leads", column: "ai_false_positive_reason", type: "TEXT" },
  { table: "leads", column: "ai_reviewer_notes", type: "TEXT" },
  { table: "leads", column: "ai_feedback_at", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_status", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_health_json", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_reason", type: "TEXT" },
  { table: "ai_lead_verifications", column: "requested_by_user_id", type: "TEXT" },
  { table: "ai_lead_verifications", column: "request_source", type: "TEXT" },
  { table: "ai_usage_events", column: "actor_user_id", type: "TEXT" },
  { table: "ai_usage_events", column: "request_source", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "updated_at", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "attempt_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "lead_ai_artifacts", column: "last_error", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "next_retry_at", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "lead_ai_artifacts", column: "requested_by_user_id", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "request_source", type: "TEXT" },
  { table: "outreach_events", column: "actor_user_id", type: "TEXT" },
  { table: "outreach_events", column: "actor_email", type: "TEXT" },
  { table: "outreach_events", column: "contact_person_name", type: "TEXT" },
  { table: "outreach_events", column: "contact_person_role", type: "TEXT" },
  { table: "outreach_events", column: "decision_maker_reached", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "outcome", type: "TEXT NOT NULL DEFAULT 'contacted'" },
  { table: "outreach_events", column: "objection_reason", type: "TEXT" },
  { table: "outreach_events", column: "quoted_amount", type: "REAL NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "close_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "follow_up_at", type: "TEXT" },
  { table: "outreach_events", column: "next_step", type: "TEXT" },
  { table: "audit_logs", column: "actor_user_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_email", type: "TEXT" },
  { table: "audit_logs", column: "actor_role", type: "TEXT" },
  { table: "app_users", column: "is_team_lead", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "app_users", column: "team_lead_user_id", type: "TEXT" },
  { table: "app_users", column: "team_label", type: "TEXT" },
  { table: "leads", column: "market_id", type: "TEXT" },
  { table: "leads", column: "location_cell_id", type: "TEXT" },
  { table: "leads", column: "country_code", type: "TEXT" },
  { table: "leads", column: "admin_area1", type: "TEXT" },
  { table: "leads", column: "admin_area2", type: "TEXT" },
  { table: "leads", column: "locality", type: "TEXT" },
  { table: "leads", column: "postal_code", type: "TEXT" },
  { table: "crawl_units", column: "market_id", type: "TEXT" },
  { table: "crawl_units", column: "location_cell_id", type: "TEXT" },
  { table: "crawl_units", column: "country_code", type: "TEXT" },
  { table: "crawl_units", column: "query_location_label", type: "TEXT" },
  { table: "crawl_runs", column: "market_id", type: "TEXT" },
  { table: "crawl_runs", column: "selection_json", type: "TEXT" },
  { table: "crawl_runs", column: "name", type: "TEXT" },
  { table: "crawl_runs", column: "scope_label", type: "TEXT" },
  { table: "crawl_runs", column: "created_by_user_id", type: "TEXT" },
  { table: "crawl_runs", column: "updated_at", type: "TEXT NOT NULL DEFAULT (datetime('now'))" },
  { table: "crawl_units", column: "max_pages", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "crawl_units", column: "pages_fetched", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "raw_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "new_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "duplicate_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "budget_blocked_at", type: "TEXT" },
];

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS zip_codes (
  zip TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'CO',
  county TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS location_markets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_cells (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES location_markets(id),
  country_code TEXT NOT NULL,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  postal_code TEXT,
  postal_code_normalized TEXT,
  cell_type TEXT NOT NULL,
  cell_label TEXT NOT NULL,
  lat REAL,
  lng REAL,
  radius_meters INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'coverage' CHECK(mode IN ('coverage','manual','refresh')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','blocked','done','error','canceled')),
  categories TEXT NOT NULL DEFAULT '[]',
  market_id TEXT,
  selection_json TEXT,
  name TEXT,
  scope_label TEXT,
  created_by_user_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  api_calls_used INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  blocked_reason TEXT,
  blocked_at TEXT,
  blocked_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_units (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id),
  zip TEXT NOT NULL,
  market_id TEXT,
  location_cell_id TEXT,
  country_code TEXT,
  query_location_label TEXT,
  category TEXT NOT NULL,
  keyword TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','retry_wait','done','failed','canceled')),
  next_page_token TEXT,
  max_pages INTEGER NOT NULL DEFAULT 1,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  raw_places_seen INTEGER NOT NULL DEFAULT 0,
  new_places_seen INTEGER NOT NULL DEFAULT 0,
  duplicate_places_seen INTEGER NOT NULL DEFAULT 0,
  budget_blocked_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error_code TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'researcher' CHECK(role IN ('admin','researcher')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_by TEXT,
  is_team_lead INTEGER NOT NULL DEFAULT 0,
  team_lead_user_id TEXT,
  team_label TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_market_access (
  user_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES location_markets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id TEXT,
  PRIMARY KEY (user_id, market_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL UNIQUE,
  name TEXT,
  address TEXT,
  phone TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  review_count INTEGER,
  website_uri TEXT,
  website_status TEXT NOT NULL DEFAULT 'none' CHECK(website_status IN ('none','social','basic','custom')),
  maps_uri TEXT,
  business_status TEXT,
  price_level TEXT,
  photo_count INTEGER DEFAULT 0,
  has_opening_hours INTEGER DEFAULT 0,
  primary_type TEXT,
  lat REAL,
  lng REAL,
  market_id TEXT,
  location_cell_id TEXT,
  country_code TEXT,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  postal_code TEXT,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','verified','contacted','preview_sent','meeting_set','closed_won','closed_lost')),
  is_excluded INTEGER NOT NULL DEFAULT 0,
  exclusion_reason TEXT,
  excluded_at TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  archive_reason TEXT,
  selling_niche TEXT,
  qualification_status TEXT NOT NULL DEFAULT 'needs_verification' CHECK(qualification_status IN ('qualified','needs_verification','unqualified','disqualified')),
  disqualification_reason TEXT,
  website_verified_at TEXT,
  contactability_score REAL NOT NULL DEFAULT 0,
  estimated_deal_value REAL NOT NULL DEFAULT 0,
  business_type TEXT DEFAULT 'local_services',
  win_probability_score REAL NOT NULL DEFAULT 0,
  lead_quality_score REAL NOT NULL DEFAULT 0,
  quality_bucket TEXT NOT NULL DEFAULT 'needs_ai_verify',
  easy_build_score REAL NOT NULL DEFAULT 0,
  cash_speed_score REAL NOT NULL DEFAULT 0,
  need_score REAL NOT NULL DEFAULT 0,
  quality_reason TEXT,
  recommended_offer TEXT NOT NULL DEFAULT 'starter_site',
  next_best_action TEXT,
  phone_verification_status TEXT NOT NULL DEFAULT 'unknown',
  last_quality_scored_at TEXT,
  quality_checked_by_user_id TEXT,
  ai_verification_status TEXT NOT NULL DEFAULT 'not_checked' CHECK(ai_verification_status IN ('not_checked','site_found','no_site_found','weak_site_found','uncertain','mismatch','error')),
  ai_confidence REAL NOT NULL DEFAULT 0,
  ai_found_website_url TEXT,
  ai_recommendation TEXT,
  ai_summary TEXT,
  ai_checked_at TEXT,
  ai_website_viability_status TEXT,
  ai_website_health TEXT,
  ai_queue_status TEXT NOT NULL DEFAULT 'not_checked' CHECK(ai_queue_status IN ('not_checked','queued','running','verified','error')),
  ai_attempt_count INTEGER NOT NULL DEFAULT 0,
  ai_last_error TEXT,
  ai_next_retry_at TEXT,
  ai_input_hash TEXT,
  raw_opportunity_score REAL NOT NULL DEFAULT 0,
  verification_score REAL NOT NULL DEFAULT 0,
  sales_priority_score REAL NOT NULL DEFAULT 0,
  pitch_outcome TEXT,
  objection_reason TEXT,
  decision_maker_reached INTEGER NOT NULL DEFAULT 0,
  quoted_amount REAL NOT NULL DEFAULT 0,
  close_value REAL NOT NULL DEFAULT 0,
  demo_sent_at TEXT,
  ai_website_feedback_status TEXT,
  ai_corrected_website_url TEXT,
  ai_false_positive_reason TEXT,
  ai_reviewer_notes TEXT,
  ai_feedback_at TEXT,
  assigned_to_user_id TEXT,
  notes TEXT,
  reminder_date TEXT,
  enrichment_status TEXT NOT NULL DEFAULT 'pending' CHECK(enrichment_status IN ('pending','enriched','skipped')),
  enriched_at TEXT,
  review_highlights TEXT,
  editorial_summary TEXT,
  website_health TEXT,
  website_checked_at TEXT,
  verification TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  first_contacted_at TEXT,
  first_reply_at TEXT,
  meeting_booked_at TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  channel TEXT NOT NULL CHECK(channel IN ('call','text','email','walkin','other')),
  actor_user_id TEXT,
  actor_email TEXT,
  contact_person_name TEXT,
  contact_person_role TEXT,
  decision_maker_reached INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'contacted',
  objection_reason TEXT,
  quoted_amount REAL NOT NULL DEFAULT 0,
  close_value REAL NOT NULL DEFAULT 0,
  follow_up_at TEXT,
  next_step TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_requests (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id TEXT,
  created_by_email TEXT,
  assigned_admin_user_id TEXT,
  request_type TEXT NOT NULL CHECK(request_type IN ('website_request','quote_request')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','seen','in_progress','waiting_on_researcher','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  summary TEXT,
  contact_person_name TEXT,
  budget_hint TEXT,
  due_at TEXT,
  next_step TEXT,
  seen_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demos (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  slug TEXT NOT NULL UNIQUE,
  template_id TEXT DEFAULT 'default',
  config_json TEXT NOT NULL DEFAULT '{}',
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  niche_weights TEXT NOT NULL DEFAULT '{}',
  social_hosts TEXT NOT NULL DEFAULT '[]',
  basic_hosts TEXT NOT NULL DEFAULT '[]',
  rate_limit_ms INTEGER NOT NULL DEFAULT 200,
  max_calls_per_day INTEGER NOT NULL DEFAULT 300,
  max_calls_per_run INTEGER NOT NULL DEFAULT 500,
  max_monthly_api_spend REAL NOT NULL DEFAULT 50.0,
  stop_on_budget_limit INTEGER NOT NULL DEFAULT 1,
  search_radius_km REAL NOT NULL DEFAULT 8.0,
  enrichment_enabled INTEGER NOT NULL DEFAULT 1,
  max_enrichment_per_run INTEGER NOT NULL DEFAULT 50,
  website_health_enabled INTEGER NOT NULL DEFAULT 1,
  cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  enrichment_stage_b_min_score REAL NOT NULL DEFAULT 9.0,
  max_atmosphere_enrichment_per_run INTEGER NOT NULL DEFAULT 25,
  cost_engine_v2_enabled INTEGER NOT NULL DEFAULT 1,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  ai_model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  ai_daily_budget_usd REAL NOT NULL DEFAULT 2.0,
  ai_monthly_budget_usd REAL NOT NULL DEFAULT 25.0,
  ai_batch_limit INTEGER NOT NULL DEFAULT 25,
  researcher_ai_daily_run_cap INTEGER NOT NULL DEFAULT 10,
  researcher_ai_daily_budget_usd REAL NOT NULL DEFAULT 2.0,
  researcher_ai_monthly_budget_usd REAL NOT NULL DEFAULT 25.0,
  ai_cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  ai_manual_apply_required INTEGER NOT NULL DEFAULT 1,
  ai_auto_verify_enabled INTEGER NOT NULL DEFAULT 1,
  ai_verify_after_discovery INTEGER NOT NULL DEFAULT 1,
  ai_reverify_after_enrichment INTEGER NOT NULL DEFAULT 1,
  ai_verification_concurrency INTEGER NOT NULL DEFAULT 1,
  ai_max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduler_ai_verification_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_crawl_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_enrichment_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_artifact_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_score_recompute_enabled INTEGER NOT NULL DEFAULT 1,
  openai_api_key_encrypted TEXT,
  google_places_api_key_encrypted TEXT,
  google_maps_browser_api_key_encrypted TEXT,
  google_text_search_monthly_cap INTEGER NOT NULL DEFAULT 4900,
  google_enterprise_monthly_cap INTEGER NOT NULL DEFAULT 900,
  google_test_run_call_cap INTEGER NOT NULL DEFAULT 50,
  google_auto_pagination_enabled INTEGER NOT NULL DEFAULT 1,
  google_auto_pagination_min_new_candidates INTEGER NOT NULL DEFAULT 6,
  google_auto_pagination_max_duplicate_rate REAL NOT NULL DEFAULT 0.6,
  google_default_discovery_mode TEXT NOT NULL DEFAULT 'coverage_probe',
  google_default_pagination_policy TEXT NOT NULL DEFAULT 'auto_yield_based',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS place_cache (
  place_id TEXT PRIMARY KEY,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS places_master (
  place_id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  website_uri TEXT,
  maps_uri TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  user_rating_count INTEGER,
  business_status TEXT,
  price_level TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  has_opening_hours INTEGER NOT NULL DEFAULT 0,
  primary_type TEXT,
  lat REAL,
  lng REAL,
  editorial_summary TEXT,
  review_highlights TEXT,
  website_health TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_details_at TEXT,
  last_enriched_at TEXT,
  completeness_score REAL NOT NULL DEFAULT 0,
  freshness_score REAL NOT NULL DEFAULT 0,
  verification_coverage REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS place_observations (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  crawl_run_id TEXT,
  crawl_unit_id TEXT,
  lead_id TEXT,
  endpoint TEXT NOT NULL,
  sku TEXT NOT NULL,
  field_mask TEXT,
  raw_json TEXT NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_usage_events (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT,
  crawl_unit_id TEXT,
  lead_id TEXT,
  endpoint TEXT NOT NULL,
  sku TEXT NOT NULL,
  field_mask TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  was_cached INTEGER NOT NULL DEFAULT 0,
  billable_units INTEGER NOT NULL DEFAULT 1,
  estimated_unit_price REAL NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_lead_verifications (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  found_website_url TEXT,
  found_email TEXT,
  found_phone TEXT,
  social_profiles TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  website_viability_status TEXT,
  website_health_json TEXT,
  website_viability_reason TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  input_hash TEXT,
  usage_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error TEXT,
  requested_by_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id),
  verification_id TEXT REFERENCES ai_lead_verifications(id),
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT 'responses',
  success INTEGER NOT NULL DEFAULT 1,
  was_cached INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_ai_artifacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('business_detail','competitive_report')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','error')),
  model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  input_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  sources_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  usage_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  requested_by_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_feedback_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  verification_id TEXT REFERENCES ai_lead_verifications(id) ON DELETE SET NULL,
  artifact_id TEXT REFERENCES lead_ai_artifacts(id) ON DELETE SET NULL,
  actor_user_id TEXT,
  feedback_kind TEXT NOT NULL CHECK(feedback_kind IN ('verification','pitch')),
  verdict TEXT NOT NULL CHECK(verdict IN ('correct','incorrect','uncertain','useful','not_useful')),
  corrected_website_url TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS worker_runs (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_source TEXT NOT NULL DEFAULT 'unknown',
  http_status INTEGER,
  result_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_website_status ON leads(website_status);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment ON leads(enrichment_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_queue_candidates ON leads(website_status, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_workbench_active_candidates ON leads(assigned_to_user_id, website_status, qualification_status, status, quality_bucket, sales_priority_score DESC, lead_quality_score DESC, score DESC) WHERE archived_at IS NULL AND COALESCE(is_excluded, 0) = 0 AND score > 0;
CREATE INDEX IF NOT EXISTS idx_leads_queue_timing ON leads(reminder_date, last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_primary_type_score ON leads(primary_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_numeric_filters ON leads(review_count, rating, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_exclusion_score ON leads(is_excluded, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_archived_active ON leads(archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_score ON leads(qualification_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_selling_niche_score ON leads(selling_niche, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business_type_score ON leads(business_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_win_probability ON leads(win_probability_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_bucket_score ON leads(quality_bucket, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_offer ON leads(recommended_offer, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone_quality ON leads(phone_verification_status, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_status_checked ON leads(ai_verification_status, ai_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_queue_status ON leads(ai_queue_status, ai_next_retry_at, sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_sales_priority ON leads(sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_component_scores ON leads(raw_opportunity_score DESC, verification_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user ON leads(assigned_to_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_market_active ON leads(market_id, archived_at, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_location_cell ON leads(location_cell_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_country_admin ON leads(country_code, admin_area1, locality);
CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);
CREATE INDEX IF NOT EXISTS idx_app_users_team_lead ON app_users(team_lead_user_id, status);
CREATE INDEX IF NOT EXISTS idx_location_markets_country_status ON location_markets(country_code, status, name);
CREATE INDEX IF NOT EXISTS idx_location_cells_market_active ON location_cells(market_id, is_active, cell_type);
CREATE INDEX IF NOT EXISTS idx_location_cells_country_postal ON location_cells(country_code, postal_code_normalized);
CREATE INDEX IF NOT EXISTS idx_user_market_access_user ON user_market_access(user_id, market_id);
CREATE INDEX IF NOT EXISTS idx_user_market_access_market ON user_market_access(market_id, user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_status_zip ON crawl_units(status, zip);
CREATE INDEX IF NOT EXISTS idx_crawl_units_retry_ready ON crawl_units(crawl_run_id, status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_crawl_units_run ON crawl_units(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_units_run_status ON crawl_units(crawl_run_id, status);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_status_created ON crawl_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_market_created ON crawl_runs(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_created_desc ON crawl_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_market_status ON crawl_units(market_id, status, category);
CREATE INDEX IF NOT EXISTS idx_crawl_units_cell_status ON crawl_units(location_cell_id, status, category);
CREATE INDEX IF NOT EXISTS idx_zip_codes_state_county_zip ON zip_codes(state, county, zip);
CREATE INDEX IF NOT EXISTS idx_zip_codes_state_county_active ON zip_codes(state, county, is_active);
CREATE INDEX IF NOT EXISTS idx_places_master_last_seen ON places_master(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_places_master_quality ON places_master(completeness_score DESC, freshness_score DESC);
CREATE INDEX IF NOT EXISTS idx_place_observations_place_time ON place_observations(place_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_observations_run_time ON place_observations(crawl_run_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_sku_created ON api_usage_events(sku, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_run_created ON api_usage_events(crawl_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint_created ON api_usage_events(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_lead_created ON ai_lead_verifications(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_status_created ON ai_lead_verifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_requester_created ON ai_lead_verifications(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created ON ai_usage_events(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_actor_created ON ai_usage_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_lead_type_created ON lead_ai_artifacts(lead_id, artifact_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_status_created ON lead_ai_artifacts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_requester_created ON lead_ai_artifacts(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_lead_created ON ai_feedback_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_actor_created ON ai_feedback_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_kind_verdict ON ai_feedback_events(feedback_kind, verdict, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score_recompute_stale ON leads(updated_at DESC, last_quality_scored_at);
CREATE INDEX IF NOT EXISTS idx_worker_runs_worker_started ON worker_runs(worker_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_runs_status_started ON worker_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead ON outreach_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_actor_created ON outreach_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status_type_created ON admin_requests(status, request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_lead_created ON admin_requests(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_creator_created ON admin_requests(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned_created ON admin_requests(assigned_admin_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_open_unique ON admin_requests(lead_id, request_type)
  WHERE status IN ('new','seen','in_progress','waiting_on_researcher');
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

INSERT OR IGNORE INTO settings (id) VALUES (1);
`;
