ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS actor_email text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS contact_person_name text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS contact_person_role text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS decision_maker_reached integer NOT NULL DEFAULT 0;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'contacted';
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS objection_reason text;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS quoted_amount double precision NOT NULL DEFAULT 0;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS close_value double precision NOT NULL DEFAULT 0;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS next_step text;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user
  ON leads(assigned_to_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_events_actor_created
  ON outreach_events(actor_user_id, created_at DESC);
