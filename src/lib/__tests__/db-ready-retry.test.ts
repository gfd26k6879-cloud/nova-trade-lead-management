import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("ensureDbReady", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db/index");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("allows a later request to retry after initialization fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/nosite");
    vi.stubEnv("NOSITE_RUNTIME_POSTGRES_REPAIR", "0");
    vi.stubEnv("NOSITE_RUNTIME_GEOGRAPHY_BACKFILL", "0");

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

  it("leaves accepted tenant index families exclusively owned by migrations", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/nosite");
    vi.stubEnv("NOSITE_RUNTIME_POSTGRES_REPAIR", "1");
    vi.stubEnv("NOSITE_RUNTIME_GEOGRAPHY_BACKFILL", "0");
    vi.stubEnv("NOSITE_RUNTIME_ZIP_SEED", "0");

    const exec = vi.fn().mockResolvedValue(undefined);
    const db = { exec };
    const getDb = vi.fn().mockResolvedValue(db);

    vi.doMock("@/lib/db/index", async () => {
      const actual = await vi.importActual<typeof import("@/lib/db/index")>("@/lib/db/index");
      return { ...actual, getDb };
    });

    const { ensureDbReady } = await import("@/lib/db/queries");
    await expect(ensureDbReady()).resolves.toBeUndefined();

    expect(getDb).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalled();
    const emitted = exec.mock.calls.map(([statement]) => String(statement));
    expect(emitted).toContain("ALTER TABLE lead_ai_artifacts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0");
    for (const removedName of [
      "idx_ai_verifications_requester_created",
      "idx_lead_ai_artifacts_requester_created",
      "idx_lead_ai_artifacts_retry_ready",
      "idx_leads_ai_queue_ready",
      "idx_leads_ai_queue_status",
      "idx_g007p_ai_verifications_tenant_requester_created",
      "idx_g007p_ai_artifacts_tenant_requester_created",
      "idx_g007p_ai_artifacts_tenant_retry_ready",
      "idx_g007p_leads_tenant_ai_queue_ready",
      "idx_g007p_leads_tenant_ai_queue_status",
      "idx_g007p6_leads_tenant_enrichment_recovery",
    ]) {
      expect(emitted.some((statement) => statement.includes(removedName)), removedName).toBe(false);
    }
  });
});
