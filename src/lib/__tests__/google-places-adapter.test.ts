import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluateConnectorAdapterFixture } from "@/lib/connectors/adapter-contract";
import {
  GOOGLE_PLACES_APPROVED_FIELD_MASKS,
  GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR,
  createGooglePlacesOnePageAdapter,
  type GooglePlacesAdapterRequest,
  type GooglePlacesInjectedClient,
} from "@/lib/connectors/google-places-adapter";
import { PlacesApiError } from "@/lib/google-places";
import { inferPlaceDetailsSkuFromFieldMask } from "@/lib/google-pricing";

const NOW = new Date("2026-08-29T18:00:00.000Z");

function searchRequest(overrides: Record<string, unknown> = {}): GooglePlacesAdapterRequest {
  return {
    version: 1,
    executionMode: "fixture",
    tenantId: "tenant-a",
    authorizedTenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-google-a",
    observedAt: NOW.toISOString(),
    deadlineAt: new Date(NOW.getTime() + 10_000).toISOString(),
    policyVersion: "launch-v1",
    operation: "search_text",
    fields: [
      "place_id", "business_name", "formatted_address", "website", "rating",
      "review_count", "operating_hours_metadata", "business_status",
    ],
    fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.search_text,
    query: "industrial coatings near Denver, Colorado, United States",
    pageToken: null,
    locationBias: { lat: 39.7392, lng: -104.9903, radiusMeters: 8_000 },
    ...overrides,
  } as GooglePlacesAdapterRequest;
}

function detailsRequest(overrides: Record<string, unknown> = {}): GooglePlacesAdapterRequest {
  return {
    version: 1,
    executionMode: "fixture",
    tenantId: "tenant-a",
    authorizedTenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-google-details-a",
    observedAt: NOW.toISOString(),
    deadlineAt: new Date(NOW.getTime() + 10_000).toISOString(),
    policyVersion: "launch-v1",
    operation: "place_details",
    fields: ["place_id", "business_name", "website", "phone", "maps_uri", "category"],
    fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.place_details,
    placeId: "places/example-industrial",
    ...overrides,
  } as GooglePlacesAdapterRequest;
}

function clientWith(overrides: Partial<GooglePlacesInjectedClient> = {}) {
  const textSearch = vi.fn(async () => ({ places: [] }));
  const getPlaceDetails = vi.fn(async () => ({
    place: null,
    fromCache: false,
    sku: inferPlaceDetailsSkuFromFieldMask(GOOGLE_PLACES_APPROVED_FIELD_MASKS.place_details),
    fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.place_details,
  }));
  return {
    client: { textSearch, getPlaceDetails, ...overrides } as GooglePlacesInjectedClient,
    textSearch,
    getPlaceDetails,
  };
}

