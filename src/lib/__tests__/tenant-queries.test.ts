import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";
import {
  createTenantQueryRepository,
  TenantRecordNotFoundError,
  type TenantQueryRepository,
} from "@/lib/tenancy/queries";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const TENANT_C = "00000000-0000-4000-8000-000000000003";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_C = "10000000-0000-4000-8000-000000000003";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_C = "20000000-0000-4000-8000-000000000003";
const ROLE_A = "30000000-0000-4000-8000-000000000001";
const ROLE_B = "30000000-0000-4000-8000-000000000002";
const ROLE_C = "30000000-0000-4000-8000-000000000003";
const ROLE_HISTORY = "30000000-0000-4000-8000-000000000004";
const POLICY_A = "40000000-0000-4000-8000-000000000001";
const POLICY_B = "40000000-0000-4000-8000-000000000002";
const POLICY_C = "40000000-0000-4000-8000-000000000003";
const AUTH_A = "50000000-0000-4000-8000-000000000001";
const AUTH_B = "50000000-0000-4000-8000-000000000002";

const openDatabases: Database.Database[] = [];

function createDb(withTransaction = true): { database: Database.Database; client: DbClient } {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_SQL);
  openDatabases.push(database);

  const client: DbClient = {
    prepare(query) {
      const statement = database.prepare(query);
      return {
        get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
        all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
        run: async (...params: unknown[]) => ({ changes: statement.run(...params).changes }),
      };
    },
    exec: async (query) => {
      database.exec(query);
    },
  };

  if (withTransaction) {
    client.withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
      database.exec("BEGIN");
      try {
        const result = await fn();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    };
  }

  return { database, client };
}

function createPostgresShapedReadDb(overrides: { tenantCreatedAt?: unknown } = {}): DbClient {
  const tenantCreatedAt = overrides.tenantCreatedAt ?? new Date("2026-07-27T00:00:00.000Z");
  const updatedAt = new Date("2026-07-27T01:00:00.000Z");
  const roleRevokedAt = new Date("2026-07-28T00:00:00.000Z");
  const rows = {
    tenant: {
      id: TENANT_A,
      slug: "tenant-a",
      name: "Tenant A",
      status: "active",
      locale: "en-US",
      timezone: "UTC",
      created_at: tenantCreatedAt,
      updated_at: updatedAt,
    },
    workspace: {
      id: WORKSPACE_A,
      tenant_id: TENANT_A,
      slug: "workspace-a",
      name: "Workspace A",
      status: "active",
      created_at: new Date("2026-07-27T02:00:00.000Z"),
      updated_at: updatedAt,
    },
    membership: {
      id: MEMBERSHIP_A,
      tenant_id: TENANT_A,
      auth_identity_id: AUTH_A,
      pending_identity_ref_hash: null,
      workspace_id: null,
      status: "active",
      invited_by_membership_id: null,
      created_at: new Date("2026-07-27T03:00:00.000Z"),
      updated_at: updatedAt,
    },
    currentRole: {
      id: ROLE_A,
      tenant_id: TENANT_A,
      membership_id: MEMBERSHIP_A,
      role: "owner",
      created_at: new Date("2026-07-27T04:00:00.000Z"),
      valid_from: new Date("2026-07-27T04:00:00.000Z"),
      revoked_at: null,
      assigned_by_membership_id: null,
      reason_code: "initial_provisioning",
    },
    revokedRole: {
      id: ROLE_A,
      tenant_id: TENANT_A,
      membership_id: MEMBERSHIP_A,
      role: "owner",
      created_at: new Date("2026-07-27T04:00:00.000Z"),
      valid_from: new Date("2026-07-27T04:00:00.000Z"),
      revoked_at: roleRevokedAt,
      assigned_by_membership_id: null,
      reason_code: "initial_provisioning",
    },
    policy: {
      id: POLICY_A,
      tenant_id: TENANT_A,
      version: 1,
      locale: "en-US",
      timezone: "UTC",
      export_retention_days: 7,
      operational_log_retention_days: 30,
      raw_source_retention_days: 180,
      contact_freshness_days: 180,
      primary_delete_within_days: 30,
      backup_expire_within_days: 35,
      tombstone_retention_years: 7,
      active_materials_mode: "while_authorized_until_superseded_policy_or_deletion",
      ai_processing_enabled: true,
      source_research_enabled: false,
      contact_research_enabled: false,
      outreach_drafting_enabled: false,
      copy_export_enabled: false,
      autonomous_send_enabled: false,
      require_source_plan_approval: true,
      require_knowledge_review: true,
      require_icp_review: true,
      require_lead_play_review: true,
      require_contact_review: true,
      require_outreach_review: true,
      created_at: new Date("2026-07-27T05:00:00.000Z"),
      updated_at: updatedAt,
    },
  };

  return {
    prepare(query) {
      return {
        get: async <T = Record<string, unknown>>() => {
          if (query.includes("FROM tenants")) return rows.tenant as T;
          if (query.includes("FROM workspaces")) return rows.workspace as T;
          if (query.includes("FROM tenant_memberships")) return rows.membership as T;
          if (query.includes("FROM tenant_role_bindings") && query.includes("SELECT id,")) {
            return (query.includes("id = ?") ? rows.revokedRole : rows.currentRole) as T;
          }
          if (query.includes("FROM tenant_role_bindings")) return { id: ROLE_A } as T;
          if (query.includes("FROM tenant_policies")) return rows.policy as T;
          return undefined;
        },
        all: async <T = Record<string, unknown>>() => [] as T[],
        run: async () => ({ changes: 1 }),
      };
    },
    exec: async () => undefined,
  };
}

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
});

