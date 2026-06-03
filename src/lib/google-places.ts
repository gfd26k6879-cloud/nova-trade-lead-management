import { inferPlaceDetailsSkuFromFieldMask, type GooglePlacesSku } from "@/lib/google-pricing";
import { getConfiguredGooglePlacesApiKey } from "@/lib/db/queries";

const API_BASE = "https://places.googleapis.com/v1";

export const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.businessStatus",
  "places.primaryType",
  "places.priceLevel",
  "places.regularOpeningHours",
  "places.photos",
  "places.location",
  "nextPageToken",
].join(",");

export const TEXT_SEARCH_PRO_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.businessStatus",
  "places.primaryType",
  "places.location",
  "nextPageToken",
].join(",");

export const DETAILS_STAGE_A_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "types",
  "businessStatus",
  "priceLevel",
  "regularOpeningHours",
  "photos",
  "primaryType",
  "location",
].join(",");

export const DETAILS_STAGE_B_FIELD_MASK = [
  DETAILS_STAGE_A_FIELD_MASK,
  "reviews",
  "editorialSummary",
].join(",");

export interface PlaceReview {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: { text: string; languageCode?: string };
  authorAttribution?: { displayName?: string };
}

export interface PlaceResult {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  businessStatus?: string;
  priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; periods?: unknown[]; weekdayDescriptions?: string[] };
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
  primaryType?: string;
  location?: { latitude: number; longitude: number };
  reviews?: PlaceReview[];
  editorialSummary?: { text: string; languageCode?: string };
}

export interface LocationBias {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface TextSearchResponse {
  places: PlaceResult[];
  nextPageToken?: string;
}

export interface TextSearchOptions {
  fieldMask?: string;
}

export class PlacesApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message = `Places API error ${status}: ${body}`,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

export interface GetPlaceDetailsOptions {
  includeAtmosphere?: boolean;
  cacheTtlDays?: number;
}

export interface PlaceDetailsResult {
  place: PlaceResult | null;
  fromCache: boolean;
  sku: GooglePlacesSku;
  fieldMask: string;
}

async function getApiKey(): Promise<string> {
  const key = await getConfiguredGooglePlacesApiKey();
  if (!key) throw new Error("Google Places API key is not configured. Add it in Settings or set GOOGLE_PLACES_API_KEY.");
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok) return res;

      const body = await res.text();
      const apiError = new PlacesApiError(res.status, body);

      if (res.status === 429 || res.status >= 500) {
        lastError = apiError;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(delay);
          continue;
        }
      }

      throw apiError;
    } catch (err) {
      if (err instanceof Error && !(err instanceof PlacesApiError)) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(delay);
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError ?? new Error("fetchWithRetry exhausted");
}

export async function textSearch(
  textQuery: string,
  pageToken?: string,
  rateLimitMs = 200,
  locationBias?: LocationBias,
  options: TextSearchOptions = {},
): Promise<TextSearchResponse> {
  const apiKey = await getApiKey();

  if (rateLimitMs > 0) await sleep(rateLimitMs);

  const body = buildTextSearchRequestBody(textQuery, pageToken, locationBias);
  const fieldMask = options.fieldMask ?? TEXT_SEARCH_FIELD_MASK;

  const res = await fetchWithRetry(`${API_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return {
    places: data.places ?? [],
    nextPageToken: data.nextPageToken ?? undefined,
  };
}

function buildTextSearchRequestBody(
  textQuery: string,
  pageToken?: string,
  locationBias?: LocationBias,
): Record<string, unknown> {
  const body: Record<string, unknown> = { textQuery, pageSize: 20 };
  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusMeters,
      },
    };
  }
  if (pageToken) body.pageToken = pageToken;
  return body;
}

export async function getPlaceDetails(
  placeId: string,
  rateLimitMs = 200,
  options: GetPlaceDetailsOptions = {},
): Promise<PlaceDetailsResult> {
  const apiKey = await getApiKey();
  const includeAtmosphere = options.includeAtmosphere ?? false;
  const cacheTtlDays = options.cacheTtlDays ?? 30;
  const fieldMask = includeAtmosphere ? DETAILS_STAGE_B_FIELD_MASK : DETAILS_STAGE_A_FIELD_MASK;
  const sku: GooglePlacesSku = inferPlaceDetailsSkuFromFieldMask(fieldMask);

  if (rateLimitMs > 0) await sleep(rateLimitMs);

  const cleanId = placeId.startsWith("places/") ? placeId : `places/${placeId}`;

  if (cacheTtlDays > 0) {
    try {
      const { getCachedPlaceResponse } = await import("@/lib/db/queries");
      const cached = getCachedPlaceResponse(placeId, cacheTtlDays, includeAtmosphere);
      if (cached) {
        return {
          place: cached as unknown as PlaceResult,
          fromCache: true,
          sku,
          fieldMask,
        };
      }
    } catch {
      // cache read failure is non-critical
    }
  }

  const res = await fetchWithRetry(`${API_BASE}/${cleanId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
  });

  const data = await res.json();

  try {
    const { cachePlaceResponse } = await import("@/lib/db/queries");
    cachePlaceResponse(placeId, JSON.stringify(data));
  } catch { /* cache failure is non-critical */ }

  return {
    place: data ?? null,
    fromCache: false,
    sku,
    fieldMask,
  };
}
