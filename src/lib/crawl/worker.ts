import { PlacesApiError, textSearch, type LocationBias } from "@/lib/google-places";
import { classifyWebsite } from "@/lib/classify-website";
import { computeScore } from "@/lib/scoring";
import { qualifyLead } from "@/lib/qualification";
import {
  getTextSearchFieldMaskForDiscoveryMode,
  getTextSearchSkuForDiscoveryMode,
  normalizeDiscoveryMode,
  normalizePaginationPolicy,
  shouldFetchNextTextSearchPage,
} from "@/lib/discovery-sizing";
import {
  getProcessingCrawlRun,
  leaseNextCrawlUnit,
  markUnitDone,
  markUnitFailed,
  markUnitRetryWait,
  incrementCrawlRunCounters,
  updateCrawlRunStatus,
  blockCrawlRun,
  getCrawlProgress,
  upsertLead,
  leadExists,
  getSettings,
  updateUnitPageToken,
  recordUnitPageFetch,
  API_ENDPOINT_TEXT_SEARCH,
  logApiUsageEvent,
  recordPlaceObservation,
  upsertPlaceMaster,
  placeMasterExists,
  createAuditLog,
} from "@/lib/db/queries";
import { enqueueAiVerificationForLead } from "@/lib/ai/verification-worker";

