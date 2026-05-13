"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocationScopePicker, type LocationScopeValue } from "@/components/location-scope-picker";
import {
  startCrawlRunAction,
  pauseCrawlRunAction,
  resumeCrawlRunAction,
  retryFailedUnitsAction,
  getDashboardStatsAction,
} from "@/lib/crawl/actions";

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

interface AiQueueStats {
  notChecked: number;
  queued: number;
  running: number;
  verified: number;
  error: number;
  total: number;
}

interface DashboardStats {
  runStatus: string;
  runId: string | null;
  leadsTotal: number;
  leadsToday: number;
  failedUnits: number;
  progress: { total: number; done: number; failed: number; pending: number; running: number } | null;
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
  countiesSelected: number;
  countiesCompleted: number;
  aiQueueStats: AiQueueStats;
}

export function DashboardClient({ initialStats }: { initialStats: DashboardStats }) {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [locationScope, setLocationScope] = useState<LocationScopeValue>({ state: "CO", counties: [], zipCodes: [] });
  const [isProcessing, setIsProcessing] = useState(stats.runStatus === "running");
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => Promise<void> } | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null);
  const enrichRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAiVerifying, setIsAiVerifying] = useState(false);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const aiRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const s = await getDashboardStatsAction();
      setStats(s);
      if (s.runStatus !== "running") {
        setIsProcessing(false);
      }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }, [refreshStats]);

  useEffect(() => {
    if (isProcessing) {
      pollingRef.current = setInterval(pollProcess, 3000);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [isProcessing, pollProcess]);

  const handleStart = async () => {
    setLoading(true);
    const result = await startCrawlRunAction({
      state: locationScope.state,
      counties: locationScope.counties,
      zipCodes: locationScope.zipCodes,
      categories: selectedCategories,
    });
    if ("error" in result) {
      toast.error(result.error ?? "Unknown error");
    } else {
      toast.success(
        `Started crawl: ${result.unitCount} units across ${result.selectedZipCount} zips in ${result.selectedCountyCount} counties`
      );
      setIsProcessing(true);
    }
    await refreshStats();
    setLoading(false);
  };

  const handlePause = async () => {
    setLoading(true);
    await pauseCrawlRunAction();
    setIsProcessing(false);
    toast.info("Run paused");
    await refreshStats();
    setLoading(false);
  };

  const handleResume = async () => {
    setLoading(true);
    await resumeCrawlRunAction();
    setIsProcessing(true);
    toast.info("Run resumed");
    await refreshStats();
    setLoading(false);
  };

  const handleRetry = async () => {
    setLoading(true);
    const result = await retryFailedUnitsAction();
    if ("error" in result) {
      toast.error(result.error ?? "Unknown error");
    } else {
      toast.success(`Retrying ${result.retriedCount} failed units`);
      setIsProcessing(true);
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
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
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

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const isRunning = stats.runStatus === "running";
  const isPaused = stats.runStatus === "paused";
  const isIdle = !isRunning && !isPaused;
  const progress = stats.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <PageShell
      title="Dashboard"
      description="Monitor run health, lead throughput, and daily focus."
      stats={[
        { label: "Run Status", value: isRunning ? "Running" : isPaused ? "Paused" : "Idle" },
        { label: "Total Leads", value: String(stats.leadsTotal) },
        { label: "Qualified", value: String(stats.qualifiedLeadCount) },
        { label: "Leads Today", value: String(stats.leadsToday) },
        { label: "Today's Focus", value: String(stats.todayFocus) },
        { label: "Needs Follow-up", value: String(stats.needsFollowUp) },
        { label: "AI Queued", value: String(stats.aiQueueStats.queued) },
        { label: "Failed Units", value: String(stats.failedUnits) },
      ]}
    >
      {/* Progress bar */}
      {progress && progress.total > 0 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="section-label">Run Progress</h3>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "var(--accent)" }}
              />
            </div>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{pct}%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span>{progress.done} done / {progress.failed} failed / {progress.pending + progress.running} remaining of {progress.total} total</span>
            {stats.zipCodesSelected > 0 && (
              <span>
                Geography: {stats.zipCodesCompleted}/{stats.zipCodesSelected} zips, {stats.countiesCompleted}/{stats.countiesSelected} counties completed
              </span>
            )}
            {stats.apiCallsUsed > 0 && (
              <span>
                Run API: {stats.apiCallsUsed} calls | ${stats.estimatedCost.toFixed(2)}
                {" "}({stats.discoveryApiCalls} discovery / {stats.enrichmentApiCalls} enrichment)
              </span>
            )}
          </div>
        </section>
      )}

      {(stats.monthlyApiCalls > 0 || stats.monthlyApiCost > 0) && (
        <section className="glass rounded-2xl p-6">
          <h3 className="section-label">API Cost Intelligence</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Monthly Calls" value={String(stats.monthlyApiCalls)} />
            <MetricCard label="Monthly Cost" value={`$${stats.monthlyApiCost.toFixed(2)}`} />
            <MetricCard label="Projected Month-End" value={`$${stats.projectedMonthlyCost.toFixed(2)}`} />
            <MetricCard
              label="Atmosphere Calls"
              value={String(stats.atmosphereEnrichmentCalls)}
              sub={`$${stats.atmosphereEstimatedCost.toFixed(2)} spend`}
            />
          </div>
          <div className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Discovery: {stats.discoveryApiCalls} calls (${stats.discoveryEstimatedCost.toFixed(2)}) •
            {" "}Enrichment: {stats.enrichmentApiCalls} calls (${stats.enrichmentEstimatedCost.toFixed(2)})
          </div>
        </section>
      )}

      {/* Last error */}
      {stats.lastError && (
        <section className="rounded-2xl px-5 py-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-xs font-medium" style={{ color: "#dc2626" }}>Last Error</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{stats.lastError}</p>
        </section>
      )}

      {/* Run controls */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Run Controls</h3>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isIdle && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={handleStart}
                disabled={loading || selectedCategories.length === 0 || locationScope.zipCodes.length === 0}
              >
                Start Run
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {selectedCategories.length === CATEGORY_OPTIONS.length
                  ? "All categories"
                  : `${selectedCategories.length} of ${CATEGORY_OPTIONS.length} categories`}
              </span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {locationScope.zipCodes.length > 0
                  ? `${locationScope.zipCodes.length} zip codes selected`
                  : "Select zip codes to start"}
              </span>
              <button
                type="button"
                className="text-xs font-medium underline underline-offset-2"
                style={{ color: "var(--accent)" }}
                onClick={() => setShowCategories((o) => !o)}
              >
                {showCategories ? "Hide" : "Customize"}
              </button>
            </>
          )}
          {isRunning && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Pause Crawl Run",
              message: "This will pause the current crawl run. You can resume it later.",
              action: handlePause,
            })} disabled={loading}>
              Pause
            </button>
          )}
          {isPaused && (
            <button type="button" className="btn-primary" onClick={handleResume} disabled={loading}>
              Resume
            </button>
          )}
          {stats.failedUnits > 0 && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Retry Failed Units",
              message: `This will retry ${stats.failedUnits} failed crawl units. API calls will be consumed.`,
              action: handleRetry,
            })} disabled={loading}>
              Retry Failed ({stats.failedUnits})
            </button>
          )}
        </div>

        {isIdle && showCategories && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)" }}>
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
                onClick={() => setSelectedCategories([...CATEGORY_OPTIONS])}
              >
                Select All
              </button>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>|</span>
              <button
                type="button"
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
                onClick={() => setSelectedCategories([])}
              >
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

        {isIdle && (
          <>
            <LocationScopePicker
              value={locationScope}
              categories={selectedCategories}
              disabled={loading}
              onChange={setLocationScope}
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <SummaryChip label={`State: ${locationScope.state || "N/A"}`} />
              <SummaryChip label={`Counties: ${locationScope.counties.length}`} />
              <SummaryChip label={`Zip Codes: ${locationScope.zipCodes.length}`} />
              <SummaryChip label={`Categories: ${selectedCategories.length}`} />
            </div>
          </>
        )}

        {isProcessing && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Processing units... polling every 3 seconds.
          </p>
        )}
      </section>

      {/* Enrichment controls */}
      {isIdle && stats.leadsTotal > 0 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="section-label">Lead Enrichment</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Enrich top leads with detailed reviews, website health checks, and competitive analysis.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary text-sm" onClick={handleEnrich} disabled={loading || isEnriching}>
              {isEnriching ? "Enriching..." : "Enrich Top Leads"}
            </button>
            {enrichProgress && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Last: {enrichProgress}
              </span>
            )}
          </div>
          {isEnriching && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Enriching leads... polling every 2 seconds.
            </p>
          )}
        </section>
      )}

      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">AI Verification Queue</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Queued" value={String(stats.aiQueueStats.queued)} />
          <MetricCard label="Running" value={String(stats.aiQueueStats.running)} />
          <MetricCard label="Verified" value={String(stats.aiQueueStats.verified)} />
          <MetricCard label="Errors" value={String(stats.aiQueueStats.error)} />
          <MetricCard label="Not Checked" value={String(stats.aiQueueStats.notChecked)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary text-sm" onClick={handleAiVerify} disabled={loading || isAiVerifying || stats.aiQueueStats.queued === 0}>
            {isAiVerifying ? "Verifying..." : "Process AI Queue"}
          </button>
          {aiProgress && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Last: {aiProgress}
            </span>
          )}
        </div>
        {isAiVerifying && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Processing AI verification jobs... polling every 2.5 seconds.
          </p>
        )}
      </section>

      {/* Quick actions */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Quick Actions</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/queue" className="btn-primary text-sm">Open Now Queue</Link>
          <Link href="/leads" className="btn-glass text-sm">Browse Leads</Link>
        </div>
      </section>

      {/* Conversion metrics */}
      {(stats.conversionMetrics.totalContacted > 0 || stats.qualifiedLeadCount > 0) && (
        <ConversionPanel
          metrics={stats.conversionMetrics}
          qualifiedLeadCount={stats.qualifiedLeadCount}
          costPerQualifiedLead={stats.costPerQualifiedLead}
        />
      )}

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
