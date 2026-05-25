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
  stopCrawlRunAction,
  retryFailedUnitsAction,
  getDashboardStatsAction,
} from "@/lib/crawl/actions";
import { queueMissingAiVerificationsAction } from "@/lib/leads/actions";
import type { AdminFulfillmentSummary, AdminRequest, StatisticsSummary, TeamBoardSummary } from "@/lib/db/queries";

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
  const [aiBackfillLoading, setAiBackfillLoading] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const aiRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const s = await getDashboardStatsAction();
      setStats(s);
      setPollError(null);
      if (s.runStatus !== "running") {
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

  const handleStop = async () => {
    setLoading(true);
    const result = await stopCrawlRunAction();
    if ("error" in result) {
      toast.error(result.error ?? "Unable to stop discovery");
    } else {
      setIsProcessing(false);
      toast.success(`Discovery stopped. ${result.canceledUnits} queued units canceled.`);
    }
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

  const isRunning = stats.runStatus === "running";
  const isQueued = stats.runStatus === "queued";
  const isPaused = stats.runStatus === "paused";
  const canStop = isRunning || isQueued || isPaused;
  const isIdle = !isRunning && !isQueued && !isPaused;
  const progress = stats.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const activeWorkerCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled).length;
  const pausedWorkerCount = stats.schedulerHealth.workers.length - activeWorkerCount;
  const backgroundQueueDepth = stats.schedulerHealth.workers.reduce((sum, worker) => sum + worker.queueDepth, 0);
  const workerIssueCount = stats.schedulerHealth.workers.filter((worker) => worker.enabled && worker.warning).length;
  const contactsThisWeek = teamSummary.members.reduce((sum, member) => sum + member.contacts_7d, 0);
  const claimedActive = teamSummary.members.reduce((sum, member) => sum + member.claimed_active, 0);

  return (
    <PageShell
      title="Revenue Dashboard"
      description="Track pipeline, follow-ups, team accountability, and the work most likely to turn into paid clients."
      stats={[
        { label: "Pipeline", value: formatCurrency(weeklyStats.economics.pipelineValue), hint: "last 7 days" },
        { label: "Contacts This Week", value: String(contactsThisWeek) },
        { label: "Meetings", value: String(weeklyStats.kpis.meetings), hint: "last 7 days" },
        { label: "Won / Lost", value: `${weeklyStats.kpis.closedWon} / ${weeklyStats.kpis.closedLost}`, hint: "last 7 days" },
        { label: "Overdue Follow-ups", value: String(teamSummary.overdueFollowUps) },
        { label: "Unclaimed Ready", value: String(teamSummary.unassignedReady) },
        { label: "Steve Queue", value: String(fulfillmentSummary.openTotal), hint: "website + quote" },
      ]}
    >
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">My Fulfillment Queue</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Website and quote requests sent by researchers for admin follow-through.
            </p>
          </div>
          <Link href="/fulfillment" className="btn-primary text-sm">Open Fulfillment</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AttentionCard label="Website requests" value={fulfillmentSummary.openWebsiteRequests} href="/fulfillment?type=website_request" cta="Design queue" />
          <AttentionCard label="Quote requests" value={fulfillmentSummary.openQuoteRequests} href="/fulfillment?type=quote_request" cta="Price leads" />
          <AttentionCard label="Waiting on researcher" value={fulfillmentSummary.waitingOnResearcher} href="/fulfillment?status=waiting_on_researcher" cta="Unblock" />
          <AttentionCard label="Overdue requests" value={fulfillmentSummary.overdueRequests} href="/fulfillment?status=open" cta="Review today" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {fulfillmentSummary.latestRequests.length === 0 ? (
            <p className="rounded-xl p-4 text-sm lg:col-span-2" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
              No website or quote requests are waiting on Steve.
            </p>
          ) : fulfillmentSummary.latestRequests.slice(0, 4).map((request) => (
            <FulfillmentMiniCard key={request.id} request={request} />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="section-label">Today needs attention</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                Clear these before starting more discovery.
              </p>
            </div>
            <Link href="/queue" className="btn-primary text-sm">Open Workbench</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AttentionCard label="Overdue follow-ups" value={teamSummary.overdueFollowUps} href="/team" cta="Review owners" />
            <AttentionCard label="Unclaimed ready leads" value={teamSummary.unassignedReady} href="/leads?assigned=unassigned" cta="Assign or claim" />
            <AttentionCard label="Needs follow-up" value={stats.needsFollowUp} href="/leads?status=contacted" cta="Open leads" />
            <AttentionCard label="Claimed active" value={claimedActive} href="/team" cta="Team board" />
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="section-label">Latest activity</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                Recent outreach logged by the team.
              </p>
            </div>
            <Link href="/team" className="btn-glass text-sm">Open Team Board</Link>
          </div>
          <div className="mt-4 space-y-3">
            {teamSummary.latestActivity.length === 0 ? (
              <p className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
                No outreach activity has been logged yet.
              </p>
            ) : teamSummary.latestActivity.slice(0, 5).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Team performance</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Ownership, follow-up pressure, contacts, meetings, and closes by person.
            </p>
          </div>
          <Link href="/team" className="btn-glass text-sm">Open full board</Link>
        </div>
        {teamSummary.members.length === 0 ? (
          <p className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
            No active team members yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teamSummary.members.map((member) => (
              <TeamMemberCard key={member.user_id} member={member} />
            ))}
          </div>
        )}
      </section>

      <details className="group">
        <summary className="glass flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <div>
            <h3 className="section-label">Operations</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Discovery, scheduler, AI queue, enrichment, cost, and run controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: "var(--text-tertiary)" }}>
              {isRunning ? "Running" : isQueued ? "Queued" : isPaused ? "Paused" : "Idle"} · {backgroundQueueDepth.toLocaleString()} queued
            </span>
            <span className="btn-glass text-sm">Expand operations</span>
          </div>
        </summary>
        <div className="mt-5 space-y-5">
      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="section-label">Background Work</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Scheduler controls, worker explanations, costs, backlog counts, and recent run history now live in the Scheduler operations center.
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

      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="section-label">Discovery Workflow</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Start here when you want new businesses. Pick counties, ZIP codes, and categories below, then open Discovery Monitor to see the exact ZIP/category units being processed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isIdle && (
              <a href="#run-controls" className="btn-primary text-sm">
                Choose ZIPs & Start
              </a>
            )}
            {isRunning && (
              <button type="button" className="btn-glass text-sm" onClick={() => setConfirmAction({
                title: "Pause Discovery",
                message: "This will stop processing new ZIP/category units. You can resume the run later.",
                action: handlePause,
              })} disabled={loading}>
                Pause Discovery
              </button>
            )}
            {isPaused && (
              <button type="button" className="btn-primary text-sm" onClick={handleResume} disabled={loading}>
                Resume Discovery
              </button>
            )}
            {canStop && (
              <button type="button" className="btn-glass text-sm" onClick={() => setConfirmAction({
                title: "Stop Discovery",
                message: "This permanently stops the current run and marks unprocessed ZIP/category units as canceled. Completed leads stay saved.",
                action: handleStop,
              })} disabled={loading}>
                Stop Discovery
              </button>
            )}
            <Link href="/coverage" className="btn-glass text-sm">
              Open Discovery Monitor
            </Link>
          </div>
        </div>
      </section>

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
            <span>{progress.done} done / {progress.failed} failed / {progress.canceled} canceled / {progress.pending + progress.running} remaining of {progress.total} total</span>
            {stats.zipCodesSelected > 0 && (
              <span>
                Geography: {stats.zipCodesCompleted}/{stats.zipCodesSelected} selected zips completed, {stats.zipCodesNotStarted} selected zips not started, {stats.zipCodesNotSelected} active zips not selected
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
          <p className="text-xs font-medium" style={{ color: "#991b1b" }}>Last Error</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{stats.lastError}</p>
        </section>
      )}

      {/* Run controls */}
      <section id="run-controls" className="glass rounded-2xl p-6 scroll-mt-24">
        <h3 className="section-label">Start or Pause Discovery</h3>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isIdle && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={handleStart}
                disabled={loading || selectedCategories.length === 0 || locationScope.zipCodes.length === 0}
              >
                Start Discovery
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
              title: "Pause Discovery",
              message: "This will stop processing new ZIP/category units. You can resume the run later.",
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
          {isPaused && (
            <button type="button" className="btn-primary" onClick={handleResume} disabled={loading}>
              Resume Discovery
            </button>
          )}
          {canStop && (
            <button type="button" className="btn-glass" onClick={() => setConfirmAction({
              title: "Stop Discovery",
              message: "This permanently stops the current run and marks unprocessed ZIP/category units as canceled. Completed leads stay saved.",
              action: handleStop,
            })} disabled={loading}>
              Stop Discovery
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
            Discovery is processing ZIP/category units... polling every 3 seconds.
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
            {isEnriching && (
              <button type="button" className="btn-glass text-sm" onClick={() => setIsEnriching(false)}>
                Stop Local Polling
              </button>
            )}
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
          {isAiVerifying && (
            <button type="button" className="btn-glass text-sm" onClick={() => setIsAiVerifying(false)}>
              Stop Local Polling
            </button>
          )}
          <button type="button" className="btn-glass text-sm" onClick={handleQueueMissingAi} disabled={loading || aiBackfillLoading || stats.aiQueueStats.notChecked === 0}>
            {aiBackfillLoading ? "Queueing..." : "Queue Missing AI Verifications"}
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
          <Link href="/coverage" className="btn-primary text-sm">Open Discovery Monitor</Link>
          <Link href="/queue" className="btn-primary text-sm">Open Workbench</Link>
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

function FulfillmentMiniCard({ request }: { request: AdminRequest }) {
  const owner = request.lead_owner_display_name || request.lead_owner_email || request.creator_display_name || request.creator_email || "Unassigned";
  const teamLead = request.creator_team_lead_display_name || request.creator_team_lead_email || request.creator_team_label;
  return (
    <article
      className="rounded-xl p-4"
      style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.5)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link className="link-accent break-words font-semibold" href={`/leads/${request.lead_id}`}>
            {request.lead_name ?? "Unknown business"}
          </Link>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {formatAdminRequestType(request.request_type)} · {formatOutcome(request.status)}
          </p>
        </div>
        <Link href="/fulfillment" className="btn-glass text-xs">Open</Link>
      </div>
      <p className="mt-3 line-clamp-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        {request.summary ?? request.next_step ?? "No summary yet."}
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
        Owner: {owner}{teamLead ? ` · Team: ${teamLead}` : ""}
      </p>
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
        <Link className="link-accent break-words font-medium" href={`/leads/${activity.lead_id}`}>
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

function formatAdminRequestType(type: string): string {
  return type === "quote_request" ? "Quote requested" : "Website needed";
}
