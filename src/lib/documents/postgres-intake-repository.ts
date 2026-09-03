import { isProxy } from "node:util/types";

import type { DbClient } from "@/lib/db";

import { DocumentIntakeError } from "./errors";
import type {
  DocumentIntakeRepository,
  DocumentReservationPersistenceResult,
  DocumentUploadReservationRecord,
} from "./intake-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const FORMATS = new Set(["pdf", "docx", "xlsx", "csv", "txt", "markdown", "jpeg", "png"]);
const RESULT_FIELDS = [
  "kind", "tenant_id", "workspace_id", "document_id", "version_id", "idempotency_key",
  "source_identity", "request_fingerprint", "file_name", "format", "media_type",
  "declared_byte_size", "max_bytes", "scanner_policy_version", "object_key", "state",
] as const;

function persistenceError(): DocumentIntakeError {
  return new DocumentIntakeError(
    "persistence_boundary_error",
    "The document intake state could not be persisted safely.",
  );
}

function exactRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || isProxy(value) || Array.isArray(value)) throw persistenceError();
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw persistenceError();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== RESULT_FIELDS.length || keys.some((key) =>
      typeof key !== "string" || !RESULT_FIELDS.includes(key as (typeof RESULT_FIELDS)[number]))) {
      throw persistenceError();
    }
    const row: Record<string, unknown> = {};
    for (const field of RESULT_FIELDS) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw persistenceError();
      row[field] = descriptor.value;
    }
    return row;
  } catch (error) {
    if (error instanceof DocumentIntakeError) throw error;
    throw persistenceError();
  }
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw persistenceError();
  return value;
}

function text(value: unknown, pattern: RegExp, maxLength?: number): string {
  if (typeof value !== "string" || !pattern.test(value) || (maxLength !== undefined && value.length > maxLength)) {
    throw persistenceError();
  }
  return value;
}

function positiveInteger(value: unknown): number {
  const normalized = typeof value === "string" && /^[1-9][0-9]*$/u.test(value) ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isSafeInteger(normalized) || normalized <= 0) {
    throw persistenceError();
  }
  return normalized;
}

function parseReservation(
  row: Record<string, unknown>,
  expected: DocumentUploadReservationRecord,
): DocumentReservationPersistenceResult {
  if (row.kind === "conflict") {
    if (RESULT_FIELDS.slice(1).some((field) => row[field] !== null)) throw persistenceError();
    return Object.freeze({ kind: "conflict" });
  }
  if (row.kind !== "created" && row.kind !== "replay") throw persistenceError();
  const format = row.format;
  if (typeof format !== "string" || !FORMATS.has(format)) throw persistenceError();
  const state = row.state;
  if (state !== "upload_reserved") throw persistenceError();
  const record: DocumentUploadReservationRecord = {
    tenantId: uuid(row.tenant_id),
    workspaceId: uuid(row.workspace_id),
    documentId: uuid(row.document_id),
    versionId: uuid(row.version_id),
    idempotencyKey: text(row.idempotency_key, IDEMPOTENCY_KEY),
    sourceIdentity: text(row.source_identity, /^tenant_upload:[0-9a-f-]{36}$/u, 64),
    requestFingerprint: text(row.request_fingerprint, SHA256),
    fileName: text(row.file_name, /^[^\u0000-\u001f\u007f]+$/u, 1024),
    format: format as DocumentUploadReservationRecord["format"],
    mediaType: text(row.media_type, /^.{3,255}$/u, 255),
    declaredByteSize: positiveInteger(row.declared_byte_size),
    maxBytes: positiveInteger(row.max_bytes),
    scannerPolicyVersion: text(row.scanner_policy_version, POLICY_VERSION),
    objectKey: text(row.object_key, /^tenants\/[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}\/original$/u, 256),
    state,
  };
  const expectedSource = `tenant_upload:${record.documentId}`;
  const expectedObject = `tenants/${record.tenantId}/documents/${record.documentId}/versions/${record.versionId}/original`;
  if (
    record.sourceIdentity !== expectedSource || record.objectKey !== expectedObject ||
    record.tenantId !== expected.tenantId || record.workspaceId !== expected.workspaceId ||
    record.documentId !== expected.documentId || record.versionId !== expected.versionId ||
    record.idempotencyKey !== expected.idempotencyKey || record.sourceIdentity !== expected.sourceIdentity ||
    record.requestFingerprint !== expected.requestFingerprint || record.fileName !== expected.fileName ||
    record.format !== expected.format || record.mediaType !== expected.mediaType ||
    record.declaredByteSize !== expected.declaredByteSize || record.maxBytes !== expected.maxBytes ||
    record.scannerPolicyVersion !== expected.scannerPolicyVersion || record.objectKey !== expected.objectKey ||
    record.state !== expected.state
  ) throw persistenceError();
  return Object.freeze({ kind: row.kind, record: Object.freeze(record) });
}

export function createPostgresDocumentIntakeRepository(
  db: DbClient,
): Pick<DocumentIntakeRepository, "reserveUpload"> {
  return Object.freeze({
    async reserveUpload(record: DocumentUploadReservationRecord): Promise<DocumentReservationPersistenceResult> {
      let rows: unknown;
      try {
        rows = await db.prepare(`SELECT kind,tenant_id,workspace_id,document_id,version_id,idempotency_key,
          source_identity,request_fingerprint,file_name,format,media_type,declared_byte_size,max_bytes,
          scanner_policy_version,object_key,state
          FROM public.novatrade_reserve_document_upload(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).all(
          record.tenantId,
          record.workspaceId,
          record.documentId,
          record.versionId,
          record.idempotencyKey,
          record.requestFingerprint,
          record.fileName,
          record.format,
          record.mediaType,
          String(record.declaredByteSize),
          String(record.maxBytes),
          record.scannerPolicyVersion,
          record.sourceIdentity,
          record.objectKey,
        );
      } catch {
        throw persistenceError();
      }
      if (!Array.isArray(rows) || isProxy(rows) || rows.length !== 1) throw persistenceError();
      return parseReservation(exactRow(rows[0]), record);
    },
  });
}
