import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const appUserMocks = vi.hoisted(() => ({ listAppUsers: vi.fn() }));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  withTenantDbContext: vi.fn((fn: (db: unknown) => Promise<unknown>) => fn({})),
}));

const queryMocks = vi.hoisted(() => ({
  listLocationMarkets: vi.fn(),
  listUserMarketAccessForUsers: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  listMemberships: vi.fn(),
  getCurrentRoleBinding: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({ assertTenantPermission: vi.fn() }));

const tenantContextMocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(() => null),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/app-users", () => appUserMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/queries", () => ({
  createTenantQueryRepository: vi.fn(() => repositoryMocks),
}));
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);

import UsersPage from "@/app/(protected)/users/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000001";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000001";

const TENANT_SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: MEMBERSHIP_ID,
  roleBindingId: ROLE_BINDING_ID,
  role: "owner",
} as const;

const ACTOR_MEMBERSHIP = {
  id: MEMBERSHIP_ID,
  tenantId: TENANT_ID,
  authIdentityId: "user-1",
  pendingIdentityRefHash: null,
  workspaceId: null,
  status: "active",
  invitedByMembershipId: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
} as const;

const ACTOR_ROLE = {
  id: ROLE_BINDING_ID,
  tenantId: TENANT_ID,
  membershipId: MEMBERSHIP_ID,
  role: "owner",
  createdAt: "2026-08-30T00:00:00.000Z",
  validFrom: "2026-08-30T00:00:00.000Z",
  revokedAt: null,
  assignedByMembershipId: null,
  reasonCode: "initial_provisioning",
} as const;

describe("UsersPage tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    repositoryMocks.listMemberships.mockResolvedValue([ACTOR_MEMBERSHIP]);
    repositoryMocks.getCurrentRoleBinding.mockResolvedValue(ACTOR_ROLE);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    dbIndexMocks.withTenantDbContext.mockImplementation((fn: (db: unknown) => Promise<unknown>) => fn({}));
    tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn());
  });

  it("loads only canonical memberships inside exact tenant authorization and database contexts", async () => {
    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Canonical membership directory");
    expect(text).toContain(MEMBERSHIP_ID);
    expect(authMocks.requirePermission).toHaveBeenCalledWith("users:manage");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "membership:read",
      { action: "users.page" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^users-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(tenantContextMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
    expect(dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0]).toBeLessThan(
      repositoryMocks.listMemberships.mock.invocationCallOrder[0],
    );
    expect(repositoryMocks.listMemberships).toHaveBeenCalledWith(TENANT_ID);
    expect(repositoryMocks.getCurrentRoleBinding).toHaveBeenCalledWith(TENANT_ID, MEMBERSHIP_ID);
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
    expect(queryMocks.listLocationMarkets).not.toHaveBeenCalled();
    expect(queryMocks.listUserMarketAccessForUsers).not.toHaveBeenCalled();
  });

  it.each([
    ["missing tenant scope", null],
    ["different authenticated identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["workspace scope", { ...TENANT_SESSION, workspaceId: "20000000-0000-4000-8000-000000000001" }],
  ])("fails closed before all database and global user reads for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Tenant members unavailable");
    expect(text).toContain("No user, membership, territory, or market-access records were read");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
    expect(queryMocks.listLocationMarkets).not.toHaveBeenCalled();
    expect(queryMocks.listUserMarketAccessForUsers).not.toHaveBeenCalled();
  });

  it("normalizes permission denial before any database or global user read", async () => {
    authorizationMocks.assertTenantPermission.mockRejectedValue(new Error("sensitive authorization detail"));

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Tenant members unavailable");
    expect(text).not.toContain("sensitive authorization detail");
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
  });

  it("normalizes tenant resolution failures before any database or global user read", async () => {
    authMocks.getTenantSession.mockRejectedValue(new Error("sensitive resolver detail"));

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Tenant members unavailable");
    expect(text).not.toContain("sensitive resolver detail");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign membership", [{ ...ACTOR_MEMBERSHIP, tenantId: "10000000-0000-4000-8000-000000000002" }], [ACTOR_ROLE]],
    ["missing actor", [{ ...ACTOR_MEMBERSHIP, id: "30000000-0000-4000-8000-000000000002" }], [null]],
    ["foreign role binding", [ACTOR_MEMBERSHIP], [{ ...ACTOR_ROLE, tenantId: "10000000-0000-4000-8000-000000000002" }]],
    ["future role binding", [ACTOR_MEMBERSHIP], [{ ...ACTOR_ROLE, validFrom: "2099-08-30T00:00:00.000Z" }]],
    ["duplicate membership", [ACTOR_MEMBERSHIP, ACTOR_MEMBERSHIP], [ACTOR_ROLE, ACTOR_ROLE]],
  ])("rejects a malformed canonical snapshot without falling back to global users: %s", async (_label, memberships, roleBindings) => {
    repositoryMocks.listMemberships.mockResolvedValue(memberships);
    repositoryMocks.getCurrentRoleBinding.mockImplementation(async (_tenantId: string, membershipId: string) => {
      const index = memberships.findIndex((membership) => membership.id === membershipId);
      return roleBindings[index] ?? null;
    });

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("No platform-global user or market-access fallback was attempted");
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
    expect(queryMocks.listLocationMarkets).not.toHaveBeenCalled();
    expect(queryMocks.listUserMarketAccessForUsers).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical repository omits the authenticated actor", async () => {
    repositoryMocks.listMemberships.mockResolvedValue([]);

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("No platform-global user or market-access fallback was attempted");
    expect(text).not.toContain("Canonical membership directory");
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
  });
});
