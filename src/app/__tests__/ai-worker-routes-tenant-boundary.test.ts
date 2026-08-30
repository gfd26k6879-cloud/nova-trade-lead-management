import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const workerMocks = vi.hoisted(() => ({
  processNextAiVerificationJob: vi.fn(),
  processNextLeadArtifactJob: vi.fn(),
}));

vi.mock("@/lib/ai/verification-worker", () => ({
  processNextAiVerificationJob: workerMocks.processNextAiVerificationJob,
}));
vi.mock("@/lib/ai/artifact-worker", () => ({
  processNextLeadArtifactJob: workerMocks.processNextLeadArtifactJob,
}));

import { POST as postVerifyNext } from "@/app/api/ai/verify-next/route";
import { POST as postArtifactProcessNext } from "@/app/api/ai/artifacts/process-next/route";

const routes = [
  ["/api/ai/verify-next", postVerifyNext],
  ["/api/ai/artifacts/process-next", postArtifactProcessNext],
] as const;

describe("AI worker tenant route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(routes)("%s fails closed before durable tenant leases are wired", async (path, postRoute) => {
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
    expect(workerMocks.processNextAiVerificationJob).not.toHaveBeenCalled();
    expect(workerMocks.processNextLeadArtifactJob).not.toHaveBeenCalled();
  });
});
