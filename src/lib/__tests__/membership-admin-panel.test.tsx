import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MembershipAdminPanel } from "@/components/admin/membership-admin-panel";
import type { MembershipHistoryView, MembershipView } from "@/lib/tenancy/memberships";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const OWNER_ID = "30000000-0000-4000-8000-000000000001";
const RESEARCHER_ID = "30000000-0000-4000-8000-000000000002";
const INVITATION_ID = "30000000-0000-4000-8000-000000000003";

const owner: MembershipView = {
  tenantId: TENANT_ID,
  membershipId: OWNER_ID,
  status: "active",
  role: "owner",
  workspaceId: null,
};

const researcher: MembershipView = {
  tenantId: TENANT_ID,
  membershipId: RESEARCHER_ID,
  status: "active",
  role: "researcher",
  workspaceId: WORKSPACE_ID,
};

const invitation: MembershipView = {
  tenantId: TENANT_ID,
  membershipId: INVITATION_ID,
  status: "pending",
  role: "reviewer",
  workspaceId: WORKSPACE_ID,
};

const history: readonly MembershipHistoryView[] = [
  {
    ...owner,
    roleBindings: [
      { id: "role-binding-owner", role: "owner", revokedAt: null, reasonCode: "initial_provisioning" },
    ],
  },
  {
    ...researcher,
    roleBindings: [
      { id: "role-binding-admin", role: "admin", revokedAt: "2026-08-20T10:00:00.000Z", reasonCode: "role_change" },
      { id: "role-binding-researcher", role: "researcher", revokedAt: null, reasonCode: "role_change" },
    ],
  },
];

const authorizations = {
  "membership:invite": true,
  "membership:manage": true,
  "role:assign": true,
} as const;

describe("MembershipAdminPanel", () => {
  it("renders tenant and workspace members, invitations, permission impact, and audit state", () => {
    const html = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={owner}
        memberships={[owner, researcher, invitation]}
        history={history}
        policyAuthorizations={authorizations}
      />,
    );

    expect(html).toContain('data-surface="membership-admin-panel"');
    expect(html).toContain("Tenant-wide members");
    expect(html).toContain("Workspace members");
    expect(html).toContain("Pending invitations");
    expect(html).toContain(OWNER_ID);
    expect(html).toContain(RESEARCHER_ID);
    expect(html).toContain(INVITATION_ID);
    expect(html).toContain(`Workspace ${WORKSPACE_ID}`);
    expect(html).toContain("Researcher");
    expect(html).toContain('data-membership-status="pending"');
    expect(html).toContain("Permission impact");
    expect(html.match(/data-permission-allowed="true"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Membership role-binding audit state"');
    expect(html).toContain("2 recorded role bindings");
    expect(html).toContain("Administrator · role change");
    expect(html).toContain("Closed");
    expect(html).toContain("Current");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<MembershipAdminPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading membership administration");

    const error = renderToStaticMarkup(
      <MembershipAdminPanel state="error" error="Membership records could not be loaded." />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Membership administration unavailable");
    expect(error).toContain("Membership records could not be loaded.");

    const empty = renderToStaticMarkup(<MembershipAdminPanel state="empty" />);
    expect(empty).toContain('role="status"');
    expect(empty).toContain("No memberships yet");
    expect(empty).toContain("no current memberships or pending invitations");
  });

  it("offers only explicit human callbacks authorized by role, policy, actor, and target state", () => {
    const authorized = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={owner}
        memberships={[owner, researcher, invitation]}
        history={history}
        policyAuthorizations={authorizations}
        onInvite={() => undefined}
        onChangeRole={() => undefined}
        onSuspend={() => undefined}
      />,
    );

    expect(authorized.match(/<button\b/g)).toHaveLength(4);
    expect(authorized).toContain("Invite member");
    expect(authorized.match(/>Change role<\/button>/g)).toHaveLength(2);
    expect(authorized.match(/>Suspend member<\/button>/g)).toHaveLength(1);
    expect(authorized).toContain(`aria-label="Human actions for membership ${RESEARCHER_ID}"`);
    expect(authorized).not.toContain(`aria-label="Human actions for membership ${OWNER_ID}"`);
    expect(authorized).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(authorized).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const policyBlocked = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={owner}
        memberships={[owner, researcher, invitation]}
        history={history}
        policyAuthorizations={{}}
        onInvite={() => undefined}
        onChangeRole={() => undefined}
        onSuspend={() => undefined}
      />,
    );
    expect(policyBlocked).not.toMatch(/<button\b/u);
    expect(policyBlocked.match(/Policy authorization required/g)).toHaveLength(3);
    expect(policyBlocked.match(/data-permission-allowed="false"/g)).toHaveLength(3);
  });

  it("fails closed without enumerating records when actor permission or tenant scope is invalid", () => {
    const unauthorizedActor = { ...researcher, workspaceId: null };
    const denied = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={unauthorizedActor}
        memberships={[unauthorizedActor, owner]}
        history={[]}
        policyAuthorizations={authorizations}
        onInvite={() => undefined}
      />,
    );
    expect(denied).toContain('data-membership-state="denied"');
    expect(denied).toContain('role="alert"');
    expect(denied).toContain("scope or current administrator state could not be verified");
    expect(denied).not.toContain(OWNER_ID);
    expect(denied).not.toContain(RESEARCHER_ID);
    expect(denied).not.toMatch(/<button\b/u);

    const foreignMember = { ...researcher, tenantId: OTHER_TENANT_ID };
    const mismatched = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={owner}
        memberships={[owner, foreignMember]}
        history={history}
        policyAuthorizations={authorizations}
      />,
    );
    expect(mismatched).toContain('data-membership-state="denied"');
    expect(mismatched).not.toContain(RESEARCHER_ID);
    expect(mismatched).not.toContain("Workspace members");
  });

  it("uses ordered landmarks and responsive, break-safe operational layout", () => {
    const html = renderToStaticMarkup(
      <MembershipAdminPanel
        state="ready"
        actor={owner}
        memberships={[owner, researcher, invitation]}
        history={history}
        policyAuthorizations={authorizations}
      />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="membership-admin-title"');
    expect(html).toContain('aria-labelledby="tenant-members-title"');
    expect(html).toContain('aria-labelledby="workspace-members-title"');
    expect(html).toContain('aria-labelledby="pending-invitations-title"');
    expect(html).toContain('aria-label="Permission impact and audit state"');
    expect(html).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>30000000/u);
  });
});
