import { createHash } from "node:crypto";
import { getTenantPermissionDecision } from "@/lib/permissions";
import {
  assertTenantPermission,
  TenantAuthorizationError,
  type TenantPolicyEvaluator,
} from "@/lib/tenancy/authorize";
import type { TenantSession } from "@/lib/auth";
import {
  authIdentityIdSchema,
  launchRoleSchema,
  membershipIdSchema,
  membershipStatusSchema,
  sha256HashSchema,
  tenantIdSchema,
  workspaceIdSchema,
} from "@/lib/tenancy/schemas";
import {
  LAUNCH_ROLES,
  MEMBERSHIP_STATUSES,
  type AuthIdentityId,
  type CorrelationId,
  type IdempotencyKey,
  type LaunchRole,
  type MembershipId,
  type MembershipStatus,
  type TenantId,
  type WorkspaceId,
} from "@/lib/tenancy/types";

/**
 * T-031 deliberately owns a narrow repository port.  A production adapter
 * must implement `applyMutation` as one database-transactional operation and
 * must serialize/lock the owner check with the write.  The service never
 * performs a count-then-write owner check.
 */
export interface MembershipRecord {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly authIdentityId: AuthIdentityId | null;
  readonly pendingIdentityRefHash: string | null;
  readonly workspaceId: WorkspaceId | null;
  readonly status: MembershipStatus;
  readonly invitedByMembershipId: MembershipId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoleBindingRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly membershipId: MembershipId;
  readonly role: LaunchRole;
  readonly createdAt: string;
  readonly validFrom: string;
  readonly revokedAt: string | null;
  readonly assignedByMembershipId: MembershipId | null;
  readonly reasonCode: string;
}

export interface MembershipSnapshot {
  readonly membership: MembershipRecord;
  readonly currentRoleBinding: RoleBindingRecord | null;
  readonly roleBindings: readonly RoleBindingRecord[];
}

export interface WorkspaceRecord {
  readonly id: WorkspaceId;
  readonly tenantId: TenantId;
  readonly status: "provisioning" | "active" | "paused" | "archived" | "deletion_pending" | "deleted";
}

export type MembershipMutationRoleChange =
  | { readonly kind: "replace"; readonly role: LaunchRole }
  | { readonly kind: "revoke" }
  | { readonly kind: "keep" };

export interface ApplyMembershipMutationInput {
  readonly targetMembershipId: MembershipId;
  readonly actorMembershipId: MembershipId;
  readonly expectedStatus: readonly MembershipStatus[];
  readonly status?: MembershipStatus;
  readonly workspaceId?: WorkspaceId | null;
  readonly roleChange?: MembershipMutationRoleChange;
  /** If supplied, promotion and target mutation must commit atomically. */
  readonly replacementOwnerMembershipId?: MembershipId;
  readonly reasonCode: string;
  readonly expectedWorkspaceId: WorkspaceId | null;
  readonly expectedCurrentRoleBindingId: string | null;
  readonly expectedCurrentRole: LaunchRole | null;
  /** One trusted operation timestamp captured inside the coordinator callback. */
  readonly effectiveAt: string;
}

type MembershipMutationIntent = Omit<ApplyMembershipMutationInput, "targetMembershipId" | "actorMembershipId" | "expectedStatus" | "expectedWorkspaceId" | "expectedCurrentRoleBindingId" | "expectedCurrentRole" | "effectiveAt">;

export interface ApplyMembershipMutationResult {
  readonly target: MembershipSnapshot;
  readonly replacement: MembershipSnapshot | null;
}

export interface MembershipIdentityLookup {
  readonly snapshot: MembershipSnapshot;
  readonly selectorHash: string;
}

export interface MembershipAdministrationRepository {
  listMemberships(tenantId: TenantId): Promise<readonly MembershipSnapshot[]>;
  getMembership(tenantId: TenantId, membershipId: MembershipId): Promise<MembershipSnapshot | null>;
  findByIdentitySelectorHash(tenantId: TenantId, selectorHash: string): Promise<MembershipIdentityLookup | null>;
  getWorkspace(tenantId: TenantId, workspaceId: WorkspaceId): Promise<WorkspaceRecord | null>;
  createPendingMembership(input: {
    tenantId: TenantId;
    membershipId: MembershipId;
    pendingIdentityRefHash: string;
    workspaceId: WorkspaceId | null;
    invitedByMembershipId: MembershipId;
    role: LaunchRole;
    reasonCode: string;
    effectiveAt: string;
  }): Promise<MembershipSnapshot>;
  applyMutation(
    tenantId: TenantId,
    input: ApplyMembershipMutationInput,
  ): Promise<ApplyMembershipMutationResult>;
}

export interface MembershipAdministrationAuditEvent {
  readonly action: "tenant.membership.mutated";
  readonly tenantId: TenantId;
  readonly operation: MembershipMutationOperation;
  readonly targetMembershipId: MembershipId;
  readonly replacementMembershipId: MembershipId | null;
  readonly actor: {
    readonly authIdentityId: AuthIdentityId;
    readonly membershipId: MembershipId;
    readonly role: LaunchRole;
    readonly roleBindingId: string;
  };
  readonly before: MembershipAuditState | null;
  readonly after: MembershipAuditState;
  readonly replacementBefore: MembershipAuditState | null;
  readonly replacementAfter: MembershipAuditState | null;
  readonly reasonCode: string;
  readonly correlationId: CorrelationId;
  readonly idempotencyKeyHash: string;
  readonly inputHash: string;
}

export interface MembershipAuditState {
  readonly membershipId: MembershipId;
  readonly status: MembershipStatus;
  readonly role: LaunchRole | null;
  readonly workspaceId: WorkspaceId | null;
}

export interface MembershipMutationJournalEntry {
  readonly idempotencyKeyHash: string;
  readonly inputHash: string;
  readonly tenantId: TenantId;
  readonly actorMembershipId: MembershipId;
  readonly actorRoleBindingId: string;
  readonly operation: MembershipMutationOperation;
  readonly targetMembershipId: MembershipId | null;
  readonly replacementMembershipId: MembershipId | null;
  readonly result: MembershipMutationResult;
}

export interface MembershipIdempotencyPort {
  find(idempotencyKeyHash: string): Promise<MembershipMutationJournalEntry | null>;
  reserve(input: {
    readonly idempotencyKeyHash: string;
    readonly inputHash: string;
    readonly tenantId: TenantId;
    readonly actorMembershipId: MembershipId;
    readonly actorRoleBindingId: string;
    readonly operation: MembershipMutationOperation;
    readonly targetMembershipId: MembershipId | null;
    readonly replacementMembershipId: MembershipId | null;
  }): Promise<"reserved" | "completed" | "in_progress" | "conflict">;
  complete(input: {
    readonly idempotencyKeyHash: string;
    readonly inputHash: string;
    readonly tenantId: TenantId;
    readonly actorMembershipId: MembershipId;
    readonly actorRoleBindingId: string;
    readonly operation: MembershipMutationOperation;
    readonly targetMembershipId: MembershipId | null;
    readonly replacementMembershipId: MembershipId | null;
    readonly effectiveAt: string;
    readonly result: MembershipMutationResult;
  }): Promise<void>;
}

export interface MembershipAdministrationTransactionScope {
  readonly repository: MembershipAdministrationRepository;
  readonly idempotency: MembershipIdempotencyPort;
  readonly audit: { append(event: MembershipAdministrationAuditEvent): Promise<void> };
}

