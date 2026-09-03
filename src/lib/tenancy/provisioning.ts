import { createHash } from "node:crypto";

import {
  tenantProvisioningOperatorCommandSchema,
  type TenantProvisioningOperatorCommand,
} from "@/lib/tenancy/schemas";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";
import {
  authIdentityIdSchema,
  provisioningRequestIdSchema,
  tenantIdSchema,
  workspaceIdSchema,
} from "@/lib/tenancy/schemas";
import type {
  AuthIdentityId,
  CorrelationId,
  MembershipId,
  ProvisioningRequestId,
  TenantId,
  WorkflowPolicyVersion,
  WorkspaceId,
} from "@/lib/tenancy/types";

export const TENANT_PROVISIONING_RESULT_CODE = "PROVISIONING_FOUNDATION_CREATED" as const;
export const TENANT_PROVISIONING_AUDIT_EVENT = "tenant.provisioning_started" as const;
export const TENANT_PROVISIONING_ACTIVATION_BLOCKERS = [
  "OWNER_ACCEPTANCE_REQUIRED",
  "INVITATION_RECORD_NOT_IMPLEMENTED",
  "INVITATION_DELIVERY_NOT_IMPLEMENTED",
  "AUTH_USER_CREATION_NOT_IMPLEMENTED",
] as const;

export type TenantProvisioningActivationBlocker = (typeof TENANT_PROVISIONING_ACTIVATION_BLOCKERS)[number];

export type ProvisioningIdKind =
  | "request"
  | "tenant"
  | "workspace"
  | "policy"
  | "membership"
  | "role_binding"
  | "audit";

/** IDs are server-owned. Production adapters must use a durable, collision-safe generator. */
export interface ProvisioningIdFactory {
  next(kind: ProvisioningIdKind): string;
}

export interface ProvisioningJournalRecord {
  readonly idempotencyKeyHashRef: string;
  readonly inputHashRef: string;
  readonly requestId: ProvisioningRequestId;
  readonly state: "in_progress" | "completed";
  readonly result?: TenantProvisioningResult;
}

export interface ProvisioningJournalReservation {
  readonly idempotencyKeyHashRef: string;
  readonly inputHashRef: string;
  readonly requestId: ProvisioningRequestId;
}

/**
 * Required durable idempotency port. Implementations MUST be transaction-scoped
 * by the coordinator; this is not a process memory cache and there is
 * intentionally no default implementation.
 */
export interface TransactionalProvisioningJournal {
  findByIdempotencyKeyHash(idempotencyKeyHashRef: string): Promise<ProvisioningJournalRecord | null>;
  reserve(input: ProvisioningJournalReservation): Promise<ProvisioningJournalReservationOutcome>;
  complete(input: {
    idempotencyKeyHashRef: string;
    inputHashRef: string;
    requestId: ProvisioningRequestId;
    result: TenantProvisioningResult;
  }): Promise<void>;
}

export type ProvisioningJournalReservationOutcome =
  | { readonly state: "reserved" }
  | { readonly state: "completed"; readonly record: ProvisioningJournalRecord }
  | { readonly state: "in_progress" }
  | { readonly state: "conflict" };

export interface TenantProvisioningAuditEvent {
  readonly eventId: string;
  readonly eventType: typeof TENANT_PROVISIONING_AUDIT_EVENT;
  readonly requestId: ProvisioningRequestId;
  readonly correlationId: CorrelationId;
  readonly idempotencyKeyHashRef: string;
  readonly inputHashRef: string;
  readonly actorLayer: "system";
  readonly actorIdentityId: AuthIdentityId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId | null;
  readonly createdIds: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId | null;
    readonly policyId: string;
    readonly membershipId: MembershipId;
    readonly roleBindingId: string;
  };
  readonly policyVersion: WorkflowPolicyVersion;
  readonly priorWorkflowState: "operator_approved";
  readonly nextWorkflowState: "provisioning";
  readonly resultCode: typeof TENANT_PROVISIONING_RESULT_CODE;
}

/**
 * Required durable audit port. The coordinator supplies this transaction-scoped
 * port alongside the repository and journal; a separate telemetry sink is not
 * sufficient for provisioning acceptance.
 */
export interface TransactionalProvisioningAuditPort {
  append(event: TenantProvisioningAuditEvent): Promise<void>;
}

