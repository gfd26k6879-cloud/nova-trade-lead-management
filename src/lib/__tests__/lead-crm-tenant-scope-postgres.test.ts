import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  COMPATIBILITY_TENANT_TABLES,
  POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
  POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
  type CompatibilityBackfillManifest,
  type CompatibilityTableExpectation,
} from "@/lib/tenancy/compatibility-backfill";

const G002_MIGRATION = "202607290001_add_location_crawl_tenant_scope.sql";
const G003_MIGRATION = "202607290002_add_lead_crm_tenant_scope.sql";
const G007P3_MIGRATION = "202607310003_tenant_prefix_lead_ai_queue_indexes.sql";
const G007P6_MIGRATION = "202607310004_tenant_enrichment_recovery_index.sql";
const G007P7_MIGRATION = "202607310005_tenant_ai_website_repair_index.sql";
const G007P8_MIGRATION = "202607310006_tenant_dashboard_discovered_at_index.sql";
const G007P11_MIGRATION = "202607310007_tenant_open_admin_request_list_index.sql";
const g002Sql = readFileSync(join("supabase", "migrations", G002_MIGRATION), "utf8");
const g003Sql = readFileSync(join("supabase", "migrations", G003_MIGRATION), "utf8");
const g007p3Sql = readFileSync(join("supabase", "migrations", G007P3_MIGRATION), "utf8");
const g007p6Sql = readFileSync(join("supabase", "migrations", G007P6_MIGRATION), "utf8");
const g007p7Sql = readFileSync(join("supabase", "migrations", G007P7_MIGRATION), "utf8");
const g007p8Sql = readFileSync(join("supabase", "migrations", G007P8_MIGRATION), "utf8");
const g007p11Sql = readFileSync(join("supabase", "migrations", G007P11_MIGRATION), "utf8");
const skipped = new Set(["20260514161714_supabase_ai_verification_cron.sql", "20260514163203_scheduler_v2_sales_ready_pipeline.sql"]);
const tenantA = "00000000-0000-4000-8000-000000000301";
const tenantB = "00000000-0000-4000-8000-000000000302";
const workspaceA = "10000000-0000-4000-8000-000000000301";
const workspaceB = "10000000-0000-4000-8000-000000000302";
const ownerA = "20000000-0000-4000-8000-000000000301";
const ownerB = "20000000-0000-4000-8000-000000000302";
const suspendedActor = "20000000-0000-4000-8000-000000000303";
const membershipA = "30000000-0000-4000-8000-000000000301";
const membershipB = "30000000-0000-4000-8000-000000000302";
const suspendedMembership = "30000000-0000-4000-8000-000000000303";
const bindingA = "40000000-0000-4000-8000-000000000301";
const suspendedBinding = "40000000-0000-4000-8000-000000000303";
const policyA = "50000000-0000-4000-8000-000000000301";
const policyHash = "c".repeat(64);
const targetTables = ["leads", "lead_notes", "outreach_events", "admin_requests", "demos"] as const;

type PgClient = ReturnType<typeof postgres>;

async function resetDatabase(client: PgClient, fullChain: boolean, g003Boundary = false, stopBefore?: string): Promise<{ discovered: number; applied: number; skipped: number }> {
  await client.unsafe(`
    RESET ROLE;
    RESET search_path;
    DROP SCHEMA IF EXISTS g003_shadow CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT USAGE ON SCHEMA public TO anon,authenticated;
    CREATE TABLE public.worker_runs(
      id text PRIMARY KEY,worker_name text NOT NULL,status text NOT NULL DEFAULT 'running',
      trigger_source text NOT NULL DEFAULT 'unknown',http_status integer,
      result_json jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
      started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = readdirSync(join("supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    if (skipped.has(file)) continue;
    if (!fullChain && file >= G002_MIGRATION) break;
    if (g003Boundary && file > G003_MIGRATION) break;
    if (stopBefore && file >= stopBefore) break;
    await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") {
      await client.unsafe(`
        ALTER TABLE public.settings
          ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1;
        ALTER TABLE public.leads
          ADD COLUMN IF NOT EXISTS ai_website_feedback_status text,
          ADD COLUMN IF NOT EXISTS ai_corrected_website_url text,
          ADD COLUMN IF NOT EXISTS ai_false_positive_reason text,
          ADD COLUMN IF NOT EXISTS ai_reviewer_notes text,
          ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz;
      `);
    }
  }
  return { discovered: files.length, applied, skipped: skipped.size };
}

async function postgresManifest(client: PgClient): Promise<CompatibilityBackfillManifest> {
  const legacyTables: CompatibilityTableExpectation[] = [];
  const workspaceScoped = new Set([
    "audit_logs", "user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events",
    "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
  ]);
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const scopeExpression = workspaceScoped.has(table)
      ? "(to_jsonb(t) - 'tenant_id' - 'workspace_id')::text"
      : "(to_jsonb(t) - 'tenant_id')::text";
    const rows = await client.unsafe<Array<{ row_count: number; content_checksum: string }>>(
      `SELECT count(*)::integer AS row_count,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${scopeExpression}, '|' ORDER BY ${scopeExpression}), ''), 'UTF8')), 'hex') AS content_checksum
       FROM public."${table}" t`,
    );
    legacyTables.push({ table, rowCount: Number(rows[0].row_count), contentChecksum: rows[0].content_checksum });
  }
  return {
    schemaVersion: 1,
    sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g003-postgres-rehearsal-v1",
    sourceSnapshotFingerprint: "d".repeat(64),
    tenantId: tenantA,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: workspaceA,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: ownerA,
    policyId: policyA,
    policyVersion: 1,
    policyHash,
    legacyUsers: [{
      legacyUserId: "legacy-owner",
      authIdentityId: ownerA,
      expectedEmail: "owner@synthetic.invalid",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: membershipA,
      workspaceId: workspaceA,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: bindingA,
      marketAccessIds: [],
    }, {
      legacyUserId: "legacy-disabled",
      authIdentityId: suspendedActor,
      expectedEmail: "disabled@synthetic.invalid",
      expectedLegacyRole: "researcher",
      expectedStatus: "disabled",
      membershipId: suspendedMembership,
      workspaceId: workspaceA,
      membershipRole: "researcher",
      membershipStatus: "suspended",
      roleBindingId: suspendedBinding,
      marketAccessIds: [],
    }],
    legacyTables,
  };
}

async function seedLegacyGraph(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${suspendedActor}');
    INSERT INTO public.app_users(id,user_id,email,role,status)
      VALUES
        ('legacy-owner','${ownerA}','owner@synthetic.invalid','admin','active'),
        ('legacy-disabled','${suspendedActor}','disabled@synthetic.invalid','researcher','disabled');
    INSERT INTO public.leads(id,place_id,name,address,phone,maps_uri,rating,review_count,selling_niche,assigned_to_user_id)
      VALUES ('legacy-lead','legacy-place','Legacy Business','1 Synthetic Way','555-0100','https://maps.invalid/legacy',4.5,12,'synthetic','${ownerA}');
    INSERT INTO public.lead_notes(id,lead_id,author_user_id,body)
      VALUES ('legacy-note','legacy-lead','${suspendedActor}','synthetic note');
    INSERT INTO public.outreach_events(id,lead_id,channel,actor_user_id,note)
      VALUES ('legacy-outreach','legacy-lead','email','${ownerA}','synthetic event');
    INSERT INTO public.admin_requests(id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status)
      VALUES ('legacy-request','legacy-lead','${suspendedActor}','${ownerA}','quote_request','new');
    INSERT INTO public.demos(id,lead_id,slug,config_json,is_published,published_by_user_id)
      VALUES ('legacy-demo','legacy-lead','legacy-public','{"headline":"Legacy","secret":"hidden"}'::jsonb,1,'${suspendedActor}');
  `);
}

async function runT028(client: PgClient): Promise<void> {
  const manifest = await postgresManifest(client);
  await client.unsafe("SELECT public.novatrade_run_compatibility_backfill($1::jsonb)", [JSON.parse(JSON.stringify(manifest))]);
}

async function alignReceiptChecksumsToCurrentTargets(client: PgClient): Promise<void> {
  const manifest = await postgresManifest(client);
  const checksums = Object.fromEntries(
    manifest.legacyTables
      .filter(({ table }) => targetTables.includes(table as (typeof targetTables)[number]))
      .map(({ table, contentChecksum }) => [table, contentChecksum]),
  );
  await client.unsafe(
    "UPDATE public.compatibility_backfill_receipts SET after_content_checksums=after_content_checksums || $1::jsonb",
    [checksums],
  );
}

async function prepareUpgrade(client: PgClient): Promise<void> {
  await resetDatabase(client, false);
  await seedLegacyGraph(client);
  await runT028(client);
  await client.unsafe(g002Sql);
}

async function seedPostInstallGraph(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}');
    INSERT INTO public.tenants(id,slug,name,status) VALUES ('${tenantA}','post-install-a','Post-install A','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceA}','${tenantA}','post-install-workspace','Post-install Workspace','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status)
      VALUES ('${membershipA}','${tenantA}','${ownerA}','${workspaceA}','active');
    INSERT INTO public.leads(id,tenant_id,place_id,name,assigned_to_user_id)
      VALUES ('post-install-lead','${tenantA}','post-install-place','Post-install Business','${ownerA}');
  `);
}

async function seedG007P3PlanRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${ownerB}');
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','g007p3-plan-a','G007P3 Plan A','active'),
      ('${tenantB}','g007p3-plan-b','G007P3 Plan B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${workspaceA}','${tenantA}','g007p3-plan-a','G007P3 Plan A','active'),
      ('${workspaceB}','${tenantB}','g007p3-plan-b','G007P3 Plan B','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES
      ('${membershipA}','${tenantA}','${ownerA}','${workspaceA}','active'),
      ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active');

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,ai_queue_status,ai_next_retry_at,ai_attempt_count,
      is_excluded,archived_at,status,business_status,sales_priority_score,
      raw_opportunity_score,score,updated_at
    )
    SELECT
      'g007p3-ready-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p3-ready-place-'||scope.label||'-'||series.n,
      'G007P3 ready '||scope.label||' '||series.n,
      'queued',NULL,0,0,NULL,'new','OPERATIONAL',
      scope.priority_bias+series.n,scope.priority_bias+series.n,scope.priority_bias+series.n,
      now()-(series.n||' seconds')::interval
    FROM pg_catalog.generate_series(1,4000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid,0),
      ('b','${tenantB}'::uuid,10000)
    ) scope(label,tenant_id,priority_bias);

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,ai_queue_status,ai_next_retry_at,ai_attempt_count,
      is_excluded,archived_at,status,business_status,sales_priority_score,
      raw_opportunity_score,score,updated_at
    )
    SELECT
      'g007p3-running-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p3-running-place-'||scope.label||'-'||series.n,
      'G007P3 running '||scope.label||' '||series.n,
      'running',NULL,1,0,NULL,'new','OPERATIONAL',
      series.n,series.n,series.n,now()-interval '10 minutes'
    FROM pg_catalog.generate_series(1,4000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid),
      ('b','${tenantB}'::uuid)
    ) scope(label,tenant_id);

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,ai_queue_status,ai_next_retry_at,ai_attempt_count,
      is_excluded,archived_at,status,business_status,sales_priority_score,
      raw_opportunity_score,score,updated_at
    )
    SELECT
      'g007p3-verified-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p3-verified-place-'||scope.label||'-'||series.n,
      'G007P3 verified '||scope.label||' '||series.n,
      'verified',NULL,0,0,NULL,'new','OPERATIONAL',
      series.n,series.n,series.n,now()-(series.n||' seconds')::interval
    FROM pg_catalog.generate_series(1,32000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid),
      ('b','${tenantB}'::uuid)
    ) scope(label,tenant_id);

    ANALYZE public.leads;
  `);
}

const G007P6_INDEX = "idx_g007p6_leads_tenant_enrichment_recovery";
const G007P6_INDEXDEF = "CREATE INDEX idx_g007p6_leads_tenant_enrichment_recovery ON public.leads USING btree (tenant_id, enrichment_status, score DESC) WHERE (enrichment_status = ANY (ARRAY['running'::text, 'retry_wait'::text]))";

async function seedG007P6PlanRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${ownerB}');
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','g007p6-plan-a','G007P6 Plan A','active'),
      ('${tenantB}','g007p6-plan-b','G007P6 Plan B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${workspaceA}','${tenantA}','g007p6-plan-a','G007P6 Plan A','active'),
      ('${workspaceB}','${tenantB}','g007p6-plan-b','G007P6 Plan B','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES
      ('${membershipA}','${tenantA}','${ownerA}','${workspaceA}','active'),
      ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active');

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,enrichment_status,enrichment_attempt_count,
      enrichment_max_attempts,enrichment_started_at,enrichment_next_retry_at,
      is_excluded,archived_at,score,updated_at
    )
    SELECT
      'g007p6-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p6-place-'||scope.label||'-'||series.n,
      'G007P6 '||scope.label||' '||series.n,
      CASE
        WHEN (series.n-1)%20 BETWEEN 0 AND 3 THEN 'pending'
        WHEN (series.n-1)%20 BETWEEN 4 AND 10 THEN 'running'
        WHEN (series.n-1)%20 BETWEEN 11 AND 17 THEN 'retry_wait'
        ELSE 'enriched'
      END,
      CASE
        WHEN (series.n-1)%20 IN (2,3,10,17) THEN 3
        ELSE 1
      END,
      3,
      CASE
        WHEN (series.n-1)%20 BETWEEN 4 AND 6 THEN now()-interval '20 minutes'
        WHEN (series.n-1)%20 BETWEEN 7 AND 9 THEN now()
        WHEN (series.n-1)%20 = 10 THEN now()-interval '20 minutes'
        ELSE NULL
      END,
      CASE
        WHEN (series.n-1)%20 BETWEEN 11 AND 13 THEN now()-interval '5 minutes'
        WHEN (series.n-1)%20 BETWEEN 14 AND 16 THEN now()+interval '1 hour'
        WHEN (series.n-1)%20 = 17 THEN now()-interval '5 minutes'
        ELSE NULL
      END,
      0,NULL,50001-series.n,now()-(series.n||' milliseconds')::interval
    FROM pg_catalog.generate_series(1,50000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid),
      ('b','${tenantB}'::uuid)
    ) scope(label,tenant_id);

    ANALYZE public.leads;
  `);
}

async function g007p6CatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    columns: await client.unsafe(`
      SELECT a.attname,a.atttypid::regtype::text type_name,a.attnotnull,a.attisdropped
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.leads'::regclass
        AND a.attname IN (
          'tenant_id','enrichment_status','score','enrichment_attempt_count',
          'enrichment_max_attempts','enrichment_started_at','enrichment_next_retry_at'
        )
      ORDER BY a.attname
    `),
    constraints: await client.unsafe(`
      SELECT c.conname,c.contype,c.convalidated,c.connoinherit,
        pg_catalog.pg_get_constraintdef(c.oid) definition,
        CASE WHEN c.conindid<>0 THEN c.conindid::regclass::text ELSE NULL END backing_index,
        i.relkind,x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_constraint c
      LEFT JOIN pg_catalog.pg_class i ON i.oid=c.conindid
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
      WHERE c.connamespace='public'::regnamespace
        AND c.conrelid='public.leads'::regclass
        AND c.conname IN ('leads_enrichment_status_check','leads_tenant_id_id_unique')
      ORDER BY c.conname
    `),
    indexes: await client.unsafe(`
      SELECT i.relname,i.relkind,
        CASE WHEN i.relkind='i' THEN pg_catalog.pg_get_indexdef(i.oid) ELSE NULL END indexdef,
        x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
      WHERE n.nspname='public' AND (
        i.relname IN ('idx_leads_enrichment','idx_leads_enrichment_lease','idx_g007p5_leads_tenant_enrichment_ready')
        OR pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p6_leads_tenant_enrichment_')
        ) = 'idx_g007p6_leads_tenant_enrichment_'
      )
      ORDER BY i.relname
    `),
  };
}

async function expectG007P6RejectedWithoutChange(client: PgClient, label: string): Promise<void> {
  const before = await g007p6CatalogSnapshot(client);
  await client.unsafe("SAVEPOINT g007p6_before_migration");
  let failure: unknown;
  try {
    await client.unsafe(g007p6Sql);
  } catch (error) {
    failure = error;
  }
  await client.unsafe("ROLLBACK TO SAVEPOINT g007p6_before_migration");
  expect(failure, label).toBeInstanceOf(Error);
  expect((failure as Error).message, label).toMatch(/G007P6_INDEX_CATALOG_DRIFT/);
  expect(await g007p6CatalogSnapshot(client), label).toEqual(before);
  await client.unsafe("RELEASE SAVEPOINT g007p6_before_migration");
}

async function explain(client: PgClient, statement: string): Promise<string> {
  return (await client.unsafe<Record<string, string>[]>(
    `EXPLAIN (ANALYZE,COSTS OFF,TIMING OFF,SUMMARY OFF,BUFFERS) ${statement}`,
  )).map((row) => Object.values(row)[0]).join("\n");
}

async function explainPlanned(client: PgClient, statement: string): Promise<string> {
  return (await client.unsafe<Record<string, string>[]>(
    `EXPLAIN (COSTS OFF) ${statement}`,
  )).map((row) => Object.values(row)[0]).join("\n");
}

const G007P7_INDEX = "idx_g007p7_leads_tenant_ai_viability_repair";
const G007P7_INDEXDEF = "CREATE INDEX idx_g007p7_leads_tenant_ai_viability_repair ON public.leads USING btree (tenant_id, ai_checked_at DESC) WHERE ((ai_verification_status = 'site_found'::text) AND (ai_found_website_url IS NOT NULL) AND (ai_found_website_url <> ''::text) AND (COALESCE(ai_website_viability_status, ''::text) <> 'usable'::text))";

async function seedG007P7PlanRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${ownerB}');
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','g007p7-plan-a','G007P7 Plan A','active'),
      ('${tenantB}','g007p7-plan-b','G007P7 Plan B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${workspaceA}','${tenantA}','g007p7-plan-a','G007P7 Plan A','active'),
      ('${workspaceB}','${tenantB}','g007p7-plan-b','G007P7 Plan B','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES
      ('${membershipA}','${tenantA}','${ownerA}','${workspaceA}','active'),
      ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active');

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,ai_verification_status,ai_found_website_url,
      ai_website_viability_status,ai_checked_at,score,updated_at
    )
    SELECT
      'g007p7-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p7-place-'||scope.label||'-'||series.n,
      'G007P7 '||scope.label||' '||series.n,
      CASE WHEN (series.n-1)%10 <= 6 THEN 'site_found' ELSE 'no_site_found' END,
      CASE
        WHEN (series.n-1)%10 <= 4 THEN 'https://found.invalid/'||scope.label||'/'||series.n
        WHEN (series.n-1)%10 = 5 THEN ''
        WHEN (series.n-1)%10 = 6 THEN NULL
        ELSE 'https://other.invalid/'||scope.label||'/'||series.n
      END,
      CASE (series.n-1)%10
        WHEN 0 THEN 'broken'
        WHEN 1 THEN 'parked'
        WHEN 2 THEN 'placeholder'
        WHEN 3 THEN NULL
        WHEN 4 THEN 'usable'
        WHEN 5 THEN 'broken'
        WHEN 6 THEN 'broken'
        ELSE 'directory_only'
      END,
      CASE
        WHEN scope.label='b' THEN now()-(series.n||' milliseconds')::interval
        ELSE now()-interval '2 days'-(series.n||' milliseconds')::interval
      END,
      50001-series.n,
      now()-(series.n||' milliseconds')::interval
    FROM pg_catalog.generate_series(1,50000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid),
      ('b','${tenantB}'::uuid)
    ) scope(label,tenant_id);

    ANALYZE public.leads;
  `);
}

