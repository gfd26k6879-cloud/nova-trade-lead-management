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
  { table: "leads", column: "assigned_to_user_id", type: "TEXT" },
  { table: "settings", column: "ai_enabled", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "settings", column: "ai_model", type: "TEXT NOT NULL DEFAULT 'gpt-5.4-mini'" },
  { table: "settings", column: "ai_daily_budget_usd", type: "REAL NOT NULL DEFAULT 2.0" },
  { table: "settings", column: "ai_monthly_budget_usd", type: "REAL NOT NULL DEFAULT 25.0" },
  { table: "settings", column: "ai_batch_limit", type: "INTEGER NOT NULL DEFAULT 25" },
  { table: "settings", column: "ai_cache_ttl_days", type: "INTEGER NOT NULL DEFAULT 30" },
  { table: "settings", column: "ai_manual_apply_required", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "openai_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_places_api_key_encrypted", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_status", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_health_json", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_reason", type: "TEXT" },
  { table: "audit_logs", column: "actor_user_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_email", type: "TEXT" },
  { table: "audit_logs", column: "actor_role", type: "TEXT" },
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

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'coverage' CHECK(mode IN ('coverage','manual','refresh')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','done','error')),
  categories TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  ended_at TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  api_calls_used INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_units (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id),
  zip TEXT NOT NULL,
  category TEXT NOT NULL,
  keyword TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','retry_wait','done','failed')),
  next_page_token TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
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
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','verified','contacted','preview_sent','meeting_set','closed_won','closed_lost')),
  is_excluded INTEGER NOT NULL DEFAULT 0,
  exclusion_reason TEXT,
  excluded_at TEXT,
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
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  max_calls_per_day INTEGER NOT NULL DEFAULT 1000,
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
  ai_cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  ai_manual_apply_required INTEGER NOT NULL DEFAULT 1,
  openai_api_key_encrypted TEXT,
  google_places_api_key_encrypted TEXT,
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
CREATE INDEX IF NOT EXISTS idx_leads_queue_timing ON leads(reminder_date, last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_primary_type_score ON leads(primary_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_numeric_filters ON leads(review_count, rating, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_exclusion_score ON leads(is_excluded, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_score ON leads(qualification_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_selling_niche_score ON leads(selling_niche, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business_type_score ON leads(business_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_win_probability ON leads(win_probability_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_bucket_score ON leads(quality_bucket, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_offer ON leads(recommended_offer, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone_quality ON leads(phone_verification_status, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_status_checked ON leads(ai_verification_status, ai_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user ON leads(assigned_to_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_status_zip ON crawl_units(status, zip);
CREATE INDEX IF NOT EXISTS idx_crawl_units_run ON crawl_units(crawl_run_id);
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
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created ON ai_usage_events(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead ON outreach_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

INSERT OR IGNORE INTO settings (id) VALUES (1);
`;
