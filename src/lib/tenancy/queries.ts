import { getDb, nowISO, type DbClient } from "@/lib/db";
import {
  TENANT_POLICY_DEFAULTS,
  type TenantPolicyCreationInput,
} from "@/lib/tenancy/schemas";
import {
  LAUNCH_ROLES,
  MEMBERSHIP_STATUSES,
  TENANT_POLICY_ACTIVE_MATERIALS_MODE,
  TENANT_STATUSES,
  WORKSPACE_STATUSES,
  type AuthIdentityId,
  type LaunchRole,
  type MembershipId,
  type MembershipStatus,
  type TenantId,
  type TenantPolicy,
  type TenantStatus,
  type WorkspaceId,
  type WorkspaceStatus,
} from "@/lib/tenancy/types";

export interface Tenant {
  id: TenantId;
  slug: string;
  name: string;
  status: TenantStatus;
  locale: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: WorkspaceId;
  tenantId: TenantId;
  slug: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: MembershipId;
  tenantId: TenantId;
  authIdentityId: AuthIdentityId | null;
  pendingIdentityRefHash: string | null;
  workspaceId: WorkspaceId | null;
  status: MembershipStatus;
  invitedByMembershipId: MembershipId | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipDirectoryEntry {
  id: MembershipId;
  tenantId: TenantId;
  workspaceId: WorkspaceId | null;
  status: MembershipStatus;
  actorIdentityMatches: boolean;
}

export interface RoleBinding {
  id: string;
  tenantId: TenantId;
  membershipId: MembershipId;
  role: LaunchRole;
  createdAt: string;
  validFrom: string;
  revokedAt: string | null;
  assignedByMembershipId: MembershipId | null;
  reasonCode: RoleBindingReason;
}

export type RoleBindingReason =
  | "initial_provisioning"
  | "invitation"
  | "role_change"
  | "owner_replacement"
  | "membership_reactivation"
  | "administrative_correction";

export interface CreateTenantInput {
  id: TenantId;
  slug: string;
  name: string;
  status?: TenantStatus;
  locale?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateWorkspaceInput {
  id: WorkspaceId;
  slug: string;
  name: string;
  status?: WorkspaceStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMembershipInput {
  id: MembershipId;
  authIdentityId?: AuthIdentityId | null;
  pendingIdentityRefHash?: string | null;
  workspaceId?: WorkspaceId | null;
  status?: MembershipStatus;
  invitedByMembershipId?: MembershipId | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleBindingInput {
  id: string;
  membershipId: MembershipId;
  role: LaunchRole;
  createdAt?: string;
  validFrom?: string;
  revokedAt?: string | null;
  assignedByMembershipId?: MembershipId | null;
  reasonCode?: RoleBindingReason;
}

export type CreateTenantPolicyInput = Partial<
  Omit<TenantPolicy, "id" | "tenantId" | "version" | "createdAt" | "updatedAt">
> & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

interface TenantRow extends Record<string, unknown> {
  id: unknown;
  slug: unknown;
  name: unknown;
  status: unknown;
  locale: unknown;
  timezone: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface WorkspaceRow extends Record<string, unknown> {
  id: unknown;
  tenant_id: unknown;
  slug: unknown;
  name: unknown;
  status: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface MembershipRow extends Record<string, unknown> {
  id: unknown;
  tenant_id: unknown;
  auth_identity_id: unknown;
  pending_identity_ref_hash: unknown;
  workspace_id: unknown;
  status: unknown;
  invited_by_membership_id: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface MembershipDirectoryRow extends Record<string, unknown> {
  id: unknown;
  tenant_id: unknown;
  workspace_id: unknown;
  status: unknown;
  actor_identity_matches: unknown;
}

interface RoleBindingRow extends Record<string, unknown> {
  id: unknown;
  tenant_id: unknown;
  membership_id: unknown;
  role: unknown;
  created_at: unknown;
  valid_from: unknown;
  revoked_at: unknown;
  assigned_by_membership_id: unknown;
  reason_code: unknown;
}

interface TenantPolicyRow extends Record<string, unknown> {
  id: unknown;
  tenant_id: unknown;
  version: unknown;
  locale: unknown;
  timezone: unknown;
  export_retention_days: unknown;
  operational_log_retention_days: unknown;
  raw_source_retention_days: unknown;
  contact_freshness_days: unknown;
  primary_delete_within_days: unknown;
  backup_expire_within_days: unknown;
  tombstone_retention_years: unknown;
  active_materials_mode: unknown;
  ai_processing_enabled: unknown;
  source_research_enabled: unknown;
  contact_research_enabled: unknown;
  outreach_drafting_enabled: unknown;
  copy_export_enabled: unknown;
  autonomous_send_enabled: unknown;
  require_source_plan_approval: unknown;
  require_knowledge_review: unknown;
  require_icp_review: unknown;
  require_lead_play_review: unknown;
  require_contact_review: unknown;
  require_outreach_review: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const ROLE_BINDING_REASONS = [
  "initial_provisioning",
  "invitation",
  "role_change",
  "owner_replacement",
  "membership_reactivation",
  "administrative_correction",
] as const satisfies readonly RoleBindingReason[];

const tenantStatusSet = new Set<string>(TENANT_STATUSES);
const workspaceStatusSet = new Set<string>(WORKSPACE_STATUSES);
const membershipStatusSet = new Set<string>(MEMBERSHIP_STATUSES);
const launchRoleSet = new Set<string>(LAUNCH_ROLES);
const roleBindingReasonSet = new Set<string>(ROLE_BINDING_REASONS);

export class TenantRecordNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found for the requested tenant scope.`);
    this.name = "TenantRecordNotFoundError";
  }
}

type DbResolver = () => Promise<DbClient>;

export interface TenantQueryRepository {
  createTenant(input: CreateTenantInput): Promise<Tenant>;
  getTenant(tenantId: TenantId): Promise<Tenant | null>;
  updateTenantStatus(tenantId: TenantId, status: TenantStatus): Promise<Tenant>;

  createWorkspace(tenantId: TenantId, input: CreateWorkspaceInput): Promise<Workspace>;
  getWorkspace(tenantId: TenantId, workspaceId: WorkspaceId): Promise<Workspace | null>;
  listWorkspaces(tenantId: TenantId): Promise<Workspace[]>;
  updateWorkspaceStatus(tenantId: TenantId, workspaceId: WorkspaceId, status: WorkspaceStatus): Promise<Workspace>;

  createMembership(tenantId: TenantId, input: CreateMembershipInput): Promise<Membership>;
  getMembership(tenantId: TenantId, membershipId: MembershipId): Promise<Membership | null>;
  listMemberships(tenantId: TenantId): Promise<Membership[]>;
  listMembershipDirectory(
    tenantId: TenantId,
    actorMembershipId: MembershipId,
    expectedAuthIdentityId: AuthIdentityId,
  ): Promise<MembershipDirectoryEntry[]>;
  updateMembershipStatus(tenantId: TenantId, membershipId: MembershipId, status: MembershipStatus): Promise<Membership>;

  createRoleBinding(tenantId: TenantId, input: CreateRoleBindingInput): Promise<RoleBinding>;
  listRoleBindings(tenantId: TenantId): Promise<RoleBinding[]>;
  getCurrentRoleBinding(tenantId: TenantId, membershipId: MembershipId): Promise<RoleBinding | null>;
  revokeCurrentRoleBinding(tenantId: TenantId, membershipId: MembershipId, revokedAt?: string): Promise<RoleBinding>;

  createTenantPolicy(tenantId: TenantId, input: CreateTenantPolicyInput): Promise<TenantPolicy>;
  getCurrentTenantPolicy(tenantId: TenantId): Promise<TenantPolicy | null>;

  withTransaction<T>(fn: (repository: TenantQueryRepository) => Promise<T>): Promise<T>;
}

export function createTenantQueryRepository(db?: DbClient): TenantQueryRepository {
  const resolveDb: DbResolver = db ? async () => db : getDb;

  const createTenant = async (input: CreateTenantInput): Promise<Tenant> => {
    const client = await resolveDb();
    const timestamp = nowISO();
    const result = await client.prepare(
      `INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.slug,
      input.name,
      input.status ?? "provisioning",
      input.locale ?? "en-US",
      input.timezone ?? "UTC",
      input.createdAt ?? timestamp,
      input.updatedAt ?? timestamp,
    );
    assertAffected(result.changes, "tenant creation");
    const tenant = await getTenant(input.id);
    if (!tenant) throw new Error("Tenant creation did not produce a readable record.");
    return tenant;
  };

  const getTenant = async (tenantId: TenantId): Promise<Tenant | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, slug, name, status, locale, timezone, created_at, updated_at
       FROM tenants
       WHERE id = ?`,
    ).get<TenantRow>(tenantId);
    return row ? mapTenant(row) : null;
  };

  const updateTenantStatus = async (tenantId: TenantId, status: TenantStatus): Promise<Tenant> => {
    const client = await resolveDb();
    const result = await client.prepare("UPDATE tenants SET status = ? WHERE id = ?").run(status, tenantId);
    assertScopedAffected(result.changes, "tenant");
    const tenant = await getTenant(tenantId);
    if (!tenant) throw new TenantRecordNotFoundError("Tenant");
    return tenant;
  };

  const createWorkspace = async (tenantId: TenantId, input: CreateWorkspaceInput): Promise<Workspace> => {
    const client = await resolveDb();
    const timestamp = nowISO();
    const result = await client.prepare(
      `INSERT INTO workspaces (id, tenant_id, slug, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      tenantId,
      input.slug,
      input.name,
      input.status ?? "provisioning",
      input.createdAt ?? timestamp,
      input.updatedAt ?? timestamp,
    );
    assertAffected(result.changes, "workspace creation");
    const workspace = await getWorkspace(tenantId, input.id);
    if (!workspace) throw new Error("Workspace creation did not produce a readable record.");
    return workspace;
  };

  const getWorkspace = async (tenantId: TenantId, workspaceId: WorkspaceId): Promise<Workspace | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, tenant_id, slug, name, status, created_at, updated_at
       FROM workspaces
       WHERE tenant_id = ? AND id = ?`,
    ).get<WorkspaceRow>(tenantId, workspaceId);
    return row ? mapWorkspace(row) : null;
  };

  const listWorkspaces = async (tenantId: TenantId): Promise<Workspace[]> => {
    const client = await resolveDb();
    const rows = await client.prepare(
      `SELECT id, tenant_id, slug, name, status, created_at, updated_at
       FROM workspaces
       WHERE tenant_id = ?
       ORDER BY id ASC`,
    ).all<WorkspaceRow>(tenantId);
    return rows.map(mapWorkspace);
  };

  const updateWorkspaceStatus = async (
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    status: WorkspaceStatus,
  ): Promise<Workspace> => {
    const client = await resolveDb();
    const result = await client.prepare(
      "UPDATE workspaces SET status = ? WHERE tenant_id = ? AND id = ?",
    ).run(status, tenantId, workspaceId);
    assertScopedAffected(result.changes, "Workspace");
    const workspace = await getWorkspace(tenantId, workspaceId);
    if (!workspace) throw new TenantRecordNotFoundError("Workspace");
    return workspace;
  };

  const createMembership = async (tenantId: TenantId, input: CreateMembershipInput): Promise<Membership> => {
    const client = await resolveDb();
    const timestamp = nowISO();
    const result = await client.prepare(
      `INSERT INTO tenant_memberships (
         id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id,
         status, invited_by_membership_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      tenantId,
      input.authIdentityId ?? null,
      input.pendingIdentityRefHash ?? null,
      input.workspaceId ?? null,
      input.status ?? "pending",
      input.invitedByMembershipId ?? null,
      input.createdAt ?? timestamp,
      input.updatedAt ?? timestamp,
    );
    assertAffected(result.changes, "membership creation");
    const membership = await getMembership(tenantId, input.id);
    if (!membership) throw new Error("Membership creation did not produce a readable record.");
    return membership;
  };

  const getMembership = async (tenantId: TenantId, membershipId: MembershipId): Promise<Membership | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id,
              status, invited_by_membership_id, created_at, updated_at
       FROM tenant_memberships
       WHERE tenant_id = ? AND id = ?`,
    ).get<MembershipRow>(tenantId, membershipId);
    return row ? mapMembership(row) : null;
  };

  const listMemberships = async (tenantId: TenantId): Promise<Membership[]> => {
    const client = await resolveDb();
    const rows = await client.prepare(
      `SELECT id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id,
              status, invited_by_membership_id, created_at, updated_at
       FROM tenant_memberships
       WHERE tenant_id = ?
       ORDER BY id ASC`,
    ).all<MembershipRow>(tenantId);
    return rows.map(mapMembership);
  };

  const listMembershipDirectory = async (
    tenantId: TenantId,
    actorMembershipId: MembershipId,
    expectedAuthIdentityId: AuthIdentityId,
  ): Promise<MembershipDirectoryEntry[]> => {
    const client = await resolveDb();
    const rows = await client.prepare(
      `SELECT id, tenant_id, workspace_id, status,
              CASE
                WHEN tenant_id = ? AND id = ? AND auth_identity_id = ? THEN TRUE
                ELSE FALSE
              END AS actor_identity_matches
       FROM tenant_memberships
       WHERE tenant_id = ?
       ORDER BY id ASC`,
    ).all<MembershipDirectoryRow>(tenantId, actorMembershipId, expectedAuthIdentityId, tenantId);
    return rows.map(mapMembershipDirectoryEntry);
  };

  const updateMembershipStatus = async (
    tenantId: TenantId,
    membershipId: MembershipId,
    status: MembershipStatus,
  ): Promise<Membership> => {
    const client = await resolveDb();
    const result = await client.prepare(
      "UPDATE tenant_memberships SET status = ? WHERE tenant_id = ? AND id = ?",
    ).run(status, tenantId, membershipId);
    assertScopedAffected(result.changes, "Membership");
    const membership = await getMembership(tenantId, membershipId);
    if (!membership) throw new TenantRecordNotFoundError("Membership");
    return membership;
  };

  const createRoleBinding = async (tenantId: TenantId, input: CreateRoleBindingInput): Promise<RoleBinding> => {
    const client = await resolveDb();
    const timestamp = nowISO();
    const result = await client.prepare(
      `INSERT INTO tenant_role_bindings (
         id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
         assigned_by_membership_id, reason_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      tenantId,
      input.membershipId,
      input.role,
      input.createdAt ?? timestamp,
      input.validFrom ?? input.createdAt ?? timestamp,
      input.revokedAt ?? null,
      input.assignedByMembershipId ?? null,
      input.reasonCode ?? "initial_provisioning",
    );
    assertAffected(result.changes, "role binding creation");
    const roleBinding = await getRoleBindingById(tenantId, input.id);
    if (!roleBinding) throw new Error("Role binding creation did not produce a readable record.");
    return roleBinding;
  };

  const getRoleBindingById = async (tenantId: TenantId, roleBindingId: string): Promise<RoleBinding | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
              assigned_by_membership_id, reason_code
       FROM tenant_role_bindings
       WHERE tenant_id = ? AND id = ?`,
    ).get<RoleBindingRow>(tenantId, roleBindingId);
    return row ? mapRoleBinding(row) : null;
  };

  const listRoleBindings = async (tenantId: TenantId): Promise<RoleBinding[]> => {
    const client = await resolveDb();
    const rows = await client.prepare(
      `SELECT id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
              assigned_by_membership_id, reason_code
       FROM tenant_role_bindings
       WHERE tenant_id = ?
       ORDER BY membership_id ASC, valid_from ASC, id ASC`,
    ).all<RoleBindingRow>(tenantId);
    return rows.map(mapRoleBinding);
  };

  const getCurrentRoleBinding = async (
    tenantId: TenantId,
    membershipId: MembershipId,
  ): Promise<RoleBinding | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, tenant_id, membership_id, role, created_at, valid_from, revoked_at,
              assigned_by_membership_id, reason_code
       FROM tenant_role_bindings
       WHERE tenant_id = ? AND membership_id = ? AND revoked_at IS NULL
       ORDER BY valid_from DESC, id DESC
       LIMIT 1`,
    ).get<RoleBindingRow>(tenantId, membershipId);
    return row ? mapRoleBinding(row) : null;
  };

