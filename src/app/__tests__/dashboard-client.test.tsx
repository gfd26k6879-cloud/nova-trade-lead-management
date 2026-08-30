import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const crawlActionMocks = vi.hoisted(() => ({
  estimateDiscoveryRunAction: vi.fn(),
  getDashboardAnalyticsAction: vi.fn(),
  getDashboardStatsAction: vi.fn(),
  getDashboardSummaryPanelsAction: vi.fn(),
  getDiscoveryItemsAction: vi.fn(),
  pauseCrawlRunAction: vi.fn(),
  resumeCrawlRunAction: vi.fn(),
  retryFailedUnitsAction: vi.fn(),
  startCrawlRunAction: vi.fn(),
  stopCrawlRunAction: vi.fn(),
}));

vi.mock("@/lib/crawl/actions", () => crawlActionMocks);

vi.mock("@/lib/leads/actions", () => ({
  queueMissingAiVerificationsAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  DashboardClient,
  estimateDashboardDiscovery,
  pauseDashboardDiscovery,
  startDashboardDiscovery,
} from "@/app/(protected)/dashboard/dashboard-client";
import {
  emptyAdminFulfillmentSummary,
  emptyDashboardStats,
  emptyStatisticsSummary,
  emptyTeamBoardSummary,
} from "@/lib/dashboard-fallbacks";

describe("DashboardClient admin command center", () => {
  it("passes the selected concrete workspace to start and control actions", async () => {
    const workspace = {
      tenantId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "20000000-0000-4000-8000-000000000001",
      name: "Primary workspace",
    };
    const payload = ["dentist"];
    const estimatePayload = {
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe" as const,
      paginationPolicy: "first_page_only" as const,
      testRun: true,
    };

    await startDashboardDiscovery(payload, workspace);
    await estimateDashboardDiscovery(estimatePayload, workspace);
    await pauseDashboardDiscovery("run-1", workspace);

    expect(crawlActionMocks.startCrawlRunAction).toHaveBeenCalledWith(payload, workspace);
    expect(crawlActionMocks.estimateDiscoveryRunAction).toHaveBeenCalledWith(estimatePayload, workspace);
    expect(crawlActionMocks.pauseCrawlRunAction).toHaveBeenCalledWith("run-1", workspace);
  });

  it("puts lead inventory and discovery controls on the default surface", () => {
    const html = renderToStaticMarkup(
      <DashboardClient
        initialStats={{ ...emptyDashboardStats(""), lastError: null, leadsTotal: 40, leadsToday: 3 }}
        teamSummary={{ ...emptyTeamBoardSummary(), unassignedReady: 23 }}
        weeklyStats={emptyStatisticsSummary()}
        fulfillmentSummary={{ ...emptyAdminFulfillmentSummary(), openTotal: 2, openWebsiteRequests: 1, openQuoteRequests: 1 }}
        crawlWorkspaces={[{
          tenantId: "10000000-0000-4000-8000-000000000001",
          workspaceId: "20000000-0000-4000-8000-000000000001",
          name: "Primary workspace",
        }]}
      />,
    );

    expect(html).toContain("Admin Command Center");
    expect(html).toContain("Lead Inventory");
    expect(html).toContain("Start Discovery");
    expect(html).toContain("Discovery workspace");
    expect(html).toContain("Primary workspace");
    expect(html).toContain("Postal / postcode search");
    expect(html).toContain("Run scope");
    expect(html).toContain("Test capped run");
    expect(html).toContain("Dentists");
    expect(html).toContain("All categories");
    expect(html).toContain("Discovery is waiting for:");
    expect(html).toContain("Choose at least one category");
    expect(html).toContain("Choose at least one postal/postcode cell");
    expect(html).toContain("Recent Discovery Items");
    expect(html).toContain("Fulfillment");
    expect(html).toContain("Advanced Operations");
    expect(html).toContain("0 selected");
    expect(html).not.toContain("Discovery Workflow");
    expect(html).not.toContain("Quick Actions");
    expect(html).not.toContain("Use test run preset");
    expect(html).not.toContain("Manual extra pages");
    expect(html).not.toContain("Auto yield-based");
  });
});
