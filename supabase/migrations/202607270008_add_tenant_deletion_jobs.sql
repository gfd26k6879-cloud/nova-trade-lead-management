-- T-024: tenant-scoped deletion ledger only. This migration records work and
-- receipts; it never deletes tenant data, calls a provider, or enables RLS.

CREATE TABLE public.tenant_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  operation text NOT NULL DEFAULT 'tenant_data_deletion' CHECK (operation = 'tenant_data_deletion'),
  scope_kind text NOT NULL CHECK (scope_kind IN ('tenant', 'workspace', 'resource_set')),
  scope_selector_hash text NOT NULL CHECK (scope_selector_hash ~ '^[0-9a-f]{64}$'),
  requested_by_auth_identity_id uuid NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  verified_by_auth_identity_id uuid,
  verified_by_membership_id uuid,
  verified_at timestamptz,
  approved_by_auth_identity_id uuid,
  approved_by_membership_id uuid,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'verified', 'scheduled', 'running', 'retry_wait',
    'failed', 'canceled', 'primary_deleted', 'backup_aging', 'completed'
  )),
  policy_version text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{4,127}$'),
  policy_snapshot_hash text NOT NULL CHECK (policy_snapshot_hash ~ '^[0-9a-f]{64}$'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  legal_hold_status text NOT NULL DEFAULT 'none' CHECK (legal_hold_status IN ('none', 'active_subset', 'released', 'unresolved')),
  legal_hold_snapshot_hash text,
  held_scope_hash text,
  uncovered_scope_hash text,
  freeze_handoff_status text NOT NULL DEFAULT 'not_started' CHECK (freeze_handoff_status IN ('not_started', 'requested', 'acknowledged', 'failed')),
  access_revocation_handoff_status text NOT NULL DEFAULT 'not_started' CHECK (access_revocation_handoff_status IN ('not_started', 'requested', 'acknowledged', 'failed')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 10),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  next_retry_at timestamptz,
  lease_owner_hash text CHECK (lease_owner_hash IS NULL OR lease_owner_hash ~ '^[0-9a-f]{64}$'),
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation BETWEEN 0 AND 2147483647),
  lease_acquired_at timestamptz,
  lease_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  audit_event_id uuid NOT NULL,
  error_code text CHECK (error_code IS NULL OR error_code IN ('DELETE_SCOPE_INVALID','DELETE_POLICY_BLOCKED','DELETE_CHECKPOINT_RETRYABLE','DELETE_CHECKPOINT_FAILED','DELETE_PROVIDER_RESPONSE_INVALID','DELETE_PROVIDER_OUTAGE','DELETE_TIMEOUT','DELETE_CANCELED','DELETE_HOLD_UNRESOLVED','DELETE_REPLAY_CONFLICT','DELETE_INTERNAL')),
  error_fingerprint text CHECK (error_fingerprint IS NULL OR error_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  primary_deleted_at timestamptz,
  backup_aging_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  backup_expiry_target_at timestamptz,
  CONSTRAINT tenant_deletion_jobs_workspace_tenant_fkey FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_requester_membership_fkey FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_verified_membership_fkey FOREIGN KEY (tenant_id, verified_by_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_approved_membership_fkey FOREIGN KEY (tenant_id, approved_by_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_scope_shape_chk CHECK ((scope_kind = 'tenant' AND workspace_id IS NULL) OR (scope_kind = 'workspace' AND workspace_id IS NOT NULL) OR scope_kind = 'resource_set'),
  CONSTRAINT tenant_deletion_jobs_status_attribution_chk CHECK (
    (verified_at IS NULL AND verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL)
    OR (status <> 'requested' AND verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL)
  ),
  CONSTRAINT tenant_deletion_jobs_approval_chk CHECK (
    (approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL)
    OR (status NOT IN ('requested', 'verified') AND approved_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT tenant_deletion_jobs_hold_shape_chk CHECK (
    (legal_hold_status = 'none' AND legal_hold_snapshot_hash IS NULL AND held_scope_hash IS NULL AND uncovered_scope_hash IS NULL)
    OR (legal_hold_status IN ('active_subset', 'released') AND legal_hold_snapshot_hash ~ '^[0-9a-f]{64}$' AND held_scope_hash ~ '^[0-9a-f]{64}$' AND uncovered_scope_hash ~ '^[0-9a-f]{64}$')
    OR (legal_hold_status = 'unresolved' AND legal_hold_snapshot_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT tenant_deletion_jobs_hold_hash_shape_chk CHECK (
    (legal_hold_snapshot_hash IS NULL OR legal_hold_snapshot_hash ~ '^[0-9a-f]{64}$')
    AND (held_scope_hash IS NULL OR held_scope_hash ~ '^[0-9a-f]{64}$')
    AND (uncovered_scope_hash IS NULL OR uncovered_scope_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT tenant_deletion_jobs_lease_shape_chk CHECK (
    (lease_owner_hash IS NULL AND ((lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL) OR (lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND lease_expires_at <= lease_heartbeat_at + interval '15 minutes')))
    OR (lease_owner_hash IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at
      AND lease_expires_at <= lease_heartbeat_at + interval '15 minutes')
  ),
  CONSTRAINT tenant_deletion_jobs_lease_status_chk CHECK (
    status = 'running'
    OR lease_owner_hash IS NULL
  ),
  CONSTRAINT tenant_deletion_jobs_timestamp_order_chk CHECK (
    created_at <= updated_at
    AND (scheduled_at IS NULL OR scheduled_at >= created_at)
    AND (verified_at IS NULL OR verified_at >= created_at)
    AND (approved_at IS NULL OR (verified_at IS NOT NULL AND approved_at >= verified_at))
    AND (scheduled_at IS NULL OR (approved_at IS NOT NULL AND scheduled_at >= approved_at))
    AND (started_at IS NULL OR (scheduled_at IS NOT NULL AND started_at >= scheduled_at))
    AND (primary_deleted_at IS NULL OR (started_at IS NOT NULL AND primary_deleted_at >= started_at))
    AND (backup_aging_at IS NULL OR (primary_deleted_at IS NOT NULL AND backup_aging_at >= primary_deleted_at))
    AND (completed_at IS NULL OR (backup_aging_at IS NOT NULL AND completed_at >= backup_aging_at))
    AND (canceled_at IS NULL OR canceled_at >= created_at)
  ),
  CONSTRAINT tenant_deletion_jobs_status_exact_shape_chk CHECK (
    (status <> 'requested' OR (verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL AND verified_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL AND freeze_handoff_status = 'not_started' AND access_revocation_handoff_status = 'not_started'))
    AND (status <> 'verified' OR (verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND verified_at IS NOT NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL))
    AND (status <> 'scheduled' OR (verified_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND approved_at IS NOT NULL AND scheduled_at IS NOT NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL))
    AND (status NOT IN ('running','retry_wait','failed') OR (verified_at IS NOT NULL AND approved_at IS NOT NULL AND scheduled_at IS NOT NULL AND started_at IS NOT NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND backup_expiry_target_at IS NULL))
    AND (status <> 'primary_deleted' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL))
    AND (status <> 'backup_aging' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NOT NULL AND completed_at IS NULL AND canceled_at IS NULL))
    AND (status <> 'completed' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NOT NULL AND completed_at IS NOT NULL AND canceled_at IS NULL))
  ),
  CONSTRAINT tenant_deletion_jobs_status_timestamp_chk CHECK (
    (status NOT IN ('scheduled', 'running', 'retry_wait', 'failed', 'primary_deleted', 'backup_aging', 'completed') OR scheduled_at IS NOT NULL)
    AND (status NOT IN ('running', 'retry_wait', 'failed', 'primary_deleted', 'backup_aging', 'completed') OR started_at IS NOT NULL)
    AND (status NOT IN ('primary_deleted', 'backup_aging', 'completed') OR primary_deleted_at IS NOT NULL)
    AND (status NOT IN ('backup_aging', 'completed') OR backup_aging_at IS NOT NULL)
    AND (status <> 'completed' OR completed_at IS NOT NULL)
    AND (status <> 'canceled' OR canceled_at IS NOT NULL)
    AND ((status IN ('requested','verified','scheduled','running','retry_wait','failed','canceled') AND backup_expiry_target_at IS NULL) OR (status IN ('primary_deleted','backup_aging','completed') AND backup_expiry_target_at IS NOT NULL AND backup_expiry_target_at >= primary_deleted_at AND backup_expiry_target_at <= primary_deleted_at + interval '35 days'))
  ),
  CONSTRAINT tenant_deletion_jobs_canceled_exact_shape_chk CHECK (
    status <> 'canceled' OR (
      canceled_at IS NOT NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL
      AND retry_count = 0 AND next_retry_at IS NULL
      AND lease_owner_hash IS NULL AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL
      AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL
      AND (
        (verified_at IS NULL AND verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL AND approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND scheduled_at IS NULL)
        OR (verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND scheduled_at IS NULL)
        OR (verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND scheduled_at IS NOT NULL)
      )
    )
  ),
  CONSTRAINT tenant_deletion_jobs_retry_shape_chk CHECK (
    (status = 'retry_wait' AND next_retry_at IS NOT NULL AND retry_count <= max_retries AND error_code = 'DELETE_CHECKPOINT_RETRYABLE' AND error_fingerprint IS NOT NULL)
    OR (status = 'failed' AND next_retry_at IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL)
    OR (status NOT IN ('retry_wait','failed') AND next_retry_at IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)
  ),
  CONSTRAINT tenant_deletion_jobs_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT tenant_deletion_jobs_unique_idempotency UNIQUE (tenant_id, operation, scope_selector_hash, idempotency_key_hash)
);

CREATE INDEX idx_tenant_deletion_jobs_tenant_history ON public.tenant_deletion_jobs (tenant_id, created_at DESC, id);
CREATE INDEX idx_tenant_deletion_jobs_queue ON public.tenant_deletion_jobs (tenant_id, status, next_retry_at, created_at);
CREATE INDEX idx_tenant_deletion_jobs_lease ON public.tenant_deletion_jobs (tenant_id, status, lease_expires_at, lease_generation);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_jobs_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  authored_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.requested_by_membership_id
      AND membership.auth_identity_id = NEW.requested_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'requester identity does not match membership'; END IF;
  IF NEW.verified_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.verified_by_membership_id
      AND membership.auth_identity_id = NEW.verified_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'verifier identity does not match membership'; END IF;
  IF NEW.approved_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.approved_by_membership_id
      AND membership.auth_identity_id = NEW.approved_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'approver identity does not match membership'; END IF;
  IF NEW.status <> 'requested'
     OR NEW.verified_by_auth_identity_id IS NOT NULL OR NEW.verified_by_membership_id IS NOT NULL OR NEW.verified_at IS NOT NULL
     OR NEW.approved_by_auth_identity_id IS NOT NULL OR NEW.approved_by_membership_id IS NOT NULL OR NEW.approved_at IS NOT NULL
     OR NEW.scheduled_at IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.primary_deleted_at IS NOT NULL OR NEW.backup_aging_at IS NOT NULL
     OR NEW.completed_at IS NOT NULL OR NEW.canceled_at IS NOT NULL OR NEW.retry_count <> 0 OR NEW.next_retry_at IS NOT NULL
     OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0 OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
     OR NEW.error_code IS NOT NULL OR NEW.error_fingerprint IS NOT NULL OR NEW.backup_expiry_target_at IS NOT NULL
     OR NEW.freeze_handoff_status <> 'not_started' OR NEW.access_revocation_handoff_status <> 'not_started'
  THEN RAISE EXCEPTION 'deletion jobs must be inserted in the requested state'; END IF;
  authored_at := pg_catalog.now();
  NEW.created_at = authored_at;
  NEW.updated_at = authored_at;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_jobs_insert_guard BEFORE INSERT ON public.tenant_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_jobs_insert_guard();

CREATE TABLE public.tenant_deletion_checkpoints (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  job_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  store_class text NOT NULL CHECK (store_class IN (
    'cache_idempotency', 'search_embeddings', 'queues_leases', 'agent_context',
    'extracted_derivatives_previews_scanner', 'object_quarantine_storage',
    'primary_database_negative_verification', 'provider_external_copy_requests',
    'logs_telemetry_aggregates', 'backup_aging'
  )),
  required boolean NOT NULL DEFAULT true CHECK (required),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'retryable', 'failed', 'held', 'exempted')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 10),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 0 AND 10),
  lease_owner_hash text CHECK (lease_owner_hash IS NULL OR lease_owner_hash ~ '^[0-9a-f]{64}$'),
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation BETWEEN 0 AND 2147483647),
  lease_acquired_at timestamptz,
  lease_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  opaque_target_hash text NOT NULL CHECK (opaque_target_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[0-9a-f]{64}$'),
  provider_operation_hash text CHECK (provider_operation_hash IS NULL OR provider_operation_hash ~ '^[0-9a-f]{64}$'),
  exemption_reason text CHECK (exemption_reason IS NULL OR exemption_reason IN ('legal_hold_covered', 'not_applicable_by_policy', 'no_provider_copy_evidenced', 'backup_retention_only')),
  exemption_approved boolean NOT NULL DEFAULT false,
  observed_count integer CHECK (observed_count IS NULL OR observed_count >= 0),
  expected_count integer CHECK (expected_count IS NULL OR expected_count >= 0),
  reason_code text CHECK (reason_code IS NULL OR reason_code IN ('LEGAL_HOLD')),
  error_code text CHECK (error_code IS NULL OR error_code IN ('DELETE_CHECKPOINT_RETRYABLE','DELETE_CHECKPOINT_FAILED','DELETE_PROVIDER_RESPONSE_INVALID','DELETE_TIMEOUT','DELETE_INTERNAL')),
  error_fingerprint text CHECK (error_fingerprint IS NULL OR error_fingerprint ~ '^[0-9a-f]{64}$'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_deletion_checkpoints_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES public.tenant_deletion_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoints_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoints_status_shape_chk CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)
    OR (status = 'retryable' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code IS NULL AND error_code = 'DELETE_CHECKPOINT_RETRYABLE' AND error_fingerprint IS NOT NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL)
    OR (status = 'held' AND started_at IS NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code = 'LEGAL_HOLD' AND error_code IS NULL AND error_fingerprint IS NULL)
    OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND receipt_hash IS NOT NULL AND exemption_reason IS NULL AND NOT exemption_approved AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)
    OR (status = 'exempted' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND receipt_hash IS NULL AND exemption_reason IS NOT NULL AND exemption_approved AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)
  ),
  CONSTRAINT tenant_deletion_checkpoints_exemption_shape_chk CHECK ((status = 'exempted') = (exemption_reason IS NOT NULL AND exemption_approved)),
  CONSTRAINT tenant_deletion_checkpoints_exemption_store_chk CHECK (exemption_reason IS NULL OR (store_class = 'backup_aging' AND exemption_reason = 'backup_retention_only') OR (store_class = 'provider_external_copy_requests' AND exemption_reason = 'no_provider_copy_evidenced') OR (exemption_reason IN ('legal_hold_covered','not_applicable_by_policy') AND store_class <> 'backup_aging')),
  CONSTRAINT tenant_deletion_checkpoints_lease_shape_chk CHECK ((lease_owner_hash IS NULL AND ((lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL) OR (lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND lease_expires_at <= lease_heartbeat_at + interval '15 minutes'))) OR (status = 'running' AND lease_owner_hash IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND lease_expires_at <= lease_heartbeat_at + interval '15 minutes')),
  CONSTRAINT tenant_deletion_checkpoints_timestamp_order_chk CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
  CONSTRAINT tenant_deletion_checkpoints_attempt_shape_chk CHECK (attempt <= max_attempts),
  CONSTRAINT tenant_deletion_checkpoints_tenant_id_job_id_id_unique UNIQUE (tenant_id, job_id, id),
  CONSTRAINT tenant_deletion_checkpoints_unique_store UNIQUE (job_id, store_class)
);

