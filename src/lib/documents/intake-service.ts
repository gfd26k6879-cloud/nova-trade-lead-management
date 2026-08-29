import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  executeQuarantineScan,
  reserveDocumentUpload,
  type DocumentStorageAdapter,
  type MalwareScannerAdapter,
  type ScannerObservation,
  type UploadReservation,
} from "./adapters";
import { DocumentIntakeError } from "./errors";
import { buildDocumentObjectKey } from "./object-keys";
import {
  validateDocumentFile,
  validateDocumentReservation,
  type LaunchDocumentFormat,
} from "./validation";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const DISPATCH_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

type PlainRecord = Record<string, unknown>;

function snapshotRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): PlainRecord | null {
  if (!value || typeof value !== "object" || isProxy(value) || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    if (required.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const result: PlainRecord = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function boundaryError(message = "The document intake boundary returned an unsafe response."): DocumentIntakeError {
  return new DocumentIntakeError("intake_boundary_error", message);
}

function persistenceError(): DocumentIntakeError {
  return new DocumentIntakeError(
    "persistence_boundary_error",
    "The document intake state could not be persisted safely.",
  );
}

function canonicalUuid(value: unknown): string {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) throw boundaryError();
  return value.toLowerCase();
}

function boundedToken(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw boundaryError();
  return value;
}

function freezeResult<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) freezeResult(child as object);
  }
  return Object.freeze(value);
}

export type InitiateDocumentIntakeInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  idempotencyKey: string;
  fileName: string;
  declaredMediaType: string;
  declaredByteSize: number;
  scannerPolicyVersion: string;
}>;

export type DocumentUploadReservationRecord = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  idempotencyKey: string;
  sourceIdentity: string;
  requestFingerprint: string;
  fileName: string;
  format: LaunchDocumentFormat;
  mediaType: string;
  declaredByteSize: number;
  maxBytes: number;
  scannerPolicyVersion: string;
  objectKey: string;
  state: "upload_reserved";
}>;

export type DocumentReservationPersistenceResult = Readonly<
  | { kind: "created" | "replay"; record: DocumentUploadReservationRecord }
  | { kind: "conflict" }
>;

export interface DocumentIntakeRepository {
  /** Must atomically enforce uniqueness of (tenantId, idempotencyKey). */
  reserveUpload(record: DocumentUploadReservationRecord): Promise<unknown>;
  getUploadReservation(identity: DocumentIntakeCommandIdentity): Promise<unknown>;
  /** Must atomically quarantine the version, tenant-local dedupe, and stage one scan outbox message. */
  finalizeQuarantine(request: FinalizeQuarantinePersistenceRequest): Promise<unknown>;
  leaseScanJob(request: ProcessDocumentScanInput): Promise<unknown>;
  /** Must fence on leaseToken and atomically persist the verdict plus any bounded retry. */
  persistScanResult(request: PersistDocumentScanResultRequest): Promise<unknown>;
}

export type InitiateDocumentIntakeResult = Readonly<{
  kind: "created" | "replay";
  record: DocumentUploadReservationRecord;
  upload: UploadReservation;
}>;

function normalizeInitiationInput(value: unknown): InitiateDocumentIntakeInput {
  const input = snapshotRecord(value, [
    "tenantId", "workspaceId", "documentId", "versionId", "idempotencyKey", "fileName",
    "declaredMediaType", "declaredByteSize", "scannerPolicyVersion",
  ]);
  if (!input) throw boundaryError();
  return {
    tenantId: canonicalUuid(input.tenantId),
    workspaceId: canonicalUuid(input.workspaceId),
    documentId: canonicalUuid(input.documentId),
    versionId: canonicalUuid(input.versionId),
    idempotencyKey: boundedToken(input.idempotencyKey, IDEMPOTENCY_KEY),
    fileName: typeof input.fileName === "string" ? input.fileName : "",
    declaredMediaType: typeof input.declaredMediaType === "string" ? input.declaredMediaType : "",
    declaredByteSize: typeof input.declaredByteSize === "number" ? input.declaredByteSize : Number.NaN,
    scannerPolicyVersion: boundedToken(input.scannerPolicyVersion, POLICY_VERSION),
  };
}

