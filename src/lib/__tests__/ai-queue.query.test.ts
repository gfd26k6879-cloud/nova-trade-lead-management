import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000001";

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

import {
  createAiLeadVerification,
  getAiQueueStats,
  getNextAiVerificationJob,
  leaseNextAiVerificationJob,
  markLeadAiQueueError,
  markLeadAiQueued,
  markLeadAiRunning,
  markLeadAiVerified,
} from "@/lib/db/queries";
import { queueMissingAiVerifications } from "@/lib/ai/verification-worker";

function insertLead(id = "lead-1", tenantId = TENANT_A) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      tenant_id, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, 'Gateway Park Dental', '123 Main St, Denver, CO', '303-555-0100', '["dentist"]', 'none', 12, 'new',
      'qualified', 1, 4500, ?,
      '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(id, `place-${id}`, tenantId);
}

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec("ALTER TABLE leads ADD COLUMN tenant_id TEXT");
  insertLead();
});

afterEach(() => {
  testDb.close();
});

describe("AI queue queries", () => {
  it("queues, leases, and marks a lead verified", async () => {
    await markLeadAiQueued("lead-1", "hash-1", true);
    expect((await getAiQueueStats()).queued).toBe(1);

    const job = await getNextAiVerificationJob(3);
    expect(job?.id).toBe("lead-1");

    await markLeadAiRunning("lead-1", "hash-1");
    expect((await getAiQueueStats()).running).toBe(1);

    await markLeadAiVerified("lead-1", "hash-1");
    expect((await getAiQueueStats()).verified).toBe(1);
  });

  it("marks the queue verified without overwriting a computed win probability", async () => {
    await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "no_site_found",
      confidence: 0.86,
      recommendation: "prioritize",
      reason: "No official website found.",
      summary: "No usable official website was found.",
      input_hash: "hash-1",
    });
    testDb.prepare("UPDATE leads SET win_probability_score = 73 WHERE id = 'lead-1'").run();

    await markLeadAiVerified("lead-1", "hash-1");

    const row = testDb.prepare(
      "SELECT ai_queue_status, ai_input_hash, win_probability_score FROM leads WHERE id = 'lead-1'",
    ).get() as Record<string, unknown>;
    expect(row.ai_queue_status).toBe("verified");
    expect(row.ai_input_hash).toBe("hash-1");
    expect(row.win_probability_score).toBe(73);
  });

  it("atomically leases one AI verification job", async () => {
    insertLead("lead-2");
    await markLeadAiQueued("lead-1", "hash-1", true);
    await markLeadAiQueued("lead-2", "hash-2", true);

    const first = await leaseNextAiVerificationJob(3);
    const second = await leaseNextAiVerificationJob(3);
    const third = await leaseNextAiVerificationJob(3);

    expect(new Set([first?.id, second?.id])).toEqual(new Set(["lead-1", "lead-2"]));
    expect(third).toBeNull();
    expect((await getAiQueueStats()).running).toBe(2);
  });

  it("retries until max attempts then marks queue error", async () => {
    await markLeadAiQueued("lead-1", "hash-1", true);
    await markLeadAiRunning("lead-1", "hash-1");
    await markLeadAiQueueError("lead-1", "temporary failure", 2);

    let row = testDb.prepare("SELECT ai_queue_status, ai_next_retry_at FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;
    expect(row.ai_queue_status).toBe("queued");
    expect(row.ai_next_retry_at).toBeTruthy();

    testDb.prepare("UPDATE leads SET ai_next_retry_at = NULL").run();
    await markLeadAiRunning("lead-1", "hash-1");
    await markLeadAiQueueError("lead-1", "permanent failure", 2);

    row = testDb.prepare("SELECT ai_queue_status, ai_last_error FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;
    expect(row.ai_queue_status).toBe("error");
    expect(row.ai_last_error).toBe("permanent failure");
  });

  it("backfills missing and stale AI verification while skipping closed leads", async () => {
    testDb.prepare("UPDATE settings SET ai_enabled = 1 WHERE id = 1").run();
    await markLeadAiQueued("lead-1", "stale-hash", true);
    await markLeadAiVerified("lead-1", "stale-hash");

    insertLead("lead-2");
    testDb.prepare("UPDATE leads SET status = 'closed_lost' WHERE id = 'lead-2'").run();
    insertLead("lead-3");
    insertLead("lead-foreign", TENANT_B);

    const result = await queueMissingAiVerifications(TENANT_A);
    expect("error" in result).toBe(false);

    const rows = testDb.prepare("SELECT id, ai_queue_status FROM leads ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.id === "lead-1")?.ai_queue_status).toBe("queued");
    expect(rows.find((row) => row.id === "lead-2")?.ai_queue_status).toBe("not_checked");
    expect(rows.find((row) => row.id === "lead-3")?.ai_queue_status).toBe("queued");
    expect(rows.find((row) => row.id === "lead-foreign")?.ai_queue_status).toBe("not_checked");
  });
});
