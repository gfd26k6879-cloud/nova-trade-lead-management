"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isDbStatementTimeoutError,
  isTransientDbError,
  withDbStatementTimeout,
  withTenantDbContext,
  type DbClient,
} from "@/lib/db/index";
import {
  ReadOnlyActionDeadlineError,
  withReadOnlyActionDeadline,
} from "@/lib/read-only-action-deadline";
import {
  ensureDbReady,
  createCrawlRun,
  createCrawlUnits,
  createCrawlUnitsForSelection,
  createCrawlUnitsForCells,
  updateCrawlRunStatus,
  blockCrawlRun,
  cancelCrawlRun,
  retryFailedUnits as retryFailed,
  getDashboardStats,
  getCrawlProgress,
  getCrawlUnitPreview,
  getZipCodeCount,
  getTodayFocusCount,
  getNeedsFollowUpCount,
  getConversionMetrics,
  getQualifiedLeadCount,
  createAuditLog,
  getRunApiUsageSummary,
  getMonthlyApiUsageSummary,
  getMonthlyBillableEventsForSku,
  getRunLastError,
  getFailedUnitErrors,
  getStatesWithCounts,
  getCountiesByState,
  getZipCodesByCounty,
  getZipCoverageStatus,
  getPlannerMarkets,
  getPlannerCells,
  getLocationCellCoverage,
  getMarketCoverageSummary,
  getRunGeographyProgress,
  getSchedulerHealth,
  getLaunchReadinessSummary,
  getSchedulerOperationsSummary,
  buildSchedulerOperationsFallback,
  getProcessingCrawlRun,
  getDiscoveryRunCandidates,
  getSelectedOrDefaultVisibleCrawlRun,
  getLatestPausedCrawlRun,
  getCrawlRunRemainingSearchCalls,
  listDiscoveryItems,
  type DiscoveryItemSummary,
  getSettings,
  API_ENDPOINT_TEXT_SEARCH,
  logApiUsageEvent,
  getAdminFulfillmentSummary,
  getStatisticsSummary,
  getTeamBoardSummary,
  updateSettings,
  type CrawlProgress,
  type CrawlRun,
  type CrawlUnitPreview,
  type DiscoveryRunCandidate,
  type GeographyProgress,
  type LocationCellCoverage,
  type MarketCoverageSummary,
  type SchedulerWorkerName,
} from "@/lib/db/queries";
import { requirePermission, type AppSession, type TenantSession } from "@/lib/auth";
import type { TenantSessionSelector } from "@/lib/app-users";
import {
  emptyDashboardStats,
  emptyDashboardSummaryPanels,
  type DashboardStatsResult,
  type DashboardSummaryLoadError,
  type DashboardSummaryPanelsResult,
} from "@/lib/dashboard-fallbacks";
import {
  estimateDiscoveryRunSize,
  getTextSearchFieldMaskForDiscoveryMode,
  getTextSearchSkuForDiscoveryMode,
  normalizeDiscoveryMode,
  normalizePaginationPolicy,
  type DiscoverySizeInput,
  type DiscoverySizeEstimate,
} from "@/lib/discovery-sizing";
import { PlacesApiError, textSearch } from "@/lib/google-places";
import { startRouteTiming } from "@/lib/route-timing";
import {
  assertTenantPermission,
  requireTenantPermission,
  TenantAuthorizationError,
  type TenantPolicyContext,
} from "@/lib/tenancy/authorize";
import { getTenantContext, runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";
import { tenantPolicySchema } from "@/lib/tenancy/schemas";

const startPlannerSchema = z.object({
  state: z.string().trim().min(2).max(2).transform((value) => value.toUpperCase()),
  counties: z.array(z.string().trim().min(1)).default([]),
  zipCodes: z.array(z.string().trim().regex(/^\d{5}$/)).min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  discoveryMode: z.enum(["coverage_probe", "lead_harvest"]).optional(),
  paginationPolicy: z.enum(["first_page_only", "auto_yield_based", "manual_extra_pages"]).optional(),
  testRun: z.boolean().optional(),
});

const startMarketPlannerSchema = z.object({
  marketId: z.string().trim().min(1),
  cellIds: z.array(z.string().trim().min(1)).min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  discoveryMode: z.enum(["coverage_probe", "lead_harvest"]).optional(),
  paginationPolicy: z.enum(["first_page_only", "auto_yield_based", "manual_extra_pages"]).optional(),
  testRun: z.boolean().optional(),
  promotedFromRunId: z.string().trim().min(1).optional(),
});

const plannerStateSchema = z.string().trim().min(2).max(2).transform((value) => value.toUpperCase());
const plannerCountySchema = z.string().trim().min(1);
const schedulerWorkerSchema = z.enum(["ai_verification", "crawl", "enrichment", "artifact", "score_recompute"]);

function normalizeDistinct(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

async function estimateDiscoveryRunSizeWithUsage(
  input: Omit<DiscoverySizeInput, "monthlyBillableEventsForSku">,
): Promise<DiscoverySizeEstimate> {
  const preliminary = estimateDiscoveryRunSize({ ...input, monthlyBillableEventsForSku: 0 });
  const monthlyBillableEventsForSku = await getMonthlyBillableEventsForSku(preliminary.sku);
  return estimateDiscoveryRunSize({ ...input, monthlyBillableEventsForSku });
}

function discoveryBlockMessage(estimate: DiscoverySizeEstimate, fallback = "Discovery run is blocked by the current Google safety cap."): string {
  return estimate.blockingReasons[0] ?? fallback;
}

type GoogleDiagnosticResult =
  | { ok: true; mode: "coverage_probe" | "lead_harvest"; keySource: "ui" | "env" | "none"; fieldMask: string; sku: string }
  | { ok: false; mode: "coverage_probe" | "lead_harvest"; keySource: "ui" | "env" | "none"; fieldMask: string; sku: string; error: string; errorCode: string };

function diagnosticCapBlockMessage(estimate: DiscoverySizeEstimate): string | null {
  if (estimate.remainingMonthlyCallCap === null) return null;
  const callsIncludingDiagnostic = estimate.estimatedSearchCalls + 1;
  if (callsIncludingDiagnostic <= estimate.remainingMonthlyCallCap) return null;
  return `This action needs ${callsIncludingDiagnostic.toLocaleString()} Google Text Search calls including the diagnostic preflight, but only ${estimate.remainingMonthlyCallCap.toLocaleString()} remain under the ${estimate.capSource.replace(/_/g, " ")} cap.`;
}

function googleDiagnosticFailureMessage(result: GoogleDiagnosticResult): string | null {
  if (result.ok) return null;
  return `Google diagnostic failed before Discovery could run: ${result.error}`;
}

async function runGoogleDiscoveryDiagnostic(
  mode: "coverage_probe" | "lead_harvest",
  options: { crawlRunId?: string | null; category?: string | null; locationLabel?: string | null } = {},
): Promise<GoogleDiagnosticResult> {
  const settings = await getSettings();
  const fieldMask = getTextSearchFieldMaskForDiscoveryMode(mode);
  const sku = getTextSearchSkuForDiscoveryMode(mode);
  const keySource = settings.google_places_api_key_source;
  const category = options.category?.trim() || "dentist";
  const locationLabel = options.locationLabel?.trim() || "Denver, CO 80202, United States";
  const query = `${category.replace(/_/g, " ")} near ${locationLabel}`;

  if (!settings.google_places_api_key_configured) {
    return {
      ok: false,
      mode,
      keySource,
      fieldMask,
      sku,
      error: "Google Places API key is not configured in Settings or Vercel environment variables.",
      errorCode: "google_key_missing",
    };
  }

  try {
    await textSearch(query, undefined, settings.rate_limit_ms, undefined, { fieldMask });
    await logApiUsageEvent({
      crawl_run_id: options.crawlRunId ?? null,
      endpoint: API_ENDPOINT_TEXT_SEARCH,
      sku,
      field_mask: fieldMask,
      success: true,
      was_cached: false,
      billable_units: 1,
      metadata: {
        diagnostic: true,
        discoveryMode: mode,
        query,
        keySource,
      },
    });
    return { ok: true, mode, keySource, fieldMask, sku };
  } catch (error) {
    const errorMessage = formatGoogleDiagnosticError(error);
    if (error instanceof PlacesApiError) {
      await logApiUsageEvent({
        crawl_run_id: options.crawlRunId ?? null,
        endpoint: API_ENDPOINT_TEXT_SEARCH,
        sku,
        field_mask: fieldMask,
        success: false,
        was_cached: false,
        billable_units: 1,
        metadata: {
          diagnostic: true,
          discoveryMode: mode,
          query,
          keySource,
          error: error.message.slice(0, 500),
          googleStatus: error.status,
          googleErrorBody: error.body.slice(0, 1000),
        },
      });
    }
    return {
      ok: false,
      mode,
      keySource,
      fieldMask,
      sku,
      error: errorMessage,
      errorCode: error instanceof PlacesApiError ? `google_${error.status}` : "google_diagnostic_failed",
    };
  }
}

function formatGoogleDiagnosticError(error: unknown): string {
  if (error instanceof PlacesApiError) {
    if (error.status === 403 && /PERMISSION_DENIED/i.test(error.body)) {
      return "Google Places returned 403 PERMISSION_DENIED. Check the production key restrictions, billing, and Places API entitlement.";
    }
    return `Google Places returned ${error.status}.`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function estimateRemainingDiscoveryRun(
  run: CrawlRun,
  remainingMode: "open" | "failed" | "open_or_failed",
): Promise<DiscoverySizeEstimate> {
  const settings = await getSettings();
  const selection = run.selection_json ?? {};
  const discoveryMode = normalizeDiscoveryMode(selection.discoveryMode, settings.google_default_discovery_mode);
  const paginationPolicy = normalizePaginationPolicy(selection.paginationPolicy, settings.google_default_pagination_policy);
  const remainingSearchCalls = await getCrawlRunRemainingSearchCalls(run.id, remainingMode);
  return estimateDiscoveryRunSizeWithUsage({
    cellCount: 1,
    categoryCount: 1,
    mode: discoveryMode,
    paginationPolicy,
    testRun: Boolean(selection.testRun),
    searchCallCountOverride: remainingSearchCalls,
    settings,
  });
}

function classifyDashboardActionFailure(error: unknown): "db_statement_timeout" | "transient_db_error" | "dashboard_stats_unavailable" {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "dashboard_stats_unavailable";
}

function classifyDashboardSummaryFailure(error: unknown): DashboardSummaryLoadError {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "summary_panels_unavailable";
}

type CoverageLoadError = "db_statement_timeout" | "transient_db_error" | "coverage_load_timeout" | "coverage_data_unavailable";

type CoverageRunSummary = Pick<
  CrawlRun,
  "id" | "name" | "scope_label" | "status" | "started_at" | "created_at" | "ended_at" | "categories" | "discovered_count" | "api_calls_used" | "last_error" | "blocked_reason" | "blocked_at" | "blocked_error_code" | "market_id"
> & { discoveryMode: "coverage_probe" | "lead_harvest" | null };

function classifyCoverageFailure(error: unknown): CoverageLoadError {
  if (error instanceof ReadOnlyActionDeadlineError) return "coverage_load_timeout";
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "coverage_data_unavailable";
}

function logReadFailureReason(error: unknown, loadError: string): string {
  return error instanceof ReadOnlyActionDeadlineError ? "read_action_deadline" : loadError;
}

function summarizeCoverageRun(run: CrawlRun | null | undefined): CoverageRunSummary | null {
  return run ? {
    id: run.id,
    name: run.name,
    scope_label: run.scope_label,
    status: run.status,
    started_at: run.started_at,
    created_at: run.created_at,
    ended_at: run.ended_at,
    categories: run.categories,
    discovered_count: run.discovered_count,
    api_calls_used: run.api_calls_used,
    last_error: run.last_error,
    blocked_reason: run.blocked_reason,
    blocked_at: run.blocked_at,
    blocked_error_code: run.blocked_error_code,
    market_id: run.market_id,
    discoveryMode: normalizeDiscoveryModeFromSelection(run.selection_json),
  } : null;
}

function normalizeDiscoveryModeFromSelection(selection: Record<string, unknown> | null): "coverage_probe" | "lead_harvest" | null {
  const value = selection?.discoveryMode;
  return value === "coverage_probe" || value === "lead_harvest" ? value : null;
}

async function timedDashboardStatsStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const logStepTiming = startRouteTiming(`action:getDashboardStatsAction:${label}`);
  try {
    const result = await fn();
    logStepTiming(200);
    return result;
  } catch (error) {
    const reason = classifyDashboardActionFailure(error);
    logStepTiming(503, { reason });
    throw error;
  }
}

async function timedDashboardAnalyticsStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const logStepTiming = startRouteTiming(`action:getDashboardAnalyticsAction:${label}`);
  try {
    const result = await fn();
    logStepTiming(200);
    return result;
  } catch (error) {
    const reason = classifyDashboardActionFailure(error);
    logStepTiming(503, { reason });
    throw error;
  }
}

async function timedCoverageStep<T>(actionName: string, label: string, fn: () => Promise<T>): Promise<T> {
  const logStepTiming = startRouteTiming(`action:${actionName}:${label}`);
  try {
    const result = await fn();
    logStepTiming(200);
    return result;
  } catch (error) {
    const loadError = classifyCoverageFailure(error);
    logStepTiming(503, { reason: logReadFailureReason(error, loadError) });
    throw error;
  }
}

type StartCrawlPayload = string[] | z.infer<typeof startPlannerSchema> | z.infer<typeof startMarketPlannerSchema>;

type EstimateCrawlPayload = z.infer<typeof startPlannerSchema> | z.infer<typeof startMarketPlannerSchema>;

async function requireCrawlPermission(
  selector: TenantSessionSelector,
  permission: "source:review" | "source:execute" | "queue:operate",
  action: string,
): Promise<TenantSession> {
  const tenantSession = await requireTenantPermission(selector, permission, { action });
  const legacySession = await requirePermission("crawl:manage");
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  return tenantSession;
}

async function withCrawlPermission<T>(
  selector: TenantSessionSelector,
  permission: "source:review" | "source:execute" | "queue:operate",
  action: string,
  callback: (session: TenantSession, db: DbClient) => Promise<T>,
): Promise<T> {
  const tenantSession = await requireCrawlPermission(selector, permission, action);
  return runWithTenantContext(tenantSession, `${action}:${randomUUID()}`, () =>
    withTenantDbContext((db) => callback(tenantSession, db)));
}

async function withCrawlWorkspacePermission<T>(
  selector: TenantSessionSelector,
  permission: "source:review",
  action: string,
  callback: (session: TenantSession, db: DbClient) => Promise<T>,
): Promise<T> {
  const tenantSession = await requireTenantPermission(selector, "workspace:read");
  const legacySession = await requirePermission("crawl:manage");
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId === null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }
  return runWithTenantContext(tenantSession, `${action}:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      const currentPolicy = await createTenantQueryRepository(db).getCurrentTenantPolicy(tenantSession.tenantId);
      const parsedPolicy = tenantPolicySchema.safeParse(currentPolicy);
      await assertTenantPermission(tenantSession, permission, {
        action,
        policyEvaluator: (context: TenantPolicyContext) => ({
          allowed: context.tenantId === tenantSession.tenantId
            && context.workspaceId === tenantSession.workspaceId
            && parsedPolicy.success
            && parsedPolicy.data.tenantId === tenantSession.tenantId
            && parsedPolicy.data.sourceResearchEnabled,
          context,
        }),
      });
      return callback(tenantSession, db);
    }));
}

async function assertCrawlSourceExecution(
  session: TenantSession,
  db: DbClient,
  action: string,
): Promise<void> {
  const currentPolicy = await createTenantQueryRepository(db).getCurrentTenantPolicy(session.tenantId);
  const parsedPolicy = tenantPolicySchema.safeParse(currentPolicy);
  await assertTenantPermission(session, "source:execute", {
    action,
    policyEvaluator: (context: TenantPolicyContext) => ({
      allowed: context.tenantId === session.tenantId
        && context.workspaceId === session.workspaceId
        && parsedPolicy.success
        && parsedPolicy.data.tenantId === session.tenantId
        && parsedPolicy.data.sourceResearchEnabled
        && !parsedPolicy.data.requireSourcePlanApproval,
      context,
    }),
  });
}

async function assertTenantCrawlRun(
  db: DbClient,
  session: TenantSession,
  run: CrawlRun | null | undefined,
): Promise<CrawlRun> {
  if (!run) {
    throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
  }
  const owned = await db.prepare(
    `SELECT id FROM crawl_runs
     WHERE tenant_id = ?
       AND (? IS NULL OR workspace_id = ?)
       AND id = ?`,
  ).get<{ id: string }>(session.tenantId, session.workspaceId, session.workspaceId, run.id);
  if (!owned) {
    throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
  }
  return run;
}

async function assertTenantDiscoveryItems(
  db: DbClient,
  session: TenantSession,
  items: readonly DiscoveryItemSummary[],
): Promise<void> {
  if (items.length === 0) return;
  const ids = Array.from(new Set(items.map((item) => item.id)));
  const placeholders = ids.map(() => "?").join(", ");
  const owned = await db.prepare(
    `SELECT id FROM crawl_runs
     WHERE tenant_id = ?
       AND (? IS NULL OR workspace_id = ?)
       AND id IN (${placeholders})`,
  ).all<{ id: string }>(session.tenantId, session.workspaceId, session.workspaceId, ...ids);
  if (new Set(owned.map((row) => row.id)).size !== ids.length) {
    throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
  }
}

async function requireCrawlSourceExecution(
  session: TenantSession,
  db: DbClient,
): Promise<void> {
  const currentPolicy = await createTenantQueryRepository(db).getCurrentTenantPolicy(session.tenantId);
  const parsedPolicy = tenantPolicySchema.safeParse(currentPolicy);

  await assertTenantPermission(session, "source:execute", {
    action: "crawl.discovery.start",
    policyEvaluator: (context: TenantPolicyContext) => ({
      allowed: session.workspaceId !== null
        && context.tenantId === session.tenantId
        && context.workspaceId === session.workspaceId
        && parsedPolicy.success
        && parsedPolicy.data.tenantId === session.tenantId
        && parsedPolicy.data.sourceResearchEnabled
        && !parsedPolicy.data.requireSourcePlanApproval,
      context,
    }),
  });
}

export async function startCrawlRunAction(
  payload: StartCrawlPayload,
  selector: TenantSessionSelector = {},
) {
  const tenantSession = await requireTenantPermission(selector, "workspace:read");
  const actor = await requirePermission("crawl:manage");
  if (actor.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }

  return runWithTenantContext(tenantSession, `crawl-start:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      await ensureDbReady();
      await requireCrawlSourceExecution(tenantSession, db);
      return startAuthorizedCrawlRun(payload, actor, tenantSession);
    }));
}

