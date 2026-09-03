-- T-028: compatibility-tenant backfill machinery.
--
-- This migration is intentionally forward-only and does not execute a backfill.
-- Activation requires an explicitly approved manifest and an authorized snapshot.
-- The function is SECURITY DEFINER because several foundation tables are RLS
-- protected. Its execute privilege is revoked below; activation is an operator
-- migration action, never a browser/API action.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'settings', 'user_market_access', 'leads', 'place_cache', 'places_master',
    'place_observations', 'api_usage_events', 'ai_usage_events',
    'crawl_runs', 'crawl_units', 'lead_notes', 'outreach_events',
    'admin_requests', 'demos', 'ai_lead_verifications', 'lead_ai_artifacts',
    'ai_feedback_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', table_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      table_name, table_name || '_tenant_id_fkey'
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'user_market_access', 'crawl_runs', 'crawl_units', 'lead_notes',
    'outreach_events', 'admin_requests', 'demos', 'ai_lead_verifications',
    'lead_ai_artifacts', 'ai_feedback_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid', table_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, workspace_id) REFERENCES public.workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      table_name, table_name || '_tenant_workspace_fkey'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (workspace_id IS NULL OR tenant_id IS NOT NULL)',
      table_name, table_name || '_workspace_requires_tenant_chk'
    );
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.settings.tenant_id IS
  'Nullable until the explicit compatibility backfill activates; the legacy singleton becomes one tenant-owned policy row.';
COMMENT ON COLUMN public.user_market_access.tenant_id IS
  'Tenant ownership assigned only by an explicit compatibility manifest; market rows never authorize another tenant.';
COMMENT ON COLUMN public.leads.tenant_id IS
  'Tenant ownership for the legacy-website-lead compatibility projection.';

ALTER TABLE public.tenant_policies
  ADD COLUMN IF NOT EXISTS compatibility_policy_hash text;
