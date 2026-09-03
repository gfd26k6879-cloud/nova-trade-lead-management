import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DbClient, DbStatement } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  createLocalTenantMembershipAdministrationService,
  hashLocalAuthIdentitySelector,
} from "@/lib/tenancy/local-membership-administration";
import { MembershipAdministrationError } from "@/lib/tenancy/memberships";
import type { TenantSession } from "@/lib/auth";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const ACTOR_A = "20000000-0000-4000-8000-000000000001";
const ACTOR_B = "20000000-0000-4000-8000-000000000002";
const BINDING_A = "30000000-0000-4000-8000-000000000001";
const BINDING_B = "30000000-0000-4000-8000-000000000002";
const AUTH_A = "40000000-0000-4000-8000-000000000001";
const AUTH_B = "40000000-0000-4000-8000-000000000002";
const INVITEE_AUTH = "40000000-0000-4000-8000-000000000099";
const TARGET_A = "50000000-0000-4000-8000-000000000001";
const TARGET_B = "50000000-0000-4000-8000-000000000002";
const TARGET_AUTH_A = "60000000-0000-4000-8000-000000000001";
const TARGET_AUTH_B = "60000000-0000-4000-8000-000000000002";
const BEFORE = "2026-01-01T00:00:00.000Z";

class TestDb implements DbClient {
  private tail: Promise<void> = Promise.resolve();
  failAudit = false;

  constructor(readonly sqlite: Database.Database) {}

  prepare(query: string): DbStatement {
    const statement = this.sqlite.prepare(query);
    return {
      get: async <T>(...params: unknown[]) => statement.get(...params) as T | undefined,
      all: async <T>(...params: unknown[]) => statement.all(...params) as T[],
      run: async (...params: unknown[]) => {
        if (this.failAudit && query.includes("INSERT INTO audit_logs")) throw new Error("forced audit failure");
        const result = statement.run(...params);
        return { changes: result.changes };
      },
    };
  }

  async exec(query: string): Promise<void> { this.sqlite.exec(query); }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const prior = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const value = await callback();
      this.sqlite.exec("COMMIT");
      return value;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }
}

const databases: Database.Database[] = [];

afterEach(() => {
  delete process.env.DATABASE_URL;
  for (const db of databases.splice(0)) db.close();
});

function world(): TestDb {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  const db = new TestDb(sqlite);
  seedTenant(sqlite, TENANT_A, ACTOR_A, AUTH_A, BINDING_A, "admin");
  seedTenant(sqlite, TENANT_B, ACTOR_B, AUTH_B, BINDING_B, "admin");
  seedMember(sqlite, TENANT_A, TARGET_A, TARGET_AUTH_A, "researcher");
  seedMember(sqlite, TENANT_B, TARGET_B, TARGET_AUTH_B, "researcher");
  return db;
}

function seedTenant(
  db: Database.Database,
  tenantId: string,
  membershipId: string,
  authId: string,
  bindingId: string,
  role: string,
): void {
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')")
    .run(tenantId, `tenant-${tenantId.at(-1)}`, `Tenant ${tenantId.at(-1)}`);
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, tenant_id, auth_identity_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(membershipId, tenantId, authId, BEFORE, BEFORE);
  db.prepare(
    `INSERT INTO tenant_role_bindings
      (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, 'initial_provisioning')`,
  ).run(bindingId, tenantId, membershipId, role, BEFORE, BEFORE);
}

function seedMember(db: Database.Database, tenantId: string, id: string, authId: string, role: string): void {
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, tenant_id, auth_identity_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(id, tenantId, authId, BEFORE, BEFORE);
  db.prepare(
    `INSERT INTO tenant_role_bindings
      (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, 'initial_provisioning')`,
  ).run(crypto.randomUUID(), tenantId, id, role, BEFORE, BEFORE);
}

function session(tenantId = TENANT_A): TenantSession {
  const isA = tenantId === TENANT_A;
  return {
    userId: isA ? AUTH_A : AUTH_B,
    email: "not-stored@example.test",
    displayName: null,
    tenantId,
    workspaceId: null,
    membershipId: isA ? ACTOR_A : ACTOR_B,
    role: "admin",
    roleBindingId: isA ? BINDING_A : BINDING_B,
  };
}

