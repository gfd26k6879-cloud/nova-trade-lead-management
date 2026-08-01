import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

const G002 = "202607290001_add_location_crawl_tenant_scope.sql";
const G003 = "202607290002_add_lead_crm_tenant_scope.sql";
const G004A = "202607290003_add_ai_tenant_scope_worker_envelope.sql";
const G007P2 = "202607310002_tenant_prefix_ai_verification_indexes.sql";
const G004AR1 = "202607310008_harden_ai_usage_transitive_lead_delete.sql";
const migrationSql = readFileSync(join("supabase", "migrations", G004A), "utf8");
const g007p2Sql = readFileSync(join("supabase", "migrations", G007P2), "utf8");
const g004ar1Sql = readFileSync(join("supabase", "migrations", G004AR1), "utf8");
const skipped = new Set(["20260514161714_supabase_ai_verification_cron.sql", "20260514163203_scheduler_v2_sales_ready_pipeline.sql"]);
const pinnedPostgres16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const tenantA = "00000000-0000-4000-8000-000000000401";
const tenantB = "00000000-0000-4000-8000-000000000402";
const workspaceA = "10000000-0000-4000-8000-000000000401";
const workspaceAAlt = "10000000-0000-4000-8000-000000000403";
const workspaceB = "10000000-0000-4000-8000-000000000402";
const ownerA = "20000000-0000-4000-8000-000000000401";
const ownerB = "20000000-0000-4000-8000-000000000402";
const inactiveA = "20000000-0000-4000-8000-000000000403";
const membershipA = "30000000-0000-4000-8000-000000000401";
const membershipB = "30000000-0000-4000-8000-000000000402";
const inactiveMembershipA = "30000000-0000-4000-8000-000000000403";
const bindingA = "40000000-0000-4000-8000-000000000401";
const inactiveBindingA = "40000000-0000-4000-8000-000000000403";
const policyA = "50000000-0000-4000-8000-000000000401";
const policyHash = "e".repeat(64);
const aiTables = ["ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events", "ai_usage_events"] as const;
type PgClient = ReturnType<typeof postgres>;

function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function waitForPostgres(container: string, database: string): void {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-Atc", "SELECT 1"], true) === "1") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`PostgreSQL did not become ready: ${docker(["logs", container], true)}`);
}

async function resetTo(client: PgClient, stopBefore?: string): Promise<{ discovered: number; applied: number; skipped: number }> {
  await client.unsafe(`
    RESET ROLE; RESET search_path;
    DROP SCHEMA IF EXISTS g004a_shadow CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='g004a_inherited') THEN CREATE ROLE g004a_inherited NOLOGIN; END IF;
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
    if (stopBefore && file >= stopBefore) break;
    if (skipped.has(file)) continue;
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
  const workspaceScoped = new Set([
    "audit_logs", "user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events",
    "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
  ]);
  const legacyTables: CompatibilityTableExpectation[] = [];
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const expression = workspaceScoped.has(table)
      ? "(to_jsonb(t)-'tenant_id'-'workspace_id')::text"
      : "(to_jsonb(t)-'tenant_id')::text";
    const [row] = await client.unsafe<Array<{ row_count: number; content_checksum: string }>>(`
      SELECT count(*)::integer row_count,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${expression},'|' ORDER BY ${expression}),''),'UTF8')),'hex') content_checksum
      FROM public."${table}" t
    `);
    legacyTables.push({ table, rowCount: Number(row.row_count), contentChecksum: row.content_checksum });
  }
  return {
    schemaVersion: 1,
    sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g004a-postgres-rehearsal-v1",
    sourceSnapshotFingerprint: "f".repeat(64),
    tenantId: tenantA,
    tenantSlug: "g004a-legacy",
    tenantName: "G004A Legacy",
    workspaceId: workspaceA,
    workspaceSlug: "g004a-workspace",
    workspaceName: "G004A Workspace",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: ownerA,
    policyId: policyA,
    policyVersion: 1,
    policyHash,
    legacyUsers: [{
      legacyUserId: "legacy-owner", authIdentityId: ownerA, expectedEmail: "owner@g004a.invalid",
      expectedLegacyRole: "admin", expectedStatus: "active", membershipId: membershipA,
      workspaceId: workspaceA, membershipRole: "owner", membershipStatus: "active", roleBindingId: bindingA, marketAccessIds: [],
    }, {
      legacyUserId: "legacy-inactive", authIdentityId: inactiveA, expectedEmail: "inactive@g004a.invalid",
      expectedLegacyRole: "researcher", expectedStatus: "disabled", membershipId: inactiveMembershipA,
      workspaceId: workspaceA, membershipRole: "researcher", membershipStatus: "suspended", roleBindingId: inactiveBindingA, marketAccessIds: [],
    }],
    legacyTables,
  };
}

async function seedLegacyAiGraph(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}'),('${inactiveA}');
    INSERT INTO public.app_users(id,user_id,email,role,status) VALUES
      ('legacy-owner','${ownerA}','owner@g004a.invalid','admin','active'),
      ('legacy-inactive','${inactiveA}','inactive@g004a.invalid','researcher','disabled');
    INSERT INTO public.leads(id,place_id,name,assigned_to_user_id) VALUES
      ('lead-a','place-a','Equivalent Business','${ownerA}'),
      ('lead-a2','place-a2','Equivalent Business Two','${ownerA}');
    INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation,requested_by_user_id)
      VALUES ('verification-a','lead-a','gpt-test','complete','approve','${inactiveA}');
    INSERT INTO public.lead_ai_artifacts(id,lead_id,artifact_type,status,input_hash,prompt_version,requested_by_user_id)
      VALUES ('artifact-a','lead-a','business_detail','complete','equivalent-input','v1','${inactiveA}');
    INSERT INTO public.ai_feedback_events(id,lead_id,verification_id,artifact_id,actor_user_id,feedback_kind,verdict)
      VALUES ('feedback-a','lead-a','verification-a','artifact-a','${inactiveA}','verification','correct');
    INSERT INTO public.ai_usage_events(id,lead_id,verification_id,model,actor_user_id)
      VALUES ('usage-linked-a','lead-a','verification-a','gpt-test','${ownerA}'),
             ('usage-unlinked-legacy',NULL,NULL,'gpt-test','${inactiveA}');
    INSERT INTO public.worker_runs(id,worker_name,result_json)
      VALUES ('worker-sentinel','ai-verification','{"tenantId":"${tenantA}","content":"tenant-content-not-redacted"}'::jsonb);
  `);
}

