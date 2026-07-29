-- G-003: finalize tenant scope for leads and their CRM children.
-- T-028 is the sole compatibility owner authority.  This is deliberately
-- transactional: an unreconciled upgrade leaves no partially-hardened schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $g003_preflight$
DECLARE
  table_name text; row_count bigint; row_checksum text;
  counts jsonb := '{}'::jsonb; checksums jsonb := '{}'::jsonb;
  receipt_count integer; receipt_tenant uuid; receipt_workspace uuid;
  replay_complete boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['leads','lead_notes','outreach_events','admin_requests','demos'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = pg_catalog.format('G003_REQUIRED_TABLE_MISSING:%s', table_name);
    END IF;
  END LOOP;
  SELECT (SELECT count(*) = 5 FROM pg_catalog.pg_attribute a
          WHERE (a.attrelid,a.attname) IN (('public.leads'::regclass,'tenant_id'),('public.lead_notes'::regclass,'tenant_id'),('public.outreach_events'::regclass,'tenant_id'),('public.admin_requests'::regclass,'tenant_id'),('public.demos'::regclass,'tenant_id')) AND NOT a.attisdropped)
     AND (SELECT count(*) = 4 FROM pg_catalog.pg_attribute a
          WHERE (a.attrelid,a.attname) IN (('public.lead_notes'::regclass,'workspace_id'),('public.outreach_events'::regclass,'workspace_id'),('public.admin_requests'::regclass,'workspace_id'),('public.demos'::regclass,'workspace_id')) AND NOT a.attisdropped)
     AND pg_catalog.to_regclass('public.idx_leads_tenant_place_id') IS NOT NULL
     AND pg_catalog.to_regprocedure('public.novatrade_inherit_lead_child_scope()') IS NOT NULL
     AND pg_catalog.to_regprocedure('public.novatrade_lead_scope_immutable()') IS NOT NULL
     AND (SELECT count(*)=6 FROM pg_catalog.pg_constraint c WHERE c.conname IN ('leads_tenant_id_id_unique','leads_tenant_place_id_unique','lead_notes_tenant_lead_fkey','outreach_events_tenant_lead_fkey','admin_requests_tenant_lead_fkey','demos_tenant_lead_fkey') AND pg_catalog.pg_get_constraintdef(c.oid) <> '')
     AND pg_catalog.to_regclass('public.admin_requests_tenant_lead_open_unique') IS NOT NULL
     AND (SELECT count(*)=5 FROM pg_catalog.pg_trigger t WHERE t.tgname IN ('trg_novatrade_lead_scope_immutable','trg_novatrade_lead_notes_scope','trg_novatrade_outreach_events_scope','trg_novatrade_admin_requests_scope','trg_novatrade_demos_scope') AND t.tgenabled <> 'D')
  INTO replay_complete;
  IF NOT replay_complete AND ((SELECT count(*) FROM public.leads)+(SELECT count(*) FROM public.lead_notes)+(SELECT count(*) FROM public.outreach_events)+(SELECT count(*) FROM public.admin_requests)+(SELECT count(*) FROM public.demos)) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.lead_notes WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.outreach_events WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.admin_requests WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.demos WHERE tenant_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G003_UNRECONCILED_T028_SCOPE';
    END IF;
    FOREACH table_name IN ARRAY ARRAY['leads','lead_notes','outreach_events','admin_requests','demos'] LOOP
      EXECUTE pg_catalog.format('SELECT count(*), pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-''tenant_id''-''workspace_id'')::text,''|'' ORDER BY (to_jsonb(t)-''tenant_id''-''workspace_id'')::text),''''),''UTF8'')),''hex'') FROM public.%I t',table_name) INTO row_count,row_checksum;
      counts := counts || pg_catalog.jsonb_build_object(table_name,row_count); checksums := checksums || pg_catalog.jsonb_build_object(table_name,row_checksum);
    END LOOP;
    SELECT count(*)::integer INTO receipt_count FROM public.compatibility_backfill_receipts r WHERE r.status='completed' AND r.source_engine='postgres' AND r.relationship_orphan_count=0
      AND r.table_counts->'leads'=counts->'leads' AND r.table_counts->'lead_notes'=counts->'lead_notes' AND r.table_counts->'outreach_events'=counts->'outreach_events' AND r.table_counts->'admin_requests'=counts->'admin_requests' AND r.table_counts->'demos'=counts->'demos'
      AND r.after_content_checksums->'leads'=checksums->'leads' AND r.after_content_checksums->'lead_notes'=checksums->'lead_notes' AND r.after_content_checksums->'outreach_events'=checksums->'outreach_events' AND r.after_content_checksums->'admin_requests'=checksums->'admin_requests' AND r.after_content_checksums->'demos'=checksums->'demos';
    IF receipt_count=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='G003_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    IF receipt_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='G003_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    SELECT r.tenant_id,r.workspace_id INTO STRICT receipt_tenant,receipt_workspace FROM public.compatibility_backfill_receipts r WHERE r.status='completed' AND r.source_engine='postgres' AND r.relationship_orphan_count=0 AND r.table_counts->'leads'=counts->'leads' AND r.table_counts->'lead_notes'=counts->'lead_notes' AND r.table_counts->'outreach_events'=counts->'outreach_events' AND r.table_counts->'admin_requests'=counts->'admin_requests' AND r.table_counts->'demos'=counts->'demos' AND r.after_content_checksums->'leads'=checksums->'leads' AND r.after_content_checksums->'lead_notes'=checksums->'lead_notes' AND r.after_content_checksums->'outreach_events'=checksums->'outreach_events' AND r.after_content_checksums->'admin_requests'=checksums->'admin_requests' AND r.after_content_checksums->'demos'=checksums->'demos';
    IF EXISTS (SELECT 1 FROM public.leads x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant) OR EXISTS (SELECT 1 FROM public.lead_notes x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace) OR EXISTS (SELECT 1 FROM public.outreach_events x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace) OR EXISTS (SELECT 1 FROM public.admin_requests x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace) OR EXISTS (SELECT 1 FROM public.demos x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='G003_T028_RECEIPT_SCOPE_DRIFT'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_notes c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL) OR EXISTS (SELECT 1 FROM public.outreach_events c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL) OR EXISTS (SELECT 1 FROM public.admin_requests c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL) OR EXISTS (SELECT 1 FROM public.demos c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='G003_LEAD_CHILD_ORPHAN_OR_SCOPE_MISMATCH'; END IF;
END;
$g003_preflight$;

DO $g003_constraints$
DECLARE r record; child_table text;
BEGIN
  FOR r IN SELECT conname,conrelid::regclass::text AS tbl FROM pg_catalog.pg_constraint WHERE contype='f' AND conrelid IN ('public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass) AND confrelid='public.leads'::regclass LOOP EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname); END LOOP;
  FOR r IN SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid='public.leads'::regclass AND contype='u' AND conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='public.leads'::regclass AND attname='place_id')] LOOP EXECUTE pg_catalog.format('ALTER TABLE public.leads DROP CONSTRAINT %I',r.conname); END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.leads'::regclass AND conname='leads_tenant_id_id_unique') THEN ALTER TABLE public.leads ADD CONSTRAINT leads_tenant_id_id_unique UNIQUE(tenant_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.leads'::regclass AND conname='leads_tenant_place_id_unique') THEN ALTER TABLE public.leads ADD CONSTRAINT leads_tenant_place_id_unique UNIQUE(tenant_id,place_id); END IF;
  DROP INDEX IF EXISTS public.idx_admin_requests_open_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS admin_requests_tenant_lead_open_unique ON public.admin_requests(tenant_id,lead_id,request_type) WHERE status IN ('new','seen','in_progress','waiting_on_researcher');
  FOREACH child_table IN ARRAY ARRAY['lead_notes','outreach_events','admin_requests','demos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=pg_catalog.to_regclass('public.'||child_table) AND conname=child_table||'_tenant_lead_fkey') THEN EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE',child_table,child_table||'_tenant_lead_fkey'); END IF;
  END LOOP;
END;
$g003_constraints$;

CREATE OR REPLACE FUNCTION public.novatrade_inherit_lead_child_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
DECLARE parent_tenant uuid; parent_workspace uuid; actor uuid;
BEGIN
  EXECUTE pg_catalog.format('SELECT tenant_id FROM public.leads WHERE id = $1 FOR KEY SHARE') INTO parent_tenant USING NEW.lead_id;
  IF parent_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='G003_LEAD_PARENT_REQUIRED'; END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='G003_LEAD_CHILD_TENANT_MISMATCH'; END IF;
  IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='G003_LEAD_CHILD_SCOPE_IMMUTABLE'; END IF;
  NEW.tenant_id:=parent_tenant;
  IF TG_TABLE_NAME='lead_notes' THEN PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.author_user_id,true); END IF;
  IF TG_TABLE_NAME='outreach_events' THEN PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.actor_user_id,true); END IF;
  IF TG_TABLE_NAME='admin_requests' THEN PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.created_by_user_id,true); PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.assigned_admin_user_id,true); END IF;
  IF TG_TABLE_NAME='demos' THEN PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.published_by_user_id::uuid,true); PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.unpublished_by_user_id::uuid,true); PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.revoked_by_user_id::uuid,true); END IF;
  RETURN NEW;
END;
$f$;
CREATE OR REPLACE FUNCTION public.novatrade_lead_scope_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='G003_LEAD_TENANT_IMMUTABLE'; END IF; PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.assigned_to_user_id,true); PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.archived_by_user_id::uuid,true); PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.quality_checked_by_user_id::uuid,true); RETURN NEW; END;
$f$;
CREATE OR REPLACE FUNCTION public.novatrade_assert_lead_actor(p_tenant uuid,p_workspace uuid,p_actor uuid,p_child boolean) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
BEGIN IF p_actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=p_tenant AND m.auth_identity_id=p_actor AND m.status='active' AND (NOT p_child OR m.workspace_id IS NULL OR m.workspace_id IS NOT DISTINCT FROM p_workspace)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED'; END IF; END;
$f$;
REVOKE ALL ON FUNCTION public.novatrade_inherit_lead_child_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.novatrade_lead_scope_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.novatrade_assert_lead_actor(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_novatrade_lead_scope_immutable ON public.leads;
CREATE TRIGGER trg_novatrade_lead_scope_immutable BEFORE UPDATE OF tenant_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.novatrade_lead_scope_immutable();
DO $g003_triggers$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['lead_notes','outreach_events','admin_requests','demos'] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_novatrade_%I_scope ON public.%I',table_name,table_name);
    EXECUTE pg_catalog.format('CREATE TRIGGER trg_novatrade_%I_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.novatrade_inherit_lead_child_scope()',table_name,table_name);
  END LOOP;
END $g003_triggers$;
CREATE INDEX IF NOT EXISTS idx_leads_tenant_place_id ON public.leads(tenant_id,place_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_tenant_lead_created ON public.lead_notes(tenant_id,lead_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_tenant_lead_created ON public.outreach_events(tenant_id,lead_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_tenant_lead_created ON public.admin_requests(tenant_id,lead_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demos_tenant_lead ON public.demos(tenant_id,lead_id);
ALTER TABLE public.leads ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lead_notes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.outreach_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.admin_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.demos ALTER COLUMN tenant_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.novatrade_published_demo_public(p_slug text)
RETURNS TABLE(slug text, template_id text, config_json jsonb, name text, address text, phone text, maps_uri text, rating double precision, review_count integer, selling_niche text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
  SELECT d.slug,d.template_id,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('headline',CASE WHEN jsonb_typeof(d.config_json->'headline') IN ('string','null') THEN d.config_json->'headline' END,'subheadline',CASE WHEN jsonb_typeof(d.config_json->'subheadline') IN ('string','null') THEN d.config_json->'subheadline' END,'services',CASE WHEN jsonb_typeof(d.config_json->'services')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.config_json->'services') x WHERE jsonb_typeof(x)<>'string') THEN d.config_json->'services' END,'trustSignals',CASE WHEN jsonb_typeof(d.config_json->'trustSignals')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.config_json->'trustSignals') x WHERE jsonb_typeof(x)<>'string') THEN d.config_json->'trustSignals' END,'primaryCta',CASE WHEN jsonb_typeof(d.config_json->'primaryCta') IN ('string','null') THEN d.config_json->'primaryCta' END,'secondaryCta',CASE WHEN jsonb_typeof(d.config_json->'secondaryCta') IN ('string','null') THEN d.config_json->'secondaryCta' END,'websiteGap',CASE WHEN jsonb_typeof(d.config_json->'websiteGap') IN ('string','null') THEN d.config_json->'websiteGap' END)),l.name,l.address,l.phone,l.maps_uri,l.rating,l.review_count,l.selling_niche FROM public.demos d JOIN public.leads l ON (l.tenant_id,l.id)=(d.tenant_id,d.lead_id) WHERE d.slug=p_slug AND d.is_published=1 AND d.revoked_at IS NULL
$f$;
REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(text) FROM PUBLIC;
DO $g003_public_fn$ BEGIN IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN GRANT EXECUTE ON FUNCTION public.novatrade_published_demo_public(text) TO anon; END IF; END $g003_public_fn$;
REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos FROM PUBLIC,anon,authenticated;
COMMIT;
