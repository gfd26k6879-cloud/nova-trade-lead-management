ALTER TABLE crawl_runs DROP CONSTRAINT IF EXISTS crawl_runs_status_check;
ALTER TABLE crawl_runs
  ADD CONSTRAINT crawl_runs_status_check
  CHECK (status IN ('queued','running','paused','done','error','canceled'));

ALTER TABLE crawl_units DROP CONSTRAINT IF EXISTS crawl_units_status_check;
ALTER TABLE crawl_units
  ADD CONSTRAINT crawl_units_status_check
  CHECK (status IN ('pending','running','retry_wait','done','failed','canceled'));
