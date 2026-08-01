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
  getLeads: vi.fn(),
  getScoreBandThresholds: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/explore/explore-client", () => ({
  ExploreClient: () => React.createElement("div", null, "Explore loaded"),
}));

import ExplorePage from "@/app/(protected)/explore/page";

describe("ExplorePage", () => {
  it("renders a retryable unavailable state when lead loading times out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(timeout);

    const node = await ExplorePage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Lead Explorer is taking too long to load.");
    expect(text).toContain("Retry Explore");
    expect(text).toContain("Go to Workbench");
    expect(text).toContain("Open All Leads");
    expect(text).toContain("db_statement_timeout");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("renders lead explorer when the timeout-wrapped read succeeds", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
    queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
    queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());

    const node = await ExplorePage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Explore loaded");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("passes only constrained active inventory filters to researcher Explore reads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", email: "one@example.com", role: "researcher" });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
    queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
    queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());

    await ExplorePage({
      searchParams: Promise.resolve({
        archived: "all",
        assigned: "me",
        includeExcluded: "true",
        mode: "directory",
        status: "excluded",
      }),
    });

    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      assignedToUserId: undefined,
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }));
    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }));
  });
});
