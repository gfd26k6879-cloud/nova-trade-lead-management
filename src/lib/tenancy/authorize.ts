import {
  requireTenantSession as requireTenantSessionBoundary,
  type TenantSession,
  type TenantSessionResolutionOptions,
} from "@/lib/auth";
import {
  getTenantPermissionDecision,
  isTenantPermission,
  isTenantRole,
  type TenantPermission,
  type TenantRole,
} from "@/lib/permissions";
import type { ScopeClass } from "@/lib/tenancy/types";
import type { TenantSessionSelector } from "@/lib/app-users";

export { requireTenantSessionBoundary as requireTenantSession };

export type TenantResourceScopeClass = Exclude<ScopeClass, "platform-global">;

export type TenantAuthorizationErrorCode =
  | "AUTH_REQUIRED"
  | "TENANT_SCOPE_REQUIRED"
  | "TENANT_SCOPE_MISMATCH"
  | "ROLE_REQUIRED"
  | "PERMISSION_DENIED"
  | "WORKSPACE_SCOPE_INVALID"
  | "POLICY_BLOCKED"
  | "RESOURCE_NOT_FOUND_OR_FORBIDDEN";

const SAFE_ERROR_MESSAGES: Readonly<Record<TenantAuthorizationErrorCode, string>> = {
  AUTH_REQUIRED: "Authentication required",
  TENANT_SCOPE_REQUIRED: "A valid tenant scope is required",
  TENANT_SCOPE_MISMATCH: "Tenant scope does not match",
  ROLE_REQUIRED: "The authenticated role is not authorized",
  PERMISSION_DENIED: "Permission denied",
  WORKSPACE_SCOPE_INVALID: "Workspace scope is invalid",
  POLICY_BLOCKED: "Policy blocked",
  RESOURCE_NOT_FOUND_OR_FORBIDDEN: "Resource not found or forbidden",
};

export class TenantAuthorizationError extends Error {
  readonly status: 401 | 403 | 404;
  readonly code: TenantAuthorizationErrorCode;

  constructor(status: 401 | 403 | 404, code: TenantAuthorizationErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "TenantAuthorizationError";
    this.status = status;
    this.code = code;
  }
}

export interface TenantProtectedResource {
  readonly tenantId: unknown;
  readonly workspaceId?: unknown;
  readonly resourceId?: unknown;
  readonly resourceType?: unknown;
}

export interface TenantWorkspaceScopeInput {
  readonly tenantId: unknown;
  readonly workspaceId?: unknown;
  readonly scopeClass: ScopeClass;
}

export interface TenantWorkspaceScope {
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly scopeClass: TenantResourceScopeClass;
}

export interface TenantPolicyResourceContext {
  readonly id: string | null;
  readonly type: string | null;
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly scopeClass: TenantResourceScopeClass;
}

export interface TenantPolicyContext {
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly membershipId: string;
  readonly role: TenantRole;
  readonly permission: TenantPermission;
  readonly action: string;
  readonly resource: TenantPolicyResourceContext | null;
}

export interface TenantPolicyEvaluationResult {
  readonly allowed: boolean;
  readonly context: TenantPolicyContext;
}

export type TenantPolicyEvaluator = (
  context: TenantPolicyContext,
) => TenantPolicyEvaluationResult | Promise<TenantPolicyEvaluationResult>;

export interface TenantPermissionOptions {
  readonly action?: unknown;
  readonly policyEvaluator?: TenantPolicyEvaluator;
  readonly resource?: TenantProtectedResource | null;
  readonly scopeClass?: TenantResourceScopeClass;
}

export type TenantSessionBoundary = (
  selector: TenantSessionSelector,
  options?: TenantSessionResolutionOptions,
) => Promise<TenantSession>;

