"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildPasswordRecoveryUrl, buildWelcomeInviteUrl, resolveCanonicalAppUrl } from "@/lib/app-url";
import {
  createAppUserForAuthUser,
  listAppUsers,
  type AppUser,
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
  type UserMarketAccess,
} from "@/lib/db/queries";
import { type AppRole } from "@/lib/permissions";
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

export async function updateUserRoleAction(userId: string, role: AppRole): Promise<{
  error: string;
} | {
  success: true;
}> {
  await requirePermission("users:manage");
  void userId;
  void role;
  // Roles on app_users are platform-global. A tenant membership permission
  // must never authorize this write, and no canonical membership-role mutation
  // adapter exists yet, so this tenant-facing path remains fail closed.
  return unavailableUserResult();
}

export async function updateUserStatusAction(userId: string, status: AppUserStatus): Promise<{
  error: string;
} | {
  success: true;
}> {
  await requirePermission("users:manage");
  void userId;
  void status;
  // Disabling app_users revokes platform access across every tenant. Until a
  // tenant-membership status adapter owns this operation, do not touch it.
  return unavailableUserResult();
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

export async function updateUserTeamAction(
  userId: string,
  input: { isTeamLead?: boolean; teamLeadUserId?: string | null; teamLabel?: string | null },
): Promise<{
  error: string;
} | {
  success: true;
  user: AppUser;
}> {
  await requirePermission("users:manage");
  void userId;
  void input;
  // Team fields live on the platform-global app_users row. Fail closed until
  // the canonical tenant/workspace membership model exposes this mutation.
  return unavailableUserResult();
}

export async function updateUserMarketAccessAction(
  userId: string,
  input: { marketIds: string[] },
): Promise<{
  error: string;
} | {
  success: true;
  access: UserMarketAccess[];
}> {
  await requirePermission("users:manage");
  void userId;
  void input;
  // user_market_access is keyed to the platform-global app_users identity and
  // has no canonical tenant ownership boundary. Keep this tenant-facing path
  // closed until a tenant-scoped market-membership adapter owns the mutation.
  return unavailableUserResult();
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

function unavailableUserResult(): { error: string } {
  return { error: "User not found or unavailable." };
}
