import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const crawlActionMocks = vi.hoisted(() => ({
  getDashboardStatsAction: vi.fn(),
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
    ai: {
      dailyCost: 0,
      dailyBudget: 0,
      monthlyCost: 0,
      monthlyBudget: 0,
      budgetRemainingToday: 0,
      budgetRemainingMonth: 0,
      verifiedLeadsPerDollar: null,
      readyToCallLeadsPerDollar: null,
    },
    database: { staleClientReads: [] },
    auth: {
      appUrlConfigured: true,
      supabaseUrlConfigured: true,
      callbackUrl: "https://lead-generation-orcin.vercel.app/auth/callback",
      warnings: [],
    },
  })),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/crawl/actions", () => crawlActionMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/dashboard/dashboard-client", () => ({
  DashboardClient: () => React.createElement("div", null, "Dashboard loaded"),
}));

import DashboardPage from "@/app/(protected)/dashboard/page";

describe("DashboardPage", () => {
  it("renders core dashboard shell when the initial stats read times out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });

    const node = await DashboardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Dashboard loaded");
    expect(crawlActionMocks.getDashboardStatsAction).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
  });
});
