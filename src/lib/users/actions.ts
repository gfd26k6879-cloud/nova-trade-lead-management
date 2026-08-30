"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildPasswordRecoveryUrl, buildWelcomeInviteUrl, resolveCanonicalAppUrl } from "@/lib/app-url";
import {
  createAppUserForAuthUser,
  getAppUserByUserId,
  listAppUsers,
  updateAppUserRole,
  updateAppUserStatus,
  updateAppUserTeam,
  type AppUserStatus,
  type TenantSessionSelector,
} from "@/lib/app-users";
import { requirePermission } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import {
  createAuditLog,
  ensureDbReady,
  listLocationMarkets,
  listUserMarketAccessForUsers,
  replaceUserMarketAccess,
} from "@/lib/db/queries";
import { isAppRole, type AppRole } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assertTenantResourceOwnership,
  requireTenantPermission,
  TenantAuthorizationError,
} from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";

const createUserSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "researcher"]).default("researcher"),
});

const updateUserTeamSchema = z.object({
  isTeamLead: z.boolean().default(false),
  teamLeadUserId: z.string().trim().min(1).max(120).nullable().optional(),
  teamLabel: z.string().trim().max(120).nullable().optional(),
});

const updateUserMarketsSchema = z.object({
  marketIds: z.array(z.string().trim().min(1)).max(100),
});

export async function listUsersAction() {
  await requirePermission("users:manage");
  await ensureDbReady();
  return listAppUsers();
}

export async function listTerritoryMarketsAction() {
  await requirePermission("users:manage");
  await ensureDbReady();
  return listLocationMarkets();
}

export async function listUserMarketAccessAction(userIds: string[]) {
  await requirePermission("users:manage");
  await ensureDbReady();
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  return listUserMarketAccessForUsers(uniqueUserIds);
}

export async function createUserAction(input: { email: string; displayName?: string; role?: AppRole }) {
  const session = await requirePermission("users:manage");
  await ensureDbReady();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid user input." };
  }

  const headerStore = await headers();
  const appUrl = resolveCanonicalAppUrl(headerStore.get("origin"));
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: buildWelcomeInviteUrl("/reset-password", appUrl),
    data: {
      display_name: parsed.data.displayName ?? "",
    },
  });

  if (error || !data.user?.id) {
    return { error: error?.message ?? "Unable to create Supabase Auth invite." };
  }

  const authEmail = data.user.email ?? parsed.data.email;
  const appUser = await createAppUserForAuthUser({
    userId: data.user.id,
    email: authEmail,
    displayName: parsed.data.displayName ?? null,
    role: parsed.data.role,
    status: "active",
    createdBy: session.userId,
  });

  await createAuditLog("app_user_created", "app_user", appUser.user_id, {
    email: parsed.data.email,
    role: parsed.data.role,
  });

  await createAuditLog("app_user_welcome_email_sent", "app_user", appUser.user_id, {
    email: authEmail,
    redirectTo: buildWelcomeInviteUrl("/reset-password", appUrl),
  });

  revalidatePath("/users");
  return { success: true, user: appUser, welcomeEmailSent: true };
}

export async function updateUserRoleAction(userId: string, role: AppRole) {
  const session = await requirePermission("users:manage");
  await ensureDbReady();
  if (!isAppRole(role)) return { error: "Invalid role." };
  const target = await getAppUserByUserId(userId);
  if (!target) return { error: "User not found." };
  if (target.user_id === session.userId && target.role === "admin" && role !== "admin") {
    return { error: "You cannot demote your own admin account." };
  }
  if (target.role === "admin" && target.status === "active" && role !== "admin") {
    const users = await listAppUsers();
    if (countOtherActiveAdmins(users, target.user_id) === 0) {
      return { error: "Cannot demote the last active admin." };
    }
  }
  await updateAppUserRole(userId, role);
  await createAuditLog("app_user_role_updated", "app_user", userId, { role });
  revalidatePath("/users");
  return { success: true };
}

export async function updateUserStatusAction(userId: string, status: AppUserStatus) {
  const session = await requirePermission("users:manage");
  await ensureDbReady();
  if (status !== "active" && status !== "disabled") return { error: "Invalid status." };
  const target = await getAppUserByUserId(userId);
  if (!target) return { error: "User not found." };
  if (target.user_id === session.userId && status === "disabled") {
    return { error: "You cannot disable your own account." };
  }
  if (target.role === "admin" && target.status === "active" && status === "disabled") {
    const users = await listAppUsers();
    if (countOtherActiveAdmins(users, target.user_id) === 0) {
      return { error: "Cannot disable the last active admin." };
    }
  }
  await updateAppUserStatus(userId, status);
  await createAuditLog("app_user_status_updated", "app_user", userId, { status });
  revalidatePath("/users");
  return { success: true };
}

