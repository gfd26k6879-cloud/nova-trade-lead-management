import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  createLeadAiArtifactJob: vi.fn(),
  getConfiguredOpenAiApiKey: vi.fn(),
  getLeadAiArtifactById: vi.fn(),
  getLatestLeadAiArtifact: vi.fn(),
  getLeadById: vi.fn(),
  leaseLeadAiArtifactJobById: vi.fn(),
  leaseNextLeadAiArtifactJob: vi.fn(),
  getSettings: vi.fn(),
  logAiUsageEvent: vi.fn(),
  markLeadAiArtifactComplete: vi.fn(),
  markLeadAiArtifactError: vi.fn(),
  markLeadAiArtifactRetry: vi.fn(),
}));

const intelligenceMocks = vi.hoisted(() => ({
  buildLeadArtifactContext: vi.fn(),
  callOpenAILeadArtifact: vi.fn(),
  createLeadArtifactInputHash: vi.fn(),
  extractArtifactSources: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/ai/config", () => ({
  estimateOpenAIUsageCost: (usage?: { input_tokens?: number; output_tokens?: number }) => ({
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    estimatedCost: 0.05,
  }),
  getConfiguredOpenAIModel: () => "gpt-5.4-mini",
  OPENAI_LEAD_VERIFICATION_MODEL: "gpt-5.4-mini",
}));
vi.mock("@/lib/ai/lead-intelligence", () => ({
  ...intelligenceMocks,
  LEAD_INTELLIGENCE_PROMPT_VERSION: "lead-intelligence-v1",
}));

