-- G-003: finalize tenant scope for leads and their CRM children.
-- T-028 is the only authority for assigning legacy ownership. A non-empty
-- upgrade must carry one exact completed PostgreSQL T-028 receipt unless the
-- complete, definition-aware G-003 catalog already proves a true replay.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:g003:lead-crm-tenant-scope'));

-- Receipt, membership, and target-row validation must observe one stable
-- snapshot. These writer-conflicting locks are held until the final COMMIT.
LOCK TABLE
  public.compatibility_backfill_receipts,
  public.tenant_memberships,
  public.leads,
  public.lead_notes,
  public.outreach_events,
  public.admin_requests,
  public.demos
IN SHARE ROW EXCLUSIVE MODE;
-- G003_WRITER_LOCKS_ACQUIRED

DO $g003_preflight$
DECLARE
  table_name text;
  row_count bigint;
  row_checksum text;
  counts jsonb := '{}'::jsonb;
  checksums jsonb := '{}'::jsonb;
  receipt_count integer;
  receipt_tenant uuid;
  receipt_workspace uuid;
  replay_complete boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['leads','lead_notes','outreach_events','admin_requests','demos'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = pg_catalog.format('G003_REQUIRED_TABLE_MISSING:%s', table_name);
    END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure('public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('public.novatrade_inherit_lead_child_scope()') IS NULL
     OR pg_catalog.to_regprocedure('public.novatrade_lead_scope_guard()') IS NULL
     OR pg_catalog.to_regprocedure('public.novatrade_published_demo_public(text)') IS NULL
     OR pg_catalog.to_regclass('public.idx_lead_notes_tenant_lead_created') IS NULL
     OR pg_catalog.to_regclass('public.idx_outreach_events_tenant_lead_created') IS NULL
     OR pg_catalog.to_regclass('public.idx_admin_requests_tenant_lead_created') IS NULL
     OR pg_catalog.to_regclass('public.idx_demos_tenant_lead') IS NULL
     OR pg_catalog.to_regclass('public.admin_requests_tenant_lead_open_unique') IS NULL THEN
    replay_complete := false;
  ELSE
  SELECT
    (SELECT count(*) = 5 AND pg_catalog.bool_and(a.attnotnull)
       FROM pg_catalog.pg_attribute a
      WHERE (a.attrelid,a.attname) IN (
        ('public.leads'::regclass,'tenant_id'),
        ('public.lead_notes'::regclass,'tenant_id'),
        ('public.outreach_events'::regclass,'tenant_id'),
        ('public.admin_requests'::regclass,'tenant_id'),
        ('public.demos'::regclass,'tenant_id')
      ) AND NOT a.attisdropped)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.leads'::regclass AND a.attname = 'workspace_id' AND NOT a.attisdropped
    )
    AND (SELECT count(*) = 4 FROM pg_catalog.pg_attribute a
          WHERE (a.attrelid,a.attname) IN (
            ('public.lead_notes'::regclass,'workspace_id'),
            ('public.outreach_events'::regclass,'workspace_id'),
            ('public.admin_requests'::regclass,'workspace_id'),
            ('public.demos'::regclass,'workspace_id')
          ) AND NOT a.attisdropped)
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid = 'public.leads'::regclass
         AND c.conname = 'leads_tenant_id_id_unique'
         AND c.contype = 'u'
         AND c.convalidated
         AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, id)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid = 'public.leads'::regclass
         AND c.conname = 'leads_tenant_place_id_unique'
         AND c.contype = 'u'
         AND c.convalidated
         AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, place_id)'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid = 'public.leads'::regclass
         AND c.contype = 'u'
         AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.leads'::regclass AND a.attname='place_id')]
    )
    AND (SELECT count(*) = 4
           FROM pg_catalog.pg_constraint c
          WHERE (c.conrelid,c.conname) IN (
            ('public.lead_notes'::regclass,'lead_notes_tenant_lead_fkey'),
            ('public.outreach_events'::regclass,'outreach_events_tenant_lead_fkey'),
            ('public.admin_requests'::regclass,'admin_requests_tenant_lead_fkey'),
            ('public.demos'::regclass,'demos_tenant_lead_fkey')
          )
             AND c.contype = 'f'
             AND c.convalidated
             AND c.confrelid = 'public.leads'::regclass
             AND c.conkey = ARRAY[
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='tenant_id'),
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='lead_id')
             ]::smallint[]
             AND c.confkey = ARRAY[
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.leads'::regclass AND a.attname='tenant_id'),
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.leads'::regclass AND a.attname='id')
             ]::smallint[]
             AND c.confmatchtype='s' AND c.confupdtype='r' AND c.confdeltype='c'
             AND NOT c.condeferrable AND NOT c.condeferred)
    AND (SELECT count(*) = 4
           FROM pg_catalog.pg_constraint c
          WHERE (c.conrelid,c.conname) IN (
            ('public.lead_notes'::regclass,'lead_notes_tenant_workspace_fkey'),
            ('public.outreach_events'::regclass,'outreach_events_tenant_workspace_fkey'),
            ('public.admin_requests'::regclass,'admin_requests_tenant_workspace_fkey'),
            ('public.demos'::regclass,'demos_tenant_workspace_fkey')
          )
             AND c.contype = 'f'
             AND c.convalidated
             AND c.confrelid = 'public.workspaces'::regclass
             AND c.conkey = ARRAY[
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='tenant_id'),
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='workspace_id')
             ]::smallint[]
             AND c.confkey = ARRAY[
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.workspaces'::regclass AND a.attname='tenant_id'),
               (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.workspaces'::regclass AND a.attname='id')
             ]::smallint[]
             AND c.confmatchtype='s' AND c.confupdtype='r' AND c.confdeltype='r'
             AND NOT c.condeferrable AND NOT c.condeferred)
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid='public.demos'::regclass AND c.contype='u'
         AND c.convalidated
         AND c.conkey=ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.demos'::regclass AND a.attname='slug')]
    )
    AND (SELECT count(*) = 5
           FROM pg_catalog.pg_class i
           JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
          WHERE i.relnamespace='public'::regnamespace
            AND i.relname IN (
              'idx_lead_notes_tenant_lead_created',
              'idx_outreach_events_tenant_lead_created',
              'idx_admin_requests_tenant_lead_created',
              'idx_demos_tenant_lead',
              'admin_requests_tenant_lead_open_unique'
            )
            AND x.indisvalid AND x.indisready)
    AND pg_catalog.pg_get_indexdef('public.idx_lead_notes_tenant_lead_created'::regclass) = 'CREATE INDEX idx_lead_notes_tenant_lead_created ON public.lead_notes USING btree (tenant_id, lead_id, created_at DESC)'
    AND pg_catalog.pg_get_indexdef('public.idx_outreach_events_tenant_lead_created'::regclass) = 'CREATE INDEX idx_outreach_events_tenant_lead_created ON public.outreach_events USING btree (tenant_id, lead_id, created_at DESC)'
    AND pg_catalog.pg_get_indexdef('public.idx_admin_requests_tenant_lead_created'::regclass) = 'CREATE INDEX idx_admin_requests_tenant_lead_created ON public.admin_requests USING btree (tenant_id, lead_id, created_at DESC)'
    AND pg_catalog.pg_get_indexdef('public.idx_demos_tenant_lead'::regclass) = 'CREATE INDEX idx_demos_tenant_lead ON public.demos USING btree (tenant_id, lead_id)'
    AND (SELECT x.indisunique AND x.indisvalid AND x.indisready
           AND x.indrelid='public.admin_requests'::regclass
           AND x.indnkeyatts=3 AND x.indnatts=3
           AND x.indkey[0]=(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.admin_requests'::regclass AND a.attname='tenant_id')
           AND x.indkey[1]=(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.admin_requests'::regclass AND a.attname='lead_id')
           AND x.indkey[2]=(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.admin_requests'::regclass AND a.attname='request_type')
           AND x.indexprs IS NULL
           AND i.relam=(SELECT a.oid FROM pg_catalog.pg_am a WHERE a.amname='btree')
           AND pg_catalog.pg_get_expr(x.indpred,x.indrelid) = '(status = ANY (ARRAY[''new''::text, ''seen''::text, ''in_progress''::text, ''waiting_on_researcher''::text]))'
           AND pg_catalog.pg_get_indexdef(x.indexrelid) = 'CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique ON public.admin_requests USING btree (tenant_id, lead_id, request_type) WHERE (status = ANY (ARRAY[''new''::text, ''seen''::text, ''in_progress''::text, ''waiting_on_researcher''::text]))'
           FROM pg_catalog.pg_index x
           JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
          WHERE x.indexrelid='public.admin_requests_tenant_lead_open_unique'::regclass)
    AND (SELECT count(*) = 5
           FROM pg_catalog.pg_trigger t
          WHERE (t.tgrelid,t.tgname,t.tgfoid) IN (
            ('public.leads'::regclass,'trg_novatrade_lead_scope_guard','public.novatrade_lead_scope_guard()'::regprocedure),
            ('public.lead_notes'::regclass,'trg_novatrade_lead_notes_scope','public.novatrade_inherit_lead_child_scope()'::regprocedure),
            ('public.outreach_events'::regclass,'trg_novatrade_outreach_events_scope','public.novatrade_inherit_lead_child_scope()'::regprocedure),
            ('public.admin_requests'::regclass,'trg_novatrade_admin_requests_scope','public.novatrade_inherit_lead_child_scope()'::regprocedure),
            ('public.demos'::regclass,'trg_novatrade_demos_scope','public.novatrade_inherit_lead_child_scope()'::regprocedure)
          )
            AND NOT t.tgisinternal
            AND t.tgenabled='O'
            AND t.tgtype=23
            AND t.tgnargs=0
            AND t.tgqual IS NULL
            AND t.tgoldtable IS NULL
            AND t.tgnewtable IS NULL
            AND (
              t.tgrelid<>'public.leads'::regclass
              OR (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                    FROM pg_catalog.unnest(t.tgattr::smallint[]) WITH ORDINALITY u(attnum,ordinality)
                    JOIN pg_catalog.pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=u.attnum)
                 = ARRAY['tenant_id','assigned_to_user_id','archived_by_user_id','quality_checked_by_user_id']
            )
            AND (t.tgrelid='public.leads'::regclass OR pg_catalog.cardinality(t.tgattr::smallint[])=0))
    AND (SELECT count(*) = 4
           FROM pg_catalog.pg_proc p
          WHERE p.oid IN (
            'public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)'::regprocedure,
            'public.novatrade_inherit_lead_child_scope()'::regprocedure,
            'public.novatrade_lead_scope_guard()'::regprocedure,
            'public.novatrade_published_demo_public(text)'::regprocedure
          )
            AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='public.leads'::regclass)
            AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
            AND p.prokind='f'
            AND NOT p.proisstrict
            AND NOT p.proleakproof
            AND p.proparallel='u')
    AND (SELECT l.lanname='plpgsql' AND p.prorettype='void'::regtype AND NOT p.proretset
                AND p.provolatile='v' AND NOT p.prosecdef
           FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid='public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)'::regprocedure)
    AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::regtype AND NOT p.proretset
                AND p.provolatile='v' AND NOT p.prosecdef
           FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid='public.novatrade_inherit_lead_child_scope()'::regprocedure)
    AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::regtype AND NOT p.proretset
                AND p.provolatile='v' AND NOT p.prosecdef
           FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid='public.novatrade_lead_scope_guard()'::regprocedure)
    AND (SELECT l.lanname='sql' AND p.prorettype='record'::regtype AND p.proretset
                AND p.provolatile='s' AND p.prosecdef
                AND pg_catalog.pg_get_function_result(p.oid)='TABLE(slug text, template_id text, config_json jsonb, name text, address text, phone text, maps_uri text, rating double precision, review_count integer, selling_niche text)'
           FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid='public.novatrade_published_demo_public(text)'::regprocedure)
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(
          (SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)'::regprocedure),
          pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='e905e45b5608e69f48f349281deed79eb80f156ef57b42b5dedd97282a8539e6'
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(
          (SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_inherit_lead_child_scope()'::regprocedure),
          pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='b32596ecbea0604c4d243bf957ff355d80afae1d21edb8841016b54f8cc13f78'
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(
          (SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_lead_scope_guard()'::regprocedure),
          pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='b1e8a0dfad0eea52cde6ae77a5090f16410173a356c66ed9c536964bdc12f96d'
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(
          (SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_published_demo_public(text)'::regprocedure),
          pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='806aabf2f0a019b6728978e5ace7e5b3d6f29ecd019689a2eabfc98457b21c83'
    AND pg_catalog.obj_description('public.novatrade_published_demo_public(text)'::regprocedure,'pg_proc') = 'novatrade:g003:published-demo-public:v1'
    AND (SELECT count(*) = 5 FROM pg_catalog.pg_class c
          WHERE c.oid IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
            AND c.relrowsecurity)
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
       WHERE n.nspname='public'
         AND c.relname IN ('leads','lead_notes','outreach_events','admin_requests','demos')
         AND acl.grantee=0
         AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_roles r
        CROSS JOIN pg_catalog.pg_class c
       WHERE r.rolname IN ('anon','authenticated')
         AND c.oid IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
         AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_roles r
       WHERE r.rolname='anon'
         AND NOT pg_catalog.has_function_privilege(r.oid,'public.novatrade_published_demo_public(text)'::regprocedure,'EXECUTE')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_roles r
       WHERE r.rolname='authenticated'
         AND pg_catalog.has_function_privilege(r.oid,'public.novatrade_published_demo_public(text)'::regprocedure,'EXECUTE')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_roles r
        CROSS JOIN pg_catalog.pg_proc p
       WHERE r.rolname IN ('anon','authenticated')
         AND p.oid IN (
           'public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)'::regprocedure,
           'public.novatrade_inherit_lead_child_scope()'::regprocedure,
           'public.novatrade_lead_scope_guard()'::regprocedure
         )
         AND pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
       WHERE p.oid IN (
         'public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)'::regprocedure,
         'public.novatrade_inherit_lead_child_scope()'::regprocedure,
         'public.novatrade_lead_scope_guard()'::regprocedure,
         'public.novatrade_published_demo_public(text)'::regprocedure
       )
         AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
  INTO replay_complete;
  END IF;

  IF NOT replay_complete AND (
    (SELECT count(*) FROM public.leads) +
    (SELECT count(*) FROM public.lead_notes) +
    (SELECT count(*) FROM public.outreach_events) +
    (SELECT count(*) FROM public.admin_requests) +
    (SELECT count(*) FROM public.demos)
  ) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.lead_notes WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.outreach_events WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.admin_requests WHERE tenant_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.demos WHERE tenant_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_UNRECONCILED_T028_SCOPE';
    END IF;

    FOREACH table_name IN ARRAY ARRAY['leads','lead_notes','outreach_events','admin_requests','demos'] LOOP
      EXECUTE pg_catalog.format(
        'SELECT count(*), pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-''tenant_id''-''workspace_id'')::text,''|'' ORDER BY (to_jsonb(t)-''tenant_id''-''workspace_id'')::text),''''),''UTF8'')),''hex'') FROM public.%I t',
        table_name
      ) INTO row_count,row_checksum;
      counts := counts || pg_catalog.jsonb_build_object(table_name,row_count);
      checksums := checksums || pg_catalog.jsonb_build_object(table_name,row_checksum);
    END LOOP;

    SELECT count(*)::integer INTO receipt_count
      FROM public.compatibility_backfill_receipts r
     WHERE r.status='completed'
       AND r.source_engine='postgres'
       AND r.schema_version=1
       AND r.checksum_algorithm='novatrade-postgres-jsonb-text-v1'
       AND r.relationship_orphan_count=0
       AND r.table_counts->'leads'=counts->'leads'
       AND r.table_counts->'lead_notes'=counts->'lead_notes'
       AND r.table_counts->'outreach_events'=counts->'outreach_events'
       AND r.table_counts->'admin_requests'=counts->'admin_requests'
       AND r.table_counts->'demos'=counts->'demos'
       AND r.after_content_checksums->'leads'=checksums->'leads'
       AND r.after_content_checksums->'lead_notes'=checksums->'lead_notes'
       AND r.after_content_checksums->'outreach_events'=checksums->'outreach_events'
       AND r.after_content_checksums->'admin_requests'=checksums->'admin_requests'
       AND r.after_content_checksums->'demos'=checksums->'demos';
    IF receipt_count=0 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_MATCHING_T028_RECEIPT_REQUIRED';
    END IF;
    IF receipt_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED';
    END IF;

    SELECT r.tenant_id,r.workspace_id INTO STRICT receipt_tenant,receipt_workspace
      FROM public.compatibility_backfill_receipts r
     WHERE r.status='completed'
       AND r.source_engine='postgres'
       AND r.schema_version=1
       AND r.checksum_algorithm='novatrade-postgres-jsonb-text-v1'
       AND r.relationship_orphan_count=0
       AND r.table_counts->'leads'=counts->'leads'
       AND r.table_counts->'lead_notes'=counts->'lead_notes'
       AND r.table_counts->'outreach_events'=counts->'outreach_events'
       AND r.table_counts->'admin_requests'=counts->'admin_requests'
       AND r.table_counts->'demos'=counts->'demos'
       AND r.after_content_checksums->'leads'=checksums->'leads'
       AND r.after_content_checksums->'lead_notes'=checksums->'lead_notes'
       AND r.after_content_checksums->'outreach_events'=checksums->'outreach_events'
       AND r.after_content_checksums->'admin_requests'=checksums->'admin_requests'
       AND r.after_content_checksums->'demos'=checksums->'demos';
    IF EXISTS (SELECT 1 FROM public.leads x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant)
       OR EXISTS (SELECT 1 FROM public.lead_notes x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.outreach_events x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.admin_requests x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.demos x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_T028_RECEIPT_SCOPE_DRIFT';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.lead_notes c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.outreach_events c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.admin_requests c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.demos c LEFT JOIN public.leads p ON (p.tenant_id,p.id)=(c.tenant_id,c.lead_id) WHERE p.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_LEAD_CHILD_ORPHAN_OR_SCOPE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leads l
    CROSS JOIN LATERAL (VALUES (l.assigned_to_user_id::text),(l.archived_by_user_id::text),(l.quality_checked_by_user_id::text)) actor(id)
    WHERE actor.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
       WHERE m.tenant_id=l.tenant_id AND m.auth_identity_id::text=actor.id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.lead_notes c
    CROSS JOIN LATERAL (VALUES (c.author_user_id::text)) actor(id)
    WHERE actor.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
       WHERE m.tenant_id=c.tenant_id AND m.auth_identity_id::text=actor.id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.outreach_events c
    CROSS JOIN LATERAL (VALUES (c.actor_user_id::text)) actor(id)
    WHERE actor.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
       WHERE m.tenant_id=c.tenant_id AND m.auth_identity_id::text=actor.id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.admin_requests c
    CROSS JOIN LATERAL (VALUES (c.created_by_user_id::text),(c.assigned_admin_user_id::text)) actor(id)
    WHERE actor.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
       WHERE m.tenant_id=c.tenant_id AND m.auth_identity_id::text=actor.id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.demos c
    CROSS JOIN LATERAL (VALUES (c.published_by_user_id::text),(c.unpublished_by_user_id::text),(c.revoked_by_user_id::text)) actor(id)
    WHERE actor.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m
       WHERE m.tenant_id=c.tenant_id AND m.auth_identity_id::text=actor.id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G003_EXISTING_ACTOR_SCOPE_INVALID';
  END IF;
END;
$g003_preflight$;

DO $g003_constraints$
DECLARE r record; child_table text;
BEGIN
  FOR r IN
    SELECT c.conname,c.conrelid::regclass::text AS tbl
      FROM pg_catalog.pg_constraint c
     WHERE c.contype='f'
       AND c.conrelid IN ('public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
       AND c.confrelid='public.leads'::regclass
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);
  END LOOP;
  FOR r IN
    SELECT c.conname
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid='public.leads'::regclass AND c.contype='u'
       AND c.conkey=ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.leads'::regclass AND a.attname='place_id')]
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.leads DROP CONSTRAINT %I',r.conname);
  END LOOP;

  ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tenant_id_id_unique;
  ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tenant_place_id_unique;
  ALTER TABLE public.leads ADD CONSTRAINT leads_tenant_id_id_unique UNIQUE(tenant_id,id);
  ALTER TABLE public.leads ADD CONSTRAINT leads_tenant_place_id_unique UNIQUE(tenant_id,place_id);

  FOREACH child_table IN ARRAY ARRAY['lead_notes','outreach_events','admin_requests','demos'] LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE',
      child_table,child_table||'_tenant_lead_fkey'
    );
  END LOOP;
END;
$g003_constraints$;

ALTER TABLE public.leads ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lead_notes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.outreach_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.admin_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.demos ALTER COLUMN tenant_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.novatrade_assert_lead_actor(
  p_tenant uuid,p_workspace uuid,p_actor text,p_child boolean
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $f$
BEGIN
  IF p_actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
     WHERE m.tenant_id=p_tenant
       AND m.auth_identity_id::text=p_actor
       AND m.status='active'
       AND (NOT p_child OR m.workspace_id IS NULL OR m.workspace_id IS NOT DISTINCT FROM p_workspace)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED';
  END IF;
END;
$f$;

CREATE OR REPLACE FUNCTION public.novatrade_inherit_lead_child_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $f$
DECLARE parent_tenant uuid;
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.lead_id IS DISTINCT FROM OLD.lead_id OR
    NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G003_LEAD_CHILD_SCOPE_IMMUTABLE';
  END IF;
  SELECT l.tenant_id INTO parent_tenant FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE;
  IF parent_tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G003_LEAD_PARENT_REQUIRED';
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G003_LEAD_CHILD_TENANT_MISMATCH';
  END IF;
  NEW.tenant_id:=parent_tenant;
  IF TG_TABLE_NAME='lead_notes' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.author_user_id::text,true);
    ELSIF NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.author_user_id::text,true);
    END IF;
  ELSIF TG_TABLE_NAME='outreach_events' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.actor_user_id::text,true);
    ELSIF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.actor_user_id::text,true);
    END IF;
  ELSIF TG_TABLE_NAME='admin_requests' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.created_by_user_id::text,true);
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.assigned_admin_user_id::text,true);
    ELSE
      IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
        PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.created_by_user_id::text,true);
      END IF;
      IF NEW.assigned_admin_user_id IS DISTINCT FROM OLD.assigned_admin_user_id THEN
        PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.assigned_admin_user_id::text,true);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='demos' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.published_by_user_id::text,true);
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.unpublished_by_user_id::text,true);
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.revoked_by_user_id::text,true);
    ELSE
      IF NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id THEN
        PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.published_by_user_id::text,true);
      END IF;
      IF NEW.unpublished_by_user_id IS DISTINCT FROM OLD.unpublished_by_user_id THEN
        PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.unpublished_by_user_id::text,true);
      END IF;
      IF NEW.revoked_by_user_id IS DISTINCT FROM OLD.revoked_by_user_id THEN
        PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NEW.workspace_id,NEW.revoked_by_user_id::text,true);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;

CREATE OR REPLACE FUNCTION public.novatrade_lead_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $f$
BEGIN
  IF TG_OP='UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G003_LEAD_TENANT_IMMUTABLE';
  END IF;
  IF TG_OP='INSERT' THEN
    PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.assigned_to_user_id::text,false);
    PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.archived_by_user_id::text,false);
    PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.quality_checked_by_user_id::text,false);
  ELSE
    IF NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.assigned_to_user_id::text,false);
    END IF;
    IF NEW.archived_by_user_id IS DISTINCT FROM OLD.archived_by_user_id THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.archived_by_user_id::text,false);
    END IF;
    IF NEW.quality_checked_by_user_id IS DISTINCT FROM OLD.quality_checked_by_user_id THEN
      PERFORM public.novatrade_assert_lead_actor(NEW.tenant_id,NULL,NEW.quality_checked_by_user_id::text,false);
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;

DO $g003_private_function_owners$
DECLARE target_owner text;
BEGIN
  SELECT r.rolname INTO STRICT target_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
   WHERE c.oid='public.leads'::regclass;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_assert_lead_actor(uuid,uuid,text,boolean) OWNER TO %I',target_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_inherit_lead_child_scope() OWNER TO %I',target_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_lead_scope_guard() OWNER TO %I',target_owner);
END;
$g003_private_function_owners$;

REVOKE ALL ON FUNCTION public.novatrade_assert_lead_actor(uuid,uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_inherit_lead_child_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.novatrade_lead_scope_guard() FROM PUBLIC;
DO $g003_private_function_roles$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.novatrade_assert_lead_actor(uuid,uuid,text,boolean) FROM anon;
    REVOKE ALL ON FUNCTION public.novatrade_inherit_lead_child_scope() FROM anon;
    REVOKE ALL ON FUNCTION public.novatrade_lead_scope_guard() FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.novatrade_assert_lead_actor(uuid,uuid,text,boolean) FROM authenticated;
    REVOKE ALL ON FUNCTION public.novatrade_inherit_lead_child_scope() FROM authenticated;
    REVOKE ALL ON FUNCTION public.novatrade_lead_scope_guard() FROM authenticated;
  END IF;
END;
$g003_private_function_roles$;

DROP TRIGGER IF EXISTS trg_novatrade_lead_scope_immutable ON public.leads;
DROP TRIGGER IF EXISTS trg_novatrade_lead_scope_guard ON public.leads;
CREATE TRIGGER trg_novatrade_lead_scope_guard
BEFORE INSERT OR UPDATE OF tenant_id,assigned_to_user_id,archived_by_user_id,quality_checked_by_user_id
ON public.leads FOR EACH ROW EXECUTE FUNCTION public.novatrade_lead_scope_guard();

DO $g003_child_triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['lead_notes','outreach_events','admin_requests','demos'] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_novatrade_%I_scope ON public.%I',table_name,table_name);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_novatrade_%I_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.novatrade_inherit_lead_child_scope()',
      table_name,table_name
    );
  END LOOP;
END;
$g003_child_triggers$;

DROP INDEX IF EXISTS public.idx_leads_tenant_place_id;
DROP INDEX IF EXISTS public.idx_lead_notes_tenant_lead_created;
DROP INDEX IF EXISTS public.idx_outreach_events_tenant_lead_created;
DROP INDEX IF EXISTS public.idx_admin_requests_tenant_lead_created;
DROP INDEX IF EXISTS public.idx_demos_tenant_lead;
DROP INDEX IF EXISTS public.idx_admin_requests_open_unique;
DROP INDEX IF EXISTS public.admin_requests_tenant_lead_open_unique;
CREATE INDEX idx_lead_notes_tenant_lead_created ON public.lead_notes(tenant_id,lead_id,created_at DESC);
CREATE INDEX idx_outreach_events_tenant_lead_created ON public.outreach_events(tenant_id,lead_id,created_at DESC);
CREATE INDEX idx_admin_requests_tenant_lead_created ON public.admin_requests(tenant_id,lead_id,created_at DESC);
CREATE INDEX idx_demos_tenant_lead ON public.demos(tenant_id,lead_id);
CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique
  ON public.admin_requests(tenant_id,lead_id,request_type)
  WHERE status IN ('new','seen','in_progress','waiting_on_researcher');

CREATE OR REPLACE FUNCTION public.novatrade_published_demo_public(p_slug text)
RETURNS TABLE(
  slug text,template_id text,config_json jsonb,name text,address text,phone text,
  maps_uri text,rating double precision,review_count integer,selling_niche text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $f$
  SELECT
    d.slug,
    d.template_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'headline',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'headline') IN ('string','null') THEN d.config_json->'headline' END,
      'subheadline',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'subheadline') IN ('string','null') THEN d.config_json->'subheadline' END,
      'services',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'services')='array' THEN
        CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(d.config_json->'services') AS item(value) WHERE pg_catalog.jsonb_typeof(value)<>'string') THEN d.config_json->'services' END
      END,
      'trustSignals',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'trustSignals')='array' THEN
        CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(d.config_json->'trustSignals') AS item(value) WHERE pg_catalog.jsonb_typeof(value)<>'string') THEN d.config_json->'trustSignals' END
      END,
      'primaryCta',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'primaryCta') IN ('string','null') THEN d.config_json->'primaryCta' END,
      'secondaryCta',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'secondaryCta') IN ('string','null') THEN d.config_json->'secondaryCta' END,
      'websiteGap',CASE WHEN pg_catalog.jsonb_typeof(d.config_json->'websiteGap') IN ('string','null') THEN d.config_json->'websiteGap' END
    )),
    l.name,l.address,l.phone,l.maps_uri,l.rating,l.review_count,l.selling_niche
  FROM public.demos d
  JOIN public.leads l ON (l.tenant_id,l.id)=(d.tenant_id,d.lead_id)
  WHERE d.slug=p_slug AND d.is_published=1 AND d.revoked_at IS NULL
$f$;
DO $g003_public_function_owner$
DECLARE target_owner text;
BEGIN
  SELECT r.rolname INTO STRICT target_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
   WHERE c.oid='public.leads'::regclass;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_published_demo_public(text) OWNER TO %I',target_owner);
END;
$g003_public_function_owner$;
COMMENT ON FUNCTION public.novatrade_published_demo_public(text) IS 'novatrade:g003:published-demo-public:v1';
REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(text) FROM PUBLIC;
DO $g003_public_function_roles$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.novatrade_published_demo_public(text) TO anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(text) FROM authenticated;
  END IF;
END;
$g003_public_function_roles$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos FROM PUBLIC;
DO $g003_base_table_roles$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos FROM authenticated;
  END IF;
END;
$g003_base_table_roles$;

COMMIT;
