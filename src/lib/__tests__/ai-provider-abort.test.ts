import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getDemoByLeadId: vi.fn(),
  getLatestAiVerification: vi.fn(),
}));

vi.mock("@/lib/db/index", () => ({ getDb: dbMocks.getDb }));
vi.mock("@/lib/db/queries", () => ({
  getDemoByLeadId: dbMocks.getDemoByLeadId,
  getLatestAiVerification: dbMocks.getLatestAiVerification,
}));

import {
  callOpenAILeadVerificationAdjudicator,
  callOpenAILeadVerifier,
  parseAiVerificationResponse,
} from "@/lib/ai/lead-verification";
import { callOpenAILeadArtifact } from "@/lib/ai/lead-intelligence";
import type { Lead } from "@/lib/db/queries";

function makeLead(): Lead {
  return {
    id: "lead-1",
    place_id: "place-1",
    name: "Gateway Park Dental",
    address: "123 Main St, Denver, CO 80202",
    phone: "303-555-0100",
    categories: ["dentist"],
    primary_type: "dentist",
    business_type: "dental",
    rating: 4.7,
    review_count: 83,
    website_uri: null,
    website_status: "none",
    maps_uri: "https://maps.example/lead-1",
    business_status: "OPERATIONAL",
    score: 12,
    status: "new",
    is_excluded: false,
    qualification_status: "qualified",
    contactability_score: 1,
    estimated_deal_value: 4500,
    ai_verification_status: "not_checked",
  } as Lead;
}

function makeVerificationResult() {
  return parseAiVerificationResponse(JSON.stringify({
    status: "no_site_found",
    confidence: 0.8,
    foundWebsiteUrl: null,
    foundEmail: null,
    foundPhone: null,
    socialProfiles: [],
    sources: [{ url: "https://directory.example/lead-1", title: "Directory", evidence: "No website listed." }],
    recommendation: "prioritize",
    reason: "Only directory evidence was found.",
    summary: "No official website was found.",
  }));
}

function makeCompetitiveReport() {
  return {
    artifact_type: "competitive_report",
    competitor_count: 0,
    competitor_examples: [],
    website_status_mix: { none: 0, social: 0, basic: 0, custom: 0, usable_ai_site: 0, weak_or_broken: 0, unknown: 0 },
    opportunity_angle: "Public evidence suggests a possible website opportunity.",
    monthly_revenue_upside_range: { low: 300, high: 900, currency: "USD" },
    assumptions: ["Local data only.", "Conservative conversion assumptions."],
    objection_handling: ["The business may have an unlisted site.", "The owner may prefer social profiles."],
    pitch_bullets: ["No official site was found.", "The business has strong reviews.", "A simple site may capture demand."],
    data_gaps: [],
    confidence: 0.75,
    sources: [],
    pitchAngleType: "no_usable_site",
    verificationCaveat: "Confirm the website status before making a definitive claim.",
    callOpener: "I noticed a possible visibility gap for your business.",
    smsOpener: "I noticed a possible visibility gap for your business.",
    voicemailScript: "I noticed a possible visibility gap and wanted to share it.",
    followUpMessage: "Following up on the visibility gap I mentioned.",
    claimSupport: ["Public evidence did not identify a usable official site."],
  };
}

