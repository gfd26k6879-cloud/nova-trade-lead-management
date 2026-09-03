import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { SQLITE_SCHEMA_V1_SQL } from "@/lib/db/sqlite-schema-v1";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";

let testDb: Database.Database;
let activeTenantId: string | null = TENANT_A;
let workerTenantId: string | null = null;
let dbReads = 0;

vi.mock("@/lib/db/index", () => ({
  getDb: () => {
    dbReads += 1;
    return testDb;
  },
  generateId: () => crypto.randomUUID(),
  nowISO: () => "2026-08-30T12:00:00.000Z",
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: vi.fn(() => activeTenantId ? { tenantId: activeTenantId, workspaceId: null } : null),
  requireTenantContext: vi.fn(() => {
    if (!activeTenantId) throw new Error("A tenant context is required");
    return { tenantId: activeTenantId, workspaceId: null };
  }),
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: vi.fn(() => workerTenantId ? {
    tenantId: workerTenantId,
    workspaceId: null,
    workerName: "crawl",
    action: "crawl:process",
  } : null),
}));

import { upsertLead } from "@/lib/db/queries";

beforeEach(() => {
  activeTenantId = TENANT_A;
  workerTenantId = null;
  dbReads = 0;
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(SQLITE_SCHEMA_V1_SQL);
  const insertTenant = testDb.prepare(
    "INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')",
  );
  insertTenant.run(TENANT_A, "tenant-a", "Tenant A");
  insertTenant.run(TENANT_B, "tenant-b", "Tenant B");
});

afterEach(() => testDb.close());

describe("lead upsert against the finalized tenant schema", () => {
  it("derives mandatory tenant scope and permits the same place only across tenants", async () => {
    const first = await upsertLead({ place_id: "shared-place", name: "Tenant A Lead" });
    activeTenantId = TENANT_B;
    const second = await upsertLead({ place_id: "shared-place", name: "Tenant B Lead" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.id).not.toBe(first.id);
    expect(testDb.prepare(
      "SELECT tenant_id, place_id FROM leads WHERE place_id = ? ORDER BY tenant_id",
    ).all("shared-place")).toEqual([
      { tenant_id: TENANT_A, place_id: "shared-place" },
      { tenant_id: TENANT_B, place_id: "shared-place" },
    ]);
  });

  it("fails before SQL when no member or worker tenant context exists", async () => {
    activeTenantId = null;
    await expect(upsertLead({ place_id: "unscoped-place", name: "Unscoped" })).rejects.toThrow();
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM leads WHERE place_id = ?").get("unscoped-place"))
      .toEqual({ count: 0 });
  });

  it("rejects simultaneous member and worker authority before database access", async () => {
    workerTenantId = TENANT_A;
    dbReads = 0;

    await expect(upsertLead({ place_id: "dual-context", name: "Dual Context" }))
      .rejects.toThrow("Conflicting lead tenant contexts");
    expect(dbReads).toBe(0);
  });
});
