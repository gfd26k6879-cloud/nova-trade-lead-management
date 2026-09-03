"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";

export type OutreachHistoryVersionState = "current" | "superseded";
export type OutreachHistoryReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export type OutreachHistoryCitationStatus = "ready" | "incomplete" | "stale" | "conflicted";
export type OutreachHistoryPolicyStatus = "ready" | "blocked" | "stale";
export type OutreachHistorySuppressionStatus = "clear" | "blocked" | "unknown";

export type OutreachHistoryVersionSummary = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  draftId: string;
  version: Readonly<{
    versionId: string;
    revision: number;
    label: string;
    supersedesVersionId: string | null;
  }>;
  account: Readonly<{ accountId: string; displayName: string }>;
  contact: Readonly<{ contactId: string; displayName: string }>;
  play: Readonly<{ playId: string; versionId: string; displayName: string }>;
  versionState: OutreachHistoryVersionState;
  reviewStatus: OutreachHistoryReviewStatus;
  citationStatus: OutreachHistoryCitationStatus;
  policyStatus: OutreachHistoryPolicyStatus;
  suppressionStatus: OutreachHistorySuppressionStatus;
  createdAt: string;
  lastReview: Readonly<{
    reviewerId: string;
    reviewerLabel: string;
    reviewedAt: string;
  }> | null;
  actions: Readonly<{ open: boolean; copy: boolean; export: boolean }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  draftId: string;
  versions: readonly OutreachHistoryVersionSummary[];
  onOpen?: (summary: OutreachHistoryVersionSummary) => void;
  onCopy?: (summary: OutreachHistoryVersionSummary) => void;
  onExport?: (summary: OutreachHistoryVersionSummary) => void;
  error?: never;
}>;

