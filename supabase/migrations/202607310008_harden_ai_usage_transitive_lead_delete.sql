-- G-004A-R1: normalize only PostgreSQL referential-action NULL transitions on
-- ai_usage_events. The accepted shared G-004A v2 scope guard remains byte-for-
-- byte unchanged so its exact historical replay contract remains valid.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:g004a-r1:ai-usage-transitive-lead-delete'));

LOCK TABLE
  public.workspaces,
  public.tenant_memberships,
  public.leads,
  public.ai_lead_verifications,
  public.lead_ai_artifacts,
  public.ai_feedback_events,
  public.ai_usage_events
IN SHARE ROW EXCLUSIVE MODE;
-- G004AR1_WRITER_LOCKS_ACQUIRED

DO $g004ar1_object_locks$
DECLARE
  current_owner name;
BEGIN
  -- Establish deterministic object-lock order before taking the pg_proc table
  -- lock that closes function DDL/ACL/config replacement races.
  IF pg_catalog.to_regprocedure('public.novatrade_ai_scope_guard()') IS NOT NULL THEN
    SELECT r.rolname INTO current_owner
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure;
    EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_scope_guard() OWNER TO %I',current_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()') IS NOT NULL THEN
    SELECT r.rolname INTO current_owner
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure;
    EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() OWNER TO %I',current_owner);
  END IF;
END;
$g004ar1_object_locks$;

LOCK TABLE pg_catalog.pg_proc IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE pg_catalog.pg_class IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE pg_catalog.pg_attribute IN SHARE ROW EXCLUSIVE MODE;
-- G004AR1_OBJECT_LOCKS_ACQUIRED

DO $g004ar1_preflight$
DECLARE
  foundation_exact boolean := false;
  baseline_exact boolean := false;
  final_exact boolean := false;
