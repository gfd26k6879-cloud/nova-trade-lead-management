"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";
import type { KnowledgeClaimClass, KnowledgeClaimReviewState } from "@/lib/knowledge/claims";

export type EvidenceLibraryFreshness = "current" | "stale" | "unknown";
export type EvidenceLibraryConflict = "clear" | "conflicted";
export type EvidenceLibraryActionState = "allowed" | "blocked";

/**
 * Render-safe, canonical evidence summary assembled outside this UI. It contains
 * labels and stable references only; source content and resolution remain server concerns.
 */
export type EvidenceLibraryItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  claim: Readonly<{
    claimId: string;
    claimVersionId: string;
    claimClass: KnowledgeClaimClass;
    statement: string;
    reviewState: KnowledgeClaimReviewState;
  }>;
  source: Readonly<{
    label: string;
    documentId: string;
    documentVersionId: string;
  }>;
  citation: Readonly<{
    citationId: string;
    evidenceId: string;
    state: "resolved";
    locatorLabel: string;
  }>;
  freshness: EvidenceLibraryFreshness;
  conflict: EvidenceLibraryConflict;
  actions: Readonly<{
    open: EvidenceLibraryActionState;
    review: EvidenceLibraryActionState;
  }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  items: readonly EvidenceLibraryItem[];
  onOpen?: (item: EvidenceLibraryItem) => void;
  onReview?: (item: EvidenceLibraryItem) => void;
  error?: never;
}>;

export type EvidenceLibraryPanelProps =
  | Readonly<{ state: "loading"; scope?: never; items?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; items?: never }>
  | Readonly<{ state: "empty"; scope?: never; items?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
});

const FRESHNESS_META: Readonly<Record<EvidenceLibraryFreshness, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  current: { label: "Current", symbol: "✓", tone: "success" },
  stale: { label: "Stale", symbol: "!", tone: "warning" },
  unknown: { label: "Freshness unknown", symbol: "?", tone: "neutral" },
});

const REVIEW_META: Readonly<Record<KnowledgeClaimReviewState, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  proposed: { label: "Awaiting review", symbol: "?", tone: "warning" },
  accepted: { label: "Human accepted", symbol: "✓", tone: "success" },
  rejected: { label: "Human rejected", symbol: "×", tone: "danger" },
});

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function Badge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>{label}
    </span>
  );
}

function PanelState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading evidence library" description="Retrieving canonical claim, citation, source, freshness, conflict, and review summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Evidence library unavailable" description={error ?? "The canonical evidence portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No evidence yet" description="Approved source extraction will add cited claims to this library." />;
}

function ItemCard({ item, index, onOpen, onReview }: Readonly<{
  item: EvidenceLibraryItem;
  index: number;
  onOpen?: ReadyProps["onOpen"];
  onReview?: ReadyProps["onReview"];
}>) {
  const freshness = FRESHNESS_META[item.freshness];
  const review = REVIEW_META[item.claim.reviewState];
  const conflict = item.conflict === "conflicted"
    ? { label: "Conflicting evidence", symbol: "!", tone: "danger" as const }
    : { label: "No conflict recorded", symbol: "✓", tone: "success" as const };
  const canOpen = item.actions.open === "allowed" && Boolean(onOpen);
  const canReview = item.actions.review === "allowed"
    && item.claim.reviewState === "proposed" && Boolean(onReview);
  const titleId = `evidence-library-item-${index}-title`;

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-freshness={item.freshness} data-conflict={item.conflict} data-review-state={item.claim.reviewState}>
      <article aria-labelledby={titleId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">{words(item.claim.claimClass)} · cited claim</p>
            <h3 id={titleId} className="mt-1 break-words text-base font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {item.claim.statement}
            </h3>
          </div>
          <Badge {...review} />
        </header>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Evidence health">
          <Badge {...freshness} />
          <Badge {...conflict} />
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 sm:col-span-2" style={TONE_STYLE.neutral}>
            <dt className="section-label">Source</dt>
            <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.source.label}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={TONE_STYLE.neutral}>
            <dt className="section-label">Document</dt>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-primary)" }}>{item.source.documentId}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={TONE_STYLE.neutral}>
            <dt className="section-label">Version</dt>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-primary)" }}>{item.source.documentVersionId}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3 sm:col-span-2" style={TONE_STYLE.neutral}>
            <dt className="section-label">Exact locator</dt>
            <dd className="mt-1 break-words text-sm" style={{ color: "var(--text-primary)" }}>{item.citation.locatorLabel}</dd>
          </div>
        </dl>

        <details className="mt-3 rounded-xl border" style={{ borderColor: "var(--surface-card-border)" }}>
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Canonical references</summary>
          <dl className="space-y-2 border-t px-3 py-3 font-mono text-[0.68rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            <div><dt className="inline font-semibold">Claim: </dt><dd className="inline break-all">{item.claim.claimId}</dd></div>
            <div><dt className="inline font-semibold">Claim version: </dt><dd className="inline break-all">{item.claim.claimVersionId}</dd></div>
            <div><dt className="inline font-semibold">Evidence: </dt><dd className="inline break-all">{item.citation.evidenceId}</dd></div>
            <div><dt className="inline font-semibold">Citation: </dt><dd className="inline break-all">{item.citation.citationId}</dd></div>
          </dl>
        </details>

        {canOpen || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-evidence-library-action="open" onClick={() => onOpen?.(item)}>Open cited evidence</button> : null}
            {canReview ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-evidence-library-action="review" onClick={() => onReview?.(item)}>Review proposed claim</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function EvidenceLibraryPanel(props: EvidenceLibraryPanelProps) {
  if (props.state === "loading") return <PanelState state="loading" />;
  if (props.state === "error") return <PanelState state="error" error={props.error} />;
  if (props.state === "empty" || props.items.length === 0) return <PanelState state="empty" />;
  if (props.items.some((item) => item.tenantId !== props.scope.tenantId || item.workspaceId !== props.scope.workspaceId)) {
    return <PanelState state="error" error="The evidence-library tenant or workspace scope could not be verified." />;
  }

  const reviewCount = props.items.filter((item) => item.claim.reviewState === "proposed").length;
  const conflictCount = props.items.filter((item) => item.conflict === "conflicted").length;

  return (
    <section className="space-y-4" data-surface="evidence-library-panel" aria-labelledby="evidence-library-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Knowledge · Canonical evidence</p>
            <h2 id="evidence-library-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Evidence library</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Trace every claim to its private source version and exact render-safe locator, with freshness, conflicts, and human review visible.</p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount || conflictCount ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.items.length} {props.items.length === 1 ? "citation" : "citations"} · {reviewCount} awaiting review · {conflictCount} conflicted
          </p>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Exact evidence-library scope">
          <div className="min-w-0 rounded-xl border p-3" style={TONE_STYLE.neutral}><dt className="section-label">Tenant scope</dt><dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{props.scope.tenantId}</dd></div>
          <div className="min-w-0 rounded-xl border p-3" style={TONE_STYLE.neutral}><dt className="section-label">Workspace scope</dt><dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{props.scope.workspaceId}</dd></div>
        </dl>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Canonical evidence citations">
        {props.items.map((item, index) => (
          <ItemCard key={`${item.claim.claimVersionId}:${item.citation.citationId}`} item={item} index={index} onOpen={props.onOpen} onReview={props.onReview} />
        ))}
      </ul>
    </section>
  );
}