function reservationRecord(input: InitiateDocumentIntakeInput): DocumentUploadReservationRecord {
  const validation = validateDocumentReservation(input);
  const objectKey = buildDocumentObjectKey({
    tenantId: input.tenantId,
    documentId: input.documentId,
    versionId: input.versionId,
    object: { kind: "original" },
  });
  const sourceIdentity = `tenant_upload:${input.documentId}`;
  const fingerprintSource = JSON.stringify([
    input.tenantId, input.workspaceId, input.documentId, input.versionId, input.fileName,
    validation.mediaType, validation.byteSize, input.scannerPolicyVersion,
  ]);
  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    versionId: input.versionId,
    idempotencyKey: input.idempotencyKey,
    sourceIdentity,
    requestFingerprint: createHash("sha256").update(fingerprintSource).digest("hex"),
    fileName: input.fileName,
    format: validation.format,
    mediaType: validation.mediaType,
    declaredByteSize: validation.byteSize,
    maxBytes: validation.maxBytes,
    scannerPolicyVersion: input.scannerPolicyVersion,
    objectKey,
    state: "upload_reserved",
  };
}

const RESERVATION_FIELDS = [
  "tenantId", "workspaceId", "documentId", "versionId", "idempotencyKey", "sourceIdentity",
  "requestFingerprint", "fileName", "format", "mediaType", "declaredByteSize", "maxBytes",
  "scannerPolicyVersion", "objectKey", "state",
] as const;

function exactReservation(value: unknown, expected: DocumentUploadReservationRecord): DocumentUploadReservationRecord {
  const record = snapshotRecord(value, RESERVATION_FIELDS);
  if (!record || RESERVATION_FIELDS.some((field) => record[field] !== expected[field])) {
    throw boundaryError();
  }
  return { ...expected };
}

export async function initiateDocumentIntake(
  rawInput: InitiateDocumentIntakeInput,
  dependencies: Readonly<{
    repository: Pick<DocumentIntakeRepository, "reserveUpload">;
    storage: DocumentStorageAdapter;
  }>,
): Promise<InitiateDocumentIntakeResult> {
  const input = normalizeInitiationInput(rawInput);
  const expected = reservationRecord(input);
  let rawPersistence: unknown;
  try {
    rawPersistence = await dependencies.repository.reserveUpload(freezeResult({ ...expected }));
  } catch {
    throw persistenceError();
  }
  const persistence = snapshotRecord(rawPersistence, ["kind"], ["record"]);
  if (!persistence) throw persistenceError();
  if (persistence.kind === "conflict") {
    throw new DocumentIntakeError(
      "idempotency_conflict",
      "The idempotency key was already used for a different document upload request.",
    );
  }
  if ((persistence.kind !== "created" && persistence.kind !== "replay") || !persistence.record) {
    throw persistenceError();
  }
  const record = exactReservation(persistence.record, expected);
  const upload = await reserveDocumentUpload(input, dependencies.storage);
  return freezeResult({ kind: persistence.kind, record, upload: { ...upload } });
}

// The upload-completion and scan-worker contracts are defined below the initiation
// slice so every public operation shares the same strict identity validation.
export type DocumentIntakeCommandIdentity = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  idempotencyKey: string;
}>;

export interface UploadedDocumentReader {
  readUploadedObject(request: Readonly<{
    tenantId: string;
    workspaceId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
    maxBytes: number;
  }>): Promise<unknown>;
}

export type ScanOutboxMessage = Readonly<{
  dispatchKey: string;
  jobId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  checksum: string;
  policyVersion: string;
}>;

export type QuarantinedDocumentRecord = Readonly<
  Omit<DocumentUploadReservationRecord, "state"> & {
    state: "quarantined";
    checksum: string;
  }
>;

