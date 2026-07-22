"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HelpTip } from "@/components/help-tip";
import { LocationScopePicker, type LocationScopeValue } from "@/components/location-scope-picker";
import {
  startCrawlRunAction,
  estimateDiscoveryRunAction,
  pauseCrawlRunAction,
  resumeCrawlRunAction,
  stopCrawlRunAction,
  retryFailedUnitsAction,
  getDiscoveryItemsAction,
  getDashboardAnalyticsAction,
  getDashboardStatsAction,
  getDashboardSummaryPanelsAction,
} from "@/lib/crawl/actions";
import { queueMissingAiVerificationsAction } from "@/lib/leads/actions";
import type {
  AdminFulfillmentSummary,
  ConversionMetrics,
  DiscoveryItemSummary,
  LaunchReadinessSummary,
  StatisticsSummary,
  TeamBoardSummary,
} from "@/lib/db/queries";
import type { DashboardStatsResult } from "@/lib/dashboard-fallbacks";
import type { DiscoverySizeEstimate, DiscoveryMode, PaginationPolicy } from "@/lib/discovery-sizing";
import { getStatusToneStyle, type StatusTone } from "@/lib/status-tone";

const CATEGORY_OPTIONS = [
  "dentist", "lawyer", "hvac", "plumber", "electrician", "roofing",
  "auto_repair", "veterinarian", "chiropractor", "med_spa", "salon",
  "restaurant", "landscaping", "real_estate", "insurance", "accounting",
  "contractor", "cleaning", "pest_control", "gym",
];

const CATEGORY_PRESETS = [
  { label: "Dentists", categories: ["dentist"] },
  { label: "Auto repair", categories: ["auto_repair"] },
  { label: "Contractors", categories: ["contractor", "hvac", "plumber", "electrician", "roofing"] },
];

function DiscoveryMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="mt-1 font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function formatDiscoveryItemLabel(item: DiscoveryItemSummary): string {
  const created = formatDateTime(item.createdAt);
  const units = item.totalUnits === 1 ? "1 unit" : `${item.totalUnits} units`;
  return `${item.name} · ${created} · ${units} · ${item.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}`;
}

