import { createHash } from "node:crypto";

import { getTenantContext, type TenantContext } from "@/lib/tenancy/context";
import type { TenantPolicyContext, TenantPolicyEvaluator } from "@/lib/tenancy/authorize";
import { TENANT_FEATURES, TENANT_FEATURE_POLICY_FIELDS, type TenantFeatureId, type TenantFeatureService } from "@/lib/tenancy/features";
import { canTenantOperation, type TenantLifecycleOperation } from "@/lib/tenancy/lifecycle";
import { getTenantPermissionDecision, isTenantPermission, isTenantRole, type TenantPermission } from "@/lib/permissions";
import { authIdentityIdSchema, tenantIdSchema, workspaceIdSchema } from "@/lib/tenancy/schemas";
import { TENANT_STATUSES, type TenantStatus } from "@/lib/tenancy/types";

export const TENANT_LIMIT_ACTIONS = [
  "membership_invite",
  "support_grant_request",
  "support_grant_approval",
  "knowledge_upload",
  "export_request",
  "deletion_request",
  "worker_start",
  "agent_plan_expensive",
  "recovery_bookkeeping",
] as const;
export type TenantLimitAction = (typeof TENANT_LIMIT_ACTIONS)[number];

export const RATE_LIMIT_ACTIONS = TENANT_LIMIT_ACTIONS;
export type RateLimitAction = TenantLimitAction;

export const TENANT_LIMIT_ACTION_POLICY: Readonly<Record<TenantLimitAction, {
  readonly windowMs: number;
  readonly platformHardCap: number;
  readonly lifecycleOperation: TenantLifecycleOperation;
  readonly featureId?: TenantFeatureId;
  readonly configurationPermission: "budget:manage" | "feature:manage";
}>> = Object.freeze({
  membership_invite: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 100, lifecycleOperation: "business_mutation", configurationPermission: "budget:manage" },
  support_grant_request: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 20, lifecycleOperation: "business_mutation", configurationPermission: "feature:manage" },
  support_grant_approval: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 20, lifecycleOperation: "business_mutation", configurationPermission: "feature:manage" },
  knowledge_upload: { windowMs: 60 * 60 * 1000, platformHardCap: 1000, lifecycleOperation: "business_mutation", featureId: TENANT_FEATURES.AI_PROCESSING, configurationPermission: "budget:manage" },
  export_request: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 50, lifecycleOperation: "export", featureId: TENANT_FEATURES.COPY_EXPORT, configurationPermission: "budget:manage" },
  deletion_request: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 10, lifecycleOperation: "deletion_request", configurationPermission: "budget:manage" },
  worker_start: { windowMs: 60 * 60 * 1000, platformHardCap: 200, lifecycleOperation: "worker_start", featureId: TENANT_FEATURES.SOURCE_RESEARCH, configurationPermission: "budget:manage" },
  agent_plan_expensive: { windowMs: 60 * 60 * 1000, platformHardCap: 100, lifecycleOperation: "normal", featureId: TENANT_FEATURES.AI_PROCESSING, configurationPermission: "budget:manage" },
  recovery_bookkeeping: { windowMs: 24 * 60 * 60 * 1000, platformHardCap: 100, lifecycleOperation: "recovery", configurationPermission: "budget:manage" },
});

