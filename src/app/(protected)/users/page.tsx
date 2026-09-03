import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { LocalMembershipAdminControls } from "@/components/admin/local-membership-admin-controls";
import { PageShell } from "@/components/page-shell";
import { getTenantSession, type TenantSession } from "@/lib/auth";
import { withDbStatementTimeout, withTenantDbContext } from "@/lib/db/index";
import { startRouteTiming } from "@/lib/route-timing";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import {
  createLocalTenantMembershipAdministrationService,
  isLocalMembershipAdministrationAvailable,
} from "@/lib/tenancy/local-membership-administration";
import type { MembershipHistoryView, MembershipView } from "@/lib/tenancy/memberships";
import {
  createTenantQueryRepository,
  type MembershipDirectoryEntry,
  type RoleBinding,
} from "@/lib/tenancy/queries";
import type { MembershipStatus } from "@/lib/tenancy/types";

export const metadata: Metadata = { title: "Users | Nova Trade Lead Management" };

type Directory = Readonly<{
  memberships: readonly MembershipView[];
  history: readonly MembershipHistoryView[];
  actor: MembershipView;
}>;

const CURRENT_MEMBERSHIP_STATUSES = new Set<MembershipStatus>([
  "pending",
  "active",
  "suspended",
  "disabled",
]);
const TERMINAL_MEMBERSHIP_STATUSES = new Set<MembershipStatus>([
  "revoked",
  "removed",
  "expired",
]);

