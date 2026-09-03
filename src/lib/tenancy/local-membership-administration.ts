import { createHash, randomUUID } from "node:crypto";

import type { DbClient } from "@/lib/db";
import type { TenantPolicyEvaluator } from "@/lib/tenancy/authorize";
import {
  createTenantMembershipAdministrationService,
  MembershipAdministrationError,
  type ApplyMembershipMutationInput,
  type ApplyMembershipMutationResult,
  type MembershipAdministrationAuditEvent,
  type MembershipAdministrationRepository,
  type MembershipAdministrationTransactionScope,
  type MembershipIdempotencyPort,
  type MembershipMutationJournalEntry,
  type MembershipMutationOperation,
  type MembershipMutationResult,
  type MembershipRecord,
  type MembershipSnapshot,
  type RoleBindingRecord,
  type TenantMembershipAdministrationService,
  type WorkspaceRecord,
} from "@/lib/tenancy/memberships";
import { authIdentityIdSchema } from "@/lib/tenancy/schemas";
import type { LaunchRole, MembershipStatus, TenantId } from "@/lib/tenancy/types";

const IDENTITY_HASH_DOMAIN = "novatrade:tenant-membership-invite:v1:auth-identity:";
const LOCAL_POLICY_ACTIONS = new Set([
  "membership.invite",
  "membership.assign_role",
]);
const LOCAL_INVITE_HARD_CAP_PER_24_HOURS = 100;

type LocalAdapterOptions = Readonly<{
  clock?: () => Date;
  policyEvaluator?: TenantPolicyEvaluator;
}>;

type MembershipRow = Record<string, unknown>;
type RoleRow = Record<string, unknown>;
type JournalRow = Record<string, unknown>;

