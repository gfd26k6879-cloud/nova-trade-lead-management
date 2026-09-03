import { z } from "zod";

import {
  ACTOR_LAYERS,
  AUTHORIZATION_RESULT_CODES,
  LAUNCH_ROLES,
  MEMBERSHIP_STATUSES,
  PLATFORM_ROLES,
  PROVISIONING_RESULT_CODES,
  PROVISIONING_WORKFLOW_STATES,
  SCOPE_CLASSES,
  SUPPORT_ACCESS_GRANT_DATA_CLASSES,
  SUPPORT_ACCESS_GRANT_PERMISSIONS,
  SUPPORT_ACCESS_GRANT_STATES,
  TENANT_EXPORT_ERROR_CODES,
  TENANT_EXPORT_FORMATS,
  TENANT_EXPORT_JOB_OPERATION,
  TENANT_EXPORT_JOB_STATUSES,
  TENANT_EXPORT_LEASE_MAX_SECONDS,
  TENANT_EXPORT_MANIFEST_VERSION,
  TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS,
  TENANT_EXPORT_SCHEMA_VERSION,
  TENANT_POLICY_ACTIVE_MATERIALS_MODE,
  TENANT_STATUSES,
  type TenantPolicy,
  WORKSPACE_STATUSES,
  type ActorLayer,
  type AuthorizationResultCode,
  type ProvisioningWorkflowState,
  type TenantExportJob,
  type TenantExportJobStatus,
} from "@/lib/tenancy/types";

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SAFE_CORRELATION_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_POLICY_VERSION_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{4,127}$/;
const SAFE_SUPPORT_GRANT_REASON_REGEX = /^[a-z][a-z0-9._-]{2,79}$/;
const SHA256_REGEX = /^[0-9a-f]{64}$/;
const SAFE_ARTIFACT_STORAGE_REF_REGEX = /^tenants\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/exports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9._-]{0,127}$/;

const isValidLocale = (value: string): boolean => {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
};

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const isCanonicalUtcTimestamp = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};

const tenantOrWorkspaceLabel = (max: number) => z.string().trim().min(1).max(max);
const tenantLabelSchema = tenantOrWorkspaceLabel(180);
const workspaceLabelSchema = tenantOrWorkspaceLabel(120);
export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(SAFE_SLUG_REGEX);
export const workspaceSlugSchema = tenantSlugSchema;

export const localeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .refine(isValidLocale, "Invalid locale identifier");
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, "Invalid IANA timezone identifier");

const uuidSchema = z.string().trim().regex(UUID_REGEX);
const uuidV4Schema = uuidSchema.uuid();
const correlationIdSchema = z.string().trim().min(8).max(128).regex(SAFE_CORRELATION_REGEX);
const idempotencyKeySchema = z.string().trim().min(8).max(128).regex(SAFE_ID_REGEX);
const policyVersionSchema = z.string().trim().min(5).max(128).regex(SAFE_POLICY_VERSION_REGEX);
const permissionCodeSchema = z.string().trim().min(3).max(80);
const provisioningTransitionReasonCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]{2,79}$/);
export const provisioningResultCodeSchema = z.enum(PROVISIONING_RESULT_CODES);
const supportGrantReasonCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(SAFE_SUPPORT_GRANT_REASON_REGEX);
const provisioningTransitionFailureCodeSchema = provisioningResultCodeSchema;
const workerLeaseActorLayerSchema = z.enum(["worker", "system"] as const);

const nonEmptyStringArraySchema = z.array(z.string().trim().min(1).max(120));
const tenantPolicyTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const supportAccessGrantTimestampSchema = z.string().refine(isCanonicalUtcTimestamp, "Expected canonical UTC timestamp");
const supportAccessGrantPermissionSchema = z.enum(SUPPORT_ACCESS_GRANT_PERMISSIONS);
const supportAccessGrantDataClassSchema = z.enum(SUPPORT_ACCESS_GRANT_DATA_CLASSES);
const supportAccessGrantStateSchema = z.enum(SUPPORT_ACCESS_GRANT_STATES);
const platformRoleSchema = z.enum(PLATFORM_ROLES);
const supportAccessGrantReasonSchema = z.string().trim().min(1).max(500);
const uniqueNonEmpty = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

