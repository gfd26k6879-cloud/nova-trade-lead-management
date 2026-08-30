import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryCall {
  sql: string;
  method: "get" | "all";
  params: unknown[];
}

const dbState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
}));

const tenantContextMocks = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
}));

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";

vi.mock("@/lib/db/index", () => ({
  getDb: async () => ({
    prepare: (sql: string) => ({
      get: (...params: unknown[]) => {
        dbState.calls.push({ sql, method: "get", params });
        return { count: 0 };
      },
      all: (...params: unknown[]) => {
        dbState.calls.push({ sql, method: "all", params });
        return [];
      },
      run: () => ({ changes: 0 }),
    }),
    exec: () => undefined,
  }),
  generateId: () => "generated-id",
  nowISO: () => "2026-08-01T00:00:00.000Z",
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: vi.fn(() => null),
  requireTenantContext: tenantContextMocks.requireTenantContext,
}));

import {
  getCanonicalPlacesForExport,
  getBusinessTypeCounts,
  getKanbanLeads,
  getLeadMapPoints,
  getLeadMapZipCoverage,
  getLeads,
  getLeadsForExport,
  type LeadFilters,
} from "@/lib/db/queries";

const consumers = [
  ["list", (filters: LeadFilters) => getLeads(filters)],
  ["map", (filters: LeadFilters) => getLeadMapPoints(filters, 25)],
  ["export", (filters: LeadFilters) => getLeadsForExport(filters, 25)],
  ["business counts", (filters: LeadFilters) => getBusinessTypeCounts(filters)],
  ["kanban", (filters: LeadFilters) => getKanbanLeads(filters)],
] as const;

const tenantWideLeadListConsumers = [
  ["list", (filters: LeadFilters) => getLeads(filters)],
  ["business counts", (filters: LeadFilters) => getBusinessTypeCounts(filters)],
  ["kanban", (filters: LeadFilters) => getKanbanLeads(filters)],
] as const;

beforeEach(() => {
  dbState.calls = [];
  tenantContextMocks.requireTenantContext.mockReset();
  tenantContextMocks.requireTenantContext.mockReturnValue({ tenantId: TENANT_A, workspaceId: null });
});

