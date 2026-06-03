ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS scope_label text;
ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS created_by_user_id text;
ALTER TABLE public.crawl_runs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.crawl_runs cr
SET
  name = COALESCE(
    NULLIF(cr.name, ''),
    trim(concat(COALESCE(lm.name, 'Discovery'), ' discovery - ', to_char(cr.created_at::timestamptz, 'YYYY-MM-DD')))
  ),
  scope_label = COALESCE(
    NULLIF(cr.scope_label, ''),
    trim(concat_ws(' / ', lm.name, lm.country_code))
  ),
  updated_at = COALESCE(cr.updated_at, now())
FROM public.location_markets lm
WHERE lm.id = cr.market_id
  AND (cr.name IS NULL OR cr.name = '' OR cr.scope_label IS NULL OR cr.scope_label = '');

UPDATE public.crawl_runs
SET
  name = COALESCE(NULLIF(name, ''), 'Discovery item - ' || to_char(created_at::timestamptz, 'YYYY-MM-DD')),
  scope_label = COALESCE(NULLIF(scope_label, ''), 'Unscoped discovery'),
  updated_at = COALESCE(updated_at, now())
WHERE name IS NULL OR name = '' OR scope_label IS NULL OR scope_label = '';

CREATE INDEX IF NOT EXISTS idx_crawl_runs_status_created
ON public.crawl_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_market_created
ON public.crawl_runs (market_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_units_run_status
ON public.crawl_units (crawl_run_id, status);
