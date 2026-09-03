import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { closeDb } from "@/lib/db";
import { createWorkerLeaseIssuerRuntime } from "@/lib/tenancy/worker-lease-runtime";
import type { AcquireTenantWorkerLeaseInput } from "@/lib/tenancy/worker-lease-store";
import type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";
import { INTERNAL_WORKER_ACTIONS, type InternalWorkerAction } from "@/lib/internal-worker-auth";
import { POST as processNextRoute } from "@/app/api/crawl/process-next/route";
import { POST as enrichNextRoute } from "@/app/api/crawl/enrich-next/route";
import { POST as verifyNextRoute } from "@/app/api/ai/verify-next/route";
import { POST as artifactNextRoute } from "@/app/api/ai/artifacts/process-next/route";
import { POST as recomputeStaleRoute } from "@/app/api/scores/recompute-stale/route";

const RUN = process.env.L01_WORKER_ROUTES_RUN_DISPOSABLE_TESTS === "1";
const EXPECTED_DATABASE = "l01_worker_routes_rehearsal";
const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "11000000-0000-4000-8000-000000000001";
const CRON_SECRET = "l01-rehearsal-worker-secret";
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

const ROUTES = [
  { workerName: "crawl", action: "crawl:process", path: "/api/crawl/process-next", call: processNextRoute },
  { workerName: "enrichment", action: "enrichment:process", path: "/api/crawl/enrich-next", call: enrichNextRoute },
  { workerName: "ai_verification", action: "ai_verification:process", path: "/api/ai/verify-next", call: verifyNextRoute },
  { workerName: "artifact", action: "artifact:process", path: "/api/ai/artifacts/process-next", call: artifactNextRoute },
  { workerName: "score_recompute", action: "score_recompute:recompute", path: "/api/scores/recompute-stale", call: recomputeStaleRoute },
] as const;

const ACCEPTABLE_STATUSES = new Set(["idle", "processed", "done", "disabled"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_PATTERN = /^l01_[a-z0-9_]{4,40}$/;

let admin: Sql | undefined;
let originalDatabaseUrl: string | undefined;
let originalDatabaseSsl: string | undefined;
let originalCronSecret: string | undefined;
const provisionedRoles: string[] = [];

function requireLoopbackUrl(name: string, expectedPath: string | null): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  const parsed = new URL(value);
  if (!["127.0.0.1", "::1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`${name} must target a loopback host`);
  }
  if (expectedPath !== null && parsed.pathname !== `/${EXPECTED_DATABASE}`) {
    throw new Error(`${name} must target the exact disposable database ${EXPECTED_DATABASE}`);
  }
  return value;
}

function requireRoleCredentials(name: string): { role: string; password: string } {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  const parsed = new URL(value);
  if (!["127.0.0.1", "::1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`${name} must target a loopback host`);
  }
  const role = decodeURIComponent(parsed.username);
  if (!ROLE_PATTERN.test(role)) throw new Error(`${name} role must match ${ROLE_PATTERN}`);
  const password = decodeURIComponent(parsed.password);
  if (!password) throw new Error(`${name} must carry a password`);
  return { role, password };
}

async function replayMigrations(sql: Sql): Promise<void> {
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  await sql.unsafe("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)");
  await sql.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF; END $$`);
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
    await sql.unsafe(readFileSync(join("supabase/migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") {
      await sql.unsafe(`ALTER TABLE public.settings
        ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1`);
    }
  }
  expect({ discovered: migrations.length, applied, skipped: SKIPPED.size })
    .toEqual({ discovered: 65, applied: 63, skipped: 2 });
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function provisionRestrictedRoles(sql: Sql, entries: Array<{ role: string; password: string; grants: string[] }>): Promise<void> {
  for (const { role, password, grants } of entries) {
    provisionedRoles.push(role);
    await sql.unsafe(`DROP ROLE IF EXISTS "${role}"`);
    await sql.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    for (const grant of grants) await sql.unsafe(`GRANT EXECUTE ON FUNCTION ${grant} TO "${role}"`);
    await sql.unsafe(`REVOKE ALL ON TABLE public.tenant_worker_dispatch_leases FROM "${role}"`);
  }
}

async function seedFoundation(sql: Sql): Promise<void> {
  await sql.unsafe(`
    INSERT INTO public.tenants (id, slug, name, status) VALUES ('${TENANT_ID}', 'l01-local', 'L01 Local', 'active');
    INSERT INTO public.workspaces (id, tenant_id, slug, name, status)
      VALUES ('${WORKSPACE_ID}', '${TENANT_ID}', 'main', 'Main', 'active');
    UPDATE public.settings SET tenant_id = '${TENANT_ID}' WHERE id = 1;`);
}

function postRequest(path: string, selector: string): NextRequest {
  return new NextRequest(`https://l01.local${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
      "x-internal-worker-selector": selector,
    },
    body: "{}",
  });
}

function leaseInput(workerName: SchedulerWorkerName): AcquireTenantWorkerLeaseInput {
  const now = Date.now();
  const action: InternalWorkerAction = INTERNAL_WORKER_ACTIONS[workerName];
  return {
    tenantId: TENANT_ID,
    workspaceId: null,
    jobId: randomUUID(),
    runId: randomUUID(),
    leaseGeneration: 1,
    workerName,
    action,
    notBefore: new Date(now - 5_000).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    correlationId: `l01:${workerName}`,
  };
}