async function startAuthorizedCrawlRun(
  payload: StartCrawlPayload,
  actor: AppSession,
  tenantSession: TenantSession,
) {

  const crawlScope = {
    tenantId: tenantSession.tenantId,
    workspaceId: tenantSession.workspaceId,
  };
  const existing = await getProcessingCrawlRun(crawlScope);
  if (existing) {
    return { error: "A discovery item is already processing. Pause or complete it before starting another Google-consuming run." };
  }

  const legacyCategories = Array.isArray(payload) ? normalizeDistinct(payload) : [];
  let plannerSelection: z.infer<typeof startPlannerSchema> | null = null;
  let marketSelection: z.infer<typeof startMarketPlannerSchema> | null = null;

  if (!Array.isArray(payload)) {
    const parsedMarket = startMarketPlannerSchema.safeParse(payload);
    if (parsedMarket.success) {
      marketSelection = parsedMarket.data;
    } else {
      const parsedPlanner = startPlannerSchema.safeParse(payload);
      if (!parsedPlanner.success) {
        return { error: "Invalid run selection. Please choose market, location cells, and categories again." };
      }
      plannerSelection = parsedPlanner.data;
    }
  }

  if (!Array.isArray(payload) && !plannerSelection && !marketSelection) {
    return { error: "Invalid run selection. Please choose market, location cells, and categories again." };
  }

  let categories: string[];
  if (Array.isArray(payload)) {
    categories = legacyCategories;
  } else if (marketSelection) {
    categories = normalizeDistinct(marketSelection.categories);
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
  const settings = await getSettings();
  const discoveryMode = normalizeDiscoveryMode(
    marketSelection?.discoveryMode ?? plannerSelection?.discoveryMode ?? settings.google_default_discovery_mode,
    settings.google_default_discovery_mode,
  );
  const paginationPolicy = normalizePaginationPolicy(
    marketSelection?.paginationPolicy ?? plannerSelection?.paginationPolicy ?? settings.google_default_pagination_policy,
    settings.google_default_pagination_policy,
  );
  const testRun = Boolean(marketSelection?.testRun ?? plannerSelection?.testRun ?? false);
  const maxPages = paginationPolicy === "first_page_only" ? 1 : 3;
  const plannedCellCount = Array.isArray(payload)
    ? await getZipCodeCount()
    : marketSelection
      ? normalizeDistinct(marketSelection.cellIds).length
      : normalizeDistinct(plannerSelection!.zipCodes).length;
  const sizeEstimate = await estimateDiscoveryRunSizeWithUsage({
    cellCount: plannedCellCount,
    categoryCount: categories.length,
    mode: discoveryMode,
    paginationPolicy,
    testRun,
    settings,
  });

  if (!sizeEstimate.canStart) {
    return {
      error: discoveryBlockMessage(sizeEstimate, "Discovery selection is blocked by the current Google safety cap."),
      estimate: sizeEstimate,
    };
  }
  const diagnosticCapError = diagnosticCapBlockMessage(sizeEstimate);
  if (diagnosticCapError) {
    return { error: diagnosticCapError, estimate: sizeEstimate };
  }
  const diagnostic = await runGoogleDiscoveryDiagnostic(discoveryMode, {
    category: categories[0],
    locationLabel: marketSelection?.cellIds[0] ?? plannerSelection?.zipCodes[0] ?? null,
  });
  const diagnosticError = googleDiagnosticFailureMessage(diagnostic);
  if (diagnosticError) {
    return { error: diagnosticError, estimate: sizeEstimate, diagnostic };
  }

  const run = await createCrawlRun(categories, marketSelection ? {
    ...crawlScope,
    marketId: marketSelection.marketId,
    createdByUserId: actor.userId,
    selection: {
      marketId: marketSelection.marketId,
      cellIds: marketSelection.cellIds,
      categories,
      source: marketSelection.promotedFromRunId ? "promoted_probe" : "market_cells",
      discoveryMode,
      paginationPolicy,
      testRun,
      ...(marketSelection.promotedFromRunId ? { promotedFromRunId: marketSelection.promotedFromRunId } : {}),
      sizeEstimate,
    },
  } : {
    ...crawlScope,
    createdByUserId: actor.userId,
    selection: {
      state: plannerSelection?.state ?? null,
      zipCodes: plannerSelection?.zipCodes ?? null,
      categories,
      source: Array.isArray(payload) ? "legacy_all_active_zips" : "legacy_zip_selection",
      discoveryMode,
      paginationPolicy,
      testRun,
      sizeEstimate,
    },
  });

  if (Array.isArray(payload)) {
    const zipCount = await getZipCodeCount();
    if (zipCount === 0) {
      await updateCrawlRunStatus(run.id, "error");
      return { error: "No active zip codes found. Check seed data." };
    }
    unitCount = await createCrawlUnits(run.id, categories, { maxPages });
    selectedZipCount = zipCount;
  } else if (marketSelection) {
    const selectedCellIds = normalizeDistinct(marketSelection.cellIds);
    unitCount = await createCrawlUnitsForCells(run.id, categories, selectedCellIds, { maxPages });
    selectedZipCount = categories.length > 0 ? Math.floor(unitCount / categories.length) : 0;
    selectedState = marketSelection.marketId;
    if (unitCount === 0 || selectedZipCount === 0) {
      await updateCrawlRunStatus(run.id, "error");
      await createAuditLog("crawl_run_start_failed", "crawl_run", run.id, {
        reason: "no_units_for_market_selection",
        marketId: marketSelection.marketId,
        selectedCellCount: selectedCellIds.length,
      });
      return { error: "No active location cells matched this selection. Choose different postal/postcode cells." };
    }
  } else {
    const selection = plannerSelection!;
    const selectedZipCodes = normalizeDistinct(selection.zipCodes);
    const selectedCounties = normalizeDistinct(selection.counties);

    selectedState = selection.state;
    selectedCountyCount = selectedCounties.length;

    unitCount = await createCrawlUnitsForSelection(run.id, categories, selectedZipCodes, { maxPages });
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
    selectedCellCount: selectedZipCount,
    selectedCountyCount,
    selectedState,
    selectedMarketId: marketSelection?.marketId ?? null,
    categories,
    estimate: sizeEstimate,
  };
}

export async function estimateDiscoveryRunAction(
  payload: EstimateCrawlPayload,
  selector: TenantSessionSelector = {},
): Promise<DiscoverySizeEstimate | { error: string }> {
  return withCrawlWorkspacePermission(selector, "source:review", "crawl.discovery.estimate", async () => {
  const logActionTiming = startRouteTiming("action:estimateDiscoveryRunAction");
  try {
    const estimate = await withReadOnlyActionDeadline(
      "estimateDiscoveryRunAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const parsedMarket = startMarketPlannerSchema.safeParse(payload);
        const parsedPlanner = startPlannerSchema.safeParse(payload);
        const settings = await getSettings();
        const selection = parsedMarket.success ? parsedMarket.data : parsedPlanner.success ? parsedPlanner.data : null;
        if (!selection) return { error: "Invalid discovery selection." };
        const categories = normalizeDistinct(selection.categories);
        const cellCount = "cellIds" in selection ? normalizeDistinct(selection.cellIds).length : normalizeDistinct(selection.zipCodes).length;
        const mode = normalizeDiscoveryMode(selection.discoveryMode ?? settings.google_default_discovery_mode, settings.google_default_discovery_mode);
        const paginationPolicy = normalizePaginationPolicy(selection.paginationPolicy ?? settings.google_default_pagination_policy, settings.google_default_pagination_policy);
        return estimateDiscoveryRunSizeWithUsage({
          cellCount,
          categoryCount: categories.length,
          mode,
          paginationPolicy,
          testRun: Boolean(selection.testRun),
          settings,
        });
      }),
    );
    logActionTiming("error" in estimate ? 400 : 200, "error" in estimate ? { reason: "invalid_selection" } : undefined);
    return estimate;
  } catch (error) {
    if (error instanceof ReadOnlyActionDeadlineError) {
      logActionTiming(503, { reason: "dashboard_action_deadline" });
      return { error: "Discovery estimate is taking too long. Try again in a moment." };
    }
    if (isDbStatementTimeoutError(error)) {
      logActionTiming(503, { reason: "db_statement_timeout" });
      return { error: "Discovery estimate is taking too long. Try again in a moment." };
    }
    if (isTransientDbError(error)) {
      logActionTiming(503, { reason: "transient_db_error" });
      return { error: "Discovery estimate is temporarily unavailable. Try again in a moment." };
    }
    logActionTiming(500, { reason: "estimate_action_error" });
    throw error;
  }
  });
}

