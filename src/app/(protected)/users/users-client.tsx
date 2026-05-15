"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AppUser } from "@/lib/app-users";
import type { AppRole } from "@/lib/permissions";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserRoleAction,
  updateUserStatusAction,
} from "@/lib/users/actions";

export function UsersClient({ initialUsers }: { initialUsers: AppUser[] }) {
  const [users, setUsers] = useState(initialUsers);
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

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <section className="glass rounded-2xl p-6">
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

      <section className="glass rounded-2xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                <th className="pb-3">User</th>
                <th className="pb-3">Role</th>
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
                      onChange={(event) => handleRole(user.user_id, event.target.value as AppRole)}
                      className="glass-input"
                      disabled={pending}
                    >
                      <option value="researcher">Researcher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-4 capitalize">{user.status}</td>
                  <td className="py-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : "Never"}
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