export type DocumentProcessingReference = Readonly<{
  tenantId: string;
  workspaceId: string;
  sourceIdentity: string;
  documentId: string;
  versionId: string;
  checksum: string;
  policyVersion: string;
}>;

export type CompleteDocumentUploadResult = Readonly<{
  kind: "quarantined" | "replay" | "duplicate";
  record: QuarantinedDocumentRecord;
  processing: DocumentProcessingReference;
  scanDispatch: "accepted" | "pending" | "deduplicated";
}>;

export interface DocumentScanOutbox {
  /** Dispatch is idempotent by dispatchKey; the durable row is staged by finalizeQuarantine. */
  dispatch(message: ScanOutboxMessage): Promise<unknown>;
}

export type FinalizeQuarantinePersistenceRequest = Readonly<{
  reservation: DocumentUploadReservationRecord;
  checksum: string;
  checksumAlgorithm: "sha256";
  verifiedByteSize: number;
  verifiedMediaType: string;
  dedupeScope: Readonly<{
    tenantId: string;
    workspaceId: string;
    sourceIdentity: string;
    checksum: string;
    scannerPolicyVersion: string;
  }>;
}>;

export type PersistDocumentScanResultRequest = Readonly<{
  leaseToken: string;
  jobId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  checksum: string;
  policyVersion: string;
  state: "clean" | "infected" | "scanner_error";
  scan: ScannerObservation;
  retryRequested: boolean;
}>;

export type ProcessDocumentScanInput = Readonly<{
  jobId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  checksum: string;
  policyVersion: string;
}>;

export type ProcessDocumentScanResult = Readonly<{
  kind: "persisted" | "replay";
  jobId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  checksum: string;
  policyVersion: string;
  state: "clean" | "infected" | "scanner_error";
  scan: ScannerObservation;
  retryScheduled: boolean;
}>;

function normalizeCommandIdentity(value: unknown): DocumentIntakeCommandIdentity {
  const input = snapshotRecord(value, [
    "tenantId", "workspaceId", "documentId", "versionId", "idempotencyKey",
  ]);
  if (!input) throw boundaryError();
  return {
    tenantId: canonicalUuid(input.tenantId),
    workspaceId: canonicalUuid(input.workspaceId),
    documentId: canonicalUuid(input.documentId),
    versionId: canonicalUuid(input.versionId),
    idempotencyKey: boundedToken(input.idempotencyKey, IDEMPOTENCY_KEY),
  };
}

function persistedReservation(
  value: unknown,
  identity: DocumentIntakeCommandIdentity,
): DocumentUploadReservationRecord {
  const record = snapshotRecord(value, RESERVATION_FIELDS);
  if (!record) throw persistenceError();
  const input = normalizeInitiationInput({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    versionId: record.versionId,
    idempotencyKey: record.idempotencyKey,
    fileName: record.fileName,
    declaredMediaType: record.mediaType,
    declaredByteSize: record.declaredByteSize,
    scannerPolicyVersion: record.scannerPolicyVersion,
  });
  const expected = reservationRecord(input);
  if (
    identity.tenantId !== expected.tenantId || identity.workspaceId !== expected.workspaceId
    || identity.documentId !== expected.documentId
    || identity.versionId !== expected.versionId || identity.idempotencyKey !== expected.idempotencyKey
    || record.sourceIdentity !== expected.sourceIdentity || record.objectKey !== expected.objectKey
    || record.format !== expected.format || record.maxBytes !== expected.maxBytes
    || record.state !== "upload_reserved"
    || record.requestFingerprint !== expected.requestFingerprint
  ) throw persistenceError();
  return expected;
}

function uploadedObject(
  value: unknown,
  reservation: DocumentUploadReservationRecord,
): Uint8Array {
  const object = snapshotRecord(value, ["objectKey", "bytes", "mediaType", "byteSize"]);
  if (!object || object.objectKey !== reservation.objectKey || object.mediaType !== reservation.mediaType
    || object.byteSize !== reservation.declaredByteSize || !(object.bytes instanceof Uint8Array)
    || isProxy(object.bytes)) {
    throw boundaryError("The uploaded object did not match its exact reservation.");
  }
  return new Uint8Array(object.bytes);
}

