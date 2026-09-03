-- F-01 durable worker-dispatch authority. Raw selectors are never persisted;
-- only their lowercase SHA-256 digest crosses this database boundary.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:f01:tenant-worker-dispatch-foundation'));

-- All lease-table bypass is concentrated in a non-login, non-superuser owner of
-- the narrowly exposed SECURITY DEFINER capabilities below. FORCE RLS therefore
-- never relies on the migration superuser or on table-owner bypass.
DO $block$
DECLARE
  role_attributes pg_catalog.record;
BEGIN
  SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls
    INTO role_attributes
  FROM pg_catalog.pg_roles
  WHERE rolname='novatrade_worker_dispatch_definer';

  IF NOT FOUND THEN
    CREATE ROLE novatrade_worker_dispatch_definer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
  ELSIF role_attributes.rolcanlogin OR role_attributes.rolsuper OR role_attributes.rolcreatedb
     OR role_attributes.rolcreaterole OR role_attributes.rolinherit OR role_attributes.rolreplication
     OR NOT role_attributes.rolbypassrls
  THEN
    RAISE EXCEPTION 'novatrade_worker_dispatch_definer has unsafe attributes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS protected_role
      ON protected_role.oid IN (membership.roleid,membership.member)
    WHERE protected_role.rolname='novatrade_worker_dispatch_definer'
  ) THEN
    RAISE EXCEPTION 'novatrade_worker_dispatch_definer must have no role memberships';
  END IF;
END;
$block$;

