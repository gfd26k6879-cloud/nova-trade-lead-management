ALTER TABLE lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

ALTER TABLE lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_retry_ready
  ON lead_ai_artifacts(status, next_retry_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_leads_ai_queue_ready
  ON leads(ai_queue_status, ai_next_retry_at, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at)
  WHERE ai_queue_status = 'queued';

UPDATE leads
SET
  website_uri = ai_found_website_url,
  website_status = 'custom',
  qualification_status = 'disqualified',
  disqualification_reason = COALESCE(disqualification_reason, 'AI found existing usable website'),
  score = 0,
  win_probability_score = 0,
  raw_opportunity_score = 0,
  verification_score = 0,
  sales_priority_score = 0,
  lead_quality_score = 0,
  easy_build_score = 0,
  cash_speed_score = 0,
  need_score = 0,
  quality_bucket = 'not_a_fit',
  recommended_offer = 'not_recommended',
  quality_reason = 'AI verification found an existing usable website.',
  next_best_action = 'Remove from no-site sales queue.',
  last_quality_scored_at = now(),
  updated_at = now()
WHERE ai_verification_status = 'site_found'
  AND ai_website_viability_status = 'usable'
  AND COALESCE(ai_found_website_url, '') != ''
  AND (
    website_status != 'custom'
    OR COALESCE(website_uri, '') != ai_found_website_url
    OR qualification_status != 'disqualified'
    OR quality_bucket != 'not_a_fit'
    OR lead_quality_score != 0
    OR raw_opportunity_score != 0
    OR verification_score != 0
    OR sales_priority_score != 0
  );

UPDATE leads
SET
  website_uri = ai_found_website_url,
  website_status = 'basic',
  quality_bucket = CASE
    WHEN quality_bucket = 'needs_ai_verify' THEN 'broken_site_opportunity'
    ELSE quality_bucket
  END,
  recommended_offer = CASE
    WHEN recommended_offer = 'starter_site' THEN 'broken_site_rescue'
    ELSE recommended_offer
  END,
  next_best_action = COALESCE(next_best_action, 'Pitch a quick website rescue for the broken or placeholder site.'),
  last_quality_scored_at = NULL,
  updated_at = now()
WHERE ai_verification_status = 'weak_site_found'
  AND ai_website_viability_status IN ('broken', 'parked', 'placeholder')
  AND COALESCE(ai_found_website_url, '') != ''
  AND website_status != 'custom'
  AND (
    website_status != 'basic'
    OR COALESCE(website_uri, '') != ai_found_website_url
    OR quality_bucket = 'needs_ai_verify'
  );