export const tenantIdSchema = uuidV4Schema;
export const workspaceIdSchema = uuidV4Schema;
export const membershipIdSchema = uuidV4Schema;
export const authIdentityIdSchema = uuidV4Schema;
export const provisioningRequestIdSchema = uuidV4Schema;
export const supportGrantIdSchema = uuidV4Schema;
export const workerLeaseIdSchema = uuidV4Schema;
export const actorLayerSchema = z.enum(ACTOR_LAYERS);
export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export const workspaceStatusSchema = z.enum(WORKSPACE_STATUSES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export const launchRoleSchema = z.enum(LAUNCH_ROLES);
export const scopeClassSchema = z.enum(SCOPE_CLASSES);
export const provisioningWorkflowStateSchema = z.enum(PROVISIONING_WORKFLOW_STATES);
export const authorizationResultCodeSchema = z.enum(AUTHORIZATION_RESULT_CODES);

export const sha256HashSchema = z.string().regex(SHA256_REGEX, "Expected lowercase SHA-256 hex");
export const tenantExportJobIdSchema = uuidV4Schema;
export const tenantExportOperationSchema = z.literal(TENANT_EXPORT_JOB_OPERATION);
export const tenantExportJobStatusSchema = z.enum(TENANT_EXPORT_JOB_STATUSES);
export const tenantExportFormatSchema = z.enum(TENANT_EXPORT_FORMATS);
export const tenantExportErrorCodeSchema = z.enum(TENANT_EXPORT_ERROR_CODES);
export const tenantExportTimestampSchema = z.string().refine(isCanonicalUtcTimestamp, "Expected canonical UTC timestamp");
export const tenantExportArtifactStorageRefSchema = z
  .string()
  .trim()
  .regex(SAFE_ARTIFACT_STORAGE_REF_REGEX, "Expected a private tenant artifact key")
  .refine((value) => !/https?:\/\/|\/\/|\.\.|[?#=&\s]/i.test(value), "Artifact reference must be a private path")
  .refine((value) => !/(secret|credential|password|bearer|api[_-]?key|token)/i.test(value), "Artifact reference contains a forbidden value");
const tenantExportCountSchema = z.number().int().min(0).max(2_147_483_647);
const tenantExportRetryCountSchema = z.number().int().min(0).max(10);
const tenantExportErrorMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 .,:;_()\/-]*$/, "Error message must be content-minimized")
  .refine((value) => !/(secret|credential|password|bearer|api[_-]?key|token)/i.test(value), "Error message contains a forbidden value");

const tenantExportArtifactFields = {
  artifactStorageRef: tenantExportArtifactStorageRefSchema.nullable(),
  artifactChecksumSha256: sha256HashSchema.nullable(),
  includedCount: tenantExportCountSchema.nullable(),
  excludedCount: tenantExportCountSchema.nullable(),
  redactedCount: tenantExportCountSchema.nullable(),
  artifactCreatedAt: tenantExportTimestampSchema.nullable(),
  expiresAt: tenantExportTimestampSchema.nullable(),
} satisfies z.ZodRawShape;

const tenantExportRequesterFields = {
  requesterAuthIdentityId: authIdentityIdSchema,
  requesterMembershipId: membershipIdSchema.nullable(),
  supportAccessGrantId: supportGrantIdSchema.nullable(),
} satisfies z.ZodRawShape;

const tenantExportArtifactIsComplete = (job: Pick<z.infer<z.ZodObject<typeof tenantExportArtifactFields>>, keyof typeof tenantExportArtifactFields>): boolean => {
  const values = [job.artifactStorageRef, job.artifactChecksumSha256, job.includedCount, job.excludedCount, job.redactedCount, job.artifactCreatedAt, job.expiresAt];
  return values.every((value) => value !== null) || values.every((value) => value === null);
};

const addTenantExportArtifactIssues = (job: {
  status: string;
  artifactStorageRef: string | null;
  artifactChecksumSha256: string | null;
  includedCount: number | null;
  excludedCount: number | null;
  redactedCount: number | null;
  artifactCreatedAt: string | null;
  expiresAt: string | null;
}, ctx: z.RefinementCtx): void => {
  const artifactValues = [
    job.artifactStorageRef,
    job.artifactChecksumSha256,
    job.includedCount,
    job.excludedCount,
    job.redactedCount,
    job.artifactCreatedAt,
    job.expiresAt,
  ];
  const artifactRequired = ["artifact_created", "released", "expired", "deleted"].includes(job.status);
  const artifactAllowed = ["artifact_created", "released", "expired", "deleted", "retry_wait", "failed", "canceled"].includes(job.status);
  const hasArtifactFacts = artifactValues.some((value) => value !== null);
  if ((artifactRequired && artifactValues.some((value) => value === null))
    || (hasArtifactFacts && !artifactAllowed)
    || (!tenantExportArtifactIsComplete(job as never))) {
    ctx.addIssue({ code: "custom", path: ["artifactStorageRef"], message: "Artifact facts must be complete together" });
    return;
  }
  if (!hasArtifactFacts) return;
  const artifactCreatedAt = Date.parse(job.artifactCreatedAt!);
  const expiresAt = Date.parse(job.expiresAt!);
  if (!Number.isFinite(artifactCreatedAt) || !Number.isFinite(expiresAt) || expiresAt <= artifactCreatedAt || expiresAt - artifactCreatedAt > TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS * 1000) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Artifact expiry must be after creation and within seven days" });
  }
};

export const tenantLabelDescriptorSchema = z
  .object({
    tenantId: tenantIdSchema,
    tenantName: tenantLabelSchema,
    tenantSlug: tenantSlugSchema,
    tenantStatus: tenantStatusSchema,
  })
  .strict();

export const workspaceLabelDescriptorSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    workspaceName: workspaceLabelSchema,
    workspaceSlug: workspaceSlugSchema,
    workspaceStatus: workspaceStatusSchema,
    tenantId: tenantIdSchema,
  })
  .strict();

export const membershipDescriptorSchema = z
  .object({
    membershipId: membershipIdSchema,
    tenantId: tenantIdSchema,
    authIdentityId: authIdentityIdSchema,
    role: launchRoleSchema,
    status: membershipStatusSchema,
    workspaceId: workspaceIdSchema.optional(),
  })
  .strict();

