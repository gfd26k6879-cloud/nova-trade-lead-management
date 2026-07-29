CREATE TABLE public.tenant_export_jobs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL
    CONSTRAINT tenant_export_jobs_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  operation text NOT NULL DEFAULT 'tenant_data_export'
    CONSTRAINT tenant_export_jobs_operation_chk CHECK (operation = 'tenant_data_export'),
  requester_auth_identity_id uuid NOT NULL,
  requester_membership_id uuid,
  support_access_grant_id uuid,
  status text NOT NULL DEFAULT 'requested'
    CONSTRAINT tenant_export_jobs_status_chk CHECK (status IN (
      'requested', 'snapshotting', 'redacting', 'artifact_created', 'released',
      'retry_wait', 'failed', 'canceled', 'expired', 'deleted'
    )),
  scope_hash text NOT NULL CONSTRAINT tenant_export_jobs_scope_hash_chk CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  input_hash text NOT NULL CONSTRAINT tenant_export_jobs_input_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash text NOT NULL CONSTRAINT tenant_export_jobs_idempotency_key_hash_chk CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL CONSTRAINT tenant_export_jobs_policy_version_chk CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{4,127}$'),
  manifest_version text NOT NULL CONSTRAINT tenant_export_jobs_manifest_version_chk CHECK (manifest_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  schema_version text NOT NULL CONSTRAINT tenant_export_jobs_schema_version_chk CHECK (schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  requested_format text NOT NULL CONSTRAINT tenant_export_jobs_requested_format_chk CHECK (requested_format IN ('csv', 'json', 'package')),
  snapshot_at timestamptz(3),
  artifact_storage_ref text,
  artifact_checksum_sha256 text,
  included_count integer,
  excluded_count integer,
  redacted_count integer,
  artifact_created_at timestamptz(3),
  expires_at timestamptz(3),
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz(3),
  lease_owner_hash text,
  lease_generation integer NOT NULL DEFAULT 0,
  lease_acquired_at timestamptz(3),
  lease_heartbeat_at timestamptz(3),
  lease_expires_at timestamptz(3),
  correlation_id text NOT NULL,
  audit_event_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_export_jobs_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_requester_membership_fkey
    FOREIGN KEY (tenant_id, requester_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_support_grant_fkey
    FOREIGN KEY (support_access_grant_id)
    REFERENCES public.support_access_grants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_requester_selector_chk
    CHECK ((requester_membership_id IS NOT NULL) <> (support_access_grant_id IS NOT NULL)),
  CONSTRAINT tenant_export_jobs_hashes_chk CHECK (
    scope_hash ~ '^[0-9a-f]{64}$'
    AND input_hash ~ '^[0-9a-f]{64}$'
    AND idempotency_key_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT tenant_export_jobs_counts_chk CHECK (
    (included_count IS NULL OR included_count >= 0)
    AND (excluded_count IS NULL OR excluded_count >= 0)
    AND (redacted_count IS NULL OR redacted_count >= 0)
  ),
  CONSTRAINT tenant_export_jobs_retry_chk CHECK (retry_count BETWEEN 0 AND 10 AND max_retries BETWEEN 0 AND 10 AND retry_count <= max_retries),
  CONSTRAINT tenant_export_jobs_timestamp_finiteness_chk CHECK (
    (snapshot_at IS NULL OR pg_catalog.isfinite(snapshot_at))
    AND (artifact_created_at IS NULL OR pg_catalog.isfinite(artifact_created_at))
    AND (expires_at IS NULL OR pg_catalog.isfinite(expires_at))
    AND (next_retry_at IS NULL OR pg_catalog.isfinite(next_retry_at))
    AND (lease_acquired_at IS NULL OR pg_catalog.isfinite(lease_acquired_at))
    AND (lease_heartbeat_at IS NULL OR pg_catalog.isfinite(lease_heartbeat_at))
    AND (lease_expires_at IS NULL OR pg_catalog.isfinite(lease_expires_at))
    AND created_at <= updated_at
    AND (status NOT IN ('redacting', 'artifact_created', 'released', 'expired', 'deleted') OR (snapshot_at IS NOT NULL AND snapshot_at >= created_at))
    AND (artifact_created_at IS NULL OR (snapshot_at IS NOT NULL AND artifact_created_at >= snapshot_at))
  ),
  CONSTRAINT tenant_export_jobs_artifact_facts_chk CHECK (
    (
      artifact_storage_ref IS NULL AND artifact_checksum_sha256 IS NULL
      AND included_count IS NULL AND excluded_count IS NULL AND redacted_count IS NULL
      AND artifact_created_at IS NULL AND expires_at IS NULL
    ) OR (
      artifact_storage_ref IS NOT NULL AND artifact_checksum_sha256 IS NOT NULL
      AND included_count IS NOT NULL AND excluded_count IS NOT NULL AND redacted_count IS NOT NULL
      AND artifact_created_at IS NOT NULL AND expires_at IS NOT NULL
      AND status IN ('artifact_created', 'released', 'expired', 'deleted', 'retry_wait', 'failed', 'canceled')
    )
  ),
  CONSTRAINT tenant_export_jobs_artifact_checksum_chk CHECK (artifact_checksum_sha256 IS NULL OR artifact_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT tenant_export_jobs_artifact_ref_shape_chk CHECK (
    artifact_storage_ref IS NULL OR (
      artifact_storage_ref ~ '^tenants/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/exports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9][a-z0-9._-]{0,127}$'
      AND lower(artifact_storage_ref) !~ '(secret|credential|password|bearer|api[_-]?key|token)'
    )
  ),
  CONSTRAINT tenant_export_jobs_artifact_expiry_chk CHECK (
    artifact_created_at IS NULL OR (
      expires_at > artifact_created_at
      AND expires_at <= artifact_created_at + pg_catalog.interval '7 days'
    )
  ),
  CONSTRAINT tenant_export_jobs_error_shape_chk CHECK (
    (error_code IS NULL AND error_message IS NULL)
    OR (
      error_code IN ('EXPORT_SCOPE_INVALID', 'EXPORT_POLICY_BLOCKED', 'EXPORT_SNAPSHOT_FAILED', 'EXPORT_REDACTION_FAILED', 'EXPORT_ARTIFACT_FAILED', 'EXPORT_STORAGE_CHECKPOINT_FAILED', 'EXPORT_RETRYABLE', 'EXPORT_RETRY_EXHAUSTED', 'EXPORT_CANCELED', 'BLOCKED_EXPORT_REPLAY_CONFLICT', 'BLOCKED_EXPORT_EXPIRED', 'EXPORT_UNKNOWN_FAILURE')
      AND error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
      AND error_message ~ '^[A-Za-z0-9][A-Za-z0-9 .,:;_()/-]{0,239}$'
      AND lower(error_message) !~ '(secret|credential|password|bearer|api[_-]?key|token)'
    )
  ),
  CONSTRAINT tenant_export_jobs_retry_facts_chk CHECK (
    (status = 'retry_wait' AND next_retry_at IS NOT NULL AND error_code IS NOT NULL AND error_message IS NOT NULL AND retry_count < max_retries)
    OR (status IN ('failed', 'canceled') AND next_retry_at IS NULL AND error_code IS NOT NULL AND error_message IS NOT NULL)
    OR (status NOT IN ('retry_wait', 'failed', 'canceled') AND next_retry_at IS NULL)
  ),
  CONSTRAINT tenant_export_jobs_artifact_state_facts_chk CHECK (
    status NOT IN ('artifact_created', 'released', 'expired', 'deleted')
    OR (
      artifact_storage_ref IS NOT NULL AND artifact_checksum_sha256 IS NOT NULL
      AND included_count IS NOT NULL AND excluded_count IS NOT NULL AND redacted_count IS NOT NULL
      AND artifact_created_at IS NOT NULL AND expires_at IS NOT NULL
    )
  ),
  CONSTRAINT tenant_export_jobs_lease_facts_chk CHECK (
    (
      lease_owner_hash IS NULL AND lease_acquired_at IS NULL
      AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL
    ) OR (
      lease_owner_hash ~ '^[0-9a-f]{64}$'
      AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_acquired_at <= lease_heartbeat_at
      AND lease_heartbeat_at < lease_expires_at
      AND lease_expires_at <= lease_heartbeat_at + pg_catalog.interval '15 minutes'
    )
  ),
  CONSTRAINT tenant_export_jobs_correlation_id_chk CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  CONSTRAINT tenant_export_jobs_unique_idempotency UNIQUE (tenant_id, operation, idempotency_key_hash)
);

COMMENT ON TABLE public.tenant_export_jobs IS
  'Tenant-scoped asynchronous export ledger. It stores metadata and a private artifact locator, never artifact bytes.';
COMMENT ON COLUMN public.tenant_export_jobs.requester_auth_identity_id IS
  'Identity selector validated against the active membership or support grant by the guard trigger; the selector alone is not authority.';
COMMENT ON COLUMN public.tenant_export_jobs.artifact_storage_ref IS
  'Private tenant key in the fixed tenants/{tenant}/exports/{job}/filename namespace; never a URL or public path.';
COMMENT ON COLUMN public.tenant_export_jobs.lease_owner_hash IS
  'Lowercase digest of the worker owner identity; no worker credential is persisted.';

CREATE INDEX idx_tenant_export_jobs_tenant_history
  ON public.tenant_export_jobs (tenant_id, created_at DESC, id);
CREATE INDEX idx_tenant_export_jobs_queue
  ON public.tenant_export_jobs (tenant_id, status, next_retry_at, created_at);
CREATE INDEX idx_tenant_export_jobs_lease
  ON public.tenant_export_jobs (tenant_id, status, lease_expires_at, lease_generation);
CREATE INDEX idx_tenant_export_jobs_expiry
  ON public.tenant_export_jobs (tenant_id, status, expires_at);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_export_jobs_guard_and_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_eligible boolean;
  cleanup_transition boolean;
BEGIN
  requester_eligible := false;
  IF NEW.requester_membership_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_memberships AS membership
      JOIN public.tenant_role_bindings AS binding
        ON binding.tenant_id = membership.tenant_id
       AND binding.membership_id = membership.id
      WHERE membership.tenant_id = NEW.tenant_id
        AND membership.id = NEW.requester_membership_id
        AND membership.auth_identity_id = NEW.requester_auth_identity_id
        AND membership.status = 'active'
        AND (membership.workspace_id IS NULL OR membership.workspace_id IS NOT DISTINCT FROM NEW.workspace_id)
        AND binding.role IN ('owner', 'admin')
        AND binding.revoked_at IS NULL
        AND binding.valid_from <= pg_catalog.clock_timestamp()
    ) INTO requester_eligible;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.support_access_grants AS grant_row
      JOIN public.support_access_grant_permissions AS permission_row
        ON permission_row.grant_id = grant_row.id
       AND permission_row.permission = 'data:export'
      WHERE grant_row.id = NEW.support_access_grant_id
        AND grant_row.tenant_id = NEW.tenant_id
        AND grant_row.support_actor_auth_identity_id = NEW.requester_auth_identity_id
        AND (grant_row.workspace_id IS NULL OR grant_row.workspace_id IS NOT DISTINCT FROM NEW.workspace_id)
        AND grant_row.state = 'approved'
        AND grant_row.revoked_at IS NULL
        AND grant_row.starts_at <= pg_catalog.clock_timestamp()
        AND pg_catalog.clock_timestamp() < grant_row.expires_at
    ) INTO requester_eligible;
  END IF;

  cleanup_transition := false;
  IF TG_OP = 'UPDATE' THEN
    cleanup_transition := OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('failed', 'canceled', 'expired', 'deleted');
  END IF;
  IF NOT requester_eligible AND NOT cleanup_transition THEN
    RAISE EXCEPTION 'export requester is not currently eligible for this job side effect';
  END IF;

  IF TG_OP = 'INSERT' AND (
    NEW.status IS DISTINCT FROM 'requested'
    OR NEW.snapshot_at IS NOT NULL
    OR NEW.artifact_storage_ref IS NOT NULL OR NEW.artifact_checksum_sha256 IS NOT NULL
    OR NEW.included_count IS NOT NULL OR NEW.excluded_count IS NOT NULL OR NEW.redacted_count IS NOT NULL
    OR NEW.artifact_created_at IS NOT NULL OR NEW.expires_at IS NOT NULL
    OR NEW.error_code IS NOT NULL OR NEW.error_message IS NOT NULL OR NEW.next_retry_at IS NOT NULL
    OR NEW.retry_count <> 0 OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0
    OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'export job must be inserted in the exact requested initial state';
  END IF;

  IF NEW.artifact_storage_ref IS NOT NULL
     AND NEW.artifact_storage_ref NOT LIKE 'tenants/' || NEW.tenant_id::text || '/exports/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'export artifact reference is outside the job tenant namespace';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'export job id is immutable'; END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'export job tenant_id is immutable'; END IF;
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'export job workspace_id is immutable'; END IF;
    IF NEW.operation IS DISTINCT FROM OLD.operation THEN RAISE EXCEPTION 'export job operation is immutable'; END IF;
    IF NEW.requester_auth_identity_id IS DISTINCT FROM OLD.requester_auth_identity_id THEN RAISE EXCEPTION 'export job requester identity is immutable'; END IF;
    IF NEW.requester_membership_id IS DISTINCT FROM OLD.requester_membership_id OR NEW.support_access_grant_id IS DISTINCT FROM OLD.support_access_grant_id THEN RAISE EXCEPTION 'export job requester authority reference is immutable'; END IF;
    IF NEW.scope_hash IS DISTINCT FROM OLD.scope_hash OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash THEN RAISE EXCEPTION 'export job request hashes are immutable'; END IF;
    IF NEW.policy_version IS DISTINCT FROM OLD.policy_version OR NEW.manifest_version IS DISTINCT FROM OLD.manifest_version OR NEW.schema_version IS DISTINCT FROM OLD.schema_version OR NEW.requested_format IS DISTINCT FROM OLD.requested_format THEN RAISE EXCEPTION 'export job contract facts are immutable'; END IF;
    IF NEW.max_retries IS DISTINCT FROM OLD.max_retries THEN RAISE EXCEPTION 'export job max_retries is immutable'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id THEN RAISE EXCEPTION 'export job identity and audit facts are immutable'; END IF;
    IF OLD.snapshot_at IS NOT NULL AND NEW.snapshot_at IS DISTINCT FROM OLD.snapshot_at THEN RAISE EXCEPTION 'export snapshot fact is immutable once set'; END IF;
    IF OLD.artifact_storage_ref IS NOT NULL AND (
      NEW.artifact_storage_ref IS DISTINCT FROM OLD.artifact_storage_ref OR NEW.artifact_checksum_sha256 IS DISTINCT FROM OLD.artifact_checksum_sha256
      OR NEW.included_count IS DISTINCT FROM OLD.included_count OR NEW.excluded_count IS DISTINCT FROM OLD.excluded_count
      OR NEW.redacted_count IS DISTINCT FROM OLD.redacted_count OR NEW.artifact_created_at IS DISTINCT FROM OLD.artifact_created_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    ) THEN RAISE EXCEPTION 'export artifact facts are immutable once set'; END IF;

    IF NOT (
      OLD.status = NEW.status
      OR (OLD.status = 'requested' AND NEW.status IN ('snapshotting', 'failed', 'canceled'))
      OR (OLD.status = 'snapshotting' AND NEW.status IN ('redacting', 'retry_wait', 'failed', 'canceled'))
      OR (OLD.status = 'redacting' AND NEW.status IN ('artifact_created', 'retry_wait', 'failed', 'canceled'))
      OR (OLD.status = 'artifact_created' AND NEW.status IN ('released', 'retry_wait', 'failed', 'canceled'))
      OR (OLD.status = 'released' AND NEW.status IN ('expired', 'deleted'))
      OR (OLD.status = 'retry_wait' AND NEW.status IN ('snapshotting', 'redacting', 'artifact_created', 'failed', 'canceled'))
      OR (OLD.status = 'failed' AND NEW.status IN ('retry_wait', 'canceled'))
      OR (OLD.status = 'expired' AND NEW.status = 'deleted')
    ) THEN RAISE EXCEPTION 'export job state transition is invalid'; END IF;

    IF OLD.status IS DISTINCT FROM 'retry_wait' AND NEW.status = 'retry_wait' THEN
      IF OLD.retry_count >= 10 OR NEW.retry_count <> OLD.retry_count + 1 THEN
        RAISE EXCEPTION 'export job retry_count must increment exactly once when entering retry_wait';
      END IF;
    ELSIF NEW.retry_count IS DISTINCT FROM OLD.retry_count THEN
      RAISE EXCEPTION 'export job retry_count is immutable outside retry_wait entry';
    END IF;

    IF NEW.lease_generation < OLD.lease_generation THEN
      RAISE EXCEPTION 'export job lease generation is stale or skipped';
    END IF;
    IF OLD.lease_generation < 2147483647 AND NEW.lease_generation > OLD.lease_generation + 1 THEN
      RAISE EXCEPTION 'export job lease generation is stale or skipped';
    END IF;
    IF OLD.lease_generation = 2147483647 AND NEW.lease_generation > OLD.lease_generation THEN
      RAISE EXCEPTION 'export job lease generation is stale or skipped';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN
      RAISE EXCEPTION 'export job lease acquisition requires a new generation';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NULL
       AND (NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL) THEN
      RAISE EXCEPTION 'export job lease release must clear all lease facts';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL
       AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS DISTINCT FROM OLD.lease_owner_hash THEN
      RAISE EXCEPTION 'export job lease owner cannot change within a generation';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL
       AND NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at THEN
      RAISE EXCEPTION 'export job lease acquired_at cannot change within a generation';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL
       AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN
      RAISE EXCEPTION 'export job lease heartbeat cannot move backward';
    END IF;
    IF OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1 AND OLD.lease_owner_hash IS NOT NULL AND OLD.lease_expires_at > pg_catalog.now() THEN
      RAISE EXCEPTION 'export job lease generation cannot replace a live lease';
    END IF;
    IF OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1 AND NEW.lease_owner_hash IS NULL THEN
      RAISE EXCEPTION 'export job new lease generation requires an owner';
    END IF;
    IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL
       AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN
      RAISE EXCEPTION 'export job lease expiry cannot move backward within a generation';
    END IF;
  END IF;

  IF NEW.status IN ('artifact_created', 'released', 'expired', 'deleted') AND NEW.artifact_storage_ref IS NULL THEN
    RAISE EXCEPTION 'export job completed state requires artifact facts';
  END IF;
  IF NEW.status = 'expired' AND NEW.expires_at > pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'export job cannot expire before artifact expiry';
  END IF;
  IF NEW.status = 'retry_wait' AND (NEW.next_retry_at IS NULL OR NEW.error_code IS NULL OR NEW.error_message IS NULL OR NEW.retry_count >= NEW.max_retries) THEN
    RAISE EXCEPTION 'export job retry state requires bounded retry facts';
  END IF;
  IF NEW.status IN ('failed', 'canceled') AND (NEW.error_code IS NULL OR NEW.error_message IS NULL OR NEW.next_retry_at IS NOT NULL) THEN
    RAISE EXCEPTION 'export job failed or canceled state requires a safe terminal error';
  END IF;

  IF TG_OP = 'UPDATE' THEN NEW.updated_at = pg_catalog.now(); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_tenant_export_jobs_guard_and_touch
BEFORE INSERT OR UPDATE ON public.tenant_export_jobs
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_tenant_export_jobs_guard_and_touch();

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_export_jobs_guard_and_touch() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_export_jobs_guard_and_touch() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_export_jobs_guard_and_touch() FROM authenticated';
  END IF;
END;
$$;
