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
  getCrawlProgress: vi.fn(),
  getCrawlUnitPreview: vi.fn(),
  getSelectedOrDefaultVisibleCrawlRun: vi.fn(),
  listDiscoveryItems: vi.fn(),
  getLocationCellCoverage: vi.fn(),
  getMarketCoverageSummary: vi.fn(),
  getRunGeographyProgress: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/coverage/coverage-client", () => ({
  CoverageClient: () => React.createElement("div", null, "Coverage shell loaded"),
}));

import CoveragePage from "@/app/(protected)/coverage/page";

describe("CoveragePage", () => {
  it("renders a fast shell without running heavy coverage reads during SSR", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });

    const node = await CoveragePage({ searchParams: { run: "run-1" } });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Coverage shell loaded");
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
});
