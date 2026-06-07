"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AppUser } from "@/lib/app-users";
import type { LocationMarket, UserMarketAccess } from "@/lib/db/queries";
import { COUNTRY_NAMES, type CountryCode } from "@/lib/geography";
import type { AppRole } from "@/lib/permissions";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserMarketAccessAction,
  updateUserRoleAction,
  updateUserStatusAction,
  updateUserTeamAction,
} from "@/lib/users/actions";

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
  const [pending, startTransition] = useTransition();

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
      setEmailNotice(`Password setup email sent to ${result.user.email}.`);
      setEmail("");
      setDisplayName("");
      setRole("researcher");
      toast.success("User created and setup email sent");
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

  const assignedMarketIds = (userId: string) => new Set((marketAccess[userId] ?? []).map((entry) => entry.market_id));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <section className="glass min-w-0 rounded-2xl p-6">
        <h3 className="section-label">Create User</h3>
        <div className="mt-4 space-y-4">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="glass-input w-full"
              placeholder="researcher@example.com"
            />
          </Field>
          <Field label="Display Name">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="glass-input w-full"
              placeholder="Name"
            />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value as AppRole)} className="glass-input w-full">
              <option value="researcher">Researcher</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <button type="button" className="btn-primary w-full" disabled={pending || !email} onClick={handleCreate}>
            Create User
          </button>
        </div>

        {emailNotice && (
          <div className="mt-5 rounded-xl p-4" style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.16)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Email sent
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>{emailNotice}</p>
          </div>
        )}
      </section>

      <section className="glass min-w-0 rounded-2xl p-6">
        <div className="mb-4">
          <h3 className="section-label">Users and Territories</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Assign market access by person. Admins can access all markets; researchers only see selected territories.
          </p>
        </div>
        <div className="space-y-3">
          {users.map((user) => (
            <article key={user.user_id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.5)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-medium" style={{ color: "var(--text-primary)" }}>{user.email}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{user.display_name || "No display name"}</div>
                </div>
                <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{user.status}</span>
              </div>
              <div className="mt-4 grid gap-3">
                <select
                  value={user.role}
                  aria-label={`Role for ${user.email}`}
                  onChange={(event) => handleRole(user.user_id, event.target.value as AppRole)}
                  className="glass-input w-full"
                  disabled={pending}
                >
                  <option value="researcher">Researcher</option>
                  <option value="admin">Admin</option>
                </select>
                <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={user.is_team_lead}
                    disabled={pending}
                    onChange={(event) => handleTeam(user, { is_team_lead: event.target.checked, team_lead_user_id: event.target.checked ? null : user.team_lead_user_id })}
                  />
                  Team lead
                </label>
                <select
                  value={user.team_lead_user_id ?? ""}
                  aria-label={`Team lead for ${user.email}`}
                  onChange={(event) => handleTeam(user, { team_lead_user_id: event.target.value || null })}
                  className="glass-input w-full text-xs"
                  disabled={pending || user.is_team_lead}
                >
                  <option value="">No team lead</option>
                  {users.filter((candidate) => candidate.is_team_lead && candidate.user_id !== user.user_id && candidate.status === "active").map((candidate) => (
                    <option key={candidate.user_id} value={candidate.user_id}>
                      {candidate.display_name || candidate.email}
                    </option>
                  ))}
                </select>
                <input
                  value={user.team_label ?? ""}
                  aria-label={`Team label for ${user.email}`}
                  onChange={(event) => setUsers((current) => current.map((row) => row.user_id === user.user_id ? { ...row, team_label: event.target.value } : row))}
                  onBlur={() => {
                    const latest = users.find((row) => row.user_id === user.user_id);
                    if (latest) handleTeam(latest, {});
                  }}
                  className="glass-input w-full text-xs"
                  disabled={pending}
                  placeholder="Team label"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-glass flex-1 text-xs" disabled={pending} onClick={() => handlePasswordReset(user)}>
                    Reset Password
                  </button>
                  <button type="button" className="btn-glass flex-1 text-xs" disabled={pending} onClick={() => handleStatus(user)}>
                    {user.status === "active" ? "Disable" : "Enable"}
                  </button>
                </div>
                <TerritorySelector
                  user={user}
                  markets={markets}
                  selectedMarketIds={assignedMarketIds(user.user_id)}
                  pending={pending}
                  onToggle={handleMarketToggle}
                  onToggleCountry={handleCountryToggle}
                />
              </div>
            </article>
          ))}
        </div>

        <div className="hidden">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                <th className="pb-3">User</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Team</th>
                <th className="pb-3">Territories</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Last Seen</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/50">
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td className="py-4">
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>{user.email}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{user.display_name || "No display name"}</div>
                  </td>
                  <td className="py-4">
                    <select
                      value={user.role}
                      aria-label={`Role for ${user.email}`}
                      onChange={(event) => handleRole(user.user_id, event.target.value as AppRole)}
                      className="glass-input"
                      disabled={pending}
                    >
                      <option value="researcher">Researcher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={user.is_team_lead}
                          disabled={pending}
                          onChange={(event) => handleTeam(user, { is_team_lead: event.target.checked, team_lead_user_id: event.target.checked ? null : user.team_lead_user_id })}
                        />
                        Team lead
                      </label>
                      <select
                        value={user.team_lead_user_id ?? ""}
                        aria-label={`Team lead for ${user.email}`}
                        onChange={(event) => handleTeam(user, { team_lead_user_id: event.target.value || null })}
                        className="glass-input w-full text-xs"
                        disabled={pending || user.is_team_lead}
                      >
                        <option value="">No team lead</option>
                        {users.filter((candidate) => candidate.is_team_lead && candidate.user_id !== user.user_id && candidate.status === "active").map((candidate) => (
                          <option key={candidate.user_id} value={candidate.user_id}>
                            {candidate.display_name || candidate.email}
                          </option>
                        ))}
                      </select>
                      <input
                        value={user.team_label ?? ""}
                        aria-label={`Team label for ${user.email}`}
                        onChange={(event) => setUsers((current) => current.map((row) => row.user_id === user.user_id ? { ...row, team_label: event.target.value } : row))}
                        onBlur={() => {
                          const latest = users.find((row) => row.user_id === user.user_id);
                          if (latest) handleTeam(latest, {});
                        }}
                        className="glass-input w-full text-xs"
                        disabled={pending}
                        placeholder="Team label"
                      />
                    </div>
                  </td>
                  <td className="py-4 align-top">
                    <TerritorySelector
                      user={user}
                      markets={markets}
                      selectedMarketIds={assignedMarketIds(user.user_id)}
                      pending={pending}
                      onToggle={handleMarketToggle}
                      onToggleCountry={handleCountryToggle}
                    />
                  </td>
                  <td className="py-4 capitalize">{user.status}</td>
                  <td className="py-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {formatDateTime(user.last_seen_at)}
                  </td>
                  <td className="py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handlePasswordReset(user)}>
                        Reset Password
                      </button>
                      <button type="button" className="btn-glass text-xs" disabled={pending} onClick={() => handleStatus(user)}>
                        {user.status === "active" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function TerritorySelector({
  user,
  markets,
  selectedMarketIds,
  pending,
  onToggle,
  onToggleCountry,
}: {
  user: AppUser;
  markets: LocationMarket[];
  selectedMarketIds: Set<string>;
  pending: boolean;
  onToggle: (user: AppUser, marketId: string) => void;
  onToggleCountry: (user: AppUser, countryCode: CountryCode) => void;
}) {
  if (user.role === "admin") {
    return (
      <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
        Admins can access all markets.
      </div>
    );
  }

  const selectedMarkets = markets.filter((market) => selectedMarketIds.has(market.id));
  const countryGroups = (["US", "CA", "GB"] as CountryCode[])
    .map((countryCode) => ({
      countryCode,
      markets: markets.filter((market) => market.country_code === countryCode),
    }))
    .filter((group) => group.markets.length > 0);
  const selectedCountryCount = countryGroups.filter((group) => (
    group.markets.every((market) => selectedMarketIds.has(market.id))
  )).length;

  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.32)", border: "1px solid rgba(255,255,255,0.45)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Country access</span>
        <span className="text-[11px]" style={{ color: selectedMarketIds.size === 0 ? "#b45309" : "var(--text-tertiary)" }}>
          {selectedMarketIds.size === 0 ? "No access" : `${selectedCountryCount} countries`}
        </span>
      </div>
      {selectedMarkets.length === 0 ? (
        <p className="rounded-lg px-2 py-1.5 text-xs" style={{ background: "rgba(245,158,11,0.1)", color: "#92400e" }}>
          No country access. This researcher will not see leads until a country is selected.
        </p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedMarkets.map((market) => (
            <span key={market.id} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(79,70,229,0.14)", color: "var(--accent)" }}>
              {market.name} · {market.country_code}
            </span>
          ))}
        </div>
      )}
      <div className="max-h-44 space-y-1 overflow-auto pr-1">
        {markets.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No countries configured.</p>
        ) : (
          <div className="space-y-1">
            {countryGroups.map((group) => {
              const selectedCount = group.markets.filter((market) => selectedMarketIds.has(market.id)).length;
              const checked = selectedCount === group.markets.length;
              const partial = selectedCount > 0 && !checked;
              return (
              <label
                key={group.countryCode}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
                style={{ background: selectedCount > 0 ? "rgba(99,102,241,0.14)" : "rgba(255,255,255,0.25)", color: selectedCount > 0 ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending}
                  aria-label={`Toggle ${COUNTRY_NAMES[group.countryCode]} country access`}
                  onChange={() => onToggleCountry(user, group.countryCode)}
                />
                <span className="font-medium">{COUNTRY_NAMES[group.countryCode]}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{group.countryCode}</span>
                <span className="ml-auto" style={{ color: selectedCount > 0 ? "var(--accent)" : "var(--text-tertiary)" }}>
                  {partial ? `${selectedCount}/${group.markets.length}` : checked ? "Selected" : "Available"}
                </span>
              </label>
              );
            })}
          </div>
        )}
      </div>
      {selectedMarkets.length > 0 && (
        <details className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <summary className="cursor-pointer">Area details</summary>
          <div className="mt-2 space-y-1">
            {markets.map((market) => {
              const checked = selectedMarketIds.has(market.id);
              return (
                <label key={market.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: checked ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.22)" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    aria-label={`${checked ? "Remove" : "Add"} ${market.name} area access`}
                    onChange={() => onToggle(user, market.id)}
                  />
                  <span>{market.name}</span>
                  <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>{market.country_code}</span>
                </label>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
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
