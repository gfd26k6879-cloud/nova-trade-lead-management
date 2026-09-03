-- G-007P2: replace the remaining AI-verification global secondary indexes
-- with tenant-prefixed equivalents. The accepted G-004A tenant/lead index is
-- retained. This migration does not grant table access or create RLS policy.

DO $g007p2$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.ai_lead_verifications') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P2_REQUIRED_TABLE_MISSING';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.ai_lead_verifications'::pg_catalog.regclass
        AND attname = 'tenant_id' AND NOT attisdropped AND attnotnull
    )
    AND pg_catalog.to_regclass('public.idx_ai_verifications_tenant_lead_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_verifications_tenant_lead_created'))
      = 'CREATE INDEX idx_ai_verifications_tenant_lead_created ON public.ai_lead_verifications USING btree (tenant_id, lead_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_status_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_status_created'))
      = 'CREATE INDEX idx_g007p_ai_verifications_tenant_status_created ON public.ai_lead_verifications USING btree (tenant_id, status, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_requester_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_requester_created'))
      = 'CREATE INDEX idx_g007p_ai_verifications_tenant_requester_created ON public.ai_lead_verifications USING btree (tenant_id, requested_by_user_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_ai_verifications_lead_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_ai_verifications_status_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_ai_verifications_requester_created') IS NULL
  INTO final_catalog;

  IF final_catalog THEN
    RETURN;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.ai_lead_verifications'::pg_catalog.regclass
        AND attname = 'tenant_id' AND NOT attisdropped AND attnotnull
    )
    AND pg_catalog.to_regclass('public.idx_ai_verifications_tenant_lead_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_verifications_tenant_lead_created'))
      = 'CREATE INDEX idx_ai_verifications_tenant_lead_created ON public.ai_lead_verifications USING btree (tenant_id, lead_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_ai_verifications_lead_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_verifications_lead_created'))
      = 'CREATE INDEX idx_ai_verifications_lead_created ON public.ai_lead_verifications USING btree (lead_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_ai_verifications_status_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_verifications_status_created'))
      = 'CREATE INDEX idx_ai_verifications_status_created ON public.ai_lead_verifications USING btree (status, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_ai_verifications_requester_created') IS NOT NULL
    AND pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.idx_ai_verifications_requester_created'))
      = 'CREATE INDEX idx_ai_verifications_requester_created ON public.ai_lead_verifications USING btree (requested_by_user_id, created_at DESC)'
    AND pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_status_created') IS NULL
    AND pg_catalog.to_regclass('public.idx_g007p_ai_verifications_tenant_requester_created') IS NULL
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P2_INDEX_CATALOG_DRIFT';
  END IF;

  DROP INDEX public.idx_ai_verifications_lead_created;
  DROP INDEX public.idx_ai_verifications_status_created;
  DROP INDEX public.idx_ai_verifications_requester_created;

  CREATE INDEX idx_g007p_ai_verifications_tenant_status_created
    ON public.ai_lead_verifications (tenant_id, status, created_at DESC);
  CREATE INDEX idx_g007p_ai_verifications_tenant_requester_created
    ON public.ai_lead_verifications (tenant_id, requested_by_user_id, created_at DESC);
END;
$g007p2$;
