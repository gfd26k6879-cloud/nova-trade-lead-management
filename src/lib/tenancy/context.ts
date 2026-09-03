import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantSession } from "@/lib/auth";
import { isTenantRole } from "@/lib/permissions";
import type { LaunchRole } from "@/lib/tenancy/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export type TenantContextErrorCode =
  | "TENANT_CONTEXT_REQUIRED"
  | "TENANT_CONTEXT_INVALID"
  | "TENANT_CONTEXT_CONFLICT";

const SAFE_ERROR_MESSAGES: Readonly<Record<TenantContextErrorCode, string>> = {
  TENANT_CONTEXT_REQUIRED: "A tenant context is required",
  TENANT_CONTEXT_INVALID: "The tenant context is invalid",
  TENANT_CONTEXT_CONFLICT: "The nested tenant context conflicts with the active context",
};

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;

  constructor(code: TenantContextErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "TenantContextError";
    this.code = code;
  }
}

export class TenantContextRequiredError extends TenantContextError {
  constructor() {
    super("TENANT_CONTEXT_REQUIRED");
    this.name = "TenantContextRequiredError";
  }
}

export class TenantContextInvalidError extends TenantContextError {
  constructor() {
    super("TENANT_CONTEXT_INVALID");
    this.name = "TenantContextInvalidError";
  }
}

export class TenantContextConflictError extends TenantContextError {
  constructor() {
    super("TENANT_CONTEXT_CONFLICT");
    this.name = "TenantContextConflictError";
  }
}

/** Only server-validated, tenant-safe identifiers and correlation are stored. */
export interface TenantContext {
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly membershipId: string;
  readonly role: LaunchRole;
  readonly roleBindingId: string;
  readonly actorAuthIdentityId: string;
  readonly correlationId: string;
}

export interface TenantContextOptions {
  readonly correlationId: unknown;
}

type TenantContextCallback<T> = () => T;

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

function invalidContext(): never {
  throw new TenantContextInvalidError();
}

function readAcceptedTenantContext(session: TenantSession, correlationId: unknown): TenantContext {
  try {
    if (!isRecord(session)) invalidContext();

    // These checks establish the T-011/T-013 accepted session shape. Email and
    // displayName are validated as part of that shape but are intentionally
    // excluded from the context below.
    if (
      !isUuid(session.userId) ||
      typeof session.email !== "string" ||
      session.email.length === 0 ||
      (session.displayName !== null && typeof session.displayName !== "string") ||
      !isUuid(session.tenantId) ||
      (session.workspaceId !== null && !isUuid(session.workspaceId)) ||
      !isUuid(session.membershipId) ||
      !isTenantRole(session.role) ||
      !isUuid(session.roleBindingId) ||
      !isCorrelationId(correlationId)
    ) {
      invalidContext();
    }

    return Object.freeze({
      tenantId: session.tenantId,
      workspaceId: session.workspaceId,
      membershipId: session.membershipId,
      role: session.role,
      roleBindingId: session.roleBindingId,
      actorAuthIdentityId: session.userId,
      correlationId,
    });
  } catch (error) {
    if (error instanceof TenantContextError) throw error;
    // A hostile/malformed object whose property access throws fails closed.
    invalidContext();
  }
}

function sameTenantContext(left: TenantContext, right: TenantContext): boolean {
  return left.tenantId === right.tenantId &&
    left.workspaceId === right.workspaceId &&
    left.membershipId === right.membershipId &&
    left.role === right.role &&
    left.roleBindingId === right.roleBindingId &&
    left.actorAuthIdentityId === right.actorAuthIdentityId &&
    left.correlationId === right.correlationId;
}

function resolveCorrelationId(input: unknown): unknown {
  try {
    if (isRecord(input) && "correlationId" in input) return input.correlationId;
    return input;
  } catch {
    // A malformed options object, including one whose property access throws,
    // is not allowed to escape as an untyped context failure.
    invalidContext();
  }
}

export function runWithTenantContext<T>(
  session: TenantSession,
  correlationId: unknown,
  callback: TenantContextCallback<T>,
): T;
export function runWithTenantContext<T>(
  session: TenantSession,
  options: TenantContextOptions,
  callback: TenantContextCallback<T>,
): T;
export function runWithTenantContext<T>(
  session: TenantSession,
  correlationOrOptions: unknown,
  callback: TenantContextCallback<T>,
): T {
  if (typeof callback !== "function") invalidContext();

  const next = readAcceptedTenantContext(session, resolveCorrelationId(correlationOrOptions));
  const current = tenantContextStorage.getStore();
  if (current && !sameTenantContext(current, next)) {
    throw new TenantContextConflictError();
  }

  return tenantContextStorage.run(current ?? next, callback);
}

export function getTenantContext(): TenantContext | null {
  return tenantContextStorage.getStore() ?? null;
}

export function requireTenantContext(): TenantContext {
  const context = getTenantContext();
  if (!context) throw new TenantContextRequiredError();
  return context;
}
