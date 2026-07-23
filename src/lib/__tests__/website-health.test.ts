import { describe, expect, it, vi } from "vitest";
import { checkWebsiteHealth } from "@/lib/website-health";
import type { SafeHttpLookup } from "@/lib/safe-http";

const lookupPublic: SafeHttpLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("checkWebsiteHealth safe outbound boundary", () => {
  it("preserves health semantics while counting validated redirects", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      return String(input) === "https://business.example/"
        ? new Response(null, { status: 302, headers: { location: "https://www.business.example/" } })
        : new Response(null, { status: 204 });
    });

    const health = await checkWebsiteHealth("https://business.example", 5000, { fetchImpl, lookupImpl: lookupPublic });

    expect(health.statusCode).toBe(204);
    expect(health.finalUrl).toBe("https://www.business.example/");
    expect(health.redirectCount).toBe(1);
    expect(health.ssl).toBe(true);
    expect(health.healthy).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a private target as unhealthy without issuing a request", async () => {
    const fetchImpl = vi.fn();

    const health = await checkWebsiteHealth("http://127.0.0.1/admin", 5000, { fetchImpl, lookupImpl: lookupPublic });

    expect(health).toEqual(expect.objectContaining({
      statusCode: 0,
      finalUrl: "http://127.0.0.1/admin",
      redirectCount: 0,
      healthy: false,
    }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates a caller abort into the active outbound health request", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });

    const pending = checkWebsiteHealth("https://business.example", 60_000, {
      fetchImpl,
      lookupImpl: lookupPublic,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort(deadlineError);

    await expect(pending).rejects.toBe(deadlineError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
