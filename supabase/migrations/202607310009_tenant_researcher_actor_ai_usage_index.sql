-- G-007P20A: add the tenant-prefixed actor/time index proven for the exact
-- researcher AI cap sources. The current unscoped caller and global actor
-- index remain in place; the G-014 tenant caller cutover is separate work.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('novatrade:g007p20a:tenant-researcher-actor-ai-usage-index'));

LOCK TABLE public.ai_usage_events IN SHARE ROW EXCLUSIVE MODE;

DO $g007p20a_object_locks$
DECLARE
  current_owner name;
BEGIN
  IF pg_catalog.to_regprocedure('public.novatrade_ai_scope_guard()') IS NOT NULL THEN
    SELECT r.rolname INTO current_owner
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE p.oid = 'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure;
    EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_scope_guard() OWNER TO %I',current_owner);
  END IF;
  IF pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()') IS NOT NULL THEN
    SELECT r.rolname INTO current_owner
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE p.oid = 'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure;
    EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() OWNER TO %I',current_owner);
  END IF;
END;
$g007p20a_object_locks$;

LOCK TABLE pg_catalog.pg_proc IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE pg_catalog.pg_class IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE pg_catalog.pg_attribute IN SHARE ROW EXCLUSIVE MODE;
-- G007P20A_LOCKS_ACQUIRED

DO $g007p20a_preflight$
DECLARE
  foundation_exact boolean := false;
  baseline_exact boolean := false;
  final_exact boolean := false;