export interface RequireTenantPermissionOptions extends TenantPermissionOptions {
  readonly sessionBoundary?: TenantSessionBoundary;
  readonly sessionOptions?: TenantSessionResolutionOptions;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function forbidden(code: Exclude<TenantAuthorizationErrorCode, "AUTH_REQUIRED" | "RESOURCE_NOT_FOUND_OR_FORBIDDEN">): never {
  throw new TenantAuthorizationError(403, code);
}

function resourceNotFound(): never {
  throw new TenantAuthorizationError(404, "RESOURCE_NOT_FOUND_OR_FORBIDDEN");
}

function assertSessionShape(session: TenantSession): void {
  if (
    !session ||
    !isNonEmptyText(session.userId) ||
    !isNonEmptyText(session.email) ||
    !isNonEmptyText(session.tenantId) ||
    !isNonEmptyText(session.membershipId) ||
    !isNonEmptyText(session.roleBindingId) ||
    !isTenantRole(session.role) ||
    (session.workspaceId !== null && !isNonEmptyText(session.workspaceId))
  ) {
    forbidden("TENANT_SCOPE_REQUIRED");
  }
}

function isTenantResourceScopeClass(value: unknown): value is TenantResourceScopeClass {
  return value === "tenant-wide" || value === "workspace-optional" || value === "workspace-required";
}

/**
 * Validates the D-001 workspace relation against the already trusted session.
 * A narrowed session does not narrow tenant-wide resources; it narrows only a
 * resource instance carrying a non-null workspace ID.
 */
export function validateWorkspaceScope(
  session: TenantSession,
  input: TenantWorkspaceScopeInput,
): TenantWorkspaceScope {
  assertSessionShape(session);

  if (!isTenantResourceScopeClass(input.scopeClass)) forbidden("WORKSPACE_SCOPE_INVALID");
  if (!isNonEmptyText(input.tenantId) || input.tenantId !== session.tenantId) {
    forbidden("TENANT_SCOPE_MISMATCH");
  }

  const workspaceId = input.workspaceId === undefined || input.workspaceId === null
    ? null
    : input.workspaceId;
  if (workspaceId !== null && !isNonEmptyText(workspaceId)) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }

  if (input.scopeClass === "tenant-wide" && workspaceId !== null) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }
  if (input.scopeClass === "workspace-required" && workspaceId === null) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }

  // A null workspace on an optional resource is tenant-wide. A selected
  // workspace may still read it when the role/action permission allows.
  if (workspaceId !== null && session.workspaceId !== null && session.workspaceId !== workspaceId) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }

  return {
    tenantId: session.tenantId,
    workspaceId,
    scopeClass: input.scopeClass,
  };
}

function normalizeResourceWorkspace(resource: TenantProtectedResource): string | null {
  const workspaceId = resource.workspaceId === undefined || resource.workspaceId === null
    ? null
    : resource.workspaceId;
  if (workspaceId !== null && !isNonEmptyText(workspaceId)) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }
  return workspaceId;
}

/**
 * Asserts ownership without exposing whether a protected resource exists in a
 * different tenant. The returned value is the same trusted resource object;
 * request-provided authority fields are never consulted.
 */
export function assertTenantResourceOwnership<T extends TenantProtectedResource>(
  session: TenantSession,
  resource: T | null | undefined,
  scopeClass: TenantResourceScopeClass,
): T {
  assertSessionShape(session);
  if (!resource || typeof resource !== "object") resourceNotFound();

  // Tenant mismatch is deliberately checked before workspace details so that
  // foreign rows and absent rows have the identical public error contract.
  if (!isNonEmptyText(resource.tenantId) || resource.tenantId !== session.tenantId) {
    resourceNotFound();
  }

  const workspaceId = normalizeResourceWorkspace(resource);
  validateWorkspaceScope(session, {
    tenantId: session.tenantId,
    workspaceId,
    scopeClass,
  });
  return resource;
}

export const assertProtectedResourceOwnership = assertTenantResourceOwnership;

function policyResourceContext(
  resource: TenantProtectedResource | null | undefined,
  scopeClass: TenantResourceScopeClass | undefined,
  workspaceId: string | null,
  tenantId: string,
): TenantPolicyResourceContext | null {
  if (resource === undefined) return null;
  if (!scopeClass || !isTenantResourceScopeClass(scopeClass)) forbidden("WORKSPACE_SCOPE_INVALID");
  return Object.freeze({
    id: isNonEmptyText(resource?.resourceId) ? resource.resourceId : null,
    type: isNonEmptyText(resource?.resourceType) ? resource.resourceType : null,
    tenantId,
    workspaceId,
    scopeClass,
  });
}

function samePolicyResource(
  left: TenantPolicyResourceContext | null,
  right: TenantPolicyResourceContext | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id &&
    left.type === right.type &&
    left.tenantId === right.tenantId &&
    left.workspaceId === right.workspaceId &&
    left.scopeClass === right.scopeClass;
}

function samePolicyContext(left: unknown, expected: TenantPolicyContext): boolean {
  if (!left || typeof left !== "object") return false;
  const candidate = left as Partial<TenantPolicyContext>;
  return candidate.tenantId === expected.tenantId &&
    candidate.workspaceId === expected.workspaceId &&
    candidate.membershipId === expected.membershipId &&
    candidate.role === expected.role &&
    candidate.permission === expected.permission &&
    candidate.action === expected.action &&
    samePolicyResource(candidate.resource ?? null, expected.resource);
}

