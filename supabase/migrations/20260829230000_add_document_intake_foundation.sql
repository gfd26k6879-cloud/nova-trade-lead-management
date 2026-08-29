-- F-04 durable document-intake foundation. Private bytes stay in object storage;
-- these records contain identity, quarantine, dispatch, lease, and verdict facts.
-- Runtime access remains denied until member/worker mutation contracts are accepted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:f04:document-intake-foundation'));

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_identity text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT documents_workspace_fkey FOREIGN KEY (tenant_id,workspace_id)
    REFERENCES public.workspaces(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT documents_source_chk CHECK (
    source_kind='tenant_upload' AND source_identity='tenant_upload:'||id::text
  ),
  CONSTRAINT documents_scope_id_unique UNIQUE (tenant_id,workspace_id,id),
  CONSTRAINT documents_scope_source_unique UNIQUE (tenant_id,workspace_id,id,source_identity)
);

CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  original_name text NOT NULL,
  format text NOT NULL,
  media_type text NOT NULL,
  declared_byte_size bigint NOT NULL,
  max_bytes bigint NOT NULL,
  scanner_policy_version text NOT NULL,
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'upload_reserved',
  checksum text,
  verified_byte_size bigint,
  verified_media_type text,
  duplicate_of_version_id uuid,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_versions_document_fkey FOREIGN KEY (tenant_id,workspace_id,document_id)
    REFERENCES public.documents(tenant_id,workspace_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_versions_name_chk CHECK (pg_catalog.char_length(original_name) BETWEEN 1 AND 1024),
  CONSTRAINT document_versions_format_chk CHECK (format IN ('pdf','docx','xlsx','csv','txt','markdown','jpeg','png')),
  CONSTRAINT document_versions_media_chk CHECK (pg_catalog.char_length(media_type) BETWEEN 3 AND 255),
  CONSTRAINT document_versions_size_chk CHECK (declared_byte_size > 0 AND max_bytes > 0 AND declared_byte_size <= max_bytes),
  CONSTRAINT document_versions_policy_chk CHECK (scanner_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT document_versions_object_chk CHECK (
    object_key='tenants/'||tenant_id::text||'/documents/'||document_id::text||'/versions/'||id::text||'/original'
    AND object_key !~* '^(https?|file):'
  ),
  CONSTRAINT document_versions_status_chk CHECK (status IN ('upload_reserved','quarantined','clean','infected','scanner_error')),
  CONSTRAINT document_versions_checksum_chk CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_versions_verified_chk CHECK (
    (status='upload_reserved' AND checksum IS NULL AND verified_byte_size IS NULL AND verified_media_type IS NULL AND finalized_at IS NULL)
    OR
    (status<>'upload_reserved' AND checksum IS NOT NULL AND verified_byte_size=declared_byte_size
      AND verified_media_type=media_type AND finalized_at IS NOT NULL)
  ),
  CONSTRAINT document_versions_duplicate_self_chk CHECK (duplicate_of_version_id IS NULL OR duplicate_of_version_id<>id),
  CONSTRAINT document_versions_scope_id_unique UNIQUE (tenant_id,workspace_id,document_id,id),
  CONSTRAINT document_versions_scope_object_unique UNIQUE (tenant_id,workspace_id,document_id,id,object_key)
);

CREATE TABLE IF NOT EXISTS public.document_upload_reservations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  object_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_upload_reservations_version_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id,object_key)
    REFERENCES public.document_versions(tenant_id,workspace_id,document_id,id,object_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_upload_reservations_key_chk CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  CONSTRAINT document_upload_reservations_fingerprint_chk CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_upload_reservations_tenant_idempotency
  ON public.document_upload_reservations(tenant_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_upload_reservations_version
  ON public.document_upload_reservations(tenant_id,workspace_id,version_id);

CREATE TABLE IF NOT EXISTS public.document_version_finalizations (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  source_identity text NOT NULL,
  version_id uuid NOT NULL,
  processing_version_id uuid NOT NULL,
  checksum text NOT NULL,
  checksum_algorithm text NOT NULL,
  verified_byte_size bigint NOT NULL,
  verified_media_type text NOT NULL,
  scanner_policy_version text NOT NULL,
  dedupe_decision text NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_version_finalizations_document_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,source_identity)
    REFERENCES public.documents(tenant_id,workspace_id,id,source_identity) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_version_finalizations_version_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id)
    REFERENCES public.document_versions(tenant_id,workspace_id,document_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_version_finalizations_processing_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,processing_version_id)
    REFERENCES public.document_versions(tenant_id,workspace_id,document_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_version_finalizations_hash_chk CHECK (checksum ~ '^[0-9a-f]{64}$' AND checksum_algorithm='sha256'),
  CONSTRAINT document_version_finalizations_size_chk CHECK (verified_byte_size > 0),
  CONSTRAINT document_version_finalizations_decision_chk CHECK (dedupe_decision IN ('canonical','duplicate')),
  CONSTRAINT document_version_finalizations_version_unique UNIQUE (version_id),
  CONSTRAINT document_version_finalizations_decision_identity_chk CHECK (
    (dedupe_decision='canonical' AND version_id=processing_version_id)
    OR (dedupe_decision='duplicate' AND version_id<>processing_version_id)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_finalizations_canonical_source_hash_policy
  ON public.document_version_finalizations(tenant_id,workspace_id,source_identity,checksum,scanner_policy_version)
  WHERE dedupe_decision='canonical';

CREATE TABLE IF NOT EXISTS public.document_scan_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  object_key text NOT NULL,
  checksum text NOT NULL,
  policy_version text NOT NULL,
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
  verdict text,
  scanner_adapter_id text,
  scanner_version text,
  scanned_checksum text,
  scanned_at timestamptz,
  result_policy_version text,
  reason_code text,
  result_retryable boolean,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_scan_jobs_version_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id,object_key)
    REFERENCES public.document_versions(tenant_id,workspace_id,document_id,id,object_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_scan_jobs_hash_chk CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT document_scan_jobs_status_chk CHECK (status IN ('queued','running','retry_wait','clean','infected','scanner_error')),
  CONSTRAINT document_scan_jobs_attempt_chk CHECK (
    max_attempts BETWEEN 1 AND 10 AND attempt_count BETWEEN 0 AND max_attempts
    AND (status<>'retry_wait' OR attempt_count<max_attempts)
  ),
  CONSTRAINT document_scan_jobs_generation_chk CHECK (lease_generation>=0),
  CONSTRAINT document_scan_jobs_lease_chk CHECK (
    (status='running' AND attempt_count>0 AND lease_generation>0
      AND lease_token_hash ~ '^[0-9a-f]{64}$' AND lease_worker_hash ~ '^[0-9a-f]{64}$'
      AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at>lease_heartbeat_at)
    OR
    (status<>'running' AND lease_token_hash IS NULL AND lease_worker_hash IS NULL
      AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT document_scan_jobs_result_chk CHECK (
    (status IN ('queued','running') AND verdict IS NULL AND scanner_adapter_id IS NULL AND scanner_version IS NULL
      AND scanned_checksum IS NULL AND scanned_at IS NULL AND result_policy_version IS NULL
      AND reason_code IS NULL AND result_retryable IS NULL)
    OR
    (status='retry_wait' AND verdict='error' AND scanner_adapter_id IS NOT NULL AND scanner_version IS NOT NULL
      AND scanned_checksum=checksum AND scanned_at IS NOT NULL AND result_policy_version=policy_version
      AND result_retryable=true AND next_attempt_at IS NOT NULL)
    OR
    (status IN ('clean','infected','scanner_error') AND verdict=CASE status
      WHEN 'clean' THEN 'clean' WHEN 'infected' THEN 'infected' ELSE 'error' END
      AND scanner_adapter_id IS NOT NULL AND scanner_version IS NOT NULL AND scanned_checksum=checksum
      AND scanned_at IS NOT NULL AND result_policy_version=policy_version AND result_retryable IS NOT NULL)
  ),
  CONSTRAINT document_scan_jobs_version_unique UNIQUE (version_id),
  CONSTRAINT document_scan_jobs_scope_id_unique UNIQUE (tenant_id,workspace_id,document_id,version_id,id),
  CONSTRAINT document_scan_jobs_scope_identity_unique UNIQUE (tenant_id,workspace_id,document_id,version_id,id,object_key,checksum,policy_version)
);

CREATE TABLE IF NOT EXISTS public.document_scan_outbox (
  id bigserial PRIMARY KEY,
  dispatch_key text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  scan_job_id uuid NOT NULL,
  object_key text NOT NULL,
  checksum text NOT NULL,
  policy_version text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT document_scan_outbox_job_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id,scan_job_id,object_key,checksum,policy_version)
    REFERENCES public.document_scan_jobs(tenant_id,workspace_id,document_id,version_id,id,object_key,checksum,policy_version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_scan_outbox_dispatch_chk CHECK (
    dispatch_key='scan:'||tenant_id::text||':'||version_id::text||':'||checksum||':'||policy_version
  ),
  CONSTRAINT document_scan_outbox_delivery_chk CHECK (
    delivery_status IN ('pending','delivered') AND delivery_attempts BETWEEN 0 AND 100
    AND ((delivery_status='pending' AND delivered_at IS NULL) OR (delivery_status='delivered' AND delivered_at IS NOT NULL))
  ),
  CONSTRAINT document_scan_outbox_version_unique UNIQUE (version_id)
);

CREATE TABLE IF NOT EXISTS public.document_scan_lease_history (
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
  CONSTRAINT document_scan_lease_history_job_fkey
    FOREIGN KEY (tenant_id,workspace_id,document_id,version_id,job_id)
    REFERENCES public.document_scan_jobs(tenant_id,workspace_id,document_id,version_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT document_scan_lease_history_generation_chk CHECK (lease_generation>0),
  CONSTRAINT document_scan_lease_history_hash_chk CHECK (
    lease_token_hash ~ '^[0-9a-f]{64}$' AND lease_worker_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT document_scan_lease_history_time_chk CHECK (expires_at>heartbeat_at AND heartbeat_at>=acquired_at),
  CONSTRAINT document_scan_lease_history_release_chk CHECK (
    (released_at IS NULL AND release_reason IS NULL) OR (released_at IS NOT NULL AND release_reason IS NOT NULL)
  ),
  CONSTRAINT document_scan_lease_history_generation_unique UNIQUE (job_id,lease_generation)
);

CREATE INDEX IF NOT EXISTS idx_document_scan_jobs_ready
  ON public.document_scan_jobs(tenant_id,workspace_id,next_attempt_at,created_at,id)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS idx_document_scan_outbox_pending
  ON public.document_scan_outbox(tenant_id,workspace_id,created_at,id)
  WHERE delivery_status='pending';

CREATE OR REPLACE FUNCTION public.novatrade_document_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION '% append-only', TG_TABLE_NAME USING ERRCODE='P0001';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_identity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.source_kind,NEW.source_identity,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.source_kind,OLD.source_identity,OLD.created_at) THEN
    RAISE EXCEPTION 'document identity is immutable' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_version_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.original_name,NEW.format,NEW.media_type,
    NEW.declared_byte_size,NEW.max_bytes,NEW.scanner_policy_version,NEW.object_key,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.original_name,OLD.format,OLD.media_type,
    OLD.declared_byte_size,OLD.max_bytes,OLD.scanner_policy_version,OLD.object_key,OLD.created_at) THEN
    RAISE EXCEPTION 'document version identity or object key is immutable' USING ERRCODE='P0001';
  END IF;
  IF OLD.status<>'upload_reserved' AND ROW(NEW.checksum,NEW.verified_byte_size,NEW.verified_media_type,
    NEW.duplicate_of_version_id,NEW.finalized_at)
    IS DISTINCT FROM ROW(OLD.checksum,OLD.verified_byte_size,OLD.verified_media_type,
    OLD.duplicate_of_version_id,OLD.finalized_at) THEN
    RAISE EXCEPTION 'finalized document version facts are immutable' USING ERRCODE='P0001';
  END IF;
  IF NOT ((OLD.status='upload_reserved' AND NEW.status IN ('upload_reserved','quarantined'))
    OR (OLD.status='quarantined' AND NEW.status IN ('quarantined','clean','infected','scanner_error'))
    OR (OLD.status IN ('clean','infected','scanner_error') AND NEW.status=OLD.status)) THEN
    RAISE EXCEPTION 'document version state transition is invalid' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_finalization_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE v record; p record;
BEGIN
  SELECT status,checksum,verified_byte_size,verified_media_type,scanner_policy_version,duplicate_of_version_id
    INTO v FROM public.document_versions
    WHERE tenant_id=NEW.tenant_id AND workspace_id=NEW.workspace_id AND document_id=NEW.document_id AND id=NEW.version_id;
  SELECT status,checksum,scanner_policy_version INTO p FROM public.document_versions
    WHERE tenant_id=NEW.tenant_id AND workspace_id=NEW.workspace_id AND document_id=NEW.document_id AND id=NEW.processing_version_id;
  IF NOT FOUND OR v.status<>'quarantined' OR v.checksum<>NEW.checksum OR v.verified_byte_size<>NEW.verified_byte_size
    OR v.verified_media_type<>NEW.verified_media_type OR v.scanner_policy_version<>NEW.scanner_policy_version
    OR p.checksum<>NEW.checksum OR p.scanner_policy_version<>NEW.scanner_policy_version
    OR (NEW.dedupe_decision='canonical' AND v.duplicate_of_version_id IS NOT NULL)
    OR (NEW.dedupe_decision='duplicate' AND v.duplicate_of_version_id IS DISTINCT FROM NEW.processing_version_id)
    OR (NEW.dedupe_decision='duplicate' AND NOT EXISTS (
      SELECT 1 FROM public.document_version_finalizations f
      WHERE f.version_id=NEW.processing_version_id AND f.dedupe_decision='canonical'
        AND f.checksum=NEW.checksum AND f.scanner_policy_version=NEW.scanner_policy_version
    )) THEN
    RAISE EXCEPTION 'document finalization scope or canonical binding is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_scan_job_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_version_finalizations f
      WHERE f.tenant_id=NEW.tenant_id AND f.workspace_id=NEW.workspace_id AND f.document_id=NEW.document_id
        AND f.version_id=NEW.version_id AND f.processing_version_id=NEW.version_id
        AND f.checksum=NEW.checksum AND f.scanner_policy_version=NEW.policy_version AND f.dedupe_decision='canonical'
    ) THEN RAISE EXCEPTION 'scan job requires canonical finalization' USING ERRCODE='23514'; END IF;
    IF NEW.status<>'queued' OR NEW.attempt_count<>0 OR NEW.next_attempt_at IS NOT NULL
      OR NEW.lease_generation<>0 OR NEW.lease_token_hash IS NOT NULL OR NEW.lease_worker_hash IS NOT NULL
      OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NEW.verdict IS NOT NULL OR NEW.scanner_adapter_id IS NOT NULL OR NEW.scanner_version IS NOT NULL
      OR NEW.scanned_checksum IS NOT NULL OR NEW.scanned_at IS NOT NULL OR NEW.result_policy_version IS NOT NULL
      OR NEW.reason_code IS NOT NULL OR NEW.result_retryable IS NOT NULL THEN
      RAISE EXCEPTION 'scan job must begin in the pristine queued state' USING ERRCODE='P0001';
    END IF;
  ELSE
    IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,NEW.object_key,NEW.checksum,
      NEW.policy_version,NEW.max_attempts,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.version_id,OLD.object_key,OLD.checksum,
      OLD.policy_version,OLD.max_attempts,OLD.created_at)
      OR NEW.attempt_count<OLD.attempt_count OR NEW.lease_generation<OLD.lease_generation
      OR NEW.lease_generation>OLD.lease_generation+1 THEN
      RAISE EXCEPTION 'scan job immutable identity or lease generation violation' USING ERRCODE='P0001';
    END IF;
    IF OLD.status IN ('clean','infected','scanner_error') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'terminal scan job is immutable' USING ERRCODE='P0001';
    END IF;
    IF NOT ((OLD.status='queued' AND NEW.status IN ('queued','running'))
      OR (OLD.status='running' AND NEW.status IN ('running','retry_wait','clean','infected','scanner_error'))
      OR (OLD.status='retry_wait' AND NEW.status IN ('retry_wait','running'))
      OR (OLD.status IN ('clean','infected','scanner_error') AND NEW.status=OLD.status)) THEN
      RAISE EXCEPTION 'scan job state transition is invalid' USING ERRCODE='P0001';
    END IF;
    IF NEW.status='running' AND OLD.status<>'running' THEN
      IF NEW.attempt_count<>OLD.attempt_count+1 OR NEW.lease_generation<>OLD.lease_generation+1 THEN
        RAISE EXCEPTION 'scan lease attempt and generation must advance together' USING ERRCODE='P0001';
      END IF;
    ELSIF NEW.status='running' AND OLD.status='running' THEN
      IF ROW(NEW.attempt_count,NEW.lease_generation,NEW.lease_token_hash,NEW.lease_worker_hash,NEW.lease_acquired_at)
        IS DISTINCT FROM ROW(OLD.attempt_count,OLD.lease_generation,OLD.lease_token_hash,OLD.lease_worker_hash,OLD.lease_acquired_at)
        OR NEW.lease_heartbeat_at<OLD.lease_heartbeat_at OR NEW.lease_expires_at<OLD.lease_expires_at THEN
        RAISE EXCEPTION 'scan heartbeat cannot change or regress lease identity' USING ERRCODE='P0001';
      END IF;
    ELSIF NEW.attempt_count<>OLD.attempt_count OR NEW.lease_generation<>OLD.lease_generation THEN
      RAISE EXCEPTION 'scan attempt and generation change only on lease acquisition' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_scan_outbox_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.delivery_status<>'pending' OR NEW.delivery_attempts<>0 OR NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'scan outbox must begin in the pristine pending state' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.dispatch_key,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,
    NEW.scan_job_id,NEW.object_key,NEW.checksum,NEW.policy_version,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.dispatch_key,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.version_id,
    OLD.scan_job_id,OLD.object_key,OLD.checksum,OLD.policy_version,OLD.created_at) THEN
    RAISE EXCEPTION 'scan outbox identity is immutable' USING ERRCODE='P0001';
  END IF;
  IF NEW.delivery_attempts<OLD.delivery_attempts OR NEW.delivery_attempts>OLD.delivery_attempts+1
    OR (NEW.delivery_status='delivered'
      AND (OLD.delivery_status<>'pending' OR NEW.delivery_attempts<>OLD.delivery_attempts+1))
    OR (OLD.delivery_status='delivered' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'scan outbox delivery transition is invalid' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_scan_lease_history_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.status='running' AND NEW.lease_generation>0
    AND (TG_OP='INSERT' OR NEW.lease_generation>OLD.lease_generation) THEN
    INSERT INTO public.document_scan_lease_history(
      tenant_id,workspace_id,document_id,version_id,job_id,lease_generation,lease_token_hash,
      lease_worker_hash,acquired_at,heartbeat_at,expires_at
    ) VALUES (NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,NEW.id,NEW.lease_generation,
      NEW.lease_token_hash,NEW.lease_worker_hash,NEW.lease_acquired_at,NEW.lease_heartbeat_at,NEW.lease_expires_at);
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='running' AND NEW.status='running'
    AND NEW.lease_generation=OLD.lease_generation
    AND (NEW.lease_heartbeat_at IS DISTINCT FROM OLD.lease_heartbeat_at
      OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at) THEN
    UPDATE public.document_scan_lease_history
      SET heartbeat_at=NEW.lease_heartbeat_at,expires_at=NEW.lease_expires_at
      WHERE job_id=NEW.id AND lease_generation=NEW.lease_generation AND released_at IS NULL;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='running' AND NEW.status<>'running' THEN
    UPDATE public.document_scan_lease_history
      SET released_at=NEW.updated_at,release_reason=NEW.status
      WHERE job_id=NEW.id AND lease_generation=OLD.lease_generation AND released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.novatrade_document_lease_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_OP='DELETE' OR pg_catalog.pg_trigger_depth()<2 THEN
    RAISE EXCEPTION 'document scan lease history is append-only' USING ERRCODE='P0001';
  END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.workspace_id,NEW.document_id,NEW.version_id,NEW.job_id,
    NEW.lease_generation,NEW.lease_token_hash,NEW.lease_worker_hash,NEW.acquired_at,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.workspace_id,OLD.document_id,OLD.version_id,OLD.job_id,
    OLD.lease_generation,OLD.lease_token_hash,OLD.lease_worker_hash,OLD.acquired_at,OLD.created_at)
    OR NEW.heartbeat_at<OLD.heartbeat_at OR OLD.released_at IS NOT NULL
    OR (NEW.released_at IS NULL AND NEW.release_reason IS NOT NULL)
    OR (NEW.released_at IS NOT NULL AND (NEW.release_reason IS NULL OR NEW.released_at<NEW.acquired_at)) THEN
    RAISE EXCEPTION 'document scan lease history transition is invalid' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_documents_identity_guard ON public.documents;
CREATE TRIGGER trg_documents_identity_guard BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_identity_guard();
DROP TRIGGER IF EXISTS trg_documents_delete_guard ON public.documents;
CREATE TRIGGER trg_documents_delete_guard BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_append_only();
DROP TRIGGER IF EXISTS trg_document_versions_identity_guard ON public.document_versions;
CREATE TRIGGER trg_document_versions_identity_guard BEFORE UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_version_guard();
DROP TRIGGER IF EXISTS trg_document_versions_delete_guard ON public.document_versions;
CREATE TRIGGER trg_document_versions_delete_guard BEFORE DELETE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_append_only();
DROP TRIGGER IF EXISTS trg_document_upload_reservations_append_only ON public.document_upload_reservations;
CREATE TRIGGER trg_document_upload_reservations_append_only BEFORE UPDATE OR DELETE ON public.document_upload_reservations
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_append_only();
DROP TRIGGER IF EXISTS trg_document_finalizations_guard ON public.document_version_finalizations;
CREATE TRIGGER trg_document_finalizations_guard BEFORE INSERT ON public.document_version_finalizations
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_finalization_guard();
DROP TRIGGER IF EXISTS trg_document_finalizations_append_only ON public.document_version_finalizations;
CREATE TRIGGER trg_document_finalizations_append_only BEFORE UPDATE OR DELETE ON public.document_version_finalizations
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_append_only();
DROP TRIGGER IF EXISTS trg_document_scan_jobs_guard ON public.document_scan_jobs;
CREATE TRIGGER trg_document_scan_jobs_guard BEFORE INSERT OR UPDATE ON public.document_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_scan_job_guard();
DROP TRIGGER IF EXISTS trg_document_scan_jobs_lease_history ON public.document_scan_jobs;
CREATE TRIGGER trg_document_scan_jobs_lease_history AFTER INSERT OR UPDATE ON public.document_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_scan_lease_history_sync();
DROP TRIGGER IF EXISTS trg_document_scan_outbox_guard ON public.document_scan_outbox;
CREATE TRIGGER trg_document_scan_outbox_guard BEFORE INSERT OR UPDATE ON public.document_scan_outbox
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_scan_outbox_guard();
DROP TRIGGER IF EXISTS trg_document_scan_outbox_delete_guard ON public.document_scan_outbox;
CREATE TRIGGER trg_document_scan_outbox_delete_guard BEFORE DELETE ON public.document_scan_outbox
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_append_only();
DROP TRIGGER IF EXISTS trg_document_scan_lease_history_append_only ON public.document_scan_lease_history;
CREATE TRIGGER trg_document_scan_lease_history_append_only BEFORE UPDATE OR DELETE ON public.document_scan_lease_history
  FOR EACH ROW EXECUTE FUNCTION public.novatrade_document_lease_history_guard();

DO $security$
DECLARE t text; f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents','document_versions','document_upload_reservations',
    'document_version_finalizations','document_scan_outbox','document_scan_jobs','document_scan_lease_history'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
    IF pg_catalog.to_regrole('anon') IS NOT NULL THEN EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM anon',t); END IF;
    IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM authenticated',t); END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['novatrade_document_append_only','novatrade_document_identity_guard',
    'novatrade_document_version_guard','novatrade_document_finalization_guard','novatrade_document_scan_job_guard',
    'novatrade_document_scan_outbox_guard','novatrade_document_scan_lease_history_sync',
    'novatrade_document_lease_history_guard'] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC',f);
    IF pg_catalog.to_regrole('anon') IS NOT NULL THEN EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.%I() FROM anon',f); END IF;
    IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.%I() FROM authenticated',f); END IF;
  END LOOP;
  EXECUTE 'REVOKE ALL ON SEQUENCE public.document_version_finalizations_id_seq,
    public.document_scan_outbox_id_seq,public.document_scan_lease_history_id_seq FROM PUBLIC';
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE public.document_version_finalizations_id_seq,
      public.document_scan_outbox_id_seq,public.document_scan_lease_history_id_seq FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE public.document_version_finalizations_id_seq,
      public.document_scan_outbox_id_seq,public.document_scan_lease_history_id_seq FROM authenticated';
  END IF;
END;
$security$;

COMMIT;
