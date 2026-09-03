import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const TENANT_A_SCOPE = { tenantId: TENANT_A, workspaceId: null };

const tenantContextMocks = vi.hoisted(() => ({
  tenantId: "10000000-0000-4000-8000-000000000001",
}));

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: () => ({ tenantId: tenantContextMocks.tenantId, workspaceId: null }),
}));

import {
  API_ENDPOINT_PLACE_DETAILS,
  API_ENDPOINT_TEXT_SEARCH,
  backfillPlacesMasterFromLeads,
  getMonthlyApiUsageSummary,
  getMonthlyBillableEventsForSku,
  getRunApiUsageSummary,
  getRunLastError,
  getTodayApiCalls,
  logApiUsageEvent,
} from "@/lib/db/queries";

beforeEach(() => {
  tenantContextMocks.tenantId = "10000000-0000-4000-8000-000000000001";
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE api_usage_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '10000000-0000-4000-8000-000000000001';
    ALTER TABLE api_usage_events ADD COLUMN source_card_id TEXT NOT NULL DEFAULT 'invalid_source'
      CHECK (source_card_id = 'google_places_legacy');
    ALTER TABLE crawl_runs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE crawl_runs ADD COLUMN workspace_id TEXT;
    ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '10000000-0000-4000-8000-000000000001';
    ALTER TABLE places_master ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '10000000-0000-4000-8000-000000000001';
    ALTER TABLE places_master ADD COLUMN source_card_id TEXT NOT NULL DEFAULT 'invalid_source'
      CHECK (source_card_id = 'google_places_legacy');
    CREATE UNIQUE INDEX places_master_tenant_source_place_unique ON places_master (tenant_id, source_card_id, place_id);
  `);
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

    const monthly = await getMonthlyApiUsageSummary(TENANT_A_SCOPE);
    expect(monthly.totalCalls).toBe(1001);
    expect(monthly.totalCost).toBeCloseTo(0.04, 2);
    expect(testDb.prepare("SELECT DISTINCT source_card_id FROM api_usage_events").all())
      .toEqual([{ source_card_id: "google_places_legacy" }]);
  });

  it("ignores cached usage events from billing totals", async () => {
    const cached = await logApiUsageEvent({
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: "places_place_details_enterprise_plus_atmosphere",
      was_cached: true,
    });

    expect(cached.estimatedCost).toBe(0);
    expect(cached.estimatedUnitPrice).toBe(0);

    const monthly = await getMonthlyApiUsageSummary(TENANT_A_SCOPE);
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

    const summary = await getRunApiUsageSummary(runId, TENANT_A_SCOPE);
    expect(summary.totalCalls).toBe(3);
    expect(summary.discoveryCalls).toBe(1);
    expect(summary.enrichmentCalls).toBe(2);
    expect(summary.atmosphereCalls).toBe(1);
  });

  it("counts failed Google requests against billable caps without adding successful cost", async () => {
    await logApiUsageEvent({
      endpoint: API_ENDPOINT_TEXT_SEARCH,
      sku: "places_text_search_pro",
      success: false,
      was_cached: false,
      billable_units: 1,
      metadata: { googleStatus: 400 },
    });

    await expect(getTodayApiCalls()).resolves.toBe(1);
    await expect(getMonthlyBillableEventsForSku("places_text_search_pro")).resolves.toBe(1);

    const monthly = await getMonthlyApiUsageSummary(TENANT_A_SCOPE);
    expect(monthly.discoveryCalls).toBe(0);
    expect(monthly.discoveryCost).toBe(0);
  });

  it("isolates monthly, run, and run-error dashboard reads by tenant", async () => {
    await logApiUsageEvent({
      tenantId: TENANT_A,
      crawl_run_id: "shared-run",
      endpoint: API_ENDPOINT_TEXT_SEARCH,
      sku: "places_text_search_enterprise",
    });
    testDb.prepare(
      `INSERT INTO api_usage_events (
        tenant_id, source_card_id, id, crawl_run_id, endpoint, sku, success,
        was_cached, billable_units, estimated_cost, created_at
      ) VALUES (?, 'google_places_legacy', ?, ?, ?, ?, 1, 0, 7, 7, ?)`,
    ).run(TENANT_B, "usage-b", "shared-run", API_ENDPOINT_TEXT_SEARCH, "places_text_search_enterprise", new Date().toISOString());
    testDb.prepare(
      `INSERT INTO crawl_runs (tenant_id, workspace_id, id, status, categories, last_error)
       VALUES (?, NULL, 'run-b', 'error', '[]', 'foreign failure')`,
    ).run(TENANT_B);

    await expect(getMonthlyApiUsageSummary(TENANT_A_SCOPE)).resolves.toMatchObject({ totalCalls: 1 });
    await expect(getRunApiUsageSummary("shared-run", TENANT_A_SCOPE)).resolves.toMatchObject({ totalCalls: 1 });
    await expect(getRunLastError("run-b", TENANT_A_SCOPE)).resolves.toBeNull();
  });
});

describe("canonical backfill", () => {
  it("backfills only leads owned by the active tenant", async () => {
    const tenantA = "10000000-0000-4000-8000-000000000001";
    const tenantB = "10000000-0000-4000-8000-000000000002";
    const now = new Date().toISOString();
    const insertLead = testDb.prepare(
      `INSERT INTO leads (tenant_id, id, place_id, name, discovered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertLead.run(tenantA, "lead-a", "place-a", "Tenant A", now, now, now);
    insertLead.run(tenantB, "lead-b", "place-b", "Tenant B", now, now, now);

    const count = await backfillPlacesMasterFromLeads(100);

    expect(count).toBe(1);
    expect(testDb.prepare(
      "SELECT tenant_id, place_id FROM places_master ORDER BY tenant_id, place_id",
    ).all()).toEqual([{ tenant_id: tenantA, place_id: "place-a" }]);
  });

  it("waits for every canonical upsert before returning", async () => {
    let releaseWrite!: () => void;
    let writeCompleted = false;
    const deferredWrite = new Promise<{ changes: number }>((resolve) => {
      releaseWrite = () => {
        writeCompleted = true;
        resolve({ changes: 1 });
      };
    });
    const tenantId = tenantContextMocks.tenantId;

    testDb.close();
    testDb = {
      prepare(sql: string) {
        if (sql.includes("FROM leads")) {
          return {
            all: () => [{
              tenant_id: tenantId,
              place_id: "place-deferred",
              name: "Deferred Place",
              categories: "[]",
              verification: "{}",
            }],
          };
        }
        if (sql.includes("INSERT INTO places_master")) {
          return { run: () => deferredWrite };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      close() {},
    } as unknown as Database.Database;

    let settled = false;
    const backfill = backfillPlacesMasterFromLeads(1).then((count) => {
      settled = true;
      return count;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    expect(writeCompleted).toBe(false);

    releaseWrite();
    await expect(backfill).resolves.toBe(1);
    expect(writeCompleted).toBe(true);
  });

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

    const canonical = testDb.prepare(
      "SELECT place_id, completeness_score, freshness_score FROM places_master LIMIT 10",
    ).all() as Array<Record<string, unknown>>;
    expect(canonical).toHaveLength(1);
    expect(canonical[0].place_id).toBe("place-1");
    expect((canonical[0].completeness_score as number) > 0).toBe(true);
    expect((canonical[0].freshness_score as number) > 0).toBe(true);
  });
});