export async function getPlannerMarketsAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  return getPlannerMarkets();
}

export async function getPlannerCellsAction(marketId: string, categories: string[] = []) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  if (!marketId.trim()) return [];
  return getPlannerCells(marketId.trim(), normalizeDistinct(categories));
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

export async function pauseCrawlRunAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlPermission(selector, "queue:operate", "crawl.run.pause", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const candidate = runId
      ? await getSelectedOrDefaultVisibleCrawlRun(runId, scope)
      : await getProcessingCrawlRun(scope);
    if (!candidate) return { error: "No active run to pause." };
    const run = await assertTenantCrawlRun(db, session, candidate);
    if (run.status !== "running" && run.status !== "queued") return { error: "Only a running or queued discovery item can be paused." };
    await updateCrawlRunStatus(run.id, "paused");
    await createAuditLog("crawl_run_paused", "crawl_run", run.id);
    return { success: true };
  });
}

export async function stopCrawlRunAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlPermission(selector, "queue:operate", "crawl.run.stop", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const candidate = await getSelectedOrDefaultVisibleCrawlRun(runId, scope);
    if (!candidate) return { error: "No active discovery run to stop." };
    const run = await assertTenantCrawlRun(db, session, candidate);
    if (run.status !== "running" && run.status !== "queued" && run.status !== "paused" && run.status !== "blocked") {
      return { error: "Only a running, queued, paused, or blocked discovery item can have remaining units canceled." };
    }
    const result = await cancelCrawlRun(run.id);
    await createAuditLog("crawl_run_canceled", "crawl_run", run.id, {
      canceledUnits: result.canceledUnits,
    });
    return { success: true, runId: run.id, canceledUnits: result.canceledUnits };
  });
}

