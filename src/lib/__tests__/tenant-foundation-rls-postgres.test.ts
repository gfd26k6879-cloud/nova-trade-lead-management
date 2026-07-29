import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql, type TransactionSql } from "postgres";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const TENANT_SUSPENDED = "00000000-0000-4000-8000-000000000003";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_ARCHIVED = "10000000-0000-4000-8000-000000000003";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_SUSPENDED = "20000000-0000-4000-8000-000000000003";
const MEMBERSHIP_REVOKED = "20000000-0000-4000-8000-000000000004";
const MEMBERSHIP_FUTURE = "20000000-0000-4000-8000-000000000005";
const BINDING_A = "30000000-0000-4000-8000-000000000001";
const BINDING_B = "30000000-0000-4000-8000-000000000002";
const BINDING_SUSPENDED = "30000000-0000-4000-8000-000000000003";
const BINDING_REVOKED = "30000000-0000-4000-8000-000000000004";
const BINDING_FUTURE = "30000000-0000-4000-8000-000000000005";
const ACTOR_A = "50000000-0000-4000-8000-000000000001";
const ACTOR_B = "50000000-0000-4000-8000-000000000002";
const ACTOR_SUSPENDED = "50000000-0000-4000-8000-000000000003";
const ACTOR_REVOKED = "50000000-0000-4000-8000-000000000004";
const ACTOR_FUTURE = "50000000-0000-4000-8000-000000000005";
const SUPPORT_VALID = "50000000-0000-4000-8000-000000000101";
const SUPPORT_WORKSPACE = "50000000-0000-4000-8000-000000000102";
const SUPPORT_BAD_CLASS = "50000000-0000-4000-8000-000000000103";
const SUPPORT_REVOKED = "50000000-0000-4000-8000-000000000104";
const SUPPORT_EXPIRED = "50000000-0000-4000-8000-000000000105";
const SUPPORT_EXPIRING = "50000000-0000-4000-8000-000000000106";
const GRANT_VALID = "40000000-0000-4000-8000-000000000001";
const GRANT_WORKSPACE = "40000000-0000-4000-8000-000000000002";
const GRANT_BAD_CLASS = "40000000-0000-4000-8000-000000000003";
const GRANT_REVOKED = "40000000-0000-4000-8000-000000000004";
const GRANT_EXPIRED = "40000000-0000-4000-8000-000000000005";
const GRANT_EXPIRING = "40000000-0000-4000-8000-000000000006";
const POLICY_A = "90000000-0000-4000-8000-000000000001";
const POLICY_B = "90000000-0000-4000-8000-000000000002";
const EXPECTED_DATABASE_NAME = "t027_rls_rehearsal";
const RUN_DISPOSABLE_RLS_TESTS = process.env.T027_RUN_DISPOSABLE_RLS_TESTS === "1";
const GRANT_IDS = [GRANT_VALID, GRANT_WORKSPACE, GRANT_BAD_CLASS, GRANT_REVOKED, GRANT_EXPIRED, GRANT_EXPIRING] as const;

const TABLES = [
  "tenants",
  "workspaces",
  "tenant_memberships",
  "tenant_role_bindings",
  "tenant_policies",
  "support_access_grants",
  "support_access_grant_permissions",
  "support_access_grant_data_classes",
] as const;

type Db = Sql | TransactionSql;
type Context = {
  tenantId?: string;
  workspaceId?: string;
  actorId?: string;
  membershipId?: string;
  role?: string;
  roleBindingId?: string;
  supportGrantId?: string;
  jobId?: string;
  runId?: string;
  leaseId?: string;
  leaseGeneration?: string;
  workerName?: string;
  workerAction?: string;
  workerPrincipalKind?: string;
  correlationId?: string;
};

const emptyContext: Required<Context> = {
  tenantId: "",
  workspaceId: "",
  actorId: "",
  membershipId: "",
  role: "",
  roleBindingId: "",
  supportGrantId: "",
  jobId: "",
  runId: "",
  leaseId: "",
  leaseGeneration: "",
  workerName: "",
  workerAction: "",
  workerPrincipalKind: "",
  correlationId: "",
};

const memberA: Context = {
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  actorId: ACTOR_A,
  membershipId: MEMBERSHIP_A,
  role: "owner",
  roleBindingId: BINDING_A,
  correlationId: "t027-member-a",
};

const memberB: Context = {
  tenantId: TENANT_B,
  workspaceId: WORKSPACE_B,
  actorId: ACTOR_B,
  membershipId: MEMBERSHIP_B,
  role: "researcher",
  roleBindingId: BINDING_B,
  correlationId: "t027-member-b",
};

const supportA: Context = {
  tenantId: TENANT_A,
  actorId: SUPPORT_VALID,
  supportGrantId: GRANT_VALID,
  correlationId: "t027-support-mutation",
};

const workerA: Context = {
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  jobId: "60000000-0000-4000-8000-000000000001",
  runId: "70000000-0000-4000-8000-000000000001",
  leaseId: "80000000-0000-4000-8000-000000000001",
  leaseGeneration: "1",
  workerName: "crawl",
  workerAction: "crawl:process",
  workerPrincipalKind: "cron",
  correlationId: "t027-worker-mutation",
};