function abortableFetch(observedSignals: AbortSignal[]) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal;
    if (!signal) throw new Error("fetch did not receive an AbortSignal");
    observedSignals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
  dbMocks.getLatestAiVerification.mockResolvedValue(null);
  dbMocks.getDemoByLeadId.mockResolvedValue(null);
  dbMocks.getDb.mockResolvedValue({
    prepare: vi.fn(() => ({ all: vi.fn().mockResolvedValue([]) })),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AI provider cancellation", () => {
  it("forwards caller cancellation to the lead verifier fetch", async () => {
    const observedSignals: AbortSignal[] = [];
    vi.stubGlobal("fetch", abortableFetch(observedSignals));
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");

    const request = callOpenAILeadVerifier(makeLead(), "sk-test", { signal: controller.signal });
    controller.abort(deadlineError);

    await expect(request).rejects.toBe(deadlineError);
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0].aborted).toBe(true);
  });

  it("forwards caller cancellation to the adjudicator fetch", async () => {
    const observedSignals: AbortSignal[] = [];
    vi.stubGlobal("fetch", abortableFetch(observedSignals));
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");

    const request = callOpenAILeadVerificationAdjudicator(
      makeLead(),
      makeVerificationResult(),
      null,
      { url: null, score: 0, recommendation: "manual_review", flags: [], reasons: [], hostType: "unknown" },
      "sk-test",
      { signal: controller.signal },
    );
    controller.abort(deadlineError);

    await expect(request).rejects.toBe(deadlineError);
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0].aborted).toBe(true);
  });

  it("does not swallow cancellation during the optional artifact review", async () => {
    const observedSignals: AbortSignal[] = [];
    const final = makeCompetitiveReport();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const signal = init?.signal;
      if (!signal) throw new Error("fetch did not receive an AbortSignal");
      observedSignals.push(signal);
      if (observedSignals.length === 1) {
        return new Response(JSON.stringify({ output: [], usage: { input_tokens: 10, output_tokens: 2 } }), { status: 200 });
      }
      if (observedSignals.length === 2) {
        return new Response(JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(final) }] }],
          usage: { input_tokens: 20, output_tokens: 10 },
        }), { status: 200 });
      }
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const deadlineError = new Error("worker route deadline elapsed");

    const request = callOpenAILeadArtifact(makeLead(), "competitive_report", "sk-test", { signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    controller.abort(deadlineError);

    await expect(request).rejects.toBe(deadlineError);
    expect(observedSignals).toHaveLength(3);
    expect(observedSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(observedSignals[2].aborted).toBe(true);
  });

  it("includes planning, final, and review usage in artifact cost", async () => {
    vi.stubEnv("OPENAI_AI_INPUT_USD_PER_1M_TOKENS", "1000000");
    vi.stubEnv("OPENAI_AI_OUTPUT_USD_PER_1M_TOKENS", "1000000");
    const report = makeCompetitiveReport();
    const responses = [
      { output: [], usage: { input_tokens: 10, output_tokens: 2 } },
      {
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(report) }] }],
        usage: { input_tokens: 20, output_tokens: 10 },
      },
      {
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(report) }] }],
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    ];
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(responses.shift()),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callOpenAILeadArtifact(makeLead(), "competitive_report", "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.inputTokens).toBe(35);
    expect(result.outputTokens).toBe(15);
    expect(result.estimatedCost).toBe(50);
  });

  it("retains known planning usage when the artifact final request fails", async () => {
    vi.stubEnv("OPENAI_AI_INPUT_USD_PER_1M_TOKENS", "1000000");
    vi.stubEnv("OPENAI_AI_OUTPUT_USD_PER_1M_TOKENS", "1000000");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: [],
        usage: { input_tokens: 10, output_tokens: 2 },
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error("artifact final connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callOpenAILeadArtifact(makeLead(), "competitive_report", "sk-test")).rejects.toMatchObject({
      message: "artifact final connection reset",
      stage: "artifact_final",
      inputTokens: 10,
      outputTokens: 2,
      estimatedCost: 12,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps billable optional-review parse usage and diagnostics on the successful artifact", async () => {
    vi.stubEnv("OPENAI_AI_INPUT_USD_PER_1M_TOKENS", "1000000");
    vi.stubEnv("OPENAI_AI_OUTPUT_USD_PER_1M_TOKENS", "1000000");
    const report = makeCompetitiveReport();
    const responses = [
      { output: [], usage: { input_tokens: 10, output_tokens: 2 } },
      {
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(report) }] }],
        usage: { input_tokens: 20, output_tokens: 10 },
      },
      {
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"artifact_type\":" }] }],
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify(responses.shift()),
      { status: 200 },
    )));

    const result = await callOpenAILeadArtifact(makeLead(), "competitive_report", "sk-test");

    expect(result.content).toEqual(report);
    expect(result.inputTokens).toBe(35);
    expect(result.outputTokens).toBe(15);
    expect(result.estimatedCost).toBe(50);
    expect(result.raw.reviewParseError).toMatchObject({
      stage: "artifact_review",
      usage: { inputTokens: 5, outputTokens: 3, estimatedCost: 8 },
    });
  });
});
