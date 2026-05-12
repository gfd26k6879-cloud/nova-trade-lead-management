export const OPENAI_LEAD_VERIFICATION_MODEL = "gpt-5.4-mini";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

const DEFAULT_AI_COST_RESERVATION_USD = 0.05;

export interface OpenAIUsageEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export function assertAllowedOpenAIModel(model: string | null | undefined): string {
  const normalized = (model || OPENAI_LEAD_VERIFICATION_MODEL).trim();
  if (normalized !== OPENAI_LEAD_VERIFICATION_MODEL) {
    throw new Error(`AI model is locked to ${OPENAI_LEAD_VERIFICATION_MODEL}. Refusing configured model: ${normalized}`);
  }
  return normalized;
}

export function getConfiguredOpenAIModel(env: NodeJS.ProcessEnv = process.env): string {
  return assertAllowedOpenAIModel(env.OPENAI_MODEL || OPENAI_LEAD_VERIFICATION_MODEL);
}

export function getOpenAIApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPENAI_API_KEY || "").trim();
}

export function getAiCostReservationUsd(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.OPENAI_AI_COST_RESERVATION_USD);
  if (Number.isFinite(parsed) && parsed > 0) return roundCurrency(parsed);
  return DEFAULT_AI_COST_RESERVATION_USD;
}

export function estimateOpenAIUsageCost(
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): OpenAIUsageEstimate {
  const inputTokens = Math.max(0, Math.floor(usage?.input_tokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(usage?.output_tokens ?? 0));
  const totalTokens = Math.max(0, Math.floor(usage?.total_tokens ?? inputTokens + outputTokens));

  const inputPerMillion = Number(env.OPENAI_AI_INPUT_USD_PER_1M_TOKENS);
  const outputPerMillion = Number(env.OPENAI_AI_OUTPUT_USD_PER_1M_TOKENS);

  if (Number.isFinite(inputPerMillion) && inputPerMillion > 0 && Number.isFinite(outputPerMillion) && outputPerMillion > 0) {
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost: roundCurrency((inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion),
    };
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: getAiCostReservationUsd(env),
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 10000) / 10000;
}
