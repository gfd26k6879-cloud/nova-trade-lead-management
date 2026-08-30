"use client";

import type { CSSProperties, ReactNode } from "react";

import { getTenantPermissionDecision } from "@/lib/permissions";
import {
  isTransitionAllowed,
  tenantExportJobSchema,
  tenantPolicySchema,
} from "@/lib/tenancy/schemas";
import {
  TENANT_DELETION_CHECKPOINT_STATUSES,
  TENANT_DELETION_CHECKPOINT_STORES,
  TENANT_DELETION_JOB_OPERATION,
  TENANT_DELETION_JOB_STATUSES,
  TENANT_DELETION_LEGAL_HOLD_STATUSES,
  TENANT_DELETION_MAX_RETRIES,
  TENANT_DELETION_SCOPE_KINDS,
  canEnterTenantDeletionPrimaryDeleted,
  validateTenantDeletionCheckpointTransition,
  validateTenantDeletionTransition,
  type LaunchRole,
  type TenantDeletionCheckpointInput,
  type TenantDeletionErrorCode,
  type TenantDeletionFreezeHandoffStatus,
  type TenantDeletionJobStatus,
  type TenantDeletionLegalHoldStatus,
  type TenantDeletionScopeKind,
  type TenantExportJob,
  type TenantExportJobStatus,
  type TenantPolicy,
} from "@/lib/tenancy/types";

type LifecyclePermission = "data:export" | "data:delete";

export type TenantDeletionJobView = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  operation: typeof TENANT_DELETION_JOB_OPERATION;
  status: TenantDeletionJobStatus;
  scopeKind: TenantDeletionScopeKind;
  scopeSelectorHash: string;
  policyVersion: string;
  legalHoldStatus: TenantDeletionLegalHoldStatus;
  legalHoldSnapshotHash?: string | null;
  heldScopeHash?: string | null;
  uncoveredScopeHash?: string | null;
  freezeHandoffStatus: TenantDeletionFreezeHandoffStatus;
  accessRevocationHandoffStatus: TenantDeletionFreezeHandoffStatus;
  checkpoints: readonly TenantDeletionCheckpointInput[];
  retryCount: number;
  maxRetries: number;
  backupExpiryTargetAt: string | null;
  errorCode: TenantDeletionErrorCode | null;
  auditEventId: string;
  createdAt: string;
  updatedAt: string;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  tenantId: string;
  workspaceId: string | null;
  actorRole: LaunchRole;
  policy: TenantPolicy;
  exportJob: TenantExportJob | null;
  deletionJob: TenantDeletionJobView | null;
  /** Final conditional policy decisions. Missing entries are an explicit deny. */
  policyAuthorizations: Readonly<Partial<Record<LifecyclePermission, boolean>>>;
  onRequestExport?: () => void;
  onCancelExport?: (jobId: string) => void;
  onRetryExport?: (jobId: string) => void;
  onRequestDeletion?: () => void;
  onCancelDeletion?: (jobId: string) => void;
  onRetryDeletion?: (jobId: string) => void;
  error?: never;
}>;

export type DataLifecyclePanelProps =
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

