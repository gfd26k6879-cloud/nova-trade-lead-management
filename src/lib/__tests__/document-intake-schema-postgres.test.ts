import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F04_DOCUMENT_INTAKE_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829230000_add_document_intake_foundation.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f04_document_intake_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000a2";
const WORKSPACE_A = "10000000-0000-4000-8000-0000000000a1";
const WORKSPACE_B = "10000000-0000-4000-8000-0000000000a2";
const DOCUMENT_A = "20000000-0000-4000-8000-0000000000a1";
const DOCUMENT_B = "20000000-0000-4000-8000-0000000000a2";
const VERSION_A1 = "30000000-0000-4000-8000-0000000000a1";
const VERSION_A2 = "30000000-0000-4000-8000-0000000000a2";
const JOB_A = "40000000-0000-4000-8000-0000000000a1";
const HASH = "a".repeat(64);
const HASH_B = "b".repeat(64);
const OBJECT_A1 = `tenants/${TENANT_A}/documents/${DOCUMENT_A}/versions/${VERSION_A1}/original`;
const OBJECT_A2 = `tenants/${TENANT_A}/documents/${DOCUMENT_A}/versions/${VERSION_A2}/original`;
const TABLES = [
  "documents", "document_versions", "document_upload_reservations",
  "document_version_finalizations", "document_scan_outbox", "document_scan_jobs",
  "document_scan_lease_history",
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
    try {
      await sql.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    } catch (error) {
      const failure = error as { message?: string; position?: string };
      throw new Error(`${file}:${failure.position ?? "unknown"}:${failure.message ?? "migration failed"}`);
    }
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
    .toEqual({ discovered: 60, applied: 58, skipped: 2 });
}

function versionSql(versionId: string, objectKey: string): string {
  return `INSERT INTO public.document_versions(
    id,tenant_id,workspace_id,document_id,original_name,format,media_type,
    declared_byte_size,max_bytes,scanner_policy_version,object_key,created_at,updated_at
  ) VALUES ('${versionId}','${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}',
    'notes.txt','txt','text/plain',5,52428800,'launch-v1','${objectKey}',
    '2026-08-29T12:00:00Z','2026-08-29T12:00:00Z')`;
}

async function finalizeCanonical(sql: Sql): Promise<void> {
  await sql.unsafe(`UPDATE public.document_versions SET
    status='quarantined',checksum='${HASH}',verified_byte_size=5,verified_media_type='text/plain',
    finalized_at='2026-08-29T12:01:00Z',updated_at='2026-08-29T12:01:00Z'
    WHERE id='${VERSION_A1}'`);
  await sql.unsafe(`INSERT INTO public.document_version_finalizations(
    tenant_id,workspace_id,document_id,source_identity,version_id,processing_version_id,
    checksum,checksum_algorithm,verified_byte_size,verified_media_type,scanner_policy_version,
    dedupe_decision,finalized_at
  ) VALUES ('${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','tenant_upload:${DOCUMENT_A}',
    '${VERSION_A1}','${VERSION_A1}','${HASH}','sha256',5,'text/plain','launch-v1','canonical',
    '2026-08-29T12:01:00Z')`);
  await expect(sql.unsafe(`INSERT INTO public.document_scan_jobs(
    id,tenant_id,workspace_id,document_id,version_id,object_key,checksum,policy_version,max_attempts,
    status,verdict,scanner_adapter_id,scanner_version,scanned_checksum,scanned_at,result_policy_version,
    result_retryable,created_at,updated_at
  ) VALUES ('40000000-0000-4000-8000-0000000000ff','${TENANT_A}','${WORKSPACE_A}',
    '${DOCUMENT_A}','${VERSION_A1}','${OBJECT_A1}','${HASH}','launch-v1',3,'clean','clean',
    'fixture','1.0.0','${HASH}','2026-08-29T12:01:00Z','launch-v1',false,
    '2026-08-29T12:01:00Z','2026-08-29T12:01:00Z')`)).rejects.toThrow(/pristine queued/i);
  await sql.unsafe(`INSERT INTO public.document_scan_jobs(
    id,tenant_id,workspace_id,document_id,version_id,object_key,checksum,policy_version,max_attempts,created_at,updated_at
  ) VALUES ('${JOB_A}','${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','${VERSION_A1}',
    '${OBJECT_A1}','${HASH}','launch-v1',3,'2026-08-29T12:01:00Z','2026-08-29T12:01:00Z')`);
  await expect(sql.unsafe(`INSERT INTO public.document_scan_outbox(
    dispatch_key,tenant_id,workspace_id,document_id,version_id,scan_job_id,object_key,checksum,
    policy_version,delivery_status,delivered_at,created_at,updated_at
  ) VALUES ('scan:${TENANT_A}:${VERSION_A1}:${HASH}:launch-v1','${TENANT_A}','${WORKSPACE_A}',
    '${DOCUMENT_A}','${VERSION_A1}','${JOB_A}','${OBJECT_A1}','${HASH}','launch-v1','delivered',
    '2026-08-29T12:01:00Z','2026-08-29T12:01:00Z','2026-08-29T12:01:00Z')`))
    .rejects.toThrow(/pristine pending/i);
  await sql.unsafe(`INSERT INTO public.document_scan_outbox(
    dispatch_key,tenant_id,workspace_id,document_id,version_id,scan_job_id,object_key,checksum,
    policy_version,created_at,updated_at
  ) VALUES ('scan:${TENANT_A}:${VERSION_A1}:${HASH}:launch-v1','${TENANT_A}','${WORKSPACE_A}',
    '${DOCUMENT_A}','${VERSION_A1}','${JOB_A}','${OBJECT_A1}','${HASH}','launch-v1',
    '2026-08-29T12:01:00Z','2026-08-29T12:01:00Z')`);
}

