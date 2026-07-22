import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";
import { PLACE_CACHE_METADATA_KEY } from "@/lib/place-cache-contract";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => ({
  getDb: () => testDb,
  generateId: () => crypto.randomUUID(),
  nowISO: () => new Date().toISOString(),
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

import { getCachedPlaceResponse } from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("place cache detail-stage contract", () => {
  it("serves Stage A generally but bypasses it for a Stage-B request", async () => {
    insertCacheRow("stage-a", {
      id: "places/stage-a",
      displayName: { text: "Stage A business" },
      [PLACE_CACHE_METADATA_KEY]: {
        schemaVersion: 1,
        detailsStage: "stage-a",
      },
    });

    await expect(getCachedPlaceResponse("stage-a", 30, false)).resolves.toMatchObject({
      id: "places/stage-a",
    });
    await expect(getCachedPlaceResponse("stage-a", 30, true)).resolves.toBeNull();
  });

  it("serves cached Stage B with derived insights even when Google returned no reviews", async () => {
    insertCacheRow("stage-b-empty", {
      id: "places/stage-b-empty",
      editorialSummary: { text: "Editorial summary is safe to retain" },
      [PLACE_CACHE_METADATA_KEY]: {
        schemaVersion: 1,
        detailsStage: "stage-b",
        reviewInsights: {
          keywords: [],
          painPoints: [],
          sentimentRatio: 0.5,
          totalReviews: 0,
        },
      },
    });

    await expect(getCachedPlaceResponse("stage-b-empty", 30, true)).resolves.toMatchObject({
      id: "places/stage-b-empty",
      [PLACE_CACHE_METADATA_KEY]: {
        detailsStage: "stage-b",
        reviewInsights: { keywords: [], totalReviews: 0 },
      },
    });
  });

  it("never returns raw reviews from a legacy cache row and does not treat it as Stage B", async () => {
    insertCacheRow("legacy-raw", {
      id: "places/legacy-raw",
      reviews: [{
        name: "places/legacy-raw/reviews/private-profile",
        text: { text: "private review body" },
        authorAttribution: { displayName: "Private Reviewer" },
      }],
      editorialSummary: { text: "Legacy editorial" },
    });

    const stageA = await getCachedPlaceResponse("legacy-raw", 30, false);
    expect(stageA?.reviews).toBeUndefined();
    expect(JSON.stringify(stageA)).not.toContain("private review body");
    await expect(getCachedPlaceResponse("legacy-raw", 30, true)).resolves.toBeNull();
  });
});

function insertCacheRow(placeId: string, payload: Record<string, unknown>): void {
  testDb.prepare(
    "INSERT INTO place_cache (place_id, raw_json, fetched_at) VALUES (?, ?, datetime('now'))",
  ).run(placeId, JSON.stringify(payload));
}
