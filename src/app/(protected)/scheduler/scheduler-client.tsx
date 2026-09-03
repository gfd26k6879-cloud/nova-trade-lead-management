"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import {
  getSchedulerOperationsAction,
} from "@/lib/crawl/actions";
import {
  SCHEDULER_WORKER_METADATA,
  getSchedulerWorkerMetadata,
} from "@/lib/scheduler/worker-metadata";
import { getStatusToneStyle, type StatusTone } from "@/lib/status-tone";

type SchedulerOperations = Awaited<ReturnType<typeof getSchedulerOperationsAction>>;
type SchedulerWorker = SchedulerOperations["health"]["workers"][number];
type SchedulerStatusCounts = SchedulerOperations["backlogs"]["enrichment"];
type WorkerRun = SchedulerOperations["history"][number];
type SchedulerTab = "overview" | "workers" | "usage" | "history";

const TABS: Array<{ key: SchedulerTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "workers", label: "Workers" },
  { key: "usage", label: "Usage & Backlog" },
  { key: "history", label: "History" },
];

const PIPELINE = [
  { workerName: "crawl" as const, output: "New leads" },
  { workerName: "enrichment" as const, output: "Better evidence" },
  { workerName: "ai_verification" as const, output: "Website truth" },
  { workerName: "artifact" as const, output: "Pitch packs" },
  { workerName: "score_recompute" as const, output: "Queue priority" },
];

