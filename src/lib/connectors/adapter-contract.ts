import { isProxy } from "node:util/types";

export interface ConnectorAdapterDescriptor {
  readonly sourceCardId: string;
  readonly executionMode: "fixture" | "live";
  readonly transport: "none" | "network";
  readonly operations: readonly string[];
  readonly outputFields: readonly string[];
}

export interface ConnectorFixtureObservation {
  readonly sourceCardId: string;
  readonly operation: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly observedAt: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export type ConnectorAdapterConformanceCode =
  | "D015_PASS"
  | "D015_PROVIDER_UNKNOWN"
  | "D015_SOURCE_POLICY_FAIL"
  | "D015_MALFORMED";

export interface ConnectorAdapterConformanceResult {
  readonly decision: "allow" | "block";
  readonly code: ConnectorAdapterConformanceCode;
  readonly sourceCardId: string;
}

export const GOOGLE_PLACES_FIXTURE_ADAPTER = Object.freeze({
  sourceCardId: "google_places_legacy",
  executionMode: "fixture",
  transport: "none",
  operations: Object.freeze(["search_text", "place_details", "observation_log", "lead_projection"]),
  outputFields: Object.freeze([
    "place_id",
    "business_name",
    "formatted_address",
    "website",
    "phone",
    "maps_uri",
    "category",
    "rating",
    "review_count",
    "operating_hours_metadata",
    "business_status",
  ]),
} as const satisfies ConnectorAdapterDescriptor);

export const CUSTOMER_LIST_FIXTURE_ADAPTER = Object.freeze({
  sourceCardId: "customer_list_csv_upload",
  executionMode: "fixture",
  transport: "none",
  operations: Object.freeze(["upload", "parse_list", "normalize", "dedupe", "link_candidate", "provenance_capture"]),
  outputFields: Object.freeze(["account_name", "website", "industry", "tenant_id", "tag"]),
} as const satisfies ConnectorAdapterDescriptor);

type AdapterContract = Readonly<{
  operations: ReadonlySet<string>;
  outputFields: ReadonlySet<string>;
}>;

const ADAPTER_CONTRACTS: Readonly<Record<string, AdapterContract>> = Object.freeze({
  google_places_legacy: {
    operations: new Set(GOOGLE_PLACES_FIXTURE_ADAPTER.operations),
    outputFields: new Set(GOOGLE_PLACES_FIXTURE_ADAPTER.outputFields),
  },
  customer_list_csv_upload: {
    operations: new Set(CUSTOMER_LIST_FIXTURE_ADAPTER.operations),
    outputFields: new Set(CUSTOMER_LIST_FIXTURE_ADAPTER.outputFields),
  },
});

const PROHIBITED_GOOGLE_REVIEW_KEYS = new Set([
  "reviews",
  "reviewtext",
  "reviewbody",
  "reviewbodies",
]);

function result(
  descriptor: unknown,
  code: ConnectorAdapterConformanceCode,
): ConnectorAdapterConformanceResult {
  const sourceProperty = isPlainRecord(descriptor)
    ? Object.getOwnPropertyDescriptor(descriptor, "sourceCardId")
    : undefined;
  const sourceCardId = sourceProperty
    && "value" in sourceProperty
    && typeof sourceProperty.value === "string"
    ? sourceProperty.value
    : "unknown";
  return {
    decision: code === "D015_PASS" ? "allow" : "block",
    code,
    sourceCardId,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || isProxy(value)) return false;
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function inspectFixtureValue(
  value: unknown,
  seen: Set<object>,
  prohibitGoogleReviews: boolean,
): "safe" | "malformed" | "prohibited" {
  if (value === null || typeof value === "string" || typeof value === "boolean") return "safe";
  if (typeof value === "number") return Number.isFinite(value) ? "safe" : "malformed";
  if (typeof value !== "object") return "malformed";
  if (seen.has(value)) return "malformed";
  seen.add(value);

  if (Array.isArray(value)) {
    for (const nested of value) {
      const nestedResult = inspectFixtureValue(nested, seen, prohibitGoogleReviews);
      if (nestedResult !== "safe") return nestedResult;
    }
    return "safe";
  }
  if (!isPlainRecord(value)) return "malformed";

  const entries: Array<readonly [string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return "malformed";
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return "malformed";
    entries.push([key, descriptor.value]);
  }

  for (const [key, nested] of entries) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (prohibitGoogleReviews
      && normalizedKey !== "reviewcount"
      && (PROHIBITED_GOOGLE_REVIEW_KEYS.has(normalizedKey) || normalizedKey.includes("review"))) {
      return "prohibited";
    }
    const nestedResult = inspectFixtureValue(nested, seen, prohibitGoogleReviews);
    if (nestedResult !== "safe") return nestedResult;
  }
  return "safe";
}

function parseObservation(value: unknown): ConnectorFixtureObservation | null {
  if (!isPlainRecord(value)
    || !isNonEmptyString(value.sourceCardId)
    || !isNonEmptyString(value.operation)
    || !isNonEmptyString(value.tenantId)
    || !isNonEmptyString(value.runId)
    || !isNonEmptyString(value.observedAt)
    || !isCanonicalTimestamp(value.observedAt)
    || !isPlainRecord(value.fields)
    || Object.keys(value.fields).length === 0) {
    return null;
  }

  return value as unknown as ConnectorFixtureObservation;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isHttpUrl(value: unknown): boolean {
  if (!isBoundedString(value, 2_048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasValidGoogleFieldValues(fields: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(fields).every(([field, value]) => {
    switch (field) {
      case "place_id":
        return isBoundedString(value, 256);
      case "business_name":
        return isBoundedString(value, 512);
      case "formatted_address":
        return isBoundedString(value, 1_000);
      case "website":
      case "maps_uri":
        return isHttpUrl(value);
      case "phone":
        return isBoundedString(value, 64);
      case "category":
        return typeof value === "string" && /^[a-z0-9_]{1,80}$/u.test(value);
      case "rating":
        return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
      case "review_count":
        return Number.isSafeInteger(value) && (value as number) >= 0;
      case "operating_hours_metadata":
        return isPlainRecord(value);
      case "business_status":
        return value === "OPERATIONAL"
          || value === "CLOSED_TEMPORARILY"
          || value === "CLOSED_PERMANENTLY";
      default:
        return false;
    }
  });
}

function hasValidCustomerListFieldValues(fields: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(fields).every(([field, value]) => {
    switch (field) {
      case "account_name":
        return isBoundedString(value, 512);
      case "website":
        return isHttpUrl(value);
      case "industry":
      case "tenant_id":
      case "tag":
        return isBoundedString(value, 256);
      default:
        return false;
    }
  });
}

function snapshotStringArray(value: unknown): readonly string[] | null {
  if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)) return null;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length
    || !("value" in length)
    || typeof length.value !== "number"
    || !Number.isSafeInteger(length.value)
    || length.value < 0) {
    return null;
  }

  const snapshot: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !("value" in item) || !item.enumerable || !isNonEmptyString(item.value)) {
      return null;
    }
    snapshot.push(item.value);
  }
  return Object.freeze(snapshot);
}

