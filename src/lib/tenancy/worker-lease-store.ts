import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { DbClient } from "@/lib/db";
import {
  INTERNAL_WORKER_ACTIONS,
  INTERNAL_WORKER_LEASE_INTEGRITY_VERSION,
  INTERNAL_WORKER_LEASE_RECORD_VERSION,
  type InternalWorkerAction,
  type TenantWorkerLeaseRecord,
} from "@/lib/internal-worker-auth";
import type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SELECTOR_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export interface AcquireTenantWorkerLeaseInput {
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly jobId: string;
  readonly runId: string;
  readonly leaseGeneration: number;
  readonly workerName: SchedulerWorkerName;
  readonly action: InternalWorkerAction;
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  /** Exact capability returned by a prior created result; required for replay. */
  readonly retryCapability?: Readonly<{ selector: string; leaseId: string }>;
}

export interface AcquiredTenantWorkerLease {
  readonly kind: "created" | "replay";
  readonly record: TenantWorkerLeaseRecord;
}

export interface CancelledTenantWorkerLease {
  readonly kind: "cancelled" | "replay";
  readonly leaseId: string;
  readonly leaseGeneration: number;
  readonly revokedAt: string;
}

export interface TenantWorkerLeaseIssuer {
  acquire(input: AcquireTenantWorkerLeaseInput): Promise<AcquiredTenantWorkerLease | null>;
  cancel(record: TenantWorkerLeaseRecord): Promise<CancelledTenantWorkerLease | null>;
}

export interface TenantWorkerLeaseResolver {
  resolve(
    selector: string,
    expected: Readonly<{ workerName: SchedulerWorkerName; action: InternalWorkerAction }>,
  ): Promise<TenantWorkerLeaseRecord | null>;
}

interface WorkerLeaseIssuerOptions {
  /** Must be backed by a connection granted acquire/cancel only. */
  readonly db: () => Promise<DbClient>;
  readonly createSelector?: () => string;
  readonly createLeaseId?: () => string;
}

interface WorkerLeaseResolverOptions {
  /** Must be backed by a connection granted resolve only. */
  readonly db: () => Promise<DbClient>;
}

const ACQUIRE_SQL = `SELECT
  kind,
  tenant_id AS "tenantId",
  workspace_id AS "workspaceId",
  job_id AS "jobId",
  run_id AS "runId",
  lease_id AS "leaseId",
  selector_hash AS "selectorHash",
  lease_generation AS "leaseGeneration",
  worker_name AS "workerName",
  action,
  not_before AS "notBefore",
  expires_at AS "expiresAt",
  correlation_id AS "correlationId",
  record_version AS "recordVersion",
  integrity_version AS "integrityVersion"
FROM public.novatrade_acquire_tenant_worker_lease(?,?,?,?,?,?,?,?,?,?,?,?)`;

const CANCEL_SQL = `SELECT
  kind,
  tenant_id AS "tenantId",
  workspace_id AS "workspaceId",
  job_id AS "jobId",
  run_id AS "runId",
  lease_id AS "leaseId",
  selector_hash AS "selectorHash",
  lease_generation AS "leaseGeneration",
  worker_name AS "workerName",
  action,
  not_before AS "notBefore",
  expires_at AS "expiresAt",
  correlation_id AS "correlationId",
  record_version AS "recordVersion",
  integrity_version AS "integrityVersion",
  revoked_at AS "revokedAt",
  revocation_reason AS "revocationReason"
FROM public.novatrade_cancel_tenant_worker_lease(?,?,?,?,?,?,?,?,?,?,?,?)`;

const RESOLVE_SQL = `SELECT
  tenant_id AS "tenantId",
  workspace_id AS "workspaceId",
  job_id AS "jobId",
  run_id AS "runId",
  lease_id AS "leaseId",
  lease_generation AS "leaseGeneration",
  worker_name AS "workerName",
  action,
  status,
  not_before AS "notBefore",
  expires_at AS "expiresAt",
  correlation_id AS "correlationId",
  record_version AS "recordVersion",
  integrity_version AS "integrityVersion"
FROM public.novatrade_resolve_tenant_worker_lease(?,?,?)`;

