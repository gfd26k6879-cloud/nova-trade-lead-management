-- F-06 durable agent-runtime foundation.
--
-- This migration intentionally grants no runtime access and creates no worker
-- policy or execution RPC. The SQL-visible worker lease/authority contract is
-- not yet accepted, so every runtime table remains deny-by-default under FORCE
-- RLS. A future adapter must use a narrowly granted, lease-fenced boundary.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('novatrade:f06:agent-runtime-foundation')
);

CREATE TABLE IF NOT EXISTS public.agent_prompt_versions (
  id uuid CONSTRAINT agent_prompt_versions_pkey PRIMARY KEY
    DEFAULT pg_catalog.gen_random_uuid(),
  prompt_key text NOT NULL,
  version integer NOT NULL,
  instructions_ref text NOT NULL,
  instructions_sha256 text NOT NULL,
  allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_classifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT agent_prompt_versions_key_length_chk
    CHECK (pg_catalog.char_length(prompt_key) BETWEEN 1 AND 120),
  CONSTRAINT agent_prompt_versions_version_chk CHECK (version > 0),
  CONSTRAINT agent_prompt_versions_instructions_ref_length_chk
    CHECK (pg_catalog.char_length(instructions_ref) BETWEEN 1 AND 512),
  CONSTRAINT agent_prompt_versions_hash_chk
    CHECK (instructions_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_prompt_versions_tools_array_chk
    CHECK (pg_catalog.jsonb_typeof(allowed_tools) = 'array'),
  CONSTRAINT agent_prompt_versions_classifications_array_chk
    CHECK (pg_catalog.jsonb_typeof(allowed_classifications) = 'array'),
  CONSTRAINT agent_prompt_versions_key_version_unique UNIQUE (prompt_key, version)
);

CREATE TABLE IF NOT EXISTS public.agent_policy_versions (
  id uuid CONSTRAINT agent_policy_versions_pkey PRIMARY KEY
    DEFAULT pg_catalog.gen_random_uuid(),
  policy_key text NOT NULL,
  version integer NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  state text NOT NULL,
  policy_sha256 text NOT NULL,
  allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_classifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT agent_policy_versions_key_length_chk
    CHECK (pg_catalog.char_length(policy_key) BETWEEN 1 AND 120),
  CONSTRAINT agent_policy_versions_version_chk CHECK (version > 0),
  CONSTRAINT agent_policy_versions_provider_length_chk
    CHECK (pg_catalog.char_length(provider) BETWEEN 1 AND 120),
  CONSTRAINT agent_policy_versions_model_length_chk
    CHECK (pg_catalog.char_length(model) BETWEEN 1 AND 160),
  CONSTRAINT agent_policy_versions_state_chk
    CHECK (state IN ('disabled', 'fixture', 'implementation_only', 'active')),
  CONSTRAINT agent_policy_versions_hash_chk
    CHECK (policy_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_policy_versions_tools_array_chk
    CHECK (pg_catalog.jsonb_typeof(allowed_tools) = 'array'),
  CONSTRAINT agent_policy_versions_classifications_array_chk
    CHECK (pg_catalog.jsonb_typeof(allowed_classifications) = 'array'),
  CONSTRAINT agent_policy_versions_key_version_unique UNIQUE (policy_key, version)
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id text CONSTRAINT agent_runs_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL
    CONSTRAINT agent_runs_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  agent_role text NOT NULL,
  agent_version integer NOT NULL,
  prompt_key text NOT NULL,
  prompt_version integer NOT NULL,
  policy_key text NOT NULL,
  policy_version integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  budget_usd numeric(14,6) NOT NULL,
  usage_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  lease_generation integer NOT NULL DEFAULT 0,
  lease_token_hash text,
  lease_worker_hash text,
  lease_acquired_at timestamptz,
  lease_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  result_ref text,
  error_code text,
  cancel_requested_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT agent_runs_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT agent_runs_prompt_version_fkey
    FOREIGN KEY (prompt_key, prompt_version)
    REFERENCES public.agent_prompt_versions (prompt_key, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT agent_runs_policy_version_fkey
    FOREIGN KEY (policy_key, policy_version)
    REFERENCES public.agent_policy_versions (policy_key, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT agent_runs_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT agent_runs_idempotency_length_chk
    CHECK (pg_catalog.char_length(idempotency_key) BETWEEN 1 AND 512),
  CONSTRAINT agent_runs_input_hash_length_chk
    CHECK (pg_catalog.char_length(input_hash) BETWEEN 1 AND 160),
  CONSTRAINT agent_runs_role_length_chk
    CHECK (pg_catalog.char_length(agent_role) BETWEEN 1 AND 120),
  CONSTRAINT agent_runs_agent_version_chk CHECK (agent_version > 0),
  CONSTRAINT agent_runs_status_chk
    CHECK (status IN ('queued', 'running', 'retry_wait', 'complete', 'failed', 'dead_letter', 'canceled')),
  CONSTRAINT agent_runs_budget_chk
    CHECK (budget_usd >= 0 AND usage_cost_usd >= 0 AND usage_cost_usd <= budget_usd),
  CONSTRAINT agent_runs_attempts_chk
    CHECK (max_attempts > 0 AND attempt_count >= 0 AND attempt_count <= max_attempts),
  CONSTRAINT agent_runs_lease_generation_chk CHECK (lease_generation >= 0),
  CONSTRAINT agent_runs_lease_token_hash_chk
    CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_runs_lease_worker_hash_chk
    CHECK (lease_worker_hash IS NULL OR lease_worker_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_runs_lease_shape_chk CHECK (
    (status = 'running'
      AND lease_generation > 0
      AND lease_token_hash IS NOT NULL
      AND lease_worker_hash IS NOT NULL
      AND lease_acquired_at IS NOT NULL
      AND lease_heartbeat_at IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_acquired_at <= lease_heartbeat_at
      AND lease_heartbeat_at < lease_expires_at)
    OR
    (status <> 'running'
      AND lease_token_hash IS NULL
      AND lease_worker_hash IS NULL
      AND lease_acquired_at IS NULL
      AND lease_heartbeat_at IS NULL
      AND lease_expires_at IS NULL)
  ),
  CONSTRAINT agent_runs_state_facts_chk CHECK (
    (status = 'queued' AND attempt_count = 0 AND next_attempt_at IS NULL
      AND result_ref IS NULL AND error_code IS NULL AND cancel_requested_at IS NULL
      AND started_at IS NULL AND ended_at IS NULL)
    OR
    (status = 'running' AND attempt_count > 0 AND next_attempt_at IS NULL
      AND result_ref IS NULL AND error_code IS NULL AND ended_at IS NULL
      AND started_at IS NOT NULL)
    OR
    (status = 'retry_wait' AND attempt_count > 0 AND next_attempt_at IS NOT NULL
      AND result_ref IS NULL AND error_code IS NOT NULL AND ended_at IS NULL
      AND started_at IS NOT NULL)
    OR
    (status = 'complete' AND attempt_count > 0 AND next_attempt_at IS NULL
      AND result_ref IS NOT NULL AND error_code IS NULL AND ended_at IS NOT NULL
      AND started_at IS NOT NULL)
    OR
    (status IN ('failed', 'dead_letter') AND attempt_count > 0 AND next_attempt_at IS NULL
      AND result_ref IS NULL AND error_code IS NOT NULL AND ended_at IS NOT NULL
      AND started_at IS NOT NULL)
    OR
    (status = 'canceled' AND next_attempt_at IS NULL AND result_ref IS NULL
      AND error_code IS NULL AND cancel_requested_at IS NOT NULL AND ended_at IS NOT NULL)
  ),
  CONSTRAINT agent_runs_time_order_chk CHECK (
    updated_at >= created_at
    AND (started_at IS NULL OR started_at >= created_at)
    AND (ended_at IS NULL OR (started_at IS NULL OR ended_at >= started_at))
    AND (cancel_requested_at IS NULL OR cancel_requested_at >= created_at)
    AND (next_attempt_at IS NULL OR next_attempt_at > updated_at)
  ),
  CONSTRAINT agent_runs_scope_id_unique UNIQUE (tenant_id, workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_scope_idempotency
  ON public.agent_runs (tenant_id, workspace_id, idempotency_key) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_agent_runs_claimable
  ON public.agent_runs (tenant_id, status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry_wait', 'running');
CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_created
  ON public.agent_runs (tenant_id, workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_run_lease_history (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT agent_run_lease_history_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL
    CONSTRAINT agent_run_lease_history_run_id_fkey
    REFERENCES public.agent_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  lease_generation integer NOT NULL,
  lease_token_hash text NOT NULL,
  lease_worker_hash text NOT NULL,
  acquired_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text,
  CONSTRAINT agent_run_lease_history_generation_chk CHECK (lease_generation > 0),
  CONSTRAINT agent_run_lease_history_token_hash_chk CHECK (lease_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_run_lease_history_worker_hash_chk CHECK (lease_worker_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_run_lease_history_time_chk CHECK (
    acquired_at <= heartbeat_at AND heartbeat_at < expires_at
    AND (released_at IS NULL OR released_at >= acquired_at)
  ),
  CONSTRAINT agent_run_lease_history_release_chk CHECK (
    (released_at IS NULL) = (release_reason IS NULL)
  ),
  CONSTRAINT agent_run_lease_history_run_generation_unique UNIQUE (run_id, lease_generation),
  CONSTRAINT agent_run_lease_history_token_unique UNIQUE (lease_token_hash)
);
CREATE INDEX IF NOT EXISTS idx_agent_run_lease_history_scope_run
  ON public.agent_run_lease_history (tenant_id, workspace_id, run_id, lease_generation DESC);

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id text CONSTRAINT agent_run_steps_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL
    CONSTRAINT agent_run_steps_run_id_fkey
    REFERENCES public.agent_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  sequence integer NOT NULL,
  status text NOT NULL,
  policy_key text NOT NULL,
  policy_version integer NOT NULL,
  result_ref text,
  error_code text,
  recorded_at timestamptz NOT NULL,
  CONSTRAINT agent_run_steps_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT agent_run_steps_sequence_chk CHECK (sequence > 0),
  CONSTRAINT agent_run_steps_status_chk CHECK (status IN ('complete', 'failed', 'blocked')),
  CONSTRAINT agent_run_steps_result_chk CHECK (
    (status = 'complete' AND result_ref IS NOT NULL AND error_code IS NULL)
    OR (status <> 'complete' AND result_ref IS NULL AND error_code IS NOT NULL)
  ),
  CONSTRAINT agent_run_steps_policy_version_fkey
    FOREIGN KEY (policy_key, policy_version)
    REFERENCES public.agent_policy_versions (policy_key, version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT agent_run_steps_run_sequence_unique UNIQUE (run_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_agent_run_steps_scope_run
  ON public.agent_run_steps (tenant_id, workspace_id, run_id, sequence);

CREATE TABLE IF NOT EXISTS public.agent_tool_calls (
  id text CONSTRAINT agent_tool_calls_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL
    CONSTRAINT agent_tool_calls_run_id_fkey
    REFERENCES public.agent_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  step_id text NOT NULL
    CONSTRAINT agent_tool_calls_step_id_fkey
    REFERENCES public.agent_run_steps (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  parent_tool_call_id text
    CONSTRAINT agent_tool_calls_parent_id_fkey
    REFERENCES public.agent_tool_calls (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  tool_name text NOT NULL,
  tool_version text NOT NULL,
  permission_decision text NOT NULL,
  status text NOT NULL,
  input_hash text NOT NULL,
  output_hash text,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  latency_ms bigint NOT NULL,
  error_code text,
  redacted_summary text NOT NULL,
  recorded_at timestamptz NOT NULL,
  CONSTRAINT agent_tool_calls_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT agent_tool_calls_name_length_chk CHECK (pg_catalog.char_length(tool_name) BETWEEN 1 AND 160),
  CONSTRAINT agent_tool_calls_version_length_chk CHECK (pg_catalog.char_length(tool_version) BETWEEN 1 AND 80),
  CONSTRAINT agent_tool_calls_permission_chk CHECK (permission_decision IN ('allowed', 'denied')),
  CONSTRAINT agent_tool_calls_status_chk CHECK (status IN ('complete', 'failed', 'denied')),
  CONSTRAINT agent_tool_calls_permission_status_chk
    CHECK ((permission_decision = 'denied') = (status = 'denied')),
  CONSTRAINT agent_tool_calls_result_chk CHECK (
    (status = 'complete' AND output_hash IS NOT NULL AND error_code IS NULL)
    OR (status <> 'complete' AND output_hash IS NULL AND error_code IS NOT NULL)
  ),
  CONSTRAINT agent_tool_calls_source_ids_array_chk CHECK (pg_catalog.jsonb_typeof(source_ids) = 'array'),
  CONSTRAINT agent_tool_calls_cost_latency_chk CHECK (cost_usd >= 0 AND latency_ms >= 0),
  CONSTRAINT agent_tool_calls_parent_self_chk CHECK (parent_tool_call_id IS NULL OR parent_tool_call_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_scope_run_step
  ON public.agent_tool_calls (tenant_id, workspace_id, run_id, step_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_parent
  ON public.agent_tool_calls (parent_tool_call_id) WHERE parent_tool_call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_usage_reservations (
  id text CONSTRAINT agent_usage_reservations_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL
    CONSTRAINT agent_usage_reservations_run_id_fkey
    REFERENCES public.agent_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  reserved_cost_usd numeric(14,6) NOT NULL,
  reserved_input_tokens bigint NOT NULL DEFAULT 0,
  reserved_output_tokens bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  CONSTRAINT agent_usage_reservations_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT agent_usage_reservations_key_length_chk CHECK (pg_catalog.char_length(idempotency_key) BETWEEN 1 AND 512),
  CONSTRAINT agent_usage_reservations_amount_chk CHECK (
    reserved_cost_usd >= 0 AND reserved_input_tokens >= 0 AND reserved_output_tokens >= 0
  ),
  CONSTRAINT agent_usage_reservations_run_key_unique UNIQUE (run_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_usage_reservations_scope_run
  ON public.agent_usage_reservations (tenant_id, workspace_id, run_id, created_at);

CREATE TABLE IF NOT EXISTS public.agent_usage_settlements (
  id text CONSTRAINT agent_usage_settlements_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  run_id text NOT NULL
    CONSTRAINT agent_usage_settlements_run_id_fkey
    REFERENCES public.agent_runs (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  reservation_id text NOT NULL
    CONSTRAINT agent_usage_settlements_reservation_id_fkey
    REFERENCES public.agent_usage_reservations (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status text NOT NULL,
  actual_cost_usd numeric(14,6) NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  provider_request_ref_hash text,
  settled_at timestamptz NOT NULL,
  CONSTRAINT agent_usage_settlements_id_length_chk CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT agent_usage_settlements_status_chk CHECK (status IN ('settled', 'released', 'rejected')),
  CONSTRAINT agent_usage_settlements_amount_chk CHECK (
    actual_cost_usd >= 0 AND input_tokens >= 0 AND output_tokens >= 0
  ),
  CONSTRAINT agent_usage_settlements_provider_ref_hash_chk CHECK (
    provider_request_ref_hash IS NULL OR provider_request_ref_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT agent_usage_settlements_reservation_unique UNIQUE (reservation_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_usage_settlements_scope_run
  ON public.agent_usage_settlements (tenant_id, workspace_id, run_id, settled_at);

CREATE OR REPLACE FUNCTION public.novatrade_agent_registry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_REGISTRY_VERSION_IMMUTABLE';
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_append_only_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUNTIME_RECORD_IMMUTABLE';
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_child_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  parent_tenant uuid;
  parent_workspace uuid;
BEGIN
  SELECT r.tenant_id, r.workspace_id
  INTO parent_tenant, parent_workspace
  FROM public.agent_runs AS r
  WHERE r.id = NEW.run_id;

  IF NOT FOUND
    OR NEW.tenant_id IS DISTINCT FROM parent_tenant
    OR NEW.workspace_id IS DISTINCT FROM parent_workspace THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_RUNTIME_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_run_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
    OR NEW.agent_role IS DISTINCT FROM OLD.agent_role
    OR NEW.agent_version IS DISTINCT FROM OLD.agent_version
    OR NEW.prompt_key IS DISTINCT FROM OLD.prompt_key
    OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
    OR NEW.policy_key IS DISTINCT FROM OLD.policy_key
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.budget_usd IS DISTINCT FROM OLD.budget_usd
    OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_EXECUTION_IDENTITY_IMMUTABLE';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_TIME_REGRESSION';
  END IF;

  IF OLD.status IN ('complete', 'failed', 'dead_letter', 'canceled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_TERMINAL';
  END IF;

  IF NOT ((OLD.status = 'queued' AND NEW.status IN ('running', 'canceled'))
    OR (OLD.status = 'running' AND NEW.status IN ('running', 'retry_wait', 'complete', 'failed', 'dead_letter', 'canceled'))
    OR (OLD.status = 'retry_wait' AND NEW.status IN ('running', 'canceled'))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_INVALID_TRANSITION';
  END IF;

  IF NEW.lease_generation = OLD.lease_generation + 1 THEN
    IF NEW.status <> 'running'
      OR NEW.attempt_count <> OLD.attempt_count + 1
      OR NEW.lease_token_hash IS NULL
      OR NEW.lease_worker_hash IS NULL
      OR NEW.lease_acquired_at IS NULL
      OR NEW.lease_heartbeat_at IS DISTINCT FROM NEW.lease_acquired_at THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_INVALID_LEASE_ACQUISITION';
    END IF;
  ELSIF NEW.lease_generation <> OLD.lease_generation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_INVALID_LEASE_GENERATION';
  ELSIF NEW.status = 'running' THEN
    IF OLD.status <> 'running'
      OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
      OR NEW.lease_token_hash IS DISTINCT FROM OLD.lease_token_hash
      OR NEW.lease_worker_hash IS DISTINCT FROM OLD.lease_worker_hash
      OR NEW.lease_acquired_at IS DISTINCT FROM OLD.lease_acquired_at
      OR NEW.lease_heartbeat_at < OLD.lease_heartbeat_at
      OR NEW.lease_expires_at < OLD.lease_expires_at THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGENT_RUN_INVALID_LEASE_HEARTBEAT';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_run_lease_history_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.lease_generation = OLD.lease_generation + 1 THEN
    INSERT INTO public.agent_run_lease_history (
      tenant_id, workspace_id, run_id, lease_generation, lease_token_hash,
      lease_worker_hash, acquired_at, heartbeat_at, expires_at
    ) VALUES (
      NEW.tenant_id, NEW.workspace_id, NEW.id, NEW.lease_generation,
      NEW.lease_token_hash, NEW.lease_worker_hash, NEW.lease_acquired_at,
      NEW.lease_heartbeat_at, NEW.lease_expires_at
    );
  ELSIF OLD.status = 'running' AND NEW.status = 'running' THEN
    UPDATE public.agent_run_lease_history
    SET heartbeat_at = NEW.lease_heartbeat_at, expires_at = NEW.lease_expires_at
    WHERE run_id = NEW.id AND lease_generation = NEW.lease_generation;
  ELSIF OLD.status = 'running' AND NEW.status <> 'running' THEN
    UPDATE public.agent_run_lease_history
    SET heartbeat_at = OLD.lease_heartbeat_at,
        expires_at = OLD.lease_expires_at,
        released_at = NEW.updated_at,
        release_reason = NEW.status
    WHERE run_id = NEW.id AND lease_generation = OLD.lease_generation;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_usage_settlement_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  reservation public.agent_usage_reservations%ROWTYPE;
BEGIN
  SELECT * INTO reservation
  FROM public.agent_usage_reservations AS r
  WHERE r.id = NEW.reservation_id;

  IF NOT FOUND
    OR reservation.run_id IS DISTINCT FROM NEW.run_id
    OR reservation.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR reservation.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR NEW.actual_cost_usd > reservation.reserved_cost_usd
    OR NEW.input_tokens > reservation.reserved_input_tokens
    OR NEW.output_tokens > reservation.reserved_output_tokens THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_USAGE_SETTLEMENT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_agent_tool_call_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  step_run_id text;
  step_tenant_id uuid;
  step_workspace_id uuid;
  parent_run_id text;
BEGIN
  SELECT s.run_id, s.tenant_id, s.workspace_id
  INTO step_run_id, step_tenant_id, step_workspace_id
  FROM public.agent_run_steps AS s
  WHERE s.id = NEW.step_id;

  IF NOT FOUND
    OR step_run_id IS DISTINCT FROM NEW.run_id
    OR step_tenant_id IS DISTINCT FROM NEW.tenant_id
    OR step_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_TOOL_CALL_STEP_MISMATCH';
  END IF;

  IF NEW.parent_tool_call_id IS NOT NULL THEN
    SELECT t.run_id INTO parent_run_id
    FROM public.agent_tool_calls AS t
    WHERE t.id = NEW.parent_tool_call_id;
    IF NOT FOUND OR parent_run_id IS DISTINCT FROM NEW.run_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_TOOL_CALL_PARENT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_agent_prompt_versions_immutable ON public.agent_prompt_versions;
CREATE TRIGGER trg_agent_prompt_versions_immutable
BEFORE UPDATE OR DELETE ON public.agent_prompt_versions
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_registry_immutable();
DROP TRIGGER IF EXISTS trg_agent_policy_versions_immutable ON public.agent_policy_versions;
CREATE TRIGGER trg_agent_policy_versions_immutable
BEFORE UPDATE OR DELETE ON public.agent_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_registry_immutable();

DROP TRIGGER IF EXISTS trg_agent_runs_guard ON public.agent_runs;
CREATE TRIGGER trg_agent_runs_guard
BEFORE UPDATE ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_run_guard();
DROP TRIGGER IF EXISTS trg_agent_runs_lease_history_sync ON public.agent_runs;
CREATE TRIGGER trg_agent_runs_lease_history_sync
AFTER UPDATE ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_run_lease_history_sync();

DO $triggers$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'agent_run_lease_history', 'agent_run_steps', 'agent_tool_calls',
    'agent_usage_reservations'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_%I_scope_guard ON public.%I', target_table, target_table);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_%I_scope_guard BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_child_scope_guard()',
      target_table, target_table
    );
  END LOOP;

  FOREACH target_table IN ARRAY ARRAY[
    'agent_run_steps', 'agent_tool_calls', 'agent_usage_reservations',
    'agent_usage_settlements'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I', target_table, target_table);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_append_only_immutable()',
      target_table, target_table
    );
  END LOOP;
END;
$triggers$;

DROP TRIGGER IF EXISTS trg_agent_tool_calls_parent_guard ON public.agent_tool_calls;
CREATE TRIGGER trg_agent_tool_calls_parent_guard
BEFORE INSERT ON public.agent_tool_calls
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_tool_call_guard();

DROP TRIGGER IF EXISTS trg_agent_usage_settlements_scope_guard ON public.agent_usage_settlements;
CREATE TRIGGER trg_agent_usage_settlements_scope_guard
BEFORE INSERT ON public.agent_usage_settlements
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_child_scope_guard();
DROP TRIGGER IF EXISTS trg_agent_usage_settlements_reservation_guard ON public.agent_usage_settlements;
CREATE TRIGGER trg_agent_usage_settlements_reservation_guard
BEFORE INSERT ON public.agent_usage_settlements
FOR EACH ROW EXECUTE FUNCTION public.novatrade_agent_usage_settlement_guard();

DO $security$
DECLARE
  target_table text;
  target_function text;
  target_role text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'agent_prompt_versions', 'agent_policy_versions', 'agent_runs',
    'agent_run_lease_history', 'agent_run_steps', 'agent_tool_calls',
    'agent_usage_reservations', 'agent_usage_settlements'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', target_table);
    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = target_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM %I', target_table, target_role);
      END IF;
    END LOOP;
  END LOOP;

  REVOKE ALL ON SEQUENCE public.agent_run_lease_history_id_seq FROM PUBLIC;
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = target_role) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON SEQUENCE public.agent_run_lease_history_id_seq FROM %I', target_role
      );
    END IF;
  END LOOP;

  FOREACH target_function IN ARRAY ARRAY[
    'public.novatrade_agent_registry_immutable()',
    'public.novatrade_agent_append_only_immutable()',
    'public.novatrade_agent_child_scope_guard()',
    'public.novatrade_agent_run_guard()',
    'public.novatrade_agent_run_lease_history_sync()',
    'public.novatrade_agent_usage_settlement_guard()',
    'public.novatrade_agent_tool_call_guard()'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', target_function);
    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = target_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I', target_function, target_role);
      END IF;
    END LOOP;
  END LOOP;
END;
$security$;

COMMENT ON TABLE public.agent_runs IS
  'Tenant-scoped durable agent execution identity and state. Runtime access remains denied pending an accepted worker lease authority contract.';
COMMENT ON COLUMN public.agent_runs.lease_token_hash IS
  'One-way lease capability digest; plaintext worker credentials must never be persisted.';
COMMENT ON TABLE public.agent_run_lease_history IS
  'Append-only lease generations used to fence stale heartbeats and completion attempts.';
COMMENT ON TABLE public.agent_prompt_versions IS
  'Immutable prompt registry metadata; prompt bodies live behind instructions_ref and are never duplicated here.';
COMMENT ON TABLE public.agent_policy_versions IS
  'Immutable provider/tool policy metadata. State does not itself grant provider or worker authority.';

DO $catalog_receipt$
DECLARE
  table_count integer;
  rls_count integer;
  policy_count integer;
  trigger_count integer;
BEGIN
  SELECT count(*) INTO table_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'agent_prompt_versions', 'agent_policy_versions', 'agent_runs',
      'agent_run_lease_history', 'agent_run_steps', 'agent_tool_calls',
      'agent_usage_reservations', 'agent_usage_settlements'
    ]);
  SELECT count(*) INTO rls_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relforcerowsecurity
    AND c.relname = ANY (ARRAY[
      'agent_prompt_versions', 'agent_policy_versions', 'agent_runs',
      'agent_run_lease_history', 'agent_run_steps', 'agent_tool_calls',
      'agent_usage_reservations', 'agent_usage_settlements'
    ]);
  SELECT count(*) INTO policy_count
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = ANY (ARRAY[
    'public.agent_prompt_versions'::regclass,
    'public.agent_policy_versions'::regclass,
    'public.agent_runs'::regclass,
    'public.agent_run_lease_history'::regclass,
    'public.agent_run_steps'::regclass,
    'public.agent_tool_calls'::regclass,
    'public.agent_usage_reservations'::regclass,
    'public.agent_usage_settlements'::regclass
  ]);
  SELECT count(*) INTO trigger_count
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgrelid = ANY (ARRAY[
    'public.agent_prompt_versions'::regclass,
    'public.agent_policy_versions'::regclass,
    'public.agent_runs'::regclass,
    'public.agent_run_lease_history'::regclass,
    'public.agent_run_steps'::regclass,
    'public.agent_tool_calls'::regclass,
    'public.agent_usage_reservations'::regclass,
    'public.agent_usage_settlements'::regclass
  ]);
  IF table_count <> 8 OR rls_count <> 8 OR policy_count <> 0 OR trigger_count <> 15 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'F06_AGENT_RUNTIME_CATALOG_INCOMPLETE';
  END IF;
END;
$catalog_receipt$;

COMMIT;
