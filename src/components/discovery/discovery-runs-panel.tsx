"use client";

import { AsyncState } from "@/components/async-state";

export type DiscoveryRunSummary = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  runId: string;
  status: "planned" | "running" | "completed" | "failed" | "cancelled";
  binding: Readonly<{
    planId: string;
    playStableKey: string;
    playVersionId: string;
    sourceKeys: readonly string[];
  }>;
  budget: Readonly<{ usedCents: number; capCents: number }>;
  tasks: Readonly<{ completed: number; total: number }>;
  lease: Readonly<{
    state: "not_required" | "active" | "expired";
    expiresAt: string | null;
  }>;
  recoveryNeeded: boolean;
  allowedActions: Readonly<{
    open: boolean;
    recover: boolean;
    cancel: boolean;
  }>;
  updatedAt: string;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  runs: readonly DiscoveryRunSummary[];
  onOpen?: (run: DiscoveryRunSummary) => void;
  onRecover?: (run: DiscoveryRunSummary) => void;
  onCancel?: (run: DiscoveryRunSummary) => void;
  error?: never;
}>;

export type DiscoveryRunsPanelProps =
  | Readonly<{ state: "loading"; scope?: never; runs?: never; error?: never; onOpen?: never; onRecover?: never; onCancel?: never }>
  | Readonly<{ state: "error"; scope?: never; runs?: never; error: string; onOpen?: never; onRecover?: never; onCancel?: never }>
  | ReadyProps;

const STATUS = {
  planned: { label: "Planned", symbol: "○", background: "var(--surface-muted)", border: "var(--surface-card-border)", color: "var(--text-secondary)" },
  running: { label: "Running", symbol: "…", background: "var(--warning-bg)", border: "var(--warning-border)", color: "var(--warning-text)" },
  completed: { label: "Completed", symbol: "✓", background: "var(--success-bg)", border: "var(--success-border)", color: "var(--success-text)" },
  failed: { label: "Failed", symbol: "×", background: "var(--danger-bg)", border: "var(--danger-border)", color: "var(--danger-text)" },
  cancelled: { label: "Cancelled", symbol: "—", background: "var(--surface-muted)", border: "var(--surface-card-border)", color: "var(--text-tertiary)" },
} as const;

function formatSpend(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTimestamp(timestamp: string): string {
  const epoch = Date.parse(timestamp);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function percent(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / cap) * 100)));
}

function Scope({ run }: Readonly<{ run: DiscoveryRunSummary }>) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2" aria-label="Exact run scope">
      <div className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
        <dt className="section-label">Tenant</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{run.tenantId}</dd>
      </div>
      <div className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
        <dt className="section-label">Workspace</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{run.workspaceId ?? "Tenant-wide"}</dd>
      </div>
    </dl>
  );
}

function LeaseState({ run }: Readonly<{ run: DiscoveryRunSummary }>) {
  const label = run.recoveryNeeded
    ? "Recovery needed"
    : run.lease.state === "active"
      ? "Active lease"
      : run.lease.state === "expired"
        ? "Lease expired"
        : "No active lease";
  const urgent = run.recoveryNeeded || run.lease.state === "expired";

  return (
    <div
      className="rounded-xl border p-3"
      data-lease-state={run.lease.state}
      data-recovery-needed={run.recoveryNeeded ? "true" : "false"}
      style={{
        background: urgent ? "var(--danger-bg)" : "var(--surface-muted)",
        borderColor: urgent ? "var(--danger-border)" : "var(--surface-card-border)",
      }}
    >
      <p className="section-label">Lease and recovery</p>
      <p className="mt-1 text-sm font-semibold" style={{ color: urgent ? "var(--danger-text)" : "var(--text-primary)" }}>
        {urgent ? "!" : "✓"} {label}
      </p>
      {run.lease.expiresAt ? (
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {run.lease.state === "active" ? "Expires" : "Expired"} <time dateTime={run.lease.expiresAt}>{formatTimestamp(run.lease.expiresAt)} UTC</time>
        </p>
      ) : null}
    </div>
  );
}