export interface MembershipAdministrationTransactionCoordinator {
  run<T>(callback: (scope: MembershipAdministrationTransactionScope) => Promise<T>): Promise<T>;
}

export interface MembershipAdministrationDependencies {
  readonly transactionCoordinator: MembershipAdministrationTransactionCoordinator;
  readonly idFactory: { next(kind: "membership"): MembershipId };
  readonly policyEvaluator?: TenantPolicyEvaluator;
  readonly clock: () => Date;
  readonly hash?: (value: string) => string;
}

export type MembershipMutationOperation =
  | "invite"
  | "assign_role"
  | "assign_workspace"
  | "disable"
  | "reactivate"
  | "revoke"
  | "remove";

export interface MembershipView {
  readonly tenantId: TenantId;
  readonly membershipId: MembershipId;
  readonly status: MembershipStatus;
  readonly role: LaunchRole | null;
  readonly workspaceId: WorkspaceId | null;
}

export interface MembershipHistoryView extends MembershipView {
  readonly roleBindings: readonly {
    readonly id: string;
    readonly role: LaunchRole;
    readonly revokedAt: string | null;
    readonly reasonCode: string;
  }[];
}

export interface MembershipMutationResult {
  readonly code: "OK";
  readonly tenantId: TenantId;
  readonly operation: MembershipMutationOperation;
  readonly membership: MembershipView;
  readonly replacementMembership: MembershipView | null;
}

export type MembershipAdministrationErrorCode =
  | "INVALID_INPUT"
  | "TENANT_SCOPE_REQUIRED"
  | "TENANT_SCOPE_MISMATCH"
  | "WORKSPACE_SCOPE_INVALID"
  | "PERMISSION_DENIED"
  | "POLICY_BLOCKED"
  | "TARGET_NOT_FOUND_OR_FORBIDDEN"
  | "STATE_CONFLICT"
  | "DUPLICATE_PENDING_INVITE"
  | "DUPLICATE_CURRENT_MEMBERSHIP"
  | "IDEMPOTENCY_CONFLICT"
  | "MUTATION_IN_PROGRESS"
  | "OWNER_GUARD"
  | "MALFORMED_REPOSITORY_RESULT"
  | "TRANSACTION_REQUIRED"
  | "TRANSACTION_FAILED";

const SAFE_REASON_CODE = /^[a-z][a-z0-9._-]{2,79}$/;
const SAFE_CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const ROLE_BINDING_REASONS = new Set(["initial_provisioning", "invitation", "role_change", "owner_replacement", "membership_reactivation", "administrative_correction"]);
const MEMBERSHIP_STATUS_SET = new Set<string>(MEMBERSHIP_STATUSES);
const LAUNCH_ROLE_SET = new Set<string>(LAUNCH_ROLES);

export class MembershipAdministrationError extends Error {
  readonly code: MembershipAdministrationErrorCode;
  constructor(code: MembershipAdministrationErrorCode) {
    super(code);
    this.name = "MembershipAdministrationError";
    this.code = code;
  }
}

