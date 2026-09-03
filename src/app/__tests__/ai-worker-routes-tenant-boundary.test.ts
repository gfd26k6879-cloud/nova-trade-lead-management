import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const workerMocks = vi.hoisted(() => ({
  processNextAiVerificationJob: vi.fn(),
  processNextLeadArtifactJob: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({
  resolveLease: vi.fn(async () => null),
  createFailClosedWorkerLeaseResolverRuntime: vi.fn(),
}));

runtimeMocks.createFailClosedWorkerLeaseResolverRuntime.mockImplementation(
  () => runtimeMocks.resolveLease,
);

vi.mock("@/lib/ai/verification-worker", () => ({
  processNextAiVerificationJob: workerMocks.processNextAiVerificationJob,
}));
vi.mock("@/lib/ai/artifact-worker", () => ({
  processNextLeadArtifactJob: workerMocks.processNextLeadArtifactJob,
}));
vi.mock("@/lib/tenancy/worker-lease-runtime", () => ({
  createFailClosedWorkerLeaseResolverRuntime:
    runtimeMocks.createFailClosedWorkerLeaseResolverRuntime,
}));

import { POST as postVerifyNext } from "@/app/api/ai/verify-next/route";
import { POST as postArtifactProcessNext } from "@/app/api/ai/artifacts/process-next/route";

const routes = [
  [
    "/api/ai/verify-next",
    postVerifyNext,
    { workerName: "ai_verification", action: "ai_verification:process" },
  ],
  [
    "/api/ai/artifacts/process-next",
    postArtifactProcessNext,
    { workerName: "artifact", action: "artifact:process" },
  ],
] as const;

describe("AI worker tenant route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(routes)("%s executes its bound fail-closed lease resolver", async (path, postRoute, binding) => {
    const request = new NextRequest(`https://example.test${path}?tenantId=forged`, {
      method: "POST",
      headers: {
        authorization: "Bearer worker-secret",
        "x-internal-worker-selector": "opaque-ai-worker-lease",
      },
      body: JSON.stringify({ workspaceId: "forged", worker: "crawl" }),
    });

    const response = await postRoute(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker authorization failed",
    });
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(runtimeMocks.createFailClosedWorkerLeaseResolverRuntime).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.createFailClosedWorkerLeaseResolverRuntime).toHaveBeenCalledWith(binding);
    expect(runtimeMocks.resolveLease).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.resolveLease).toHaveBeenCalledWith("opaque-ai-worker-lease");
    expect(workerMocks.processNextAiVerificationJob).not.toHaveBeenCalled();
    expect(workerMocks.processNextLeadArtifactJob).not.toHaveBeenCalled();
  });
});