export async function removeUserAction(
  userId: string,
  selector: TenantSessionSelector = {},
) {
  const actor = await requirePermission("users:manage");
  const tenantSession = await requireTenantPermission(selector, "membership:manage", {
    action: "users.remove",
    // Compatibility remains conditional on the independently resolved legacy
    // administration boundary. The identities are correlated immediately
    // below before any target lookup or side effect.
    policyEvaluator: (context) => ({ allowed: actor.userId.length > 0, context }),
  });
  if (actor.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }

  return runWithTenantContext(tenantSession, `user-remove:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      await ensureDbReady();
      const memberships = await createTenantQueryRepository(db).listMemberships(tenantSession.tenantId);
      const targetMemberships = memberships.filter((membership) => (
        membership.tenantId === tenantSession.tenantId && membership.authIdentityId === userId
      ));
      if (targetMemberships.length !== 1) return unavailableUserResult();

      const targetMembership = targetMemberships[0];
      try {
        assertTenantResourceOwnership(tenantSession, {
          tenantId: targetMembership.tenantId,
          workspaceId: targetMembership.workspaceId,
          resourceId: targetMembership.id,
          resourceType: "tenant_membership",
        }, "workspace-optional");
      } catch {
        return unavailableUserResult();
      }

      // app_users and Supabase identities are platform-global. Until this
      // action is wired to the canonical tenant-membership removal adapter,
      // deleting either record could revoke access in another tenant.
      return unavailableUserResult();
    }));
}

export async function updateUserTeamAction(userId: string, input: { isTeamLead?: boolean; teamLeadUserId?: string | null; teamLabel?: string | null }) {
  await requirePermission("users:manage");
  await ensureDbReady();
  const parsed = updateUserTeamSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid team settings." };
  const user = await updateAppUserTeam({
    userId,
    isTeamLead: parsed.data.isTeamLead,
    teamLeadUserId: parsed.data.teamLeadUserId ?? null,
    teamLabel: parsed.data.teamLabel ?? null,
  });
  if (!user) return { error: "User not found." };
  await createAuditLog("app_user_team_updated", "app_user", userId, parsed.data);
  revalidatePath("/users");
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { success: true, user };
}

export async function updateUserMarketAccessAction(userId: string, input: { marketIds: string[] }) {
  const session = await requirePermission("users:manage");
  await ensureDbReady();
  const parsed = updateUserMarketsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid territory selection." };
  let access: Awaited<ReturnType<typeof replaceUserMarketAccess>>;
  try {
    access = await replaceUserMarketAccess(userId, parsed.data.marketIds, session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update territory access." };
  }
  await createAuditLog("app_user_market_access_updated", "app_user", userId, {
    marketIds: parsed.data.marketIds,
  });
  revalidatePath("/users");
  revalidatePath("/leads");
  revalidatePath("/explore");
  revalidatePath("/queue");
  return { success: true, access };
}

export async function resetUserPasswordAction(userId: string) {
  await requirePermission("users:manage");
  await ensureDbReady();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data.user?.email) {
    return { error: error?.message ?? "Unable to load Supabase Auth user email." };
  }

  const resetResult = await sendPasswordResetEmail(data.user.email);
  if (resetResult.error) {
    return { error: resetResult.error };
  }

  await createAuditLog("app_user_password_reset_email_sent", "app_user", userId);
  return { success: true, resetEmailSent: true };
}

async function sendPasswordResetEmail(email: string): Promise<{ error: string | null }> {
  const headerStore = await headers();
  const appUrl = resolveCanonicalAppUrl(headerStore.get("origin"));

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildPasswordRecoveryUrl("/reset-password", appUrl),
  });
  return { error: error?.message ?? null };
}

function countOtherActiveAdmins(users: Awaited<ReturnType<typeof listAppUsers>>, userId: string): number {
  return users.filter((user) => (
    user.user_id !== userId && user.role === "admin" && user.status === "active"
  )).length;
}

function unavailableUserResult(): { error: string } {
  return { error: "User not found or unavailable." };
}
