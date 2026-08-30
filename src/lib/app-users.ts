import "server-only";

import { getDb, generateId, nowISO, type DbClient } from "@/lib/db";
import { isAppRole, type AppRole } from "@/lib/permissions";
import {
  LAUNCH_ROLES,
  MEMBERSHIP_STATUSES,
  TENANT_STATUSES,
  WORKSPACE_STATUSES,
  type LaunchRole,
  type MembershipStatus,
  type TenantStatus,
  type WorkspaceStatus,
} from "@/lib/tenancy/types";

export type AppUserStatus = "active" | "disabled";

export interface AppUser {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  status: AppUserStatus;
  created_by: string | null;
  is_team_lead: boolean;
  team_lead_user_id: string | null;
  team_lead_email: string | null;
  team_lead_display_name: string | null;
  team_label: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppUserSessionProfile {
  userId: string;
  email: string;
  displayName: string | null;
  role: AppRole | null;
  status: AppUserStatus | "pending";
}

export interface TenantSessionSelector {
  /** Omitted only for the trusted, unambiguous single-membership default. */
  tenantId?: unknown;
  /** undefined means omitted; null explicitly requests tenant-wide scope. */
  workspaceId?: unknown;
}

export interface TenantSessionScope {
  tenantId: string;
  workspaceId: string | null;
  membershipId: string;
  role: LaunchRole;
  roleBindingId: string;
}

export interface TenantSessionResolutionInput {
  authIdentityId: string;
  selector: TenantSessionSelector;
}

export interface TenantSessionResolver {
  resolve(input: TenantSessionResolutionInput): Promise<TenantSessionScope>;
}

export interface TenantSessionResolverOptions {
  /** Trusted server-owned clock; injectable only while constructing a resolver. */
  clock?: () => Date;
}

export type TenantScopeResolutionCode = "TENANT_SCOPE_REQUIRED" | "TENANT_SCOPE_UNAVAILABLE";

/** Generic, non-enumerating failure for tenant-scope resolution. */
export class TenantScopeResolutionError extends Error {
  readonly code: TenantScopeResolutionCode;