export function createTenantWorkerLeaseIssuer(options: WorkerLeaseIssuerOptions): TenantWorkerLeaseIssuer {
  if (!options || typeof options.db !== "function") {
    throw new TypeError("A dedicated tenant worker lease issuer database provider is required");
  }
  const dbProvider = options.db;
  const selectorFactory = options.createSelector ?? (() => randomBytes(32).toString("base64url"));
  const leaseIdFactory = options.createLeaseId ?? randomUUID;

  return Object.freeze({
    acquire: async (input: AcquireTenantWorkerLeaseInput) => {
      try {
        if (!isAcquireInput(input)) return null;
      } catch {
        return null;
      }

      const selector = input.retryCapability?.selector ?? selectorFactory();
      const leaseId = input.retryCapability?.leaseId ?? leaseIdFactory();
      if (!isOpaqueSelector(selector) || !isUuid(leaseId)) return null;

      const db = await dbProvider();
      const row = await db.prepare(ACQUIRE_SQL).get<Record<string, unknown>>(
        hashSelector(selector),
        input.tenantId,
        input.workspaceId,
        input.jobId,
        input.runId,
        leaseId,
        String(input.leaseGeneration),
        input.workerName,
        input.action,
        input.notBefore,
        input.expiresAt,
        input.correlationId,
      );
      if (!row || (row.kind !== "created" && row.kind !== "replay")) return null;
      const record = parseLeaseRow(row, selector, input.workerName, input.action, true);
      return record && row.selectorHash === hashSelector(selector) && matchesAcquireRequest(record, input, leaseId)
        ? Object.freeze({ kind: row.kind, record })
        : null;
    },

    cancel: async (record: TenantWorkerLeaseRecord) => {
      try {
        if (!isLeaseRecordInput(record)) return null;
      } catch {
        return null;
      }

      const db = await dbProvider();
      const row = await db.prepare(CANCEL_SQL).get<Record<string, unknown>>(
        hashSelector(record.selector),
        record.tenantId,
        record.workspaceId,
        record.jobId,
        record.runId,
        record.leaseId,
        String(record.leaseGeneration),
        record.workerName,
        record.action,
        record.notBefore,
        record.expiresAt,
        record.correlationId,
      );
      if (!row || (row.kind !== "cancelled" && row.kind !== "replay")) return null;
      const parsed = parseLeaseRow(row, record.selector, record.workerName, record.action, true, true);
      const revokedAt = normalizeTime(row.revokedAt);
      if (
        !parsed ||
        row.selectorHash !== hashSelector(record.selector) ||
        !matchesLeaseRecord(parsed, record) ||
        !revokedAt ||
        row.revocationReason !== "cancelled"
      ) return null;
      return Object.freeze({
        kind: row.kind,
        leaseId: parsed.leaseId,
        leaseGeneration: parsed.leaseGeneration,
        revokedAt,
      });
    },
  });
}

export function createTenantWorkerLeaseResolver(options: WorkerLeaseResolverOptions): TenantWorkerLeaseResolver {
  if (!options || typeof options.db !== "function") {
    throw new TypeError("A dedicated tenant worker lease resolver database provider is required");
  }
  const dbProvider = options.db;

  return Object.freeze({

    resolve: async (
      selector: string,
      expected: Readonly<{ workerName: SchedulerWorkerName; action: InternalWorkerAction }>,
    ) => {
      try {
        if (
          !isOpaqueSelector(selector) ||
          !isWorkerActionPair(expected?.workerName, expected?.action)
        ) return null;
      } catch {
        return null;
      }

      const db = await dbProvider();
      const rows = await db.prepare(RESOLVE_SQL).all<Record<string, unknown>>(
        hashSelector(selector),
        expected.workerName,
        expected.action,
      );
      if (rows.length !== 1) return null;
      return parseLeaseRow(rows[0], selector, expected.workerName, expected.action, false);
    },
  });
}

function parseLeaseRow(
  row: Record<string, unknown>,
  selector: string,
  workerName: SchedulerWorkerName,
  action: InternalWorkerAction,
  acquired: boolean,
  cancelled = false,
): TenantWorkerLeaseRecord | null {
  try {
    const allowedKeys = new Set([
      ...(acquired ? ["kind"] : ["status"]),
      ...(acquired ? ["selectorHash"] : []),
      ...(cancelled ? ["revokedAt", "revocationReason"] : []),
      "tenantId", "workspaceId", "jobId", "runId", "leaseId", "leaseGeneration",
      "workerName", "action", "notBefore", "expiresAt", "correlationId",
      "recordVersion", "integrityVersion",
    ]);
    if (Reflect.ownKeys(row).some((key) => typeof key !== "string" || !allowedKeys.has(key))) return null;
    const leaseGeneration = normalizeGeneration(row.leaseGeneration);
    const notBefore = normalizeTime(row.notBefore);
    const expiresAt = normalizeTime(row.expiresAt);
    if (
      !isUuid(row.tenantId) ||
      (row.workspaceId !== null && !isUuid(row.workspaceId)) ||
      !isUuid(row.jobId) ||
      !isUuid(row.runId) ||
      !isUuid(row.leaseId) ||
      leaseGeneration === null ||
      row.workerName !== workerName ||
      row.action !== action ||
      (!acquired && row.status !== "active") ||
      !notBefore ||
      !expiresAt ||
      new Date(expiresAt).getTime() <= new Date(notBefore).getTime() ||
      typeof row.correlationId !== "string" ||
      !CORRELATION_PATTERN.test(row.correlationId) ||
      Number(row.recordVersion) !== INTERNAL_WORKER_LEASE_RECORD_VERSION ||
      row.integrityVersion !== INTERNAL_WORKER_LEASE_INTEGRITY_VERSION
    ) return null;

    return Object.freeze({
      selector,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      jobId: row.jobId,
      runId: row.runId,
      leaseId: row.leaseId,
      leaseGeneration,
      workerName,
      action,
      status: "active",
      notBefore,
      expiresAt,
      correlationId: row.correlationId,
      recordVersion: INTERNAL_WORKER_LEASE_RECORD_VERSION,
      integrityVersion: INTERNAL_WORKER_LEASE_INTEGRITY_VERSION,
    });
  } catch {
    return null;
  }
}

