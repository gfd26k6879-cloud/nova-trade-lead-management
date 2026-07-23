import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const NOW = "2026-06-16T12:00:00.000Z";

vi.mock("@/lib/db/index", () => ({
  getDb: () => testDb,
  generateId: () => crypto.randomUUID(),
  nowISO: () => NOW,
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

import {
  leaseNextLeadForEnrichment,
  markLeadEnrichmentFailed,
} from "@/lib/db/queries";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
  vi.useRealTimers();
});

function insertLead(overrides: Record<string, unknown> = {}) {
  const data = {
    id: "lead-1",
    place_id: "place-1",
    name: "Lease Lead",
    website_status: "none",
    score: 10,
    enrichment_status: "pending",
    enrichment_attempt_count: 0,
    enrichment_max_attempts: 3,
    enrichment_started_at: null,
    enrichment_next_retry_at: null,
    ...overrides,
  };
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, website_status, score, enrichment_status,
      enrichment_attempt_count, enrichment_max_attempts, enrichment_started_at, enrichment_next_retry_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.place_id,
    data.name,
    data.website_status,
    data.score,
    data.enrichment_status,
    data.enrichment_attempt_count,
    data.enrichment_max_attempts,
    data.enrichment_started_at,
    data.enrichment_next_retry_at,
  );
}

describe("enrichment leases", () => {
  it("leases one eligible lead once", async () => {
    insertLead();

    const first = await leaseNextLeadForEnrichment();
    const second = await leaseNextLeadForEnrichment();

    expect(first?.id).toBe("lead-1");
    expect(first?.enrichment_status).toBe("running");
    expect(first?.enrichment_attempt_count).toBe(1);
    expect(second).toBeNull();
  });

  it("recovers stale running leases", async () => {
    insertLead({
      enrichment_status: "running",
      enrichment_attempt_count: 1,
      enrichment_started_at: "2026-06-16T11:00:00.000Z",
    });

    const leased = await leaseNextLeadForEnrichment();

    expect(leased?.id).toBe("lead-1");
    expect(leased?.enrichment_attempt_count).toBe(2);
  });

  it("skips retry-wait leads until due", async () => {
    insertLead({
      enrichment_status: "retry_wait",
      enrichment_attempt_count: 1,
      enrichment_next_retry_at: "2026-06-16T12:05:00.000Z",
    });

    expect(await leaseNextLeadForEnrichment()).toBeNull();
  });

  it("leases retry-wait leads once retry time is due", async () => {
    insertLead({
      enrichment_status: "retry_wait",
      enrichment_attempt_count: 1,
      enrichment_next_retry_at: "2026-06-16T11:59:00.000Z",
    });

    const leased = await leaseNextLeadForEnrichment();

    expect(leased?.id).toBe("lead-1");
    expect(leased?.enrichment_status).toBe("running");
  });

  it("terminalizes rows that have exhausted max attempts", async () => {
    insertLead({
      enrichment_attempt_count: 3,
      enrichment_max_attempts: 3,
    });

    expect(await leaseNextLeadForEnrichment()).toBeNull();
    const row = testDb.prepare("SELECT enrichment_status, enrichment_last_error_code FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;
    expect(row.enrichment_status).toBe("error");
    expect(row.enrichment_last_error_code).toBe("max_attempts_exhausted");
  });

  it("marks transient failures as retry-wait and exhausted failures as error", async () => {
    insertLead({ enrichment_status: "running", enrichment_attempt_count: 1 });
    await markLeadEnrichmentFailed("lead-1", "temporary network failure", "network_transient", {
      nextRetryAt: "2026-06-16T12:01:00.000Z",
    });
    expect(testDb.prepare("SELECT enrichment_status, enrichment_next_retry_at FROM leads WHERE id = 'lead-1'").get()).toMatchObject({
      enrichment_status: "retry_wait",
      enrichment_next_retry_at: "2026-06-16T12:01:00.000Z",
    });

    testDb.prepare("UPDATE leads SET enrichment_status = 'running', enrichment_attempt_count = 3 WHERE id = 'lead-1'").run();
    await markLeadEnrichmentFailed("lead-1", "still failing", "generic_error_exhausted");
    expect(testDb.prepare("SELECT enrichment_status, enrichment_next_retry_at FROM leads WHERE id = 'lead-1'").get()).toMatchObject({
      enrichment_status: "error",
      enrichment_next_retry_at: null,
    });
  });
});
