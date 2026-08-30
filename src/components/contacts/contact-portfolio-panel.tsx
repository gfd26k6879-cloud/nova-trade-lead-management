"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";
import type { ContactRecord } from "@/lib/contacts/contact-record";

type EpistemicState = ContactRecord["freshness"]["state"];
type ReviewStatus = ContactRecord["review"]["status"];

export type ContactPortfolioItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  stableKey: string;
  versionId: string;
  identity: ContactRecord["identity"];
  roleHypothesis: ContactRecord["roleHypothesis"];
  source: Readonly<Pick<ContactRecord["sourceReceipt"], "connectorKey" | "sourceVersionId">>;
  freshness: ContactRecord["freshness"];
  permittedUse: Readonly<Pick<
    ContactRecord["permittedUse"],
    "sourcePolicy" | "channelAuthorization" | "consentSignal"
  >>;
  suppressionDisposition: ContactRecord["suppressionDisposition"];
  review: Readonly<{
    status: ReviewStatus;
    needed: boolean;
  }>;
  actions: Readonly<{
    select: "available" | "blocked";
    review: "available" | "blocked";
  }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  contacts: readonly ContactPortfolioItem[];
  onSelect?: (contact: ContactPortfolioItem) => void;
  onRequestReview?: (contact: ContactPortfolioItem) => void;
  error?: never;
}>;

export type ContactPortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; contacts?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; contacts?: never }>
  | Readonly<{ state: "empty"; scope?: never; contacts?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
});

const EPISTEMIC_META: Readonly<Record<EpistemicState, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  KNOWN: { label: "Known", symbol: "✓", tone: "success" },
  UNKNOWN: { label: "Unknown", symbol: "?", tone: "warning" },
  CONFLICTED: { label: "Conflicted", symbol: "!", tone: "danger" },
  STALE: { label: "Stale", symbol: "⌛", tone: "danger" },
  NA: { label: "Not applicable", symbol: "—", tone: "neutral" },
});

const REVIEW_META: Readonly<Record<ReviewStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  draft: { label: "Draft", symbol: "○", tone: "warning" },
  in_review: { label: "In review", symbol: "…", tone: "warning" },
  approved: { label: "Approved", symbol: "✓", tone: "success" },
  rejected: { label: "Rejected", symbol: "×", tone: "danger" },
});

const VERIFICATION_META: Readonly<Record<ContactRecord["identity"]["verification"], Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
}>>> = Object.freeze({
  source_observed: { label: "Source observed", symbol: "◉", tone: "neutral" },
  human_corrected: { label: "Human corrected", symbol: "✓", tone: "success" },
  unverified: { label: "Unverified", symbol: "?", tone: "warning" },
});

