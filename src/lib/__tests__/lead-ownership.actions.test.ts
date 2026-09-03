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
  get: vi.fn(),
  prepare: vi.fn(),
  withTenantDbContext: vi.fn(),
}));

const tenantPolicyMocks = vi.hoisted(() => ({
  getCurrentTenantPolicy: vi.fn(),
}));

const outreachPackageMocks = vi.hoisted(() => ({
  generateOutreachPackage: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getLeads: vi.fn(),
  getLeadById: vi.fn(),
  updateLeadStatus: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadFacts: vi.fn(),
  lockTenantLeadForMutation: vi.fn(),
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
  markLeadRepliedIfUnset: vi.fn(),
  markLeadMeetingBookedIfUnset: vi.fn(),
  createOutreachEvent: vi.fn(),
  getOutreachEvents: vi.fn(),
  createDemoForLead: vi.fn(),
  getDemoByLeadId: vi.fn(),
  publishDemoForLead: vi.fn(),
  unpublishDemoForLead: vi.fn(),
  revokeDemoForLead: vi.fn(),
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
  getTenantScoreRecomputeSettings: vi.fn(),
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
vi.mock("@/lib/tenancy/queries", () => ({
  createTenantQueryRepository: vi.fn(() => ({
    getCurrentTenantPolicy: tenantPolicyMocks.getCurrentTenantPolicy,
  })),
}));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/outreach-package", () => ({ generateOutreachPackage: outreachPackageMocks.generateOutreachPackage }));

import {
  addLeadNoteAction,
  archiveLeadAction,
  assignLeadAction,
  bulkArchiveLeadsAction,
  bulkRestoreArchivedLeadsAction,
  bulkUpdateLeadStatusAction,
  claimLeadAction,
  createDemoForLeadAction,
  createManualLeadAction,
  excludeLeadAction,
  generateOutreachPackageAction,
  getDemoByLeadIdAction,
  getLeadByIdAction,
  getLeadNotesAction,
  getLeadsAction,
  getOutreachEventsAction,
  getScoreBreakdownAction,
  logOutreachEventAction,
  manualWebsiteCorrectionAction,
  markLeadQualityBucketAction,
  markLeadRepliedAction,
  markMeetingBookedAction,
  publishDemoForLeadAction,
  recomputeAllScoresAction,
  recomputeLeadQualityScoresAction,
  revokeDemoForLeadAction,
  restoreArchivedLeadAction,
  restoreExcludedLeadAction,
  refreshStaleUnitsAction,
  saveLeadWorkUpdateAction,
  unclaimLeadAction,
  unpublishDemoForLeadAction,
  updateLeadNotesAction,
  updateLeadAiFeedbackAction,
  updateLeadFactsAction,
  updateLeadPhoneVerificationStatusAction,
  updateLeadReminderAction,
  updateLeadStatusAction,
} from "@/lib/leads/actions";
import { TENANT_POLICY_DEFAULTS } from "@/lib/tenancy/schemas";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "00000000-0000-4000-8000-000000000003";
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
  tenantDbMocks.prepare.mockImplementation(() => ({ get: tenantDbMocks.get }));
  tenantDbMocks.withTenantDbContext.mockImplementation((callback: (db: unknown) => unknown) => callback({
    prepare: tenantDbMocks.prepare,
  }));
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.lockTenantLeadForMutation.mockResolvedValue(baseLead);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  queryMocks.getSettings.mockResolvedValue({ niche_weights: {} });
  queryMocks.getTenantScoreRecomputeSettings.mockResolvedValue({
    niche_weights: {},
    scheduler_score_recompute_enabled: true,
  });
  queryMocks.userCanAccessMarket.mockResolvedValue(true);
  tenantPolicyMocks.getCurrentTenantPolicy.mockResolvedValue({
    ...TENANT_POLICY_DEFAULTS,
    id: "50000000-0000-4000-8000-000000000001",
    tenantId: TENANT_A,
    version: 1,
    sourceResearchEnabled: true,
    requireSourcePlanApproval: false,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  });
  mockTenantRole("owner");
});

describe("lead ownership server actions", () => {
  it("tenant-binds global score recompute and reports only affected tenant rows", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });
    queryMocks.getAllLeadsForRecompute.mockResolvedValue([{
      id: "lead-1",
      review_count: 10,
      rating: 4.5,
      categories: "[]",
      website_status: "none",
      photo_count: 0,
      has_opening_hours: 0,
      business_status: "OPERATIONAL",
      website_health: null,
      address: null,
      contactability_score: 0,
      estimated_deal_value: 0,
    }]);
    queryMocks.batchUpdateScores.mockResolvedValue(0);

    await expect(recomputeAllScoresAction(TENANT_SELECTOR)).resolves.toEqual({ count: 0 });

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      TENANT_SELECTOR,
      "account:read",
      { action: "lead.scores.recompute" },
    );
    expect(authMocks.requirePermission).toHaveBeenCalledWith("scores:recompute");
    expect(tenantDbMocks.withTenantDbContext).toHaveBeenCalledWith(expect.any(Function));
    expect(queryMocks.getTenantScoreRecomputeSettings).toHaveBeenCalledTimes(1);
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "scores_recomputed",
      "leads",
      undefined,
      { count: 0 },
    );
  });

  it("tenant-binds stale quality recompute and returns its affected-row count", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });
    queryMocks.recomputeAllLeadQualityScores.mockResolvedValue(2);

    await expect(recomputeLeadQualityScoresAction(TENANT_SELECTOR)).resolves.toEqual({ count: 2 });

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(
      TENANT_SELECTOR,
      "account:read",
      { action: "lead.quality_scores.recompute" },
    );
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_quality_scores_recomputed",
      "leads",
      undefined,
      { count: 2 },
    );
  });

  it("rejects malformed tenant selectors and non-manager canonical roles before score queries", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockRejectedValueOnce(new Error("A valid tenant scope is required"));
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });

    await expect(recomputeAllScoresAction({ tenantId: "malformed" })).rejects.toThrow("A valid tenant scope is required");

    mockTenantRole("researcher");
    await expect(recomputeLeadQualityScoresAction(TENANT_SELECTOR)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      status: 403,
    });

    expect(queryMocks.getTenantScoreRecomputeSettings).not.toHaveBeenCalled();
    expect(queryMocks.getAllLeadsForRecompute).not.toHaveBeenCalled();
    expect(queryMocks.batchUpdateScores).not.toHaveBeenCalled();
    expect(queryMocks.recomputeAllLeadQualityScores).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("tenant-binds stale-unit refresh and checks source policy before writes", async () => {
    const workspaceSession = {
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBERSHIP_A,
      role: "owner" as const,
      roleBindingId: ROLE_BINDING_A,
    };
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue(workspaceSession);
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });
    tenantDbMocks.get.mockResolvedValue({ id: "run-1" });
    queryMocks.refreshStaleUnits.mockResolvedValue(2);

    await expect(refreshStaleUnitsAction(
      "run-1",
      7,
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    )).resolves.toEqual({ success: true, count: 2 });

    expect(tenantDbMocks.get).toHaveBeenCalledWith("run-1", TENANT_A, WORKSPACE_A);
    expect(tenantPolicyMocks.getCurrentTenantPolicy).toHaveBeenCalledWith(TENANT_A);
    expect(queryMocks.refreshStaleUnits).toHaveBeenCalledWith("run-1", 7);
    expect(queryMocks.updateCrawlRunStatus).toHaveBeenCalledWith("run-1", "running");
  });

  it("fails a foreign stale-unit refresh before policy or writes", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({
      userId: USER_A,
      email: "owner@example.com",
      displayName: "Owner",
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      membershipId: MEMBERSHIP_A,
      role: "owner",
      roleBindingId: ROLE_BINDING_A,
    });
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "owner@example.com", role: "admin" });
    tenantDbMocks.get.mockResolvedValue(undefined);

    await expect(refreshStaleUnitsAction(
      "foreign-run",
      7,
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
    )).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND_OR_FORBIDDEN", status: 404 });

    expect(tenantPolicyMocks.getCurrentTenantPolicy).not.toHaveBeenCalled();
    expect(queryMocks.refreshStaleUnits).not.toHaveBeenCalled();
    expect(queryMocks.updateCrawlRunStatus).not.toHaveBeenCalled();
  });

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
    mockTenantRole("researcher");
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
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
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
      tenantId: TENANT_A,
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
      actorUserId: USER_A,
    });
  });

  it("rejects malformed manual and outreach input before tenant or database work", async () => {
    await expect(createManualLeadAction({ name: "x", businessType: "y" })).resolves.toHaveProperty("error");
    await expect(logOutreachEventAction("lead-1", { channel: "carrier_pigeon" })).resolves.toEqual({
      error: "Please complete the contact outcome fields.",
    });

    expect(tenantAuthorizationMocks.requireTenantPermission).not.toHaveBeenCalled();
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.createManualLead).not.toHaveBeenCalled();
    expect(queryMocks.createOutreachEvent).not.toHaveBeenCalled();
  });

  it("keeps foreign-tenant outreach, demo, and score resources non-enumerating", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, tenant_id: TENANT_B });

    await expect(logOutreachEventAction("lead-1", { channel: "call", outcome: "contacted" })).resolves.toEqual({ error: "Lead not found" });
    await expect(getOutreachEventsAction("lead-1")).resolves.toEqual([]);
    await expect(markLeadRepliedAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(markMeetingBookedAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(generateOutreachPackageAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(createDemoForLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(publishDemoForLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(unpublishDemoForLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(revokeDemoForLeadAction("lead-1", "customer request")).resolves.toEqual({ error: "Lead not found" });
    await expect(getDemoByLeadIdAction("lead-1")).resolves.toBeNull();
    await expect(getScoreBreakdownAction("lead-1")).resolves.toBeNull();

    expect(queryMocks.createOutreachEvent).not.toHaveBeenCalled();
    expect(queryMocks.getOutreachEvents).not.toHaveBeenCalled();
    expect(queryMocks.markLeadRepliedIfUnset).not.toHaveBeenCalled();
    expect(queryMocks.markLeadMeetingBookedIfUnset).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(outreachPackageMocks.generateOutreachPackage).not.toHaveBeenCalled();
    expect(queryMocks.createDemoForLead).not.toHaveBeenCalled();
    expect(queryMocks.publishDemoForLead).not.toHaveBeenCalled();
    expect(queryMocks.unpublishDemoForLead).not.toHaveBeenCalled();
    expect(queryMocks.revokeDemoForLead).not.toHaveBeenCalled();
    expect(queryMocks.getDemoByLeadId).not.toHaveBeenCalled();
    expect(queryMocks.getSettings).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not replay stale reply or meeting transitions", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "researcher@example.com", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, first_reply_at: "2026-08-30T12:00:00.000Z" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: USER_A, meeting_booked_at: "2026-08-30T13:00:00.000Z" });
    queryMocks.markLeadRepliedIfUnset.mockResolvedValue(0);
    queryMocks.markLeadMeetingBookedIfUnset.mockResolvedValue(0);

    await expect(markLeadRepliedAction("lead-1")).resolves.toEqual({ error: "Already marked as replied" });
    await expect(markMeetingBookedAction("lead-1")).resolves.toEqual({ error: "Already marked as meeting booked" });

    expect(queryMocks.markLeadRepliedIfUnset).toHaveBeenCalledWith("lead-1");
    expect(queryMocks.markLeadMeetingBookedIfUnset).toHaveBeenCalledWith("lead-1");
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("denies demo mutations to a canonical researcher despite legacy admin authority", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });

    await expect(createDemoForLeadAction("lead-1")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.createDemoForLead).not.toHaveBeenCalled();
  });

  it("rejects malformed quality/detail mutations before tenant or database work", async () => {
    await expect(updateLeadPhoneVerificationStatusAction("lead-1", "verified-ish")).resolves.toHaveProperty("error");
    await expect(markLeadQualityBucketAction("lead-1", "great_lead")).resolves.toHaveProperty("error");
    await expect(manualWebsiteCorrectionAction("lead-1", { resolution: "invented" })).resolves.toHaveProperty("error");
    await expect(updateLeadFactsAction("lead-1", { name: "x" })).resolves.toHaveProperty("error");
    await expect(updateLeadFactsAction("lead-1", {})).resolves.toHaveProperty("error");
    await expect(saveLeadWorkUpdateAction("lead-1", { action: "invented" })).resolves.toHaveProperty("error");
    await expect(updateLeadAiFeedbackAction("lead-1", { status: "maybe" })).resolves.toHaveProperty("error");

    expect(tenantAuthorizationMocks.requireTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.lockTenantLeadForMutation).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("keeps foreign quality/detail resources non-enumerating with zero side effects", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.lockTenantLeadForMutation.mockResolvedValue(null);

    await expect(updateLeadPhoneVerificationStatusAction("lead-1", "works")).resolves.toEqual({ error: "Lead not found" });
    await expect(markLeadQualityBucketAction("lead-1", "ready_to_call")).resolves.toEqual({ error: "Lead not found" });
    await expect(manualWebsiteCorrectionAction("lead-1", {
      websiteUrl: "https://foreign.example",
      resolution: "official_website_found",
    })).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadFactsAction("lead-1", { name: "Foreign Lead" })).resolves.toEqual({ error: "Lead not found" });
    await expect(saveLeadWorkUpdateAction("lead-1", { action: "research_note", note: "foreign" }))
      .resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadAiFeedbackAction("lead-1", { status: "correct" })).resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.lockTenantLeadForMutation).toHaveBeenCalledTimes(6);
    expect(queryMocks.updateLeadPhoneVerificationStatus).not.toHaveBeenCalled();
    expect(queryMocks.setLeadQualityBucket).not.toHaveBeenCalled();
    expect(queryMocks.applyManualWebsiteCorrection).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadFacts).not.toHaveBeenCalled();
    expect(queryMocks.createLeadNote).not.toHaveBeenCalled();
    expect(queryMocks.createOutreachEvent).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadAiFeedback).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("reports stale quality/detail writes instead of misleading success", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });
    queryMocks.updateLeadPhoneVerificationStatus.mockResolvedValue(0);
    queryMocks.setLeadQualityBucket.mockResolvedValue(0);
    queryMocks.lockTenantLeadForMutation
      .mockResolvedValueOnce(baseLead)
      .mockResolvedValueOnce(baseLead)
      .mockResolvedValue(null);

    await expect(updateLeadPhoneVerificationStatusAction("lead-1", "works")).resolves.toHaveProperty("error");
    await expect(markLeadQualityBucketAction("lead-1", "ready_to_call")).resolves.toHaveProperty("error");
    await expect(manualWebsiteCorrectionAction("lead-1", {
      websiteUrl: "https://stale.example",
      resolution: "official_website_found",
    })).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadFactsAction("lead-1", { name: "Stale Lead" })).resolves.toEqual({ error: "Lead not found" });
    await expect(saveLeadWorkUpdateAction("lead-1", { action: "research_note", note: "stale" }))
      .resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadAiFeedbackAction("lead-1", { status: "correct" })).resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.applyManualWebsiteCorrection).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadFacts).not.toHaveBeenCalled();
    expect(queryMocks.createLeadNote).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadAiFeedback).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("denies manager-only AI feedback to a canonical researcher", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "admin@example.com", role: "admin" });

    await expect(updateLeadAiFeedbackAction("lead-1", { status: "correct" }))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadAiFeedback).not.toHaveBeenCalled();
  });

  it("authorizes quality mutations from the locked assignee snapshot, not a stale pre-lock read", async () => {
    mockTenantRole("researcher");
    authMocks.requirePermission.mockResolvedValue({ userId: USER_A, email: "researcher@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: USER_A });
    queryMocks.lockTenantLeadForMutation.mockResolvedValue({
      ...baseLead,
      assigned_to_user_id: "user-2",
      assigned_user_email: "new-owner@example.com",
    });

    await expect(updateLeadPhoneVerificationStatusAction("lead-1", "works"))
      .resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadPhoneVerificationStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });
});
