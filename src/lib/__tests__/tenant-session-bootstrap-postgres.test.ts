import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";

vi.mock("server-only", () => ({}));

import { createTenantSessionResolver, TenantScopeResolutionError } from "@/lib/app-users";
import { closeDb } from "@/lib/db";

const RUN = process.env.F01_BOOTSTRAP_RUN_DISPOSABLE_TESTS === "1";
const EXPECTED_DATABASE = "f01_session_bootstrap_rehearsal";
const TENANT_A = "00000000-0000-4000-8000-000000000011";
const TENANT_B = "00000000-0000-4000-8000-000000000012";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000011";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000012";
const MEMBER_A = "20000000-0000-4000-8000-000000000011";
const MEMBER_B = "20000000-0000-4000-8000-000000000012";
const BINDING_A = "30000000-0000-4000-8000-000000000011";
const BINDING_B = "30000000-0000-4000-8000-000000000012";
const AUTH_SHARED = "50000000-0000-4000-8000-000000000011";
const EXPECTED_KEYS = ["membership_id", "role", "role_binding_id", "tenant_id", "workspace_id"];
const SKIPPED = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

let admin: Sql | undefined;
let runtime: Sql | undefined;
let originalDatabaseUrl: string | undefined;
let originalDatabaseSsl: string | undefined;

function requireLocalUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  const parsed = new URL(value);
  if (!(["127.0.0.1", "localhost"].includes(parsed.hostname)) || parsed.pathname !== `/${EXPECTED_DATABASE}`) {
    throw new Error(`${name} must target the exact loopback disposable database`);
  }
  return value;
}

