import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const crawlActionMocks = vi.hoisted(() => ({
  getSchedulerOperationsAction: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));

const queryMocks = vi.hoisted(() => ({
  buildSchedulerOperationsFallback: vi.fn((reason: string) => ({
    activeDiscovery: { status: "unavailable", lastError: reason },
  })),
}));

const authorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

const routeTimingMocks = vi.hoisted(() => ({
  logRouteTiming: vi.fn(),
  startRouteTiming: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/crawl/actions", () => crawlActionMocks);
vi.mock("@/lib/db", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("@/lib/route-timing", () => routeTimingMocks);
vi.mock("@/app/(protected)/scheduler/scheduler-client", () => ({
  SchedulerClient: () => React.createElement("div", null, "Scheduler loaded"),
}));

import SchedulerPage from "@/app/(protected)/scheduler/page";

const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_SESSION = {
  userId: "admin-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "owner",
} as const;

describe("SchedulerPage tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
    });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    crawlActionMocks.getSchedulerOperationsAction.mockResolvedValue({
      activeDiscovery: { status: "idle", lastError: null },
    });
    dbIndexMocks.withTenantDbContext.mockImplementation((callback: () => unknown) => callback());
    tenantContextMocks.runWithTenantContext.mockImplementation(
      (_session: unknown, _correlationId: unknown, callback: () => unknown) => callback(),
    );
    routeTimingMocks.startRouteTiming.mockReturnValue(routeTimingMocks.logRouteTiming);
  });

  it("keeps the legacy gate and installs both tenant contexts before the scheduler read", async () => {
    const node = await SchedulerPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Scheduler loaded");
    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "queue:read",
      { action: "scheduler.page.read" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^scheduler-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(tenantContextMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
    expect(dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0]).toBeLessThan(
      crawlActionMocks.getSchedulerOperationsAction.mock.invocationCallOrder[0],
    );
    expect(crawlActionMocks.getSchedulerOperationsAction).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing canonical scope", null],
    ["a different canonical identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["unsupported workspace scope", { ...TENANT_SESSION, workspaceId: WORKSPACE_ID }],
  ])("fails closed without scheduler access for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await SchedulerPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Scheduler temporarily unavailable");
    expect(text).toContain("No worker or queue data was requested");
    expect(text).not.toContain(TENANT_SESSION.tenantId);
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(crawlActionMocks.getSchedulerOperationsAction).not.toHaveBeenCalled();
  });

  it("normalizes tenant resolution and permission denials before scheduler access", async () => {
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("sensitive resolver detail"));

    let node = await SchedulerPage();
    let text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("Scheduler temporarily unavailable");
    expect(text).not.toContain("sensitive resolver detail");

    authMocks.getTenantSession.mockResolvedValueOnce(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockRejectedValueOnce(new Error("sensitive policy detail"));
    node = await SchedulerPage();
    text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("Scheduler temporarily unavailable");
    expect(text).not.toContain("sensitive policy detail");
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(crawlActionMocks.getSchedulerOperationsAction).not.toHaveBeenCalled();
  });
});
