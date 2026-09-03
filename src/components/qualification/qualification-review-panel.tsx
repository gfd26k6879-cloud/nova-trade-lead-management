"use client";

import { AsyncState } from "@/components/async-state";
import type {
  AccountQualification,
  QualificationDecision,
  QualificationReviewStatus,
} from "@/lib/qualification/account-qualification";

type ReadyProps = Readonly<{
  state: "ready";
  qualification: AccountQualification;
  onConfirm?: (qualification: AccountQualification) => void;
  onOverride?: (decision: QualificationDecision, qualification: AccountQualification) => void;
}>;

export type QualificationReviewPanelProps =
  | Readonly<{ state: "loading"; qualification?: never; error?: never }>
  | Readonly<{ state: "error"; qualification?: never; error: string }>
  | ReadyProps;

const DECISION_META = {
  qualified: {
    label: "Qualified",
    symbol: "✓",
    state: "STATE-READY",
    style: {
      background: "var(--success-bg)",
      borderColor: "var(--success-border)",
      color: "var(--success-text)",
    },
  },
  needs_review: {
    label: "Needs review",
    symbol: "?",
    state: "STATE-UNKNOWN",
    style: {
      background: "var(--warning-bg)",
      borderColor: "var(--warning-border)",
      color: "var(--warning-text)",
    },
  },
  unqualified: {
    label: "Unqualified",
    symbol: "×",
    state: "STATE-BLOCKED",
    style: {
      background: "var(--danger-bg)",
      borderColor: "var(--danger-border)",
      color: "var(--danger-text)",
    },
  },
} as const;

const UNCERTAINTY_META = {
  none: { label: "No stated uncertainty", symbol: "✓", color: "var(--success-text)" },
  low: { label: "Low uncertainty", symbol: "!", color: "var(--warning-text)" },
  high: { label: "High uncertainty", symbol: "?", color: "var(--danger-text)" },
} as const;

const REVIEW_LABEL: Record<QualificationReviewStatus, string> = {
  unreviewed: "Awaiting human review",
  confirmed: "Human confirmed",
  overridden: "Human overridden",
};

