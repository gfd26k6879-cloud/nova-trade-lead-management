import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  withTenantDbContext: vi.fn((fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const tenantContextMocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(() => null),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getBusinessTypeCounts: vi.fn(),
  getLeads: vi.fn(),
  getScoreBandThresholds: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);
vi.mock("@/app/(protected)/explore/explore-client", () => ({
  ExploreClient: () => React.createElement("div", null, "Explore loaded"),
}));

import ExplorePage from "@/app/(protected)/explore/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000001";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000001";

function tenantSession(userId = "user-1", workspaceId: string | null = null) {
  return {
    userId,
    email: `${userId}@example.com`,
    displayName: null,
    tenantId: TENANT_ID,
    workspaceId,
    membershipId: MEMBERSHIP_ID,
    roleBindingId: ROLE_BINDING_ID,
    role: "owner" as const,
  };
}

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(tenantSession());
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
    queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
    queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    dbIndexMocks.withTenantDbContext.mockImplementation((fn: () => Promise<unknown>) => fn());
    tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn());
  });

  it("renders a retryable unavailable state when lead loading times out", async () => {
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(timeout);

    const node = await ExplorePage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Lead Explorer is taking too long to load.");
    expect(text).toContain("Retry Explore");
    expect(text).toContain("Go to Workbench");
    expect(text).toContain("Open All Leads");
    expect(text).toContain("db_statement_timeout");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("renders lead explorer when the timeout-wrapped read succeeds", async () => {
    const node = await ExplorePage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Explore loaded");
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, userId: "user-1", workspaceId: null }),
      expect.stringMatching(/^explore-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("passes only constrained active inventory filters to researcher Explore reads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", email: "one@example.com", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue(tenantSession("researcher-1"));

    await ExplorePage({
      searchParams: Promise.resolve({
        archived: "all",
        assigned: "me",
        includeExcluded: "true",
        mode: "directory",
        status: "excluded",
      }),
    });

    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      assignedToUserId: undefined,
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }));
    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({
      archived: "active",
      assigned: "unassigned",
      includeExcluded: false,
      status: undefined,
      visibleToUserId: "researcher-1",
    }));
  });

  it("passes only the identity-bound canonical map scope to the client", async () => {
    const node = await ExplorePage({ searchParams: Promise.resolve({ tenantId: "attacker-controlled" } as never) });

    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect((node as React.ReactElement<{ mapScope: unknown }>).props.mapScope).toEqual({ tenantId: TENANT_ID, workspaceId: null });
  });

  it.each([
    ["missing canonical scope", null],
    ["different canonical identity", tenantSession("other-user")],
    ["workspace-scoped canonical session", tenantSession("user-1", WORKSPACE_ID)],
  ])("fails closed without inventory reads for %s", async (_label, canonicalSession) => {
    authMocks.getTenantSession.mockResolvedValue(canonicalSession);

    const node = await ExplorePage({ searchParams: Promise.resolve({}) });
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getBusinessTypeCounts).not.toHaveBeenCalled();
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });
});
