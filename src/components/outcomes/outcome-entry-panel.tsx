import type { OutcomeRecord } from "@/lib/outcomes/outcome-record";

export type OutcomeEntryContext = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  playVersionId: string;
  outreachVersionId: string | null;
}>;

type ActionState = "available" | "blocked";

type ReadyProps = Readonly<{
  state: "ready";
  context: OutcomeEntryContext;
  currentOutcome: OutcomeRecord | null;
  /** Final decisions from the canonical authorization boundary. Missing callbacks remain deny-by-default. */
  actionAuthorizations: Readonly<{ record: boolean; correct: boolean }>;
  /** Final workflow-state decisions. This panel does not recreate transition policy. */
  actionStates: Readonly<{ record: ActionState; correct: ActionState }>;
  onRecord?: (context: OutcomeEntryContext) => void;
  onCorrect?: (outcome: OutcomeRecord) => void;
}>;

export type OutcomeEntryPanelProps =
  | Readonly<{ state: "loading" }>
  | Readonly<{ state: "error"; error: string }>
  | Readonly<{ state: "empty"; message?: string }>
  | ReadyProps;

const TONE = Object.freeze({
  neutral: {
    background: "var(--surface-muted)",
    borderColor: "var(--surface-card-border)",
    color: "var(--text-secondary)",
  },
  warning: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },
  accent: {
    background: "var(--accent-light)",
    borderColor: "var(--surface-info-border)",
    color: "var(--accent)",
  },
});

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty" | "invalid";
  message: string;
}>) {
  const loading = state === "loading";
  const error = state === "error" || state === "invalid";
  const title = loading
    ? "Loading outcome context"
    : state === "invalid"
      ? "Outcome context unavailable"
      : state === "error"
        ? "Outcome entry unavailable"
        : "Select an account outcome";

  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      aria-labelledby={`outcome-entry-${state}-title`}
      role={error ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
      data-outcome-entry-state={state}
    >
      <p className="section-label">Outcomes · Human entry</p>
      <h2 id={`outcome-entry-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function BindingCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={TONE.neutral}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-all font-mono text-[0.72rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

function outcomeMatchesContext(context: OutcomeEntryContext, outcome: OutcomeRecord): boolean {
  return outcome.tenantId === context.tenantId
    && outcome.workspaceId === context.workspaceId
    && outcome.accountId === context.accountId
    && outcome.playVersionId === context.playVersionId
    && (outcome.outreachDraftVersionRef?.versionId ?? null) === context.outreachVersionId;
}

function CurrentOutcome({ outcome }: Readonly<{ outcome: OutcomeRecord }>) {
  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="current-outcome-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-label">Current canonical version</p>
          <h3 id="current-outcome-title" className="mt-1 text-lg font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
            {words(outcome.outcome)}
          </h3>
        </div>
        <span className="self-start rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE.accent}>
          Revision {outcome.revision}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3" style={TONE.neutral}>
          <dt className="section-label">Channel</dt>
          <dd className="mt-1 text-sm capitalize" style={{ color: "var(--text-primary)" }}>{words(outcome.channel)}</dd>
        </div>
        <div className="rounded-xl border p-3" style={TONE.neutral}>
          <dt className="section-label">Occurred</dt>
          <dd className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
            <time dateTime={outcome.occurredAt}>{formatTimestamp(outcome.occurredAt)}</time>
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border p-3 sm:col-span-2" style={TONE.neutral}>
          <dt className="section-label">Current version</dt>
          <dd className="mt-1 break-all font-mono text-[0.72rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {outcome.versionId}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border p-3 sm:col-span-2" style={TONE.neutral}>
          <dt className="section-label">Supersedes</dt>
          <dd className="mt-1 break-all font-mono text-[0.72rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {outcome.supersedesVersionId ?? "Initial outcome — no prior version"}
          </dd>
        </div>
      </dl>

      {outcome.notes ? (
        <div className="mt-3 rounded-xl border p-3" style={TONE.neutral}>
          <p className="section-label">Human notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{outcome.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

function CorrectionLineage({ outcome }: Readonly<{ outcome: OutcomeRecord }>) {
  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="correction-lineage-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-label">Human audit trail</p>
          <h3 id="correction-lineage-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Correction lineage
          </h3>
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{outcome.audit.length} recorded {outcome.audit.length === 1 ? "event" : "events"}</p>
      </div>

      <ol className="mt-4 space-y-3" aria-label="Outcome revision history">
        {outcome.audit.map((event) => (
          <li key={event.eventHash} className="rounded-xl border p-3" style={TONE.neutral}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
                Revision {event.revision} · {event.action}
              </p>
              <time className="text-xs" dateTime={event.at} style={{ color: "var(--text-tertiary)" }}>{formatTimestamp(event.at)}</time>
            </div>
            <p className="mt-2 break-words text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
              {event.supersedesVersionId ?? "Initial outcome"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OutcomeEntryPanel(props: OutcomeEntryPanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Checking the selected account, play, outreach version, and current human-action decisions." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") {
    return <StatePanel state="empty" message={props.message ?? "Choose a canonical account and play context before recording an outcome."} />;
  }

  const { context, currentOutcome } = props;
  const bindingCurrent = currentOutcome === null || outcomeMatchesContext(context, currentOutcome);
  if (!bindingCurrent) {
    return <StatePanel state="invalid" message="The selected context and current outcome binding could not be verified." />;
  }
  const canRecord = currentOutcome === null
    && props.actionAuthorizations.record
    && props.actionStates.record === "available"
    && Boolean(props.onRecord);
  const canCorrect = currentOutcome !== null
    && props.actionAuthorizations.correct
    && props.actionStates.correct === "available"
    && Boolean(props.onCorrect);

  return (
    <section className="space-y-5" aria-labelledby="outcome-entry-title" data-outcome-entry-state="ready">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Outcomes · Human entry</p>
            <h2 id="outcome-entry-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Record a governed outcome
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The action stays bound to this exact account, play, and outreach version. Persistence and attribution happen outside this panel.
            </p>
          </div>
          <span className="self-start rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE.accent}>
            Exact context binding
          </span>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BindingCard label="Account" value={context.accountId} />
          <BindingCard label="Play version" value={context.playVersionId} />
          <BindingCard label="Outreach version" value={context.outreachVersionId ?? "No outreach version linked"} />
        </dl>
      </header>

      {currentOutcome ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <CurrentOutcome outcome={currentOutcome} />
          <CorrectionLineage outcome={currentOutcome} />
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 text-center" role="status">
          <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>No outcome recorded yet</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            This is a valid canonical context with no current outcome version.
          </p>
        </div>
      )}

      {canRecord || canCorrect ? (
        <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outcome-entry-actions-title">
          <p className="section-label">Human action</p>
          <h3 id="outcome-entry-actions-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {canRecord ? "Record first outcome" : "Correct current outcome"}
          </h3>
          <p id="outcome-entry-actions-help" className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The caller owns data entry, confirmation, persistence, and a new immutable version.
          </p>
          <div className="mt-4">
            {canRecord ? (
              <button type="button" className="btn-primary min-h-11 w-full whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="outcome-entry-actions-help" onClick={() => props.onRecord?.(context)}>
                Record outcome
              </button>
            ) : null}
            {canCorrect && currentOutcome ? (
              <button type="button" className="btn-glass min-h-11 w-full whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="outcome-entry-actions-help" onClick={() => props.onCorrect?.(currentOutcome)}>
                Correct current outcome
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="rounded-xl border p-3 text-sm" style={TONE.neutral} role="status">
          No outcome action is available for the supplied authorization and workflow state.
        </p>
      )}
    </section>
  );
}
