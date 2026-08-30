import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const tenantAuthorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn()),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((fn: () => unknown) => fn()),
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
  isTransientDbError: vi.fn(() => false),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getResearcherWorkbench: vi.fn(),
  getScoreBandThresholds: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", () => ({ assertTenantPermission: tenantAuthorizationMocks.assertTenantPermission }));
vi.mock("@/lib/tenancy/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tenancy/context")>();
  return { ...original, runWithTenantContext: tenantAuthorizationMocks.runWithTenantContext };
});
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/(protected)/queue/queue-client", () => ({
  QueueClient: () => React.createElement("div", null, "Queue loaded"),
}));

import QueuePage from "@/app/(protected)/queue/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  displayName: null,
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "owner" as const,
};

describe("QueuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    authMocks.getTenantSession.mockResolvedValue(TENANT_SESSION);
    tenantAuthorizationMocks.assertTenantPermission.mockResolvedValue(TENANT_SESSION);
    tenantAuthorizationMocks.runWithTenantContext.mockImplementation((_session: unknown, _correlationId: unknown, fn: () => unknown) => fn());
    dbIndexMocks.withTenantDbContext.mockImplementation((fn: () => unknown) => fn());
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getResearcherWorkbench.mockResolvedValue({ mine: [], dueToday: [], contactsThisWeek: 0 });
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
  });

  it("renders a retryable unavailable state when workbench loading times out", async () => {
    const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(timeout);

    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Workbench is taking too long to load.");
    expect(text).toContain("Retry");
    expect(text).toContain("Go to Explore");
    expect(text).toContain("Sign out");
    expect(text).toContain("db_statement_timeout");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("renders the workbench when the timeout-wrapped read succeeds", async () => {
    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Queue loaded");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(tenantAuthorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      TENANT_SESSION,
      "account:read",
      { action: "queue.page.read" },
    );
    expect(tenantAuthorizationMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^queue-page:/),
      expect.any(Function),
    );
    expect(dbIndexMocks.withTenantDbContext).toHaveBeenCalledWith(expect.any(Function));
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it.each([
    ["missing scope", null],
    ["different identity", { ...TENANT_SESSION, userId: "other-user" }],
    ["workspace scope", { ...TENANT_SESSION, workspaceId: WORKSPACE_ID }],
  ])("fails closed before database reads for %s", async (_label, tenantSession) => {
    authMocks.getTenantSession.mockResolvedValue(tenantSession);

    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Workbench temporarily unavailable");
    expect(text).toContain("No lead data was requested");
    expect(text).not.toContain(TENANT_ID);
    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getResearcherWorkbench).not.toHaveBeenCalled();
  });

  it("fails closed before database reads when canonical account access is denied", async () => {
    tenantAuthorizationMocks.assertTenantPermission.mockRejectedValue(new Error("PERMISSION_DENIED"));

    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("No lead data was requested");
    expect(text).not.toContain("PERMISSION_DENIED");
    expect(tenantAuthorizationMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  });

  it("normalizes canonical tenant resolution failures before database access", async () => {
    authMocks.getTenantSession.mockRejectedValue(new Error("sensitive resolver detail"));

    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Workbench temporarily unavailable");
    expect(text).not.toContain("sensitive resolver detail");
    expect(dbIndexMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  });
});