function RunCard({ run, onOpen, onRecover, onCancel }: Readonly<{
  run: DiscoveryRunSummary;
  onOpen?: (run: DiscoveryRunSummary) => void;
  onRecover?: (run: DiscoveryRunSummary) => void;
  onCancel?: (run: DiscoveryRunSummary) => void;
}>) {
  const status = STATUS[run.status];
  const budgetPercent = percent(run.budget.usedCents, run.budget.capCents);
  const tasksPercent = percent(run.tasks.completed, run.tasks.total);
  const canOpen = run.allowedActions.open && Boolean(onOpen);
  const canRecover = run.allowedActions.recover && run.recoveryNeeded && run.lease.state !== "active" && Boolean(onRecover);
  const canCancel = run.allowedActions.cancel && (run.status === "planned" || run.status === "running") && Boolean(onCancel);
  const titleId = `discovery-run-summary-${run.runId.replace(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <article className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-run-status={run.status} aria-labelledby={titleId}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">Discovery run</p>
          <h3 id={titleId} className="mt-1 break-all font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{run.runId}</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Updated <time dateTime={run.updatedAt}>{formatTimestamp(run.updatedAt)} UTC</time>
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
          aria-label={`Run status: ${status.label}`}
          style={{ background: status.background, borderColor: status.border, color: status.color }}
        >
          <span aria-hidden="true">{status.symbol}</span> {status.label}
        </span>
      </header>

      <div className="mt-4"><Scope run={run} /></div>

      <section className="mt-4 rounded-xl border p-3" aria-label="Canonical plan, play, and sources" style={{ borderColor: "var(--surface-card-border)" }}>
        <p className="section-label">Canonical binding</p>
        <dl className="mt-2 space-y-2 text-xs">
          <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Plan </dt><dd className="inline break-all font-mono" style={{ color: "var(--text-secondary)" }}>{run.binding.planId}</dd></div>
          <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Play </dt><dd className="inline break-all font-mono" style={{ color: "var(--text-secondary)" }}>{run.binding.playStableKey} · {run.binding.playVersionId}</dd></div>
          <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Sources </dt><dd className="inline" style={{ color: "var(--text-secondary)" }}>{run.binding.sourceKeys.join(", ") || "None"}</dd></div>
        </dl>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="section-label">Budget</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatSpend(run.budget.usedCents)} <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>/ {formatSpend(run.budget.capCents)}</span></p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={run.budget.capCents} aria-valuenow={run.budget.usedCents} style={{ background: "var(--surface-card)" }}>
            <div className="h-full rounded-full" style={{ width: `${budgetPercent}%`, background: "var(--accent)" }} />
          </div>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="section-label">Task progress</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{run.tasks.completed}/{run.tasks.total}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Tasks completed" aria-valuemin={0} aria-valuemax={run.tasks.total} aria-valuenow={run.tasks.completed} style={{ background: "var(--surface-card)" }}>
            <div className="h-full rounded-full" style={{ width: `${tasksPercent}%`, background: "var(--accent)" }} />
          </div>
        </div>
      </div>

      <div className="mt-4"><LeaseState run={run} /></div>

      {canOpen || canRecover || canCancel ? (
        <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:justify-end" style={{ borderColor: "var(--surface-card-border)" }}>
          {canCancel ? <button type="button" className="btn-secondary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-discovery-runs-action="cancel" onClick={() => onCancel?.(run)}>Cancel run</button> : null}
          {canRecover ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-discovery-runs-action="recover" onClick={() => onRecover?.(run)}>Recover run</button> : null}
          {canOpen ? <button type="button" className={`${canRecover ? "btn-secondary" : "btn-primary"} min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`} data-discovery-runs-action="open" onClick={() => onOpen?.(run)}>Open run</button> : null}
        </footer>
      ) : null}
    </article>
  );
}

function ReadyDiscoveryRuns({ runs, onOpen, onRecover, onCancel }: ReadyProps) {
  if (runs.length === 0) {
    return (
      <div data-discovery-runs-state="empty">
        <AsyncState variant="empty" title="No discovery runs yet" description="Create a bounded run from an approved discovery plan to track it here." />
      </div>
    );
  }

  return (
    <section className="space-y-4" data-surface="discovery-runs-panel" data-discovery-runs-state="ready" aria-labelledby="discovery-runs-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <p className="section-label">Discovery · Run portfolio</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="discovery-runs-title" className="text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Discovery runs</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Review canonical scope, binding, budget, progress, and recovery state. Actions are offered only when supplied by the caller for that run.</p>
          </div>
          <p className="shrink-0 text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>{runs.length} {runs.length === 1 ? "run" : "runs"}</p>
        </div>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        {runs.map((run) => <RunCard key={run.runId} run={run} onOpen={onOpen} onRecover={onRecover} onCancel={onCancel} />)}
      </div>
    </section>
  );
}

export function DiscoveryRunsPanel(props: DiscoveryRunsPanelProps) {
  if (props.state === "loading") {
    return <div data-discovery-runs-state="loading"><AsyncState variant="loading" title="Loading discovery runs" description="Retrieving canonical run summaries and recovery state." /></div>;
  }
  if (props.state === "error") {
    return <div data-discovery-runs-state="error"><AsyncState variant="error" title="Discovery runs unavailable" description={props.error} /></div>;
  }
  if (props.runs.some((run) => run.tenantId !== props.scope.tenantId || run.workspaceId !== props.scope.workspaceId)) {
    return <div data-discovery-runs-state="error"><AsyncState variant="error" title="Discovery runs unavailable" description="The discovery-run portfolio scope could not be verified." /></div>;
  }
  return <ReadyDiscoveryRuns {...props} />;
}