export interface TenantProvisioningTransactionScope {
  readonly repository: TenantQueryRepository;
  readonly journal: TransactionalProvisioningJournal;
  readonly audit: TransactionalProvisioningAuditPort;
}

/**
 * The only transaction boundary accepted by the service. A real coordinator
 * MUST obtain all three callback ports from the same database transaction and
 * MUST discard their writes when the callback fails.
 */
export interface TenantProvisioningTransactionCoordinator {
  run<T>(callback: (scope: TenantProvisioningTransactionScope) => Promise<T>): Promise<T>;
}

export interface TenantProvisioningServiceDependencies {
  readonly idFactory: ProvisioningIdFactory;
  readonly transactionCoordinator: TenantProvisioningTransactionCoordinator;
  /** The service boundary is operator-only; this identity is not caller-selected per command. */
  readonly operatorIdentityId: AuthIdentityId;
}

export interface TenantProvisioningResult {
  readonly resultCode: typeof TENANT_PROVISIONING_RESULT_CODE;
  readonly requestId: ProvisioningRequestId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId | null;
  readonly policyId: string;
  readonly membershipId: MembershipId;
  readonly roleBindingId: string;
  readonly workflowState: "provisioning";
  readonly tenantStatus: "provisioning";
  readonly workspaceStatus: "provisioning" | null;
  readonly membershipStatus: "pending";
  readonly role: "owner";
  /** Role effectiveness remains pending while membership is pending. */
  readonly roleBindingStatus: "pending";
  readonly activationState: "blocked";
  readonly activationBlockers: readonly TenantProvisioningActivationBlocker[];
}

export type TenantProvisioningErrorCode =
  | "INVALID_INPUT"
  | "PROVISIONING_NOT_AUTHORIZED"
  | "PROVISIONING_IDEMPOTENCY_CONFLICT"
  | "PROVISIONING_IN_PROGRESS"
  | "PROVISIONING_RETRYABLE";

/** Stable, privacy-safe errors do not enumerate command material or provider details. */
export class TenantProvisioningError extends Error {
  readonly code!: TenantProvisioningErrorCode;
  readonly retryable!: boolean;

  constructor(code: TenantProvisioningErrorCode, message: string, retryable = false, cause?: unknown) {
    super(message);
    this.name = "TenantProvisioningError";
    Object.defineProperties(this, {
      code: { value: code, enumerable: true, writable: false },
      retryable: { value: retryable, enumerable: true, writable: false },
      cause: { value: cause, enumerable: false, writable: false },
    });
  }
}

export class TenantProvisioningInputError extends TenantProvisioningError {
  constructor() {
    super("INVALID_INPUT", "The provisioning command is invalid.");
    this.name = "TenantProvisioningInputError";
  }
}

export class TenantProvisioningAuthorizationError extends TenantProvisioningError {
  constructor() {
    super("PROVISIONING_NOT_AUTHORIZED", "The provisioning operation is not authorized.");
    this.name = "TenantProvisioningAuthorizationError";
  }
}

export class TenantProvisioningIdempotencyConflictError extends TenantProvisioningError {
  constructor() {
    super("PROVISIONING_IDEMPOTENCY_CONFLICT", "The provisioning request conflicts with a prior request.");
    this.name = "TenantProvisioningIdempotencyConflictError";
  }
}

export class TenantProvisioningInProgressError extends TenantProvisioningError {
  constructor() {
    super("PROVISIONING_IN_PROGRESS", "The provisioning request is already in progress.", true);
    this.name = "TenantProvisioningInProgressError";
  }
}

export class TenantProvisioningRetryableError extends TenantProvisioningError {
  constructor(cause?: unknown) {
    super("PROVISIONING_RETRYABLE", "The provisioning operation could not be completed.", true, cause);
    this.name = "TenantProvisioningRetryableError";
  }
}

export interface TenantProvisioningService {
  provisionTenant(command: unknown): Promise<TenantProvisioningResult>;
}

