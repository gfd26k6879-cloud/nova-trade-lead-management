import {
  executeConnectorFixtureWithPolicy,
  type ConnectorAdapterDescriptor,
  type ConnectorFixtureObservation,
} from "./adapter-contract";
import { reserveConnectorBudget, type ConnectorBudgetReservation } from "./budget";
import { evaluateConnectorPolicy, type ConnectorPolicyRequest } from "./policy";

export type ConnectorRetryReason = "timeout" | "rate_limited" | "transport" | "provider_5xx";

export class ConnectorRetryableError extends Error {
  readonly retryAfterMs: number | null;

  constructor(readonly reason: ConnectorRetryReason, retryAfterMs?: number) {
    super(`Retryable fixture connector failure: ${reason}`);
    this.name = "ConnectorRetryableError";
    this.retryAfterMs = Number.isSafeInteger(retryAfterMs)
      && (retryAfterMs as number) >= 0
      && (retryAfterMs as number) <= 86_400_000
      ? retryAfterMs as number
      : null;
  }
}

export interface ConnectorFixturePage {
  readonly observation: ConnectorFixtureObservation;
  readonly nextCursor: string | null;
  readonly complete: boolean;
  readonly actualUnits: number;
}

export interface ConnectorRunPageRequest {
  readonly runId: string;
  readonly unitId: string;
  readonly checkpointKey: string;
  readonly inputHash: string;
  readonly cursor: string | null;
  readonly maxAttempts: number;
  readonly hardCapUnits: number;
  readonly policy: ConnectorPolicyRequest;
  readonly descriptor: ConnectorAdapterDescriptor;
  readonly execute: (context: Readonly<{
    cursor: string | null;
    signal: AbortSignal;
  }>) => ConnectorFixturePage | Promise<ConnectorFixturePage>;
}

type CheckpointStatus =
  | "running" | "paused" | "retry_wait" | "page_complete" | "completed"
  | "cancelled" | "blocked" | "failed";

export interface ConnectorPageCheckpoint {
  readonly checkpointKey: string;
  readonly inputHash: string;
  readonly runId: string;
  readonly unitId: string;
  readonly tenantId: string;
  readonly sourceCardId: string;
  readonly operation: string;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly status: CheckpointStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly hardCapUnits: number;
  readonly reservedUnits: number;
  readonly actualUnits: number | null;
  readonly complete: boolean;
  readonly observation: ConnectorFixtureObservation | null;
  readonly retryReason: ConnectorRetryReason | null;
  readonly retryAfterMs: number | null;
  readonly code: string | null;
}

export type ConnectorRunnerResult = Readonly<{
  status: "page_complete" | "completed" | "retry_wait" | "failed" | "cancelled"
    | "paused" | "blocked" | "busy" | "replay";
  code: string;
  checkpoint?: ConnectorPageCheckpoint;
}>;

type MutableCheckpoint = { -readonly [K in keyof ConnectorPageCheckpoint]: ConnectorPageCheckpoint[K] };

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function validCursor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0 && value.length <= 4_096);
}

