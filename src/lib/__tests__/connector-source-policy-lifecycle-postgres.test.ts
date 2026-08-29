import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F09_SOURCE_POLICY_LIFECYCLE_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829221000_add_current_source_policy_lifecycle.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f09_source_policy_lifecycle_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-000000000091";
const TENANT_B = "00000000-0000-4000-8000-000000000092";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000091";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000092";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

let container = "";
let admin: Sql | undefined;
let competitor: Sql | undefined;
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
    if (docker([
      "exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
      "-d", DATABASE, "-Atc", "SELECT 1",
    ], true) === "1") return;
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
    .toEqual({ discovered: 60, applied: 58, skipped: 2 });
}

function activationSql(
  id: string,
  policyId: string,
  version: number,
  tenant = TENANT_A,
  workspace: string | null = WORKSPACE_A,
): string {
  return `INSERT INTO public.current_source_policy_activations(
    id,tenant_id,workspace_id,policy_key,policy_version,source_policy_id,
    activated_by_hash,activation_reason
  ) VALUES ('${id}','${tenant}',${workspace ? `'${workspace}'` : "NULL"},'fixture-policy',${version},
    '${policyId}','${HASH_C}','approved fixture policy activation')`;
}

function runSql(id: string, policyId: string, tenant = TENANT_A, workspace = WORKSPACE_A): string {
  const suffix = tenant === TENANT_A ? "a" : "b";
  return `INSERT INTO public.source_runs(
    id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,
    source_policy_id,idempotency_key,input_hash,operation,hard_cap_units,max_attempts,
    created_at,updated_at
  ) VALUES ('${id}','${tenant}',${workspace ? `'${workspace}'` : "NULL"},'google_places_legacy',1,
    'account-${suffix}','${policyId}','${id}-key','${HASH_A}','search_text',4,3,
    '2026-08-29T12:00:00Z','2026-08-29T12:00:00Z')`;
}