const QUARANTINED_FIELDS = [
  ...RESERVATION_FIELDS.filter((field) => field !== "state"), "state", "checksum",
] as const;

function quarantinedRecord(
  value: unknown,
  reservation: DocumentUploadReservationRecord,
  checksum: string,
): QuarantinedDocumentRecord {
  const record = snapshotRecord(value, QUARANTINED_FIELDS);
  if (!record || record.state !== "quarantined" || record.checksum !== checksum
    || RESERVATION_FIELDS.filter((field) => field !== "state")
      .some((field) => record[field] !== reservation[field])) throw persistenceError();
  return { ...reservation, state: "quarantined", checksum };
}

const PROCESSING_FIELDS = [
  "tenantId", "workspaceId", "sourceIdentity", "documentId", "versionId", "checksum", "policyVersion",
] as const;

function processingReference(
  value: unknown,
  reservation: DocumentUploadReservationRecord,
  checksum: string,
  duplicate: boolean,
): DocumentProcessingReference {
  const processing = snapshotRecord(value, PROCESSING_FIELDS);
  if (!processing || processing.tenantId !== reservation.tenantId
    || processing.workspaceId !== reservation.workspaceId
    || processing.sourceIdentity !== reservation.sourceIdentity || processing.checksum !== checksum
    || processing.policyVersion !== reservation.scannerPolicyVersion) throw persistenceError();
  const documentId = canonicalUuid(processing.documentId);
  const versionId = canonicalUuid(processing.versionId);
  if (documentId !== reservation.documentId || (!duplicate && versionId !== reservation.versionId)) {
    throw persistenceError();
  }
  return {
    tenantId: reservation.tenantId,
    workspaceId: reservation.workspaceId,
    sourceIdentity: reservation.sourceIdentity,
    documentId,
    versionId,
    checksum,
    policyVersion: reservation.scannerPolicyVersion,
  };
}

const OUTBOX_FIELDS = [
  "dispatchKey", "jobId", "tenantId", "workspaceId", "documentId", "versionId", "objectKey", "checksum",
  "policyVersion",
] as const;

function scanOutboxMessage(
  value: unknown,
  reservation: DocumentUploadReservationRecord,
  checksum: string,
): ScanOutboxMessage {
  const message = snapshotRecord(value, OUTBOX_FIELDS);
  if (!message || typeof message.dispatchKey !== "string" || !DISPATCH_KEY.test(message.dispatchKey)
    || canonicalUuid(message.jobId) !== message.jobId || message.tenantId !== reservation.tenantId
    || message.workspaceId !== reservation.workspaceId
    || message.documentId !== reservation.documentId || message.versionId !== reservation.versionId
    || message.objectKey !== reservation.objectKey || message.checksum !== checksum
    || message.policyVersion !== reservation.scannerPolicyVersion) throw persistenceError();
  return {
    dispatchKey: message.dispatchKey,
    jobId: message.jobId,
    tenantId: reservation.tenantId,
    workspaceId: reservation.workspaceId,
    documentId: reservation.documentId,
    versionId: reservation.versionId,
    objectKey: reservation.objectKey,
    checksum,
    policyVersion: reservation.scannerPolicyVersion,
  };
}

