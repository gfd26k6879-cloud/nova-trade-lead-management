"use server";

import { z } from "zod";
import {
  ensureDbReady,
  createCrawlRun,
  createCrawlUnits,
  createCrawlUnitsForSelection,
  updateCrawlRunStatus,
  cancelCrawlRun,
  retryFailedUnits as retryFailed,
  getDashboardStats,
  getActiveCrawlRun,
  getLatestCrawlRun,
  getCrawlProgress,
  getZipCodeCount,
  getTodayFocusCount,
  getNeedsFollowUpCount,
  getConversionMetrics,
  getQualifiedLeadCount,
  createAuditLog,
  getRunApiUsageSummary,
  getMonthlyApiUsageSummary,
  getRunLastError,
  getFailedUnitErrors,
  getStatesWithCounts,
  getCountiesByState,
  getZipCodesByCounty,
  getZipCoverageStatus,
  getSchedulerHealth,
} from "@/lib/db/queries";
import { requirePermission } from "@/lib/auth";

const startPlannerSchema = z.object({
  state: z.string().trim().min(2).max(2).transform((value) => value.toUpperCase()),
  counties: z.array(z.string().trim().min(1)).default([]),
  zipCodes: z.array(z.string().trim().regex(/^\d{5}$/)).min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
});

const plannerStateSchema = z.string().trim().min(2).max(2).transform((value) => value.toUpperCase());
const plannerCountySchema = z.string().trim().min(1);

function normalizeDistinct(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

type StartCrawlPayload = string[] | z.infer<typeof startPlannerSchema>;

export async function startCrawlRunAction(payload: StartCrawlPayload) {
  await requirePermission("crawl:manage");
  await ensureDbReady();

  const existing = await getActiveCrawlRun();
  if (existing) {
    return { error: "A crawl run is already active. Pause or complete it first." };
  }

  const legacyCategories = Array.isArray(payload) ? normalizeDistinct(payload) : [];
  let plannerSelection: z.infer<typeof startPlannerSchema> | null = null;

  if (!Array.isArray(payload)) {
    const parsedPlanner = startPlannerSchema.safeParse(payload);
    if (!parsedPlanner.success) {
      return { error: "Invalid run selection. Please choose state, county, zip codes, and categories again." };
    }
    plannerSelection = parsedPlanner.data;
  }

  if (!Array.isArray(payload) && !plannerSelection) {
    return { error: "Invalid run selection. Please choose state, county, zip codes, and categories again." };
  }

  let categories: string[];
  if (Array.isArray(payload)) {
    categories = legacyCategories;
  } else {
    categories = normalizeDistinct(plannerSelection!.categories);
  }

  if (categories.length === 0) {
    return { error: "Select at least one category." };
  }

  let selectedState: string | null = null;
  let selectedCountyCount = 0;
  let selectedZipCount = 0;
  let unitCount = 0;

  const run = await createCrawlRun(categories);

  if (Array.isArray(payload)) {
    const zipCount = await getZipCodeCount();
    if (zipCount === 0) {
      await updateCrawlRunStatus(run.id, "error");
      return { error: "No active zip codes found. Check seed data." };
    }
    unitCount = await createCrawlUnits(run.id, categories);
    selectedZipCount = zipCount;
  } else {
    const selection = plannerSelection!;
    const selectedZipCodes = normalizeDistinct(selection.zipCodes);
    const selectedCounties = normalizeDistinct(selection.counties);

    selectedState = selection.state;
    selectedCountyCount = selectedCounties.length;

    unitCount = await createCrawlUnitsForSelection(run.id, categories, selectedZipCodes);
    selectedZipCount = categories.length > 0 ? Math.floor(unitCount / categories.length) : 0;

    if (unitCount === 0 || selectedZipCount === 0) {
      await updateCrawlRunStatus(run.id, "error");
      await createAuditLog("crawl_run_start_failed", "crawl_run", run.id, {
        reason: "no_units_for_selection",
        selectedState,
        selectedCountyCount,
        selectedZipCount: selectedZipCodes.length,
      });
      return { error: "No active zip codes matched this selection. Please select different zip codes." };
    }
  }

  await createAuditLog("crawl_run_started", "crawl_run", run.id, {
    categories,
    unitCount,
    zipCount: selectedZipCount,
    selectedState,
    selectedCountyCount,
  });

  return {
    runId: run.id,
    unitCount,
    zipCount: selectedZipCount,
    selectedZipCount,
    selectedCountyCount,
    selectedState,
    categories,
  };
}

export async function getPlannerStatesAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  return getStatesWithCounts();
}

export async function getPlannerCountiesAction(state: string) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const parsed = plannerStateSchema.safeParse(state);
  if (!parsed.success) return [];
  return getCountiesByState(parsed.data);
}

