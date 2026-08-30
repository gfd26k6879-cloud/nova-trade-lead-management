"use client";

import { AsyncState } from "@/components/async-state";

export type OutreachPortfolioDraftStatus = "draft" | "in_review" | "approved" | "rejected" | "archived";
export type OutreachPortfolioReviewStatus = "not_requested" | "pending" | "approved" | "rejected";
export type OutreachPortfolioPolicyStatus = "ready" | "blocked" | "stale";
export type OutreachPortfolioSuppressionStatus = "clear" | "blocked" | "unknown";
export type OutreachPortfolioCitationStatus = "ready" | "incomplete" | "stale" | "conflicted";
export type OutreachPortfolioAction = "open" | "review" | "copy" | "export";

export type OutreachPortfolioItem = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  draftId: string;
  subject: string;
  account: Readonly<{ accountId: string; displayName: string }>;
  contact: Readonly<{ contactId: string; displayName: string }>;
  play: Readonly<{ playId: string; displayName: string; versionId: string }>;
  version: Readonly<{ versionId: string; revision: number; label: string }>;
  draftStatus: OutreachPortfolioDraftStatus;
  reviewStatus: OutreachPortfolioReviewStatus;
  policyStatus: OutreachPortfolioPolicyStatus;
  suppressionStatus: OutreachPortfolioSuppressionStatus;
  citationStatus: OutreachPortfolioCitationStatus;
  updatedAt: string;
  eligibleActions: readonly OutreachPortfolioAction[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string | null }>;
  drafts: readonly OutreachPortfolioItem[];
  onOpen?: (draft: OutreachPortfolioItem) => void;
  onReview?: (draft: OutreachPortfolioItem) => void;
  onCopy?: (draft: OutreachPortfolioItem) => void;
  onExport?: (draft: OutreachPortfolioItem) => void;
  error?: never;
}>;

