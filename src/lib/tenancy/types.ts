export type TenantId = string;
export type WorkspaceId = string;
export type MembershipId = string;
export type AuthIdentityId = string;
export type ProvisioningRequestId = string;
export type SupportGrantId = string;
export type WorkerLeaseId = string;

export const TENANT_EXPORT_JOB_OPERATION = "tenant_data_export" as const;

export const TENANT_EXPORT_JOB_STATUSES = [
  "requested",
  "snapshotting",
  "redacting",
  "artifact_created",
  "released",
  "retry_wait",
  "failed",
  "canceled",
  "expired",
  "deleted",
] as const;
export type TenantExportJobStatus = (typeof TENANT_EXPORT_JOB_STATUSES)[number];

export const TENANT_EXPORT_FORMATS = ["csv", "json", "package"] as const;
export type TenantExportFormat = (typeof TENANT_EXPORT_FORMATS)[number];

export const TENANT_EXPORT_ERROR_CODES = [
  "EXPORT_SCOPE_INVALID",
  "EXPORT_POLICY_BLOCKED",
  "EXPORT_SNAPSHOT_FAILED",
  "EXPORT_REDACTION_FAILED",
  "EXPORT_ARTIFACT_FAILED",
  "EXPORT_STORAGE_CHECKPOINT_FAILED",
  "EXPORT_RETRYABLE",
  "EXPORT_RETRY_EXHAUSTED",
  "EXPORT_CANCELED",
  "BLOCKED_EXPORT_REPLAY_CONFLICT",
  "BLOCKED_EXPORT_EXPIRED",
  "EXPORT_UNKNOWN_FAILURE",
] as const;
export type TenantExportErrorCode = (typeof TENANT_EXPORT_ERROR_CODES)[number];

export const TENANT_EXPORT_MANIFEST_VERSION = "d014-v1" as const;
export const TENANT_EXPORT_SCHEMA_VERSION = "tenant-export-job-v1" as const;
export const TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS = 7 * 24 * 60 * 60;
export const TENANT_EXPORT_LEASE_MAX_SECONDS = 15 * 60;

export interface TenantExportJob {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId | null;
  operation: typeof TENANT_EXPORT_JOB_OPERATION;
  requesterAuthIdentityId: AuthIdentityId;
  requesterMembershipId: MembershipId | null;
  supportAccessGrantId: SupportGrantId | null;
  status: TenantExportJobStatus;
  scopeHash: string;
  inputHash: string;
  idempotencyKeyHash: string;
  policyVersion: WorkflowPolicyVersion;
  manifestVersion: string;
  schemaVersion: string;
  requestedFormat: TenantExportFormat;
  snapshotAt: string | null;
  artifactStorageRef: string | null;
  artifactChecksumSha256: string | null;
  includedCount: number | null;
  excludedCount: number | null;
  redactedCount: number | null;
  artifactCreatedAt: string | null;
  expiresAt: string | null;
  errorCode: TenantExportErrorCode | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  leaseOwnerHash: string | null;
  leaseGeneration: number;
  leaseAcquiredAt: string | null;
  leaseHeartbeatAt: string | null;
  leaseExpiresAt: string | null;
  correlationId: CorrelationId;
  auditEventId: string;
  createdAt: string;
  updatedAt: string;
}

export const TENANT_POLICY_ACTIVE_MATERIALS_MODE =
  "while_authorized_until_superseded_policy_or_deletion" as const;
export const TENANT_POLICY_ACTIVE_MATERIALS_MODES = [TENANT_POLICY_ACTIVE_MATERIALS_MODE] as const;
export type TenantPolicyActiveMaterialsMode = (typeof TENANT_POLICY_ACTIVE_MATERIALS_MODES)[number];

