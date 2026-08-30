import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const tenantAuthorizationMocks = vi.hoisted(() => ({
  requireTenantPermission: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

const tenantDbMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getLeads: vi.fn(),
  getLeadById: vi.fn(),
  updateLeadStatus: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadFacts: vi.fn(),
  updateLeadReminder: vi.fn(),
  createLeadNote: vi.fn(),
  getLeadNotes: vi.fn(),
  assignLeadToUser: vi.fn(),
  claimLeadForUser: vi.fn(),
  setLeadExclusion: vi.fn(),
  clearLeadExclusion: vi.fn(),
  archiveLead: vi.fn(),
  restoreArchivedLead: vi.fn(),
  bulkArchiveLeads: vi.fn(),
  bulkRestoreArchivedLeads: vi.fn(),
  createManualLead: vi.fn(),
  updateLeadTimestamp: vi.fn(),
  createOutreachEvent: vi.fn(),
  getOutreachEvents: vi.fn(),
  createDemoForLead: vi.fn(),
  getDemoByLeadId: vi.fn(),
  getAllLeadsForRecompute: vi.fn(),
  batchUpdateScores: vi.fn(),
  bulkUpdateLeadStatus: vi.fn(),
  updateLeadVerification: vi.fn(),
  getLatestAiVerification: vi.fn(),
  getAiVerificationById: vi.fn(),
  getAiVerificationCandidates: vi.fn(),
  getQualityAiVerificationCandidates: vi.fn(),
  getAiWebsiteViabilityRepairLeads: vi.fn(),
  applyManualWebsiteCorrection: vi.fn(),
  applyAiFoundWebsite: vi.fn(),
  markLeadBrokenSiteOpportunity: vi.fn(),
  markLeadManualReview: vi.fn(),
  recomputeAllLeadQualityScores: vi.fn(),
  setLeadQualityBucket: vi.fn(),
  updateLeadPhoneVerificationStatus: vi.fn(),
  updateLeadAiFeedback: vi.fn(),
  markLeadAiVerified: vi.fn(),
  createAuditLog: vi.fn(),
  getSettings: vi.fn(),
  refreshStaleUnits: vi.fn(),
  updateCrawlRunStatus: vi.fn(),
  userCanAccessMarket: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/tenancy/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenancy/authorize")>();
  return { ...actual, requireTenantPermission: tenantAuthorizationMocks.requireTenantPermission };
});
vi.mock("@/lib/tenancy/context", () => ({
  runWithTenantContext: tenantContextMocks.runWithTenantContext,
}));
vi.mock("@/lib/db", () => ({ withTenantDbContext: tenantDbMocks.withTenantDbContext }));
vi.mock("@/lib/db/queries", () => queryMocks);

import {
  addLeadNoteAction,
  archiveLeadAction,
  assignLeadAction,
  bulkArchiveLeadsAction,
  bulkRestoreArchivedLeadsAction,
  bulkUpdateLeadStatusAction,
  claimLeadAction,
  createManualLeadAction,
  excludeLeadAction,
  getLeadByIdAction,
  getLeadNotesAction,
  getLeadsAction,
  logOutreachEventAction,
  restoreArchivedLeadAction,
  restoreExcludedLeadAction,
  unclaimLeadAction,
  updateLeadNotesAction,
  updateLeadReminderAction,
  updateLeadStatusAction,
} from "@/lib/leads/actions";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const USER_A = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const ROLE_BINDING_A = "30000000-0000-4000-8000-000000000001";
const TENANT_SELECTOR = { tenantId: TENANT_A };

function mockTenantRole(role: "owner" | "admin" | "strategist_manager" | "researcher" | "reviewer" | "outreach_operator" | "analyst_read_only") {
  tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
    userId: USER_A,
    email: "owner@example.com",
    displayName: "Owner",
    tenantId: TENANT_A,
    workspaceId: null,
    membershipId: MEMBERSHIP_A,
    role,
    roleBindingId: ROLE_BINDING_A,
  });
}