async function g007p7CatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    columns: await client.unsafe(`
      SELECT a.attname,a.atttypid::regtype::text type_name,a.attnotnull,a.attisdropped
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.leads'::regclass
        AND a.attname IN (
          'tenant_id','ai_verification_status','ai_found_website_url',
          'ai_website_viability_status','ai_checked_at'
        )
      ORDER BY a.attname
    `),
    constraints: await client.unsafe(`
      SELECT c.conname,c.contype,c.convalidated,c.connoinherit,
        pg_catalog.pg_get_constraintdef(c.oid) definition,
        CASE WHEN c.conindid<>0 THEN c.conindid::regclass::text ELSE NULL END backing_index,
        i.relkind,x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_constraint c
      LEFT JOIN pg_catalog.pg_class i ON i.oid=c.conindid
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
      WHERE c.connamespace='public'::regnamespace
        AND c.conrelid='public.leads'::regclass
        AND c.conname IN ('leads_ai_verification_status_check','leads_tenant_id_id_unique')
      ORDER BY c.conname
    `),
    indexes: await client.unsafe(`
      SELECT i.relname,i.relkind,
        CASE WHEN i.relkind='i' THEN pg_catalog.pg_get_indexdef(i.oid) ELSE NULL END indexdef,
        x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
      WHERE n.nspname='public' AND (
        i.relname IN (
          'idx_leads_ai_status_checked','idx_g007p5_leads_tenant_enrichment_ready',
          'idx_g007p6_leads_tenant_enrichment_recovery'
        ) OR pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p7_leads_tenant_ai_viability_')
        ) = 'idx_g007p7_leads_tenant_ai_viability_'
      )
      ORDER BY i.relname
    `),
  };
}

async function expectG007P7RejectedWithoutChange(client: PgClient, label: string): Promise<void> {
  const before = await g007p7CatalogSnapshot(client);
  await client.unsafe("SAVEPOINT g007p7_before_migration");
  let failure: unknown;
  try {
    await client.unsafe(g007p7Sql);
  } catch (error) {
    failure = error;
  }
  await client.unsafe("ROLLBACK TO SAVEPOINT g007p7_before_migration");
  expect(failure, label).toBeInstanceOf(Error);
  expect((failure as Error).message, label).toMatch(/G007P7_INDEX_CATALOG_DRIFT/);
  expect(await g007p7CatalogSnapshot(client), label).toEqual(before);
  await client.unsafe("RELEASE SAVEPOINT g007p7_before_migration");
}

const G007P8_INDEX = "idx_g007p8_leads_tenant_discovered_at";
const G007P8_INDEXDEF = "CREATE INDEX idx_g007p8_leads_tenant_discovered_at ON public.leads USING btree (tenant_id, discovered_at)";
const G007P8_TODAY = "2026-07-31";

async function seedG007P8PlanRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    SET TIME ZONE 'UTC';
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','g007p8-plan-a','G007P8 Plan A','active'),
      ('${tenantB}','g007p8-plan-b','G007P8 Plan B','active');

    INSERT INTO public.leads(
      id,tenant_id,place_id,name,discovered_at,updated_at,archived_at,is_excluded
    )
    SELECT
      'g007p8-'||scope.label||'-'||series.n,
      scope.tenant_id,
      'g007p8-place-'||scope.label||'-'||series.n,
      'G007P8 '||scope.label||' '||series.n,
      CASE
        WHEN series.n <= 10000 THEN
          '${G007P8_TODAY} 00:00:00+00'::timestamptz
          + ((series.n-1)||' milliseconds')::interval
          + CASE WHEN scope.label='b' THEN interval '12 hours' ELSE interval '0' END
        ELSE '${G007P8_TODAY} 00:00:00+00'::timestamptz
          - ((series.n-9999)||' seconds')::interval
      END,
      '${G007P8_TODAY} 12:00:00+00'::timestamptz,
      CASE WHEN series.n%10=0 THEN '${G007P8_TODAY} 06:00:00+00'::timestamptz ELSE NULL END,
      CASE WHEN series.n%10=1 THEN 1 ELSE 0 END
    FROM pg_catalog.generate_series(1,100000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid),
      ('b','${tenantB}'::uuid)
    ) scope(label,tenant_id)
    ORDER BY series.n,scope.label;
  `);
  await client.unsafe("VACUUM (ANALYZE) public.leads");
}

async function g007p8CatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    columns: await client.unsafe(`
      SELECT a.attname,a.atttypid::regtype::text type_name,a.attnotnull,a.attisdropped
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.leads'::regclass
        AND a.attname IN ('tenant_id','discovered_at')
      ORDER BY a.attname
    `),
    constraints: await client.unsafe(`
      SELECT c.conname,c.contype,c.convalidated,
        pg_catalog.pg_get_constraintdef(c.oid) definition,
        CASE WHEN c.conindid<>0 THEN c.conindid::regclass::text ELSE NULL END backing_index,
        i.relkind,x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_constraint c
      LEFT JOIN pg_catalog.pg_class i ON i.oid=c.conindid
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
      WHERE c.connamespace='public'::regnamespace
        AND c.conrelid='public.leads'::regclass
        AND c.conname='leads_tenant_id_id_unique'
      ORDER BY c.conname
    `),
    indexes: await client.unsafe(`
      SELECT i.relname,i.relkind,
        CASE WHEN i.relkind='i' THEN pg_catalog.pg_get_indexdef(i.oid) ELSE NULL END indexdef,
        x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
      WHERE n.nspname='public' AND (
        i.relname IN (
          'idx_leads_discovered_at','idx_leads_active_discovered_at',
          'idx_g007p5_leads_tenant_enrichment_ready',
          'idx_g007p6_leads_tenant_enrichment_recovery',
          'idx_g007p7_leads_tenant_ai_viability_repair'
        ) OR pg_catalog.left(
          i.relname,
          pg_catalog.length('idx_g007p8_leads_tenant_discovered_')
        ) = 'idx_g007p8_leads_tenant_discovered_'
      )
      ORDER BY i.relname
    `),
  };
}

async function expectG007P8RejectedWithoutChange(client: PgClient, label: string): Promise<void> {
  const before = await g007p8CatalogSnapshot(client);
  await client.unsafe("SAVEPOINT g007p8_before_migration");
  let failure: unknown;
  try {
    await client.unsafe(g007p8Sql);
  } catch (error) {
    failure = error;
  }
  await client.unsafe("ROLLBACK TO SAVEPOINT g007p8_before_migration");
  expect(failure, label).toBeInstanceOf(Error);
  expect((failure as Error).message, label).toMatch(/G007P8_INDEX_CATALOG_DRIFT/);
  expect(await g007p8CatalogSnapshot(client), label).toEqual(before);
  await client.unsafe("RELEASE SAVEPOINT g007p8_before_migration");
}

const G007P11_INDEX = "idx_g007p11_admin_tenant_open_priority_status_created";
const G007P11_INDEXDEF = `CREATE INDEX idx_g007p11_admin_tenant_open_priority_status_created ON public.admin_requests USING btree (tenant_id, (
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
END), created_at DESC) WHERE (status = ANY (ARRAY['new'::text, 'seen'::text, 'in_progress'::text, 'waiting_on_researcher'::text]))`;
const G007P11_OPEN = "'new','seen','in_progress','waiting_on_researcher'";

async function seedG007P11PlanRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${ownerB}');
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','g007p11-plan-a','G007P11 Plan A','active'),
      ('${tenantB}','g007p11-plan-b','G007P11 Plan B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${workspaceA}','${tenantA}','g007p11-plan-a','G007P11 Plan A','active'),
      ('${workspaceB}','${tenantB}','g007p11-plan-b','G007P11 Plan B','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,status) VALUES
      ('${membershipA}','${tenantA}','${ownerA}','active'),
      ('${membershipB}','${tenantB}','${ownerB}','active');
    INSERT INTO public.app_users(id,user_id,email,display_name,role,status,is_team_lead) VALUES
      ('g007p11-user-a','${ownerA}','a@g007p11.invalid','Tenant A Admin','admin','active',1),
      ('g007p11-user-b','${ownerB}','b@g007p11.invalid','Tenant B Admin','admin','active',1);

    INSERT INTO public.leads(id,place_id,name,assigned_to_user_id,tenant_id,created_at,updated_at)
    SELECT
      'p11-lead-'||scope.label||'-'||pg_catalog.lpad(series.n::text,6,'0'),
      'p11-place-'||scope.label||'-'||pg_catalog.lpad(series.n::text,6,'0'),
      'G007P11 Lead '||scope.label||' '||series.n,
      scope.owner_id,
      scope.tenant_id,
      scope.base_time + series.n * interval '1 microsecond',
      scope.base_time + series.n * interval '1 microsecond'
    FROM pg_catalog.generate_series(1,72000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid,'${ownerA}'::uuid,timestamptz '2026-01-01 00:00:00+00',1),
      ('b','${tenantB}'::uuid,'${ownerB}'::uuid,timestamptz '2027-01-01 00:00:00+00',2)
    ) scope(label,tenant_id,owner_id,base_time,ordinal)
    ORDER BY series.n,scope.ordinal;

    INSERT INTO public.admin_requests(
      id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status,
      priority,summary,workspace_id,tenant_id,created_at,updated_at
    )
    SELECT
      'p11-request-'||scope.label||'-'||pg_catalog.lpad(series.n::text,6,'0'),
      'p11-lead-'||scope.label||'-'||pg_catalog.lpad(series.n::text,6,'0'),
      scope.owner_id,
      scope.owner_id,
      CASE ((series.n-1)/6)%2 WHEN 0 THEN 'website_request' ELSE 'quote_request' END,
      (ARRAY['new','seen','in_progress','waiting_on_researcher','done','cancelled'])[((series.n-1)%6)+1],
      (ARRAY['urgent','normal','low'])[(((series.n-1)/12)%3)+1],
      'Synthetic G007P11 '||scope.label||' '||series.n,
      CASE WHEN series.n % 2 = 0 THEN scope.workspace_id ELSE NULL END,
      scope.tenant_id,
      scope.base_time + series.n * interval '1 microsecond',
      scope.base_time + series.n * interval '1 microsecond'
    FROM pg_catalog.generate_series(1,72000) series(n)
    CROSS JOIN (VALUES
      ('a','${tenantA}'::uuid,'${workspaceA}'::uuid,'${ownerA}'::uuid,timestamptz '2026-01-01 00:00:00+00',1),
      ('b','${tenantB}'::uuid,'${workspaceB}'::uuid,'${ownerB}'::uuid,timestamptz '2027-01-01 00:00:00+00',2)
    ) scope(label,tenant_id,workspace_id,owner_id,base_time,ordinal)
    ORDER BY series.n,scope.ordinal;
  `);
  await client.unsafe("VACUUM (ANALYZE) public.leads");
  await client.unsafe("VACUUM (ANALYZE) public.admin_requests");
  await client.unsafe("VACUUM (ANALYZE) public.app_users");
}

function g007p11ListQuery(options: { tenant?: string; leadId?: string; requestType?: "website_request" | "quote_request"; limit: number }): string {
  const predicates = [`ar.status IN (${G007P11_OPEN})`];
  if (options.tenant) predicates.unshift(`ar.tenant_id='${options.tenant}'`);
  if (options.leadId) predicates.push(`ar.lead_id='${options.leadId}'`);
  if (options.requestType) predicates.push(`ar.request_type='${options.requestType}'`);
  return `SELECT ar.*,
      l.name AS lead_name,l.phone AS lead_phone,l.address AS lead_address,
      l.website_status AS lead_website_status,l.assigned_to_user_id AS lead_owner_user_id,
      owner.email AS lead_owner_email,owner.display_name AS lead_owner_display_name,
      creator.email AS creator_email,creator.display_name AS creator_display_name,
      COALESCE(creator.team_lead_user_id,CASE WHEN creator.is_team_lead=1 THEN creator.user_id ELSE NULL END) AS creator_team_lead_user_id,
      team_lead.email AS creator_team_lead_email,team_lead.display_name AS creator_team_lead_display_name,
      creator.team_label AS creator_team_label
    FROM public.admin_requests ar
    LEFT JOIN public.leads l ON l.id=ar.lead_id
    LEFT JOIN public.app_users owner ON owner.user_id=l.assigned_to_user_id
    LEFT JOIN public.app_users creator ON creator.user_id=ar.created_by_user_id
    LEFT JOIN public.app_users team_lead ON team_lead.user_id=COALESCE(creator.team_lead_user_id,CASE WHEN creator.is_team_lead=1 THEN creator.user_id ELSE NULL END)
    WHERE ${predicates.join(" AND ")}
    ORDER BY
      CASE ar.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      CASE ar.status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END,
      ar.created_at DESC
    LIMIT ${options.limit}`;
}

function g007p11IdDigest(rows: Array<{ id: string }>): string {
  return createHash("sha256").update(rows.map((row) => row.id).join("\n")).digest("hex");
}

async function g007p11CatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    columns: await client.unsafe(`
      SELECT a.attname,a.atttypid::regtype::text type_name,a.attnotnull,a.attisdropped
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.admin_requests'::regclass
        AND a.attname IN ('id','tenant_id','workspace_id','lead_id','request_type','status','priority','created_at')
      ORDER BY a.attname
    `),
    constraints: await client.unsafe(`
      SELECT c.conrelid::regclass::text table_name,c.conname,c.contype,c.convalidated,c.connoinherit,
        pg_catalog.pg_get_constraintdef(c.oid) definition,
        CASE WHEN c.conindid<>0 THEN c.conindid::regclass::text ELSE NULL END backing_index,
        i.relkind,x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_constraint c
      LEFT JOIN pg_catalog.pg_class i ON i.oid=c.conindid
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
      WHERE (c.conrelid,c.conname) IN (
        ('public.admin_requests'::regclass,'admin_requests_pkey'),
        ('public.admin_requests'::regclass,'admin_requests_request_type_check'),
        ('public.admin_requests'::regclass,'admin_requests_status_check'),
        ('public.admin_requests'::regclass,'admin_requests_priority_check'),
        ('public.admin_requests'::regclass,'admin_requests_tenant_lead_fkey'),
        ('public.admin_requests'::regclass,'admin_requests_tenant_workspace_fkey'),
        ('public.leads'::regclass,'leads_tenant_id_id_unique'),
        ('public.workspaces'::regclass,'workspaces_tenant_id_id_unique')
      ) ORDER BY table_name,c.conname
    `),
    indexes: await client.unsafe(`
      SELECT i.relname,i.relkind,
        CASE WHEN i.relkind='i' THEN pg_catalog.pg_get_indexdef(i.oid) ELSE NULL END indexdef,
        x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_class i
      JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
      WHERE n.nspname='public' AND (
        i.relname IN (
          'idx_admin_requests_status_type_created','idx_admin_requests_tenant_lead_created',
          'admin_requests_tenant_lead_open_unique','idx_admin_requests_creator_created'
        ) OR pg_catalog.left(i.relname,pg_catalog.length('idx_g007p11_'))='idx_g007p11_'
      ) ORDER BY i.relname
    `),
  };
}

async function expectG007P11RejectedWithoutChange(client: PgClient, label: string): Promise<void> {
  const before = await g007p11CatalogSnapshot(client);
  await client.unsafe("SAVEPOINT g007p11_before_migration");
  let failure: unknown;
  try {
    await client.unsafe(g007p11Sql);
  } catch (error) {
    failure = error;
  }
  await client.unsafe("ROLLBACK TO SAVEPOINT g007p11_before_migration");
  expect(failure, label).toBeInstanceOf(Error);
  expect((failure as Error).message, label).toMatch(/G007P11_INDEX_CATALOG_DRIFT/);
  expect(await g007p11CatalogSnapshot(client), label).toEqual(before);
  await client.unsafe("RELEASE SAVEPOINT g007p11_before_migration");
}

async function targetSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const table of targetTables) {
    snapshot[table] = await client.unsafe(`SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY id`);
  }
  snapshot.receipts = await client.unsafe("SELECT to_jsonb(r) AS row FROM public.compatibility_backfill_receipts r ORDER BY idempotency_key");
  return snapshot;
}

