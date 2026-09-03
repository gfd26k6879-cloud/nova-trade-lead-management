import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { MIGRATION_COLUMNS, SCHEMA_SQL } from "@/lib/db/schema";
import { LAUNCH_ROLES, MEMBERSHIP_STATUSES } from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const ROLE_A = "30000000-0000-4000-8000-000000000001";
const AUTH_A = "40000000-0000-4000-8000-000000000001";
const AUTH_B = "40000000-0000-4000-8000-000000000002";
const HASH_A = "a".repeat(64);
const REASONS = [
  "initial_provisioning",
  "invitation",
  "role_change",
  "owner_replacement",
  "membership_reactivation",
  "administrative_correction",
] as const;

function createSchemaDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function idFor(prefix: string, number: number): string {
  return `${prefix}-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function insertTenant(db: Database.Database, id: string, slug: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(id, slug, `${slug} Tenant`);
}

function insertWorkspace(db: Database.Database, id: string, tenantId: string, slug: string): void {
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name) VALUES (?, ?, ?, ?)").run(id, tenantId, slug, `${slug} Workspace`);
}

function insertMembership(
  db: Database.Database,
  input: Partial<{
    id: string;
    tenantId: string;
    authIdentityId: string | null;
    pendingHash: string | null;
    workspaceId: string | null;
    status: string;
    invitedByMembershipId: string | null;
    createdAt: string;
    updatedAt: string;
  }> = {},
): void {
  const pendingHash = input.pendingHash === undefined ? null : input.pendingHash;
  const authIdentityId = input.authIdentityId === undefined ? (pendingHash === null ? AUTH_A : null) : input.authIdentityId;
  const values: Record<string, string | null> = {
    id: input.id ?? MEMBERSHIP_A,
    tenant_id: input.tenantId ?? TENANT_A,
    auth_identity_id: authIdentityId,
    pending_identity_ref_hash: pendingHash,
    workspace_id: input.workspaceId ?? null,
    status: input.status ?? "pending",
    invited_by_membership_id: input.invitedByMembershipId ?? null,
  };
  if (input.createdAt !== undefined) values.created_at = input.createdAt;
  if (input.updatedAt !== undefined) values.updated_at = input.updatedAt;
  const columns = Object.keys(values);
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  db.prepare(`INSERT INTO tenant_memberships (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
}

function insertRole(
  db: Database.Database,
  input: Partial<{
    id: string;
    tenantId: string;
    membershipId: string;
    role: string;
    createdAt: string;
    validFrom: string;
    revokedAt: string | null;
    assignedByMembershipId: string | null;
    reasonCode: string;
  }> = {},
): void {
  const values: Record<string, string | null> = {
    id: input.id ?? ROLE_A,
    tenant_id: input.tenantId ?? TENANT_A,
    membership_id: input.membershipId ?? MEMBERSHIP_A,
    role: input.role ?? "owner",
  };
  if (input.createdAt !== undefined) values.created_at = input.createdAt;
  if (input.validFrom !== undefined) values.valid_from = input.validFrom;
  if (input.revokedAt !== undefined) values.revoked_at = input.revokedAt;
  if (input.assignedByMembershipId !== undefined) values.assigned_by_membership_id = input.assignedByMembershipId;
  if (input.reasonCode !== undefined) values.reason_code = input.reasonCode;
  const columns = Object.keys(values);
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  db.prepare(`INSERT INTO tenant_role_bindings (${columns.join(", ")}) VALUES (${placeholders})`).run(values);
}

describe("SQLite tenant memberships and role bindings schema", () => {
  it("creates exactly nine columns per table with named constraints, defaults, FKs, and indexes", () => {
    const db = createSchemaDatabase();
    try {
      expect((db.prepare("PRAGMA table_info(tenant_memberships)").all() as Array<{ name: string; dflt_value: string | null }>).map((column) => column.name)).toEqual([
        "id", "tenant_id", "auth_identity_id", "pending_identity_ref_hash", "workspace_id", "status", "invited_by_membership_id", "created_at", "updated_at",
      ]);
      expect((db.prepare("PRAGMA table_info(tenant_role_bindings)").all() as Array<{ name: string; dflt_value: string | null }>).map((column) => column.name)).toEqual([
        "id", "tenant_id", "membership_id", "role", "created_at", "valid_from", "revoked_at", "assigned_by_membership_id", "reason_code",
      ]);
      const membershipSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenant_memberships'").get() as { sql: string }).sql;
      const roleSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenant_role_bindings'").get() as { sql: string }).sql;
      for (const name of [
        "tenant_memberships_id_format_chk", "tenant_memberships_tenant_id_format_chk", "tenant_memberships_auth_identity_id_format_chk",
        "tenant_memberships_pending_identity_ref_hash_chk", "tenant_memberships_identity_selector_chk", "tenant_memberships_tenant_id_id_unique",
        "tenant_memberships_workspace_tenant_fkey", "tenant_memberships_invited_by_tenant_fkey", "tenant_memberships_created_at_utc_chk", "tenant_memberships_updated_at_utc_chk",
      ]) expect(membershipSql).toContain(name);
      for (const name of [
        "tenant_role_bindings_id_format_chk", "tenant_role_bindings_role_chk", "tenant_role_bindings_reason_code_chk",
        "tenant_role_bindings_created_at_utc_chk", "tenant_role_bindings_valid_from_utc_chk", "tenant_role_bindings_revoked_at_utc_chk", "tenant_role_bindings_revoked_at_chk", "tenant_role_bindings_tenant_membership_fkey", "tenant_role_bindings_assigned_by_tenant_fkey",
      ]) expect(roleSql).toContain(name);
      const membershipStatusLiterals = membershipSql.match(/CONSTRAINT tenant_memberships_status_chk[\s\S]*?CHECK \(status IN \(([^)]+)\)\)/)?.[1].match(/'([^']+)'/g)?.map((literal) => literal.slice(1, -1));
      const roleLiterals = roleSql.match(/CONSTRAINT tenant_role_bindings_role_chk[\s\S]*?CHECK \(role IN \(([^)]+)\)\)/)?.[1].match(/'([^']+)'/g)?.map((literal) => literal.slice(1, -1));
      expect(membershipStatusLiterals).toEqual([...MEMBERSHIP_STATUSES]);
      expect(roleLiterals).toEqual([...LAUNCH_ROLES]);
      expect((db.prepare("PRAGMA table_info(tenant_memberships)").all() as Array<{ name: string; dflt_value: string | null }>).find((column) => column.name === "status")?.dflt_value).toBe("'pending'");
      expect((db.prepare("PRAGMA table_info(tenant_role_bindings)").all() as Array<{ name: string; dflt_value: string | null }>).find((column) => column.name === "reason_code")?.dflt_value).toBe("'initial_provisioning'");
      expect((db.prepare("PRAGMA index_list(tenant_memberships)").all() as Array<{ name: string }>).map((index) => index.name)).toEqual(expect.arrayContaining([
        "tenant_memberships_current_auth_identity_unique", "tenant_memberships_current_pending_identity_unique", "idx_tenant_memberships_auth_identity_status", "idx_tenant_memberships_tenant_status_updated_at", "idx_tenant_memberships_tenant_workspace_status",
      ]));
      expect((db.prepare("PRAGMA index_list(tenant_role_bindings)").all() as Array<{ name: string }>).map((index) => index.name)).toEqual(expect.arrayContaining([
        "tenant_role_bindings_current_membership_unique", "idx_tenant_role_bindings_membership_history",
      ]));
      expect((db.prepare("PRAGMA foreign_key_list(tenant_memberships)").all() as Array<{ table: string; from: string; to: string }>).map((key) => `${key.table}:${key.from}->${key.to}`)).toEqual(expect.arrayContaining([
        "tenants:tenant_id->id", "workspaces:workspace_id->id", "tenant_memberships:invited_by_membership_id->id",
      ]));
      expect((db.prepare("PRAGMA foreign_key_list(tenant_role_bindings)").all() as Array<{ table: string }>).map((key) => key.table)).toEqual(expect.arrayContaining(["tenant_memberships"]));
    } finally {
      db.close();
    }
  });

  it("accepts exactly the seven membership states and rejects invited or unknown states", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "membership-states");
      for (const [index, status] of MEMBERSHIP_STATUSES.entries()) {
        insertMembership(db, { id: idFor("20000000", index + 1), authIdentityId: idFor("40000000", index + 1), status });
      }
      expect((db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get() as { count: number }).count).toBe(7);
      expect(() => insertMembership(db, { id: idFor("20000000", 8), authIdentityId: idFor("40000000", 8), status: "invited" })).toThrow(/CHECK|constraint/i);
      expect(() => insertMembership(db, { id: idFor("20000000", 9), authIdentityId: idFor("40000000", 9), status: "unknown" })).toThrow(/CHECK|constraint/i);
      expect((db.prepare("SELECT status FROM tenant_memberships WHERE id = ?").get(MEMBERSHIP_A) as { status: string }).status).toBe("pending");
    } finally { db.close(); }
  });

  it("accepts every launch role and rejects custom roles", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "launch-roles");
      for (const [index, role] of LAUNCH_ROLES.entries()) {
        insertMembership(db, { id: idFor("20000000", index + 1), authIdentityId: idFor("40000000", index + 1) });
        insertRole(db, { id: idFor("30000000", index + 1), membershipId: idFor("20000000", index + 1), role });
      }
      expect((db.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings").get() as { count: number }).count).toBe(7);
      insertMembership(db, { id: idFor("20000000", 8), authIdentityId: idFor("40000000", 8) });
      expect(() => insertRole(db, { id: idFor("30000000", 8), membershipId: idFor("20000000", 8), role: "custom_role" })).toThrow(/CHECK|constraint/i);
    } finally { db.close(); }
  });

  it("accepts every bounded reason code and same-tenant assigning membership", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "role-reasons");
      insertMembership(db, { id: MEMBERSHIP_A, authIdentityId: AUTH_A });
      for (const [index, reasonCode] of REASONS.entries()) {
        const membershipId = idFor("20000000", index + 2);
        insertMembership(db, { id: membershipId, authIdentityId: idFor("40000000", index + 2) });
        insertRole(db, {
          id: idFor("30000000", index + 1),
          membershipId,
          assignedByMembershipId: MEMBERSHIP_A,
          reasonCode,
        });
      }
      expect((db.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings").get() as { count: number }).count).toBe(6);
      insertMembership(db, { id: idFor("20000000", 9), authIdentityId: idFor("40000000", 9) });
      expect(() => insertRole(db, { id: idFor("30000000", 9), membershipId: idFor("20000000", 9), reasonCode: "unsupported" })).toThrow(/CHECK|constraint/i);
      expect(() => insertRole(db, { id: idFor("30000000", 10), membershipId: idFor("20000000", 9), assignedByMembershipId: idFor("20000000", 99) })).toThrow(/FOREIGN KEY|constraint/i);
    } finally { db.close(); }
  });

  it("rejects non-canonical UTC timestamp shapes before lexical history checks", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "timestamp-shapes");
      expect(() => insertMembership(db, {
        id: MEMBERSHIP_A,
        authIdentityId: AUTH_A,
        createdAt: "2026-07-27T00:00:00Z",
      })).toThrow(/CHECK|constraint/i);
      expect(() => insertMembership(db, {
        id: MEMBERSHIP_A,
        authIdentityId: AUTH_A,
        updatedAt: "2026-07-27 00:00:00.000Z",
      })).toThrow(/CHECK|constraint/i);
      insertMembership(db, { id: MEMBERSHIP_A, authIdentityId: AUTH_A });
      expect(() => insertRole(db, {
        id: ROLE_A,
        validFrom: "2026-7-27T00:00:00.000Z",
      })).toThrow(/CHECK|constraint/i);
      expect(() => insertRole(db, {
        id: ROLE_A,
        validFrom: "2026-07-27T00:00:00.000Z",
        revokedAt: "9999-not-a-timestamp",
      })).toThrow(/CHECK|constraint/i);
    } finally { db.close(); }
  });

  it("uses an opaque external Auth UUID without an app_users FK and validates selectors", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "opaque-auth");
      insertMembership(db, { authIdentityId: AUTH_A });
      expect(db.prepare("SELECT auth_identity_id FROM tenant_memberships WHERE id = ?").get(MEMBERSHIP_A)).toMatchObject({ auth_identity_id: AUTH_A });
      const fkSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenant_memberships'").get() as { sql: string }).sql;
      expect(fkSql).not.toContain("app_users");
      expect(() => insertMembership(db, { id: idFor("20000000", 2), authIdentityId: "not-a-uuid" })).toThrow(/CHECK|constraint/i);
      expect(() => insertMembership(db, { id: idFor("20000000", 3), authIdentityId: null, pendingHash: "A".repeat(64) })).toThrow(/CHECK|constraint/i);
      expect(() => insertMembership(db, { id: idFor("20000000", 4), authIdentityId: null, pendingHash: null })).toThrow(/CHECK|constraint/i);
      expect(() => insertMembership(db, { id: idFor("20000000", 5), authIdentityId: AUTH_B, pendingHash: HASH_A })).toThrow(/CHECK|constraint/i);
    } finally { db.close(); }
  });

  it("allows current identity selectors across tenants but prevents same-tenant duplicates and supports terminal history", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "selector-a");
      insertTenant(db, TENANT_B, "selector-b");
      insertMembership(db, { authIdentityId: AUTH_A });
      insertMembership(db, { id: MEMBERSHIP_B, tenantId: TENANT_B, authIdentityId: AUTH_A });
      expect(() => insertMembership(db, { id: idFor("20000000", 3), authIdentityId: AUTH_A })).toThrow(/UNIQUE|constraint/i);
      db.prepare("UPDATE tenant_memberships SET status = 'revoked' WHERE id = ?").run(MEMBERSHIP_A);
      insertMembership(db, { id: idFor("20000000", 4), authIdentityId: AUTH_A });
      insertMembership(db, { id: idFor("20000000", 5), authIdentityId: null, pendingHash: HASH_A, status: "disabled" });
      expect(() => insertMembership(db, { id: idFor("20000000", 6), authIdentityId: null, pendingHash: HASH_A })).toThrow(/UNIQUE|constraint/i);
      db.prepare("UPDATE tenant_memberships SET status = 'expired' WHERE id = ?").run(idFor("20000000", 5));
      insertMembership(db, { id: idFor("20000000", 7), authIdentityId: null, pendingHash: HASH_A });
    } finally { db.close(); }
  });

  it("requires same-tenant workspace and inviter references", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "scope-a");
      insertTenant(db, TENANT_B, "scope-b");
      insertWorkspace(db, WORKSPACE_A, TENANT_A, "workspace-a");
      insertWorkspace(db, WORKSPACE_B, TENANT_B, "workspace-b");
      insertMembership(db, { workspaceId: WORKSPACE_A });
      insertMembership(db, { id: MEMBERSHIP_B, authIdentityId: AUTH_B, invitedByMembershipId: MEMBERSHIP_A });
      expect(() => insertMembership(db, { id: idFor("20000000", 3), authIdentityId: idFor("40000000", 3), workspaceId: WORKSPACE_B })).toThrow(/FOREIGN KEY|constraint/i);
      expect(() => insertMembership(db, { id: idFor("20000000", 4), authIdentityId: idFor("40000000", 4), invitedByMembershipId: MEMBERSHIP_A, tenantId: TENANT_B })).toThrow(/FOREIGN KEY|constraint/i);
    } finally { db.close(); }
  });

  it("enforces one current role, preserves revoked history, and protects role history fields", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "role-history");
      insertMembership(db);
      insertRole(db, { createdAt: "2026-07-27T00:00:00.000Z", validFrom: "2026-07-27T00:00:00.000Z", assignedByMembershipId: MEMBERSHIP_A });
      expect(() => insertRole(db, { id: idFor("30000000", 2), role: "admin" })).toThrow(/UNIQUE|constraint/i);
      const revokedAt = "2026-07-28T00:00:00.000Z";
      db.prepare("UPDATE tenant_role_bindings SET revoked_at = ? WHERE id = ?").run(revokedAt, ROLE_A);
      insertRole(db, { id: idFor("30000000", 2), role: "admin", validFrom: "2026-07-28T00:00:00.000Z" });
      expect((db.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings").get() as { count: number }).count).toBe(2);
      for (const [column, value] of [
        ["id", idFor("30000000", 3)],
        ["tenant_id", TENANT_B],
        ["membership_id", MEMBERSHIP_B],
        ["created_at", "2026-07-29T00:00:00.000Z"],
        ["valid_from", "2026-07-29T00:00:00.000Z"],
        ["assigned_by_membership_id", MEMBERSHIP_B],
        ["reason_code", "role_change"],
      ] as const) {
        expect(() => db.prepare(`UPDATE tenant_role_bindings SET ${column} = ? WHERE id = ?`).run(value, idFor("30000000", 2))).toThrow(/immutable/);
      }
      expect(() => db.prepare("UPDATE tenant_role_bindings SET role = 'reviewer' WHERE id = ?").run(idFor("30000000", 2))).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE tenant_role_bindings SET revoked_at = NULL WHERE id = ?").run(ROLE_A)).toThrow(/cannot be rewritten|constraint/i);
      expect(() => db.prepare("UPDATE tenant_role_bindings SET revoked_at = ? WHERE id = ?").run("2026-07-29T00:00:00.000Z", ROLE_A)).toThrow(/cannot be rewritten|constraint/i);
      expect(() => insertRole(db, { id: idFor("30000000", 3), role: "reviewer", validFrom: "2026-07-29T00:00:00.000Z", revokedAt: "2026-07-28T00:00:00.000Z" })).toThrow(/CHECK|constraint/i);
    } finally { db.close(); }
  });

  it("blocks orphan and cross-tenant membership and role references", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "orphan-a");
      insertTenant(db, TENANT_B, "orphan-b");
      insertMembership(db);
      expect(() => insertMembership(db, { id: idFor("20000000", 2), tenantId: TENANT_B, authIdentityId: AUTH_B, invitedByMembershipId: MEMBERSHIP_A })).toThrow(/FOREIGN KEY|constraint/i);
      expect(() => insertRole(db, { tenantId: TENANT_B, membershipId: MEMBERSHIP_A })).toThrow(/FOREIGN KEY|constraint/i);
      expect(() => insertRole(db, { id: idFor("30000000", 2), membershipId: idFor("20000000", 99) })).toThrow(/FOREIGN KEY|constraint/i);
      insertRole(db);
      expect(() => db.prepare("DELETE FROM tenant_memberships WHERE id = ?").run(MEMBERSHIP_A)).toThrow(/FOREIGN KEY|constraint/i);
    } finally { db.close(); }
  });

  it("keeps membership identity immutable and touches updated_at with recursive triggers enabled", () => {
    const db = createSchemaDatabase();
    try {
      db.pragma("recursive_triggers = ON");
      insertTenant(db, TENANT_A, "immutable-membership");
      insertMembership(db, { createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" });
      const before = db.prepare("SELECT created_at, updated_at FROM tenant_memberships WHERE id = ?").get(MEMBERSHIP_A) as { created_at: string; updated_at: string };
      db.prepare("UPDATE tenant_memberships SET status = 'active' WHERE id = ?").run(MEMBERSHIP_A);
      const after = db.prepare("SELECT created_at, updated_at FROM tenant_memberships WHERE id = ?").get(MEMBERSHIP_A) as { created_at: string; updated_at: string };
      expect(after.created_at).toBe(before.created_at);
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(after.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(() => db.prepare("UPDATE tenant_memberships SET id = ? WHERE id = ?").run(idFor("20000000", 2), MEMBERSHIP_A)).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE tenant_memberships SET tenant_id = ? WHERE id = ?").run(TENANT_B, MEMBERSHIP_A)).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE tenant_memberships SET auth_identity_id = ? WHERE id = ?").run(AUTH_B, MEMBERSHIP_A)).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE tenant_memberships SET pending_identity_ref_hash = ? WHERE id = ?").run(HASH_A, MEMBERSHIP_A)).toThrow(/immutable/);
    } finally { db.close(); }
  });

  it("retains legacy lead data on upgrade, creates both tables, and adds no migration columns", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    try {
      db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, place_id TEXT NOT NULL UNIQUE, name TEXT, categories TEXT NOT NULL DEFAULT '[]', website_status TEXT NOT NULL DEFAULT 'none', score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', business_type TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.prepare("INSERT INTO leads (id, place_id, name) VALUES (?, ?, ?)").run("legacy-lead", "legacy-place", "Synthetic Legacy Lead");
      runSqliteMigrations(db);
      db.exec(SCHEMA_SQL);
      insertTenant(db, TENANT_A, "upgrade-a");
      insertWorkspace(db, WORKSPACE_A, TENANT_A, "upgrade-workspace");
      insertMembership(db);
      insertRole(db);
      expect(db.prepare("SELECT name FROM leads WHERE id = ?").get("legacy-lead")).toMatchObject({ name: "Synthetic Legacy Lead" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('tenant_memberships', 'tenant_role_bindings')").get()).toMatchObject({ count: 2 });
      expect(MIGRATION_COLUMNS.some((migration) => migration.table === "tenant_memberships" || migration.table === "tenant_role_bindings")).toBe(false);
    } finally { db.close(); }
  });
});
