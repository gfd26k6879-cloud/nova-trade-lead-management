"use client";

import type { CSSProperties, ReactNode } from "react";

import { getTenantPermissionDecision, type TenantPermission } from "@/lib/permissions";
import {
  TENANT_LIMIT_ACTION_POLICY,
  TENANT_LIMIT_ACTIONS,
  type TenantLimitAction,
  type TenantLimitRuntimeState,
} from "@/lib/tenancy/limits";
import type { MembershipView } from "@/lib/tenancy/memberships";
import type { Workspace } from "@/lib/tenancy/queries";
import type { TenantPolicy } from "@/lib/tenancy/types";

type PanelPermission = Extract<TenantPermission, "tenant:read" | "usage:read" | "tenant:manage" | "budget:manage">;

export interface TenantLimitUsage {
  readonly action: TenantLimitAction;
  readonly used: number;
  readonly resetAt: string;
}

export interface TenantLimitUsageSnapshot {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly configurationVersion: number;
  readonly measuredAt: string;
  readonly usage: readonly TenantLimitUsage[];
}

export type TenantPolicyAuditState =
  | Readonly<{
    state: "recorded";
    tenantId: string;
    workspaceId: string;
    policyId: string;
    policyVersion: number;
    configurationVersion: number;
    eventId: string;
    actorId: string;
    recordedAt: string;
  }>
  | Readonly<{ state: "pending" | "missing" }>;

type ReadyProps = Readonly<{
  state: "ready";
  actor: MembershipView;
  workspace: Workspace;
  policy: TenantPolicy;
  limits: TenantLimitRuntimeState;
  usage: TenantLimitUsageSnapshot;
  audit: TenantPolicyAuditState;
  asOf: string;
  /** Final canonical authorization decisions. Missing entries deny. */
  policyAuthorizations: Readonly<Partial<Record<PanelPermission, boolean>>>;
  onEditPolicy?: (policy: TenantPolicy) => void;
  onEditLimits?: (limits: TenantLimitRuntimeState) => void;
  onReviewAudit?: (policy: TenantPolicy) => void;
  error?: never;
}>;

export type TenantPolicyPanelProps =
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

const ACTION_LABEL: Readonly<Record<TenantLimitAction, string>> = Object.freeze({
  membership_invite: "Membership invitations",
  support_grant_request: "Support grant requests",
  support_grant_approval: "Support grant approvals",
  knowledge_upload: "Knowledge uploads",
  export_request: "Copy and export requests",
  deletion_request: "Deletion requests",
  worker_start: "Source research workers",
  agent_plan_expensive: "Expensive agent plans",
  recovery_bookkeeping: "Recovery bookkeeping",
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

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty" | "denied";
  message: string;
}>) {
  const alert = state === "error" || state === "denied";
  const title = state === "loading"
    ? "Loading tenant policy"
    : state === "empty"
      ? "No tenant policy selected"
      : state === "denied"
        ? "Tenant policy unavailable"
        : "Tenant policy could not be loaded";

  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-tenant-policy-state={state}
      aria-labelledby={`tenant-policy-${state}-title`}
      role={alert ? "alert" : "status"}
      aria-busy={state === "loading" ? true : undefined}
    >
      <p className="section-label">Administration · Tenant policy</p>
      <h2 id={`tenant-policy-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function Fact({ label, children, mono = false }: Readonly<{ label: string; children: ReactNode; mono?: boolean }>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${mono ? "break-all font-mono text-xs" : ""}`} style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

function Flag({ label, enabled }: Readonly<{ label: string; enabled: boolean }>) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--table-row-border)" }}>
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="shrink-0 text-xs font-semibold" style={enabled ? TONE_STYLE.success : TONE_STYLE.muted} data-enabled={enabled}>
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </li>
  );
}

function permissionAllowed(props: ReadyProps, permission: PanelPermission): boolean {
  return props.actor.role !== null
    && getTenantPermissionDecision(props.actor.role, permission).allowed
    && props.policyAuthorizations[permission] === true;
}

