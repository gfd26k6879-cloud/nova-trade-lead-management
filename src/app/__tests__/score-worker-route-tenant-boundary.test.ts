import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const queryMocks = vi.hoisted(() => ({
  recomputeAllLeadQualityScores: vi.fn(),
  repairAiWebsiteFindingConsistency: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  completeWorkerRun: vi.fn(),
  ensureDbReady: vi.fn(),
  getSettings: vi.fn(),
  isSchedulerWorkerEnabled: vi.fn(),
  markStaleWorkerRunsInterrupted: vi.fn(),
  recomputeAllLeadQualityScores: queryMocks.recomputeAllLeadQualityScores,
  repairAiWebsiteFindingConsistency: queryMocks.repairAiWebsiteFindingConsistency,
  startWorkerRun: vi.fn(),
}));

import { GET, POST } from "@/app/api/scores/recompute-stale/route";

describe("score recompute tenant worker route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects GET with a private uncached 405 response", async () => {
    const response = await GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Method Not Allowed" });
    expect(queryMocks.repairAiWebsiteFindingConsistency).not.toHaveBeenCalled();
    expect(queryMocks.recomputeAllLeadQualityScores).not.toHaveBeenCalled();
  });

  it("fails closed before unscoped score queries when no durable tenant lease resolver exists", async () => {
    const request = new NextRequest(
      "https://example.test/api/scores/recompute-stale?tenantId=forged&worker=ai_verification",
      {
        method: "POST",
        headers: {
          authorization: "Bearer worker-secret",
          "x-internal-worker-selector": "opaque-score-worker-lease",
        },
        body: JSON.stringify({ workspaceId: "forged", worker: "crawl" }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker authorization failed",
    });
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(queryMocks.repairAiWebsiteFindingConsistency).not.toHaveBeenCalled();
    expect(queryMocks.recomputeAllLeadQualityScores).not.toHaveBeenCalled();
  });
});
