import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DbClient } from "@/lib/db";
import {
  createTenantWorkerLeaseIssuer,
  createTenantWorkerLeaseResolver,
} from "@/lib/tenancy/worker-lease-store";

const RUN_TESTS = process.env.F01_WORKER_DISPATCH_RUN_DISPOSABLE_TESTS === "1";
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f01_worker_dispatch_rehearsal";
const MIGRATION = "20260830030000_add_tenant_worker_dispatch_foundation.sql";
const ISSUER_ROLE = "f01_worker_dispatch_issuer";
const RESOLVER_ROLE = "f01_worker_dispatch_resolver";
const WORKER_ROLE = "f01_worker_dispatch_runtime";
const DEFINER_ROLE = "novatrade_worker_dispatch_definer";
const PASSWORD = "f01-worker-dispatch";

const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b1";
const WORKSPACE_A = "10000000-0000-4000-8000-0000000000a1";
const WORKSPACE_B = "10000000-0000-4000-8000-0000000000b1";
const JOB_A = "20000000-0000-4000-8000-0000000000a1";
const JOB_B = "20000000-0000-4000-8000-0000000000b1";
const RUN_A = "30000000-0000-4000-8000-0000000000a1";
const RUN_B = "30000000-0000-4000-8000-0000000000b1";
const LEASE_A1 = "40000000-0000-4000-8000-0000000000a1";
const LEASE_A2 = "40000000-0000-4000-8000-0000000000a2";
const LEASE_A3 = "40000000-0000-4000-8000-0000000000a3";
const LEASE_B1 = "40000000-0000-4000-8000-0000000000b1";
const SELECTOR_A1 = "selector-a-generation-1";
const SELECTOR_A2 = "selector-a-generation-2";
const SELECTOR_A3 = "selector-a-generation-3";
const SELECTOR_B1 = "selector-b-generation-1";

type LeaseInput = Readonly<{
  selector: string;
  tenantId: string;
  workspaceId: string | null;
  jobId: string;
  runId: string;
  leaseId: string;
  generation: number;
  workerName: "crawl" | "artifact";
  action: "crawl:process" | "artifact:process";
  notBefore: string;
  expiresAt: string;
  correlationId: string;
}>;

