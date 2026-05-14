ALTER TABLE settings ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_website_feedback_status text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_corrected_website_url text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_false_positive_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_reviewer_notes text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz;

CREATE TABLE IF NOT EXISTS worker_runs (
  id text PRIMARY KEY,
  worker_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'unknown',
  http_status integer,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_runs_worker_started
  ON worker_runs(worker_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_runs_status_started
  ON worker_runs(status, started_at DESC);

ALTER TABLE IF EXISTS worker_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE worker_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.invoke_app_worker(worker_name text, worker_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  worker_base_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
    INTO worker_base_url
    FROM vault.decrypted_secrets
   WHERE name = 'worker_base_url'
   LIMIT 1;

  SELECT decrypted_secret
    INTO worker_secret
    FROM vault.decrypted_secrets
   WHERE name = 'worker_cron_secret'
   LIMIT 1;

  IF nullif(worker_base_url, '') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault secret worker_base_url is required for scheduled app workers';
  END IF;

  IF nullif(worker_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault secret worker_cron_secret is required for scheduled app workers';
  END IF;

  SELECT net.http_post(
    url := rtrim(worker_base_url, '/') || worker_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := jsonb_build_object(
      'source', 'supabase_cron',
      'worker', worker_name,
      'scheduled_at', now()
    ),
    timeout_milliseconds := 55000
  )
    INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_app_worker(text, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job record;
  job_name text;
BEGIN
  FOREACH job_name IN ARRAY ARRAY[
    'nosite-ai-verification-worker',
    'nosite-crawl-worker',
    'nosite-enrichment-worker',
    'nosite-artifact-worker',
    'nosite-score-worker'
  ]
  LOOP
    FOR existing_job IN SELECT jobid FROM cron.job WHERE jobname = job_name
    LOOP
      PERFORM cron.unschedule(existing_job.jobid);
    END LOOP;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'nosite-ai-verification-worker',
  '* * * * *',
  $$SELECT private.invoke_app_worker('ai_verification', '/api/ai/verify-next');$$
);

SELECT cron.schedule(
  'nosite-crawl-worker',
  '* * * * *',
  $$SELECT private.invoke_app_worker('crawl', '/api/crawl/process-next');$$
);

SELECT cron.schedule(
  'nosite-enrichment-worker',
  '* * * * *',
  $$SELECT private.invoke_app_worker('enrichment', '/api/crawl/enrich-next');$$
);

SELECT cron.schedule(
  'nosite-artifact-worker',
  '*/2 * * * *',
  $$SELECT private.invoke_app_worker('artifact', '/api/ai/artifacts/process-next');$$
);

SELECT cron.schedule(
  'nosite-score-worker',
  '*/10 * * * *',
  $$SELECT private.invoke_app_worker('score_recompute', '/api/scores/recompute-stale');$$
);