export function isLocalMembershipAdministrationAvailable(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

/** Hashes a verified provider subject without retaining a raw identity or email. */
export function hashLocalAuthIdentitySelector(authIdentityId: unknown): string {
  const parsed = authIdentityIdSchema.safeParse(authIdentityId);
  if (!parsed.success) throw new MembershipAdministrationError("INVALID_INPUT");
  return createHash("sha256").update(`${IDENTITY_HASH_DOMAIN}${parsed.data.toLowerCase()}`).digest("hex");
}

export function createLocalTenantMembershipAdministrationService(
  db: DbClient,
  options: LocalAdapterOptions = {},
): TenantMembershipAdministrationService {
  if (!isLocalMembershipAdministrationAvailable()) {
    throw new MembershipAdministrationError("TRANSACTION_REQUIRED");
  }
  if (!db || typeof db.withTransaction !== "function") {
    throw new MembershipAdministrationError("TRANSACTION_REQUIRED");
  }

  const policyEvaluator = composeLocalPolicyEvaluator(options.policyEvaluator);
  return createTenantMembershipAdministrationService({
    clock: options.clock ?? (() => new Date()),
    idFactory: { next: () => randomUUID() },
    policyEvaluator,
    transactionCoordinator: {
      run: async <T>(callback: (scope: MembershipAdministrationTransactionScope) => Promise<T>): Promise<T> =>
        db.withTransaction!(async () => callback(createScope(db))),
    },
  });
}

const localPolicyEvaluator: TenantPolicyEvaluator = (context) => ({
  allowed: isLocalMembershipAdministrationAvailable() && LOCAL_POLICY_ACTIONS.has(context.action),
  context,
});

function composeLocalPolicyEvaluator(injected?: TenantPolicyEvaluator): TenantPolicyEvaluator {
  return async (context) => {
    const local = await localPolicyEvaluator(context);
    if (!local.allowed || !injected) return local;
    const external = await injected(context);
    return { allowed: external.allowed === true, context };
  };
}

function createScope(db: DbClient): MembershipAdministrationTransactionScope {
  return {
    repository: createRepository(db),
    idempotency: createIdempotencyPort(db),
    audit: { append: (event) => appendAudit(db, event) },
  };
}

function createRepository(db: DbClient): MembershipAdministrationRepository {
  const getSnapshot = async (tenantId: string, membershipId: string): Promise<MembershipSnapshot | null> => {
    const row = await db.prepare(
      `SELECT id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id,
              status, invited_by_membership_id, created_at, updated_at
       FROM tenant_memberships WHERE tenant_id = ? AND id = ?`,
    ).get<MembershipRow>(tenantId, membershipId);
    if (!row) return null;
    const roles = await db.prepare(
      `SELECT id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
              assigned_by_membership_id, reason_code
       FROM tenant_role_bindings
       WHERE tenant_id = ? AND membership_id = ?
       ORDER BY valid_from ASC, id ASC`,
    ).all<RoleRow>(tenantId, membershipId);
    return snapshotFromRows(row, roles);
  };

  return {
    async listMemberships(tenantId) {
      const rows = await db.prepare(
        `SELECT id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id,
                status, invited_by_membership_id, created_at, updated_at
         FROM tenant_memberships WHERE tenant_id = ? ORDER BY id ASC`,
      ).all<MembershipRow>(tenantId);
      const snapshots: MembershipSnapshot[] = [];
      for (const row of rows) {
        const membershipId = requiredString(row.id);
        const value = await getSnapshot(tenantId, membershipId);
        if (!value) throw malformed();
        snapshots.push(value);
      }
      return snapshots;
    },
    getMembership: getSnapshot,
    async findByIdentitySelectorHash(tenantId, selectorHash) {
      const pending = await db.prepare(
        `SELECT id FROM tenant_memberships
         WHERE tenant_id = ? AND pending_identity_ref_hash = ?
           AND status NOT IN ('revoked', 'removed', 'expired')
         ORDER BY id ASC`,
      ).all<{ id: unknown }>(tenantId, selectorHash);
      const active = await db.prepare(
        `SELECT id, auth_identity_id FROM tenant_memberships
         WHERE tenant_id = ? AND auth_identity_id IS NOT NULL
           AND status NOT IN ('revoked', 'removed', 'expired')
         ORDER BY id ASC`,
      ).all<{ id: unknown; auth_identity_id: unknown }>(tenantId);
      const matches = [
        ...pending.map((row) => requiredString(row.id)),
        ...active.filter((row) => hashLocalAuthIdentitySelector(requiredString(row.auth_identity_id)) === selectorHash)
          .map((row) => requiredString(row.id)),
      ];
      if (matches.length === 0) return null;
      if (matches.length !== 1) throw malformed();
      const value = await getSnapshot(tenantId, matches[0]);
      if (!value) throw malformed();
      return { snapshot: value, selectorHash };
    },
    async getWorkspace(tenantId, workspaceId) {
      const row = await db.prepare(
        "SELECT id, tenant_id, status FROM workspaces WHERE tenant_id = ? AND id = ?",
      ).get<Record<string, unknown>>(tenantId, workspaceId);
      if (!row) return null;
      return {
        id: requiredString(row.id),
        tenantId: requiredString(row.tenant_id),
        status: requiredString(row.status),
      } as WorkspaceRecord;
    },
    async createPendingMembership(input) {
      const membershipResult = await db.prepare(
        `INSERT INTO tenant_memberships
          (id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id, status,
           invited_by_membership_id, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, 'pending', ?, ?, ?)`,
      ).run(input.membershipId, input.tenantId, input.pendingIdentityRefHash, input.workspaceId,
        input.invitedByMembershipId, input.effectiveAt, input.effectiveAt);
      if (membershipResult.changes !== 1) throw stateConflict();
      const bindingResult = await db.prepare(
        `INSERT INTO tenant_role_bindings
          (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
           assigned_by_membership_id, reason_code)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'invitation')`,
      ).run(randomUUID(), input.tenantId, input.membershipId, input.role, input.effectiveAt,
        input.effectiveAt, input.invitedByMembershipId);
      if (bindingResult.changes !== 1) throw stateConflict();
      const value = await getSnapshot(input.tenantId, input.membershipId);
      if (!value) throw malformed();
      return value;
    },
    async applyMutation(tenantId, input) {
      return applyMutation(db, getSnapshot, tenantId, input);
    },
  };
}

async function applyMutation(
  db: DbClient,
  getSnapshot: (tenantId: string, membershipId: string) => Promise<MembershipSnapshot | null>,
  tenantId: TenantId,
  input: ApplyMembershipMutationInput,
): Promise<ApplyMembershipMutationResult> {
  const current = await getSnapshot(tenantId, input.targetMembershipId);
  if (!current || !input.expectedStatus.includes(current.membership.status)
      || current.membership.workspaceId !== input.expectedWorkspaceId
      || (current.currentRoleBinding?.id ?? null) !== input.expectedCurrentRoleBindingId
      || (current.currentRoleBinding?.role ?? null) !== input.expectedCurrentRole) throw stateConflict();

  const losesOwner = current.membership.status === "active" && current.currentRoleBinding?.role === "owner"
    && ((input.roleChange?.kind === "replace" && input.roleChange.role !== "owner")
      || input.status === "disabled" || input.status === "revoked" || input.status === "removed");
  const ownerRow = await db.prepare(
    `SELECT COUNT(*) AS owner_count
     FROM tenant_memberships AS membership
     JOIN tenant_role_bindings AS binding
       ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
      AND binding.revoked_at IS NULL AND binding.role = 'owner'
     WHERE membership.tenant_id = ? AND membership.status = 'active'`,
  ).get<{ owner_count: unknown }>(tenantId);
  const ownerCount = Number(ownerRow?.owner_count);
  if (!Number.isSafeInteger(ownerCount) || ownerCount < 0) throw malformed();
  if (losesOwner && ownerCount === 1 && input.replacementOwnerMembershipId === undefined) {
    throw new MembershipAdministrationError("OWNER_GUARD");
  }

  let replacement: MembershipSnapshot | null = null;
  if (input.replacementOwnerMembershipId !== undefined) {
    const candidate = await getSnapshot(tenantId, input.replacementOwnerMembershipId);
    if (!losesOwner || !candidate || candidate.membership.id === input.targetMembershipId
        || candidate.membership.status !== "active" || !candidate.currentRoleBinding
        || candidate.currentRoleBinding.role === "owner") {
      throw new MembershipAdministrationError("OWNER_GUARD");
    }
    await replaceRole(db, tenantId, candidate.currentRoleBinding, "owner", input.actorMembershipId,
      "owner_replacement", input.effectiveAt);
    const touched = await db.prepare(
      "UPDATE tenant_memberships SET updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'active'",
    ).run(input.effectiveAt, tenantId, candidate.membership.id);
    if (touched.changes !== 1) throw stateConflict();
    replacement = await getSnapshot(tenantId, candidate.membership.id);
    if (!replacement) throw malformed();
  }

  const targetUpdate = await db.prepare(
    `UPDATE tenant_memberships
     SET status = CASE WHEN ? = 1 THEN ? ELSE status END,
         workspace_id = CASE WHEN ? = 1 THEN ? ELSE workspace_id END,
         updated_at = ?
     WHERE tenant_id = ? AND id = ? AND status = ?
       AND workspace_id IS ?`,
  ).run(input.status === undefined ? 0 : 1, input.status ?? current.membership.status,
    input.workspaceId === undefined ? 0 : 1, input.workspaceId ?? null,
    input.effectiveAt, tenantId, input.targetMembershipId, current.membership.status,
    current.membership.workspaceId);
  if (targetUpdate.changes !== 1) throw stateConflict();

  if (input.roleChange?.kind === "replace") {
    if (!current.currentRoleBinding) throw stateConflict();
    await replaceRole(db, tenantId, current.currentRoleBinding, input.roleChange.role,
      input.actorMembershipId, "role_change", input.effectiveAt);
  } else if (input.roleChange?.kind === "revoke" && current.currentRoleBinding) {
    const revoked = await db.prepare(
      `UPDATE tenant_role_bindings SET revoked_at = ?
       WHERE tenant_id = ? AND id = ? AND membership_id = ? AND revoked_at IS NULL AND role = ?`,
    ).run(input.effectiveAt, tenantId, current.currentRoleBinding.id,
      current.membership.id, current.currentRoleBinding.role);
    if (revoked.changes !== 1) throw stateConflict();
  }

  const target = await getSnapshot(tenantId, input.targetMembershipId);
  if (!target) throw malformed();
  return { target, replacement };
}

async function replaceRole(
  db: DbClient,
  tenantId: string,
  current: RoleBindingRecord,
  role: LaunchRole,
  actorMembershipId: string,
  reasonCode: "role_change" | "owner_replacement",
  effectiveAt: string,
): Promise<void> {
  const revoked = await db.prepare(
    `UPDATE tenant_role_bindings SET revoked_at = ?
     WHERE tenant_id = ? AND id = ? AND membership_id = ? AND revoked_at IS NULL AND role = ?`,
  ).run(effectiveAt, tenantId, current.id, current.membershipId, current.role);
  if (revoked.changes !== 1) throw stateConflict();
  const inserted = await db.prepare(
    `INSERT INTO tenant_role_bindings
      (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
       assigned_by_membership_id, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(randomUUID(), tenantId, current.membershipId, role, effectiveAt, effectiveAt,
    actorMembershipId, reasonCode);
  if (inserted.changes !== 1) throw stateConflict();
}

function createIdempotencyPort(db: DbClient): MembershipIdempotencyPort {
  const read = async (hash: string): Promise<JournalRow | null> =>
    (await db.prepare(
      `SELECT idempotency_key_hash, input_hash, tenant_id, actor_membership_id,
              actor_role_binding_id, operation, target_membership_id,
              replacement_membership_id, status, result_json
       FROM tenant_membership_mutation_journal WHERE idempotency_key_hash = ?`,
    ).get<JournalRow>(hash)) ?? null;

  return {
    async find(idempotencyKeyHash) {
      const row = await read(idempotencyKeyHash);
      if (!row || row.status !== "completed") return null;
      return journalEntry(row);
    },
    async reserve(input) {
      const existing = await read(input.idempotencyKeyHash);
      if (existing) {
        if (!sameReservation(existing, input)) return "conflict";
        if (existing.status === "completed") return "completed";
        if (existing.status === "reserved") return "in_progress";
        throw malformed();
      }
      if (input.operation === "invite") {
        const countRow = await db.prepare(
          `SELECT COUNT(*) AS invite_count
           FROM tenant_membership_mutation_journal
           WHERE tenant_id = ? AND operation = 'invite'
             AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`,
        ).get<{ invite_count: unknown }>(input.tenantId);
        const inviteCount = Number(countRow?.invite_count);
        if (!Number.isSafeInteger(inviteCount) || inviteCount < 0) throw malformed();
        if (inviteCount >= LOCAL_INVITE_HARD_CAP_PER_24_HOURS) {
          throw new MembershipAdministrationError("POLICY_BLOCKED");
        }
      }
      const inserted = await db.prepare(
        `INSERT OR IGNORE INTO tenant_membership_mutation_journal
          (idempotency_key_hash, input_hash, tenant_id, actor_membership_id,
           actor_role_binding_id, operation, target_membership_id, replacement_membership_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.idempotencyKeyHash, input.inputHash, input.tenantId, input.actorMembershipId,
        input.actorRoleBindingId, input.operation, input.targetMembershipId, input.replacementMembershipId);
      if (inserted.changes === 1) return "reserved";
      const row = await read(input.idempotencyKeyHash);
      if (!row || !sameReservation(row, input)) return "conflict";
      if (row.status === "completed") return "completed";
      if (row.status === "reserved") return "in_progress";
      throw malformed();
    },
    async complete(input) {
      const result = await db.prepare(
        `UPDATE tenant_membership_mutation_journal
         SET status = 'completed', target_membership_id = ?, result_json = ?, completed_at = ?
         WHERE idempotency_key_hash = ? AND input_hash = ? AND tenant_id = ?
           AND actor_membership_id = ? AND actor_role_binding_id = ? AND operation = ?
           AND status = 'reserved' AND target_membership_id IS ?
           AND replacement_membership_id IS ?`,
      ).run(input.targetMembershipId, JSON.stringify(input.result), input.effectiveAt,
        input.idempotencyKeyHash, input.inputHash, input.tenantId, input.actorMembershipId,
        input.actorRoleBindingId, input.operation,
        input.operation === "invite" ? null : input.targetMembershipId,
        input.replacementMembershipId);
      if (result.changes !== 1) throw stateConflict();
    },
  };
}