async function seedFoundation(repository: TenantQueryRepository): Promise<void> {
  await repository.createTenant({ id: TENANT_A, slug: "shared-tenant", name: "Tenant A" });
  await repository.createTenant({ id: TENANT_B, slug: "tenant-b", name: "Tenant B" });
  await repository.createWorkspace(TENANT_A, {
    id: WORKSPACE_A,
    slug: "shared-workspace",
    name: "Shared Label",
    status: "active",
  });
  await repository.createWorkspace(TENANT_B, {
    id: WORKSPACE_B,
    slug: "shared-workspace",
    name: "Shared Label",
    status: "active",
  });
  await repository.createMembership(TENANT_A, {
    id: MEMBERSHIP_A,
    authIdentityId: AUTH_A,
    workspaceId: WORKSPACE_A,
    status: "active",
  });
  await repository.createMembership(TENANT_B, {
    id: MEMBERSHIP_B,
    authIdentityId: AUTH_B,
    workspaceId: WORKSPACE_B,
    status: "active",
  });
  await repository.createRoleBinding(TENANT_A, {
    id: ROLE_A,
    membershipId: MEMBERSHIP_A,
    role: "owner",
  });
  await repository.createRoleBinding(TENANT_B, {
    id: ROLE_B,
    membershipId: MEMBERSHIP_B,
    role: "admin",
  });
  await repository.createTenantPolicy(TENANT_A, { id: POLICY_A, aiProcessingEnabled: true });
  await repository.createTenantPolicy(TENANT_B, { id: POLICY_B, aiProcessingEnabled: false });
}

