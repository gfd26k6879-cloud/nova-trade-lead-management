import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, seedTestRun, seedTestUnit, seedTestZip } from "./test-helpers";

let testDb: Database.Database;

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  withTenantDbContext: vi.fn((fn: (db: unknown) => Promise<unknown>) => fn(testDb)),
}));

const tenantAuthorizationMocks = vi.hoisted(() => ({
  requireTenantPermission: vi.fn(),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
  getTenantContext: vi.fn(),
  getCurrentTenantPolicy: vi.fn(),
}));

const googlePlacesMocks = vi.hoisted(() => ({
  textSearch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePermission: authMocks.requirePermission,
}));

vi.mock("@/lib/tenancy/authorize", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tenancy/authorize")>(),
  requireTenantPermission: tenantAuthorizationMocks.requireTenantPermission,
}));

vi.mock("@/lib/tenancy/context", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tenancy/context")>(),
  runWithTenantContext: tenantAuthorizationMocks.runWithTenantContext,
  getTenantContext: tenantAuthorizationMocks.getTenantContext,
}));

vi.mock("@/lib/tenancy/queries", () => ({
  createTenantQueryRepository: vi.fn(() => ({
    getCurrentTenantPolicy: tenantAuthorizationMocks.getCurrentTenantPolicy,
  })),
}));

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
    isDbStatementTimeoutError: dbIndexMocks.isDbStatementTimeoutError,
    isTransientDbError: dbIndexMocks.isTransientDbError,
    withDbStatementTimeout: dbIndexMocks.withDbStatementTimeout,
    withTenantDbContext: dbIndexMocks.withTenantDbContext,
  };
});

vi.mock("@/lib/google-places", () => {
  class PlacesApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: string,
      message = `Places API error ${status}: ${body}`,
    ) {
      super(message);
      this.name = "PlacesApiError";
    }
  }
  return {
    textSearch: googlePlacesMocks.textSearch,
    PlacesApiError,
    TEXT_SEARCH_FIELD_MASK: "places.id,places.displayName,places.websiteUri,places.rating",
    TEXT_SEARCH_PRO_FIELD_MASK: "places.id,places.displayName,places.formattedAddress,places.location",
  };
});

import {
  getCoverageCellLedgerAction,
  getCoverageDiscoveryItemListAction,
  getCoverageDiscoveryItemsAction,
  getCoverageProbeCandidatesAction,
  getCoverageSelectedRunAction,
  getDashboardAnalyticsAction,
  getDashboardStatsAction,
  getSchedulerOperationsAction,
  estimateDiscoveryRunAction,
  promoteProbeToLeadHarvestAction,
  resumeCrawlRunAction,
  retryFailedUnitsAction,
  startCrawlRunAction,
  stopCrawlRunAction,
} from "@/lib/crawl/actions";
import { PlacesApiError } from "@/lib/google-places";
import { TenantAuthorizationError } from "@/lib/tenancy/authorize";
import { TENANT_POLICY_DEFAULTS } from "@/lib/tenancy/schemas";

const originalGooglePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_SESSION = Object.freeze({
  userId: "admin-1",
  email: "admin@example.com",
  displayName: "Admin",
  tenantId: TENANT_ID,
  workspaceId: WORKSPACE_ID,
  membershipId: "30000000-0000-4000-8000-000000000001",
  role: "owner" as const,
  roleBindingId: "40000000-0000-4000-8000-000000000001",
});
const TENANT_WIDE_SESSION = Object.freeze({
  ...TENANT_SESSION,
  workspaceId: null,
});

