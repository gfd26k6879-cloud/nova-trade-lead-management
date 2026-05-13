import "server-only";

import { ensureAppUserForAuthUser } from "@/lib/app-users";
import { setAuditActor } from "@/lib/audit-context";
import { hasPermission, type AppRole, type Permission } from "@/lib/permissions";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "@/lib/supabase/server";

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

export async function isAuthConfigured(): Promise<boolean> {
  return isSupabaseAuthConfigured();
}

export async function getSession(options: { allowInactive?: boolean } = {}): Promise<SessionLookupResult | null> {
  if (!isSupabaseAuthConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  if (error || !user?.id || !user.email) return null;

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
