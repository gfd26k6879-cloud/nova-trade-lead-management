import { isProxy } from "node:util/types";

import { DocumentIntakeError } from "./errors";
import { buildDocumentObjectKey } from "./object-keys";
import { transitionDocumentVersion, type DocumentVersionSnapshot } from "./state-machine";
import {
  validateDocumentReservation,
  type DocumentReservationInput,
} from "./validation";

export const MAX_SIGNED_UPLOAD_SECONDS = 5 * 60;

export type StorageUploadRequest = Readonly<{
  objectKey: string;
  expectedMediaType: string;
  maxBytes: number;
  expiresInSeconds: typeof MAX_SIGNED_UPLOAD_SECONDS;
}>;

export interface DocumentStorageAdapter {
  reserveUpload(request: StorageUploadRequest): Promise<unknown>;
}

export type UploadReservation = Readonly<{
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  visibility: "private";
}>;

export type ReserveDocumentUploadInput = DocumentReservationInput &
  Readonly<{
    tenantId: string;
    documentId: string;
    versionId: string;
  }>;

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

function storageBoundaryError(): DocumentIntakeError {
  return new DocumentIntakeError(
    "storage_boundary_error",
    "The storage adapter did not return a safe, exact upload capability.",
  );
}

export async function reserveDocumentUpload(
  input: ReserveDocumentUploadInput,
  adapter: DocumentStorageAdapter,
): Promise<UploadReservation> {
  const validated = validateDocumentReservation(input);
  const objectKey = buildDocumentObjectKey({
    tenantId: input.tenantId,
    documentId: input.documentId,
    versionId: input.versionId,
    object: { kind: "original" },
  });
  const issuedAt = Date.now();

  let response: unknown;
  try {
    response = await adapter.reserveUpload({
      objectKey,
      expectedMediaType: validated.mediaType,
      maxBytes: validated.byteSize,
      expiresInSeconds: MAX_SIGNED_UPLOAD_SECONDS,
    });
  } catch {
    throw storageBoundaryError();
  }

  const capability = dataRecord(response, ["objectKey", "uploadUrl", "expiresAt", "visibility"]);
  if (!capability) throw storageBoundaryError();
  const expiresAt = typeof capability.expiresAt === "string" ? Date.parse(capability.expiresAt) : Number.NaN;
  let url: URL;
  try {
    url = new URL(typeof capability.uploadUrl === "string" ? capability.uploadUrl : "");
  } catch {
    throw storageBoundaryError();
  }

  if (
    capability.objectKey !== objectKey ||
    capability.visibility !== "private" ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    expiresAt > issuedAt + MAX_SIGNED_UPLOAD_SECONDS * 1000
  ) {
    throw storageBoundaryError();
  }

  return {
    objectKey,
    uploadUrl: url.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
    visibility: "private",
  };
}

export type QuarantinedDocumentVersion = Readonly<{
  tenantId: string;
  documentId: string;
  versionId: string;
  checksum: string;
  state: "quarantined";
  objectKey: string;
}>;

export type ScannerRequest = Readonly<{
  quarantineObject: Readonly<{
    tenantId: string;
    documentId: string;
    versionId: string;
    objectKey: string;
  }>;
  checksum: string;
  policyVersion: string;
}>;

export interface MalwareScannerAdapter {
  scan(request: ScannerRequest): Promise<unknown>;
}

export type ScannerObservation = Readonly<{
  verdict: "clean" | "infected" | "error";
  scannerAdapterId: string;
  scannerVersion: string;
  scannedChecksum: string;
  scannedAt: string;
  policyVersion: string;
  reasonCode?: string;
  retryable?: boolean;
}>;

export type ScanExecutionResult = Readonly<{
  version: DocumentVersionSnapshot;
  scan: ScannerObservation;
}>;

function scannerError(
  version: QuarantinedDocumentVersion,
  policyVersion: string,
  reasonCode: string,
  retryable: boolean,
): ScannerObservation {
  return {
    verdict: "error",
    scannerAdapterId: "unavailable",
    scannerVersion: "unknown",
    scannedChecksum: version.checksum,
    scannedAt: new Date().toISOString(),
    policyVersion,
    reasonCode,
    retryable,
  };
}

