import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F05_EXTRACTION_JOB_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829240000_add_document_extraction_job_foundation.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f05_extraction_job_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-0000000000e1";
const TENANT_B = "00000000-0000-4000-8000-0000000000e2";
const WORKSPACE_A = "10000000-0000-4000-8000-0000000000e1";
const WORKSPACE_B = "10000000-0000-4000-8000-0000000000e2";
const DOCUMENT_A = "20000000-0000-4000-8000-0000000000e1";
const VERSION_A = "30000000-0000-4000-8000-0000000000e1";
const SCAN_A = "40000000-0000-4000-8000-0000000000e1";
const JOB_A = "50000000-0000-4000-8000-0000000000e1";
const EXPIRED_JOB = "50000000-0000-4000-8000-0000000000f1";
const ACQUISITION_JOB = "50000000-0000-4000-8000-0000000000f2";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const OBJECT_A = `tenants/${TENANT_A}/documents/${DOCUMENT_A}/versions/${VERSION_A}/original`;
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);
const REQUIRED_CHECKS = [
  ["document_extraction_jobs", "document_extraction_jobs_attempt_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_error_length_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_hashes_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_lease_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_result_shape_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_status_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_time_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_token_lengths_chk"],
  ["document_extraction_jobs", "document_extraction_jobs_tokens_chk"],
  ["document_extraction_lease_history", "document_extraction_lease_history_release_chk"],
  ["document_extraction_lease_history", "document_extraction_lease_history_scope_chk"],
] as const;

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