export const supportGrantDescriptorSchema = z
  .object({
    supportGrantId: supportGrantIdSchema,
    tenantId: tenantIdSchema,
    issuedToAuthIdentityId: authIdentityIdSchema,
    grantedByAuthIdentityId: authIdentityIdSchema,
    actionScope: z.string().trim().min(3).max(80),
    allowedActions: nonEmptyStringArraySchema.min(1).max(24),
    // Support reason is intentionally separate from provisioning outcomes.
    reasonCode: supportGrantReasonCodeSchema,
    expiresAtIso: z.string().datetime(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const supportAccessGrantScopeFields = {
  permissions: z.array(supportAccessGrantPermissionSchema).min(1).max(SUPPORT_ACCESS_GRANT_PERMISSIONS.length).refine(uniqueNonEmpty, "permissions must be unique"),
  dataClasses: z.array(supportAccessGrantDataClassSchema).min(1).max(SUPPORT_ACCESS_GRANT_DATA_CLASSES.length).refine(uniqueNonEmpty, "data classes must be unique"),
};

const supportAccessGrantCommonFields = {
  id: supportGrantIdSchema,
  tenantId: tenantIdSchema,
  workspaceId: workspaceIdSchema.nullable(),
  supportActorAuthIdentityId: authIdentityIdSchema,
  platformRole: platformRoleSchema,
  requestedByAuthIdentityId: authIdentityIdSchema,
  reasonCode: supportGrantReasonCodeSchema,
  reason: supportAccessGrantReasonSchema,
  startsAt: supportAccessGrantTimestampSchema,
  expiresAt: supportAccessGrantTimestampSchema,
  correlationId: correlationIdSchema,
  auditEventId: supportGrantIdSchema,
  createdAt: supportAccessGrantTimestampSchema,
  updatedAt: supportAccessGrantTimestampSchema,
  ...supportAccessGrantScopeFields,
} satisfies z.ZodRawShape;

export const supportAccessGrantCreationInputSchema = z
  .object({
    tenantId: tenantIdSchema,
    workspaceId: workspaceIdSchema.optional(),
    supportActorAuthIdentityId: authIdentityIdSchema,
    requestedByAuthIdentityId: authIdentityIdSchema,
    reasonCode: supportGrantReasonCodeSchema,
    reason: supportAccessGrantReasonSchema,
    startsAt: supportAccessGrantTimestampSchema,
    expiresAt: supportAccessGrantTimestampSchema,
    correlationId: correlationIdSchema,
    auditEventId: supportGrantIdSchema,
    ...supportAccessGrantScopeFields,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.startsAt >= input.expiresAt) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be after startsAt" });
    }
  });

export const supportAccessGrantSchema = z
  .object({
    ...supportAccessGrantCommonFields,
    state: supportAccessGrantStateSchema,
    approvedByAuthIdentityId: authIdentityIdSchema.nullable(),
    approvedAt: supportAccessGrantTimestampSchema.nullable(),
    revokedByAuthIdentityId: authIdentityIdSchema.nullable(),
    revokedAt: supportAccessGrantTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((grant, ctx) => {
    if (grant.startsAt >= grant.expiresAt) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "expiresAt must be after startsAt" });
    }
    if (grant.updatedAt < grant.createdAt) {
      ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt must not precede createdAt" });
    }
    if (grant.approvedAt !== null && (grant.approvedAt < grant.createdAt || grant.approvedAt >= grant.expiresAt)) {
      ctx.addIssue({ code: "custom", path: ["approvedAt"], message: "approvedAt must be on/after createdAt and before expiresAt" });
    }
    if (grant.revokedAt !== null && (grant.approvedAt === null || grant.revokedAt < grant.approvedAt)) {
      ctx.addIssue({ code: "custom", path: ["revokedAt"], message: "revokedAt must be on/after approvedAt" });
    }
    if (grant.approvedByAuthIdentityId === grant.supportActorAuthIdentityId) {
      ctx.addIssue({ code: "custom", path: ["approvedByAuthIdentityId"], message: "support actor cannot approve its own grant" });
    }
    const pending = grant.state === "pending";
    const approved = grant.state === "approved";
    const revoked = grant.state === "revoked";
    if (pending && (grant.approvedByAuthIdentityId !== null || grant.approvedAt !== null || grant.revokedByAuthIdentityId !== null || grant.revokedAt !== null)) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "pending grants have no approval or revocation facts" });
    }
    if ((approved || revoked) && (grant.approvedByAuthIdentityId === null || grant.approvedAt === null)) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "approved and revoked grants require approval facts" });
    }
    if (approved && (grant.revokedByAuthIdentityId !== null || grant.revokedAt !== null)) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "approved grants cannot contain revocation facts" });
    }
    if (revoked && (grant.revokedByAuthIdentityId === null || grant.revokedAt === null)) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "revoked grants require revocation facts" });
    }
  });