  const revokeCurrentRoleBinding = async (
    tenantId: TenantId,
    membershipId: MembershipId,
    revokedAt = nowISO(),
  ): Promise<RoleBinding> => {
    const client = await resolveDb();
    const current = await client.prepare(
      `SELECT id
       FROM tenant_role_bindings
       WHERE tenant_id = ? AND membership_id = ? AND revoked_at IS NULL
       ORDER BY valid_from DESC, id DESC
       LIMIT 1`,
    ).get<{ id: unknown }>(tenantId, membershipId);
    if (!current) throw new TenantRecordNotFoundError("Current role binding");
    const roleBindingId = requiredString(current, "id");
    const result = await client.prepare(
      `UPDATE tenant_role_bindings
       SET revoked_at = ?
       WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL`,
    ).run(revokedAt, tenantId, roleBindingId);
    assertScopedAffected(result.changes, "Current role binding");
    const roleBinding = await getRoleBindingById(tenantId, roleBindingId);
    if (!roleBinding) throw new TenantRecordNotFoundError("Role binding");
    return roleBinding;
  };

  const createTenantPolicy = async (tenantId: TenantId, input: CreateTenantPolicyInput): Promise<TenantPolicy> => {
    const client = await resolveDb();
    const defaults: TenantPolicyCreationInput = {
      ...TENANT_POLICY_DEFAULTS,
      tenantId,
      ...input,
    } as TenantPolicyCreationInput;
    const timestamp = nowISO();
    const result = await client.prepare(
      `INSERT INTO tenant_policies (
         id, tenant_id, version, locale, timezone, export_retention_days,
         operational_log_retention_days, raw_source_retention_days, contact_freshness_days,
         primary_delete_within_days, backup_expire_within_days, tombstone_retention_years,
              active_materials_mode, ai_processing_enabled, source_research_enabled,
              contact_research_enabled, outreach_drafting_enabled, copy_export_enabled,
              autonomous_send_enabled, require_source_plan_approval, require_knowledge_review,
              require_icp_review, require_lead_play_review, require_contact_review,
              require_outreach_review, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 CASE WHEN ? = 1 THEN TRUE ELSE FALSE END,
                 ?, ?)`,
    ).run(
      input.id,
      tenantId,
      1,
      defaults.locale,
      defaults.timezone,
      defaults.exportRetentionDays,
      defaults.operationalLogRetentionDays,
      defaults.rawSourceRetentionDays,
      defaults.contactFreshnessDays,
      defaults.primaryDeleteWithinDays,
      defaults.backupExpireWithinDays,
      defaults.tombstoneRetentionYears,
      defaults.activeMaterialsMode,
      defaults.aiProcessingEnabled ? 1 : 0,
      defaults.sourceResearchEnabled ? 1 : 0,
      defaults.contactResearchEnabled ? 1 : 0,
      defaults.outreachDraftingEnabled ? 1 : 0,
      defaults.copyExportEnabled ? 1 : 0,
      defaults.autonomousSendEnabled ? 1 : 0,
      defaults.requireSourcePlanApproval ? 1 : 0,
      defaults.requireKnowledgeReview ? 1 : 0,
      defaults.requireIcpReview ? 1 : 0,
      defaults.requireLeadPlayReview ? 1 : 0,
      defaults.requireContactReview ? 1 : 0,
      defaults.requireOutreachReview ? 1 : 0,
      input.createdAt ?? timestamp,
      input.updatedAt ?? timestamp,
    );
    assertAffected(result.changes, "tenant policy creation");
    const policy = await getCurrentTenantPolicy(tenantId);
    if (!policy) throw new Error("Tenant policy creation did not produce a readable record.");
    return policy;
  };

