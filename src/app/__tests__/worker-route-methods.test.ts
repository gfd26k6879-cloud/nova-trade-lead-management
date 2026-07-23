import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const internalWorkerRouteMocks = vi.hoisted(() => ({
  runInternalWorkerRoute: vi.fn(),
}));

const workerMocks = vi.hoisted(() => ({
  processNextUnit: vi.fn(),
  enrichNextLead: vi.fn(),
  processNextAiVerificationJob: vi.fn(),
  processNextLeadArtifactJob: vi.fn(),
  authorizeInternalWorkerRequest: vi.fn(),
  ensureDbReady: vi.fn(),
  recomputeAllLeadQualityScores: vi.fn(),
  repairAiWebsiteFindingConsistency: vi.fn(),
}));

vi.mock("@/lib/internal-worker-route", () => internalWorkerRouteMocks);
vi.mock("@/lib/crawl/worker", () => ({ processNextUnit: workerMocks.processNextUnit }));
vi.mock("@/lib/crawl/enrichment", () => ({ enrichNextLead: workerMocks.enrichNextLead }));
vi.mock("@/lib/ai/verification-worker", () => ({
  processNextAiVerificationJob: workerMocks.processNextAiVerificationJob,
}));
vi.mock("@/lib/ai/artifact-worker", () => ({ processNextLeadArtifactJob: workerMocks.processNextLeadArtifactJob }));
vi.mock("@/lib/internal-worker-auth", () => ({
  authorizeInternalWorkerRequest: workerMocks.authorizeInternalWorkerRequest,
}));
vi.mock("@/lib/db/queries", () => ({
  ensureDbReady: workerMocks.ensureDbReady,
  recomputeAllLeadQualityScores: workerMocks.recomputeAllLeadQualityScores,
  repairAiWebsiteFindingConsistency: workerMocks.repairAiWebsiteFindingConsistency,
}));

import { GET as getProcessNext, POST as postProcessNext } from "@/app/api/crawl/process-next/route";
import { GET as getEnrichNext, POST as postEnrichNext } from "@/app/api/crawl/enrich-next/route";
import { GET as getVerifyNext, POST as postVerifyNext } from "@/app/api/ai/verify-next/route";
import { GET as getArtifactProcessNext, POST as postArtifactProcessNext } from "@/app/api/ai/artifacts/process-next/route";
import { GET as getRecomputeStale, POST as postRecomputeStale } from "@/app/api/scores/recompute-stale/route";

const workerRoutes = [
  ["/api/crawl/process-next", getProcessNext],
  ["/api/crawl/enrich-next", getEnrichNext],
  ["/api/ai/verify-next", getVerifyNext],
  ["/api/ai/artifacts/process-next", getArtifactProcessNext],
  ["/api/scores/recompute-stale", getRecomputeStale],
] as const;

describe("mutating worker route methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(workerRoutes)("%s rejects GET as method not allowed", async (path, getRoute) => {
    const response = await getRoute();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Method Not Allowed" });
  });

  it("does not invoke the shared worker runner for GET requests", async () => {
    await getProcessNext();
    await getEnrichNext();
    await getVerifyNext();
    await getArtifactProcessNext();
    await getRecomputeStale();

    expect(internalWorkerRouteMocks.runInternalWorkerRoute).not.toHaveBeenCalled();
  });

  it("passes the shared worker signal through all five route task boundaries", async () => {
    const signal = new AbortController().signal;
    internalWorkerRouteMocks.runInternalWorkerRoute.mockImplementation(
      async (_request, _workerName, _permission, task) => task(signal),
    );
    workerMocks.processNextUnit.mockResolvedValue({ status: "idle" });
    workerMocks.enrichNextLead.mockResolvedValue({ status: "idle" });
    workerMocks.processNextAiVerificationJob.mockResolvedValue({ status: "idle" });
    workerMocks.processNextLeadArtifactJob.mockResolvedValue({ status: "idle" });
    workerMocks.repairAiWebsiteFindingConsistency.mockResolvedValue(0);
    workerMocks.recomputeAllLeadQualityScores.mockResolvedValue(0);

    await postProcessNext(new NextRequest("https://example.test/api/crawl/process-next", { method: "POST" }));
    await postEnrichNext(new NextRequest("https://example.test/api/crawl/enrich-next", { method: "POST" }));
    await postVerifyNext(new NextRequest("https://example.test/api/ai/verify-next", { method: "POST" }));
    await postArtifactProcessNext(new NextRequest("https://example.test/api/ai/artifacts/process-next", { method: "POST" }));
    await postRecomputeStale(new NextRequest("https://example.test/api/scores/recompute-stale", { method: "POST" }));

    expect(workerMocks.processNextUnit).toHaveBeenCalledWith(signal);
    expect(workerMocks.enrichNextLead).toHaveBeenCalledWith(signal);
    expect(workerMocks.processNextAiVerificationJob).toHaveBeenCalledWith(signal);
    expect(workerMocks.processNextLeadArtifactJob).toHaveBeenCalledWith(signal);
    expect(workerMocks.repairAiWebsiteFindingConsistency).toHaveBeenCalledWith(100, signal);
    expect(workerMocks.recomputeAllLeadQualityScores).toHaveBeenCalledWith(100, signal);
  });

  it("does not include the deleted legacy batch tick route", () => {
    expect(workerRoutes.map(([path]) => path)).not.toContain("/api/workers/tick");
    expect(existsSync(join(process.cwd(), "src/app/api/workers/tick/route.ts"))).toBe(false);
  });
});