CREATE INDEX idx_tenant_deletion_checkpoints_queue ON public.tenant_deletion_checkpoints (tenant_id, status, updated_at);
CREATE INDEX idx_tenant_deletion_checkpoints_job ON public.tenant_deletion_checkpoints (tenant_id, job_id, store_class);

CREATE TABLE public.tenant_deletion_checkpoint_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkpoint_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  job_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'complete', 'retryable', 'failed', 'held', 'exempted')),
  attempt integer NOT NULL CHECK (attempt BETWEEN 0 AND 10),
  lease_generation integer NOT NULL CHECK (lease_generation BETWEEN 0 AND 2147483647),
  receipt_hash text CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[0-9a-f]{64}$'),
  reason_code text CHECK (reason_code IS NULL OR reason_code IN ('LEGAL_HOLD')),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_deletion_checkpoint_events_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES public.tenant_deletion_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
  ,CONSTRAINT tenant_deletion_checkpoint_events_checkpoint_fkey FOREIGN KEY (tenant_id, job_id, checkpoint_id) REFERENCES public.tenant_deletion_checkpoints (tenant_id, job_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoint_events_duplicate_guard UNIQUE (checkpoint_id, attempt, lease_generation, status)
);

CREATE INDEX idx_tenant_deletion_checkpoint_events_history ON public.tenant_deletion_checkpoint_events (tenant_id, job_id, checkpoint_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_checkpoint_events_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.occurred_at = pg_catalog.now();
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_deletion_checkpoints AS checkpoint
    WHERE checkpoint.id = NEW.checkpoint_id
      AND checkpoint.tenant_id = NEW.tenant_id
      AND checkpoint.job_id = NEW.job_id
      AND checkpoint.status = NEW.status
      AND checkpoint.attempt = NEW.attempt
      AND checkpoint.lease_generation = NEW.lease_generation
      AND checkpoint.receipt_hash IS NOT DISTINCT FROM NEW.receipt_hash
      AND checkpoint.reason_code IS NOT DISTINCT FROM NEW.reason_code
  ) THEN RAISE EXCEPTION 'deletion event facts do not match the current checkpoint'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_checkpoint_events_insert_guard BEFORE INSERT ON public.tenant_deletion_checkpoint_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_checkpoint_events_insert_guard();

