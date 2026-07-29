import "server-only";

import {
  createTenantSessionResolver,
  ensureAppUserForAuthUser,
  TenantScopeResolutionError,
  type TenantSessionResolver,
  type TenantSessionScope,
  type TenantSessionSelector,
} from "@/lib/app-users";
import { setAuditActor } from "@/lib/audit-context";
import { hasPermission, type AppRole, type Permission } from "@/lib/permissions";
import type { LaunchRole } from "@/lib/tenancy/types";
import {
  clearStaleSupabaseAuthCookies,
  createSupabaseServerClient,
  isStaleSupabaseAuthError,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;

  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface AppSession {
  userId: string;
  email: string;
  displayName: string | null;
  role: AppRole;
}

export interface PendingAppSession {
  userId: string;
  email: string;
  displayName: string | null;
  role: AppRole | null;
  status: "pending" | "disabled";
}

export type SessionLookupResult = AppSession | PendingAppSession;

export interface TenantSession extends TenantSessionScope {
  userId: string;
  email: string;
  displayName: string | null;
}

export type TenantSessionLookupResult =
  | { kind: "unauthenticated"; code: "AUTH_REQUIRED" }
  | { kind: "unavailable"; code: "TENANT_SCOPE_UNAVAILABLE" }
  | { kind: "resolved"; session: TenantSession };

export class TenantSessionUnauthenticatedError extends UnauthorizedError {
  readonly code = "AUTH_REQUIRED" as const;
}

export class TenantSessionUnavailableError extends ForbiddenError {
  readonly code = "TENANT_SCOPE_UNAVAILABLE" as const;

  constructor() {
    super("No valid tenant scope is available for this request.");
  }
}

export interface TenantSessionResolutionOptions {
  resolver?: TenantSessionResolver;
}

export async function isAuthConfigured(): Promise<boolean> {
  return isSupabaseAuthConfigured();
}

export async function getSession(options: { allowInactive?: boolean } = {}): Promise<SessionLookupResult | null> {
  if (!isSupabaseAuthConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    if (isStaleSupabaseAuthError(error)) {
      await clearStaleSupabaseAuthCookies();
    }
    return null;
  }

  const { data, error } = result;
  const user = data.user;

  if (error) {
    if (isStaleSupabaseAuthError(error)) {
      await clearStaleSupabaseAuthCookies();
    }
    return null;
  }

  if (!user?.id || !user.email) return null;

  const profile = await ensureAppUserForAuthUser(user.id, user.email);
  if (profile.status !== "active" || !profile.role) {
    const inactiveStatus = profile.status === "disabled" ? "disabled" : "pending";
    return options.allowInactive
      ? {
          userId: profile.userId,
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
          status: inactiveStatus,
        }
      : null;
  }

  const session: AppSession = {
    userId: profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
  };
  setAuditActor({ userId: session.userId, email: session.email, role: session.role });
  return session;
}

/**
 * Looks up tenant context after the existing Supabase/profile lookup. This is
 * a separate boundary so legacy routes continue using AppSession during the
 * migration; app_users.role is deliberately absent from TenantSession.
 */
export async function lookupTenantSession(
  selector: TenantSessionSelector,
  options: TenantSessionResolutionOptions = {},
): Promise<TenantSessionLookupResult> {
  const session = await getSession({ allowInactive: true });
  if (!session) return { kind: "unauthenticated", code: "AUTH_REQUIRED" };
  return resolveTenantSessionForAppSession(session, selector, options);
}

export async function getTenantSession(
  selector: TenantSessionSelector,
  options: TenantSessionResolutionOptions = {},
): Promise<TenantSession | null> {
  const result = await lookupTenantSession(selector, options);
  return result.kind === "resolved" ? result.session : null;
}

export async function requireTenantSession(
  selector: TenantSessionSelector,
  options: TenantSessionResolutionOptions = {},
): Promise<TenantSession> {
  // This boundary resolves identity, tenant, membership, role, and effective
  // workspace only. T-013 owns permission, resource, and action authorization.
  const result = await lookupTenantSession(selector, options);
  if (result.kind === "unauthenticated") throw new TenantSessionUnauthenticatedError();
  if (result.kind === "unavailable") throw new TenantSessionUnavailableError();
  return result.session;
}

/** Testable composition boundary for the authenticated profile and storage resolver. */
export async function resolveTenantSessionForAppSession(
  session: SessionLookupResult | null,
  selector: TenantSessionSelector,
  options: TenantSessionResolutionOptions = {},
): Promise<TenantSessionLookupResult> {
  if (!session) return { kind: "unauthenticated", code: "AUTH_REQUIRED" };
  if ("status" in session) return { kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" };

  try {
    const scope = await (options.resolver ?? createTenantSessionResolver()).resolve({
      authIdentityId: session.userId,
      selector,
    });
    return {
      kind: "resolved",
      session: {
        userId: session.userId,
        email: session.email,
        displayName: session.displayName,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        membershipId: scope.membershipId,
        role: scope.role as LaunchRole,
        roleBindingId: scope.roleBindingId,
      },
    };
  } catch (error) {
    if (error instanceof TenantScopeResolutionError) {
      return { kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" };
    }
    // Storage and resolver failures fail closed and do not expose row details.
    return { kind: "unavailable", code: "TENANT_SCOPE_UNAVAILABLE" };
  }
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession({ allowInactive: true });
  if (!session) {
    throw new UnauthorizedError();
  }
  if ("status" in session) {
    throw new ForbiddenError(
      session.status === "disabled"
        ? "Your access has been disabled"
        : "Your account is pending workspace access",
    );
  }
  return session;
}

export async function requireRole(role: AppRole): Promise<AppSession> {
  const session = await requireSession();
  if (session.role !== role) {
    throw new ForbiddenError();
  }
  return session;
}

export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await requireSession();
  if (!hasPermission(session.role, permission)) {
    throw new ForbiddenError();
  }
  return session;
}
