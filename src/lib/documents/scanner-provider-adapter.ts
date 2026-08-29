import "server-only";

import { isProxy } from "node:util/types";

import type {
  MalwareScannerAdapter,
  ScannerObservation,
  ScannerRequest,
} from "./adapters";
import { buildDocumentObjectKey } from "./object-keys";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_CHECKSUM = /^[0-9a-f]{64}$/u;
const APPROVED_IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const INFECTED_REASON_CODES = new Set(["malware_detected", "policy_violation"]);
const ERROR_REASON_CODES = new Set([
  "authentication_failed",
  "provider_policy_error",
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "region_mismatch",
  "unsupported_content",
]);

export type ScannerProviderQuarantineObject = Readonly<{
  tenantId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
}>;

export type ScannerProviderScanRequest = Readonly<{
  quarantineObject: ScannerProviderQuarantineObject;
  checksum: string;
  policyVersion: string;
  scannerAdapterId: string;
  scannerVersion: string;
}>;

export interface ScannerProviderCapability {
  scanQuarantinedObject(request: ScannerProviderScanRequest): Promise<unknown>;
}

export type ScannerProviderAdapterOptions = Readonly<{
  enabled: boolean;
  approvedScannerId: string;
  approvedScannerVersion: string;
  approvedPolicyVersion: string;
}>;

type ScannerProviderConfiguration = Readonly<{
  enabled: boolean;
  scannerAdapterId: string;
  scannerVersion: string;
  policyVersion: string;
}>;

