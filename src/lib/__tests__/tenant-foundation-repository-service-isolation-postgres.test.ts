import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  resetDbClient,
  withTenantDbContext,
  type DbClient,
} from "@/lib/db";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantFeatureService, TENANT_FEATURES } from "@/lib/tenancy/features";
import {
  createTenantLifecycleService,
  TenantLifecycleError,
} from "@/lib/tenancy/lifecycle";
import {
  createTenantQueryRepository,
  TenantRecordNotFoundError,
} from "@/lib/tenancy/queries";
import {
  CANONICAL_TENANT_FIXTURE_COUNTS,
  CANONICAL_TENANT_FIXTURE_IDS,
  cleanupCanonicalTenantCoreFixtures,
  createCanonicalTenantFixtureSession,
  createCanonicalTenantFixtureTransactionCoordinator,
  setupCanonicalTenantCoreFixtures,
  withCanonicalTenantFixtures,
  type CanonicalTenantFixtureTransactionScope,
} from "@/test/tenants";

const disposableClusterAcknowledgement = "I_ACKNOWLEDGE_Q006A_DISPOSABLE_POSTGRES16";
const adminUrl = process.env.Q006A_POSTGRES_ADMIN_URL;
const enabled = resolvePostgresActivation();
const runToken = `${process.pid}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const databaseName = `q006a_foundation_${runToken}`;
const runtimeRole = `q006a_runtime_${runToken}`;
const runtimePassword = `q006a-${randomUUID()}-${randomUUID()}`;
const forgedTenantId = "10000000-0000-4000-8000-000000000099";
const forgedWorkspaceId = "20000000-0000-4000-8000-000000000099";

const foundationTables = [
  "tenants",
  "workspaces",
  "tenant_memberships",
  "tenant_role_bindings",
  "tenant_policies",
  "support_access_grants",
  "support_access_grant_permissions",
  "support_access_grant_data_classes",
] as const;

const skippedSupabaseOnlyMigrations = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseSsl = process.env.DATABASE_SSL;
let admin: Sql | undefined;
let owner: Sql | undefined;
let targetCreated = false;
let roleCreated = false;
const bootstrapRolesCreatedByThisRun: Array<"anon" | "authenticated"> = [];

describe.runIf(enabled)("Q-006A foundation repository/service isolation on PostgreSQL 16", () => {
  it("fails closed through the existing foundation contracts and leaves no canonical rows", async () => {
    const parsedAdminUrl = parseAdminUrl(adminUrl!);
    expect(["127.0.0.1", "::1", "localhost"]).toContain(parsedAdminUrl.hostname);
    expect(databaseName).toMatch(/^q006a_foundation_[a-z0-9_]+$/);
    expect(runtimeRole).toMatch(/^q006a_runtime_[a-z0-9_]+$/);

    admin = postgres(adminUrl!, { max: 1, prepare: false, onnotice: () => undefined });
    const version = await admin`SHOW server_version_num`;
    expect(Number(version[0].server_version_num)).toBeGreaterThanOrEqual(160000);
    expect(Number(version[0].server_version_num)).toBeLessThan(170000);

    await ensureBootstrapRolesAreSafe(admin);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    targetCreated = true;
    parsedAdminUrl.pathname = `/${databaseName}`;
    owner = postgres(parsedAdminUrl.toString(), { max: 1, prepare: false, onnotice: () => undefined });

    const migrationReceipt = await installTrackedMigrationSchema(owner);
    expect(migrationReceipt).toEqual({ discovered: 59, applied: 57, skipped: 2 });
    await seedFixtureAuthUsers(owner);
    await provisionRestrictedRuntime(owner);

    const transaction = postgresFixtureTransaction(owner);
    const coreFixture = await setupCanonicalTenantCoreFixtures({ transaction });
    expect(coreFixture.tenants).toHaveLength(2);
    expect(await foundationCounts(owner)).toEqual({
      tenants: 2,
      workspaces: 4,
      tenant_memberships: 20,
      tenant_role_bindings: 14,
      tenant_policies: 2,
      support_access_grants: 0,
      support_access_grant_permissions: 0,
      support_access_grant_data_classes: 0,
    });

    const runtimeUrl = new URL(parsedAdminUrl.toString());
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = runtimePassword;
    process.env.DATABASE_URL = runtimeUrl.toString();
    process.env.DATABASE_SSL = "disable";
    await resetDbClient();

    await assertRestrictedRuntimePreflight();
    await assertMissingContextFailsClosed();
    await assertTenantARepositoryAndFeatureIsolation();
    await assertTenantBRepositoryIsolation();
    await assertFoundationWritesFailClosed(owner);

    await resetDbClient();
    restoreDatabaseEnvironment();
    await cleanupCanonicalTenantCoreFixtures({ transaction });
    expect(await foundationCounts(owner)).toEqual(emptyFoundationCounts());

    await assertRollbackOnlySupportHistory(transaction, owner);
    expect(await foundationCounts(owner)).toEqual(emptyFoundationCounts());
  }, 180_000);
});

afterAll(async () => {
  let cleanupError: unknown;
  try {
    await resetDbClient();
  } catch (error) {
    cleanupError = error;
  } finally {
    restoreDatabaseEnvironment();
  }
  try {
    await owner?.end({ timeout: 5 });
  } catch (error) {
    cleanupError ??= error;
  }

  let databaseDropped = !targetCreated;
  if (admin) {
    try {
      if (targetCreated) {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
        targetCreated = false;
      }
      databaseDropped = true;
    } catch (error) {
      cleanupError ??= error;
    }

    // Never remove cluster-wide roles while the disposable database may still depend on them.
    if (databaseDropped) {
      if (roleCreated) {
        try {
          await admin.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`);
          roleCreated = false;
        } catch (error) {
          cleanupError ??= error;
        }
      }
      for (const role of bootstrapRolesCreatedByThisRun.reverse()) {
        try {
          await admin.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
        } catch (error) {
          cleanupError ??= error;
        }
      }
      bootstrapRolesCreatedByThisRun.length = 0;
    }

    try {
      await admin.end({ timeout: 5 });
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
});

