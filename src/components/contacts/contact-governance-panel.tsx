"use client";

import type { ContactRecord } from "@/lib/contacts/contact-record";

type ReadyProps = Readonly<{
  state: "ready";
  record: ContactRecord;
  asOf: string;
  onReview?: (record: ContactRecord) => void;
  onCorrect?: (record: ContactRecord) => void;
  error?: never;
}>;

export type ContactGovernancePanelProps =
  | Readonly<{ state: "loading"; record?: never; asOf?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; record?: never; asOf?: never }>
  | Readonly<{ state: "empty"; record?: never; asOf?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "muted";
type EpistemicState = ContactRecord["permittedUse"]["sourcePolicy"];

const TONE_STYLE: Readonly<Record<Tone, Readonly<{
  background: string;
  borderColor: string;
  color: string;
}>>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
});

const EPISTEMIC_META: Readonly<Record<EpistemicState, Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
}>>> = Object.freeze({
  KNOWN: { label: "Known", symbol: "✓", tone: "success" },
  UNKNOWN: { label: "Unknown", symbol: "?", tone: "warning" },
  CONFLICTED: { label: "Conflicted", symbol: "!", tone: "danger" },
  STALE: { label: "Stale", symbol: "⌛", tone: "danger" },
  NA: { label: "Not applicable", symbol: "—", tone: "muted" },
});

const USE_FIELDS = Object.freeze([
  ["sourcePolicy", "Source policy"],
  ["jurisdiction", "Jurisdiction"],
  ["attestation", "Attestation"],
  ["identity", "Identity"],
  ["channelAuthorization", "Channel authorization"],
  ["legalBasis", "Legal basis"],
  ["consentSignal", "Consent signal"],
] as const);

