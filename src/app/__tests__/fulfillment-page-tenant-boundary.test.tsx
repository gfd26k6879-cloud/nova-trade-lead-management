import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, callback: () => Promise<unknown>) => callback()),
  withTenantDbContext: vi.fn((callback: () => Promise<unknown>) => callback()),
  isDbStatementTimeoutError: vi.fn(() => false),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getAdminFulfillmentSummary: vi.fn(),
  getAdminRequests: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(() => null),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("@/app/(protected)/fulfillment/fulfillment-client", () => ({
  FulfillmentClient: () => React.createElement("div", null, "Fulfillment loaded"),
}));

import FulfillmentPage from "@/app/(protected)/fulfillment/page";

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

const EMPTY_SUMMARY = {
  openTotal: 0,
  openWebsiteRequests: 0,
  openQuoteRequests: 0,
  waitingOnResearcher: 0,
  overdueRequests: 0,
  newRequests: 0,
  latestRequests: [],
};

describe("FulfillmentPage tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getAdminFulfillmentSummary.mockResolvedValue(EMPTY_SUMMARY);
    queryMocks.getAdminRequests.mockResolvedValue([]);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, callback: () => Promise<unknown>) => callback());
    dbIndexMocks.withTenantDbContext.mockImplementation((callback: () => Promise<unknown>) => callback());
    tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback());
  });

  it("retains the admin gate and installs both tenant contexts before fulfillment reads", async () => {
    const node = await FulfillmentPage({ searchParams: Promise.resolve({ type: "quote_request", status: "new" }) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Fulfillment loaded");
    expect(authMocks.requirePermission).toHaveBeenCalledWith("admin_request:manage");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "account:read",
      { action: "fulfillment.page.read" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^fulfillment-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(tenantContextMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
    expect(dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0]).toBeLessThan(
      queryMocks.ensureDbReady.mock.invocationCallOrder[0],
    );
    expect(queryMocks.getAdminFulfillmentSummary).toHaveBeenCalledOnce();
    expect(queryMocks.getAdminRequests).toHaveBeenCalledWith({
      requestType: "quote_request",
      status: "new",
      limit: 100,
    });
  });

  it.each([
    ["missing canonical scope", null],
    ["a different canonical identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["unsupported workspace scope", { ...TENANT_SESSION, workspaceId: "20000000-0000-4000-8000-000000000001" }],
  ])("fails closed without database access for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await FulfillmentPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getAdminFulfillmentSummary).not.toHaveBeenCalled();
    expect(queryMocks.getAdminRequests).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it("normalizes tenant resolution and canonical permission failures before database access", async () => {
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("sensitive tenant resolution detail"));

    let node = await FulfillmentPage({ searchParams: Promise.resolve({}) });
    let text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive tenant resolution detail");

    authMocks.getTenantSession.mockResolvedValueOnce(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockRejectedValueOnce(new Error("sensitive policy detail"));
    node = await FulfillmentPage({ searchParams: Promise.resolve({}) });
    text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive policy detail");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });
});
