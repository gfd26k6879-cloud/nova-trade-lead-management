import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertTenantPermission,
  assertTenantResourceOwnership,
  requireTenantPermission,
  TenantAuthorizationError,
  validateWorkspaceScope,
  type TenantPolicyContext,
  type TenantPolicyEvaluationResult,
  type TenantPermissionOptions,
  type TenantProtectedResource,
  type TenantSessionBoundary,
} from "@/lib/tenancy/authorize";
import type { TenantSession } from "@/lib/auth";
import { TenantSessionUnauthenticatedError } from "@/lib/auth";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";
const MEMBERSHIP_A = "membership-a";
const ROLE_BINDING_A = "role-binding-a";

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: "auth-user-a",
    email: "user@example.com",
    displayName: "User",
    tenantId: TENANT_A,
    workspaceId: null,
    membershipId: MEMBERSHIP_A,
    role: "owner",
    roleBindingId: ROLE_BINDING_A,
    ...overrides,
  };
}

function resource(overrides: Partial<TenantProtectedResource> = {}): TenantProtectedResource {
  return {
    tenantId: TENANT_A,
    workspaceId: null,
    resourceId: "resource-a",
    resourceType: "account",
    ...overrides,
  };
}

function expectAuthorizationError(
  error: unknown,
  status: 401 | 403 | 404,
  code: string,
): void {
  expect(error).toBeInstanceOf(TenantAuthorizationError);
  expect(error).toMatchObject({ status, code });
  expect((error as Error).message).not.toMatch(/tenant-a|tenant-b|workspace-a|workspace-b|resource-a/i);
}

const sessionBoundary = (resolved: TenantSession): TenantSessionBoundary => async () => resolved;