export const TENANT_POLICY_ENABLEMENT_KEYS = [
  "aiProcessingEnabled",
  "sourceResearchEnabled",
  "contactResearchEnabled",
  "outreachDraftingEnabled",
  "copyExportEnabled",
  "autonomousSendEnabled",
] as const;
export type TenantPolicyEnablementKey = (typeof TENANT_POLICY_ENABLEMENT_KEYS)[number];

export const TENANT_POLICY_REVIEW_GATE_KEYS = [
  "requireSourcePlanApproval",
  "requireKnowledgeReview",
  "requireIcpReview",
  "requireLeadPlayReview",
  "requireContactReview",
  "requireOutreachReview",
] as const;
export type TenantPolicyReviewGateKey = (typeof TENANT_POLICY_REVIEW_GATE_KEYS)[number];

export interface TenantPolicy {
  id: string;
  tenantId: TenantId;
  version: number;
  locale: string;
  timezone: string;
  exportRetentionDays: number;
  operationalLogRetentionDays: number;
  rawSourceRetentionDays: number;
  contactFreshnessDays: number;
  primaryDeleteWithinDays: number;
  backupExpireWithinDays: number;
  tombstoneRetentionYears: 7;
  activeMaterialsMode: TenantPolicyActiveMaterialsMode;
  aiProcessingEnabled: boolean;
  sourceResearchEnabled: boolean;
  contactResearchEnabled: boolean;
  outreachDraftingEnabled: boolean;
  copyExportEnabled: boolean;
  autonomousSendEnabled: false;
  requireSourcePlanApproval: boolean;
  requireKnowledgeReview: boolean;
  requireIcpReview: boolean;
  requireLeadPlayReview: boolean;
  requireContactReview: boolean;
  requireOutreachReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TENANT_STATUSES = [
  "provisioning",
  "active",
  "suspended",
  "archived",
  "deletion_pending",
  "deleted",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const WORKSPACE_STATUSES = [
  "provisioning",
  "active",
  "paused",
  "archived",
  "deletion_pending",
  "deleted",
] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "suspended",
  "disabled",
  "revoked",
  "removed",
  "expired",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const LAUNCH_ROLES = [
  "owner",
  "admin",
  "strategist_manager",
  "researcher",
  "reviewer",
  "outreach_operator",
  "analyst_read_only",
] as const;

export type LaunchRole = (typeof LAUNCH_ROLES)[number];

export const PLATFORM_SUPPORT_ROLE = "platform_support" as const;
export const PLATFORM_ROLES = [PLATFORM_SUPPORT_ROLE] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SUPPORT_ACCESS_GRANT_STATES = ["pending", "approved", "revoked"] as const;
export type SupportAccessGrantState = (typeof SUPPORT_ACCESS_GRANT_STATES)[number];

// This is the complete D-002 atomic permission vocabulary. Unknown actions deny.
export const SUPPORT_ACCESS_GRANT_PERMISSIONS = [
  "tenant:read",
  "tenant:manage",
  "tenant:lifecycle",
  "workspace:read",
  "workspace:manage",
  "membership:read",
  "membership:invite",
  "membership:manage",
  "role:assign",
  "support:grant",
  "knowledge:read",
  "knowledge:upload",
  "knowledge:manage",
  "knowledge:review",
  "knowledge:export",
  "knowledge:delete",
  "understanding:read",
  "understanding:edit",
  "understanding:approve",
  "question:manage",
  "question:answer",
  "icp:read",
  "icp:edit",
  "icp:approve",
  "play:read",
  "play:edit",
  "play:approve",
  "play:activate",
  "play:archive",
  "connector:read",
  "connector:manage",
  "connector:use",
  "source:plan",
  "source:approve",
  "source:execute",
  "source:review",
  "account:read",
  "account:edit",
  "account:merge",
  "account:archive",
  "contact:read",
  "contact:research",
  "contact:edit",
  "contact:use",
  "contact:approve",
  "buying_center:read",
  "buying_center:edit",
  "buying_center:approve",
  "qualification:read",
  "qualification:edit",
  "qualification:approve",
  "score:read",
  "score:recompute",
  "score:override",
  "review:read",
  "review:decide",
  "audit:read",
  "audit:export",
  "outreach:read",
  "outreach:draft",
  "outreach:edit",
  "outreach:approve",
  "outreach:copy_export",
  "suppression:read",
  "suppression:manage",
  "outcome:write",
  "report:read",
  "report:manage",
  "usage:read",
  "budget:manage",
  "queue:read",
  "queue:operate",
  "feature:manage",
  "data:export",
  "data:delete",
] as const;
export type SupportAccessGrantPermission = (typeof SUPPORT_ACCESS_GRANT_PERMISSIONS)[number];

// Support grants use explicit, least-content classes. Credentials, auth-security
// data, malware, and other prohibited classifications are intentionally absent.
export const SUPPORT_ACCESS_GRANT_DATA_CLASSES = [
  "tenant_metadata",
  "workspace_metadata",
  "public_business_facts",
  "documents",
  "customer_lists",
  "contacts",
  "unpublished_product_technical_data",
  "audit_operational_metadata",
  "prompts",
  "agent_context",
] as const;
export type SupportAccessGrantDataClass = (typeof SUPPORT_ACCESS_GRANT_DATA_CLASSES)[number];

export interface SupportAccessGrant {
  id: SupportGrantId;
  tenantId: TenantId;
  workspaceId: WorkspaceId | null;
  supportActorAuthIdentityId: AuthIdentityId;
  platformRole: PlatformRole;
  requestedByAuthIdentityId: AuthIdentityId;
  approvedByAuthIdentityId: AuthIdentityId | null;
  approvedAt: string | null;
  revokedByAuthIdentityId: AuthIdentityId | null;
  revokedAt: string | null;
  state: SupportAccessGrantState;
  reasonCode: string;
  reason: string;
  startsAt: string;
  expiresAt: string;
  correlationId: CorrelationId;
  auditEventId: string;
  permissions: readonly SupportAccessGrantPermission[];
  dataClasses: readonly SupportAccessGrantDataClass[];
  createdAt: string;
  updatedAt: string;
}

export const SCOPE_CLASSES = [
  "platform-global",
  "tenant-wide",
  "workspace-optional",
  "workspace-required",
] as const;
export type ScopeClass = (typeof SCOPE_CLASSES)[number];

export const PROVISIONING_WORKFLOW_STATES = [
  "request_received",
  "operator_approved",
  "provisioning",
  "owner_verification_pending",
  "owner_acceptance_pending",
  "activation_ready",
  "active",
  "suspended",
  "recovery",
  "archived",
  "deletion_pending",
  "deleted",
  "provisioning_failed",
  "request_rejected",
  "request_expired",
] as const;
export type ProvisioningWorkflowState = (typeof PROVISIONING_WORKFLOW_STATES)[number];

export const PROVISIONING_RESULT_CODES = [
  "PROVISIONING_REQUEST_NOT_FOUND",
  "PROVISIONING_IDEMPOTENCY_CONFLICT",
  "PROVISIONING_NOT_AUTHORIZED",
  "PROVISIONING_STATE_BLOCKED",
  "INVITE_EXPIRED",
  "INVITE_REVOKED",
  "INVITE_RECIPIENT_MISMATCH",
  "OWNER_ACCEPTANCE_REQUIRED",
  "OWNER_GUARD",
  "PROVISIONING_RETRYABLE",
  "PROVISIONING_CONFLICT",
  "TENANT_STATE_BLOCKED",
] as const;
export type ProvisioningResultCode = (typeof PROVISIONING_RESULT_CODES)[number];

export const AUTHORIZATION_RESULT_CODES = [
  "AUTH_REQUIRED",
  "MEMBERSHIP_REQUIRED",
  "MEMBERSHIP_INACTIVE",
  "ROLE_REQUIRED",
  "TENANT_SCOPE_REQUIRED",
  "TENANT_SCOPE_MISMATCH",
  "WORKSPACE_SCOPE_INVALID",
  "SCOPE_LIFECYCLE_BLOCKED",
  "PERMISSION_DENIED",
  "POLICY_BLOCKED",
  "HUMAN_APPROVAL_REQUIRED",
  "SEPARATION_OF_DUTY",
  "STALE_APPROVAL",
  "SUPPRESSION_BLOCKED",
  "OWNER_GUARD",
  "SUPPORT_GRANT_REQUIRED",
  "TENANT_SWITCH_REQUIRED",
  "RESOURCE_NOT_FOUND_OR_FORBIDDEN",
  "INVALID_INPUT",
] as const;
export type AuthorizationResultCode = (typeof AUTHORIZATION_RESULT_CODES)[number];

export const ACTOR_LAYERS = [
  "member",
  "support",
  "worker",
  "agent",
  "system",
] as const;
export type ActorLayer = (typeof ACTOR_LAYERS)[number];

export type WorkflowPolicyVersion = string;
export type CorrelationId = string;
export type IdempotencyKey = string;
export type TenantSlug = string;
export type WorkspaceSlug = string;
export type LabelText = string;

export const TENANT_DELETION_JOB_OPERATION = "tenant_data_deletion" as const;
export const TENANT_DELETION_JOB_STATUSES = [
  "requested",
  "verified",
  "scheduled",
  "running",
  "retry_wait",
  "failed",
  "canceled",
  "primary_deleted",
  "backup_aging",
  "completed",
] as const;
export type TenantDeletionJobStatus = (typeof TENANT_DELETION_JOB_STATUSES)[number];

export const TENANT_DELETION_SCOPE_KINDS = ["tenant", "workspace", "resource_set"] as const;
export type TenantDeletionScopeKind = (typeof TENANT_DELETION_SCOPE_KINDS)[number];

export const TENANT_DELETION_FREEZE_HANDOFF_STATUSES = ["not_started", "requested", "acknowledged", "failed"] as const;
export type TenantDeletionFreezeHandoffStatus = (typeof TENANT_DELETION_FREEZE_HANDOFF_STATUSES)[number];

export const TENANT_DELETION_LEGAL_HOLD_STATUSES = ["none", "active_subset", "released", "unresolved"] as const;
export type TenantDeletionLegalHoldStatus = (typeof TENANT_DELETION_LEGAL_HOLD_STATUSES)[number];

export const TENANT_DELETION_CHECKPOINT_STORES = [
  "cache_idempotency",
  "search_embeddings",
  "queues_leases",
  "agent_context",
  "extracted_derivatives_previews_scanner",
  "object_quarantine_storage",
  "primary_database_negative_verification",
  "provider_external_copy_requests",
  "logs_telemetry_aggregates",
  "backup_aging",
] as const;
export type TenantDeletionCheckpointStore = (typeof TENANT_DELETION_CHECKPOINT_STORES)[number];

export const TENANT_DELETION_CHECKPOINT_STATUSES = ["pending", "running", "complete", "retryable", "failed", "held", "exempted"] as const;
export type TenantDeletionCheckpointStatus = (typeof TENANT_DELETION_CHECKPOINT_STATUSES)[number];

export const TENANT_DELETION_EXEMPTION_REASONS = [
  "legal_hold_covered",
  "not_applicable_by_policy",
  "no_provider_copy_evidenced",
  "backup_retention_only",
] as const;
export type TenantDeletionExemptionReason = (typeof TENANT_DELETION_EXEMPTION_REASONS)[number];

export const TENANT_DELETION_ERROR_CODES = [
  "DELETE_SCOPE_INVALID",
  "DELETE_POLICY_BLOCKED",
  "DELETE_CHECKPOINT_RETRYABLE",
  "DELETE_CHECKPOINT_FAILED",
  "DELETE_PROVIDER_RESPONSE_INVALID",
  "DELETE_PROVIDER_OUTAGE",
  "DELETE_TIMEOUT",
  "DELETE_CANCELED",
  "DELETE_HOLD_UNRESOLVED",
  "DELETE_REPLAY_CONFLICT",
  "DELETE_INTERNAL",
] as const;
export type TenantDeletionErrorCode = (typeof TENANT_DELETION_ERROR_CODES)[number];

export const TENANT_DELETION_CHECKPOINT_TRANSITIONS: Readonly<Record<TenantDeletionCheckpointStatus, readonly TenantDeletionCheckpointStatus[]>> = {
  pending: ["pending", "running", "held", "exempted"],
  running: ["running", "complete", "retryable", "failed", "held", "exempted"],
  retryable: ["retryable", "running", "failed"],
  held: ["held", "pending"],
  complete: ["complete"],
  failed: ["failed", "retryable"],
  exempted: ["exempted"],
};

export const TENANT_DELETION_JOB_TRANSITIONS: Readonly<Record<TenantDeletionJobStatus, readonly TenantDeletionJobStatus[]>> = {
  requested: ["requested", "verified", "canceled"],
  verified: ["verified", "scheduled", "canceled"],
  scheduled: ["scheduled", "running", "canceled"],
  running: ["running", "retry_wait", "failed", "primary_deleted"],
  retry_wait: ["retry_wait", "running", "failed"],
  failed: ["failed", "retry_wait"],
  canceled: ["canceled"],
  primary_deleted: ["primary_deleted", "backup_aging"],
  backup_aging: ["backup_aging", "completed"],
  completed: ["completed"],
};

export const TENANT_DELETION_TERMINAL_STATUSES: readonly TenantDeletionJobStatus[] = ["canceled", "completed"];
export const TENANT_DELETION_MAX_RETRIES = 10;
export const TENANT_DELETION_LEASE_MAX_SECONDS = 15 * 60;

export interface TenantDeletionCheckpointInput {
  store: TenantDeletionCheckpointStore;
  status: TenantDeletionCheckpointStatus;
  required: boolean;
  exemptionReason?: TenantDeletionExemptionReason | null;
  exemptionApproved?: boolean;
}

export interface TenantDeletionTransitionInput {
  from: TenantDeletionJobStatus;
  to: TenantDeletionJobStatus;
  freezeHandoffStatus: TenantDeletionFreezeHandoffStatus;
  accessRevocationHandoffStatus: TenantDeletionFreezeHandoffStatus;
  checkpoints: readonly TenantDeletionCheckpointInput[];
  retryCount: number;
  maxRetries: number;
}

export function isTenantDeletionTransitionAllowed(from: string, to: string): boolean {
  return (TENANT_DELETION_JOB_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
}

export function isTenantDeletionCheckpointTransitionAllowed(from: string, to: string): boolean {
  return (TENANT_DELETION_CHECKPOINT_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
}

function hasCanonicalTenantDeletionCheckpointSet(checkpoints: readonly TenantDeletionCheckpointInput[]): boolean {
  return checkpoints.length === TENANT_DELETION_CHECKPOINT_STORES.length
    && checkpoints.every((checkpoint) => checkpoint.required)
    && new Set(checkpoints.map((checkpoint) => checkpoint.store)).size === TENANT_DELETION_CHECKPOINT_STORES.length
    && TENANT_DELETION_CHECKPOINT_STORES.every((store) => checkpoints.some((checkpoint) => checkpoint.store === store));
}

function isValidTenantDeletionExemption(checkpoint: TenantDeletionCheckpointInput): boolean {
  if (checkpoint.status !== "exempted" || checkpoint.exemptionApproved !== true || checkpoint.exemptionReason === null || checkpoint.exemptionReason === undefined) return false;
  if (!TENANT_DELETION_EXEMPTION_REASONS.includes(checkpoint.exemptionReason)) return false;
  if (checkpoint.store === "backup_aging") return checkpoint.exemptionReason === "backup_retention_only";
  if (checkpoint.exemptionReason === "backup_retention_only") return false;
  if (checkpoint.store === "provider_external_copy_requests") return checkpoint.exemptionReason === "no_provider_copy_evidenced" || checkpoint.exemptionReason === "legal_hold_covered" || checkpoint.exemptionReason === "not_applicable_by_policy";
  return checkpoint.exemptionReason !== "no_provider_copy_evidenced";
}

function isCompleteOrApprovedExemption(checkpoint: TenantDeletionCheckpointInput): boolean {
  return (checkpoint.status === "complete" && checkpoint.exemptionReason == null && checkpoint.exemptionApproved !== true)
    || isValidTenantDeletionExemption(checkpoint);
}

export function canEnterTenantDeletionPrimaryDeleted(input: Pick<TenantDeletionTransitionInput, "checkpoints">): boolean {
  return hasCanonicalTenantDeletionCheckpointSet(input.checkpoints)
    && input.checkpoints.every((checkpoint) => checkpoint.status !== "exempted" || isValidTenantDeletionExemption(checkpoint))
    && input.checkpoints.filter((checkpoint) => checkpoint.required && checkpoint.store !== "backup_aging").every(isCompleteOrApprovedExemption);
}

export function canEnterTenantDeletionCompleted(input: Pick<TenantDeletionTransitionInput, "checkpoints">): boolean {
  return canEnterTenantDeletionPrimaryDeleted(input)
    && input.checkpoints.filter((checkpoint) => checkpoint.required && checkpoint.store === "backup_aging").every(isCompleteOrApprovedExemption);
}

export function validateTenantDeletionTransition(input: TenantDeletionTransitionInput): string | null {
  if (!Number.isFinite(input.retryCount) || !Number.isInteger(input.retryCount)
    || !Number.isFinite(input.maxRetries) || !Number.isInteger(input.maxRetries)
    || input.retryCount < 0 || input.maxRetries < 0
    || input.retryCount > input.maxRetries || input.maxRetries > TENANT_DELETION_MAX_RETRIES) return "retry_bound_exceeded";
  if (!isTenantDeletionTransitionAllowed(input.from, input.to)) return "invalid_state_transition";
  if (input.to === "canceled" && (
    input.freezeHandoffStatus !== "not_started" ||
    input.accessRevocationHandoffStatus !== "not_started" ||
    input.checkpoints.some((checkpoint) => checkpoint.status !== "pending")
  )) return "cancel_window_closed";
  if (input.to === "retry_wait" && input.retryCount < 1) return "retry_bound_exceeded";
  if (input.to === "primary_deleted" && !canEnterTenantDeletionPrimaryDeleted(input)) return "primary_checkpoints_incomplete";
  if (input.to === "completed" && !canEnterTenantDeletionCompleted(input)) return "completion_checkpoints_incomplete";
  return null;
}

export function validateTenantDeletionCheckpointTransition(
  from: TenantDeletionCheckpointStatus,
  to: TenantDeletionCheckpointStatus,
  checkpoint: TenantDeletionCheckpointInput,
): string | null {
  if (!isTenantDeletionCheckpointTransitionAllowed(from, to)) return "invalid_checkpoint_transition";
  if (to === "complete" && (checkpoint.exemptionReason !== null && checkpoint.exemptionReason !== undefined)) return "complete_cannot_have_exemption";
  if (to === "exempted" && !isValidTenantDeletionExemption({ ...checkpoint, status: "exempted" })) return "invalid_checkpoint_exemption";
  if (to !== "exempted" && checkpoint.exemptionReason !== null && checkpoint.exemptionReason !== undefined) return "exemption_only_allowed_in_exempted";
  return null;
}

export function tenantDeletionIdempotencyResult(existingInputHash: string, requestedInputHash: string): "replay" | "conflict" {
  return existingInputHash === requestedInputHash ? "replay" : "conflict";
}
