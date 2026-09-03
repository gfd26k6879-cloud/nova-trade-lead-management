CREATE TABLE public.tenant_memberships (
  id uuid CONSTRAINT tenant_memberships_pkey PRIMARY KEY
    DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL
    CONSTRAINT tenant_memberships_tenant_id_fkey
    REFERENCES public.tenants (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  -- Auth identity/profile is intentionally not a tenant authorization record.
  auth_identity_id uuid,
  -- Opaque invite reference digest only; never store a raw email or invitation token.
  pending_identity_ref_hash text,
  workspace_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT tenant_memberships_status_chk
    CHECK (status IN (
      'pending',
      'active',
      'suspended',
      'disabled',
      'revoked',
      'removed',
      'expired'
    )),
  invited_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_memberships_identity_selector_chk
    CHECK ((auth_identity_id IS NOT NULL) <> (pending_identity_ref_hash IS NOT NULL)),
  CONSTRAINT tenant_memberships_pending_identity_ref_hash_chk
    CHECK (
      pending_identity_ref_hash IS NULL
      OR pending_identity_ref_hash ~ '^[0-9a-f]{64}$'
    ),
  -- Tenant-aware candidate key for later same-tenant compound foreign keys.
  CONSTRAINT tenant_memberships_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT tenant_memberships_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT tenant_memberships_invited_by_tenant_fkey
    FOREIGN KEY (tenant_id, invited_by_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.tenant_memberships IS
  'Tenant-owned authorization eligibility record, separate from Auth identity/profile and role binding.';

COMMENT ON COLUMN public.tenant_memberships.auth_identity_id IS
  'Opaque authenticated identity selector; it grants no tenant access without an active membership and role.';

COMMENT ON COLUMN public.tenant_memberships.pending_identity_ref_hash IS
  'Lowercase 64-hex opaque pending identity reference digest; raw email and invitation tokens are prohibited.';

COMMENT ON COLUMN public.tenant_memberships.workspace_id IS
  'Optional narrowing workspace assignment proven to belong to this tenant by a composite foreign key.';

COMMENT ON COLUMN public.tenant_memberships.status IS
  'Membership lifecycle: pending, active, suspended, disabled, revoked, removed, or expired.';

COMMENT ON COLUMN public.tenant_memberships.updated_at IS
  'Updated by the membership guard trigger on every permitted row update.';

COMMENT ON CONSTRAINT tenant_memberships_identity_selector_chk
  ON public.tenant_memberships IS
  'Exactly one of an authenticated identity UUID or an opaque pending identity digest is required.';

COMMENT ON CONSTRAINT tenant_memberships_tenant_id_id_unique
  ON public.tenant_memberships IS
  'Tenant-aware candidate key for future compound foreign keys.';

COMMENT ON CONSTRAINT tenant_memberships_workspace_tenant_fkey
  ON public.tenant_memberships IS
  'Prevents a membership workspace assignment from crossing tenant ownership.';

COMMENT ON CONSTRAINT tenant_memberships_invited_by_tenant_fkey
  ON public.tenant_memberships IS
  'Restricts the inviter reference to a membership in the same tenant.';

CREATE UNIQUE INDEX tenant_memberships_current_auth_identity_unique
  ON public.tenant_memberships (tenant_id, auth_identity_id)
  WHERE auth_identity_id IS NOT NULL
    AND status NOT IN ('revoked', 'removed', 'expired');

CREATE UNIQUE INDEX tenant_memberships_current_pending_identity_unique
  ON public.tenant_memberships (tenant_id, pending_identity_ref_hash)
  WHERE pending_identity_ref_hash IS NOT NULL
    AND status NOT IN ('revoked', 'removed', 'expired');

CREATE INDEX idx_tenant_memberships_auth_identity_status
  ON public.tenant_memberships (auth_identity_id, status, tenant_id)
  WHERE auth_identity_id IS NOT NULL;

CREATE INDEX idx_tenant_memberships_tenant_status_updated_at
  ON public.tenant_memberships (tenant_id, status, updated_at DESC);

CREATE INDEX idx_tenant_memberships_tenant_workspace_status
  ON public.tenant_memberships (tenant_id, workspace_id, status)
  WHERE workspace_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.novatrade_tenant_memberships_guard_and_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'tenant membership id is immutable';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant membership tenant_id is immutable';
  END IF;

  IF NEW.auth_identity_id IS DISTINCT FROM OLD.auth_identity_id THEN
    RAISE EXCEPTION 'tenant membership auth_identity_id is immutable';
  END IF;

  IF NEW.pending_identity_ref_hash IS DISTINCT FROM OLD.pending_identity_ref_hash THEN
    RAISE EXCEPTION 'tenant membership pending identity selector is immutable';
  END IF;

  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_tenant_memberships_guard_and_touch
BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_tenant_memberships_guard_and_touch();

CREATE TABLE public.tenant_role_bindings (
  id uuid CONSTRAINT tenant_role_bindings_pkey PRIMARY KEY
    DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role text NOT NULL CONSTRAINT tenant_role_bindings_role_chk
    CHECK (role IN (
      'owner',
      'admin',
      'strategist_manager',
      'researcher',
      'reviewer',
      'outreach_operator',
      'analyst_read_only'
    )),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  valid_from timestamptz NOT NULL DEFAULT pg_catalog.now(),
  revoked_at timestamptz,
  assigned_by_membership_id uuid,
  reason_code text NOT NULL DEFAULT 'initial_provisioning'
    CONSTRAINT tenant_role_bindings_reason_code_chk
    CHECK (reason_code IN (
      'initial_provisioning',
      'invitation',
      'role_change',
      'owner_replacement',
      'membership_reactivation',
      'administrative_correction'
    )),
  CONSTRAINT tenant_role_bindings_revoked_at_chk
    CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  CONSTRAINT tenant_role_bindings_tenant_membership_fkey
    FOREIGN KEY (tenant_id, membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT tenant_role_bindings_assigned_by_tenant_fkey
    FOREIGN KEY (tenant_id, assigned_by_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.tenant_role_bindings IS
  'Append-only tenant role history separate from membership identity and lifecycle; effectiveness requires active membership.';

COMMENT ON COLUMN public.tenant_role_bindings.role IS
  'One of the seven fixed D-002 launch roles; custom roles are not represented.';

COMMENT ON COLUMN public.tenant_role_bindings.valid_from IS
  'Time at which this historical role binding becomes effective if membership authorization is active.';

COMMENT ON COLUMN public.tenant_role_bindings.revoked_at IS
  'One-way historical revocation marker; null is current and a timestamp is terminal.';

COMMENT ON COLUMN public.tenant_role_bindings.assigned_by_membership_id IS
  'Optional same-tenant assigning membership; platform support is modeled separately.';

COMMENT ON COLUMN public.tenant_role_bindings.reason_code IS
  'Bounded audit reason for the role assignment event.';

COMMENT ON CONSTRAINT tenant_role_bindings_tenant_membership_fkey
  ON public.tenant_role_bindings IS
  'Prevents orphan role bindings and cross-tenant membership references.';

COMMENT ON CONSTRAINT tenant_role_bindings_assigned_by_tenant_fkey
  ON public.tenant_role_bindings IS
  'Restricts the assigning membership to the same tenant.';

CREATE UNIQUE INDEX tenant_role_bindings_current_membership_unique
  ON public.tenant_role_bindings (tenant_id, membership_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_tenant_role_bindings_membership_history
  ON public.tenant_role_bindings (tenant_id, membership_id, valid_from DESC);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_role_bindings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'tenant role binding id is immutable';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant role binding tenant_id is immutable';
  END IF;

  IF NEW.membership_id IS DISTINCT FROM OLD.membership_id THEN
    RAISE EXCEPTION 'tenant role binding membership_id is immutable';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'tenant role binding role is immutable';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'tenant role binding created_at is immutable';
  END IF;

  IF NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
    RAISE EXCEPTION 'tenant role binding valid_from is immutable';
  END IF;

  IF NEW.assigned_by_membership_id IS DISTINCT FROM OLD.assigned_by_membership_id THEN
    RAISE EXCEPTION 'tenant role binding assigned_by_membership_id is immutable';
  END IF;

  IF NEW.reason_code IS DISTINCT FROM OLD.reason_code THEN
    RAISE EXCEPTION 'tenant role binding reason_code is immutable';
  END IF;

  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'tenant role binding revoked_at cannot be rewritten or cleared';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_tenant_role_bindings_guard
BEFORE UPDATE ON public.tenant_role_bindings
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_tenant_role_bindings_guard();

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.novatrade_tenant_memberships_guard_and_touch()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_memberships_guard_and_touch() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_memberships_guard_and_touch() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_memberships_guard_and_touch() FROM authenticated';
    END IF;
  END IF;

  IF pg_catalog.to_regprocedure('public.novatrade_tenant_role_bindings_guard()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_role_bindings_guard() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_role_bindings_guard() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_role_bindings_guard() FROM authenticated';
    END IF;
  END IF;
END;
$$;

/*
Rehearsal SQL (comments only; run manually after the T-002 and T-004 migrations
in a disposable Postgres 16 database):

-- Fixture setup: one Auth identity may belong to two tenants.
BEGIN;
INSERT INTO public.tenants (id, slug, name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'membership-tenant-a', 'Membership Tenant A'),
  ('00000000-0000-0000-0000-000000000002', 'membership-tenant-b', 'Membership Tenant B');

INSERT INTO public.workspaces (id, tenant_id, slug, name)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'member-workspace', 'Tenant A Workspace'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'member-workspace', 'Tenant B Workspace');

INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status)
VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active');
-- Same auth identity in two tenants succeeds.
COMMIT;

-- Duplicate current same-tenant auth membership fails.
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'pending');
-- expect tenant_memberships_current_auth_identity_unique violation
ROLLBACK;

-- Terminal membership history remains retainable, then reinvite succeeds.
BEGIN;
UPDATE public.tenant_memberships
SET status = 'expired'
WHERE id = '20000000-0000-0000-0000-000000000001';
INSERT INTO public.tenant_memberships (tenant_id, pending_identity_ref_hash, status)
VALUES ('00000000-0000-0000-0000-000000000001', repeat('a', 64), 'pending');
COMMIT;

-- Exactly one identity selector is required; neither and both fail.
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'pending');
-- expect tenant_memberships_identity_selector_chk violation
ROLLBACK;
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id, pending_identity_ref_hash)
VALUES ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', repeat('b', 64));
-- expect tenant_memberships_identity_selector_chk violation
ROLLBACK;

-- Same-tenant workspace is accepted; cross-tenant workspace is blocked.
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id, workspace_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'pending');
ROLLBACK;
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id, workspace_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'pending');
-- expect tenant_memberships_workspace_tenant_fkey violation
ROLLBACK;

-- Every membership status is accepted by the exact status check.
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, pending_identity_ref_hash, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', repeat('c', 64), 'pending'),
  ('00000000-0000-0000-0000-000000000001', repeat('d', 64), 'active'),
  ('00000000-0000-0000-0000-000000000001', repeat('e', 64), 'suspended'),
  ('00000000-0000-0000-0000-000000000001', repeat('f', 64), 'disabled'),
  ('00000000-0000-0000-0000-000000000001', repeat('1', 64), 'revoked'),
  ('00000000-0000-0000-0000-000000000001', repeat('2', 64), 'removed'),
  ('00000000-0000-0000-0000-000000000001', repeat('3', 64), 'expired');
ROLLBACK;

-- Custom role fails; one current role binding is allowed and a second is blocked.
BEGIN;
INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'custom_role');
-- expect tenant_role_bindings_role_chk violation
ROLLBACK;
BEGIN;
INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner');
COMMIT;
BEGIN;
INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin');
-- expect tenant_role_bindings_current_membership_unique violation
ROLLBACK;

-- Revoked historical binding plus a new current binding succeeds.
BEGIN;
UPDATE public.tenant_role_bindings
SET revoked_at = pg_catalog.now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND membership_id = '20000000-0000-0000-0000-000000000001';
INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role, reason_code)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin', 'role_change');
COMMIT;

-- Role rewrite and revoked_at clearing/rewriting are blocked.
BEGIN;
UPDATE public.tenant_role_bindings
SET role = 'researcher'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND membership_id = '20000000-0000-0000-0000-000000000001'
  AND revoked_at IS NULL;
-- expect tenant role binding role is immutable
ROLLBACK;
BEGIN;
UPDATE public.tenant_role_bindings
SET revoked_at = NULL
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND membership_id = '20000000-0000-0000-0000-000000000001'
  AND revoked_at IS NOT NULL;
-- expect tenant role binding revoked_at cannot be rewritten or cleared
ROLLBACK;
BEGIN;
UPDATE public.tenant_role_bindings
SET revoked_at = pg_catalog.now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND membership_id = '20000000-0000-0000-0000-000000000001'
  AND revoked_at IS NOT NULL;
-- expect tenant role binding revoked_at cannot be rewritten or cleared
ROLLBACK;

-- Orphan membership and role binding are blocked.
BEGIN;
INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id)
VALUES ('00000000-0000-0000-0000-000000000099', '30000000-0000-0000-0000-000000000099');
-- expect tenant_memberships_tenant_id_fkey violation
ROLLBACK;
BEGIN;
INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000099', 'owner');
-- expect tenant_role_bindings_tenant_membership_fkey violation
ROLLBACK;

-- Disposable cleanup.
BEGIN;
DELETE FROM public.tenant_role_bindings;
DELETE FROM public.tenant_memberships;
DELETE FROM public.workspaces
WHERE tenant_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);
DELETE FROM public.tenants
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);
COMMIT;
*/
