-- G-005: tenant/source scope for Google Places cache, observations, and usage.
-- google_places_legacy is an identity label only. This migration does not
-- activate a connector, add licensing terms, or authorize live collection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:g005:source-cache-usage-tenant-scope'));

LOCK TABLE
  public.compatibility_backfill_receipts,
  public.tenants,
  public.crawl_runs,
  public.crawl_units,
  public.leads,
  public.place_cache,
  public.places_master,
  public.place_observations,
  public.api_usage_events
IN SHARE ROW EXCLUSIVE MODE;
-- G005_WRITER_LOCKS_ACQUIRED

DO $g005_preflight$
DECLARE
  target_table text;
  row_count bigint;
  row_checksum text;
  counts jsonb := '{}'::jsonb;
  checksums jsonb := '{}'::jsonb;
  receipt_count integer;
  receipt_tenant uuid;
  replay_complete boolean := false;
  partial_catalog boolean := false;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['place_cache','places_master','place_observations','api_usage_events'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I',target_table)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=pg_catalog.format('G005_REQUIRED_TABLE_MISSING:%s',target_table);
    END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure('public.novatrade_source_payload_is_safe(jsonb)') IS NOT NULL
     AND pg_catalog.to_regprocedure('public.novatrade_source_scope_guard()') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_places_master_tenant_source_last_seen') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_place_observations_tenant_source_place_time') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_api_usage_tenant_source_created') IS NOT NULL THEN
    SELECT
      (SELECT count(*)=4 AND pg_catalog.bool_and(
          a.atttypid='text'::pg_catalog.regtype AND a.atttypmod=-1 AND a.attnotnull
          AND a.attidentity='' AND a.attgenerated='' AND a.atthasdef
          AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='''google_places_legacy''::text')
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE (a.attrelid,a.attname) IN (
         ('public.place_cache'::pg_catalog.regclass,'source_card_id'),
         ('public.places_master'::pg_catalog.regclass,'source_card_id'),
         ('public.place_observations'::pg_catalog.regclass,'source_card_id'),
         ('public.api_usage_events'::pg_catalog.regclass,'source_card_id')) AND NOT a.attisdropped)
      AND (SELECT count(*)=4 AND pg_catalog.bool_and(a.atttypid='uuid'::pg_catalog.regtype AND a.attnotnull)
       FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
         ('public.place_cache'::pg_catalog.regclass,'tenant_id'),('public.places_master'::pg_catalog.regclass,'tenant_id'),
         ('public.place_observations'::pg_catalog.regclass,'tenant_id'),('public.api_usage_events'::pg_catalog.regclass,'tenant_id'))
         AND NOT a.attisdropped)
      AND (SELECT count(*)=4 FROM (
        VALUES
          ('public.place_cache'::pg_catalog.regclass,'place_cache_pkey',ARRAY['tenant_id','source_card_id','place_id']::text[]),
          ('public.places_master'::pg_catalog.regclass,'places_master_pkey',ARRAY['tenant_id','source_card_id','place_id']::text[]),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_pkey',ARRAY['tenant_id','source_card_id','id']::text[]),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_pkey',ARRAY['tenant_id','source_card_id','id']::text[])
      ) e(relid,conname,columns)
      JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
      WHERE c.contype='p' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
             FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
             JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.columns)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid='public.crawl_units'::pg_catalog.regclass
          AND c.conname='crawl_units_tenant_id_id_unique' AND c.contype='u' AND c.convalidated
          AND pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (tenant_id, id)')
      AND (SELECT count(*)=4 FROM (
        VALUES
          ('public.place_cache'::pg_catalog.regclass,'place_cache_source_card_id_chk'),
          ('public.places_master'::pg_catalog.regclass,'places_master_source_card_id_chk'),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_source_card_id_chk'),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_source_card_id_chk')
      ) e(relid,conname) JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
       WHERE c.contype='c' AND c.convalidated
         AND pg_catalog.pg_get_constraintdef(c.oid)='CHECK ((source_card_id = ''google_places_legacy''::text))')
      AND (SELECT count(*)=7 FROM (
        VALUES
          ('public.place_observations'::pg_catalog.regclass,'place_observations_tenant_source_place_fkey','public.places_master'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, source_card_id, place_id) REFERENCES places_master(tenant_id, source_card_id, place_id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_tenant_run_fkey','public.crawl_runs'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES crawl_runs(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (crawl_run_id)'),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_tenant_unit_fkey','public.crawl_units'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, crawl_unit_id) REFERENCES crawl_units(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (crawl_unit_id)'),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_tenant_lead_fkey','public.leads'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (lead_id)'),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_tenant_run_fkey','public.crawl_runs'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES crawl_runs(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (crawl_run_id)'),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_tenant_unit_fkey','public.crawl_units'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, crawl_unit_id) REFERENCES crawl_units(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (crawl_unit_id)'),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_tenant_lead_fkey','public.leads'::pg_catalog.regclass,'FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (lead_id)')
      ) e(relid,conname,parent_relid,definition) JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
       WHERE c.contype='f' AND c.convalidated AND c.confrelid=e.parent_relid
         AND c.confupdtype='r' AND c.confdeltype IN ('r','n') AND NOT c.condeferrable AND NOT c.condeferred
         AND pg_catalog.pg_get_constraintdef(c.oid)=e.definition)
      AND (SELECT count(*)=4 FROM (
        VALUES
          ('public.place_cache'::pg_catalog.regclass,'place_cache_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
          ('public.places_master'::pg_catalog.regclass,'places_master_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
          ('public.place_observations'::pg_catalog.regclass,'place_observations_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
          ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT')
      ) e(relid,conname,definition) JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
       WHERE c.contype='f' AND c.convalidated AND c.confrelid='public.tenants'::pg_catalog.regclass
         AND NOT c.condeferrable AND NOT c.condeferred AND pg_catalog.pg_get_constraintdef(c.oid)=e.definition)
      AND (SELECT count(*)=11 FROM pg_catalog.pg_constraint c WHERE c.contype='f' AND c.conrelid IN (
        'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
      AND (SELECT count(*)=4 FROM (
        VALUES
          ('public.place_cache'::pg_catalog.regclass,'trg_novatrade_place_cache_scope'),
          ('public.places_master'::pg_catalog.regclass,'trg_novatrade_places_master_scope'),
          ('public.place_observations'::pg_catalog.regclass,'trg_novatrade_place_observations_scope'),
          ('public.api_usage_events'::pg_catalog.regclass,'trg_novatrade_api_usage_scope')
      ) e(relid,tgname) JOIN pg_catalog.pg_trigger t ON t.tgrelid=e.relid AND t.tgname=e.tgname
       WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23 AND t.tgnargs=0
         AND t.tgfoid='public.novatrade_source_scope_guard()'::pg_catalog.regprocedure AND t.tgqual IS NULL)
      AND (SELECT count(*)=4 FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (
        'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
      AND (SELECT count(*)=4 AND pg_catalog.bool_and(c.relowner=(SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.place_cache'::pg_catalog.regclass))
        FROM pg_catalog.pg_class c WHERE c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
      AND (SELECT count(*)=2 FROM pg_catalog.pg_proc p WHERE p.oid IN (
        'public.novatrade_source_payload_is_safe(jsonb)'::pg_catalog.regprocedure,
        'public.novatrade_source_scope_guard()'::pg_catalog.regprocedure)
        AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
        AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.prokind='f')
      AND (SELECT l.lanname='sql' AND p.prorettype='boolean'::pg_catalog.regtype AND NOT p.proretset
          AND p.provolatile='i' AND p.pronargs=1 AND p.proargnames=ARRAY['value']::text[]
          AND p.proowner=(SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.place_cache'::pg_catalog.regclass)
          AND pg_catalog.obj_description(p.oid,'pg_proc')='novatrade:g005:prohibited-source-content:v1'
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
        WHERE p.oid='public.novatrade_source_payload_is_safe(jsonb)'::pg_catalog.regprocedure)
      AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::pg_catalog.regtype AND NOT p.proretset
          AND p.provolatile='v' AND p.pronargs=0
          AND p.proowner=(SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.place_cache'::pg_catalog.regclass)
          AND pg_catalog.obj_description(p.oid,'pg_proc')='novatrade:g005:tenant-source-scope:v1; live runtime propagation remains G020/G021/G022.'
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
        WHERE p.oid='public.novatrade_source_scope_guard()'::pg_catalog.regprocedure)
      AND (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')
           FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_source_payload_is_safe(jsonb)'::pg_catalog.regprocedure)=
          'a8bbd0f6a21e36b8b3496297750a84f0b29aecdd9ded85e26d15c8aed1fe7cd0'
      AND (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')
           FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_source_scope_guard()'::pg_catalog.regprocedure)=
          '3122a2f0d62a07362dfc98917b557a2b4bc957f2f9b878579de24a6358afa0aa'
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        WHERE p.oid IN ('public.novatrade_source_payload_is_safe(jsonb)'::pg_catalog.regprocedure,
          'public.novatrade_source_scope_guard()'::pg_catalog.regprocedure)
          AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND (pg_catalog.has_function_privilege(r.oid,'public.novatrade_source_payload_is_safe(jsonb)'::pg_catalog.regprocedure,'EXECUTE')
          OR pg_catalog.has_function_privilege(r.oid,'public.novatrade_source_scope_guard()'::pg_catalog.regprocedure,'EXECUTE')))
      AND (SELECT count(*)=12 FROM pg_catalog.pg_index x
        JOIN pg_catalog.pg_class c ON c.oid=x.indrelid
        JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid=i.relam
        WHERE c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
          AND NOT x.indisprimary AND NOT x.indisunique AND x.indisvalid AND x.indisready AND am.amname='btree'
          AND x.indexprs IS NULL AND x.indpred IS NULL)
      AND pg_catalog.pg_get_indexdef('public.idx_places_master_tenant_source_last_seen'::pg_catalog.regclass)='CREATE INDEX idx_places_master_tenant_source_last_seen ON public.places_master USING btree (tenant_id, source_card_id, last_seen_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_places_master_tenant_source_quality'::pg_catalog.regclass)='CREATE INDEX idx_places_master_tenant_source_quality ON public.places_master USING btree (tenant_id, source_card_id, completeness_score DESC, freshness_score DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_place_observations_tenant_source_place_time'::pg_catalog.regclass)='CREATE INDEX idx_place_observations_tenant_source_place_time ON public.place_observations USING btree (tenant_id, source_card_id, place_id, observed_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_place_observations_tenant_source_run_time'::pg_catalog.regclass)='CREATE INDEX idx_place_observations_tenant_source_run_time ON public.place_observations USING btree (tenant_id, source_card_id, crawl_run_id, observed_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_place_observations_tenant_source_unit_time'::pg_catalog.regclass)='CREATE INDEX idx_place_observations_tenant_source_unit_time ON public.place_observations USING btree (tenant_id, source_card_id, crawl_unit_id, observed_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_place_observations_tenant_source_lead_time'::pg_catalog.regclass)='CREATE INDEX idx_place_observations_tenant_source_lead_time ON public.place_observations USING btree (tenant_id, source_card_id, lead_id, observed_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_created ON public.api_usage_events USING btree (tenant_id, source_card_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_sku_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_sku_created ON public.api_usage_events USING btree (tenant_id, source_card_id, sku, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_run_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_run_created ON public.api_usage_events USING btree (tenant_id, source_card_id, crawl_run_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_unit_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_unit_created ON public.api_usage_events USING btree (tenant_id, source_card_id, crawl_unit_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_lead_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_lead_created ON public.api_usage_events USING btree (tenant_id, source_card_id, lead_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_api_usage_tenant_source_endpoint_created'::pg_catalog.regclass)='CREATE INDEX idx_api_usage_tenant_source_endpoint_created ON public.api_usage_events USING btree (tenant_id, source_card_id, endpoint, created_at DESC)'
      AND (SELECT count(*)=4 AND pg_catalog.bool_and(c.relrowsecurity AND NOT c.relforcerowsecurity)
        FROM pg_catalog.pg_class c WHERE c.oid IN (
          'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
          'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
        WHERE c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
          AND acl.grantee<>c.relowner AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
        WHERE r.rolname IN ('anon','authenticated')
          AND c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
            'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
          AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index x
        JOIN pg_catalog.pg_class c ON c.oid=x.indrelid
        JOIN pg_catalog.pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=(x.indkey::smallint[])[0]
        WHERE c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
          'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
          AND a.attname<>'tenant_id')
    INTO replay_complete;
  END IF;

  IF replay_complete THEN
    PERFORM pg_catalog.set_config('novatrade.g005_replay','true',true);
    RETURN;
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attname='source_card_id'
      AND a.attrelid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass) AND NOT a.attisdropped)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace='public'::pg_catalog.regnamespace
      AND p.proname IN ('novatrade_source_payload_is_safe','novatrade_source_scope_guard'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname LIKE '%tenant_source%'
      AND c.conrelid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='public'::pg_catalog.regnamespace
      AND c.relname LIKE 'idx_%tenant_source%')
  INTO partial_catalog;
  IF partial_catalog THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_PARTIAL_OR_SPOOFED_CATALOG';
  END IF;

  IF NOT (SELECT count(*)=4 AND pg_catalog.bool_and(
      a.atttypid='uuid'::pg_catalog.regtype AND NOT a.attnotnull AND NOT a.atthasdef
      AND a.attidentity='' AND a.attgenerated='')
    FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
      ('public.place_cache'::pg_catalog.regclass,'tenant_id'),('public.places_master'::pg_catalog.regclass,'tenant_id'),
      ('public.place_observations'::pg_catalog.regclass,'tenant_id'),('public.api_usage_events'::pg_catalog.regclass,'tenant_id'))
      AND NOT a.attisdropped) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_BASE_TENANT_COLUMNS_INVALID';
  END IF;
  IF (SELECT count(*) FROM (
      VALUES
        ('public.place_cache'::pg_catalog.regclass,'place_cache_pkey','PRIMARY KEY (place_id)'),
        ('public.places_master'::pg_catalog.regclass,'places_master_pkey','PRIMARY KEY (place_id)'),
        ('public.place_observations'::pg_catalog.regclass,'place_observations_pkey','PRIMARY KEY (id)'),
        ('public.api_usage_events'::pg_catalog.regclass,'api_usage_events_pkey','PRIMARY KEY (id)')
    ) e(relid,conname,definition) JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
    WHERE c.contype='p' AND c.convalidated AND pg_catalog.pg_get_constraintdef(c.oid)=e.definition)<>4 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_BASE_IDENTITY_CATALOG_INVALID';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.oid IN (
      'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
      'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
      AND c.relrowsecurity)<>4
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
      'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
      'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
      WHERE r.rolname IN ('anon','authenticated') AND c.oid IN (
        'public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
        AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      WHERE c.oid IN ('public.place_cache'::pg_catalog.regclass,'public.places_master'::pg_catalog.regclass,
        'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
        AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
        AND acl.grantee<>c.relowner AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES')) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_BASE_RLS_OR_ACL_INVALID';
  END IF;

  IF ((SELECT count(*) FROM public.place_cache)+(SELECT count(*) FROM public.places_master)+
      (SELECT count(*) FROM public.place_observations)+(SELECT count(*) FROM public.api_usage_events))>0 THEN
    FOREACH target_table IN ARRAY ARRAY['place_cache','places_master','place_observations','api_usage_events'] LOOP
      EXECUTE pg_catalog.format(
        'SELECT count(*),pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-''tenant_id'')::text,''|'' ORDER BY (to_jsonb(t)-''tenant_id'')::text),''''),''UTF8'')),''hex'') FROM public.%I t',
        target_table) INTO row_count,row_checksum;
      counts:=counts||pg_catalog.jsonb_build_object(target_table,row_count);
      checksums:=checksums||pg_catalog.jsonb_build_object(target_table,row_checksum);
    END LOOP;
    SELECT count(*)::integer INTO receipt_count FROM public.compatibility_backfill_receipts r
      WHERE r.status='completed' AND r.completed_at IS NOT NULL AND r.source_engine='postgres'
        AND r.schema_version=1 AND r.checksum_algorithm='novatrade-postgres-jsonb-text-v1'
        AND r.relationship_orphan_count=0
        AND r.table_counts->'place_cache'=counts->'place_cache'
        AND r.table_counts->'places_master'=counts->'places_master'
        AND r.table_counts->'place_observations'=counts->'place_observations'
        AND r.table_counts->'api_usage_events'=counts->'api_usage_events'
        AND r.after_content_checksums->'place_cache'=checksums->'place_cache'
        AND r.after_content_checksums->'places_master'=checksums->'places_master'
        AND r.after_content_checksums->'place_observations'=checksums->'place_observations'
        AND r.after_content_checksums->'api_usage_events'=checksums->'api_usage_events';
    IF receipt_count=0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    IF receipt_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED'; END IF;
    SELECT r.tenant_id INTO STRICT receipt_tenant FROM public.compatibility_backfill_receipts r
      WHERE r.status='completed' AND r.completed_at IS NOT NULL AND r.source_engine='postgres'
        AND r.schema_version=1 AND r.checksum_algorithm='novatrade-postgres-jsonb-text-v1'
        AND r.relationship_orphan_count=0
        AND r.table_counts->'place_cache'=counts->'place_cache'
        AND r.table_counts->'places_master'=counts->'places_master'
        AND r.table_counts->'place_observations'=counts->'place_observations'
        AND r.table_counts->'api_usage_events'=counts->'api_usage_events'
        AND r.after_content_checksums->'place_cache'=checksums->'place_cache'
        AND r.after_content_checksums->'places_master'=checksums->'places_master'
        AND r.after_content_checksums->'place_observations'=checksums->'place_observations'
        AND r.after_content_checksums->'api_usage_events'=checksums->'api_usage_events';
    IF EXISTS (SELECT 1 FROM public.place_cache x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant)
       OR EXISTS (SELECT 1 FROM public.places_master x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant)
       OR EXISTS (SELECT 1 FROM public.place_observations x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant)
       OR EXISTS (SELECT 1 FROM public.api_usage_events x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_T028_RECEIPT_SCOPE_DRIFT';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.place_observations o LEFT JOIN public.places_master p
      ON (p.tenant_id,p.place_id)=(o.tenant_id,o.place_id) WHERE p.place_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.place_observations o LEFT JOIN public.crawl_runs r
      ON (r.tenant_id,r.id)=(o.tenant_id,o.crawl_run_id) WHERE o.crawl_run_id IS NOT NULL AND r.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.place_observations o LEFT JOIN public.crawl_units u
      ON (u.tenant_id,u.id)=(o.tenant_id,o.crawl_unit_id) WHERE o.crawl_unit_id IS NOT NULL AND u.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.place_observations o LEFT JOIN public.leads l
      ON (l.tenant_id,l.id,l.place_id)=(o.tenant_id,o.lead_id,o.place_id) WHERE o.lead_id IS NOT NULL AND l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.place_observations o JOIN public.crawl_units u ON u.id=o.crawl_unit_id
      WHERE o.crawl_run_id IS NOT NULL AND o.crawl_run_id IS DISTINCT FROM u.crawl_run_id)
     OR EXISTS (SELECT 1 FROM public.api_usage_events x LEFT JOIN public.crawl_runs r
      ON (r.tenant_id,r.id)=(x.tenant_id,x.crawl_run_id) WHERE x.crawl_run_id IS NOT NULL AND r.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.api_usage_events x LEFT JOIN public.crawl_units u
      ON (u.tenant_id,u.id)=(x.tenant_id,x.crawl_unit_id) WHERE x.crawl_unit_id IS NOT NULL AND u.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.api_usage_events x LEFT JOIN public.leads l
      ON (l.tenant_id,l.id)=(x.tenant_id,x.lead_id) WHERE x.lead_id IS NOT NULL AND l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.api_usage_events x JOIN public.crawl_units u ON u.id=x.crawl_unit_id
      WHERE x.crawl_run_id IS NOT NULL AND x.crawl_run_id IS DISTINCT FROM u.crawl_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_EXISTING_REFERENCE_SCOPE_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('novatrade.g005_replay','false',true);
END;
$g005_preflight$;

DO $g005_install$
DECLARE target_owner text;
BEGIN
  IF pg_catalog.current_setting('novatrade.g005_replay')='true' THEN RETURN; END IF;

  ALTER TABLE public.place_cache ADD COLUMN source_card_id text NOT NULL DEFAULT 'google_places_legacy';
  ALTER TABLE public.places_master ADD COLUMN source_card_id text NOT NULL DEFAULT 'google_places_legacy';
  ALTER TABLE public.place_observations ADD COLUMN source_card_id text NOT NULL DEFAULT 'google_places_legacy';
  ALTER TABLE public.api_usage_events ADD COLUMN source_card_id text NOT NULL DEFAULT 'google_places_legacy';

  ALTER TABLE public.place_cache ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE public.places_master ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE public.place_observations ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE public.api_usage_events ALTER COLUMN tenant_id SET NOT NULL;

  ALTER TABLE public.place_cache ADD CONSTRAINT place_cache_source_card_id_chk CHECK(source_card_id='google_places_legacy');
  ALTER TABLE public.places_master ADD CONSTRAINT places_master_source_card_id_chk CHECK(source_card_id='google_places_legacy');
  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_source_card_id_chk CHECK(source_card_id='google_places_legacy');
  ALTER TABLE public.api_usage_events ADD CONSTRAINT api_usage_events_source_card_id_chk CHECK(source_card_id='google_places_legacy');

  ALTER TABLE public.place_cache DROP CONSTRAINT place_cache_pkey;
  ALTER TABLE public.places_master DROP CONSTRAINT places_master_pkey;
  ALTER TABLE public.place_observations DROP CONSTRAINT place_observations_pkey;
  ALTER TABLE public.api_usage_events DROP CONSTRAINT api_usage_events_pkey;
  ALTER TABLE public.place_cache ADD CONSTRAINT place_cache_pkey PRIMARY KEY(tenant_id,source_card_id,place_id);
  ALTER TABLE public.places_master ADD CONSTRAINT places_master_pkey PRIMARY KEY(tenant_id,source_card_id,place_id);
  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_pkey PRIMARY KEY(tenant_id,source_card_id,id);
  ALTER TABLE public.api_usage_events ADD CONSTRAINT api_usage_events_pkey PRIMARY KEY(tenant_id,source_card_id,id);
  ALTER TABLE public.crawl_units ADD CONSTRAINT crawl_units_tenant_id_id_unique UNIQUE(tenant_id,id);

  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_tenant_source_place_fkey
    FOREIGN KEY(tenant_id,source_card_id,place_id) REFERENCES public.places_master(tenant_id,source_card_id,place_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_tenant_run_fkey
    FOREIGN KEY(tenant_id,crawl_run_id) REFERENCES public.crawl_runs(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(crawl_run_id);
  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_tenant_unit_fkey
    FOREIGN KEY(tenant_id,crawl_unit_id) REFERENCES public.crawl_units(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(crawl_unit_id);
  ALTER TABLE public.place_observations ADD CONSTRAINT place_observations_tenant_lead_fkey
    FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(lead_id);
  ALTER TABLE public.api_usage_events ADD CONSTRAINT api_usage_events_tenant_run_fkey
    FOREIGN KEY(tenant_id,crawl_run_id) REFERENCES public.crawl_runs(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(crawl_run_id);
  ALTER TABLE public.api_usage_events ADD CONSTRAINT api_usage_events_tenant_unit_fkey
    FOREIGN KEY(tenant_id,crawl_unit_id) REFERENCES public.crawl_units(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(crawl_unit_id);
  ALTER TABLE public.api_usage_events ADD CONSTRAINT api_usage_events_tenant_lead_fkey
    FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)
    ON UPDATE RESTRICT ON DELETE SET NULL(lead_id);

  EXECUTE $ddl$
    CREATE FUNCTION public.novatrade_source_payload_is_safe(value jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path = pg_catalog, public
    AS $function$
WITH RECURSIVE nodes(node) AS (
  SELECT coalesce(value,'null'::jsonb)
  UNION ALL
  SELECT child.node
  FROM nodes AS parent
  CROSS JOIN LATERAL (
    SELECT item.value AS node
    FROM pg_catalog.jsonb_each(CASE WHEN pg_catalog.jsonb_typeof(parent.node)='object' THEN parent.node ELSE '{}'::jsonb END) AS item
    UNION ALL
    SELECT item.value AS node
    FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(parent.node)='array' THEN parent.node ELSE '[]'::jsonb END) AS item
  ) AS child
)
SELECT NOT EXISTS (
  SELECT 1
  FROM nodes
  CROSS JOIN LATERAL pg_catalog.jsonb_each(CASE WHEN pg_catalog.jsonb_typeof(nodes.node)='object' THEN nodes.node ELSE '{}'::jsonb END) AS entry
  WHERE pg_catalog.lower(pg_catalog.regexp_replace(entry.key,'[^[:alnum:]]','','g')) IN (
        'review','reviews','reviewtext','reviewbody','reviewer','reviewername','authorattribution','authorname',
        'profilephoto','profilephotouri','relativepublishtimedescription','apikey','accesstoken','refreshtoken',
        'authorization','credential','credentials','password','passwd','secret','clientsecret','privatekey'
  )
)
$function$
  $ddl$;

  EXECUTE $ddl$
    CREATE FUNCTION public.novatrade_source_scope_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $function$
DECLARE
  authority_tenant uuid;
  candidate_tenant uuid;
  unit_run_id text;
  lead_place_id text;
  internal_fk_action boolean := pg_catalog.pg_trigger_depth()>1;
BEGIN
  IF NEW.source_card_id IS DISTINCT FROM 'google_places_legacy' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_SOURCE_CARD_REQUIRED';
  END IF;

  IF TG_TABLE_NAME='place_cache' OR TG_TABLE_NAME='places_master' THEN
    IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.source_card_id IS DISTINCT FROM OLD.source_card_id OR NEW.place_id IS DISTINCT FROM OLD.place_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PLACE_IDENTITY_IMMUTABLE';
    END IF;
    IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_TENANT_REQUIRED'; END IF;
    IF TG_TABLE_NAME='place_cache' THEN
      IF NOT public.novatrade_source_payload_is_safe(NEW.raw_json) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PROHIBITED_SOURCE_CONTENT';
      END IF;
    ELSE
      IF NOT public.novatrade_source_payload_is_safe(pg_catalog.jsonb_build_array(NEW.categories,NEW.review_highlights,NEW.website_health)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PROHIBITED_SOURCE_CONTENT';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.source_card_id IS DISTINCT FROM OLD.source_card_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_SCOPE_IMMUTABLE';
  END IF;

  IF NEW.crawl_run_id IS NOT NULL THEN
    SELECT r.tenant_id INTO candidate_tenant FROM public.crawl_runs r WHERE r.id=NEW.crawl_run_id FOR KEY SHARE;
    IF candidate_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G005_CRAWL_RUN_PARENT_REQUIRED'; END IF;
    authority_tenant:=candidate_tenant;
  END IF;
  IF NEW.crawl_unit_id IS NOT NULL THEN
    SELECT u.tenant_id,u.crawl_run_id INTO candidate_tenant,unit_run_id FROM public.crawl_units u WHERE u.id=NEW.crawl_unit_id FOR KEY SHARE;
    IF candidate_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G005_CRAWL_UNIT_PARENT_REQUIRED'; END IF;
    IF authority_tenant IS NOT NULL AND authority_tenant IS DISTINCT FROM candidate_tenant THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PARENT_TENANT_MISMATCH';
    END IF;
    IF NEW.crawl_run_id IS NOT NULL AND NEW.crawl_run_id IS DISTINCT FROM unit_run_id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_RUN_UNIT_MISMATCH';
    END IF;
    authority_tenant:=candidate_tenant;
  END IF;
  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.tenant_id,l.place_id INTO candidate_tenant,lead_place_id FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE;
    IF candidate_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G005_LEAD_PARENT_REQUIRED'; END IF;
    IF authority_tenant IS NOT NULL AND authority_tenant IS DISTINCT FROM candidate_tenant THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PARENT_TENANT_MISMATCH';
    END IF;
    authority_tenant:=candidate_tenant;
  END IF;

  IF TG_TABLE_NAME='place_observations' THEN
    IF TG_OP='UPDATE' AND NOT internal_fk_action AND (
      NEW.place_id IS DISTINCT FROM OLD.place_id OR NEW.crawl_run_id IS DISTINCT FROM OLD.crawl_run_id OR
      NEW.crawl_unit_id IS DISTINCT FROM OLD.crawl_unit_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_OBSERVATION_SCOPE_IMMUTABLE';
    END IF;
    IF lead_place_id IS NOT NULL AND lead_place_id IS DISTINCT FROM NEW.place_id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_LEAD_PLACE_MISMATCH';
    END IF;
    authority_tenant:=coalesce(authority_tenant,NEW.tenant_id);
    IF authority_tenant IS NULL THEN
      SELECT min(p.tenant_id) INTO authority_tenant FROM public.places_master p
       WHERE p.source_card_id=NEW.source_card_id AND p.place_id=NEW.place_id
       HAVING count(*)=1;
    END IF;
    IF authority_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.places_master p
      WHERE (p.tenant_id,p.source_card_id,p.place_id)=(authority_tenant,NEW.source_card_id,NEW.place_id) FOR KEY SHARE) THEN
      RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G005_PLACE_PARENT_REQUIRED';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM authority_tenant THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_TENANT_MISMATCH';
    END IF;
    NEW.tenant_id:=authority_tenant;
    IF NOT public.novatrade_source_payload_is_safe(NEW.raw_json) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PROHIBITED_SOURCE_CONTENT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' AND NOT internal_fk_action AND (
    NEW.crawl_run_id IS DISTINCT FROM OLD.crawl_run_id OR NEW.crawl_unit_id IS DISTINCT FROM OLD.crawl_unit_id OR NEW.lead_id IS DISTINCT FROM OLD.lead_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_USAGE_SCOPE_IMMUTABLE';
  END IF;
  IF authority_tenant IS NULL THEN
    IF TG_OP='INSERT' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_USAGE_RUNTIME_PARENT_REQUIRED';
    END IF;
    authority_tenant:=OLD.tenant_id;
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM authority_tenant THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_TENANT_MISMATCH';
  END IF;
  NEW.tenant_id:=authority_tenant;
  IF NOT public.novatrade_source_payload_is_safe(NEW.metadata) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G005_PROHIBITED_SOURCE_CONTENT';
  END IF;
  RETURN NEW;
END;
$function$
  $ddl$;

  SELECT r.rolname INTO target_owner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE c.oid='public.place_cache'::pg_catalog.regclass;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid IN (
      'public.places_master'::pg_catalog.regclass,'public.place_observations'::pg_catalog.regclass,'public.api_usage_events'::pg_catalog.regclass)
      AND c.relowner<>(SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.place_cache'::pg_catalog.regclass)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G005_TARGET_OWNER_MISMATCH';
  END IF;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_source_payload_is_safe(jsonb) OWNER TO %I',target_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_source_scope_guard() OWNER TO %I',target_owner);
END;
$g005_install$;

DO $g005_finalize$
BEGIN
  IF pg_catalog.current_setting('novatrade.g005_replay')='true' THEN RETURN; END IF;

  REVOKE ALL ON FUNCTION public.novatrade_source_payload_is_safe(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.novatrade_source_scope_guard() FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.novatrade_source_payload_is_safe(jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.novatrade_source_scope_guard() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.novatrade_source_payload_is_safe(jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION public.novatrade_source_scope_guard() FROM authenticated;
  END IF;

  DROP TRIGGER IF EXISTS trg_novatrade_place_cache_scope ON public.place_cache;
  DROP TRIGGER IF EXISTS trg_novatrade_places_master_scope ON public.places_master;
  DROP TRIGGER IF EXISTS trg_novatrade_place_observations_scope ON public.place_observations;
  DROP TRIGGER IF EXISTS trg_novatrade_api_usage_scope ON public.api_usage_events;
  CREATE TRIGGER trg_novatrade_place_cache_scope BEFORE INSERT OR UPDATE ON public.place_cache
    FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_scope_guard();
  CREATE TRIGGER trg_novatrade_places_master_scope BEFORE INSERT OR UPDATE ON public.places_master
    FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_scope_guard();
  CREATE TRIGGER trg_novatrade_place_observations_scope BEFORE INSERT OR UPDATE ON public.place_observations
    FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_scope_guard();
  CREATE TRIGGER trg_novatrade_api_usage_scope BEFORE INSERT OR UPDATE ON public.api_usage_events
    FOR EACH ROW EXECUTE FUNCTION public.novatrade_source_scope_guard();

  DROP INDEX IF EXISTS public.idx_places_master_last_seen;
  DROP INDEX IF EXISTS public.idx_places_master_quality;
  DROP INDEX IF EXISTS public.idx_place_observations_place_time;
  DROP INDEX IF EXISTS public.idx_place_observations_run_time;
  DROP INDEX IF EXISTS public.idx_api_usage_created;
  DROP INDEX IF EXISTS public.idx_api_usage_sku_created;
  DROP INDEX IF EXISTS public.idx_api_usage_run_created;
  DROP INDEX IF EXISTS public.idx_api_usage_endpoint_created;
  CREATE INDEX idx_places_master_tenant_source_last_seen ON public.places_master(tenant_id,source_card_id,last_seen_at DESC);
  CREATE INDEX idx_places_master_tenant_source_quality ON public.places_master(tenant_id,source_card_id,completeness_score DESC,freshness_score DESC);
  CREATE INDEX idx_place_observations_tenant_source_place_time ON public.place_observations(tenant_id,source_card_id,place_id,observed_at DESC);
  CREATE INDEX idx_place_observations_tenant_source_run_time ON public.place_observations(tenant_id,source_card_id,crawl_run_id,observed_at DESC);
  CREATE INDEX idx_place_observations_tenant_source_unit_time ON public.place_observations(tenant_id,source_card_id,crawl_unit_id,observed_at DESC);
  CREATE INDEX idx_place_observations_tenant_source_lead_time ON public.place_observations(tenant_id,source_card_id,lead_id,observed_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_created ON public.api_usage_events(tenant_id,source_card_id,created_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_sku_created ON public.api_usage_events(tenant_id,source_card_id,sku,created_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_run_created ON public.api_usage_events(tenant_id,source_card_id,crawl_run_id,created_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_unit_created ON public.api_usage_events(tenant_id,source_card_id,crawl_unit_id,created_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_lead_created ON public.api_usage_events(tenant_id,source_card_id,lead_id,created_at DESC);
  CREATE INDEX idx_api_usage_tenant_source_endpoint_created ON public.api_usage_events(tenant_id,source_card_id,endpoint,created_at DESC);

  ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.places_master ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.place_observations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.api_usage_events ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.place_cache,public.places_master,public.place_observations,public.api_usage_events FROM PUBLIC,anon,authenticated;
  COMMENT ON FUNCTION public.novatrade_source_payload_is_safe(jsonb) IS 'novatrade:g005:prohibited-source-content:v1';
  COMMENT ON FUNCTION public.novatrade_source_scope_guard() IS 'novatrade:g005:tenant-source-scope:v1; live runtime propagation remains G020/G021/G022.';
  COMMENT ON COLUMN public.place_cache.source_card_id IS 'Source identity only: google_places_legacy. Not connector activation or licensing authorization.';
  COMMENT ON COLUMN public.places_master.source_card_id IS 'Source identity only: google_places_legacy. Not connector activation or licensing authorization.';
  COMMENT ON COLUMN public.place_observations.source_card_id IS 'Source identity only: google_places_legacy. Not connector activation or licensing authorization.';
  COMMENT ON COLUMN public.api_usage_events.source_card_id IS 'Source identity only: google_places_legacy. Not connector activation or licensing authorization.';
END;
$g005_finalize$;

COMMIT;
