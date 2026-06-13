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

vi.mock("@/lib/google-places", () => {
  class PlacesApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: string,
      message = `Places API error ${status}: ${body}`,
    ) {
      super(message);
      this.name = "PlacesApiError";
    }
  }
  return {
    textSearch: vi.fn(),
    PlacesApiError,
    TEXT_SEARCH_FIELD_MASK: "places.id,places.displayName,places.websiteUri,places.rating",
    TEXT_SEARCH_PRO_FIELD_MASK: "places.id,places.displayName,places.formattedAddress,places.location",
  };
});

import { processNextUnit } from "@/lib/crawl/worker";
import { PlacesApiError, textSearch } from "@/lib/google-places";
import { createCrawlUnitsForSelection } from "@/lib/db/queries";

const mockTextSearch = textSearch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  testDb = createTestDb();
  seedTestZip(testDb);
  mockTextSearch.mockReset();
});

afterEach(() => {
  testDb.close();
});

describe("crawl worker integration", () => {
  it("returns idle when no active run exists", async () => {
    const result = await processNextUnit();
    expect(result.status).toBe("idle");
  });

  it("ignores paused discovery items", async () => {
    const runId = seedTestRun(testDb, { status: "paused" });
    seedTestUnit(testDb, { runId });

    const result = await processNextUnit();

    expect(result.status).toBe("idle");
    expect(mockTextSearch).not.toHaveBeenCalled();
    const unit = testDb.prepare("SELECT status FROM crawl_units WHERE id = 'unit-1'").get() as { status: string };
    expect(unit.status).toBe("pending");
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

  it("resumes from saved page token when a unit has more pages available", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId, nextPageToken: "saved-token-123", maxPages: 3, pagesFetched: 1 });

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

  it("processes despite legacy run call cap settings", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare("UPDATE settings SET max_calls_per_run = 1, stop_on_budget_limit = 1").run();
    testDb.prepare("UPDATE crawl_runs SET api_calls_used = 1 WHERE id = ?").run(runId);

    seedTestUnit(testDb, { runId });
    const place = makePlaceResult({ id: "places/legacy-run-cap" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(mockTextSearch).toHaveBeenCalledTimes(1);

    const run = testDb.prepare("SELECT status FROM crawl_runs WHERE id = ?").get(runId) as { status: string };
    expect(run.status).toBe("running");
    const unit = testDb.prepare("SELECT status, started_at FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("done");
    expect(unit.started_at).toBeTruthy();
  });

  it("processes despite legacy monthly Text Search cap settings", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare("UPDATE settings SET max_calls_per_day = 2000, max_calls_per_run = 2000").run();
    seedTestUnit(testDb, { runId });
    const now = new Date().toISOString();
    const insert = testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, success, was_cached, billable_units, created_at)
       VALUES (?, 'places.searchText', 'places_text_search_enterprise', 1, 0, 1, ?)`,
    );

    for (let i = 0; i < 900; i++) {
      insert.run(`usage-${i}`, now);
    }
    const place = makePlaceResult({ id: "places/legacy-monthly-cap" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(mockTextSearch).toHaveBeenCalledTimes(1);

    const run = testDb.prepare("SELECT status FROM crawl_runs WHERE id = ?").get(runId) as { status: string };
    expect(run.status).toBe("running");
    const unit = testDb.prepare("SELECT status, started_at FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("done");
    expect(unit.started_at).toBeTruthy();
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

  it("moves generic textSearch errors into retry wait before the attempt cap", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });

    mockTextSearch.mockRejectedValueOnce(new Error("API quota exceeded"));

    const result = await processNextUnit();

    expect(result.status).toBe("retry_wait");
    expect(result.error).toContain("API quota exceeded");

    const unit = testDb.prepare("SELECT status, last_error, last_error_code, next_retry_at FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("retry_wait");
    expect(unit.last_error).toContain("API quota exceeded");
    expect(unit.last_error_code).toBe("generic_error");
    expect(unit.next_retry_at).toBeTruthy();
  });

  it("moves Google 429 responses into retry wait with backoff", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });
    const rawErrorBody = JSON.stringify({
      error: {
        code: 429,
        message: "Quota exceeded.",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    mockTextSearch.mockRejectedValueOnce(new PlacesApiError(429, rawErrorBody));

    const result = await processNextUnit();

    expect(result.status).toBe("retry_wait");
    const unit = testDb.prepare("SELECT status, last_error_code, next_retry_at FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("retry_wait");
    expect(unit.last_error_code).toBe("google_rate_limited");
    expect(unit.next_retry_at).toBeTruthy();
  });

  it("leases retry-wait units once their retry time has passed", async () => {
    const runId = seedTestRun(testDb);
    seedTestZip(testDb, "80203", "Denver", 39.73, -104.98, "Denver");
    seedTestUnit(testDb, { id: "retry-unit", runId, zip: "80202", category: "dentist" });
    seedTestUnit(testDb, { id: "pending-unit", runId, zip: "80203", category: "dentist" });
    testDb.prepare(
      "UPDATE crawl_units SET status = 'retry_wait', next_retry_at = datetime('now', '-1 minute') WHERE id = 'retry-unit'",
    ).run();
    const place = makePlaceResult({ id: "places/retry-ready" });
    mockTextSearch.mockResolvedValueOnce(mockTextSearchResponse([place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.unitId).toBe("retry-unit");
    const unit = testDb.prepare("SELECT status, next_retry_at FROM crawl_units WHERE id = 'retry-unit'").get() as Record<string, unknown>;
    expect(unit.status).toBe("done");
    expect(unit.next_retry_at).toBeNull();
  });

  it("blocks the run on Google permission errors without retrying remaining units", async () => {
    const runId = seedTestRun(testDb);
    seedTestZip(testDb, "80203", "Denver", 39.73, -104.98, "Denver");
    seedTestUnit(testDb, { id: "blocked-unit", runId, zip: "80202", category: "dentist" });
    seedTestUnit(testDb, { id: "untouched-unit", runId, zip: "80203", category: "dentist" });
    const rawErrorBody = JSON.stringify({
      error: {
        code: 403,
        message: "Places API has not been used in project or it is disabled.",
        status: "PERMISSION_DENIED",
      },
    });
    mockTextSearch.mockRejectedValueOnce(new PlacesApiError(403, rawErrorBody));

    const result = await processNextUnit();

    expect(result.status).toBe("blocked");
    expect(result.error).toContain("Google Places permission denied");
    const run = testDb.prepare("SELECT status, blocked_reason, blocked_error_code FROM crawl_runs WHERE id = ?").get(runId) as Record<string, unknown>;
    expect(run.status).toBe("blocked");
    expect(run.blocked_error_code).toBe("google_permission_denied");
    expect(String(run.blocked_reason)).toContain("Google Places permission denied");
    expect(testDb.prepare("SELECT status, last_error_code FROM crawl_units WHERE id = 'blocked-unit'").get()).toMatchObject({
      status: "failed",
      last_error_code: "google_permission_denied",
    });
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'untouched-unit'").get()).toMatchObject({ status: "pending" });
  });

  it("does not follow nextPageToken by default", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId, nextPageToken: "bad-page-token" });

    const page1Place = makePlaceResult({ id: "places/page1-biz" });
    const page2Place = makePlaceResult({ id: "places/page2-biz" });

    mockTextSearch
      .mockResolvedValueOnce(mockTextSearchResponse([page1Place], "page2-token"))
      .mockResolvedValueOnce(mockTextSearchResponse([page2Place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.leadsFound).toBe(1);
    expect(result.apiCalls).toBe(1);
    expect(mockTextSearch).toHaveBeenCalledTimes(1);
  });

  it("follows nextPageToken when pagination policy permits extra pages", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare(
      "UPDATE crawl_runs SET selection_json = ? WHERE id = ?",
    ).run(JSON.stringify({ discoveryMode: "lead_harvest", paginationPolicy: "manual_extra_pages" }), runId);
    seedTestUnit(testDb, { runId, maxPages: 3 });

    const page1Places = Array.from({ length: 6 }, (_, index) => makePlaceResult({ id: `places/page1-biz-${index}` }));
    const page2Place = makePlaceResult({ id: "places/page2-biz" });

    mockTextSearch
      .mockResolvedValueOnce(mockTextSearchResponse(page1Places, "page2-token"))
      .mockResolvedValueOnce(mockTextSearchResponse([page2Place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.apiCalls).toBe(2);
    expect(mockTextSearch).toHaveBeenCalledTimes(2);

    const secondCallArgs = mockTextSearch.mock.calls[1];
    expect(secondCallArgs[1]).toBe("page2-token");
  });

  it("does not let pagination policy exceed the stored unit page cap", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare(
      "UPDATE crawl_runs SET selection_json = ? WHERE id = ?",
    ).run(JSON.stringify({ discoveryMode: "lead_harvest", paginationPolicy: "manual_extra_pages" }), runId);
    seedTestUnit(testDb, { runId, maxPages: 1 });

    const page1Places = Array.from({ length: 6 }, (_, index) => makePlaceResult({ id: `places/capped-page1-${index}` }));
    const page2Place = makePlaceResult({ id: "places/capped-page2" });

    mockTextSearch
      .mockResolvedValueOnce(mockTextSearchResponse(page1Places, "page2-token"))
      .mockResolvedValueOnce(mockTextSearchResponse([page2Place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.apiCalls).toBe(1);
    expect(mockTextSearch).toHaveBeenCalledTimes(1);

    const unit = testDb.prepare("SELECT max_pages, pages_fetched, next_page_token FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.max_pages).toBe(1);
    expect(unit.pages_fetched).toBe(1);
    expect(unit.next_page_token).toBeNull();
  });

  it("records multi-page coverage probes without creating active leads", async () => {
    const runId = seedTestRun(testDb);
    testDb.prepare(
      "UPDATE crawl_runs SET selection_json = ? WHERE id = ?",
    ).run(JSON.stringify({ discoveryMode: "coverage_probe", paginationPolicy: "manual_extra_pages" }), runId);
    seedTestUnit(testDb, { runId, maxPages: 3 });

    const page1Places = Array.from({ length: 6 }, (_, index) => makePlaceResult({ id: `places/probe-page1-${index}` }));
    const page2Place = makePlaceResult({ id: "places/probe-page2" });

    mockTextSearch
      .mockResolvedValueOnce(mockTextSearchResponse(page1Places, "page2-token"))
      .mockResolvedValueOnce(mockTextSearchResponse([page2Place]));

    const result = await processNextUnit();

    expect(result.status).toBe("processed");
    expect(result.apiCalls).toBe(2);
    expect(mockTextSearch).toHaveBeenCalledTimes(2);

    const leadCount = testDb.prepare("SELECT COUNT(*) AS count FROM leads").get() as { count: number };
    const placeCount = testDb.prepare("SELECT COUNT(*) AS count FROM places_master").get() as { count: number };
    expect(leadCount.count).toBe(0);
    expect(placeCount.count).toBe(7);
  });

  it("logs failed Google attempts as billable and stores an operator-safe unit error", async () => {
    const runId = seedTestRun(testDb);
    seedTestUnit(testDb, { runId });
    const rawErrorBody = JSON.stringify({
      error: {
        code: 400,
        message: "Request parameters for paging requests must match the initial SearchText request.",
        status: "INVALID_ARGUMENT",
      },
    });
    mockTextSearch.mockRejectedValueOnce(new PlacesApiError(400, rawErrorBody));

    const result = await processNextUnit();

    expect(result.status).toBe("error");
    expect(result.error).toBe("Google Places request failed with status 400.");

    const unit = testDb.prepare("SELECT status, last_error, last_error_code, next_page_token FROM crawl_units WHERE id = 'unit-1'").get() as Record<string, unknown>;
    expect(unit.status).toBe("failed");
    expect(unit.last_error).toBe("Google Places request failed with status 400.");
    expect(unit.last_error_code).toBe("google_invalid_page_token");
    expect(unit.next_page_token).toBeNull();

    const usage = testDb.prepare("SELECT success, billable_units, metadata FROM api_usage_events WHERE crawl_unit_id = 'unit-1'").get() as Record<string, unknown>;
    expect(usage.success).toBe(0);
    expect(usage.billable_units).toBe(1);
    expect(String(usage.metadata)).toContain("INVALID_ARGUMENT");
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
