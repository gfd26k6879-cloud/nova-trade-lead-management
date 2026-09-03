import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import { TENANT_PERMISSIONS } from "@/lib/permissions";
import {
  isSupportAccessGrantEligibleAt,
  supportAccessGrantCreationInputSchema,
  supportAccessGrantSchema,
} from "@/lib/tenancy/schemas";
import {
  PLATFORM_SUPPORT_ROLE,
  SUPPORT_ACCESS_GRANT_DATA_CLASSES,
  SUPPORT_ACCESS_GRANT_PERMISSIONS,
} from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const GRANT_A = "20000000-0000-4000-8000-000000000001";
const GRANT_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const MEMBERSHIP_REVOKER = "30000000-0000-4000-8000-000000000003";
const MEMBERSHIP_INACTIVE = "30000000-0000-4000-8000-000000000004";
const MEMBERSHIP_NON_OWNER = "30000000-0000-4000-8000-000000000005";
const MEMBERSHIP_FUTURE_ROLE = "30000000-0000-4000-8000-000000000006";
const MEMBERSHIP_REVOKED_ROLE = "30000000-0000-4000-8000-000000000007";
const SUPPORT_ACTOR = "40000000-0000-4000-8000-000000000001";
const REQUESTER = "40000000-0000-4000-8000-000000000002";
const APPROVER_A = "40000000-0000-4000-8000-000000000003";
const APPROVER_B = "40000000-0000-4000-8000-000000000004";
const REVOKER = "40000000-0000-4000-8000-000000000005";
const RANDOM_REVOKER = "40000000-0000-4000-8000-000000000006";
const INACTIVE_AUTHORITY = "40000000-0000-4000-8000-000000000007";
const NON_OWNER_AUTHORITY = "40000000-0000-4000-8000-000000000008";
const FUTURE_ROLE_AUTHORITY = "40000000-0000-4000-8000-000000000009";
const REVOKED_ROLE_AUTHORITY = "40000000-0000-4000-8000-000000000010";
const AUDIT_A = "50000000-0000-4000-8000-000000000001";
const PERMISSIONS = ["tenant:read", "audit:read"] as const;
const DATA_CLASSES = ["tenant_metadata", "audit_operational_metadata"] as const;
const CREATED = "2026-07-26T00:00:00.000Z";
const START = "2026-07-27T00:00:00.000Z";
const EXPIRY = "2026-07-27T01:00:00.000Z";
const AFTER_EXPIRY = "2026-07-27T02:00:00.000Z";

function database(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function tenant(db: Database.Database, id: string, slug: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(id, slug, `${slug} tenant`);
}

function workspace(db: Database.Database, id: string, tenantId: string, slug: string): void {
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name) VALUES (?, ?, ?, ?)").run(id, tenantId, slug, `${slug} workspace`);
}

function tenantMembership(
  db: Database.Database,
  id: string,
  tenantId: string,
  authIdentityId: string,
  options: {
    status?: "active" | "disabled";
    role?: "owner" | "admin" | "researcher";
    validFrom?: string;
    revokedAt?: string | null;
  } = {},
): void {
  const { status = "active", role = "owner", validFrom = CREATED, revokedAt = null } = options;
  db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, status) VALUES (?, ?, ?, ?)").run(id, tenantId, authIdentityId, status);
  db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, valid_from, revoked_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id.replace("30000000", "60000000"), tenantId, id, role, validFrom, revokedAt);
}

function ownerMembership(db: Database.Database, id: string, tenantId: string, authIdentityId: string): void {
  tenantMembership(db, id, tenantId, authIdentityId);
}

