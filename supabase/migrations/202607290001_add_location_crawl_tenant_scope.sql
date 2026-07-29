-- G-002: finalize tenant scope for market grants and crawl execution.
--
-- T-028 deliberately introduced nullable scope and an operator-only backfill.
-- This migration never chooses a tenant. Non-empty legacy tables must already
-- be reconciled by a completed PostgreSQL T-028 receipt or the transaction
-- fails before any G-002 object is created.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $g002_preflight$
DECLARE
  target_table text;
  actual_count bigint;
  actual_checksum text;
  required_columns integer;
  replay_catalog_complete boolean;
  matching_receipt_count integer;
  receipt_tenant_id uuid;
  receipt_workspace_id uuid;
  actual_counts jsonb := '{}'::jsonb;
  actual_checksums jsonb := '{}'::jsonb;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['user_market_access', 'crawl_runs', 'crawl_units'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = pg_catalog.format('G002_REQUIRED_TABLE_MISSING:%s', target_table);
    END IF;
  END LOOP;

  SELECT count(*)::integer
  INTO required_columns
  FROM pg_catalog.pg_attribute AS attribute
  WHERE (attribute.attrelid, attribute.attname) IN (
    ('public.user_market_access'::pg_catalog.regclass, 'tenant_id'),
    ('public.user_market_access'::pg_catalog.regclass, 'workspace_id'),
    ('public.crawl_runs'::pg_catalog.regclass, 'tenant_id'),
    ('public.crawl_runs'::pg_catalog.regclass, 'workspace_id'),
    ('public.crawl_units'::pg_catalog.regclass, 'tenant_id'),
    ('public.crawl_units'::pg_catalog.regclass, 'workspace_id')
  )
    AND NOT attribute.attisdropped;

  IF required_columns IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_T028_SCOPE_COLUMNS_REQUIRED';
  END IF;

  SELECT
    (SELECT count(*) = 4
     FROM pg_catalog.pg_attribute AS attribute
     WHERE (attribute.attrelid, attribute.attname) IN (
       ('public.user_market_access'::pg_catalog.regclass, 'tenant_id'),
       ('public.crawl_runs'::pg_catalog.regclass, 'tenant_id'),
       ('public.crawl_units'::pg_catalog.regclass, 'tenant_id'),
       ('public.crawl_units'::pg_catalog.regclass, 'location_mode')
     )
       AND attribute.attnotnull
       AND NOT attribute.attisdropped)
    AND (SELECT count(*) = 8
         FROM pg_catalog.pg_constraint AS constraint_record
         WHERE constraint_record.conrelid IN (
           'public.user_market_access'::pg_catalog.regclass,
           'public.crawl_runs'::pg_catalog.regclass,
           'public.crawl_units'::pg_catalog.regclass,
           'public.location_cells'::pg_catalog.regclass
         )
           AND constraint_record.conname IN (
             'user_market_access_tenant_workspace_user_market_unique',
             'crawl_runs_tenant_id_id_unique',
             'location_cells_market_id_id_unique',
             'crawl_runs_market_id_fkey',
             'crawl_units_tenant_run_fkey',
             'crawl_units_market_id_fkey',
             'crawl_units_market_cell_fkey',
             'crawl_units_location_mode_chk'
           ))
    AND pg_catalog.to_regclass('public.idx_user_market_access_tenant_market_user') IS NOT NULL
    AND pg_catalog.to_regclass('public.idx_crawl_runs_tenant_workspace_status_created') IS NOT NULL
    AND pg_catalog.to_regclass('public.idx_crawl_units_tenant_run_status') IS NOT NULL
    AND pg_catalog.to_regclass('public.idx_crawl_units_tenant_workspace_market_status') IS NOT NULL
    AND pg_catalog.to_regclass('public.idx_crawl_units_tenant_retry_ready') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.novatrade_validate_user_market_access_scope()') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.novatrade_validate_crawl_run_scope()') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.novatrade_inherit_crawl_unit_scope()') IS NOT NULL
    AND (SELECT count(*) = 3
         FROM pg_catalog.pg_trigger AS trigger_record
         WHERE trigger_record.tgrelid IN (
           'public.user_market_access'::pg_catalog.regclass,
           'public.crawl_runs'::pg_catalog.regclass,
           'public.crawl_units'::pg_catalog.regclass
         )
           AND trigger_record.tgname IN (
             'trg_novatrade_user_market_access_scope',
             'trg_novatrade_crawl_run_scope',
             'trg_novatrade_crawl_unit_scope'
           )
           AND NOT trigger_record.tgisinternal
           AND trigger_record.tgenabled <> 'D')
  INTO replay_catalog_complete;

  SELECT
    (SELECT count(*) FROM public.user_market_access)
    + (SELECT count(*) FROM public.crawl_runs)
    + (SELECT count(*) FROM public.crawl_units)
  INTO actual_count;

  IF NOT replay_catalog_complete AND actual_count > 0 THEN
    IF EXISTS (SELECT 1 FROM public.user_market_access WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.crawl_runs WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.crawl_units WHERE tenant_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_UNRECONCILED_T028_SCOPE';
    END IF;

    FOREACH target_table IN ARRAY ARRAY['user_market_access', 'crawl_runs', 'crawl_units'] LOOP
      EXECUTE pg_catalog.format(
        'SELECT count(*), pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I AS t',
        target_table
      ) INTO actual_count, actual_checksum;
      actual_counts := actual_counts || pg_catalog.jsonb_build_object(target_table, actual_count);
      actual_checksums := actual_checksums || pg_catalog.jsonb_build_object(target_table, actual_checksum);
    END LOOP;

    SELECT count(*)::integer
    INTO matching_receipt_count
    FROM public.compatibility_backfill_receipts AS receipt
    WHERE receipt.status = 'completed'
      AND receipt.source_engine = 'postgres'
      AND receipt.relationship_orphan_count = 0
      AND receipt.table_counts->'user_market_access' = actual_counts->'user_market_access'
      AND receipt.table_counts->'crawl_runs' = actual_counts->'crawl_runs'
      AND receipt.table_counts->'crawl_units' = actual_counts->'crawl_units'
      AND receipt.after_content_checksums->'user_market_access' = actual_checksums->'user_market_access'
      AND receipt.after_content_checksums->'crawl_runs' = actual_checksums->'crawl_runs'
      AND receipt.after_content_checksums->'crawl_units' = actual_checksums->'crawl_units';

    IF matching_receipt_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_MATCHING_T028_RECEIPT_REQUIRED';
    ELSIF matching_receipt_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED';
    END IF;

    SELECT receipt.tenant_id, receipt.workspace_id
    INTO STRICT receipt_tenant_id, receipt_workspace_id
    FROM public.compatibility_backfill_receipts AS receipt
    WHERE receipt.status = 'completed'
      AND receipt.source_engine = 'postgres'
      AND receipt.relationship_orphan_count = 0
      AND receipt.table_counts->'user_market_access' = actual_counts->'user_market_access'
      AND receipt.table_counts->'crawl_runs' = actual_counts->'crawl_runs'
      AND receipt.table_counts->'crawl_units' = actual_counts->'crawl_units'
      AND receipt.after_content_checksums->'user_market_access' = actual_checksums->'user_market_access'
      AND receipt.after_content_checksums->'crawl_runs' = actual_checksums->'crawl_runs'
      AND receipt.after_content_checksums->'crawl_units' = actual_checksums->'crawl_units';

    IF EXISTS (
      SELECT 1 FROM public.user_market_access AS access
      WHERE access.tenant_id IS DISTINCT FROM receipt_tenant_id
         OR access.workspace_id IS DISTINCT FROM receipt_workspace_id
    ) OR EXISTS (
      SELECT 1 FROM public.crawl_runs AS run
      WHERE run.tenant_id IS DISTINCT FROM receipt_tenant_id
         OR run.workspace_id IS DISTINCT FROM receipt_workspace_id
    ) OR EXISTS (
      SELECT 1 FROM public.crawl_units AS unit
      WHERE unit.tenant_id IS DISTINCT FROM receipt_tenant_id
         OR unit.workspace_id IS DISTINCT FROM receipt_workspace_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_T028_RECEIPT_SCOPE_DRIFT';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_market_access AS access
    LEFT JOIN public.workspaces AS workspace
      ON workspace.tenant_id = access.tenant_id AND workspace.id = access.workspace_id
    WHERE access.workspace_id IS NOT NULL AND workspace.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.crawl_runs AS run
    LEFT JOIN public.workspaces AS workspace
      ON workspace.tenant_id = run.tenant_id AND workspace.id = run.workspace_id
    WHERE run.workspace_id IS NOT NULL AND workspace.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.crawl_units AS unit
    LEFT JOIN public.workspaces AS workspace
      ON workspace.tenant_id = unit.tenant_id AND workspace.id = unit.workspace_id
    WHERE unit.workspace_id IS NOT NULL AND workspace.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_CROSS_TENANT_WORKSPACE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_market_access AS access
    LEFT JOIN public.location_markets AS market ON market.id = access.market_id
    WHERE market.id IS NULL OR market.status <> 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_ACTIVE_MARKET_ACCESS_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_market_access AS access
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      WHERE membership.tenant_id = access.tenant_id
        AND membership.auth_identity_id::text = access.user_id
        AND membership.status = 'active'
        AND (membership.workspace_id IS NULL OR membership.workspace_id IS NOT DISTINCT FROM access.workspace_id)
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_ACTIVE_MEMBERSHIP_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crawl_units AS unit
    LEFT JOIN public.crawl_runs AS run ON run.id = unit.crawl_run_id
    WHERE run.id IS NULL
       OR unit.tenant_id IS DISTINCT FROM run.tenant_id
       OR unit.workspace_id IS DISTINCT FROM run.workspace_id
       OR unit.market_id IS DISTINCT FROM run.market_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_CRAWL_PARENT_SCOPE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.crawl_runs AS run
    LEFT JOIN public.location_markets AS market ON market.id = run.market_id
    WHERE run.market_id IS NOT NULL AND market.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.crawl_units AS unit
    LEFT JOIN public.location_markets AS market ON market.id = unit.market_id
    WHERE unit.market_id IS NOT NULL AND market.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.crawl_units AS unit
    LEFT JOIN public.location_cells AS cell
      ON cell.id = unit.location_cell_id AND cell.market_id = unit.market_id
    WHERE unit.location_cell_id IS NOT NULL AND cell.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_LOCATION_REFERENCE_MISMATCH';
  END IF;
END;
$g002_preflight$;

ALTER TABLE public.crawl_units
  ADD COLUMN IF NOT EXISTS location_mode text;

UPDATE public.crawl_units AS unit
SET location_mode = CASE
  WHEN unit.location_cell_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.location_cells AS cell
      WHERE cell.id = unit.location_cell_id
        AND cell.market_id = unit.market_id
        AND cell.is_active = 1
        AND cell.cell_type = 'zip'
        AND (cell.postal_code = unit.zip OR cell.postal_code_normalized = unit.zip)
    )
    AND EXISTS (SELECT 1 FROM public.zip_codes AS zip WHERE zip.zip = unit.zip)
    THEN 'legacy_zip'
  WHEN unit.location_cell_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.location_cells AS cell
      WHERE cell.id = unit.location_cell_id
        AND cell.market_id = unit.market_id
        AND cell.is_active = 1
        AND cell.cell_type <> 'zip'
    )
    THEN 'platform_cell'
  WHEN unit.location_cell_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.zip_codes AS zip WHERE zip.zip = unit.zip)
    THEN 'generalized'
  ELSE NULL
