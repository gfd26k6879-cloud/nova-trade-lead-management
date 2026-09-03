import { LAUNCH_ROLES, type LaunchRole } from "@/lib/tenancy/types";

/**
 * Legacy app authorization remains separate from the D-002 tenant matrix.
 * `admin` and `researcher` intentionally occur in both vocabularies, but the
 * family-specific evaluators never look up the other family's permissions.
 */
export const LEGACY_APP_ROLES = Object.freeze(["admin", "researcher"] as const);
export type AppRole = (typeof LEGACY_APP_ROLES)[number];

export const LEGACY_PERMISSIONS = Object.freeze([
  "view:workspace",
  "lead:update",
  "lead:close",
  "lead:exclude",
  "lead:apply_ai_usable_website",
  "lead:apply_ai_opportunity",
  "lead:assign",
  "lead:admin_assign",
  "outreach:create",
  "admin_request:create",
  "admin_request:manage",
  "demo:create",
  "ai:verify",
  "ai:researcher_tools",
  "crawl:manage",
  "settings:manage",
  "export:csv",
  "users:manage",
  "scores:recompute",
] as const);
export type Permission = (typeof LEGACY_PERMISSIONS)[number];
export type LegacyPermission = Permission;

const ADMIN_PERMISSIONS = new Set<Permission>(LEGACY_PERMISSIONS);
const RESEARCHER_PERMISSIONS = new Set<Permission>([
  "view:workspace",
  "lead:update",
  "lead:assign",
  "outreach:create",
  "admin_request:create",
  "ai:researcher_tools",
]);

/** Explicit compatibility mapping for the pre-tenant role family. */
const LEGACY_PERMISSION_SETS: Readonly<Record<AppRole, ReadonlySet<Permission>>> = {
  admin: ADMIN_PERMISSIONS,
  researcher: RESEARCHER_PERMISSIONS,
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (LEGACY_APP_ROLES as readonly string[]).includes(value);
}

