import { isProxy } from "node:util/types";

export type ConnectorExecutionMode = "fixture" | "live";
export type ConnectorTermsState = "approved" | "pending" | "missing" | "expired" | "revoked";

export interface ConnectorBudget {
  readonly requestedUnits: number;
  readonly remainingUnits: number;
}

export interface ConnectorAttestation {
  readonly tenantId: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export interface ConnectorPolicyRequest {
  readonly sourceCardId: string;
  readonly executionMode: ConnectorExecutionMode;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly authorizedTenantId: string;
  readonly operation: string;
  readonly fields: readonly string[];
  readonly termsState: ConnectorTermsState;
  readonly budget: ConnectorBudget;
  readonly now: string;
  readonly attestation?: ConnectorAttestation;
  readonly query?: string;
}

export type ConnectorPolicyCode =
  | "D015_PASS"
  | "D015_PROVIDER_UNKNOWN"
  | "D015_SOURCE_POLICY_FAIL"
  | "D015_SCOPE_FAIL"
  | "D015_ISOLATION_FAIL"
  | "D015_COST_FAIL"
  | "D015_MALFORMED";

type ConnectorPolicyBlockCode = Exclude<ConnectorPolicyCode, "D015_PASS">;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{0,159}$/u;

export type ConnectorPolicyDecision =
  | Readonly<{
      decision: "allow";
      code: "D015_PASS";
      sourceCardId: string;
    }>
  | Readonly<{
      decision: "block";
      code: ConnectorPolicyBlockCode;
      sourceCardId: string;
    }>;

type ConnectorCard = Readonly<{
  operations: readonly string[];
  fields: readonly string[];
  requiresAttestation: boolean;
}>;

function values(entries: readonly string[]): readonly string[] {
  return Object.freeze([...entries]);
}

function connectorCard(card: ConnectorCard): ConnectorCard {
  return Object.freeze(card);
}

export const CONNECTOR_CARD_REGISTRY: Readonly<Record<string, ConnectorCard>> = Object.freeze({
  google_places_legacy: connectorCard({
    operations: values(["search_text", "place_details", "observation_log", "lead_projection"]),
    fields: values([
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
    requiresAttestation: false,
  }),
  tenant_upload_document: connectorCard({
    operations: values(["create_reservation", "upload", "quarantine", "parse", "version", "provenance_capture"]),
    fields: values(["text_chunk", "table", "section", "parser_output", "checksum", "size"]),
    requiresAttestation: true,
  }),
  customer_list_csv_upload: connectorCard({
    operations: values(["upload", "parse_list", "normalize", "dedupe", "link_candidate", "provenance_capture"]),
    fields: values(["account_name", "website", "industry", "tenant_id", "tag"]),
    requiresAttestation: true,
  }),
  tenant_authorized_urls: connectorCard({
    operations: values(["fetch", "safe_parse", "extract", "citation_capture", "domain_tagging"]),
    fields: values(["origin_domain", "resolved_url", "page_title", "page_meta", "business_fact", "evidence_snippet"]),
    requiresAttestation: true,
  }),
  public_official_company_website: connectorCard({
    operations: values(["crawl_discovery", "domain_verification", "fetch", "canonicality_check", "extract"]),
    fields: values(["official_domain", "canonical_host", "claim_evidence", "evidence_snippet"]),
    requiresAttestation: true,
  }),
});

function block(
  request: Readonly<{ sourceCardId: string }>,
  code: ConnectorPolicyBlockCode,
): ConnectorPolicyDecision {
  return Object.freeze({
    decision: "block",
    code,
    sourceCardId: request.sourceCardId,
  });
}

function allow(request: ConnectorPolicyRequest): ConnectorPolicyDecision {
  return Object.freeze({ decision: "allow", code: "D015_PASS", sourceCardId: request.sourceCardId });
}

function dataRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || isProxy(value)) return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    if (required.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
    if (!Number.isSafeInteger(length) || (length as number) < 1 || (length as number) > 64) return null;
    const snapshot: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < (length as number); index += 1) {
      const item = descriptors[String(index)];
      if (!item || !("value" in item) || !item.enumerable || typeof item.value !== "string"
        || !TOKEN.test(item.value) || seen.has(item.value)) return null;
      seen.add(item.value);
      snapshot.push(item.value);
    }
    if (Reflect.ownKeys(descriptors).some((key) => {
      if (key === "length") return false;
      if (typeof key !== "string") return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= (length as number) || String(index) !== key;
    })) return null;
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotPolicyRequest(value: unknown): ConnectorPolicyRequest | null {
  const input = dataRecord(value, [
    "sourceCardId", "executionMode", "tenantId", "workspaceId", "authorizedTenantId",
    "operation", "fields", "termsState", "budget", "now",
  ], ["attestation", "query"]);
  if (!input) return null;
  const fields = stringArray(input.fields);
  const budget = dataRecord(input.budget, ["requestedUnits", "remainingUnits"]);
  const attestation = input.attestation === undefined
    ? undefined
    : dataRecord(input.attestation, ["tenantId", "expiresAt", "revoked"]);
  if (!fields || !budget || attestation === null) return null;
  return Object.freeze({
    ...input,
    fields,
    budget: Object.freeze(budget),
    ...(attestation ? { attestation: Object.freeze(attestation) } : {}),
  }) as unknown as ConnectorPolicyRequest;
}

function malformed(sourceCardId: string): ConnectorPolicyDecision {
  return block({ sourceCardId }, "D015_MALFORMED");
}

function isNonEmpty(value: string): boolean {
  return value.length <= 160 && value.trim().length > 0 && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function canonicalTimestamp(value: string): boolean {
  if (value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasValidBudget(budget: ConnectorBudget): boolean {
  return Number.isFinite(budget.requestedUnits)
    && Number.isFinite(budget.remainingUnits)
    && budget.requestedUnits >= 0
    && budget.remainingUnits >= 0
    && budget.requestedUnits <= budget.remainingUnits;
}

function hasCurrentAttestation(
  request: ConnectorPolicyRequest,
  attestation: ConnectorAttestation | undefined,
): boolean {
  if (!attestation || attestation.revoked || attestation.tenantId !== request.tenantId) return false;

  if (!canonicalTimestamp(request.now) || !canonicalTimestamp(attestation.expiresAt)) return false;
  return Date.parse(attestation.expiresAt) > Date.parse(request.now);
}

/**
 * Pure preflight gate. It intentionally performs no provider, credential, audit,
 * or persistence work so callers can prove a block happened before side effects.
 */
export function evaluateConnectorPolicy(requestValue: ConnectorPolicyRequest): ConnectorPolicyDecision;
export function evaluateConnectorPolicy(requestValue: unknown): ConnectorPolicyDecision {
  const request = snapshotPolicyRequest(requestValue);
  if (!request) return malformed("unknown");
  const sourceCardId = typeof request.sourceCardId === "string" && isNonEmpty(request.sourceCardId)
    ? request.sourceCardId
    : "unknown";
  if (sourceCardId === "unknown") return malformed("unknown");
  if (!Object.hasOwn(CONNECTOR_CARD_REGISTRY, sourceCardId)) {
    return block({ sourceCardId }, "D015_PROVIDER_UNKNOWN");
  }
  if (typeof request.executionMode !== "string"
    || typeof request.tenantId !== "string"
    || typeof request.workspaceId !== "string"
    || typeof request.authorizedTenantId !== "string"
    || typeof request.operation !== "string" || !TOKEN.test(request.operation)
    || typeof request.termsState !== "string"
    || typeof request.budget.requestedUnits !== "number"
    || typeof request.budget.remainingUnits !== "number"
    || typeof request.now !== "string" || !canonicalTimestamp(request.now)
    || (request.query !== undefined && (typeof request.query !== "string" || request.query.length > 10_000))
    || (request.attestation !== undefined && (
      typeof request.attestation.tenantId !== "string" || !isNonEmpty(request.attestation.tenantId)
      || typeof request.attestation.expiresAt !== "string" || !canonicalTimestamp(request.attestation.expiresAt)
      || typeof request.attestation.revoked !== "boolean"
    ))) {
    return malformed(sourceCardId);
  }
  const card = CONNECTOR_CARD_REGISTRY[sourceCardId];

  if (!isNonEmpty(request.tenantId)
    || !isNonEmpty(request.workspaceId)
    || !isNonEmpty(request.authorizedTenantId)) {
    return block(request, "D015_SCOPE_FAIL");
  }
  if (request.authorizedTenantId !== request.tenantId) {
    return block(request, "D015_ISOLATION_FAIL");
  }
  if (request.executionMode !== "fixture") {
    return block(request, "D015_SOURCE_POLICY_FAIL");
  }
  if (request.termsState !== "approved") {
    return block(request, "D015_SOURCE_POLICY_FAIL");
  }
  if (!card.operations.includes(request.operation)
    || request.fields.length === 0
    || request.fields.some((field) => !card.fields.includes(field))) {
    return block(request, "D015_SOURCE_POLICY_FAIL");
  }
  if (card.requiresAttestation && !hasCurrentAttestation(request, request.attestation)) {
    return block(request, "D015_SOURCE_POLICY_FAIL");
  }
  if (!hasValidBudget(request.budget)) {
    return block(request, "D015_COST_FAIL");
  }

  return allow(request);
}
