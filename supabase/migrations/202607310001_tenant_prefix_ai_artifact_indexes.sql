-- G-007P1: replace the remaining lead-AI-artifact global hot-path indexes
-- with tenant-prefixed equivalents. This is additive to the accepted G-004A
-- ownership constraints and does not grant table access or create RLS policy.

DO $g007p1$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.lead_ai_artifacts') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P1_REQUIRED_TABLE_MISSING';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.lead_ai_artifacts'::pg_catalog.regclass
        AND attname = 'tenant_id' AND NOT attisdropped AND attnotnull
    )
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_lead_type_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_lead_type_created'))
      = 'CREATE INDEX idx_g007p_ai_artifacts_tenant_lead_type_created ON public.lead_ai_artifacts USING btree (tenant_id, lead_id, artifact_type, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_status_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_status_created'))
      = 'CREATE INDEX idx_g007p_ai_artifacts_tenant_status_created ON public.lead_ai_artifacts USING btree (tenant_id, status, created_at)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_retry_ready') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_retry_ready'))
      = 'CREATE INDEX idx_g007p_ai_artifacts_tenant_retry_ready ON public.lead_ai_artifacts USING btree (tenant_id, status, next_retry_at, created_at) WHERE (status = ''queued''::text)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_requester_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_requester_created'))
      = 'CREATE INDEX idx_g007p_ai_artifacts_tenant_requester_created ON public.lead_ai_artifacts USING btree (tenant_id, requested_by_user_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_lead_type_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_status_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_retry_ready') IS NULL
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_requester_created') IS NULL
  INTO final_catalog;

  IF final_catalog THEN
    RETURN;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.lead_ai_artifacts'::pg_catalog.regclass
        AND attname = 'tenant_id' AND NOT attisdropped AND attnotnull
    )
    AND pg_catalog.to_regclass('public.idx_ai_artifacts_tenant_queue') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_artifacts_tenant_queue'))
      = 'CREATE INDEX idx_ai_artifacts_tenant_queue ON public.lead_ai_artifacts USING btree (tenant_id, status, next_retry_at, created_at) WHERE (status = ANY (ARRAY[''queued''::text, ''error''::text]))'
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_lead_type_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_lead_ai_artifacts_lead_type_created'))
      = 'CREATE INDEX idx_lead_ai_artifacts_lead_type_created ON public.lead_ai_artifacts USING btree (lead_id, artifact_type, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_status_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_lead_ai_artifacts_status_created'))
      = 'CREATE INDEX idx_lead_ai_artifacts_status_created ON public.lead_ai_artifacts USING btree (status, created_at)'
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_retry_ready') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_lead_ai_artifacts_retry_ready'))
      = 'CREATE INDEX idx_lead_ai_artifacts_retry_ready ON public.lead_ai_artifacts USING btree (status, next_retry_at, created_at) WHERE (status = ''queued''::text)'
    AND pg_catalog.to_regclass('public.idx_lead_ai_artifacts_requester_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_lead_ai_artifacts_requester_created'))
      = 'CREATE INDEX idx_lead_ai_artifacts_requester_created ON public.lead_ai_artifacts USING btree (requested_by_user_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_lead_type_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_status_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_retry_ready') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_ai_artifacts_tenant_requester_created') IS NULL
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P1_INDEX_CATALOG_DRIFT';
  END IF;

  DROP INDEX public.idx_lead_ai_artifacts_lead_type_created;
  DROP INDEX public.idx_lead_ai_artifacts_status_created;
  DROP INDEX public.idx_lead_ai_artifacts_retry_ready;
  DROP INDEX public.idx_lead_ai_artifacts_requester_created;

  CREATE INDEX idx_g007p_ai_artifacts_tenant_lead_type_created
    ON public.lead_ai_artifacts (tenant_id, lead_id, artifact_type, created_at DESC);
  CREATE INDEX idx_g007p_ai_artifacts_tenant_status_created
    ON public.lead_ai_artifacts (tenant_id, status, created_at);
  CREATE INDEX idx_g007p_ai_artifacts_tenant_retry_ready
    ON public.lead_ai_artifacts (tenant_id, status, next_retry_at, created_at)
    WHERE status = 'queued';
  CREATE INDEX idx_g007p_ai_artifacts_tenant_requester_created
    ON public.lead_ai_artifacts (tenant_id, requested_by_user_id, created_at DESC);
END;
$g007p1$;