export function createTenantProvisioningService(
  dependencies: TenantProvisioningServiceDependencies,
): TenantProvisioningService {
  assertDependencies(dependencies);
  const operatorIdentityId = parseOperatorIdentity(dependencies.operatorIdentityId);

  return {
    async provisionTenant(rawCommand: unknown): Promise<TenantProvisioningResult> {
      const command = parseCommand(rawCommand);
      const inputHashRef = hashNormalizedMaterial(command);
      const idempotencyKeyHashRef = hashRef(command.idempotencyKey);

      try {
        return await dependencies.transactionCoordinator.run(async (scope) => {
          const prior = await scope.journal.findByIdempotencyKeyHash(idempotencyKeyHashRef);
          if (prior) return resolvePrior(prior, idempotencyKeyHashRef, inputHashRef);

          const requestId = generatedId(dependencies.idFactory, "request", "request");
          const reservation = await scope.journal.reserve({ idempotencyKeyHashRef, inputHashRef, requestId });
          if (reservation.state === "completed") {
            return resolvePrior(reservation.record, idempotencyKeyHashRef, inputHashRef);
          }
          if (reservation.state === "in_progress") throw new TenantProvisioningInProgressError();
          if (reservation.state === "conflict") throw new TenantProvisioningIdempotencyConflictError();

          const result = await createFoundation({
            command,
            requestId,
            operatorIdentityId,
            inputHashRef,
            idempotencyKeyHashRef,
            repository: scope.repository,
            idFactory: dependencies.idFactory,
            audit: scope.audit,
          });
          await scope.journal.complete({
            idempotencyKeyHashRef,
            inputHashRef,
            requestId,
            result,
          });
          return result;
        });
      } catch (error) {
        if (error instanceof TenantProvisioningError) throw error;
        throw new TenantProvisioningRetryableError(error);
      }
    },
  };
}

interface FoundationContext {
  readonly command: TenantProvisioningOperatorCommand;
  readonly requestId: ProvisioningRequestId;
  readonly operatorIdentityId: AuthIdentityId;
  readonly inputHashRef: string;
  readonly idempotencyKeyHashRef: string;
  readonly repository: TenantQueryRepository;
  readonly idFactory: ProvisioningIdFactory;
  readonly audit: TransactionalProvisioningAuditPort;
}

async function createFoundation(context: FoundationContext): Promise<TenantProvisioningResult> {
  const tenantId = generatedId(context.idFactory, "tenant", "tenant");
  const workspaceId = context.command.workspace
    ? generatedId(context.idFactory, "workspace", "workspace")
    : null;
  const policyId = generatedId(context.idFactory, "policy", "policy");
  const membershipId = generatedId(context.idFactory, "membership", "membership");
  const roleBindingId = generatedId(context.idFactory, "role_binding", "role binding");
  const auditEventId = generatedId(context.idFactory, "audit", "audit event");

  const tenant = await context.repository.createTenant({
    id: tenantId,
    slug: context.command.organizationSlug,
    name: context.command.organizationName,
    status: "provisioning",
    locale: context.command.locale,
    timezone: context.command.timezone,
  });
  const workspace = context.command.workspace
    ? await context.repository.createWorkspace(tenantId, {
      id: workspaceId!,
      slug: context.command.workspace.workspaceSlug,
      name: context.command.workspace.workspaceName,
      status: "provisioning",
    })
    : null;
  const policy = await context.repository.createTenantPolicy(tenantId, {
    id: policyId,
    locale: context.command.locale,
    timezone: context.command.timezone,
  });
  const membership = await context.repository.createMembership(tenantId, {
    id: membershipId,
    authIdentityId: context.command.ownerIdentityId,
    workspaceId,
    status: "pending",
  });
  const roleBinding = await context.repository.createRoleBinding(tenantId, {
    id: roleBindingId,
    membershipId: membership.id,
    role: "owner",
    reasonCode: "initial_provisioning",
  });
  assertFoundationRecords({
    tenant,
    workspace,
    policy,
    membership,
    roleBinding,
    tenantId,
    workspaceId,
    policyId,
    membershipId,
    roleBindingId,
  });

  const result: TenantProvisioningResult = {
    resultCode: TENANT_PROVISIONING_RESULT_CODE,
    requestId: context.requestId,
    tenantId: tenant.id,
    workspaceId: workspace?.id ?? null,
    policyId: policy.id,
    membershipId: membership.id,
    roleBindingId: roleBinding.id,
    workflowState: "provisioning",
    tenantStatus: "provisioning",
    workspaceStatus: workspace ? "provisioning" : null,
    membershipStatus: "pending",
    role: "owner",
    roleBindingStatus: "pending",
    activationState: "blocked",
    activationBlockers: TENANT_PROVISIONING_ACTIVATION_BLOCKERS,
  };

  await context.audit.append({
    eventId: auditEventId,
    eventType: TENANT_PROVISIONING_AUDIT_EVENT,
    requestId: context.requestId,
    correlationId: context.command.correlationId,
    idempotencyKeyHashRef: context.idempotencyKeyHashRef,
    inputHashRef: context.inputHashRef,
    actorLayer: "system",
    actorIdentityId: context.operatorIdentityId,
    tenantId: tenant.id,
    workspaceId: workspace?.id ?? null,
    createdIds: {
      tenantId: tenant.id,
      workspaceId: workspace?.id ?? null,
      policyId: policy.id,
      membershipId: membership.id,
      roleBindingId: roleBinding.id,
    },
    policyVersion: context.command.requestedPolicyVersion,
    priorWorkflowState: "operator_approved",
    nextWorkflowState: "provisioning",
    resultCode: TENANT_PROVISIONING_RESULT_CODE,
  });

  return result;
}