CREATE TABLE public.tenant_worker_dispatch_leases (
  lease_id pg_catalog.uuid CONSTRAINT tenant_worker_dispatch_leases_pkey PRIMARY KEY,
  tenant_id pg_catalog.uuid NOT NULL,
  workspace_id pg_catalog.uuid,
  job_id pg_catalog.uuid NOT NULL,
  run_id pg_catalog.uuid NOT NULL,
  selector_hash pg_catalog.text NOT NULL
    CONSTRAINT tenant_worker_dispatch_leases_selector_hash_chk
    CHECK (selector_hash ~ '^[0-9a-f]{64}$'),
  lease_generation pg_catalog.int8 NOT NULL
    CONSTRAINT tenant_worker_dispatch_leases_generation_chk
    CHECK (lease_generation BETWEEN 1 AND 9007199254740991),
  worker_name pg_catalog.text NOT NULL
    CONSTRAINT tenant_worker_dispatch_leases_worker_name_chk
    CHECK (worker_name IN ('ai_verification','crawl','enrichment','artifact','score_recompute')),
  action pg_catalog.text NOT NULL,
  not_before pg_catalog.timestamptz(3) NOT NULL,
  expires_at pg_catalog.timestamptz(3) NOT NULL,
  revoked_at pg_catalog.timestamptz(3),
  revocation_reason pg_catalog.text,
  correlation_id pg_catalog.text NOT NULL
    CONSTRAINT tenant_worker_dispatch_leases_correlation_id_chk
    CHECK (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  record_version pg_catalog.int2 NOT NULL DEFAULT 1
    CONSTRAINT tenant_worker_dispatch_leases_record_version_chk CHECK (record_version = 1),
  integrity_version pg_catalog.text NOT NULL DEFAULT 'internal-worker-lease-v1'
    CONSTRAINT tenant_worker_dispatch_leases_integrity_version_chk
    CHECK (integrity_version = 'internal-worker-lease-v1'),
  created_at pg_catalog.timestamptz(3) NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  updated_at pg_catalog.timestamptz(3) NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  CONSTRAINT tenant_worker_dispatch_leases_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_worker_dispatch_leases_workspace_tenant_fkey
    FOREIGN KEY (tenant_id,workspace_id) REFERENCES public.workspaces(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_worker_dispatch_leases_selector_hash_unique UNIQUE (selector_hash),
  CONSTRAINT tenant_worker_dispatch_leases_dispatch_generation_unique
    UNIQUE (tenant_id,job_id,worker_name,action,lease_generation),
  CONSTRAINT tenant_worker_dispatch_leases_window_chk
    CHECK (expires_at > not_before),
  CONSTRAINT tenant_worker_dispatch_leases_revocation_chk
    CHECK (
      (revoked_at IS NULL AND revocation_reason IS NULL)
      OR (revoked_at >= created_at AND revocation_reason IN ('cancelled','superseded'))
    ),
  CONSTRAINT tenant_worker_dispatch_leases_action_chk
    CHECK (action = CASE worker_name
      WHEN 'ai_verification' THEN 'ai_verification:process'
      WHEN 'crawl' THEN 'crawl:process'
      WHEN 'enrichment' THEN 'enrichment:process'
      WHEN 'artifact' THEN 'artifact:process'
      WHEN 'score_recompute' THEN 'score_recompute:recompute'
    END)
);

COMMENT ON TABLE public.tenant_worker_dispatch_leases IS
  'F-01 durable pre-GUC worker dispatch authority; raw selectors and provider work are never stored or executed here.';
COMMENT ON COLUMN public.tenant_worker_dispatch_leases.selector_hash IS
  'Lowercase SHA-256 digest of the server-issued opaque selector; the raw bearer selector is never persisted.';
COMMENT ON COLUMN public.tenant_worker_dispatch_leases.lease_generation IS
  'Strictly increasing per tenant/job/worker/action fencing generation; stale generations cannot be reacquired.';
COMMENT ON COLUMN public.tenant_worker_dispatch_leases.revoked_at IS
  'Terminal revocation or supersession time; a revoked generation never becomes valid again.';
COMMENT ON COLUMN public.tenant_worker_dispatch_leases.revocation_reason IS
  'Terminal state reason: exact fenced dispatcher cancellation or strict newer-generation supersession.';

CREATE INDEX idx_tenant_worker_dispatch_leases_context
  ON public.tenant_worker_dispatch_leases
  (tenant_id,job_id,run_id,lease_id,lease_generation,worker_name,action);
CREATE INDEX idx_tenant_worker_dispatch_leases_workspace
  ON public.tenant_worker_dispatch_leases (tenant_id,workspace_id)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_tenant_worker_dispatch_leases_expiry
  ON public.tenant_worker_dispatch_leases (expires_at)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.novatrade_tenant_worker_dispatch_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.selector_hash IS DISTINCT FROM OLD.selector_hash
     OR NEW.lease_generation IS DISTINCT FROM OLD.lease_generation
     OR NEW.worker_name IS DISTINCT FROM OLD.worker_name
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.not_before IS DISTINCT FROM OLD.not_before
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.record_version IS DISTINCT FROM OLD.record_version
     OR NEW.integrity_version IS DISTINCT FROM OLD.integrity_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'tenant worker dispatch lease authority facts are immutable';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'tenant worker dispatch lease revocation is terminal';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason THEN
    RAISE EXCEPTION 'tenant worker dispatch lease revocation reason is terminal';
  END IF;
  IF (NEW.revoked_at IS NULL) IS DISTINCT FROM (NEW.revocation_reason IS NULL) THEN
    RAISE EXCEPTION 'tenant worker dispatch lease revocation state is inconsistent';
  END IF;
  NEW.updated_at := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_novatrade_tenant_worker_dispatch_guard
BEFORE UPDATE ON public.tenant_worker_dispatch_leases
FOR EACH ROW EXECUTE FUNCTION public.novatrade_tenant_worker_dispatch_guard();

CREATE OR REPLACE FUNCTION public.novatrade_acquire_tenant_worker_lease(
  p_selector_hash pg_catalog.text,
  p_tenant_id pg_catalog.text,
  p_workspace_id pg_catalog.text,
  p_job_id pg_catalog.text,
  p_run_id pg_catalog.text,
  p_lease_id pg_catalog.text,
  p_lease_generation pg_catalog.text,
  p_worker_name pg_catalog.text,
  p_action pg_catalog.text,
  p_not_before pg_catalog.text,
  p_expires_at pg_catalog.text,
  p_correlation_id pg_catalog.text
)
RETURNS TABLE (
  kind pg_catalog.text,
  tenant_id pg_catalog.uuid,
  workspace_id pg_catalog.uuid,
  job_id pg_catalog.uuid,
  run_id pg_catalog.uuid,
  lease_id pg_catalog.uuid,
  selector_hash pg_catalog.text,
  lease_generation pg_catalog.int8,
  worker_name pg_catalog.text,
  action pg_catalog.text,
  not_before pg_catalog.timestamptz,
  expires_at pg_catalog.timestamptz,
  correlation_id pg_catalog.text,
  record_version pg_catalog.int2,
  integrity_version pg_catalog.text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tenant_uuid pg_catalog.uuid;
  workspace_uuid pg_catalog.uuid;
  job_uuid pg_catalog.uuid;
  run_uuid pg_catalog.uuid;
  lease_uuid pg_catalog.uuid;
  generation_value pg_catalog.int8;
  not_before_value pg_catalog.timestamptz;
  expires_at_value pg_catalog.timestamptz;
  current_generation pg_catalog.int8;
  current_workspace pg_catalog.uuid;
  current_run pg_catalog.uuid;
BEGIN
  IF p_selector_hash IS NULL OR p_selector_hash !~ '^[0-9a-f]{64}$'
     OR p_tenant_id IS NULL OR p_tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (p_workspace_id IS NOT NULL AND p_workspace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR p_job_id IS NULL OR p_job_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_run_id IS NULL OR p_run_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_id IS NULL OR p_lease_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_generation IS NULL OR p_lease_generation !~ '^[1-9][0-9]{0,15}$'
     OR p_worker_name IS NULL OR p_worker_name NOT IN ('ai_verification','crawl','enrichment','artifact','score_recompute')
     OR p_action IS NULL OR p_action IS DISTINCT FROM (CASE p_worker_name
       WHEN 'ai_verification' THEN 'ai_verification:process'
       WHEN 'crawl' THEN 'crawl:process'
       WHEN 'enrichment' THEN 'enrichment:process'
       WHEN 'artifact' THEN 'artifact:process'
       WHEN 'score_recompute' THEN 'score_recompute:recompute'
     END)
     OR p_not_before IS NULL
     OR p_expires_at IS NULL
     OR p_correlation_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  THEN
    RETURN;
  END IF;

  BEGIN
    tenant_uuid := p_tenant_id::pg_catalog.uuid;
    workspace_uuid := p_workspace_id::pg_catalog.uuid;
    job_uuid := p_job_id::pg_catalog.uuid;
    run_uuid := p_run_id::pg_catalog.uuid;
    lease_uuid := p_lease_id::pg_catalog.uuid;
    generation_value := p_lease_generation::pg_catalog.int8;
    not_before_value := p_not_before::pg_catalog.timestamptz;
    expires_at_value := p_expires_at::pg_catalog.timestamptz;
  EXCEPTION WHEN others THEN
    RETURN;
  END;

  IF generation_value NOT BETWEEN 1 AND 9007199254740991
     OR expires_at_value <= not_before_value
     OR expires_at_value <= pg_catalog.statement_timestamp()
     OR not_before_value > pg_catalog.statement_timestamp() + pg_catalog.interval '1 minute'
     OR expires_at_value > pg_catalog.statement_timestamp() + pg_catalog.interval '1 hour'
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants AS tenant
       WHERE tenant.id=tenant_uuid AND tenant.status='active'
     )
     OR (workspace_uuid IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.workspaces AS workspace
       WHERE workspace.tenant_id=tenant_uuid AND workspace.id=workspace_uuid AND workspace.status='active'
     ))
  THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    tenant_uuid::pg_catalog.text || ':' || job_uuid::pg_catalog.text || ':' || p_worker_name || ':' || p_action,
    0
  ));

  SELECT lease.lease_generation, lease.workspace_id, lease.run_id
    INTO current_generation, current_workspace, current_run
  FROM public.tenant_worker_dispatch_leases AS lease
  WHERE lease.tenant_id=tenant_uuid AND lease.job_id=job_uuid
    AND lease.worker_name=p_worker_name AND lease.action=p_action
  ORDER BY lease.lease_generation DESC
  LIMIT 1;

  IF current_generation IS NOT NULL AND (
    current_workspace IS DISTINCT FROM workspace_uuid OR current_run IS DISTINCT FROM run_uuid
  ) THEN
    RETURN;
  END IF;

  IF current_generation IS NOT NULL AND generation_value < current_generation THEN
    RETURN;
  END IF;

  IF current_generation IS NOT NULL AND generation_value = current_generation THEN
    RETURN QUERY
    SELECT 'replay'::pg_catalog.text, lease.tenant_id, lease.workspace_id, lease.job_id,
      lease.run_id, lease.lease_id, lease.selector_hash, lease.lease_generation, lease.worker_name,
      lease.action, lease.not_before, lease.expires_at, lease.correlation_id,
      lease.record_version, lease.integrity_version
    FROM public.tenant_worker_dispatch_leases AS lease
    WHERE lease.tenant_id=tenant_uuid AND lease.job_id=job_uuid
      AND lease.worker_name=p_worker_name AND lease.action=p_action
      AND lease.lease_generation=generation_value
      AND lease.lease_id=lease_uuid AND lease.selector_hash=p_selector_hash
      AND lease.workspace_id IS NOT DISTINCT FROM workspace_uuid
      AND lease.run_id=run_uuid AND lease.not_before=not_before_value
      AND lease.expires_at=expires_at_value AND lease.correlation_id=p_correlation_id
      AND lease.revoked_at IS NULL
      AND pg_catalog.statement_timestamp() < lease.expires_at;
    RETURN;
  END IF;

  UPDATE public.tenant_worker_dispatch_leases AS lease
  SET revoked_at=pg_catalog.statement_timestamp(), revocation_reason='superseded'
  WHERE lease.tenant_id=tenant_uuid AND lease.job_id=job_uuid
    AND lease.worker_name=p_worker_name AND lease.action=p_action
    AND lease.revoked_at IS NULL;

  INSERT INTO public.tenant_worker_dispatch_leases (
    lease_id,tenant_id,workspace_id,job_id,run_id,selector_hash,lease_generation,
    worker_name,action,not_before,expires_at,correlation_id
  ) VALUES (
    lease_uuid,tenant_uuid,workspace_uuid,job_uuid,run_uuid,p_selector_hash,generation_value,
    p_worker_name,p_action,not_before_value,expires_at_value,p_correlation_id
  );

  RETURN QUERY
  SELECT 'created'::pg_catalog.text, lease.tenant_id, lease.workspace_id, lease.job_id,
    lease.run_id, lease.lease_id, lease.selector_hash, lease.lease_generation, lease.worker_name,
    lease.action, lease.not_before, lease.expires_at, lease.correlation_id,
    lease.record_version, lease.integrity_version
  FROM public.tenant_worker_dispatch_leases AS lease
  WHERE lease.lease_id=lease_uuid;