function sourcePolicy(overrides: Record<string, unknown> = {}) {
  return {
    ...TENANT_POLICY_DEFAULTS,
    id: "50000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    version: 1,
    sourceResearchEnabled: true,
    requireSourcePlanApproval: false,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDb();
  seedTestZip(testDb, "80202", "Denver", 39.75, -104.99, "Denver");
  process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
  googlePlacesMocks.textSearch.mockReset();
  googlePlacesMocks.textSearch.mockResolvedValue({ places: [] });
  dbIndexMocks.isDbStatementTimeoutError.mockImplementation((error: unknown) => (error as { code?: string }).code === "57014");
  dbIndexMocks.isTransientDbError.mockReturnValue(false);
  dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
  dbIndexMocks.withTenantDbContext.mockClear();
  dbIndexMocks.withTenantDbContext.mockImplementation((fn: (db: unknown) => Promise<unknown>) => fn(testDb));
  tenantAuthorizationMocks.requireTenantPermission.mockReset();
  tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue(TENANT_SESSION);
  authMocks.requirePermission.mockReset();
  authMocks.requirePermission.mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
  });
  tenantAuthorizationMocks.runWithTenantContext.mockClear();
  tenantAuthorizationMocks.getTenantContext.mockReset();
  tenantAuthorizationMocks.getTenantContext.mockReturnValue(null);
  tenantAuthorizationMocks.getCurrentTenantPolicy.mockReset();
  tenantAuthorizationMocks.getCurrentTenantPolicy.mockResolvedValue(sourcePolicy());
});

afterEach(() => {
  if (originalGooglePlacesApiKey === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = originalGooglePlacesApiKey;
  }
  testDb.close();
});

describe("scheduler operations action", () => {
  it("requires tenant-wide queue read authority before entering tenant database context", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);

    const result = await getSchedulerOperationsAction({
      tenantId: TENANT_ID,
      workspaceId: null,
    });

    expect(result).toBeDefined();
    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, workspaceId: null },
      "queue:read",
      { action: "scheduler.operations.read" },
    );
    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_WIDE_SESSION,
      expect.stringMatching(/^scheduler-operations:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(tenantAuthorizationMocks.requireTenantPermission.mock.invocationCallOrder[0]).toBeLessThan(
      tenantAuthorizationMocks.runWithTenantContext.mock.invocationCallOrder[0],
    );
    expect(tenantAuthorizationMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
  });

  it("rejects workspace-scoped scheduler reads before database work", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_SESSION);

    await expect(getSchedulerOperationsAction({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    })).rejects.toMatchObject({
      code: "WORKSPACE_SCOPE_INVALID",
      status: 403,
    });

    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
  });

  it("rejects composed identities before tenant context or scheduler database reads", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);
    authMocks.requirePermission.mockResolvedValueOnce({
      userId: "different-user",
      email: "different@example.com",
      displayName: "Different user",
      role: "admin",
    });

    await expect(getSchedulerOperationsAction()).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });

    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
  });

  it("preserves an established correlation when called by the Scheduler page boundary", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);
    tenantAuthorizationMocks.getTenantContext.mockReturnValueOnce({
      tenantId: TENANT_ID,
      workspaceId: null,
      membershipId: TENANT_WIDE_SESSION.membershipId,
      role: TENANT_WIDE_SESSION.role,
      roleBindingId: TENANT_WIDE_SESSION.roleBindingId,
      actorAuthIdentityId: TENANT_WIDE_SESSION.userId,
      correlationId: "scheduler-page:existing",
    });

    await getSchedulerOperationsAction();

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      {},
      "queue:read",
      { action: "scheduler.operations.read" },
    );
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_WIDE_SESSION,
      "scheduler-page:existing",
      expect.any(Function),
    );
  });

  it("propagates canonical tenant authorization failures without reading scheduler data", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValueOnce(
      new TenantAuthorizationError(403, "TENANT_SCOPE_REQUIRED"),
    );

    await expect(getSchedulerOperationsAction({ tenantId: "forged-tenant" })).rejects.toMatchObject({
      code: "TENANT_SCOPE_REQUIRED",
      status: 403,
    });

    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
  });
});

