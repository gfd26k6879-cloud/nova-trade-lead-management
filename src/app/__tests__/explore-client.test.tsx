import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/lib/leads/actions", () => ({
  claimLeadAction: vi.fn(),
}));

import { ExploreClient } from "@/app/(protected)/explore/explore-client";

function renderExplore(role: "admin" | "researcher" = "admin") {
  return renderToStaticMarkup(
    <ExploreClient
      leads={[]}
      total={0}
      mapPoints={[]}
      totalMapped={0}
      mapPointLimit={200}
      zipCoverage={[]}
      filters={{ mode: "work_ready", sortBy: "opportunity", view: "cards", archived: "active", includeExcluded: false }}
      scoreThresholds={{ high: 20, medium: 10 }}
      businessTypeCounts={[{ id: "dental", label: "Dental", total: 3, active: 2 }]}
      currentUser={{ userId: "user-1", email: "user@example.com", role }}
      googleMapsApiKey={null}
    />,
  );
}

describe("ExploreClient search surface", () => {
  it("renders one Lead Finder surface instead of the old filter rows", () => {
    currentParams = new URLSearchParams();
    const html = renderExplore();

    expect(html).toContain("Lead Finder");
    expect(html).toContain("Scope: Work-ready");
    expect(html).toContain("Builder");
    expect(html).not.toContain("Command search");
    expect(html).not.toContain("Quick views");
    expect(html).not.toContain("Active filters");
    expect(html).not.toContain("Advanced filters");
    expect(html).not.toContain("Apply command");
  });

  it("renders active URL filters as search chips without presentation chips", () => {
    currentParams = new URLSearchParams("city=toronto&websiteStatus=none&sortBy=website_need&view=table");
    const html = renderExplore();

    expect(html).toContain("City: Toronto");
    expect(html).toContain("Website: None");
    expect(html).not.toContain("Sort: Website Need");
    expect(html).not.toContain("View: Table");
  });

  it("keeps Add Lead admin-only", () => {
    currentParams = new URLSearchParams();

    expect(renderExplore("admin")).toContain("Add Lead");
    expect(renderExplore("researcher")).not.toContain("Add Lead");
  });

  it("keeps discovery launch links admin-only in the empty state", () => {
    currentParams = new URLSearchParams("city=nowhere");

    const adminHtml = renderExplore("admin");
    const researcherHtml = renderExplore("researcher");

    expect(adminHtml).toContain("Start discovery / harvest");
    expect(researcherHtml).not.toContain("Start discovery / harvest");
    expect(researcherHtml).toContain("Ask an admin to harvest this market");
  });
});
