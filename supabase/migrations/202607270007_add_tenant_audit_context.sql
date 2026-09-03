-- T-015: preserve historical audit rows while making new scope explicit.
-- This migration is intentionally additive and does not enable RLS; T-027 owns RLS.

ALTER TABLE public.tenant_role_bindings
  ADD CONSTRAINT tenant_role_bindings_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT 'legacy_unscoped',
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS actor_auth_identity_id uuid,
  ADD COLUMN IF NOT EXISTS actor_membership_id uuid,
  ADD COLUMN IF NOT EXISTS actor_launch_role text,
  ADD COLUMN IF NOT EXISTS actor_role_binding_id uuid,
  ADD COLUMN IF NOT EXISTS actor_layer text;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_scope_kind_chk
    CHECK (scope_kind IN ('tenant', 'platform', 'legacy_unscoped')),
  ADD CONSTRAINT audit_logs_scope_shape_chk
    CHECK (
      (scope_kind = 'tenant' AND tenant_id IS NOT NULL)
      OR (scope_kind IN ('platform', 'legacy_unscoped') AND tenant_id IS NULL)
    ),
  ADD CONSTRAINT audit_logs_tenant_required_context_chk
    CHECK (
      scope_kind <> 'tenant'
      OR (
        correlation_id IS NOT NULL
        AND actor_auth_identity_id IS NOT NULL
        AND actor_membership_id IS NOT NULL
        AND actor_launch_role IS NOT NULL
        AND actor_role_binding_id IS NOT NULL
        AND actor_layer = 'member'
        AND actor_email IS NULL
      )
    ),
  ADD CONSTRAINT audit_logs_platform_context_chk
    CHECK (
      scope_kind <> 'platform'
      OR (workspace_id IS NULL AND actor_membership_id IS NULL AND actor_role_binding_id IS NULL AND actor_layer IS NOT NULL AND actor_layer <> 'member')
    ),
  ADD CONSTRAINT audit_logs_launch_role_chk
    CHECK (
      actor_launch_role IS NULL OR actor_launch_role IN (
        'owner', 'admin', 'strategist_manager', 'researcher', 'reviewer',
        'outreach_operator', 'analyst_read_only'
      )
    ),
  ADD CONSTRAINT audit_logs_actor_layer_chk
    CHECK (actor_layer IS NULL OR actor_layer IN ('member', 'support', 'worker', 'agent', 'system')),
  ADD CONSTRAINT audit_logs_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT audit_logs_membership_tenant_fkey
    FOREIGN KEY (tenant_id, actor_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT audit_logs_role_binding_tenant_fkey
    FOREIGN KEY (tenant_id, actor_role_binding_id)
    REFERENCES public.tenant_role_bindings (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX idx_audit_logs_tenant_created_at
  ON public.audit_logs (tenant_id, created_at DESC, id);
CREATE INDEX idx_audit_logs_tenant_action_created_at
  ON public.audit_logs (tenant_id, action, created_at DESC, id);
CREATE INDEX idx_audit_logs_correlation_id
  ON public.audit_logs (correlation_id);
CREATE INDEX idx_audit_logs_workspace_created_at
  ON public.audit_logs (workspace_id, created_at DESC, id)
  WHERE workspace_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.novatrade_audit_logs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'audit logs are append-only';
  END IF;

  IF NEW.scope_kind NOT IN ('tenant', 'platform', 'legacy_unscoped') THEN
    RAISE EXCEPTION 'unknown audit scope';
  END IF;
  IF NEW.action !~ '^[a-z][a-z0-9_.:-]{0,127}$' THEN
    RAISE EXCEPTION 'audit action is outside its safe lexical envelope';
  END IF;
  IF NEW.entity_type IS NOT NULL AND NEW.entity_type !~ '^[a-z][a-z0-9_.:-]{0,63}$' THEN
    RAISE EXCEPTION 'audit entity type is outside its safe lexical envelope';
  END IF;
  IF NEW.entity_id IS NOT NULL AND NEW.entity_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN
    RAISE EXCEPTION 'audit entity id is outside its safe lexical envelope';
  END IF;
  IF NEW.correlation_id IS NOT NULL AND NEW.correlation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' THEN
    RAISE EXCEPTION 'audit correlation id is outside its safe lexical envelope';
  END IF;
  IF NEW.actor_launch_role IS NOT NULL AND NEW.actor_launch_role NOT IN (
    'owner', 'admin', 'strategist_manager', 'researcher', 'reviewer',
    'outreach_operator', 'analyst_read_only'
  ) THEN
    RAISE EXCEPTION 'unknown audit launch role';
  END IF;
  IF NEW.actor_layer IS NOT NULL AND NEW.actor_layer NOT IN ('member', 'support', 'worker', 'agent', 'system') THEN
    RAISE EXCEPTION 'unknown audit actor layer';
  END IF;
  IF NEW.scope_kind = 'tenant' THEN
    IF NEW.tenant_id IS NULL
       OR NEW.correlation_id IS NULL
       OR NEW.actor_auth_identity_id IS NULL
       OR NEW.actor_membership_id IS NULL
       OR NEW.actor_launch_role IS NULL
       OR NEW.actor_role_binding_id IS NULL
       OR NEW.actor_layer IS DISTINCT FROM 'member'
       OR NEW.actor_email IS NOT NULL THEN
      RAISE EXCEPTION 'tenant audit requires exact server-derived context and no actor email';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      WHERE membership.tenant_id = NEW.tenant_id
        AND membership.id = NEW.actor_membership_id
        AND membership.auth_identity_id = NEW.actor_auth_identity_id
    ) THEN
      RAISE EXCEPTION 'tenant audit membership does not match tenant and actor identity';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_role_bindings AS binding
      WHERE binding.tenant_id = NEW.tenant_id
        AND binding.id = NEW.actor_role_binding_id
        AND binding.membership_id = NEW.actor_membership_id
        AND binding.role = NEW.actor_launch_role
    ) THEN
      RAISE EXCEPTION 'tenant audit role binding does not match tenant and membership';
    END IF;
  ELSIF NEW.scope_kind = 'platform' THEN
    IF NEW.tenant_id IS NOT NULL
       OR NEW.workspace_id IS NOT NULL
       OR NEW.actor_membership_id IS NOT NULL
       OR NEW.actor_role_binding_id IS NOT NULL THEN
      RAISE EXCEPTION 'platform audit cannot carry tenant context';
    END IF;
  ELSE
    IF NEW.tenant_id IS NOT NULL
       OR NEW.workspace_id IS NOT NULL
       OR NEW.correlation_id IS NOT NULL
       OR NEW.actor_auth_identity_id IS NOT NULL
       OR NEW.actor_membership_id IS NOT NULL
       OR NEW.actor_launch_role IS NOT NULL
       OR NEW.actor_role_binding_id IS NOT NULL
       OR NEW.actor_layer IS NOT NULL THEN
      RAISE EXCEPTION 'legacy audit rows cannot carry tenant context';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_audit_logs_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_audit_logs_guard();

COMMENT ON TABLE public.audit_logs IS
  'Append-only audit history. Historical rows are legacy_unscoped; new tenant rows require server-derived T-014 context; platform rows require explicit platform scope.';
COMMENT ON COLUMN public.audit_logs.scope_kind IS
  'Fixed scope classification: tenant, explicit platform, or preserved legacy_unscoped.';
COMMENT ON COLUMN public.audit_logs.actor_launch_role IS
  'D-002 launch role, separate from the legacy app_role actor_role enum.';

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_audit_logs_guard() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_audit_logs_guard() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_audit_logs_guard() FROM authenticated';
  END IF;
END;
$$;
