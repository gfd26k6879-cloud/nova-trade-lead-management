import { textSearch, type LocationBias, TEXT_SEARCH_FIELD_MASK } from "@/lib/google-places";
import { classifyWebsite } from "@/lib/classify-website";
import { computeScore } from "@/lib/scoring";
import { qualifyLead } from "@/lib/qualification";
import {
  getActiveCrawlRun,
  getNextPendingUnit,
  markUnitRunning,
  markUnitDone,
  markUnitFailed,
  incrementCrawlRunCounters,
  updateCrawlRunStatus,
  getCrawlProgress,
  upsertLead,
  leadExists,
  getSettings,
  getTodayApiCalls,
  getRunApiCalls,
  getMonthlyFreeTierStatus,
  getMonthlyApiCost,
  isMonthlySpendLimitReached,
  setRunLastError,
  createAuditLog,
  updateUnitPageToken,
  API_ENDPOINT_TEXT_SEARCH,
  logApiUsageEvent,
  recordPlaceObservation,
  upsertPlaceMaster,
} from "@/lib/db/queries";
import { enqueueAiVerificationForLead } from "@/lib/ai/verification-worker";
import type { GooglePlacesSku } from "@/lib/google-pricing";

const SKIP_BUSINESS_STATUSES = new Set(["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]);
const DISCOVERY_SKU: GooglePlacesSku = "places_text_search_enterprise";

export interface ProcessResult {
  status: "processed" | "idle" | "paused" | "done" | "error" | "budget_limit";
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
    pending: number;
    running: number;
  };
}

export async function processNextUnit(): Promise<ProcessResult> {
  const run = await getActiveCrawlRun();

  if (!run) {
    return { status: "idle" };
  }

  if (run.status === "paused") {
    return { status: "paused" };
  }

  const unit = await getNextPendingUnit(run.id);

  if (!unit) {
    const progress = await getCrawlProgress(run.id);
    if (progress.pending === 0 && progress.running === 0) {
      await updateCrawlRunStatus(run.id, "done");
      return { status: "done", progress };
    }
    return { status: "idle", progress };
  }

  const settings = await getSettings();

  if (settings.stop_on_budget_limit) {
    const budget = await getDiscoveryBudgetLimit(run.id, settings);
    if (budget) return budget;
  }

  await markUnitRunning(unit.id);

  let leadsFound = 0;
  let leadsSkipped = 0;
  let apiCalls = 0;

  try {
    const city = unit.city ?? unit.zip;
    const query = `${unit.category.replace(/_/g, " ")} near ${city}, CO ${unit.zip}`;

    let locationBias: LocationBias | undefined;
    if (unit.lat && unit.lng) {
      locationBias = {
        lat: unit.lat,
        lng: unit.lng,
        radiusMeters: settings.search_radius_km * 1000,
      };
    }

    let pageToken: string | undefined = unit.next_page_token ?? undefined;

    do {
      if (settings.stop_on_budget_limit) {
        const budget = await getDiscoveryBudgetLimit(run.id, settings);
        if (budget) {
          return {
            ...budget,
            unitId: unit.id,
            zip: unit.zip,
            category: unit.category,
            leadsFound,
            leadsSkipped,
            apiCalls,
            progress: await getCrawlProgress(run.id),
          };
        }
      }

      const result = await textSearch(
        query,
        pageToken,
        settings.rate_limit_ms,
        locationBias,
      );
      apiCalls++;

      await logApiUsageEvent({
        crawl_run_id: run.id,
        crawl_unit_id: unit.id,
        endpoint: API_ENDPOINT_TEXT_SEARCH,
        sku: DISCOVERY_SKU,
        field_mask: TEXT_SEARCH_FIELD_MASK,
        success: true,
        was_cached: false,
        billable_units: 1,
        metadata: {
          zip: unit.zip,
          category: unit.category,
          hasPageToken: Boolean(pageToken),
        },
      });

      for (const place of result.places) {
        const placeId = extractPlaceId(place.id);
        if (!placeId) continue;

        await recordPlaceObservation({
          place_id: placeId,
          crawl_run_id: run.id,
          crawl_unit_id: unit.id,
          endpoint: API_ENDPOINT_TEXT_SEARCH,
          sku: "places_text_search_enterprise",
          field_mask: TEXT_SEARCH_FIELD_MASK,
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

        if (place.businessStatus && SKIP_BUSINESS_STATUSES.has(place.businessStatus)) {
          continue;
        }

        const existed = await leadExists(placeId);
        if (existed) {
          leadsSkipped++;
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

      pageToken = result.nextPageToken;
      await updateUnitPageToken(unit.id, pageToken ?? null);
    } while (pageToken);

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
    const errorMessage = err instanceof Error ? err.message : String(err);
    await markUnitFailed(unit.id, errorMessage);
    await incrementCrawlRunCounters(run.id, 0, 1, apiCalls);

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

function extractPlaceId(raw: string): string | null {
  if (!raw) return null;
  return raw.startsWith("places/") ? raw.slice(7) : raw;
}

async function getDiscoveryBudgetLimit(
  runId: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<ProcessResult | null> {
  const runCalls = await getRunApiCalls(runId);
  if (runCalls >= settings.max_calls_per_run) {
    await pauseRunForBudgetLimit(runId, `Budget limit: max calls per run (${settings.max_calls_per_run}) reached`, {
      reason: "max_calls_per_run",
      limit: settings.max_calls_per_run,
      currentCalls: runCalls,
    });
    return { status: "budget_limit", error: `Run paused: max calls per run (${settings.max_calls_per_run}) reached` };
  }

  const todayCalls = await getTodayApiCalls();
  if (todayCalls >= settings.max_calls_per_day) {
    await pauseRunForBudgetLimit(runId, `Budget limit: max calls per day (${settings.max_calls_per_day}) reached`, {
      reason: "max_calls_per_day",
      limit: settings.max_calls_per_day,
      currentCalls: todayCalls,
    });
    return { status: "budget_limit", error: `Run paused: max calls per day (${settings.max_calls_per_day}) reached` };
  }

  const freeTier = await getMonthlyFreeTierStatus(DISCOVERY_SKU, 1);
  if (freeTier.wouldExceed) {
    const message = `Google free-tier cap reached for Text Search (${freeTier.current}/${freeTier.freeCap} monthly calls).`;
    await pauseRunForBudgetLimit(runId, message, {
      reason: "monthly_text_search_free_cap",
      sku: DISCOVERY_SKU,
      currentCalls: freeTier.current,
      freeCap: freeTier.freeCap,
    });
    return { status: "budget_limit", error: `Run paused: ${message}` };
  }

  if (settings.cost_engine_v2_enabled && await isMonthlySpendLimitReached(settings.max_monthly_api_spend)) {
    const current = await getMonthlyApiCost();
    await pauseRunForBudgetLimit(
      runId,
      `Budget limit: max monthly spend ($${settings.max_monthly_api_spend.toFixed(2)}) reached`,
      {
        reason: "max_monthly_api_spend",
        limit: settings.max_monthly_api_spend,
        currentCost: current,
      },
    );
    return {
      status: "budget_limit",
      error: `Run paused: monthly API spend reached ($${current.toFixed(2)} / $${settings.max_monthly_api_spend.toFixed(2)})`,
    };
  }

  return null;
}

async function pauseRunForBudgetLimit(
  runId: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await updateCrawlRunStatus(runId, "paused");
  await setRunLastError(runId, message);
  await createAuditLog("crawl_budget_limit", "crawl_run", runId, metadata);
}
