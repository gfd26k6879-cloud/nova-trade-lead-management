CREATE INDEX IF NOT EXISTS idx_worker_runs_status_started_at
ON public.worker_runs (status, started_at);
