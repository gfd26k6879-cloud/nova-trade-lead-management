CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.invoke_ai_verification_worker()
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
    RAISE EXCEPTION 'Supabase Vault secret worker_base_url is required for nosite-ai-verification-worker';
  END IF;

  IF nullif(worker_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault secret worker_cron_secret is required for nosite-ai-verification-worker';
  END IF;

  SELECT net.http_post(
    url := rtrim(worker_base_url, '/') || '/api/ai/verify-next',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := jsonb_build_object(
      'source', 'supabase_cron',
      'worker', 'nosite-ai-verification-worker',
      'scheduled_at', now()
    ),
    timeout_milliseconds := 55000
  )
    INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_ai_verification_worker() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'nosite-ai-verification-worker'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'nosite-ai-verification-worker',
  '* * * * *',
  $$SELECT private.invoke_ai_verification_worker();$$
);
