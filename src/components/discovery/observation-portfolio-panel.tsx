"use client";

import { AsyncState } from "@/components/async-state";

export type DiscoveryObservationSummary = Readonly<{
  observationId: string;
  tenantId: string;
  workspaceId: string | null;
  sourceCardId: string;
  sourceCardVersion: number;
  observedAt: string;
  freshness: "current" | "stale" | "expired" | "unknown";
  freshnessEvaluatedAt: string | null;
  accountBinding: Readonly<{
    state: "resolved" | "candidate" | "ambiguous" | "unresolved";
    accountId: string | null;
    resolutionId: string | null;
    reviewRequired: boolean;
  }>;
  permittedFields: readonly string[];
  evidenceReceipt: Readonly<{
    receiptId: string;
    receiptHash: string;
    receivedAt: string;
  }>;
}>;

type ScopedProps = Readonly<{
  tenantId: string;
  workspaceId: string | null;
}>;

type ReadyProps = ScopedProps & Readonly<{
  state: "ready";
  observations: readonly DiscoveryObservationSummary[];
  onOpenObservation?: (observation: DiscoveryObservationSummary) => void;
  onReviewObservation?: (observation: DiscoveryObservationSummary) => void;
  error?: never;
}>;

export type ObservationPortfolioPanelProps =
  | Readonly<{
    state: "loading";
    tenantId?: never;
    workspaceId?: never;
    observations?: never;
    error?: never;
    onOpenObservation?: never;
    onReviewObservation?: never;
  }>
  | Readonly<{
    state: "error";
    tenantId?: never;
    workspaceId?: never;
    observations?: never;
    error: string;
    onOpenObservation?: never;
    onReviewObservation?: never;
  }>
  | (ScopedProps & Readonly<{
    state: "empty";
    observations?: never;
    error?: never;
    onOpenObservation?: never;
    onReviewObservation?: never;
  }>)
  | ReadyProps;

const FRESHNESS_META = {
  current: {
    label: "Current",
    symbol: "✓",
    style: {
      background: "var(--success-bg)",
      borderColor: "var(--success-border)",
      color: "var(--success-text)",
    },
  },
  stale: {
    label: "Stale",
    symbol: "!",
    style: {
      background: "var(--warning-bg)",
      borderColor: "var(--warning-border)",
      color: "var(--warning-text)",
    },
  },
  expired: {
    label: "Expired",
    symbol: "×",
    style: {
      background: "var(--danger-bg)",
      borderColor: "var(--danger-border)",
      color: "var(--danger-text)",
    },
  },
  unknown: {
    label: "Unknown freshness",
    symbol: "?",
    style: {
      background: "var(--status-muted-bg)",
      borderColor: "var(--status-muted-border)",
      color: "var(--status-muted-text)",
    },
  },
} as const;

const RESOLUTION_META = {
  resolved: {
    label: "Canonical account linked",
    detail: "This observation is bound to a resolved tenant account.",
  },
  candidate: {
    label: "Canonical candidate",
    detail: "A candidate exists, but it has not become a canonical account.",
  },
  ambiguous: {
    label: "Ambiguous identity",
    detail: "More than one account interpretation remains possible.",
  },
  unresolved: {
    label: "Not yet resolved",
    detail: "No canonical account binding has been selected.",
  },
} as const;

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function ScopeSummary({ tenantId, workspaceId }: ScopedProps) {
  return (
    <dl className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="Observation portfolio scope">
      <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
        <dt className="section-label">Tenant scope</dt>
        <dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{tenantId}</dd>
      </div>
      <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
        <dt className="section-label">Workspace scope</dt>
        <dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{workspaceId ?? "Tenant-wide"}</dd>
      </div>
    </dl>
  );
}

function portfolioMatchesScope({ tenantId, workspaceId, observations }: ReadyProps): boolean {
  const observationIds = new Set<string>();
  for (const observation of observations) {
    if (observation.tenantId !== tenantId || observation.workspaceId !== workspaceId
      || observationIds.has(observation.observationId)) return false;
    observationIds.add(observation.observationId);
  }
  return true;
}

