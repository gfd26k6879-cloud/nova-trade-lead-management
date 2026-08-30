"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type BusinessUnderstandingVersionStatus = "current" | "draft" | "approved" | "superseded";

export type BusinessUnderstandingVersionActions = Readonly<{
  open: boolean;
  review: boolean;
  rollback: boolean;
}>;

export type BusinessUnderstandingVersionSummary = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  versionId: string;
  proposalRef: string;
  revision: number;
  status: BusinessUnderstandingVersionStatus;
  evidenceCount: number;
  uncertaintyCount: number;
  questionCount: number;
  recordedAt: string;
  lastReview: Readonly<{
    reviewerId: string;
    reviewerLabel: string;
    reviewedAt: string;
  }> | null;
  rollbackTargetVersionId: string | null;
  actions: BusinessUnderstandingVersionActions;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  versions: readonly BusinessUnderstandingVersionSummary[];
  onOpen?: (summary: BusinessUnderstandingVersionSummary) => void;
  onReview?: (summary: BusinessUnderstandingVersionSummary) => void;
  onRollback?: (summary: BusinessUnderstandingVersionSummary) => void;
  error?: never;
}>;

export type BusinessUnderstandingHistoryPanelProps =
  | Readonly<{ state: "loading"; scope?: never; versions?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; versions?: never }>
  | Readonly<{ state: "empty"; scope?: never; versions?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "neutral";

const TONE_STYLE: Record<Tone, CSSProperties> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

const STATUS_META: Record<BusinessUnderstandingVersionStatus, Readonly<{ label: string; symbol: string; tone: Tone }>> = {
  current: { label: "Current", symbol: "✓", tone: "success" },
  draft: { label: "Draft", symbol: "·", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  superseded: { label: "Superseded", symbol: "↗", tone: "neutral" },
};

function dateLabel(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function HistoryState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading understanding history" description="Retrieving canonical business-understanding version summaries and human review state." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Understanding history unavailable" description={error ?? "The version history could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No understanding versions yet" description="Complete document intake to create the first governed business-understanding draft." />;
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

function Metric({ label, value, warn = false }: Readonly<{ label: string; value: number; warn?: boolean }>) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: warn && value > 0 ? "var(--warning-text)" : "var(--text-primary)" }}>
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

function VersionCard({ summary, onOpen, onReview, onRollback }: Readonly<{
  summary: BusinessUnderstandingVersionSummary;
  onOpen?: (summary: BusinessUnderstandingVersionSummary) => void;
  onReview?: (summary: BusinessUnderstandingVersionSummary) => void;
  onRollback?: (summary: BusinessUnderstandingVersionSummary) => void;
}>) {
  const status = STATUS_META[summary.status];
  const canOpen = summary.actions.open && Boolean(onOpen);
  const canReview = summary.actions.review && Boolean(onReview);
  const rollbackAvailable = summary.actions.rollback && summary.rollbackTargetVersionId !== null;
  const canRollback = rollbackAvailable && Boolean(onRollback);
  const titleId = `understanding-history-${summary.versionId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <li
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-version-status={summary.status}
      data-review-available={summary.actions.review ? "true" : "false"}
      data-rollback-available={rollbackAvailable ? "true" : "false"}
    >
      <article aria-labelledby={titleId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Business understanding · Revision {summary.revision}</p>
            <h3 id={titleId} className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Understanding version {summary.revision}</h3>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{summary.proposalRef}</p>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{summary.versionId}</p>
          </div>
          <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[status.tone]}>
            <span aria-hidden="true">{status.symbol}</span>
            {status.label}
          </span>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Evidence" value={summary.evidenceCount} />
          <Metric label="Uncertainties" value={summary.uncertaintyCount} warn />
          <Metric label="Adaptive questions" value={summary.questionCount} warn />
        </dl>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)]">
          <Scope tenantId={summary.tenantId} workspaceId={summary.workspaceId} />
          <dl className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>
            <div>
              <dt className="section-label">Recorded</dt>
              <dd className="mt-1" style={{ color: "var(--text-secondary)" }}><time dateTime={summary.recordedAt}>{dateLabel(summary.recordedAt)} UTC</time></dd>
            </div>
            <div className="mt-3">
              <dt className="section-label">Human reviewer</dt>
              {summary.lastReview ? (
                <dd className="mt-1" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{summary.lastReview.reviewerLabel}</span>
                  <span className="mt-1 block break-all font-mono text-[0.68rem]">{summary.lastReview.reviewerId}</span>
                  <time className="mt-1 block" dateTime={summary.lastReview.reviewedAt}>{dateLabel(summary.lastReview.reviewedAt)} UTC</time>
                </dd>
              ) : (
                <dd className="mt-1" data-state="STATE-UNKNOWN" style={{ color: "var(--text-secondary)" }}>No human review recorded</dd>
              )}
            </div>
          </dl>
        </div>

        {summary.rollbackTargetVersionId ? (
          <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Rollback target: {summary.rollbackTargetVersionId}</p>
        ) : null}

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

export function BusinessUnderstandingHistoryPanel(props: BusinessUnderstandingHistoryPanelProps) {
  if (props.state === "loading") return <HistoryState state="loading" />;
  if (props.state === "error") return <HistoryState state="error" error={props.error} />;
  if (props.state === "empty" || props.versions.length === 0) return <HistoryState state="empty" />;
  if (props.versions.some((summary) => summary.tenantId !== props.scope.tenantId || summary.workspaceId !== props.scope.workspaceId)) {
    return <HistoryState state="error" error="The understanding history scope could not be verified." />;
  }

  const currentCount = props.versions.filter((summary) => summary.status === "current").length;
  const reviewCount = props.versions.filter((summary) => summary.actions.review).length;

  return (
    <section className="space-y-4" data-surface="business-understanding-history-panel" aria-labelledby="business-understanding-history-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Business understanding · Governed version history</p>
            <h2 id="business-understanding-history-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Understanding versions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Compare evidence and uncertainty across canonical versions, then use only the actions supplied for each exact state.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.versions.length} {props.versions.length === 1 ? "version" : "versions"} · {currentCount} current · {reviewCount} awaiting review
          </p>
        </div>
        <div className="mt-4"><Scope tenantId={props.scope.tenantId} workspaceId={props.scope.workspaceId} /></div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical business-understanding versions">
        {props.versions.map((summary) => (
          <VersionCard key={summary.versionId} summary={summary} onOpen={props.onOpen} onReview={props.onReview} onRollback={props.onRollback} />
        ))}
      </ul>
    </section>
  );
}
