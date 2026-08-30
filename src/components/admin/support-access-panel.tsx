"use client";

import type { CSSProperties } from "react";

import { isSupportAccessGrantEligibleAt, supportAccessGrantSchema } from "@/lib/tenancy/schemas";
import type { SupportAccessGrant, SupportAccessGrantState } from "@/lib/tenancy/types";

type GrantAction = "request" | "approve" | "revoke";

type Scope = Readonly<{
  tenantId: string;
  workspaceId: string | null;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  grant: SupportAccessGrant;
  scope: Scope;
  actorAuthIdentityId: string;
  asOf: string;
  /** Final decisions from the canonical authorization boundary. Missing decisions deny. */
  actionAuthorizations: Readonly<Partial<Record<GrantAction, boolean>>>;
  onRequest?: () => void;
  onApprove?: (grant: SupportAccessGrant) => void;
  onRevoke?: (grant: SupportAccessGrant) => void;
  error?: never;
}>;

export type SupportAccessPanelProps =
  | Readonly<{ state: "loading"; error?: never; grant?: never; scope?: never; actorAuthIdentityId?: never; asOf?: never; actionAuthorizations?: never }>
  | Readonly<{ state: "error"; error: string; grant?: never; scope?: never; actorAuthIdentityId?: never; asOf?: never; actionAuthorizations?: never }>
  | Readonly<{ state: "empty"; error?: never; grant?: never; scope?: never; actorAuthIdentityId?: never; asOf?: never; actionAuthorizations?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "muted" | "accent";
type EffectiveState = "pending" | "scheduled" | "active" | "expired" | "revoked";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
});

const STATE_META: Readonly<Record<EffectiveState, Readonly<{ label: string; symbol: string; tone: Tone; detail: string }>>> = Object.freeze({
  pending: { label: "Approval pending", symbol: "…", tone: "warning", detail: "The grant has no support authority until a human approves it." },
  scheduled: { label: "Approved · scheduled", symbol: "◷", tone: "accent", detail: "The grant is approved but its exact access window has not started." },
  active: { label: "Active grant", symbol: "●", tone: "success", detail: "The grant is eligible only for the listed scope, permissions, data classes, and time window." },
  expired: { label: "Expired", symbol: "⌛", tone: "muted", detail: "The access window has ended. This record grants no current support authority." },
  revoked: { label: "Revoked", symbol: "×", tone: "danger", detail: "The grant was revoked and cannot be reactivated." },
});

function isCanonicalTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(":", " · ");
}

function PanelState({ state, message }: Readonly<{ state: "loading" | "error" | "empty" | "denied"; message: string }>) {
  const loading = state === "loading";
  const alert = state === "error" || state === "denied";
  const title = loading
    ? "Loading support access"
    : state === "empty"
      ? "No support access grant selected"
      : "Support access unavailable";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-support-access-state={state}
      role={alert ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
      aria-labelledby={`support-access-${state}-title`}
    >
      <p className="section-label">Administration · Support access</p>
      <h2 id={`support-access-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function Fact({ label, children, breakAll = false }: Readonly<{ label: string; children: React.ReactNode; breakAll?: boolean }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold leading-relaxed ${breakAll ? "break-all font-mono text-xs" : "break-words"}`} style={{ color: "var(--text-primary)" }}>
        {children}
      </dd>
    </div>
  );
}

function effectiveState(grant: SupportAccessGrant, asOf: string): EffectiveState {
  if (grant.state === "pending") return "pending";
  if (grant.state === "revoked") return "revoked";
  if (isSupportAccessGrantEligibleAt(grant, asOf)) return "active";
  return asOf < grant.startsAt ? "scheduled" : "expired";
}

function scopeIsCanonical(scope: Scope): boolean {
  return UUID.test(scope.tenantId) && (scope.workspaceId === null || UUID.test(scope.workspaceId));
}

