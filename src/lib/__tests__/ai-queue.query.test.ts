import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000001";
let dbReads = 0;
let memberContext: {
  tenantId: string;
  workspaceId: string | null;
  membershipId: string;
  role: "owner";
  roleBindingId: string;
  actorAuthIdentityId: string;
  correlationId: string;
} | null;
let workerContext: {
  tenantId: string;
  workspaceId: string | null;
  workerName: string;
  action: string;
} | null;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => {
      dbReads += 1;
      return testDb;
    },
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => memberContext,
  requireTenantContext: () => {
    if (!memberContext) throw new Error("Tenant context is required");
    return memberContext;
  },
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: () => workerContext,
}));

import {
  createAiLeadVerification,
  getAiVerificationBackfillCandidates,
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
  dbReads = 0;
  memberContext = {
    tenantId: TENANT_A,
    workspaceId: null,
    membershipId: "10000000-0000-4000-8000-000000000002",
    role: "owner",
    roleBindingId: "10000000-0000-4000-8000-000000000003",
    actorAuthIdentityId: "10000000-0000-4000-8000-000000000004",
    correlationId: "ai-queue-test",
  };
  workerContext = null;
  testDb = createTestDb();
  testDb.exec("ALTER TABLE leads ADD COLUMN tenant_id TEXT");
  testDb.exec(`ALTER TABLE ai_lead_verifications ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}'`);
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

    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "ai_verification",
      action: "ai_verification:process",
    };

    const result = await queueMissingAiVerifications(TENANT_A);
    expect("error" in result).toBe(false);

    const rows = testDb.prepare("SELECT id, ai_queue_status FROM leads ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.id === "lead-1")?.ai_queue_status).toBe("queued");
    expect(rows.find((row) => row.id === "lead-2")?.ai_queue_status).toBe("not_checked");
    expect(rows.find((row) => row.id === "lead-3")?.ai_queue_status).toBe("queued");
    expect(rows.find((row) => row.id === "lead-foreign")?.ai_queue_status).toBe("not_checked");
  });

  it("never leases or mutates another tenant's queued lead", async () => {
    insertLead("lead-foreign", TENANT_B);
    testDb.prepare("UPDATE leads SET ai_queue_status = 'queued' WHERE id = 'lead-foreign'").run();

    expect(await markLeadAiRunning("lead-foreign", "foreign-hash")).toBe(0);
    expect(await leaseNextAiVerificationJob(3)).toBeNull();
    expect(testDb.prepare("SELECT ai_queue_status FROM leads WHERE id = 'lead-foreign'").get())
      .toEqual({ ai_queue_status: "queued" });
  });

  it("allows member and AI-worker backfill reads but rejects crawl and enrichment before database access", async () => {
    await expect(getAiVerificationBackfillCandidates(10, TENANT_A)).resolves.toEqual([
      expect.objectContaining({ id: "lead-1" }),
    ]);

    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "ai_verification",
      action: "ai_verification:process",
    };
    await expect(getAiVerificationBackfillCandidates(10, TENANT_A)).resolves.toEqual([
      expect.objectContaining({ id: "lead-1" }),
    ]);

    for (const workerName of ["crawl", "enrichment"] as const) {
      workerContext = {
        tenantId: TENANT_A,
        workspaceId: null,
        workerName,
        action: `${workerName}:process`,
      };
      const before = dbReads;
      await expect(getAiVerificationBackfillCandidates(10, TENANT_A))
        .rejects.toThrow("Exact AI worker context is required.");
      expect(dbReads).toBe(before);
    }
  });

  it("rejects wrong and dual worker authority before opening the database", async () => {
    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "ai_verification",
      action: "ai_verification:wrong",
    };
    const beforeWrong = dbReads;
    await expect(leaseNextAiVerificationJob(3)).rejects.toThrow("Exact AI worker context is required.");
    expect(dbReads).toBe(beforeWrong);

    memberContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      membershipId: "10000000-0000-4000-8000-000000000002",
      role: "owner",
      roleBindingId: "10000000-0000-4000-8000-000000000003",
      actorAuthIdentityId: "10000000-0000-4000-8000-000000000004",
      correlationId: "ai-queue-test",
    };
    workerContext.action = "ai_verification:process";
    const beforeDual = dbReads;
    await expect(markLeadAiQueueError("lead-1", "nope", 3)).rejects.toThrow("Conflicting AI tenant contexts.");
    expect(dbReads).toBe(beforeDual);
  });
});