CREATE TABLE public.tenant_deletion_tombstones (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  scope_selector_hash text NOT NULL CHECK (scope_selector_hash ~ '^[0-9a-f]{64}$'),
  tenant_identity_hash text NOT NULL CHECK (tenant_identity_hash ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{4,127}$'),
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_deletion_tombstones_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES public.tenant_deletion_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_tombstones_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_tombstones_retention_chk CHECK (retention_until >= created_at + interval '7 years')
);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_jobs_guard_and_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.requested_by_membership_id
      AND membership.auth_identity_id = NEW.requested_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'requester identity does not match membership'; END IF;
  IF NEW.verified_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.verified_by_membership_id
      AND membership.auth_identity_id = NEW.verified_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'verifier identity does not match membership'; END IF;
  IF NEW.approved_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.approved_by_membership_id
      AND membership.auth_identity_id = NEW.approved_by_auth_identity_id
  ) THEN RAISE EXCEPTION 'approver identity does not match membership'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.operation IS DISTINCT FROM OLD.operation OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.scope_selector_hash IS DISTINCT FROM OLD.scope_selector_hash
     OR NEW.requested_by_auth_identity_id IS DISTINCT FROM OLD.requested_by_auth_identity_id OR NEW.requested_by_membership_id IS DISTINCT FROM OLD.requested_by_membership_id
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version OR NEW.policy_snapshot_hash IS DISTINCT FROM OLD.policy_snapshot_hash
     OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash OR NEW.max_retries IS DISTINCT FROM OLD.max_retries
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id
  THEN RAISE EXCEPTION 'deletion job identity and request facts are immutable'; END IF;
  IF NOT (OLD.status = NEW.status OR (OLD.status = 'requested' AND NEW.status IN ('verified', 'canceled')) OR (OLD.status = 'verified' AND NEW.status IN ('scheduled', 'canceled')) OR (OLD.status = 'scheduled' AND NEW.status IN ('running', 'canceled')) OR (OLD.status = 'running' AND NEW.status IN ('retry_wait', 'failed', 'primary_deleted')) OR (OLD.status = 'retry_wait' AND NEW.status IN ('running', 'failed')) OR (OLD.status = 'failed' AND NEW.status = 'retry_wait') OR (OLD.status = 'primary_deleted' AND NEW.status = 'backup_aging') OR (OLD.status = 'backup_aging' AND NEW.status = 'completed')) THEN RAISE EXCEPTION 'deletion job state transition is invalid'; END IF;
  IF NEW.status = 'canceled' AND (NEW.freeze_handoff_status <> 'not_started' OR NEW.access_revocation_handoff_status <> 'not_started' OR EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.id AND status <> 'pending')) THEN RAISE EXCEPTION 'deletion cancellation window is closed'; END IF;
  IF NEW.status = 'canceled' AND (NEW.started_at IS NOT NULL OR NEW.primary_deleted_at IS NOT NULL OR NEW.backup_aging_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR (OLD.status = 'requested' AND (NEW.verified_at IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL)) OR (OLD.status = 'verified' AND (NEW.approved_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL))) THEN RAISE EXCEPTION 'canceled job contains later truth'; END IF;
  IF NEW.verified_by_auth_identity_id IS DISTINCT FROM OLD.verified_by_auth_identity_id OR NEW.verified_by_membership_id IS DISTINCT FROM OLD.verified_by_membership_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    IF NOT (OLD.status = 'requested' AND NEW.status = 'verified') THEN RAISE EXCEPTION 'verification attribution is immutable'; END IF;
  END IF;
  IF NEW.approved_by_auth_identity_id IS DISTINCT FROM OLD.approved_by_auth_identity_id OR NEW.approved_by_membership_id IS DISTINCT FROM OLD.approved_by_membership_id OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    IF NOT (OLD.status = 'verified' AND NEW.status = 'scheduled') THEN RAISE EXCEPTION 'approval attribution is immutable'; END IF;
  END IF;
  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at AND NOT (OLD.status = 'verified' AND NEW.status = 'scheduled') THEN RAISE EXCEPTION 'schedule timestamp is immutable'; END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at AND NOT (OLD.status = 'scheduled' AND NEW.status = 'running') THEN RAISE EXCEPTION 'start timestamp is immutable'; END IF;
  IF NEW.primary_deleted_at IS DISTINCT FROM OLD.primary_deleted_at AND NOT (OLD.status = 'running' AND NEW.status = 'primary_deleted') THEN RAISE EXCEPTION 'primary deletion timestamp is immutable'; END IF;
  IF NEW.backup_expiry_target_at IS DISTINCT FROM OLD.backup_expiry_target_at AND NOT (OLD.status = 'running' AND NEW.status = 'primary_deleted') THEN RAISE EXCEPTION 'backup aging target is immutable'; END IF;
  IF NEW.backup_aging_at IS DISTINCT FROM OLD.backup_aging_at AND NOT (OLD.status = 'primary_deleted' AND NEW.status = 'backup_aging') THEN RAISE EXCEPTION 'backup aging timestamp is immutable'; END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NOT (OLD.status = 'backup_aging' AND NEW.status = 'completed') THEN RAISE EXCEPTION 'completion timestamp is immutable'; END IF;
  IF NEW.canceled_at IS DISTINCT FROM OLD.canceled_at AND NOT (NEW.status = 'canceled' AND OLD.status IN ('requested','verified','scheduled')) THEN RAISE EXCEPTION 'cancellation timestamp is immutable'; END IF;
  IF OLD.status = NEW.status AND (NEW.retry_count IS DISTINCT FROM OLD.retry_count OR NEW.next_retry_at IS DISTINCT FROM OLD.next_retry_at OR NEW.error_code IS DISTINCT FROM OLD.error_code OR NEW.error_fingerprint IS DISTINCT FROM OLD.error_fingerprint) THEN RAISE EXCEPTION 'same-state retry facts are immutable'; END IF;
  IF NOT ((OLD.freeze_handoff_status = NEW.freeze_handoff_status) OR (OLD.freeze_handoff_status = 'not_started' AND NEW.freeze_handoff_status IN ('requested','failed')) OR (OLD.freeze_handoff_status = 'requested' AND NEW.freeze_handoff_status IN ('requested','acknowledged','failed')) OR (OLD.freeze_handoff_status = 'acknowledged' AND NEW.freeze_handoff_status = 'acknowledged') OR (OLD.freeze_handoff_status = 'failed' AND NEW.freeze_handoff_status IN ('failed','requested'))) THEN RAISE EXCEPTION 'freeze handoff transition is invalid'; END IF;
  IF NOT ((OLD.access_revocation_handoff_status = NEW.access_revocation_handoff_status) OR (OLD.access_revocation_handoff_status = 'not_started' AND NEW.access_revocation_handoff_status IN ('requested','failed')) OR (OLD.access_revocation_handoff_status = 'requested' AND NEW.access_revocation_handoff_status IN ('requested','acknowledged','failed')) OR (OLD.access_revocation_handoff_status = 'acknowledged' AND NEW.access_revocation_handoff_status = 'acknowledged') OR (OLD.access_revocation_handoff_status = 'failed' AND NEW.access_revocation_handoff_status IN ('failed','requested'))) THEN RAISE EXCEPTION 'access revocation handoff transition is invalid'; END IF;
  IF OLD.legal_hold_status = NEW.legal_hold_status AND (OLD.legal_hold_snapshot_hash IS DISTINCT FROM NEW.legal_hold_snapshot_hash OR OLD.held_scope_hash IS DISTINCT FROM NEW.held_scope_hash OR OLD.uncovered_scope_hash IS DISTINCT FROM NEW.uncovered_scope_hash) THEN RAISE EXCEPTION 'same legal hold status cannot rewrite its reviewed snapshot'; END IF;
  IF OLD.legal_hold_status = 'active_subset' AND NEW.legal_hold_status = 'released' AND (OLD.legal_hold_snapshot_hash IS DISTINCT FROM NEW.legal_hold_snapshot_hash OR OLD.held_scope_hash IS DISTINCT FROM NEW.held_scope_hash OR OLD.uncovered_scope_hash IS DISTINCT FROM NEW.uncovered_scope_hash) THEN RAISE EXCEPTION 'legal hold release must preserve its reviewed snapshot'; END IF;
  IF NOT ((OLD.legal_hold_status = NEW.legal_hold_status) OR (OLD.legal_hold_status = 'none' AND NEW.legal_hold_status IN ('active_subset','unresolved')) OR (OLD.legal_hold_status = 'active_subset' AND NEW.legal_hold_status IN ('released','unresolved')) OR (OLD.legal_hold_status = 'unresolved' AND NEW.legal_hold_status = 'unresolved') OR (OLD.legal_hold_status = 'unresolved' AND NEW.legal_hold_status = 'active_subset' AND NEW.legal_hold_snapshot_hash IS DISTINCT FROM OLD.legal_hold_snapshot_hash) OR (OLD.legal_hold_status = 'released' AND NEW.legal_hold_status = 'released') OR (OLD.legal_hold_status = 'released' AND NEW.legal_hold_status = 'active_subset' AND NEW.legal_hold_snapshot_hash IS DISTINCT FROM OLD.legal_hold_snapshot_hash)) THEN RAISE EXCEPTION 'legal hold transition is invalid'; END IF;
  IF NEW.lease_generation < OLD.lease_generation OR NEW.lease_generation > OLD.lease_generation + 1 THEN RAISE EXCEPTION 'deletion lease generation is stale or skipped'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN RAISE EXCEPTION 'deletion lease acquisition requires a new generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation + 1 AND (NEW.lease_owner_hash IS NULL OR NEW.lease_acquired_at IS NULL OR NEW.lease_heartbeat_at IS NULL OR NEW.lease_expires_at IS NULL OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT DISTINCT FROM OLD.lease_owner_hash) OR (OLD.lease_expires_at IS NOT NULL AND NEW.lease_acquired_at < OLD.lease_expires_at)) THEN RAISE EXCEPTION 'deletion lease generation must fence an acquisition after expiry'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS DISTINCT FROM OLD.lease_owner_hash THEN RAISE EXCEPTION 'deletion lease owner cannot change within a generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at THEN RAISE EXCEPTION 'deletion lease acquisition time cannot change within a generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN RAISE EXCEPTION 'deletion lease heartbeat cannot move backward'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN RAISE EXCEPTION 'deletion lease expiry cannot move backward'; END IF;
  IF OLD.status <> 'retry_wait' AND NEW.status = 'retry_wait' AND (NEW.retry_count <> OLD.retry_count + 1 OR NEW.retry_count > NEW.max_retries) THEN RAISE EXCEPTION 'deletion retry bound or increment is invalid'; END IF;
  IF OLD.status = 'retry_wait' AND NEW.status <> 'retry_wait' AND NEW.retry_count IS DISTINCT FROM OLD.retry_count THEN RAISE EXCEPTION 'deletion retry count is immutable outside retry entry'; END IF;
  IF NEW.status IN ('running', 'retry_wait', 'failed', 'primary_deleted', 'backup_aging', 'completed') AND ((SELECT count(*) FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.id) <> 10 OR EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.id AND store_class NOT IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging'))) THEN RAISE EXCEPTION 'exact deletion checkpoint store set is required before execution'; END IF;
  IF NEW.status IN ('primary_deleted', 'backup_aging', 'completed') AND EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.id AND required AND store_class <> 'backup_aging' AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved))) THEN RAISE EXCEPTION 'primary deletion requires every required primary checkpoint'; END IF;
  IF NEW.status = 'completed' AND EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.id AND required AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved AND (store_class <> 'backup_aging' OR exemption_reason = 'backup_retention_only')))) THEN RAISE EXCEPTION 'completion requires every required checkpoint'; END IF;
  IF NEW.status = 'completed' AND NOT EXISTS (SELECT 1 FROM public.tenant_deletion_tombstones WHERE job_id = NEW.id) THEN RAISE EXCEPTION 'completion requires a content-minimized tombstone'; END IF;
  IF NEW.legal_hold_status = 'unresolved' AND NEW.status <> 'requested' THEN RAISE EXCEPTION 'unresolved legal hold blocks deletion execution'; END IF;
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_novatrade_tenant_deletion_jobs_guard_and_touch BEFORE UPDATE ON public.tenant_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_jobs_guard_and_touch();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_jobs_no_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN RAISE EXCEPTION 'deletion ledger rows are append-only'; END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_jobs_no_delete BEFORE DELETE ON public.tenant_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_jobs_no_delete();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_checkpoints_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.store_class IS DISTINCT FROM OLD.store_class OR NEW.required IS DISTINCT FROM OLD.required OR NEW.opaque_target_hash IS DISTINCT FROM OLD.opaque_target_hash OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts THEN RAISE EXCEPTION 'deletion checkpoint identity and retry facts are immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NOT DISTINCT FROM NEW.workspace_id) THEN RAISE EXCEPTION 'deletion checkpoint workspace does not match its job'; END IF;
  IF NEW.exemption_reason = 'legal_hold_covered' AND NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.legal_hold_status IN ('active_subset','released')) THEN RAISE EXCEPTION 'legal hold exemption requires a reviewed hold snapshot'; END IF;
  IF NOT (OLD.status = NEW.status OR (OLD.status = 'pending' AND NEW.status IN ('running','held','exempted')) OR (OLD.status = 'running' AND NEW.status IN ('complete','retryable','failed','held','exempted')) OR (OLD.status = 'retryable' AND NEW.status IN ('running','failed')) OR (OLD.status = 'held' AND NEW.status = 'pending') OR (OLD.status = 'failed' AND NEW.status = 'retryable')) THEN RAISE EXCEPTION 'deletion checkpoint state transition is invalid'; END IF;
  IF NEW.attempt IS DISTINCT FROM OLD.attempt AND NOT (NEW.status = 'retryable' AND OLD.status IN ('running','failed') AND NEW.attempt = OLD.attempt + 1) THEN RAISE EXCEPTION 'deletion checkpoint attempt is stale or skipped'; END IF;
  IF OLD.status IN ('complete','exempted') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.attempt IS DISTINCT FROM OLD.attempt OR NEW.lease_generation IS DISTINCT FROM OLD.lease_generation OR NEW.lease_owner_hash IS DISTINCT FROM OLD.lease_owner_hash OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash OR NEW.provider_operation_hash IS DISTINCT FROM OLD.provider_operation_hash OR NEW.exemption_reason IS DISTINCT FROM OLD.exemption_reason OR NEW.exemption_approved IS DISTINCT FROM OLD.exemption_approved OR NEW.observed_count IS DISTINCT FROM OLD.observed_count OR NEW.expected_count IS DISTINCT FROM OLD.expected_count OR NEW.reason_code IS DISTINCT FROM OLD.reason_code OR NEW.error_code IS DISTINCT FROM OLD.error_code OR NEW.error_fingerprint IS DISTINCT FROM OLD.error_fingerprint) THEN RAISE EXCEPTION 'finalized deletion checkpoint facts are immutable'; END IF;
  IF NEW.lease_generation < OLD.lease_generation OR NEW.lease_generation > OLD.lease_generation + 1 THEN RAISE EXCEPTION 'deletion checkpoint lease generation is stale or skipped'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN RAISE EXCEPTION 'deletion checkpoint lease acquisition requires a new generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation + 1 AND (NEW.lease_owner_hash IS NULL OR NEW.lease_acquired_at IS NULL OR NEW.lease_heartbeat_at IS NULL OR NEW.lease_expires_at IS NULL OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT DISTINCT FROM OLD.lease_owner_hash) OR (OLD.lease_expires_at IS NOT NULL AND NEW.lease_acquired_at < OLD.lease_expires_at)) THEN RAISE EXCEPTION 'deletion checkpoint lease generation must fence an acquisition after expiry'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS DISTINCT FROM OLD.lease_owner_hash THEN RAISE EXCEPTION 'deletion checkpoint lease owner cannot change within a generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at THEN RAISE EXCEPTION 'deletion checkpoint lease acquisition time cannot change within a generation'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN RAISE EXCEPTION 'deletion checkpoint lease heartbeat cannot move backward'; END IF;
  IF NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN RAISE EXCEPTION 'deletion checkpoint lease expiry cannot move backward'; END IF;
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_checkpoints_guard BEFORE UPDATE ON public.tenant_deletion_checkpoints FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_checkpoints_guard();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_checkpoints_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status <> 'pending' OR NEW.attempt <> 0 OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0 OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.receipt_hash IS NOT NULL OR NEW.provider_operation_hash IS NOT NULL OR NEW.exemption_reason IS NOT NULL OR NEW.exemption_approved OR NEW.observed_count IS NOT NULL OR NEW.expected_count IS NOT NULL OR NEW.reason_code IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.error_fingerprint IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'deletion checkpoints must be inserted in the pending state'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NOT DISTINCT FROM NEW.workspace_id) THEN RAISE EXCEPTION 'deletion checkpoint workspace does not match its job'; END IF;
  IF NEW.exemption_reason = 'legal_hold_covered' AND NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.legal_hold_status IN ('active_subset','released')) THEN RAISE EXCEPTION 'legal hold exemption requires a reviewed hold snapshot'; END IF;
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_checkpoints_insert_guard BEFORE INSERT ON public.tenant_deletion_checkpoints FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_checkpoints_insert_guard();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_checkpoints_no_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN RAISE EXCEPTION 'current deletion checkpoints are append-only receipts'; END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_checkpoints_no_delete BEFORE DELETE ON public.tenant_deletion_checkpoints FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_checkpoints_no_delete();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_tombstones_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.created_at = pg_catalog.now();
  IF NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.status IN ('primary_deleted','backup_aging')) THEN RAISE EXCEPTION 'tombstone is write-last after primary checkpoints'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NOT DISTINCT FROM NEW.workspace_id) THEN RAISE EXCEPTION 'deletion tombstone workspace does not match its job'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.scope_selector_hash = NEW.scope_selector_hash AND job.policy_version = NEW.policy_version) THEN RAISE EXCEPTION 'deletion tombstone facts do not match its job'; END IF;
  IF (SELECT count(*) FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.job_id) <> 10 OR EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.job_id AND store_class NOT IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging')) THEN RAISE EXCEPTION 'tombstone requires the exact deletion checkpoint store set'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_deletion_checkpoints WHERE job_id = NEW.job_id AND store_class <> 'backup_aging' AND required AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved))) THEN RAISE EXCEPTION 'tombstone requires complete primary checkpoints'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_tombstones_insert_guard BEFORE INSERT ON public.tenant_deletion_tombstones FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_tombstones_insert_guard();
CREATE OR REPLACE FUNCTION public.novatrade_tenant_deletion_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN RAISE EXCEPTION 'deletion history is append-only'; END; $$;
CREATE TRIGGER trg_novatrade_tenant_deletion_checkpoint_events_no_update BEFORE UPDATE OR DELETE ON public.tenant_deletion_checkpoint_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_append_only();
CREATE TRIGGER trg_novatrade_tenant_deletion_tombstones_no_update BEFORE UPDATE OR DELETE ON public.tenant_deletion_tombstones FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_deletion_append_only();
