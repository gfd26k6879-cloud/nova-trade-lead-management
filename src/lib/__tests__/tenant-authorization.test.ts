import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TenantSessionUnauthenticatedError,
  TenantSessionUnavailableError,
  type TenantSession,
} from "@/lib/auth";
import {
  assertTenantPermission,
  assertTenantResourceOwnership,
  requireTenantPermission,
  TenantAuthorizationError,
  type TenantPolicyContext,
  type TenantProtectedResource,
  type TenantSessionBoundary,
} from "@/lib/tenancy/authorize";
import {
  getTenantPermissionDecision,
  TENANT_PERMISSION_MATRIX,
  TENANT_PERMISSION_ROWS,
  TENANT_PERMISSIONS,
  TENANT_ROLES,
  type PermissionDecision,
  type TenantPermission,
  type TenantRole,
} from "@/lib/permissions";
import { isSupportAccessGrantEligibleAt } from "@/lib/tenancy/schemas";
import {
  CANONICAL_TENANT_FIXTURE_CATALOG,
  CANONICAL_TENANT_FIXTURE_IDS,
} from "@/test/tenants";

type TenantKey = "A" | "B";

type MatrixCell = {
  readonly role: TenantRole;
  readonly permission: TenantPermission;
  readonly expected: PermissionDecision;
  readonly key: string;
};

const matrixCells: readonly MatrixCell[] = TENANT_ROLES.flatMap((role) =>
  TENANT_PERMISSIONS.map((permission) => ({
    role,
    permission,
    expected: TENANT_PERMISSION_MATRIX[role][permission],
    key: `${role}:${permission}`,
  })),
);

const allowCells = matrixCells.filter(({ expected }) => expected === "A");
const conditionalCells = matrixCells.filter(({ expected }) => expected === "C");
const denyCells = matrixCells.filter(({ expected }) => expected === "D");

function canonicalSession(
  tenantKey: TenantKey,
  role: TenantRole,
  overrides: Partial<TenantSession> = {},
): TenantSession {
  const ids = CANONICAL_TENANT_FIXTURE_IDS;
  const userId = role === "owner"
    ? ids.sharedAuthIdentityId
    : ids.roleIdentityIds[tenantKey][role];
  return {
    userId,
    email: `${tenantKey.toLowerCase()}-${role}@synthetic.invalid`,
    displayName: `Synthetic ${tenantKey} ${role}`,
    tenantId: ids.tenants[tenantKey],
    workspaceId: null,
    membershipId: ids.memberships[tenantKey][role],
    role,
    roleBindingId: ids.roleBindings[tenantKey][role],
    ...overrides,
  };
}

function canonicalResource(
  tenantKey: TenantKey,
  resourceId = `resource-${tenantKey.toLowerCase()}`,
  workspaceId: string | null = CANONICAL_TENANT_FIXTURE_IDS.workspaces[tenantKey],
): TenantProtectedResource {
  return {
    tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants[tenantKey],
    workspaceId,
    resourceId,
    resourceType: "synthetic-resource",
  };
}

function actionFor(role: TenantRole, permission: TenantPermission): string {
  return `${role}:${permission.replace(":", "_")}`;
}

function expectAuthorizationError(error: unknown, status: 401 | 403 | 404, code: string): void {
  expect(error).toBeInstanceOf(TenantAuthorizationError);
  expect(error).toMatchObject({ status, code });
  const message = error instanceof Error ? error.message : String(error);
  expect(message).not.toMatch(/synthetic-tenant|shared-workspace|resource-/i);
}

function exactConditionalOptions(
  tenantKey: TenantKey,
  role: TenantRole,
  permission: TenantPermission,
  policyEvaluator: (context: TenantPolicyContext) => { allowed: boolean; context: TenantPolicyContext },
) {
  const session = canonicalSession(tenantKey, role, {
    workspaceId: CANONICAL_TENANT_FIXTURE_IDS.workspaces[tenantKey],
  });
  return {
    action: actionFor(role, permission),
    resource: canonicalResource(tenantKey, `${tenantKey.toLowerCase()}-${permission}`),
    scopeClass: "workspace-required" as const,
    policyEvaluator,
    session,
  };
}

function withoutPolicyEvaluator(options: ReturnType<typeof exactConditionalOptions>) {
  return {
    action: options.action,
    resource: options.resource,
    scopeClass: options.scopeClass,
  };
}

