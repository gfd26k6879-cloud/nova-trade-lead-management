import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  canStartTenantWorker,
  canTenantOperation,
  canTransitionTenant,
  createTenantLifecycleService,
  requireTenantOperation,
  requireTenantTransition,
  requireTenantWorkerStart,
  transitionTenantLifecycle,
  type TenantLifecycleAuditEvent,
  type TenantLifecycleDependencies,
  type TenantLifecycleTransactionRunner,
  type TenantLifecycleTransactionScope,
} from "@/lib/tenancy/lifecycle";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";
import type { TenantStatus } from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const MISSING_TENANT = "00000000-0000-4000-8000-000000000099";
const ACTOR = "50000000-0000-4000-8000-000000000001";
const CORRELATION = "corr-lifecycle-001";

const openDatabases: Database.Database[] = [];

interface Fixture {
  database: Database.Database;
  scopedDb: DbClient;
  repository: TenantQueryRepository;
  dependencies: TenantLifecycleDependencies;
  auditWriter: TenantLifecycleTransactionScope["auditWriter"];
  events: TenantLifecycleAuditEvent[];
  queries: string[];
}

function createFixture(aStatus: TenantStatus = "active", bStatus: TenantStatus = "active"): Fixture {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_SQL);
  openDatabases.push(database);
  const queries: string[] = [];

  const client: DbClient = {
    prepare(query) {
      queries.push(query);
      const statement = database.prepare(query);
      return {
        get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
        all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
        run: async (...params) => ({ changes: statement.run(...params).changes }),
      };
    },
    exec: async (query) => {
      database.exec(query);
    },
    withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };

  const insertTenant = (id: string, slug: string, status: TenantStatus): void => {
    database
      .prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, ?)")
      .run(id, slug, `${slug} tenant`, status);
  };
  insertTenant(TENANT_A, "tenant-a", aStatus);
  insertTenant(TENANT_B, "tenant-b", bStatus);

  const repository = {
    getTenant: async (tenantId: string) => {
      const row = await client.prepare(
        `SELECT id, slug, name, status, locale, timezone, created_at, updated_at
         FROM tenants
         WHERE id = ?`,
      ).get<{
        id: string;
        slug: string;
        name: string;
        status: TenantStatus;
        locale: string;
        timezone: string;
        created_at: string;
        updated_at: string;
      }>(tenantId);
      return row
        ? {
            id: row.id,
            slug: row.slug,
            name: row.name,
            status: row.status,
            locale: row.locale,
            timezone: row.timezone,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }
        : null;
    },
  } as unknown as TenantQueryRepository;
  const events: TenantLifecycleAuditEvent[] = [];
  const auditWriter: TenantLifecycleTransactionScope["auditWriter"] = {
    async write(event) {
      await client
        .prepare(
            `INSERT INTO audit_logs (id, action, entity_type, entity_id, actor_user_id, actor_role, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            `audit-${events.length + 1}`,
            event.action,
            "tenant",
            event.tenantId,
            event.actorId,
            event.actorLayer,
            JSON.stringify({
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              reasonCode: event.reasonCode,
              reason: event.reason,
              correlationId: event.correlationId,
            }),
        );
      events.push(event);
    },
  };
  const transactionRunner: TenantLifecycleTransactionRunner = {
    run: async <T>(callback: (scope: TenantLifecycleTransactionScope) => Promise<T>): Promise<T> => {
      if (!client.withTransaction) throw new Error("fixture transaction unavailable");
      return client.withTransaction(() => callback({ db: client, repository, auditWriter }));
    },
  };
  const dependencies: TenantLifecycleDependencies = { transactionRunner };
  return { database, scopedDb: client, repository, dependencies, auditWriter, events, queries };
}

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
});

function request(tenantId: string, expectedCurrentState: TenantStatus, toStatus: TenantStatus) {
  return {
    tenantId,
    actorId: ACTOR,
    actorLayer: "member" as const,
    reasonCode: "operator_review",
    reason: "Synthetic lifecycle test reason",
    correlationId: CORRELATION,
    expectedCurrentState,
    toStatus,
  };
}

describe("tenant lifecycle state machine", () => {
  it.each([
    ["active", "suspended"],
    ["suspended", "active"],
    ["active", "archived"],
    ["suspended", "archived"],
  ] as const)("allows %s -> %s and rejects no permission by itself", (from, to) => {
    expect(canTransitionTenant(from, to)).toEqual({ allowed: true, code: "ALLOWED" });
  });

  it.each([
    ["provisioning", "active"],
    ["archived", "active"],
    ["active", "deletion_pending"],
    ["archived", "deletion_pending"],
    ["deletion_pending", "deleted"],
    ["deleted", "active"],
    ["active", "active"],
  ] as const)("rejects dedicated or invalid transition %s -> %s", (from, to) => {
    expect(canTransitionTenant(from, to)).toEqual({ allowed: false, code: "BLOCKED_STATE_CONFLICT" });
  });

  it("returns stable non-enumerating codes from require helpers without mutating state", () => {
    expect(() => requireTenantTransition("archived", "active")).toThrowError(
      expect.objectContaining({ code: "BLOCKED_STATE_CONFLICT" }),
    );
    expect(() => requireTenantOperation("suspended", "business_mutation")).toThrowError(
      expect.objectContaining({ code: "BLOCKED_STATE_CONFLICT" }),
    );
    expect(() => requireTenantWorkerStart("deleted")).toThrowError(
      expect.objectContaining({ code: "BLOCKED_STATE_CONFLICT" }),
    );
  });

  it("keeps operation policy separate from authorization", () => {
    expect(canTenantOperation("provisioning", "setup")).toEqual({ allowed: true, code: "ALLOWED" });
    expect(canTenantOperation("provisioning", "read").allowed).toBe(false);
    expect(canTenantOperation("provisioning", "status").allowed).toBe(false);
    expect(canTenantOperation("active", "business_mutation").allowed).toBe(true);
    expect(canTenantOperation("suspended", "status").allowed).toBe(true);
    expect(canTenantOperation("suspended", "read").allowed).toBe(true);
    expect(canTenantOperation("suspended", "export").allowed).toBe(true);
    expect(canTenantOperation("suspended", "remediation").allowed).toBe(true);
    expect(canTenantOperation("suspended", "recovery").allowed).toBe(true);
    expect(canTenantOperation("suspended", "worker_start").allowed).toBe(false);
    expect(canTenantOperation("archived", "read").allowed).toBe(true);
    expect(canTenantOperation("archived", "status").allowed).toBe(true);
    expect(canTenantOperation("archived", "export").allowed).toBe(true);
    expect(canTenantOperation("archived", "deletion_request").allowed).toBe(true);
    expect(canTenantOperation("archived", "business_mutation").allowed).toBe(false);
    expect(canTenantOperation("deletion_pending", "read").allowed).toBe(false);
    expect(canTenantOperation("deleted", "worker_start").allowed).toBe(false);
  });

  it("denies direct worker starts for every non-active state", () => {
    for (const status of ["provisioning", "suspended", "archived", "deletion_pending", "deleted"] as const) {
      expect(canStartTenantWorker(status)).toEqual({ allowed: false, code: "BLOCKED_STATE_CONFLICT" });
    }
    expect(canStartTenantWorker("active")).toEqual({ allowed: true, code: "ALLOWED" });
  });
});

describe("transactional tenant lifecycle transitions", () => {
  it("performs an exact CAS, audits before commit, reads through T-009, and preserves ID/slug", async () => {
    const fixture = createFixture("active", "suspended");
    fixture.queries.length = 0;

    const result = await transitionTenantLifecycle(request(TENANT_A, "active", "suspended"), fixture.dependencies);

    expect(result.tenant).toMatchObject({ id: TENANT_A, slug: "tenant-a", status: "suspended" });
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toMatchObject({
      tenantId: TENANT_A,
      fromStatus: "active",
      toStatus: "suspended",
      actorId: ACTOR,
      actorLayer: "member",
      reasonCode: "operator_review",
      reason: "Synthetic lifecycle test reason",
      correlationId: CORRELATION,
    });
    expect(fixture.database.prepare("SELECT id, slug, status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({
      id: TENANT_A,
      slug: "tenant-a",
      status: "suspended",
    });
    expect(fixture.queries).toContain("UPDATE tenants SET status = ? WHERE id = ? AND status = ?");
    expect(fixture.queries.some((query) => /DELETE\s+FROM\s+tenants/i.test(query))).toBe(false);
  });

  it("uses only the callback-scoped client and never calls an outer client", async () => {
    const fixture = createFixture("active", "active");
    let outerCalls = 0;
    const outerDb: DbClient = {
      prepare: () => {
        outerCalls += 1;
        throw new Error("outer/non-scoped client must not be used");
      },
      exec: async () => undefined,
      withTransaction: async () => {
        outerCalls += 1;
        throw new Error("outer/non-scoped transaction must not be used");
      },
    };
    const runner: TenantLifecycleTransactionRunner = {
      run: async <T>(callback: (scope: TenantLifecycleTransactionScope) => Promise<T>): Promise<T> => {
        if (!fixture.scopedDb.withTransaction) throw new Error("fixture transaction unavailable");
        const scope: TenantLifecycleTransactionScope = {
          db: fixture.scopedDb,
          repository: fixture.repository,
          auditWriter: fixture.auditWriter,
        };
        expect(scope.db).not.toBe(outerDb);
        return fixture.scopedDb.withTransaction(() => callback(scope));
      },
    };

    await transitionTenantLifecycle(request(TENANT_A, "active", "suspended"), { transactionRunner: runner });

    expect(outerCalls).toBe(0);
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({ status: "suspended" });
  });

  it("does not reveal absent, foreign, stale, or concurrent-loser distinctions", async () => {
    const fixture = createFixture("active", "active");
    const cases = [
      request(MISSING_TENANT, "active", "suspended"),
      request(TENANT_A, "suspended", "archived"),
      request(TENANT_B, "suspended", "archived"),
    ];

    for (const input of cases) {
      await expect(transitionTenantLifecycle(input, fixture.dependencies)).rejects.toMatchObject({
        code: "NOT_FOUND_NON_ENUMERATING",
      });
    }
    expect(fixture.events).toHaveLength(0);
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({ status: "active" });
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_B)).toEqual({ status: "active" });
  });

  it("rolls back the CAS when the mandatory audit writer fails", async () => {
    const fixture = createFixture("active", "active");
    fixture.auditWriter.write = async () => {
      throw new Error("audit unavailable");
    };

    await expect(transitionTenantLifecycle(request(TENANT_A, "active", "suspended"), fixture.dependencies)).rejects.toMatchObject({
      code: "FAILED_INTERNAL",
    });
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({ status: "active" });
    expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });
  });

  it("fails closed before SQL when transaction or audit capability is missing", async () => {
    const fixture = createFixture("active", "active");
    const noRunner = { transactionRunner: undefined as never };
    await expect(transitionTenantLifecycle(request(TENANT_A, "active", "suspended"), noRunner)).rejects.toMatchObject({
      code: "BLOCKED_TRANSACTION_REQUIRED",
    });

    const missingScopeCapability: TenantLifecycleDependencies = {
      transactionRunner: {
        run: async (callback) => callback({
          db: fixture.scopedDb,
          repository: fixture.repository,
          auditWriter: undefined as never,
        }),
      },
    };
    await expect(transitionTenantLifecycle(request(TENANT_A, "active", "suspended"), missingScopeCapability)).rejects.toMatchObject({
      code: "BLOCKED_AUDIT_REQUIRED",
    });
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({ status: "active" });
  });

  it("keeps two-tenant state isolated and makes deleted terminal", async () => {
    const fixture = createFixture("active", "suspended");
    await transitionTenantLifecycle(request(TENANT_A, "active", "archived"), fixture.dependencies);
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_A)).toEqual({ status: "archived" });
    expect(fixture.database.prepare("SELECT status FROM tenants WHERE id = ?").get(TENANT_B)).toEqual({ status: "suspended" });

    const terminal = createFixture("deleted", "deleted");
    for (const toStatus of ["active", "suspended", "archived", "deletion_pending", "deleted"] as const) {
      await expect(transitionTenantLifecycle(request(TENANT_A, "deleted", toStatus), terminal.dependencies)).rejects.toMatchObject({
        code: "BLOCKED_STATE_CONFLICT",
      });
    }
  });

  it("binds a service without creating authorization or route behavior", async () => {
    const fixture = createFixture("active", "active");
    const service = createTenantLifecycleService(fixture.dependencies);
    expect(service.canTenantOperation("active", "worker_start")).toEqual({ allowed: true, code: "ALLOWED" });
    await service.transitionTenantLifecycle(request(TENANT_A, "active", "suspended"));
    expect(fixture.events[0].actorLayer).toBe("member");
  });

  it("rejects malformed actor, reason, correlation, and expected-state input", async () => {
    const fixture = createFixture("active", "active");
    const malformed = {
      ...request(TENANT_A, "active", "suspended"),
      actorId: "",
      reasonCode: "not valid",
      correlationId: "short",
    };
    await expect(transitionTenantLifecycle(malformed, fixture.dependencies)).rejects.toMatchObject({
      code: "BLOCKED_MALFORMED",
    });
    expect(fixture.events).toHaveLength(0);
  });

  it("normalizes safe audit fields and rejects control or unsafe reason content", async () => {
    const fixture = createFixture("active", "active");
    await transitionTenantLifecycle(
      {
        ...request(TENANT_A, "active", "suspended"),
        actorId: `  ${ACTOR}  `,
        reason: "  Safe operator reason  ",
      },
      fixture.dependencies,
    );
    expect(fixture.events[0]).toMatchObject({ actorId: ACTOR, reason: "Safe operator reason" });

    const unsafe = [
      { actorId: `${ACTOR}\n` },
      { reason: "unsafe\nreason" },
      { reason: "<arbitrary-content>" },
      { reason: "a".repeat(501) },
    ];
    for (const override of unsafe) {
      const nextFixture = createFixture("active", "active");
      await expect(
        transitionTenantLifecycle({ ...request(TENANT_A, "active", "suspended"), ...override }, nextFixture.dependencies),
      ).rejects.toMatchObject({ code: "BLOCKED_MALFORMED" });
      expect(nextFixture.events).toHaveLength(0);
    }
  });
});