const TENANT_LIMIT_ACTION_SET = new Set<string>(TENANT_LIMIT_ACTIONS);
const TENANT_STATUS_SET = new Set<string>(TENANT_STATUSES);
const SAFE_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_REASON = /^[A-Za-z0-9][A-Za-z0-9 .,_:;()'"+&@#?!%=\/-]{0,499}$/;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/;
const MAX_AMOUNT = 1_000_000;
const MAX_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Opaque input only; tenant, actor, workspace, and permissions are resolved server-side. */
export interface ServicePrincipalReference {
  readonly kind: "trusted_service_principal";
  readonly principalId: string;
}

export type TenantLimitAuthority =
  | { readonly kind: "service_principal"; readonly principal: ServicePrincipalReference };

export interface TenantLimitCommand {
  readonly action: unknown;
  readonly amount: unknown;
  readonly idempotencyKey: unknown;
  /** Selectors are compatibility assertions only and never authority. */
  readonly tenantId?: unknown;
  readonly actorId?: unknown;
  readonly workspaceId?: unknown;
}

export interface TenantLimitBucket {
  readonly scope: "tenant" | "actor";
  readonly key: string;
}

export interface AtomicTenantLimitConsumeRequest {
  readonly tenantId: string;
  readonly actorId: string;
  readonly workspaceId: string | null;
  readonly action: TenantLimitAction;
  readonly buckets: readonly [TenantLimitBucket, TenantLimitBucket];
  /** SHA-256 reference; the raw caller key never crosses this service boundary. */
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly windowMs: number;
  readonly amount: number;
  readonly hardBound: number;
  readonly nowMs: number;
  /** The backend MUST compare all of these inside the same transaction before reserving. */
  readonly expectedTenantStatus: TenantStatus;
  readonly expectedConfigurationVersion: number;
  readonly expectedPlatformConfigurationVersion: number;
  readonly expectedPlatformGlobalKill: false;
  readonly expectedPlatformActionKill: false;
  readonly expectedTenantActionKill: false;
  readonly expectedTenantPolicyCap: number;
  readonly expectedFeaturePolicyVersion: number | null;
}

export interface TenantLimitRuntimeState {
  readonly tenantId: string;
  readonly tenantStatus: TenantStatus;
  readonly configurationVersion: number;
  readonly platformConfigurationVersion: number;
  readonly platformGlobalKill: boolean;
  readonly platformActionKills: Partial<Record<TenantLimitAction, boolean>>;
  readonly tenantActionKills: Partial<Record<TenantLimitAction, boolean>>;
  readonly tenantPolicyCaps: Partial<Record<TenantLimitAction, number>>;
}

export interface TenantLimitBackend {
  /** Must atomically revalidate expected state and reserve every bucket/idempotency record. */
  consume(input: AtomicTenantLimitConsumeRequest): Promise<unknown>;
  getRuntimeState(input: { readonly tenantId: string; readonly action: TenantLimitAction }): Promise<unknown>;
  /** Must CAS the version, persist the mutation, and append its audit event in one transaction. */
  changeConfiguration(input: TenantLimitConfigurationTransaction): Promise<unknown>;
  getPlatformRuntimeState(): Promise<unknown>;
  changePlatformConfiguration(input: PlatformKillSwitchTransaction): Promise<unknown>;
}

export type AtomicTenantLimitConsumeResult =
  | { readonly status: "consumed" | "replayed"; readonly remaining: number; readonly resetAt: number }
  | { readonly status: "rate_limited"; readonly remaining: number; readonly resetAt: number }
  | { readonly status: "idempotency_conflict" }
  | { readonly status: "state_changed" | "policy_blocked" };

export interface PlatformOperatorReference {
  readonly kind: "platform_operator";
  readonly principalId: string;
}

export interface PlatformKillSwitchChange {
  readonly scope: "global" | "action";
  readonly action?: unknown;
  readonly enabled: unknown;
  readonly expectedVersion: unknown;
  readonly reason: unknown;
  readonly correlationId: unknown;
}

export interface PlatformKillSwitchTransaction {
  readonly scope: "global" | "action";
  readonly action: TenantLimitAction | null;
  readonly enabled: boolean;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly operatorId: string;
  readonly auditEvent: {
    readonly eventType: "platform_limit_kill_switch_changed";
    readonly scope: "global" | "action";
    readonly action: TenantLimitAction | null;
    readonly enabled: boolean;
    readonly previousVersion: number;
    readonly resultingVersion: number;
    readonly operatorId: string;
    readonly reason: string;
    readonly correlationId: string;
  };
}

export interface TenantLimitConfigurationTransaction {
  readonly tenantId: string;
  readonly action: TenantLimitAction;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly permission: "budget:manage" | "feature:manage";
  readonly actorId: string;
  readonly mutation: {
    readonly tenantPolicyCap?: number;
    readonly tenantActionKill?: boolean;
  };
  readonly auditEvent: {
    readonly eventType: "tenant_limit_configuration_changed";
    readonly tenantId: string;
    readonly action: TenantLimitAction;
    readonly permission: "budget:manage" | "feature:manage";
    readonly actorId: string;
    readonly previousVersion: number;
    readonly resultingVersion: number;
    readonly mutation: {
      readonly tenantPolicyCap?: number;
      readonly tenantActionKill?: boolean;
    };
    readonly reason: string;
    readonly correlationId: string;
  };
}

export interface TenantLimitConfigurationChange {
  readonly action: unknown;
  readonly expectedVersion: unknown;
  readonly tenantPolicyCap?: unknown;
  readonly tenantActionKill?: unknown;
  readonly reason: unknown;
  readonly correlationId: unknown;
  /** Compatibility selector; effective tenant comes from authority. */
  readonly tenantId?: unknown;
}

export type TenantLimitOutcome = "allowed" | "blocked" | "rate_limited";
export type TenantLimitResultCode =
  | "ALLOWED"
  | "RATE_LIMITED"
  | "BLOCKED_INVALID_REQUEST"
  | "BLOCKED_UNKNOWN_ACTION"
  | "BLOCKED_TENANT_SCOPE"
  | "BLOCKED_KILL_SWITCH"
  | "BLOCKED_LIFECYCLE"
  | "BLOCKED_FEATURE"
  | "BLOCKED_BACKEND"
  | "BLOCKED_IDEMPOTENCY_CONFLICT";

export interface TenantLimitResult {
  readonly outcome: TenantLimitOutcome;
  readonly code: TenantLimitResultCode;
  readonly retryAfterMs: number | null;
  readonly resetAt: number | null;
}

export type TenantLimitConfigurationResultCode =
  | "CONFIGURATION_CHANGED"
  | "CONFIGURATION_VERSION_CONFLICT"
  | "CONFIGURATION_UNAUTHORIZED"
  | "CONFIGURATION_INVALID"
  | "CONFIGURATION_NOOP"
  | "CONFIGURATION_FAILED"
  | "PLATFORM_CONFIGURATION_UNAUTHORIZED"
  | "PLATFORM_CONFIGURATION_INVALID"
  | "PLATFORM_CONFIGURATION_VERSION_CONFLICT"
  | "PLATFORM_CONFIGURATION_FAILED";

export interface TenantLimitConfigurationResult {
  readonly status: "changed";
  readonly code: "CONFIGURATION_CHANGED";
  readonly tenantId: string;
  readonly action: TenantLimitAction;
  readonly previousVersion: number;
  readonly resultingVersion: number;
}

export interface TenantLimitServiceDependencies {
  readonly backend: TenantLimitBackend;
  readonly featureService?: Pick<TenantFeatureService, "enforceFeature">;
  readonly policyEvaluator?: TenantPolicyEvaluator;
  readonly servicePrincipalResolver?: { resolve(principalId: string): Promise<unknown> };
  readonly platformOperatorResolver?: { resolve(principalId: string): Promise<unknown> };
  readonly clock?: () => number;
}

export interface TenantLimitService {
  consume(command: TenantLimitCommand, authority?: TenantLimitAuthority): Promise<TenantLimitResult>;
  changeConfiguration(command: TenantLimitConfigurationChange, authority?: TenantLimitAuthority): Promise<TenantLimitConfigurationResult>;
  changePlatformKillSwitch(command: PlatformKillSwitchChange, operator: PlatformOperatorReference): Promise<{
    readonly status: "changed";
    readonly code: "PLATFORM_CONFIGURATION_CHANGED";
    readonly scope: "global" | "action";
    readonly action: TenantLimitAction | null;
    readonly previousVersion: number;
    readonly resultingVersion: number;
  }>;
}

export class TenantLimitConfigurationError extends Error {
  readonly code: TenantLimitConfigurationResultCode | "BACKEND_REQUIRED";

  constructor(code: TenantLimitConfigurationResultCode | "BACKEND_REQUIRED") {
    super(code);
    this.name = "TenantLimitConfigurationError";
    this.code = code;
  }
}

export function createTenantLimitService(dependencies: TenantLimitServiceDependencies): TenantLimitService {
  if (!dependencies?.backend || typeof dependencies.backend.consume !== "function" || typeof dependencies.backend.getRuntimeState !== "function" || typeof dependencies.backend.changeConfiguration !== "function") {
    throw new TenantLimitConfigurationError("BACKEND_REQUIRED");
  }
  const clock = dependencies.clock ?? (() => Date.now());

  const consume = async (command: TenantLimitCommand, authority?: TenantLimitAuthority): Promise<TenantLimitResult> => {
    const action = normalizeAction(command?.action);
    if (!action) return blocked("BLOCKED_UNKNOWN_ACTION");
    const amount = normalizeAmount(command?.amount);
    const idempotencyKey = normalizeIdempotencyKey(command?.idempotencyKey);
    if (amount === null || idempotencyKey === null) return blocked("BLOCKED_INVALID_REQUEST");

    const subject = await resolveAuthority(authority, dependencies.servicePrincipalResolver);
    if (!subject) return blocked("BLOCKED_TENANT_SCOPE");
    if (!selectorsMatch(subject, command)) return blocked("BLOCKED_TENANT_SCOPE");

    let nowMs: number;
    try {
      nowMs = clock();
    } catch {
      return blocked("BLOCKED_BACKEND");
    }
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return blocked("BLOCKED_BACKEND");

    const policy = TENANT_LIMIT_ACTION_POLICY[action];
    let rawState: unknown;
    try {
      rawState = await dependencies.backend.getRuntimeState({ tenantId: subject.tenantId, action });
    } catch {
      return blocked("BLOCKED_BACKEND");
    }
    const state = validateRuntimeState(rawState, subject.tenantId);
    if (!state) return blocked("BLOCKED_BACKEND");
    if (state.platformGlobalKill || hasOwnActionFlag(state.platformActionKills, action) || hasOwnActionFlag(state.tenantActionKills, action)) {
      return blocked("BLOCKED_KILL_SWITCH");
    }
    if (!canTenantOperation(state.tenantStatus, policy.lifecycleOperation).allowed) {
      return blocked("BLOCKED_LIFECYCLE");
    }
    let featurePolicyVersion: number | null = null;
    if (policy.featureId) {
      if (!dependencies.featureService || typeof dependencies.featureService.enforceFeature !== "function") return blocked("BLOCKED_FEATURE");
      try {
        const feature = await dependencies.featureService.enforceFeature(subject.tenantId, policy.featureId);
        if (!isEnabledFeatureResolution(feature, subject.tenantId, policy.featureId)) return blocked("BLOCKED_FEATURE");
        featurePolicyVersion = feature.policyVersion;
      } catch {
        return blocked("BLOCKED_FEATURE");
      }
    }

    const tenantCap = ownActionCap(state.tenantPolicyCaps, action, policy.platformHardCap);
    const hardBound = Math.min(policy.platformHardCap, tenantCap);
    if (amount > hardBound) return blocked("BLOCKED_INVALID_REQUEST");
    const idempotencyHash = sha256(JSON.stringify({ tenantId: subject.tenantId, actorId: subject.actorId, action, idempotencyKey }));
    const requestHash = sha256(JSON.stringify({ tenantId: subject.tenantId, actorId: subject.actorId, workspaceId: subject.workspaceId, action, amount, windowMs: policy.windowMs, hardBound, idempotencyHash, configurationVersion: state.configurationVersion, platformConfigurationVersion: state.platformConfigurationVersion, tenantStatus: state.tenantStatus, featurePolicyVersion }));
    const input: AtomicTenantLimitConsumeRequest = {
      tenantId: subject.tenantId,
      actorId: subject.actorId,
      workspaceId: subject.workspaceId,
      action,
      buckets: [
        { scope: "tenant", key: `tenant:${sha256(`${action}\u0000${subject.tenantId}`)}` },
        { scope: "actor", key: `actor:${sha256(`${action}\u0000${subject.tenantId}\u0000${subject.actorId}`)}` },
      ],
      idempotencyKey: idempotencyHash,
      requestHash,
      windowMs: policy.windowMs,
      amount,
      hardBound,
      nowMs,
      expectedTenantStatus: state.tenantStatus,
      expectedConfigurationVersion: state.configurationVersion,
      expectedPlatformConfigurationVersion: state.platformConfigurationVersion,
      expectedPlatformGlobalKill: false,
      expectedPlatformActionKill: false,
      expectedTenantActionKill: false,
      expectedTenantPolicyCap: tenantCap,
      expectedFeaturePolicyVersion: featurePolicyVersion,
    };

    let rawResult: unknown;
    try {
      rawResult = await dependencies.backend.consume(input);
    } catch {
      return blocked("BLOCKED_BACKEND");
    }
    const result = validateConsumeResult(rawResult, nowMs, policy.windowMs, hardBound);
    if (!result) return blocked("BLOCKED_BACKEND");
    if (result.status === "idempotency_conflict") return blocked("BLOCKED_IDEMPOTENCY_CONFLICT");
    if (result.status === "state_changed" || result.status === "policy_blocked") return blocked(result.status === "policy_blocked" ? "BLOCKED_FEATURE" : "BLOCKED_BACKEND");
    if (result.status === "rate_limited") return rateLimited(nowMs, result.resetAt);
    return allowed();
  };

  const changeConfiguration = async (command: TenantLimitConfigurationChange, authority?: TenantLimitAuthority): Promise<TenantLimitConfigurationResult> => {
    const action = normalizeAction(command?.action);
    const subject = await resolveAuthority(authority, dependencies.servicePrincipalResolver);
    const expectedVersion = normalizeVersion(command?.expectedVersion);
    const reason = normalizeReason(command?.reason);
    const correlationId = normalizeCorrelation(command?.correlationId);
    const hasCap = command?.tenantPolicyCap !== undefined;
    const hasKill = command?.tenantActionKill !== undefined;
    if (!action || !subject || expectedVersion === null || reason === null || correlationId === null || (hasCap === hasKill) || (hasCap && normalizeCap(command.tenantPolicyCap) === null) || (hasKill && typeof command.tenantActionKill !== "boolean")) {
      throw new TenantLimitConfigurationError("CONFIGURATION_INVALID");
    }
    if (command.tenantId !== undefined && command.tenantId !== subject.tenantId) throw new TenantLimitConfigurationError("CONFIGURATION_INVALID");

    const policy = TENANT_LIMIT_ACTION_POLICY[action];
    const permission = policy.configurationPermission;
    if (!(await isConfigurationAuthorized(subject, permission, dependencies.policyEvaluator))) throw new TenantLimitConfigurationError("CONFIGURATION_UNAUTHORIZED");

    let rawState: unknown;
    try {
      rawState = await dependencies.backend.getRuntimeState({ tenantId: subject.tenantId, action });
    } catch {
      throw new TenantLimitConfigurationError("CONFIGURATION_FAILED");
    }
    const state = validateRuntimeState(rawState, subject.tenantId);
    if (!state) throw new TenantLimitConfigurationError("CONFIGURATION_FAILED");
    if (state.configurationVersion !== expectedVersion) throw new TenantLimitConfigurationError("CONFIGURATION_VERSION_CONFLICT");
    const cap = hasCap ? normalizeCap(command.tenantPolicyCap) as number : undefined;
    if (cap !== undefined && cap > policy.platformHardCap) throw new TenantLimitConfigurationError("CONFIGURATION_INVALID");
    const currentCap = ownActionCap(state.tenantPolicyCaps, action, policy.platformHardCap);
    const currentKill = hasOwnActionFlag(state.tenantActionKills, action);
    if ((cap !== undefined && cap === currentCap) || (typeof command.tenantActionKill === "boolean" && command.tenantActionKill === currentKill)) {
      throw new TenantLimitConfigurationError("CONFIGURATION_NOOP");
    }
    if (expectedVersion >= Number.MAX_SAFE_INTEGER) throw new TenantLimitConfigurationError("CONFIGURATION_INVALID");
    const resultingVersion = expectedVersion + 1;
    const mutation = cap !== undefined ? { tenantPolicyCap: cap } : { tenantActionKill: command.tenantActionKill as boolean };
    const transaction: TenantLimitConfigurationTransaction = {
      tenantId: subject.tenantId,
      action,
      expectedVersion,
      resultingVersion,
      permission,
      actorId: subject.actorId,
      mutation,
      auditEvent: {
        eventType: "tenant_limit_configuration_changed",
        tenantId: subject.tenantId,
        action,
        permission,
        actorId: subject.actorId,
        previousVersion: expectedVersion,
        resultingVersion,
        mutation,
        reason,
        correlationId,
      },
    };
    let rawCommit: unknown;
    try {
      rawCommit = await dependencies.backend.changeConfiguration(transaction);
    } catch {
      throw new TenantLimitConfigurationError("CONFIGURATION_FAILED");
    }
    if (isPlainDataRecord(rawCommit) && rawCommit.status === "conflict" && strictKeys(rawCommit, ["status"])) throw new TenantLimitConfigurationError("CONFIGURATION_VERSION_CONFLICT");
    if (!isPlainDataRecord(rawCommit) || !strictKeys(rawCommit, ["tenantId", "action", "previousVersion", "resultingVersion"]) || rawCommit.tenantId !== subject.tenantId || rawCommit.action !== action || rawCommit.previousVersion !== expectedVersion || rawCommit.resultingVersion !== resultingVersion) {
      throw new TenantLimitConfigurationError("CONFIGURATION_FAILED");
    }
    return { status: "changed", code: "CONFIGURATION_CHANGED", tenantId: subject.tenantId, action, previousVersion: expectedVersion, resultingVersion };
  };

  const changePlatformKillSwitch = async (command: PlatformKillSwitchChange, operator: PlatformOperatorReference) => {
    const resolved = await resolvePlatformOperator(operator, dependencies.platformOperatorResolver);
    const scope = command?.scope;
    const action = scope === "action" ? normalizeAction(command?.action) : null;
    const enabled = command?.enabled;
    const expectedVersion = normalizeVersion(command?.expectedVersion);
    const reason = normalizeReason(command?.reason);
    const correlationId = normalizeCorrelation(command?.correlationId);
    if (!resolved) throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_UNAUTHORIZED");
    if ((scope !== "global" && scope !== "action") || (scope === "action" && !action) || (scope === "global" && command?.action !== undefined) || typeof enabled !== "boolean" || expectedVersion === null || reason === null || correlationId === null) {
      throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_INVALID");
    }
    let rawState: unknown;
    try {
      rawState = await dependencies.backend.getPlatformRuntimeState();
    } catch {
      throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_FAILED");
    }
    const state = validatePlatformRuntimeState(rawState);
    if (!state) throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_FAILED");
    if (state.configurationVersion !== expectedVersion) throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_VERSION_CONFLICT");
    const current = scope === "global" ? state.platformGlobalKill : state.platformActionKills[action as TenantLimitAction] === true;
    if (current === enabled) throw new TenantLimitConfigurationError("CONFIGURATION_NOOP");
    if (expectedVersion >= Number.MAX_SAFE_INTEGER) throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_INVALID");
    const resultingVersion = expectedVersion + 1;
    const transaction: PlatformKillSwitchTransaction = {
      scope,
      action,
      enabled,
      expectedVersion,
      resultingVersion,
      operatorId: resolved.operatorId,
      auditEvent: {
        eventType: "platform_limit_kill_switch_changed",
        scope,
        action,
        enabled,
        previousVersion: expectedVersion,
        resultingVersion,
        operatorId: resolved.operatorId,
        reason,
        correlationId,
      },
    };
    let rawCommit: unknown;
    try {
      rawCommit = await dependencies.backend.changePlatformConfiguration(transaction);
    } catch {
      throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_FAILED");
    }
    if (isPlainDataRecord(rawCommit) && rawCommit.status === "conflict" && strictKeys(rawCommit, ["status"])) throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_VERSION_CONFLICT");
    if (!isPlainDataRecord(rawCommit) || !strictKeys(rawCommit, ["scope", "action", "previousVersion", "resultingVersion"]) || rawCommit.scope !== scope || rawCommit.action !== action || rawCommit.previousVersion !== expectedVersion || rawCommit.resultingVersion !== resultingVersion) {
      throw new TenantLimitConfigurationError("PLATFORM_CONFIGURATION_FAILED");
    }
    return { status: "changed" as const, code: "PLATFORM_CONFIGURATION_CHANGED" as const, scope, action, previousVersion: expectedVersion, resultingVersion };
  };

  return { consume, changeConfiguration, changePlatformKillSwitch };
}

interface ResolvedServicePrincipal {
  readonly tenantId: string;
  readonly actorId: string;
  readonly workspaceId: string | null;
  readonly permissions: readonly TenantPermission[];
}

interface ResolvedPlatformOperator {
  readonly operatorId: string;
}

type ResolvedAuthority = { tenantId: string; actorId: string; workspaceId: string | null; context?: TenantContext; principal?: ResolvedServicePrincipal };

async function resolveAuthority(authority: TenantLimitAuthority | undefined, resolver: TenantLimitServiceDependencies["servicePrincipalResolver"]): Promise<ResolvedAuthority | null> {
  if (authority === undefined) {
    const context = getTenantContext();
    if (context && isAcceptedContext(context)) return { tenantId: context.tenantId, actorId: context.actorAuthIdentityId, workspaceId: context.workspaceId, context };
    return null;
  }
  if (!isPlainDataRecord(authority) || !strictKeys(authority, ["kind", "principal"])) return null;
  if (authority.kind === "service_principal" && isServicePrincipalReference(authority.principal) && resolver) {
    try {
      const result = await resolver.resolve(authority.principal.principalId);
      if (isResolvedServicePrincipal(result)) return { ...result, principal: result };
    } catch {
      return null;
    }
  }
  return null;
}

async function resolvePlatformOperator(operator: PlatformOperatorReference, resolver: TenantLimitServiceDependencies["platformOperatorResolver"]): Promise<ResolvedPlatformOperator | null> {
  if (!resolver || !isPlainDataRecord(operator) || !strictKeys(operator, ["kind", "principalId"]) || operator.kind !== "platform_operator" || typeof operator.principalId !== "string" || !SAFE_OPAQUE_ID.test(operator.principalId)) return null;
  try {
    const result = await resolver.resolve(operator.principalId);
    if (!isPlainDataRecord(result) || !strictKeys(result, ["operatorId", "permission"]) || typeof result.operatorId !== "string" || !SAFE_OPAQUE_ID.test(result.operatorId) || result.permission !== "platform:limit_manage") return null;
    return { operatorId: result.operatorId };
  } catch {
    return null;
  }
}

function selectorsMatch(subject: { tenantId: string; actorId: string; workspaceId: string | null }, command: TenantLimitCommand): boolean {
  return (command.tenantId === undefined || command.tenantId === subject.tenantId) && (command.actorId === undefined || command.actorId === subject.actorId) && (command.workspaceId === undefined || command.workspaceId === subject.workspaceId);
}

function isAcceptedContext(value: unknown): value is TenantContext {
  // T-014 supplies this object from AsyncLocalStorage; callers never pass it as authority.
  if (!isNonNullObject(value)) return false;
  return tenantIdSchema.safeParse(value.tenantId).success && (value.workspaceId === null || workspaceIdSchema.safeParse(value.workspaceId).success) && authIdentityIdSchema.safeParse(value.actorAuthIdentityId).success && typeof value.membershipId === "string" && SAFE_OPAQUE_ID.test(value.membershipId) && typeof value.roleBindingId === "string" && SAFE_OPAQUE_ID.test(value.roleBindingId) && isTenantRole(value.role) && typeof value.correlationId === "string";
}

function isServicePrincipalReference(value: unknown): value is ServicePrincipalReference {
  return isPlainDataRecord(value) && value.kind === "trusted_service_principal" && typeof value.principalId === "string" && SAFE_OPAQUE_ID.test(value.principalId) && strictKeys(value, ["kind", "principalId"]);
}

function isResolvedServicePrincipal(value: unknown): value is ResolvedServicePrincipal {
  if (!isPlainDataRecord(value) || !strictKeys(value, ["tenantId", "actorId", "workspaceId", "permissions"]) || !tenantIdSchema.safeParse(value.tenantId).success || typeof value.actorId !== "string" || !SAFE_OPAQUE_ID.test(value.actorId) || (value.workspaceId !== null && !workspaceIdSchema.safeParse(value.workspaceId).success) || !isPlainStringArray(value.permissions)) return false;
  return value.permissions.every((permission) => isTenantPermission(permission));
}

function validateRuntimeState(value: unknown, tenantId: string): TenantLimitRuntimeState | null {
  if (!isPlainDataRecord(value) || !strictKeys(value, ["tenantId", "tenantStatus", "configurationVersion", "platformConfigurationVersion", "platformGlobalKill", "platformActionKills", "tenantActionKills", "tenantPolicyCaps"]) || value.tenantId !== tenantId || typeof value.tenantStatus !== "string" || !TENANT_STATUS_SET.has(value.tenantStatus) || typeof value.configurationVersion !== "number" || !Number.isSafeInteger(value.configurationVersion) || value.configurationVersion < 1 || typeof value.platformConfigurationVersion !== "number" || !Number.isSafeInteger(value.platformConfigurationVersion) || value.platformConfigurationVersion < 1 || typeof value.platformGlobalKill !== "boolean" || !isBooleanMap(value.platformActionKills) || !isBooleanMap(value.tenantActionKills) || !isCapMap(value.tenantPolicyCaps)) return null;
  return value as unknown as TenantLimitRuntimeState;
}

interface PlatformRuntimeState {
  readonly configurationVersion: number;
  readonly platformGlobalKill: boolean;
  readonly platformActionKills: Partial<Record<TenantLimitAction, boolean>>;
}

function validatePlatformRuntimeState(value: unknown): PlatformRuntimeState | null {
  if (!isPlainDataRecord(value) || !strictKeys(value, ["configurationVersion", "platformGlobalKill", "platformActionKills"]) || typeof value.configurationVersion !== "number" || !Number.isSafeInteger(value.configurationVersion) || value.configurationVersion < 1 || typeof value.platformGlobalKill !== "boolean" || !isBooleanMap(value.platformActionKills)) return null;
  return value as unknown as PlatformRuntimeState;
}

function isBooleanMap(value: unknown): value is Partial<Record<TenantLimitAction, boolean>> {
  if (!isPlainDataRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => TENANT_LIMIT_ACTION_SET.has(key) && typeof item === "boolean");
}

function isCapMap(value: unknown): value is Partial<Record<TenantLimitAction, number>> {
  if (!isPlainDataRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => TENANT_LIMIT_ACTION_SET.has(key) && Number.isSafeInteger(item) && (item as number) >= 1 && (item as number) <= TENANT_LIMIT_ACTION_POLICY[key as TenantLimitAction].platformHardCap);
}

function hasOwnActionFlag(value: Partial<Record<TenantLimitAction, boolean>>, action: TenantLimitAction): boolean {
  return Object.prototype.hasOwnProperty.call(value, action) && value[action] === true;
}

function ownActionCap(value: Partial<Record<TenantLimitAction, number>>, action: TenantLimitAction, fallback: number): number {
  return Object.prototype.hasOwnProperty.call(value, action) ? value[action] as number : fallback;
}

function validateConsumeResult(value: unknown, nowMs: number, windowMs: number, hardBound: number): AtomicTenantLimitConsumeResult | null {
  if (!isPlainDataRecord(value) || typeof value.status !== "string") return null;
  if (value.status === "idempotency_conflict" || value.status === "state_changed" || value.status === "policy_blocked") {
    return strictKeys(value, ["status"]) ? { status: value.status } : null;
  }
  if (value.status !== "consumed" && value.status !== "replayed" && value.status !== "rate_limited") return null;
  if (!strictKeys(value, ["status", "remaining", "resetAt"]) || typeof value.remaining !== "number" || !Number.isSafeInteger(value.remaining) || value.remaining < 0 || value.remaining > hardBound || typeof value.resetAt !== "number" || !Number.isSafeInteger(value.resetAt) || value.resetAt < nowMs || value.resetAt > nowMs + Math.min(MAX_RETRY_AFTER_MS, windowMs) + 1000) return null;
  return value as unknown as AtomicTenantLimitConsumeResult;
}

function normalizeAction(value: unknown): TenantLimitAction | null {
  return typeof value === "string" && TENANT_LIMIT_ACTION_SET.has(value) ? value as TenantLimitAction : null;
}

function normalizeAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_AMOUNT ? value : null;
}

function normalizeVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER ? value : null;
}

function normalizeCap(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_AMOUNT ? value : null;
}

function normalizeIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && value.length >= 8 && value.length <= 128 && SAFE_OPAQUE_ID.test(value) ? value : null;
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length >= 1 && reason.length <= 500 && !CONTROL_CHARACTER.test(reason) && SAFE_REASON.test(reason) ? reason : null;
}

function normalizeCorrelation(value: unknown): string | null {
  return typeof value === "string" && SAFE_OPAQUE_ID.test(value) ? value : null;
}

async function isConfigurationAuthorized(subject: ResolvedAuthority, permission: "budget:manage" | "feature:manage", policyEvaluator: TenantPolicyEvaluator | undefined): Promise<boolean> {
  if (subject.principal) return subject.principal.permissions.includes(permission);
  if (!subject.context) return false;
  const decision = getTenantPermissionDecision(subject.context.role, permission);
  if (!decision.allowed) return false;
  if (decision.decision === "A") return true;
  if (!policyEvaluator) return false;
  const context: TenantPolicyContext = Object.freeze({ tenantId: subject.context.tenantId, workspaceId: subject.context.workspaceId, membershipId: subject.context.membershipId, role: subject.context.role, permission, action: `tenant_limits.${permission}.change`, resource: null });
  try {
    const result = await policyEvaluator(context);
    return isPlainDataRecord(result) && strictKeys(result, ["allowed", "context"]) && result.allowed === true && samePolicyContext(result.context, context);
  } catch {
    return false;
  }
}

