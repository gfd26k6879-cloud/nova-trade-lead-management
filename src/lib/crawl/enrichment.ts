import { PlacesApiError, getPlaceDetails, sanitizePlaceDetailsForStorage } from "@/lib/google-places";
import { computeScore } from "@/lib/scoring";
import { classifyWebsite } from "@/lib/classify-website";
import { checkWebsiteHealth } from "@/lib/website-health";
import { qualifyLead } from "@/lib/qualification";
import {
  getActiveCrawlRun,
  getLatestCrawlRun,
  getUnenrichedLeads,
  leaseNextLeadForEnrichment,
  markLeadEnrichmentFailed,
  updateLeadEnrichment,
  getSettings,
  API_ENDPOINT_PLACE_DETAILS,
  logApiUsageEvent,
  recordPlaceObservation,
  upsertPlaceMaster,
  createAuditLog,
  type Lead,
} from "@/lib/db/queries";
import { enqueueAiVerificationForLead } from "@/lib/ai/verification-worker";
import { runAiPostSuccessBookkeeping } from "@/lib/ai/post-success-bookkeeping";
import type { WebsiteStatus } from "@/lib/classify-website";
import { throwIfWorkerAborted } from "@/lib/worker-abort";

export interface EnrichResult {
  status: "enriched" | "idle" | "error";
  leadId?: string;
  leadName?: string;
  error?: string;
  remaining?: number;
}

