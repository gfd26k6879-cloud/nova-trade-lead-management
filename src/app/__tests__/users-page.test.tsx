import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const appUserMocks = vi.hoisted(() => ({
  listAppUsers: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  listLocationMarkets: vi.fn(),
  listUserMarketAccess: vi.fn(),
  listUserMarketAccessForUsers: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/app-users", () => appUserMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/users/users-client", () => ({
  UsersClient: () => React.createElement("div", null, "Users loaded Send invite Remove user Role Territories"),
}));

import UsersPage from "@/app/(protected)/users/page";

describe("UsersPage", () => {
  it("loads territory access with one bulk query instead of per-user loops", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    appUserMocks.listAppUsers.mockResolvedValue([
      { user_id: "user-1", email: "one@example.com", role: "researcher", status: "active" },
      { user_id: "user-2", email: "two@example.com", role: "researcher", status: "active" },
    ]);
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.listLocationMarkets.mockResolvedValue([]);
    queryMocks.listUserMarketAccessForUsers.mockResolvedValue({ "user-1": [], "user-2": [] });

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Users loaded");
    expect(queryMocks.listUserMarketAccessForUsers).toHaveBeenCalledWith(["user-1", "user-2"]);
    expect(queryMocks.listUserMarketAccess).not.toHaveBeenCalled();
    expect(dbIndexMocks.withDbStatementTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));
  });

  it("renders a degraded read-only fallback without mutation controls when users loading times out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    dbIndexMocks.withDbStatementTimeout.mockRejectedValue(Object.assign(new Error("timeout"), { code: "57014" }));

    const node = await UsersPage();
    const text = renderToStaticMarkup(node as React.ReactElement);

    expect(text).toContain("Users temporarily unavailable");
    expect(text).toContain("Reload users");
    expect(text).toContain("Mutation controls are hidden");
    expect(text).not.toContain("Users loaded");
    expect(text).not.toContain("Send invite");
    expect(text).not.toContain("Remove user");
    expect(text).not.toContain("Role");
    expect(text).not.toContain("Territories");
  });
});
