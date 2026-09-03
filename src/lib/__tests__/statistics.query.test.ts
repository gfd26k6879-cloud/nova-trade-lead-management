import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const tenantContextMocks = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: dbMocks.getDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: tenantContextMocks.requireTenantContext,
}));

import { getLeads, getLeadsForExport, getStatisticsSummary } from "@/lib/db/queries";

function insertLead(opts: {
  id: string;
  businessType: string;
  discoveredAt: string;
  qualification?: string;
  excluded?: boolean;
  estimatedDealValue?: number;
  status?: string;
  meetingBookedAt?: string | null;
  updatedAt?: string;
  phone?: string | null;
  tenantId?: string;
  exclusionReason?: string | null;
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, phone, categories, primary_type, business_type, website_status,
      score, status, is_excluded, qualification_status, estimated_deal_value,
      discovered_at, meeting_booked_at, updated_at, tenant_id, exclusion_reason
    ) VALUES (?, ?, ?, ?, '[]', ?, ?, 'none', 10, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    `place-${opts.id}`,
    opts.id,
    opts.phone ?? null,
    opts.businessType === "plumbing" ? "plumber" : "dentist",
    opts.businessType,
    opts.status ?? "new",
    opts.excluded ? 1 : 0,
    opts.qualification ?? "qualified",
    opts.estimatedDealValue ?? 3000,
    opts.discoveredAt,
    opts.meetingBookedAt ?? null,
    opts.updatedAt ?? opts.discoveredAt,
    opts.tenantId ?? TENANT_A,
    opts.exclusionReason ?? null,
  );
}

