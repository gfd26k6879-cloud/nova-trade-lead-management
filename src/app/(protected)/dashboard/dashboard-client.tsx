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
import type { AdminFulfillmentSummary, StatisticsSummary, TeamBoardSummary } from "@/lib/db/queries";
import type { DiscoveryBudgetEstimate, DiscoveryMode, PaginationPolicy } from "@/lib/discovery-budget";

const CATEGORY_OPTIONS = [
  "dentist", "lawyer", "hvac", "plumber", "electrician", "roofing",
  "auto_repair", "veterinarian", "chiropractor", "med_spa", "salon",
  "restaurant", "landscaping", "real_estate", "insurance", "accounting",
  "contractor", "cleaning", "pest_control", "gym",
];

interface ConversionMetrics {
  totalContacted: number;
  totalReplies: number;
  totalMeetings: number;
  replyRate: number;
  meetingRate: number;
  medianHoursToContact: number | null;
}

function DiscoveryMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.45)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="mt-1 font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function formatDiscoveryItemLabel(item: DiscoveryItem): string {
  const created = formatDateTime(item.createdAt);
  const units = item.totalUnits === 1 ? "1 unit" : `${item.totalUnits} units`;
  return `${item.name} · ${created} · ${units} · ${item.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}`;
}

function formatDiscoveryMode(mode: DiscoveryItem["discoveryMode"]): string {
  if (mode === "coverage_probe") return "coverage probe";
  if (mode === "lead_harvest") return "lead harvest";
  return "legacy discovery";
}

function DiscoveryStatusBadge({ status }: { status: string }) {
  const color = discoveryStatusColor(status);
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-medium capitalize" style={{ background: color.background, color: color.color }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function discoveryStatusColor(status: string) {
  if (status === "running" || status === "queued") return { background: "rgba(37,99,235,0.1)", color: "#1d4ed8" };
  if (status === "paused") return { background: "rgba(245,158,11,0.12)", color: "#92400e" };
  if (status === "done") return { background: "rgba(22,101,52,0.1)", color: "#166534" };
  if (status === "error" || status === "failed") return { background: "rgba(239,68,68,0.1)", color: "#991b1b" };
  if (status === "canceled") return { background: "rgba(100,116,139,0.14)", color: "#475569" };
  return { background: "rgba(100,116,139,0.12)", color: "#475569" };
}

interface AiQueueStats {
  notChecked: number;
  queued: number;
  running: number;
  verified: number;
  error: number;
  total: number;
}

interface WorkerRun {
  status: string;
  trigger_source: string;
  http_status: number | null;
  result_json?: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

type SchedulerWorkerName = "ai_verification" | "crawl" | "enrichment" | "artifact" | "score_recompute";

interface SchedulerWorkerHealth {
  workerName: SchedulerWorkerName;
  label: string;
  enabled: boolean;
  queueDepth: number;
  estimatedMinutesToDrain: number | null;
  lastRun: WorkerRun | null;
  errors24h: number;
  processed24h: number;
  progress: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    canceled: number;
  };
  warning: string | null;
}

interface SchedulerHealth {
  workers: SchedulerWorkerHealth[];
  ai: {
    dailyCost: number;
    dailyBudget: number;
    monthlyCost: number;
    monthlyBudget: number;
    budgetRemainingToday: number;
    budgetRemainingMonth: number;
    verifiedLeadsPerDollar: number | null;
    readyToCallLeadsPerDollar: number | null;
  };
}