EXCEPTION
  WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range THEN
    RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_cancel_tenant_worker_lease(
  p_selector_hash pg_catalog.text,
  p_tenant_id pg_catalog.text,
  p_workspace_id pg_catalog.text,
  p_job_id pg_catalog.text,
  p_run_id pg_catalog.text,
  p_lease_id pg_catalog.text,
  p_lease_generation pg_catalog.text,
  p_worker_name pg_catalog.text,
  p_action pg_catalog.text,
  p_not_before pg_catalog.text,
  p_expires_at pg_catalog.text,
  p_correlation_id pg_catalog.text
)
RETURNS TABLE (
  kind pg_catalog.text,
  tenant_id pg_catalog.uuid,
  workspace_id pg_catalog.uuid,
  job_id pg_catalog.uuid,
  run_id pg_catalog.uuid,
  lease_id pg_catalog.uuid,
  selector_hash pg_catalog.text,
  lease_generation pg_catalog.int8,
  worker_name pg_catalog.text,
  action pg_catalog.text,
  not_before pg_catalog.timestamptz,
  expires_at pg_catalog.timestamptz,
  correlation_id pg_catalog.text,
  record_version pg_catalog.int2,
  integrity_version pg_catalog.text,
  revoked_at pg_catalog.timestamptz,
  revocation_reason pg_catalog.text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tenant_uuid pg_catalog.uuid;
  workspace_uuid pg_catalog.uuid;
  job_uuid pg_catalog.uuid;
  run_uuid pg_catalog.uuid;
  lease_uuid pg_catalog.uuid;
  generation_value pg_catalog.int8;
  not_before_value pg_catalog.timestamptz;
  expires_at_value pg_catalog.timestamptz;
BEGIN
  IF p_selector_hash IS NULL OR p_selector_hash !~ '^[0-9a-f]{64}$'
     OR p_tenant_id IS NULL OR p_tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (p_workspace_id IS NOT NULL AND p_workspace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR p_job_id IS NULL OR p_job_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_run_id IS NULL OR p_run_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_id IS NULL OR p_lease_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_generation IS NULL OR p_lease_generation !~ '^[1-9][0-9]{0,15}$'
     OR p_action IS NULL OR p_action IS DISTINCT FROM (CASE p_worker_name
       WHEN 'ai_verification' THEN 'ai_verification:process'
       WHEN 'crawl' THEN 'crawl:process'
       WHEN 'enrichment' THEN 'enrichment:process'
       WHEN 'artifact' THEN 'artifact:process'
       WHEN 'score_recompute' THEN 'score_recompute:recompute'
     END)
     OR p_not_before IS NULL OR p_expires_at IS NULL
     OR p_correlation_id IS NULL OR p_correlation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  THEN
    RETURN;
  END IF;

  BEGIN
    tenant_uuid := p_tenant_id::pg_catalog.uuid;
    workspace_uuid := p_workspace_id::pg_catalog.uuid;
    job_uuid := p_job_id::pg_catalog.uuid;
    run_uuid := p_run_id::pg_catalog.uuid;
    lease_uuid := p_lease_id::pg_catalog.uuid;
    generation_value := p_lease_generation::pg_catalog.int8;
    not_before_value := p_not_before::pg_catalog.timestamptz;
    expires_at_value := p_expires_at::pg_catalog.timestamptz;
  EXCEPTION WHEN others THEN
    RETURN;
  END;

  IF generation_value NOT BETWEEN 1 AND 9007199254740991 THEN RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    tenant_uuid::pg_catalog.text || ':' || job_uuid::pg_catalog.text || ':' || p_worker_name || ':' || p_action,
    0
  ));

  RETURN QUERY
  WITH cancelled AS (
    UPDATE public.tenant_worker_dispatch_leases AS lease
    SET revoked_at=pg_catalog.statement_timestamp(), revocation_reason='cancelled'
    WHERE lease.selector_hash=p_selector_hash
      AND lease.tenant_id=tenant_uuid
      AND lease.workspace_id IS NOT DISTINCT FROM workspace_uuid
      AND lease.job_id=job_uuid AND lease.run_id=run_uuid AND lease.lease_id=lease_uuid
      AND lease.lease_generation=generation_value
      AND lease.worker_name=p_worker_name AND lease.action=p_action
      AND lease.not_before=not_before_value AND lease.expires_at=expires_at_value
      AND lease.correlation_id=p_correlation_id
      AND lease.revoked_at IS NULL
      AND pg_catalog.statement_timestamp() < lease.expires_at
    RETURNING lease.*
  )
  SELECT 'cancelled'::pg_catalog.text, lease.tenant_id,lease.workspace_id,lease.job_id,
    lease.run_id,lease.lease_id,lease.selector_hash,lease.lease_generation,lease.worker_name,lease.action,
    lease.not_before,lease.expires_at,lease.correlation_id,lease.record_version,
    lease.integrity_version,lease.revoked_at,lease.revocation_reason
  FROM cancelled AS lease;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'replay'::pg_catalog.text, lease.tenant_id,lease.workspace_id,lease.job_id,
    lease.run_id,lease.lease_id,lease.selector_hash,lease.lease_generation,lease.worker_name,lease.action,
    lease.not_before,lease.expires_at,lease.correlation_id,lease.record_version,
    lease.integrity_version,lease.revoked_at,lease.revocation_reason
  FROM public.tenant_worker_dispatch_leases AS lease
  WHERE lease.selector_hash=p_selector_hash
    AND lease.tenant_id=tenant_uuid
    AND lease.workspace_id IS NOT DISTINCT FROM workspace_uuid
    AND lease.job_id=job_uuid AND lease.run_id=run_uuid AND lease.lease_id=lease_uuid
    AND lease.lease_generation=generation_value
    AND lease.worker_name=p_worker_name AND lease.action=p_action
    AND lease.not_before=not_before_value AND lease.expires_at=expires_at_value
    AND lease.correlation_id=p_correlation_id
    AND lease.revocation_reason='cancelled';
