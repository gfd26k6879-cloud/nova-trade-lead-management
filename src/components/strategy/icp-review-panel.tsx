"use client";

import { AsyncState } from "@/components/async-state";
import type { IcpCriterion, IcpProposal, IcpReviewStatus } from "@/lib/strategy/icp";

type ReadyProps = Readonly<{
  state: "ready";
  proposal: IcpProposal;
  onSubmitForReview?: (proposal: IcpProposal) => void;
  onApprove?: (proposal: IcpProposal) => void;
  onReject?: (proposal: IcpProposal) => void;
}>;

export type IcpReviewPanelProps =
  | Readonly<{ state: "loading"; proposal?: never; error?: never }>
  | Readonly<{ state: "error"; proposal?: never; error: string }>
  | ReadyProps;

const REVIEW_META: Record<IcpReviewStatus, Readonly<{
  label: string;
  symbol: string;
  state: string;
  style: Readonly<{ background: string; borderColor: string; color: string }>;
}>> = {
  draft: {
    label: "Draft",
    symbol: "·",
    state: "STATE-UNKNOWN",
    style: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  },
  in_review: {
    label: "In human review",
    symbol: "?",
    state: "STATE-UNKNOWN",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
  approved: {
    label: "Human approved",
    symbol: "✓",
    state: "STATE-READY",
    style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  },
  rejected: {
    label: "Human rejected",
    symbol: "×",
    state: "STATE-BLOCKED",
    style: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  },
  superseded: {
    label: "Superseded",
    symbol: "↗",
    state: "STATE-BLOCKED",
    style: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  },
};

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function exactBindingIsValid(proposal: IcpProposal): boolean {
  return proposal.review.versionId === proposal.versionId
    && proposal.review.contentHash === proposal.contentHash
    && proposal.review.stableKey === proposal.stableKey
    && proposal.review.revision === proposal.revision
    && proposal.review.supersedesVersionId === proposal.supersedesVersionId
    && proposal.review.tenantId === proposal.tenantId
    && proposal.review.workspaceId === proposal.workspaceId
    && proposal.review.understandingVersionId === proposal.understanding.versionId
    && proposal.review.understandingContentHash === proposal.understanding.contentHash
    && proposal.review.understandingReviewHash === proposal.understanding.reviewHash
    && proposal.understanding.tenantId === proposal.tenantId
    && proposal.understanding.workspaceId === proposal.workspaceId
    && proposal.understanding.status === "approved";
}

function CriterionCard({ criterion, kind }: Readonly<{ criterion: IcpCriterion; kind: "include" | "exclude" }>) {
  const titleId = `${kind}-criterion-${criterion.criterionId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <li
      className="rounded-xl border p-3 sm:p-4"
      data-criterion-kind={kind}
      style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}
      aria-labelledby={titleId}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="section-label">{words(criterion.domain)}</p>
          <h4 id={titleId} className="mt-1 text-sm font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {criterion.rule}
          </h4>
        </div>
        <p className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {(criterion.confidenceBasisPoints / 100).toFixed(0)}% confidence
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{criterion.rationale}</p>
      <details className="mt-3 rounded-lg border" style={{ borderColor: "var(--table-row-border)" }}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Evidence lineage · {criterion.rationaleRefs.length} {criterion.rationaleRefs.length === 1 ? "reference" : "references"}
        </summary>
        <ul className="space-y-2 border-t px-3 py-3" style={{ borderColor: "var(--table-row-border)" }}>
          {criterion.rationaleRefs.map((reference) => (
            <li key={`${reference.claimId}:${reference.evidenceId}`} className="min-w-0">
              <p className="break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>Claim: {reference.claimId}</p>
              <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Evidence: {reference.evidenceId}</p>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{criterion.ruleKey}</p>
    </li>
  );
}

function ReadyIcpReview({ proposal, onSubmitForReview, onApprove, onReject }: ReadyProps) {
  const review = REVIEW_META[proposal.review.status];
  const bindingValid = exactBindingIsValid(proposal);
  const reviewActions = !bindingValid
    ? []
    : proposal.review.status === "draft"
      ? onSubmitForReview ? [{ key: "submit", label: "Submit for human review", run: onSubmitForReview }] : []
      : proposal.review.status === "in_review"
        ? [
            ...(onReject ? [{ key: "reject", label: "Reject ICP version", run: onReject }] : []),
            ...(onApprove ? [{ key: "approve", label: "Approve ICP version only", run: onApprove }] : []),
          ]
        : [];

  return (
    <section
      className="space-y-5"
      data-surface="icp-review-panel"
      data-review-status={proposal.review.status}
      data-binding-valid={bindingValid ? "true" : "false"}
      aria-labelledby="icp-review-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">ICP strategy · Versioned human review</p>
            <h2 id="icp-review-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {proposal.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Review the segment, evidence, exclusions, and unresolved uncertainty before approving this exact ICP version.
            </p>
          </div>
          <div
            className="shrink-0 rounded-xl border px-4 py-3"
            data-state={review.state}
            style={review.style}
            aria-label={`Review status: ${review.label}`}
          >
            <p className="text-sm font-semibold"><span aria-hidden="true">{review.symbol}</span> {review.label}</p>
            <p className="mt-1 text-xs">Revision {proposal.revision}</p>
          </div>
        </div>
      </header>

      {!bindingValid ? (
        <div className="rounded-2xl border p-4" role="alert" data-state="STATE-BLOCKED" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
          <p className="font-semibold">Exact version validation failed</p>
          <p className="mt-1 text-sm leading-relaxed">The proposal, review snapshot, and approved-understanding binding do not match. Human review controls are unavailable.</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-definition-title">
            <p className="section-label">Target definition</p>
            <h3 id="icp-definition-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{proposal.segment}</h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.useCase}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Inclusions</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{proposal.positiveCriteria.length}</dd>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Exclusions</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{proposal.exclusions.length}</dd>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">Uncertainties</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: proposal.uncertainties.length ? "var(--warning-text)" : "var(--success-text)" }}>{proposal.uncertainties.length}</dd>
              </div>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-inclusions-title">
            <p className="section-label">Positive fit</p>
            <h3 id="icp-inclusions-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Inclusion criteria</h3>
            <ul className="mt-4 space-y-3">
              {proposal.positiveCriteria.map((criterion) => <CriterionCard key={criterion.criterionId} criterion={criterion} kind="include" />)}
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-exclusions-title">
            <p className="section-label">Explicit boundaries</p>
            <h3 id="icp-exclusions-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Exclusion criteria</h3>
            <ul className="mt-4 space-y-3">
              {proposal.exclusions.map((criterion) => <CriterionCard key={criterion.criterionId} criterion={criterion} kind="exclude" />)}
            </ul>
          </section>
        </div>

        <aside className="space-y-5" aria-label="ICP uncertainty, validation, and review history">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-uncertainty-title">
            <p className="section-label">Must remain visible</p>
            <h3 id="icp-uncertainty-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Uncertainty</h3>
            {proposal.uncertainties.length ? (
              <ul className="mt-3 space-y-3">
                {proposal.uncertainties.map((uncertainty) => (
                  <li key={uncertainty.uncertaintyId} className="rounded-xl border p-3" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--warning-text)" }}>? {uncertainty.statement}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Impact: {uncertainty.impact}</p>
                    <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>{words(uncertainty.domain)} · {uncertainty.relatedClaimIds.length} related claims</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm" data-state="STATE-READY" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" }}>No unresolved uncertainty is recorded.</p>
            )}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-validation-title">
            <p className="section-label">Exact bindings</p>
            <h3 id="icp-validation-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Validation</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li className="rounded-lg border p-3" data-state={bindingValid ? "STATE-READY" : "STATE-BLOCKED"} style={{ borderColor: bindingValid ? "var(--success-border)" : "var(--danger-border)" }}>
                <span aria-hidden="true">{bindingValid ? "✓" : "×"}</span> Proposal and review snapshot match
              </li>
              <li className="rounded-lg border p-3" data-state="STATE-READY" style={{ borderColor: "var(--success-border)" }}>
                <span aria-hidden="true">✓</span> Source understanding is human approved
              </li>
              <li className="rounded-lg border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
                {proposal.positiveCriteria.length + proposal.exclusions.length} rules · {proposal.positiveCriteria.concat(proposal.exclusions).reduce((total, item) => total + item.rationaleRefs.length, 0)} evidence references
              </li>
            </ul>
            <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{proposal.understanding.versionId}</p>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="icp-review-history-title">
            <p className="section-label">Human-only chronology</p>
            <h3 id="icp-review-history-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Review and approval trail</h3>
            {proposal.review.events.length ? (
              <ol className="mt-3 space-y-3" aria-label="ICP review events">
                {proposal.review.events.map((event, index) => (
                  <li key={`${event.at}:${index}`} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                    <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(event.from)} → {words(event.to)}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                    <p className="mt-2 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>{event.actor.actorId} · <time dateTime={event.at}>{dateLabel(event.at)} UTC</time></p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>No human review event has been recorded.</p>
            )}
          </section>
        </aside>
      </div>

      {reviewActions.length ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5">
          <p id="icp-review-actions-help" className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            These controls request a human transition for this exact version. Approval records review only; it does not activate an ICP or lead play.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {reviewActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`${action.key === "reject" ? "btn-glass" : "btn-primary"} min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`}
                aria-describedby="icp-review-actions-help"
                onClick={() => action.run(proposal)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </footer>
      ) : null}

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Exact ICP version: {proposal.versionId}</p>
    </section>
  );
}

export function IcpReviewPanel(props: IcpReviewPanelProps) {
  if (props.state === "loading") {
    return <AsyncState variant="loading" title="Loading ICP version" description="Retrieving the exact criteria, evidence, uncertainty, and review history." />;
  }

  if (props.state === "error") {
    return <AsyncState variant="error" title="ICP version unavailable" description={props.error} />;
  }

  return <ReadyIcpReview {...props} />;
}