function commandBase(key: string) {
  return { reasonCode: "local_administration", correlationId: `corr.${key}`, idempotencyKey: key };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("SQLite local tenant membership administration adapter", () => {
  it("hashes only verified Auth UUIDs with domain separation and fails closed for PostgreSQL", () => {
    const hash = hashLocalAuthIdentitySelector(INVITEE_AUTH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain(INVITEE_AUTH);
    expect(() => hashLocalAuthIdentitySelector("invitee@example.test")).toThrow(MembershipAdministrationError);

    const db = world();
    process.env.DATABASE_URL = "postgresql://configured.invalid/database";
    expect(() => createLocalTenantMembershipAdministrationService(db)).toThrowError(
      expect.objectContaining({ code: "TRANSACTION_REQUIRED" }),
    );
  });

  it("creates tenant-isolated pending intents with durable audit/journal and no raw identity", async () => {
    const db = world();
    const service = createLocalTenantMembershipAdministrationService(db);
    const identitySelectorHash = hashLocalAuthIdentitySelector(INVITEE_AUTH);
    const command = { ...commandBase("invite-a-0001"), identitySelectorHash, role: "reviewer" as const, workspaceId: null };

    const a = await service.invitePendingMember(session(TENANT_A), command);
    const replay = await service.invitePendingMember(session(TENANT_A), command);
    const b = await service.invitePendingMember(session(TENANT_B), { ...command, idempotencyKey: "invite-b-0001", correlationId: "corr.invite-b-0001" });

    expect(replay).toEqual(a);
    expect(b.membership.membershipId).not.toBe(a.membership.membershipId);
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM tenant_membership_mutation_journal").get()).toEqual({ count: 2 });
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action = 'tenant.membership.mutated'").get()).toEqual({ count: 2 });
    expect(db.sqlite.prepare("SELECT COUNT(DISTINCT tenant_id) count FROM tenant_memberships WHERE pending_identity_ref_hash = ?").get(identitySelectorHash)).toEqual({ count: 2 });
    expect(JSON.stringify(db.sqlite.prepare("SELECT * FROM tenant_membership_mutation_journal").all())).not.toContain(INVITEE_AUTH);

    await expectCode(service.invitePendingMember(session(TENANT_A), {
      ...command, role: "owner", correlationId: "corr.invite-a-conflict",
    }), "IDEMPOTENCY_CONFLICT");
  });

  it("enforces the tenant invite cap atomically and keeps non-foundation mutations disabled", async () => {
    const db = world();
    const insertReservation = db.sqlite.prepare(
      `INSERT INTO tenant_membership_mutation_journal
        (idempotency_key_hash, input_hash, tenant_id, actor_membership_id,
         actor_role_binding_id, operation)
       VALUES (?, ?, ?, ?, ?, 'invite')`,
    );
    db.sqlite.transaction(() => {
      for (let index = 0; index < 100; index += 1) {
        insertReservation.run(
          index.toString(16).padStart(64, "0"),
          (index + 1_000).toString(16).padStart(64, "0"),
          TENANT_A,
          ACTOR_A,
          BINDING_A,
        );
      }
    })();

    const service = createLocalTenantMembershipAdministrationService(db);
    await expectCode(service.invitePendingMember(session(), {
      ...commandBase("invite-cap-0001"),
      identitySelectorHash: hashLocalAuthIdentitySelector(INVITEE_AUTH),
      role: "researcher",
      workspaceId: null,
    }), "POLICY_BLOCKED");
    expect(db.sqlite.prepare(
      "SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id = ? AND pending_identity_ref_hash IS NOT NULL",
    ).get(TENANT_A)).toEqual({ count: 0 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id = ?").get(TENANT_A))
      .toEqual({ count: 0 });
    await expectCode(service.disableMember(session(), {
      ...commandBase("disabled-local-operation-0001"), membershipId: TARGET_A,
    }), "POLICY_BLOCKED");
    const hostileService = createLocalTenantMembershipAdministrationService(db, {
      policyEvaluator: (context) => ({ allowed: true, context }),
    });
    await expectCode(hostileService.assignMemberWorkspace(session(), {
      ...commandBase("permissive-policy-bypass-0001"), membershipId: TARGET_A, workspaceId: null,
    }), "POLICY_BLOCKED");
  });

  it("uses tenant predicates for missing and foreign targets and persists role history once", async () => {
    const db = world();
    const service = createLocalTenantMembershipAdministrationService(db);
    const base = commandBase("role-a-0001");
    await expectCode(service.assignMemberRole(session(TENANT_A), { ...base, membershipId: TARGET_B, role: "reviewer" }), "TARGET_NOT_FOUND_OR_FORBIDDEN");
    await expectCode(service.assignMemberRole(session(TENANT_A), { ...base, idempotencyKey: "role-missing-0001", membershipId: crypto.randomUUID(), role: "reviewer" }), "TARGET_NOT_FOUND_OR_FORBIDDEN");

    const changed = await service.assignMemberRole(session(TENANT_A), { ...base, idempotencyKey: "role-good-0001", membershipId: TARGET_A, role: "reviewer" });
    const replay = await service.assignMemberRole(session(TENANT_A), { ...base, idempotencyKey: "role-good-0001", membershipId: TARGET_A, role: "reviewer" });
    expect(changed.membership.role).toBe("reviewer");
    expect(replay).toEqual(changed);
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM tenant_role_bindings WHERE tenant_id = ? AND membership_id = ?").get(TENANT_A, TARGET_A)).toEqual({ count: 2 });
    expect(db.sqlite.prepare("SELECT role FROM tenant_role_bindings WHERE tenant_id = ? AND membership_id = ? AND revoked_at IS NULL").get(TENANT_A, TARGET_A)).toEqual({ role: "reviewer" });
  });

  it("serializes final-owner races and supports one atomic replacement owner", async () => {
    const db = world();
    seedMember(db.sqlite, TENANT_A, "70000000-0000-4000-8000-000000000001", "80000000-0000-4000-8000-000000000001", "owner");
    seedMember(db.sqlite, TENANT_A, "70000000-0000-4000-8000-000000000002", "80000000-0000-4000-8000-000000000002", "owner");
    const service = createLocalTenantMembershipAdministrationService(db);
    const outcomes = await Promise.allSettled([
      service.assignMemberRole(session(), { ...commandBase("owner-race-0001"), membershipId: "70000000-0000-4000-8000-000000000001", role: "admin" }),
      service.assignMemberRole(session(), { ...commandBase("owner-race-0002"), membershipId: "70000000-0000-4000-8000-000000000002", role: "researcher" }),
    ]);
    expect(outcomes.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((value) => value.status === "rejected").map((value) => (value as PromiseRejectedResult).reason.code)).toEqual(["OWNER_GUARD"]);

    const remainingOwner = db.sqlite.prepare(
      `SELECT membership.id FROM tenant_memberships membership JOIN tenant_role_bindings binding
       ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
       WHERE membership.tenant_id = ? AND membership.status = 'active' AND binding.role = 'owner' AND binding.revoked_at IS NULL`,
    ).get(TENANT_A) as { id: string };
    const replacement = await service.assignMemberRole(session(), {
      ...commandBase("owner-replace-0001"), membershipId: remainingOwner.id, role: "reviewer", replacementOwnerMembershipId: TARGET_A,
    });
    expect(replacement.replacementMembership).toMatchObject({ membershipId: TARGET_A, role: "owner", status: "active" });
  });

  it("rolls membership, role, journal, and audit back together and succeeds after restart", async () => {
    const db = world();
    const effectiveAt = "2099-01-01T00:00:00.000Z";
    const options = { clock: () => new Date(effectiveAt) };
    const command = {
      ...commandBase("rollback-invite-0001"), identitySelectorHash: hashLocalAuthIdentitySelector(INVITEE_AUTH),
      role: "researcher" as const, workspaceId: null,
    };
    db.failAudit = true;
    const firstService = createLocalTenantMembershipAdministrationService(db, options);
    await expectCode(firstService.invitePendingMember(session(), command), "TRANSACTION_FAILED");
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM tenant_membership_mutation_journal").get()).toEqual({ count: 0 });
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM tenant_memberships WHERE pending_identity_ref_hash = ?").get(command.identitySelectorHash)).toEqual({ count: 0 });
    expect(db.sqlite.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action = 'tenant.membership.mutated'").get()).toEqual({ count: 0 });

    db.failAudit = false;
    const restartedService = createLocalTenantMembershipAdministrationService(db, options);
    const completed = await restartedService.invitePendingMember(session(), command);
    await expect(restartedService.invitePendingMember(session(), command)).resolves.toEqual(completed);
    expect(db.sqlite.prepare(
      "SELECT completed_at FROM tenant_membership_mutation_journal WHERE tenant_id = ?",
    ).get(TENANT_A)).toEqual({ completed_at: effectiveAt });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id = ?").get(TENANT_A))
      .toEqual({ count: 1 });
  });
});
