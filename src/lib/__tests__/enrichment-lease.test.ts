import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const NOW = "2026-06-16T12:00:00.000Z";
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
let memberContext: { tenantId: string; workspaceId: string | null } | null;
let workerContext: {
  tenantId: string;
  workspaceId: string | null;
  workerName: "enrichment" | "crawl";
  action: "enrichment:process" | "crawl:process";
};
let dbReads = 0;

vi.mock("@/lib/db/index", () => ({
  getDb: () => {
    dbReads += 1;
    return testDb;
  },
  generateId: () => crypto.randomUUID(),
  nowISO: () => NOW,
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: vi.fn(() => memberContext),
  requireTenantContext: vi.fn(() => {
    if (!memberContext) throw new Error("A tenant context is required");
    return memberContext;
  }),
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: vi.fn(() => workerContext),
}));

import {
  getUnenrichedLeads,
  leaseNextLeadForEnrichment,
  markLeadEnrichmentFailed,
  updateLeadEnrichment,
} from "@/lib/db/queries";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  memberContext = null;
  workerContext = {
    tenantId: TENANT_A,
    workspaceId: null,
    workerName: "enrichment",
    action: "enrichment:process",
  };
  dbReads = 0;
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    CREATE UNIQUE INDEX leads_tenant_place_id_unique ON leads (tenant_id, place_id);
  `);
});

afterEach(() => {
  testDb.close();
  vi.useRealTimers();
});

function insertLead(overrides: Record<string, unknown> = {}) {
  const data = {
    id: "lead-1",
    place_id: "place-1",
    tenant_id: TENANT_A,
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
      tenant_id, id, place_id, name, website_status, score, enrichment_status,
      enrichment_attempt_count, enrichment_max_attempts, enrichment_started_at, enrichment_next_retry_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.tenant_id,
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

function leaseToken(tenantId: string, leadId: string, attemptCount = 1) {
  return { tenantId, leadId, startedAt: NOW, attemptCount };
}

describe("enrichment leases", () => {
  it("rejects the wrong enrichment worker action before database access", async () => {
    workerContext = { ...workerContext, action: "crawl:process" };
    dbReads = 0;

    await expect(leaseNextLeadForEnrichment()).rejects.toThrow("Exact enrichment worker context is required");
    expect(dbReads).toBe(0);
  });

  it("rejects simultaneous member and enrichment worker authority before database access", async () => {
    memberContext = { tenantId: TENANT_A, workspaceId: null };
    dbReads = 0;

    await expect(leaseNextLeadForEnrichment()).rejects.toThrow("Conflicting enrichment tenant contexts");
    expect(dbReads).toBe(0);
  });

  it("leases and recovers only the active tenant's rows", async () => {
    insertLead({ id: "lead-a", place_id: "place-a" });
    insertLead({
      tenant_id: TENANT_B,
      id: "lead-b",
      place_id: "place-b",
      enrichment_status: "running",
      enrichment_attempt_count: 1,
      enrichment_started_at: "2026-06-16T11:00:00.000Z",
    });

    const leased = await leaseNextLeadForEnrichment();

    expect(leased).toMatchObject({ id: "lead-a", tenant_id: TENANT_A, enrichment_status: "running" });
    expect(testDb.prepare(
      "SELECT enrichment_status, enrichment_attempt_count FROM leads WHERE tenant_id = ? AND id = ?",
    ).get(TENANT_B, "lead-b")).toMatchObject({ enrichment_status: "running", enrichment_attempt_count: 1 });
  });

  it("scopes failure, update, and remaining reads to the active and leased tenant", async () => {
    insertLead({ id: "lead-a", place_id: "place-a" });
    insertLead({ tenant_id: TENANT_B, id: "lead-b", place_id: "place-b" });

    await markLeadEnrichmentFailed(leaseToken(TENANT_A, "lead-b"), "cross-tenant", "network_transient");
    await updateLeadEnrichment(leaseToken(TENANT_A, "lead-b"), { name: "Cross-tenant mutation" });

    expect(testDb.prepare("SELECT name, enrichment_status FROM leads WHERE tenant_id = ? AND id = ?")
      .get(TENANT_B, "lead-b")).toMatchObject({ name: "Lease Lead", enrichment_status: "pending" });
    await expect(getUnenrichedLeads(10)).resolves.toEqual([
      expect.objectContaining({ id: "lead-a" }),
    ]);
  });

  it("rejects a mismatched leased tenant before database access", async () => {
    dbReads = 0;

    await expect(markLeadEnrichmentFailed(leaseToken(TENANT_B, "lead-b"), "cross-tenant", "network_transient"))
      .rejects.toThrow("Enrichment tenant does not match the active worker context");
    await expect(updateLeadEnrichment(leaseToken(TENANT_B, "lead-b"), { name: "Cross-tenant mutation" }))
      .rejects.toThrow("Enrichment tenant does not match the active worker context");
    expect(dbReads).toBe(0);
  });

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

  it("fences a stale token after recovery and reacquisition while the current token completes", async () => {
    const staleStartedAt = "2026-06-16T11:00:00.000Z";
    insertLead({
      enrichment_status: "running",
      enrichment_attempt_count: 1,
      enrichment_started_at: staleStartedAt,
    });

    const reacquired = await leaseNextLeadForEnrichment();
    expect(reacquired?.enrichment_lease).toEqual({
      tenantId: TENANT_A,
      leadId: "lead-1",
      startedAt: NOW,
      attemptCount: 2,
    });
    if (!reacquired) throw new Error("Expected the stale enrichment lease to be reacquired.");

    const staleToken = {
      tenantId: TENANT_A,
      leadId: "lead-1",
      startedAt: staleStartedAt,
      attemptCount: 1,
    };
    await expect(updateLeadEnrichment(staleToken, { name: "Stale completion" })).resolves.toBe(false);
    await expect(markLeadEnrichmentFailed(
      staleToken,
      "stale worker failure",
      "network_transient",
    )).resolves.toBe(false);
    expect(testDb.prepare(
      "SELECT name, enrichment_status, enrichment_started_at, enrichment_attempt_count FROM leads WHERE tenant_id = ? AND id = ?",
    ).get(TENANT_A, "lead-1")).toMatchObject({
      name: "Lease Lead",
      enrichment_status: "running",
      enrichment_started_at: NOW,
      enrichment_attempt_count: 2,
    });

    await expect(updateLeadEnrichment(
      reacquired.enrichment_lease,
      { name: "Current completion" },
    )).resolves.toBe(true);
    expect(testDb.prepare(
      "SELECT name, enrichment_status, enrichment_attempt_count FROM leads WHERE tenant_id = ? AND id = ?",
    ).get(TENANT_A, "lead-1")).toMatchObject({
      name: "Current completion",
      enrichment_status: "enriched",
      enrichment_attempt_count: 2,
    });
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
    insertLead({ enrichment_status: "running", enrichment_attempt_count: 1, enrichment_started_at: NOW });
    await markLeadEnrichmentFailed(leaseToken(TENANT_A, "lead-1"), "temporary network failure", "network_transient", {
      nextRetryAt: "2026-06-16T12:01:00.000Z",
    });
    expect(testDb.prepare("SELECT enrichment_status, enrichment_next_retry_at FROM leads WHERE id = 'lead-1'").get()).toMatchObject({
      enrichment_status: "retry_wait",
      enrichment_next_retry_at: "2026-06-16T12:01:00.000Z",
    });

    testDb.prepare("UPDATE leads SET enrichment_status = 'running', enrichment_attempt_count = 3, enrichment_started_at = ? WHERE id = 'lead-1'").run(NOW);
    await markLeadEnrichmentFailed(leaseToken(TENANT_A, "lead-1", 3), "still failing", "generic_error_exhausted");
    expect(testDb.prepare("SELECT enrichment_status, enrichment_next_retry_at FROM leads WHERE id = 'lead-1'").get()).toMatchObject({
      enrichment_status: "error",
      enrichment_next_retry_at: null,
    });
  });
});
