import type {
  BuyingCenter,
  BuyingCenterHypothesis,
  BuyingCenterReview,
} from "@/lib/contacts/buying-center";

export type BuyingCenterPanelProps =
  | Readonly<{ state: "loading"; center?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; center?: never }>
  | Readonly<{ state: "empty"; center?: never; error?: never }>
  | Readonly<{ state: "ready"; center: BuyingCenter; error?: never }>;

const REVIEW_META: Readonly<Record<BuyingCenterReview["status"], Readonly<{
  label: string;
  detail: string;
  symbol: string;
  background: string;
  borderColor: string;
  color: string;
}>>> = Object.freeze({
  draft: {
    label: "Draft map",
    detail: "Human review has not started.",
    symbol: "○",
    background: "var(--status-muted-bg)",
    borderColor: "var(--status-muted-border)",
    color: "var(--status-muted-text)",
  },
  in_review: {
    label: "Human review in progress",
    detail: "A reviewer is evaluating the map and its evidence.",
    symbol: "◐",
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },
  approved: {
    label: "Human-reviewed map",
    detail: "The map was approved; every role still remains a hypothesis.",
    symbol: "✓",
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
    color: "var(--success-text)",
  },
  rejected: {
    label: "Map rejected",
    detail: "Do not rely on this version without correction and a new review.",
    symbol: "×",
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
    color: "var(--danger-text)",
  },
});

const INFLUENCE_LABEL: Readonly<Record<BuyingCenterHypothesis["influence"], string>> = Object.freeze({
  unknown: "Influence unknown",
  low: "Low influence estimate",
  medium: "Medium influence estimate",
  high: "High influence estimate",
});

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatConfidence(basisPoints: number): string {
  const percentage = basisPoints / 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2)}%`;
}

function PanelState({
  state,
  message,
}: Readonly<{ state: "loading" | "error" | "empty"; message: string }>) {
  const loading = state === "loading";
  const title = state === "loading"
    ? "Loading buying-center hypotheses"
    : state === "error"
      ? "Buying-center map unavailable"
      : "No buying-center map yet";

  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-buying-center-state={state}
      role={state === "error" ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
      aria-labelledby={`buying-center-${state}-title`}
    >
      <p className="section-label">Buying center · Hypothesis map</p>
      <h2 id={`buying-center-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {message}
      </p>
    </section>
  );
}