describe("minimum-review query defense", () => {
  it("fails before database access when export tenant context is absent", async () => {
    tenantContextMocks.requireTenantContext.mockImplementationOnce(() => {
      throw new Error("A tenant context is required");
    });

    await expect(getLeadsForExport({}, 25)).rejects.toThrow("A tenant context is required");
    expect(dbState.calls).toEqual([]);
  });

  it.each(consumers)("binds one canonical int4 value in stable parameter order for %s", async (_name, run) => {
    await run({ status: "new", minReviews: 50, category: "dentist" });

    expect(dbState.calls.length).toBeGreaterThan(0);
    for (const call of dbState.calls) {
      expect(call.sql).toContain("l.review_count >= ?");
      expect(call.params.slice(0, 3)).toEqual(["new", 50, "dentist"]);
      expect(call.params.filter((value) => value === 50)).toHaveLength(1);
    }
  });

  it("binds each export to the current trusted tenant context", async () => {
    tenantContextMocks.requireTenantContext
      .mockReturnValueOnce({ tenantId: TENANT_A, workspaceId: null })
      .mockReturnValueOnce({ tenantId: TENANT_B, workspaceId: null });

    await getLeadsForExport({ status: "new" }, 25);
    await getLeadsForExport({ status: "new" }, 25);

    expect(dbState.calls).toHaveLength(2);
    expect(dbState.calls[0].sql).toContain("l.tenant_id = ?");
    expect(dbState.calls[0].params).toEqual(["new", TENANT_A, 25]);
    expect(dbState.calls[1].params).toEqual(["new", TENANT_B, 25]);
    expect(dbState.calls[0].sql).toContain("tenant_membership.tenant_id = l.tenant_id");
    expect(dbState.calls[0].sql).not.toContain("JOIN tenant_memberships tenant_membership");
  });

  it.each(tenantWideLeadListConsumers)("tenant-scopes every query before returning %s data", async (_name, run) => {
    await run({ status: "new", pageSize: 25 });

    expect(dbState.calls.length).toBeGreaterThan(0);
    for (const call of dbState.calls) {
      expect(call.sql).toContain("l.tenant_id = ?");
      expect(call.params).toContain(TENANT_A);
    }
    const rowQuery = dbState.calls.find((call) => call.sql.includes("assigned_user_email"));
    if (rowQuery) {
      expect(rowQuery.sql).toContain("tenant_membership.tenant_id = l.tenant_id");
      expect(rowQuery.sql).toContain("tenant_membership.status = 'active'");
      expect(rowQuery.sql).not.toContain("JOIN tenant_memberships tenant_membership");
    }
  });

  it("binds primary list counts and rows to separate trusted tenants", async () => {
    tenantContextMocks.requireTenantContext
      .mockReturnValueOnce({ tenantId: TENANT_A, workspaceId: null })
      .mockReturnValueOnce({ tenantId: TENANT_B, workspaceId: null });

    await getLeads({ status: "new", pageSize: 25 });
    await getLeads({ status: "new", pageSize: 25 });

    expect(dbState.calls).toHaveLength(4);
    expect(dbState.calls[0].params).toEqual(["new", TENANT_A]);
    expect(dbState.calls[1].params).toEqual(["new", TENANT_A, 25, 0]);
    expect(dbState.calls[2].params).toEqual(["new", TENANT_B]);
    expect(dbState.calls[3].params).toEqual(["new", TENANT_B, 25, 0]);
  });

  it.each(tenantWideLeadListConsumers)("requires tenant context before database access for %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockImplementation(() => {
      throw new Error("A tenant context is required");
    });

    await expect(run({})).rejects.toThrow("A tenant context is required");
    expect(dbState.calls).toEqual([]);
  });

  it.each(tenantWideLeadListConsumers)("rejects workspace-narrowed context before database access for %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockReturnValue({
      tenantId: TENANT_A,
      workspaceId: "30000000-0000-4000-8000-000000000003",
    });

    await expect(run({})).rejects.toThrow("Tenant-wide context is required");
    expect(dbState.calls).toEqual([]);
  });

  it("scopes canonical rows and their lead join to the same tenant", async () => {
    tenantContextMocks.requireTenantContext
      .mockReturnValueOnce({ tenantId: TENANT_A, workspaceId: null })
      .mockReturnValueOnce({ tenantId: TENANT_B, workspaceId: null });

    await getCanonicalPlacesForExport(25);
    await getCanonicalPlacesForExport(25);

    expect(dbState.calls).toHaveLength(2);
    expect(dbState.calls[0].sql).toContain("l.tenant_id = pm.tenant_id");
    expect(dbState.calls[0].sql).toContain("WHERE pm.tenant_id = ?");
    expect(dbState.calls[0].params).toEqual([TENANT_A, 25]);
    expect(dbState.calls[1].params).toEqual([TENANT_B, 25]);
  });

  it("binds map points and assignment identity joins to the current tenant", async () => {
    tenantContextMocks.requireTenantContext
      .mockReturnValueOnce({ tenantId: TENANT_A, workspaceId: null })
      .mockReturnValueOnce({ tenantId: TENANT_B, workspaceId: null });

    await getLeadMapPoints({ status: "new" }, 25, { includeTotal: true });
    await getLeadMapPoints({ status: "new" }, 25, { includeTotal: true });

    expect(dbState.calls).toHaveLength(4);
    for (const call of dbState.calls) {
      expect(call.sql).toContain("l.tenant_id = ?");
    }
    expect(dbState.calls[0].params).toEqual(["new", TENANT_A]);
    expect(dbState.calls[1].params).toEqual(["new", TENANT_A, 25]);
    expect(dbState.calls[2].params).toEqual(["new", TENANT_B]);
    expect(dbState.calls[3].params).toEqual(["new", TENANT_B, 25]);
    expect(dbState.calls[1].sql).toContain("tenant_membership.tenant_id = l.tenant_id");
    expect(dbState.calls[1].sql).toContain("EXISTS (");
    expect(dbState.calls[1].sql).not.toContain("JOIN tenant_memberships tenant_membership");
  });

  it("binds zip coverage existence checks to separate trusted tenants", async () => {
    tenantContextMocks.requireTenantContext
      .mockReturnValueOnce({ tenantId: TENANT_A, workspaceId: null })
      .mockReturnValueOnce({ tenantId: TENANT_B, workspaceId: null });

    await getLeadMapZipCoverage();
    await getLeadMapZipCoverage();

    expect(dbState.calls).toHaveLength(2);
    expect(dbState.calls[0].sql).toContain("tenant_lead.tenant_id = ?");
    expect(dbState.calls[0].params).toEqual([TENANT_A]);
    expect(dbState.calls[1].params).toEqual([TENANT_B]);
  });

  it.each([
    ["points", () => getLeadMapPoints({}, 25)],
    ["zip coverage", () => getLeadMapZipCoverage()],
  ])("rejects workspace-narrowed context before database access for map %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockReturnValue({
      tenantId: TENANT_A,
      workspaceId: "30000000-0000-4000-8000-000000000003",
    });

    await expect(run()).rejects.toBeInstanceOf(Error);
    expect(dbState.calls).toEqual([]);
  });

  it.each([
    ["points", () => getLeadMapPoints({}, 25)],
    ["zip coverage", () => getLeadMapZipCoverage()],
  ])("requires tenant context before database access for map %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockImplementation(() => {
      throw new Error("A tenant context is required");
    });

    await expect(run()).rejects.toThrow("A tenant context is required");
    expect(dbState.calls).toEqual([]);
  });

  it.each(consumers)("uses a parameter-free false condition above int4 for %s", async (_name, run) => {
    await run({ status: "new", minReviews: 2_147_483_648, category: "dentist" });

    expect(dbState.calls.length).toBeGreaterThan(0);
    for (const call of dbState.calls) {
      expect(call.sql).toContain("1 = 0");
      expect(call.sql).not.toContain("l.review_count >= ?");
      expect(call.params).not.toContain(2_147_483_648);
      expect(call.params.slice(0, 2)).toEqual(["new", "dentist"]);
    }
  });

  it.each(consumers)("omits zero and invalid runtime values for %s", async (_name, run) => {
    for (const minReviews of [0, 4.5, Number.NaN, "50reviews" as unknown as number]) {
      dbState.calls = [];
      await run({ status: "new", minReviews, category: "dentist" });

      for (const call of dbState.calls) {
        expect(call.sql).not.toContain("l.review_count >= ?");
        expect(call.sql).not.toContain("1 = 0");
        expect(call.params.slice(0, 2)).toEqual(["new", "dentist"]);
      }
    }
  });
});