function assertDependencies(dependencies: TenantProvisioningServiceDependencies): void {
  if (!dependencies || typeof dependencies !== "object") throw new TenantProvisioningInputError();
  if (!dependencies.transactionCoordinator || typeof dependencies.transactionCoordinator.run !== "function") {
    throw new TenantProvisioningRetryableError();
  }
  if (!dependencies.idFactory || typeof dependencies.idFactory.next !== "function") {
    throw new TenantProvisioningRetryableError();
  }
}

function parseOperatorIdentity(value: unknown): AuthIdentityId {
  const parsed = authIdentityIdSchema.safeParse(value);
  if (!parsed.success) throw new TenantProvisioningAuthorizationError();
  return parsed.data;
}

function parseCommand(rawCommand: unknown): TenantProvisioningOperatorCommand {
  const parsed = tenantProvisioningOperatorCommandSchema.safeParse(rawCommand);
  if (!parsed.success) throw new TenantProvisioningInputError();
  return parsed.data;
}

function resolvePrior(
  prior: ProvisioningJournalRecord,
  expectedIdempotencyKeyHashRef: string,
  expectedInputHashRef: string,
): TenantProvisioningResult {
  if (!isSha256Reference(prior.idempotencyKeyHashRef) || prior.idempotencyKeyHashRef !== expectedIdempotencyKeyHashRef) {
    throw new TenantProvisioningRetryableError();
  }
  if (!isSha256Reference(prior.inputHashRef)) throw new TenantProvisioningRetryableError();
  if (prior.inputHashRef !== expectedInputHashRef) throw new TenantProvisioningIdempotencyConflictError();
  if (!provisioningRequestIdSchema.safeParse(prior.requestId).success) throw new TenantProvisioningRetryableError();
  if (prior.state !== "in_progress" && prior.state !== "completed") throw new TenantProvisioningRetryableError();
  if (prior.state === "in_progress") {
    if (!hasExactKeys(prior, ["idempotencyKeyHashRef", "inputHashRef", "requestId", "state"])) {
      throw new TenantProvisioningRetryableError();
    }
    throw new TenantProvisioningInProgressError();
  }
  if (!hasExactKeys(prior, ["idempotencyKeyHashRef", "inputHashRef", "requestId", "state", "result"])) {
    throw new TenantProvisioningRetryableError();
  }
  if (!isValidProvisioningResult(prior.result) || prior.result.requestId !== prior.requestId) {
    throw new TenantProvisioningRetryableError();
  }
  return prior.result;
}

