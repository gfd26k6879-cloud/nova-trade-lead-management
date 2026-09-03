import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const tenantAuthorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const crawlActionMocks = vi.hoisted(() => ({
  getDashboardStatsAction: vi.fn(),
}));

const crawlWorkspaceMocks = vi.hoisted(() => ({
  listCrawlWorkspaceOptions: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  buildSchedulerHealthFallback: vi.fn(() => ({
    workers: [],
    database: { staleClientReads: [] },
    auth: {
      appUrlConfigured: true,
      supabaseUrlConfigured: true,
      callbackUrl: "https://www.nosite.xyz/auth/callback",
      warnings: [],
    },
  })),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/tenancy/authorize", () => tenantAuthorizationMocks);
vi.mock("@/lib/crawl/actions", () => crawlActionMocks);
vi.mock("@/lib/crawl/workspace-scope", () => crawlWorkspaceMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/dashboard/dashboard-client", () => ({
  DashboardClient: ({ crawlWorkspaces }: { crawlWorkspaces: Array<{ workspaceId: string }> }) =>
    React.createElement("div", null, `Dashboard loaded ${crawlWorkspaces[0]?.workspaceId ?? "no-workspace"}`),
}));

import DashboardPage from "@/app/(protected)/dashboard/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "40000000-0000-4000-8000-000000000001";

const LEGACY_SESSION = {
  userId: USER_ID,
  email: "admin@example.com",
  role: "admin" as const,
};

const TENANT_SESSION = {
  tenantId: TENANT_ID,
  workspaceId: null,
  userId: USER_ID,
  role: "admin" as const,
  resolvedAt: "2026-08-30T12:00:00.000Z",
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue(LEGACY_SESSION);
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    tenantAuthorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    crawlWorkspaceMocks.listCrawlWorkspaceOptions.mockResolvedValue([{
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Primary workspace",
    }]);
  });

  it("renders the dashboard shell only after exact tenant-wide report authorization", async () => {

    const node = await DashboardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Dashboard loaded");
    expect(text).toContain(WORKSPACE_ID);
    expect(crawlWorkspaceMocks.listCrawlWorkspaceOptions).toHaveBeenCalledWith(TENANT_SESSION);
    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(tenantAuthorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "report:read",
      { action: "dashboard.page" },
    );
    expect(crawlActionMocks.getDashboardStatsAction).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["different identity", { ...TENANT_SESSION, userId: "30000000-0000-4000-8000-000000000001" }],
    ["workspace scoped", { ...TENANT_SESSION, workspaceId: "40000000-0000-4000-8000-000000000001" }],
  ])("fails closed for a %s canonical tenant session", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValueOnce(tenantSession);

    const node = await DashboardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Dashboard temporarily unavailable");
    expect(text).toContain("No dashboard data was requested");
    expect(text).not.toContain("Dashboard loaded");
    expect(tenantAuthorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(crawlActionMocks.getDashboardStatsAction).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
  });

  it("redacts tenant resolver failures and does not attempt authorization", async () => {
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("sensitive resolver detail"));

    const node = await DashboardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Dashboard temporarily unavailable");
    expect(text).not.toContain("sensitive resolver detail");
    expect(tenantAuthorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(crawlActionMocks.getDashboardStatsAction).not.toHaveBeenCalled();
  });

  it("redacts canonical permission failures and does not request dashboard data", async () => {
    tenantAuthorizationMocks.assertTenantPermission.mockRejectedValueOnce(new Error("sensitive policy detail"));

    const node = await DashboardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Dashboard temporarily unavailable");
    expect(text).not.toContain("sensitive policy detail");
    expect(crawlActionMocks.getDashboardStatsAction).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
  });
});
