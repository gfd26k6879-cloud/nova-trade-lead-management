"use client";

import type { CSSProperties, ReactNode } from "react";

import type {
  AccountMergeEvent,
  AccountMergeMember,
} from "@/lib/discovery/account-resolution";

export type AccountUnmergeRequest = Readonly<{
  currentBinding: AccountMergeMember;
  governingMergeEvent: AccountMergeEvent;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  tenantId: string;
  workspaceId: string;
  currentBinding: AccountMergeMember;
  events: readonly AccountMergeEvent[];
  /** Final decision supplied by the canonical authorization boundary. */
  unmergeAuthorized: boolean;
  onRequestUnmerge?: (request: AccountUnmergeRequest) => void;
  error?: never;
}>;

export type AccountMergeHistoryPanelProps =
  | Readonly<{ state: "loading"; error?: never }>
  | Readonly<{ state: "error"; error: string }>
  | Readonly<{ state: "empty"; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "muted" | "accent";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
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

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty" | "invalid";
  message: string;
}>) {
  const loading = state === "loading";
  const alert = state === "error" || state === "invalid";
  const title = loading
    ? "Loading merge history"
    : state === "empty"
      ? "No merge history selected"
      : "Merge history unavailable";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-account-merge-history-state={state}
      role={alert ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
      aria-labelledby={`account-merge-history-${state}-title`}
    >
      <p className="section-label">Account identity · Merge history</p>
      <h2 id={`account-merge-history-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function Fact({ label, children, breakAll = false }: Readonly<{
  label: string;
  children: ReactNode;
  breakAll?: boolean;
}>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold leading-relaxed ${breakAll ? "break-all font-mono text-xs" : "break-words"}`} style={{ color: "var(--text-primary)" }}>
        {children}
      </dd>
    </div>
  );
}

function scopedHistory(props: ReadyProps): readonly AccountMergeEvent[] | null {
  const seen = new Set<string>();
  let prior = -Infinity;
  const history: AccountMergeEvent[] = [];
  for (const event of props.events) {
    const at = instant(event.at);
    if (event.tenantId !== props.tenantId || event.workspaceId !== props.workspaceId
      || event.actor.kind !== "human" || at === null || at <= prior || seen.has(event.eventId)
      || !event.evidenceObservationIds.length
      || (event.survivorAccountId !== props.currentBinding.accountId
        && event.retiredAccountId !== props.currentBinding.accountId)) return null;
    prior = at;
    seen.add(event.eventId);
    history.push(event);
  }
  return history;
}

function currentMerge(props: ReadyProps, history: readonly AccountMergeEvent[]): AccountMergeEvent | null {
  if (props.currentBinding.status !== "merged" || !props.currentBinding.redirectToAccountId) return null;
  const latestPairEvent = [...history].reverse().find((event) => (
    event.survivorAccountId === props.currentBinding.redirectToAccountId
      && event.retiredAccountId === props.currentBinding.accountId
  ));
  return latestPairEvent?.action === "merge" ? latestPairEvent : null;
}

function eventStatus(event: AccountMergeEvent, governingMerge: AccountMergeEvent | null): Readonly<{
  label: string;
  tone: Tone;
}> {
  if (event.eventId === governingMerge?.eventId) return { label: "Current relationship", tone: "warning" };
  if (event.action === "unmerge") return { label: "Reversed", tone: "success" };
  return { label: "Historical", tone: "muted" };
}

function EventCard({ event, governingMerge }: Readonly<{
  event: AccountMergeEvent;
  governingMerge: AccountMergeEvent | null;
}>) {
  const status = eventStatus(event, governingMerge);
  return (
    <li className="min-w-0 rounded-xl border p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {event.action === "merge" ? "Account merged" : "Merge reversed"}
          </p>
          <p className="mt-1 break-all text-xs" style={{ color: "var(--text-secondary)" }}>
            {event.retiredAccountId} → {event.survivorAccountId}
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[status.tone]}>
          {status.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{event.reason}</p>
      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Fact label="Human actor" breakAll>{event.actor.actorId}</Fact>
        <Fact label="Recorded at">
          <time dateTime={event.at}>{formatTimestamp(event.at)} UTC</time>
        </Fact>
      </dl>
      <div className="mt-2 min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)" }}>
        <p className="section-label">Exact evidence</p>
        <ul className="mt-2 space-y-1" aria-label={`Evidence for ${event.eventId}`}>
          {event.evidenceObservationIds.map((evidenceId) => (
            <li key={evidenceId} className="break-all font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{evidenceId}</li>
          ))}
        </ul>
      </div>
      <p className="mt-3 break-all font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>Event: {event.eventId}</p>
    </li>
  );
}

