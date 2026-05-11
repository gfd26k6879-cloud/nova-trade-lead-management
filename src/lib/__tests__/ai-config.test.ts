import { describe, expect, it, vi } from "vitest";
import { assertAllowedOpenAIModel, estimateOpenAIUsageCost, getConfiguredOpenAIModel, OPENAI_LEAD_VERIFICATION_MODEL } from "@/lib/ai/config";

describe("OpenAI model guardrail", () => {
  it("only allows gpt-5.4-mini", async () => {
    expect(assertAllowedOpenAIModel(OPENAI_LEAD_VERIFICATION_MODEL)).toBe("gpt-5.4-mini");
    expect(() => assertAllowedOpenAIModel("gpt-5.4")).toThrow(/locked to gpt-5\.4-mini/);
    expect(() => assertAllowedOpenAIModel("gpt-4o-mini")).toThrow(/locked to gpt-5\.4-mini/);
  });

  it("refuses OPENAI_MODEL overrides for any other model", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    expect(() => getConfiguredOpenAIModel()).toThrow(/Refusing configured model/);
    vi.unstubAllEnvs();
  });

  it("uses reserved cost when token pricing env vars are not configured", async () => {
    vi.stubEnv("OPENAI_AI_COST_RESERVATION_USD", "0.07");
    vi.stubEnv("OPENAI_AI_INPUT_USD_PER_1M_TOKENS", "");
    vi.stubEnv("OPENAI_AI_OUTPUT_USD_PER_1M_TOKENS", "");
    const cost = estimateOpenAIUsageCost({ input_tokens: 100, output_tokens: 50 });
    expect(cost.estimatedCost).toBe(0.07);
    vi.unstubAllEnvs();
  });
});
