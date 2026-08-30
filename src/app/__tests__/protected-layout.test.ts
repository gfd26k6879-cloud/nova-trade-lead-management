import { Children, isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTenantSession: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  getAdminFulfillmentSummary: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/nav-header", () => ({ NavHeader: vi.fn(() => null) }));

import ProtectedLayout from "@/app/(protected)/layout";
import { NavHeader } from "@/components/nav-header";

type NavScope = {
  tenantLabel: string;
  workspaceLabel: string | null;
  roleLabel: string;
  preview: boolean;
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getSession.mockResolvedValue({
    userId: "50000000-0000-4000-8000-000000000005",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
  });
  authMocks.getTenantSession.mockResolvedValue(null);
  queryMocks.getAdminFulfillmentSummary.mockResolvedValue({ openTotal: 0 });
});

async function renderedScope(): Promise<NavScope> {
  const layout = await ProtectedLayout({ children: "content" });
  const nav = Children.toArray(layout.props.children).find(
    (child) => isValidElement(child) && child.type === NavHeader,
  ) as ReactElement<{ scope: NavScope }> | undefined;

  if (!nav) throw new Error("NavHeader was not rendered");
  return nav.props.scope;
}

describe("protected layout tenant scope", () => {
  it("renders authoritative IDs and the role from the resolved TenantSession", async () => {
    authMocks.getTenantSession.mockResolvedValue({
      userId: "50000000-0000-4000-8000-000000000005",
      email: "admin@example.com",
      displayName: "Admin",
      tenantId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "20000000-0000-4000-8000-000000000002",
      membershipId: "30000000-0000-4000-8000-000000000003",
      roleBindingId: "40000000-0000-4000-8000-000000000004",
      role: "strategist_manager",
    });

    await expect(renderedScope()).resolves.toEqual({
      tenantLabel: "Tenant ID · 10000000-0000-4000-8000-000000000001",
      workspaceLabel: "Workspace ID · 20000000-0000-4000-8000-000000000002",
      roleLabel: "strategist_manager",
      preview: false,
    });
  });

  it("uses the same non-enumerating preview when scope is absent or resolution fails", async () => {
    const expected = {
      tenantLabel: "Legacy compatibility",
      workspaceLabel: "Legacy website leads",
      roleLabel: "Tenant role unavailable",
      preview: true,
    };

    await expect(renderedScope()).resolves.toEqual(expected);
    authMocks.getTenantSession.mockRejectedValueOnce(new Error("private storage detail"));
    await expect(renderedScope()).resolves.toEqual(expected);
  });

  it("does not render scope returned for a different authenticated identity", async () => {
    authMocks.getTenantSession.mockResolvedValue({
      userId: "90000000-0000-4000-8000-000000000009",
      email: "other@example.com",
      displayName: "Other",
      tenantId: "a0000000-0000-4000-8000-00000000000a",
      workspaceId: null,
      membershipId: "b0000000-0000-4000-8000-00000000000b",
      roleBindingId: "c0000000-0000-4000-8000-00000000000c",
      role: "owner",
    });

    await expect(renderedScope()).resolves.toEqual({
      tenantLabel: "Legacy compatibility",
      workspaceLabel: "Legacy website leads",
      roleLabel: "Tenant role unavailable",
      preview: true,
    });
  });
});
