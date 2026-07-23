"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  getCoverageCellLedgerAction,
  getCoverageDiscoveryItemListAction,
  getCoverageMarketSummaryAction,
  getCoverageProbeCandidatesAction,
  getCoverageRunProgressAction,
  getCoverageSelectedRunAction,
  getCoverageUnitPreviewAction,
  getFailedUnitErrorsAction,
  pauseCrawlRunAction,
  promoteProbeToLeadHarvestAction,
  resumeRecommendedSchedulerWorkersAction,
  resumeCrawlRunAction,
  runGoogleDiscoveryDiagnosticAction,
  retryFailedUnitsAction,
  stopCrawlRunAction,
} from "@/lib/crawl/actions";
import { refreshStaleUnitsAction } from "@/lib/leads/actions";
import type { CountryCode } from "@/lib/geography";
import type {
  CrawlProgress,
  DiscoveryItemSummary,
  LocationCellCoverage,
  MarketCoverageSummary,
} from "@/lib/db/queries";
import { getStatusToneStyle } from "@/lib/status-tone";

interface FailedUnit {
  zip: string;
  category: string;
  last_error: string | null;
}

interface CrawlRunSummary {
  id: string;
  name: string | null;
  scope_label: string | null;
  status: string;
  discoveryMode: "coverage_probe" | "lead_harvest" | null;
  started_at: string | null;
  created_at: string;
  ended_at: string | null;
  categories: string[];
  discovered_count: number;
  api_calls_used: number;
  last_error: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_error_code: string | null;
  market_id: string | null;
}


interface CrawlWorkerState {
  enabled: boolean;
  googlePlacesKeyConfigured: boolean;
  googlePlacesKeySource: "ui" | "env" | "none";
}

interface GeographyProgress {
  activeZipCount: number;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
  countiesSelected: number;
  countiesCompleted: number;
}

interface CrawlUnitPreview {
  id: string;
  status: string;
  zip: string;
  market_id: string | null;
  location_cell_id: string | null;
  country_code: CountryCode | null;
  query_location_label: string | null;
  city: string | null;
  county: string | null;
  category: string;
  attempt_count: number;
  discovered_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  next_page_token: string | null;
  next_retry_at: string | null;
  max_pages: number;
  max_attempts: number;
  pages_fetched: number;
  raw_places_seen: number;
  new_places_seen: number;
  duplicate_places_seen: number;
  budget_blocked_at: string | null;
  last_error_code: string | null;
  created_at: string;
}

interface DiscoveryRunCandidate {
  placeId: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  websiteUri: string | null;
  mapsUri: string | null;
  categories: string[];
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  lat: number | null;
  lng: number | null;
  completenessScore: number;
  freshnessScore: number;
  verificationCoverage: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastObservedAt: string | null;
  observationCount: number;
  marketId: string | null;
  locationCellId: string | null;
  countryCode: CountryCode | null;
  queryLocationLabel: string | null;
  category: string | null;
  hasLead: boolean;
  leadId: string | null;
  leadStatus: string | null;
  leadIsExcluded: boolean;
  websiteStatusLabel: "No website" | "Website present";
  listingStatus: "Active lead" | "Excluded lead" | "Directory candidate";
}

interface Props {
  selectedRunId?: string | null;
  markets: MarketCoverageSummary[];
  cells: LocationCellCoverage[];
  discoveryItems: DiscoveryItemSummary[];
  loadWarnings: string[];
  run: CrawlRunSummary | null;
  progress: CrawlProgress | null;
  crawlWorker?: CrawlWorkerState | null;
  geography: GeographyProgress | null;
  unitPreview: CrawlUnitPreview[];
}

type PanelStatus = "idle" | "loading" | "ready" | "error" | "timeout";

type CoverageLoadError = "db_statement_timeout" | "transient_db_error" | "coverage_load_timeout" | "coverage_data_unavailable";

