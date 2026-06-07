import { describe, expect, it } from "vitest";
import {
  estimateDiscoveryRunSize,
  shouldFetchNextTextSearchPage,
  type DiscoverySizeInput,
} from "@/lib/discovery-sizing";
import type { Settings } from "@/lib/db/queries";

const settings = {
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
    expect(result.canStart).toBe(true);
  });

  it("estimates max possible calls for auto-yield pagination", () => {
    const result = estimate({ paginationPolicy: "auto_yield_based" });
    expect(result.maxPages).toBe(3);
    expect(result.estimatedSearchCalls).toBe(150);
  });

  it("does not block large estimates on app-side caps", () => {
    const result = estimate({ cellCount: 100, categoryCount: 10, paginationPolicy: "auto_yield_based" });
    expect(result.estimatedSearchCalls).toBe(3000);
    expect(result.canStart).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("keeps test-run selection as metadata without capping the estimate", () => {
    const result = estimate({ testRun: true, paginationPolicy: "auto_yield_based" });
    expect(result.testRun).toBe(true);
    expect(result.estimatedSearchCalls).toBe(150);
    expect(result.canStart).toBe(true);
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
