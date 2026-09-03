"use client";

import { AsyncState } from "@/components/async-state";
import type { DiscoveryRun, DiscoveryTaskRun } from "@/lib/discovery/discovery-run";

type ReadyProps = Readonly<{
  state: "ready";
  run: DiscoveryRun | null;
  onStart?: (run: DiscoveryRun) => void;
  onResume?: (run: DiscoveryRun, task: DiscoveryTaskRun) => void;
  error?: never;
}>;

export type DiscoveryRunPanelProps =
  | Readonly<{ state: "loading"; run?: never; error?: never; onStart?: never; onResume?: never }>
  | Readonly<{ state: "error"; run?: never; error: string; onStart?: never; onResume?: never }>
  | ReadyProps;

const STATUS_META = {
  planned: {
    label: "Ready to start",
    symbol: "○",
    state: "STATE-READY",
    style: {
      background: "var(--surface-muted)",
      borderColor: "var(--surface-card-border)",
      color: "var(--text-secondary)",
    },
  },
  running: {
    label: "In progress",
    symbol: "…",
    state: "STATE-RUNNING",
    style: {
      background: "var(--warning-bg)",
      borderColor: "var(--warning-border)",
      color: "var(--warning-text)",
    },
  },
  completed: {
    label: "Completed",
    symbol: "✓",
    state: "STATE-COMPLETE",
    style: {
      background: "var(--success-bg)",
      borderColor: "var(--success-border)",
      color: "var(--success-text)",
    },
  },
  failed: {
    label: "Failed",
    symbol: "×",
    state: "STATE-ERROR",
    style: {
      background: "var(--danger-bg)",
      borderColor: "var(--danger-border)",
      color: "var(--danger-text)",
    },
  },
  cancelled: {
    label: "Cancelled",
    symbol: "—",
    state: "STATE-BLOCKED",
    style: {
      background: "var(--status-muted-bg)",
      borderColor: "var(--status-muted-border)",
      color: "var(--status-muted-text)",
    },
  },
} as const;

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function formatSpend(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function percent(used: number, cap: number): number {
  if (cap <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / cap) * 100)));
}

function canStart(run: DiscoveryRun): boolean {
  return run.status === "planned"
    && run.events.length === 0
    && run.totals.accounts === 0
    && run.totals.providerRequests === 0
    && run.totals.spendCents === 0
    && run.tasks.length === run.plan.tasks.length
    && run.tasks.every((task, index) => {
      const planned = run.plan.tasks[index];
      return Boolean(planned)
        && task.taskId === planned?.taskId
        && task.sourceKey === planned.sourceKey
        && task.cursor === null
        && !task.complete
        && task.accounts === 0
        && task.providerRequests === 0
        && task.spendCents === 0
        && task.observations.length === 0
        && task.batches.length === 0;
    });
}

function canResume(run: DiscoveryRun, task: DiscoveryTaskRun, index: number): boolean {
  const planned = run.plan.tasks[index];
  return run.status === "running"
    && Boolean(planned)
    && task.taskId === planned?.taskId
    && task.sourceKey === planned.sourceKey
    && !task.complete
    && task.accounts < planned.caps.maxAccounts
    && task.providerRequests < planned.caps.maxProviderRequests
    && task.spendCents < planned.caps.maxSpendCents
    && run.totals.accounts < run.plan.limits.maxAccounts
    && run.totals.providerRequests < run.plan.limits.maxProviderRequests
    && run.totals.spendCents < run.plan.limits.maxSpendCents;
}

function Metric({
  label,
  value,
  cap,
  format = (number) => number.toLocaleString("en-US"),
}: Readonly<{
  label: string;
  value: number;
  cap: number;
  format?: (number: number) => string;
}>) {
  const progress = percent(value, cap);
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="section-label">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {format(value)} <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>/ {format(cap)}</span>
        </dd>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={value}
        style={{ background: "var(--surface-card)" }}
      >
        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}