BEGIN
  IF pg_catalog.to_regclass('public.ai_usage_events') IS NULL
     OR pg_catalog.to_regclass('public.ai_lead_verifications') IS NULL
     OR pg_catalog.to_regclass('public.leads') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_REQUIRED_TABLE_MISSING';
  END IF;

  SELECT
    -- Exact accepted G-004A v2 function. R1 never replaces or repairs it.
    (SELECT count(*)=1 FROM pg_catalog.pg_proc p
      WHERE p.pronamespace='public'::pg_catalog.regnamespace
        AND p.proname='novatrade_ai_scope_guard')
    AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::pg_catalog.regtype
        AND NOT p.proretset AND p.provolatile='v' AND NOT p.prosecdef
        AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
        AND p.prokind='f' AND p.pronargs=0
        AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
        AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c
                         WHERE c.oid='public.ai_lead_verifications'::pg_catalog.regclass)
        AND pg_catalog.obj_description(p.oid,'pg_proc')=
          'novatrade:g004a:ai-scope:v2; runtime correlation and worker_runs result_json redaction remain G-004B.'
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=
          'ee67f73cab668b894e1e7b732a2ceee2ab87d0c37084217a92dc0b6378f039e5'
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
        AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname IN ('anon','authenticated')
        AND pg_catalog.has_function_privilege(r.oid,'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure,'EXECUTE'))
    -- The four accepted scope triggers remain exact. An additional differently
    -- named usage normalizer is deliberately outside this four-row predicate.
    AND (SELECT count(*)=4 FROM (VALUES
      ('public.ai_lead_verifications'::pg_catalog.regclass,'trg_novatrade_ai_lead_verifications_scope'),
      ('public.lead_ai_artifacts'::pg_catalog.regclass,'trg_novatrade_lead_ai_artifacts_scope'),
      ('public.ai_feedback_events'::pg_catalog.regclass,'trg_novatrade_ai_feedback_events_scope'),
      ('public.ai_usage_events'::pg_catalog.regclass,'trg_novatrade_ai_usage_events_scope')
    ) e(relid,tgname) JOIN pg_catalog.pg_trigger t
      ON t.tgrelid=e.relid AND t.tgname=e.tgname
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23
        AND t.tgnargs=0 AND t.tgfoid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
        AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
        AND pg_catalog.cardinality(t.tgattr::smallint[])=0)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass AND NOT t.tgisinternal
        AND t.tgname NOT IN ('trg_novatrade_ai_usage_events_a_ri_null_normalize','trg_novatrade_ai_usage_events_scope'))
    -- Exact constraints whose action ordering R1 makes irrelevant.
    AND (SELECT count(*)=3 FROM (VALUES
      ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'c'::"char",NULL::text[]),
      ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['lead_id']::text[]),
      ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_verification_fkey','public.ai_lead_verifications'::pg_catalog.regclass,ARRAY['tenant_id','verification_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['verification_id']::text[])
    ) e(relid,conname,parent_relid,child_columns,parent_columns,delete_action,set_null_columns)
    JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
    WHERE c.contype='f' AND c.convalidated AND c.confrelid=e.parent_relid
      AND c.confmatchtype='s' AND c.confupdtype='r' AND c.confdeltype=e.delete_action
      AND NOT c.condeferrable AND NOT c.condeferred
      AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
             FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
             JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.child_columns
      AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
             FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY u(attnum,ordinality)
             JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=u.attnum)=e.parent_columns
      AND CASE WHEN e.set_null_columns IS NULL THEN c.confdelsetcols IS NULL
               ELSE (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                       FROM pg_catalog.unnest(c.confdelsetcols) WITH ORDINALITY u(attnum,ordinality)
                       JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.set_null_columns END)
    AND (SELECT count(*)=3 AND pg_catalog.bool_and(
          a.atttypid=CASE WHEN a.attname='tenant_id' THEN 'uuid'::pg_catalog.regtype ELSE 'text'::pg_catalog.regtype END
          AND a.atttypmod=-1 AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasdef
          AND CASE WHEN a.attname='tenant_id' THEN a.attnotnull ELSE NOT a.attnotnull END)
      FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
        ('public.ai_usage_events'::pg_catalog.regclass,'tenant_id'),
        ('public.ai_usage_events'::pg_catalog.regclass,'lead_id'),
        ('public.ai_usage_events'::pg_catalog.regclass,'verification_id')) AND NOT a.attisdropped)
    -- Preserve the accepted four-table isolation boundary.
    AND (SELECT count(*)=4 AND pg_catalog.bool_and(c.relrowsecurity AND NOT c.relforcerowsecurity)
      FROM pg_catalog.pg_class c WHERE c.oid IN (
        'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
        'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
      'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
      'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
      WHERE c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
        'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
        AND acl.grantee<>c.relowner
        AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
      WHERE r.rolname IN ('anon','authenticated')
        AND c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
          'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
        AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      WHERE c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
        'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
        AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
        AND acl.grantee<>c.relowner AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE r.rolname IN ('anon','authenticated')
        AND c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
          'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
        AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
  INTO foundation_exact;

  SELECT
    (SELECT count(*)=0 FROM pg_catalog.pg_proc p
      WHERE p.pronamespace='public'::pg_catalog.regnamespace
        AND p.proname='novatrade_ai_usage_ri_null_normalize')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass
        AND t.tgname='trg_novatrade_ai_usage_events_a_ri_null_normalize')
    AND (SELECT count(*)=1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass AND NOT t.tgisinternal)
  INTO baseline_exact;

  SELECT
    (SELECT count(*)=1 FROM pg_catalog.pg_proc p
      WHERE p.pronamespace='public'::pg_catalog.regnamespace
        AND p.proname='novatrade_ai_usage_ri_null_normalize')
    AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::pg_catalog.regtype
        AND NOT p.proretset AND p.provolatile='v' AND NOT p.prosecdef
        AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
        AND p.prokind='f' AND p.pronargs=0
        AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
        AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c
                         WHERE c.oid='public.ai_usage_events'::pg_catalog.regclass)
        AND pg_catalog.obj_description(p.oid,'pg_proc')=
          'novatrade:g004a-r1:ai-usage-ri-null-normalize:v1'
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=
          '3a4a1c5e56eb32a0fbf36600ab0b2077cdc628d4ded0a562805eb7a6e3de656b'
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
        AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
        AND pg_catalog.has_function_privilege(p.proowner,p.oid,'EXECUTE'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname IN ('anon','authenticated')
        AND pg_catalog.has_function_privilege(r.oid,pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()'),'EXECUTE'))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass
        AND t.tgname='trg_novatrade_ai_usage_events_a_ri_null_normalize'
        AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=19 AND t.tgnargs=0
        AND t.tgfoid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
        AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
        AND pg_catalog.cardinality(t.tgattr::smallint[])=0)
    AND (SELECT count(*)=1 FROM pg_catalog.pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgfoid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()'))
    AND (SELECT pg_catalog.array_agg(t.tgname ORDER BY t.tgname)=ARRAY[
        'trg_novatrade_ai_usage_events_a_ri_null_normalize','trg_novatrade_ai_usage_events_scope']::name[]
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass AND NOT t.tgisinternal)
  INTO final_exact;

  IF EXISTS (SELECT 1 FROM public.ai_usage_events u
    LEFT JOIN public.ai_lead_verifications v
      ON (v.tenant_id,v.id,v.lead_id)=(u.tenant_id,u.verification_id,u.lead_id)
    WHERE u.lead_id IS NOT NULL AND u.verification_id IS NOT NULL AND v.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_EXISTING_USAGE_REFERENCE_SCOPE_INVALID';
  END IF;

  IF NOT foundation_exact THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_G004A_V2_FOUNDATION_DRIFT';
  ELSIF final_exact THEN
    PERFORM pg_catalog.set_config('novatrade.g004ar1_action','noop',true);
  ELSIF baseline_exact THEN
    PERFORM pg_catalog.set_config('novatrade.g004ar1_action','install',true);
  ELSE
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_NORMALIZER_CATALOG_DRIFT';
  END IF;
END;
$g004ar1_preflight$;

DO $g004ar1_install$
DECLARE
  target_owner name;
BEGIN
  IF pg_catalog.current_setting('novatrade.g004ar1_action',true) <> 'install' THEN
    RETURN;
  END IF;

  EXECUTE $ddl$
    CREATE FUNCTION public.novatrade_ai_usage_ri_null_normalize() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $function$
DECLARE
  reference_change boolean;
  lead_nulled boolean;
  verification_nulled boolean;
BEGIN
  IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'ai_usage_events' OR TG_OP<>'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_USAGE_RI_TRIGGER_CONTEXT_INVALID';
  END IF;

  reference_change:=NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.verification_id IS DISTINCT FROM OLD.verification_id;
  IF NOT reference_change OR pg_catalog.pg_trigger_depth()<=1 THEN
    RETURN NEW;
  END IF;

  lead_nulled:=OLD.lead_id IS NOT NULL AND NEW.lead_id IS NULL;
  verification_nulled:=OLD.verification_id IS NOT NULL AND NEW.verification_id IS NULL;
  IF NOT (
    (NEW.lead_id IS NULL OR NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id)
    AND (NEW.verification_id IS NULL OR NEW.verification_id IS NOT DISTINCT FROM OLD.verification_id)
    AND (lead_nulled OR verification_nulled)
    AND (pg_catalog.to_jsonb(NEW)-'lead_id'-'verification_id')
      = (pg_catalog.to_jsonb(OLD)-'lead_id'-'verification_id')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004AR1_USAGE_RI_NULL_SHAPE_INVALID';
  END IF;

  IF lead_nulled AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE (l.tenant_id,l.id)=(OLD.tenant_id,OLD.lead_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004AR1_USAGE_RI_NULL_PARENT_PRESENT';
  END IF;
  IF verification_nulled AND EXISTS (
    SELECT 1 FROM public.ai_lead_verifications v
    WHERE (v.tenant_id,v.id)=(OLD.tenant_id,OLD.verification_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004AR1_USAGE_RI_NULL_PARENT_PRESENT';
  END IF;

  IF lead_nulled
     AND NEW.verification_id IS NOT NULL
     AND NEW.verification_id IS NOT DISTINCT FROM OLD.verification_id
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_lead_verifications v
       WHERE (v.tenant_id,v.id)=(OLD.tenant_id,OLD.verification_id)
     ) THEN
    NEW.verification_id:=NULL;
  END IF;
  IF verification_nulled
     AND NEW.lead_id IS NOT NULL
     AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id
     AND NOT EXISTS (
       SELECT 1 FROM public.leads l
       WHERE (l.tenant_id,l.id)=(OLD.tenant_id,OLD.lead_id)
     ) THEN
    NEW.lead_id:=NULL;
  END IF;

  RETURN NEW;
END
    $function$
  $ddl$;

  SELECT r.rolname INTO STRICT target_owner
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
  WHERE c.oid='public.ai_usage_events'::pg_catalog.regclass;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() OWNER TO %I',target_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() FROM authenticated';
  END IF;
  EXECUTE $ddl$COMMENT ON FUNCTION public.novatrade_ai_usage_ri_null_normalize()
    IS 'novatrade:g004a-r1:ai-usage-ri-null-normalize:v1'$ddl$;
  EXECUTE $ddl$CREATE TRIGGER trg_novatrade_ai_usage_events_a_ri_null_normalize
    BEFORE UPDATE ON public.ai_usage_events
    FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_usage_ri_null_normalize()$ddl$;
END;
$g004ar1_install$;

-- G004AR1_INSTALL_COMPLETE

DO $g004ar1_postflight$
BEGIN
  IF pg_catalog.current_setting('novatrade.g004ar1_action',true) NOT IN ('install','noop')
     OR (SELECT count(*)<>1 FROM pg_catalog.pg_proc p
          WHERE p.pronamespace='public'::pg_catalog.regnamespace
            AND p.proname='novatrade_ai_usage_ri_null_normalize')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
            AND l.lanname='plpgsql' AND p.prorettype='trigger'::pg_catalog.regtype
            AND NOT p.proretset AND p.provolatile='v' AND NOT p.prosecdef
            AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
            AND p.prokind='f' AND p.pronargs=0
            AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
            AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='public.ai_usage_events'::pg_catalog.regclass)
            AND pg_catalog.obj_description(p.oid,'pg_proc')='novatrade:g004a-r1:ai-usage-ri-null-normalize:v1'
            AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
              pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=
              '3a4a1c5e56eb32a0fbf36600ab0b2077cdc628d4ded0a562805eb7a6e3de656b')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
            AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
          WHERE p.oid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
            AND pg_catalog.has_function_privilege(p.proowner,p.oid,'EXECUTE'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
          WHERE r.rolname IN ('anon','authenticated')
            AND pg_catalog.has_function_privilege(r.oid,pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()'),'EXECUTE'))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
          WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass
            AND t.tgname='trg_novatrade_ai_usage_events_a_ri_null_normalize'
            AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=19 AND t.tgnargs=0
            AND t.tgfoid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()')
            AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
            AND pg_catalog.cardinality(t.tgattr::smallint[])=0)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
          WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
            AND p.prorettype='trigger'::pg_catalog.regtype AND NOT p.proretset
            AND p.provolatile='v' AND NOT p.prosecdef AND NOT p.proisstrict
            AND NOT p.proleakproof AND p.proparallel='u' AND p.prokind='f' AND p.pronargs=0
            AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
            AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='public.ai_usage_events'::pg_catalog.regclass)
            AND pg_catalog.obj_description(p.oid,'pg_proc')=
              'novatrade:g004a:ai-scope:v2; runtime correlation and worker_runs result_json redaction remain G-004B.'
            AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
              pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=
              'ee67f73cab668b894e1e7b732a2ceee2ab87d0c37084217a92dc0b6378f039e5')
     OR (SELECT count(*)<>1 FROM pg_catalog.pg_proc p
          WHERE p.pronamespace='public'::pg_catalog.regnamespace AND p.proname='novatrade_ai_scope_guard')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
            AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')
          AND pg_catalog.has_function_privilege(r.oid,'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure,'EXECUTE'))
     OR (SELECT count(*)<>4 FROM (VALUES
          ('public.ai_lead_verifications'::pg_catalog.regclass,'trg_novatrade_ai_lead_verifications_scope'),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'trg_novatrade_lead_ai_artifacts_scope'),
          ('public.ai_feedback_events'::pg_catalog.regclass,'trg_novatrade_ai_feedback_events_scope'),
          ('public.ai_usage_events'::pg_catalog.regclass,'trg_novatrade_ai_usage_events_scope')
        ) e(relid,tgname) JOIN pg_catalog.pg_trigger t ON t.tgrelid=e.relid AND t.tgname=e.tgname
          WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23 AND t.tgnargs=0
            AND t.tgfoid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
            AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
            AND pg_catalog.cardinality(t.tgattr::smallint[])=0)
     OR (SELECT pg_catalog.array_agg(t.tgname ORDER BY t.tgname)<>ARRAY[
            'trg_novatrade_ai_usage_events_a_ri_null_normalize','trg_novatrade_ai_usage_events_scope']::name[]
          FROM pg_catalog.pg_trigger t
          WHERE t.tgrelid='public.ai_usage_events'::pg_catalog.regclass AND NOT t.tgisinternal)
     OR (SELECT count(*)<>1 FROM pg_catalog.pg_trigger t
          WHERE NOT t.tgisinternal
            AND t.tgfoid=pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()'))
     OR (SELECT count(*)<>3 FROM (VALUES
          ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'c'::"char",NULL::text[]),
          ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['lead_id']::text[]),
          ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_verification_fkey','public.ai_lead_verifications'::pg_catalog.regclass,ARRAY['tenant_id','verification_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['verification_id']::text[])
        ) e(relid,conname,parent_relid,child_columns,parent_columns,delete_action,set_null_columns)
        JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
        WHERE c.contype='f' AND c.convalidated AND c.confrelid=e.parent_relid
          AND c.confmatchtype='s' AND c.confupdtype='r' AND c.confdeltype=e.delete_action
          AND NOT c.condeferrable AND NOT c.condeferred
          AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                 FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.child_columns
          AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                 FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY u(attnum,ordinality)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=u.attnum)=e.parent_columns
          AND CASE WHEN e.set_null_columns IS NULL THEN c.confdelsetcols IS NULL
                   ELSE (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                           FROM pg_catalog.unnest(c.confdelsetcols) WITH ORDINALITY u(attnum,ordinality)
                           JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.set_null_columns END)
     OR NOT (SELECT count(*)=3 AND pg_catalog.bool_and(
            a.atttypid=CASE WHEN a.attname='tenant_id' THEN 'uuid'::pg_catalog.regtype ELSE 'text'::pg_catalog.regtype END
            AND a.atttypmod=-1 AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasdef
            AND CASE WHEN a.attname='tenant_id' THEN a.attnotnull ELSE NOT a.attnotnull END)
          FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
            ('public.ai_usage_events'::pg_catalog.regclass,'tenant_id'),
            ('public.ai_usage_events'::pg_catalog.regclass,'lead_id'),
            ('public.ai_usage_events'::pg_catalog.regclass,'verification_id')) AND NOT a.attisdropped)
     OR NOT (SELECT count(*)=4 AND pg_catalog.bool_and(c.relrowsecurity AND NOT c.relforcerowsecurity)
          FROM pg_catalog.pg_class c WHERE c.oid IN (
            'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
            'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
          'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
          'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
          WHERE c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
            'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
            AND acl.grantee<>c.relowner
            AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
          WHERE r.rolname IN ('anon','authenticated')
            AND c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
              'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
            AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
          CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
          WHERE c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
            'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
            AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
            AND acl.grantee<>c.relowner AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
          JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
          WHERE r.rolname IN ('anon','authenticated')
            AND c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
              'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
            AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
     OR EXISTS (SELECT 1 FROM public.ai_usage_events u
          LEFT JOIN public.ai_lead_verifications v
            ON (v.tenant_id,v.id,v.lead_id)=(u.tenant_id,u.verification_id,u.lead_id)
          WHERE u.lead_id IS NOT NULL AND u.verification_id IS NOT NULL AND v.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004AR1_POSTFLIGHT_INVALID';
  END IF;
END;
$g004ar1_postflight$;

COMMIT;