  const getCurrentTenantPolicy = async (tenantId: TenantId): Promise<TenantPolicy | null> => {
    const client = await resolveDb();
    const row = await client.prepare(
      `SELECT id, tenant_id, version, locale, timezone, export_retention_days,
              operational_log_retention_days, raw_source_retention_days, contact_freshness_days,
              primary_delete_within_days, backup_expire_within_days, tombstone_retention_years,
              active_materials_mode, ai_processing_enabled, source_research_enabled,
              contact_research_enabled, outreach_drafting_enabled, copy_export_enabled,
              autonomous_send_enabled, require_source_plan_approval, require_knowledge_review,
              require_icp_review, require_lead_play_review, require_contact_review,
              require_outreach_review, created_at, updated_at
       FROM tenant_policies
       WHERE tenant_id = ?
       ORDER BY version DESC, updated_at DESC, id DESC
       LIMIT 1`,
    ).get<TenantPolicyRow>(tenantId);
    return row ? mapTenantPolicy(row) : null;
  };

  const repository: TenantQueryRepository = {
    createTenant,
    getTenant,
    updateTenantStatus,
    createWorkspace,
    getWorkspace,
    listWorkspaces,
    updateWorkspaceStatus,
    createMembership,
    getMembership,
    listMemberships,
    listMembershipDirectory,
    updateMembershipStatus,
    createRoleBinding,
    listRoleBindings,
    getCurrentRoleBinding,
    revokeCurrentRoleBinding,
    createTenantPolicy,
    getCurrentTenantPolicy,
    async withTransaction<T>(fn: (transactionRepository: TenantQueryRepository) => Promise<T>): Promise<T> {
      const client = await resolveDb();
      if (typeof client.withTransaction !== "function") {
        throw new Error("Tenant repository requires DbClient.withTransaction for atomic composition.");
      }
      return client.withTransaction(() => fn(createTenantQueryRepository(db)));
    },
  };

