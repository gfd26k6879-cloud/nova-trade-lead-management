"use client";

import type { CSSProperties, ReactNode } from "react";

import type { Tenant, Workspace } from "@/lib/tenancy/queries";
import type { TenantDeletionFreezeHandoffStatus, TenantStatus, WorkspaceStatus } from "@/lib/tenancy/types";

export type TenantLifecycleAction = "request_pause" | "request_resume" | "request_suspend";
export type TenantLifecycleTarget = "tenant" | "workspace";

export type TenantLifecycleAuditSummary =
  | Readonly<{
    state: "recorded";
    tenantId: string;
    workspaceId: string | null;
    lifecycleVersion: number;
    eventId: string;
    actorId: string;
    fromStatus: TenantStatus | WorkspaceStatus;
    toStatus: TenantStatus | WorkspaceStatus;
    recordedAt: string;
  }>
  | Readonly<{ state: "pending" | "missing" }>;

export interface TenantLifecycleSnapshot {
  readonly tenant: Tenant;
  readonly workspace: Workspace | null;
  readonly lifecycleVersion: number;
  readonly reasonCode: string;
  readonly reason: string;
  readonly freezeHandoffStatus: TenantDeletionFreezeHandoffStatus;
  readonly accessRevocationHandoffStatus: TenantDeletionFreezeHandoffStatus;
  readonly changedAt: string;
  readonly audit: TenantLifecycleAuditSummary;
}

type ReadyProps = Readonly<{
  state: "ready";
  snapshot: TenantLifecycleSnapshot;
  /** Final canonical action decisions. Missing entries deny. */
  authorizations: Readonly<Partial<Record<TenantLifecycleAction | "read", boolean>>>;
  onRequestPause?: (snapshot: TenantLifecycleSnapshot) => void;
  onRequestResume?: (snapshot: TenantLifecycleSnapshot, target: TenantLifecycleTarget) => void;
  onRequestSuspend?: (snapshot: TenantLifecycleSnapshot) => void;
  error?: never;
}>;

export type TenantLifecyclePanelProps =
  | Readonly<{ state: "loading"; error?: never }>
  | Readonly<{ state: "error"; error: string }>
  | Readonly<{ state: "empty"; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "muted" | "accent";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
});

const TENANT_STATUS_META: Readonly<Record<TenantStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  provisioning: { label: "Provisioning", symbol: "…", tone: "accent" },
  active: { label: "Active", symbol: "●", tone: "success" },
  suspended: { label: "Suspended", symbol: "Ⅱ", tone: "warning" },
  archived: { label: "Archived", symbol: "—", tone: "muted" },
  deletion_pending: { label: "Deletion pending", symbol: "!", tone: "danger" },
  deleted: { label: "Deleted", symbol: "×", tone: "danger" },
});

const WORKSPACE_STATUS_META: Readonly<Record<WorkspaceStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  provisioning: { label: "Provisioning", symbol: "…", tone: "accent" },
  active: { label: "Active", symbol: "●", tone: "success" },
  paused: { label: "Paused", symbol: "Ⅱ", tone: "warning" },
  archived: { label: "Archived", symbol: "—", tone: "muted" },
  deletion_pending: { label: "Deletion pending", symbol: "!", tone: "danger" },
  deleted: { label: "Deleted", symbol: "×", tone: "danger" },
});

