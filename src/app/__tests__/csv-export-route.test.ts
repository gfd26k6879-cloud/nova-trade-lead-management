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

function expectNoExportSideEffects(): void {
  expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  expect(queryMocks.getLeadsForExport).not.toHaveBeenCalled();
  expect(queryMocks.getCanonicalPlacesForExport).not.toHaveBeenCalled();
  expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  expect(contextMocks.runWithTenantContext).not.toHaveBeenCalled();
  expect(dbMocks.withTenantDbContext).not.toHaveBeenCalled();
}

describe("CSV export fail-closed gate", () => {
  it.each([
    ["lead inventory", ""],
    ["canonical dataset", "dataset=canonical"],
    ["unknown dataset", "dataset=unexpected"],
  ])("denies a direct %s request before any export side effect", async (_label, query) => {
    const response = await GET(exportRequest(query));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("content-disposition")).toBeNull();
    expectNoExportSideEffects();
  });
});

describe("CSV export error handling", () => {
  it("fails closed when a workspace-bound session requests a tenant-wide export", async () => {
    authMocks.requireTenantSession.mockResolvedValueOnce({ ...TENANT_SESSION, workspaceId: "60000000-0000-4000-8000-000000000006" });

    const response = await GET(exportRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expectNoExportSideEffects();
  });

  it("does not reveal whether a foreign tenant selector exists", async () => {
    authMocks.requireTenantSession.mockRejectedValueOnce(
      Object.assign(new Error(`Tenant ${TENANT_B} exists but belongs to another user`), { status: 403 }),
    );

    const response = await GET(exportRequest("", TENANT_B));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expectNoExportSideEffects();
  });
});

describe("CSV export scope and response privacy", () => {
  it("requires an explicit lead-inventory purpose and human confirmation", async () => {
    const response = await GET(new NextRequest(`https://example.test/api/export/csv?tenantId=${TENANT_A}`));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Permission denied" });
    expectNoExportSideEffects();
  });

  it("resolves the selector without installing a tenant database scope", async () => {
    const response = await GET(exportRequest("status=new"));

    expect(response.status).toBe(403);
    expect(authMocks.requireTenantSession).toHaveBeenCalledWith(
      { tenantId: TENANT_A, workspaceId: undefined },
      undefined,
    );
    expectNoExportSideEffects();
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});