ALTER TABLE public.tenant_policies
  ADD CONSTRAINT tenant_policies_compatibility_policy_hash_chk
    CHECK (compatibility_policy_hash IS NULL OR compatibility_policy_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.tenant_policies
  ADD CONSTRAINT tenant_policies_tenant_id_id_unique UNIQUE (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_legacy_compatibility_tenant
  ON public.leads (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_legacy_compatibility_workspace
  ON public.crawl_runs (tenant_id, workspace_id, id);

CREATE TABLE public.compatibility_backfill_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  idempotency_key text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  source_engine text NOT NULL,
  checksum_algorithm text NOT NULL,
  manifest_hash text NOT NULL,
  source_snapshot_fingerprint text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  owner_auth_identity_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version >= 1),
  policy_hash text NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  user_count integer NOT NULL CHECK (user_count >= 0),
  table_counts jsonb NOT NULL,
  before_content_checksums jsonb NOT NULL,
  after_content_checksums jsonb NOT NULL,
  relationship_orphan_count integer NOT NULL CHECK (relationship_orphan_count = 0),
  status text NOT NULL CHECK (status = 'completed'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  receipt jsonb NOT NULL,
  CONSTRAINT compatibility_backfill_receipts_key_unique UNIQUE (idempotency_key),
  CONSTRAINT compatibility_backfill_receipts_manifest_hash_chk
    CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT compatibility_backfill_receipts_source_fingerprint_chk
    CHECK (source_snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT compatibility_backfill_receipts_engine_algorithm_pair_chk
    CHECK (
      (source_engine = 'postgres' AND checksum_algorithm = 'novatrade-postgres-jsonb-text-v1')
      OR (source_engine = 'sqlite' AND checksum_algorithm = 'novatrade-sqlite-canonical-json-v1')
    ),
  CONSTRAINT compatibility_backfill_receipts_tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES public.workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT compatibility_backfill_receipts_policy_fkey
    FOREIGN KEY (tenant_id, policy_id) REFERENCES public.tenant_policies (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT compatibility_backfill_receipts_counts_object_chk
    CHECK (jsonb_typeof(table_counts) = 'object'),
  CONSTRAINT compatibility_backfill_receipts_before_checksums_object_chk
    CHECK (jsonb_typeof(before_content_checksums) = 'object'),
  CONSTRAINT compatibility_backfill_receipts_after_checksums_object_chk
    CHECK (jsonb_typeof(after_content_checksums) = 'object'),
  CONSTRAINT compatibility_backfill_receipts_receipt_object_chk
    CHECK (jsonb_typeof(receipt) = 'object' AND receipt->>'status' = 'completed'),
  CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk
    CHECK (
      receipt->>'manifestHash' = manifest_hash
      AND receipt->>'sourceEngine' = source_engine
      AND receipt->>'checksumAlgorithm' = checksum_algorithm
      AND receipt->>'sourceSnapshotFingerprint' = source_snapshot_fingerprint
      AND receipt->>'tenantId' = tenant_id::text
      AND receipt->>'workspaceId' = workspace_id::text
      AND receipt->>'ownerAuthIdentityId' = owner_auth_identity_id::text
      AND receipt->>'policyId' = policy_id::text
      AND receipt->>'policyVersion' = policy_version::text
      AND receipt->>'policyHash' = policy_hash
      AND receipt->>'receiptId' = id::text
      AND receipt->>'idempotencyKey' = idempotency_key
      AND receipt->>'schemaVersion' = schema_version::text
      AND receipt->>'userCount' = user_count::text
      AND receipt->'tableCounts' = table_counts
      AND receipt->'beforeContentChecksums' = before_content_checksums
      AND receipt->'afterContentChecksums' = after_content_checksums
      AND receipt->>'relationshipOrphanCount' = relationship_orphan_count::text
      AND receipt->>'status' = status
    )
);

COMMENT ON TABLE public.compatibility_backfill_receipts IS
  'Append-only activation receipts for an explicit, snapshot-bound compatibility tenant backfill. No receipt means no authorized activation.';

CREATE INDEX idx_compatibility_backfill_receipts_tenant
  ON public.compatibility_backfill_receipts (tenant_id, completed_at DESC);

CREATE OR REPLACE FUNCTION public.novatrade_compatibility_backfill_receipt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'compatibility backfill receipts are append-only';
  END IF;
  NEW.created_at = pg_catalog.now();
  NEW.completed_at = pg_catalog.now();
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'compatibility backfill receipt status is immutable and must be completed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.compatibility_backfill_receipts
FOR EACH ROW
EXECUTE FUNCTION public.novatrade_compatibility_backfill_receipt_guard();

ALTER TABLE public.compatibility_backfill_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compatibility_backfill_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compatibility_backfill_receipts FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.compatibility_backfill_receipts FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.compatibility_backfill_receipts FROM authenticated';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.novatrade_compatibility_backfill_receipt_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.novatrade_assert_compatibility_baseline_policy(
  p_tenant_id uuid,
  p_policy_id uuid,
  p_policy_version integer,
  p_policy_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_policies p
    WHERE p.id = p_policy_id
      AND p.tenant_id = p_tenant_id
      AND p.version = p_policy_version
      AND p.compatibility_policy_hash = p_policy_hash
      AND p.locale = 'en-US'
      AND p.timezone = 'UTC'
      AND p.export_retention_days = 7
      AND p.operational_log_retention_days = 30
      AND p.raw_source_retention_days = 180
      AND p.contact_freshness_days = 180
      AND p.primary_delete_within_days = 30
      AND p.backup_expire_within_days = 35
      AND p.tombstone_retention_years = 7
      AND p.active_materials_mode = 'while_authorized_until_superseded_policy_or_deletion'
      AND p.ai_processing_enabled = false
      AND p.source_research_enabled = false
      AND p.contact_research_enabled = false
      AND p.outreach_drafting_enabled = false
      AND p.copy_export_enabled = false
      AND p.autonomous_send_enabled = false
      AND p.require_source_plan_approval = true
      AND p.require_knowledge_review = true
      AND p.require_icp_review = true
      AND p.require_lead_play_review = true
      AND p.require_contact_review = true
      AND p.require_outreach_review = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_POLICY_BASELINE_DRIFT';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.novatrade_assert_compatibility_baseline_policy(uuid, uuid, integer, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.novatrade_assert_compatibility_auth_references(manifest jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  reference_entry record;
  unknown_count integer;
BEGIN
  IF jsonb_typeof(manifest->'legacyUsers') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_MANIFEST_USERS_REQUIRED_FOR_AUTH_REFERENCE_CHECK';
  END IF;
  FOR reference_entry IN
    SELECT refs.table_name, refs.column_name
    FROM (VALUES
      ('app_users', 'created_by'),
      ('app_users', 'team_lead_user_id'),
      ('user_market_access', 'user_id'),
      ('user_market_access', 'created_by_user_id'),
      ('leads', 'archived_by_user_id'),
      ('leads', 'quality_checked_by_user_id'),
      ('leads', 'assigned_to_user_id'),
      ('ai_usage_events', 'actor_user_id'),
      ('crawl_runs', 'created_by_user_id'),
      ('lead_notes', 'author_user_id'),
      ('outreach_events', 'actor_user_id'),
      ('admin_requests', 'created_by_user_id'),
      ('admin_requests', 'assigned_admin_user_id'),
      ('demos', 'published_by_user_id'),
      ('demos', 'unpublished_by_user_id'),
      ('demos', 'revoked_by_user_id'),
      ('ai_lead_verifications', 'requested_by_user_id'),
      ('lead_ai_artifacts', 'requested_by_user_id'),
      ('ai_feedback_events', 'actor_user_id')
    ) AS refs(table_name, column_name)
    ORDER BY refs.table_name, refs.column_name
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute
      WHERE attrelid = format('public.%I', reference_entry.table_name)::regclass
        AND attname = reference_entry.column_name
        AND NOT attisdropped
    ) THEN
      EXECUTE format(
        'SELECT count(*) FROM public.%I source WHERE source.%I IS NOT NULL AND (SELECT count(*) FROM jsonb_array_elements($1->''legacyUsers'') mapped WHERE mapped->>''authIdentityId'' = source.%I::text) <> 1',
        reference_entry.table_name,
        reference_entry.column_name,
        reference_entry.column_name
      ) INTO unknown_count USING manifest;
      IF unknown_count <> 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = format('T028_UNMAPPED_AUTH_REFERENCE:%s.%s', reference_entry.table_name, reference_entry.column_name);
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.novatrade_assert_compatibility_auth_references(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.novatrade_verify_compatibility_backfill_receipt(
  manifest jsonb,
  stored jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  manifest_hash_value text;
  tenant_id_value uuid;
  workspace_id_value uuid;
  owner_auth_identity_id_value uuid;
  policy_id_value uuid;
  policy_version_value integer;
  policy_hash_value text;
  user_entry jsonb;
  table_entry jsonb;
  table_name text;
  actual_user jsonb;
  actual_count integer;
  expected_count integer;
  actual_checksum text;
  expected_checksum text;
  actual_table_counts jsonb := '{}'::jsonb;
  actual_checksums jsonb := '{}'::jsonb;
  orphan_count integer := 0;
  workspace_tables constant text[] := ARRAY[
    'user_market_access', 'crawl_runs', 'crawl_units', 'lead_notes',
    'outreach_events', 'admin_requests', 'demos', 'ai_lead_verifications',
    'lead_ai_artifacts', 'ai_feedback_events'
  ];
BEGIN
  manifest_hash_value := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(manifest::text, 'UTF8')), 'hex');
  IF stored IS NULL OR jsonb_typeof(stored) <> 'object'
     OR stored->>'status' IS DISTINCT FROM 'completed'
     OR stored->>'schemaVersion' IS DISTINCT FROM '1'
     OR manifest->>'sourceEngine' IS DISTINCT FROM 'postgres'
     OR manifest->>'checksumAlgorithm' IS DISTINCT FROM 'novatrade-postgres-jsonb-text-v1'
     OR stored->>'sourceEngine' IS DISTINCT FROM manifest->>'sourceEngine'
     OR stored->>'checksumAlgorithm' IS DISTINCT FROM manifest->>'checksumAlgorithm'
     OR stored->>'manifestHash' IS DISTINCT FROM manifest_hash_value
     OR stored->>'idempotencyKey' IS DISTINCT FROM manifest->>'idempotencyKey'
     OR stored->>'sourceSnapshotFingerprint' IS DISTINCT FROM manifest->>'sourceSnapshotFingerprint'
     OR stored->>'policyId' IS DISTINCT FROM manifest->>'policyId'
     OR stored->>'policyVersion' IS DISTINCT FROM manifest->>'policyVersion'
     OR stored->>'policyHash' IS DISTINCT FROM manifest->>'policyHash'
     OR stored->>'rollback' IS DISTINCT FROM 'snapshot_restore_only'
     OR stored->>'relationshipOrphanCount' IS DISTINCT FROM '0'
     OR NULLIF(stored->>'receiptId', '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_RECEIPT_STRUCTURAL_DRIFT';
  END IF;
  BEGIN
    tenant_id_value := (manifest->>'tenantId')::uuid;
    workspace_id_value := (manifest->>'workspaceId')::uuid;
    owner_auth_identity_id_value := (manifest->>'ownerAuthIdentityId')::uuid;
    policy_id_value := (manifest->>'policyId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_REPLAY_TARGET_ID_INVALID';
  END;
  policy_version_value := (manifest->>'policyVersion')::integer;
  policy_hash_value := manifest->>'policyHash';
  IF stored->>'tenantId' IS DISTINCT FROM tenant_id_value::text
     OR stored->>'workspaceId' IS DISTINCT FROM workspace_id_value::text
     OR stored->>'ownerAuthIdentityId' IS DISTINCT FROM owner_auth_identity_id_value::text THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_RECEIPT_TARGET_DRIFT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id_value AND slug = manifest->>'tenantSlug' AND name = manifest->>'tenantName' AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id_value AND tenant_id = tenant_id_value AND slug = manifest->>'workspaceSlug' AND name = manifest->>'workspaceName' AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.tenant_policies WHERE id = policy_id_value AND tenant_id = tenant_id_value AND version = policy_version_value AND compatibility_policy_hash = policy_hash_value) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_FOUNDATION_DRIFT';
  END IF;
  PERFORM public.novatrade_assert_compatibility_baseline_policy(tenant_id_value, policy_id_value, policy_version_value, policy_hash_value);
  IF jsonb_typeof(stored->'tableCounts') <> 'object'
     OR jsonb_typeof(stored->'beforeContentChecksums') <> 'object'
     OR jsonb_typeof(stored->'afterContentChecksums') <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_RECEIPT_CHECKSUM_STRUCTURE_DRIFT';
  END IF;

  IF (stored->>'userCount')::integer IS DISTINCT FROM jsonb_array_length(manifest->'legacyUsers') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_USER_COUNT_DRIFT';
  END IF;
  FOR user_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyUsers') LOOP
    SELECT to_jsonb(u) INTO actual_user FROM public.app_users u WHERE u.id = user_entry->>'legacyUserId';
    IF actual_user IS NULL
       OR actual_user->>'user_id' IS DISTINCT FROM user_entry->>'authIdentityId'
       OR actual_user->>'email' IS DISTINCT FROM user_entry->>'expectedEmail'
       OR actual_user->>'role' IS DISTINCT FROM user_entry->>'expectedLegacyRole'
       OR actual_user->>'status' IS DISTINCT FROM user_entry->>'expectedStatus' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_USER_MAPPING_DRIFT';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.id = (user_entry->>'membershipId')::uuid
        AND m.tenant_id = tenant_id_value
        AND m.auth_identity_id = (user_entry->>'authIdentityId')::uuid
        AND m.workspace_id IS NOT DISTINCT FROM NULLIF(user_entry->>'workspaceId', '')::uuid
        AND m.status = user_entry->>'membershipStatus'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.tenant_role_bindings b
      WHERE b.id = (user_entry->>'roleBindingId')::uuid
        AND b.tenant_id = tenant_id_value
        AND b.membership_id = (user_entry->>'membershipId')::uuid
        AND b.role = user_entry->>'membershipRole'
        AND ((user_entry->>'membershipStatus') = 'active' AND b.revoked_at IS NULL
             OR (user_entry->>'membershipStatus') <> 'active' AND b.revoked_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_IDENTITY_ROLE_DRIFT';
    END IF;
  END LOOP;
  PERFORM public.novatrade_assert_compatibility_auth_references(manifest);

  FOR table_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyTables') LOOP
    table_name := table_entry->>'table';
    expected_count := (table_entry->>'rowCount')::integer;
    expected_checksum := table_entry->>'contentChecksum';
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO actual_count;
    IF actual_count <> expected_count THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_REPLAY_ROW_COUNT_DRIFT:%s', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'workspace_id' AND NOT attisdropped) THEN
      EXECUTE format('SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t', table_name) INTO actual_checksum;
    ELSE
      EXECUTE format('SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t', table_name) INTO actual_checksum;
    END IF;
    IF actual_checksum IS DISTINCT FROM expected_checksum
       OR stored->'beforeContentChecksums'->>table_name IS DISTINCT FROM expected_checksum
       OR stored->'afterContentChecksums'->>table_name IS DISTINCT FROM expected_checksum THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_REPLAY_CHECKSUM_DRIFT:%s', table_name);
    END IF;
    actual_table_counts := actual_table_counts || jsonb_build_object(table_name, actual_count);
    actual_checksums := actual_checksums || jsonb_build_object(table_name, actual_checksum);
    IF table_name = 'audit_logs' THEN
      EXECUTE 'SELECT count(*) FROM public.audit_logs WHERE scope_kind IS DISTINCT FROM ''legacy_unscoped'' OR tenant_id IS NOT NULL OR workspace_id IS NOT NULL' INTO actual_count;
    ELSIF table_name = ANY(workspace_tables) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS DISTINCT FROM $1 OR workspace_id IS DISTINCT FROM $2', table_name) INTO actual_count USING tenant_id_value, workspace_id_value;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS DISTINCT FROM $1', table_name) INTO actual_count USING tenant_id_value;
    END IF;
    IF actual_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_REPLAY_SCOPE_DRIFT:%s', table_name);
    END IF;
  END LOOP;
  IF stored->'tableCounts' IS DISTINCT FROM actual_table_counts
     OR stored->'afterContentChecksums' IS DISTINCT FROM actual_checksums THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_RECEIPT_CONTENT_DRIFT';
  END IF;

  SELECT count(*) INTO orphan_count FROM public.crawl_units u LEFT JOIN public.crawl_runs r ON r.id = u.crawl_run_id WHERE r.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.outreach_events e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.admin_requests e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.demos e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.lead_notes e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.ai_lead_verifications e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.lead_ai_artifacts e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  IF orphan_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_REPLAY_RELATIONSHIP_DRIFT';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.novatrade_verify_compatibility_backfill_receipt(jsonb, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.novatrade_run_compatibility_backfill(manifest jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  expected_schema_version integer;
  source_engine_value text;
  checksum_algorithm_value text;
  idempotency_key_value text;
  manifest_hash_value text;
  snapshot_fingerprint text;
  tenant_id_value uuid;
  workspace_id_value uuid;
  owner_auth_identity_id_value uuid;
  policy_id_value uuid;
  policy_version_value integer;
  policy_hash_value text;
  owner_legacy_user_id text;
  tenant_slug_value text;
  tenant_name_value text;
  workspace_slug_value text;
  workspace_name_value text;
  user_entry jsonb;
  table_entry jsonb;
  table_name text;
  expected_count integer;
  actual_count integer;
  expected_checksum text;
  actual_checksum text;
  before_checksums jsonb := '{}'::jsonb;
  after_checksums jsonb := '{}'::jsonb;
  table_counts jsonb := '{}'::jsonb;
  user_count integer;
  owner_count integer := 0;
  role_value text;
  expected_role text;
  expected_status text;
  membership_status_value text;
  actual_user jsonb;
  actual_market_ids jsonb;
  expected_market_ids jsonb;
  actual_market_count integer;
  expected_market_count integer;
  orphan_count integer := 0;
  existing_receipt jsonb;
  existing_source_engine text;
  existing_checksum_algorithm text;
  existing_policy_id uuid;
  existing_policy_version integer;
  existing_policy_hash text;
  receipt_id uuid;
  receipt_value jsonb;
  table_spec_count integer;
  user_spec_count integer;
  distinct_membership_count integer;
  distinct_role_binding_count integer;
  allowed_tables constant text[] := ARRAY[
    'settings', 'user_market_access', 'leads', 'place_cache', 'places_master',
    'place_observations', 'api_usage_events', 'ai_usage_events', 'audit_logs',
    'crawl_runs', 'crawl_units', 'lead_notes', 'outreach_events',
    'admin_requests', 'demos', 'ai_lead_verifications', 'lead_ai_artifacts',
    'ai_feedback_events'
  ];
  workspace_tables constant text[] := ARRAY[
    'user_market_access', 'crawl_runs', 'crawl_units', 'lead_notes',
    'outreach_events', 'admin_requests', 'demos', 'ai_lead_verifications',
    'lead_ai_artifacts', 'ai_feedback_events'
  ];
  preserved_tables constant text[] := ARRAY['audit_logs'];
BEGIN
  IF manifest IS NULL OR jsonb_typeof(manifest) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_MANIFEST_OBJECT_REQUIRED';
  END IF;

  expected_schema_version := NULLIF(manifest->>'schemaVersion', '')::integer;
  IF expected_schema_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_SCHEMA_VERSION_UNSUPPORTED';
  END IF;

  source_engine_value := manifest->>'sourceEngine';
  checksum_algorithm_value := manifest->>'checksumAlgorithm';
  IF source_engine_value IS DISTINCT FROM 'postgres'
     OR checksum_algorithm_value IS DISTINCT FROM 'novatrade-postgres-jsonb-text-v1' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_SOURCE_ENGINE_CONTRACT_MISMATCH';
  END IF;

  idempotency_key_value := NULLIF(pg_catalog.btrim(manifest->>'idempotencyKey'), '');
  snapshot_fingerprint := NULLIF(pg_catalog.btrim(manifest->>'sourceSnapshotFingerprint'), '');
  IF idempotency_key_value IS NULL OR idempotency_key_value !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_IDEMPOTENCY_KEY_INVALID';
  END IF;
  IF snapshot_fingerprint IS NULL OR snapshot_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_SOURCE_FINGERPRINT_INVALID';
  END IF;
  manifest_hash_value := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(manifest::text, 'UTF8')), 'hex');

  -- Serialize the bounded activation namespace and prevent ordinary legacy
  -- writers from interleaving a count/checksum/update transaction. Every
  -- caller uses the same key and deterministic table-lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('novatrade:t028:' || idempotency_key_value, 0)
  );
  FOR table_name IN
    SELECT value FROM pg_catalog.unnest(allowed_tables) AS value ORDER BY value
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', table_name);
  END LOOP;
  FOR table_name IN
    SELECT value FROM pg_catalog.unnest(ARRAY['app_users','tenant_memberships','tenant_policies','tenant_role_bindings','tenants','workspaces']::text[]) AS value ORDER BY value
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', table_name);
  END LOOP;

  SELECT r.receipt, r.source_engine, r.checksum_algorithm, r.policy_id, r.policy_version, r.policy_hash
  INTO existing_receipt, existing_source_engine, existing_checksum_algorithm, existing_policy_id, existing_policy_version, existing_policy_hash
  FROM public.compatibility_backfill_receipts AS r
  WHERE r.idempotency_key = idempotency_key_value;
  IF existing_receipt IS NOT NULL THEN
    IF (existing_receipt->>'manifestHash') IS DISTINCT FROM manifest_hash_value THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_IDEMPOTENCY_CONTENT_CONFLICT';
    END IF;
    IF existing_source_engine IS DISTINCT FROM source_engine_value
       OR existing_checksum_algorithm IS DISTINCT FROM checksum_algorithm_value
       OR existing_policy_id IS DISTINCT FROM (manifest->>'policyId')::uuid
       OR existing_policy_version IS DISTINCT FROM (manifest->>'policyVersion')::integer
       OR existing_policy_hash IS DISTINCT FROM manifest->>'policyHash' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_RECEIPT_POLICY_DRIFT';
    END IF;
    PERFORM public.novatrade_verify_compatibility_backfill_receipt(manifest, existing_receipt);
    RETURN existing_receipt;
  END IF;

  BEGIN
    tenant_id_value := (manifest->>'tenantId')::uuid;
    workspace_id_value := (manifest->>'workspaceId')::uuid;
    owner_auth_identity_id_value := (manifest->>'ownerAuthIdentityId')::uuid;
    policy_id_value := (manifest->>'policyId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_APPROVED_UUID_INVALID';
  END;
  policy_version_value := NULLIF(manifest->>'policyVersion', '')::integer;
  policy_hash_value := NULLIF(pg_catalog.btrim(manifest->>'policyHash'), '');
  owner_legacy_user_id := NULLIF(pg_catalog.btrim(manifest->>'ownerLegacyUserId'), '');
  tenant_slug_value := NULLIF(pg_catalog.btrim(manifest->>'tenantSlug'), '');
  tenant_name_value := NULLIF(pg_catalog.btrim(manifest->>'tenantName'), '');
  workspace_slug_value := NULLIF(pg_catalog.btrim(manifest->>'workspaceSlug'), '');
  workspace_name_value := NULLIF(pg_catalog.btrim(manifest->>'workspaceName'), '');
  IF tenant_id_value IS NULL OR workspace_id_value IS NULL OR owner_auth_identity_id_value IS NULL
     OR owner_legacy_user_id IS NULL OR tenant_slug_value IS NULL OR tenant_name_value IS NULL
     OR workspace_slug_value IS NULL OR workspace_name_value IS NULL OR policy_id_value IS NULL
     OR policy_version_value IS NULL OR policy_version_value < 1 OR policy_hash_value IS NULL
     OR policy_hash_value !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_APPROVED_IDENTITY_AND_TARGET_REQUIRED';
  END IF;

  IF jsonb_typeof(manifest->'legacyUsers') <> 'array'
     OR jsonb_typeof(manifest->'legacyTables') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_MANIFEST_SECTIONS_REQUIRED';
  END IF;
  user_spec_count := jsonb_array_length(manifest->'legacyUsers');
  table_spec_count := jsonb_array_length(manifest->'legacyTables');
  SELECT count(*) INTO user_count FROM public.app_users;
  IF user_count <> user_spec_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_USER_COUNT_MISMATCH';
  END IF;

  SELECT count(DISTINCT u->>'membershipId'), count(DISTINCT u->>'roleBindingId')
  INTO distinct_membership_count, distinct_role_binding_count
  FROM jsonb_array_elements(manifest->'legacyUsers') AS u;
  IF distinct_membership_count <> user_spec_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DUPLICATE_MEMBERSHIP_ID';
  END IF;
  IF distinct_role_binding_count <> user_spec_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DUPLICATE_ROLE_BINDING_ID';
  END IF;
  FOR user_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyUsers') LOOP
    BEGIN
      PERFORM (user_entry->>'membershipId')::uuid;
      PERFORM (user_entry->>'roleBindingId')::uuid;
      PERFORM (user_entry->>'authIdentityId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_USER_TARGET_ID_INVALID';
    END;
    membership_status_value := user_entry->>'membershipStatus';
    expected_status := user_entry->>'expectedStatus';
    IF expected_status = 'active' AND membership_status_value NOT IN ('active', 'pending') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_ACTIVE_USER_MEMBERSHIP_STATUS_INVALID';
    END IF;
    IF expected_status = 'disabled' AND membership_status_value NOT IN ('suspended', 'revoked') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DISABLED_USER_MEMBERSHIP_MUST_NOT_AUTHORIZE';
    END IF;
    IF user_entry->>'membershipRole' = 'owner' AND (expected_status <> 'active' OR membership_status_value <> 'active') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_OWNER_MUST_BE_ACTIVE';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id_value)
     OR EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id_value)
     OR EXISTS (SELECT 1 FROM public.tenant_memberships m
                WHERE m.id IN (SELECT (u->>'membershipId')::uuid FROM jsonb_array_elements(manifest->'legacyUsers') u))
     OR EXISTS (SELECT 1 FROM public.tenant_role_bindings b
                WHERE b.id IN (SELECT (u->>'roleBindingId')::uuid FROM jsonb_array_elements(manifest->'legacyUsers') u)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_PREEXISTING_TARGET_CONFLICT';
  END IF;

  IF table_spec_count <> cardinality(allowed_tables) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_TABLE_MANIFEST_SET_MISMATCH';
  END IF;

  FOR table_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyTables') LOOP
    table_name := table_entry->>'table';
    IF table_name IS NULL OR NOT (table_name = ANY(allowed_tables)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_UNKNOWN_LEGACY_TABLE';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(manifest->'legacyTables') e WHERE e->>'table' = table_name) <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DUPLICATE_LEGACY_TABLE';
    END IF;
    expected_count := (table_entry->>'rowCount')::integer;
    expected_checksum := table_entry->>'contentChecksum';
    IF expected_count IS NULL OR expected_count < 0 OR expected_checksum !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_TABLE_EXPECTATION_INVALID';
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO actual_count;
    IF actual_count <> expected_count THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_ROW_COUNT_MISMATCH:%s', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'workspace_id' AND NOT attisdropped) THEN
      EXECUTE format(
        'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t',
        table_name
      ) INTO actual_checksum;
    ELSE
      EXECUTE format(
        'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t',
        table_name
      ) INTO actual_checksum;
    END IF;
    IF actual_checksum IS DISTINCT FROM expected_checksum THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_CHECKSUM_MISMATCH:%s', table_name);
    END IF;
    before_checksums := before_checksums || jsonb_build_object(table_name, actual_checksum);
    table_counts := table_counts || jsonb_build_object(table_name, actual_count);
    IF table_name = ANY(preserved_tables) THEN
      EXECUTE 'SELECT count(*) FROM public.audit_logs WHERE scope_kind IS DISTINCT FROM ''legacy_unscoped'' OR tenant_id IS NOT NULL OR workspace_id IS NOT NULL' INTO actual_count;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_AUDIT_HISTORY_SCOPE_DRIFT';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'workspace_id' AND NOT attisdropped) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NOT NULL OR workspace_id IS NOT NULL', table_name) INTO actual_count;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_PREEXISTING_SCOPE_CONFLICT:%s', table_name);
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'tenant_id' AND NOT attisdropped) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NOT NULL', table_name) INTO actual_count;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_PREEXISTING_SCOPE_CONFLICT:%s', table_name);
      END IF;
    END IF;
  END LOOP;

  FOR user_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyUsers') LOOP
    IF jsonb_typeof(user_entry) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_USER_MAPPING_OBJECT_REQUIRED';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(manifest->'legacyUsers') u WHERE u->>'legacyUserId' = user_entry->>'legacyUserId') <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DUPLICATE_LEGACY_USER_ID';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(manifest->'legacyUsers') u WHERE u->>'authIdentityId' = user_entry->>'authIdentityId') <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_DUPLICATE_IDENTITY_MAPPING';
    END IF;
    SELECT to_jsonb(u) INTO actual_user FROM public.app_users u WHERE u.id = user_entry->>'legacyUserId';
    IF actual_user IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_UNKNOWN_LEGACY_USER_ID';
    END IF;
    IF actual_user->>'user_id' IS DISTINCT FROM user_entry->>'authIdentityId'
       OR actual_user->>'email' IS DISTINCT FROM user_entry->>'expectedEmail'
       OR actual_user->>'role' IS DISTINCT FROM user_entry->>'expectedLegacyRole'
       OR actual_user->>'status' IS DISTINCT FROM user_entry->>'expectedStatus' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_USER_MAPPING_DRIFT';
    END IF;
    role_value := user_entry->>'membershipRole';
    IF role_value NOT IN ('owner','admin','strategist_manager','researcher','reviewer','outreach_operator','analyst_read_only') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_MEMBERSHIP_ROLE_INVALID';
    END IF;
    expected_role := user_entry->>'expectedLegacyRole';
    expected_status := user_entry->>'expectedStatus';
    IF expected_status NOT IN ('active', 'disabled') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_LEGACY_USER_STATUS_INVALID';
    END IF;
    membership_status_value := user_entry->>'membershipStatus';
    expected_market_ids := COALESCE(user_entry->'marketAccessIds', '[]'::jsonb);
    IF jsonb_typeof(expected_market_ids) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'T028_MARKET_MAPPING_INVALID';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(x.market_id) ORDER BY x.market_id), '[]'::jsonb), count(*)
    INTO actual_market_ids, actual_market_count
    FROM public.user_market_access x
    WHERE x.user_id = user_entry->>'authIdentityId';
    SELECT count(*) INTO expected_market_count FROM jsonb_array_elements_text(expected_market_ids);
    IF actual_market_count <> expected_market_count OR actual_market_ids IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY value), '[]'::jsonb)
      FROM jsonb_array_elements_text(expected_market_ids)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_MARKET_MAPPING_DRIFT';
    END IF;
    IF role_value = 'owner' THEN
      owner_count := owner_count + 1;
      IF user_entry->>'legacyUserId' IS DISTINCT FROM owner_legacy_user_id
         OR (user_entry->>'authIdentityId')::uuid IS DISTINCT FROM owner_auth_identity_id_value THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_OWNER_MAPPING_MISMATCH';
      END IF;
    END IF;
  END LOOP;
  IF owner_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_EXACTLY_ONE_OWNER_REQUIRED';
  END IF;
  PERFORM public.novatrade_assert_compatibility_auth_references(manifest);

  -- Relationship reconciliation runs before any scope update. Existing FKs
  -- catch most cases; these explicit checks also cover legacy references that
  -- intentionally predate a database FK.
  SELECT count(*) INTO orphan_count FROM public.crawl_units u LEFT JOIN public.crawl_runs r ON r.id = u.crawl_run_id WHERE r.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.outreach_events e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.admin_requests e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.demos e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.lead_notes e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.ai_lead_verifications e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  SELECT orphan_count + count(*) INTO orphan_count FROM public.lead_ai_artifacts e LEFT JOIN public.leads l ON l.id = e.lead_id WHERE l.id IS NULL;
  IF orphan_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_RELATIONSHIP_ORPHANING';
  END IF;

  INSERT INTO public.tenants (id, slug, name, status)
  VALUES (tenant_id_value, tenant_slug_value, tenant_name_value, 'active');
  INSERT INTO public.workspaces (id, tenant_id, slug, name, status)
  VALUES (workspace_id_value, tenant_id_value, workspace_slug_value, workspace_name_value, 'active');
  INSERT INTO public.tenant_policies (id, tenant_id, version, compatibility_policy_hash)
  VALUES (policy_id_value, tenant_id_value, policy_version_value, policy_hash_value);
  PERFORM public.novatrade_assert_compatibility_baseline_policy(tenant_id_value, policy_id_value, policy_version_value, policy_hash_value);

  FOR user_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyUsers') LOOP
    INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status)
    VALUES ((user_entry->>'membershipId')::uuid, tenant_id_value, (user_entry->>'authIdentityId')::uuid,
            NULLIF(user_entry->>'workspaceId', '')::uuid, user_entry->>'membershipStatus');
    INSERT INTO public.tenant_role_bindings (id, tenant_id, membership_id, role, reason_code)
    VALUES ((user_entry->>'roleBindingId')::uuid, tenant_id_value, (user_entry->>'membershipId')::uuid,
            user_entry->>'membershipRole', 'initial_provisioning');
    IF user_entry->>'membershipStatus' IN ('suspended', 'revoked', 'pending') THEN
      UPDATE public.tenant_role_bindings
      SET revoked_at = pg_catalog.now()
      WHERE id = (user_entry->>'roleBindingId')::uuid;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY allowed_tables LOOP
    IF table_name = ANY(preserved_tables) THEN
      CONTINUE;
    END IF;
    -- T-015 deliberately preserves historical audit rows as legacy_unscoped
    -- (or explicit platform rows). Assigning tenant_id here would violate that
    -- append-only audit contract and would rewrite historical meaning.
    IF table_name = 'audit_logs' THEN
      CONTINUE;
    END IF;
    IF table_name = ANY(workspace_tables) THEN
      EXECUTE format('UPDATE public.%I SET tenant_id = $1, workspace_id = $2 WHERE tenant_id IS NULL AND workspace_id IS NULL', table_name)
        USING tenant_id_value, workspace_id_value;
    ELSE
      EXECUTE format('UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL', table_name)
        USING tenant_id_value;
    END IF;
  END LOOP;

  FOR table_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyTables') LOOP
    table_name := table_entry->>'table';
    expected_count := (table_entry->>'rowCount')::integer;
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO actual_count;
    IF actual_count <> expected_count THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_AFTER_ROW_COUNT_MISMATCH:%s', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'workspace_id' AND NOT attisdropped) THEN
      EXECUTE format(
        'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'' - ''workspace_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t', table_name
      ) INTO actual_checksum;
    ELSE
      EXECUTE format(
        'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t) - ''tenant_id'')::text, ''|'' ORDER BY (to_jsonb(t) - ''tenant_id'')::text), ''''), ''UTF8'')), ''hex'') FROM public.%I t', table_name
      ) INTO actual_checksum;
    END IF;
    IF actual_checksum IS DISTINCT FROM before_checksums->>table_name THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_AFTER_CHECKSUM_MISMATCH:%s', table_name);
    END IF;
    IF table_name = ANY(preserved_tables) THEN
      EXECUTE 'SELECT count(*) FROM public.audit_logs WHERE scope_kind IS DISTINCT FROM ''legacy_unscoped'' OR tenant_id IS NOT NULL OR workspace_id IS NOT NULL' INTO actual_count;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_AUDIT_HISTORY_SCOPE_DRIFT_AFTER';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass AND attname = 'workspace_id' AND NOT attisdropped) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS DISTINCT FROM $1 OR workspace_id IS DISTINCT FROM $2', table_name)
        INTO actual_count USING tenant_id_value, workspace_id_value;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_AFTER_SCOPE_MISMATCH:%s', table_name);
      END IF;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS DISTINCT FROM $1', table_name)
        INTO actual_count USING tenant_id_value;
      IF actual_count <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('T028_AFTER_SCOPE_MISMATCH:%s', table_name);
      END IF;
    END IF;
    after_checksums := after_checksums || jsonb_build_object(table_name, actual_checksum);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id_value AND slug = tenant_slug_value AND name = tenant_name_value AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id_value AND tenant_id = tenant_id_value AND slug = workspace_slug_value AND name = workspace_name_value AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.tenant_policies WHERE id = policy_id_value AND tenant_id = tenant_id_value AND version = policy_version_value AND compatibility_policy_hash = policy_hash_value) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_FOUNDATION_POSTCONDITION_MISMATCH';
  END IF;
  PERFORM public.novatrade_assert_compatibility_baseline_policy(tenant_id_value, policy_id_value, policy_version_value, policy_hash_value);
  FOR user_entry IN SELECT value FROM jsonb_array_elements(manifest->'legacyUsers') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.id = (user_entry->>'membershipId')::uuid
        AND m.tenant_id = tenant_id_value
        AND m.auth_identity_id = (user_entry->>'authIdentityId')::uuid
        AND m.workspace_id IS NOT DISTINCT FROM NULLIF(user_entry->>'workspaceId', '')::uuid
        AND m.status = user_entry->>'membershipStatus'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.tenant_role_bindings b
      WHERE b.id = (user_entry->>'roleBindingId')::uuid
        AND b.tenant_id = tenant_id_value
        AND b.membership_id = (user_entry->>'membershipId')::uuid
        AND b.role = user_entry->>'membershipRole'
        AND ((user_entry->>'membershipStatus') = 'active' AND b.revoked_at IS NULL
             OR (user_entry->>'membershipStatus') <> 'active' AND b.revoked_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'T028_IDENTITY_ROLE_POSTCONDITION_MISMATCH';
    END IF;
  END LOOP;

  receipt_id := pg_catalog.gen_random_uuid();
  receipt_value := jsonb_build_object(
    'receiptId', receipt_id,
    'status', 'completed',
    'schemaVersion', expected_schema_version,
    'sourceEngine', source_engine_value,
    'checksumAlgorithm', checksum_algorithm_value,
    'idempotencyKey', idempotency_key_value,
    'manifestHash', manifest_hash_value,
    'sourceSnapshotFingerprint', snapshot_fingerprint,
    'tenantId', tenant_id_value,
    'workspaceId', workspace_id_value,
    'ownerAuthIdentityId', owner_auth_identity_id_value,
    'policyId', policy_id_value,
    'policyVersion', policy_version_value,
    'policyHash', policy_hash_value,
    'userCount', user_count,
    'tableCounts', table_counts,
    'beforeContentChecksums', before_checksums,
    'afterContentChecksums', after_checksums,
    'relationshipOrphanCount', orphan_count,
    'rollback', 'snapshot_restore_only',
    'activation', 'real activation requires approved compatibility identity and authorized rehearsal snapshot'
  );
  INSERT INTO public.compatibility_backfill_receipts (
    id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
    tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash, user_count, table_counts,
    before_content_checksums, after_content_checksums, relationship_orphan_count,
    status, receipt
  ) VALUES (
    receipt_id, idempotency_key_value, expected_schema_version, source_engine_value, checksum_algorithm_value, manifest_hash_value,
    snapshot_fingerprint, tenant_id_value, workspace_id_value, owner_auth_identity_id_value,
    policy_id_value, policy_version_value, policy_hash_value,
    user_count, table_counts, before_checksums, after_checksums, orphan_count,
    'completed', receipt_value
  );
  RETURN receipt_value;
END;
$$;

REVOKE ALL ON FUNCTION public.novatrade_run_compatibility_backfill(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_run_compatibility_backfill(jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_run_compatibility_backfill(jsonb) FROM authenticated';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.novatrade_run_compatibility_backfill(jsonb) IS
  'T-028 fail-closed, manifest-driven compatibility backfill. It never infers an owner, never runs automatically, and reruns only by receipt hash.';
