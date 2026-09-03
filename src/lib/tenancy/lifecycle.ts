import type { DbClient } from "@/lib/db";
import {
  ACTOR_LAYERS,
  TENANT_STATUSES,
  type ActorLayer,
  type CorrelationId,
  type TenantId,
  type TenantStatus,
} from "@/lib/tenancy/types";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";

/** The only tenant transitions owned by this service. Provisioning and deletion have separate workflows. */
export const TENANT_LIFECYCLE_TRANSITIONS = {
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
} as const satisfies Partial<Record<TenantStatus, readonly TenantStatus[]>>;

export type TenantLifecycleOperation =
  | "setup"
  | "normal"
  | "status"
  | "read"
  | "export"
  | "remediation"
  | "recovery"
  | "business_mutation"
  | "worker_start"
  | "deletion_request";

/** State policy is a guard only; it does not replace D-002 authorization. */
export const TENANT_OPERATION_POLICY: Readonly<Record<TenantStatus, readonly TenantLifecycleOperation[]>> = {
  provisioning: ["setup"],
  active: [
    "normal",
    "status",
    "read",
    "export",
    "remediation",
    "recovery",
    "business_mutation",
    "worker_start",
  ],
  suspended: ["status", "read", "export", "remediation", "recovery"],
  archived: ["status", "read", "export", "deletion_request"],
  deletion_pending: ["status"],
  deleted: ["status"],
};

export const TENANT_LIFECYCLE_RESULT_CODES = [
  "ALLOWED",
  "OK_LIFECYCLE_TRANSITIONED",
  "BLOCKED_MALFORMED",
  "BLOCKED_STATE_CONFLICT",
  "BLOCKED_TRANSACTION_REQUIRED",
  "BLOCKED_AUDIT_REQUIRED",
  "NOT_FOUND_NON_ENUMERATING",
  "FAILED_INTERNAL",
] as const;
export type TenantLifecycleResultCode = (typeof TENANT_LIFECYCLE_RESULT_CODES)[number];

export interface TenantLifecycleDecision {
  allowed: boolean;
  code: TenantLifecycleResultCode;
}

export interface TenantLifecycleTransitionRequest {
  /** This must be resolved by the server before this service is called. */
  tenantId: TenantId;
  actorId: string;
  actorLayer: ActorLayer;
  reasonCode: string;
  reason: string;
  correlationId: CorrelationId;
  expectedCurrentState: TenantStatus;
  toStatus: TenantStatus;
  /** Optional compatibility assertion; it cannot override expectedCurrentState. */
  fromStatus?: TenantStatus;
}

export interface TenantLifecycleAuditEvent {
  action: "tenant.lifecycle.transition";
  tenantId: TenantId;
  fromStatus: TenantStatus;
  toStatus: TenantStatus;
  actorId: string;
  actorLayer: ActorLayer;
  reasonCode: string;
  reason: string;
  correlationId: CorrelationId;
}

export interface TenantLifecycleAuditWriter {
  write(event: TenantLifecycleAuditEvent): Promise<void>;
}

export interface TenantLifecycleTransactionScope {
  db: DbClient;
  repository: TenantQueryRepository;
  auditWriter: TenantLifecycleAuditWriter;
}

/** The runner owns the transaction and must provide one coherent transaction scope to the callback. */
export interface TenantLifecycleTransactionRunner {
  run<T>(callback: (scope: TenantLifecycleTransactionScope) => Promise<T>): Promise<T>;
}

export interface TenantLifecycleDependencies {
  transactionRunner: TenantLifecycleTransactionRunner;
}

export interface TenantLifecycleTransitionResult {
  allowed: true;
  code: "OK_LIFECYCLE_TRANSITIONED";
  tenant: Awaited<ReturnType<TenantQueryRepository["getTenant"]>> extends infer T
    ? Exclude<T, null>
    : never;
}

export class TenantLifecycleError extends Error {
  readonly code: TenantLifecycleResultCode;

  constructor(code: TenantLifecycleResultCode) {
    super(code);
    this.name = "TenantLifecycleError";
    this.code = code;
  }
}