export function isSupportAccessGrantEligibleAt(
  grant: Pick<z.infer<typeof supportAccessGrantSchema>, "state" | "startsAt" | "expiresAt" | "revokedAt">,
  at: string | Date,
): boolean {
  if (grant.state !== "approved" || grant.revokedAt !== null) return false;
  const atMilliseconds = typeof at === "string" ? (isCanonicalUtcTimestamp(at) ? Date.parse(at) : Number.NaN) : at.getTime();
  const startMilliseconds = Date.parse(grant.startsAt);
  const expiryMilliseconds = Date.parse(grant.expiresAt);
  return Number.isFinite(atMilliseconds) && Number.isFinite(startMilliseconds) && Number.isFinite(expiryMilliseconds)
    && startMilliseconds <= atMilliseconds && atMilliseconds < expiryMilliseconds;
}

export type SupportAccessGrantCreationInput = z.infer<typeof supportAccessGrantCreationInputSchema>;
export type SupportAccessGrantSchemaType = z.infer<typeof supportAccessGrantSchema>;

const tenantExportCommonFields = {
  id: tenantExportJobIdSchema,
  tenantId: tenantIdSchema,
  workspaceId: workspaceIdSchema.nullable(),
  operation: tenantExportOperationSchema,
  ...tenantExportRequesterFields,
  status: tenantExportJobStatusSchema,
  scopeHash: sha256HashSchema,
  inputHash: sha256HashSchema,
  idempotencyKeyHash: sha256HashSchema,
  policyVersion: policyVersionSchema,
  manifestVersion: z.string().trim().min(1).max(128).regex(SAFE_POLICY_VERSION_REGEX),
  schemaVersion: z.string().trim().min(1).max(128).regex(SAFE_POLICY_VERSION_REGEX),
  requestedFormat: tenantExportFormatSchema,
  snapshotAt: tenantExportTimestampSchema.nullable(),
  ...tenantExportArtifactFields,
  errorCode: tenantExportErrorCodeSchema.nullable(),
  errorMessage: tenantExportErrorMessageSchema.nullable(),
  retryCount: tenantExportRetryCountSchema,
  maxRetries: tenantExportRetryCountSchema,
  nextRetryAt: tenantExportTimestampSchema.nullable(),
  leaseOwnerHash: sha256HashSchema.nullable(),
  leaseGeneration: z.number().int().min(0).max(2_147_483_647),
  leaseAcquiredAt: tenantExportTimestampSchema.nullable(),
  leaseHeartbeatAt: tenantExportTimestampSchema.nullable(),
  leaseExpiresAt: tenantExportTimestampSchema.nullable(),
  correlationId: correlationIdSchema,
  auditEventId: uuidV4Schema,
  createdAt: tenantExportTimestampSchema,
  updatedAt: tenantExportTimestampSchema,
} satisfies z.ZodRawShape;

const validateTenantExportRequester = (
  value: Pick<z.infer<z.ZodObject<typeof tenantExportRequesterFields>>, keyof typeof tenantExportRequesterFields>,
  ctx: z.RefinementCtx,
): void => {
  const hasMembership = value.requesterMembershipId !== null;
  const hasSupportGrant = value.supportAccessGrantId !== null;
  if (hasMembership === hasSupportGrant) {
    ctx.addIssue({ code: "custom", path: ["requesterMembershipId"], message: "Exactly one verified membership or support grant is required" });
  }
};

const validateTenantExportLease = (job: {
  leaseOwnerHash: string | null;
  leaseGeneration: number;
  leaseAcquiredAt: string | null;
  leaseHeartbeatAt: string | null;
  leaseExpiresAt: string | null;
}, ctx: z.RefinementCtx): void => {
  const leaseValues = [job.leaseOwnerHash, job.leaseAcquiredAt, job.leaseHeartbeatAt, job.leaseExpiresAt];
  if (leaseValues.every((value) => value === null)) return;
  if (leaseValues.some((value) => value === null)) {
    ctx.addIssue({ code: "custom", path: ["leaseOwnerHash"], message: "Lease facts must be complete together" });
    return;
  }
  const acquired = Date.parse(job.leaseAcquiredAt!);
  const heartbeat = Date.parse(job.leaseHeartbeatAt!);
  const expires = Date.parse(job.leaseExpiresAt!);
  if (!Number.isFinite(acquired) || !Number.isFinite(heartbeat) || !Number.isFinite(expires)
    || acquired > heartbeat || heartbeat >= expires || expires - heartbeat > TENANT_EXPORT_LEASE_MAX_SECONDS * 1000) {
    ctx.addIssue({ code: "custom", path: ["leaseExpiresAt"], message: "Lease window is invalid or unbounded" });
  }
};

