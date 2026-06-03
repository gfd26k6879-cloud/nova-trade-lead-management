import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => ({
  getDb: () => testDb,
  generateId: () => crypto.randomUUID(),
  nowISO: () => new Date().toISOString(),
}));

import { listUserMarketAccess, listUserMarketAccessForUsers } from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
  testDb.prepare(
    `INSERT OR IGNORE INTO location_markets (id, name, country_code, admin_area1, status)
     VALUES ('market-toronto', 'Toronto', 'CA', 'ON', 'active')`
  ).run();
  testDb.prepare(
    `INSERT INTO user_market_access (user_id, market_id)
     VALUES ('user-1', 'market-colorado'), ('user-1', 'market-toronto'), ('user-2', 'market-colorado')`
  ).run();
});

afterEach(() => {
  testDb.close();
});

describe("user market access queries", () => {
  it("returns market access for multiple users in one grouped result", async () => {
    const result = await listUserMarketAccessForUsers(["user-1", "user-2", "user-3", "user-1"]);

    expect(Object.keys(result).sort()).toEqual(["user-1", "user-2", "user-3"]);
    expect(result["user-1"].map((access) => access.market_id).sort()).toEqual(["market-colorado", "market-toronto"]);
    expect(result["user-2"].map((access) => access.market_id)).toEqual(["market-colorado"]);
    expect(result["user-3"]).toEqual([]);
  });

  it("keeps the single-user helper compatible with the bulk query", async () => {
    const result = await listUserMarketAccess("user-2");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ user_id: "user-2", market_id: "market-colorado" });
  });
});
