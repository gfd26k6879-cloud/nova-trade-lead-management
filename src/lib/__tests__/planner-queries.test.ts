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
  createCrawlUnitsForSelection,
  getCoverageByCounty,
  getCoverageByState,
  getRunGeographyProgress,
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
    expect(geography.countiesSelected).toBe(2);
    expect(geography.countiesCompleted).toBe(1);
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
});
