"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createAppUserForAuthUser,
  listAppUsers,
  updateAppUserRole,
  updateAppUserStatus,
  type AppUserStatus,
} from "@/lib/app-users";
import { requirePermission } from "@/lib/auth";
import { createAuditLog, ensureDbReady } from "@/lib/db/queries";
import { isAppRole, type AppRole } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createUserSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "researcher"]).default("researcher"),
});

export async function listUsersAction() {
  await requirePermission("users:manage");
  await ensureDbReady();
  return listAppUsers();
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
  revalidatePath("/users");
  return { success: true, user: appUser, temporaryPassword };
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

export async function resetUserPasswordAction(userId: string) {
  await requirePermission("users:manage");
  await ensureDbReady();
  const temporaryPassword = generateTemporaryPassword();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });

  if (error) {
    return { error: error.message };
  }

  await createAuditLog("app_user_password_reset", "app_user", userId);
  return { success: true, temporaryPassword };
}

function generateTemporaryPassword(): string {
  return `NoSite-${randomBytes(12).toString("base64url")}-1a!`;
}
