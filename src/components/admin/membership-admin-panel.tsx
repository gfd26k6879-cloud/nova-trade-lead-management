"use client";

import type { CSSProperties } from "react";
import { getTenantPermissionDecision, type TenantPermission } from "@/lib/permissions";
import type {
  MembershipHistoryView,
  MembershipView,
} from "@/lib/tenancy/memberships";
import type { LaunchRole, MembershipStatus } from "@/lib/tenancy/types";

const MUTATION_PERMISSIONS = ["membership:invite", "role:assign", "membership:manage"] as const satisfies readonly TenantPermission[];
type MutationPermission = (typeof MUTATION_PERMISSIONS)[number];

type ReadyProps = Readonly<{
  state: "ready";
  actor: MembershipView;
  memberships: readonly MembershipView[];
  history: readonly MembershipHistoryView[];
  /** Final policy decisions supplied by the canonical authorization boundary. Missing decisions deny. */
  policyAuthorizations: Readonly<Partial<Record<MutationPermission, boolean>>>;
  onInvite?: () => void;
  onChangeRole?: (membership: MembershipView) => void;
  onSuspend?: (membership: MembershipView) => void;
  error?: never;
}>;

export type MembershipAdminPanelProps =
  | Readonly<{ state: "loading"; error?: never; actor?: never; memberships?: never; history?: never; policyAuthorizations?: never }>
  | Readonly<{ state: "error"; error: string; actor?: never; memberships?: never; history?: never; policyAuthorizations?: never }>
  | Readonly<{ state: "empty"; error?: never; actor?: never; memberships?: never; history?: never; policyAuthorizations?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "muted" | "accent";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
  accent: { background: "var(--accent-light)", borderColor: "var(--surface-info-border)", color: "var(--accent)" },
});

const STATUS_META: Readonly<Record<MembershipStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = Object.freeze({
  pending: { label: "Invitation pending", symbol: "…", tone: "warning" },
  active: { label: "Active", symbol: "●", tone: "success" },
  suspended: { label: "Suspended", symbol: "Ⅱ", tone: "warning" },
  disabled: { label: "Disabled", symbol: "×", tone: "danger" },
  revoked: { label: "Revoked", symbol: "×", tone: "danger" },
  removed: { label: "Removed", symbol: "—", tone: "muted" },
  expired: { label: "Expired", symbol: "⌛", tone: "muted" },
});

const ROLE_LABEL: Readonly<Record<LaunchRole, string>> = Object.freeze({
  owner: "Owner",
  admin: "Administrator",
  strategist_manager: "Strategist manager",
  researcher: "Researcher",
  reviewer: "Reviewer",
  outreach_operator: "Outreach operator",
  analyst_read_only: "Read-only analyst",
});

const PERMISSION_LABEL: Readonly<Record<MutationPermission, string>> = Object.freeze({
  "membership:invite": "Invite members",
  "role:assign": "Change roles",
  "membership:manage": "Suspend members",
});

