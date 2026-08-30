import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn(async (_session, _correlationId, callback) => callback()),
  withTenantDbContext: vi.fn(async (callback) => callback({})),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withTenantDbContext: tenantContextMocks.withTenantDbContext,
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getBusinessTypeCounts: vi.fn(),
  getLocationCells: vi.fn(),
  getQualityLeads: vi.fn(),
  getQualitySummary: vi.fn(),
  listLocationMarkets: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tenancy/context")>();
  return { ...original, runWithTenantContext: tenantContextMocks.runWithTenantContext };
});
vi.mock("@/app/(protected)/quality/quality-client", () => ({
  QualityClient: () => React.createElement("div", null, "Quality loaded"),
}));

import QualityPage from "@/app/(protected)/quality/page";

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

describe("QualityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    tenantContextMocks.runWithTenantContext.mockImplementation(async (_session, _correlationId, callback) => callback());
    tenantContextMocks.withTenantDbContext.mockImplementation(async (callback) => callback({}));
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
  });

  it("renders a retryable fallback when quality reads time out", async () => {
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(timeout);

    const node = await QualityPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Quality is taking too long to load.");
    expect(text).toContain("Retry Quality");
    expect(text).toContain("Open Dashboard");
    expect(text).toContain("db_statement_timeout");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("renders quality workspace when the timeout-wrapped read succeeds", async () => {
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getQualitySummary.mockResolvedValue({
      readyToCall: 0,
      aiVerifiedNoWebsite: 0,
      brokenSiteOpportunities: 0,
      estimatedPipelineValue: 0,
      needsAiVerify: 0,
      needsManualReview: 0,
      removedBecauseWebsiteFound: 0,
      averageQualityScore: 0,
    });
    queryMocks.getQualityLeads.mockResolvedValue({ leads: [], total: 0 });
    queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
    queryMocks.listLocationMarkets.mockResolvedValue([]);
    queryMocks.getLocationCells.mockResolvedValue([]);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());

    const node = await QualityPage({ searchParams: Promise.resolve({ countryCode: "CA", marketId: "market-london-ca", locationCellId: "cell-ca-london-on-n6h" }) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Quality loaded");
    expect(queryMocks.getQualitySummary).toHaveBeenCalledWith(expect.objectContaining({
      countryCode: "CA",
      marketId: "market-london-ca",
      locationCellId: "cell-ca-london-on-n6h",
      denverOnly: false,
    }));
    expect(queryMocks.getLocationCells).toHaveBeenCalledWith("market-london-ca");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^quality-page:/),
      expect.any(Function),
    );
    expect(tenantContextMocks.withTenantDbContext).toHaveBeenCalledOnce();
  });

  it("fails closed before database access when canonical and legacy identities differ", async () => {
    authMocks.getTenantSession.mockResolvedValue({ ...TENANT_SESSION, userId: "other-user" });

    const node = await QualityPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(tenantContextMocks.withTenantDbContext).not.toHaveBeenCalled();
  });

  it("fails closed before database access for workspace-scoped sessions", async () => {
    authMocks.getTenantSession.mockResolvedValue({
      ...TENANT_SESSION,
      workspaceId: "20000000-0000-4000-8000-000000000001",
    });

    const node = await QualityPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(queryMocks.getBusinessTypeCounts).not.toHaveBeenCalled();
  });
});