function assertFoundationRecords(input: {
  tenant: Awaited<ReturnType<TenantQueryRepository["createTenant"]>>;
  workspace: Awaited<ReturnType<TenantQueryRepository["createWorkspace"]>> | null;
  policy: Awaited<ReturnType<TenantQueryRepository["createTenantPolicy"]>>;
  membership: Awaited<ReturnType<TenantQueryRepository["createMembership"]>>;
  roleBinding: Awaited<ReturnType<TenantQueryRepository["createRoleBinding"]>>;
  tenantId: TenantId;
  workspaceId: WorkspaceId | null;
  policyId: string;
  membershipId: MembershipId;
  roleBindingId: string;
}): void {
  if (
    input.tenant.id !== input.tenantId
    || input.tenant.status !== "provisioning"
    || (input.workspace === null && input.workspaceId !== null)
    || (input.workspace !== null && (
      input.workspace.id !== input.workspaceId
      || input.workspace.tenantId !== input.tenantId
      || input.workspace.status !== "provisioning"
    ))
    || input.policy.id !== input.policyId
    || input.policy.tenantId !== input.tenantId
    || input.membership.id !== input.membershipId
    || input.membership.tenantId !== input.tenantId
    || input.membership.status !== "pending"
    || input.membership.workspaceId !== input.workspaceId
    || input.roleBinding.id !== input.roleBindingId
    || input.roleBinding.tenantId !== input.tenantId
    || input.roleBinding.membershipId !== input.membershipId
    || input.roleBinding.role !== "owner"
    || input.roleBinding.revokedAt !== null
    || !tenantIdSchema.safeParse(input.roleBinding.id).success
  ) {
    throw new TenantProvisioningRetryableError();
  }
}

const PROVISIONING_RESULT_KEYS = [
  "resultCode",
  "requestId",
  "tenantId",
  "workspaceId",
  "policyId",
  "membershipId",
  "roleBindingId",
  "workflowState",
  "tenantStatus",
  "workspaceStatus",
  "membershipStatus",
  "role",
  "roleBindingStatus",
  "activationState",
  "activationBlockers",
] as const;

function isValidProvisioningResult(value: unknown): value is TenantProvisioningResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TenantProvisioningResult>;
  if (!hasExactKeys(result, PROVISIONING_RESULT_KEYS)) return false;
  if (!provisioningRequestIdSchema.safeParse(result.requestId).success) return false;
  if (!tenantIdSchema.safeParse(result.tenantId).success) return false;
  if (result.workspaceId !== null && !workspaceIdSchema.safeParse(result.workspaceId).success) return false;
  if (!tenantIdSchema.safeParse(result.policyId).success) return false;
  if (!tenantIdSchema.safeParse(result.membershipId).success) return false;
  if (!tenantIdSchema.safeParse(result.roleBindingId).success) return false;
  if (
    result.resultCode !== TENANT_PROVISIONING_RESULT_CODE
    || result.workflowState !== "provisioning"
    || result.tenantStatus !== "provisioning"
    || result.membershipStatus !== "pending"
    || result.role !== "owner"
    || result.roleBindingStatus !== "pending"
    || result.activationState !== "blocked"
  ) return false;
  if (result.workspaceId === null ? result.workspaceStatus !== null : result.workspaceStatus !== "provisioning") {
    return false;
  }
  return Array.isArray(result.activationBlockers)
    && result.activationBlockers.length === TENANT_PROVISIONING_ACTIVATION_BLOCKERS.length
    && result.activationBlockers.every((blocker, index) => blocker === TENANT_PROVISIONING_ACTIVATION_BLOCKERS[index]);
}

function hasExactKeys(value: object, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actualKeys.length === expected.length && actualKeys.every((key, index) => key === expected[index]);
}

function isSha256Reference(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function generatedId(factory: ProvisioningIdFactory, kind: ProvisioningIdKind, label: string): string {
  const value = factory.next(kind);
  if (typeof value !== "string" || !tenantIdSchema.safeParse(value).success) {
    throw new TenantProvisioningRetryableError(new Error(`Invalid generated ${label} identifier.`));
  }
  if (kind === "workspace" && !workspaceIdSchema.safeParse(value).success) {
    throw new TenantProvisioningRetryableError(new Error("Invalid generated workspace identifier."));
  }
  return value;
}

function hashRef(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashNormalizedMaterial(command: TenantProvisioningOperatorCommand): string {
  const canonical = JSON.stringify({
    organizationName: command.organizationName,
    organizationSlug: command.organizationSlug,
    requestedPolicyVersion: command.requestedPolicyVersion,
    locale: command.locale,
    timezone: command.timezone,
    ownerIdentityId: command.ownerIdentityId,
    workspace: command.workspace
      ? {
        workspaceName: command.workspace.workspaceName,
        workspaceSlug: command.workspace.workspaceSlug,
      }
      : null,
  });
  return hashRef(canonical);
}
