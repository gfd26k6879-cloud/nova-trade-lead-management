import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("ensureDbReady", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db/index");
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete process.env.NOSITE_RUNTIME_POSTGRES_REPAIR;
    delete process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL;
  });

  it("allows a later request to retry after initialization fails", async () => {
    process.env.DATABASE_URL = "postgres://example.invalid/nosite";
    process.env.NOSITE_RUNTIME_POSTGRES_REPAIR = "0";
    process.env.NOSITE_RUNTIME_GEOGRAPHY_BACKFILL = "0";

    const getDb = vi.fn()
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValue({});

    vi.doMock("@/lib/db/index", async () => {
      const actual = await vi.importActual<typeof import("@/lib/db/index")>("@/lib/db/index");
      return { ...actual, getDb };
    });

    const { ensureDbReady } = await import("@/lib/db/queries");

    await expect(ensureDbReady()).rejects.toThrow("temporary database outage");
    await expect(ensureDbReady()).resolves.toBeUndefined();
    expect(getDb).toHaveBeenCalledTimes(2);
  });
});
