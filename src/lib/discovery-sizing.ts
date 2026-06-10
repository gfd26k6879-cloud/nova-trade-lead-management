import type { Settings } from "@/lib/db/queries";
import {
  estimateMarginalSkuCost,
  inferTextSearchSkuFromFieldMask,
  type GooglePlacesSku,
} from "@/lib/google-pricing";
import {
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_PRO_FIELD_MASK,
} from "@/lib/google-places";

export type DiscoveryMode = "coverage_probe" | "lead_harvest";
export type PaginationPolicy = "first_page_only" | "auto_yield_based" | "manual_extra_pages";
export type DiscoveryCapSource = "test_run" | "text_search_monthly" | "enterprise_monthly" | "uncapped";

export interface DiscoverySizeEstimate {
  mode: DiscoveryMode;
  paginationPolicy: PaginationPolicy;
  selectedCells: number;
  selectedCategories: number;
  estimatedUnits: number;
  estimatedSearchCalls: number;
  estimatedMaxRawPlaces: number;
  sku: GooglePlacesSku;
  testRun: boolean;
  maxPages: number;
  warnings: string[];
  blockingReasons: string[];
  canStart: boolean;
  estimatedDurationSeconds: number;
  searchRadiusKm: number;
  monthlyBillableEventsForSku: number;
  safeMonthlyCallCap: number | null;
  remainingMonthlyCallCap: number | null;
  estimatedMarginalCostUsd: number;
  estimatedUnitCostUsd: number;
  capSource: DiscoveryCapSource;
}

export interface DiscoverySizeInput {
  cellCount: number;
  categoryCount: number;
  mode?: string | null;
  paginationPolicy?: string | null;
  testRun?: boolean;
  monthlyBillableEventsForSku?: number;
  searchCallCountOverride?: number;
  settings: Settings;
}

export const DEFAULT_AUTO_PAGINATION_MIN_NEW_CANDIDATES = 6;
export const DEFAULT_AUTO_PAGINATION_MAX_DUPLICATE_RATE = 0.6;
export const MAX_TEXT_SEARCH_PAGES = 3;
export const TEXT_SEARCH_PAGE_SIZE = 20;

export function normalizeDiscoveryMode(value: unknown, fallback: DiscoveryMode = "coverage_probe"): DiscoveryMode {
  return value === "lead_harvest" || value === "coverage_probe" ? value : fallback;
}

export function normalizePaginationPolicy(value: unknown, fallback: PaginationPolicy = "auto_yield_based"): PaginationPolicy {
  if (value === "first_page_only" || value === "auto_yield_based" || value === "manual_extra_pages") return value;
  return fallback;
}

export function getTextSearchFieldMaskForDiscoveryMode(mode: DiscoveryMode): string {
  return mode === "coverage_probe" ? TEXT_SEARCH_PRO_FIELD_MASK : TEXT_SEARCH_FIELD_MASK;
}

export function getTextSearchSkuForDiscoveryMode(mode: DiscoveryMode): GooglePlacesSku {
  return inferTextSearchSkuFromFieldMask(getTextSearchFieldMaskForDiscoveryMode(mode));
}

function getDiscoveryCap(input: {
  sku: GooglePlacesSku;
  testRun: boolean;
  settings: Settings;
}): { capSource: DiscoveryCapSource; safeMonthlyCallCap: number | null } {
  if (input.testRun) {
    return {
      capSource: "test_run",
      safeMonthlyCallCap: Math.max(1, Math.floor(input.settings.google_test_run_call_cap ?? 50)),
    };
  }
  if (input.sku === "places_text_search_pro") {
    return {
      capSource: "text_search_monthly",
      safeMonthlyCallCap: Math.max(1, Math.floor(input.settings.google_text_search_monthly_cap ?? 4900)),
    };
  }
  if (
    input.sku === "places_text_search_enterprise"
    || input.sku === "places_text_search_enterprise_plus_atmosphere"
  ) {
    return {
      capSource: "enterprise_monthly",
      safeMonthlyCallCap: Math.max(1, Math.floor(input.settings.google_enterprise_monthly_cap ?? 900)),
    };
  }
  return { capSource: "uncapped", safeMonthlyCallCap: null };
}