const tenantStatusSet = new Set<string>(TENANT_STATUSES);
const actorLayerSet = new Set<string>(ACTOR_LAYERS);
const reasonCodePattern = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const opaqueActorIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const safeReasonPattern = /^[A-Za-z0-9][A-Za-z0-9 .,_:;()'"+&@#?!%=\/-]{0,499}$/;
const controlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/;
const lifecycleTransitionSql = "UPDATE tenants SET status = ? WHERE id = ? AND status = ?";

function isTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === "string" && tenantStatusSet.has(value);
}

function isActorLayer(value: unknown): value is ActorLayer {
  return typeof value === "string" && actorLayerSet.has(value);
}

function denied(code: TenantLifecycleResultCode): TenantLifecycleDecision {
  return { allowed: false, code };
}

function allowed(): TenantLifecycleDecision {
  return { allowed: true, code: "ALLOWED" };
}

/** Pure state-machine check. It does not authenticate or authorize the caller. */
export function canTransitionTenant(
  fromStatus: TenantStatus,
  toStatus: TenantStatus,
): TenantLifecycleDecision {
  if (!isTenantStatus(fromStatus) || !isTenantStatus(toStatus)) return denied("BLOCKED_MALFORMED");
  const nextStates = (TENANT_LIFECYCLE_TRANSITIONS as Partial<Record<TenantStatus, readonly TenantStatus[]>>)[fromStatus];
  return nextStates?.includes(toStatus) ? allowed() : denied("BLOCKED_STATE_CONFLICT");
}

/** Pure state-operation check. It does not grant the required D-002 permission. */
export function canTenantOperation(
  status: TenantStatus,
  operation: TenantLifecycleOperation,
): TenantLifecycleDecision {
  if (!isTenantStatus(status) || typeof operation !== "string") return denied("BLOCKED_MALFORMED");
  return TENANT_OPERATION_POLICY[status].includes(operation) ? allowed() : denied("BLOCKED_STATE_CONFLICT");
}

/** Pure direct-worker guard: only active tenants may start new worker work. */
export function canStartTenantWorker(status: TenantStatus): TenantLifecycleDecision {
  return canTenantOperation(status, "worker_start");
}

export function requireTenantTransition(
  fromStatus: TenantStatus,
  toStatus: TenantStatus,
): TenantLifecycleDecision {
  const decision = canTransitionTenant(fromStatus, toStatus);
  if (!decision.allowed) throw new TenantLifecycleError(decision.code);
  return decision;
}

export function requireTenantOperation(
  status: TenantStatus,
  operation: TenantLifecycleOperation,
): TenantLifecycleDecision {
  const decision = canTenantOperation(status, operation);
  if (!decision.allowed) throw new TenantLifecycleError(decision.code);
  return decision;
}

export function requireTenantWorkerStart(status: TenantStatus): TenantLifecycleDecision {
  const decision = canStartTenantWorker(status);
  if (!decision.allowed) throw new TenantLifecycleError(decision.code);
  return decision;
}

function prepareTransitionRequest(
  request: TenantLifecycleTransitionRequest,
): { decision: TenantLifecycleDecision; request?: TenantLifecycleTransitionRequest } {
  if (
    typeof request.tenantId !== "string" || request.tenantId.trim() === "" ||
    typeof request.actorId !== "string" || controlCharacterPattern.test(request.actorId) ||
    !isActorLayer(request.actorLayer) ||
    !isTenantStatus(request.expectedCurrentState) ||
    !isTenantStatus(request.toStatus) ||
    (request.fromStatus !== undefined && request.fromStatus !== request.expectedCurrentState) ||
    typeof request.reasonCode !== "string" || controlCharacterPattern.test(request.reasonCode) ||
    typeof request.reason !== "string" || controlCharacterPattern.test(request.reason) ||
    typeof request.correlationId !== "string" || controlCharacterPattern.test(request.correlationId)
  ) {
    return { decision: denied("BLOCKED_MALFORMED") };
  }

  const normalizedRequest: TenantLifecycleTransitionRequest = {
    ...request,
    tenantId: request.tenantId.trim(),
    actorId: request.actorId.trim(),
    reasonCode: request.reasonCode.trim(),
    reason: request.reason.trim(),
    correlationId: request.correlationId.trim(),
  };
  if (
    !opaqueActorIdPattern.test(normalizedRequest.actorId) ||
    !reasonCodePattern.test(normalizedRequest.reasonCode) ||
    !safeReasonPattern.test(normalizedRequest.reason) ||
    !correlationIdPattern.test(normalizedRequest.correlationId)
  ) {
    return { decision: denied("BLOCKED_MALFORMED") };
  }
  return {
    decision: canTransitionTenant(normalizedRequest.expectedCurrentState, normalizedRequest.toStatus),
    request: normalizedRequest,
  };
}