function decisionLabel(decision: QualificationDecision): string {
  return DECISION_META[decision].label;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ReadyQualificationReview({ qualification, onConfirm, onOverride }: ReadyProps) {
  const recommendation = DECISION_META[qualification.automatedDecision];
  const currentDecision = DECISION_META[qualification.decision];
  const overrideTargets = (Object.keys(DECISION_META) as QualificationDecision[])
    .filter((decision) => decision !== qualification.decision);
  const hasReviewActions = Boolean(onConfirm || onOverride);

  return (
    <section
      className="space-y-5"
      data-surface="qualification-review-panel"
      data-review-status={qualification.reviewStatus}
      aria-labelledby="qualification-review-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Account qualification · Human review</p>
            <h2
              id="qualification-review-title"
              className="mt-2 text-2xl font-semibold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Review the qualification evidence
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Inspect the weighted factors, source observations, and uncertainty before confirming or overriding the recommendation.
            </p>
          </div>
          <div
            className="shrink-0 rounded-xl border px-4 py-3"
            data-decision={qualification.decision}
            data-state={currentDecision.state}
            aria-label={`Current decision: ${currentDecision.label}`}
            style={currentDecision.style}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">Current decision</p>
            <p className="mt-1 text-sm font-semibold">
              <span aria-hidden="true">{currentDecision.symbol}</span> {currentDecision.label}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="qualification-factors-title">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="section-label">Deterministic inputs</p>
                <h3 id="qualification-factors-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Weighted factors
                </h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {qualification.factors.length} factors · policy {qualification.policy.policyId}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {qualification.factors.map((factor, index) => {
                const uncertainty = UNCERTAINTY_META[factor.uncertainty.level];
                const titleId = `qualification-factor-${index}-title`;
                return (
                  <article
                    key={factor.factorId}
                    className="rounded-xl border p-3 sm:p-4"
                    data-uncertainty={factor.uncertainty.level}
                    aria-labelledby={titleId}
                    style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <h4 id={titleId} className="break-all font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {factor.factorId}
                        </h4>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {factor.reason}
                        </p>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--surface-card-border)" }}>
                          <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Score</p>
                          <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{factor.score}/100</p>
                        </div>
                        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--surface-card-border)" }}>
                          <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Weight</p>
                          <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{factor.weight}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--surface-card-border)" }}>
                      <p className="text-xs font-semibold" style={{ color: uncertainty.color }}>
                        <span aria-hidden="true">{uncertainty.symbol}</span> {uncertainty.label}
                      </p>
                      {factor.uncertainty.reason ? (
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {factor.uncertainty.reason}
                        </p>
                      ) : null}
                      <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                        Cited evidence refs
                      </p>
                      {factor.evidenceObservationIds.length > 0 ? (
                        <ul className="mt-1.5 flex flex-wrap gap-2" aria-label={`Cited evidence for ${factor.factorId}`}>
                          {factor.evidenceObservationIds.map((reference) => (
                            <li key={reference}>
                              <code className="block max-w-full break-all rounded-lg border px-2 py-1 text-[0.68rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
                                {reference}
                              </code>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-xs font-semibold" data-state="STATE-UNKNOWN" style={{ color: "var(--danger-text)" }}>
                          No evidence reference attached; uncertainty review is required.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="qualification-observations-title">
            <p className="section-label">Evidence ledger</p>
            <h3 id="qualification-observations-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Source observations
            </h3>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {qualification.observations.map((observation) => (
                <li key={observation.observationId} className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                  <p className="break-all font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{observation.observationId}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    Observed <time dateTime={observation.observedAt}>{formatTimestamp(observation.observedAt)} UTC</time>
                  </p>
                  <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Provenance: {observation.provenanceHash}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Qualification decision and audit">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="qualification-score-title">
            <p className="section-label">Policy result</p>
            <h3 id="qualification-score-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Score and recommendation
            </h3>
            <p className="mt-4 text-4xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {qualification.weightedScore}<span className="text-base" style={{ color: "var(--text-tertiary)" }}>/100</span>
            </p>
            <div className="mt-3 rounded-xl border p-3" data-automated-decision={qualification.automatedDecision} data-state={recommendation.state} style={recommendation.style}>
              <p className="text-xs font-semibold uppercase tracking-wide">Deterministic recommendation</p>
              <p className="mt-1 text-sm font-semibold"><span aria-hidden="true">{recommendation.symbol}</span> {recommendation.label}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border p-2" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt style={{ color: "var(--text-tertiary)" }}>Review at</dt>
                <dd className="mt-1 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{qualification.policy.reviewThreshold}+</dd>
              </div>
              <div className="rounded-lg border p-2" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt style={{ color: "var(--text-tertiary)" }}>Qualify at</dt>
                <dd className="mt-1 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{qualification.policy.qualifiedThreshold}+</dd>
              </div>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="qualification-review-state-title">
            <p className="section-label">Human checkpoint</p>
            <h3 id="qualification-review-state-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {REVIEW_LABEL[qualification.reviewStatus]}
            </h3>
            {qualification.reviewEvents.length > 0 ? (
              <ol className="mt-3 space-y-3" aria-label="Human review audit trail">
                {qualification.reviewEvents.map((event) => (
                  <li key={event.eventId} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      Human {event.action === "confirm" ? "confirmed" : "overrode"}: {decisionLabel(event.fromDecision)} → {decisionLabel(event.toDecision)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                    <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
                      {event.actor.actorId} · <time dateTime={event.at}>{formatTimestamp(event.at)} UTC</time>
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                No human decision has been recorded for this version.
              </p>
            )}
          </section>
        </aside>
      </div>

      {hasReviewActions ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="qualification-review-actions-title">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 id="qualification-review-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Record a human decision
              </h3>
              <p id="qualification-review-actions-help" className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                These controls request review only. The caller must record the decision against this exact qualification version.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
              {onConfirm ? (
                <button
                  type="button"
                  className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                  aria-describedby="qualification-review-actions-help"
                  onClick={() => onConfirm(qualification)}
                >
                  Confirm {currentDecision.label}
                </button>
              ) : null}
              {onOverride ? overrideTargets.map((decision) => (
                <button
                  key={decision}
                  type="button"
                  className="btn-glass min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                  aria-describedby="qualification-review-actions-help"
                  onClick={() => onOverride(decision, qualification)}
                >
                  Override to {decisionLabel(decision)}
                </button>
              )) : null}
            </div>
          </div>
        </footer>
      ) : null}

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
        Exact qualification: {qualification.versionId}
      </p>
    </section>
  );
}

export function QualificationReviewPanel(props: QualificationReviewPanelProps) {
  if (props.state === "loading") {
    return (
      <AsyncState
        variant="loading"
        title="Loading account qualification"
        description="Retrieving the exact versioned factors, evidence, and review history."
      />
    );
  }

  if (props.state === "error") {
    return (
      <AsyncState
        variant="error"
        title="Account qualification unavailable"
        description={props.error}
      />
    );
  }

  return <ReadyQualificationReview {...props} />;
}