async function appendAudit(db: DbClient, event: MembershipAdministrationAuditEvent): Promise<void> {
  const result = await db.prepare(
    `INSERT INTO audit_logs
      (id, action, entity_type, entity_id, metadata, scope_kind, tenant_id, workspace_id,
       correlation_id, actor_auth_identity_id, actor_membership_id, actor_launch_role,
       actor_role_binding_id, actor_layer)
     VALUES (?, 'tenant.membership.mutated', 'tenant_membership', ?, ?, 'tenant', ?, ?,
             ?, ?, ?, ?, ?, 'member')`,
  ).run(randomUUID(), event.targetMembershipId, JSON.stringify(event), event.tenantId,
    event.after.workspaceId, event.correlationId, event.actor.authIdentityId,
    event.actor.membershipId, event.actor.role, event.actor.roleBindingId);
  if (result.changes !== 1) throw new MembershipAdministrationError("TRANSACTION_FAILED");
}

function snapshotFromRows(membershipRow: MembershipRow, roleRows: readonly RoleRow[]): MembershipSnapshot {
  const membership: MembershipRecord = {
    id: requiredString(membershipRow.id),
    tenantId: requiredString(membershipRow.tenant_id),
    authIdentityId: nullableString(membershipRow.auth_identity_id),
    pendingIdentityRefHash: nullableString(membershipRow.pending_identity_ref_hash),
    workspaceId: nullableString(membershipRow.workspace_id),
    status: requiredString(membershipRow.status) as MembershipStatus,
    invitedByMembershipId: nullableString(membershipRow.invited_by_membership_id),
    createdAt: requiredString(membershipRow.created_at),
    updatedAt: requiredString(membershipRow.updated_at),
  };
  const roleBindings = roleRows.map((row): RoleBindingRecord => ({
    id: requiredString(row.id), tenantId: requiredString(row.tenant_id),
    membershipId: requiredString(row.membership_id), role: requiredString(row.role) as LaunchRole,
    createdAt: requiredString(row.created_at), validFrom: requiredString(row.valid_from),
    revokedAt: nullableString(row.revoked_at),
    assignedByMembershipId: nullableString(row.assigned_by_membership_id),
    reasonCode: requiredString(row.reason_code),
  }));
  const current = roleBindings.filter((binding) => binding.revokedAt === null);
  if (current.length > 1) throw malformed();
  return { membership, roleBindings, currentRoleBinding: current[0] ?? null };
}

