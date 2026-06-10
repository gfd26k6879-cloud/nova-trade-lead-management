import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  createAiLeadVerification: vi.fn(),
  getAiVerificationBackfillCandidates: vi.fn(),
  getAiQueueStats: vi.fn(),
  getConfiguredOpenAiApiKey: vi.fn(),
  getLatestAiVerification: vi.fn(),
  getLeadById: vi.fn(),
  leaseNextAiVerificationJob: vi.fn(),
  getSettings: vi.fn(),
  logAiUsageEvent: vi.fn(),
  markLeadAiError: vi.fn(),
  markLeadAiQueueError: vi.fn(),
  markLeadAiQueued: vi.fn(),
  markLeadAiVerified: vi.fn(),
  updateLeadAiVerificationSummary: vi.fn(),
}));

const leadVerificationMocks = vi.hoisted(() => ({
  callOpenAILeadVerificationAdjudicator: vi.fn(),
  callOpenAILeadVerifier: vi.fn(),
  createLeadVerificationInputHash: vi.fn(),
  isAiVerificationFresh: vi.fn(),
}));

const viabilityMocks = vi.hoisted(() => ({
  assessWebsiteViability: vi.fn(),
  normalizeAiVerificationForWebsiteSales: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/ai/config", () => ({
  getConfiguredOpenAIModel: () => "gpt-5.4-mini",
  OPENAI_LEAD_VERIFICATION_MODEL: "gpt-5.4-mini",
}));
vi.mock("@/lib/ai/lead-verification", () => leadVerificationMocks);
vi.mock("@/lib/ai/website-viability", () => viabilityMocks);

import { performAiVerification } from "@/lib/ai/verification-worker";

const settings = {
  ai_enabled: true,
  ai_cache_ttl_days: 30,
};

const lead = {
  id: "lead-1",
  name: "Gateway Park Dental",
  score: 20,
  website_status: "none",
  qualification_status: "qualified",
  is_excluded: false,
  business_status: "OPERATIONAL",
  contactability_score: 1,
  estimated_deal_value: 4500,
  first_contacted_at: null,
  first_reply_at: null,
  meeting_booked_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.getSettings.mockResolvedValue(settings);
  queryMocks.getConfiguredOpenAiApiKey.mockResolvedValue("sk-test");
  queryMocks.getLatestAiVerification.mockResolvedValue(null);
  queryMocks.createAiLeadVerification.mockImplementation(async (input) => ({
    id: "verification-1",
    error: null,
    input_hash: input.input_hash,
    ...input,
  }));
  queryMocks.logAiUsageEvent.mockResolvedValue(undefined);
  queryMocks.updateLeadAiVerificationSummary.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  leadVerificationMocks.createLeadVerificationInputHash.mockReturnValue("hash-1");
  leadVerificationMocks.callOpenAILeadVerifier.mockResolvedValue({
    result: {
      status: "no_site_found",
      confidence: 0.82,
      foundWebsiteUrl: null,
      foundEmail: null,
      foundPhone: null,
      socialProfiles: [],
      sources: [],
      recommendation: "keep",
      reason: "No official website found.",
      summary: "No official website found.",
      candidateWebsites: [],
      identityMatch: { name: "unknown", location: "unknown", phone: "unknown", category: "unknown", summary: "No official website found." },
      officialSiteEvidence: [],
      contradictingEvidence: [],
      siteQualityFlags: [],
      manualReviewReason: null,
      evidenceGrade: "weak",
    },
    raw: { id: "response-1" },
    inputHash: "hash-1",
    inputTokens: 100,
    outputTokens: 50,
    estimatedCost: 0.02,
  });
  viabilityMocks.normalizeAiVerificationForWebsiteSales.mockReturnValue({
    result: {
      status: "no_site_found",
      confidence: 0.82,
      foundWebsiteUrl: null,
      foundEmail: null,
      foundPhone: null,
      socialProfiles: [],
      sources: [],
      recommendation: "keep",
      reason: "No official website found.",
      summary: "No official website found.",
      candidateWebsites: [],
      identityMatch: { name: "unknown", location: "unknown", phone: "unknown", category: "unknown", summary: "No official website found." },
      officialSiteEvidence: [],
      contradictingEvidence: [],
      siteQualityFlags: [],
      manualReviewReason: null,
      evidenceGrade: "weak",
    },
    websiteViability: null,
  });
  leadVerificationMocks.callOpenAILeadVerificationAdjudicator.mockImplementation(async (_lead, result) => ({
    result,
    raw: { id: "adjudication-1" },
    inputHash: "hash-1",
    inputTokens: 20,
    outputTokens: 10,
    estimatedCost: 0,
  }));
});

describe("researcher-safe AI verification worker behavior", () => {
  it("creates evidence and usage without applying canonical lead changes", async () => {
    const result = await performAiVerification(lead as never, false, settings as never, {
      applyToLead: false,
      actorUserId: "researcher-1",
      requestSource: "researcher_ai_check",
    });

    expect(result).toMatchObject({ success: true, cached: false, verification: { id: "verification-1" } });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledWith(expect.objectContaining({
      requested_by_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    }));
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      actor_user_id: "researcher-1",
      request_source: "researcher_ai_check",
      estimated_cost: 0.02,
    }));
    expect(queryMocks.updateLeadAiVerificationSummary).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiVerified).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiError).not.toHaveBeenCalled();
    expect(queryMocks.createAuditLog).not.toHaveBeenCalledWith("ai_lead_verified", expect.anything(), expect.anything(), expect.anything());
  });

  it("keeps the default admin path applying verification summaries", async () => {
    await performAiVerification(lead as never, false, settings as never);

    expect(queryMocks.updateLeadAiVerificationSummary).toHaveBeenCalledWith("lead-1", expect.objectContaining({ id: "verification-1" }), expect.any(Number));
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith("ai_lead_verified", "lead", "lead-1", expect.objectContaining({
      verificationId: "verification-1",
    }));
  });
});