export async function resumeCrawlRunAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlPermission(selector, "queue:operate", "crawl.run.resume", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const processing = await getProcessingCrawlRun(scope);
    if (processing) {
      await assertTenantCrawlRun(db, session, processing);
      return { error: "Another discovery item is already processing. Pause or complete it before resuming this item." };
    }
    const candidate = runId
      ? await getSelectedOrDefaultVisibleCrawlRun(runId, scope)
      : await getLatestPausedCrawlRun(scope);
    if (!candidate) return { error: "No paused or blocked run to resume." };
    const latest = await assertTenantCrawlRun(db, session, candidate);
    if (latest.status !== "paused" && latest.status !== "blocked") return { error: "No paused or blocked run to resume." };
    await assertCrawlSourceExecution(session, db, "crawl.run.resume");
    const estimate = await estimateRemainingDiscoveryRun(latest, "open");
    if (!estimate.canStart) {
      return { error: discoveryBlockMessage(estimate, "This paused discovery item exceeds the current Google safety cap."), estimate };
    }
    const diagnosticCapError = diagnosticCapBlockMessage(estimate);
    if (diagnosticCapError) {
      return { error: diagnosticCapError, estimate };
    }
    const diagnostic = await runGoogleDiscoveryDiagnostic(
      normalizeDiscoveryMode(latest.selection_json?.discoveryMode, estimate.mode),
      { crawlRunId: latest.id, category: latest.categories[0] ?? null },
    );
    const diagnosticError = googleDiagnosticFailureMessage(diagnostic);
    if (!diagnostic.ok && diagnosticError) {
      await blockCrawlRun(latest.id, diagnosticError, diagnostic.errorCode);
      return { error: diagnosticError, estimate, diagnostic };
    }
    await updateCrawlRunStatus(latest.id, "running");
    await createAuditLog("crawl_run_resumed", "crawl_run", latest.id);
    return { success: true, estimate };
  });
}

