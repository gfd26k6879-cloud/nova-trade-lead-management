import type { DbClient } from "@/lib/db";
import type { TenantSession } from "@/lib/auth";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";
import {
  LAUNCH_ROLES,
  PLATFORM_SUPPORT_ROLE,
  SUPPORT_ACCESS_GRANT_DATA_CLASSES,
  SUPPORT_ACCESS_GRANT_PERMISSIONS,
  type AuthIdentityId,
  type LaunchRole,
  type MembershipStatus,
  type SupportAccessGrant,
} from "@/lib/tenancy/types";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value as DeepReadonly<T>;
}

const FIXTURE_TIME_BOUNDARIES = {
  fixtureCreatedAt: "2026-01-01T00:00:00.000Z",
  supportStartsAt: "2026-01-01T00:00:00.000Z",
  supportApprovedAt: "2026-01-01T00:05:00.000Z",
  supportRevokedAt: "2026-01-01T00:10:00.000Z",
  supportActiveAt: "2026-01-01T00:06:00.000Z",
  supportExpiryBoundary: "2026-01-02T00:00:00.000Z",
  revokedGrantExpiry: "2026-01-03T00:00:00.000Z",
} as const;

const TENANT_IDS = {
  A: "10000000-0000-4000-8000-000000000001",
  B: "10000000-0000-4000-8000-000000000002",
} as const;

const WORKSPACE_IDS = {
  A: "20000000-0000-4000-8000-000000000001",
  B: "20000000-0000-4000-8000-000000000002",
  A_SIBLING: "20000000-0000-4000-8000-000000000003",
  B_SIBLING: "20000000-0000-4000-8000-000000000004",
} as const;

const SUPPORT_ACTOR_ID = "90000000-0000-4000-8000-000000000001";
const SHARED_IDENTITY_ID = "90000000-0000-4000-8000-000000000002";

const ROLE_IDENTITY_IDS = {
  A: {
    admin: "90000000-0000-4000-8000-000000000003",
    strategist_manager: "90000000-0000-4000-8000-000000000004",
    researcher: "90000000-0000-4000-8000-000000000005",
    reviewer: "90000000-0000-4000-8000-000000000006",
    outreach_operator: "90000000-0000-4000-8000-000000000007",
    analyst_read_only: "90000000-0000-4000-8000-000000000008",
  },
  B: {
    admin: "90000000-0000-4000-8000-000000000009",
    strategist_manager: "90000000-0000-4000-8000-00000000000a",
    researcher: "90000000-0000-4000-8000-00000000000b",
    reviewer: "90000000-0000-4000-8000-00000000000c",
    outreach_operator: "90000000-0000-4000-8000-00000000000d",
    analyst_read_only: "90000000-0000-4000-8000-00000000000e",
  },
} as const;

const INACTIVE_IDENTITY_IDS = {
  A: {
    suspended: "90000000-0000-4000-8000-00000000000f",
    disabled: "90000000-0000-4000-8000-000000000010",
  },
  B: {
    suspended: "90000000-0000-4000-8000-000000000011",
    disabled: "90000000-0000-4000-8000-000000000012",
  },
} as const;

const MEMBERSHIP_IDS = {
  A: {
    owner: "30000000-0000-4000-8000-000000000001",
    admin: "30000000-0000-4000-8000-000000000002",
    strategist_manager: "30000000-0000-4000-8000-000000000003",
    researcher: "30000000-0000-4000-8000-000000000004",
    reviewer: "30000000-0000-4000-8000-000000000005",
    outreach_operator: "30000000-0000-4000-8000-000000000006",
    analyst_read_only: "30000000-0000-4000-8000-000000000007",
    pending: "30000000-0000-4000-8000-000000000008",
    suspended: "30000000-0000-4000-8000-000000000009",
    disabled: "30000000-0000-4000-8000-00000000000a",
  },
  B: {
    owner: "30000000-0000-4000-8000-00000000000b",
    admin: "30000000-0000-4000-8000-00000000000c",
    strategist_manager: "30000000-0000-4000-8000-00000000000d",
    researcher: "30000000-0000-4000-8000-00000000000e",
    reviewer: "30000000-0000-4000-8000-00000000000f",
    outreach_operator: "30000000-0000-4000-8000-000000000010",
    analyst_read_only: "30000000-0000-4000-8000-000000000011",
    pending: "30000000-0000-4000-8000-000000000012",
    suspended: "30000000-0000-4000-8000-000000000013",
    disabled: "30000000-0000-4000-8000-000000000014",
  },
} as const;

