"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type StrategyPortfolioLifecycle = "draft" | "active" | "inactive" | "superseded";
export type StrategyPortfolioReviewStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";
export type StrategyPortfolioEvidenceReadiness = "ready" | "needs_review" | "blocked";

export type StrategyPortfolioBudgetPolicy = Readonly<{
  maxAccounts: number;
  maxProviderRequests: number;
  maxSpendCents: number;
  outreachMode: "draft_only";
}>;

export type StrategyPortfolioActionAvailability = Readonly<{
  open: boolean;
  review: boolean;
  rollback: boolean;
}>;

type StrategyPortfolioSummaryBase = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  stableKey: string;
  versionId: string;
  revision: number;
  title: string;
  lifecycle: StrategyPortfolioLifecycle;
  reviewStatus: StrategyPortfolioReviewStatus;
  evidenceReadiness: StrategyPortfolioEvidenceReadiness;
  exclusionCount: number;
  actions: StrategyPortfolioActionAvailability;
  rollbackTargetVersionId: string | null;
}>;

export type IcpPortfolioSummary = StrategyPortfolioSummaryBase & Readonly<{
  kind: "icp";
  budgetPolicy: null;
}>;

export type LeadPlayPortfolioSummary = StrategyPortfolioSummaryBase & Readonly<{
  kind: "lead_play";
  budgetPolicy: StrategyPortfolioBudgetPolicy;
}>;

export type StrategyPortfolioSummary = IcpPortfolioSummary | LeadPlayPortfolioSummary;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  versions: readonly StrategyPortfolioSummary[];
  onOpen?: (summary: StrategyPortfolioSummary) => void;
  onReview?: (summary: StrategyPortfolioSummary) => void;
  onRollback?: (summary: StrategyPortfolioSummary) => void;
  error?: never;
}>;

