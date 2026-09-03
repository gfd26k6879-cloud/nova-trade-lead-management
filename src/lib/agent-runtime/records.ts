import { isProxy } from "node:util/types";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "retry_wait"
  | "complete"
  | "failed"
  | "dead_letter"
  | "canceled";

export type AgentRunRecordErrorCode =
  | "INVALID_AGENT_RUN_RECORD"
  | "REJECTED_SCOPE_TENANT_MISMATCH"
  | "REJECTED_IDEMPOTENCY_CONFLICT"
  | "RUN_ID_CONFLICT"
  | "RUN_NOT_FOUND"
  | "RUN_LEASE_CONFLICT"
  | "RUN_LEASE_EXPIRED"
  | "RUN_RETRY_NOT_READY"
  | "RUN_ATTEMPTS_EXHAUSTED"
  | "RUN_TERMINAL";

export class AgentRunRecordError extends Error {
  constructor(readonly code: AgentRunRecordErrorCode) {
    super(code);
    this.name = "AgentRunRecordError";
  }
}

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;
type RunRef = Scope & Readonly<{ runId: string }>;
type LeaseRef = RunRef & Readonly<{ leaseToken: string }>;

export type AgentRunLease = Readonly<{
  workerId: string;
  token: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}>;

export type AgentStepRecord = Readonly<{
  id: string;
  runId: string;
  sequence: number;
  status: "complete" | "failed" | "blocked";
  policyRef: string;
  resultRef: string | null;
  errorCode: string | null;
  recordedAt: string;
}>;

export type AgentToolCallRecord = Readonly<{
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  toolVersion: string;
  permissionDecision: "allowed" | "denied";
  status: "complete" | "failed" | "denied";
  inputHash: string;
  outputHash: string | null;
  sourceIds: readonly string[];
  costUsd: number;
  latencyMs: number;
  errorCode: string | null;
  redactedSummary: string;
  recordedAt: string;
}>;

export type AgentRunRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  idempotencyKey: string;
  inputHash: string;
  agentRole: string;
  agentVersion: number;
  promptRef: string;
  policyRef: string;
  status: AgentRunStatus;
  budgetUsd: number;
  usageCostUsd: number;
  attemptCount: number;
  maxAttempts: number;
  lease: AgentRunLease | null;
  nextAttemptAt: string | null;
  resultRef: string | null;
  errorCode: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: readonly AgentStepRecord[];
  toolCalls: readonly AgentToolCallRecord[];
}>;

export type CreateAgentRunInput = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  idempotencyKey: string;
  inputHash: string;
  agentRole: string;
  agentVersion: number;
  promptRef: string;
  policyRef: string;
  budgetUsd: number;
  maxAttempts: number;
  createdAt: string;
}>;

export type CreateAgentRunResult =
  | Readonly<{ action: "created" | "deduplicated"; record: AgentRunRecord }>
  | Readonly<{ action: "replay"; record: AgentRunRecord; resultRef: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[\w-]{20,}\b|(?:password|api[_-]?key|secret|access[_-]?token)\s*[:=]\s*\S+)/iu;
const STEP_STATUSES = new Set(["complete", "failed", "blocked"]);
const TOOL_STATUSES = new Set(["complete", "failed", "denied"]);
const CREATE_FIELDS = ["id", "tenantId", "workspaceId", "idempotencyKey", "inputHash", "agentRole",
  "agentVersion", "promptRef", "policyRef", "budgetUsd", "maxAttempts", "createdAt"] as const;
const RUN_FIELDS = ["runId", "tenantId", "workspaceId"] as const;
const LEASE_FIELDS = [...RUN_FIELDS, "workerId", "leaseToken", "now", "leaseDurationMs"] as const;
const HEARTBEAT_FIELDS = [...RUN_FIELDS, "leaseToken", "now", "leaseDurationMs"] as const;
const STEP_FIELDS = [...RUN_FIELDS, "leaseToken", "stepId", "status", "policyRef", "resultRef", "errorCode", "recordedAt"] as const;
const TOOL_FIELDS = [...RUN_FIELDS, "leaseToken", "stepId", "toolCallId", "toolName", "toolVersion",
  "permissionDecision", "status", "inputHash", "outputHash", "sourceIds", "costUsd", "latencyMs",
  "errorCode", "redactedSummary", "recordedAt"] as const;
