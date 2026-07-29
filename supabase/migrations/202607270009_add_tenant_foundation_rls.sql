-- T-027: defense-in-depth RLS for the accepted tenant foundation only.
--
-- Authority comes only from the transaction-local app.* GUCs installed by
-- T-030. These policies do not read JWT, request, header, or body claims and
-- do not grant SQL privileges. The separately provisioned runtime role must
-- receive table/function privileges outside this migration.

CREATE OR REPLACE FUNCTION public.novatrade_rls_member_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tenant_setting text := pg_catalog.current_setting('app.tenant_id', true);
  workspace_setting text := pg_catalog.current_setting('app.workspace_id', true);
  actor_setting text := pg_catalog.current_setting('app.actor_id', true);
  membership_setting text := pg_catalog.current_setting('app.membership_id', true);
  role_setting text := pg_catalog.current_setting('app.role', true);
  binding_setting text := pg_catalog.current_setting('app.role_binding_id', true);
  correlation_setting text := pg_catalog.current_setting('app.correlation_id', true);
BEGIN
  IF tenant_setting IS NULL OR tenant_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR actor_setting IS NULL OR actor_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR membership_setting IS NULL OR membership_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR binding_setting IS NULL OR binding_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR role_setting IS NULL OR role_setting NOT IN (
       'owner', 'admin', 'strategist_manager', 'researcher', 'reviewer',
       'outreach_operator', 'analyst_read_only'
     )
     OR correlation_setting IS NULL
     OR correlation_setting !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     OR coalesce(workspace_setting, '') <> '' AND workspace_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  -- A member context cannot carry support or worker authority, including
  -- stale pooled values from a prior transaction.
  IF coalesce(pg_catalog.current_setting('app.support_grant_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.job_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.run_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.lease_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.lease_generation', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_name', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_action', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_principal_kind', true), '') <> ''
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = tenant_setting::uuid
      AND tenant.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  IF workspace_setting IS NOT NULL AND workspace_setting <> ''
     AND NOT EXISTS (
       SELECT 1
       FROM public.workspaces AS workspace
       WHERE workspace.id = workspace_setting::uuid
         AND workspace.tenant_id = tenant_setting::uuid
         AND workspace.status = 'active'
     )
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    WHERE membership.id = membership_setting::uuid
      AND membership.tenant_id = tenant_setting::uuid
      AND membership.auth_identity_id = actor_setting::uuid
      AND membership.status = 'active'
      AND (
        membership.workspace_id IS NULL
        OR (
          workspace_setting IS NOT NULL
          AND workspace_setting <> ''
          AND membership.workspace_id = workspace_setting::uuid
        )
      )
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_role_bindings AS binding
    WHERE binding.id = binding_setting::uuid
      AND binding.tenant_id = tenant_setting::uuid
      AND binding.membership_id = membership_setting::uuid
      AND binding.role = role_setting
      AND binding.valid_from <= pg_catalog.statement_timestamp()
      AND binding.revoked_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION
  WHEN others THEN
    -- Any malformed setting, catalog mismatch, or unexpected helper failure
    -- is a deny. The helper returns only a boolean and never exposes a row.
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.novatrade_rls_support_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tenant_setting text := pg_catalog.current_setting('app.tenant_id', true);
  workspace_setting text := pg_catalog.current_setting('app.workspace_id', true);
  actor_setting text := pg_catalog.current_setting('app.actor_id', true);
  grant_setting text := pg_catalog.current_setting('app.support_grant_id', true);
  correlation_setting text := pg_catalog.current_setting('app.correlation_id', true);
BEGIN
  IF tenant_setting IS NULL OR tenant_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR actor_setting IS NULL OR actor_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR grant_setting IS NULL OR grant_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR correlation_setting IS NULL
     OR correlation_setting !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     OR coalesce(workspace_setting, '') <> '' AND workspace_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  -- Support is a distinct authority. Membership, role-binding, and worker
  -- fields must be empty; conflicting shapes are never merged.
  IF coalesce(pg_catalog.current_setting('app.membership_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.role', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.role_binding_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.job_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.run_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.lease_id', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.lease_generation', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_name', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_action', true), '') <> ''
     OR coalesce(pg_catalog.current_setting('app.worker_principal_kind', true), '') <> ''
  THEN
    RETURN false;
  END IF;

  IF workspace_setting IS NOT NULL AND workspace_setting <> ''
     AND NOT EXISTS (
       SELECT 1
       FROM public.workspaces AS workspace
       WHERE workspace.id = workspace_setting::uuid
         AND workspace.tenant_id = tenant_setting::uuid
         AND workspace.status = 'active'
     )
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = tenant_setting::uuid
      AND tenant.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.support_access_grants AS grant_row
    WHERE grant_row.id = grant_setting::uuid
      AND grant_row.tenant_id = tenant_setting::uuid
      AND grant_row.support_actor_auth_identity_id = actor_setting::uuid
      AND grant_row.platform_role = 'platform_support'
      AND grant_row.state = 'approved'
      AND grant_row.revoked_at IS NULL
      AND grant_row.starts_at <= pg_catalog.statement_timestamp()
      AND pg_catalog.statement_timestamp() < grant_row.expires_at
      AND (
        grant_row.workspace_id IS NULL
        OR (
          workspace_setting IS NOT NULL
          AND workspace_setting <> ''
          AND grant_row.workspace_id = workspace_setting::uuid
        )
      )
  );
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.novatrade_rls_support_tenant_metadata_read()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.novatrade_rls_support_context()
    AND coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grant_permissions AS permission_row
      WHERE permission_row.grant_id = pg_catalog.current_setting('app.support_grant_id', true)::uuid
        AND permission_row.permission = 'tenant:read'
    )
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grant_data_classes AS data_class_row
      WHERE data_class_row.grant_id = pg_catalog.current_setting('app.support_grant_id', true)::uuid
        AND data_class_row.data_class = 'tenant_metadata'
    );
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.novatrade_rls_support_workspace_metadata_read()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.novatrade_rls_support_context()
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grant_permissions AS permission_row
      WHERE permission_row.grant_id = pg_catalog.current_setting('app.support_grant_id', true)::uuid
        AND permission_row.permission = 'workspace:read'
    )
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grant_data_classes AS data_class_row
      WHERE data_class_row.grant_id = pg_catalog.current_setting('app.support_grant_id', true)::uuid
        AND data_class_row.data_class = 'workspace_metadata'
    );
