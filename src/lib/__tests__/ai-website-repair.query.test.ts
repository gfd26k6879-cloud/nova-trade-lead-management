import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: vi.fn(() => ({ tenantId: TENANT_A, workspaceId: null })),
  requireTenantContext: vi.fn(() => ({ tenantId: TENANT_A, workspaceId: null })),
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: vi.fn(() => null),
}));

import { repairAiWebsiteFindingConsistency } from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec(`ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}'`);
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      ai_verification_status, ai_website_viability_status, ai_found_website_url,
      quality_bucket, raw_opportunity_score, verification_score, sales_priority_score, lead_quality_score,
      discovered_at, created_at, updated_at
    ) VALUES (
      'lead-1', 'place-1', 'Gateway Park Dental', '123 Main St, Denver, CO', '303-555-0100', '["dentist"]', 'none', 12, 'new',
      'qualified', 80, 4500,
      'site_found', 'usable', 'https://gatewayparkdental.com',
      'ready_to_call', 80, 90, 85, 88,
      '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run();
});

afterEach(() => {
  testDb.close();
});

describe("AI website finding repair", () => {
  it("removes usable website findings from no-site queues and recomputes quality", async () => {
    const repaired = await repairAiWebsiteFindingConsistency(10);

    expect(repaired).toBe(1);
    const row = testDb.prepare(
      `SELECT website_uri, website_status, qualification_status, disqualification_reason,
              score, lead_quality_score, raw_opportunity_score, verification_score, sales_priority_score, quality_bucket
       FROM leads WHERE id = 'lead-1'`
    ).get() as Record<string, unknown>;

    expect(row.website_uri).toBe("https://gatewayparkdental.com");
    expect(row.website_status).toBe("custom");
    expect(row.qualification_status).toBe("disqualified");
    expect(row.disqualification_reason).toBe("AI found existing usable website");
    expect(row.score).toBe(0);
    expect(row.quality_bucket).toBe("not_a_fit");
    expect(row.lead_quality_score).toBe(0);
    expect(row.raw_opportunity_score).toBe(0);
    expect(row.verification_score).toBe(0);
    expect(row.sales_priority_score).toBe(0);
  });
});
