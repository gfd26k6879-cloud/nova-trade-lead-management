-- G-007P11: add the tenant-prefixed ordering index for the bounded open
-- admin-request list. The current global status/type index remains the
-- compatibility and runtime-repair-owned index.

DO $g007p11$
DECLARE
  final_catalog boolean;
  baseline_catalog boolean;
BEGIN
  IF pg_catalog.to_regclass('public.admin_requests') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P11_REQUIRED_TABLE_MISSING';
  END IF;

  IF NOT (
    SELECT count(*) = 8
      AND pg_catalog.bool_and(
        CASE a.attname
          WHEN 'id' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'tenant_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype AND a.attnotnull
          WHEN 'workspace_id' THEN a.atttypid = 'uuid'::pg_catalog.regtype AND NOT a.attnotnull
          WHEN 'lead_id' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'request_type' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'status' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'priority' THEN a.atttypid = 'text'::pg_catalog.regtype AND a.attnotnull
          WHEN 'created_at' THEN a.atttypid = 'timestamp with time zone'::pg_catalog.regtype AND a.attnotnull
          ELSE false
        END
      )
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.admin_requests'::pg_catalog.regclass
      AND a.attname IN (
        'id', 'tenant_id', 'workspace_id', 'lead_id', 'request_type',
        'status', 'priority', 'created_at'
      )
      AND NOT a.attisdropped
  ) OR NOT (
    SELECT count(*) = 3
      AND pg_catalog.bool_and(
        CASE c.conname
          WHEN 'admin_requests_request_type_check' THEN
            pg_catalog.pg_get_constraintdef(c.oid) =
              'CHECK ((request_type = ANY (ARRAY[''website_request''::text, ''quote_request''::text])))'
          WHEN 'admin_requests_status_check' THEN
            pg_catalog.pg_get_constraintdef(c.oid) =
              'CHECK ((status = ANY (ARRAY[''new''::text, ''seen''::text, ''in_progress''::text, ''waiting_on_researcher''::text, ''done''::text, ''cancelled''::text])))'
          WHEN 'admin_requests_priority_check' THEN
            pg_catalog.pg_get_constraintdef(c.oid) =
              'CHECK ((priority = ANY (ARRAY[''urgent''::text, ''normal''::text, ''low''::text])))'
          ELSE false
        END
      )
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.admin_requests'::pg_catalog.regclass
      AND c.conname IN (
        'admin_requests_request_type_check',
        'admin_requests_status_check',
        'admin_requests_priority_check'
      )
      AND c.contype = 'c'
      AND c.convalidated
      AND NOT c.connoinherit
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class i ON i.oid = c.conindid
    JOIN pg_catalog.pg_index x ON x.indexrelid = c.conindid
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.admin_requests'::pg_catalog.regclass
      AND c.conname = 'admin_requests_pkey'
      AND c.contype = 'p'
      AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.admin_requests'::pg_catalog.regclass
      AND x.indisunique
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class i ON i.oid = c.conindid
    JOIN pg_catalog.pg_index x ON x.indexrelid = c.conindid
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.leads'::pg_catalog.regclass
      AND c.conname = 'leads_tenant_id_id_unique'
      AND c.contype = 'u'
      AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, id)'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.leads'::pg_catalog.regclass
      AND x.indisunique
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class i ON i.oid = c.conindid
    JOIN pg_catalog.pg_index x ON x.indexrelid = c.conindid
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.workspaces'::pg_catalog.regclass
      AND c.conname = 'workspaces_tenant_id_id_unique'
      AND c.contype = 'u'
      AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (tenant_id, id)'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.workspaces'::pg_catalog.regclass
      AND x.indisunique
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.admin_requests'::pg_catalog.regclass
      AND c.conname = 'admin_requests_tenant_lead_fkey'
      AND c.contype = 'f'
      AND c.convalidated
      AND c.confrelid = 'public.leads'::pg_catalog.regclass
      AND c.conkey = ARRAY[
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'tenant_id'),
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'lead_id')
      ]::smallint[]
      AND c.confkey = ARRAY[
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'tenant_id'),
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'id')
      ]::smallint[]
      AND c.confmatchtype = 's'
      AND c.confupdtype = 'r'
      AND c.confdeltype = 'c'
      AND NOT c.condeferrable
      AND NOT c.condeferred
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::pg_catalog.regnamespace
      AND c.conrelid = 'public.admin_requests'::pg_catalog.regclass
      AND c.conname = 'admin_requests_tenant_workspace_fkey'
      AND c.contype = 'f'
      AND c.convalidated
      AND c.confrelid = 'public.workspaces'::pg_catalog.regclass
      AND c.conkey = ARRAY[
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'tenant_id'),
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'workspace_id')
      ]::smallint[]
      AND c.confkey = ARRAY[
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'tenant_id'),
        (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'id')
      ]::smallint[]
      AND c.confmatchtype = 's'
      AND c.confupdtype = 'r'
      AND c.confdeltype = 'r'
      AND NOT c.condeferrable
      AND NOT c.condeferred
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class i
    JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
    WHERE n.nspname = 'public'
      AND i.relname = 'idx_admin_requests_tenant_lead_created'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.admin_requests'::pg_catalog.regclass
      AND pg_catalog.pg_get_indexdef(i.oid) =
        'CREATE INDEX idx_admin_requests_tenant_lead_created ON public.admin_requests USING btree (tenant_id, lead_id, created_at DESC)'
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class i
    JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
    WHERE n.nspname = 'public'
      AND i.relname = 'admin_requests_tenant_lead_open_unique'
      AND i.relkind = 'i'
      AND x.indrelid = 'public.admin_requests'::pg_catalog.regclass
      AND x.indisunique
      AND pg_catalog.pg_get_indexdef(i.oid) =
        'CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique ON public.admin_requests USING btree (tenant_id, lead_id, request_type) WHERE (status = ANY (ARRAY[''new''::text, ''seen''::text, ''in_progress''::text, ''waiting_on_researcher''::text]))'
      AND x.indisvalid
      AND x.indisready
      AND x.indislive
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P11_INDEX_CATALOG_DRIFT';
  END IF;

  SELECT
    (SELECT count(*) = 1
       FROM pg_catalog.pg_class i
       JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(i.relname, pg_catalog.length('idx_g007p11_')) = 'idx_g007p11_')
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_g007p11_admin_tenant_open_priority_status_created'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.admin_requests'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid) = $g007p11_indexdef$CREATE INDEX idx_g007p11_admin_tenant_open_priority_status_created ON public.admin_requests USING btree (tenant_id, (
CASE priority
    WHEN 'urgent'::text THEN 0
    WHEN 'normal'::text THEN 1
    ELSE 2
END), (
CASE status
    WHEN 'new'::text THEN 0
    WHEN 'seen'::text THEN 1
    WHEN 'in_progress'::text THEN 2
    WHEN 'waiting_on_researcher'::text THEN 3
    ELSE 4
END), created_at DESC) WHERE (status = ANY (ARRAY['new'::text, 'seen'::text, 'in_progress'::text, 'waiting_on_researcher'::text]))$g007p11_indexdef$
        AND NOT x.indisunique
        AND x.indnkeyatts = 4
        AND x.indnatts = 4
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
  INTO final_catalog;

  IF final_catalog THEN
    RETURN;
  END IF;

  SELECT
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public'
        AND pg_catalog.left(i.relname, pg_catalog.length('idx_g007p11_')) = 'idx_g007p11_'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = 'public'
        AND i.relname = 'idx_admin_requests_status_type_created'
        AND i.relkind = 'i'
        AND x.indrelid = 'public.admin_requests'::pg_catalog.regclass
        AND pg_catalog.pg_get_indexdef(i.oid) =
          'CREATE INDEX idx_admin_requests_status_type_created ON public.admin_requests USING btree (status, request_type, created_at DESC)'
        AND x.indisvalid
        AND x.indisready
        AND x.indislive
    )
  INTO baseline_catalog;

  IF NOT baseline_catalog THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'G007P11_INDEX_CATALOG_DRIFT';
  END IF;

  CREATE INDEX idx_g007p11_admin_tenant_open_priority_status_created
    ON public.admin_requests (
      tenant_id,
      (CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),
      (CASE status
        WHEN 'new' THEN 0
        WHEN 'seen' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'waiting_on_researcher' THEN 3
        ELSE 4
      END),
      created_at DESC
    )
    WHERE status IN ('new', 'seen', 'in_progress', 'waiting_on_researcher');
END;
$g007p11$;
