import { authIdentityIdSchema, tenantIdSchema, tenantPolicySchema } from "@/lib/tenancy/schemas";
import type {
  AuthIdentityId,
  CorrelationId,
  TenantId,
  TenantPolicyEnablementKey,
} from "@/lib/tenancy/types";

export const TENANT_FEATURE_IDS = [
  "ai_processing",
  "source_research",
  "contact_research",
  "outreach_drafting",
  "copy_export",
  "autonomous_send",
] as const;

export type TenantFeatureId = (typeof TENANT_FEATURE_IDS)[number];

export const TENANT_FEATURES = {
  AI_PROCESSING: "ai_processing",
  SOURCE_RESEARCH: "source_research",
  CONTACT_RESEARCH: "contact_research",
  OUTREACH_DRAFTING: "outreach_drafting",
  COPY_EXPORT: "copy_export",
  AUTONOMOUS_SEND: "autonomous_send",
} as const satisfies Record<string, TenantFeatureId>;

// This is the complete new-platform gate vocabulary. It intentionally does not
// include legacy website-lead behavior or any provider, source, contact,
// jurisdiction, permission, or human-review decision.
export const TENANT_FEATURE_POLICY_FIELDS = {
  ai_processing: "aiProcessingEnabled",
  source_research: "sourceResearchEnabled",
  contact_research: "contactResearchEnabled",
  outreach_drafting: "outreachDraftingEnabled",
  copy_export: "copyExportEnabled",
  autonomous_send: "autonomousSendEnabled",
} as const satisfies Record<TenantFeatureId, TenantPolicyEnablementKey>;

export const FEATURE_POLICY_FIELD_MAP = TENANT_FEATURE_POLICY_FIELDS;
export type TenantFeaturePolicyField = (typeof TENANT_FEATURE_POLICY_FIELDS)[TenantFeatureId];

export const TENANT_FEATURE_RESOLUTION_STATES = [
  "enabled",
  "disabled",
  "unconfigured",
  "malformed",
  "scope_mismatch",
  "unavailable",
] as const;
export type TenantFeatureResolutionState = (typeof TENANT_FEATURE_RESOLUTION_STATES)[number];

export const TENANT_FEATURE_REASON_CODES = [
  "FEATURE_ENABLED",
  "FEATURE_DISABLED_BY_POLICY",
  "POLICY_MISSING",
  "POLICY_MALFORMED",
  "POLICY_SCOPE_MISMATCH",
  "POLICY_UNAVAILABLE",
  "AUTONOMOUS_SEND_FORBIDDEN",
  "INVALID_REQUEST",
  "INVALID_TENANT_ID",
  "INVALID_FEATURE_ID",
  "INVALID_ENABLED_VALUE",
  "INVALID_EXPECTED_POLICY_VERSION",
  "INVALID_REASON",
  "INVALID_CORRELATION",
  "HUMAN_REVIEW_REQUIRED",
  "FEATURE_MANAGER_UNAUTHORIZED",
  "ACTOR_SCOPE_MISMATCH",
  "POLICY_VERSION_CONFLICT",
  "POLICY_VERSION_OVERFLOW",
  "POLICY_CHANGE_UNAVAILABLE",
  "POLICY_CHANGE_EXECUTOR_UNAVAILABLE",
  "POLICY_CHANGE_EXECUTION_FAILED",
] as const;
export type TenantFeatureReasonCode = (typeof TENANT_FEATURE_REASON_CODES)[number];

export interface TenantFeatureResolution {
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly policyField: TenantFeaturePolicyField;
  readonly state: TenantFeatureResolutionState;
  readonly policyEnabled: boolean | null;
  readonly policyVersion: number | null;
  readonly reasonCode: TenantFeatureReasonCode;
}

export interface TenantFeaturePolicyRepository {
  // The tenant scope is explicit at the repository boundary. No unscoped or
  // global policy lookup is accepted by this service.
  getCurrentTenantPolicy(tenantId: TenantId): Promise<unknown | null>;
}

export const FEATURE_MANAGE_PERMISSION = "feature:manage" as const;

