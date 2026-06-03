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

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getStaleClientReadQueries: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);

import { GET } from "@/app/api/health/db-activity/route";

describe("/api/health/db-activity", () => {
  beforeEach(() => {
    authMocks.requirePermission.mockReset();
    dbIndexMocks.withDbStatementTimeout.mockReset();
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    dbIndexMocks.isDbStatementTimeoutError.mockImplementation((error: unknown) => (error as { code?: string }).code === "57014");
    dbIndexMocks.isTransientDbError.mockReturnValue(false);
    queryMocks.ensureDbReady.mockReset();
    queryMocks.getStaleClientReadQueries.mockReset();
  });

  it("returns JSON 401 when unauthenticated", async () => {
    authMocks.requirePermission.mockRejectedValue(new authMocks.UnauthorizedError());

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ status: "error", error: "Authentication required" });
  });

  it("returns JSON 403 when the user lacks admin settings access", async () => {
    authMocks.requirePermission.mockRejectedValue(new authMocks.ForbiddenError());

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ status: "error", error: "You do not have permission to perform this action" });
  });

  it("returns JSON 503 when the database activity read times out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(timeout);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({ status: "error", error: "db_statement_timeout" });
  });

  it("returns stale ClientRead rows for admins", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    queryMocks.getStaleClientReadQueries.mockResolvedValue([{ pid: 123, age: "00:01:05" }]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("warning");
    expect(json.staleClientReads).toEqual([{ pid: 123, age: "00:01:05" }]);
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(8_000, expect.any(Function));
  });
});