async function replayPredecessors(sql: Sql): Promise<void> {
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
    .filter((file) => file.endsWith(".sql") && file < MIGRATION).sort();
  for (const file of migrations) {
    if (SKIPPED.has(file)) continue;
    await sql.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
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
  expect(await sql.unsafe("SELECT to_regclass('public.document_scan_jobs') IS NOT NULL ready"))
    .toEqual([{ ready: true }]);
}

async function seedCleanDocument(sql: Sql): Promise<void> {
  await sql.unsafe(`
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${TENANT_A}','f05-extract-a','F05 Extract A','active'),
      ('${TENANT_B}','f05-extract-b','F05 Extract B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${WORKSPACE_A}','${TENANT_A}','f05-extract-wa','F05 Extract WA','active'),
      ('${WORKSPACE_B}','${TENANT_B}','f05-extract-wb','F05 Extract WB','active');
    INSERT INTO public.documents(id,tenant_id,workspace_id,source_kind,source_identity,created_at)
      VALUES ('${DOCUMENT_A}','${TENANT_A}','${WORKSPACE_A}','tenant_upload',
        'tenant_upload:${DOCUMENT_A}','2026-08-29T12:00:00Z');
    INSERT INTO public.document_versions(
      id,tenant_id,workspace_id,document_id,original_name,format,media_type,declared_byte_size,max_bytes,
      scanner_policy_version,object_key,created_at,updated_at
    ) VALUES ('${VERSION_A}','${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','notes.txt','txt',
      'text/plain',5,52428800,'launch-v1','${OBJECT_A}','2026-08-29T12:00:00Z','2026-08-29T12:00:00Z');
    UPDATE public.document_versions SET status='quarantined',checksum='${HASH_A}',verified_byte_size=5,
      verified_media_type='text/plain',finalized_at='2026-08-29T12:01:00Z',updated_at='2026-08-29T12:01:00Z'
      WHERE id='${VERSION_A}';
    INSERT INTO public.document_version_finalizations(
      tenant_id,workspace_id,document_id,source_identity,version_id,processing_version_id,checksum,
      checksum_algorithm,verified_byte_size,verified_media_type,scanner_policy_version,dedupe_decision,finalized_at
    ) VALUES ('${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','tenant_upload:${DOCUMENT_A}',
      '${VERSION_A}','${VERSION_A}','${HASH_A}','sha256',5,'text/plain','launch-v1','canonical',
      '2026-08-29T12:01:00Z');
    INSERT INTO public.document_scan_jobs(
      id,tenant_id,workspace_id,document_id,version_id,object_key,checksum,policy_version,max_attempts,
      created_at,updated_at
    ) VALUES ('${SCAN_A}','${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}','${VERSION_A}','${OBJECT_A}',
      '${HASH_A}','launch-v1',3,'2026-08-29T12:01:00Z','2026-08-29T12:01:00Z');
    UPDATE public.document_scan_jobs SET status='running',attempt_count=1,lease_generation=1,
      lease_token_hash='${HASH_B}',lease_worker_hash='${HASH_C}',lease_acquired_at='2026-08-29T12:02:00Z',
      lease_heartbeat_at='2026-08-29T12:02:00Z',lease_expires_at='2026-08-29T12:03:00Z',
      updated_at='2026-08-29T12:02:00Z' WHERE id='${SCAN_A}';
    UPDATE public.document_scan_jobs SET status='clean',lease_token_hash=NULL,lease_worker_hash=NULL,
      lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,verdict='clean',
      scanner_adapter_id='fixture-scanner',scanner_version='1.0.0',scanned_checksum='${HASH_A}',
      scanned_at='2026-08-29T12:02:30Z',result_policy_version='launch-v1',result_retryable=false,
      updated_at='2026-08-29T12:02:30Z' WHERE id='${SCAN_A}';
    UPDATE public.document_versions SET status='clean',updated_at='2026-08-29T12:02:30Z'
      WHERE id='${VERSION_A}';
  `);
}

function queuedJob(id = JOB_A, parserVersion = "1.0.0", tenant = TENANT_A, workspace = WORKSPACE_A): string {
  return `INSERT INTO public.document_extraction_jobs(
    id,tenant_id,workspace_id,document_id,version_id,canonical_finalization_id,scan_job_id,checksum,
    scanner_policy_version,parser_id,parser_version,idempotency_key,input_hash,max_attempts,created_at,updated_at
  ) SELECT '${id}','${tenant}','${workspace}','${DOCUMENT_A}','${VERSION_A}',f.id,'${SCAN_A}','${HASH_A}',
    'launch-v1','launch-text-lines','${parserVersion}','extract-${id}','${HASH_D}',3,
    pg_catalog.statement_timestamp()-interval '1 second',
    pg_catalog.statement_timestamp()-interval '1 second'
    FROM public.document_version_finalizations f WHERE f.version_id='${VERSION_A}'`;
}

function completeJobWithWarnings(warnings: string): string {
  const literal = warnings.replaceAll("'", "''");
  return `UPDATE public.document_extraction_jobs SET status='complete',
    lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,
    lease_expires_at=NULL,result_lease_generation=2,result_lease_token_hash='${HASH_D}',
    event_at=pg_catalog.statement_timestamp(),output_sha256='${HASH_A}',output_block_count=2,
    output_chunk_count=1,quality_score=1,review_required=false,warnings='${literal}'::jsonb,
    updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}'`;
}

function acquireJob(id: string, clockOffset = "0 seconds", duration = "1 minute"): string {
  return `UPDATE public.document_extraction_jobs SET status='running',attempt_count=1,
    lease_generation=1,lease_token_hash='${HASH_B}',lease_worker_hash='${HASH_C}',
    lease_acquired_at=pg_catalog.statement_timestamp()+interval '${clockOffset}',
    lease_heartbeat_at=pg_catalog.statement_timestamp()+interval '${clockOffset}',
    lease_expires_at=pg_catalog.statement_timestamp()+interval '${clockOffset}'+interval '${duration}',
    updated_at=pg_catalog.statement_timestamp() WHERE id='${id}' RETURNING id`;
}

describe.skipIf(!RUN)("F-05 document extraction job PostgreSQL foundation", () => {
  beforeAll(async () => {
    container = `novatrade-f05-extract-${randomUUID()}`;
    docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const url = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(url, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const [{ version }] = await admin.unsafe<Array<{ version: string }>>(
      "SELECT current_setting('server_version_num') version",
    );
    expect(version.startsWith("16")).toBe(true);
    await replayPredecessors(admin);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    await seedCleanDocument(admin);
    const role = `f05_extract_runtime_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD 'f05-extract-runtime' NOSUPERUSER NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.document_extraction_jobs,
        public.document_extraction_lease_history TO "${role}";
      GRANT USAGE ON SEQUENCE public.document_extraction_lease_history_id_seq TO "${role}"`);
    runtime = postgres(`postgres://${role}:f05-extract-runtime@127.0.0.1:${port}/${DATABASE}`,
      { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("replays exactly and keeps both tables deny-by-default", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    await admin.unsafe(queuedJob());
    const before = await admin.unsafe("SELECT id,status,input_hash FROM public.document_extraction_jobs");
    const canonicalChecks = await admin.unsafe<Array<{
      table_name: string; conname: string; convalidated: boolean; definition: string;
    }>>(`SELECT c.relname table_name,k.conname,k.convalidated,
        pg_catalog.pg_get_constraintdef(k.oid,true) definition
      FROM pg_catalog.pg_constraint k
      JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND k.contype='c'
        AND c.relname IN ('document_extraction_jobs','document_extraction_lease_history')
      ORDER BY c.relname,k.conname`);
    expect(canonicalChecks.map(({ definition: _definition, ...check }) => check))
      .toEqual(REQUIRED_CHECKS.map(([table_name, conname]) => ({
        table_name, conname, convalidated: true,
      })));
    await admin.unsafe(`ALTER TABLE public.document_extraction_jobs
      DROP CONSTRAINT document_extraction_jobs_hashes_chk,
      DROP CONSTRAINT document_extraction_jobs_status_chk,
      ADD CONSTRAINT document_extraction_jobs_status_chk CHECK (status IS NOT NULL) NOT VALID`);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    expect(await admin.unsafe("SELECT id,status,input_hash FROM public.document_extraction_jobs")).toEqual(before);
    const repairedChecks = await admin.unsafe<Array<{
      table_name: string; conname: string; convalidated: boolean; definition: string;
    }>>(`SELECT c.relname table_name,k.conname,k.convalidated,
        pg_catalog.pg_get_constraintdef(k.oid,true) definition
      FROM pg_catalog.pg_constraint k
      JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND k.contype='c'
        AND c.relname IN ('document_extraction_jobs','document_extraction_lease_history')
      ORDER BY c.relname,k.conname`);
    expect(repairedChecks).toEqual(canonicalChecks);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    expect(await admin.unsafe(`SELECT c.relname table_name,k.conname,k.convalidated,
        pg_catalog.pg_get_constraintdef(k.oid,true) definition
      FROM pg_catalog.pg_constraint k
      JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND k.contype='c'
        AND c.relname IN ('document_extraction_jobs','document_extraction_lease_history')
      ORDER BY c.relname,k.conname`)).toEqual(repairedChecks);
    const catalog = await admin.unsafe<Array<Record<string, unknown>>>(`SELECT c.relname,c.relrowsecurity,
      c.relforcerowsecurity,(SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policies,
      pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
      pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('document_extraction_jobs','document_extraction_lease_history')
      ORDER BY c.relname`);
    expect(catalog).toHaveLength(2);
    expect(catalog.every((row) => row.relrowsecurity && row.relforcerowsecurity && row.policies === 0
      && !row.anon_select && !row.authenticated_select)).toBe(true);
    expect(await runtime.unsafe("SELECT id FROM public.document_extraction_jobs")).toEqual([]);
    await expect(runtime.unsafe(queuedJob("50000000-0000-4000-8000-0000000000ff")))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("requires exact clean canonical parents and pristine idempotent identity", async () => {
    if (!admin) throw new Error("test database unavailable");
    await expect(admin.unsafe(queuedJob("50000000-0000-4000-8000-0000000000e2", "1.0.0", TENANT_B, WORKSPACE_B)))
      .rejects.toThrow();
    await expect(admin.unsafe(queuedJob("50000000-0000-4000-8000-0000000000e3")))
      .rejects.toMatchObject({ code: "23505" });
    await expect(admin.unsafe(`INSERT INTO public.document_extraction_jobs(
      id,tenant_id,workspace_id,document_id,version_id,canonical_finalization_id,scan_job_id,checksum,
      scanner_policy_version,parser_id,parser_version,idempotency_key,input_hash,max_attempts,status,
      attempt_count,lease_generation,lease_token_hash,lease_worker_hash,lease_acquired_at,
      lease_heartbeat_at,lease_expires_at
    ) SELECT '50000000-0000-4000-8000-0000000000e4','${TENANT_A}','${WORKSPACE_A}','${DOCUMENT_A}',
      '${VERSION_A}',f.id,'${SCAN_A}','${HASH_A}','launch-v1','launch-text-lines','2.0.0',
      'extract-dirty-state','${HASH_E}',3,'running',1,1,'${HASH_B}','${HASH_C}',now(),now(),now()+interval '1 minute'
      FROM public.document_version_finalizations f WHERE f.version_id='${VERSION_A}'`))
      .rejects.toThrow(/pristine queued/i);
  });

  it("fences acquisition to database time and a fifteen-minute maximum lease", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(queuedJob(ACQUISITION_JOB, "3.0.0"));
    await expect(admin.unsafe(acquireJob(ACQUISITION_JOB, "1 day")))
      .rejects.toThrow(/acquisition|lease/i);
    await expect(admin.unsafe(acquireJob(ACQUISITION_JOB, "1 year")))
      .rejects.toThrow(/acquisition|lease/i);
    await expect(admin.unsafe(acquireJob(ACQUISITION_JOB, "0 seconds", "16 minutes")))
      .rejects.toThrow(/acquisition|lease/i);
    expect(await admin.unsafe(acquireJob(ACQUISITION_JOB))).toEqual([{ id: ACQUISITION_JOB }]);
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '16 minutes',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${ACQUISITION_JOB}'`))
      .rejects.toThrow(/heartbeat|lease/i);
  });

  it("rejects heartbeat, lease extension, and completion after database-time expiry", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(queuedJob(EXPIRED_JOB, "2.0.0"));
    await admin.unsafe(`UPDATE public.document_extraction_jobs SET status='running',attempt_count=1,
      lease_generation=1,lease_token_hash='${HASH_B}',lease_worker_hash='${HASH_C}',
      lease_acquired_at=pg_catalog.statement_timestamp(),
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '100 milliseconds',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${EXPIRED_JOB}'`);
    await admin.unsafe("SELECT pg_catalog.pg_sleep(0.2)");
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '1 minute',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${EXPIRED_JOB}'`))
      .rejects.toThrow(/expired|live lease/i);
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET status='complete',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,
      lease_expires_at=NULL,result_lease_generation=1,result_lease_token_hash='${HASH_B}',
      event_at=pg_catalog.statement_timestamp(),output_sha256='${HASH_A}',output_block_count=2,
      output_chunk_count=1,quality_score=1,review_required=false,warnings='[]',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${EXPIRED_JOB}'`))
      .rejects.toThrow(/expired|live lease/i);
  });

  it("fences lease generations, synchronizes history, bounds retry, and rejects stale completion", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(`UPDATE public.document_extraction_jobs SET status='running',attempt_count=1,
      lease_generation=1,lease_token_hash='${HASH_B}',lease_worker_hash='${HASH_C}',
      lease_acquired_at=pg_catalog.statement_timestamp(),
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '1 minute',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}'`);
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET lease_token_hash='${HASH_E}'
      WHERE id='${JOB_A}'`)).rejects.toThrow(/lease identity/i);
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET
      lease_heartbeat_at=lease_heartbeat_at-interval '1 second'
      WHERE id='${JOB_A}'`)).rejects.toThrow(/heartbeat|regression/i);
    await admin.unsafe(`UPDATE public.document_extraction_jobs SET
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '1 minute',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}'`);
    await admin.unsafe(`UPDATE public.document_extraction_jobs SET status='retry_wait',
      next_attempt_at=pg_catalog.statement_timestamp(),lease_token_hash=NULL,lease_worker_hash=NULL,
      lease_acquired_at=NULL,lease_heartbeat_at=NULL,lease_expires_at=NULL,
      result_lease_generation=1,result_lease_token_hash='${HASH_B}',
      event_at=pg_catalog.statement_timestamp(),
      error_code='PARSER_TIMEOUT',error_fingerprint='${HASH_E}',result_retryable=true,
      updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}'`);
    await admin.unsafe(`UPDATE public.document_extraction_jobs SET status='running',attempt_count=2,
      lease_generation=2,lease_token_hash='${HASH_D}',lease_worker_hash='${HASH_C}',
      lease_acquired_at=pg_catalog.statement_timestamp(),
      lease_heartbeat_at=pg_catalog.statement_timestamp(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '1 minute',
      next_attempt_at=NULL,result_lease_generation=NULL,
      result_lease_token_hash=NULL,event_at=NULL,error_code=NULL,error_fingerprint=NULL,result_retryable=NULL,
      updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}'`);
    expect(await admin.unsafe(`UPDATE public.document_extraction_jobs SET status='complete',
      lease_token_hash=NULL,lease_worker_hash=NULL,lease_acquired_at=NULL,lease_heartbeat_at=NULL,
      lease_expires_at=NULL,result_lease_generation=1,result_lease_token_hash='${HASH_B}',
      event_at=pg_catalog.statement_timestamp(),output_sha256='${HASH_A}',output_block_count=2,
      output_chunk_count=1,quality_score=1,review_required=false,warnings='[]',
      updated_at=pg_catalog.statement_timestamp() WHERE id='${JOB_A}' AND lease_generation=1
      AND lease_token_hash='${HASH_B}' RETURNING id`)).toEqual([]);
    await expect(admin.unsafe(completeJobWithWarnings(JSON.stringify(["x".repeat(70_000)]))))
      .rejects.toThrow(/bounded array/i);
    await expect(admin.unsafe(completeJobWithWarnings('[{"nested":"value"}]')))
      .rejects.toThrow(/must be a string/i);
    await expect(admin.unsafe(completeJobWithWarnings("[1]")))
      .rejects.toThrow(/must be a string/i);
    await expect(admin.unsafe(completeJobWithWarnings(JSON.stringify(["bad\u0085label"]))))
      .rejects.toThrow(/warning text is invalid/i);
    const compressibleWarnings = JSON.stringify(Array.from({ length: 100 }, () => "界".repeat(500)));
    expect(Buffer.byteLength(compressibleWarnings, "utf8")).toBeGreaterThan(65_536);
    await expect(admin.unsafe(completeJobWithWarnings(compressibleWarnings)))
      .rejects.toThrow(/bounded array/i);
    await admin.unsafe(completeJobWithWarnings("[]"));
    expect(await admin.unsafe(`SELECT lease_generation,released_at IS NOT NULL released,release_reason
      FROM public.document_extraction_lease_history WHERE job_id='${JOB_A}' ORDER BY lease_generation`))
      .toEqual([{ lease_generation: 1, released: true, release_reason: "retry_wait" },
        { lease_generation: 2, released: true, release_reason: "complete" }]);
    await expect(admin.unsafe(`UPDATE public.document_extraction_jobs SET output_block_count=3 WHERE id='${JOB_A}'`))
      .rejects.toThrow(/terminal/i);
    await expect(admin.unsafe(`DELETE FROM public.document_extraction_jobs WHERE id='${JOB_A}'`))
      .rejects.toThrow(/append.only/i);
    await expect(admin.unsafe(`UPDATE public.document_extraction_lease_history SET release_reason='error'
      WHERE job_id='${JOB_A}' AND lease_generation=1`)).rejects.toThrow(/append.only|history/i);
  });
});
