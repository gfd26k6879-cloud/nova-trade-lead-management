import "server-only";

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  DETAILS_STAGE_A_FIELD_MASK,
  PlacesApiError,
  TEXT_SEARCH_FIELD_MASK,
  type GetPlaceDetailsOptions,
  type LocationBias,
  type TextSearchOptions,
} from "@/lib/google-places";
import {
  inferPlaceDetailsSkuFromFieldMask,
  inferTextSearchSkuFromFieldMask,
  type GooglePlacesSku,
} from "@/lib/google-pricing";

import {
  GOOGLE_PLACES_FIXTURE_ADAPTER,
  type ConnectorAdapterDescriptor,
  type ConnectorFixtureObservation,
} from "./adapter-contract";

const MAX_QUERY_LENGTH = 512;
const MAX_PAGE_TOKEN_LENGTH = 2_048;
const MAX_RESULTS_PER_PAGE = 20;
const MAX_DEADLINE_MS = 60_000;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{0,159}$/u;
const PLACE_ID = /^places\/[A-Za-z0-9_-]{1,256}$/u;
const CATEGORY = /^[a-z0-9_]{1,80}$/u;
const BUSINESS_STATUSES = new Set([
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
]);
const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get;

export const GOOGLE_PLACES_APPROVED_FIELD_MASKS = Object.freeze({
  search_text: TEXT_SEARCH_FIELD_MASK,
  place_details: DETAILS_STAGE_A_FIELD_MASK,
});

export const GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR = Object.freeze({
  sourceCardId: GOOGLE_PLACES_FIXTURE_ADAPTER.sourceCardId,
  executionMode: "fixture",
  transport: "none",
  operations: Object.freeze(["search_text", "place_details"]),
  outputFields: GOOGLE_PLACES_FIXTURE_ADAPTER.outputFields,
} as const satisfies ConnectorAdapterDescriptor);

type GoogleOutputField = (typeof GOOGLE_PLACES_FIXTURE_ADAPTER.outputFields)[number];

type GooglePlacesRequestBase = Readonly<{
  version: 1;
  executionMode: "fixture";
  tenantId: string;
  authorizedTenantId: string;
  workspaceId: string;
  runId: string;
  observedAt: string;
  deadlineAt: string;
  policyVersion: string;
  fields: readonly GoogleOutputField[];
  fieldMask: string;
}>;

export type GooglePlacesSearchRequest = GooglePlacesRequestBase & Readonly<{
  operation: "search_text";
  query: string;
  pageToken: string | null;
  locationBias: LocationBias | null;
}>;

export type GooglePlacesDetailsRequest = GooglePlacesRequestBase & Readonly<{
  operation: "place_details";
  placeId: string;
}>;

export type GooglePlacesAdapterRequest = GooglePlacesSearchRequest | GooglePlacesDetailsRequest;

export interface GooglePlacesInjectedClient {
  textSearch(
    textQuery: string,
    pageToken?: string,
    rateLimitMs?: number,
    locationBias?: LocationBias,
    options?: TextSearchOptions,
  ): Promise<unknown>;
  getPlaceDetails(
    placeId: string,
    rateLimitMs?: number,
    options?: GetPlaceDetailsOptions,
  ): Promise<unknown>;
}

export type GooglePlacesOnePageAdapterOptions = Readonly<{
  activation: "fixture_only";
  approvedPolicyVersion: string;
  maxDeadlineMs: number;
  clock: () => number;
}>;

export type GooglePlacesProviderStatus =
  | "ok"
  | "not_called"
  | "cancelled"
  | "deadline_exceeded"
  | "invalid_request"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "transport_error"
  | "provider_error"
  | "malformed_response";

export type GooglePlacesUsage = Readonly<{
  clientCalls: 0 | 1;
  providerOperations: 0 | 1;
  providerCostMicros: null;
  sku: GooglePlacesSku | null;
  fieldMask: string | null;
}>;

export type GooglePlacesObservationDraft = Readonly<{
  recordType: "source_observation_draft";
  canonicalMutation: false;
  observation: ConnectorFixtureObservation;
  locator: Readonly<
    | {
      kind: "google_text_search_result";
      resultIndex: number;
      placeId: string;
      queryHash: string;
      pageTokenHash: string | null;
    }
    | { kind: "google_place_details"; placeId: string }
  >;
  retrieval: Readonly<{
    provider: "google_places";
    policyVersion: string;
    fieldMask: string;
    retrievedAt: string;
  }>;
}>;

