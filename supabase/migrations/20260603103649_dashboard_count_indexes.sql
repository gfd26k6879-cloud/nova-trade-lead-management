CREATE INDEX IF NOT EXISTS idx_leads_discovered_at
ON public.leads (discovered_at);

CREATE INDEX IF NOT EXISTS idx_leads_active_discovered_at
ON public.leads (archived_at, is_excluded, discovered_at);
