"use client";

import { AsyncState } from "@/components/async-state";

export type OnboardingProgressStepId =
  | "source_intake"
  | "extraction_review"
  | "business_understanding"
  | "adaptive_questions"
  | "icp_approval"
  | "lead_play_approval";

export type OnboardingProgressStepStatus =
  | "complete"
  | "in_progress"
  | "ready"
  | "blocked"
  | "not_started";

export type OnboardingProgressStep = Readonly<{
  id: OnboardingProgressStepId;
  label: string;
  description: string;
  status: OnboardingProgressStepStatus;
  statusDetail: string;
  completedAt: string | null;
  navigation:
    | Readonly<{ decision: "allowed"; label: string }>
    | Readonly<{ decision: "blocked"; reason: string }>;
}>;

export type OnboardingProgressReadModel = Readonly<{
  workflowRef: string;
  workspaceLabel: string;
  updatedAt: string;
  steps: readonly OnboardingProgressStep[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  progress: OnboardingProgressReadModel | null;
  onNavigate?: (step: OnboardingProgressStep) => void;
  error?: never;
}>;

export type OnboardingProgressPanelProps =
  | Readonly<{
    state: "loading";
    progress?: never;
    onNavigate?: never;
    error?: never;
  }>
  | Readonly<{
    state: "error";
    error: string;
    progress?: never;
    onNavigate?: never;
  }>
  | ReadyProps;

const STATUS_META: Readonly<Record<OnboardingProgressStepStatus, Readonly<{
  label: string;
  symbol: string;
  dataState: string;
  background: string;
  border: string;
  text: string;
}>>> = Object.freeze({
  complete: {
    label: "Complete",
    symbol: "✓",
    dataState: "STATE-READY",
    background: "var(--success-bg)",
    border: "var(--success-border)",
    text: "var(--success-text)",
  },
  in_progress: {
    label: "In progress",
    symbol: "→",
    dataState: "STATE-UNKNOWN",
    background: "var(--accent-light)",
    border: "var(--surface-info-border)",
    text: "var(--accent)",
  },
  ready: {
    label: "Ready",
    symbol: "•",
    dataState: "STATE-READY",
    background: "var(--surface-muted)",
    border: "var(--surface-card-border)",
    text: "var(--text-primary)",
  },
  blocked: {
    label: "Blocked",
    symbol: "!",
    dataState: "STATE-BLOCKED",
    background: "var(--warning-bg)",
    border: "var(--warning-border)",
    text: "var(--warning-text)",
  },
  not_started: {
    label: "Not started",
    symbol: "○",
    dataState: "STATE-UNKNOWN",
    background: "var(--surface-muted)",
    border: "var(--surface-card-border)",
    text: "var(--text-tertiary)",
  },
});

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function ProgressStepCard({
  step,
  index,
  onNavigate,
}: Readonly<{
  step: OnboardingProgressStep;
  index: number;
  onNavigate?: (step: OnboardingProgressStep) => void;
}>) {
  const meta = STATUS_META[step.status];
  const navigationAllowed = step.navigation.decision === "allowed" && Boolean(onNavigate);
  const titleId = `onboarding-progress-${step.id}-title`;

  return (
    <li
      className="relative min-w-0"
      data-onboarding-step={step.id}
      data-step-status={step.status}
      data-navigation-decision={step.navigation.decision}
      aria-current={step.status === "in_progress" ? "step" : undefined}
    >
      <article
        className="glass h-full rounded-2xl p-4 sm:p-5"
        aria-labelledby={titleId}
      >
        <header className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums"
            style={{ background: meta.background, borderColor: meta.border, color: meta.text }}
          >
            {meta.symbol}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="section-label">Stage {index + 1}</p>
                <h3 id={titleId} className="mt-1 text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                  {step.label}
                </h3>
              </div>
              <span
                className="self-start rounded-full border px-2.5 py-1 text-xs font-semibold"
                data-state={meta.dataState}
                aria-label={`Status: ${meta.label}`}
                style={{ background: meta.background, borderColor: meta.border, color: meta.text }}
              >
                {meta.label}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {step.description}
            </p>
          </div>
        </header>

        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--table-row-border)" }}>
          <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {step.statusDetail}
          </p>
          {step.completedAt ? (
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Completed <time dateTime={step.completedAt}>{formatTimestamp(step.completedAt)} UTC</time>
            </p>
          ) : null}
          {step.navigation.decision === "blocked" ? (
            <p className="mt-2 text-xs leading-relaxed" data-navigation-reason style={{ color: "var(--text-tertiary)" }}>
              {step.navigation.reason}
            </p>
          ) : null}
        </div>

        {navigationAllowed && onNavigate ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              data-onboarding-action="navigate"
              onClick={() => onNavigate(step)}
            >
              {step.navigation.decision === "allowed" ? step.navigation.label : "Open stage"}
            </button>
          </div>
        ) : null}
      </article>
    </li>
  );
}