export type GooglePlacesAdapterSuccess = Readonly<{
  ok: true;
  code: "D015_PASS";
  status: "page_complete" | "complete";
  providerStatus: "ok";
  observations: readonly GooglePlacesObservationDraft[];
  nextCursor: string | null;
  complete: boolean;
  usage: GooglePlacesUsage;
}>;

export type GooglePlacesAdapterFailure = Readonly<{
  ok: false;
  code: "D015_MALFORMED" | "D015_SOURCE_POLICY_FAIL" | "D015_CANCELLED" | "D015_PROVIDER_FAILURE";
  status: "blocked" | "cancelled" | "retryable" | "failed";
  providerStatus: Exclude<GooglePlacesProviderStatus, "ok">;
  usage: GooglePlacesUsage;
}>;

export type GooglePlacesAdapterResult = GooglePlacesAdapterSuccess | GooglePlacesAdapterFailure;

export interface GooglePlacesOnePageAdapter {
  readonly descriptor: typeof GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR;
  readonly capability: Readonly<{
    activation: "fixture_only";
    serverOnly: true;
    maximumResultsPerPage: typeof MAX_RESULTS_PER_PAGE;
    rawPersistence: "forbidden";
    reviewText: "forbidden";
    canonicalMutation: "forbidden";
  }>;
  execute(request: unknown, options?: unknown): Promise<GooglePlacesAdapterResult>;
}

type PlainRecord = Record<string, unknown>;
type ParsedConfiguration = Readonly<{
  approvedPolicyVersion: string;
  maxDeadlineMs: number;
  clock: () => number;
}>;

const BASE_REQUEST_FIELDS = [
  "version", "executionMode", "tenantId", "authorizedTenantId", "workspaceId", "runId",
  "observedAt", "deadlineAt", "policyVersion", "operation", "fields", "fieldMask",
] as const;
const SEARCH_REQUEST_FIELDS = [
  ...BASE_REQUEST_FIELDS, "query", "pageToken", "locationBias",
] as const;
const DETAILS_REQUEST_FIELDS = [...BASE_REQUEST_FIELDS, "placeId"] as const;
const SAFE_PLACE_OPTIONAL_FIELDS = [
  "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri", "googleMapsUri",
  "rating", "userRatingCount", "types", "businessStatus", "priceLevel", "regularOpeningHours",
  "photos", "primaryType", "location",
] as const;

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    if (required.some((field) => !Object.hasOwn(descriptors, field))) return null;
    const result: PlainRecord = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
    if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > maximum) return null;
    const result: unknown[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    if (Reflect.ownKeys(descriptors).some((key) => {
      if (key === "length") return false;
      if (typeof key !== "string") return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= (length as number) || String(index) !== key;
    })) return null;
    return result;
  } catch {
    return null;
  }
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    ? value
    : null;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null;
}

function parseFields(value: unknown): readonly string[] | null {
  const array = exactArray(value, GOOGLE_PLACES_FIXTURE_ADAPTER.outputFields.length);
  if (!array?.length) return null;
  const fields: string[] = [];
  for (const entry of array) {
    const field = boundedString(entry, 80);
    if (!field || fields.includes(field)) return null;
    fields.push(field);
  }
  return Object.freeze(fields);
}

function parseLocationBias(value: unknown): LocationBias | null | undefined {
  if (value === null) return null;
  const record = exactRecord(value, ["lat", "lng", "radiusMeters"]);
  if (!record || typeof record.lat !== "number" || !Number.isFinite(record.lat)
    || record.lat < -90 || record.lat > 90 || typeof record.lng !== "number"
    || !Number.isFinite(record.lng) || record.lng < -180 || record.lng > 180
    || typeof record.radiusMeters !== "number" || !Number.isFinite(record.radiusMeters)
    || record.radiusMeters < 1 || record.radiusMeters > 50_000) return undefined;
  return Object.freeze({ lat: record.lat, lng: record.lng, radiusMeters: record.radiusMeters });
}

