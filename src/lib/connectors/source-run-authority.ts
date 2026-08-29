import { isProxy } from "node:util/types";

import type { ConnectorAdapterDescriptor } from "./adapter-contract";
import type { ConnectorPolicyRequest } from "./policy";
import {
  createFixtureConnectorRunner,
  type ConnectorFixturePageExecutor,
  type ConnectorRunPageRequest,
  type ConnectorRunnerResult,
} from "./runner";
import {
  evaluateConnectorSourcePolicy,
  type ConnectorAccountReference,
  type ConnectorRegistryVersionRecord,
  type ConnectorSourcePolicyInput,
  type ConnectorSourcePolicyRecord,
} from "./source-policy-registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{0,159}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_UNITS = 999_999_999_999;

type RunStatus = "queued" | "running" | "paused" | "retry_wait" | "completed"
  | "failed" | "cancelled" | "blocked" | "killed";
type UnitStatus = "queued" | "running" | "paused" | "retry_wait" | "page_complete"
  | "completed" | "cancelled" | "blocked" | "failed";

export type ConnectorCurrentSourcePolicyActivationRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  policyKey: string;
  policyVersion: number;
  sourcePolicyId: string;
  activatedAt: string;
  revokedAt: string | null;
}>;

export type ConnectorSourceRunAuthorityRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  sourceCardId: string;
  connectorVersion: number;
  connectorAccountId: string;
  sourcePolicyId: string;
  inputHash: string;
  operation: string;
  status: RunStatus;
  hardCapUnits: number;
  maxAttempts: number;
  cancelRequestedAt: string | null;
}>;

export type ConnectorSourceRunUnitAuthorityRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  runId: string;
  checkpointKey: string;
  inputHash: string;
  cursor: string | null;
  status: UnitStatus;
  attemptCount: number;
  maxAttempts: number;
  reservedUnits: number;
  leaseGeneration: number;
  leaseTokenHash: string | null;
  leaseWorkerHash: string | null;
  leaseExpiresAt: string | null;
}>;

export type ConnectorSourcePolicyAuthorityRecord = ConnectorSourcePolicyRecord & Readonly<{
  policyKey: string;
}>;

/** Content-minimized projection expected from the future durable repository. */
export type ConnectorSourceRunAuthoritySnapshot = Readonly<{
  registryVersion: ConnectorRegistryVersionRecord;
  account: ConnectorAccountReference;
  policy: ConnectorSourcePolicyAuthorityRecord;
  activation: ConnectorCurrentSourcePolicyActivationRecord;
  run: ConnectorSourceRunAuthorityRecord;
  unit: ConnectorSourceRunUnitAuthorityRecord;
}>;

export type ConnectorSourceRunAuthoritySelector = Readonly<{
  authorizedTenantId: string;
  authorizedWorkspaceId: string | null;
  runId: string;
  unitId: string;
}>;

export type ConnectorSourceRunAuthorityLoader = (
  selector: ConnectorSourceRunAuthoritySelector,
) => unknown | Promise<unknown>;

export type AuthorizedFixtureConnectorPageRequest = Readonly<{
  authorizedTenantId: string;
  authorizedWorkspaceId: string | null;
  runId: string;
  unitId: string;
  fields: readonly string[];
  execute: ConnectorFixturePageExecutor;
}>;

type FixturePageRunner = Readonly<{
  runPage(request: ConnectorRunPageRequest): Promise<ConnectorRunnerResult>;
}>;

export type AuthorizedFixtureConnectorRunnerOptions = Readonly<{
  loadAuthority: ConnectorSourceRunAuthorityLoader;
  clock?: () => Date;
  runner?: FixturePageRunner;
}>;

type PlainRecord = Record<string, unknown>;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set(fields);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    const result: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[field] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function tokenArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
    if (!Number.isSafeInteger(length) || (length as number) < 1 || (length as number) > 64) return null;
    const result: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < (length as number); index += 1) {
      const item = descriptors[String(index)];
      if (!item || !("value" in item) || !item.enumerable || typeof item.value !== "string"
        || !TOKEN.test(item.value) || seen.has(item.value)) return null;
      result.push(item.value);
      seen.add(item.value);
    }
    if (Reflect.ownKeys(descriptors).some((key) => {
      if (key === "length") return false;
      if (typeof key !== "string") return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= (length as number) || String(index) !== key;
    })) return null;
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || canonicalTimestamp(value);
}

function nullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID.test(value));
}

function positiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum;
}

function units(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_UNITS;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function registryRecord(value: unknown): ConnectorRegistryVersionRecord | null {
  const record = exactRecord(value, [
    "sourceCardId", "version", "executionMode", "transport", "operations", "outputFields", "adapterSha256",
  ]);
  const operations = record && tokenArray(record.operations);
  const outputFields = record && tokenArray(record.outputFields);
  if (!record || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !positiveInteger(record.version) || (record.executionMode !== "fixture" && record.executionMode !== "live")
    || (record.transport !== "none" && record.transport !== "network") || !operations || !outputFields
    || typeof record.adapterSha256 !== "string" || !SHA256.test(record.adapterSha256)) return null;
  return Object.freeze({
    sourceCardId: record.sourceCardId,
    version: record.version,
    executionMode: record.executionMode,
    transport: record.transport,
    operations,
    outputFields,
    adapterSha256: record.adapterSha256,
  });
}

function accountRecord(value: unknown): ConnectorAccountReference | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "sourceCardId", "connectorVersion", "status", "credentialRefHash",
  ]);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId) || !nullableUuid(record.workspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !positiveInteger(record.connectorVersion)
    || !["disabled", "fixture_only", "ready", "suspended", "revoked"].includes(record.status as string)
    || (record.credentialRefHash !== null
      && (typeof record.credentialRefHash !== "string" || !SHA256.test(record.credentialRefHash)))) return null;
  return Object.freeze({ ...record }) as unknown as ConnectorAccountReference;
}

function policyRecord(value: unknown): ConnectorSourcePolicyAuthorityRecord | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "sourceCardId", "connectorVersion", "connectorAccountId", "policyKey",
    "version", "state", "executionMode", "termsState", "allowedOperations", "allowedFields", "hardCapUnits",
    "attestationExpiresAt", "attestationRevoked", "policySha256",
  ]);
  const allowedOperations = record && tokenArray(record.allowedOperations);
  const allowedFields = record && tokenArray(record.allowedFields);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId) || !nullableUuid(record.workspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !positiveInteger(record.connectorVersion) || typeof record.connectorAccountId !== "string"
    || !TOKEN.test(record.connectorAccountId) || typeof record.policyKey !== "string" || !TOKEN.test(record.policyKey)
    || !positiveInteger(record.version)
    || !["draft", "active", "superseded", "revoked"].includes(record.state as string)
    || (record.executionMode !== "fixture" && record.executionMode !== "live")
    || !["approved", "pending", "missing", "expired", "revoked"].includes(record.termsState as string)
    || !allowedOperations || !allowedFields || !units(record.hardCapUnits)
    || !nullableTimestamp(record.attestationExpiresAt) || typeof record.attestationRevoked !== "boolean"
    || typeof record.policySha256 !== "string" || !SHA256.test(record.policySha256)) return null;
  return Object.freeze({ ...record, allowedOperations, allowedFields }) as unknown as ConnectorSourcePolicyAuthorityRecord;
}

function activationRecord(value: unknown): ConnectorCurrentSourcePolicyActivationRecord | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "policyKey", "policyVersion", "sourcePolicyId", "activatedAt", "revokedAt",
  ]);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId) || !nullableUuid(record.workspaceId)
    || typeof record.policyKey !== "string" || !TOKEN.test(record.policyKey) || !positiveInteger(record.policyVersion)
    || typeof record.sourcePolicyId !== "string" || !TOKEN.test(record.sourcePolicyId)
    || !canonicalTimestamp(record.activatedAt) || !nullableTimestamp(record.revokedAt)) return null;
  return Object.freeze({ ...record }) as unknown as ConnectorCurrentSourcePolicyActivationRecord;
}