function ReadyOnboardingProgress({ progress, onNavigate }: ReadyProps) {
  if (!progress || progress.steps.length === 0) {
    return (
      <div data-onboarding-progress-state="empty">
        <AsyncState
          variant="empty"
          title="No launch workflow yet"
          description="Add an approved source to begin the evidence, understanding, strategy, and play-approval sequence."
        />
      </div>
    );
  }

  const completedSteps = progress.steps.filter((step) => step.status === "complete").length;
  const percentage = Math.round((completedSteps / progress.steps.length) * 100);
  const activeStep = progress.steps.find((step) => step.status === "in_progress") ?? null;

  return (
    <section
      className="space-y-5"
      aria-labelledby="onboarding-progress-title"
      data-surface="onboarding-progress-panel"
      data-onboarding-progress-state="ready"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] lg:items-start">
          <div className="min-w-0">
            <p className="section-label">Launch readiness · {progress.workspaceLabel}</p>
            <h2 id="onboarding-progress-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              From trusted sources to an approved lead play
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Follow the governed path through extraction, business understanding, targeted questions, ICP review, and play approval.
            </p>
            <p className="mt-3 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
              Workflow: {progress.workflowRef}
            </p>
          </div>

          <section className="rounded-xl border p-4" aria-labelledby="onboarding-completion-title" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)" }}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-label">Overall progress</p>
                <h3 id="onboarding-completion-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  {completedSteps} of {progress.steps.length} stages complete
                </h3>
              </div>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{percentage}%</p>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Launch workflow completion"
              aria-valuemin={0}
              aria-valuemax={progress.steps.length}
              aria-valuenow={completedSteps}
              style={{ background: "var(--surface-muted)" }}
            >
              <span className="block h-full rounded-full" style={{ width: `${percentage}%`, background: "var(--accent)" }} />
            </div>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              {activeStep ? `Now: ${activeStep.label}` : "No stage is currently active."}
              {" · "}Updated <time dateTime={progress.updatedAt}>{formatTimestamp(progress.updatedAt)} UTC</time>
            </p>
          </section>
        </div>
      </header>

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Launch onboarding stages">
        {progress.steps.map((step, index) => (
          <ProgressStepCard key={step.id} step={step} index={index} onNavigate={onNavigate} />
        ))}
      </ol>

      <p className="rounded-xl border px-4 py-3 text-xs leading-relaxed" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
        This progress view follows the supplied workflow read model. Navigation does not approve, activate, extract, or change any launch state.
      </p>
    </section>
  );
}

export function OnboardingProgressPanel(props: OnboardingProgressPanelProps) {
  if (props.state === "loading") {
    return (
      <div data-onboarding-progress-state="loading">
        <AsyncState
          variant="loading"
          title="Loading launch progress"
          description="Reading the latest onboarding stage decisions and approval readiness."
        />
      </div>
    );
  }

  if (props.state === "error") {
    return (
      <div data-onboarding-progress-state="error">
        <AsyncState
          variant="error"
          title="Launch progress unavailable"
          description={props.error}
        />
      </div>
    );
  }

  return <ReadyOnboardingProgress {...props} />;
}