END
WHERE unit.location_mode IS NULL;

DO $g002_location_classification$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.crawl_units AS unit
    WHERE unit.location_mode IS NULL
       OR (unit.location_mode = 'legacy_zip' AND NOT (
         unit.location_cell_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.location_cells AS cell
           WHERE cell.id = unit.location_cell_id
             AND cell.market_id = unit.market_id
             AND cell.is_active = 1
             AND cell.cell_type = 'zip'
             AND (cell.postal_code = unit.zip OR cell.postal_code_normalized = unit.zip)
         )
         AND EXISTS (SELECT 1 FROM public.zip_codes AS zip WHERE zip.zip = unit.zip)
       ))
       OR (unit.location_mode = 'platform_cell' AND NOT (
         unit.location_cell_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.location_cells AS cell
           WHERE cell.id = unit.location_cell_id
             AND cell.market_id = unit.market_id
             AND cell.is_active = 1
             AND cell.cell_type <> 'zip'
         )
       ))
       OR (unit.location_mode = 'generalized' AND NOT (
         unit.location_cell_id IS NULL
       ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G002_AMBIGUOUS_OR_INVALID_LOCATION_MODE';
  END IF;
END;
$g002_location_classification$;

ALTER TABLE public.crawl_units
  ALTER COLUMN location_mode SET DEFAULT 'legacy_zip';

DO $g002_constraints$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.user_market_access'::pg_catalog.regclass
      AND conname = 'user_market_access_pkey'
  ) THEN
    ALTER TABLE public.user_market_access DROP CONSTRAINT user_market_access_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.user_market_access'::pg_catalog.regclass
      AND conname = 'user_market_access_tenant_workspace_user_market_unique'
  ) THEN
    ALTER TABLE public.user_market_access
      ADD CONSTRAINT user_market_access_tenant_workspace_user_market_unique
      UNIQUE NULLS NOT DISTINCT (tenant_id, workspace_id, user_id, market_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_runs'::pg_catalog.regclass
      AND conname = 'crawl_runs_tenant_id_id_unique'
  ) THEN
    ALTER TABLE public.crawl_runs
      ADD CONSTRAINT crawl_runs_tenant_id_id_unique UNIQUE (tenant_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.location_cells'::pg_catalog.regclass
      AND conname = 'location_cells_market_id_id_unique'
  ) THEN
    ALTER TABLE public.location_cells
      ADD CONSTRAINT location_cells_market_id_id_unique UNIQUE (market_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_runs'::pg_catalog.regclass
      AND conname = 'crawl_runs_market_id_fkey'
  ) THEN
    ALTER TABLE public.crawl_runs
      ADD CONSTRAINT crawl_runs_market_id_fkey
      FOREIGN KEY (market_id) REFERENCES public.location_markets (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_units'::pg_catalog.regclass
      AND conname = 'crawl_units_tenant_run_fkey'
  ) THEN
    ALTER TABLE public.crawl_units
      ADD CONSTRAINT crawl_units_tenant_run_fkey
      FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES public.crawl_runs (tenant_id, id)
      ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_units'::pg_catalog.regclass
      AND conname = 'crawl_units_market_id_fkey'
  ) THEN
    ALTER TABLE public.crawl_units
      ADD CONSTRAINT crawl_units_market_id_fkey
      FOREIGN KEY (market_id) REFERENCES public.location_markets (id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_units'::pg_catalog.regclass
      AND conname = 'crawl_units_market_cell_fkey'
  ) THEN
    ALTER TABLE public.crawl_units
      ADD CONSTRAINT crawl_units_market_cell_fkey
      FOREIGN KEY (market_id, location_cell_id) REFERENCES public.location_cells (market_id, id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.crawl_units'::pg_catalog.regclass
      AND conname = 'crawl_units_location_mode_chk'
  ) THEN
    ALTER TABLE public.crawl_units
      ADD CONSTRAINT crawl_units_location_mode_chk
      CHECK (location_mode IN ('legacy_zip', 'platform_cell', 'generalized'));
  END IF;