function canonicalReady(props: ReadyProps): Readonly<{ grant: SupportAccessGrant; effective: EffectiveState; currentSnapshot: boolean }> | null {
  if (!scopeIsCanonical(props.scope) || !UUID.test(props.actorAuthIdentityId) || !isCanonicalTimestamp(props.asOf)) return null;
  const parsed = supportAccessGrantSchema.safeParse(props.grant);
  if (!parsed.success) return null;
  if (parsed.data.tenantId !== props.scope.tenantId || parsed.data.workspaceId !== props.scope.workspaceId) return null;
  const latestDecisionAt = parsed.data.revokedAt ?? parsed.data.approvedAt ?? parsed.data.createdAt;
  if (latestDecisionAt > parsed.data.updatedAt) return null;
  return {
    grant: parsed.data,
    effective: effectiveState(parsed.data, props.asOf),
    currentSnapshot: props.asOf >= parsed.data.updatedAt,
  };
}

function StateBadge({ state }: Readonly<{ state: EffectiveState }>) {
  const meta = STATE_META[state];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" data-effective-state={state} style={TONE_STYLE[meta.tone]}>
      <span aria-hidden="true">{meta.symbol}</span> {meta.label}
    </span>
  );
}

function ScopeList({ title, values }: Readonly<{ title: string; values: readonly string[] }>) {
  return (
    <section className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }} aria-labelledby={`support-${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      <h4 id={`support-${title.toLowerCase().replaceAll(" ", "-")}-title`} className="section-label">{title}</h4>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Approved ${title.toLowerCase()}`}>
        {values.map((value) => (
          <li key={value} className="rounded-full border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--table-row-border)", color: "var(--text-secondary)" }}>
            {humanize(value)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuditChronology({ grant }: Readonly<{ grant: SupportAccessGrant }>) {
  const events: Array<Readonly<{ label: string; actor: string; at: string; detail: string }>> = [{
    label: "Grant requested",
    actor: grant.requestedByAuthIdentityId,
    at: grant.createdAt,
    detail: `Audit event ${grant.auditEventId}`,
  }];
  if (grant.approvedAt && grant.approvedByAuthIdentityId) {
    events.push({ label: "Grant approved", actor: grant.approvedByAuthIdentityId, at: grant.approvedAt, detail: "Human approval recorded" });
  }
  if (grant.revokedAt && grant.revokedByAuthIdentityId) {
    events.push({ label: "Grant revoked", actor: grant.revokedByAuthIdentityId, at: grant.revokedAt, detail: "Human revocation recorded" });
  }

  return (
    <ol className="mt-4 space-y-3" aria-label="Support access audit chronology" data-audit-event-count={events.length}>
      {events.map((event, index) => (
        <li key={`${event.label}:${event.at}`} className="relative rounded-xl border p-3 pl-10" style={{ background: "var(--surface-muted)", borderColor: "var(--table-row-border)" }}>
          <span className="absolute left-3 top-3 inline-flex size-5 items-center justify-center rounded-full border text-[0.65rem] font-bold" aria-hidden="true" style={TONE_STYLE[index === events.length - 1 ? "accent" : "muted"]}>{index + 1}</span>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{event.label}</p>
          <p className="mt-1 break-all font-mono text-[0.68rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Human actor {event.actor}</p>
          <p className="mt-1 break-all text-xs" style={{ color: "var(--text-secondary)" }}>{event.detail}</p>
          <time className="mt-1 block text-xs" dateTime={event.at} style={{ color: "var(--text-tertiary)" }}>{formatTimestamp(event.at)} UTC</time>
        </li>
      ))}
    </ol>
  );
}

function stateTone(state: SupportAccessGrantState): Tone {
  return state === "approved" ? "success" : state === "pending" ? "warning" : "danger";
}

export function SupportAccessPanel(props: SupportAccessPanelProps) {
  if (props.state === "loading") return <PanelState state="loading" message="Checking exact tenant scope, access window, and human authorization." />;
  if (props.state === "error") return <PanelState state="error" message={props.error} />;
  if (props.state === "empty") return <PanelState state="empty" message="Select an exact tenant-scoped grant to inspect its reason, access boundaries, and audit history." />;

  const canonical = canonicalReady(props);
  if (!canonical) {
    return <PanelState state="denied" message="The requested support-access record or scope could not be verified." />;
  }

  const { grant, effective, currentSnapshot } = canonical;
  const meta = STATE_META[effective];
  const actorSeparated = props.actorAuthIdentityId !== grant.supportActorAuthIdentityId;
  const canRequest = grant.state === "revoked" && currentSnapshot && actorSeparated
    && props.actionAuthorizations.request === true && Boolean(props.onRequest);
  const canApprove = grant.state === "pending" && props.asOf < grant.expiresAt && currentSnapshot && actorSeparated
    && props.actionAuthorizations.approve === true && Boolean(props.onApprove);
  const canRevoke = grant.state === "approved" && currentSnapshot && actorSeparated
    && props.actionAuthorizations.revoke === true && Boolean(props.onRevoke);

  return (
    <section className="space-y-5" data-surface="support-access-panel" data-support-access-state="ready" data-grant-state={grant.state} aria-labelledby="support-access-title">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Administration · Support access</p>
            <h2 id="support-access-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Time-bound support grant</h2>
            <p className="mt-2 break-all font-mono text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{grant.id}</p>
          </div>
          <StateBadge state={effective} />
        </div>
        <div className="mt-4 rounded-xl border p-3" role="status" style={TONE_STYLE[meta.tone]}>
          <p className="text-sm font-semibold">{meta.detail}</p>
          {!currentSnapshot ? <p className="mt-1 text-xs">Controls are hidden because this view predates the latest recorded update.</p> : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="support-scope-title">
            <p className="section-label">Exact boundary</p>
            <h3 id="support-scope-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tenant and workspace scope</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="Tenant" breakAll>{grant.tenantId}</Fact>
              <Fact label="Workspace" breakAll>{grant.workspaceId ?? "Tenant-wide"}</Fact>
              <Fact label="Support actor" breakAll>{grant.supportActorAuthIdentityId}</Fact>
              <Fact label="Platform role">{humanize(grant.platformRole)}</Fact>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="support-purpose-title">
            <p className="section-label">Justified access</p>
            <h3 id="support-purpose-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Reason and least-content scope</h3>
            <div className="mt-4 rounded-xl border p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)" }}>{humanize(grant.reasonCode)}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{grant.reason}</p>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <ScopeList title="Permissions" values={grant.permissions} />
              <ScopeList title="Data classes" values={grant.dataClasses} />
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="support-window-title">
            <p className="section-label">Hard time limit</p>
            <h3 id="support-window-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Access window</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="Starts"><time dateTime={grant.startsAt}>{formatTimestamp(grant.startsAt)} UTC</time></Fact>
              <Fact label="Expires"><time dateTime={grant.expiresAt}>{formatTimestamp(grant.expiresAt)} UTC</time></Fact>
            </dl>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Support grant decisions and audit">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="support-decision-title">
            <p className="section-label">Human decision</p>
            <h3 id="support-decision-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Approval and revocation</h3>
            <dl className="mt-3 space-y-3">
              <Fact label="Canonical state"><span style={{ color: TONE_STYLE[stateTone(grant.state)].color }}>{humanize(grant.state)}</span></Fact>
              <Fact label="Approved by" breakAll>{grant.approvedByAuthIdentityId ?? "Not approved"}</Fact>
              <Fact label="Revoked by" breakAll>{grant.revokedByAuthIdentityId ?? "Not revoked"}</Fact>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="support-audit-title">
            <p className="section-label">Append-only history</p>
            <h3 id="support-audit-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Audit chronology</h3>
            <AuditChronology grant={grant} />
          </section>
        </aside>
      </div>

      {canRequest || canApprove || canRevoke ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="support-actions-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="support-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Human support-access controls</h3>
              <p id="support-actions-help" className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Every action is rechecked and recorded by the server authority boundary.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {canRequest ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" style={TONE_STYLE.accent} aria-describedby="support-actions-help" onClick={props.onRequest}>Request new grant</button> : null}
              {canApprove ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" style={TONE_STYLE.success} aria-describedby="support-actions-help" onClick={() => props.onApprove?.(grant)}>Approve grant</button> : null}
              {canRevoke ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" style={TONE_STYLE.danger} aria-describedby="support-actions-help" onClick={() => props.onRevoke?.(grant)}>Revoke grant</button> : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