EXCEPTION WHEN others THEN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_resolve_tenant_worker_lease(
  p_selector_hash pg_catalog.text,
  p_worker_name pg_catalog.text,
  p_action pg_catalog.text
)
RETURNS TABLE (
  tenant_id pg_catalog.uuid,
  workspace_id pg_catalog.uuid,
  job_id pg_catalog.uuid,
  run_id pg_catalog.uuid,
  lease_id pg_catalog.uuid,
  lease_generation pg_catalog.int8,
  worker_name pg_catalog.text,
  action pg_catalog.text,
  status pg_catalog.text,
  not_before pg_catalog.timestamptz,
  expires_at pg_catalog.timestamptz,
  correlation_id pg_catalog.text,
  record_version pg_catalog.int2,
  integrity_version pg_catalog.text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_selector_hash IS NULL OR p_selector_hash !~ '^[0-9a-f]{64}$'
     OR p_worker_name IS NULL
     OR p_action IS NULL
     OR p_action IS DISTINCT FROM (CASE p_worker_name
       WHEN 'ai_verification' THEN 'ai_verification:process'
       WHEN 'crawl' THEN 'crawl:process'
       WHEN 'enrichment' THEN 'enrichment:process'
       WHEN 'artifact' THEN 'artifact:process'
       WHEN 'score_recompute' THEN 'score_recompute:recompute'
     END)
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT lease.tenant_id,lease.workspace_id,lease.job_id,lease.run_id,lease.lease_id,
    lease.lease_generation,lease.worker_name,lease.action,'active'::pg_catalog.text,
    lease.not_before,lease.expires_at,lease.correlation_id,lease.record_version,lease.integrity_version
  FROM public.tenant_worker_dispatch_leases AS lease
  JOIN public.tenants AS tenant ON tenant.id=lease.tenant_id AND tenant.status='active'
  LEFT JOIN public.workspaces AS workspace
    ON workspace.tenant_id=lease.tenant_id AND workspace.id=lease.workspace_id AND workspace.status='active'
  WHERE lease.selector_hash=p_selector_hash
    AND lease.worker_name=p_worker_name AND lease.action=p_action
    AND lease.revoked_at IS NULL
    AND lease.not_before <= pg_catalog.statement_timestamp()
    AND pg_catalog.statement_timestamp() < lease.expires_at
    AND (lease.workspace_id IS NULL OR workspace.id IS NOT NULL);
EXCEPTION WHEN others THEN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_validate_tenant_worker_lease()
RETURNS pg_catalog.bool
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tenant_setting pg_catalog.text := pg_catalog.current_setting('app.tenant_id',true);
  workspace_setting pg_catalog.text := pg_catalog.current_setting('app.workspace_id',true);
  job_setting pg_catalog.text := pg_catalog.current_setting('app.job_id',true);
  run_setting pg_catalog.text := pg_catalog.current_setting('app.run_id',true);
  lease_setting pg_catalog.text := pg_catalog.current_setting('app.lease_id',true);
  generation_setting pg_catalog.text := pg_catalog.current_setting('app.lease_generation',true);
  worker_setting pg_catalog.text := pg_catalog.current_setting('app.worker_name',true);
  action_setting pg_catalog.text := pg_catalog.current_setting('app.worker_action',true);
  principal_setting pg_catalog.text := pg_catalog.current_setting('app.worker_principal_kind',true);
  correlation_setting pg_catalog.text := pg_catalog.current_setting('app.correlation_id',true);
BEGIN
  IF tenant_setting IS NULL OR tenant_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (coalesce(workspace_setting,'') <> '' AND workspace_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR job_setting IS NULL OR job_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR run_setting IS NULL OR run_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lease_setting IS NULL OR lease_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR generation_setting IS NULL OR generation_setting !~ '^[1-9][0-9]{0,15}$'
     OR principal_setting NOT IN ('cron','session')
     OR correlation_setting IS NULL OR correlation_setting !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     OR coalesce(pg_catalog.current_setting('app.actor_id',true),'') <> ''
     OR coalesce(pg_catalog.current_setting('app.membership_id',true),'') <> ''
     OR coalesce(pg_catalog.current_setting('app.role',true),'') <> ''
     OR coalesce(pg_catalog.current_setting('app.role_binding_id',true),'') <> ''
     OR coalesce(pg_catalog.current_setting('app.support_grant_id',true),'') <> ''
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_worker_dispatch_leases AS lease
    JOIN public.tenants AS tenant ON tenant.id=lease.tenant_id AND tenant.status='active'
    LEFT JOIN public.workspaces AS workspace
      ON workspace.tenant_id=lease.tenant_id AND workspace.id=lease.workspace_id AND workspace.status='active'
    WHERE lease.tenant_id=tenant_setting::pg_catalog.uuid
      AND lease.workspace_id IS NOT DISTINCT FROM nullif(workspace_setting,'')::pg_catalog.uuid
      AND lease.job_id=job_setting::pg_catalog.uuid
      AND lease.run_id=run_setting::pg_catalog.uuid
      AND lease.lease_id=lease_setting::pg_catalog.uuid
      AND lease.lease_generation=generation_setting::pg_catalog.int8
      AND lease.worker_name=worker_setting
      AND lease.action=action_setting
      AND lease.correlation_id=correlation_setting
      AND lease.revoked_at IS NULL
      AND lease.not_before <= pg_catalog.statement_timestamp()
      AND pg_catalog.statement_timestamp() < lease.expires_at
      AND (lease.workspace_id IS NULL OR workspace.id IS NOT NULL)
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

REVOKE ALL ON TABLE public.tenant_worker_dispatch_leases FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_tenant_worker_dispatch_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_worker_lease(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_validate_tenant_worker_lease() FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)
  OWNER TO novatrade_worker_dispatch_definer;
ALTER FUNCTION public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)
  OWNER TO novatrade_worker_dispatch_definer;
ALTER FUNCTION public.novatrade_resolve_tenant_worker_lease(text,text,text)
  OWNER TO novatrade_worker_dispatch_definer;
ALTER FUNCTION public.novatrade_validate_tenant_worker_lease()
  OWNER TO novatrade_worker_dispatch_definer;
REVOKE ALL ON FUNCTION public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_worker_lease(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.novatrade_validate_tenant_worker_lease() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO novatrade_worker_dispatch_definer;
GRANT SELECT ON TABLE public.tenants,public.workspaces TO novatrade_worker_dispatch_definer;
GRANT SELECT,INSERT,UPDATE ON TABLE public.tenant_worker_dispatch_leases TO novatrade_worker_dispatch_definer;

ALTER TABLE public.tenant_worker_dispatch_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_worker_dispatch_leases FORCE ROW LEVEL SECURITY;

CREATE POLICY f01_worker_dispatch_exact_select ON public.tenant_worker_dispatch_leases
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_validate_tenant_worker_lease()
    AND tenant_id::pg_catalog.text=pg_catalog.current_setting('app.tenant_id',true)
    AND workspace_id::pg_catalog.text IS NOT DISTINCT FROM nullif(pg_catalog.current_setting('app.workspace_id',true),'')
    AND job_id::pg_catalog.text=pg_catalog.current_setting('app.job_id',true)
    AND run_id::pg_catalog.text=pg_catalog.current_setting('app.run_id',true)
    AND lease_id::pg_catalog.text=pg_catalog.current_setting('app.lease_id',true)
    AND lease_generation::pg_catalog.text=pg_catalog.current_setting('app.lease_generation',true)
    AND worker_name=pg_catalog.current_setting('app.worker_name',true)
    AND action=pg_catalog.current_setting('app.worker_action',true)
    AND correlation_id=pg_catalog.current_setting('app.correlation_id',true)
  );
CREATE POLICY f01_worker_dispatch_deny_mutations ON public.tenant_worker_dispatch_leases
  FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

COMMENT ON FUNCTION public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) IS
  'F-01 short transaction dispatcher capability: exact replay or strictly newer generation; no provider work.';
COMMENT ON FUNCTION public.novatrade_resolve_tenant_worker_lease(text,text,text) IS
  'F-01 pre-GUC digest resolver; returns one live exact-action authority row or no row.';
COMMENT ON FUNCTION public.novatrade_validate_tenant_worker_lease() IS
  'F-01 boolean worker-context validator binding every worker GUC to one live durable generation.';
COMMENT ON FUNCTION public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) IS
  'F-01 exact generation-fenced terminal cancellation; exact cancelled retries replay and stale/superseded capabilities return no row.';

COMMIT;
