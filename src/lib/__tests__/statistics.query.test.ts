import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: () => ({
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: null,
  }),
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
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, phone, categories, primary_type, business_type, website_status,
      score, status, is_excluded, qualification_status, estimated_deal_value,
      discovered_at, meeting_booked_at, updated_at
    ) VALUES (?, ?, ?, ?, '[]', ?, ?, 'none', 10, ?, ?, ?, ?, ?, ?, ?)`
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
  );
}

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec("ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '10000000-0000-4000-8000-000000000001'");
});

afterEach(() => {
  testDb.close();
});

describe("statistics and business type queries", () => {
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
});