async function prepareUpgrade(client: PgClient): Promise<void> {
  await resetTo(client, G002);
  await seedLegacyAiGraph(client);
  const manifest = await postgresManifest(client);
  await client.unsafe("SELECT public.novatrade_run_compatibility_backfill($1::jsonb)", [JSON.parse(JSON.stringify(manifest))]);
  await client.unsafe(readFileSync(join("supabase", "migrations", G002), "utf8"));
  await client.unsafe(readFileSync(join("supabase", "migrations", G003), "utf8"));
}

async function alignReceiptAiChecksums(client: PgClient): Promise<void> {
  const manifest = await postgresManifest(client);
  const checksums = Object.fromEntries(manifest.legacyTables
    .filter(({ table }) => aiTables.includes(table as (typeof aiTables)[number]))
    .map(({ table, contentChecksum }) => [table, contentChecksum]));
  await client.unsafe("UPDATE public.compatibility_backfill_receipts SET after_content_checksums=after_content_checksums||$1::jsonb", [checksums]);
}

async function catalogSnapshot(client: PgClient): Promise<Record<string, unknown>> {
  return {
    rows: Object.fromEntries(await Promise.all(aiTables.map(async (table) => [table, await client.unsafe(`SELECT to_jsonb(t) row FROM public.${table} t ORDER BY id`)]))),
    columns: await client.unsafe(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) AND column_name IN ('tenant_id','workspace_id') ORDER BY 1,2`, [aiTables]),
    columnAcls: await client.unsafe(`SELECT a.attrelid::regclass::text table_name,a.attname,a.attacl FROM pg_catalog.pg_attribute a WHERE a.attrelid=ANY($1::regclass[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2`, [aiTables.map((table) => `public.${table}`)]),
    constraints: await client.unsafe(`SELECT conrelid::regclass::text table_name,conname,pg_catalog.pg_get_constraintdef(oid) definition,convalidated,condeferrable,condeferred FROM pg_catalog.pg_constraint WHERE conrelid=ANY($1::regclass[]) ORDER BY 1,2`, [aiTables.map((table) => `public.${table}`)]),
    indexes: await client.unsafe(`SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='public' AND tablename=ANY($1) ORDER BY 1`, [aiTables]),
    triggers: await client.unsafe(`SELECT tgrelid::regclass::text table_name,tgname,pg_catalog.pg_get_triggerdef(oid) definition,tgenabled FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgrelid=ANY($1::regclass[]) ORDER BY 1,2`, [aiTables.map((table) => `public.${table}`)]),
    functions: await client.unsafe(`SELECT oid::regprocedure::text identity,pg_catalog.pg_get_functiondef(oid) definition,proowner,proacl,proconfig,pg_catalog.obj_description(oid,'pg_proc') comment FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('novatrade_ai_scope_guard','novatrade_ai_usage_ri_null_normalize') ORDER BY 1`),
    rls: await client.unsafe(`SELECT relname,relrowsecurity,relforcerowsecurity,relacl FROM pg_catalog.pg_class WHERE oid=ANY($1::regclass[]) ORDER BY 1`, [aiTables.map((table) => `public.${table}`)]),
    policies: await client.unsafe(`SELECT polname,polrelid::regclass::text table_name FROM pg_catalog.pg_policy WHERE polrelid=ANY($1::regclass[]) ORDER BY 1`, [aiTables.map((table) => `public.${table}`)]),
  };
}

async function expectMigrationRejectedWithoutResidue(client: PgClient, pattern: RegExp): Promise<void> {
  const before = await catalogSnapshot(client);
  let failure: unknown;
  try { await client.unsafe(migrationSql); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(pattern);
  await client.unsafe("ROLLBACK");
  expect(await catalogSnapshot(client)).toEqual(before);
}

async function expectG004AR1RejectedWithoutResidue(client: PgClient, pattern: RegExp): Promise<void> {
  const before = await catalogSnapshot(client);
  let failure: unknown;
  try { await client.unsafe(g004ar1Sql); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(pattern);
  await client.unsafe("ROLLBACK");
  expect(await catalogSnapshot(client)).toEqual(before);
}

async function addTenantB(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerB}') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenants(id,slug,name,status) VALUES ('${tenantB}','tenant-b','Tenant B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceB}','${tenantB}','workspace-b','Workspace B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status)
      VALUES ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-b','${tenantB}','place-b','Equivalent Business') ON CONFLICT DO NOTHING;
  `);
}

describe("G-004A AI tenant scope and worker envelope", () => {
  it.skipIf(process.env.G004A_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "executes the full receipt, replay, catalog, isolation, lifecycle, lock, and worker boundary matrix on disposable PostgreSQL 16",
    async () => {
      const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
      const container = `g004a-pg16-${suffix}`;
      const database = `g004a_ai_scope_rehearsal_${suffix.replaceAll("-", "_")}`;
      let client: PgClient | undefined;
      let port = "";
      expect(docker(["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], true)).toBe("");
      try {
        docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${database}`, pinnedPostgres16]);
        waitForPostgres(container, database);
        port = docker(["port", container, "5432/tcp"]).split(":").at(-1)!;
        const url = `postgres://postgres:postgres@127.0.0.1:${port}/${database}`;
        const parsed = new URL(url);
        expect(parsed.hostname).toBe("127.0.0.1");
        expect(parsed.pathname).toMatch(/^\/g004a_ai_scope_rehearsal_[a-z0-9_]+$/);
        client = postgres(url, { max: 1, onnotice: () => undefined });
        const [version] = await client.unsafe<Array<{ version: string }>>("SELECT current_setting('server_version_num') version");
        expect(version.version.startsWith("16")).toBe(true);

        const full = await resetTo(client);
        expect(full).toEqual({ discovered: 53, applied: 51, skipped: 2 });
        await client.unsafe(g007p2Sql);
        const verificationIndexes = await client.unsafe<Array<{ indexname: string; indexdef: string }>>(`
          SELECT indexname,indexdef FROM pg_catalog.pg_indexes
          WHERE schemaname='public' AND tablename='ai_lead_verifications'
            AND indexname IN (
              'idx_ai_verifications_tenant_lead_created',
              'idx_g007p_ai_verifications_tenant_status_created',
              'idx_g007p_ai_verifications_tenant_requester_created',
              'idx_ai_verifications_lead_created',
              'idx_ai_verifications_status_created',
              'idx_ai_verifications_requester_created'
            ) ORDER BY indexname
        `);
        expect(verificationIndexes.map((row) => row.indexname)).toEqual([
          "idx_ai_verifications_tenant_lead_created",
          "idx_g007p_ai_verifications_tenant_requester_created",
          "idx_g007p_ai_verifications_tenant_status_created",
        ]);
        expect(verificationIndexes.every((row) => row.indexdef.includes("(tenant_id,"))).toBe(true);
        await client.unsafe("SET enable_seqscan=off");
        try {
          for (const hotPath of [
            {
              index: "idx_g007p_ai_verifications_tenant_status_created",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.ai_lead_verifications
                WHERE tenant_id='${tenantA}' AND status='pending'
                ORDER BY created_at DESC LIMIT 10`,
            },
            {
              index: "idx_g007p_ai_verifications_tenant_requester_created",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.ai_lead_verifications
                WHERE tenant_id='${tenantA}' AND requested_by_user_id='${ownerA}'
                ORDER BY created_at DESC LIMIT 10`,
            },
          ] as const) {
            const plan = await client.unsafe<Record<string, string>[]>(hotPath.sql);
            expect(plan.map((row) => Object.values(row)[0]).join("\n")).toContain(hotPath.index);
          }
        } finally {
          await client.unsafe("RESET enable_seqscan");
        }

        for (const mutation of ["partial", "spoof"] as const) {
          await resetTo(client, G007P2);
          if (mutation === "partial") {
            await client.unsafe("DROP INDEX public.idx_ai_verifications_requester_created");
          } else {
            await client.unsafe("CREATE INDEX idx_g007p_ai_verifications_tenant_status_created ON public.ai_lead_verifications(status,tenant_id,created_at DESC)");
          }
          await expect(client.unsafe(g007p2Sql)).rejects.toThrow(/G007P2_INDEX_CATALOG_DRIFT/);
          expect((await client.unsafe(`SELECT count(*)::integer count FROM pg_catalog.pg_indexes
            WHERE schemaname='public' AND tablename='ai_lead_verifications'
              AND indexname='idx_g007p_ai_verifications_tenant_requester_created'`))[0].count).toBe(0);
        }
        expect((await client.unsafe("SELECT count(*)::integer count FROM pg_catalog.pg_attribute WHERE attrelid='public.worker_runs'::regclass AND attname IN ('tenant_id','workspace_id') AND NOT attisdropped"))[0].count).toBe(0);

        // Real nonempty T-028 -> G-002 -> G-003 -> G-004A upgrade.
        await prepareUpgrade(client);
        const workerBefore = await client.unsafe("SELECT to_jsonb(w) row FROM public.worker_runs w ORDER BY id");
        await client.unsafe(migrationSql);
        const scope = await client.unsafe(`SELECT 'verification' kind,tenant_id,workspace_id FROM public.ai_lead_verifications UNION ALL SELECT 'artifact',tenant_id,workspace_id FROM public.lead_ai_artifacts UNION ALL SELECT 'feedback',tenant_id,workspace_id FROM public.ai_feedback_events ORDER BY 1`);
        expect(scope).toEqual([
          { kind: "artifact", tenant_id: tenantA, workspace_id: workspaceA },
          { kind: "feedback", tenant_id: tenantA, workspace_id: workspaceA },
          { kind: "verification", tenant_id: tenantA, workspace_id: workspaceA },
        ]);
        expect((await client.unsafe("SELECT tenant_id FROM public.ai_usage_events ORDER BY id")).every((row) => row.tenant_id === tenantA)).toBe(true);
        expect(await client.unsafe("SELECT to_jsonb(w) row FROM public.worker_runs w ORDER BY id")).toEqual(workerBefore);
        expect(JSON.stringify(workerBefore)).toContain("tenant-content-not-redacted");
        expect((await client.unsafe("SELECT count(*)::integer count FROM pg_catalog.pg_constraint WHERE conrelid='public.worker_runs'::regclass AND confrelid IN ('public.tenants'::regclass,'public.workspaces'::regclass)"))[0].count).toBe(0);

        // Exact replay after post-install rows, receipt removal, and hostile path.
        await addTenantB(client);
        await client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation,requested_by_user_id) VALUES ('post-b','lead-b','same-model','queued','review','${ownerB}')`);
        await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; DELETE FROM public.compatibility_backfill_receipts");
        const replayBefore = await catalogSnapshot(client);
        await client.unsafe("CREATE SCHEMA g004a_shadow; CREATE TABLE g004a_shadow.ai_usage_events(sentinel text); CREATE FUNCTION g004a_shadow.novatrade_ai_scope_guard(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT $1'; SET search_path=g004a_shadow,public");
        await client.unsafe(migrationSql);
        expect((await client.unsafe("SELECT count(*)::integer count FROM g004a_shadow.ai_usage_events"))[0].count).toBe(0);
        await client.unsafe("RESET search_path");
        expect(await catalogSnapshot(client)).toEqual(replayBefore);

        // R1 installs additively, preserves the accepted v2 function byte-for-
        // byte, replays exactly under a hostile path, and remains compatible
        // with historical G-004A replay.
        const [v2Before] = await client.unsafe<Array<{ definition: string }>>(
          "SELECT pg_catalog.pg_get_functiondef('public.novatrade_ai_scope_guard()'::regprocedure) definition",
        );
        expect((await client.unsafe("SELECT pg_catalog.to_regprocedure('public.novatrade_ai_usage_ri_null_normalize()') identity"))[0].identity).toBeNull();
        await client.unsafe(g004ar1Sql);
        const [v2After] = await client.unsafe<Array<{ definition: string }>>(
          "SELECT pg_catalog.pg_get_functiondef('public.novatrade_ai_scope_guard()'::regprocedure) definition",
        );
        expect(v2After.definition).toBe(v2Before.definition);
        expect((await client.unsafe<Array<{ tgname: string }>>(`
          SELECT tgname FROM pg_catalog.pg_trigger
          WHERE tgrelid='public.ai_usage_events'::regclass AND NOT tgisinternal
            AND tgname IN ('trg_novatrade_ai_usage_events_a_ri_null_normalize','trg_novatrade_ai_usage_events_scope')
          ORDER BY tgname
        `)).map(({ tgname }) => tgname)).toEqual([
          "trg_novatrade_ai_usage_events_a_ri_null_normalize",
          "trg_novatrade_ai_usage_events_scope",
        ]);
        const r1ReplayBefore = await catalogSnapshot(client);
        await client.unsafe("SET search_path=g004a_shadow,public");
        await client.unsafe(g004ar1Sql);
        await client.unsafe("RESET search_path");
        expect(await catalogSnapshot(client)).toEqual(r1ReplayBefore);
        await client.unsafe(migrationSql);
        expect(await catalogSnapshot(client)).toEqual(r1ReplayBefore);

        // Runtime guards: omitted/mismatched tenant, workspace, references,
        // inactive attribution, equivalent inputs, and immutable scope.
        await client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,workspace_id,model,status,recommendation,requested_by_user_id) VALUES ('verification-b','lead-b',NULL,'same-model','queued','review','${ownerB}')`);
        expect((await client.unsafe("SELECT tenant_id,workspace_id FROM public.ai_lead_verifications WHERE id='verification-b'"))[0]).toEqual({ tenant_id: tenantB, workspace_id: null });
        await expect(client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,tenant_id,model,status,recommendation) VALUES ('bad-tenant','lead-b','${tenantA}','m','queued','review')`)).rejects.toThrow(/G004A_PARENT_TENANT_MISMATCH/);
        await expect(client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,workspace_id,model,status,recommendation) VALUES ('bad-workspace','lead-b','${workspaceA}','m','queued','review')`)).rejects.toThrow(/tenant_workspace_fkey/);
        await expect(client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation,requested_by_user_id) VALUES ('bad-actor','lead-b','m','queued','review','${ownerA}')`)).rejects.toThrow(/G004A_ACTIVE_SAME_TENANT_ATTRIBUTION_REQUIRED/);
        await expect(client.unsafe(`INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation,requested_by_user_id) VALUES ('inactive-new','lead-a','m','queued','review','${inactiveA}')`)).rejects.toThrow(/G004A_ACTIVE_SAME_TENANT_ATTRIBUTION_REQUIRED/);
        await client.unsafe("UPDATE public.ai_lead_verifications SET reason='historical inactive remains' WHERE id='verification-a'");
        await expect(client.unsafe(`UPDATE public.ai_lead_verifications SET requested_by_user_id='${inactiveA}' WHERE id='verification-b'`)).rejects.toThrow(/G004A_ACTIVE_SAME_TENANT_ATTRIBUTION_REQUIRED/);
        await expect(client.unsafe("UPDATE public.ai_lead_verifications SET lead_id='lead-a' WHERE id='verification-b'")).rejects.toThrow(/G004A_SCOPE_IMMUTABLE/);

        await client.unsafe(`INSERT INTO public.lead_ai_artifacts(id,lead_id,artifact_type,status,input_hash,prompt_version,requested_by_user_id) VALUES ('artifact-b','lead-b','business_detail','queued','equivalent-input','v1','${ownerB}')`);
        await client.unsafe(`INSERT INTO public.ai_feedback_events(id,lead_id,verification_id,artifact_id,actor_user_id,feedback_kind,verdict) VALUES ('feedback-b','lead-b','verification-b','artifact-b','${ownerB}','verification','correct')`);
        await expect(client.unsafe("UPDATE public.ai_feedback_events SET verification_id=NULL WHERE id='feedback-b'")).rejects.toThrow(/G004A_FEEDBACK_SCOPE_IMMUTABLE/);
        await expect(client.unsafe("UPDATE public.ai_feedback_events SET artifact_id='artifact-a' WHERE id='feedback-b'")).rejects.toThrow(/G004A_FEEDBACK_SCOPE_IMMUTABLE/);
        await expect(client.unsafe(`INSERT INTO public.ai_feedback_events(id,lead_id,verification_id,feedback_kind,verdict) VALUES ('feedback-cross','lead-b','verification-a','verification','correct')`)).rejects.toThrow(/G004A_FEEDBACK_REFERENCE_SCOPE_INVALID/);

        await expect(client.unsafe("INSERT INTO public.ai_usage_events(id,model) VALUES ('new-unlinked','m')")).rejects.toThrow(/G004A_USAGE_RUNTIME_CORRELATION_REQUIRED/);
        await client.unsafe("INSERT INTO public.ai_usage_events(id,lead_id,model) VALUES ('usage-lead-b','lead-b','m')");
        await client.unsafe("INSERT INTO public.ai_usage_events(id,verification_id,model) VALUES ('usage-verification-b','verification-b','m')");
        await client.unsafe(`
          INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-b-combined','${tenantB}','place-b-combined','Combined Reference');
          INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation,requested_by_user_id)
            VALUES ('verification-b-combined','lead-b-combined','m','queued','review','${ownerB}');
          INSERT INTO public.ai_usage_events(id,lead_id,verification_id,model,actor_user_id,input_tokens,output_tokens,total_tokens,metadata)
            VALUES ('usage-b-combined','lead-b-combined','verification-b-combined','m','${ownerB}',11,7,18,'{"sentinel":"preserve"}'::jsonb);
        `);
        await expect(client.unsafe("INSERT INTO public.ai_usage_events(id,lead_id,verification_id,model) VALUES ('usage-cross','lead-a','verification-b','m')")).rejects.toThrow(/G004A_USAGE_REFERENCE_SCOPE_INVALID/);
        await expect(client.unsafe("UPDATE public.ai_usage_events SET lead_id='lead-a' WHERE id='usage-lead-b'")).rejects.toThrow(/G004A_USAGE_SCOPE_IMMUTABLE/);
        await expect(client.unsafe("UPDATE public.ai_usage_events SET lead_id=NULL WHERE id='usage-lead-b'")).rejects.toThrow(/G004A_USAGE_SCOPE_IMMUTABLE/);
        await expect(client.unsafe("UPDATE public.ai_usage_events SET verification_id=NULL WHERE id='usage-verification-b'")).rejects.toThrow(/G004A_USAGE_SCOPE_IMMUTABLE/);
        await expect(client.unsafe("UPDATE public.ai_usage_events SET lead_id=NULL,verification_id=NULL WHERE id='usage-b-combined'")).rejects.toThrow(/G004A_USAGE_SCOPE_IMMUTABLE/);
        expect((await client.unsafe("SELECT tenant_id FROM public.ai_usage_events WHERE id IN ('usage-lead-b','usage-verification-b') ORDER BY id")).map((row) => row.tenant_id)).toEqual([tenantB, tenantB]);

        // PG16 column-list SET NULL preserves required tenant_id.
        const [combinedBefore] = await client.unsafe<Record<string, unknown>[]>("SELECT * FROM public.ai_usage_events WHERE id='usage-b-combined'");
        await client.unsafe("DELETE FROM public.leads WHERE id='lead-b-combined'");
        const [combinedAfter] = await client.unsafe<Record<string, unknown>[]>("SELECT * FROM public.ai_usage_events WHERE id='usage-b-combined'");
        expect(combinedAfter).toEqual({ ...combinedBefore, lead_id: null, verification_id: null });
        await client.unsafe("DELETE FROM public.ai_lead_verifications WHERE id='verification-b'");
        expect((await client.unsafe("SELECT tenant_id,verification_id FROM public.ai_feedback_events WHERE id='feedback-b'"))[0]).toEqual({ tenant_id: tenantB, verification_id: null });
        expect((await client.unsafe("SELECT tenant_id,verification_id FROM public.ai_usage_events WHERE id='usage-verification-b'"))[0]).toEqual({ tenant_id: tenantB, verification_id: null });
        await client.unsafe("DELETE FROM public.lead_ai_artifacts WHERE id='artifact-b'");
        expect((await client.unsafe("SELECT tenant_id,artifact_id FROM public.ai_feedback_events WHERE id='feedback-b'"))[0]).toEqual({ tenant_id: tenantB, artifact_id: null });
        await client.unsafe("DELETE FROM public.leads WHERE id='lead-b'");
        expect((await client.unsafe("SELECT tenant_id,lead_id FROM public.ai_usage_events WHERE id='usage-lead-b'"))[0]).toEqual({ tenant_id: tenantB, lead_id: null });

        // The transitive delete is independent of FK creation order, and an
        // unrelated nested trigger cannot use trigger depth to spoof RI work.
        await resetTo(client);
        await addTenantB(client);
        await client.unsafe(`
          ALTER TABLE public.ai_usage_events DROP CONSTRAINT ai_usage_events_tenant_lead_fkey;
          ALTER TABLE public.ai_usage_events DROP CONSTRAINT ai_usage_events_tenant_verification_fkey;
          ALTER TABLE public.ai_lead_verifications DROP CONSTRAINT ai_lead_verifications_tenant_lead_fkey;
          ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_lead_fkey
            FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (lead_id);
          ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_verification_fkey
            FOREIGN KEY(tenant_id,verification_id) REFERENCES public.ai_lead_verifications(tenant_id,id) ON UPDATE RESTRICT ON DELETE SET NULL (verification_id);
          ALTER TABLE public.ai_lead_verifications ADD CONSTRAINT ai_lead_verifications_tenant_lead_fkey
            FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON UPDATE RESTRICT ON DELETE CASCADE;
          INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-b-reversed','${tenantB}','place-b-reversed','Reversed Constraints');
          INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation)
            VALUES ('verification-b-reversed','lead-b-reversed','m','queued','review');
          INSERT INTO public.ai_usage_events(id,lead_id,verification_id,model,metadata)
            VALUES ('usage-b-reversed','lead-b-reversed','verification-b-reversed','m','{"sentinel":"reverse"}'::jsonb);
          CREATE SCHEMA g004a_shadow;
          CREATE FUNCTION g004a_shadow.nested_usage_null_spoof() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            UPDATE public.ai_usage_events SET lead_id=NULL,metadata='{"spoof":true}'::jsonb WHERE lead_id=OLD.id;
            RETURN OLD;
          END $$;
          CREATE TRIGGER trg_nested_usage_null_spoof BEFORE DELETE ON public.leads
            FOR EACH ROW EXECUTE FUNCTION g004a_shadow.nested_usage_null_spoof();
        `);
        await expect(client.unsafe("DELETE FROM public.leads WHERE id='lead-b-reversed'")).rejects.toThrow(/G004AR1_USAGE_RI_NULL_SHAPE_INVALID/);
        await client.unsafe(`CREATE OR REPLACE FUNCTION g004a_shadow.nested_usage_null_spoof() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            UPDATE public.ai_usage_events SET lead_id=NULL WHERE lead_id=OLD.id;
            RETURN OLD;
          END $$`);
        await expect(client.unsafe("DELETE FROM public.leads WHERE id='lead-b-reversed'")).rejects.toThrow(/G004AR1_USAGE_RI_NULL_PARENT_PRESENT/);
        await client.unsafe(`
          DROP TRIGGER trg_nested_usage_null_spoof ON public.leads;
          DROP FUNCTION g004a_shadow.nested_usage_null_spoof();
          DELETE FROM public.leads WHERE id='lead-b-reversed';
        `);
        expect((await client.unsafe("SELECT tenant_id,lead_id,verification_id,metadata FROM public.ai_usage_events WHERE id='usage-b-reversed'"))[0]).toEqual({
          tenant_id: tenantB,
          lead_id: null,
          verification_id: null,
          metadata: { sentinel: "reverse" },
        });

        // Existing both-linked rows are revalidated under the migration locks;
        // a constraint-bypassed historical mismatch cannot be grandfathered.
        await resetTo(client);
        await addTenantB(client);
        await client.unsafe(`
          INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-b-other','${tenantB}','place-b-other','Other Lead');
          INSERT INTO public.ai_lead_verifications(id,lead_id,model,status,recommendation)
            VALUES ('verification-b-one','lead-b','m','queued','review'),('verification-b-other','lead-b-other','m','queued','review');
          INSERT INTO public.ai_usage_events(id,lead_id,verification_id,model)
            VALUES ('usage-b-historical-mismatch','lead-b','verification-b-one','m');
          ALTER TABLE public.ai_usage_events DISABLE TRIGGER ALL;
          UPDATE public.ai_usage_events SET verification_id='verification-b-other' WHERE id='usage-b-historical-mismatch';
          ALTER TABLE public.ai_usage_events ENABLE TRIGGER ALL;
        `);
        await expectG004AR1RejectedWithoutResidue(client, /G004AR1_EXISTING_USAGE_REFERENCE_SCOPE_INVALID/);

        // Definition-aware spoof matrix rolls back without repairing anything.
        for (const spoof of ["function_body", "function_acl", "overload", "trigger", "index", "constraint", "nullable_tenant", "column_acl"] as const) {
          await resetTo(client);
          if (spoof === "function_body") await client.unsafe("CREATE OR REPLACE FUNCTION public.novatrade_ai_scope_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RETURN NEW; END $$");
          if (spoof === "function_acl") await client.unsafe("GRANT EXECUTE ON FUNCTION public.novatrade_ai_scope_guard() TO g004a_inherited; GRANT g004a_inherited TO authenticated");
          if (spoof === "overload") await client.unsafe("CREATE FUNCTION public.novatrade_ai_scope_guard(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT $1'");
          if (spoof === "trigger") await client.unsafe("DROP TRIGGER trg_novatrade_ai_usage_events_scope ON public.ai_usage_events; CREATE TRIGGER trg_novatrade_ai_usage_events_scope AFTER INSERT ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()");
          if (spoof === "index") await client.unsafe("DROP INDEX public.idx_ai_usage_tenant_created; CREATE INDEX idx_ai_usage_tenant_created ON public.ai_usage_events(created_at,tenant_id)");
          if (spoof === "constraint") await client.unsafe("ALTER TABLE public.ai_feedback_events DROP CONSTRAINT ai_feedback_events_tenant_artifact_fkey; ALTER TABLE public.ai_feedback_events ADD CONSTRAINT ai_feedback_events_tenant_artifact_fkey FOREIGN KEY(tenant_id,artifact_id) REFERENCES public.lead_ai_artifacts(tenant_id,id) ON DELETE SET NULL (artifact_id) NOT VALID");
          if (spoof === "nullable_tenant") await client.unsafe("ALTER TABLE public.ai_usage_events ALTER COLUMN tenant_id DROP NOT NULL");
          if (spoof === "column_acl") await client.unsafe("GRANT SELECT(id) ON public.ai_usage_events TO authenticated");
          await expectMigrationRejectedWithoutResidue(client, /G004A_PARTIAL_OR_SPOOFED_CATALOG/);
        }

        // R1 rejects partial, spoofed, and drifted baseline/final states before
        // DDL, leaving each hostile catalog byte-for-byte unchanged.
        for (const spoof of ["partial_function", "partial_trigger", "function_body", "function_acl", "function_config", "function_comment", "function_owner", "overload", "trigger", "extra_trigger", "extra_binding", "v2_body", "constraint"] as const) {
          await resetTo(client, spoof.startsWith("partial_") ? G004AR1 : undefined);
          if (spoof === "partial_function") await client.unsafe("CREATE FUNCTION public.novatrade_ai_usage_ri_null_normalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
          if (spoof === "partial_trigger") await client.unsafe("CREATE TRIGGER trg_novatrade_ai_usage_events_a_ri_null_normalize BEFORE UPDATE ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()");
          if (spoof === "function_body") await client.unsafe("CREATE OR REPLACE FUNCTION public.novatrade_ai_usage_ri_null_normalize() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RETURN NEW; END $$");
          if (spoof === "function_acl") await client.unsafe("GRANT EXECUTE ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() TO g004a_inherited; GRANT g004a_inherited TO authenticated");
          if (spoof === "function_config") await client.unsafe("ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() SET search_path=public");
          if (spoof === "function_comment") await client.unsafe("COMMENT ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() IS 'spoofed'");
          if (spoof === "function_owner") await client.unsafe("ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() OWNER TO g004a_inherited");
          if (spoof === "overload") await client.unsafe("CREATE FUNCTION public.novatrade_ai_usage_ri_null_normalize(integer) RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT $1'");
          if (spoof === "trigger") await client.unsafe("DROP TRIGGER trg_novatrade_ai_usage_events_a_ri_null_normalize ON public.ai_usage_events; CREATE TRIGGER trg_novatrade_ai_usage_events_a_ri_null_normalize AFTER UPDATE ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_usage_ri_null_normalize()");
          if (spoof === "extra_trigger") await client.unsafe("CREATE TRIGGER trg_novatrade_ai_usage_events_interposed BEFORE UPDATE ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_scope_guard()");
          if (spoof === "extra_binding") await client.unsafe("CREATE TRIGGER trg_novatrade_ai_usage_helper_extra BEFORE UPDATE ON public.ai_feedback_events FOR EACH ROW EXECUTE FUNCTION public.novatrade_ai_usage_ri_null_normalize()");
          if (spoof === "v2_body") await client.unsafe("CREATE OR REPLACE FUNCTION public.novatrade_ai_scope_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RETURN NEW; END $$");
          if (spoof === "constraint") await client.unsafe("ALTER TABLE public.ai_usage_events DROP CONSTRAINT ai_usage_events_tenant_lead_fkey; ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_tenant_lead_fkey FOREIGN KEY(tenant_id,lead_id) REFERENCES public.leads(tenant_id,id) ON DELETE SET NULL (lead_id) NOT VALID");
          await expectG004AR1RejectedWithoutResidue(client, spoof === "v2_body" || spoof === "constraint" || spoof === "extra_trigger" ? /G004AR1_G004A_V2_FOUNDATION_DRIFT/ : /G004AR1_NORMALIZER_CATALOG_DRIFT/);
        }

        // A failure after helper/trigger creation rolls the whole installation
        // back to the exact accepted pre-R1 state.
        await resetTo(client, G004AR1);
        const rollbackBefore = await catalogSnapshot(client);
        await expect(client.unsafe(g004ar1Sql.replace(
          "-- G004AR1_INSTALL_COMPLETE",
          "-- G004AR1_INSTALL_COMPLETE\nSELECT 1/0;",
        ))).rejects.toThrow(/division by zero/);
        await client.unsafe("ROLLBACK");
        expect(await catalogSnapshot(client)).toEqual(rollbackBefore);

        // Pre-install column ACLs are not silently cleared during activation.
        await prepareUpgrade(client);
        await client.unsafe("GRANT SELECT(id) ON public.ai_usage_events TO authenticated");
        await expectMigrationRejectedWithoutResidue(client, /G004A_BASE_RLS_OR_ACL_INVALID/);

        // Receipt rejection matrix, each from the same real pre-G-004A upgrade.
        for (const mutation of ["missing", "count", "checksum", "status", "algorithm", "tenant", "workspace", "duplicate", "partial"] as const) {
          await prepareUpgrade(client);
          await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk");
          if (mutation === "missing") await client.unsafe("DELETE FROM public.compatibility_backfill_receipts");
          if (mutation === "count") await client.unsafe("UPDATE public.compatibility_backfill_receipts SET table_counts=jsonb_set(table_counts,'{ai_usage_events}','99'::jsonb)");
          if (mutation === "checksum") await client.unsafe("UPDATE public.compatibility_backfill_receipts SET after_content_checksums=jsonb_set(after_content_checksums,'{ai_feedback_events}',to_jsonb(repeat('0',64)))");
          if (mutation === "status") await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_status_check; UPDATE public.compatibility_backfill_receipts SET status='failed'");
          if (mutation === "algorithm") await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_engine_algorithm_pair_chk; UPDATE public.compatibility_backfill_receipts SET checksum_algorithm='tampered'");
          if (mutation === "tenant") { await addTenantB(client); await client.unsafe(`ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_policy_fkey; UPDATE public.compatibility_backfill_receipts SET tenant_id='${tenantB}',workspace_id='${workspaceB}'`); }
          if (mutation === "workspace") { await client.unsafe(`INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceAAlt}','${tenantA}','workspace-a-alt','Workspace A Alt','active'); UPDATE public.compatibility_backfill_receipts SET workspace_id='${workspaceAAlt}'`); }
          if (mutation === "partial") await client.unsafe("UPDATE public.compatibility_backfill_receipts SET table_counts=table_counts-'ai_usage_events'");
          if (mutation === "duplicate") await client.unsafe(`ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_key_unique; INSERT INTO public.compatibility_backfill_receipts(id,idempotency_key,schema_version,source_engine,checksum_algorithm,manifest_hash,source_snapshot_fingerprint,tenant_id,workspace_id,owner_auth_identity_id,policy_id,policy_version,policy_hash,user_count,table_counts,before_content_checksums,after_content_checksums,relationship_orphan_count,status,completed_at,receipt) SELECT pg_catalog.gen_random_uuid(),idempotency_key||'-duplicate',schema_version,source_engine,checksum_algorithm,manifest_hash,source_snapshot_fingerprint,tenant_id,workspace_id,owner_auth_identity_id,policy_id,policy_version,policy_hash,user_count,table_counts,before_content_checksums,after_content_checksums,relationship_orphan_count,status,completed_at,receipt FROM public.compatibility_backfill_receipts LIMIT 1`);
          await expectMigrationRejectedWithoutResidue(client, mutation === "duplicate" ? /G004A_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED/ : /G004A_(MATCHING_T028_RECEIPT_REQUIRED|T028_RECEIPT_SCOPE_DRIFT)/);
        }

        // Existing orphan/scope/attribution matrix is evaluated after receipt
        // checksums are deliberately rebound to each malformed fixture.
        for (const mutation of ["missing_lead", "feedback_verification", "feedback_artifact", "usage_pair", "missing_verification", "actor", "workspace"] as const) {
          await prepareUpgrade(client);
          await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk");
          if (mutation === "missing_lead") await client.unsafe("ALTER TABLE public.ai_lead_verifications DISABLE TRIGGER ALL; UPDATE public.ai_lead_verifications SET lead_id='missing-lead'; ALTER TABLE public.ai_lead_verifications ENABLE TRIGGER ALL");
          if (mutation === "feedback_verification") await client.unsafe("UPDATE public.ai_lead_verifications SET lead_id='lead-a2' WHERE id='verification-a'");
          if (mutation === "feedback_artifact") await client.unsafe("UPDATE public.lead_ai_artifacts SET lead_id='lead-a2' WHERE id='artifact-a'");
          if (mutation === "usage_pair") await client.unsafe("UPDATE public.ai_usage_events SET lead_id='lead-a2' WHERE id='usage-linked-a'");
          if (mutation === "missing_verification") await client.unsafe("ALTER TABLE public.ai_usage_events DISABLE TRIGGER ALL; UPDATE public.ai_usage_events SET verification_id='missing-verification' WHERE id='usage-linked-a'; ALTER TABLE public.ai_usage_events ENABLE TRIGGER ALL");
          if (mutation === "actor") { await addTenantB(client); await client.unsafe(`UPDATE public.ai_lead_verifications SET requested_by_user_id='${ownerB}'`); }
          if (mutation === "workspace") { await client.unsafe(`INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceAAlt}','${tenantA}','workspace-a-alt','Workspace A Alt','active'); UPDATE public.ai_feedback_events SET workspace_id='${workspaceAAlt}'`); }
          await alignReceiptAiChecksums(client);
          await expectMigrationRejectedWithoutResidue(client, mutation === "actor" ? /G004A_EXISTING_ATTRIBUTION_SCOPE_INVALID/ : mutation === "workspace" ? /G004A_T028_RECEIPT_SCOPE_DRIFT/ : /G004A_EXISTING_REFERENCE_SCOPE_INVALID/);
        }

        // Two-client writer serialization covers every locked mutable input.
        await resetTo(client);
        const migrationClient = postgres(url, { max: 1, onnotice: () => undefined });
        const writerClient = postgres(url, { max: 1, onnotice: () => undefined });
        let replay: Promise<unknown> | undefined;
        try {
          const [{ pid }] = await migrationClient.unsafe<Array<{ pid: number }>>("SELECT pg_catalog.pg_backend_pid() pid");
          replay = Promise.resolve(migrationClient.unsafe(migrationSql.replace("-- G004A_WRITER_LOCKS_ACQUIRED", "-- G004A_WRITER_LOCKS_ACQUIRED\nSELECT pg_catalog.pg_sleep(2);")));
          let lockCount = 0;
          for (let attempt = 0; attempt < 80 && lockCount !== 8; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            lockCount = Number((await client.unsafe(`SELECT count(*)::integer count FROM pg_catalog.pg_locks WHERE pid=${pid} AND granted AND mode='ShareRowExclusiveLock' AND relation IN ('public.compatibility_backfill_receipts'::regclass,'public.workspaces'::regclass,'public.tenant_memberships'::regclass,'public.leads'::regclass,'public.ai_lead_verifications'::regclass,'public.lead_ai_artifacts'::regclass,'public.ai_feedback_events'::regclass,'public.ai_usage_events'::regclass)`))[0].count);
          }
          expect(lockCount).toBe(8);
          await writerClient.unsafe("SET lock_timeout='250ms'");
          await expect(writerClient.unsafe("INSERT INTO public.ai_usage_events(id,model) VALUES ('racing','m')")).rejects.toThrow(/lock timeout/);
          await replay;
        } finally {
          await replay?.catch(() => undefined);
          await migrationClient.end({ timeout: 5 });
          await writerClient.end({ timeout: 5 });
        }

        // R1 serializes both table writers and pg_proc function definition,
        // owner/config, and ACL mutations for its complete classification span.
        await resetTo(client);
        const r1MigrationClient = postgres(url, { max: 1, onnotice: () => undefined });
        const r1WriterClient = postgres(url, { max: 1, onnotice: () => undefined });
        let r1Replay: Promise<unknown> | undefined;
        try {
          const [{ pid }] = await r1MigrationClient.unsafe<Array<{ pid: number }>>("SELECT pg_catalog.pg_backend_pid() pid");
          r1Replay = Promise.resolve(r1MigrationClient.unsafe(g004ar1Sql.replace(
            "-- G004AR1_OBJECT_LOCKS_ACQUIRED",
            "-- G004AR1_OBJECT_LOCKS_ACQUIRED\nSELECT pg_catalog.pg_sleep(6);",
          )));
          let lockCount = 0;
          for (let attempt = 0; attempt < 80 && lockCount !== 10; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            lockCount = Number((await client.unsafe(`SELECT count(*)::integer count FROM pg_catalog.pg_locks
              WHERE pid=${pid} AND granted AND mode='ShareRowExclusiveLock'
                AND relation IN ('pg_catalog.pg_proc'::regclass,'pg_catalog.pg_class'::regclass,'pg_catalog.pg_attribute'::regclass,
                  'public.workspaces'::regclass,'public.tenant_memberships'::regclass,
                  'public.leads'::regclass,'public.ai_lead_verifications'::regclass,'public.lead_ai_artifacts'::regclass,
                  'public.ai_feedback_events'::regclass,'public.ai_usage_events'::regclass)`))[0].count);
          }
          expect(lockCount).toBe(10);
          await r1WriterClient.unsafe("SET lock_timeout='250ms'");
          await expect(r1WriterClient.unsafe("UPDATE public.ai_usage_events SET metadata=metadata WHERE false")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("CREATE OR REPLACE FUNCTION public.novatrade_ai_usage_ri_null_normalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("COMMENT ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() IS 'racing'")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("GRANT EXECUTE ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() TO authenticated")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("REVOKE EXECUTE ON FUNCTION public.novatrade_ai_usage_ri_null_normalize() FROM postgres")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() SET search_path=public")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("ALTER FUNCTION public.novatrade_ai_usage_ri_null_normalize() OWNER TO postgres")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("DROP FUNCTION public.novatrade_ai_usage_ri_null_normalize() CASCADE")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("GRANT SELECT ON public.ai_usage_events TO authenticated")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("REVOKE SELECT ON public.ai_usage_events FROM postgres")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("GRANT SELECT(id) ON public.ai_usage_events TO authenticated")).rejects.toThrow(/lock timeout/);
          await expect(r1WriterClient.unsafe("REVOKE SELECT(id) ON public.ai_usage_events FROM postgres")).rejects.toThrow(/lock timeout/);
          await r1Replay;
        } finally {
          await r1Replay?.catch(() => undefined);
          await r1MigrationClient.end({ timeout: 5 });
          await r1WriterClient.end({ timeout: 5 });
        }
      } finally {
        await client?.end({ timeout: 5 }).catch(() => undefined);
        docker(["stop", container], true);
        expect(docker(["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], true)).toBe("");
      }
    },
    240000,
  );
});
