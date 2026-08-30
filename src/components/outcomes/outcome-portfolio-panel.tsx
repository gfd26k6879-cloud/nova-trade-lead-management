"use client";

import { AsyncState } from "@/components/async-state";
import type { OutcomeAttribution, OutcomeRecord, OutcomeTaxonomy } from "@/lib/outcomes/outcome-record";

type OutcomeChannel = OutcomeRecord["channel"];
type AttributionKind = OutcomeAttribution["kind"];

export type OutcomePortfolioAction = "open" | "correct";

export type OutcomePortfolioItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  stableKey: string;
  versionId: string;
  account: Readonly<{ accountId: string; displayName: string }>;
  play: Readonly<{ versionId: string; displayName: string }>;
  outreach: Readonly<{ versionId: string; subject: string }> | null;
  outcome: OutcomeTaxonomy;
  channel: OutcomeChannel;
  occurredAt: string;
  recordedAt: string;
  revision: number;
  attributionKind: AttributionKind;
  correctionNeeded: boolean;
  eligibleActions: readonly OutcomePortfolioAction[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  outcomes: readonly OutcomePortfolioItem[];
  onOpen?: (outcome: OutcomePortfolioItem) => void;
  onCorrect?: (outcome: OutcomePortfolioItem) => void;
  error?: never;
}>;

export type OutcomePortfolioPanelProps =
  | Readonly<{ state: "loading"; scope?: never; outcomes?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; outcomes?: never }>
  | Readonly<{ state: "empty"; scope?: never; outcomes?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "accent" | "neutral";

const TONE_STYLE: Readonly<Record<Tone, React.CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
});

const ATTRIBUTION_META: Readonly<Record<AttributionKind, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  direct: { label: "Direct attribution", symbol: "●", tone: "success" },
  assisted: { label: "Assisted attribution", symbol: "◆", tone: "accent" },
  unknown: { label: "Unknown attribution", symbol: "?", tone: "neutral" },
});

function words(value: string): string {
  return value.replaceAll("_", " ");
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
    return <AsyncState variant="loading" title="Loading outcome history" description="Retrieving current canonical outcome summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Outcome history unavailable" description={error ?? "The outcome portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No outcomes recorded yet" description="Governed outcomes will appear here after a human records them." />;
}

function Binding({ label, name, value }: Readonly<{ label: string; name: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</dd>
      <dd className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{value}</dd>
    </div>
  );
}

function OutcomeCard({
  item,
  headingId,
  onOpen,
  onCorrect,
}: Readonly<{
  item: OutcomePortfolioItem;
  headingId: string;
  onOpen?: (outcome: OutcomePortfolioItem) => void;
  onCorrect?: (outcome: OutcomePortfolioItem) => void;
}>) {
  const supplied = new Set(item.eligibleActions);
  const canOpen = supplied.has("open") && Boolean(onOpen);
  const canCorrect = item.correctionNeeded && supplied.has("correct") && Boolean(onCorrect);
  const attribution = ATTRIBUTION_META[item.attributionKind];

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-correction-needed={item.correctionNeeded}>
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Current outcome</p>
            <h3 id={headingId} className="mt-1 break-words text-lg font-semibold capitalize leading-snug" style={{ color: "var(--text-primary)" }}>
              {words(item.outcome)}
            </h3>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{item.versionId}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Badge label={`Revision ${item.revision}`} symbol="↻" tone="neutral" />
            <Badge
              label={item.correctionNeeded ? "Correction needed" : "Current record"}
              symbol={item.correctionNeeded ? "!" : "✓"}
              tone={item.correctionNeeded ? "warning" : "success"}
            />
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Binding label="Account" name={item.account.displayName} value={item.account.accountId} />
          <Binding label="Lead play" name={item.play.displayName} value={item.play.versionId} />
          <Binding
            label="Outreach version"
            name={item.outreach?.subject ?? "No outreach linked"}
            value={item.outreach?.versionId ?? "Direct observation without an outreach version"}
          />
        </dl>

        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Channel</dt>
            <dd className="mt-2 text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(item.channel)}</dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Attribution</dt>
            <dd className="mt-2"><Badge label={attribution.label} symbol={attribution.symbol} tone={attribution.tone} /></dd>
          </div>
          <div className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Outcome timing</dt>
            <dd className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
              Occurred <time dateTime={item.occurredAt}>{formatTimestamp(item.occurredAt)} UTC</time>
            </dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Recorded <time dateTime={item.recordedAt}>{formatTimestamp(item.recordedAt)} UTC</time>
            </dd>
          </div>
        </dl>

        <p className="mt-3 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
          Outcome key · {item.stableKey}
        </p>

        {canOpen || canCorrect ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? (
              <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(item)}>
                Open outcome
              </button>
            ) : null}
            {canCorrect ? (
              <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onCorrect?.(item)}>
                Correct outcome
              </button>
            ) : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function OutcomePortfolioPanel(props: OutcomePortfolioPanelProps) {
  if (props.state === "loading") return <PortfolioState state="loading" />;
  if (props.state === "error") return <PortfolioState state="error" error={props.error} />;
  if (props.state === "empty" || props.outcomes.length === 0) return <PortfolioState state="empty" />;
  if (props.outcomes.some((outcome) => (
    outcome.tenantId !== props.scope.tenantId || outcome.workspaceId !== props.scope.workspaceId
  ))) {
    return <PortfolioState state="error" error="The outcome portfolio scope could not be verified." />;
  }

  const correctionCount = props.outcomes.filter((outcome) => outcome.correctionNeeded).length;

  return (
    <section className="space-y-4" data-surface="outcome-portfolio-panel" aria-labelledby="outcome-portfolio-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-label">Outcomes · Current history</p>
            <h2 id="outcome-portfolio-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Outcome portfolio
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Current canonical outcome versions with their exact account, play, outreach, and attribution bindings.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: correctionCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>
            {props.outcomes.length} {props.outcomes.length === 1 ? "outcome" : "outcomes"} · {correctionCount} need correction
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Exact outcome portfolio scope">
          <Binding label="Tenant scope" name="Tenant" value={props.scope.tenantId} />
          <Binding label="Workspace scope" name="Workspace" value={props.scope.workspaceId} />
        </dl>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Current canonical outcome history">
        {props.outcomes.map((outcome, index) => (
          <OutcomeCard
            key={`${outcome.tenantId}:${outcome.workspaceId}:${outcome.stableKey}:${outcome.versionId}`}
            item={outcome}
            headingId={`outcome-portfolio-item-${index}`}
            onOpen={props.onOpen}
            onCorrect={props.onCorrect}
          />
        ))}
      </ul>
    </section>
  );
}
