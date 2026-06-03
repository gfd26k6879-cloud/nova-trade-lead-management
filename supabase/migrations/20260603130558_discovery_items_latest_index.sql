CREATE INDEX IF NOT EXISTS idx_crawl_runs_created_desc
ON public.crawl_runs (created_at DESC);
