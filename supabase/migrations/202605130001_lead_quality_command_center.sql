ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_quality_score REAL NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_bucket TEXT NOT NULL DEFAULT 'needs_ai_verify';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS easy_build_score REAL NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cash_speed_score REAL NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS need_score REAL NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_offer TEXT NOT NULL DEFAULT 'starter_site';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_best_action TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_verification_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_quality_scored_at TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_checked_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_quality_bucket_score ON leads(quality_bucket, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_offer ON leads(recommended_offer, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone_quality ON leads(phone_verification_status, lead_quality_score DESC);
