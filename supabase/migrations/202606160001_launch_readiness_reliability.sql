ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_started_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_finished_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_next_retry_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_last_error text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_last_error_code text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS enrichment_max_attempts integer NOT NULL DEFAULT 3;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_enrichment_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_enrichment_status_check
  CHECK (enrichment_status IN ('pending','running','retry_wait','enriched','error','skipped'));

CREATE INDEX IF NOT EXISTS idx_leads_enrichment_lease
  ON public.leads (enrichment_status, enrichment_next_retry_at, score DESC)
  WHERE archived_at IS NULL AND COALESCE(is_excluded, 0) = 0;

ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS published_by_user_id text;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS unpublished_at timestamptz;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS unpublished_by_user_id text;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS revoked_by_user_id text;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS revoke_reason text;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.demos ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_demos_public_slug
  ON public.demos (slug, is_published, revoked_at);
