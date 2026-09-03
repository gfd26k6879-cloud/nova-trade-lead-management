import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const internalWorkerRouteMocks = vi.hoisted(() => ({
  runInternalWorkerRoute: vi.fn(),
  runTenantInternalWorkerRoute: vi.fn(),
}));

const workerLeaseRuntimeMocks = vi.hoisted(() => ({
  createFailClosedWorkerLeaseResolverRuntime: vi.fn(() => vi.fn()),
}));

const workerMocks = vi.hoisted(() => ({
  processNextUnit: vi.fn(),
  enrichNextLead: vi.fn(),
  processNextAiVerificationJob: vi.fn(),
  processNextLeadArtifactJob: vi.fn(),
  authorizeInternalWorkerRequest: vi.fn(),
  ensureDbReady: vi.fn(),
  getTenantScoreRecomputeSettings: vi.fn(),
  recomputeAllLeadQualityScores: vi.fn(),
  repairAiWebsiteFindingConsistency: vi.fn(),
}));

vi.mock("@/lib/internal-worker-route", () => internalWorkerRouteMocks);
vi.mock("@/lib/tenancy/worker-lease-runtime", () => workerLeaseRuntimeMocks);
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
  getTenantScoreRecomputeSettings: workerMocks.getTenantScoreRecomputeSettings,
  recomputeAllLeadQualityScores: workerMocks.recomputeAllLeadQualityScores,
  repairAiWebsiteFindingConsistency: workerMocks.repairAiWebsiteFindingConsistency,
}));
vi.mock("@/lib/db", () => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
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

  it.each([
    ["/api/crawl/process-next", getProcessNext],
    ["/api/crawl/enrich-next", getEnrichNext],
    ["/api/ai/verify-next", getVerifyNext],
    ["/api/ai/artifacts/process-next", getArtifactProcessNext],
  ] as const)("%s keeps method errors private and uncached", async (_path, getRoute) => {
    const response = await getRoute();

    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not invoke the shared worker runner for GET requests", async () => {
    await getProcessNext();
    await getEnrichNext();
    await getVerifyNext();
    await getArtifactProcessNext();
    await getRecomputeStale();

    expect(internalWorkerRouteMocks.runInternalWorkerRoute).not.toHaveBeenCalled();
    expect(internalWorkerRouteMocks.runTenantInternalWorkerRoute).not.toHaveBeenCalled();
  });

  it("passes the shared worker signal through all five route task boundaries", async () => {
    const signal = new AbortController().signal;
    internalWorkerRouteMocks.runInternalWorkerRoute.mockImplementation(
      async (_request, _workerName, _permission, task) => task(signal),
    );
    internalWorkerRouteMocks.runTenantInternalWorkerRoute.mockImplementation(
      async (_request, _workerName, _permission, task) => NextResponse.json(await task({}, signal)),
    );
    workerMocks.processNextUnit.mockResolvedValue({ status: "idle" });
    workerMocks.enrichNextLead.mockResolvedValue({ status: "idle" });
    workerMocks.processNextAiVerificationJob.mockResolvedValue({ status: "idle" });
    workerMocks.processNextLeadArtifactJob.mockResolvedValue({ status: "idle" });
    workerMocks.repairAiWebsiteFindingConsistency.mockResolvedValue(0);
    workerMocks.recomputeAllLeadQualityScores.mockResolvedValue(0);
    workerMocks.getTenantScoreRecomputeSettings.mockResolvedValue({ scheduler_score_recompute_enabled: true });

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
    expect(workerMocks.getTenantScoreRecomputeSettings).toHaveBeenCalledTimes(1);
  });

  it("binds AI triggers to tenant worker authorization and ignores forged request scope", async () => {
    internalWorkerRouteMocks.runTenantInternalWorkerRoute.mockResolvedValue(NextResponse.json({ status: "idle" }));
    const verificationRequest = new NextRequest(
      "https://example.test/api/ai/verify-next?worker=artifact&tenantId=forged",
      { method: "POST", body: JSON.stringify({ workspaceId: "forged" }) },
    );
    const artifactRequest = new NextRequest(
      "https://example.test/api/ai/artifacts/process-next?worker=ai_verification&tenantId=forged",
      { method: "POST", body: JSON.stringify({ workspaceId: "forged" }) },
    );

    const verificationResponse = await postVerifyNext(verificationRequest);
    const artifactResponse = await postArtifactProcessNext(artifactRequest);

    expect(internalWorkerRouteMocks.runTenantInternalWorkerRoute).toHaveBeenNthCalledWith(
      1,
      verificationRequest,
      "ai_verification",
      "queue:operate",
      expect.any(Function),
      expect.objectContaining({
        resolveLease: expect.any(Function),
        sessionPermission: "queue:operate",
        action: "ai_verification:process",
      }),
    );
    expect(internalWorkerRouteMocks.runTenantInternalWorkerRoute).toHaveBeenNthCalledWith(
      2,
      artifactRequest,
      "artifact",
      "queue:operate",
      expect.any(Function),
      expect.objectContaining({
        resolveLease: expect.any(Function),
        sessionPermission: "queue:operate",
        action: "artifact:process",
      }),
    );
    expect(verificationResponse.headers.get("cache-control")).toContain("no-store");
    expect(artifactResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("binds crawl and enrichment triggers to their exact tenant worker authorization", async () => {
    internalWorkerRouteMocks.runTenantInternalWorkerRoute.mockResolvedValue(NextResponse.json({ status: "idle" }));
    const processRequest = new NextRequest(
      "https://example.test/api/crawl/process-next?worker=enrichment&tenantId=forged",
      { method: "POST", body: JSON.stringify({ worker: "enrichment", workspaceId: "forged" }) },
    );
    const enrichRequest = new NextRequest(
      "https://example.test/api/crawl/enrich-next?worker=crawl&tenantId=forged",
      { method: "POST", body: JSON.stringify({ worker: "crawl", workspaceId: "forged" }) },
    );

    await postProcessNext(processRequest);
    await postEnrichNext(enrichRequest);

    expect(internalWorkerRouteMocks.runTenantInternalWorkerRoute).toHaveBeenNthCalledWith(
      1,
      processRequest,
      "crawl",
      "queue:operate",
      expect.any(Function),
      expect.objectContaining({
        resolveLease: expect.any(Function),
        sessionPermission: "queue:operate",
        action: "crawl:process",
      }),
    );
    expect(internalWorkerRouteMocks.runTenantInternalWorkerRoute).toHaveBeenNthCalledWith(
      2,
      enrichRequest,
      "enrichment",
      "queue:operate",
      expect.any(Function),
      expect.objectContaining({
        resolveLease: expect.any(Function),
        sessionPermission: "queue:operate",
        action: "enrichment:process",
      }),
    );
    expect(internalWorkerRouteMocks.runInternalWorkerRoute).not.toHaveBeenCalled();
  });

  it("does not include the deleted legacy batch tick route", () => {
    expect(workerRoutes.map(([path]) => path)).not.toContain("/api/workers/tick");
    expect(existsSync(join(process.cwd(), "src/app/api/workers/tick/route.ts"))).toBe(false);
  });
});