const EXPORT_STATUS: Readonly<Record<TenantExportJobStatus, Readonly<{ label: string; tone: Tone }>>> = Object.freeze({
  requested: { label: "Requested", tone: "warning" },
  snapshotting: { label: "Snapshotting", tone: "accent" },
  redacting: { label: "Redacting", tone: "accent" },
  artifact_created: { label: "Artifact created", tone: "accent" },
  released: { label: "Released", tone: "success" },
  retry_wait: { label: "Waiting to retry", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  canceled: { label: "Canceled", tone: "muted" },
  expired: { label: "Expired", tone: "warning" },
  deleted: { label: "Artifact deleted", tone: "muted" },
});

const DELETION_STATUS: Readonly<Record<TenantDeletionJobStatus, Readonly<{ label: string; tone: Tone }>>> = Object.freeze({
  requested: { label: "Requested", tone: "warning" },
  verified: { label: "Verified", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "warning" },
  running: { label: "Deleting primary data", tone: "danger" },
  retry_wait: { label: "Waiting to retry", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  canceled: { label: "Canceled", tone: "muted" },
  primary_deleted: { label: "Primary data deleted", tone: "danger" },
  backup_aging: { label: "Backups aging out", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
});

const HOLD_LABEL: Readonly<Record<TenantDeletionLegalHoldStatus, string>> = Object.freeze({
  none: "No legal hold",
  active_subset: "Active subset held",
  released: "Legal hold released",
  unresolved: "Unresolved — deletion blocked",
});

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const HASH = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function permissionState(props: ReadyProps, permission: LifecyclePermission) {
  const role = getTenantPermissionDecision(props.actorRole, permission);
  if (!role.allowed) return { allowed: false, label: "Denied by role" } as const;
  if (role.decision === "C" && props.policyAuthorizations[permission] !== true) {
    return { allowed: false, label: "Policy authorization required" } as const;
  }
  return { allowed: true, label: "Authorized" } as const;
}

function validDeletionJob(job: TenantDeletionJobView): boolean {
  if (job.operation !== TENANT_DELETION_JOB_OPERATION
    || !TENANT_DELETION_JOB_STATUSES.includes(job.status)
    || !TENANT_DELETION_SCOPE_KINDS.includes(job.scopeKind)
    || !TENANT_DELETION_LEGAL_HOLD_STATUSES.includes(job.legalHoldStatus)
    || !HASH.test(job.scopeSelectorHash)
    || !canonicalTimestamp(job.createdAt)
    || !canonicalTimestamp(job.updatedAt)
    || job.updatedAt < job.createdAt
    || !Number.isInteger(job.retryCount)
    || !Number.isInteger(job.maxRetries)
    || job.retryCount < 0
    || job.maxRetries < 0
    || job.retryCount > job.maxRetries
    || job.maxRetries > TENANT_DELETION_MAX_RETRIES) return false;
  if ((job.scopeKind === "tenant" && job.workspaceId !== null)
    || (job.scopeKind === "workspace" && job.workspaceId === null)) return false;

  const holdHashes = [job.legalHoldSnapshotHash, job.heldScopeHash, job.uncoveredScopeHash];
  if (job.legalHoldStatus === "none" && holdHashes.some((hash) => hash != null)) return false;
  if (["active_subset", "released"].includes(job.legalHoldStatus)
    && holdHashes.some((hash) => typeof hash !== "string" || !HASH.test(hash))) return false;
  if (job.legalHoldStatus === "unresolved"
    && (typeof job.legalHoldSnapshotHash !== "string" || !HASH.test(job.legalHoldSnapshotHash))) return false;
  if (job.backupExpiryTargetAt !== null && !canonicalTimestamp(job.backupExpiryTargetAt)) return false;
  const primaryDataGone = ["primary_deleted", "backup_aging", "completed"].includes(job.status);
  if (primaryDataGone !== (job.backupExpiryTargetAt !== null)) return false;

  if (job.checkpoints.length !== TENANT_DELETION_CHECKPOINT_STORES.length
    || new Set(job.checkpoints.map(({ store }) => store)).size !== TENANT_DELETION_CHECKPOINT_STORES.length
    || !TENANT_DELETION_CHECKPOINT_STORES.every((store) => job.checkpoints.some((checkpoint) => checkpoint.store === store))) return false;
  if (job.checkpoints.some((checkpoint) => !checkpoint.required
    || !TENANT_DELETION_CHECKPOINT_STATUSES.includes(checkpoint.status)
    || validateTenantDeletionCheckpointTransition(checkpoint.status, checkpoint.status, checkpoint) !== null)) return false;
  if (["primary_deleted", "backup_aging"].includes(job.status)
    && !canEnterTenantDeletionPrimaryDeleted({ checkpoints: job.checkpoints })) return false;

  return validateTenantDeletionTransition({
    from: job.status,
    to: job.status,
    freezeHandoffStatus: job.freezeHandoffStatus,
    accessRevocationHandoffStatus: job.accessRevocationHandoffStatus,
    checkpoints: job.checkpoints,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
  }) === null;
}

function validScope(props: ReadyProps): boolean {
  if (!UUID.test(props.tenantId) || (props.workspaceId !== null && !UUID.test(props.workspaceId))) return false;
  if (!tenantPolicySchema.safeParse(props.policy).success || props.policy.tenantId !== props.tenantId) return false;
  if (props.exportJob !== null) {
    if (!tenantExportJobSchema.safeParse(props.exportJob).success
      || props.exportJob.tenantId !== props.tenantId
      || props.exportJob.workspaceId !== props.workspaceId) return false;
  }
  if (props.deletionJob !== null) {
    if (!validDeletionJob(props.deletionJob)
      || props.deletionJob.tenantId !== props.tenantId
      || props.deletionJob.workspaceId !== props.workspaceId) return false;
  }
  return true;
}

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty" | "unavailable";
  message: string;
}>) {
  const loading = state === "loading";
  const alert = state === "error" || state === "unavailable";
  const title = loading
    ? "Loading tenant data lifecycle"
    : state === "empty"
      ? "No lifecycle scope selected"
      : state === "unavailable"
        ? "Data lifecycle records unavailable"
        : "Tenant data lifecycle unavailable";
  return (
    <section className="glass-heavy rounded-2xl p-5 sm:p-6" data-lifecycle-state={state}
      aria-labelledby={`data-lifecycle-${state}-title`} role={alert ? "alert" : "status"}
      aria-busy={loading ? true : undefined}>
      <p className="section-label">Administration · Data lifecycle</p>
      <h2 id={`data-lifecycle-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function Badge({ label, tone }: Readonly<{ label: string; tone: Tone }>) {
  return <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>{label}</span>;
}

function Fact({ label, children, mono = false }: Readonly<{ label: string; children: ReactNode; mono?: boolean }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${mono ? "break-all font-mono text-xs leading-relaxed" : ""}`} style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

function ActionButton({ children, danger = false, onClick, describedBy }: Readonly<{
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
  describedBy: string;
}>) {
  return (
    <button type="button" onClick={onClick} aria-describedby={describedBy}
      className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
      style={TONE_STYLE[danger ? "danger" : "accent"]}>{children}</button>
  );
}

function ExportCard({ job }: Readonly<{ job: TenantExportJob | null }>) {
  if (job === null) return <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No export job is recorded for this exact scope.</p>;
  const status = EXPORT_STATUS[job.status];
  return (
    <div className="mt-4" data-export-status={job.status}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="break-all font-mono text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{job.id}</p>
        <Badge label={status.label} tone={status.tone} />
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fact label="Format">{job.requestedFormat.toUpperCase()}</Fact>
        <Fact label="Retry budget">{job.retryCount} of {job.maxRetries} used</Fact>
        <Fact label="Snapshot">{job.snapshotAt ? <time dateTime={job.snapshotAt}>{formatTimestamp(job.snapshotAt)}</time> : "Not created"}</Fact>
        <Fact label="Artifact expiry">{job.expiresAt ? <time dateTime={job.expiresAt}>{formatTimestamp(job.expiresAt)}</time> : "Not released"}</Fact>
        <Fact label="Scope receipt" mono>{job.scopeHash}</Fact>
        <Fact label="Recorded audit event" mono>{job.auditEventId}</Fact>
      </dl>
      {job.includedCount !== null ? (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {job.includedCount} included · {job.excludedCount ?? 0} excluded · {job.redactedCount ?? 0} redacted
        </p>
      ) : null}
    </div>
  );
}

function DeletionCard({ job }: Readonly<{ job: TenantDeletionJobView | null }>) {
  if (job === null) return <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No deletion job is recorded for this exact scope.</p>;
  const status = DELETION_STATUS[job.status];
  const cleared = job.checkpoints.filter(({ status: checkpointStatus }) => checkpointStatus === "complete" || checkpointStatus === "exempted").length;
  return (
    <div className="mt-4" data-deletion-status={job.status}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="break-all font-mono text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{job.id}</p>
        <Badge label={status.label} tone={status.tone} />
      </div>
      <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{cleared} of {job.checkpoints.length} checkpoints cleared</span>
          <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{Math.round((cleared / job.checkpoints.length) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--status-muted-bg)" }} aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${(cleared / job.checkpoints.length) * 100}%`, background: "var(--accent)" }} />
        </div>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fact label="Legal hold">{HOLD_LABEL[job.legalHoldStatus]}</Fact>
        <Fact label="Retry budget">{job.retryCount} of {job.maxRetries} used</Fact>
        <Fact label="Freeze handoff">{words(job.freezeHandoffStatus)}</Fact>
        <Fact label="Access revocation">{words(job.accessRevocationHandoffStatus)}</Fact>
        <Fact label="Backup expiry target">{job.backupExpiryTargetAt ? <time dateTime={job.backupExpiryTargetAt}>{formatTimestamp(job.backupExpiryTargetAt)}</time> : "Not established"}</Fact>
        <Fact label="Recorded audit event" mono>{job.auditEventId}</Fact>
      </dl>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Deletion checkpoint status">
        {job.checkpoints.map((checkpoint) => (
          <li key={checkpoint.store} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--table-row-border)" }}>
            <span className="break-words" style={{ color: "var(--text-secondary)" }}>{words(checkpoint.store)}</span>
            <span className="shrink-0 font-semibold" style={{ color: checkpoint.status === "failed" ? "var(--danger-text)" : "var(--text-primary)" }}>{words(checkpoint.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DataLifecyclePanel(props: DataLifecyclePanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Checking exact tenant scope, retention policy, export state, deletion checkpoints, and audit receipts." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="Select an authorized tenant or workspace scope to inspect its lifecycle state." />;
  if (!validScope(props)) return <StatePanel state="unavailable" message="The exact scope or canonical lifecycle record shape could not be verified." />;

  const exportPermission = permissionState(props, "data:export");
  const deletionPermission = permissionState(props, "data:delete");
  const canRequestExport = exportPermission.allowed && (props.exportJob === null || ["canceled", "deleted"].includes(props.exportJob.status));
  const canCancelExport = exportPermission.allowed && props.exportJob !== null && isTransitionAllowed(props.exportJob.status, "canceled");
  const canRetryExport = exportPermission.allowed && props.exportJob?.status === "failed"
    && props.exportJob.retryCount < props.exportJob.maxRetries && isTransitionAllowed("failed", "retry_wait");
  const canRequestDeletion = deletionPermission.allowed && (props.deletionJob === null || props.deletionJob.status === "canceled");
  const canCancelDeletion = deletionPermission.allowed && props.deletionJob !== null && validateTenantDeletionTransition({
    from: props.deletionJob.status,
    to: "canceled",
    freezeHandoffStatus: props.deletionJob.freezeHandoffStatus,
    accessRevocationHandoffStatus: props.deletionJob.accessRevocationHandoffStatus,
    checkpoints: props.deletionJob.checkpoints,
    retryCount: props.deletionJob.retryCount,
    maxRetries: props.deletionJob.maxRetries,
  }) === null;
  const canRetryDeletion = deletionPermission.allowed && props.deletionJob?.status === "failed" && validateTenantDeletionTransition({
    from: props.deletionJob.status,
    to: "retry_wait",
    freezeHandoffStatus: props.deletionJob.freezeHandoffStatus,
    accessRevocationHandoffStatus: props.deletionJob.accessRevocationHandoffStatus,
    checkpoints: props.deletionJob.checkpoints,
    retryCount: props.deletionJob.retryCount,
    maxRetries: props.deletionJob.maxRetries,
  }) === null;
  const scopeLabel = props.workspaceId === null ? "Tenant scope" : "Workspace scope";

  return (
    <section className="space-y-5" aria-labelledby="data-lifecycle-title" data-lifecycle-state="ready">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Administration · Data lifecycle</p>
            <h2 id="data-lifecycle-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Export, retention, and deletion</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Exact lifecycle state for this authorized scope. Controls submit human requests only; this panel performs no export, deletion, network, or storage operation.
            </p>
          </div>
          <div className="min-w-0 rounded-xl border px-3 py-2 text-right" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
            <p className="section-label">{scopeLabel}</p>
            <p className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{props.workspaceId ?? props.tenantId}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="data-export-title">
            <div className="flex items-center justify-between gap-3">
              <div><p className="section-label">Portable copy</p><h3 id="data-export-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tenant export</h3></div>
              <Badge label={exportPermission.label} tone={exportPermission.allowed ? "success" : "warning"} />
            </div>
            <ExportCard job={props.exportJob} />
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row" style={{ borderColor: "var(--table-row-border)" }}>
              {canRequestExport && props.onRequestExport ? <ActionButton describedBy="export-actions-help" onClick={props.onRequestExport}>Request export</ActionButton> : null}
              {canCancelExport && props.exportJob && props.onCancelExport ? <ActionButton describedBy="export-actions-help" onClick={() => props.onCancelExport?.(props.exportJob?.id ?? "")}>Cancel export request</ActionButton> : null}
              {canRetryExport && props.exportJob && props.onRetryExport ? <ActionButton describedBy="export-actions-help" onClick={() => props.onRetryExport?.(props.exportJob?.id ?? "")}>Retry export</ActionButton> : null}
            </div>
            <p id="export-actions-help" className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Released artifacts expire under policy and are not retained indefinitely.</p>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="data-deletion-title">
            <div className="flex items-center justify-between gap-3">
              <div><p className="section-label">Destructive workflow</p><h3 id="data-deletion-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tenant deletion</h3></div>
              <Badge label={deletionPermission.label} tone={deletionPermission.allowed ? "success" : "warning"} />
            </div>
            <DeletionCard job={props.deletionJob} />
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row" style={{ borderColor: "var(--table-row-border)" }}>
              {canRequestDeletion && props.onRequestDeletion ? <ActionButton danger describedBy="deletion-actions-help" onClick={props.onRequestDeletion}>Request deletion</ActionButton> : null}
              {canCancelDeletion && props.deletionJob && props.onCancelDeletion ? <ActionButton describedBy="deletion-actions-help" onClick={() => props.onCancelDeletion?.(props.deletionJob?.id ?? "")}>Cancel deletion request</ActionButton> : null}
              {canRetryDeletion && props.deletionJob && props.onRetryDeletion ? <ActionButton danger describedBy="deletion-actions-help" onClick={() => props.onRetryDeletion?.(props.deletionJob?.id ?? "")}>Retry deletion</ActionButton> : null}
            </div>
            <p id="deletion-actions-help" className="mt-3 text-xs font-semibold leading-relaxed" style={{ color: "var(--danger-text)" }}>Irreversible after primary deletion begins. Cancellation disappears once freeze, access revocation, or checkpoint work starts.</p>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Retention and lifecycle effects">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="retention-policy-title">
            <p className="section-label">Policy v{props.policy.version}</p>
            <h3 id="retention-policy-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Retention windows</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Fact label="Export artifacts">{props.policy.exportRetentionDays} days</Fact>
              <Fact label="Operational logs">{props.policy.operationalLogRetentionDays} days</Fact>
              <Fact label="Raw source material">{props.policy.rawSourceRetentionDays} days</Fact>
              <Fact label="Primary data deletion target">{props.policy.primaryDeleteWithinDays} days</Fact>
              <Fact label="Backup expiry target">{props.policy.backupExpireWithinDays} days</Fact>
              <Fact label="Tombstone metadata">{props.policy.tombstoneRetentionYears} years</Fact>
            </dl>
          </section>

          <section className="rounded-2xl border p-4 sm:p-5" aria-labelledby="lifecycle-effects-title" style={TONE_STYLE.danger}>
            <p className="section-label">Before requesting deletion</p>
            <h3 id="lifecycle-effects-title" className="mt-1 text-lg font-semibold">Understand the effects</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>Primary tenant data and access are removed through verified checkpoints.</li>
              <li>Backups age out on their separate bounded schedule.</li>
              <li>Covered legal-hold subsets remain held until the recorded hold is released.</li>
              <li>Content-free tombstone metadata remains for the policy retention window.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