function formatDiscoveryMode(mode: DiscoveryItemSummary["discoveryMode"]): string {
  if (mode === "coverage_probe") return "coverage probe";
  if (mode === "lead_harvest") return "lead harvest";
  return "legacy discovery";
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDiscoveryModeLabel(mode: DiscoveryMode): string {
  return mode === "coverage_probe" ? "Coverage probe" : "Lead harvest";
}

function formatPaginationPolicyLabel(policy: PaginationPolicy): string {
  if (policy === "first_page_only") return "First page only";
  if (policy === "manual_extra_pages") return "Always fetch up to 3 pages";
  return "Auto if yield is strong";
}

function formatCapSourceLabel(source: DiscoverySizeEstimate["capSource"]): string {
  if (source === "test_run") return "test run cap";
  if (source === "text_search_monthly") return "Text Search monthly cap";
  if (source === "enterprise_monthly") return "Enterprise monthly cap";
  return "external quota";
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "under 1 min";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function DiscoveryStatusBadge({ status }: { status: string }) {
  const style = getStatusToneStyle(discoveryStatusTone(status));
  return (
    <span className="rounded-full border px-2.5 py-1 text-xs font-medium capitalize" style={style}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function discoveryStatusTone(status: string): StatusTone {
  if (status === "running" || status === "queued") return "info";
  if (status === "paused") return "warning";
  if (status === "done") return "success";
  if (status === "error" || status === "failed") return "danger";
  return "muted";
}

type DashboardCoreStatus = "loadingCore" | "ready" | "degraded" | "error";
type DashboardPanelStatus = "loading" | "ready" | "error";

function dashboardLoadReasonLabel(reason: string | null): string | null {
  if (reason === "db_statement_timeout") return "Database reads timed out before dashboard stats loaded.";
  if (reason === "transient_db_error") return "The database connection was temporarily unavailable.";
  if (reason === "dashboard_stats_unavailable") return "Dashboard stats are temporarily unavailable.";
  return null;
}

function panelLoadReasonLabel(reason: string | undefined, fallback: string): string {
  if (reason === "db_statement_timeout") return "This panel is taking too long. Retry this panel.";
  if (reason === "transient_db_error") return "The database connection was temporarily unavailable. Retry this panel.";
  if (reason === "discovery_items_unavailable") return "Discovery items are temporarily unavailable. Retry this panel.";
  if (reason === "summary_panels_unavailable") return "Optional dashboard panels are temporarily unavailable. Retry this panel.";
  if (reason === "dashboard_stats_unavailable") return "Dashboard analytics are temporarily unavailable. Retry this panel.";
  return fallback;
}

export function DashboardClient({
  initialStats,
  teamSummary,
  weeklyStats,
  fulfillmentSummary,
}: {
  initialStats: DashboardStatsResult;
  teamSummary: TeamBoardSummary;
  weeklyStats: StatisticsSummary;
  fulfillmentSummary: AdminFulfillmentSummary;
}) {
  const [stats, setStats] = useState<DashboardStatsResult>(initialStats);
  const [currentTeamSummary, setCurrentTeamSummary] = useState(teamSummary);
  const [currentWeeklyStats, setCurrentWeeklyStats] = useState(weeklyStats);
  const [currentFulfillmentSummary, setCurrentFulfillmentSummary] = useState(fulfillmentSummary);
  const [summaryPanelStatus, setSummaryPanelStatus] = useState<DashboardPanelStatus>("loading");
  const [summaryPanelError, setSummaryPanelError] = useState<string | null>(null);
  const [analyticsPanelStatus, setAnalyticsPanelStatus] = useState<DashboardPanelStatus>("loading");
  const [analyticsPanelError, setAnalyticsPanelError] = useState<string | null>(null);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryItemSummary[]>(initialStats.discoveryItems);
  const [discoveryItemsStatus, setDiscoveryItemsStatus] = useState<DashboardPanelStatus>("loading");
  const [discoveryItemsError, setDiscoveryItemsError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [locationScope, setLocationScope] = useState<LocationScopeValue>({ state: "CO", counties: [], zipCodes: [] });
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>(initialStats.googleDiscoveryDefaults.discoveryMode);
  const [paginationPolicy, setPaginationPolicy] = useState<PaginationPolicy>(initialStats.googleDiscoveryDefaults.paginationPolicy);
  const [testRun, setTestRun] = useState(false);
  const [locationPickerResetKey, setLocationPickerResetKey] = useState(0);
  const [sizeEstimate, setSizeEstimate] = useState<DiscoverySizeEstimate | null>(null);
  const [sizeEstimateStatus, setSizeEstimateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sizeEstimateError, setSizeEstimateError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(stats.processingRunStatus === "running");
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => Promise<void> } | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null);
  const enrichRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAiVerifying, setIsAiVerifying] = useState(false);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [aiBackfillLoading, setAiBackfillLoading] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const aiRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coreAutoRetryRef = useRef(false);
  const analyticsAutoRetryRef = useRef(false);
  const summaryAutoRetryRef = useRef(false);
  const [coreRetryNonce, setCoreRetryNonce] = useState(0);
  const [analyticsRetryNonce, setAnalyticsRetryNonce] = useState(0);
  const [summaryRetryNonce, setSummaryRetryNonce] = useState(0);
  const [coreStatus, setCoreStatus] = useState<DashboardCoreStatus>("loadingCore");
  const [coreError, setCoreError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin Command Center | NoSite Leads";
  }, []);

  const loadCoreStats = useCallback(async () => {
    setCoreStatus("loadingCore");
    setCoreError(null);
    const timeout = window.setTimeout(() => {
      setCoreStatus("degraded");
      setCoreError("This panel is taking too long. Retry this panel.");
    }, 10_000);
    try {
      const s = await getDashboardStatsAction();
      window.clearTimeout(timeout);
      setStats(s);
      setIsProcessing(s.processingRunStatus === "running");
      if (s.discoveryItems.length > 0) setDiscoveryItems(s.discoveryItems);
      const loadReason = dashboardLoadReasonLabel(s.lastError);
      if (loadReason) {
        setCoreStatus("degraded");
        setCoreError(loadReason);
        if (!coreAutoRetryRef.current) {
          coreAutoRetryRef.current = true;
          window.setTimeout(() => setCoreRetryNonce((value) => value + 1), 1_000);
        }
      } else {
        coreAutoRetryRef.current = false;
        setCoreStatus("ready");
        setCoreError(null);
      }
      setPollError(null);
    } catch (error) {
      window.clearTimeout(timeout);
      setCoreStatus("error");
      setCoreError(error instanceof Error ? error.message : "Dashboard stats could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCoreStats(), 0);
    return () => window.clearTimeout(timer);
  }, [coreRetryNonce, loadCoreStats]);

  const loadAnalyticsPanel = useCallback(async () => {
    setAnalyticsPanelStatus("loading");
    setAnalyticsPanelError(null);
    const timeout = window.setTimeout(() => {
      setAnalyticsPanelStatus("error");
      setAnalyticsPanelError("This panel is taking too long. Retry this panel.");
    }, 10_000);
    try {
      const result = await getDashboardAnalyticsAction();
      window.clearTimeout(timeout);
      const { loadError, ...analytics } = result;
      if (loadError) {
        setAnalyticsPanelStatus("error");
        setAnalyticsPanelError(panelLoadReasonLabel(loadError, "Dashboard analytics are temporarily unavailable. Retry this panel."));
        if (!analyticsAutoRetryRef.current) {
          analyticsAutoRetryRef.current = true;
          window.setTimeout(() => setAnalyticsRetryNonce((value) => value + 1), 1_000);
        }
        return;
      }
      setStats((current) => ({ ...current, ...analytics }));
      analyticsAutoRetryRef.current = false;
      setAnalyticsPanelStatus("ready");
      setAnalyticsPanelError(null);
    } catch (error) {
      window.clearTimeout(timeout);
      setAnalyticsPanelStatus("error");
      setAnalyticsPanelError(error instanceof Error ? error.message : "Dashboard analytics could not be loaded.");
    }
  }, []);

  const loadSummaryPanels = useCallback(async () => {
    setSummaryPanelStatus("loading");
    setSummaryPanelError(null);
    const timeout = window.setTimeout(() => {
      setSummaryPanelError("This panel is taking too long. Retry this panel.");
      setSummaryPanelStatus("error");
    }, 10_000);
    try {
      const result = await getDashboardSummaryPanelsAction();
      window.clearTimeout(timeout);
      setCurrentTeamSummary(result.teamSummary);
      setCurrentWeeklyStats(result.weeklyStats);
      setCurrentFulfillmentSummary(result.fulfillmentSummary);
      if (result.loadError) {
        setSummaryPanelError(panelLoadReasonLabel(result.loadError, "Optional dashboard panels unavailable. Retry this panel."));
        setSummaryPanelStatus("error");
        if (!summaryAutoRetryRef.current) {
          summaryAutoRetryRef.current = true;
          window.setTimeout(() => setSummaryRetryNonce((value) => value + 1), 1_000);
        }
      } else {
        summaryAutoRetryRef.current = false;
        setSummaryPanelError(null);
        setSummaryPanelStatus("ready");
      }
    } catch (error) {
      window.clearTimeout(timeout);
      setSummaryPanelError(error instanceof Error ? error.message : "Optional dashboard panels could not be loaded.");
      setSummaryPanelStatus("error");
    }
  }, []);

  const loadDiscoveryItems = useCallback(async () => {
    setDiscoveryItemsStatus("loading");
    setDiscoveryItemsError(null);
    const timeout = window.setTimeout(() => {
      setDiscoveryItemsStatus("error");
      setDiscoveryItemsError("This panel is taking too long. Retry this panel.");
    }, 10_000);
    try {
      const result = await getDiscoveryItemsAction();
      window.clearTimeout(timeout);
      setDiscoveryItems(result.items);
      if (result.loadError) {
        setDiscoveryItemsStatus("error");
        setDiscoveryItemsError(panelLoadReasonLabel(result.loadError, "Discovery items are temporarily unavailable. Retry this panel."));
      } else {
        setDiscoveryItemsStatus("ready");
        setDiscoveryItemsError(null);
      }
    } catch (error) {
      window.clearTimeout(timeout);
      setDiscoveryItemsStatus("error");
      setDiscoveryItemsError(error instanceof Error ? error.message : "Discovery items could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (coreStatus === "loadingCore") return;
    const analyticsTimer = window.setTimeout(() => void loadAnalyticsPanel(), 0);
    const summaryTimer = window.setTimeout(() => void loadSummaryPanels(), 250);
    const discoveryItemsTimer = window.setTimeout(() => void loadDiscoveryItems(), 500);
    return () => {
      window.clearTimeout(analyticsTimer);
      window.clearTimeout(summaryTimer);
      window.clearTimeout(discoveryItemsTimer);
    };
  }, [coreStatus, loadAnalyticsPanel, loadDiscoveryItems, loadSummaryPanels]);

  useEffect(() => {
    if (analyticsRetryNonce === 0) return;
    const timer = window.setTimeout(() => void loadAnalyticsPanel(), 0);
    return () => window.clearTimeout(timer);
  }, [analyticsRetryNonce, loadAnalyticsPanel]);

  useEffect(() => {
    if (summaryRetryNonce === 0) return;
    const timer = window.setTimeout(() => void loadSummaryPanels(), 0);
    return () => window.clearTimeout(timer);
  }, [summaryRetryNonce, loadSummaryPanels]);

  const refreshStats = useCallback(async () => {
    try {
      const s = await getDashboardStatsAction();
      setStats(s);
      const loadReason = dashboardLoadReasonLabel(s.lastError);
      setCoreStatus(loadReason ? "degraded" : "ready");
      setCoreError(loadReason);
      setPollError(null);
      if (s.processingRunStatus !== "running") {
        setIsProcessing(false);
      }
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Dashboard stats could not be refreshed.");
    }
  }, []);

  const pollProcess = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/process-next", { method: "POST" });
      const data = await res.json();

      if (data.status === "processed") {
        toast.info(`Processed ${data.zip} / ${data.category}: ${data.leadsFound} leads`);
      } else if (data.status === "done") {
        toast.success("Crawl run completed!");
        setIsProcessing(false);
      } else if (data.status === "error") {
        toast.error(`Error: ${data.error}`);
      } else if (data.status === "idle" || data.status === "paused") {
        setIsProcessing(false);
      }

      await refreshStats();
      setPollError(null);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Discovery worker polling failed.");
    }
  }, [refreshStats]);

  useEffect(() => {
    if (isProcessing) {
      pollingRef.current = setInterval(pollProcess, 3000);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [isProcessing, pollProcess]);

  const buildDiscoveryPayload = useCallback(() => (
    locationScope.marketId && locationScope.cellIds?.length
      ? {
          marketId: locationScope.marketId,
          cellIds: locationScope.cellIds,
          categories: selectedCategories,
          discoveryMode,
          paginationPolicy,
          testRun,
        }
      : {
          state: locationScope.state,
          counties: locationScope.counties,
          zipCodes: locationScope.zipCodes,
          categories: selectedCategories,
          discoveryMode,
          paginationPolicy,
          testRun,
        }
  ), [discoveryMode, locationScope, paginationPolicy, selectedCategories, testRun]);

  useEffect(() => {
    const selectedCells = locationScope.cellIds?.length ?? locationScope.zipCodes.length;
    if (selectedCells === 0 || selectedCategories.length === 0) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setSizeEstimateStatus("loading");
      setSizeEstimateError(null);
      estimateDiscoveryRunAction(buildDiscoveryPayload())
        .then((result) => {
          if (!active) return;
          if ("error" in result) {
            setSizeEstimate(null);
            setSizeEstimateError(result.error);
            setSizeEstimateStatus("error");
          } else {
            setSizeEstimate(result);
            setSizeEstimateStatus("ready");
          }
        })
        .catch((error) => {
          if (!active) return;
          setSizeEstimate(null);
          setSizeEstimateError(error instanceof Error ? error.message : "Unable to estimate discovery size.");
          setSizeEstimateStatus("error");
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [buildDiscoveryPayload, locationScope.cellIds?.length, locationScope.zipCodes.length, selectedCategories.length]);

  const handleStart = async () => {
    setLoading(true);
    const result = await startCrawlRunAction(buildDiscoveryPayload());
    if ("error" in result) {
      toast.error(result.error ?? "Unknown error");
    } else {
      toast.success(
        `Started crawl: ${result.unitCount} units across ${result.selectedCellCount} location cells`
      );
      setIsProcessing(true);
    }
    await refreshStats();
    setLoading(false);
  };

  const handlePause = async (runId?: string | null) => {
    setLoading(true);
    const result = await pauseCrawlRunAction(runId ?? undefined);
    if ("error" in result) toast.error(result.error ?? "Unable to pause discovery item");
    else toast.info("Discovery item paused");
    setIsProcessing(false);
    await refreshStats();
    setLoading(false);
  };

  const handleResume = async (runId?: string | null) => {
    setLoading(true);
    const result = await resumeCrawlRunAction(runId ?? undefined);
    if ("error" in result) {
      toast.error(result.error ?? "Unable to resume discovery item");
    } else {
      setIsProcessing(true);
      toast.info("Discovery item resumed");
    }
    await refreshStats();
    setLoading(false);
  };

  const handleStop = async (runId?: string | null) => {
    setLoading(true);
    const result = await stopCrawlRunAction(runId ?? undefined);
    if ("error" in result) {
      toast.error(result.error ?? "Unable to cancel remaining units");
    } else {
      setIsProcessing(false);
      toast.success(`Remaining discovery units canceled. ${result.canceledUnits} queued units canceled.`);
    }
    await refreshStats();
    setLoading(false);
  };

  const handleRetry = async (runId?: string | null) => {
    setLoading(true);
    const result = await retryFailedUnitsAction(runId ?? undefined);
    if ("error" in result) {
      toast.error(result.error ?? "Unknown error");
    } else {
      toast.success(`Retrying ${result.retriedCount} failed units`);
    }
    await refreshStats();
    setLoading(false);
  };

  const pollEnrichment = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/enrich-next", { method: "POST" });
      const data = await res.json();

      if (data.status === "enriched") {
        setEnrichProgress(`Enriched: ${data.leadName}`);
        toast.info(`Enriched: ${data.leadName}`);
      } else if (data.status === "idle") {
        toast.success("Enrichment complete — all top leads enriched");
        setIsEnriching(false);
      } else if (data.status === "error") {
        toast.error(`Enrichment error: ${data.error}`);
      }
      await refreshStats();
      setPollError(null);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Enrichment worker polling failed.");
    }
  }, [refreshStats]);

  useEffect(() => {
    if (isEnriching) {
      enrichRef.current = setInterval(pollEnrichment, 2000);
      return () => { if (enrichRef.current) clearInterval(enrichRef.current); };
    } else {
      if (enrichRef.current) clearInterval(enrichRef.current);
    }
  }, [isEnriching, pollEnrichment]);

  const handleEnrich = async () => {
    setIsEnriching(true);
    setEnrichProgress(null);
  };

  const pollAiVerification = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/verify-next", { method: "POST" });
      const data = await res.json();

      if (data.status === "verified") {
        setAiProgress(`${data.leadName}${data.cached ? " (cached)" : ""}`);
        toast.info(`AI verified: ${data.leadName}`);
      } else if (data.status === "idle" || data.status === "disabled") {
        setIsAiVerifying(false);
      } else if (data.status === "error") {
        toast.error(`AI verification error: ${data.error}`);
      }
      await refreshStats();
      setPollError(null);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "AI verification polling failed.");
    }
  }, [refreshStats]);

  useEffect(() => {
    if (isAiVerifying) {
      aiRef.current = setInterval(pollAiVerification, 2500);
      return () => { if (aiRef.current) clearInterval(aiRef.current); };
    } else {
      if (aiRef.current) clearInterval(aiRef.current);
    }
  }, [isAiVerifying, pollAiVerification]);

  const handleAiVerify = async () => {
    setIsAiVerifying(true);
    setAiProgress(null);
  };

  const handleQueueMissingAi = async () => {
    setAiBackfillLoading(true);
    const result = await queueMissingAiVerificationsAction();
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`Queued ${result.queued} missing AI verifications. ${result.skippedFresh} already fresh.`);
      await refreshStats();
    }
    setAiBackfillLoading(false);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const isRunning = stats.processingRunStatus === "running";
  const isQueued = stats.processingRunStatus === "queued";
  const isIdle = !isRunning && !isQueued;
  const activeRunLabel = isRunning ? "running" : isQueued ? "queued" : "idle";
  const visibleRun = discoveryItems.find((item) => item.id === stats.runId) ?? null;
  const pausedDiscoveryItems = discoveryItems.filter((item) => item.status === "paused");
  const selectedCellCount = locationScope.cellIds?.length ?? locationScope.zipCodes.length;
  const selectedMarketLabel = locationScope.marketLabel ?? (locationScope.countryCode
    ? `${locationScope.countryCode}${locationScope.marketId ? ` · ${locationScope.marketId}` : ""}`
    : locationScope.marketId || locationScope.state || "No country");
  const selectedCellLabels = locationScope.cellLabels ?? [];
  const selectedCellSummary = selectedCellLabels.length > 0
    ? selectedCellLabels.slice(0, 3).join(", ") + (selectedCellLabels.length > 3 ? ` +${selectedCellLabels.length - 3} more` : "")
    : selectedCellCount > 0 ? `${selectedCellCount} selected` : "No cells selected";
  const selectedCategorySummary = selectedCategories.length > 0
    ? selectedCategories.map(formatCategoryLabel).slice(0, 4).join(", ") + (selectedCategories.length > 4 ? ` +${selectedCategories.length - 4} more` : "")
    : "No categories selected";
  const estimatedUnitCount = selectedCellCount * selectedCategories.length;
  const hasEstimateSelection = selectedCellCount > 0 && selectedCategories.length > 0;
  const activeSizeEstimate = hasEstimateSelection ? sizeEstimate : null;
  const activeSizeEstimateStatus = hasEstimateSelection ? sizeEstimateStatus : "idle";
  const activeSizeEstimateError = hasEstimateSelection ? sizeEstimateError : null;
  const startDisabled = coreStatus !== "ready"
    || loading
    || selectedCategories.length === 0
    || selectedCellCount === 0
    || activeSizeEstimateStatus !== "ready"
    || activeSizeEstimate?.canStart !== true;
  const progress = stats.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const activeWorkerCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled).length;
  const pausedWorkerCount = stats.schedulerHealth.workers.length - activeWorkerCount;
  const backgroundQueueDepth = stats.schedulerHealth.workers.reduce((sum, worker) => sum + worker.queueDepth, 0);
  const workerIssueCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled && worker.warning).length;
  const contactsThisWeek = currentTeamSummary.members.reduce((sum, member) => sum + member.contacts_7d, 0);
  const claimedActive = currentTeamSummary.members.reduce((sum, member) => sum + member.claimed_active, 0);
  const startConfirmationMessage = activeSizeEstimate
    ? `Area: ${selectedMarketLabel}. Cells: ${selectedCellSummary}. Categories: ${selectedCategorySummary}. ${activeSizeEstimate.estimatedSearchCalls.toLocaleString()} max Google calls, ${activeSizeEstimate.estimatedMaxRawPlaces.toLocaleString()} max raw places, ${formatCurrencyPrecise(activeSizeEstimate.estimatedMarginalCostUsd)} estimated marginal cost, ${formatDuration(activeSizeEstimate.estimatedDurationSeconds)} estimated runtime. Cap: ${activeSizeEstimate.remainingMonthlyCallCap === null ? "external quota" : `${activeSizeEstimate.remainingMonthlyCallCap.toLocaleString()} calls remaining under ${formatCapSourceLabel(activeSizeEstimate.capSource)}`}.`
    : "Select cells and categories, then wait for the run scope estimate before starting discovery.";
  const startDisabledReasons = [
    ...(coreStatus !== "ready" ? ["Admin controls are still loading."] : []),
    ...(selectedCategories.length === 0 ? ["Choose at least one category, such as Dentists."] : []),
    ...(selectedCellCount === 0 ? ["Choose at least one postal/postcode cell."] : []),
    ...(hasEstimateSelection && activeSizeEstimateStatus !== "ready" ? ["Wait for the run scope estimate to finish."] : []),
    ...(activeSizeEstimate?.blockingReasons ?? []),
  ];
  const openStartConfirmation = () => setConfirmAction({
    title: "Start discovery run?",
    message: startConfirmationMessage,
    action: handleStart,
  });
  const applyTestRunPreset = () => {
    setLocationScope({
      state: "CO",
      counties: [],
      zipCodes: [],
      countryCode: "US",
      marketId: "market-colorado",
      marketLabel: "Colorado, CO",
      cellIds: ["cell-us-co-80202"],
      cellLabels: ["Denver CO 80202"],
    });
    setSelectedCategories(["dentist"]);
    setDiscoveryMode("coverage_probe");
    setPaginationPolicy("auto_yield_based");
    setTestRun(true);
    setLocationPickerResetKey((value) => value + 1);
  };

  return (
    <PageShell
      title="Admin Command Center"
      description="Start discovery, inspect inventory, and clear researcher requests from one focused workspace."
      stats={[
        { label: "Leads", value: String(stats.leadsTotal), hint: `+${stats.leadsToday} today` },
        { label: "Discovery", value: isRunning ? "Running" : isQueued ? "Queued" : "Idle", hint: progress ? `${pct}% complete` : `${discoveryItems.length} items` },
        { label: "Unclaimed Ready", value: String(currentTeamSummary.unassignedReady) },
        { label: "Steve Queue", value: String(currentFulfillmentSummary.openTotal), hint: "website + quote" },
      ]}
    >
      {coreStatus !== "ready" && (
        <section className="rounded-2xl px-5 py-4" style={{ background: coreStatus === "loadingCore" ? "var(--surface-muted)" : "var(--warning-bg)", border: `1px solid ${coreStatus === "loadingCore" ? "var(--surface-card-border)" : "var(--warning-border)"}` }}>
          <p className="text-xs font-semibold" style={{ color: coreStatus === "loadingCore" ? "var(--text-primary)" : "var(--warning-text)" }}>
            {coreStatus === "loadingCore" ? "Loading admin controls" : "Core admin data needs attention"}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {coreStatus === "loadingCore" ? "Discovery controls will unlock as soon as core stats load." : coreError ?? "This panel is taking too long. Retry this panel."}
          </p>
          {coreStatus !== "loadingCore" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-sm" onClick={loadCoreStats}>Retry core data</button>
              <Link href="/coverage" className="btn-glass text-sm">Open Monitor</Link>
              <Link href="/explore" className="btn-glass text-sm">Open Explore</Link>
            </div>
          )}
        </section>
      )}

      {(summaryPanelStatus === "error" || analyticsPanelStatus === "error") && (
        <section className="rounded-2xl border px-5 py-4" style={getStatusToneStyle("warning")}>
          <p className="text-xs font-semibold">Secondary panels are partially unavailable</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {summaryPanelError ?? analyticsPanelError ?? "Team, analytics, or discovery history did not finish loading."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summaryPanelStatus === "error" && <button type="button" className="btn-glass text-xs" onClick={loadSummaryPanels}>Retry team panels</button>}
            {analyticsPanelStatus === "error" && <button type="button" className="btn-glass text-xs" onClick={loadAnalyticsPanel}>Retry analytics</button>}
          </div>
        </section>
      )}

      {stats.lastError && (
        <section className="rounded-2xl border px-5 py-4" role="alert" style={getStatusToneStyle("danger")}>
          <p className="text-xs font-medium">Latest discovery error</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{stats.lastError}</p>
        </section>
      )}

      {stats.launchReadiness.totalCount > 0 && (
        <LaunchReadinessPanel summary={stats.launchReadiness} />
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-2xl p-5">
          <h3 className="section-label">Lead Inventory</h3>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>{stats.leadsTotal.toLocaleString()}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {currentTeamSummary.unassignedReady} ready and unclaimed. {claimedActive} currently claimed by the team.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Pipeline this week: {formatCurrency(currentWeeklyStats.economics.pipelineValue)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/explore" className="btn-primary text-sm">Find leads</Link>
            <Link href="/leads" className="btn-glass text-sm">All leads</Link>
            <Link href="/leads?assigned=me" className="btn-glass text-sm">My leads</Link>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="section-label">Discovery</h3>
              <p className="mt-2 text-3xl font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{activeRunLabel}</p>
            </div>
            <DiscoveryStatusBadge status={isRunning ? "running" : isQueued ? "queued" : "idle"} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {selectedCellCount > 0 ? `${selectedCellCount} cells` : "No cells selected"} · {selectedCategories.length} categories · {activeSizeEstimate?.estimatedSearchCalls ?? "select cells"} calls
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="#discovery" className="btn-primary text-sm">Configure run</a>
            <Link href="/coverage" className="btn-glass text-sm">Monitor</Link>
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h3 className="section-label">Fulfillment</h3>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>{currentFulfillmentSummary.openTotal}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {currentFulfillmentSummary.openWebsiteRequests} website requests and {currentFulfillmentSummary.openQuoteRequests} quote requests.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/fulfillment" className="btn-primary text-sm">Open queue</Link>
            <Link href="/team" className="btn-glass text-sm">Team view</Link>
          </div>
        </section>
      </section>

      <section id="discovery" className="glass scroll-mt-24 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="section-label">Start Discovery</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Pick a country, enter a ZIP/postal/postcode when you have one, then run either a cheap coverage probe or a lead harvest that creates active leads.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/coverage" className="btn-glass text-sm">Open Monitor</Link>
            <Link href="/scheduler" className="btn-glass text-sm">Workers</Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isIdle && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={openStartConfirmation}
                disabled={startDisabled}
                title={startDisabledReasons.length > 0 ? startDisabledReasons.join(" ") : "Start discovery"}
              >
                Start Discovery
              </button>
              <button type="button" className="btn-glass" onClick={applyTestRunPreset} disabled={loading}>
                Denver dentist preset
              </button>
              <HelpTip>Coverage probes measure market yield without creating active leads. Lead harvest creates active leads with richer Google fields.</HelpTip>
            </>
          )}
          {isRunning && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Pause Discovery",
              message: "This will stop processing new market/cell/category units. You can resume the run later.",
              action: handlePause,
            })} disabled={loading}>
              Pause Discovery
            </button>
          )}
          {isQueued && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Pause Discovery",
              message: "This will pause the queued discovery run before more work is processed.",
              action: handlePause,
            })} disabled={loading}>
              Pause Discovery
            </button>
          )}
          {(isRunning || isQueued) && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Cancel remaining units",
              message: "This marks the processing item's unprocessed market/cell/category units as canceled. Completed leads stay saved.",
              action: () => handleStop(stats.processingRunId),
            })} disabled={loading}>
              Cancel remaining units
            </button>
          )}
          {stats.failedUnits > 0 && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Retry Failed Units",
              message: `This will retry ${stats.failedUnits} failed crawl units. API calls will be consumed.`,
              action: () => handleRetry(stats.runId),
            })} disabled={loading}>
              Retry Failed ({stats.failedUnits})
            </button>
          )}
        </div>

        {isIdle && startDisabledReasons.length > 0 && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs"
            style={{
              background: "var(--warning-bg)",
              border: "1px solid var(--warning-border)",
              color: "var(--warning-text)",
            }}
          >
            <span className="font-semibold">Discovery is waiting for:</span>
            {startDisabledReasons.slice(0, 3).map((reason) => (
              <span key={reason} className="rounded-full px-2 py-1" style={{ background: "var(--surface-card)" }}>
                {reason}
              </span>
            ))}
          </div>
        )}

        {isIdle && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_0.9fr_0.9fr]">
            <label className="rounded-xl p-3 text-xs" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}>
              <span className="mb-1 block font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Discovery mode</span>
              <select className="glass-input w-full" value={discoveryMode} onChange={(event) => setDiscoveryMode(event.target.value as DiscoveryMode)} disabled={loading}>
                <option value="coverage_probe">Coverage probe - preview</option>
                <option value="lead_harvest">Lead harvest - creates leads</option>
              </select>
            </label>
            <label className="rounded-xl p-3 text-xs" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}>
              <span className="mb-1 block font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Pagination</span>
              <select className="glass-input w-full" value={paginationPolicy} onChange={(event) => setPaginationPolicy(event.target.value as PaginationPolicy)} disabled={loading}>
                <option value="first_page_only">First page only</option>
                <option value="auto_yield_based">Auto if yield is strong</option>
                <option value="manual_extra_pages">Always fetch up to 3 pages</option>
              </select>
            </label>
            <label className="rounded-xl p-3 text-xs" style={{ background: testRun ? "var(--success-bg)" : "var(--surface-muted)", border: `1px solid ${testRun ? "var(--success-border)" : "var(--surface-card-border)"}`, color: "var(--text-secondary)" }}>
              <span className="mb-2 block font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Safety</span>
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={testRun} disabled={loading} onChange={(event) => setTestRun(event.target.checked)} />
                Test capped run
              </span>
              <span className="mt-2 block leading-5" style={{ color: "var(--text-tertiary)" }}>
                Uses the smaller test-run cap before the monthly Google cap.
              </span>
            </label>
          </div>
        )}

        {!isIdle && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--warning-text)" }}>
              A discovery item is {activeRunLabel}. Pause, cancel remaining units, or finish it before starting another Google-consuming run.
            </p>
          </div>
        )}

        {isIdle && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="mr-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Categories</p>
              {CATEGORY_PRESETS.map((preset) => (
                <button key={preset.label} type="button" className="btn-glass text-xs" onClick={() => setSelectedCategories(preset.categories)}>
                  {preset.label}
                </button>
              ))}
              <button type="button" className="btn-glass text-xs" onClick={() => setSelectedCategories([])}>
                Clear
              </button>
              <button type="button" className="btn-glass text-xs" onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])}>
                All categories
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {selectedCategories.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
                  style={{
                    background: selectedCategories.includes(cat) ? "var(--accent)" : "var(--surface-card)",
                    color: selectedCategories.includes(cat) ? "var(--text-on-accent)" : "var(--text-secondary)",
                    border: `1px solid ${selectedCategories.includes(cat) ? "var(--accent)" : "var(--surface-card-border)"}`,
                  }}
                >
                  {formatCategoryLabel(cat)}
                </button>
              ))}
            </div>
          </div>
        )}

        <LocationScopePicker
          key={locationPickerResetKey}
          value={locationScope}
          categories={selectedCategories}
          disabled={loading || !isIdle}
          onChange={setLocationScope}
        />
        <RunScopePanel
          estimate={activeSizeEstimate}
          status={activeSizeEstimateStatus}
          error={activeSizeEstimateError}
          selectedMarketLabel={selectedMarketLabel}
          selectedCellSummary={selectedCellSummary}
          selectedCellCount={selectedCellCount}
          selectedCategorySummary={selectedCategorySummary}
          selectedCategoryCount={selectedCategories.length}
          estimatedUnitCount={estimatedUnitCount}
          discoveryMode={discoveryMode}
          paginationPolicy={paginationPolicy}
          testRun={testRun}
        />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <SummaryChip label={`Area: ${selectedMarketLabel}`} />
          <SummaryChip label={`Cells: ${selectedCellCount}`} />
          <SummaryChip label={`Categories: ${selectedCategories.length}`} />
          <SummaryChip label={`Estimated units: ${estimatedUnitCount}`} />
          <SummaryChip label={`Mode: ${formatDiscoveryModeLabel(discoveryMode)}`} />
          <SummaryChip label={`Pagination: ${formatPaginationPolicyLabel(paginationPolicy)}`} />
          <SummaryChip label={`Google calls: ${activeSizeEstimate?.estimatedSearchCalls.toLocaleString() ?? "select cells"}`} />
        </div>

        {progress && progress.total > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-4">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--status-muted-bg)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{pct}%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span>{progress.done} done / {progress.failed} failed / {progress.canceled} canceled / {progress.pending + progress.running} remaining of {progress.total} total</span>
              {stats.apiCallsUsed > 0 && <span>Run API: {stats.apiCallsUsed} calls</span>}
            </div>
          </div>
        )}

        {isProcessing && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Discovery is processing market/cell/category units... polling every 3 seconds.
          </p>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">Recent Discovery Items</h3>
            <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-secondary)" }}>
              Saved market/cell/category runs. Coverage probes can store candidates without creating active leads.
            </p>
          </div>
          <Link href="/coverage" className="btn-glass text-sm">Open full monitor</Link>
        </div>
        {!isRunning && !isQueued && pausedDiscoveryItems.length > 0 && (
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--success-text)" }}>
              Paused items are preserved. Starting a new probe creates a separate discovery item.
            </p>
          </div>
        )}
        {discoveryItemsStatus === "loading" && discoveryItems.length === 0 ? (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
            Loading discovery items...
          </p>
        ) : discoveryItemsStatus === "error" && discoveryItems.length === 0 ? (
          <div className="mt-4 rounded-xl border p-4 text-sm" style={getStatusToneStyle("warning")}>
            <p className="font-semibold">Discovery items unavailable</p>
            <p className="mt-1">{discoveryItemsError ?? "This panel did not finish loading. Core dashboard controls remain available."}</p>
            <button type="button" className="btn-glass mt-3 text-xs" onClick={loadDiscoveryItems}>Retry items</button>
          </div>
        ) : discoveryItems.length === 0 ? (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
            No discovery items exist yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {discoveryItems.slice(0, 4).map((item) => (
              <DiscoveryItemCard
                key={item.id}
                item={item}
                isActive={item.id === visibleRun?.id}
                loading={loading}
                onPause={() => setConfirmAction({
                  title: "Pause discovery item",
                  message: "This preserves the discovery item and stops processing new units until it is resumed.",
                  action: () => handlePause(item.id),
                })}
                onResume={() => handleResume(item.id)}
                onRetry={() => setConfirmAction({
                  title: "Retry failed units",
                  message: `This will retry ${item.failedUnits} failed units for this discovery item. API calls may be consumed.`,
                  action: () => handleRetry(item.id),
                })}
                onCancel={() => setConfirmAction({
                  title: "Cancel remaining units",
                  message: "This marks this item's unprocessed units as canceled. Completed leads and discovery history stay saved.",
                  action: () => handleStop(item.id),
                })}
              />
            ))}
          </div>
        )}
      </section>

      <details>
        <summary className="glass flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <div>
            <h3 className="section-label">Team and Activity</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Follow-up pressure, recent outreach, and researcher ownership. {contactsThisWeek} contacts logged this week.
            </p>
          </div>
          <span className="btn-glass text-sm">Open team detail</span>
        </summary>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <section className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-label">Today needs attention</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Workload before more discovery.</p>
              </div>
              <Link href="/queue" className="btn-primary text-sm">Open Workbench</Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AttentionCard label="Overdue follow-ups" value={currentTeamSummary.overdueFollowUps} href="/team" cta="Review owners" />
              <AttentionCard label="Unclaimed ready leads" value={currentTeamSummary.unassignedReady} href="/leads?assigned=unassigned" cta="Assign or claim" />
              <AttentionCard label="Needs follow-up" value={stats.needsFollowUp} href="/leads?status=contacted" cta="Open leads" />
              <AttentionCard label="Claimed active" value={claimedActive} href="/team" cta="Team board" />
            </div>
          </section>

          <section className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-label">Latest activity</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Recent outreach and operational updates logged by the team.</p>
              </div>
              <Link href="/team" className="btn-glass text-sm">Open Team Board</Link>
            </div>
            <div className="mt-4 space-y-3">
              {currentTeamSummary.latestActivity.length === 0 ? (
                <p className="rounded-xl p-4 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
                  No activity has been logged yet.
                </p>
              ) : currentTeamSummary.latestActivity.slice(0, 5).map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          </section>
        </div>

        <section className="glass mt-5 rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="section-label">Team performance</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Ownership, follow-ups, contacts, meetings, and closes by person.</p>
            </div>
            <Link href="/team" className="btn-glass text-sm">Open full board</Link>
          </div>
          {currentTeamSummary.members.length === 0 ? (
            <p className="rounded-xl p-4 text-sm" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
              No active team members yet.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {currentTeamSummary.members.map((member) => (
                <TeamMemberCard key={member.user_id} member={member} />
              ))}
            </div>
          )}
        </section>
      </details>

      <details>
        <summary className="glass flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <div>
            <h3 className="section-label">Advanced Operations</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Scheduler, AI queue, enrichment, and conversion metrics.
            </p>
          </div>
          <span className="btn-glass text-sm">Open advanced tools</span>
        </summary>
        <div className="mt-5 space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="section-label">Background Work</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Scheduler controls, worker explanations, usage counts, backlog counts, and recent run history live in the Scheduler operations center.
                </p>
              </div>
              <Link href="/scheduler" className="btn-primary text-sm">Open Scheduler</Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Workers On" value={`${activeWorkerCount} / ${stats.schedulerHealth.workers.length}`} sub={pausedWorkerCount > 0 ? `${pausedWorkerCount} paused` : "all active"} />
              <MetricCard label="Background Queue" value={backgroundQueueDepth.toLocaleString()} sub="all worker backlogs" />
              <MetricCard label="Worker Issues" value={String(workerIssueCount)} sub={workerIssueCount > 0 ? "needs review" : "none blocking"} />
              <MetricCard label="AI Queue" value={String(stats.aiQueueStats.queued + stats.aiQueueStats.running)} sub={`${stats.aiQueueStats.verified} verified`} />
            </div>
          </section>

          {pollError && (
            <section className="rounded-2xl px-5 py-4" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--warning-text)" }}>Polling needs attention</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{pollError}</p>
              <Link href="/scheduler" className="link-accent mt-2 inline-block text-sm">Open Scheduler</Link>
            </section>
          )}

          {isIdle && stats.leadsTotal > 0 && (
            <section className="glass rounded-2xl p-6">
              <h3 className="section-label">Lead Enrichment</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Enrich top leads with detailed reviews, website health checks, and competitive analysis.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary text-sm" title="Process the enrichment backlog one lead at a time while this page polls the worker." onClick={handleEnrich} disabled={loading || isEnriching}>
                  {isEnriching ? "Enriching..." : "Enrich Top Leads"}
                </button>
                {isEnriching && <button type="button" className="btn-glass text-sm" title="Stop this browser from polling. It does not cancel server-side worker jobs." onClick={() => setIsEnriching(false)}>Stop Local Polling</button>}
                {enrichProgress && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last: {enrichProgress}</span>}
              </div>
            </section>
          )}

          <section className="glass rounded-2xl p-6">
            <h3 className="section-label">AI Verification Queue</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard label="Queued" value={String(stats.aiQueueStats.queued)} />
              <MetricCard label="Running" value={String(stats.aiQueueStats.running)} />
              <MetricCard label="Verified" value={String(stats.aiQueueStats.verified)} />
              <MetricCard label="Errors" value={String(stats.aiQueueStats.error)} />
              <MetricCard label="Not Sent to AI" value={String(stats.aiQueueStats.notChecked)} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary text-sm" title="Process queued AI verification jobs now while this page polls for progress." onClick={handleAiVerify} disabled={loading || isAiVerifying || stats.aiQueueStats.queued === 0}>
                {isAiVerifying ? "Verifying..." : "Process AI Queue"}
              </button>
              {isAiVerifying && <button type="button" className="btn-glass text-sm" title="Stop this browser from polling. It does not cancel server-side AI jobs." onClick={() => setIsAiVerifying(false)}>Stop Local Polling</button>}
              <button type="button" className="btn-glass text-sm" title="Put leads with no AI result into the AI queue. They will show as Waiting for AI until processed." onClick={handleQueueMissingAi} disabled={loading || aiBackfillLoading || stats.aiQueueStats.notChecked === 0}>
                {aiBackfillLoading ? "Queueing..." : "Queue Missing AI Verifications"}
              </button>
              {aiProgress && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last: {aiProgress}</span>}
            </div>
          </section>

          {stats.monthlyApiCalls > 0 && (
            <section className="glass rounded-2xl p-6">
              <h3 className="section-label">API Usage</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Monthly Calls" value={String(stats.monthlyApiCalls)} />
                <MetricCard label="Discovery Calls" value={String(stats.discoveryApiCalls)} />
                <MetricCard label="Enrichment Calls" value={String(stats.enrichmentApiCalls)} />
                <MetricCard label="Atmosphere Calls" value={String(stats.atmosphereEnrichmentCalls)} />
              </div>
              <div className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Google/OpenAI billing is handled outside the app; this panel only shows operational usage volume.
              </div>
            </section>
          )}

          {(stats.conversionMetrics.totalContacted > 0 || stats.qualifiedLeadCount > 0) && (
            <ConversionPanel metrics={stats.conversionMetrics} qualifiedLeadCount={stats.qualifiedLeadCount} />
          )}
        </div>
      </details>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        onConfirm={async () => {
          if (confirmAction) await confirmAction.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </PageShell>
  );
}