function samePolicyContext(value: unknown, expected: TenantPolicyContext): boolean {
  if (!isPlainDataRecord(value)) return false;
  return strictKeys(value, ["tenantId", "workspaceId", "membershipId", "role", "permission", "action", "resource"]) && value.tenantId === expected.tenantId && value.workspaceId === expected.workspaceId && value.membershipId === expected.membershipId && value.role === expected.role && value.permission === expected.permission && value.action === expected.action && value.resource === null;
}

function isEnabledFeatureResolution(value: unknown, tenantId: string, featureId: TenantFeatureId): value is { readonly state: "enabled"; readonly policyVersion: number } {
  if (!isPlainDataRecord(value)) return false;
  return strictKeys(value, ["tenantId", "featureId", "policyField", "state", "policyEnabled", "policyVersion", "reasonCode"]) && value.tenantId === tenantId && value.featureId === featureId && value.policyField === TENANT_FEATURE_POLICY_FIELDS[featureId] && value.state === "enabled" && value.policyEnabled === true && typeof value.policyVersion === "number" && Number.isSafeInteger(value.policyVersion) && value.policyVersion >= 1 && value.reasonCode === "FEATURE_ENABLED";
}

/**
 * Boundary records accept Object.prototype or null prototypes only. Every own key
 * must be an enumerable string data property; arrays, class instances, inherited
 * members, symbols, non-enumerables, and accessors fail closed.
 */