export async function retryFailedUnitsAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlPermission(selector, "queue:operate", "crawl.run.retry", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const candidate = await getSelectedOrDefaultVisibleCrawlRun(runId, scope);
    if (!candidate) return { error: "No run found." };
    const run = await assertTenantCrawlRun(db, session, candidate);
    if (run.status === "canceled") return { error: "This run was stopped. Start a new discovery instead of retrying it." };
    await assertCrawlSourceExecution(session, db, "crawl.run.retry");
    const estimate = await estimateRemainingDiscoveryRun(run, "open_or_failed");
    if (!estimate.canStart) {
      return { error: discoveryBlockMessage(estimate, "Retrying failed units exceeds the current Google safety cap."), estimate };
    }
    const diagnosticCapError = diagnosticCapBlockMessage(estimate);
    if (diagnosticCapError) {
      return { error: diagnosticCapError, estimate };
    }
    const diagnostic = await runGoogleDiscoveryDiagnostic(
      normalizeDiscoveryMode(run.selection_json?.discoveryMode, estimate.mode),
      { crawlRunId: run.id, category: run.categories[0] ?? null },
    );
    const diagnosticError = googleDiagnosticFailureMessage(diagnostic);
    if (!diagnostic.ok && diagnosticError) {
      await blockCrawlRun(run.id, diagnosticError, diagnostic.errorCode);
      return { error: diagnosticError, estimate, diagnostic };
    }
    const count = await retryFailed(run.id);
    if (run.status === "done" || run.status === "error" || run.status === "blocked") {
      await updateCrawlRunStatus(run.id, "running");
    }
    return { retriedCount: count, estimate };
  });
}

export async function runGoogleDiscoveryDiagnosticAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlPermission(selector, "queue:operate", "crawl.discovery.diagnostic", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const candidate = runId
      ? await getSelectedOrDefaultVisibleCrawlRun(runId, scope)
      : await getProcessingCrawlRun(scope);
    if (runId && !candidate) {
      throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
    }
    const run = candidate ? await assertTenantCrawlRun(db, session, candidate) : null;
    await assertCrawlSourceExecution(session, db, "crawl.discovery.diagnostic");
    const settings = await getSettings();
    const mode = run
      ? normalizeDiscoveryMode(run.selection_json?.discoveryMode, settings.google_default_discovery_mode)
      : settings.google_default_discovery_mode;
    const diagnostic = await runGoogleDiscoveryDiagnostic(mode, {
      crawlRunId: run?.id ?? null,
      category: run?.categories?.[0] ?? null,
    });
    if (!diagnostic.ok && run?.id) {
      await blockCrawlRun(run.id, `Google diagnostic failed before Discovery could run: ${diagnostic.error}`, diagnostic.errorCode);
    }
    return { diagnostic };
  });
}

export async function updateSchedulerWorkerEnabledAction(workerName: SchedulerWorkerName, enabled: boolean) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const parsedWorker = schedulerWorkerSchema.safeParse(workerName);
  if (!parsedWorker.success) return { error: "Invalid scheduler worker." };

  const settingKey = schedulerSettingKey(parsedWorker.data);
  await updateSettings({ [settingKey]: enabled });
  await createAuditLog(enabled ? "scheduler_worker_resumed" : "scheduler_worker_paused", "settings", "1", {
    workerName: parsedWorker.data,
  });
  return { success: true, workerName: parsedWorker.data, enabled };
}

export async function updateAllSchedulerWorkersEnabledAction(enabled: boolean) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  await updateSettings({
    scheduler_ai_verification_enabled: enabled,
    scheduler_crawl_enabled: enabled,
    scheduler_enrichment_enabled: enabled,
    scheduler_artifact_enabled: enabled,
    scheduler_score_recompute_enabled: enabled,
  });
  await createAuditLog(enabled ? "scheduler_all_workers_resumed" : "scheduler_all_workers_paused", "settings", "1");
  return { success: true, enabled };
}

