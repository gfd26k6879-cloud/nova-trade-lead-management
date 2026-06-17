import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/app-users";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const appUserMocks = vi.hoisted(() => ({
  getAppUserByUserId: vi.fn(),
  listAppUsers: vi.fn(),
  updateAppUserRole: vi.fn(),
  updateAppUserStatus: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  createAuditLog: vi.fn(),
  listLocationMarkets: vi.fn(),
  listUserMarketAccessForUsers: vi.fn(),
  replaceUserMarketAccess: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/app-users", () => ({
  createAppUserForAuthUser: vi.fn(),
  getAppUserByUserId: appUserMocks.getAppUserByUserId,
  listAppUsers: appUserMocks.listAppUsers,
  removeAppUser: vi.fn(),
  updateAppUserRole: appUserMocks.updateAppUserRole,
  updateAppUserStatus: appUserMocks.updateAppUserStatus,
  updateAppUserTeam: vi.fn(),
}));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { updateUserMarketAccessAction, updateUserRoleAction, updateUserStatusAction } from "@/lib/users/actions";

function user(input: Partial<AppUser> & Pick<AppUser, "user_id" | "email" | "role">): AppUser {
  return {
    id: input.id ?? input.user_id,
    user_id: input.user_id,
    email: input.email,
    display_name: input.display_name ?? null,
    role: input.role,
    status: input.status ?? "active",
    created_by: input.created_by ?? null,
    is_team_lead: input.is_team_lead ?? false,
    team_lead_user_id: input.team_lead_user_id ?? null,
    team_lead_email: input.team_lead_email ?? null,
    team_lead_display_name: input.team_lead_display_name ?? null,
    team_label: input.team_label ?? null,
    last_seen_at: input.last_seen_at ?? null,
    created_at: input.created_at ?? "2026-06-16T00:00:00.000Z",
    updated_at: input.updated_at ?? "2026-06-16T00:00:00.000Z",
  };
}

const admin = user({ user_id: "admin-1", email: "admin@example.com", role: "admin" });
const otherAdmin = user({ user_id: "admin-2", email: "other-admin@example.com", role: "admin" });
const researcher = user({ user_id: "researcher-1", email: "researcher@example.com", role: "researcher" });

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    role: "admin",
  });
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  appUserMocks.getAppUserByUserId.mockResolvedValue(admin);
  appUserMocks.listAppUsers.mockResolvedValue([admin]);
  appUserMocks.updateAppUserRole.mockResolvedValue(undefined);
  appUserMocks.updateAppUserStatus.mockResolvedValue(undefined);
});

describe("user admin guard actions", () => {
  it("prevents an admin from demoting their own account", async () => {
    const result = await updateUserRoleAction("admin-1", "researcher");

    expect(result).toEqual({ error: "You cannot demote your own admin account." });
    expect(appUserMocks.updateAppUserRole).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("prevents demoting the last active admin", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-2", email: "other@example.com", role: "admin" });

    const result = await updateUserRoleAction("admin-1", "researcher");

    expect(result).toEqual({ error: "Cannot demote the last active admin." });
    expect(appUserMocks.listAppUsers).toHaveBeenCalled();
    expect(appUserMocks.updateAppUserRole).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("allows admin demotion when another active admin remains", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-3", email: "third@example.com", role: "admin" });
    appUserMocks.listAppUsers.mockResolvedValue([admin, otherAdmin]);

    const result = await updateUserRoleAction("admin-1", "researcher");

    expect(result).toEqual({ success: true });
    expect(appUserMocks.updateAppUserRole).toHaveBeenCalledWith("admin-1", "researcher");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("app_user_role_updated", "app_user", "admin-1", {
      role: "researcher",
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/users");
  });

  it("allows role updates that do not remove active admin coverage", async () => {
    appUserMocks.getAppUserByUserId.mockResolvedValue(researcher);

    const result = await updateUserRoleAction("researcher-1", "admin");

    expect(result).toEqual({ success: true });
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
    expect(appUserMocks.updateAppUserRole).toHaveBeenCalledWith("researcher-1", "admin");
  });

  it("prevents an admin from disabling their own account", async () => {
    const result = await updateUserStatusAction("admin-1", "disabled");

    expect(result).toEqual({ error: "You cannot disable your own account." });
    expect(appUserMocks.updateAppUserStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("prevents disabling the last active admin", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-2", email: "other@example.com", role: "admin" });

    const result = await updateUserStatusAction("admin-1", "disabled");

    expect(result).toEqual({ error: "Cannot disable the last active admin." });
    expect(appUserMocks.listAppUsers).toHaveBeenCalled();
    expect(appUserMocks.updateAppUserStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("allows disabling an admin when another active admin remains", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-3", email: "third@example.com", role: "admin" });
    appUserMocks.listAppUsers.mockResolvedValue([admin, otherAdmin]);

    const result = await updateUserStatusAction("admin-1", "disabled");

    expect(result).toEqual({ success: true });
    expect(appUserMocks.updateAppUserStatus).toHaveBeenCalledWith("admin-1", "disabled");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("app_user_status_updated", "app_user", "admin-1", {
      status: "disabled",
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/users");
  });

  it("allows disabling non-admin users", async () => {
    appUserMocks.getAppUserByUserId.mockResolvedValue(researcher);

    const result = await updateUserStatusAction("researcher-1", "disabled");

    expect(result).toEqual({ success: true });
    expect(appUserMocks.listAppUsers).not.toHaveBeenCalled();
    expect(appUserMocks.updateAppUserStatus).toHaveBeenCalledWith("researcher-1", "disabled");
  });

  it("returns a territory update error when market replacement validation fails", async () => {
    queryMocks.replaceUserMarketAccess.mockRejectedValue(new Error("Unknown market id: missing-market"));

    const result = await updateUserMarketAccessAction("researcher-1", { marketIds: ["missing-market"] });

    expect(result).toEqual({ error: "Unknown market id: missing-market" });
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });
});
