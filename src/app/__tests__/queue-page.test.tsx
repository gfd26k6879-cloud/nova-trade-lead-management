import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
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
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/(protected)/queue/queue-client", () => ({
  QueueClient: () => React.createElement("div", null, "Queue loaded"),
}));

import QueuePage from "@/app/(protected)/queue/page";

describe("QueuePage", () => {
  it("renders a retryable unavailable state when workbench loading times out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
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
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "admin@example.com", role: "admin" });
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.getResearcherWorkbench.mockResolvedValue({ mine: [], dueToday: [], contactsThisWeek: 0 });
    queryMocks.getScoreBandThresholds.mockResolvedValue({});
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());

    const node = await QueuePage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Queue loaded");
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });
});
