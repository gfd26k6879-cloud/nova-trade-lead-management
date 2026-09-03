"use client";

import { useState, useTransition, type FormEvent } from "react";

import { MembershipAdminPanel } from "@/components/admin/membership-admin-panel";
import {
  assignLocalTenantMembershipRoleAction,
  inviteLocalTenantMembershipAction,
  type LocalMembershipAdminActionResult,
} from "@/lib/tenancy/membership-admin-actions";
import type { MembershipHistoryView, MembershipView } from "@/lib/tenancy/memberships";
import { LAUNCH_ROLES, type LaunchRole } from "@/lib/tenancy/types";

type Editor =
  | Readonly<{ kind: "invite"; requestId: string }>
  | Readonly<{ kind: "role"; requestId: string; membership: MembershipView }>
  | null;

export function LocalMembershipAdminControls({
  actor,
  memberships,
  history,
  mutationsEnabled,
}: Readonly<{
  actor: MembershipView;
  memberships: readonly MembershipView[];
  history: readonly MembershipHistoryView[];
  mutationsEnabled: boolean;
}>) {
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<LocalMembershipAdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const beginInvite = mutationsEnabled
    ? () => {
        setNotice(null);
        setEditor({ kind: "invite", requestId: crypto.randomUUID() });
      }
    : undefined;
  const beginRoleChange = mutationsEnabled
    ? (membership: MembershipView) => {
        setNotice(null);
        setEditor({ kind: "role", requestId: crypto.randomUUID(), membership });
      }
    : undefined;

  return (
    <div className="space-y-5" data-local-membership-mutations={mutationsEnabled ? "enabled" : "read-only"}>
      {!mutationsEnabled ? (
        <p className="glass rounded-xl border p-4 text-sm" role="status" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
          Canonical memberships are read-only in this deployment. Local invitation and role controls are unavailable when PostgreSQL is configured.
        </p>
      ) : null}

      <MembershipAdminPanel
        state="ready"
        actor={actor}
        memberships={memberships}
        history={history}
        policyAuthorizations={mutationsEnabled
          ? { "membership:invite": true, "role:assign": true, "membership:manage": false }
          : {}}
        onInvite={beginInvite}
        onChangeRole={beginRoleChange}
      />

      {editor ? (
        <section className="glass-heavy rounded-2xl p-5" aria-labelledby="local-membership-editor-title">
          <p className="section-label">Local canonical change</p>
          <h2 id="local-membership-editor-title" className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {editor.kind === "invite" ? "Create pending membership" : "Assign tenant role"}
          </h2>
          {editor.kind === "invite" ? (
            <InviteForm editor={editor} pending={pending} submit={(input) => run(input)} />
          ) : (
            <RoleForm editor={editor} pending={pending} submit={(input) => run(input)} />
          )}
          <button type="button" className="mt-3 text-sm font-semibold" disabled={pending} onClick={() => setEditor(null)}>
            Cancel
          </button>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-xl border p-4 text-sm" role={notice.ok ? "status" : "alert"} style={{ borderColor: "var(--surface-card-border)", color: notice.ok ? "var(--success-text)" : "var(--danger-text)" }}>
          {notice.message}
        </p>
      ) : null}
    </div>
  );

  function run(input: Promise<LocalMembershipAdminActionResult>) {
    startTransition(async () => {
      const result = await input;
      setNotice(result);
      if (result.ok) setEditor(null);
    });
  }
}

function InviteForm({
  editor,
  pending,
  submit,
}: Readonly<{
  editor: Extract<Editor, { kind: "invite" }>;
  pending: boolean;
  submit: (input: Promise<LocalMembershipAdminActionResult>) => void;
}>) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit(inviteLocalTenantMembershipAction({
      authSubjectId: data.get("authSubjectId"),
      role: data.get("role"),
      requestId: editor.requestId,
    }));
  }

  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
      <label className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Verified Auth subject UUID
        <input className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" name="authSubjectId" type="text" required autoComplete="off" disabled={pending} />
      </label>
      <RoleSelect defaultRole="researcher" pending={pending} />
      <p className="text-xs sm:col-span-2" style={{ color: "var(--text-tertiary)" }}>
        This stores only a domain-separated identity hash. It does not create an account, send email, or grant access.
      </p>
      <button className="btn-primary sm:w-fit" type="submit" disabled={pending}>{pending ? "Creating…" : "Create pending record"}</button>
    </form>
  );
}

function RoleForm({
  editor,
  pending,
  submit,
}: Readonly<{
  editor: Extract<Editor, { kind: "role" }>;
  pending: boolean;
  submit: (input: Promise<LocalMembershipAdminActionResult>) => void;
}>) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit(assignLocalTenantMembershipRoleAction({
      membershipId: editor.membership.membershipId,
      role: data.get("role"),
      requestId: editor.requestId,
    }));
  }

  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
      <p className="break-all font-mono text-xs sm:col-span-2" style={{ color: "var(--text-secondary)" }}>{editor.membership.membershipId}</p>
      <RoleSelect defaultRole={editor.membership.role ?? "researcher"} pending={pending} />
      <button className="btn-primary sm:w-fit sm:self-end" type="submit" disabled={pending}>{pending ? "Assigning…" : "Assign role"}</button>
    </form>
  );
}

function RoleSelect({ defaultRole, pending }: Readonly<{ defaultRole: LaunchRole; pending: boolean }>) {
  return (
    <label className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
      Canonical role
      <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" name="role" defaultValue={defaultRole} disabled={pending}>
        {LAUNCH_ROLES.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
      </select>
    </label>
  );
}

function formatRole(role: LaunchRole): string {
  return role.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