const SKIP_BUSINESS_STATUSES = new Set(["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]);
export interface ProcessResult {
  status: "processed" | "idle" | "paused" | "done" | "error" | "blocked" | "retry_wait";
  unitId?: string;
  zip?: string;
  category?: string;
  leadsFound?: number;
  leadsSkipped?: number;
  apiCalls?: number;
  error?: string;
  progress?: {
    total: number;
    done: number;
    failed: number;
    retryWait: number;
    pending: number;
    running: number;
    canceled: number;
  };
}

type UnitFailurePolicy =
  | { type: "block_run"; code: string; reason: string }
  | { type: "retry"; code: string; nextRetryAt: string }
  | { type: "fail"; code: string; clearPageToken?: boolean };

const DEFAULT_UNIT_MAX_ATTEMPTS = 3;
const TRANSIENT_RETRY_BASE_DELAY_SECONDS = 60;
const TRANSIENT_RETRY_MAX_DELAY_SECONDS = 15 * 60;

export async function processNextUnit(): Promise<ProcessResult> {
  const run = await getProcessingCrawlRun();

  if (!run) {
    return { status: "idle" };
  }

  const unit = await leaseNextCrawlUnit(run.id);

  if (!unit) {
    const progress = await getCrawlProgress(run.id);
    if (progress.pending === 0 && progress.running === 0) {
      await updateCrawlRunStatus(run.id, "done");
      return { status: "done", progress };
    }
    return { status: "idle", progress };
  }

  const settings = await getSettings();
  const selection = run.selection_json ?? {};
  const discoveryMode = normalizeDiscoveryMode(selection.discoveryMode, "lead_harvest");
  const defaultPaginationPolicy = settings.google_auto_pagination_enabled
    ? settings.google_default_pagination_policy
    : "first_page_only";
  const paginationPolicy = normalizePaginationPolicy(selection.paginationPolicy, defaultPaginationPolicy);
  const fieldMask = getTextSearchFieldMaskForDiscoveryMode(discoveryMode);
  const discoverySku = getTextSearchSkuForDiscoveryMode(discoveryMode);
  const configuredUnitMaxPages = Math.max(1, Math.min(3, Math.floor(Number(unit.max_pages) || 1)));
  const policyMaxPages = paginationPolicy === "first_page_only" ? 1 : 3;
  const unitMaxPages = Math.min(configuredUnitMaxPages, policyMaxPages);

  let leadsFound = 0;
  let leadsSkipped = 0;
  let apiCalls = 0;

  try {
    const locationLabel = unit.query_location_label ?? unit.city ?? unit.zip;
    const query = `${unit.category.replace(/_/g, " ")} near ${locationLabel}`;

    let locationBias: LocationBias | undefined;
    if (unit.lat && unit.lng) {
      locationBias = {
        lat: unit.lat,
        lng: unit.lng,
        radiusMeters: settings.search_radius_km * 1000,
      };
    }

    let pageToken: string | undefined = unit.next_page_token ?? undefined;
    let pagesFetched = Math.max(0, Math.floor(unit.pages_fetched ?? 0));

    while (pagesFetched < unitMaxPages) {
      const result = await textSearch(
        query,
        pageToken,
        settings.rate_limit_ms,
        locationBias,
        { fieldMask },
      );
      apiCalls++;

      await logApiUsageEvent({
        crawl_run_id: run.id,
        crawl_unit_id: unit.id,
        endpoint: API_ENDPOINT_TEXT_SEARCH,
        sku: discoverySku,
        field_mask: fieldMask,
        success: true,
        was_cached: false,
        billable_units: 1,
        metadata: {
          zip: unit.zip,
          marketId: unit.market_id,
          locationCellId: unit.location_cell_id,
          countryCode: unit.country_code,
          queryLocationLabel: unit.query_location_label,
          category: unit.category,
          hasPageToken: Boolean(pageToken),
          discoveryMode,
          paginationPolicy,
        },
      });

      let pageRawPlaces = 0;
      let pageNewPlaces = 0;
      let pageDuplicatePlaces = 0;

      for (const place of result.places) {
        pageRawPlaces++;
        const placeId = extractPlaceId(place.id);
        if (!placeId) continue;
        const existedInPlaces = await placeMasterExists(placeId);

        await recordPlaceObservation({
          place_id: placeId,
          crawl_run_id: run.id,
          crawl_unit_id: unit.id,
          endpoint: API_ENDPOINT_TEXT_SEARCH,
          sku: discoverySku,
          field_mask: fieldMask,
          raw_json: JSON.stringify(place),
        });

        const categories = place.types ?? [];
        const photoCount = place.photos?.length ?? 0;
        const hasOpeningHours = !!(place.regularOpeningHours?.periods?.length);
        await upsertPlaceMaster({
          place_id: placeId,
          name: place.displayName?.text ?? null,
          address: place.formattedAddress ?? null,
          phone: place.nationalPhoneNumber ?? null,
          website_uri: place.websiteUri ?? null,
          maps_uri: place.googleMapsUri ?? null,
          categories,
          rating: place.rating ?? null,
          user_rating_count: place.userRatingCount ?? null,
          business_status: place.businessStatus ?? null,
          price_level: place.priceLevel ?? null,
          photo_count: photoCount,
          has_opening_hours: hasOpeningHours,
          primary_type: place.primaryType ?? null,
          lat: place.location?.latitude ?? null,
          lng: place.location?.longitude ?? null,
        });

        if (discoveryMode === "coverage_probe") {
          if (existedInPlaces) {
            pageDuplicatePlaces++;
          } else {
            pageNewPlaces++;
          }
          continue;
        }

        if (place.businessStatus && SKIP_BUSINESS_STATUSES.has(place.businessStatus)) {
          continue;
        }

        const existed = await leadExists(placeId);
        if (existed) {
          leadsSkipped++;
          pageDuplicatePlaces++;
        } else {
          pageNewPlaces++;
        }

        const websiteStatus = classifyWebsite(
          place.websiteUri,
          settings.social_hosts.length > 0 ? settings.social_hosts : undefined,
          settings.basic_hosts.length > 0 ? settings.basic_hosts : undefined,
        );
        const qualification = qualifyLead({
          categories,
          websiteStatus,
          businessStatus: place.businessStatus,
          phone: place.nationalPhoneNumber,
          address: place.formattedAddress,
          mapsUri: place.googleMapsUri,
        });

        const score = computeScore(
          {
            reviewCount: place.userRatingCount,
            rating: place.rating,
            categories,
            websiteStatus,
            photoCount,
            hasOpeningHours,
            businessStatus: place.businessStatus,
            contactabilityScore: qualification.contactabilityScore,
            estimatedDealValue: qualification.estimatedDealValue,
          },
          Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined,
        );

        const leadId = await upsertLead({
          place_id: placeId,
          name: place.displayName?.text ?? null,
          address: place.formattedAddress ?? null,
          phone: place.nationalPhoneNumber ?? null,
          categories,
          rating: place.rating ?? null,
          review_count: place.userRatingCount ?? null,
          website_uri: place.websiteUri ?? null,
          website_status: websiteStatus,
          maps_uri: place.googleMapsUri ?? null,
          business_status: place.businessStatus ?? null,
          price_level: place.priceLevel ?? null,
          photo_count: photoCount,
          has_opening_hours: hasOpeningHours,
          primary_type: place.primaryType ?? null,
          lat: place.location?.latitude ?? null,
          lng: place.location?.longitude ?? null,
          score,
          market_id: unit.market_id,
          location_cell_id: unit.location_cell_id,
          country_code: unit.country_code,
          admin_area1: deriveAdminArea1(unit.query_location_label),
          admin_area2: unit.county,
          locality: unit.city,
          postal_code: unit.zip,
        });
        if (settings.ai_enabled && settings.ai_auto_verify_enabled && settings.ai_verify_after_discovery) {
          try {
            await enqueueAiVerificationForLead(leadId, "places_discovery", { settings });
          } catch (error) {
            await createAuditLog("ai_verification_enqueue_failed", "lead", leadId, {
              reason: "places_discovery",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (!existed) leadsFound++;
      }

      pagesFetched++;
      const shouldContinue = shouldFetchNextTextSearchPage({
        policy: paginationPolicy,
        pagesFetched,
        maxPages: unitMaxPages,
        nextPageToken: result.nextPageToken,
        rawPlaces: pageRawPlaces,
        newPlaces: pageNewPlaces,
        duplicatePlaces: pageDuplicatePlaces,
        minNewCandidates: settings.google_auto_pagination_min_new_candidates,
        maxDuplicateRate: settings.google_auto_pagination_max_duplicate_rate,
      });
      pageToken = shouldContinue ? result.nextPageToken : undefined;
      await recordUnitPageFetch(unit.id, pageToken ?? null, pageRawPlaces, pageNewPlaces, pageDuplicatePlaces);
      if (!pageToken) break;
    }

    await markUnitDone(unit.id, leadsFound);
    await incrementCrawlRunCounters(run.id, leadsFound, 0, apiCalls);

    const progress = await getCrawlProgress(run.id);

    return {
      status: "processed",
      unitId: unit.id,
      zip: unit.zip,
      category: unit.category,
      leadsFound,
      leadsSkipped,
      apiCalls,
      progress,
    };
  } catch (err) {
    const googleError = err instanceof PlacesApiError ? err : null;
    const rawErrorMessage = err instanceof Error ? err.message : String(err);
    const errorMessage = googleError ? formatPlacesApiErrorForOperator(googleError) : rawErrorMessage;
    const failurePolicy = classifyUnitFailure(err, unit.attempt_count, unit.max_attempts);
    if (googleError || isLikelyBillableGoogleAttemptError(rawErrorMessage)) {
      try {
        await logApiUsageEvent({
          crawl_run_id: run.id,
          crawl_unit_id: unit.id,
          endpoint: API_ENDPOINT_TEXT_SEARCH,
          sku: discoverySku,
          field_mask: fieldMask,
          success: false,
          was_cached: false,
          billable_units: 1,
          metadata: {
            zip: unit.zip,
            marketId: unit.market_id,
            locationCellId: unit.location_cell_id,
            countryCode: unit.country_code,
            category: unit.category,
            discoveryMode,
            paginationPolicy,
            failedAttempt: true,
            error: rawErrorMessage.slice(0, 500),
            googleStatus: googleError?.status,
            googleErrorBody: googleError?.body?.slice(0, 1000),
          },
        });
      } catch {
        // Preserve the original worker error path.
      }
      apiCalls++;
    }
    await incrementCrawlRunCounters(run.id, 0, 1, apiCalls);

    if (failurePolicy.type === "block_run") {
      await markUnitFailed(unit.id, errorMessage, failurePolicy.code);
      await blockCrawlRun(run.id, failurePolicy.reason, failurePolicy.code);
      await createAuditLog("crawl_run_blocked", "crawl_run", run.id, {
        unitId: unit.id,
        category: unit.category,
        zip: unit.zip,
        errorCode: failurePolicy.code,
        reason: failurePolicy.reason,
      });
      return {
        status: "blocked",
        unitId: unit.id,
        zip: unit.zip,
        category: unit.category,
        error: failurePolicy.reason,
        leadsFound,
        apiCalls,
        progress: await getCrawlProgress(run.id),
      };
    }

    if (failurePolicy.type === "retry") {
      await markUnitRetryWait(unit.id, errorMessage, failurePolicy.nextRetryAt, failurePolicy.code);
      return {
        status: "retry_wait",
        unitId: unit.id,
        zip: unit.zip,
        category: unit.category,
        error: errorMessage,
        leadsFound,
        apiCalls,
        progress: await getCrawlProgress(run.id),
      };
    }

    if (failurePolicy.clearPageToken) {
      await updateUnitPageToken(unit.id, null);
    }
    await markUnitFailed(unit.id, errorMessage, failurePolicy.code);

    return {
      status: "error",
      unitId: unit.id,
      zip: unit.zip,
      category: unit.category,
      error: errorMessage,
      leadsFound,
      apiCalls,
      progress: await getCrawlProgress(run.id),
    };
  }
}

function classifyUnitFailure(error: unknown, attemptCount: number, maxAttempts: number | null | undefined): UnitFailurePolicy {
  const attemptsUsed = Math.max(1, Math.floor(Number(attemptCount) || 1));
  const maxAllowedAttempts = Math.max(1, Math.floor(Number(maxAttempts) || DEFAULT_UNIT_MAX_ATTEMPTS));
  if (error instanceof PlacesApiError) {
    const googleStatus = extractGoogleStatus(error);
    if (error.status === 403 && googleStatus === "PERMISSION_DENIED") {
      return {
        type: "block_run",
        code: "google_permission_denied",
        reason: "Google Places permission denied. Check the production Google Places API key, billing, API restrictions, and Places API entitlement before retrying.",
      };
    }
    if (error.status === 429 || error.status >= 500) {
      return attemptsUsed >= maxAllowedAttempts
        ? { type: "fail", code: error.status === 429 ? "google_rate_limited_exhausted" : "google_transient_exhausted" }
        : { type: "retry", code: error.status === 429 ? "google_rate_limited" : "google_transient_error", nextRetryAt: nextRetryAtForAttempt(attemptsUsed) };
    }
    if (error.status === 400 && googleStatus === "INVALID_ARGUMENT" && /page|paging|pageToken/i.test(error.body)) {
      return { type: "fail", code: "google_invalid_page_token", clearPageToken: true };
    }
    return { type: "fail", code: `google_${error.status}` };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (isTransientNetworkError(message)) {
    return attemptsUsed >= maxAllowedAttempts
      ? { type: "fail", code: "network_transient_exhausted" }
      : { type: "retry", code: "network_transient", nextRetryAt: nextRetryAtForAttempt(attemptsUsed) };
  }

  return attemptsUsed >= maxAllowedAttempts
    ? { type: "fail", code: "generic_error_exhausted" }
    : { type: "retry", code: "generic_error", nextRetryAt: nextRetryAtForAttempt(attemptsUsed) };
}

function extractGoogleStatus(error: PlacesApiError): string | null {
  try {
    const parsed = JSON.parse(error.body) as { error?: { status?: unknown } };
    return typeof parsed.error?.status === "string" ? parsed.error.status : null;
  } catch {
    return null;
  }
}

function nextRetryAtForAttempt(attemptCount: number): string {
  const exponent = Math.max(0, Math.floor(attemptCount) - 1);
  const delaySeconds = Math.min(
    TRANSIENT_RETRY_MAX_DELAY_SECONDS,
    TRANSIENT_RETRY_BASE_DELAY_SECONDS * Math.pow(2, exponent),
  );
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function isTransientNetworkError(message: string): boolean {
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message);
}

function extractPlaceId(raw: string): string | null {
  if (!raw) return null;
  return raw.startsWith("places/") ? raw.slice(7) : raw;
}

function deriveAdminArea1(queryLocationLabel: string | null | undefined): string | null {
  if (!queryLocationLabel) return null;
  const parts = queryLocationLabel.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 2] ?? "";
  const token = candidate.split(/\s+/)[0] ?? "";
  return token.length > 0 ? token : null;
}

function isLikelyBillableGoogleAttemptError(message: string): boolean {
  return message.startsWith("Places API error") || message.startsWith("HTTP 429") || message.startsWith("HTTP 5");
}

function formatPlacesApiErrorForOperator(error: PlacesApiError): string {
  return `Google Places request failed with status ${error.status}.`;
}