const COMPLETE_FIELDS = [...RUN_FIELDS, "leaseToken", "resultRef", "completedAt", "usageCostUsd"] as const;
const FAIL_FIELDS = [...RUN_FIELDS, "leaseToken", "errorCode", "failedAt", "usageCostUsd", "retryAt"] as const;
const CANCEL_FIELDS = [...RUN_FIELDS, "canceledAt"] as const;

function invalid(): never {
  throw new AgentRunRecordError("INVALID_AGENT_RUN_RECORD");
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
  return value;
}

function instant(value: unknown): number {
  const raw = text(value);
  const epoch = Date.parse(raw);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== raw) invalid();
  return epoch;
}

function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid();
  return value;
}

function positiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid();
  return value;
}

function snapshot<T>(value: unknown, fields: readonly string[]): T {
  if (typeof value !== "object" || value === null || isProxy(value)) invalid();
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some((field) => typeof field !== "string" || !fields.includes(field))) invalid();
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor)) invalid();
      result[field] = descriptor.value;
    }
    return Object.freeze(result) as T;
  } catch (error) {
    if (error instanceof AgentRunRecordError) throw error;
    return invalid();
  }
}

function stringArray(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)) invalid();
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = (descriptors as unknown as PropertyDescriptorMap)["length"];
    if (!lengthDescriptor || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) invalid();
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== length + 1 || keys.some((field) => typeof field !== "string")) invalid();
    const result: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" || !descriptor.value.trim()) invalid();
      result.push(descriptor.value);
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof AgentRunRecordError) throw error;
    return invalid();
  }
}

function addDuration(epoch: number, durationMs: number): string {
  try {
    const expiresAt = new Date(epoch + durationMs);
    if (!Number.isFinite(expiresAt.getTime())) invalid();
    return expiresAt.toISOString();
  } catch (error) {
    if (error instanceof AgentRunRecordError) throw error;
    return invalid();
  }
}

function checkScope(scope: Scope): void {
  if (typeof scope.tenantId !== "string" || !UUID.test(scope.tenantId)
    || (scope.workspaceId !== null
      && (typeof scope.workspaceId !== "string" || !UUID.test(scope.workspaceId)))) invalid();
}

function key(input: Scope & { readonly idempotencyKey: string }): string {
  return `${input.tenantId}\u0000${input.workspaceId ?? ""}\u0000${input.idempotencyKey}`;
}

function safeMetadata(values: readonly unknown[], scope: Scope): void {
  if (values.some((value) => {
    if (value === null) return false;
    const raw = text(value);
    return SECRET.test(raw) || raw.includes(scope.tenantId)
      || (scope.workspaceId !== null && raw.includes(scope.workspaceId));
  })) invalid();
}

function freeze(record: AgentRunRecord): AgentRunRecord {
  return Object.freeze({
    ...record,
    lease: record.lease && Object.freeze({ ...record.lease }),
    steps: Object.freeze(record.steps.map((step) => Object.freeze({ ...step }))),
    toolCalls: Object.freeze(record.toolCalls.map((call) => Object.freeze({
      ...call,
      sourceIds: Object.freeze([...call.sourceIds]),
    }))),
  });
}

function executionMatches(record: AgentRunRecord, input: CreateAgentRunInput): boolean {
  return record.inputHash === input.inputHash
    && record.agentRole === input.agentRole
    && record.agentVersion === input.agentVersion
    && record.promptRef === input.promptRef
    && record.policyRef === input.policyRef
    && record.budgetUsd === input.budgetUsd
    && record.maxAttempts === input.maxAttempts;
}

/**
 * Deterministic fixture adapter for the durable record contract. Production
 * must enforce these scoped uniqueness and lease transitions atomically in
 * Postgres; this adapter is not a durability or authorization boundary.
 */