export function CoverageClient({
  selectedRunId = null,
  markets: initialMarkets,
  cells: initialCells,
  discoveryItems: initialDiscoveryItems,
  loadWarnings: initialLoadWarnings,
  run: initialRun,
  progress: initialProgress,
  crawlWorker: initialCrawlWorker = null,
  geography: initialGeography,
  unitPreview: initialUnitPreview,
}: Props) {
  const router = useRouter();
  const [markets, setMarkets] = useState(initialMarkets);
  const [cells, setCells] = useState(initialCells);
  const [discoveryItems, setDiscoveryItems] = useState(initialDiscoveryItems);
  const [loadWarnings, setLoadWarnings] = useState(initialLoadWarnings);
  const [run, setRun] = useState(initialRun);
  const [progress, setProgress] = useState(initialProgress);
  const [crawlWorker, setCrawlWorker] = useState(initialCrawlWorker);
  const [geography, setGeography] = useState(initialGeography);
  const [unitPreview, setUnitPreview] = useState(initialUnitPreview);
  const [probeCandidates, setProbeCandidates] = useState<DiscoveryRunCandidate[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<PanelStatus>(initialRun ? "ready" : "loading");
  const [discoveryItemsStatus, setDiscoveryItemsStatus] = useState<PanelStatus>(initialDiscoveryItems.length > 0 ? "ready" : "loading");
  const [marketsStatus, setMarketsStatus] = useState<PanelStatus>("idle");
  const [cellsStatus, setCellsStatus] = useState<PanelStatus>("idle");
  const [progressStatus, setProgressStatus] = useState<PanelStatus>("idle");
  const [unitPreviewStatus, setUnitPreviewStatus] = useState<PanelStatus>("idle");
  const [probeCandidatesStatus, setProbeCandidatesStatus] = useState<PanelStatus>("idle");
  const [country, setCountry] = useState("all");
  const [marketId, setMarketId] = useState("all");
  const [cellType, setCellType] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<FailedUnit[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<"pause" | "resume" | "stop" | "retry" | "refresh" | "promote" | "diagnostic" | "workers" | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; actionLabel: string; action: () => Promise<void> } | null>(null);
  const [refreshDays, setRefreshDays] = useState(7);
  const effectiveRunId = run?.id ?? selectedRunId ?? null;

  useEffect(() => {
    document.title = "Coverage | Nova Trade Lead Management";
  }, []);

  const setPanelWarning = useCallback((label: string, loadError?: CoverageLoadError) => {
    setLoadWarnings((current) => [
      ...current.filter((warning) => !warning.startsWith(`${label}:`)),
      ...(loadError ? [`${label}: ${formatCoverageLoadError(loadError)}`] : []),
    ]);
  }, []);

  const loadDiscoveryPanel = useCallback(async () => {
    setDiscoveryStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageSelectedRunAction(selectedRunId));
      setRun(result.run);
      setCrawlWorker(result.crawlWorker);
      setPanelWarning("selected_run", result.loadError);
      setDiscoveryStatus(statusFromLoadError(result.loadError));
    } catch {
      setRun(null);
      setCrawlWorker(null);
      setPanelWarning("selected_run", "coverage_load_timeout");
      setDiscoveryStatus("timeout");
    }
  }, [selectedRunId, setPanelWarning]);

  const loadDiscoveryItemsPanel = useCallback(async () => {
    setDiscoveryItemsStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageDiscoveryItemListAction(30));
      setDiscoveryItems(result.discoveryItems);
      setPanelWarning("discovery_items", result.loadError);
      setDiscoveryItemsStatus(statusFromLoadError(result.loadError));
    } catch {
      setDiscoveryItems([]);
      setPanelWarning("discovery_items", "coverage_load_timeout");
      setDiscoveryItemsStatus("timeout");
    }
  }, [setPanelWarning]);

  const loadMarketPanel = useCallback(async (runId: string | null) => {
    setMarketsStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageMarketSummaryAction(runId));
      setMarkets(result.markets);
      setPanelWarning("market_summary", result.loadError);
      setMarketsStatus(statusFromLoadError(result.loadError));
    } catch {
      setMarkets([]);
      setPanelWarning("market_summary", "coverage_load_timeout");
      setMarketsStatus("timeout");
    }
  }, [setPanelWarning]);

  const loadCellPanel = useCallback(async (runId: string | null) => {
    setCellsStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageCellLedgerAction(runId));
      setCells(result.cells);
      setPanelWarning("cell_coverage", result.loadError);
      setCellsStatus(statusFromLoadError(result.loadError));
    } catch {
      setCells([]);
      setPanelWarning("cell_coverage", "coverage_load_timeout");
      setCellsStatus("timeout");
    }
  }, [setPanelWarning]);

  const loadProgressPanel = useCallback(async (runId: string | null) => {
    setProgressStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageRunProgressAction(runId));
      setProgress(result.progress);
      setGeography(result.geography);
      setPanelWarning("run_progress", result.loadError);
      setProgressStatus(statusFromLoadError(result.loadError));
    } catch {
      setProgress(null);
      setGeography(null);
      setPanelWarning("run_progress", "coverage_load_timeout");
      setProgressStatus("timeout");
    }
  }, [setPanelWarning]);

  const loadUnitPreviewPanel = useCallback(async (runId: string | null) => {
    setUnitPreviewStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageUnitPreviewAction(runId));
      setUnitPreview(result.unitPreview);
      setPanelWarning("unit_preview", result.loadError);
      setUnitPreviewStatus(statusFromLoadError(result.loadError));
    } catch {
      setUnitPreview([]);
      setPanelWarning("unit_preview", "coverage_load_timeout");
      setUnitPreviewStatus("timeout");
    }
  }, [setPanelWarning]);

  const loadProbeCandidatesPanel = useCallback(async (runId: string | null) => {
    setProbeCandidatesStatus("loading");
    try {
      const result = await withCoverageClientTimeout(getCoverageProbeCandidatesAction(runId));
      setProbeCandidates(result.candidates);
      setPanelWarning("probe_candidates", result.loadError);
      setProbeCandidatesStatus(statusFromLoadError(result.loadError));
    } catch {
      setProbeCandidates([]);
      setPanelWarning("probe_candidates", "coverage_load_timeout");
      setProbeCandidatesStatus("timeout");
    }
  }, [setPanelWarning]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDiscoveryPanel(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDiscoveryPanel]);

  useEffect(() => {
    if (discoveryStatus === "loading" || discoveryStatus === "idle") return;
    const itemTimer = window.setTimeout(() => void loadDiscoveryItemsPanel(), 0);
    const marketTimer = window.setTimeout(() => void loadMarketPanel(effectiveRunId), 150);
    const cellTimer = window.setTimeout(() => void loadCellPanel(effectiveRunId), 300);
    const progressTimer = window.setTimeout(() => void loadProgressPanel(effectiveRunId), 450);
    const unitTimer = window.setTimeout(() => void loadUnitPreviewPanel(effectiveRunId), 600);
    const candidateTimer = window.setTimeout(() => void loadProbeCandidatesPanel(effectiveRunId), 750);
    return () => {
      window.clearTimeout(itemTimer);
      window.clearTimeout(marketTimer);
      window.clearTimeout(cellTimer);
      window.clearTimeout(progressTimer);
      window.clearTimeout(unitTimer);
      window.clearTimeout(candidateTimer);
    };
  }, [discoveryStatus, effectiveRunId, loadCellPanel, loadDiscoveryItemsPanel, loadMarketPanel, loadProbeCandidatesPanel, loadProgressPanel, loadUnitPreviewPanel]);

  const countries = useMemo(() => Array.from(new Set(markets.map((market) => market.countryCode))).sort(), [markets]);
  const marketOptions = useMemo(() => markets.filter((market) => country === "all" || market.countryCode === country), [country, markets]);
  const cellTypes = useMemo(() => Array.from(new Set(cells.map((cell) => cell.cellType))).sort(), [cells]);
  const categories = useMemo(() => Array.from(new Set(unitPreview.map((unit) => unit.category))).sort(), [unitPreview]);

  const filteredMarkets = marketOptions.filter((market) => marketId === "all" || market.marketId === marketId);
  const filteredCells = cells.filter((cell) => {
    if (country !== "all" && cell.countryCode !== country) return false;
    if (marketId !== "all" && cell.marketId !== marketId) return false;
    if (cellType !== "all" && cell.cellType !== cellType) return false;
    if (status === "open" && cell.openUnits === 0) return false;
    if (status === "failed" && cell.failedUnits === 0) return false;
    if (status === "complete" && !(cell.totalUnits > 0 && cell.openUnits === 0 && cell.failedUnits === 0)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [cell.cellLabel, cell.postalCode, cell.locality, cell.adminArea1, cell.adminArea2, cell.marketName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
  const visibleCells = filteredCells.slice(0, 500);
  const hiddenCellCount = Math.max(filteredCells.length - visibleCells.length, 0);
  const filteredUnits = unitPreview.filter((unit) => {
    if (marketId !== "all" && unit.market_id !== marketId) return false;
    if (country !== "all" && unit.country_code !== country) return false;
    if (category !== "all" && unit.category !== category) return false;
    if (status !== "all" && status !== "open" && status !== "complete" && unit.status !== status) return false;
    return true;
  });

  const totalUnits = filteredMarkets.reduce((sum, market) => sum + market.totalUnits, 0);
  const doneUnits = filteredMarkets.reduce((sum, market) => sum + market.doneUnits, 0);
  const failedUnits = filteredMarkets.reduce((sum, market) => sum + market.failedUnits, 0);
  const openUnits = filteredMarkets.reduce((sum, market) => sum + market.openUnits, 0);
  const rawCandidateCount = unitPreview.reduce((sum, unit) => sum + unit.raw_places_seen, 0);
  const newCandidateCount = unitPreview.reduce((sum, unit) => sum + unit.new_places_seen, 0);
  const duplicateCandidateCount = unitPreview.reduce((sum, unit) => sum + unit.duplicate_places_seen, 0);
  const pagesFetched = unitPreview.reduce((sum, unit) => sum + unit.pages_fetched, 0);
  const noWebsiteCandidateCount = probeCandidates.filter((candidate) => !candidate.websiteUri).length;
  const activeLeadCandidateCount = probeCandidates.filter((candidate) => candidate.hasLead && !candidate.leadIsExcluded).length;
  const runPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0;
  const runStatus = run?.status ?? null;
  const retryWaitUnits = progress?.retryWait ?? unitPreview.filter((unit) => unit.status === "retry_wait").length;
  const terminalFailedUnits = progress?.failed ?? failedUnits;
  const pendingUnits = progress?.pending ?? openUnits;
  const runningUnits = progress?.running ?? 0;
  const openUnitCount = pendingUnits + runningUnits;
  const waitingForWorker = Boolean(
    run &&
    crawlWorker &&
    !crawlWorker.enabled &&
    openUnitCount > 0 &&
    (run.status === "running" || run.status === "queued"),
  );
  const operationalStatus = run?.status === "blocked"
    ? "Blocked"
    : waitingForWorker
      ? "Waiting for worker"
      : retryWaitUnits > 0 && runningUnits === 0 && (run?.status === "running" || run?.status === "queued")
        ? "Retrying later"
        : formatRunStatus(runStatus);
  const canStop = runStatus === "running" || runStatus === "queued" || runStatus === "paused" || runStatus === "blocked";
  const selectedDiscoveryItem = discoveryItems.find((item) => item.id === run?.id) ?? null;
  const selectedDiscoveryMode = run?.discoveryMode ?? selectedDiscoveryItem?.discoveryMode ?? null;
  const canPromoteProbe = Boolean(run?.id && run.status === "done" && selectedDiscoveryMode === "coverage_probe");

  const handleRunSelect = (value: string) => {
    if (value === "default") {
      router.push("/coverage");
      return;
    }
    router.push(`/coverage?run=${encodeURIComponent(value)}`);
  };

  const refreshRunPanels = useCallback(async () => {
    const runId = effectiveRunId;
    await Promise.all([
      loadDiscoveryPanel(),
      loadProgressPanel(runId),
      loadUnitPreviewPanel(runId),
      loadDiscoveryItemsPanel(),
    ]);
  }, [effectiveRunId, loadDiscoveryItemsPanel, loadDiscoveryPanel, loadProgressPanel, loadUnitPreviewPanel]);

  const handlePause = async () => {
    if (!run?.id) return;
    setBusy("pause");
    const result = await pauseCrawlRunAction(run.id);
    if ("error" in result) toast.error(result.error ?? "Unable to pause run");
    else toast.info("Discovery paused");
    await refreshRunPanels();
    setBusy(null);
  };

  const handleResume = async () => {
    if (!run?.id) return;
    setBusy("resume");
    const result = await resumeCrawlRunAction(run.id);
    if ("error" in result) toast.error(result.error ?? "Unable to resume run");
    else toast.success("Discovery resumed");
    await refreshRunPanels();
    setBusy(null);
  };

  const handleStop = async () => {
    if (!run?.id) return;
    setBusy("stop");
    const result = await stopCrawlRunAction(run.id);
    if ("error" in result) toast.error(result.error ?? "Unable to cancel remaining units");
    else toast.success(`Remaining discovery units canceled. ${result.canceledUnits} queued units canceled.`);
    await refreshRunPanels();
    setBusy(null);
  };

  const handleRetry = async () => {
    if (!run?.id) return;
    setBusy("retry");
    const result = await retryFailedUnitsAction(run.id);
    if ("error" in result) toast.error(result.error ?? "Unable to retry failed units");
    else toast.success(`${result.retriedCount} units queued for retry`);
    await refreshRunPanels();
    setBusy(null);
  };

  const handleDiagnostic = async () => {
    if (!run?.id) return;
    setBusy("diagnostic");
    const result = await runGoogleDiscoveryDiagnosticAction(run.id);
    if (result.diagnostic.ok) {
      toast.success(`Google diagnostic passed using ${formatKeySource(result.diagnostic.keySource)} key.`);
    } else {
      toast.error(result.diagnostic.error);
    }
    await refreshRunPanels();
    setBusy(null);
  };

  const handleResumeRecommendedWorkers = async () => {
    setBusy("workers");
    try {
      const result = await resumeRecommendedSchedulerWorkersAction();
      if (!result.googleReady) {
        toast.error("Google Places API key is missing. Add it before enabling the crawl worker.");
      } else {
        toast.success("Recommended workers updated. Crawl worker is enabled.");
      }
    } catch {
      toast.error("Unable to resume workers");
    }
    await refreshRunPanels();
    setBusy(null);
  };

  const handleShowErrors = async () => {
    if (showErrors) {
      setShowErrors(false);
      return;
    }
    if (!run?.id) return;
    setErrors(await getFailedUnitErrorsAction(run.id));
    setShowErrors(true);
  };

  const handleRefreshStale = async () => {
    if (!run?.id) return;
    setBusy("refresh");
    const result = await refreshStaleUnitsAction(run.id, refreshDays);
    if ("error" in result) toast.error(result.error ?? "Unable to refresh stale units");
    else toast.success(`${result.count} stale units reset for re-crawl`);
    await refreshRunPanels();
    setBusy(null);
  };

  const handlePromoteProbe = async () => {
    if (!run?.id) return;
    setBusy("promote");
    const result = await promoteProbeToLeadHarvestAction(run.id);
    if ("error" in result) {
      toast.error(result.error ?? "Unable to promote this probe");
      setBusy(null);
      return;
    }
    toast.success(`Created lead harvest with ${result.unitCount} unit${result.unitCount === 1 ? "" : "s"}.`);
    router.push(`/coverage?run=${encodeURIComponent(result.runId)}`);
    setBusy(null);
  };

  return (
    <PageShell
      title="Coverage"
      description="Track discovery coverage by country, market, and postal/postcode cell. Colorado ZIP coverage remains available as U.S. ZIP cells."
      stats={[
        { label: "Run Status", value: operationalStatus },
        { label: "Units Done", value: `${progress?.done ?? doneUnits} / ${progress?.total ?? totalUnits}` },
        { label: "Open Units", value: String(openUnitCount) },
        { label: "Retry Wait", value: String(retryWaitUnits) },
        { label: "Failed", value: String(terminalFailedUnits) },
      ]}
    >
      {(discoveryStatus === "loading" || discoveryItemsStatus === "loading" || marketsStatus === "loading" || cellsStatus === "loading" || progressStatus === "loading" || unitPreviewStatus === "loading" || probeCandidatesStatus === "loading") && (
        <section className="glass rounded-2xl p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          Coverage panels are loading. The page shell remains usable while heavy reads finish.
        </section>
      )}

      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="section-label">Discovery Control</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              A work unit is one Google Places search for one market cell and one business category.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-glass text-xs" onClick={() => router.refresh()}>Refresh</button>
            <Link href="/dashboard#discovery" className="btn-primary text-xs">Start New Discovery</Link>
          </div>
        </div>

        {discoveryStatus === "loading" ? (
          <EmptyPanel label="Loading selected discovery item..." />
        ) : discoveryStatus === "error" || discoveryStatus === "timeout" ? (
          <RetryPanel
            label="Coverage discovery item metadata is temporarily unavailable."
            status={discoveryStatus}
            onRetry={loadDiscoveryPanel}
          />
        ) : run ? (
          <>
            <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="section-label">Selected discovery item</span>
                <select className="glass-select w-full min-w-0 max-w-full" value={run.id} onChange={(event) => handleRunSelect(event.target.value)}>
                  {!selectedDiscoveryItem && <option value={run.id}>{run.name ?? `Discovery item ${run.id.slice(0, 8)}`} - {formatLabel(run.status)}</option>}
                  {discoveryItems.map((item) => (
                    <option key={item.id} value={item.id}>{formatDiscoveryItemLabel(item)}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0 overflow-hidden rounded-xl p-3 text-sm" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}>
                <p className="break-words font-semibold" style={{ color: "var(--text-primary)" }}>{selectedDiscoveryItem?.name ?? run.name ?? "Selected discovery item"}</p>
                <p className="mt-1 break-words text-xs">{selectedDiscoveryItem?.scopeLabel ?? run.scope_label ?? "Selected discovery item"} · Counts below are scoped to this discovery item.</p>
              </div>
            </div>
            {(discoveryItemsStatus === "error" || discoveryItemsStatus === "timeout") && (
              <div className="mt-4">
                <RetryPanel
                  label="Discovery item list is temporarily unavailable. The selected item remains usable."
                  status={discoveryItemsStatus}
                  onRetry={loadDiscoveryItemsPanel}
                />
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Status" value={operationalStatus} />
              <Metric label="Completion" value={`${runPct}%`} />
              <Metric label="Discovered" value={String(run.discovered_count)} />
              <Metric label="API Calls" value={String(run.api_calls_used)} />
              <Metric label="Categories" value={String(run.categories.length)} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Mode" value={selectedDiscoveryMode === "lead_harvest" ? "Lead harvest" : selectedDiscoveryMode === "coverage_probe" ? "Coverage probe" : "Unknown"} />
              <Metric label="Pages fetched" value={String(pagesFetched)} />
              <Metric label="Raw candidates" value={String(rawCandidateCount)} />
              <Metric label="New directory candidates" value={String(newCandidateCount)} />
              <Metric label="Duplicates" value={String(duplicateCandidateCount)} />
            </div>
            <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}>
              {selectedDiscoveryMode === "coverage_probe" ? (
                <p><strong style={{ color: "var(--text-primary)" }}>Coverage probe:</strong> candidates are stored in the directory database (`places_master` + observations), but active sales leads are not created until you run a lead harvest.</p>
              ) : selectedDiscoveryMode === "lead_harvest" ? (
                <p><strong style={{ color: "var(--text-primary)" }}>Lead harvest:</strong> this mode creates active leads from Google Places results while still updating the canonical directory database.</p>
              ) : (
                <p>This discovery item predates explicit probe/harvest labeling. Inspect the work queue and candidates before rerunning.</p>
              )}
            </div>
            {run.status === "blocked" && (
              <OperationalPanel
                tone="danger"
                title="Blocked"
                message={run.blocked_reason ?? run.last_error ?? "Discovery is blocked until an operator resolves the underlying issue."}
                details={[
                  run.blocked_error_code ? `Error code: ${run.blocked_error_code}` : null,
                  run.blocked_at ? `Blocked at: ${formatDateTime(run.blocked_at)}` : null,
                  `${openUnitCount} open unit${openUnitCount === 1 ? "" : "s"} remain untouched.`,
                  "Next safe action: run the Google diagnostic, fix the reported key/API/billing issue, then resume after the fix.",
                ]}
                actions={(
                  <>
                    <button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={handleDiagnostic}>
                      {busy === "diagnostic" ? "Checking..." : "Run Google diagnostic"}
                    </button>
                    <button type="button" className="btn-primary text-xs" disabled={busy !== null} onClick={() => setConfirmAction({
                      title: "Resume after fixing the block?",
                      message: `This runs a Google diagnostic first, then resumes ${run.name ?? "this discovery item"} only if the diagnostic passes and the remaining call cap is safe.`,
                      actionLabel: busy === "resume" ? "Resuming..." : "Resume after fix",
                      action: handleResume,
                    })}>
                      Resume after fix
                    </button>
                  </>
                )}
              />
            )}
            {waitingForWorker && (
              <OperationalPanel
                tone="warning"
                title="Waiting for worker"
                message="Waiting for worker: crawl scheduler is paused."
                details={[
                  `Google key source: ${formatKeySource(crawlWorker?.googlePlacesKeySource ?? "none")}.`,
                  crawlWorker?.googlePlacesKeyConfigured ? "Required Google key is present." : "Google Places API key is missing.",
                  `${openUnitCount} open unit${openUnitCount === 1 ? "" : "s"} are ready but no crawl worker is enabled.`,
                ]}
                actions={(
                  <>
                    <button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={handleDiagnostic}>
                      {busy === "diagnostic" ? "Checking..." : "Run Google diagnostic"}
                    </button>
                    <button type="button" className="btn-primary text-xs" disabled={busy !== null || !crawlWorker?.googlePlacesKeyConfigured} onClick={handleResumeRecommendedWorkers}>
                      {busy === "workers" ? "Updating..." : "Enable recommended workers"}
                    </button>
                  </>
                )}
              />
            )}
            {retryWaitUnits > 0 && run.status !== "blocked" && (
              <OperationalPanel
                tone="info"
                title="Retrying later"
                message={`${retryWaitUnits} unit${retryWaitUnits === 1 ? "" : "s"} hit transient Google/network errors and are waiting for retry backoff.`}
                details={[
                  "429, 5xx, and network timeouts retry automatically within the unit attempt cap.",
                  "Permission errors do not retry automatically; they block the whole run.",
                ]}
              />
            )}
            <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--status-muted-bg)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${runPct}%`, background: runPct === 100 ? "var(--success-text)" : "var(--accent)" }} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(run.status === "running" || run.status === "queued") && <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handlePause}>{busy === "pause" ? "Pausing..." : "Pause Discovery"}</button>}
              {(run.status === "paused" || run.status === "blocked") && <button type="button" className="btn-primary text-sm" disabled={busy !== null} onClick={() => setConfirmAction({
                title: run.status === "blocked" ? "Resume after fixing the block?" : "Resume this discovery item?",
                message: run.status === "blocked"
                  ? `This runs a Google diagnostic first, then resumes ${run.name ?? "this discovery item"} only if Google and the remaining call cap are safe.`
                  : `This will resume ${run.name ?? "this discovery item"} and can consume Google Places quota while workers process ${pendingUnits} open units.`,
                actionLabel: "Resume this item",
                action: handleResume,
              })}>{busy === "resume" ? "Resuming..." : run.status === "blocked" ? "Resume after fix" : "Resume this discovery item"}</button>}
              {run.id && <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handleDiagnostic}>{busy === "diagnostic" ? "Checking..." : "Run Google diagnostic"}</button>}
              {waitingForWorker && <button type="button" className="btn-glass text-sm" disabled={busy !== null || !crawlWorker?.googlePlacesKeyConfigured} onClick={handleResumeRecommendedWorkers}>{busy === "workers" ? "Updating..." : "Enable recommended workers"}</button>}
              {canStop && <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={() => setConfirmAction({
                title: "Cancel this item's remaining units?",
                message: `This will mark ${pendingUnits} open units for ${run.name ?? "this discovery item"} as canceled. Completed leads and history stay saved, but queued units will not be processed unless recreated later.`,
                actionLabel: "Cancel remaining units",
                action: handleStop,
              })}>{busy === "stop" ? "Canceling..." : "Cancel this item's remaining units"}</button>}
              {(terminalFailedUnits + retryWaitUnits) > 0 && <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handleRetry}>{busy === "retry" ? "Retrying..." : `Retry retryable units (${terminalFailedUnits + retryWaitUnits})`}</button>}
              {canPromoteProbe && <button type="button" className="btn-primary text-sm" disabled={busy !== null} onClick={() => setConfirmAction({
                title: "Promote probe to lead harvest?",
                message: `This creates a separate lead harvest using the same market, cell, and categories from ${run.name ?? "this probe"}. The original probe remains unchanged.`,
                actionLabel: busy === "promote" ? "Creating..." : "Create lead harvest",
                action: handlePromoteProbe,
              })}>{busy === "promote" ? "Creating harvest..." : "Promote to lead harvest"}</button>}
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Started {formatDateTime(run.started_at ?? run.created_at)}</span>
            </div>
            {run.last_error && <Alert tone="error" text={run.last_error} />}
          </>
        ) : <EmptyPanel label="No discovery run exists yet. Open Revenue, choose markets/cells and categories, then start a run." />}
        {loadWarnings.length > 0 && (
          <div className="mt-4 rounded-xl border px-4 py-3 text-sm" style={getStatusToneStyle("warning")}>
            <p className="font-semibold">Some coverage panels are temporarily unavailable.</p>
            <p className="mt-1 text-xs">{loadWarnings.join("; ")}</p>
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4">
          <h3 className="section-label">Territory Coverage</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Filter by country, market, cell type, crawl status, and category.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Select label="Country" value={country} onChange={setCountry} options={["all", ...countries]} />
          <Select label="Market" value={marketId} onChange={setMarketId} options={["all", ...marketOptions.map((market) => market.marketId)]} labels={Object.fromEntries(markets.map((market) => [market.marketId, market.marketName]))} />
          <Select label="Cell type" value={cellType} onChange={setCellType} options={["all", ...cellTypes]} />
          <Select label="Status" value={status} onChange={setStatus} options={["all", "open", "failed", "retry_wait", "complete", "pending", "running", "done", "canceled"]} />
          <Select label="Category" value={category} onChange={setCategory} options={["all", ...categories]} />
          <label className="flex flex-col gap-1">
            <span className="section-label">Search</span>
            <input className="glass-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Market, postcode, city" />
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {marketsStatus === "loading" ? <EmptyPanel label="Loading market coverage..." /> : marketsStatus === "error" || marketsStatus === "timeout" ? (
          <RetryPanel label="Market coverage is temporarily unavailable." status={marketsStatus} onRetry={() => loadMarketPanel(effectiveRunId)} />
        ) : filteredMarkets.length === 0 ? <EmptyPanel label="No markets match the current filters." /> : filteredMarkets.map((market) => (
          <article key={market.marketId} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{market.marketName}</h3>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{market.countryLabel}{market.adminArea1 ? ` - ${market.adminArea1}` : ""}</p>
              </div>
              <span className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--surface-card)", color: "var(--text-secondary)" }}>{market.discoveredCells}/{market.activeCells} cells</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Metric label="Units" value={`${market.doneUnits}/${market.totalUnits}`} />
              <Metric label="Open" value={String(market.openUnits)} />
              <Metric label="Failed" value={String(market.failedUnits)} />
              <Metric label="Leads" value={String(market.activeLeads)} />
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>Last activity {formatDateTime(market.lastRunAt)}</p>
          </article>
        ))}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Postal / postcode cell ledger</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              {visibleCells.length} of {filteredCells.length} cells shown
              {hiddenCellCount > 0 ? " - narrow the filters to inspect the remaining cells" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {terminalFailedUnits > 0 && <button type="button" className="btn-glass text-xs" onClick={handleShowErrors}>{showErrors ? "Hide Errors" : "Show Errors"}</button>}
            {run?.id && doneUnits > 0 && <><input type="number" className="glass-input w-16 text-xs" value={refreshDays} min={1} onChange={(event) => setRefreshDays(Number(event.target.value))} aria-label="Days threshold" /><button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={handleRefreshStale}>{busy === "refresh" ? "Refreshing..." : "Refresh Stale"}</button></>}
          </div>
        </div>
        {showErrors && errors.length > 0 && <div className="mb-5 space-y-2">{errors.map((err, index) => <Alert key={`${err.zip}-${err.category}-${index}`} tone="error" text={`${err.zip} / ${err.category}: ${err.last_error || "No error message"}`} />)}</div>}
        {cellsStatus === "loading" ? <EmptyPanel label="Loading postal / postcode cells..." /> : cellsStatus === "error" || cellsStatus === "timeout" ? (
          <RetryPanel label="Postal / postcode cell coverage is temporarily unavailable." status={cellsStatus} onRetry={() => loadCellPanel(effectiveRunId)} />
        ) : filteredCells.length === 0 ? <EmptyPanel label="No cells match the current filters." /> : (
          <div className="overflow-x-auto">
            <table className="glass-table min-w-[1180px]">
              <thead><tr><th>Market</th><th>Cell</th><th>Type</th><th>Area</th><th>Total</th><th>Done</th><th>Failed</th><th>Open</th><th>Leads</th><th>Last run</th></tr></thead>
              <tbody>{visibleCells.map((cell) => <tr key={cell.cellId}><td>{cell.marketName}</td><td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{cell.cellLabel}</td><td>{cell.cellType.replace(/_/g, " ")}</td><td>{[cell.locality, cell.adminArea1, cell.countryCode].filter(Boolean).join(", ")}</td><td>{cell.totalUnits}</td><td>{cell.doneUnits}</td><td style={{ color: cell.failedUnits > 0 ? "var(--danger-text)" : undefined }}>{cell.failedUnits}</td><td>{cell.openUnits}</td><td>{cell.activeLeads}</td><td>{formatDateTime(cell.lastRunAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">Directory candidates from this run</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              These are canonical Google Places businesses stored for the future listing database. Probe mode stores these candidates without creating active sales leads.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Metric label="Shown" value={String(probeCandidates.length)} />
            <Metric label="No website" value={String(noWebsiteCandidateCount)} />
            <Metric label="Already leads" value={String(activeLeadCandidateCount)} />
          </div>
        </div>
        {probeCandidatesStatus === "loading" ? <EmptyPanel label="Loading directory candidates..." /> : probeCandidatesStatus === "error" || probeCandidatesStatus === "timeout" ? (
          <RetryPanel label="Directory candidates are temporarily unavailable." status={probeCandidatesStatus} onRetry={() => loadProbeCandidatesPanel(effectiveRunId)} />
        ) : probeCandidates.length === 0 ? (
          <EmptyPanel label={run ? "No canonical directory candidates were observed for this run yet." : "Select a discovery item to inspect directory candidates."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table min-w-[1180px]">
              <thead><tr><th>Status</th><th>Business</th><th>Website</th><th>Phone</th><th>Rating</th><th>Category</th><th>Location context</th><th>Last seen</th><th>Map</th></tr></thead>
              <tbody>{probeCandidates.map((candidate) => (
                <tr key={candidate.placeId}>
                  <td><StatusPill status={candidate.listingStatus.toLowerCase().replace(/\s+/g, "_")} /></td>
                  <td>
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>{candidate.name ?? "Unnamed business"}</div>
                    <div className="max-w-80 truncate text-xs" style={{ color: "var(--text-tertiary)" }}>{candidate.address ?? candidate.placeId}</div>
                  </td>
                  <td>{candidate.websiteUri ? <a href={candidate.websiteUri} target="_blank" rel="noreferrer" className="underline underline-offset-2">Website</a> : <span style={{ color: "var(--danger-text)" }}>No website</span>}</td>
                  <td>{candidate.phone ?? "Missing"}</td>
                  <td>{candidate.rating ? `${candidate.rating.toFixed(1)} (${candidate.userRatingCount ?? 0})` : "Unrated"}</td>
                  <td>{candidate.category ?? candidate.primaryType ?? candidate.categories[0] ?? "Unknown"}</td>
                  <td>{candidate.queryLocationLabel ?? [candidate.marketId, candidate.locationCellId, candidate.countryCode].filter(Boolean).join(" / ")}</td>
                  <td>{formatDateTime(candidate.lastObservedAt ?? candidate.lastSeenAt)}</td>
                  <td>{candidate.mapsUri ? <a href={candidate.mapsUri} target="_blank" rel="noreferrer" className="underline underline-offset-2">Open</a> : "None"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="section-label">Backend Work Queue</h3><p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{filteredUnits.length} units shown</p></div>
        </div>
        {unitPreviewStatus === "loading" ? <EmptyPanel label="Loading backend work queue preview..." /> : unitPreviewStatus === "error" || unitPreviewStatus === "timeout" ? (
          <RetryPanel label="Backend work queue preview is temporarily unavailable." status={unitPreviewStatus} onRetry={() => loadUnitPreviewPanel(effectiveRunId)} />
        ) : filteredUnits.length === 0 ? <EmptyPanel label={run ? "No units match the current filters." : "Start a discovery run to create work units."} /> : (
          <div className="overflow-x-auto">
            <table className="glass-table min-w-[980px]">
              <thead><tr><th>Status</th><th>Location</th><th>Country</th><th>Category</th><th>Attempts</th><th>Pages</th><th>Raw</th><th>New</th><th>Dupes</th><th>Leads</th><th>Last Activity</th><th>Notes</th></tr></thead>
              <tbody>{filteredUnits.map((unit) => {
                const unitNote = formatUnitNote(unit);
                return (
                  <tr key={unit.id}>
                    <td><StatusPill status={unit.status} /></td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{unit.query_location_label ?? unit.zip}</td>
                    <td>{unit.country_code ?? "US"}</td>
                    <td>{unit.category.replace(/_/g, " ")}</td>
                    <td>{unit.attempt_count}/{unit.max_attempts}</td>
                    <td>{unit.pages_fetched}/{unit.max_pages}</td>
                    <td>{unit.raw_places_seen}</td>
                    <td>{unit.new_places_seen}</td>
                    <td>{unit.duplicate_places_seen}</td>
                    <td>{unit.discovered_count}</td>
                    <td>{formatDateTime(unit.next_retry_at ?? unit.started_at ?? unit.finished_at ?? unit.created_at)}</td>
                    <td className="max-w-72 truncate" title={unitNote}>{unitNote}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {progressStatus === "loading" && <section className="glass rounded-2xl p-6"><EmptyPanel label="Loading run progress..." /></section>}
      {(progressStatus === "error" || progressStatus === "timeout") && <section className="glass rounded-2xl p-6"><RetryPanel label="Run progress is temporarily unavailable." status={progressStatus} onRetry={() => loadProgressPanel(effectiveRunId)} /></section>}
      {geography && <section className="glass rounded-2xl p-6"><h3 className="section-label">Colorado compatibility</h3><p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>{geography.zipCodesCompleted}/{geography.zipCodesSelected} selected Colorado ZIP-compatible cells completed. {geography.zipCodesNotSelected} active Colorado cells were not selected for this run.</p></section>}
      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.actionLabel}
          cancelLabel="Keep item unchanged"
          busy={busy !== null}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            try {
              await confirmAction.action();
            } finally {
              setConfirmAction(null);
            }
          }}
        />
      )}
    </PageShell>
  );
}

function formatDiscoveryItemLabel(item: DiscoveryItemSummary): string {
  const units = item.totalUnits === 1 ? "1 unit" : `${item.totalUnits} units`;
  return `${item.name} - ${formatDateTime(item.createdAt)} - ${units} - ${formatLabel(item.status)}`;
}

function Select({ label, value, onChange, options, labels = {} }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return <label className="flex min-w-0 flex-col gap-1"><span className="section-label">{label}</span><select className="glass-select w-full min-w-0 max-w-full" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labels[option] ?? formatLabel(option)}</option>)}</select></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border px-3 py-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}><p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p><p className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p></div>;
}

function OperationalPanel({
  title,
  message,
  details = [],
  tone,
  actions,
}: {
  title: string;
  message: string;
  details?: Array<string | null>;
  tone: "danger" | "warning" | "info";
  actions?: ReactNode;
}) {
  const colors = operationalPanelColors(tone);
  const visibleDetails = details.filter((detail): detail is string => Boolean(detail));
  return (
    <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.text }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</p>
          <p className="mt-1 font-medium" style={{ color: "var(--text-primary)" }}>{message}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {visibleDetails.length > 0 && (
        <ul className="mt-3 grid gap-1 text-xs leading-relaxed">
          {visibleDetails.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      )}
    </div>
  );
}

function operationalPanelColors(tone: "danger" | "warning" | "info") {
  const style = getStatusToneStyle(tone);
  return {
    background: String(style.background),
    border: String(style.borderColor),
    text: String(style.color),
  };
}

function EmptyPanel({ label }: { label: string }) {
  return <div className="rounded-xl border p-5 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>{label}</div>;
}

function RetryPanel({ label, status, onRetry }: { label: string; status: PanelStatus; onRetry: () => void }) {
  return (
    <div className="rounded-xl border p-5 text-sm" style={getStatusToneStyle("warning")}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-xs">Diagnostic: {status === "timeout" ? "coverage_load_timeout" : "coverage_data_unavailable"}</p>
      <button type="button" className="btn-glass mt-3 text-xs" onClick={onRetry}>Retry this panel</button>
    </div>
  );
}

function Alert({ text, tone }: { text: string; tone: "error" }) {
  void tone;
  return <div className="rounded-xl border px-4 py-3 text-sm" role="alert" style={getStatusToneStyle("danger")}>{text}</div>;
}

function StatusPill({ status }: { status: string }) {
  return <span className="rounded-full border px-2.5 py-1 text-xs font-medium capitalize" style={getStatusToneStyle(statusTone(status))}>{status.replace(/_/g, " ")}</span>;
}

function statusTone(status: string): "success" | "danger" | "warning" | "info" | "muted" {
  if (status === "done") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (status === "retry_wait" || status === "canceled") return "warning";
  if (status === "running" || status === "queued" || status === "pending") return "info";
  return "muted";
}

function formatRunStatus(status: string | null): string {
  if (!status) return "No run";
  if (status === "retry_wait") return "Retrying later";
  if (status === "done") return "Complete";
  return formatLabel(status);
}

function formatLabel(value: string): string {
  if (value === "all") return "All";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusFromLoadError(loadError?: CoverageLoadError): PanelStatus {
  if (!loadError) return "ready";
  return loadError === "coverage_load_timeout" || loadError === "db_statement_timeout" ? "timeout" : "error";
}

function formatCoverageLoadError(loadError: CoverageLoadError): string {
  if (loadError === "db_statement_timeout") return "db_statement_timeout";
  if (loadError === "transient_db_error") return "transient_db_error";
  if (loadError === "coverage_load_timeout") return "coverage_load_timeout";
  return "coverage_data_unavailable";
}

function formatKeySource(source: "ui" | "env" | "none"): string {
  if (source === "ui") return "Settings UI stored";
  if (source === "env") return "Vercel environment";
  return "not configured";
}

function formatUnitNote(unit: CrawlUnitPreview): string {
  if (unit.status === "retry_wait") {
    const retryLabel = unit.next_retry_at ? formatDateTime(unit.next_retry_at) : "the next scheduler pass";
    return `Retry after ${retryLabel}${unit.last_error_code ? ` (${unit.last_error_code})` : ""}`;
  }
  if (unit.last_error) return unit.last_error_code ? `${unit.last_error_code}: ${unit.last_error}` : unit.last_error;
  if (unit.budget_blocked_at) return `Previously paused at ${formatDateTime(unit.budget_blocked_at)}`;
  if (unit.next_page_token) return "More pages queued";
  return "";
}

function withCoverageClientTimeout<T>(promise: Promise<T>, timeoutMs = 11_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("coverage_client_timeout")), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}
