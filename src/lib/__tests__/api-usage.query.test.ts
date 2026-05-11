import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

import {
  API_ENDPOINT_PLACE_DETAILS,
  API_ENDPOINT_TEXT_SEARCH,
  backfillPlacesMasterFromLeads,
  getCanonicalPlacesForExport,
  getMonthlyApiUsageSummary,
  getRunApiUsageSummary,
  logApiUsageEvent,
} from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("api usage metering queries", () => {
  it("applies free-cap billing only after threshold", async () => {
    for (let idx = 0; idx < 1000; idx++) {
      await logApiUsageEvent({
        endpoint: API_ENDPOINT_TEXT_SEARCH,
        sku: "places_text_search_enterprise",
      });
    }

    const thresholdEvent = await logApiUsageEvent({
      endpoint: API_ENDPOINT_TEXT_SEARCH,
      sku: "places_text_search_enterprise",
    });

    expect(thresholdEvent.estimatedCost).toBeCloseTo(0.035, 4);
    expect(thresholdEvent.estimatedUnitPrice).toBeCloseTo(0.035, 4);

    const monthly = await getMonthlyApiUsageSummary();
    expect(monthly.totalCalls).toBe(1001);
    expect(monthly.totalCost).toBeCloseTo(0.04, 2);
  });

  it("ignores cached usage events from billing totals", async () => {
    const cached = await logApiUsageEvent({
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: "places_place_details_enterprise_plus_atmosphere",
      was_cached: true,
    });

    expect(cached.estimatedCost).toBe(0);
    expect(cached.estimatedUnitPrice).toBe(0);

    const monthly = await getMonthlyApiUsageSummary();
    expect(monthly.totalCalls).toBe(0);
    expect(monthly.totalCost).toBe(0);
  });

  it("returns run-level discovery/enrichment call breakdown", async () => {
    const runId = "run-1";
    await logApiUsageEvent({
      crawl_run_id: runId,
      endpoint: API_ENDPOINT_TEXT_SEARCH,
      sku: "places_text_search_enterprise",
    });
    await logApiUsageEvent({
      crawl_run_id: runId,
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: "places_place_details_enterprise",
    });
    await logApiUsageEvent({
      crawl_run_id: runId,
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: "places_place_details_enterprise_plus_atmosphere",
    });

    const summary = await getRunApiUsageSummary(runId);
    expect(summary.totalCalls).toBe(3);
    expect(summary.discoveryCalls).toBe(1);
    expect(summary.enrichmentCalls).toBe(2);
    expect(summary.atmosphereCalls).toBe(1);
  });
});

describe("canonical backfill", () => {
  it("backfills places_master from existing leads", async () => {
    testDb.prepare(
      `INSERT INTO leads (
        id, place_id, name, address, phone, categories, rating, review_count,
        website_uri, maps_uri, business_status, price_level, photo_count,
        has_opening_hours, primary_type, lat, lng, score, status, verification,
        discovered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "lead-1",
      "place-1",
      "Acme Dental",
      "123 Main St, Denver, CO 80202",
      "303-555-1111",
      JSON.stringify(["dentist"]),
      4.7,
      83,
      "https://acme.example",
      "https://maps.google.com/place-1",
      "OPERATIONAL",
      "PRICE_LEVEL_2",
      4,
      1,
      "dentist",
      39.75,
      -104.99,
      14.2,
      "new",
      JSON.stringify({ phone_confirmed: true, no_real_website: false }),
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const count = await backfillPlacesMasterFromLeads(100);
    expect(count).toBe(1);

    const canonical = await getCanonicalPlacesForExport(10);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].place_id).toBe("place-1");
    expect((canonical[0].completeness_score as number) > 0).toBe(true);
    expect((canonical[0].freshness_score as number) > 0).toBe(true);
  });
});