  return repository;
}

function assertAffected(changes: number, operation: string): void {
  if (changes !== 1) throw new Error(`Expected exactly one row for ${operation}; affected ${changes}.`);
}

function assertScopedAffected(changes: number, resource: string): void {
  if (changes !== 1) throw new TenantRecordNotFoundError(resource);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Invalid ${key} returned by tenant repository.`);
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid nullable ${key} returned by tenant repository.`);
  return value;
}

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function requiredTimestamp(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid timestamp ${key} returned by tenant repository.`);
    return value.toISOString();
  }
  if (typeof value === "string" && CANONICAL_TIMESTAMP.test(value) && new Date(value).toISOString() === value) {
    return value;
  }
  throw new Error(`Invalid timestamp ${key} returned by tenant repository.`);
}

function nullableTimestamp(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return requiredTimestamp(row, key);
}

function integerValue(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid integer ${key} returned by tenant repository.`);
  }
  return value;
}

function booleanValue(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  throw new Error(`Invalid boolean ${key} returned by tenant repository.`);
}

function enumValue<T extends string>(row: Record<string, unknown>, key: string, values: ReadonlySet<string>): T {
  const value = requiredString(row, key);
  if (!values.has(value)) throw new Error(`Invalid ${key} returned by tenant repository.`);
  return value as T;
}