export async function completeDocumentUpload(
  rawInput: DocumentIntakeCommandIdentity,
  dependencies: Readonly<{
    repository: Pick<DocumentIntakeRepository, "getUploadReservation" | "finalizeQuarantine">;
    reader: UploadedDocumentReader;
    outbox: DocumentScanOutbox;
  }>,
): Promise<CompleteDocumentUploadResult> {
  const identity = normalizeCommandIdentity(rawInput);
  let rawReservation: unknown;
  try {
    rawReservation = await dependencies.repository.getUploadReservation(freezeResult({ ...identity }));
  } catch {
    throw persistenceError();
  }
  const reservation = persistedReservation(rawReservation, identity);
  let rawObject: unknown;
  try {
    rawObject = await dependencies.reader.readUploadedObject(freezeResult({
      tenantId: reservation.tenantId,
      workspaceId: reservation.workspaceId,
      documentId: reservation.documentId,
      versionId: reservation.versionId,
      objectKey: reservation.objectKey,
      maxBytes: reservation.declaredByteSize,
    }));
  } catch {
    throw boundaryError("The uploaded object could not be verified safely.");
  }
  const bytes = uploadedObject(rawObject, reservation);
  const verified = validateDocumentFile({
    fileName: reservation.fileName,
    declaredMediaType: reservation.mediaType,
    declaredByteSize: reservation.declaredByteSize,
    bytes,
  });
  const finalizeRequest: FinalizeQuarantinePersistenceRequest = {
    reservation,
    checksum: verified.checksum,
    checksumAlgorithm: verified.checksumAlgorithm,
    verifiedByteSize: verified.byteSize,
    verifiedMediaType: verified.mediaType,
    dedupeScope: {
      tenantId: reservation.tenantId,
      workspaceId: reservation.workspaceId,
      sourceIdentity: reservation.sourceIdentity,
      checksum: verified.checksum,
      scannerPolicyVersion: reservation.scannerPolicyVersion,
    },
  };
  let rawFinalization: unknown;
  try {
    rawFinalization = await dependencies.repository.finalizeQuarantine(freezeResult(finalizeRequest));
  } catch {
    throw persistenceError();
  }
  const finalization = snapshotRecord(rawFinalization, ["kind", "record", "processing", "outbox"]);
  if (!finalization || (finalization.kind !== "quarantined" && finalization.kind !== "replay"
    && finalization.kind !== "duplicate")) throw persistenceError();
  const isDuplicate = finalization.kind === "duplicate";
  const record = quarantinedRecord(finalization.record, reservation, verified.checksum);
  const processing = processingReference(finalization.processing, reservation, verified.checksum, isDuplicate);
  if (isDuplicate) {
    if (finalization.outbox !== null) throw persistenceError();
    return freezeResult({ kind: finalization.kind, record, processing, scanDispatch: "deduplicated" });
  }
  const outbox = scanOutboxMessage(finalization.outbox, reservation, verified.checksum);
  let scanDispatch: "accepted" | "pending" = "pending";
  try {
    const rawDispatch = await dependencies.outbox.dispatch(freezeResult({ ...outbox }));
    const dispatch = snapshotRecord(rawDispatch, ["dispatchKey", "status"]);
    if (dispatch && dispatch.dispatchKey === outbox.dispatchKey
      && (dispatch.status === "accepted" || dispatch.status === "duplicate")) scanDispatch = "accepted";
  } catch {
    // The transactionally staged outbox row remains pending for a safe retry.
  }
  return freezeResult({ kind: finalization.kind, record, processing, scanDispatch });
}

const SCAN_INPUT_FIELDS = [
  "jobId", "tenantId", "workspaceId", "documentId", "versionId", "checksum", "policyVersion",
] as const;

function normalizeScanInput(value: unknown): ProcessDocumentScanInput {
  const input = snapshotRecord(value, SCAN_INPUT_FIELDS);
  if (!input) throw boundaryError();
  return {
    jobId: canonicalUuid(input.jobId),
    tenantId: canonicalUuid(input.tenantId),
    workspaceId: canonicalUuid(input.workspaceId),
    documentId: canonicalUuid(input.documentId),
    versionId: canonicalUuid(input.versionId),
    checksum: typeof input.checksum === "string" && SHA256.test(input.checksum)
      ? input.checksum
      : (() => { throw boundaryError(); })(),
    policyVersion: boundedToken(input.policyVersion, POLICY_VERSION),
  };
}

type ScanLease = Readonly<{
  leaseToken: string;
  jobId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  checksum: string;
  policyVersion: string;
  attempt: number;
  maxAttempts: number;
  state: "quarantined";
}>;

