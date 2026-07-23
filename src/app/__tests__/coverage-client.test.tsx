import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/crawl/actions", () => ({
  getCoverageCellLedgerAction: vi.fn(),
  getCoverageDiscoveryItemListAction: vi.fn(),
  getCoverageMarketSummaryAction: vi.fn(),
  getCoverageProbeCandidatesAction: vi.fn(),
  getCoverageRunProgressAction: vi.fn(),
  getCoverageSelectedRunAction: vi.fn(),
  getCoverageUnitPreviewAction: vi.fn(),
  getFailedUnitErrorsAction: vi.fn(),
  pauseCrawlRunAction: vi.fn(),
  promoteProbeToLeadHarvestAction: vi.fn(),
  resumeRecommendedSchedulerWorkersAction: vi.fn(),
  resumeCrawlRunAction: vi.fn(),
  runGoogleDiscoveryDiagnosticAction: vi.fn(),
  retryFailedUnitsAction: vi.fn(),
  stopCrawlRunAction: vi.fn(),
}));

vi.mock("@/lib/leads/actions", () => ({
  refreshStaleUnitsAction: vi.fn(),
}));

import { CoverageClient } from "@/app/(protected)/coverage/coverage-client";

const baseRun = {
  id: "run-1",
  name: "London plumbers discovery",
  scope_label: "London / GB",
  status: "running",
  discoveryMode: "coverage_probe" as const,
  started_at: "2026-06-10T00:00:00.000Z",
  created_at: "2026-06-10T00:00:00.000Z",
  ended_at: null,
  categories: ["plumber"],
  discovered_count: 0,
  api_calls_used: 1,
  last_error: null,
  blocked_reason: null,
  blocked_at: null,
  blocked_error_code: null,
  market_id: "market-london",
};

const baseProgress = {
  total: 2,
  done: 0,
  failed: 0,
  retryWait: 0,
  pending: 2,
  running: 0,
  canceled: 0,
};

const retryUnit = {
  id: "unit-1",
  status: "retry_wait",
  zip: "NW9",
  market_id: "market-london",
  location_cell_id: "cell-london-nw9",
  country_code: "GB" as const,
  query_location_label: "London NW9, United Kingdom",
  city: "London",
  county: null,
  category: "plumber",
  attempt_count: 1,
  discovered_count: 0,
  started_at: null,
  finished_at: "2026-06-10T00:01:00.000Z",
  last_error: "Google Places returned 429.",
  next_page_token: null,
  next_retry_at: "2026-06-10T00:03:00.000Z",
  max_pages: 3,
  max_attempts: 3,
  pages_fetched: 0,
  raw_places_seen: 0,
  new_places_seen: 0,
  duplicate_places_seen: 0,
  budget_blocked_at: null,
  last_error_code: "google_rate_limited",
  created_at: "2026-06-10T00:00:00.000Z",
};

function renderCoverage(overrides: Partial<React.ComponentProps<typeof CoverageClient>> = {}) {
  return renderToStaticMarkup(
    <CoverageClient
      selectedRunId="run-1"
      markets={[]}
      cells={[]}
      discoveryItems={[]}
      loadWarnings={[]}
      run={baseRun}
      progress={baseProgress}
      crawlWorker={{ enabled: true, googlePlacesKeyConfigured: true, googlePlacesKeySource: "env" }}
      geography={null}
      unitPreview={[]}
      {...overrides}
    />,
  );
}

describe("CoverageClient discovery monitor", () => {
  it("renders blocked runs with exact cause and safe actions", () => {
    const html = renderCoverage({
      run: {
        ...baseRun,
        status: "blocked",
        blocked_reason: "Google Places permission denied. Check the production Google Places API key.",
        blocked_at: "2026-06-10T00:02:00.000Z",
        blocked_error_code: "google_permission_denied",
        last_error: "Google Places permission denied. Check the production Google Places API key.",
      },
      progress: { ...baseProgress, failed: 1, pending: 1 },
    });

    expect(html).toContain("Blocked");
    expect(html).toContain("Google Places permission denied");
    expect(html).toContain("Error code: google_permission_denied");
    expect(html).toContain("Run Google diagnostic");
    expect(html).toContain("Resume after fix");
    expect(html).not.toContain("Pause Discovery");
  });

  it("renders scheduler-off and retry-wait state clearly", () => {
    const html = renderCoverage({
      progress: { ...baseProgress, retryWait: 1, pending: 1 },
      crawlWorker: { enabled: false, googlePlacesKeyConfigured: true, googlePlacesKeySource: "ui" },
      unitPreview: [retryUnit],
    });

    expect(html).toContain("Waiting for worker");
    expect(html).toContain("crawl scheduler is paused");
    expect(html).toContain("Google key source: Settings UI stored");
    expect(html).toContain("Enable recommended workers");
    expect(html).toContain("Retrying later");
    expect(html).toContain("google_rate_limited");
    expect(html).toContain("1/3");
  });
});
