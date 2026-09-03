import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getTenantSession: vi.fn() }));
const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  withTenantDbContext: vi.fn((fn: (db: unknown) => Promise<unknown>) => fn({ kind: "scoped-db" })),
}));
const repositoryMocks = vi.hoisted(() => ({
  listMembershipDirectory: vi.fn(),
  listRoleBindings: vi.fn(),
  listMemberships: vi.fn(),
  getCurrentRoleBinding: vi.fn(),
}));
const authorizationMocks = vi.hoisted(() => ({ assertTenantPermission: vi.fn() }));
const tenantContextMocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(() => null),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
}));
const localMocks = vi.hoisted(() => ({
  isLocalMembershipAdministrationAvailable: vi.fn(),
  createLocalTenantMembershipAdministrationService: vi.fn(),
  listCurrent: vi.fn(),
  listHistory: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/tenancy/queries", () => ({ createTenantQueryRepository: vi.fn(() => repositoryMocks) }));
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("@/lib/tenancy/local-membership-administration", () => ({
  isLocalMembershipAdministrationAvailable: localMocks.isLocalMembershipAdministrationAvailable,
  createLocalTenantMembershipAdministrationService: localMocks.createLocalTenantMembershipAdministrationService,
  hashLocalAuthIdentitySelector: vi.fn(),
}));

import UsersPage from "@/app/(protected)/users/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000001";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000001";
const TERMINAL_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000002";
const TERMINAL_ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000003";

const TENANT_SESSION = {
  userId: USER_ID,
  email: "admin@example.com",
  displayName: null,
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: MEMBERSHIP_ID,
  roleBindingId: ROLE_BINDING_ID,
  role: "owner",
} as const;
const ACTOR_VIEW = {
  tenantId: TENANT_ID,
  membershipId: MEMBERSHIP_ID,
  status: "active",
  role: "owner",
  workspaceId: null,
} as const;
const ACTOR_HISTORY = {
  ...ACTOR_VIEW,
  roleBindings: [{ id: ROLE_BINDING_ID, role: "owner", revokedAt: null, reasonCode: "initial_provisioning" }],
} as const;
const ACTOR_MEMBERSHIP = {
  id: MEMBERSHIP_ID,
  tenantId: TENANT_ID,
  authIdentityId: USER_ID,
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
const PRIOR_ACTOR_ROLE = {
  ...ACTOR_ROLE,
  id: "40000000-0000-4000-8000-000000000002",
  role: "admin",
  createdAt: "2026-08-20T00:00:00.000Z",
  validFrom: "2026-08-20T00:00:00.000Z",
  revokedAt: "2026-08-29T00:00:00.000Z",
  reasonCode: "role_change",
} as const;
const ACTOR_DIRECTORY = {
  id: MEMBERSHIP_ID,
  tenantId: TENANT_ID,
  workspaceId: null,
  status: "active",
  actorIdentityMatches: true,
} as const;
const TERMINAL_VIEW = {
  tenantId: TENANT_ID,
  membershipId: TERMINAL_MEMBERSHIP_ID,
  status: "revoked",
  role: null,
  workspaceId: null,
} as const;
const TERMINAL_HISTORY = {
  ...TERMINAL_VIEW,
  roleBindings: [{
    id: TERMINAL_ROLE_BINDING_ID,
    role: "researcher",
    revokedAt: "2026-08-29T00:00:00.000Z",
    reasonCode: "invitation",
  }],
} as const;
const TERMINAL_DIRECTORY = {
  id: TERMINAL_MEMBERSHIP_ID,
  tenantId: TENANT_ID,
  workspaceId: null,
  status: "revoked",
  actorIdentityMatches: false,
} as const;
const TERMINAL_ROLE = {
  id: TERMINAL_ROLE_BINDING_ID,
  tenantId: TENANT_ID,
  membershipId: TERMINAL_MEMBERSHIP_ID,
  role: "researcher",
  createdAt: "2026-08-20T00:00:00.000Z",
  validFrom: "2026-08-20T00:00:00.000Z",
  revokedAt: "2026-08-29T00:00:00.000Z",
  assignedByMembershipId: MEMBERSHIP_ID,
  reasonCode: "invitation",
} as const;

describe("UsersPage canonical membership boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(true);
    localMocks.createLocalTenantMembershipAdministrationService.mockReturnValue({
      listCurrent: localMocks.listCurrent,
      listHistory: localMocks.listHistory,
    });
    localMocks.listCurrent.mockResolvedValue([ACTOR_VIEW]);
    localMocks.listHistory.mockResolvedValue([ACTOR_HISTORY]);
    repositoryMocks.listMemberships.mockResolvedValue([ACTOR_MEMBERSHIP]);
    repositoryMocks.getCurrentRoleBinding.mockResolvedValue(ACTOR_ROLE);
    repositoryMocks.listMembershipDirectory.mockResolvedValue([ACTOR_DIRECTORY]);
    repositoryMocks.listRoleBindings.mockResolvedValue([PRIOR_ACTOR_ROLE, ACTOR_ROLE]);
  });

  it("lists canonical current and history through the SQLite-only service and enables only local controls", async () => {
    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("Tenant access and responsibility");
    expect(html).toContain(MEMBERSHIP_ID);
    expect(html).toContain('data-local-membership-mutations="enabled"');
    expect(html).toContain("Invite member");
    expect(localMocks.createLocalTenantMembershipAdministrationService).toHaveBeenCalledWith({ kind: "scoped-db" });
    expect(localMocks.listCurrent).toHaveBeenCalledWith(TENANT_SESSION);
    expect(localMocks.listHistory).toHaveBeenCalledWith(TENANT_SESSION);
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(TENANT_SESSION, "membership:read", { action: "users.page" });
  });

  it("keeps PostgreSQL mode canonical and read-only without rendering mutation controls", async () => {
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(false);
    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain('data-local-membership-mutations="read-only"');
    expect(html).toContain("read-only in this deployment");
    expect(html).not.toMatch(/>Invite member<\/button>/u);
    expect(html).toContain("2 recorded role bindings");
    expect(html).toContain("Administrator · role change");
    expect(repositoryMocks.listMembershipDirectory).toHaveBeenCalledWith(TENANT_ID, MEMBERSHIP_ID, USER_ID);
    expect(repositoryMocks.listRoleBindings).toHaveBeenCalledWith(TENANT_ID);
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
    expect(repositoryMocks.getCurrentRoleBinding).not.toHaveBeenCalled();
    expect(localMocks.createLocalTenantMembershipAdministrationService).not.toHaveBeenCalled();
  });

  it("fails PostgreSQL history closed when a role becomes valid before it was created", async () => {
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(false);
    repositoryMocks.listRoleBindings.mockResolvedValue([{
      ...ACTOR_ROLE,
      createdAt: "2026-08-30T00:00:00.000Z",
      validFrom: "2026-08-29T00:00:00.000Z",
    }]);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("No platform-global user or market-access fallback was attempted");
    expect(html).not.toContain("Tenant access and responsibility");
  });

  it("fails PostgreSQL membership projection closed when the actor identity linkage does not match", async () => {
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(false);
    repositoryMocks.listMembershipDirectory.mockResolvedValue([{ ...ACTOR_DIRECTORY, actorIdentityMatches: false }]);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("No platform-global user or market-access fallback was attempted");
    expect(html).not.toContain("Tenant access and responsibility");
  });

  it("keeps terminal PostgreSQL memberships in complete history but out of current membership cards", async () => {
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(false);
    repositoryMocks.listMembershipDirectory.mockResolvedValue([ACTOR_DIRECTORY, TERMINAL_DIRECTORY]);
    repositoryMocks.listRoleBindings.mockResolvedValue([PRIOR_ACTOR_ROLE, ACTOR_ROLE, TERMINAL_ROLE]);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("Tenant access and responsibility");
    expect(html.match(new RegExp(TERMINAL_MEMBERSHIP_ID, "gu"))).toHaveLength(1);
    expect(html).toContain('data-membership-status="active"');
    expect(html).not.toContain('data-membership-status="revoked"');
  });

  it("keeps terminal SQLite memberships in complete history but out of current membership cards", async () => {
    localMocks.listHistory.mockResolvedValue([ACTOR_HISTORY, TERMINAL_HISTORY]);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("Tenant access and responsibility");
    expect(html.match(new RegExp(TERMINAL_MEMBERSHIP_ID, "gu"))).toHaveLength(1);
    expect(html).not.toContain('data-membership-status="revoked"');
  });

  it.each([
    ["current member missing from history", [ACTOR_VIEW, { ...TERMINAL_VIEW, status: "active", role: "researcher" }], [ACTOR_HISTORY]],
    ["non-terminal history phantom", [ACTOR_VIEW], [ACTOR_HISTORY, { ...TERMINAL_HISTORY, status: "active", role: "researcher" }]],
    ["current/history fact mismatch", [ACTOR_VIEW], [{ ...ACTOR_HISTORY, status: "suspended" }]],
    ["terminal member appears current", [ACTOR_VIEW, TERMINAL_VIEW], [ACTOR_HISTORY, TERMINAL_HISTORY]],
    ["duplicate current member", [ACTOR_VIEW, ACTOR_VIEW], [ACTOR_HISTORY]],
    ["duplicate history member", [ACTOR_VIEW], [ACTOR_HISTORY, ACTOR_HISTORY]],
  ])("fails malformed SQLite current/history projections closed: %s", async (_label, current, history) => {
    localMocks.listCurrent.mockResolvedValue(current);
    localMocks.listHistory.mockResolvedValue(history);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("No platform-global user or market-access fallback was attempted");
    expect(html).not.toContain("Tenant access and responsibility");
  });

  it.each([
    ["foreign role history", [ACTOR_DIRECTORY], [{ ...ACTOR_ROLE, tenantId: "10000000-0000-4000-8000-000000000002" }]],
    ["orphan role history", [ACTOR_DIRECTORY], [{ ...ACTOR_ROLE, membershipId: "30000000-0000-4000-8000-000000000099" }]],
    ["multiple current roles", [ACTOR_DIRECTORY], [ACTOR_ROLE, { ...ACTOR_ROLE, id: "40000000-0000-4000-8000-000000000099", role: "admin" }]],
    ["actor role mismatch", [ACTOR_DIRECTORY], [{ ...ACTOR_ROLE, role: "admin" }]],
    ["duplicate membership projection", [ACTOR_DIRECTORY, ACTOR_DIRECTORY], [ACTOR_ROLE]],
    ["terminal membership with current role", [ACTOR_DIRECTORY, TERMINAL_DIRECTORY], [ACTOR_ROLE, { ...TERMINAL_ROLE, revokedAt: null }]],
  ])("fails malformed PostgreSQL current/history projections closed: %s", async (_label, memberships, bindings) => {
    localMocks.isLocalMembershipAdministrationAvailable.mockReturnValue(false);
    repositoryMocks.listMembershipDirectory.mockResolvedValue(memberships);
    repositoryMocks.listRoleBindings.mockResolvedValue(bindings);

    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("No platform-global user or market-access fallback was attempted");
    expect(html).not.toContain("Tenant access and responsibility");
  });

  it.each([
    ["missing scope", null],
    ["workspace scope", { ...TENANT_SESSION, workspaceId: "50000000-0000-4000-8000-000000000001" }],
  ])("fails closed before canonical or legacy reads for %s", async (_label, session) => {
    authMocks.getTenantSession.mockResolvedValue(session);
    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("Tenant members unavailable");
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(localMocks.listCurrent).not.toHaveBeenCalled();
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
  });

  it("rejects foreign canonical rows without falling back to a global directory", async () => {
    localMocks.listCurrent.mockResolvedValue([{ ...ACTOR_VIEW, tenantId: "10000000-0000-4000-8000-000000000002" }]);
    const html = renderToStaticMarkup(await UsersPage() as React.ReactElement);

    expect(html).toContain("No platform-global user or market-access fallback was attempted");
    expect(html).not.toContain("Tenant access and responsibility");
    expect(repositoryMocks.listMemberships).not.toHaveBeenCalled();
  });
});
