"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import type { AppUser } from "@/lib/app-users";
import type { LocationMarket, UserMarketAccess } from "@/lib/db/queries";
import { COUNTRY_NAMES, type CountryCode } from "@/lib/geography";
import type { AppRole } from "@/lib/permissions";
import {
  createUserAction,
  removeUserAction,
  resetUserPasswordAction,
  updateUserMarketAccessAction,
  updateUserRoleAction,
  updateUserStatusAction,
  updateUserTeamAction,
} from "@/lib/users/actions";

type StatusFilter = "all" | "active" | "disabled";
type RoleFilter = "all" | AppRole;

export function UsersClient({
  initialUsers,
  markets,
  initialMarketAccess,
}: {
  initialUsers: AppUser[];
  markets: LocationMarket[];
  initialMarketAccess: Record<string, UserMarketAccess[]>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [marketAccess, setMarketAccess] = useState(initialMarketAccess);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("researcher");
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUsers[0]?.user_id ?? null);
  const [removeCandidate, setRemoveCandidate] = useState<AppUser | null>(null);
  const [pending, startTransition] = useTransition();

  const assignedMarketIds = (userId: string) => new Set((marketAccess[userId] ?? []).map((entry) => entry.market_id));

  const activeUsers = users.filter((user) => user.status === "active").length;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const researcherCount = users.filter((user) => user.role === "researcher").length;
  const disabledCount = users.length - activeUsers;
  const activeResearchersWithoutAccess = users.filter((user) => (
    user.status === "active" && user.role === "researcher" && (marketAccess[user.user_id]?.length ?? 0) === 0
  )).length;
  const teamLeadCount = users.filter((user) => user.is_team_lead && user.status === "active").length;
  const teamLeads = users.filter((candidate) => candidate.is_team_lead && candidate.status === "active");

  const countryCodes = useMemo(() => (
    Array.from(new Set(markets.map((market) => market.country_code))).sort() as CountryCode[]
  ), [markets]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!normalizedQuery) return true;
      return getUserSearchText(user, marketAccess[user.user_id] ?? []).includes(normalizedQuery);
    });
  }, [marketAccess, query, roleFilter, statusFilter, users]);

  const selectedUser = users.find((user) => user.user_id === selectedUserId)
    ?? filteredUsers[0]
    ?? users[0]
    ?? null;
  const selectedAccess = selectedUser ? marketAccess[selectedUser.user_id] ?? [] : [];
  const selectedMarketIds = selectedUser ? assignedMarketIds(selectedUser.user_id) : new Set<string>();

  const refreshUser = (updated: AppUser) => {
    setUsers((current) => {
      const exists = current.some((user) => user.user_id === updated.user_id);
      return exists
        ? current.map((user) => user.user_id === updated.user_id ? updated : user)
        : [...current, updated].sort((a, b) => a.email.localeCompare(b.email));
    });
  };

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createUserAction({ email, displayName, role });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      refreshUser(result.user);
      setSelectedUserId(result.user.user_id);
      setEmailNotice(`Welcome email sent to ${result.user.email}.`);
      setEmail("");
      setDisplayName("");
      setRole("researcher");
      toast.success("User created and welcome email sent");
    });
  };

  const handleRole = (userId: string, nextRole: AppRole) => {
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, nextRole);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, role: nextRole } : user));
      toast.success("Role updated");
    });
  };

  const handleStatus = (user: AppUser) => {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    startTransition(async () => {
      const result = await updateUserStatusAction(user.user_id, nextStatus);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setUsers((current) => current.map((row) => row.user_id === user.user_id ? { ...row, status: nextStatus } : row));
      toast.success(nextStatus === "active" ? "User enabled" : "User disabled");
    });
  };

  const handleRemove = (user: AppUser) => {
    startTransition(async () => {
      const result = await removeUserAction(user.user_id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const nextSelectedUserId = users.find((row) => row.user_id !== user.user_id)?.user_id ?? null;
      setUsers((current) => current.filter((row) => row.user_id !== user.user_id));
      setMarketAccess((state) => {
        const next = { ...state };
        delete next[user.user_id];
        return next;
      });
      setSelectedUserId((current) => current === user.user_id ? nextSelectedUserId : current);
      setRemoveCandidate(null);
      toast.success("User removed");
    });
  };

  const handleTeam = (user: AppUser, patch: Partial<Pick<AppUser, "is_team_lead" | "team_lead_user_id" | "team_label">>) => {
    const next = { ...user, ...patch };
    setUsers((current) => current.map((row) => row.user_id === user.user_id ? next : row));
    startTransition(async () => {
      const result = await updateUserTeamAction(user.user_id, {
        isTeamLead: next.is_team_lead,
        teamLeadUserId: next.team_lead_user_id,
        teamLabel: next.team_label,
      });
      if ("error" in result) {
        toast.error(result.error);
        setUsers((current) => current.map((row) => row.user_id === user.user_id ? user : row));
        return;
      }
      refreshUser(result.user);
      toast.success("Team updated");
    });
  };

  const handlePasswordReset = (user: AppUser) => {
    startTransition(async () => {
      const result = await resetUserPasswordAction(user.user_id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setEmailNotice(`Password reset email sent to ${user.email}.`);
      toast.success("Password reset email sent");
    });
  };

  const saveMarketAccess = (user: AppUser, nextIds: string[]) => {
    const current = marketAccess[user.user_id] ?? [];
    const previous = current;
    const uniqueNextIds = Array.from(new Set(nextIds));
    setMarketAccess((state) => ({
      ...state,
      [user.user_id]: markets
        .filter((market) => uniqueNextIds.includes(market.id))
        .map((market) => ({
          user_id: user.user_id,
          market_id: market.id,
          market_name: market.name,
          country_code: market.country_code,
          admin_area1: market.admin_area1,
        })),
    }));
    startTransition(async () => {
      const result = await updateUserMarketAccessAction(user.user_id, { marketIds: uniqueNextIds });
      if ("error" in result) {
        toast.error(result.error);
        setMarketAccess((state) => ({ ...state, [user.user_id]: previous }));
        return;
      }
      setMarketAccess((state) => ({ ...state, [user.user_id]: result.access }));
      toast.success("Territories updated");
    });
  };

  const handleMarketToggle = (user: AppUser, marketId: string) => {
    const current = marketAccess[user.user_id] ?? [];
    const currentIds = new Set(current.map((entry) => entry.market_id));
    if (currentIds.has(marketId)) currentIds.delete(marketId);
    else currentIds.add(marketId);
    saveMarketAccess(user, Array.from(currentIds));
  };

  const handleCountryToggle = (user: AppUser, countryCode: CountryCode) => {
    const current = marketAccess[user.user_id] ?? [];
    const currentIds = new Set(current.map((entry) => entry.market_id));
    const countryMarketIds = markets.filter((market) => market.country_code === countryCode).map((market) => market.id);
    const hasAllCountryMarkets = countryMarketIds.length > 0 && countryMarketIds.every((id) => currentIds.has(id));
    if (hasAllCountryMarkets) {
      countryMarketIds.forEach((id) => currentIds.delete(id));
    } else {
      countryMarketIds.forEach((id) => currentIds.add(id));
    }
    saveMarketAccess(user, Array.from(currentIds));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass min-w-0 rounded-2xl p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="section-label">User Management</p>
              <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Team access, roles, and lifecycle
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                See every account, inspect one person cleanly, and keep researcher territory access aligned with the live lead inventory.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:min-w-[24rem]">
              <MetricTile label="Active" value={activeUsers} tone="green" />
              <MetricTile label="No access" value={activeResearchersWithoutAccess} tone={activeResearchersWithoutAccess > 0 ? "amber" : "slate"} />
              <MetricTile label="Team leads" value={teamLeadCount} tone="blue" />
              <MetricTile label="Disabled" value={disabledCount} tone={disabledCount > 0 ? "red" : "slate"} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SummaryPill label="Total users" value={users.length} />
            <SummaryPill label="Admins" value={adminCount} />
            <SummaryPill label="Researchers" value={researcherCount} />
          </div>
        </section>

        <section className="glass min-w-0 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-label">Invite</p>
              <h3 className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Create user</h3>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--chip-bg)", color: "var(--accent)" }}>
              Email invite
            </span>
          </div>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreate();
            }}
          >
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="glass-input w-full"
                placeholder="researcher@example.com"
              />
            </Field>
            <Field label="Display name">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="glass-input w-full"
                placeholder="Name"
              />
            </Field>
            <Field label="Role">
              <select value={role} onChange={(event) => setRole(event.target.value as AppRole)} className="glass-select w-full">
                <option value="researcher">Researcher</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <button type="submit" className="btn-primary w-full" disabled={pending || !email.trim()}>
              Send invite
            </button>
          </form>

          {emailNotice && (
            <div className="mt-5 rounded-xl p-4" style={{ background: "var(--surface-info)", border: "1px solid var(--surface-info-border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                Email sent
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>{emailNotice}</p>
            </div>
          )}
        </section>
      </div>

      <section className="glass min-w-0 rounded-2xl p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="section-label">Directory</p>
            <h3 className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Users and territory access
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_10rem] xl:w-[42rem]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="glass-input w-full"
              placeholder="Search name, email, team, or territory"
              aria-label="Search users"
            />
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} className="glass-select w-full" aria-label="Filter by role">
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="researcher">Researchers</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="glass-select w-full" aria-label="Filter by status">
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="mt-5 hidden overflow-x-auto rounded-xl border lg:block" style={{ borderColor: "var(--table-border)" }}>
          <table className="glass-table min-w-[1100px]">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Team</th>
                <th>Territories</th>
                <th>Activity</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.user_id}
                  style={{ background: selectedUser?.user_id === user.user_id ? "var(--selection-bg)" : undefined }}
                >
                  <td className="min-w-[18rem] align-top">
                    <button
                      type="button"
                      className="group flex min-w-0 items-center gap-3 text-left"
                      onClick={() => setSelectedUserId(user.user_id)}
                    >
                      <UserAvatar user={user} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold" style={{ color: "var(--text-primary)" }}>
                          {displayNameFor(user)}
                        </span>
                        <span className="block truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {user.email}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="align-top">
                    <RoleControl user={user} pending={pending} onRole={handleRole} />
                  </td>
                  <td className="max-w-[14rem] align-top">
                    <TeamSummary user={user} />
                  </td>
                  <td className="max-w-[18rem] align-top">
                    <TerritorySummary user={user} access={marketAccess[user.user_id] ?? []} />
                  </td>
                  <td className="align-top">
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      <div>Last seen</div>
                      <div className="mt-1 font-medium" style={{ color: "var(--text-secondary)" }}>
                        {formatDateTime(user.last_seen_at)}
                      </div>
                    </div>
                  </td>
                  <td className="align-top">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="align-top">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handlePasswordReset(user)}>
                        Reset
                      </button>
                      <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handleStatus(user)}>
                        {user.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="btn-glass text-xs" style={{ color: "var(--danger-text)" }} disabled={pending} onClick={() => setRemoveCandidate(user)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                      No users match the current filters.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 lg:hidden">
          {filteredUsers.map((user) => (
            <article
              key={user.user_id}
              className="rounded-xl border p-4"
              style={{
                background: selectedUser?.user_id === user.user_id ? "var(--selection-bg)" : "var(--surface-card)",
                borderColor: "var(--surface-card-border)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setSelectedUserId(user.user_id)}>
                  <UserAvatar user={user} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold" style={{ color: "var(--text-primary)" }}>{displayNameFor(user)}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--text-tertiary)" }}>{user.email}</span>
                  </span>
                </button>
                <StatusBadge status={user.status} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <RoleControl user={user} pending={pending} onRole={handleRole} />
                <TeamSummary user={user} />
                <div className="sm:col-span-2">
                  <TerritorySummary user={user} access={marketAccess[user.user_id] ?? []} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-glass flex-1 text-xs" disabled={pending} onClick={() => handlePasswordReset(user)}>Reset</button>
                <button type="button" className="btn-glass flex-1 text-xs" disabled={pending} onClick={() => handleStatus(user)}>
                  {user.status === "active" ? "Disable" : "Enable"}
                </button>
                <button type="button" className="btn-glass flex-1 text-xs" style={{ color: "var(--danger-text)" }} disabled={pending} onClick={() => setRemoveCandidate(user)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedUser && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="glass min-w-0 rounded-2xl p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <UserAvatar user={selectedUser} size="lg" />
                <div className="min-w-0">
                  <p className="section-label">Selected User</p>
                  <h3 className="mt-2 truncate text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    {displayNameFor(selectedUser)}
                  </h3>
                  <p className="truncate text-sm" style={{ color: "var(--text-secondary)" }}>{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <RoleBadge role={selectedUser.role} />
                <StatusBadge status={selectedUser.status} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoRow label="User ID" value={selectedUser.user_id} />
              <InfoRow label="Created" value={formatDateTime(selectedUser.created_at)} />
              <InfoRow label="Last seen" value={formatDateTime(selectedUser.last_seen_at)} />
              <InfoRow label="Updated" value={formatDateTime(selectedUser.updated_at)} />
            </div>

            <div className="mt-5 rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)" }}>
              <p className="section-label">Role and team</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select
                    value={selectedUser.role}
                    aria-label={`Role for ${selectedUser.email}`}
                    onChange={(event) => handleRole(selectedUser.user_id, event.target.value as AppRole)}
                    className="glass-select w-full"
                    disabled={pending}
                  >
                    <option value="researcher">Researcher</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <Field label="Team label">
                  <input
                    value={selectedUser.team_label ?? ""}
                    aria-label={`Team label for ${selectedUser.email}`}
                    onChange={(event) => setUsers((current) => current.map((row) => row.user_id === selectedUser.user_id ? { ...row, team_label: event.target.value } : row))}
                    onBlur={() => {
                      const latest = users.find((row) => row.user_id === selectedUser.user_id);
                      if (latest) handleTeam(latest, {});
                    }}
                    className="glass-input w-full"
                    disabled={pending}
                    placeholder="Team label"
                  />
                </Field>
                <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={selectedUser.is_team_lead}
                    disabled={pending}
                    onChange={(event) => handleTeam(selectedUser, { is_team_lead: event.target.checked, team_lead_user_id: event.target.checked ? null : selectedUser.team_lead_user_id })}
                  />
                  Team lead
                </label>
                <Field label="Reports to">
                  <select
                    value={selectedUser.team_lead_user_id ?? ""}
                    aria-label={`Team lead for ${selectedUser.email}`}
                    onChange={(event) => handleTeam(selectedUser, { team_lead_user_id: event.target.value || null })}
                    className="glass-select w-full"
                    disabled={pending || selectedUser.is_team_lead}
                  >
                    <option value="">No team lead</option>
                    {teamLeads.filter((candidate) => candidate.user_id !== selectedUser.user_id).map((candidate) => (
                      <option key={candidate.user_id} value={candidate.user_id}>
                        {candidate.display_name || candidate.email}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4" style={{ background: "var(--danger-bg)", borderColor: "rgba(220, 38, 38, 0.24)" }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--danger-text)" }}>Account controls</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Reset access, disable sign-in, or remove the account.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handlePasswordReset(selectedUser)}>
                    Reset password
                  </button>
                  <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handleStatus(selectedUser)}>
                    {selectedUser.status === "active" ? "Disable user" : "Enable user"}
                  </button>
                  <button type="button" className="btn-glass text-xs" style={{ color: "var(--danger-text)" }} disabled={pending} onClick={() => setRemoveCandidate(selectedUser)}>
                    Remove user
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="glass min-w-0 rounded-2xl p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="section-label">Territory Access</p>
                <h3 className="mt-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selectedUser.role === "admin" ? "Full admin market access" : `${selectedAccess.length} assigned ${selectedAccess.length === 1 ? "territory" : "territories"}`}
                </h3>
              </div>
              <TerritorySummary user={selectedUser} access={selectedAccess} />
            </div>

            <div className="mt-5">
              <TerritorySelector
                user={selectedUser}
                markets={markets}
                countryCodes={countryCodes}
                selectedMarketIds={selectedMarketIds}
                pending={pending}
                onToggle={handleMarketToggle}
                onToggleCountry={handleCountryToggle}
              />
            </div>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeCandidate)}
        title="Remove user?"
        message={removeCandidate ? `Remove ${removeCandidate.email} from NoSite Leads. Their territory access will be deleted and active lead ownership will be released.` : ""}
        confirmLabel={pending ? "Removing..." : "Remove user"}
        cancelLabel="Keep user"
        onCancel={() => {
          if (!pending) setRemoveCandidate(null);
        }}
        onConfirm={() => {
          if (removeCandidate && !pending) handleRemove(removeCandidate);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" | "blue" | "slate" }) {
  const colors: Record<typeof tone, { background: string; border: string; text: string }> = {
    green: { background: "var(--score-high-bg)", border: "var(--score-high-border)", text: "var(--score-high-text)" },
    amber: { background: "var(--score-fair-bg)", border: "var(--score-fair-border)", text: "var(--score-fair-text)" },
    red: { background: "var(--danger-bg)", border: "rgba(220, 38, 38, 0.24)", text: "var(--danger-text)" },
    blue: { background: "var(--score-good-bg)", border: "var(--score-good-border)", text: "var(--score-good-text)" },
    slate: { background: "var(--surface-muted)", border: "var(--surface-card-border)", text: "var(--text-secondary)" },
  };
  const color = colors[tone];
  return (
    <div className="rounded-xl border px-3 py-2" style={{ background: color.background, borderColor: color.border }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: color.text }}>{label}</div>
      <div className="mt-1 text-xl font-semibold leading-none" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)" }}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border px-3 py-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="mt-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }} title={value}>{value}</div>
    </div>
  );
}

