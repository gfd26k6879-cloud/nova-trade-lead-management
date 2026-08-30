"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";
import type { BuyingCenterReview } from "@/lib/contacts/buying-center";

export type BuyingCenterPortfolioFreshness = "current" | "stale" | "unknown";
export type BuyingCenterPortfolioUncertainty = "none" | "low" | "high";

export type BuyingCenterPortfolioItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  mapVersionId: string;
  roleCoverage: Readonly<{
    covered: number;
    expected: number;
  }>;
  people: Readonly<{
    verified: number;
    hypotheses: number;
  }>;
  evidence: Readonly<{
    freshness: BuyingCenterPortfolioFreshness;
    latestObservedAt: string | null;
    uncertainty: BuyingCenterPortfolioUncertainty;
  }>;
  review: Readonly<{
    status: BuyingCenterReview["status"];
    needed: boolean;
  }>;
  actions: Readonly<{
    open: "available" | "blocked";
    review: "available" | "blocked";
  }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  accounts: readonly BuyingCenterPortfolioItem[];
  onOpen?: (account: BuyingCenterPortfolioItem) => void;
  onRequestReview?: (account: BuyingCenterPortfolioItem) => void;
  error?: never;
}>;

export type BuyingCenterPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; accounts?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; accounts?: never }>
  | Readonly<{ state: "empty"; scope?: never; accounts?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
});

const FRESHNESS_META: Readonly<Record<BuyingCenterPortfolioFreshness, Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
}>>> = Object.freeze({
  current: { label: "Current", symbol: "✓", tone: "success" },
  stale: { label: "Stale", symbol: "!", tone: "danger" },
  unknown: { label: "Unknown", symbol: "?", tone: "warning" },
});

const UNCERTAINTY_META: Readonly<Record<BuyingCenterPortfolioUncertainty, Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
}>>> = Object.freeze({
  none: { label: "No stated uncertainty", symbol: "✓", tone: "success" },
  low: { label: "Low uncertainty", symbol: "?", tone: "warning" },
  high: { label: "High uncertainty", symbol: "!", tone: "danger" },
});

const REVIEW_META: Readonly<Record<BuyingCenterReview["status"], Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
}>>> = Object.freeze({
  draft: { label: "Draft", symbol: "○", tone: "warning" },
  in_review: { label: "In review", symbol: "…", tone: "warning" },
  approved: { label: "Reviewed", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
});

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
    return <AsyncState variant="loading" title="Loading buying-center portfolio" description="Retrieving canonical account and buying-center summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Buying-center portfolio unavailable" description={error ?? "The buying-center portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No buying-center maps yet" description="Canonical account buying-center summaries will appear here when they are available." />;
}

function AccountCard({ account, headingId, onOpen, onRequestReview }: Readonly<{
  account: BuyingCenterPortfolioItem;
  headingId: string;
  onOpen?: (account: BuyingCenterPortfolioItem) => void;
  onRequestReview?: (account: BuyingCenterPortfolioItem) => void;
}>) {
  const freshness = FRESHNESS_META[account.evidence.freshness];
  const uncertainty = UNCERTAINTY_META[account.evidence.uncertainty];
  const review = REVIEW_META[account.review.status];
  const canOpen = account.actions.open === "available" && Boolean(onOpen);
  const canReview = account.actions.review === "available" && account.review.needed && Boolean(onRequestReview);

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-review-needed={account.review.needed}>
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Canonical account</p>
            <h3 id={headingId} className="mt-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {account.accountName}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>{account.accountId}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {account.review.needed ? <Badge label="Review needed" symbol="!" tone="warning" /> : null}
            <Badge label={review.label} symbol={review.symbol} tone={review.tone} />
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Role coverage</dt>
            <dd className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {account.roleCoverage.covered} of {account.roleCoverage.expected}
            </dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>roles represented</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>People and hypotheses</dt>
            <dd className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {account.people.verified} human-verified {account.people.verified === 1 ? "person" : "people"}
            </dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--warning-text)" }}>
              {account.people.hypotheses} role {account.people.hypotheses === 1 ? "hypothesis" : "hypotheses"}
            </dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Evidence freshness</dt>
            <dd className="mt-2"><Badge label={freshness.label} symbol={freshness.symbol} tone={freshness.tone} /></dd>
            <dd className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {account.evidence.latestObservedAt ? (
                <>Latest evidence <time dateTime={account.evidence.latestObservedAt}>{formatTimestamp(account.evidence.latestObservedAt)} UTC</time></>
              ) : "No observation time supplied"}
            </dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Uncertainty</dt>
            <dd className="mt-2"><Badge label={uncertainty.label} symbol={uncertainty.symbol} tone={uncertainty.tone} /></dd>
          </div>
        </dl>

        <p className="mt-3 break-all text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Map version {account.mapVersionId}
        </p>

        {canOpen || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(account)}>
                Open buying center
              </button>
            ) : null}
            {canReview ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onRequestReview?.(account)}>
                Review buying center
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function BuyingCenterPortfolioPanel(props: BuyingCenterPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty" || props.accounts.length === 0) return <PortfolioState state="empty" />;
  if (props.accounts.some((account) => account.tenantId !== props.scope.tenantId || account.workspaceId !== props.scope.workspaceId)) {
    return <PortfolioState state="error" error="The buying-center portfolio scope could not be verified." />;
  }

  const reviewCount = props.accounts.filter((account) => account.review.needed).length;

  return (
    <section className="space-y-4" data-surface="buying-center-portfolio-panel" aria-labelledby="buying-center-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Buying centers · Account overview</p>
            <h2 id="buying-center-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Buying-center portfolio
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Supplied role coverage, verified people, hypotheses, evidence state, and review needs across canonical accounts.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.accounts.length} {props.accounts.length === 1 ? "account" : "accounts"} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"} needed
          </p>
        </div>

        <details className="mt-4 rounded-xl border" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Exact portfolio scope</summary>
          <dl className="grid gap-3 border-t px-3 py-3 sm:grid-cols-2" style={{ borderColor: "var(--surface-card-border)" }}>
            <div className="min-w-0">
              <dt className="section-label">Tenant</dt>
              <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{props.scope.tenantId}</dd>
            </div>
            <div className="min-w-0">
              <dt className="section-label">Workspace</dt>
              <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{props.scope.workspaceId}</dd>
            </div>
          </dl>
        </details>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Buying-center account portfolio">
        {props.accounts.map((account, index) => (
          <AccountCard
            key={`${account.tenantId}:${account.workspaceId}:${account.accountId}:${account.mapVersionId}`}
            account={account}
            headingId={`buying-center-portfolio-account-${index}`}
            onOpen={props.onOpen}
            onRequestReview={props.onRequestReview}
          />
        ))}
      </ul>
    </section>
  );
}
