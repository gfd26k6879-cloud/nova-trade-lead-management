import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F06_AGENT_RUNTIME_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829210000_add_agent_runtime_foundation.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f06_agent_runtime_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-000000000061";
const TENANT_B = "00000000-0000-4000-8000-000000000062";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000061";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000062";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const TABLES = [
  "agent_prompt_versions", "agent_policy_versions", "agent_runs",
  "agent_run_lease_history", "agent_run_steps", "agent_tool_calls",
  "agent_usage_reservations", "agent_usage_settlements",
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
    .filter((file) => file.endsWith(".sql"))
    .sort();
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

async function seedFoundation(sql: Sql): Promise<void> {
  await sql.unsafe(`
    INSERT INTO public.tenants (id, slug, name, status) VALUES
      ('${TENANT_A}', 'f06-a', 'F06 Tenant A', 'active'),
      ('${TENANT_B}', 'f06-b', 'F06 Tenant B', 'active');
    INSERT INTO public.workspaces (id, tenant_id, slug, name, status) VALUES
      ('${WORKSPACE_A}', '${TENANT_A}', 'f06-workspace-a', 'F06 Workspace A', 'active'),
      ('${WORKSPACE_B}', '${TENANT_B}', 'f06-workspace-b', 'F06 Workspace B', 'active');
    INSERT INTO public.agent_prompt_versions
      (prompt_key, version, instructions_ref, instructions_sha256, allowed_tools, allowed_classifications)
    VALUES ('business-understanding', 1, 'prompts/business-understanding/1', '${HASH_A}', '["lookup"]', '["tenant_business_materials"]');
    INSERT INTO public.agent_policy_versions
      (policy_key, version, provider, model, state, policy_sha256, allowed_tools, allowed_classifications)
    VALUES ('fixture-policy', 1, 'fixture', 'openai-responses-stub', 'fixture', '${HASH_B}', '["lookup"]', '["tenant_business_materials"]');
  `);
}

function queuedRun(id: string, tenantId: string, workspaceId: string | null, key: string): string {
  return `INSERT INTO public.agent_runs (
    id, tenant_id, workspace_id, idempotency_key, input_hash, agent_role, agent_version,
    prompt_key, prompt_version, policy_key, policy_version, budget_usd, max_attempts,
    created_at, updated_at
  ) VALUES (
    '${id}', '${tenantId}', ${workspaceId ? `'${workspaceId}'` : "NULL"}, '${key}',
    'sha256:fixture-a', 'business-understanding', 1,
    'business-understanding', 1, 'fixture-policy', 1, 0.25, 3,
    '2026-08-29T12:00:00Z', '2026-08-29T12:00:00Z'
  )`;
}

describe.skipIf(!RUN)("F-06 durable agent-runtime PostgreSQL foundation", () => {
  beforeAll(async () => {
    container = `novatrade-f06-${randomUUID()}`;
    docker([
      "run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16,
    ]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const [{ version }] = await admin.unsafe<Array<{ version: string }>>(
      "SELECT current_setting('server_version_num') AS version",
    );
    expect(version.startsWith("16")).toBe(true);
    await replayAllMigrations(admin);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    await seedFoundation(admin);

    const runtimeRole = `f06_runtime_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'f06-runtime' NOSUPERUSER NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${TABLES.map((table) => `public.${table}`).join(", ")} TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT USAGE ON SEQUENCE public.agent_run_lease_history_id_seq TO "${runtimeRole}"`);
    runtime = postgres(
      `postgres://${runtimeRole}:f06-runtime@127.0.0.1:${port}/${DATABASE}`,
      { max: 1, prepare: false, ssl: false, onnotice: () => undefined },
    );
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("replays without changing data and installs the exact deny-by-default catalog", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    const before = await admin.unsafe("SELECT prompt_key, version FROM public.agent_prompt_versions ORDER BY prompt_key, version");
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    const after = await admin.unsafe("SELECT prompt_key, version FROM public.agent_prompt_versions ORDER BY prompt_key, version");
    expect(after).toEqual(before);

    const catalog = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
             (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
             pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') anon_select,
             pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') authenticated_select
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1)
      ORDER BY c.relname
    `, [TABLES]);
    expect(catalog).toHaveLength(8);
    for (const row of catalog) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, policy_count: 0, anon_select: false, authenticated_select: false });
    }

    const runtimeIdentity = await runtime.unsafe<Array<Record<string, unknown>>>(
      "SELECT r.rolsuper, r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname=current_user",
    );
    expect(runtimeIdentity).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    await expect(runtime.unsafe("SELECT id FROM public.agent_runs")).resolves.toEqual([]);
    await expect(runtime.unsafe(queuedRun("runtime-denied", TENANT_A, null, "runtime-denied")))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("enforces scoped idempotency, registry references, and immutable execution identity", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(queuedRun("run-a", TENANT_A, null, "understanding:fixture:v1"));
    await expect(admin.unsafe(queuedRun("run-duplicate", TENANT_A, null, "understanding:fixture:v1")))
      .rejects.toMatchObject({ code: "23505" });
    await expect(admin.unsafe(queuedRun("run-cross-workspace", TENANT_A, WORKSPACE_B, "cross-workspace")))
      .rejects.toMatchObject({ code: "23503" });
    await admin.unsafe(queuedRun("run-b", TENANT_B, null, "understanding:fixture:v1"));
    await admin.unsafe(queuedRun("run-workspace-a", TENANT_A, WORKSPACE_A, "understanding:fixture:v1"));

    await expect(admin.unsafe("UPDATE public.agent_runs SET input_hash='changed', updated_at='2026-08-29T12:00:01Z' WHERE id='run-a'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(admin.unsafe("UPDATE public.agent_prompt_versions SET instructions_sha256=$1 WHERE prompt_key='business-understanding'", [HASH_C]))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(admin.unsafe(queuedRun("run-missing-registry", TENANT_A, null, "missing-registry").replace("'business-understanding', 1, 'fixture-policy'", "'missing-prompt', 1, 'fixture-policy'")))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("fences stale leases, preserves lease history, and rejects invalid state facts", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(`UPDATE public.agent_runs SET
      status='running', attempt_count=1, lease_generation=1,
      lease_token_hash='${HASH_A}', lease_worker_hash='${HASH_B}',
      lease_acquired_at='2026-08-29T12:01:00Z', lease_heartbeat_at='2026-08-29T12:01:00Z',
      lease_expires_at='2026-08-29T12:02:00Z', started_at='2026-08-29T12:01:00Z',
      updated_at='2026-08-29T12:01:00Z' WHERE id='run-a'`);
    await admin.unsafe(`UPDATE public.agent_runs SET
      lease_heartbeat_at='2026-08-29T12:01:20Z', lease_expires_at='2026-08-29T12:02:20Z',
      updated_at='2026-08-29T12:01:20Z' WHERE id='run-a'`);
    await admin.unsafe(`UPDATE public.agent_runs SET status='retry_wait',
      lease_token_hash=NULL, lease_worker_hash=NULL, lease_acquired_at=NULL,
      lease_heartbeat_at=NULL, lease_expires_at=NULL,
      next_attempt_at='2026-08-29T12:03:00Z', error_code='TRANSIENT_PROVIDER',
      updated_at='2026-08-29T12:01:30Z' WHERE id='run-a'`);
    await admin.unsafe(`UPDATE public.agent_runs SET status='running', attempt_count=2, lease_generation=2,
      lease_token_hash='${HASH_C}', lease_worker_hash='${HASH_A}',
      lease_acquired_at='2026-08-29T12:03:00Z', lease_heartbeat_at='2026-08-29T12:03:00Z',
      lease_expires_at='2026-08-29T12:04:00Z', next_attempt_at=NULL, error_code=NULL,
      updated_at='2026-08-29T12:03:00Z' WHERE id='run-a'`);

    const stale = await admin.unsafe(`UPDATE public.agent_runs SET status='complete',
      lease_token_hash=NULL, lease_worker_hash=NULL, lease_acquired_at=NULL,
      lease_heartbeat_at=NULL, lease_expires_at=NULL,
      result_ref='artifact:stale', ended_at='2026-08-29T12:03:10Z',
      usage_cost_usd=0.04, updated_at='2026-08-29T12:03:10Z'
      WHERE id='run-a' AND lease_generation=1 AND lease_token_hash='${HASH_A}' RETURNING id`);
    expect(stale).toEqual([]);

    const completed = await admin.unsafe(`UPDATE public.agent_runs SET status='complete',
      lease_token_hash=NULL, lease_worker_hash=NULL, lease_acquired_at=NULL,
      lease_heartbeat_at=NULL, lease_expires_at=NULL,
      result_ref='artifact:understanding-1', ended_at='2026-08-29T12:03:10Z',
      usage_cost_usd=0.04, updated_at='2026-08-29T12:03:10Z'
      WHERE id='run-a' AND lease_generation=2 AND lease_token_hash='${HASH_C}' RETURNING id`);
    expect(completed).toEqual([{ id: "run-a" }]);

    const history = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT lease_generation, lease_token_hash, released_at IS NOT NULL released,
             release_reason FROM public.agent_run_lease_history WHERE run_id='run-a' ORDER BY lease_generation
    `);
    expect(history).toEqual([
      expect.objectContaining({ lease_generation: 1, lease_token_hash: HASH_A, released: true, release_reason: "retry_wait" }),
      expect.objectContaining({ lease_generation: 2, lease_token_hash: HASH_C, released: true, release_reason: "complete" }),
    ]);
    await expect(admin.unsafe("UPDATE public.agent_runs SET status='queued', updated_at='2026-08-29T12:04:00Z' WHERE id='run-a'"))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(admin.unsafe(queuedRun("bad-budget", TENANT_A, null, "bad-budget").replace("0.25, 3", "-1, 3")))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("binds steps, tool parents, reservations, and settlements to one exact run scope", async () => {
    if (!admin) throw new Error("test database unavailable");
    await admin.unsafe(`INSERT INTO public.agent_run_steps
      (id, tenant_id, workspace_id, run_id, sequence, status, policy_key, policy_version, result_ref, recorded_at)
      VALUES ('step-a', '${TENANT_A}', '${WORKSPACE_A}', 'run-workspace-a', 1, 'complete', 'fixture-policy', 1, 'artifact:step-a', '2026-08-29T12:01:00Z')`);
    await expect(admin.unsafe(`INSERT INTO public.agent_run_steps
      (id, tenant_id, workspace_id, run_id, sequence, status, policy_key, policy_version, result_ref, recorded_at)
      VALUES ('step-cross', '${TENANT_B}', NULL, 'run-workspace-a', 2, 'complete', 'fixture-policy', 1, 'artifact:step-cross', '2026-08-29T12:01:00Z')`))
      .rejects.toMatchObject({ code: "23514" });

    await admin.unsafe(`INSERT INTO public.agent_tool_calls
      (id, tenant_id, workspace_id, run_id, step_id, tool_name, tool_version, permission_decision,
       status, input_hash, output_hash, source_ids, cost_usd, latency_ms, redacted_summary, recorded_at)
      VALUES ('call-a', '${TENANT_A}', '${WORKSPACE_A}', 'run-workspace-a', 'step-a', 'lookup', '1',
       'allowed', 'complete', 'sha256:tool-input', 'sha256:tool-output', '["source-1"]', 0.01, 8,
       'lookup completed', '2026-08-29T12:01:01Z')`);
    await expect(admin.unsafe(`INSERT INTO public.agent_tool_calls
      (id, tenant_id, workspace_id, run_id, step_id, tool_name, tool_version, permission_decision,
       status, input_hash, output_hash, source_ids, cost_usd, latency_ms, redacted_summary, recorded_at)
      VALUES ('call-cross-step', '${TENANT_B}', NULL, 'run-b', 'step-a', 'lookup', '1',
       'allowed', 'complete', 'sha256:tool-input', 'sha256:tool-output', '[]', 0, 1,
       'lookup completed', '2026-08-29T12:01:01Z')`))
      .rejects.toMatchObject({ code: "23514" });

    await admin.unsafe(`INSERT INTO public.agent_usage_reservations
      (id, tenant_id, workspace_id, run_id, idempotency_key, input_hash, reserved_cost_usd,
       reserved_input_tokens, reserved_output_tokens, created_at)
      VALUES ('reservation-a', '${TENANT_A}', '${WORKSPACE_A}', 'run-workspace-a', 'provider-call-1',
       'sha256:reservation', 0.05, 100, 50, '2026-08-29T12:01:00Z')`);
    await expect(admin.unsafe(`INSERT INTO public.agent_usage_settlements
      (id, tenant_id, workspace_id, run_id, reservation_id, status, actual_cost_usd,
       input_tokens, output_tokens, settled_at)
      VALUES ('settlement-over', '${TENANT_A}', '${WORKSPACE_A}', 'run-workspace-a',
       'reservation-a', 'settled', 0.06, 90, 40, '2026-08-29T12:01:02Z')`))
      .rejects.toMatchObject({ code: "23514" });
    await admin.unsafe(`INSERT INTO public.agent_usage_settlements
      (id, tenant_id, workspace_id, run_id, reservation_id, status, actual_cost_usd,
       input_tokens, output_tokens, provider_request_ref_hash, settled_at)
      VALUES ('settlement-a', '${TENANT_A}', '${WORKSPACE_A}', 'run-workspace-a',
       'reservation-a', 'settled', 0.04, 90, 40, '${HASH_B}', '2026-08-29T12:01:02Z')`);
    await expect(admin.unsafe("UPDATE public.agent_run_steps SET result_ref='artifact:changed' WHERE id='step-a'"))
      .rejects.toMatchObject({ code: "P0001" });
  });
});
