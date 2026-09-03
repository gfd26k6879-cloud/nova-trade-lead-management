"use client";

import { AsyncState } from "@/components/async-state";
import type { LearningProposal } from "@/lib/outcomes/learning-proposal";

type ReadyProps = Readonly<{
  state: "ready";
  proposal: LearningProposal;
  onSubmitForReview?: (proposal: LearningProposal) => void;
  onApprove?: (proposal: LearningProposal) => void;
  onReject?: (proposal: LearningProposal) => void;
}>;

export type LearningProposalPanelProps =
  | Readonly<{ state: "loading"; proposal?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; proposal?: never }>
  | ReadyProps;

const REVIEW_META = {
  draft: { label: "Draft proposal", symbol: "○", style: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" } },
  in_review: { label: "Human review required", symbol: "?", style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" } },
  approved: { label: "Proposal approved", symbol: "✓", style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" } },
  rejected: { label: "Proposal rejected", symbol: "×", style: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" } },
} as const;

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function valueLabel(value: number | "enabled" | "disabled"): string {
  return typeof value === "number" ? `${(value / 100).toFixed(2)}%` : value;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ReadyLearningProposal({ proposal, onSubmitForReview, onApprove, onReject }: ReadyProps) {
  const review = REVIEW_META[proposal.review.status];
  const reviewActions = proposal.review.status === "draft"
    ? onSubmitForReview ? [{ key: "submit", label: "Submit for human review", run: onSubmitForReview }] : []
    : proposal.review.status === "in_review"
      ? [
          ...(onReject ? [{ key: "reject", label: "Reject proposal", run: onReject }] : []),
          ...(onApprove ? [{ key: "approve", label: "Approve proposal only", run: onApprove }] : []),
        ]
      : [];

  return (
    <section className="space-y-5" data-surface="learning-proposal-panel" aria-labelledby="learning-proposal-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Controlled learning · Review-only change</p>
            <h2 id="learning-proposal-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Review a measured play-policy proposal
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              This proposal can be reviewed or approved, but it cannot activate or silently change the current play policy.
            </p>
          </div>
          <div className="rounded-xl border px-3 py-2" data-review-status={proposal.review.status} style={review.style}>
            <p className="text-sm font-semibold"><span aria-hidden="true">{review.symbol}</span> {review.label}</p>
            <p className="mt-1 text-xs">Revision {proposal.revision}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-change-title">
            <p className="section-label">Typed policy delta</p>
            <h3 id="learning-change-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {words(proposal.change.kind)}
            </h3>
            <p className="mt-2 break-all font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>{proposal.change.targetKey}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                <p className="section-label">Current</p>
                <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{valueLabel(proposal.change.currentValue)}</p>
              </div>
              <span className="text-center" aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>→</span>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-info-border)", background: "var(--accent-light)" }}>
                <p className="section-label">Proposed</p>
                <p className="mt-1 text-lg font-semibold" style={{ color: "var(--accent)" }}>{valueLabel(proposal.change.proposedValue)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.change.rationale}</p>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-evidence-title">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Bound evidence</p>
                <h3 id="learning-evidence-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Outcome cohort</h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{proposal.outcomeRefs.length} immutable outcome versions</p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Metric</dt>
                <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{words(proposal.metric.metricKey)}</dd>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Observed rate</dt>
                <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{valueLabel(proposal.metric.valueBasisPoints)}</dd>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Numerator / denominator</dt>
                <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{proposal.metric.numerator} / {proposal.metric.denominator}</dd>
              </div>
            </dl>
            <details className="mt-3 rounded-xl border" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
              <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Exact outcome lineage</summary>
              <ul className="space-y-2 border-t px-3 py-3" aria-label="Outcome versions used by this proposal" style={{ borderColor: "var(--surface-card-border)" }}>
                {proposal.outcomeRefs.map((outcome) => (
                  <li key={outcome.versionId} className="rounded-lg border p-3" style={{ borderColor: "var(--table-row-border)" }}>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{words(outcome.outcome)} · {words(outcome.attributionKind)}</p>
                    <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{outcome.stableKey}</p>
                    <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{outcome.versionId}</p>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Impact, uncertainty, and rollback">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-impact-title">
            <p className="section-label">Bounded expectation</p>
            <h3 id="learning-impact-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Expected impact</h3>
            <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>{proposal.expectedImpact.direction === "increase" ? "+" : "−"}{valueLabel(proposal.expectedImpact.estimateBasisPoints)}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Range {valueLabel(proposal.expectedImpact.lowerBoundBasisPoints)}–{valueLabel(proposal.expectedImpact.upperBoundBasisPoints)} over {proposal.expectedImpact.horizonDays} days
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.expectedImpact.rationale}</p>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-uncertainty-title">
            <p className="section-label">Must remain visible</p>
            <h3 id="learning-uncertainty-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Uncertainty</h3>
            <ul className="mt-3 space-y-2">
              {proposal.uncertainties.map((item) => (
                <li key={item.uncertaintyId} className="rounded-xl border p-3" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--warning-text)" }}>? {item.statement}</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Impact: {item.impact}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Severity {item.severity}/5</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-rollback-title">
            <p className="section-label">Exact baseline</p>
            <h3 id="learning-rollback-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Rollback descriptor</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.rollback.reason}</p>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{proposal.rollback.restorePlayVersionId}</p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Trigger: {words(proposal.rollback.triggerMetricKey)} at {valueLabel(proposal.rollback.triggerThresholdBasisPoints)}
            </p>
          </section>
        </aside>
      </div>

      <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="learning-review-trail-title">
        <p className="section-label">Human-only chronology</p>
        <h3 id="learning-review-trail-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Review trail</h3>
        {proposal.review.events.length ? (
          <ol className="mt-3 space-y-2" aria-label="Learning proposal review events">
            {proposal.review.events.map((event, index) => (
              <li key={`${event.at}:${index}`} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(event.from)} → {words(event.to)}</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                <p className="mt-2 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>{event.actor.actorId} · {dateLabel(event.at)} UTC</p>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>No human review event has been recorded.</p>}
      </section>

      {reviewActions.length ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5">
          <p id="learning-actions-help" className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            These controls review this exact proposal version. Approval does not activate or mutate the play policy.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {reviewActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`${action.key === "approve" || action.key === "submit" ? "btn-primary" : "btn-glass"} min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`}
                aria-describedby="learning-actions-help"
                onClick={() => action.run(proposal)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </footer>
      ) : null}

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Exact proposal: {proposal.versionId}</p>
    </section>
  );
}

export function LearningProposalPanel(props: LearningProposalPanelProps) {
  if (props.state === "loading") {
    return <AsyncState variant="loading" title="Loading learning proposal" description="Retrieving the exact cohort, policy delta, uncertainty, and review state." />;
  }
  if (props.state === "error") {
    return <AsyncState variant="error" title="Learning proposal unavailable" description={props.error} />;
  }
  return <ReadyLearningProposal {...props} />;
}