const ROLE_BINDING_IDS = {
  A: {
    owner: "40000000-0000-4000-8000-000000000001",
    admin: "40000000-0000-4000-8000-000000000002",
    strategist_manager: "40000000-0000-4000-8000-000000000003",
    researcher: "40000000-0000-4000-8000-000000000004",
    reviewer: "40000000-0000-4000-8000-000000000005",
    outreach_operator: "40000000-0000-4000-8000-000000000006",
    analyst_read_only: "40000000-0000-4000-8000-000000000007",
  },
  B: {
    owner: "40000000-0000-4000-8000-000000000008",
    admin: "40000000-0000-4000-8000-000000000009",
    strategist_manager: "40000000-0000-4000-8000-00000000000a",
    researcher: "40000000-0000-4000-8000-00000000000b",
    reviewer: "40000000-0000-4000-8000-00000000000c",
    outreach_operator: "40000000-0000-4000-8000-00000000000d",
    analyst_read_only: "40000000-0000-4000-8000-00000000000e",
  },
} as const;

const POLICY_IDS = {
  A: "50000000-0000-4000-8000-000000000001",
  B: "50000000-0000-4000-8000-000000000002",
} as const;

const SUPPORT_GRANT_IDS = {
  approvedTenantA: "60000000-0000-4000-8000-000000000001",
  revokedTenantB: "60000000-0000-4000-8000-000000000002",
} as const;

const AUDIT_EVENT_IDS = {
  approvedTenantA: "70000000-0000-4000-8000-000000000001",
  revokedTenantB: "70000000-0000-4000-8000-000000000002",
} as const;

// These are deliberately workspace records, not a new fixture-only table: workspaces are
// already tenant-owned and therefore exercise the same selector shape in every test lane.
const LOOK_ALIKE_RECORD_IDS = {
  tenantAWorkspace: WORKSPACE_IDS.A,
  tenantBWorkspace: WORKSPACE_IDS.B,
} as const;

const FIXTURE_LABEL = "shared-synthetic-external-resource";
const SHARED_WORKSPACE_LABEL = "Shared Synthetic Workspace";
const SHARED_TENANT_LABEL = "Shared Synthetic Tenant";

const pendingHash = (hex: string): string => hex.repeat(64);