  constructor(code: TenantScopeResolutionCode = "TENANT_SCOPE_UNAVAILABLE") {
    super(code === "TENANT_SCOPE_REQUIRED" ? "A tenant selector is required." : "No valid tenant scope is available.");
    this.name = "TenantScopeResolutionError";
    this.code = code;
  }
}

export function createTenantSessionResolver(
  db?: DbClient,
  options: TenantSessionResolverOptions = {},
): TenantSessionResolver {
  const trustedClock = options.clock ?? (() => new Date());
  return {
    resolve: async (input) => {
      try {
        return await resolveTenantSessionScopeAt(input, db, trustedClock());
      } catch (error) {
        if (error instanceof TenantScopeResolutionError) throw error;
        throw new TenantScopeResolutionError();
      }
    },
  };
}

/**
 * Resolves tenant authority from storage. The caller's tenant/workspace values
 * are selectors only; membership and role authority always come from rows
 * read for the authenticated identity.
 */
export async function resolveTenantSessionScope(
  input: TenantSessionResolutionInput,
  db?: DbClient,
): Promise<TenantSessionScope> {
  return createTenantSessionResolver(db).resolve(input);
}

async function resolveTenantSessionScopeAt(
  input: TenantSessionResolutionInput,
  db: DbClient | undefined,
  now: Date,
): Promise<TenantSessionScope> {
  if (Number.isNaN(now.getTime())) throw new TenantScopeResolutionError();

  const workspaceSelector = parseWorkspaceSelector(input.selector.workspaceId);
  const tenantSelector = parseTenantSelector(input.selector.tenantId, workspaceSelector.provided);
  const authIdentityId = requireUuidSelector(input.authIdentityId, false);
  const client = db ?? await getDb();

  if (client.resolveTenantSessionBootstrap) {
    const rows = await client.resolveTenantSessionBootstrap({
      authIdentityId,
      tenantId: tenantSelector.value,
      workspaceSelectorProvided: workspaceSelector.provided,
      workspaceId: workspaceSelector.value,
    });
    return parseBootstrapTenantSessionRows(rows, tenantSelector, workspaceSelector);
  }

  // Keep the authority decision in one database statement. Besides avoiding a
  // read/disable/read TOCTOU window, this gives adapters one snapshot boundary
  // to implement and leaves no optional transaction marker for callers to omit.
  const rows = await client.prepare(
    `SELECT
       tenant.id AS tenant_id,
       tenant.status AS tenant_status,
       tenant.created_at AS tenant_created_at,
       tenant.updated_at AS tenant_updated_at,
       membership.id AS membership_id,
       membership.tenant_id AS membership_tenant_id,
       membership.auth_identity_id AS membership_auth_identity_id,
       membership.pending_identity_ref_hash AS membership_pending_identity_ref_hash,
       membership.workspace_id AS membership_workspace_id,
       membership.status AS membership_status,
       membership.invited_by_membership_id AS membership_invited_by_membership_id,
       membership.created_at AS membership_created_at,
       membership.updated_at AS membership_updated_at,
       workspace.id AS workspace_id,
       workspace.tenant_id AS workspace_tenant_id,
       workspace.status AS workspace_status,
       workspace.created_at AS workspace_created_at,
       workspace.updated_at AS workspace_updated_at,
       binding.id AS role_binding_id,
       binding.tenant_id AS role_binding_tenant_id,
       binding.membership_id AS role_binding_membership_id,
       binding.role AS role_binding_role,
       binding.created_at AS role_binding_created_at,
       binding.valid_from AS role_binding_valid_from,
       binding.revoked_at AS role_binding_revoked_at,
       binding.assigned_by_membership_id AS role_binding_assigned_by_membership_id,
       binding.reason_code AS role_binding_reason_code
     FROM tenants AS tenant
     JOIN tenant_memberships AS membership
       ON membership.tenant_id = tenant.id
      AND membership.auth_identity_id = ?
     LEFT JOIN workspaces AS workspace
       ON workspace.tenant_id = tenant.id
      AND workspace.id = CASE WHEN ? = 0 THEN membership.workspace_id ELSE ? END
     LEFT JOIN tenant_role_bindings AS binding
       ON binding.tenant_id = membership.tenant_id
      AND binding.membership_id = membership.id
     WHERE (? = 0 OR tenant.id = ?)
       AND (? = 1 OR membership.status = 'active')
     ORDER BY binding.valid_from ASC, binding.id ASC`,
  ).all<RawJoinedTenantSessionRow>(
    authIdentityId,
    workspaceSelector.provided ? 1 : 0,
    workspaceSelector.value,
    tenantSelector.provided ? 1 : 0,
    tenantSelector.value,
    tenantSelector.provided ? 1 : 0,
  );
  if (rows.length === 0) throw new TenantScopeResolutionError();

  const parsedRows = rows.map(parseJoinedTenantSessionRow);
  const tenant = parsedRows[0].tenant;
  const tenantId = tenant.id;
  if ((tenantSelector.provided && tenantId !== tenantSelector.value) || tenant.status !== "active") {
    throw new TenantScopeResolutionError();
  }
  for (const row of parsedRows) {
    if (!sameTenantRow(row.tenant, tenant)) throw new TenantScopeResolutionError();
  }

  const memberships = uniqueById(parsedRows.map((row) => row.membership));
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  if (activeMemberships.length !== 1) throw new TenantScopeResolutionError();
  const membership = activeMemberships[0];
  if (membership.tenantId !== tenantId || membership.authIdentityId !== authIdentityId) {
    throw new TenantScopeResolutionError();
  }

  const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
    parsedRows.map((row) => row.workspace),
    membership.workspaceId,
    workspaceSelector,
    tenantId,
  );

  const roleBindings = parsedRows
    .map((row) => row.roleBinding)
    .filter((binding): binding is ParsedRoleBindingScopeRow => binding !== null);
  const currentBindings = roleBindings.filter(
    (binding) => binding.revokedAt === null && binding.validFrom.getTime() <= now.getTime(),
  );
  if (currentBindings.length !== 1) throw new TenantScopeResolutionError();
  const roleBinding = currentBindings[0];
  if (roleBinding.tenantId !== tenantId || roleBinding.membershipId !== membership.id) {
    throw new TenantScopeResolutionError();
  }

  return {
    tenantId,
    workspaceId: effectiveWorkspaceId,
    membershipId: membership.id,
    role: roleBinding.role,
    roleBindingId: roleBinding.id,
  };
}

const BOOTSTRAP_SCOPE_KEYS = [
  "membership_id",
  "role",
  "role_binding_id",
  "tenant_id",
  "workspace_id",
] as const;

