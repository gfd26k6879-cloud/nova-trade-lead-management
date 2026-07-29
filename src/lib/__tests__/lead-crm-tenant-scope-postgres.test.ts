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
const g002Sql = readFileSync(join("supabase", "migrations", G002_MIGRATION), "utf8");
const g003Sql = readFileSync(join("supabase", "migrations", G003_MIGRATION), "utf8");
const skipped = new Set(["20260514161714_supabase_ai_verification_cron.sql", "20260514163203_scheduler_v2_sales_ready_pipeline.sql"]);
const tenantA = "00000000-0000-4000-8000-000000000301";
const tenantB = "00000000-0000-4000-8000-000000000302";
const workspaceA = "10000000-0000-4000-8000-000000000301";
const workspaceB = "10000000-0000-4000-8000-000000000302";
const ownerA = "20000000-0000-4000-8000-000000000301";
const ownerB = "20000000-0000-4000-8000-000000000302";
const membershipA = "30000000-0000-4000-8000-000000000301";
const membershipB = "30000000-0000-4000-8000-000000000302";
const bindingA = "40000000-0000-4000-8000-000000000301";
const policyA = "50000000-0000-4000-8000-000000000301";
const policyHash = "c".repeat(64);
const targetTables = ["leads", "lead_notes", "outreach_events", "admin_requests", "demos"] as const;

type PgClient = ReturnType<typeof postgres>;

async function resetDatabase(client: PgClient, fullChain: boolean): Promise<{ discovered: number; applied: number; skipped: number }> {
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
    }],
    legacyTables,
  };
}

async function seedLegacyGraph(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}');
    INSERT INTO public.app_users(id,user_id,email,role,status)
      VALUES ('legacy-owner','${ownerA}','owner@synthetic.invalid','admin','active');
    INSERT INTO public.leads(id,place_id,name,address,phone,maps_uri,rating,review_count,selling_niche,assigned_to_user_id)
      VALUES ('legacy-lead','legacy-place','Legacy Business','1 Synthetic Way','555-0100','https://maps.invalid/legacy',4.5,12,'synthetic','${ownerA}');
    INSERT INTO public.lead_notes(id,lead_id,author_user_id,body)
      VALUES ('legacy-note','legacy-lead','${ownerA}','synthetic note');
    INSERT INTO public.outreach_events(id,lead_id,channel,actor_user_id,note)
      VALUES ('legacy-outreach','legacy-lead','email','${ownerA}','synthetic event');
    INSERT INTO public.admin_requests(id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status)
      VALUES ('legacy-request','legacy-lead','${ownerA}','${ownerA}','quote_request','new');
    INSERT INTO public.demos(id,lead_id,slug,config_json,is_published,published_by_user_id)
      VALUES ('legacy-demo','legacy-lead','legacy-public','{"headline":"Legacy","secret":"hidden"}'::jsonb,1,'${ownerA}');
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
        pg_catalog.obj_description(p.oid,'pg_proc') comment
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