const tenantExportJobRefinement = (job: z.infer<z.ZodObject<typeof tenantExportCommonFields>>, ctx: z.RefinementCtx): void => {
  validateTenantExportRequester(job, ctx);
  if (job.updatedAt < job.createdAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt must not precede createdAt" });
  if (["redacting", "artifact_created", "released", "expired", "deleted"].includes(job.status) && job.snapshotAt === null) {
    ctx.addIssue({ code: "custom", path: ["snapshotAt"], message: "This export state requires a snapshot fact" });
  }
  if (job.snapshotAt !== null && job.snapshotAt < job.createdAt) ctx.addIssue({ code: "custom", path: ["snapshotAt"], message: "snapshotAt must not precede createdAt" });
  if (job.artifactCreatedAt !== null && (job.snapshotAt === null || job.artifactCreatedAt < job.snapshotAt)) {
    ctx.addIssue({ code: "custom", path: ["artifactCreatedAt"], message: "artifactCreatedAt must not precede snapshotAt" });
  }
  addTenantExportArtifactIssues(job, ctx);
  validateTenantExportLease(job, ctx);
  if (job.retryCount > job.maxRetries) ctx.addIssue({ code: "custom", path: ["retryCount"], message: "retryCount must not exceed maxRetries" });
  if (job.status === "retry_wait" && (job.nextRetryAt === null || job.errorCode === null || job.errorMessage === null || job.retryCount >= job.maxRetries)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "retry_wait requires bounded retry metadata" });
  }
  if (["failed", "canceled"].includes(job.status) && (job.errorCode === null || job.errorMessage === null || job.nextRetryAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "failed and canceled require a content-minimized terminal error" });
  }
  if (!(["retry_wait", "failed", "canceled"].includes(job.status)) && job.nextRetryAt !== null) {
    ctx.addIssue({ code: "custom", path: ["nextRetryAt"], message: "nextRetryAt is only valid for retry_wait" });
  }
  if (job.artifactStorageRef !== null && !job.artifactStorageRef.startsWith(`tenants/${job.tenantId}/exports/${job.id}/`)) {
    ctx.addIssue({ code: "custom", path: ["artifactStorageRef"], message: "Artifact reference must remain in the job tenant namespace" });
  }
};

export const tenantExportJobSchema = z
  .object(tenantExportCommonFields)
  .strict()
  .superRefine(tenantExportJobRefinement);

export const tenantExportJobCreationInputSchema = z
  .object({
    tenantId: tenantIdSchema,
    workspaceId: workspaceIdSchema.optional().transform((value) => value ?? null),
    operation: tenantExportOperationSchema.optional().default(TENANT_EXPORT_JOB_OPERATION),
    requesterAuthIdentityId: authIdentityIdSchema,
    requesterMembershipId: membershipIdSchema.nullish().transform((value) => value ?? null),
    supportAccessGrantId: supportGrantIdSchema.nullish().transform((value) => value ?? null),
    scopeHash: sha256HashSchema,
    inputHash: sha256HashSchema,
    idempotencyKeyHash: sha256HashSchema,
    policyVersion: policyVersionSchema,
    manifestVersion: z.string().trim().min(1).max(128).regex(SAFE_POLICY_VERSION_REGEX).default(TENANT_EXPORT_MANIFEST_VERSION),
    schemaVersion: z.string().trim().min(1).max(128).regex(SAFE_POLICY_VERSION_REGEX).default(TENANT_EXPORT_SCHEMA_VERSION),
    requestedFormat: tenantExportFormatSchema,
    maxRetries: tenantExportRetryCountSchema.default(3),
    correlationId: correlationIdSchema,
    auditEventId: uuidV4Schema,
  })
  .strict()
  .superRefine(validateTenantExportRequester);

export const tenantExportTransitionMap: Readonly<Record<TenantExportJobStatus, readonly TenantExportJobStatus[]>> = {
  requested: ["snapshotting", "failed", "canceled"],
  snapshotting: ["redacting", "retry_wait", "failed", "canceled"],
  redacting: ["artifact_created", "retry_wait", "failed", "canceled"],
  artifact_created: ["released", "retry_wait", "failed", "canceled"],
  released: ["expired", "deleted"],
  retry_wait: ["snapshotting", "redacting", "artifact_created", "failed", "canceled"],
  failed: ["retry_wait", "canceled"],
  canceled: [],
  expired: ["deleted"],
  deleted: [],
} as const;

export const TENANT_EXPORT_TERMINAL_STATUSES: readonly TenantExportJobStatus[] = ["canceled", "deleted"];

export function isTransitionAllowed(from: TenantExportJobStatus, to: TenantExportJobStatus): boolean {
  return Object.prototype.hasOwnProperty.call(tenantExportTransitionMap, from)
    && tenantExportTransitionMap[from].includes(to);
}

export function isArtifactUsableAt(
  job: Pick<TenantExportJob, "id" | "tenantId" | "status" | "createdAt" | "snapshotAt" | "artifactStorageRef" | "artifactChecksumSha256" | "includedCount" | "excludedCount" | "redactedCount" | "artifactCreatedAt" | "expiresAt">,
  at: string | Date,
): boolean {
  if (job.status !== "released" || job.artifactStorageRef === null || job.artifactChecksumSha256 === null
    || job.includedCount === null || job.excludedCount === null || job.redactedCount === null
    || job.artifactCreatedAt === null || job.expiresAt === null
    || !Number.isInteger(job.includedCount) || job.includedCount < 0
    || !Number.isInteger(job.excludedCount) || job.excludedCount < 0
    || !Number.isInteger(job.redactedCount) || job.redactedCount < 0
    || !job.artifactStorageRef.startsWith(`tenants/${job.tenantId}/exports/${job.id}/`)) return false;
  const atMilliseconds = typeof at === "string"
    ? (isCanonicalUtcTimestamp(at) ? Date.parse(at) : Number.NaN)
    : (at instanceof Date ? at.getTime() : Number.NaN);
  const jobCreatedMilliseconds = Date.parse(job.createdAt);
  const snapshotMilliseconds = job.snapshotAt === null ? Number.NaN : Date.parse(job.snapshotAt);
  const createdMilliseconds = Date.parse(job.artifactCreatedAt);
  const expiryMilliseconds = Date.parse(job.expiresAt);
  return Number.isFinite(atMilliseconds) && Number.isFinite(jobCreatedMilliseconds) && Number.isFinite(snapshotMilliseconds)
    && Number.isFinite(createdMilliseconds) && Number.isFinite(expiryMilliseconds)
    && jobCreatedMilliseconds <= snapshotMilliseconds
    && snapshotMilliseconds <= createdMilliseconds
    && expiryMilliseconds > createdMilliseconds
    && expiryMilliseconds - createdMilliseconds <= TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS * 1000
    && createdMilliseconds <= atMilliseconds && atMilliseconds < expiryMilliseconds
    && sha256HashSchema.safeParse(job.artifactChecksumSha256).success
    && tenantExportArtifactStorageRefSchema.safeParse(job.artifactStorageRef).success;
}