export const CANONICAL_TENANT_FIXTURE_CATALOG = deepFreeze({
  behavior: {
    repeatSetup: "fail_before_insert_if_any_reserved_fixture_row_exists",
    fullFixtureLifetime: "rollback_only_including_support_grant_history_and_callback_writes",
    committedCoreCleanup: "delete_only_exact_cleanup_safe_core_ids_without_support_grant_history",
    concurrentSetup: "coordinator_serialization_or_database_unique_constraints_must_choose_one_commit",
  },
  timeBoundaries: FIXTURE_TIME_BOUNDARIES,
  labels: {
    overlappingExternalResourceLabel: FIXTURE_LABEL,
    tenantName: SHARED_TENANT_LABEL,
    workspaceName: SHARED_WORKSPACE_LABEL,
    workspaceSlug: "shared-workspace",
  },
  tenants: [
    { key: "A", id: TENANT_IDS.A, slug: "synthetic-tenant-a", name: SHARED_TENANT_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { key: "B", id: TENANT_IDS.B, slug: "synthetic-tenant-b", name: SHARED_TENANT_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
  ],
  workspaces: [
    { key: "A", id: WORKSPACE_IDS.A, tenantKey: "A", tenantId: TENANT_IDS.A, slug: "shared-workspace", name: SHARED_WORKSPACE_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { key: "B", id: WORKSPACE_IDS.B, tenantKey: "B", tenantId: TENANT_IDS.B, slug: "shared-workspace", name: SHARED_WORKSPACE_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { key: "A_SIBLING", id: WORKSPACE_IDS.A_SIBLING, tenantKey: "A", tenantId: TENANT_IDS.A, slug: "shared-workspace-sibling", name: SHARED_WORKSPACE_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { key: "B_SIBLING", id: WORKSPACE_IDS.B_SIBLING, tenantKey: "B", tenantId: TENANT_IDS.B, slug: "shared-workspace-sibling", name: SHARED_WORKSPACE_LABEL, expectedState: "active", overlappingExternalResourceLabel: FIXTURE_LABEL },
  ],
  lookAlikeRecords: [
    { id: LOOK_ALIKE_RECORD_IDS.tenantAWorkspace, tenantKey: "A", tenantId: TENANT_IDS.A, entity: "workspace", selector: "shared-workspace", expectedState: "tenant_a_only", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { id: LOOK_ALIKE_RECORD_IDS.tenantBWorkspace, tenantKey: "B", tenantId: TENANT_IDS.B, entity: "workspace", selector: "shared-workspace", expectedState: "tenant_b_only", overlappingExternalResourceLabel: FIXTURE_LABEL },
  ],
  identities: [
    { id: SUPPORT_ACTOR_ID, tenantKey: "platform", relationship: "support_actor_only", expectedState: "platform_support", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { id: SHARED_IDENTITY_ID, tenantKey: "platform", relationship: "shared_identity_with_memberships_in_A_and_B", expectedState: "authenticated_identity_only", overlappingExternalResourceLabel: FIXTURE_LABEL },
    ...Object.values(ROLE_IDENTITY_IDS).flatMap((tenantRoles, index) => Object.entries(tenantRoles).map(([role, id]) => ({ id, tenantKey: index === 0 ? "A" : "B", relationship: "one_tenant_role_identity", role, expectedState: "authenticated_identity_only", overlappingExternalResourceLabel: FIXTURE_LABEL }))),
    ...Object.values(INACTIVE_IDENTITY_IDS).flatMap((tenantIdentities, index) => Object.entries(tenantIdentities).map(([membershipState, id]) => ({ id, tenantKey: index === 0 ? "A" : "B", relationship: "inactive_membership_identity", membershipState, expectedState: "authenticated_identity_only", overlappingExternalResourceLabel: FIXTURE_LABEL }))),
  ],
  memberships: [
    ...(["A", "B"] as const).flatMap((tenantKey) => [
      ...LAUNCH_ROLES.map((role) => ({ id: MEMBERSHIP_IDS[tenantKey][role], tenantKey, tenantId: TENANT_IDS[tenantKey], authIdentityId: role === "owner" ? SHARED_IDENTITY_ID : ROLE_IDENTITY_IDS[tenantKey][role], workspaceId: WORKSPACE_IDS[tenantKey], status: "active", role, expectedState: "active_current_role", overlappingExternalResourceLabel: FIXTURE_LABEL })),
      { id: MEMBERSHIP_IDS[tenantKey].pending, tenantKey, tenantId: TENANT_IDS[tenantKey], authIdentityId: null, pendingIdentityRefHash: pendingHash(tenantKey === "A" ? "a" : "b"), workspaceId: WORKSPACE_IDS[tenantKey], status: "pending", expectedState: "pending_no_access", overlappingExternalResourceLabel: FIXTURE_LABEL },
      { id: MEMBERSHIP_IDS[tenantKey].suspended, tenantKey, tenantId: TENANT_IDS[tenantKey], authIdentityId: INACTIVE_IDENTITY_IDS[tenantKey].suspended, workspaceId: WORKSPACE_IDS[tenantKey], status: "suspended", expectedState: "suspended_no_new_access", overlappingExternalResourceLabel: FIXTURE_LABEL },
      { id: MEMBERSHIP_IDS[tenantKey].disabled, tenantKey, tenantId: TENANT_IDS[tenantKey], authIdentityId: INACTIVE_IDENTITY_IDS[tenantKey].disabled, workspaceId: WORKSPACE_IDS[tenantKey], status: "disabled", expectedState: "disabled_no_access", overlappingExternalResourceLabel: FIXTURE_LABEL },
    ]),
  ],
  roleBindings: (["A", "B"] as const).flatMap((tenantKey) => LAUNCH_ROLES.map((role) => ({ id: ROLE_BINDING_IDS[tenantKey][role], tenantKey, tenantId: TENANT_IDS[tenantKey], membershipId: MEMBERSHIP_IDS[tenantKey][role], role, expectedState: "current_unrevoked", overlappingExternalResourceLabel: FIXTURE_LABEL }))),
  policies: [
    { id: POLICY_IDS.A, tenantKey: "A", tenantId: TENANT_IDS.A, version: 1, expectedState: "active_fail_closed_with_ai_processing_enabled", controlledDifference: "aiProcessingEnabled=true", overlappingExternalResourceLabel: FIXTURE_LABEL },
    { id: POLICY_IDS.B, tenantKey: "B", tenantId: TENANT_IDS.B, version: 1, expectedState: "active_fail_closed_with_ai_processing_disabled", controlledDifference: "aiProcessingEnabled=false", overlappingExternalResourceLabel: FIXTURE_LABEL },
  ],
  supportGrants: [
    { id: SUPPORT_GRANT_IDS.approvedTenantA, tenantKey: "A", tenantId: TENANT_IDS.A, workspaceId: WORKSPACE_IDS.A, expectedState: "approved_bounded_active_then_expired", overlappingExternalResourceLabel: FIXTURE_LABEL, permissionAnchor: "tenant:read", dataClassAnchor: "tenant_metadata", permissions: ["tenant:read", "workspace:read", "audit:read"], dataClasses: ["tenant_metadata", "workspace_metadata", "audit_operational_metadata"] },
    { id: SUPPORT_GRANT_IDS.revokedTenantB, tenantKey: "B", tenantId: TENANT_IDS.B, workspaceId: WORKSPACE_IDS.B, expectedState: "revoked_denied", overlappingExternalResourceLabel: FIXTURE_LABEL, permissionAnchor: "tenant:read", dataClassAnchor: "tenant_metadata", permissions: ["tenant:read", "workspace:read", "audit:read"], dataClasses: ["tenant_metadata", "workspace_metadata", "audit_operational_metadata"] },
  ],
} as const);

export const CANONICAL_TENANT_FIXTURE_IDS = deepFreeze({
  tenants: TENANT_IDS,
  workspaces: WORKSPACE_IDS,
  supportActorAuthIdentityId: SUPPORT_ACTOR_ID,
  sharedAuthIdentityId: SHARED_IDENTITY_ID,
  roleIdentityIds: ROLE_IDENTITY_IDS,
  inactiveIdentityIds: INACTIVE_IDENTITY_IDS,
  memberships: MEMBERSHIP_IDS,
  roleBindings: ROLE_BINDING_IDS,
  policies: POLICY_IDS,
  supportGrants: SUPPORT_GRANT_IDS,
  auditEvents: AUDIT_EVENT_IDS,
  lookAlikeRecords: LOOK_ALIKE_RECORD_IDS,
} as const);

export const CANONICAL_TENANT_FIXTURE_ROLE_COUNT = LAUNCH_ROLES.length;
export const CANONICAL_TENANT_FIXTURE_COUNTS = deepFreeze({
  tenants: 2,
  workspaces: 4,
  identities: 18,
  activeMemberships: 14,
  inactiveMemberships: 6,
  memberships: 20,
  currentRoleBindings: 14,
  policies: 2,
  supportGrants: 2,
  supportGrantPermissions: 6,
  supportGrantDataClasses: 6,
} as const);

export interface CanonicalTenantFixtureTransactionScope {
  db: DbClient;
  repository: TenantQueryRepository;
}

export type CanonicalTenantFixtureTransactionRunner = <T>(
  callback: (scope: CanonicalTenantFixtureTransactionScope) => Promise<T>,
) => Promise<T>;

/** The approved harness must acquire one transaction and bind both scope members to it. */
export interface CanonicalTenantFixtureTransactionCoordinator {
  withTransaction: CanonicalTenantFixtureTransactionRunner;
}

export interface CanonicalTenantFixtureSetupOptions {
  transaction: CanonicalTenantFixtureTransactionCoordinator;
}

export interface CanonicalTenantFixtureSet {
  readonly db: DbClient;
  readonly catalog: typeof CANONICAL_TENANT_FIXTURE_CATALOG;
  readonly tenants: readonly Awaited<ReturnType<TenantQueryRepository["createTenant"]>>[];
  readonly workspaces: readonly Awaited<ReturnType<TenantQueryRepository["createWorkspace"]>>[];
  readonly memberships: readonly Awaited<ReturnType<TenantQueryRepository["createMembership"]>>[];
  readonly roleBindings: readonly Awaited<ReturnType<TenantQueryRepository["createRoleBinding"]>>[];
  readonly policies: readonly Awaited<ReturnType<TenantQueryRepository["createTenantPolicy"]>>[];
  readonly supportGrants: readonly SupportAccessGrant[];
}

export function createCanonicalTenantFixtureTransactionCoordinator(
  runner: CanonicalTenantFixtureTransactionRunner,
): CanonicalTenantFixtureTransactionCoordinator {
  return Object.freeze({ withTransaction: runner });
}

/**
 * Commits only the cleanup-safe canonical core. Support grant history is
 * deliberately excluded because the production schemas make its scope rows
 * immutable and deletion-proof.
 */
export async function setupCanonicalTenantCoreFixtures({ transaction }: CanonicalTenantFixtureSetupOptions): Promise<CanonicalTenantFixtureSet> {
  let fixture!: CanonicalTenantFixtureSet;
  await transaction.withTransaction(async (scope) => {
    fixture = await populateCanonicalTenantFixtures(scope, false);
  });
  return fixture;
}

async function populateCanonicalTenantFixtures(
  scope: CanonicalTenantFixtureTransactionScope,
  includeSupportHistory: boolean,
): Promise<CanonicalTenantFixtureSet> {
  const tenants: Awaited<ReturnType<TenantQueryRepository["createTenant"]>>[] = [];
  const workspaces: Awaited<ReturnType<TenantQueryRepository["createWorkspace"]>>[] = [];
  const memberships: Awaited<ReturnType<TenantQueryRepository["createMembership"]>>[] = [];
  const roleBindings: Awaited<ReturnType<TenantQueryRepository["createRoleBinding"]>>[] = [];
  const policies: Awaited<ReturnType<TenantQueryRepository["createTenantPolicy"]>>[] = [];
  const supportGrants: SupportAccessGrant[] = [];

  const transactionRepository = scope.repository;
  await assertFixtureIdsAreUnused(scope.db, includeSupportHistory);
  for (const tenantKey of ["A", "B"] as const) {
    tenants.push(await transactionRepository.createTenant({
      id: TENANT_IDS[tenantKey], slug: `synthetic-tenant-${tenantKey.toLowerCase()}`, name: SHARED_TENANT_LABEL,
      status: "active", locale: "en-US", timezone: "UTC", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
    }));
  }

  for (const tenantKey of ["A", "B"] as const) {
    for (const [id, slug] of [[WORKSPACE_IDS[tenantKey], "shared-workspace"], [WORKSPACE_IDS[`${tenantKey}_SIBLING` as "A_SIBLING" | "B_SIBLING"], "shared-workspace-sibling"]] as const) workspaces.push(await transactionRepository.createWorkspace(TENANT_IDS[tenantKey], {
      id, slug, name: SHARED_WORKSPACE_LABEL,
      status: "active", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
    }));
  }

  for (const tenantKey of ["A", "B"] as const) {
    const ownerMembershipId = MEMBERSHIP_IDS[tenantKey].owner;
    for (const role of LAUNCH_ROLES) {
      const membershipId = MEMBERSHIP_IDS[tenantKey][role];
      memberships.push(await transactionRepository.createMembership(TENANT_IDS[tenantKey], {
        id: membershipId,
        authIdentityId: role === "owner" ? SHARED_IDENTITY_ID : ROLE_IDENTITY_IDS[tenantKey][role],
        workspaceId: WORKSPACE_IDS[tenantKey], status: "active", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
      }));
      roleBindings.push(await transactionRepository.createRoleBinding(TENANT_IDS[tenantKey], {
        id: ROLE_BINDING_IDS[tenantKey][role], membershipId, role,
        createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, validFrom: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
        assignedByMembershipId: role === "owner" ? null : ownerMembershipId, reasonCode: "initial_provisioning",
      }));
    }
    memberships.push(await transactionRepository.createMembership(TENANT_IDS[tenantKey], {
      id: MEMBERSHIP_IDS[tenantKey].pending, pendingIdentityRefHash: pendingHash(tenantKey === "A" ? "a" : "b"),
      workspaceId: WORKSPACE_IDS[tenantKey], status: "pending", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
    }));
    memberships.push(await transactionRepository.createMembership(TENANT_IDS[tenantKey], {
      id: MEMBERSHIP_IDS[tenantKey].suspended, authIdentityId: INACTIVE_IDENTITY_IDS[tenantKey].suspended,
      workspaceId: WORKSPACE_IDS[tenantKey], status: "suspended", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
    }));
    memberships.push(await transactionRepository.createMembership(TENANT_IDS[tenantKey], {
      id: MEMBERSHIP_IDS[tenantKey].disabled, authIdentityId: INACTIVE_IDENTITY_IDS[tenantKey].disabled,
      workspaceId: WORKSPACE_IDS[tenantKey], status: "disabled", createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
    }));
  }

  policies.push(await transactionRepository.createTenantPolicy(TENANT_IDS.A, {
    id: POLICY_IDS.A, aiProcessingEnabled: true, createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
  }));
  policies.push(await transactionRepository.createTenantPolicy(TENANT_IDS.B, {
    id: POLICY_IDS.B, aiProcessingEnabled: false, createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
  }));

  if (includeSupportHistory) {
    supportGrants.push(await insertSupportGrant(scope.db, {
      id: SUPPORT_GRANT_IDS.approvedTenantA, tenantId: TENANT_IDS.A, workspaceId: WORKSPACE_IDS.A,
      approvedByAuthIdentityId: SHARED_IDENTITY_ID, state: "approved", approvedAt: FIXTURE_TIME_BOUNDARIES.supportApprovedAt,
      revokedByAuthIdentityId: null, revokedAt: null, expiresAt: FIXTURE_TIME_BOUNDARIES.supportExpiryBoundary, auditEventId: AUDIT_EVENT_IDS.approvedTenantA,
    }));
    supportGrants.push(await insertSupportGrant(scope.db, {
      id: SUPPORT_GRANT_IDS.revokedTenantB, tenantId: TENANT_IDS.B, workspaceId: WORKSPACE_IDS.B,
      approvedByAuthIdentityId: SHARED_IDENTITY_ID, state: "revoked", approvedAt: FIXTURE_TIME_BOUNDARIES.supportApprovedAt,
      revokedByAuthIdentityId: SHARED_IDENTITY_ID, revokedAt: FIXTURE_TIME_BOUNDARIES.supportRevokedAt, expiresAt: FIXTURE_TIME_BOUNDARIES.revokedGrantExpiry, auditEventId: AUDIT_EVENT_IDS.revokedTenantB,
    }));
  }
  await assertCanonicalTenantFixtureIsolation(scope, includeSupportHistory);

  return { db: scope.db, catalog: CANONICAL_TENANT_FIXTURE_CATALOG, tenants, workspaces, memberships, roleBindings, policies, supportGrants };
}

/**
 * Installs the full fixture, including immutable support grant history, and
 * always rolls the enclosing transaction back after the callback.
 */
export async function withCanonicalTenantFixtures<T>(
  options: CanonicalTenantFixtureSetupOptions,
  callback: (fixture: CanonicalTenantFixtureSet, scope: CanonicalTenantFixtureTransactionScope) => Promise<T> | T,
): Promise<T> {
  const rollback = Symbol("canonical-tenant-fixture-rollback");
  let result!: T;
  try {
    await options.transaction.withTransaction(async (scope) => {
      const fixture = await populateCanonicalTenantFixtures(scope, true);
      result = await callback(fixture, scope);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

/**
 * Deletes only fixed cleanup-safe core IDs, in FK-safe order. It never touches
 * immutable support grant history. Missing rows are not an error and unrelated
 * rows cannot match a reserved ID predicate.
 */
export async function cleanupCanonicalTenantCoreFixtures({ transaction }: CanonicalTenantFixtureSetupOptions): Promise<void> {
  await transaction.withTransaction(async ({ db }) => {
    const remove = async (table: string, column: string, ids: readonly string[]) => {
      const placeholders = ids.map(() => "?").join(", ");
      await db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...ids);
    };
    await remove("tenant_role_bindings", "id", Object.values(ROLE_BINDING_IDS).flatMap(Object.values));
    await remove("tenant_memberships", "id", Object.values(MEMBERSHIP_IDS).flatMap(Object.values));
    await remove("tenant_policies", "id", Object.values(POLICY_IDS));
    await remove("workspaces", "id", Object.values(WORKSPACE_IDS));
    await remove("tenants", "id", Object.values(TENANT_IDS));
  });
}

export async function assertCanonicalTenantFixtureIsolation(
  scope: CanonicalTenantFixtureTransactionScope,
  includeSupportHistory: boolean,
): Promise<void> {
  const { db } = scope;
  const tenantRows = await db.prepare("SELECT id, slug, name FROM tenants WHERE id IN (?, ?) ORDER BY id").all<{ id: string; slug: string; name: string }>(TENANT_IDS.A, TENANT_IDS.B);
  if (tenantRows.length !== 2 || tenantRows[0].id === tenantRows[1].id || tenantRows[0].name !== tenantRows[1].name) throw new Error("Canonical tenant identity or overlap invariant failed.");
  const workspaceRows = await db.prepare("SELECT id, tenant_id, slug, name FROM workspaces WHERE id IN (?, ?) ORDER BY id").all<{ id: string; tenant_id: string; slug: string; name: string }>(WORKSPACE_IDS.A, WORKSPACE_IDS.B);
  if (workspaceRows.length !== 2 || workspaceRows[0].tenant_id === workspaceRows[1].tenant_id || workspaceRows[0].slug !== workspaceRows[1].slug || workspaceRows[0].name !== workspaceRows[1].name) throw new Error("Canonical workspace overlap invariant failed.");
  const membershipRows = await db.prepare("SELECT id, tenant_id, auth_identity_id, status FROM tenant_memberships WHERE tenant_id IN (?, ?) ORDER BY tenant_id, id").all<{ id: string; tenant_id: string; auth_identity_id: string | null; status: MembershipStatus }>(TENANT_IDS.A, TENANT_IDS.B);
  if (membershipRows.length !== CANONICAL_TENANT_FIXTURE_COUNTS.memberships) throw new Error("Canonical membership count invariant failed.");
  const shared = membershipRows.filter((row) => row.auth_identity_id === SHARED_IDENTITY_ID);
  if (shared.length !== 2 || new Set(shared.map((row) => row.tenant_id)).size !== 2) throw new Error("Shared identity membership separation invariant failed.");
  const currentRoleRows = await db.prepare("SELECT tenant_id, membership_id, role FROM tenant_role_bindings WHERE tenant_id IN (?, ?) AND revoked_at IS NULL ORDER BY tenant_id, id").all<{ tenant_id: string; membership_id: string; role: LaunchRole }>(TENANT_IDS.A, TENANT_IDS.B);
  if (currentRoleRows.length !== CANONICAL_TENANT_FIXTURE_COUNTS.currentRoleBindings || ![TENANT_IDS.A, TENANT_IDS.B].every((tenantId) => LAUNCH_ROLES.every((role) => currentRoleRows.some((row) => row.tenant_id === tenantId && row.role === role)))) throw new Error("Canonical role binding invariant failed.");
  const policies = await db.prepare("SELECT tenant_id, ai_processing_enabled FROM tenant_policies WHERE tenant_id IN (?, ?) ORDER BY tenant_id").all<{ tenant_id: string; ai_processing_enabled: unknown }>(TENANT_IDS.A, TENANT_IDS.B);
  if (policies.length !== 2 || normalizeDatabaseBoolean(policies[0].ai_processing_enabled) !== true || normalizeDatabaseBoolean(policies[1].ai_processing_enabled) !== false) throw new Error("Canonical fail-closed policy difference invariant failed.");
  const supportRows = await db.prepare("SELECT id, tenant_id, state, starts_at, expires_at, revoked_at FROM support_access_grants WHERE id IN (?, ?) ORDER BY id").all<{ id: string; tenant_id: string; state: string; starts_at: string; expires_at: string; revoked_at: string | null }>(SUPPORT_GRANT_IDS.approvedTenantA, SUPPORT_GRANT_IDS.revokedTenantB);
  if (includeSupportHistory) {
    if (supportRows.length !== 2 || supportRows[0].state !== "approved" || supportRows[1].state !== "revoked" || supportRows[0].starts_at >= FIXTURE_TIME_BOUNDARIES.supportActiveAt || supportRows[0].expires_at <= FIXTURE_TIME_BOUNDARIES.supportActiveAt || supportRows[1].revoked_at === null) throw new Error("Canonical support grant scope/expiry invariant failed.");
  } else if (supportRows.length !== 0) {
    throw new Error("Canonical cleanup-safe core unexpectedly created support grant history.");
  }
  const tenantBFromTenantA = await db.prepare("SELECT id FROM tenant_memberships WHERE tenant_id = ? AND id = ?").get(TENANT_IDS.A, MEMBERSHIP_IDS.B.owner);
  if (tenantBFromTenantA !== undefined) throw new Error("Cross-tenant membership query unexpectedly returned a row.");
  const tenantAWorkspacesForB = await db.prepare("SELECT id FROM workspaces WHERE tenant_id = ? AND id = ?").all(TENANT_IDS.A, WORKSPACE_IDS.B);
  if (tenantAWorkspacesForB.length !== 0) throw new Error("Cross-tenant workspace query unexpectedly returned rows.");
}

export function normalizeDatabaseBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error("Expected a database boolean represented as true, false, 1, or 0.");
}

async function assertFixtureIdsAreUnused(db: DbClient, includeSupportHistory: boolean): Promise<void> {
  const checks: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["tenants", Object.values(TENANT_IDS)], ["workspaces", Object.values(WORKSPACE_IDS)],
    ["tenant_memberships", Object.values(MEMBERSHIP_IDS).flatMap(Object.values)], ["tenant_role_bindings", Object.values(ROLE_BINDING_IDS).flatMap(Object.values)],
    ["tenant_policies", Object.values(POLICY_IDS)],
    ...(includeSupportHistory ? [["support_access_grants", Object.values(SUPPORT_GRANT_IDS)] as const] : []),
  ];
  for (const [table, ids] of checks) {
    const placeholders = ids.map(() => "?").join(", ");
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${placeholders})`).get<{ count: number | string }>(...ids);
    if (Number(row?.count ?? 0) !== 0) throw new Error(`Canonical tenant fixture setup refuses existing reserved rows in ${table}.`);
  }
}

interface SupportGrantInsertInput {
  id: string;
  tenantId: string;
  workspaceId: string;
  approvedByAuthIdentityId: string;
  state: "approved" | "revoked";
  approvedAt: string;
  revokedByAuthIdentityId: string | null;
  revokedAt: string | null;
  expiresAt: string;
  auditEventId: string;
}

async function insertSupportGrant(db: DbClient, input: SupportGrantInsertInput): Promise<SupportAccessGrant> {
  const permissions = ["tenant:read", "workspace:read", "audit:read"] as const satisfies readonly (typeof SUPPORT_ACCESS_GRANT_PERMISSIONS[number])[];
  const dataClasses = ["tenant_metadata", "workspace_metadata", "audit_operational_metadata"] as const satisfies readonly (typeof SUPPORT_ACCESS_GRANT_DATA_CLASSES[number])[];
  const initialState = input.state === "revoked" ? "approved" : input.state;
  await db.prepare(
    `INSERT INTO support_access_grants (
       id, tenant_id, workspace_id, support_actor_auth_identity_id, platform_role,
       requested_by_auth_identity_id, approved_by_auth_identity_id, approved_at,
       revoked_by_auth_identity_id, revoked_at, state, reason_code, reason,
       starts_at, expires_at, correlation_id, audit_event_id, permission_anchor,
       data_class_anchor, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id, input.tenantId, input.workspaceId, SUPPORT_ACTOR_ID, PLATFORM_SUPPORT_ROLE,
    SUPPORT_ACTOR_ID, null, null, null, null,
    "pending", "fixture-diagnostics", "bounded synthetic diagnostic access", FIXTURE_TIME_BOUNDARIES.supportStartsAt,
    input.expiresAt, `fixture-support-${input.tenantId.endsWith("1") ? "a" : "b"}`, input.auditEventId,
    permissions[0], dataClasses[0], FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
  );
  for (const permission of permissions) await db.prepare("INSERT INTO support_access_grant_permissions (grant_id, permission) VALUES (?, ?)").run(input.id, permission);
  for (const dataClass of dataClasses) await db.prepare("INSERT INTO support_access_grant_data_classes (grant_id, data_class) VALUES (?, ?)").run(input.id, dataClass);
  await db.prepare(
    `UPDATE support_access_grants
     SET approved_by_auth_identity_id = ?, approved_at = ?, revoked_by_auth_identity_id = ?,
         revoked_at = ?, state = ?
     WHERE id = ?`,
  ).run(input.approvedByAuthIdentityId, input.approvedAt, null, null, initialState, input.id);
  if (input.state === "revoked") {
    await db.prepare(
      `UPDATE support_access_grants
       SET revoked_by_auth_identity_id = ?, revoked_at = ?, state = ?
       WHERE id = ?`,
    ).run(input.revokedByAuthIdentityId, input.revokedAt, input.state, input.id);
  }
  return {
    id: input.id, tenantId: input.tenantId, workspaceId: input.workspaceId, supportActorAuthIdentityId: SUPPORT_ACTOR_ID,
    platformRole: PLATFORM_SUPPORT_ROLE, requestedByAuthIdentityId: SUPPORT_ACTOR_ID, approvedByAuthIdentityId: input.approvedByAuthIdentityId,
    approvedAt: input.approvedAt, revokedByAuthIdentityId: input.revokedByAuthIdentityId, revokedAt: input.revokedAt, state: input.state,
    reasonCode: "fixture-diagnostics", reason: "bounded synthetic diagnostic access", startsAt: FIXTURE_TIME_BOUNDARIES.supportStartsAt,
    expiresAt: input.expiresAt, correlationId: `fixture-support-${input.tenantId.endsWith("1") ? "a" : "b"}`, auditEventId: input.auditEventId,
    permissions, dataClasses, createdAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt, updatedAt: FIXTURE_TIME_BOUNDARIES.fixtureCreatedAt,
  };
}

export const CANONICAL_TENANT_FIXTURE_AUTH_IDENTITIES = deepFreeze({
  supportActor: SUPPORT_ACTOR_ID,
  sharedAcrossTenants: SHARED_IDENTITY_ID,
  tenantA: ROLE_IDENTITY_IDS.A,
  tenantB: ROLE_IDENTITY_IDS.B,
} as const) satisfies DeepReadonly<Record<string, unknown>>;

/**
 * Builds the accepted server-session shape for a canonical active member.
 * Tests still have to install the session through `runWithTenantContext`; the
 * fixture helper does not manufacture database context or bypass RLS.
 */
export function createCanonicalTenantFixtureSession(
  tenantKey: "A" | "B",
  role: LaunchRole = "owner",
): TenantSession {
  const userId = role === "owner" ? SHARED_IDENTITY_ID : ROLE_IDENTITY_IDS[tenantKey][role];
  return {
    userId,
    email: `synthetic-${tenantKey.toLowerCase()}-${role.replaceAll("_", "-")}@example.test`,
    displayName: `Synthetic ${tenantKey} ${role}`,
    tenantId: TENANT_IDS[tenantKey],
    workspaceId: WORKSPACE_IDS[tenantKey],
    membershipId: MEMBERSHIP_IDS[tenantKey][role],
    role,
    roleBindingId: ROLE_BINDING_IDS[tenantKey][role],
  };
}

export type CanonicalTenantFixtureAuthIdentityId = AuthIdentityId;