function RoleControl({ user, pending, onRole }: { user: AppUser; pending: boolean; onRole: (userId: string, role: AppRole) => void }) {
  return (
    <select
      value={user.role}
      aria-label={`Role for ${user.email}`}
      onChange={(event) => onRole(user.user_id, event.target.value as AppRole)}
      className="glass-select w-full min-w-[8rem] text-xs"
      disabled={pending}
    >
      <option value="researcher">Researcher</option>
      <option value="admin">Admin</option>
    </select>
  );
}

function TeamSummary({ user }: { user: AppUser }) {
  const leadName = user.team_lead_display_name || user.team_lead_email;
  return (
    <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
        {user.is_team_lead ? "Team lead" : leadName ? `Reports to ${leadName}` : "No team lead"}
      </div>
      <div className="truncate" title={user.team_label ?? undefined} style={{ color: "var(--text-tertiary)" }}>
        {user.team_label || "No team label"}
      </div>
    </div>
  );
}

function UserAvatar({ user, size = "md" }: { user: AppUser; size?: "md" | "lg" }) {
  const initials = getInitials(user);
  const dimensions = size === "lg" ? "h-14 w-14 text-base" : "h-10 w-10 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl border font-semibold ${dimensions}`}
      style={{
        background: user.role === "admin" ? "var(--chip-bg)" : "var(--surface-muted)",
        borderColor: user.role === "admin" ? "var(--search-border)" : "var(--surface-card-border)",
        color: user.role === "admin" ? "var(--accent)" : "var(--text-primary)",
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold capitalize" style={{
      background: role === "admin" ? "var(--chip-bg)" : "var(--chip-muted-bg)",
      color: role === "admin" ? "var(--accent)" : "var(--text-secondary)",
    }}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: AppUser["status"] }) {
  const active = status === "active";
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold capitalize" style={{
      background: active ? "var(--score-high-bg)" : "var(--danger-bg)",
      color: active ? "var(--score-high-text)" : "var(--danger-text)",
    }}>
      {status}
    </span>
  );
}

