"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type ReviewWorkloadKind =
  | "document_extraction"
  | "icp_and_play"
  | "account_and_qualification"
  | "contact_and_buying_center"
  | "outreach"
  | "controlled_learning";

export type ReviewQueueSummary = Readonly<{
  tenantId: string;
  workspaceId: string;
  kind: ReviewWorkloadKind;
  ready: number;
  claimed: number;
  blocked: number;
  overdue: number;
  oldestAgeMinutes: number | null;
  actions: Readonly<{ open: "available" | "blocked" }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  queues: readonly ReviewQueueSummary[];
  onOpenQueue?: (queue: ReviewQueueSummary) => void;
  error?: never;
}>;

export type ReviewOverviewPanelProps =
  | Readonly<{ state: "loading"; scope?: never; queues?: never; onOpenQueue?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; queues?: never; onOpenQueue?: never }>
  | Readonly<{ state: "empty"; scope?: never; queues?: never; onOpenQueue?: never; error?: never }>
  | ReadyProps;

type MetricKey = "ready" | "claimed" | "blocked" | "overdue";
type Tone = "neutral" | "info" | "warning" | "danger";

const QUEUE_META: Readonly<Record<ReviewWorkloadKind, Readonly<{
  label: string;
  description: string;
  symbol: string;
}>>> = Object.freeze({
  document_extraction: {
    label: "Extraction",
    description: "Claims, evidence, citations, and extracted fields",
    symbol: "▤",
  },
  icp_and_play: {
    label: "ICP & play",
    description: "ICP versions, lead plays, and activation decisions",
    symbol: "◇",
  },
  account_and_qualification: {
    label: "Accounts & qualification",
    description: "Account resolution and qualification judgments",
    symbol: "◆",
  },
  contact_and_buying_center: {
    label: "Contacts & buying center",
    description: "Governed contacts and buying-center hypotheses",
    symbol: "◎",
  },
  outreach: {
    label: "Outreach",
    description: "Claims, citations, uncertainty, and policy review",
    symbol: "↗",
  },
  controlled_learning: {
    label: "Controlled learning",
    description: "Measured proposals, impact, and rollback review",
    symbol: "△",
  },
});

const METRIC_META: Readonly<Record<MetricKey, Readonly<{ label: string; tone: Tone }>>> = Object.freeze({
  ready: { label: "Ready", tone: "info" },
  claimed: { label: "Claimed", tone: "neutral" },
  blocked: { label: "Blocked", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
});

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  neutral: {
    background: "var(--surface-muted)",
    borderColor: "var(--surface-card-border)",
    color: "var(--text-secondary)",
  },
  info: {
    background: "var(--info-bg)",
    borderColor: "var(--surface-info-border)",
    color: "var(--text-primary)",
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
});

const METRICS = ["ready", "claimed", "blocked", "overdue"] as const;

function formatAge(minutes: number | null): string {
  if (minutes === null) return "No waiting items";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  }
  const days = Math.floor(minutes / 1_440);
  const remainingHours = Math.floor((minutes % 1_440) / 60);
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

function OverviewState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return (
      <AsyncState
        variant="loading"
        title="Loading review workload"
        description="Retrieving canonical review queue summaries for this workspace."
      />
    );
  }
  if (state === "error") {
    return (
      <AsyncState
        variant="error"
        title="Review workload unavailable"
        description={error ?? "The review workload could not be loaded."}
      />
    );
  }
  return (
    <AsyncState
      variant="empty"
      title="No review queues yet"
      description="Queue summaries will appear here when governed review work is available."
    />
  );
}

function ScopeFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-xl border px-3 py-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-all font-mono text-[0.7rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{value}</dd>
    </div>
  );
}

function QueueCard({ queue, index, onOpenQueue }: Readonly<{
  queue: ReviewQueueSummary;
  index: number;
  onOpenQueue?: (queue: ReviewQueueSummary) => void;
}>) {
  const meta = QUEUE_META[queue.kind];
  const titleId = `review-overview-queue-${index}`;
  const canOpen = queue.actions.open === "available" && Boolean(onOpenQueue);

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-review-queue={queue.kind}>
      <article aria-labelledby={titleId}>
        <header className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold"
            style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}
          >
            {meta.symbol}
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{meta.label}</h3>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{meta.description}</p>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`${meta.label} queue counts`}>
          {METRICS.map((metric) => (
            <div key={metric} className="rounded-xl border p-3" data-workload-metric={metric} style={TONE_STYLE[METRIC_META[metric].tone]}>
              <dt className="text-[0.68rem] font-semibold uppercase tracking-wide">{METRIC_META[metric].label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{queue[metric]}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--surface-card-border)" }}>
          <div>
            <p className="section-label">Oldest waiting age</p>
            <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatAge(queue.oldestAgeMinutes)}</p>
          </div>
          {canOpen ? (
            <button
              type="button"
              className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              onClick={() => onOpenQueue?.(queue)}
            >
              Open {meta.label} queue
            </button>
          ) : null}
        </div>
      </article>
    </li>
  );
}

export function ReviewOverviewPanel(props: ReviewOverviewPanelProps) {
  if (props.state === "loading") return <OverviewState state="loading" />;
  if (props.state === "error") return <OverviewState state="error" error={props.error} />;
  if (props.state === "empty" || props.queues.length === 0) return <OverviewState state="empty" />;

  if (props.queues.some((queue) => queue.tenantId !== props.scope.tenantId || queue.workspaceId !== props.scope.workspaceId)) {
    return <OverviewState state="error" error="The review workload scope could not be verified." />;
  }

  const totals = props.queues.reduce(
    (summary, queue) => ({
      ready: summary.ready + queue.ready,
      claimed: summary.claimed + queue.claimed,
      blocked: summary.blocked + queue.blocked,
      overdue: summary.overdue + queue.overdue,
    }),
    { ready: 0, claimed: 0, blocked: 0, overdue: 0 },
  );

  return (
    <section className="space-y-4" data-surface="review-overview-panel" aria-labelledby="review-overview-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="section-label">Review operations · Workload overview</p>
            <h2 id="review-overview-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Choose the next review queue
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical queue summaries show where work is waiting, claimed, blocked, or overdue. Open a queue to handle its bounded decisions.
            </p>
          </div>
          <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[32rem]">
            <ScopeFact label="Tenant scope" value={props.scope.tenantId} />
            <ScopeFact label="Workspace scope" value={props.scope.workspaceId} />
          </dl>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Review workload totals">
          {METRICS.map((metric) => (
            <div key={metric} className="rounded-xl border p-3" data-workload-total={metric} style={TONE_STYLE[METRIC_META[metric].tone]}>
              <dt className="text-xs font-semibold uppercase tracking-wide">{METRIC_META[metric].label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{totals[metric]}</dd>
            </div>
          ))}
        </dl>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical review queues">
        {props.queues.map((queue, index) => (
          <QueueCard
            key={`${queue.tenantId}:${queue.workspaceId}:${queue.kind}`}
            queue={queue}
            index={index}
            onOpenQueue={props.onOpenQueue}
          />
        ))}
      </ul>
    </section>
  );
}