function contextValues(context: Context): Required<Context> {
  return { ...emptyContext, ...context };
}

async function installContext(db: Db, context: Context): Promise<void> {
  const values = contextValues(context);
  for (const [name, value] of Object.entries(values)) {
    await db.unsafe("SELECT set_config($1, $2, true)", [name.startsWith("app.") ? name : `app.${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`, value]);
  }
}

async function inContext<T>(db: Sql, context: Context, callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return (await db.begin(async (tx) => {
    await installContext(tx, context);
    return callback(tx);
  })) as T;
}

async function count(db: Db, table: string, where = "true"): Promise<number> {
  const rows = await db.unsafe<{ count: string }[]>(`SELECT count(*)::text AS count FROM public.${table} WHERE ${where}`);
  return Number(rows[0]?.count ?? 0);
}

async function visibleIds(db: Sql, context: Context, table: string, column = "id"): Promise<string[]> {
  return inContext(db, context, async (tx) => {
    const rows = await tx.unsafe<{ id: string }[]>(`SELECT ${column}::text AS id FROM public.${table} ORDER BY ${column}::text`);
    return rows.map((row) => row.id);
  });
}

async function expectMutationDenied(db: Sql, context: Context, table: string, statements: readonly string[]): Promise<void> {
  const before = await count(db, table);
  for (const statement of statements) {
    try {
      const result = await inContext(db, context, async (tx) => tx.unsafe(statement));
      expect(result).toHaveLength(0);
    } catch (error) {
      expect(String(error)).toMatch(/row-level security|permission denied|policy|immutable|scope|cannot be deleted/i);
    }
  }
  expect(await count(db, table)).toBe(before);
}

async function insertGrant(db: Sql, input: {
  id: string;
  actor: string;
  workspaceId: string | null;
  permission: string;
  dataClass: string;
  startsAt: string;
  expiresAt: string;
  state?: "approved" | "revoked";
}): Promise<void> {
  await db.begin(async (tx) => {
    const state = input.state ?? "approved";
    const revoked = state === "revoked"
      ? { by: ACTOR_A, at: input.expiresAt }
      : { by: null, at: null };
    await tx.unsafe(`
      INSERT INTO public.support_access_grants (
        id, tenant_id, workspace_id, support_actor_auth_identity_id,
        requested_by_auth_identity_id, state, reason_code, reason,
        starts_at, expires_at, correlation_id, audit_event_id, created_at,
        permission_anchor, data_class_anchor
      ) VALUES ($1, $2, $3, $4, $5, 'pending', 'diagnostic-review', $6,
        $7, $8, $9, $10, $11, $12, $13)
    `, [input.id, TENANT_A, input.workspaceId, input.actor, ACTOR_A, `Synthetic ${input.id}`, input.startsAt, input.expiresAt, `t027-${input.id}`, input.id, input.startsAt, input.permission, input.dataClass]);
    await tx.unsafe("INSERT INTO public.support_access_grant_permissions (grant_id, permission) VALUES ($1, $2)", [input.id, input.permission]);
    await tx.unsafe("INSERT INTO public.support_access_grant_data_classes (grant_id, data_class) VALUES ($1, $2)", [input.id, input.dataClass]);
    await tx.unsafe("UPDATE public.support_access_grants SET state = 'approved', approved_by_auth_identity_id = $1, approved_at = $2 WHERE id = $3", [ACTOR_A, input.startsAt, input.id]);
    if (state === "revoked") {
      await tx.unsafe("UPDATE public.support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = $1, revoked_at = $2 WHERE id = $3", [revoked.by, revoked.at, input.id]);
    }
  });
}