const REVIEW_META = Object.freeze({
  draft: { label: "Draft · human review required", symbol: "○", tone: "warning" as const },
  in_review: { label: "In human review", symbol: "…", tone: "warning" as const },
  approved: { label: "Human approved", symbol: "✓", tone: "success" as const },
  rejected: { label: "Human rejected", symbol: "×", tone: "danger" as const },
});

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function instant(value: string): number | null {
  if (!TIMESTAMP.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? epoch : null;
}

function formatTimestamp(value: string): string {
  const epoch = instant(value);
  if (epoch === null) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function StatePanel({
  state,
  message,
}: Readonly<{ state: "loading" | "error" | "empty"; message: string }>) {
  const loading = state === "loading";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      aria-labelledby={`contact-governance-${state}-title`}
      role={state === "error" ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
      data-contact-state={state}
    >
      <p className="section-label">Contacts · Governance</p>
      <h2 id={`contact-governance-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {loading ? "Loading governed contact" : state === "error" ? "Contact record unavailable" : "No governed contact selected"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function StateBadge({ label, symbol, tone, state }: Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
  state?: string;
}>) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      data-state={state}
      style={TONE_STYLE[tone]}
    >
      <span aria-hidden="true">{symbol}</span> {label}
    </span>
  );
}

function CurrentEligibility({ record, freshnessCurrent }: Readonly<{
  record: ContactRecord;
  freshnessCurrent: boolean;
}>) {
  const humanApproved = record.review.status === "approved";
  const clear = record.suppressionDisposition === "clear";
  const researchAllowed = humanApproved && clear && freshnessCurrent && record.review.eligibility.research === "allowed";
  const contactUseAllowed = humanApproved && clear && freshnessCurrent && record.review.eligibility.contactUse === "allowed";
  const derivedReasons = new Set<string>(record.review.eligibility.reasons);
  if (!humanApproved) derivedReasons.add("REVIEW_REQUIRED");
  if (!clear) derivedReasons.add("SUPPRESSED");
  if (!freshnessCurrent) derivedReasons.add("FRESHNESS_NOT_CURRENT");

  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-current-eligibility-title">
      <p className="section-label">Fail-closed decision</p>
      <h3 id="contact-current-eligibility-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        Current eligibility
      </h3>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {([
          ["Research", researchAllowed],
          ["Contact use", contactUseAllowed],
        ] as const).map(([label, allowed]) => (
          <div key={label} className="rounded-xl border p-3" data-eligibility={allowed ? "allowed" : "blocked"} style={TONE_STYLE[allowed ? "success" : "danger"]}>
            <dt className="text-xs font-semibold uppercase tracking-wide">{label}</dt>
            <dd className="mt-1 text-sm font-semibold"><span aria-hidden="true">{allowed ? "✓" : "×"}</span> {allowed ? "Allowed" : "Blocked"}</dd>
          </div>
        ))}
      </dl>
      {!researchAllowed || !contactUseAllowed ? (
        <div className="mt-3">
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Blocking reasons</p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Current eligibility blocking reasons">
            {[...derivedReasons].map((reason) => (
              <li key={reason} className="rounded-lg border px-2 py-1 text-xs" style={TONE_STYLE.warning}>{humanize(reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        This view re-checks freshness at the stated as-of time. It does not authorize an external action.
      </p>
    </section>
  );
}

export function ContactGovernancePanel(props: ContactGovernancePanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Checking source, freshness, policy, suppression, and human-review state." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") {
    return <StatePanel state="empty" message="Select a governed contact record to inspect its evidence and review history." />;
  }

  const { record } = props;
  const asOfEpoch = instant(props.asOf);
  const observedEpoch = instant(record.freshness.observedAt);
  const expiryEpoch = instant(record.freshness.expiresAt);
  const freshnessCurrent = record.freshness.state === "KNOWN" && asOfEpoch !== null && observedEpoch !== null
    && expiryEpoch !== null && asOfEpoch >= observedEpoch && asOfEpoch < expiryEpoch;
  const freshnessLabel = asOfEpoch === null || observedEpoch === null || expiryEpoch === null
    ? "Expiry unknown"
    : asOfEpoch < observedEpoch ? "Not yet observed at as-of time"
      : asOfEpoch >= expiryEpoch ? "Expired at as-of time" : record.freshness.state === "KNOWN" ? "Current at as-of time" : humanize(record.freshness.state);
  const freshnessTone: Tone = freshnessCurrent ? "success" : "danger";
  const review = REVIEW_META[record.review.status];
  const correctionLabel = record.revision === 1 ? "Original record" : `Correction revision ${record.revision}`;
  const actionsSafe = asOfEpoch !== null && observedEpoch !== null && expiryEpoch !== null;

  return (
    <section className="space-y-5" aria-labelledby="contact-governance-title" data-surface="contact-governance-panel" data-contact-state="ready">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Contacts · Governed record</p>
            <h2 id="contact-governance-title" className="mt-2 break-words text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {record.identity.displayName ?? "Unnamed contact candidate"}
            </h2>
            <p className="mt-2 text-sm capitalize" style={{ color: "var(--text-secondary)" }}>
              {humanize(record.identity.kind)} · {humanize(record.identity.contactPointClass)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <StateBadge label={review.label} symbol={review.symbol} tone={review.tone} state={`review-${record.review.status}`} />
            <StateBadge label={freshnessLabel} symbol={freshnessCurrent ? "✓" : "!"} tone={freshnessTone} state={freshnessCurrent ? "fresh" : "expired-or-unknown"} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-source-title">
            <p className="section-label">Provenance</p>
            <h3 id="contact-source-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Source and freshness</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                <dt className="section-label">Source connector</dt>
                <dd className="mt-2 break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{record.sourceReceipt.connectorKey}</dd>
                <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{record.sourceReceipt.sourceVersionId}</dd>
                <dd className="mt-1 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>Locator: {record.sourceReceipt.locator}</dd>
              </div>
              <div className="rounded-xl border p-3" data-freshness-state={freshnessCurrent ? "current" : "expired-or-unknown"} style={TONE_STYLE[freshnessTone]}>
                <dt className="text-xs font-semibold uppercase tracking-wide">Derived freshness</dt>
                <dd className="mt-2 text-sm font-semibold"><span aria-hidden="true">{freshnessCurrent ? "✓" : "!"}</span> {freshnessLabel}</dd>
                <dd className="mt-2 text-xs">Observed <time dateTime={record.freshness.observedAt}>{formatTimestamp(record.freshness.observedAt)} UTC</time></dd>
                <dd className="mt-1 text-xs">Expires <time dateTime={record.freshness.expiresAt}>{formatTimestamp(record.freshness.expiresAt)} UTC</time></dd>
                <dd className="mt-1 text-xs">As of <time dateTime={props.asOf}>{formatTimestamp(props.asOf)} UTC</time></dd>
              </div>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-permitted-use-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Policy basis</p>
                <h3 id="contact-permitted-use-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Permitted-use checks</h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{record.permittedUse.policyVersion} · {record.permittedUse.purpose}</p>
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {USE_FIELDS.map(([key, label]) => {
                const value = record.permittedUse[key];
                const meta = EPISTEMIC_META[value];
                return (
                  <div key={key} className="rounded-xl border p-3" data-policy-state={value} style={TONE_STYLE[meta.tone]}>
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wide">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold"><span aria-hidden="true">{meta.symbol}</span> {meta.label}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-history-title">
            <p className="section-label">Audit trail</p>
            <h3 id="contact-history-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Verification, review, and correction history</h3>
            <ol className="mt-4 space-y-3" aria-label="Contact governance history">
              <li className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>Verification · {humanize(record.identity.verification)}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{record.identity.contactPoint ?? "No contact point recorded"}</p>
              </li>
              <li className="rounded-xl border p-3" data-correction-revision={record.revision} style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{correctionLabel}</p>
                <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Current: {record.versionId}</p>
                {record.supersedesVersionId ? <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Corrects: {record.supersedesVersionId}</p> : null}
              </li>
              {record.review.events.map((event, index) => (
                <li key={`${event.at}:${event.to}`} className="rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                  <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>Human review · {humanize(event.from)} → {humanize(event.to)}</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                  <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
                    Step {index + 1} · {event.actor.actorId} · <time dateTime={event.at}>{formatTimestamp(event.at)} UTC</time>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Contact governance decisions">
          <CurrentEligibility record={record} freshnessCurrent={freshnessCurrent} />
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-suppression-title">
            <p className="section-label">Safety state</p>
            <h3 id="contact-suppression-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Suppression</h3>
            <div className="mt-3 rounded-xl border p-3" data-suppression={record.suppressionDisposition} style={TONE_STYLE[record.suppressionDisposition === "clear" ? "success" : "danger"]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{record.suppressionDisposition === "clear" ? "✓" : "×"}</span> {humanize(record.suppressionDisposition)}</p>
            </div>
          </section>
          {record.roleHypothesis ? (
            <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="contact-role-title">
              <p className="section-label">Explicit hypothesis</p>
              <h3 id="contact-role-title" className="mt-1 text-base font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{humanize(record.roleHypothesis.roleKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{record.roleHypothesis.statement}</p>
              <p className="mt-2 text-xs font-semibold" style={{ color: "var(--warning-text)" }}>Confidence {record.roleHypothesis.confidenceBasisPoints / 100}% · hypothesis, not fact</p>
            </section>
          ) : null}
        </aside>
      </div>

      {actionsSafe && (props.onReview || props.onCorrect) ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="contact-governance-actions-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="contact-governance-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Human governance actions</h3>
              <p id="contact-governance-actions-help" className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Actions apply only to this exact record version and do not perform external activity.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {props.onReview && (record.review.status === "draft" || record.review.status === "in_review") ? (
                <button type="button" className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="contact-governance-actions-help" onClick={() => props.onReview?.(record)}>
                  Open human review
                </button>
              ) : null}
              {props.onCorrect ? (
                <button type="button" className="btn-glass min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="contact-governance-actions-help" onClick={() => props.onCorrect?.(record)}>
                  Correct this version
                </button>
              ) : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