// This value can only enter the service through the trusted resolver. The
// public change request intentionally has no actor field.
export interface TrustedTenantFeatureManager {
  readonly tenantId: TenantId;
  readonly authIdentityId: AuthIdentityId;
  readonly permission: typeof FEATURE_MANAGE_PERMISSION;
}

export interface TenantFeatureActorResolver {
  // The resolver/authorizer, not this service, proves the server-derived actor's
  // feature:manage permission for the exact tenant.
  resolveFeatureManager(tenantId: TenantId): Promise<TrustedTenantFeatureManager | null>;
}

export interface TenantFeatureChangeRequest {
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly enabled: boolean;
  readonly expectedPolicyVersion: number;
  readonly reason: string;
  readonly correlationId: CorrelationId;
  readonly humanReviewAcknowledged: boolean;
}

export interface TenantFeaturePolicyMutation {
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly policyField: TenantFeaturePolicyField;
  readonly previousEnabled: boolean;
  readonly enabled: boolean;
  readonly previousPolicyVersion: number;
  readonly resultingPolicyVersion: number;
  readonly expectedPolicyVersion: number;
}

export interface TenantFeaturePolicyAuditEvent {
  readonly eventType: "tenant_feature_policy_changed";
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly policyField: TenantFeaturePolicyField;
  readonly previousEnabled: boolean;
  readonly enabled: boolean;
  readonly previousPolicyVersion: number;
  readonly resultingPolicyVersion: number;
  readonly actorAuthIdentityId: AuthIdentityId;
  readonly reason: string;
  readonly correlationId: CorrelationId;
}

export interface TenantFeaturePolicyChangeCommand {
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly actor: TrustedTenantFeatureManager;
  readonly expectedPolicyVersion: number;
  readonly previousPolicyVersion: number;
  readonly resultingPolicyVersion: number;
  readonly humanReviewAcknowledged: true;
  readonly mutation: TenantFeaturePolicyMutation;
  readonly auditEvent: TenantFeaturePolicyAuditEvent;
}

export interface TenantFeaturePolicyChangeExecutor {
  // The implementation must CAS the policy and append the immutable audit
  // event atomically. T-009 intentionally does not implement this port.
  execute(command: TenantFeaturePolicyChangeCommand): Promise<TenantFeaturePolicyCommittedResult>;
}

export interface TenantFeaturePolicyCommittedResult {
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly previousPolicyVersion: number;
  readonly resultingPolicyVersion: number;
}

export interface TenantFeatureServiceDependencies {
  readonly policyRepository: TenantFeaturePolicyRepository;
  readonly actorResolver: TenantFeatureActorResolver;
  readonly changeExecutor: TenantFeaturePolicyChangeExecutor;
}

export interface TenantFeatureChangeAccepted {
  readonly status: "unchanged" | "changed";
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly previousPolicyVersion: number;
  readonly resultingPolicyVersion: number;
}

export class TenantFeatureInputError extends Error {
  readonly code: TenantFeatureReasonCode;

  constructor(code: TenantFeatureReasonCode) {
    super(`Tenant feature request is denied: ${code}.`);
    this.name = "TenantFeatureInputError";
    this.code = code;
  }
}

export class TenantFeatureDeniedError extends Error {
  readonly code: TenantFeatureReasonCode;
  readonly resolution: TenantFeatureResolution;

  constructor(resolution: TenantFeatureResolution) {
    super(`Tenant feature ${resolution.featureId} is denied: ${resolution.reasonCode}.`);
    this.name = "TenantFeatureDeniedError";
    this.code = resolution.reasonCode;
    this.resolution = resolution;
  }
}

export class TenantFeaturePolicyChangeError extends Error {
  readonly code: TenantFeatureReasonCode;
  readonly tenantId: TenantId;
  readonly featureId: TenantFeatureId;
  readonly policyVersion: number | null;

  constructor(
    code: TenantFeatureReasonCode,
    input: Pick<TenantFeatureChangeRequest, "tenantId" | "featureId">,
    policyVersion: number | null,
  ) {
    super(`Tenant feature ${input.featureId} policy change is denied: ${code}.`);
    this.name = "TenantFeaturePolicyChangeError";
    this.code = code;
    this.tenantId = input.tenantId;
    this.featureId = input.featureId;
    this.policyVersion = policyVersion;
  }
}