function BindingCard({ run }: Readonly<{ run: DiscoveryRun }>) {
  const binding = run.plan.play;
  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="discovery-binding-title">
      <p className="section-label">Approved source of truth</p>
      <h3 id="discovery-binding-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        Exact plan and play binding
      </h3>
      <dl className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Approved lead play · revision {binding.revision}</dt>
          <dd className="mt-2 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{binding.stableKey}</dd>
          <dd className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{binding.versionId}</dd>
          <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Content {binding.contentHash}</dd>
          <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Approval {binding.reviewHash}</dd>
        </div>
        <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Immutable discovery plan</dt>
          <dd className="mt-2 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>{run.plan.planId}</dd>
          <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Plan {run.plan.planHash}</dd>
          <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Activation {run.plan.activationStateHash}</dd>
        </div>
      </dl>
    </section>
  );
}

function TaskCard({
  run,
  task,
  index,
  onResume,
}: Readonly<{
  run: DiscoveryRun;
  task: DiscoveryTaskRun;
  index: number;
  onResume?: (run: DiscoveryRun, task: DiscoveryTaskRun) => void;
}>) {
  const planned = run.plan.tasks[index];
  if (!planned) return null;
  const zeroResultPages = task.batches.filter((batch) => batch.observationIds.length === 0).length;
  const resumable = Boolean(onResume) && canResume(run, task, index);
  const taskTitleId = `discovery-task-${index}-title`;
  const actionHelpId = `discovery-task-${index}-action-help`;

  return (
    <article className="glass min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby={taskTitleId} data-task-state={task.complete ? "complete" : "open"}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">{planned.sourceKey} · {planned.queryFamily}</p>
          <h3 id={taskTitleId} className="mt-1 text-base font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {planned.statement}
          </h3>
          <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{task.taskId}</p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
          aria-label={`Task status: ${task.complete ? "Complete" : "Open"}`}
          style={task.complete ? STATUS_META.completed.style : STATUS_META.running.style}
        >
          <span aria-hidden="true">{task.complete ? "✓" : "…"}</span> {task.complete ? "Complete" : "Open"}
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Accounts</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{task.accounts}/{planned.caps.maxAccounts}</dd>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Requests</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{task.providerRequests}/{planned.caps.maxProviderRequests}</dd>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Spend</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatSpend(task.spendCents)}<span className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}> / {formatSpend(planned.caps.maxSpendCents)}</span></dd>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
          <dt className="section-label">Pages</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{task.batches.length}</dd>
          <p className="mt-0.5 text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{zeroResultPages} zero-result</p>
        </div>
      </dl>

      <section className="mt-4 rounded-xl border p-3" aria-label="Pagination checkpoint" style={{ borderColor: "var(--surface-card-border)" }}>
        <p className="section-label">Pagination checkpoint</p>
        <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {task.complete ? "Closed — provider reported completion" : task.cursor === null ? "Initial page is next" : "Resume from saved cursor"}
        </p>
        <code className="mt-1 block break-all text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {task.cursor ?? "cursor:null"}
        </code>
        {task.batches.length ? (
          <ol className="mt-3 space-y-2" aria-label="Committed discovery pages">
            {task.batches.map((batch, batchIndex) => (
              <li key={batch.batchId} className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                <span className="min-w-0 break-all font-mono" style={{ color: "var(--text-secondary)" }}>Page {batchIndex + 1} · {batch.batchId}</span>
                <span className="shrink-0 tabular-nums" style={{ color: batch.observationIds.length === 0 ? "var(--warning-text)" : "var(--text-tertiary)" }}>
                  {batch.observationIds.length} {batch.observationIds.length === 1 ? "result" : "results"} · {batch.providerRequests} req · {formatSpend(batch.spendCents)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>No provider page has been committed.</p>
        )}
      </section>

      <section className="mt-4" aria-label="Hypothesis and evidence basis">
        <p className="section-label">Hypothesis and evidence basis</p>
        <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{planned.hypothesisId}</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Rationale references">
          {planned.rationaleRefs.map((reference) => (
            <li key={`${reference.claimId}:${reference.evidenceId}`} className="max-w-full break-all rounded-lg border px-2 py-1 font-mono text-[0.65rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
              {reference.claimId} → {reference.evidenceId}
            </li>
          ))}
        </ul>
        {planned.uncertaintyIds.length ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Uncertainty references">
            {planned.uncertaintyIds.map((uncertaintyId) => (
              <li key={uncertaintyId} className="max-w-full break-all rounded-lg border px-2 py-1 font-mono text-[0.65rem]" style={{ borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                ? {uncertaintyId}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {resumable ? (
        <footer className="mt-4 border-t pt-4" style={{ borderColor: "var(--surface-card-border)" }}>
          <p id={actionHelpId} className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Requests one caller-controlled page from this exact cursor. The provider, authorization, and append remain outside this panel.
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              aria-describedby={actionHelpId}
              data-discovery-action="resume"
              onClick={() => onResume?.(run, task)}
            >
              {task.batches.length ? "Resume next bounded page" : "Run first bounded page"}
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  );
}

function ReadyDiscoveryRun({ run, onStart, onResume }: ReadyProps) {
  if (!run) {
    return (
      <div data-discovery-state="empty">
        <AsyncState
          variant="empty"
          title="No discovery run is planned"
          description="Approve and activate a lead play, then create its bounded discovery plan before starting collection."
        />
      </div>
    );
  }

  const status = STATUS_META[run.status];
  const failedEvent = run.status === "failed" ? run.events.at(-1) : null;
  const startable = Boolean(onStart) && canStart(run);

  return (
    <section className="space-y-5" data-surface="discovery-run-panel" data-discovery-state={run.status} aria-labelledby="discovery-run-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Discovery · Bounded collection</p>
            <h2 id="discovery-run-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Inspect the run before each provider page
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Progress, cost, cursors, and observations are measured against the exact approved plan. This surface never runs a provider on its own.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border px-4 py-3" data-run-status={run.status} data-state={status.state} aria-label={`Run status: ${status.label}`} style={status.style}>
            <p className="text-xs font-semibold uppercase tracking-wide">Run status</p>
            <p className="mt-1 text-sm font-semibold"><span aria-hidden="true">{status.symbol}</span> {status.label}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric label="Accounts" value={run.totals.accounts} cap={run.plan.limits.maxAccounts} />
          <Metric label="Provider requests" value={run.totals.providerRequests} cap={run.plan.limits.maxProviderRequests} />
          <Metric label="Spend" value={run.totals.spendCents} cap={run.plan.limits.maxSpendCents} format={formatSpend} />
        </dl>

        <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-xs sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
          <p className="break-all font-mono">Run {run.runId}</p>
          <p className="shrink-0">Updated <time dateTime={run.updatedAt}>{formatTimestamp(run.updatedAt)} UTC</time></p>
        </div>
      </header>

      {failedEvent ? (
        <section className="rounded-2xl border p-4 sm:p-5" role="alert" aria-labelledby="discovery-failure-title" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}>
          <p className="section-label" style={{ color: "var(--danger-text)" }}>Run stopped</p>
          <h3 id="discovery-failure-title" className="mt-1 text-base font-semibold" style={{ color: "var(--danger-text)" }}>Discovery failed without an automatic retry</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{failedEvent.reason}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}><time dateTime={failedEvent.at}>{formatTimestamp(failedEvent.at)} UTC</time></p>
        </section>
      ) : null}

      <BindingCard run={run} />

      <section aria-labelledby="discovery-tasks-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Execution checkpoints</p>
            <h3 id="discovery-tasks-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Planned discovery tasks</h3>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{run.tasks.filter((task) => task.complete).length}/{run.tasks.length} tasks complete</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {run.tasks.map((task, index) => (
            <TaskCard key={task.taskId} run={run} task={task} index={index} onResume={onResume} />
          ))}
        </div>
      </section>

      {startable ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="discovery-start-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="discovery-start-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Start this exact bounded run</h3>
              <p id="discovery-start-help" className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                This requests the planned-to-running transition only. Provider work remains caller-controlled and capped by the plan above.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              aria-describedby="discovery-start-help"
              data-discovery-action="start"
              onClick={() => onStart?.(run)}
            >
              Start bounded discovery
            </button>
          </div>
        </footer>
      ) : null}

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Ledger {run.runHash}</p>
    </section>
  );
}

export function DiscoveryRunPanel(props: DiscoveryRunPanelProps) {
  if (props.state === "loading") {
    return (
      <div data-discovery-state="loading">
        <AsyncState
          variant="loading"
          title="Loading discovery run"
          description="Retrieving the exact approved plan, bounded resource ledger, and page checkpoints."
        />
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div data-discovery-state="error">
        <AsyncState
          variant="error"
          title="Discovery run unavailable"
          description={props.error}
        />
      </div>
    );
  }
  return <ReadyDiscoveryRun {...props} />;
}
