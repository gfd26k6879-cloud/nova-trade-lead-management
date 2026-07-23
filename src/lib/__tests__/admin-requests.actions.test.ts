import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
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
vi.mock("@/lib/lead-access", () => ({ canReadLeadForSession: accessMocks.canReadLeadForSession }));
vi.mock("@/lib/db/queries", () => queryMocks);

import { createAdminRequestAction, updateAdminRequestStatusAction } from "@/lib/admin-requests/actions";

const baseLead = {
  id: "lead-1",
  name: "Lead One",
  assigned_to_user_id: "user-1",
  assigned_user_email: "one@example.com",
  assigned_user_display_name: "One",
};

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
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.updateAdminRequestStatus.mockResolvedValue({ ...baseRequest, status: "in_progress" });

    const result = await updateAdminRequestStatusAction("request-1", "in_progress");

    expect(authMocks.requirePermission).toHaveBeenCalledWith("admin_request:manage");
    expect(result).toEqual({ success: true, request: { ...baseRequest, status: "in_progress" } });
    expect(queryMocks.updateAdminRequestStatus).toHaveBeenCalledWith("request-1", "in_progress");
  });
});