EXCEPTION
  WHEN others THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.novatrade_rls_member_context() IS
  'T-027 boolean-only member predicate; authority is T-030 transaction-local context plus live membership and role binding.';
COMMENT ON FUNCTION public.novatrade_rls_support_context() IS
  'T-027 boolean-only support predicate; authority is the exact approved, unrevoked, time-valid T-021 grant.';
COMMENT ON FUNCTION public.novatrade_rls_support_tenant_metadata_read() IS
  'T-027 support read predicate requiring tenant:read and tenant_metadata child scope.';
COMMENT ON FUNCTION public.novatrade_rls_support_workspace_metadata_read() IS
  'T-027 support read predicate requiring workspace:read and workspace_metadata child scope.';

-- The migration/admin owner is intentionally not the separately provisioned
-- runtime role. Runtime table and function privileges are an explicit
-- activation step and are deliberately absent here.
REVOKE ALL ON TABLE
  public.tenants,
  public.workspaces,
  public.tenant_memberships,
  public.tenant_role_bindings,
  public.tenant_policies,
  public.support_access_grants,
  public.support_access_grant_permissions,
  public.support_access_grant_data_classes
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.novatrade_rls_member_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_tenant_metadata_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_workspace_metadata_read() FROM PUBLIC;

REVOKE ALL ON TABLE
  public.tenants,
  public.workspaces,
  public.tenant_memberships,
  public.tenant_role_bindings,
  public.tenant_policies,
  public.support_access_grants,
  public.support_access_grant_permissions,
  public.support_access_grant_data_classes
FROM anon;
REVOKE ALL ON FUNCTION public.novatrade_rls_member_context() FROM anon;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_context() FROM anon;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_tenant_metadata_read() FROM anon;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_workspace_metadata_read() FROM anon;

REVOKE ALL ON TABLE
  public.tenants,
  public.workspaces,
  public.tenant_memberships,
  public.tenant_role_bindings,
  public.tenant_policies,
  public.support_access_grants,
  public.support_access_grant_permissions,
  public.support_access_grant_data_classes
