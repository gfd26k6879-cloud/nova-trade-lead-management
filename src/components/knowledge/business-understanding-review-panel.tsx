"use client";

import { AsyncState } from "@/components/async-state";
import type {
  BusinessUnderstandingProposal,
  BusinessUnderstandingReviewEvent,
  BusinessUnderstandingReviewStatus,
  UnderstandingFact,
} from "@/lib/understanding/business-understanding";

type ReadyProps = Readonly<{
  state: "ready";
  proposal: BusinessUnderstandingProposal;
  onSubmitForReview?: (proposal: BusinessUnderstandingProposal) => void;
  onApprove?: (proposal: BusinessUnderstandingProposal) => void;
  onReject?: (proposal: BusinessUnderstandingProposal) => void;
}>;

export type BusinessUnderstandingReviewPanelProps =
  | Readonly<{ state: "loading"; proposal?: never; error?: never }>
  | Readonly<{ state: "error"; proposal?: never; error: string }>
  | ReadyProps;

const REVIEW_META: Record<BusinessUnderstandingReviewStatus, Readonly<{
  label: string;
  symbol: string;
  style: Readonly<{ background: string; borderColor: string; color: string }>;
}>> = {
  draft: {
    label: "Draft understanding",
    symbol: "○",
    style: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  },
  in_review: {
    label: "Human review required",
    symbol: "?",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
  approved: {
    label: "Human approved",
    symbol: "✓",
    style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  },
  rejected: {
    label: "Human rejected",
    symbol: "×",
    style: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  },
  superseded: {
    label: "Superseded",
    symbol: "↗",
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

function allowedTransition(from: BusinessUnderstandingReviewStatus, to: BusinessUnderstandingReviewStatus): boolean {
  return (from === "draft" && to === "in_review")
    || (from === "in_review" && (to === "approved" || to === "rejected"))
    || (from === "approved" && to === "superseded");
}

function chronologyIsValid(
  events: readonly BusinessUnderstandingReviewEvent[],
  createdAt: string,
  suppliedStatus: BusinessUnderstandingReviewStatus,
  suppliedReplacementVersionId: string | null,
  versionId: string,
): boolean {
  let status: BusinessUnderstandingReviewStatus = "draft";
  let lastAt = Date.parse(createdAt);
  let replacementVersionId: string | null = null;

  if (!Number.isFinite(lastAt)) return false;
  for (const event of events) {
    const eventAt = Date.parse(event.at);
    if (event.actor.kind !== "human" || event.from !== status || !allowedTransition(event.from, event.to)
      || !Number.isFinite(eventAt) || eventAt <= lastAt
      || (event.to === "superseded"
        ? event.replacementVersionId === null || event.replacementVersionId === versionId
        : event.replacementVersionId !== null)) {
      return false;
    }
    status = event.to;
    lastAt = eventAt;
    replacementVersionId = event.replacementVersionId;
  }

  return status === suppliedStatus && replacementVersionId === suppliedReplacementVersionId;
}

function exactBindingIsValid(proposal: BusinessUnderstandingProposal): boolean {
  const review = proposal.review;
  return proposal.status === "review_required"
    && proposal.reviewState === "pending"
    && proposal.versionId === `understanding-version:${proposal.contentHash.slice("sha256:".length)}`
    && review.versionId === proposal.versionId
    && review.proposalRef === proposal.proposalRef
    && review.revision === proposal.revision
    && review.supersedesProposalRef === proposal.supersedesProposalRef
    && review.tenantId === proposal.tenantId
    && review.workspaceId === proposal.workspaceId
    && review.contentHash === proposal.contentHash
    && review.claimSetHash === proposal.claimSetHash
    && review.supersedesVersionId === proposal.supersedesVersionId
    && review.createdAt === proposal.createdAt
    && chronologyIsValid(
      review.events,
      review.createdAt,
      review.status,
      review.replacementVersionId,
      review.versionId,
    );
}

function FactCard({ fact }: Readonly<{ fact: UnderstandingFact }>) {
  const titleId = `understanding-fact-${fact.claimId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <li
      className="rounded-xl border p-3 sm:p-4"
      data-claim-status={fact.claimStatus}
      style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}
      aria-labelledby={titleId}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="section-label">{words(fact.claimClass)} · {words(fact.origin)}</p>
          <h4 id={titleId} className="mt-1 text-sm font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {fact.statement}
          </h4>
          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{fact.subject}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs font-semibold capitalize" style={{ color: fact.claimStatus === "conflicted" ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {words(fact.claimStatus)}
          </p>
          <p className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
            {(fact.confidenceBasisPoints / 100).toFixed(0)}% confidence
          </p>
        </div>
      </div>
      <details className="mt-3 rounded-lg border" style={{ borderColor: "var(--table-row-border)" }}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Evidence citations · {fact.citations.length} {fact.citations.length === 1 ? "source" : "sources"}
        </summary>
        <ul className="space-y-2 border-t px-3 py-3" aria-label={`Citations for ${fact.claimId}`} style={{ borderColor: "var(--table-row-border)" }}>
          {fact.citations.map((citation) => (
            <li key={citation.evidenceId} className="rounded-lg border p-3" style={{ borderColor: "var(--table-row-border)" }}>
              <p className="text-xs font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
                {words(citation.grade)} · {words(citation.freshness)}
              </p>
              <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>Evidence: {citation.evidenceId}</p>
              <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Source: {citation.sourceVersionRef}</p>
              <p className="mt-1 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>Locator: {citation.locator}</p>
              <p className="mt-1 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{citation.contentHash}</p>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
        {fact.claimId} · claim v{fact.claimVersion}{fact.material ? " · material" : ""}
      </p>
    </li>
  );
}

function ReadyBusinessUnderstanding({ proposal, onSubmitForReview, onApprove, onReject }: ReadyProps) {
  const review = REVIEW_META[proposal.review.status];
  const bindingValid = exactBindingIsValid(proposal);
  const reviewActions = !bindingValid
    ? []
    : proposal.review.status === "draft"
      ? onSubmitForReview ? [{ key: "submit", label: "Submit for human review", run: onSubmitForReview }] : []
      : proposal.review.status === "in_review"
        ? [
            ...(onReject ? [{ key: "reject", label: "Reject understanding version", run: onReject }] : []),
            ...(onApprove ? [{ key: "approve", label: "Approve understanding version only", run: onApprove }] : []),
          ]
        : [];

  return (
    <section
      className="space-y-5"
      data-surface="business-understanding-review-panel"
      data-review-status={proposal.review.status}
      data-binding-valid={bindingValid ? "true" : "false"}
      aria-labelledby="business-understanding-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Business understanding · Versioned evidence review</p>
            <h2 id="business-understanding-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Review what the system understands
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Confirm each claim against its exact citation and keep unresolved facts visible before this version can inform strategy.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border px-4 py-3" style={review.style} aria-label={`Review status: ${review.label}`}>
            <p className="text-sm font-semibold"><span aria-hidden="true">{review.symbol}</span> {review.label}</p>
            <p className="mt-1 text-xs">Revision {proposal.revision}</p>
          </div>
        </div>
      </header>

      {!bindingValid ? (
        <div className="rounded-2xl border p-4" role="alert" data-state="STATE-BLOCKED" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
          <p className="font-semibold">Exact version validation failed</p>
          <p className="mt-1 text-sm leading-relaxed">The proposal, review snapshot, or human chronology does not match. Review controls are unavailable.</p>
        </div>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass rounded-xl p-3">
          <dt className="section-label">Material claims</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{proposal.coverage.materialClaims}</dd>
        </div>
        <div className="glass rounded-xl p-3">
          <dt className="section-label">Current evidence</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{(proposal.coverage.currentEvidenceBasisPoints / 100).toFixed(0)}%</dd>
        </div>
        <div className="glass rounded-xl p-3">
          <dt className="section-label">Material confidence</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{(proposal.coverage.materialConfidenceBasisPoints / 100).toFixed(0)}%</dd>
        </div>
        <div className="glass rounded-xl p-3">
          <dt className="section-label">Explicit unknowns</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" style={{ color: proposal.coverage.explicitUnknowns ? "var(--warning-text)" : "var(--success-text)" }}>{proposal.coverage.explicitUnknowns}</dd>
        </div>
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          {proposal.domains.map((domain) => (
            <section key={domain.domain} className="glass rounded-2xl p-4 sm:p-5" aria-labelledby={`understanding-domain-${domain.domain}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="section-label">Knowledge domain</p>
                  <h3 id={`understanding-domain-${domain.domain}`} className="mt-1 text-lg font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(domain.domain)}</h3>
                </div>
                <p className="text-xs font-semibold capitalize" data-domain-state={domain.state} style={{ color: domain.state === "conflict" || domain.state === "unknown" ? "var(--warning-text)" : "var(--text-secondary)" }}>
                  {words(domain.state)} · {domain.facts.length} {domain.facts.length === 1 ? "claim" : "claims"}
                </p>
              </div>
              {domain.facts.length ? (
                <ul className="mt-4 space-y-3">
                  {domain.facts.map((fact) => <FactCard key={fact.claimId} fact={fact} />)}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border p-3 text-sm" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                  No evidenced claim is available in this domain.
                </p>
              )}
            </section>
          ))}
        </div>

        <aside className="space-y-5" aria-label="Uncertainty, lineage, and human review history">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="understanding-uncertainty-title">
            <p className="section-label">Adaptive-question handoff</p>
            <h3 id="understanding-uncertainty-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Unresolved understanding</h3>
            {proposal.uncertainties.length ? (
              <>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  These unknowns are the bounded input for adaptive question planning for this exact understanding version.
                </p>
                <ul className="mt-3 space-y-3">
                  {proposal.uncertainties.map((uncertainty) => (
                    <li key={uncertainty.claimId} className="rounded-xl border p-3" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--warning-text)" }}>? {uncertainty.statement}</p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{uncertainty.reason}</p>
                      <p className="mt-2 text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>{words(uncertainty.domain)} · {words(uncertainty.claimClass)}{uncertainty.material ? " · material" : ""}</p>
                      <p className="mt-1 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{uncertainty.claimId} · claim v{uncertainty.claimVersion}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Handoff version: {proposal.versionId}</p>
              </>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm" data-state="STATE-READY" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" }}>
                No unresolved fact requires an adaptive question handoff.
              </p>
            )}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="understanding-lineage-title">
            <p className="section-label">Exact lineage</p>
            <h3 id="understanding-lineage-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Version binding</h3>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt style={{ color: "var(--text-tertiary)" }}>Proposal</dt>
                <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{proposal.proposalRef}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-tertiary)" }}>Claim set</dt>
                <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{proposal.claimSetHash}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-tertiary)" }}>Content</dt>
                <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{proposal.contentHash}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-tertiary)" }}>Created</dt>
                <dd className="mt-1" style={{ color: "var(--text-secondary)" }}><time dateTime={proposal.createdAt}>{dateLabel(proposal.createdAt)} UTC</time></dd>
              </div>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="understanding-review-history-title">
            <p className="section-label">Human-only chronology</p>
            <h3 id="understanding-review-history-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Review trail</h3>
            {proposal.review.events.length ? (
              <ol className="mt-3 space-y-3" aria-label="Business understanding review events">
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
          <p id="understanding-review-actions-help" className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            These controls request a human transition for this exact version. Approval records understanding only; it does not activate an ICP, play, discovery run, or outreach.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {reviewActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`${action.key === "reject" ? "btn-glass" : "btn-primary"} min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`}
                aria-describedby="understanding-review-actions-help"
                onClick={() => action.run(proposal)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </footer>
      ) : null}

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Exact understanding version: {proposal.versionId}</p>
    </section>
  );
}

export function BusinessUnderstandingReviewPanel(props: BusinessUnderstandingReviewPanelProps) {
  if (props.state === "loading") {
    return <AsyncState variant="loading" title="Loading business understanding" description="Retrieving the exact claims, citations, uncertainty, and human review history." />;
  }
  if (props.state === "error") {
    return <AsyncState variant="error" title="Business understanding unavailable" description={props.error} />;
  }
  return <ReadyBusinessUnderstanding {...props} />;
}
