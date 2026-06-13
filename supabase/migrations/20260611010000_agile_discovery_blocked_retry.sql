ALTER TABLE crawl_runs DROP CONSTRAINT IF EXISTS crawl_runs_status_check;
ALTER TABLE crawl_runs
  ADD CONSTRAINT crawl_runs_status_check
  CHECK (status IN ('queued','running','paused','blocked','done','error','canceled'));

ALTER TABLE crawl_runs
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_error_code text;

ALTER TABLE crawl_units
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error_code text;

CREATE INDEX IF NOT EXISTS idx_crawl_units_retry_ready
  ON crawl_units(crawl_run_id, status, next_retry_at, created_at)
  WHERE status = 'retry_wait';

CREATE INDEX IF NOT EXISTS idx_crawl_runs_blocked_created
  ON crawl_runs(status, blocked_at DESC, created_at DESC)
  WHERE status = 'blocked';
