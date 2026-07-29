-- G-004A: structural tenant scope for AI-owned records.
-- worker_runs deliberately remains platform-global and is never authority for
-- AI scope. Its result_json can still contain tenant content; authoritative
-- runtime correlation and content redaction remain the G-004B blocker.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novatrade:g004a:ai-tenant-scope-worker-envelope'));

-- Receipt, parent, membership, workspace, and target validation share one
-- stable snapshot. The order is fixed and every lock conflicts with writers.
LOCK TABLE
  public.compatibility_backfill_receipts,
  public.workspaces,
  public.tenant_memberships,
  public.leads,
  public.ai_lead_verifications,
  public.lead_ai_artifacts,
  public.ai_feedback_events,
  public.ai_usage_events
IN SHARE ROW EXCLUSIVE MODE;
-- G004A_WRITER_LOCKS_ACQUIRED

DO $g004a_preflight$
DECLARE
  target_table text;
  row_count bigint;
  row_checksum text;
  counts jsonb := '{}'::jsonb;
  checksums jsonb := '{}'::jsonb;
  receipt_count integer;
  receipt_tenant uuid;
  receipt_workspace uuid;
  replay_complete boolean := false;
  partial_catalog boolean := false;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'ai_lead_verifications','lead_ai_artifacts','ai_feedback_events','ai_usage_events'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I',target_table)) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=pg_catalog.format('G004A_REQUIRED_TABLE_MISSING:%s',target_table);
    END IF;
  END LOOP;

  -- Complete replay is an exact catalog identity, not a set of familiar names.
  IF pg_catalog.to_regprocedure('public.novatrade_ai_scope_guard()') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_ai_verifications_tenant_lead_created') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_ai_artifacts_tenant_queue') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_ai_feedback_tenant_lead_created') IS NOT NULL
     AND pg_catalog.to_regclass('public.idx_ai_usage_tenant_created') IS NOT NULL THEN
    SELECT
      -- Exact G-004A columns: UUID, required tenant, optional workspace,
      -- no defaults, generated values, or identities.
      (SELECT count(*)=7 AND pg_catalog.bool_and(
          a.atttypid='uuid'::pg_catalog.regtype AND a.atttypmod=-1
          AND a.attidentity='' AND a.attgenerated=''
          AND a.atthasdef=false
          AND (a.attname='tenant_id' OR NOT a.attnotnull)
        )
         FROM pg_catalog.pg_attribute a
        WHERE (a.attrelid,a.attname) IN (
          ('public.ai_lead_verifications'::pg_catalog.regclass,'tenant_id'),
          ('public.ai_lead_verifications'::pg_catalog.regclass,'workspace_id'),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'tenant_id'),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'workspace_id'),
          ('public.ai_feedback_events'::pg_catalog.regclass,'tenant_id'),
          ('public.ai_feedback_events'::pg_catalog.regclass,'workspace_id'),
          ('public.ai_usage_events'::pg_catalog.regclass,'tenant_id')
        ) AND NOT a.attisdropped)
      -- Exact composite identity constraints used by optional references.
      AND (SELECT count(*)=2 FROM pg_catalog.pg_constraint c
        WHERE (c.conrelid,c.conname) IN (
          ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_id_id_unique'),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_id_id_unique')
        ) AND c.contype='u' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
          AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
                 FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)
              =ARRAY['tenant_id','id']::text[])
      -- Exact compound G-004A parent/reference constraints, including PG16
      -- column-list SET NULL actions that preserve required tenant_id.
      AND (SELECT count(*)=7 FROM (
        VALUES
          ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'c'::"char",NULL::text[]),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'c'::"char",NULL::text[]),
          ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_lead_fkey','public.leads'::pg_catalog.regclass,ARRAY['tenant_id','lead_id']::text[],ARRAY['tenant_id','id']::text[],'c'::"char",NULL::text[]),
          ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_verification_fkey','public.ai_lead_verifications'::pg_catalog.regclass,ARRAY['tenant_id','verification_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['verification_id']::text[]),
          ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_artifact_fkey','public.lead_ai_artifacts'::pg_catalog.regclass,ARRAY['tenant_id','artifact_id']::text[],ARRAY['tenant_id','id']::text[],'n'::"char",ARRAY['artifact_id']::text[]),
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
      -- T-028 tenant/workspace constraints remain exact and are not replaced.
      AND (SELECT count(*)=7 FROM (
        VALUES
          ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_id_fkey','public.tenants'::pg_catalog.regclass,ARRAY['tenant_id']::text[],ARRAY['id']::text[]),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_id_fkey','public.tenants'::pg_catalog.regclass,ARRAY['tenant_id']::text[],ARRAY['id']::text[]),
          ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_id_fkey','public.tenants'::pg_catalog.regclass,ARRAY['tenant_id']::text[],ARRAY['id']::text[]),
          ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_id_fkey','public.tenants'::pg_catalog.regclass,ARRAY['tenant_id']::text[],ARRAY['id']::text[]),
          ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_workspace_fkey','public.workspaces'::pg_catalog.regclass,ARRAY['tenant_id','workspace_id']::text[],ARRAY['tenant_id','id']::text[]),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_workspace_fkey','public.workspaces'::pg_catalog.regclass,ARRAY['tenant_id','workspace_id']::text[],ARRAY['tenant_id','id']::text[]),
          ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_workspace_fkey','public.workspaces'::pg_catalog.regclass,ARRAY['tenant_id','workspace_id']::text[],ARRAY['tenant_id','id']::text[])
      ) e(relid,conname,parent_relid,child_columns,parent_columns)
      JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
      WHERE c.contype='f' AND c.convalidated AND c.confrelid=e.parent_relid
        AND c.confmatchtype='s' AND c.confupdtype='r' AND c.confdeltype='r'
        AND NOT c.condeferrable AND NOT c.condeferred AND c.confdelsetcols IS NULL
        AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
               FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY u(attnum,ordinality)
               JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)=e.child_columns
        AND (SELECT pg_catalog.array_agg(a.attname::text ORDER BY u.ordinality)
               FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY u(attnum,ordinality)
               JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=u.attnum)=e.parent_columns)
      -- Old single-column parent/reference FKs must be gone.
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname IN (
        'ai_lead_verifications_lead_id_fkey','lead_ai_artifacts_lead_id_fkey',
        'ai_feedback_events_lead_id_fkey','ai_feedback_events_verification_id_fkey','ai_feedback_events_artifact_id_fkey',
        'ai_usage_events_lead_id_fkey','ai_usage_events_verification_id_fkey'
      ) AND c.conrelid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
      -- Exact index identity includes access method, ordering, predicate,
      -- uniqueness, validity, and readiness through pg_get_indexdef plus flags.
      AND (SELECT count(*)=4 FROM pg_catalog.pg_index x
        JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid=i.relam
        WHERE x.indexrelid IN (
          'public.idx_ai_verifications_tenant_lead_created'::pg_catalog.regclass,
          'public.idx_ai_artifacts_tenant_queue'::pg_catalog.regclass,
          'public.idx_ai_feedback_tenant_lead_created'::pg_catalog.regclass,
          'public.idx_ai_usage_tenant_created'::pg_catalog.regclass
        ) AND am.amname='btree' AND NOT x.indisunique AND x.indisvalid AND x.indisready
          AND x.indexprs IS NULL)
      AND pg_catalog.pg_get_indexdef('public.idx_ai_verifications_tenant_lead_created'::pg_catalog.regclass)=
        'CREATE INDEX idx_ai_verifications_tenant_lead_created ON public.ai_lead_verifications USING btree (tenant_id, lead_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_ai_artifacts_tenant_queue'::pg_catalog.regclass)=
        'CREATE INDEX idx_ai_artifacts_tenant_queue ON public.lead_ai_artifacts USING btree (tenant_id, status, next_retry_at, created_at) WHERE (status = ANY (ARRAY[''queued''::text, ''error''::text]))'
      AND pg_catalog.pg_get_indexdef('public.idx_ai_feedback_tenant_lead_created'::pg_catalog.regclass)=
        'CREATE INDEX idx_ai_feedback_tenant_lead_created ON public.ai_feedback_events USING btree (tenant_id, lead_id, created_at DESC)'
      AND pg_catalog.pg_get_indexdef('public.idx_ai_usage_tenant_created'::pg_catalog.regclass)=
        'CREATE INDEX idx_ai_usage_tenant_created ON public.ai_usage_events USING btree (tenant_id, created_at DESC)'
      -- Exact trigger relation, timing/events, enabled state, function, and shape.
      AND (SELECT count(*)=4 FROM (
        VALUES
          ('public.ai_lead_verifications'::pg_catalog.regclass,'trg_novatrade_ai_lead_verifications_scope'),
          ('public.lead_ai_artifacts'::pg_catalog.regclass,'trg_novatrade_lead_ai_artifacts_scope'),
          ('public.ai_feedback_events'::pg_catalog.regclass,'trg_novatrade_ai_feedback_events_scope'),
          ('public.ai_usage_events'::pg_catalog.regclass,'trg_novatrade_ai_usage_events_scope')
      ) e(relid,tgname) JOIN pg_catalog.pg_trigger t ON t.tgrelid=e.relid AND t.tgname=e.tgname
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23 AND t.tgnargs=0
        AND t.tgfoid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
        AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
        AND pg_catalog.cardinality(t.tgattr::smallint[])=0)
      -- Exact function signature, body, execution properties, owner, comment,
      -- hostile-safe path, overload set, and exact-OID ACL.
      AND (SELECT count(*)=1 FROM pg_catalog.pg_proc p
        WHERE p.pronamespace='public'::pg_catalog.regnamespace AND p.proname='novatrade_ai_scope_guard')
      AND (SELECT l.lanname='plpgsql' AND p.prorettype='trigger'::pg_catalog.regtype AND NOT p.proretset
          AND p.provolatile='v' AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof
          AND p.proparallel='u' AND p.prokind='f' AND p.pronargs=0
          AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
          AND p.proowner=(SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='public.ai_lead_verifications'::pg_catalog.regclass)
          AND pg_catalog.obj_description(p.oid,'pg_proc')=
            'novatrade:g004a:ai-scope:v2; runtime correlation and worker_runs result_json redaction remain G-004B.'
          AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=
            'ee67f73cab668b894e1e7b732a2ceee2ab87d0c37084217a92dc0b6378f039e5'
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
        WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        WHERE p.oid='public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure
          AND acl.grantee<>p.proowner AND acl.privilege_type='EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND pg_catalog.has_function_privilege(r.oid,'public.novatrade_ai_scope_guard()'::pg_catalog.regprocedure,'EXECUTE'))
      -- Exact table isolation: RLS on, no policies, and no non-owner data ACL.
      AND (SELECT count(*)=4 AND pg_catalog.bool_and(c.relrowsecurity AND NOT c.relforcerowsecurity)
        FROM pg_catalog.pg_class c WHERE c.oid IN (
          'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
          'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
          'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
          'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
        WHERE c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
          AND acl.grantee<>c.relowner AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
        WHERE r.rolname IN ('anon','authenticated')
          AND c.oid IN ('public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
          AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    INTO replay_complete;
  END IF;

  IF replay_complete THEN
    PERFORM pg_catalog.set_config('novatrade.g004a_replay','true',true);
    RETURN;
  END IF;

  -- Any G-004A residue means a partial/spoofed catalog. Never repair it.
  SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace='public'::pg_catalog.regnamespace AND p.proname='novatrade_ai_scope_guard')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='public'::pg_catalog.regnamespace AND c.relname IN (
      'idx_ai_verifications_tenant_lead_created','idx_ai_artifacts_tenant_queue','idx_ai_feedback_tenant_lead_created','idx_ai_usage_tenant_created'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN (
      'trg_novatrade_ai_lead_verifications_scope','trg_novatrade_lead_ai_artifacts_scope','trg_novatrade_ai_feedback_events_scope','trg_novatrade_ai_usage_events_scope'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname IN (
      'ai_lead_verifications_tenant_id_id_unique','lead_ai_artifacts_tenant_id_id_unique',
      'ai_lead_verifications_tenant_lead_fkey','lead_ai_artifacts_tenant_lead_fkey','ai_feedback_events_tenant_lead_fkey',
      'ai_feedback_events_tenant_verification_fkey','ai_feedback_events_tenant_artifact_fkey',
      'ai_usage_events_tenant_lead_fkey','ai_usage_events_tenant_verification_fkey'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
      ('public.ai_lead_verifications'::pg_catalog.regclass,'tenant_id'),('public.lead_ai_artifacts'::pg_catalog.regclass,'tenant_id'),
      ('public.ai_feedback_events'::pg_catalog.regclass,'tenant_id'),('public.ai_usage_events'::pg_catalog.regclass,'tenant_id'))
      AND a.attnotnull AND NOT a.attisdropped)
  INTO partial_catalog;
  IF partial_catalog THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_PARTIAL_OR_SPOOFED_CATALOG';
  END IF;

  -- Validate the exact pre-G-004A T-028/G-003 surface before any mutation.
  IF NOT (SELECT count(*)=7 AND pg_catalog.bool_and(
      a.atttypid='uuid'::pg_catalog.regtype AND a.atttypmod=-1 AND NOT a.attnotnull
      AND a.attidentity='' AND a.attgenerated='' AND NOT a.atthasdef)
    FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
      ('public.ai_lead_verifications'::pg_catalog.regclass,'tenant_id'),('public.ai_lead_verifications'::pg_catalog.regclass,'workspace_id'),
      ('public.lead_ai_artifacts'::pg_catalog.regclass,'tenant_id'),('public.lead_ai_artifacts'::pg_catalog.regclass,'workspace_id'),
      ('public.ai_feedback_events'::pg_catalog.regclass,'tenant_id'),('public.ai_feedback_events'::pg_catalog.regclass,'workspace_id'),
      ('public.ai_usage_events'::pg_catalog.regclass,'tenant_id')) AND NOT a.attisdropped) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_BASE_COLUMN_CATALOG_INVALID';
  END IF;
  IF (SELECT count(*) FROM (
      VALUES
        ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE'),
        ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE'),
        ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE'),
        ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_verification_id_fkey','FOREIGN KEY (verification_id) REFERENCES ai_lead_verifications(id) ON DELETE SET NULL'),
        ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_artifact_id_fkey','FOREIGN KEY (artifact_id) REFERENCES lead_ai_artifacts(id) ON DELETE SET NULL'),
        ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL'),
        ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_verification_id_fkey','FOREIGN KEY (verification_id) REFERENCES ai_lead_verifications(id) ON DELETE SET NULL'),
        ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.ai_usage_events'::pg_catalog.regclass,'ai_usage_events_tenant_id_fkey','FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.ai_lead_verifications'::pg_catalog.regclass,'ai_lead_verifications_tenant_workspace_fkey','FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.lead_ai_artifacts'::pg_catalog.regclass,'lead_ai_artifacts_tenant_workspace_fkey','FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT'),
        ('public.ai_feedback_events'::pg_catalog.regclass,'ai_feedback_events_tenant_workspace_fkey','FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT')
    ) e(relid,conname,definition)
    JOIN pg_catalog.pg_constraint c ON c.conrelid=e.relid AND c.conname=e.conname
    WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
      AND c.confmatchtype='s' AND pg_catalog.pg_get_constraintdef(c.oid)=e.definition)<>14 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_BASE_REFERENCE_CATALOG_INVALID';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.oid IN (
      'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
      'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
      AND c.relrowsecurity)<>4
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid IN (
      'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
      'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
      WHERE r.rolname IN ('anon','authenticated') AND c.oid IN (
        'public.ai_lead_verifications'::pg_catalog.regclass,'public.lead_ai_artifacts'::pg_catalog.regclass,
        'public.ai_feedback_events'::pg_catalog.regclass,'public.ai_usage_events'::pg_catalog.regclass)
        AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_BASE_RLS_OR_ACL_INVALID';
  END IF;

  -- Nonempty upgrades require one exact completed PostgreSQL T-028 receipt.
  IF ((SELECT count(*) FROM public.ai_lead_verifications)+(SELECT count(*) FROM public.lead_ai_artifacts)+
      (SELECT count(*) FROM public.ai_feedback_events)+(SELECT count(*) FROM public.ai_usage_events)) > 0 THEN
    FOREACH target_table IN ARRAY ARRAY['ai_lead_verifications','lead_ai_artifacts','ai_feedback_events','ai_usage_events'] LOOP
      EXECUTE pg_catalog.format(
        'SELECT count(*),pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-''tenant_id''-''workspace_id'')::text,''|'' ORDER BY (to_jsonb(t)-''tenant_id''-''workspace_id'')::text),''''),''UTF8'')),''hex'') FROM public.%I t',
        target_table) INTO row_count,row_checksum;
      counts:=counts||pg_catalog.jsonb_build_object(target_table,row_count);
      checksums:=checksums||pg_catalog.jsonb_build_object(target_table,row_checksum);
    END LOOP;
    SELECT count(*)::integer INTO receipt_count FROM public.compatibility_backfill_receipts r
      WHERE r.status='completed' AND r.completed_at IS NOT NULL AND r.source_engine='postgres'
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
    SELECT r.tenant_id,r.workspace_id INTO STRICT receipt_tenant,receipt_workspace
      FROM public.compatibility_backfill_receipts r
      WHERE r.status='completed' AND r.completed_at IS NOT NULL AND r.source_engine='postgres'
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
    IF EXISTS (SELECT 1 FROM public.ai_lead_verifications x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.lead_ai_artifacts x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.ai_feedback_events x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant OR x.workspace_id IS DISTINCT FROM receipt_workspace)
       OR EXISTS (SELECT 1 FROM public.ai_usage_events x WHERE x.tenant_id IS DISTINCT FROM receipt_tenant) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_T028_RECEIPT_SCOPE_DRIFT';
    END IF;
  END IF;

  -- Existing relationships must resolve inside exact authoritative scope.
  IF EXISTS (SELECT 1 FROM public.ai_lead_verifications x LEFT JOIN public.leads l ON (l.tenant_id,l.id)=(x.tenant_id,x.lead_id) WHERE l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.lead_ai_artifacts x LEFT JOIN public.leads l ON (l.tenant_id,l.id)=(x.tenant_id,x.lead_id) WHERE l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_feedback_events x LEFT JOIN public.leads l ON (l.tenant_id,l.id)=(x.tenant_id,x.lead_id) WHERE l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_feedback_events x LEFT JOIN public.ai_lead_verifications v ON (v.tenant_id,v.id,x.lead_id)=(x.tenant_id,x.verification_id,v.lead_id) WHERE x.verification_id IS NOT NULL AND v.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_feedback_events x LEFT JOIN public.lead_ai_artifacts a ON (a.tenant_id,a.id,x.lead_id)=(x.tenant_id,x.artifact_id,a.lead_id) WHERE x.artifact_id IS NOT NULL AND a.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_usage_events x LEFT JOIN public.leads l ON (l.tenant_id,l.id)=(x.tenant_id,x.lead_id) WHERE x.lead_id IS NOT NULL AND l.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_usage_events x LEFT JOIN public.ai_lead_verifications v ON (v.tenant_id,v.id)=(x.tenant_id,x.verification_id) WHERE x.verification_id IS NOT NULL AND v.id IS NULL)
     OR EXISTS (SELECT 1 FROM public.ai_usage_events x JOIN public.ai_lead_verifications v ON v.id=x.verification_id WHERE x.lead_id IS NOT NULL AND x.lead_id IS DISTINCT FROM v.lead_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_EXISTING_REFERENCE_SCOPE_INVALID';
  END IF;
  -- Historical inactive attribution is valid evidence, but it must still be a
  -- real same-tenant membership. Activity is checked only for new attribution.
  IF EXISTS (SELECT 1 FROM (
      SELECT tenant_id,workspace_id,requested_by_user_id actor FROM public.ai_lead_verifications
      UNION ALL SELECT tenant_id,workspace_id,requested_by_user_id FROM public.lead_ai_artifacts
      UNION ALL SELECT tenant_id,workspace_id,actor_user_id FROM public.ai_feedback_events
    ) x WHERE x.actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id=x.tenant_id AND m.auth_identity_id=x.actor
        AND (x.workspace_id IS NULL OR m.workspace_id IS NULL OR m.workspace_id=x.workspace_id)))
     OR EXISTS (SELECT 1 FROM public.ai_usage_events x WHERE x.actor_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=x.tenant_id AND m.auth_identity_id=x.actor_user_id)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='G004A_EXISTING_ATTRIBUTION_SCOPE_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('novatrade.g004a_replay','false',true);
END;
$g004a_preflight$;

DO $g004a_install$
DECLARE target_owner text;
BEGIN
  IF pg_catalog.current_setting('novatrade.g004a_replay')='true' THEN RETURN; END IF;

  -- Replace only the exact legacy single-column FKs after the complete
  -- preflight. No catalog discovery/drop loop can widen this mutation.
  EXECUTE 'ALTER TABLE public.ai_lead_verifications DROP CONSTRAINT ai_lead_verifications_lead_id_fkey';
  EXECUTE 'ALTER TABLE public.lead_ai_artifacts DROP CONSTRAINT lead_ai_artifacts_lead_id_fkey';
  EXECUTE 'ALTER TABLE public.ai_feedback_events DROP CONSTRAINT ai_feedback_events_lead_id_fkey';
  EXECUTE 'ALTER TABLE public.ai_feedback_events DROP CONSTRAINT ai_feedback_events_verification_id_fkey';
  EXECUTE 'ALTER TABLE public.ai_feedback_events DROP CONSTRAINT ai_feedback_events_artifact_id_fkey';
  EXECUTE 'ALTER TABLE public.ai_usage_events DROP CONSTRAINT ai_usage_events_lead_id_fkey';
  EXECUTE 'ALTER TABLE public.ai_usage_events DROP CONSTRAINT ai_usage_events_verification_id_fkey';

  EXECUTE 'ALTER TABLE public.ai_lead_verifications ALTER COLUMN tenant_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.lead_ai_artifacts ALTER COLUMN tenant_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.ai_feedback_events ALTER COLUMN tenant_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.ai_usage_events ALTER COLUMN tenant_id SET NOT NULL';

  EXECUTE 'ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_id_id_unique UNIQUE(tenant_id,id)';
  EXECUTE 'ALTER TABLE public.lead_ai_artifacts ADD CONSTRAINT lead_ai_artifacts_tenant_id_id_unique UNIQUE(tenant_id,id)';
  EXECUTE 'ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE';
  EXECUTE 'ALTER TABLE public.lead_ai_artifacts ADD CONSTRAINT lead_ai_artifacts_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE';
  EXECUTE 'ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE';
  EXECUTE 'ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_verification_fkey FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (verification_id)';
  EXECUTE 'ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_artifact_fkey FOREIGN KEY(tenant_id,artifact_id) REFERENCES public.lead_ai_artifacts(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (artifact_id)';
  EXECUTE 'ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (lead_id)';
  EXECUTE 'ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_verification_fkey FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (verification_id)';

  EXECUTE $ddl$
    CREATE FUNCTION public.novatrade_ai_scope_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $function$
DECLARE
  parent_tenant uuid;
  verification_tenant uuid;
  verification_lead text;
  actor uuid;
  scope_workspace uuid;
  reference_change boolean := false;
  attribution_changed boolean := false;
BEGIN
  IF TG_TABLE_NAME='ai_usage_events' THEN
    actor:=NEW.actor_user_id;
    scope_workspace:=NULL;
    IF TG_OP='INSERT' THEN attribution_changed:=true;
    ELSE attribution_changed:=actor IS DISTINCT FROM OLD.actor_user_id; END IF;
    reference_change:=TG_OP='UPDATE' AND (NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.verification_id IS DISTINCT FROM OLD.verification_id);
    IF reference_change AND NOT (pg_catalog.pg_trigger_depth()>1 AND
      (NEW.lead_id IS NULL OR NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id) AND
      (NEW.verification_id IS NULL OR NEW.verification_id IS NOT DISTINCT FROM OLD.verification_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_SCOPE_IMMUTABLE';
    END IF;
    IF NEW.lead_id IS NOT NULL THEN
      SELECT l.tenant_id INTO parent_tenant FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE;
      IF parent_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G004A_LEAD_PARENT_REQUIRED'; END IF;
    END IF;
    IF NEW.verification_id IS NOT NULL THEN
      SELECT v.tenant_id,v.lead_id INTO verification_tenant,verification_lead
        FROM public.ai_lead_verifications v WHERE v.id=NEW.verification_id FOR KEY SHARE;
      IF verification_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G004A_VERIFICATION_PARENT_REQUIRED'; END IF;
    END IF;
    IF NEW.lead_id IS NOT NULL AND NEW.verification_id IS NOT NULL AND NEW.lead_id IS DISTINCT FROM verification_lead THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_REFERENCE_SCOPE_INVALID';
    END IF;
    IF parent_tenant IS NULL THEN parent_tenant:=verification_tenant; END IF;
    IF verification_tenant IS NOT NULL AND parent_tenant IS DISTINCT FROM verification_tenant THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_REFERENCE_SCOPE_INVALID';
    END IF;
    IF TG_OP='INSERT' AND parent_tenant IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_USAGE_RUNTIME_CORRELATION_REQUIRED';
    END IF;
    IF TG_OP='UPDATE' AND parent_tenant IS NULL THEN parent_tenant:=OLD.tenant_id; END IF;
  ELSE
    scope_workspace:=NEW.workspace_id;
    IF TG_TABLE_NAME='ai_lead_verifications' OR TG_TABLE_NAME='lead_ai_artifacts' THEN
      actor:=NEW.requested_by_user_id;
      IF TG_OP='INSERT' THEN attribution_changed:=true;
      ELSE attribution_changed:=actor IS DISTINCT FROM OLD.requested_by_user_id; END IF;
    ELSE
      actor:=NEW.actor_user_id;
      IF TG_OP='INSERT' THEN attribution_changed:=true;
      ELSE attribution_changed:=actor IS DISTINCT FROM OLD.actor_user_id; END IF;
    END IF;
    IF TG_OP='UPDATE' AND (NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_SCOPE_IMMUTABLE';
    END IF;
    IF TG_TABLE_NAME='ai_feedback_events' THEN
      reference_change:=TG_OP='UPDATE' AND (NEW.verification_id IS DISTINCT FROM OLD.verification_id OR NEW.artifact_id IS DISTINCT FROM OLD.artifact_id);
      IF reference_change AND NOT (pg_catalog.pg_trigger_depth()>1 AND
        (NEW.verification_id IS NULL OR NEW.verification_id IS NOT DISTINCT FROM OLD.verification_id) AND
        (NEW.artifact_id IS NULL OR NEW.artifact_id IS NOT DISTINCT FROM OLD.artifact_id)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_FEEDBACK_SCOPE_IMMUTABLE';
      END IF;
    END IF;
    SELECT l.tenant_id INTO parent_tenant FROM public.leads l WHERE l.id=NEW.lead_id FOR KEY SHARE;
    IF parent_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='G004A_LEAD_PARENT_REQUIRED'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_TENANT_IMMUTABLE';
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_PARENT_TENANT_MISMATCH';
  END IF;
  NEW.tenant_id:=parent_tenant;
  IF TG_TABLE_NAME='ai_feedback_events' THEN
    IF NEW.verification_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ai_lead_verifications v
      WHERE (v.tenant_id,v.id,v.lead_id)=(NEW.tenant_id,NEW.verification_id,NEW.lead_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_FEEDBACK_REFERENCE_SCOPE_INVALID';
    END IF;
    IF NEW.artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_ai_artifacts a
      WHERE (a.tenant_id,a.id,a.lead_id)=(NEW.tenant_id,NEW.artifact_id,NEW.lead_id)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_FEEDBACK_REFERENCE_SCOPE_INVALID';
    END IF;
  END IF;
  IF actor IS NOT NULL AND attribution_changed THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=NEW.tenant_id
      AND m.auth_identity_id=actor AND m.status='active'
      AND (scope_workspace IS NULL OR m.workspace_id IS NULL OR m.workspace_id=scope_workspace)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='G004A_ACTIVE_SAME_TENANT_ATTRIBUTION_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END
    $function$
  $ddl$;
  SELECT r.rolname INTO STRICT target_owner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE c.oid='public.ai_lead_verifications'::pg_catalog.regclass;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.novatrade_ai_scope_guard() OWNER TO %I',target_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_scope_guard() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_scope_guard() FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_ai_scope_guard() FROM authenticated'; END IF;
  EXECUTE $ddl$COMMENT ON FUNCTION public.novatrade_ai_scope_guard() IS 'novatrade:g004a:ai-scope:v2; runtime correlation and worker_runs result_json redaction remain G-004B.'$ddl$;

  EXECUTE 'CREATE TRIGGER trg_novatrade_ai_lead_verifications_scope BEFORE INSERT OR UPDATE ON public.ai_lead_verifications FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()';
  EXECUTE 'CREATE TRIGGER trg_novatrade_lead_ai_artifacts_scope BEFORE INSERT OR UPDATE ON public.lead_ai_artifacts FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()';
  EXECUTE 'CREATE TRIGGER trg_novatrade_ai_feedback_events_scope BEFORE INSERT OR UPDATE ON public.ai_feedback_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()';
  EXECUTE 'CREATE TRIGGER trg_novatrade_ai_usage_events_scope BEFORE INSERT OR UPDATE ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()';

  EXECUTE 'CREATE INDEX idx_ai_verifications_tenant_lead_created ON public.ai_lead_verifications(tenant_id,lead_id,created_at DESC)';
  EXECUTE $ddl$CREATE INDEX idx_ai_artifacts_tenant_queue ON public.lead_ai_artifacts(tenant_id,status,next_retry_at,created_at) WHERE status IN ('queued','error')$ddl$;
  EXECUTE 'CREATE INDEX idx_ai_feedback_tenant_lead_created ON public.ai_feedback_events(tenant_id,lead_id,created_at DESC)';
  EXECUTE 'CREATE INDEX idx_ai_usage_tenant_created ON public.ai_usage_events(tenant_id,created_at DESC)';

  EXECUTE 'ALTER TABLE public.ai_lead_verifications ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.lead_ai_artifacts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.ai_lead_verifications,public.lead_ai_artifacts,public.ai_feedback_events,public.ai_usage_events FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.ai_lead_verifications,public.lead_ai_artifacts,public.ai_feedback_events,public.ai_usage_events FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.ai_lead_verifications,public.lead_ai_artifacts,public.ai_feedback_events,public.ai_usage_events FROM authenticated'; END IF;
END;
$g004a_install$;

COMMIT;
