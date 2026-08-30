import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  requireTenantSession: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

const dbMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  ensureDbReady: vi.fn(),
  getCanonicalPlacesForExport: vi.fn(),
  getLeadsForExport: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/db", () => dbMocks);
vi.mock("@/lib/tenancy/context", () => contextMocks);

import { GET } from "@/app/api/export/csv/route";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const TENANT_SESSION = {
  userId: "30000000-0000-4000-8000-000000000003",
  email: "admin@example.com",
  displayName: "Admin",
  tenantId: TENANT_A,
  workspaceId: null,
  membershipId: "40000000-0000-4000-8000-000000000004",
  role: "admin",
  roleBindingId: "50000000-0000-4000-8000-000000000005",
} as const;

function exportRequest(query = "", tenantId = TENANT_A): NextRequest {
  const suffix = query ? `&${query}` : "";
  return new NextRequest(
    `https://example.test/api/export/csv?tenantId=${tenantId}&exportPurpose=lead_inventory&confirmExport=true${suffix}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requireTenantSession.mockResolvedValue(TENANT_SESSION);
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getCanonicalPlacesForExport.mockResolvedValue([]);
  queryMocks.getLeadsForExport.mockResolvedValue([]);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
});

describe("CSV export minimum-review parsing", () => {
  it("normalizes valid URL input without changing rating or score parsing", async () => {
    const response = await GET(exportRequest("minReviews=%2B00050&minRating=4.5&minScore=70.5"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({
      minReviews: 50,
      minRating: 4.5,
      minScore: 70.5,
    }), 50_000);
  });

  it("omits invalid fractional input instead of truncating it", async () => {
    const response = await GET(exportRequest("minReviews=4.5"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }), 50_000);
  });

  it("preserves safe above-int4 input for parameter-free query rejection", async () => {
    const response = await GET(exportRequest("minReviews=2147483648"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }), 50_000);
  });

  it("preserves URLSearchParams first-value behavior for repeated keys", async () => {
    const response = await GET(exportRequest("minReviews=50&minReviews=60"));

    expect(response.status).toBe(200);
    expect(queryMocks.getLeadsForExport).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }), 50_000);
  });
});

describe("CSV export error handling", () => {
  it("fails closed when a workspace-bound session requests a tenant-wide export", async () => {
    authMocks.requireTenantSession.mockResolvedValueOnce({ ...TENANT_SESSION, workspaceId: "60000000-0000-4000-8000-000000000006" });

    const response = await GET(exportRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadsForExport).not.toHaveBeenCalled();
  });

  it("does not reveal whether a foreign tenant selector exists", async () => {
    authMocks.requireTenantSession.mockRejectedValueOnce(
      Object.assign(new Error(`Tenant ${TENANT_B} exists but belongs to another user`), { status: 403 }),
    );

    const response = await GET(exportRequest("", TENANT_B));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadsForExport).not.toHaveBeenCalled();
    expect(queryMocks.getCanonicalPlacesForExport).not.toHaveBeenCalled();
  });

  it("does not expose internal backend error details", async () => {
    const secret = "secret-password";
    queryMocks.ensureDbReady.mockRejectedValueOnce(
      new Error(`DATABASE_URL=postgres://worker:${secret}@db.internal/app`),
    );

    const response = await GET(exportRequest());
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "CSV export failed." });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("CSV export scope and response privacy", () => {
  it("requires an explicit lead-inventory purpose and human confirmation", async () => {
    const response = await GET(new NextRequest(`https://example.test/api/export/csv?tenantId=${TENANT_A}`));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadsForExport).not.toHaveBeenCalled();
  });

  it("resolves the selector, installs tenant database scope, and prevents shared caching", async () => {
    const response = await GET(exportRequest("status=new"));

    expect(response.status).toBe(200);
    expect(authMocks.requireTenantSession).toHaveBeenCalledWith(
      { tenantId: TENANT_A, workspaceId: undefined },
      undefined,
    );
    expect(contextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.any(String),
      expect.any(Function),
    );
    expect(dbMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
