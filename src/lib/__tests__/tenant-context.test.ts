import { describe, expect, it } from "vitest";
import { getAuditActor, runWithAuditActor } from "@/lib/audit-context";
import {
  getTenantContext,
  requireTenantContext,
  runWithTenantContext,
  TenantContextConflictError,
  TenantContextError,
  TenantContextRequiredError,
  type TenantContext,
} from "@/lib/tenancy/context";
import type { TenantSession } from "@/lib/auth";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const ROLE_BINDING_A = "30000000-0000-4000-8000-000000000001";
const ROLE_BINDING_B = "30000000-0000-4000-8000-000000000002";
const ACTOR_A = "50000000-0000-4000-8000-000000000001";
const ACTOR_B = "50000000-0000-4000-8000-000000000002";

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: ACTOR_A,
    email: "actor-a@example.com",
    displayName: "Actor A",
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    membershipId: MEMBERSHIP_A,
    role: "owner",
    roleBindingId: ROLE_BINDING_A,
    ...overrides,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("request-scoped tenant context", () => {
  it("returns null without context and requires it with a stable typed error", () => {
    expect(getTenantContext()).toBeNull();
    expect(() => requireTenantContext()).toThrow(TenantContextRequiredError);
    try {
      requireTenantContext();
    } catch (error) {
      expect(error).toMatchObject({
        name: "TenantContextRequiredError",
        code: "TENANT_CONTEXT_REQUIRED",
        message: "A tenant context is required",
      });
    }
  });

  it.each([
    ["tenant ID", { tenantId: "not-a-uuid" }],
    ["workspace ID", { workspaceId: "not-a-uuid" }],
    ["membership ID", { membershipId: "not-a-uuid" }],
    ["role binding ID", { roleBindingId: "not-a-uuid" }],
    ["actor ID", { userId: "not-a-uuid" }],
    ["unknown role", { role: "platform_support" }],
  ])("fails closed for malformed %s", (_label, overrides) => {
    let called = false;
    expect(() => runWithTenantContext(
      session(overrides as Partial<TenantSession>),
      "corr-invalid",
      () => {
        called = true;
      },
    )).toThrowError(TenantContextError);
    expect(called).toBe(false);
  });

  it.each(["", " has spaces", "contains\nnewline", 42, null])("rejects malformed correlation ID %p", (correlationId) => {
    expect(() => runWithTenantContext(session(), correlationId, () => undefined))
      .toThrowError(TenantContextError);
  });

  it("stores only frozen tenant-safe fields", () => {
    const context = runWithTenantContext(session(), { correlationId: "corr-safe-1" }, () => {
      const current = requireTenantContext();
      expect(current).not.toHaveProperty("email");
      expect(current).not.toHaveProperty("displayName");
      return current;
    });

    expect(Object.isFrozen(context)).toBe(true);
    expect(context).toEqual<TenantContext>({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
      actorAuthIdentityId: ACTOR_A,
      correlationId: "corr-safe-1",
    });
  });

  it("restores context after sync, await, throw, and rejection", async () => {
    runWithTenantContext(session(), "corr-sync", () => {
      expect(requireTenantContext().correlationId).toBe("corr-sync");
    });
    expect(getTenantContext()).toBeNull();

    await runWithTenantContext(session(), "corr-await", async () => {
      await Promise.resolve();
      expect(requireTenantContext().correlationId).toBe("corr-await");
    });
    expect(getTenantContext()).toBeNull();

    expect(() => runWithTenantContext(session(), "corr-throw", () => {
      throw new Error("callback failed");
    })).toThrow("callback failed");
    expect(getTenantContext()).toBeNull();

    await expect(runWithTenantContext(session(), "corr-reject", async () => {
      throw new Error("callback rejected");
    })).rejects.toThrow("callback rejected");
    expect(getTenantContext()).toBeNull();
  });

  it("allows identical nested context and rejects conflicts before callback execution", () => {
    let conflictingCallbackCalled = false;
    runWithTenantContext(session(), "corr-nested", () => {
      expect(runWithTenantContext(session(), "corr-nested", () => requireTenantContext()))
        .toBe(requireTenantContext());

      expect(() => runWithTenantContext(
        session({ workspaceId: null }),
        "corr-nested",
        () => {
          conflictingCallbackCalled = true;
        },
      )).toThrowError(TenantContextConflictError);
    });
    expect(conflictingCallbackCalled).toBe(false);
    expect(getTenantContext()).toBeNull();
  });

  it("isolates concurrent tenants and workspaces with deferred callbacks", async () => {
    const aGate = deferred();
    const bGate = deferred();
    const aStarted = deferred();
    const bStarted = deferred();

    const a = runWithTenantContext(session(), "corr-a", async () => {
      aStarted.resolve();
      await aGate.promise;
      return requireTenantContext();
    });
    const b = runWithTenantContext(session({
      userId: ACTOR_B,
      email: "actor-b@example.com",
      displayName: "Actor B",
      tenantId: TENANT_B,
      workspaceId: WORKSPACE_B,
      membershipId: MEMBERSHIP_B,
      role: "researcher",
      roleBindingId: ROLE_BINDING_B,
    }), "corr-b", async () => {
      bStarted.resolve();
      await bGate.promise;
      return requireTenantContext();
    });

    await Promise.all([aStarted.promise, bStarted.promise]);
    aGate.resolve();
    bGate.resolve();
    const [contextA, contextB] = await Promise.all([a, b]);

    expect(contextA).toMatchObject({ tenantId: TENANT_A, workspaceId: WORKSPACE_A, correlationId: "corr-a" });
    expect(contextB).toMatchObject({ tenantId: TENANT_B, workspaceId: WORKSPACE_B, correlationId: "corr-b" });
    expect(contextA).not.toMatchObject({ tenantId: TENANT_B, workspaceId: WORKSPACE_B });
    expect(contextB).not.toMatchObject({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
    expect(getTenantContext()).toBeNull();
  });

  it("composes tenant and callback-scoped audit contexts without concurrent leakage", async () => {
    const aGate = deferred();
    const bGate = deferred();
    const aStarted = deferred();
    const bStarted = deferred();
    const actorA = { userId: ACTOR_A, email: "actor-a@example.com", role: "admin" as const };
    const actorB = { userId: ACTOR_B, email: "actor-b@example.com", role: "researcher" as const };

    const a = runWithTenantContext(session(), "corr-composed-a", () => runWithAuditActor(actorA, async () => {
      aStarted.resolve();
      await aGate.promise;
      return { tenant: requireTenantContext(), actor: getAuditActor() };
    }));
    const b = runWithTenantContext(session({
      userId: ACTOR_B,
      email: actorB.email,
      displayName: "Actor B",
      tenantId: TENANT_B,
      workspaceId: WORKSPACE_B,
      membershipId: MEMBERSHIP_B,
      role: "researcher",
      roleBindingId: ROLE_BINDING_B,
    }), "corr-composed-b", () => runWithAuditActor(actorB, async () => {
      bStarted.resolve();
      await bGate.promise;
      return { tenant: requireTenantContext(), actor: getAuditActor() };
    }));

    await Promise.all([aStarted.promise, bStarted.promise]);
    aGate.resolve();
    bGate.resolve();
    const [{ tenant: tenantA, actor: observedActorA }, { tenant: tenantB, actor: observedActorB }] = await Promise.all([a, b]);

    expect(tenantA.tenantId).toBe(TENANT_A);
    expect(observedActorA).toEqual(actorA);
    expect(tenantB.tenantId).toBe(TENANT_B);
    expect(observedActorB).toEqual(actorB);
    expect(getTenantContext()).toBeNull();
    expect(getAuditActor()).toBeNull();
  });
});
