-- Supabase Auth roles and collaboration tables.
-- App data stays server-side through DATABASE_URL; Data API access is denied by default.

DO $$
BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'researcher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE app_user_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text,
  role app_role NOT NULL DEFAULT 'researcher',
  status app_user_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS lead_notes (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role app_role;

CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user ON leads(assigned_to_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_author_created ON lead_notes(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

ALTER TABLE IF EXISTS zip_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crawl_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS place_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS places_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS place_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS api_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_lead_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  zip_codes,
  crawl_runs,
  crawl_units,
  app_users,
  leads,
  lead_notes,
  outreach_events,
  demos,
  settings,
  place_cache,
  places_master,
  place_observations,
  api_usage_events,
  ai_lead_verifications,
  ai_usage_events,
  audit_logs
FROM anon, authenticated;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;