function parseScannerObservation(value: unknown): ScannerObservation | null {
  const observation = dataRecord(value, [
    "verdict", "scannerAdapterId", "scannerVersion", "scannedChecksum", "scannedAt", "policyVersion",
  ], ["reasonCode", "retryable"]);
  if (!observation) return null;
  if (observation.verdict !== "clean" && observation.verdict !== "infected" && observation.verdict !== "error") return null;
  if (
    typeof observation.scannerAdapterId !== "string" ||
    !observation.scannerAdapterId ||
    typeof observation.scannerVersion !== "string" ||
    !observation.scannerVersion ||
    typeof observation.scannedChecksum !== "string" ||
    typeof observation.scannedAt !== "string" ||
    !Number.isFinite(Date.parse(observation.scannedAt)) ||
    typeof observation.policyVersion !== "string" ||
    !observation.policyVersion
  ) {
    return null;
  }
  if (observation.reasonCode !== undefined && typeof observation.reasonCode !== "string") return null;
  if (observation.retryable !== undefined && typeof observation.retryable !== "boolean") return null;

  return {
    verdict: observation.verdict,
    scannerAdapterId: observation.scannerAdapterId,
    scannerVersion: observation.scannerVersion,
    scannedChecksum: observation.scannedChecksum,
    scannedAt: new Date(observation.scannedAt).toISOString(),
    policyVersion: observation.policyVersion,
    ...(observation.reasonCode === undefined ? {} : { reasonCode: observation.reasonCode }),
    ...(observation.retryable === undefined ? {} : { retryable: observation.retryable }),
  };
}

export async function executeQuarantineScan(
  version: QuarantinedDocumentVersion,
  policyVersion: string,
  adapter: MalwareScannerAdapter,
): Promise<ScanExecutionResult> {
  const baseSnapshot: DocumentVersionSnapshot = {
    versionId: version.versionId,
    checksum: version.checksum,
    state: version.state,
  };
  const scanning = transitionDocumentVersion(baseSnapshot, {
    to: "scanning",
    expectedVersionId: version.versionId,
    expectedChecksum: version.checksum,
  });

  let expectedObjectKey: string;
  try {
    expectedObjectKey = buildDocumentObjectKey({
      tenantId: version.tenantId,
      documentId: version.documentId,
      versionId: version.versionId,
      object: { kind: "original" },
    });
  } catch {
    const scan = scannerError(version, policyVersion, "malformed_request", false);
    return {
      version: transitionDocumentVersion(scanning, {
        to: "scanner_error",
        expectedVersionId: version.versionId,
        expectedChecksum: version.checksum,
      }),
      scan,
    };
  }

  if (version.objectKey !== expectedObjectKey
    || !/^[a-f0-9]{64}$/iu.test(version.checksum)
    || typeof policyVersion !== "string"
    || !policyVersion.trim()) {
    const scan = scannerError(version, policyVersion, "malformed_request", false);
    return {
      version: transitionDocumentVersion(scanning, {
        to: "scanner_error",
        expectedVersionId: version.versionId,
        expectedChecksum: version.checksum,
      }),
      scan,
    };
  }

  let rawObservation: unknown;
  try {
    rawObservation = await adapter.scan({
      quarantineObject: {
        tenantId: version.tenantId,
        documentId: version.documentId,
        versionId: version.versionId,
        objectKey: expectedObjectKey,
      },
      checksum: version.checksum,
      policyVersion,
    });
  } catch {
    const scan = scannerError(version, policyVersion, "adapter_error", true);
    return {
      version: transitionDocumentVersion(scanning, {
        to: "scanner_error",
        expectedVersionId: version.versionId,
        expectedChecksum: version.checksum,
      }),
      scan,
    };
  }

  let scan = parseScannerObservation(rawObservation);
  if (!scan) scan = scannerError(version, policyVersion, "malformed_verdict", false);
  else if (scan.scannedChecksum !== version.checksum) {
    scan = scannerError(version, policyVersion, "checksum_mismatch", false);
  } else if (scan.policyVersion !== policyVersion) {
    scan = scannerError(version, policyVersion, "policy_mismatch", false);
  } else if (Date.parse(scan.scannedAt) > Date.now() + 5 * 60 * 1000) {
    scan = scannerError(version, policyVersion, "timestamp_invalid", false);
  }

  const nextState = scan.verdict === "clean" ? "clean" : scan.verdict === "infected" ? "infected" : "scanner_error";
  return {
    version: transitionDocumentVersion(scanning, {
      to: nextState,
      expectedVersionId: version.versionId,
      expectedChecksum: version.checksum,
    }),
    scan,
  };
}