function journalEntry(row: JournalRow): MembershipMutationJournalEntry {
  let result: unknown;
  try { result = JSON.parse(requiredString(row.result_json)); } catch { throw malformed(); }
  return {
    idempotencyKeyHash: requiredString(row.idempotency_key_hash),
    inputHash: requiredString(row.input_hash),
    tenantId: requiredString(row.tenant_id),
    actorMembershipId: requiredString(row.actor_membership_id),
    actorRoleBindingId: requiredString(row.actor_role_binding_id),
    operation: requiredString(row.operation) as MembershipMutationOperation,
    targetMembershipId: nullableString(row.target_membership_id),
    replacementMembershipId: nullableString(row.replacement_membership_id),
    result: result as MembershipMutationResult,
  };
}

function sameReservation(row: JournalRow, input: Omit<MembershipMutationJournalEntry, "result">): boolean {
  return row.idempotency_key_hash === input.idempotencyKeyHash
    && row.input_hash === input.inputHash && row.tenant_id === input.tenantId
    && row.actor_membership_id === input.actorMembershipId
    && row.actor_role_binding_id === input.actorRoleBindingId && row.operation === input.operation
    && (row.target_membership_id ?? null) === input.targetMembershipId
    && (row.replacement_membership_id ?? null) === input.replacementMembershipId;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw malformed();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function malformed(): MembershipAdministrationError {
  return new MembershipAdministrationError("MALFORMED_REPOSITORY_RESULT");
}

function stateConflict(): MembershipAdministrationError {
  return new MembershipAdministrationError("STATE_CONFLICT");
}
