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
  getCrawlProgress: vi.fn(),
  getCrawlUnitPreview: vi.fn(),
  getSelectedOrDefaultVisibleCrawlRun: vi.fn(),
  listDiscoveryItems: vi.fn(),
  getLocationCellCoverage: vi.fn(),
  getMarketCoverageSummary: vi.fn(),
  getRunGeographyProgress: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/tenancy/authorize", () => tenantAuthorizationMocks);
vi.mock("@/lib/crawl/workspace-scope", () => crawlWorkspaceMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/coverage/coverage-client", () => ({
  CoverageClient: ({ initialCrawlWorkspaceId }: { initialCrawlWorkspaceId: string | null }) =>
    React.createElement("div", null, `Coverage shell loaded ${initialCrawlWorkspaceId ?? "no-workspace"}`),
}));

import CoveragePage from "@/app/(protected)/coverage/page";

const TENANT_SESSION = {
  userId: "admin-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: null,
  membershipId: "20000000-0000-4000-8000-000000000001",
  roleBindingId: "30000000-0000-4000-8000-000000000001",
  role: "owner",
} as const;
const WORKSPACE_ID = "40000000-0000-4000-8000-000000000001";

describe("CoveragePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({
      userId: TENANT_SESSION.userId,
      email: TENANT_SESSION.email,
      role: "admin",
    });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    tenantAuthorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    crawlWorkspaceMocks.listCrawlWorkspaceOptions.mockResolvedValue([{
      tenantId: TENANT_SESSION.tenantId,
      workspaceId: WORKSPACE_ID,
      name: "Primary workspace",
    }]);
  });

  it("renders a fast shell without running heavy coverage reads during SSR", async () => {
    const node = await CoveragePage({ searchParams: { run: "run-1" } });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Coverage shell loaded");
    expect(text).toContain(WORKSPACE_ID);
    expect(crawlWorkspaceMocks.listCrawlWorkspaceOptions).toHaveBeenCalledWith(TENANT_SESSION);
    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(tenantAuthorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "source:review",
      { action: "coverage.page.read" },
    );
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getSelectedOrDefaultVisibleCrawlRun).not.toHaveBeenCalled();
    expect(queryMocks.getMarketCoverageSummary).not.toHaveBeenCalled();
    expect(queryMocks.getLocationCellCoverage).not.toHaveBeenCalled();
    expect(queryMocks.getCrawlProgress).not.toHaveBeenCalled();
    expect(queryMocks.getCrawlUnitPreview).not.toHaveBeenCalled();
    expect(queryMocks.getRunGeographyProgress).not.toHaveBeenCalled();
    expect(queryMocks.listDiscoveryItems).not.toHaveBeenCalled();
  });

  it.each([
    ["missing canonical scope", null],
    ["a different canonical identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["unsupported workspace scope", { ...TENANT_SESSION, workspaceId: "40000000-0000-4000-8000-000000000001" }],
  ])("fails closed without coverage access for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValueOnce(tenantSession);

    const node = await CoveragePage({ searchParams: { run: "foreign-run" } });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Coverage temporarily unavailable");
    expect(text).toContain("No source, worker, or queue data was requested");
    expect(text).not.toContain("foreign-run");
    expect(text).not.toContain(TENANT_SESSION.tenantId);
    expect(tenantAuthorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getSelectedOrDefaultVisibleCrawlRun).not.toHaveBeenCalled();
  });

  it("normalizes resolver and permission failures before rendering the shell", async () => {
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("sensitive resolver detail"));

    let node = await CoveragePage({ searchParams: { run: "foreign-run" } });
    let text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("Coverage temporarily unavailable");
    expect(text).not.toContain("sensitive resolver detail");
    expect(tenantAuthorizationMocks.assertTenantPermission).not.toHaveBeenCalled();

    authMocks.getTenantSession.mockResolvedValueOnce(TENANT_SESSION);
    tenantAuthorizationMocks.assertTenantPermission.mockRejectedValueOnce(new Error("sensitive policy detail"));
    node = await CoveragePage({ searchParams: { run: "foreign-run" } });
    text = renderToStaticMarkup(node as React.ReactElement);
    expect(text).toContain("Coverage temporarily unavailable");
    expect(text).not.toContain("sensitive policy detail");
    expect(text).not.toContain("foreign-run");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getSelectedOrDefaultVisibleCrawlRun).not.toHaveBeenCalled();
  });
});