function runRecord(value: unknown): ConnectorSourceRunAuthorityRecord | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "sourceCardId", "connectorVersion", "connectorAccountId", "sourcePolicyId",
    "inputHash", "operation", "status", "hardCapUnits", "maxAttempts", "cancelRequestedAt",
  ]);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId) || !nullableUuid(record.workspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !positiveInteger(record.connectorVersion) || typeof record.connectorAccountId !== "string"
    || !TOKEN.test(record.connectorAccountId) || typeof record.sourcePolicyId !== "string"
    || !TOKEN.test(record.sourcePolicyId) || typeof record.inputHash !== "string" || !SHA256.test(record.inputHash)
    || typeof record.operation !== "string" || !TOKEN.test(record.operation)
    || !["queued", "running", "paused", "retry_wait", "completed", "failed", "cancelled", "blocked", "killed"]
      .includes(record.status as string)
    || !units(record.hardCapUnits) || !positiveInteger(record.maxAttempts, 10)
    || !nullableTimestamp(record.cancelRequestedAt)) return null;
  return Object.freeze({ ...record }) as unknown as ConnectorSourceRunAuthorityRecord;
}

function unitRecord(value: unknown): ConnectorSourceRunUnitAuthorityRecord | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "runId", "checkpointKey", "inputHash", "cursor", "status", "attemptCount",
    "maxAttempts", "reservedUnits", "leaseGeneration", "leaseTokenHash", "leaseWorkerHash", "leaseExpiresAt",
  ]);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId) || !nullableUuid(record.workspaceId)
    || typeof record.runId !== "string" || !TOKEN.test(record.runId) || !boundedText(record.checkpointKey, 512)
    || typeof record.inputHash !== "string" || !SHA256.test(record.inputHash)
    || (record.cursor !== null && !boundedText(record.cursor, 4_096))
    || !["queued", "running", "paused", "retry_wait", "page_complete", "completed", "cancelled", "blocked", "failed"]
      .includes(record.status as string)
    || !Number.isSafeInteger(record.attemptCount) || (record.attemptCount as number) < 0
    || !positiveInteger(record.maxAttempts, 10) || !units(record.reservedUnits)
    || !Number.isSafeInteger(record.leaseGeneration) || (record.leaseGeneration as number) < 0
    || (record.leaseTokenHash !== null
      && (typeof record.leaseTokenHash !== "string" || !SHA256.test(record.leaseTokenHash)))
    || (record.leaseWorkerHash !== null
      && (typeof record.leaseWorkerHash !== "string" || !SHA256.test(record.leaseWorkerHash)))
    || !nullableTimestamp(record.leaseExpiresAt)) return null;
  return Object.freeze({ ...record }) as unknown as ConnectorSourceRunUnitAuthorityRecord;
}

function authoritySnapshot(value: unknown): ConnectorSourceRunAuthoritySnapshot | null {
  const record = exactRecord(value, ["registryVersion", "account", "policy", "activation", "run", "unit"]);
  if (!record) return null;
  const registryVersion = registryRecord(record.registryVersion);
  const account = accountRecord(record.account);
  const policy = policyRecord(record.policy);
  const activation = activationRecord(record.activation);
  const run = runRecord(record.run);
  const unit = unitRecord(record.unit);
  if (!registryVersion || !account || !policy || !activation || !run || !unit) return null;
  return Object.freeze({ registryVersion, account, policy, activation, run, unit });
}

function invocationRecord(value: unknown): AuthorizedFixtureConnectorPageRequest | null {
  const record = exactRecord(value, [
    "authorizedTenantId", "authorizedWorkspaceId", "runId", "unitId", "fields", "execute",
  ]);
  const fields = record && tokenArray(record.fields);
  if (!record || typeof record.authorizedTenantId !== "string" || !UUID.test(record.authorizedTenantId)
    || !nullableUuid(record.authorizedWorkspaceId) || typeof record.runId !== "string" || !TOKEN.test(record.runId)
    || typeof record.unitId !== "string" || !TOKEN.test(record.unitId) || !fields
    || typeof record.execute !== "function") return null;
  return Object.freeze({
    authorizedTenantId: record.authorizedTenantId,
    authorizedWorkspaceId: record.authorizedWorkspaceId,
    runId: record.runId,
    unitId: record.unitId,
    fields,
    execute: record.execute,
  }) as AuthorizedFixtureConnectorPageRequest;
}