function snapshotDescriptor(value: unknown): ConnectorAdapterDescriptor | null {
  if (!isPlainRecord(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return null;
    const property = descriptors[key];
    if (!("value" in property) || !property.enumerable) return null;
  }

  const sourceCardId = descriptors.sourceCardId?.value;
  const executionMode = descriptors.executionMode?.value;
  const transport = descriptors.transport?.value;
  const operations = snapshotStringArray(descriptors.operations?.value);
  const outputFields = snapshotStringArray(descriptors.outputFields?.value);
  if (!isNonEmptyString(sourceCardId)
    || (executionMode !== "fixture" && executionMode !== "live")
    || (transport !== "none" && transport !== "network")
    || !operations
    || !outputFields) {
    return null;
  }

  return Object.freeze({ sourceCardId, executionMode, transport, operations, outputFields });
}

function resolveDescriptor(
  descriptorValue: unknown,
): Readonly<{ descriptor: ConnectorAdapterDescriptor; contract: AdapterContract }>
  | ConnectorAdapterConformanceResult {
  const descriptor = snapshotDescriptor(descriptorValue);
  if (!descriptor) return result(null, "D015_MALFORMED");
  if (!Object.hasOwn(ADAPTER_CONTRACTS, descriptor.sourceCardId)) {
    return result(descriptor, "D015_PROVIDER_UNKNOWN");
  }
  const contract = ADAPTER_CONTRACTS[descriptor.sourceCardId];
  if (descriptor.executionMode !== "fixture"
    || descriptor.transport !== "none"
    || descriptor.operations.length === 0
    || descriptor.outputFields.length === 0
    || descriptor.operations.some((operation) => !contract.operations.has(operation))
    || descriptor.outputFields.some((field) => !contract.outputFields.has(field))) {
    return result(descriptor, "D015_SOURCE_POLICY_FAIL");
  }
  return { descriptor, contract };
}

export function evaluateConnectorAdapterFixture(
  descriptorValue: ConnectorAdapterDescriptor,
  observationValue: unknown,
  expectedScope?: Readonly<{ tenantId: string }>,
): ConnectorAdapterConformanceResult {
  const resolved = resolveDescriptor(descriptorValue);
  if ("decision" in resolved) return resolved;
  const { descriptor } = resolved;

  const observation = parseObservation(observationValue);
  if (!observation) return result(descriptor, "D015_MALFORMED");
  if (observation.sourceCardId !== descriptor.sourceCardId
    || (expectedScope && observation.tenantId !== expectedScope.tenantId)
    || !descriptor.operations.includes(observation.operation)
    || Object.keys(observation.fields).some((field) => !descriptor.outputFields.includes(field))) {
    return result(descriptor, "D015_SOURCE_POLICY_FAIL");
  }

  const contentState = inspectFixtureValue(
    observation.fields,
    new Set(),
    descriptor.sourceCardId === "google_places_legacy",
  );
  if (contentState === "malformed") return result(descriptor, "D015_MALFORMED");
  if (contentState === "prohibited") return result(descriptor, "D015_SOURCE_POLICY_FAIL");

  if (descriptor.sourceCardId === "google_places_legacy"
    && !hasValidGoogleFieldValues(observation.fields)) {
    return result(descriptor, "D015_MALFORMED");
  }
  if (descriptor.sourceCardId === "customer_list_csv_upload") {
    if (!hasValidCustomerListFieldValues(observation.fields)) {
      return result(descriptor, "D015_MALFORMED");
    }
    if (observation.fields.tenant_id !== observation.tenantId) {
      return result(descriptor, "D015_SOURCE_POLICY_FAIL");
    }
  }

  return result(descriptor, "D015_PASS");
}

export type ConnectorFixtureExecutionResult<T> = Readonly<{
  policy: ConnectorPolicyDecision;
  conformance?: ConnectorAdapterConformanceResult;
  output?: T;
}>;

/**
 * Composes preflight and output conformance so a caller cannot receive an
 * unchecked fixture observation from an otherwise allowed source request.
 */
export async function executeConnectorFixtureWithPolicy<T>(
  request: ConnectorPolicyRequest,
  descriptor: ConnectorAdapterDescriptor,
  execute: () => T | Promise<T>,
): Promise<ConnectorFixtureExecutionResult<Awaited<T>>> {
  const policy = evaluateConnectorPolicy(request);
  if (policy.decision === "block") return { policy };

  const resolvedDescriptor = resolveDescriptor(descriptor);
  if ("decision" in resolvedDescriptor) return { policy, conformance: resolvedDescriptor };
  const boundDescriptor = resolvedDescriptor.descriptor;
  if (boundDescriptor.sourceCardId !== request.sourceCardId) {
    return { policy, conformance: result(boundDescriptor, "D015_SOURCE_POLICY_FAIL") };
  }

  let output: Awaited<T>;
  try {
    output = await execute();
  } catch {
    return { policy, conformance: result(boundDescriptor, "D015_MALFORMED") };
  }

  const conformance = evaluateConnectorAdapterFixture(boundDescriptor, output, {
    tenantId: request.tenantId,
  });
  if (conformance.decision === "block") return { policy, conformance };
  return { policy, conformance, output };
}
import {
  evaluateConnectorPolicy,
  type ConnectorPolicyDecision,
  type ConnectorPolicyRequest,
} from "./policy";
