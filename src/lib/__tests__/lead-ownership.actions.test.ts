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
  updateLeadReminder: vi.fn(),
  createLeadNote: vi.fn(),
  getLeadNotes: vi.fn(),
  assignLeadToUser: vi.fn(),
  claimLeadForUser: vi.fn(),
  setLeadExclusion: vi.fn(),
  clearLeadExclusion: vi.fn(),
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
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/db/queries", () => queryMocks);

import { logOutreachEventAction, updateLeadStatusAction } from "@/lib/leads/actions";

const baseLead = {
  id: "lead-1",
  assigned_to_user_id: null,
  assigned_user_email: null,
  assigned_user_display_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
});

describe("lead ownership server actions", () => {
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

    expect(result).toEqual({ error: "Taken by two@example.com." });
    expect(queryMocks.createOutreachEvent).not.toHaveBeenCalled();
  });
});
