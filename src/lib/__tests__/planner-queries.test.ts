import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, seedTestRun, seedTestZip } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

import {
  cancelCrawlRun,
  createCrawlRun,
  createCrawlUnitsForCells,
  createCrawlUnitsForSelection,
  ensureGeographyBackfill,
  getActiveCrawlRun,
  getCrawlProgress,
  getProcessingCrawlRun,
  getPlannerCells,
  getPlannerMarkets,
  listDiscoveryItems,
  getCoverageByCounty,
  getCoverageByState,
  getLeadMapZipCoverage,
  getRunGeographyProgress,
  getMarketCoverageSummary,
  getZipCoverageStatus,
} from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
  seedTestZip(testDb, "80202", "Denver", 39.75, -104.99, "Denver");
  seedTestZip(testDb, "80123", "Littleton", 39.61, -105.07, "Jefferson");
  seedTestZip(testDb, "80010", "Aurora", 39.73, -104.85, "Arapahoe");
});

afterEach(() => {
  testDb.close();
});

describe("state county zip planner queries", () => {
  it("creates crawl units only for selected zip codes", async () => {
    const runId = seedTestRun(testDb);
    const created = await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202", "80123"]);
    expect(created).toBe(4);

    const rows = testDb.prepare(
      "SELECT DISTINCT zip FROM crawl_units WHERE crawl_run_id = ? ORDER BY zip"
    ).all(runId) as Array<{ zip: string }>;

    expect(rows.map((row) => row.zip)).toEqual(["80123", "80202"]);
  });

  it("treats paused runs as visible discovery items but not processing runs", async () => {
    const pausedRunId = seedTestRun(testDb, { id: "paused-run", status: "paused" });
    await createCrawlUnitsForSelection(pausedRunId, ["dentist"], ["80202"]);

    const processing = await getProcessingCrawlRun();
    const visible = await getActiveCrawlRun();
    const items = await listDiscoveryItems();

    expect(processing).toBeNull();
    expect(visible?.id).toBe(pausedRunId);
    expect(items[0]).toMatchObject({
      id: pausedRunId,
      status: "paused",
      totalUnits: 1,
      openUnits: 1,
    });
  });

  it("lists latest discovery items with unit counts after limiting runs", async () => {
    const olderRun = seedTestRun(testDb, { id: "older-run", status: "done" });
    const newerRun = seedTestRun(testDb, { id: "newer-run", status: "paused" });
    testDb.prepare("UPDATE crawl_runs SET created_at = '2026-02-23T00:00:00.000Z' WHERE id = ?").run(olderRun);
    testDb.prepare("UPDATE crawl_runs SET created_at = '2026-02-25T00:00:00.000Z' WHERE id = ?").run(newerRun);
    await createCrawlUnitsForSelection(olderRun, ["dentist"], ["80202"]);
    await createCrawlUnitsForSelection(newerRun, ["dentist", "plumber"], ["80202"]);
    testDb.prepare("UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ?").run(olderRun);
    testDb.prepare("UPDATE crawl_units SET status = 'failed' WHERE crawl_run_id = ? AND category = 'plumber'").run(newerRun);

    const items = await listDiscoveryItems(1);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: newerRun,
      status: "paused",
      totalUnits: 2,
      failedUnits: 1,
      openUnits: 1,
    });
  });

  it("creates crawl units for selected international location cells", async () => {
    testDb.prepare(
      `INSERT INTO location_markets (id, name, country_code, admin_area1, locality, status)
       VALUES ('market-toronto', 'Toronto', 'CA', 'ON', 'Toronto', 'active')`
    ).run();
    testDb.prepare(
      `INSERT INTO location_cells (
        id, market_id, country_code, admin_area1, locality, postal_code, postal_code_normalized,
        cell_type, cell_label, lat, lng, is_active
       ) VALUES ('cell-ca-toronto-m5v', 'market-toronto', 'CA', 'Ontario', 'Toronto', 'M5V', 'M5V',
        'postal_fsa', 'Toronto ON M5V', 43.64, -79.39, 1)`
    ).run();
    const run = await createCrawlRun(["dentist"], {
      marketId: "market-toronto",
      selection: { marketId: "market-toronto", cellIds: ["cell-ca-toronto-m5v"] },
    });

    const created = await createCrawlUnitsForCells(run.id, ["dentist", "accountant"], ["cell-ca-toronto-m5v"]);
    expect(created).toBe(2);

    const rows = testDb.prepare(
      "SELECT market_id, location_cell_id, country_code, zip, query_location_label FROM crawl_units WHERE crawl_run_id = ? ORDER BY category"
    ).all(run.id) as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      market_id: "market-toronto",
      location_cell_id: "cell-ca-toronto-m5v",
      country_code: "CA",
      zip: "M5V",
      query_location_label: "Toronto, Ontario, M5V, Canada",
    });
  });

  it("seeds London Ontario N6H as a Canadian discovery cell", async () => {
    await ensureGeographyBackfill();

    const markets = await getPlannerMarkets();
    expect(markets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "market-london-ca",
        name: "London, Ontario",
        country_code: "CA",
      }),
    ]));

    const cells = await getPlannerCells("market-london-ca", ["dentist"]);
    expect(cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cell-ca-london-on-n6h",
        country_code: "CA",
        postal_code_normalized: "N6H",
        cell_label: "London, ON N6H",
      }),
    ]));
  });

  it("seeds London NW9 as a UK discovery cell", async () => {
    await ensureGeographyBackfill();

    const cells = await getPlannerCells("market-london-gb", ["dentist"]);
    expect(cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cell-gb-london-nw9",
        country_code: "GB",
        postal_code_normalized: "NW9",
        cell_label: "London NW9",
      }),
    ]));
  });

  it("aggregates coverage by county and state correctly", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202", "80123"]);

    testDb.prepare("UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80202'").run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80123' AND category = 'dentist'"
    ).run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'failed' WHERE crawl_run_id = ? AND zip = '80123' AND category = 'plumber'"
    ).run(runId);

    const countyRollups = await getCoverageByCounty(runId);
    expect(countyRollups).toHaveLength(2);
    expect(countyRollups.map((row) => row.county)).toEqual(["Denver", "Jefferson"]);

    const stateRollups = await getCoverageByState(runId);
    expect(stateRollups).toHaveLength(1);
    expect(stateRollups[0].state).toBe("CO");
    expect(stateRollups[0].total).toBe(4);
    expect(stateRollups[0].done).toBe(3);
    expect(stateRollups[0].failed).toBe(1);
  });

  it("reports geography completion progress", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202", "80123"]);

    testDb.prepare("UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80202'").run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80123' AND category = 'dentist'"
    ).run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'failed' WHERE crawl_run_id = ? AND zip = '80123' AND category = 'plumber'"
    ).run(runId);

    const geography = await getRunGeographyProgress(runId);
    expect(geography.zipCodesSelected).toBe(2);
    expect(geography.zipCodesCompleted).toBe(1);
    expect(geography.zipCodesStarted).toBe(2);
    expect(geography.zipCodesNotStarted).toBe(0);
    expect(geography.zipCodesNotSelected).toBe(1);
    expect(geography.countiesSelected).toBe(2);
    expect(geography.countiesCompleted).toBe(1);
  });

  it("stops a run and keeps a tally of canceled units", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202", "80123"]);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80202' AND category = 'dentist'"
    ).run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'running' WHERE crawl_run_id = ? AND zip = '80202' AND category = 'plumber'"
    ).run(runId);

    const result = await cancelCrawlRun(runId);
    expect(result.canceledUnits).toBe(3);

    const progress = await getCrawlProgress(runId);
    expect(progress.done).toBe(1);
    expect(progress.canceled).toBe(3);
    expect(progress.pending).toBe(0);
    expect(progress.running).toBe(0);

    const run = testDb.prepare("SELECT status FROM crawl_runs WHERE id = ?").get(runId) as { status: string };
    expect(run.status).toBe("canceled");

    const geography = await getRunGeographyProgress(runId);
    expect(geography.zipCodesSelected).toBe(2);
    expect(geography.zipCodesStarted).toBe(2);
    expect(geography.zipCodesCanceled).toBe(1);
  });

  it("returns zip coverage status against selected categories", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202"]);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'done' WHERE crawl_run_id = ? AND zip = '80202' AND category = 'dentist'"
    ).run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'failed' WHERE crawl_run_id = ? AND zip = '80202' AND category = 'plumber'"
    ).run(runId);

    const coverage = await getZipCoverageStatus("80202", ["dentist", "plumber", "hvac"]);
    expect(coverage.total).toBe(3);
    expect(coverage.done).toBe(1);
    expect(coverage.failed).toBe(1);
    expect(coverage.remaining).toBe(1);
    expect(coverage.completed).toBe(false);
  });

  it("returns active zip map coverage coordinates without crawl aggregation", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist", "plumber"], ["80202", "80123"]);
    testDb.prepare("UPDATE crawl_units SET status = 'done', discovered_count = 7 WHERE crawl_run_id = ? AND zip = '80202'").run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'done', discovered_count = 2 WHERE crawl_run_id = ? AND zip = '80123' AND category = 'dentist'"
    ).run(runId);
    testDb.prepare(
      "UPDATE crawl_units SET status = 'failed' WHERE crawl_run_id = ? AND zip = '80123' AND category = 'plumber'"
    ).run(runId);
    const coverage = await getLeadMapZipCoverage();

    expect(coverage.map((row) => row.zip)).toEqual(["80010", "80123", "80202"]);
    expect(coverage.find((row) => row.zip === "80202")).toMatchObject({
      city: "Denver",
      leadCount: 0,
      discoveredCount: 0,
      totalUnits: 0,
      doneUnits: 0,
      failedUnits: 0,
      scrapeStatus: "not_started",
    });
    expect(coverage.find((row) => row.zip === "80123")).toMatchObject({
      city: "Littleton",
      leadCount: 0,
      totalUnits: 0,
      scrapeStatus: "not_started",
    });
    expect(coverage.find((row) => row.zip === "80010")).toMatchObject({
      city: "Aurora",
      leadCount: 0,
      totalUnits: 0,
      scrapeStatus: "not_started",
    });
  });

  it("rolls coverage up by market and location cell", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist"], ["80202"]);
    testDb.prepare("UPDATE crawl_units SET status = 'done', discovered_count = 3 WHERE crawl_run_id = ?").run(runId);

    const markets = await getMarketCoverageSummary(runId);
    expect(markets.find((market) => market.marketId === "market-colorado")).toMatchObject({
      marketName: "Colorado",
      countryCode: "US",
      doneUnits: 1,
      leadsDiscovered: 3,
    });
  });
});
