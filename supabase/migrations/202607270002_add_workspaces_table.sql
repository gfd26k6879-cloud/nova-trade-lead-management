CREATE TABLE public.workspaces (
  id uuid CONSTRAINT workspaces_pkey PRIMARY KEY
    DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL
    CONSTRAINT workspaces_tenant_id_fkey
    REFERENCES public.tenants (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  slug text NOT NULL CONSTRAINT workspaces_slug_length_chk
    CHECK (pg_catalog.char_length(slug) BETWEEN 2 AND 80),
  CONSTRAINT workspaces_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT workspaces_tenant_slug_unique UNIQUE (tenant_id, slug),
  -- This tenant-aware candidate key supports future same-tenant compound FKs.
  CONSTRAINT workspaces_tenant_id_id_unique UNIQUE (tenant_id, id),
  name text NOT NULL CONSTRAINT workspaces_name_length_chk
    CHECK (
      pg_catalog.char_length(name) BETWEEN 1 AND 120
      AND pg_catalog.char_length(pg_catalog.btrim(name)) >= 1
    ),
  status text NOT NULL DEFAULT 'provisioning' CONSTRAINT workspaces_status_chk
    CHECK (status IN (
      'provisioning',
      'active',
      'paused',
      'archived',
      'deletion_pending',
      'deleted'
    )),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.workspaces IS
  'Optional immutable tenant subdivision for scoped work; never transferable across tenants.';

COMMENT ON COLUMN public.workspaces.id IS
  'Immutable workspace identity; never reused after deletion.';

COMMENT ON COLUMN public.workspaces.tenant_id IS
  'Immutable owning tenant; foreign key deletion is restricted for staged lifecycle deletion.';

COMMENT ON COLUMN public.workspaces.slug IS
  'Immutable normalized lowercase workspace selector, unique only within its tenant.';

COMMENT ON COLUMN public.workspaces.status IS
  'Workspace lifecycle state: provisioning, active, paused, archived, deletion_pending, or deleted.';

COMMENT ON COLUMN public.workspaces.updated_at IS
  'Updated by the workspace guard trigger on every permitted row update.';

COMMENT ON CONSTRAINT workspaces_tenant_id_fkey ON public.workspaces IS
  'Prevents orphan workspaces and blocks tenant deletion until staged workspace deletion is complete.';

COMMENT ON CONSTRAINT workspaces_tenant_slug_unique ON public.workspaces IS
  'Allows the same normalized slug in different tenants but not twice within one tenant.';

COMMENT ON CONSTRAINT workspaces_tenant_id_id_unique ON public.workspaces IS
  'Tenant-aware candidate key for future compound foreign keys that must preserve ownership.';

CREATE INDEX idx_workspaces_tenant_status_updated_at
  ON public.workspaces (tenant_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.novatrade_workspaces_guard_and_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'workspace id is immutable';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'workspace tenant_id is immutable';
  END IF;

  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'workspace slug is immutable';
  END IF;

  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_workspaces_guard_and_touch
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_workspaces_guard_and_touch();

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.novatrade_workspaces_guard_and_touch()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_workspaces_guard_and_touch() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_workspaces_guard_and_touch() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_workspaces_guard_and_touch() FROM authenticated';
    END IF;
  END IF;
END;
$$;

/*
Rehearsal SQL (comments only; run manually in a disposable Postgres 16 database):

-- Fixture setup: same workspace slug in two tenants is valid.
BEGIN;
INSERT INTO public.tenants (id, slug, name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'rehearsal-tenant-a', 'Rehearsal Tenant A'),
  ('00000000-0000-0000-0000-000000000002', 'rehearsal-tenant-b', 'Rehearsal Tenant B');

INSERT INTO public.workspaces (id, tenant_id, slug, name)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'shared-workspace', 'Tenant A Workspace'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'shared-workspace', 'Tenant B Workspace');
COMMIT;

-- Duplicate workspace slug within one tenant fails.
BEGIN;
INSERT INTO public.workspaces (tenant_id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'shared-workspace', 'Duplicate Workspace');
-- expect workspaces_tenant_slug_unique violation
ROLLBACK;

-- Orphan workspace fails.
BEGIN;
INSERT INTO public.workspaces (tenant_id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000099', 'orphan-workspace', 'Orphan Workspace');
-- expect workspaces_tenant_id_fkey violation
ROLLBACK;

-- Invalid workspace status fails.
BEGIN;
INSERT INTO public.workspaces (tenant_id, slug, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'bad-status', 'Bad Status Workspace', 'suspended');
-- expect workspaces_status_chk violation
ROLLBACK;

-- Tenant transfer, identity, and slug mutation each fail.
BEGIN;
UPDATE public.workspaces
SET tenant_id = '00000000-0000-0000-0000-000000000002'
WHERE id = '10000000-0000-0000-0000-000000000001';
-- expect workspace tenant_id is immutable
ROLLBACK;

BEGIN;
UPDATE public.workspaces
SET id = '10000000-0000-0000-0000-000000000003'
WHERE id = '10000000-0000-0000-0000-000000000001';
-- expect workspace id is immutable
ROLLBACK;

BEGIN;
UPDATE public.workspaces
SET slug = 'renamed-workspace'
WHERE id = '10000000-0000-0000-0000-000000000001';
-- expect workspace slug is immutable
ROLLBACK;

-- A permitted update touches updated_at; compare the two result rows.
BEGIN;
SELECT updated_at AS before_updated_at
FROM public.workspaces
WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE public.workspaces
SET name = 'Tenant A Workspace Updated'
WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT updated_at AS after_updated_at
FROM public.workspaces
WHERE id = '10000000-0000-0000-0000-000000000001';
-- expect after_updated_at to be later than before_updated_at
ROLLBACK;

-- Disposable cleanup.
BEGIN;
DELETE FROM public.workspaces
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);
DELETE FROM public.tenants
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);
COMMIT;
*/