interface DashboardStats {
  runStatus: string;
  runId: string | null;
  processingRunStatus: string;
  processingRunId: string | null;
  discoveryItems: DiscoveryItem[];
  leadsTotal: number;
  leadsToday: number;
  failedUnits: number;
  progress: { total: number; done: number; failed: number; pending: number; running: number; canceled: number } | null;
  todayFocus: number;
  needsFollowUp: number;
  conversionMetrics: ConversionMetrics;
  apiCallsUsed: number;
  estimatedCost: number;
  discoveryApiCalls: number;
  discoveryEstimatedCost: number;
  enrichmentApiCalls: number;
  enrichmentEstimatedCost: number;
  atmosphereEnrichmentCalls: number;
  atmosphereEstimatedCost: number;
  monthlyApiCalls: number;
  monthlyApiCost: number;
  projectedMonthlyCost: number;
  lastError: string | null;
  qualifiedLeadCount: number;
  costPerQualifiedLead: number | null;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
  activeZipCount: number;
  countiesSelected: number;
  countiesCompleted: number;
  aiQueueStats: AiQueueStats;
  schedulerHealth: SchedulerHealth;
  googleDiscoveryDefaults: {
    discoveryMode: DiscoveryMode;
    paginationPolicy: PaginationPolicy;
    testRunCallCap: number;
  };
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

interface DiscoveryItem {
  id: string;
  name: string;
  scopeLabel: string;
  status: string;
  mode: string;
  discoveryMode: "coverage_probe" | "lead_harvest" | null;
  marketId: string | null;
  marketName: string | null;
  countryCode: string | null;
  categories: string[];
  discoveredCount: number;
  errorCount: number;
  apiCallsUsed: number;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  totalUnits: number;
  doneUnits: number;
  failedUnits: number;
  openUnits: number;
  runningUnits: number;
  canceledUnits: number;
  pagesFetched: number;
  rawPlacesSeen: number;
  newPlacesSeen: number;
  duplicatePlacesSeen: number;
}

export function DashboardClient({
  initialStats,
  teamSummary,
  weeklyStats,
  fulfillmentSummary,
}: {
  initialStats: DashboardStats;
  teamSummary: TeamBoardSummary;
  weeklyStats: StatisticsSummary;
  fulfillmentSummary: AdminFulfillmentSummary;
}) {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [currentTeamSummary, setCurrentTeamSummary] = useState(teamSummary);
  const [currentWeeklyStats, setCurrentWeeklyStats] = useState(weeklyStats);
  const [currentFulfillmentSummary, setCurrentFulfillmentSummary] = useState(fulfillmentSummary);
  const [summaryPanelStatus, setSummaryPanelStatus] = useState<DashboardPanelStatus>("loading");
  const [summaryPanelError, setSummaryPanelError] = useState<string | null>(null);
  const [analyticsPanelStatus, setAnalyticsPanelStatus] = useState<DashboardPanelStatus>("loading");
  const [analyticsPanelError, setAnalyticsPanelError] = useState<string | null>(null);
  const [discoveryItems, setDiscoveryItems] = useState<DiscoveryItem[]>(initialStats.discoveryItems);
  const [discoveryItemsStatus, setDiscoveryItemsStatus] = useState<DashboardPanelStatus>("loading");
  const [discoveryItemsError, setDiscoveryItemsError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [locationScope, setLocationScope] = useState<LocationScopeValue>({ state: "CO", counties: [], zipCodes: [] });
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>(initialStats.googleDiscoveryDefaults.discoveryMode);
  const [paginationPolicy, setPaginationPolicy] = useState<PaginationPolicy>(initialStats.googleDiscoveryDefaults.paginationPolicy);
  const [isTestRun, setIsTestRun] = useState(false);
  const [budgetEstimate, setBudgetEstimate] = useState<DiscoveryBudgetEstimate | null>(null);
  const [budgetEstimateStatus, setBudgetEstimateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [budgetEstimateError, setBudgetEstimateError] = useState<string | null>(null);
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
      } else if (data.status === "budget_limit") {
        toast.warning(data.error || "Budget limit reached — run paused");
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
          testRun: isTestRun,
        }
      : {
          state: locationScope.state,
          counties: locationScope.counties,
          zipCodes: locationScope.zipCodes,
          categories: selectedCategories,
          discoveryMode,
          paginationPolicy,
          testRun: isTestRun,
        }
  ), [discoveryMode, isTestRun, locationScope, paginationPolicy, selectedCategories]);