function parseBootstrapTenantSessionRows(
  rows: readonly Record<string, unknown>[],
  tenantSelector: { provided: boolean; value: string | null },
  workspaceSelector: { provided: boolean; value: string | null },
): TenantSessionScope {
  if (rows.length !== 1) throw new TenantScopeResolutionError();
  const row = rows[0];
  const keys = Object.keys(row).sort();
  if (keys.length !== BOOTSTRAP_SCOPE_KEYS.length
      || keys.some((key, index) => key !== BOOTSTRAP_SCOPE_KEYS[index])) {
    throw new TenantScopeResolutionError();
  }

  const tenantId = requiredUuid(row.tenant_id);
  const workspaceId = nullableUuid(row.workspace_id);
  const membershipId = requiredUuid(row.membership_id);
  const role = requiredEnum<LaunchRole>(row.role, launchRoleSet);
  const roleBindingId = requiredUuid(row.role_binding_id);
  if (tenantSelector.provided && tenantId !== tenantSelector.value) throw new TenantScopeResolutionError();
  if (workspaceSelector.provided && workspaceId !== workspaceSelector.value) {
    throw new TenantScopeResolutionError();
  }
  return { tenantId, workspaceId, membershipId, role, roleBindingId };
}

interface RawJoinedTenantSessionRow extends Record<string, unknown> {
  tenant_id: unknown;
  tenant_status: unknown;
  tenant_created_at: unknown;
  tenant_updated_at: unknown;
  membership_id: unknown;
  membership_tenant_id: unknown;
  membership_auth_identity_id: unknown;
  membership_pending_identity_ref_hash: unknown;
  membership_workspace_id: unknown;
  membership_status: unknown;
  membership_invited_by_membership_id: unknown;
  membership_created_at: unknown;
  membership_updated_at: unknown;
  workspace_id: unknown;
  workspace_tenant_id: unknown;
  workspace_status: unknown;
  workspace_created_at: unknown;
  workspace_updated_at: unknown;
  role_binding_id: unknown;
  role_binding_tenant_id: unknown;
  role_binding_membership_id: unknown;
  role_binding_role: unknown;
  role_binding_created_at: unknown;
  role_binding_valid_from: unknown;
  role_binding_revoked_at: unknown;
  role_binding_assigned_by_membership_id: unknown;
  role_binding_reason_code: unknown;
}

