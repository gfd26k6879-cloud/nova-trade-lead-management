import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { MIGRATION_COLUMNS, SCHEMA_SQL } from "@/lib/db/schema";
import { TenantContextRequiredError, runWithTenantContext } from "@/lib/tenancy/context";
import type { TenantSession } from "@/lib/auth";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const BINDING_A = "30000000-0000-4000-8000-000000000001";
const BINDING_B = "30000000-0000-4000-8000-000000000002";
const ACTOR_A = "50000000-0000-4000-8000-000000000001";
const ACTOR_B = "50000000-0000-4000-8000-000000000002";

function freshDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function addTenantFixture(db: Database.Database, tenantId: string, workspaceId: string, membershipId: string, bindingId: string, actorId: string, slug: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')").run(tenantId, slug, slug);
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status) VALUES (?, ?, 'workspace', 'Workspace', 'active')").run(workspaceId, tenantId);
  db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES (?, ?, ?, ?, 'active')").run(membershipId, tenantId, actorId, workspaceId);
  db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role) VALUES (?, ?, ?, 'owner')").run(bindingId, tenantId, membershipId);
}

function tenantAuditInsert(db: Database.Database, overrides: Record<string, unknown> = {}): void {
  const values = {
    id: "60000000-0000-4000-8000-000000000001",
    action: "tenant.updated",
    entity_type: "tenant",
    entity_id: TENANT_A,
    actor_email: null,
    metadata: "{}",
    scope_kind: "tenant",
    tenant_id: TENANT_A,
    workspace_id: WORKSPACE_A,
    correlation_id: "corr-tenant-a",
    actor_auth_identity_id: ACTOR_A,
    actor_membership_id: MEMBERSHIP_A,
    actor_launch_role: "owner",
    actor_role_binding_id: BINDING_A,
    actor_layer: "member",
    ...overrides,
  };
  db.prepare(
    `INSERT INTO audit_logs (
      id, action, entity_type, entity_id, actor_email, metadata, scope_kind, tenant_id, workspace_id,
      correlation_id, actor_auth_identity_id, actor_membership_id, actor_launch_role,
      actor_role_binding_id, actor_layer
    ) VALUES (@id, @action, @entity_type, @entity_id, @actor_email, @metadata, @scope_kind, @tenant_id, @workspace_id,
      @correlation_id, @actor_auth_identity_id, @actor_membership_id, @actor_launch_role,
      @actor_role_binding_id, @actor_layer)`
  ).run(values);
}

function sessionFor(tenantId: string, workspaceId: string, membershipId: string, bindingId: string, actorId: string, role: TenantSession["role"] = "owner"): TenantSession {
  return {
    userId: actorId,
    email: `${tenantId}@example.invalid`,
    displayName: "Not persisted",
    tenantId,
    workspaceId,
    membershipId,
    role,
    roleBindingId: bindingId,
  };
}

