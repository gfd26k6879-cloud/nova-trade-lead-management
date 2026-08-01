-- G-007P8: add one tenant-prefixed dashboard discovered-at index while
-- retaining both global dashboard indexes for current unscoped compatibility.

DO $g007p8$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.leads') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P8_REQUIRED_TABLE_MISSING';
  END IF;

  IF NOT (
    SELECT count(*) = 2
      AND pg_catalog.bool_and(
        CASE a.attname
          WHEN 'tenant_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype AND a.attnotnull
          WHEN 'discovered_at' THEN a.atttypid = 'timestamp with time zone'::pg_catalog.regtype AND a.attnotnull
          ELSE false
        END
      )
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.leads'::pg_catalog.regclass
      AND a.attname IN ('tenant_id', 'discovered_at')
      AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class i ON i.oid = c.conindid
    JOIN pg_catalog.pg_index x ON x.indexrelid = c.conindid
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.leads'::pg_catalog.regclass
      AND c.conname = 'leads_tenant_id_id_unique'
      AND c.contype = 'u'
      AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, id)'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.leads'::pg_catalog.regclass
      AND x.indisunique
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P8_INDEX_CATALOG_DRIFT';
  END IF;

  SELECT
    (SELECT count(*) = 1
       FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p8_leads_tenant_discovered_')
        ) = 'idx_g007p8_leads_tenant_discovered_')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_g007p8_leads_tenant_discovered_at'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid)
          = 'CREATE INDEX idx_g007p8_leads_tenant_discovered_at ON public.leads USING btree (tenant_id, discovered_at)'
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
  INTO final_catalog;

  IF final_catalog THEN
    RETURN;
  END IF;

  SELECT
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p8_leads_tenant_discovered_')
        ) = 'idx_g007p8_leads_tenant_discovered_'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_leads_discovered_at'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid)
          = 'CREATE INDEX idx_leads_discovered_at ON public.leads USING btree (discovered_at)'
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P8_INDEX_CATALOG_DRIFT';
  END IF;

  CREATE INDEX idx_g007p8_leads_tenant_discovered_at
    ON public.leads (tenant_id, discovered_at);
END;
$g007p8$;
