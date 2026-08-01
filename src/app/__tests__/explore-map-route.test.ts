import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = "Authentication required") {
      super(message);
      this.name = "UnauthorizedError";
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
    constructor(message = "You do not have permission to perform this action") {
      super(message);
      this.name = "ForbiddenError";
    }
  },
}));

const dbMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
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

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/explore-filters", () => ({
  buildExploreQueryState: filterMocks.buildExploreQueryState,
  parseMapPointLimit: vi.fn(() => 500),
}));

import { GET } from "@/app/api/explore/map/route";

describe("/api/explore/map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterMocks.buildExploreQueryState.mockReturnValue({ filters: {} });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns 401 for unauthenticated requests", async () => {
    authMocks.requirePermission.mockRejectedValue(new authMocks.UnauthorizedError());

    const response = await GET(new Request("https://example.com/api/explore/map"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Authentication required");
    expect(json.points).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns 403 when the user lacks workspace access", async () => {
    authMocks.requirePermission.mockRejectedValue(new authMocks.ForbiddenError());

    const response = await GET(new Request("https://example.com/api/explore/map"));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("You do not have permission to perform this action");
    expect(json.points).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("passes constrained active inventory filters to researcher map reads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", email: "one@example.com", role: "researcher" });
    filterMocks.buildExploreQueryState.mockReturnValue({
      filters: {
        archived: "all",
        assigned: "me",
        assignedToUserId: "researcher-2",
        includeExcluded: true,
        status: "excluded",
      },
    });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getLeadMapPoints.mockResolvedValue({ points: [], totalMapped: 0 });
    queryMocks.getLeadMapZipCoverage.mockResolvedValue([]);
    queryMocks.getConfiguredGoogleMapsBrowserApiKey.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/explore/map?archived=all&status=excluded"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadMapPoints).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      assignedToUserId: undefined,
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }), 500, { includeTotal: false, fastOrder: true });
  });
});