export async function resumeRecommendedSchedulerWorkersAction() {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const settings = await getSettings();
  const openAiReady = settings.ai_enabled && settings.openai_api_key_configured;
  const googleReady = settings.google_places_api_key_configured;
  await updateSettings({
    scheduler_ai_verification_enabled: openAiReady,
    scheduler_crawl_enabled: googleReady,
    scheduler_enrichment_enabled: googleReady,
    scheduler_artifact_enabled: openAiReady,
    scheduler_score_recompute_enabled: true,
  });
  await createAuditLog("scheduler_recommended_workers_resumed", "settings", "1", {
    openAiReady,
    googleReady,
  });
  return { success: true, openAiReady, googleReady };
}

export async function getSchedulerOperationsAction(
  selector: TenantSessionSelector = {},
) {
  const tenantSession = await requireTenantPermission(selector, "queue:read", {
    action: "scheduler.operations.read",
  });
  const legacySession = await requirePermission("crawl:manage");
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }

  const correlationId = getTenantContext()?.correlationId ?? `scheduler-operations:${randomUUID()}`;
  return runWithTenantContext(tenantSession, correlationId, () =>
    withTenantDbContext(async () => {
      try {
        return await withDbStatementTimeout(8_000, async () => {
          await ensureDbReady();
          return getSchedulerOperationsSummary();
        });
      } catch (error) {
        if (isDbStatementTimeoutError(error)) {
          return buildSchedulerOperationsFallback("db_statement_timeout");
        }
        if (isTransientDbError(error)) {
          return buildSchedulerOperationsFallback("transient_db_error");
        }
        throw error;
      }
    }));
}

async function requireTenantWideDashboardRead(
  selector: TenantSessionSelector,
  action: "dashboard.stats.read" | "dashboard.analytics.read",
): Promise<TenantSession> {
  const tenantSession = await requireTenantPermission(selector, "report:read", { action });
  const legacySession = await requirePermission("crawl:manage");
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }
  return tenantSession;
}

export async function getDashboardStatsAction(
  selector: TenantSessionSelector = {},
): Promise<DashboardStatsResult> {
  const tenantSession = await requireTenantWideDashboardRead(selector, "dashboard.stats.read");
  const logActionTiming = startRouteTiming("action:getDashboardStatsAction");
  const correlationId = getTenantContext()?.correlationId ?? `dashboard-stats:${randomUUID()}`;
  return runWithTenantContext(tenantSession, correlationId, () =>
    withTenantDbContext(async () => {
      try {
        const stats = await withReadOnlyActionDeadline(
          "getDashboardStatsAction",
          12_000,
          withDbStatementTimeout(8_000, async () => {
            await ensureDbReady();
            return getDashboardStatsActionInternal();
          }),
        );
        logActionTiming(200);
        return stats;
      } catch (error) {
        if (error instanceof ReadOnlyActionDeadlineError) {
          logActionTiming(503, { reason: "dashboard_action_deadline" });
          return emptyDashboardStats("dashboard_stats_unavailable");
        }
        const reason = classifyDashboardActionFailure(error);
        logActionTiming(503, { reason });
        return emptyDashboardStats(reason);
      }
    }),
  );
}

async function getDashboardStatsActionInternal(): Promise<DashboardStatsResult> {
  const base = await timedDashboardStatsStep("core_base", getDashboardStats);
  const settings = await timedDashboardStatsStep("settings", getSettings);
  return {
    ...emptyDashboardStats(),
    ...base,
    lastError: null,
    googleDiscoveryDefaults: {
      discoveryMode: settings.google_default_discovery_mode,
      paginationPolicy: settings.google_default_pagination_policy,
    },
  };
}

export async function getDashboardAnalyticsAction(
  selector: TenantSessionSelector = {},
): Promise<Partial<DashboardStatsResult> & { loadError?: "db_statement_timeout" | "transient_db_error" | "dashboard_stats_unavailable" }> {
  const tenantSession = await requireTenantWideDashboardRead(selector, "dashboard.analytics.read");
  const logActionTiming = startRouteTiming("action:getDashboardAnalyticsAction");
  const correlationId = getTenantContext()?.correlationId ?? `dashboard-analytics:${randomUUID()}`;
  return runWithTenantContext(tenantSession, correlationId, () =>
    withTenantDbContext(async () => {
      try {
        const stats = await withReadOnlyActionDeadline(
          "getDashboardAnalyticsAction",
          12_000,
          withDbStatementTimeout(8_000, async () => {
            await ensureDbReady();
            return getDashboardAnalyticsActionInternal();
          }),
        );
        logActionTiming(200);
        return stats;
      } catch (error) {
        const reason = error instanceof ReadOnlyActionDeadlineError ? "dashboard_stats_unavailable" : classifyDashboardActionFailure(error);
        logActionTiming(503, { reason: error instanceof ReadOnlyActionDeadlineError ? "dashboard_action_deadline" : reason });
        return { loadError: reason };
      }
    }),
  );
}

async function getDashboardAnalyticsActionInternal(): Promise<Partial<DashboardStatsResult>> {
  const visibleRun = await timedDashboardAnalyticsStep("visible_run", () => getSelectedOrDefaultVisibleCrawlRun());
  let apiCallsUsed = 0;
  let discoveryApiCalls = 0;
  let enrichmentApiCalls = 0;
  let atmosphereEnrichmentCalls = 0;
  let lastError: string | null = null;

  const todayFocus = await timedDashboardAnalyticsStep("today_focus", getTodayFocusCount);
  const needsFollowUp = await timedDashboardAnalyticsStep("needs_follow_up", getNeedsFollowUpCount);
  const conversionMetrics = await timedDashboardAnalyticsStep("conversion_metrics", getConversionMetrics);
  const monthlyUsage = await timedDashboardAnalyticsStep("monthly_api_usage", getMonthlyApiUsageSummary);
  const qualifiedLeadCount = await timedDashboardAnalyticsStep("qualified_lead_count", () => getQualifiedLeadCount(5.0));
  const schedulerHealth = await timedDashboardAnalyticsStep("scheduler_health", getSchedulerHealth);
  const launchReadiness = await timedDashboardAnalyticsStep("launch_readiness", getLaunchReadinessSummary);
  const monthlyApiCalls = monthlyUsage.totalCalls;

  if (visibleRun?.id) {
    const runUsage = await timedDashboardAnalyticsStep("run_api_usage", () => getRunApiUsageSummary(visibleRun.id));
    apiCallsUsed = runUsage.totalCalls;
    discoveryApiCalls = runUsage.discoveryCalls;
    enrichmentApiCalls = runUsage.enrichmentCalls;
    atmosphereEnrichmentCalls = runUsage.atmosphereCalls;
    lastError = await timedDashboardAnalyticsStep("run_last_error", () => getRunLastError(visibleRun.id));
  }

  return {
    todayFocus,
    needsFollowUp,
    conversionMetrics,
    apiCallsUsed,
    estimatedCost: 0,
    discoveryApiCalls,
    discoveryEstimatedCost: 0,
    enrichmentApiCalls,
    enrichmentEstimatedCost: 0,
    atmosphereEnrichmentCalls,
    atmosphereEstimatedCost: 0,
    monthlyApiCalls,
    monthlyApiCost: 0,
    projectedMonthlyCost: 0,
    lastError,
    qualifiedLeadCount,
    costPerQualifiedLead: null,
    schedulerHealth,
    launchReadiness,
  };
}