beforeEach(() => {
  tenantContextMocks.requireTenantContext.mockReset();
  tenantContextMocks.requireTenantContext.mockReturnValue({ tenantId: TENANT_A, workspaceId: null });
  testDb = createTestDb();
  dbMocks.getDb.mockReset();
  dbMocks.getDb.mockImplementation(() => testDb);
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE demos ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE outreach_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE api_usage_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE ai_usage_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE ai_lead_verifications ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE crawl_runs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE crawl_units ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
  `);
});

afterEach(() => {
  testDb.close();
});

describe("statistics and business type queries", () => {
  it("rejects missing and workspace-scoped contexts before opening the database", async () => {
    tenantContextMocks.requireTenantContext.mockImplementationOnce(() => {
      throw new Error("Tenant context is required");
    });

    await expect(getStatisticsSummary()).rejects.toThrow("Tenant context is required");
    expect(dbMocks.getDb).not.toHaveBeenCalled();

    tenantContextMocks.requireTenantContext.mockReturnValueOnce({
      tenantId: TENANT_A,
      workspaceId: "workspace-a",
    });

    await expect(getStatisticsSummary()).rejects.toThrow("Tenant-wide context is required");
    expect(dbMocks.getDb).not.toHaveBeenCalled();
  });

  it("filters leads within trusted tenant context", async () => {
    insertLead({ id: "plumbing-lead", businessType: "plumbing", discoveredAt: "2026-05-01T10:00:00.000Z" });
    insertLead({ id: "dental-lead", businessType: "dental", discoveredAt: "2026-05-01T10:00:00.000Z" });

    expect((await getLeads({ businessType: "plumbing" })).leads.map((lead) => lead.id)).toEqual(["plumbing-lead"]);
    expect((await getLeadsForExport({ businessType: "dental" })).map((lead) => lead.id)).toEqual(["dental-lead"]);
  });

  it("builds date-scoped statistics with business type partitions", async () => {
    insertLead({
      id: "plumbing-lead",
      businessType: "plumbing",
      discoveredAt: "2026-05-03T10:00:00.000Z",
      estimatedDealValue: 4000,
      meetingBookedAt: "2026-05-05T10:00:00.000Z",
      status: "closed_won",
      updatedAt: "2026-05-06T10:00:00.000Z",
      phone: "303-555-0100",
    });
    insertLead({
      id: "dental-excluded",
      businessType: "dental",
      discoveredAt: "2026-05-04T10:00:00.000Z",
      excluded: true,
      qualification: "disqualified",
      estimatedDealValue: 4500,
    });
    insertLead({
      id: "old-lead",
      businessType: "legal",
      discoveredAt: "2026-04-01T10:00:00.000Z",
      estimatedDealValue: 5000,
    });

    testDb.prepare(
      "INSERT INTO outreach_events (id, lead_id, channel, created_at) VALUES ('event-1', 'plumbing-lead', 'call', '2026-05-05T12:00:00.000Z')"
    ).run();
    testDb.prepare(
      "INSERT INTO demos (id, lead_id, slug, config_json, is_published, view_count, created_at, updated_at) VALUES ('demo-1', 'plumbing-lead', 'demo-one', '{}', 1, 3, '2026-05-05T12:00:00.000Z', '2026-05-05T12:00:00.000Z')"
    ).run();
    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, estimated_cost, created_at)
       VALUES ('api-1', 'places.searchText', 'places_text_search_pro', 2.5, '2026-05-05T12:00:00.000Z')`
    ).run();

    const stats = await getStatisticsSummary({ range: "custom", from: "2026-05-01", to: "2026-05-31" });

    expect(stats.kpis.totalDiscovered).toBe(2);
    expect(stats.kpis.activeLeads).toBe(1);
    expect(stats.kpis.excludedLeads).toBe(1);
    expect(stats.kpis.contactedLeads).toBe(1);
    expect(stats.kpis.demosCreated).toBe(1);
    expect(stats.kpis.meetings).toBe(1);
    expect(stats.kpis.closedWon).toBe(1);
    expect(stats.economics.pipelineValue).toBe(4000);
    expect(stats.economics.apiCost).toBe(2.5);
    expect(stats.valueProof.qualifiedNoSiteLeads).toBe(1);
    expect(stats.valueProof.contactableLeads).toBe(1);
    expect(stats.valueProof.costPerQualifiedLead).toBe(2.5);
    expect(stats.valueProof.demosPublished).toBe(1);
    expect(stats.valueProof.demoViews).toBe(3);
    expect(stats.valueProof.demoToMeetingRate).toBe(100);
    expect(stats.valueProof.wins).toBe(1);
    expect(stats.valueProof.losses).toBe(0);

    const plumbing = stats.businessTypes.find((row) => row.id === "plumbing");
    const dental = stats.businessTypes.find((row) => row.id === "dental");
    expect(plumbing?.qualified).toBe(1);
    expect(plumbing?.contacted).toBe(1);
    expect(plumbing?.demos).toBe(1);
    expect(dental?.excluded).toBe(1);
  });

  it("isolates every statistics aggregate and label to the active tenant", async () => {
    insertLead({
      id: "lead-a",
      businessType: "plumbing",
      discoveredAt: "2026-05-03T10:00:00.000Z",
      estimatedDealValue: 4000,
    });
    insertLead({
      id: "excluded-a",
      businessType: "dental",
      discoveredAt: "2026-05-03T10:00:00.000Z",
      qualification: "disqualified",
      excluded: true,
      exclusionReason: "Tenant A reason",
    });
    insertLead({
      id: "lead-b",
      businessType: "legal",
      discoveredAt: "2026-05-03T10:00:00.000Z",
      estimatedDealValue: 9000,
      tenantId: TENANT_B,
    });
    insertLead({
      id: "excluded-b",
      businessType: "legal",
      discoveredAt: "2026-05-03T10:00:00.000Z",
      qualification: "disqualified",
      excluded: true,
      exclusionReason: "Tenant B secret reason",
      tenantId: TENANT_B,
    });

    testDb.prepare(
      `INSERT INTO outreach_events (id, lead_id, channel, tenant_id, created_at)
       VALUES (?, ?, 'call', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("outreach-a", "lead-a", TENANT_A);
    testDb.prepare(
      `INSERT INTO outreach_events (id, lead_id, channel, tenant_id, created_at)
       VALUES (?, ?, 'call', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("outreach-b", "lead-b", TENANT_B);

    testDb.prepare(
      `INSERT INTO demos (id, lead_id, slug, tenant_id, is_published, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, '2026-05-04T10:00:00.000Z', '2026-05-04T10:00:00.000Z')`,
    ).run("demo-a", "lead-a", "demo-a", TENANT_A, 2);
    testDb.prepare(
      `INSERT INTO demos (id, lead_id, slug, tenant_id, is_published, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, '2026-05-04T10:00:00.000Z', '2026-05-04T10:00:00.000Z')`,
    ).run("demo-b", "lead-b", "demo-b", TENANT_B, 99);

    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, estimated_cost, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, '2026-05-04T10:00:00.000Z')`,
    ).run("api-a", "tenant-a.endpoint", "tenant-a-sku", 1, TENANT_A);
    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, estimated_cost, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, '2026-05-04T10:00:00.000Z')`,
    ).run("api-b", "tenant-b.endpoint", "tenant-b-sku", 99, TENANT_B);

    testDb.prepare(
      `INSERT INTO ai_lead_verifications (id, lead_id, model, status, recommendation, tenant_id, created_at)
       VALUES (?, ?, 'test-model', 'no_site_found', 'review', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("verification-a", "lead-a", TENANT_A);
    testDb.prepare(
      `INSERT INTO ai_lead_verifications (id, lead_id, model, status, recommendation, found_email, tenant_id, created_at)
       VALUES (?, ?, 'test-model', 'site_found', 'review', 'cross-tenant@example.com', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("verification-b", "lead-a", TENANT_B);
    testDb.prepare(
      `INSERT INTO ai_usage_events (id, model, estimated_cost, tenant_id, created_at)
       VALUES (?, 'test-model', ?, ?, '2026-05-04T10:00:00.000Z')`,
    ).run("ai-usage-a", 0.5, TENANT_A);
    testDb.prepare(
      `INSERT INTO ai_usage_events (id, model, estimated_cost, tenant_id, created_at)
       VALUES (?, 'test-model', ?, ?, '2026-05-04T10:00:00.000Z')`,
    ).run("ai-usage-b", 50, TENANT_B);

    testDb.prepare(
      `INSERT INTO crawl_runs (id, status, categories, tenant_id, created_at)
       VALUES (?, 'error', '[]', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("run-a", TENANT_A);
    testDb.prepare(
      `INSERT INTO crawl_runs (id, status, categories, tenant_id, created_at)
       VALUES (?, 'error', '[]', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("run-b", TENANT_B);
    testDb.prepare(
      `INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, tenant_id, created_at)
       VALUES (?, ?, '80202', 'plumber', 'failed', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("unit-a", "run-a", TENANT_A);
    testDb.prepare(
      `INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, tenant_id, created_at)
       VALUES (?, ?, '80202', 'plumber', 'failed', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("unit-b", "run-b", TENANT_B);
    testDb.prepare(
      `INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, tenant_id, created_at)
       VALUES (?, ?, '80202', 'plumber', 'failed', ?, '2026-05-04T10:00:00.000Z')`,
    ).run("cross-tenant-unit", "run-a", TENANT_B);

    const stats = await getStatisticsSummary({ range: "custom", from: "2026-05-01", to: "2026-05-31" });

    expect(stats.kpis).toMatchObject({
      totalDiscovered: 2,
      activeLeads: 1,
      excludedLeads: 1,
      demosCreated: 1,
      contactedLeads: 1,
    });
    expect(stats.economics).toMatchObject({ pipelineValue: 4000, apiCalls: 1, apiCost: 1 });
    expect(stats.valueProof).toMatchObject({
      contactableLeads: 0,
      demosPublished: 1,
      demoViews: 2,
      blockedRuns: 1,
      failedUnits: 1,
      totalUnits: 1,
    });
    expect(stats.ai).toMatchObject({ calls: 1, cost: 0.5, verifications: 1 });
    expect(stats.businessTypes.find((row) => row.id === "plumbing")).toMatchObject({ total: 1, contacted: 1, demos: 1 });
    expect(stats.businessTypes.find((row) => row.id === "legal")).toMatchObject({ total: 0, contacted: 0, demos: 0 });
    expect(stats.dataQuality.exclusionReasons).toEqual([
      { key: "Tenant A reason", label: "Tenant A reason", count: 1 },
    ]);
    expect(stats.operations.apiByEndpoint).toEqual([
      { key: "tenant-a.endpoint", calls: 1, cost: 1 },
    ]);
    expect(stats.operations.apiBySku).toEqual([
      { key: "tenant-a-sku", calls: 1, cost: 1 },
    ]);
    expect(stats.operations.crawlRunsByStatus).toEqual([
      { key: "error", label: "error", count: 1 },
    ]);
    expect(stats.operations.failedUnits).toBe(1);
    expect(stats.operations.enrichmentBacklog).toBe(1);
  });
});