function mapTenant(row: TenantRow): Tenant {
  return {
    id: requiredString(row, "id"),
    slug: requiredString(row, "slug"),
    name: requiredString(row, "name"),
    status: enumValue<TenantStatus>(row, "status", tenantStatusSet),
    locale: requiredString(row, "locale"),
    timezone: requiredString(row, "timezone"),
    createdAt: requiredTimestamp(row, "created_at"),
    updatedAt: requiredTimestamp(row, "updated_at"),
  };
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: requiredString(row, "id"),
    tenantId: requiredString(row, "tenant_id"),
    slug: requiredString(row, "slug"),
    name: requiredString(row, "name"),
    status: enumValue<WorkspaceStatus>(row, "status", workspaceStatusSet),
    createdAt: requiredTimestamp(row, "created_at"),
    updatedAt: requiredTimestamp(row, "updated_at"),
  };
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: requiredString(row, "id"),
    tenantId: requiredString(row, "tenant_id"),
    authIdentityId: nullableString(row, "auth_identity_id"),
    pendingIdentityRefHash: nullableString(row, "pending_identity_ref_hash"),
    workspaceId: nullableString(row, "workspace_id"),
    status: enumValue<MembershipStatus>(row, "status", membershipStatusSet),
    invitedByMembershipId: nullableString(row, "invited_by_membership_id"),
    createdAt: requiredTimestamp(row, "created_at"),
    updatedAt: requiredTimestamp(row, "updated_at"),
  };
}