export async function getDashboardSummaryPanelsAction(
  selector: TenantSessionSelector = {},
): Promise<DashboardSummaryPanelsResult> {
  return withCrawlPermission(selector, "source:review", "dashboard.summary.read", async () => {
  const logActionTiming = startRouteTiming("action:getDashboardSummaryPanelsAction");
  try {
    const panels = await withReadOnlyActionDeadline(
      "getDashboardSummaryPanelsAction",
      12_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const teamSummary = await getTeamBoardSummary();
        const weeklyStats = await getStatisticsSummary({ range: "7d" });
        const fulfillmentSummary = await getAdminFulfillmentSummary();
        return { teamSummary, weeklyStats, fulfillmentSummary };
      }),
    );
    logActionTiming(200);
    return panels;
  } catch (error) {
    if (error instanceof ReadOnlyActionDeadlineError) {
      logActionTiming(503, { reason: "dashboard_action_deadline" });
      return emptyDashboardSummaryPanels("summary_panels_unavailable");
    }
    const loadError = classifyDashboardSummaryFailure(error);
    logActionTiming(503, { reason: loadError });
    return emptyDashboardSummaryPanels(loadError);
  }
  });
}

export async function getDiscoveryItemsAction(
  selector: TenantSessionSelector = {},
): Promise<{ items: DiscoveryItemSummary[]; loadError?: DashboardSummaryLoadError }> {
  return withCrawlPermission(selector, "source:review", "dashboard.discovery-items.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getDiscoveryItemsAction");
  try {
    const items = await withReadOnlyActionDeadline(
      "getDiscoveryItemsAction",
      10_000,
      withDbStatementTimeout(6_000, async () => {
        await ensureDbReady();
        const items = await listDiscoveryItems(12, {
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
        });
        await assertTenantDiscoveryItems(db, session, items);
        return items;
      }),
    );
    logActionTiming(200);
    return { items };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = error instanceof ReadOnlyActionDeadlineError
      ? "discovery_items_unavailable"
      : isDbStatementTimeoutError(error)
      ? "db_statement_timeout"
      : isTransientDbError(error)
        ? "transient_db_error"
        : "discovery_items_unavailable";
    logActionTiming(503, { reason: error instanceof ReadOnlyActionDeadlineError ? "dashboard_action_deadline" : loadError });
    return { items: [], loadError };
  }
  });
}

export async function getCoverageDiscoveryItemsAction(
  selectedRunId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  run: CoverageRunSummary | null;
  discoveryItems: DiscoveryItemSummary[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.discovery-items.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageDiscoveryItems");
  try {
    const result = await withReadOnlyActionDeadline(
      "getCoverageDiscoveryItemsAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
        const candidate = await timedCoverageStep("getCoverageDiscoveryItems", "selected_run", () =>
          getSelectedOrDefaultVisibleCrawlRun(selectedRunId ?? undefined, scope));
        const run = candidate ? await assertTenantCrawlRun(db, session, candidate) : null;
        const discoveryItems = await timedCoverageStep("getCoverageDiscoveryItems", "item_list", () =>
          listDiscoveryItems(30, scope));
        await assertTenantDiscoveryItems(db, session, discoveryItems);
        return { run: summarizeCoverageRun(run), discoveryItems };
      }),
    );
    logActionTiming(200);
    return result;
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { run: null, discoveryItems: [], loadError };
  }
  });
}

export async function getCoverageSelectedRunAction(
  selectedRunId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  run: CoverageRunSummary | null;
  crawlWorker: { enabled: boolean; googlePlacesKeyConfigured: boolean; googlePlacesKeySource: "ui" | "env" | "none" } | null;
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.selected-run.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageSelectedRun");
  try {
    const result = await withReadOnlyActionDeadline(
      "getCoverageSelectedRunAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
        const [run, settings] = await Promise.all([
          timedCoverageStep("getCoverageSelectedRun", "selected_run", () =>
            getSelectedOrDefaultVisibleCrawlRun(selectedRunId ?? undefined, scope)),
          getSettings(),
        ]);
        return {
          run: run ? await assertTenantCrawlRun(db, session, run) : null,
          crawlWorker: {
            enabled: settings.scheduler_crawl_enabled,
            googlePlacesKeyConfigured: settings.google_places_api_key_configured,
            googlePlacesKeySource: settings.google_places_api_key_source,
          },
        };
      }),
    );
    logActionTiming(200);
    return { run: summarizeCoverageRun(result.run), crawlWorker: result.crawlWorker };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { run: null, crawlWorker: null, loadError };
  }
  });
}

export async function getCoverageDiscoveryItemListAction(
  limit = 30,
  selector: TenantSessionSelector = {},
): Promise<{
  discoveryItems: DiscoveryItemSummary[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.discovery-item-list.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageDiscoveryItemList");
  try {
    const discoveryItems = await withReadOnlyActionDeadline(
      "getCoverageDiscoveryItemListAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
        const items = await timedCoverageStep("getCoverageDiscoveryItemList", "item_list", () => listDiscoveryItems(safeLimit, {
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
        }));
        await assertTenantDiscoveryItems(db, session, items);
        return items;
      }),
    );
    logActionTiming(200);
    return { discoveryItems };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { discoveryItems: [], loadError };
  }
  });
}

export async function getCoverageMarketSummaryAction(
  runId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  markets: MarketCoverageSummary[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.market-summary.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageMarketSummary");
  try {
    const markets = await withReadOnlyActionDeadline(
      "getCoverageMarketSummaryAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
        if (runId) {
          await assertTenantCrawlRun(db, session, await getSelectedOrDefaultVisibleCrawlRun(runId, scope));
        }
        return getMarketCoverageSummary(runId ?? undefined, scope);
      }),
    );
    logActionTiming(200);
    return { markets };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { markets: [], loadError };
  }
  });
}

export async function getCoverageCellLedgerAction(
  runId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  cells: LocationCellCoverage[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.cell-ledger.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageCellLedger");
  try {
    const cells = await withReadOnlyActionDeadline(
      "getCoverageCellLedgerAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
        if (runId) {
          await assertTenantCrawlRun(db, session, await getSelectedOrDefaultVisibleCrawlRun(runId, scope));
        }
        return getLocationCellCoverage(runId ?? undefined, scope);
      }),
    );
    logActionTiming(200);
    return { cells };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { cells: [], loadError };
  }
  });
}

