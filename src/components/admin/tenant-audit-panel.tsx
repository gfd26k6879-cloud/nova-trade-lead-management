export type TenantAuditEntry = Readonly<{
  id: string;
  occurredAt: string;
  actorLabel: string;
  actorLayer: "member" | "support" | "worker" | "agent" | "system";
  action: string;
  resource: string;
  workspaceLabel: string | null;
  outcome: "allowed" | "denied" | "failed";
  correlationId: string;
}>;

export type TenantAuditPanelProps =
  | Readonly<{ state: "loading"; entries?: never; error?: never; integrity?: never }>
  | Readonly<{ state: "empty"; entries?: never; error?: never; integrity?: never }>
  | Readonly<{ state: "error"; error: string; entries?: never; integrity?: never }>
  | Readonly<{
      state: "ready";
      entries: readonly TenantAuditEntry[];
      integrity: "verified" | "unverified";
      error?: never;
    }>;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function readableTime(value: string): string {
  if (!ISO_INSTANT.test(value)) return "Unrecognized time";
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function outcomeStyle(outcome: TenantAuditEntry["outcome"]): React.CSSProperties {
  if (outcome === "allowed") {
    return { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" };
  }
  if (outcome === "denied") {
    return { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" };
  }
  return { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" };
}

function StatePanel({ state, message }: Readonly<{ state: "loading" | "empty" | "error"; message: string }>) {
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      aria-labelledby={`tenant-audit-${state}-title`}
      role={state === "error" ? "alert" : "status"}
      aria-busy={state === "loading" ? true : undefined}
      data-audit-state={state}
    >
      <p className="section-label">Admin · Audit</p>
      <h2 id={`tenant-audit-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {state === "loading" ? "Loading audit trail" : state === "error" ? "Audit trail unavailable" : "No audit activity"}
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

export function TenantAuditPanel(props: TenantAuditPanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Retrieving the current tenant-scoped audit view." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="No events match the current authorized scope." />;

  const entries = props.entries;
  const ordered = entries.every((entry, index) => (
    index === 0 || Date.parse(entries[index - 1]!.occurredAt) >= Date.parse(entry.occurredAt)
  ));
  const verified = props.integrity === "verified" && ordered;

  return (
    <section className="space-y-4" aria-labelledby="tenant-audit-title" data-surface="tenant-audit-panel">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-label">Admin · Audit</p>
            <h2 id="tenant-audit-title" className="mt-2 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Tenant activity trail</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>Authorized events in reverse chronological order.</p>
          </div>
          <span
            className="inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
            data-integrity={verified ? "verified" : "unverified"}
            style={verified
              ? { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" }
              : { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}
          >
            {verified ? "✓ Verified chronology" : "! Chronology not verified"}
          </span>
        </div>
      </header>

      <ol className="space-y-3" aria-label="Audit events">
        {entries.map((entry) => (
          <li key={entry.id} className="glass rounded-2xl p-4 sm:p-5">
            <article aria-labelledby={`audit-action-${entry.id}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="section-label">{entry.actorLayer} · {entry.workspaceLabel ?? "Tenant-wide"}</p>
                  <h3 id={`audit-action-${entry.id}`} className="mt-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>{entry.action}</h3>
                  <p className="mt-1 break-words text-sm" style={{ color: "var(--text-secondary)" }}>{entry.actorLabel} · {entry.resource}</p>
                </div>
                <span className="inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold" data-outcome={entry.outcome} style={outcomeStyle(entry.outcome)}>
                  {entry.outcome}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                  <dt className="section-label">Occurred</dt>
                  <dd className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}><time dateTime={entry.occurredAt}>{readableTime(entry.occurredAt)} UTC</time></dd>
                </div>
                <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                  <dt className="section-label">Correlation</dt>
                  <dd className="mt-1 break-all font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{entry.correlationId}</dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