function ObservationCard({
  observation,
  onOpenObservation,
  onReviewObservation,
}: Readonly<{
  observation: DiscoveryObservationSummary;
  onOpenObservation?: (observation: DiscoveryObservationSummary) => void;
  onReviewObservation?: (observation: DiscoveryObservationSummary) => void;
}>) {
  const freshness = FRESHNESS_META[observation.freshness];
  const resolution = RESOLUTION_META[observation.accountBinding.state];
  const titleId = `source-observation-${observation.observationId.replace(/[^A-Za-z0-9_-]/gu, "-")}-title`;
  const canReview = observation.accountBinding.reviewRequired
    && observation.accountBinding.state !== "resolved"
    && Boolean(onReviewObservation);
  const canOpen = Boolean(onOpenObservation);

  return (
    <article
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      aria-labelledby={titleId}
      data-observation-state={observation.accountBinding.state}
      data-review-required={observation.accountBinding.reviewRequired}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">{observation.sourceCardId} · source card v{observation.sourceCardVersion}</p>
          <h3 id={titleId} className="mt-1 break-all text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {observation.observationId}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Observed <time dateTime={observation.observedAt}>{formatTimestamp(observation.observedAt)} UTC</time>
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
          aria-label={`Freshness: ${freshness.label}`}
          style={freshness.style}
        >
          <span aria-hidden="true">{freshness.symbol}</span> {freshness.label}
        </span>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-xl border p-3" aria-label="Account resolution" style={{ borderColor: "var(--surface-card-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="section-label">Account binding</p>
            {observation.accountBinding.reviewRequired ? (
              <span className="rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                Review needed
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{resolution.label}</p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{resolution.detail}</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt style={{ color: "var(--text-tertiary)" }}>Canonical account</dt>
              <dd className="mt-0.5 break-all font-mono" style={{ color: "var(--text-primary)" }}>{observation.accountBinding.accountId ?? "No account selected"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-tertiary)" }}>Resolution record</dt>
              <dd className="mt-0.5 break-all font-mono" style={{ color: "var(--text-primary)" }}>{observation.accountBinding.resolutionId ?? "Not available"}</dd>
            </div>
          </dl>
        </section>

        <section className="min-w-0 rounded-xl border p-3" aria-label="Permitted observation evidence" style={{ borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Permitted normalized fields</p>
          {observation.permittedFields.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Permitted field names">
              {observation.permittedFields.map((field) => (
                <li key={field} className="max-w-full break-all rounded-lg border px-2 py-1 font-mono text-[0.68rem]" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
                  {field}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No permitted normalized fields are present.</p>
          )}
          <dl className="mt-3 space-y-2 border-t pt-3 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>
            <div>
              <dt style={{ color: "var(--text-tertiary)" }}>Evidence receipt</dt>
              <dd className="mt-0.5 break-all font-mono" style={{ color: "var(--text-primary)" }}>{observation.evidenceReceipt.receiptId}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-tertiary)" }}>Receipt hash</dt>
              <dd className="mt-0.5 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{observation.evidenceReceipt.receiptHash}</dd>
            </div>
          </dl>
        </section>
      </div>

      <footer className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--surface-card-border)" }}>
        <div className="min-w-0 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          <p>Receipt recorded <time dateTime={observation.evidenceReceipt.receivedAt}>{formatTimestamp(observation.evidenceReceipt.receivedAt)} UTC</time></p>
          <p>
            Freshness {observation.freshnessEvaluatedAt
              ? <>evaluated <time dateTime={observation.freshnessEvaluatedAt}>{formatTimestamp(observation.freshnessEvaluatedAt)} UTC</time></>
              : "has not been evaluated"}.
          </p>
        </div>
        {canOpen || canReview ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            {canOpen ? (
              <button
                type="button"
                className="btn-secondary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                data-observation-action="open"
                onClick={() => onOpenObservation?.(observation)}
              >
                Open observation
              </button>
            ) : null}
            {canReview ? (
              <button
                type="button"
                className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                data-observation-action="review"
                onClick={() => onReviewObservation?.(observation)}
              >
                Review account identity
              </button>
            ) : null}
          </div>
        ) : null}
      </footer>
    </article>
  );
}

function ReadyPortfolio(props: ReadyProps) {
  if (props.observations.length === 0) {
    return (
      <div data-observation-portfolio-state="empty">
        <AsyncState variant="empty" title="No source observations yet" description="Complete a bounded discovery page before inspecting its normalized evidence receipts." />
      </div>
    );
  }

  if (!portfolioMatchesScope(props)) {
    return (
      <section data-observation-portfolio-state="invalid" role="alert" className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}>
        <h2 className="text-base font-semibold" style={{ color: "var(--danger-text)" }}>Observation portfolio withheld</h2>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>An observation is duplicated or does not match the exact tenant and workspace scope. No record actions are available.</p>
      </section>
    );
  }

  const reviewCount = props.observations.filter((observation) => observation.accountBinding.reviewRequired).length;
  const resolvedCount = props.observations.filter((observation) => observation.accountBinding.state === "resolved").length;
  const currentCount = props.observations.filter((observation) => observation.freshness === "current").length;

  return (
    <section className="space-y-5" data-surface="observation-portfolio-panel" data-observation-portfolio-state="ready" aria-labelledby="observation-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Discovery · Source evidence</p>
            <h2 id="observation-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Source observation portfolio</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Inspect normalized, permitted evidence and its account-resolution state. Raw provider payloads are not shown here.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border px-4 py-3" aria-label={`${reviewCount} observations require review`} style={{ background: reviewCount ? "var(--warning-bg)" : "var(--success-bg)", borderColor: reviewCount ? "var(--warning-border)" : "var(--success-border)", color: reviewCount ? "var(--warning-text)" : "var(--success-text)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide">Identity review</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{reviewCount ? `${reviewCount} need review` : "No review queued"}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ["Observations", props.observations.length],
            ["Canonical links", resolvedCount],
            ["Current evidence", currentCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
              <dt className="section-label">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--surface-card-border)" }}>
          <ScopeSummary tenantId={props.tenantId} workspaceId={props.workspaceId} />
        </div>
      </header>

      <section aria-labelledby="observation-list-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Normalized evidence</p>
            <h3 id="observation-list-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Observation receipts</h3>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{props.observations.length} scoped {props.observations.length === 1 ? "record" : "records"}</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {props.observations.map((observation) => (
            <ObservationCard
              key={observation.observationId}
              observation={observation}
              onOpenObservation={props.onOpenObservation}
              onReviewObservation={props.onReviewObservation}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

export function ObservationPortfolioPanel(props: ObservationPortfolioPanelProps) {
  if (props.state === "loading") {
    return (
      <div data-observation-portfolio-state="loading">
        <AsyncState variant="loading" title="Loading source observations" description="Retrieving scoped normalized evidence, freshness, account bindings, and receipts." />
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div data-observation-portfolio-state="error">
        <AsyncState variant="error" title="Source observations unavailable" description={props.error} />
      </div>
    );
  }
  if (props.state === "empty") {
    return (
      <div data-observation-portfolio-state="empty">
        <AsyncState
          variant="empty"
          title="No source observations yet"
          description={`No normalized evidence receipts exist in tenant ${props.tenantId} for ${props.workspaceId ?? "the tenant-wide scope"}.`}
        />
      </div>
    );
  }
  return <ReadyPortfolio {...props} />;
}