function dataRecord(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    if (required.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
    if (!Number.isSafeInteger(length) || length < 0) return null;
    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const item = descriptors[String(index)];
      if (!item || !("value" in item) || !item.enumerable || typeof item.value !== "string") return null;
      snapshot.push(item.value);
    }
    if (Reflect.ownKeys(descriptors).some((key) => {
      if (key === "length") return false;
      if (typeof key !== "string") return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key;
    })) return null;
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotRequest(value: unknown): ConnectorRunPageRequest | null {
  const input = dataRecord(value, [
    "runId", "unitId", "checkpointKey", "inputHash", "cursor", "maxAttempts",
    "hardCapUnits", "policy", "descriptor", "execute",
  ]);
  if (!input) return null;

  const policy = dataRecord(input.policy, [
    "sourceCardId", "executionMode", "tenantId", "workspaceId", "authorizedTenantId",
    "operation", "fields", "termsState", "budget", "now",
  ], ["attestation", "query"]);
  const budget = policy && dataRecord(policy.budget, ["requestedUnits", "remainingUnits"]);
  const fields = policy && stringArray(policy.fields);
  const attestation = policy?.attestation === undefined
    ? undefined
    : dataRecord(policy.attestation, ["tenantId", "expiresAt", "revoked"]);
  const descriptor = dataRecord(input.descriptor, [
    "sourceCardId", "executionMode", "transport", "operations", "outputFields",
  ]);
  const operations = descriptor && stringArray(descriptor.operations);
  const outputFields = descriptor && stringArray(descriptor.outputFields);
  if (!policy || !budget || !fields || attestation === null || !descriptor || !operations || !outputFields) return null;

  const request = {
    runId: input.runId,
    unitId: input.unitId,
    checkpointKey: input.checkpointKey,
    inputHash: input.inputHash,
    cursor: input.cursor,
    maxAttempts: input.maxAttempts,
    hardCapUnits: input.hardCapUnits,
    policy: Object.freeze({ ...policy, budget: Object.freeze(budget), fields, ...(attestation ? { attestation: Object.freeze(attestation) } : {}) }),
    descriptor: Object.freeze({ ...descriptor, operations, outputFields }),
    execute: input.execute,
  } as unknown as ConnectorRunPageRequest;

  return validId(request.runId)
    && validId(request.unitId)
    && validId(request.checkpointKey)
    && /^[a-f0-9]{64}$/u.test(request.inputHash)
    && validCursor(request.cursor)
    && Number.isSafeInteger(request.maxAttempts)
    && request.maxAttempts >= 1
    && request.maxAttempts <= 10
    && Number.isFinite(request.hardCapUnits)
    && request.hardCapUnits >= 0
    && typeof request.execute === "function"
    ? Object.freeze(request)
    : null;
}

const INVALID_OUTPUT = Symbol("invalid connector output");

function snapshotJson(value: unknown, seen = new Set<object>()): unknown | typeof INVALID_OUTPUT {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_OUTPUT;
  if (typeof value !== "object" || seen.has(value)) return INVALID_OUTPUT;
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
      if (!Number.isSafeInteger(length) || length < 0) return INVALID_OUTPUT;
      const array: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const item = descriptors[String(index)];
        if (!item || !("value" in item) || !item.enumerable) return INVALID_OUTPUT;
        const nested = snapshotJson(item.value, seen);
        if (nested === INVALID_OUTPUT) return INVALID_OUTPUT;
        array.push(nested);
      }
      if (Reflect.ownKeys(descriptors).some((key) => {
        if (key === "length") return false;
        if (typeof key !== "string") return true;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key;
      })) return INVALID_OUTPUT;
      return Object.freeze(array);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return INVALID_OUTPUT;
    const copy: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") return INVALID_OUTPUT;
      const property = descriptors[key];
      if (!("value" in property) || !property.enumerable) return INVALID_OUTPUT;
      const nested = snapshotJson(property.value, seen);
      if (nested === INVALID_OUTPUT) return INVALID_OUTPUT;
      copy[key] = nested;
    }
    return Object.freeze(copy);
  } catch {
    return INVALID_OUTPUT;
  } finally {
    seen.delete(value);
  }
}

function snapshotPage(value: unknown): ConnectorFixturePage | null {
  const page = dataRecord(value, ["observation", "nextCursor", "complete", "actualUnits"]);
  const observation = page && dataRecord(page.observation, [
    "sourceCardId", "operation", "tenantId", "runId", "observedAt", "fields",
  ]);
  const fields = observation && snapshotJson(observation.fields);
  if (!page || !observation || fields === INVALID_OUTPUT || !fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null;
  }
  return Object.freeze({
    observation: Object.freeze({ ...observation, fields }) as unknown as ConnectorFixtureObservation,
    nextCursor: page.nextCursor,
    complete: page.complete,
    actualUnits: page.actualUnits,
  }) as ConnectorFixturePage;
}

function snapshot(value: MutableCheckpoint): ConnectorPageCheckpoint {
  return Object.freeze({ ...value });
}

function result(
  status: ConnectorRunnerResult["status"],
  code: string,
  checkpoint?: MutableCheckpoint,
): ConnectorRunnerResult {
  return Object.freeze({ status, code, ...(checkpoint ? { checkpoint: snapshot(checkpoint) } : {}) });
}

function sameIdentity(checkpoint: MutableCheckpoint, request: ConnectorRunPageRequest): boolean {
  return checkpoint.inputHash === request.inputHash
    && checkpoint.runId === request.runId
    && checkpoint.unitId === request.unitId
    && checkpoint.cursor === request.cursor
    && checkpoint.maxAttempts === request.maxAttempts
    && checkpoint.hardCapUnits === request.hardCapUnits
    && checkpoint.tenantId === request.policy.tenantId
    && checkpoint.sourceCardId === request.policy.sourceCardId
    && checkpoint.operation === request.policy.operation;
}

function terminal(status: CheckpointStatus): boolean {
  return ["page_complete", "completed", "cancelled", "blocked", "failed"].includes(status);
}