import { processLeadArtifactJobById, processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { OpenAIResponseParseError, OpenAIUsageError } from "@/lib/ai/lead-verification";

const artifact = {
  id: "artifact-1",
  lead_id: "lead-1",
  artifact_type: "business_detail",
  status: "queued",
  model: "gpt-5.4-mini",
  input_hash: "hash-1",
  prompt_version: "lead-intelligence-v1",
  content_json: {},
  sources_json: [],
  confidence: 0,
  usage_input_tokens: 0,
  usage_output_tokens: 0,
  estimated_cost: 0,
  requested_by_user_id: null,
  request_source: null,
  error: null,
  attempt_count: 1,
  last_error: null,
  next_retry_at: null,
  max_attempts: 3,
  created_at: "2026-07-10T00:00:00.000Z",
  updated_at: "2026-07-10T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  queryMocks.getSettings.mockResolvedValue({ ai_enabled: true });
  queryMocks.getLeadAiArtifactById.mockResolvedValue(artifact);
  queryMocks.leaseLeadAiArtifactJobById.mockResolvedValue({ ...artifact, status: "running" });
  queryMocks.leaseNextLeadAiArtifactJob.mockResolvedValue({ ...artifact, status: "running" });
  queryMocks.getLeadById.mockResolvedValue({
    id: "lead-1",
    name: "Gateway Park Dental",
    is_excluded: false,
    status: "new",
    business_status: "OPERATIONAL",
  });
  queryMocks.getConfiguredOpenAiApiKey.mockResolvedValue("sk-test");
  queryMocks.markLeadAiArtifactComplete.mockResolvedValue(undefined);
  queryMocks.logAiUsageEvent.mockResolvedValue(undefined);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  queryMocks.markLeadAiArtifactRetry.mockResolvedValue({
    status: "queued",
    nextRetryAt: "2026-07-10T00:05:00.000Z",
    attemptCount: 1,
    maxAttempts: 3,
  });
  intelligenceMocks.extractArtifactSources.mockReturnValue([]);
  intelligenceMocks.callOpenAILeadArtifact.mockResolvedValue({
    content: { artifact_type: "business_detail", confidence: 0.84 },
    inputHash: "hash-1",
    inputTokens: 100,
    outputTokens: 50,
    estimatedCost: 0.02,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lead AI artifact worker result integrity", () => {
  it("keeps a completed paid artifact when usage bookkeeping fails", async () => {
    queryMocks.logAiUsageEvent
      .mockRejectedValueOnce(new Error("usage store unavailable"))
      .mockResolvedValueOnce(undefined);

    const result = await processLeadArtifactJobById("artifact-1");

    expect(result).toMatchObject({ status: "complete", artifactId: "artifact-1" });
    expect(queryMocks.markLeadAiArtifactComplete).toHaveBeenCalledTimes(1);
    expect(queryMocks.markLeadAiArtifactRetry).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "usage_event", leadId: "lead-1", artifactId: "artifact-1" }),
    );
  });

  it("keeps a completed paid artifact when completion audit bookkeeping fails", async () => {
    queryMocks.createAuditLog
      .mockRejectedValueOnce(new Error("audit store unavailable"))
      .mockResolvedValueOnce(undefined);

    const result = await processLeadArtifactJobById("artifact-1");

    expect(result).toMatchObject({ status: "complete", artifactId: "artifact-1" });
    expect(queryMocks.markLeadAiArtifactComplete).toHaveBeenCalledTimes(1);
    expect(queryMocks.markLeadAiArtifactRetry).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "completion_audit", leadId: "lead-1", artifactId: "artifact-1" }),
    );
  });

  it("reports a concurrent completion instead of a retry", async () => {
    intelligenceMocks.callOpenAILeadArtifact.mockRejectedValueOnce(new Error("worker deadline elapsed"));
    queryMocks.markLeadAiArtifactRetry.mockResolvedValueOnce({
      status: "complete",
      nextRetryAt: null,
      attemptCount: 1,
      maxAttempts: 3,
    });

    const result = await processLeadArtifactJobById("artifact-1");

    expect(result).toMatchObject({ status: "complete", artifactId: "artifact-1" });
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "lead_ai_artifact_retry_ignored_completed",
      "lead",
      "lead-1",
      expect.objectContaining({ artifactId: "artifact-1" }),
    );
  });

  it("persists and accounts for billable artifact final parse failures when usage-event insertion fails", async () => {
    const parseError = new OpenAIResponseParseError(
      "Lead intelligence returned invalid JSON.",
      "artifact_final",
      "{\"artifact_type\":",
      { usage: { input_tokens: 40, output_tokens: 20 } },
      { inputTokens: 50, outputTokens: 22, totalTokens: 72, estimatedCost: 0.09 },
    );
    intelligenceMocks.callOpenAILeadArtifact.mockRejectedValueOnce(parseError);
    queryMocks.logAiUsageEvent.mockRejectedValueOnce(new Error("usage event insert unavailable"));

    const result = await processNextLeadArtifactJob();

    expect(result).toMatchObject({ status: "retrying", artifactId: "artifact-1" });
    expect(queryMocks.markLeadAiArtifactRetry).toHaveBeenCalledWith(
      "artifact-1",
      "Lead intelligence returned invalid JSON.",
      3,
      { input_tokens: 50, output_tokens: 22, estimated_cost: 0.09 },
    );
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      input_tokens: 50,
      output_tokens: 22,
      estimated_cost: 0.09,
    }));
    expect(console.error).toHaveBeenCalledWith(
      "ai_post_success_bookkeeping_failed",
      expect.objectContaining({ operation: "usage_event", artifactId: "artifact-1" }),
    );
  });

  it("persists known planning usage after a generic artifact final request failure", async () => {
    intelligenceMocks.callOpenAILeadArtifact.mockRejectedValueOnce(new OpenAIUsageError(
      "artifact final connection reset",
      "artifact_final",
      { inputTokens: 30, outputTokens: 5, totalTokens: 35, estimatedCost: 0.04 },
    ));

    const result = await processNextLeadArtifactJob();

    expect(result).toMatchObject({ status: "retrying", artifactId: "artifact-1" });
    expect(queryMocks.markLeadAiArtifactRetry).toHaveBeenCalledWith(
      "artifact-1",
      "artifact final connection reset",
      3,
      { input_tokens: 30, output_tokens: 5, estimated_cost: 0.04 },
    );
    expect(queryMocks.logAiUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      input_tokens: 30,
      output_tokens: 5,
      estimated_cost: 0.04,
    }));
  });

  it("does not schedule an artifact retry when the route aborts generation", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    intelligenceMocks.callOpenAILeadArtifact.mockImplementationOnce(async (...args) => {
      expect(args[3]).toEqual({ signal: controller.signal });
      controller.abort(deadlineError);
      throw deadlineError;
    });

    await expect(processNextLeadArtifactJob(controller.signal)).rejects.toBe(deadlineError);

    expect(queryMocks.markLeadAiArtifactRetry).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiArtifactError).not.toHaveBeenCalled();
    expect(queryMocks.logAiUsageEvent).not.toHaveBeenCalled();
  });

  it("does not persist artifact success after a late response observes abort", async () => {
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");
    intelligenceMocks.callOpenAILeadArtifact.mockImplementationOnce(async () => {
      controller.abort(deadlineError);
      return {
        content: { artifact_type: "business_detail", confidence: 0.84 },
        inputHash: "hash-1",
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.02,
      };
    });

    await expect(processNextLeadArtifactJob(controller.signal)).rejects.toBe(deadlineError);

    expect(queryMocks.markLeadAiArtifactComplete).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiArtifactRetry).not.toHaveBeenCalled();
  });
});
