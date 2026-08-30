import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const appUserMocks = vi.hoisted(() => ({
  getAppUserByUserId: vi.fn(),
  listAppUsers: vi.fn(),
  updateAppUserRole: vi.fn(),
  updateAppUserStatus: vi.fn(),
  updateAppUserTeam: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  createAuditLog: vi.fn(),
  listLocationMarkets: vi.fn(),
  listUserMarketAccessForUsers: vi.fn(),
  replaceUserMarketAccess: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const supabaseMocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/app-users", () => ({
  createAppUserForAuthUser: vi.fn(),
  getAppUserByUserId: appUserMocks.getAppUserByUserId,
  listAppUsers: appUserMocks.listAppUsers,
  updateAppUserRole: appUserMocks.updateAppUserRole,
  updateAppUserStatus: appUserMocks.updateAppUserStatus,
  updateAppUserTeam: appUserMocks.updateAppUserTeam,
}));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/supabase/admin", () => supabaseMocks);

import {
  updateUserMarketAccessAction,
  updateUserRoleAction,
  updateUserStatusAction,
  updateUserTeamAction,
} from "@/lib/users/actions";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue({
    userId: "platform-admin-1",
    email: "admin@example.com",
    role: "admin",
  });
});

function expectNoGlobalUserSideEffects(): void {
  expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  expect(appUserMocks.getAppUserByUserId).not.toHaveBeenCalled();
  expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
  expect(appUserMocks.updateAppUserRole).not.toHaveBeenCalled();
  expect(appUserMocks.updateAppUserStatus).not.toHaveBeenCalled();
  expect(appUserMocks.updateAppUserTeam).not.toHaveBeenCalled();
  expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  expect(supabaseMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
}

describe("platform-global user mutation guards", () => {
  it.each([
    ["existing target", "researcher-1"],
    ["unknown target", "missing-user"],
  ])("fails role changes closed with a non-enumerating result for an %s", async (_label, userId) => {
    await expect(updateUserRoleAction(userId, "admin")).resolves.toEqual({
      error: "User not found or unavailable.",
    });

    expect(authMocks.requirePermission).toHaveBeenCalledWith("users:manage");
    expectNoGlobalUserSideEffects();
  });

  it("fails status changes closed before database or provider side effects", async () => {
    await expect(updateUserStatusAction("researcher-1", "disabled")).resolves.toEqual({
      error: "User not found or unavailable.",
    });

    expect(authMocks.requirePermission).toHaveBeenCalledWith("users:manage");
    expectNoGlobalUserSideEffects();
  });

  it("fails team changes closed before database or provider side effects", async () => {
    await expect(updateUserTeamAction("researcher-1", {
      isTeamLead: true,
      teamLeadUserId: "researcher-2",
      teamLabel: "West",
    })).resolves.toEqual({
      error: "User not found or unavailable.",
    });

    expect(authMocks.requirePermission).toHaveBeenCalledWith("users:manage");
    expectNoGlobalUserSideEffects();
  });

  it("does not reveal validation differences before a tenant-safe adapter exists", async () => {
    await expect(updateUserRoleAction("missing-user", "not-a-role" as never)).resolves.toEqual({
      error: "User not found or unavailable.",
    });
    await expect(updateUserStatusAction("missing-user", "not-a-status" as never)).resolves.toEqual({
      error: "User not found or unavailable.",
    });
    await expect(updateUserTeamAction("missing-user", { teamLabel: "x".repeat(121) })).resolves.toEqual({
      error: "User not found or unavailable.",
    });

    expectNoGlobalUserSideEffects();
  });

  it("returns a territory update error when market replacement validation fails", async () => {
    queryMocks.replaceUserMarketAccess.mockRejectedValueOnce(new Error("Unknown market id: missing-market"));

    const result = await updateUserMarketAccessAction("researcher-1", { marketIds: ["missing-market"] });

    expect(result).toEqual({ error: "Unknown market id: missing-market" });
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });
});