const HANDOFF_META: Readonly<Record<TenantDeletionFreezeHandoffStatus, Readonly<{ label: string; detail: string; tone: Tone }>>> = Object.freeze({
  not_started: { label: "Not started", detail: "No handoff receipt is recorded.", tone: "muted" },
  requested: { label: "Requested", detail: "The owning system has not acknowledged the request yet.", tone: "warning" },
  acknowledged: { label: "Acknowledged", detail: "The owning system recorded the handoff.", tone: "success" },
  failed: { label: "Failed", detail: "The handoff requires operator review before relying on it.", tone: "danger" },
});

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function canonicalTimestamp(value: string): boolean {
  if (!TIMESTAMP.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function formatTimestamp(value: string): string {
  if (!canonicalTimestamp(value)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(Date.parse(value));
}

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty" | "unavailable";
  message: string;
}>) {
  const loading = state === "loading";
  const alert = state === "error" || state === "unavailable";
  const title = loading
    ? "Loading tenant lifecycle"
    : state === "empty"
      ? "No lifecycle scope selected"
      : state === "unavailable"
        ? "Tenant lifecycle unavailable"
        : "Tenant lifecycle could not be loaded";

  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-tenant-lifecycle-state={state}
      aria-labelledby={`tenant-lifecycle-${state}-title`}
      role={alert ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
    >
      <p className="section-label">Administration · Tenant lifecycle</p>
      <h2 id={`tenant-lifecycle-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function StatusBadge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>{label}
    </span>
  );
}

function Fact({ label, children, mono = false }: Readonly<{ label: string; children: ReactNode; mono?: boolean }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${mono ? "break-all font-mono text-xs leading-relaxed" : ""}`} style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

function HandoffCard({ label, status }: Readonly<{ label: string; status: TenantDeletionFreezeHandoffStatus }>) {
  const meta = HANDOFF_META[status];
  return (
    <li className="min-w-0 rounded-xl border p-3" data-handoff-status={status} style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
        <StatusBadge label={meta.label} symbol={status === "acknowledged" ? "✓" : status === "failed" ? "!" : "•"} tone={meta.tone} />
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{meta.detail}</p>
    </li>
  );
}

function validScope(snapshot: TenantLifecycleSnapshot, canRead: boolean): boolean {
  if (!canRead || snapshot.tenant.id.trim() === "" || !Number.isSafeInteger(snapshot.lifecycleVersion)
    || snapshot.lifecycleVersion < 1 || !canonicalTimestamp(snapshot.changedAt)) return false;
  if (snapshot.workspace !== null && snapshot.workspace.tenantId !== snapshot.tenant.id) return false;
  if (snapshot.audit.state === "recorded") {
    if (snapshot.audit.tenantId !== snapshot.tenant.id
      || snapshot.audit.workspaceId !== (snapshot.workspace?.id ?? null)
      || snapshot.audit.lifecycleVersion !== snapshot.lifecycleVersion
      || !canonicalTimestamp(snapshot.audit.recordedAt)) return false;
    const currentStatus = snapshot.workspace?.status ?? snapshot.tenant.status;
    if (snapshot.audit.toStatus !== currentStatus) return false;
  }
  return true;
}

export function TenantLifecyclePanel(props: TenantLifecyclePanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Checking the exact tenant scope, lifecycle version, handoff state, and audit receipt." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="Select an authorized tenant or workspace to inspect its current lifecycle." />;
  if (!validScope(props.snapshot, props.authorizations.read === true)) {
    return <StatePanel state="unavailable" message="The exact scope, lifecycle version, current audit binding, or read authorization could not be verified." />;
  }

  const { snapshot } = props;
  const tenantMeta = TENANT_STATUS_META[snapshot.tenant.status];
  const workspaceMeta = snapshot.workspace ? WORKSPACE_STATUS_META[snapshot.workspace.status] : null;
  const auditRecorded = snapshot.audit.state === "recorded";
  const resumeTarget: TenantLifecycleTarget | null = snapshot.tenant.status === "suspended"
    ? "tenant"
    : snapshot.tenant.status === "active" && snapshot.workspace?.status === "paused"
      ? "workspace"
      : null;
  const canPause = snapshot.tenant.status === "active"
    && snapshot.workspace?.status === "active"
    && auditRecorded
    && props.authorizations.request_pause === true
    && Boolean(props.onRequestPause);
  const canResume = resumeTarget !== null
    && auditRecorded
    && props.authorizations.request_resume === true
    && Boolean(props.onRequestResume);
  const canSuspend = snapshot.tenant.status === "active"
    && auditRecorded
    && props.authorizations.request_suspend === true
    && Boolean(props.onRequestSuspend);

  return (
    <section className="space-y-5" data-surface="tenant-lifecycle-panel" data-tenant-lifecycle-state="ready" aria-labelledby="tenant-lifecycle-title">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Administration · Tenant lifecycle</p>
            <h2 id="tenant-lifecycle-title" className="mt-2 break-words text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {snapshot.workspace?.name ?? snapshot.tenant.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Canonical lifecycle version {snapshot.lifecycleVersion} · changed <time dateTime={snapshot.changedAt}>{formatTimestamp(snapshot.changedAt)} UTC</time>. Actions submit human requests; this panel does not perform lifecycle transitions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end" aria-label="Current lifecycle status">
            <StatusBadge {...tenantMeta} label={`Tenant ${tenantMeta.label}`} />
            {workspaceMeta ? <StatusBadge {...workspaceMeta} label={`Workspace ${workspaceMeta.label}`} /> : null}
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lifecycle-scope-title">
            <p className="section-label">Exact effective scope</p>
            <h3 id="lifecycle-scope-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Current tenant and workspace state</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Tenant" mono>{snapshot.tenant.id}</Fact>
              <Fact label="Tenant status">{tenantMeta.label}</Fact>
              <Fact label="Tenant record">Updated <time dateTime={snapshot.tenant.updatedAt}>{formatTimestamp(snapshot.tenant.updatedAt)} UTC</time></Fact>
              <Fact label="Workspace" mono>{snapshot.workspace?.id ?? "Tenant-wide"}</Fact>
              <Fact label="Workspace status">{workspaceMeta?.label ?? "Not selected"}</Fact>
              <Fact label="Lifecycle version">{snapshot.lifecycleVersion}</Fact>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lifecycle-handoff-title">
            <p className="section-label">Operational handoff</p>
            <h3 id="lifecycle-handoff-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Freeze and access revocation</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              These are canonical receipts from the owning systems. This view does not start, retry, or acknowledge either handoff.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Lifecycle handoff status">
              <HandoffCard label="Work freeze" status={snapshot.freezeHandoffStatus} />
              <HandoffCard label="Access revocation" status={snapshot.accessRevocationHandoffStatus} />
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lifecycle-reason-title">
            <p className="section-label">Recorded rationale</p>
            <h3 id="lifecycle-reason-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Reason for the current version</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,.45fr)_minmax(0,1.55fr)]">
              <Fact label="Reason code" mono>{snapshot.reasonCode}</Fact>
              <Fact label="Summary">{snapshot.reason}</Fact>
            </dl>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Lifecycle audit and human controls">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lifecycle-audit-title">
            <p className="section-label">Versioned governance</p>
            <h3 id="lifecycle-audit-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Audit summary</h3>
            <div className="mt-4 rounded-xl border p-3" data-audit-state={snapshot.audit.state} style={TONE_STYLE[auditRecorded ? "success" : "warning"]}>
              <p className="text-sm font-semibold">{auditRecorded ? "✓ Recorded for this lifecycle version" : "! Current audit receipt unavailable"}</p>
              {snapshot.audit.state === "recorded" ? (
                <>
                  <p className="mt-2 break-all font-mono text-[0.68rem]">{snapshot.audit.eventId}</p>
                  <p className="mt-2 text-xs leading-relaxed">{snapshot.audit.fromStatus.replaceAll("_", " ")} → {snapshot.audit.toStatus.replaceAll("_", " ")}</p>
                  <p className="mt-1 break-words text-xs leading-relaxed">{snapshot.audit.actorId} · <time dateTime={snapshot.audit.recordedAt}>{formatTimestamp(snapshot.audit.recordedAt)} UTC</time></p>
                </>
              ) : <p className="mt-2 text-xs leading-relaxed">No current receipt was supplied. The lifecycle service remains the authority for recorded changes.</p>}
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="lifecycle-actions-title">
            <p className="section-label">Human controlled</p>
            <h3 id="lifecycle-actions-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Lifecycle requests</h3>
            <p id="lifecycle-actions-help" className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Controls appear only for the current status and a supplied final authorization. The receiving workflow rechecks scope, version, owner guards, and audit requirements.
            </p>
            {canPause || canResume || canSuspend ? (
              <div className="mt-4 grid gap-2" aria-label="Authorized lifecycle requests">
                {canPause ? (
                  <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={TONE_STYLE.warning} aria-describedby="lifecycle-actions-help" onClick={() => props.onRequestPause?.(snapshot)}>
                    Request workspace pause
                  </button>
                ) : null}
                {canResume && resumeTarget ? (
                  <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={TONE_STYLE.accent} aria-describedby="lifecycle-actions-help" onClick={() => props.onRequestResume?.(snapshot, resumeTarget)}>
                    Request {resumeTarget} resume
                  </button>
                ) : null}
                {canSuspend ? (
                  <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={TONE_STYLE.danger} aria-describedby="lifecycle-actions-help" onClick={() => props.onRequestSuspend?.(snapshot)}>
                    Request tenant suspension
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border p-3 text-xs leading-relaxed" style={TONE_STYLE.muted}>No lifecycle request is authorized for this exact state.</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