function scannerBoundaryError(): Error {
  const error = new Error("The scanner provider did not return a safe, exact verdict.");
  error.name = "ScannerProviderBoundaryError";
  return error;
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
function parseConfiguration(options: ScannerProviderAdapterOptions): ScannerProviderConfiguration {
  const config = dataRecord(options, [
    "enabled",
    "approvedScannerId",
    "approvedScannerVersion",
    "approvedPolicyVersion",
  ]);
  if (
    !config ||
    typeof config.enabled !== "boolean" ||
    typeof config.approvedScannerId !== "string" ||
    !APPROVED_IDENTIFIER.test(config.approvedScannerId) ||
    typeof config.approvedScannerVersion !== "string" ||
    !APPROVED_IDENTIFIER.test(config.approvedScannerVersion) ||
    typeof config.approvedPolicyVersion !== "string" ||
    !APPROVED_IDENTIFIER.test(config.approvedPolicyVersion)
  ) {
    throw scannerBoundaryError();
  }

  return Object.freeze({
    enabled: config.enabled,
    scannerAdapterId: config.approvedScannerId,
    scannerVersion: config.approvedScannerVersion,
    policyVersion: config.approvedPolicyVersion,
  });
}

function parseQuarantineObject(value: unknown): ScannerProviderQuarantineObject {
  const object = dataRecord(value, ["tenantId", "documentId", "versionId", "objectKey"]);
  if (
    !object ||
    typeof object.tenantId !== "string" ||
    !CANONICAL_UUID.test(object.tenantId) ||
    typeof object.documentId !== "string" ||
    !CANONICAL_UUID.test(object.documentId) ||
    typeof object.versionId !== "string" ||
    !CANONICAL_UUID.test(object.versionId) ||
    typeof object.objectKey !== "string"
  ) {
    throw scannerBoundaryError();
  }

  let expectedObjectKey: string;
  try {
    expectedObjectKey = buildDocumentObjectKey({
      tenantId: object.tenantId,
      documentId: object.documentId,
      versionId: object.versionId,
      object: { kind: "original" },
    });
  } catch {
    throw scannerBoundaryError();
  }
  if (object.objectKey !== expectedObjectKey) throw scannerBoundaryError();

  return Object.freeze({
    tenantId: object.tenantId,
    documentId: object.documentId,
    versionId: object.versionId,
    objectKey: expectedObjectKey,
  });
}

function parseScannerRequest(request: ScannerRequest): ScannerProviderScanRequest {
  const candidate = dataRecord(request, ["quarantineObject", "checksum", "policyVersion"]);
  if (
    !candidate ||
    typeof candidate.checksum !== "string" ||
    !SHA256_CHECKSUM.test(candidate.checksum) ||
    typeof candidate.policyVersion !== "string" ||
    !APPROVED_IDENTIFIER.test(candidate.policyVersion)
  ) {
    throw scannerBoundaryError();
  }

  return Object.freeze({
    quarantineObject: parseQuarantineObject(candidate.quarantineObject),
    checksum: candidate.checksum,
    policyVersion: candidate.policyVersion,
    scannerAdapterId: "",
    scannerVersion: "",
  });
}

function nonCleanObservation(
  request: ScannerProviderScanRequest,
  config: ScannerProviderConfiguration,
  reasonCode: "scanner_disabled" | "scanner_policy_inactive",
): ScannerObservation {
  return Object.freeze({
    verdict: "error",
    scannerAdapterId: config.scannerAdapterId,
    scannerVersion: config.scannerVersion,
    scannedChecksum: request.checksum,
    scannedAt: new Date().toISOString(),
    policyVersion: request.policyVersion,
    reasonCode,
    retryable: false,
  });
}

function quarantineObjectMatches(
  value: unknown,
  expected: ScannerProviderQuarantineObject,
): boolean {
  const object = dataRecord(value, ["tenantId", "documentId", "versionId", "objectKey"]);
  return Boolean(
    object &&
      object.tenantId === expected.tenantId &&
      object.documentId === expected.documentId &&
      object.versionId === expected.versionId &&
      object.objectKey === expected.objectKey,
  );
}

function parseProviderObservation(
  response: unknown,
  request: ScannerProviderScanRequest,
  startedAt: number,
): ScannerObservation {
  const envelope = dataRecord(response, ["data", "error"]);
  if (!envelope || envelope.error !== null) throw scannerBoundaryError();

  const observation = dataRecord(
    envelope.data,
    [
      "quarantineObject",
      "verdict",
      "scannerAdapterId",
      "scannerVersion",
      "scannedChecksum",
      "scannedAt",
      "policyVersion",
    ],
    ["reasonCode", "retryable"],
  );
  if (
    !observation ||
    !quarantineObjectMatches(observation.quarantineObject, request.quarantineObject) ||
    observation.scannerAdapterId !== request.scannerAdapterId ||
    observation.scannerVersion !== request.scannerVersion ||
    observation.scannedChecksum !== request.checksum ||
    observation.policyVersion !== request.policyVersion ||
    typeof observation.scannedAt !== "string"
  ) {
    throw scannerBoundaryError();
  }

  const scannedAtMs = Date.parse(observation.scannedAt);
  if (
    !Number.isFinite(scannedAtMs) ||
    new Date(scannedAtMs).toISOString() !== observation.scannedAt ||
    scannedAtMs < startedAt - MAX_CLOCK_SKEW_MS ||
    scannedAtMs > Date.now() + MAX_CLOCK_SKEW_MS
  ) {
    throw scannerBoundaryError();
  }

  if (observation.verdict === "clean") {
    if (observation.reasonCode !== undefined || observation.retryable !== undefined) {
      throw scannerBoundaryError();
    }
    return Object.freeze({
      verdict: "clean",
      scannerAdapterId: request.scannerAdapterId,
      scannerVersion: request.scannerVersion,
      scannedChecksum: request.checksum,
      scannedAt: observation.scannedAt,
      policyVersion: request.policyVersion,
    });
  }

  if (observation.verdict === "infected") {
    if (
      typeof observation.reasonCode !== "string" ||
      !INFECTED_REASON_CODES.has(observation.reasonCode) ||
      (observation.retryable !== undefined && observation.retryable !== false)
    ) {
      throw scannerBoundaryError();
    }
    return Object.freeze({
      verdict: "infected",
      scannerAdapterId: request.scannerAdapterId,
      scannerVersion: request.scannerVersion,
      scannedChecksum: request.checksum,
      scannedAt: observation.scannedAt,
      policyVersion: request.policyVersion,
      reasonCode: observation.reasonCode,
      ...(observation.retryable === undefined ? {} : { retryable: false as const }),
    });
  }

  if (
    observation.verdict !== "error" ||
    typeof observation.reasonCode !== "string" ||
    !ERROR_REASON_CODES.has(observation.reasonCode) ||
    typeof observation.retryable !== "boolean"
  ) {
    throw scannerBoundaryError();
  }
  return Object.freeze({
    verdict: "error",
    scannerAdapterId: request.scannerAdapterId,
    scannerVersion: request.scannerVersion,
    scannedChecksum: request.checksum,
    scannedAt: observation.scannedAt,
    policyVersion: request.policyVersion,
    reasonCode: observation.reasonCode,
    retryable: observation.retryable,
  });
}

export class ScannerProviderAdapter implements MalwareScannerAdapter {
  readonly #config: ScannerProviderConfiguration;
  readonly #provider: ScannerProviderCapability;

  constructor(
    provider: ScannerProviderCapability,
    options: ScannerProviderAdapterOptions,
  ) {
    this.#provider = provider;
    this.#config = parseConfiguration(options);
  }

  async scan(request: ScannerRequest): Promise<ScannerObservation> {
    let parsed: ScannerProviderScanRequest;
    try {
      const candidate = parseScannerRequest(request);
      parsed = Object.freeze({
        ...candidate,
        scannerAdapterId: this.#config.scannerAdapterId,
        scannerVersion: this.#config.scannerVersion,
      });
    } catch {
      throw scannerBoundaryError();
    }

    if (!this.#config.enabled) {
      return nonCleanObservation(parsed, this.#config, "scanner_disabled");
    }
    if (parsed.policyVersion !== this.#config.policyVersion) {
      return nonCleanObservation(parsed, this.#config, "scanner_policy_inactive");
    }

    const startedAt = Date.now();
    try {
      const response = await this.#provider.scanQuarantinedObject(parsed);
      return parseProviderObservation(response, parsed, startedAt);
    } catch {
      throw scannerBoundaryError();
    }
  }
}
