import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, callback: () => Promise<unknown>) => callback()),
  withTenantDbContext: vi.fn((callback: () => Promise<unknown>) => callback()),
  isDbStatementTimeoutError: vi.fn(() => false),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getResearcherTeamBoardSummary: vi.fn(),
  getTeamBoardSummary: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(() => null),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", () => authorizationMocks);
vi.mock("@/lib/tenancy/context", () => tenantContextMocks);

import TeamBoardPage from "@/app/(protected)/team/page";

const TENANT_SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "owner",
} as const;

const EMPTY_SUMMARY = {
  members: [],
  todayActivity: [],
  latestActivity: [],
  unassignedReady: 0,
  overdueFollowUps: 0,
};

describe("TeamBoardPage tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    authorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getTeamBoardSummary.mockResolvedValue(EMPTY_SUMMARY);
    queryMocks.getResearcherTeamBoardSummary.mockResolvedValue(EMPTY_SUMMARY);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, callback: () => Promise<unknown>) => callback());
    dbIndexMocks.withTenantDbContext.mockImplementation((callback: () => Promise<unknown>) => callback());
    tenantContextMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback());
  });

  it("authorizes the canonical tenant and installs both tenant contexts before team reads", async () => {
    const node = await TeamBoardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Team Board");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "account:read",
      { action: "team.board.page" },
    );
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^team-board-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(tenantContextMocks.runWithTenantContext.mock.invocationCallOrder[0]).toBeLessThan(
      dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0],
    );
    expect(dbIndexMocks.withTenantDbContext.mock.invocationCallOrder[0]).toBeLessThan(
      queryMocks.ensureDbReady.mock.invocationCallOrder[0],
    );
    expect(queryMocks.getTeamBoardSummary).toHaveBeenCalledOnce();
  });

  it("keeps researcher reads identity-bound inside the canonical tenant boundary", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", email: "researcher@example.com", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue({ ...TENANT_SESSION, userId: "researcher-1", email: "researcher@example.com", role: "member" });

    await TeamBoardPage();

    expect(queryMocks.getResearcherTeamBoardSummary).toHaveBeenCalledWith("researcher-1");
    expect(queryMocks.getTeamBoardSummary).not.toHaveBeenCalled();
  });

  it("uses the canonical tenant role when legacy and tenant roles disagree", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue({ ...TENANT_SESSION, role: "researcher" });

    await TeamBoardPage();

    expect(queryMocks.getResearcherTeamBoardSummary).toHaveBeenCalledWith("user-1");
    expect(queryMocks.getTeamBoardSummary).not.toHaveBeenCalled();
  });

  it("grants the full board to a canonical tenant admin despite a lower legacy role", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue({ ...TENANT_SESSION, role: "admin" });

    await TeamBoardPage();

    expect(queryMocks.getTeamBoardSummary).toHaveBeenCalledOnce();
    expect(queryMocks.getResearcherTeamBoardSummary).not.toHaveBeenCalled();
  });

  it.each([
    ["missing canonical scope", null],
    ["a different canonical identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["unsupported workspace scope", { ...TENANT_SESSION, workspaceId: "20000000-0000-4000-8000-000000000001" }],
  ])("fails closed without database access for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await TeamBoardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getTeamBoardSummary).not.toHaveBeenCalled();
    expect(queryMocks.getResearcherTeamBoardSummary).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it("fails closed when canonical tenant resolution rejects", async () => {
    authMocks.getTenantSession.mockRejectedValue(new Error("sensitive resolver detail"));

    const node = await TeamBoardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive resolver detail");
    expect(authorizationMocks.assertTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it("normalizes canonical permission denial before any database access", async () => {
    authorizationMocks.assertTenantPermission.mockRejectedValue(new Error("sensitive authorization detail"));

    const node = await TeamBoardPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("tenant_scope_unavailable");
    expect(text).not.toContain("sensitive authorization detail");
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });
});