export async function getPlannerZipCodesAction(state: string, county: string, categories: string[] = []) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const parsedState = plannerStateSchema.safeParse(state);
  const parsedCounty = plannerCountySchema.safeParse(county);
  if (!parsedState.success || !parsedCounty.success) return [];

  const normalizedCategories = normalizeDistinct(categories);
  const zipCodes = await getZipCodesByCounty(parsedState.data, parsedCounty.data);
  return Promise.all(zipCodes.map(async (zip) => ({
    ...zip,
    coverage: await getZipCoverageStatus(zip.zip, normalizedCategories),
  })));
}

export async function pauseCrawlRunAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = await getActiveCrawlRun();
  if (!run) return { error: "No active run to pause." };
  await updateCrawlRunStatus(run.id, "paused");
  await createAuditLog("crawl_run_paused", "crawl_run", run.id);
  return { success: true };
}

export async function stopCrawlRunAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = await getActiveCrawlRun();
  if (!run) return { error: "No active discovery run to stop." };
  const result = await cancelCrawlRun(run.id);
  await createAuditLog("crawl_run_canceled", "crawl_run", run.id, {
    canceledUnits: result.canceledUnits,
  });
  return { success: true, runId: run.id, canceledUnits: result.canceledUnits };
}

export async function resumeCrawlRunAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const latest = await getLatestCrawlRun();
  if (!latest || latest.status !== "paused") return { error: "No paused run to resume." };
  await updateCrawlRunStatus(latest.id, "running");
  await createAuditLog("crawl_run_resumed", "crawl_run", latest.id);
  return { success: true };
}

export async function retryFailedUnitsAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  if (!run) return { error: "No run found." };
  if (run.status === "canceled") return { error: "This run was stopped. Start a new discovery instead of retrying it." };
  const count = await retryFailed(run.id);
  if (run.status === "done" || run.status === "error") {
    await updateCrawlRunStatus(run.id, "running");
  }
  return { retriedCount: count };
}

export async function getDashboardStatsAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const base = await getDashboardStats();
  const todayFocus = await getTodayFocusCount();
  const needsFollowUp = await getNeedsFollowUpCount();
  const conversionMetrics = await getConversionMetrics();

  let apiCallsUsed = 0;
  let estimatedCost = 0;
  let discoveryApiCalls = 0;
  let discoveryEstimatedCost = 0;
  let enrichmentApiCalls = 0;
  let enrichmentEstimatedCost = 0;
  let atmosphereEnrichmentCalls = 0;
  let atmosphereEstimatedCost = 0;
  let lastError: string | null = null;

  const monthlyUsage = await getMonthlyApiUsageSummary();
  const monthlyApiCalls = monthlyUsage.totalCalls;
  const monthlyApiCost = monthlyUsage.totalCost;
  let projectedMonthlyCost = monthlyApiCost;

  if (monthlyApiCalls > 0) {
    const now = new Date();
    const daysElapsed = Math.max(now.getUTCDate(), 1);
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    projectedMonthlyCost = Math.round(((monthlyApiCost / daysElapsed) * daysInMonth) * 100) / 100;
  }

  if (base.runId) {
    const runUsage = await getRunApiUsageSummary(base.runId);
    apiCallsUsed = runUsage.totalCalls;
    estimatedCost = runUsage.totalCost;
    discoveryApiCalls = runUsage.discoveryCalls;
    discoveryEstimatedCost = runUsage.discoveryCost;
    enrichmentApiCalls = runUsage.enrichmentCalls;
    enrichmentEstimatedCost = runUsage.enrichmentCost;
    atmosphereEnrichmentCalls = runUsage.atmosphereCalls;
    atmosphereEstimatedCost = runUsage.atmosphereCost;
    lastError = await getRunLastError(base.runId);
  }

  const qualifiedLeadCount = await getQualifiedLeadCount(5.0);
  const costPerQualifiedLead = qualifiedLeadCount > 0 ? Math.round((estimatedCost / qualifiedLeadCount) * 100) / 100 : null;
  const schedulerHealth = await getSchedulerHealth();

  return {
    ...base,
    todayFocus,
    needsFollowUp,
    conversionMetrics,
    apiCallsUsed,
    estimatedCost,
    discoveryApiCalls,
    discoveryEstimatedCost,
    enrichmentApiCalls,
    enrichmentEstimatedCost,
    atmosphereEnrichmentCalls,
    atmosphereEstimatedCost,
    monthlyApiCalls,
    monthlyApiCost,
    projectedMonthlyCost,
    lastError,
    qualifiedLeadCount,
    costPerQualifiedLead,
    schedulerHealth,
  };
}

export async function getFailedUnitErrorsAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  if (!run) return [];
  return getFailedUnitErrors(run.id);
}

export async function getCrawlProgressAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  if (!run) return null;
  return { runId: run.id, status: run.status, ...(await getCrawlProgress(run.id)) };
}