function insertGrant(db: Database.Database, values: Partial<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  supportActorAuthIdentityId: string;
  requestedByAuthIdentityId: string;
  reasonCode: string;
  reason: string;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
  auditEventId: string;
  permissions: readonly string[];
  dataClasses: readonly string[];
}> = {}): void {
  const grant = {
    id: GRANT_A,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    supportActorAuthIdentityId: SUPPORT_ACTOR,
    requestedByAuthIdentityId: REQUESTER,
    reasonCode: "diagnostic-review",
    reason: "Synthetic support diagnosis",
    startsAt: START,
    expiresAt: EXPIRY,
    createdAt: CREATED,
    updatedAt: CREATED,
    correlationId: "corr-support-001",
    auditEventId: AUDIT_A,
    permissions: PERMISSIONS,
    dataClasses: DATA_CLASSES,
    ...values,
  };
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO support_access_grants (
      id, tenant_id, workspace_id, support_actor_auth_identity_id, platform_role,
      requested_by_auth_identity_id, reason_code, reason, starts_at, expires_at,
      correlation_id, audit_event_id, permission_anchor, data_class_anchor, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      grant.id, grant.tenantId, grant.workspaceId, grant.supportActorAuthIdentityId, PLATFORM_SUPPORT_ROLE,
      grant.requestedByAuthIdentityId, grant.reasonCode, grant.reason, grant.startsAt, grant.expiresAt,
      grant.correlationId, grant.auditEventId, grant.permissions[0], grant.dataClasses[0], grant.createdAt, grant.updatedAt,
    );
    for (const permission of grant.permissions) db.prepare("INSERT INTO support_access_grant_permissions (grant_id, permission) VALUES (?, ?)").run(grant.id, permission);
    for (const dataClass of grant.dataClasses) db.prepare("INSERT INTO support_access_grant_data_classes (grant_id, data_class) VALUES (?, ?)").run(grant.id, dataClass);
  });
  insert();
}

function readGrant(db: Database.Database, id = GRANT_A): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM support_access_grants WHERE id = ?").get(id) as Record<string, unknown>;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    supportActorAuthIdentityId: row.support_actor_auth_identity_id,
    platformRole: row.platform_role,
    requestedByAuthIdentityId: row.requested_by_auth_identity_id,
    approvedByAuthIdentityId: row.approved_by_auth_identity_id,
    approvedAt: row.approved_at,
    revokedByAuthIdentityId: row.revoked_by_auth_identity_id,
    revokedAt: row.revoked_at,
    state: row.state,
    reasonCode: row.reason_code,
    reason: row.reason,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    correlationId: row.correlation_id,
    auditEventId: row.audit_event_id,
    permissions: db.prepare("SELECT permission FROM support_access_grant_permissions WHERE grant_id = ? ORDER BY permission").all(id).map((value) => (value as { permission: string }).permission),
    dataClasses: db.prepare("SELECT data_class FROM support_access_grant_data_classes WHERE grant_id = ? ORDER BY data_class").all(id).map((value) => (value as { data_class: string }).data_class),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

