import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F01_EXPORT_JOB_RLS_RUN_DISPOSABLE_TESTS === "1";
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f01_export_job_rls_rehearsal";
const RUNTIME_ROLE = "f01_export_job_runtime";
const RUNTIME_PASSWORD = "f01-export-job-runtime";
const RLS_MIGRATION = "20260830020000_enforce_tenant_export_jobs_rls.sql";
const MIGRATIONS = [
  "202607270001_add_tenants_table.sql",
  "202607270002_add_workspaces_table.sql",
  "202607270003_add_tenant_memberships.sql",
  "202607270004_add_tenant_policies.sql",
  "202607270005_add_support_access_grants.sql",
  "202607270006_add_tenant_export_jobs.sql",
  "202607270009_add_tenant_foundation_rls.sql",
  RLS_MIGRATION,
] as const;

const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b1";
const WORKSPACE_A = "10000000-0000-4000-8000-0000000000a1";
const WORKSPACE_B = "10000000-0000-4000-8000-0000000000b1";
const ACTOR_A = "20000000-0000-4000-8000-0000000000a1";
const ACTOR_B = "20000000-0000-4000-8000-0000000000b1";
const MEMBERSHIP_A = "30000000-0000-4000-8000-0000000000a1";
const MEMBERSHIP_B = "30000000-0000-4000-8000-0000000000b1";
const BINDING_A = "40000000-0000-4000-8000-0000000000a1";
const BINDING_B = "40000000-0000-4000-8000-0000000000b1";
const JOB_A = "60000000-0000-4000-8000-0000000000a1";
const JOB_B = "60000000-0000-4000-8000-0000000000b1";
const JOB_C = "60000000-0000-4000-8000-0000000000c1";
const ARTIFACT_A = `tenants/${TENANT_A}/exports/${JOB_A}/tenant-a.csv`;
const ARTIFACT_B = `tenants/${TENANT_B}/exports/${JOB_B}/tenant-b.csv`;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

type Context = Readonly<{
  tenantId: string;
  workspaceId: string;
  actorId: string;
  membershipId: string;
  role: string;
  roleBindingId: string;
}>;

const CONTEXT_A: Context = {
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  actorId: ACTOR_A,
  membershipId: MEMBERSHIP_A,
  role: "owner",
  roleBindingId: BINDING_A,
};

const CONTEXT_B: Context = {
  tenantId: TENANT_B,
  workspaceId: WORKSPACE_B,
  actorId: ACTOR_B,
  membershipId: MEMBERSHIP_B,
  role: "owner",
  roleBindingId: BINDING_B,
};

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