type ConnectionReceipt = {
  database_name: string;
  server_addr: string;
  server_port: number | null;
  postmaster_started_at: string;
  server_version_num: number;
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

const HELPER_NAMES = [
  "novatrade_rls_member_context",
  "novatrade_rls_support_context",
  "novatrade_rls_support_tenant_metadata_read",
  "novatrade_rls_support_workspace_metadata_read",
] as const;
const EXPECTED_HELPER_SEARCH_PATH = ["search_path=pg_catalog, public"];

const EXPECTED_POLICY_SHAPE: Record<string, { cmd: string; deny: boolean }> = {
  t027_tenants_member_select: { cmd: "SELECT", deny: false },
  t027_tenants_support_select: { cmd: "SELECT", deny: false },
  t027_tenants_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_workspaces_member_select: { cmd: "SELECT", deny: false },
  t027_workspaces_support_select: { cmd: "SELECT", deny: false },
  t027_workspaces_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_memberships_member_select: { cmd: "SELECT", deny: false },
  t027_memberships_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_role_bindings_member_select: { cmd: "SELECT", deny: false },
  t027_role_bindings_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_policies_member_select: { cmd: "SELECT", deny: false },
  t027_policies_support_select: { cmd: "SELECT", deny: false },
  t027_policies_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_support_grants_member_select: { cmd: "SELECT", deny: false },
  t027_support_grants_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_support_permissions_member_select: { cmd: "SELECT", deny: false },
  t027_support_permissions_deny_all_other_verbs: { cmd: "ALL", deny: true },
  t027_support_data_classes_member_select: { cmd: "SELECT", deny: false },
  t027_support_data_classes_deny_all_other_verbs: { cmd: "ALL", deny: true },
};

describe.skipIf(!RUN_DISPOSABLE_RLS_TESTS)("T-027 tenant foundation Postgres RLS", () => {
  const runtime = postgres(process.env.DATABASE_URL ?? "postgres://invalid", { max: 1, connect_timeout: 5 });
  const admin = postgres(process.env.T027_ADMIN_DATABASE_URL ?? "postgres://invalid", { max: 1, connect_timeout: 5 });
  let targetValidated = false;
  let expectedOwner = "";

  async function connectionReceipt(db: Sql): Promise<ConnectionReceipt> {
    const rows = await db.unsafe<ConnectionReceipt[]>(`
      SELECT current_database() AS database_name,
        coalesce(inet_server_addr()::text, 'local') AS server_addr,
        inet_server_port() AS server_port,
        pg_postmaster_start_time()::text AS postmaster_started_at,
        current_setting('server_version_num')::int AS server_version_num,
        current_user,
        role.rolsuper,
        role.rolbypassrls
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = current_user
    `);
    if (rows.length !== 1) throw new Error("T-027 preflight could not resolve current_user role attributes");
    return rows[0];
  }

  async function assertDisposableTarget(): Promise<void> {
    if (!process.env.DATABASE_URL || !process.env.T027_ADMIN_DATABASE_URL) {
      throw new Error("T-027 disposable test requires DATABASE_URL and T027_ADMIN_DATABASE_URL");
    }
    if (!process.env.T027_RUNTIME_ROLE) {
      throw new Error("T-027 disposable test requires T027_RUNTIME_ROLE");
    }
    const [adminReceipt, runtimeReceipt] = await Promise.all([connectionReceipt(admin), connectionReceipt(runtime)]);
    const sameDatabase = ["database_name", "server_addr", "server_port", "postmaster_started_at"].every((key) => adminReceipt[key as keyof ConnectionReceipt] === runtimeReceipt[key as keyof ConnectionReceipt]);
    if (!sameDatabase) throw new Error("T-027 preflight refused: admin and runtime are not the same resolved PostgreSQL instance");
    if (adminReceipt.database_name !== EXPECTED_DATABASE_NAME) throw new Error(`T-027 preflight refused: database must be ${EXPECTED_DATABASE_NAME}`);
    if (Math.floor(adminReceipt.server_version_num / 10_000) !== 16) throw new Error("T-027 preflight refused: server major must be PostgreSQL 16");
    if (runtimeReceipt.current_user !== process.env.T027_RUNTIME_ROLE || runtimeReceipt.rolsuper || runtimeReceipt.rolbypassrls) {
      throw new Error("T-027 preflight refused: runtime must be the named NOSUPERUSER, NOBYPASSRLS role");
    }

    const owners = await admin.unsafe<{ tableowner: string }[]>(`
      SELECT tableowner FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename IN (${TABLES.map((table) => `'${table}'`).join(",")})
    `);
    const helperOwners = await admin.unsafe<{
      owner: string;
      owner_super: boolean;
      owner_bypassrls: boolean;
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
    }[]>(`
      SELECT owner.rolname AS owner, owner.rolsuper AS owner_super,
        owner.rolbypassrls AS owner_bypassrls, proc.proname, proc.prosecdef,
        proc.proconfig
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
      WHERE proc.pronamespace = 'public'::regnamespace
        AND proc.proname IN (${HELPER_NAMES.map((name) => `'${name}'`).join(",")})
    `);
    expectedOwner = adminReceipt.current_user;
    if (owners.length !== TABLES.length || helperOwners.length !== HELPER_NAMES.length || new Set(owners.map((row) => row.tableowner)).size !== 1 || new Set(helperOwners.map((row) => row.owner)).size !== 1 || owners[0]?.tableowner !== expectedOwner || helperOwners.some((row) => row.owner !== expectedOwner || !row.prosecdef || !row.owner_super && !row.owner_bypassrls || JSON.stringify(row.proconfig) !== JSON.stringify(EXPECTED_HELPER_SEARCH_PATH)) || !adminReceipt.rolsuper && !adminReceipt.rolbypassrls || expectedOwner === runtimeReceipt.current_user) {
      throw new Error("T-027 preflight refused: protected table/helper ownership is not one non-runtime admin owner");
    }
    if (new Set(helperOwners.map((row) => row.proname)).size !== HELPER_NAMES.length || !HELPER_NAMES.every((name) => helperOwners.some((row) => row.proname === name))) {
      throw new Error("T-027 preflight refused: all four T-027 helpers were not catalogued");
    }
    targetValidated = true;
  }

  async function deleteSyntheticGrants(): Promise<void> {
    const placeholders = GRANT_IDS.map((_, index) => `$${index + 1}`).join(",");
    const cleanupTables = [
      "public.support_access_grants",
      "public.support_access_grant_permissions",
      "public.support_access_grant_data_classes",
    ];
    for (const table of cleanupTables) await admin.unsafe(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
    try {
      await admin.begin(async (tx) => {
        await tx.unsafe(`DELETE FROM public.support_access_grants WHERE id IN (${placeholders})`, [...GRANT_IDS]);
        await tx.unsafe(`DELETE FROM public.support_access_grant_permissions WHERE grant_id IN (${placeholders})`, [...GRANT_IDS]);
        await tx.unsafe(`DELETE FROM public.support_access_grant_data_classes WHERE grant_id IN (${placeholders})`, [...GRANT_IDS]);
      });
    } finally {
      for (const table of cleanupTables) await admin.unsafe(`ALTER TABLE ${table} ENABLE TRIGGER ALL`);
    }
  }

  beforeAll(async () => {
    await assertDisposableTarget();
  });

  afterAll(async () => {
    if (targetValidated) await clean();
    else {
      await runtime.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
    }
  });

  async function fixture(): Promise<void> {
    if (!targetValidated) throw new Error("T-027 fixture reached without disposable-target validation");
    await deleteSyntheticGrants();
    await admin.begin(async (tx) => {
      await tx.unsafe("DELETE FROM public.tenant_policies WHERE id IN ($1,$2)", [POLICY_A, POLICY_B]);
      await tx.unsafe("DELETE FROM public.tenant_role_bindings WHERE id IN ($1,$2,$3,$4,$5)", [BINDING_A, BINDING_B, BINDING_SUSPENDED, BINDING_REVOKED, BINDING_FUTURE]);
      await tx.unsafe("DELETE FROM public.tenant_memberships WHERE id IN ($1,$2,$3,$4,$5)", [MEMBERSHIP_A, MEMBERSHIP_B, MEMBERSHIP_SUSPENDED, MEMBERSHIP_REVOKED, MEMBERSHIP_FUTURE]);
      await tx.unsafe("DELETE FROM public.workspaces WHERE id IN ($1,$2,$3)", [WORKSPACE_A, WORKSPACE_B, WORKSPACE_ARCHIVED]);
      await tx.unsafe("DELETE FROM public.tenants WHERE id IN ($1,$2,$3)", [TENANT_A, TENANT_B, TENANT_SUSPENDED]);
      await tx.unsafe("INSERT INTO public.tenants (id, slug, name, status) VALUES ($1, 't027-tenant-a', 'Overlapping Synthetic Tenant', 'active'), ($2, 't027-tenant-b', 'Overlapping Synthetic Tenant', 'active'), ($3, 't027-tenant-suspended', 'Suspended Synthetic Tenant', 'suspended')", [TENANT_A, TENANT_B, TENANT_SUSPENDED]);
      await tx.unsafe("INSERT INTO public.workspaces (id, tenant_id, slug, name, status) VALUES ($1, $2, 'shared-workspace', 'Synthetic Workspace', 'active'), ($3, $4, 'shared-workspace', 'Synthetic Workspace', 'active'), ($5, $2, 'archived-workspace', 'Archived Synthetic Workspace', 'archived')", [WORKSPACE_A, TENANT_A, WORKSPACE_B, TENANT_B, WORKSPACE_ARCHIVED]);
      await tx.unsafe("INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES ($1, $2, $3, $4, 'active'), ($5, $6, $7, $8, 'active'), ($9, $10, $11, $12, 'suspended'), ($13, $14, $15, $16, 'revoked'), ($17, $18, $19, $20, 'active')", [MEMBERSHIP_A, TENANT_A, ACTOR_A, WORKSPACE_A, MEMBERSHIP_B, TENANT_B, ACTOR_B, WORKSPACE_B, MEMBERSHIP_SUSPENDED, TENANT_A, ACTOR_SUSPENDED, WORKSPACE_A, MEMBERSHIP_REVOKED, TENANT_A, ACTOR_REVOKED, WORKSPACE_A, MEMBERSHIP_FUTURE, TENANT_A, ACTOR_FUTURE, WORKSPACE_A]);
      await tx.unsafe("INSERT INTO public.tenant_role_bindings (id, tenant_id, membership_id, role, valid_from, revoked_at) VALUES ($1, $2, $3, 'owner', now() - interval '1 minute', null), ($4, $5, $6, 'researcher', now() - interval '1 minute', null), ($7, $8, $9, 'researcher', now() - interval '2 minutes', null), ($10, $11, $12, 'owner', now() - interval '2 minutes', now() - interval '1 minute'), ($13, $14, $15, 'researcher', now() + interval '2 seconds', null)", [BINDING_A, TENANT_A, MEMBERSHIP_A, BINDING_B, TENANT_B, MEMBERSHIP_B, BINDING_SUSPENDED, TENANT_A, MEMBERSHIP_SUSPENDED, BINDING_REVOKED, TENANT_A, MEMBERSHIP_REVOKED, BINDING_FUTURE, TENANT_A, MEMBERSHIP_FUTURE]);
      await tx.unsafe("INSERT INTO public.tenant_policies (id, tenant_id) VALUES ($1, $2), ($3, $4)", [POLICY_A, TENANT_A, POLICY_B, TENANT_B]);
    });

    const now = new Date();
    const before = new Date(now.getTime() - 60_000).toISOString();
    const after = new Date(now.getTime() + 60 * 60_000).toISOString();
    await insertGrant(admin, { id: GRANT_VALID, actor: SUPPORT_VALID, workspaceId: null, permission: "tenant:read", dataClass: "tenant_metadata", startsAt: before, expiresAt: after });
    await insertGrant(admin, { id: GRANT_WORKSPACE, actor: SUPPORT_WORKSPACE, workspaceId: WORKSPACE_A, permission: "workspace:read", dataClass: "workspace_metadata", startsAt: before, expiresAt: after });
    await insertGrant(admin, { id: GRANT_BAD_CLASS, actor: SUPPORT_BAD_CLASS, workspaceId: null, permission: "tenant:read", dataClass: "workspace_metadata", startsAt: before, expiresAt: after });
    await insertGrant(admin, { id: GRANT_REVOKED, actor: SUPPORT_REVOKED, workspaceId: null, permission: "tenant:read", dataClass: "tenant_metadata", startsAt: before, expiresAt: after, state: "revoked" });
    await insertGrant(admin, { id: GRANT_EXPIRED, actor: SUPPORT_EXPIRED, workspaceId: null, permission: "tenant:read", dataClass: "tenant_metadata", startsAt: before, expiresAt: new Date(now.getTime() - 1_000).toISOString() });
    await insertGrant(admin, { id: GRANT_EXPIRING, actor: SUPPORT_EXPIRING, workspaceId: null, permission: "tenant:read", dataClass: "tenant_metadata", startsAt: before, expiresAt: new Date(now.getTime() + 700).toISOString() });
  }

  async function clean(): Promise<void> {
    await deleteSyntheticGrants();
    await admin.begin(async (tx) => {
      await tx.unsafe("DELETE FROM public.tenant_policies WHERE id IN ($1,$2)", [POLICY_A, POLICY_B]);
      await tx.unsafe("DELETE FROM public.tenant_role_bindings WHERE id IN ($1,$2,$3,$4,$5)", [BINDING_A, BINDING_B, BINDING_SUSPENDED, BINDING_REVOKED, BINDING_FUTURE]);
      await tx.unsafe("DELETE FROM public.tenant_memberships WHERE id IN ($1,$2,$3,$4,$5)", [MEMBERSHIP_A, MEMBERSHIP_B, MEMBERSHIP_SUSPENDED, MEMBERSHIP_REVOKED, MEMBERSHIP_FUTURE]);
      await tx.unsafe("DELETE FROM public.workspaces WHERE id IN ($1,$2,$3)", [WORKSPACE_A, WORKSPACE_B, WORKSPACE_ARCHIVED]);
      await tx.unsafe("DELETE FROM public.tenants WHERE id IN ($1,$2,$3)", [TENANT_A, TENANT_B, TENANT_SUSPENDED]);
    });
    await runtime.end({ timeout: 5 });
    await admin.end({ timeout: 5 });
  }

  it("proves ownership, role attributes, forced RLS, policy inventory, and anon posture", async () => {
    await fixture();
      const receipt = await runtime.unsafe<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean; owner: string }[]>(`
        SELECT current_user, role.rolsuper, role.rolbypassrls,
          (SELECT tableowner FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') AS owner
        FROM pg_catalog.pg_roles AS role WHERE role.rolname = current_user
      `);
      expect(receipt[0]?.current_user).toBe(process.env.T027_RUNTIME_ROLE);
      expect(receipt[0]?.rolsuper).toBe(false);
      expect(receipt[0]?.rolbypassrls).toBe(false);
      expect(receipt[0]?.owner).not.toBe(receipt[0]?.current_user);
      const ownership = await runtime.unsafe<{ tablename: string; tableowner: string }[]>(`
        SELECT tablename, tableowner
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (${TABLES.map((table) => `'${table}'`).join(",")})
        ORDER BY tablename
      `);
      expect(ownership).toHaveLength(TABLES.length);
      expect(new Set(ownership.map((row) => row.tableowner))).toEqual(new Set([expectedOwner]));
      const helperOwners = await runtime.unsafe<{
        owner: string;
        owner_super: boolean;
        owner_bypassrls: boolean;
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
      }[]>(`
        SELECT owner.rolname AS owner, owner.rolsuper AS owner_super,
          owner.rolbypassrls AS owner_bypassrls, proc.proname, proc.prosecdef,
          proc.proconfig
        FROM pg_catalog.pg_proc AS proc
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
        WHERE proc.pronamespace = 'public'::regnamespace
          AND proc.proname IN (${HELPER_NAMES.map((name) => `'${name}'`).join(",")})
      `);
      expect(helperOwners).toHaveLength(4);
      expect(new Set(helperOwners.map((row) => row.owner))).toEqual(new Set([expectedOwner]));
      expect(helperOwners.every((row) => row.prosecdef && (row.owner_super || row.owner_bypassrls) && JSON.stringify(row.proconfig) === JSON.stringify(EXPECTED_HELPER_SEARCH_PATH))).toBe(true);

      const inventory = await runtime.unsafe<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policy_count: string }[]>(`
        SELECT cls.relname, cls.relrowsecurity, cls.relforcerowsecurity, count(pol.policyname)::text AS policy_count
        FROM pg_catalog.pg_class AS cls
        LEFT JOIN pg_catalog.pg_policies AS pol ON pol.schemaname = 'public' AND pol.tablename = cls.relname
        WHERE cls.relnamespace = 'public'::regnamespace AND cls.relname IN (${TABLES.map((table) => `'${table}'`).join(",")})
        GROUP BY cls.relname, cls.relrowsecurity, cls.relforcerowsecurity
        ORDER BY cls.relname
      `);
      expect(inventory).toHaveLength(TABLES.length);
      expect(inventory.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
      const policies = await runtime.unsafe<{
        tablename: string;
        policyname: string;
        permissive: string;
        roles: string[];
        cmd: string;
        qual: string | null;
        with_check: string | null;
      }[]>(`
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (${TABLES.map((table) => `'${table}'`).join(",")})
        ORDER BY tablename, policyname
      `);
      expect(policies).toHaveLength(Object.keys(EXPECTED_POLICY_SHAPE).length);
      expect(new Set(policies.map((row) => row.policyname))).toEqual(new Set(Object.keys(EXPECTED_POLICY_SHAPE)));
      for (const policy of policies) {
        const expected = EXPECTED_POLICY_SHAPE[policy.policyname];
        expect(expected).toBeDefined();
        expect(policy.permissive).toBe("PERMISSIVE");
        expect(policy.roles).toEqual(["public"]);
        expect(policy.cmd).toBe(expected.cmd);
        if (expected.deny) {
          expect(policy.qual).toBe("false");
          expect(policy.with_check).toBe("false");
        } else {
          expect(policy.qual).not.toBeNull();
          expect(policy.with_check).toBeNull();
        }
      }
      const privileges = await runtime.unsafe<{ table_name: string; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }[]>(`
        SELECT table_name,
          has_table_privilege(current_user, format('public.%s', table_name), 'SELECT') AS can_select,
          has_table_privilege(current_user, format('public.%s', table_name), 'INSERT') AS can_insert,
          has_table_privilege(current_user, format('public.%s', table_name), 'UPDATE') AS can_update,
          has_table_privilege(current_user, format('public.%s', table_name), 'DELETE') AS can_delete
        FROM unnest(ARRAY[${TABLES.map((table) => `'${table}'`).join(",")}]) AS table_name
      `);
      expect(privileges.every((row) => row.can_select && row.can_insert && row.can_update && row.can_delete)).toBe(true);

      const anonPosture = await runtime.unsafe<{ table_name: string; anon_select: boolean; authenticated_select: boolean }[]>(`
        SELECT table_name,
          has_table_privilege('anon', format('public.%s', table_name), 'SELECT') AS anon_select,
          has_table_privilege('authenticated', format('public.%s', table_name), 'SELECT') AS authenticated_select
        FROM unnest(ARRAY[${TABLES.map((table) => `'${table}'`).join(",")}]) AS table_name
      `);
      expect(anonPosture.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
  });

  it("isolates member visibility and denies malformed, stale, conflicting, and worker contexts", async () => {
    await fixture();
      expect(await visibleIds(runtime, memberA, "tenants")).toEqual([TENANT_A]);
      expect(await visibleIds(runtime, memberA, "workspaces")).toEqual([WORKSPACE_A]);
      expect(await visibleIds(runtime, memberA, "tenant_policies")).toEqual([POLICY_A]);
      expect(await visibleIds(runtime, memberB, "tenants")).toEqual([TENANT_B]);
      expect(await visibleIds(runtime, memberB, "workspaces")).toEqual([WORKSPACE_B]);
      expect(await visibleIds(runtime, memberB, "tenant_policies")).toEqual([POLICY_B]);
      expect(await visibleIds(runtime, { ...memberA, workspaceId: WORKSPACE_B }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, tenantId: TENANT_B }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, membershipId: MEMBERSHIP_SUSPENDED, actorId: ACTOR_SUSPENDED, roleBindingId: BINDING_SUSPENDED }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, membershipId: MEMBERSHIP_REVOKED, actorId: ACTOR_REVOKED, roleBindingId: BINDING_REVOKED }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, tenantId: TENANT_SUSPENDED }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { tenantId: TENANT_A }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, tenantId: "not-a-uuid" }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, supportGrantId: GRANT_VALID }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, jobId: "60000000-0000-4000-8000-000000000001" }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, role: "admin", roleBindingId: BINDING_A }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...memberA, tenantId: "", workspaceId: "", actorId: "", membershipId: "", role: "", roleBindingId: "", correlationId: "" }, "tenants")).toEqual([]);
  });

  it("denies every member CRUD mutation and blocks reassignment across all foundation tables", async () => {
    await fixture();
      await expectMutationDenied(runtime, memberA, "tenants", [
        `INSERT INTO public.tenants (slug, name) VALUES ('t027-deny-tenant', 'Denied') RETURNING id`,
        `UPDATE public.tenants SET name = name WHERE id = '${TENANT_A}' RETURNING id`,
        `DELETE FROM public.tenants WHERE id = '${TENANT_A}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "workspaces", [
        `INSERT INTO public.workspaces (tenant_id, slug, name) VALUES ('${TENANT_A}', 't027-deny-workspace', 'Denied') RETURNING id`,
        `UPDATE public.workspaces SET tenant_id = '${TENANT_B}' WHERE id = '${WORKSPACE_A}' RETURNING id`,
        `DELETE FROM public.workspaces WHERE id = '${WORKSPACE_A}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "tenant_memberships", [
        `INSERT INTO public.tenant_memberships (tenant_id, auth_identity_id, status) VALUES ('${TENANT_A}', '${ACTOR_A}', 'active') RETURNING id`,
        `UPDATE public.tenant_memberships SET tenant_id = '${TENANT_B}' WHERE id = '${MEMBERSHIP_A}' RETURNING id`,
        `DELETE FROM public.tenant_memberships WHERE id = '${MEMBERSHIP_A}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "tenant_role_bindings", [
        `INSERT INTO public.tenant_role_bindings (tenant_id, membership_id, role) VALUES ('${TENANT_A}', '${MEMBERSHIP_A}', 'admin') RETURNING id`,
        `UPDATE public.tenant_role_bindings SET tenant_id = '${TENANT_B}' WHERE id = '${BINDING_A}' RETURNING id`,
        `DELETE FROM public.tenant_role_bindings WHERE id = '${BINDING_A}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "tenant_policies", [
        `INSERT INTO public.tenant_policies (tenant_id) VALUES ('${TENANT_A}') RETURNING id`,
        `UPDATE public.tenant_policies SET tenant_id = '${TENANT_B}' WHERE id = '${POLICY_A}' RETURNING id`,
        `DELETE FROM public.tenant_policies WHERE id = '${POLICY_A}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "support_access_grants", [
        `INSERT INTO public.support_access_grants (tenant_id, support_actor_auth_identity_id, requested_by_auth_identity_id, reason_code, reason, starts_at, expires_at, correlation_id, audit_event_id, permission_anchor, data_class_anchor) VALUES ('${TENANT_A}', '${SUPPORT_VALID}', '${ACTOR_A}', 'diagnostic-review', 'Denied', now(), now() + interval '1 hour', 't027-denied-grant', '${GRANT_VALID}', 'tenant:read', 'tenant_metadata') RETURNING id`,
        `UPDATE public.support_access_grants SET tenant_id = '${TENANT_B}' WHERE id = '${GRANT_VALID}' RETURNING id`,
        `DELETE FROM public.support_access_grants WHERE id = '${GRANT_VALID}' RETURNING id`,
      ]);
      await expectMutationDenied(runtime, memberA, "support_access_grant_permissions", [
        `INSERT INTO public.support_access_grant_permissions (grant_id, permission) VALUES ('${GRANT_VALID}', 'tenant:read') RETURNING grant_id`,
        `UPDATE public.support_access_grant_permissions SET grant_id = '${GRANT_WORKSPACE}' WHERE grant_id = '${GRANT_VALID}' RETURNING grant_id`,
        `DELETE FROM public.support_access_grant_permissions WHERE grant_id = '${GRANT_VALID}' RETURNING grant_id`,
      ]);
      await expectMutationDenied(runtime, memberA, "support_access_grant_data_classes", [
        `INSERT INTO public.support_access_grant_data_classes (grant_id, data_class) VALUES ('${GRANT_VALID}', 'tenant_metadata') RETURNING grant_id`,
        `UPDATE public.support_access_grant_data_classes SET grant_id = '${GRANT_WORKSPACE}' WHERE grant_id = '${GRANT_VALID}' RETURNING grant_id`,
        `DELETE FROM public.support_access_grant_data_classes WHERE grant_id = '${GRANT_VALID}' RETURNING grant_id`,
      ]);
  });

  it("denies representative CRUD mutations under support, worker, and mixed contexts", async () => {
    await fixture();
    const mutationStatements = (slug: string) => [
      `INSERT INTO public.tenants (slug, name) VALUES ('${slug}', 'Denied') RETURNING id`,
      `UPDATE public.workspaces SET name = name WHERE id = '${WORKSPACE_A}' RETURNING id`,
      `DELETE FROM public.tenant_policies WHERE id = '${POLICY_A}' RETURNING id`,
    ];
    await expectMutationDenied(runtime, supportA, "tenants", mutationStatements("t027-support-deny"));
    await expectMutationDenied(runtime, workerA, "tenants", mutationStatements("t027-worker-deny"));
    await expectMutationDenied(runtime, { ...memberA, supportGrantId: GRANT_VALID }, "tenants", mutationStatements("t027-mixed-deny"));
  });

  it("requires exact support actor, scope, permission, data class, and live grant window", async () => {
    await fixture();
      const supportTenant: Context = { tenantId: TENANT_A, actorId: SUPPORT_VALID, supportGrantId: GRANT_VALID, correlationId: "t027-support-tenant" };
      expect(await visibleIds(runtime, supportTenant, "tenants")).toEqual([TENANT_A]);
      expect(await visibleIds(runtime, supportTenant, "tenant_policies")).toEqual([POLICY_A]);
      expect(await visibleIds(runtime, supportTenant, "workspaces")).toEqual([]);
      await admin.unsafe("UPDATE public.tenants SET status = 'suspended' WHERE id = $1", [TENANT_A]);
      expect(await visibleIds(runtime, supportTenant, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, supportTenant, "tenant_policies")).toEqual([]);
      await admin.unsafe("UPDATE public.tenants SET status = 'active' WHERE id = $1", [TENANT_A]);
      expect(await visibleIds(runtime, { ...supportTenant, actorId: SUPPORT_WORKSPACE, supportGrantId: GRANT_WORKSPACE, workspaceId: WORKSPACE_A }, "workspaces")).toEqual([WORKSPACE_A]);
      expect(await visibleIds(runtime, { ...supportTenant, workspaceId: WORKSPACE_A }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, actorId: SUPPORT_BAD_CLASS, supportGrantId: GRANT_BAD_CLASS }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, actorId: SUPPORT_REVOKED, supportGrantId: GRANT_REVOKED }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, actorId: SUPPORT_EXPIRED, supportGrantId: GRANT_EXPIRED }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, tenantId: TENANT_B }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, membershipId: MEMBERSHIP_A }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, jobId: "60000000-0000-4000-8000-000000000001" }, "tenants")).toEqual([]);
      expect(await visibleIds(runtime, { ...supportTenant, actorId: ACTOR_A }, "tenants")).toEqual([]);
  });

  it("removes support visibility after revocation and expiry, and clears pooled transaction-local context", async () => {
    await fixture();
      const supportTenant: Context = { tenantId: TENANT_A, actorId: SUPPORT_VALID, supportGrantId: GRANT_VALID, correlationId: "t027-support-revoke" };
      expect(await visibleIds(runtime, supportTenant, "tenants")).toEqual([TENANT_A]);
      await admin.unsafe("UPDATE public.support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = $1, revoked_at = now() WHERE id = $2", [ACTOR_A, GRANT_VALID]);
      expect(await visibleIds(runtime, supportTenant, "tenants")).toEqual([]);
      const expiring: Context = { tenantId: TENANT_A, actorId: SUPPORT_EXPIRING, supportGrantId: GRANT_EXPIRING, correlationId: "t027-support-expiry" };
      const supportSameTransaction = await runtime.begin(async (tx) => {
        await installContext(tx, expiring);
        const beforeExpiry = await tx.unsafe<{ id: string }[]>("SELECT id::text AS id FROM public.tenants ORDER BY id::text");
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        const afterExpiry = await tx.unsafe<{ id: string }[]>("SELECT id::text AS id FROM public.tenants ORDER BY id::text");
        return { before: beforeExpiry.map((row) => row.id), after: afterExpiry.map((row) => row.id) };
      });
      expect(supportSameTransaction).toEqual({ before: [TENANT_A], after: [] });

      const futureMember: Context = {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        actorId: ACTOR_FUTURE,
        membershipId: MEMBERSHIP_FUTURE,
        role: "researcher",
        roleBindingId: BINDING_FUTURE,
        correlationId: "t027-role-activation",
      };
      const roleSameTransaction = await runtime.begin(async (tx) => {
        await installContext(tx, futureMember);
        const beforeActivation = await tx.unsafe<{ id: string }[]>("SELECT id::text AS id FROM public.tenants ORDER BY id::text");
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const afterActivation = await tx.unsafe<{ id: string }[]>("SELECT id::text AS id FROM public.tenants ORDER BY id::text");
        return { before: beforeActivation.map((row) => row.id), after: afterActivation.map((row) => row.id) };
      });
      expect(roleSameTransaction).toEqual({ before: [], after: [TENANT_A] });

      expect(await visibleIds(runtime, memberA, "tenants")).toEqual([TENANT_A]);
      expect(await visibleIds(runtime, memberB, "tenants")).toEqual([TENANT_B]);
      const cleared = await runtime.unsafe<{ tenant_id: string | null; actor_id: string | null; support_grant_id: string | null }[]>(`
        SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
          NULLIF(current_setting('app.actor_id', true), '') AS actor_id,
          NULLIF(current_setting('app.support_grant_id', true), '') AS support_grant_id
      `);
      expect(cleared[0]).toEqual({ tenant_id: null, actor_id: null, support_grant_id: null });
      expect(await visibleIds(runtime, emptyContext, "tenants")).toEqual([]);
  });
});