export class FixtureAgentRunRecordStore {
  readonly #records = new Map<string, AgentRunRecord>();
  readonly #idempotency = new Map<string, string>();
  readonly #usedLeaseTokens = new Set<string>();

  #scoped(input: RunRef): AgentRunRecord {
    checkScope(input);
    const record = this.#records.get(text(input.runId));
    if (!record) throw new AgentRunRecordError("RUN_NOT_FOUND");
    if (record.tenantId !== input.tenantId || record.workspaceId !== input.workspaceId) {
      throw new AgentRunRecordError("REJECTED_SCOPE_TENANT_MISMATCH");
    }
    return record;
  }

  #save(record: AgentRunRecord): AgentRunRecord {
    const saved = freeze(record);
    this.#records.set(saved.id, saved);
    return saved;
  }

  #leased(input: LeaseRef, at: string): AgentRunRecord {
    const record = this.#scoped(input);
    const now = instant(at);
    if (now < instant(record.updatedAt)) invalid();
    if (record.status !== "running" || !record.lease || record.lease.token !== text(input.leaseToken)) {
      throw new AgentRunRecordError("RUN_LEASE_CONFLICT");
    }
    if (now >= instant(record.lease.expiresAt)) throw new AgentRunRecordError("RUN_LEASE_EXPIRED");
    return record;
  }

  createOrReplay(input: CreateAgentRunInput): CreateAgentRunResult {
    input = snapshot<CreateAgentRunInput>(input, CREATE_FIELDS);
    checkScope(input);
    [input.id, input.idempotencyKey, input.inputHash, input.agentRole, input.promptRef, input.policyRef].forEach(text);
    safeMetadata([input.id, input.idempotencyKey, input.inputHash, input.agentRole, input.promptRef, input.policyRef], input);
    positiveInt(input.agentVersion);
    positiveInt(input.maxAttempts);
    amount(input.budgetUsd);
    instant(input.createdAt);

    const operationKey = key(input);
    const existingId = this.#idempotency.get(operationKey);
    if (existingId) {
      const existing = this.#records.get(existingId)!;
      if (!executionMatches(existing, input)) {
        throw new AgentRunRecordError("REJECTED_IDEMPOTENCY_CONFLICT");
      }
      if (existing.status === "complete" && existing.resultRef) {
        return Object.freeze({ action: "replay", record: existing, resultRef: existing.resultRef });
      }
      return Object.freeze({ action: "deduplicated", record: existing });
    }
    if (this.#records.has(input.id)) throw new AgentRunRecordError("RUN_ID_CONFLICT");

    const record = this.#save({
      id: input.id,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      inputHash: input.inputHash,
      agentRole: input.agentRole,
      agentVersion: input.agentVersion,
      promptRef: input.promptRef,
      policyRef: input.policyRef,
      status: "queued",
      budgetUsd: input.budgetUsd,
      usageCostUsd: 0,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      lease: null,
      nextAttemptAt: null,
      resultRef: null,
      errorCode: null,
      cancelRequestedAt: null,
      startedAt: null,
      endedAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      steps: [],
      toolCalls: [],
    });
    this.#idempotency.set(operationKey, record.id);
    return Object.freeze({ action: "created", record });
  }

  get(input: RunRef): AgentRunRecord {
    input = snapshot<RunRef>(input, RUN_FIELDS);
    return this.#scoped(input);
  }

  lease(input: RunRef & Readonly<{
    workerId: string; leaseToken: string; now: string; leaseDurationMs: number;
  }>): AgentRunRecord {
    input = snapshot<typeof input>(input, LEASE_FIELDS);
    let record = this.#scoped(input);
    const now = instant(input.now);
    if (now < instant(record.updatedAt)) invalid();
    positiveInt(input.leaseDurationMs);
    text(input.workerId);
    text(input.leaseToken);
    safeMetadata([input.workerId, input.leaseToken], record);
    if (this.#usedLeaseTokens.has(input.leaseToken)) {
      throw new AgentRunRecordError("RUN_LEASE_CONFLICT");
    }

    if (record.status === "retry_wait" && (!record.nextAttemptAt || now < instant(record.nextAttemptAt))) {
      throw new AgentRunRecordError("RUN_RETRY_NOT_READY");
    }
    if (record.status === "running" && record.lease && now < instant(record.lease.expiresAt)) {
      throw new AgentRunRecordError("RUN_LEASE_CONFLICT");
    }
    if (!["queued", "retry_wait", "running"].includes(record.status)) {
      throw new AgentRunRecordError("RUN_TERMINAL");
    }
    if (record.attemptCount >= record.maxAttempts) {
      record = this.#save({ ...record, status: "dead_letter", lease: null,
        nextAttemptAt: null, errorCode: "ATTEMPTS_EXHAUSTED", endedAt: input.now, updatedAt: input.now });
      void record;
      throw new AgentRunRecordError("RUN_ATTEMPTS_EXHAUSTED");
    }

    const leased = this.#save({
      ...record,
      status: "running",
      attemptCount: record.attemptCount + 1,
      lease: { workerId: input.workerId, token: input.leaseToken, acquiredAt: input.now,
        heartbeatAt: input.now, expiresAt: addDuration(now, input.leaseDurationMs) },
      nextAttemptAt: null,
      errorCode: null,
      startedAt: record.startedAt ?? input.now,
      updatedAt: input.now,
    });
    this.#usedLeaseTokens.add(input.leaseToken);
    return leased;
  }

  heartbeat(input: LeaseRef & Readonly<{ now: string; leaseDurationMs: number }>): AgentRunRecord {
    input = snapshot<typeof input>(input, HEARTBEAT_FIELDS);
    const record = this.#leased(input, input.now);
    const now = instant(input.now);
    positiveInt(input.leaseDurationMs);
    return this.#save({ ...record, updatedAt: input.now, lease: { ...record.lease!,
      heartbeatAt: input.now, expiresAt: addDuration(now, input.leaseDurationMs) } });
  }

  appendStep(input: LeaseRef & Readonly<{
    stepId: string; status: AgentStepRecord["status"]; policyRef: string;
    resultRef: string | null; errorCode: string | null; recordedAt: string;
  }>): AgentRunRecord {
    input = snapshot<typeof input>(input, STEP_FIELDS);
    const record = this.#leased(input, input.recordedAt);
    text(input.stepId);
    text(input.policyRef);
    if (!STEP_STATUSES.has(input.status) || record.steps.some((step) => step.id === input.stepId)) invalid();
    if ((input.status === "complete") !== (input.resultRef !== null)
      || (input.status === "complete") === (input.errorCode !== null)) invalid();
    if (input.resultRef !== null) text(input.resultRef);
    if (input.errorCode !== null) text(input.errorCode);
    safeMetadata([input.stepId, input.policyRef, input.resultRef, input.errorCode], record);
    const step: AgentStepRecord = { id: input.stepId, runId: record.id,
      sequence: record.steps.length + 1, status: input.status, policyRef: input.policyRef,
      resultRef: input.resultRef, errorCode: input.errorCode, recordedAt: input.recordedAt };
    return this.#save({ ...record, steps: [...record.steps, step], updatedAt: input.recordedAt });
  }

  appendToolCall(input: LeaseRef & Readonly<{
    stepId: string; toolCallId: string; toolName: string; toolVersion: string;
    permissionDecision: AgentToolCallRecord["permissionDecision"];
    status: AgentToolCallRecord["status"]; inputHash: string; outputHash: string | null;
    sourceIds: readonly string[]; costUsd: number; latencyMs: number;
    errorCode: string | null; redactedSummary: string; recordedAt: string;
  }>): AgentRunRecord {
    input = snapshot<typeof input>(input, TOOL_FIELDS);
    const sourceIds = stringArray(input.sourceIds);
    const record = this.#leased(input, input.recordedAt);
    [input.stepId, input.toolCallId, input.toolName, input.toolVersion, input.inputHash].forEach(text);
    if (!record.steps.some((step) => step.id === input.stepId)
      || record.toolCalls.some((call) => call.id === input.toolCallId)
      || !["allowed", "denied"].includes(input.permissionDecision)
      || !TOOL_STATUSES.has(input.status)
      || (input.permissionDecision === "denied") !== (input.status === "denied")) invalid();
    if ((input.status === "complete") !== (input.outputHash !== null)
      || (input.status === "complete") === (input.errorCode !== null)) invalid();
    amount(input.costUsd);
    amount(input.latencyMs);
    if (!Number.isSafeInteger(input.latencyMs)) invalid();
    safeMetadata([input.stepId, input.toolCallId, input.toolName, input.toolVersion, input.inputHash,
      input.outputHash, ...sourceIds, input.errorCode, input.redactedSummary], record);
    const usageCostUsd = record.usageCostUsd + input.costUsd;
    if (!Number.isFinite(usageCostUsd) || usageCostUsd > record.budgetUsd) invalid();

    const call: AgentToolCallRecord = {
      id: input.toolCallId, runId: record.id, stepId: input.stepId, toolName: input.toolName,
      toolVersion: input.toolVersion, permissionDecision: input.permissionDecision, status: input.status,
      inputHash: input.inputHash, outputHash: input.outputHash, sourceIds,
      costUsd: input.costUsd, latencyMs: input.latencyMs, errorCode: input.errorCode,
      redactedSummary: input.redactedSummary, recordedAt: input.recordedAt,
    };
    return this.#save({ ...record, usageCostUsd,
      toolCalls: [...record.toolCalls, call], updatedAt: input.recordedAt });
  }

  complete(input: LeaseRef & Readonly<{
    resultRef: string; completedAt: string; usageCostUsd: number;
  }>): AgentRunRecord {
    input = snapshot<typeof input>(input, COMPLETE_FIELDS);
    const record = this.#leased(input, input.completedAt);
    text(input.resultRef);
    safeMetadata([input.resultRef], record);
    amount(input.usageCostUsd);
    if (input.usageCostUsd < record.usageCostUsd || input.usageCostUsd > record.budgetUsd) invalid();
    return this.#save({ ...record, status: "complete", usageCostUsd: input.usageCostUsd,
      lease: null, nextAttemptAt: null, resultRef: input.resultRef, errorCode: null,
      endedAt: input.completedAt, updatedAt: input.completedAt });
  }

  fail(input: LeaseRef & Readonly<{
    errorCode: string; failedAt: string; usageCostUsd: number; retryAt: string | null;
  }>): AgentRunRecord {
    input = snapshot<typeof input>(input, FAIL_FIELDS);
    const record = this.#leased(input, input.failedAt);
    text(input.errorCode);
    safeMetadata([input.errorCode], record);
    amount(input.usageCostUsd);
    if (input.usageCostUsd < record.usageCostUsd || input.usageCostUsd > record.budgetUsd) invalid();
    if (input.retryAt !== null && instant(input.retryAt) <= instant(input.failedAt)) invalid();
    const retry = input.retryAt !== null && record.attemptCount < record.maxAttempts;
    const exhausted = input.retryAt !== null && !retry;
    return this.#save({ ...record, status: exhausted ? "dead_letter" : retry ? "retry_wait" : "failed",
      usageCostUsd: input.usageCostUsd, lease: null, nextAttemptAt: retry ? input.retryAt : null,
      errorCode: input.errorCode, endedAt: retry ? null : input.failedAt, updatedAt: input.failedAt });
  }

  cancel(input: RunRef & Readonly<{ canceledAt: string }>): AgentRunRecord {
    input = snapshot<typeof input>(input, CANCEL_FIELDS);
    const record = this.#scoped(input);
    if (instant(input.canceledAt) < instant(record.updatedAt)) invalid();
    if (["complete", "failed", "dead_letter", "canceled"].includes(record.status)) {
      throw new AgentRunRecordError("RUN_TERMINAL");
    }
    return this.#save({ ...record, status: "canceled", lease: null, nextAttemptAt: null,
      cancelRequestedAt: input.canceledAt, endedAt: input.canceledAt, updatedAt: input.canceledAt });
  }
}

export function createFixtureAgentRunRecordStore(): FixtureAgentRunRecordStore {
  return new FixtureAgentRunRecordStore();
}