async function replayMigrations(db: Sql): Promise<void> {
  await db.unsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`);
  for (const migration of MIGRATIONS) {
    await db.unsafe(readFileSync(join("supabase", "migrations", migration), "utf8"));
  }
}

async function seedJob(db: Sql, input: Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string;
  actorId: string;
  membershipId: string;
  auditId: string;
  artifact: string;
  hash: string;
}>): Promise<void> {
  await db.unsafe(`INSERT INTO public.tenant_export_jobs (
    id,tenant_id,workspace_id,requester_auth_identity_id,requester_membership_id,
    scope_hash,input_hash,idempotency_key_hash,policy_version,manifest_version,
    schema_version,requested_format,correlation_id,audit_event_id,created_at,updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$6,$6,'policy-v1','manifest-v1','schema-v1','csv',
    $7,$8,'2026-08-29T00:00:00.000Z','2026-08-29T00:00:00.000Z')`, [
    input.id, input.tenantId, input.workspaceId, input.actorId, input.membershipId,
    input.hash, `f01-export-${input.id.slice(-2)}`, input.auditId,
  ]);
  await db.unsafe(`UPDATE public.tenant_export_jobs
    SET status='snapshotting',snapshot_at='2026-08-29T00:01:00.000Z' WHERE id=$1`, [input.id]);
  await db.unsafe("UPDATE public.tenant_export_jobs SET status='redacting' WHERE id=$1", [input.id]);
  await db.unsafe(`UPDATE public.tenant_export_jobs SET status='artifact_created',
    artifact_storage_ref=$2,artifact_checksum_sha256=$3,included_count=1,
    excluded_count=0,redacted_count=0,artifact_created_at='2026-08-29T00:02:00.000Z',
    expires_at='2026-09-05T00:02:00.000Z' WHERE id=$1`, [input.id, input.artifact, input.hash]);
}

async function seedTwoTenantJobs(db: Sql): Promise<void> {
  await db.unsafe(`
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${TENANT_A}','f01-export-a','F01 Export Tenant A','active'),
      ('${TENANT_B}','f01-export-b','F01 Export Tenant B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${WORKSPACE_A}','${TENANT_A}','f01-export-workspace','F01 Export Workspace A','active'),
      ('${WORKSPACE_B}','${TENANT_B}','f01-export-workspace','F01 Export Workspace B','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES
      ('${MEMBERSHIP_A}','${TENANT_A}','${ACTOR_A}','${WORKSPACE_A}','active'),
      ('${MEMBERSHIP_B}','${TENANT_B}','${ACTOR_B}','${WORKSPACE_B}','active');
    INSERT INTO public.tenant_role_bindings(id,tenant_id,membership_id,role,valid_from) VALUES
      ('${BINDING_A}','${TENANT_A}','${MEMBERSHIP_A}','owner','2026-08-29T00:00:00.000Z'),
      ('${BINDING_B}','${TENANT_B}','${MEMBERSHIP_B}','owner','2026-08-29T00:00:00.000Z');
  `);
  await seedJob(db, {
    id: JOB_A, tenantId: TENANT_A, workspaceId: WORKSPACE_A, actorId: ACTOR_A,
    membershipId: MEMBERSHIP_A, auditId: "70000000-0000-4000-8000-0000000000a1",
    artifact: ARTIFACT_A, hash: HASH_A,
  });
  await seedJob(db, {
    id: JOB_B, tenantId: TENANT_B, workspaceId: WORKSPACE_B, actorId: ACTOR_B,
    membershipId: MEMBERSHIP_B, auditId: "70000000-0000-4000-8000-0000000000b1",
    artifact: ARTIFACT_B, hash: HASH_B,
  });
}

async function installContext(db: TransactionSql, context: Context): Promise<void> {
  const settings: Readonly<Record<string, string>> = {
    "app.tenant_id": context.tenantId,
    "app.workspace_id": context.workspaceId,
    "app.actor_id": context.actorId,
    "app.membership_id": context.membershipId,
    "app.role": context.role,
    "app.role_binding_id": context.roleBindingId,
    "app.support_grant_id": "",
    "app.job_id": "",
    "app.run_id": "",
    "app.lease_id": "",
    "app.lease_generation": "",
    "app.worker_name": "",
    "app.worker_action": "",
    "app.worker_principal_kind": "",
    "app.correlation_id": `f01-export-${context.tenantId.slice(-2)}`,
  };
  for (const [name, value] of Object.entries(settings)) {
    await db.unsafe("SELECT pg_catalog.set_config($1,$2,true)", [name, value]);
  }
}

async function inContext<T>(context: Context, callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
  if (!runtime) throw new Error("restricted runtime is unavailable");
  return (await runtime.begin(async (tx) => {
    await installContext(tx, context);
    return callback(tx);
  })) as T;
}

async function visibleArtifacts(context: Context): Promise<Array<{ id: string; artifact_storage_ref: string }>> {
  return inContext(context, (tx) => tx.unsafe(
    "SELECT id::text,artifact_storage_ref FROM public.tenant_export_jobs ORDER BY id::text",
  ));
}

describe.skipIf(!RUN)("F-01 tenant export-job restricted-role RLS", () => {
  beforeAll(async () => {
    container = `novatrade-f01-export-${randomUUID()}`;
    docker([
      "run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_16,
    ]);
    waitForPostgres(container);
    const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
    if (!port) throw new Error("Disposable PostgreSQL port was not published");
    const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    await replayMigrations(admin);
    await seedTwoTenantJobs(admin);
    await admin.unsafe(`CREATE ROLE ${RUNTIME_ROLE} LOGIN PASSWORD '${RUNTIME_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
    await admin.unsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.tenant_export_jobs TO ${RUNTIME_ROLE}`);
    await admin.unsafe(`GRANT EXECUTE ON FUNCTION public.novatrade_rls_member_context() TO ${RUNTIME_ROLE}`);
    runtime = postgres(
      `postgres://${RUNTIME_ROLE}:${RUNTIME_PASSWORD}@127.0.0.1:${port}/${DATABASE}`,
      { max: 1, prepare: false, ssl: false, onnotice: () => undefined },
    );
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("installs forced RLS, exact policies, and closed browser-role privileges without changing rows on replay", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    const before = await admin.unsafe("SELECT id::text,status,artifact_storage_ref FROM public.tenant_export_jobs ORDER BY id::text");
    await admin.unsafe(readFileSync(join("supabase", "migrations", RLS_MIGRATION), "utf8"));
    expect(await admin.unsafe("SELECT id::text,status,artifact_storage_ref FROM public.tenant_export_jobs ORDER BY id::text")).toEqual(before);

    const [catalog] = await admin.unsafe<Array<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policy_count: number;
      anon_select: boolean;
      authenticated_select: boolean;
      public_privilege: boolean;
    }>>(`SELECT c.relrowsecurity,c.relforcerowsecurity,
      (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count,
      pg_catalog.has_table_privilege('anon',c.oid,'SELECT') anon_select,
      pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
        WHERE acl.grantee=0) public_privilege
      FROM pg_catalog.pg_class c WHERE c.oid='public.tenant_export_jobs'::regclass`);
    expect(catalog).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      policy_count: 2,
      anon_select: false,
      authenticated_select: false,
      public_privilege: false,
    });
    const policies = await admin.unsafe(`SELECT policyname,cmd,roles,qual,with_check
      FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='tenant_export_jobs'
      ORDER BY policyname`);
    expect(policies).toEqual([
      {
        policyname: "f01_export_jobs_deny_all_mutations",
        cmd: "ALL",
        roles: ["public"],
        qual: "false",
        with_check: "false",
      },
      expect.objectContaining({
        policyname: "f01_export_jobs_member_select",
        cmd: "SELECT",
        roles: ["public"],
        with_check: null,
      }),
    ]);
    const [role] = await runtime.unsafe<Array<{ rolsuper: boolean; rolbypassrls: boolean; rolinherit: boolean }>>(
      "SELECT rolsuper,rolbypassrls,rolinherit FROM pg_catalog.pg_roles WHERE rolname=current_user",
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolinherit: false });
  });

  it("returns no rows for blank or mismatched GUCs and isolates tenant A and B artifact locators", async () => {
    if (!runtime) throw new Error("restricted runtime is unavailable");
    expect(await runtime.unsafe("SELECT id::text,artifact_storage_ref FROM public.tenant_export_jobs")).toEqual([]);
    expect(await visibleArtifacts({ ...CONTEXT_A, workspaceId: WORKSPACE_B })).toEqual([]);
    expect(await visibleArtifacts({ ...CONTEXT_A, tenantId: TENANT_B })).toEqual([]);
    expect(await visibleArtifacts(CONTEXT_A)).toEqual([{ id: JOB_A, artifact_storage_ref: ARTIFACT_A }]);
    expect(await inContext(CONTEXT_A, (tx) => tx.unsafe(
      "SELECT id::text FROM public.tenant_export_jobs WHERE artifact_storage_ref=$1", [ARTIFACT_B],
    ))).toEqual([]);
    expect(await visibleArtifacts(CONTEXT_B)).toEqual([{ id: JOB_B, artifact_storage_ref: ARTIFACT_B }]);
  });

  it("keeps insert, update, and delete denied even when the restricted role has table privileges", async () => {
    if (!admin) throw new Error("test database unavailable");
    expect(await inContext(CONTEXT_A, (tx) => tx.unsafe(
      "UPDATE public.tenant_export_jobs SET status='snapshotting' WHERE id=$1 RETURNING id", [JOB_A],
    ))).toEqual([]);
    expect(await inContext(CONTEXT_A, (tx) => tx.unsafe(
      "DELETE FROM public.tenant_export_jobs WHERE id=$1 RETURNING id", [JOB_A],
    ))).toEqual([]);
    await expect(inContext(CONTEXT_A, (tx) => tx.unsafe(`INSERT INTO public.tenant_export_jobs (
      id,tenant_id,workspace_id,requester_auth_identity_id,requester_membership_id,
      scope_hash,input_hash,idempotency_key_hash,policy_version,manifest_version,schema_version,
      requested_format,correlation_id,audit_event_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$6,$6,'policy-v1','manifest-v1','schema-v1','csv',
      'f01-export-denied','70000000-0000-4000-8000-0000000000c1')`, [
      JOB_C, TENANT_A, WORKSPACE_A, ACTOR_A, MEMBERSHIP_A, HASH_C,
    ]))).rejects.toMatchObject({ code: "42501" });
    expect(await admin.unsafe("SELECT id::text,status FROM public.tenant_export_jobs ORDER BY id::text")).toEqual([
      { id: JOB_A, status: "artifact_created" },
      { id: JOB_B, status: "artifact_created" },
    ]);
  });
});
