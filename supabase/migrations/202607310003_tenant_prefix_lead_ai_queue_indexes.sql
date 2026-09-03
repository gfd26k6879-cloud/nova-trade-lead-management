-- G-007P3: replace the two global lead AI-queue indexes with exact
-- tenant-prefixed equivalents. This migration does not grant table access,
-- create RLS policy, or change application data.

DO $g007p3$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.leads') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P3_REQUIRED_TABLE_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.leads'::pg_catalog.regclass
      AND a.attname = 'tenant_id'
      AND NOT a.attisdropped
      AND a.atttypid = 'uuid'::pg_catalog.regtype
      AND a.attnotnull
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.leads'::pg_catalog.regclass
      AND c.conname = 'leads_tenant_id_id_unique'
      AND c.contype = 'u'
      AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, id)'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index x
        WHERE x.indexrelid = c.conindid
          AND x.indrelid = 'public.leads'::pg_catalog.regclass
          AND x.indisunique
          AND x.indisvalid
          AND x.indisready
          AND x.indislive
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P3_INDEX_CATALOG_DRIFT';
  END IF;

  SELECT
    (SELECT count(*) = 2
       FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND i.relname IN (
          'idx_leads_ai_queue_ready',
          'idx_leads_ai_queue_status',
          'idx_g007p_leads_tenant_ai_queue_ready',
          'idx_g007p_leads_tenant_ai_queue_status'
        ))
    AND pg_catalog.to_regclass('public.idx_leads_ai_queue_ready') IS NULL
    AND pg_catalog.to_regclass('public.idx_leads_ai_queue_status') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_ready') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_ready'))
      = 'CREATE INDEX idx_g007p_leads_tenant_ai_queue_ready ON public.leads USING btree (tenant_id, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE (ai_queue_status = ''queued''::text)'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_index x
      WHERE x.indexrelid = pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_ready')
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND x.indisvalid AND x.indisready AND x.indislive
    )
    AND pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_status') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_status'))
      = 'CREATE INDEX idx_g007p_leads_tenant_ai_queue_status ON public.leads USING btree (tenant_id, ai_queue_status, ai_next_retry_at, sales_priority_score DESC)'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_index x
      WHERE x.indexrelid = pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_status')
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND x.indisvalid AND x.indisready AND x.indislive
    )
  INTO final_catalog;

  IF final_catalog THEN
    RETURN;
  END IF;

  SELECT
    (SELECT count(*) = 2
       FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND i.relname IN (
          'idx_leads_ai_queue_ready',
          'idx_leads_ai_queue_status',
          'idx_g007p_leads_tenant_ai_queue_ready',
          'idx_g007p_leads_tenant_ai_queue_status'
        ))
    AND pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_ready') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_leads_tenant_ai_queue_status') IS NULL
    AND pg_catalog.to_regclass('public.idx_leads_ai_queue_ready') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_leads_ai_queue_ready'))
      = 'CREATE INDEX idx_leads_ai_queue_ready ON public.leads USING btree (ai_queue_status, ai_next_retry_at, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE (ai_queue_status = ''queued''::text)'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_index x
      WHERE x.indexrelid = pg_catalog.to_regclass('public.idx_leads_ai_queue_ready')
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND x.indisvalid AND x.indisready AND x.indislive
    )
    AND pg_catalog.to_regclass('public.idx_leads_ai_queue_status') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_leads_ai_queue_status'))
      = 'CREATE INDEX idx_leads_ai_queue_status ON public.leads USING btree (ai_queue_status, ai_next_retry_at, sales_priority_score DESC)'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_index x
      WHERE x.indexrelid = pg_catalog.to_regclass('public.idx_leads_ai_queue_status')
        AND x.indrelid = 'public.leads'::pg_catalog.regclass
        AND x.indisvalid AND x.indisready AND x.indislive
    )
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P3_INDEX_CATALOG_DRIFT';
  END IF;

  DROP INDEX public.idx_leads_ai_queue_ready;
  DROP INDEX public.idx_leads_ai_queue_status;

  CREATE INDEX idx_g007p_leads_tenant_ai_queue_ready
    ON public.leads (
      tenant_id,
      sales_priority_score DESC,
      raw_opportunity_score DESC,
      score DESC,
      updated_at
    )
    WHERE ai_queue_status = 'queued';

  CREATE INDEX idx_g007p_leads_tenant_ai_queue_status
    ON public.leads (
      tenant_id,
      ai_queue_status,
      ai_next_retry_at,
      sales_priority_score DESC
    );
END;
$g007p3$;
