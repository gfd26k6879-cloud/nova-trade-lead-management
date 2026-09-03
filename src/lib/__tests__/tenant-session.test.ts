import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import type { DbClient } from "@/lib/db";
import {
  resolveTenantSessionForAppSession,
  TenantSessionUnavailableError,
  TenantSessionUnauthenticatedError,
} from "@/lib/auth";
import {
  createTenantSessionResolver,
  resolveTenantSessionScope,
  TenantScopeResolutionError,
  type TenantSessionScope,
} from "@/lib/app-users";
import { SCHEMA_SQL } from "@/lib/db/schema";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const TENANT_INACTIVE = "00000000-0000-4000-8000-000000000003";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_INACTIVE = "10000000-0000-4000-8000-000000000003";
const MEMBER_A = "20000000-0000-4000-8000-000000000001";
const MEMBER_B = "20000000-0000-4000-8000-000000000002";
const MEMBER_PENDING = "20000000-0000-4000-8000-000000000003";
const ROLE_A = "30000000-0000-4000-8000-000000000001";
const ROLE_B = "30000000-0000-4000-8000-000000000002";
const ROLE_REVOKED = "30000000-0000-4000-8000-000000000003";
const AUTH_SHARED = "50000000-0000-4000-8000-000000000001";
const AUTH_OTHER = "50000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const CREATED = "2026-07-27T00:00:00.000Z";

const openDatabases: Database.Database[] = [];

function createDb(): DbClient & { database: Database.Database } {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_SQL);
  openDatabases.push(database);
  const client: DbClient & { database: Database.Database } = {
    database,
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
  return client;
}

function seedFoundation(db: DbClient): void {
  const insert = db.prepare(
    `INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'en-US', 'UTC', ?, ?)`,
  );
  void insert.run(TENANT_A, "tenant-a", "Tenant A", "active", CREATED, CREATED);
  void insert.run(TENANT_B, "tenant-b", "Tenant B", "active", CREATED, CREATED);
  void insert.run(TENANT_INACTIVE, "tenant-inactive", "Inactive", "suspended", CREATED, CREATED);

  const workspace = db.prepare(
    `INSERT INTO workspaces (id, tenant_id, slug, name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  void workspace.run(WORKSPACE_A, TENANT_A, "workspace-a", "Workspace A", "active", CREATED, CREATED);
  void workspace.run(WORKSPACE_B, TENANT_B, "workspace-b", "Workspace B", "active", CREATED, CREATED);
  void workspace.run(WORKSPACE_INACTIVE, TENANT_A, "workspace-inactive", "Inactive", "paused", CREATED, CREATED);

  const membership = db.prepare(
    `INSERT INTO tenant_memberships
       (id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
  );
  void membership.run(MEMBER_A, TENANT_A, AUTH_SHARED, null, "active", CREATED, CREATED);
  void membership.run(MEMBER_B, TENANT_B, AUTH_SHARED, WORKSPACE_B, "active", CREATED, CREATED);

  const role = db.prepare(
    `INSERT INTO tenant_role_bindings
       (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'initial_provisioning')`,
  );
  void role.run(ROLE_A, TENANT_A, MEMBER_A, "owner", CREATED, CREATED);
  void role.run(ROLE_B, TENANT_B, MEMBER_B, "researcher", CREATED, CREATED);
}

function session(role: "admin" | "researcher" = "admin") {
  return {
    userId: AUTH_SHARED,
    email: "shared@example.com",
    displayName: "Shared User",
    role,
  } as const;
}

function resolveAtTrustedNow(
  input: Parameters<typeof resolveTenantSessionScope>[0],
  db: DbClient,
): Promise<TenantSessionScope> {
  return createTenantSessionResolver(db, { clock: () => NOW }).resolve(input);
}

function withExtraRows(
  base: DbClient,
  predicate: (query: string) => boolean,
  extraRows: readonly Record<string, unknown>[],
): DbClient {
  return {
    prepare(query) {
      const statement = base.prepare(query);
      return {
        get: (async <T = Record<string, unknown>>(...params: unknown[]) => statement.get<T>(...params)),
      all: async <T = Record<string, unknown>>(...params: unknown[]) => {
          const rows = await statement.all<T>(...params);
          return predicate(query)
            ? [...rows, ...extraRows.map((extra) => ({ ...rows[0], ...extra })) as T[]]
            : rows;
        },
        run: (...params: unknown[]) => statement.run(...params),
      };
    },
    exec: (query) => base.exec(query),
  };
}

function withMembershipMutationAfterFirstRead(base: DbClient & { database: Database.Database }): {
  client: DbClient;
  getReadCount: () => number;
  wasReadAfterMutation: () => boolean;
} {
  let readCount = 0;
  let mutated = false;
  let readAfterMutation = false;
  const client: DbClient = {
    prepare(query) {
      const statement = base.prepare(query);
      return {
        get: (...params: unknown[]) => statement.get(...params),
        all: async <T = Record<string, unknown>>(...params: unknown[]) => {
          if (mutated) readAfterMutation = true;
          const rows = await statement.all<T>(...params);
          readCount += 1;
          if (readCount === 1) {
            base.database.prepare("UPDATE tenant_memberships SET status = ? WHERE id = ?").run("disabled", MEMBER_A);
            mutated = true;
          }
          return rows;
        },
        run: (...params: unknown[]) => statement.run(...params),
      };
    },
    exec: (query) => base.exec(query),
  };
  return {
    client,
    getReadCount: () => readCount,
    wasReadAfterMutation: () => readAfterMutation,
  };
}

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
});