function AttentionCard({ label, value, href, cta }: { label: string; value: number; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl p-4 transition-transform hover:-translate-y-0.5"
      style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <span className="mt-2 inline-block text-xs font-medium" style={{ color: "var(--accent)" }}>{cta}</span>
    </Link>
  );
}

function DiscoveryItemCard({
  item,
  isActive,
  loading,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  item: DiscoveryItemSummary;
  isActive: boolean;
  loading: boolean;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const itemCanPause = item.status === "running" || item.status === "queued";
  const itemCanResume = item.status === "paused";
  const itemCanCancel = item.status === "running" || item.status === "queued" || item.status === "paused";
  const itemPct = item.totalUnits > 0 ? Math.round((item.doneUnits / item.totalUnits) * 100) : 0;

  return (
    <article
      className="rounded-2xl p-4"
      style={{ background: isActive ? "var(--accent-light)" : "var(--surface-muted)", border: `1px solid ${isActive ? "var(--accent-glow)" : "var(--surface-card-border)"}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatDiscoveryItemLabel(item)}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {item.scopeLabel} · Run {item.id.slice(0, 8)} · {formatDiscoveryMode(item.discoveryMode)} · {item.categories.length} categories
          </p>
        </div>
        <DiscoveryStatusBadge status={item.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <DiscoveryMiniMetric label="Done" value={`${item.doneUnits}/${item.totalUnits}`} />
        <DiscoveryMiniMetric label="Open" value={String(item.openUnits + item.runningUnits)} />
        <DiscoveryMiniMetric label="Failed" value={String(item.failedUnits)} />
        <DiscoveryMiniMetric label={item.discoveryMode === "coverage_probe" ? "Candidates" : "Leads"} value={String(item.discoveryMode === "coverage_probe" ? item.newPlacesSeen : item.discoveredCount)} />
        <DiscoveryMiniMetric label="API calls" value={String(item.apiCallsUsed)} />
        <DiscoveryMiniMetric label="Complete" value={`${itemPct}%`} />
      </div>
      {item.discoveryMode === "coverage_probe" && item.rawPlacesSeen > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Probe stored {item.rawPlacesSeen} raw candidates across {item.pagesFetched} page{item.pagesFetched === 1 ? "" : "s"}; it intentionally created 0 active leads.
        </p>
      )}
      {item.lastError && <p className="mt-3 rounded-xl border px-3 py-2 text-xs" role="alert" style={getStatusToneStyle("danger")}>{item.lastError}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/coverage?run=${encodeURIComponent(item.id)}`} className="btn-glass text-xs">Inspect</Link>
        {itemCanPause && <button type="button" className="btn-glass text-xs" disabled={loading} onClick={onPause}>Pause</button>}
        {itemCanResume && <button type="button" className="btn-primary text-xs" disabled={loading} onClick={onResume}>Resume</button>}
        {item.failedUnits > 0 && <button type="button" className="btn-glass text-xs" disabled={loading} onClick={onRetry}>Retry failed</button>}
        {itemCanCancel && <button type="button" className="btn-glass text-xs" disabled={loading} onClick={onCancel}>Cancel remaining</button>}
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Created {formatDateTime(item.createdAt)}</span>
      </div>
    </article>
  );
}

function RunScopePanel({
  estimate,
  status,
  error,
  selectedMarketLabel,
  selectedCellSummary,
  selectedCellCount,
  selectedCategorySummary,
  selectedCategoryCount,
  estimatedUnitCount,
  discoveryMode,
  paginationPolicy,
  testRun,
}: {
  estimate: DiscoverySizeEstimate | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selectedMarketLabel: string;
  selectedCellSummary: string;
  selectedCellCount: number;
  selectedCategorySummary: string;
  selectedCategoryCount: number;
  estimatedUnitCount: number;
  discoveryMode: DiscoveryMode;
  paginationPolicy: PaginationPolicy;
  testRun: boolean;
}) {
  const blocked = estimate?.canStart === false;
  return (
    <section
      className="mt-4 rounded-xl p-4"
      style={{
        background: blocked ? "var(--danger-bg)" : "var(--surface-muted)",
        border: `1px solid ${blocked ? "var(--danger-border)" : "var(--surface-card-border)"}`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-label">Run scope</h3>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-secondary)" }}>
            {selectedMarketLabel} · {selectedCellSummary} · {selectedCategorySummary}
          </p>
        </div>
        <DiscoveryStatusBadge status={blocked ? "error" : status === "ready" ? "ready" : status} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DiscoveryMiniMetric label="Cells" value={selectedCellCount.toLocaleString()} />
        <DiscoveryMiniMetric label="Categories" value={selectedCategoryCount.toLocaleString()} />
        <DiscoveryMiniMetric label="Units" value={estimatedUnitCount.toLocaleString()} />
        <DiscoveryMiniMetric label="Mode" value={formatDiscoveryModeLabel(discoveryMode)} />
        <DiscoveryMiniMetric label="Pagination" value={formatPaginationPolicyLabel(paginationPolicy)} />
        <DiscoveryMiniMetric label="Test capped" value={testRun ? "On" : "Off"} />
        <DiscoveryMiniMetric label="Max calls" value={estimate ? estimate.estimatedSearchCalls.toLocaleString() : "select scope"} />
        <DiscoveryMiniMetric label="Max raw places" value={estimate ? estimate.estimatedMaxRawPlaces.toLocaleString() : "select scope"} />
        <DiscoveryMiniMetric label="Search radius" value={estimate ? `${estimate.searchRadiusKm} km` : "select scope"} />
        <DiscoveryMiniMetric label="Duration" value={estimate ? formatDuration(estimate.estimatedDurationSeconds) : "select scope"} />
        <DiscoveryMiniMetric label="Estimated cost" value={estimate ? formatCurrencyPrecise(estimate.estimatedMarginalCostUsd) : "select scope"} />
        <DiscoveryMiniMetric
          label="Cap remaining"
          value={estimate
            ? estimate.remainingMonthlyCallCap === null
              ? formatCapSourceLabel(estimate.capSource)
              : `${estimate.remainingMonthlyCallCap.toLocaleString()} calls`
            : "select scope"}
        />
      </div>

      {status === "idle" && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Select at least one postal cell and one category to preview Google calls, cost, cap, radius, and duration.
        </p>
      )}
      {status === "loading" && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>Estimating run scope...</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger-text)" }}>{error ?? "Unable to estimate discovery size."}</p>
      )}
      {estimate && (
        <div className="mt-3 space-y-1 text-xs">
          <p style={{ color: "var(--text-tertiary)" }}>
            SKU: {estimate.sku.replace(/_/g, " ")} · Cap source: {formatCapSourceLabel(estimate.capSource)} · Current month for SKU: {estimate.monthlyBillableEventsForSku.toLocaleString()} billable calls.
          </p>
          {estimate.blockingReasons.map((reason) => (
            <p key={reason} className="font-medium" style={{ color: "var(--danger-text)" }}>{reason}</p>
          ))}
          {estimate.warnings.map((warning) => (
            <p key={warning} style={{ color: "var(--warning-text)" }}>{warning}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamMemberCard({ member }: { member: TeamBoardSummary["members"][number] }) {
  return (
    <article
      className="rounded-xl p-4"
      style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}
    >
      <Link className="link-accent break-words font-semibold" href={`/leads?owner=${encodeURIComponent(member.user_id)}`}>
        {member.display_name || member.email}
      </Link>
      <p className="mt-1 text-xs uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{member.role}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <TeamMetric label="Claimed" value={member.claimed_active} />
        <TeamMetric label="Due today" value={member.due_today} />
        <TeamMetric label="Activity today" value={member.activity_today} />
        <TeamMetric label="Contacts today" value={member.contacts_today} />
        <TeamMetric label="Steve queue" value={member.fulfillment_open} />
        <TeamMetric label="Web / Quote" value={`${member.website_requests_open} / ${member.quote_requests_open}`} />
        <TeamMetric label="Stale" value={member.stale_claimed} />
        <TeamMetric label="Contacts 7d" value={member.contacts_7d} />
        <TeamMetric label="Meetings" value={member.meetings} />
        <TeamMetric label="Won / Lost" value={`${member.closed_won} / ${member.closed_lost}`} />
      </div>
    </article>
  );
}

function TeamMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-muted)" }}>
      <span className="text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function ActivityRow({ activity }: { activity: TeamBoardSummary["latestActivity"][number] }) {
  return (
    <article
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {activity.lead_id ? (
          <Link className="link-accent break-words font-medium" href={`/leads/${activity.lead_id}`} prefetch={false}>
            {activity.lead_name ?? "Unknown lead"}
          </Link>
        ) : (
          <p className="break-words font-medium" style={{ color: "var(--text-primary)" }}>
            {activity.lead_name ?? activityTitle(activity)}
          </p>
        )}
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {formatDateTime(activity.created_at)}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {activity.actor_email ?? "Someone"} {activityVerb(activity)}.
      </p>
      {activity.note && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>{activity.note}</p>
      )}
      {!activity.note && activity.summary && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>{activity.summary}</p>
      )}
    </article>
  );
}

function ConversionPanel({ metrics, qualifiedLeadCount }: {
  metrics: ConversionMetrics;
  qualifiedLeadCount: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="glass rounded-2xl p-6">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <h3 className="section-label">Conversion Metrics</h3>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{open ? "Collapse" : "Expand"}</span>
      </button>
      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Qualified Leads" value={String(qualifiedLeadCount)} sub="score >= 5.0" />
          {metrics.totalContacted > 0 && (
            <>
              <MetricCard label="Contacted" value={String(metrics.totalContacted)} />
              <MetricCard label="Replies" value={String(metrics.totalReplies)} sub={`${metrics.replyRate}% rate`} />
              <MetricCard label="Meetings" value={String(metrics.totalMeetings)} sub={`${metrics.meetingRate}% rate`} />
              {metrics.medianHoursToContact !== null && (
                <MetricCard label="Median Hrs to Contact" value={String(metrics.medianHoursToContact)} sub="hours from discovery" />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-0.5 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
      {sub && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

function LaunchReadinessPanel({ summary }: { summary: LaunchReadinessSummary }) {
  const pct = summary.totalCount > 0 ? Math.round((summary.readyCount / summary.totalCount) * 100) : 0;
  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="section-label">Launch checklist</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Invite-only public posture: trust pages can be public, app access stays admin-invited.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>{summary.readyCount} / {summary.totalCount}</p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pct}% ready · {summary.blockers} open</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {summary.items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-xl px-3 py-3 transition hover:-translate-y-0.5"
            style={{ background: item.ready ? "var(--success-bg)" : "var(--warning-bg)", border: `1px solid ${item.ready ? "var(--success-border)" : "var(--warning-border)"}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</p>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-muted)", color: item.ready ? "var(--success-text)" : "var(--warning-text)" }}>
                {item.ready ? "Ready" : "Open"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{item.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SummaryChip({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-1"
      style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}
    >
      {label}
    </span>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyPrecise(value: number): string {
  const maximumFractionDigits = value > 0 && value < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatOutcome(outcome: string): string {
  return outcome.replace(/_/g, " ");
}

function activityTitle(activity: TeamBoardSummary["latestActivity"][number]): string {
  if (activity.activity_type === "admin_request") return "Admin request";
  if (activity.activity_type === "note") return "Lead note";
  return formatOutcome(activity.action || activity.outcome || "Activity");
}

function activityVerb(activity: TeamBoardSummary["latestActivity"][number]): string {
  if (activity.activity_type === "outreach") {
    return `logged ${channelLabel(activity.channel)} as ${formatOutcome(activity.outcome)}`;
  }
  if (activity.activity_type === "note") return "added a note";
  if (activity.activity_type === "admin_request") {
    return `created a ${formatOutcome(activity.channel)} (${formatOutcome(activity.outcome)})`;
  }
  return `recorded ${formatOutcome(activity.action || activity.outcome || "activity")}`;
}

function channelLabel(channel: string): string {
  return channel === "walkin" ? "in person" : channel;
}