export interface TenantFeatureService {
  resolveFeature(tenantId: TenantId, featureId: TenantFeatureId): Promise<TenantFeatureResolution>;
  enforceFeature(tenantId: TenantId, featureId: TenantFeatureId): Promise<TenantFeatureResolution>;
  requireFeature(tenantId: TenantId, featureId: TenantFeatureId): Promise<TenantFeatureResolution>;
  requestFeatureChange(input: TenantFeatureChangeRequest): Promise<TenantFeatureChangeAccepted>;
}

export function createTenantFeatureService(dependencies: TenantFeatureServiceDependencies): TenantFeatureService {
  const resolveFeature = async (tenantId: TenantId, featureId: TenantFeatureId): Promise<TenantFeatureResolution> => {
    validateTenantId(tenantId);
    validateFeatureId(featureId);
    const policyField = policyFieldFor(featureId);
    let rawPolicy: unknown | null;
    try {
      rawPolicy = await dependencies.policyRepository.getCurrentTenantPolicy(tenantId);
    } catch {
      return resolution(tenantId, featureId, policyField, "unavailable", null, null, "POLICY_UNAVAILABLE");
    }

    if (rawPolicy === null || rawPolicy === undefined) {
      return resolution(tenantId, featureId, policyField, "unconfigured", null, null, "POLICY_MISSING");
    }

    const version = policyVersionFrom(rawPolicy);
    if (isRecord(rawPolicy) && typeof rawPolicy.tenantId === "string" && rawPolicy.tenantId !== tenantId) {
      return resolution(tenantId, featureId, policyField, "scope_mismatch", null, version, "POLICY_SCOPE_MISMATCH");
    }

    const parsed = tenantPolicySchema.safeParse(rawPolicy);
    if (!parsed.success) {
      return resolution(
        tenantId,
        featureId,
        policyField,
        "malformed",
        null,
        version,
        featureId === TENANT_FEATURES.AUTONOMOUS_SEND && isRecord(rawPolicy) && rawPolicy.autonomousSendEnabled === true
          ? "AUTONOMOUS_SEND_FORBIDDEN"
          : "POLICY_MALFORMED",
      );
    }

    if (featureId === TENANT_FEATURES.AUTONOMOUS_SEND) {
      return resolution(tenantId, featureId, policyField, "disabled", false, parsed.data.version, "AUTONOMOUS_SEND_FORBIDDEN");
    }

    const policyEnabled = parsed.data[policyField] === true;
    return resolution(
      tenantId,
      featureId,
      policyField,
      policyEnabled ? "enabled" : "disabled",
      policyEnabled,
      parsed.data.version,
      policyEnabled ? "FEATURE_ENABLED" : "FEATURE_DISABLED_BY_POLICY",
    );
  };

  const enforceFeature = async (tenantId: TenantId, featureId: TenantFeatureId): Promise<TenantFeatureResolution> => {
    const result = await resolveFeature(tenantId, featureId);
    if (result.state !== "enabled") throw new TenantFeatureDeniedError(result);
    return result;
  };

  const requestFeatureChange = async (input: TenantFeatureChangeRequest): Promise<TenantFeatureChangeAccepted> => {
    const request = normalizeChangeRequest(input);
    const actor = await resolveTrustedActor(request.tenantId, request.featureId);

    if (request.featureId === TENANT_FEATURES.AUTONOMOUS_SEND) {
      throw new TenantFeaturePolicyChangeError("AUTONOMOUS_SEND_FORBIDDEN", request, null);
    }

    const current = await resolveFeature(request.tenantId, request.featureId);
    if (current.state !== "enabled" && current.state !== "disabled") {
      throw new TenantFeaturePolicyChangeError("POLICY_CHANGE_UNAVAILABLE", request, current.policyVersion);
    }
    if (current.policyVersion !== request.expectedPolicyVersion) {
      throw new TenantFeaturePolicyChangeError("POLICY_VERSION_CONFLICT", request, current.policyVersion);
    }

    const previousEnabled = current.policyEnabled === true;
    if (previousEnabled === request.enabled) {
      return {
        status: "unchanged",
        tenantId: request.tenantId,
        featureId: request.featureId,
        previousPolicyVersion: request.expectedPolicyVersion,
        resultingPolicyVersion: request.expectedPolicyVersion,
      };
    }
    const resultingPolicyVersion = nextPolicyVersion(request.expectedPolicyVersion);
    if (resultingPolicyVersion === null) {
      throw new TenantFeaturePolicyChangeError("POLICY_VERSION_OVERFLOW", request, current.policyVersion);
    }
    if (typeof dependencies.changeExecutor?.execute !== "function") {
      throw new TenantFeaturePolicyChangeError("POLICY_CHANGE_EXECUTOR_UNAVAILABLE", request, current.policyVersion);
    }

    const command: TenantFeaturePolicyChangeCommand = {
      tenantId: request.tenantId,
      featureId: request.featureId,
      actor,
      expectedPolicyVersion: request.expectedPolicyVersion,
      previousPolicyVersion: request.expectedPolicyVersion,
      resultingPolicyVersion,
      humanReviewAcknowledged: true,
      mutation: {
        tenantId: request.tenantId,
        featureId: request.featureId,
        policyField: current.policyField,
        previousEnabled,
        enabled: request.enabled,
        previousPolicyVersion: request.expectedPolicyVersion,
        resultingPolicyVersion,
        expectedPolicyVersion: request.expectedPolicyVersion,
      },
      auditEvent: {
        eventType: "tenant_feature_policy_changed",
        tenantId: request.tenantId,
        featureId: request.featureId,
        policyField: current.policyField,
        previousEnabled,
        enabled: request.enabled,
        previousPolicyVersion: request.expectedPolicyVersion,
        resultingPolicyVersion,
        actorAuthIdentityId: actor.authIdentityId,
        reason: request.reason,
        correlationId: request.correlationId,
      },
    };

    try {
      const committed = await dependencies.changeExecutor.execute(command);
      if (!isMatchingCommittedResult(committed, command)) {
        throw new Error("Malformed or mismatched committed result.");
      }
    } catch {
      throw new TenantFeaturePolicyChangeError("POLICY_CHANGE_EXECUTION_FAILED", request, current.policyVersion);
    }

    return {
      status: "changed",
      tenantId: request.tenantId,
      featureId: request.featureId,
      previousPolicyVersion: request.expectedPolicyVersion,
      resultingPolicyVersion,
    };
  };

  const resolveTrustedActor = async (tenantId: TenantId, featureId: TenantFeatureId): Promise<TrustedTenantFeatureManager> => {
    if (typeof dependencies.actorResolver?.resolveFeatureManager !== "function") {
      throw new TenantFeaturePolicyChangeError("FEATURE_MANAGER_UNAUTHORIZED", { tenantId, featureId }, null);
    }
    let actor: TrustedTenantFeatureManager | null;
    try {
      actor = await dependencies.actorResolver.resolveFeatureManager(tenantId);
    } catch {
      throw new TenantFeaturePolicyChangeError("FEATURE_MANAGER_UNAUTHORIZED", { tenantId, featureId }, null);
    }
    if (actor === null || !isRecord(actor)) {
      throw new TenantFeaturePolicyChangeError("FEATURE_MANAGER_UNAUTHORIZED", { tenantId, featureId }, null);
    }
    if (actor.tenantId !== tenantId) {
      throw new TenantFeaturePolicyChangeError("ACTOR_SCOPE_MISMATCH", { tenantId, featureId }, null);
    }
    if (
      !tenantIdSchema.safeParse(actor.tenantId).success ||
      !authIdentityIdSchema.safeParse(actor.authIdentityId).success ||
      actor.permission !== FEATURE_MANAGE_PERMISSION
    ) {
      throw new TenantFeaturePolicyChangeError("FEATURE_MANAGER_UNAUTHORIZED", { tenantId, featureId }, null);
    }
    return actor;
  };

  return {
    resolveFeature,
    enforceFeature,
    requireFeature: enforceFeature,
    requestFeatureChange,
  };
}