export async function getCoverageRunProgressAction(
  runId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  progress: CrawlProgress | null;
  geography: GeographyProgress | null;
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.run-progress.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageRunProgress");
  if (!runId) {
    logActionTiming(200, { mode: "no_run" });
    return { progress: null, geography: null };
  }
  try {
    const result = await withReadOnlyActionDeadline(
      "getCoverageRunProgressAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        await assertTenantCrawlRun(db, session, await getSelectedOrDefaultVisibleCrawlRun(runId, {
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
        }));
        const progress = await getCrawlProgress(runId);
        const geography = await getRunGeographyProgress(runId);
        return { progress, geography };
      }),
    );
    logActionTiming(200);
    return result;
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { progress: null, geography: null, loadError };
  }
  });
}

export async function getCoverageUnitPreviewAction(
  runId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  unitPreview: CrawlUnitPreview[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.unit-preview.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageUnitPreview");
  if (!runId) {
    logActionTiming(200, { mode: "no_run" });
    return { unitPreview: [] };
  }
  try {
    const unitPreview = await withReadOnlyActionDeadline(
      "getCoverageUnitPreviewAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        await assertTenantCrawlRun(db, session, await getSelectedOrDefaultVisibleCrawlRun(runId, {
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
        }));
        return getCrawlUnitPreview(runId, 100);
      }),
    );
    logActionTiming(200);
    return { unitPreview };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { unitPreview: [], loadError };
  }
  });
}

export async function getCoverageProbeCandidatesAction(
  runId?: string | null,
  selector: TenantSessionSelector = {},
): Promise<{
  candidates: DiscoveryRunCandidate[];
  loadError?: CoverageLoadError;
}> {
  return withCrawlPermission(selector, "source:review", "coverage.probe-candidates.read", async (session, db) => {
  const logActionTiming = startRouteTiming("action:getCoverageProbeCandidates");
  if (!runId) {
    logActionTiming(200, { mode: "no_run" });
    return { candidates: [] };
  }
  try {
    const candidates = await withReadOnlyActionDeadline(
      "getCoverageProbeCandidatesAction",
      10_000,
      withDbStatementTimeout(8_000, async () => {
        await ensureDbReady();
        await assertTenantCrawlRun(db, session, await getSelectedOrDefaultVisibleCrawlRun(runId, {
          tenantId: session.tenantId,
          workspaceId: session.workspaceId,
        }));
        return getDiscoveryRunCandidates(runId, 100);
      }),
    );
    logActionTiming(200);
    return { candidates };
  } catch (error) {
    if (error instanceof TenantAuthorizationError) throw error;
    const loadError = classifyCoverageFailure(error);
    logActionTiming(503, { reason: logReadFailureReason(error, loadError) });
    return { candidates: [], loadError };
  }
  });
}

export async function promoteProbeToLeadHarvestAction(
  runId: string,
  selector: TenantSessionSelector = {},
): Promise<
  | { runId: string; unitCount: number; selectedCellCount: number; categories: string[]; promotedFromRunId: string; estimate: DiscoverySizeEstimate }
  | { error: string; estimate?: DiscoverySizeEstimate }
> {
  const tenantSession = await requireTenantPermission(selector, "workspace:read");
  const actor = await requirePermission("crawl:manage");
  if (actor.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }

  return runWithTenantContext(tenantSession, `crawl-promote:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      await ensureDbReady();
      const crawlScope = {
        tenantId: tenantSession.tenantId,
        workspaceId: tenantSession.workspaceId,
      };
      const run = await getSelectedOrDefaultVisibleCrawlRun(runId, crawlScope);
      if (!run) {
        throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
      }
      await assertTenantCrawlRun(db, tenantSession, run);
      if (run.status !== "done") {
        return { error: "Only a completed coverage probe can be promoted to lead harvest." };
      }

      const selection = run.selection_json ?? {};
      const sourceMode = normalizeDiscoveryMode(selection.discoveryMode, "lead_harvest");
      if (sourceMode !== "coverage_probe") {
        return { error: "Only coverage probe discovery items can be promoted. This item is already a lead harvest or does not have probe metadata." };
      }

      const marketId = typeof selection.marketId === "string" && selection.marketId.trim()
        ? selection.marketId.trim()
        : run.market_id;
      const rawCellIds = Array.isArray(selection.cellIds) ? selection.cellIds.map((value) => String(value)) : [];
      const rawCategories = Array.isArray(selection.categories) ? selection.categories.map((value) => String(value)) : run.categories;
      const cellIds = normalizeDistinct(rawCellIds);
      const categories = normalizeDistinct(rawCategories);
      if (!marketId || cellIds.length === 0 || categories.length === 0) {
        return { error: "This probe does not have enough market/cell/category metadata to promote safely. Start a new lead harvest manually." };
      }

      const processing = await getProcessingCrawlRun(crawlScope);
      if (processing) {
        return { error: "A discovery item is already processing. Let it finish or pause it before promoting this probe." };
      }

      const result = await startCrawlRunAction({
        marketId,
        cellIds,
        categories,
        discoveryMode: "lead_harvest",
        paginationPolicy: normalizePaginationPolicy(selection.paginationPolicy, "auto_yield_based"),
        promotedFromRunId: run.id,
      }, crawlScope);

      if ("error" in result && result.error) {
        return { error: result.error, estimate: result.estimate };
      }
      if (!result.runId) {
        return { error: "Lead harvest was not created. Try again from the completed probe." };
      }

      const createdRunId = result.runId;
      const createdUnitCount = result.unitCount ?? 0;
      const createdSelectedCellCount = result.selectedCellCount ?? cellIds.length;

      await createAuditLog("coverage_probe_promoted_to_lead_harvest", "crawl_run", createdRunId, {
        promotedFromRunId: run.id,
        marketId,
        cellIds,
        categories,
      });

      return {
        runId: createdRunId,
        unitCount: createdUnitCount,
        selectedCellCount: createdSelectedCellCount,
        categories,
        promotedFromRunId: run.id,
        estimate: result.estimate,
      };
    }));
}

function schedulerSettingKey(workerName: SchedulerWorkerName) {
  if (workerName === "ai_verification") return "scheduler_ai_verification_enabled" as const;
  if (workerName === "crawl") return "scheduler_crawl_enabled" as const;
  if (workerName === "enrichment") return "scheduler_enrichment_enabled" as const;
  if (workerName === "artifact") return "scheduler_artifact_enabled" as const;
  return "scheduler_score_recompute_enabled" as const;
}

export async function getFailedUnitErrorsAction(
  runId?: string,
  selector: TenantSessionSelector = {},
) {
  return withCrawlWorkspacePermission(selector, "source:review", "coverage.failed-units.read", async (session, db) => {
    await ensureDbReady();
    const scope = { tenantId: session.tenantId, workspaceId: session.workspaceId };
    const candidate = await getSelectedOrDefaultVisibleCrawlRun(runId, scope);
    if (!candidate) return [];
    const run = await assertTenantCrawlRun(db, session, candidate);
    return getFailedUnitErrors(run.id);
  });
}

export async function getCrawlProgressAction() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = await getSelectedOrDefaultVisibleCrawlRun();
  if (!run) return null;
  return { runId: run.id, status: run.status, ...(await getCrawlProgress(run.id)) };
}