async function targetCatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    columns: await client.unsafe(`
      SELECT table_name,column_name,data_type,is_nullable,column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name IN ('leads','lead_notes','outreach_events','admin_requests','demos')
       ORDER BY table_name,ordinal_position
    `),
    constraints: await client.unsafe(`
      SELECT c.conrelid::regclass::text table_name,c.conname,pg_catalog.pg_get_constraintdef(c.oid) definition
        FROM pg_catalog.pg_constraint c
       WHERE c.conrelid IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
       ORDER BY table_name,c.conname
    `),
    indexes: await client.unsafe(`
      SELECT tablename,indexname,indexdef
        FROM pg_catalog.pg_indexes
       WHERE schemaname='public' AND tablename IN ('leads','lead_notes','outreach_events','admin_requests','demos')
       ORDER BY tablename,indexname
    `),
    triggers: await client.unsafe(`
      SELECT c.relname table_name,t.tgname,pg_catalog.pg_get_triggerdef(t.oid) definition
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
       WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace
         AND c.relname IN ('leads','lead_notes','outreach_events','admin_requests','demos')
       ORDER BY c.relname,t.tgname
    `),
    functions: await client.unsafe(`
      SELECT p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) arguments,
        pg_catalog.pg_get_functiondef(p.oid) definition,p.proconfig,p.prosecdef,p.proacl,
        pg_catalog.pg_get_userbyid(p.proowner) owner,pg_catalog.obj_description(p.oid,'pg_proc') comment
        FROM pg_catalog.pg_proc p
       WHERE p.pronamespace='public'::regnamespace
         AND p.proname IN ('novatrade_assert_lead_actor','novatrade_inherit_lead_child_scope','novatrade_lead_scope_guard','novatrade_published_demo_public')
       ORDER BY p.proname,arguments
    `),
    tables: await client.unsafe(`
      SELECT c.relname,c.relrowsecurity,c.relacl
        FROM pg_catalog.pg_class c
       WHERE c.oid IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
       ORDER BY c.relname
    `),
  };
}

const leadAiQueueIndexNames = [
  "idx_leads_ai_queue_ready",
  "idx_leads_ai_queue_status",
  "idx_g007p_leads_tenant_ai_queue_ready",
  "idx_g007p_leads_tenant_ai_queue_status",
] as const;

type LeadAiQueueIndex = {
  indexname: string;
  relkind: string;
  indexdef: string | null;
  indisvalid: boolean | null;
  indisready: boolean | null;
  indislive: boolean | null;
};

async function leadAiQueueIndexSnapshot(client: PgClient): Promise<LeadAiQueueIndex[]> {
  return await client.unsafe<LeadAiQueueIndex[]>(`
    SELECT i.relname indexname,i.relkind,
      CASE WHEN i.relkind='i' THEN pg_catalog.pg_get_indexdef(i.oid) ELSE NULL END indexdef,
      x.indisvalid,x.indisready,x.indislive
    FROM pg_catalog.pg_class i
    JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
    LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=i.oid
    WHERE n.nspname='public' AND i.relname=ANY($1::text[])
    ORDER BY i.relname
  `, [leadAiQueueIndexNames]);
}

async function g007p3CatalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    queueIndexes: await leadAiQueueIndexSnapshot(client),
    foundation: await client.unsafe(`
      SELECT c.conname,c.convalidated,pg_catalog.pg_get_constraintdef(c.oid) definition,
        c.conindid::regclass::text backing_index,i.relkind,
        x.indisunique,x.indisvalid,x.indisready,x.indislive
      FROM pg_catalog.pg_constraint c
      LEFT JOIN pg_catalog.pg_class i ON i.oid=c.conindid
      LEFT JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
      WHERE c.connamespace='public'::regnamespace
        AND c.conrelid='public.leads'::regclass
        AND c.conname='leads_tenant_id_id_unique'
    `),
  };
}

async function expectG007P3RejectedWithoutChange(client: PgClient, label: string): Promise<void> {
  const before = await g007p3CatalogSnapshot(client);
  let failure: unknown;
  try {
    await client.unsafe(g007p3Sql);
  } catch (error) {
    failure = error;
  }
  expect(failure, label).toBeInstanceOf(Error);
  expect((failure as Error).message, label).toMatch(/G007P3_INDEX_CATALOG_DRIFT/);
  await client.unsafe("ROLLBACK");
  expect(await g007p3CatalogSnapshot(client), label).toEqual(before);
}

async function expectMigrationRejected(client: PgClient, pattern: RegExp, label?: string): Promise<void> {
  const catalogBefore = await targetCatalogSnapshot(client);
  let migrationError: unknown;
  try {
    await client.unsafe(g003Sql);
  } catch (error) {
    migrationError = error;
  }
  expect(migrationError, label).toBeInstanceOf(Error);
  expect((migrationError as Error).message, label).toMatch(pattern);
  await client.unsafe("ROLLBACK");
  expect(await targetCatalogSnapshot(client)).toEqual(catalogBefore);
}

async function assertCatalog(client: PgClient): Promise<void> {
  const nullability = await client.unsafe<Array<{ table_name: string; is_nullable: string }>>(`
    SELECT table_name,is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenant_id' AND table_name IN ('leads','lead_notes','outreach_events','admin_requests','demos')
     ORDER BY table_name
  `);
  expect(nullability).toHaveLength(5);
  expect(nullability.every((row) => row.is_nullable === "NO")).toBe(true);
  expect((await client.unsafe("SELECT count(*)::integer count FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='workspace_id'"))[0].count).toBe(0);
  const constraints = await client.unsafe<Array<{ conname: string; convalidated: boolean; definition: string }>>(`
    SELECT conname,convalidated,pg_catalog.pg_get_constraintdef(oid) definition FROM pg_catalog.pg_constraint
     WHERE conname IN ('leads_tenant_id_id_unique','leads_tenant_place_id_unique','lead_notes_tenant_lead_fkey','outreach_events_tenant_lead_fkey','admin_requests_tenant_lead_fkey','demos_tenant_lead_fkey','lead_notes_tenant_workspace_fkey','outreach_events_tenant_workspace_fkey','admin_requests_tenant_workspace_fkey','demos_tenant_workspace_fkey')
     ORDER BY conname
  `);
  expect(constraints).toHaveLength(10);
  expect(constraints.every((row) => row.convalidated)).toBe(true);
  expect(constraints.filter((row) => row.conname.endsWith("_tenant_lead_fkey")).every((row) => row.definition.includes("FOREIGN KEY (tenant_id, lead_id)"))).toBe(true);
  expect(constraints.filter((row) => row.conname.endsWith("_tenant_workspace_fkey")).every((row) => row.definition.includes("FOREIGN KEY (tenant_id, workspace_id)"))).toBe(true);
  expect((await client.unsafe("SELECT pg_catalog.to_regclass('public.idx_leads_tenant_place_id') IS NULL absent"))[0].absent).toBe(true);
  expect((await client.unsafe(`
    SELECT pg_catalog.pg_get_expr(x.indpred,x.indrelid) predicate
      FROM pg_catalog.pg_index x WHERE x.indexrelid='public.admin_requests_tenant_lead_open_unique'::regclass
  `))[0].predicate).toBe("(status = ANY (ARRAY['new'::text, 'seen'::text, 'in_progress'::text, 'waiting_on_researcher'::text]))");
  expect((await client.unsafe(`
    SELECT count(*)::integer count FROM pg_catalog.pg_trigger t
     WHERE (t.tgrelid,t.tgname) IN (
       ('public.leads'::regclass,'trg_novatrade_lead_scope_guard'),
       ('public.lead_notes'::regclass,'trg_novatrade_lead_notes_scope'),
       ('public.outreach_events'::regclass,'trg_novatrade_outreach_events_scope'),
       ('public.admin_requests'::regclass,'trg_novatrade_admin_requests_scope'),
       ('public.demos'::regclass,'trg_novatrade_demos_scope')
     ) AND t.tgtype=23 AND t.tgenabled='O' AND NOT t.tgisinternal
  `))[0].count).toBe(5);
  const functions = await client.unsafe<Array<{ proname: string; owner: string; table_owner: string; proconfig: string[]; prosecdef: boolean; anon_execute: boolean; authenticated_execute: boolean }>>(`
    SELECT p.proname,pg_catalog.pg_get_userbyid(p.proowner) owner,
      pg_catalog.pg_get_userbyid((SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid='public.leads'::regclass)) table_owner,
      p.proconfig,p.prosecdef,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
      FROM pg_catalog.pg_proc p
     WHERE p.proname IN ('novatrade_assert_lead_actor','novatrade_inherit_lead_child_scope','novatrade_lead_scope_guard','novatrade_published_demo_public')
     ORDER BY p.proname
  `);
  expect(functions).toHaveLength(4);
  for (const fn of functions) {
    expect(fn.proconfig).toEqual(["search_path=pg_catalog, public"]);
    expect(fn.owner).toBe(fn.table_owner);
  }
  expect(functions.find((fn) => fn.proname === "novatrade_published_demo_public")).toMatchObject({ prosecdef: true, anon_execute: true, authenticated_execute: false });
  for (const fn of functions.filter((row) => row.proname !== "novatrade_published_demo_public")) {
    expect(fn).toMatchObject({ prosecdef: false, anon_execute: false, authenticated_execute: false });
  }
  expect((await client.unsafe(`SELECT count(*)::integer count FROM pg_catalog.pg_class WHERE oid IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass) AND relrowsecurity`))[0].count).toBe(5);
  for (const role of ["anon", "authenticated"]) {
    for (const table of targetTables) expect((await client.unsafe("SELECT pg_catalog.has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed", [role, `public.${table}`]))[0].allowed).toBe(false);
  }
}

