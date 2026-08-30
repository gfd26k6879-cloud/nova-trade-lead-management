import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const workerMocks = vi.hoisted(() => ({
  processNextUnit: vi.fn(),
  enrichNextLead: vi.fn(),
}));

vi.mock("@/lib/crawl/worker", () => ({ processNextUnit: workerMocks.processNextUnit }));
vi.mock("@/lib/crawl/enrichment", () => ({ enrichNextLead: workerMocks.enrichNextLead }));

import { GET as getProcessNext, POST as postProcessNext } from "@/app/api/crawl/process-next/route";
import { GET as getEnrichNext, POST as postEnrichNext } from "@/app/api/crawl/enrich-next/route";

const routes = [
  ["/api/crawl/process-next", getProcessNext, postProcessNext],
  ["/api/crawl/enrich-next", getEnrichNext, postEnrichNext],
] as const;

describe("crawl worker tenant route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(routes)("%s rejects GET with a private uncached response", async (_path, getRoute) => {
    const response = await getRoute();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Method Not Allowed" });
    expect(workerMocks.processNextUnit).not.toHaveBeenCalled();
    expect(workerMocks.enrichNextLead).not.toHaveBeenCalled();
  });

  it.each(routes)("%s fails closed before unscoped crawl work", async (path, _getRoute, postRoute) => {
    const request = new NextRequest(`https://example.test${path}?tenantId=forged&worker=artifact`, {
      method: "POST",
      headers: {
        authorization: "Bearer worker-secret",
        "x-internal-worker-selector": "opaque-crawl-worker-lease",
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
    expect(workerMocks.processNextUnit).not.toHaveBeenCalled();
    expect(workerMocks.enrichNextLead).not.toHaveBeenCalled();
  });
});