function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    const enumerableKeys = Object.keys(value);
    if (ownKeys.length !== enumerableKeys.length || ownKeys.some((key) => typeof key !== "string")) return false;
    return enumerableKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && Object.prototype.hasOwnProperty.call(descriptor, "value");
    });
  } catch {
    return false;
  }
}

function isPlainStringArray(value: unknown): value is readonly string[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") || lengthDescriptor.enumerable || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return false;
    const length = lengthDescriptor.value as number;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1 || ownKeys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) return false;
    const enumerableKeys = Object.keys(value);
    if (enumerableKeys.length !== length || enumerableKeys.some((key, index) => key !== String(index))) return false;
    return enumerableKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && Object.prototype.hasOwnProperty.call(descriptor, "value") && typeof descriptor.value === "string";
    });
  } catch {
    return false;
  }
}

function strictKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainDataRecord(value)) return false;
  const expected = new Set(keys);
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => expected.has(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function allowed(): TenantLimitResult {
  return { outcome: "allowed", code: "ALLOWED", retryAfterMs: null, resetAt: null };
}

function blocked(code: Exclude<TenantLimitResultCode, "ALLOWED" | "RATE_LIMITED">): TenantLimitResult {
  return { outcome: "blocked", code, retryAfterMs: null, resetAt: null };
}

function rateLimited(nowMs: number, resetAt: number): TenantLimitResult {
  const retryAfterMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(0, resetAt - nowMs));
  return { outcome: "rate_limited", code: "RATE_LIMITED", retryAfterMs, resetAt };
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