describe.skipIf(!RUN)("F-04 durable document-intake PostgreSQL foundation", () => {
  beforeAll(async () => {
    container = `novatrade-f04-${randomUUID()}`;
    docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const [{ version }] = await admin.unsafe<Array<{ version: string }>>("SELECT current_setting('server_version_num') version");
    expect(version.startsWith("16")).toBe(true);
    await replayAllMigrations(admin);
    try {
      await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    } catch (error) {
      const failure = error as { message?: string; position?: string };
      throw new Error(`direct-replay:${failure.position ?? "unknown"}:${failure.message ?? "migration failed"}`);
    }
    await admin.unsafe(`INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${TENANT_A}','f04-a','F04 Tenant A','active'),('${TENANT_B}','f04-b','F04 Tenant B','active');
      INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${WORKSPACE_A}','${TENANT_A}','f04-wa','F04 Workspace A','active'),
      ('${WORKSPACE_B}','${TENANT_B}','f04-wb','F04 Workspace B','active')`);
    const runtimeRole = `f04_runtime_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'f04-runtime' NOSUPERUSER NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ${TABLES.map((table) => `public.${table}`).join(",")} TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT USAGE ON SEQUENCE public.document_version_finalizations_id_seq,
      public.document_scan_outbox_id_seq,public.document_scan_lease_history_id_seq TO "${runtimeRole}"`);
    runtime = postgres(`postgres://${runtimeRole}:f04-runtime@127.0.0.1:${port}/${DATABASE}`,
      { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("replays with data and exposes no policy or runtime access", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    await admin.unsafe(`INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity,created_at)
      VALUES ('${DOCUMENT_A}','${TENANT_A}','${WORKSPACE_A}','tenant_upload','tenant_upload:${DOCUMENT_A}',
      '2026-08-29T12:00:00Z')`);
    await admin.unsafe(versionSql(VERSION_A1, OBJECT_A1));
    await admin.unsafe(`INSERT INTO public.document_upload_reservations(
      id,tenant_id,workspace_id,document_id,version_id,idempotency_key,request_fingerprint,
      object_key,created_at
    ) VALUES ('50000000-0000-4000-8000-0000000000a1','${TENANT_A}','${WORKSPACE_A}',
      '${DOCUMENT_A}','${VERSION_A1}','upload-request-0001','${HASH_B}','${OBJECT_A1}',
      '2026-08-29T12:00:00Z')`);
    const before = await admin.unsafe("SELECT id,status,checksum FROM public.document_versions");
    try {
      await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    } catch (error) {
      const failure = error as { message?: string; position?: string };
      throw new Error(`seeded-replay:${failure.position ?? "unknown"}:${failure.message ?? "migration failed"}`);
    }
    expect(await admin.unsafe("SELECT id,status,checksum FROM public.document_versions")).toEqual(before);

    const catalog = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
        (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
        pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
        pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [TABLES]);
    expect(catalog).toHaveLength(TABLES.length);
    expect(catalog.every((row) => row.relrowsecurity && row.relforcerowsecurity
      && row.policy_count === 0 && !row.anon_select && !row.authenticated_select)).toBe(true);
    expect(await admin.unsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_catalog.pg_indexes
      WHERE schemaname='public' AND indexname IN ('idx_document_scan_jobs_ready','idx_document_scan_outbox_pending')
      ORDER BY indexname`)).toEqual([
      { indexname: "idx_document_scan_jobs_ready" },
      { indexname: "idx_document_scan_outbox_pending" },
    ]);
    await expect(runtime.unsafe("SELECT * FROM public.documents")).resolves.toEqual([]);
    await expect(runtime.unsafe(`INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity)
      VALUES ('20000000-0000-4000-8000-000000000099','${TENANT_A}','${WORKSPACE_A}',
      'tenant_upload','tenant_upload:20000000-0000-4000-8000-000000000099')`)).rejects.toThrow();
    await expect(admin.unsafe(`UPDATE public.documents SET source_identity='tenant_upload:${DOCUMENT_B}'
      WHERE id='${DOCUMENT_A}'`)).rejects.toThrow(/immutable/i);
    await expect(admin.unsafe(`DELETE FROM public.document_upload_reservations
      WHERE version_id='${VERSION_A1}'`)).rejects.toThrow(/append.only/i);
    await admin.unsafe(`INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity)
      VALUES ('20000000-0000-4000-8000-0000000000d1','${TENANT_A}','${WORKSPACE_A}',
      'tenant_upload','tenant_upload:20000000-0000-4000-8000-0000000000d1')`);
    await expect(admin.unsafe(`DELETE FROM public.documents
      WHERE id='20000000-0000-4000-8000-0000000000d1'`)).rejects.toThrow(/append.only/i);
    await admin.unsafe(`INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity)
      VALUES ('20000000-0000-4000-8000-0000000000d2','${TENANT_A}','${WORKSPACE_A}',
      'tenant_upload','tenant_upload:20000000-0000-4000-8000-0000000000d2');
      INSERT INTO public.document_versions(id,tenant_id,workspace_id,document_id,original_name,format,
        media_type,declared_byte_size,max_bytes,scanner_policy_version,object_key)
      VALUES ('30000000-0000-4000-8000-0000000000d2','${TENANT_A}','${WORKSPACE_A}',
        '20000000-0000-4000-8000-0000000000d2','leaf.txt','txt','text/plain',4,52428800,
        'launch-v1','tenants/${TENANT_A}/documents/20000000-0000-4000-8000-0000000000d2/versions/30000000-0000-4000-8000-0000000000d2/original')`);
    await expect(admin.unsafe(`DELETE FROM public.document_versions
      WHERE id='30000000-0000-4000-8000-0000000000d2'`)).rejects.toThrow(/append.only/i);
  });

  it("enforces exact scope, private keys, and tenant idempotency", async () => {
    if (!admin) throw new Error("test database unavailable");
    await expect(admin.unsafe(`INSERT INTO public.document_versions(
      id,tenant_id,workspace_id,document_id,original_name,format,media_type,declared_byte_size,
      max_bytes,scanner_policy_version,object_key
    ) VALUES ('30000000-0000-4000-8000-000000000099','${TENANT_B}','${WORKSPACE_B}',
      '${DOCUMENT_A}','notes.txt','txt','text/plain',5,52428800,'launch-v1','bad/key')`)).rejects.toThrow();
    await expect(admin.unsafe(`INSERT INTO public.document_upload_reservations(
      id,tenant_id,workspace_id,document_id,version_id,idempotency_key,request_fingerprint,object_key
    ) VALUES ('50000000-0000-4000-8000-000000000099','${TENANT_A}','${WORKSPACE_A}',
      '${DOCUMENT_A}','${VERSION_A1}','upload-request-0001','${HASH_B}','${OBJECT_A1}')`)).rejects.toThrow();
    await expect(admin.unsafe(`UPDATE public.document_versions SET object_key='https://public.invalid/file'
      WHERE id='${VERSION_A1}'`)).rejects.toThrow(/immutable|object/i);
  });

  it("records one same-source canonical finalization and no duplicate scan", async () => {
    if (!admin) throw new Error("test database unavailable");
    await finalizeCanonical(admin);
    await admin.unsafe(versionSql(VERSION_A2, OBJECT_A2));
    await admin.unsafe(`UPDATE public.document_versions SET status='quarantined',checksum='${HASH}',
      verified_byte_size=5,verified_media_type='text/plain',duplicate_of_version_id='${VERSION_A1}',
      finalized_at='2026-08-29T12:02:00Z',updated_at='2026-08-29T12:02:00Z' WHERE id='${VERSION_A2}'`);
    await admin.unsafe(`INSERT INTO public.document_version_finalizations(
      tenant_id,workspace_id,document_id,source_identity,version_id,processing_version_id,checksum,
      checksum_algorithm,verified_byte_size,verified_media_type,scanner_policy_version,dedupe_decision,finalized_at
    ) VALUES ('${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','tenant_upload:${DOCUMENT_A}',
      '${VERSION_A2}','${VERSION_A1}','${HASH}','sha256',5,'text/plain','launch-v1','duplicate',
      '2026-08-29T12:02:00Z')`);
    expect(await admin.unsafe<Array<{ count: number }>>(`SELECT count(*)::integer count
      FROM public.document_scan_jobs WHERE document_id='${DOCUMENT_A}'`)).toEqual([{ count: 1 }]);
    await expect(admin.unsafe(`INSERT INTO public.document_version_finalizations(
      tenant_id,workspace_id,document_id,source_identity,version_id,processing_version_id,checksum,
      checksum_algorithm,verified_byte_size,verified_media_type,scanner_policy_version,dedupe_decision
    ) VALUES ('${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','tenant_upload:${DOCUMENT_A}',
      '${VERSION_A2}','${VERSION_A2}','${HASH}','sha256',5,'text/plain','launch-v1','canonical')`)).rejects.toThrow();

    await admin.unsafe(`INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity)
      VALUES ('${DOCUMENT_B}','${TENANT_B}','${WORKSPACE_B}','tenant_upload','tenant_upload:${DOCUMENT_B}')`);
    await expect(admin.unsafe(`INSERT INTO public.document_version_finalizations(
      tenant_id,workspace_id,document_id,source_identity,version_id,processing_version_id,checksum,
      checksum_algorithm,verified_byte_size,verified_media_type,scanner_policy_version,dedupe_decision
    ) VALUES ('${TENANT_B}','${WORKSPACE_B}','${DOCUMENT_B}','tenant_upload:${DOCUMENT_B}',
      '${VERSION_A2}','${VERSION_A1}','${HASH}','sha256',5,'text/plain','launch-v1','duplicate')`)).rejects.toThrow();
    await expect(admin.unsafe(`DELETE FROM public.document_scan_outbox
      WHERE scan_job_id='${JOB_A}'`)).rejects.toThrow(/append.only/i);
  });

  it("fences stale scan completion, records lease history, and bounds retry", async () => {
    if (!admin) throw new Error("test database unavailable");
    const LEASE_1 = "c".repeat(64);
    const LEASE_2 = "d".repeat(64);
    const WORKER = "e".repeat(64);
    await expect(admin.unsafe(`UPDATE public.document_scan_jobs SET lease_generation=1
      WHERE id='${JOB_A}'`)).rejects.toThrow(/acquisition|generation/i);
    await admin.unsafe(`UPDATE public.document_scan_jobs SET status='running',attempt_count=1,
      lease_generation=1,lease_token_hash='${LEASE_1}',lease_worker_hash='${WORKER}',
      lease_acquired_at='2026-08-29T12:03:00Z',lease_heartbeat_at='2026-08-29T12:03:00Z',
      lease_expires_at='2026-08-29T12:04:00Z',updated_at='2026-08-29T12:03:00Z' WHERE id='${JOB_A}'`);
    await expect(admin.unsafe(`UPDATE public.document_scan_jobs SET lease_token_hash='${LEASE_2}'
      WHERE id='${JOB_A}'`)).rejects.toThrow(/lease identity/i);
    await expect(admin.unsafe(`UPDATE public.document_scan_jobs SET status='clean',attempt_count=2,
      lease_generation=2,lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,
      lease_heartbeat_at=NULL,lease_expires_at=NULL,verdict='clean',scanner_adapter_id='fixture',
      scanner_version='1.0.0',scanned_checksum='${HASH}',scanned_at='2026-08-29T12:03:10Z',
      result_policy_version='launch-v1',result_retryable=false,updated_at='2026-08-29T12:03:10Z'
      WHERE id='${JOB_A}'`)).rejects.toThrow(/acquisition|generation/i);
    await admin.unsafe(`UPDATE public.document_scan_jobs SET
      lease_heartbeat_at='2026-08-29T12:03:15Z',lease_expires_at='2026-08-29T12:04:15Z',
      updated_at='2026-08-29T12:03:15Z' WHERE id='${JOB_A}'`);
    await admin.unsafe(`UPDATE public.document_scan_jobs SET status='retry_wait',next_attempt_at='2026-08-29T12:05:00Z',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      verdict='error',scanner_adapter_id='fixture',scanner_version='1.0.0',scanned_checksum='${HASH}',
      scanned_at='2026-08-29T12:03:30Z',result_policy_version='launch-v1',reason_code='timeout',
      result_retryable=true,updated_at='2026-08-29T12:03:30Z' WHERE id='${JOB_A}'`);
    await admin.unsafe(`UPDATE public.document_scan_jobs SET status='running',attempt_count=2,
      lease_generation=2,lease_token_hash='${LEASE_2}',lease_worker_hash='${WORKER}',
      lease_acquired_at='2026-08-29T12:05:00Z',lease_heartbeat_at='2026-08-29T12:05:00Z',
      lease_expires_at='2026-08-29T12:06:00Z',next_attempt_at=NULL,verdict=NULL,scanner_adapter_id=NULL,
      scanner_version=NULL,scanned_checksum=NULL,scanned_at=NULL,result_policy_version=NULL,reason_code=NULL,
      result_retryable=NULL,updated_at='2026-08-29T12:05:00Z' WHERE id='${JOB_A}'`);
    const stale = await admin.unsafe(`UPDATE public.document_scan_jobs SET status='clean',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      verdict='clean',scanner_adapter_id='fixture',scanner_version='1.0.0',scanned_checksum='${HASH}',
      scanned_at='2026-08-29T12:05:30Z',result_policy_version='launch-v1',result_retryable=false,
      updated_at='2026-08-29T12:05:30Z' WHERE id='${JOB_A}' AND lease_generation=1 AND lease_token_hash='${LEASE_1}'
      RETURNING id`);
    expect(stale).toEqual([]);
    expect(await admin.unsafe<Array<{ lease_generation: number }>>(`SELECT lease_generation
      FROM public.document_scan_jobs WHERE id='${JOB_A}'`)).toEqual([{ lease_generation: 2 }]);
    expect(await admin.unsafe<Array<{ lease_generation: number; released: boolean; release_reason: string | null }>>(`SELECT lease_generation,
      released_at IS NOT NULL released,release_reason
      FROM public.document_scan_lease_history WHERE job_id='${JOB_A}' ORDER BY lease_generation`))
      .toEqual([
        { lease_generation: 1, released: true, release_reason: "retry_wait" },
        { lease_generation: 2, released: false, release_reason: null },
      ]);
    expect(await admin.unsafe<Array<{ heartbeat_at: string }>>(`SELECT heartbeat_at::text heartbeat_at
      FROM public.document_scan_lease_history WHERE job_id='${JOB_A}' AND lease_generation=1`))
      .toEqual([{ heartbeat_at: "2026-08-29 12:03:15+00" }]);
    await expect(admin.unsafe(`UPDATE public.document_scan_jobs SET status='retry_wait',attempt_count=3,
      next_attempt_at='2026-08-29T12:07:00Z',lease_token_hash=NULL,lease_worker_hash=NULL,
      lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,verdict='error',
      scanner_adapter_id='fixture',scanner_version='1.0.0',scanned_checksum='${HASH}',
      scanned_at='2026-08-29T12:05:30Z',result_policy_version='launch-v1',reason_code='timeout',
      result_retryable=true,updated_at='2026-08-29T12:05:30Z' WHERE id='${JOB_A}'`)).rejects.toThrow();
    await expect(admin.unsafe(`UPDATE public.document_scan_lease_history SET release_reason='clean'
      WHERE job_id='${JOB_A}' AND lease_generation=1`)).rejects.toThrow(/lease history|append.only/i);
  });
});
