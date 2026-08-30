"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type DiscoveryPlanSummary = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  planId: string;
  status: "plan_only" | "superseded";
  reviewStatus: "draft" | "in_review" | "approved" | "rejected" | "superseded";
  binding: Readonly<{
    playStableKey: string;
    playVersionId: string;
    playRevision: number;
    sourceKeys: readonly string[];
  }>;
  caps: Readonly<{
    maxAccounts: number;
    maxProviderRequests: number;
    maxSpendCents: number;
  }>;
  freshness: Readonly<{
    state: "current" | "stale";
    asOf: string;
  }>;
  readiness: Readonly<{
    review: "ready" | "blocked" | "not_required";
    run: "ready" | "blocked";
  }>;
  allowedActions: Readonly<{
    open: boolean;
    review: boolean;
    run: boolean;
  }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  plans: readonly DiscoveryPlanSummary[];
  onOpen?: (plan: DiscoveryPlanSummary) => void;
  onReview?: (plan: DiscoveryPlanSummary) => void;
  onRun?: (plan: DiscoveryPlanSummary) => void;
  error?: never;
}>;

export type DiscoveryPlansPanelProps =
  | Readonly<{ state: "loading"; scope?: never; plans?: never; error?: never; onOpen?: never; onReview?: never; onRun?: never }>
  | Readonly<{ state: "error"; scope?: never; plans?: never; error: string; onOpen?: never; onReview?: never; onRun?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, CSSProperties> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

const REVIEW = {
  draft: { label: "Review draft", symbol: "·", tone: "neutral" },
  in_review: { label: "In review", symbol: "?", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
  superseded: { label: "Review superseded", symbol: "↗", tone: "neutral" },
} as const;

function formatSpend(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTimestamp(timestamp: string): string {
  const epoch = Date.parse(timestamp);
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
      <span aria-hidden="true">{symbol}</span>{label}
    </span>
  );
}

function Scope({ tenantId, workspaceId }: Readonly<{ tenantId: string; workspaceId: string | null }>) {
  return (
    <dl className="grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2" aria-label="Exact discovery-plan portfolio scope" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
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

function Cap({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</dd>
    </div>
  );
}

function Readiness({ plan }: Readonly<{ plan: DiscoveryPlanSummary }>) {
  const reviewTone: Tone = plan.readiness.review === "ready" ? "warning" : plan.readiness.review === "blocked" ? "danger" : "neutral";
  const runTone: Tone = plan.readiness.run === "ready" ? "success" : "danger";
  const reviewLabel = plan.readiness.review === "ready" ? "Ready for review" : plan.readiness.review === "blocked" ? "Review blocked" : "Review not required";
  const runLabel = plan.readiness.run === "ready" ? "Ready for bounded run" : "Run blocked";

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Canonical review and run readiness">
      <div className="rounded-lg border p-3" data-review-readiness={plan.readiness.review} style={TONE_STYLE[reviewTone]}>
        <p className="section-label">Review readiness</p>
        <p className="mt-1 text-sm font-semibold">{reviewLabel}</p>
      </div>
      <div className="rounded-lg border p-3" data-run-readiness={plan.readiness.run} style={TONE_STYLE[runTone]}>
        <p className="section-label">Run readiness</p>
        <p className="mt-1 text-sm font-semibold">{runLabel}</p>
      </div>
    </div>
  );
}

function PlanCard({ plan, onOpen, onReview, onRun }: Readonly<{
  plan: DiscoveryPlanSummary;
  onOpen?: (plan: DiscoveryPlanSummary) => void;
  onReview?: (plan: DiscoveryPlanSummary) => void;
  onRun?: (plan: DiscoveryPlanSummary) => void;
}>) {
  const review = REVIEW[plan.reviewStatus];
  const canOpen = plan.allowedActions.open && Boolean(onOpen);
  const canReview = plan.allowedActions.review && plan.readiness.review === "ready" && Boolean(onReview);
  const canRun = plan.allowedActions.run && plan.status === "plan_only" && plan.reviewStatus === "approved"
    && plan.freshness.state === "current" && plan.readiness.run === "ready" && Boolean(onRun);
  const titleId = `discovery-plan-summary-${plan.planId.replace(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <li className="min-w-0">
      <article className="glass flex h-full min-w-0 flex-col rounded-2xl p-4 sm:p-5" data-plan-status={plan.status} aria-labelledby={titleId}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Discovery plan · {plan.status === "plan_only" ? "Plan only" : "Superseded"}</p>
            <h3 id={titleId} className="mt-1 break-all font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{plan.planId}</h3>
          </div>
          <Badge label={review.label} symbol={review.symbol} tone={review.tone} />
        </header>

        <section className="mt-4 rounded-xl border p-3" aria-label="Canonical lead-play and source binding" style={{ borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Canonical binding</p>
          <dl className="mt-2 space-y-2 text-xs">
            <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Play </dt><dd className="inline break-all font-mono" style={{ color: "var(--text-secondary)" }}>{plan.binding.playStableKey}</dd></div>
            <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Version </dt><dd className="inline break-all font-mono" style={{ color: "var(--text-secondary)" }}>{plan.binding.playVersionId} · revision {plan.binding.playRevision}</dd></div>
            <div><dt className="inline font-semibold" style={{ color: "var(--text-primary)" }}>Sources </dt><dd className="inline" style={{ color: "var(--text-secondary)" }}>{plan.binding.sourceKeys.join(", ") || "No source binding"}</dd></div>
          </dl>
        </section>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Bounded plan caps">
          <Cap label="Accounts" value={plan.caps.maxAccounts.toLocaleString("en-US")} />
          <Cap label="Provider requests" value={plan.caps.maxProviderRequests.toLocaleString("en-US")} />
          <Cap label="Spend" value={formatSpend(plan.caps.maxSpendCents)} />
        </dl>

        <section className="mt-4 rounded-xl border p-3" data-freshness={plan.freshness.state} style={TONE_STYLE[plan.freshness.state === "current" ? "success" : "warning"]}>
          <p className="section-label">Plan freshness</p>
          <p className="mt-1 text-sm font-semibold">{plan.freshness.state === "current" ? "Current snapshot" : "Stale snapshot"}</p>
          <p className="mt-1 text-xs">As of <time dateTime={plan.freshness.asOf}>{formatTimestamp(plan.freshness.asOf)} UTC</time></p>
        </section>

        <div className="mt-4"><Readiness plan={plan} /></div>

        {canOpen || canReview || canRun ? (
          <footer className="mt-auto flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:justify-end" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-discovery-plans-action="open" onClick={() => onOpen?.(plan)}>Open exact plan</button> : null}
            {canReview ? <button type="button" className="btn-secondary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-discovery-plans-action="review" onClick={() => onReview?.(plan)}>Review exact plan</button> : null}
            {canRun ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-discovery-plans-action="run" onClick={() => onRun?.(plan)}>Create bounded run</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function DiscoveryPlansPanel(props: DiscoveryPlansPanelProps) {
  if (props.state === "loading") {
    return <div data-discovery-plans-state="loading"><AsyncState variant="loading" title="Loading discovery plans" description="Retrieving canonical plan bindings, approval, freshness, and caps." /></div>;
  }
  if (props.state === "error") {
    return <div data-discovery-plans-state="error"><AsyncState variant="error" title="Discovery plans unavailable" description={props.error} /></div>;
  }
  if (props.plans.length === 0) {
    return <div data-discovery-plans-state="empty"><AsyncState variant="empty" title="No discovery plans yet" description="An approved active lead play can produce a bounded plan for review here." /></div>;
  }
  if (props.plans.some((plan) => plan.tenantId !== props.scope.tenantId || plan.workspaceId !== props.scope.workspaceId)) {
    return <div data-discovery-plans-state="error"><AsyncState variant="error" title="Discovery plans unavailable" description="The discovery-plan portfolio scope could not be verified." /></div>;
  }

  const readyCount = props.plans.filter((plan) => plan.readiness.run === "ready").length;
  const reviewCount = props.plans.filter((plan) => plan.readiness.review === "ready").length;
  return (
    <section className="space-y-4" data-surface="discovery-plans-panel" data-discovery-plans-state="ready" aria-labelledby="discovery-plans-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Discovery · Governed plan portfolio</p>
            <h2 id="discovery-plans-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Discovery plans</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Review exact play and source bindings, bounded caps, freshness, approval, and canonical readiness before opening a plan or creating a run.</p>
          </div>
          <p className="shrink-0 text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>{props.plans.length} {props.plans.length === 1 ? "plan" : "plans"} · {reviewCount} to review · {readyCount} run ready</p>
        </div>
        <div className="mt-4"><Scope tenantId={props.scope.tenantId} workspaceId={props.scope.workspaceId} /></div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical discovery plans">
        {props.plans.map((plan) => <PlanCard key={plan.planId} plan={plan} onOpen={props.onOpen} onReview={props.onReview} onRun={props.onRun} />)}
      </ul>
    </section>
  );
}