function result(status: ConnectorRunnerResult["status"], code: string): ConnectorRunnerResult {
  return Object.freeze({ status, code });
}

function sourcePolicyInput(
  snapshot: ConnectorSourceRunAuthoritySnapshot,
  request: AuthorizedFixtureConnectorPageRequest,
  now: string,
): ConnectorSourcePolicyInput {
  const { policy } = snapshot;
  const policyRecordWithoutKey = Object.freeze({
    id: policy.id,
    tenantId: policy.tenantId,
    workspaceId: policy.workspaceId,
    sourceCardId: policy.sourceCardId,
    connectorVersion: policy.connectorVersion,
    connectorAccountId: policy.connectorAccountId,
    version: policy.version,
    state: policy.state,
    executionMode: policy.executionMode,
    termsState: policy.termsState,
    allowedOperations: policy.allowedOperations,
    allowedFields: policy.allowedFields,
    hardCapUnits: policy.hardCapUnits,
    attestationExpiresAt: policy.attestationExpiresAt,
    attestationRevoked: policy.attestationRevoked,
    policySha256: policy.policySha256,
  });
  return Object.freeze({
    tenantId: snapshot.run.tenantId,
    workspaceId: snapshot.run.workspaceId,
    authorizedTenantId: request.authorizedTenantId,
    authorizedWorkspaceId: request.authorizedWorkspaceId,
    sourceCardId: snapshot.run.sourceCardId,
    connectorVersion: snapshot.run.connectorVersion,
    connectorAccountId: snapshot.run.connectorAccountId,
    sourcePolicyId: snapshot.run.sourcePolicyId,
    executionMode: snapshot.policy.executionMode,
    operation: snapshot.run.operation,
    fields: request.fields,
    requestedUnits: snapshot.unit.reservedUnits,
    now,
    registryVersion: snapshot.registryVersion,
    account: snapshot.account,
    policy: policyRecordWithoutKey,
  });
}

function deriveRunnerRequest(
  snapshot: ConnectorSourceRunAuthoritySnapshot,
  request: AuthorizedFixtureConnectorPageRequest,
  now: string,
): ConnectorRunPageRequest | ConnectorRunnerResult {
  const { activation, policy, run, unit } = snapshot;
  if (request.authorizedTenantId !== run.tenantId || request.authorizedWorkspaceId !== run.workspaceId
    || activation.tenantId !== run.tenantId || activation.workspaceId !== run.workspaceId
    || snapshot.account.tenantId !== run.tenantId || snapshot.account.workspaceId !== run.workspaceId
    || policy.tenantId !== run.tenantId || policy.workspaceId !== run.workspaceId
    || unit.tenantId !== run.tenantId || unit.workspaceId !== run.workspaceId) {
    return result("blocked", "D015_ISOLATION_FAIL");
  }
  if (request.runId !== run.id || request.unitId !== unit.id || unit.runId !== run.id) {
    return result("blocked", "D015_CONFLICT");
  }
  if (unit.inputHash !== run.inputHash || unit.maxAttempts !== run.maxAttempts) {
    return result("blocked", "D015_CONFLICT");
  }
  if (activation.policyKey !== policy.policyKey || activation.policyVersion !== policy.version
    || activation.sourcePolicyId !== policy.id || activation.revokedAt !== null
    || Date.parse(activation.activatedAt) > Date.parse(now)
    || run.sourcePolicyId !== policy.id || run.sourceCardId !== policy.sourceCardId
    || run.connectorVersion !== policy.connectorVersion || run.connectorAccountId !== policy.connectorAccountId
    || run.hardCapUnits > policy.hardCapUnits) {
    return result("blocked", "D015_SOURCE_POLICY_FAIL");
  }
  if (run.cancelRequestedAt !== null || run.status === "cancelled") return result("cancelled", "D015_CANCELLED");
  if (run.status === "paused") return result("paused", "D015_PAUSED");
  if (run.status === "killed") return result("blocked", "D015_KILLED");
  if (run.status !== "running") return result("blocked", "D015_RUN_STATE");
  if (unit.status !== "running" || unit.leaseGeneration < 1 || unit.leaseTokenHash === null
    || unit.leaseWorkerHash === null || unit.leaseExpiresAt === null
    || Date.parse(unit.leaseExpiresAt) <= Date.parse(now) || unit.attemptCount < 1
    || unit.attemptCount !== unit.leaseGeneration || unit.attemptCount > unit.maxAttempts
    || unit.reservedUnits > run.hardCapUnits) {
    return result("blocked", "D015_LEASE_STALE");
  }
  if (run.workspaceId === null) return result("blocked", "D015_SCOPE_FAIL");

  const conformance = evaluateConnectorSourcePolicy(sourcePolicyInput(snapshot, request, now));
  if (conformance.decision === "block") return result("blocked", conformance.code);

  const policyRequest: ConnectorPolicyRequest = Object.freeze({
    sourceCardId: run.sourceCardId,
    executionMode: "fixture",
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    authorizedTenantId: request.authorizedTenantId,
    operation: run.operation,
    fields: request.fields,
    termsState: policy.termsState,
    budget: Object.freeze({ requestedUnits: unit.reservedUnits, remainingUnits: run.hardCapUnits }),
    now,
    ...(policy.attestationExpiresAt === null ? {} : {
      attestation: Object.freeze({
        tenantId: run.tenantId,
        expiresAt: policy.attestationExpiresAt,
        revoked: policy.attestationRevoked,
      }),
    }),
  });
  const descriptor: ConnectorAdapterDescriptor = Object.freeze({
    sourceCardId: snapshot.registryVersion.sourceCardId,
    executionMode: "fixture",
    transport: "none",
    operations: snapshot.registryVersion.operations,
    outputFields: snapshot.registryVersion.outputFields,
  });
  const remainingAttempts = unit.maxAttempts - unit.attemptCount + 1;
  return Object.freeze({
    runId: run.id,
    unitId: unit.id,
    checkpointKey: unit.checkpointKey,
    inputHash: unit.inputHash,
    cursor: unit.cursor,
    maxAttempts: remainingAttempts,
    hardCapUnits: run.hardCapUnits,
    policy: policyRequest,
    descriptor,
    execute: request.execute,
  });
}

