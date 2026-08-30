"use client";

import { AsyncState } from "@/components/async-state";
import type { LeadPlayProposal, LeadPlayReviewStatus } from "@/lib/strategy/lead-play";
import type {
  LeadPlayActivationBinding,
  LeadPlayActivationState,
  LeadPlaySimulationEligibilityReview,
} from "@/lib/strategy/lead-play-activation";
import type { LeadPlaySimulation } from "@/lib/strategy/lead-play-simulation";

type ReviewAction = "in_review" | "approved" | "rejected";

type ReadyProps = Readonly<{
  state: "ready";
  proposal: LeadPlayProposal;
  simulation: LeadPlaySimulation | null;
  simulationEligibility: LeadPlaySimulationEligibilityReview | null;
  activation: LeadPlayActivationState;
  onReview?: (action: ReviewAction, proposal: LeadPlayProposal) => void;
  onActivate?: (proposal: LeadPlayProposal, activation: LeadPlayActivationState) => void;
  onRollback?: (proposal: LeadPlayProposal, activation: LeadPlayActivationState) => void;
}>;

export type LeadPlayPanelProps =
  | Readonly<{ state: "loading"; error?: never; proposal?: never; simulation?: never; simulationEligibility?: never; activation?: never }>
  | Readonly<{ state: "error"; error: string; proposal?: never; simulation?: never; simulationEligibility?: never; activation?: never }>
  | ReadyProps;

const REVIEW_LABEL: Record<LeadPlayReviewStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

function sameScope(
  left: Readonly<{ tenantId: string; workspaceId: string | null }>,
  right: Readonly<{ tenantId: string; workspaceId: string | null }>,
): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function bindingMatchesProposal(binding: LeadPlayActivationBinding, proposal: LeadPlayProposal): boolean {
  return binding.versionId === proposal.versionId
    && binding.contentHash === proposal.contentHash
    && binding.reviewHash === proposal.review.reviewHash
    && binding.revision === proposal.revision
    && binding.supersedesVersionId === proposal.supersedesVersionId;
}

