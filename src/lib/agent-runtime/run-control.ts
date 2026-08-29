export interface AgentRunPreflightInput {
  readonly idempotencyKey: string;
  readonly inputHash: string;
  readonly canceled: boolean;
  readonly reservedCostUsd: number;
  readonly remainingRunBudgetUsd: number;
  readonly existing: {
    readonly inputHash: string;
    readonly resultRef: string;
  } | null;
}

export type AgentRunPreflightResult =
  | { readonly action: "execute"; readonly code: "OK_PROPOSAL" }
  | { readonly action: "replay"; readonly code: "OK_PROPOSAL"; readonly resultRef: string }
  | { readonly action: "cancel"; readonly code: "RUN_CANCELLED" }
  | {
    readonly action: "reject";
    readonly code:
      | "REJECTED_IDEMPOTENCY_REQUIRED"
      | "REJECTED_IDEMPOTENCY_CONFLICT"
      | "REJECTED_COST_CAP";
  };

export function evaluateAgentRunPreflight(input: AgentRunPreflightInput): AgentRunPreflightResult {
  if (!input.idempotencyKey.trim() || !input.inputHash.trim()) {
    return { action: "reject", code: "REJECTED_IDEMPOTENCY_REQUIRED" };
  }

  if (input.existing) {
    if (input.existing.inputHash !== input.inputHash || !input.existing.resultRef.trim()) {
      return { action: "reject", code: "REJECTED_IDEMPOTENCY_CONFLICT" };
    }
    return { action: "replay", code: "OK_PROPOSAL", resultRef: input.existing.resultRef };
  }

  if (input.canceled) {
    return { action: "cancel", code: "RUN_CANCELLED" };
  }

  if (
    !Number.isFinite(input.reservedCostUsd) ||
    !Number.isFinite(input.remainingRunBudgetUsd) ||
    input.reservedCostUsd < 0 ||
    input.remainingRunBudgetUsd < 0 ||
    input.reservedCostUsd > input.remainingRunBudgetUsd
  ) {
    return { action: "reject", code: "REJECTED_COST_CAP" };
  }

  return { action: "execute", code: "OK_PROPOSAL" };
}