export async function enrichNextLead(signal?: AbortSignal): Promise<EnrichResult> {
  throwIfWorkerAborted(signal);
  const settings = await getSettings();
  throwIfWorkerAborted(signal);
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  throwIfWorkerAborted(signal);
  const runId = run?.id ?? null;

  if (!settings.enrichment_enabled) {
    return { status: "idle" };
  }

  const lead = await leaseNextLeadForEnrichment();
  throwIfWorkerAborted(signal);
  if (!lead) {
    return { status: "idle" };
  }
  const includeAtmosphere = lead.score >= settings.enrichment_stage_b_min_score;

  try {
    const detailsResult = await getPlaceDetails(lead.place_id, settings.rate_limit_ms, {
      includeAtmosphere,
      cacheTtlDays: settings.cache_ttl_days,
      signal,
    });
    throwIfWorkerAborted(signal);
    const details = detailsResult.place;

    if (!detailsResult.fromCache) {
      await logApiUsageEvent({
        crawl_run_id: runId,
        lead_id: lead.id,
        endpoint: API_ENDPOINT_PLACE_DETAILS,
        sku: detailsResult.sku,
        field_mask: detailsResult.fieldMask,
        success: true,
        was_cached: false,
        billable_units: 1,
        metadata: {
          includeAtmosphere,
          leadScore: lead.score,
        },
      });
      throwIfWorkerAborted(signal);
    }

    throwIfWorkerAborted(signal);
    await recordPlaceObservation({
      place_id: lead.place_id,
      crawl_run_id: runId,
      lead_id: lead.id,
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: detailsResult.sku,
      field_mask: detailsResult.fieldMask,
      raw_json: JSON.stringify(sanitizePlaceDetailsForStorage(details, {
        includeAtmosphere,
        reviewInsights: detailsResult.reviewInsights,
      }) ?? {}),
    });
    throwIfWorkerAborted(signal);

    const reviewHighlights = detailsResult.reviewInsights?.keywords;
    let editorialSummary: string | null = null;

    if (details?.editorialSummary?.text) {
      editorialSummary = details.editorialSummary.text;
    }

    let websiteHealthData: Record<string, unknown> | null = null;
    if (settings.website_health_enabled && lead.website_uri) {
      try {
        const health = await checkWebsiteHealth(lead.website_uri, 5000, { signal });
        throwIfWorkerAborted(signal);
        websiteHealthData = health as unknown as Record<string, unknown>;
      } catch {
        throwIfWorkerAborted(signal);
        // Health check failure is non-critical
      }
    }

    const categories = details?.types ?? lead.categories;
    const websiteUri = details?.websiteUri ?? lead.website_uri;
    const identityChanged = details ? hasMaterialIdentityChange(lead, {
      name: details.displayName?.text ?? null,
      address: details.formattedAddress ?? null,
      phone: details.nationalPhoneNumber ?? null,
      categories,
      websiteUri,
      mapsUri: details.googleMapsUri ?? null,
      businessStatus: details.businessStatus ?? null,
    }) : false;
    const websiteStatus = classifyWebsite(
      websiteUri,
      settings.social_hosts.length > 0 ? settings.social_hosts : undefined,
      settings.basic_hosts.length > 0 ? settings.basic_hosts : undefined,
    ) as WebsiteStatus;
    const qualification = qualifyLead({
      categories,
      websiteStatus,
      businessStatus: details?.businessStatus ?? lead.business_status,
      phone: details?.nationalPhoneNumber ?? lead.phone,
      address: details?.formattedAddress ?? lead.address,
      mapsUri: details?.googleMapsUri ?? lead.maps_uri,
      score: lead.score,
    });
    const newScore = computeScore(
      {
        reviewCount: details?.userRatingCount ?? lead.review_count,
        rating: details?.rating ?? lead.rating,
        categories,
        websiteStatus,
        photoCount: details?.photos?.length ?? lead.photo_count,
        hasOpeningHours: !!(details?.regularOpeningHours?.periods?.length ?? lead.has_opening_hours),
        businessStatus: details?.businessStatus ?? lead.business_status,
        websiteHealth: websiteHealthData as Record<string, unknown> | null,
        contactabilityScore: qualification.contactabilityScore,
        estimatedDealValue: qualification.estimatedDealValue,
      },
      Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined,
    );

    throwIfWorkerAborted(signal);
    await updateLeadEnrichment(lead.id, {
      name: details?.displayName?.text ?? null,
      address: details?.formattedAddress ?? null,
      phone: details?.nationalPhoneNumber ?? null,
      categories,
      rating: details?.rating ?? null,
      review_count: details?.userRatingCount ?? null,
      website_uri: websiteUri ?? null,
      website_status: websiteStatus,
      maps_uri: details?.googleMapsUri ?? null,
      business_status: details?.businessStatus ?? null,
      price_level: details?.priceLevel ?? null,
      photo_count: details?.photos?.length ?? lead.photo_count,
      has_opening_hours: !!(details?.regularOpeningHours?.periods?.length ?? lead.has_opening_hours),
      primary_type: details?.primaryType ?? null,
      lat: details?.location?.latitude ?? null,
      lng: details?.location?.longitude ?? null,
      ...(reviewHighlights !== undefined ? { review_highlights: reviewHighlights } : {}),
      editorial_summary: editorialSummary,
      website_health: websiteHealthData,
      website_checked_at: websiteHealthData ? new Date().toISOString() : null,
      score: newScore,
    });
    throwIfWorkerAborted(signal);

    throwIfWorkerAborted(signal);
    await upsertPlaceMaster({
      place_id: lead.place_id,
      name: details?.displayName?.text ?? lead.name,
      address: details?.formattedAddress ?? lead.address,
      phone: details?.nationalPhoneNumber ?? lead.phone,
      website_uri: details?.websiteUri ?? lead.website_uri,
      maps_uri: details?.googleMapsUri ?? lead.maps_uri,
      categories: details?.types ?? lead.categories,
      rating: details?.rating ?? lead.rating,
      user_rating_count: details?.userRatingCount ?? lead.review_count,
      business_status: details?.businessStatus ?? lead.business_status,
      price_level: details?.priceLevel ?? lead.price_level,
      photo_count: details?.photos?.length ?? lead.photo_count,
      has_opening_hours: !!(details?.regularOpeningHours?.periods?.length ?? lead.has_opening_hours),
      primary_type: details?.primaryType ?? lead.primary_type,
      lat: details?.location?.latitude ?? lead.lat,
      lng: details?.location?.longitude ?? lead.lng,
      editorial_summary: editorialSummary,
      ...(reviewHighlights !== undefined ? { review_highlights: reviewHighlights } : {}),
      website_health: websiteHealthData,
      last_details_at: new Date().toISOString(),
      last_enriched_at: new Date().toISOString(),
    });
    throwIfWorkerAborted(signal);

    if (identityChanged && settings.ai_enabled && settings.ai_auto_verify_enabled && settings.ai_reverify_after_enrichment) {
      try {
        await enqueueAiVerificationForLead(lead.id, "place_details_enrichment", { settings });
        throwIfWorkerAborted(signal);
      } catch (error) {
        throwIfWorkerAborted(signal);
        await runAiPostSuccessBookkeeping(
          { operation: "queue_failure_audit", leadId: lead.id },
          () => createAuditLog("ai_verification_enqueue_failed", "lead", lead.id, {
            reason: "place_details_enrichment",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        throwIfWorkerAborted(signal);
      }
    }

    const remaining = (await getUnenrichedLeads(1)).length;
    throwIfWorkerAborted(signal);

    return {
      status: "enriched",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown",
      remaining,
    };
  } catch (err) {
    throwIfWorkerAborted(signal);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failurePolicy = classifyEnrichmentFailure(err, lead.enrichment_attempt_count, lead.enrichment_max_attempts);
    await markLeadEnrichmentFailed(lead.id, errorMessage, failurePolicy.code, {
      nextRetryAt: failurePolicy.nextRetryAt,
      terminal: failurePolicy.terminal,
    });
    throwIfWorkerAborted(signal);
    await createAuditLog("enrichment_error", "lead", lead.id, { error: errorMessage });
    throwIfWorkerAborted(signal);
    return {
      status: "error",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown",
      error: errorMessage,
    };
  }
}

type EnrichmentFailurePolicy = {
  code: string;
  terminal: boolean;
  nextRetryAt?: string;
};

const ENRICHMENT_RETRY_BASE_DELAY_SECONDS = 60;
const ENRICHMENT_RETRY_MAX_DELAY_SECONDS = 15 * 60;

function classifyEnrichmentFailure(error: unknown, attemptCount: number, maxAttempts: number): EnrichmentFailurePolicy {
  const attempts = Math.max(1, Math.floor(Number(attemptCount) || 1));
  const max = Math.max(1, Math.floor(Number(maxAttempts) || 3));

  const retry = (code: string): EnrichmentFailurePolicy => {
    if (attempts >= max) return { code: `${code}_exhausted`, terminal: true };
    return { code, terminal: false, nextRetryAt: nextEnrichmentRetryAt(attempts) };
  };

  if (error instanceof PlacesApiError) {
    if (error.status === 429 || error.status >= 500) return retry(`google_${error.status}`);
    return { code: `google_${error.status}`, terminal: true };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/api key is not configured|permission|forbidden|unauthorized|invalid api key/i.test(message)) {
    return { code: "google_places_configuration", terminal: true };
  }
  if (isTransientEnrichmentError(message)) return retry("network_transient");
  return retry("generic_error");
}

function nextEnrichmentRetryAt(attemptCount: number): string {
  const exponent = Math.max(0, Math.floor(attemptCount) - 1);
  const delaySeconds = Math.min(
    ENRICHMENT_RETRY_MAX_DELAY_SECONDS,
    ENRICHMENT_RETRY_BASE_DELAY_SECONDS * Math.pow(2, exponent),
  );
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function isTransientEnrichmentError(message: string): boolean {
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket/i.test(message);
}

function hasMaterialIdentityChange(
  lead: Lead,
  next: {
    name: string | null;
    address: string | null;
    phone: string | null;
    categories: string[];
    websiteUri: string | null;
    mapsUri: string | null;
    businessStatus: string | null;
  },
): boolean {
  return normalized(next.name) !== normalized(lead.name) ||
    normalized(next.address) !== normalized(lead.address) ||
    normalizedPhone(next.phone) !== normalizedPhone(lead.phone) ||
    normalized(next.websiteUri) !== normalized(lead.website_uri) ||
    normalized(next.mapsUri) !== normalized(lead.maps_uri) ||
    normalized(next.businessStatus) !== normalized(lead.business_status) ||
    normalizedCategories(next.categories) !== normalizedCategories(lead.categories);
}

function normalized(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizedPhone(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizedCategories(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort().join("|");
}