function requireTransactionRunner(dependencies: TenantLifecycleDependencies): void {
  if (!dependencies?.transactionRunner || typeof dependencies.transactionRunner.run !== "function") {
    throw new TenantLifecycleError("BLOCKED_TRANSACTION_REQUIRED");
  }
}

function requireTransactionScope(scope: TenantLifecycleTransactionScope): void {
  if (!scope?.db || typeof scope.db.prepare !== "function") {
    throw new TenantLifecycleError("BLOCKED_TRANSACTION_REQUIRED");
  }
  if (!scope.repository || typeof scope.repository.getTenant !== "function") {
    throw new TenantLifecycleError("BLOCKED_TRANSACTION_REQUIRED");
  }
  if (!scope.auditWriter || typeof scope.auditWriter.write !== "function") {
    throw new TenantLifecycleError("BLOCKED_AUDIT_REQUIRED");
  }
}

/**
 * Transactional lifecycle transition. The tenant ID is expected to be server-derived;
 * this function intentionally performs no membership, route, session, or role lookup.
 */
export async function transitionTenantLifecycle(
  request: TenantLifecycleTransitionRequest,
  dependencies: TenantLifecycleDependencies,
): Promise<TenantLifecycleTransitionResult> {
  const prepared = prepareTransitionRequest(request);
  const decision = prepared.decision;
  if (!decision.allowed) throw new TenantLifecycleError(decision.code);
  const normalizedRequest = prepared.request;
  if (!normalizedRequest) throw new TenantLifecycleError("FAILED_INTERNAL");
  requireTransactionRunner(dependencies);

  try {
    return await dependencies.transactionRunner.run(async (scope) => {
      requireTransactionScope(scope);
      const updateResult = await scope.db
        .prepare(lifecycleTransitionSql)
        .run(normalizedRequest.toStatus, normalizedRequest.tenantId, normalizedRequest.expectedCurrentState);

      // A failed CAS deliberately covers absent, foreign, stale, and concurrent-loser requests alike.
      if (updateResult.changes !== 1) throw new TenantLifecycleError("NOT_FOUND_NON_ENUMERATING");

      await scope.auditWriter.write({
        action: "tenant.lifecycle.transition",
        tenantId: normalizedRequest.tenantId,
        fromStatus: normalizedRequest.expectedCurrentState,
        toStatus: normalizedRequest.toStatus,
        actorId: normalizedRequest.actorId,
        actorLayer: normalizedRequest.actorLayer,
        reasonCode: normalizedRequest.reasonCode,
        reason: normalizedRequest.reason,
        correlationId: normalizedRequest.correlationId,
      });

      const tenant = await scope.repository.getTenant(normalizedRequest.tenantId);
      if (!tenant || tenant.status !== normalizedRequest.toStatus || tenant.id !== normalizedRequest.tenantId) {
        throw new TenantLifecycleError("FAILED_INTERNAL");
      }
      return { allowed: true, code: "OK_LIFECYCLE_TRANSITIONED", tenant };
    });
  } catch (error) {
    if (error instanceof TenantLifecycleError) throw error;
    throw new TenantLifecycleError("FAILED_INTERNAL");
  }
}

export function createTenantLifecycleService(dependencies: TenantLifecycleDependencies) {
  return {
    canTransitionTenant,
    canTenantOperation,
    canStartTenantWorker,
    requireTenantTransition,
    requireTenantOperation,
    requireTenantWorkerStart,
    transitionTenantLifecycle: (request: TenantLifecycleTransitionRequest) =>
      transitionTenantLifecycle(request, dependencies),
  };
}

// Kept as explicit aliases for callers that use the shorter state-service vocabulary.
export const canTransition = canTransitionTenant;
export const canOperation = canTenantOperation;
export const canStartWorker = canStartTenantWorker;
export const transitionTenantState = transitionTenantLifecycle;