describe.skipIf(!RUN)("F-09 current source-policy PostgreSQL lifecycle", () => {
  beforeAll(async () => {
    container = `novatrade-f09-policy-${randomUUID()}`;
    docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    competitor = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const [{ version }] = await admin.unsafe<Array<{ version: string }>>(
      "SELECT current_setting('server_version_num') version",
    );
    expect(version.startsWith("16")).toBe(true);
    await replayAllMigrations(admin);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    await admin.unsafe(`
      INSERT INTO public.tenants(id,slug,name,status) VALUES
        ('${TENANT_A}','f09-policy-a','F09 Policy Tenant A','active'),
        ('${TENANT_B}','f09-policy-b','F09 Policy Tenant B','active');
      INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
        ('${WORKSPACE_A}','${TENANT_A}','f09-policy-wa','F09 Policy Workspace A','active'),
        ('${WORKSPACE_B}','${TENANT_B}','f09-policy-wb','F09 Policy Workspace B','active');
      INSERT INTO public.connector_versions
        (source_card_id,version,execution_mode,transport,operations,output_fields,adapter_sha256)
      VALUES ('google_places_legacy',1,'fixture','none','["search_text"]','["place_id"]','${HASH_A}');
      INSERT INTO public.connector_accounts
        (id,tenant_id,workspace_id,source_card_id,connector_version,account_key,status)
      VALUES
        ('account-a','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'fixture-a','fixture_only'),
        ('account-b','${TENANT_B}',NULL,'google_places_legacy',1,'fixture-b','fixture_only');
      INSERT INTO public.source_policy_versions(
        id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,policy_key,
        version,state,execution_mode,terms_state,allowed_operations,allowed_fields,hard_cap_units,policy_sha256)
      VALUES
        ('policy-a-v1','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'account-a','fixture-policy',
          1,'active','fixture','approved','["search_text"]','["place_id"]',4,'${HASH_B}'),
        ('policy-a-v2','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'account-a','fixture-policy',
          2,'active','fixture','approved','["search_text"]','["place_id"]',4,'${HASH_C}'),
        ('policy-b-v1','${TENANT_B}',NULL,'google_places_legacy',1,'account-b','fixture-policy',
          1,'active','fixture','approved','["search_text"]','["place_id"]',4,'${HASH_B}');
    `);
    const runtimeRole = `f09_policy_runtime_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'f09-policy-runtime' NOSUPERUSER NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.current_source_policy_activations TO "${runtimeRole}"`);
    runtime = postgres(`postgres://${runtimeRole}:f09-policy-runtime@127.0.0.1:${port}/${DATABASE}`,
      { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await competitor?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("replays without changing selection and denies every untrusted runtime path", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    await admin.unsafe(activationSql("activation-a-v1", "policy-a-v1", 1));
    await admin.unsafe(activationSql("activation-b-v1", "policy-b-v1", 1, TENANT_B, null));
    const before = await admin.unsafe("SELECT * FROM public.current_source_policy_activations ORDER BY id");
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    expect(await admin.unsafe("SELECT * FROM public.current_source_policy_activations ORDER BY id")).toEqual(before);

    const [catalog] = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT c.relrowsecurity,c.relforcerowsecurity,
        (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
        pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
        pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(
            COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))
          ) acl WHERE acl.grantee=0 AND acl.privilege_type='SELECT'
        ) public_select_denied
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='current_source_policy_activations'`);
    expect(catalog).toMatchObject({
      relrowsecurity: true, relforcerowsecurity: true, policy_count: 0,
      anon_select: false, authenticated_select: false, public_select_denied: true,
    });
    expect(await runtime.unsafe("SELECT id FROM public.current_source_policy_activations")).toEqual([]);
    await expect(runtime.unsafe(activationSql("runtime-denied", "policy-a-v2", 2)))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("uses exact scoped foreign keys and permits only one current version per policy key", async () => {
    if (!admin) throw new Error("test database unavailable");
    await expect(admin.unsafe(activationSql("activation-a-v2-too-soon", "policy-a-v2", 2)))
      .rejects.toMatchObject({ code: "23505" });
    await expect(admin.unsafe(activationSql("activation-cross", "policy-a-v1", 1, TENANT_B, WORKSPACE_B)))
      .rejects.toMatchObject({ code: "23514" });
    expect(await admin.unsafe(`SELECT tenant_id,workspace_id,policy_version FROM public.current_source_policy_activations
      WHERE revoked_at IS NULL ORDER BY tenant_id`)).toEqual([
      { tenant_id: TENANT_A, workspace_id: WORKSPACE_A, policy_version: 1 },
      { tenant_id: TENANT_B, workspace_id: null, policy_version: 1 },
    ]);
  });

  it("rechecks current attestation eligibility when a run is authorized", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(`
      INSERT INTO public.connector_versions
        (source_card_id,version,execution_mode,transport,operations,output_fields,adapter_sha256)
      VALUES ('tenant_upload_document',1,'fixture','none','["parse"]','["text_chunk"]','${HASH_A}');
      INSERT INTO public.connector_accounts
        (id,tenant_id,workspace_id,source_card_id,connector_version,account_key,status)
      VALUES ('account-document','${TENANT_A}','${WORKSPACE_A}','tenant_upload_document',1,
        'fixture-document','fixture_only');
      INSERT INTO public.source_policy_versions(
        id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,policy_key,
        version,state,execution_mode,terms_state,allowed_operations,allowed_fields,hard_cap_units,policy_sha256)
      VALUES ('policy-document-no-attestation','${TENANT_A}','${WORKSPACE_A}','tenant_upload_document',1,
        'account-document','document-policy',1,'active','fixture','approved','["parse"]',
        '["text_chunk"]',4,'${HASH_B}')`);
    await expect(admin.unsafe(`INSERT INTO public.current_source_policy_activations(
      id,tenant_id,workspace_id,policy_key,policy_version,source_policy_id,
      activated_by_hash,activation_reason
    ) VALUES ('activation-document-no-attestation','${TENANT_A}','${WORKSPACE_A}',
      'document-policy',1,'policy-document-no-attestation','${HASH_C}',
      'must reject missing required attestation')`))
      .rejects.toMatchObject({ code: "23514", message: expect.stringContaining("NOT_ELIGIBLE") });

    await admin.unsafe(`INSERT INTO public.source_policy_versions(
      id,tenant_id,workspace_id,source_card_id,connector_version,connector_account_id,policy_key,
      version,state,execution_mode,terms_state,allowed_operations,allowed_fields,hard_cap_units,
      attestation_expires_at,policy_sha256
    ) VALUES ('policy-expiring','${TENANT_A}','${WORKSPACE_A}','google_places_legacy',1,'account-a',
      'expiring-policy',1,'active','fixture','approved','["search_text"]','["place_id"]',4,
      pg_catalog.statement_timestamp()+interval '1 second','${HASH_B}')`);
    await admin.unsafe(`INSERT INTO public.current_source_policy_activations(
      id,tenant_id,workspace_id,policy_key,policy_version,source_policy_id,
      activated_by_hash,activation_reason
    ) VALUES ('activation-expiring','${TENANT_A}','${WORKSPACE_A}','expiring-policy',1,
      'policy-expiring','${HASH_C}','short-lived attestation regression')`);
    await admin.unsafe("SELECT pg_catalog.pg_sleep(1.1)");
    await expect(admin.unsafe(runSql("run-expired-policy", "policy-expiring")))
      .rejects.toMatchObject({ code: "23514", message: expect.stringContaining("POLICY_NOT_ELIGIBLE") });
  });

  it("blocks unselected runs and makes one-way revocation immediate and auditable", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(runSql("run-selected-v1", "policy-a-v1"));
    await expect(admin.unsafe(runSql("run-unselected-v2", "policy-a-v2")))
      .rejects.toMatchObject({ code: "23514", message: expect.stringContaining("CURRENT_SOURCE_POLICY_REQUIRED") });

    await admin.unsafe(`UPDATE public.current_source_policy_activations SET
      revoked_at='2000-01-01T00:00:00Z',revoked_by_hash='${HASH_A}',revocation_reason='operator revoked policy'
      WHERE id='activation-a-v1'`);
    await expect(admin.unsafe(runSql("run-revoked-v1", "policy-a-v1")))
      .rejects.toMatchObject({ code: "23514", message: expect.stringContaining("CURRENT_SOURCE_POLICY_REQUIRED") });
    await admin.unsafe(activationSql("activation-a-v2", "policy-a-v2", 2));
    await admin.unsafe(runSql("run-selected-v2", "policy-a-v2"));
    await expect(admin.unsafe(runSql("run-stale-v1", "policy-a-v1"))).rejects.toMatchObject({ code: "23514" });

    const history = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT id,policy_version,revoked_at IS NOT NULL AS revoked,revoked_by_hash,revocation_reason
      FROM public.current_source_policy_activations
      WHERE tenant_id='${TENANT_A}' AND policy_key='fixture-policy' ORDER BY policy_version`);
    expect(history).toEqual([
      { id: "activation-a-v1", policy_version: 1, revoked: true, revoked_by_hash: HASH_A,
        revocation_reason: "operator revoked policy" },
      { id: "activation-a-v2", policy_version: 2, revoked: false, revoked_by_hash: null,
        revocation_reason: null },
    ]);
    await expect(admin.unsafe("DELETE FROM public.current_source_policy_activations WHERE id='activation-a-v1'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(admin.unsafe(`UPDATE public.current_source_policy_activations SET policy_version=1
      WHERE id='activation-a-v2'`)).rejects.toMatchObject({ code: "P0001" });
    await expect(admin.unsafe("UPDATE public.source_policy_versions SET state='revoked' WHERE id='policy-a-v1'"))
      .rejects.toMatchObject({ code: "P0001" });
  });

  it("linearizes concurrent revocation before a waiting run authorization", async () => {
    if (!admin || !competitor) throw new Error("test database unavailable");
    let markRevocationLocked: (() => void) | undefined;
    let releaseRevocation: (() => void) | undefined;
    const revocationLocked = new Promise<void>((resolve) => { markRevocationLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseRevocation = resolve; });
    const revocation = admin.begin(async (sql) => {
      await sql.unsafe(`UPDATE public.current_source_policy_activations SET
        revoked_at=pg_catalog.statement_timestamp(),revoked_by_hash='${HASH_B}',
        revocation_reason='concurrent operator revocation' WHERE id='activation-a-v2'`);
      markRevocationLocked?.();
      await release;
    });
    await revocationLocked;

    let runState: "pending" | "allowed" | "blocked" = "pending";
    const runAttempt = competitor.unsafe(runSql("run-concurrent-after-revoke", "policy-a-v2"))
      .then(() => { runState = "allowed" as const; return null; })
      .catch((error: unknown) => { runState = "blocked" as const; return error; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stateWhileRevocationOpen = runState;
    releaseRevocation?.();
    await revocation;
    const error = await runAttempt;
    expect(stateWhileRevocationOpen).toBe("pending");
    expect(runState).toBe("blocked");
    expect(error).toMatchObject({ code: "23514", message: expect.stringContaining("CURRENT_SOURCE_POLICY_REQUIRED") });
  });
});
