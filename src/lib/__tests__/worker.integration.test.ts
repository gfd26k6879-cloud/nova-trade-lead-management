import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  createTestDb,
  seedTestZip,
  seedTestRun,
  seedTestUnit,
  makePlaceResult,
  mockTextSearchResponse,
} from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

vi.mock("@/lib/google-places", () => ({
  textSearch: vi.fn(),
  TEXT_SEARCH_FIELD_MASK: "places.id",
}));

import { processNextUnit } from "@/lib/crawl/worker";
import { textSearch } from "@/lib/google-places";
import { createCrawlUnitsForSelection } from "@/lib/db/queries";

const mockTextSearch = textSearch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  testDb = createTestDb();
  seedTestZip(testDb);
  vi.clearAllMocks();
});

afterEach(() => {
  testDb.close();
});

describe("crawl worker integration", () => {
  it("returns idle when no active run exists", async () => {
    const result = await processNextUnit();
    expect(result.status).toBe("idle");
  });

  it("processes a unit and creates leads", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId, zip: "80202", category: "dentist" });

    const place = makePlaceResult({ id: "places/abc123" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.leadsFound).toBe(1);
    expect(result.leadsSkipped).toBe(0);

    const row = testDb.prepare("SELECT * FROM leads WHERE place_id = 'abc123'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.name).toBe("Test Business");
  });

  it("queues AI verification after discovery when enabled", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId, zip: "80202", category: "dentist" });
    testDb.prepare("UPDATE settings SET ai_enabled = 1, ai_auto_verify_enabled = 1, ai_verify_after_discovery = 1").run();

    const place = makePlaceResult({ id: "places/ai-queued" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    const row = testDb.prepare("SELECT ai_queue_status, ai_input_hash FROM leads WHERE place_id = 'ai-queued'").get() as Record<string, unknown>;
    expect(row.ai_queue_status).toBe("queued");
    expect(row.ai_input_hash).toBeTruthy();
  });

  it("resumes from saved page token", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId, nextPageToken: "saved-token-123" });

    const place = makePlaceResult();
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    await processNextUnit();

    expect(mockTextSearch).toHaveBeenCalledTimes(1);
    const callArgs = mockTextSearch.mock.calls[0];
    expect(callArgs[1]).toBe("saved-token-123");
  });

  it("deduplicates by place_id", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });

    testDb.prepare(
      "INSERT INTO leads (id, place_id, name, score, website_status) VALUES ('existing', 'dup-place', 'Existing Biz', 5, 'none')",
    ).run();

    const place = makePlaceResult({ id: "places/dup-place" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.leadsSkipped).toBe(1);
    expect(result.leadsFound).toBe(0);

    const count = testDb.prepare("SELECT COUNT(*) as c FROM leads WHERE place_id = 'dup-place'").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("skips closed businesses", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });

    const closedPlace = makePlaceResult({ id: "places/closed1", businessStatus: "CLOSED_PERMANENTLY" });
    const tempClosed = makePlaceResult({ id: "places/closed2", businessStatus: "CLOSED_TEMPORARILY" });
    const openPlace = makePlaceResult({ id: "places/open1", businessStatus: "OPERATIONAL" });

    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([closedPlace, tempClosed, openPlace]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.leadsFound).toBe(1);

    const closedRow = testDb.prepare("SELECT id FROM leads WHERE place_id = 'closed1'").get();
    expect(closedRow).toBeUndefined();
  });

  it("pauses on budget limit (max_calls_per_run)", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare("UPDATE settings SET max_calls_per_run = 1, stop_on_budget_limit = 1").run();
    testDb.prepare("UPDATE crawl_runs SET api_calls_used = 1 WHERE id = ?").run(runId);

    seedTestUnit(testDb, { runId });

    const result = await processNextUnit();

    expect(result.status).toBe("budget_limit");

    const run = testDb.prepare("SELECT status FROM crawl_runs WHERE id = ?").get(runId) as { status: string };
    expect(run.status).toBe("paused");
  });

  it("pauses before exceeding the monthly Text Search free tier", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare("UPDATE settings SET max_calls_per_day = 2000, max_calls_per_run = 2000").run();
    seedTestUnit(testDb, { runId });
    const now = new Date().toISOString();
    const insert = testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, success, was_cached, billable_units, created_at)
       VALUES (?, 'places.searchText', 'places_text_search_enterprise', 1, 0, 1, ?)`,
    );

    for (let i = 0; i < 1000; i++) {
      insert.run(`usage-${i}`, now);
    }

    const result = await processNextUnit();

    expect(result.status).toBe("budget_limit");
    expect(result.error).toContain("free-tier cap reached");
    expect(mockTextSearch).not.toHaveBeenCalled();

    const run = testDb.prepare("SELECT status FROM crawl_runs WHERE id = ?").get(runId) as { status: string };
    expect(run.status).toBe("paused");
  });

  it("prioritizes Denver county pending units before lower sorted zips", async () => {
    const runId = seedTestRun(testDb);
    seedTestZip(testDb, "80123", "Littleton", 39.61, -105.09, "Jefferson");
    seedTestUnit(testDb, { id: "jefferson-unit", runId, zip: "80123", category: "dentist" });
    seedTestUnit(testDb, { id: "denver-unit", runId, zip: "80202", category: "dentist" });

    const place = makePlaceResult({ id: "places/denver-first" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.zip).toBe("80202");
  });

  it("handles textSearch errors gracefully", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });

    mockTextSearch.mockRejectedValueOnce(new Error("API quota exceeded"));

    const result = await processNextUnit();

    expect(result.status).toBe("error");
    expect(result.error).toContain("API quota exceeded");

    const unit = testDb.prepare("SELECT status, last_error FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("failed");
    expect(unit.last_error).toContain("API quota exceeded");
  });

  it("follows nextPageToken for pagination", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });

    const page1Place = makePlaceResult({ id: "places/page1-biz" });
    const page2Place = makePlaceResult({ id: "places/page2-biz" });

    mockTextSearch
      .mockResolvedValueOnce(mockTextSearchResponse([page1Place], "page2-token"))
      .mockResolvedValueOnce(mockTextSearchResponse([page2Place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.leadsFound).toBe(2);
    expect(result.apiCalls).toBe(2);
    expect(mockTextSearch).toHaveBeenCalledTimes(2);

    const secondCallArgs = mockTextSearch.mock.calls[1];
    expect(secondCallArgs[1]).toBe("page2-token");
  });

  it("keeps worker flow unchanged with planner-selected units", async () => {
    const runId = seedTestRun(testDb);
    await createCrawlUnitsForSelection(runId, ["dentist"], ["80202"]);

    const place = makePlaceResult({ id: "places/planner1" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.zip).toBe("80202");
    expect(result.category).toBe("dentist");
    expect(mockTextSearch).toHaveBeenCalledTimes(1);
  });
});