  useEffect(() => {
    const selectedCells = locationScope.cellIds?.length ?? locationScope.zipCodes.length;
    if (selectedCells === 0 || selectedCategories.length === 0) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setBudgetEstimateStatus("loading");
      setBudgetEstimateError(null);
      estimateDiscoveryRunAction(buildDiscoveryPayload())
        .then((result) => {
          if (!active) return;
          if ("error" in result) {
            setBudgetEstimate(null);
            setBudgetEstimateError(result.error);
            setBudgetEstimateStatus("error");
          } else {
            setBudgetEstimate(result);
            setBudgetEstimateStatus("ready");
          }
        })
        .catch((error) => {
          if (!active) return;
          setBudgetEstimate(null);
          setBudgetEstimateError(error instanceof Error ? error.message : "Unable to estimate Google Places usage.");
          setBudgetEstimateStatus("error");
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

  const [showCategories, setShowCategories] = useState(false);

  const pollEnrichment = useCallback(async () => {
    try {
      const res = await fetch("/api/crawl/enrich-next", { method: "POST" });
      const data = await res.json();

      if (data.status === "enriched") {
        setEnrichProgress(`Enriched: ${data.leadName}`);
        toast.info(`Enriched: ${data.leadName}`);
      } else if (data.status === "budget_limit") {
        toast.warning(data.error || "Enrichment paused by budget guardrail");
        setIsEnriching(false);
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
      } else if (data.status === "budget_limit") {
        toast.warning(data.error || "AI verification paused by budget guardrail");
        setIsAiVerifying(false);
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
  const selectedMarketLabel = locationScope.marketId || locationScope.state || "No market";
  const estimatedUnitCount = selectedCellCount * selectedCategories.length;
  const hasEstimateSelection = selectedCellCount > 0 && selectedCategories.length > 0;
  const activeBudgetEstimate = hasEstimateSelection ? budgetEstimate : null;
  const activeBudgetEstimateStatus = hasEstimateSelection ? budgetEstimateStatus : "idle";
  const activeBudgetEstimateError = hasEstimateSelection ? budgetEstimateError : null;
  const startDisabled = coreStatus !== "ready"
    || loading
    || selectedCategories.length === 0
    || selectedCellCount === 0
    || activeBudgetEstimateStatus === "loading"
    || !activeBudgetEstimate?.canStart;
  const progress = stats.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const activeWorkerCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled).length;
  const pausedWorkerCount = stats.schedulerHealth.workers.length - activeWorkerCount;
  const backgroundQueueDepth = stats.schedulerHealth.workers.reduce((sum, worker) => sum + worker.queueDepth, 0);
  const workerIssueCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled && worker.warning).length;
  const contactsThisWeek = currentTeamSummary.members.reduce((sum, member) => sum + member.contacts_7d, 0);
  const claimedActive = currentTeamSummary.members.reduce((sum, member) => sum + member.claimed_active, 0);
  const openStartConfirmation = () => setConfirmAction({
    title: "Start discovery run?",
    message: `Market: ${selectedMarketLabel}. Cells selected: ${selectedCellCount}. Categories selected: ${selectedCategories.length}. Estimated crawl units: ${estimatedUnitCount}. Google calls: ${activeBudgetEstimate?.estimatedSearchCalls ?? "unknown"} max. Mode: ${discoveryMode.replace(/_/g, " ")}.`,
    action: handleStart,
  });
  const applyTestRunPreset = () => {
    setLocationScope({
      state: "CO",
      counties: [],
      zipCodes: [],
      marketId: "market-colorado",
      cellIds: ["cell-us-co-80202"],
    });
    setSelectedCategories(["dentist"]);
    setDiscoveryMode("coverage_probe");
    setPaginationPolicy("auto_yield_based");
    setIsTestRun(true);
    setShowCategories(true);
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
        <section className="rounded-2xl px-5 py-4" style={{ background: coreStatus === "loadingCore" ? "rgba(255,255,255,0.38)" : "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(255,255,255,0.5)" }}>
          <p className="text-xs font-semibold" style={{ color: coreStatus === "loadingCore" ? "var(--text-primary)" : "#b45309" }}>
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
        <section className="rounded-2xl px-5 py-4" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
          <p className="text-xs font-semibold" style={{ color: "#92400e" }}>Secondary panels are partially unavailable</p>
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
        <section className="rounded-2xl px-5 py-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-xs font-medium" style={{ color: "#991b1b" }}>Latest discovery error</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{stats.lastError}</p>
        </section>
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
            {selectedCellCount > 0 ? `${selectedCellCount} cells` : "No cells selected"} · {selectedCategories.length} categories · {activeBudgetEstimate?.estimatedSearchCalls ?? "select cells"} calls
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
              Pick a market, choose location cells, and run either a cheap coverage probe or a lead harvest that creates active leads.
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
              <button type="button" className="btn-primary" onClick={openStartConfirmation} disabled={startDisabled}>
                Start Discovery
              </button>
              <button type="button" className="btn-glass" onClick={applyTestRunPreset} disabled={loading}>
                Use test run preset
              </button>
              <button
                type="button"
                className="text-xs font-medium underline underline-offset-2"
                style={{ color: "var(--accent)" }}
                onClick={() => setShowCategories((o) => !o)}
              >
                {showCategories ? "Hide categories" : "Choose categories"}
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

        {isIdle && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_0.9fr_0.7fr_1.4fr]">
            <label className="rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
              <span className="mb-1 block font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Discovery mode</span>
              <select className="glass-input w-full" value={discoveryMode} onChange={(event) => setDiscoveryMode(event.target.value as DiscoveryMode)} disabled={loading}>
                <option value="coverage_probe">Coverage probe - cheaper</option>
                <option value="lead_harvest">Lead harvest - creates leads</option>
              </select>
            </label>
            <label className="rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
              <span className="mb-1 block font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Pagination</span>
              <select className="glass-input w-full" value={paginationPolicy} onChange={(event) => setPaginationPolicy(event.target.value as PaginationPolicy)} disabled={loading}>
                <option value="auto_yield_based">Auto yield-based</option>
                <option value="first_page_only">First page only</option>
                <option value="manual_extra_pages">Manual extra pages</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={isTestRun} onChange={(event) => setIsTestRun(event.target.checked)} disabled={loading} />
              Test-run cap
            </label>
            <div className="rounded-xl p-3 text-xs" style={{ background: activeBudgetEstimate?.canStart === false ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
              <p className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Google call estimate</p>
              {activeBudgetEstimateStatus === "idle" && <p className="mt-1">Select cells and categories to estimate cost before starting.</p>}
              {activeBudgetEstimateStatus === "loading" && <p className="mt-1">Estimating...</p>}
              {activeBudgetEstimateStatus === "error" && <p className="mt-1 text-red-700">{activeBudgetEstimateError ?? "Unable to estimate."}</p>}
              {activeBudgetEstimate && (
                <div className="mt-1 space-y-1">
                  <p><strong>{activeBudgetEstimate.estimatedSearchCalls}</strong> max calls · up to {activeBudgetEstimate.estimatedMaxRawPlaces} raw places</p>
                  <p>{activeBudgetEstimate.sku.replace(/_/g, " ")} · monthly remaining {activeBudgetEstimate.monthlyRemaining === null ? "unlimited" : activeBudgetEstimate.monthlyRemaining}</p>
                  <p>Run remaining {activeBudgetEstimate.runRemaining} · daily remaining {activeBudgetEstimate.dailyRemaining}</p>
                  {discoveryMode === "coverage_probe" && <p>Probe mode records candidates but does not add active leads.</p>}
                  {discoveryMode === "lead_harvest" && <p>Lead harvest creates active leads and uses richer Google fields.</p>}
                  {activeBudgetEstimate.warnings.map((warning) => <p key={warning} className="text-red-700">{warning}</p>)}
                </div>
              )}
            </div>
          </div>
        )}

        {!isIdle && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
            <p className="text-sm font-semibold" style={{ color: "#92400e" }}>
              A discovery item is {activeRunLabel}. Pause, cancel remaining units, or finish it before starting another Google-consuming run.
            </p>
          </div>
        )}

        {isIdle && showCategories && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)" }}>
            <div className="mb-3 flex items-center gap-3">
              <button type="button" className="text-xs font-medium" style={{ color: "var(--accent)" }} onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])}>
                Select All
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>|</span>
              <button type="button" className="text-xs font-medium" style={{ color: "var(--accent)" }} onClick={() => setSelectedCategories([])}>
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
                  style={{
                    background: selectedCategories.includes(cat) ? "var(--accent)" : "rgba(255,255,255,0.4)",
                    color: selectedCategories.includes(cat) ? "white" : "var(--text-secondary)",
                    border: `1px solid ${selectedCategories.includes(cat) ? "var(--accent)" : "rgba(255,255,255,0.5)"}`,
                  }}
                >
                  {cat.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        <LocationScopePicker
          value={locationScope}
          categories={selectedCategories}
          disabled={loading || !isIdle}
          onChange={setLocationScope}
        />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <SummaryChip label={`Market: ${selectedMarketLabel}`} />
          <SummaryChip label={`Cells: ${selectedCellCount}`} />
          <SummaryChip label={`Categories: ${selectedCategories.length}`} />
          <SummaryChip label={`Estimated units: ${estimatedUnitCount}`} />
          <SummaryChip label={`Mode: ${discoveryMode.replace(/_/g, " ")}`} />
          <SummaryChip label={`Google calls: ${activeBudgetEstimate?.estimatedSearchCalls ?? "select cells"}`} />
        </div>

        {progress && progress.total > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-4">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{pct}%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span>{progress.done} done / {progress.failed} failed / {progress.canceled} canceled / {progress.pending + progress.running} remaining of {progress.total} total</span>
              {stats.apiCallsUsed > 0 && <span>Run API: {stats.apiCallsUsed} calls | ${stats.estimatedCost.toFixed(2)}</span>}
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
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "rgba(22,101,52,0.08)", border: "1px solid rgba(22,101,52,0.14)" }}>
            <p className="text-sm font-semibold" style={{ color: "#166534" }}>
              Paused items are preserved. Starting a new probe creates a separate discovery item.
            </p>
          </div>
        )}
        {discoveryItemsStatus === "loading" && discoveryItems.length === 0 ? (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
            Loading discovery items...
          </p>
        ) : discoveryItemsStatus === "error" && discoveryItems.length === 0 ? (
          <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#92400e" }}>
            <p className="font-semibold">Discovery items unavailable</p>
            <p className="mt-1">{discoveryItemsError ?? "This panel did not finish loading. Core dashboard controls remain available."}</p>
            <button type="button" className="btn-glass mt-3 text-xs" onClick={loadDiscoveryItems}>Retry items</button>
          </div>
        ) : discoveryItems.length === 0 ? (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
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
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Recent outreach logged by the team.</p>
              </div>
              <Link href="/team" className="btn-glass text-sm">Open Team Board</Link>
            </div>
            <div className="mt-4 space-y-3">
              {currentTeamSummary.latestActivity.length === 0 ? (
                <p className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
                  No outreach activity has been logged yet.
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
            <p className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
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
              Scheduler, AI queue, enrichment, costs, and conversion metrics.
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
                  Scheduler controls, worker explanations, costs, backlog counts, and recent run history live in the Scheduler operations center.
                </p>
              </div>
              <Link href="/scheduler" className="btn-primary text-sm">Open Scheduler</Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Workers On" value={`${activeWorkerCount} / ${stats.schedulerHealth.workers.length}`} sub={pausedWorkerCount > 0 ? `${pausedWorkerCount} paused` : "all active"} />
              <MetricCard label="Background Queue" value={backgroundQueueDepth.toLocaleString()} sub="all worker backlogs" />
              <MetricCard label="Worker Issues" value={String(workerIssueCount)} sub={workerIssueCount > 0 ? "needs review" : "none blocking"} />
              <MetricCard label="AI Month" value={`$${stats.schedulerHealth.ai.monthlyCost.toFixed(2)}`} sub={`$${stats.schedulerHealth.ai.budgetRemainingMonth.toFixed(2)} remaining`} />
            </div>
          </section>

          {pollError && (
            <section className="rounded-2xl px-5 py-4" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <p className="text-xs font-semibold" style={{ color: "#b45309" }}>Polling needs attention</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{pollError}</p>
              <Link href="/scheduler" className="link-accent mt-2 inline-block text-sm">Open Scheduler</Link>
            </section>
          )}

          {isIdle && stats.leadsTotal > 0 && (
            <section className="glass rounded-2xl p-6">
              <h3 className="section-label">Lead Enrichment</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Enrich top leads with detailed reviews, website health checks, and competitive analysis.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary text-sm" onClick={handleEnrich} disabled={loading || isEnriching}>
                  {isEnriching ? "Enriching..." : "Enrich Top Leads"}
                </button>
                {isEnriching && <button type="button" className="btn-glass text-sm" onClick={() => setIsEnriching(false)}>Stop Local Polling</button>}
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
              <MetricCard label="AI Not Run" value={String(stats.aiQueueStats.notChecked)} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary text-sm" onClick={handleAiVerify} disabled={loading || isAiVerifying || stats.aiQueueStats.queued === 0}>
                {isAiVerifying ? "Verifying..." : "Process AI Queue"}
              </button>
              {isAiVerifying && <button type="button" className="btn-glass text-sm" onClick={() => setIsAiVerifying(false)}>Stop Local Polling</button>}
              <button type="button" className="btn-glass text-sm" onClick={handleQueueMissingAi} disabled={loading || aiBackfillLoading || stats.aiQueueStats.notChecked === 0}>
                {aiBackfillLoading ? "Queueing..." : "Queue Missing AI Verifications"}
              </button>
              {aiProgress && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last: {aiProgress}</span>}
            </div>
          </section>

          {(stats.monthlyApiCalls > 0 || stats.monthlyApiCost > 0) && (
            <section className="glass rounded-2xl p-6">
              <h3 className="section-label">API Cost Intelligence</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Monthly Calls" value={String(stats.monthlyApiCalls)} />
                <MetricCard label="Monthly Cost" value={`$${stats.monthlyApiCost.toFixed(2)}`} />
                <MetricCard label="Projected Month-End" value={`$${stats.projectedMonthlyCost.toFixed(2)}`} />
                <MetricCard label="Atmosphere Calls" value={String(stats.atmosphereEnrichmentCalls)} sub={`$${stats.atmosphereEstimatedCost.toFixed(2)} spend`} />
              </div>
              <div className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Discovery: {stats.discoveryApiCalls} calls (${stats.discoveryEstimatedCost.toFixed(2)}) · Enrichment: {stats.enrichmentApiCalls} calls (${stats.enrichmentEstimatedCost.toFixed(2)})
              </div>
            </section>
          )}

          {(stats.conversionMetrics.totalContacted > 0 || stats.qualifiedLeadCount > 0) && (
            <ConversionPanel metrics={stats.conversionMetrics} qualifiedLeadCount={stats.qualifiedLeadCount} costPerQualifiedLead={stats.costPerQualifiedLead} />
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
      style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.5)" }}
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
  item: DiscoveryItem;
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
      style={{ background: isActive ? "rgba(79,70,229,0.08)" : "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.42)" }}
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
      {item.lastError && <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "#991b1b" }}>{item.lastError}</p>}
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

function TeamMemberCard({ member }: { member: TeamBoardSummary["members"][number] }) {
  return (
    <article
      className="rounded-xl p-4"
      style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.5)" }}
    >
      <Link className="link-accent break-words font-semibold" href={`/leads?owner=${encodeURIComponent(member.user_id)}`}>
        {member.display_name || member.email}
      </Link>
      <p className="mt-1 text-xs uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{member.role}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <TeamMetric label="Claimed" value={member.claimed_active} />
        <TeamMetric label="Due today" value={member.due_today} />
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
    <div className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.35)" }}>
      <span className="text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function ActivityRow({ activity }: { activity: TeamBoardSummary["latestActivity"][number] }) {
  return (
    <article
      className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.5)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="link-accent break-words font-medium" href={`/leads/${activity.lead_id}`} prefetch={false}>
          {activity.lead_name ?? "Unknown lead"}
        </Link>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {formatDateTime(activity.created_at)}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {activity.actor_email ?? "Someone"} logged {channelLabel(activity.channel)} as {formatOutcome(activity.outcome)}.
      </p>
      {activity.note && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>{activity.note}</p>
      )}
    </article>
  );
}

function ConversionPanel({ metrics, qualifiedLeadCount, costPerQualifiedLead }: {
  metrics: ConversionMetrics;
  qualifiedLeadCount: number;
  costPerQualifiedLead: number | null;
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
          <MetricCard
            label="Cost / Qualified Lead"
            value={costPerQualifiedLead != null ? `$${costPerQualifiedLead.toFixed(2)}` : "N/A"}
            sub="API cost efficiency"
          />
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
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-0.5 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
      {sub && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

function SummaryChip({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-1"
      style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.55)", color: "var(--text-secondary)" }}
    >
      {label}
    </span>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
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

function channelLabel(channel: string): string {
  return channel === "walkin" ? "in person" : channel;
}
