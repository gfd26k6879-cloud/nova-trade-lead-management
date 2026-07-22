import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  OpenAIResponseParseError: class OpenAIResponseParseError extends Error {
    constructor(
      message: string,
      readonly stage: "lead_verifier" | "lead_adjudicator",
      readonly inputTokens: number,
      readonly outputTokens: number,
      readonly estimatedCost: number,
    ) {
      super(message);
      this.name = "OpenAIResponseParseError";
    }
  },
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
vi.mock("@/lib/ai/lead-verification", () => ({
  ...leadVerificationMocks,
  serializeOpenAIResponseParseError: vi.fn(),
}));
vi.mock("@/lib/ai/website-viability", () => viabilityMocks);

import { performAiVerification, processNextAiVerificationJob } from "@/lib/ai/verification-worker";

const settings = {
  ai_enabled: true,
  ai_cache_ttl_days: 30,
  ai_max_attempts: 3,
  ai_verification_concurrency: 1,
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
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  queryMocks.getSettings.mockResolvedValue(settings);
  queryMocks.getAiQueueStats.mockResolvedValue({ running: 0 });
  queryMocks.leaseNextAiVerificationJob.mockResolvedValue(lead);
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it("keeps a successful paid verification when usage bookkeeping fails", async () => {
    queryMocks.logAiUsageEvent
      .mockRejectedValueOnce(new Error("usage store unavailable"))
      .mockResolvedValueOnce(undefined);

    const result = await performAiVerification(lead as never, false, settings as never);

    expect(result).toMatchObject({ success: true, cached: false, verification: { id: "verification-1" } });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledTimes(1);
    expect(queryMocks.updateLeadAiVerificationSummary).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ id: "verification-1" }),
      expect.any(Number),
    );
    expect(queryMocks.markLeadAiError).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "usage_event", leadId: "lead-1", verificationId: "verification-1" }),
    );
  });

  it("keeps a successful paid verification when completion audit bookkeeping fails", async () => {
    queryMocks.createAuditLog
      .mockRejectedValueOnce(new Error("audit store unavailable"))
      .mockResolvedValueOnce(undefined);

    const result = await performAiVerification(lead as never, false, settings as never);

    expect(result).toMatchObject({ success: true, cached: false, verification: { id: "verification-1" } });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledTimes(1);
    expect(queryMocks.markLeadAiError).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "completion_audit", leadId: "lead-1", verificationId: "verification-1" }),
    );
  });

  it("persists and accounts for billable verifier parse failures", async () => {
    const parseError = new leadVerificationMocks.OpenAIResponseParseError(
      "AI verification returned invalid JSON.",
      "lead_verifier",
      111,
      22,
      0.07,
    );
    leadVerificationMocks.callOpenAILeadVerifier.mockRejectedValueOnce(parseError);
    queryMocks.logAiUsageEvent.mockRejectedValueOnce(new Error("usage event insert unavailable"));

    const result = await performAiVerification(lead as never, false, settings as never, {
      applyToLead: false,
      actorUserId: "researcher-1",
      requestSource: "researcher_ai_check",
    });

    expect(result).toMatchObject({ error: "AI verification returned invalid JSON." });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      usage_input_tokens: 111,
      usage_output_tokens: 22,
      estimated_cost: 0.07,
      requested_by_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    }));
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      input_tokens: 111,
      output_tokens: 22,
      estimated_cost: 0.07,
      actor_user_id: "researcher-1",
    }));
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "usage_event", leadId: "lead-1", verificationId: "verification-1" }),
    );
  });

  it("includes billable adjudicator parse usage in the persisted successful verification", async () => {
    const parseError = new leadVerificationMocks.OpenAIResponseParseError(
      "AI adjudication returned invalid JSON.",
      "lead_adjudicator",
      20,
      10,
      0.01,
    );
    leadVerificationMocks.callOpenAILeadVerificationAdjudicator.mockRejectedValueOnce(parseError);

    const result = await performAiVerification(lead as never, false, settings as never);

    expect(result).toMatchObject({ success: true, cached: false });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledWith(expect.objectContaining({
      status: "no_site_found",
      usage_input_tokens: 120,
      usage_output_tokens: 60,
      estimated_cost: 0.03,
    }));
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      input_tokens: 120,
      output_tokens: 60,
      estimated_cost: 0.03,
    }));
  });

  it("does not write verification errors or queue retries when the route aborts generation", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    leadVerificationMocks.callOpenAILeadVerifier.mockImplementationOnce(async () => {
      controller.abort(deadlineError);
      throw deadlineError;
    });

    await expect(processNextAiVerificationJob(controller.signal)).rejects.toBe(deadlineError);

    expect(queryMocks.createAiLeadVerification).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiError).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiQueueError).not.toHaveBeenCalled();
    expect(queryMocks.logAiUsageEvent).not.toHaveBeenCalled();
  });

  it("does not persist verification success after a late response observes abort", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    const response = await leadVerificationMocks.callOpenAILeadVerifier();
    leadVerificationMocks.callOpenAILeadVerifier.mockImplementationOnce(async () => {
      controller.abort(deadlineError);
      return response;
    });

    await expect(processNextAiVerificationJob(controller.signal)).rejects.toBe(deadlineError);

    expect(queryMocks.createAiLeadVerification).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadAiVerificationSummary).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiVerified).not.toHaveBeenCalled();
  });

  it("passes the route signal through optional adjudication and does not commit after abort", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    leadVerificationMocks.callOpenAILeadVerificationAdjudicator.mockImplementationOnce(async (...args) => {
      expect(args[5]).toEqual({ signal: controller.signal });
      controller.abort(deadlineError);
      throw deadlineError;
    });

    await expect(processNextAiVerificationJob(controller.signal)).rejects.toBe(deadlineError);

    expect(queryMocks.createAiLeadVerification).not.toHaveBeenCalled();
    expect(queryMocks.updateLeadAiVerificationSummary).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiQueueError).not.toHaveBeenCalled();
    expect(queryMocks.logAiUsageEvent).not.toHaveBeenCalled();
  });

  it("keeps paid verification evidence and usage retryable when lead projection fails", async () => {
    queryMocks.updateLeadAiVerificationSummary.mockRejectedValueOnce(new Error("lead projection unavailable"));
    leadVerificationMocks.callOpenAILeadVerificationAdjudicator.mockImplementationOnce(async (_lead, result) => ({
      result,
      raw: { id: "adjudication-1" },
      inputHash: "hash-1",
      inputTokens: 20,
      outputTokens: 10,
      estimatedCost: 0.01,
    }));

    const result = await processNextAiVerificationJob();

    expect(result).toMatchObject({ status: "error", leadId: "lead-1" });
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledTimes(1);
    expect(queryMocks.createAiLeadVerification).toHaveBeenCalledWith(expect.objectContaining({
      status: "no_site_found",
      estimated_cost: 0.03,
    }));
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: "lead-1",
      input_tokens: 120,
      output_tokens: 60,
      estimated_cost: 0.03,
    }));
    expect(queryMocks.markLeadAiError).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiQueueError).toHaveBeenCalledWith(
      "lead-1",
      expect.stringContaining("lead projection unavailable"),
      expect.anything(),
    );
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "ai_lead_verification_projection_failed",
      "lead",
      "lead-1",
      expect.objectContaining({ verificationId: "verification-1" }),
    );
    expect(console.error).toHaveBeenCalledWith(
      "ai_lead_verification_projection_failed",
      expect.objectContaining({ leadId: "lead-1", verificationId: "verification-1" }),
    );
  });
});
