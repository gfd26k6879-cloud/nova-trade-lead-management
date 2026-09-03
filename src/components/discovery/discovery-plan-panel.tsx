"use client";

import { AsyncState } from "@/components/async-state";
import type { DiscoveryPlan, DiscoveryTask } from "@/lib/discovery/discovery-plan";

type ReadyProps = Readonly<{
  state: "ready";
  plan: DiscoveryPlan | null;
  onCreateRun?: (plan: DiscoveryPlan) => void;
  error?: never;
}>;

export type DiscoveryPlanPanelProps =
  | Readonly<{ state: "loading"; plan?: never; error?: never; onCreateRun?: never }>
  | Readonly<{ state: "error"; plan?: never; error: string; onCreateRun?: never }>
  | ReadyProps;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TASK_ID = /^discovery-task:[a-f0-9]{64}$/u;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function taskIsConsistent(task: DiscoveryTask): boolean {
  return task.taskVersion === 1
    && TASK_ID.test(task.taskId)
    && REFERENCE.test(task.sourceKey)
    && REFERENCE.test(task.hypothesisId)
    && REFERENCE.test(task.queryFamily)
    && task.statement.length > 0
    && task.statement === task.statement.trim()
    && task.rationaleRefs.length > 0
    && task.rationaleRefs.every((reference) => REFERENCE.test(reference.claimId) && REFERENCE.test(reference.evidenceId))
    && task.uncertaintyIds.every((uncertaintyId) => REFERENCE.test(uncertaintyId))
    && isPositiveInteger(task.caps.maxAccounts)
    && isPositiveInteger(task.caps.maxProviderRequests)
    && isNonNegativeInteger(task.caps.maxSpendCents);
}

function planIsConsistent(plan: DiscoveryPlan): boolean {
  try {
    if (plan.planVersion !== 1 || plan.status !== "plan_only" || !UUID.test(plan.tenantId)
      || (plan.workspaceId !== null && !UUID.test(plan.workspaceId)) || !HASH.test(plan.planHash)
      || plan.planId !== `discovery-plan:${plan.planHash.slice("sha256:".length)}`
      || !HASH.test(plan.activationStateHash) || !REFERENCE.test(plan.play.stableKey)
      || !HASH.test(plan.play.contentHash) || !HASH.test(plan.play.reviewHash)
      || plan.play.versionId !== `lead-play-version:${plan.play.contentHash.slice("sha256:".length)}`
      || !isPositiveInteger(plan.play.revision) || plan.tasks.length === 0
      || !isPositiveInteger(plan.limits.maxAccounts)
      || !isPositiveInteger(plan.limits.maxProviderRequests)
      || !isNonNegativeInteger(plan.limits.maxSpendCents)) return false;

    const taskIds = new Set<string>();
    const taskCoordinates = new Set<string>();
    let maxAccounts = 0;
    let maxProviderRequests = 0;
    let maxSpendCents = 0;
    for (const task of plan.tasks) {
      const coordinate = `${task.sourceKey}\u0000${task.hypothesisId}`;
      if (!taskIsConsistent(task) || taskIds.has(task.taskId) || taskCoordinates.has(coordinate)) return false;
      taskIds.add(task.taskId);
      taskCoordinates.add(coordinate);
      maxAccounts += task.caps.maxAccounts;
      maxProviderRequests += task.caps.maxProviderRequests;
      maxSpendCents += task.caps.maxSpendCents;
    }
    return maxAccounts === plan.limits.maxAccounts
      && maxProviderRequests === plan.limits.maxProviderRequests
      && maxSpendCents === plan.limits.maxSpendCents;
  } catch {
    return false;
  }
}