function mapMembershipDirectoryEntry(row: MembershipDirectoryRow): MembershipDirectoryEntry {
  return {
    id: requiredString(row, "id"),
    tenantId: requiredString(row, "tenant_id"),
    workspaceId: nullableString(row, "workspace_id"),
    status: enumValue<MembershipStatus>(row, "status", membershipStatusSet),
    actorIdentityMatches: booleanValue(row, "actor_identity_matches"),
  };
}

function mapRoleBinding(row: RoleBindingRow): RoleBinding {
  return {
    id: requiredString(row, "id"),
    tenantId: requiredString(row, "tenant_id"),
    membershipId: requiredString(row, "membership_id"),
    role: enumValue<LaunchRole>(row, "role", launchRoleSet),
    createdAt: requiredTimestamp(row, "created_at"),
    validFrom: requiredTimestamp(row, "valid_from"),
    revokedAt: nullableTimestamp(row, "revoked_at"),
    assignedByMembershipId: nullableString(row, "assigned_by_membership_id"),
    reasonCode: enumValue<RoleBindingReason>(row, "reason_code", roleBindingReasonSet),
  };
}

function mapTenantPolicy(row: TenantPolicyRow): TenantPolicy {
  const mapped: TenantPolicy = {
    id: requiredString(row, "id"),
    tenantId: requiredString(row, "tenant_id"),
    version: integerValue(row, "version"),
    locale: requiredString(row, "locale"),
    timezone: requiredString(row, "timezone"),
    exportRetentionDays: integerValue(row, "export_retention_days"),
    operationalLogRetentionDays: integerValue(row, "operational_log_retention_days"),
    rawSourceRetentionDays: integerValue(row, "raw_source_retention_days"),
    contactFreshnessDays: integerValue(row, "contact_freshness_days"),
    primaryDeleteWithinDays: integerValue(row, "primary_delete_within_days"),
    backupExpireWithinDays: integerValue(row, "backup_expire_within_days"),
    tombstoneRetentionYears: integerValue(row, "tombstone_retention_years") as 7,
    activeMaterialsMode: requiredString(row, "active_materials_mode") as typeof TENANT_POLICY_ACTIVE_MATERIALS_MODE,
    aiProcessingEnabled: booleanValue(row, "ai_processing_enabled"),
    sourceResearchEnabled: booleanValue(row, "source_research_enabled"),
    contactResearchEnabled: booleanValue(row, "contact_research_enabled"),
    outreachDraftingEnabled: booleanValue(row, "outreach_drafting_enabled"),
    copyExportEnabled: booleanValue(row, "copy_export_enabled"),
    autonomousSendEnabled: booleanValue(row, "autonomous_send_enabled") as false,
    requireSourcePlanApproval: booleanValue(row, "require_source_plan_approval"),
    requireKnowledgeReview: booleanValue(row, "require_knowledge_review"),
    requireIcpReview: booleanValue(row, "require_icp_review"),
    requireLeadPlayReview: booleanValue(row, "require_lead_play_review"),
    requireContactReview: booleanValue(row, "require_contact_review"),
    requireOutreachReview: booleanValue(row, "require_outreach_review"),
    createdAt: requiredTimestamp(row, "created_at"),
    updatedAt: requiredTimestamp(row, "updated_at"),
  };

  if (mapped.tombstoneRetentionYears !== 7 || mapped.activeMaterialsMode !== TENANT_POLICY_ACTIVE_MATERIALS_MODE) {
    throw new Error("Invalid immutable tenant policy values returned by tenant repository.");
  }
  if (mapped.autonomousSendEnabled !== false) {
    throw new Error("Invalid autonomous send policy value returned by tenant repository.");
  }
  return mapped;
}
