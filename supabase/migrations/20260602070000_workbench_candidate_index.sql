CREATE INDEX IF NOT EXISTS idx_leads_workbench_active_candidates
ON public.leads (
  assigned_to_user_id,
  website_status,
  qualification_status,
  status,
  quality_bucket,
  sales_priority_score DESC,
  lead_quality_score DESC,
  score DESC
)
WHERE archived_at IS NULL
  AND COALESCE(is_excluded, 0) = 0
  AND score > 0;
