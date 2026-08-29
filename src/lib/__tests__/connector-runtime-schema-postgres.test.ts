import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F09_CONNECTOR_RUNTIME_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829220000_add_connector_runtime_foundation.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f09_connector_runtime_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-000000000091";
const TENANT_B = "00000000-0000-4000-8000-000000000092";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000091";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000092";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const TABLES = [
  "connector_versions", "connector_accounts", "source_policy_versions", "source_runs",
  "source_run_units", "source_run_lease_history", "source_observations",
  "source_usage_reservations", "source_usage_settlements",
] as const;
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

let container = "";
let admin: Sql | undefined;
let runtime: Sql | undefined;

function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function waitForPostgres(name: string): void {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
      "-d", DATABASE, "-Atc", "SELECT 1"], true) === "1") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`PostgreSQL did not become ready: ${docker(["logs", name], true)}`);
}

async function replayAllMigrations(sql: Sql): Promise<void> {
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  await sql.unsafe("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)");
  await sql.unsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`);
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS public.worker_runs (
    id text PRIMARY KEY, worker_name text NOT NULL, status text NOT NULL DEFAULT 'running',
    trigger_source text NOT NULL DEFAULT 'unknown', http_status integer,
    result_json jsonb NOT NULL DEFAULT '{}'::jsonb, error text,
    started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  const migrations = readdirSync(resolve("supabase/migrations"))
    .filter((file) => file.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of migrations) {
    if (SKIPPED.has(file)) continue;
    await sql.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") {
      await sql.unsafe(`ALTER TABLE public.settings
        ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1`);
      await sql.unsafe(`ALTER TABLE public.leads
        ADD COLUMN IF NOT EXISTS ai_website_feedback_status text,
        ADD COLUMN IF NOT EXISTS ai_corrected_website_url text,
        ADD COLUMN IF NOT EXISTS ai_false_positive_reason text,
        ADD COLUMN IF NOT EXISTS ai_reviewer_notes text,
        ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz`);
    }
  }
  expect({ discovered: migrations.length, applied, skipped: SKIPPED.size })
    .toEqual({ discovered: 59, applied: 57, skipped: 2 });
}

async function seedFoundation(sql: Sql): Promise<void> {
  await sql.unsafe(`
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${TENANT_A}','f09-a','F09 Tenant A','active'),
      ('${TENANT_B}','f09-b','F09 Tenant B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${WORKSPACE_A}','${TENANT_A}','f09-workspace-a','F09 Workspace A','active'),
      ('${WORKSPACE_B}','${TENANT_B}','f09-workspace-b','F09 Workspace B','active');
    INSERT INTO public.connector_versions
      (source_card_id,version,execution_mode,transport,operations,output_fields,adapter_sha256)
    VALUES ('google_places_legacy',1,'fixture','none','["search_text","place_details"]',
      '["place_id","business_name"]','${HASH_A}');
    INSERT INTO public.connector_accounts
      (id,tenant_id,workspace_id,source_card_id,connector_version,account_key,status)
    VALUES
      ('account-a','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'fixture-a','fixture_only'),
      ('account-b','${TENANT_B}','${WORKSPACE_B}','google_places_legacy',1,'fixture-b','fixture_only');
    INSERT INTO public.source_policy_versions
      (id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,
       policy_key,version,state,execution_mode,terms_state,allowed_operations,allowed_fields,
       hard_cap_units,policy_sha256)
    VALUES
      ('policy-a','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'account-a',
       'fixture-policy',1,'active','fixture','approved','["search_text"]','["place_id","business_name"]',4,'${HASH_B}'),
      ('policy-b','${TENANT_B}','${WORKSPACE_B}','google_places_legacy',1,'account-b',
       'fixture-policy',1,'active','fixture','approved','["search_text"]','["place_id","business_name"]',4,'${HASH_B}');
  `);
}

function queuedRun(id: string, tenant: string, workspace: string, account: string, policy: string, key: string): string {
  return `INSERT INTO public.source_runs(
    id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,
    source_policy_id,idempotency_key,input_hash,operation,hard_cap_units,max_attempts,created_at,updated_at
  ) VALUES ('${id}','${tenant}','${workspace}','google_places_legacy',1,'${account}',
    '${policy}','${key}','${HASH_A}','search_text',4,3,'2026-08-29T12:00:00Z','2026-08-29T12:00:00Z')`;
}

function queuedUnit(id: string, run: string, sequence: number, predecessor: string | null, cursor: string | null, units: number): string {
  return `INSERT INTO public.source_run_units(
    id,tenant_id,workspace_id,run_id,predecessor_unit_id,sequence,checkpoint_key,input_hash,
    cursor,max_attempts,reserved_units,created_at,updated_at
  ) VALUES ('${id}','${TENANT_A}','${WORKSPACE_A}','${run}',${predecessor ? `'${predecessor}'` : "NULL"},
    ${sequence},'${run}:${id}','${HASH_A}',${cursor ? `'${cursor}'` : "NULL"},3,${units},
    '2026-08-29T12:00:00Z','2026-08-29T12:00:00Z')`;
}

describe.skipIf(!RUN)("F-09 durable connector-runtime PostgreSQL foundation", () => {
  beforeAll(async () => {
    container = `novatrade-f09-${randomUUID()}`;
    docker(["run","--detach","--rm","--name",container,"--publish","127.0.0.1::5432",
      "--env","POSTGRES_PASSWORD=postgres","--env",`POSTGRES_DB=${DATABASE}`,POSTGRES_16]);
    waitForPostgres(container);
    const port = docker(["port",container,"5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl,{max:1,prepare:false,ssl:false,onnotice:()=>undefined});
    const [{version}] = await admin.unsafe<Array<{version:string}>>("SELECT current_setting('server_version_num') version");
    expect(version.startsWith("16")).toBe(true);
    await replayAllMigrations(admin);
    await admin.unsafe(readFileSync(MIGRATION_PATH,"utf8"));
    await seedFoundation(admin);
    const runtimeRole = `f09_runtime_${randomUUID().replaceAll("-","")}`;
    await admin.unsafe(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'f09-runtime' NOSUPERUSER NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ${TABLES.map((table)=>`public.${table}`).join(",")} TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT USAGE ON SEQUENCE public.source_run_lease_history_id_seq TO "${runtimeRole}"`);
    runtime = postgres(`postgres://${runtimeRole}:f09-runtime@127.0.0.1:${port}/${DATABASE}`,
      {max:1,prepare:false,ssl:false,onnotice:()=>undefined});
  },120_000);

  afterAll(async()=>{
    await runtime?.end({timeout:1});
    await admin?.end({timeout:1});
    if(container) docker(["rm","--force",container],true);
  });

  it("replays with data and leaves the exact catalog denied to a restricted runtime",async()=>{
    if(!admin||!runtime) throw new Error("test database unavailable");
    const before = await admin.unsafe("SELECT id,status FROM public.connector_accounts ORDER BY id");
    await admin.unsafe(readFileSync(MIGRATION_PATH,"utf8"));
    expect(await admin.unsafe("SELECT id,status FROM public.connector_accounts ORDER BY id")).toEqual(before);
    const catalog = await admin.unsafe<Array<Record<string,unknown>>>(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
        (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
        pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
        pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname`,[TABLES]);
    expect(catalog).toHaveLength(9);
    for(const row of catalog) expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,policy_count:0,anon_select:false,authenticated_select:false});
    expect(await runtime.unsafe("SELECT id FROM public.source_runs")).toEqual([]);
    await expect(runtime.unsafe(`INSERT INTO public.connector_versions
      (source_card_id,version,execution_mode,transport,operations,output_fields,adapter_sha256)
      VALUES ('runtime-denied',1,'fixture','none','[]','[]','${HASH_A}')`))
      .rejects.toMatchObject({code:"42501"});
    const sensitive = await admin.unsafe<Array<{column_name:string}>>(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='connector_accounts' AND column_name~'(secret|password|access_token|api_key)'`);
    expect(sensitive).toEqual([]);
  });

  it("enforces exact account/policy/run scope and scoped idempotency",async()=>{
    if(!admin) throw new Error("test database unavailable");
    await admin.unsafe(queuedRun("run-a",TENANT_A,WORKSPACE_A,"account-a","policy-a","run-key"));
    await expect(admin.unsafe(queuedRun("run-duplicate",TENANT_A,WORKSPACE_A,"account-a","policy-a","run-key")))
      .rejects.toMatchObject({code:"23505"});
    await admin.unsafe(queuedRun("run-b",TENANT_B,WORKSPACE_B,"account-b","policy-b","run-key"));
    await expect(admin.unsafe(queuedRun("run-cross",TENANT_A,WORKSPACE_A,"account-b","policy-b","cross")))
      .rejects.toMatchObject({code:"23514"});
    await expect(admin.unsafe(`INSERT INTO public.source_policy_versions(
      id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,policy_key,
      version,state,execution_mode,terms_state,allowed_operations,allowed_fields,hard_cap_units,policy_sha256)
      VALUES ('policy-cross','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'account-b','cross',1,
      'active','fixture','approved','[]','[]',1,'${HASH_B}')`)).rejects.toMatchObject({code:"23514"});
    await expect(admin.unsafe("UPDATE public.source_runs SET input_hash=$1,updated_at='2026-08-29T12:00:01Z' WHERE id='run-a'",[HASH_C]))
      .rejects.toMatchObject({code:"P0001"});
    await expect(admin.unsafe("UPDATE public.connector_versions SET adapter_sha256=$1",[HASH_C]))
      .rejects.toMatchObject({code:"P0001"});
  });

  it("persists ordered resumable units and fences stale lease completion",async()=>{
    if(!admin) throw new Error("test database unavailable");
    await admin.unsafe(queuedUnit("unit-1","run-a",1,null,null,3));
    await admin.unsafe(`UPDATE public.source_runs SET status='running',started_at='2026-08-29T12:01:00Z',updated_at='2026-08-29T12:01:00Z' WHERE id='run-a'`);
    await admin.unsafe(`UPDATE public.source_run_units SET status='running',attempt_count=1,lease_generation=1,
      lease_token_hash='${HASH_A}',lease_worker_hash='${HASH_B}',lease_acquired_at='2026-08-29T12:01:00Z',
      lease_heartbeat_at='2026-08-29T12:01:00Z',lease_expires_at='2026-08-29T12:02:00Z',
      started_at='2026-08-29T12:01:00Z',updated_at='2026-08-29T12:01:00Z' WHERE id='unit-1'`);
    await admin.unsafe(`UPDATE public.source_run_units SET status='retry_wait',lease_token_hash=NULL,
      lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      retry_reason='timeout',next_attempt_at='2026-08-29T12:03:00Z',error_code='D015_RETRYABLE',
      updated_at='2026-08-29T12:01:30Z' WHERE id='unit-1'`);
    await admin.unsafe(`UPDATE public.source_run_units SET status='running',attempt_count=2,lease_generation=2,
      lease_token_hash='${HASH_C}',lease_worker_hash='${HASH_A}',lease_acquired_at='2026-08-29T12:03:00Z',
      lease_heartbeat_at='2026-08-29T12:03:00Z',lease_expires_at='2026-08-29T12:04:00Z',
      retry_reason=NULL,next_attempt_at=NULL,error_code=NULL,updated_at='2026-08-29T12:03:00Z' WHERE id='unit-1'`);
    const stale = await admin.unsafe(`UPDATE public.source_run_units SET status='page_complete',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      actual_units=1,next_cursor='page-2',ended_at='2026-08-29T12:03:10Z',updated_at='2026-08-29T12:03:10Z'
      WHERE id='unit-1' AND lease_generation=1 AND lease_token_hash='${HASH_A}' RETURNING id`);
    expect(stale).toEqual([]);
    expect(await admin.unsafe(`UPDATE public.source_run_units SET status='page_complete',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      actual_units=1,next_cursor='page-2',ended_at='2026-08-29T12:03:10Z',updated_at='2026-08-29T12:03:10Z'
      WHERE id='unit-1' AND lease_generation=2 AND lease_token_hash='${HASH_C}' RETURNING id`)).toEqual([{id:"unit-1"}]);
    expect(await admin.unsafe("SELECT lease_generation,release_reason FROM public.source_run_lease_history WHERE unit_id='unit-1' ORDER BY lease_generation"))
      .toEqual([{lease_generation:1,release_reason:"retry_wait"},{lease_generation:2,release_reason:"page_complete"}]);
    await admin.unsafe(queuedUnit("unit-2","run-a",2,"unit-1","page-2",3));
    await expect(admin.unsafe(queuedUnit("unit-bad-cursor","run-a",3,"unit-2","wrong",1)))
      .rejects.toMatchObject({code:"23514"});
    await expect(admin.unsafe("UPDATE public.source_run_units SET status='queued',updated_at='2026-08-29T12:05:00Z' WHERE id='unit-1'"))
      .rejects.toMatchObject({code:"P0001"});
  });

  it("binds immutable observations and settles budget before the next reservation",async()=>{
    if(!admin) throw new Error("test database unavailable");
    await admin.unsafe(`INSERT INTO public.source_usage_reservations(
      id,tenant_id,workspace_id,run_id,unit_id,idempotency_key,input_hash,reserved_units,created_at)
      VALUES ('reservation-1','${TENANT_A}','${WORKSPACE_A}','run-a','unit-1','run-a:unit-1','${HASH_A}',3,'2026-08-29T12:01:00Z')`);
    await expect(admin.unsafe(`INSERT INTO public.source_usage_settlements(
      id,tenant_id,workspace_id,run_id,unit_id,reservation_id,status,actual_units,settled_at)
      VALUES ('settlement-over','${TENANT_A}','${WORKSPACE_A}','run-a','unit-1','reservation-1','settled',4,'2026-08-29T12:03:11Z')`))
      .rejects.toMatchObject({code:"23514"});
    await admin.unsafe(`INSERT INTO public.source_usage_settlements(
      id,tenant_id,workspace_id,run_id,unit_id,reservation_id,status,actual_units,settled_at)
      VALUES ('settlement-1','${TENANT_A}','${WORKSPACE_A}','run-a','unit-1','reservation-1','settled',1,'2026-08-29T12:03:11Z')`);
    await admin.unsafe(`INSERT INTO public.source_usage_reservations(
      id,tenant_id,workspace_id,run_id,unit_id,idempotency_key,input_hash,reserved_units,created_at)
      VALUES ('reservation-2','${TENANT_A}','${WORKSPACE_A}','run-a','unit-2','run-a:unit-2','${HASH_A}',3,'2026-08-29T12:03:12Z')`);
    await expect(admin.unsafe(`INSERT INTO public.source_usage_reservations(
      id,tenant_id,workspace_id,run_id,unit_id,idempotency_key,input_hash,reserved_units,created_at)
      VALUES ('reservation-over','${TENANT_A}','${WORKSPACE_A}','run-a','unit-2','different-key','${HASH_A}',3,'2026-08-29T12:03:13Z')`))
      .rejects.toMatchObject({code:"23514"});

    await admin.unsafe(`INSERT INTO public.source_observations(
      id,tenant_id,workspace_id,run_id,unit_id,source_card_id,operation,observed_at,payload_ref,
      payload_sha256,field_names,provenance_sha256,dedupe_key_hash)
      VALUES ('observation-1','${TENANT_A}','${WORKSPACE_A}','run-a','unit-1','google_places_legacy',
      'search_text','2026-08-29T12:03:10Z','sources/run-a/unit-1','${HASH_A}',
      '["place_id","business_name"]','${HASH_B}','${HASH_C}')`);
    await expect(admin.unsafe(`INSERT INTO public.source_observations(
      id,tenant_id,workspace_id,run_id,unit_id,source_card_id,operation,observed_at,payload_ref,
      payload_sha256,field_names,provenance_sha256,dedupe_key_hash)
      VALUES ('observation-cross','${TENANT_B}','${WORKSPACE_B}','run-a','unit-1','google_places_legacy',
      'search_text','2026-08-29T12:03:10Z','sources/cross','${HASH_A}','[]','${HASH_B}','${HASH_A}')`))
      .rejects.toMatchObject({code:"23514"});
    await expect(admin.unsafe("UPDATE public.source_observations SET payload_sha256=$1 WHERE id='observation-1'",[HASH_C]))
      .rejects.toMatchObject({code:"P0001"});
  });
});