describe("dashboard read action tenant boundary", () => {
  it("runs dashboard stats under exact tenant-wide report authority and database context", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);

    const result = await getDashboardStatsAction({ tenantId: TENANT_ID, workspaceId: null });

    expect(result).toBeDefined();
    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, workspaceId: null },
      "report:read",
      { action: "dashboard.stats.read" },
    );
    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_WIDE_SESSION,
      expect.stringMatching(/^dashboard-stats:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(tenantAuthorizationMocks.requireTenantPermission.mock.invocationCallOrder[0]).toBeLessThan(
      tenantAuthorizationMocks.runWithTenantContext.mock.invocationCallOrder[0],
    );
    expect(tenantAuthorizationMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
  });

  it("runs dashboard analytics under its explicit tenant-wide report action", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);

    await getDashboardAnalyticsAction({ tenantId: TENANT_ID, workspaceId: null });

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, workspaceId: null },
      "report:read",
      { action: "dashboard.analytics.read" },
    );
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_WIDE_SESSION,
      expect.stringMatching(/^dashboard-analytics:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
  });

  it("rejects workspace and composed-identity scopes before dashboard database work", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_SESSION);

    await expect(getDashboardStatsAction({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    })).rejects.toMatchObject({
      code: "WORKSPACE_SCOPE_INVALID",
      status: 403,
    });

    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);
    authMocks.requirePermission.mockResolvedValueOnce({
      userId: "different-user",
      email: "different@example.com",
      displayName: "Different user",
      role: "admin",
    });

    await expect(getDashboardAnalyticsAction()).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });

    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
  });

  it("propagates forged tenant selector failures before legacy auth or dashboard reads", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValueOnce(
      new TenantAuthorizationError(403, "TENANT_SCOPE_REQUIRED"),
    );

    await expect(getDashboardStatsAction({ tenantId: "forged-tenant" })).rejects.toMatchObject({
      code: "TENANT_SCOPE_REQUIRED",
      status: 403,
    });

    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
  });

  it("preserves the generic dashboard fallback for statement timeouts", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);
    dbIndexMocks.withDbStatementTimeout.mockRejectedValueOnce(
      Object.assign(new Error("statement timeout"), { code: "57014" }),
    );

    const result = await getDashboardStatsAction();

    expect(result.lastError).toBe("db_statement_timeout");
  });
});