export function policyFieldFor(featureId: TenantFeatureId): TenantFeaturePolicyField {
  validateFeatureId(featureId);
  return TENANT_FEATURE_POLICY_FIELDS[featureId];
}

function normalizeChangeRequest(input: unknown): TenantFeatureChangeRequest {
  if (!isRecord(input)) throw new TenantFeatureInputError("INVALID_REQUEST");
  const tenantId = input.tenantId;
  const featureId = input.featureId;
  validateTenantId(tenantId);
  validateFeatureId(featureId);
  if (typeof input.enabled !== "boolean") throw new TenantFeatureInputError("INVALID_ENABLED_VALUE");
  if (typeof input.expectedPolicyVersion !== "number" || !Number.isSafeInteger(input.expectedPolicyVersion) || input.expectedPolicyVersion < 1) {
    throw new TenantFeatureInputError("INVALID_EXPECTED_POLICY_VERSION");
  }
  const reason = boundedReason(input.reason);
  if (reason === null) throw new TenantFeatureInputError("INVALID_REASON");
  const correlationId = boundedCorrelation(input.correlationId);
  if (correlationId === null) throw new TenantFeatureInputError("INVALID_CORRELATION");
  if (input.humanReviewAcknowledged !== true) throw new TenantFeatureInputError("HUMAN_REVIEW_REQUIRED");

  // Build a new object so request-controlled extras, including actor-shaped
  // fields, cannot reach the trusted executor command.
  return {
    tenantId: tenantId as TenantId,
    featureId: featureId as TenantFeatureId,
    enabled: input.enabled,
    expectedPolicyVersion: input.expectedPolicyVersion,
    reason,
    correlationId: correlationId as CorrelationId,
    humanReviewAcknowledged: true,
  };
}