async function addTenantB(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerB}') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenants(id,slug,name,status) VALUES ('${tenantB}','tenant-b','Tenant B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceB}','${tenantB}','workspace-b','Workspace B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status)
      VALUES ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active') ON CONFLICT DO NOTHING;
  `);
}

describe("G-003 lead CRM tenant scope", () => {
  it("declares the complete receipt, ownership, actor, replay, and public-projection contract", () => {
    for (const code of [
      "G003_UNRECONCILED_T028_SCOPE", "G003_MATCHING_T028_RECEIPT_REQUIRED", "G003_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED",
      "G003_T028_RECEIPT_SCOPE_DRIFT", "G003_LEAD_CHILD_ORPHAN_OR_SCOPE_MISMATCH", "G003_EXISTING_ACTOR_SCOPE_INVALID",
      "G003_LEAD_CHILD_SCOPE_IMMUTABLE", "G003_LEAD_TENANT_IMMUTABLE", "G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED",
    ]) expect(g003Sql).toContain(code);
    expect(g003Sql).toContain("UNIQUE(tenant_id,place_id)");
    expect(g003Sql).toContain("IN SHARE ROW EXCLUSIVE MODE");
    expect(g003Sql).toContain("G003_WRITER_LOCKS_ACQUIRED");
    expect(g003Sql).toContain("FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)");
    expect(g003Sql).toContain("admin_requests_tenant_lead_open_unique");
    expect(g003Sql).toContain("SET search_path = pg_catalog, public");
    expect(g003Sql).toContain("JOIN public.leads l ON (l.tenant_id,l.id)=(d.tenant_id,d.lead_id)");
    for (const key of ["headline", "subheadline", "services", "trustSignals", "primaryCta", "secondaryCta", "websiteGap"]) expect(g003Sql).toContain(`'${key}'`);
    expect(g003Sql).toContain("REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos");
    expect(g003Sql).not.toContain("CREATE INDEX idx_leads_tenant_place_id");
    expect(g003Sql).not.toMatch(/(?:pg_catalog\.)?digest\s*\(|CREATE\s+EXTENSION/i);
  });

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "installs the additive G-007P6 tenant enrichment recovery index with exact guards and compatible plans",
    async () => {
      const url = process.env.G003_DATABASE_URL;
      if (!url) throw new Error("G003_DATABASE_URL is required");
      const parsed = new URL(url);
      if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
      const client = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        expect((await client.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);

        const full = await resetDatabase(client, true);
        expect(full).toEqual({ discovered: 54, applied: 52, skipped: 2 });
        const fullIndexes = (await g007p6CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>;
        expect(fullIndexes.find((row) => row.relname === G007P6_INDEX)).toEqual({
          relname: G007P6_INDEX,
          relkind: "i",
          indexdef: G007P6_INDEXDEF,
          indisunique: false,
          indisvalid: true,
          indisready: true,
          indislive: true,
        });
        const exactReplayBefore = await g007p6CatalogSnapshot(client);
        await client.unsafe(g007p6Sql);
        expect(await g007p6CatalogSnapshot(client)).toEqual(exactReplayBefore);

        const baselineReceipt = await resetDatabase(client, true, false, G007P6_MIGRATION);
        expect(baselineReceipt).toEqual({ discovered: 54, applied: 46, skipped: 2 });
        const baselineCatalog = await g007p6CatalogSnapshot(client);
        expect((baselineCatalog.indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          "idx_leads_enrichment",
          "idx_leads_enrichment_lease",
        ]);

        await client.unsafe("BEGIN");
        await client.unsafe("CREATE INDEX idxXg007p6XleadsXtenantXenrichmentXshadow ON public.leads(id)");
        expect(await g007p6CatalogSnapshot(client)).toEqual(baselineCatalog);
        await client.unsafe(g007p6Sql);
        expect(((await g007p6CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          G007P6_INDEX,
          "idx_leads_enrichment",
          "idx_leads_enrichment_lease",
        ]);
        expect((await client.unsafe("SELECT pg_catalog.to_regclass('public.idxXg007p6XleadsXtenantXenrichmentXshadow') IS NOT NULL present"))[0].present).toBe(true);
        await client.unsafe("ROLLBACK");
        expect(await g007p6CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe(g007p6Sql);
        expect(((await g007p6CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P6_INDEX)?.indexdef).toBe(G007P6_INDEXDEF);
        await client.unsafe("ROLLBACK");
        expect(await g007p6CatalogSnapshot(client)).toEqual(baselineCatalog);

        const baselineMutations: Array<[string, string]> = [
          ["missing_global", "DROP INDEX public.idx_leads_enrichment"],
          ["global_order_spoof", "DROP INDEX public.idx_leads_enrichment; CREATE INDEX idx_leads_enrichment ON public.leads(score DESC,enrichment_status)"],
          ["global_lease_predicate_spoof", "DROP INDEX public.idx_leads_enrichment_lease; CREATE INDEX idx_leads_enrichment_lease ON public.leads(enrichment_status,enrichment_next_retry_at,score DESC) WHERE archived_at IS NULL"],
          ["global_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.idx_leads_enrichment_lease'::regclass"],
          ["global_non_index", "DROP INDEX public.idx_leads_enrichment; CREATE TABLE public.idx_leads_enrichment(sentinel integer)"],
          ["p5_candidate_present", "CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready ON public.leads(tenant_id,score DESC,updated_at ASC) WHERE enrichment_status='pending' AND enrichment_attempt_count<enrichment_max_attempts AND score>0 AND archived_at IS NULL AND COALESCE(is_excluded,0)=0"],
          ["reserved_p6_sibling", "CREATE INDEX idx_g007p6_leads_tenant_enrichment_spoof ON public.leads(id)"],
          ["tenant_nullable", "ALTER TABLE public.leads ALTER COLUMN tenant_id DROP NOT NULL"],
          ["attempt_count_nullable", "ALTER TABLE public.leads ALTER COLUMN enrichment_attempt_count DROP NOT NULL"],
          ["next_retry_not_nullable", "ALTER TABLE public.leads ALTER COLUMN enrichment_next_retry_at SET NOT NULL"],
          ["started_at_wrong_type", "ALTER TABLE public.leads ALTER COLUMN enrichment_started_at TYPE timestamp without time zone USING enrichment_started_at::timestamp without time zone"],
          ["status_constraint_set_spoof", "ALTER TABLE public.leads DROP CONSTRAINT leads_enrichment_status_check; ALTER TABLE public.leads ADD CONSTRAINT leads_enrichment_status_check CHECK (enrichment_status IN ('pending','running','retry_wait','enriched','skipped'))"],
          ["foundation_backing_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid=(SELECT conindid FROM pg_catalog.pg_constraint WHERE connamespace='public'::regnamespace AND conrelid='public.leads'::regclass AND conname='leads_tenant_id_id_unique')`],
        ];
        for (const [label, mutation] of baselineMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P6RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p6CatalogSnapshot(client), label).toEqual(baselineCatalog);
        }

        await client.unsafe(g007p6Sql);
        const installedCatalog = await g007p6CatalogSnapshot(client);
        const finalMutations: Array<[string, string]> = [
          ["candidate_order_spoof", `DROP INDEX public.${G007P6_INDEX}; CREATE INDEX ${G007P6_INDEX} ON public.leads(enrichment_status,tenant_id,score DESC) WHERE enrichment_status IN ('running','retry_wait')`],
          ["candidate_direction_spoof", `DROP INDEX public.${G007P6_INDEX}; CREATE INDEX ${G007P6_INDEX} ON public.leads(tenant_id,enrichment_status,score ASC) WHERE enrichment_status IN ('running','retry_wait')`],
          ["candidate_predicate_spoof", `DROP INDEX public.${G007P6_INDEX}; CREATE INDEX ${G007P6_INDEX} ON public.leads(tenant_id,enrichment_status,score DESC) WHERE enrichment_status IN ('running','retry_wait') AND score>0`],
          ["candidate_status_set_spoof", `DROP INDEX public.${G007P6_INDEX}; CREATE INDEX ${G007P6_INDEX} ON public.leads(tenant_id,enrichment_status,score DESC) WHERE enrichment_status='running'`],
          ["candidate_non_index", `DROP INDEX public.${G007P6_INDEX}; CREATE TABLE public.${G007P6_INDEX}(sentinel integer)`],
          ["candidate_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.${G007P6_INDEX}'::regclass`],
          ["candidate_reserved_sibling", "CREATE INDEX idx_g007p6_leads_tenant_enrichment_shadow ON public.leads(id)"],
          ["final_status_constraint_spoof", "ALTER TABLE public.leads DROP CONSTRAINT leads_enrichment_status_check; ALTER TABLE public.leads ADD CONSTRAINT leads_enrichment_status_check CHECK (enrichment_status IN ('pending','running','retry_wait','enriched','skipped'))"],
        ];
        for (const [label, mutation] of finalMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P6RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p6CatalogSnapshot(client), label).toEqual(installedCatalog);
        }

        await client.unsafe("BEGIN");
        await client.unsafe(`
          DROP INDEX public.idx_leads_enrichment;
          DROP INDEX public.idx_leads_enrichment_lease;
          CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready
            ON public.leads(tenant_id,score DESC,updated_at ASC)
            WHERE enrichment_status='pending'
              AND enrichment_attempt_count<enrichment_max_attempts
              AND score>0 AND archived_at IS NULL AND COALESCE(is_excluded,0)=0;
        `);
        const forwardCompatibleFinal = await g007p6CatalogSnapshot(client);
        await client.unsafe(g007p6Sql);
        expect(await g007p6CatalogSnapshot(client)).toEqual(forwardCompatibleFinal);
        await client.unsafe("ROLLBACK");
        expect(await g007p6CatalogSnapshot(client)).toEqual(installedCatalog);

        await resetDatabase(client, true, false, G007P6_MIGRATION);
        await seedG007P6PlanRows(client);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.leads"))[0].count).toBe(100000);
        expect((await client.unsafe(`SELECT count(*)::integer count FROM public.leads WHERE tenant_id='${tenantA}' AND enrichment_status='running' AND enrichment_attempt_count<enrichment_max_attempts AND enrichment_started_at<=now()-interval '10 minutes'`))[0].count).toBe(7500);
        expect((await client.unsafe(`SELECT count(*)::integer count FROM public.leads WHERE tenant_id='${tenantA}' AND enrichment_status='retry_wait' AND enrichment_attempt_count<enrichment_max_attempts AND enrichment_next_retry_at<=now()`))[0].count).toBe(7500);

        const scopedStaleSelector = `SELECT id FROM public.leads WHERE tenant_id='${tenantA}' AND enrichment_status='running' AND (enrichment_started_at IS NULL OR enrichment_started_at<=now()-interval '10 minutes') AND enrichment_attempt_count<enrichment_max_attempts ORDER BY score DESC`;
        const scopedDueSelector = `SELECT id FROM public.leads WHERE tenant_id='${tenantA}' AND enrichment_status='retry_wait' AND enrichment_attempt_count<enrichment_max_attempts AND (enrichment_next_retry_at IS NULL OR enrichment_next_retry_at<=now()) ORDER BY score DESC`;
        const baselineStalePlan = await explain(client, scopedStaleSelector);
        const baselineDuePlan = await explain(client, scopedDueSelector);
        for (const [label, plan] of [["stale", baselineStalePlan], ["due", baselineDuePlan]] as const) {
          expect(plan, label).toContain("idx_leads_enrichment");
          expect(plan, label).toMatch(/Filter: .*tenant_id/u);
          expect(plan, label).toMatch(/Rows Removed by Filter: [1-9][0-9]*/u);
        }

        const scopedStaleUpdate = `UPDATE public.leads SET enrichment_status='pending',enrichment_started_at=NULL,enrichment_finished_at=now(),updated_at=now() WHERE tenant_id='${tenantA}' AND enrichment_status='running' AND (enrichment_started_at IS NULL OR enrichment_started_at<=now()-interval '10 minutes') AND enrichment_attempt_count<enrichment_max_attempts RETURNING id`;
        const scopedDueUpdate = `UPDATE public.leads SET enrichment_status='pending',enrichment_next_retry_at=NULL,updated_at=now() WHERE tenant_id='${tenantA}' AND enrichment_status='retry_wait' AND enrichment_attempt_count<enrichment_max_attempts AND (enrichment_next_retry_at IS NULL OR enrichment_next_retry_at<=now()) RETURNING id`;
        const explainRolledBack = async (statement: string): Promise<string> => {
          await client.unsafe("BEGIN");
          try {
            return await explain(client, statement);
          } finally {
            await client.unsafe("ROLLBACK");
          }
        };
        const baselineStaleUpdatePlan = await explainRolledBack(scopedStaleUpdate);
        const baselineDueUpdatePlan = await explainRolledBack(scopedDueUpdate);
        for (const [label, plan] of [["stale update", baselineStaleUpdatePlan], ["due update", baselineDueUpdatePlan]] as const) {
          expect(plan, label).toContain("idx_leads_enrichment");
          expect(plan, label).toMatch(/Filter: .*tenant_id/u);
          expect(plan, label).toMatch(/Rows Removed by Filter: [1-9][0-9]*/u);
        }
        const affectedIds = async (statement: string): Promise<string[]> => {
          await client.unsafe("BEGIN");
          try {
            return (await client.unsafe<Array<{ id: string }>>(statement)).map((row) => row.id).sort();
          } finally {
            await client.unsafe("ROLLBACK");
          }
        };
        const baselineStaleIds = await affectedIds(scopedStaleUpdate);
        const baselineDueIds = await affectedIds(scopedDueUpdate);
        expect(baselineStaleIds).toHaveLength(7500);
        expect(baselineDueIds).toHaveLength(7500);
        const globalsBefore = ((await g007p6CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).filter((row) => String(row.relname).startsWith("idx_leads_enrichment"));

        await client.unsafe("VACUUM (ANALYZE) public.leads");
        const compatibilityStatements = {
          stale: "UPDATE public.leads SET enrichment_status='pending',enrichment_started_at=NULL,enrichment_finished_at=now(),updated_at=now() WHERE enrichment_status='running' AND (enrichment_started_at IS NULL OR enrichment_started_at<=now()-interval '10 minutes') AND enrichment_attempt_count<enrichment_max_attempts",
          due: "UPDATE public.leads SET enrichment_status='pending',enrichment_next_retry_at=NULL,updated_at=now() WHERE enrichment_status='retry_wait' AND enrichment_attempt_count<enrichment_max_attempts AND (enrichment_next_retry_at IS NULL OR enrichment_next_retry_at<=now())",
          exhausted: "UPDATE public.leads SET enrichment_status='error',enrichment_finished_at=now(),enrichment_next_retry_at=NULL,enrichment_last_error=COALESCE(enrichment_last_error,'Max enrichment attempts exhausted.'),enrichment_last_error_code=COALESCE(enrichment_last_error_code,'max_attempts_exhausted'),updated_at=now() WHERE enrichment_status IN ('pending','running','retry_wait') AND enrichment_attempt_count>=enrichment_max_attempts",
          ready: "SELECT * FROM public.leads WHERE enrichment_status='pending' AND score>0 AND enrichment_attempt_count<enrichment_max_attempts AND COALESCE(is_excluded,0)=0 AND archived_at IS NULL ORDER BY score DESC LIMIT 25",
          lease: "UPDATE public.leads SET enrichment_status='running',enrichment_attempt_count=enrichment_attempt_count+1,enrichment_started_at=now(),enrichment_finished_at=NULL,enrichment_next_retry_at=NULL,enrichment_last_error=NULL,enrichment_last_error_code=NULL,updated_at=now() WHERE id=(SELECT id FROM public.leads WHERE enrichment_status='pending' AND enrichment_attempt_count<enrichment_max_attempts AND score>0 AND COALESCE(is_excluded,0)=0 AND archived_at IS NULL ORDER BY score DESC,updated_at ASC LIMIT 1) AND enrichment_status='pending' RETURNING id",
        } as const;
        const compatibilityBaselinePlans = {
          stale: await explainPlanned(client, compatibilityStatements.stale),
          due: await explainPlanned(client, compatibilityStatements.due),
          exhausted: await explainPlanned(client, compatibilityStatements.exhausted),
          ready: await explainPlanned(client, compatibilityStatements.ready),
          lease: await explainPlanned(client, compatibilityStatements.lease),
        };
        const compatibilityOwner = (plan: string): "lease" | "global" | "seq" | "other" => {
          if (plan.includes("idx_leads_enrichment_lease")) return "lease";
          if (plan.includes("idx_leads_enrichment")) return "global";
          if (plan.includes("Seq Scan on leads")) return "seq";
          return "other";
        };
        expect(compatibilityOwner(compatibilityBaselinePlans.ready)).toBe("lease");
        expect(compatibilityOwner(compatibilityBaselinePlans.lease)).toBe("lease");
        for (const key of ["stale", "due", "exhausted"] as const) {
          expect(["seq", "global", "lease"], key).toContain(compatibilityOwner(compatibilityBaselinePlans[key]));
        }

        await client.unsafe(g007p6Sql);
        const compatibilityFinalPlans = {
          stale: await explainPlanned(client, compatibilityStatements.stale),
          due: await explainPlanned(client, compatibilityStatements.due),
          exhausted: await explainPlanned(client, compatibilityStatements.exhausted),
          ready: await explainPlanned(client, compatibilityStatements.ready),
          lease: await explainPlanned(client, compatibilityStatements.lease),
        };
        for (const key of ["stale", "due", "exhausted", "ready", "lease"] as const) {
          expect(compatibilityFinalPlans[key], key).not.toContain(G007P6_INDEX);
          expect(compatibilityOwner(compatibilityFinalPlans[key]), key).toBe(compatibilityOwner(compatibilityBaselinePlans[key]));
        }
        const finalStalePlan = await explain(client, scopedStaleSelector);
        const finalDuePlan = await explain(client, scopedDueSelector);
        for (const [label, plan] of [["stale", finalStalePlan], ["due", finalDuePlan]] as const) {
          expect(plan, label).toContain(G007P6_INDEX);
          expect(plan, label).toMatch(/Index Cond: .*tenant_id.*enrichment_status/u);
          expect(plan.split("\n").filter((line) => line.includes("Filter:")).join("\n"), label).not.toContain("tenant_id");
        }
        const finalStaleUpdatePlan = await explainRolledBack(scopedStaleUpdate);
        const finalDueUpdatePlan = await explainRolledBack(scopedDueUpdate);
        for (const [label, plan] of [["stale update", finalStaleUpdatePlan], ["due update", finalDueUpdatePlan]] as const) {
          expect(plan, label).toContain(G007P6_INDEX);
          expect(plan, label).toMatch(/Index Cond: .*tenant_id.*enrichment_status/u);
          expect(plan.split("\n").filter((line) => line.includes("Filter:")).join("\n"), label).not.toContain("tenant_id");
        }
        expect(await affectedIds(scopedStaleUpdate)).toEqual(baselineStaleIds);
        expect(await affectedIds(scopedDueUpdate)).toEqual(baselineDueIds);

        const finalSnapshot = await g007p6CatalogSnapshot(client);
        expect((finalSnapshot.indexes as Array<Record<string, unknown>>).filter((row) => String(row.relname).startsWith("idx_leads_enrichment"))).toEqual(globalsBefore);
        expect((finalSnapshot.indexes as Array<Record<string, unknown>>).some((row) => row.relname === "idx_g007p5_leads_tenant_enrichment_ready")).toBe(false);
        expect((finalSnapshot.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P6_INDEX)?.indexdef).toBe(G007P6_INDEXDEF);
      } finally {
        await client.unsafe("ROLLBACK").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    240000,
  );

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "installs the additive G-007P7 tenant AI website viability repair index with exact guards and compatible reads",
    async () => {
      const url = process.env.G003_DATABASE_URL;
      if (!url) throw new Error("G003_DATABASE_URL is required");
      const parsed = new URL(url);
      if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
      const client = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        expect((await client.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);

        const full = await resetDatabase(client, true);
        expect(full).toEqual({ discovered: 54, applied: 52, skipped: 2 });
        const fullCatalog = await g007p7CatalogSnapshot(client);
        expect((fullCatalog.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P7_INDEX)).toEqual({
          relname: G007P7_INDEX,
          relkind: "i",
          indexdef: G007P7_INDEXDEF,
          indisunique: false,
          indisvalid: true,
          indisready: true,
          indislive: true,
        });
        await client.unsafe(g007p7Sql);
        expect(await g007p7CatalogSnapshot(client)).toEqual(fullCatalog);

        const baselineReceipt = await resetDatabase(client, true, false, G007P7_MIGRATION);
        expect(baselineReceipt).toEqual({ discovered: 54, applied: 47, skipped: 2 });
        const baselineCatalog = await g007p7CatalogSnapshot(client);
        expect((baselineCatalog.indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          G007P6_INDEX,
          "idx_leads_ai_status_checked",
        ]);

        await client.unsafe("BEGIN");
        await client.unsafe("CREATE INDEX idxXg007p7XleadsXtenantXaiXviabilityXshadow ON public.leads(id)");
        expect(await g007p7CatalogSnapshot(client)).toEqual(baselineCatalog);
        await client.unsafe(g007p7Sql);
        expect(((await g007p7CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          G007P6_INDEX,
          G007P7_INDEX,
          "idx_leads_ai_status_checked",
        ]);
        expect((await client.unsafe("SELECT pg_catalog.to_regclass('public.idxXg007p7XleadsXtenantXaiXviabilityXshadow') IS NOT NULL present"))[0].present).toBe(true);
        await client.unsafe("ROLLBACK");
        expect(await g007p7CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe(g007p7Sql);
        expect(((await g007p7CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P7_INDEX)?.indexdef).toBe(G007P7_INDEXDEF);
        await client.unsafe("ROLLBACK");
        expect(await g007p7CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe("CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready ON public.leads(tenant_id,score DESC,updated_at ASC) WHERE enrichment_status='pending' AND enrichment_attempt_count<enrichment_max_attempts AND score>0 AND archived_at IS NULL AND COALESCE(is_excluded,0)=0");
        const p5Baseline = await g007p7CatalogSnapshot(client);
        await client.unsafe(g007p7Sql);
        expect(((await g007p7CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P7_INDEX)?.indexdef).toBe(G007P7_INDEXDEF);
        expect((await g007p7CatalogSnapshot(client)).columns).toEqual(p5Baseline.columns);
        expect((await g007p7CatalogSnapshot(client)).constraints).toEqual(p5Baseline.constraints);
        await client.unsafe("ROLLBACK");
        expect(await g007p7CatalogSnapshot(client)).toEqual(baselineCatalog);

        const baselineMutations: Array<[string, string]> = [
          ["missing_global", "DROP INDEX public.idx_leads_ai_status_checked"],
          ["global_order_spoof", "DROP INDEX public.idx_leads_ai_status_checked; CREATE INDEX idx_leads_ai_status_checked ON public.leads(ai_checked_at DESC,ai_verification_status)"],
          ["global_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.idx_leads_ai_status_checked'::regclass"],
          ["global_non_index", "DROP INDEX public.idx_leads_ai_status_checked; CREATE TABLE public.idx_leads_ai_status_checked(sentinel integer)"],
          ["reserved_p7_sibling", "CREATE INDEX idx_g007p7_leads_tenant_ai_viability_shadow ON public.leads(id)"],
          ["tenant_nullable", "ALTER TABLE public.leads ALTER COLUMN tenant_id DROP NOT NULL"],
          ["verification_status_nullable", "ALTER TABLE public.leads ALTER COLUMN ai_verification_status DROP NOT NULL"],
          ["found_url_not_nullable", "ALTER TABLE public.leads ALTER COLUMN ai_found_website_url SET NOT NULL"],
          ["viability_not_nullable", "ALTER TABLE public.leads ALTER COLUMN ai_website_viability_status SET NOT NULL"],
          ["checked_at_not_nullable", "ALTER TABLE public.leads ALTER COLUMN ai_checked_at SET NOT NULL"],
          ["status_constraint_set_spoof", "ALTER TABLE public.leads DROP CONSTRAINT leads_ai_verification_status_check; ALTER TABLE public.leads ADD CONSTRAINT leads_ai_verification_status_check CHECK (ai_verification_status IN ('not_checked','site_found','no_site_found','weak_site_found','uncertain','error'))"],
          ["foundation_backing_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid=(SELECT conindid FROM pg_catalog.pg_constraint WHERE connamespace='public'::regnamespace AND conrelid='public.leads'::regclass AND conname='leads_tenant_id_id_unique')`],
        ];
        for (const [label, mutation] of baselineMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P7RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p7CatalogSnapshot(client), label).toEqual(baselineCatalog);
        }

        await client.unsafe(g007p7Sql);
        const installedCatalog = await g007p7CatalogSnapshot(client);
        const finalMutations: Array<[string, string]> = [
          ["candidate_order_spoof", `DROP INDEX public.${G007P7_INDEX}; CREATE INDEX ${G007P7_INDEX} ON public.leads(ai_checked_at DESC,tenant_id) WHERE ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable'`],
          ["candidate_direction_spoof", `DROP INDEX public.${G007P7_INDEX}; CREATE INDEX ${G007P7_INDEX} ON public.leads(tenant_id,ai_checked_at ASC) WHERE ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable'`],
          ["candidate_predicate_spoof", `DROP INDEX public.${G007P7_INDEX}; CREATE INDEX ${G007P7_INDEX} ON public.leads(tenant_id,ai_checked_at DESC) WHERE ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>''`],
          ["candidate_status_spoof", `DROP INDEX public.${G007P7_INDEX}; CREATE INDEX ${G007P7_INDEX} ON public.leads(tenant_id,ai_checked_at DESC) WHERE ai_verification_status='weak_site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable'`],
          ["candidate_non_index", `DROP INDEX public.${G007P7_INDEX}; CREATE TABLE public.${G007P7_INDEX}(sentinel integer)`],
          ["candidate_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.${G007P7_INDEX}'::regclass`],
          ["candidate_reserved_sibling", "CREATE INDEX idx_g007p7_leads_tenant_ai_viability_extra ON public.leads(id)"],
          ["final_found_url_not_nullable", "ALTER TABLE public.leads ALTER COLUMN ai_found_website_url SET NOT NULL"],
        ];
        for (const [label, mutation] of finalMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P7RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p7CatalogSnapshot(client), label).toEqual(installedCatalog);
        }

        await client.unsafe("BEGIN");
        await client.unsafe(`
          DROP INDEX public.idx_leads_ai_status_checked;
          CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready
            ON public.leads(tenant_id,score DESC,updated_at ASC)
            WHERE enrichment_status='pending'
              AND enrichment_attempt_count<enrichment_max_attempts
              AND score>0 AND archived_at IS NULL AND COALESCE(is_excluded,0)=0;
        `);
        const forwardCompatibleFinal = await g007p7CatalogSnapshot(client);
        await client.unsafe(g007p7Sql);
        expect(await g007p7CatalogSnapshot(client)).toEqual(forwardCompatibleFinal);
        await client.unsafe("ROLLBACK");
        expect(await g007p7CatalogSnapshot(client)).toEqual(installedCatalog);

        await resetDatabase(client, true, false, G007P7_MIGRATION);
        await seedG007P7PlanRows(client);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.leads"))[0].count).toBe(100000);
        expect(await client.unsafe(`
          SELECT tenant_id::text,count(*)::integer row_count,
            count(*) FILTER (WHERE ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable')::integer candidates
          FROM public.leads GROUP BY tenant_id ORDER BY tenant_id
        `)).toEqual([
          { tenant_id: tenantA, row_count: 50000, candidates: 20000 },
          { tenant_id: tenantB, row_count: 50000, candidates: 20000 },
        ]);

        const tenantQuery = `SELECT * FROM public.leads WHERE tenant_id='${tenantA}' AND ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable' ORDER BY ai_checked_at DESC LIMIT 200`;
        const baselineTenantPlan = await explain(client, tenantQuery);
        expect(baselineTenantPlan).toContain("idx_leads_ai_status_checked");
        expect(baselineTenantPlan).toMatch(/Filter: .*tenant_id/u);
        expect(baselineTenantPlan).toMatch(/Rows Removed by Filter: [1-9][0-9]*/u);
        const baselineTenantIds = (await client.unsafe<Array<{ id: string }>>(tenantQuery)).map((row) => row.id);
        expect(baselineTenantIds).toHaveLength(200);

        const nullableResult = async (): Promise<string[]> => {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(`INSERT INTO public.leads(id,tenant_id,place_id,name,ai_verification_status,ai_found_website_url,ai_website_viability_status,ai_checked_at) VALUES ('g007p7-null-checked','${tenantA}','g007p7-null-checked','G007P7 null checked','site_found','https://null.invalid','broken',NULL)`);
            return (await client.unsafe<Array<{ id: string }>>(`SELECT id FROM public.leads WHERE tenant_id='${tenantA}' AND ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable' ORDER BY ai_checked_at DESC LIMIT 1`)).map((row) => row.id);
          } finally {
            await client.unsafe("ROLLBACK");
          }
        };
        const baselineNullableIds = await nullableResult();
        expect(baselineNullableIds).toEqual(["g007p7-null-checked"]);

        const compatibilitySql = (limit: number): string => `SELECT * FROM public.leads WHERE ai_verification_status='site_found' AND ai_found_website_url IS NOT NULL AND ai_found_website_url<>'' AND COALESCE(ai_website_viability_status,'')<>'usable' ORDER BY ai_checked_at DESC LIMIT ${limit}`;
        const compatibilityBaseline = new Map<number, { plan: string; ids: string[] }>();
        for (const limit of [1, 50, 200]) {
          compatibilityBaseline.set(limit, {
            plan: await explain(client, compatibilitySql(limit)),
            ids: (await client.unsafe<Array<{ id: string }>>(compatibilitySql(limit))).map((row) => row.id),
          });
          expect(compatibilityBaseline.get(limit)?.plan, String(limit)).toContain("idx_leads_ai_status_checked");
        }
        const preservedBefore = await g007p7CatalogSnapshot(client);

        await client.unsafe(g007p7Sql);
        const finalTenantPlan = await explain(client, tenantQuery);
        expect(finalTenantPlan).toContain(G007P7_INDEX);
        expect(finalTenantPlan).toMatch(/Index Cond: \(tenant_id = '[^']+'::uuid\)/u);
        expect(finalTenantPlan).not.toContain("Sort");
        expect(finalTenantPlan.split("\n").filter((line) => line.includes("Filter:")).join("\n")).not.toContain("tenant_id");
        expect((await client.unsafe<Array<{ id: string }>>(tenantQuery)).map((row) => row.id)).toEqual(baselineTenantIds);
        expect(await nullableResult()).toEqual(baselineNullableIds);

        for (const limit of [1, 50, 200]) {
          const finalPlan = await explain(client, compatibilitySql(limit));
          expect(finalPlan, String(limit)).toContain("idx_leads_ai_status_checked");
          expect(finalPlan, String(limit)).not.toContain(G007P7_INDEX);
          expect((await client.unsafe<Array<{ id: string }>>(compatibilitySql(limit))).map((row) => row.id), String(limit)).toEqual(compatibilityBaseline.get(limit)?.ids);
        }
        const finalPreserved = await g007p7CatalogSnapshot(client);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).filter((row) => row.relname !== G007P7_INDEX)).toEqual(preservedBefore.indexes);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P7_INDEX)?.indexdef).toBe(G007P7_INDEXDEF);
      } finally {
        await client.unsafe("ROLLBACK").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    240000,
  );

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "installs the additive G-007P8 tenant dashboard discovered-at index with exact guards and compatible counts",
    async () => {
      const url = process.env.G003_DATABASE_URL;
      if (!url) throw new Error("G003_DATABASE_URL is required");
      const parsed = new URL(url);
      if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
      const client = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        expect((await client.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);

        const full = await resetDatabase(client, true);
        expect(full).toEqual({ discovered: 54, applied: 52, skipped: 2 });
        const fullCatalog = await g007p8CatalogSnapshot(client);
        expect((fullCatalog.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P8_INDEX)).toEqual({
          relname: G007P8_INDEX,
          relkind: "i",
          indexdef: G007P8_INDEXDEF,
          indisunique: false,
          indisvalid: true,
          indisready: true,
          indislive: true,
        });
        await client.unsafe(g007p8Sql);
        expect(await g007p8CatalogSnapshot(client)).toEqual(fullCatalog);

        const baselineReceipt = await resetDatabase(client, true, false, G007P8_MIGRATION);
        expect(baselineReceipt).toEqual({ discovered: 54, applied: 48, skipped: 2 });
        const baselineCatalog = await g007p8CatalogSnapshot(client);
        expect((baselineCatalog.indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          G007P6_INDEX,
          G007P7_INDEX,
          "idx_leads_active_discovered_at",
          "idx_leads_discovered_at",
        ]);

        await client.unsafe("BEGIN");
        await client.unsafe("CREATE INDEX idxXg007p8XleadsXtenantXdiscoveredXshadow ON public.leads(id)");
        expect(await g007p8CatalogSnapshot(client)).toEqual(baselineCatalog);
        await client.unsafe(g007p8Sql);
        expect((await client.unsafe("SELECT pg_catalog.to_regclass('public.idxXg007p8XleadsXtenantXdiscoveredXshadow') IS NOT NULL present"))[0].present).toBe(true);
        expect(((await g007p8CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P8_INDEX)?.indexdef).toBe(G007P8_INDEXDEF);
        await client.unsafe("ROLLBACK");
        expect(await g007p8CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe(g007p8Sql);
        expect(((await g007p8CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P8_INDEX)?.indexdef).toBe(G007P8_INDEXDEF);
        await client.unsafe("ROLLBACK");
        expect(await g007p8CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe(`
          DROP INDEX public.idx_leads_active_discovered_at;
          CREATE INDEX idx_leads_active_discovered_at ON public.leads(id);
          CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready
            ON public.leads(tenant_id,score DESC,updated_at ASC)
            WHERE enrichment_status='pending'
              AND enrichment_attempt_count<enrichment_max_attempts
              AND score>0 AND archived_at IS NULL AND COALESCE(is_excluded,0)=0;
        `);
        const unrelatedBefore = await g007p8CatalogSnapshot(client);
        await client.unsafe(g007p8Sql);
        const unrelatedFinal = await g007p8CatalogSnapshot(client);
        expect(unrelatedFinal.columns).toEqual(unrelatedBefore.columns);
        expect(unrelatedFinal.constraints).toEqual(unrelatedBefore.constraints);
        expect((unrelatedFinal.indexes as Array<Record<string, unknown>>).filter((row) => row.relname !== G007P8_INDEX)).toEqual(unrelatedBefore.indexes);
        await client.unsafe("ROLLBACK");
        expect(await g007p8CatalogSnapshot(client)).toEqual(baselineCatalog);

        const baselineMutations: Array<[string, string]> = [
          ["missing_global", "DROP INDEX public.idx_leads_discovered_at"],
          ["global_direction_spoof", "DROP INDEX public.idx_leads_discovered_at; CREATE INDEX idx_leads_discovered_at ON public.leads(discovered_at DESC)"],
          ["global_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.idx_leads_discovered_at'::regclass"],
          ["global_non_index", "DROP INDEX public.idx_leads_discovered_at; CREATE TABLE public.idx_leads_discovered_at(sentinel integer)"],
          ["reserved_p8_sibling", "CREATE INDEX idx_g007p8_leads_tenant_discovered_shadow ON public.leads(id)"],
          ["tenant_nullable", "ALTER TABLE public.leads ALTER COLUMN tenant_id DROP NOT NULL"],
          ["discovered_nullable", "ALTER TABLE public.leads ALTER COLUMN discovered_at DROP NOT NULL"],
          ["discovered_type", "ALTER TABLE public.leads ALTER COLUMN discovered_at DROP DEFAULT; ALTER TABLE public.leads ALTER COLUMN discovered_at TYPE timestamp without time zone USING discovered_at AT TIME ZONE 'UTC'"],
          ["foundation_constraint_renamed", "ALTER TABLE public.leads RENAME CONSTRAINT leads_tenant_id_id_unique TO leads_tenant_id_id_unique_spoof"],
          ["foundation_backing_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid=(SELECT conindid FROM pg_catalog.pg_constraint WHERE connamespace='public'::regnamespace AND conrelid='public.leads'::regclass AND conname='leads_tenant_id_id_unique')`],
        ];
        for (const [label, mutation] of baselineMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P8RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p8CatalogSnapshot(client), label).toEqual(baselineCatalog);
        }

        await client.unsafe(g007p8Sql);
        const installedCatalog = await g007p8CatalogSnapshot(client);
        const finalMutations: Array<[string, string]> = [
          ["candidate_reversed", `DROP INDEX public.${G007P8_INDEX}; CREATE INDEX ${G007P8_INDEX} ON public.leads(discovered_at,tenant_id)`],
          ["candidate_missing_key", `DROP INDEX public.${G007P8_INDEX}; CREATE INDEX ${G007P8_INDEX} ON public.leads(tenant_id)`],
          ["candidate_extra_key", `DROP INDEX public.${G007P8_INDEX}; CREATE INDEX ${G007P8_INDEX} ON public.leads(tenant_id,discovered_at,id)`],
          ["candidate_predicate", `DROP INDEX public.${G007P8_INDEX}; CREATE INDEX ${G007P8_INDEX} ON public.leads(tenant_id,discovered_at) WHERE discovered_at IS NOT NULL`],
          ["candidate_direction", `DROP INDEX public.${G007P8_INDEX}; CREATE INDEX ${G007P8_INDEX} ON public.leads(tenant_id,discovered_at DESC)`],
          ["candidate_non_index", `DROP INDEX public.${G007P8_INDEX}; CREATE TABLE public.${G007P8_INDEX}(sentinel integer)`],
          ["candidate_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.${G007P8_INDEX}'::regclass`],
          ["candidate_reserved_sibling", "CREATE INDEX idx_g007p8_leads_tenant_discovered_extra ON public.leads(id)"],
          ["final_discovered_nullable", "ALTER TABLE public.leads ALTER COLUMN discovered_at DROP NOT NULL"],
        ];
        for (const [label, mutation] of finalMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P8RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p8CatalogSnapshot(client), label).toEqual(installedCatalog);
        }

        await client.unsafe("BEGIN");
        await client.unsafe("DROP INDEX public.idx_leads_discovered_at; DROP INDEX public.idx_leads_active_discovered_at");
        const forwardCompatibleFinal = await g007p8CatalogSnapshot(client);
        await client.unsafe(g007p8Sql);
        expect(await g007p8CatalogSnapshot(client)).toEqual(forwardCompatibleFinal);
        await client.unsafe("ROLLBACK");
        expect(await g007p8CatalogSnapshot(client)).toEqual(installedCatalog);

        await resetDatabase(client, true, false, G007P8_MIGRATION);
        await seedG007P8PlanRows(client);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.leads"))[0].count).toBe(200000);
        expect(await client.unsafe(`
          SELECT tenant_id::text,count(*)::integer row_count,
            count(*) FILTER (WHERE discovered_at>='${G007P8_TODAY}'::timestamptz)::integer today_count,
            count(*) FILTER (WHERE discovered_at='${G007P8_TODAY}'::timestamptz)::integer boundary_count,
            count(*) FILTER (WHERE discovered_at>='${G007P8_TODAY}'::timestamptz AND archived_at IS NOT NULL)::integer archived_today,
            count(*) FILTER (WHERE discovered_at>='${G007P8_TODAY}'::timestamptz AND is_excluded=1)::integer excluded_today
          FROM public.leads GROUP BY tenant_id ORDER BY tenant_id
        `)).toEqual([
          { tenant_id: tenantA, row_count: 100000, today_count: 10000, boundary_count: 1, archived_today: 1000, excluded_today: 1000 },
          { tenant_id: tenantB, row_count: 100000, today_count: 10000, boundary_count: 0, archived_today: 1000, excluded_today: 1000 },
        ]);
        expect((await client.unsafe<Array<{ tenant_id: string }>>("SELECT tenant_id::text FROM public.leads ORDER BY ctid LIMIT 6")).map((row) => row.tenant_id)).toEqual([
          tenantA,tenantB,tenantA,tenantB,tenantA,tenantB,
        ]);

        const currentTodayQuery = `SELECT count(*)::integer count FROM public.leads WHERE discovered_at>='${G007P8_TODAY}'::timestamptz`;
        const tenantTodayQuery = `SELECT count(*)::integer count FROM public.leads WHERE tenant_id='${tenantA}' AND discovered_at>='${G007P8_TODAY}'::timestamptz`;
        const adjacentTotalQuery = "SELECT count(*)::integer count FROM public.leads";
        const baselineCurrentCount = (await client.unsafe<Array<{ count: number }>>(currentTodayQuery))[0].count;
        const baselineTenantCount = (await client.unsafe<Array<{ count: number }>>(tenantTodayQuery))[0].count;
        const baselineTotalCount = (await client.unsafe<Array<{ count: number }>>(adjacentTotalQuery))[0].count;
        const baselineCurrentPlan = await explain(client, currentTodayQuery);
        const baselineTenantPlan = await explain(client, tenantTodayQuery);
        const baselineTotalPlan = await explainPlanned(client, adjacentTotalQuery);
        expect(baselineCurrentCount).toBe(20000);
        expect(baselineTenantCount).toBe(10000);
        expect(baselineTotalCount).toBe(200000);
        expect(baselineCurrentPlan).toContain("idx_leads_discovered_at");
        expect(baselineTenantPlan).toContain("idx_leads_discovered_at");
        expect(baselineTenantPlan).toMatch(/Filter: .*tenant_id/u);
        expect(baselineTenantPlan).toContain("Rows Removed by Filter: 10000");
        expect(baselineCurrentPlan).not.toContain(G007P8_INDEX);
        expect(baselineTotalPlan).not.toContain(G007P8_INDEX);
        const preservedBefore = await g007p8CatalogSnapshot(client);

        await client.unsafe(g007p8Sql);
        const finalTenantPlan = await explain(client, tenantTodayQuery);
        const finalCurrentPlan = await explain(client, currentTodayQuery);
        const finalTotalPlan = await explainPlanned(client, adjacentTotalQuery);
        const finalTenantIndexCondition = finalTenantPlan.split("\n").find((line) => line.includes("Index Cond:")) ?? "";
        expect(finalTenantPlan).toContain(G007P8_INDEX);
        expect(finalTenantIndexCondition).toContain("tenant_id");
        expect(finalTenantIndexCondition).toContain("discovered_at");
        expect(finalTenantPlan).not.toContain("Filter:");
        expect(finalTenantPlan).not.toContain("Rows Removed by Filter");
        expect((await client.unsafe<Array<{ count: number }>>(tenantTodayQuery))[0].count).toBe(baselineTenantCount);
        expect(finalCurrentPlan).toContain("idx_leads_discovered_at");
        expect(finalCurrentPlan).not.toContain(G007P8_INDEX);
        expect((await client.unsafe<Array<{ count: number }>>(currentTodayQuery))[0].count).toBe(baselineCurrentCount);
        expect(finalTotalPlan).not.toContain(G007P8_INDEX);
        expect(finalTotalPlan).toBe(baselineTotalPlan);
        expect((await client.unsafe<Array<{ count: number }>>(adjacentTotalQuery))[0].count).toBe(baselineTotalCount);

        const finalPreserved = await g007p8CatalogSnapshot(client);
        expect(finalPreserved.columns).toEqual(preservedBefore.columns);
        expect(finalPreserved.constraints).toEqual(preservedBefore.constraints);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).filter((row) => row.relname !== G007P8_INDEX)).toEqual(preservedBefore.indexes);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P8_INDEX)?.indexdef).toBe(G007P8_INDEXDEF);
      } finally {
        await client.unsafe("ROLLBACK").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    300000,
  );

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "installs the additive G-007P11 tenant open-admin list index with exact guards and natural plans",
    async () => {
      const url = process.env.G003_DATABASE_URL;
      if (!url) throw new Error("G003_DATABASE_URL is required");
      const parsed = new URL(url);
      if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
      const client = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        expect((await client.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);

        const full = await resetDatabase(client, true);
        expect(full).toEqual({ discovered: 54, applied: 52, skipped: 2 });
        const fullCatalog = await g007p11CatalogSnapshot(client);
        expect((fullCatalog.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P11_INDEX)).toEqual({
          relname: G007P11_INDEX,
          relkind: "i",
          indexdef: G007P11_INDEXDEF,
          indisunique: false,
          indisvalid: true,
          indisready: true,
          indislive: true,
        });
        await client.unsafe(g007p11Sql);
        expect(await g007p11CatalogSnapshot(client)).toEqual(fullCatalog);

        const baselineReceipt = await resetDatabase(client, true, false, G007P11_MIGRATION);
        expect(baselineReceipt).toEqual({ discovered: 54, applied: 49, skipped: 2 });
        const baselineCatalog = await g007p11CatalogSnapshot(client);
        expect((baselineCatalog.indexes as Array<Record<string, unknown>>).map((row) => row.relname)).toEqual([
          "admin_requests_tenant_lead_open_unique",
          "idx_admin_requests_creator_created",
          "idx_admin_requests_status_type_created",
          "idx_admin_requests_tenant_lead_created",
        ]);

        await client.unsafe("BEGIN");
        await client.unsafe("CREATE INDEX idxXg007p11XadminXtenantXopenXshadow ON public.admin_requests(id)");
        const wildcardBefore = await g007p11CatalogSnapshot(client);
        await client.unsafe(g007p11Sql);
        expect((await client.unsafe("SELECT pg_catalog.to_regclass('public.idxXg007p11XadminXtenantXopenXshadow') IS NOT NULL present"))[0].present).toBe(true);
        expect(((await g007p11CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P11_INDEX)?.indexdef).toBe(G007P11_INDEXDEF);
        expect((wildcardBefore.indexes as Array<Record<string, unknown>>).some((row) => row.relname === G007P11_INDEX)).toBe(false);
        await client.unsafe("ROLLBACK");
        expect(await g007p11CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe(g007p11Sql);
        expect(((await g007p11CatalogSnapshot(client)).indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P11_INDEX)?.indexdef).toBe(G007P11_INDEXDEF);
        await client.unsafe("ROLLBACK");
        expect(await g007p11CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe("DROP TABLE public.admin_requests CASCADE");
        await expect(client.unsafe(g007p11Sql)).rejects.toThrow(/G007P11_REQUIRED_TABLE_MISSING/);
        await client.unsafe("ROLLBACK");
        expect(await g007p11CatalogSnapshot(client)).toEqual(baselineCatalog);

        await client.unsafe("BEGIN");
        await client.unsafe("DROP INDEX public.idx_admin_requests_creator_created; CREATE INDEX idx_admin_requests_creator_created ON public.admin_requests(created_at)");
        const unrelatedBefore = await g007p11CatalogSnapshot(client);
        await client.unsafe(g007p11Sql);
        const unrelatedAfter = await g007p11CatalogSnapshot(client);
        expect(unrelatedAfter.columns).toEqual(unrelatedBefore.columns);
        expect(unrelatedAfter.constraints).toEqual(unrelatedBefore.constraints);
        expect((unrelatedAfter.indexes as Array<Record<string, unknown>>).filter((row) => row.relname !== G007P11_INDEX)).toEqual(unrelatedBefore.indexes);
        await client.unsafe("ROLLBACK");
        expect(await g007p11CatalogSnapshot(client)).toEqual(baselineCatalog);

        const baselineMutations: Array<[string, string]> = [
          ["missing_global", "DROP INDEX public.idx_admin_requests_status_type_created"],
          ["global_spoof", "DROP INDEX public.idx_admin_requests_status_type_created; CREATE INDEX idx_admin_requests_status_type_created ON public.admin_requests(request_type,status,created_at DESC)"],
          ["global_non_index", "DROP INDEX public.idx_admin_requests_status_type_created; CREATE TABLE public.idx_admin_requests_status_type_created(sentinel integer)"],
          ["global_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.idx_admin_requests_status_type_created'::regclass"],
          ["reserved_p11_sibling", "CREATE INDEX idx_g007p11_admin_tenant_open_shadow ON public.admin_requests(id)"],
          ["tenant_nullable", "ALTER TABLE public.admin_requests ALTER COLUMN tenant_id DROP NOT NULL"],
          ["workspace_not_nullable", "ALTER TABLE public.admin_requests ALTER COLUMN workspace_id SET NOT NULL"],
          ["created_nullable", "ALTER TABLE public.admin_requests ALTER COLUMN created_at DROP NOT NULL"],
          ["created_type", "ALTER TABLE public.admin_requests ALTER COLUMN created_at DROP DEFAULT; ALTER TABLE public.admin_requests ALTER COLUMN created_at TYPE timestamp without time zone USING created_at AT TIME ZONE 'UTC'"],
          ["priority_check_missing", "ALTER TABLE public.admin_requests DROP CONSTRAINT admin_requests_priority_check"],
          ["status_check_missing", "ALTER TABLE public.admin_requests DROP CONSTRAINT admin_requests_status_check"],
          ["request_type_check_missing", "ALTER TABLE public.admin_requests DROP CONSTRAINT admin_requests_request_type_check"],
          ["primary_renamed", "ALTER TABLE public.admin_requests RENAME CONSTRAINT admin_requests_pkey TO admin_requests_pkey_spoof"],
          ["primary_backing_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid=(SELECT conindid FROM pg_catalog.pg_constraint WHERE conrelid='public.admin_requests'::regclass AND conname='admin_requests_pkey')"],
          ["lead_unique_renamed", "ALTER TABLE public.leads RENAME CONSTRAINT leads_tenant_id_id_unique TO leads_tenant_id_id_unique_spoof"],
          ["workspace_unique_renamed", "ALTER TABLE public.workspaces RENAME CONSTRAINT workspaces_tenant_id_id_unique TO workspaces_tenant_id_id_unique_spoof"],
          ["tenant_lead_fk_renamed", "ALTER TABLE public.admin_requests RENAME CONSTRAINT admin_requests_tenant_lead_fkey TO admin_requests_tenant_lead_fkey_spoof"],
          ["tenant_workspace_fk_renamed", "ALTER TABLE public.admin_requests RENAME CONSTRAINT admin_requests_tenant_workspace_fkey TO admin_requests_tenant_workspace_fkey_spoof"],
          ["tenant_lead_index_missing", "DROP INDEX public.idx_admin_requests_tenant_lead_created"],
          ["tenant_lead_index_spoof", "DROP INDEX public.idx_admin_requests_tenant_lead_created; CREATE INDEX idx_admin_requests_tenant_lead_created ON public.admin_requests(tenant_id,created_at DESC,lead_id)"],
          ["tenant_open_unique_missing", "DROP INDEX public.admin_requests_tenant_lead_open_unique"],
          ["tenant_open_unique_unhealthy", "UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.admin_requests_tenant_lead_open_unique'::regclass"],
        ];
        for (const [label, mutation] of baselineMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P11RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p11CatalogSnapshot(client), label).toEqual(baselineCatalog);
        }

        await client.unsafe(g007p11Sql);
        const installedCatalog = await g007p11CatalogSnapshot(client);
        const finalMutations: Array<[string, string]> = [
          ["candidate_key_order", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(created_at DESC,tenant_id)`],
          ["candidate_priority_case", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(CASE priority WHEN 'low' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) WHERE status IN (${G007P11_OPEN})`],
          ["candidate_status_case", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),(CASE status WHEN 'seen' THEN 0 WHEN 'new' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) WHERE status IN (${G007P11_OPEN})`],
          ["candidate_predicate", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) WHERE status IN ('new','seen')`],
          ["candidate_collation", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(((CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END)::text) COLLATE "C"),(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) WHERE status IN (${G007P11_OPEN})`],
          ["candidate_include", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) INCLUDE(request_type) WHERE status IN (${G007P11_OPEN})`],
          ["candidate_unique", `DROP INDEX public.${G007P11_INDEX}; CREATE UNIQUE INDEX ${G007P11_INDEX} ON public.admin_requests(tenant_id,(CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),(CASE status WHEN 'new' THEN 0 WHEN 'seen' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_on_researcher' THEN 3 ELSE 4 END),created_at DESC) WHERE status IN (${G007P11_OPEN})`],
          ["candidate_wrong_table", `DROP INDEX public.${G007P11_INDEX}; CREATE INDEX ${G007P11_INDEX} ON public.leads(tenant_id,id)`],
          ["candidate_non_index", `DROP INDEX public.${G007P11_INDEX}; CREATE TABLE public.${G007P11_INDEX}(sentinel integer)`],
          ["candidate_unhealthy", `UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.${G007P11_INDEX}'::regclass`],
          ["candidate_reserved_sibling", "CREATE INDEX idx_g007p11_admin_tenant_open_extra ON public.admin_requests(id)"],
          ["final_foundation_drift", "ALTER TABLE public.admin_requests DROP CONSTRAINT admin_requests_status_check"],
        ];
        for (const [label, mutation] of finalMutations) {
          await client.unsafe("BEGIN");
          try {
            await client.unsafe(mutation);
            await expectG007P11RejectedWithoutChange(client, label);
          } finally {
            await client.unsafe("ROLLBACK");
          }
          expect(await g007p11CatalogSnapshot(client), label).toEqual(installedCatalog);
        }

        await client.unsafe("BEGIN");
        await client.unsafe("DROP INDEX public.idx_admin_requests_status_type_created; CREATE INDEX idx_admin_requests_status_type_created ON public.admin_requests(created_at DESC)");
        const forwardCompatibleFinal = await g007p11CatalogSnapshot(client);
        await client.unsafe(g007p11Sql);
        expect(await g007p11CatalogSnapshot(client)).toEqual(forwardCompatibleFinal);
        await client.unsafe("ROLLBACK");
        expect(await g007p11CatalogSnapshot(client)).toEqual(installedCatalog);

        await resetDatabase(client, true, false, G007P11_MIGRATION);
        await seedG007P11PlanRows(client);
        expect(await client.unsafe(`
          SELECT count(*)::integer total,
            count(*) FILTER (WHERE status IN (${G007P11_OPEN}))::integer open,
            count(DISTINCT created_at)::integer unique_created,
            count(*) FILTER (WHERE tenant_id IS NULL)::integer tenantless
          FROM public.admin_requests
        `)).toEqual([{ total: 144000, open: 96000, unique_created: 144000, tenantless: 0 }]);
        expect(await client.unsafe(`
          SELECT tenant_id::text tenant,count(*)::integer total,
            count(*) FILTER (WHERE status IN (${G007P11_OPEN}))::integer open,
            count(*) FILTER (WHERE status IN (${G007P11_OPEN}) AND request_type='website_request')::integer website_open,
            count(*) FILTER (WHERE status IN (${G007P11_OPEN}) AND request_type='quote_request')::integer quote_open,
            count(*) FILTER (WHERE workspace_id IS NULL)::integer workspace_null,
            count(*) FILTER (WHERE workspace_id IS NOT NULL)::integer workspace_nonnull
          FROM public.admin_requests GROUP BY tenant_id ORDER BY tenant_id
        `)).toEqual([
          { tenant: tenantA, total: 72000, open: 48000, website_open: 24000, quote_open: 24000, workspace_null: 36000, workspace_nonnull: 36000 },
          { tenant: tenantB, total: 72000, open: 48000, website_open: 24000, quote_open: 24000, workspace_null: 36000, workspace_nonnull: 36000 },
        ]);
        expect(await client.unsafe(`
          SELECT count(*)::integer other_tenant_open
          FROM public.admin_requests
          WHERE tenant_id<>'${tenantA}' AND status IN (${G007P11_OPEN})
        `)).toEqual([{ other_tenant_open: 48000 }]);
        expect((await client.unsafe<Array<{ tenant: string }>>("SELECT tenant_id::text tenant FROM public.admin_requests ORDER BY ctid LIMIT 6")).map((row) => row.tenant)).toEqual([
          tenantA,tenantB,tenantA,tenantB,tenantA,tenantB,
        ]);

        const forms = [undefined, "website_request", "quote_request"] as const;
        const limits = [6, 50, 100, 200] as const;
        const baselineResults = new Map<string, { digest: string; first: string; last: string }>();
        const baselineTenantPlans = new Map<string, string>();
        const baselineCurrentPlans = new Map<string, string>();
        for (const requestType of forms) {
          for (const limit of limits) {
            const tenantQuery = g007p11ListQuery({ tenant: tenantA, requestType, limit });
            const currentQuery = g007p11ListQuery({ requestType, limit });
            const tenantRows = await client.unsafe<Array<{ id: string }>>(tenantQuery);
            const currentRows = await client.unsafe<Array<{ id: string }>>(currentQuery);
            const tenantPlan = await explain(client, tenantQuery);
            const currentPlan = await explain(client, currentQuery);
            const tenantPlanned = await explainPlanned(client, tenantQuery);
            const tenantKey = `tenant:${requestType ?? "all"}:${limit}`;
            const currentKey = `current:${requestType ?? "all"}:${limit}`;
            baselineResults.set(tenantKey, { digest: g007p11IdDigest(tenantRows), first: tenantRows[0].id, last: tenantRows.at(-1)!.id });
            baselineResults.set(currentKey, { digest: g007p11IdDigest(currentRows), first: currentRows[0].id, last: currentRows.at(-1)!.id });
            baselineTenantPlans.set(tenantKey, tenantPlanned);
            baselineCurrentPlans.set(currentKey, await explainPlanned(client, currentQuery));
            expect(tenantRows).toHaveLength(limit);
            expect(currentRows).toHaveLength(limit);
            expect(tenantRows.every((row) => row.id.startsWith("p11-request-a-"))).toBe(true);
            expect(currentRows.every((row) => row.id.startsWith("p11-request-b-"))).toBe(true);
            expect(tenantPlanned).toContain("Seq Scan on admin_requests ar");
            expect(tenantPlanned).toContain("Sort");
            expect(tenantPlanned).not.toMatch(/Index Cond: .*tenant_id/u);
            expect(tenantPlanned).not.toContain(G007P11_INDEX);
            expect(tenantPlan).not.toContain(G007P11_INDEX);
            expect(currentPlan).not.toContain(G007P11_INDEX);
          }
        }
        expect(baselineResults.get("tenant:all:6")).toEqual({
          digest: "97835e9550e2e9dbee25f9cdd5afec2f33de311ae73a587ae1383fdc6a954d7d",
          first: "p11-request-a-071971",
          last: "p11-request-a-071893",
        });
        expect(baselineResults.get("current:all:6")).toEqual({
          digest: "0550692d233fcb12a00449b5fb39518b1754715433480e5e3e705d870118f271",
          first: "p11-request-b-071971",
          last: "p11-request-b-071893",
        });

        const summaryQuery = `SELECT
          COALESCE(SUM(CASE WHEN status IN (${G007P11_OPEN}) THEN 1 ELSE 0 END),0)::integer open_total,
          COALESCE(SUM(CASE WHEN status IN (${G007P11_OPEN}) AND request_type='website_request' THEN 1 ELSE 0 END),0)::integer website_open,
          COALESCE(SUM(CASE WHEN status IN (${G007P11_OPEN}) AND request_type='quote_request' THEN 1 ELSE 0 END),0)::integer quote_open,
          COALESCE(SUM(CASE WHEN status='waiting_on_researcher' THEN 1 ELSE 0 END),0)::integer waiting_on_researcher,
          COALESCE(SUM(CASE WHEN status IN (${G007P11_OPEN}) AND due_at IS NOT NULL AND due_at<=now() THEN 1 ELSE 0 END),0)::integer overdue,
          COALESCE(SUM(CASE WHEN status='new' THEN 1 ELSE 0 END),0)::integer new_requests
          FROM public.admin_requests`;
        const leadDetailQuery = g007p11ListQuery({ leadId: "p11-lead-a-000001", limit: 1 });
        const currentOpenForLeadQuery = `SELECT ar.id FROM public.admin_requests ar
          WHERE ar.lead_id='p11-lead-a-000001'
            AND ar.request_type='website_request'
            AND ar.status IN (${G007P11_OPEN})
          ORDER BY ar.created_at DESC LIMIT 1`;
        const baselineSummary = await client.unsafe(summaryQuery);
        const baselineSummaryPlan = await explainPlanned(client, summaryQuery);
        const baselineLeadDetail = await client.unsafe<Array<{ id: string }>>(leadDetailQuery);
        const baselineLeadDetailPlan = await explainPlanned(client, leadDetailQuery);
        const baselineCurrentOpenForLead = await client.unsafe(currentOpenForLeadQuery);
        const baselineCurrentOpenForLeadPlan = await explainPlanned(client, currentOpenForLeadQuery);
        expect(baselineSummary).toEqual([{ open_total: 96000, website_open: 48000, quote_open: 48000, waiting_on_researcher: 24000, overdue: 0, new_requests: 24000 }]);
        expect(baselineLeadDetail.map((row) => row.id)).toEqual(["p11-request-a-000001"]);
        expect(baselineLeadDetailPlan).toContain("idx_admin_requests_lead_created");
        expect(baselineLeadDetailPlan).not.toContain(G007P11_INDEX);
        expect(baselineCurrentOpenForLead).toEqual([{ id: "p11-request-a-000001" }]);
        expect(baselineCurrentOpenForLeadPlan).toContain("idx_admin_requests_lead_created");
        expect(baselineCurrentOpenForLeadPlan).not.toContain(G007P11_INDEX);

        const preservedBefore = await g007p11CatalogSnapshot(client);
        await client.unsafe(g007p11Sql);
        for (const requestType of forms) {
          for (const limit of limits) {
            const tenantQuery = g007p11ListQuery({ tenant: tenantA, requestType, limit });
            const currentQuery = g007p11ListQuery({ requestType, limit });
            const tenantRows = await client.unsafe<Array<{ id: string }>>(tenantQuery);
            const currentRows = await client.unsafe<Array<{ id: string }>>(currentQuery);
            const tenantPlan = await explain(client, tenantQuery);
            const currentPlan = await explain(client, currentQuery);
            const tenantKey = `tenant:${requestType ?? "all"}:${limit}`;
            const currentKey = `current:${requestType ?? "all"}:${limit}`;
            expect(baselineTenantPlans.get(tenantKey)).toContain("Seq Scan on admin_requests ar");
            expect({ digest: g007p11IdDigest(tenantRows), first: tenantRows[0].id, last: tenantRows.at(-1)!.id }).toEqual(baselineResults.get(tenantKey));
            expect({ digest: g007p11IdDigest(currentRows), first: currentRows[0].id, last: currentRows.at(-1)!.id }).toEqual(baselineResults.get(currentKey));
            expect(tenantPlan).toContain(G007P11_INDEX);
            expect(tenantPlan.split("\n").find((line) => line.includes("Index Cond:"))).toContain("tenant_id");
            expect(tenantPlan).not.toContain("Sort");
            expect(tenantPlan).not.toMatch(/Filter: .*tenant_id/u);
            expect(currentPlan).not.toContain(G007P11_INDEX);
            expect(await explainPlanned(client, currentQuery)).toBe(baselineCurrentPlans.get(currentKey));
          }
        }
        expect(await client.unsafe(summaryQuery)).toEqual(baselineSummary);
        expect(await explainPlanned(client, summaryQuery)).toBe(baselineSummaryPlan);
        expect((await client.unsafe<Array<{ id: string }>>(leadDetailQuery)).map((row) => row.id)).toEqual(baselineLeadDetail.map((row) => row.id));
        expect(await explainPlanned(client, leadDetailQuery)).toBe(baselineLeadDetailPlan);
        expect(await explain(client, leadDetailQuery)).not.toContain(G007P11_INDEX);
        expect(await client.unsafe(currentOpenForLeadQuery)).toEqual(baselineCurrentOpenForLead);
        expect(await explainPlanned(client, currentOpenForLeadQuery)).toBe(baselineCurrentOpenForLeadPlan);
        expect(await explain(client, currentOpenForLeadQuery)).not.toContain(G007P11_INDEX);

        const finalPreserved = await g007p11CatalogSnapshot(client);
        expect(finalPreserved.columns).toEqual(preservedBefore.columns);
        expect(finalPreserved.constraints).toEqual(preservedBefore.constraints);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).filter((row) => row.relname !== G007P11_INDEX)).toEqual(preservedBefore.indexes);
        expect((finalPreserved.indexes as Array<Record<string, unknown>>).find((row) => row.relname === G007P11_INDEX)?.indexdef).toBe(G007P11_INDEXDEF);
      } finally {
        await client.unsafe("ROLLBACK").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    360000,
  );

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "rehearses fresh, exact T-028 upgrade, receipt drift, rollback, hostile path, isolation, actors, anon projection, and replay on PostgreSQL 16",
    async () => {
      const url = process.env.G003_DATABASE_URL;
      if (!url) throw new Error("G003_DATABASE_URL is required");
      const parsed = new URL(url);
      if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
      const client = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        expect((await client.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);

        const full = await resetDatabase(client, true);
        expect(full).toEqual({ discovered: 54, applied: 52, skipped: 2 });
        await assertCatalog(client);

        const expectedFinalQueueIndexes: LeadAiQueueIndex[] = [
          {
            indexname: "idx_g007p_leads_tenant_ai_queue_ready",
            relkind: "i",
            indexdef: "CREATE INDEX idx_g007p_leads_tenant_ai_queue_ready ON public.leads USING btree (tenant_id, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE (ai_queue_status = 'queued'::text)",
            indisvalid: true,
            indisready: true,
            indislive: true,
          },
          {
            indexname: "idx_g007p_leads_tenant_ai_queue_status",
            relkind: "i",
            indexdef: "CREATE INDEX idx_g007p_leads_tenant_ai_queue_status ON public.leads USING btree (tenant_id, ai_queue_status, ai_next_retry_at, sales_priority_score DESC)",
            indisvalid: true,
            indisready: true,
            indislive: true,
          },
        ];
        const finalQueueIndexes = await leadAiQueueIndexSnapshot(client);
        expect(finalQueueIndexes).toEqual(expectedFinalQueueIndexes);
        await client.unsafe(g007p3Sql);
        expect(await leadAiQueueIndexSnapshot(client)).toEqual(finalQueueIndexes);

        const priorRuntimeEnv = {
          databaseUrl: process.env.DATABASE_URL,
          repair: process.env.NOSITE_RUNTIME_POSTGRES_REPAIR,
          geography: process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL,
          zipSeed: process.env.NOSITE_RUNTIME_ZIP_SEED,
          databaseSsl: process.env.DATABASE_SSL,
        };
        let resetRuntimeDb: (() => Promise<void>) | undefined;
        try {
          process.env.DATABASE_URL = url;
          process.env.NOSITE_RUNTIME_POSTGRES_REPAIR = "1";
          process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL = "0";
          process.env.NOSITE_RUNTIME_ZIP_SEED = "0";
          process.env.DATABASE_SSL = "disable";
          const dbModule = await import("@/lib/db/index");
          resetRuntimeDb = dbModule.resetDbClient;
          const { ensureDbReady } = await import("@/lib/db/queries");
          const p6RuntimeCatalogBefore = await g007p6CatalogSnapshot(client);
          const p7RuntimeCatalogBefore = await g007p7CatalogSnapshot(client);
          const p8RuntimeCatalogBefore = await g007p8CatalogSnapshot(client);
          const p11RuntimeCatalogBefore = await g007p11CatalogSnapshot(client);
          await ensureDbReady();
          expect(await g007p6CatalogSnapshot(client)).toEqual(p6RuntimeCatalogBefore);
          expect(await g007p7CatalogSnapshot(client)).toEqual(p7RuntimeCatalogBefore);
          expect(await g007p8CatalogSnapshot(client)).toEqual(p8RuntimeCatalogBefore);
          expect(await g007p11CatalogSnapshot(client)).toEqual(p11RuntimeCatalogBefore);
          expect(await leadAiQueueIndexSnapshot(client)).toEqual(expectedFinalQueueIndexes);
        } finally {
          await resetRuntimeDb?.();
          if (priorRuntimeEnv.databaseUrl === undefined) delete process.env.DATABASE_URL;
          else process.env.DATABASE_URL = priorRuntimeEnv.databaseUrl;
          if (priorRuntimeEnv.repair === undefined) delete process.env.NOSITE_RUNTIME_POSTGRES_REPAIR;
          else process.env.NOSITE_RUNTIME_POSTGRES_REPAIR = priorRuntimeEnv.repair;
          if (priorRuntimeEnv.geography === undefined) delete process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL;
          else process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL = priorRuntimeEnv.geography;
          if (priorRuntimeEnv.zipSeed === undefined) delete process.env.NOSITE_RUNTIME_ZIP_SEED;
          else process.env.NOSITE_RUNTIME_ZIP_SEED = priorRuntimeEnv.zipSeed;
          if (priorRuntimeEnv.databaseSsl === undefined) delete process.env.DATABASE_SSL;
          else process.env.DATABASE_SSL = priorRuntimeEnv.databaseSsl;
        }
        expect((await client.unsafe(`
          SELECT count(*)::integer count FROM pg_catalog.pg_class i
          JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
          WHERE n.nspname='public' AND i.relname IN (
            'idx_ai_verifications_requester_created','idx_lead_ai_artifacts_requester_created',
            'idx_lead_ai_artifacts_retry_ready','idx_leads_ai_queue_ready',
            'idx_leads_ai_queue_status'
          )
        `))[0].count).toBe(0);
        expect(await client.unsafe(`
          SELECT indexname,indexdef FROM pg_catalog.pg_indexes
          WHERE schemaname='public' AND indexname IN (
            'idx_g007p_ai_verifications_tenant_requester_created',
            'idx_g007p_ai_artifacts_tenant_requester_created',
            'idx_g007p_ai_artifacts_tenant_retry_ready',
            'idx_g007p_leads_tenant_ai_queue_ready'
          ) ORDER BY indexname
        `)).toEqual([
          { indexname: "idx_g007p_ai_artifacts_tenant_requester_created", indexdef: "CREATE INDEX idx_g007p_ai_artifacts_tenant_requester_created ON public.lead_ai_artifacts USING btree (tenant_id, requested_by_user_id, created_at DESC)" },
          { indexname: "idx_g007p_ai_artifacts_tenant_retry_ready", indexdef: "CREATE INDEX idx_g007p_ai_artifacts_tenant_retry_ready ON public.lead_ai_artifacts USING btree (tenant_id, status, next_retry_at, created_at) WHERE (status = 'queued'::text)" },
          { indexname: "idx_g007p_ai_verifications_tenant_requester_created", indexdef: "CREATE INDEX idx_g007p_ai_verifications_tenant_requester_created ON public.ai_lead_verifications USING btree (tenant_id, requested_by_user_id, created_at DESC)" },
          { indexname: "idx_g007p_leads_tenant_ai_queue_ready", indexdef: "CREATE INDEX idx_g007p_leads_tenant_ai_queue_ready ON public.leads USING btree (tenant_id, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE (ai_queue_status = 'queued'::text)" },
        ]);

        await resetDatabase(client, true, true);
        const baselineQueueIndexes = await leadAiQueueIndexSnapshot(client);
        expect(baselineQueueIndexes).toEqual([
          {
            indexname: "idx_leads_ai_queue_ready",
            relkind: "i",
            indexdef: "CREATE INDEX idx_leads_ai_queue_ready ON public.leads USING btree (ai_queue_status, ai_next_retry_at, sales_priority_score DESC, raw_opportunity_score DESC, score DESC, updated_at) WHERE (ai_queue_status = 'queued'::text)",
            indisvalid: true,
            indisready: true,
            indislive: true,
          },
          {
            indexname: "idx_leads_ai_queue_status",
            relkind: "i",
            indexdef: "CREATE INDEX idx_leads_ai_queue_status ON public.leads USING btree (ai_queue_status, ai_next_retry_at, sales_priority_score DESC)",
            indisvalid: true,
            indisready: true,
            indislive: true,
          },
        ]);
        await seedG007P3PlanRows(client);
        expect(await client.unsafe(`
          SELECT tenant_id::text,ai_queue_status,count(*)::integer AS row_count
          FROM public.leads
          WHERE tenant_id IN ('${tenantA}','${tenantB}')
          GROUP BY tenant_id,ai_queue_status
          ORDER BY tenant_id,ai_queue_status
        `)).toEqual([
          { tenant_id: tenantA, ai_queue_status: "queued", row_count: 4000 },
          { tenant_id: tenantA, ai_queue_status: "running", row_count: 4000 },
          { tenant_id: tenantA, ai_queue_status: "verified", row_count: 32000 },
          { tenant_id: tenantB, ai_queue_status: "queued", row_count: 4000 },
          { tenant_id: tenantB, ai_queue_status: "running", row_count: 4000 },
          { tenant_id: tenantB, ai_queue_status: "verified", row_count: 32000 },
        ]);
        const baselineReadyPlan = (await client.unsafe<Record<string, string>[]>(`
          EXPLAIN (ANALYZE,COSTS OFF,TIMING OFF,SUMMARY OFF)
          SELECT id FROM public.leads
          WHERE tenant_id='${tenantA}' AND ai_queue_status='queued'
            AND (ai_next_retry_at IS NULL OR ai_next_retry_at <= now())
            AND ai_attempt_count < 3 AND COALESCE(is_excluded,0)=0
            AND archived_at IS NULL AND status NOT IN ('closed_won','closed_lost')
            AND COALESCE(business_status,'') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
          ORDER BY sales_priority_score DESC,raw_opportunity_score DESC,score DESC,updated_at
          LIMIT 10
        `)).map((row) => Object.values(row)[0]).join("\n");
        expect(baselineReadyPlan).toMatch(/idx_leads_ai_queue_(?:ready|status)/u);
        expect(baselineReadyPlan).toMatch(/Filter: .*tenant_id/u);
        expect(baselineReadyPlan).toMatch(/Rows Removed by Filter: [1-9][0-9]*/u);

        const baselineStalePlan = (await client.unsafe<Record<string, string>[]>(`
          EXPLAIN (ANALYZE,COSTS OFF,TIMING OFF,SUMMARY OFF)
          SELECT id FROM public.leads
          WHERE tenant_id='${tenantA}' AND ai_queue_status='running'
            AND updated_at < now()-interval '5 minutes'
        `)).map((row) => Object.values(row)[0]).join("\n");
        expect(baselineStalePlan).toContain("idx_leads_ai_queue_status");
        expect(baselineStalePlan).toMatch(/Filter: .*tenant_id/u);
        expect(baselineStalePlan).toMatch(/Rows Removed by Filter: [1-9][0-9]*/u);

        await client.unsafe(g007p3Sql);
        await client.unsafe("ANALYZE public.leads");
        expect(await leadAiQueueIndexSnapshot(client)).toEqual(expectedFinalQueueIndexes);
        const finalReadyPlan = (await client.unsafe<Record<string, string>[]>(`
          EXPLAIN (ANALYZE,COSTS OFF,TIMING OFF,SUMMARY OFF)
          SELECT id FROM public.leads
          WHERE tenant_id='${tenantA}' AND ai_queue_status='queued'
            AND (ai_next_retry_at IS NULL OR ai_next_retry_at <= now())
            AND ai_attempt_count < 3 AND COALESCE(is_excluded,0)=0
            AND archived_at IS NULL AND status NOT IN ('closed_won','closed_lost')
            AND COALESCE(business_status,'') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
          ORDER BY sales_priority_score DESC,raw_opportunity_score DESC,score DESC,updated_at
          LIMIT 10
        `)).map((row) => Object.values(row)[0]).join("\n");
        expect(finalReadyPlan).toContain("idx_g007p_leads_tenant_ai_queue_ready");
        expect(finalReadyPlan).toMatch(/Index Cond: \(tenant_id = '[^']+'::uuid\)/u);
        expect(expectedFinalQueueIndexes[0].indexdef).toContain("WHERE (ai_queue_status = 'queued'::text)");
        expect(finalReadyPlan.split("\n").filter((line) => line.includes("Filter:")).join("\n")).not.toContain("tenant_id");

        const finalStalePlan = (await client.unsafe<Record<string, string>[]>(`
          EXPLAIN (ANALYZE,COSTS OFF,TIMING OFF,SUMMARY OFF)
          SELECT id FROM public.leads
          WHERE tenant_id='${tenantA}' AND ai_queue_status='running'
            AND updated_at < now()-interval '5 minutes'
        `)).map((row) => Object.values(row)[0]).join("\n");
        expect(finalStalePlan).toContain("idx_g007p_leads_tenant_ai_queue_status");
        expect(finalStalePlan).toMatch(/Index Cond: .*tenant_id.*ai_queue_status/u);
        expect(finalStalePlan.split("\n").filter((line) => line.includes("Filter:")).join("\n")).not.toContain("tenant_id");

        await resetDatabase(client, true, true);
        const rollbackBaseline = await leadAiQueueIndexSnapshot(client);
        await client.unsafe("BEGIN");
        await client.unsafe(g007p3Sql);
        expect(await leadAiQueueIndexSnapshot(client)).toEqual(expectedFinalQueueIndexes);
        await client.unsafe("ROLLBACK");
        expect(await leadAiQueueIndexSnapshot(client)).toEqual(rollbackBaseline);

        for (const mutation of [
          "baseline_missing",
          "baseline_partial",
          "baseline_spoof_ready",
          "baseline_spoof_status",
          "baseline_non_index_final_name",
          "final_missing",
          "final_partial",
          "final_spoof_ready",
          "final_spoof_status",
        ] as const) {
          await resetDatabase(client, true, true);
          if (mutation.startsWith("final_")) await client.unsafe(g007p3Sql);
          if (mutation === "baseline_missing") {
            await client.unsafe("DROP INDEX public.idx_leads_ai_queue_ready; DROP INDEX public.idx_leads_ai_queue_status");
          }
          if (mutation === "baseline_partial") await client.unsafe("DROP INDEX public.idx_leads_ai_queue_status");
          if (mutation === "baseline_spoof_ready") {
            await client.unsafe("DROP INDEX public.idx_leads_ai_queue_ready; CREATE INDEX idx_leads_ai_queue_ready ON public.leads(ai_queue_status,tenant_id,updated_at) WHERE ai_queue_status='queued'");
          }
          if (mutation === "baseline_spoof_status") {
            await client.unsafe("DROP INDEX public.idx_leads_ai_queue_status; CREATE INDEX idx_leads_ai_queue_status ON public.leads(ai_queue_status,tenant_id,updated_at)");
          }
          if (mutation === "baseline_non_index_final_name") await client.unsafe("CREATE TABLE public.idx_g007p_leads_tenant_ai_queue_ready(sentinel integer)");
          if (mutation === "final_missing") {
            await client.unsafe("DROP INDEX public.idx_g007p_leads_tenant_ai_queue_ready; DROP INDEX public.idx_g007p_leads_tenant_ai_queue_status");
          }
          if (mutation === "final_partial") await client.unsafe("DROP INDEX public.idx_g007p_leads_tenant_ai_queue_status");
          if (mutation === "final_spoof_ready") {
            await client.unsafe("DROP INDEX public.idx_g007p_leads_tenant_ai_queue_ready; CREATE INDEX idx_g007p_leads_tenant_ai_queue_ready ON public.leads(ai_queue_status,tenant_id,updated_at) WHERE ai_queue_status='queued'");
          }
          if (mutation === "final_spoof_status") {
            await client.unsafe("DROP INDEX public.idx_g007p_leads_tenant_ai_queue_status; CREATE INDEX idx_g007p_leads_tenant_ai_queue_status ON public.leads(ai_queue_status,tenant_id,updated_at)");
          }
          await expectG007P3RejectedWithoutChange(client, mutation);
        }

        await resetDatabase(client, true, true);
        await client.unsafe(`
          UPDATE pg_catalog.pg_index
          SET indisvalid=false
          WHERE indexrelid=(
            SELECT conindid FROM pg_catalog.pg_constraint
            WHERE connamespace='public'::regnamespace
              AND conrelid='public.leads'::regclass
              AND conname='leads_tenant_id_id_unique'
          )
        `);
        expect((await client.unsafe(`
          SELECT c.convalidated,pg_catalog.pg_get_constraintdef(c.oid) definition,x.indisunique,x.indisvalid,x.indisready,x.indislive
          FROM pg_catalog.pg_constraint c
          JOIN pg_catalog.pg_index x ON x.indexrelid=c.conindid
          WHERE c.connamespace='public'::regnamespace
            AND c.conrelid='public.leads'::regclass
            AND c.conname='leads_tenant_id_id_unique'
        `))[0]).toEqual({ convalidated: true, definition: "UNIQUE (tenant_id, id)", indisunique: true, indisvalid: false, indisready: true, indislive: true });
        await expectG007P3RejectedWithoutChange(client, "foundation_backing_index_invalid");

        await resetDatabase(client, false);
        await seedLegacyGraph(client);
        await client.unsafe(`
          INSERT INTO public.tenants(id,slug,name,status) VALUES ('${tenantA}','manual-a','Manual A','active');
          INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceA}','${tenantA}','manual-workspace','Manual Workspace','active');
          INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES ('${membershipA}','${tenantA}','${ownerA}','${workspaceA}','active');
          UPDATE public.leads SET tenant_id='${tenantA}';
          UPDATE public.lead_notes SET tenant_id='${tenantA}',workspace_id='${workspaceA}';
          UPDATE public.outreach_events SET tenant_id='${tenantA}',workspace_id='${workspaceA}';
          UPDATE public.admin_requests SET tenant_id='${tenantA}',workspace_id='${workspaceA}';
          UPDATE public.demos SET tenant_id='${tenantA}',workspace_id='${workspaceA}';
          ALTER TABLE public.leads ALTER COLUMN tenant_id SET NOT NULL;
          ALTER TABLE public.lead_notes ALTER COLUMN tenant_id SET NOT NULL;
          ALTER TABLE public.outreach_events ALTER COLUMN tenant_id SET NOT NULL;
          ALTER TABLE public.admin_requests ALTER COLUMN tenant_id SET NOT NULL;
          ALTER TABLE public.demos ALTER COLUMN tenant_id SET NOT NULL;
        `);
        await client.unsafe(g002Sql);
        await client.unsafe(`
          CREATE INDEX idx_leads_tenant_place_id ON public.leads(tenant_id,place_id);
          CREATE FUNCTION public.novatrade_inherit_lead_child_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        `);
        await expectMigrationRejected(client, /G003_MATCHING_T028_RECEIPT_REQUIRED/);

        for (const mutation of ["function_body", "function_owner", "trigger_shape", "index_predicate", "index_definition", "function_acl_overload", "unvalidated_fk"] as const) {
          // G-003 replay is tested at its own migration boundary.  G-004A
          // legitimately depends on G-003's compound lead key.
          await resetDatabase(client, true, true);
          await seedPostInstallGraph(client);
          if (mutation === "function_body") {
            await client.unsafe(`
              CREATE OR REPLACE FUNCTION public.novatrade_lead_scope_guard() RETURNS trigger
              LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RETURN NEW; END $$;
            `);
            expect((await client.unsafe(`
              SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') hash
                FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_lead_scope_guard()'::regprocedure
            `))[0].hash).not.toBe("b1e8a0dfad0eea52cde6ae77a5090f16410173a356c66ed9c536964bdc12f96d");
          }
          if (mutation === "function_owner") {
            await client.unsafe(`
              DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='g003_untrusted_owner') THEN
                CREATE ROLE g003_untrusted_owner NOLOGIN;
              END IF; END $$;
              ALTER FUNCTION public.novatrade_published_demo_public(text) OWNER TO g003_untrusted_owner;
            `);
          }
          if (mutation === "trigger_shape") {
            await client.unsafe(`
              DROP TRIGGER trg_novatrade_lead_scope_guard ON public.leads;
              CREATE TRIGGER trg_novatrade_lead_scope_guard AFTER INSERT OR UPDATE ON public.leads
                FOR EACH ROW EXECUTE FUNCTION public.novatrade_lead_scope_guard();
            `);
          }
          if (mutation === "index_predicate") {
            await client.unsafe(`
              DROP INDEX public.admin_requests_tenant_lead_open_unique;
              CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique
                ON public.admin_requests(tenant_id,lead_id,request_type) WHERE status='new';
            `);
          }
          if (mutation === "index_definition") {
            await client.unsafe(`
              DROP INDEX public.admin_requests_tenant_lead_open_unique;
              CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique
                ON public.admin_requests(tenant_id,id)
                WHERE status = ANY (ARRAY['new','seen','in_progress','waiting_on_researcher']);
            `);
          }
          if (mutation === "function_acl_overload") {
            await client.unsafe(`
              REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(text) FROM anon;
              CREATE FUNCTION public.novatrade_published_demo_public(integer) RETURNS integer
                LANGUAGE sql IMMUTABLE AS 'SELECT $1';
              REVOKE ALL ON FUNCTION public.novatrade_published_demo_public(integer) FROM PUBLIC;
              GRANT EXECUTE ON FUNCTION public.novatrade_published_demo_public(integer) TO anon;
            `);
          }
          if (mutation === "unvalidated_fk") {
            await client.unsafe(`
              ALTER TABLE public.lead_notes DROP CONSTRAINT lead_notes_tenant_lead_fkey;
              ALTER TABLE public.lead_notes ADD CONSTRAINT lead_notes_tenant_lead_fkey
                FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)
                ON UPDATE RESTRICT ON DELETE CASCADE NOT VALID;
            `);
          }
          expect((await client.unsafe("SELECT count(*)::integer count FROM public.compatibility_backfill_receipts"))[0].count, mutation).toBe(0);
          expect((await client.unsafe("SELECT count(*)::integer count FROM public.leads"))[0].count, mutation).toBe(1);
          await expectMigrationRejected(client, /G003_MATCHING_T028_RECEIPT_REQUIRED/, mutation);
        }

        // Do not replay an upstream migration after its downstream FK consumer.
        await resetDatabase(client, true, true);
        await seedPostInstallGraph(client);
        const postInstallReplayBefore = await targetSnapshot(client);
        await client.unsafe(`
          CREATE SCHEMA g003_shadow;
          CREATE TABLE g003_shadow.leads(sentinel text);
          CREATE TABLE g003_shadow.workspaces(sentinel text);
          SET search_path=g003_shadow,public;
        `);
        await client.unsafe(g003Sql);
        await client.unsafe("RESET search_path");
        expect(await targetSnapshot(client)).toEqual(postInstallReplayBefore);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.compatibility_backfill_receipts"))[0].count).toBe(0);

        for (const mutation of ["missing", "count", "checksum", "duplicate"] as const) {
          await prepareUpgrade(client);
          await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk");
          if (mutation === "missing") await client.unsafe("DELETE FROM public.compatibility_backfill_receipts");
          if (mutation === "count") await client.unsafe("UPDATE public.compatibility_backfill_receipts SET table_counts=jsonb_set(table_counts,'{leads}','99'::jsonb)");
          if (mutation === "checksum") await client.unsafe("UPDATE public.compatibility_backfill_receipts SET after_content_checksums=jsonb_set(after_content_checksums,'{leads}',to_jsonb(repeat('0',64)))");
          if (mutation === "duplicate") {
            await client.unsafe(`
              ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_key_unique;
              INSERT INTO public.compatibility_backfill_receipts(
                id,idempotency_key,schema_version,source_engine,checksum_algorithm,manifest_hash,source_snapshot_fingerprint,
                tenant_id,workspace_id,owner_auth_identity_id,policy_id,policy_version,policy_hash,user_count,table_counts,
                before_content_checksums,after_content_checksums,relationship_orphan_count,status,created_at,completed_at,receipt
              ) SELECT pg_catalog.gen_random_uuid(),idempotency_key||'-duplicate',schema_version,source_engine,checksum_algorithm,manifest_hash,source_snapshot_fingerprint,
                tenant_id,workspace_id,owner_auth_identity_id,policy_id,policy_version,policy_hash,user_count,table_counts,
                before_content_checksums,after_content_checksums,relationship_orphan_count,status,created_at,completed_at,receipt
                FROM public.compatibility_backfill_receipts LIMIT 1;
            `);
          }
          await expectMigrationRejected(client, mutation === "duplicate" ? /G003_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED/ : /G003_MATCHING_T028_RECEIPT_REQUIRED/);
        }

        await prepareUpgrade(client);
        await addTenantB(client);
        await client.unsafe(`
          UPDATE public.lead_notes SET tenant_id='${tenantB}',workspace_id='${workspaceB}';
          UPDATE public.outreach_events SET tenant_id='${tenantB}',workspace_id='${workspaceB}';
          UPDATE public.admin_requests SET tenant_id='${tenantB}',workspace_id='${workspaceB}';
          UPDATE public.demos SET tenant_id='${tenantB}',workspace_id='${workspaceB}';
          UPDATE public.leads SET tenant_id='${tenantB}';
        `);
        await expectMigrationRejected(client, /G003_T028_RECEIPT_SCOPE_DRIFT/);

        await prepareUpgrade(client);
        await addTenantB(client);
        await client.unsafe(`
          ALTER TABLE public.compatibility_backfill_receipts
            DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard;
          ALTER TABLE public.compatibility_backfill_receipts
            DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk;
          UPDATE public.outreach_events SET actor_user_id='${ownerB}';
        `);
        await alignReceiptChecksumsToCurrentTargets(client);
        await expectMigrationRejected(client, /G003_EXISTING_ACTOR_SCOPE_INVALID/);

        for (const table of ["lead_notes", "outreach_events", "admin_requests", "demos"] as const) {
          await prepareUpgrade(client);
          await client.unsafe(`
            ALTER TABLE public.compatibility_backfill_receipts
              DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard;
            ALTER TABLE public.compatibility_backfill_receipts
              DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk;
            DO $$ DECLARE r record; BEGIN
              FOR r IN SELECT conname FROM pg_catalog.pg_constraint
                WHERE conrelid='public.${table}'::regclass AND confrelid='public.leads'::regclass
              LOOP EXECUTE format('ALTER TABLE public.${table} DROP CONSTRAINT %I',r.conname); END LOOP;
            END $$;
            UPDATE public.${table} SET lead_id='missing-lead';
          `);
          await alignReceiptChecksumsToCurrentTargets(client);
          const before = await targetSnapshot(client);
          await expectMigrationRejected(client, /G003_LEAD_CHILD_ORPHAN_OR_SCOPE_MISMATCH/);
          expect(await targetSnapshot(client)).toEqual(before);
        }

        await prepareUpgrade(client);
        const before = await targetSnapshot(client);
        await client.unsafe(`
          CREATE SCHEMA g003_shadow;
          CREATE TABLE g003_shadow.leads(sentinel text);
          CREATE TABLE g003_shadow.lead_notes(sentinel text);
          CREATE TABLE g003_shadow.outreach_events(sentinel text);
          CREATE TABLE g003_shadow.admin_requests(sentinel text);
          CREATE TABLE g003_shadow.demos(sentinel text);
          INSERT INTO g003_shadow.leads VALUES ('unchanged');
          SET search_path=g003_shadow,public;
        `);
        await client.unsafe(g003Sql);
        await client.unsafe("RESET search_path");
        expect(await targetSnapshot(client)).toEqual(before);
        expect((await client.unsafe("SELECT sentinel FROM g003_shadow.leads"))[0].sentinel).toBe("unchanged");
        await assertCatalog(client);

        const replayBefore = await targetSnapshot(client);
        const catalogBefore = await client.unsafe("SELECT pg_catalog.pg_get_functiondef('public.novatrade_published_demo_public(text)'::regprocedure) definition,pg_catalog.obj_description('public.novatrade_published_demo_public(text)'::regprocedure,'pg_proc') comment");
        await client.unsafe(g003Sql);
        expect(await targetSnapshot(client)).toEqual(replayBefore);
        expect(await client.unsafe("SELECT pg_catalog.pg_get_functiondef('public.novatrade_published_demo_public(text)'::regprocedure) definition,pg_catalog.obj_description('public.novatrade_published_demo_public(text)'::regprocedure,'pg_proc') comment")).toEqual(catalogBefore);

        await addTenantB(client);
        await client.unsafe(`INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('tenant-b-lead','${tenantB}','legacy-place','Tenant B Business')`);
        await client.unsafe("UPDATE public.admin_requests SET status='seen' WHERE id='legacy-request'");
        await expect(client.unsafe(`INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('tenant-a-duplicate','${tenantA}','legacy-place','Duplicate')`)).rejects.toThrow(/leads_tenant_place_id_unique/);
        await expect(client.unsafe(`UPDATE public.leads SET assigned_to_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.leads SET assigned_to_user_id='${suspendedActor}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.leads SET archived_by_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.leads SET quality_checked_by_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.lead_notes(id,lead_id,tenant_id,workspace_id,author_user_id,body) VALUES ('bad-note','legacy-lead','${tenantA}','${workspaceA}','${ownerB}','bad')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.outreach_events(id,lead_id,tenant_id,workspace_id,actor_user_id,channel) VALUES ('bad-outreach','legacy-lead','${tenantA}','${workspaceA}','${ownerB}','email')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.outreach_events SET actor_user_id='${suspendedActor}' WHERE id='legacy-outreach'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.admin_requests(id,lead_id,tenant_id,workspace_id,created_by_user_id,assigned_admin_user_id,request_type) VALUES ('bad-request','legacy-lead','${tenantA}','${workspaceA}','${ownerA}','${ownerB}','quote_request')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.demos(id,lead_id,tenant_id,workspace_id,slug,published_by_user_id) VALUES ('bad-demo','legacy-lead','${tenantA}','${workspaceA}','bad-demo','${ownerB}')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.outreach_events(id,lead_id,tenant_id,workspace_id,channel) VALUES ('cross-workspace','legacy-lead','${tenantA}','${workspaceB}','email')`)).rejects.toThrow(/tenant_workspace_fkey/);
        await expect(client.unsafe(`UPDATE public.lead_notes SET lead_id='tenant-b-lead' WHERE id='legacy-note'`)).rejects.toThrow(/G003_LEAD_CHILD_SCOPE_IMMUTABLE/);
        await expect(client.unsafe(`INSERT INTO public.demos(id,lead_id,tenant_id,slug) VALUES ('duplicate-slug','tenant-b-lead','${tenantB}','legacy-public')`)).rejects.toThrow(/demos_slug_key/);

        const migrationClient = postgres(url, { max: 1, onnotice: () => undefined });
        const writerClient = postgres(url, { max: 1, onnotice: () => undefined });
        let instrumentedReplay: Promise<unknown> | undefined;
        try {
          const migrationPid = (await migrationClient.unsafe<Array<{ pid: number }>>("SELECT pg_catalog.pg_backend_pid() pid"))[0].pid;
          const lockProbeSql = g003Sql.replace(
            "-- G003_WRITER_LOCKS_ACQUIRED",
            "-- G003_WRITER_LOCKS_ACQUIRED\nSELECT pg_catalog.pg_sleep(2);",
          );
          expect(lockProbeSql).not.toBe(g003Sql);
          instrumentedReplay = Promise.resolve(migrationClient.unsafe(lockProbeSql));
          let lockedTargets = 0;
          for (let attempt = 0; attempt < 50 && lockedTargets !== 5; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            lockedTargets = Number((await client.unsafe(`
              SELECT count(*)::integer count FROM pg_catalog.pg_locks
               WHERE pid=${migrationPid} AND granted AND mode='ShareRowExclusiveLock'
                 AND relation IN ('public.leads'::regclass,'public.lead_notes'::regclass,'public.outreach_events'::regclass,'public.admin_requests'::regclass,'public.demos'::regclass)
            `))[0].count);
          }
          expect(lockedTargets).toBe(5);
          await writerClient.unsafe("SET lock_timeout='250ms'");
          await expect(writerClient.unsafe(`INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('racing-lead','${tenantA}','racing-place','Racing Writer')`)).rejects.toThrow(/lock timeout/);
          await instrumentedReplay;
        } finally {
          await instrumentedReplay?.catch(() => undefined);
          await writerClient.unsafe("RESET lock_timeout").catch(() => undefined);
          await migrationClient.end({ timeout: 5 });
          await writerClient.end({ timeout: 5 });
        }

        await client.unsafe(`UPDATE public.demos SET config_json='{"headline":"Safe","services":["One"],"trustSignals":["Verified"],"secret":"hidden"}'::jsonb,is_published=1,revoked_at=NULL WHERE id='legacy-demo'`);
        await client.unsafe("SET ROLE anon");
        const publicRows = await client.unsafe("SELECT * FROM public.novatrade_published_demo_public('legacy-public')");
        expect(publicRows).toEqual([expect.objectContaining({ slug: "legacy-public", name: "Legacy Business", config_json: { headline: "Safe", services: ["One"], trustSignals: ["Verified"] } })]);
        expect(JSON.stringify(publicRows)).not.toMatch(/secret|tenant_id|workspace_id|legacy-lead|assigned_to_user_id/);
        await expect(client.unsafe("SELECT * FROM public.leads")).rejects.toThrow(/permission denied/);
        await expect(client.unsafe("INSERT INTO public.leads(id,tenant_id,place_id) VALUES ('anon-write',$$00000000-0000-4000-8000-000000000301$$,'anon')")).rejects.toThrow(/permission denied/);
        await client.unsafe("RESET ROLE");
        expect((await client.unsafe(`SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') hash FROM pg_catalog.pg_proc p WHERE p.oid='public.novatrade_published_demo_public(text)'::regprocedure`))[0].hash).toBe("806aabf2f0a019b6728978e5ace7e5b3d6f29ecd019689a2eabfc98457b21c83");
        for (const key of ["services", "trustSignals"] as const) {
          for (const value of ["scalar", { unsafe: true }, null, ["safe", { unsafe: true }], ["safe", "verified"]]) {
            await client.unsafe("UPDATE public.demos SET config_json=$1::jsonb WHERE id='legacy-demo'", [{ [key]: value }]);
            const expected = Array.isArray(value) && value.every((item) => typeof item === "string") ? { [key]: value } : {};
            expect((await client.unsafe("SELECT config_json FROM public.demos WHERE id='legacy-demo'"))[0].config_json).toEqual({ [key]: value });
            expect((await client.unsafe("SELECT config_json FROM public.novatrade_published_demo_public('legacy-public')"))[0].config_json).toEqual(expected);
          }
        }
        await client.unsafe("UPDATE public.demos SET revoked_at=now() WHERE id='legacy-demo'");
        await client.unsafe("SET ROLE anon");
        expect(await client.unsafe("SELECT * FROM public.novatrade_published_demo_public('legacy-public')")).toEqual([]);
        expect(await client.unsafe("SELECT * FROM public.novatrade_published_demo_public('missing')")).toEqual([]);
        await client.unsafe("RESET ROLE");
      } finally {
        await client.unsafe("RESET ROLE; RESET search_path; DROP SCHEMA IF EXISTS g003_shadow CASCADE").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    180000,
  );
});