export interface InvitePendingMemberCommand {
  readonly identitySelectorHash: string;
  readonly role: LaunchRole;
  readonly workspaceId: WorkspaceId | null;
  readonly reasonCode: string;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface AssignMemberRoleCommand {
  readonly membershipId: MembershipId;
  readonly role: LaunchRole;
  readonly replacementOwnerMembershipId?: MembershipId;
  readonly reasonCode: string;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface AssignMemberWorkspaceCommand {
  readonly membershipId: MembershipId;
  /** Null is an explicit tenant-wide assignment. */
  readonly workspaceId: WorkspaceId | null;
  readonly reasonCode: string;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface MembershipStateCommand {
  readonly membershipId: MembershipId;
  readonly replacementOwnerMembershipId?: MembershipId;
  readonly reasonCode: string;
  readonly correlationId: CorrelationId;
  readonly idempotencyKey: IdempotencyKey;
}

export interface TenantMembershipAdministrationService {
  listCurrent(session: TenantSession): Promise<readonly MembershipView[]>;
  listHistory(session: TenantSession): Promise<readonly MembershipHistoryView[]>;
  invitePendingMember(session: TenantSession, command: InvitePendingMemberCommand): Promise<MembershipMutationResult>;
  assignMemberRole(session: TenantSession, command: AssignMemberRoleCommand): Promise<MembershipMutationResult>;
  assignMemberWorkspace(session: TenantSession, command: AssignMemberWorkspaceCommand): Promise<MembershipMutationResult>;
  disableMember(session: TenantSession, command: MembershipStateCommand): Promise<MembershipMutationResult>;
  reactivateMember(session: TenantSession, command: MembershipStateCommand): Promise<MembershipMutationResult>;
  revokeMember(session: TenantSession, command: MembershipStateCommand): Promise<MembershipMutationResult>;
  removeMember(session: TenantSession, command: MembershipStateCommand): Promise<MembershipMutationResult>;
}

export function createTenantMembershipAdministrationService(
  dependencies: MembershipAdministrationDependencies,
): TenantMembershipAdministrationService {
  if (!dependencies?.transactionCoordinator || !callableMember(dependencies.transactionCoordinator, "run")) {
    throw new MembershipAdministrationError("TRANSACTION_REQUIRED");
  }
  if (!dependencies.idFactory || !callableMember(dependencies.idFactory, "next")) {
    throw new MembershipAdministrationError("TRANSACTION_FAILED");
  }
  if (typeof dependencies.clock !== "function") throw new MembershipAdministrationError("TRANSACTION_FAILED");
  const hash = dependencies.hash ?? sha256;

  return {
    async listCurrent(session) {
      await authorize(session, "membership:read", "membership.list.current", dependencies.policyEvaluator);
      return dependencies.transactionCoordinator.run(async (rawScope) => {
        const scope = requireScope(rawScope);
        await assertActor(scope.repository, session, trustedNow(dependencies));
        const records = await scope.repository.listMemberships(validatedTenant(session));
        if (!exactArray(records)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        const result = records.map((record) => {
          const snapshot = validateSnapshot(record, trustedNow(dependencies));
          if (snapshot.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
          return toMembershipView(snapshot);
        }).filter((record) =>
          record.status === "pending" || record.status === "active" || record.status === "suspended" || record.status === "disabled");
        if (!exactArray(result)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        return result;
      });
    },
    async listHistory(session) {
      await authorize(session, "membership:read", "membership.list.history", dependencies.policyEvaluator);
      return dependencies.transactionCoordinator.run(async (rawScope) => {
        const scope = requireScope(rawScope);
        await assertActor(scope.repository, session, trustedNow(dependencies));
        const records = await scope.repository.listMemberships(validatedTenant(session));
        if (!exactArray(records)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        const result = records.map((record) => {
          const snapshot = validateSnapshot(record, trustedNow(dependencies));
          if (snapshot.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
          return toHistoryView(snapshot);
        });
        if (!exactArray(result)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        return result;
      });
    },
    async invitePendingMember(session, command) {
      const input = validateInviteCommand(command);
      assertCapability(session, "membership:invite");
      return runMutation(dependencies, session, "invite", input.idempotencyKey, input, hash, async (scope, hashes) => {
        const operationNow = trustedNow(dependencies);
        const effectiveAt = operationNow.toISOString();
        await assertActor(scope.repository, session, operationNow);
        if (input.workspaceId !== null) await assertActiveWorkspace(scope.repository, session.tenantId, input.workspaceId);
        await authorize(session, "membership:invite", "membership.invite", dependencies.policyEvaluator, input.workspaceId, hashes.inputHash);
        const existing = await scope.repository.findByIdentitySelectorHash(session.tenantId, input.identitySelectorHash);
        if (existing) {
          validateIdentityLookup(existing, operationNow);
          if (existing.selectorHash !== input.identitySelectorHash) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
          const snapshot = validateSnapshot(existing.snapshot, operationNow);
          if (snapshot.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
          if (snapshot.membership.status === "pending") throw new MembershipAdministrationError("DUPLICATE_PENDING_INVITE");
          throw new MembershipAdministrationError("DUPLICATE_CURRENT_MEMBERSHIP");
        }
        const membershipId = validGeneratedId(dependencies.idFactory.next("membership"));
        const after = validateSnapshot(await scope.repository.createPendingMembership({
          tenantId: session.tenantId,
          membershipId,
          pendingIdentityRefHash: input.identitySelectorHash,
          workspaceId: input.workspaceId,
          invitedByMembershipId: session.membershipId,
          role: input.role,
          reasonCode: input.reasonCode,
          effectiveAt,
        }), operationNow);
        if (after.membership.id !== membershipId || after.membership.tenantId !== session.tenantId || after.membership.status !== "pending" || after.membership.authIdentityId !== null || after.membership.pendingIdentityRefHash !== input.identitySelectorHash || after.membership.workspaceId !== input.workspaceId || after.membership.invitedByMembershipId !== session.membershipId || after.membership.createdAt !== effectiveAt || after.membership.updatedAt !== effectiveAt || after.currentRoleBinding === null || after.currentRoleBinding.role !== input.role || after.currentRoleBinding.assignedByMembershipId !== session.membershipId || after.currentRoleBinding.reasonCode !== "invitation" || after.roleBindings.length !== 1 || !sameRoleBinding(after.roleBindings[0], after.currentRoleBinding) || after.currentRoleBinding.revokedAt !== null || after.currentRoleBinding.createdAt !== effectiveAt || after.currentRoleBinding.validFrom !== effectiveAt) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        const result = mutationResult("invite", after, null);
        await appendAudit(scope, session, result, null, hashes, input.reasonCode, input.correlationId);
        await complete(scope, hashes, "invite", result, session, effectiveAt);
        return result;
      });
    },
    async assignMemberRole(session, command) {
      const input = validateRoleCommand(command);
      assertCapability(session, "role:assign");
      return runTargetMutation(dependencies, session, "assign_role", "role:assign", "membership.assign_role", input.idempotencyKey, input, hash, {
        roleChange: { kind: "replace", role: input.role },
        replacementOwnerMembershipId: input.replacementOwnerMembershipId,
        reasonCode: input.reasonCode,
      });
    },
    async assignMemberWorkspace(session, command) {
      const input = validateWorkspaceCommand(command);
      assertCapability(session, "membership:manage");
      return runTargetMutation(dependencies, session, "assign_workspace", "membership:manage", "membership.assign_workspace", input.idempotencyKey, input, hash, {
        workspaceId: input.workspaceId,
        reasonCode: input.reasonCode,
      });
    },
    async disableMember(session, command) {
      const input = validateStateCommand(command);
      assertCapability(session, "membership:manage");
      return runTargetMutation(dependencies, session, "disable", "membership:manage", "membership.disable", input.idempotencyKey, input, hash, {
        status: "disabled",
        replacementOwnerMembershipId: input.replacementOwnerMembershipId,
        reasonCode: input.reasonCode,
      });
    },
    async reactivateMember(session, command) {
      const input = validateStateCommand(command);
      assertCapability(session, "membership:manage");
      return runTargetMutation(dependencies, session, "reactivate", "membership:manage", "membership.reactivate", input.idempotencyKey, input, hash, {
        status: "active",
        replacementOwnerMembershipId: input.replacementOwnerMembershipId,
        reasonCode: input.reasonCode,
      });
    },
    async revokeMember(session, command) {
      const input = validateStateCommand(command);
      assertCapability(session, "membership:manage");
      return runTargetMutation(dependencies, session, "revoke", "membership:manage", "membership.revoke", input.idempotencyKey, input, hash, {
        status: "revoked",
        roleChange: { kind: "revoke" },
        replacementOwnerMembershipId: input.replacementOwnerMembershipId,
        reasonCode: input.reasonCode,
      });
    },
    async removeMember(session, command) {
      const input = validateStateCommand(command);
      assertCapability(session, "membership:manage");
      return runTargetMutation(dependencies, session, "remove", "membership:manage", "membership.remove", input.idempotencyKey, input, hash, {
        status: "removed",
        roleChange: { kind: "revoke" },
        replacementOwnerMembershipId: input.replacementOwnerMembershipId,
        reasonCode: input.reasonCode,
      });
    },
  };
}

/** Short alias for callers using the T-031 task name. */
export const createTenantMembershipService = createTenantMembershipAdministrationService;

async function authorize(
  session: TenantSession,
  permission: string,
  action: string,
  policyEvaluator: TenantPolicyEvaluator | undefined,
  workspaceId?: WorkspaceId | null,
  resourceId?: string,
): Promise<void> {
  try {
    const resource = resourceId
      ? { tenantId: session.tenantId, workspaceId: workspaceId ?? null, resourceId, resourceType: "tenant_membership" }
      : undefined;
    await assertTenantPermission(session, permission, {
      action,
      policyEvaluator,
      ...(resource ? { resource, scopeClass: "workspace-optional" as const } : {}),
    });
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      if (error.code === "POLICY_BLOCKED") throw new MembershipAdministrationError("POLICY_BLOCKED");
      if (error.code === "WORKSPACE_SCOPE_INVALID") throw new MembershipAdministrationError("WORKSPACE_SCOPE_INVALID");
      if (error.code === "TENANT_SCOPE_MISMATCH") throw new MembershipAdministrationError("TENANT_SCOPE_MISMATCH");
      if (error.code === "PERMISSION_DENIED" || error.code === "ROLE_REQUIRED") throw new MembershipAdministrationError("PERMISSION_DENIED");
      throw new MembershipAdministrationError("TENANT_SCOPE_REQUIRED");
    }
    throw new MembershipAdministrationError("POLICY_BLOCKED");
  }
}

function assertCapability(session: TenantSession, permission: string): void {
  const decision = getTenantPermissionDecision(session.role, permission);
  if (!decision.allowed) throw new MembershipAdministrationError("PERMISSION_DENIED");
}

async function runTargetMutation(
  dependencies: MembershipAdministrationDependencies,
  session: TenantSession,
  operation: Exclude<MembershipMutationOperation, "invite">,
  permission: string,
  action: string,
  idempotencyKey: string,
  input: object,
  hash: (value: string) => string,
  mutation: MembershipMutationIntent,
): Promise<MembershipMutationResult> {
  const targetMembershipId = (input as { membershipId: MembershipId }).membershipId;
  return runMutation(dependencies, session, operation, idempotencyKey, input, hash, async (scope, hashes) => {
    const operationNow = trustedNow(dependencies);
    const effectiveAt = operationNow.toISOString();
    const actor = await assertActor(scope.repository, session, operationNow);
    const before = requiredSnapshot(await scope.repository.getMembership(session.tenantId, targetMembershipId), operationNow, "TARGET_NOT_FOUND_OR_FORBIDDEN");
    if (before.membership.id !== targetMembershipId || before.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    await authorize(session, permission, action, dependencies.policyEvaluator, before.membership.workspaceId, targetMembershipId);
    const requestedWorkspace = "workspaceId" in mutation ? mutation.workspaceId : undefined;
    if (requestedWorkspace !== undefined && requestedWorkspace !== null) {
      await assertActiveWorkspace(scope.repository, session.tenantId, requestedWorkspace);
      await authorize(session, permission, action, dependencies.policyEvaluator, requestedWorkspace, targetMembershipId);
    }
    if (before.membership.id === actor.membership.id && operation === "reactivate" && before.membership.status !== "disabled") {
      throw new MembershipAdministrationError("STATE_CONFLICT");
    }
    if (operation === "reactivate" && (before.membership.status !== "disabled" || before.currentRoleBinding === null || before.membership.authIdentityId === null)) {
      throw new MembershipAdministrationError("STATE_CONFLICT");
    }
    if (operation === "disable" && before.membership.status !== "active") throw new MembershipAdministrationError("STATE_CONFLICT");
    if (operation === "assign_role" && !["active", "pending"].includes(before.membership.status)) throw new MembershipAdministrationError("STATE_CONFLICT");
    if (operation === "assign_workspace" && !["active", "pending"].includes(before.membership.status)) throw new MembershipAdministrationError("STATE_CONFLICT");
    if ((operation === "revoke" || operation === "remove") && ["revoked", "removed", "expired"].includes(before.membership.status)) throw new MembershipAdministrationError("STATE_CONFLICT");
    const replacementId = mutation.replacementOwnerMembershipId;
    let replacementBefore: MembershipSnapshot | null = null;
    if (replacementId !== undefined) {
      if (replacementId === targetMembershipId) throw new MembershipAdministrationError("OWNER_GUARD");
      const replacement = requiredSnapshot(await scope.repository.getMembership(session.tenantId, replacementId), operationNow, "OWNER_GUARD");
      if (replacement.membership.tenantId !== session.tenantId || replacement.membership.id !== replacementId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
      if (replacement.membership.status !== "active" || replacement.membership.id === targetMembershipId || replacement.currentRoleBinding === null || replacement.currentRoleBinding.role === "owner") throw new MembershipAdministrationError("OWNER_GUARD");
      replacementBefore = replacement;
    }
    const ownerTransition = before.membership.status === "active" && before.currentRoleBinding?.role === "owner" && (
      (operation === "assign_role" && mutation.roleChange?.kind === "replace" && mutation.roleChange.role !== "owner") ||
      operation === "disable" || operation === "revoke" || operation === "remove"
    );
    if (replacementId !== undefined && !ownerTransition) throw new MembershipAdministrationError("OWNER_GUARD");
    if (operation === "assign_role" && mutation.roleChange?.kind === "replace" && before.currentRoleBinding?.role === mutation.roleChange.role) throw new MembershipAdministrationError("STATE_CONFLICT");
    if (operation === "assign_workspace" && before.membership.workspaceId === mutation.workspaceId) throw new MembershipAdministrationError("STATE_CONFLICT");
    const applied = await scope.repository.applyMutation(session.tenantId, {
      ...mutation,
      targetMembershipId,
      actorMembershipId: actor.membership.id,
      expectedStatus: [before.membership.status],
      expectedWorkspaceId: before.membership.workspaceId,
      expectedCurrentRoleBindingId: before.currentRoleBinding?.id ?? null,
      expectedCurrentRole: before.currentRoleBinding?.role ?? null,
      effectiveAt,
    });
    if (!applied || !exactKeys(applied, ["target", "replacement"])) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    const after = validateSnapshot(applied.target, operationNow);
    const replacement = applied.replacement === null ? null : validateSnapshot(applied.replacement, operationNow);
    if (after.membership.id !== targetMembershipId || after.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    if (replacement && replacement.membership.tenantId !== session.tenantId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    validateMutationEffects(operation, actor, before, after, replacement, replacementBefore, mutation, targetMembershipId, replacementId, effectiveAt);
    const result = mutationResult(operation, after, replacement);
    await appendAudit(scope, session, result, auditState(before), hashes, mutation.reasonCode, (input as { correlationId: CorrelationId }).correlationId, replacementBefore ? auditState(replacementBefore) : null);
    await complete(scope, hashes, operation, result, session, effectiveAt);
    return result;
  });
}

async function runMutation<T extends MembershipMutationResult>(
  dependencies: MembershipAdministrationDependencies,
  session: TenantSession,
  operation: MembershipMutationOperation,
  idempotencyKey: string,
  input: object,
  hash: (value: string) => string,
  work: (scope: MembershipAdministrationTransactionScope, hashes: { idempotencyKeyHash: string; inputHash: string }) => Promise<T>,
): Promise<T> {
  const normalizedCommand = normalizeCommand(operation, input);
  const targetMembershipId = operation === "invite" ? null : normalizedCommand.membershipId as MembershipId;
  const replacementMembershipId = operation === "invite" ? null : (normalizedCommand.replacementOwnerMembershipId as MembershipId | null);
  let idempotencyKeyHash: string;
  let inputHash: string;
  try {
    idempotencyKeyHash = validatedHash(hash(JSON.stringify({ tenantId: session.tenantId, actorMembershipId: session.membershipId, actorRoleBindingId: session.roleBindingId, operation, key: idempotencyKey })));
    inputHash = validatedHash(hash(JSON.stringify({
      tenantId: session.tenantId,
      actorMembershipId: session.membershipId,
      actorRoleBindingId: session.roleBindingId,
      actorRole: session.role,
      operation,
      command: normalizedCommand,
    })));
  } catch (error) {
    if (error instanceof MembershipAdministrationError) throw error;
    throw new MembershipAdministrationError("TRANSACTION_FAILED");
  }
  try {
    return await dependencies.transactionCoordinator.run(async (rawScope) => {
      const scope = requireScope(rawScope);
      await assertActor(scope.repository, session, trustedNow(dependencies));
      const prior = await scope.idempotency.find(idempotencyKeyHash);
      if (prior !== null) {
        validateJournalEntry(prior, { idempotencyKeyHash, inputHash, tenantId: session.tenantId, actorMembershipId: session.membershipId, actorRoleBindingId: session.roleBindingId, operation, targetMembershipId, replacementMembershipId });
        const result = validateMutationResult(prior.result, operation, session.tenantId, targetMembershipId, replacementMembershipId, normalizedCommand);
        await authorizeReplay(scope.repository, session, operation, normalizedCommand, result, inputHash, dependencies.policyEvaluator, dependencies);
        return result as T;
      }
      const reservation = await scope.idempotency.reserve({ idempotencyKeyHash, inputHash, tenantId: session.tenantId, actorMembershipId: session.membershipId, actorRoleBindingId: session.roleBindingId, operation, targetMembershipId, replacementMembershipId });
      if (reservation === "completed") {
        const completed = await scope.idempotency.find(idempotencyKeyHash);
        if (!completed) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
        validateJournalEntry(completed, { idempotencyKeyHash, inputHash, tenantId: session.tenantId, actorMembershipId: session.membershipId, actorRoleBindingId: session.roleBindingId, operation, targetMembershipId, replacementMembershipId });
        const result = validateMutationResult(completed.result, operation, session.tenantId, targetMembershipId, replacementMembershipId, normalizedCommand);
        await authorizeReplay(scope.repository, session, operation, normalizedCommand, result, inputHash, dependencies.policyEvaluator, dependencies);
        return result as T;
      }
      if (reservation === "conflict") throw new MembershipAdministrationError("IDEMPOTENCY_CONFLICT");
      if (reservation === "in_progress") throw new MembershipAdministrationError("MUTATION_IN_PROGRESS");
      if (reservation !== "reserved") throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
      return work(scope, { idempotencyKeyHash, inputHash });
    });
  } catch (error) {
    if (error instanceof MembershipAdministrationError) throw error;
    throw new MembershipAdministrationError("TRANSACTION_FAILED");
  }
}

async function complete(scope: MembershipAdministrationTransactionScope, hashes: { idempotencyKeyHash: string; inputHash: string }, operation: MembershipMutationOperation, result: MembershipMutationResult, session: TenantSession, effectiveAt: string): Promise<void> {
  await scope.idempotency.complete({ ...hashes, tenantId: session.tenantId, actorMembershipId: session.membershipId, actorRoleBindingId: session.roleBindingId, operation, targetMembershipId: result.membership.membershipId, replacementMembershipId: result.replacementMembership?.membershipId ?? null, effectiveAt, result });
}

type NormalizedMutationCommand = Readonly<Record<string, unknown>>;

function normalizeCommand(operation: MembershipMutationOperation, input: object): NormalizedMutationCommand {
  const command = input as Record<string, unknown>;
  if (operation === "invite") return {
    identitySelectorHash: command.identitySelectorHash,
    role: command.role,
    workspaceId: command.workspaceId,
    reasonCode: command.reasonCode,
    correlationId: command.correlationId,
  };
  if (operation === "assign_role") return {
    membershipId: command.membershipId,
    role: command.role,
    replacementOwnerMembershipId: command.replacementOwnerMembershipId ?? null,
    reasonCode: command.reasonCode,
    correlationId: command.correlationId,
  };
  if (operation === "assign_workspace") return {
    membershipId: command.membershipId,
    workspaceId: command.workspaceId,
    reasonCode: command.reasonCode,
    correlationId: command.correlationId,
  };
  return {
    membershipId: command.membershipId,
    replacementOwnerMembershipId: command.replacementOwnerMembershipId ?? null,
    reasonCode: command.reasonCode,
    correlationId: command.correlationId,
  };
}

function validateJournalEntry(
  value: MembershipMutationJournalEntry,
  expected: {
    idempotencyKeyHash: string;
    inputHash: string;
    tenantId: TenantId;
    actorMembershipId: MembershipId;
    actorRoleBindingId: string;
    operation: MembershipMutationOperation;
    targetMembershipId: MembershipId | null;
    replacementMembershipId: MembershipId | null;
  },
): void {
  if (!value || !exactKeys(value, ["idempotencyKeyHash", "inputHash", "tenantId", "actorMembershipId", "actorRoleBindingId", "operation", "targetMembershipId", "replacementMembershipId", "result"]) || !sha256HashSchema.safeParse(value.idempotencyKeyHash).success || !sha256HashSchema.safeParse(value.inputHash).success || !tenantIdSchema.safeParse(value.tenantId).success || !membershipIdSchema.safeParse(value.actorMembershipId).success || !membershipIdSchema.safeParse(value.actorRoleBindingId).success || value.idempotencyKeyHash !== expected.idempotencyKeyHash || value.inputHash !== expected.inputHash || value.tenantId !== expected.tenantId || value.actorMembershipId !== expected.actorMembershipId || value.actorRoleBindingId !== expected.actorRoleBindingId || value.operation !== expected.operation || (expected.replacementMembershipId !== value.replacementMembershipId)) throw new MembershipAdministrationError("IDEMPOTENCY_CONFLICT");
  if (expected.targetMembershipId !== null && value.targetMembershipId !== expected.targetMembershipId) throw new MembershipAdministrationError("IDEMPOTENCY_CONFLICT");
  if (expected.targetMembershipId === null && (value.targetMembershipId !== null && !membershipIdSchema.safeParse(value.targetMembershipId).success)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (expected.targetMembershipId === null && (!value.result || typeof value.result !== "object" || !value.result.membership || value.targetMembershipId === null || value.targetMembershipId !== value.result.membership.membershipId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
}

async function authorizeReplay(
  repository: MembershipAdministrationRepository,
  session: TenantSession,
  operation: MembershipMutationOperation,
  command: NormalizedMutationCommand,
  result: MembershipMutationResult,
  inputHash: string,
  policyEvaluator: TenantPolicyEvaluator | undefined,
  dependencies: MembershipAdministrationDependencies,
): Promise<void> {
  if (operation === "invite") {
    const workspaceId = command.workspaceId as WorkspaceId | null;
    if (workspaceId !== null) await assertActiveWorkspace(repository, session.tenantId, workspaceId);
    await authorize(session, "membership:invite", "membership.invite", policyEvaluator, workspaceId, inputHash);
    return;
  }
  const targetMembershipId = command.membershipId as MembershipId;
  const current = await repository.getMembership(session.tenantId, targetMembershipId);
  const target = current ? validateSnapshot(current, trustedNow(dependencies)) : null;
  if (target && (target.membership.id !== targetMembershipId || target.membership.tenantId !== session.tenantId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  const workspaceId = target?.membership.workspaceId ?? result.membership.workspaceId;
  await authorize(session, operation === "assign_role" ? "role:assign" : "membership:manage", `membership.${operation}`, policyEvaluator, workspaceId, targetMembershipId);
  if (operation === "assign_workspace" && command.workspaceId !== null) {
    await assertActiveWorkspace(repository, session.tenantId, command.workspaceId as WorkspaceId);
    await authorize(session, "membership:manage", "membership.assign_workspace", policyEvaluator, command.workspaceId as WorkspaceId, targetMembershipId);
  }
}

async function appendAudit(
  scope: MembershipAdministrationTransactionScope,
  session: TenantSession,
  result: MembershipMutationResult,
  before: MembershipAuditState | null,
  hashes: { idempotencyKeyHash: string; inputHash: string },
  reasonCode: string,
  correlationId: CorrelationId,
  replacementBefore: MembershipAuditState | null = null,
): Promise<void> {
  await scope.audit.append({
    action: "tenant.membership.mutated",
    tenantId: session.tenantId,
    operation: result.operation,
    targetMembershipId: result.membership.membershipId,
    replacementMembershipId: result.replacementMembership?.membershipId ?? null,
    actor: { authIdentityId: session.userId, membershipId: session.membershipId, role: session.role, roleBindingId: session.roleBindingId },
    before,
     after: auditStateFromView(result.membership),
    replacementBefore,
     replacementAfter: result.replacementMembership ? auditStateFromView(result.replacementMembership) : null,
    reasonCode,
    correlationId,
    idempotencyKeyHash: hashes.idempotencyKeyHash,
    inputHash: hashes.inputHash,
  });
}

async function assertActor(repository: MembershipAdministrationRepository, session: TenantSession, now: Date): Promise<MembershipSnapshot> {
  const actor = requiredSnapshot(await repository.getMembership(validatedTenant(session), session.membershipId), now, "TENANT_SCOPE_REQUIRED");
  if (
    actor.membership.id !== session.membershipId ||
    actor.membership.tenantId !== session.tenantId ||
    actor.membership.status !== "active" ||
    actor.membership.authIdentityId !== session.userId ||
    actor.currentRoleBinding === null ||
    actor.currentRoleBinding.id !== session.roleBindingId ||
    actor.currentRoleBinding.role !== session.role
  ) throw new MembershipAdministrationError("TENANT_SCOPE_REQUIRED");
  return actor;
}

function requiredSnapshot(value: MembershipSnapshot | null, now: Date, code: "TARGET_NOT_FOUND_OR_FORBIDDEN" | "OWNER_GUARD" | "TENANT_SCOPE_REQUIRED"): MembershipSnapshot {
  if (!value) throw new MembershipAdministrationError(code);
  return validateSnapshot(value, now);
}

async function assertActiveWorkspace(repository: MembershipAdministrationRepository, tenantId: TenantId, workspaceId: WorkspaceId): Promise<void> {
  const workspace = await repository.getWorkspace(tenantId, workspaceId);
  if (!workspace || !exactKeys(workspace, ["id", "tenantId", "status"]) || !workspaceIdSchema.safeParse(workspace.id).success || !tenantIdSchema.safeParse(workspace.tenantId).success || workspace.tenantId !== tenantId || workspace.id !== workspaceId || !["provisioning", "active", "paused", "archived", "deletion_pending", "deleted"].includes(workspace.status) || workspace.status !== "active") throw new MembershipAdministrationError("WORKSPACE_SCOPE_INVALID");
}

function requireScope(scope: MembershipAdministrationTransactionScope): MembershipAdministrationTransactionScope {
  if (!exactKeys(scope, ["repository", "idempotency", "audit"])) throw new MembershipAdministrationError("TRANSACTION_REQUIRED");
  if (!scope.repository || !scope.idempotency || !scope.audit || !callableMember(scope.repository, "listMemberships") || !callableMember(scope.repository, "getMembership") || !callableMember(scope.repository, "findByIdentitySelectorHash") || !callableMember(scope.repository, "getWorkspace") || !callableMember(scope.repository, "createPendingMembership") || !callableMember(scope.repository, "applyMutation") || !callableMember(scope.idempotency, "find") || !callableMember(scope.idempotency, "reserve") || !callableMember(scope.idempotency, "complete") || !callableMember(scope.audit, "append")) throw new MembershipAdministrationError("TRANSACTION_REQUIRED");
  return scope;
}

function callableMember(value: unknown, name: string): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  try {
    let current: object | null = value as object;
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor) return "value" in descriptor && typeof descriptor.value === "function";
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return false;
  }
  return false;
}

function trustedNow(dependencies: MembershipAdministrationDependencies): Date {
  const now = dependencies.clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new MembershipAdministrationError("TRANSACTION_FAILED");
  return now;
}

function validatedHash(value: unknown): string {
  if (!sha256HashSchema.safeParse(value).success) throw new MembershipAdministrationError("TRANSACTION_FAILED");
  return value as string;
}

function validatedTenant(session: TenantSession): TenantId {
  if (!tenantIdSchema.safeParse(session.tenantId).success) throw new MembershipAdministrationError("TENANT_SCOPE_REQUIRED");
  return session.tenantId;
}

function validateInviteCommand(command: InvitePendingMemberCommand): InvitePendingMemberCommand {
  if (!exactCommandRecord(command, ["identitySelectorHash", "role", "workspaceId", "reasonCode", "correlationId", "idempotencyKey"], []) || !sha256HashSchema.safeParse(command.identitySelectorHash).success || !launchRoleSchema.safeParse(command.role).success || (command.workspaceId !== null && !workspaceIdSchema.safeParse(command.workspaceId).success) || !validReasonAndCorrelation(command.reasonCode, command.correlationId, command.idempotencyKey)) throw new MembershipAdministrationError("INVALID_INPUT");
  return command;
}

function validateRoleCommand(command: AssignMemberRoleCommand): AssignMemberRoleCommand {
  if (!exactCommandRecord(command, ["membershipId", "role", "reasonCode", "correlationId", "idempotencyKey"], ["replacementOwnerMembershipId"]) || !membershipIdSchema.safeParse(command.membershipId).success || !launchRoleSchema.safeParse(command.role).success || (hasOwn(command, "replacementOwnerMembershipId") && !membershipIdSchema.safeParse(command.replacementOwnerMembershipId).success) || !validReasonAndCorrelation(command.reasonCode, command.correlationId, command.idempotencyKey)) throw new MembershipAdministrationError("INVALID_INPUT");
  return command;
}

function validateWorkspaceCommand(command: AssignMemberWorkspaceCommand): AssignMemberWorkspaceCommand {
  if (!exactCommandRecord(command, ["membershipId", "workspaceId", "reasonCode", "correlationId", "idempotencyKey"], []) || !membershipIdSchema.safeParse(command.membershipId).success || (command.workspaceId !== null && !workspaceIdSchema.safeParse(command.workspaceId).success) || !validReasonAndCorrelation(command.reasonCode, command.correlationId, command.idempotencyKey)) throw new MembershipAdministrationError("INVALID_INPUT");
  return command;
}

function validateStateCommand(command: MembershipStateCommand): MembershipStateCommand {
  if (!exactCommandRecord(command, ["membershipId", "reasonCode", "correlationId", "idempotencyKey"], ["replacementOwnerMembershipId"]) || !membershipIdSchema.safeParse(command.membershipId).success || (hasOwn(command, "replacementOwnerMembershipId") && !membershipIdSchema.safeParse(command.replacementOwnerMembershipId).success) || !validReasonAndCorrelation(command.reasonCode, command.correlationId, command.idempotencyKey)) throw new MembershipAdministrationError("INVALID_INPUT");
  return command;
}

function validReasonAndCorrelation(reasonCode: unknown, correlationId: unknown, idempotencyKey: unknown): boolean {
  return typeof reasonCode === "string" && SAFE_REASON_CODE.test(reasonCode) && typeof correlationId === "string" && SAFE_CORRELATION.test(correlationId) && typeof idempotencyKey === "string" && SAFE_IDEMPOTENCY.test(idempotencyKey);
}

function validateSnapshot(value: MembershipSnapshot | null, now: Date): MembershipSnapshot {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (!value || !exactKeys(value, ["membership", "currentRoleBinding", "roleBindings"]) || !value.membership || !exactKeys(value.membership, ["id", "tenantId", "authIdentityId", "pendingIdentityRefHash", "workspaceId", "status", "invitedByMembershipId", "createdAt", "updatedAt"]) || !membershipIdSchema.safeParse(value.membership.id).success || !tenantIdSchema.safeParse(value.membership.tenantId).success || (value.membership.authIdentityId !== null && !authIdentityIdSchema.safeParse(value.membership.authIdentityId).success) || (value.membership.pendingIdentityRefHash !== null && !sha256HashSchema.safeParse(value.membership.pendingIdentityRefHash).success) || (value.membership.authIdentityId !== null && value.membership.pendingIdentityRefHash !== null) || (value.membership.workspaceId !== null && !workspaceIdSchema.safeParse(value.membership.workspaceId).success) || !membershipStatusSchema.safeParse(value.membership.status).success || (value.membership.invitedByMembershipId !== null && !membershipIdSchema.safeParse(value.membership.invitedByMembershipId).success) || timestampMillis(value.membership.createdAt) === null || timestampMillis(value.membership.updatedAt) === null || timestampMillis(value.membership.createdAt)! > timestampMillis(value.membership.updatedAt)! || timestampMillis(value.membership.updatedAt)! > now.getTime() || !exactArray(value.roleBindings, (binding) => validateRoleBinding(binding as RoleBindingRecord, now))) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (value.currentRoleBinding !== null && !validateRoleBinding(value.currentRoleBinding, now)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (value.currentRoleBinding && (value.currentRoleBinding.tenantId !== value.membership.tenantId || value.currentRoleBinding.membershipId !== value.membership.id)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (value.roleBindings.some((binding) => binding.tenantId !== value.membership.tenantId || binding.membershipId !== value.membership.id)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (value.currentRoleBinding && (value.currentRoleBinding.revokedAt !== null || value.currentRoleBinding.membershipId !== value.membership.id)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  const currentBindings = value.roleBindings.filter((binding) => binding.revokedAt === null);
  if (currentBindings.length > 1) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (value.currentRoleBinding === null) {
    if (currentBindings.length !== 0) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  } else {
    if (currentBindings.length !== 1 || !sameRoleBinding(currentBindings[0], value.currentRoleBinding)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  }
  if (new Set(value.roleBindings.map((binding) => binding.id)).size !== value.roleBindings.length) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  return value;
}

function validateRoleBinding(value: RoleBindingRecord, now: Date): boolean {
  if (!value || !exactKeys(value, ["id", "tenantId", "membershipId", "role", "createdAt", "validFrom", "revokedAt", "assignedByMembershipId", "reasonCode"])) return false;
  const createdAt = timestampMillis(value.createdAt);
  const validFrom = timestampMillis(value.validFrom);
  const revokedAt = value.revokedAt === null ? null : (timestampMillis(value.revokedAt) ?? undefined);
  return membershipIdSchema.safeParse(value.id).success && tenantIdSchema.safeParse(value.tenantId).success && membershipIdSchema.safeParse(value.membershipId).success && launchRoleSchema.safeParse(value.role).success && createdAt !== null && validFrom !== null && createdAt <= validFrom && validFrom <= now.getTime() && revokedAt !== undefined && (revokedAt === null || (revokedAt >= validFrom && revokedAt <= now.getTime())) && (value.assignedByMembershipId === null || membershipIdSchema.safeParse(value.assignedByMembershipId).success) && typeof value.reasonCode === "string" && ROLE_BINDING_REASONS.has(value.reasonCode);
}

function timestampMillis(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  try {
    return new Date(parsed).toISOString() === value ? parsed : null;
  } catch {
    return null;
  }
}

function validateIdentityLookup(value: MembershipIdentityLookup, now: Date): void {
  if (!value || !exactKeys(value, ["snapshot", "selectorHash"]) || !sha256HashSchema.safeParse(value.selectorHash).success) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  validateSnapshot(value.snapshot, now);
}

function sameRoleBinding(left: RoleBindingRecord, right: RoleBindingRecord): boolean {
  return left.id === right.id && left.tenantId === right.tenantId && left.membershipId === right.membershipId && left.role === right.role && left.createdAt === right.createdAt && left.validFrom === right.validFrom && left.revokedAt === right.revokedAt && left.assignedByMembershipId === right.assignedByMembershipId && left.reasonCode === right.reasonCode;
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  const actual = ownDataKeys(value);
  if (!actual) return false;
  const wanted = [...expected].sort();
  actual.sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function ownDataKeys(value: unknown): string[] | null {
  if (value === null || typeof value !== "object") return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    const strings: string[] = [];
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) return null;
      strings.push(key);
    }
    return strings;
  } catch {
    return null;
  }
}

function exactCommandRecord(value: unknown, required: readonly string[], optional: readonly string[]): value is Record<string, unknown> {
  const keys = ownDataKeys(value);
  if (!keys) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactArray<T = unknown>(value: unknown, itemValidator?: (item: unknown) => boolean): value is readonly T[] {
  if (!Array.isArray(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || lengthDescriptor.enumerable || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return false;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) return false;
    for (const key of keys) {
      if (typeof key === "symbol") return false;
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) return false;
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || (itemValidator && !itemValidator(descriptor.value))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function toMembershipView(snapshot: MembershipSnapshot): MembershipView {
  return { tenantId: snapshot.membership.tenantId, membershipId: snapshot.membership.id, status: snapshot.membership.status, role: snapshot.currentRoleBinding?.role ?? null, workspaceId: snapshot.membership.workspaceId };
}

function toHistoryView(snapshot: MembershipSnapshot): MembershipHistoryView {
  const roleBindings = snapshot.roleBindings.map((binding) => ({ id: binding.id, role: binding.role, revokedAt: binding.revokedAt, reasonCode: binding.reasonCode }));
  if (!exactArray(roleBindings)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  return { ...toMembershipView(snapshot), roleBindings };
}

function auditState(snapshot: MembershipSnapshot): MembershipAuditState {
  return { membershipId: snapshot.membership.id, status: snapshot.membership.status, role: snapshot.currentRoleBinding?.role ?? null, workspaceId: snapshot.membership.workspaceId };
}

function auditStateFromView(view: MembershipView): MembershipAuditState {
  return { membershipId: view.membershipId, status: view.status, role: view.role, workspaceId: view.workspaceId };
}

function mutationResult(operation: MembershipMutationOperation, target: MembershipSnapshot, replacement: MembershipSnapshot | null): MembershipMutationResult {
  return { code: "OK", tenantId: target.membership.tenantId, operation, membership: toMembershipView(target), replacementMembership: replacement ? toMembershipView(replacement) : null };
}

function validateMutationResult(value: MembershipMutationResult, operation: MembershipMutationOperation, tenantId: TenantId, targetMembershipId: MembershipId | null, replacementMembershipId: MembershipId | null, command: NormalizedMutationCommand): MembershipMutationResult {
  if (!value || !exactKeys(value, ["code", "tenantId", "operation", "membership", "replacementMembership"]) || value.code !== "OK" || value.tenantId !== tenantId || value.operation !== operation || !value.membership || !exactKeys(value.membership, ["tenantId", "membershipId", "status", "role", "workspaceId"]) || value.membership.tenantId !== tenantId || (targetMembershipId !== null && value.membership.membershipId !== targetMembershipId) || !membershipIdSchema.safeParse(value.membership.membershipId).success || !MEMBERSHIP_STATUS_SET.has(value.membership.status) || (value.membership.role !== null && !LAUNCH_ROLE_SET.has(value.membership.role)) || (value.membership.workspaceId !== null && !workspaceIdSchema.safeParse(value.membership.workspaceId).success) || (replacementMembershipId === null && value.replacementMembership !== null) || (replacementMembershipId !== null && (!value.replacementMembership || !exactKeys(value.replacementMembership, ["tenantId", "membershipId", "status", "role", "workspaceId"]) || value.replacementMembership.tenantId !== tenantId || value.replacementMembership.membershipId !== replacementMembershipId || value.replacementMembership.status !== "active" || value.replacementMembership.role !== "owner" || (value.replacementMembership.workspaceId !== null && !workspaceIdSchema.safeParse(value.replacementMembership.workspaceId).success)))) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "invite" && (value.membership.status !== "pending" || value.membership.role !== command.role || value.membership.workspaceId !== command.workspaceId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "assign_role" && value.membership.role !== command.role) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "assign_workspace" && value.membership.workspaceId !== command.workspaceId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "disable" && value.membership.status !== "disabled") throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "reactivate" && value.membership.status !== "active") throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if ((operation === "revoke" || operation === "remove") && value.membership.status !== (operation === "revoke" ? "revoked" : "removed")) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if ((operation === "revoke" || operation === "remove") && value.membership.role !== null) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  return value;
}

function validGeneratedId(value: unknown): MembershipId {
  if (!membershipIdSchema.safeParse(value).success) throw new MembershipAdministrationError("TRANSACTION_FAILED");
  return value as MembershipId;
}

function validateMutationEffects(
  operation: Exclude<MembershipMutationOperation, "invite">,
  actor: MembershipSnapshot,
  before: MembershipSnapshot,
  after: MembershipSnapshot,
  replacement: MembershipSnapshot | null,
  replacementBefore: MembershipSnapshot | null,
  mutation: MembershipMutationIntent,
  targetMembershipId: MembershipId,
  requestedReplacementId: MembershipId | undefined,
  effectiveAt: string,
): void {
  if (after.membership.id !== targetMembershipId || after.membership.tenantId !== before.membership.tenantId || after.membership.updatedAt !== effectiveAt || !sameImmutableMembershipFields(after, before)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "assign_workspace" && (after.membership.status !== before.membership.status || after.membership.workspaceId !== mutation.workspaceId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "disable" && (after.membership.status !== "disabled" || after.membership.workspaceId !== before.membership.workspaceId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "reactivate" && (after.membership.status !== "active" || after.membership.workspaceId !== before.membership.workspaceId)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (operation === "assign_role") {
    if (mutation.roleChange?.kind !== "replace" || after.currentRoleBinding === null || after.currentRoleBinding.role !== mutation.roleChange.role || before.currentRoleBinding === null || after.currentRoleBinding.id === before.currentRoleBinding.id || after.membership.status !== before.membership.status || after.membership.workspaceId !== before.membership.workspaceId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    assertRoleReplacementHistory(before, after, actor.membership.id, targetMembershipId, before.currentRoleBinding.id, after.currentRoleBinding, mutation.roleChange.role, "role_change", effectiveAt);
  }
  if (operation === "revoke" || operation === "remove") {
    const expectedStatus = operation === "revoke" ? "revoked" : "removed";
    if (after.membership.status !== expectedStatus || after.membership.workspaceId !== before.membership.workspaceId || after.currentRoleBinding !== null) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    assertRoleRevocationHistory(before, after, effectiveAt);
  }
  if (operation === "assign_workspace" || operation === "disable" || operation === "reactivate") {
    if (!sameRoleHistory(after.roleBindings, before.roleBindings) || !sameOptionalBinding(after.currentRoleBinding, before.currentRoleBinding)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  }
  if (requestedReplacementId === undefined && replacement !== null) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (requestedReplacementId !== undefined && (!replacement || replacement.membership.id !== requestedReplacementId || replacement.membership.tenantId !== before.membership.tenantId || replacement.membership.status !== "active" || replacement.currentRoleBinding?.role !== "owner" || replacement.currentRoleBinding === null)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  if (requestedReplacementId !== undefined) {
    if (!replacementBefore || !replacement || !sameImmutableMembershipFields(replacement, replacementBefore) || replacement.membership.updatedAt !== effectiveAt || replacementBefore.membership.id !== requestedReplacementId || replacementBefore.membership.tenantId !== before.membership.tenantId || replacementBefore.membership.status !== "active" || !replacementBefore.currentRoleBinding || replacementBefore.currentRoleBinding.role === "owner" || replacement.currentRoleBinding === null || replacement.currentRoleBinding.tenantId !== before.membership.tenantId || replacement.currentRoleBinding.membershipId !== requestedReplacementId || replacement.membership.workspaceId !== replacementBefore.membership.workspaceId) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    assertRoleReplacementHistory(replacementBefore, replacement, actor.membership.id, requestedReplacementId, replacementBefore.currentRoleBinding.id, replacement.currentRoleBinding, "owner", "owner_replacement", effectiveAt);
  }
}

function sameImmutableMembershipFields(left: MembershipSnapshot, right: MembershipSnapshot): boolean {
  return left.membership.id === right.membership.id && left.membership.tenantId === right.membership.tenantId && left.membership.authIdentityId === right.membership.authIdentityId && left.membership.pendingIdentityRefHash === right.membership.pendingIdentityRefHash && left.membership.invitedByMembershipId === right.membership.invitedByMembershipId && left.membership.createdAt === right.membership.createdAt;
}

function sameRoleHistory(left: readonly RoleBindingRecord[], right: readonly RoleBindingRecord[]): boolean {
  return left.length === right.length && left.every((binding, index) => sameRoleBinding(binding, right[index]));
}

function assertRoleReplacementHistory(
  before: MembershipSnapshot,
  after: MembershipSnapshot,
  actorMembershipId: MembershipId,
  membershipId: MembershipId,
  priorCurrentBindingId: string,
  newCurrentBinding: RoleBindingRecord,
  newRole: LaunchRole,
  reasonCode: "role_change" | "owner_replacement",
  effectiveAt: string,
): void {
  if (after.roleBindings.length !== before.roleBindings.length + 1 || after.currentRoleBinding === null || !sameRoleBinding(after.currentRoleBinding, newCurrentBinding) || newCurrentBinding.id === priorCurrentBindingId || newCurrentBinding.tenantId !== before.membership.tenantId || newCurrentBinding.membershipId !== membershipId || newCurrentBinding.role !== newRole || newCurrentBinding.createdAt !== effectiveAt || newCurrentBinding.validFrom !== effectiveAt || newCurrentBinding.revokedAt !== null || newCurrentBinding.assignedByMembershipId !== actorMembershipId || newCurrentBinding.reasonCode !== reasonCode) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  const priorIds = new Set(before.roleBindings.map((binding) => binding.id));
  const added = after.roleBindings.filter((binding) => !priorIds.has(binding.id));
  if (added.length !== 1 || !sameRoleBinding(added[0], newCurrentBinding)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  for (const prior of before.roleBindings) {
    const matches = after.roleBindings.filter((binding) => binding.id === prior.id);
    if (matches.length !== 1) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    const expected = prior.id === priorCurrentBindingId ? { ...prior, revokedAt: effectiveAt } : prior;
    if (!sameRoleBinding(matches[0], expected)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  }
}

function assertRoleRevocationHistory(before: MembershipSnapshot, after: MembershipSnapshot, effectiveAt: string): void {
  if (!before.currentRoleBinding) {
    if (!sameRoleHistory(after.roleBindings, before.roleBindings)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    return;
  }
  if (after.roleBindings.length !== before.roleBindings.length) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  for (const prior of before.roleBindings) {
    const matches = after.roleBindings.filter((binding) => binding.id === prior.id);
    if (matches.length !== 1) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
    const expected = prior.id === before.currentRoleBinding.id ? { ...prior, revokedAt: effectiveAt } : prior;
    if (!sameRoleBinding(matches[0], expected)) throw new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
  }
}

function sameOptionalBinding(left: RoleBindingRecord | null, right: RoleBindingRecord | null): boolean {
  return left === null ? right === null : right !== null && sameRoleBinding(left, right);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
