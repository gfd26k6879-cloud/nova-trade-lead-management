import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";
import { PLACE_CACHE_METADATA_KEY } from "@/lib/place-cache-contract";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
let memberContext: { tenantId: string; workspaceId: string | null } | null;
let workerContext: {
  tenantId: string;
  workspaceId: string | null;
  workerName: string;
  action: string;
} | null;
let dbReads = 0;

vi.mock("@/lib/db/index", () => ({
  getDb: () => {
    dbReads += 1;
    return testDb;
  },
  generateId: () => crypto.randomUUID(),
  nowISO: () => new Date().toISOString(),
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => memberContext,
  requireTenantContext: () => {
    if (!memberContext) throw new Error("A tenant context is required");
    return memberContext;
  },
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: () => workerContext,
}));

import { cachePlaceResponse, getCachedPlaceResponse } from "@/lib/db/queries";

beforeEach(() => {
  memberContext = { tenantId: TENANT_A, workspaceId: null };
  workerContext = null;
  dbReads = 0;
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE place_cache ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE place_cache ADD COLUMN source_card_id TEXT NOT NULL DEFAULT 'invalid_source'
      CHECK (source_card_id = 'google_places_legacy');
    CREATE UNIQUE INDEX place_cache_tenant_source_place_unique
      ON place_cache (tenant_id, source_card_id, place_id);
  `);
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

  it("writes the finalized source identity and updates through the composite key", async () => {
    await cachePlaceResponse("composite", JSON.stringify({ version: 1 }));
    await cachePlaceResponse("composite", JSON.stringify({ version: 2 }));

    expect(testDb.prepare(
      "SELECT tenant_id, source_card_id, raw_json FROM place_cache WHERE place_id = 'composite'",
    ).get()).toEqual({
      tenant_id: TENANT_A,
      source_card_id: "google_places_legacy",
      raw_json: JSON.stringify({ version: 2 }),
    });
  });

  it.each([
    ["crawl", "crawl:process"],
    ["enrichment", "enrichment:process"],
  ])("allows an exact %s worker to reuse only its tenant cache", async (workerName, action) => {
    insertCacheRow("tenant-a-place", { tenant: "a" });
    insertCacheRow("tenant-b-place", { tenant: "b" }, TENANT_B);
    memberContext = null;
    workerContext = { tenantId: TENANT_A, workspaceId: null, workerName, action };

    await expect(getCachedPlaceResponse("tenant-a-place", 30)).resolves.toMatchObject({ tenant: "a" });
    await expect(getCachedPlaceResponse("tenant-b-place", 30)).resolves.toBeNull();
    await cachePlaceResponse("tenant-a-place", JSON.stringify({ tenant: "a-updated" }));

    expect(testDb.prepare(
      "SELECT raw_json FROM place_cache WHERE tenant_id = ? AND place_id = ?",
    ).get(TENANT_B, "tenant-b-place")).toEqual({ raw_json: JSON.stringify({ tenant: "b" }) });
  });

  it("rejects wrong or conflicting worker authority before database access", async () => {
    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "artifact",
      action: "artifact:process",
    };
    dbReads = 0;

    await expect(getCachedPlaceResponse("blocked", 30)).rejects.toThrow(
      "Exact crawl or enrichment worker context is required",
    );
    await expect(cachePlaceResponse("blocked", "{}")).rejects.toThrow(
      "Exact crawl or enrichment worker context is required",
    );
    expect(dbReads).toBe(0);

    memberContext = { tenantId: TENANT_A, workspaceId: null };
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "enrichment",
      action: "enrichment:process",
    };
    await expect(getCachedPlaceResponse("blocked", 30)).rejects.toThrow(
      "Conflicting place cache tenant contexts",
    );
    expect(dbReads).toBe(0);
  });
});

function insertCacheRow(
  placeId: string,
  payload: Record<string, unknown>,
  tenantId = TENANT_A,
): void {
  testDb.prepare(
    `INSERT INTO place_cache (tenant_id, source_card_id, place_id, raw_json, fetched_at)
     VALUES (?, 'google_places_legacy', ?, ?, datetime('now'))`,
  ).run(tenantId, placeId, JSON.stringify(payload));
}