function formatSpend(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function Cap({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</dd>
    </div>
  );
}

function TaskCard({ task, index }: Readonly<{ task: DiscoveryTask; index: number }>) {
  const titleId = `discovery-plan-task-${index}-title`;
  return (
    <article className="glass min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby={titleId}>
      <header className="min-w-0">
        <p className="section-label">{task.sourceKey} · {task.queryFamily}</p>
        <h3 id={titleId} className="mt-1 text-base font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {task.statement}
        </h3>
        <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{task.taskId}</p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Cap label="Accounts" value={task.caps.maxAccounts.toLocaleString("en-US")} />
        <Cap label="Provider requests" value={task.caps.maxProviderRequests.toLocaleString("en-US")} />
        <Cap label="Spend" value={formatSpend(task.caps.maxSpendCents)} />
      </dl>

      <section className="mt-4 rounded-xl border p-3" aria-label="Hypothesis and rationale" style={{ borderColor: "var(--surface-card-border)" }}>
        <p className="section-label">Hypothesis</p>
        <p className="mt-2 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-secondary)" }}>{task.hypothesisId}</p>
        <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Evidence rationale</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Rationale references for ${task.hypothesisId}`}>
          {task.rationaleRefs.map((reference) => (
            <li key={`${reference.claimId}:${reference.evidenceId}`} className="max-w-full break-all rounded-lg border px-2 py-1 font-mono text-[0.65rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
              {reference.claimId} → {reference.evidenceId}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Known uncertainty</p>
        {task.uncertaintyIds.length ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Uncertainty references for ${task.hypothesisId}`}>
            {task.uncertaintyIds.map((uncertaintyId) => (
              <li key={uncertaintyId} className="max-w-full break-all rounded-lg border px-2 py-1 font-mono text-[0.65rem]" style={{ borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                ? {uncertaintyId}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No uncertainty reference attached.</p>
        )}
      </section>
    </article>
  );
}

function ReadyDiscoveryPlan({ plan, onCreateRun }: ReadyProps) {
  if (!plan) {
    return (
      <div data-discovery-plan-state="empty">
        <AsyncState
          variant="empty"
          title="No discovery plan is ready"
          description="Approve and activate a lead play before creating its bounded, provider-neutral discovery plan."
        />
      </div>
    );
  }

  const consistent = planIsConsistent(plan);
  const canCreate = consistent && Boolean(onCreateRun);
  return (
    <section className="space-y-5" data-surface="discovery-plan-panel" data-discovery-plan-state={consistent ? "plan_only" : "invalid"} aria-labelledby="discovery-plan-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Discovery · Plan review</p>
            <h2 id="discovery-plan-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Review the bounded discovery plan
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Confirm the exact active approved play, hypotheses, evidence, uncertainty, sources, and caps before creating a run.
            </p>
          </div>
          <div
            className="shrink-0 rounded-xl border px-4 py-3"
            data-state={consistent ? "STATE-READY" : "STATE-BLOCKED"}
            aria-label={`Plan status: ${consistent ? "Ready for run creation" : "Inconsistent and blocked"}`}
            style={{
              background: consistent ? "var(--success-bg)" : "var(--danger-bg)",
              borderColor: consistent ? "var(--success-border)" : "var(--danger-border)",
              color: consistent ? "var(--success-text)" : "var(--danger-text)",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">Plan-only state</p>
            <p className="mt-1 text-sm font-semibold"><span aria-hidden="true">{consistent ? "✓" : "×"}</span> {consistent ? "Internally consistent" : "Action blocked"}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Cap label="Overall accounts" value={plan.limits.maxAccounts.toLocaleString("en-US")} />
          <Cap label="Overall provider requests" value={plan.limits.maxProviderRequests.toLocaleString("en-US")} />
          <Cap label="Overall spend" value={formatSpend(plan.limits.maxSpendCents)} />
        </dl>
      </header>

      {!consistent ? (
        <section className="rounded-2xl border p-4 sm:p-5" role="alert" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--danger-text)" }}>Run creation is blocked</h3>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>The plan-only state does not match its binding, task identity, or aggregate caps. Rebuild it from the approved lead play.</p>
        </section>
      ) : null}

      <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="discovery-plan-binding-title">
        <p className="section-label">Approved source of truth</p>
        <h3 id="discovery-plan-binding-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Exact active play and activation binding</h3>
        <dl className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
            <dt className="section-label">Approved lead play · revision {plan.play.revision}</dt>
            <dd className="mt-2 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{plan.play.stableKey}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{plan.play.versionId}</dd>
            <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Content {plan.play.contentHash}</dd>
            <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Approval {plan.play.reviewHash}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
            <dt className="section-label">Immutable plan</dt>
            <dd className="mt-2 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>{plan.planId}</dd>
            <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Plan {plan.planHash}</dd>
            <dd className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Activation {plan.activationStateHash}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="discovery-plan-tasks-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Provider-neutral worklist</p>
            <h3 id="discovery-plan-tasks-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Planned hypotheses and sources</h3>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{plan.tasks.length} bounded {plan.tasks.length === 1 ? "task" : "tasks"}</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {plan.tasks.map((task, index) => <TaskCard key={`${task.taskId}:${index}`} task={task} index={index} />)}
        </div>
      </section>

      {canCreate ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="discovery-plan-create-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="discovery-plan-create-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Create a run from this exact plan</h3>
              <p id="discovery-plan-create-help" className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                This hands the canonical plan back to the caller. It does not contact a provider or start collection.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              aria-describedby="discovery-plan-create-help"
              data-discovery-plan-action="create-run"
              onClick={() => onCreateRun?.(plan)}
            >
              Create bounded run
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

export function DiscoveryPlanPanel(props: DiscoveryPlanPanelProps) {
  if (props.state === "loading") {
    return (
      <div data-discovery-plan-state="loading">
        <AsyncState variant="loading" title="Loading discovery plan" description="Retrieving the exact approved play binding, hypotheses, sources, and caps." />
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div data-discovery-plan-state="error">
        <AsyncState variant="error" title="Discovery plan unavailable" description={props.error} />
      </div>
    );
  }
  return <ReadyDiscoveryPlan {...props} />;
}