END;
$g002_constraints$;

CREATE OR REPLACE FUNCTION public.novatrade_validate_user_market_access_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.location_markets AS market
    WHERE market.id = NEW.market_id AND market.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_ACTIVE_PLATFORM_MARKET_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.auth_identity_id::text = NEW.user_id
      AND membership.status = 'active'
      AND (membership.workspace_id IS NULL OR membership.workspace_id IS NOT DISTINCT FROM NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_ACTIVE_MEMBERSHIP_REQUIRED';
  END IF;

  IF NEW.created_by_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.auth_identity_id::text = NEW.created_by_user_id
      AND membership.status = 'active'
      AND (membership.workspace_id IS NULL OR membership.workspace_id IS NOT DISTINCT FROM NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_ACTIVE_GRANT_CREATOR_MEMBERSHIP_REQUIRED';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_validate_crawl_run_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.market_id IS DISTINCT FROM OLD.market_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_CRAWL_RUN_SCOPE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.novatrade_inherit_crawl_unit_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  parent_tenant_id uuid;
  parent_workspace_id uuid;
  parent_market_id text;
BEGIN
  SELECT run.tenant_id, run.workspace_id, run.market_id
  INTO parent_tenant_id, parent_workspace_id, parent_market_id
  FROM public.crawl_runs AS run
  WHERE run.id = NEW.crawl_run_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'G002_CRAWL_RUN_PARENT_REQUIRED';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_CRAWL_UNIT_TENANT_MISMATCH';
  END IF;
  IF NEW.workspace_id IS NOT NULL AND NEW.workspace_id IS DISTINCT FROM parent_workspace_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_CRAWL_UNIT_WORKSPACE_MISMATCH';
  END IF;
  IF NEW.market_id IS DISTINCT FROM parent_market_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_CRAWL_UNIT_MARKET_MISMATCH';
  END IF;

  NEW.tenant_id := parent_tenant_id;
  NEW.workspace_id := parent_workspace_id;

  IF NEW.location_mode = 'legacy_zip' THEN
    IF NEW.location_cell_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.location_cells AS cell
         WHERE cell.id = NEW.location_cell_id
           AND cell.market_id = NEW.market_id
           AND cell.is_active = 1
           AND cell.cell_type = 'zip'
           AND (cell.postal_code = NEW.zip OR cell.postal_code_normalized = NEW.zip)
       )
       OR NOT EXISTS (SELECT 1 FROM public.zip_codes AS zip WHERE zip.zip = NEW.zip) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_LEGACY_ZIP_LOCATION_REQUIRED';
    END IF;
  ELSIF NEW.location_mode = 'platform_cell' THEN
    IF NEW.location_cell_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.location_cells AS cell
         WHERE cell.id = NEW.location_cell_id
           AND cell.market_id = NEW.market_id
           AND cell.is_active = 1
           AND cell.cell_type <> 'zip'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_ACTIVE_NON_ZIP_PLATFORM_CELL_REQUIRED';
    END IF;
  ELSIF NEW.location_mode = 'generalized' THEN
    IF NEW.location_cell_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_GENERALIZED_LOCATION_MUST_NOT_USE_ZIP_RELATIONSHIPS';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'G002_VALID_LOCATION_MODE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.novatrade_validate_user_market_access_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_validate_crawl_run_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_inherit_crawl_unit_scope() FROM PUBLIC;

DO $g002_function_privileges$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.novatrade_validate_user_market_access_scope() FROM anon;
    REVOKE ALL ON FUNCTION public.novatrade_validate_crawl_run_scope() FROM anon;
    REVOKE ALL ON FUNCTION public.novatrade_inherit_crawl_unit_scope() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.novatrade_validate_user_market_access_scope() FROM authenticated;
    REVOKE ALL ON FUNCTION public.novatrade_validate_crawl_run_scope() FROM authenticated;
    REVOKE ALL ON FUNCTION public.novatrade_inherit_crawl_unit_scope() FROM authenticated;
  END IF;
END;
$g002_function_privileges$;

DROP TRIGGER IF EXISTS trg_novatrade_user_market_access_scope ON public.user_market_access;
CREATE TRIGGER trg_novatrade_user_market_access_scope
BEFORE INSERT OR UPDATE ON public.user_market_access
FOR EACH ROW EXECUTE FUNCTION public.novatrade_validate_user_market_access_scope();

DROP TRIGGER IF EXISTS trg_novatrade_crawl_run_scope ON public.crawl_runs;
CREATE TRIGGER trg_novatrade_crawl_run_scope
BEFORE UPDATE OF tenant_id, workspace_id, market_id ON public.crawl_runs
FOR EACH ROW EXECUTE FUNCTION public.novatrade_validate_crawl_run_scope();

DROP TRIGGER IF EXISTS trg_novatrade_crawl_unit_scope ON public.crawl_units;
CREATE TRIGGER trg_novatrade_crawl_unit_scope
BEFORE INSERT OR UPDATE ON public.crawl_units
FOR EACH ROW EXECUTE FUNCTION public.novatrade_inherit_crawl_unit_scope();

CREATE INDEX IF NOT EXISTS idx_user_market_access_tenant_market_user
  ON public.user_market_access (tenant_id, market_id, user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_tenant_workspace_status_created
  ON public.crawl_runs (tenant_id, workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_tenant_run_status
  ON public.crawl_units (tenant_id, crawl_run_id, status);
CREATE INDEX IF NOT EXISTS idx_crawl_units_tenant_workspace_market_status
  ON public.crawl_units (tenant_id, workspace_id, market_id, status);
CREATE INDEX IF NOT EXISTS idx_crawl_units_tenant_retry_ready
  ON public.crawl_units (tenant_id, status, next_retry_at, created_at)
  WHERE status IN ('pending', 'retry_wait');

ALTER TABLE public.user_market_access ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.crawl_runs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.crawl_units ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.crawl_units ALTER COLUMN location_mode SET NOT NULL;

REVOKE ALL ON TABLE public.user_market_access, public.crawl_runs, public.crawl_units
FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.crawl_units.location_mode IS
  'Explicit location interpretation: only legacy_zip requires zip_codes; generalized tokens never derive tenant authority.';
COMMENT ON CONSTRAINT user_market_access_tenant_workspace_user_market_unique ON public.user_market_access IS
  'Null-safe tenant/workspace grant identity; the same Auth identity and platform market may be used independently by another tenant.';
COMMENT ON CONSTRAINT crawl_units_tenant_run_fkey ON public.crawl_units IS
  'Database-enforced tenant equality with the parent run; workspace equality is copied and checked by the hardened trigger.';

COMMIT;