function isPolicyContextShape(value: unknown): value is TenantPolicyContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<TenantPolicyContext>;
  if (
    !isNonEmptyText(context.tenantId) ||
    (context.workspaceId !== null && !isNonEmptyText(context.workspaceId)) ||
    !isNonEmptyText(context.membershipId) ||
    !isTenantRole(context.role) ||
    !isTenantPermission(context.permission) ||
    !isNonEmptyText(context.action)
  ) return false;

  if (context.resource === null) return true;
  if (!context.resource || typeof context.resource !== "object") return false;
  const resource = context.resource as Partial<TenantPolicyResourceContext>;
  return (resource.id === null || isNonEmptyText(resource.id)) &&
    (resource.type === null || isNonEmptyText(resource.type)) &&
    isNonEmptyText(resource.tenantId) &&
    (resource.workspaceId === null || isNonEmptyText(resource.workspaceId)) &&
    isTenantResourceScopeClass(resource.scopeClass);
}

function isValidPolicyResult(value: unknown): value is TenantPolicyEvaluationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TenantPolicyEvaluationResult>;
  return typeof result.allowed === "boolean" && isPolicyContextShape(result.context);
}

function policyBlocked(): never {
  forbidden("POLICY_BLOCKED");
}

async function evaluateConditionalPolicy(
  context: TenantPolicyContext,
  evaluator: TenantPolicyEvaluator | undefined,
): Promise<void> {
  if (!evaluator) policyBlocked();

  let result: unknown;
  try {
    result = await evaluator(context);
  } catch {
    policyBlocked();
  }

  try {
    if (!isValidPolicyResult(result)) policyBlocked();
    if (!result.allowed || !samePolicyContext(result.context, context)) policyBlocked();
  } catch {
    // A malformed result, including one whose properties throw on access,
    // has the same safe outcome as an evaluator failure.
    policyBlocked();
  }
}

/**
 * Checks one fixed D-002 permission for a trusted session. C is conditional,
 * never an allow: it must pass an injected evaluator bound to this context.
 */
export async function assertTenantPermission(
  session: TenantSession,
  permission: unknown,
  options: TenantPermissionOptions = {},
): Promise<TenantSession> {
  assertSessionShape(session);

  if (options.resource === undefined && options.scopeClass !== undefined) {
    forbidden("WORKSPACE_SCOPE_INVALID");
  }

  let resourceWorkspaceId: string | null = null;
  if (options.resource !== undefined) {
    if (!options.scopeClass) forbidden("WORKSPACE_SCOPE_INVALID");
    const resource = options.resource;
    if (resource === null) resourceNotFound();
    resourceWorkspaceId = normalizeResourceWorkspace(resource);
    assertTenantResourceOwnership(session, resource, options.scopeClass);
  }

  const evaluation = getTenantPermissionDecision(session.role, permission);
  if (!isTenantRole(session.role)) forbidden("ROLE_REQUIRED");
  if (!isTenantPermission(permission) || evaluation.decision === "D") {
    forbidden("PERMISSION_DENIED");
  }
  if (evaluation.decision === "A") return session;

  if (!isNonEmptyText(options.action)) policyBlocked();
  const context = Object.freeze({
    tenantId: session.tenantId,
    workspaceId: session.workspaceId,
    membershipId: session.membershipId,
    role: session.role,
    permission,
    action: options.action,
    resource: policyResourceContext(options.resource, options.scopeClass, resourceWorkspaceId, session.tenantId),
  }) as TenantPolicyContext;
  await evaluateConditionalPolicy(context, options.policyEvaluator);
  return session;
}

function normalizeSessionBoundaryError(error: unknown): never {
  if (
    error instanceof TenantAuthorizationError &&
    error.code === "AUTH_REQUIRED"
  ) {
    throw error;
  }
  if (
    error &&
    typeof error === "object" &&
    ("code" in error && error.code === "AUTH_REQUIRED" || "status" in error && error.status === 401)
  ) {
    throw new TenantAuthorizationError(401, "AUTH_REQUIRED");
  }
  throw new TenantAuthorizationError(403, "TENANT_SCOPE_REQUIRED");
}

/**
 * Resolves the T-011 session first, then applies the T-012 matrix and any
 * resource/policy checks. The selector is only a selector; all authority is
 * read from the resolved session.
 */
export async function requireTenantPermission(
  selector: TenantSessionSelector,
  permission: unknown,
  options: RequireTenantPermissionOptions = {},
): Promise<TenantSession> {
  let session: TenantSession;
  try {
    session = await (options.sessionBoundary ?? requireTenantSessionBoundary)(selector, options.sessionOptions);
  } catch (error) {
    normalizeSessionBoundaryError(error);
  }
  return assertTenantPermission(session, permission, options);
}

export function requireTenantResource<T extends TenantProtectedResource>(
  session: TenantSession,
  resource: T | null | undefined,
  scopeClass: TenantResourceScopeClass,
): T {
  return assertTenantResourceOwnership(session, resource, scopeClass);
}