export type StrategyPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; versions?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; versions?: never }>
  | Readonly<{ state: "empty"; scope?: never; versions?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, CSSProperties> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

const LIFECYCLE_META: Record<StrategyPortfolioLifecycle, Readonly<{ label: string; symbol: string; tone: Tone }>> = {
  draft: { label: "Draft", symbol: "·", tone: "neutral" },
  active: { label: "Active", symbol: "✓", tone: "success" },
  inactive: { label: "Inactive", symbol: "—", tone: "neutral" },
  superseded: { label: "Superseded", symbol: "↗", tone: "neutral" },
};

const REVIEW_META: Record<StrategyPortfolioReviewStatus, Readonly<{ label: string; symbol: string; tone: Tone }>> = {
  draft: { label: "Review draft", symbol: "·", tone: "neutral" },
  in_review: { label: "In review", symbol: "?", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
  superseded: { label: "Review superseded", symbol: "↗", tone: "neutral" },
};

const EVIDENCE_META: Record<StrategyPortfolioEvidenceReadiness, Readonly<{ label: string; symbol: string; tone: Tone }>> = {
  ready: { label: "Evidence ready", symbol: "✓", tone: "success" },
  needs_review: { label: "Evidence needs review", symbol: "?", tone: "warning" },
  blocked: { label: "Evidence blocked", symbol: "×", tone: "danger" },
};

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
    return <AsyncState variant="loading" title="Loading strategy portfolio" description="Retrieving canonical ICP and lead-play version summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Strategy portfolio unavailable" description={error ?? "The strategy portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No strategy versions yet" description="Create an ICP proposal to begin the governed strategy workflow." />;
}

function Scope({ tenantId, workspaceId }: Readonly<{ tenantId: string; workspaceId: string | null }>) {
  return (
    <dl className="grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
      <div className="min-w-0">
        <dt className="section-label">Tenant</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{tenantId}</dd>
      </div>
      <div className="min-w-0">
        <dt className="section-label">Workspace</dt>
        <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{workspaceId ?? "Tenant-wide (null)"}</dd>
      </div>
    </dl>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</dd>
    </div>
  );
}

function VersionCard({ summary, onOpen, onReview, onRollback }: Readonly<{
  summary: StrategyPortfolioSummary;
  onOpen?: (summary: StrategyPortfolioSummary) => void;
  onReview?: (summary: StrategyPortfolioSummary) => void;
  onRollback?: (summary: StrategyPortfolioSummary) => void;
}>) {
  const lifecycle = LIFECYCLE_META[summary.lifecycle];
  const review = REVIEW_META[summary.reviewStatus];
  const evidence = EVIDENCE_META[summary.evidenceReadiness];
  const canOpen = summary.actions.open && Boolean(onOpen);
  const canReview = summary.actions.review && Boolean(onReview);
  const rollbackAvailable = summary.actions.rollback && summary.rollbackTargetVersionId !== null;
  const canRollback = rollbackAvailable && Boolean(onRollback);

  return (
    <li
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-version-kind={summary.kind}
      data-lifecycle={summary.lifecycle}
      data-review-available={summary.actions.review ? "true" : "false"}
      data-rollback-available={rollbackAvailable ? "true" : "false"}
    >
      <article aria-labelledby={`strategy-version-${summary.versionId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">{summary.kind === "icp" ? "ICP version" : "Lead-play version"} · Revision {summary.revision}</p>
            <h3 id={`strategy-version-${summary.versionId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`} className="mt-1 text-base font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {summary.title}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{summary.stableKey}</p>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{summary.versionId}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
            <Badge {...lifecycle} />
            <Badge {...review} />
            <Badge {...evidence} />
          </div>
        </header>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]">
          <div className="space-y-3">
            <Scope tenantId={summary.tenantId} workspaceId={summary.workspaceId} />
            <dl className="grid grid-cols-2 gap-2">
              <Metric label="Exclusions" value={summary.exclusionCount.toLocaleString("en-US")} />
              <Metric label="Review action" value={summary.actions.review ? "Available" : "Unavailable"} />
            </dl>
          </div>

          <section className="rounded-xl border p-3" aria-label={`${summary.title} budget and rollback policy`} style={{ borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Budget policy</p>
            {summary.budgetPolicy ? (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Metric label="Accounts" value={summary.budgetPolicy.maxAccounts.toLocaleString("en-US")} />
                <Metric label="Requests" value={summary.budgetPolicy.maxProviderRequests.toLocaleString("en-US")} />
                <Metric label="Spend cap" value={`$${(summary.budgetPolicy.maxSpendCents / 100).toFixed(2)}`} />
                <Metric label="Outreach" value="Draft only" />
              </dl>
            ) : (
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>Not applicable to ICP definitions.</p>
            )}
            <p className="mt-3 text-xs font-semibold" data-state={rollbackAvailable ? "STATE-READY" : "STATE-UNKNOWN"} style={{ color: rollbackAvailable ? "var(--success-text)" : "var(--text-secondary)" }}>
              Rollback {rollbackAvailable ? "available" : "unavailable"}
            </p>
            {summary.rollbackTargetVersionId ? (
              <p className="mt-1 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Target: {summary.rollbackTargetVersionId}</p>
            ) : null}
          </section>
        </div>

        {canOpen || canReview || canRollback ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(summary)}>Open exact version</button> : null}
            {canReview ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onReview?.(summary)}>Review exact version</button> : null}
            {canRollback ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onRollback?.(summary)}>Request rollback</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function StrategyPortfolioPanel(props: StrategyPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty" || props.versions.length === 0) return <PortfolioState state="empty" />;
  if (props.versions.some((summary) => summary.tenantId !== props.scope.tenantId || summary.workspaceId !== props.scope.workspaceId)) {
    return <PortfolioState state="error" error="The strategy portfolio scope could not be verified." />;
  }

  const activeCount = props.versions.filter((summary) => summary.lifecycle === "active").length;
  const reviewCount = props.versions.filter((summary) => summary.actions.review).length;

  return (
    <section className="space-y-4" data-surface="strategy-portfolio-panel" aria-labelledby="strategy-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Strategy · Governed version portfolio</p>
            <h2 id="strategy-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>ICP and lead plays</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical version status, evidence readiness, exclusions, policy bounds, and supplied human actions in one scoped view.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.versions.length} {props.versions.length === 1 ? "version" : "versions"} · {activeCount} active · {reviewCount} review {reviewCount === 1 ? "action" : "actions"}
          </p>
        </div>
        <div className="mt-4"><Scope tenantId={props.scope.tenantId} workspaceId={props.scope.workspaceId} /></div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical strategy versions">
        {props.versions.map((summary) => (
          <VersionCard key={`${summary.kind}:${summary.versionId}`} summary={summary} onOpen={props.onOpen} onReview={props.onReview} onRollback={props.onRollback} />
        ))}
      </ul>
    </section>
  );
}
