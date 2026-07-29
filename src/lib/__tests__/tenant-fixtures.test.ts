import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import type { DbClient } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";
import type { TenantPolicy } from "@/lib/tenancy/types";
import {
  CANONICAL_TENANT_FIXTURE_CATALOG,
  CANONICAL_TENANT_FIXTURE_COUNTS,
  CANONICAL_TENANT_FIXTURE_IDS,
  cleanupCanonicalTenantFixtures,
  createCanonicalTenantFixtureTransactionCoordinator,
  normalizeDatabaseBoolean,
  setupCanonicalTenantFixtures,
  withCanonicalTenantFixtures,
} from "@/test/tenants";

describe("canonical two-tenant fixtures", () => {
  it("creates the complete deterministic catalog with exact counts and immutable constants", async () => {
    const sqlite = createFixtureDb();
    const db = sqliteClient(sqlite);
    try {
      const fixture = await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });

      expect(fixture.tenants).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.tenants);
      expect(fixture.workspaces).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.workspaces);
      expect(fixture.memberships).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.memberships);
      expect(fixture.roleBindings).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.currentRoleBindings);
      expect(fixture.policies).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.policies);
      expect(fixture.supportGrants).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.supportGrants);
      expect(fixture.supportGrants.every((grant) => grant.permissions.length === 3 && grant.dataClasses.length === 3)).toBe(true);

      expect(Object.isFrozen(CANONICAL_TENANT_FIXTURE_CATALOG)).toBe(true);
      expect(Object.isFrozen(CANONICAL_TENANT_FIXTURE_CATALOG.tenants)).toBe(true);
      expect(CANONICAL_TENANT_FIXTURE_CATALOG.tenants[0].name).toBe(CANONICAL_TENANT_FIXTURE_CATALOG.tenants[1].name);
      expect(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces[0].slug).toBe(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces[1].slug);
      expect(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces[0].name).toBe(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces[1].name);
      expect(CANONICAL_TENANT_FIXTURE_IDS.tenants.A).not.toBe(CANONICAL_TENANT_FIXTURE_IDS.tenants.B);
      expect(CANONICAL_TENANT_FIXTURE_CATALOG.lookAlikeRecords).toEqual([
        expect.objectContaining({ id: CANONICAL_TENANT_FIXTURE_IDS.lookAlikeRecords.tenantAWorkspace, tenantKey: "A", entity: "workspace" }),
        expect.objectContaining({ id: CANONICAL_TENANT_FIXTURE_IDS.lookAlikeRecords.tenantBWorkspace, tenantKey: "B", entity: "workspace" }),
      ]);

      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE status = 'active'").get()).toEqual({ count: 14 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE status IN ('pending', 'suspended', 'disabled')").get()).toEqual({ count: 6 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM support_access_grant_permissions").get()).toEqual({ count: 6 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM support_access_grant_data_classes").get()).toEqual({ count: 6 });
    } finally {
      sqlite.close();
    }
  });

  it("keeps the shared identity separate from tenant authority and gives every tenant exactly every launch role", async () => {
    const sqlite = createFixtureDb();
    const db = sqliteClient(sqlite);
    try {
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      const sharedMemberships = sqlite.prepare(
        "SELECT tenant_id, status FROM tenant_memberships WHERE auth_identity_id = ? ORDER BY tenant_id",
      ).all(CANONICAL_TENANT_FIXTURE_IDS.sharedAuthIdentityId) as Array<{ tenant_id: string; status: string }>;
      expect(sharedMemberships).toEqual([
        { tenant_id: CANONICAL_TENANT_FIXTURE_IDS.tenants.A, status: "active" },
        { tenant_id: CANONICAL_TENANT_FIXTURE_IDS.tenants.B, status: "active" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings WHERE membership_id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.memberships.A.owner)).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings WHERE membership_id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.memberships.B.owner)).toEqual({ count: 1 });
      for (const tenantId of Object.values(CANONICAL_TENANT_FIXTURE_IDS.tenants)) {
        const roles = (sqlite.prepare("SELECT role FROM tenant_role_bindings WHERE tenant_id = ? AND revoked_at IS NULL ORDER BY role").all(tenantId) as Array<{ role: string }>).map(({ role }) => role);
        expect(roles).toEqual(["admin", "analyst_read_only", "outreach_operator", "owner", "researcher", "reviewer", "strategist_manager"]);
      }
    } finally {
      sqlite.close();
    }
  });

  it("proves support boundaries, policy difference, and no cross-tenant query fallback", async () => {
    const sqlite = createFixtureDb();
    const db = sqliteClient(sqlite);
    try {
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      const approved = sqlite.prepare("SELECT state, tenant_id, workspace_id, starts_at, expires_at, revoked_at FROM support_access_grants WHERE id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.supportGrants.approvedTenantA) as Record<string, unknown>;
      expect(approved).toMatchObject({ state: "approved", tenant_id: CANONICAL_TENANT_FIXTURE_IDS.tenants.A, workspace_id: CANONICAL_TENANT_FIXTURE_IDS.workspaces.A, revoked_at: null });
      expect((approved.starts_at as string) < CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.supportActiveAt).toBe(true);
      expect((approved.expires_at as string) > CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.supportActiveAt).toBe(true);
      expect(sqlite.prepare("SELECT state, revoked_at FROM support_access_grants WHERE id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.supportGrants.revokedTenantB)).toMatchObject({ state: "revoked", revoked_at: CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.supportRevokedAt });

      expect(sqlite.prepare("SELECT ai_processing_enabled FROM tenant_policies WHERE tenant_id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.tenants.A)).toEqual({ ai_processing_enabled: 1 });
      expect(sqlite.prepare("SELECT ai_processing_enabled FROM tenant_policies WHERE tenant_id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.tenants.B)).toEqual({ ai_processing_enabled: 0 });
      expect(sqlite.prepare("SELECT id FROM workspaces WHERE tenant_id = ? AND id = ?").all(CANONICAL_TENANT_FIXTURE_IDS.tenants.A, CANONICAL_TENANT_FIXTURE_IDS.workspaces.B)).toEqual([]);
      expect(sqlite.prepare("SELECT id FROM tenant_memberships WHERE tenant_id = ? AND id = ?").get(CANONICAL_TENANT_FIXTURE_IDS.tenants.A, CANONICAL_TENANT_FIXTURE_IDS.memberships.B.owner)).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  it("fails repeat setup before insert and uses rollback cleanup for disposable rows", async () => {
    const sqlite = createFixtureDb();
    const db = sqliteClient(sqlite);
    try {
      await withCanonicalTenantFixtures({ transaction: fixtureTransaction(db) }, async (fixture, scope) => {
        expect(sqlite.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 2 });
        await scope.db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          "80000000-0000-4000-8000-000000000001", "callback-only", "Callback Fixture", "active", "en-US", "UTC",
          CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.fixtureCreatedAt, CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.fixtureCreatedAt,
        );
        expect(fixture.tenants).toHaveLength(2);
      });
      expect(canonicalCounts(sqlite)).toEqual(emptyCanonicalCounts());
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      const beforeDuplicate = canonicalCounts(sqlite);
      await expect(setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) })).rejects.toThrow(/reserved rows/);
      expect(canonicalCounts(sqlite)).toEqual(beforeDuplicate);
    } finally {
      sqlite.close();
    }
  });

  it("commits and idempotently cleans only canonical rows while preserving unrelated rows", async () => {
    const sqlite = createFixtureDb();
    const db = sqliteClient(sqlite);
    try {
      await db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        "80000000-0000-4000-8000-000000000099", "unrelated", "Unrelated", "active", "en-US", "UTC",
        CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.fixtureCreatedAt, CANONICAL_TENANT_FIXTURE_CATALOG.timeBoundaries.fixtureCreatedAt,
      );
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      // The production-shaped SQLite schema intentionally makes approved grant
      // scope history immutable. This fixture-only committed-cleanup rehearsal
      // removes just those guards; rollback remains the normal full-schema path.
      sqlite.exec("DROP TRIGGER trg_novatrade_support_access_grant_permissions_no_delete; DROP TRIGGER trg_novatrade_support_access_grant_data_classes_no_delete;");
      await cleanupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      await cleanupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) });
      expect(canonicalCounts(sqlite)).toEqual({ ...emptyCanonicalCounts(), tenants: 1 });
      expect(sqlite.prepare("SELECT id FROM tenants WHERE slug = 'unrelated'").get()).toEqual({ id: "80000000-0000-4000-8000-000000000099" });
    } finally {
      sqlite.close();
    }
  });

  it("normalizes SQLite/Postgres boolean values without accepting truthy strings", () => {
    expect(normalizeDatabaseBoolean(true)).toBe(true);
    expect(normalizeDatabaseBoolean(false)).toBe(false);
    expect(normalizeDatabaseBoolean(1)).toBe(true);
    expect(normalizeDatabaseBoolean(0)).toBe(false);
    expect(() => normalizeDatabaseBoolean("1")).toThrow(/database boolean/);
    expect(() => normalizeDatabaseBoolean("false")).toThrow(/database boolean/);
  });

  it("rolls back every fixture row when a support child insert fails", async () => {
    const sqlite = createFixtureDb();
    const base = sqliteClient(sqlite);
    const failing = failOnSupportDataClassChild(base);
    try {
      await expect(setupCanonicalTenantFixtures({ transaction: fixtureTransaction(failing) })).rejects.toThrow(/synthetic support child failure/);
      expect(canonicalCounts(sqlite)).toEqual(emptyCanonicalCounts());
    } finally {
      sqlite.close();
    }
  });

  it("uses only the coordinator callback scope even when outer db/repository objects throw", async () => {
    const sqlite = createFixtureDb();
    const scopedDb = sqliteClient(sqlite);
    const scopedRepository = fixtureRepository(scopedDb);
    const coordinator = createCanonicalTenantFixtureTransactionCoordinator(async (callback) =>
      scopedDb.withTransaction!(async () => callback({ db: scopedDb, repository: scopedRepository })),
    );
    const coordinatorWithPoisonedOuterObjects = Object.create(coordinator, {
      db: { get: () => { throw new Error("outer db was touched"); } },
      repository: { get: () => { throw new Error("outer repository was touched"); } },
    }) as typeof coordinator;
    try {
      await setupCanonicalTenantFixtures({ transaction: coordinatorWithPoisonedOuterObjects });
      expect(canonicalCounts(sqlite).tenants).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it("allows only one concurrent setup commit on one SQLite transaction runner", async () => {
    const sqlite = createFixtureDb();
    try {
      const db = sqliteClient(sqlite);
      const results = await Promise.allSettled([
        setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) }),
        setupCanonicalTenantFixtures({ transaction: fixtureTransaction(db) }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(canonicalCounts(sqlite)).toEqual({ tenants: 2, workspaces: 4, memberships: 20, roleBindings: 14, policies: 2, supportGrants: 2, supportPermissions: 6, supportDataClasses: 6 });
    } finally {
      sqlite.close();
    }
  });

  it("keeps fresh databases independent while reusing the same catalog", async () => {
    const first = createFixtureDb();
    const second = createFixtureDb();
    try {
      const firstDb = sqliteClient(first);
      const secondDb = sqliteClient(second);
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(firstDb) });
      await setupCanonicalTenantFixtures({ transaction: fixtureTransaction(secondDb) });
      expect(first.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 2 });
      expect(second.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 2 });
      expect(first.prepare("SELECT COUNT(*) AS count FROM support_access_grants").get()).toEqual({ count: 2 });
      expect(second.prepare("SELECT COUNT(*) AS count FROM support_access_grants").get()).toEqual({ count: 2 });
    } finally {
      first.close();
      second.close();
    }
  });
});