function words(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
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
    return <AsyncState variant="loading" title="Loading contact portfolio" description="Retrieving canonical contact governance summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Contact portfolio unavailable" description={error ?? "The contact portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No governed contacts yet" description="Governed contact summaries will appear here after they are available for this workspace." />;
}

function GovernanceFact({ label, value }: Readonly<{ label: string; value: EpistemicState }>) {
  const meta = EPISTEMIC_META[value];
  return (
    <div className="rounded-xl border p-3" data-governance-state={value} style={TONE_STYLE[meta.tone]}>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm font-semibold"><span aria-hidden="true">{meta.symbol}</span> {meta.label}</dd>
    </div>
  );
}

function ContactCard({ contact, headingId, onSelect, onRequestReview }: Readonly<{
  contact: ContactPortfolioItem;
  headingId: string;
  onSelect?: (contact: ContactPortfolioItem) => void;
  onRequestReview?: (contact: ContactPortfolioItem) => void;
}>) {
  const verification = VERIFICATION_META[contact.identity.verification];
  const freshness = EPISTEMIC_META[contact.freshness.state];
  const review = REVIEW_META[contact.review.status];
  const suppressed = contact.suppressionDisposition !== "clear";
  const canSelect = contact.actions.select === "available" && Boolean(onSelect);
  const canReview = contact.actions.review === "available" && contact.review.needed && Boolean(onRequestReview);

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-review-needed={contact.review.needed} data-suppression={contact.suppressionDisposition}>
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label capitalize">{words(contact.identity.kind)}</p>
            <h3 id={headingId} className="mt-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {contact.identity.displayName ?? "Unnamed contact candidate"}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>{contact.stableKey}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {contact.review.needed ? <Badge label="Review needed" symbol="!" tone="warning" /> : null}
            <Badge label={verification.label} symbol={verification.symbol} tone={verification.tone} />
            <Badge label={review.label} symbol={review.symbol} tone={review.tone} />
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-xl border p-3" aria-label="Role evidence" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Role evidence</p>
            {contact.roleHypothesis ? (
              <div className="mt-2" data-role-status="hypothesis">
                <Badge label="Explicit hypothesis" symbol="?" tone="warning" />
                <p className="mt-2 text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(contact.roleHypothesis.roleKey)}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{contact.roleHypothesis.statement}</p>
                <p className="mt-2 text-xs font-semibold" style={{ color: "var(--warning-text)" }}>
                  {contact.roleHypothesis.confidenceBasisPoints / 100}% confidence · not verified fact
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm" data-role-status="none" style={{ color: "var(--text-secondary)" }}>No role hypothesis supplied.</p>
            )}
          </section>

          <section className="rounded-xl border p-3" aria-label="Source and freshness" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Source and freshness</p>
            <p className="mt-2 break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{contact.source.connectorKey}</p>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{contact.source.sourceVersionId}</p>
            <div className="mt-3"><Badge label={`Freshness ${freshness.label.toLowerCase()}`} symbol={freshness.symbol} tone={freshness.tone} /></div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              Observed <time dateTime={contact.freshness.observedAt}>{formatTimestamp(contact.freshness.observedAt)} UTC</time>
              {" · "}expires <time dateTime={contact.freshness.expiresAt}>{formatTimestamp(contact.freshness.expiresAt)} UTC</time>
            </p>
          </section>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <GovernanceFact label="Source policy" value={contact.permittedUse.sourcePolicy} />
          <GovernanceFact label="Channel authorization" value={contact.permittedUse.channelAuthorization} />
          <GovernanceFact label="Consent signal" value={contact.permittedUse.consentSignal} />
        </dl>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Badge
            label={`Suppression: ${words(contact.suppressionDisposition)}`}
            symbol={suppressed ? "×" : "✓"}
            tone={suppressed ? "danger" : "success"}
          />
          <p className="break-all text-xs" style={{ color: "var(--text-tertiary)" }}>Version {contact.versionId}</p>
        </div>

        {canSelect || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canSelect ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onSelect?.(contact)}>
                Open governed contact
              </button>
            ) : null}
            {canReview ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onRequestReview?.(contact)}>
                Review contact
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function ContactPortfolioPanel(props: ContactPortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty" || props.contacts.length === 0) return <PortfolioState state="empty" />;
  if (props.contacts.some((contact) => contact.tenantId !== props.scope.tenantId || contact.workspaceId !== props.scope.workspaceId)) {
    return <PortfolioState state="error" error="The contact portfolio scope could not be verified." />;
  }

  const reviewCount = props.contacts.filter((contact) => contact.review.needed).length;

  return (
    <section className="space-y-4" data-surface="contact-portfolio-panel" aria-labelledby="contact-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Contacts · Governance overview</p>
            <h2 id="contact-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Contact portfolio</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical identity, role hypotheses, provenance, permitted-use state, and human-review needs in one list.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.contacts.length} {props.contacts.length === 1 ? "contact" : "contacts"} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"} needed
          </p>
        </div>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Governed contact portfolio">
        {props.contacts.map((contact, index) => (
          <ContactCard
            key={`${contact.tenantId}:${contact.workspaceId}:${contact.stableKey}:${contact.versionId}`}
            contact={contact}
            headingId={`contact-portfolio-item-${index}`}
            onSelect={props.onSelect}
            onRequestReview={props.onRequestReview}
          />
        ))}
      </ul>
    </section>
  );
}
