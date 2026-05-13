CREATE TABLE IF NOT EXISTS lead_ai_artifacts (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (artifact_type IN ('business_detail','competitive_report')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','error')),
  model text NOT NULL DEFAULT 'gpt-5.4-mini',
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision NOT NULL DEFAULT 0,
  usage_input_tokens integer NOT NULL DEFAULT 0,
  usage_output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost double precision NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_lead_type_created
  ON lead_ai_artifacts(lead_id, artifact_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_status_created
  ON lead_ai_artifacts(status, created_at);

ALTER TABLE IF EXISTS lead_ai_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lead_ai_artifacts FROM anon, authenticated;
