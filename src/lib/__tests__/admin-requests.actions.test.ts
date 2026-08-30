import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const tenantMocks = vi.hoisted(() => ({
  requireTenantPermission: vi.fn(),
  runWithTenantContext: vi.fn(async (_session, _correlationId, callback) => callback()),
  withTenantDbContext: vi.fn(async (callback) => callback({})),
}));

const accessMocks = vi.hoisted(() => ({
  canReadLeadForSession: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getLeadById: vi.fn(),
  createAdminRequest: vi.fn(),
  updateAdminRequestStatus: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/db", () => ({ withTenantDbContext: tenantMocks.withTenantDbContext }));
vi.mock("@/lib/lead-access", () => ({ canReadLeadForSession: accessMocks.canReadLeadForSession }));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/authorize", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tenancy/authorize")>();
  return { ...original, requireTenantPermission: tenantMocks.requireTenantPermission };
});
vi.mock("@/lib/tenancy/context", () => ({ runWithTenantContext: tenantMocks.runWithTenantContext }));

import { createAdminRequestAction, updateAdminRequestStatusAction } from "@/lib/admin-requests/actions";

const baseLead = {
  id: "lead-1",
  tenant_id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "00000000-0000-4000-8000-000000000002",
  name: "Lead One",
  assigned_to_user_id: "user-1",
  assigned_user_email: "one@example.com",
  assigned_user_display_name: "One",
};

const tenantSession = {
  userId: "user-1",
  email: "one@example.com",
  displayName: "One",
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: null,
  membershipId: "00000000-0000-4000-8000-000000000003",
  roleBindingId: "00000000-0000-4000-8000-000000000004",
  role: "researcher",
} as const;

const baseRequest = {
  id: "request-1",
  lead_id: "lead-1",
  request_type: "website_request",
  status: "new",
};

beforeEach(() => {
  vi.clearAllMocks();
  accessMocks.canReadLeadForSession.mockResolvedValue(true);
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  tenantMocks.requireTenantPermission.mockResolvedValue(tenantSession);
});

describe("admin request server actions", () => {
  it("requires researchers to own a lead before creating a request", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: null });

    const result = await createAdminRequestAction("lead-1", { requestType: "website_request" });

    expect(result).toEqual({ error: "Claim this lead before sending it to Steve." });
    expect(queryMocks.createAdminRequest).not.toHaveBeenCalled();
  });

  it("prevents researchers from escalating another owner's lead", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({ ...tenantSession, userId: "user-2" });
    authMocks.requirePermission.mockResolvedValue({ userId: "user-2", email: "two@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);

    const result = await createAdminRequestAction("lead-1", { requestType: "quote_request" });

    expect(result).toEqual({ error: "Taken by One." });
    expect(queryMocks.createAdminRequest).not.toHaveBeenCalled();
  });

  it("hides owned leads outside a researcher's territory", async () => {
    const session = { userId: "user-1", email: "one@example.com", role: "researcher" };
    authMocks.requirePermission.mockResolvedValue(session);
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    accessMocks.canReadLeadForSession.mockResolvedValue(false);

    const result = await createAdminRequestAction("lead-1", { requestType: "website_request" });

    expect(result).toEqual({ error: "Lead not found." });
    expect(accessMocks.canReadLeadForSession).toHaveBeenCalledWith(session, baseLead);
    expect(queryMocks.createAdminRequest).not.toHaveBeenCalled();
  });

  it("lets admins create requests for any lead", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({ ...tenantSession, userId: "admin-1", role: "admin" });
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: null });
    queryMocks.createAdminRequest.mockResolvedValue({ request: baseRequest, alreadyExists: false });

    const result = await createAdminRequestAction("lead-1", { requestType: "website_request", summary: "Needs a site." });

    expect(result).toEqual({ success: true, request: baseRequest, alreadyExists: false });
    expect(queryMocks.createAdminRequest).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "lead-1",
      requestType: "website_request",
      assignedAdminUserId: "admin-1",
    }));
  });

  it("requires admin permission to update request status", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({ ...tenantSession, userId: "admin-1", role: "admin" });
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.updateAdminRequestStatus.mockResolvedValue({ ...baseRequest, status: "in_progress" });

    const result = await updateAdminRequestStatusAction("request-1", "in_progress");

    expect(authMocks.requirePermission).toHaveBeenCalledWith("admin_request:manage");
    expect(result).toEqual({ success: true, request: { ...baseRequest, status: "in_progress" } });
    expect(queryMocks.updateAdminRequestStatus).toHaveBeenCalledWith("request-1", "in_progress");
  });

  it("binds the canonical tenant actor to the legacy actor before database access", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "other-user", email: "other@example.com", role: "researcher" });

    await expect(createAdminRequestAction("lead-1", { requestType: "website_request" }, {
      tenantId: tenantSession.tenantId,
      workspaceId: tenantSession.workspaceId,
    })).rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_MISMATCH" });

    expect(tenantMocks.requireTenantPermission).toHaveBeenCalledWith({
      tenantId: tenantSession.tenantId,
      workspaceId: tenantSession.workspaceId,
    }, "workspace:read", { action: "admin_request.create" });
    expect(tenantMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
  });

  it("rejects workspace-scoped request creation before legacy authorization or database access", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({
      ...tenantSession,
      workspaceId: "00000000-0000-4000-8000-000000000002",
    });

    await expect(createAdminRequestAction("lead-1", { requestType: "website_request" })).rejects.toMatchObject({
      status: 403,
      code: "WORKSPACE_SCOPE_INVALID",
    });

    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(tenantMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(tenantMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
  });

  it("rejects workspace-scoped status updates before legacy authorization or database access", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({
      ...tenantSession,
      workspaceId: "00000000-0000-4000-8000-000000000002",
    });

    await expect(updateAdminRequestStatusAction("request-1", "done")).rejects.toMatchObject({
      status: 403,
      code: "WORKSPACE_SCOPE_INVALID",
    });

    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(tenantMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(tenantMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.updateAdminRequestStatus).not.toHaveBeenCalled();
  });

  it("fails closed for a lead outside the canonical tenant scope", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, tenant_id: "00000000-0000-4000-8000-000000000099" });

    const result = await createAdminRequestAction("lead-1", { requestType: "website_request" });

    expect(result).toEqual({ error: "Lead not found." });
    expect(queryMocks.createAdminRequest).not.toHaveBeenCalled();
    expect(tenantMocks.runWithTenantContext).toHaveBeenCalledWith(
      tenantSession,
      expect.stringMatching(/^admin-request-create:/),
      expect.any(Function),
    );
    expect(tenantMocks.withTenantDbContext).toHaveBeenCalledOnce();
  });

  it("keeps cross-tenant status mutations non-enumerating inside tenant database context", async () => {
    tenantMocks.requireTenantPermission.mockResolvedValue({ ...tenantSession, userId: "admin-1", role: "admin" });
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.updateAdminRequestStatus.mockResolvedValue(null);

    const result = await updateAdminRequestStatusAction("foreign-request", "done");

    expect(result).toEqual({ error: "Admin request not found." });
    expect(tenantMocks.requireTenantPermission).toHaveBeenCalledWith({}, "workspace:read", {
      action: "admin_request.status.update",
    });
    expect(tenantMocks.runWithTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-1", tenantId: tenantSession.tenantId }),
      expect.stringMatching(/^admin-request-status:/),
      expect.any(Function),
    );
    expect(tenantMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });
});