function exactReview(proposal: LeadPlayProposal): boolean {
  const review = proposal.review;
  return sameScope(proposal, review)
    && review.versionId === proposal.versionId
    && review.contentHash === proposal.contentHash
    && review.stableKey === proposal.stableKey
    && review.revision === proposal.revision
    && review.supersedesVersionId === proposal.supersedesVersionId
    && review.icpVersionId === proposal.icp.versionId
    && review.icpContentHash === proposal.icp.contentHash
    && review.icpReviewHash === proposal.icp.reviewHash
    && review.icpAuthorityHash === proposal.icp.authorityHash
    && review.understandingVersionId === proposal.icp.understandingVersionId
    && review.understandingContentHash === proposal.icp.understandingContentHash
    && review.understandingClaimSetHash === proposal.icp.understandingClaimSetHash
    && review.understandingReviewHash === proposal.icp.understandingReviewHash;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ReadyLeadPlayPanel({
  proposal,
  simulation,
  simulationEligibility,
  activation,
  onReview,
  onActivate,
  onRollback,
}: ReadyProps) {
  const reviewIsExact = exactReview(proposal);
  const activationScopeIsExact = sameScope(proposal, activation) && activation.stableKey === proposal.stableKey;
  const simulationIsExact = simulation !== null
    && sameScope(proposal, simulation)
    && simulation.playVersionId === proposal.versionId
    && simulation.playContentHash === proposal.contentHash
    && simulation.playReviewHash === proposal.review.reviewHash;
  const simulationIsReady = simulationIsExact
    && simulation.summary.total > 0
    && simulation.summary.included === simulation.summary.total
    && simulation.summary.excluded === 0
    && simulation.summary.needsReview === 0;
  const eligibilityIsExact = simulation !== null
    && simulationEligibility !== null
    && simulationEligibility.decision === "eligible"
    && sameScope(proposal, simulationEligibility)
    && simulationEligibility.playVersionId === proposal.versionId
    && simulationEligibility.playContentHash === proposal.contentHash
    && simulationEligibility.playReviewHash === proposal.review.reviewHash
    && simulationEligibility.simulationId === simulation.simulationId
    && simulationEligibility.simulationHash === simulation.simulationHash;
  const activeMatches = activation.active !== null
    && bindingMatchesProposal(activation.active, proposal)
    && simulation !== null
    && simulationEligibility !== null
    && activation.active.simulationId === simulation.simulationId
    && activation.active.simulationHash === simulation.simulationHash
    && activation.active.simulationEligibilityHash === simulationEligibility.eligibilityHash;
  const inactiveMatch = activation.inactive.find((binding) => bindingMatchesProposal(binding, proposal));
  const canActivateLineage = activation.active === null
    ? proposal.revision === 1 && proposal.supersedesVersionId === null
    : proposal.revision === activation.active.revision + 1
      && proposal.supersedesVersionId === activation.active.versionId
      && inactiveMatch === undefined;
  const canActivate = reviewIsExact
    && proposal.review.status === "approved"
    && activationScopeIsExact
    && simulationIsReady
    && eligibilityIsExact
    && !activeMatches
    && canActivateLineage;
  const canRollback = reviewIsExact
    && proposal.review.status === "approved"
    && activationScopeIsExact
    && simulationIsReady
    && eligibilityIsExact
    && activation.active !== null
    && inactiveMatch !== undefined
    && inactiveMatch.revision < activation.active.revision
    && inactiveMatch.simulationId === simulation?.simulationId
    && inactiveMatch.simulationHash === simulation?.simulationHash
    && inactiveMatch.simulationEligibilityHash === simulationEligibility?.eligibilityHash;
  const bindingsAreExact = reviewIsExact && activationScopeIsExact
    && (simulation === null || simulationIsExact)
    && (simulationEligibility === null || eligibilityIsExact);
  const reviewAction: ReviewAction | null = reviewIsExact
    ? proposal.review.status === "draft" ? "in_review"
      : proposal.review.status === "in_review" ? "approved" : null
    : null;
  const hasActions = Boolean(
    (onReview && (reviewAction || (reviewIsExact && proposal.review.status === "in_review")))
      || (onActivate && canActivate)
      || (onRollback && canRollback),
  );
  const excludedAccounts = simulation?.accounts.filter((account) => account.disposition === "excluded") ?? [];
  const reviewAccounts = simulation?.accounts.filter((account) => account.disposition === "needs_review") ?? [];

  return (
    <section
      className="space-y-5"
      data-surface="lead-play-panel"
      data-review-status={proposal.review.status}
      data-activation-status={activeMatches ? "active" : canRollback ? "rollback_available" : canActivate ? "activation_ready" : "blocked"}
      aria-labelledby="lead-play-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Lead play · Versioned human checkpoint</p>
            <h2 id="lead-play-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {proposal.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {proposal.objective}
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Lead play status">
            <Status label="Revision" value={`v${proposal.revision}`} state="STATE-READY" />
            <Status label="Review" value={REVIEW_LABEL[proposal.review.status]} state={proposal.review.status === "approved" ? "STATE-READY" : "STATE-UNKNOWN"} />
            <Status label="Runtime" value={activeMatches ? "Active" : "Inactive"} state={activeMatches ? "STATE-READY" : "STATE-BLOCKED"} />
          </div>
        </div>
        <p className="mt-4 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
          Exact version: {proposal.versionId}
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Approval records review only. Activation remains a separate, explicit human action.
        </p>
      </header>

      {!bindingsAreExact ? (
        <div role="alert" className="rounded-xl border p-4 text-sm" data-state="STATE-BLOCKED" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
          One or more exact version bindings do not match. Any action that depends on a mismatched binding is blocked.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-motion-title">
            <p className="section-label">Approved operating intent</p>
            <h3 id="lead-play-motion-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Motion and search hypotheses</h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.motion}</p>
            <ul className="mt-4 space-y-3">
              {proposal.searchHypotheses.map((hypothesis) => (
                <li key={hypothesis.hypothesisId} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{hypothesis.statement}</p>
                    <code className="break-all text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{hypothesis.queryFamily}</code>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{hypothesis.rationale}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>{hypothesis.rationaleRefs.length} evidence reference{hypothesis.rationaleRefs.length === 1 ? "" : "s"}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-evidence-title">
            <p className="section-label">Evidence and uncertainty</p>
            <h3 id="lead-play-evidence-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Bound rationale</h3>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Lead play evidence references">
              {proposal.rationaleRefs.map((reference) => (
                <li key={`${reference.claimId}:${reference.evidenceId}`}>
                  <code className="block max-w-full break-all rounded-lg border px-2 py-1 text-[0.68rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
                    {reference.claimId} → {reference.evidenceId}
                  </code>
                </li>
              ))}
            </ul>
            {proposal.uncertainties.length > 0 ? (
              <ul className="mt-4 space-y-2" aria-label="Lead play uncertainties">
                {proposal.uncertainties.map((uncertainty) => (
                  <li key={uncertainty.uncertaintyId} className="rounded-xl border p-3" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--warning-text)" }}>{uncertainty.statement}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{uncertainty.impact}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No unresolved uncertainties are recorded.</p>}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-history-title">
            <p className="section-label">Human and runtime audit</p>
            <h3 id="lead-play-history-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Review and activation chronology</h3>
            {proposal.review.events.length + activation.events.length > 0 ? (
              <ol className="mt-4 space-y-3" aria-label="Lead play chronology">
                {proposal.review.events.map((event, index) => (
                  <li key={`review:${index}:${event.at}`} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Review: {REVIEW_LABEL[event.from]} → {REVIEW_LABEL[event.to]}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                    <AuditActor actorId={event.actor.actorId} at={event.at} />
                  </li>
                ))}
                {activation.events.map((event) => (
                  <li key={`activation:${event.sequence}`} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{event.action === "activate" ? "Activated" : "Rolled back"} to revision {event.to.revision}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                    <AuditActor actorId={event.actor.actorId} at={event.at} />
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 text-sm" data-state="STATE-UNKNOWN" style={{ color: "var(--text-secondary)" }}>No review or activation event has been recorded.</p>}
          </section>
        </div>

        <aside className="space-y-5" aria-label="Lead play constraints and simulation">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-policy-title">
            <p className="section-label">Hard policy bounds</p>
            <h3 id="lead-play-policy-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Budgets and safeguards</h3>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Accounts" value={proposal.bounds.maxAccounts.toLocaleString("en-US")} />
              <Metric label="Provider requests" value={proposal.bounds.maxProviderRequests.toLocaleString("en-US")} />
              <Metric label="Spend ceiling" value={`$${(proposal.bounds.maxSpendCents / 100).toFixed(2)}`} />
              <Metric label="Outreach" value="Draft only" />
            </dl>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Allowed sources</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {proposal.sourceAllowlist.map((source) => <li key={source}><code className="rounded-lg border px-2 py-1 text-[0.68rem]" style={{ borderColor: "var(--surface-card-border)" }}>{source}</code></li>)}
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-simulation-title">
            <p className="section-label">Advisory dry run</p>
            <h3 id="lead-play-simulation-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Simulation and exclusions</h3>
            {simulation ? (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Metric label="Included" value={`${simulation.summary.included}/${simulation.summary.total}`} />
                  <Metric label="Excluded" value={String(simulation.summary.excluded)} />
                  <Metric label="Needs review" value={String(simulation.summary.needsReview)} />
                  <Metric label="Estimated spend" value={`$${(simulation.summary.spendCents / 100).toFixed(2)}`} />
                </dl>
                {excludedAccounts.length + reviewAccounts.length > 0 ? (
                  <ul className="mt-3 space-y-2" aria-label="Simulation exclusions and review accounts">
                    {[...excludedAccounts, ...reviewAccounts].map((account) => (
                      <li key={account.accountId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>
                        <code className="min-w-0 break-all">{account.accountId}</code>
                        <span className="shrink-0 font-semibold" style={{ color: account.disposition === "excluded" ? "var(--danger-text)" : "var(--warning-text)" }}>{account.disposition === "excluded" ? "Excluded" : "Needs review"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-xs" style={{ color: "var(--success-text)" }}>No accounts are excluded or awaiting review.</p>}
                <p className="mt-3 text-xs font-semibold" data-state={simulationIsReady && eligibilityIsExact ? "STATE-READY" : "STATE-BLOCKED"} style={{ color: simulationIsReady && eligibilityIsExact ? "var(--success-text)" : "var(--danger-text)" }}>
                  {simulationIsReady && eligibilityIsExact ? "Human-reviewed simulation is activation eligible." : "Simulation is not eligible for activation."}
                </p>
              </>
            ) : <p className="mt-4 rounded-xl border p-3 text-sm" data-state="STATE-UNKNOWN" style={{ borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>No simulation is attached. Activation remains blocked.</p>}
          </section>
        </aside>
      </div>

      {hasActions ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="lead-play-actions-title">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 id="lead-play-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Human decision</h3>
              <p id="lead-play-actions-help" className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Approval records review only. Activation and rollback are separate, explicit requests against this exact version and state.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
              {onReview && reviewAction ? <ActionButton primary action={() => onReview(reviewAction, proposal)}>{reviewAction === "in_review" ? "Submit for review" : "Approve exact version"}</ActionButton> : null}
              {onReview && reviewIsExact && proposal.review.status === "in_review" ? <ActionButton action={() => onReview("rejected", proposal)}>Reject exact version</ActionButton> : null}
              {onActivate && canActivate ? <ActionButton primary action={() => onActivate(proposal, activation)}>Activate exact version</ActionButton> : null}
              {onRollback && canRollback ? <ActionButton action={() => onRollback(proposal, activation)}>Roll back to revision {proposal.revision}</ActionButton> : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function Status({ label, value, state }: Readonly<{ label: string; value: string; state: string }>) {
  return <div className="rounded-xl border px-3 py-2" data-state={state} style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}><p className="text-[0.65rem] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p><p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p></div>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className="rounded-lg border p-2" style={{ borderColor: "var(--surface-card-border)" }}><dt style={{ color: "var(--text-tertiary)" }}>{label}</dt><dd className="mt-1 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</dd></div>;
}

function AuditActor({ actorId, at }: Readonly<{ actorId: string; at: string }>) {
  return <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>{actorId} · <time dateTime={at}>{formatTimestamp(at)} UTC</time></p>;
}

function ActionButton({ primary = false, action, children }: Readonly<{ primary?: boolean; action: () => void; children: React.ReactNode }>) {
  return <button type="button" className={`${primary ? "btn-primary" : "btn-glass"} min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`} aria-describedby="lead-play-actions-help" onClick={action}>{children}</button>;
}

export function LeadPlayPanel(props: LeadPlayPanelProps) {
  if (props.state === "loading") return <AsyncState variant="loading" title="Loading lead play" description="Retrieving the exact proposal, simulation, review, and activation history." />;
  if (props.state === "error") return <AsyncState variant="error" title="Lead play unavailable" description={props.error} />;
  return <ReadyLeadPlayPanel {...props} />;
}
