"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type LearningPortfolioReadiness = "ready" | "needs_review" | "blocked";
export type LearningPortfolioReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export type LearningPortfolioAction = "open" | "review";

type MetricKey = "reply_rate" | "meeting_rate" | "opportunity_rate" | "win_rate" | "opt_out_rate" | "bounce_rate";
type ChangeValue = number | "enabled" | "disabled";

export type LearningPortfolioSummary = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  stableKey: string;
  versionId: string;
  revision: number;
  createdAt: string;
  cohort: Readonly<{
    cohortId: string;
    windowStart: string;
    windowEnd: string;
    denominator: number;
  }>;
  metric: Readonly<{
    metricKey: MetricKey;
    numerator: number;
    denominator: number;
    valueBasisPoints: number;
  }>;
  change: Readonly<{
    kind: "qualification_threshold_basis_points" | "score_weight_basis_points" | "query_family_status" | "outreach_guidance_status";
    targetKey: string;
    currentValue: ChangeValue;
    proposedValue: ChangeValue;
  }>;
  uncertainty: Readonly<{
    count: number;
    highestSeverity: number | null;
    headline: string | null;
  }>;
  expectedImpact: Readonly<{
    metricKey: MetricKey;
    direction: "increase" | "decrease";
    estimateBasisPoints: number;
    lowerBoundBasisPoints: number;
    upperBoundBasisPoints: number;
    horizonDays: number;
  }>;
  rollback: Readonly<{
    restorePlayVersionId: string;
    triggerMetricKey: MetricKey;
    triggerThresholdBasisPoints: number;
    readiness: LearningPortfolioReadiness;
  }>;
  readiness: LearningPortfolioReadiness;
  reviewStatus: LearningPortfolioReviewStatus;
  eligibleActions: readonly LearningPortfolioAction[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  proposals: readonly LearningPortfolioSummary[];
  onOpen?: (proposal: LearningPortfolioSummary) => void;
  onReview?: (proposal: LearningPortfolioSummary) => void;
  error?: never;
}>;

export type LearningPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; proposals?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; proposals?: never }>
  | Readonly<{ state: "empty"; scope?: never; proposals?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
});

const READINESS_META: Readonly<Record<LearningPortfolioReadiness, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  ready: { label: "Ready", symbol: "✓", tone: "success" },
  needs_review: { label: "Needs review", symbol: "?", tone: "warning" },
  blocked: { label: "Blocked", symbol: "×", tone: "danger" },
});

const REVIEW_META: Readonly<Record<LearningPortfolioReviewStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  draft: { label: "Draft", symbol: "·", tone: "neutral" },
  in_review: { label: "In review", symbol: "?", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
});

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function basisPoints(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function changeValue(value: ChangeValue): string {
  return typeof value === "number" ? basisPoints(value) : value;
}

function dateLabel(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(epoch);
}

function Badge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}

function PortfolioState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading learning proposals" description="Retrieving current canonical proposal summaries and review readiness." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Learning proposals unavailable" description={error ?? "The learning proposal portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No learning proposals yet" description="Measured, review-only policy proposals will appear here when evidence is ready." />;
}

function Scope({ tenantId, workspaceId }: Readonly<{ tenantId: string; workspaceId: string }>) {
  return (
    <dl className="grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2" aria-label="Exact learning proposal portfolio scope" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <div className="min-w-0">
        <dt className="section-label">Tenant</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{tenantId}</dd>
      </div>
      <div className="min-w-0">
        <dt className="section-label">Workspace</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{workspaceId}</dd>
      </div>
    </dl>
  );
}

function Metric({ label, value, detail }: Readonly<{ label: string; value: string; detail?: string }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums capitalize" style={{ color: "var(--text-primary)" }}>{value}</dd>
      {detail ? <dd className="mt-1 break-words text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detail}</dd> : null}
    </div>
  );
}