/**
 * Fixture-only application bridge. The loader is the sole authority seam; this
 * service does not claim, heartbeat, persist, settle, access storage, or use a network.
 */
export function createAuthorizedFixtureConnectorRunner(options: AuthorizedFixtureConnectorRunnerOptions) {
  if (!options || typeof options.loadAuthority !== "function"
    || (options.clock !== undefined && typeof options.clock !== "function")
    || (options.runner !== undefined && typeof options.runner.runPage !== "function")) {
    throw new TypeError("A fixture connector authority loader is required");
  }
  const loadAuthority = options.loadAuthority;
  const clock = options.clock ?? (() => new Date());
  const runner = options.runner ?? createFixtureConnectorRunner();

  return Object.freeze({
    async runPage(requestValue: AuthorizedFixtureConnectorPageRequest): Promise<ConnectorRunnerResult> {
      const request = invocationRecord(requestValue);
      if (!request) return result("blocked", "D015_MALFORMED");
      const selector = Object.freeze({
        authorizedTenantId: request.authorizedTenantId,
        authorizedWorkspaceId: request.authorizedWorkspaceId,
        runId: request.runId,
        unitId: request.unitId,
      });

      let loaded: unknown;
      let now: string;
      try {
        loaded = await loadAuthority(selector);
        const observedNow = clock();
        if (!(observedNow instanceof Date) || !Number.isFinite(observedNow.getTime())) {
          return result("blocked", "D015_AUTHORITY_UNAVAILABLE");
        }
        now = new Date(observedNow.getTime()).toISOString();
      } catch {
        return result("blocked", "D015_AUTHORITY_UNAVAILABLE");
      }

      const snapshot = authoritySnapshot(loaded);
      if (!snapshot) return result("blocked", "D015_MALFORMED");
      const derived = deriveRunnerRequest(snapshot, request, now);
      if (!("policy" in derived)) return derived;

      // No I/O or caller callback occurs between durable-fact conformance and
      // handing the derived request to the synchronous fixture harness preflight.
      return runner.runPage(derived);
    },
  });
}