function adapterFor(client: GooglePlacesInjectedClient) {
  return createGooglePlacesOnePageAdapter(client, {
    activation: "fixture_only",
    approvedPolicyVersion: "launch-v1",
    maxDeadlineMs: 30_000,
    clock: () => Date.now(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Google Places injected one-page adapter", () => {
  it("exposes only fixture search/details operations and normalizes one cited search page", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fixture = clientWith({
      textSearch: vi.fn(async () => ({
        places: [{
          id: "places/example-industrial",
          displayName: { text: "Example Industrial" },
          formattedAddress: "100 Market St, Denver, CO",
          websiteUri: "https://example.test",
          rating: 4.6,
          userRatingCount: 23,
          regularOpeningHours: { openNow: true, periods: [{ ignored: true }] },
          businessStatus: "OPERATIONAL",
          photos: [{ name: "ignored-photo" }],
          location: { latitude: 39.7, longitude: -104.9 },
        }],
        nextPageToken: "provider-page-2",
      })),
    });
    const adapter = adapterFor(fixture.client);

    const result = await adapter.execute(searchRequest());

    expect(GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR).toEqual({
      sourceCardId: "google_places_legacy",
      executionMode: "fixture",
      transport: "none",
      operations: ["search_text", "place_details"],
      outputFields: expect.any(Array),
    });
    expect(adapter.capability).toMatchObject({
      activation: "fixture_only",
      serverOnly: true,
      rawPersistence: "forbidden",
      canonicalMutation: "forbidden",
    });
    expect(result).toMatchObject({
      ok: true,
      status: "page_complete",
      nextCursor: "provider-page-2",
      complete: false,
      usage: {
        clientCalls: 1,
        providerOperations: 1,
        providerCostMicros: null,
        fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.search_text,
      },
    });
    if (!result.ok) return;
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      recordType: "source_observation_draft",
      canonicalMutation: false,
      observation: {
        sourceCardId: "google_places_legacy",
        operation: "search_text",
        tenantId: "tenant-a",
        runId: "run-google-a",
        observedAt: NOW.toISOString(),
        fields: {
          place_id: "places/example-industrial",
          business_name: "Example Industrial",
          formatted_address: "100 Market St, Denver, CO",
          website: "https://example.test/",
          rating: 4.6,
          review_count: 23,
          operating_hours_metadata: { open_now: true },
          business_status: "OPERATIONAL",
        },
      },
      locator: {
        kind: "google_text_search_result",
        resultIndex: 0,
        placeId: "places/example-industrial",
        queryHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        pageTokenHash: null,
      },
    });
    expect(evaluateConnectorAdapterFixture(
      adapter.descriptor,
      result.observations[0].observation,
      { tenantId: "tenant-a" },
    )).toMatchObject({ decision: "allow", code: "D015_PASS" });
    expect(JSON.stringify(result)).not.toContain("ignored-photo");
    expect(JSON.stringify(result)).not.toContain("periods");
    expect(result).not.toHaveProperty("accounts");
    expect(result).not.toHaveProperty("leads");
    expect(fixture.client.textSearch).toHaveBeenCalledOnce();
    expect(fixture.client.textSearch).toHaveBeenCalledWith(
      "industrial coatings near Denver, Colorado, United States",
      undefined,
      0,
      { lat: 39.7392, lng: -104.9903, radiusMeters: 8_000 },
      { fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.search_text, signal: expect.any(AbortSignal) },
    );
    expect(fixture.client.getPlaceDetails).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    await expect(adapter.execute(searchRequest())).resolves.toEqual(result);
  });

  it("executes one cache-disabled, atmosphere-disabled details operation", async () => {
    const fixture = clientWith({
      getPlaceDetails: vi.fn(async () => ({
        place: {
          id: "places/example-industrial",
          displayName: { text: "Example Industrial" },
          websiteUri: "https://example.test",
          nationalPhoneNumber: "+1 303 555 0100",
          googleMapsUri: "https://maps.google.com/?cid=123",
          primaryType: "manufacturer",
        },
        fromCache: false,
        sku: inferPlaceDetailsSkuFromFieldMask(GOOGLE_PLACES_APPROVED_FIELD_MASKS.place_details),
        fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.place_details,
      })),
    });
    const adapter = adapterFor(fixture.client);

    const result = await adapter.execute(detailsRequest());

    expect(result).toMatchObject({
      ok: true,
      status: "complete",
      nextCursor: null,
      observations: [{
        observation: { fields: {
          place_id: "places/example-industrial",
          business_name: "Example Industrial",
          website: "https://example.test/",
          phone: "+1 303 555 0100",
          maps_uri: "https://maps.google.com/?cid=123",
          category: "manufacturer",
        } },
        locator: { kind: "google_place_details", placeId: "places/example-industrial" },
      }],
    });
    expect(fixture.client.getPlaceDetails).toHaveBeenCalledWith("places/example-industrial", 0, {
      includeAtmosphere: false,
      cacheTtlDays: 0,
      signal: expect.any(AbortSignal),
    });
    expect(fixture.client.textSearch).not.toHaveBeenCalled();
  });

  it.each([
    ["review field mask", { fieldMask: `${GOOGLE_PLACES_APPROVED_FIELD_MASKS.search_text},places.reviews` }],
    ["unknown output field", { fields: ["place_id", "reviews"] }],
    ["missing place identity", { fields: ["business_name"] }],
    ["oversized query", { query: "x".repeat(513) }],
    ["oversized page token", { pageToken: "x".repeat(2_049) }],
    ["cross-tenant request", { authorizedTenantId: "tenant-b" }],
    ["live execution", { executionMode: "live" }],
  ])("blocks a malformed or disallowed %s before any client call", async (_label, overrides) => {
    const fixture = clientWith();
    const result = await adapterFor(fixture.client).execute(searchRequest(overrides));

    expect(result).toMatchObject({ ok: false, status: "blocked", usage: { clientCalls: 0 } });
    expect(fixture.client.textSearch).not.toHaveBeenCalled();
    expect(fixture.client.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("rejects raw reviews and malformed provider envelopes without persisting raw data", async () => {
    const fixture = clientWith({
      textSearch: vi.fn(async () => ({
        places: [{
          id: "places/example-industrial",
          reviews: [{ text: { text: "sensitive review body" } }],
        }],
        nextPageToken: null,
      })),
    });

    const result = await adapterFor(fixture.client).execute(searchRequest());

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      providerStatus: "malformed_response",
      usage: { clientCalls: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive review body");
    expect(result).not.toHaveProperty("rawResponse");
  });

  it.each([
    [400, "invalid_request", "failed"],
    [403, "permission_denied", "blocked"],
    [404, "not_found", "failed"],
    [429, "rate_limited", "retryable"],
    [503, "provider_unavailable", "retryable"],
  ] as const)("classifies provider status %s without leaking its body", async (status, providerStatus, resultStatus) => {
    const fixture = clientWith({
      textSearch: vi.fn(async () => {
        throw new PlacesApiError(status, "provider token and raw body");
      }),
    });

    const result = await adapterFor(fixture.client).execute(searchRequest());

    expect(result).toMatchObject({
      ok: false,
      status: resultStatus,
      providerStatus,
      usage: { clientCalls: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("provider token");
  });

  it("classifies proxied provider failures without executing their prototype traps", async () => {
    let trapCalls = 0;
    const failure = new Proxy(new TypeError("provider secret"), {
      getPrototypeOf() { trapCalls += 1; throw new Error("must not execute"); },
    });
    const fixture = clientWith({
      textSearch: vi.fn(async () => Promise.reject(failure)),
    });

    await expect(adapterFor(fixture.client).execute(searchRequest())).resolves.toMatchObject({
      ok: false,
      status: "failed",
      providerStatus: "provider_error",
      usage: { clientCalls: 1 },
    });
    expect(trapCalls).toBe(0);
  });

  it("propagates cancellation before and during the client call", async () => {
    const fixture = clientWith({
      textSearch: vi.fn(async (_query, _token, _rate, _bias, options) => new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      })),
    });
    const adapter = adapterFor(fixture.client);
    const before = new AbortController();
    before.abort(new Error("cancel before"));
    await expect(adapter.execute(searchRequest(), { signal: before.signal })).resolves.toMatchObject({
      ok: false, status: "cancelled", providerStatus: "cancelled", usage: { clientCalls: 0 },
    });

    const during = new AbortController();
    const pending = adapter.execute(searchRequest(), { signal: during.signal });
    await vi.waitFor(() => expect(fixture.client.textSearch).toHaveBeenCalledOnce());
    during.abort(new Error("cancel during"));
    await expect(pending).resolves.toMatchObject({
      ok: false, status: "cancelled", providerStatus: "cancelled", usage: { clientCalls: 1 },
    });
  });

  it("enforces and propagates the request deadline", async () => {
    let receivedSignal: AbortSignal | undefined;
    const fixture = clientWith({
      textSearch: vi.fn(async (_query, _token, _rate, _bias, options) => {
        receivedSignal = options.signal;
        return new Promise((_, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        });
      }),
    });
    const adapter = adapterFor(fixture.client);
    const pending = adapter.execute(searchRequest({
      deadlineAt: new Date(NOW.getTime() + 100).toISOString(),
    }));
    await vi.advanceTimersByTimeAsync(101);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      status: "cancelled",
      providerStatus: "deadline_exceeded",
      usage: { clientCalls: 1 },
    });
    expect(receivedSignal?.aborted).toBe(true);
  });
});
