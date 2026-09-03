CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  slug text NOT NULL CONSTRAINT tenants_slug_length_chk
    CHECK (char_length(slug) BETWEEN 2 AND 80),
  -- Slug is validated lexically for normalized, lowercase token shape.
  CONSTRAINT tenants_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  name text NOT NULL CONSTRAINT tenants_name_length_chk
    CHECK (char_length(trim(name)) BETWEEN 1 AND 180),
  status text NOT NULL DEFAULT 'provisioning' CONSTRAINT tenants_status_chk
    CHECK (status IN ('provisioning', 'active', 'suspended', 'archived', 'deletion_pending', 'deleted')),
  locale text NOT NULL DEFAULT 'en-US'
    CONSTRAINT tenants_locale_length_chk CHECK (char_length(trim(locale)) BETWEEN 2 AND 64)
    CONSTRAINT tenants_locale_format_chk
    CHECK (locale ~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$'),
  -- TIMEZONE CHECK is an anchored lexical envelope only. PostgreSQL cannot prove
  -- IANA/zoneinfo registry validity itself, so malformed values are rejected by
  -- syntax and invalid names are validated later at runtime parsing.
  timezone text NOT NULL DEFAULT 'UTC'
    CONSTRAINT tenants_timezone_length_chk CHECK (char_length(trim(timezone)) BETWEEN 1 AND 64)
    CONSTRAINT tenants_timezone_format_chk
    CHECK (
      timezone = 'UTC' OR
      timezone ~ '^(?:[A-Za-z_]+(?:/[A-Za-z_][A-Za-z0-9_-]*)*|Etc/GMT[+-](?:1[0-4]|[0-9]))$'
    ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.tenants IS
  'Root tenant registration table for tenant-scoped ownership and isolation boundaries.';

COMMENT ON COLUMN public.tenants.slug IS
  'Tenant slug is immutable tenant identity used as a stable canonical selector.';

COMMENT ON COLUMN public.tenants.status IS
  'Tenant lifecycle state: provisioning -> active -> suspended/archived -> deletion_pending -> deleted.';

COMMENT ON COLUMN public.tenants.updated_at IS
  'Updated by tenant update trigger for write-path auditability and mutation recency.';

CREATE INDEX idx_tenants_status_created_at ON public.tenants (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.novatrade_tenants_guard_and_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'tenant slug is immutable';
  END IF;

  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_tenants_guard_and_touch
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_tenants_guard_and_touch();

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.novatrade_tenants_guard_and_touch()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenants_guard_and_touch() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenants_guard_and_touch() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenants_guard_and_touch() FROM authenticated';
    END IF;
  END IF;
END;
$$;

/*
Rehearsal SQL (comments only; run manually in a disposable DB):

BEGIN;

-- Valid insert
INSERT INTO public.tenants (slug, name, locale, timezone, status)
VALUES ('tenant-valid', 'Acme Tenant', 'en-US', 'America/Denver', 'provisioning');

-- Valid update touching status and name; updated_at should refresh
UPDATE public.tenants
SET status = 'active', name = 'Acme Tenant Updated'
WHERE slug = 'tenant-valid';

-- Duplicate slug violation
INSERT INTO public.tenants (slug, name)
VALUES ('tenant-valid', 'Second Tenant');

-- Invalid status violation
INSERT INTO public.tenants (slug, name, status)
VALUES ('tenant-status-bad', 'Bad Status Tenant', 'paused');

-- Malformed timezone violation
INSERT INTO public.tenants (slug, name, timezone)
VALUES ('tenant-tz-bad', 'Bad Timezone Tenant', 'America//Denver');

-- Slug mutation violation
UPDATE public.tenants
SET slug = 'tenant-new'
WHERE slug = 'tenant-valid';

ROLLBACK;
*/
