ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_by_user_id TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_archived_active
ON public.leads (archived_at, updated_at DESC);
