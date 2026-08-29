-- F-09 current source-policy selection and revocation lifecycle.
--
-- Policy-version rows remain immutable evidence. A separate activation row is
-- mutable only once, from current to revoked, and its partial unique index is
-- the authoritative one-current-policy selector for a tenant/workspace/key.
-- Runtime access remains denied pending an accepted repository/action contract.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('novatrade:f09:current-source-policy-lifecycle')
);

ALTER TABLE public.connector_versions
  ADD COLUMN IF NOT EXISTS requires_attestation boolean
  GENERATED ALWAYS AS (source_card_id <> 'google_places_legacy') STORED;

ALTER TABLE public.source_policy_versions
  ADD COLUMN IF NOT EXISTS workspace_scope_present boolean
  GENERATED ALWAYS AS (workspace_id IS NOT NULL) STORED,
  ADD COLUMN IF NOT EXISTS workspace_scope_id uuid
  GENERATED ALWAYS AS (
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_policy_versions_activation_target
  ON public.source_policy_versions (
    tenant_id, workspace_scope_present, workspace_scope_id, policy_key, version, id
  );

CREATE TABLE IF NOT EXISTS public.current_source_policy_activations (
  id text CONSTRAINT current_source_policy_activations_pkey PRIMARY KEY,
  tenant_id uuid NOT NULL CONSTRAINT current_source_policy_activations_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  workspace_scope_present boolean GENERATED ALWAYS AS (workspace_id IS NOT NULL) STORED,
  workspace_scope_id uuid GENERATED ALWAYS AS (
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  policy_key text NOT NULL,
  policy_version integer NOT NULL,
  source_policy_id text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  activated_by_hash text NOT NULL,
  activation_reason text NOT NULL,
  revoked_at timestamptz,
  revoked_by_hash text,
  revocation_reason text,
  CONSTRAINT current_source_policy_activations_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT current_source_policy_activations_exact_policy_fkey
    FOREIGN KEY (
      tenant_id, workspace_scope_present, workspace_scope_id,
      policy_key, policy_version, source_policy_id
    )
    REFERENCES public.source_policy_versions (
      tenant_id, workspace_scope_present, workspace_scope_id, policy_key, version, id
    ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT current_source_policy_activations_id_length_chk
    CHECK (pg_catalog.char_length(id) BETWEEN 1 AND 160),
  CONSTRAINT current_source_policy_activations_key_length_chk
    CHECK (pg_catalog.char_length(policy_key) BETWEEN 1 AND 160),
  CONSTRAINT current_source_policy_activations_version_chk CHECK (policy_version > 0),
  CONSTRAINT current_source_policy_activations_actor_hash_chk CHECK (
    activated_by_hash ~ '^[0-9a-f]{64}$'
    AND (revoked_by_hash IS NULL OR revoked_by_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT current_source_policy_activations_reason_chk CHECK (
    pg_catalog.char_length(activation_reason) BETWEEN 1 AND 1000
    AND activation_reason = pg_catalog.btrim(activation_reason)
    AND activation_reason !~ '[[:cntrl:]]'
    AND (revocation_reason IS NULL OR (
      pg_catalog.char_length(revocation_reason) BETWEEN 1 AND 1000
      AND revocation_reason = pg_catalog.btrim(revocation_reason)
      AND revocation_reason !~ '[[:cntrl:]]'
    ))
  ),
  CONSTRAINT current_source_policy_activations_revocation_shape_chk CHECK (
    (revoked_at IS NULL AND revoked_by_hash IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_hash IS NOT NULL AND revocation_reason IS NOT NULL)
  ),
  CONSTRAINT current_source_policy_activations_time_chk CHECK (
    revoked_at IS NULL OR revoked_at >= activated_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_current_source_policy_activations_scope_key
  ON public.current_source_policy_activations (
    tenant_id, workspace_scope_present, workspace_scope_id, policy_key
  ) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_current_source_policy_activations_scope_id
  ON public.current_source_policy_activations (
    tenant_id, workspace_scope_present, workspace_scope_id, id
  );
CREATE INDEX IF NOT EXISTS idx_current_source_policy_activations_policy
  ON public.current_source_policy_activations (source_policy_id, revoked_at);

CREATE OR REPLACE FUNCTION public.novatrade_current_source_policy_activation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE
  policy_row public.source_policy_versions%ROWTYPE;
  registry_requires_attestation boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CURRENT_SOURCE_POLICY_AUDIT_IMMUTABLE';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by_hash IS NOT NULL OR NEW.revocation_reason IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CURRENT_SOURCE_POLICY_MUST_START_CURRENT';
    END IF;
    NEW.activated_at := pg_catalog.statement_timestamp();
    SELECT * INTO policy_row
    FROM public.source_policy_versions p
    WHERE p.tenant_id = NEW.tenant_id
      AND p.workspace_scope_present = (NEW.workspace_id IS NOT NULL)
      AND p.workspace_scope_id = COALESCE(
        NEW.workspace_id, '00000000-0000-0000-0000-000000000000'::uuid
      )
      AND p.policy_key = NEW.policy_key
      AND p.version = NEW.policy_version
      AND p.id = NEW.source_policy_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CURRENT_SOURCE_POLICY_SCOPE_MISMATCH';
    END IF;
    SELECT cv.requires_attestation INTO registry_requires_attestation
    FROM public.connector_versions cv
    WHERE cv.source_card_id = policy_row.source_card_id
      AND cv.version = policy_row.connector_version;
    IF policy_row.state <> 'active' OR policy_row.terms_state <> 'approved'
      OR policy_row.attestation_revoked
      OR (policy_row.attestation_expires_at IS NOT NULL
        AND policy_row.attestation_expires_at <= pg_catalog.statement_timestamp())
      OR (registry_requires_attestation AND policy_row.attestation_expires_at IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CURRENT_SOURCE_POLICY_NOT_ELIGIBLE';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.policy_key IS DISTINCT FROM NEW.policy_key
    OR OLD.policy_version IS DISTINCT FROM NEW.policy_version
    OR OLD.source_policy_id IS DISTINCT FROM NEW.source_policy_id
    OR OLD.activated_at IS DISTINCT FROM NEW.activated_at
    OR OLD.activated_by_hash IS DISTINCT FROM NEW.activated_by_hash
    OR OLD.activation_reason IS DISTINCT FROM NEW.activation_reason
    OR OLD.revoked_at IS NOT NULL
    OR NEW.revoked_at IS NULL
    OR NEW.revoked_by_hash IS NULL
    OR NEW.revocation_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CURRENT_SOURCE_POLICY_AUDIT_IMMUTABLE';
  END IF;
  NEW.revoked_at := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_current_source_policy_activations_guard
  ON public.current_source_policy_activations;
CREATE TRIGGER trg_current_source_policy_activations_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.current_source_policy_activations
FOR EACH ROW EXECUTE FUNCTION public.novatrade_current_source_policy_activation_guard();

-- Upgrade existing installations deterministically. Once a scope/key has any
-- lifecycle history, replay must never recreate a deliberately revoked current
-- selection. Where legacy data has several active rows, the highest version wins.
WITH candidates AS (
  SELECT DISTINCT ON (
    p.tenant_id, p.workspace_scope_present, p.workspace_scope_id, p.policy_key
  )
    p.tenant_id, p.workspace_id, p.workspace_scope_present, p.workspace_scope_id, p.policy_key,
    p.version, p.id, p.created_at
  FROM public.source_policy_versions p
  JOIN public.connector_versions cv
    ON cv.source_card_id = p.source_card_id AND cv.version = p.connector_version
  WHERE p.state = 'active'
    AND p.terms_state = 'approved'
    AND NOT p.attestation_revoked
    AND (p.attestation_expires_at IS NULL OR p.attestation_expires_at > pg_catalog.statement_timestamp())
    AND (NOT cv.requires_attestation OR p.attestation_expires_at IS NOT NULL)
  ORDER BY p.tenant_id, p.workspace_scope_present, p.workspace_scope_id,
    p.policy_key, p.version DESC, p.id DESC
)
INSERT INTO public.current_source_policy_activations (
  id, tenant_id, workspace_id, policy_key, policy_version, source_policy_id,
  activated_by_hash, activation_reason
)
SELECT
  c.id, c.tenant_id, c.workspace_id, c.policy_key, c.version, c.id,
  pg_catalog.repeat('0', 64), 'automatic migration selection of highest eligible legacy version'
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1 FROM public.current_source_policy_activations a
  WHERE a.tenant_id = c.tenant_id
    AND a.workspace_scope_present = c.workspace_scope_present
    AND a.workspace_scope_id = c.workspace_scope_id
    AND a.policy_key = c.policy_key
)
ON CONFLICT DO NOTHING;

-- Preserve all earlier scope checks and additionally require the exact current
-- activation for every durable source-run authorization.
CREATE OR REPLACE FUNCTION public.novatrade_source_run_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE
  account_row public.connector_accounts%ROWTYPE;
  policy_row public.source_policy_versions%ROWTYPE;
  registry_requires_attestation boolean;
  current_activation_id text;
BEGIN
  SELECT * INTO account_row FROM public.connector_accounts a WHERE a.id=NEW.connector_account_id;
  SELECT * INTO policy_row FROM public.source_policy_versions p WHERE p.id=NEW.source_policy_id;
  SELECT cv.requires_attestation INTO registry_requires_attestation
  FROM public.connector_versions cv
  WHERE cv.source_card_id=NEW.source_card_id AND cv.version=NEW.connector_version;
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
  IF policy_row.state <> 'active' OR policy_row.terms_state <> 'approved'
    OR policy_row.attestation_revoked
    OR (policy_row.attestation_expires_at IS NOT NULL
      AND policy_row.attestation_expires_at <= pg_catalog.statement_timestamp())
    OR (registry_requires_attestation AND policy_row.attestation_expires_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SOURCE_RUN_POLICY_NOT_ELIGIBLE';
  END IF;
  SELECT a.id INTO current_activation_id
    FROM public.current_source_policy_activations a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.workspace_scope_present = (NEW.workspace_id IS NOT NULL)
      AND a.workspace_scope_id = COALESCE(
        NEW.workspace_id, '00000000-0000-0000-0000-000000000000'::uuid
      )
      AND a.policy_key = policy_row.policy_key
      AND a.policy_version = policy_row.version
      AND a.source_policy_id = NEW.source_policy_id
      AND a.revoked_at IS NULL
    FOR SHARE;
  IF current_activation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CURRENT_SOURCE_POLICY_REQUIRED';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.current_source_policy_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_source_policy_activations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.current_source_policy_activations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_current_source_policy_activation_guard() FROM PUBLIC;

DO $security$
DECLARE target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=target_role) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON TABLE public.current_source_policy_activations FROM %I', target_role
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION public.novatrade_current_source_policy_activation_guard() FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END;
$security$;

COMMENT ON TABLE public.current_source_policy_activations IS
  'Auditable exact current-policy selections; one-way revocation preserves immutable policy-version history.';
COMMENT ON COLUMN public.current_source_policy_activations.workspace_scope_id IS
  'Normalized workspace scope used to make tenant-wide NULL scope exact in unique and foreign-key bindings.';

DO $receipt$
DECLARE table_ok boolean; exact_fk_count integer; policy_count integer; trigger_count integer;
BEGIN
  SELECT c.relrowsecurity AND c.relforcerowsecurity INTO table_ok
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='current_source_policy_activations' AND c.relkind='r';
  SELECT count(*) INTO exact_fk_count FROM pg_catalog.pg_constraint
  WHERE conrelid='public.current_source_policy_activations'::regclass AND contype='f';
  SELECT count(*) INTO policy_count FROM pg_catalog.pg_policy
  WHERE polrelid='public.current_source_policy_activations'::regclass;
  SELECT count(*) INTO trigger_count FROM pg_catalog.pg_trigger
  WHERE tgrelid='public.current_source_policy_activations'::regclass AND NOT tgisinternal;
  IF table_ok IS DISTINCT FROM true OR exact_fk_count<>3 OR policy_count<>0 OR trigger_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='F09_CURRENT_SOURCE_POLICY_CATALOG_INCOMPLETE';
  END IF;
END;
$receipt$;
COMMIT;