function operationDescriptor(value: unknown): string | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "operation");
    return descriptor && "value" in descriptor && descriptor.enumerable && typeof descriptor.value === "string"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function parseRequest(value: unknown): GooglePlacesAdapterRequest | null {
  const operation = operationDescriptor(value);
  const record = operation === "search_text"
    ? exactRecord(value, SEARCH_REQUEST_FIELDS)
    : operation === "place_details"
      ? exactRecord(value, DETAILS_REQUEST_FIELDS)
      : null;
  const fields = record && parseFields(record.fields);
  const observedAt = record && canonicalTimestamp(record.observedAt);
  const deadlineAt = record && canonicalTimestamp(record.deadlineAt);
  const tenantId = record && boundedString(record.tenantId, 160);
  const authorizedTenantId = record && boundedString(record.authorizedTenantId, 160);
  const workspaceId = record && boundedString(record.workspaceId, 160);
  const runId = record && boundedString(record.runId, 160);
  const policyVersion = record && boundedString(record.policyVersion, 160);
  const fieldMask = record && boundedString(record.fieldMask, 4_096);
  if (!record || record.version !== 1 || typeof record.executionMode !== "string" || !fields
    || !observedAt || !deadlineAt || !tenantId || !authorizedTenantId || !workspaceId
    || !runId || !policyVersion || !fieldMask) return null;
  const base = {
    version: 1 as const,
    executionMode: record.executionMode as "fixture",
    tenantId,
    authorizedTenantId,
    workspaceId,
    runId,
    observedAt,
    deadlineAt,
    policyVersion,
    fields: fields as readonly GoogleOutputField[],
    fieldMask,
  };
  if (operation === "search_text") {
    const query = boundedString(record.query, MAX_QUERY_LENGTH);
    const pageToken = record.pageToken === null
      ? null
      : boundedString(record.pageToken, MAX_PAGE_TOKEN_LENGTH);
    const locationBias = parseLocationBias(record.locationBias);
    if (!query || (record.pageToken !== null && pageToken === null) || locationBias === undefined) return null;
    return Object.freeze({ ...base, operation, query, pageToken, locationBias });
  }
  const placeId = boundedString(record.placeId, 263);
  return placeId && PLACE_ID.test(placeId)
    ? Object.freeze({ ...base, operation: "place_details", placeId })
    : null;
}

function safeAbortSignal(value: unknown): AbortSignal | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value)) return null;
    if (!(value instanceof AbortSignal) || Object.getPrototypeOf(value) !== AbortSignal.prototype
      || Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).some((key) => typeof key === "string")
      || !ABORTED_GETTER) return null;
    ABORTED_GETTER.call(value);
    return value;
  } catch {
    return null;
  }
}

function parseSignal(value: unknown): AbortSignal | null | undefined {
  if (value === undefined) return undefined;
  const options = exactRecord(value, ["signal"]);
  return options ? safeAbortSignal(options.signal) : null;
}

function isAborted(signal: AbortSignal): boolean {
  try {
    return ABORTED_GETTER?.call(signal) === true;
  } catch {
    return true;
  }
}

function usage(
  clientCalls: 0 | 1,
  fieldMask: string | null,
  sku: GooglePlacesSku | null,
): GooglePlacesUsage {
  return Object.freeze({
    clientCalls,
    providerOperations: clientCalls,
    providerCostMicros: null,
    sku,
    fieldMask,
  });
}

function failed(
  status: GooglePlacesAdapterFailure["status"],
  code: GooglePlacesAdapterFailure["code"],
  providerStatus: GooglePlacesAdapterFailure["providerStatus"],
  currentUsage: GooglePlacesUsage,
): GooglePlacesAdapterFailure {
  return Object.freeze({ ok: false, code, status, providerStatus, usage: currentUsage });
}

function preflightFailure(
  request: GooglePlacesAdapterRequest | null,
  code: "D015_MALFORMED" | "D015_SOURCE_POLICY_FAIL",
): GooglePlacesAdapterFailure {
  const mask = request?.fieldMask ?? null;
  const sku = request
    ? request.operation === "search_text"
      ? inferTextSearchSkuFromFieldMask(mask as string)
      : inferPlaceDetailsSkuFromFieldMask(mask as string)
    : null;
  return failed("blocked", code, "not_called", usage(0, mask, sku));
}