export function AccountMergeHistoryPanel(props: AccountMergeHistoryPanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Reading the current canonical account binding and immutable identity events." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="Select a canonical account binding to inspect its merge and reversal history." />;

  const history = scopedHistory(props);
  const governingMerge = history ? currentMerge(props, history) : null;
  const latestAsRetired = history
    ? [...history].reverse().find((event) => event.retiredAccountId === props.currentBinding.accountId)
    : undefined;
  const bindingConsistent = props.currentBinding.status === "active"
    ? props.currentBinding.redirectToAccountId === null && latestAsRetired?.action !== "merge"
    : governingMerge !== null;
  if (!history || !bindingConsistent) {
    return <StatePanel state="invalid" message="The supplied account binding and event history do not describe one exact current relationship. Unmerge controls are withheld." />;
  }

  const canRequestUnmerge = props.unmergeAuthorized && governingMerge !== null && Boolean(props.onRequestUnmerge);
  const status = props.currentBinding.status === "merged"
    ? { label: "Merged · redirected", tone: "warning" as const }
    : { label: "Active account", tone: "success" as const };

  return (
    <section
      className="glass-heavy min-w-0 rounded-2xl p-4 sm:p-6"
      data-account-merge-history-state="ready"
      data-binding-status={props.currentBinding.status}
      aria-labelledby="account-merge-history-title"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Account identity · Immutable audit</p>
          <h2 id="account-merge-history-title" className="mt-2 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Canonical account merge history</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Exact human merge decisions, evidence, and reversals for the selected account binding.
          </p>
        </div>
        <span className="w-fit rounded-full border px-3 py-1.5 text-xs font-semibold" style={TONE_STYLE[status.tone]} aria-label={`Current binding status: ${status.label}`}>
          {status.label}
        </span>
      </header>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <section className="glass min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby="account-merge-events-title">
          <p className="section-label">Chronological record</p>
          <h3 id="account-merge-events-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Merge and unmerge events</h3>
          {history.length === 0 ? (
            <p className="mt-4 rounded-xl border p-4 text-sm leading-relaxed" style={TONE_STYLE.muted}>No merge or unmerge event has been recorded for this account.</p>
          ) : (
            <ol className="mt-4 space-y-3" aria-label="Canonical account merge and unmerge history">
              {history.map((event) => <EventCard key={event.eventId} event={event} governingMerge={governingMerge} />)}
            </ol>
          )}
        </section>

        <aside className="min-w-0 space-y-4" aria-label="Current account binding and unmerge request">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="current-account-binding-title">
            <p className="section-label">Current binding</p>
            <h3 id="current-account-binding-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Canonical state</h3>
            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-2">
              <Fact label="Account" breakAll>{props.currentBinding.accountId}</Fact>
              <Fact label="Version">{props.currentBinding.version}</Fact>
              <Fact label="Redirect target" breakAll>{props.currentBinding.redirectToAccountId ?? "No redirect"}</Fact>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="account-unmerge-title">
            <p className="section-label">Human checkpoint</p>
            <h3 id="account-unmerge-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Reversibility</h3>
            {!governingMerge ? (
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>No current merge relationship is eligible for reversal.</p>
            ) : canRequestUnmerge ? (
              <>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>The exact current merge may be sent to the authorized human workflow for reversal.</p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ ...TONE_STYLE.warning, outlineColor: "var(--accent)" }}
                  onClick={() => props.onRequestUnmerge?.({ currentBinding: props.currentBinding, governingMergeEvent: governingMerge })}
                >
                  Request unmerge from {governingMerge.survivorAccountId}
                </button>
              </>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm leading-relaxed" style={TONE_STYLE.muted}>A current merge exists, but final authorization to request its reversal was not supplied.</p>
            )}
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>This panel submits a request only. It never changes account identity or history.</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
