"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildPasswordRecoveryUrl, resolveCanonicalAppUrl } from "@/lib/app-url";
import {
  createAppUserForAuthUser,
  listAppUsers,
  updateAppUserRole,
  updateAppUserStatus,
  updateAppUserTeam,
  type AppUserStatus,
} from "@/lib/app-users";
import { requirePermission } from "@/lib/auth";
import {
  createAuditLog,
  ensureDbReady,
  listLocationMarkets,
  listUserMarketAccessForUsers,
  replaceUserMarketAccess,
} from "@/lib/db/queries";
import { isAppRole, type AppRole } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  const temporaryPassword = generateTemporaryPassword();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: parsed.data.displayName ?? "",
    },
  });

  if (error || !data.user?.id || !data.user.email) {
    return { error: error?.message ?? "Unable to create Supabase Auth user." };
  }

  const appUser = await createAppUserForAuthUser({
    userId: data.user.id,
    email: data.user.email,
    displayName: parsed.data.displayName ?? null,
    role: parsed.data.role,
    status: "active",
    createdBy: session.userId,
  });

  await createAuditLog("app_user_created", "app_user", appUser.user_id, {
    email: appUser.email,
    role: appUser.role,
  });

  const resetResult = await sendPasswordSetupEmail(data.user.email);
  if (resetResult.error) {
    await createAuditLog("app_user_password_setup_email_failed", "app_user", appUser.user_id, {
      email: appUser.email,
      error: resetResult.error,
    });
    return { error: `User was created, but the setup email failed: ${resetResult.error}` };
  }

  revalidatePath("/users");
  return { success: true, user: appUser, setupEmailSent: true };
}

export async function updateUserRoleAction(userId: string, role: AppRole) {
  await requirePermission("users:manage");
  await ensureDbReady();
  if (!isAppRole(role)) return { error: "Invalid role." };
  await updateAppUserRole(userId, role);
  await createAuditLog("app_user_role_updated", "app_user", userId, { role });
  revalidatePath("/users");
  return { success: true };
}

export async function updateUserStatusAction(userId: string, status: AppUserStatus) {
  await requirePermission("users:manage");
  await ensureDbReady();
  if (status !== "active" && status !== "disabled") return { error: "Invalid status." };
  await updateAppUserStatus(userId, status);
  await createAuditLog("app_user_status_updated", "app_user", userId, { status });
  revalidatePath("/users");
  return { success: true };
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
  const access = await replaceUserMarketAccess(userId, parsed.data.marketIds, session.userId);
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

  const resetResult = await sendPasswordSetupEmail(data.user.email);
  if (resetResult.error) {
    return { error: resetResult.error };
  }

  await createAuditLog("app_user_password_reset_email_sent", "app_user", userId);
  return { success: true, resetEmailSent: true };
}

function generateTemporaryPassword(): string {
  return `NoSite-${randomBytes(12).toString("base64url")}-1a!`;
}

async function sendPasswordSetupEmail(email: string): Promise<{ error: string | null }> {
  const headerStore = await headers();
  const appUrl = resolveCanonicalAppUrl(headerStore.get("origin"));
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL is required to send password setup links in production." };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildPasswordRecoveryUrl("/reset-password", appUrl),
  });
  return { error: error?.message ?? null };
}