let container = "";
let admin: Sql | undefined;
let issuer: Sql | undefined;
let resolver: Sql | undefined;
let worker: Sql | undefined;
let leaseA1: LeaseInput;
let leaseB1: LeaseInput;

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
    if (docker(["exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DATABASE, "-Atc", "SELECT 1"], true) === "1") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`PostgreSQL did not become ready: ${docker(["logs", name], true)}`);
}

function hashSelector(selector: string): string {
  return createHash("sha256").update(selector).digest("hex");
}

function lease(overrides: Partial<LeaseInput> = {}): LeaseInput {
  const now = Date.now();
  return {
    selector: SELECTOR_A1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    jobId: JOB_A,
    runId: RUN_A,
    leaseId: LEASE_A1,
    generation: 1,
    workerName: "crawl",
    action: "crawl:process",
    notBefore: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    correlationId: "dispatch-a",
    ...overrides,
  };
}

async function acquire(db: Sql, input: LeaseInput): Promise<Array<Record<string, unknown>>> {
  return db.unsafe(`SELECT kind,tenant_id::text,workspace_id::text,job_id::text,run_id::text,
    lease_id::text,lease_generation::text,worker_name,action,correlation_id
    FROM public.novatrade_acquire_tenant_worker_lease($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
    hashSelector(input.selector), input.tenantId, input.workspaceId, input.jobId, input.runId,
    input.leaseId, String(input.generation), input.workerName, input.action,
    input.notBefore, input.expiresAt, input.correlationId,
  ]) as unknown as Promise<Array<Record<string, unknown>>>;
}

async function resolveLease(
  db: Sql,
  selector: string,
  workerName: string,
  action: string,
): Promise<Array<Record<string, unknown>>> {
  return db.unsafe(`SELECT tenant_id::text,workspace_id::text,job_id::text,run_id::text,
    lease_id::text,lease_generation::text,worker_name,action,status
    FROM public.novatrade_resolve_tenant_worker_lease($1,$2,$3)`, [
    hashSelector(selector), workerName, action,
  ]) as unknown as Promise<Array<Record<string, unknown>>>;
}

async function cancelLease(db: Sql, input: LeaseInput): Promise<Array<Record<string, unknown>>> {
  return db.unsafe(`SELECT kind,tenant_id::text,workspace_id::text,job_id::text,run_id::text,
    lease_id::text,lease_generation::text,worker_name,action,correlation_id,revocation_reason
    FROM public.novatrade_cancel_tenant_worker_lease($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
    hashSelector(input.selector), input.tenantId, input.workspaceId, input.jobId, input.runId,
    input.leaseId, String(input.generation), input.workerName, input.action,
    input.notBefore, input.expiresAt, input.correlationId,
  ]) as unknown as Promise<Array<Record<string, unknown>>>;
}

function dbClient(sql: Sql): DbClient {
  return {
    prepare(query: string) {
      let parameter = 0;
      const pgQuery = query.replaceAll("?", () => `$${++parameter}`);
      const execute = async (params: unknown[]) => sql.unsafe(pgQuery, params as never[]);
      return {
        get: async <T = Record<string, unknown>>(...params: unknown[]) => {
          const rows = await execute(params);
          return rows[0] as T | undefined;
        },
        all: async <T = Record<string, unknown>>(...params: unknown[]) => {
          const rows = await execute(params);
          return rows as unknown as T[];
        },
        run: async (...params: unknown[]) => {
          const rows = await execute(params);
          return { changes: rows.count ?? 0 };
        },
      };
    },
    exec: async (query: string) => {
      await sql.unsafe(query);
    },
  };
}

async function installWorkerContext(tx: TransactionSql, input: LeaseInput, overrides: Record<string, string> = {}): Promise<void> {
  const settings: Record<string, string> = {
    "app.tenant_id": input.tenantId,
    "app.workspace_id": input.workspaceId ?? "",
    "app.actor_id": "",
    "app.membership_id": "",
    "app.role": "",
    "app.role_binding_id": "",
    "app.support_grant_id": "",
    "app.job_id": input.jobId,
    "app.run_id": input.runId,
    "app.lease_id": input.leaseId,
    "app.lease_generation": String(input.generation),
    "app.worker_name": input.workerName,
    "app.worker_action": input.action,
    "app.worker_principal_kind": "cron",
    "app.correlation_id": input.correlationId,
    ...overrides,
  };
  for (const [name, value] of Object.entries(settings)) {
    await tx.unsafe("SELECT pg_catalog.set_config($1,$2,true)", [name, value]);
  }
}

async function inWorkerContext<T>(input: LeaseInput, overrides: Record<string, string>, callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
  if (!worker) throw new Error("worker runtime unavailable");
  return (await worker.begin(async (tx) => {
    await installWorkerContext(tx, input, overrides);
    return callback(tx);
  })) as T;
}

describe.skipIf(!RUN_TESTS)("F-01 tenant worker dispatch foundation", () => {
  beforeAll(async () => {
    container = `novatrade-f01-worker-${randomUUID()}`;
    docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    await admin.unsafe("DO $$ BEGIN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; END $$");
    for (const migration of [
      "202607270001_add_tenants_table.sql",
      "202607270002_add_workspaces_table.sql",
      MIGRATION,
    ]) await admin.unsafe(readFileSync(join("supabase", "migrations", migration), "utf8"));
    await admin.unsafe(`
      INSERT INTO public.tenants(id,slug,name,status) VALUES
        ('${TENANT_A}','worker-a','Worker A','active'),('${TENANT_B}','worker-b','Worker B','active');
      INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
        ('${WORKSPACE_A}','${TENANT_A}','main','Main A','active'),
        ('${WORKSPACE_B}','${TENANT_B}','main','Main B','active');
      CREATE ROLE ${ISSUER_ROLE} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${RESOLVER_ROLE} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${WORKER_ROLE} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ${ISSUER_ROLE},${RESOLVER_ROLE},${WORKER_ROLE};
      GRANT EXECUTE ON FUNCTION public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) TO ${ISSUER_ROLE};
      GRANT EXECUTE ON FUNCTION public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text) TO ${ISSUER_ROLE};
      GRANT EXECUTE ON FUNCTION public.novatrade_resolve_tenant_worker_lease(text,text,text) TO ${RESOLVER_ROLE};
      GRANT EXECUTE ON FUNCTION public.novatrade_validate_tenant_worker_lease() TO ${WORKER_ROLE};
      GRANT SELECT ON TABLE public.tenant_worker_dispatch_leases TO ${WORKER_ROLE};
    `);
    const roleUrl = (role: string) => `postgres://${role}:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;
    issuer = postgres(roleUrl(ISSUER_ROLE), { max: 2, prepare: false, ssl: false, onnotice: () => undefined });
    resolver = postgres(roleUrl(RESOLVER_ROLE), { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    worker = postgres(roleUrl(WORKER_ROLE), { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    leaseA1 = lease();
    leaseB1 = lease({
      selector: SELECTOR_B1, tenantId: TENANT_B, workspaceId: WORKSPACE_B,
      jobId: JOB_B, runId: RUN_B, leaseId: LEASE_B1, correlationId: "dispatch-b",
    });
  }, 120_000);

  afterAll(async () => {
    await worker?.end({ timeout: 1 });
    await resolver?.end({ timeout: 1 });
    await issuer?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("installs forced RLS and narrowly closed table/function privileges", async () => {
    if (!admin || !issuer || !resolver) throw new Error("database unavailable");
    expect(await admin.unsafe(`SELECT relrowsecurity,relforcerowsecurity,
      (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
      pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
      pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select
      FROM pg_catalog.pg_class c WHERE c.oid='public.tenant_worker_dispatch_leases'::regclass`))
      .toEqual([{ relrowsecurity: true, relforcerowsecurity: true, policy_count: 2, anon_select: false, authenticated_select: false }]);
    await expect(issuer.unsafe("SELECT * FROM public.tenant_worker_dispatch_leases")).rejects.toMatchObject({ code: "42501" });
    await expect(resolver.unsafe("SELECT * FROM public.tenant_worker_dispatch_leases")).rejects.toMatchObject({ code: "42501" });
    expect(await admin.unsafe(`SELECT
      pg_catalog.has_function_privilege('anon','public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') anon_acquire,
      pg_catalog.has_function_privilege('authenticated','public.novatrade_resolve_tenant_worker_lease(text,text,text)','EXECUTE') authenticated_resolve,
      pg_catalog.has_function_privilege('${ISSUER_ROLE}','public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') issuer_acquire,
      pg_catalog.has_function_privilege('${ISSUER_ROLE}','public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') issuer_cancel,
      pg_catalog.has_function_privilege('${ISSUER_ROLE}','public.novatrade_resolve_tenant_worker_lease(text,text,text)','EXECUTE') issuer_resolve,
      pg_catalog.has_function_privilege('${ISSUER_ROLE}','public.novatrade_validate_tenant_worker_lease()','EXECUTE') issuer_validate,
      pg_catalog.has_function_privilege('${RESOLVER_ROLE}','public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') resolver_acquire,
      pg_catalog.has_function_privilege('${RESOLVER_ROLE}','public.novatrade_resolve_tenant_worker_lease(text,text,text)','EXECUTE') resolver_resolve`))
      .toEqual([{
        anon_acquire: false, authenticated_resolve: false,
        issuer_acquire: true, issuer_cancel: true, issuer_resolve: false, issuer_validate: false,
        resolver_acquire: false, resolver_resolve: true,
      }]);
    expect(await admin.unsafe(`SELECT rolcanlogin,rolsuper,rolinherit,rolbypassrls
      FROM pg_catalog.pg_roles WHERE rolname='${DEFINER_ROLE}'`))
      .toEqual([{ rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: true }]);
    expect(await admin.unsafe(`SELECT count(*)::integer membership_count
      FROM pg_catalog.pg_auth_members m
      WHERE m.roleid='${DEFINER_ROLE}'::regrole OR m.member='${DEFINER_ROLE}'::regrole`))
      .toEqual([{ membership_count: 0 }]);
    expect(await admin.unsafe(`SELECT rolname,rolsuper,rolbypassrls
      FROM pg_catalog.pg_roles WHERE rolname IN ('${ISSUER_ROLE}','${RESOLVER_ROLE}','${WORKER_ROLE}')
      ORDER BY rolname`)).toEqual([
        { rolname: ISSUER_ROLE, rolsuper: false, rolbypassrls: false },
        { rolname: RESOLVER_ROLE, rolsuper: false, rolbypassrls: false },
        { rolname: WORKER_ROLE, rolsuper: false, rolbypassrls: false },
      ]);
    expect(await admin.unsafe(`SELECT p.proname,r.rolname owner
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
      WHERE p.proname IN ('novatrade_acquire_tenant_worker_lease','novatrade_cancel_tenant_worker_lease',
        'novatrade_resolve_tenant_worker_lease','novatrade_validate_tenant_worker_lease')
      ORDER BY p.proname`))
      .toEqual([
        { proname: "novatrade_acquire_tenant_worker_lease", owner: DEFINER_ROLE },
        { proname: "novatrade_cancel_tenant_worker_lease", owner: DEFINER_ROLE },
        { proname: "novatrade_resolve_tenant_worker_lease", owner: DEFINER_ROLE },
        { proname: "novatrade_validate_tenant_worker_lease", owner: DEFINER_ROLE },
      ]);
  });

  it("exercises the TypeScript issuer and resolver stores through distinct restricted roles", async () => {
    if (!issuer || !resolver) throw new Error("database unavailable");
    const input = lease({
      selector: "selector-typescript-store-generation-1", leaseId: randomUUID(),
      jobId: randomUUID(), runId: randomUUID(), correlationId: "dispatch-typescript-store",
    });
    const leaseIssuer = createTenantWorkerLeaseIssuer({
      db: async () => dbClient(issuer as Sql),
      createSelector: () => input.selector,
      createLeaseId: () => input.leaseId,
    });
    const leaseResolver = createTenantWorkerLeaseResolver({ db: async () => dbClient(resolver as Sql) });
    const acquired = await leaseIssuer.acquire({
      tenantId: input.tenantId, workspaceId: input.workspaceId, jobId: input.jobId,
      runId: input.runId, leaseGeneration: input.generation, workerName: input.workerName,
      action: input.action, notBefore: input.notBefore, expiresAt: input.expiresAt,
      correlationId: input.correlationId,
    });
    expect(acquired).toEqual(expect.objectContaining({ kind: "created" }));
    await expect(leaseResolver.resolve(input.selector, { workerName: input.workerName, action: input.action }))
      .resolves.toEqual(expect.objectContaining({ leaseId: input.leaseId, tenantId: TENANT_A }));
    await expect(leaseIssuer.cancel(acquired?.record as never)).resolves.toEqual(expect.objectContaining({
      kind: "cancelled", leaseId: input.leaseId,
    }));
    await expect(leaseIssuer.cancel(acquired?.record as never)).resolves.toEqual(expect.objectContaining({ kind: "replay" }));
    await expect(leaseResolver.resolve(input.selector, { workerName: input.workerName, action: input.action }))
      .resolves.toBeNull();
  });

  it("acquires and resolves only exact tenant/action digest records without storing raw selectors", async () => {
    if (!issuer || !resolver || !admin) throw new Error("database unavailable");
    await expect(acquire(issuer, leaseA1)).resolves.toEqual([expect.objectContaining({ kind: "created", tenant_id: TENANT_A, job_id: JOB_A })]);
    await expect(acquire(issuer, leaseB1)).resolves.toEqual([expect.objectContaining({ kind: "created", tenant_id: TENANT_B, job_id: JOB_B })]);
    await expect(resolveLease(resolver, SELECTOR_A1, "crawl", "crawl:process"))
      .resolves.toEqual([expect.objectContaining({ tenant_id: TENANT_A, lease_id: LEASE_A1, status: "active" })]);
    await expect(resolveLease(resolver, SELECTOR_A1, "artifact", "artifact:process")).resolves.toEqual([]);
    const stored = JSON.stringify(await admin.unsafe("SELECT selector_hash FROM public.tenant_worker_dispatch_leases ORDER BY tenant_id"));
    expect(stored).not.toContain(SELECTOR_A1);
    expect(stored).not.toContain(SELECTOR_B1);
  });

  it("isolates tenant A/B and denies wrong job, action, malformed, or conflicting GUC contexts", async () => {
    await expect(inWorkerContext(leaseA1, {}, (tx) => tx.unsafe("SELECT lease_id::text FROM public.tenant_worker_dispatch_leases")))
      .resolves.toEqual([{ lease_id: LEASE_A1 }]);
    await expect(inWorkerContext(leaseB1, {}, (tx) => tx.unsafe("SELECT lease_id::text FROM public.tenant_worker_dispatch_leases")))
      .resolves.toEqual([{ lease_id: LEASE_B1 }]);
    const invalidContexts: Array<Record<string, string>> = [
      { "app.job_id": JOB_B },
      { "app.workspace_id": WORKSPACE_B },
      { "app.run_id": RUN_B },
      { "app.lease_id": LEASE_B1 },
      { "app.worker_action": "artifact:process" },
      { "app.tenant_id": TENANT_B },
      { "app.correlation_id": "wrong-correlation" },
      { "app.worker_principal_kind": "member" },
      { "app.lease_generation": "not-a-generation" },
      { "app.membership_id": "50000000-0000-4000-8000-0000000000a1" },
    ];
    for (const overrides of invalidContexts) {
      await expect(inWorkerContext(leaseA1, overrides, (tx) => tx.unsafe("SELECT lease_id::text FROM public.tenant_worker_dispatch_leases")))
        .resolves.toEqual([]);
    }
  });

  it("rejects stale generations and makes revocation terminal while allowing a newer resume generation", async () => {
    if (!issuer || !resolver || !admin) throw new Error("database unavailable");
    const leaseA2 = lease({ selector: SELECTOR_A2, leaseId: LEASE_A2, generation: 2 });
    await expect(acquire(issuer, leaseA2)).resolves.toEqual([expect.objectContaining({ kind: "created", lease_generation: "2" })]);
    await expect(resolveLease(resolver, SELECTOR_A1, "crawl", "crawl:process")).resolves.toEqual([]);
    await expect(acquire(issuer, lease({ selector: "selector-stale-generation-1", leaseId: LEASE_A3, generation: 1 }))).resolves.toEqual([]);
    await expect(cancelLease(issuer, leaseA1)).resolves.toEqual([]);

    await expect(cancelLease(issuer, leaseA2)).resolves.toEqual([expect.objectContaining({
      kind: "cancelled", revocation_reason: "cancelled",
    })]);
    await expect(cancelLease(issuer, leaseA2)).resolves.toEqual([expect.objectContaining({ kind: "replay" })]);
    await expect(cancelLease(issuer, { ...leaseA2, correlationId: "wrong-correlation" })).resolves.toEqual([]);
    await expect(cancelLease(issuer, { ...leaseA2, generation: 1 })).resolves.toEqual([]);
    await expect(resolveLease(resolver, SELECTOR_A2, "crawl", "crawl:process")).resolves.toEqual([]);
    await expect(admin.unsafe("UPDATE public.tenant_worker_dispatch_leases SET revoked_at=NULL,revocation_reason=NULL WHERE lease_id=$1", [LEASE_A2]))
      .rejects.toThrow(/revocation is terminal/u);

    const leaseA3 = lease({ selector: SELECTOR_A3, leaseId: LEASE_A3, generation: 3 });
    await expect(acquire(issuer, leaseA3)).resolves.toEqual([expect.objectContaining({ kind: "created", lease_generation: "3" })]);
    await expect(resolveLease(resolver, SELECTOR_A3, "crawl", "crawl:process"))
      .resolves.toEqual([expect.objectContaining({ lease_id: LEASE_A3, status: "active" })]);
  });

  it("serializes concurrent same-generation acquires to one capability", async () => {
    if (!issuer || !resolver) throw new Error("database unavailable");
    const jobId = randomUUID();
    const runId = randomUUID();
    const left = lease({ selector: "selector-concurrent-acquire-left", leaseId: randomUUID(), jobId, runId, correlationId: "dispatch-race" });
    const right = lease({ selector: "selector-concurrent-acquire-right", leaseId: randomUUID(), jobId, runId, correlationId: "dispatch-race" });
    const results = await Promise.all([acquire(issuer, left), acquire(issuer, right)]);
    expect(results.filter((rows) => rows.length === 1)).toHaveLength(1);
    expect(results.filter((rows) => rows.length === 0)).toHaveLength(1);
    const winner = results[0].length === 1 ? left : right;
    const loser = winner === left ? right : left;
    await expect(resolveLease(resolver, winner.selector, "crawl", "crawl:process"))
      .resolves.toHaveLength(1);
    await expect(resolveLease(resolver, loser.selector, "crawl", "crawl:process"))
      .resolves.toEqual([]);
  });

  it("denies expired and malformed acquisition records without a misleading success row", async () => {
    if (!issuer || !resolver || !admin) throw new Error("database unavailable");
    const expiredSelector = "selector-expired-generation-9";
    await admin.unsafe(`INSERT INTO public.tenant_worker_dispatch_leases(
      lease_id,tenant_id,workspace_id,job_id,run_id,selector_hash,lease_generation,
      worker_name,action,not_before,expires_at,correlation_id,created_at,updated_at
    ) VALUES ('50000000-0000-4000-8000-0000000000b1',$1,$2,'50000000-0000-4000-8000-0000000000b2',
      '50000000-0000-4000-8000-0000000000b3',$3,9,'crawl','crawl:process',
      statement_timestamp()-interval '2 minutes',statement_timestamp()-interval '1 minute',
      'dispatch-expired',statement_timestamp()-interval '3 minutes',statement_timestamp()-interval '3 minutes')`, [
      TENANT_B, WORKSPACE_B, hashSelector(expiredSelector),
    ]);
    await expect(resolveLease(resolver, expiredSelector, "crawl", "crawl:process")).resolves.toEqual([]);

    const malformed = { ...leaseB1, selector: "malformed", leaseId: "not-a-uuid", generation: 10 };
    await expect(acquire(issuer, malformed)).resolves.toEqual([]);
    expect(await admin.unsafe("SELECT count(*)::integer count FROM public.tenant_worker_dispatch_leases WHERE lease_generation=10"))
      .toEqual([{ count: 0 }]);
  });
});