function matchesAcquireRequest(
  record: TenantWorkerLeaseRecord,
  input: AcquireTenantWorkerLeaseInput,
  leaseId: string,
): boolean {
  return record.tenantId === input.tenantId &&
    record.workspaceId === input.workspaceId &&
    record.jobId === input.jobId &&
    record.runId === input.runId &&
    record.leaseId === leaseId &&
    record.leaseGeneration === input.leaseGeneration &&
    record.workerName === input.workerName &&
    record.action === input.action &&
    record.notBefore === input.notBefore &&
    record.expiresAt === input.expiresAt &&
    record.correlationId === input.correlationId;
}

function matchesLeaseRecord(actual: TenantWorkerLeaseRecord, expected: TenantWorkerLeaseRecord): boolean {
  return actual.selector === expected.selector &&
    actual.tenantId === expected.tenantId &&
    actual.workspaceId === expected.workspaceId &&
    actual.jobId === expected.jobId &&
    actual.runId === expected.runId &&
    actual.leaseId === expected.leaseId &&
    actual.leaseGeneration === expected.leaseGeneration &&
    actual.workerName === expected.workerName &&
    actual.action === expected.action &&
    actual.status === expected.status &&
    actual.notBefore === expected.notBefore &&
    actual.expiresAt === expected.expiresAt &&
    actual.correlationId === expected.correlationId &&
    actual.recordVersion === expected.recordVersion &&
    actual.integrityVersion === expected.integrityVersion;
}

function isLeaseRecordInput(value: unknown): value is TenantWorkerLeaseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<TenantWorkerLeaseRecord>;
  return isOpaqueSelector(record.selector) &&
    isUuid(record.tenantId) &&
    (record.workspaceId === null || isUuid(record.workspaceId)) &&
    isUuid(record.jobId) &&
    isUuid(record.runId) &&
    isUuid(record.leaseId) &&
    normalizeGeneration(record.leaseGeneration) === record.leaseGeneration &&
    isWorkerActionPair(record.workerName, record.action) &&
    record.status === "active" &&
    isCanonicalTime(record.notBefore) &&
    isCanonicalTime(record.expiresAt) &&
    new Date(record.expiresAt).getTime() > new Date(record.notBefore).getTime() &&
    typeof record.correlationId === "string" &&
    CORRELATION_PATTERN.test(record.correlationId) &&
    record.recordVersion === INTERNAL_WORKER_LEASE_RECORD_VERSION &&
    record.integrityVersion === INTERNAL_WORKER_LEASE_INTEGRITY_VERSION;
}

function isAcquireInput(value: unknown): value is AcquireTenantWorkerLeaseInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<AcquireTenantWorkerLeaseInput>;
  return isUuid(input.tenantId) &&
    (input.workspaceId === null || isUuid(input.workspaceId)) &&
    isUuid(input.jobId) &&
    isUuid(input.runId) &&
    typeof input.leaseGeneration === "number" &&
    Number.isSafeInteger(input.leaseGeneration) &&
    input.leaseGeneration > 0 &&
    isWorkerActionPair(input.workerName, input.action) &&
    isCanonicalTime(input.notBefore) &&
    isCanonicalTime(input.expiresAt) &&
    new Date(input.expiresAt).getTime() > new Date(input.notBefore).getTime() &&
    typeof input.correlationId === "string" &&
    CORRELATION_PATTERN.test(input.correlationId) &&
    (
      input.retryCapability === undefined ||
      (
        isOpaqueSelector(input.retryCapability.selector) &&
        isUuid(input.retryCapability.leaseId)
      )
    );
}

function isWorkerActionPair(workerName: unknown, action: unknown): workerName is SchedulerWorkerName {
  return typeof workerName === "string" &&
    Object.prototype.hasOwnProperty.call(INTERNAL_WORKER_ACTIONS, workerName) &&
    INTERNAL_WORKER_ACTIONS[workerName as SchedulerWorkerName] === action;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOpaqueSelector(value: unknown): value is string {
  return typeof value === "string" && SELECTOR_PATTERN.test(value);
}

function isCanonicalTime(value: unknown): value is string {
  return typeof value === "string" && normalizeTime(value) === value;
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeGeneration(value: unknown): number | null {
  const numberValue = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function hashSelector(selector: string): string {
  return createHash("sha256").update(selector, "utf8").digest("hex");
}
