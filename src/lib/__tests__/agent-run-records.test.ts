import { describe, expect, it } from "vitest";
import {
  AgentRunRecordError,
  createFixtureAgentRunRecordStore,
  type AgentStepRecord,
} from "@/lib/agent-runtime/records";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";

function runInput() {
  return {
    id: "run-1",
    tenantId: TENANT_A,
    workspaceId: null,
    idempotencyKey: "understanding:fixture-a:v1",
    inputHash: "sha256:fixture-a",
    agentRole: "business-understanding",
    agentVersion: 1,
    promptRef: "business-understanding@1",
    policyRef: "fixture-policy@1",
    budgetUsd: 0.25,
    maxAttempts: 3,
    createdAt: "2026-08-29T12:00:00.000Z",
  } as const;
}

describe("agent run durable-domain records", () => {
  it("deduplicates an in-flight operation, replays its durable result, and rejects conflicting key reuse", () => {
    const store = createFixtureAgentRunRecordStore();

    expect(store.createOrReplay(runInput())).toMatchObject({ action: "created" });
    expect(store.createOrReplay(runInput())).toMatchObject({ action: "deduplicated" });

    const leased = store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });
    store.complete({
      runId: leased.id,
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      resultRef: "artifact:understanding-1",
      completedAt: "2026-08-29T12:01:30.000Z",
      usageCostUsd: 0.04,
    });

    expect(store.createOrReplay(runInput())).toMatchObject({
      action: "replay",
      resultRef: "artifact:understanding-1",
    });

    expect(() => store.createOrReplay({ ...runInput(), inputHash: "sha256:different" }))
      .toThrowError(new AgentRunRecordError("REJECTED_IDEMPOTENCY_CONFLICT"));
  });

  it("scopes idempotency to tenant and workspace without exposing a run through a forged scope", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    const tenantB = store.createOrReplay({ ...runInput(), id: "run-2", tenantId: TENANT_B });
    const workspaceA = store.createOrReplay({ ...runInput(), id: "run-3", workspaceId: WORKSPACE_A });

    expect(tenantB.action).toBe("created");
    expect(workspaceA.action).toBe("created");
    expect(() => store.get({ runId: "run-1", tenantId: TENANT_B, workspaceId: null }))
      .toThrowError(new AgentRunRecordError("REJECTED_SCOPE_TENANT_MISMATCH"));
  });

  it("rejects a changed execution identity even when a caller reuses the same input hash", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());

    expect(() => store.createOrReplay({ ...runInput(), promptRef: "business-understanding@2" }))
      .toThrowError(new AgentRunRecordError("REJECTED_IDEMPOTENCY_CONFLICT"));
  });

  it("allows only one live lease and recovers it exactly at expiry with a new attempt", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    const first = store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });

    expect(first).toMatchObject({ status: "running", attemptCount: 1 });
    expect(() => store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-b",
      leaseToken: "lease-b",
      now: "2026-08-29T12:01:59.999Z",
      leaseDurationMs: 60_000,
    })).toThrowError(new AgentRunRecordError("RUN_LEASE_CONFLICT"));

    const recovered = store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-b",
      leaseToken: "lease-b",
      now: "2026-08-29T12:02:00.000Z",
      leaseDurationMs: 60_000,
    });
    expect(recovered).toMatchObject({
      status: "running",
      attemptCount: 2,
      lease: { workerId: "worker-b", token: "lease-b" },
    });
    expect(store.heartbeat({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-b",
      now: "2026-08-29T12:02:10.000Z",
      leaseDurationMs: 60_000,
    })).toMatchObject({
      lease: {
        heartbeatAt: "2026-08-29T12:02:10.000Z",
        expiresAt: "2026-08-29T12:03:10.000Z",
      },
    });
    expect(() => store.heartbeat({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      now: "2026-08-29T12:02:11.000Z",
      leaseDurationMs: 60_000,
    })).toThrowError(new AgentRunRecordError("RUN_LEASE_CONFLICT"));
  });

  it("records ordered steps and redacted tool-call metadata under the active lease", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });
    store.appendStep({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      status: "complete",
      policyRef: "fixture-policy@1",
      resultRef: "evidence-set:1",
      errorCode: null,
      recordedAt: "2026-08-29T12:01:10.000Z",
    });
    store.appendStep({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-2",
      status: "blocked",
      policyRef: "fixture-policy@1",
      resultRef: null,
      errorCode: "TOOL_DENIED",
      recordedAt: "2026-08-29T12:01:20.000Z",
    });
    const recorded = store.appendToolCall({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-2",
      toolCallId: "tool-call-1",
      toolName: "external_fetch",
      toolVersion: "1",
      permissionDecision: "denied",
      status: "denied",
      inputHash: "sha256:tool-input",
      outputHash: null,
      sourceIds: ["evidence:1"],
      costUsd: 0,
      latencyMs: 2,
      errorCode: "TOOL_NOT_ALLOWED",
      redactedSummary: "Denied by fixture policy.",
      recordedAt: "2026-08-29T12:01:21.000Z",
    });

    expect(recorded.steps.map(({ id, sequence }) => ({ id, sequence }))).toEqual([
      { id: "step-1", sequence: 1 },
      { id: "step-2", sequence: 2 },
    ]);
    expect(recorded.toolCalls).toEqual([expect.objectContaining({
      permissionDecision: "denied",
      status: "denied",
      outputHash: null,
      errorCode: "TOOL_NOT_ALLOWED",
    })]);
  });

  it("rejects raw scope identifiers and secrets in generic tool-call metadata", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });
    store.appendStep({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      status: "complete",
      policyRef: "fixture-policy@1",
      resultRef: "evidence-set:1",
      errorCode: null,
      recordedAt: "2026-08-29T12:01:10.000Z",
    });

    const base = {
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      toolCallId: "tool-call-1",
      toolName: "evidence_lookup",
      toolVersion: "1",
      permissionDecision: "allowed" as const,
      status: "complete" as const,
      inputHash: "sha256:tool-input",
      outputHash: "sha256:tool-output",
      sourceIds: ["evidence:1"],
      costUsd: 0.01,
      latencyMs: 10,
      errorCode: null,
      redactedSummary: "Found one evidence record.",
      recordedAt: "2026-08-29T12:01:20.000Z",
    };

    expect(() => store.appendToolCall({ ...base, redactedSummary: `tenant=${TENANT_A}` }))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(() => store.appendToolCall({ ...base, redactedSummary: "api_key=sk-test-abcdefghijklmnopqrstuvwxyz" }))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("fails closed with a stable code for malformed runtime step and tool metadata", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });

    expect(() => store.appendStep({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      status: "invented" as AgentStepRecord["status"],
      policyRef: "fixture-policy@1",
      resultRef: null,
      errorCode: "UNKNOWN",
      recordedAt: "2026-08-29T12:01:10.000Z",
    })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));

    store.appendStep({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      status: "complete",
      policyRef: "fixture-policy@1",
      resultRef: "evidence-set:1",
      errorCode: null,
      recordedAt: "2026-08-29T12:01:10.000Z",
    });
    expect(() => store.appendToolCall({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      stepId: "step-1",
      toolCallId: "tool-call-1",
      toolName: "evidence_lookup",
      toolVersion: "1",
      permissionDecision: "allowed",
      status: "complete",
      inputHash: "sha256:tool-input",
      outputHash: "sha256:tool-output",
      sourceIds: null as unknown as readonly string[],
      costUsd: 0,
      latencyMs: 1,
      errorCode: null,
      redactedSummary: "Completed.",
      recordedAt: "2026-08-29T12:01:20.000Z",
    })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("backs off retries, dead-letters exhausted work, and never re-leases it", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay({ ...runInput(), maxAttempts: 2 });
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });
    expect(store.fail({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      errorCode: "PROVIDER_TIMEOUT",
      failedAt: "2026-08-29T12:01:10.000Z",
      usageCostUsd: 0.01,
      retryAt: "2026-08-29T12:02:10.000Z",
    })).toMatchObject({ status: "retry_wait", nextAttemptAt: "2026-08-29T12:02:10.000Z" });

    expect(() => store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-b",
      leaseToken: "lease-b",
      now: "2026-08-29T12:02:09.999Z",
      leaseDurationMs: 60_000,
    })).toThrowError(new AgentRunRecordError("RUN_RETRY_NOT_READY"));
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-b",
      leaseToken: "lease-b",
      now: "2026-08-29T12:02:10.000Z",
      leaseDurationMs: 60_000,
    });
    expect(store.fail({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-b",
      errorCode: "PROVIDER_TIMEOUT",
      failedAt: "2026-08-29T12:02:20.000Z",
      usageCostUsd: 0.02,
      retryAt: "2026-08-29T12:04:20.000Z",
    })).toMatchObject({ status: "dead_letter", nextAttemptAt: null, endedAt: "2026-08-29T12:02:20.000Z" });
    expect(() => store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-c",
      leaseToken: "lease-c",
      now: "2026-08-29T12:05:00.000Z",
      leaseDurationMs: 60_000,
    })).toThrowError(new AgentRunRecordError("RUN_TERMINAL"));
  });

  it("makes cancellation terminal and prevents a late worker from reporting success", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      workerId: "worker-a",
      leaseToken: "lease-a",
      now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: 60_000,
    });
    const canceled = store.cancel({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      canceledAt: "2026-08-29T12:01:10.000Z",
    });

    expect(canceled).toMatchObject({
      status: "canceled",
      cancelRequestedAt: "2026-08-29T12:01:10.000Z",
      endedAt: "2026-08-29T12:01:10.000Z",
    });
    expect(() => store.complete({
      runId: "run-1",
      tenantId: TENANT_A,
      workspaceId: null,
      leaseToken: "lease-a",
      resultRef: "artifact:late",
      completedAt: "2026-08-29T12:01:11.000Z",
      usageCostUsd: 0.03,
    })).toThrowError(new AgentRunRecordError("RUN_LEASE_CONFLICT"));
  });

  it("never reuses an old fencing token after successive stale-lease takeovers", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    const lease = (leaseToken: string, now: string) => store.lease({
      runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      workerId: `worker-${leaseToken}`, leaseToken, now, leaseDurationMs: 1_000,
    });

    lease("lease-a", "2026-08-29T12:01:00.000Z");
    lease("lease-b", "2026-08-29T12:01:01.000Z");
    expect(() => lease("lease-a", "2026-08-29T12:01:02.000Z"))
      .toThrowError(new AgentRunRecordError("RUN_LEASE_CONFLICT"));
  });

  it("snapshots completion commands once and rejects accessors or proxies without reading them", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      workerId: "worker-a", leaseToken: "lease-a", now: "2026-08-29T12:01:00.000Z", leaseDurationMs: 60_000 });
    let reads = 0;
    const accessor = {
      runId: "run-1", tenantId: TENANT_A, workspaceId: null, leaseToken: "lease-a",
      get resultRef() { reads += 1; return reads === 1 ? "artifact:safe" : `api_key=sk-${"x".repeat(24)}`; },
      completedAt: "2026-08-29T12:01:10.000Z", usageCostUsd: 0,
    };

    expect(() => store.complete(accessor)).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(reads).toBe(0);
    expect(() => store.complete(new Proxy({ ...accessor, resultRef: "artifact:safe" }, {})))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("rejects accessor and proxied source ID lists without invoking an element getter", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay(runInput());
    store.lease({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      workerId: "worker-a", leaseToken: "lease-a", now: "2026-08-29T12:01:00.000Z", leaseDurationMs: 60_000 });
    store.appendStep({ runId: "run-1", tenantId: TENANT_A, workspaceId: null, leaseToken: "lease-a",
      stepId: "step-1", status: "complete", policyRef: "policy@1", resultRef: "result:1",
      errorCode: null, recordedAt: "2026-08-29T12:01:05.000Z" });
    let reads = 0;
    const sourceIds = Object.defineProperty([], "0", { enumerable: true, configurable: true,
      get() { reads += 1; return "evidence:1"; } });
    Object.defineProperty(sourceIds, "length", { value: 1 });
    const call = { runId: "run-1", tenantId: TENANT_A, workspaceId: null, leaseToken: "lease-a",
      stepId: "step-1", toolCallId: "call-1", toolName: "lookup", toolVersion: "1",
      permissionDecision: "allowed" as const, status: "complete" as const,
      inputHash: "sha256:in", outputHash: "sha256:out", sourceIds: sourceIds as string[],
      costUsd: 0, latencyMs: 1, errorCode: null, redactedSummary: "Complete.",
      recordedAt: "2026-08-29T12:01:10.000Z" };

    expect(() => store.appendToolCall(call)).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(reads).toBe(0);
    expect(() => store.appendToolCall({ ...call, sourceIds: new Proxy(["evidence:1"], {}) }))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("never records or reconciles usage beyond the run budget", () => {
    const store = createFixtureAgentRunRecordStore();
    store.createOrReplay({ ...runInput(), budgetUsd: 0.05 });
    store.lease({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      workerId: "worker-a", leaseToken: "lease-a", now: "2026-08-29T12:01:00.000Z", leaseDurationMs: 60_000 });
    store.appendStep({ runId: "run-1", tenantId: TENANT_A, workspaceId: null, leaseToken: "lease-a",
      stepId: "step-1", status: "complete", policyRef: "policy@1", resultRef: "result:1",
      errorCode: null, recordedAt: "2026-08-29T12:01:05.000Z" });
    const call = { runId: "run-1", tenantId: TENANT_A, workspaceId: null, leaseToken: "lease-a",
      stepId: "step-1", toolCallId: "call-1", toolName: "lookup", toolVersion: "1",
      permissionDecision: "allowed" as const, status: "complete" as const,
      inputHash: "sha256:in", outputHash: "sha256:out", sourceIds: ["evidence:1"],
      costUsd: 0.06, latencyMs: 1, errorCode: null, redactedSummary: "Complete.",
      recordedAt: "2026-08-29T12:01:10.000Z" };

    expect(() => store.appendToolCall(call)).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    store.appendToolCall({ ...call, costUsd: 0.04 });
    expect(() => store.complete({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      leaseToken: "lease-a", resultRef: "artifact:1", completedAt: "2026-08-29T12:01:10.000Z",
      usageCostUsd: 0.03 })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(() => store.complete({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      leaseToken: "lease-a", resultRef: "artifact:1", completedAt: "2026-08-29T12:01:10.000Z",
      usageCostUsd: 0.06 })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(() => store.fail({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      leaseToken: "lease-a", errorCode: "TIMEOUT", failedAt: "2026-08-29T12:01:10.000Z",
      usageCostUsd: 0.03, retryAt: null })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(() => store.fail({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      leaseToken: "lease-a", errorCode: "TIMEOUT", failedAt: "2026-08-29T12:01:10.000Z",
      usageCostUsd: 0.06, retryAt: null })).toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("normalizes null, command proxies, and lease date overflow to the stable invalid-record code", () => {
    const store = createFixtureAgentRunRecordStore();
    expect(() => store.createOrReplay(null as unknown as ReturnType<typeof runInput>))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    expect(() => store.createOrReplay(new Proxy(runInput(), {})))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
    store.createOrReplay(runInput());
    expect(() => store.lease({ runId: "run-1", tenantId: TENANT_A, workspaceId: null,
      workerId: "worker-a", leaseToken: "lease-a", now: "2026-08-29T12:01:00.000Z",
      leaseDurationMs: Number.MAX_SAFE_INTEGER }))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));
  });

  it("returns deeply immutable records and rejects undeclared trace payload fields", () => {
    const store = createFixtureAgentRunRecordStore();
    const created = store.createOrReplay(runInput());

    expect(() => store.createOrReplay({
      ...runInput(),
      rawPrompt: "do not persist",
    } as ReturnType<typeof runInput> & { rawPrompt: string }))
      .toThrowError(new AgentRunRecordError("INVALID_AGENT_RUN_RECORD"));

    expect(Object.isFrozen(created.record)).toBe(true);
    expect(Object.isFrozen(created.record.steps)).toBe(true);
    expect(() => {
      (created.record.steps as AgentStepRecord[]).push({} as AgentStepRecord);
    }).toThrow();
  });
});
