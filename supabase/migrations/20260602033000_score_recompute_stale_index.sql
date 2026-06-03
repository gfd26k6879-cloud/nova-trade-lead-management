CREATE INDEX IF NOT EXISTS idx_leads_score_recompute_stale
  ON leads(updated_at DESC, last_quality_scored_at);