interface RawTenantScopeRow extends Record<string, unknown> {
  id: unknown;
  status: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface RawMembershipScopeRow extends Record<string, unknown> {
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

interface RawRoleBindingScopeRow extends Record<string, unknown> {
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

interface ParsedTenantScopeRow {
  id: string;
  status: TenantStatus;
}

interface ParsedMembershipScopeRow {
  id: string;
  tenantId: string;
  authIdentityId: string;
  workspaceId: string | null;
  status: MembershipStatus;
}

interface ParsedRoleBindingScopeRow {
  id: string;
  tenantId: string;
  membershipId: string;
  role: LaunchRole;
  validFrom: Date;
  revokedAt: Date | null;
}

interface ParsedWorkspaceScopeRow {
  id: string;
  tenantId: string;
  status: WorkspaceStatus;
}

interface ParsedJoinedTenantSessionRow {
  tenant: ParsedTenantScopeRow;
  membership: ParsedMembershipScopeRow;
  workspace: ParsedWorkspaceScopeRow | null;
  roleBinding: ParsedRoleBindingScopeRow | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const tenantStatusSet = new Set<string>(TENANT_STATUSES);
const workspaceStatusSet = new Set<string>(WORKSPACE_STATUSES);
const membershipStatusSet = new Set<string>(MEMBERSHIP_STATUSES);
const launchRoleSet = new Set<string>(LAUNCH_ROLES);
const roleBindingReasonSet = new Set([
  "initial_provisioning",
  "invitation",
  "role_change",
  "owner_replacement",
  "membership_reactivation",
  "administrative_correction",
]);

function requireUuidSelector(value: unknown, required: boolean): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TenantScopeResolutionError(required ? "TENANT_SCOPE_REQUIRED" : "TENANT_SCOPE_UNAVAILABLE");
  }
  return value.toLowerCase();
}

function parseTenantSelector(
  value: unknown,
  workspaceSelectorProvided: boolean,
): { provided: boolean; value: string | null } {
  if (value === undefined) {
    if (workspaceSelectorProvided) throw new TenantScopeResolutionError("TENANT_SCOPE_REQUIRED");
    return { provided: false, value: null };
  }
  return { provided: true, value: requireUuidSelector(value, true) };
}

function parseWorkspaceSelector(value: unknown): { provided: boolean; value: string | null } {
  if (value === undefined) return { provided: false, value: null };
  if (value === null) return { provided: true, value: null };
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TenantScopeResolutionError();
  return { provided: true, value: value.toLowerCase() };
}

function parseTenantScopeRow(row: RawTenantScopeRow): ParsedTenantScopeRow {
  const id = requiredUuid(row.id);
  const status = requiredEnum<TenantStatus>(row.status, tenantStatusSet);
  requiredTimestamp(row.created_at);
  requiredTimestamp(row.updated_at);
  return { id, status };
}

function parseJoinedTenantSessionRow(row: RawJoinedTenantSessionRow): ParsedJoinedTenantSessionRow {
  const tenant = parseTenantScopeRow({
    id: row.tenant_id,
    status: row.tenant_status,
    created_at: row.tenant_created_at,
    updated_at: row.tenant_updated_at,
  });
  const membership = parseMembershipScopeRow({
    id: row.membership_id,
    tenant_id: row.membership_tenant_id,
    auth_identity_id: row.membership_auth_identity_id,
    pending_identity_ref_hash: row.membership_pending_identity_ref_hash,
    workspace_id: row.membership_workspace_id,
    status: row.membership_status,
    invited_by_membership_id: row.membership_invited_by_membership_id,
    created_at: row.membership_created_at,
    updated_at: row.membership_updated_at,
  });
  const workspace = parseNullableWorkspaceScopeRow(row);
  const roleBinding = parseNullableRoleBindingScopeRow(row);
  return { tenant, membership, workspace, roleBinding };
}

function parseMembershipScopeRow(row: RawMembershipScopeRow): ParsedMembershipScopeRow {
  const authIdentityId = requiredUuid(row.auth_identity_id);
  const workspaceId = nullableUuid(row.workspace_id);
  if (row.pending_identity_ref_hash !== null && row.pending_identity_ref_hash !== undefined) {
    throw new TenantScopeResolutionError();
  }
  nullableUuid(row.invited_by_membership_id);
  requiredTimestamp(row.created_at);
  requiredTimestamp(row.updated_at);
  return {
    id: requiredUuid(row.id),
    tenantId: requiredUuid(row.tenant_id),
    authIdentityId,
    workspaceId,
    status: requiredEnum<MembershipStatus>(row.status, membershipStatusSet),
  };
}

function parseRoleBindingScopeRow(row: RawRoleBindingScopeRow): ParsedRoleBindingScopeRow {
  const role = requiredEnum<LaunchRole>(row.role, launchRoleSet);
  const reasonCode = requiredText(row.reason_code);
  if (!roleBindingReasonSet.has(reasonCode)) throw new TenantScopeResolutionError();
  requiredTimestamp(row.created_at);
  nullableUuid(row.assigned_by_membership_id);
  return {
    id: requiredUuid(row.id),
    tenantId: requiredUuid(row.tenant_id),
    membershipId: requiredUuid(row.membership_id),
    role,
    validFrom: requiredTimestamp(row.valid_from),
    revokedAt: nullableTimestamp(row.revoked_at),
  };
}

function parseNullableWorkspaceScopeRow(row: RawJoinedTenantSessionRow): ParsedWorkspaceScopeRow | null {
  const values = [row.workspace_id, row.workspace_tenant_id, row.workspace_status, row.workspace_created_at, row.workspace_updated_at];
  if (values.every((value) => value === null || value === undefined)) return null;
  if (values.some((value) => value === null || value === undefined)) throw new TenantScopeResolutionError();
  requiredTimestamp(row.workspace_created_at);
  requiredTimestamp(row.workspace_updated_at);
  return {
    id: requiredUuid(row.workspace_id),
    tenantId: requiredUuid(row.workspace_tenant_id),
    status: requiredEnum<WorkspaceStatus>(row.workspace_status, workspaceStatusSet),
  };
}

function parseNullableRoleBindingScopeRow(row: RawJoinedTenantSessionRow): ParsedRoleBindingScopeRow | null {
  const requiredValues = [
    row.role_binding_id,
    row.role_binding_tenant_id,
    row.role_binding_membership_id,
    row.role_binding_role,
    row.role_binding_created_at,
    row.role_binding_valid_from,
    row.role_binding_reason_code,
  ];
  const allValues = [...requiredValues, row.role_binding_revoked_at, row.role_binding_assigned_by_membership_id];
  if (allValues.every((value) => value === null || value === undefined)) return null;
  if (requiredValues.some((value) => value === null || value === undefined)) {
    throw new TenantScopeResolutionError();
  }
  return parseRoleBindingScopeRow({
    id: row.role_binding_id,
    tenant_id: row.role_binding_tenant_id,
    membership_id: row.role_binding_membership_id,
    role: row.role_binding_role,
    created_at: row.role_binding_created_at,
    valid_from: row.role_binding_valid_from,
    revoked_at: row.role_binding_revoked_at,
    assigned_by_membership_id: row.role_binding_assigned_by_membership_id,
    reason_code: row.role_binding_reason_code,
  });
}

function resolveEffectiveWorkspaceId(
  workspaces: readonly (ParsedWorkspaceScopeRow | null)[],
  assignedWorkspaceId: string | null,
  selector: { provided: boolean; value: string | null },
  tenantId: string,
): string | null {
  const effectiveWorkspaceId = assignedWorkspaceId === null
    ? (selector.provided ? selector.value : null)
    : (selector.provided ? selector.value : assignedWorkspaceId);
  if (assignedWorkspaceId !== null && selector.provided && selector.value !== assignedWorkspaceId) {
    throw new TenantScopeResolutionError();
  }
  if (effectiveWorkspaceId === null) {
    if (assignedWorkspaceId !== null) throw new TenantScopeResolutionError();
    return null;
  }
  const matchingWorkspaces = uniqueById(
    workspaces.filter((workspace): workspace is ParsedWorkspaceScopeRow => workspace !== null),
  );
  if (matchingWorkspaces.length !== 1) throw new TenantScopeResolutionError();
  const workspace = matchingWorkspaces[0];
  if (workspace.id !== effectiveWorkspaceId || workspace.tenantId !== tenantId || workspace.status !== "active") {
    throw new TenantScopeResolutionError();
  }
  return workspace.id;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TenantScopeResolutionError();
  return value;
}

function requiredUuid(value: unknown): string {
  const text = requiredText(value);
  if (!UUID_PATTERN.test(text)) throw new TenantScopeResolutionError();
  return text;
}

function nullableUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requiredUuid(value);
}

function requiredEnum<T extends string>(value: unknown, allowed: ReadonlySet<string>): T {
  const text = requiredText(value);
  if (!allowed.has(text)) throw new TenantScopeResolutionError();
  return text as T;
}

function requiredTimestamp(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : parseTimestampString(value);
  if (!date || Number.isNaN(date.getTime())) throw new TenantScopeResolutionError();
  return date;
}

function nullableTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return requiredTimestamp(value);
}

