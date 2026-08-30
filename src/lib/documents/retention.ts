import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { buildDocumentObjectKey } from "./object-keys";
import {
  DOCUMENT_LIFECYCLE_STATES,
  type DocumentLifecycleState,
} from "./state-machine";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const INPUT_FIELDS = [
  "contractVersion",
  "scopeTenantId",
  "tenantId",
  "documentId",
  "versionId",
  "objectKey",
  "state",
  "isCurrentVersion",
  "policyVersion",
  "evaluatedAt",
  "retentionExpiresAt",
  "legalHoldActive",
  "supportHoldActive",
  "idempotencyKey",
  "priorInputSha256",
] as const;

const LIFECYCLE_STATES: ReadonlySet<unknown> = new Set(DOCUMENT_LIFECYCLE_STATES);
const IN_FLIGHT_STATES: ReadonlySet<DocumentLifecycleState> = new Set([
  "upload_reserved",
  "quarantined",
  "scanning",
  "extracting",
]);
const DELETION_STATES: ReadonlySet<DocumentLifecycleState> = new Set([
  "deletion_pending",
  "deletion_failed",
]);

export type DocumentRetentionInput = Readonly<{
  contractVersion: 1;
  scopeTenantId: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  state: DocumentLifecycleState;
  isCurrentVersion: boolean;
  policyVersion: string;
  evaluatedAt: string;
  retentionExpiresAt: string;
  legalHoldActive: boolean;
  supportHoldActive: boolean;
  idempotencyKey: string;
  priorInputSha256: `sha256:${string}` | null;
}>;

export type DocumentRetentionDispositionReason =
  | "retention_elapsed"
  | "replay_conflict"
  | "legal_hold_active"
  | "support_hold_active"
  | "incident_hold_active"
  | "current_version"
  | "clean_version"
  | "workflow_in_flight"
  | "deletion_in_progress"
  | "already_deleted"
  | "retention_active";

export type DocumentRetentionDisposition = Readonly<{
  contractVersion: 1;
  disposition: "purge_eligible" | "retain";
  reason: DocumentRetentionDispositionReason;
  tenantId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  state: DocumentLifecycleState;
  isCurrentVersion: boolean;
  policyVersion: string;
  evaluatedAt: string;
  retentionExpiresAt: string;
  idempotencyKey: string;
  inputSha256: `sha256:${string}`;
}>;

export type DocumentRetentionErrorCode =
  | "malformed_input"
  | "tenant_scope_mismatch"
  | "unsafe_object_key";

export class DocumentRetentionError extends Error {
  readonly code: DocumentRetentionErrorCode;

  constructor(code: DocumentRetentionErrorCode) {
    super("The document retention disposition input is invalid.");
    this.name = "DocumentRetentionError";
    this.code = code;
  }
}

type PlainRecord = Record<string, unknown>;

function exactRecord(value: unknown): PlainRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== INPUT_FIELDS.length || keys.some((key) =>
      typeof key !== "string" || !INPUT_FIELDS.includes(key as (typeof INPUT_FIELDS)[number]))) return null;

    const record: PlainRecord = {};
    for (const field of INPUT_FIELDS) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      record[field] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function malformed(): never {
  throw new DocumentRetentionError("malformed_input");
}

function canonicalInstant(value: unknown): Readonly<{ value: string; epochMs: number }> {
  if (typeof value !== "string" || !CANONICAL_INSTANT.test(value)) malformed();
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) malformed();
  return { value, epochMs };
}

function inputHash(input: Omit<DocumentRetentionInput, "priorInputSha256">): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function disposition(
  input: Omit<DocumentRetentionInput, "scopeTenantId" | "legalHoldActive" | "supportHoldActive" | "priorInputSha256">,
  inputSha256: `sha256:${string}`,
  result: "purge_eligible" | "retain",
  reason: DocumentRetentionDispositionReason,
): DocumentRetentionDisposition {
  return Object.freeze({
    contractVersion: 1,
    disposition: result,
    reason,
    tenantId: input.tenantId,
    documentId: input.documentId,
    versionId: input.versionId,
    objectKey: input.objectKey,
    state: input.state,
    isCurrentVersion: input.isCurrentVersion,
    policyVersion: input.policyVersion,
    evaluatedAt: input.evaluatedAt,
    retentionExpiresAt: input.retentionExpiresAt,
    idempotencyKey: input.idempotencyKey,
    inputSha256,
  });
}

