import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { getTenantSession, requirePermission, type TenantSession } from "@/lib/auth";
import { withDbStatementTimeout, withTenantDbContext } from "@/lib/db/index";
import { startRouteTiming } from "@/lib/route-timing";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import {
  createTenantQueryRepository,
  type Membership,
  type RoleBinding,
} from "@/lib/tenancy/queries";

export const metadata: Metadata = { title: "Users | Nova Trade Lead Management" };

type TenantMember = Readonly<{
  membership: Membership;
  roleBinding: RoleBinding | null;
}>;

export default async function UsersPage() {
  const logRouteTiming = startRouteTiming("/users");
  const platformSession = await requirePermission("users:manage");
  let tenantSession: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  if (
    !tenantSession
    || tenantSession.userId !== platformSession.userId
    || tenantSession.workspaceId !== null
  ) {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  try {
    await assertTenantPermission(tenantSession, "membership:read", { action: "users.page" });
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <UsersUnavailable reason="tenant_scope_unavailable" />;
  }

  let members: TenantMember[];
  try {
    members = await runWithTenantContext(
      tenantSession,
      `users-page:${randomUUID()}`,
      () => withTenantDbContext((db) => withDbStatementTimeout(10_000, async () => {
        const repository = createTenantQueryRepository(db);
        const snapshotAt = Date.now();
        const memberships = await repository.listMemberships(tenantSession.tenantId);
        const roleBindings = await Promise.all(memberships.map((membership) => (
          repository.getCurrentRoleBinding(tenantSession.tenantId, membership.id)
        )));
        return validateMembers(tenantSession, memberships, roleBindings, snapshotAt);
      })),
    );
    logRouteTiming(200);
  } catch {
    logRouteTiming(503, { reason: "members_load_error" });
    return <UsersUnavailable reason="members_load_error" />;
  }

  const active = members.filter(({ membership }) => membership.status === "active").length;
  const pending = members.filter(({ membership }) => membership.status === "pending").length;
  const suspended = members.filter(({ membership }) => membership.status === "suspended").length;
  const withoutRole = members.filter(({ roleBinding }) => roleBinding === null).length;

  return (
    <PageShell
      title="Tenant Members"
      description="Review canonical memberships and current roles for this tenant."
      stats={[
        { label: "Members", value: String(members.length) },
        { label: "Active", value: String(active) },
        { label: "Pending", value: String(pending) },
        { label: "Suspended", value: String(suspended) },
        { label: "No Current Role", value: String(withoutRole) },
      ]}
    >
      <section className="glass rounded-2xl p-5" aria-labelledby="tenant-members-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Tenant scope</p>
            <h2 id="tenant-members-title" className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Canonical membership directory
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Only membership and role-binding records owned by the resolved tenant are shown. Platform-global user profiles and market-access records are not read by this page.
            </p>
          </div>
          <span className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            Tenant-wide scope
          </span>
        </div>

        {members.length === 0 ? (
          <p className="mt-5 rounded-xl border p-4 text-sm" role="status" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
            No canonical memberships are available for this tenant.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Membership</th>
                  <th>Identity</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Current role</th>
                </tr>
              </thead>
              <tbody>
                {members.map(({ membership, roleBinding }) => (
                  <tr key={membership.id}>
                    <td className="font-mono text-xs">{membership.id}</td>
                    <td className="font-mono text-xs">{membership.authIdentityId ?? "Pending identity"}</td>
                    <td>{membership.workspaceId ? `Workspace ${membership.workspaceId}` : "Tenant-wide"}</td>
                    <td>{formatLabel(membership.status)}</td>
                    <td>{roleBinding ? formatLabel(roleBinding.role) : "No current role"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-5" aria-labelledby="platform-users-title">
        <p className="section-label">Platform administration</p>
        <h2 id="platform-users-title" className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Legacy user controls are unavailable here
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Invitations, platform roles, and market-access controls remain hidden until their records have canonical tenant ownership. This prevents one tenant from enumerating or changing another tenant&apos;s identities.
        </p>
      </section>
    </PageShell>
  );
}

function validateMembers(
  session: TenantSession,
  memberships: readonly Membership[],
  roleBindings: readonly (RoleBinding | null)[],
  snapshotAt: number,
): TenantMember[] {
  if (memberships.length !== roleBindings.length) throw new Error("Invalid tenant member snapshot.");
  if (new Set(memberships.map((membership) => membership.id)).size !== memberships.length) {
    throw new Error("Invalid tenant member snapshot.");
  }

  const members = memberships.map((membership, index) => {
    const roleBinding = roleBindings[index] ?? null;
    if (membership.tenantId !== session.tenantId) throw new Error("Invalid tenant member snapshot.");
    if (
      roleBinding
      && (
        roleBinding.tenantId !== session.tenantId
        || roleBinding.membershipId !== membership.id
        || roleBinding.revokedAt !== null
        || !Number.isFinite(Date.parse(roleBinding.validFrom))
        || Date.parse(roleBinding.validFrom) > snapshotAt
      )
    ) {
      throw new Error("Invalid tenant member snapshot.");
    }
    return { membership, roleBinding };
  });

  const actor = members.filter(({ membership }) => membership.id === session.membershipId);
  if (
    actor.length !== 1
    || actor[0].membership.authIdentityId !== session.userId
    || actor[0].membership.status !== "active"
    || actor[0].membership.workspaceId !== null
    || actor[0].roleBinding?.id !== session.roleBindingId
    || actor[0].roleBinding.role !== session.role
  ) {
    throw new Error("Invalid tenant member snapshot.");
  }

  return members;
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function UsersUnavailable({ reason }: Readonly<{ reason: "tenant_scope_unavailable" | "members_load_error" }>) {
  const scopeUnavailable = reason === "tenant_scope_unavailable";
  return (
    <PageShell
      title="Tenant Members"
      description="Membership administration is unavailable until a canonical tenant scope can be verified."
    >
      <section className="glass rounded-2xl p-5" role="alert" aria-labelledby="users-unavailable-title" data-users-state={reason}>
        <p className="section-label">Read-only recovery</p>
        <h2 id="users-unavailable-title" className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Tenant members unavailable
        </h2>
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