function validReadyScope(props: ReadyProps): boolean {
  const asOf = instant(props.asOf);
  const measuredAt = instant(props.usage.measuredAt);
  const policyUpdatedAt = instant(props.policy.updatedAt);
  if (asOf === null || measuredAt === null || policyUpdatedAt === null || measuredAt > asOf || policyUpdatedAt > asOf) return false;
  if (props.actor.status !== "active" || props.actor.role === null) return false;
  if (!permissionAllowed(props, "tenant:read") || !permissionAllowed(props, "usage:read")) return false;
  if (props.policy.tenantId !== props.workspace.tenantId || props.limits.tenantId !== props.policy.tenantId) return false;
  if (props.actor.tenantId !== props.policy.tenantId || (props.actor.workspaceId !== null && props.actor.workspaceId !== props.workspace.id)) return false;
  if (props.usage.tenantId !== props.policy.tenantId || props.usage.workspaceId !== props.workspace.id) return false;
  if (props.usage.configurationVersion !== props.limits.configurationVersion) return false;
  if (new Set(props.usage.usage.map(({ action }) => action)).size !== TENANT_LIMIT_ACTIONS.length) return false;
  if (!TENANT_LIMIT_ACTIONS.every((action) => props.usage.usage.some((entry) => entry.action === action))) return false;
  if (!props.usage.usage.every(({ used, resetAt }) => Number.isSafeInteger(used) && used >= 0 && instant(resetAt) !== null)) return false;
  if (props.audit.state === "recorded") {
    if (props.audit.tenantId !== props.policy.tenantId || props.audit.workspaceId !== props.workspace.id) return false;
    if (props.audit.policyId !== props.policy.id || props.audit.policyVersion !== props.policy.version) return false;
    if (props.audit.configurationVersion !== props.limits.configurationVersion) return false;
    const recordedAt = instant(props.audit.recordedAt);
    if (recordedAt === null || recordedAt > asOf) return false;
  }
  return true;
}