function parseTimestampString(value: unknown): Date | null {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return null;
  const date = new Date(value);
  return date.toISOString() === value ? date : null;
}

function sameTenantRow(left: ParsedTenantScopeRow, right: ParsedTenantScopeRow): boolean {
  return left.id === right.id && left.status === right.status;
}

function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const previous = unique.get(row.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new TenantScopeResolutionError();
    }
    unique.set(row.id, row);
  }
  return [...unique.values()];
}

export async function ensureAppUserForAuthUser(userId: string, email: string): Promise<AppUserSessionProfile> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getAppUserByUserId(userId);
  if (existing) {
    await updateLastSeen(userId);
    return toSessionProfile(existing);
  }

  const bootstrapEmail = normalizeEmail(process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL);
  const adminCount = await countAdminUsers();
  if (bootstrapEmail && normalizedEmail === bootstrapEmail && adminCount === 0) {
    const user = await createAppUserForAuthUser({
      userId,
      email: normalizedEmail,
      displayName: "Admin",
      role: "admin",
      status: "active",
      createdBy: null,
    });
    return toSessionProfile(user);
  }

  return {
    userId,
    email: normalizedEmail,
    displayName: null,
    role: null,
    status: "pending",
  };
}

export async function getAppUserByUserId(userId: string): Promise<AppUser | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM app_users WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
  return row ? parseAppUser(row) : null;
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM app_users WHERE lower(email) = lower(?)").get(normalizeEmail(email)) as Record<string, unknown> | undefined;
  return row ? parseAppUser(row) : null;
}

