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
const g002Sql = readFileSync(join("supabase", "migrations", G002_MIGRATION), "utf8");
const g003Sql = readFileSync(join("supabase", "migrations", G003_MIGRATION), "utf8");
const g007p3Sql = readFileSync(join("supabase", "migrations", G007P3_MIGRATION), "utf8");
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

async function resetDatabase(client: PgClient, fullChain: boolean, g003Boundary = false): Promise<{ discovered: number; applied: number; skipped: number }> {
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
        expect(full).toEqual({ discovered: 48, applied: 46, skipped: 2 });
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
          await ensureDbReady();
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
