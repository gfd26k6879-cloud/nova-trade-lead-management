import { getPlaceDetails } from "@/lib/google-places";
import { computeScore } from "@/lib/scoring";
import { classifyWebsite } from "@/lib/classify-website";
import { extractReviewInsights } from "@/lib/review-intelligence";
import { checkWebsiteHealth } from "@/lib/website-health";
import { qualifyLead } from "@/lib/qualification";
import {
  getActiveCrawlRun,
  getLatestCrawlRun,
  getUnenrichedLeads,
  updateLeadEnrichment,
  getSettings,
  getRunEnrichmentCalls,
  getRunAtmosphereEnrichmentCalls,
  getMonthlyApiCost,
  isMonthlySpendLimitReached,
  API_ENDPOINT_PLACE_DETAILS,
  logApiUsageEvent,
  recordPlaceObservation,
  upsertPlaceMaster,
  createAuditLog,
} from "@/lib/db/queries";
import type { WebsiteStatus } from "@/lib/classify-website";

export interface EnrichResult {
  status: "enriched" | "idle" | "error" | "budget_limit";
  leadId?: string;
  leadName?: string;
  error?: string;
  remaining?: number;
}

export async function enrichNextLead(): Promise<EnrichResult> {
  const settings = await getSettings();
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  const runId = run?.id ?? null;

  if (!settings.enrichment_enabled) {
    return { status: "idle" };
  }

  if (settings.stop_on_budget_limit && settings.cost_engine_v2_enabled) {
    if (await isMonthlySpendLimitReached(settings.max_monthly_api_spend)) {
      const current = await getMonthlyApiCost();
      return {
        status: "budget_limit",
        error: `Monthly API spend reached ($${current.toFixed(2)} / $${settings.max_monthly_api_spend.toFixed(2)})`,
      };
    }
  }

  if (runId && settings.max_enrichment_per_run > 0) {
    const enrichmentCalls = await getRunEnrichmentCalls(runId);
    if (enrichmentCalls >= settings.max_enrichment_per_run) {
      return {
        status: "budget_limit",
        error: `Run enrichment limit reached (${settings.max_enrichment_per_run})`,
      };
    }
  }

  const leads = await getUnenrichedLeads(1);
  if (leads.length === 0) {
    return { status: "idle" };
  }

  const lead = leads[0];
  let includeAtmosphere = lead.score >= settings.enrichment_stage_b_min_score;
  if (includeAtmosphere && runId && settings.max_atmosphere_enrichment_per_run > 0) {
    const atmosphereCalls = await getRunAtmosphereEnrichmentCalls(runId);
    if (atmosphereCalls >= settings.max_atmosphere_enrichment_per_run) {
      includeAtmosphere = false;
    }
  }

  try {
    const detailsResult = await getPlaceDetails(lead.place_id, settings.rate_limit_ms, {
      includeAtmosphere,
      cacheTtlDays: settings.cache_ttl_days,
    });
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
    }

    await recordPlaceObservation({
      place_id: lead.place_id,
      crawl_run_id: runId,
      lead_id: lead.id,
      endpoint: API_ENDPOINT_PLACE_DETAILS,
      sku: detailsResult.sku,
      field_mask: detailsResult.fieldMask,
      raw_json: JSON.stringify(details ?? {}),
    });

    let reviewHighlights: string[] = [];
    let editorialSummary: string | null = null;

    if (details?.reviews && details.reviews.length > 0) {
      const insights = extractReviewInsights(details.reviews);
      reviewHighlights = insights.keywords;
    }

    if (details?.editorialSummary?.text) {
      editorialSummary = details.editorialSummary.text;
    }

    let websiteHealthData: Record<string, unknown> | null = null;
    if (settings.website_health_enabled && lead.website_uri) {
      try {
        const health = await checkWebsiteHealth(lead.website_uri);
        websiteHealthData = health as unknown as Record<string, unknown>;
      } catch {
        // Health check failure is non-critical
      }
    }

    const categories = details?.types ?? lead.categories;
    const websiteUri = details?.websiteUri ?? lead.website_uri;
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
      review_highlights: reviewHighlights,
      editorial_summary: editorialSummary,
      website_health: websiteHealthData,
      website_checked_at: websiteHealthData ? new Date().toISOString() : null,
      score: newScore,
    });

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
      review_highlights: reviewHighlights,
      website_health: websiteHealthData,
      last_details_at: new Date().toISOString(),
      last_enriched_at: new Date().toISOString(),
    });

    const remaining = (await getUnenrichedLeads(1)).length;

    return {
      status: "enriched",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown",
      remaining,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await createAuditLog("enrichment_error", "lead", lead.id, { error: errorMessage });
    return {
      status: "error",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown",
      error: errorMessage,
    };
  }
}