export function SchedulerClient({ initialOperations }: { initialOperations: SchedulerOperations }) {
  const [operations, setOperations] = useState(initialOperations);
  const [activeTab, setActiveTab] = useState<SchedulerTab>("overview");
  const workersByName = useMemo(() => new Map(operations.health.workers.map((worker) => [worker.workerName, worker])), [operations.health.workers]);
  const activeWorkers = operations.health.workers.filter((worker) => worker.enabled).length;
  const queueDepth = operations.health.workers.reduce((sum, worker) => sum + worker.queueDepth, 0);
  const blockedWorkers = operations.health.workers.filter((worker) => worker.enabled && worker.warning).length;
  const authWarnings = operations.health.auth?.warnings ?? [];

  const refresh = async () => {
    const next = await getSchedulerOperationsAction();
    setOperations(next);
  };

  return (
    <PageShell
      title="Scheduler"
      description="Background workers that move discovery, enrichment, AI verification, pitch packs, and scoring without needing the browser to stay open."
      stats={[
        { label: "Workers On", value: `${activeWorkers} / ${operations.health.workers.length}`, hint: blockedWorkers > 0 ? `${blockedWorkers} need attention` : "healthy or idle" },
        { label: "Background Queue", value: formatNumber(queueDepth), hint: "pending across all workers" },
        { label: "AI Queue", value: formatNumber(operations.backlogs.aiQueue.queued + operations.backlogs.aiQueue.running), hint: `${formatNumber(operations.backlogs.aiQueue.verified)} verified` },
        { label: "Google Calls", value: formatNumber(operations.costs.googleMonth.calls), hint: "this month" },
      ]}
    >
      <section className="glass rounded-2xl p-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? "btn-primary text-sm" : "btn-glass text-sm"}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
            Worker controls are managed at platform level.
          </div>
        </div>
      </section>

      {operations.health.database.staleClientReads.length > 0 && (
        <section className="rounded-2xl border p-4 text-sm" style={getStatusToneStyle("warning")}>
          <div className="font-semibold">Database reads may be stalled</div>
          <p className="mt-1">
            {operations.health.database.staleClientReads.length} active ClientRead query
            {operations.health.database.staleClientReads.length === 1 ? "" : "ies"} older than 60 seconds. Public health can still be green while protected pages wait on these reads.
          </p>
        </section>
      )}

      {authWarnings.length > 0 && (
        <section className="rounded-2xl border p-4 text-sm" role="alert" style={getStatusToneStyle("danger")}>
          <div className="font-semibold">Auth recovery configuration needs attention</div>
          <p className="mt-1">{authWarnings.join(" ")}</p>
          {operations.health.auth?.callbackUrl && (
            <p className="mt-1 text-xs">Expected callback URL: {operations.health.auth.callbackUrl}</p>
          )}
        </section>
      )}

      {activeTab === "overview" && (
        <section className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="section-label">Pipeline</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Supabase Cron calls these internal endpoints. Each endpoint checks its toggle, processes one safe unit of work, records a worker run, and exits.
                </p>
              </div>
              <Link href="/coverage" className="btn-glass text-sm">Discovery Monitor</Link>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-5">
              {PIPELINE.map((step, index) => {
                const metadata = getSchedulerWorkerMetadata(step.workerName);
                const worker = workersByName.get(step.workerName);
                return (
                  <article key={step.workerName} className="rounded-xl p-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="section-label">Step {index + 1}</span>
                      <StatusPill worker={worker} />
                    </div>
                    <h4 className="mt-3 text-base font-semibold" style={{ color: "var(--text-primary)" }}>{metadata.shortLabel}</h4>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{metadata.purpose}</p>
                    <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>{step.output}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <BacklogPanel
              title="Discovery Run"
              rows={[
                ["Status", titleCase(operations.activeDiscovery.status)],
                ["Done", operations.activeDiscovery.progress ? formatNumber(operations.activeDiscovery.progress.done) : "0"],
                ["Remaining", operations.activeDiscovery.progress ? formatNumber(operations.activeDiscovery.progress.pending + operations.activeDiscovery.progress.running) : "0"],
                ["Coverage cells searched", operations.activeDiscovery.geography ? `${formatNumber(operations.activeDiscovery.geography.zipCodesCompleted)} / ${formatNumber(operations.activeDiscovery.geography.zipCodesSelected)}` : "0 / 0"],
              ]}
            />
            <BacklogPanel
              title="Lead Readiness"
              rows={[
                ["Ready to call", formatNumber(operations.backlogs.leads.readyToCall)],
                ["Broken-site opportunities", formatNumber(operations.backlogs.leads.brokenSiteOpportunities)],
                ["Needs AI verify", formatNumber(operations.backlogs.leads.needsAiVerify)],
                ["Manual review", formatNumber(operations.backlogs.leads.needsManualReview)],
              ]}
            />
            <BacklogPanel
              title="AI Verification"
              rows={[
                ["Queued", formatNumber(operations.backlogs.aiQueue.queued)],
                ["Running", formatNumber(operations.backlogs.aiQueue.running)],
                ["Verified", formatNumber(operations.backlogs.aiQueue.verified)],
                ["Errors", formatNumber(operations.backlogs.aiQueue.error)],
              ]}
            />
          </section>
        </section>
      )}

      {activeTab === "workers" && (
        <section className="grid gap-4 xl:grid-cols-2">
          {SCHEDULER_WORKER_METADATA.map((metadata) => {
            const worker = workersByName.get(metadata.workerName);
            if (!worker) return null;
            return (
              <WorkerCard
                key={metadata.workerName}
                worker={worker}
              />
            );
          })}
        </section>
      )}

      {activeTab === "usage" && (
        <section className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-4">
            <UsageCard label="Google Today" usage={operations.costs.googleToday} />
            <UsageCard label="Google Month" usage={operations.costs.googleMonth} />
            <MetricTile label="AI Queued" value={formatNumber(operations.backlogs.aiQueue.queued)} />
            <MetricTile label="AI Verified" value={formatNumber(operations.backlogs.aiQueue.verified)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <StatusCountCard title="Enrichment Backlog" counts={operations.backlogs.enrichment} />
            <StatusCountCard title="Business Detail Briefs" counts={operations.backlogs.artifacts.businessDetail} />
            <StatusCountCard title="Competitive Reports" counts={operations.backlogs.artifacts.competitiveReport} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="Website Status" rows={operations.backlogs.leads.websiteStatus} />
            <BreakdownCard title="Quality Buckets" rows={operations.backlogs.leads.qualityBuckets} />
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <MetricTile label="Usable Sites Found" value={formatNumber(operations.backlogs.leads.usableSiteFound)} />
            <MetricTile label="No-Site Verified" value={formatNumber(operations.backlogs.leads.noSiteVerified)} />
            <MetricTile label="Ready to Call" value={formatNumber(operations.backlogs.leads.readyToCall)} />
            <MetricTile label="Broken Sites" value={formatNumber(operations.backlogs.leads.brokenSiteOpportunities)} />
          </section>
        </section>
      )}

      {activeTab === "history" && (
        <section className="glass rounded-2xl p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="section-label">Recent Worker Runs</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                The last recorded worker attempts, including Supabase Cron calls, manual calls, idle runs, and errors.
              </p>
            </div>
            <button type="button" className="btn-glass text-sm" onClick={refresh}>Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>HTTP</th>
                  <th>Trigger</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {operations.history.length === 0 ? (
                  <tr><td colSpan={6}>No worker runs recorded yet.</td></tr>
                ) : operations.history.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.started_at)}</td>
                    <td>{getSchedulerWorkerMetadata(run.worker_name).label}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td>{run.http_status ?? "N/A"}</td>
                    <td>{run.trigger_source}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer">{formatWorkerResult(run)}</summary>
                        <pre className="mt-2 max-w-xl overflow-auto rounded-lg p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-secondary)" }}>
                          {JSON.stringify({ result: run.result_json, error: run.error }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PageShell>
  );
}

function WorkerCard({ worker }: { worker: SchedulerWorker }) {
  const metadata = getSchedulerWorkerMetadata(worker.workerName);
  const progressPct = workerProgressPct(worker);
  const nextAction = getNextAction(worker);

  return (
    <article className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{metadata.label}</h3>
            <StatusPill worker={worker} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{metadata.purpose}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoRow label="Internal endpoint" value={metadata.endpoint} mono />
        <InfoRow label="Paid API" value={metadata.externalApi} />
        <InfoRow label="Schedule" value={metadata.schedule} />
        <InfoRow label="Usage signal" value={metadata.costSource} />
        <InfoRow label="Input" value={metadata.inputLabel} />
        <InfoRow label="Output" value={metadata.outputLabel} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span>{formatNumber(worker.progress.completed)} completed</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--status-muted-bg)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: worker.enabled ? "var(--accent)" : "var(--status-muted-text)" }} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <MetricTile label="Queue" value={formatNumber(worker.queueDepth)} />
        <MetricTile label="Running" value={formatNumber(worker.progress.running)} />
        <MetricTile label="ETA" value={formatEta(worker.estimatedMinutesToDrain)} />
        <MetricTile label="24h Errors" value={formatNumber(worker.errors24h)} />
      </div>

      <div className="mt-4 rounded-xl p-4" style={{ background: worker.enabled ? "var(--surface-muted)" : "var(--status-muted-bg)", border: `1px solid ${worker.enabled ? "var(--surface-card-border)" : "var(--status-muted-border)"}` }}>
        <p className="section-label">Next Action</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: nextAction.tone === "warning" ? "var(--warning-text)" : "var(--text-secondary)" }}>{nextAction.message}</p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Last run: {worker.lastRun ? `${formatDateTime(worker.lastRun.started_at)} · ${formatWorkerResult(worker.lastRun)}` : "Never"}
        </p>
      </div>
    </article>
  );
}

function BacklogPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <article className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>{label}</span>
            <strong style={{ color: "var(--text-primary)" }}>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
      <p className="section-label">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function UsageCard({ label, usage, value, sub }: { label: string; usage?: SchedulerOperations["costs"]["googleToday"]; value?: string; sub?: string }) {
  const displayValue = usage ? formatNumber(usage.calls) : value ?? "N/A";
  const displaySub = usage ? `${formatNumber(usage.discoveryCalls)} search / ${formatNumber(usage.enrichmentCalls)} details` : sub;
  return <MetricTile label={label} value={displayValue} sub={displaySub} />;
}

function StatusCountCard({ title, counts }: { title: string; counts: SchedulerStatusCounts }) {
  return (
    <article className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricTile label="Missing" value={formatNumber(counts.missing)} />
        <MetricTile label="Queued" value={formatNumber(counts.pending)} />
        <MetricTile label="Running" value={formatNumber(counts.running)} />
        <MetricTile label="Complete" value={formatNumber(counts.completed)} />
        <MetricTile label="Errors" value={formatNumber(counts.failed)} />
        <MetricTile label="Total" value={formatNumber(counts.total)} />
      </div>
    </article>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <article className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No data yet.</p>
        ) : rows.map((row) => {
          const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--text-secondary)" }}>{titleCase(row.key)}</span>
                <span style={{ color: "var(--text-primary)" }}>{formatNumber(row.count)} · {pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--status-muted-bg)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
      {sub && <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{sub}</p>}
    </div>
  );
}

function StatusPill({ worker }: { worker?: SchedulerWorker }) {
  const label = !worker ? "Unknown" : !worker.enabled ? "Paused" : worker.warning ? "Needs attention" : worker.lastRun?.status ? titleCase(worker.lastRun.status) : "No runs";
  const style = statusStyle(worker);
  return (
    <span className="rounded-md border px-2.5 py-1 text-xs font-medium" style={style}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = runStatusStyle(status);
  return <span className="rounded-md border px-2 py-1 text-xs font-medium" style={style}>{status === "budget_limit" ? "Stopped" : titleCase(status)}</span>;
}

function statusStyle(worker?: SchedulerWorker) {
  if (!worker || !worker.enabled) return getStatusToneStyle("muted");
  if (worker.warning) return getStatusToneStyle("warning");
  if (worker.lastRun?.status === "error" || worker.lastRun?.status === "budget_limit") return getStatusToneStyle("danger");
  return getStatusToneStyle("success");
}

function runStatusStyle(status: string) {
  let tone: StatusTone = "info";
  if (status === "error" || status === "budget_limit") tone = "danger";
  else if (status === "disabled" || status === "interrupted") tone = "muted";
  else if (status === "processed" || status === "idle") tone = "success";
  return getStatusToneStyle(tone);
}

function getNextAction(worker: SchedulerWorker): { message: string; tone: "normal" | "warning" } {
  if (!worker.enabled) {
    return { message: "Paused. Supabase Cron can still call the endpoint, but the app skips this worker until it is resumed.", tone: "normal" };
  }
  if (worker.warning) return { message: worker.warning, tone: "warning" };
  if (worker.queueDepth === 0) return { message: "No queued work. This worker is healthy and waiting for new work.", tone: "normal" };
  return { message: "Queued work exists. Supabase Cron should continue draining it at the configured cadence.", tone: "normal" };
}

function workerProgressPct(worker: SchedulerWorker): number {
  if (worker.progress.total <= 0) return 0;
  return Math.min(100, Math.round((worker.progress.completed / worker.progress.total) * 100));
}

function formatWorkerResult(run: WorkerRun): string {
  const result = run.result_json;
  const leadName = typeof result.leadName === "string" ? result.leadName : null;
  const count = typeof result.count === "number" ? result.count : null;
  const reason = typeof result.reason === "string" ? result.reason : null;
  const status = typeof result.status === "string" ? result.status : null;
  if (leadName) return leadName;
  if (count !== null) return `${formatNumber(count)} items`;
  if (reason) return reason;
  if (run.error) return run.error;
  return titleCase(status ?? run.status);
}

function formatEta(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "N/A";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
