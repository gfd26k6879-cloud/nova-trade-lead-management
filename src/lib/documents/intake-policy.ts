import { isProxy, isSharedArrayBuffer } from "node:util/types";

import { DocumentIntakeError } from "./errors";
import { validateDocumentFile, type LaunchDocumentFormat } from "./validation";

const SHA256 = /^[a-f0-9]{64}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_SCANNER_ATTEMPTS = 10;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

type PlainRecord = Record<string, unknown>;

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): PlainRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return null;
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
      if (!descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function frozen<T extends object>(result: T): Readonly<T> {
  return Object.freeze(result);
}

export type DocumentFilePolicyFailureReason =
  | "active_content"
  | "empty_file"
  | "encrypted_document"
  | "malformed_input"
  | "malformed_signature"
  | "scanner_policy_invalid"
  | "size_limit_exceeded"
  | "size_mismatch"
  | "stored_media_mismatch"
  | "stored_size_mismatch"
  | "type_mismatch"
  | "unsupported_type";

export type DocumentFilePolicyDecision = Readonly<
  | {
      decision: "eligible_for_scan";
      state: "quarantined";
      format: LaunchDocumentFormat;
      mediaType: string;
      byteSize: number;
      maxBytes: number;
      checksum: string;
      checksumAlgorithm: "sha256";
      scannerPolicyVersion: string;
      scanRequired: true;
      releaseAllowed: false;
    }
  | {
      decision: "rejected";
      state: "rejected";
      reason: DocumentFilePolicyFailureReason;
      retryable: false;
      disposition: "discard_untrusted_object";
      scanRequired: false;
      releaseAllowed: false;
    }
>;

const FILE_INPUT_FIELDS = [
  "fileName", "declaredMediaType", "declaredByteSize", "storedMediaType", "storedByteSize",
  "bytes", "scannerPolicyVersion",
] as const;

const VALIDATION_FAILURES = new Set<DocumentFilePolicyFailureReason>([
  "active_content",
  "empty_file",
  "encrypted_document",
  "malformed_signature",
  "size_limit_exceeded",
  "size_mismatch",
  "type_mismatch",
  "unsupported_type",
]);

function rejectFile(reason: DocumentFilePolicyFailureReason): DocumentFilePolicyDecision {
  return frozen({
    decision: "rejected",
    state: "rejected",
    reason,
    retryable: false,
    disposition: "discard_untrusted_object",
    scanRequired: false,
    releaseAllowed: false,
  } as const);
}

export function evaluateDocumentFilePolicy(value: unknown): DocumentFilePolicyDecision {
  const input = exactRecord(value, FILE_INPUT_FIELDS);
  if (!input || !(input.bytes instanceof Uint8Array) || isProxy(input.bytes)
    || Object.getPrototypeOf(input.bytes) !== Uint8Array.prototype
    || isSharedArrayBuffer(input.bytes.buffer)) {
    return rejectFile("malformed_input");
  }
  if (typeof input.scannerPolicyVersion !== "string"
    || !POLICY_VERSION.test(input.scannerPolicyVersion)) {
    return rejectFile("scanner_policy_invalid");
  }

  let validated: ReturnType<typeof validateDocumentFile>;
  try {
    validated = validateDocumentFile({
      fileName: input.fileName as string,
      declaredMediaType: input.declaredMediaType as string,
      declaredByteSize: input.declaredByteSize as number,
      bytes: new Uint8Array(input.bytes),
    });
  } catch (error) {
    if (error instanceof DocumentIntakeError
      && VALIDATION_FAILURES.has(error.code as DocumentFilePolicyFailureReason)) {
      return rejectFile(error.code as DocumentFilePolicyFailureReason);
    }
    return rejectFile("malformed_input");
  }

  if (input.storedMediaType !== validated.mediaType) return rejectFile("stored_media_mismatch");
  if (!Number.isSafeInteger(input.storedByteSize)
    || input.storedByteSize !== validated.byteSize
    || input.storedByteSize !== input.bytes.byteLength) {
    return rejectFile("stored_size_mismatch");
  }

  return frozen({
    decision: "eligible_for_scan",
    state: "quarantined",
    format: validated.format,
    mediaType: validated.mediaType,
    byteSize: validated.byteSize,
    maxBytes: validated.maxBytes,
    checksum: validated.checksum,
    checksumAlgorithm: validated.checksumAlgorithm,
    scannerPolicyVersion: input.scannerPolicyVersion,
    scanRequired: true,
    releaseAllowed: false,
  });
}

export type ScannerReleaseFailureReason =
  | "checksum_mismatch"
  | "infected"
  | "malformed_input"
  | "malformed_verdict"
  | "policy_mismatch"
  | "scanner_reported_error"
  | "timestamp_invalid";

export type ScannerReleaseDecision = Readonly<
  | {
      decision: "release_allowed";
      state: "clean";
      releaseAllowed: true;
      retryScheduled: false;
      checksum: string;
      scannerPolicyVersion: string;
    }
  | {
      decision: "release_denied";
      state: "infected" | "scanner_error";
      reason: ScannerReleaseFailureReason;
      releaseAllowed: false;
      retryScheduled: boolean;
    }
>;

const SCANNER_INPUT_FIELDS = [
  "checksum", "scannerPolicyVersion", "attempt", "maxAttempts", "evaluatedAt", "observation",
] as const;
const OBSERVATION_FIELDS = [
  "verdict", "scannerAdapterId", "scannerVersion", "scannedChecksum", "scannedAt", "policyVersion",
] as const;

function denyScanner(reason: ScannerReleaseFailureReason, retryScheduled = false): ScannerReleaseDecision {
  return frozen({
    decision: "release_denied",
    state: reason === "infected" ? "infected" : "scanner_error",
    reason,
    releaseAllowed: false,
    retryScheduled,
  });
}

function safeScannerLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function evaluateScannerReleasePolicy(value: unknown): ScannerReleaseDecision {
  const input = exactRecord(value, SCANNER_INPUT_FIELDS);
  if (!input || typeof input.checksum !== "string" || !SHA256.test(input.checksum)
    || typeof input.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(input.scannerPolicyVersion)
    || !Number.isSafeInteger(input.attempt) || !Number.isSafeInteger(input.maxAttempts)
    || (input.attempt as number) < 1 || (input.maxAttempts as number) < 1
    || (input.attempt as number) > (input.maxAttempts as number)
    || (input.maxAttempts as number) > MAX_SCANNER_ATTEMPTS || !exactTimestamp(input.evaluatedAt)) {
    return denyScanner("malformed_input");
  }

  const observation = exactRecord(input.observation, OBSERVATION_FIELDS, ["reasonCode", "retryable"]);
  if (!observation || (observation.verdict !== "clean" && observation.verdict !== "infected"
    && observation.verdict !== "error") || !safeScannerLabel(observation.scannerAdapterId)
    || !safeScannerLabel(observation.scannerVersion)
    || typeof observation.scannedChecksum !== "string" || !exactTimestamp(observation.scannedAt)
    || typeof observation.policyVersion !== "string"
    || (observation.reasonCode !== undefined && !safeScannerLabel(observation.reasonCode))
    || (observation.retryable !== undefined && typeof observation.retryable !== "boolean")) {
    return denyScanner("malformed_verdict");
  }
  if (observation.scannedChecksum !== input.checksum) return denyScanner("checksum_mismatch");
  if (observation.policyVersion !== input.scannerPolicyVersion) return denyScanner("policy_mismatch");
  if (Date.parse(observation.scannedAt) > Date.parse(input.evaluatedAt) + MAX_FUTURE_CLOCK_SKEW_MS) {
    return denyScanner("timestamp_invalid");
  }
  if (observation.verdict === "infected") {
    return observation.reasonCode === undefined || typeof observation.retryable !== "boolean"
      ? denyScanner("malformed_verdict")
      : denyScanner("infected");
  }
  if (observation.verdict === "error") {
    if (observation.reasonCode === undefined || typeof observation.retryable !== "boolean") {
      return denyScanner("malformed_verdict");
    }
    const retryScheduled = observation.retryable === true
      && (input.attempt as number) < (input.maxAttempts as number);
    return denyScanner("scanner_reported_error", retryScheduled);
  }
  if (observation.reasonCode !== undefined || observation.retryable !== undefined) {
    return denyScanner("malformed_verdict");
  }

  return frozen({
    decision: "release_allowed",
    state: "clean",
    releaseAllowed: true,
    retryScheduled: false,
    checksum: input.checksum,
    scannerPolicyVersion: input.scannerPolicyVersion,
  });
}