export function evaluateDocumentRetentionDisposition(value: unknown): DocumentRetentionDisposition {
  const record = exactRecord(value);
  if (!record || record.contractVersion !== 1
    || typeof record.scopeTenantId !== "string" || !UUID.test(record.scopeTenantId)
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.versionId !== "string" || !UUID.test(record.versionId)
    || !LIFECYCLE_STATES.has(record.state)
    || typeof record.isCurrentVersion !== "boolean"
    || typeof record.policyVersion !== "string" || !POLICY_VERSION.test(record.policyVersion)
    || typeof record.legalHoldActive !== "boolean"
    || typeof record.supportHoldActive !== "boolean"
    || typeof record.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(record.idempotencyKey)
    || (record.priorInputSha256 !== null
      && (typeof record.priorInputSha256 !== "string" || !SHA256.test(record.priorInputSha256)))) {
    malformed();
  }
  if (record.scopeTenantId !== record.tenantId) {
    throw new DocumentRetentionError("tenant_scope_mismatch");
  }

  let expectedObjectKey: string;
  try {
    expectedObjectKey = buildDocumentObjectKey({
      tenantId: record.tenantId,
      documentId: record.documentId,
      versionId: record.versionId,
      object: { kind: "original" },
    });
  } catch {
    throw new DocumentRetentionError("unsafe_object_key");
  }
  if (typeof record.objectKey !== "string" || record.objectKey !== expectedObjectKey) {
    throw new DocumentRetentionError("unsafe_object_key");
  }

  const evaluatedAt = canonicalInstant(record.evaluatedAt);
  const retentionExpiresAt = canonicalInstant(record.retentionExpiresAt);
  const canonicalInput: Omit<DocumentRetentionInput, "priorInputSha256"> = {
    contractVersion: 1,
    scopeTenantId: record.scopeTenantId,
    tenantId: record.tenantId,
    documentId: record.documentId,
    versionId: record.versionId,
    objectKey: expectedObjectKey,
    state: record.state as DocumentLifecycleState,
    isCurrentVersion: record.isCurrentVersion,
    policyVersion: record.policyVersion,
    evaluatedAt: evaluatedAt.value,
    retentionExpiresAt: retentionExpiresAt.value,
    legalHoldActive: record.legalHoldActive,
    supportHoldActive: record.supportHoldActive,
    idempotencyKey: record.idempotencyKey,
  };
  const hash = inputHash(canonicalInput);
  const decisionInput = canonicalInput;

  if (record.priorInputSha256 !== null && record.priorInputSha256 !== hash) {
    return disposition(decisionInput, hash, "retain", "replay_conflict");
  }
  if (canonicalInput.legalHoldActive) {
    return disposition(decisionInput, hash, "retain", "legal_hold_active");
  }
  if (canonicalInput.supportHoldActive) {
    return disposition(decisionInput, hash, "retain", "support_hold_active");
  }
  if (canonicalInput.state === "retained_for_incident") {
    return disposition(decisionInput, hash, "retain", "incident_hold_active");
  }
  if (canonicalInput.isCurrentVersion) {
    return disposition(decisionInput, hash, "retain", "current_version");
  }
  if (IN_FLIGHT_STATES.has(canonicalInput.state)) {
    return disposition(decisionInput, hash, "retain", "workflow_in_flight");
  }
  if (canonicalInput.state === "clean") {
    return disposition(decisionInput, hash, "retain", "clean_version");
  }
  if (DELETION_STATES.has(canonicalInput.state)) {
    return disposition(decisionInput, hash, "retain", "deletion_in_progress");
  }
  if (canonicalInput.state === "deleted") {
    return disposition(decisionInput, hash, "retain", "already_deleted");
  }
  if (evaluatedAt.epochMs < retentionExpiresAt.epochMs) {
    return disposition(decisionInput, hash, "retain", "retention_active");
  }
  return disposition(decisionInput, hash, "purge_eligible", "retention_elapsed");
}