export async function listAppUsers(): Promise<AppUser[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT au.*, tl.email as team_lead_email, tl.display_name as team_lead_display_name
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     ORDER BY au.role ASC, lower(au.email) ASC`
  ).all<Record<string, unknown>>();
  return rows.map(parseAppUser);
}

export async function createAppUserForAuthUser(input: {
  userId: string;
  email: string;
  displayName?: string | null;
  role: AppRole;
  status?: AppUserStatus;
  createdBy?: string | null;
}): Promise<AppUser> {
  const db = await getDb();
  const now = nowISO();
  const role = isAppRole(input.role) ? input.role : "researcher";
  const status = input.status ?? "active";

  await db.prepare(
    `INSERT INTO app_users (
      id, user_id, email, display_name, role, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      role = excluded.role,
      status = excluded.status,
      updated_at = excluded.updated_at`
  ).run(
    generateId(),
    input.userId,
    normalizeEmail(input.email),
    input.displayName ?? null,
    role,
    status,
    input.createdBy ?? null,
    now,
    now,
  );

  const user = await getAppUserByUserId(input.userId);
  if (!user) throw new Error("Unable to create app user");
  return user;
}

export async function updateAppUserRole(userId: string, role: AppRole): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET role = ?, updated_at = ? WHERE user_id = ?")
    .run(role, nowISO(), userId);
}

export async function updateAppUserStatus(userId: string, status: AppUserStatus): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET status = ?, updated_at = ? WHERE user_id = ?")
    .run(status, nowISO(), userId);
}

export async function removeAppUser(userId: string): Promise<AppUser | null> {
  const db = await getDb();
  const existing = await getAppUserByUserId(userId);
  const now = nowISO();

  await db.prepare("UPDATE leads SET assigned_to_user_id = NULL WHERE assigned_to_user_id = ?")
    .run(userId);
  await db.prepare("UPDATE admin_requests SET assigned_admin_user_id = NULL WHERE assigned_admin_user_id = ?")
    .run(userId);
  await db.prepare("UPDATE app_users SET team_lead_user_id = NULL, updated_at = ? WHERE team_lead_user_id = ?")
    .run(now, userId);
  await db.prepare("DELETE FROM user_market_access WHERE user_id = ?")
    .run(userId);
  await db.prepare("DELETE FROM app_users WHERE user_id = ?")
    .run(userId);

  return existing;
}

export async function updateAppUserTeam(input: {
  userId: string;
  isTeamLead: boolean;
  teamLeadUserId?: string | null;
  teamLabel?: string | null;
}): Promise<AppUser | null> {
  const db = await getDb();
  const teamLeadUserId = !input.isTeamLead && input.teamLeadUserId && input.teamLeadUserId !== input.userId ? input.teamLeadUserId : null;
  await db.prepare(
    `UPDATE app_users
     SET is_team_lead = ?, team_lead_user_id = ?, team_label = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(input.isTeamLead ? 1 : 0, teamLeadUserId, normalizeOptionalText(input.teamLabel), nowISO(), input.userId);
  const row = await db.prepare(
    `SELECT au.*, tl.email as team_lead_email, tl.display_name as team_lead_display_name
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     WHERE au.user_id = ?`
  ).get<Record<string, unknown>>(input.userId);
  return row ? parseAppUser(row) : null;
}

async function countAdminUsers(): Promise<number> {
  const db = await getDb();
  const row = await db.prepare(
    "SELECT COUNT(*) as c FROM app_users WHERE role = 'admin'"
  ).get<{ c: number }>();
  return Number(row?.c ?? 0);
}

async function updateLastSeen(userId: string): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET last_seen_at = ?, updated_at = ? WHERE user_id = ?")
    .run(nowISO(), nowISO(), userId);
}

function parseAppUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    email: String(row.email),
    display_name: row.display_name ? String(row.display_name) : null,
    role: isAppRole(row.role) ? row.role : "researcher",
    status: row.status === "disabled" ? "disabled" : "active",
    created_by: row.created_by ? String(row.created_by) : null,
    is_team_lead: row.is_team_lead === true || row.is_team_lead === 1,
    team_lead_user_id: row.team_lead_user_id ? String(row.team_lead_user_id) : null,
    team_lead_email: row.team_lead_email ? String(row.team_lead_email) : null,
    team_lead_display_name: row.team_lead_display_name ? String(row.team_lead_display_name) : null,
    team_label: row.team_label ? String(row.team_label) : null,
    last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toSessionProfile(user: AppUser): AppUserSessionProfile {
  return {
    userId: user.user_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
  };
}

function normalizeEmail(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}
