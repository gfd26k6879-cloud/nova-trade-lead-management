import { describe, expect, it } from "vitest";
import {
  estimateDiscoveryRunSize,
  shouldFetchNextTextSearchPage,
  type DiscoverySizeInput,
} from "@/lib/discovery-sizing";
import type { Settings } from "@/lib/db/queries";

const settings = {
  rate_limit_ms: 1000,
  search_radius_km: 8,
  google_text_search_monthly_cap: 4900,
  google_enterprise_monthly_cap: 900,
  google_test_run_call_cap: 50,
  google_auto_pagination_enabled: true,
  google_auto_pagination_min_new_candidates: 6,
  google_auto_pagination_max_duplicate_rate: 0.6,
  google_default_discovery_mode: "coverage_probe",
  google_default_pagination_policy: "auto_yield_based",
} as Settings;

function estimate(overrides: Partial<DiscoverySizeInput> = {}) {
  return estimateDiscoveryRunSize({
    cellCount: 10,
    categoryCount: 5,
    mode: "coverage_probe",
    paginationPolicy: "first_page_only",
    testRun: false,
    settings,
    ...overrides,
  });
}

describe("discovery size estimator", () => {
  it("estimates one call per cell/category for first-page discovery", () => {
    const result = estimate();
    expect(result.estimatedUnits).toBe(50);
    expect(result.estimatedSearchCalls).toBe(50);
    expect(result.estimatedMaxRawPlaces).toBe(1000);
    expect(result.sku).toBe("places_text_search_pro");
    expect(result.capSource).toBe("text_search_monthly");
    expect(result.remainingMonthlyCallCap).toBe(4900);
    expect(result.estimatedDurationSeconds).toBe(50);
    expect(result.searchRadiusKm).toBe(8);
    expect(result.blockingReasons).toEqual([]);
    expect(result.canStart).toBe(true);
  });

  it("estimates max possible calls for auto-yield pagination", () => {
    const result = estimate({ paginationPolicy: "auto_yield_based" });
    expect(result.maxPages).toBe(3);
    expect(result.estimatedSearchCalls).toBe(150);
  });

  it("blocks large estimates when the monthly Text Search cap would be exceeded", () => {
    const result = estimate({
      cellCount: 100,
      categoryCount: 10,
      paginationPolicy: "auto_yield_based",
      monthlyBillableEventsForSku: 4800,
    });
    expect(result.estimatedSearchCalls).toBe(3000);
    expect(result.remainingMonthlyCallCap).toBe(100);
    expect(result.canStart).toBe(false);
    expect(result.blockingReasons[0]).toContain("3,000 Google Text Search calls");
  });

  it("uses the test-run cap when test mode is selected", () => {
    const result = estimate({ testRun: true, paginationPolicy: "auto_yield_based" });
    expect(result.testRun).toBe(true);
    expect(result.estimatedSearchCalls).toBe(150);
    expect(result.capSource).toBe("test_run");
    expect(result.remainingMonthlyCallCap).toBe(50);
    expect(result.canStart).toBe(false);
  });

  it("subtracts current usage from the test-run cap", () => {
    const result = estimate({
      testRun: true,
      paginationPolicy: "first_page_only",
      monthlyBillableEventsForSku: 49,
    });
    expect(result.capSource).toBe("test_run");
    expect(result.estimatedSearchCalls).toBe(50);
    expect(result.remainingMonthlyCallCap).toBe(1);
    expect(result.canStart).toBe(false);
    expect(result.blockingReasons[0]).toContain("only 1 remain");
  });

  it("computes marginal cost once the free monthly tier is exhausted", () => {
    const result = estimate({
      monthlyBillableEventsForSku: 5000,
      paginationPolicy: "first_page_only",
    });
    expect(result.estimatedSearchCalls).toBe(50);
    expect(result.estimatedMarginalCostUsd).toBeCloseTo(1.6, 4);
    expect(result.estimatedUnitCostUsd).toBeCloseTo(0.032, 4);
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
