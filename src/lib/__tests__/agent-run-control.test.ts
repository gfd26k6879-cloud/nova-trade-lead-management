import { describe, expect, it } from "vitest";
import { evaluateAgentRunPreflight } from "@/lib/agent-runtime/run-control";

describe("agent run preflight", () => {
  it("requires an idempotency key for mutation-sensitive work", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: null,
    })).toEqual({ action: "reject", code: "REJECTED_IDEMPOTENCY_REQUIRED" });
  });

  it("requires a non-empty input hash", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: " ",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: null,
    })).toEqual({ action: "reject", code: "REJECTED_IDEMPOTENCY_REQUIRED" });
  });

  it("replays a durable result without requesting another execution", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: { inputHash: "input-a", resultRef: "result-1" },
    })).toEqual({ action: "replay", code: "OK_PROPOSAL", resultRef: "result-1" });
  });

  it("rejects reuse of an idempotency key with different input", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-b",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: { inputHash: "input-a", resultRef: "result-1" },
    })).toEqual({ action: "reject", code: "REJECTED_IDEMPOTENCY_CONFLICT" });
  });

  it("does not replay a missing durable result reference", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: { inputHash: "input-a", resultRef: " " },
    })).toEqual({ action: "reject", code: "REJECTED_IDEMPOTENCY_CONFLICT" });
  });

  it("cancels before execution without a provider side effect", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: true,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: null,
    })).toEqual({ action: "cancel", code: "RUN_CANCELLED" });
  });

  it("rejects a reservation that would breach the run budget", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd: 0.11,
      remainingRunBudgetUsd: 0.10,
      existing: null,
    })).toEqual({ action: "reject", code: "REJECTED_COST_CAP" });
  });

  it.each([
    [Number.NaN, 0.10],
    [-0.01, 0.10],
    [0.01, Number.NaN],
    [0.01, -0.10],
  ])("rejects malformed cost boundaries (%s reserved, %s remaining)", (reservedCostUsd, remainingRunBudgetUsd) => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd,
      remainingRunBudgetUsd,
      existing: null,
    })).toEqual({ action: "reject", code: "REJECTED_COST_CAP" });
  });

  it("allows one execution when all preflight gates pass", () => {
    expect(evaluateAgentRunPreflight({
      idempotencyKey: "run-1",
      inputHash: "input-a",
      canceled: false,
      reservedCostUsd: 0.02,
      remainingRunBudgetUsd: 0.10,
      existing: null,
    })).toEqual({ action: "execute", code: "OK_PROPOSAL" });
  });
});
