CREATE TABLE public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL CONSTRAINT support_access_grants_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid,
  support_actor_auth_identity_id uuid NOT NULL,
  platform_role text NOT NULL DEFAULT 'platform_support'
    CONSTRAINT support_access_grants_platform_role_chk CHECK (platform_role = 'platform_support'),
  requested_by_auth_identity_id uuid NOT NULL,
  approved_by_auth_identity_id uuid,
  approved_at timestamptz(3),
  revoked_by_auth_identity_id uuid,
  revoked_at timestamptz(3),
  state text NOT NULL DEFAULT 'pending'
    CONSTRAINT support_access_grants_state_chk CHECK (state IN ('pending', 'approved', 'revoked')),
  reason_code text NOT NULL CONSTRAINT support_access_grants_reason_code_chk CHECK (
    pg_catalog.char_length(reason_code) BETWEEN 3 AND 80
    AND reason_code ~ '^[a-z][a-z0-9._-]{2,79}$'
  ),
  reason text NOT NULL CONSTRAINT support_access_grants_reason_chk CHECK (
    pg_catalog.char_length(reason) BETWEEN 1 AND 500
    AND pg_catalog.char_length(pg_catalog.btrim(reason)) >= 1
  ),
  starts_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  correlation_id text NOT NULL CONSTRAINT support_access_grants_correlation_id_chk CHECK (
    pg_catalog.char_length(correlation_id) BETWEEN 8 AND 128
    AND correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  audit_event_id uuid NOT NULL,
  permission_anchor text NOT NULL,
  data_class_anchor text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz(3) NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT support_access_grants_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT support_access_grants_time_window_chk CHECK (
    pg_catalog.isfinite(starts_at)
    AND pg_catalog.isfinite(expires_at)
    AND starts_at < expires_at
  ),
  CONSTRAINT support_access_grants_approval_time_chk CHECK (
    approved_at IS NULL OR (
      pg_catalog.isfinite(approved_at)
      AND created_at <= approved_at
      AND approved_at < expires_at
    )
  ),
  CONSTRAINT support_access_grants_revocation_time_chk CHECK (
    revoked_at IS NULL OR (
      pg_catalog.isfinite(revoked_at)
      AND approved_at IS NOT NULL
      AND approved_at <= revoked_at
    )
  ),
  CONSTRAINT support_access_grants_updated_time_chk CHECK (
    created_at <= updated_at
  ),
  CONSTRAINT support_access_grants_state_facts_chk CHECK (
    (state = 'pending' AND approved_by_auth_identity_id IS NULL AND approved_at IS NULL AND revoked_by_auth_identity_id IS NULL AND revoked_at IS NULL)
    OR (state = 'approved' AND approved_by_auth_identity_id IS NOT NULL AND approved_at IS NOT NULL AND revoked_by_auth_identity_id IS NULL AND revoked_at IS NULL)
    OR (state = 'revoked' AND approved_by_auth_identity_id IS NOT NULL AND approved_at IS NOT NULL AND revoked_by_auth_identity_id IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT support_access_grants_no_self_approval_chk CHECK (
    approved_by_auth_identity_id IS NULL OR approved_by_auth_identity_id <> support_actor_auth_identity_id
  )
);

COMMENT ON TABLE public.support_access_grants IS
  'Platform-owned, time-bound support elevation; it is not a tenant membership or authorization decision by itself.';
COMMENT ON COLUMN public.support_access_grants.support_actor_auth_identity_id IS
  'Opaque Auth identity UUID for the platform support actor; no profile, contact, credential, or secret data is stored here.';
COMMENT ON COLUMN public.support_access_grants.requested_by_auth_identity_id IS
  'Opaque Auth identity UUID for the request author; it does not imply membership or authorization.';
COMMENT ON COLUMN public.support_access_grants.approved_by_auth_identity_id IS
  'Opaque same-tenant owner/admin Auth identity UUID required for approval; it must differ from the support actor.';
COMMENT ON COLUMN public.support_access_grants.permission_anchor IS
  'Deferred relational anchor proving that at least one normalized permission row exists; it is not a wildcard or authorization shortcut.';
COMMENT ON COLUMN public.support_access_grants.data_class_anchor IS
  'Deferred relational anchor proving that at least one normalized data-class row exists; content remains denied unless listed.';

CREATE TABLE public.support_access_grant_permissions (
  grant_id uuid NOT NULL CONSTRAINT support_access_grant_permissions_grant_id_fkey
    REFERENCES public.support_access_grants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  permission text NOT NULL CONSTRAINT support_access_grant_permissions_permission_chk CHECK (permission IN (
    'tenant:read', 'tenant:manage', 'tenant:lifecycle', 'workspace:read', 'workspace:manage',
    'membership:read', 'membership:invite', 'membership:manage', 'role:assign', 'support:grant',
    'knowledge:read', 'knowledge:upload', 'knowledge:manage', 'knowledge:review', 'knowledge:export', 'knowledge:delete',
    'understanding:read', 'understanding:edit', 'understanding:approve', 'question:manage', 'question:answer',
    'icp:read', 'icp:edit', 'icp:approve', 'play:read', 'play:edit', 'play:approve', 'play:activate', 'play:archive',
    'connector:read', 'connector:manage', 'connector:use', 'source:plan', 'source:approve', 'source:execute', 'source:review',
    'account:read', 'account:edit', 'account:merge', 'account:archive', 'contact:read', 'contact:research', 'contact:edit',
    'contact:use', 'contact:approve', 'buying_center:read', 'buying_center:edit', 'buying_center:approve',
    'qualification:read', 'qualification:edit', 'qualification:approve', 'score:read', 'score:recompute', 'score:override',
    'review:read', 'review:decide', 'audit:read', 'audit:export', 'outreach:read', 'outreach:draft', 'outreach:edit',
    'outreach:approve', 'outreach:copy_export', 'suppression:read', 'suppression:manage', 'outcome:write', 'report:read',
    'report:manage', 'usage:read', 'budget:manage', 'queue:read', 'queue:operate', 'feature:manage', 'data:export', 'data:delete'
  )),
  PRIMARY KEY (grant_id, permission)
);

CREATE TABLE public.support_access_grant_data_classes (
  grant_id uuid NOT NULL CONSTRAINT support_access_grant_data_classes_grant_id_fkey
    REFERENCES public.support_access_grants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  data_class text NOT NULL CONSTRAINT support_access_grant_data_classes_data_class_chk CHECK (data_class IN (
    'tenant_metadata', 'workspace_metadata', 'public_business_facts', 'documents', 'customer_lists', 'contacts',
    'unpublished_product_technical_data', 'audit_operational_metadata', 'prompts', 'agent_context'
  )),
  PRIMARY KEY (grant_id, data_class)
);

ALTER TABLE public.support_access_grants
  ADD CONSTRAINT support_access_grants_permission_anchor_fkey
  FOREIGN KEY (id, permission_anchor)
  REFERENCES public.support_access_grant_permissions (grant_id, permission)
  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT support_access_grants_data_class_anchor_fkey
  FOREIGN KEY (id, data_class_anchor)
  REFERENCES public.support_access_grant_data_classes (grant_id, data_class)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_support_access_grants_tenant_history
  ON public.support_access_grants (tenant_id, created_at DESC, id);
CREATE INDEX idx_support_access_grants_active_lookup
  ON public.support_access_grants (tenant_id, support_actor_auth_identity_id, workspace_id, starts_at, expires_at)
  WHERE state = 'approved' AND revoked_at IS NULL;
CREATE INDEX idx_support_access_grant_permissions_grant
  ON public.support_access_grant_permissions (grant_id, permission);
CREATE INDEX idx_support_access_grant_data_classes_grant
  ON public.support_access_grant_data_classes (grant_id, data_class);

-- One current grant per actor and exact tenant/workspace scope is the safe
-- relational duplicate guard available before T-021 owns set reconciliation.
CREATE UNIQUE INDEX support_access_grants_current_tenantwide_unique
  ON public.support_access_grants (tenant_id, support_actor_auth_identity_id)
  WHERE workspace_id IS NULL AND state IN ('pending', 'approved');
CREATE UNIQUE INDEX support_access_grants_current_workspace_unique
  ON public.support_access_grants (tenant_id, support_actor_auth_identity_id, workspace_id)
  WHERE workspace_id IS NOT NULL AND state IN ('pending', 'approved');

CREATE OR REPLACE FUNCTION public.novatrade_support_access_grants_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  validate_approval_authority boolean := false;
  validate_revocation_authority boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    validate_approval_authority := NEW.state = 'approved';
    validate_revocation_authority := NEW.state = 'revoked';
  ELSE
    validate_approval_authority := OLD.state = 'pending' AND NEW.state = 'approved';
    validate_revocation_authority := OLD.state = 'approved' AND NEW.state = 'revoked';
  END IF;

  IF validate_approval_authority THEN
    IF NEW.approved_by_auth_identity_id IS NOT NULL AND NEW.approved_by_auth_identity_id = NEW.support_actor_auth_identity_id THEN
      RAISE EXCEPTION 'support actor cannot approve its own grant';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      JOIN public.tenant_role_bindings AS binding
        ON binding.tenant_id = membership.tenant_id
       AND binding.membership_id = membership.id
      WHERE membership.tenant_id = NEW.tenant_id
        AND membership.auth_identity_id = NEW.approved_by_auth_identity_id
        AND membership.status = 'active'
        AND binding.role IN ('owner', 'admin')
        AND binding.valid_from <= pg_catalog.now()
        AND binding.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'support grant approver must be an active same-tenant owner or admin';
    END IF;
  END IF;

  IF validate_revocation_authority AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.tenant_role_bindings AS binding
      ON binding.tenant_id = membership.tenant_id
     AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.auth_identity_id = NEW.revoked_by_auth_identity_id
      AND membership.status = 'active'
      AND binding.role IN ('owner', 'admin')
      AND binding.valid_from <= pg_catalog.now()
      AND binding.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'support grant revoker must be an active same-tenant owner or admin';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'support grant id is immutable'; END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'support grant tenant_id is immutable'; END IF;
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'support grant workspace_id is immutable'; END IF;
    IF NEW.support_actor_auth_identity_id IS DISTINCT FROM OLD.support_actor_auth_identity_id THEN RAISE EXCEPTION 'support grant support actor is immutable'; END IF;
    IF NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN RAISE EXCEPTION 'support grant platform role is immutable'; END IF;
    IF NEW.requested_by_auth_identity_id IS DISTINCT FROM OLD.requested_by_auth_identity_id THEN RAISE EXCEPTION 'support grant requester is immutable'; END IF;
    IF NEW.reason_code IS DISTINCT FROM OLD.reason_code OR NEW.reason IS DISTINCT FROM OLD.reason THEN RAISE EXCEPTION 'support grant reason is immutable'; END IF;
    IF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN RAISE EXCEPTION 'support grant time window is immutable'; END IF;
    IF NEW.correlation_id IS DISTINCT FROM OLD.correlation_id OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id THEN RAISE EXCEPTION 'support grant audit facts are immutable'; END IF;
    IF NEW.permission_anchor IS DISTINCT FROM OLD.permission_anchor OR NEW.data_class_anchor IS DISTINCT FROM OLD.data_class_anchor THEN RAISE EXCEPTION 'support grant scope anchors are immutable'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'support grant created_at is immutable'; END IF;
    IF NOT ((OLD.state = NEW.state) OR (OLD.state = 'pending' AND NEW.state = 'approved') OR (OLD.state = 'approved' AND NEW.state = 'revoked')) THEN RAISE EXCEPTION 'support grant state transition is invalid'; END IF;
    IF OLD.approved_by_auth_identity_id IS NOT NULL AND (NEW.approved_by_auth_identity_id IS DISTINCT FROM OLD.approved_by_auth_identity_id OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN RAISE EXCEPTION 'support grant approval facts are immutable'; END IF;
    IF OLD.revoked_by_auth_identity_id IS NOT NULL AND (NEW.revoked_by_auth_identity_id IS DISTINCT FROM OLD.revoked_by_auth_identity_id OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'support grant revocation is one-way'; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_support_access_grants_validate
BEFORE INSERT OR UPDATE ON public.support_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_support_access_grants_validate();

CREATE OR REPLACE FUNCTION public.novatrade_support_access_grant_permissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.support_access_grants WHERE id = NEW.grant_id AND state = 'pending') THEN
    RAISE EXCEPTION 'support grant permission scope is immutable after approval';
  END IF;
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'support grant permission rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'support grant permission rows cannot be deleted'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_support_access_grant_permissions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.support_access_grant_permissions
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_support_access_grant_permissions_guard();

CREATE OR REPLACE FUNCTION public.novatrade_support_access_grant_data_classes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.support_access_grants WHERE id = NEW.grant_id AND state = 'pending') THEN
    RAISE EXCEPTION 'support grant data classes are immutable after approval';
  END IF;
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'support grant data-class rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'support grant data-class rows cannot be deleted'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_support_access_grant_data_classes_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.support_access_grant_data_classes
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_support_access_grant_data_classes_guard();

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grants_validate() FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_permissions_guard() FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_data_classes_guard() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grants_validate() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_permissions_guard() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_data_classes_guard() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grants_validate() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_permissions_guard() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_support_access_grant_data_classes_guard() FROM authenticated';
  END IF;
END;
$$;

COMMENT ON TABLE public.support_access_grant_permissions IS
  'Normalized exact D-002 atomic permissions; unknown actions, empty sets, CSV, and wildcard permissions are rejected.';
COMMENT ON TABLE public.support_access_grant_data_classes IS
  'Normalized explicit support data classes; sensitive content is denied unless its class is listed.';
