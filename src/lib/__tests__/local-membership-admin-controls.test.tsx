import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenancy/membership-admin-actions", () => ({
  inviteLocalTenantMembershipAction: vi.fn(),
  assignLocalTenantMembershipRoleAction: vi.fn(),
}));

import { LocalMembershipAdminControls } from "@/components/admin/local-membership-admin-controls";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const OWNER = {
  tenantId: TENANT_ID,
  membershipId: "30000000-0000-4000-8000-000000000001",
  status: "active",
  role: "owner",
  workspaceId: null,
} as const;
const MEMBER = {
  tenantId: TENANT_ID,
  membershipId: "30000000-0000-4000-8000-000000000002",
  status: "active",
  role: "researcher",
  workspaceId: null,
} as const;
const HISTORY = [
  { ...OWNER, roleBindings: [{ id: "owner-role", role: "owner", revokedAt: null, reasonCode: "initial_provisioning" }] },
  { ...MEMBER, roleBindings: [{ id: "member-role", role: "researcher", revokedAt: null, reasonCode: "initial_provisioning" }] },
] as const;

describe("LocalMembershipAdminControls", () => {
  it("exposes only invite and role controls when local canonical mutations are enabled", () => {
    const html = renderToStaticMarkup(
      <LocalMembershipAdminControls actor={OWNER} memberships={[OWNER, MEMBER]} history={HISTORY} mutationsEnabled />,
    );

    expect(html).toContain('data-local-membership-mutations="enabled"');
    expect(html).toMatch(/>Invite member<\/button>/u);
    expect(html).toMatch(/>Change role<\/button>/u);
    expect(html).not.toMatch(/>Suspend member<\/button>/u);
    expect(html).not.toMatch(/<(?:input|select|form)\b/u);
  });

  it("keeps PostgreSQL mode visibly read-only and renders no mutation buttons", () => {
    const html = renderToStaticMarkup(
      <LocalMembershipAdminControls actor={OWNER} memberships={[OWNER, MEMBER]} history={HISTORY} mutationsEnabled={false} />,
    );

    expect(html).toContain('data-local-membership-mutations="read-only"');
    expect(html).toContain("Local invitation and role controls are unavailable when PostgreSQL is configured");
    expect(html).not.toMatch(/>(?:Invite member|Change role|Suspend member)<\/button>/u);
    expect(html).not.toMatch(/<(?:input|select|form)\b/u);
  });
});
