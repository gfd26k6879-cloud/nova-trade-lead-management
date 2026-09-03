import type {
  OutcomeAttributionGroup,
  OutcomeAttributionReport,
} from "@/lib/outcomes/outcome-attribution";

type OutcomeReportPanelProps =
  | Readonly<{ state: "loading"; report?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; report?: never }>
  | Readonly<{ state: "ready"; report: OutcomeAttributionReport; error?: never }>;

type AttributionKind = "direct" | "assisted" | "unknown";

const ATTRIBUTION_META: Readonly<Record<AttributionKind, Readonly<{
  label: string;
  symbol: string;
  background: string;
  borderColor: string;
  color: string;
}>>> = Object.freeze({
  direct: {
    label: "Direct",
    symbol: "●",
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
    color: "var(--success-text)",
  },
  assisted: {
    label: "Assisted",
    symbol: "◆",
    background: "var(--accent-light)",
    borderColor: "var(--surface-info-border)",
    color: "var(--accent)",
  },
  unknown: {
    label: "Unknown",
    symbol: "?",
    background: "var(--status-muted-bg)",
    borderColor: "var(--status-muted-border)",
    color: "var(--status-muted-text)",
  },
});

function formatRate(basisPoints: number): string {
  const value = basisPoints / 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}%`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function AttributionCards({
  counts,
  ratesBasisPoints,
  compact = false,
}: Readonly<{
  counts: Readonly<{ direct: number; assisted: number; unknown: number }>;
  ratesBasisPoints: Readonly<{ direct: number; assisted: number; unknown: number }>;
  compact?: boolean;
}>) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(Object.keys(ATTRIBUTION_META) as AttributionKind[]).map((kind) => {
        const meta = ATTRIBUTION_META[kind];
        const count = counts[kind];
        const rate = formatRate(ratesBasisPoints[kind]);
        return (
          <div
            key={kind}
            data-attribution-kind={kind}
            className={`min-w-0 rounded-xl border ${compact ? "p-3" : "p-4"}`}
            style={{ background: meta.background, borderColor: meta.borderColor }}
            aria-label={`${meta.label} attribution: ${count} outcomes, ${rate}`}
          >
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: meta.color }}>
              <span aria-hidden="true">{meta.symbol}</span>
              {meta.label}
            </dt>
            <dd className="mt-2 flex items-baseline justify-between gap-3">
              <span className={compact ? "text-xl font-semibold" : "text-2xl font-semibold"} style={{ color: "var(--text-primary)" }}>
                {count}
              </span>
              <span className="text-xs font-semibold" style={{ color: meta.color }}>{rate}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function GroupCard({ group, index }: Readonly<{ group: OutcomeAttributionGroup; index: number }>) {
  const titleId = `outcome-group-${index}`;
  const sourceCount = group.sourceOutcomeRefs.length;
  return (
    <article className="glass min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby={titleId}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">Account</p>
          <h3 id={titleId} className="mt-1 break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {group.accountId}
          </h3>
        </div>
        <span
          className="self-start rounded-full border px-2.5 py-1 text-xs font-semibold"
          style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}
        >
          {sourceCount} current source {sourceCount === 1 ? "outcome" : "outcomes"}
        </span>
      </header>

      <dl className="mt-4 grid gap-2">
        <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <dt className="section-label">Play version</dt>
          <dd className="mt-1 break-all font-mono text-[0.72rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {group.playVersionId}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <dt className="section-label">Outreach version</dt>
          <dd className="mt-1 break-all font-mono text-[0.72rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {group.outreachVersionId ?? "No outreach version linked"}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <AttributionCards counts={group.counts} ratesBasisPoints={group.ratesBasisPoints} compact />
      </div>

      <details className="mt-4 rounded-xl border" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer px-3 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Source outcome versions
        </summary>
        <ul
          className="space-y-2 border-t px-3 py-3"
          style={{ borderColor: "var(--surface-card-border)" }}
          aria-label={`Source outcome versions for account ${group.accountId}`}
        >
          {group.sourceOutcomeRefs.map((source) => (
            <li key={source.versionId} className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--table-row-border)" }}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="break-words text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {source.stableKey} · {source.outcome.replaceAll("_", " ")}
                </span>
                <span className="text-xs capitalize" style={{ color: ATTRIBUTION_META[source.attributionKind].color }}>
                  {ATTRIBUTION_META[source.attributionKind].symbol} {source.attributionKind}
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{source.versionId}</p>
              <time className="mt-1 block text-xs" dateTime={source.occurredAt} style={{ color: "var(--text-tertiary)" }}>
                Occurred {formatTimestamp(source.occurredAt)}
              </time>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function StatePanel({ state, message }: Readonly<{ state: "loading" | "error"; message: string }>) {
  const isLoading = state === "loading";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      aria-labelledby={`outcome-report-${state}-title`}
      role={isLoading ? "status" : "alert"}
      aria-busy={isLoading ? true : undefined}
      data-report-state={state}
    >
      <p className="section-label">Outcomes · Attribution</p>
      <h2 id={`outcome-report-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {isLoading ? "Loading outcome attribution report" : "Outcome report unavailable"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

export function OutcomeReportPanel(props: OutcomeReportPanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Preparing correction-aware counts for the selected as-of window." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;

  const { report } = props;
  return (
    <section className="space-y-5" aria-labelledby="outcome-report-title" data-report-state={report.groups.length ? "ready" : "empty"}>
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Outcomes · As-of report</p>
            <h2 id="outcome-report-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Outcome attribution
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Direct, assisted, and unknown attribution remain separate so uncertainty is visible instead of averaged away.
            </p>
          </div>
          <div className="rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Latest corrections only</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Superseded outcome versions are not double-counted.
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Window start</dt>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-primary)" }}><time dateTime={report.window.from}>{formatTimestamp(report.window.from)}</time></dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Window end</dt>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-primary)" }}><time dateTime={report.window.to}>{formatTimestamp(report.window.to)}</time></dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Report as of</dt>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-primary)" }}><time dateTime={report.window.asOf}>{formatTimestamp(report.window.asOf)}</time></dd>
          </div>
        </dl>
      </header>

      {report.groups.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center" role="status">
          <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>No outcomes fall inside this as-of window</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            The report is valid and contains no current outcome versions for the selected period.
          </p>
        </div>
      ) : (
        <>
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outcome-summary-title">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Current outcome versions</p>
                <h3 id="outcome-summary-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  {report.summary.total} attributed outcomes
                </h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{report.groups.length} grouped lineage {report.groups.length === 1 ? "set" : "sets"}</p>
            </div>
            <AttributionCards counts={report.summary} ratesBasisPoints={report.summary.ratesBasisPoints} />
          </section>

          <section aria-labelledby="outcome-groups-title">
            <h3 id="outcome-groups-title" className="sr-only">Attribution groups</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              {report.groups.map((group, index) => (
                <GroupCard
                  key={`${group.accountId}:${group.playVersionId}:${group.outreachVersionId ?? "unlinked"}`}
                  group={group}
                  index={index}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
