import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getConfiguredGooglePlacesApiKey: vi.fn(() => Promise.resolve("test-google-key")),
}));

vi.mock("@/lib/db/queries", () => ({
  getConfiguredGooglePlacesApiKey: dbMocks.getConfiguredGooglePlacesApiKey,
}));

import { TEXT_SEARCH_PRO_FIELD_MASK, textSearch } from "@/lib/google-places";

describe("Google Places Text Search", () => {
  beforeEach(() => {
    dbMocks.getConfiguredGooglePlacesApiKey.mockResolvedValue("test-google-key");
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
});
