import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-api-key-123");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

async function importFresh() {
  vi.resetModules();
  return await import("@/lib/google-places");
}

describe("Places API retry behavior", () => {
  it("retries on 429 and succeeds", async () => {
    const { textSearch } = await importFresh();

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Rate limited", { status: 429 });
      }
      return new Response(JSON.stringify({ places: [{ id: "places/abc" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await textSearch("dentist near Denver", undefined, 0);

    expect(result.places).toHaveLength(1);
    expect(result.places[0].id).toBe("places/abc");
    expect(callCount).toBe(2);
  });

  it("retries on 500 twice then succeeds", async () => {
    const { textSearch } = await importFresh();

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response("Server error", { status: 500 });
      }
      return new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await textSearch("dentist near Denver", undefined, 0);

    expect(result.places).toHaveLength(0);
    expect(callCount).toBe(3);
  });

  it("gives up after max retries on persistent 500", async () => {
    const { textSearch } = await importFresh();

    globalThis.fetch = vi.fn(async () => {
      return new Response("Server error", { status: 500 });
    }) as typeof fetch;

    await expect(textSearch("dentist near Denver", undefined, 0)).rejects.toThrow();

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  }, 15000);

  it("does not retry on 400 (client error)", async () => {
    const { textSearch } = await importFresh();

    globalThis.fetch = vi.fn(async () => {
      return new Response("Bad request", { status: 400 });
    }) as typeof fetch;

    await expect(textSearch("dentist near Denver", undefined, 0)).rejects.toThrow("Places API error 400");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("completes quickly with rateLimitMs = 0", async () => {
    const { textSearch } = await importFresh();

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ places: [{ id: "places/fast" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const start = Date.now();
    const result = await textSearch("dentist near Denver", undefined, 0);
    const elapsed = Date.now() - start;

    expect(result.places).toHaveLength(1);
    expect(elapsed).toBeLessThan(500);
  });

  it("sends correct headers and body for text search", async () => {
    const { TEXT_SEARCH_FIELD_MASK, textSearch } = await importFresh();

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await textSearch("plumber near Boulder", undefined, 0);

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain("places:searchText");
    expect(opts.method).toBe("POST");
    expect(opts.headers["X-Goog-Api-Key"]).toBe("test-api-key-123");
    expect(opts.headers["X-Goog-FieldMask"]).toBe(TEXT_SEARCH_FIELD_MASK);
    expect(TEXT_SEARCH_FIELD_MASK).toContain("places.websiteUri");
    expect(TEXT_SEARCH_FIELD_MASK).toContain("places.nationalPhoneNumber");

    const body = JSON.parse(opts.body);
    expect(body.textQuery).toBe("plumber near Boulder");
    expect(body.pageSize).toBe(20);
  });

  it("includes locationBias when provided", async () => {
    const { textSearch } = await importFresh();

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await textSearch("dentist near Denver", undefined, 0, {
      lat: 39.75,
      lng: -104.99,
      radiusMeters: 8000,
    });

    const fetchFn = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.locationBias).toBeDefined();
    expect(body.locationBias.circle.center.latitude).toBe(39.75);
    expect(body.locationBias.circle.radius).toBe(8000);
  });
});