function validateTenantId(value: unknown): asserts value is TenantId {
  if (!tenantIdSchema.safeParse(value).success) throw new TenantFeatureInputError("INVALID_TENANT_ID");
}

function validateFeatureId(value: unknown): asserts value is TenantFeatureId {
  if (!isTenantFeatureId(value)) throw new TenantFeatureInputError("INVALID_FEATURE_ID");
}

function isTenantFeatureId(value: unknown): value is TenantFeatureId {
  return typeof value === "string" && (TENANT_FEATURE_IDS as readonly string[]).includes(value);
}

function boundedReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 500 || CONTROL_CHARACTER_PATTERN.test(trimmed)) return null;
  return SAFE_AUDIT_REASON_PATTERN.test(trimmed) ? trimmed : null;
}

function boundedCorrelation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(trimmed) ? trimmed : null;
}

function resolution(
  tenantId: TenantId,
  featureId: TenantFeatureId,
  policyField: TenantFeaturePolicyField,
  state: TenantFeatureResolutionState,
  policyEnabled: boolean | null,
  policyVersion: number | null,
  reasonCode: TenantFeatureReasonCode,
): TenantFeatureResolution {
  return { tenantId, featureId, policyField, state, policyEnabled, policyVersion, reasonCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function policyVersionFrom(value: unknown): number | null {
  if (!isRecord(value) || typeof value.version !== "number" || !Number.isSafeInteger(value.version)) return null;
  return value.version;
}

function nextPolicyVersion(version: number): number | null {
  return version < Number.MAX_SAFE_INTEGER ? version + 1 : null;
}

function isMatchingCommittedResult(
  value: unknown,
  command: TenantFeaturePolicyChangeCommand,
): value is TenantFeaturePolicyCommittedResult {
  if (!isRecord(value)) return false;
  return (
    value.tenantId === command.tenantId &&
    value.featureId === command.featureId &&
    value.previousPolicyVersion === command.previousPolicyVersion &&
    value.resultingPolicyVersion === command.resultingPolicyVersion &&
    typeof value.previousPolicyVersion === "number" &&
    Number.isSafeInteger(value.previousPolicyVersion) &&
    typeof value.resultingPolicyVersion === "number" &&
    Number.isSafeInteger(value.resultingPolicyVersion)
  );
}

const SAFE_AUDIT_REASON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,_:;()'"+&@#?!%=\/-]{0,499}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
