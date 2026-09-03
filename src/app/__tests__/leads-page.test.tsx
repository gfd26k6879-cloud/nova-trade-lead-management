import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getBusinessTypeCounts: vi.fn(),
  getKanbanLeads: vi.fn(),
  getLeads: vi.fn(),
  getScoreBandThresholds: vi.fn(),
}));

const dbContextMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db", () => dbContextMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/app/(protected)/leads/leads-client", () => ({ LeadsClient: () => null }));
vi.mock("@/app/(protected)/leads/kanban-client", () => ({ KanbanClient: () => null }));

import LeadsPage from "@/app/(protected)/leads/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_SESSION = {
  userId: "admin-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "owner" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
  authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
  dbContextMocks.withTenantDbContext.mockImplementation((callback: () => unknown) => callback());
  tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback());
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
  queryMocks.getKanbanLeads.mockResolvedValue({ leads: [], total: 0 });
  queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });
  queryMocks.getScoreBandThresholds.mockResolvedValue({});
});

describe("LeadsPage minimum-review parsing", () => {
  it("normalizes the same valid minimum for counts and list reads", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "  +00050 " }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }));
    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }));
  });

  it("omits invalid fractional input instead of truncating it", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "4.5" }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }));
    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }));
  });

  it("preserves a safe above-int4 minimum for central query defense", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "2147483648", view: "kanban" }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }));
    expect(queryMocks.getKanbanLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }));
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
  });
});

describe("LeadsPage export scope", () => {
  it("passes only the resolved tenant-wide session scope to the table export control", async () => {
    const result = await LeadsPage({ searchParams: Promise.resolve({}) });

    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(result.props).toEqual(expect.objectContaining({
      canExport: true,
      exportScope: { tenantId: TENANT_ID, workspaceId: null },
    }));
  });

  it("keeps a matrix-denied tenant role ineligible while allowing the lead read", async () => {
    authMocks.getTenantSession.mockResolvedValue({ ...TENANT_SESSION, role: "researcher" });

    const result = await LeadsPage({ searchParams: Promise.resolve({}) });

    expect(result.props).toEqual(expect.objectContaining({ canExport: false }));
  });
});

describe("LeadsPage tenant boundary", () => {
  it("installs the exact canonical tenant and database contexts before list reads", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ view: "kanban" }) });

    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^lead-list-page:/),
      expect.any(Function),
    );
    expect(dbContextMocks.withTenantDbContext).toHaveBeenCalledWith(expect.any(Function));
    expect(queryMocks.ensureDbReady).toHaveBeenCalledOnce();
    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledOnce();
    expect(queryMocks.getKanbanLeads).toHaveBeenCalledOnce();
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
  });

  it.each([
    ["missing scope", null],
    ["different identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["workspace scope", { ...TENANT_SESSION, workspaceId: WORKSPACE_ID }],
  ])("fails closed with a generic unavailable state for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await LeadsPage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Leads temporarily unavailable");
    expect(text).toContain("No lead data was requested");
    expect(text).not.toContain(TENANT_ID);
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbContextMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getBusinessTypeCounts).not.toHaveBeenCalled();
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
    expect(queryMocks.getKanbanLeads).not.toHaveBeenCalled();
  });

  it("preserves the researcher-owned filter clamp inside the tenant boundary", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", email: "one@example.com", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue({
      ...TENANT_SESSION,
      userId: "researcher-1",
      email: "one@example.com",
      role: "researcher",
    });

    await LeadsPage({
      searchParams: Promise.resolve({
        assigned: "me",
        archived: "all",
        status: "excluded",
      }),
    });

    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "me",
      assignedToUserId: "researcher-1",
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }));
  });
});