function ProposalCard({ summary, index, onOpen, onReview }: Readonly<{
  summary: LearningPortfolioSummary;
  index: number;
  onOpen?: (proposal: LearningPortfolioSummary) => void;
  onReview?: (proposal: LearningPortfolioSummary) => void;
}>) {
  const supplied = new Set(summary.eligibleActions);
  const reviewStateAllowsAction = summary.reviewStatus === "draft" || summary.reviewStatus === "in_review";
  const canOpen = supplied.has("open") && Boolean(onOpen);
  const canReview = supplied.has("review") && reviewStateAllowsAction && summary.readiness !== "blocked" && Boolean(onReview);
  const readiness = READINESS_META[summary.readiness];
  const review = REVIEW_META[summary.reviewStatus];
  const rollback = READINESS_META[summary.rollback.readiness];
  const headingId = `learning-portfolio-proposal-${index}`;
  const uncertaintyLabel = summary.uncertainty.count === 0
    ? "No stated uncertainty"
    : `${summary.uncertainty.count} ${summary.uncertainty.count === 1 ? "uncertainty" : "uncertainties"}`;

  return (
    <li
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-review-status={summary.reviewStatus}
      data-readiness={summary.readiness}
      data-review-available={canReview ? "true" : "false"}
    >
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Controlled learning proposal · Revision {summary.revision}</p>
            <h3 id={headingId} className="mt-1 break-words text-lg font-semibold capitalize leading-snug" style={{ color: "var(--text-primary)" }}>
              {words(summary.change.kind)}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{summary.stableKey}</p>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{summary.versionId}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
            <Badge {...readiness} label={`Proposal ${readiness.label.toLowerCase()}`} />
            <Badge {...review} />
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Cohort"
            value={summary.cohort.cohortId}
            detail={`${summary.cohort.denominator.toLocaleString("en-US")} records · ${dateLabel(summary.cohort.windowStart)}–${dateLabel(summary.cohort.windowEnd)} UTC`}
          />
          <Metric
            label="Observed metric"
            value={`${words(summary.metric.metricKey)} · ${basisPoints(summary.metric.valueBasisPoints)}`}
            detail={`${summary.metric.numerator.toLocaleString("en-US")} / ${summary.metric.denominator.toLocaleString("en-US")}`}
          />
          <Metric
            label="Policy delta"
            value={`${changeValue(summary.change.currentValue)} → ${changeValue(summary.change.proposedValue)}`}
            detail={summary.change.targetKey}
          />
          <Metric
            label="Uncertainty"
            value={uncertaintyLabel}
            detail={[
              summary.uncertainty.headline,
              summary.uncertainty.highestSeverity === null ? "No severity supplied" : `Highest severity ${summary.uncertainty.highestSeverity}/5`,
            ].filter(Boolean).join(" · ")}
          />
        </dl>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border p-3" aria-label="Expected measured impact" style={{ borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Expected impact</p>
            <p className="mt-2 text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {summary.expectedImpact.direction === "increase" ? "+" : "−"}{basisPoints(summary.expectedImpact.estimateBasisPoints)} {words(summary.expectedImpact.metricKey)}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Range {basisPoints(summary.expectedImpact.lowerBoundBasisPoints)}–{basisPoints(summary.expectedImpact.upperBoundBasisPoints)} over {summary.expectedImpact.horizonDays} days
            </p>
          </section>

          <section className="rounded-xl border p-3" aria-label="Rollback readiness" style={{ borderColor: "var(--surface-card-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="section-label">Rollback baseline</p>
              <Badge {...rollback} label={`Rollback ${rollback.label.toLowerCase()}`} />
            </div>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{summary.rollback.restorePlayVersionId}</p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Trigger {words(summary.rollback.triggerMetricKey)} at {basisPoints(summary.rollback.triggerThresholdBasisPoints)}
            </p>
          </section>
        </div>

        <div className="mt-3 grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <p className="break-all"><span className="font-semibold">Account:</span> <span className="font-mono">{summary.accountId}</span></p>
          <p><span className="font-semibold">Created:</span> <time dateTime={summary.createdAt}>{dateLabel(summary.createdAt)} UTC</time></p>
        </div>

        {canOpen || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(summary)}>
                Open exact proposal
              </button>
            ) : null}
            {canReview ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onReview?.(summary)}>
                Review exact proposal
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function LearningPortfolioPanel(props: LearningPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty" || props.proposals.length === 0) return <PortfolioState state="empty" />;
  if (props.proposals.some((summary) => summary.tenantId !== props.scope.tenantId || summary.workspaceId !== props.scope.workspaceId)) {
    return <PortfolioState state="error" error="The learning proposal portfolio scope could not be verified." />;
  }

  const reviewCount = props.proposals.filter((summary) => (
    summary.eligibleActions.includes("review")
      && (summary.reviewStatus === "draft" || summary.reviewStatus === "in_review")
      && summary.readiness !== "blocked"
  )).length;
  const blockedCount = props.proposals.filter((summary) => summary.readiness === "blocked").length;

  return (
    <section className="space-y-4" data-surface="learning-portfolio-panel" aria-labelledby="learning-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Controlled learning · Proposal portfolio</p>
            <h2 id="learning-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Measured policy proposals</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical cohort, metric, policy delta, uncertainty, impact, rollback, and human-review status without a policy activation control.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.proposals.length} {props.proposals.length === 1 ? "proposal" : "proposals"} · {reviewCount} ready for review · {blockedCount} blocked
          </p>
        </div>
        <div className="mt-4"><Scope tenantId={props.scope.tenantId} workspaceId={props.scope.workspaceId} /></div>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Canonical controlled-learning proposal summaries">
        {props.proposals.map((summary, index) => (
          <ProposalCard
            key={`${summary.stableKey}:${summary.versionId}`}
            summary={summary}
            index={index}
            onOpen={props.onOpen}
            onReview={props.onReview}
          />
        ))}
      </ul>
    </section>
  );
}