export function isLegacyPermission(value: unknown): value is LegacyPermission {
  return typeof value === "string" && (LEGACY_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Compatibility API used by the existing application. It accepts unknown
 * runtime inputs and fails closed rather than crossing into tenant policy.
 */
export function hasPermission(role: unknown, permission: unknown): boolean {
  if (!isAppRole(role) || !isLegacyPermission(permission)) return false;
  return LEGACY_PERMISSION_SETS[role].has(permission);
}

/** Canonical tenant role vocabulary from T-001; this is the only runtime list. */
export const TENANT_ROLES = LAUNCH_ROLES;
export const FUTURE_ROLES = TENANT_ROLES;
export type TenantRole = LaunchRole;
export type FutureRole = TenantRole;

/** D-002's role-column abbreviations, kept explicit for matrix review. */
export const TENANT_ROLE_COLUMNS = {
  O: "owner",
  A: "admin",
  M: "strategist_manager",
  R: "researcher",
  V: "reviewer",
  X: "outreach_operator",
  N: "analyst_read_only",
} as const satisfies Readonly<Record<string, TenantRole>>;

export const TENANT_PERMISSIONS = [
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
export const FUTURE_PERMISSIONS = TENANT_PERMISSIONS;
export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];
export type FuturePermission = TenantPermission;

export type PermissionDecision = "A" | "C" | "D";

type TenantPermissionRow = readonly [
  TenantPermission,
  PermissionDecision,
  PermissionDecision,
  PermissionDecision,
  PermissionDecision,
  PermissionDecision,
  PermissionDecision,
  PermissionDecision,
];

/**
 * D-002 in document order. Each row is O/A/M/R/V/X/N, matching
 * TENANT_ROLE_COLUMNS above. A and C are role-capable; C remains visible to
 * callers as conditional policy metadata rather than being flattened away.
 */
export const TENANT_PERMISSION_ROWS = [
  ["tenant:read", "A", "A", "A", "A", "A", "A", "A"],
  ["tenant:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["tenant:lifecycle", "C", "C", "D", "D", "D", "D", "D"],
  ["workspace:read", "A", "A", "A", "A", "A", "A", "A"],
  ["workspace:manage", "C", "C", "C", "D", "D", "D", "D"],
  ["membership:read", "A", "A", "D", "D", "D", "D", "D"],
  ["membership:invite", "C", "C", "D", "D", "D", "D", "D"],
  ["membership:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["role:assign", "C", "C", "D", "D", "D", "D", "D"],
  ["support:grant", "C", "C", "D", "D", "D", "D", "D"],
  ["knowledge:read", "A", "A", "A", "A", "A", "C", "C"],
  ["knowledge:upload", "A", "A", "A", "C", "D", "D", "D"],
  ["knowledge:manage", "C", "C", "C", "C", "D", "D", "D"],
  ["knowledge:review", "C", "C", "C", "D", "A", "D", "D"],
  ["knowledge:export", "C", "C", "D", "D", "D", "D", "D"],
  ["knowledge:delete", "C", "C", "D", "D", "D", "D", "D"],
  ["understanding:read", "A", "A", "A", "A", "A", "C", "C"],
  ["understanding:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["understanding:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["question:manage", "C", "C", "A", "C", "C", "D", "D"],
  ["question:answer", "A", "A", "A", "A", "A", "C", "D"],
  ["icp:read", "A", "A", "A", "A", "A", "C", "C"],
  ["icp:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["icp:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["play:read", "A", "A", "A", "A", "A", "C", "C"],
  ["play:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["play:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["play:activate", "C", "C", "C", "D", "C", "D", "D"],
  ["play:archive", "C", "C", "C", "D", "C", "D", "D"],
  ["connector:read", "A", "A", "A", "C", "C", "C", "D"],
  ["connector:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["connector:use", "C", "C", "A", "C", "D", "D", "D"],
  ["source:plan", "C", "C", "A", "C", "C", "D", "D"],
  ["source:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["source:execute", "C", "C", "A", "C", "D", "D", "D"],
  ["source:review", "C", "C", "C", "C", "A", "C", "C"],
  ["account:read", "A", "A", "A", "A", "A", "A", "C"],
  ["account:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["account:merge", "C", "C", "C", "D", "C", "D", "D"],
  ["account:archive", "C", "C", "C", "C", "C", "C", "D"],
  ["contact:read", "A", "A", "A", "A", "A", "A", "C"],
  ["contact:research", "C", "C", "A", "C", "C", "C", "D"],
  ["contact:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["contact:use", "C", "C", "C", "D", "C", "C", "D"],
  ["contact:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["buying_center:read", "A", "A", "A", "A", "A", "A", "C"],
  ["buying_center:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["buying_center:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["qualification:read", "A", "A", "A", "A", "A", "A", "C"],
  ["qualification:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["qualification:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["score:read", "A", "A", "A", "A", "A", "A", "A"],
  ["score:recompute", "C", "C", "A", "C", "D", "D", "D"],
  ["score:override", "C", "C", "C", "D", "C", "D", "D"],
  ["review:read", "A", "A", "A", "A", "A", "C", "C"],
  ["review:decide", "C", "C", "C", "D", "A", "D", "D"],
  ["audit:read", "C", "C", "C", "D", "C", "D", "D"],
  ["audit:export", "C", "C", "D", "D", "D", "D", "D"],
  ["outreach:read", "A", "A", "A", "A", "A", "A", "C"],
  ["outreach:draft", "C", "C", "A", "C", "D", "A", "D"],
  ["outreach:edit", "C", "C", "A", "C", "D", "A", "D"],
  ["outreach:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["outreach:copy_export", "C", "C", "C", "C", "C", "A", "D"],
  ["suppression:read", "A", "A", "A", "C", "C", "A", "D"],
  ["suppression:manage", "C", "C", "A", "D", "C", "C", "D"],
  ["outcome:write", "C", "C", "A", "C", "C", "A", "D"],
  ["report:read", "A", "A", "A", "C", "C", "C", "A"],
  ["report:manage", "C", "C", "A", "D", "C", "D", "D"],
  ["usage:read", "C", "C", "C", "D", "C", "D", "C"],
  ["budget:manage", "C", "C", "C", "D", "D", "D", "D"],
  ["queue:read", "A", "A", "A", "A", "C", "C", "C"],
  ["queue:operate", "C", "C", "A", "C", "C", "D", "D"],
  ["feature:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["data:export", "C", "C", "D", "D", "D", "D", "D"],
  ["data:delete", "C", "C", "D", "D", "D", "D", "D"],
] as const satisfies readonly TenantPermissionRow[];

export type TenantPermissionMatrix = Readonly<
  Record<TenantRole, Readonly<Record<TenantPermission, PermissionDecision>>>
>;

const buildTenantPermissionMatrix = (): TenantPermissionMatrix => {
  const matrix = {} as Record<TenantRole, Record<TenantPermission, PermissionDecision>>;

  for (const role of TENANT_ROLES) {
    matrix[role] = {} as Record<TenantPermission, PermissionDecision>;
  }

  for (const [permission, ...decisions] of TENANT_PERMISSION_ROWS) {
    TENANT_ROLES.forEach((role, index) => {
      matrix[role][permission] = decisions[index];
    });
  }

  return Object.freeze(
    Object.fromEntries(
      TENANT_ROLES.map((role) => [role, Object.freeze(matrix[role])]),
    ),
  ) as TenantPermissionMatrix;
};

export const TENANT_PERMISSION_MATRIX = buildTenantPermissionMatrix();

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === "string" && (TENANT_ROLES as readonly string[]).includes(value);
}

export function isTenantPermission(value: unknown): value is TenantPermission {
  return typeof value === "string" && (TENANT_PERMISSIONS as readonly string[]).includes(value);
}

export interface TenantPermissionEvaluation {
  readonly decision: PermissionDecision;
  readonly allowed: boolean;
}

/** Evaluate only the tenant family; unknown inputs are an explicit deny. */
export function getTenantPermissionDecision(
  role: unknown,
  permission: unknown,
): TenantPermissionEvaluation {
  if (!isTenantRole(role) || !isTenantPermission(permission)) {
    return { decision: "D", allowed: false };
  }

  const decision = TENANT_PERMISSION_MATRIX[role][permission];
  return { decision, allowed: decision === "A" || decision === "C" };
}

/**
 * Role-capability check only. `true` means the matrix cell is A or C; this is
 * not final authorization and does not evaluate tenant, object, or policy
 * context. Use getTenantPermissionDecision when the A/C/D result is needed.
 */
export function isTenantRoleCapable(role: unknown, permission: unknown): boolean {
  return getTenantPermissionDecision(role, permission).allowed;
}

/** Alias retained for callers that describe the capability as a permission. */
export function hasTenantPermission(role: unknown, permission: unknown): boolean {
  return isTenantRoleCapable(role, permission);
}