const SCAN_LEASE_FIELDS = [
  "leaseToken", "jobId", "tenantId", "workspaceId", "documentId", "versionId", "objectKey", "checksum",
  "policyVersion", "attempt", "maxAttempts", "state",
] as const;

function scanLease(value: unknown, input: ProcessDocumentScanInput): ScanLease {
  try {
    const lease = snapshotRecord(value, SCAN_LEASE_FIELDS);
    const expectedObjectKey = buildDocumentObjectKey({
      tenantId: input.tenantId,
      documentId: input.documentId,
      versionId: input.versionId,
      object: { kind: "original" },
    });
    if (!lease || boundedToken(lease.leaseToken, IDEMPOTENCY_KEY) !== lease.leaseToken
      || lease.jobId !== input.jobId || lease.tenantId !== input.tenantId
      || lease.workspaceId !== input.workspaceId
      || lease.documentId !== input.documentId || lease.versionId !== input.versionId
      || lease.objectKey !== expectedObjectKey || lease.checksum !== input.checksum
      || lease.policyVersion !== input.policyVersion || lease.state !== "quarantined"
      || !Number.isSafeInteger(lease.attempt) || !Number.isSafeInteger(lease.maxAttempts)
      || (lease.attempt as number) < 1 || (lease.maxAttempts as number) < 1
      || (lease.attempt as number) > (lease.maxAttempts as number) || (lease.maxAttempts as number) > 10) {
      throw persistenceError();
    }
    return {
      leaseToken: lease.leaseToken as string,
      jobId: input.jobId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      versionId: input.versionId,
      objectKey: expectedObjectKey,
      checksum: input.checksum,
      policyVersion: input.policyVersion,
      attempt: lease.attempt as number,
      maxAttempts: lease.maxAttempts as number,
      state: "quarantined",
    };
  } catch (error) {
    if (error instanceof DocumentIntakeError && error.code === "persistence_boundary_error") throw error;
    throw persistenceError();
  }
}

const SCAN_OBSERVATION_FIELDS = [
  "verdict", "scannerAdapterId", "scannerVersion", "scannedChecksum", "scannedAt",
  "policyVersion",
] as const;

function persistedScannerObservation(
  value: unknown,
  input: ProcessDocumentScanInput,
): ScannerObservation {
  const observation = snapshotRecord(value, SCAN_OBSERVATION_FIELDS, ["reasonCode", "retryable"]);
  if (!observation || (observation.verdict !== "clean" && observation.verdict !== "infected"
    && observation.verdict !== "error") || typeof observation.scannerAdapterId !== "string"
    || !observation.scannerAdapterId || typeof observation.scannerVersion !== "string"
    || !observation.scannerVersion || observation.scannedChecksum !== input.checksum
    || observation.policyVersion !== input.policyVersion || typeof observation.scannedAt !== "string"
    || !Number.isFinite(Date.parse(observation.scannedAt))
    || Date.parse(observation.scannedAt) > Date.now() + 5 * 60 * 1000
    || (observation.reasonCode !== undefined && typeof observation.reasonCode !== "string")
    || (observation.retryable !== undefined && typeof observation.retryable !== "boolean")) {
    throw persistenceError();
  }
  return {
    verdict: observation.verdict,
    scannerAdapterId: observation.scannerAdapterId,
    scannerVersion: observation.scannerVersion,
    scannedChecksum: input.checksum,
    scannedAt: new Date(observation.scannedAt).toISOString(),
    policyVersion: input.policyVersion,
    ...(observation.reasonCode === undefined ? {} : { reasonCode: observation.reasonCode as string }),
    ...(observation.retryable === undefined ? {} : { retryable: observation.retryable as boolean }),
  };
}

const SCAN_RESULT_FIELDS = [
  "jobId", "tenantId", "workspaceId", "documentId", "versionId", "checksum", "policyVersion", "state", "scan",
  "retryScheduled",
] as const;

