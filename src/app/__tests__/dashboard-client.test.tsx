import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crawl/actions", () => ({
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

import { DashboardClient } from "@/app/(protected)/dashboard/dashboard-client";
import {
  emptyAdminFulfillmentSummary,
  emptyDashboardStats,
  emptyStatisticsSummary,
  emptyTeamBoardSummary,
} from "@/lib/dashboard-fallbacks";

describe("DashboardClient admin command center", () => {
  it("puts lead inventory and discovery controls on the default surface", () => {
    const html = renderToStaticMarkup(
      <DashboardClient
        initialStats={{ ...emptyDashboardStats(""), lastError: null, leadsTotal: 40, leadsToday: 3 }}
        teamSummary={{ ...emptyTeamBoardSummary(), unassignedReady: 23 }}
        weeklyStats={emptyStatisticsSummary()}
        fulfillmentSummary={{ ...emptyAdminFulfillmentSummary(), openTotal: 2, openWebsiteRequests: 1, openQuoteRequests: 1 }}
      />,
    );

    expect(html).toContain("Admin Command Center");
    expect(html).toContain("Lead Inventory");
    expect(html).toContain("Start Discovery");
    expect(html).toContain("Recent Discovery Items");
    expect(html).toContain("Fulfillment");
    expect(html).toContain("Advanced Operations");
    expect(html).not.toContain("Discovery Workflow");
    expect(html).not.toContain("Quick Actions");
  });
});
