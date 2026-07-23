import { inferPlaceDetailsSkuFromFieldMask, type GooglePlacesSku } from "@/lib/google-pricing";
import { getConfiguredGooglePlacesApiKey } from "@/lib/db/queries";
import { extractReviewInsights, type ReviewInsights } from "@/lib/review-intelligence";
import {
  PLACE_CACHE_METADATA_KEY,
  createPlaceCacheMetadata,
  readPlaceCacheMetadata,
} from "@/lib/place-cache-contract";

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
  signal?: AbortSignal;
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
  signal?: AbortSignal;
}

export interface PlaceDetailsResult {
  place: PlaceResult | null;
  fromCache: boolean;
  sku: GooglePlacesSku;
  fieldMask: string;
  reviewInsights?: ReviewInsights;
}

async function getApiKey(): Promise<string> {
  const key = await getConfiguredGooglePlacesApiKey();
  if (!key) throw new Error("Google Places API key is not configured. Add it in Settings or set GOOGLE_PLACES_API_KEY.");
  return key;
}

async function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const timer = setTimeout(() => finish(resolve), ms);
    const onAbort = () => finish(() => {
      clearTimeout(timer);
      reject(abortReason(signal));
    });

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  const signal = options.signal;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
    try {
      const res = await fetch(url, options);
      throwIfAborted(signal);

      if (res.ok) return res;

      const body = await res.text();
      throwIfAborted(signal);
      const apiError = new PlacesApiError(res.status, body);

      if (res.status === 429 || res.status >= 500) {
        lastError = apiError;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(delay, signal);
          continue;
        }
      }

      throw apiError;
    } catch (err) {
      throwIfAborted(signal);
      if (err instanceof Error && !(err instanceof PlacesApiError)) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(delay, signal);
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
  throwIfAborted(options.signal);
  const apiKey = await getApiKey();
  throwIfAborted(options.signal);

  if (rateLimitMs > 0) await sleep(rateLimitMs, options.signal);

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
    signal: options.signal,
  });

  const data = await res.json();
  throwIfAborted(options.signal);
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
  const includeAtmosphere = options.includeAtmosphere ?? false;
  const cacheTtlDays = options.cacheTtlDays ?? 30;
  const fieldMask = includeAtmosphere ? DETAILS_STAGE_B_FIELD_MASK : DETAILS_STAGE_A_FIELD_MASK;
  const sku: GooglePlacesSku = inferPlaceDetailsSkuFromFieldMask(fieldMask);
  const cleanId = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
  throwIfAborted(options.signal);

  if (cacheTtlDays > 0) {
    try {
      const { getCachedPlaceResponse } = await import("@/lib/db/queries");
      const cached = await getCachedPlaceResponse(placeId, cacheTtlDays, includeAtmosphere);
      throwIfAborted(options.signal);
      if (isPlaceResult(cached)) {
        const cacheMetadata = readPlaceCacheMetadata(cached);
        return {
          place: cached,
          fromCache: true,
          sku,
          fieldMask,
          reviewInsights: cacheMetadata?.reviewInsights,
        };
      }
    } catch {
      throwIfAborted(options.signal);
      // cache read failure is non-critical
    }
  }

  throwIfAborted(options.signal);
  const apiKey = await getApiKey();
  throwIfAborted(options.signal);
  if (rateLimitMs > 0) await sleep(rateLimitMs, options.signal);

  const res = await fetchWithRetry(`${API_BASE}/${cleanId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    signal: options.signal,
  });

  const data = await res.json() as PlaceResult | null;
  throwIfAborted(options.signal);
  const reviewInsights = includeAtmosphere
    ? extractReviewInsights(Array.isArray(data?.reviews) ? data.reviews : [])
    : undefined;

  if (cacheTtlDays > 0) {
    try {
      throwIfAborted(options.signal);
      const { cachePlaceResponse } = await import("@/lib/db/queries");
      await cachePlaceResponse(placeId, JSON.stringify(sanitizePlaceDetailsForStorage(data, {
        includeAtmosphere,
        reviewInsights,
      })));
    } catch {
      throwIfAborted(options.signal);
      // cache failure is non-critical
    }
  }
  throwIfAborted(options.signal);

  return {
    place: data ?? null,
    fromCache: false,
    sku,
    fieldMask,
    reviewInsights,
  };
}

function isPlaceResult(value: Record<string, unknown> | null): value is Record<string, unknown> & PlaceResult {
  return Boolean(value && typeof value.id === "string" && value.id.trim());
}

export function sanitizePlaceDetailsForStorage(
  place: PlaceResult | Record<string, unknown> | null,
  options: { includeAtmosphere?: boolean; reviewInsights?: ReviewInsights } = {},
): Record<string, unknown> | null {
  if (!place) return null;
  const sanitized = { ...place } as Record<string, unknown>;
  const existingMetadata = readPlaceCacheMetadata(sanitized);
  const rawReviews = Array.isArray(place.reviews) ? place.reviews : [];
  const includeAtmosphere = existingMetadata?.detailsStage === "stage-b"
    || options.includeAtmosphere === true
    || (options.includeAtmosphere === undefined && Object.prototype.hasOwnProperty.call(place, "reviews"));
  const reviewInsights = options.reviewInsights
    ?? existingMetadata?.reviewInsights
    ?? (includeAtmosphere ? extractReviewInsights(rawReviews) : undefined);
  delete sanitized.reviews;
  sanitized[PLACE_CACHE_METADATA_KEY] = createPlaceCacheMetadata({
    includeAtmosphere,
    reviewInsights,
  });
  return sanitized;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal?: AbortSignal | null): unknown {
  return signal?.reason ?? new DOMException("The operation was aborted", "AbortError");
}
