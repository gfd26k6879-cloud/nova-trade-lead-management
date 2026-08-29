-- F-01: resolve the initial member scope before transaction-local member GUCs
-- exist. Auth identity is the authority; tenant/workspace inputs are selectors.
-- The definer owner is the same reviewed narrow trust boundary used by T-027.

CREATE OR REPLACE FUNCTION public.novatrade_resolve_tenant_session(
  p_auth_identity_id pg_catalog.text,
  p_tenant_id pg_catalog.text,
  p_workspace_selector_provided pg_catalog.bool,
  p_workspace_id pg_catalog.text
)
RETURNS TABLE (
  tenant_id pg_catalog.uuid,
  workspace_id pg_catalog.uuid,
  membership_id pg_catalog.uuid,
  role pg_catalog.text,
  role_binding_id pg_catalog.uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  auth_identity_uuid pg_catalog.uuid;
  tenant_uuid pg_catalog.uuid;
  workspace_uuid pg_catalog.uuid;
BEGIN
  -- Text parameters keep malformed caller selectors inside this non-enumerating
  -- boundary instead of exposing a cast error before the function starts.
  IF p_auth_identity_id IS NULL
     OR p_auth_identity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_tenant_id IS NULL
     OR p_tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_workspace_selector_provided IS NULL
     OR (
       p_workspace_id IS NOT NULL
       AND p_workspace_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )
     OR (NOT p_workspace_selector_provided AND p_workspace_id IS NOT NULL)
  THEN
    RETURN;
  END IF;

  auth_identity_uuid := p_auth_identity_id::pg_catalog.uuid;
  tenant_uuid := p_tenant_id::pg_catalog.uuid;
  workspace_uuid := p_workspace_id::pg_catalog.uuid;

  RETURN QUERY
  SELECT
    tenant.id,
    CASE
      WHEN membership.workspace_id IS NOT NULL THEN membership.workspace_id
      WHEN p_workspace_selector_provided THEN workspace_uuid
      ELSE NULL::pg_catalog.uuid
    END,
    membership.id,
    binding.role,
    binding.id
  FROM public.tenants AS tenant
  JOIN public.tenant_memberships AS membership
    ON membership.tenant_id = tenant.id
   AND membership.auth_identity_id = auth_identity_uuid
   AND membership.pending_identity_ref_hash IS NULL
   AND membership.status = 'active'
  JOIN public.tenant_role_bindings AS binding
    ON binding.tenant_id = membership.tenant_id
   AND binding.membership_id = membership.id
   AND binding.valid_from <= pg_catalog.statement_timestamp()
   AND binding.revoked_at IS NULL
  LEFT JOIN public.workspaces AS workspace
    ON workspace.tenant_id = tenant.id
   AND workspace.id = CASE
     WHEN membership.workspace_id IS NOT NULL THEN membership.workspace_id
     WHEN p_workspace_selector_provided THEN workspace_uuid
     ELSE NULL::pg_catalog.uuid
   END
  WHERE tenant.id = tenant_uuid
    AND tenant.status = 'active'
    AND (
      membership.workspace_id IS NULL
      OR NOT p_workspace_selector_provided
      OR workspace_uuid = membership.workspace_id
    )
    AND (
      CASE
        WHEN membership.workspace_id IS NOT NULL THEN membership.workspace_id
        WHEN p_workspace_selector_provided THEN workspace_uuid
        ELSE NULL::pg_catalog.uuid
      END IS NULL
      OR (
        workspace.id IS NOT NULL
        AND workspace.status = 'active'
      )
    );
EXCEPTION
  WHEN others THEN
    -- Missing objects, owner capability drift, malformed values, and catalog
    -- failures are indistinguishable to callers and return no scope row.
    RETURN;
END;
$$;

COMMENT ON FUNCTION public.novatrade_resolve_tenant_session(pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.text) IS
  'F-01 bootstrap resolver: exact authenticated identity plus tenant/workspace selectors yield only a live member scope; zero rows denotes every denial.';

REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_session(pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_session(pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.text) FROM anon;
REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_session(pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.text) FROM authenticated;
