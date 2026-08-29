-- F-05 durable document extraction job root. Parser output tables and runtime
-- mutation authority remain separate; this migration establishes only the
-- exact clean-source identity, bounded lifecycle, and fenced lease history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('novatrade:f05:document-extraction-job-foundation')
);

CREATE TABLE IF NOT EXISTS public.document_extraction_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  canonical_finalization_id bigint NOT NULL,
  scan_job_id uuid NOT NULL,
  checksum text NOT NULL,
  scanner_policy_version text NOT NULL,
  parser_id text NOT NULL,
  parser_version text NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  next_attempt_at timestamptz,
  lease_generation integer NOT NULL DEFAULT 0,
  lease_token_hash text,
  lease_worker_hash text,
  lease_acquired_at timestamptz,
  lease_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  canceled_at timestamptz,
  result_lease_generation integer,
  result_lease_token_hash text,
  event_at timestamptz,
  output_sha256 text,
  output_block_count integer,
  output_chunk_count integer,
  quality_score numeric(5,4),
  review_required boolean,
  warnings jsonb,
  error_code text,
  error_fingerprint text,
  result_retryable boolean,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_extraction_jobs_version_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id)
    REFERENCES public.document_versions(tenant_id,workspace_id,document_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_extraction_jobs_finalization_fkey
    FOREIGN KEY (canonical_finalization_id)
    REFERENCES public.document_version_finalizations(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_extraction_jobs_scan_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id,scan_job_id)
    REFERENCES public.document_scan_jobs(tenant_id,workspace_id,document_id,version_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_extraction_jobs_token_lengths_chk CHECK (
    pg_catalog.char_length(parser_id) BETWEEN 1 AND 128
    AND pg_catalog.char_length(parser_version) BETWEEN 1 AND 64
    AND pg_catalog.char_length(scanner_policy_version) BETWEEN 1 AND 128
    AND pg_catalog.char_length(idempotency_key) BETWEEN 8 AND 160
  ),
  CONSTRAINT document_extraction_jobs_tokens_chk CHECK (
    parser_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    AND parser_version ~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
    AND scanner_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  CONSTRAINT document_extraction_jobs_hashes_chk CHECK (
    checksum ~ '^[0-9a-f]{64}$' AND input_hash ~ '^[0-9a-f]{64}$'
    AND (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$')
    AND (lease_worker_hash IS NULL OR lease_worker_hash ~ '^[0-9a-f]{64}$')
    AND (result_lease_token_hash IS NULL OR result_lease_token_hash ~ '^[0-9a-f]{64}$')
    AND (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$')
    AND (error_fingerprint IS NULL OR error_fingerprint ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT document_extraction_jobs_status_chk CHECK (status IN (
    'queued','running','retry_wait','complete','review_required','error','canceled'
  )),
  CONSTRAINT document_extraction_jobs_attempt_chk CHECK (
    max_attempts BETWEEN 1 AND 10 AND attempt_count BETWEEN 0 AND max_attempts
    AND lease_generation BETWEEN 0 AND max_attempts
    AND (status<>'retry_wait' OR attempt_count<max_attempts)
  ),
  CONSTRAINT document_extraction_jobs_lease_chk CHECK (
    (status='running' AND attempt_count>0 AND lease_generation=attempt_count
      AND lease_token_hash IS NOT NULL AND lease_worker_hash IS NOT NULL
      AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL
      AND lease_expires_at>lease_heartbeat_at
      AND lease_expires_at<=lease_heartbeat_at+interval '15 minutes'
      AND lease_heartbeat_at>=lease_acquired_at)
    OR
    (status<>'running' AND lease_token_hash IS NULL AND lease_worker_hash IS NULL
      AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT document_extraction_jobs_result_shape_chk CHECK (
    (status='queued' AND attempt_count=0 AND lease_generation=0 AND next_attempt_at IS NULL
      AND cancel_requested_at IS NULL AND canceled_at IS NULL
      AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL AND event_at IS NULL
      AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
      AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
      AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
    OR
    (status='running' AND next_attempt_at IS NULL AND canceled_at IS NULL
      AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL AND event_at IS NULL
      AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
      AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
      AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
    OR
    (status='retry_wait' AND next_attempt_at IS NOT NULL AND canceled_at IS NULL
      AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
      AND event_at IS NOT NULL AND output_sha256 IS NULL AND output_block_count IS NULL
      AND output_chunk_count IS NULL AND quality_score IS NULL AND review_required IS NULL
      AND warnings IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL
      AND result_retryable=true)
    OR
    (status IN ('complete','review_required') AND next_attempt_at IS NULL
      AND cancel_requested_at IS NULL AND canceled_at IS NULL
      AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
      AND event_at IS NOT NULL AND output_sha256 IS NOT NULL AND output_block_count>0
      AND output_chunk_count>0 AND output_chunk_count<=output_block_count
      AND quality_score BETWEEN 0 AND 1 AND warnings IS NOT NULL
      AND pg_catalog.jsonb_typeof(warnings)='array' AND pg_catalog.jsonb_array_length(warnings)<=100
      AND review_required=(status='review_required')
      AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
    OR
    (status='error' AND next_attempt_at IS NULL AND canceled_at IS NULL
      AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
      AND event_at IS NOT NULL AND output_sha256 IS NULL AND output_block_count IS NULL
      AND output_chunk_count IS NULL AND quality_score IS NULL AND review_required IS NULL
      AND warnings IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL
      AND result_retryable IS NOT NULL)
    OR
    (status='canceled' AND next_attempt_at IS NULL AND cancel_requested_at IS NOT NULL
      AND canceled_at IS NOT NULL AND event_at=canceled_at
      AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
      AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
      AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL
      AND ((attempt_count=0 AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL)
        OR (attempt_count>0 AND result_lease_generation=lease_generation
          AND result_lease_token_hash IS NOT NULL)))
  ),
  CONSTRAINT document_extraction_jobs_time_chk CHECK (
    updated_at>=created_at
    AND (next_attempt_at IS NULL OR next_attempt_at>=updated_at)
    AND (cancel_requested_at IS NULL OR cancel_requested_at>=created_at)
    AND (canceled_at IS NULL OR canceled_at>=cancel_requested_at)
    AND (event_at IS NULL OR event_at>=created_at)
  ),
  CONSTRAINT document_extraction_jobs_error_length_chk CHECK (
    error_code IS NULL OR (
      pg_catalog.char_length(error_code) BETWEEN 1 AND 128
      AND error_code=pg_catalog.btrim(error_code)
      AND error_code !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT document_extraction_jobs_scope_id_unique
    UNIQUE (tenant_id,workspace_id,id),
  CONSTRAINT document_extraction_jobs_scope_execution_unique
    UNIQUE (tenant_id,workspace_id,version_id,parser_id,parser_version,input_hash),
  CONSTRAINT document_extraction_jobs_scope_idempotency_unique
    UNIQUE (tenant_id,workspace_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.document_extraction_lease_history (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  job_id uuid NOT NULL,
  lease_generation integer NOT NULL,
  lease_token_hash text NOT NULL,
  lease_worker_hash text NOT NULL,
  acquired_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_extraction_lease_history_job_fkey
    FOREIGN KEY (tenant_id,workspace_id,job_id)
    REFERENCES public.document_extraction_jobs(tenant_id,workspace_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_extraction_lease_history_scope_chk CHECK (
    lease_generation>0 AND lease_token_hash ~ '^[0-9a-f]{64}$'
    AND lease_worker_hash ~ '^[0-9a-f]{64}$'
    AND expires_at>heartbeat_at AND expires_at<=heartbeat_at+interval '15 minutes'
    AND heartbeat_at>=acquired_at
  ),
  CONSTRAINT document_extraction_lease_history_release_chk CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND released_at>=heartbeat_at
      AND release_reason IN ('retry_wait','complete','review_required','error','canceled'))
  ),
  CONSTRAINT document_extraction_lease_history_generation_unique
    UNIQUE (job_id,lease_generation)
);

-- CREATE TABLE IF NOT EXISTS does not repair removed or same-name drifted
-- constraints. Recreate every required named check transactionally so replay
-- converges on the exact definitions below without accumulating duplicates.
DO $constraints$
DECLARE constraint_spec record;
BEGIN
  FOR constraint_spec IN
    SELECT * FROM (VALUES
      ('document_extraction_jobs','document_extraction_jobs_token_lengths_chk',
        $check$pg_catalog.char_length(parser_id) BETWEEN 1 AND 128
          AND pg_catalog.char_length(parser_version) BETWEEN 1 AND 64
          AND pg_catalog.char_length(scanner_policy_version) BETWEEN 1 AND 128
          AND pg_catalog.char_length(idempotency_key) BETWEEN 8 AND 160$check$),
      ('document_extraction_jobs','document_extraction_jobs_tokens_chk',
        $check$parser_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
          AND parser_version ~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
          AND scanner_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
          AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'$check$),
      ('document_extraction_jobs','document_extraction_jobs_hashes_chk',
        $check$checksum ~ '^[0-9a-f]{64}$' AND input_hash ~ '^[0-9a-f]{64}$'
          AND (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$')
          AND (lease_worker_hash IS NULL OR lease_worker_hash ~ '^[0-9a-f]{64}$')
          AND (result_lease_token_hash IS NULL OR result_lease_token_hash ~ '^[0-9a-f]{64}$')
          AND (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$')
          AND (error_fingerprint IS NULL OR error_fingerprint ~ '^[0-9a-f]{64}$')$check$),
      ('document_extraction_jobs','document_extraction_jobs_status_chk',
        $check$status IN ('queued','running','retry_wait','complete','review_required','error','canceled')$check$),
      ('document_extraction_jobs','document_extraction_jobs_attempt_chk',
        $check$max_attempts BETWEEN 1 AND 10 AND attempt_count BETWEEN 0 AND max_attempts
          AND lease_generation BETWEEN 0 AND max_attempts
          AND (status<>'retry_wait' OR attempt_count<max_attempts)$check$),
      ('document_extraction_jobs','document_extraction_jobs_lease_chk',
        $check$(status='running' AND attempt_count>0 AND lease_generation=attempt_count
            AND lease_token_hash IS NOT NULL AND lease_worker_hash IS NOT NULL
            AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL
            AND lease_expires_at>lease_heartbeat_at
            AND lease_expires_at<=lease_heartbeat_at+interval '15 minutes'
            AND lease_heartbeat_at>=lease_acquired_at)
          OR
          (status<>'running' AND lease_token_hash IS NULL AND lease_worker_hash IS NULL
            AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL)$check$),
      ('document_extraction_jobs','document_extraction_jobs_result_shape_chk',
        $check$(status='queued' AND attempt_count=0 AND lease_generation=0 AND next_attempt_at IS NULL
            AND cancel_requested_at IS NULL AND canceled_at IS NULL
            AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL AND event_at IS NULL
            AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
            AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
            AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
          OR
          (status='running' AND next_attempt_at IS NULL AND canceled_at IS NULL
            AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL AND event_at IS NULL
            AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
            AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
            AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
          OR
          (status='retry_wait' AND next_attempt_at IS NOT NULL AND canceled_at IS NULL
            AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
            AND event_at IS NOT NULL AND output_sha256 IS NULL AND output_block_count IS NULL
            AND output_chunk_count IS NULL AND quality_score IS NULL AND review_required IS NULL
            AND warnings IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL
            AND result_retryable=true)
          OR
          (status IN ('complete','review_required') AND next_attempt_at IS NULL
            AND cancel_requested_at IS NULL AND canceled_at IS NULL
            AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
            AND event_at IS NOT NULL AND output_sha256 IS NOT NULL AND output_block_count>0
            AND output_chunk_count>0 AND output_chunk_count<=output_block_count
            AND quality_score BETWEEN 0 AND 1 AND warnings IS NOT NULL
            AND pg_catalog.jsonb_typeof(warnings)='array' AND pg_catalog.jsonb_array_length(warnings)<=100
            AND review_required=(status='review_required')
            AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL)
          OR
          (status='error' AND next_attempt_at IS NULL AND canceled_at IS NULL
            AND result_lease_generation=lease_generation AND result_lease_token_hash IS NOT NULL
            AND event_at IS NOT NULL AND output_sha256 IS NULL AND output_block_count IS NULL
            AND output_chunk_count IS NULL AND quality_score IS NULL AND review_required IS NULL
            AND warnings IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL
            AND result_retryable IS NOT NULL)
          OR
          (status='canceled' AND next_attempt_at IS NULL AND cancel_requested_at IS NOT NULL
            AND canceled_at IS NOT NULL AND event_at=canceled_at
            AND output_sha256 IS NULL AND output_block_count IS NULL AND output_chunk_count IS NULL
            AND quality_score IS NULL AND review_required IS NULL AND warnings IS NULL
            AND error_code IS NULL AND error_fingerprint IS NULL AND result_retryable IS NULL
            AND ((attempt_count=0 AND result_lease_generation IS NULL AND result_lease_token_hash IS NULL)
              OR (attempt_count>0 AND result_lease_generation=lease_generation
                AND result_lease_token_hash IS NOT NULL)))$check$),
      ('document_extraction_jobs','document_extraction_jobs_time_chk',
        $check$updated_at>=created_at
          AND (next_attempt_at IS NULL OR next_attempt_at>=updated_at)
          AND (cancel_requested_at IS NULL OR cancel_requested_at>=created_at)
          AND (canceled_at IS NULL OR canceled_at>=cancel_requested_at)
          AND (event_at IS NULL OR event_at>=created_at)$check$),
      ('document_extraction_jobs','document_extraction_jobs_error_length_chk',
        $check$error_code IS NULL OR (
            pg_catalog.char_length(error_code) BETWEEN 1 AND 128
            AND error_code=pg_catalog.btrim(error_code)
            AND error_code !~ '[[:cntrl:]]'
          )$check$),
      ('document_extraction_lease_history','document_extraction_lease_history_scope_chk',
        $check$lease_generation>0 AND lease_token_hash ~ '^[0-9a-f]{64}$'
          AND lease_worker_hash ~ '^[0-9a-f]{64}$'
          AND expires_at>heartbeat_at AND expires_at<=heartbeat_at+interval '15 minutes'
          AND heartbeat_at>=acquired_at$check$),
      ('document_extraction_lease_history','document_extraction_lease_history_release_chk',
        $check$(released_at IS NULL AND release_reason IS NULL)
          OR (released_at IS NOT NULL AND released_at>=heartbeat_at
            AND release_reason IN ('retry_wait','complete','review_required','error','canceled'))$check$)
    ) AS required(table_name,constraint_name,check_expression)
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      constraint_spec.table_name,constraint_spec.constraint_name
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
      constraint_spec.table_name,constraint_spec.constraint_name,constraint_spec.check_expression
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
      constraint_spec.table_name,constraint_spec.constraint_name
    );
  END LOOP;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_ready
  ON public.document_extraction_jobs(tenant_id,workspace_id,status,next_attempt_at,created_at,id)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_running_lease
  ON public.document_extraction_jobs(tenant_id,workspace_id,lease_expires_at,id)
  WHERE status='running';
CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_version_history
  ON public.document_extraction_jobs(tenant_id,workspace_id,version_id,created_at,id);

CREATE OR REPLACE FUNCTION public.novatrade_document_extraction_job_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE
  parent_ok boolean;
  warning_item jsonb;
  warning_text text;
  database_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'document extraction jobs are append-only' USING ERRCODE='P0001';
  END IF;

  IF NEW.warnings IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(NEW.warnings)<>'array'
      OR pg_catalog.octet_length(NEW.warnings::text)>65536 THEN
      RAISE EXCEPTION 'document extraction warnings must be a bounded array' USING ERRCODE='23514';
    END IF;
    FOR warning_item IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.warnings) LOOP
      IF pg_catalog.jsonb_typeof(warning_item)<>'string' THEN
        RAISE EXCEPTION 'document extraction warning must be a string' USING ERRCODE='23514';
      END IF;
      warning_text := warning_item #>> '{}';
      IF pg_catalog.char_length(warning_text) NOT BETWEEN 1 AND 500
        OR warning_text<>pg_catalog.btrim(warning_text)
        OR warning_text ~ '[[:cntrl:]]'
        OR warning_text ~ U&'[\0080-\009F]' THEN
        RAISE EXCEPTION 'document extraction warning text is invalid' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END IF;

  IF TG_OP='INSERT' THEN
    SELECT true INTO parent_ok
    FROM public.document_versions v
    JOIN public.document_version_finalizations f
      ON f.id=NEW.canonical_finalization_id
      AND f.tenant_id=NEW.tenant_id AND f.workspace_id=NEW.workspace_id
      AND f.document_id=NEW.document_id AND f.version_id=NEW.version_id
      AND f.processing_version_id=NEW.version_id AND f.dedupe_decision='canonical'
      AND f.checksum=NEW.checksum AND f.scanner_policy_version=NEW.scanner_policy_version
    JOIN public.document_scan_jobs s
      ON s.id=NEW.scan_job_id AND s.tenant_id=NEW.tenant_id AND s.workspace_id=NEW.workspace_id
      AND s.document_id=NEW.document_id AND s.version_id=NEW.version_id
      AND s.checksum=NEW.checksum AND s.policy_version=NEW.scanner_policy_version
    WHERE v.tenant_id=NEW.tenant_id AND v.workspace_id=NEW.workspace_id
      AND v.document_id=NEW.document_id AND v.id=NEW.version_id
      AND v.status='clean' AND v.checksum=NEW.checksum
      AND v.scanner_policy_version=NEW.scanner_policy_version
      AND s.status='clean' AND s.verdict='clean' AND s.scanned_checksum=NEW.checksum
      AND s.result_policy_version=NEW.scanner_policy_version;
    IF parent_ok IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'extraction job requires exact clean canonical scan facts' USING ERRCODE='23514';
    END IF;
    IF NEW.status<>'queued' OR NEW.attempt_count<>0 OR NEW.lease_generation<>0
      OR NEW.next_attempt_at IS NOT NULL OR NEW.lease_token_hash IS NOT NULL
      OR NEW.lease_worker_hash IS NOT NULL OR NEW.lease_acquired_at IS NOT NULL
      OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NEW.cancel_requested_at IS NOT NULL OR NEW.canceled_at IS NOT NULL
      OR NEW.result_lease_generation IS NOT NULL OR NEW.result_lease_token_hash IS NOT NULL
      OR NEW.event_at IS NOT NULL OR NEW.output_sha256 IS NOT NULL
      OR NEW.output_block_count IS NOT NULL OR NEW.output_chunk_count IS NOT NULL
      OR NEW.quality_score IS NOT NULL OR NEW.review_required IS NOT NULL OR NEW.warnings IS NOT NULL
      OR NEW.error_code IS NOT NULL OR NEW.error_fingerprint IS NOT NULL
      OR NEW.result_retryable IS NOT NULL THEN
      RAISE EXCEPTION 'extraction job must begin in the pristine queued state' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,
      NEW.canonical_finalization_id,NEW.scan_job_id,NEW.checksum,NEW.scanner_policy_version,
      NEW.parser_id,NEW.parser_version,NEW.idempotency_key,NEW.input_hash,NEW.max_attempts,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.version_id,
      OLD.canonical_finalization_id,OLD.scan_job_id,OLD.checksum,OLD.scanner_policy_version,
      OLD.parser_id,OLD.parser_version,OLD.idempotency_key,OLD.input_hash,OLD.max_attempts,OLD.created_at) THEN
    RAISE EXCEPTION 'document extraction execution identity is immutable' USING ERRCODE='P0001';
  END IF;
  IF NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'document extraction time regression' USING ERRCODE='P0001';
  END IF;
  IF OLD.status IN ('complete','review_required','error','canceled') THEN
    RAISE EXCEPTION 'document extraction terminal state is immutable' USING ERRCODE='P0001';
  END IF;
  IF NOT (
    (OLD.status='queued' AND NEW.status IN ('running','canceled'))
    OR (OLD.status='running' AND NEW.status IN (
      'running','retry_wait','complete','review_required','error','canceled'
    ))
    OR (OLD.status='retry_wait' AND NEW.status IN ('running','error','canceled'))
  ) THEN
    RAISE EXCEPTION 'document extraction state transition is invalid' USING ERRCODE='P0001';
  END IF;
  IF OLD.cancel_requested_at IS NOT NULL
    AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at THEN
    RAISE EXCEPTION 'document extraction cancel request is immutable' USING ERRCODE='P0001';
  END IF;
  IF NEW.cancel_requested_at IS NOT NULL AND NEW.status NOT IN ('running','canceled') THEN
    RAISE EXCEPTION 'document extraction cancel request blocks later result' USING ERRCODE='P0001';
  END IF;

  IF NEW.status='running' AND OLD.status IN ('queued','retry_wait') THEN
    IF NEW.attempt_count<>OLD.attempt_count+1 OR NEW.lease_generation<>OLD.lease_generation+1
      OR NEW.lease_generation<>NEW.attempt_count OR NEW.lease_token_hash IS NULL
      OR NEW.lease_worker_hash IS NULL OR NEW.lease_acquired_at IS NULL
      OR NEW.lease_heartbeat_at IS DISTINCT FROM NEW.lease_acquired_at
      OR NEW.lease_acquired_at>database_now OR NEW.lease_heartbeat_at>database_now
      OR NEW.lease_expires_at<=database_now
      OR NEW.lease_expires_at>NEW.lease_heartbeat_at+interval '15 minutes'
      OR NEW.next_attempt_at IS NOT NULL
      OR NEW.cancel_requested_at IS NOT NULL
      OR (OLD.next_attempt_at IS NOT NULL AND NEW.lease_acquired_at<OLD.next_attempt_at)
      OR NEW.result_lease_generation IS NOT NULL OR NEW.result_lease_token_hash IS NOT NULL
      OR NEW.event_at IS NOT NULL OR NEW.error_code IS NOT NULL
      OR NEW.error_fingerprint IS NOT NULL OR NEW.result_retryable IS NOT NULL THEN
      RAISE EXCEPTION 'document extraction lease acquisition is invalid' USING ERRCODE='P0001';
    END IF;
  ELSE
    IF NEW.attempt_count<>OLD.attempt_count OR NEW.lease_generation<>OLD.lease_generation THEN
      RAISE EXCEPTION 'document extraction attempt or generation changed outside acquisition' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF OLD.status='running' AND NEW.status='running' THEN
    IF OLD.lease_expires_at<=database_now THEN
      RAISE EXCEPTION 'document extraction lease expired before heartbeat or extension'
        USING ERRCODE='P0001';
    END IF;
    IF NEW.lease_token_hash IS DISTINCT FROM OLD.lease_token_hash
      OR NEW.lease_worker_hash IS DISTINCT FROM OLD.lease_worker_hash
      OR NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at
      OR NEW.lease_heartbeat_at<OLD.lease_heartbeat_at OR NEW.lease_expires_at<OLD.lease_expires_at
      OR NEW.lease_heartbeat_at>database_now OR NEW.lease_expires_at<=database_now
      OR NEW.lease_expires_at>NEW.lease_heartbeat_at+interval '15 minutes' THEN
      RAISE EXCEPTION 'document extraction running lease identity or heartbeat regression' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF OLD.status='running' AND NEW.status<>'running' THEN
    IF OLD.lease_expires_at<=database_now THEN
      RAISE EXCEPTION 'document extraction lease expired before finalization' USING ERRCODE='P0001';
    END IF;
    IF NEW.result_lease_generation IS DISTINCT FROM OLD.lease_generation
      OR NEW.result_lease_token_hash IS DISTINCT FROM OLD.lease_token_hash
      OR NEW.event_at IS NULL OR NEW.event_at<OLD.lease_heartbeat_at OR NEW.event_at>=OLD.lease_expires_at
      OR NEW.event_at>database_now
      OR NEW.lease_token_hash IS NOT NULL OR NEW.lease_worker_hash IS NOT NULL
      OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL
      OR NEW.lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'document extraction result is not fenced to the live lease' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF OLD.status='retry_wait' AND NEW.status IN ('error','canceled') THEN
    IF NEW.result_lease_generation IS DISTINCT FROM OLD.result_lease_generation
      OR NEW.result_lease_token_hash IS DISTINCT FROM OLD.result_lease_token_hash
      OR NEW.event_at IS DISTINCT FROM (CASE
        WHEN NEW.status='canceled' THEN NEW.canceled_at ELSE OLD.event_at
      END) THEN
      RAISE EXCEPTION 'document extraction retry terminal facts are invalid' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_document_extraction_lease_history_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
BEGIN
  IF NEW.status='running' AND NEW.lease_generation>OLD.lease_generation THEN
    INSERT INTO public.document_extraction_lease_history(
      tenant_id,workspace_id,document_id,version_id,job_id,lease_generation,
      lease_token_hash,lease_worker_hash,acquired_at,heartbeat_at,expires_at
    ) VALUES (NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,NEW.id,
      NEW.lease_generation,NEW.lease_token_hash,NEW.lease_worker_hash,NEW.lease_acquired_at,
      NEW.lease_heartbeat_at,NEW.lease_expires_at);
  ELSIF OLD.status='running' AND NEW.status='running'
    AND (NEW.lease_heartbeat_at IS DISTINCT FROM OLD.lease_heartbeat_at
      OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at) THEN
    UPDATE public.document_extraction_lease_history
      SET heartbeat_at=NEW.lease_heartbeat_at,expires_at=NEW.lease_expires_at
      WHERE job_id=NEW.id AND lease_generation=NEW.lease_generation AND released_at IS NULL;
  ELSIF OLD.status='running' AND NEW.status<>'running' THEN
    UPDATE public.document_extraction_lease_history
      SET heartbeat_at=OLD.lease_heartbeat_at,expires_at=OLD.lease_expires_at,
        released_at=NEW.event_at,release_reason=NEW.status
      WHERE job_id=NEW.id AND lease_generation=OLD.lease_generation AND released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_document_extraction_lease_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
BEGIN
  IF TG_OP='DELETE' OR pg_catalog.pg_trigger_depth()<2 THEN
    RAISE EXCEPTION 'document extraction lease history is append-only' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,NEW.job_id,
      NEW.lease_generation,NEW.lease_token_hash,NEW.lease_worker_hash,NEW.acquired_at,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.version_id,OLD.job_id,
      OLD.lease_generation,OLD.lease_token_hash,OLD.lease_worker_hash,OLD.acquired_at,OLD.created_at)
    OR NEW.heartbeat_at<OLD.heartbeat_at OR NEW.expires_at<OLD.expires_at OR OLD.released_at IS NOT NULL
    OR (NEW.released_at IS NULL AND NEW.release_reason IS NOT NULL)
    OR (NEW.released_at IS NOT NULL AND (NEW.release_reason IS NULL OR NEW.released_at<NEW.heartbeat_at)) THEN
    RAISE EXCEPTION 'document extraction lease history transition is invalid' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_document_extraction_job_guard ON public.document_extraction_jobs;
CREATE TRIGGER trg_document_extraction_job_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.document_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_extraction_job_guard();
DROP TRIGGER IF EXISTS trg_document_extraction_lease_history_sync ON public.document_extraction_jobs;
CREATE TRIGGER trg_document_extraction_lease_history_sync
  AFTER UPDATE ON public.document_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_extraction_lease_history_sync();
DROP TRIGGER IF EXISTS trg_document_extraction_lease_history_guard
  ON public.document_extraction_lease_history;
CREATE TRIGGER trg_document_extraction_lease_history_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.document_extraction_lease_history
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_extraction_lease_history_guard();

ALTER TABLE public.document_extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extraction_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_extraction_lease_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extraction_lease_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_extraction_jobs,public.document_extraction_lease_history FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.document_extraction_lease_history_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_document_extraction_job_guard(),
  public.novatrade_document_extraction_lease_history_sync(),
  public.novatrade_document_extraction_lease_history_guard() FROM PUBLIC;

DO $security$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF pg_catalog.to_regrole(role_name) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON TABLE public.document_extraction_jobs,public.document_extraction_lease_history FROM %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON SEQUENCE public.document_extraction_lease_history_id_seq FROM %I',role_name
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION public.novatrade_document_extraction_job_guard(), public.novatrade_document_extraction_lease_history_sync(), public.novatrade_document_extraction_lease_history_guard() FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$security$;

COMMENT ON TABLE public.document_extraction_jobs IS
  'Deny-by-default durable parser work rooted in one exact clean canonical document version and scan.';
COMMENT ON TABLE public.document_extraction_lease_history IS
  'Append-only fenced lease generations for document extraction jobs; no raw document content.';

DO $receipt$
DECLARE rls_count integer; policy_count integer; trigger_count integer; fk_count integer;
  check_count integer; invalid_check_count integer;
BEGIN
  SELECT count(*) INTO rls_count
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN (
    'document_extraction_jobs','document_extraction_lease_history'
  ) AND c.relrowsecurity AND c.relforcerowsecurity;
  SELECT count(*) INTO policy_count FROM pg_catalog.pg_policy
  WHERE polrelid IN ('public.document_extraction_jobs'::regclass,
    'public.document_extraction_lease_history'::regclass);
  SELECT count(*) INTO trigger_count FROM pg_catalog.pg_trigger
  WHERE tgrelid IN ('public.document_extraction_jobs'::regclass,
    'public.document_extraction_lease_history'::regclass) AND NOT tgisinternal;
  SELECT count(*) INTO fk_count FROM pg_catalog.pg_constraint
  WHERE conrelid IN ('public.document_extraction_jobs'::regclass,
    'public.document_extraction_lease_history'::regclass) AND contype='f';
  WITH required(table_oid,constraint_name) AS (VALUES
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_token_lengths_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_tokens_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_hashes_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_status_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_attempt_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_lease_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_result_shape_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_time_chk'),
    ('public.document_extraction_jobs'::regclass,'document_extraction_jobs_error_length_chk'),
    ('public.document_extraction_lease_history'::regclass,'document_extraction_lease_history_scope_chk'),
    ('public.document_extraction_lease_history'::regclass,'document_extraction_lease_history_release_chk')
  )
  SELECT count(k.oid),count(*) FILTER (WHERE k.oid IS NULL OR NOT k.convalidated)
    INTO check_count,invalid_check_count
  FROM required r LEFT JOIN pg_catalog.pg_constraint k
    ON k.conrelid=r.table_oid AND k.conname=r.constraint_name AND k.contype='c';
  IF rls_count<>2 OR policy_count<>0 OR trigger_count<>3 OR fk_count<>4
    OR check_count<>11 OR invalid_check_count<>0 THEN
    RAISE EXCEPTION 'F05 document extraction job catalog incomplete' USING ERRCODE='P0001';
  END IF;
END;
$receipt$;
COMMIT;
