import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getStaleClientReadQueries: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);

import { GET } from "@/app/api/health/db-activity/route";

describe("/api/health/db-activity fail-closed gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["unauthenticated caller", () => authMocks.requirePermission.mockRejectedValue(new Error("Authentication required"))],
    ["legacy admin", () => authMocks.requirePermission.mockResolvedValue({ role: "admin" })],
  ])("returns the same stable denial for an %s before any platform diagnostic side effect", async (_label, arrange) => {
    arrange();

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Permission denied" });
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getStaleClientReadQueries).not.toHaveBeenCalled();
  });
});
