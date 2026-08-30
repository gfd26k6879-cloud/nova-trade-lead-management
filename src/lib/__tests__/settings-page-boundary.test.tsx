import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getSettings: vi.fn(),
  isDbStatementTimeoutError: vi.fn(() => false),
  isTransientDbError: vi.fn(() => false),
  logRouteTiming: vi.fn(),
  requirePermission: vi.fn(),
  withDbStatementTimeout: vi.fn(async (_timeout: number, callback: () => Promise<unknown>) => callback()),
}));

vi.mock("@/lib/auth", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/db/index", () => ({
  isDbStatementTimeoutError: mocks.isDbStatementTimeoutError,
  isTransientDbError: mocks.isTransientDbError,
  withDbStatementTimeout: mocks.withDbStatementTimeout,
}));
vi.mock("@/lib/db/queries", () => ({
  ensureDbReady: mocks.ensureDbReady,
  getSettings: mocks.getSettings,
}));
vi.mock("@/lib/route-timing", () => ({ startRouteTiming: () => mocks.logRouteTiming }));
vi.mock("@/app/(protected)/settings/settings-client", async () => {
  const { createElement } = await import("react");
  return {
    SettingsClient: ({ initialSettings }: { initialSettings: unknown }) => createElement(
      "div",
      { "data-testid": "settings-client" },
      JSON.stringify(initialSettings),
    ),
  };
});

import SettingsPage, { metadata } from "@/app/(protected)/settings/page";

describe("platform settings page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "platform-admin" });
    mocks.ensureDbReady.mockResolvedValue(undefined);
    mocks.getSettings.mockResolvedValue({ marker: "platform-global" });
    mocks.isDbStatementTimeoutError.mockReturnValue(false);
    mocks.isTransientDbError.mockReturnValue(false);
  });

  it("requires the exclusive platform permission before reading global settings", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));

    await expect(SettingsPage()).rejects.toThrow("forbidden");

    expect(mocks.requirePermission).toHaveBeenCalledWith("settings:manage");
    expect(mocks.ensureDbReady).not.toHaveBeenCalled();
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });

  it("labels loaded settings as platform-wide and keeps tenant policy separate", async () => {
    const markup = renderToStaticMarkup(await SettingsPage());

    expect(metadata.title).toBe("Platform Settings | Nova Trade Lead Management");
    expect(markup).toContain("Platform-wide controls");
    expect(markup).toContain("Only platform settings administrators may view or change them.");
    expect(markup).toContain("Tenant-owned execution policy is resolved separately");
    expect(markup).toContain("data-testid=\"settings-client\"");
    expect(markup).toContain("platform-global");
    expect(mocks.requirePermission).toHaveBeenCalledTimes(1);
    expect(mocks.withDbStatementTimeout).toHaveBeenCalledWith(8_000, expect.any(Function));
    expect(mocks.logRouteTiming).toHaveBeenCalledWith(200, undefined);
  });

  it("shows no fallback values or credential controls when the global store fails", async () => {
    mocks.getSettings.mockRejectedValue(new Error("database unavailable"));
    mocks.isTransientDbError.mockReturnValue(true);

    const markup = renderToStaticMarkup(await SettingsPage());

    expect(markup).toContain("Platform settings unavailable");
    expect(markup).toContain("Controls remain locked");
    expect(markup).toContain("No fallback values or credential controls are shown.");
    expect(markup).toContain("Diagnostic: transient_db_error");
    expect(markup).not.toContain("data-testid=\"settings-client\"");
    expect(markup).not.toContain("platform-global");
    expect(mocks.logRouteTiming).toHaveBeenCalledWith(503, { reason: "transient_db_error" });
  });
});