describe("T-015 tenant-aware audit schema", () => {
  it("creates exact tenant, platform, and legacy contracts on fresh SQLite", () => {
    const db = freshDatabase();
    addTenantFixture(db, TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A, "tenant-a");
    addTenantFixture(db, TENANT_B, WORKSPACE_B, MEMBERSHIP_B, BINDING_B, ACTOR_B, "tenant-b");

    db.prepare("INSERT INTO audit_logs (id, action, metadata) VALUES (?, ?, ?)").run("legacy-1", "legacy_event", "{}");
    db.prepare("INSERT INTO audit_logs (id, action, scope_kind, actor_layer, metadata) VALUES (?, ?, 'platform', 'system', ?)").run("platform-1", "platform.health", "{}");
    tenantAuditInsert(db);

    expect(db.prepare("SELECT scope_kind, tenant_id, actor_email FROM audit_logs ORDER BY rowid").all()).toEqual([
      { scope_kind: "legacy_unscoped", tenant_id: null, actor_email: null },
      { scope_kind: "platform", tenant_id: null, actor_email: null },
      { scope_kind: "tenant", tenant_id: TENANT_A, actor_email: null },
    ]);
    expect((db.prepare("PRAGMA index_list(audit_logs)").all() as Array<{ name: string }>).map((row) => row.name)).toEqual(expect.arrayContaining([
      "idx_audit_logs_tenant_created_at",
      "idx_audit_logs_tenant_action_created_at",
      "idx_audit_logs_correlation_id",
      "idx_audit_logs_workspace_created_at",
    ]));
  });

  it("preserves historical legacy actor roles without weakening typed scopes", () => {
    const db = freshDatabase();

    db.prepare("INSERT INTO audit_logs (id, action, actor_role, metadata) VALUES (?, ?, ?, ?)")
      .run("legacy-lifecycle-1", "tenant_lifecycle_transition", "member", "{}");
    expect(db.prepare("SELECT scope_kind, actor_role FROM audit_logs WHERE id = ?").get("legacy-lifecycle-1"))
      .toEqual({ scope_kind: "legacy_unscoped", actor_role: "member" });

    expect(() => db.prepare("INSERT INTO audit_logs (id, action, scope_kind, actor_layer) VALUES (?, ?, 'platform', 'member')")
      .run("platform-member-1", "platform.invalid")).toThrow();
    expect(() => db.prepare("INSERT INTO audit_logs (id, action, scope_kind, tenant_id, actor_role) VALUES (?, ?, 'tenant', ?, 'member')")
      .run("tenant-incomplete-1", "tenant.invalid", TENANT_A)).toThrow();
  });

  it("denies cross-tenant references, malformed scopes, unsafe structural fields, and non-append writes", () => {
    const db = freshDatabase();
    addTenantFixture(db, TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A, "tenant-a");
    addTenantFixture(db, TENANT_B, WORKSPACE_B, MEMBERSHIP_B, BINDING_B, ACTOR_B, "tenant-b");

    expect(() => tenantAuditInsert(db, { workspace_id: WORKSPACE_B })).toThrow();
    expect(() => tenantAuditInsert(db, { actor_membership_id: MEMBERSHIP_B, actor_auth_identity_id: ACTOR_B, actor_role_binding_id: BINDING_B })).toThrow();
    expect(() => tenantAuditInsert(db, { actor_email: "actor@example.com" })).toThrow();
    expect(() => tenantAuditInsert(db, { scope_kind: "unknown" })).toThrow();
    expect(() => tenantAuditInsert(db, { actor_launch_role: "platform_support" })).toThrow();
    expect(() => tenantAuditInsert(db, { actor_layer: "worker" })).toThrow();

    tenantAuditInsert(db, { id: "60000000-0000-4000-8000-000000000002" });
    expect(() => db.prepare("UPDATE audit_logs SET action = 'tenant.changed' WHERE id = ?").run("60000000-0000-4000-8000-000000000002")).toThrow();
    expect(() => db.prepare("DELETE FROM audit_logs WHERE id = ?").run("60000000-0000-4000-8000-000000000002")).toThrow();
  });

  it("upgrades a legacy SQLite audit table before recreating the guards", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')))");
    db.prepare("INSERT INTO audit_logs (id, action) VALUES (?, ?)").run("old-1", "legacy_event");

    runSqliteMigrations(db);
    db.exec(SCHEMA_SQL);

    expect(db.prepare("SELECT scope_kind FROM audit_logs WHERE id = 'old-1'").get()).toEqual({ scope_kind: "legacy_unscoped" });
    expect(MIGRATION_COLUMNS.filter(({ table }) => table === "audit_logs").map(({ column }) => column)).toEqual(expect.arrayContaining([
      "scope_kind", "tenant_id", "workspace_id", "correlation_id", "actor_auth_identity_id",
      "actor_membership_id", "actor_launch_role", "actor_role_binding_id", "actor_layer",
    ]));
    expect(() => db.prepare("UPDATE audit_logs SET action = 'changed' WHERE id = 'old-1'").run()).toThrow();
    expect(() => db.prepare("DELETE FROM audit_logs WHERE id = 'old-1'").run()).toThrow();
  });

  it("uses only accepted tenant context for typed and legacy-compatible query writes", async () => {
    const db = freshDatabase();
    addTenantFixture(db, TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A, "tenant-a");
    addTenantFixture(db, TENANT_B, WORKSPACE_B, MEMBERSHIP_B, BINDING_B, ACTOR_B, "tenant-b");

    const fakeClient = {
      prepare(query: string) {
        const statement = db.prepare(query);
        return {
          get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
          all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
          run: async (...params: unknown[]) => ({ changes: Number(statement.run(...params).changes) }),
        };
      },
    };
    vi.doMock("@/lib/db/index", () => ({
      getDb: async () => fakeClient,
      generateId: (() => {
        let counter = 0;
        return () => `query-audit-${++counter}`;
      })(),
      nowISO: () => "2026-07-27T20:00:00.000Z",
      withDbTransaction: async <T>(callback: () => Promise<T>) => callback(),
    }));
    const { AuditInputError, createAuditLog, createPlatformAuditLog, createTenantAuditLog } = await import("@/lib/db/queries");

    await expect(createTenantAuditLog("tenant.event", "tenant", TENANT_A, {})).rejects.toThrow(TenantContextRequiredError);

    await runWithTenantContext(sessionFor(TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A), "corr-a", async () => {
      await createTenantAuditLog("tenant.event", "tenant", TENANT_A, { safeCode: "accepted" });
      await createAuditLog("legacy.compatible", "tenant", TENANT_A, { safeCode: "context-derived" }, {
        actor: { userId: ACTOR_B, email: "forged@example.com", role: "researcher" },
        tenantId: TENANT_B,
        workspaceId: WORKSPACE_B,
        actorLaunchRole: "researcher",
      });
      const rows = db.prepare("SELECT scope_kind, tenant_id, workspace_id, correlation_id, actor_auth_identity_id, actor_membership_id, actor_launch_role, actor_role_binding_id, actor_layer, actor_email FROM audit_logs ORDER BY rowid").all();
      expect(rows).toEqual([
        {
          scope_kind: "tenant",
          tenant_id: TENANT_A,
          workspace_id: WORKSPACE_A,
          correlation_id: "corr-a",
          actor_auth_identity_id: ACTOR_A,
          actor_membership_id: MEMBERSHIP_A,
          actor_launch_role: "owner",
          actor_role_binding_id: BINDING_A,
          actor_layer: "member",
          actor_email: null,
        },
        {
          scope_kind: "tenant",
          tenant_id: TENANT_A,
          workspace_id: WORKSPACE_A,
          correlation_id: "corr-a",
          actor_auth_identity_id: ACTOR_A,
          actor_membership_id: MEMBERSHIP_A,
          actor_launch_role: "owner",
          actor_role_binding_id: BINDING_A,
          actor_layer: "member",
          actor_email: null,
        },
      ]);
    });

    await createAuditLog("legacy.event", "legacy", "legacy-1", {}, { actor: { userId: ACTOR_A, email: "legacy@example.com", role: "admin" } });
    await createPlatformAuditLog("platform.health", "platform", "health-1", {}, {
      scope: "platform",
      actor: { layer: "system" },
    });
    await createPlatformAuditLog("platform.correlated", "platform", "health-2", {}, {
      scope: "platform",
      correlationId: "corr-platform",
      actor: { layer: "worker" },
    });
    expect(db.prepare("SELECT scope_kind, tenant_id, correlation_id, actor_email, actor_layer FROM audit_logs ORDER BY rowid").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope_kind: "legacy_unscoped", tenant_id: null, actor_email: "legacy@example.com" }),
      expect.objectContaining({ scope_kind: "platform", tenant_id: null, correlation_id: null, actor_email: null, actor_layer: "system" }),
      expect.objectContaining({ scope_kind: "platform", tenant_id: null, correlation_id: "corr-platform", actor_email: null, actor_layer: "worker" }),
    ]));

    const malformed: Record<string, unknown> = {};
    malformed.self = malformed;
    await expect(runWithTenantContext(sessionFor(TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A), "corr-malformed", () =>
      createTenantAuditLog("tenant.event", undefined, undefined, malformed),
    )).rejects.toThrow(AuditInputError);
  });

  it("keeps concurrent tenant A and B audit writes isolated", async () => {
    vi.resetModules();
    const db = freshDatabase();
    addTenantFixture(db, TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A, "tenant-a");
    addTenantFixture(db, TENANT_B, WORKSPACE_B, MEMBERSHIP_B, BINDING_B, ACTOR_B, "tenant-b");
    const fakeClient = {
      prepare(query: string) {
        const statement = db.prepare(query);
        return {
          get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
          all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
          run: async (...params: unknown[]) => ({ changes: Number(statement.run(...params).changes) }),
        };
      },
    };
    vi.doMock("@/lib/db/index", () => ({
      getDb: async () => fakeClient,
      generateId: () => `concurrent-${Math.random()}`,
      nowISO: () => "2026-07-27T20:00:00.000Z",
    }));
    const [{ createTenantAuditLog }, { runWithTenantContext: runScopedTenantContext }] = await Promise.all([
      import("@/lib/db/queries"),
      import("@/lib/tenancy/context"),
    ]);
    const [a, b] = await Promise.all([
      runScopedTenantContext(sessionFor(TENANT_A, WORKSPACE_A, MEMBERSHIP_A, BINDING_A, ACTOR_A), "corr-a", () => createTenantAuditLog("tenant.concurrent")),
      runScopedTenantContext(sessionFor(TENANT_B, WORKSPACE_B, MEMBERSHIP_B, BINDING_B, ACTOR_B), "corr-b", () => createTenantAuditLog("tenant.concurrent")),
    ]);
    await Promise.all([a, b]);
    expect(db.prepare("SELECT tenant_id, correlation_id, actor_auth_identity_id FROM audit_logs ORDER BY tenant_id").all()).toEqual([
      { tenant_id: TENANT_A, correlation_id: "corr-a", actor_auth_identity_id: ACTOR_A },
      { tenant_id: TENANT_B, correlation_id: "corr-b", actor_auth_identity_id: ACTOR_B },
    ]);
  });
});
