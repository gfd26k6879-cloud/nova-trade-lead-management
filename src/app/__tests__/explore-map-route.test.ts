import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizationMocks = vi.hoisted(() => ({
  requireTenantPermission: vi.fn(),
  TenantAuthorizationError: class TenantAuthorizationError extends Error {
    constructor(
      readonly status: 401 | 403 | 404,
      readonly code: string,
    ) {
      super(code);
      this.name = "TenantAuthorizationError";
    }
  },
}));

const dbMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  withTenantDbContext: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: string, fn: () => Promise<unknown>) => fn()),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getConfiguredGoogleMapsBrowserApiKey: vi.fn(),
  getLeadMapPoints: vi.fn(),
  getLeadMapZipCoverage: vi.fn(),
  userCanAccessMarket: vi.fn(),
}));

const filterMocks = vi.hoisted(() => ({
  buildExploreQueryState: vi.fn(() => ({ filters: {} })),
}));

vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("@/lib/db/index", () => dbMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/explore-filters", () => ({
  buildExploreQueryState: filterMocks.buildExploreQueryState,
  parseMapPointLimit: vi.fn(() => 500),
}));

import { GET } from "@/app/api/explore/map/route";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";

function tenantSession(tenantId = TENANT_A, workspaceId: string | null = null) {
  return {
    userId: "30000000-0000-4000-8000-000000000003",
    email: "one@example.com",
    displayName: "Researcher One",
    tenantId,
    workspaceId,
    membershipId: "40000000-0000-4000-8000-000000000004",
    role: "researcher",
    roleBindingId: "50000000-0000-4000-8000-000000000005",
  };
}

describe("/api/explore/map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterMocks.buildExploreQueryState.mockReturnValue({ filters: {} });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getLeadMapPoints.mockResolvedValue({ points: [], totalMapped: 0 });
    queryMocks.getLeadMapZipCoverage.mockResolvedValue([]);
    queryMocks.getConfiguredGoogleMapsBrowserApiKey.mockResolvedValue(null);
  });

  it("returns 401 for unauthenticated requests", async () => {
    authorizationMocks.requireTenantPermission.mockRejectedValue(
      new authorizationMocks.TenantAuthorizationError(401, "AUTH_REQUIRED"),
    );

    const response = await GET(new Request(`https://example.com/api/explore/map?tenantId=${TENANT_A}`));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Authentication required");
    expect(json.points).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("returns a generic 403 without enumerating a foreign tenant selector", async () => {
    authorizationMocks.requireTenantPermission.mockRejectedValue(
      new authorizationMocks.TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH"),
    );

    const response = await GET(new Request(`https://example.com/api/explore/map?tenantId=${TENANT_B}`));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Permission denied");
    expect(json.error).not.toContain(TENANT_B);
    expect(json.points).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  });

  it("denies workspace-narrowed sessions before database access", async () => {
    authorizationMocks.requireTenantPermission.mockResolvedValue(
      tenantSession(TENANT_A, "60000000-0000-4000-8000-000000000006"),
    );

    const response = await GET(new Request(
      `https://example.com/api/explore/map?tenantId=${TENANT_A}&workspaceId=60000000-0000-4000-8000-000000000006`,
    ));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Permission denied", points: [] });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  });

  it("passes constrained active inventory filters to researcher map reads", async () => {
    authorizationMocks.requireTenantPermission.mockResolvedValue(tenantSession());
    filterMocks.buildExploreQueryState.mockReturnValue({
      filters: {
        archived: "all",
        assigned: "me",
        assignedToUserId: "researcher-2",
        includeExcluded: true,
        status: "excluded",
      },
    });
    const response = await GET(new Request(
      `https://example.com/api/explore/map?tenantId=${TENANT_A}&archived=all&status=excluded`,
    ));

    expect(response.status).toBe(200);
    expect(authorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_A, workspaceId: undefined },
      "account:read",
      { action: "explore.map.read" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, workspaceId: null }),
      expect.any(String),
      expect.any(Function),
    );
    expect(dbMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(queryMocks.getLeadMapPoints).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      assignedToUserId: undefined,
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "30000000-0000-4000-8000-000000000003",
    }), 500, { includeTotal: false, fastOrder: true });
  });

  it("binds separate tenant sessions for otherwise identical requests", async () => {
    authorizationMocks.requireTenantPermission
      .mockResolvedValueOnce(tenantSession(TENANT_A))
      .mockResolvedValueOnce(tenantSession(TENANT_B));

    await GET(new Request(`https://example.com/api/explore/map?tenantId=${TENANT_A}`));
    await GET(new Request(`https://example.com/api/explore/map?tenantId=${TENANT_B}`));

    expect(tenantContextMocks.runWithTenantContext.mock.calls.map(
      ([session]) => (session as { tenantId: string }).tenantId,
    ))
      .toEqual([TENANT_A, TENANT_B]);
  });
});