export default async function UsersPage() {
  const logRouteTiming = startRouteTiming("/users");
  let tenantSession: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  if (!tenantSession || tenantSession.workspaceId !== null) {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  try {
    await assertTenantPermission(tenantSession, "membership:read", { action: "users.page" });
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  const localMutationsAvailable = isLocalMembershipAdministrationAvailable();
  let directory: Directory;
  try {
    directory = await runWithTenantContext(
      tenantSession,
      `users-page:${randomUUID()}`,
      () => withTenantDbContext((db) => withDbStatementTimeout(10_000, async () => {
        if (localMutationsAvailable) {
          const service = createLocalTenantMembershipAdministrationService(db);
          const memberships = await service.listCurrent(tenantSession);
          const history = await service.listHistory(tenantSession);
          return validateDirectory(tenantSession, memberships, history);
        }
        return loadReadOnlyDirectory(tenantSession, createTenantQueryRepository(db));
      })),
    );
    logRouteTiming(200);
  } catch {
    logRouteTiming(503, { reason: "members_load_error" });
    return <UsersUnavailable reason="members_load_error" />;
  }

  const active = directory.memberships.filter((membership) => membership.status === "active").length;
  const pending = directory.memberships.filter((membership) => membership.status === "pending").length;
  const suspended = directory.memberships.filter((membership) => membership.status === "suspended").length;
  const withoutRole = directory.memberships.filter((membership) => membership.role === null).length;
  const mutationsEnabled = localMutationsAvailable && (tenantSession.role === "owner" || tenantSession.role === "admin");

  return (
    <PageShell
      title="Tenant Members"
      description="Review canonical membership state and recorded role history for this tenant."
      stats={[
        { label: "Members", value: String(directory.memberships.length) },
        { label: "Active", value: String(active) },
        { label: "Pending", value: String(pending) },
        { label: "Suspended", value: String(suspended) },
        { label: "No Current Role", value: String(withoutRole) },
      ]}
    >
      <LocalMembershipAdminControls
        actor={directory.actor}
        memberships={directory.memberships}
        history={directory.history}
        mutationsEnabled={mutationsEnabled}
      />
    </PageShell>
  );
}

async function loadReadOnlyDirectory(
  session: TenantSession,
  repository: ReturnType<typeof createTenantQueryRepository>,
): Promise<Directory> {
  const snapshotAt = Date.now();
  const [memberships, roleBindings] = await Promise.all([
    repository.listMembershipDirectory(session.tenantId, session.membershipId, session.userId),
    repository.listRoleBindings(session.tenantId),
  ]);
  return projectReadOnlyDirectory(session, memberships, roleBindings, snapshotAt);
}

function projectReadOnlyDirectory(
  session: TenantSession,
  memberships: readonly MembershipDirectoryEntry[],
  roleBindings: readonly RoleBinding[],
  snapshotAt: number,
): Directory {
  const membershipIds = new Set(memberships.map((membership) => membership.id));
  const actorIdentityMatches = memberships.filter((membership) => membership.actorIdentityMatches);
  if (membershipIds.size !== memberships.length
    || actorIdentityMatches.length !== 1
    || actorIdentityMatches[0].id !== session.membershipId
    || new Set(roleBindings.map((binding) => binding.id)).size !== roleBindings.length
    || memberships.some((membership) => membership.tenantId !== session.tenantId)
    || roleBindings.some((binding) => binding.tenantId !== session.tenantId
      || !membershipIds.has(binding.membershipId)
      || !validRoleBindingTime(binding, snapshotAt)
      || (binding.assignedByMembershipId !== null && !membershipIds.has(binding.assignedByMembershipId)))) {
    throw new Error("Invalid tenant member snapshot.");
  }

  const current: MembershipView[] = [];
  const history: MembershipHistoryView[] = [];
  for (const membership of memberships) {
    const bindings = roleBindings.filter((binding) => binding.membershipId === membership.id);
    const currentBindings = bindings.filter((binding) => binding.revokedAt === null);
    if (currentBindings.length > 1) throw new Error("Invalid tenant member snapshot.");
    if (TERMINAL_MEMBERSHIP_STATUSES.has(membership.status) && currentBindings.length !== 0) {
      throw new Error("Invalid tenant member snapshot.");
    }
    const roleBinding = currentBindings[0] ?? null;
    const view: MembershipView = {
      tenantId: membership.tenantId,
      membershipId: membership.id,
      status: membership.status,
      role: roleBinding?.role ?? null,
      workspaceId: membership.workspaceId,
    };
    if (CURRENT_MEMBERSHIP_STATUSES.has(membership.status)) current.push(view);
    history.push({
      ...view,
      roleBindings: bindings.map((binding) => ({
        id: binding.id,
        role: binding.role,
        revokedAt: binding.revokedAt,
        reasonCode: binding.reasonCode,
      })),
    });
  }

  const actorBinding = roleBindings.filter((binding) => binding.id === session.roleBindingId
    && binding.membershipId === session.membershipId && binding.revokedAt === null);
  if (actorBinding.length !== 1 || actorBinding[0].role !== session.role) {
    throw new Error("Invalid tenant member snapshot.");
  }
  return validateDirectory(session, current, history);
}

function validRoleBindingTime(binding: RoleBinding, snapshotAt: number): boolean {
  const createdAt = Date.parse(binding.createdAt);
  const validFrom = Date.parse(binding.validFrom);
  const revokedAt = binding.revokedAt === null ? null : Date.parse(binding.revokedAt);
  return Number.isFinite(createdAt) && createdAt <= snapshotAt
    && Number.isFinite(validFrom) && createdAt <= validFrom && validFrom <= snapshotAt
    && (revokedAt === null || (Number.isFinite(revokedAt) && revokedAt >= validFrom && revokedAt <= snapshotAt));
}

function validateDirectory(
  session: TenantSession,
  memberships: readonly MembershipView[],
  history: readonly MembershipHistoryView[],
): Directory {
  const currentById = new Map(memberships.map((membership) => [membership.membershipId, membership]));
  const historyById = new Map(history.map((membership) => [membership.membershipId, membership]));
  if (currentById.size !== memberships.length
    || historyById.size !== history.length
    || memberships.some((membership) => membership.tenantId !== session.tenantId)
    || history.some((membership) => membership.tenantId !== session.tenantId)
    || memberships.some((membership) => !CURRENT_MEMBERSHIP_STATUSES.has(membership.status))) {
    throw new Error("Invalid tenant member snapshot.");
  }

  for (const membership of memberships) {
    const historical = historyById.get(membership.membershipId);
    if (!historical || !sameMembershipFacts(membership, historical)) {
      throw new Error("Invalid tenant member snapshot.");
    }
  }
  for (const historical of history) {
    const current = currentById.get(historical.membershipId);
    const terminal = TERMINAL_MEMBERSHIP_STATUSES.has(historical.status);
    if ((terminal && current !== undefined)
      || (!terminal && (current === undefined || !sameMembershipFacts(current, historical)))) {
      throw new Error("Invalid tenant member snapshot.");
    }
  }

  const actors = memberships.filter((membership) => membership.membershipId === session.membershipId);
  if (actors.length !== 1 || actors[0].status !== "active" || actors[0].role !== session.role
    || actors[0].workspaceId !== null) {
    throw new Error("Invalid tenant member snapshot.");
  }
  return { memberships, history, actor: actors[0] };
}

function sameMembershipFacts(
  current: MembershipView,
  historical: MembershipHistoryView,
): boolean {
  return historical.tenantId === current.tenantId
    && historical.membershipId === current.membershipId
    && historical.status === current.status
    && historical.role === current.role
    && historical.workspaceId === current.workspaceId;
}

function UsersUnavailable({ reason }: Readonly<{ reason: "tenant_scope_unavailable" | "members_load_error" }>) {
  const scopeUnavailable = reason === "tenant_scope_unavailable";
  return (
    <PageShell title="Tenant Members" description="Membership administration is unavailable until a canonical tenant scope can be verified.">
      <section className="glass rounded-2xl p-5" role="alert" aria-labelledby="users-unavailable-title" data-users-state={reason}>
        <p className="section-label">Read-only recovery</p>
        <h2 id="users-unavailable-title" className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Tenant members unavailable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {scopeUnavailable
            ? "Your tenant-wide membership scope could not be verified. No user, membership, territory, or market-access records were read."
            : "The canonical tenant membership snapshot could not be loaded. No platform-global user or market-access fallback was attempted."}
        </p>
        <a href="/users" className="btn-primary mt-4 inline-flex text-center">Reload members</a>
      </section>
    </PageShell>
  );
}