BEGIN
  IF pg_catalog.to_regclass('public.ai_usage_events') IS NULL
     OR pg_catalog.to_regclass('public.tenants') IS NULL
     OR pg_catalog.to_regclass('public.leads') IS NULL
     OR pg_catalog.to_regclass('public.ai_lead_verifications') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P20A_REQUIRED_TABLE_MISSING';
  END IF;

  SELECT
    -- Exact target columns. Only created_at owns a default.
    (SELECT count(*) = 6 AND pg_catalog.bool_and(
        a.atttypmod = -1 AND a.attidentity = '' AND a.attgenerated = ''
        AND CASE a.attname
          WHEN 'tenant_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype
            AND a.attnotnull AND NOT a.atthasdef
          WHEN 'actor_user_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype
            AND NOT a.attnotnull AND NOT a.atthasdef
          WHEN 'request_source' THEN a.atttypid = 'text'::pg_catalog.regtype
            AND NOT a.attnotnull AND NOT a.atthasdef
          WHEN 'lead_id' THEN a.atttypid = 'text'::pg_catalog.regtype
            AND NOT a.attnotnull AND NOT a.atthasdef
          WHEN 'verification_id' THEN a.atttypid = 'text'::pg_catalog.regtype
            AND NOT a.attnotnull AND NOT a.atthasdef
          WHEN 'created_at' THEN a.atttypid = 'timestamp with time zone'::pg_catalog.regtype
            AND a.attnotnull AND a.atthasdef
          ELSE false
        END)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND a.attname IN (
          'tenant_id', 'actor_user_id', 'request_source', 'created_at',
          'lead_id', 'verification_id')
        AND NOT a.attisdropped)
    AND (SELECT count(*) = 1 FROM pg_catalog.pg_attrdef d
      JOIN pg_catalog.pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND a.attname IN ('tenant_id', 'actor_user_id', 'request_source', 'created_at')
        AND a.attname = 'created_at'
        AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'now()')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class i ON i.oid = c.conindid
      JOIN pg_catalog.pg_index x ON x.indexrelid = c.conindid
      WHERE c.connamespace = 'public'::pg_catalog.regnamespace
        AND c.conrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND c.conname = 'ai_usage_events_pkey' AND c.contype = 'p' AND c.convalidated
        AND pg_catalog.pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
        AND i.relkind = 'i' AND i.relowner = (SELECT t.relowner FROM pg_catalog.pg_class t
          WHERE t.oid = 'public.ai_usage_events'::pg_catalog.regclass)
        AND x.indrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND x.indisunique AND x.indisprimary AND NOT x.indisexclusion
        AND x.indimmediate AND x.indisvalid AND x.indisready AND x.indislive)
    -- Exact G-004A/R1 tenant, lead, and verification ownership constraints.
    AND (SELECT count(*) = 3 FROM (VALUES
      ('ai_usage_events_tenant_id_fkey', 'public.tenants'::pg_catalog.regclass,
        ARRAY['tenant_id']::text[], ARRAY['id']::text[], 'r'::"char", 'r'::"char", NULL::text[]),
      ('ai_usage_events_tenant_lead_fkey', 'public.leads'::pg_catalog.regclass,
        ARRAY['tenant_id','lead_id']::text[], ARRAY['tenant_id','id']::text[], 'r'::"char", 'n'::"char", ARRAY['lead_id']::text[]),
      ('ai_usage_events_tenant_verification_fkey', 'public.ai_lead_verifications'::pg_catalog.regclass,
        ARRAY['tenant_id','verification_id']::text[], ARRAY['tenant_id','id']::text[], 'r'::"char", 'n'::"char", ARRAY['verification_id']::text[])
    ) e(conname,parent_relid,child_columns,parent_columns,update_action,delete_action,set_null_columns)
    JOIN pg_catalog.pg_constraint c
      ON c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.ai_usage_events'::pg_catalog.regclass
      AND c.conname = e.conname
    WHERE c.contype = 'f' AND c.convalidated AND c.confrelid = e.parent_relid
      AND c.confmatchtype = 's' AND c.confupdtype = e.update_action
      AND c.confdeltype = e.delete_action AND NOT c.condeferrable AND NOT c.condeferred
      AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
        FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum) = e.child_columns
      AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
        FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY u(attnum,ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = u.attnum) = e.parent_columns
      AND CASE WHEN e.set_null_columns IS NULL THEN c.confdelsetcols IS NULL
        ELSE (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
          FROM pg_catalog.unnest(c.confdelsetcols) WITH ORDINALITY u(attnum,ordinality)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum) = e.set_null_columns END)
    -- Exact current global actor and accepted tenant-created owners.
    AND (SELECT count(*) = 2 FROM (VALUES
      ('idx_ai_usage_actor_created', ARRAY['actor_user_id','created_at']::text[],
        ARRAY['uuid_ops','timestamptz_ops']::text[], ARRAY[0,0]::oid[], ARRAY[0,3]::smallint[],
        'CREATE INDEX idx_ai_usage_actor_created ON public.ai_usage_events USING btree (actor_user_id, created_at DESC)'),
      ('idx_ai_usage_tenant_created', ARRAY['tenant_id','created_at']::text[],
        ARRAY['uuid_ops','timestamptz_ops']::text[], ARRAY[0,0]::oid[], ARRAY[0,3]::smallint[],
        'CREATE INDEX idx_ai_usage_tenant_created ON public.ai_usage_events USING btree (tenant_id, created_at DESC)')
    ) e(index_name,key_names,opclasses,collations,options,index_definition)
    JOIN pg_catalog.pg_class i ON i.relname = e.index_name
    JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
    JOIN pg_catalog.pg_am am ON am.oid = i.relam
    WHERE i.relkind = 'i' AND i.relowner = (SELECT c.relowner FROM pg_catalog.pg_class c
        WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass)
      AND x.indrelid = 'public.ai_usage_events'::pg_catalog.regclass
      AND am.amname = 'btree' AND x.indnkeyatts = 2 AND x.indnatts = 2
      AND NOT x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
      AND NOT x.indisreplident AND x.indimmediate AND NOT x.indcheckxmin
      AND x.indisvalid AND x.indisready AND x.indislive
      AND x.indexprs IS NULL AND x.indpred IS NULL
      AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
        FROM pg_catalog.unnest(x.indkey::smallint[]) WITH ORDINALITY u(attnum,ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = u.attnum) = e.key_names
      AND (SELECT pg_catalog.array_agg(o.opcname::text ORDER BY u.ordinality)
        FROM pg_catalog.unnest(x.indclass::oid[]) WITH ORDINALITY u(opcoid,ordinality)
        JOIN pg_catalog.pg_opclass o ON o.oid = u.opcoid) = e.opclasses
      AND x.indcollation::text = pg_catalog.array_to_string(e.collations,' ')
      AND x.indoption::text = pg_catalog.array_to_string(e.options,' ')
      AND pg_catalog.pg_get_indexdef(i.oid) = e.index_definition)
    -- Exact accepted G-004A/R1 functions and the two usage triggers.
    AND (SELECT count(*) = 1 FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::pg_catalog.regnamespace AND p.proname = 'novatrade_ai_scope_guard')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid = 'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
        AND p.prolang = (SELECT l.oid FROM pg_catalog.pg_language l WHERE l.lanname = 'plpgsql')
        AND p.proowner = (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass)
        AND p.prorettype = 'trigger'::pg_catalog.regtype AND NOT p.proretset
        AND p.provolatile = 'v' AND NOT p.prosecdef AND NOT p.proisstrict
        AND NOT p.proleakproof AND p.proparallel = 'u' AND p.prokind = 'f' AND p.pronargs = 0
        AND p.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND pg_catalog.obj_description(p.oid, 'pg_proc') =
          'novatrade:g004a:ai-scope:v2; runtime correlation and worker_runs result_json redaction remain G-004B.'
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') =
          'ee67f73cab668b894e1e7b732a2ceee2ab87d0c37084217a92dc0b6378f039e5')
    AND (SELECT count(*) = 1 FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::pg_catalog.regnamespace AND p.proname = 'novatrade_ai_usage_ri_null_normalize')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid = 'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure
        AND p.prolang = (SELECT l.oid FROM pg_catalog.pg_language l WHERE l.lanname = 'plpgsql')
        AND p.proowner = (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass)
        AND p.prorettype = 'trigger'::pg_catalog.regtype AND NOT p.proretset
        AND p.provolatile = 'v' AND NOT p.prosecdef AND NOT p.proisstrict
        AND NOT p.proleakproof AND p.proparallel = 'u' AND p.prokind = 'f' AND p.pronargs = 0
        AND p.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
        AND pg_catalog.obj_description(p.oid, 'pg_proc') = 'novatrade:g004a-r1:ai-usage-ri-null-normalize:v1'
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') =
          '3a4a1c5e56eb32a0fbf36600ab0b2077cdc628d4ded0a562805eb7a6e3de656b')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE p.oid IN ('public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure,
          'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure)
        AND acl.grantee <> p.proowner AND acl.privilege_type = 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname IN ('anon','authenticated') AND (
        pg_catalog.has_function_privilege(r.oid,'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure,'EXECUTE')
        OR pg_catalog.has_function_privilege(r.oid,'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure,'EXECUTE')))
    AND (SELECT pg_catalog.array_agg(t.tgname ORDER BY t.tgname) = ARRAY[
        'trg_novatrade_ai_usage_events_a_ri_null_normalize','trg_novatrade_ai_usage_events_scope']::name[]
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.ai_usage_events'::pg_catalog.regclass AND NOT t.tgisinternal)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND t.tgname = 'trg_novatrade_ai_usage_events_a_ri_null_normalize'
        AND NOT t.tgisinternal AND t.tgenabled = 'O' AND t.tgtype = 19 AND t.tgnargs = 0
        AND t.tgfoid = 'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure
        AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
        AND pg_catalog.cardinality(t.tgattr::smallint[]) = 0)
    AND (SELECT count(*) = 1 FROM pg_catalog.pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgfoid = 'public.novatrade_ai_usage_ri_null_normalize()'::pg_catalog.regprocedure)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND t.tgname = 'trg_novatrade_ai_usage_events_scope'
        AND NOT t.tgisinternal AND t.tgenabled = 'O' AND t.tgtype = 23 AND t.tgnargs = 0
        AND t.tgfoid = 'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
        AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
        AND pg_catalog.cardinality(t.tgattr::smallint[]) = 0)
    -- Exact owner-only table/column boundary, including effective role grants.
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass
        AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid = 'public.ai_usage_events'::pg_catalog.regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
      WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass AND acl.grantee <> c.relowner
        AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname IN ('anon','authenticated')
        AND pg_catalog.has_table_privilege(r.oid,'public.ai_usage_events'::pg_catalog.regclass,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      WHERE a.attrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
        AND acl.grantee <> (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = a.attrelid)
        AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      CROSS JOIN pg_catalog.pg_attribute a
      WHERE r.rolname IN ('anon','authenticated')
        AND a.attrelid = 'public.ai_usage_events'::pg_catalog.regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
  INTO foundation_exact;

  SELECT
    (SELECT count(*) = 1 FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(i.relname,pg_catalog.length('idx_g007p20a_')) = 'idx_g007p20a_')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      JOIN pg_catalog.pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_g007p20a_ai_usage_tenant_actor_created'
        AND i.relkind = 'i'
        AND i.relowner = (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass)
        AND x.indrelid = 'public.ai_usage_events'::pg_catalog.regclass AND am.amname = 'btree'
        AND x.indnkeyatts = 3 AND x.indnatts = 3
        AND NOT x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
        AND NOT x.indisreplident AND x.indimmediate AND NOT x.indcheckxmin
        AND x.indisvalid AND x.indisready AND x.indislive
        AND x.indexprs IS NULL AND x.indpred IS NOT NULL
        AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
          FROM pg_catalog.unnest(x.indkey::smallint[]) WITH ORDINALITY u(attnum,ordinality)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = u.attnum) =
            ARRAY['tenant_id','actor_user_id','created_at']::text[]
        AND (SELECT pg_catalog.array_agg(o.opcname::text ORDER BY u.ordinality)
          FROM pg_catalog.unnest(x.indclass::oid[]) WITH ORDINALITY u(opcoid,ordinality)
          JOIN pg_catalog.pg_opclass o ON o.oid = u.opcoid) =
            ARRAY['uuid_ops','uuid_ops','timestamptz_ops']::text[]
        AND x.indcollation::text = '0 0 0'
        AND x.indoption::text = '0 0 3'
        AND pg_catalog.pg_get_expr(x.indpred,x.indrelid) =
          '((actor_user_id IS NOT NULL) AND (request_source = ANY (ARRAY[''researcher_ai_check''::text, ''researcher_pitch_pack''::text])))'
        AND pg_catalog.pg_get_indexdef(i.oid) =
          'CREATE INDEX idx_g007p20a_ai_usage_tenant_actor_created ON public.ai_usage_events USING btree (tenant_id, actor_user_id, created_at DESC) WHERE ((actor_user_id IS NOT NULL) AND (request_source = ANY (ARRAY[''researcher_ai_check''::text, ''researcher_pitch_pack''::text])))')
  INTO final_exact;

  SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class i
    JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
    WHERE n.nspname = 'public'
      AND pg_catalog.left(i.relname,pg_catalog.length('idx_g007p20a_')) = 'idx_g007p20a_')
  INTO baseline_exact;

  IF NOT foundation_exact THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P20A_FOUNDATION_CATALOG_DRIFT';
  ELSIF final_exact THEN
    PERFORM pg_catalog.set_config('novatrade.g007p20a_action','noop',true);
  ELSIF baseline_exact THEN
    PERFORM pg_catalog.set_config('novatrade.g007p20a_action','install',true);
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P20A_INDEX_CATALOG_DRIFT';
  END IF;
END;
$g007p20a_preflight$;

DO $g007p20a_install$
BEGIN
  IF pg_catalog.current_setting('novatrade.g007p20a_action',true) <> 'install' THEN
    RETURN;
  END IF;
  CREATE INDEX idx_g007p20a_ai_usage_tenant_actor_created
    ON public.ai_usage_events (tenant_id,actor_user_id,created_at DESC)
    WHERE actor_user_id IS NOT NULL
      AND request_source IN ('researcher_ai_check','researcher_pitch_pack');
END;
$g007p20a_install$;
-- G007P20A_INSTALL_COMPLETE

DO $g007p20a_postflight$
BEGIN
  IF pg_catalog.current_setting('novatrade.g007p20a_action',true) NOT IN ('install','noop')
     OR (SELECT count(*) <> 1 FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
       WHERE n.nspname = 'public'
         AND pg_catalog.left(i.relname,pg_catalog.length('idx_g007p20a_')) = 'idx_g007p20a_')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
       JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
       JOIN pg_catalog.pg_am am ON am.oid = i.relam
       WHERE n.nspname = 'public'
         AND i.relname = 'idx_g007p20a_ai_usage_tenant_actor_created'
         AND i.relkind = 'i'
         AND i.relowner = (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = 'public.ai_usage_events'::pg_catalog.regclass)
         AND x.indrelid = 'public.ai_usage_events'::pg_catalog.regclass AND am.amname = 'btree'
         AND x.indnkeyatts = 3 AND x.indnatts = 3
         AND NOT x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
         AND NOT x.indisreplident AND x.indimmediate AND NOT x.indcheckxmin
         AND x.indisvalid AND x.indisready AND x.indislive
         AND x.indexprs IS NULL AND x.indpred IS NOT NULL
         AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
           FROM pg_catalog.unnest(x.indkey::smallint[]) WITH ORDINALITY u(attnum,ordinality)
           JOIN pg_catalog.pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = u.attnum) =
             ARRAY['tenant_id','actor_user_id','created_at']::text[]
         AND (SELECT pg_catalog.array_agg(o.opcname::text ORDER BY u.ordinality)
           FROM pg_catalog.unnest(x.indclass::oid[]) WITH ORDINALITY u(opcoid,ordinality)
           JOIN pg_catalog.pg_opclass o ON o.oid = u.opcoid) =
             ARRAY['uuid_ops','uuid_ops','timestamptz_ops']::text[]
         AND x.indcollation::text = '0 0 0'
         AND x.indoption::text = '0 0 3'
         AND pg_catalog.pg_get_expr(x.indpred,x.indrelid) =
           '((actor_user_id IS NOT NULL) AND (request_source = ANY (ARRAY[''researcher_ai_check''::text, ''researcher_pitch_pack''::text])))'
         AND pg_catalog.pg_get_indexdef(i.oid) =
           'CREATE INDEX idx_g007p20a_ai_usage_tenant_actor_created ON public.ai_usage_events USING btree (tenant_id, actor_user_id, created_at DESC) WHERE ((actor_user_id IS NOT NULL) AND (request_source = ANY (ARRAY[''researcher_ai_check''::text, ''researcher_pitch_pack''::text])))') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P20A_POSTFLIGHT_INVALID';
  END IF;
END;
$g007p20a_postflight$;
-- G007P20A_POSTFLIGHT_COMPLETE

COMMIT;