function StatePanel({ state, message }: Readonly<{ state: "loading" | "error" | "empty" | "denied"; message: string }>) {
  const loading = state === "loading";
  const alert = state === "error" || state === "denied";
  const title = loading
    ? "Loading membership administration"
    : state === "empty"
      ? "No memberships yet"
      : "Membership administration unavailable";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-membership-state={state}
      aria-labelledby={`membership-admin-${state}-title`}
      role={alert ? "alert" : "status"}
      aria-busy={loading ? true : undefined}
    >
      <p className="section-label">Administration · Memberships</p>
      <h2 id={`membership-admin-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function exactMember(left: MembershipView, right: MembershipView): boolean {
  return left.tenantId === right.tenantId
    && left.membershipId === right.membershipId
    && left.status === right.status
    && left.role === right.role
    && left.workspaceId === right.workspaceId;
}

function validScope(props: ReadyProps): boolean {
  if (props.actor.status !== "active" || props.actor.role === null) return false;
  if (!getTenantPermissionDecision(props.actor.role, "membership:read").allowed) return false;
  if (!props.memberships.some((membership) => exactMember(membership, props.actor))) return false;
  if (new Set(props.memberships.map((membership) => membership.membershipId)).size !== props.memberships.length) return false;
  if (new Set(props.history.map((membership) => membership.membershipId)).size !== props.history.length) return false;
  return props.memberships.every((membership) => membership.tenantId === props.actor.tenantId)
    && props.history.every((membership) => membership.tenantId === props.actor.tenantId);
}

function permissionState(props: ReadyProps, permission: MutationPermission): Readonly<{ label: string; tone: Tone; allowed: boolean }> {
  const roleDecision = getTenantPermissionDecision(props.actor.role, permission);
  if (!roleDecision.allowed) return { label: "Denied by role", tone: "danger", allowed: false };
  if (roleDecision.decision === "C" && props.policyAuthorizations[permission] !== true) {
    return { label: "Policy authorization required", tone: "warning", allowed: false };
  }
  return { label: "Authorized", tone: "success", allowed: true };
}

function MembershipBadge({ status }: Readonly<{ status: MembershipStatus }>) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      data-membership-status={status}
      style={TONE_STYLE[meta.tone]}
    >
      <span aria-hidden="true">{meta.symbol}</span> {meta.label}
    </span>
  );
}

function MembershipCard({
  membership,
  actor,
  canChangeRole,
  canSuspend,
  onChangeRole,
  onSuspend,
}: Readonly<{
  membership: MembershipView;
  actor: MembershipView;
  canChangeRole: boolean;
  canSuspend: boolean;
  onChangeRole?: (membership: MembershipView) => void;
  onSuspend?: (membership: MembershipView) => void;
}>) {
  const isActor = membership.membershipId === actor.membershipId;
  const roleChangeAllowed = canChangeRole
    && !isActor
    && membership.role !== null
    && (membership.status === "active" || membership.status === "pending")
    && Boolean(onChangeRole);
  const suspendAllowed = canSuspend
    && !isActor
    && membership.status === "active"
    && membership.role !== "owner"
    && Boolean(onSuspend);
  const titleId = `membership-${membership.membershipId}-title`;

  return (
    <article className="min-w-0 rounded-xl border p-3 sm:p-4" aria-labelledby={titleId} style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">{isActor ? "Current administrator" : membership.status === "pending" ? "Pending invitation" : "Member"}</p>
          <h4 id={titleId} className="mt-1 break-all font-mono text-xs font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {membership.membershipId}
          </h4>
        </div>
        <MembershipBadge status={membership.status} />
      </header>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--table-row-border)" }}>
          <dt className="section-label">Role</dt>
          <dd className="mt-1 font-semibold" style={{ color: "var(--text-primary)" }}>
            {membership.role ? ROLE_LABEL[membership.role] : "No active role"}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: "var(--table-row-border)" }}>
          <dt className="section-label">Scope</dt>
          <dd className="mt-1 break-all font-mono text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {membership.workspaceId ? `Workspace ${membership.workspaceId}` : "Tenant-wide"}
          </dd>
        </div>
      </dl>

      {roleChangeAllowed || suspendAllowed ? (
        <footer className="mt-3 flex flex-wrap gap-2 border-t pt-3" aria-label={`Human actions for membership ${membership.membershipId}`} style={{ borderColor: "var(--table-row-border)" }}>
          {roleChangeAllowed ? (
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: "var(--surface-card-border)", color: "var(--text-primary)" }}
              onClick={() => onChangeRole?.(membership)}
            >
              Change role
            </button>
          ) : null}
          {suspendAllowed ? (
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={TONE_STYLE.warning}
              onClick={() => onSuspend?.(membership)}
            >
              Suspend member
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

export function MembershipAdminPanel(props: MembershipAdminPanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Checking tenant scope, member state, and administration permissions." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") {
    return <StatePanel state="empty" message="There are no current memberships or pending invitations to display." />;
  }
  if (!validScope(props)) {
    return <StatePanel state="denied" message="The membership scope or current administrator state could not be verified." />;
  }

  const invitePermission = permissionState(props, "membership:invite");
  const rolePermission = permissionState(props, "role:assign");
  const managePermission = permissionState(props, "membership:manage");
  const invitations = props.memberships.filter((membership) => membership.status === "pending");
  const tenantMembers = props.memberships.filter((membership) => membership.status !== "pending" && membership.workspaceId === null);
  const workspaceMembers = props.memberships.filter((membership) => membership.status !== "pending" && membership.workspaceId !== null);

  return (
    <section className="space-y-5" data-surface="membership-admin-panel" aria-labelledby="membership-admin-title">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-label">Administration · Memberships</p>
            <h2 id="membership-admin-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Tenant access and responsibility
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Review tenant-wide and workspace-scoped members, pending invitations, role impact, and the recorded role-binding audit state.
            </p>
          </div>
          {invitePermission.allowed && props.onInvite ? (
            <button
              type="button"
              className="shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={TONE_STYLE.accent}
              onClick={props.onInvite}
            >
              Invite member
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="tenant-members-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-label">Tenant scope</p>
                <h3 id="tenant-members-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tenant-wide members</h3>
              </div>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>{tenantMembers.length}</span>
            </div>
            {tenantMembers.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {tenantMembers.map((membership) => (
                  <MembershipCard key={membership.membershipId} membership={membership} actor={props.actor} canChangeRole={rolePermission.allowed} canSuspend={managePermission.allowed} onChangeRole={props.onChangeRole} onSuspend={props.onSuspend} />
                ))}
              </div>
            ) : <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No tenant-wide members.</p>}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="workspace-members-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-label">Workspace scope</p>
                <h3 id="workspace-members-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Workspace members</h3>
              </div>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>{workspaceMembers.length}</span>
            </div>
            {workspaceMembers.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {workspaceMembers.map((membership) => (
                  <MembershipCard key={membership.membershipId} membership={membership} actor={props.actor} canChangeRole={rolePermission.allowed} canSuspend={managePermission.allowed} onChangeRole={props.onChangeRole} onSuspend={props.onSuspend} />
                ))}
              </div>
            ) : <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No workspace-scoped members.</p>}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="pending-invitations-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="section-label">Invitation state</p>
                <h3 id="pending-invitations-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Pending invitations</h3>
              </div>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>{invitations.length}</span>
            </div>
            {invitations.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {invitations.map((membership) => (
                  <MembershipCard key={membership.membershipId} membership={membership} actor={props.actor} canChangeRole={rolePermission.allowed} canSuspend={managePermission.allowed} onChangeRole={props.onChangeRole} onSuspend={props.onSuspend} />
                ))}
              </div>
            ) : <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No pending invitations.</p>}
          </section>
        </div>

        <aside className="space-y-5" aria-label="Permission impact and audit state">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="membership-permissions-title">
            <p className="section-label">Current administrator</p>
            <h3 id="membership-permissions-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Permission impact</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {props.actor.role ? ROLE_LABEL[props.actor.role] : "No active role"} · matrix and policy must both permit an action.
            </p>
            <dl className="mt-4 space-y-2">
              {MUTATION_PERMISSIONS.map((permission) => {
                const state = permissionState(props, permission);
                return (
                  <div key={permission} className="rounded-xl border p-3" data-permission={permission} data-permission-allowed={state.allowed} style={{ borderColor: "var(--surface-card-border)" }}>
                    <dt className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{PERMISSION_LABEL[permission]}</dt>
                    <dd className="mt-1 text-xs font-semibold" style={{ color: TONE_STYLE[state.tone].color }}>{state.label}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Available controls submit canonical tenant membership changes. Local invitations create only pending records; they do not create accounts or send email.
            </p>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="membership-audit-title">
            <p className="section-label">Recorded state</p>
            <h3 id="membership-audit-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Role-binding audit</h3>
            {props.history.length ? (
              <ol className="mt-4 space-y-3" aria-label="Membership role-binding audit state">
                {props.history.map((entry) => (
                  <li key={entry.membershipId} className="min-w-0 rounded-xl border p-3" style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                    <p className="break-all font-mono text-[0.7rem] font-semibold" style={{ color: "var(--text-primary)" }}>{entry.membershipId}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{entry.roleBindings.length} recorded role {entry.roleBindings.length === 1 ? "binding" : "bindings"}</p>
                    {entry.roleBindings.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {entry.roleBindings.map((binding) => (
                          <li key={binding.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs" style={{ borderColor: "var(--table-row-border)" }}>
                            <span style={{ color: "var(--text-secondary)" }}>{ROLE_LABEL[binding.role]} · {binding.reasonCode.replaceAll("_", " ")}</span>
                            <span className="font-semibold" style={{ color: binding.revokedAt ? "var(--text-tertiary)" : "var(--success-text)" }}>{binding.revokedAt ? "Closed" : "Current"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No role binding recorded.</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 text-sm" style={{ color: "var(--text-secondary)" }}>No role-binding history is available.</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