export type TenantExportJobCreationInput = z.infer<typeof tenantExportJobCreationInputSchema>;
export type TenantExportJobSchemaType = z.infer<typeof tenantExportJobSchema>;

export const workerLeaseDescriptorSchema = z
  .object({
    workerLeaseId: workerLeaseIdSchema,
    tenantId: tenantIdSchema,
    workspaceId: workspaceIdSchema.optional(),
    actorLayer: workerLeaseActorLayerSchema,
    actorIdentityId: authIdentityIdSchema,
    permissions: nonEmptyStringArraySchema.min(1).max(40),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const authorizationDecisionInputSchema = z
  .object({
    // Internal evaluation context only; tenant/actor/workspace resolution happens server-side.
    tenantId: tenantIdSchema,
    authIdentityId: authIdentityIdSchema,
    requestedTenantId: tenantIdSchema,
    requestedWorkspaceId: workspaceIdSchema.optional(),
    actorLayer: actorLayerSchema,
    permissionCode: permissionCodeSchema,
    locale: localeCodeSchema.optional(),
    timezone: timezoneSchema.optional(),
    correlationId: correlationIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const authorizationDecisionResultAllowedSchema = z
  .object({
    // Actor/workspace/tenant facts are server-resolved internal fields in output, never browser authority.
    tenantId: tenantIdSchema,
    authIdentityId: authIdentityIdSchema,
    requestedTenantId: tenantIdSchema,
    requestedWorkspaceId: workspaceIdSchema.optional(),
    actorLayer: actorLayerSchema,
    permissionCode: permissionCodeSchema,
    allowed: z.literal(true),
    correlationId: correlationIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const authorizationDecisionResultDeniedSchema = z
  .object({
    tenantId: tenantIdSchema,
    authIdentityId: authIdentityIdSchema,
    requestedTenantId: tenantIdSchema,
    requestedWorkspaceId: workspaceIdSchema.optional(),
    actorLayer: actorLayerSchema,
    permissionCode: permissionCodeSchema,
    allowed: z.literal(false),
    decisionCode: authorizationResultCodeSchema,
    correlationId: correlationIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const authorizationDecisionResultSchema = z.discriminatedUnion("allowed", [
  authorizationDecisionResultAllowedSchema,
  authorizationDecisionResultDeniedSchema,
]).superRefine((result, ctx) => {
  if (result.allowed && result.requestedTenantId !== result.tenantId) {
    ctx.addIssue({
      code: "custom",
      path: ["requestedTenantId"],
      message: "an allowed decision must match the effective tenant",
    });
  }
});

export const workspaceBootstrapInputSchema = z
  .object({
    workspaceName: workspaceLabelSchema,
    workspaceSlug: workspaceSlugSchema,
  })
  .strict();

const tenantPolicyInteger = (maximum: number) => z.number().int().min(1).max(maximum);

const tenantPolicyFields = {
  id: uuidV4Schema,
  tenantId: tenantIdSchema,
  version: z.number().int().min(1),
  locale: localeCodeSchema,
  timezone: timezoneSchema,
  exportRetentionDays: tenantPolicyInteger(7),
  operationalLogRetentionDays: tenantPolicyInteger(30),
  rawSourceRetentionDays: tenantPolicyInteger(180),
  contactFreshnessDays: tenantPolicyInteger(180),
  primaryDeleteWithinDays: tenantPolicyInteger(30),
  backupExpireWithinDays: tenantPolicyInteger(35),
  tombstoneRetentionYears: z.literal(7),
  activeMaterialsMode: z.literal(TENANT_POLICY_ACTIVE_MATERIALS_MODE),
  aiProcessingEnabled: z.boolean(),
  sourceResearchEnabled: z.boolean(),
  contactResearchEnabled: z.boolean(),
  outreachDraftingEnabled: z.boolean(),
  copyExportEnabled: z.boolean(),
  autonomousSendEnabled: z.literal(false),
  requireSourcePlanApproval: z.boolean(),
  requireKnowledgeReview: z.boolean(),
  requireIcpReview: z.boolean(),
  requireLeadPlayReview: z.boolean(),
  requireContactReview: z.boolean(),
  requireOutreachReview: z.boolean(),
  createdAt: tenantPolicyTimestampSchema,
  updatedAt: tenantPolicyTimestampSchema,
} satisfies z.ZodRawShape;

export const tenantPolicySchema = z.object(tenantPolicyFields).strict() as z.ZodObject<
  typeof tenantPolicyFields
>;

export const TENANT_POLICY_DEFAULTS: Readonly<
  Omit<TenantPolicy, "id" | "tenantId" | "version" | "createdAt" | "updatedAt">
> = Object.freeze({
  locale: "en-US",
  timezone: "UTC",
  exportRetentionDays: 7,
  operationalLogRetentionDays: 30,
  rawSourceRetentionDays: 180,
  contactFreshnessDays: 180,
  primaryDeleteWithinDays: 30,
  backupExpireWithinDays: 35,
  tombstoneRetentionYears: 7,
  activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion",
  aiProcessingEnabled: false,
  sourceResearchEnabled: false,
  contactResearchEnabled: false,
  outreachDraftingEnabled: false,
  copyExportEnabled: false,
  autonomousSendEnabled: false,
  requireSourcePlanApproval: true,
  requireKnowledgeReview: true,
  requireIcpReview: true,
  requireLeadPlayReview: true,
  requireContactReview: true,
  requireOutreachReview: true,
});

export function createTenantPolicyDefaults(): Readonly<
  Omit<TenantPolicy, "id" | "tenantId" | "version" | "createdAt" | "updatedAt">
> {
  return TENANT_POLICY_DEFAULTS;
}

const tenantPolicyCreationFields = {
  tenantId: tenantPolicyFields.tenantId,
  locale: tenantPolicyFields.locale.optional(),
  timezone: tenantPolicyFields.timezone.optional(),
  exportRetentionDays: tenantPolicyFields.exportRetentionDays.optional(),
  operationalLogRetentionDays: tenantPolicyFields.operationalLogRetentionDays.optional(),
  rawSourceRetentionDays: tenantPolicyFields.rawSourceRetentionDays.optional(),
  contactFreshnessDays: tenantPolicyFields.contactFreshnessDays.optional(),
  primaryDeleteWithinDays: tenantPolicyFields.primaryDeleteWithinDays.optional(),
  backupExpireWithinDays: tenantPolicyFields.backupExpireWithinDays.optional(),
  tombstoneRetentionYears: tenantPolicyFields.tombstoneRetentionYears.optional(),
  activeMaterialsMode: tenantPolicyFields.activeMaterialsMode.optional(),
  aiProcessingEnabled: tenantPolicyFields.aiProcessingEnabled.optional(),
  sourceResearchEnabled: tenantPolicyFields.sourceResearchEnabled.optional(),
  contactResearchEnabled: tenantPolicyFields.contactResearchEnabled.optional(),
  outreachDraftingEnabled: tenantPolicyFields.outreachDraftingEnabled.optional(),
  copyExportEnabled: tenantPolicyFields.copyExportEnabled.optional(),
  autonomousSendEnabled: tenantPolicyFields.autonomousSendEnabled.optional(),
  requireSourcePlanApproval: tenantPolicyFields.requireSourcePlanApproval.optional(),
  requireKnowledgeReview: tenantPolicyFields.requireKnowledgeReview.optional(),
  requireIcpReview: tenantPolicyFields.requireIcpReview.optional(),
  requireLeadPlayReview: tenantPolicyFields.requireLeadPlayReview.optional(),
  requireContactReview: tenantPolicyFields.requireContactReview.optional(),
  requireOutreachReview: tenantPolicyFields.requireOutreachReview.optional(),
} satisfies z.ZodRawShape;

export const tenantPolicyCreationInputSchema = z
  .object(tenantPolicyCreationFields)
  .strict()
  .transform((input) => ({ ...TENANT_POLICY_DEFAULTS, ...input }));

// Public request intake is untrusted and must only include non-authoritative request material.
export const tenantProvisioningRequestIntakeSchema = z
  .object({
    organizationName: tenantLabelSchema,
    organizationSlug: tenantSlugSchema,
    requestedPolicyVersion: policyVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
    locale: localeCodeSchema.default("en-US"),
    timezone: timezoneSchema.default("UTC"),
    workspace: workspaceBootstrapInputSchema.optional(),
  })
  .strict();

// Internal operator command adds trusted server/operator-selected owner identity.
export const tenantProvisioningOperatorCommandSchema = tenantProvisioningRequestIntakeSchema.extend({
  ownerIdentityId: authIdentityIdSchema,
});
export const tenantProvisioningCreateInputSchema = tenantProvisioningOperatorCommandSchema;

export const provisioningTransitionMap: Record<
  ProvisioningWorkflowState,
  readonly ProvisioningWorkflowState[]
> = {
  request_received: ["operator_approved", "request_rejected", "request_expired"],
  operator_approved: ["provisioning", "request_rejected"],
  provisioning: ["owner_verification_pending", "provisioning", "provisioning_failed"],
  owner_verification_pending: ["owner_acceptance_pending", "owner_verification_pending", "provisioning"],
  owner_acceptance_pending: ["activation_ready", "owner_acceptance_pending", "provisioning"],
  activation_ready: ["active", "provisioning"],
  active: ["suspended", "archived", "deletion_pending"],
  suspended: ["recovery", "active", "archived", "deletion_pending"],
  recovery: ["provisioning", "owner_verification_pending", "active", "suspended", "archived", "deletion_pending"],
  archived: ["deletion_pending"],
  deletion_pending: ["deleted", "archived"],
  deleted: [],
  provisioning_failed: ["provisioning", "recovery"],
  request_rejected: [],
  request_expired: [],
} as const;

const noTenantWorkflowStates: readonly ProvisioningWorkflowState[] = [
  "request_received",
  "operator_approved",
  "request_rejected",
  "request_expired",
] as const;

const validateTenantPresenceForWorkflowState = (
  state: ProvisioningWorkflowState,
  tenantId: string | undefined,
  ctx: z.RefinementCtx,
): void => {
  const stateHasTenant = !noTenantWorkflowStates.includes(state);
  if (stateHasTenant && tenantId === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["tenantId"],
      message: `tenantId is required when workflow state ${state} has a tenant`,
    });
  }

  if (!stateHasTenant && tenantId !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["tenantId"],
      message: `tenantId must not be set when workflow state ${state} has no tenant`,
    });
  }
};

const validateProvisioningTransitionPair = (
  from: ProvisioningWorkflowState,
  to: ProvisioningWorkflowState,
  path: "to" | "committedTo" | "attemptedTo",
  ctx: z.RefinementCtx,
): void => {
  const allowedNextStates = provisioningTransitionMap[from];
  if (!allowedNextStates.includes(to)) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: `Invalid provisioning transition ${from} -> ${to}`,
    });
  }
};

export const provisioningTransitionInputSchema = z
  .object({
    requestId: provisioningRequestIdSchema,
    tenantId: tenantIdSchema.optional(),
    from: provisioningWorkflowStateSchema,
    to: provisioningWorkflowStateSchema,
    reasonCode: provisioningTransitionReasonCodeSchema,
    policyVersion: policyVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    validateProvisioningTransitionPair(input.from, input.to, "to", ctx);
    // Inputs describe the currently committed state. Pre-creation commands may
    // not inject the server-generated tenant ID.
    validateTenantPresenceForWorkflowState(input.from, input.tenantId, ctx);
  });

const provisioningTransitionSuccessSchema = z
  .object({
    requestId: provisioningRequestIdSchema,
    tenantId: tenantIdSchema.optional(),
    from: provisioningWorkflowStateSchema,
    committedTo: provisioningWorkflowStateSchema,
    succeeded: z.literal(true),
    policyVersion: policyVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    validateProvisioningTransitionPair(input.from, input.committedTo, "committedTo", ctx);
    // A successful result describes the newly committed state. The
    // operator_approved -> provisioning result therefore carries the generated
    // tenant ID even though its input did not.
    validateTenantPresenceForWorkflowState(input.committedTo, input.tenantId, ctx);
  });

const provisioningTransitionFailureSchema = z
  .object({
    requestId: provisioningRequestIdSchema,
    tenantId: tenantIdSchema.optional(),
    from: provisioningWorkflowStateSchema,
    attemptedTo: provisioningWorkflowStateSchema,
    succeeded: z.literal(false),
    resultCode: provisioningTransitionFailureCodeSchema,
    policyVersion: policyVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    validateProvisioningTransitionPair(input.from, input.attemptedTo, "attemptedTo", ctx);
    // A failed result leaves the committed workflow state unchanged.
    validateTenantPresenceForWorkflowState(input.from, input.tenantId, ctx);
  });

export const provisioningTransitionResultSchema = z.discriminatedUnion("succeeded", [
  provisioningTransitionSuccessSchema,
  provisioningTransitionFailureSchema,
]);

const noTenantWorkflowStatesSet = new Set(noTenantWorkflowStates);

export function isAllowedProvisioningTransition(
  from: ProvisioningWorkflowState,
  to: ProvisioningWorkflowState,
): boolean {
  return provisioningTransitionMap[from].includes(to);
}

export function isTenantState(value: ProvisioningWorkflowState): value is Exclude<
  ProvisioningWorkflowState,
  (typeof noTenantWorkflowStates)[number]
> {
  return !noTenantWorkflowStatesSet.has(value);
}

export type TenantProvisioningCreateInput = z.infer<typeof tenantProvisioningCreateInputSchema>;
export type TenantProvisioningRequestIntake = z.infer<typeof tenantProvisioningRequestIntakeSchema>;
export type TenantProvisioningOperatorCommand = z.infer<typeof tenantProvisioningOperatorCommandSchema>;
export type ProvisioningTransitionInput = z.infer<typeof provisioningTransitionInputSchema>;
export type ProvisioningTransitionResult = z.infer<typeof provisioningTransitionResultSchema>;
export type AuthorizationDecisionInput = z.infer<typeof authorizationDecisionInputSchema>;
export type AuthorizationDecisionResult = z.infer<typeof authorizationDecisionResultSchema>;
export type ActorLayerType = ActorLayer;
export type AuthorizationDecisionCode = AuthorizationResultCode;
export type ProvisioningTransitionReason = z.infer<typeof provisioningTransitionReasonCodeSchema>;
export type TenantLabelSchemaType = z.infer<typeof tenantLabelSchema>;
export type TenantPolicySchemaType = z.infer<typeof tenantPolicySchema>;
export type TenantPolicyCreationInput = z.infer<typeof tenantPolicyCreationInputSchema>;
