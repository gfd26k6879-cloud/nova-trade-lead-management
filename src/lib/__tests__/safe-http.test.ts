import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const transportMocks = vi.hoisted(() => ({
  requestHttp: vi.fn(),
  requestHttps: vi.fn(),
}));

vi.mock("node:http", () => ({ request: transportMocks.requestHttp }));
vi.mock("node:https", () => ({ request: transportMocks.requestHttps }));

import {
  fetchSafeHttpUrl,
  UnsafeOutboundUrlError,
  type SafeHttpLookup,
} from "@/lib/safe-http";

const PUBLIC_IPV4 = "93.184.216.34";

function publicLookup(address = PUBLIC_IPV4): SafeHttpLookup {
  return vi.fn(async () => [{ address, family: 4 }]);
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("fetchSafeHttpUrl", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://2130706433/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[fc00::1]/admin",
    "http://localhost./admin",
    "http://service.internal/admin",
  ])("rejects a direct private or special-use address before fetch: %s", async (url) => {
    const fetchImpl = vi.fn();
    const lookupImpl = publicLookup();

    await expect(fetchSafeHttpUrl(url, {}, { fetchImpl, lookupImpl })).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it.each([
    "file:///etc/passwd",
    "ftp://leads.example/file",
    "https://operator:secret@leads.example/",
  ])("rejects a non-HTTP or credential-bearing URL: %s", async (url) => {
    const fetchImpl = vi.fn();

    await expect(fetchSafeHttpUrl(url, {}, { fetchImpl, lookupImpl: publicLookup() }))
      .rejects.toBeInstanceOf(UnsafeOutboundUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a hostname when DNS resolves to a private address", async () => {
    const fetchImpl = vi.fn();
    const lookupImpl = publicLookup("10.24.0.8");

    await expect(fetchSafeHttpUrl("https://leads.example", {}, { fetchImpl, lookupImpl }))
      .rejects.toThrow("private or special-use");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects mixed public and private DNS answers", async () => {
    const fetchImpl = vi.fn();
    const lookupImpl: SafeHttpLookup = vi.fn(async () => [
      { address: PUBLIC_IPV4, family: 4 },
      { address: "192.168.1.12", family: 4 },
    ]);

    await expect(fetchSafeHttpUrl("https://leads.example", {}, { fetchImpl, lookupImpl }))
      .rejects.toThrow("private or special-use");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows a public HTTP(S) target and forces manual redirect handling", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    const result = await fetchSafeHttpUrl("https://leads.example/health", {
      method: "HEAD",
      headers: { "User-Agent": "NovaTradeLeadManagement-Test/1.0" },
    }, { fetchImpl, lookupImpl: publicLookup() });

    expect(result.finalUrl).toBe("https://leads.example/health");
    expect(result.redirectCount).toBe(0);
    expect(result.response.status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledWith("https://leads.example/health", expect.objectContaining({
      method: "HEAD",
      redirect: "manual",
    }));
  });

  it("allows a direct global-unicast IPv6 target without DNS lookup", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const lookupImpl = publicLookup();

    await expect(fetchSafeHttpUrl("https://[2606:4700:4700::1111]/", {}, { fetchImpl, lookupImpl }))
      .resolves.toMatchObject({ redirectCount: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it("pins the production transport to the validated address while preserving Host", async () => {
    const incoming = Object.assign(Readable.from([Buffer.from("ok")]), {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "text/plain" },
    });
    transportMocks.requestHttp.mockImplementationOnce((requestOptions, onResponse) => {
      const request = {
        once: vi.fn(),
        end: vi.fn(() => onResponse(incoming)),
      };
      return request;
    });

    const result = await fetchSafeHttpUrl("http://leads.example/path?one=1", {}, {
      lookupImpl: publicLookup(),
    });

    expect(await result.response.text()).toBe("ok");
    expect(transportMocks.requestHttp).toHaveBeenCalledTimes(1);
    expect(transportMocks.requestHttp).toHaveBeenCalledWith(expect.objectContaining({
      hostname: PUBLIC_IPV4,
      family: 4,
      path: "/path?one=1",
      agent: false,
      headers: expect.objectContaining({ host: "leads.example" }),
    }), expect.any(Function));
  });

  it("preserves the original hostname for HTTPS certificate verification and SNI", async () => {
    const incoming = Object.assign(Readable.from([Buffer.from("secure")]), {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "text/plain" },
    });
    transportMocks.requestHttps.mockImplementationOnce((_requestOptions, onResponse) => {
      return {
        once: vi.fn(),
        end: vi.fn(() => onResponse(incoming)),
      };
    });

    const result = await fetchSafeHttpUrl("https://business.example/", {}, {
      lookupImpl: publicLookup(),
    });

    expect(await result.response.text()).toBe("secure");
    expect(transportMocks.requestHttps).toHaveBeenCalledWith(expect.objectContaining({
      hostname: PUBLIC_IPV4,
      servername: "business.example",
      headers: expect.objectContaining({ host: "business.example" }),
    }), expect.any(Function));
  });

  it("blocks a redirect to a private address before the second request", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse("http://127.0.0.1/admin"));

    await expect(fetchSafeHttpUrl("https://leads.example/start", {}, {
      fetchImpl,
      lookupImpl: publicLookup(),
    })).rejects.toBeInstanceOf(UnsafeOutboundUrlError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("revalidates and follows a public redirect", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      return String(input) === "https://leads.example/start"
        ? redirectResponse("https://cdn.example/final", 301)
        : new Response("ok", { status: 200 });
    });
    const lookupImpl = publicLookup();

    const result = await fetchSafeHttpUrl("https://leads.example/start", {}, { fetchImpl, lookupImpl });

    expect(result.finalUrl).toBe("https://cdn.example/final");
    expect(result.redirectCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(lookupImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects redirect loops beyond the configured limit", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse("/again"));

    await expect(fetchSafeHttpUrl("https://leads.example/start", {}, {
      fetchImpl,
      lookupImpl: publicLookup(),
      maxRedirects: 1,
    })).rejects.toThrow("too many redirects");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lets the caller timeout a pending DNS resolution", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn();
    const lookupImpl: SafeHttpLookup = vi.fn(() => new Promise<ReadonlyArray<{ address: string; family: number }>>(() => {}));

    const pending = fetchSafeHttpUrl("https://leads.example", {
      signal: controller.signal,
    }, { fetchImpl, lookupImpl });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