function QuotaRow({ entry, cap, killed }: Readonly<{ entry: TenantLimitUsage; cap: number; killed: boolean }>) {
  const remaining = Math.max(0, cap - entry.used);
  const tone: Tone = killed || entry.used >= cap ? "danger" : entry.used >= cap * 0.8 ? "warning" : "success";
  return (
    <li className="rounded-xl border p-3" data-limit-action={entry.action} data-limit-state={killed ? "blocked" : entry.used >= cap ? "exhausted" : "available"} style={{ borderColor: "var(--surface-card-border)" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{ACTION_LABEL[entry.action]}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{Math.round(TENANT_LIMIT_ACTION_POLICY[entry.action].windowMs / 3_600_000)} hour window</p>
        </div>
        <span className="w-fit rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
          {killed ? "Blocked" : `${entry.used} / ${cap}`}
        </span>
      </div>
      <progress className="mt-3 h-2 w-full" max={cap} value={Math.min(entry.used, cap)} aria-label={`${ACTION_LABEL[entry.action]} quota usage`} />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>{remaining} remaining · platform ceiling {TENANT_LIMIT_ACTION_POLICY[entry.action].platformHardCap}</span>
        <span>Resets <time dateTime={entry.resetAt}>{formatTimestamp(entry.resetAt)} UTC</time></span>
      </div>
    </li>
  );
}

export function TenantPolicyPanel(props: TenantPolicyPanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Checking exact tenant scope, policy version, quota usage, and audit authority." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="Select a tenant workspace to inspect its effective policy and current quota windows." />;
  if (!validReadyScope(props)) {
    return <StatePanel state="denied" message="The tenant scope, permissions, effective versions, or audit state could not be verified." />;
  }

  const currentState = props.limits.tenantStatus === "active" && props.workspace.status === "active";
  const auditRecorded = props.audit.state === "recorded";
  const canManagePolicy = currentState && permissionAllowed(props, "tenant:manage");
  const canEditPolicy = canManagePolicy && auditRecorded && Boolean(props.onEditPolicy);
  const canEditLimits = currentState && auditRecorded && !props.limits.platformGlobalKill
    && permissionAllowed(props, "budget:manage") && Boolean(props.onEditLimits);
  const canReviewAudit = currentState && !auditRecorded && canManagePolicy && Boolean(props.onReviewAudit);
  const usageByAction = new Map(props.usage.usage.map((entry) => [entry.action, entry]));
  const actionKilled = (action: TenantLimitAction) => props.limits.platformGlobalKill
    || props.limits.platformActionKills[action] === true
    || props.limits.tenantActionKills[action] === true;
  const capFor = (action: TenantLimitAction) => Math.min(
    TENANT_LIMIT_ACTION_POLICY[action].platformHardCap,
    props.limits.tenantPolicyCaps[action] ?? TENANT_LIMIT_ACTION_POLICY[action].platformHardCap,
  );
  const sourceBlocked = !props.policy.sourceResearchEnabled || actionKilled("worker_start");
  const outreachBlocked = !props.policy.outreachDraftingEnabled || actionKilled("export_request");

  return (
    <section className="space-y-5" data-surface="tenant-policy-panel" data-tenant-policy-state="ready" aria-labelledby="tenant-policy-title">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Administration · Tenant policy</p>
            <h2 id="tenant-policy-title" className="mt-2 break-words text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{props.workspace.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Effective policy v{props.policy.version} · quota configuration v{props.limits.configurationVersion} · measured <time dateTime={props.usage.measuredAt}>{formatTimestamp(props.usage.measuredAt)} UTC</time>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold" data-policy-health={sourceBlocked || outreachBlocked ? "restricted" : "active"} style={TONE_STYLE[sourceBlocked || outreachBlocked ? "warning" : "success"]}>
              {sourceBlocked || outreachBlocked ? "Restricted" : "Active controls"}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold" data-audit-state={props.audit.state} style={TONE_STYLE[auditRecorded ? "success" : "warning"]}>Audit {props.audit.state}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="tenant-policy-scope-title">
            <p className="section-label">Exact effective scope</p>
            <h3 id="tenant-policy-scope-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tenant and workspace settings</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Tenant" mono>{props.policy.tenantId}</Fact>
              <Fact label="Workspace" mono>{props.workspace.id}</Fact>
              <Fact label="Workspace slug" mono>{props.workspace.slug}</Fact>
              <Fact label="Workspace status">{props.workspace.status}</Fact>
              <Fact label="Tenant status">{props.limits.tenantStatus}</Fact>
              <Fact label="Locale">{props.policy.locale}</Fact>
              <Fact label="Timezone">{props.policy.timezone}</Fact>
              <Fact label="Effective version">Policy {props.policy.version} · limits {props.limits.configurationVersion}</Fact>
              <Fact label="Platform limit version">{props.limits.platformConfigurationVersion}</Fact>
            </dl>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="glass rounded-2xl p-4" aria-labelledby="source-policy-title">
              <p className="section-label">Source limits</p>
              <h3 id="source-policy-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Research authority</h3>
              <ul className="mt-3 space-y-2">
                <Flag label="AI processing" enabled={props.policy.aiProcessingEnabled} />
                <Flag label="Source research" enabled={props.policy.sourceResearchEnabled} />
                <Flag label="Contact research" enabled={props.policy.contactResearchEnabled} />
                <Flag label="Source plan approval" enabled={props.policy.requireSourcePlanApproval} />
                <Flag label="Contact review" enabled={props.policy.requireContactReview} />
              </ul>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Raw source retention {props.policy.rawSourceRetentionDays} days · contact freshness {props.policy.contactFreshnessDays} days.</p>
            </section>

            <section className="glass rounded-2xl p-4" aria-labelledby="outreach-policy-title">
              <p className="section-label">Outreach limits</p>
              <h3 id="outreach-policy-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Human-reviewed export</h3>
              <ul className="mt-3 space-y-2">
                <Flag label="Drafting" enabled={props.policy.outreachDraftingEnabled} />
                <Flag label="Copy and export" enabled={props.policy.copyExportEnabled} />
                <Flag label="Outreach review" enabled={props.policy.requireOutreachReview} />
                <Flag label="Autonomous send" enabled={props.policy.autonomousSendEnabled} />
              </ul>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Export retention {props.policy.exportRetentionDays} days. This surface grants no send authority.</p>
            </section>

            <section className="glass rounded-2xl p-4" aria-labelledby="privacy-policy-title">
              <p className="section-label">Privacy limits</p>
              <h3 id="privacy-policy-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Retention and deletion</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Fact label="Operational logs">{props.policy.operationalLogRetentionDays} days</Fact>
                <Fact label="Primary deletion">Within {props.policy.primaryDeleteWithinDays} days</Fact>
                <Fact label="Backup expiry">Within {props.policy.backupExpireWithinDays} days</Fact>
                <Fact label="Tombstones">{props.policy.tombstoneRetentionYears} years</Fact>
              </dl>
              <p className="mt-3 break-words text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Active materials: {humanize(props.policy.activeMaterialsMode)}.</p>
            </section>
          </div>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="quota-usage-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Current usage</p>
                <h3 id="quota-usage-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Usage against effective caps</h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Caps never exceed platform ceilings</p>
            </div>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {TENANT_LIMIT_ACTIONS.map((action) => (
                <QuotaRow key={action} entry={usageByAction.get(action)!} cap={capFor(action)} killed={actionKilled(action)} />
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Policy audit and human controls">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="policy-audit-title">
            <p className="section-label">Versioned governance</p>
            <h3 id="policy-audit-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Effective version and audit</h3>
            <div className="mt-3 rounded-xl border p-3" style={TONE_STYLE[auditRecorded ? "success" : "warning"]}>
              <p className="text-sm font-semibold">{auditRecorded ? "✓ Recorded for current versions" : "! Audit review required"}</p>
              <p className="mt-2 break-all font-mono text-[0.68rem]">{props.policy.id}:v{props.policy.version}</p>
              {props.audit.state === "recorded" ? (
                <>
                  <p className="mt-2 break-all font-mono text-[0.68rem]">{props.audit.eventId}</p>
                  <p className="mt-1 text-xs">{props.audit.actorId} · <time dateTime={props.audit.recordedAt}>{formatTimestamp(props.audit.recordedAt)} UTC</time></p>
                </>
              ) : <p className="mt-1 text-xs leading-relaxed">No current audit receipt was supplied. Editing remains unavailable until human review is recorded.</p>}
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="review-gates-title">
            <p className="section-label">Human gates</p>
            <h3 id="review-gates-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Review requirements</h3>
            <ul className="mt-3 space-y-2">
              <Flag label="Source plans" enabled={props.policy.requireSourcePlanApproval} />
              <Flag label="Knowledge" enabled={props.policy.requireKnowledgeReview} />
              <Flag label="ICP" enabled={props.policy.requireIcpReview} />
              <Flag label="Lead plays" enabled={props.policy.requireLeadPlayReview} />
              <Flag label="Contacts" enabled={props.policy.requireContactReview} />
              <Flag label="Outreach" enabled={props.policy.requireOutreachReview} />
            </ul>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="policy-controls-title">
            <p className="section-label">Human controlled</p>
            <h3 id="policy-controls-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Policy controls</h3>
            <p id="tenant-policy-actions-help" className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Controls appear only for the exact active scope and explicit final authorization. Changes are handled outside this display.
            </p>
            {canEditPolicy || canEditLimits || canReviewAudit ? (
              <div className="mt-4 grid gap-2" aria-label="Authorized tenant policy actions">
                {canEditPolicy ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={TONE_STYLE.accent} aria-describedby="tenant-policy-actions-help" onClick={() => props.onEditPolicy?.(props.policy)}>Edit tenant policy</button> : null}
                {canEditLimits ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-primary)" }} aria-describedby="tenant-policy-actions-help" onClick={() => props.onEditLimits?.(props.limits)}>Edit quota limits</button> : null}
                {canReviewAudit ? <button type="button" className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={TONE_STYLE.warning} aria-describedby="tenant-policy-actions-help" onClick={() => props.onReviewAudit?.(props.policy)}>Review policy audit</button> : null}
              </div>
            ) : <p className="mt-4 rounded-xl border p-3 text-xs leading-relaxed" style={TONE_STYLE.muted}>No policy changes are authorized for this exact state.</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