export type OutreachPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; drafts?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; drafts?: never }>
  | Readonly<{ state: "empty"; scope?: never; drafts?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

const DRAFT_META = {
  draft: { label: "Draft", symbol: "○", tone: "neutral" },
  in_review: { label: "In review", symbol: "…", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
  archived: { label: "Archived", symbol: "—", tone: "neutral" },
} as const;

const REVIEW_META = {
  not_requested: { label: "Review not requested", symbol: "○", tone: "neutral" },
  pending: { label: "Review pending", symbol: "…", tone: "warning" },
  approved: { label: "Review approved", symbol: "✓", tone: "success" },
  rejected: { label: "Review rejected", symbol: "×", tone: "danger" },
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

const CITATION_META = {
  ready: { label: "Citations ready", symbol: "✓", tone: "success" },
  incomplete: { label: "Citations incomplete", symbol: "?", tone: "warning" },
  stale: { label: "Citations stale", symbol: "!", tone: "warning" },
  conflicted: { label: "Citations conflicted", symbol: "×", tone: "danger" },
} as const;

function Badge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
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

function PortfolioState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading outreach drafts" description="Retrieving canonical draft review summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Outreach drafts unavailable" description={error ?? "The draft portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No outreach drafts yet" description="Approved account, contact, and play context can be used to prepare a draft." />;
}

function isExactScope(item: OutreachPortfolioItem, scope: ReadyProps["scope"]): boolean {
  return item.tenantId === scope.tenantId && item.workspaceId === scope.workspaceId;
}

function allowedActions(item: OutreachPortfolioItem): ReadonlySet<OutreachPortfolioAction> {
  const supplied = new Set(item.eligibleActions);
  const allowed = new Set<OutreachPortfolioAction>();
  if (supplied.has("open")) allowed.add("open");
  if (
    supplied.has("review")
    && (item.draftStatus === "draft" || item.draftStatus === "in_review")
    && (item.reviewStatus === "not_requested" || item.reviewStatus === "pending")
  ) {
    allowed.add("review");
  }
  const approvedForHandoff = item.draftStatus === "approved"
    && item.reviewStatus === "approved"
    && item.policyStatus === "ready"
    && item.suppressionStatus === "clear"
    && item.citationStatus === "ready";
  if (approvedForHandoff && supplied.has("copy")) allowed.add("copy");
  if (approvedForHandoff && supplied.has("export")) allowed.add("export");
  return allowed;
}

function DraftCard({
  draft,
  headingId,
  onOpen,
  onReview,
  onCopy,
  onExport,
}: Readonly<{
  draft: OutreachPortfolioItem;
  headingId: string;
  onOpen?: (draft: OutreachPortfolioItem) => void;
  onReview?: (draft: OutreachPortfolioItem) => void;
  onCopy?: (draft: OutreachPortfolioItem) => void;
  onExport?: (draft: OutreachPortfolioItem) => void;
}>) {
  const draftMeta = DRAFT_META[draft.draftStatus];
  const reviewMeta = REVIEW_META[draft.reviewStatus];
  const policyMeta = POLICY_META[draft.policyStatus];
  const suppressionMeta = SUPPRESSION_META[draft.suppressionStatus];
  const citationMeta = CITATION_META[draft.citationStatus];
  const actions = allowedActions(draft);

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-draft-status={draft.draftStatus}>
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id={headingId} className="break-words text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
              {draft.subject}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>{draft.draftId}</p>
          </div>
          <Badge label={draftMeta.label} symbol={draftMeta.symbol} tone={draftMeta.tone} />
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Account</dt>
            <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{draft.account.displayName}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{draft.account.accountId}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Contact</dt>
            <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{draft.contact.displayName}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{draft.contact.contactId}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Lead play</dt>
            <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{draft.play.displayName}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{draft.play.playId} · {draft.play.versionId}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Exact draft version</dt>
            <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{draft.version.label} · revision {draft.version.revision}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{draft.version.versionId}</dd>
          </div>
        </dl>

        <section className="mt-4" aria-label={`Readiness for ${draft.subject}`}>
          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Review and readiness</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge label={reviewMeta.label} symbol={reviewMeta.symbol} tone={reviewMeta.tone} />
            <Badge label={policyMeta.label} symbol={policyMeta.symbol} tone={policyMeta.tone} />
            <Badge label={suppressionMeta.label} symbol={suppressionMeta.symbol} tone={suppressionMeta.tone} />
            <Badge label={citationMeta.label} symbol={citationMeta.symbol} tone={citationMeta.tone} />
          </div>
        </section>

        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Updated <time dateTime={draft.updatedAt}>{formatTimestamp(draft.updatedAt)} UTC</time>
        </p>

        {(actions.has("open") && onOpen)
          || (actions.has("review") && onReview)
          || (actions.has("copy") && onCopy)
          || (actions.has("export") && onExport) ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {actions.has("open") && onOpen ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen(draft)}>
                Open draft
              </button>
            ) : null}
            {actions.has("review") && onReview ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onReview(draft)}>
                Review draft
              </button>
            ) : null}
            {actions.has("copy") && onCopy ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onCopy(draft)}>
                Copy approved draft
              </button>
            ) : null}
            {actions.has("export") && onExport ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onExport(draft)}>
                Export approved draft
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function OutreachPortfolioPanel(props: OutreachPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty") return <PortfolioState state="empty" />;
  if (props.drafts.length === 0) return <PortfolioState state="empty" />;
  if (props.drafts.some((draft) => !isExactScope(draft, props.scope))) {
    return <PortfolioState state="error" error="The outreach portfolio scope could not be verified." />;
  }

  const reviewCount = props.drafts.filter((draft) => (
    draft.reviewStatus === "not_requested" || draft.reviewStatus === "pending"
  )).length;
  const blockedCount = props.drafts.filter((draft) => (
    draft.policyStatus !== "ready" || draft.suppressionStatus !== "clear" || draft.citationStatus !== "ready"
  )).length;

  return (
    <section className="space-y-4" data-surface="outreach-portfolio-panel" aria-labelledby="outreach-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Outreach · Draft portfolio</p>
            <h2 id="outreach-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Outreach drafts
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical account, contact, play, version, review, and readiness context for every draft.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: blockedCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.drafts.length} {props.drafts.length === 1 ? "draft" : "drafts"} · {reviewCount} awaiting review · {blockedCount} blocked
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical outreach draft portfolio">
        {props.drafts.map((draft, index) => (
          <DraftCard
            key={`${draft.tenantId}:${draft.workspaceId ?? "tenant"}:${draft.draftId}:${draft.version.versionId}`}
            draft={draft}
            headingId={`outreach-portfolio-draft-${index}`}
            onOpen={props.onOpen}
            onReview={props.onReview}
            onCopy={props.onCopy}
            onExport={props.onExport}
          />
        ))}
      </ul>
    </section>
  );
}
