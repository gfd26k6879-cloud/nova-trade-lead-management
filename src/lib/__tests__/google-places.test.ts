import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getConfiguredGooglePlacesApiKey: vi.fn(() => Promise.resolve("test-google-key")),
  getCachedPlaceResponse: vi.fn(),
  cachePlaceResponse: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getConfiguredGooglePlacesApiKey: dbMocks.getConfiguredGooglePlacesApiKey,
  getCachedPlaceResponse: dbMocks.getCachedPlaceResponse,
  cachePlaceResponse: dbMocks.cachePlaceResponse,
}));

import { getPlaceDetails, TEXT_SEARCH_PRO_FIELD_MASK, textSearch } from "@/lib/google-places";
import { PLACE_CACHE_METADATA_KEY } from "@/lib/place-cache-contract";

describe("Google Places Text Search", () => {
  beforeEach(() => {
    dbMocks.getConfiguredGooglePlacesApiKey.mockResolvedValue("test-google-key");
    dbMocks.getCachedPlaceResponse.mockResolvedValue(null);
    dbMocks.cachePlaceResponse.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("keeps request parameters identical when fetching a next page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    } as Response);
    const locationBias = { lat: 43.6668, lng: -79.381, radiusMeters: 5000 };

    await textSearch("dentist near Toronto, ON, M4W, Canada", undefined, 0, locationBias, {
      fieldMask: TEXT_SEARCH_PRO_FIELD_MASK,
    });
    await textSearch("dentist near Toronto, ON, M4W, Canada", "page-2-token", 0, locationBias, {
      fieldMask: TEXT_SEARCH_PRO_FIELD_MASK,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as Record<string, unknown>;

    expect(firstRequest).toMatchObject({
      textQuery: "dentist near Toronto, ON, M4W, Canada",
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: 43.6668, longitude: -79.381 },
          radius: 5000,
        },
      },
    });
    expect(secondRequest).toEqual({
      ...firstRequest,
      pageToken: "page-2-token",
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "X-Goog-FieldMask": TEXT_SEARCH_PRO_FIELD_MASK,
    });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      "X-Goog-FieldMask": TEXT_SEARCH_PRO_FIELD_MASK,
    });
  });

  it("aborts a rate-limit wait before issuing a provider request", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const pending = textSearch("dentist near Denver", undefined, 60_000, undefined, {
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(deadlineError);

    await expect(pending).rejects.toBe(deadlineError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops retry backoff immediately when the request signal aborts", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("temporary failure", { status: 503 }),
    );

    const pending = textSearch("dentist near Denver", undefined, 0, undefined, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort(deadlineError);

    await expect(pending).rejects.toBe(deadlineError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Google Place Details", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    dbMocks.getConfiguredGooglePlacesApiKey.mockResolvedValue("test-google-key");
    dbMocks.getCachedPlaceResponse.mockResolvedValue(null);
    dbMocks.cachePlaceResponse.mockResolvedValue(undefined);
  });

  it("returns an awaited cache hit without resolving an API key or calling Google", async () => {
    const cached = { id: "places/cached", displayName: { text: "Cached business" } };
    dbMocks.getCachedPlaceResponse.mockResolvedValue(cached);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await getPlaceDetails("cached", 0, { cacheTtlDays: 30 });

    expect(result).toMatchObject({ place: cached, fromCache: true });
    expect(dbMocks.getCachedPlaceResponse).toHaveBeenCalledWith("cached", 30, false);
    expect(dbMocks.getConfiguredGooglePlacesApiKey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the cache before provider setup and persists a sanitized miss", async () => {
    const order: string[] = [];
    dbMocks.getCachedPlaceResponse.mockImplementation(async () => {
      order.push("cache-read");
      return null;
    });
    dbMocks.getConfiguredGooglePlacesApiKey.mockImplementation(async () => {
      order.push("api-key");
      return "test-google-key";
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      order.push("fetch");
      return new Response(JSON.stringify({
        id: "places/live",
        displayName: { text: "Live business" },
        reviews: [{
          name: "places/live/reviews/sensitive-profile-id",
          text: { text: "The website was hard to find -- sensitive review body" },
          authorAttribution: { displayName: "Sensitive Reviewer" },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    dbMocks.cachePlaceResponse.mockImplementation(async () => {
      order.push("cache-write");
    });

    const result = await getPlaceDetails("live", 0, { cacheTtlDays: 30, includeAtmosphere: true });

    expect(order).toEqual(["cache-read", "api-key", "fetch", "cache-write"]);
    expect(result.fromCache).toBe(false);
    expect(result.place?.reviews).toHaveLength(1);
    expect(result.reviewInsights?.keywords).toContain("mentions website");
    expect(dbMocks.getCachedPlaceResponse).toHaveBeenCalledWith("live", 30, true);
    const persisted = JSON.parse(dbMocks.cachePlaceResponse.mock.calls[0][1] as string);
    expect(persisted.reviews).toBeUndefined();
    expect(persisted.displayName).toEqual({ text: "Live business" });
    expect(persisted[PLACE_CACHE_METADATA_KEY]).toMatchObject({
      schemaVersion: 1,
      detailsStage: "stage-b",
      reviewInsights: {
        keywords: expect.arrayContaining(["mentions website", "hard to find"]),
        totalReviews: 1,
      },
    });
    const persistedJson = JSON.stringify(persisted);
    expect(persistedJson).not.toContain("sensitive review body");
    expect(persistedJson).not.toContain("Sensitive Reviewer");
    expect(persistedJson).not.toContain("sensitive-profile-id");
  });

  it("restores derived review intelligence from a Stage-B cache entry with no raw reviews", async () => {
    const cached = {
      id: "places/cached-stage-b",
      displayName: { text: "Cached Stage B business" },
      [PLACE_CACHE_METADATA_KEY]: {
        schemaVersion: 1,
        detailsStage: "stage-b",
        reviewInsights: {
          keywords: ["needs online booking"],
          painPoints: ["needs online booking"],
          sentimentRatio: 0.5,
          totalReviews: 4,
        },
      },
    };
    dbMocks.getCachedPlaceResponse.mockResolvedValue(cached);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await getPlaceDetails("cached-stage-b", 0, {
      cacheTtlDays: 30,
      includeAtmosphere: true,
    });

    expect(result).toMatchObject({
      place: cached,
      fromCache: true,
      reviewInsights: {
        keywords: ["needs online booking"],
        totalReviews: 4,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards abort to an in-flight Place Details request without retrying", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });

    const pending = getPlaceDetails("abort-in-flight", 0, {
      cacheTtlDays: 30,
      includeAtmosphere: true,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort(deadlineError);

    await expect(pending).rejects.toBe(deadlineError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbMocks.cachePlaceResponse).not.toHaveBeenCalled();
  });

  it("keeps a rejected cache write non-fatal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ id: "places/live" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    dbMocks.cachePlaceResponse.mockRejectedValue(new Error("cache unavailable"));

    await expect(getPlaceDetails("live", 0, { cacheTtlDays: 30 })).resolves.toMatchObject({
      fromCache: false,
      place: { id: "places/live" },
    });
  });
});
