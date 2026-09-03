import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.F04_DOCUMENT_RESERVATION_RUN_DISPOSABLE_TESTS === "1";
const MIGRATION = "20260829231000_add_document_upload_reservation_action.sql";
const MIGRATION_PATH = join("supabase", "migrations", MIGRATION);
const POSTGRES_16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const DATABASE = "f04_document_reservation_action";
const TENANT_A = "00000000-0000-4000-8000-0000000000a1";
const TENANT_B = "00000000-0000-4000-8000-0000000000b2";
const WORKSPACE_A = "10000000-0000-4000-8000-0000000000a1";
const WORKSPACE_B = "10000000-0000-4000-8000-0000000000b2";
const ACTOR_A = "20000000-0000-4000-8000-0000000000a1";
const MEMBERSHIP_A = "30000000-0000-4000-8000-0000000000a1";
const BINDING_A = "40000000-0000-4000-8000-0000000000a1";
const ACTOR_R = "20000000-0000-4000-8000-0000000000a2";
const MEMBERSHIP_R = "30000000-0000-4000-8000-0000000000a2";
const BINDING_R = "40000000-0000-4000-8000-0000000000a2";
const FINGERPRINT_A = "a".repeat(64);
const FINGERPRINT_B = "b".repeat(64);
const FUNCTION_SIGNATURE = "public.novatrade_reserve_document_upload(text,text,text,text,text,text,text,text,text,text,text,text,text,text)";
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

type ReservationInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  idempotencyKey: string;
  fingerprint: string;
  fileName: string;
  format: string;
  mediaType: string;
  byteSize: string;
  maxBytes: string;
  policyVersion: string;
  sourceIdentity: string;
  objectKey: string;
}>;

type MemberScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  actorId: string;
  membershipId: string;
  role: string;
  roleBindingId: string;
  correlationId: string;
}>;

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
  for (const file of readdirSync(resolve("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    if (SKIPPED.has(file)) continue;
    try {
      await sql.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    } catch (error) {
      const failure = error as { message?: string; position?: string };
      throw new Error(`${file}:${failure.position ?? "unknown"}:${failure.message ?? "migration failed"}`);
    }
  }
}

function reservation(suffix: string, overrides: Partial<ReservationInput> = {}): ReservationInput {
  const documentId = `50000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const versionId = `60000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  return {
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    documentId,
    versionId,
    idempotencyKey: `upload-request-${suffix}`,
    fingerprint: FINGERPRINT_A,
    fileName: "launch-notes.txt",
    format: "txt",
    mediaType: "text/plain",
    byteSize: "12",
    maxBytes: "52428800",
    policyVersion: "launch-v1",
    sourceIdentity: `tenant_upload:${documentId}`,
    objectKey: `tenants/${TENANT_A}/documents/${documentId}/versions/${versionId}/original`,
    ...overrides,
  };
}

function scope(overrides: Partial<MemberScope> = {}): MemberScope {
  return {
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    actorId: ACTOR_A,
    membershipId: MEMBERSHIP_A,
    role: "owner",
    roleBindingId: BINDING_A,
    correlationId: "f04-reservation-action",
    ...overrides,
  };
}

async function callAction(sql: Sql, input: ReservationInput, memberScope = scope()): Promise<Record<string, unknown>[]> {
  return sql.begin(async (transaction) => {
    await transaction.unsafe(`SELECT
      set_config('app.tenant_id',$1,true),set_config('app.workspace_id',$2,true),
      set_config('app.actor_id',$3,true),set_config('app.membership_id',$4,true),
      set_config('app.role',$5,true),set_config('app.role_binding_id',$6,true),
      set_config('app.correlation_id',$7,true)`, [
      memberScope.tenantId, memberScope.workspaceId, memberScope.actorId, memberScope.membershipId,
      memberScope.role, memberScope.roleBindingId, memberScope.correlationId,
    ]);
    return transaction.unsafe(`SELECT kind,tenant_id::text,workspace_id::text,document_id::text,version_id::text,
      idempotency_key,source_identity,request_fingerprint,file_name,format,media_type,
      declared_byte_size::text,max_bytes::text,scanner_policy_version,object_key,state
      FROM public.novatrade_reserve_document_upload($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
      input.tenantId, input.workspaceId, input.documentId, input.versionId, input.idempotencyKey,
      input.fingerprint, input.fileName, input.format, input.mediaType, input.byteSize, input.maxBytes,
      input.policyVersion, input.sourceIdentity, input.objectKey,
    ]) as unknown as Record<string, unknown>[];
  });
}

describe.skipIf(!RUN)("F-04 authenticated document reservation PostgreSQL action", () => {
  beforeAll(async () => {
    container = `novatrade-f04-reservation-${randomUUID()}`;
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
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));

    await admin.unsafe(`INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${TENANT_A}','f04-reservation-a','F04 Reservation A','active'),
      ('${TENANT_B}','f04-reservation-b','F04 Reservation B','active')`);
    await admin.unsafe(`INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${WORKSPACE_A}','${TENANT_A}','f04-reservation-wa','F04 Reservation WA','active'),
      ('${WORKSPACE_B}','${TENANT_B}','f04-reservation-wb','F04 Reservation WB','active')`);
    await admin.unsafe(`INSERT INTO auth.users(id) VALUES ('${ACTOR_A}'),('${ACTOR_R}')`);
    await admin.unsafe(`INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status)
      VALUES ('${MEMBERSHIP_A}','${TENANT_A}','${ACTOR_A}','${WORKSPACE_A}','active'),
        ('${MEMBERSHIP_R}','${TENANT_A}','${ACTOR_R}','${WORKSPACE_A}','active')`);
    await admin.unsafe(`INSERT INTO public.tenant_role_bindings(id,tenant_id,membership_id,role,valid_from)
      VALUES ('${BINDING_A}','${TENANT_A}','${MEMBERSHIP_A}','owner',now()-interval '1 minute'),
        ('${BINDING_R}','${TENANT_A}','${MEMBERSHIP_R}','researcher',now()-interval '1 minute')`);

    const runtimeRole = `f04_reservation_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD 'f04-reservation' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO "${runtimeRole}"`);
    runtime = postgres(`postgres://${runtimeRole}:f04-reservation@127.0.0.1:${port}/${DATABASE}`,
      { max: 8, prepare: false, ssl: false, onnotice: () => undefined });
  }, 120_000);

  afterAll(async () => {
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
    if (container) docker(["rm", "--force", container], true);
  });

  it("keeps tables closed while an exact live member action creates and replays one reservation", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    await expect(runtime.unsafe("SELECT * FROM public.documents")).rejects.toThrow(/permission denied/i);
    const input = reservation("101");
    const created = await callAction(runtime, input);
    const replay = await callAction(runtime, input);

    expect(created).toEqual([{ kind: "created", tenant_id: TENANT_A, workspace_id: WORKSPACE_A,
      document_id: input.documentId, version_id: input.versionId, idempotency_key: input.idempotencyKey,
      source_identity: input.sourceIdentity, request_fingerprint: FINGERPRINT_A, file_name: input.fileName,
      format: "txt", media_type: "text/plain", declared_byte_size: "12", max_bytes: "52428800",
      scanner_policy_version: "launch-v1", object_key: input.objectKey, state: "upload_reserved" }]);
    expect(replay).toEqual([{ ...created[0], kind: "replay" }]);
    expect(await admin.unsafe(`SELECT count(*)::integer count FROM public.document_upload_reservations
      WHERE tenant_id='${TENANT_A}' AND idempotency_key='${input.idempotencyKey}'`)).toEqual([{ count: 1 }]);
    expect(await admin.unsafe(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) policy_count
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('documents','document_versions','document_upload_reservations')
      ORDER BY c.relname`)).toEqual([
      { relname: "document_upload_reservations", relrowsecurity: true, relforcerowsecurity: true, policy_count: 0 },
      { relname: "document_versions", relrowsecurity: true, relforcerowsecurity: true, policy_count: 0 },
      { relname: "documents", relrowsecurity: true, relforcerowsecurity: true, policy_count: 0 },
    ]);
    await admin.unsafe(readFileSync(MIGRATION_PATH, "utf8"));
    await expect(callAction(runtime, input)).resolves.toEqual([{ ...created[0], kind: "replay" }]);
  });

  it("keeps the function default-denied and rejects forged or conditional member scopes", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    expect(await admin.unsafe(`SELECT
      has_function_privilege('anon','${FUNCTION_SIGNATURE}','EXECUTE') anon_execute,
      has_function_privilege('authenticated','${FUNCTION_SIGNATURE}','EXECUTE') authenticated_execute`))
      .toEqual([{ anon_execute: false, authenticated_execute: false }]);

    const forged = reservation("201");
    await expect(callAction(runtime, forged, scope({ tenantId: TENANT_B, workspaceId: WORKSPACE_B })))
      .resolves.toEqual([]);
    const researcher = reservation("202");
    await expect(callAction(runtime, researcher, scope({
      actorId: ACTOR_R,
      membershipId: MEMBERSHIP_R,
      role: "researcher",
      roleBindingId: BINDING_R,
    }))).resolves.toEqual([]);
    expect(await admin.unsafe(`SELECT count(*)::integer count FROM public.document_upload_reservations
      WHERE idempotency_key IN ('${forged.idempotencyKey}','${researcher.idempotencyKey}')`))
      .toEqual([{ count: 0 }]);
  });

  it("linearizes concurrent same-request replay and conflicting key reuse without partial rows", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    const same = reservation("301");
    const sameResults = await Promise.all([callAction(runtime, same), callAction(runtime, same)]);
    expect(sameResults.flatMap((rows) => rows.map((row) => row.kind)).sort()).toEqual(["created", "replay"]);

    const first = reservation("302", { idempotencyKey: "upload-request-concurrent-conflict" });
    const second = reservation("303", {
      idempotencyKey: first.idempotencyKey,
      fingerprint: FINGERPRINT_B,
    });
    const conflictResults = await Promise.all([callAction(runtime, first), callAction(runtime, second)]);
    expect(conflictResults.flatMap((rows) => rows.map((row) => row.kind)).sort()).toEqual(["conflict", "created"]);
    expect(await admin.unsafe(`SELECT
      (SELECT count(*)::integer FROM public.documents WHERE id IN ('${first.documentId}','${second.documentId}')) documents,
      (SELECT count(*)::integer FROM public.document_versions WHERE id IN ('${first.versionId}','${second.versionId}')) versions,
      (SELECT count(*)::integer FROM public.document_upload_reservations
        WHERE tenant_id='${TENANT_A}' AND idempotency_key='${first.idempotencyKey}') reservations`))
      .toEqual([{ documents: 1, versions: 1, reservations: 1 }]);
  });

  it("denies malformed identity reflection and immediately stops suspended or revoked authority", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    const malformed = reservation("401", { sourceIdentity: `tenant_upload:${TENANT_B}` });
    await expect(callAction(runtime, malformed)).resolves.toEqual([]);

    await admin.unsafe(`UPDATE public.tenant_memberships SET status='suspended' WHERE id='${MEMBERSHIP_A}'`);
    const suspended = reservation("402");
    await expect(callAction(runtime, suspended)).resolves.toEqual([]);
    await admin.unsafe(`UPDATE public.tenant_memberships SET status='active' WHERE id='${MEMBERSHIP_A}'`);

    const beforeRevocation = reservation("403");
    await expect(callAction(runtime, beforeRevocation)).resolves.toMatchObject([{ kind: "created" }]);
    await admin.unsafe(`UPDATE public.tenant_role_bindings SET revoked_at=now() WHERE id='${BINDING_A}'`);
    await expect(callAction(runtime, beforeRevocation)).resolves.toEqual([]);
    const afterRevocation = reservation("404");
    await expect(callAction(runtime, afterRevocation)).resolves.toEqual([]);
    expect(await admin.unsafe(`SELECT count(*)::integer count FROM public.document_upload_reservations
      WHERE idempotency_key IN ('${malformed.idempotencyKey}','${suspended.idempotencyKey}','${afterRevocation.idempotencyKey}')`))
      .toEqual([{ count: 0 }]);
  });
});
