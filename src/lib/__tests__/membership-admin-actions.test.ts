import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireTenantSession: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((fn: (db: unknown) => Promise<unknown>) => fn({ kind: "tenant-db" })),
}));
const contextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
}));
const localMocks = vi.hoisted(() => ({
  available: vi.fn(),
  createService: vi.fn(),
  hashIdentity: vi.fn(),
  invite: vi.fn(),
  assignRole: vi.fn(),
}));
const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  ...authMocks,
  TenantSessionUnauthenticatedError: class extends Error {},
  TenantSessionUnavailableError: class extends Error {},
}));
vi.mock("@/lib/db", () => dbMocks);
vi.mock("@/lib/tenancy/context", () => ({
  ...contextMocks,
  TenantContextError: class extends Error {},
}));
vi.mock("@/lib/tenancy/local-membership-administration", () => ({
  isLocalMembershipAdministrationAvailable: localMocks.available,
  createLocalTenantMembershipAdministrationService: localMocks.createService,
  hashLocalAuthIdentitySelector: localMocks.hashIdentity,
}));
vi.mock("next/cache", () => cacheMocks);

import {
  assignLocalTenantMembershipRoleAction,
  inviteLocalTenantMembershipAction,
} from "@/lib/tenancy/membership-admin-actions";
import { MembershipAdministrationError } from "@/lib/tenancy/memberships";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const ACTOR_ID = "30000000-0000-4000-8000-000000000001";
const TARGET_ID = "30000000-0000-4000-8000-000000000002";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000001";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "60000000-0000-4000-8000-000000000001";
const SESSION = {
  userId: USER_ID,
  email: "owner@example.com",
  displayName: null,
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: ACTOR_ID,
  roleBindingId: ROLE_BINDING_ID,
  role: "owner",
} as const;
const INVITED = { tenantId: TENANT_ID, membershipId: TARGET_ID, status: "pending", role: "researcher", workspaceId: null } as const;
const UPDATED = { ...INVITED, status: "active", role: "reviewer" } as const;

describe("local canonical membership admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireTenantSession.mockResolvedValue(SESSION);
    localMocks.available.mockReturnValue(true);
    localMocks.hashIdentity.mockReturnValue("a".repeat(64));
    localMocks.createService.mockReturnValue({
      invitePendingMember: localMocks.invite,
      assignMemberRole: localMocks.assignRole,
    });
    localMocks.invite.mockResolvedValue({ code: "OK", tenantId: TENANT_ID, operation: "invite", membership: INVITED, replacementMembership: null });
    localMocks.assignRole.mockResolvedValue({ code: "OK", tenantId: TENANT_ID, operation: "assign_role", membership: UPDATED, replacementMembership: null });
  });

  it("hashes a verified subject, preserves the client request UUID, and returns explicit pending-only copy", async () => {
    const input = { authSubjectId: SUBJECT_ID, role: "researcher", requestId: REQUEST_ID };
    const first = await inviteLocalTenantMembershipAction(input);
    const replay = await inviteLocalTenantMembershipAction(input);

    expect(first).toEqual({
      ok: true,
      membership: INVITED,
      message: "Pending membership record created locally. No account, email, or access was created.",
    });
    expect(replay).toEqual(first);
    expect(localMocks.hashIdentity).toHaveBeenNthCalledWith(1, SUBJECT_ID);
    expect(localMocks.invite).toHaveBeenNthCalledWith(1, SESSION, {
      identitySelectorHash: "a".repeat(64),
      role: "researcher",
      workspaceId: null,
      reasonCode: "invitation",
      correlationId: `membership-invite:${REQUEST_ID}`,
      idempotencyKey: `membership-invite.${REQUEST_ID}`,
    });
    expect(localMocks.invite.mock.calls[1][1]).toEqual(localMocks.invite.mock.calls[0][1]);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/users");
  });

  it("preserves a committed invite success when cache invalidation fails", async () => {
    cacheMocks.revalidatePath.mockImplementationOnce(() => {
      throw new Error("cache unavailable after commit");
    });

    const input = { authSubjectId: SUBJECT_ID, role: "researcher", requestId: REQUEST_ID };
    const committed = await inviteLocalTenantMembershipAction(input);
    const replay = await inviteLocalTenantMembershipAction(input);

    const success = {
      ok: true,
      membership: INVITED,
      message: "Pending membership record created locally. No account, email, or access was created.",
    };
    expect(committed).toEqual(success);
    expect(replay).toEqual(success);
    expect(localMocks.invite).toHaveBeenCalledTimes(2);
    expect(localMocks.invite.mock.calls[1][1]).toEqual(localMocks.invite.mock.calls[0][1]);
  });

  it("assigns only a fixed canonical role through the local adapter", async () => {
    const result = await assignLocalTenantMembershipRoleAction({ membershipId: TARGET_ID, role: "reviewer", requestId: REQUEST_ID });

    expect(result).toEqual({ ok: true, membership: UPDATED, message: "The canonical tenant role was updated locally." });
    expect(localMocks.assignRole).toHaveBeenCalledWith(SESSION, {
      membershipId: TARGET_ID,
      role: "reviewer",
      reasonCode: "role_change",
      correlationId: `membership-role:${REQUEST_ID}`,
      idempotencyKey: `membership-role.${REQUEST_ID}`,
    });

    const invalid = await assignLocalTenantMembershipRoleAction({ membershipId: TARGET_ID, role: "platform_admin", requestId: REQUEST_ID });
    expect(invalid).toEqual({ ok: false, code: "INVALID_INPUT", message: "The membership request is invalid." });
    expect(localMocks.assignRole).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["workspace session", { ...SESSION, workspaceId: "70000000-0000-4000-8000-000000000001" }],
    ["non-admin role", { ...SESSION, role: "researcher" }],
  ])("rejects %s before tenant database context", async (_label, session) => {
    authMocks.requireTenantSession.mockResolvedValue(session);
    const result = await inviteLocalTenantMembershipAction({ authSubjectId: SUBJECT_ID, role: "researcher", requestId: REQUEST_ID });

    expect(result).toEqual({ ok: false, code: "NOT_AUTHORIZED", message: "Membership administration is unavailable for this session." });
    expect(dbMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(localMocks.createService).not.toHaveBeenCalled();
  });

  it("fails PostgreSQL mode closed before mutation context or adapter creation", async () => {
    localMocks.available.mockReturnValue(false);
    const result = await inviteLocalTenantMembershipAction({ authSubjectId: SUBJECT_ID, role: "researcher", requestId: REQUEST_ID });

    expect(result).toEqual({ ok: false, code: "LOCAL_MUTATIONS_UNAVAILABLE", message: "Membership changes are read-only when PostgreSQL is configured." });
    expect(contextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(localMocks.createService).not.toHaveBeenCalled();
  });

  it("normalizes missing and foreign target failures to the same non-enumerating result", async () => {
    localMocks.assignRole.mockRejectedValue(new MembershipAdministrationError("TARGET_NOT_FOUND_OR_FORBIDDEN"));
    const missing = await assignLocalTenantMembershipRoleAction({ membershipId: TARGET_ID, role: "reviewer", requestId: REQUEST_ID });
    const foreign = await assignLocalTenantMembershipRoleAction({ membershipId: TARGET_ID, role: "reviewer", requestId: REQUEST_ID });

    const safe = { ok: false, code: "MEMBERSHIP_UNAVAILABLE", message: "The membership is unavailable." };
    expect(missing).toEqual(safe);
    expect(foreign).toEqual(safe);
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