describe("tenant session scope", () => {
  it("resolves an exact active tenant-wide membership and launch role", async () => {
    const db = createDb();
    seedFoundation(db);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A },
    }, db)).resolves.toEqual({
      tenantId: TENANT_A,
      workspaceId: null,
      membershipId: MEMBER_A,
      role: "owner",
      roleBindingId: ROLE_A,
    });
  });

  it("allows a tenant-wide member to select one active workspace", async () => {
    const db = createDb();
    seedFoundation(db);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    }, db)).resolves.toMatchObject({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
  });

  it("resolves an assigned workspace when the selector is omitted", async () => {
    const db = createDb();
    seedFoundation(db);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_B },
    }, db)).resolves.toMatchObject({ tenantId: TENANT_B, workspaceId: WORKSPACE_B, membershipId: MEMBER_B });
  });

  it("defaults an empty selector only when one active membership scope is unambiguous", async () => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare("UPDATE tenant_memberships SET status = 'disabled' WHERE id = ?").run(MEMBER_B);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: {},
    }, db)).resolves.toEqual({
      tenantId: TENANT_A,
      workspaceId: null,
      membershipId: MEMBER_A,
      role: "owner",
      roleBindingId: ROLE_A,
    });
  });

  it("fails closed for zero or multiple default membership scopes", async () => {
    const zero = createDb();
    seedFoundation(zero);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_OTHER, selector: {} }, zero))
      .rejects.toMatchObject({ code: "TENANT_SCOPE_UNAVAILABLE" });

    const multiple = createDb();
    seedFoundation(multiple);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: {} }, multiple))
      .rejects.toMatchObject({ code: "TENANT_SCOPE_UNAVAILABLE" });
  });

  it.each(["pending", "suspended", "disabled"] as const)("does not default a %s membership", async (status) => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare("UPDATE tenant_memberships SET status = ?").run(status);

    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: {} }, db))
      .rejects.toMatchObject({ code: "TENANT_SCOPE_UNAVAILABLE" });
  });

  it("fails closed when default membership rows are internally inconsistent", async () => {
    const base = createDb();
    seedFoundation(base);
    await base.prepare("UPDATE tenant_memberships SET status = 'disabled' WHERE id = ?").run(MEMBER_B);
    const inconsistent = withExtraRows(base, (query) => query.includes("JOIN tenant_memberships"), [{
      membership_auth_identity_id: AUTH_OTHER,
    }]);

    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: {} }, inconsistent))
      .rejects.toMatchObject({ code: "TENANT_SCOPE_UNAVAILABLE" });
  });

  it.each([
    ["workspace selector without tenant", { tenantId: undefined, workspaceId: WORKSPACE_A }],
    ["malformed tenant selector", { tenantId: "not-a-uuid" }],
    ["wrong tenant", { tenantId: "00000000-0000-4000-8000-000000000099" }],
    ["cross-tenant workspace", { tenantId: TENANT_A, workspaceId: WORKSPACE_B }],
    ["inactive workspace", { tenantId: TENANT_A, workspaceId: WORKSPACE_INACTIVE }],
    ["malformed workspace selector", { tenantId: TENANT_A, workspaceId: "bad" }],
  ])("fails closed for %s", async (_label, selector) => {
    const db = createDb();
    seedFoundation(db);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector }, db))
      .rejects.toMatchObject({ name: "TenantScopeResolutionError" });
  });

  it.each(["pending", "suspended", "disabled"] as const)("rejects %s membership", async (status) => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare("UPDATE tenant_memberships SET status = ? WHERE id = ?").run(status, MEMBER_A);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A },
    }, db)).rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("rejects an inactive tenant", async () => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare(
      `INSERT INTO tenant_memberships
       (id, tenant_id, auth_identity_id, workspace_id, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'active', ?, ?)`,
    ).run(MEMBER_PENDING, TENANT_INACTIVE, AUTH_OTHER, CREATED, CREATED);
    await db.prepare(
      `INSERT INTO tenant_role_bindings
       (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
       VALUES (?, ?, ?, 'owner', ?, ?, 'initial_provisioning')`,
    ).run(ROLE_REVOKED, TENANT_INACTIVE, MEMBER_PENDING, CREATED, CREATED);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_OTHER,
      selector: { tenantId: TENANT_INACTIVE },
    }, db)).rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it.each(["missing", "future"] as const)("rejects %s role binding", async (label) => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare("DELETE FROM tenant_role_bindings WHERE membership_id = ?").run(MEMBER_A);
    if (label === "future") {
      await db.prepare(
        `INSERT INTO tenant_role_bindings
         (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
         VALUES (?, ?, ?, 'owner', ?, ?, 'initial_provisioning')`,
      ).run(ROLE_A, TENANT_A, MEMBER_A, CREATED, "2026-07-27T13:00:00.000Z");
    }
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }, db))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("does not allow a forged request clock to activate a future role", async () => {
    const db = createDb();
    seedFoundation(db);
    await db.prepare("DELETE FROM tenant_role_bindings WHERE membership_id = ?").run(MEMBER_A);
    await db.prepare(
      `INSERT INTO tenant_role_bindings
       (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
       VALUES (?, ?, ?, 'owner', ?, ?, 'initial_provisioning')`,
    ).run(ROLE_A, TENANT_A, MEMBER_A, CREATED, "2026-07-27T13:00:00.000Z");

    const forgedInput = {
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A },
      now: new Date("2026-07-27T14:00:00.000Z"),
    } as unknown as Parameters<typeof resolveTenantSessionScope>[0];
    const resolver = createTenantSessionResolver(db, { clock: () => NOW });
    await expect(resolver.resolve(forgedInput)).rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("uses one joined authority read with no intermediate mutation hook", async () => {
    const base = createDb();
    seedFoundation(base);
    const adversarial = withMembershipMutationAfterFirstRead(base);

    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A },
    }, adversarial.client)).resolves.toMatchObject({ tenantId: TENANT_A, membershipId: MEMBER_A });
    expect(adversarial.getReadCount()).toBe(1);
    expect(adversarial.wasReadAfterMutation()).toBe(false);
    await expect(resolveAtTrustedNow({
      authIdentityId: AUTH_SHARED,
      selector: { tenantId: TENANT_A },
    }, adversarial.client)).rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("rejects revoked, multiple-current, and unknown role bindings", async () => {
    const base = createDb();
    seedFoundation(base);
    await base.prepare("UPDATE tenant_role_bindings SET revoked_at = ? WHERE id = ?").run("2026-07-27T11:00:00.000Z", ROLE_A);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }, base))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);

    const duplicateBase = createDb();
    seedFoundation(duplicateBase);
    const duplicate = withExtraRows(duplicateBase, (query) => query.includes("LEFT JOIN tenant_role_bindings"), [{
      role_binding_id: "30000000-0000-4000-8000-000000000004",
    }]);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }, duplicate))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);

    const unknownBase = createDb();
    seedFoundation(unknownBase);
    const unknown = withExtraRows(unknownBase, (query) => query.includes("LEFT JOIN tenant_role_bindings"), [{
      role_binding_id: "30000000-0000-4000-8000-000000000005",
      role_binding_role: "platform_support",
    }]);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }, unknown))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("fails closed on malformed returned IDs", async () => {
    const db = createDb();
    seedFoundation(db);
    const malformed = withExtraRows(db, (query) => query.includes("JOIN tenant_memberships"), [{
      membership_id: "malformed",
    }]);
    await expect(resolveAtTrustedNow({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }, malformed))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("revalidates explicit tenant switches without shared mutable context", async () => {
    const db = createDb();
    seedFoundation(db);
    const resolver = createTenantSessionResolver(db, { clock: () => NOW });
    const [a, b] = await Promise.all([
      resolver.resolve({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }),
      resolver.resolve({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_B } }),
    ]);
    expect(a.tenantId).toBe(TENANT_A);
    expect(a.workspaceId).toBeNull();
    expect(b.tenantId).toBe(TENANT_B);
    expect(b.workspaceId).toBe(WORKSPACE_B);
    await expect(resolver.resolve({ authIdentityId: AUTH_SHARED, selector: { tenantId: TENANT_A } }))
      .resolves.toMatchObject({ tenantId: TENANT_A, workspaceId: null });
  });

  it("does not derive authority from the legacy app role", async () => {
    const expected: TenantSessionScope = {
      tenantId: TENANT_A,
      workspaceId: null,
      membershipId: MEMBER_A,
      role: "owner",
      roleBindingId: ROLE_A,
    };
    const result = await resolveTenantSessionForAppSession(
      session("researcher"),
      { tenantId: TENANT_A },
      { resolver: { resolve: async () => expected } },
    );
    expect(result).toEqual({ kind: "resolved", session: { ...session("researcher"), ...expected } });
  });

  it("distinguishes unauthenticated from authenticated without valid scope", async () => {
    const resolver = { resolve: async () => { throw new Error("database unavailable"); } };
    await expect(resolveTenantSessionForAppSession(null, { tenantId: TENANT_A }, { resolver }))
      .resolves.toEqual({ kind: "unauthenticated", code: "AUTH_REQUIRED" });
    await expect(resolveTenantSessionForAppSession(session(), { tenantId: TENANT_A }, { resolver }))
      .resolves.toEqual({ kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" });
    await expect(resolveTenantSessionForAppSession({ ...session(), status: "pending" }, { tenantId: TENANT_A }, { resolver }))
      .resolves.toEqual({ kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" });
  });

  it("keeps requireTenantSession errors non-enumerating and stable", async () => {
    const unavailable = await resolveTenantSessionForAppSession(session(), { tenantId: TENANT_A }, {
      resolver: { resolve: async () => { throw new Error(`foreign tenant ${TENANT_B}`); } },
    });
    expect(unavailable).toEqual({ kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" });
    await expect(Promise.reject(new TenantSessionUnauthenticatedError())).rejects.toMatchObject({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication required",
    });
    await expect(Promise.reject(new TenantSessionUnavailableError())).rejects.toMatchObject({
      status: 403,
      code: "TENANT_SCOPE_UNAVAILABLE",
      message: "No valid tenant scope is available for this request.",
    });
  });
});