function persistedScanReplay(
  value: unknown,
  input: ProcessDocumentScanInput,
): ProcessDocumentScanResult {
  const result = snapshotRecord(value, SCAN_RESULT_FIELDS);
  if (!result || SCAN_INPUT_FIELDS.some((field) => result[field] !== input[field])
    || (result.state !== "clean" && result.state !== "infected" && result.state !== "scanner_error")
    || typeof result.retryScheduled !== "boolean") throw persistenceError();
  const scan = persistedScannerObservation(result.scan, input);
  const expectedState = scan.verdict === "clean" ? "clean"
    : scan.verdict === "infected" ? "infected" : "scanner_error";
  if (result.state !== expectedState
    || (result.retryScheduled && (expectedState !== "scanner_error" || scan.retryable !== true))) {
    throw persistenceError();
  }
  return freezeResult({
    kind: "replay",
    ...input,
    state: expectedState,
    scan,
    retryScheduled: result.retryScheduled,
  });
}

export async function processDocumentScan(
  rawInput: ProcessDocumentScanInput,
  dependencies: Readonly<{
    repository: Pick<DocumentIntakeRepository, "leaseScanJob" | "persistScanResult">;
    scanner: MalwareScannerAdapter;
  }>,
): Promise<ProcessDocumentScanResult> {
  const input = normalizeScanInput(rawInput);
  let rawLeaseResult: unknown;
  try {
    rawLeaseResult = await dependencies.repository.leaseScanJob(freezeResult({ ...input }));
  } catch {
    throw persistenceError();
  }
  const leaseResult = snapshotRecord(rawLeaseResult, ["kind"], ["lease", "result"]);
  if (!leaseResult) throw persistenceError();
  if (leaseResult.kind === "already_persisted" && leaseResult.result) {
    return persistedScanReplay(leaseResult.result, input);
  }
  if (leaseResult.kind !== "leased" || !leaseResult.lease) throw persistenceError();
  const lease = scanLease(leaseResult.lease, input);
  const execution = await executeQuarantineScan({
    tenantId: lease.tenantId,
    documentId: lease.documentId,
    versionId: lease.versionId,
    checksum: lease.checksum,
    state: lease.state,
    objectKey: lease.objectKey,
  }, lease.policyVersion, dependencies.scanner);
  if (execution.version.state !== "clean" && execution.version.state !== "infected"
    && execution.version.state !== "scanner_error") throw boundaryError();
  const retryRequested = execution.version.state === "scanner_error"
    && execution.scan.retryable === true && lease.attempt < lease.maxAttempts;
  const persistRequest: PersistDocumentScanResultRequest = {
    leaseToken: lease.leaseToken,
    jobId: lease.jobId,
    tenantId: lease.tenantId,
    workspaceId: lease.workspaceId,
    documentId: lease.documentId,
    versionId: lease.versionId,
    checksum: lease.checksum,
    policyVersion: lease.policyVersion,
    state: execution.version.state,
    scan: { ...execution.scan },
    retryRequested,
  };
  let rawPersisted: unknown;
  try {
    rawPersisted = await dependencies.repository.persistScanResult(freezeResult(persistRequest));
  } catch {
    throw persistenceError();
  }
  const persisted = snapshotRecord(rawPersisted, [
    "kind", ...SCAN_INPUT_FIELDS, "state", "retryScheduled",
  ]);
  if (!persisted || persisted.kind !== "persisted"
    || SCAN_INPUT_FIELDS.some((field) => persisted[field] !== input[field])
    || persisted.state !== execution.version.state || persisted.retryScheduled !== retryRequested) {
    throw persistenceError();
  }
  return freezeResult({
    kind: "persisted",
    jobId: lease.jobId,
    tenantId: lease.tenantId,
    workspaceId: lease.workspaceId,
    documentId: lease.documentId,
    versionId: lease.versionId,
    checksum: lease.checksum,
    policyVersion: lease.policyVersion,
    state: execution.version.state,
    scan: { ...execution.scan },
    retryScheduled: retryRequested,
  });
}
