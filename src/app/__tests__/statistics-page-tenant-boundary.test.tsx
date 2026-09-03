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
  getStatisticsSummary: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tenancy/context")>(),
  runWithTenantContext: tenantContextMocks.runWithTenantContext,
}));
vi.mock("@/app/(protected)/statistics/statistics-client", () => ({
  StatisticsClient: () => React.createElement("div", null, "Statistics loaded"),
}));

import StatisticsPage from "@/app/(protected)/statistics/page";

const TENANT_SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "owner",
} as const;

const EMPTY_SUMMARY = {
  range: { key: "30d", label: "Last 30 days", start: "2026-08-01", end: "2026-08-30" },
  totals: {},
  funnel: [],
  businessTypes: [],
  qualityBuckets: [],
  websiteStatuses: [],
  enrichmentStatuses: [],
  dataCoverage: [],
  crawlEconomics: {},
};

describe("StatisticsPage tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getStatisticsSummary.mockResolvedValue(EMPTY_SUMMARY);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, callback: () => Promise<unknown>) => callback());
    dbIndexMocks.withTenantDbContext.mockImplementation((callback: () => Promise<unknown>) => callback());
    tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback());
  });

  it("authorizes report reads and installs both tenant contexts before statistics queries", async () => {
    const node = await StatisticsPage({ searchParams: Promise.resolve({ range: "30d" }) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Statistics loaded");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "report:read",
      { action: "statistics.page" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^statistics-page:/),
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
    expect(queryMocks.getStatisticsSummary).toHaveBeenCalledWith({ range: "30d", from: undefined, to: undefined });
  });

  it.each([
    ["missing canonical scope", null],
    ["a different canonical identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["unsupported workspace scope", { ...TENANT_SESSION, workspaceId: "20000000-0000-4000-8000-000000000001" }],
  ])("fails closed without database access for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await StatisticsPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getStatisticsSummary).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it("normalizes tenant resolution and permission failures before database access", async () => {
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("sensitive tenant resolution detail"));

    let node = await StatisticsPage({ searchParams: Promise.resolve({}) });
    let text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive tenant resolution detail");

    authMocks.getTenantSession.mockResolvedValueOnce(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockRejectedValueOnce(new Error("sensitive policy detail"));
    node = await StatisticsPage({ searchParams: Promise.resolve({}) });
    text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive policy detail");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });
});
