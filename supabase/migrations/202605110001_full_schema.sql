-- NoSite Leads production schema for Supabase Postgres.
-- v1 keeps the app single-admin and stores all application data server-side.

CREATE TABLE IF NOT EXISTS zip_codes (
  zip text PRIMARY KEY,
  city text NOT NULL,
  state text NOT NULL DEFAULT 'CO',
  county text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  is_active integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'coverage' CHECK (mode IN ('coverage','manual','refresh')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','done','error')),
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0,
  enriched_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  api_calls_used integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crawl_units (
  id text PRIMARY KEY,
  crawl_run_id text NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
  zip text NOT NULL,
  category text NOT NULL,
  keyword text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry_wait','done','failed')),
  next_page_token text,
  attempt_count integer NOT NULL DEFAULT 0,
  discovered_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  place_id text NOT NULL UNIQUE,
  name text,
  address text,
  phone text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating double precision,
  review_count integer,
  website_uri text,
  website_status text NOT NULL DEFAULT 'none' CHECK (website_status IN ('none','social','basic','custom')),
  maps_uri text,
  business_status text,
  price_level text,
  photo_count integer DEFAULT 0,
  has_opening_hours integer DEFAULT 0,
  primary_type text,
  lat double precision,
  lng double precision,
  score double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','verified','contacted','preview_sent','meeting_set','closed_won','closed_lost')),
  is_excluded integer NOT NULL DEFAULT 0,
  exclusion_reason text,
  excluded_at timestamptz,
  selling_niche text,
  qualification_status text NOT NULL DEFAULT 'needs_verification' CHECK (qualification_status IN ('qualified','needs_verification','unqualified','disqualified')),
  disqualification_reason text,
  website_verified_at timestamptz,
  contactability_score double precision NOT NULL DEFAULT 0,
  estimated_deal_value double precision NOT NULL DEFAULT 0,
  business_type text DEFAULT 'local_services',
  win_probability_score double precision NOT NULL DEFAULT 0,
  ai_verification_status text NOT NULL DEFAULT 'not_checked' CHECK (ai_verification_status IN ('not_checked','site_found','no_site_found','weak_site_found','uncertain','mismatch','error')),
  ai_confidence double precision NOT NULL DEFAULT 0,
  ai_found_website_url text,
  ai_recommendation text,
  ai_summary text,
  ai_checked_at timestamptz,
  ai_website_viability_status text,
  ai_website_health jsonb,
  notes text,
  reminder_date text,
  enrichment_status text NOT NULL DEFAULT 'pending' CHECK (enrichment_status IN ('pending','enriched','skipped')),
  enriched_at timestamptz,
  review_highlights jsonb,
  editorial_summary text,
  website_health jsonb,
  website_checked_at timestamptz,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  first_contacted_at timestamptz,
  first_reply_at timestamptz,
  meeting_booked_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('call','text','email','walkin','other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demos (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  template_id text DEFAULT 'default',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id integer PRIMARY KEY CHECK (id = 1),
  niche_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  social_hosts jsonb NOT NULL DEFAULT '[]'::jsonb,
  basic_hosts jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_ms integer NOT NULL DEFAULT 200,
  max_calls_per_day integer NOT NULL DEFAULT 1000,
  max_calls_per_run integer NOT NULL DEFAULT 500,
  max_monthly_api_spend double precision NOT NULL DEFAULT 50.0,
  stop_on_budget_limit integer NOT NULL DEFAULT 1,
  search_radius_km double precision NOT NULL DEFAULT 8.0,
  enrichment_enabled integer NOT NULL DEFAULT 1,
  max_enrichment_per_run integer NOT NULL DEFAULT 50,
  website_health_enabled integer NOT NULL DEFAULT 1,
  cache_ttl_days integer NOT NULL DEFAULT 30,
  enrichment_stage_b_min_score double precision NOT NULL DEFAULT 9.0,
  max_atmosphere_enrichment_per_run integer NOT NULL DEFAULT 25,
  cost_engine_v2_enabled integer NOT NULL DEFAULT 1,
  ai_enabled integer NOT NULL DEFAULT 0,
  ai_model text NOT NULL DEFAULT 'gpt-5.4-mini',
  ai_daily_budget_usd double precision NOT NULL DEFAULT 2.0,
  ai_monthly_budget_usd double precision NOT NULL DEFAULT 25.0,
  ai_batch_limit integer NOT NULL DEFAULT 25,
  ai_cache_ttl_days integer NOT NULL DEFAULT 30,
  ai_manual_apply_required integer NOT NULL DEFAULT 1,
  openai_api_key_encrypted text,
  google_places_api_key_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS place_cache (
  place_id text PRIMARY KEY,
  raw_json jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places_master (
  place_id text PRIMARY KEY,
  name text,
  address text,
  phone text,
  website_uri text,
  maps_uri text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating double precision,
  user_rating_count integer,
  business_status text,
  price_level text,
  photo_count integer NOT NULL DEFAULT 0,
  has_opening_hours integer NOT NULL DEFAULT 0,
  primary_type text,
  lat double precision,
  lng double precision,
  editorial_summary text,
  review_highlights jsonb,
  website_health jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_details_at timestamptz,
  last_enriched_at timestamptz,
  completeness_score double precision NOT NULL DEFAULT 0,
  freshness_score double precision NOT NULL DEFAULT 0,
  verification_coverage double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS place_observations (
  id text PRIMARY KEY,
  place_id text NOT NULL,
  crawl_run_id text,
  crawl_unit_id text,
  lead_id text,
  endpoint text NOT NULL,
  sku text NOT NULL,
  field_mask text,
  raw_json jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_usage_events (
  id text PRIMARY KEY,
  crawl_run_id text,
  crawl_unit_id text,
  lead_id text,
  endpoint text NOT NULL,
  sku text NOT NULL,
  field_mask text,
  success integer NOT NULL DEFAULT 1,
  was_cached integer NOT NULL DEFAULT 0,
  billable_units integer NOT NULL DEFAULT 1,
  estimated_unit_price double precision NOT NULL DEFAULT 0,
  estimated_cost double precision NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_lead_verifications (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  model text NOT NULL,
  status text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0,
  found_website_url text,
  found_email text,
  found_phone text,
  social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL,
  reason text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  website_viability_status text,
  website_health_json jsonb,
  website_viability_reason text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text,
  usage_input_tokens integer NOT NULL DEFAULT 0,
  usage_output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost double precision NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id text PRIMARY KEY,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  verification_id text REFERENCES ai_lead_verifications(id) ON DELETE SET NULL,
  model text NOT NULL,
  endpoint text NOT NULL DEFAULT 'responses',
  success integer NOT NULL DEFAULT 1,
  was_cached integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost double precision NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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
CREATE INDEX IF NOT EXISTS idx_leads_ai_status_checked ON leads(ai_verification_status, ai_checked_at DESC);
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

INSERT INTO settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