function resolvePostgresActivation(): boolean {
  const flag = process.env.Q006A_POSTGRES16;
  const url = process.env.Q006A_POSTGRES_ADMIN_URL;
  if (flag === undefined && url === undefined) return false;
  if (flag !== "1" || !url) {
    throw new Error("Q-006A PostgreSQL activation requires Q006A_POSTGRES16=1 and Q006A_POSTGRES_ADMIN_URL together.");
  }
  if (process.env.Q006A_DISPOSABLE_CLUSTER_ACK !== disposableClusterAcknowledgement) {
    throw new Error(
      `Q-006A PostgreSQL activation requires Q006A_DISPOSABLE_CLUSTER_ACK=${disposableClusterAcknowledgement}.`,
    );
  }
  return true;
}

function parseAdminUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error("Q-006A PostgreSQL administrative URL is invalid.");
  }
}

async function ensureBootstrapRolesAreSafe(client: Sql): Promise<void> {
  for (const role of ["anon", "authenticated"] as const) {
    const rows = await client.unsafe<Array<{
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolcanlogin: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      owns_database: boolean;
      owns_objects: boolean;
      has_memberships: boolean;
    }>>(`
      SELECT role.rolsuper,
             role.rolinherit,
             role.rolcreaterole,
             role.rolcreatedb,
             role.rolcanlogin,
             role.rolreplication,
             role.rolbypassrls,
             EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = role.oid) AS owns_database,
             EXISTS (
               SELECT 1 FROM pg_catalog.pg_shdepend
               WHERE refclassid = 'pg_catalog.pg_authid'::regclass
                 AND refobjid = role.oid
                 AND deptype = 'o'
             ) AS owns_objects,
             EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members
               WHERE roleid = role.oid OR member = role.oid
             ) AS has_memberships
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = ${quoteLiteral(role)}
    `);
    const existing = rows[0];
    if (!existing) {
      await client.unsafe(
        `CREATE ROLE ${quoteIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
      bootstrapRolesCreatedByThisRun.push(role);
      continue;
    }
    const unsafe = existing.rolsuper || existing.rolinherit || existing.rolcreaterole ||
      existing.rolcreatedb || existing.rolcanlogin || existing.rolreplication ||
      existing.rolbypassrls || existing.owns_database || existing.owns_objects || existing.has_memberships;
    if (unsafe) {
      throw new Error(`Q-006A refuses unsafe preexisting bootstrap role ${role}.`);
    }
  }
}

async function assertRestrictedRuntimePreflight(): Promise<void> {
  const receipt = await withCanonicalContext("A", async (db) => db.prepare(`
    SELECT current_user,
           role.rolsuper,
           role.rolbypassrls,
           (SELECT tableowner FROM pg_catalog.pg_tables
            WHERE schemaname = 'public' AND tablename = 'tenants') AS table_owner
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
  `).get<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean; table_owner: string }>());
  expect(receipt).toMatchObject({ current_user: runtimeRole, rolsuper: false, rolbypassrls: false });
  expect(receipt?.table_owner).not.toBe(runtimeRole);

  const privileges = await withCanonicalContext("A", async (db) => db.prepare(`
    SELECT table_name,
           has_table_privilege(current_user, 'public.' || table_name, 'SELECT') AS can_select,
           has_table_privilege(current_user, 'public.' || table_name, 'INSERT') AS can_insert,
           has_table_privilege(current_user, 'public.' || table_name, 'UPDATE') AS can_update,
           has_table_privilege(current_user, 'public.' || table_name, 'DELETE') AS can_delete
    FROM unnest(ARRAY[${foundationTables.map((table) => `'${table}'`).join(", ")}]) AS table_name
    ORDER BY table_name
  `).all<{ table_name: string; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>());
  expect(privileges).toHaveLength(foundationTables.length);
  expect(privileges.every((row) => row.can_select && row.can_insert && row.can_update && row.can_delete)).toBe(true);
}

async function assertMissingContextFailsClosed(): Promise<void> {
  const repository = createTenantQueryRepository();
  const tenantA = CANONICAL_TENANT_FIXTURE_IDS.tenants.A;
  const workspaceA = CANONICAL_TENANT_FIXTURE_IDS.workspaces.A;

  await expect(repository.getTenant(tenantA)).resolves.toBeNull();
  await expect(repository.getWorkspace(tenantA, workspaceA)).resolves.toBeNull();
  await expect(repository.listWorkspaces(tenantA)).resolves.toEqual([]);
  await expect(repository.createWorkspace(tenantA, {
    id: forgedWorkspaceId,
    slug: "missing-context",
    name: "Missing context must not write",
  })).rejects.toSatisfy(isDatabaseWriteDenied);

  const featureService = readOnlyFeatureService(repository);
  await expect(featureService.resolveFeature(tenantA, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({
    tenantId: tenantA,
    state: "unconfigured",
    reasonCode: "POLICY_MISSING",
  });
}

async function assertTenantARepositoryAndFeatureIsolation(): Promise<void> {
  const ids = CANONICAL_TENANT_FIXTURE_IDS;
  await withCanonicalContext("A", async (db) => {
    const repository = createTenantQueryRepository(db);

    await expect(repository.getTenant(ids.tenants.A)).resolves.toMatchObject({ id: ids.tenants.A, slug: "synthetic-tenant-a" });
    await expect(repository.getTenant(ids.tenants.B)).resolves.toBeNull();
    await expect(repository.getTenant(forgedTenantId)).resolves.toBeNull();

    const workspaces = await repository.listWorkspaces(ids.tenants.A);
    expect(workspaces.map(({ id, tenantId, slug }) => ({ id, tenantId, slug }))).toEqual([
      { id: ids.workspaces.A, tenantId: ids.tenants.A, slug: "shared-workspace" },
    ]);
    await expect(repository.listWorkspaces(ids.tenants.B)).resolves.toEqual([]);
    await expect(repository.getWorkspace(ids.tenants.A, ids.workspaces.B)).resolves.toBeNull();
    await expect(repository.getWorkspace(ids.tenants.A, forgedWorkspaceId)).resolves.toBeNull();

    const memberships = await repository.listMemberships(ids.tenants.A);
    expect(memberships).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.memberships / 2);
    expect(new Set(memberships.map((membership) => membership.tenantId))).toEqual(new Set([ids.tenants.A]));
    await expect(repository.listMemberships(ids.tenants.B)).resolves.toEqual([]);
    await expect(repository.getMembership(ids.tenants.A, ids.memberships.B.owner)).resolves.toBeNull();

    await expect(repository.getCurrentRoleBinding(ids.tenants.A, ids.memberships.A.admin)).resolves.toMatchObject({
      id: ids.roleBindings.A.admin,
      tenantId: ids.tenants.A,
      membershipId: ids.memberships.A.admin,
      role: "admin",
    });
    await expect(repository.getCurrentRoleBinding(ids.tenants.A, ids.memberships.B.owner)).resolves.toBeNull();

    await expect(repository.getCurrentTenantPolicy(ids.tenants.A)).resolves.toMatchObject({
      id: ids.policies.A,
      tenantId: ids.tenants.A,
      aiProcessingEnabled: true,
    });
    await expect(repository.getCurrentTenantPolicy(ids.tenants.B)).resolves.toBeNull();

    await expect(repository.withTransaction(async (transactionRepository) =>
      transactionRepository.getTenant(ids.tenants.B))).resolves.toBeNull();

    const featureService = readOnlyFeatureService(repository);
    await expect(featureService.resolveFeature(ids.tenants.A, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({
      state: "enabled",
      policyEnabled: true,
      policyVersion: 1,
    });
    await expect(featureService.resolveFeature(ids.tenants.B, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({
      state: "unconfigured",
      reasonCode: "POLICY_MISSING",
    });
  });
}

async function assertTenantBRepositoryIsolation(): Promise<void> {
  const ids = CANONICAL_TENANT_FIXTURE_IDS;
  await withCanonicalContext("B", async (db) => {
    const repository = createTenantQueryRepository(db);
    await expect(repository.getTenant(ids.tenants.B)).resolves.toMatchObject({ id: ids.tenants.B, slug: "synthetic-tenant-b" });
    await expect(repository.getTenant(ids.tenants.A)).resolves.toBeNull();
    await expect(repository.listWorkspaces(ids.tenants.B)).resolves.toMatchObject([
      { id: ids.workspaces.B, tenantId: ids.tenants.B, slug: "shared-workspace" },
    ]);
    await expect(repository.getWorkspace(ids.tenants.B, ids.lookAlikeRecords.tenantAWorkspace)).resolves.toBeNull();
    await expect(repository.getMembership(ids.tenants.B, ids.memberships.A.owner)).resolves.toBeNull();
    await expect(repository.getCurrentRoleBinding(ids.tenants.B, ids.memberships.A.owner)).resolves.toBeNull();
    await expect(repository.getCurrentTenantPolicy(ids.tenants.A)).resolves.toBeNull();
  });
}

async function assertFoundationWritesFailClosed(ownerDb: Sql): Promise<void> {
  const ids = CANONICAL_TENANT_FIXTURE_IDS;
  const before = await foundationCounts(ownerDb);

  const createAttempts = [
    (repository: ReturnType<typeof createTenantQueryRepository>) => repository.createTenant({
      id: forgedTenantId,
      slug: "runtime-create-denied",
      name: "Runtime create denied",
    }),
    (repository: ReturnType<typeof createTenantQueryRepository>) => repository.createWorkspace(ids.tenants.A, {
      id: forgedWorkspaceId,
      slug: "runtime-create-denied",
      name: "Runtime create denied",
    }),
    (repository: ReturnType<typeof createTenantQueryRepository>) => repository.createMembership(ids.tenants.A, {
      id: "30000000-0000-4000-8000-000000000099",
      authIdentityId: ids.sharedAuthIdentityId,
      workspaceId: ids.workspaces.A,
      status: "active",
    }),
    (repository: ReturnType<typeof createTenantQueryRepository>) => repository.createRoleBinding(ids.tenants.A, {
      id: "40000000-0000-4000-8000-000000000099",
      membershipId: ids.memberships.A.admin,
      role: "admin",
    }),
    (repository: ReturnType<typeof createTenantQueryRepository>) => repository.createTenantPolicy(ids.tenants.A, {
      id: "50000000-0000-4000-8000-000000000099",
    }),
  ];
  for (const attempt of createAttempts) {
    await expect(withCanonicalContext("A", async (db) => attempt(createTenantQueryRepository(db))))
      .rejects.toSatisfy(isDatabaseWriteDenied);
  }

  await withCanonicalContext("A", async (db) => {
    const repository = createTenantQueryRepository(db);
    await expect(repository.updateTenantStatus(ids.tenants.A, "suspended")).rejects.toBeInstanceOf(TenantRecordNotFoundError);
    await expect(repository.updateTenantStatus(ids.tenants.B, "suspended")).rejects.toBeInstanceOf(TenantRecordNotFoundError);
    await expect(repository.updateWorkspaceStatus(ids.tenants.A, ids.workspaces.A, "paused")).rejects.toBeInstanceOf(TenantRecordNotFoundError);
    await expect(repository.updateMembershipStatus(ids.tenants.A, ids.memberships.A.admin, "disabled")).rejects.toBeInstanceOf(TenantRecordNotFoundError);
    await expect(repository.revokeCurrentRoleBinding(ids.tenants.A, ids.memberships.A.admin)).rejects.toBeInstanceOf(TenantRecordNotFoundError);

    const lifecycle = createTenantLifecycleService({
      transactionRunner: {
        run: async (callback) => callback({
          db,
          repository,
          auditWriter: { write: async () => undefined },
        }),
      },
    });
    const request = {
      actorId: ids.sharedAuthIdentityId,
      actorLayer: "member" as const,
      reasonCode: "q006a.isolation",
      reason: "Synthetic lifecycle isolation check",
      correlationId: "q006a-lifecycle-isolation",
      expectedCurrentState: "active" as const,
      toStatus: "suspended" as const,
    };
    await expect(lifecycle.transitionTenantLifecycle({ ...request, tenantId: ids.tenants.A })).rejects.toMatchObject({
      code: "NOT_FOUND_NON_ENUMERATING",
    } satisfies Partial<TenantLifecycleError>);
    await expect(lifecycle.transitionTenantLifecycle({ ...request, tenantId: ids.tenants.B })).rejects.toMatchObject({
      code: "NOT_FOUND_NON_ENUMERATING",
    } satisfies Partial<TenantLifecycleError>);

    const beforeForgedLifecycle = await foundationCounts(ownerDb);
    const beforeTenantStates = await ownerDb.unsafe<Array<{ id: string; status: string }>>(
      "SELECT id::text, status FROM public.tenants ORDER BY id",
    );
    const forgedBefore = await ownerDb.unsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM public.tenants WHERE id = ${quoteLiteral(forgedTenantId)}`,
    );
    expect(Number(forgedBefore[0]?.count ?? -1)).toBe(0);
    await expect(lifecycle.transitionTenantLifecycle({ ...request, tenantId: forgedTenantId })).rejects.toMatchObject({
      code: "NOT_FOUND_NON_ENUMERATING",
    } satisfies Partial<TenantLifecycleError>);
    const forgedAfter = await ownerDb.unsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM public.tenants WHERE id = ${quoteLiteral(forgedTenantId)}`,
    );
    expect(Number(forgedAfter[0]?.count ?? -1)).toBe(0);
    await expect(ownerDb.unsafe<Array<{ id: string; status: string }>>(
      "SELECT id::text, status FROM public.tenants ORDER BY id",
    )).resolves.toEqual(beforeTenantStates);
    expect(await foundationCounts(ownerDb)).toEqual(beforeForgedLifecycle);
  });

  expect(await foundationCounts(ownerDb)).toEqual(before);
}

async function assertRollbackOnlySupportHistory(
  transaction: ReturnType<typeof postgresFixtureTransaction>,
  ownerDb: Sql,
): Promise<void> {
  const ids = CANONICAL_TENANT_FIXTURE_IDS;
  await withCanonicalTenantFixtures({ transaction }, async (fixture, scope) => {
    expect(fixture.supportGrants).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.supportGrants);
    expect(await scopedFoundationCounts(scope.db)).toEqual({
      tenants: 2,
      workspaces: 4,
      tenant_memberships: 20,
      tenant_role_bindings: 14,
      tenant_policies: 2,
      support_access_grants: 2,
      support_access_grant_permissions: 6,
      support_access_grant_data_classes: 6,
    });

    await scope.db.exec(`SET LOCAL ROLE ${quoteIdentifier(runtimeRole)}`);
    await installMemberContext(scope.db, "A");
    expect(await visibleFoundationCounts(scope.db)).toEqual({
      tenants: 1,
      workspaces: 1,
      tenant_memberships: 10,
      tenant_role_bindings: 7,
      tenant_policies: 1,
      support_access_grants: 1,
      support_access_grant_permissions: 3,
      support_access_grant_data_classes: 3,
    });

    expect(await scope.db.prepare("SELECT id FROM workspaces WHERE tenant_id = ? AND id = ?")
      .get(ids.tenants.A, ids.workspaces.B)).toBeUndefined();
    expect(await scope.db.prepare("SELECT id FROM support_access_grants WHERE tenant_id = ? AND id = ?")
      .get(ids.tenants.A, ids.supportGrants.revokedTenantB)).toBeUndefined();

    await clearTenantContext(scope.db);
    expect(await visibleFoundationCounts(scope.db)).toEqual(emptyFoundationCounts());

    await installMemberContext(scope.db, "A");
    const beforeDeniedSupportWrites = await visibleFoundationCounts(scope.db);
    await expectDeniedOrZeroStatement(scope.db,
      "DELETE FROM support_access_grant_permissions WHERE grant_id = ?",
      ids.supportGrants.approvedTenantA,
    );
    await expectDeniedOrZeroStatement(scope.db,
      "UPDATE support_access_grant_data_classes SET data_class = data_class WHERE grant_id = ?",
      ids.supportGrants.approvedTenantA,
    );
    await expectDeniedOrZeroStatement(scope.db,
      "DELETE FROM support_access_grants WHERE id = ?",
      ids.supportGrants.approvedTenantA,
    );
    expect(await visibleFoundationCounts(scope.db)).toEqual(beforeDeniedSupportWrites);
  });

  expect(await foundationCounts(ownerDb)).toEqual(emptyFoundationCounts());
}

function withCanonicalContext<T>(tenantKey: "A" | "B", callback: (db: DbClient) => Promise<T>): Promise<T> {
  return runWithTenantContext(
    createCanonicalTenantFixtureSession(tenantKey),
    `q006a-repository-${tenantKey.toLowerCase()}`,
    () => withTenantDbContext(callback),
  );
}

function readOnlyFeatureService(repository: ReturnType<typeof createTenantQueryRepository>) {
  return createTenantFeatureService({
    policyRepository: repository,
    actorResolver: { resolveFeatureManager: async () => null },
    changeExecutor: { execute: async () => { throw new Error("Q-006A read-only feature service"); } },
  });
}

function isDatabaseWriteDenied(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === "42501" || /row-level security|permission denied|policy/i.test(String(candidate?.message ?? error));
}

async function expectDeniedOrZeroStatement(db: DbClient, query: string, ...params: unknown[]): Promise<void> {
  await db.exec("SAVEPOINT q006a_denied_statement");
  try {
    try {
      expect(await db.prepare(query).run(...params)).toEqual({ changes: 0 });
    } catch (error) {
      if (!isDatabaseWriteDenied(error)) throw error;
    }
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT q006a_denied_statement");
    await db.exec("RELEASE SAVEPOINT q006a_denied_statement");
  }
}

async function installMemberContext(db: DbClient, tenantKey: "A" | "B"): Promise<void> {
  const session = createCanonicalTenantFixtureSession(tenantKey);
  const values: Readonly<Record<string, string>> = {
    "app.tenant_id": session.tenantId,
    "app.workspace_id": session.workspaceId ?? "",
    "app.actor_id": session.userId,
    "app.membership_id": session.membershipId,
    "app.role": session.role,
    "app.role_binding_id": session.roleBindingId,
    "app.support_grant_id": "",
    "app.job_id": "",
    "app.run_id": "",
    "app.lease_id": "",
    "app.lease_generation": "",
    "app.worker_name": "",
    "app.worker_action": "",
    "app.worker_principal_kind": "",
    "app.correlation_id": `q006a-support-history-${tenantKey.toLowerCase()}`,
  };
  for (const [name, value] of Object.entries(values)) {
    await db.prepare("SELECT set_config(?, ?, true)").get(name, value);
  }
}

async function clearTenantContext(db: DbClient): Promise<void> {
  for (const name of [
    "tenant_id", "workspace_id", "actor_id", "membership_id", "role", "role_binding_id",
    "support_grant_id", "job_id", "run_id", "lease_id", "lease_generation", "worker_name",
    "worker_action", "worker_principal_kind", "correlation_id",
  ]) {
    await db.prepare("SELECT set_config(?, '', true)").get(`app.${name}`);
  }
}

async function visibleFoundationCounts(db: DbClient): Promise<Record<(typeof foundationTables)[number], number>> {
  return scopedFoundationCounts(db);
}

async function scopedFoundationCounts(db: DbClient): Promise<Record<(typeof foundationTables)[number], number>> {
  const counts = {} as Record<(typeof foundationTables)[number], number>;
  for (const table of foundationTables) {
    const row = await db.prepare(`SELECT COUNT(*)::int AS count FROM ${table}`).get<{ count: number }>();
    counts[table] = Number(row?.count ?? 0);
  }
  return counts;
}

async function foundationCounts(db: Sql): Promise<Record<(typeof foundationTables)[number], number>> {
  const counts = {} as Record<(typeof foundationTables)[number], number>;
  for (const table of foundationTables) {
    const rows = await db.unsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM public.${table}`);
    counts[table] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

function emptyFoundationCounts(): Record<(typeof foundationTables)[number], number> {
  return Object.fromEntries(foundationTables.map((table) => [table, 0])) as Record<(typeof foundationTables)[number], number>;
}

function postgresFixtureTransaction(client: Sql) {
  return createCanonicalTenantFixtureTransactionCoordinator(async <T>(
    callback: (scope: CanonicalTenantFixtureTransactionScope) => Promise<T>,
  ): Promise<T> => await client.begin(async (transactionSql) => {
    const db = boundedPostgresDbClient(transactionSql);
    return callback({ db, repository: createTenantQueryRepository(db) });
  }) as T);
}

function boundedPostgresDbClient(client: Sql | TransactionSql): DbClient {
  return {
    prepare: (query) => ({
      get: async <T = Record<string, unknown>>(...params: unknown[]) =>
        (await client.unsafe(rewritePlaceholders(query), params as never[]))[0] as T | undefined,
      all: async <T = Record<string, unknown>>(...params: unknown[]) =>
        await client.unsafe(rewritePlaceholders(query), params as never[]) as T[],
      run: async (...params: unknown[]) => ({
        changes: Number((await client.unsafe(rewritePlaceholders(query), params as never[])).count ?? 0),
      }),
    }),
    exec: async (query) => { await client.unsafe(query); },
  };
}

function rewritePlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(identifier)) throw new Error("Unsafe PostgreSQL identifier.");
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function provisionRestrictedRuntime(client: Sql): Promise<void> {
  await admin!.unsafe(
    `CREATE ROLE ${quoteIdentifier(runtimeRole)} LOGIN PASSWORD ${quoteLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  roleCreated = true;
  await admin!.unsafe(`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(runtimeRole)}`);
  await client.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(runtimeRole)}`);
  await client.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${foundationTables.map((table) => `public.${table}`).join(", ")} TO ${quoteIdentifier(runtimeRole)}`);
  await client.unsafe(`GRANT EXECUTE ON FUNCTION
    public.novatrade_rls_member_context(),
    public.novatrade_rls_support_context(),
    public.novatrade_rls_support_tenant_metadata_read(),
    public.novatrade_rls_support_workspace_metadata_read()
    TO ${quoteIdentifier(runtimeRole)}`);
}

async function installTrackedMigrationSchema(client: Sql): Promise<{ discovered: number; applied: number; skipped: number }> {
  await client.unsafe(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.worker_runs (
      id text PRIMARY KEY,
      worker_name text NOT NULL,
      status text NOT NULL DEFAULT 'running',
      trigger_source text NOT NULL DEFAULT 'unknown',
      http_status integer,
      result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      error text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrationFiles = readdirSync(join("supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let applied = 0;
  for (const file of migrationFiles) {
    if (skippedSupabaseOnlyMigrations.has(file)) continue;
    await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") await installPortableMigrationCompatibilityColumns(client);
  }
  return { discovered: migrationFiles.length, applied, skipped: skippedSupabaseOnlyMigrations.size };
}

async function installPortableMigrationCompatibilityColumns(client: Sql): Promise<void> {
  await client.unsafe(`
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1;
    ALTER TABLE public.leads
      ADD COLUMN IF NOT EXISTS ai_website_feedback_status text,
      ADD COLUMN IF NOT EXISTS ai_corrected_website_url text,
      ADD COLUMN IF NOT EXISTS ai_false_positive_reason text,
      ADD COLUMN IF NOT EXISTS ai_reviewer_notes text,
      ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz;
  `);
}

async function seedFixtureAuthUsers(client: Sql): Promise<void> {
  const ids = new Set([
    CANONICAL_TENANT_FIXTURE_IDS.supportActorAuthIdentityId,
    CANONICAL_TENANT_FIXTURE_IDS.sharedAuthIdentityId,
    ...Object.values(CANONICAL_TENANT_FIXTURE_IDS.roleIdentityIds).flatMap(Object.values),
    ...Object.values(CANONICAL_TENANT_FIXTURE_IDS.inactiveIdentityIds).flatMap(Object.values),
  ]);
  for (const id of ids) await client`INSERT INTO auth.users (id) VALUES (${id}) ON CONFLICT DO NOTHING`;
}

function restoreDatabaseEnvironment(): void {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalDatabaseSsl === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = originalDatabaseSsl;
}
