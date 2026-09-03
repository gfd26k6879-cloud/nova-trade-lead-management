"use server";

import { randomUUID } from "node:crypto";

import {
  type AppUser,
  type AppUserStatus,
  type TenantSessionSelector,
} from "@/lib/app-users";
import { requirePermission } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import {
  ensureDbReady,
  listLocationMarkets,
  type UserMarketAccess,
} from "@/lib/db/queries";
import { type AppRole } from "@/lib/permissions";
import {
  assertTenantResourceOwnership,
  requireTenantPermission,
  TenantAuthorizationError,
} from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";

export async function listUsersAction() {
  await requirePermission("users:manage");
  // app_users is platform-global and cannot be projected safely into a tenant
  // directory. The canonical membership page owns the supported read path.
  return unavailableUserResult();
}

export async function listTerritoryMarketsAction() {
  await requirePermission("users:manage");
  await ensureDbReady();
  return listLocationMarkets();
}

export async function listUserMarketAccessAction(userIds: string[]) {
  await requirePermission("users:manage");
  void userIds;
  // user_market_access has no tenant ownership key, so caller-provided user
  // IDs must not authorize a platform-global lookup.
  return unavailableUserResult();
}

export async function createUserAction(
  input: { email: string; displayName?: string; role?: AppRole },
): Promise<{ error: string } | { success: true; user: AppUser; welcomeEmailSent: true }> {
  await requirePermission("users:manage");
  void input;
  // A provider invite creates a platform identity before tenant membership is
  // established. Keep this closed until one canonical adapter owns both steps.
  return unavailableUserResult();
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

export async function resetUserPasswordAction(userId: string): Promise<{
  error: string;
} | {
  success: true;
  resetEmailSent: true;
}> {
  await requirePermission("users:manage");
  void userId;
  // Password recovery is platform identity administration. A tenant-facing
  // action must not look up or email an arbitrary platform user.
  return unavailableUserResult();
}

function unavailableUserResult(): { error: string } {
  return { error: "User not found or unavailable." };
}
