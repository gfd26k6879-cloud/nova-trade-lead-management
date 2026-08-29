import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createTenantSessionResolver,
  TenantScopeResolutionError,
} from "@/lib/app-users";
import type {
  DbClient,
  TenantSessionBootstrapInput,
} from "@/lib/db";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const MEMBER_A = "20000000-0000-4000-8000-000000000001";
const ROLE_A = "30000000-0000-4000-8000-000000000001";
const AUTH_A = "50000000-0000-4000-8000-000000000001";

const MIGRATION_PATH = resolve(
  "supabase/migrations/20260829200000_add_tenant_session_bootstrap_resolver.sql",
);

function bootstrapClient(
  rows: readonly Record<string, unknown>[],
): DbClient & {
  resolveTenantSessionBootstrap: ReturnType<typeof vi.fn>;
} {
  const resolveTenantSessionBootstrap = vi.fn(async (input: TenantSessionBootstrapInput) => {
    void input;
    return rows;
  });
  return {
    resolveTenantSessionBootstrap,
    prepare: vi.fn(() => {
      throw new Error("joined-query fallback must not run for a bootstrap-capable client");
    }),
    exec: vi.fn(async () => undefined),
  };
}

const validRow = {
  tenant_id: TENANT_A,
  workspace_id: WORKSPACE_A,
  membership_id: MEMBER_A,
  role: "researcher",
  role_binding_id: ROLE_A,
};

describe("PostgreSQL tenant-session bootstrap adapter", () => {
  it("passes only the authenticated identity and validated selectors and parses the minimal scope", async () => {
    const db = bootstrapClient([validRow]);

    await expect(createTenantSessionResolver(db).resolve({
      authIdentityId: AUTH_A,
      selector: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    })).resolves.toEqual({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBER_A,
      role: "researcher",
      roleBindingId: ROLE_A,
    });
    expect(db.resolveTenantSessionBootstrap).toHaveBeenCalledOnce();
    expect(db.resolveTenantSessionBootstrap).toHaveBeenCalledWith({
      authIdentityId: AUTH_A,
      tenantId: TENANT_A,
      workspaceSelectorProvided: true,
      workspaceId: WORKSPACE_A,
    });
  });

  it("canonicalizes accepted UUID selectors before storage and output comparison", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const authIdentityId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const db = bootstrapClient([{ ...validRow, tenant_id: tenantId, workspace_id: workspaceId }]);

    await expect(createTenantSessionResolver(db).resolve({
      authIdentityId: authIdentityId.toUpperCase(),
      selector: {
        tenantId: tenantId.toUpperCase(),
        workspaceId: workspaceId.toUpperCase(),
      },
    })).resolves.toMatchObject({ tenantId, workspaceId });
    expect(db.resolveTenantSessionBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      authIdentityId,
      tenantId,
      workspaceId,
    }));
  });

  it.each([
    ["missing tenant", { authIdentityId: AUTH_A, selector: {} }],
    ["malformed tenant", { authIdentityId: AUTH_A, selector: { tenantId: "bad" } }],
    ["malformed identity", { authIdentityId: "bad", selector: { tenantId: TENANT_A } }],
    ["malformed workspace", { authIdentityId: AUTH_A, selector: { tenantId: TENANT_A, workspaceId: "bad" } }],
  ])("rejects %s before invoking storage", async (_label, input) => {
    const db = bootstrapClient([validRow]);
    await expect(createTenantSessionResolver(db).resolve(input))
      .rejects.toBeInstanceOf(TenantScopeResolutionError);
    expect(db.resolveTenantSessionBootstrap).not.toHaveBeenCalled();
  });

  it.each([
    ["no row", []],
    ["multiple rows", [validRow, validRow]],
    ["wrong tenant", [{ ...validRow, tenant_id: TENANT_B }]],
    ["wrong explicit workspace", [{ ...validRow, workspace_id: null }]],
    ["unknown role", [{ ...validRow, role: "platform_support" }]],
    ["malformed membership", [{ ...validRow, membership_id: "not-a-uuid" }]],
    ["extra enumerable output", [{ ...validRow, tenant_status: "active" }]],
  ])("fails closed for %s", async (_label, rows) => {
    const db = bootstrapClient(rows);
    await expect(createTenantSessionResolver(db).resolve({
      authIdentityId: AUTH_A,
      selector: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    })).rejects.toBeInstanceOf(TenantScopeResolutionError);
  });

  it("preserves omitted versus explicit tenant-wide workspace selection", async () => {
    const omitted = bootstrapClient([{ ...validRow, workspace_id: WORKSPACE_A }]);
    await expect(createTenantSessionResolver(omitted).resolve({
      authIdentityId: AUTH_A,
      selector: { tenantId: TENANT_A },
    })).resolves.toMatchObject({ workspaceId: WORKSPACE_A });
    expect(omitted.resolveTenantSessionBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      workspaceSelectorProvided: false,
      workspaceId: null,
    }));

    const tenantWide = bootstrapClient([{ ...validRow, workspace_id: null }]);
    await expect(createTenantSessionResolver(tenantWide).resolve({
      authIdentityId: AUTH_A,
      selector: { tenantId: TENANT_A, workspaceId: null },
    })).resolves.toMatchObject({ workspaceId: null });
    expect(tenantWide.resolveTenantSessionBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      workspaceSelectorProvided: true,
      workspaceId: null,
    }));
  });
});

describe("tenant-session bootstrap migration contract", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("uses the accepted narrow SECURITY DEFINER boundary with a catalog-only search path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.novatrade_resolve_tenant_session(");
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = pg_catalog/u);
    expect(sql).not.toMatch(/SET search_path\s*=\s*[^\n]*public/iu);
    expect(sql).toContain("FROM public.tenants AS tenant");
    expect(sql).toContain("JOIN public.tenant_memberships AS membership");
    expect(sql).toContain("JOIN public.tenant_role_bindings AS binding");
  });

  it("returns only the five scope fields and leaves production execution fail closed", () => {
    expect(sql).toMatch(/RETURNS TABLE \(\s*tenant_id pg_catalog\.uuid,\s*workspace_id pg_catalog\.uuid,\s*membership_id pg_catalog\.uuid,\s*role pg_catalog\.text,\s*role_binding_id pg_catalog\.uuid\s*\)/u);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.novatrade_resolve_tenant_session(pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.text) FROM PUBLIC");
    expect(sql).toContain("FROM anon");
    expect(sql).toContain("FROM authenticated");
    expect(sql).not.toMatch(/GRANT\s+EXECUTE/iu);
  });
});
