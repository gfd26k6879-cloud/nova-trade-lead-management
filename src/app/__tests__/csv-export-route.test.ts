import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
  },
}));

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  ensureDbReady: vi.fn(),
  getCanonicalPlacesForExport: vi.fn(),
  getLeadsForExport: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/queries", () => queryMocks);

import { GET } from "@/app/api/export/csv/route";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getCanonicalPlacesForExport.mockResolvedValue([]);
  queryMocks.getLeadsForExport.mockResolvedValue([]);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
});

describe("CSV export minimum-review parsing", () => {
  it("normalizes valid URL input without changing rating or score parsing", async () => {
    const response = await GET(new NextRequest("https://example.test/api/export/csv?minReviews=%2B00050&minRating=4.5&minScore=70.5"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({
      minReviews: 50,
      minRating: 4.5,
      minScore: 70.5,
    }), 50_000);
  });

  it("omits invalid fractional input instead of truncating it", async () => {
    const response = await GET(new NextRequest("https://example.test/api/export/csv?minReviews=4.5"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }), 50_000);
  });

  it("preserves safe above-int4 input for parameter-free query rejection", async () => {
    const response = await GET(new NextRequest("https://example.test/api/export/csv?minReviews=2147483648"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }), 50_000);
  });

  it("preserves URLSearchParams first-value behavior for repeated keys", async () => {
    const response = await GET(new NextRequest("https://example.test/api/export/csv?minReviews=50&minReviews=60"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }), 50_000);
  });
});