describe.skipIf(!RUN)("L-01 local worker route rehearsal on PostgreSQL 16", () => {
  beforeAll(async () => {
    const adminUrl = requireLoopbackUrl("L01_WORKER_ROUTES_ADMIN_DATABASE_URL", EXPECTED_DATABASE);
    if (!UUID_PATTERN.test(TENANT_ID) || !UUID_PATTERN.test(WORKSPACE_ID)) throw new Error("seed identity constants are invalid");

    const issuerCreds = requireRoleCredentials("TENANT_WORKER_LEASE_ISSUER_DATABASE_URL");
    const resolverCreds = requireRoleCredentials("TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL");
    if (issuerCreds.role === resolverCreds.role) throw new Error("issuer and resolver roles must differ");
    const normalizedAdmin = new URL(adminUrl);
    if (issuerCreds.role === normalizedAdmin.username || resolverCreds.role === normalizedAdmin.username) {
      throw new Error("lease roles must not reuse the admin connection role");
    }

    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const receipt = await admin.unsafe<Array<{ database_name: string; version: string }>>(
      "SELECT current_database() AS database_name, current_setting('server_version_num') AS version",
    );
    expect(receipt[0]).toMatchObject({ database_name: EXPECTED_DATABASE });
    expect(receipt[0]?.version.startsWith("16")).toBe(true);

    await replayMigrations(admin);
    await provisionRestrictedRoles(admin, [
      { role: issuerCreds.role, password: issuerCreds.password, grants: [
        "public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)",
        "public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)",
      ] },
      { role: resolverCreds.role, password: resolverCreds.password, grants: [
        "public.novatrade_resolve_tenant_worker_lease(text,text,text)",
      ] },
    ]);
    await seedFoundation(admin);

    originalDatabaseUrl = process.env.DATABASE_URL;
    originalDatabaseSsl = process.env.DATABASE_SSL;
    originalCronSecret = process.env.WORKER_CRON_SECRET;
    process.env.DATABASE_URL = adminUrl;
    process.env.DATABASE_SSL = "disable";
    process.env.WORKER_CRON_SECRET = CRON_SECRET;
    await closeDb();
  }, 180_000);

  afterAll(async () => {
    await closeDb();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDatabaseSsl === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = originalDatabaseSsl;
    if (originalCronSecret === undefined) delete process.env.WORKER_CRON_SECRET;
    else process.env.WORKER_CRON_SECRET = originalCronSecret;
    if (admin) {
      for (const role of provisionedRoles) {
        await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
      }
      await admin.end({ timeout: 5 });
    }
  });

  it("runs all five worker routes through a real issuer-issued lease", async () => {
    if (!admin) throw new Error("test database unavailable");
    const issuerRuntime = createWorkerLeaseIssuerRuntime();

    for (const route of ROUTES) {
      const input = leaseInput(route.workerName);
      const acquired = await issuerRuntime.acquire(input);
      expect(acquired, `${route.path} should acquire a lease`).not.toBeNull();
      if (!acquired) continue;
      expect(acquired.kind).toBe("created");
      expect(acquired.record.workerName).toBe(route.workerName);
      expect(acquired.record.action).toBe(route.action);

      const response = await route.call(postRequest(route.path, acquired.record.selector));
      const body = await response.json();
      expect(response.status, `${route.path} received HTTP ${response.status}: ${JSON.stringify(body)}`).toBe(200);
      expect(ACCEPTABLE_STATUSES.has(body.status), `${route.path} unexpected status ${JSON.stringify(body)}`).toBe(true);
    }
  });

  it("resolves the exact acquired lease through the restricted resolver role", async () => {
    const { createFailClosedWorkerLeaseResolverRuntime } = await import("@/lib/tenancy/worker-lease-runtime");
    const issuerRuntime = createWorkerLeaseIssuerRuntime();
    const route = ROUTES[0] as (typeof ROUTES)[number];
    const input = leaseInput(route.workerName);
    const acquired = await issuerRuntime.acquire(input);
    if (!acquired) throw new Error("lease was not acquired");

    const resolveLease = createFailClosedWorkerLeaseResolverRuntime({ workerName: route.workerName, action: route.action });
    const record = await resolveLease(acquired.record.selector);
    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: null,
      workerName: route.workerName,
      action: route.action,
      correlationId: input.correlationId,
    });
  });

  it("fails closed for an unknown selector", async () => {
    const request = postRequest("/api/crawl/process-next", "l01-unknown-selector-value-000000000000000000000000000");
    const response = await processNextRoute(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker authorization failed",
    });
  });

  it("fails closed when a lease selector is presented to a different worker route", async () => {
    const issuerRuntime = createWorkerLeaseIssuerRuntime();
    const other = ROUTES[1] as (typeof ROUTES)[number];
    const input = leaseInput(other.workerName);
    const acquired = await issuerRuntime.acquire(input);
    if (!acquired) throw new Error("lease was not acquired");

    const response = await processNextRoute(postRequest("/api/crawl/process-next", acquired.record.selector));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker authorization failed",
    });
  });
});