function validPage(page: ConnectorFixturePage, reserved: number, request: ConnectorRunPageRequest): boolean {
  const validContinuation = page.complete
    ? page.nextCursor === null
    : validCursor(page.nextCursor) && page.nextCursor !== null && page.nextCursor !== request.cursor;
  return Number.isFinite(page.actualUnits)
    && page.actualUnits >= 0
    && page.actualUnits <= reserved
    && validContinuation;
}

function observationMatchesRequest(
  observation: ConnectorFixtureObservation,
  request: ConnectorRunPageRequest,
): boolean {
  return observation.runId === request.runId
    && observation.tenantId === request.policy.tenantId
    && observation.sourceCardId === request.policy.sourceCardId
    && observation.operation === request.policy.operation
    && Object.keys(observation.fields).every((field) => request.policy.fields.includes(field));
}

/**
 * Fixture-only contract harness: one invocation executes at most one page.
 * Postgres must own durable production checkpoints; this never enables a live connector.
 */
export function createFixtureConnectorRunner() {
  const checkpoints = new Map<string, MutableCheckpoint>();
  const reservations = new Map<string, ConnectorBudgetReservation>();
  const paused = new Set<string>();
  const cancelled = new Set<string>();
  const killed = new Set<string>();
  const active = new Map<string, AbortController>();
  const continuations = new Map<string, Readonly<{ cursor: string | null; complete: boolean }>>();

  function abortRun(runId: string): void {
    for (const [key, controller] of active) {
      if (checkpoints.get(key)?.runId === runId) controller.abort();
    }
  }

  async function runPage(requestValue: ConnectorRunPageRequest): Promise<ConnectorRunnerResult> {
    const request = snapshotRequest(requestValue);
    if (!request) return result("blocked", "D015_MALFORMED");

    const prior = checkpoints.get(request.checkpointKey);
    if (prior && !sameIdentity(prior, request)) return result("blocked", "D015_CONFLICT");
    if (prior?.status === "running") return result("busy", "D015_ALREADY_IN_PROGRESS");
    if (prior && terminal(prior.status)) return result("replay", "D015_REPLAY_SAME_INPUT", prior);
    if (killed.has(request.runId)) return result("blocked", "D015_KILLED");
    if (cancelled.has(request.runId)) return result("cancelled", "D015_CANCELLED");
    if (paused.has(request.runId)) return result("paused", "D015_PAUSED");

    const unitKey = `${request.runId.length}:${request.runId}${request.unitId}`;
    const continuation = continuations.get(unitKey);
    const cursorAlreadyClaimed = !prior && [...checkpoints.values()].some((checkpoint) => (
      checkpoint.runId === request.runId
      && checkpoint.unitId === request.unitId
      && checkpoint.cursor === request.cursor
    ));
    if (!prior && (cursorAlreadyClaimed
      || (!continuation && request.cursor !== null)
      || (continuation && (continuation.complete || request.cursor !== continuation.cursor)))) {
      return result("blocked", "D015_CONFLICT");
    }

    const policy = evaluateConnectorPolicy(request.policy);
    if (policy.decision === "block") return result("blocked", policy.code);

    const reservation = reserveConnectorBudget({
      idempotencyKey: request.checkpointKey,
      inputHash: request.inputHash,
      runId: request.runId,
      requestedUnits: request.policy.budget.requestedUnits,
      hardCapUnits: request.hardCapUnits,
      reservations: [...reservations.values()],
    });
    if (reservation.status === "blocked") return result("blocked", reservation.code);
    const newReservation = reservation.status === "reserved";
    if (newReservation) reservations.set(request.checkpointKey, reservation.reservation);

    const checkpoint: MutableCheckpoint = prior ?? {
      checkpointKey: request.checkpointKey,
      inputHash: request.inputHash,
      runId: request.runId,
      unitId: request.unitId,
      tenantId: request.policy.tenantId,
      sourceCardId: request.policy.sourceCardId,
      operation: request.policy.operation,
      cursor: request.cursor,
      nextCursor: null,
      status: "running",
      attempts: 0,
      maxAttempts: request.maxAttempts,
      hardCapUnits: request.hardCapUnits,
      reservedUnits: reservation.reservation.units,
      actualUnits: null,
      complete: false,
      observation: null,
      retryReason: null,
      retryAfterMs: null,
      code: null,
    };
    checkpoint.status = "running";
    checkpoint.attempts += 1;
    checkpoint.retryReason = null;
    checkpoint.retryAfterMs = null;
    checkpoints.set(request.checkpointKey, checkpoint);

    const controller = new AbortController();
    active.set(request.checkpointKey, controller);
    let page: ConnectorFixturePage | undefined;
    let thrown: unknown;
    let invoked = false;
    const execution = await executeConnectorFixtureWithPolicy(
      request.policy,
      request.descriptor,
      async () => {
        invoked = true;
        try {
          page = snapshotPage(await request.execute(Object.freeze({
            cursor: request.cursor,
            signal: controller.signal,
          }))) ?? undefined;
          return page?.observation ?? null;
        } catch (error) {
          thrown = error;
          return null;
        }
      },
    );
    active.delete(request.checkpointKey);

    if (!invoked) {
      checkpoints.delete(request.checkpointKey);
      if (newReservation) reservations.delete(request.checkpointKey);
      return result("blocked", execution.conformance?.code ?? execution.policy.code);
    }
    if (killed.has(request.runId)) {
      checkpoint.status = "blocked";
      checkpoint.code = "D015_KILLED";
      return result("blocked", checkpoint.code, checkpoint);
    }
    if (cancelled.has(request.runId)) {
      checkpoint.status = "cancelled";
      checkpoint.code = "D015_CANCELLED";
      return result("cancelled", checkpoint.code, checkpoint);
    }
    if (paused.has(request.runId)) {
      checkpoint.status = "paused";
      return result("paused", "D015_PAUSED", checkpoint);
    }
    if (thrown instanceof ConnectorRetryableError) {
      checkpoint.retryReason = thrown.reason;
      checkpoint.retryAfterMs = thrown.retryAfterMs;
      if (checkpoint.attempts < checkpoint.maxAttempts) {
        checkpoint.status = "retry_wait";
        return result("retry_wait", "D015_RETRYABLE", checkpoint);
      }
      checkpoint.status = "failed";
      checkpoint.code = "D015_RETRY_EXHAUSTED";
      return result("failed", checkpoint.code, checkpoint);
    }
    if (thrown !== undefined || !page || execution.conformance?.decision !== "allow") {
      checkpoint.status = "failed";
      checkpoint.code = execution.conformance?.code ?? "D015_MALFORMED";
      return result("failed", checkpoint.code, checkpoint);
    }
    if (!validPage(page, checkpoint.reservedUnits, request)) {
      checkpoint.status = "failed";
      checkpoint.code = "D015_MALFORMED";
      return result("failed", checkpoint.code, checkpoint);
    }
    if (!observationMatchesRequest(page.observation, request)) {
      checkpoint.status = "failed";
      checkpoint.code = "D015_SOURCE_POLICY_FAIL";
      return result("failed", checkpoint.code, checkpoint);
    }

    checkpoint.observation = page.observation;
    checkpoint.nextCursor = page.nextCursor;
    checkpoint.actualUnits = page.actualUnits;
    checkpoint.complete = page.complete;
    checkpoint.status = page.complete ? "completed" : "page_complete";
    checkpoint.code = "D015_PASS";
    reservations.set(request.checkpointKey, { ...reservation.reservation, units: page.actualUnits });
    continuations.set(unitKey, Object.freeze({ cursor: page.nextCursor, complete: page.complete }));
    return result(checkpoint.status, checkpoint.code, checkpoint);
  }

  return Object.freeze({
    runPage,
    pauseRun(runId: string) {
      if (!validId(runId) || cancelled.has(runId) || killed.has(runId)) return;
      paused.add(runId);
      abortRun(runId);
    },
    resumeRun(runId: string) { paused.delete(runId); },
    cancelRun(runId: string) {
      if (!validId(runId) || killed.has(runId)) return;
      cancelled.add(runId);
      paused.delete(runId);
      abortRun(runId);
    },
    killRun(runId: string) {
      if (!validId(runId)) return;
      killed.add(runId);
      paused.delete(runId);
      abortRun(runId);
    },
    getCheckpoint(key: string) {
      const checkpoint = checkpoints.get(key);
      return checkpoint ? snapshot(checkpoint) : null;
    },
    getObservations(runId: string) {
      return Object.freeze([...checkpoints.values()]
        .filter((checkpoint) => checkpoint.runId === runId && checkpoint.observation)
        .map((checkpoint) => checkpoint.observation as ConnectorFixtureObservation));
    },
    getRunUsage(runId: string) {
      const reservedUnits = [...reservations.values()]
        .filter((reservation) => reservation.runId === runId)
        .reduce((sum, reservation) => sum + reservation.units, 0);
      const actualUnits = [...checkpoints.values()]
        .filter((checkpoint) => checkpoint.runId === runId)
        .reduce((sum, checkpoint) => sum + (checkpoint.actualUnits ?? 0), 0);
      return Object.freeze({ reservedUnits, actualUnits });
    },
  });
}
