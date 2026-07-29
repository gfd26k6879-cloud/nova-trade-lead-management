-- G-004A: structural tenant scope for AI records.  This migration deliberately
-- does not use worker_runs: it is platform-global and result_json can still
-- contain tenant content.  Runtime correlation/redaction is G-004B work.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:g004a:ai-tenant-scope-worker-envelope'));

LOCK TABLE public.compatibility_backfill_receipts, public.tenant_memberships,
  public.leads, public.ai_lead_verifications, public.lead_ai_artifacts,
  public.ai_feedback_events, public.ai_usage_events IN SHARE ROW EXCLUSIVE MODE;
-- G004A_WRITER_LOCKS_ACQUIRED

DO $g004a_preflight$
DECLARE receipt_count integer; receipt_tenant uuid; table_name text;
  row_count bigint; row_checksum text; counts jsonb := '{}'::jsonb; checksums jsonb := '{}'::jsonb;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_lead_verifications','lead_ai_artifacts','ai_feedback_events','ai_usage_events'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I',table_name)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=pg_catalog.format('G004A_REQUIRED_TABLE_MISSING:%s',table_name);
    END IF;
  END LOOP;
  -- Lead-linked records can only inherit from G-003's authoritative parent.
  IF EXISTS (SELECT 1 FROM public.ai_lead_verifications v LEFT JOIN public.leads l ON l.id=v.lead_id WHERE l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lead_ai_artifacts a LEFT JOIN public.leads l ON l.id=a.lead_id WHERE l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_feedback_events f LEFT JOIN public.leads l ON l.id=f.lead_id WHERE l.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_LEAD_PARENT_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ai_usage_events u
    LEFT JOIN public.leads l ON l.id=u.lead_id
    LEFT JOIN public.ai_lead_verifications v ON v.id=u.verification_id
    WHERE (u.lead_id IS NOT NULL AND l.id IS NULL) OR (u.verification_id IS NOT NULL AND v.id IS NULL)
       OR (u.lead_id IS NOT NULL AND u.verification_id IS NOT NULL AND u.lead_id IS DISTINCT FROM v.lead_id)
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_USAGE_REFERENCE_SCOPE_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ai_feedback_events f
    LEFT JOIN public.ai_lead_verifications v ON v.id=f.verification_id
    LEFT JOIN public.lead_ai_artifacts a ON a.id=f.artifact_id
    WHERE (f.verification_id IS NOT NULL AND v.lead_id IS DISTINCT FROM f.lead_id)
       OR (f.artifact_id IS NOT NULL AND a.lead_id IS DISTINCT FROM f.lead_id)
  ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_FEEDBACK_REFERENCE_SCOPE_INVALID'; END IF;

  IF ((SELECT count(*) FROM public.ai_lead_verifications)+(SELECT count(*) FROM public.lead_ai_artifacts)+
      (SELECT count(*) FROM public.ai_feedback_events)+(SELECT count(*) FROM public.ai_usage_events)) > 0 THEN
    FOREACH table_name IN ARRAY ARRAY['ai_lead_verifications','lead_ai_artifacts','ai_feedback_events','ai_usage_events'] LOOP
      EXECUTE pg_catalog.format(
        'SELECT count(*), pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-''tenant_id''-''workspace_id'')::text,''|'' ORDER BY (to_jsonb(t)-''tenant_id''-''workspace_id'')::text),''''),''UTF8'')),''hex'') FROM public.%I t',table_name)
        INTO row_count,row_checksum;
      counts := counts || pg_catalog.jsonb_build_object(table_name,row_count);
      checksums := checksums || pg_catalog.jsonb_build_object(table_name,row_checksum);
    END LOOP;
    SELECT count(*)::integer, min(r.tenant_id) INTO receipt_count,receipt_tenant
      FROM public.compatibility_backfill_receipts r WHERE r.status='completed' AND r.source_engine='postgres'
       AND r.schema_version=1 AND r.checksum_algorithm='novatrade-postgres-jsonb-text-v1'
       AND r.relationship_orphan_count=0
       AND r.table_counts->'ai_lead_verifications'=counts->'ai_lead_verifications'
       AND r.table_counts->'lead_ai_artifacts'=counts->'lead_ai_artifacts'
       AND r.table_counts->'ai_feedback_events'=counts->'ai_feedback_events'
       AND r.table_counts->'ai_usage_events'=counts->'ai_usage_events'
       AND r.after_content_checksums->'ai_lead_verifications'=checksums->'ai_lead_verifications'
       AND r.after_content_checksums->'lead_ai_artifacts'=checksums->'lead_ai_artifacts'
       AND r.after_content_checksums->'ai_feedback_events'=checksums->'ai_feedback_events'
       AND r.after_content_checksums->'ai_usage_events'=checksums->'ai_usage_events';
    IF receipt_count=0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    IF receipt_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    -- The receipt is the only authority for a legacy usage row with no lead or verification.
    UPDATE public.ai_usage_events SET tenant_id=receipt_tenant WHERE lead_id IS NULL AND verification_id IS NULL AND tenant_id IS NULL;
  END IF;
END;
$g004a_preflight$;

ALTER TABLE public.ai_lead_verifications ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.ai_lead_verifications ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.lead_ai_artifacts ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.lead_ai_artifacts ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.ai_feedback_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.ai_feedback_events ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.ai_lead_verifications v SET tenant_id=l.tenant_id FROM public.leads l WHERE l.id=v.lead_id AND v.tenant_id IS NULL;
UPDATE public.lead_ai_artifacts a SET tenant_id=l.tenant_id FROM public.leads l WHERE l.id=a.lead_id AND a.tenant_id IS NULL;
UPDATE public.ai_feedback_events f SET tenant_id=l.tenant_id FROM public.leads l WHERE l.id=f.lead_id AND f.tenant_id IS NULL;
UPDATE public.ai_usage_events u SET tenant_id=(SELECT l.tenant_id FROM public.leads l WHERE l.id=u.lead_id)
  WHERE u.lead_id IS NOT NULL AND u.tenant_id IS NULL;
UPDATE public.ai_usage_events u SET tenant_id=v.tenant_id FROM public.ai_lead_verifications v
  WHERE u.verification_id=v.id AND u.lead_id IS NULL AND u.tenant_id IS NULL;

DO $g004a_scope$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_lead_verifications WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lead_ai_artifacts WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_feedback_events WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_usage_events WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_UNRECONCILED_T028_SCOPE';
  END IF;
END;
$g004a_scope$;

DO $g004a_constraints$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname,conrelid::regclass::text tbl FROM pg_catalog.pg_constraint
    WHERE contype='f' AND ((conrelid IN ('public.ai_lead_verifications'::regclass,'public.lead_ai_artifacts'::regclass,'public.ai_feedback_events'::regclass,'public.ai_usage_events'::regclass))
      AND confrelid IN ('public.leads'::regclass,'public.ai_lead_verifications'::regclass,'public.lead_ai_artifacts'::regclass,'public.workspaces'::regclass))
  LOOP EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname); END LOOP;
  ALTER TABLE public.ai_lead_verifications DROP CONSTRAINT IF EXISTS ai_lead_verifications_tenant_id_id_unique;
  ALTER TABLE public.lead_ai_artifacts DROP CONSTRAINT IF EXISTS lead_ai_artifacts_tenant_id_id_unique;
  ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_id_id_unique UNIQUE(tenant_id,id);
  ALTER TABLE public.lead_ai_artifacts ADD CONSTRAINT lead_ai_artifacts_tenant_id_id_unique UNIQUE(tenant_id,id);
  ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE;
  ALTER TABLE public.lead_ai_artifacts ADD CONSTRAINT lead_ai_artifacts_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE;
  ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE;
  ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_verification_fkey FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL;
  ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_artifact_fkey FOREIGN KEY(tenant_id,artifact_id) REFERENCES public.lead_ai_artifacts(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL;
  ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL;
  ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_verification_fkey FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL;
END;
$g004a_constraints$;
ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_workspace_fkey FOREIGN KEY(tenant_id,workspace_id) REFERENCES public.workspaces(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.lead_ai_artifacts ADD CONSTRAINT lead_ai_artifacts_tenant_workspace_fkey FOREIGN KEY(tenant_id,workspace_id) REFERENCES public.workspaces(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_workspace_fkey FOREIGN KEY(tenant_id,workspace_id) REFERENCES public.workspaces(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.ai_lead_verifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lead_ai_artifacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ai_feedback_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ai_usage_events ALTER COLUMN tenant_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.novatrade_ai_scope_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
DECLARE parent_tenant uuid; verification_tenant uuid; actor uuid; scope_workspace uuid;
BEGIN
  IF TG_TABLE_NAME='ai_usage_events' THEN
    scope_workspace:=NULL; actor:=NEW.actor_user_id;
    IF NEW.lead_id IS NOT NULL THEN SELECT l.tenant_id INTO parent_tenant FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE; END IF;
    IF NEW.verification_id IS NOT NULL THEN SELECT v.tenant_id INTO verification_tenant FROM public.ai_lead_verifications v WHERE v.id=NEW.verification_id FOR KEY SHARE; END IF;
    IF parent_tenant IS NULL THEN parent_tenant:=verification_tenant; END IF;
    IF verification_tenant IS NOT NULL AND parent_tenant IS DISTINCT FROM verification_tenant THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_REFERENCE_SCOPE_INVALID'; END IF;
    IF TG_OP='INSERT' AND parent_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_RUNTIME_CORRELATION_REQUIRED'; END IF;
  ELSE
    scope_workspace:=NEW.workspace_id;
    IF TG_TABLE_NAME='ai_lead_verifications' THEN actor:=NEW.requested_by_user_id;
    ELSIF TG_TABLE_NAME='lead_ai_artifacts' THEN actor:=NEW.requested_by_user_id;
    ELSE actor:=NEW.actor_user_id; END IF;
    SELECT l.tenant_id INTO parent_tenant FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE;
  END IF;
  IF TG_OP='UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_SCOPE_IMMUTABLE'; END IF;
  IF TG_TABLE_NAME<>'ai_usage_events' AND TG_OP='UPDATE' AND (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_SCOPE_IMMUTABLE'; END IF;
  IF TG_TABLE_NAME='ai_usage_events' AND TG_OP='UPDATE' AND (NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.verification_id IS DISTINCT FROM OLD.verification_id) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_SCOPE_IMMUTABLE'; END IF;
  IF parent_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM parent_tenant THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_PARENT_TENANT_REQUIRED'; END IF;
  IF TG_TABLE_NAME='ai_feedback_events' AND EXISTS (SELECT 1 FROM public.ai_lead_verifications v WHERE v.id=NEW.verification_id AND v.lead_id IS DISTINCT FROM NEW.lead_id) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_FEEDBACK_REFERENCE_SCOPE_INVALID'; END IF;
  IF TG_TABLE_NAME='ai_feedback_events' AND EXISTS (SELECT 1 FROM public.lead_ai_artifacts a WHERE a.id=NEW.artifact_id AND a.lead_id IS DISTINCT FROM NEW.lead_id) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_FEEDBACK_REFERENCE_SCOPE_INVALID'; END IF;
  IF actor IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=NEW.tenant_id AND m.auth_identity_id=actor AND m.status='active' AND (scope_workspace IS NULL OR m.workspace_id IS NULL OR m.workspace_id=scope_workspace)) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_ACTIVE_SAME_TENANT_ACTOR_REQUIRED'; END IF;
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.novatrade_ai_scope_guard() FROM PUBLIC;
DO $g004a_triggers$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ai_lead_verifications','lead_ai_artifacts','ai_feedback_events','ai_usage_events'] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_novatrade_%I_scope ON public.%I',t,t);
    EXECUTE pg_catalog.format('CREATE TRIGGER trg_novatrade_%I_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()',t,t);
  END LOOP;
END $g004a_triggers$;

DROP INDEX IF EXISTS public.idx_ai_verifications_tenant_lead_created;
DROP INDEX IF EXISTS public.idx_ai_artifacts_tenant_queue;
DROP INDEX IF EXISTS public.idx_ai_feedback_tenant_lead_created;
DROP INDEX IF EXISTS public.idx_ai_usage_tenant_created;
CREATE INDEX idx_ai_verifications_tenant_lead_created ON public.ai_lead_verifications(tenant_id,lead_id,created_at DESC);
CREATE INDEX idx_ai_artifacts_tenant_queue ON public.lead_ai_artifacts(tenant_id,status,next_retry_at,created_at) WHERE status IN ('queued','error');
CREATE INDEX idx_ai_feedback_tenant_lead_created ON public.ai_feedback_events(tenant_id,lead_id,created_at DESC);
CREATE INDEX idx_ai_usage_tenant_created ON public.ai_usage_events(tenant_id,created_at DESC);
ALTER TABLE public.ai_lead_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_ai_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_lead_verifications,public.lead_ai_artifacts,public.ai_feedback_events,public.ai_usage_events FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.novatrade_ai_scope_guard() IS 'novatrade:g004a:ai-scope:v1; G-004B still owns runtime correlation and worker_runs result_json redaction.';
COMMIT;