function createFixtureDb(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  return sqlite;
}

function fixtureTransaction(db: DbClient) {
  const repository = fixtureRepository(db);
  return createCanonicalTenantFixtureTransactionCoordinator(async (callback) =>
    db.withTransaction!(async () => callback({ db, repository })),
  );
}

function sqliteClient(sqlite: Database.Database): DbClient {
  return {
    prepare(query: string) {
      const statement = sqlite.prepare(query);
      return {
        get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
        all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
        run: async (...params: unknown[]) => ({ changes: Number(statement.run(...params).changes) }),
      };
    },
    exec: async (query: string) => { sqlite.exec(query); },
    withTransaction: async <T>(fn: () => Promise<T>) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const value = await fn();
        sqlite.exec("COMMIT");
        return value;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function failOnSupportDataClassChild(db: DbClient): DbClient {
  const failingSql = "INSERT INTO support_access_grant_data_classes (grant_id, data_class) VALUES (?, ?)";
  return {
    prepare(query: string) {
      const statement = db.prepare(query);
      return {
        get: statement.get,
        all: statement.all,
        run: async (...params: unknown[]) => {
          if (query === failingSql) throw new Error("synthetic support child failure");
          return statement.run(...params);
        },
      };
    },
    exec: (query: string) => db.exec(query),
    withTransaction: db.withTransaction,
  };
}

function canonicalCounts(sqlite: Database.Database): Record<string, number> {
  const count = (table: string): number => (sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  return {
    tenants: count("tenants"), workspaces: count("workspaces"), memberships: count("tenant_memberships"),
    roleBindings: count("tenant_role_bindings"), policies: count("tenant_policies"), supportGrants: count("support_access_grants"),
    supportPermissions: count("support_access_grant_permissions"), supportDataClasses: count("support_access_grant_data_classes"),
  };
}

function emptyCanonicalCounts(): Record<string, number> {
  return { tenants: 0, workspaces: 0, memberships: 0, roleBindings: 0, policies: 0, supportGrants: 0, supportPermissions: 0, supportDataClasses: 0 };
}

function fixtureRepository(db: DbClient): TenantQueryRepository {
  const repository = {
    createTenant: async (input: { id: string; slug: string; name: string; status?: string; locale?: string; timezone?: string; createdAt?: string; updatedAt?: string }) => {
      await db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.slug, input.name, input.status ?? "provisioning", input.locale ?? "en-US", input.timezone ?? "UTC", input.createdAt, input.updatedAt);
      return { id: input.id, slug: input.slug, name: input.name, status: input.status ?? "provisioning", locale: input.locale ?? "en-US", timezone: input.timezone ?? "UTC", createdAt: input.createdAt!, updatedAt: input.updatedAt! };
    },
    createWorkspace: async (tenantId: string, input: { id: string; slug: string; name: string; status?: string; createdAt?: string; updatedAt?: string }) => {
      await db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.slug, input.name, input.status ?? "provisioning", input.createdAt, input.updatedAt);
      return { id: input.id, tenantId, slug: input.slug, name: input.name, status: input.status ?? "provisioning", createdAt: input.createdAt!, updatedAt: input.updatedAt! };
    },
    createMembership: async (tenantId: string, input: { id: string; authIdentityId?: string | null; pendingIdentityRefHash?: string | null; workspaceId?: string | null; status?: string; createdAt?: string; updatedAt?: string }) => {
      await db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id, status, invited_by_membership_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.authIdentityId ?? null, input.pendingIdentityRefHash ?? null, input.workspaceId ?? null, input.status ?? "pending", null, input.createdAt, input.updatedAt);
      return { id: input.id, tenantId, authIdentityId: input.authIdentityId ?? null, pendingIdentityRefHash: input.pendingIdentityRefHash ?? null, workspaceId: input.workspaceId ?? null, status: input.status ?? "pending", invitedByMembershipId: null, createdAt: input.createdAt!, updatedAt: input.updatedAt! };
    },
    createRoleBinding: async (tenantId: string, input: { id: string; membershipId: string; role: string; createdAt?: string; validFrom?: string; revokedAt?: string | null; assignedByMembershipId?: string | null; reasonCode?: string }) => {
      await db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at, assigned_by_membership_id, reason_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.membershipId, input.role, input.createdAt, input.validFrom, input.revokedAt ?? null, input.assignedByMembershipId ?? null, input.reasonCode ?? "initial_provisioning");
      return { id: input.id, tenantId, membershipId: input.membershipId, role: input.role, createdAt: input.createdAt!, validFrom: input.validFrom!, revokedAt: input.revokedAt ?? null, assignedByMembershipId: input.assignedByMembershipId ?? null, reasonCode: input.reasonCode ?? "initial_provisioning" };
    },
    createTenantPolicy: async (tenantId: string, input: { id: string; aiProcessingEnabled?: boolean; createdAt?: string; updatedAt?: string }) => {
      const values = [input.id, tenantId, 1, "en-US", "UTC", 7, 30, 180, 180, 30, 35, 7, "while_authorized_until_superseded_policy_or_deletion", input.aiProcessingEnabled ? 1 : 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, input.createdAt, input.updatedAt];
      await db.prepare("INSERT INTO tenant_policies (id, tenant_id, version, locale, timezone, export_retention_days, operational_log_retention_days, raw_source_retention_days, contact_freshness_days, primary_delete_within_days, backup_expire_within_days, tombstone_retention_years, active_materials_mode, ai_processing_enabled, source_research_enabled, contact_research_enabled, outreach_drafting_enabled, copy_export_enabled, autonomous_send_enabled, require_source_plan_approval, require_knowledge_review, require_icp_review, require_lead_play_review, require_contact_review, require_outreach_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...values);
      return { id: input.id, tenantId, version: 1, locale: "en-US", timezone: "UTC", exportRetentionDays: 7, operationalLogRetentionDays: 30, rawSourceRetentionDays: 180, contactFreshnessDays: 180, primaryDeleteWithinDays: 30, backupExpireWithinDays: 35, tombstoneRetentionYears: 7, activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion", aiProcessingEnabled: Boolean(input.aiProcessingEnabled), sourceResearchEnabled: false, contactResearchEnabled: false, outreachDraftingEnabled: false, copyExportEnabled: false, autonomousSendEnabled: false, requireSourcePlanApproval: true, requireKnowledgeReview: true, requireIcpReview: true, requireLeadPlayReview: true, requireContactReview: true, requireOutreachReview: true, createdAt: input.createdAt!, updatedAt: input.updatedAt! } satisfies TenantPolicy;
    },
    withTransaction: async <T>(fn: (transactionRepository: TenantQueryRepository) => Promise<T>) => db.withTransaction!(() => fn(repository as TenantQueryRepository)),
  } as unknown as TenantQueryRepository;
  return repository;
}
