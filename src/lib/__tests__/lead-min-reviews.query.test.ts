import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryCall {
  sql: string;
  method: "get" | "all";
  params: unknown[];
}

const dbState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
}));

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

import {
  getBusinessTypeCounts,
  getKanbanLeads,
  getLeadMapPoints,
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

beforeEach(() => {
  dbState.calls = [];
});

describe("minimum-review query defense", () => {
  it.each(consumers)("binds one canonical int4 value in stable parameter order for %s", async (_name, run) => {
    await run({ status: "new", minReviews: 50, category: "dentist" });

    expect(dbState.calls.length).toBeGreaterThan(0);
    for (const call of dbState.calls) {
      expect(call.sql).toContain("l.review_count >= ?");
      expect(call.params.slice(0, 3)).toEqual(["new", 50, "dentist"]);
      expect(call.params.filter((value) => value === 50)).toHaveLength(1);
    }
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
