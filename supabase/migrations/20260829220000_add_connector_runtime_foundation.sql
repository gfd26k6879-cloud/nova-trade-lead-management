-- F-09 generic connector/source-run durability foundation.
--
-- This is additive beside legacy crawl_runs/crawl_units/place_observations; it
-- neither replaces nor backfills those Google-Places-specific tables. Runtime
-- access remains denied until a SQL-visible worker lease/action contract is
-- accepted. Connector account rows contain references/hashes, never secrets.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('novatrade:f09:connector-runtime-foundation')
);

CREATE TABLE IF NOT EXISTS public.connector_versions (
  id uuid CONSTRAINT connector_versions_pkey PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_card_id text NOT NULL,
  version integer NOT NULL,
  execution_mode text NOT NULL,
  transport text NOT NULL,
  operations jsonb NOT NULL,
  output_fields jsonb NOT NULL,
  adapter_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT connector_versions_source_length_chk
    CHECK (pg_catalog.char_length(source_card_id) BETWEEN 1 AND 120),
  CONSTRAINT connector_versions_version_chk CHECK (version > 0),
  CONSTRAINT connector_versions_execution_mode_chk CHECK (execution_mode IN ('fixture', 'live')),
  CONSTRAINT connector_versions_transport_chk CHECK (transport IN ('none', 'network')),
  CONSTRAINT connector_versions_operations_array_chk CHECK (pg_catalog.jsonb_typeof(operations) = 'array'),
  CONSTRAINT connector_versions_output_fields_array_chk CHECK (pg_catalog.jsonb_typeof(output_fields) = 'array'),
  CONSTRAINT connector_versions_hash_chk CHECK (adapter_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT connector_versions_source_version_unique UNIQUE (source_card_id, version)
);

CREATE TABLE IF NOT EXISTS public.connector_accounts (
  id text CONSTRAINT connector_accounts_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL CONSTRAINT connector_accounts_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  source_card_id text NOT NULL,
  connector_version integer NOT NULL,
  account_key text NOT NULL,
  status text NOT NULL DEFAULT 'disabled',
  credential_ref_hash text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT connector_accounts_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT connector_accounts_version_fkey
    FOREIGN KEY (source_card_id, connector_version)
    REFERENCES public.connector_versions (source_card_id, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT connector_accounts_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT connector_accounts_key_length_chk CHECK (pg_catalog.char_length(account_key) BETWEEN 1 AND 160),
  CONSTRAINT connector_accounts_status_chk
    CHECK (status IN ('disabled', 'fixture_only', 'ready', 'suspended', 'revoked')),
  CONSTRAINT connector_accounts_credential_ref_hash_chk
    CHECK (credential_ref_hash IS NULL OR credential_ref_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT connector_accounts_fixture_secret_chk
    CHECK (status <> 'fixture_only' OR credential_ref_hash IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_accounts_scope_key
  ON public.connector_accounts (tenant_id, workspace_id, source_card_id, account_key)
  NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_accounts_scope_id
  ON public.connector_accounts (tenant_id, workspace_id, id) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.source_policy_versions (
  id text CONSTRAINT source_policy_versions_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL CONSTRAINT source_policy_versions_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  source_card_id text NOT NULL,
  connector_version integer NOT NULL,
  connector_account_id text NOT NULL CONSTRAINT source_policy_versions_account_id_fkey
    REFERENCES public.connector_accounts (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  policy_key text NOT NULL,
  version integer NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  execution_mode text NOT NULL,
  terms_state text NOT NULL,
  allowed_operations jsonb NOT NULL,
  allowed_fields jsonb NOT NULL,
  hard_cap_units numeric(18,6) NOT NULL,
  attestation_expires_at timestamptz,
  attestation_revoked boolean NOT NULL DEFAULT false,
  policy_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT source_policy_versions_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT source_policy_versions_connector_version_fkey
    FOREIGN KEY (source_card_id, connector_version)
    REFERENCES public.connector_versions (source_card_id, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT source_policy_versions_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_policy_versions_key_length_chk CHECK (pg_catalog.char_length(policy_key) BETWEEN 1 AND 160),
  CONSTRAINT source_policy_versions_version_chk CHECK (version > 0),
  CONSTRAINT source_policy_versions_state_chk CHECK (state IN ('draft', 'active', 'superseded', 'revoked')),
  CONSTRAINT source_policy_versions_execution_mode_chk CHECK (execution_mode IN ('fixture', 'live')),
  CONSTRAINT source_policy_versions_terms_state_chk CHECK (terms_state IN ('approved', 'pending', 'missing', 'expired', 'revoked')),
  CONSTRAINT source_policy_versions_operations_array_chk CHECK (pg_catalog.jsonb_typeof(allowed_operations) = 'array'),
  CONSTRAINT source_policy_versions_fields_array_chk CHECK (pg_catalog.jsonb_typeof(allowed_fields) = 'array'),
  CONSTRAINT source_policy_versions_budget_chk CHECK (hard_cap_units >= 0),
  CONSTRAINT source_policy_versions_hash_chk CHECK (policy_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT source_policy_versions_attestation_chk CHECK (
    NOT attestation_revoked OR attestation_expires_at IS NOT NULL
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_policy_versions_scope_key_version
  ON public.source_policy_versions (tenant_id, workspace_id, policy_key, version)
  NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_policy_versions_scope_id
  ON public.source_policy_versions (tenant_id, workspace_id, id) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.source_runs (
  id text CONSTRAINT source_runs_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL CONSTRAINT source_runs_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  source_card_id text NOT NULL,
  connector_version integer NOT NULL,
  connector_account_id text NOT NULL CONSTRAINT source_runs_account_id_fkey
    REFERENCES public.connector_accounts (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_policy_id text NOT NULL CONSTRAINT source_runs_policy_id_fkey
    REFERENCES public.source_policy_versions (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  hard_cap_units numeric(18,6) NOT NULL,
  max_attempts integer NOT NULL,
  cancel_requested_at timestamptz,
  error_code text,
  result_ref text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT source_runs_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT source_runs_connector_version_fkey
    FOREIGN KEY (source_card_id, connector_version)
    REFERENCES public.connector_versions (source_card_id, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT source_runs_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_runs_key_length_chk CHECK (pg_catalog.char_length(idempotency_key) BETWEEN 1 AND 512),
  CONSTRAINT source_runs_input_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT source_runs_operation_length_chk CHECK (pg_catalog.char_length(operation) BETWEEN 1 AND 160),
  CONSTRAINT source_runs_status_chk CHECK (status IN (
    'queued', 'running', 'paused', 'retry_wait', 'completed', 'failed',
    'cancelled', 'blocked', 'killed'
  )),
  CONSTRAINT source_runs_budget_attempts_chk CHECK (hard_cap_units >= 0 AND max_attempts BETWEEN 1 AND 10),
  CONSTRAINT source_runs_state_facts_chk CHECK (
    (status = 'queued' AND started_at IS NULL AND ended_at IS NULL AND error_code IS NULL AND result_ref IS NULL)
    OR (status IN ('running', 'paused', 'retry_wait') AND started_at IS NOT NULL AND ended_at IS NULL AND result_ref IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND error_code IS NULL AND result_ref IS NOT NULL)
    OR (status IN ('failed', 'blocked', 'killed') AND ended_at IS NOT NULL AND error_code IS NOT NULL AND result_ref IS NULL)
    OR (status = 'cancelled' AND ended_at IS NOT NULL AND cancel_requested_at IS NOT NULL AND result_ref IS NULL)
  ),
  CONSTRAINT source_runs_time_chk CHECK (
    updated_at >= created_at
    AND (started_at IS NULL OR started_at >= created_at)
    AND (ended_at IS NULL OR (started_at IS NULL OR ended_at >= started_at))
    AND (cancel_requested_at IS NULL OR cancel_requested_at >= created_at)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_runs_scope_idempotency
  ON public.source_runs (tenant_id, workspace_id, idempotency_key) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_runs_scope_id
  ON public.source_runs (tenant_id, workspace_id, id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_source_runs_scope_status_created
  ON public.source_runs (tenant_id, workspace_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.source_run_units (
  id text CONSTRAINT source_run_units_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL CONSTRAINT source_run_units_run_id_fkey
    REFERENCES public.source_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  predecessor_unit_id text CONSTRAINT source_run_units_predecessor_id_fkey
    REFERENCES public.source_run_units (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  sequence integer NOT NULL,
  checkpoint_key text NOT NULL,
  input_hash text NOT NULL,
  cursor text,
  next_cursor text,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  reserved_units numeric(18,6) NOT NULL,
  actual_units numeric(18,6),
  complete boolean NOT NULL DEFAULT false,
  retry_reason text,
  next_attempt_at timestamptz,
  error_code text,
  lease_generation integer NOT NULL DEFAULT 0,
  lease_token_hash text,
  lease_worker_hash text,
  lease_acquired_at timestamptz,
  lease_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT source_run_units_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_run_units_checkpoint_length_chk CHECK (pg_catalog.char_length(checkpoint_key) BETWEEN 1 AND 512),
  CONSTRAINT source_run_units_input_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT source_run_units_cursor_length_chk CHECK (cursor IS NULL OR pg_catalog.char_length(cursor) BETWEEN 1 AND 4096),
  CONSTRAINT source_run_units_next_cursor_length_chk CHECK (next_cursor IS NULL OR pg_catalog.char_length(next_cursor) BETWEEN 1 AND 4096),
  CONSTRAINT source_run_units_sequence_chk CHECK (sequence > 0),
  CONSTRAINT source_run_units_status_chk CHECK (status IN (
    'queued', 'running', 'paused', 'retry_wait', 'page_complete',
    'completed', 'cancelled', 'blocked', 'failed'
  )),
  CONSTRAINT source_run_units_attempts_chk CHECK (
    max_attempts BETWEEN 1 AND 10 AND attempt_count >= 0 AND attempt_count <= max_attempts
  ),
  CONSTRAINT source_run_units_usage_chk CHECK (
    reserved_units >= 0 AND (actual_units IS NULL OR (actual_units >= 0 AND actual_units <= reserved_units))
  ),
  CONSTRAINT source_run_units_lease_hash_chk CHECK (
    (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$')
    AND (lease_worker_hash IS NULL OR lease_worker_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT source_run_units_lease_shape_chk CHECK (
    (status = 'running' AND lease_generation > 0 AND lease_token_hash IS NOT NULL
      AND lease_worker_hash IS NOT NULL AND lease_acquired_at IS NOT NULL
      AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at)
    OR (status <> 'running' AND lease_token_hash IS NULL AND lease_worker_hash IS NULL
      AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT source_run_units_state_facts_chk CHECK (
    (status = 'queued' AND attempt_count = 0 AND actual_units IS NULL AND next_cursor IS NULL
      AND NOT complete AND retry_reason IS NULL AND next_attempt_at IS NULL AND error_code IS NULL
      AND started_at IS NULL AND ended_at IS NULL)
    OR (status = 'running' AND attempt_count > 0 AND actual_units IS NULL AND next_cursor IS NULL
      AND NOT complete AND retry_reason IS NULL AND next_attempt_at IS NULL AND error_code IS NULL
      AND started_at IS NOT NULL AND ended_at IS NULL)
    OR (status = 'paused' AND NOT complete AND ended_at IS NULL)
    OR (status = 'retry_wait' AND attempt_count > 0 AND actual_units IS NULL AND next_cursor IS NULL
      AND NOT complete AND retry_reason IS NOT NULL AND next_attempt_at IS NOT NULL AND error_code IS NOT NULL
      AND started_at IS NOT NULL AND ended_at IS NULL)
    OR (status = 'page_complete' AND actual_units IS NOT NULL AND next_cursor IS NOT NULL
      AND NOT complete AND retry_reason IS NULL AND next_attempt_at IS NULL AND error_code IS NULL
      AND started_at IS NOT NULL AND ended_at IS NOT NULL)
    OR (status = 'completed' AND actual_units IS NOT NULL AND next_cursor IS NULL
      AND complete AND retry_reason IS NULL AND next_attempt_at IS NULL AND error_code IS NULL
      AND started_at IS NOT NULL AND ended_at IS NOT NULL)
    OR (status IN ('cancelled', 'blocked', 'failed') AND NOT complete
      AND next_attempt_at IS NULL AND error_code IS NOT NULL AND ended_at IS NOT NULL)
  ),
  CONSTRAINT source_run_units_time_chk CHECK (
    updated_at >= created_at
    AND (started_at IS NULL OR started_at >= created_at)
    AND (ended_at IS NULL OR (started_at IS NULL OR ended_at >= started_at))
    AND (next_attempt_at IS NULL OR next_attempt_at > updated_at)
  ),
  CONSTRAINT source_run_units_predecessor_self_chk CHECK (predecessor_unit_id IS NULL OR predecessor_unit_id <> id),
  CONSTRAINT source_run_units_run_sequence_unique UNIQUE (run_id, sequence),
  CONSTRAINT source_run_units_run_checkpoint_unique UNIQUE (run_id, checkpoint_key),
  CONSTRAINT source_run_units_predecessor_unique UNIQUE (predecessor_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_source_run_units_claimable
  ON public.source_run_units (tenant_id, workspace_id, status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry_wait', 'running');
CREATE INDEX IF NOT EXISTS idx_source_run_units_scope_run_sequence
  ON public.source_run_units (tenant_id, workspace_id, run_id, sequence);

CREATE TABLE IF NOT EXISTS public.source_run_lease_history (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT source_run_lease_history_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL CONSTRAINT source_run_lease_history_run_id_fkey
    REFERENCES public.source_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  unit_id text NOT NULL CONSTRAINT source_run_lease_history_unit_id_fkey
    REFERENCES public.source_run_units (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  lease_generation integer NOT NULL,
  lease_token_hash text NOT NULL,
  lease_worker_hash text NOT NULL,
  acquired_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text,
  CONSTRAINT source_run_lease_history_generation_chk CHECK (lease_generation > 0),
  CONSTRAINT source_run_lease_history_hash_chk CHECK (
    lease_token_hash ~ '^[0-9a-f]{64}$' AND lease_worker_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT source_run_lease_history_time_chk CHECK (
    acquired_at <= heartbeat_at AND heartbeat_at < expires_at
    AND (released_at IS NULL OR released_at >= acquired_at)
  ),
  CONSTRAINT source_run_lease_history_release_chk CHECK ((released_at IS NULL) = (release_reason IS NULL)),
  CONSTRAINT source_run_lease_history_unit_generation_unique UNIQUE (unit_id, lease_generation),
  CONSTRAINT source_run_lease_history_token_unique UNIQUE (lease_token_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_run_lease_history_scope_unit
  ON public.source_run_lease_history (tenant_id, workspace_id, run_id, unit_id, lease_generation DESC);

CREATE TABLE IF NOT EXISTS public.source_observations (
  id text CONSTRAINT source_observations_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL CONSTRAINT source_observations_run_id_fkey
    REFERENCES public.source_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  unit_id text NOT NULL CONSTRAINT source_observations_unit_id_fkey
    REFERENCES public.source_run_units (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_card_id text NOT NULL,
  operation text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload_ref text NOT NULL,
  payload_sha256 text NOT NULL,
  field_names jsonb NOT NULL,
  provenance_sha256 text NOT NULL,
  dedupe_key_hash text NOT NULL,
  redaction_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT source_observations_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_observations_operation_length_chk CHECK (pg_catalog.char_length(operation) BETWEEN 1 AND 160),
  CONSTRAINT source_observations_payload_ref_length_chk CHECK (pg_catalog.char_length(payload_ref) BETWEEN 1 AND 1024),
  CONSTRAINT source_observations_hashes_chk CHECK (
    payload_sha256 ~ '^[0-9a-f]{64}$' AND provenance_sha256 ~ '^[0-9a-f]{64}$'
    AND dedupe_key_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT source_observations_fields_array_chk CHECK (pg_catalog.jsonb_typeof(field_names) = 'array'),
  CONSTRAINT source_observations_redaction_array_chk CHECK (pg_catalog.jsonb_typeof(redaction_flags) = 'array')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_observations_scope_dedupe
  ON public.source_observations (tenant_id, workspace_id, source_card_id, dedupe_key_hash)
  NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_source_observations_scope_run_time
  ON public.source_observations (tenant_id, workspace_id, run_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.source_usage_reservations (
  id text CONSTRAINT source_usage_reservations_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL CONSTRAINT source_usage_reservations_run_id_fkey
    REFERENCES public.source_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  unit_id text NOT NULL CONSTRAINT source_usage_reservations_unit_id_fkey
    REFERENCES public.source_run_units (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  reserved_units numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT source_usage_reservations_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_usage_reservations_key_length_chk CHECK (pg_catalog.char_length(idempotency_key) BETWEEN 1 AND 512),
  CONSTRAINT source_usage_reservations_input_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT source_usage_reservations_units_chk CHECK (reserved_units >= 0),
  CONSTRAINT source_usage_reservations_run_key_unique UNIQUE (run_id, idempotency_key),
  CONSTRAINT source_usage_reservations_unit_unique UNIQUE (unit_id)
);
CREATE INDEX IF NOT EXISTS idx_source_usage_reservations_scope_run
  ON public.source_usage_reservations (tenant_id, workspace_id, run_id, created_at);

CREATE TABLE IF NOT EXISTS public.source_usage_settlements (
  id text CONSTRAINT source_usage_settlements_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL CONSTRAINT source_usage_settlements_run_id_fkey
    REFERENCES public.source_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  unit_id text NOT NULL CONSTRAINT source_usage_settlements_unit_id_fkey
    REFERENCES public.source_run_units (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reservation_id text NOT NULL CONSTRAINT source_usage_settlements_reservation_id_fkey
    REFERENCES public.source_usage_reservations (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status text NOT NULL,
  actual_units numeric(18,6) NOT NULL,
  settled_at timestamptz NOT NULL,
  CONSTRAINT source_usage_settlements_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT source_usage_settlements_status_chk CHECK (status IN ('settled', 'released', 'rejected')),
  CONSTRAINT source_usage_settlements_units_chk CHECK (actual_units >= 0),
  CONSTRAINT source_usage_settlements_release_units_chk
    CHECK (status = 'settled' OR actual_units = 0),
  CONSTRAINT source_usage_settlements_reservation_unique UNIQUE (reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_source_usage_settlements_scope_run
  ON public.source_usage_settlements (tenant_id, workspace_id, run_id, settled_at);

CREATE OR REPLACE FUNCTION public.novatrade_source_registry_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_REGISTRY_VERSION_IMMUTABLE';
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_append_only_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_RUNTIME_RECORD_IMMUTABLE';
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_child_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE parent_tenant uuid; parent_workspace uuid;
BEGIN
  SELECT r.tenant_id, r.workspace_id INTO parent_tenant, parent_workspace
  FROM public.source_runs r WHERE r.id=NEW.run_id;
  IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM parent_tenant
    OR NEW.workspace_id IS DISTINCT FROM parent_workspace THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_RUNTIME_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_policy_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE account_row public.connector_accounts%ROWTYPE;
BEGIN
  SELECT * INTO account_row FROM public.connector_accounts a WHERE a.id=NEW.connector_account_id;
  IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM account_row.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM account_row.workspace_id
    OR NEW.source_card_id IS DISTINCT FROM account_row.source_card_id
    OR NEW.connector_version IS DISTINCT FROM account_row.connector_version THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_POLICY_ACCOUNT_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_run_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE account_row public.connector_accounts%ROWTYPE; policy_row public.source_policy_versions%ROWTYPE;
BEGIN
  SELECT * INTO account_row FROM public.connector_accounts a WHERE a.id=NEW.connector_account_id;
  SELECT * INTO policy_row FROM public.source_policy_versions p WHERE p.id=NEW.source_policy_id;
  IF account_row.id IS NULL OR policy_row.id IS NULL
    OR NEW.tenant_id IS DISTINCT FROM account_row.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM account_row.workspace_id
    OR NEW.source_card_id IS DISTINCT FROM account_row.source_card_id
    OR NEW.connector_version IS DISTINCT FROM account_row.connector_version
    OR NEW.tenant_id IS DISTINCT FROM policy_row.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM policy_row.workspace_id
    OR NEW.source_card_id IS DISTINCT FROM policy_row.source_card_id
    OR NEW.connector_version IS DISTINCT FROM policy_row.connector_version
    OR NEW.connector_account_id IS DISTINCT FROM policy_row.connector_account_id
    OR NEW.hard_cap_units > policy_row.hard_cap_units THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_RUN_AUTHORITY_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_run_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.source_card_id IS DISTINCT FROM OLD.source_card_id
    OR NEW.connector_version IS DISTINCT FROM OLD.connector_version
    OR NEW.connector_account_id IS DISTINCT FROM OLD.connector_account_id
    OR NEW.source_policy_id IS DISTINCT FROM OLD.source_policy_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
    OR NEW.operation IS DISTINCT FROM OLD.operation OR NEW.hard_cap_units IS DISTINCT FROM OLD.hard_cap_units
    OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_RUN_EXECUTION_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_RUN_TIME_REGRESSION';
  END IF;
  IF OLD.status IN ('completed','failed','cancelled','blocked','killed') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_RUN_TERMINAL';
  END IF;
  IF NOT ((OLD.status='queued' AND NEW.status IN ('running','paused','cancelled','blocked','killed'))
    OR (OLD.status='running' AND NEW.status IN ('running','paused','retry_wait','completed','failed','cancelled','blocked','killed'))
    OR (OLD.status='paused' AND NEW.status IN ('running','cancelled','killed'))
    OR (OLD.status='retry_wait' AND NEW.status IN ('running','cancelled','killed'))) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_RUN_INVALID_TRANSITION';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_unit_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE parent_unit public.source_run_units%ROWTYPE;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.predecessor_unit_id IS DISTINCT FROM OLD.predecessor_unit_id OR NEW.sequence IS DISTINCT FROM OLD.sequence
    OR NEW.checkpoint_key IS DISTINCT FROM OLD.checkpoint_key OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
    OR NEW.cursor IS DISTINCT FROM OLD.cursor OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    OR NEW.reserved_units IS DISTINCT FROM OLD.reserved_units OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_EXECUTION_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD.status IN ('page_complete','completed','cancelled','blocked','failed') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_TERMINAL';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_TIME_REGRESSION';
  END IF;
  IF NEW.lease_generation=OLD.lease_generation+1 THEN
    IF NEW.status<>'running' OR NEW.attempt_count<>OLD.attempt_count+1
      OR NEW.lease_token_hash IS NULL OR NEW.lease_worker_hash IS NULL
      OR NEW.lease_acquired_at IS NULL OR NEW.lease_heartbeat_at IS DISTINCT FROM NEW.lease_acquired_at THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_INVALID_LEASE_ACQUISITION';
    END IF;
  ELSIF NEW.lease_generation<>OLD.lease_generation THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_INVALID_LEASE_GENERATION';
  ELSIF NEW.status='running' THEN
    IF OLD.status<>'running' OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
      OR NEW.lease_token_hash IS DISTINCT FROM OLD.lease_token_hash
      OR NEW.lease_worker_hash IS DISTINCT FROM OLD.lease_worker_hash
      OR NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at
      OR NEW.lease_heartbeat_at<OLD.lease_heartbeat_at OR NEW.lease_expires_at<OLD.lease_expires_at THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SOURCE_UNIT_INVALID_LEASE_HEARTBEAT';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_unit_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE parent_unit public.source_run_units%ROWTYPE; parent_tenant uuid; parent_workspace uuid;
  parent_max_attempts integer; parent_hard_cap numeric(18,6);
BEGIN
  SELECT r.tenant_id,r.workspace_id,r.max_attempts,r.hard_cap_units
  INTO parent_tenant,parent_workspace,parent_max_attempts,parent_hard_cap
  FROM public.source_runs r WHERE r.id=NEW.run_id;
  IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM parent_tenant
    OR NEW.workspace_id IS DISTINCT FROM parent_workspace
    OR NEW.max_attempts>parent_max_attempts OR NEW.reserved_units>parent_hard_cap THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='SOURCE_RUNTIME_SCOPE_MISMATCH';
  END IF;
  IF NEW.sequence=1 THEN
    IF NEW.predecessor_unit_id IS NOT NULL OR NEW.cursor IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_UNIT_INITIAL_CURSOR_INVALID';
    END IF;
  ELSE
    SELECT * INTO parent_unit FROM public.source_run_units u WHERE u.id=NEW.predecessor_unit_id;
    IF NOT FOUND OR parent_unit.run_id IS DISTINCT FROM NEW.run_id
      OR parent_unit.sequence<>NEW.sequence-1 OR parent_unit.status<>'page_complete'
      OR parent_unit.next_cursor IS DISTINCT FROM NEW.cursor THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_UNIT_CONTINUATION_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_unit_lease_history_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  IF NEW.lease_generation=OLD.lease_generation+1 THEN
    INSERT INTO public.source_run_lease_history(
      tenant_id,workspace_id,run_id,unit_id,lease_generation,lease_token_hash,
      lease_worker_hash,acquired_at,heartbeat_at,expires_at
    ) VALUES (
      NEW.tenant_id,NEW.workspace_id,NEW.run_id,NEW.id,NEW.lease_generation,
      NEW.lease_token_hash,NEW.lease_worker_hash,NEW.lease_acquired_at,
      NEW.lease_heartbeat_at,NEW.lease_expires_at
    );
  ELSIF OLD.status='running' AND NEW.status='running' THEN
    UPDATE public.source_run_lease_history SET heartbeat_at=NEW.lease_heartbeat_at,expires_at=NEW.lease_expires_at
    WHERE unit_id=NEW.id AND lease_generation=NEW.lease_generation;
  ELSIF OLD.status='running' AND NEW.status<>'running' THEN
    UPDATE public.source_run_lease_history SET released_at=NEW.updated_at,release_reason=NEW.status
    WHERE unit_id=NEW.id AND lease_generation=OLD.lease_generation;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_observation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE run_row public.source_runs%ROWTYPE; unit_row public.source_run_units%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM public.source_runs r WHERE r.id=NEW.run_id;
  SELECT * INTO unit_row FROM public.source_run_units u WHERE u.id=NEW.unit_id;
  IF run_row.id IS NULL OR unit_row.id IS NULL OR unit_row.run_id IS DISTINCT FROM NEW.run_id
    OR NEW.tenant_id IS DISTINCT FROM run_row.tenant_id OR NEW.workspace_id IS DISTINCT FROM run_row.workspace_id
    OR NEW.tenant_id IS DISTINCT FROM unit_row.tenant_id OR NEW.workspace_id IS DISTINCT FROM unit_row.workspace_id
    OR NEW.source_card_id IS DISTINCT FROM run_row.source_card_id OR NEW.operation IS DISTINCT FROM run_row.operation
    OR unit_row.status NOT IN ('page_complete','completed') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_OBSERVATION_PROVENANCE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_budget_reservation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE run_row public.source_runs%ROWTYPE; unit_row public.source_run_units%ROWTYPE; already numeric(18,6);
BEGIN
  SELECT * INTO run_row FROM public.source_runs r WHERE r.id=NEW.run_id FOR UPDATE;
  SELECT * INTO unit_row FROM public.source_run_units u WHERE u.id=NEW.unit_id;
  IF run_row.id IS NULL OR unit_row.id IS NULL OR unit_row.run_id IS DISTINCT FROM NEW.run_id
    OR NEW.tenant_id IS DISTINCT FROM run_row.tenant_id OR NEW.workspace_id IS DISTINCT FROM run_row.workspace_id
    OR NEW.tenant_id IS DISTINCT FROM unit_row.tenant_id OR NEW.workspace_id IS DISTINCT FROM unit_row.workspace_id
    OR NEW.input_hash IS DISTINCT FROM unit_row.input_hash OR NEW.reserved_units IS DISTINCT FROM unit_row.reserved_units THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_BUDGET_RESERVATION_SCOPE_MISMATCH';
  END IF;
  SELECT COALESCE(pg_catalog.sum(
    CASE WHEN s.id IS NULL THEN r.reserved_units ELSE s.actual_units END
  ),0::numeric) INTO already
  FROM public.source_usage_reservations r
  LEFT JOIN public.source_usage_settlements s ON s.reservation_id=r.id
  WHERE r.run_id=NEW.run_id;
  IF already+NEW.reserved_units>run_row.hard_cap_units THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_RUN_HARD_CAP_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_source_usage_settlement_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE reservation public.source_usage_reservations%ROWTYPE;
BEGIN
  SELECT * INTO reservation FROM public.source_usage_reservations r WHERE r.id=NEW.reservation_id;
  IF NOT FOUND OR NEW.run_id IS DISTINCT FROM reservation.run_id OR NEW.unit_id IS DISTINCT FROM reservation.unit_id
    OR NEW.tenant_id IS DISTINCT FROM reservation.tenant_id OR NEW.workspace_id IS DISTINCT FROM reservation.workspace_id
    OR NEW.actual_units>reservation.reserved_units THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_USAGE_SETTLEMENT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_connector_versions_immutable ON public.connector_versions;
CREATE TRIGGER trg_connector_versions_immutable BEFORE UPDATE OR DELETE ON public.connector_versions
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_registry_immutable();
DROP TRIGGER IF EXISTS trg_source_policy_versions_scope ON public.source_policy_versions;
CREATE TRIGGER trg_source_policy_versions_scope BEFORE INSERT ON public.source_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_policy_scope_guard();
DROP TRIGGER IF EXISTS trg_source_policy_versions_immutable ON public.source_policy_versions;
CREATE TRIGGER trg_source_policy_versions_immutable BEFORE UPDATE OR DELETE ON public.source_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_registry_immutable();
DROP TRIGGER IF EXISTS trg_source_runs_scope ON public.source_runs;
CREATE TRIGGER trg_source_runs_scope BEFORE INSERT ON public.source_runs
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_run_scope_guard();
DROP TRIGGER IF EXISTS trg_source_runs_guard ON public.source_runs;
CREATE TRIGGER trg_source_runs_guard BEFORE UPDATE ON public.source_runs
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_run_guard();
DROP TRIGGER IF EXISTS trg_source_run_units_insert ON public.source_run_units;
CREATE TRIGGER trg_source_run_units_insert BEFORE INSERT ON public.source_run_units
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_unit_insert_guard();
DROP TRIGGER IF EXISTS trg_source_run_units_guard ON public.source_run_units;
CREATE TRIGGER trg_source_run_units_guard BEFORE UPDATE ON public.source_run_units
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_unit_guard();
DROP TRIGGER IF EXISTS trg_source_run_units_lease_history ON public.source_run_units;
CREATE TRIGGER trg_source_run_units_lease_history AFTER UPDATE ON public.source_run_units
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_unit_lease_history_sync();
DROP TRIGGER IF EXISTS trg_source_run_lease_history_scope ON public.source_run_lease_history;
CREATE TRIGGER trg_source_run_lease_history_scope BEFORE INSERT ON public.source_run_lease_history
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_child_scope_guard();
DROP TRIGGER IF EXISTS trg_source_observations_guard ON public.source_observations;
CREATE TRIGGER trg_source_observations_guard BEFORE INSERT ON public.source_observations
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_observation_guard();
DROP TRIGGER IF EXISTS trg_source_observations_immutable ON public.source_observations;
CREATE TRIGGER trg_source_observations_immutable BEFORE UPDATE OR DELETE ON public.source_observations
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_append_only_immutable();
DROP TRIGGER IF EXISTS trg_source_usage_reservations_guard ON public.source_usage_reservations;
CREATE TRIGGER trg_source_usage_reservations_guard BEFORE INSERT ON public.source_usage_reservations
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_budget_reservation_guard();
DROP TRIGGER IF EXISTS trg_source_usage_reservations_immutable ON public.source_usage_reservations;
CREATE TRIGGER trg_source_usage_reservations_immutable BEFORE UPDATE OR DELETE ON public.source_usage_reservations
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_append_only_immutable();
DROP TRIGGER IF EXISTS trg_source_usage_settlements_guard ON public.source_usage_settlements;
CREATE TRIGGER trg_source_usage_settlements_guard BEFORE INSERT ON public.source_usage_settlements
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_usage_settlement_guard();
DROP TRIGGER IF EXISTS trg_source_usage_settlements_immutable ON public.source_usage_settlements;
CREATE TRIGGER trg_source_usage_settlements_immutable BEFORE UPDATE OR DELETE ON public.source_usage_settlements
FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_append_only_immutable();

DO $security$
DECLARE target_table text; target_role text; target_function text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'connector_versions','connector_accounts','source_policy_versions','source_runs',
    'source_run_units','source_run_lease_history','source_observations',
    'source_usage_reservations','source_usage_settlements'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target_table);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',target_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',target_table);
    FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=target_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM %I',target_table,target_role);
      END IF;
    END LOOP;
  END LOOP;
  REVOKE ALL ON SEQUENCE public.source_run_lease_history_id_seq FROM PUBLIC;
  FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=target_role) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE public.source_run_lease_history_id_seq FROM %I',target_role);
    END IF;
  END LOOP;
  FOREACH target_function IN ARRAY ARRAY[
    'public.novatrade_source_registry_immutable()','public.novatrade_source_append_only_immutable()',
    'public.novatrade_source_child_scope_guard()','public.novatrade_source_policy_scope_guard()',
    'public.novatrade_source_run_scope_guard()','public.novatrade_source_run_guard()',
    'public.novatrade_source_unit_guard()','public.novatrade_source_unit_insert_guard()',
    'public.novatrade_source_unit_lease_history_sync()','public.novatrade_source_observation_guard()',
    'public.novatrade_source_budget_reservation_guard()','public.novatrade_source_usage_settlement_guard()'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',target_function);
    FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=target_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I',target_function,target_role);
      END IF;
    END LOOP;
  END LOOP;
END;
$security$;

COMMENT ON TABLE public.source_runs IS
  'Generic durable connector runs; no legacy crawl cutover and no runtime authority are established by this table.';
COMMENT ON TABLE public.connector_accounts IS
  'Tenant connector account metadata containing only opaque credential reference hashes, never provider secrets.';
COMMENT ON TABLE public.source_observations IS
  'Immutable generic source provenance metadata; payload bodies remain behind payload_ref and policy-controlled storage.';
COMMENT ON TABLE public.source_run_lease_history IS
  'Durable lease generations used to fence stale unit completion and recovery.';

DO $receipt$
DECLARE table_count integer; rls_count integer; policy_count integer; trigger_count integer;
BEGIN
  SELECT count(*) INTO table_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY(ARRAY[
    'connector_versions','connector_accounts','source_policy_versions','source_runs',
    'source_run_units','source_run_lease_history','source_observations',
    'source_usage_reservations','source_usage_settlements']);
  SELECT count(*) INTO rls_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relname=ANY(ARRAY[
    'connector_versions','connector_accounts','source_policy_versions','source_runs',
    'source_run_units','source_run_lease_history','source_observations',
    'source_usage_reservations','source_usage_settlements']);
  SELECT count(*) INTO policy_count FROM pg_catalog.pg_policy p WHERE p.polrelid=ANY(ARRAY[
    'public.connector_versions'::regclass,'public.connector_accounts'::regclass,
    'public.source_policy_versions'::regclass,'public.source_runs'::regclass,
    'public.source_run_units'::regclass,'public.source_run_lease_history'::regclass,
    'public.source_observations'::regclass,'public.source_usage_reservations'::regclass,
    'public.source_usage_settlements'::regclass]);
  SELECT count(*) INTO trigger_count FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid=ANY(ARRAY[
    'public.connector_versions'::regclass,'public.source_policy_versions'::regclass,
    'public.source_runs'::regclass,'public.source_run_units'::regclass,
    'public.source_run_lease_history'::regclass,'public.source_observations'::regclass,
    'public.source_usage_reservations'::regclass,'public.source_usage_settlements'::regclass]);
  IF table_count<>9 OR rls_count<>9 OR policy_count<>0 OR trigger_count<>15 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='F09_CONNECTOR_RUNTIME_CATALOG_INCOMPLETE';
  END IF;
END;
$receipt$;
COMMIT;