function TerritorySummary({ user, access }: { user: AppUser; access: UserMarketAccess[] }) {
  if (user.role === "admin") {
    return (
      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--chip-bg)", color: "var(--accent)" }}>
        All markets
      </span>
    );
  }
  if (access.length === 0) {
    return (
      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
        No access
      </span>
    );
  }
  const visible = access.slice(0, 2);
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((entry) => (
        <span key={entry.market_id} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--chip-bg)", color: "var(--accent)" }}>
          {entry.market_name} · {entry.country_code}
        </span>
      ))}
      {access.length > visible.length && (
        <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--chip-muted-bg)", color: "var(--text-secondary)" }}>
          +{access.length - visible.length}
        </span>
      )}
    </div>
  );
}

function TerritorySelector({
  user,
  markets,
  countryCodes,
  selectedMarketIds,
  pending,
  onToggle,
  onToggleCountry,
}: {
  user: AppUser;
  markets: LocationMarket[];
  countryCodes: CountryCode[];
  selectedMarketIds: Set<string>;
  pending: boolean;
  onToggle: (user: AppUser, marketId: string) => void;
  onToggleCountry: (user: AppUser, countryCode: CountryCode) => void;
}) {
  if (user.role === "admin") {
    return (
      <div className="rounded-xl border px-4 py-4 text-sm" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
        Admin accounts inherit all market access.
      </div>
    );
  }

  const selectedMarkets = markets.filter((market) => selectedMarketIds.has(market.id));
  const countryGroups = countryCodes
    .map((countryCode) => ({
      countryCode,
      markets: markets.filter((market) => market.country_code === countryCode),
    }))
    .filter((group) => group.markets.length > 0);

  return (
    <div className="space-y-4">
      {selectedMarkets.length === 0 ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
          No territory access. This researcher will not see market-visible lead inventory.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedMarkets.map((market) => (
            <span key={market.id} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "var(--chip-bg)", color: "var(--accent)" }}>
              {market.name} · {market.country_code}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {countryGroups.map((group) => {
          const selectedCount = group.markets.filter((market) => selectedMarketIds.has(market.id)).length;
          const checked = selectedCount === group.markets.length;
          const partial = selectedCount > 0 && !checked;
          return (
            <label
              key={group.countryCode}
              className="flex items-center gap-3 rounded-xl border px-3 py-3 text-sm"
              style={{
                background: selectedCount > 0 ? "var(--selection-bg)" : "var(--surface-card)",
                borderColor: selectedCount > 0 ? "var(--search-border)" : "var(--surface-card-border)",
                color: selectedCount > 0 ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={pending}
                aria-label={`Toggle ${countryName(group.countryCode)} country access`}
                onChange={() => onToggleCountry(user, group.countryCode)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{countryName(group.countryCode)}</span>
                <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {partial ? `${selectedCount}/${group.markets.length} selected` : checked ? "Selected" : `${group.markets.length} available`}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {markets.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No territories configured.</p>
      ) : (
        <details className="rounded-xl border p-4" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Area details</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {markets.map((market) => {
              const checked = selectedMarketIds.has(market.id);
              return (
                <label key={market.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{
                  background: checked ? "var(--selection-bg)" : "var(--surface-muted)",
                  borderColor: "var(--surface-card-border)",
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    aria-label={`${checked ? "Remove" : "Add"} ${market.name} area access`}
                    onChange={() => onToggle(user, market.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{market.name}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{market.country_code}</span>
                </label>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function displayNameFor(user: AppUser): string {
  return user.display_name || user.email;
}

function getInitials(user: AppUser): string {
  const source = user.display_name || user.email;
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return (words[0]?.[0] ?? "U").concat(words[1]?.[0] ?? "").toUpperCase();
}

function countryName(countryCode: CountryCode): string {
  return COUNTRY_NAMES[countryCode] ?? countryCode;
}

function getUserSearchText(user: AppUser, access: UserMarketAccess[]): string {
  return [
    user.email,
    user.display_name,
    user.role,
    user.status,
    user.team_label,
    user.team_lead_email,
    user.team_lead_display_name,
    ...access.flatMap((entry) => [entry.market_name, entry.country_code, entry.admin_area1]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