async function replayMigrations(sql: Sql): Promise<void> {
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  await sql.unsafe("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)");
  await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
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

async function resolveRaw(
  sql: Sql,
  identity: unknown,
  tenant: unknown,
  workspaceProvided: unknown,
  workspace: unknown,
): Promise<Record<string, unknown>[]> {
  return sql.unsafe(
    `SELECT tenant_id, workspace_id, membership_id, role, role_binding_id
     FROM public.novatrade_resolve_tenant_session($1, $2, $3, $4)`,
    [identity, tenant, workspaceProvided, workspace] as never[],
  ) as unknown as Promise<Record<string, unknown>[]>;
}

describe.skipIf(!RUN)("F-01 restricted-role tenant-session bootstrap", () => {
  beforeAll(async () => {
    const adminUrl = requireLocalUrl("F01_BOOTSTRAP_ADMIN_DATABASE_URL");
    const runtimeUrl = requireLocalUrl("F01_BOOTSTRAP_RUNTIME_DATABASE_URL");
    const runtimeRole = process.env.F01_BOOTSTRAP_RUNTIME_ROLE?.trim();
    if (!runtimeRole || !/^f01_bootstrap_runtime_[a-z0-9_]+$/u.test(runtimeRole)) {
      throw new Error("F01_BOOTSTRAP_RUNTIME_ROLE must be a unique disposable role");
    }
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    runtime = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false, onnotice: () => undefined });
    const receipt = await admin.unsafe<Array<{ database_name: string; version: string }>>(
      "SELECT current_database() AS database_name, current_setting('server_version_num') AS version",
    );
    expect(receipt[0]).toMatchObject({ database_name: EXPECTED_DATABASE });
    expect(receipt[0]?.version.startsWith("16")).toBe(true);
    await replayMigrations(admin);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await admin.unsafe(`GRANT EXECUTE ON FUNCTION public.novatrade_resolve_tenant_session(text, text, boolean, text) TO "${runtimeRole}"`);
    await admin.unsafe(`
      INSERT INTO public.tenants (id, slug, name, status)
      VALUES ('${TENANT_A}', 'f01-a', 'F01 A', 'active'), ('${TENANT_B}', 'f01-b', 'F01 B', 'active');
      INSERT INTO public.workspaces (id, tenant_id, slug, name, status)
      VALUES ('${WORKSPACE_A}', '${TENANT_A}', 'workspace-a', 'Workspace A', 'active'),
             ('${WORKSPACE_B}', '${TENANT_B}', 'workspace-b', 'Workspace B', 'active');
      INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status)
      VALUES ('${MEMBER_A}', '${TENANT_A}', '${AUTH_SHARED}', NULL, 'active'),
             ('${MEMBER_B}', '${TENANT_B}', '${AUTH_SHARED}', '${WORKSPACE_B}', 'active');
      INSERT INTO public.tenant_role_bindings (id, tenant_id, membership_id, role, valid_from, reason_code)
      VALUES ('${BINDING_A}', '${TENANT_A}', '${MEMBER_A}', 'owner', statement_timestamp() - interval '1 hour', 'initial_provisioning'),
             ('${BINDING_B}', '${TENANT_B}', '${MEMBER_B}', 'researcher', statement_timestamp() - interval '1 hour', 'initial_provisioning');
    `);
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalDatabaseSsl = process.env.DATABASE_SSL;
    process.env.DATABASE_URL = runtimeUrl;
    process.env.DATABASE_SSL = "disable";
  }, 120_000);

  afterAll(async () => {
    await closeDb();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDatabaseSsl === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = originalDatabaseSsl;
    await runtime?.end({ timeout: 1 });
    await admin?.end({ timeout: 1 });
  });

  it("uses a hardened owner boundary while the runtime remains non-owner and cannot read foundation tables", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    const runtimeRole = process.env.F01_BOOTSTRAP_RUNTIME_ROLE;
    const rows = await admin.unsafe<Array<Record<string, unknown>>>(`
      SELECT p.prosecdef, p.proconfig, owner_role.rolsuper AS owner_super,
             owner_role.rolbypassrls AS owner_bypass,
             runtime_role.rolsuper AS runtime_super,
             runtime_role.rolbypassrls AS runtime_bypass,
             pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
             pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = p.proowner
      JOIN pg_catalog.pg_roles runtime_role ON runtime_role.rolname = '${runtimeRole}'
      WHERE n.nspname = 'public' AND p.proname = 'novatrade_resolve_tenant_session'
    `);
    expect(rows).toEqual([expect.objectContaining({
      prosecdef: true,
      proconfig: ["search_path=pg_catalog"],
      runtime_super: false,
      runtime_bypass: false,
      anon_execute: false,
      authenticated_execute: false,
    })]);
    expect(Boolean(rows[0]?.owner_super) || Boolean(rows[0]?.owner_bypass)).toBe(true);
    await expect(runtime.unsafe("SELECT id FROM public.tenants"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("resolves through the production repository adapter without preinstalled member GUCs", async () => {
    const resolver = createTenantSessionResolver();
    await expect(resolver.resolve({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    })).resolves.toEqual({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBER_A,
      role: "owner",
      roleBindingId: BINDING_A,
    });
  });

  it("preserves omitted, explicit tenant-wide, and assigned-workspace semantics", async () => {
    if (!runtime) throw new Error("test database unavailable");
    await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_A, false, null)).resolves.toEqual([
      expect.objectContaining({ tenant_id: TENANT_A, workspace_id: null }),
    ]);
    await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_A, true, null)).resolves.toEqual([
      expect.objectContaining({ tenant_id: TENANT_A, workspace_id: null }),
    ]);
    await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_B, false, null)).resolves.toEqual([
      expect.objectContaining({ tenant_id: TENANT_B, workspace_id: WORKSPACE_B }),
    ]);
    await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_B, true, null)).resolves.toEqual([]);
  });

  it.each([
    ["wrong identity", "50000000-0000-4000-8000-000000000099", TENANT_A, false, null],
    ["wrong tenant", AUTH_SHARED, "00000000-0000-4000-8000-000000000099", false, null],
    ["cross-tenant workspace", AUTH_SHARED, TENANT_A, true, WORKSPACE_B],
    ["malformed identity", "not-a-uuid", TENANT_A, false, null],
    ["malformed tenant", AUTH_SHARED, "not-a-uuid", false, null],
    ["malformed workspace", AUTH_SHARED, TENANT_A, true, "not-a-uuid"],
    ["conflicting selector shape", AUTH_SHARED, TENANT_A, false, WORKSPACE_A],
  ])("returns the same empty result for %s", async (_label, identity, tenant, provided, workspace) => {
    if (!runtime) throw new Error("test database unavailable");
    await expect(resolveRaw(runtime, identity, tenant, provided, workspace)).resolves.toEqual([]);
  });

  it("returns exactly the five non-enumerating scope fields", async () => {
    if (!runtime) throw new Error("test database unavailable");
    const rows = await resolveRaw(runtime, AUTH_SHARED, TENANT_A, false, null);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(EXPECTED_KEYS);
    expect(JSON.stringify(rows)).not.toMatch(/status|slug|name|auth_identity/u);
  });

  it("observes membership suspension and role revocation immediately", async () => {
    if (!admin || !runtime) throw new Error("test database unavailable");
    await admin.unsafe(`UPDATE public.tenant_memberships SET status = 'suspended' WHERE id = '${MEMBER_A}'`);
    try {
      await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_A, false, null)).resolves.toEqual([]);
    } finally {
      await admin.unsafe(`UPDATE public.tenant_memberships SET status = 'active' WHERE id = '${MEMBER_A}'`);
    }
    await admin.unsafe(`UPDATE public.tenant_role_bindings SET revoked_at = statement_timestamp() WHERE id = '${BINDING_A}'`);
    await expect(resolveRaw(runtime, AUTH_SHARED, TENANT_A, false, null)).resolves.toEqual([]);
    await expect(createTenantSessionResolver().resolve({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);
  });
});
