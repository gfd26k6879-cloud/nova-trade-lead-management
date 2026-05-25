-- Admin fulfillment queue and team lead metadata.
-- App data remains server-side through DATABASE_URL; Data API access stays denied.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS is_team_lead integer NOT NULL DEFAULT 0 CHECK (is_team_lead IN (0, 1));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS team_lead_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS team_label text;

CREATE TABLE IF NOT EXISTS admin_requests (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  assigned_admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('website_request','quote_request')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','in_progress','waiting_on_researcher','done','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','low')),
  summary text,
  contact_person_name text,
  budget_hint text,
  due_at timestamptz,
  next_step text,
  seen_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_team_lead
  ON app_users(team_lead_user_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_requests_status_type_created
  ON admin_requests(status, request_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_requests_lead_created
  ON admin_requests(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_requests_creator_created
  ON admin_requests(created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned_created
  ON admin_requests(assigned_admin_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_open_unique
  ON admin_requests(lead_id, request_type)
  WHERE status IN ('new','seen','in_progress','waiting_on_researcher');

ALTER TABLE IF EXISTS admin_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_requests FROM anon, authenticated;