describe("tenant query repository", () => {
  it("creates and maps the tenant foundation records with exact camelCase fields", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);

    const tenant = await repository.createTenant({
      id: TENANT_A,
      slug: "tenant-a",
      name: "Tenant A",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
    const workspace = await repository.createWorkspace(TENANT_A, {
      id: WORKSPACE_A,
      slug: "workspace-a",
      name: "Workspace A",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
    const membership = await repository.createMembership(TENANT_A, {
      id: MEMBERSHIP_A,
      authIdentityId: null,
      pendingIdentityRefHash: "a".repeat(64),
      workspaceId: null,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
    const role = await repository.createRoleBinding(TENANT_A, {
      id: ROLE_A,
      membershipId: MEMBERSHIP_A,
      role: "owner",
      createdAt: "2026-07-27T00:00:00.000Z",
      validFrom: "2026-07-27T00:00:00.000Z",
    });
    const policy = await repository.createTenantPolicy(TENANT_A, {
      id: POLICY_A,
      aiProcessingEnabled: true,
      sourceResearchEnabled: false,
    });

    expect(tenant).toMatchObject({ id: TENANT_A, slug: "tenant-a", status: "provisioning" });
    expect(workspace).toMatchObject({ tenantId: TENANT_A, id: WORKSPACE_A, status: "provisioning" });
    expect(membership).toMatchObject({
      tenantId: TENANT_A,
      authIdentityId: null,
      pendingIdentityRefHash: "a".repeat(64),
      workspaceId: null,
      status: "pending",
    });
    expect(role).toMatchObject({ tenantId: TENANT_A, membershipId: MEMBERSHIP_A, role: "owner", revokedAt: null });
    expect(policy).toMatchObject({
      tenantId: TENANT_A,
      aiProcessingEnabled: true,
      sourceResearchEnabled: false,
      autonomousSendEnabled: false,
      tombstoneRetentionYears: 7,
    });
    expect(Object.keys(policy).some((key) => key.includes("_") || key === "tenant_id")).toBe(false);
  });

  it("reads and lists only records inside the explicit tenant scope", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);
    await seedFoundation(repository);

    expect(await repository.getTenant(TENANT_A)).toMatchObject({ id: TENANT_A, name: "Tenant A" });
    expect(await repository.getTenant("00000000-0000-4000-8000-000000000099")).toBeNull();
    expect(await repository.listWorkspaces(TENANT_A)).toEqual([
      expect.objectContaining({ id: WORKSPACE_A, tenantId: TENANT_A, name: "Shared Label" }),
    ]);
    expect(await repository.getWorkspace(TENANT_A, WORKSPACE_B)).toBeNull();
    expect(await repository.listMemberships(TENANT_A)).toEqual([
      expect.objectContaining({ id: MEMBERSHIP_A, tenantId: TENANT_A }),
    ]);
    expect(await repository.getMembership(TENANT_A, MEMBERSHIP_B)).toBeNull();
    expect(await repository.getCurrentRoleBinding(TENANT_A, MEMBERSHIP_B)).toBeNull();
    expect(await repository.getCurrentTenantPolicy(TENANT_A)).toMatchObject({
      tenantId: TENANT_A,
      aiProcessingEnabled: true,
    });
  });

  it("rejects cross-tenant status changes without revealing whether the ID exists", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);
    await seedFoundation(repository);

    await expect(repository.updateWorkspaceStatus(TENANT_A, WORKSPACE_B, "archived")).rejects.toBeInstanceOf(
      TenantRecordNotFoundError,
    );
    await expect(repository.updateMembershipStatus(TENANT_A, MEMBERSHIP_B, "disabled")).rejects.toBeInstanceOf(
      TenantRecordNotFoundError,
    );
    await expect(repository.revokeCurrentRoleBinding(TENANT_A, MEMBERSHIP_B)).rejects.toBeInstanceOf(
      TenantRecordNotFoundError,
    );
    await expect(repository.updateWorkspaceStatus(TENANT_A, WORKSPACE_C, "archived")).rejects.toThrow(
      "requested tenant scope",
    );
    expect((await repository.getWorkspace(TENANT_B, WORKSPACE_B))?.status).toBe("active");
    expect((await repository.getMembership(TENANT_B, MEMBERSHIP_B))?.status).toBe("active");
    expect((await repository.getCurrentRoleBinding(TENANT_B, MEMBERSHIP_B))?.revokedAt).toBeNull();
  });

  it("updates only lifecycle status fields and preserves immutable identity fields", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);
    await seedFoundation(repository);

    const workspace = await repository.updateWorkspaceStatus(TENANT_A, WORKSPACE_A, "paused");
    const membership = await repository.updateMembershipStatus(TENANT_A, MEMBERSHIP_A, "suspended");
    const tenant = await repository.updateTenantStatus(TENANT_A, "active");

    expect(workspace).toMatchObject({ id: WORKSPACE_A, tenantId: TENANT_A, slug: "shared-workspace", status: "paused" });
    expect(membership).toMatchObject({ id: MEMBERSHIP_A, tenantId: TENANT_A, authIdentityId: AUTH_A, status: "suspended" });
    expect(tenant).toMatchObject({ id: TENANT_A, slug: "shared-tenant", status: "active" });
  });

  it("selects only the current role and revokes it tenant-scoped", async () => {
    const { client, database } = createDb();
    const repository = createTenantQueryRepository(client);
    await seedFoundation(repository);

    database.prepare(
      `INSERT INTO tenant_role_bindings (
         id, tenant_id, membership_id, role, created_at, valid_from, revoked_at, reason_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ROLE_HISTORY,
      TENANT_A,
      MEMBERSHIP_A,
      "reviewer",
      "2020-01-01T00:00:00.000Z",
      "2020-01-01T00:00:00.000Z",
      "9999-01-01T00:00:00.000Z",
      "role_change",
    );

    const revoked = await repository.revokeCurrentRoleBinding(TENANT_A, MEMBERSHIP_A, "2100-07-28T00:00:00.000Z");
    expect(revoked).toMatchObject({ id: ROLE_A, revokedAt: "2100-07-28T00:00:00.000Z" });
    expect(await repository.getCurrentRoleBinding(TENANT_A, MEMBERSHIP_A)).toBeNull();
    await repository.createRoleBinding(TENANT_A, {
      id: ROLE_C,
      membershipId: MEMBERSHIP_A,
      role: "admin",
      validFrom: "2026-07-29T00:00:00.000Z",
    });
    expect(await repository.getCurrentRoleBinding(TENANT_A, MEMBERSHIP_A)).toMatchObject({ id: ROLE_C, role: "admin" });
  });

  it("maps Postgres-shaped Date timestamps to canonical ISO strings and rejects invalid dates", async () => {
    const postgresRepository = createTenantQueryRepository(createPostgresShapedReadDb());
    const tenant = await postgresRepository.getTenant(TENANT_A);
    const workspace = await postgresRepository.getWorkspace(TENANT_A, WORKSPACE_A);
    const membership = await postgresRepository.getMembership(TENANT_A, MEMBERSHIP_A);
    const currentRole = await postgresRepository.getCurrentRoleBinding(TENANT_A, MEMBERSHIP_A);
    const revokedRole = await postgresRepository.revokeCurrentRoleBinding(TENANT_A, MEMBERSHIP_A, "2026-07-28T00:00:00.000Z");
    const policy = await postgresRepository.getCurrentTenantPolicy(TENANT_A);

    expect(tenant?.createdAt).toBe("2026-07-27T00:00:00.000Z");
    expect(workspace?.updatedAt).toBe("2026-07-27T01:00:00.000Z");
    expect(membership?.createdAt).toBe("2026-07-27T03:00:00.000Z");
    expect(currentRole?.validFrom).toBe("2026-07-27T04:00:00.000Z");
    expect(revokedRole.revokedAt).toBe("2026-07-28T00:00:00.000Z");
    expect(policy?.updatedAt).toBe("2026-07-27T01:00:00.000Z");
    expect(policy?.aiProcessingEnabled).toBe(true);

    const invalidDateRepository = createTenantQueryRepository(createPostgresShapedReadDb({ tenantCreatedAt: new Date(Number.NaN) }));
    await expect(invalidDateRepository.getTenant(TENANT_A)).rejects.toThrow(/Invalid timestamp/);
  });

  it("enforces duplicate constraints and reports absent records as null", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);
    await seedFoundation(repository);

    await expect(
      repository.createWorkspace(TENANT_A, { id: WORKSPACE_C, slug: "shared-workspace", name: "Duplicate" }),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(repository.createTenantPolicy(TENANT_A, { id: POLICY_C })).rejects.toThrow(/unique|constraint/i);
    expect(await repository.getWorkspace(TENANT_A, WORKSPACE_C)).toBeNull();
    expect(await repository.getMembership(TENANT_A, MEMBERSHIP_C)).toBeNull();
    expect(await repository.getCurrentTenantPolicy(TENANT_C)).toBeNull();
  });

  it("rolls back a failed composition and commits a successful atomic composition", async () => {
    const { client } = createDb();
    const repository = createTenantQueryRepository(client);

    await expect(
      repository.withTransaction(async (transactionRepository) => {
        await transactionRepository.createTenant({ id: TENANT_C, slug: "tenant-c", name: "Tenant C" });
        await transactionRepository.createTenant({ id: "00000000-0000-4000-8000-000000000004", slug: "tenant-c", name: "Duplicate" });
      }),
    ).rejects.toThrow(/unique|constraint/i);
    expect(await repository.getTenant(TENANT_C)).toBeNull();

    await repository.withTransaction(async (transactionRepository) => {
      await transactionRepository.createTenant({ id: TENANT_C, slug: "tenant-c", name: "Tenant C" });
      await transactionRepository.createWorkspace(TENANT_C, {
        id: WORKSPACE_C,
        slug: "workspace-c",
        name: "Workspace C",
      });
      await transactionRepository.createMembership(TENANT_C, {
        id: MEMBERSHIP_C,
        authIdentityId: AUTH_A,
        workspaceId: WORKSPACE_C,
      });
      await transactionRepository.createRoleBinding(TENANT_C, {
        id: ROLE_C,
        membershipId: MEMBERSHIP_C,
        role: "owner",
      });
      await transactionRepository.createTenantPolicy(TENANT_C, { id: POLICY_C });
    });

    expect(await repository.getTenant(TENANT_C)).toMatchObject({ id: TENANT_C });
    expect(await repository.getWorkspace(TENANT_C, WORKSPACE_C)).toMatchObject({ tenantId: TENANT_C });
    expect(await repository.getMembership(TENANT_C, MEMBERSHIP_C)).toMatchObject({ workspaceId: WORKSPACE_C });
    expect(await repository.getCurrentRoleBinding(TENANT_C, MEMBERSHIP_C)).toMatchObject({ role: "owner" });
    expect(await repository.getCurrentTenantPolicy(TENANT_C)).toMatchObject({ tenantId: TENANT_C });
  });

  it("does not silently fall back when the injected client lacks transactions", async () => {
    const { client } = createDb(false);
    const repository = createTenantQueryRepository(client);

    await expect(repository.withTransaction(async () => undefined)).rejects.toThrow("requires DbClient.withTransaction");
    expect(Object.keys(repository)).not.toContain("listTenants");
  });
});