describe("crawl discovery item actions", () => {
  it("establishes the selected tenant scope and source policy before starting discovery", async () => {
    const result = await startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    }, { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID });

    expect("error" in result).toBe(false);
    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID },
      "workspace:read",
    );
    expect(tenantAuthorizationMocks.getCurrentTenantPolicy).toHaveBeenCalledWith(TENANT_ID);
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^crawl-start:/),
      expect.any(Function),
    );
    expect(googlePlacesMocks.textSearch).toHaveBeenCalledTimes(1);
  });

  it("fails closed before provider or crawl writes when source approval is still required", async () => {
    tenantAuthorizationMocks.getCurrentTenantPolicy.mockResolvedValueOnce(sourcePolicy({
      requireSourcePlanApproval: true,
    }));

    await expect(startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    }, { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
      code: "POLICY_BLOCKED",
      status: 403,
    });

    expect(googlePlacesMocks.textSearch).not.toHaveBeenCalled();
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM crawl_runs").get()).toMatchObject({ count: 0 });
  });

  it("rejects composed auth identities before tenant context, policy, database, or provider work", async () => {
    authMocks.requirePermission.mockResolvedValueOnce({
      userId: "different-user",
      email: "different@example.com",
      displayName: "Different user",
      role: "admin",
    });

    await expect(startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    }, { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID })).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
      status: 403,
    });

    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantAuthorizationMocks.getCurrentTenantPolicy).not.toHaveBeenCalled();
    expect(googlePlacesMocks.textSearch).not.toHaveBeenCalled();
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM crawl_runs").get()).toMatchObject({ count: 0 });
  });

  it("returns a blocked estimate when the Text Search cap is exhausted", async () => {
    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, billable_units)
       VALUES ('usage-1', 'places.searchText', 'places_text_search_pro', 4900)`,
    ).run();

    const result = await estimateDiscoveryRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: false,
    });

    expect("error" in result).toBe(false);
    expect("canStart" in result ? result.canStart : true).toBe(false);
    expect("blockingReasons" in result ? result.blockingReasons[0] : "").toContain("only 0 remain");
  });

  it("blocks starting a discovery item before creating a run when the cap is exhausted", async () => {
    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, billable_units)
       VALUES ('usage-1', 'places.searchText', 'places_text_search_pro', 4900)`,
    ).run();

    const result = await startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: false,
    });

    expect("error" in result ? result.error : "").toContain("only 0 remain");
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM crawl_runs").get()).toMatchObject({ count: 0 });
  });

  it("blocks starting before creating a run when the Google diagnostic fails", async () => {
    googlePlacesMocks.textSearch.mockRejectedValueOnce(new PlacesApiError(403, JSON.stringify({
      error: {
        code: 403,
        message: "Places API has not been used in project or it is disabled.",
        status: "PERMISSION_DENIED",
      },
    })));

    const result = await startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    });

    expect("error" in result ? result.error : "").toContain("Google diagnostic failed");
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM crawl_runs").get()).toMatchObject({ count: 0 });
  });

  it("starts a new discovery item when only a paused item exists", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });

    const result = await startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    });

    expect("error" in result).toBe(false);
    const rows = testDb.prepare("SELECT id, status FROM crawl_runs ORDER BY created_at ASC").all() as Array<{ id: string; status: string }>;
    expect(rows).toEqual(expect.arrayContaining([
      { id: "paused-run", status: "paused" },
      expect.objectContaining({ status: "running" }),
    ]));
  });

  it("blocks a new discovery item while another item is processing", async () => {
    seedTestRun(testDb, { id: "running-run", status: "running" });

    const result = await startCrawlRunAction({
      state: "CO",
      counties: [],
      zipCodes: ["80202"],
      categories: ["dentist"],
      discoveryMode: "coverage_probe",
      paginationPolicy: "first_page_only",
      testRun: true,
    });

    expect("error" in result ? result.error : "").toContain("already processing");
  });

  it("does not resume a paused item while another item is processing", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestRun(testDb, { id: "running-run", status: "running" });

    const result = await resumeCrawlRunAction("paused-run");

    expect("error" in result ? result.error : "").toContain("already processing");
    const paused = testDb.prepare("SELECT status FROM crawl_runs WHERE id = 'paused-run'").get() as { status: string };
    expect(paused.status).toBe("paused");
  });

  it("resumes a blocked item after diagnostic success and clears stale block metadata", async () => {
    seedTestRun(testDb, { id: "blocked-run", status: "blocked" });
    seedTestUnit(testDb, { id: "blocked-unit", runId: "blocked-run" });
    testDb.prepare(
      "UPDATE crawl_runs SET ended_at = ?, blocked_at = ?, blocked_reason = ?, blocked_error_code = ?, last_error = ? WHERE id = ?",
    ).run(
      "2026-06-10T00:00:00.000Z",
      "2026-06-10T00:00:00.000Z",
      "Google key blocked",
      "google_permission_denied",
      "Google key blocked",
      "blocked-run",
    );

    const result = await resumeCrawlRunAction("blocked-run");

    expect(result).toMatchObject({ success: true });
    expect(testDb.prepare("SELECT status, ended_at, blocked_at, blocked_reason, blocked_error_code, last_error FROM crawl_runs WHERE id = 'blocked-run'").get()).toMatchObject({
      status: "running",
      ended_at: null,
      blocked_at: null,
      blocked_reason: null,
      blocked_error_code: null,
      last_error: null,
    });
  });

  it("cancels remaining units only for the selected discovery item", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestRun(testDb, { id: "other-run", status: "paused" });
    seedTestUnit(testDb, { id: "paused-unit", runId: "paused-run" });
    seedTestUnit(testDb, { id: "other-unit", runId: "other-run" });

    const result = await stopCrawlRunAction("paused-run");

    expect("error" in result).toBe(false);
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'paused-unit'").get()).toMatchObject({ status: "canceled" });
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'other-unit'").get()).toMatchObject({ status: "pending" });
  });

  it("retries failed units only for the selected discovery item", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestRun(testDb, { id: "other-run", status: "paused" });
    seedTestUnit(testDb, { id: "paused-unit", runId: "paused-run" });
    seedTestUnit(testDb, { id: "other-unit", runId: "other-run" });
    testDb.prepare("UPDATE crawl_units SET status = 'failed'").run();

    const result = await retryFailedUnitsAction("paused-run");

    expect(result).toMatchObject({ retriedCount: 1 });
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'paused-unit'").get()).toMatchObject({ status: "pending" });
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'other-unit'").get()).toMatchObject({ status: "failed" });
  });

  it("blocks retrying failed units when the Google diagnostic fails", async () => {
    seedTestRun(testDb, { id: "failed-run", status: "error" });
    seedTestUnit(testDb, { id: "failed-unit", runId: "failed-run" });
    testDb.prepare("UPDATE crawl_units SET status = 'failed' WHERE id = 'failed-unit'").run();
    googlePlacesMocks.textSearch.mockRejectedValueOnce(new PlacesApiError(403, JSON.stringify({
      error: {
        code: 403,
        message: "Places API has not been used in project or it is disabled.",
        status: "PERMISSION_DENIED",
      },
    })));

    const result = await retryFailedUnitsAction("failed-run");

    expect("error" in result ? result.error : "").toContain("Google diagnostic failed");
    expect(testDb.prepare("SELECT status, blocked_error_code FROM crawl_runs WHERE id = 'failed-run'").get()).toMatchObject({
      status: "blocked",
      blocked_error_code: "google_403",
    });
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'failed-unit'").get()).toMatchObject({ status: "failed" });
  });

  it("blocks retrying failed units when the cap is exhausted", async () => {
    seedTestRun(testDb, { id: "failed-run", status: "error" });
    seedTestUnit(testDb, { id: "failed-unit", runId: "failed-run" });
    testDb.prepare("UPDATE crawl_units SET status = 'failed' WHERE id = 'failed-unit'").run();
    testDb.prepare(
      `INSERT INTO api_usage_events (id, endpoint, sku, billable_units)
       VALUES ('usage-1', 'places.searchText', 'places_text_search_pro', 4900)`,
    ).run();

    const result = await retryFailedUnitsAction("failed-run");

    expect("error" in result ? result.error : "").toContain("only 0 remain");
    expect(testDb.prepare("SELECT status FROM crawl_units WHERE id = 'failed-unit'").get()).toMatchObject({ status: "failed" });
  });

  it("loads selected discovery item metadata without mutating the run", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestUnit(testDb, { id: "paused-unit", runId: "paused-run" });

    const result = await getCoverageSelectedRunAction("paused-run");

    expect(result.loadError).toBeUndefined();
    expect(result.run).toMatchObject({ id: "paused-run", status: "paused" });
    expect(testDb.prepare("SELECT status FROM crawl_runs WHERE id = 'paused-run'").get()).toMatchObject({ status: "paused" });
  });

  it("loads discovery item list separately from selected run metadata", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestUnit(testDb, { id: "paused-unit", runId: "paused-run" });

    const result = await getCoverageDiscoveryItemListAction(30);

    expect(result.loadError).toBeUndefined();
    expect(result.discoveryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "paused-run", status: "paused" }),
    ]));
  });

  it("loads discovery item list when run name and scope label are missing", async () => {
    seedTestRun(testDb, { id: "unnamed-run", status: "done" });
    seedTestUnit(testDb, { id: "unnamed-unit", runId: "unnamed-run" });
    testDb.prepare("UPDATE crawl_runs SET name = NULL, scope_label = NULL, categories = ? WHERE id = ?")
      .run(JSON.stringify(["dentist"]), "unnamed-run");

    const result = await getCoverageDiscoveryItemListAction(30);

    expect(result.loadError).toBeUndefined();
    expect(result.discoveryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "unnamed-run",
        name: expect.stringContaining("discovery"),
        categories: ["dentist"],
      }),
    ]));
  });

  it("returns selected discovery item even if the discovery item list action times out separately", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValueOnce(timeout);

    const listResult = await getCoverageDiscoveryItemListAction(30);
    const selectedResult = await getCoverageSelectedRunAction("paused-run");

    expect(listResult).toEqual({ discoveryItems: [], loadError: "db_statement_timeout" });
    expect(selectedResult.run).toMatchObject({ id: "paused-run", status: "paused" });
  });

  it("keeps legacy combined coverage metadata action available", async () => {
    seedTestRun(testDb, { id: "paused-run", status: "paused" });
    seedTestUnit(testDb, { id: "paused-unit", runId: "paused-run" });

    const result = await getCoverageDiscoveryItemsAction("paused-run");

    expect(result.loadError).toBeUndefined();
    expect(result.run).toMatchObject({ id: "paused-run", status: "paused" });
    expect(result.discoveryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "paused-run", status: "paused" }),
    ]));
  });

  it("loads canonical directory candidates for a completed coverage probe", async () => {
    seedTestRun(testDb, { id: "probe-run", status: "done" });
    seedTestUnit(testDb, { id: "probe-unit", runId: "probe-run" });
    testDb.prepare("UPDATE crawl_units SET status = 'done', pages_fetched = 3, raw_places_seen = 60, new_places_seen = 60 WHERE id = 'probe-unit'").run();
    testDb.prepare(
      `INSERT INTO places_master (
        place_id, name, address, website_uri, maps_uri, categories, rating, user_rating_count,
        business_status, primary_type, lat, lng, completeness_score, freshness_score
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "directory-place-1",
      "Directory Dentist",
      "123 Directory St, Denver, CO 80202",
      null,
      "https://maps.example/directory-place-1",
      JSON.stringify(["dentist"]),
      4.7,
      42,
      "OPERATIONAL",
      "dentist",
      39.75,
      -104.99,
      0.6,
      1,
    );
    testDb.prepare(
      `INSERT INTO place_observations (
        id, place_id, crawl_run_id, crawl_unit_id, endpoint, sku, field_mask, raw_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "observation-1",
      "directory-place-1",
      "probe-run",
      "probe-unit",
      "places.searchText",
      "places_text_search_pro",
      "places.id",
      JSON.stringify({ id: "places/directory-place-1" }),
    );
    testDb.prepare(
      `INSERT INTO places_master (
        place_id, name, address, website_uri, maps_uri, categories, rating, user_rating_count,
        business_status, primary_type, lat, lng, completeness_score, freshness_score
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "excluded-place-2",
      "Excluded Dentist",
      "456 Excluded St, Denver, CO 80202",
      null,
      "https://maps.example/excluded-place-2",
      JSON.stringify(["dentist"]),
      4.5,
      21,
      "OPERATIONAL",
      "dentist",
      39.76,
      -104.98,
      0.6,
      1,
    );
    testDb.prepare(
      `INSERT INTO leads (id, place_id, score, status, website_status, categories, is_excluded)
       VALUES ('excluded-lead-2', 'excluded-place-2', 10, 'new', 'none', '[]', 2)`,
    ).run();
    testDb.prepare(
      `INSERT INTO place_observations (
        id, place_id, crawl_run_id, crawl_unit_id, endpoint, sku, field_mask, raw_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "observation-2",
      "excluded-place-2",
      "probe-run",
      "probe-unit",
      "places.searchText",
      "places_text_search_pro",
      "places.id",
      JSON.stringify({ id: "places/excluded-place-2" }),
    );

    const result = await getCoverageProbeCandidatesAction("probe-run");

    expect(result.loadError).toBeUndefined();
    expect(result.candidates).toEqual([
      expect.objectContaining({
        placeId: "directory-place-1",
        name: "Directory Dentist",
        marketId: "market-colorado",
        locationCellId: "cell-us-co-80202",
        category: "dentist",
        hasLead: false,
        leadIsExcluded: false,
        websiteStatusLabel: "No website",
        listingStatus: "Directory candidate",
      }),
      expect.objectContaining({
        placeId: "excluded-place-2",
        name: "Excluded Dentist",
        hasLead: true,
        leadId: "excluded-lead-2",
        leadIsExcluded: true,
        listingStatus: "Excluded lead",
      }),
    ]);
  });

  it("promotes a completed coverage probe into a separate lead harvest", async () => {
    seedTestRun(testDb, { id: "probe-run", status: "done" });
    seedTestUnit(testDb, { id: "probe-unit", runId: "probe-run" });
    testDb.prepare(
      "UPDATE crawl_runs SET market_id = ?, selection_json = ? WHERE id = ?",
    ).run(
      "market-colorado",
      JSON.stringify({
        marketId: "market-colorado",
        cellIds: ["cell-us-co-80202"],
        categories: ["dentist"],
        source: "market_cells",
        discoveryMode: "coverage_probe",
        paginationPolicy: "auto_yield_based",
        testRun: true,
      }),
      "probe-run",
    );
    testDb.prepare("UPDATE crawl_units SET status = 'done' WHERE id = 'probe-unit'").run();

    const result = await promoteProbeToLeadHarvestAction("probe-run");

    expect("error" in result).toBe(false);
    const newRunId = "runId" in result ? result.runId : null;
    expect(newRunId).toBeTruthy();
    expect(newRunId).not.toBe("probe-run");
    expect(testDb.prepare("SELECT status FROM crawl_runs WHERE id = 'probe-run'").get()).toMatchObject({ status: "done" });

    const harvestRun = testDb.prepare("SELECT market_id, selection_json FROM crawl_runs WHERE id = ?").get(newRunId) as Record<string, unknown>;
    expect(harvestRun.market_id).toBe("market-colorado");
    const selection = JSON.parse(String(harvestRun.selection_json));
    expect(selection).toMatchObject({
      marketId: "market-colorado",
      cellIds: ["cell-us-co-80202"],
      categories: ["dentist"],
      source: "promoted_probe",
      discoveryMode: "lead_harvest",
      paginationPolicy: "auto_yield_based",
      testRun: false,
      promotedFromRunId: "probe-run",
    });
    expect(testDb.prepare("SELECT COUNT(*) AS count FROM crawl_units WHERE crawl_run_id = ?").get(newRunId)).toMatchObject({ count: 1 });
  });

  it("returns a fallback cell ledger result when the coverage read times out", async () => {
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValueOnce(timeout);

    const result = await getCoverageCellLedgerAction("paused-run");

    expect(result).toEqual({ cells: [], loadError: "db_statement_timeout" });
  });

  it("logs dashboard stats subquery timings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);

    await getDashboardStatsAction();

    expect(infoSpy).toHaveBeenCalledWith("route_timing", expect.objectContaining({
      route: "action:getDashboardStatsAction:core_base",
      status: 200,
    }));
    expect(infoSpy).toHaveBeenCalledWith("route_timing", expect.objectContaining({
      route: "action:getDashboardStatsAction:settings",
      status: 200,
    }));
    expect(infoSpy).not.toHaveBeenCalledWith("route_timing", expect.objectContaining({
      route: "action:getDashboardStatsAction:monthly_api_usage",
    }));
    infoSpy.mockRestore();
  });

  it("logs dashboard analytics timings separately from core stats", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValueOnce(TENANT_WIDE_SESSION);

    await getDashboardAnalyticsAction();

    expect(infoSpy).toHaveBeenCalledWith("route_timing", expect.objectContaining({
      route: "action:getDashboardAnalyticsAction:monthly_api_usage",
      status: 200,
    }));
    expect(infoSpy).toHaveBeenCalledWith("route_timing", expect.objectContaining({
      route: "action:getDashboardAnalyticsAction:scheduler_health",
      status: 200,
    }));
    infoSpy.mockRestore();
  });
});