describe("tenant authorization helpers", () => {
  it("returns the resolved T-011 session and ignores request authority fields", async () => {
    let receivedSelector: unknown;
    const boundary: TenantSessionBoundary = async (selector) => {
      receivedSelector = selector;
      return session({ role: "researcher" });
    };

    await expect(requireTenantPermission(
      {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        role: "owner",
        membershipId: "forged-membership",
        permission: "data:delete",
      } as never,
      "account:read",
      { sessionBoundary: boundary },
    )).resolves.toMatchObject({ tenantId: TENANT_A, role: "researcher" });
    expect(receivedSelector).toEqual(expect.objectContaining({ tenantId: TENANT_A, workspaceId: WORKSPACE_A }));
  });

  it("maps absent authentication to the stable 401 error", async () => {
    const boundary: TenantSessionBoundary = async () => {
      throw new TenantSessionUnauthenticatedError();
    };

    await expect(requireTenantPermission({ tenantId: TENANT_A }, "account:read", { sessionBoundary: boundary }))
      .rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED", message: "Authentication required" });
  });

  it("maps an invalid authenticated scope to a stable 403 without details", async () => {
    const boundary: TenantSessionBoundary = async () => {
      throw new Error(`membership for ${TENANT_B} is invalid`);
    };

    await expect(requireTenantPermission({ tenantId: TENANT_A }, "account:read", { sessionBoundary: boundary }))
      .rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_REQUIRED", message: "A valid tenant scope is required" });
  });

  it.each([
    ["unknown role", { role: "platform_support" }],
    ["empty tenant", { tenantId: "" }],
    ["empty membership", { membershipId: "" }],
    ["malformed workspace", { workspaceId: 42 }],
  ])("fails closed for %s", async (_label, overrides) => {
    await expect(assertTenantPermission(
      session(overrides as Partial<TenantSession>),
      "account:read",
    )).rejects.toMatchObject({ status: 403 });
  });

  it("allows an A matrix cell only after the trusted session shape passes", async () => {
    await expect(assertTenantPermission(session({ role: "researcher" }), "account:read"))
      .resolves.toMatchObject({ membershipId: MEMBERSHIP_A, role: "researcher" });
  });

  it("denies D cells and unknown permissions without arbitrary authority casts", async () => {
    await expect(assertTenantPermission(session({ role: "analyst_read_only" }), "data:delete"))
      .rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(assertTenantPermission(session(), "not-a-tenant-permission"))
      .rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });

  it.each([
    ["missing evaluator", {}],
    ["throwing evaluator", { policyEvaluator: () => { throw new Error(`policy leaked ${TENANT_B}`); } }],
    ["rejecting evaluator", { policyEvaluator: async () => Promise.reject(new Error("policy unavailable")) }],
    ["malformed result", {
      policyEvaluator: () => ({ allowed: true } as unknown as TenantPolicyEvaluationResult),
    }],
    ["denied result", { policyEvaluator: (context: TenantPolicyContext) => ({ allowed: false, context }) }],
  ])("blocks C cells for %s", async (_label, options) => {
    const result = assertTenantPermission(session(), "tenant:manage", {
      action: "update_tenant",
      ...options,
    } as TenantPermissionOptions);
    await expect(result).rejects.toMatchObject({ status: 403, code: "POLICY_BLOCKED" });
    await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining(TENANT_B));
  });

  it("requires a non-empty action for a conditional cell", async () => {
    await expect(assertTenantPermission(session(), "tenant:manage", {
      policyEvaluator: (context) => ({ allowed: true, context }),
    })).rejects.toMatchObject({ status: 403, code: "POLICY_BLOCKED" });
  });

  it("requires the conditional evaluator result to bind every authority field exactly", async () => {
    const fields = [
      "tenantId",
      "workspaceId",
      "membershipId",
      "role",
      "permission",
      "action",
    ] as const;
    for (const field of fields) {
      await expect(assertTenantPermission(session(), "tenant:manage", {
        action: "update_tenant",
        policyEvaluator: (context) => ({
          allowed: true,
          context: { ...context, [field]: field === "workspaceId" ? WORKSPACE_A : "forged-value" },
        }),
      })).rejects.toMatchObject({ status: 403, code: "POLICY_BLOCKED" });
    }
  });

  it("requires the conditional evaluator result to bind the exact resource context", async () => {
    const protectedResource = resource();
    await expect(assertTenantPermission(session(), "tenant:manage", {
      action: "update_tenant",
      resource: protectedResource,
      scopeClass: "workspace-optional",
      policyEvaluator: (context) => ({
        allowed: true,
        context: {
          ...context,
          resource: { ...context.resource!, id: "forged-resource" },
        },
      }),
    })).rejects.toMatchObject({ status: 403, code: "POLICY_BLOCKED" });
  });

  it("does not invoke a conditional evaluator for an A cell", async () => {
    let called = false;
    await expect(assertTenantPermission(session(), "account:read", {
      action: "read_account",
      policyEvaluator: () => {
        called = true;
        throw new Error("must not run");
      },
    })).resolves.toBeDefined();
    expect(called).toBe(false);
  });

  it("allows a narrowed session to access tenant-wide resource instances", () => {
    const narrowed = session({ workspaceId: WORKSPACE_A });
    expect(assertTenantResourceOwnership(narrowed, resource({ workspaceId: null }), "tenant-wide"))
      .toBeDefined();
    expect(assertTenantResourceOwnership(narrowed, resource({ workspaceId: undefined }), "workspace-optional"))
      .toBeDefined();
  });

  it("rejects a workspace on a tenant-wide resource instead of ignoring it", () => {
    expect(() => assertTenantResourceOwnership(
      session({ workspaceId: WORKSPACE_A }),
      resource({ workspaceId: WORKSPACE_A }),
      "tenant-wide",
    )).toThrowError(new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID"));
  });

  it("treats a null optional workspace as tenant-wide for both session scopes", () => {
    expect(() => validateWorkspaceScope(session(), {
      tenantId: TENANT_A,
      workspaceId: null,
      scopeClass: "workspace-optional",
    })).not.toThrow();
    expect(() => validateWorkspaceScope(session({ workspaceId: WORKSPACE_A }), {
      tenantId: TENANT_A,
      workspaceId: null,
      scopeClass: "workspace-optional",
    })).not.toThrow();
  });

  it("allows a tenant-wide session to access a same-tenant workspace resource", () => {
    expect(assertTenantResourceOwnership(
      session({ workspaceId: null }),
      resource({ workspaceId: WORKSPACE_A }),
      "workspace-optional",
    )).toBeDefined();
    expect(assertTenantResourceOwnership(
      session({ workspaceId: null }),
      resource({ workspaceId: WORKSPACE_A }),
      "workspace-required",
    )).toBeDefined();
  });

  it("requires a workspace for workspace-required resources", () => {
    expect(() => assertTenantResourceOwnership(
      session(),
      resource({ workspaceId: null }),
      "workspace-required",
    )).toThrowError(new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID"));
  });

  it("requires a narrowed session to match a non-null resource workspace exactly", () => {
    expect(assertTenantResourceOwnership(
      session({ workspaceId: WORKSPACE_A }),
      resource({ workspaceId: WORKSPACE_A }),
      "workspace-optional",
    )).toBeDefined();
    expect(() => assertTenantResourceOwnership(
      session({ workspaceId: WORKSPACE_A }),
      resource({ workspaceId: WORKSPACE_B }),
      "workspace-required",
    )).toThrowError(new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID"));
  });

  it("rejects wrong-tenant workspace scopes without exposing identifiers", () => {
    expect(() => validateWorkspaceScope(session(), {
      tenantId: TENANT_B,
      workspaceId: WORKSPACE_B,
      scopeClass: "workspace-optional",
    })).toThrowError(new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH"));
  });

  it("collapses absent and cross-tenant protected resources to the same 404 shape", () => {
    let absentError: unknown;
    let foreignError: unknown;
    try {
      assertTenantResourceOwnership(session(), null, "tenant-wide");
    } catch (error) {
      absentError = error;
    }
    try {
      assertTenantResourceOwnership(session(), resource({ tenantId: TENANT_B }), "tenant-wide");
    } catch (error) {
      foreignError = error;
    }

    expect(absentError).toEqual(foreignError);
    expectAuthorizationError(absentError, 404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
  });

  it("uses the same ownership boundary for read and mutation examples", async () => {
    await expect(assertTenantPermission(session({ role: "strategist_manager" }), "account:read"))
      .resolves.toBeDefined();
    await expect(assertTenantPermission(session({ role: "strategist_manager" }), "account:edit"))
      .resolves.toBeDefined();
    await expect(assertTenantPermission(session({ workspaceId: WORKSPACE_A }), "account:edit", {
      action: "edit_account",
      resource: resource({ workspaceId: WORKSPACE_B }),
      scopeClass: "workspace-required",
      policyEvaluator: (context) => ({ allowed: true, context }),
    })).rejects.toMatchObject({ status: 403, code: "WORKSPACE_SCOPE_INVALID" });
  });

  it("does not put forged request authority into a conditional policy context", async () => {
    let observed: TenantPolicyContext | undefined;
    await expect(requireTenantPermission(
      { tenantId: TENANT_A, role: "admin", membershipId: "forged" } as never,
      "tenant:manage",
      {
        sessionBoundary: sessionBoundary(session({ role: "owner", workspaceId: WORKSPACE_A })),
        action: "update_tenant",
        policyEvaluator: (context) => {
          observed = context;
          return { allowed: true, context };
        },
      },
    )).resolves.toBeDefined();
    expect(observed).toMatchObject({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBERSHIP_A,
      role: "owner",
      permission: "tenant:manage",
      action: "update_tenant",
    });
    expect(observed).not.toMatchObject({ membershipId: "forged", role: "admin" });
  });
});