async function expectMigrationRejected(client: PgClient, pattern: RegExp): Promise<void> {
  const catalogBefore = await targetCatalogSnapshot(client);
  await expect(client.unsafe(g003Sql)).rejects.toThrow(pattern);
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
  const constraints = await client.unsafe<Array<{ conname: string; definition: string }>>(`
    SELECT conname,pg_catalog.pg_get_constraintdef(oid) definition FROM pg_catalog.pg_constraint
     WHERE conname IN ('leads_tenant_id_id_unique','leads_tenant_place_id_unique','lead_notes_tenant_lead_fkey','outreach_events_tenant_lead_fkey','admin_requests_tenant_lead_fkey','demos_tenant_lead_fkey','lead_notes_tenant_workspace_fkey','outreach_events_tenant_workspace_fkey','admin_requests_tenant_workspace_fkey','demos_tenant_workspace_fkey')
     ORDER BY conname
  `);
  expect(constraints).toHaveLength(10);
  expect(constraints.filter((row) => row.conname.endsWith("_tenant_lead_fkey")).every((row) => row.definition.includes("FOREIGN KEY (tenant_id, lead_id)"))).toBe(true);
  expect(constraints.filter((row) => row.conname.endsWith("_tenant_workspace_fkey")).every((row) => row.definition.includes("FOREIGN KEY (tenant_id, workspace_id)"))).toBe(true);
  const functions = await client.unsafe<Array<{ proname: string; proconfig: string[]; prosecdef: boolean; anon_execute: boolean; authenticated_execute: boolean }>>(`
    SELECT p.proname,p.proconfig,p.prosecdef,
      pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
      FROM pg_catalog.pg_proc p
     WHERE p.proname IN ('novatrade_assert_lead_actor','novatrade_inherit_lead_child_scope','novatrade_lead_scope_guard','novatrade_published_demo_public')
     ORDER BY p.proname
  `);
  expect(functions).toHaveLength(4);
  for (const fn of functions) expect(fn.proconfig).toContain("search_path=pg_catalog, public");
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
    expect(g003Sql).toContain("FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)");
    expect(g003Sql).toContain("admin_requests_tenant_lead_open_unique");
    expect(g003Sql).toContain("SET search_path = pg_catalog, public");
    expect(g003Sql).toContain("JOIN public.leads l ON (l.tenant_id,l.id)=(d.tenant_id,d.lead_id)");
    for (const key of ["headline", "subheadline", "services", "trustSignals", "primaryCta", "secondaryCta", "websiteGap"]) expect(g003Sql).toContain(`'${key}'`);
    expect(g003Sql).toContain("REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos");
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
        expect(full).toEqual({ discovered: 43, applied: 41, skipped: 2 });
        await assertCatalog(client);

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
        await expect(client.unsafe(`INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('tenant-a-duplicate','${tenantA}','legacy-place','Duplicate')`)).rejects.toThrow(/leads_tenant_place_id_unique/);
        await expect(client.unsafe(`UPDATE public.leads SET assigned_to_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.leads SET archived_by_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`UPDATE public.leads SET quality_checked_by_user_id='${ownerB}' WHERE id='legacy-lead'`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.lead_notes(id,lead_id,tenant_id,workspace_id,author_user_id,body) VALUES ('bad-note','legacy-lead','${tenantA}','${workspaceA}','${ownerB}','bad')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.outreach_events(id,lead_id,tenant_id,workspace_id,actor_user_id,channel) VALUES ('bad-outreach','legacy-lead','${tenantA}','${workspaceA}','${ownerB}','email')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.admin_requests(id,lead_id,tenant_id,workspace_id,created_by_user_id,assigned_admin_user_id,request_type) VALUES ('bad-request','legacy-lead','${tenantA}','${workspaceA}','${ownerA}','${ownerB}','quote_request')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.demos(id,lead_id,tenant_id,workspace_id,slug,published_by_user_id) VALUES ('bad-demo','legacy-lead','${tenantA}','${workspaceA}','bad-demo','${ownerB}')`)).rejects.toThrow(/G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.outreach_events(id,lead_id,tenant_id,workspace_id,channel) VALUES ('cross-workspace','legacy-lead','${tenantA}','${workspaceB}','email')`)).rejects.toThrow(/tenant_workspace_fkey/);
        await expect(client.unsafe(`UPDATE public.lead_notes SET lead_id='tenant-b-lead' WHERE id='legacy-note'`)).rejects.toThrow(/G003_LEAD_CHILD_SCOPE_IMMUTABLE/);
        await expect(client.unsafe(`INSERT INTO public.demos(id,lead_id,tenant_id,slug) VALUES ('duplicate-slug','tenant-b-lead','${tenantB}','legacy-public')`)).rejects.toThrow(/demos_slug_key/);

        await client.unsafe(`UPDATE public.demos SET config_json='{"headline":"Safe","services":["One"],"trustSignals":["Verified"],"secret":"hidden"}'::jsonb,is_published=1,revoked_at=NULL WHERE id='legacy-demo'`);
        await client.unsafe("SET ROLE anon");
        const publicRows = await client.unsafe("SELECT * FROM public.novatrade_published_demo_public('legacy-public')");
        expect(publicRows).toEqual([expect.objectContaining({ slug: "legacy-public", name: "Legacy Business", config_json: { headline: "Safe", services: ["One"], trustSignals: ["Verified"] } })]);
        expect(JSON.stringify(publicRows)).not.toMatch(/secret|tenant_id|workspace_id|legacy-lead|assigned_to_user_id/);
        await expect(client.unsafe("SELECT * FROM public.leads")).rejects.toThrow(/permission denied/);
        await expect(client.unsafe("INSERT INTO public.leads(id,tenant_id,place_id) VALUES ('anon-write',$$00000000-0000-4000-8000-000000000301$$,'anon')")).rejects.toThrow(/permission denied/);
        await client.unsafe("RESET ROLE");
        await client.unsafe(`UPDATE public.demos SET config_json='{"services":["safe",{"unsafe":true}]}'::jsonb WHERE id='legacy-demo'`);
        expect((await client.unsafe("SELECT config_json FROM public.novatrade_published_demo_public('legacy-public')"))[0].config_json).toEqual({});
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
