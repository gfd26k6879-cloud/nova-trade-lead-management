import { describe, expect, it } from "vitest";
import {
  estimateDiscoveryRunBudget,
  shouldFetchNextTextSearchPage,
  type DiscoveryBudgetInput,
} from "@/lib/discovery-budget";
import type { Settings } from "@/lib/db/queries";

const settings = {
  max_calls_per_day: 300,
  max_calls_per_run: 500,
  google_text_search_monthly_cap: 4900,
  google_enterprise_monthly_cap: 900,
  google_test_run_call_cap: 50,
  google_auto_pagination_enabled: true,
  google_auto_pagination_min_new_candidates: 6,
  google_auto_pagination_max_duplicate_rate: 0.6,
  google_default_discovery_mode: "coverage_probe",
  google_default_pagination_policy: "auto_yield_based",
} as Settings;

function estimate(overrides: Partial<DiscoveryBudgetInput> = {}) {
  return estimateDiscoveryRunBudget({
    cellCount: 10,
    categoryCount: 5,
    mode: "coverage_probe",
    paginationPolicy: "first_page_only",
    testRun: false,
    settings,
    monthlyUsedForSku: 0,
    todayCalls: 0,
    runCalls: 0,
    ...overrides,
  });
}

describe("discovery budget estimator", () => {
  it("estimates one call per cell/category for first-page discovery", () => {
    const result = estimate();
    expect(result.estimatedUnits).toBe(50);
    expect(result.estimatedSearchCalls).toBe(50);
    expect(result.estimatedMaxRawPlaces).toBe(1000);
    expect(result.sku).toBe("places_text_search_pro");
    expect(result.canStart).toBe(true);
  });

  it("estimates max possible calls for auto-yield pagination", () => {
    const result = estimate({ paginationPolicy: "auto_yield_based" });
    expect(result.maxPages).toBe(3);
    expect(result.estimatedSearchCalls).toBe(150);
  });

  it("blocks runs that exceed monthly remaining cap", () => {
    const result = estimate({ monthlyUsedForSku: 4890, paginationPolicy: "auto_yield_based" });
    expect(result.canStart).toBe(false);
    expect(result.warnings.join(" ")).toContain("monthly free-safe cap");
  });

  it("uses the stricter test-run cap", () => {
    const result = estimate({ testRun: true, paginationPolicy: "auto_yield_based" });
    expect(result.runCap).toBe(50);
    expect(result.canStart).toBe(false);
  });

  it("allows next page only when yield is strong enough", () => {
    expect(shouldFetchNextTextSearchPage({
      policy: "auto_yield_based",
      pagesFetched: 1,
      maxPages: 3,
      nextPageToken: "token",
      rawPlaces: 20,
      newPlaces: 6,
      duplicatePlaces: 5,
    })).toBe(true);

    expect(shouldFetchNextTextSearchPage({
      policy: "auto_yield_based",
      pagesFetched: 1,
      maxPages: 3,
      nextPageToken: "token",
      rawPlaces: 20,
      newPlaces: 3,
      duplicatePlaces: 1,
    })).toBe(false);
  });
});
