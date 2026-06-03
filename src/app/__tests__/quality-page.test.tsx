import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getBusinessTypeCounts: vi.fn(),
  getQualityLeads: vi.fn(),
  getQualitySummary: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/quality/quality-client", () => ({
  QualityClient: () => React.createElement("div", null, "Quality loaded"),
}));

import QualityPage from "@/app/(protected)/quality/page";

describe("QualityPage", () => {
  it("renders a retryable fallback when quality reads time out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
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
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getQualitySummary.mockResolvedValue({
      readyToCall: 0,
      aiVerifiedNoWebsite: 0,
      brokenSiteOpportunities: 0,
      estimatedPipelineValue: 0,
      needsAiVerify: 0,
    });
    queryMocks.getQualityLeads.mockResolvedValue({ leads: [], total: 0 });
    queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());

    const node = await QualityPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Quality loaded");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });
});
