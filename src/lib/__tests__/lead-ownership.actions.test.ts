import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
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
vi.mock("@/lib/db/queries", () => queryMocks);

import {
  archiveLeadAction,
  claimLeadAction,
  createManualLeadAction,
  getLeadByIdAction,
  logOutreachEventAction,
  restoreArchivedLeadAction,
  unclaimLeadAction,
  updateLeadStatusAction,
} from "@/lib/leads/actions";

const baseLead = {
  id: "lead-1",
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
});

describe("lead ownership server actions", () => {
  it("returns researcher lead details only for owned active nonexcluded assigned-market leads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-2" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1", archived_at: "2026-08-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1", is_excluded: true })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1", market_id: "market-uk" });
    queryMocks.userCanAccessMarket
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(getLeadByIdAction("lead-1")).resolves.toMatchObject({ id: "lead-1" });
    await expect(getLeadByIdAction("lead-1")).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1")).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1")).resolves.toBeNull();
    await expect(getLeadByIdAction("lead-1")).resolves.toBeNull();
    expect(queryMocks.userCanAccessMarket).toHaveBeenCalledTimes(2);
  });

  it("records the claiming user on claim audit events", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.claimLeadForUser.mockResolvedValue(1);

    const result = await claimLeadAction("lead-1");

    expect(result).toEqual({ success: true });
    expect(queryMocks.claimLeadForUser).toHaveBeenCalledWith("lead-1", "user-1");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_claimed",
      "lead",
      "lead-1",
      undefined,
      { actor: { userId: "user-1", email: "one@example.com", role: "researcher" } },
    );
  });

  it("rejects researcher claims for already assigned, archived, or excluded leads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });

    for (const lead of [
      { ...baseLead, assigned_to_user_id: "user-1" },
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
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.userCanAccessMarket.mockResolvedValue(false);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.claimLeadForUser).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not disclose lead identity when a researcher loses an atomic claim race", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValueOnce(baseLead);
    queryMocks.claimLeadForUser.mockResolvedValue(0);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.getLeadById).toHaveBeenCalledTimes(1);
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("preserves the admin claim path for inactive inventory", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({
      ...baseLead,
      archived_at: "2026-08-01T00:00:00.000Z",
      is_excluded: true,
    });
    queryMocks.claimLeadForUser.mockResolvedValue(1);

    await expect(claimLeadAction("lead-1")).resolves.toEqual({ success: true });
    expect(queryMocks.claimLeadForUser).toHaveBeenCalledWith(
      "lead-1",
      "admin-1",
      { preserveAdminSemantics: true },
    );
  });

  it("records the releasing user on unclaim audit events", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: "user-1" });
    queryMocks.assignLeadToUser.mockResolvedValue(undefined);

    const result = await unclaimLeadAction("lead-1");

    expect(result).toEqual({ success: true });
    expect(queryMocks.assignLeadToUser).toHaveBeenCalledWith("lead-1", null);
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_unclaimed",
      "lead",
      "lead-1",
      undefined,
      { actor: { userId: "user-1", email: "one@example.com", role: "researcher" } },
    );
  });

  it("requires researchers to claim a lead before status changes", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);

    const result = await updateLeadStatusAction("lead-1", "contacted");

    expect(result).toEqual({ error: "Claim this lead before updating it." });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("allows admins to update unclaimed lead status", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.updateLeadStatus.mockResolvedValue(undefined);

    const result = await updateLeadStatusAction("lead-1", "contacted");

    expect(result).toEqual({ success: true });
    expect(queryMocks.updateLeadStatus).toHaveBeenCalledWith("lead-1", "contacted");
  });

  it("prevents researchers from logging outreach on another owner lead", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
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
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1", archived_at: "2026-08-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ ...baseLead, assigned_to_user_id: "user-1", is_excluded: true });

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("rejects researcher mutations outside assigned markets before mutation or audit", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1", email: "one@example.com", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...baseLead, assigned_to_user_id: "user-1", market_id: "market-uk" });
    queryMocks.userCanAccessMarket.mockResolvedValue(false);

    await expect(updateLeadStatusAction("lead-1", "contacted")).resolves.toEqual({ error: "Lead not found" });
    expect(queryMocks.updateLeadStatus).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("archives leads with an audit event", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
    queryMocks.getLeadById.mockResolvedValue(baseLead);
    queryMocks.archiveLead.mockResolvedValue(1);

    const result = await archiveLeadAction("lead-1", "duplicate candidate");

    expect(result).toEqual({ success: true });
    expect(queryMocks.archiveLead).toHaveBeenCalledWith("lead-1", "admin-1", "duplicate candidate");
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("lead_archived", "lead", "lead-1", { reason: "duplicate candidate" });
  });

  it("restores archived leads with an audit event", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
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
