"use client";

import { AsyncState } from "@/components/async-state";

export type AccountPortfolioStatus = "active" | "merged";
export type AccountPortfolioFreshness = "current" | "stale" | "unknown";
export type AccountPortfolioDecision = "qualified" | "needs_review" | "unqualified";
export type AccountPortfolioUncertainty = "none" | "low" | "high";

export type AccountQualificationSummary = Readonly<{
  versionId: string;
  weightedScore: number;
  decision: AccountPortfolioDecision;
  uncertainty: AccountPortfolioUncertainty;
  reviewStatus: "unreviewed" | "confirmed" | "overridden";
  evaluatedAt: string;
}>;

export type AccountPortfolioItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  displayName: string;
  status: AccountPortfolioStatus;
  updatedAt: string;
  freshness: AccountPortfolioFreshness;
  reviewNeeded: boolean;
  qualification: AccountQualificationSummary | null;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  accounts: readonly AccountPortfolioItem[];
  onSelect?: (account: AccountPortfolioItem) => void;
  onRequestReview?: (account: AccountPortfolioItem) => void;
  error?: never;
}>;

export type AccountPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; accounts?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; accounts?: never }>
  | Readonly<{ state: "empty"; scope?: never; accounts?: never; error?: never }>
  | ReadyProps;

const STATUS_META = {
  active: { label: "Active", symbol: "✓", tone: "success" },
  merged: { label: "Merged", symbol: "↗", tone: "neutral" },
} as const;

const DECISION_META = {
  qualified: { label: "Qualified", symbol: "✓", tone: "success" },
  needs_review: { label: "Needs review", symbol: "?", tone: "warning" },
  unqualified: { label: "Unqualified", symbol: "×", tone: "danger" },
} as const;

const FRESHNESS_META = {
  current: { label: "Current", symbol: "✓", tone: "success" },
  stale: { label: "Stale", symbol: "!", tone: "warning" },
  unknown: { label: "Unknown", symbol: "?", tone: "neutral" },
} as const;

const UNCERTAINTY_LABEL: Record<AccountPortfolioUncertainty, string> = {
  none: "No stated uncertainty",
  low: "Low uncertainty",
  high: "High uncertainty",
};

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  success: {
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
    color: "var(--success-text)",
  },
  warning: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },
  danger: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
    color: "var(--danger-text)",
  },
  neutral: {
    background: "var(--surface-muted)",
    borderColor: "var(--surface-card-border)",
    color: "var(--text-secondary)",
  },
};

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
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
    return <AsyncState variant="loading" title="Loading account portfolio" description="Retrieving canonical account and qualification summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Account portfolio unavailable" description={error ?? "The portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No accounts yet" description="Run an approved discovery workflow to add canonical accounts to this portfolio." />;
}

function AccountCard({ account, onSelect, onRequestReview }: Readonly<{
  account: AccountPortfolioItem;
  onSelect?: (account: AccountPortfolioItem) => void;
  onRequestReview?: (account: AccountPortfolioItem) => void;
}>) {
  const status = STATUS_META[account.status];
  const freshness = FRESHNESS_META[account.freshness];
  const qualification = account.qualification;
  const decision = qualification ? DECISION_META[qualification.decision] : null;
  const canSelect = account.status === "active" && Boolean(onSelect);
  const canReview = account.status === "active" && account.reviewNeeded && Boolean(onRequestReview);

  return (
    <li
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-account-status={account.status}
      data-review-needed={account.reviewNeeded}
    >
      <article aria-labelledby={`portfolio-account-${account.accountId}`}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id={`portfolio-account-${account.accountId}`} className="truncate text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {account.displayName}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>{account.accountId}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {account.reviewNeeded ? <Badge label="Review needed" symbol="!" tone="warning" /> : null}
            <Badge label={status.label} symbol={status.symbol} tone={status.tone} />
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Qualification</dt>
            <dd className="mt-2">
              {decision ? <Badge label={decision.label} symbol={decision.symbol} tone={decision.tone} /> : <Badge label="Not evaluated" symbol="—" tone="neutral" />}
            </dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Score and uncertainty</dt>
            <dd className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {qualification ? `${qualification.weightedScore}/100` : "No score"}
            </dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {qualification ? UNCERTAINTY_LABEL[qualification.uncertainty] : "Uncertainty not assessed"}
            </dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Freshness</dt>
            <dd className="mt-2"><Badge label={freshness.label} symbol={freshness.symbol} tone={freshness.tone} /></dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Updated <time dateTime={account.updatedAt}>{formatTimestamp(account.updatedAt)} UTC</time>
            </dd>
          </div>
        </dl>

        {qualification ? (
          <p className="mt-3 break-all text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Human review: {words(qualification.reviewStatus)} · evaluated <time dateTime={qualification.evaluatedAt}>{formatTimestamp(qualification.evaluatedAt)} UTC</time> · {qualification.versionId}
          </p>
        ) : null}

        {canSelect || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canSelect ? (
              <button
                type="button"
                className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                onClick={() => onSelect?.(account)}
              >
                Open account
              </button>
            ) : null}
            {canReview ? (
              <button
                type="button"
                className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                onClick={() => onRequestReview?.(account)}
              >
                Review qualification
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function AccountPortfolioPanel(props: AccountPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty") return <PortfolioState state="empty" />;
  if (props.accounts.length === 0) return <PortfolioState state="empty" />;
  if (props.accounts.some((account) => (
    account.tenantId !== props.scope.tenantId || account.workspaceId !== props.scope.workspaceId
  ))) {
    return <PortfolioState state="error" error="The account portfolio scope could not be verified." />;
  }

  const reviewCount = props.accounts.filter((account) => account.reviewNeeded).length;

  return (
    <section className="space-y-4" data-surface="account-portfolio-panel" aria-labelledby="account-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Accounts · Qualification overview</p>
            <h2 id="account-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Account portfolio
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical account status, current qualification summary, and freshness in one reviewable list.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.accounts.length} {props.accounts.length === 1 ? "account" : "accounts"} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"} needed
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical account portfolio">
        {props.accounts.map((account) => (
          <AccountCard
            key={`${account.tenantId}:${account.workspaceId}:${account.accountId}`}
            account={account}
            onSelect={props.onSelect}
            onRequestReview={props.onRequestReview}
          />
        ))}
      </ul>
    </section>
  );
}
