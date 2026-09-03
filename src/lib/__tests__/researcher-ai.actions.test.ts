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
  getAiUsageForActor: vi.fn(),
  getAiVerificationById: vi.fn(),
  getAiVerificationCandidates: vi.fn(),
  getQualityActionCandidateIds: vi.fn(),
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
  queueLeadsForEnrichment: vi.fn(),
  createAuditLog: vi.fn(),
  createAiFeedbackEvent: vi.fn(),
  getSettings: vi.fn(),
  refreshStaleUnits: vi.fn(),
  updateCrawlRunStatus: vi.fn(),
  userCanAccessMarket: vi.fn(),
}));

const verificationMocks = vi.hoisted(() => ({
  computeLeadWinProbability: vi.fn(),
  enqueueAiVerificationForLead: vi.fn(),
  isWeakWebsiteOpportunity: vi.fn(),
  performAiVerification: vi.fn(),
  queueMissingAiVerifications: vi.fn(),
  repairLeadAiWebsiteViability: vi.fn(),
}));

const artifactMocks = vi.hoisted(() => ({
  processLeadArtifactJobById: vi.fn(),
  queueLeadAiArtifact: vi.fn(),
  queueLeadPitchPack: vi.fn(),
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
vi.mock("@/lib/ai/verification-worker", () => verificationMocks);
vi.mock("@/lib/ai/artifact-worker", () => artifactMocks);

import {
  generateResearcherPitchPackAction,
  queueLeadAiArtifactAction,
  queueLeadPitchPackAction,
  runAiVerificationAction,
  runResearcherAiCheckAction,
  submitResearcherAiFeedbackAction,
} from "@/lib/leads/actions";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const ROLE_BINDING_A = "30000000-0000-4000-8000-000000000001";
const TENANT_SELECTOR = { tenantId: TENANT_A };
const researcherSession = { userId: "researcher-1", email: "one@example.com", role: "researcher" };
const tenantResearcherSession = {
  userId: "researcher-1",
  email: "one@example.com",
  displayName: "Researcher One",
  tenantId: TENANT_A,
  workspaceId: null,
  membershipId: MEMBERSHIP_A,
  role: "researcher" as const,
  roleBindingId: ROLE_BINDING_A,
};
const claimedLead = {
  id: "lead-1",
  tenant_id: TENANT_A,
  workspace_id: null,
  market_id: "market-colorado",
  archived_at: null,
  is_excluded: false,
  assigned_to_user_id: "researcher-1",
  assigned_user_email: "one@example.com",
  assigned_user_display_name: "Researcher One",
};

const settings = {
  ai_enabled: true,
  researcher_ai_daily_run_cap: 10,
  researcher_ai_daily_budget_usd: 2,
  researcher_ai_monthly_budget_usd: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue(researcherSession);
  tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue(tenantResearcherSession);
  tenantDbMocks.withTenantDbContext.mockImplementation((callback: () => unknown) => callback());
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getLeadById.mockResolvedValue(claimedLead);
  queryMocks.userCanAccessMarket.mockResolvedValue(true);
  queryMocks.getSettings.mockResolvedValue(settings);
  queryMocks.getAiUsageForActor.mockResolvedValue({ calls: 0, cost: 0 });
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  queryMocks.createAiFeedbackEvent.mockResolvedValue({
    id: "feedback-1",
    lead_id: "lead-1",
    actor_user_id: "researcher-1",
    feedback_kind: "verification",
    verdict: "incorrect",
  });
  verificationMocks.performAiVerification.mockResolvedValue({
    success: true,
    cached: false,
    verification: { id: "verification-1", input_hash: "hash-1" },
  });
  artifactMocks.queueLeadAiArtifact.mockResolvedValue({
    status: "queued",
    leadId: "lead-1",
    artifactType: "business_detail",
    artifactId: "artifact-business",
    skippedExisting: false,
  });
  artifactMocks.queueLeadPitchPack.mockResolvedValue({
    businessDetail: { status: "queued", leadId: "lead-1", artifactType: "business_detail", artifactId: "artifact-business", skippedExisting: false },
    competitiveReport: { status: "queued", leadId: "lead-1", artifactType: "competitive_report", artifactId: "artifact-report", skippedExisting: false },
  });
  artifactMocks.processLeadArtifactJobById.mockImplementation(async (artifactId: string) => ({
    status: "complete",
    leadId: "lead-1",
    leadName: "Lead One",
    artifactType: artifactId === "artifact-business" ? "business_detail" : "competitive_report",
    artifactId,
  }));
});

describe("researcher-safe AI lead actions", () => {
  it("runs manager AI verification only after binding the requested lead to the tenant", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({ ...tenantResearcherSession, role: "owner" });
    authMocks.requirePermission.mockResolvedValue({ ...researcherSession, role: "admin" });

    const result = await runAiVerificationAction("lead-1", { force: true }, TENANT_SELECTOR);

    expect(tenantAuthorizationMocks.requireTenantPermission).toHaveBeenCalledWith(TENANT_SELECTOR, "account:read", {
      action: "lead.ai.verify",
    });
    expect(tenantDbMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(verificationMocks.performAiVerification).toHaveBeenCalledWith(claimedLead, true);
    expect(result).toMatchObject({ success: true, verification: { id: "verification-1" } });
  });

  it("preserves manager artifact and pitch-pack queues for a tenant-owned lead", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({ ...tenantResearcherSession, role: "owner" });
    authMocks.requirePermission.mockResolvedValue({ ...researcherSession, role: "admin" });

    await expect(queueLeadAiArtifactAction("lead-1", "business_detail", { force: true }))
      .resolves.toMatchObject({ status: "queued", artifactId: "artifact-business" });
    await expect(queueLeadPitchPackAction("lead-1", { force: true }))
      .resolves.toMatchObject({ businessDetail: { artifactId: "artifact-business" } });

    expect(artifactMocks.queueLeadAiArtifact).toHaveBeenCalledWith("lead-1", "business_detail", { force: true });
    expect(artifactMocks.queueLeadPitchPack).toHaveBeenCalledWith("lead-1", { force: true });
  });

  it("runs a claimed-lead researcher AI check without applying canonical verification", async () => {
    const result = await runResearcherAiCheckAction("lead-1");

    expect(authMocks.requirePermission).toHaveBeenCalledWith("ai:researcher_tools");
    expect(result).toMatchObject({ success: true, verification: { id: "verification-1" } });
    expect(verificationMocks.performAiVerification).toHaveBeenCalledWith(
      claimedLead,
      false,
      settings,
      {
        applyToLead: false,
        actorUserId: "researcher-1",
        requestSource: "researcher_ai_check",
      },
    );
    expect(queryMocks.markLeadAiVerified).not.toHaveBeenCalled();
  });

  it("blocks researcher AI tools on unclaimed leads", async () => {
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, assigned_to_user_id: null });

    const result = await runResearcherAiCheckAction("lead-1");

    expect(result).toEqual({ error: "Claim this lead before running AI tools." });
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });

  it("blocks researcher AI tools on archived leads", async () => {
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, archived_at: "2026-08-01T00:00:00.000Z" });

    const result = await runResearcherAiCheckAction("lead-1");

    expect(result).toEqual({ error: "Lead not found" });
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });

  it("blocks researcher AI tools on excluded leads", async () => {
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, is_excluded: true });

    const result = await runResearcherAiCheckAction("lead-1");

    expect(result).toEqual({ error: "Lead not found" });
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });

  it("blocks researcher AI tools when the daily run cap is exhausted", async () => {
    queryMocks.getAiUsageForActor.mockResolvedValueOnce({ calls: 10, cost: 0 }).mockResolvedValueOnce({ calls: 10, cost: 0 });

    const result = await runResearcherAiCheckAction("lead-1");

    expect(result).toMatchObject({ error: expect.stringContaining("Researcher AI daily run cap reached") });
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });

  it("queues and processes only the claimed lead pitch pack artifacts", async () => {
    const result = await generateResearcherPitchPackAction("lead-1");

    expect(artifactMocks.queueLeadPitchPack).toHaveBeenCalledWith("lead-1", {
      force: false,
      settings,
      actorUserId: "researcher-1",
      requestSource: "researcher_pitch_pack",
    });
    expect(artifactMocks.processLeadArtifactJobById).toHaveBeenCalledWith("artifact-business", {
      actorUserId: "researcher-1",
      requestSource: "researcher_pitch_pack",
    });
    expect(artifactMocks.processLeadArtifactJobById).toHaveBeenCalledWith("artifact-report", {
      actorUserId: "researcher-1",
      requestSource: "researcher_pitch_pack",
    });
    expect(result).toMatchObject({
      businessDetail: { status: "complete", artifactId: "artifact-business" },
      competitiveReport: { status: "complete", artifactId: "artifact-report" },
    });
  });

  it("records researcher AI feedback only on claimed leads", async () => {
    const result = await submitResearcherAiFeedbackAction("lead-1", {
      feedbackKind: "verification",
      verdict: "incorrect",
      correctedWebsiteUrl: "https://gatewayparkdental.example",
      reason: "AI returned a different business website.",
      verificationId: "verification-1",
    });

    expect(authMocks.requirePermission).toHaveBeenCalledWith("ai:researcher_tools");
    expect(queryMocks.createAiFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: "lead-1",
      actor_user_id: "researcher-1",
      feedback_kind: "verification",
      verdict: "incorrect",
      corrected_website_url: "https://gatewayparkdental.example",
      reason: "AI returned a different business website.",
      verification_id: "verification-1",
    }));
    expect(result).toMatchObject({ success: true, feedback: { id: "feedback-1" } });
  });

  it("blocks researcher AI feedback on unclaimed leads", async () => {
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, assigned_to_user_id: null });

    const result = await submitResearcherAiFeedbackAction("lead-1", {
      feedbackKind: "pitch",
      verdict: "not_useful",
      reason: "No claim support.",
    });

    expect(result).toEqual({ error: "Claim this lead before running AI tools." });
    expect(queryMocks.createAiFeedbackEvent).not.toHaveBeenCalled();
  });

  it("blocks every manager AI queue/provider path for a foreign-tenant lead", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({ ...tenantResearcherSession, role: "owner" });
    authMocks.requirePermission.mockResolvedValue({ ...researcherSession, role: "admin" });
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, tenant_id: TENANT_B });

    await expect(runAiVerificationAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(queueLeadAiArtifactAction("lead-1", "business_detail")).resolves.toEqual({ error: "Lead not found" });
    await expect(queueLeadPitchPackAction("lead-1")).resolves.toEqual({ error: "Lead not found" });

    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
    expect(artifactMocks.queueLeadAiArtifact).not.toHaveBeenCalled();
    expect(artifactMocks.queueLeadPitchPack).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiVerified).not.toHaveBeenCalled();
  });

  it("blocks every researcher AI provider/job/feedback path for a foreign-tenant lead", async () => {
    queryMocks.getLeadById.mockResolvedValue({ ...claimedLead, tenant_id: TENANT_B });

    await expect(runResearcherAiCheckAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(generateResearcherPitchPackAction("lead-1")).resolves.toEqual({ error: "Lead not found" });
    await expect(submitResearcherAiFeedbackAction("lead-1", {
      feedbackKind: "pitch",
      verdict: "not_useful",
    })).resolves.toEqual({ error: "Lead not found" });

    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
    expect(artifactMocks.queueLeadPitchPack).not.toHaveBeenCalled();
    expect(artifactMocks.processLeadArtifactJobById).not.toHaveBeenCalled();
    expect(queryMocks.createAiFeedbackEvent).not.toHaveBeenCalled();
    expect(queryMocks.getSettings).not.toHaveBeenCalled();
  });

  it("does not let a legacy admin permission elevate a canonical reviewer into manager AI authority", async () => {
    tenantAuthorizationMocks.requireTenantPermission.mockResolvedValue({ ...tenantResearcherSession, role: "reviewer" });
    authMocks.requirePermission.mockResolvedValue({ ...researcherSession, role: "admin" });

    await expect(runAiVerificationAction("lead-1")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      status: 403,
    });

    expect(tenantDbMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });
});
