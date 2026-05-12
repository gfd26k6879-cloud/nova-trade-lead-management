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

import { getScoreBandThresholds } from "@/lib/db/queries";

function insertLeadScore(db: Database.Database, score: number, idx: number): void {
  db.prepare("INSERT INTO leads (id, place_id, score) VALUES (?, ?, ?)")
    .run(`lead-${idx}`, `place-${idx}`, score);
}

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("getScoreBandThresholds", () => {
  it("returns fallback thresholds when there are not enough leads", async () => {
    for (let idx = 0; idx < 5; idx++) {
      insertLeadScore(testDb, idx + 1, idx);
    }

    const thresholds = await getScoreBandThresholds();
    expect(thresholds.usesFallback).toBe(true);
    expect(thresholds.sampleSize).toBe(5);
    expect(thresholds.p25).toBe(5);
    expect(thresholds.p50).toBe(10);
    expect(thresholds.p75).toBe(16);
    expect(thresholds.p90).toBe(19);
    expect(thresholds.p97).toBe(22);
  });

  it("computes dynamic thresholds from query data when sample is large enough", async () => {
    for (let idx = 0; idx < 30; idx++) {
      insertLeadScore(testDb, idx + 1, idx);
    }

    const thresholds = await getScoreBandThresholds();
    expect(thresholds.usesFallback).toBe(false);
    expect(thresholds.sampleSize).toBe(30);
    expect(thresholds.p25).toBe(8.3);
    expect(thresholds.p50).toBe(15.5);
    expect(thresholds.p75).toBe(22.8);
    expect(thresholds.p90).toBe(27.1);
    expect(thresholds.p97).toBe(29.1);
  });
});