export function estimateDiscoveryRunSize(input: DiscoverySizeInput): DiscoverySizeEstimate {
  const mode = normalizeDiscoveryMode(input.mode, input.settings.google_default_discovery_mode);
  const paginationPolicy = normalizePaginationPolicy(input.paginationPolicy, input.settings.google_default_pagination_policy);
  const selectedCells = Math.max(0, Math.floor(input.cellCount));
  const selectedCategories = Math.max(0, Math.floor(input.categoryCount));
  const estimatedUnits = selectedCells * selectedCategories;
  const maxPages = paginationPolicy === "first_page_only" ? 1 : MAX_TEXT_SEARCH_PAGES;
  const estimatedSearchCalls = Math.max(
    0,
    Math.floor(input.searchCallCountOverride ?? (estimatedUnits * maxPages)),
  );
  const sku = getTextSearchSkuForDiscoveryMode(mode);
  const warnings: string[] = [];
  const blockingReasons: string[] = [];
  const testRun = Boolean(input.testRun);
  const monthlyBillableEventsForSku = Math.max(0, Math.floor(input.monthlyBillableEventsForSku ?? 0));
  const { capSource, safeMonthlyCallCap } = getDiscoveryCap({ sku, testRun, settings: input.settings });
  const remainingMonthlyCallCap = safeMonthlyCallCap === null
    ? null
    : Math.max(0, safeMonthlyCallCap - monthlyBillableEventsForSku);
  const marginalCost = estimateMarginalSkuCost(sku, monthlyBillableEventsForSku, estimatedSearchCalls);
  const searchRadiusKm = Math.max(0, Number(input.settings.search_radius_km ?? 0));
  const rateLimitMs = Math.max(0, Math.floor(input.settings.rate_limit_ms ?? 0));

  if (selectedCells === 0) blockingReasons.push("Select at least one postal/postcode cell.");
  if (selectedCategories === 0) blockingReasons.push("Select at least one category.");
  if (remainingMonthlyCallCap !== null && estimatedSearchCalls > remainingMonthlyCallCap) {
    blockingReasons.push(`This run needs ${estimatedSearchCalls.toLocaleString()} Google Text Search calls, but only ${remainingMonthlyCallCap.toLocaleString()} remain under the ${capSource.replace(/_/g, " ")} cap.`);
  }
  if (
    remainingMonthlyCallCap !== null
    && blockingReasons.length === 0
    && estimatedSearchCalls > 0
    && estimatedSearchCalls >= Math.floor(remainingMonthlyCallCap * 0.8)
  ) {
    warnings.push(`This run will use most of the remaining ${capSource.replace(/_/g, " ")} cap.`);
  }

  return {
    mode,
    paginationPolicy,
    selectedCells,
    selectedCategories,
    estimatedUnits,
    estimatedSearchCalls,
    estimatedMaxRawPlaces: estimatedSearchCalls * TEXT_SEARCH_PAGE_SIZE,
    sku,
    testRun,
    maxPages,
    warnings,
    blockingReasons,
    canStart: blockingReasons.length === 0,
    estimatedDurationSeconds: Math.ceil((estimatedSearchCalls * rateLimitMs) / 1000),
    searchRadiusKm,
    monthlyBillableEventsForSku,
    safeMonthlyCallCap,
    remainingMonthlyCallCap,
    estimatedMarginalCostUsd: marginalCost.estimatedCost,
    estimatedUnitCostUsd: marginalCost.estimatedUnitPrice,
    capSource,
  };
}

export function shouldFetchNextTextSearchPage(input: {
  policy: PaginationPolicy;
  pagesFetched: number;
  maxPages: number;
  nextPageToken: string | null | undefined;
  rawPlaces: number;
  newPlaces: number;
  duplicatePlaces: number;
  minNewCandidates?: number;
  maxDuplicateRate?: number;
}): boolean {
  if (!input.nextPageToken) return false;
  if (input.policy === "first_page_only") return false;
  if (input.policy === "manual_extra_pages") return input.pagesFetched < input.maxPages;
  if (input.pagesFetched >= input.maxPages) return false;
  const minNew = Math.max(1, Math.floor(input.minNewCandidates ?? DEFAULT_AUTO_PAGINATION_MIN_NEW_CANDIDATES));
  const duplicateRate = input.rawPlaces > 0 ? input.duplicatePlaces / input.rawPlaces : 1;
  const maxDuplicateRate = Math.max(0, Math.min(1, input.maxDuplicateRate ?? DEFAULT_AUTO_PAGINATION_MAX_DUPLICATE_RATE));
  return input.newPlaces >= minNew && duplicateRate <= maxDuplicateRate;
}