function hashLocator(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function safeUrl(value: unknown): string | null {
  const input = boundedString(value, 2_048);
  if (!input) return null;
  try {
    const url = new URL(input);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizedPlaceFields(
  value: unknown,
  requestedFields: readonly GoogleOutputField[],
): Readonly<Record<string, unknown>> | null {
  const place = exactRecord(value, ["id"], SAFE_PLACE_OPTIONAL_FIELDS);
  if (!place || typeof place.id !== "string" || !PLACE_ID.test(place.id)) return null;
  const requested = new Set(requestedFields);
  const fields: Record<string, unknown> = { place_id: place.id };

  if (requested.has("business_name") && place.displayName !== undefined) {
    const displayName = exactRecord(place.displayName, ["text"], ["languageCode"]);
    const text = displayName && boundedString(displayName.text, 512);
    if (!text) return null;
    fields.business_name = text;
  }
  if (requested.has("formatted_address") && place.formattedAddress !== undefined) {
    const address = boundedString(place.formattedAddress, 1_000);
    if (!address) return null;
    fields.formatted_address = address;
  }
  if (requested.has("website") && place.websiteUri !== undefined) {
    const website = safeUrl(place.websiteUri);
    if (!website) return null;
    fields.website = website;
  }
  if (requested.has("phone") && place.nationalPhoneNumber !== undefined) {
    const phone = boundedString(place.nationalPhoneNumber, 64);
    if (!phone) return null;
    fields.phone = phone;
  }
  if (requested.has("maps_uri") && place.googleMapsUri !== undefined) {
    const mapsUri = safeUrl(place.googleMapsUri);
    if (!mapsUri) return null;
    fields.maps_uri = mapsUri;
  }
  if (requested.has("category") && place.primaryType !== undefined) {
    if (typeof place.primaryType !== "string" || !CATEGORY.test(place.primaryType)) return null;
    fields.category = place.primaryType;
  }
  if (requested.has("rating") && place.rating !== undefined) {
    if (typeof place.rating !== "number" || !Number.isFinite(place.rating)
      || place.rating < 0 || place.rating > 5) return null;
    fields.rating = place.rating;
  }
  if (requested.has("review_count") && place.userRatingCount !== undefined) {
    if (!Number.isSafeInteger(place.userRatingCount) || (place.userRatingCount as number) < 0) return null;
    fields.review_count = place.userRatingCount;
  }
  if (requested.has("operating_hours_metadata") && place.regularOpeningHours !== undefined) {
    const hours = exactRecord(place.regularOpeningHours, [], ["openNow", "periods", "weekdayDescriptions"]);
    if (!hours || (hours.openNow !== undefined && typeof hours.openNow !== "boolean")) return null;
    if (hours.openNow !== undefined) fields.operating_hours_metadata = Object.freeze({ open_now: hours.openNow });
  }
  if (requested.has("business_status") && place.businessStatus !== undefined) {
    if (typeof place.businessStatus !== "string" || !BUSINESS_STATUSES.has(place.businessStatus)) return null;
    fields.business_status = place.businessStatus;
  }
  return Object.freeze(fields);
}

function observationDraft(
  fields: Readonly<Record<string, unknown>>,
  request: GooglePlacesAdapterRequest,
  resultIndex: number,
): GooglePlacesObservationDraft {
  const placeId = fields.place_id as string;
  const locator = request.operation === "search_text"
    ? Object.freeze({
      kind: "google_text_search_result" as const,
      resultIndex,
      placeId,
      queryHash: hashLocator(request.query),
      pageTokenHash: request.pageToken ? hashLocator(request.pageToken) : null,
    })
    : Object.freeze({ kind: "google_place_details" as const, placeId });
  return Object.freeze({
    recordType: "source_observation_draft",
    canonicalMutation: false,
    observation: Object.freeze({
      sourceCardId: GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR.sourceCardId,
      operation: request.operation,
      tenantId: request.tenantId,
      runId: request.runId,
      observedAt: request.observedAt,
      fields,
    }),
    locator,
    retrieval: Object.freeze({
      provider: "google_places",
      policyVersion: request.policyVersion,
      fieldMask: request.fieldMask,
      retrievedAt: request.observedAt,
    }),
  });
}

function parseSearchResponse(
  value: unknown,
  request: GooglePlacesSearchRequest,
): Readonly<{ observations: readonly GooglePlacesObservationDraft[]; nextCursor: string | null }> | null {
  const response = exactRecord(value, ["places"], ["nextPageToken"]);
  const places = response && exactArray(response.places, MAX_RESULTS_PER_PAGE);
  if (!response || !places) return null;
  let nextCursor: string | null = null;
  if (response.nextPageToken !== undefined && response.nextPageToken !== null) {
    nextCursor = boundedString(response.nextPageToken, MAX_PAGE_TOKEN_LENGTH);
    if (!nextCursor) return null;
  }
  const observations: GooglePlacesObservationDraft[] = [];
  for (let index = 0; index < places.length; index += 1) {
    const fields = normalizedPlaceFields(places[index], request.fields);
    if (!fields) return null;
    observations.push(observationDraft(fields, request, index));
  }
  return Object.freeze({ observations: Object.freeze(observations), nextCursor });
}

function parseDetailsResponse(
  value: unknown,
  request: GooglePlacesDetailsRequest,
  expectedSku: GooglePlacesSku,
): readonly GooglePlacesObservationDraft[] | null {
  const response = exactRecord(value, ["place", "fromCache", "sku", "fieldMask"], ["reviewInsights"]);
  if (!response || response.fromCache !== false || response.sku !== expectedSku
    || response.fieldMask !== request.fieldMask || response.reviewInsights !== undefined) return null;
  if (response.place === null) return Object.freeze([]);
  const fields = normalizedPlaceFields(response.place, request.fields);
  if (!fields || fields.place_id !== request.placeId) return null;
  return Object.freeze([observationDraft(fields, request, 0)]);
}

function providerFailure(
  error: unknown,
  deadlineExpired: boolean,
  parentSignal: AbortSignal | undefined,
  currentUsage: GooglePlacesUsage,
): GooglePlacesAdapterFailure {
  if (deadlineExpired) return failed("cancelled", "D015_CANCELLED", "deadline_exceeded", currentUsage);
  if (parentSignal && isAborted(parentSignal)) {
    return failed("cancelled", "D015_CANCELLED", "cancelled", currentUsage);
  }
  if (typeof error === "object" && error !== null && isProxy(error)) {
    return failed("failed", "D015_PROVIDER_FAILURE", "provider_error", currentUsage);
  }
  if (typeof error === "object" && error !== null && !isProxy(error) && error instanceof PlacesApiError) {
    if (error.status === 401 || error.status === 403) {
      return failed("blocked", "D015_PROVIDER_FAILURE", "permission_denied", currentUsage);
    }
    if (error.status === 404) return failed("failed", "D015_PROVIDER_FAILURE", "not_found", currentUsage);
    if (error.status === 429) return failed("retryable", "D015_PROVIDER_FAILURE", "rate_limited", currentUsage);
    if (error.status >= 500) {
      return failed("retryable", "D015_PROVIDER_FAILURE", "provider_unavailable", currentUsage);
    }
    return failed("failed", "D015_PROVIDER_FAILURE", "invalid_request", currentUsage);
  }
  if (error instanceof TypeError) {
    return failed("retryable", "D015_PROVIDER_FAILURE", "transport_error", currentUsage);
  }
  return failed("failed", "D015_PROVIDER_FAILURE", "provider_error", currentUsage);
}

function configuration(
  clientValue: GooglePlacesInjectedClient,
  optionsValue: GooglePlacesOnePageAdapterOptions,
): Readonly<{
  client: Readonly<GooglePlacesInjectedClient>;
  options: ParsedConfiguration;
}> {
  const client = exactRecord(clientValue, ["textSearch", "getPlaceDetails"]);
  const options = exactRecord(optionsValue, ["activation", "approvedPolicyVersion", "maxDeadlineMs", "clock"]);
  if (!client || typeof client.textSearch !== "function" || isProxy(client.textSearch)
    || typeof client.getPlaceDetails !== "function" || isProxy(client.getPlaceDetails)
    || !options || options.activation !== "fixture_only"
    || typeof options.approvedPolicyVersion !== "string" || !TOKEN.test(options.approvedPolicyVersion)
    || !Number.isSafeInteger(options.maxDeadlineMs) || (options.maxDeadlineMs as number) < 1
    || (options.maxDeadlineMs as number) > MAX_DEADLINE_MS
    || typeof options.clock !== "function" || isProxy(options.clock)) {
    throw new TypeError("Invalid Google Places injected adapter boundary.");
  }
  return Object.freeze({
    client: Object.freeze({
      textSearch: client.textSearch as GooglePlacesInjectedClient["textSearch"],
      getPlaceDetails: client.getPlaceDetails as GooglePlacesInjectedClient["getPlaceDetails"],
    }),
    options: Object.freeze({
      approvedPolicyVersion: options.approvedPolicyVersion,
      maxDeadlineMs: options.maxDeadlineMs as number,
      clock: options.clock as () => number,
    }),
  });
}

export function createGooglePlacesOnePageAdapter(
  clientValue: GooglePlacesInjectedClient,
  optionsValue: GooglePlacesOnePageAdapterOptions,
): GooglePlacesOnePageAdapter {
  const configured = configuration(clientValue, optionsValue);
  const capability = Object.freeze({
    activation: "fixture_only" as const,
    serverOnly: true as const,
    maximumResultsPerPage: MAX_RESULTS_PER_PAGE,
    rawPersistence: "forbidden" as const,
    reviewText: "forbidden" as const,
    canonicalMutation: "forbidden" as const,
  });

  return Object.freeze({
    descriptor: GOOGLE_PLACES_ONE_PAGE_DESCRIPTOR,
    capability,
    async execute(requestValue: unknown, executeOptions?: unknown): Promise<GooglePlacesAdapterResult> {
      const request = parseRequest(requestValue);
      if (!request) return preflightFailure(null, "D015_MALFORMED");
      const signal = parseSignal(executeOptions);
      if (signal === null) return preflightFailure(request, "D015_MALFORMED");
      const requestedFields = request.fields as readonly string[];
      const approvedMask = GOOGLE_PLACES_APPROVED_FIELD_MASKS[request.operation];
      if (request.executionMode !== "fixture" || request.tenantId !== request.authorizedTenantId
        || request.policyVersion !== configured.options.approvedPolicyVersion
        || request.fieldMask !== approvedMask || !requestedFields.includes("place_id")
        || requestedFields.some((field) => !GOOGLE_PLACES_FIXTURE_ADAPTER.outputFields.includes(field as GoogleOutputField))) {
        return preflightFailure(request, "D015_SOURCE_POLICY_FAIL");
      }
      let now: number;
      try {
        now = configured.options.clock();
      } catch {
        return preflightFailure(request, "D015_MALFORMED");
      }
      const deadlineMs = Date.parse(request.deadlineAt) - now;
      if (!Number.isFinite(now) || !Number.isFinite(deadlineMs) || deadlineMs <= 0
        || deadlineMs > configured.options.maxDeadlineMs) {
        return failed("cancelled", "D015_CANCELLED", "deadline_exceeded", usage(0, request.fieldMask, null));
      }
      if (signal && isAborted(signal)) {
        return failed("cancelled", "D015_CANCELLED", "cancelled", usage(0, request.fieldMask, null));
      }

      const sku = request.operation === "search_text"
        ? inferTextSearchSkuFromFieldMask(request.fieldMask)
        : inferPlaceDetailsSkuFromFieldMask(request.fieldMask);
      const currentUsage = usage(1, request.fieldMask, sku);
      const controller = new AbortController();
      let deadlineExpired = false;
      const onParentAbort = () => controller.abort(signal?.reason);
      if (signal) signal.addEventListener("abort", onParentAbort, { once: true });
      if (signal && isAborted(signal)) onParentAbort();
      const timer = setTimeout(() => {
        deadlineExpired = true;
        controller.abort(new DOMException("Google Places adapter deadline exceeded", "TimeoutError"));
      }, deadlineMs);
      let removeAbortRace: () => void = () => undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        const onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortRace = () => controller.signal.removeEventListener("abort", onAbort);
      });

      try {
        const provider = request.operation === "search_text"
          ? configured.client.textSearch(
            request.query,
            request.pageToken ?? undefined,
            0,
            request.locationBias ?? undefined,
            { fieldMask: request.fieldMask, signal: controller.signal },
          )
          : configured.client.getPlaceDetails(request.placeId, 0, {
            includeAtmosphere: false,
            cacheTtlDays: 0,
            signal: controller.signal,
          });
        const response = await Promise.race([provider, aborted]);
        if (request.operation === "search_text") {
          const page = parseSearchResponse(response, request);
          if (!page) return failed("failed", "D015_PROVIDER_FAILURE", "malformed_response", currentUsage);
          const complete = page.nextCursor === null;
          return Object.freeze({
            ok: true,
            code: "D015_PASS",
            status: complete ? "complete" : "page_complete",
            providerStatus: "ok",
            observations: page.observations,
            nextCursor: page.nextCursor,
            complete,
            usage: currentUsage,
          });
        }
        const observations = parseDetailsResponse(response, request, sku);
        return observations
          ? Object.freeze({
            ok: true,
            code: "D015_PASS",
            status: "complete",
            providerStatus: "ok",
            observations,
            nextCursor: null,
            complete: true,
            usage: currentUsage,
          })
          : failed("failed", "D015_PROVIDER_FAILURE", "malformed_response", currentUsage);
      } catch (error) {
        return providerFailure(error, deadlineExpired, signal, currentUsage);
      } finally {
        clearTimeout(timer);
        removeAbortRace();
        if (signal) signal.removeEventListener("abort", onParentAbort);
      }
    },
  });
}