FROM authenticated;
REVOKE ALL ON FUNCTION public.novatrade_rls_member_context() FROM authenticated;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_context() FROM authenticated;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_tenant_metadata_read() FROM authenticated;
REVOKE ALL ON FUNCTION public.novatrade_rls_support_workspace_metadata_read() FROM authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grant_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grant_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grant_data_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grant_data_classes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS t027_tenants_member_select ON public.tenants;
CREATE POLICY t027_tenants_member_select ON public.tenants
  FOR SELECT TO PUBLIC
  USING (public.novatrade_rls_member_context() AND id::text = pg_catalog.current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS t027_tenants_support_select ON public.tenants;
CREATE POLICY t027_tenants_support_select ON public.tenants
  FOR SELECT TO PUBLIC
  USING (public.novatrade_rls_support_tenant_metadata_read() AND id::text = pg_catalog.current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS t027_tenants_deny_all_other_verbs ON public.tenants;
CREATE POLICY t027_tenants_deny_all_other_verbs ON public.tenants
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_workspaces_member_select ON public.workspaces;
CREATE POLICY t027_workspaces_member_select ON public.workspaces
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND status = 'active'
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS t027_workspaces_support_select ON public.workspaces;
CREATE POLICY t027_workspaces_support_select ON public.workspaces
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_support_workspace_metadata_read()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND status = 'active'
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS t027_workspaces_deny_all_other_verbs ON public.workspaces;
CREATE POLICY t027_workspaces_deny_all_other_verbs ON public.workspaces
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_memberships_member_select ON public.tenant_memberships;
CREATE POLICY t027_memberships_member_select ON public.tenant_memberships
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id IS NULL
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS t027_memberships_deny_all_other_verbs ON public.tenant_memberships;
CREATE POLICY t027_memberships_deny_all_other_verbs ON public.tenant_memberships
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_role_bindings_member_select ON public.tenant_role_bindings;
CREATE POLICY t027_role_bindings_member_select ON public.tenant_role_bindings
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      WHERE membership.id = tenant_role_bindings.membership_id
        AND membership.tenant_id = tenant_role_bindings.tenant_id
        AND (
          coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
          OR membership.workspace_id IS NULL
          OR membership.workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
        )
    )
  );
DROP POLICY IF EXISTS t027_role_bindings_deny_all_other_verbs ON public.tenant_role_bindings;
CREATE POLICY t027_role_bindings_deny_all_other_verbs ON public.tenant_role_bindings
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_policies_member_select ON public.tenant_policies;
CREATE POLICY t027_policies_member_select ON public.tenant_policies
  FOR SELECT TO PUBLIC
  USING (public.novatrade_rls_member_context() AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS t027_policies_support_select ON public.tenant_policies;
CREATE POLICY t027_policies_support_select ON public.tenant_policies
  FOR SELECT TO PUBLIC
  USING (public.novatrade_rls_support_tenant_metadata_read() AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS t027_policies_deny_all_other_verbs ON public.tenant_policies;
CREATE POLICY t027_policies_deny_all_other_verbs ON public.tenant_policies
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_support_grants_member_select ON public.support_access_grants;
CREATE POLICY t027_support_grants_member_select ON public.support_access_grants
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id IS NULL
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS t027_support_grants_deny_all_other_verbs ON public.support_access_grants;
CREATE POLICY t027_support_grants_deny_all_other_verbs ON public.support_access_grants
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_support_permissions_member_select ON public.support_access_grant_permissions;
CREATE POLICY t027_support_permissions_member_select ON public.support_access_grant_permissions
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grants AS grant_row
      WHERE grant_row.id = support_access_grant_permissions.grant_id
        AND grant_row.tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
        AND (
          coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
          OR grant_row.workspace_id IS NULL
          OR grant_row.workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
        )
    )
  );
DROP POLICY IF EXISTS t027_support_permissions_deny_all_other_verbs ON public.support_access_grant_permissions;
CREATE POLICY t027_support_permissions_deny_all_other_verbs ON public.support_access_grant_permissions
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS t027_support_data_classes_member_select ON public.support_access_grant_data_classes;
CREATE POLICY t027_support_data_classes_member_select ON public.support_access_grant_data_classes
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.support_access_grants AS grant_row
      WHERE grant_row.id = support_access_grant_data_classes.grant_id
        AND grant_row.tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
        AND (
          coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
          OR grant_row.workspace_id IS NULL
          OR grant_row.workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
        )
    )
  );
DROP POLICY IF EXISTS t027_support_data_classes_deny_all_other_verbs ON public.support_access_grant_data_classes;
CREATE POLICY t027_support_data_classes_deny_all_other_verbs ON public.support_access_grant_data_classes
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

-- No worker policy is intentionally created. Worker context has no approved
-- durable foundation relationship in T-027 and therefore remains deny-by-default.
