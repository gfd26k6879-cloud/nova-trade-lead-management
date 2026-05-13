ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_queue_status text NOT NULL DEFAULT 'not_checked';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_last_error text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_next_retry_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_input_hash text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS raw_opportunity_score double precision NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS verification_score double precision NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_priority_score double precision NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pitch_outcome text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS objection_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker_reached integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quoted_amount double precision NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS close_value double precision NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS demo_sent_at timestamptz;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_auto_verify_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_verify_after_discovery integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_reverify_after_enrichment integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_verification_concurrency integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_max_attempts integer NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_leads_ai_queue_status ON leads(ai_queue_status, ai_next_retry_at, sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_sales_priority ON leads(sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_component_scores ON leads(raw_opportunity_score DESC, verification_score DESC);