const baseLead = {
  id: "lead-1",
  tenant_id: TENANT_A,
  archived_at: null,
  assigned_to_user_id: null,
  assigned_user_email: null,
  assigned_user_display_name: null,
  is_excluded: false,
  market_id: "market-colorado",
};

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  queryMocks.userCanAccessMarket.mockResolvedValue(true);
  mockTenantRole("owner");
});

describe("lead ownership server actions", () => {
  it("normalizes minimum reviews before preserving the researcher access clamp", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });

    await getLeadsAction({
      minReviews: "4.5" as unknown as number,
      archived: "all",
      includeExcluded: true,
      assigned: "unassigned",
    });

    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({
      minReviews: undefined,
      archived: "active",
      includeExcluded: false,
      assigned: "me",
      assignedToUserId: USER_A,
      visibleToUserId: USER_A,
    }));
    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith({}, "account:read", {
      action: "lead.list",
    });
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      expect.stringMatching(/^lead-list:[0-9a-f-]+$/),
      expect.any(Function),
    );
    expect(tenantDbMocks.withTenantDbContext).toHaveBeenCalledWith(expect.any(Function));
  });

  it("preserves safe above-int4 minimum reviews at the admin action boundary", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });

    await getLeadsAction({ minReviews: 2_147_483_648, status: "new" });

    expect(queryMocks.getLeads).toHaveBeenCalledWith({ minReviews: 2_147_483_648, status: "new" });
  });

  it("fails closed before database access when lead-list tenant scope is absent", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValue(new Error("A valid tenant scope is required"));

    await expect(getLeadsAction({}, { tenantId: TENANT_B })).rejects.toThrow("A valid tenant scope is required");

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_B },
      "account:read",
      { action: "lead.list" },
    );
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
  });

  it("rejects mismatched legacy identity and workspace-narrowed list scope before database access", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "different-user", email: "other@example.com", role: "admin" });

    await expect(getLeadsAction({}, TENANT_SELECTOR)).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
    });

    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: "40000000-0000-4000-8000-000000000001",
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
    });
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });

    await expect(getLeadsAction({}, TENANT_SELECTOR)).rejects.toMatchObject({
      code: "WORKSPACE_SCOPE_INVALID",
    });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
  });

  it("returns researcher lead details only for owned active nonexcluded assigned-market leads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-2" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, archived_at: "2026-08-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, is_excluded: true })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, market_id: "market-uk" });
    queryMocks.userCanAccessMarket
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toMatchObject({ id: "lead-1" });
    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toBeNull();
    expect(queryMocks.userCanAccessMarket).toHaveBeenCalledTimes(2);
    expect(tenantContextMocks.runWithTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      expect.stringMatching(/^lead-read:[0-9a-f-]+$/),
      expect.any(Function),
    );
    expect(tenantDbMocks.withTenantDbContext).toHaveBeenCalledWith(expect.any(Function));
  });

  it("fails closed without querying when tenant scope cannot be resolved", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValue(new Error("A valid tenant scope is required"));

    await expect(getLeadByIdAction("lead-1", {})).rejects.toThrow("A valid tenant scope is required");

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith({}, "account:read", {
      action: "lead.read",
    });
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
  });

  it("does not disclose a lead returned from another tenant", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, tenant_id: TENANT_B });

    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toBeNull();

    expect(queryMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("rejects a mismatched legacy identity before tenant context or database access", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "different-user", email: "other@example.com", role: "admin" });

    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).rejects.toMatchObject({
      status: 403,
      code: "TENANT_SCOPE_MISMATCH",
    });

    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(tenantDbMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
  });

  it("does not distinguish missing, foreign-tenant, or mismatched-workspace leads", async () => {
    const workspaceA = "40000000-0000-4000-8000-000000000001";
    const workspaceB = "40000000-0000-4000-8000-000000000002";
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: workspaceA,
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
    });
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseLead, tenant_id: TENANT_B, workspace_id: workspaceA })
      .mockResolvedValueOnce({ ...baseLead, workspace_id: workspaceB });

    await expect(getLeadByIdAction("missing", TENANT_SELECTOR)).resolves.toBeNull();
    await expect(getLeadByIdAction("foreign", TENANT_SELECTOR)).resolves.toBeNull();
    await expect(getLeadByIdAction("other-workspace", TENANT_SELECTOR)).resolves.toBeNull();

    expect(queryMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("allows a workspace-selected session to read a tenant-wide lead", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: "40000000-0000-4000-8000-000000000001",
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
    });
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, workspace_id: null });

    await expect(getLeadByIdAction("lead-1", TENANT_SELECTOR)).resolves.toMatchObject({ id: "lead-1" });
  });

  it("records the claiming user on claim audit events", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.claimLeadForUser.mockResolvedValue(1);

    const result = await claimLeadAction("lead-1");

    expect(result).toEqual({ success: true });
    expect(queryMocks.claimLeadForUser).toHaveBeenCalledWith("lead-1", USER_A);
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_claimed",
      "lead",
      "lead-1",
      undefined,
      { actor: { userId: USER_A, email: "one@example.com", role: "researcher" } },
    );
  });

  it("rejects researcher claims for already assigned, archived, or excluded leads", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });

    for (const lead of [
      { ...baseLead, assigned_to_user_id: USER_A },
      { ...baseLead, assigned_to_user_id: "user-2" },
      { ...baseLead, archived_at: "2026-08-01T00:00:00.000Z" },
      { ...baseLead, is_excluded: true },
    ]) {
      queryMocks.getLeadById.mockResolvedValueOnce(lead);
      await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    }

    expect(queryMocks.claimLeadForUser).not.toHaveBeenCalled();
  });

  it("rejects researcher claims outside assigned markets before mutation or audit", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.userCanAccessMarket.mockResolvedValue(false);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.claimLeadForUser).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not disclose lead identity when a researcher loses an atomic claim race", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValueOnce(baseLead);
    queryMocks.claimLeadForUser.mockResolvedValue(0);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.getLeadById).toHaveBeenCalledTimes(1);
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("preserves the admin claim path for inactive inventory", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({
      ...baseLead,
      archived_at: "2026-08-01T00:00:00.000Z",
      is_excluded: true,
    });
    queryMocks.claimLeadForUser.mockResolvedValue(1);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ success: true });
    expect(queryMocks.claimLeadForUser).toHaveBeenCalledWith(
      "lead-1",
      USER_A,
      { preserveAdminSemantics: true },
    );
  });

  it("records the releasing user on unclaim audit events", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: USER_A });
    queryMocks.assignLeadToUser.mockResolvedValue(undefined);

    const result = await unclaimLeadAction("lead-1");

    expect(result).toEqual({ success: true });
    expect(queryMocks.assignLeadToUser).toHaveBeenCalledWith("lead-1", null);
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_unclaimed",
      "lead",
      "lead-1",
      undefined,
      { actor: { userId: USER_A, email: "one@example.com", role: "researcher" } },
    );
  });

  it("requires researchers to claim a lead before status changes", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);

    const result = await updateLeadStatusAction("lead-1", "contacted");

    expect(result).toEqual({ error: "Claim this lead before updating it." });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("allows admins to update unclaimed lead status", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.updateLeadStatus.mockResolvedValue(undefined);

    const result = await updateLeadStatusAction("lead-1", "contacted");

    expect(result).toEqual({ success: true });
    expect(queryMocks.updateLeadStatus).toHaveBeenCalledWith("lead-1", "contacted");
  });

  it("prevents researchers from logging outreach on another owner lead", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({
      ...baseLead,
      assigned_to_user_id: "user-2",
      assigned_user_email: "two@example.com",
    });

    const result = await logOutreachEventAction("lead-1", { channel: "call", outcome: "contacted" });

    expect(result).toEqual({ error: "Lead not found" });
    expect(queryMocks.createOutreachEvent).not.toHaveBeenCalled();
  });

  it("prevents researchers from mutating archived or excluded owned leads", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, archived_at: "2026-08-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, is_excluded: true });

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("rejects researcher mutations outside assigned markets before mutation or audit", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: USER_A, market_id: "market-uk" });
    queryMocks.userCanAccessMarket.mockResolvedValue(false);

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("fails closed before legacy auth or database access when lifecycle tenant scope is unavailable", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValue(new Error("A valid tenant scope is required"));

    await expect(updateLeadStatusAction("lead-1", "contacted", TENANT_SELECTOR))
      .rejects.toThrow("A valid tenant scope is required");

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      TENANT_SELECTOR,
      "account:read",
      { action: "lead.status.update" },
    );
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("rejects mismatched actor identity and workspace-narrowed lifecycle scope before database access", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "different-user", email: "other@example.com", role: "admin" });

    await expect(updateLeadNotesAction("lead-1", "note", TENANT_SELECTOR)).rejects.toMatchObject({
      code: "TENANT_SCOPE_MISMATCH",
    });

    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: "40000000-0000-4000-8000-000000000001",
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
    });
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });

    await expect(updateLeadNotesAction("lead-1", "note", TENANT_SELECTOR)).rejects.toMatchObject({
      code: "WORKSPACE_SCOPE_INVALID",
    });
    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadNotes).not.toHaveBeenCalled();
  });

  it("uses canonical researcher semantics even when the legacy session is an admin", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.claimLeadForUser.mockResolvedValue(1);

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({
      error: "Claim this lead before updating it.",
    });
    await expect(claimLeadAction("lead-1")).resolves.toEqual({ success: true });

    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.claimLeadForUser).toHaveBeenCalledWith("lead-1", USER_A);
    expect(queryMocks.claimLeadForUser).not.toHaveBeenCalledWith(
      "lead-1",
      USER_A,
      { preserveAdminSemantics: true },
    );
  });

  it("denies mutation authority to canonical read and outreach roles despite a legacy admin session", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });

    for (const role of ["reviewer", "outreach_operator", "analyst_read_only"] as const) {
      mockTenantRole(role);
      await expect(updateLeadNotesAction("lead-1", "note")).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
    }

    expect(tenantContextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadNotes).not.toHaveBeenCalled();
  });

  it("keeps manager-only lifecycle operations unavailable to a canonical researcher", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });

    await expect(archiveLeadAction("lead-1", "duplicate candidate")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });

    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.archiveLead).not.toHaveBeenCalled();
  });

  it("uses manager semantics for a canonical strategist even with a legacy researcher session", async () => {
    mockTenantRole("strategist_manager");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "strategist@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.updateLeadStatus.mockResolvedValue(undefined);

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ success: true });

    expect(queryMocks.updateLeadStatus).toHaveBeenCalledWith("lead-1", "contacted");
  });

  it("does not read or mutate a lifecycle resource returned from another tenant", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, tenant_id: TENANT_B });

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadNotesAction("lead-1", "note")).resolves.toEqual({ error: "Lead not found" });
    await expect(addLeadNoteAction("lead-1", "note")).resolves.toEqual({ error: "Lead not found" });
    await expect(getLeadNotesAction("lead-1")).resolves.toEqual([]);
    await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(unclaimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(assignLeadAction("lead-1", USER_A)).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadReminderAction("lead-1", "2026-09-01")).resolves.toEqual({ error: "Lead not found" });
    await expect(excludeLeadAction("lead-1", "duplicate candidate")).resolves.toEqual({ error: "Lead not found" });
    await expect(restoreExcludedLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(archiveLeadAction("lead-1", "duplicate candidate")).resolves.toEqual({ error: "Lead not found" });
    await expect(restoreArchivedLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadNotes).not.toHaveBeenCalled();
    expect(queryMocks.createLeadNote).not.toHaveBeenCalled();
    expect(queryMocks.getLeadNotes).not.toHaveBeenCalled();
    expect(queryMocks.claimLeadForUser).not.toHaveBeenCalled();
    expect(queryMocks.assignLeadToUser).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadReminder).not.toHaveBeenCalled();
    expect(queryMocks.setLeadExclusion).not.toHaveBeenCalled();
    expect(queryMocks.clearLeadExclusion).not.toHaveBeenCalled();
    expect(queryMocks.archiveLead).not.toHaveBeenCalled();
    expect(queryMocks.restoreArchivedLead).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("keeps mixed-tenant bulk lifecycle requests all-or-nothing", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById
      .mockResolvedValueOnce(baseLead)
      .mockResolvedValueOnce({ ...baseLead, id: "lead-foreign", tenant_id: TENANT_B })
      .mockResolvedValueOnce(baseLead)
      .mockResolvedValueOnce({ ...baseLead, id: "lead-foreign", tenant_id: TENANT_B })
      .mockResolvedValueOnce(baseLead)
      .mockResolvedValueOnce({ ...baseLead, id: "lead-foreign", tenant_id: TENANT_B });
    const ids = ["lead-1", "lead-foreign"];

    await expect(bulkArchiveLeadsAction(ids, "duplicate candidates")).resolves.toEqual({ error: "Lead not found" });
    await expect(bulkRestoreArchivedLeadsAction(ids)).resolves.toEqual({ error: "Lead not found" });
    await expect(bulkUpdateLeadStatusAction(ids, "contacted")).resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.bulkArchiveLeads).not.toHaveBeenCalled();
    expect(queryMocks.bulkRestoreArchivedLeads).not.toHaveBeenCalled();
    expect(queryMocks.bulkUpdateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("archives leads with an audit event", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.archiveLead.mockResolvedValue(1);

    const result = await archiveLeadAction("lead-1", "duplicate candidate");

    expect(result).toEqual({ success: true });
    expect(queryMocks.archiveLead).toHaveBeenCalledWith("lead-1", USER_A, "duplicate candidate");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("lead_archived", "lead", "lead-1", { reason: "duplicate candidate" });
  });

  it("restores archived leads with an audit event", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, archived_at: "2026-06-02T20:17:00.000Z" });
    queryMocks.restoreArchivedLead.mockResolvedValue(1);

    const result = await restoreArchivedLeadAction("lead-1");

    expect(result).toEqual({ success: true });
    expect(queryMocks.restoreArchivedLead).toHaveBeenCalledWith("lead-1");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("lead_restored", "lead", "lead-1", {});
  });

  it("creates manual leads through the admin action", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.createManualLead.mockResolvedValue({ id: "lead-manual", name: "Manual Candidate" });

    const result = await createManualLeadAction({
      name: "Manual Candidate",
      businessType: "local_services",
      phone: "303-555-0100",
      mapsUri: "https://maps.google.com/?q=Manual+Candidate",
      source: "Google Maps",
      contactPersonName: "Jamie Owner",
      websiteStatus: "none",
    });

    expect(result).toMatchObject({ success: true, lead: { id: "lead-manual" } });
    expect(queryMocks.createManualLead).toHaveBeenCalledWith({
      name: "Manual Candidate",
      businessType: "local_services",
      phone: "303-555-0100",
      address: null,
      mapsUri: "https://maps.google.com/?q=Manual+Candidate",
      source: "Google Maps",
      contactPersonName: "Jamie Owner",
      websiteStatus: "none",
      notes: null,
    });
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("manual_lead_created", "lead", "lead-manual", {
      businessType: "local_services",
      websiteStatus: "none",
      source: "Google Maps",
      contactPersonName: "Jamie Owner",
      actorUserId: "admin-1",
    });
  });
});
