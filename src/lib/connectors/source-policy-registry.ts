import { isProxy } from "node:util/types";

import { CONNECTOR_CARD_REGISTRY, type ConnectorPolicyCode } from "./policy";

export type ConnectorRegistryVersionRecord = Readonly<{
  sourceCardId: string;
  version: number;
  executionMode: "fixture" | "live";
  transport: "none" | "network";
  operations: readonly string[];
  outputFields: readonly string[];
  adapterSha256: string;
}>;

export type ConnectorAccountReference = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  sourceCardId: string;
  connectorVersion: number;
  status: "disabled" | "fixture_only" | "ready" | "suspended" | "revoked";
  credentialRefHash: string | null;
}>;

export type ConnectorSourcePolicyRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string | null;
  sourceCardId: string;
  connectorVersion: number;
  connectorAccountId: string;
  version: number;
  state: "draft" | "active" | "superseded" | "revoked";
  executionMode: "fixture" | "live";
  termsState: "approved" | "pending" | "missing" | "expired" | "revoked";
  allowedOperations: readonly string[];
  allowedFields: readonly string[];
  hardCapUnits: number;
  attestationExpiresAt: string | null;
  attestationRevoked: boolean;
  policySha256: string;
}>;

export type ConnectorSourcePolicyInput = Readonly<{
  tenantId: string;
  workspaceId: string | null;
  authorizedTenantId: string;
  authorizedWorkspaceId: string | null;
  sourceCardId: string;
  connectorVersion: number;
  connectorAccountId: string;
  sourcePolicyId: string;
  executionMode: "fixture" | "live";
  operation: string;
  fields: readonly string[];
  requestedUnits: number;
  now: string;
  registryVersion: ConnectorRegistryVersionRecord;
  account: ConnectorAccountReference;
  policy: ConnectorSourcePolicyRecord;
}>;

export type ConnectorSourcePolicyDecision = Readonly<{
  decision: "allow" | "block";
  code: ConnectorPolicyCode;
  sourceCardId: string;
  connectorVersion: number;
  connectorAccountId: string;
  sourcePolicyId: string;
  sourcePolicyVersion: number;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{0,159}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const IMPLEMENTATION_SOURCES = new Set(Object.keys(CONNECTOR_CARD_REGISTRY));
const DEFERRED_SOURCES = new Set([
  "directories",
  "associations",
  "social_network_profiles",
  "people_data_vendors",
  "licensed_databases",
  "bypass_scraping",
]);

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

function stringArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length === 0 || value.length > 64) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key === "symbol"
      || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) return null;
    const result: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      const item = descriptors[String(index)];
      if (!item || !("value" in item) || !item.enumerable || typeof item.value !== "string"
        || !TOKEN.test(item.value) || seen.has(item.value)) return null;
      seen.add(item.value);
      result.push(item.value);
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID.test(value));
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function registryRecord(value: unknown): ConnectorRegistryVersionRecord | null {
  const record = exactRecord(value, [
    "sourceCardId", "version", "executionMode", "transport", "operations", "outputFields", "adapterSha256",
  ]);
  if (!record || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !integer(record.version) || (record.executionMode !== "fixture" && record.executionMode !== "live")
    || (record.transport !== "none" && record.transport !== "network")
    || typeof record.adapterSha256 !== "string" || !SHA256.test(record.adapterSha256)) return null;
  const operations = stringArray(record.operations);
  const outputFields = stringArray(record.outputFields);
  if (!operations || !outputFields) return null;
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
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || !nullableUuid(record.workspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !integer(record.connectorVersion)
    || (record.status !== "disabled" && record.status !== "fixture_only" && record.status !== "ready"
      && record.status !== "suspended" && record.status !== "revoked")
    || (record.credentialRefHash !== null
      && (typeof record.credentialRefHash !== "string" || !SHA256.test(record.credentialRefHash)))) return null;
  return Object.freeze(record) as unknown as ConnectorAccountReference;
}

