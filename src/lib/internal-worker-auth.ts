import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  requirePermission,
  type TenantSession,
} from "@/lib/auth";
import type { TenantSessionBoundary } from "@/lib/tenancy/authorize";
import type { TenantPermission } from "@/lib/permissions";
import type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";

const WORKER_SECRET_ENV_KEYS = ["WORKER_CRON_SECRET", "CRON_SECRET"] as const;
export const INTERNAL_WORKER_SELECTOR_HEADER = "x-internal-worker-selector";
const WORKER_SELECTOR_HEADER_ALIASES = [
  INTERNAL_WORKER_SELECTOR_HEADER,
  "x-worker-selector",
  "x-worker-lease-selector",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SELECTOR_PATTERN = /^[A-Za-z0-9!#$%&'*+\-./:<=>?@^_`|~]{1,512}$/;
const TENANT_WORKER_LEASE_KEYS = new Set([
  "selector",
  "tenantId",
  "workspaceId",
  "jobId",
  "runId",
  "leaseId",
  "leaseGeneration",
  "workerName",
  "action",
  "status",
  "notBefore",
  "expiresAt",
  "correlationId",
  "recordVersion",
  "integrityVersion",
]);

export const INTERNAL_WORKER_LEASE_RECORD_VERSION = 1 as const;
export const INTERNAL_WORKER_LEASE_INTEGRITY_VERSION = "internal-worker-lease-v1" as const;

export const INTERNAL_WORKER_ACTIONS = Object.freeze({
  ai_verification: "ai_verification:process",
  crawl: "crawl:process",
  enrichment: "enrichment:process",
  artifact: "artifact:process",
  score_recompute: "score_recompute:recompute",
} as const satisfies Readonly<Record<SchedulerWorkerName, string>>);
export type InternalWorkerAction = (typeof INTERNAL_WORKER_ACTIONS)[SchedulerWorkerName];

/** Authentication only; this legacy result is not tenant authority. */
export type InternalWorkerAuthentication = { source: "cron" | "session" };
/** @deprecated Use InternalWorkerAuthentication; this never represented tenant scope. */
export type InternalWorkerAuthResult = InternalWorkerAuthentication;

export interface TenantWorkerLeaseRecord {
  readonly selector: string;
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly jobId: string;
  readonly runId: string;
  readonly leaseId: string;
  readonly leaseGeneration: number;
  readonly workerName: SchedulerWorkerName;
  readonly action: InternalWorkerAction;
  readonly status: "active";
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly recordVersion: typeof INTERNAL_WORKER_LEASE_RECORD_VERSION;
  readonly integrityVersion: typeof INTERNAL_WORKER_LEASE_INTEGRITY_VERSION;
}

export interface TenantWorkerAuthorization {
  readonly source: "cron" | "session";
  readonly context: {
    readonly tenantId: string;
    readonly workspaceId: string | null;
    readonly jobId: string;
    readonly runId: string;
    readonly leaseId: string;
    readonly leaseGeneration: number;
    readonly workerName: SchedulerWorkerName;
    readonly action: InternalWorkerAction;
    readonly sourcePrincipalKind: "cron" | "session";
    readonly correlationId: string;
  };
}

export type TenantWorkerLeaseResolver = (selector: string) => Promise<unknown>;

export interface TenantWorkerAuthorizationOptions {
  /** Required: this must read a server-issued durable lease/job record. */
  readonly resolveLease: TenantWorkerLeaseResolver;
  readonly sessionPermission: TenantPermission;
  readonly sessionBoundary?: TenantSessionBoundary;
  /** Trusted server clock captured by the authorization service at construction. */
  readonly clock?: () => Date;
}

export interface TenantWorkerAuthorizationService {
  authorize(
    request: NextRequest,
    workerName: SchedulerWorkerName,
    action?: InternalWorkerAction,
  ): Promise<TenantWorkerAuthorization>;
}

export function getTenantWorkerAction(workerName: SchedulerWorkerName): InternalWorkerAction {
  return actionForWorker(workerName);
}

export function authorizeTenantInternalWorkerRequest(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  authorization: TenantWorkerAuthorizationService,
  action?: InternalWorkerAction,
): Promise<TenantWorkerAuthorization> {
  return authorization.authorize(request, workerName, action);
}

export class TenantWorkerAuthorizationDeniedError extends Error {
  readonly status = 401;
  readonly code = "WORKER_AUTHORIZATION_FAILED" as const;

  constructor() {
    super("Worker authorization failed");
    this.name = "TenantWorkerAuthorizationDeniedError";
  }
}

export function getConfiguredWorkerCronSecrets(): string[] {
  return WORKER_SECRET_ENV_KEYS.map((key) => process.env[key]?.trim()).filter((secret): secret is string => Boolean(secret));
}

export function hasValidWorkerCronSecret(request: NextRequest, secrets = getConfiguredWorkerCronSecrets()): boolean {
  if (secrets.length === 0) return false;

  const token = parseBearerToken(request.headers.get("authorization") ?? "");
  if (!token) return false;

  return secrets.some((secret) => timingSafeStringEqual(token, secret));
}

/**
 * Compatibility authorization for legacy_unscoped routes only. A successful
 * result authenticates a platform caller and grants no tenant authority.
 */
export async function authorizeInternalWorkerRequest(
  request: NextRequest,
  fallbackPermission: Parameters<typeof requirePermission>[0],
): Promise<InternalWorkerAuthentication> {
  if (hasValidWorkerCronSecret(request) || await hasValidVaultWorkerCronSecret(request)) {
    return { source: "cron" };
  }

  await requirePermission(fallbackPermission);
  return { source: "session" };
}

export function createTenantWorkerAuthorizationService(
  options: TenantWorkerAuthorizationOptions,
): TenantWorkerAuthorizationService {
  if (typeof options?.resolveLease !== "function" || typeof options.sessionPermission !== "string") {
    throw new Error("A tenant worker lease resolver and session permission are required");
  }

  const trustedClock = options.clock ?? (() => new Date());

  return {
    authorize: async (request, workerName, requestedAction = actionForWorker(workerName)) => {
      const selector = getTenantWorkerSelector(request);
      if (
        !selector ||
        !isSchedulerWorkerName(workerName) ||
        !isInternalWorkerAction(requestedAction) ||
        requestedAction !== actionForWorker(workerName)
      ) deny();

      let resolved: unknown;
      try {
        resolved = await options.resolveLease(selector);
      } catch {
        denyWithCause();
      }

      let now: Date;
      try {
        now = trustedClock();
      } catch {
        deny();
      }
      const record = parseTenantWorkerLeaseRecord(resolved, selector, workerName, requestedAction, now);
      if (!record) deny();

      const source = hasValidWorkerCronSecret(request) || await hasValidVaultWorkerCronSecret(request)
        ? "cron"
        : "session";

      if (source === "session") {
        let session: TenantSession;
        try {
          const { requireTenantPermission } = await import("@/lib/tenancy/authorize");
          session = await requireTenantPermission(
            { tenantId: record.tenantId, workspaceId: record.workspaceId },
            options.sessionPermission,
            {
              sessionBoundary: options.sessionBoundary,
            },
          );
        } catch {
          denyWithCause();
        }
        if (session.tenantId !== record.tenantId || session.workspaceId !== record.workspaceId) deny();
      }

      return {
        source,
        context: Object.freeze({
          tenantId: record.tenantId,
          workspaceId: record.workspaceId,
          jobId: record.jobId,
          runId: record.runId,
          leaseId: record.leaseId,
          leaseGeneration: record.leaseGeneration,
          workerName: record.workerName,
          action: record.action,
          sourcePrincipalKind: source,
          correlationId: record.correlationId,
        }),
      };
    },
  };
}

export function getTenantWorkerSelector(request: NextRequest): string | null {
  const values = WORKER_SELECTOR_HEADER_ALIASES
    .map((header) => request.headers.get(header))
    .filter((value): value is string => value !== null);
  if (values.length === 0 || values.some((value) => !isOpaqueSelector(value))) return null;
  if (new Set(values).size !== 1) return null;
  return values[0];
}

function parseTenantWorkerLeaseRecord(
  value: unknown,
  selector: string,
  workerName: SchedulerWorkerName,
  action: InternalWorkerAction,
  now: Date,
): TenantWorkerLeaseRecord | null {
  try {
    if (!isExactTenantWorkerLeaseRecordShape(value)) return null;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
    if (
      value.selector !== selector ||
      value.workerName !== workerName ||
      action !== INTERNAL_WORKER_ACTIONS[workerName] ||
      value.action !== INTERNAL_WORKER_ACTIONS[workerName] ||
      value.status !== "active" ||
      value.workspaceId !== null && !isUuid(value.workspaceId) ||
      !isUuid(value.tenantId) ||
      !isUuid(value.jobId) ||
      !isUuid(value.runId) ||
      !isUuid(value.leaseId) ||
      !isValidLeaseGeneration(value.leaseGeneration) ||
      !isCanonicalTime(value.notBefore) ||
      !isCanonicalTime(value.expiresAt) ||
      !isCorrelationId(value.correlationId) ||
      value.recordVersion !== INTERNAL_WORKER_LEASE_RECORD_VERSION ||
      value.integrityVersion !== INTERNAL_WORKER_LEASE_INTEGRITY_VERSION
    ) return null;

    const notBefore = new Date(value.notBefore);
    const expiresAt = new Date(value.expiresAt);
    if (notBefore.getTime() > now.getTime() || expiresAt.getTime() <= now.getTime() || expiresAt.getTime() <= notBefore.getTime()) return null;

    return Object.freeze({
      selector,
      tenantId: value.tenantId,
      workspaceId: value.workspaceId,
      jobId: value.jobId,
      runId: value.runId,
      leaseId: value.leaseId,
      leaseGeneration: value.leaseGeneration,
      workerName,
      action,
      status: "active",
      notBefore: value.notBefore,
      expiresAt: value.expiresAt,
      correlationId: value.correlationId,
      recordVersion: INTERNAL_WORKER_LEASE_RECORD_VERSION,
      integrityVersion: INTERNAL_WORKER_LEASE_INTEGRITY_VERSION,
    });
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExactTenantWorkerLeaseRecordShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  const keys = Reflect.ownKeys(value);
  if (keys.length !== TENANT_WORKER_LEASE_KEYS.size) return false;
  return keys.every((key) => {
    if (typeof key !== "string" || !TENANT_WORKER_LEASE_KEYS.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor);
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

function isOpaqueSelector(value: unknown): value is string {
  return typeof value === "string" && SELECTOR_PATTERN.test(value);
}

function isValidLeaseGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSchedulerWorkerName(value: unknown): value is SchedulerWorkerName {
  return value === "ai_verification" || value === "crawl" || value === "enrichment" || value === "artifact" || value === "score_recompute";
}

function isInternalWorkerAction(value: unknown): value is InternalWorkerAction {
  return Object.values(INTERNAL_WORKER_ACTIONS).includes(value as InternalWorkerAction);
}

function actionForWorker(workerName: SchedulerWorkerName): InternalWorkerAction {
  return INTERNAL_WORKER_ACTIONS[workerName];
}

function deny(): never {
  throw new TenantWorkerAuthorizationDeniedError();
}

function denyWithCause(): never {
  // Deliberately do not attach the resolver/Vault/DB error to a response or log.
  deny();
}

async function hasValidVaultWorkerCronSecret(request: NextRequest): Promise<boolean> {
  const token = parseBearerToken(request.headers.get("authorization") ?? "");
  if (!token || !process.env.DATABASE_URL?.trim()) return false;

  try {
    const { getDb } = await import("@/lib/db/index");
    const db = await getDb();
    const row = await db.prepare(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ? LIMIT 1",
    ).get<{ decrypted_secret: string | null }>("worker_cron_secret");
    const secret = row?.decrypted_secret?.trim();
    return Boolean(secret && timingSafeStringEqual(token, secret));
  } catch {
    denyWithCause();
  }
}

function parseBearerToken(header: string): string | null {
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function timingSafeStringEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (valueBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(valueBuffer, expectedBuffer);
}