export type OutreachHistoryPanelProps =
  | Readonly<{ state: "loading"; scope?: never; draftId?: never; versions?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; draftId?: never; versions?: never }>
  | Readonly<{ state: "empty"; scope?: never; draftId?: never; versions?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, CSSProperties> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

const VERSION_META = {
  current: { label: "Current version", symbol: "✓", tone: "success" },
  superseded: { label: "Superseded version", symbol: "↗", tone: "neutral" },
} as const;

const REVIEW_META = {
  draft: { label: "Review draft", symbol: "○", tone: "neutral" },
  in_review: { label: "Review pending", symbol: "…", tone: "warning" },
  approved: { label: "Review approved", symbol: "✓", tone: "success" },
  rejected: { label: "Review rejected", symbol: "×", tone: "danger" },
} as const;

const CITATION_META = {
  ready: { label: "Citations ready", symbol: "✓", tone: "success" },
  incomplete: { label: "Citations incomplete", symbol: "?", tone: "warning" },
  stale: { label: "Citations stale", symbol: "!", tone: "warning" },
  conflicted: { label: "Citations conflicted", symbol: "×", tone: "danger" },
} as const;

const POLICY_META = {
  ready: { label: "Policy ready", symbol: "✓", tone: "success" },
  blocked: { label: "Policy blocked", symbol: "×", tone: "danger" },
  stale: { label: "Policy stale", symbol: "!", tone: "warning" },
} as const;

const SUPPRESSION_META = {
  clear: { label: "Suppression clear", symbol: "✓", tone: "success" },
  blocked: { label: "Suppression blocked", symbol: "×", tone: "danger" },
  unknown: { label: "Suppression unknown", symbol: "?", tone: "warning" },
} as const;

function StatusBadge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
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

function HistoryState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading draft history" description="Retrieving canonical outreach version summaries and review state." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Draft history unavailable" description={error ?? "The outreach version history could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No draft versions yet" description="Create an outreach draft to begin its governed version history." />;
}

function Scope({ tenantId, workspaceId }: Readonly<{ tenantId: string; workspaceId: string | null }>) {
  return (
    <dl className="grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
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

function Binding({ label, name, ids }: Readonly<{ label: string; name: string; ids: readonly string[] }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</dd>
      {ids.map((id) => <dd key={id} className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{id}</dd>)}
    </div>
  );
}

function VersionCard({ summary, onOpen, onCopy, onExport }: Readonly<{
  summary: OutreachHistoryVersionSummary;
  onOpen?: (summary: OutreachHistoryVersionSummary) => void;
  onCopy?: (summary: OutreachHistoryVersionSummary) => void;
  onExport?: (summary: OutreachHistoryVersionSummary) => void;
}>) {
  const versionMeta = VERSION_META[summary.versionState];
  const reviewMeta = REVIEW_META[summary.reviewStatus];
  const citationMeta = CITATION_META[summary.citationStatus];
  const policyMeta = POLICY_META[summary.policyStatus];
  const suppressionMeta = SUPPRESSION_META[summary.suppressionStatus];
  const canOpen = summary.actions.open && Boolean(onOpen);
  const readyForHandoff = summary.versionState === "current"
    && summary.reviewStatus === "approved"
    && summary.citationStatus === "ready"
    && summary.policyStatus === "ready"
    && summary.suppressionStatus === "clear";
  const canCopy = readyForHandoff && summary.actions.copy && Boolean(onCopy);
  const canExport = readyForHandoff && summary.actions.export && Boolean(onExport);
  const titleId = `outreach-history-${summary.version.versionId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-version-state={summary.versionState} data-review-status={summary.reviewStatus}>
      <article aria-labelledby={titleId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">{summary.version.label} · Revision {summary.version.revision}</p>
            <h3 id={titleId} className="mt-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Outreach version {summary.version.revision}
            </h3>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{summary.version.versionId}</p>
          </div>
          <StatusBadge label={versionMeta.label} symbol={versionMeta.symbol} tone={versionMeta.tone} />
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Binding label="Account binding" name={summary.account.displayName} ids={[summary.account.accountId]} />
          <Binding label="Contact binding" name={summary.contact.displayName} ids={[summary.contact.contactId]} />
          <Binding label="Lead play binding" name={summary.play.displayName} ids={[summary.play.playId, summary.play.versionId]} />
        </dl>

        <section className="mt-4" aria-label={`Readiness for revision ${summary.version.revision}`}>
          <h4 className="section-label">Review and readiness</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge label={reviewMeta.label} symbol={reviewMeta.symbol} tone={reviewMeta.tone} />
            <StatusBadge label={citationMeta.label} symbol={citationMeta.symbol} tone={citationMeta.tone} />
            <StatusBadge label={policyMeta.label} symbol={policyMeta.symbol} tone={policyMeta.tone} />
            <StatusBadge label={suppressionMeta.label} symbol={suppressionMeta.symbol} tone={suppressionMeta.tone} />
          </div>
        </section>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <dl className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Created</dt>
            <dd className="mt-1" style={{ color: "var(--text-secondary)" }}>
              <time dateTime={summary.createdAt}>{formatTimestamp(summary.createdAt)} UTC</time>
            </dd>
          </dl>
          <dl className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Human reviewer</dt>
            {summary.lastReview ? (
              <dd className="mt-1" style={{ color: "var(--text-secondary)" }}>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{summary.lastReview.reviewerLabel}</span>
                <span className="mt-1 block break-all font-mono text-[0.68rem]">{summary.lastReview.reviewerId}</span>
                <time className="mt-1 block" dateTime={summary.lastReview.reviewedAt}>{formatTimestamp(summary.lastReview.reviewedAt)} UTC</time>
              </dd>
            ) : (
              <dd className="mt-1" data-state="STATE-UNKNOWN" style={{ color: "var(--text-secondary)" }}>No human review recorded</dd>
            )}
          </dl>
        </div>

        {summary.version.supersedesVersionId ? (
          <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
            Supersedes: {summary.version.supersedesVersionId}
          </p>
        ) : null}

        {canOpen || canCopy || canExport ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(summary)}>Open exact version</button> : null}
            {canCopy ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onCopy?.(summary)}>Copy approved version</button> : null}
            {canExport ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onExport?.(summary)}>Export approved version</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

function hasExactLineage(summary: OutreachHistoryVersionSummary, props: ReadyProps): boolean {
  return summary.tenantId === props.scope.tenantId
    && summary.workspaceId === props.scope.workspaceId
    && summary.draftId === props.draftId;
}

export function OutreachHistoryPanel(props: OutreachHistoryPanelProps) {
  if (props.state === "loading") return <HistoryState state="loading" />;
  if (props.state === "error") return <HistoryState state="error" error={props.error} />;
  if (props.state === "empty" || props.versions.length === 0) return <HistoryState state="empty" />;
  if (props.versions.some((summary) => !hasExactLineage(summary, props))) {
    return <HistoryState state="error" error="The outreach history scope or draft lineage could not be verified." />;
  }

  const currentCount = props.versions.filter((summary) => summary.versionState === "current").length;
  const approvedCount = props.versions.filter((summary) => summary.reviewStatus === "approved").length;

  return (
    <section className="space-y-4" data-surface="outreach-history-panel" aria-labelledby="outreach-history-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Outreach · Governed version history</p>
            <h2 id="outreach-history-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Draft version history</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Inspect exact account, contact, play, review, citation, policy, and suppression bindings for this draft lineage.
            </p>
            <p className="mt-2 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>{props.draftId}</p>
          </div>
          <p className="text-sm font-semibold" style={{ color: currentCount === 1 ? "var(--text-secondary)" : "var(--warning-text)" }}>
            {props.versions.length} {props.versions.length === 1 ? "version" : "versions"} · {currentCount} current · {approvedCount} approved
          </p>
        </div>
        <div className="mt-4"><Scope tenantId={props.scope.tenantId} workspaceId={props.scope.workspaceId} /></div>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Canonical outreach draft versions">
        {props.versions.map((summary) => (
          <VersionCard key={summary.version.versionId} summary={summary} onOpen={props.onOpen} onCopy={props.onCopy} onExport={props.onExport} />
        ))}
      </ul>
    </section>
  );
}