describe("support access grant schema", () => {
  it("adds the fresh/upgrade schema without touching legacy settings or migration columns", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    try {
      db.exec("CREATE TABLE settings (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
      db.prepare("INSERT INTO settings (id, marker) VALUES (1, 'legacy')").run();
      runSqliteMigrations(db);
      db.exec(SCHEMA_SQL);
      db.exec(`
        DROP TRIGGER trg_novatrade_support_access_grants_validate_approval_update;
        CREATE TRIGGER trg_novatrade_support_access_grants_validate_approval_update
        BEFORE UPDATE ON support_access_grants
        FOR EACH ROW
        WHEN NEW.state IN ('approved', 'revoked')
        BEGIN
          SELECT RAISE(ABORT, 'stale approval-authority trigger');
        END;
      `);
      db.exec(SCHEMA_SQL);
      expect(db.prepare("SELECT marker FROM settings WHERE id = 1").get()).toEqual({ marker: "legacy" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('support_access_grants', 'support_access_grant_permissions', 'support_access_grant_data_classes')").get()).toEqual({ count: 3 });
      const authorityTriggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (
        'trg_novatrade_support_access_grants_validate_approval',
        'trg_novatrade_support_access_grants_validate_approval_update',
        'trg_novatrade_support_access_grants_validate_revocation',
        'trg_novatrade_support_access_grants_validate_revocation_update'
      )`).all() as Array<{ name: string; sql: string }>;
      expect(authorityTriggers).toHaveLength(4);
      expect(authorityTriggers.find(({ name }) => name.endsWith("approval_update"))?.sql).toContain("OLD.state = 'pending' AND NEW.state = 'approved'");
      expect(authorityTriggers.find(({ name }) => name.endsWith("revocation_update"))?.sql).toContain("OLD.state = 'approved' AND NEW.state = 'revoked'");
      expect(authorityTriggers.some(({ sql }) => sql.includes("stale approval-authority trigger"))).toBe(false);
    } finally { db.close(); }
  });

  it("has the exact normalized tables, fixed role, child scopes, indexes, and no secret columns", () => {
    const db = database();
    try {
      const grantColumns = (db.prepare("PRAGMA table_info(support_access_grants)").all() as Array<{ name: string }>).map(({ name }) => name);
      expect(grantColumns).toEqual([
        "id", "tenant_id", "workspace_id", "support_actor_auth_identity_id", "platform_role",
        "requested_by_auth_identity_id", "approved_by_auth_identity_id", "approved_at", "revoked_by_auth_identity_id",
        "revoked_at", "state", "reason_code", "reason", "starts_at", "expires_at", "correlation_id", "audit_event_id",
        "permission_anchor", "data_class_anchor", "created_at", "updated_at",
      ]);
      expect((db.prepare("PRAGMA table_info(support_access_grant_permissions)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual(["grant_id", "permission"]);
      expect((db.prepare("PRAGMA table_info(support_access_grant_data_classes)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual(["grant_id", "data_class"]);
      expect(grantColumns.some((column) => /secret|credential|token|password|email|phone|json|csv/i.test(column))).toBe(false);
      expect((db.prepare("PRAGMA index_list(support_access_grants)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual(expect.arrayContaining([
        "idx_support_access_grants_tenant_history", "idx_support_access_grants_active_lookup",
        "support_access_grants_current_tenantwide_unique", "support_access_grants_current_workspace_unique",
      ]));
      expect(SUPPORT_ACCESS_GRANT_PERMISSIONS).toEqual(TENANT_PERMISSIONS);
      expect(SUPPORT_ACCESS_GRANT_PERMISSIONS).toHaveLength(75);
      expect(SUPPORT_ACCESS_GRANT_DATA_CLASSES).toEqual([
        "tenant_metadata", "workspace_metadata", "public_business_facts", "documents", "customer_lists", "contacts",
        "unpublished_product_technical_data", "audit_operational_metadata", "prompts", "agent_context",
      ]);
    } finally { db.close(); }
  });

  it("keeps two tenants isolated and requires the workspace and approver to match the target tenant", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "support-a"); tenant(db, TENANT_B, "support-b");
      workspace(db, WORKSPACE_A, TENANT_A, "shared"); workspace(db, WORKSPACE_B, TENANT_B, "shared");
      ownerMembership(db, MEMBERSHIP_A, TENANT_A, APPROVER_A); ownerMembership(db, MEMBERSHIP_B, TENANT_B, APPROVER_B);
      expect(() => insertGrant(db, { workspaceId: WORKSPACE_B })).toThrow(/FOREIGN KEY|constraint/i);
      insertGrant(db);
      expect(() => db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?").run(APPROVER_B, START, GRANT_A)).toThrow(/same-tenant|approver|constraint/i);
      expect(() => db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?").run(SUPPORT_ACTOR, START, GRANT_A)).toThrow(/own|constraint/i);
    } finally { db.close(); }
  });

  it("uses current tenant authority for approval and revocation without revalidating the historical approver", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "authority-a"); tenant(db, TENANT_B, "authority-b");
      workspace(db, WORKSPACE_A, TENANT_A, "authority");
      ownerMembership(db, MEMBERSHIP_A, TENANT_A, APPROVER_A);
      ownerMembership(db, MEMBERSHIP_B, TENANT_B, APPROVER_B);
      tenantMembership(db, MEMBERSHIP_REVOKER, TENANT_A, REVOKER, { role: "admin" });
      tenantMembership(db, MEMBERSHIP_INACTIVE, TENANT_A, INACTIVE_AUTHORITY, { status: "disabled" });
      tenantMembership(db, MEMBERSHIP_NON_OWNER, TENANT_A, NON_OWNER_AUTHORITY, { role: "researcher" });
      tenantMembership(db, MEMBERSHIP_FUTURE_ROLE, TENANT_A, FUTURE_ROLE_AUTHORITY, { validFrom: "2999-01-01T00:00:00.000Z" });
      tenantMembership(db, MEMBERSHIP_REVOKED_ROLE, TENANT_A, REVOKED_ROLE_AUTHORITY, { revokedAt: AFTER_EXPIRY });
      insertGrant(db);

      const approve = db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?");
      for (const deniedApprover of [INACTIVE_AUTHORITY, NON_OWNER_AUTHORITY, APPROVER_B, FUTURE_ROLE_AUTHORITY, REVOKED_ROLE_AUTHORITY]) {
        expect(() => approve.run(deniedApprover, START, GRANT_A)).toThrow(/same-tenant|approver|constraint/i);
      }
      approve.run(APPROVER_A, START, GRANT_A);

      db.prepare("UPDATE tenant_memberships SET status = 'disabled' WHERE id = ?").run(MEMBERSHIP_A);
      db.prepare("UPDATE support_access_grants SET updated_at = ? WHERE id = ?").run(AFTER_EXPIRY, GRANT_A);

      const revoke = db.prepare("UPDATE support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = ?, revoked_at = ? WHERE id = ?");
      for (const deniedRevoker of [RANDOM_REVOKER, INACTIVE_AUTHORITY, NON_OWNER_AUTHORITY, APPROVER_B, FUTURE_ROLE_AUTHORITY, REVOKED_ROLE_AUTHORITY]) {
        expect(() => revoke.run(deniedRevoker, EXPIRY, GRANT_A)).toThrow(/same-tenant|revoker|constraint/i);
      }
      revoke.run(REVOKER, EXPIRY, GRANT_A);

      expect(db.prepare("SELECT state, approved_by_auth_identity_id, revoked_by_auth_identity_id FROM support_access_grants WHERE id = ?").get(GRANT_A)).toEqual({
        state: "revoked",
        approved_by_auth_identity_id: APPROVER_A,
        revoked_by_auth_identity_id: REVOKER,
      });
      expect(db.prepare("SELECT status FROM tenant_memberships WHERE id = ?").get(MEMBERSHIP_A)).toEqual({ status: "disabled" });
      expect(() => db.prepare("UPDATE support_access_grants SET state = 'approved', revoked_by_auth_identity_id = NULL, revoked_at = NULL WHERE id = ?").run(GRANT_A)).toThrow(/state transition|one-way|constraint/i);
      expect(() => db.prepare("UPDATE support_access_grants SET reason = 'Mutated after revocation' WHERE id = ?").run(GRANT_A)).toThrow(/immutable|constraint/i);
    } finally { db.close(); }
  });

  it("requires non-empty allowlisted permission/data-class rows and rejects unknown or wildcard runtime scopes", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "scope-a"); workspace(db, WORKSPACE_A, TENANT_A, "scope");
      const base = { tenantId: TENANT_A, supportActorAuthIdentityId: SUPPORT_ACTOR, requestedByAuthIdentityId: REQUESTER, reasonCode: "diagnostic-review", reason: "Synthetic support diagnosis", startsAt: START, expiresAt: EXPIRY, correlationId: "corr-scope-001", auditEventId: AUDIT_A, permissions: ["tenant:read"], dataClasses: ["tenant_metadata"] };
      const withoutPermissions = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "permissions"));
      const withoutDataClasses = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "dataClasses"));
      expect(supportAccessGrantCreationInputSchema.safeParse(withoutPermissions).success).toBe(false);
      expect(supportAccessGrantCreationInputSchema.safeParse(withoutDataClasses).success).toBe(false);
      expect(supportAccessGrantCreationInputSchema.safeParse({ ...base, permissions: [] }).success).toBe(false);
      expect(supportAccessGrantCreationInputSchema.safeParse({ ...base, dataClasses: [] }).success).toBe(false);
      expect(supportAccessGrantCreationInputSchema.safeParse({ ...base, permissions: ["*"] }).success).toBe(false);
      expect(supportAccessGrantCreationInputSchema.safeParse({ ...base, dataClasses: ["documents", "unknown"] }).success).toBe(false);
      expect(() => insertGrant(db, { permissions: ["*"] })).toThrow(/CHECK|constraint/i);
      expect(() => insertGrant(db, { dataClasses: ["unknown"] })).toThrow(/CHECK|constraint/i);
      const insertEmptyGrant = db.transaction(() => {
        db.prepare(`INSERT INTO support_access_grants (id, tenant_id, workspace_id, support_actor_auth_identity_id, requested_by_auth_identity_id, reason_code, reason, starts_at, expires_at, correlation_id, audit_event_id, permission_anchor, data_class_anchor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(GRANT_B, TENANT_A, WORKSPACE_A, SUPPORT_ACTOR, REQUESTER, "diagnostic-review", "Empty scope", START, EXPIRY, "corr-scope-002", AUDIT_A, "tenant:read", "tenant_metadata");
      });
      expect(() => insertEmptyGrant()).toThrow(/FOREIGN KEY|constraint/i);
    } finally { db.close(); }
  });

  it("enforces pending, approved, and revoked facts, expiry boundaries, and one-way revocation", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "state-a"); workspace(db, WORKSPACE_A, TENANT_A, "state"); ownerMembership(db, MEMBERSHIP_A, TENANT_A, APPROVER_A);
      tenantMembership(db, MEMBERSHIP_REVOKER, TENANT_A, REVOKER, { role: "admin" });
      insertGrant(db);
      const pending = readGrant(db);
      expect(supportAccessGrantSchema.safeParse(pending).success).toBe(true);
      expect(isSupportAccessGrantEligibleAt({ ...pending, state: "pending", revokedAt: null } as never, START)).toBe(false);
      db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?").run(APPROVER_A, START, GRANT_A);
      const approved = readGrant(db);
      expect(approved.state).toBe("approved");
      expect(isSupportAccessGrantEligibleAt({ ...approved, state: "approved", revokedAt: null } as never, START)).toBe(true);
      expect(isSupportAccessGrantEligibleAt({ ...approved, state: "approved", revokedAt: null } as never, EXPIRY)).toBe(false);
      db.prepare("UPDATE support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = ?, revoked_at = ? WHERE id = ?").run(REVOKER, EXPIRY, GRANT_A);
      const revoked = readGrant(db);
      expect(revoked.state).toBe("revoked");
      expect(isSupportAccessGrantEligibleAt({ ...revoked, state: "revoked" } as never, START)).toBe(false);
      expect(() => db.prepare("UPDATE support_access_grants SET state = 'approved', revoked_by_auth_identity_id = NULL, revoked_at = NULL WHERE id = ?").run(GRANT_A)).toThrow(/state transition|one-way|constraint/i);
      for (const column of ["tenant_id", "workspace_id", "support_actor_auth_identity_id", "requested_by_auth_identity_id", "reason_code", "starts_at", "expires_at", "correlation_id", "audit_event_id"]) {
        expect(() => db.prepare(`UPDATE support_access_grants SET ${column} = ? WHERE id = ?`).run(column === "workspace_id" ? WORKSPACE_B : TENANT_B, GRANT_A)).toThrow(/immutable|FOREIGN KEY|constraint/i);
      }
      expect(() => db.prepare("INSERT INTO support_access_grant_permissions (grant_id, permission) VALUES (?, ?)").run(GRANT_A, "data:export")).toThrow(/immutable|scope/i);
      expect(() => db.prepare("DELETE FROM support_access_grant_data_classes WHERE grant_id = ?").run(GRANT_A)).toThrow(/cannot be deleted|immutable/i);
    } finally { db.close(); }
  });

  it("rejects audit-time temporal contradictions and accepts the defined boundaries in SQLite and runtime schemas", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "time-a"); workspace(db, WORKSPACE_A, TENANT_A, "time"); ownerMembership(db, MEMBERSHIP_A, TENANT_A, APPROVER_A);
      tenantMembership(db, MEMBERSHIP_REVOKER, TENANT_A, REVOKER, { role: "admin" });
      insertGrant(db);
      for (const approvedAt of ["2026-07-25T23:59:59.999Z", EXPIRY, AFTER_EXPIRY]) {
        expect(() => db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?").run(APPROVER_A, approvedAt, GRANT_A)).toThrow(/CHECK|constraint/i);
      }
      db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?").run(APPROVER_A, CREATED, GRANT_A);
      expect(() => db.prepare("UPDATE support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = ?, revoked_at = ? WHERE id = ?").run(REVOKER, "2026-07-25T23:59:59.999Z", GRANT_A)).toThrow(/CHECK|constraint/i);
      db.prepare("UPDATE support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = ?, revoked_at = ? WHERE id = ?").run(REVOKER, EXPIRY, GRANT_A);
      expect(() => insertGrant(db, { id: GRANT_B, workspaceId: null, updatedAt: "2026-07-25T23:59:59.999Z" })).toThrow(/CHECK|constraint/i);

      const pending = readGrant(db, GRANT_A);
      const approvedAt = (value: string) => ({ ...pending, state: "approved", approvedByAuthIdentityId: APPROVER_A, approvedAt: value, revokedByAuthIdentityId: null, revokedAt: null });
      const revokedAt = (value: string) => ({ ...approvedAt(CREATED), state: "revoked", revokedByAuthIdentityId: REVOKER, revokedAt: value });
      expect(supportAccessGrantSchema.safeParse(approvedAt(CREATED)).success).toBe(true);
      for (const value of ["2026-07-25T23:59:59.999Z", EXPIRY, AFTER_EXPIRY]) expect(supportAccessGrantSchema.safeParse(approvedAt(value)).success).toBe(false);
      expect(supportAccessGrantSchema.safeParse(revokedAt(CREATED)).success).toBe(true);
      expect(supportAccessGrantSchema.safeParse(revokedAt("2026-07-25T23:59:59.999Z")).success).toBe(false);
      expect(supportAccessGrantSchema.safeParse(revokedAt(EXPIRY)).success).toBe(true);
      expect(supportAccessGrantSchema.safeParse(revokedAt(AFTER_EXPIRY)).success).toBe(true);
      expect(supportAccessGrantSchema.safeParse({ ...pending, updatedAt: "2026-07-25T23:59:59.999Z" }).success).toBe(false);
    } finally { db.close(); }
  });

  it("keeps strict read schemas separate from authorization and preserves Postgres vocabulary/function hardening parity", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/202607270005_add_support_access_grants.sql"), "utf8");
    const db = database();
    try {
      const valid = {
        id: GRANT_A, tenantId: TENANT_A, workspaceId: WORKSPACE_A, supportActorAuthIdentityId: SUPPORT_ACTOR,
        platformRole: PLATFORM_SUPPORT_ROLE, requestedByAuthIdentityId: REQUESTER, approvedByAuthIdentityId: null,
        approvedAt: null, revokedByAuthIdentityId: null, revokedAt: null, state: "pending", reasonCode: "diagnostic-review",
        reason: "Synthetic support diagnosis", startsAt: START, expiresAt: EXPIRY, correlationId: "corr-support-001",
        auditEventId: AUDIT_A, permissions: [...PERMISSIONS], dataClasses: [...DATA_CLASSES], createdAt: START, updatedAt: START,
      };
      expect(supportAccessGrantSchema.safeParse({ ...valid, unknown: true }).success).toBe(false);
      expect(supportAccessGrantSchema.safeParse({ ...valid, platformRole: "admin" }).success).toBe(false);
    } finally { db.close(); }
    expect(migration).toContain("CREATE TABLE public.support_access_grants");
    expect(migration).toContain("platform_role = 'platform_support'");
    expect(migration).toContain("created_at <= approved_at");
    expect(migration).toContain("approved_at <= revoked_at");
    expect(migration).toContain("created_at <= updated_at");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("support grant approver must be an active same-tenant owner or admin");
    expect(migration).toContain("support grant revoker must be an active same-tenant owner or admin");
    expect(migration).toContain("binding.valid_from <= pg_catalog.now()");
    expect(migration).toContain("OLD.state = 'approved' AND NEW.state = 'revoked'");
    expect(migration).not.toContain("IF NEW.state IN ('approved', 'revoked')");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).not.toMatch(/CREATE POLICY|ENABLE ROW LEVEL SECURITY|jsonb|\*'/i);
  });
});
