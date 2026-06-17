import { existsSync } from "node:fs";
import { join } from "node:path";
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

import { GET as getProcessNext } from "@/app/api/crawl/process-next/route";
import { GET as getEnrichNext } from "@/app/api/crawl/enrich-next/route";
import { GET as getVerifyNext } from "@/app/api/ai/verify-next/route";
import { GET as getArtifactProcessNext } from "@/app/api/ai/artifacts/process-next/route";
import { GET as getRecomputeStale } from "@/app/api/scores/recompute-stale/route";

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

  it("does not include the deleted legacy batch tick route", () => {
    expect(workerRoutes.map(([path]) => path)).not.toContain("/api/workers/tick");
    expect(existsSync(join(process.cwd(), "src/app/api/workers/tick/route.ts"))).toBe(false);
  });
});
