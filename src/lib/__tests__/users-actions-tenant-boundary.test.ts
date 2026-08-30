import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const ACTOR_ID = "20000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";
const TARGET_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000002";

const authorizationMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireTenantPermission: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
  withTenantDbContext: vi.fn((callback: (db: object) => unknown) => callback({ kind: "scoped-db" })),
}));

const appUserMocks = vi.hoisted(() => ({
  getAppUserByUserId: vi.fn(),
  listAppUsers: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  ensureDbReady: vi.fn(),
  listLocationMarkets: vi.fn(),
  listUserMarketAccessForUsers: vi.fn(),
  replaceUserMarketAccess: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  createTenantQueryRepository: vi.fn(),
  listMemberships: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authorizationMocks.requirePermission }));
vi.mock("@/lib/db", () => ({ withTenantDbContext: contextMocks.withTenantDbContext }));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/context", () => ({ runWithTenantContext: contextMocks.runWithTenantContext }));
vi.mock("@/lib/tenancy/queries", () => ({
  createTenantQueryRepository: repositoryMocks.createTenantQueryRepository,
}));
vi.mock("@/lib/tenancy/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenancy/authorize")>();
  return { ...actual, requireTenantPermission: authorizationMocks.requireTenantPermission };
});
vi.mock("@/lib/app-users", () => ({
  createAppUserForAuthUser: vi.fn(),
  getAppUserByUserId: appUserMocks.getAppUserByUserId,
  listAppUsers: appUserMocks.listAppUsers,
  updateAppUserRole: vi.fn(),
  updateAppUserStatus: vi.fn(),
  updateAppUserTeam: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: supabaseMocks.createSupabaseAdminClient,
}));

import { removeUserAction } from "@/lib/users/actions";

const TENANT_SESSION = Object.freeze({
  userId: ACTOR_ID,
  email: "owner@example.test",
  displayName: "Owner",
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  membershipId: "30000000-0000-4000-8000-000000000001",
  role: "owner" as const,
  roleBindingId: "40000000-0000-4000-8000-000000000001",
});

function membership(tenantId = TENANT_A) {
  return {
    id: TARGET_MEMBERSHIP_ID,
    tenantId,
    authIdentityId: TARGET_ID,
    pendingIdentityRefHash: null,
    workspaceId: WORKSPACE_A,
    status: "active" as const,
    invitedByMembershipId: TENANT_SESSION.membershipId,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizationMocks.requirePermission.mockResolvedValue({
    userId: ACTOR_ID,
    email: TENANT_SESSION.email,
    displayName: TENANT_SESSION.displayName,
    role: "admin",
  });
  authorizationMocks.requireTenantPermission.mockResolvedValue(TENANT_SESSION);
  repositoryMocks.createTenantQueryRepository.mockReturnValue({
    listMemberships: repositoryMocks.listMemberships,
  });
  repositoryMocks.listMemberships.mockReset();
  repositoryMocks.listMemberships.mockResolvedValue([membership()]);
});

describe("remove user tenant boundary", () => {
  it("binds canonical membership management to the exact tenant and fails closed before global deletion", async () => {
    const selector = { tenantId: TENANT_A, workspaceId: WORKSPACE_A };

    const result = await removeUserAction(TARGET_ID, selector);

    expect(authorizationMocks.requirePermission).toHaveBeenCalledWith("users:manage");
    expect(authorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      selector,
      "membership:manage",
      expect.objectContaining({ action: "users.remove", policyEvaluator: expect.any(Function) }),
    );
    const authorizationOptions = authorizationMocks.requireTenantPermission.mock.calls[0][2];
    const policyContext = {
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: TENANT_SESSION.membershipId,
      role: TENANT_SESSION.role,
      permission: "membership:manage",
      action: "users.remove",
      resource: null,
    };
    expect(authorizationOptions.policyEvaluator(policyContext)).toEqual({ allowed: true, context: policyContext });
    expect(contextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^user-remove:[0-9a-f-]+$/),
      expect.any(Function),
    );
    expect(contextMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(repositoryMocks.createTenantQueryRepository).toHaveBeenCalledWith({ kind: "scoped-db" });
    expect(repositoryMocks.listMemberships).toHaveBeenCalledWith(TENANT_A);
    expect(supabaseMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(appUserMocks.getAppUserByUserId).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "User not found or unavailable.",
    });
  });

  it("fails before tenant database access when legacy and tenant identities diverge", async () => {
    authorizationMocks.requireTenantPermission.mockResolvedValueOnce({
      ...TENANT_SESSION,
      userId: "20000000-0000-4000-8000-000000000099",
    });

    await expect(removeUserAction(TARGET_ID, { tenantId: TENANT_A })).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });

    expect(contextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(contextMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(supabaseMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign membership", [membership(TENANT_B)]],
    ["missing membership", []],
    ["duplicate identity binding", [membership(), membership()]],
    ["foreign workspace", [{ ...membership(), workspaceId: WORKSPACE_B }]],
  ])("uses one non-enumerating result for a %s target", async (_label, memberships) => {
    repositoryMocks.listMemberships.mockResolvedValueOnce(memberships);

    await expect(removeUserAction(TARGET_ID, { tenantId: TENANT_A })).resolves.toEqual({
      error: "User not found or unavailable.",
    });

    expect(supabaseMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(appUserMocks.getAppUserByUserId).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });
});
