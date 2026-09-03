import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { SQLITE_SCHEMA_V1_SQL } from "@/lib/db/sqlite-schema-v1";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";

let tenantADb: Database.Database;
let tenantBDb: Database.Database;
let activeDb: Database.Database;
let memberContext: { tenantId: string; workspaceId: string | null } | null;
let workerContext: {
  tenantId: string;
  workspaceId: string | null;
  workerName: "score_recompute" | "crawl";
  action: "score_recompute:recompute" | "crawl:process";
} | null;
let dbReads = 0;

vi.mock("@/lib/db/index", () => ({
  getDb: () => {
    dbReads += 1;
    return activeDb;
  },
  generateId: () => crypto.randomUUID(),
  nowISO: () => "2026-08-30T12:00:00.000Z",
  withDbTransaction: async <T>(callback: () => Promise<T>) => callback(),
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

import { getSettings, getTenantScoreRecomputeSettings } from "@/lib/db/queries";

function createTenantDatabase(tenantId: string, slug: string, nicheWeights: Record<string, number>) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SQLITE_SCHEMA_V1_SQL);
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')")
    .run(tenantId, slug, slug);
  db.prepare("INSERT INTO settings (id, tenant_id, niche_weights) VALUES (1, ?, ?)")
    .run(tenantId, JSON.stringify(nicheWeights));
  return db;
}

beforeEach(() => {
  tenantADb = createTenantDatabase(TENANT_A, "tenant-a", { dentist: 7 });
  tenantBDb = createTenantDatabase(TENANT_B, "tenant-b", { plumber: 11 });
  activeDb = tenantADb;
  memberContext = { tenantId: TENANT_A, workspaceId: null };
  workerContext = null;
  dbReads = 0;
});

afterEach(() => {
  tenantADb.close();
  tenantBDb.close();
});

describe("score recompute settings against the finalized tenant schema", () => {
  it("loads only the exact member or worker tenant settings row", async () => {
    await expect(getTenantScoreRecomputeSettings()).resolves.toMatchObject({
      niche_weights: { dentist: 7 },
    });

    memberContext = { tenantId: TENANT_B, workspaceId: null };
    await expect(getTenantScoreRecomputeSettings()).rejects.toThrow("Tenant score settings are unavailable");

    activeDb = tenantBDb;
    await expect(getTenantScoreRecomputeSettings()).resolves.toMatchObject({
      niche_weights: { plumber: 11 },
    });

    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "score_recompute",
      action: "score_recompute:recompute",
    };
    activeDb = tenantADb;
    await expect(getSettings()).resolves.toMatchObject({ niche_weights: { dentist: 7 } });
  });

  it("rejects same-tenant member and worker authority before database access", async () => {
    memberContext = { tenantId: TENANT_A, workspaceId: null };
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "score_recompute",
      action: "score_recompute:recompute",
    };
    dbReads = 0;

    await expect(getTenantScoreRecomputeSettings()).rejects.toThrow("Conflicting score tenant contexts");
    expect(dbReads).toBe(0);
  });

  it("rejects a score worker with the wrong action before database access", async () => {
    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "score_recompute",
      action: "crawl:process",
    };
    dbReads = 0;

    await expect(getTenantScoreRecomputeSettings()).rejects.toThrow("Exact score recompute worker context is required");
    expect(dbReads).toBe(0);
  });

  it("rejects direct tenant score settings access from a different worker before database access", async () => {
    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "crawl",
      action: "score_recompute:recompute",
    };
    dbReads = 0;

    await expect(getTenantScoreRecomputeSettings()).rejects.toThrow("Exact score recompute worker context is required");
    expect(dbReads).toBe(0);
  });

  it("rejects simultaneous member and non-score worker authority before generic settings access", async () => {
    memberContext = { tenantId: TENANT_A, workspaceId: null };
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "crawl",
      action: "crawl:process",
    };
    dbReads = 0;

    await expect(getSettings()).rejects.toThrow("Conflicting settings tenant contexts");
    expect(dbReads).toBe(0);
  });
});