function policyRecord(value: unknown): ConnectorSourcePolicyRecord | null {
  const record = exactRecord(value, [
    "id", "tenantId", "workspaceId", "sourceCardId", "connectorVersion", "connectorAccountId", "version",
    "state", "executionMode", "termsState", "allowedOperations", "allowedFields", "hardCapUnits",
    "attestationExpiresAt", "attestationRevoked", "policySha256",
  ]);
  if (!record || typeof record.id !== "string" || !TOKEN.test(record.id)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || !nullableUuid(record.workspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !integer(record.connectorVersion) || typeof record.connectorAccountId !== "string"
    || !TOKEN.test(record.connectorAccountId) || !integer(record.version)
    || (record.state !== "draft" && record.state !== "active" && record.state !== "superseded" && record.state !== "revoked")
    || (record.executionMode !== "fixture" && record.executionMode !== "live")
    || (record.termsState !== "approved" && record.termsState !== "pending" && record.termsState !== "missing"
      && record.termsState !== "expired" && record.termsState !== "revoked")
    || typeof record.hardCapUnits !== "number" || !Number.isFinite(record.hardCapUnits) || record.hardCapUnits < 0
    || (record.attestationExpiresAt !== null && !canonicalTimestamp(record.attestationExpiresAt))
    || typeof record.attestationRevoked !== "boolean"
    || typeof record.policySha256 !== "string" || !SHA256.test(record.policySha256)) return null;
  const allowedOperations = stringArray(record.allowedOperations);
  const allowedFields = stringArray(record.allowedFields);
  if (!allowedOperations || !allowedFields) return null;
  return Object.freeze({ ...record, allowedOperations, allowedFields }) as unknown as ConnectorSourcePolicyRecord;
}

function inputRecord(value: unknown): ConnectorSourcePolicyInput | null {
  const record = exactRecord(value, [
    "tenantId", "workspaceId", "authorizedTenantId", "authorizedWorkspaceId", "sourceCardId",
    "connectorVersion", "connectorAccountId", "sourcePolicyId", "executionMode", "operation", "fields",
    "requestedUnits", "now", "registryVersion", "account", "policy",
  ]);
  if (!record || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || !nullableUuid(record.workspaceId)
    || typeof record.authorizedTenantId !== "string" || !UUID.test(record.authorizedTenantId)
    || !nullableUuid(record.authorizedWorkspaceId)
    || typeof record.sourceCardId !== "string" || !TOKEN.test(record.sourceCardId)
    || !integer(record.connectorVersion) || typeof record.connectorAccountId !== "string"
    || !TOKEN.test(record.connectorAccountId) || typeof record.sourcePolicyId !== "string"
    || !TOKEN.test(record.sourcePolicyId) || (record.executionMode !== "fixture" && record.executionMode !== "live")
    || typeof record.operation !== "string" || !TOKEN.test(record.operation)
    || typeof record.requestedUnits !== "number" || !Number.isFinite(record.requestedUnits) || record.requestedUnits < 0
    || !canonicalTimestamp(record.now)) return null;
  const fields = stringArray(record.fields);
  const registryVersion = registryRecord(record.registryVersion);
  const account = accountRecord(record.account);
  const policy = policyRecord(record.policy);
  if (!fields || !registryVersion || !account || !policy) return null;
  return Object.freeze({ ...record, fields, registryVersion, account, policy }) as unknown as ConnectorSourcePolicyInput;
}

function unsafeSourceCardId(value: unknown): string {
  try {
    if (!value || typeof value !== "object" || isProxy(value)) return "unknown";
    const descriptor = Object.getOwnPropertyDescriptor(value, "sourceCardId");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      && descriptor.value.length <= 160 && TOKEN.test(descriptor.value)
      ? descriptor.value
      : "unknown";
  } catch {
    return "unknown";
  }
}

function decision(
  input: ConnectorSourcePolicyInput | null,
  code: ConnectorPolicyCode,
  sourceCardId = input?.sourceCardId ?? "unknown",
): ConnectorSourcePolicyDecision {
  return Object.freeze({
    decision: code === "D015_PASS" ? "allow" : "block",
    code,
    sourceCardId,
    connectorVersion: input?.connectorVersion ?? 0,
    connectorAccountId: input?.connectorAccountId ?? "unknown",
    sourcePolicyId: input?.sourcePolicyId ?? "unknown",
    sourcePolicyVersion: input?.policy.version ?? 0,
  });
}

function allIncluded(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value));
}

/**
 * Pure conformance gate for persisted connector registry/account/policy facts.
 * It cannot invoke an adapter, read credentials, access storage, or perform I/O.
 */
export function evaluateConnectorSourcePolicy(value: unknown): ConnectorSourcePolicyDecision {
  const input = inputRecord(value);
  if (!input) return decision(null, "D015_MALFORMED", unsafeSourceCardId(value));
  if (!IMPLEMENTATION_SOURCES.has(input.sourceCardId)) {
    return decision(input, DEFERRED_SOURCES.has(input.sourceCardId)
      ? "D015_SOURCE_POLICY_FAIL"
      : "D015_PROVIDER_UNKNOWN");
  }
  if (input.authorizedTenantId !== input.tenantId || input.authorizedWorkspaceId !== input.workspaceId
    || input.account.tenantId !== input.tenantId || input.account.workspaceId !== input.workspaceId
    || input.policy.tenantId !== input.tenantId || input.policy.workspaceId !== input.workspaceId) {
    return decision(input, "D015_ISOLATION_FAIL");
  }

  const card = CONNECTOR_CARD_REGISTRY[input.sourceCardId];
  if (input.executionMode !== "fixture"
    || input.registryVersion.sourceCardId !== input.sourceCardId
    || input.registryVersion.version !== input.connectorVersion
    || input.registryVersion.executionMode !== "fixture" || input.registryVersion.transport !== "none"
    || !allIncluded(input.registryVersion.operations, card.operations)
    || !allIncluded(input.registryVersion.outputFields, card.fields)
    || input.account.id !== input.connectorAccountId || input.account.sourceCardId !== input.sourceCardId
    || input.account.connectorVersion !== input.connectorVersion || input.account.status !== "fixture_only"
    || input.account.credentialRefHash !== null
    || input.policy.id !== input.sourcePolicyId || input.policy.sourceCardId !== input.sourceCardId
    || input.policy.connectorVersion !== input.connectorVersion
    || input.policy.connectorAccountId !== input.connectorAccountId
    || input.policy.state !== "active" || input.policy.executionMode !== "fixture"
    || input.policy.termsState !== "approved"
    || !allIncluded(input.policy.allowedOperations, input.registryVersion.operations)
    || !allIncluded(input.policy.allowedFields, input.registryVersion.outputFields)
    || !input.policy.allowedOperations.includes(input.operation)
    || !allIncluded(input.fields, input.policy.allowedFields)) {
    return decision(input, "D015_SOURCE_POLICY_FAIL");
  }

  if (card.requiresAttestation) {
    const expiresAt = input.policy.attestationExpiresAt;
    if (input.policy.attestationRevoked || expiresAt === null
      || Date.parse(expiresAt) <= Date.parse(input.now)) return decision(input, "D015_SOURCE_POLICY_FAIL");
  }
  if (input.requestedUnits > input.policy.hardCapUnits) return decision(input, "D015_COST_FAIL");
  return decision(input, "D015_PASS");
}