function EvidenceList({ hypothesis }: Readonly<{ hypothesis: BuyingCenterHypothesis }>) {
  return (
    <details className="rounded-xl border" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {hypothesis.evidenceRefs.length} evidence {hypothesis.evidenceRefs.length === 1 ? "reference" : "references"}
      </summary>
      <ul
        className="space-y-2 border-t px-3 py-3"
        style={{ borderColor: "var(--surface-card-border)" }}
        aria-label={`Evidence for ${hypothesis.roleLabel} hypothesis`}
      >
        {hypothesis.evidenceRefs.map((evidence) => (
          <li key={evidence.evidenceRefHash} className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--table-row-border)" }}>
            <p className="break-words text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{evidence.evidenceId}</p>
            <p className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Version: {evidence.evidenceVersionId}
            </p>
            <time className="mt-1 block text-xs" dateTime={evidence.observedAt} style={{ color: "var(--text-tertiary)" }}>
              Observed {formatTimestamp(evidence.observedAt)}
            </time>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ContactAttestation({ hypothesis }: Readonly<{ hypothesis: BuyingCenterHypothesis }>) {
  const contact = hypothesis.contactVersionRef;
  if (!contact) {
    return (
      <div
        className="rounded-xl border p-3"
        data-contact-state="unlinked"
        style={{ background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)" }}
      >
        <p className="text-xs font-semibold" style={{ color: "var(--status-muted-text)" }}>
          <span aria-hidden="true">○</span> No human-attested contact linked
        </p>
      </div>
    );
  }

  return (
    <details
      className="rounded-xl border"
      data-contact-state="human-attested"
      style={{ background: "var(--success-bg)", borderColor: "var(--success-border)" }}
    >
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--success-text)" }}>
        <span aria-hidden="true">✓</span> Human-attested contact version
      </summary>
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--success-border)" }}>
        <p className="break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {contact.contactVersionId}
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {contact.verification.reason}
        </p>
        <p className="mt-2 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>
          Human reviewer {contact.verification.actorId}
        </p>
        <time className="mt-1 block text-xs" dateTime={contact.verification.at} style={{ color: "var(--text-tertiary)" }}>
          Attested {formatTimestamp(contact.verification.at)}
        </time>
      </div>
    </details>
  );
}

function HypothesisCard({ hypothesis, index }: Readonly<{ hypothesis: BuyingCenterHypothesis; index: number }>) {
  const titleId = `buying-center-role-${index}-title`;
  return (
    <article
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-hypothesis-status={hypothesis.status}
      aria-labelledby={titleId}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">Priority {hypothesis.priority} · Role hypothesis</p>
          <h3 id={titleId} className="mt-1 break-words text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {hypothesis.roleLabel}
          </h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {hypothesis.responsibility}
          </p>
        </div>
        <span
          className="shrink-0 self-start rounded-full border px-2.5 py-1 text-xs font-semibold"
          aria-label="Status: Hypothesis, not a confirmed role"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}
        >
          ? Hypothesis
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <dt className="section-label">Estimated influence</dt>
          <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {INFLUENCE_LABEL[hypothesis.influence]}
          </dd>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <dt className="section-label">Evidence support confidence</dt>
          <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {formatConfidence(hypothesis.confidenceBasisPoints)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 rounded-xl border p-3" data-state="STATE-UNKNOWN" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--warning-text)" }}>
          Uncertainty
        </p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{hypothesis.uncertainty}</p>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <EvidenceList hypothesis={hypothesis} />
        <ContactAttestation hypothesis={hypothesis} />
      </div>
    </article>
  );
}

function ReviewTrail({ review }: Readonly<{ review: BuyingCenterReview }>) {
  return (
    <details className="glass rounded-2xl" data-review-event-count={review.events.length}>
      <summary className="min-h-11 cursor-pointer px-4 py-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Human review trail · {review.events.length} {review.events.length === 1 ? "decision" : "decisions"}
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--surface-card-border)" }}>
        {review.events.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No human review decisions have been recorded.</p>
        ) : (
          <ol className="space-y-3" aria-label="Human buying-center review decisions">
            {review.events.map((event, index) => (
              <li key={`${event.at}:${event.actor.actorId}:${index}`} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--table-row-border)" }}>
                <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
                  {event.from.replaceAll("_", " ")} → {event.to.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                <p className="mt-2 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>Human reviewer {event.actor.actorId}</p>
                <time className="mt-1 block text-xs" dateTime={event.at} style={{ color: "var(--text-tertiary)" }}>
                  {formatTimestamp(event.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

export function BuyingCenterPanel(props: BuyingCenterPanelProps) {
  if (props.state === "loading") {
    return <PanelState state="loading" message="Preparing the current evidence-backed role hypotheses." />;
  }
  if (props.state === "error") return <PanelState state="error" message={props.error} />;
  if (props.state === "empty") {
    return <PanelState state="empty" message="Create an evidence-backed map before reviewing possible buying roles." />;
  }

  const { center } = props;
  const reviewMeta = REVIEW_META[center.review.status];
  const linkedContacts = center.hypotheses.filter((hypothesis) => hypothesis.contactVersionRef !== null).length;

  return (
    <section className="space-y-5" aria-labelledby="buying-center-title" data-buying-center-state="ready">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Buying center · Current version</p>
            <h2 id="buying-center-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Role hypotheses
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              This map is a working interpretation of evidence. Review status does not turn a possible role or person into a confirmed fact.
            </p>
          </div>
          <div
            className="max-w-full rounded-xl border px-3 py-2"
            data-review-status={center.review.status}
            aria-label={`Map review status: ${reviewMeta.label}`}
            style={{ background: reviewMeta.background, borderColor: reviewMeta.borderColor, color: reviewMeta.color }}
          >
            <p className="text-sm font-semibold"><span aria-hidden="true">{reviewMeta.symbol}</span> {reviewMeta.label}</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed">{reviewMeta.detail}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Role hypotheses</dt>
            <dd className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{center.hypotheses.length}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Human-attested contacts</dt>
            <dd className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{linkedContacts}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Map revision</dt>
            <dd className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{center.revision}</dd>
          </div>
        </dl>

        <details className="mt-3 rounded-xl border" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            Exact map lineage
          </summary>
          <dl className="grid gap-3 border-t px-3 py-3 sm:grid-cols-2" style={{ borderColor: "var(--surface-card-border)" }}>
            <div className="min-w-0">
              <dt className="section-label">Map version</dt>
              <dd className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{center.versionId}</dd>
            </div>
            <div className="min-w-0">
              <dt className="section-label">Lead-play version</dt>
              <dd className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{center.playVersionId}</dd>
            </div>
          </dl>
        </details>
      </header>

      <section aria-labelledby="buying-center-roles-title">
        <h3 id="buying-center-roles-title" className="sr-only">Buying-center role hypotheses</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {center.hypotheses.map((hypothesis, index) => (
            <HypothesisCard key={hypothesis.hypothesisKey} hypothesis={hypothesis} index={index} />
          ))}
        </div>
      </section>

      <ReviewTrail review={center.review} />
    </section>
  );
}
