-- G-007P6: add one tenant-prefixed lead enrichment recovery index. The
-- existing global enrichment indexes remain the compatibility owners for
-- current unscoped selectors and workers.

DO $g007p6$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.leads') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P6_REQUIRED_TABLE_MISSING';
  END IF;

  IF NOT (
    SELECT count(*) = 7
      AND pg_catalog.bool_and(
        CASE a.attname
          WHEN 'tenant_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype AND a.attnotnull
          WHEN 'enrichment_status' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'score' THEN a.atttypid = 'double precision'::pg_catalog.regtype AND a.attnotnull
          WHEN 'enrichment_attempt_count' THEN a.atttypid = 'integer'::pg_catalog.regtype AND a.attnotnull
          WHEN 'enrichment_max_attempts' THEN a.atttypid = 'integer'::pg_catalog.regtype AND a.attnotnull
          WHEN 'enrichment_started_at' THEN a.atttypid = 'timestamp with time zone'::pg_catalog.regtype AND NOT a.attnotnull
          WHEN 'enrichment_next_retry_at' THEN a.atttypid = 'timestamp with time zone'::pg_catalog.regtype AND NOT a.attnotnull
          ELSE false
        END
      )
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.leads'::pg_catalog.regclass
      AND a.attname IN (
        'tenant_id', 'enrichment_status', 'score', 'enrichment_attempt_count',
        'enrichment_max_attempts', 'enrichment_started_at', 'enrichment_next_retry_at'
      )
      AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.leads'::pg_catalog.regclass
      AND c.conname = 'leads_enrichment_status_check'
      AND c.contype = 'c'
      AND c.convalidated
      AND NOT c.connoinherit
      AND pg_catalog.pg_get_constraintdef(c.oid)
        = 'CHECK ((enrichment_status = ANY (ARRAY[''pending''::text, ''running''::text, ''retry_wait''::text, ''enriched''::text, ''error''::text, ''skipped''::text])))'
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
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P6_INDEX_CATALOG_DRIFT';
  END IF;

  SELECT
    (SELECT count(*) = 1
       FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p6_leads_tenant_enrichment_')
        ) = 'idx_g007p6_leads_tenant_enrichment_')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_g007p6_leads_tenant_enrichment_recovery'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid)
          = 'CREATE INDEX idx_g007p6_leads_tenant_enrichment_recovery ON public.leads USING btree (tenant_id, enrichment_status, score DESC) WHERE (enrichment_status = ANY (ARRAY[''running''::text, ''retry_wait''::text]))'
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
          pg_catalog.length('idx_g007p6_leads_tenant_enrichment_')
        ) = 'idx_g007p6_leads_tenant_enrichment_'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_g007p5_leads_tenant_enrichment_ready'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_leads_enrichment'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid)
          = 'CREATE INDEX idx_leads_enrichment ON public.leads USING btree (enrichment_status, score DESC)'
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_leads_enrichment_lease'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid)
          = 'CREATE INDEX idx_leads_enrichment_lease ON public.leads USING btree (enrichment_status, enrichment_next_retry_at, score DESC) WHERE ((archived_at IS NULL) AND (COALESCE(is_excluded, 0) = 0))'
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P6_INDEX_CATALOG_DRIFT';
  END IF;

  CREATE INDEX idx_g007p6_leads_tenant_enrichment_recovery
    ON public.leads (tenant_id, enrichment_status, score DESC)
    WHERE enrichment_status IN ('running', 'retry_wait');
END;
$g007p6$;
