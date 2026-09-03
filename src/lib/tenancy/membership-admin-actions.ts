"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireTenantSession,
  TenantSessionUnauthenticatedError,
  TenantSessionUnavailableError,
  type TenantSession,
} from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import {
  createLocalTenantMembershipAdministrationService,
  hashLocalAuthIdentitySelector,
  isLocalMembershipAdministrationAvailable,
} from "@/lib/tenancy/local-membership-administration";
import {
  MembershipAdministrationError,
  type MembershipAdministrationErrorCode,
  type MembershipView,
} from "@/lib/tenancy/memberships";
import { launchRoleSchema, membershipIdSchema } from "@/lib/tenancy/schemas";
import { runWithTenantContext, TenantContextError } from "@/lib/tenancy/context";

const requestIdSchema = z.string().uuid();
const inviteInputSchema = z.object({
  authSubjectId: z.string().uuid(),
  role: launchRoleSchema,
  requestId: requestIdSchema,
}).strict();
const assignRoleInputSchema = z.object({
  membershipId: membershipIdSchema,
  role: launchRoleSchema,
  requestId: requestIdSchema,
}).strict();

export type LocalMembershipAdminActionResult =
  | Readonly<{ ok: true; membership: MembershipView; message: string }>
  | Readonly<{ ok: false; code: LocalMembershipAdminActionErrorCode; message: string }>;

export type LocalMembershipAdminActionErrorCode =
  | "INVALID_INPUT"
  | "NOT_AUTHORIZED"
  | "LOCAL_MUTATIONS_UNAVAILABLE"
  | "MEMBERSHIP_UNAVAILABLE"
  | "CONFLICT"
  | "UNAVAILABLE";

export async function inviteLocalTenantMembershipAction(
  input: unknown,
): Promise<LocalMembershipAdminActionResult> {
  return executeLocalMembershipAction(input, inviteInputSchema, "invite", async (session, parsed) => {
    const result = await withTenantDbContext(async (db) => {
      const service = createLocalTenantMembershipAdministrationService(db);
      return service.invitePendingMember(session, {
        identitySelectorHash: hashLocalAuthIdentitySelector(parsed.authSubjectId),
        role: parsed.role,
        workspaceId: null,
        reasonCode: "invitation",
        correlationId: `membership-invite:${parsed.requestId}`,
        idempotencyKey: `membership-invite.${parsed.requestId}`,
      });
    });
    return {
      ok: true,
      membership: result.membership,
      message: "Pending membership record created locally. No account, email, or access was created.",
    };
  });
}

export async function assignLocalTenantMembershipRoleAction(
  input: unknown,
): Promise<LocalMembershipAdminActionResult> {
  return executeLocalMembershipAction(input, assignRoleInputSchema, "assign-role", async (session, parsed) => {
    const result = await withTenantDbContext(async (db) => {
      const service = createLocalTenantMembershipAdministrationService(db);
      return service.assignMemberRole(session, {
        membershipId: parsed.membershipId,
        role: parsed.role,
        reasonCode: "role_change",
        correlationId: `membership-role:${parsed.requestId}`,
        idempotencyKey: `membership-role.${parsed.requestId}`,
      });
    });
    return {
      ok: true,
      membership: result.membership,
      message: "The canonical tenant role was updated locally.",
    };
  });
}

async function executeLocalMembershipAction<T extends { requestId: string }>(
  input: unknown,
  schema: z.ZodType<T>,
  operation: "invite" | "assign-role",
  execute: (session: TenantSession, parsed: T) => Promise<LocalMembershipAdminActionResult>,
): Promise<LocalMembershipAdminActionResult> {
  try {
    const session = await requireTenantSession({});
    if (session.workspaceId !== null || (session.role !== "owner" && session.role !== "admin")) {
      return failure("NOT_AUTHORIZED");
    }

    const parsed = schema.safeParse(input);
    if (!parsed.success) return failure("INVALID_INPUT");
    if (!isLocalMembershipAdministrationAvailable()) return failure("LOCAL_MUTATIONS_UNAVAILABLE");

    const result = await runWithTenantContext(
      session,
      `membership-admin:${operation}:${parsed.data.requestId}`,
      () => execute(session, parsed.data),
    );
    if (result.ok) {
      try {
        revalidatePath("/users");
      } catch {
        // The mutation already committed; cache invalidation must not rewrite a truthful success.
      }
    }
    return result;
  } catch (error) {
    return mapFailure(error);
  }
}

function mapFailure(error: unknown): LocalMembershipAdminActionResult {
  if (error instanceof TenantSessionUnauthenticatedError
    || error instanceof TenantSessionUnavailableError
    || error instanceof TenantContextError) {
    return failure("NOT_AUTHORIZED");
  }
  if (!(error instanceof MembershipAdministrationError)) return failure("UNAVAILABLE");
  const code: MembershipAdministrationErrorCode = error.code;
  if (code === "INVALID_INPUT") return failure("INVALID_INPUT");
  if (code === "TARGET_NOT_FOUND_OR_FORBIDDEN") return failure("MEMBERSHIP_UNAVAILABLE");
  if (code === "PERMISSION_DENIED" || code === "POLICY_BLOCKED" || code === "TENANT_SCOPE_REQUIRED"
    || code === "TENANT_SCOPE_MISMATCH" || code === "WORKSPACE_SCOPE_INVALID") {
    return failure("NOT_AUTHORIZED");
  }
  if (code === "STATE_CONFLICT" || code === "OWNER_GUARD" || code === "DUPLICATE_PENDING_INVITE"
    || code === "DUPLICATE_CURRENT_MEMBERSHIP" || code === "IDEMPOTENCY_CONFLICT"
    || code === "MUTATION_IN_PROGRESS") {
    return failure("CONFLICT");
  }
  return failure("UNAVAILABLE");
}

function failure(code: LocalMembershipAdminActionErrorCode): LocalMembershipAdminActionResult {
  const message: Readonly<Record<LocalMembershipAdminActionErrorCode, string>> = {
    INVALID_INPUT: "The membership request is invalid.",
    NOT_AUTHORIZED: "Membership administration is unavailable for this session.",
    LOCAL_MUTATIONS_UNAVAILABLE: "Membership changes are read-only when PostgreSQL is configured.",
    MEMBERSHIP_UNAVAILABLE: "The membership is unavailable.",
    CONFLICT: "The membership changed or this request conflicts with its current state.",
    UNAVAILABLE: "The membership request could not be completed.",
  };
  return { ok: false, code, message: message[code] };
}
