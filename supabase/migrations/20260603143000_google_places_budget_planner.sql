ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_text_search_monthly_cap INTEGER NOT NULL DEFAULT 4900;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_enterprise_monthly_cap INTEGER NOT NULL DEFAULT 900;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_test_run_call_cap INTEGER NOT NULL DEFAULT 50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_auto_pagination_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_auto_pagination_min_new_candidates INTEGER NOT NULL DEFAULT 6;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_auto_pagination_max_duplicate_rate REAL NOT NULL DEFAULT 0.6;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_default_discovery_mode TEXT NOT NULL DEFAULT 'coverage_probe';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_default_pagination_policy TEXT NOT NULL DEFAULT 'auto_yield_based';

ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS max_pages INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS pages_fetched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS raw_places_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS new_places_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS duplicate_places_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crawl_units ADD COLUMN IF NOT EXISTS budget_blocked_at TEXT;

UPDATE public.settings
SET max_calls_per_day = LEAST(max_calls_per_day, 300),
    max_calls_per_run = LEAST(max_calls_per_run, 500),
    google_text_search_monthly_cap = LEAST(google_text_search_monthly_cap, 4900),
    google_enterprise_monthly_cap = LEAST(google_enterprise_monthly_cap, 900),
    google_test_run_call_cap = LEAST(google_test_run_call_cap, 50),
    google_auto_pagination_enabled = 1,
    google_default_discovery_mode = 'coverage_probe',
    google_default_pagination_policy = 'auto_yield_based'
WHERE id = 1;

CREATE INDEX IF NOT EXISTS idx_crawl_units_budget_pages
ON public.crawl_units (crawl_run_id, status, pages_fetched, max_pages);