describe("tenant authorization contract", () => {
  it.each(matrixCells)("matches D-002 for $role/$permission", ({ role, permission, expected }) => {
    expect(getTenantPermissionDecision(role, permission)).toEqual({
      decision: expected,
      allowed: expected !== "D",
    });
  });

  it("proves the complete deterministic matrix coverage table", () => {
    const rowPermissions = TENANT_PERMISSION_ROWS.map(([permission]) => permission);
    const duplicatePermissions = rowPermissions.filter(
      (permission, index) => rowPermissions.indexOf(permission) !== index,
    );
    const missingPermissions = TENANT_PERMISSIONS.filter((permission) => !rowPermissions.includes(permission));
    const unexpectedPermissions = rowPermissions.filter((permission) => !TENANT_PERMISSIONS.includes(permission));
    const missingMatrixEntries = matrixCells
      .filter(({ role, permission }) => !(permission in TENANT_PERMISSION_MATRIX[role]))
      .map(({ key }) => key);
    const coverageTable = {
      roles: TENANT_ROLES.length,
      permissions: TENANT_PERMISSIONS.length,
      totalCells: matrixCells.length,
      expectedCells: TENANT_ROLES.length * TENANT_PERMISSIONS.length,
      uniqueCellCount: new Set(matrixCells.map(({ key }) => key)).size,
      A: allowCells.length,
      C: conditionalCells.length,
      D: denyCells.length,
      missingPermissions,
      duplicatePermissions,
      unexpectedPermissions,
      missingMatrixEntries,
      coveredCells: matrixCells.length,
      coveragePercent: matrixCells.length === TENANT_ROLES.length * TENANT_PERMISSIONS.length ? 100 : 0,
    };

    expect(coverageTable).toEqual({
      roles: 7,
      permissions: 75,
      totalCells: 525,
      expectedCells: 525,
      uniqueCellCount: 525,
      A: 127,
      C: 227,
      D: 171,
      missingPermissions: [],
      duplicatePermissions: [],
      unexpectedPermissions: [],
      missingMatrixEntries: [],
      coveredCells: 525,
      coveragePercent: 100,
    });
    expect(Object.keys(TENANT_PERMISSION_MATRIX)).toEqual([...TENANT_ROLES]);
    for (const role of TENANT_ROLES) {
      expect(Object.keys(TENANT_PERMISSION_MATRIX[role])).toEqual([...TENANT_PERMISSIONS]);
    }
  });

  it.each(allowCells)("allows every A cell through the T-013 helper: $role/$permission", async ({ role, permission }) => {
    await expect(assertTenantPermission(canonicalSession("A", role), permission))
      .resolves.toMatchObject({ tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants.A, role });
  });

  it.each(denyCells)("rejects every D cell with stable PERMISSION_DENIED: $role/$permission", async ({ role, permission }) => {
    await expect(assertTenantPermission(canonicalSession("A", role), permission, {
      action: actionFor(role, permission),
    })).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED", message: "Permission denied" });
  });

  it.each(conditionalCells)("requires exact policy context for every C cell: $role/$permission", async ({ role, permission }) => {
    const base = exactConditionalOptions("A", role, permission, (context) => ({ allowed: true, context }));
    await expect(assertTenantPermission(base.session, permission, withoutPolicyEvaluator(base))).rejects.toMatchObject({
      status: 403,
      code: "POLICY_BLOCKED",
    });

    let observedContext: TenantPolicyContext | undefined;
    const exact = exactConditionalOptions("A", role, permission, (context) => {
      observedContext = context;
      return { allowed: true, context };
    });
    await expect(assertTenantPermission(exact.session, permission, exact)).resolves.toBe(exact.session);
    expect(observedContext).toEqual({
      tenantId: exact.session.tenantId,
      workspaceId: exact.session.workspaceId,
      membershipId: exact.session.membershipId,
      role,
      permission,
      action: exact.action,
      resource: {
        id: `a-${permission}`,
        type: "synthetic-resource",
        tenantId: exact.session.tenantId,
        workspaceId: exact.session.workspaceId,
        scopeClass: "workspace-required",
      },
    });

    const mismatched = exactConditionalOptions("A", role, permission, (context) => ({
      allowed: true,
      context: { ...context, tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants.B },
    }));
    await expect(assertTenantPermission(mismatched.session, permission, mismatched)).rejects.toMatchObject({
      status: 403,
      code: "POLICY_BLOCKED",
    });
  });

  it("rejects unauthenticated, pending, and disabled session boundaries", async () => {
    await expect(requireTenantPermission(
      { tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants.A },
      "tenant:read",
      { sessionBoundary: async () => { throw new TenantSessionUnauthenticatedError(); } },
    )).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });

    for (const status of ["pending", "disabled"] as const) {
      expect(CANONICAL_TENANT_FIXTURE_CATALOG.memberships).toEqual(expect.arrayContaining([
        expect.objectContaining({ tenantKey: "A", status }),
      ]));
      const boundary: TenantSessionBoundary = async () => {
        throw new TenantSessionUnavailableError();
      };
      await expect(requireTenantPermission(
        { tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants.A },
        "tenant:read",
        { sessionBoundary: boundary },
      )).rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_REQUIRED" });
    }
  });

  it("fails closed for malformed role and unknown permission inputs", async () => {
    const malformedRoleSession = {
      ...canonicalSession("A", "owner"),
      role: "unknown_role",
    } as unknown as TenantSession;
    await expect(assertTenantPermission(malformedRoleSession, "tenant:read"))
      .rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_REQUIRED" });
    await expect(assertTenantPermission(canonicalSession("A", "owner"), "unknown:permission"))
      .rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });

  it("rejects wrong tenant and wrong workspace scopes for both read and mutation", async () => {
    const session = canonicalSession("A", "owner", {
      workspaceId: CANONICAL_TENANT_FIXTURE_IDS.workspaces.A,
    });
    expect(() => assertTenantResourceOwnership(session, canonicalResource("B"), "workspace-optional"))
      .toThrowError(new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN"));
    expect(() => assertTenantResourceOwnership(session, canonicalResource("A", "wrong-workspace", CANONICAL_TENANT_FIXTURE_IDS.workspaces.B), "workspace-required"))
      .toThrowError(new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID"));

    await expect(assertTenantPermission(session, "account:read", {
      action: "read_account",
      resource: canonicalResource("B"),
      scopeClass: "workspace-optional",
    })).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND_OR_FORBIDDEN" });
    await expect(assertTenantPermission(canonicalSession("A", "strategist_manager", {
      workspaceId: CANONICAL_TENANT_FIXTURE_IDS.workspaces.A,
    }), "account:edit", {
      action: "edit_account",
      resource: canonicalResource("A", "wrong-workspace", CANONICAL_TENANT_FIXTURE_IDS.workspaces.B),
      scopeClass: "workspace-required",
      policyEvaluator: (context) => ({ allowed: true, context }),
    })).rejects.toMatchObject({ status: 403, code: "WORKSPACE_SCOPE_INVALID" });
  });

  it("uses identical non-enumerating 404s for absent and other-tenant resources on read and mutation", async () => {
    for (const [role, permission, action] of [
      ["owner", "account:read", "read_account"],
      ["strategist_manager", "account:edit", "edit_account"],
    ] as const) {
      const session = canonicalSession("A", role);
      const options = {
        action,
        scopeClass: "workspace-optional" as const,
      };
      let absentError: unknown;
      let foreignError: unknown;
      try {
        await assertTenantPermission(session, permission, { ...options, resource: null });
      } catch (error) {
        absentError = error;
      }
      try {
        await assertTenantPermission(session, permission, {
          ...options,
          resource: canonicalResource("B"),
        });
      } catch (error) {
        foreignError = error;
      }
      expect(absentError).toEqual(foreignError);
      expectAuthorizationError(absentError, 404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
    }
  });

  it("keeps expired and revoked support eligibility separate from tenant membership authorization", async () => {
    const { timeBoundaries } = CANONICAL_TENANT_FIXTURE_CATALOG;
    const expiredGrant = {
      state: "approved" as const,
      startsAt: timeBoundaries.supportStartsAt,
      expiresAt: timeBoundaries.supportExpiryBoundary,
      revokedAt: null,
    };
    const revokedGrant = {
      state: "revoked" as const,
      startsAt: timeBoundaries.supportStartsAt,
      expiresAt: timeBoundaries.revokedGrantExpiry,
      revokedAt: timeBoundaries.supportRevokedAt,
    };
    expect(isSupportAccessGrantEligibleAt(expiredGrant, timeBoundaries.supportExpiryBoundary)).toBe(false);
    expect(isSupportAccessGrantEligibleAt(revokedGrant, timeBoundaries.supportActiveAt)).toBe(false);

    const supportActorHasNoMembership: TenantSessionBoundary = async () => {
      throw new TenantSessionUnavailableError();
    };
    for (const grant of [expiredGrant, revokedGrant]) {
      expect(grant).toBeDefined();
      await expect(requireTenantPermission(
        {
          tenantId: CANONICAL_TENANT_FIXTURE_IDS.tenants.A,
          workspaceId: CANONICAL_TENANT_FIXTURE_IDS.workspaces.A,
        },
        "tenant:read",
        { sessionBoundary: supportActorHasNoMembership },
      )).rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_REQUIRED" });
    }
  });
});
