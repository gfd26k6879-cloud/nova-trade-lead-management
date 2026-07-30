import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import Database from "better-sqlite3";

import {
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_SANITIZED_COLUMNS,
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TABLE_NAMES,
  TENANT_INTEGRITY_CONTRACT_VERSION,
  encodeRowIdentity,
  quoteIdent,
  sanitizeRawGoogleReviewJson,
  tableContractsForSchemaVersion,
  validateDataExportDirectory,
} from "../../../scripts/data-transfer-contract.mjs";
import {
  COMPATIBILITY_TENANT_TABLES,
  COMPATIBILITY_WORKSPACE_TABLES,
  type CompatibilityBackfillManifest,
  type CompatibilityBackfillReceipt,
  compatibilityContentChecksum,
  compatibilityManifestHash,
  runSqliteCompatibilityBackfill,
  type SqliteBackfillDb,
} from "../tenancy/compatibility-backfill";
import {
  LEGACY_WEBSITE_LEAD_PLAY_ID,
  LEGACY_WEBSITE_LEAD_PLAY_VERSION,
  bindLegacyWebsiteLeadPlay,
  canonicalizeCompatibilityConfiguration,
  parseLegacyWebsiteLeadPlayJson,
  type LegacyWebsiteLeadPlaySeed,
} from "../tenancy/compatibility-play";
import {
  ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST,
  assertSqliteSchemaV1DatabaseHealth,
  classifySqliteSchemaV1,
  sqliteInternalCatalogDigest,
  sqliteSchemaV1PhysicalManifestDigest,
} from "./sqlite-schema-coordinator";
import {
  SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION,
  SQLITE_SCHEMA_V1_TRANSFORM_TABLES,
} from "./sqlite-schema-v1";

export const SQLITE_G006B_RECORD_FORMAT = "novatrade.sqlite-g006b-preparation" as const;
export const SQLITE_G006B_RECORD_SCHEMA_VERSION = 1 as const;
export const SQLITE_G006B_SOURCE_CARD_ID = "google_places_legacy" as const;
export const SQLITE_G006B_PREPARED_DOMAIN = "NOVATRADE\0G006B\0B1\0PREPARED\0V1\0" as const;
export const SQLITE_G006B_COMMITTED_DOMAIN = "NOVATRADE\0G006B\0B1\0COMMITTED\0V1\0" as const;
export const SQLITE_G006B_BINDING_DOMAIN = "NOVATRADE\0G006B\0B1\0BINDING\0V1\0" as const;
const PRESERVATION_DOMAIN = "NOVATRADE\0G006B\0B1\0PRESERVATION\0V1\0";
const ARCHIVE_DOMAIN = "NOVATRADE\0G006B\0B1\0ARCHIVE\0V1\0";
const RECEIPT_ROW_DOMAIN = "NOVATRADE\0G006B\0B1\0T028-RECEIPT-ROW\0V1\0";
const ARCHIVE_EXPORTED_AT = "1970-01-01T00:00:00.000Z";
const SOURCE_TABLES = Object.freeze([
  "place_cache",
  "places_master",
  "place_observations",
  "api_usage_events",
] as const);
const RECEIPT_ROW_COLUMNS = Object.freeze([
  "id", "idempotency_key", "schema_version", "source_engine", "checksum_algorithm",
  "manifest_hash", "source_snapshot_fingerprint", "tenant_id", "workspace_id",
  "owner_auth_identity_id", "policy_id", "policy_version", "policy_hash", "user_count",
  "table_counts_json", "before_checksums_json", "after_checksums_json",
  "relationship_orphan_count", "status", "receipt_json",
] as const);
const RECEIPT_KEYS = Object.freeze([
  "receiptId", "status", "schemaVersion", "sourceEngine", "checksumAlgorithm", "idempotencyKey",
  "manifestHash", "sourceSnapshotFingerprint", "tenantId", "workspaceId", "ownerAuthIdentityId",
  "policyId", "policyVersion", "policyHash", "userCount", "tableCounts", "beforeContentChecksums",
  "afterContentChecksums", "relationshipOrphanCount", "rollback", "activation",
] as const);
const MANIFEST_KEYS = Object.freeze([
  "schemaVersion", "sourceEngine", "checksumAlgorithm", "idempotencyKey", "sourceSnapshotFingerprint",
  "tenantId", "tenantSlug", "tenantName", "workspaceId", "workspaceSlug", "workspaceName",
  "ownerLegacyUserId", "ownerAuthIdentityId", "policyId", "policyVersion", "policyHash",
  "legacyUsers", "legacyTables",
] as const);

type CanonicalValue = null | boolean | string | number | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };
export interface SqliteG006bNativeIdentity {
  readonly volumeSerialNumber: string;
  readonly fileId: string;
  readonly size: number;
  readonly numberOfLinks: number;
  readonly sha256: string;
  readonly fileSystem: "NTFS";
}

interface SqliteG006bPreFinalizationCommonInput {
  readonly operationId: string;
  readonly databasePath: string;
  readonly backupPath: string;
  readonly archiveDirectory: string;
  readonly preparedPath: string;
  readonly committedPath: string;
  readonly manifest: CompatibilityBackfillManifest;
  readonly seed: LegacyWebsiteLeadPlaySeed;
  readonly expectedSourceIdentity: SqliteG006bNativeIdentity;
  readonly expectedAcceptedPhysicalManifestDigest: string;
  readonly expectedReceiptRowSha256: string;
  readonly expectedBindingId: string;
  readonly expectedConfigurationHash: string;
  readonly expectedPreservationAggregateSha256: string;
  readonly expectedJournalMode: "delete" | "wal";
}

export interface SqliteG006bExecuteInput extends SqliteG006bPreFinalizationCommonInput {
  readonly mode: "execute";
}

export interface SqliteG006bResumeInput extends SqliteG006bPreFinalizationCommonInput {
  readonly mode: "resume";
  readonly expectedPreparedHandoffId: string;
}

export interface SqliteG006bReplayInput extends SqliteG006bPreFinalizationCommonInput {
  readonly mode: "replay";
  readonly expectedPreparedHandoffId: string;
  readonly expectedCommittedHandoffId: string;
}

export type SqliteG006bPreFinalizationInput =
  | SqliteG006bExecuteInput
  | SqliteG006bResumeInput
  | SqliteG006bReplayInput;

export type SqliteG006bPreFinalizationResult = Readonly<{
  readonly mode: "execute" | "resume" | "replay";
  readonly status: "committed" | "replayed";
  readonly preparedHandoffId: string;
  readonly committedHandoffId: string;
  readonly bindingHash: string;
}>;

export interface SqliteG006bInspectionInput {
  readonly databasePath: string;
  readonly manifest: CompatibilityBackfillManifest;
  readonly seed: LegacyWebsiteLeadPlaySeed;
}

export interface SqliteG006bInspectionResult {
  readonly sourceIdentity: SqliteG006bNativeIdentity;
  readonly acceptedPhysicalManifestDigest: string;
  readonly receiptRowSha256: string;
  readonly bindingId: string;
  readonly configurationHash: string;
  readonly preservationAggregateSha256: string;
  readonly journalMode: "delete" | "wal";
}

export type SqliteG006bErrorCode =
  | "G006B_INPUT_REJECTED"
  | "G006B_LOCK_HELD"
  | "G006B_STATE_REJECTED"
  | "G006B_EVIDENCE_DRIFT"
  | "G006B_PUBLISH_FAILED"
  | "G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED"
  | "G006B_PREPARED_RECORD_REQUIRED"
  | "G006B_RECOVERY_REQUIRED"
  | "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED";

export class SqliteG006bError extends Error {
  public readonly code: SqliteG006bErrorCode;
  public readonly cleanupFailures: readonly string[];
  public readonly detail: string;

  public constructor(code: SqliteG006bErrorCode, detail?: string, cleanupFailures: readonly string[] = []) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SqliteG006bError";
    this.code = code;
    this.detail = detail ?? "";
    this.cleanupFailures = Object.freeze([...cleanupFailures]);
  }
}

export class SqliteG006bCommittedUnverifiedError extends SqliteG006bError {
  public readonly committed = true as const;
  public readonly status = "committed-unverified-recovery-required" as const;

  public constructor(detail: string, cleanupFailures: readonly string[] = []) {
    super("G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED", detail, cleanupFailures);
    this.name = "SqliteG006bCommittedUnverifiedError";
  }
}

export class SqliteG006bPublishedUnverifiedError extends SqliteG006bError {
  public readonly published = true as const;
  public readonly status = "published-unverified-recovery-required" as const;
  public readonly resourceConsumed: boolean;

  public constructor(detail: string, cleanupFailures: readonly string[] = [], resourceConsumed = false) {
    super("G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED", detail, cleanupFailures);
    this.name = "SqliteG006bPublishedUnverifiedError";
    this.resourceConsumed = resourceConsumed;
  }
}

interface PreservationTable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rowCount: number;
  readonly payloadSha256: string;
}

interface PreservationEvidence {
  readonly algorithm: "novatrade-sqlite-type-tagged-rowset-sha256-v1";
  readonly domain: typeof PRESERVATION_DOMAIN;
  readonly tables: readonly PreservationTable[];
  readonly aggregateSha256: string;
  readonly transformAggregateSha256: string;
  readonly audit: PreservationTable;
  readonly relationshipOrphanCount: 0;
}

interface G023Evidence {
  readonly playId: typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  readonly playVersion: typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  readonly configurationHash: string;
  readonly bindingId: string;
  readonly seedCanonicalJson: string;
  readonly seedSha256: string;
  readonly bindingCanonicalJson: string;
  readonly bindingSha256: string;
}

interface RecordEnvelope {
  readonly format: typeof SQLITE_G006B_RECORD_FORMAT;
  readonly schemaVersion: typeof SQLITE_G006B_RECORD_SCHEMA_VERSION;
  readonly phase: "prepared" | "committed";
  readonly handoffId: string;
  readonly recordSha256: string;
  readonly payload: Record<string, unknown>;
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function assertUnicodeScalarString(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) fail("G006B_INPUT_REJECTED", `${label} contains a lone surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("G006B_INPUT_REJECTED", `${label} contains a lone surrogate`);
    }
  }
}

function validateCanonicalValue(value: unknown, label: string, seen = new Set<object>()): asserts value is CanonicalValue {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    assertUnicodeScalarString(value, label);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("G006B_INPUT_REJECTED", `${label} number is not a non-negative-zero safe integer`);
    return;
  }
  if (typeof value !== "object" || isProxy(value)) fail("G006B_INPUT_REJECTED", `${label} is not canonical JSON`);
  if (seen.has(value)) fail("G006B_INPUT_REJECTED", `${label} is cyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index)) || Reflect.ownKeys(value).length !== value.length + 1) fail("G006B_INPUT_REJECTED", `${label} array is sparse or decorated`);
    keys.forEach((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("G006B_INPUT_REJECTED", `${label}[${index}] is not an enumerable data property`);
      validateCanonicalValue(descriptor.value, `${label}[${index}]`, seen);
    });
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("G006B_INPUT_REJECTED", `${label} is not a plain record`);
    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) fail("G006B_INPUT_REJECTED", `${label} contains hidden or symbol keys`);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("G006B_INPUT_REJECTED", `${label}.${key} is not an enumerable data property`);
      assertUnicodeScalarString(key, `${label} key`);
      validateCanonicalValue(descriptor.value, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function validateEmbeddedJsonValue(value: unknown, label: string, seen = new Set<object>()): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") return assertUnicodeScalarString(value, label);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("G006B_INPUT_REJECTED", `${label} number is nonfinite or negative zero`);
    return;
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) fail("G006B_INPUT_REJECTED", `${label} is not embedded canonical JSON`);
  seen.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index)) || Reflect.ownKeys(value).length !== value.length + 1) fail("G006B_INPUT_REJECTED", `${label} array is sparse or decorated`);
    keys.forEach((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("G006B_INPUT_REJECTED", `${label}[${index}] is not an enumerable data property`);
      validateEmbeddedJsonValue(descriptor.value, `${label}[${index}]`, seen);
    });
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("G006B_INPUT_REJECTED", `${label} is not a plain record`);
    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) fail("G006B_INPUT_REJECTED", `${label} contains hidden or symbol keys`);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("G006B_INPUT_REJECTED", `${label}.${key} is not an enumerable data property`);
      assertUnicodeScalarString(key, `${label} key`);
      validateEmbeddedJsonValue(descriptor.value, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function canonicalizeSqliteG006bRecord(value: unknown): string {
  validateCanonicalValue(value, "record");
  const encode = (entry: CanonicalValue): string => {
    if (entry === null || typeof entry === "boolean" || typeof entry === "number" || typeof entry === "string") {
      return JSON.stringify(entry);
    }
    if (Array.isArray(entry)) return `[${entry.map(encode).join(",")}]`;
    const record = entry as { readonly [key: string]: CanonicalValue };
    return `{${Object.keys(record).sort(compareCodeUnits).map((key) => `${JSON.stringify(key)}:${encode(record[key]!)}`).join(",")}}`;
  };
  return encode(value);
}

export function hashSqliteG006bDomain(domain: string, value: unknown): string {
  assertUnicodeScalarString(domain, "domain");
  return createHash("sha256").update(domain, "utf8").update(canonicalizeSqliteG006bRecord(value), "utf8").digest("hex");
}

function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code: SqliteG006bErrorCode, detail: string): never {
  throw new SqliteG006bError(code, detail);
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value)) fail("G006B_INPUT_REJECTED", `${label} must be a plain record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("G006B_INPUT_REJECTED", `${label} must be a plain record`);
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (Reflect.ownKeys(value).length !== actual.length
      || actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("G006B_INPUT_REJECTED", `${label} keys are not exact`);
  }
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("G006B_INPUT_REJECTED", `${label}.${key} must be an enumerable data property`);
  }
}

function assertManifestRecursiveShape(manifest: CompatibilityBackfillManifest, label: string): void {
  exactKeys(manifest, MANIFEST_KEYS, label);
  if (manifest.schemaVersion !== 1 || manifest.sourceEngine !== "sqlite" || manifest.checksumAlgorithm !== "novatrade-sqlite-canonical-json-v1") fail("G006B_INPUT_REJECTED", `${label} fixed literals`);
  if (!Array.isArray(manifest.legacyUsers) || !Array.isArray(manifest.legacyTables)) fail("G006B_INPUT_REJECTED", `${label} arrays`);
  for (const [index, user] of manifest.legacyUsers.entries()) {
    exactKeys(user, [
      "legacyUserId", "authIdentityId", "expectedEmail", "expectedLegacyRole", "expectedStatus",
      "membershipId", ...(user.workspaceId === undefined ? [] : ["workspaceId"]), "membershipRole",
      "membershipStatus", "roleBindingId", "marketAccessIds",
    ], `${label}.legacyUsers[${index}]`);
  }
  for (const [index, table] of manifest.legacyTables.entries()) {
    exactKeys(table, ["table", "rowCount", "contentChecksum"], `${label}.legacyTables[${index}]`);
  }
  canonicalizeSqliteG006bRecord(manifest);
}

function assertReceiptRecursiveShape(receipt: CompatibilityBackfillReceipt, label: string): void {
  exactKeys(receipt, RECEIPT_KEYS, label);
  for (const [field, value] of [
    ["tableCounts", receipt.tableCounts],
    ["beforeContentChecksums", receipt.beforeContentChecksums],
    ["afterContentChecksums", receipt.afterContentChecksums],
  ] as const) exactKeys(value, COMPATIBILITY_TENANT_TABLES, `${label}.${field}`);
  canonicalizeSqliteG006bRecord(receipt);
}

function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) fail("G006B_INPUT_REJECTED", `${label} must be lowercase SHA-256`);
}

function canonicalExistingFile(value: string, label: string): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || /[\0\t\r\n]/u.test(value)) fail("G006B_INPUT_REJECTED", `${label} must be an exact absolute path`);
  let canonical: string;
  try {
    canonical = realpathSync.native(value);
  } catch {
    return fail("G006B_INPUT_REJECTED", `${label} does not exist`);
  }
  if (canonical !== value || !statSync(value).isFile()) fail("G006B_INPUT_REJECTED", `${label} is aliased or not a file`);
  return value;
}

function canonicalTarget(value: string, label: string, directory = false): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || /[\0\t\r\n]/u.test(value)) fail("G006B_INPUT_REJECTED", `${label} must be an exact absolute path`);
  const parent = dirname(value);
  if (realpathSync.native(parent) !== parent || !statSync(parent).isDirectory()) fail("G006B_INPUT_REJECTED", `${label} parent is aliased or absent`);
  if (existsSync(value)) {
    const canonical = realpathSync.native(value);
    if (canonical !== value || statSync(value).isDirectory() !== directory) fail("G006B_INPUT_REJECTED", `${label} existing path kind or identity mismatch`);
  }
  return value;
}

function canonicalDirectoryTarget(value: string, label: string): string {
  return canonicalTarget(value, label, true);
}

const POWERSHELL_EXE = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const PUBLISHER_SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/g006b-windows-durable-publish.ps1", import.meta.url));
const PUBLISHER_NORMALIZED_SHA256 = "30ed26bdb82a104412a35e4dc2251e19f92b6a42d670aba63cbec04c522c0e75";
const NATIVE_COMMAND_TIMEOUT_MS = 30_000;
const BROKER_RESPONSE_TIMEOUT_MS = 30_000;

interface ValidatedInput extends SqliteG006bPreFinalizationCommonInput {
  readonly mode: "execute" | "resume" | "replay";
  readonly expectedPreparedHandoffId?: string;
  readonly expectedCommittedHandoffId?: string;
  readonly lockPath: string;
  readonly backupTemporaryPath: string;
  readonly archiveStagingDirectory: string;
  readonly preparedTemporaryPath: string;
  readonly committedTemporaryPath: string;
  readonly privateToken: string;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function jsonSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function helperNormalizedSha256(): string {
  const bytes = readFileSync(PUBLISHER_SCRIPT_PATH);
  const text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) fail("G006B_EVIDENCE_DRIFT", "publisher script BOM");
  return sha256Bytes(text.replaceAll("\r\n", "\n"));
}

function assertInternalPublisher(): void {
  if (realpathSync.native(PUBLISHER_SCRIPT_PATH) !== PUBLISHER_SCRIPT_PATH
      || helperNormalizedSha256() !== PUBLISHER_NORMALIZED_SHA256) {
    fail("G006B_EVIDENCE_DRIFT", "internal publisher script identity");
  }
}

function validateInput(input: SqliteG006bPreFinalizationInput): ValidatedInput {
  if (!input || typeof input !== "object" || isProxy(input)) fail("G006B_INPUT_REJECTED", "input must be a non-proxy record");
  const modeDescriptor = Object.getOwnPropertyDescriptor(input, "mode");
  if (!modeDescriptor || !("value" in modeDescriptor)) fail("G006B_INPUT_REJECTED", "mode must be a data property");
  const mode = modeDescriptor.value;
  const modeKeys = mode === "resume" ? ["expectedPreparedHandoffId"]
    : mode === "replay" ? ["expectedPreparedHandoffId", "expectedCommittedHandoffId"] : [];
  const keys = [
    "mode", "operationId", "databasePath", "backupPath", "archiveDirectory", "preparedPath", "committedPath", "manifest", "seed",
    "expectedSourceIdentity", "expectedAcceptedPhysicalManifestDigest", "expectedReceiptRowSha256",
    "expectedBindingId", "expectedConfigurationHash", "expectedPreservationAggregateSha256", "expectedJournalMode",
    ...modeKeys,
  ];
  exactKeys(input, keys, "input");
  if (input.mode !== "execute" && input.mode !== "resume" && input.mode !== "replay") fail("G006B_INPUT_REJECTED", "mode");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.operationId)) fail("G006B_INPUT_REJECTED", "operationId");
  canonicalExistingFile(input.databasePath, "databasePath");
  for (const [pathValue, label] of [
    [input.backupPath, "backupPath"], [input.preparedPath, "preparedPath"], [input.committedPath, "committedPath"],
  ] as const) canonicalTarget(pathValue, label);
  canonicalDirectoryTarget(input.archiveDirectory, "archiveDirectory");
  const authorityPaths = [input.databasePath, input.backupPath, input.archiveDirectory, input.preparedPath, input.committedPath];
  if (new Set(authorityPaths).size !== authorityPaths.length) fail("G006B_INPUT_REJECTED", "explicit authority paths must be distinct");
  if (input.mode !== "execute") {
    if (!/^g006b:v1:[0-9a-f]{64}$/u.test(input.expectedPreparedHandoffId)) fail("G006B_INPUT_REJECTED", "expectedPreparedHandoffId");
    if (input.mode === "replay" && !/^g006b:v1:[0-9a-f]{64}$/u.test(input.expectedCommittedHandoffId)) fail("G006B_INPUT_REJECTED", "expectedCommittedHandoffId");
  }
  assertSha(input.expectedAcceptedPhysicalManifestDigest, "expectedAcceptedPhysicalManifestDigest");
  assertSha(input.expectedReceiptRowSha256, "expectedReceiptRowSha256");
  assertSha(input.expectedConfigurationHash, "expectedConfigurationHash");
  assertSha(input.expectedPreservationAggregateSha256, "expectedPreservationAggregateSha256");
  if (input.expectedJournalMode !== "delete" && input.expectedJournalMode !== "wal") fail("G006B_INPUT_REJECTED", "expectedJournalMode");
  exactKeys(input.expectedSourceIdentity, ["volumeSerialNumber", "fileId", "size", "numberOfLinks", "sha256", "fileSystem"], "expectedSourceIdentity");
  assertNativeIdentity(input.expectedSourceIdentity, "expectedSourceIdentity");
  validateEmbeddedJsonValue(input.manifest, "manifest");
  assertManifestRecursiveShape(input.manifest, "manifest");
  validateEmbeddedJsonValue(input.seed, "seed");
  assertInternalPublisher();
  const token = randomBytes(24).toString("hex");
  const snapshot: ValidatedInput = {
    mode: input.mode,
    operationId: input.operationId,
    databasePath: input.databasePath,
    backupPath: input.backupPath,
    archiveDirectory: input.archiveDirectory,
    preparedPath: input.preparedPath,
    committedPath: input.committedPath,
    manifest: jsonSnapshot(input.manifest),
    seed: jsonSnapshot(input.seed),
    expectedSourceIdentity: jsonSnapshot(input.expectedSourceIdentity),
    expectedAcceptedPhysicalManifestDigest: input.expectedAcceptedPhysicalManifestDigest,
    expectedReceiptRowSha256: input.expectedReceiptRowSha256,
    expectedBindingId: input.expectedBindingId,
    expectedConfigurationHash: input.expectedConfigurationHash,
    expectedPreservationAggregateSha256: input.expectedPreservationAggregateSha256,
    expectedJournalMode: input.expectedJournalMode,
    ...(input.mode === "resume" || input.mode === "replay" ? { expectedPreparedHandoffId: input.expectedPreparedHandoffId } : {}),
    ...(input.mode === "replay" ? { expectedCommittedHandoffId: input.expectedCommittedHandoffId } : {}),
    lockPath: `${input.databasePath}.g006b.lock`,
    backupTemporaryPath: `${input.backupPath}.g006b.tmp.${token}`,
    archiveStagingDirectory: `${input.archiveDirectory}.g006b.staging.${token}`,
    preparedTemporaryPath: `${input.preparedPath}.g006b.tmp.${token}`,
    committedTemporaryPath: `${input.committedPath}.g006b.tmp.${token}`,
    privateToken: token,
  };
  for (const [pathValue, label] of [
    [snapshot.lockPath, "derived lock"], [snapshot.backupTemporaryPath, "derived backup temp"],
    [snapshot.preparedTemporaryPath, "derived prepared temp"], [snapshot.committedTemporaryPath, "derived committed temp"],
  ] as const) canonicalTarget(pathValue, label);
  canonicalDirectoryTarget(snapshot.archiveStagingDirectory, "derived archive staging");
  return deepFreeze(snapshot);
}

function assertNativeIdentity(value: unknown, label: string): asserts value is SqliteG006bNativeIdentity {
  exactKeys(value, ["volumeSerialNumber", "fileId", "size", "numberOfLinks", "sha256", "fileSystem"], label);
  if (typeof value.volumeSerialNumber !== "string" || !/^[0-9]+$/u.test(value.volumeSerialNumber)) fail("G006B_INPUT_REJECTED", `${label}.volumeSerialNumber`);
  if (typeof value.fileId !== "string" || !/^[0-9a-f]{32}$/u.test(value.fileId)) fail("G006B_INPUT_REJECTED", `${label}.fileId`);
  if (!Number.isSafeInteger(value.size) || Number(value.size) < 0 || value.numberOfLinks !== 1 || value.fileSystem !== "NTFS") fail("G006B_INPUT_REJECTED", `${label} scalar contract`);
  assertSha(value.sha256, `${label}.sha256`);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeSqliteG006bRecord(left) === canonicalizeSqliteG006bRecord(right);
}

function nativeCommand(args: readonly string[]): Record<string, unknown> {
  assertInternalPublisher();
  const result = spawnSync(POWERSHELL_EXE, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER_SCRIPT_PATH, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: NATIVE_COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  assertInternalPublisher();
  if (result.error) fail("G006B_PUBLISH_FAILED", `native publisher transport: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${String(result.stderr).trim()} (exit ${String(result.status)})`;
    if (result.status === 16) fail("G006B_LOCK_HELD", detail);
    if (result.status === 14) throw new SqliteG006bPublishedUnverifiedError(detail);
    fail("G006B_PUBLISH_FAILED", detail);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(result.stdout).trim());
  } catch {
    return fail("G006B_PUBLISH_FAILED", "native publisher returned invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("G006B_PUBLISH_FAILED", "native result shape");
  return parsed as Record<string, unknown>;
}

function identityFromNativeResult(value: Record<string, unknown>, label: string): SqliteG006bNativeIdentity {
  const identity = {
    volumeSerialNumber: value.volumeSerialNumber,
    fileId: value.fileId,
    size: value.size,
    numberOfLinks: value.numberOfLinks,
    sha256: value.sha256,
    fileSystem: value.fileSystem,
  };
  assertNativeIdentity(identity, label);
  return identity;
}

function inspectNative(path: string): SqliteG006bNativeIdentity {
  return identityFromNativeResult(nativeCommand(["-Mode", "InspectFile", "-Path", path]), "native inspection");
}

function inspectNativeIfPresent(path: string): SqliteG006bNativeIdentity | undefined {
  try { return inspectNative(path); } catch (error) {
    if (!existsSync(path)) return undefined;
    throw error;
  }
}

function inspectSidecarIfPresent(path: string): { readonly size: number; readonly volumeSerialNumber: string; readonly fileId: string } | undefined {
  if (!existsSync(path)) return undefined;
  const value = nativeCommand(["-Mode", "InspectFile", "-Path", path, "-Kind", "sidecar"]);
  if (!Number.isSafeInteger(value.size) || Number(value.size) < 0 || typeof value.volumeSerialNumber !== "string"
      || !/^[0-9]+$/u.test(value.volumeSerialNumber) || typeof value.fileId !== "string" || !/^[0-9a-f]{32}$/u.test(value.fileId)) {
    fail("G006B_PUBLISH_FAILED", "native sidecar identity");
  }
  return Object.freeze({ size: Number(value.size), volumeSerialNumber: value.volumeSerialNumber, fileId: value.fileId });
}

async function publish(source: string, destination: string, ledger: OwnershipLedger): Promise<SqliteG006bNativeIdentity> {
  const resource = ledger.require(source, "file");
  const written = await ledger.inspect(source);
  const identity = await ledger.publish(source, destination, written.sha256, written.size, resource.identity);
  if (identity.size !== written.size || identity.sha256 !== written.sha256) fail("G006B_PUBLISH_FAILED", "post-publication bytes");
  return identity;
}

interface OwnedIdentity { readonly volumeSerialNumber: string; readonly fileId: string }
interface OwnedResource {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly identity: OwnedIdentity;
  readonly disposition: "cleanup" | "release";
}

function cleanupOwned(path: string, kind: "file" | "directory", identity: OwnedIdentity): void {
  nativeCommand([
    "-Mode", "CleanupOwned", "-Path", path, "-Kind", kind,
    "-ExpectedVolumeSerialNumber", identity.volumeSerialNumber, "-ExpectedFileId", identity.fileId,
  ]);
}

class OwnershipLedger {
  readonly #resources = new Map<string, OwnedResource>();
  readonly #lease: NativeDatabaseLease;

  public constructor(lease: NativeDatabaseLease) { this.#lease = lease; }

  public async create(path: string, kind: "file" | "directory", disposition: "cleanup" | "release" = "cleanup"): Promise<OwnedResource> {
    if (this.#resources.has(path)) fail("G006B_PUBLISH_FAILED", `duplicate owned resource ${path}`);
    const identity = await this.#lease.createResource(path, kind, disposition);
    const resource = Object.freeze({ path, kind, identity, disposition });
    this.#resources.set(path, resource);
    return resource;
  }

  public async retainExistingDirectory(path: string): Promise<OwnedResource> {
    if (this.#resources.has(path)) fail("G006B_PUBLISH_FAILED", `duplicate retained resource ${path}`);
    const identity = await this.#lease.retainExistingDirectory(path);
    const resource = Object.freeze({ path, kind: "directory" as const, identity, disposition: "release" as const });
    this.#resources.set(path, resource);
    return resource;
  }

  public require(path: string, kind: "file" | "directory"): OwnedResource {
    const resource = this.#resources.get(path);
    if (!resource || resource.kind !== kind) fail("G006B_PUBLISH_FAILED", `resource is not invocation-owned: ${path}`);
    return resource;
  }

  public inspect(path: string): Promise<SqliteG006bNativeIdentity> {
    this.require(path, "file");
    return this.#lease.inspectResource(path);
  }

  public async write(path: string, bytes: Buffer): Promise<SqliteG006bNativeIdentity> {
    this.require(path, "file");
    return this.#lease.writeResource(path, bytes);
  }

  public async flushDirectory(path: string): Promise<void> {
    this.require(path, "directory");
    await this.#lease.flushResource(path);
  }

  public async publish(path: string, destination: string, sha256: string, bytes: number, sourceIdentity: OwnedIdentity): Promise<SqliteG006bNativeIdentity> {
    this.require(path, "file");
    try {
      const identity = await this.#lease.publishResource(path, destination, sha256, bytes, sourceIdentity);
      this.#resources.delete(path);
      return identity;
    } catch (error) {
      if (error instanceof SqliteG006bPublishedUnverifiedError && error.resourceConsumed) this.#resources.delete(path);
      throw error;
    }
  }

  public async releasePersistent(path: string): Promise<void> {
    const resource = this.require(path, "directory");
    if (resource.disposition !== "release") fail("G006B_PUBLISH_FAILED", `resource is not persistent: ${path}`);
    await this.#lease.releaseResource(path);
    this.#resources.delete(path);
  }

  public async cleanupAll(cleanup: string[]): Promise<SqliteG006bPublishedUnverifiedError | undefined> {
    let publishedUnverified: SqliteG006bPublishedUnverifiedError | undefined;
    for (const resource of [...this.#resources.values()].reverse()) {
      try {
        if (resource.disposition === "release") await this.#lease.releaseResource(resource.path);
        else await this.#lease.cleanupResource(resource.path);
        this.#resources.delete(resource.path);
      } catch (brokerError) {
        if (brokerError instanceof SqliteG006bPublishedUnverifiedError) publishedUnverified ??= brokerError;
        if (resource.disposition === "release") {
          cleanup.push(`owned release ${resource.path}: ${message(brokerError)}`);
          continue;
        }
        try {
          cleanupOwned(resource.path, resource.kind, resource.identity);
          this.#resources.delete(resource.path);
        } catch (fallbackError) {
          cleanup.push(`owned cleanup ${resource.path}: broker=${message(brokerError)} fallback=${message(fallbackError)}`);
        }
      }
    }
    return publishedUnverified;
  }
}

async function writeOwnedDurable(path: string, bytes: Buffer, ledger: OwnershipLedger): Promise<void> {
  await ledger.create(path, "file");
  const written = await ledger.write(path, bytes);
  if (written.size !== bytes.length || written.sha256 !== sha256Bytes(bytes)) fail("G006B_PUBLISH_FAILED", "retained write result drift");
}

interface Schema3ExportFile { readonly name: string; readonly bytes: Buffer }

function buildSchema3Export(databasePath: string): readonly Schema3ExportFile[] {
  const contracts = tableContractsForSchemaVersion(LEGACY_DATA_EXPORT_SCHEMA_VERSION);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  const files: Schema3ExportFile[] = [];
  const tables: Record<string, Record<string, unknown>> = {};
  const manifest = {
    format: DATA_EXPORT_FORMAT,
    schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION,
    integrityContract: {
      version: TENANT_INTEGRITY_CONTRACT_VERSION,
      rules: [
        "foundation-parent-closure",
        "composite-tenant-relationships",
        "legacy-scope-mappings",
        "compatibility-receipt-bindings",
        "immutable-state-facts",
      ],
    },
    exportedAt: ARCHIVE_EXPORTED_AT,
    source: { kind: "sqlite", file: basename(databasePath) },
    tableOrder: contracts.map(({ name }) => name),
    excludedColumns: Object.fromEntries(
      contracts
        .filter(({ excludedColumns }) => excludedColumns.length > 0)
        .map(({ name, excludedColumns }) => [name, [...excludedColumns]]),
    ),
    sanitizedColumns: Object.fromEntries(
      Object.entries(DATA_EXPORT_SANITIZED_COLUMNS).map(([name, columns]) => [name, [...columns]]),
    ),
    tables,
  };
  try {
    db.exec("BEGIN");
    for (const contract of contracts) {
      const schema = db.prepare(`PRAGMA table_info(${quoteIdent(contract.name)})`).all() as Array<{ name: string; pk: number | bigint }>;
      if (schema.length === 0) fail("G006B_EVIDENCE_DRIFT", `${contract.name}: expected schema-3 table is missing`);
      const actualPrimaryKey = schema
        .filter(({ pk }) => Number(pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk))
        .map(({ name }) => String(name));
      if (actualPrimaryKey.length !== contract.physicalPrimaryKey.length
          || actualPrimaryKey.some((column, index) => column !== contract.physicalPrimaryKey[index])) {
        fail("G006B_EVIDENCE_DRIFT", `${contract.name}: SQLite primary key does not match the recovery contract`);
      }
      const sourceColumns = schema.map(({ name }) => String(name));
      for (const protectedColumn of contract.excludedColumns) {
        if (!sourceColumns.includes(protectedColumn)) fail("G006B_EVIDENCE_DRIFT", `${contract.name}: protected column ${protectedColumn} is missing`);
      }
      const excluded = new Set<string>(contract.excludedColumns);
      const columns = sourceColumns.filter((column) => !excluded.has(column));
      for (const identityColumn of contract.rowIdentity) {
        if (!columns.includes(identityColumn)) fail("G006B_EVIDENCE_DRIFT", `${contract.name}: schema-3 row identity column ${identityColumn} is missing`);
      }
      const rawCredentialColumns = columns.filter((column) => /(?:^|_)(?:password|secret|credential|access_token|refresh_token|api_key)(?:_|$)/iu.test(column));
      if (rawCredentialColumns.length !== 0) fail("G006B_EVIDENCE_DRIFT", `${contract.name}: raw credential columns are not explicitly excluded`);
      const sourceRows = db.prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(contract.name)}`).all() as Array<Record<string, unknown>>;
      const rows = sourceRows.map((row, rowIndex) => Object.hasOwn(DATA_EXPORT_SANITIZED_COLUMNS, contract.name)
        ? { ...row, raw_json: sanitizeRawGoogleReviewJson(row.raw_json, `${contract.name}[${rowIndex}].raw_json`) }
        : row);
      const identities = new Set<string>();
      for (const [rowIndex, row] of rows.entries()) {
        const identity = encodeRowIdentity(contract, row, `${contract.name}[${rowIndex}]`);
        if (identities.has(identity)) fail("G006B_EVIDENCE_DRIFT", `${contract.name}: duplicate row identity at row ${rowIndex}`);
        identities.add(identity);
      }
      const fileName = `${contract.name}.json`;
      const payload = `${JSON.stringify(rows, null, 2)}\n`;
      files.push(Object.freeze({ name: fileName, bytes: Buffer.from(payload, "utf8") }));
      tables[contract.name] = {
        file: fileName,
        rows: rows.length,
        columns,
        primaryKey: [...actualPrimaryKey],
        bytes: Buffer.byteLength(payload),
        sha256: sha256Bytes(payload),
      };
    }
    db.exec("COMMIT");
    files.push(Object.freeze({ name: "manifest.json", bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") }));
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
  return Object.freeze(files);
}

async function exportSchema3IntoOwnedDirectory(
  databasePath: string,
  outputDirectory: string,
  ledger: OwnershipLedger,
): Promise<void> {
  for (const file of buildSchema3Export(databasePath)) {
    await writeOwnedDurable(join(outputDirectory, file.name), file.bytes, ledger);
  }
}

function bounded<T>(promise: Promise<T>, label: string, timeoutMs = BROKER_RESPONSE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolveBounded, rejectBounded) => {
    const timer = setTimeout(() => rejectBounded(new Error(`${label} timed out after ${String(timeoutMs)}ms`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolveBounded(value); },
      (error: unknown) => { clearTimeout(timer); rejectBounded(error); },
    );
  });
}

interface PendingPublication {
  readonly source: string;
  readonly destination: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly identity: OwnedIdentity;
}

class NativeDatabaseLease {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: AsyncIterator<string>;
  readonly #reader: Interface;
  readonly #lockPath: string;
  #lockIdentity: OwnedIdentity | undefined;
  #stderr = "";
  #publicationEver = false;
  #pendingPublication: PendingPublication | undefined;
  #sidecarsCaptured = false;

  private constructor(child: ChildProcessWithoutNullStreams, lockPath: string) {
    this.#child = child;
    this.#lockPath = lockPath;
    this.#reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.#lines = this.#reader[Symbol.asyncIterator]();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { this.#stderr += chunk; });
  }

  public static async acquire(databasePath: string, lockPath: string): Promise<{ lease: NativeDatabaseLease; identity: SqliteG006bNativeIdentity }> {
    assertInternalPublisher();
    const child = spawn(POWERSHELL_EXE, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER_SCRIPT_PATH,
      "-Mode", "LeaseDatabase", "-Path", databasePath, "-LockPath", lockPath,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const lease = new NativeDatabaseLease(child, lockPath);
    try {
      return { lease, identity: await lease.#next("lease-ready") };
    } catch (error) {
      await lease.#terminate();
      throw error;
    }
  }

  async #waitForExit(): Promise<number | null> {
    if (this.#child.exitCode !== null) return this.#child.exitCode;
    return bounded(new Promise<number | null>((resolveExit) => this.#child.once("exit", resolveExit)), "native lease exit", 5_000);
  }

  async #terminate(): Promise<number | null> {
    if (this.#child.exitCode === null) this.#child.kill();
    try { return await this.#waitForExit(); } catch { return this.#child.exitCode; }
  }

  async #readLine(label: string): Promise<string> {
    let line: IteratorResult<string>;
    try {
      line = await bounded(this.#lines.next(), `native lease ${label}`);
    } catch (error) {
      const exitCode = await this.#terminate();
      const detail = this.#stderr.trim() || `${message(error)} (exit ${String(exitCode)})`;
      if (detail.includes("database lock held")) fail("G006B_LOCK_HELD", detail);
      if (exitCode === 14 || this.#publicationEver || detail.includes("G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED")) {
        throw new SqliteG006bPublishedUnverifiedError(detail);
      }
      fail("G006B_PUBLISH_FAILED", detail);
    }
    if (line.done) {
      const exitCode = await this.#waitForExit();
      const detail = this.#stderr.trim() || `native lease ended during ${label} (exit ${String(exitCode)})`;
      if (detail.includes("database lock held")) fail("G006B_LOCK_HELD", detail);
      if (exitCode === 14 || this.#publicationEver || detail.includes("G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED")) {
        throw new SqliteG006bPublishedUnverifiedError(detail);
      }
      fail("G006B_PUBLISH_FAILED", detail);
    }
    return line.value;
  }

  async #next(expectedStatus: string): Promise<SqliteG006bNativeIdentity> {
    const raw = await this.#readLine(expectedStatus);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return fail("G006B_PUBLISH_FAILED", "native lease returned invalid JSON"); }
    const extra = expectedStatus === "lease-ready" ? ["lockVolumeSerialNumber", "lockFileId"] : [];
    exactKeys(parsed, ["status", "volumeSerialNumber", "fileId", "size", "numberOfLinks", "attributes", "finalPath", "sha256", "fileSystem", ...extra], "native lease response");
    if (parsed.status !== expectedStatus) fail("G006B_PUBLISH_FAILED", `native lease status ${String(parsed.status)}`);
    const identity = {
      volumeSerialNumber: parsed.volumeSerialNumber,
      fileId: parsed.fileId,
      size: parsed.size,
      numberOfLinks: parsed.numberOfLinks,
      sha256: parsed.sha256,
      fileSystem: parsed.fileSystem,
    };
    assertNativeIdentity(identity, "native lease identity");
    if (expectedStatus === "lease-ready") {
      if (typeof parsed.lockVolumeSerialNumber !== "string" || !/^[0-9]+$/u.test(parsed.lockVolumeSerialNumber)
          || typeof parsed.lockFileId !== "string" || !/^[0-9a-f]{32}$/u.test(parsed.lockFileId)) fail("G006B_PUBLISH_FAILED", "native lock identity");
      this.#lockIdentity = Object.freeze({ volumeSerialNumber: parsed.lockVolumeSerialNumber, fileId: parsed.lockFileId });
    }
    return identity;
  }

  async #ack(command: string, expectedStatus: string): Promise<Record<string, unknown>> {
    await this.writeCommand(command);
    const raw = await this.#readLine(expectedStatus);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail("G006B_PUBLISH_FAILED", `${expectedStatus} returned invalid JSON`); }
    if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).status !== expectedStatus) {
      fail("G006B_PUBLISH_FAILED", `${expectedStatus} status`);
    }
    return value as Record<string, unknown>;
  }

  private async writeCommand(command: string): Promise<void> {
    try {
      await bounded(new Promise<void>((resolveWrite, rejectWrite) => {
        this.#child.stdin.write(`${command}\n`, "utf8", (error) => error ? rejectWrite(error) : resolveWrite());
      }), "native lease command write");
    } catch (error) {
      if (this.#publicationEver) throw new SqliteG006bPublishedUnverifiedError(`publication broker transport: ${message(error)}`);
      fail("G006B_PUBLISH_FAILED", `publication broker transport: ${message(error)}`);
    }
  }

  private async command(command: "inspect" | "settle", expected: string): Promise<SqliteG006bNativeIdentity> {
    assertInternalPublisher();
    await this.writeCommand(command);
    const result = await this.#next(expected);
    assertInternalPublisher();
    return result;
  }

  public inspect(): Promise<SqliteG006bNativeIdentity> { return this.command("inspect", "lease-inspected"); }
  public settle(): Promise<SqliteG006bNativeIdentity> { return this.command("settle", "lease-settled"); }

  public async captureSidecars(databasePath: string): Promise<void> {
    if (this.#sidecarsCaptured) fail("G006B_PUBLISH_FAILED", "sidecars already captured by Node");
    await this.#ack(`sidecars-capture\t${databasePath}-wal\t${databasePath}-shm`, "sidecars-captured");
    this.#sidecarsCaptured = true;
  }

  public async inspectAndReleaseSidecars(): Promise<void> {
    if (!this.#sidecarsCaptured) fail("G006B_PUBLISH_FAILED", "sidecars are not captured by Node");
    await this.#ack("sidecars-inspect", "sidecars-inspected");
    await this.#ack("sidecars-release", "sidecars-released");
    this.#sidecarsCaptured = false;
  }

  public async releaseSidecarsIfCaptured(): Promise<void> {
    if (!this.#sidecarsCaptured) return;
    await this.#ack("sidecars-release", "sidecars-released");
    this.#sidecarsCaptured = false;
  }

  async #registeredResource(command: string): Promise<OwnedIdentity> {
    assertInternalPublisher();
    const record = await this.#ack(command, "resource-created");
    if (typeof record.volumeSerialNumber !== "string" || !/^[0-9]+$/u.test(record.volumeSerialNumber)
        || typeof record.fileId !== "string" || !/^[0-9a-f]{32}$/u.test(record.fileId)) fail("G006B_PUBLISH_FAILED", "resource create identity");
    assertInternalPublisher();
    return Object.freeze({ volumeSerialNumber: record.volumeSerialNumber, fileId: record.fileId });
  }

  public createResource(path: string, kind: "file" | "directory", disposition: "cleanup" | "release"): Promise<OwnedIdentity> {
    return this.#registeredResource(`resource-create-${kind}\t${path}\t${disposition}`);
  }

  public retainExistingDirectory(path: string): Promise<OwnedIdentity> {
    return this.#registeredResource(`resource-retain-directory\t${path}`);
  }

  public async inspectResource(path: string): Promise<SqliteG006bNativeIdentity> {
    await this.writeCommand(`resource-inspect\t${path}`);
    return this.#next("resource-inspected");
  }

  public async writeResource(path: string, bytes: Buffer): Promise<SqliteG006bNativeIdentity> {
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, Math.min(offset + 48 * 1024, bytes.length));
      const response = await this.#ack(`resource-write\t${path}\t${String(offset)}\t${chunk.toString("base64")}`, "resource-written");
      offset += chunk.length;
      if (response.bytes !== offset || response.path !== path) fail("G006B_PUBLISH_FAILED", "resource write acknowledgement drift");
    }
    await this.writeCommand(`resource-write-complete\t${path}\t${String(bytes.length)}\t${sha256Bytes(bytes)}`);
    return this.#next("resource-written");
  }

  public async flushResource(path: string): Promise<void> {
    await this.#ack(`resource-flush\t${path}`, "resource-flushed");
  }

  public async cleanupResource(path: string): Promise<void> {
    await this.#ack(`resource-cleanup\t${path}`, "resource-cleanup");
  }

  public async releaseResource(path: string): Promise<void> {
    await this.#ack(`resource-release\t${path}`, "resource-released");
  }

  async #reconcilePublication(error: unknown): Promise<never> {
    const pending = this.#pendingPublication!;
    await this.#terminate();
    let source: SqliteG006bNativeIdentity | undefined;
    let destination: SqliteG006bNativeIdentity | undefined;
    try { source = inspectNativeIfPresent(pending.source); } catch { /* unsafe source is handled as consumed/uncertain */ }
    try { destination = inspectNativeIfPresent(pending.destination); } catch { /* destination remains uncertain and preserved */ }
    const sourceExact = source?.volumeSerialNumber === pending.identity.volumeSerialNumber
      && source.fileId === pending.identity.fileId && source.size === pending.bytes && source.sha256 === pending.sha256;
    const priorPublication = this.#publicationEver;
    this.#pendingPublication = undefined;
    if (sourceExact && !priorPublication) throw error;
    this.#publicationEver = true;
    const detail = `${message(error)}; publication reconciliation source=${source ? `${source.volumeSerialNumber}/${source.fileId}/${String(source.size)}/${source.sha256}` : "absent-or-unsafe"} destination=${destination ? `${destination.volumeSerialNumber}/${destination.fileId}/${String(destination.size)}/${destination.sha256}` : "absent-or-unsafe"}`;
    throw new SqliteG006bPublishedUnverifiedError(detail, [], !sourceExact);
  }

  public async publishResource(path: string, destination: string, sha256: string, bytes: number, identity: OwnedIdentity): Promise<SqliteG006bNativeIdentity> {
    this.#pendingPublication = Object.freeze({ source: path, destination, sha256, bytes, identity });
    try {
      assertInternalPublisher();
      await this.writeCommand(`resource-publish\t${path}\t${destination}\t${sha256}\t${String(bytes)}`);
      const published = await this.#next("publication-ready");
      this.#publicationEver = true;
      await this.writeCommand("publication-inspect");
      const inspected = await this.#next("publication-inspected");
      if (!sameCanonical(published, inspected)) throw new SqliteG006bPublishedUnverifiedError("publication challenge identity drift", [], true);
      assertInternalPublisher();
      await this.writeCommand("publication-release");
      const released = await this.#next("publication-released");
      if (!sameCanonical(inspected, released)) throw new SqliteG006bPublishedUnverifiedError("publication release identity drift", [], true);
      assertInternalPublisher();
      this.#pendingPublication = undefined;
      return released;
    } catch (error) {
      return this.#reconcilePublication(error);
    }
  }

  async #cleanupLockFallback(): Promise<void> {
    if (!this.#lockIdentity) return;
    try { cleanupOwned(this.#lockPath, "file", this.#lockIdentity); } catch (error) {
      if (!existsSync(this.#lockPath)) return;
      throw error;
    }
  }

  public async release(): Promise<SqliteG006bNativeIdentity> {
    try {
      await this.writeCommand("release");
      this.#child.stdin.end();
      const identity = await this.#next("lease-released");
      const exitCode = await this.#waitForExit();
      this.#reader.close();
      assertInternalPublisher();
      if (exitCode !== 0) fail("G006B_PUBLISH_FAILED", this.#stderr.trim() || `native lease exit ${String(exitCode)}`);
      return identity;
    } catch (error) {
      await this.#terminate();
      try { await this.#cleanupLockFallback(); } catch (cleanupError) {
        const detail = `${message(error)}; lock cleanup: ${message(cleanupError)}`;
        if (error instanceof SqliteG006bPublishedUnverifiedError || this.#publicationEver) throw new SqliteG006bPublishedUnverifiedError(detail);
        fail("G006B_PUBLISH_FAILED", detail);
      }
      throw error;
    }
  }
}

function canonicalRow(columns: readonly string[], row: Record<string, unknown>): string {
  return JSON.stringify(columns.map((column) => [column, taggedValue(row[column])]));
}

function taggedValue(value: unknown): readonly [string, string] {
  if (value === null) return ["null", ""];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("G006B_EVIDENCE_DRIFT", "non-finite SQLite number");
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (typeof value === "bigint") return ["bigint", value.toString(10)];
  if (Buffer.isBuffer(value)) return ["blob", value.toString("base64")];
  return fail("G006B_EVIDENCE_DRIFT", `unsupported SQLite value ${typeof value}`);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function applicationTableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE BINARY").all() as Array<{ name: string }>).map((row) => row.name);
}

function capturePreservation(db: Database.Database, baseline?: PreservationEvidence): PreservationEvidence {
  const names = applicationTableNames(db);
  if (names.length !== 37 || names.length !== TABLE_NAMES.length || names.some((name, index) => name !== [...TABLE_NAMES].sort(compareCodeUnits)[index])) {
    fail("G006B_EVIDENCE_DRIFT", "application table set is not exact 37-table recovery set");
  }
  const baselineMap = new Map(baseline?.tables.map((table) => [table.name, table]));
  const tables = names.map((name): PreservationTable => {
    const available = (db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as Array<{ name: string }>).map((row) => row.name);
    const columns = baselineMap.get(name)?.columns ?? available;
    if (columns.some((column) => !available.includes(column))) fail("G006B_EVIDENCE_DRIFT", `${name} lost a baseline column`);
    const rows = db.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(name)}`).all() as Array<Record<string, unknown>>;
    const encodedRows = rows.map((row) => canonicalRow(columns, row)).sort(compareCodeUnits);
    const payloadSha256 = sha256Bytes(`${PRESERVATION_DOMAIN}TABLE\0${name}\0${JSON.stringify(encodedRows)}`);
    return Object.freeze({ name, columns: Object.freeze([...columns]), rowCount: rows.length, payloadSha256 });
  });
  const summaries = tables.map((table) => ({ name: table.name, columns: table.columns, rowCount: table.rowCount, payloadSha256: table.payloadSha256 }));
  const aggregateSha256 = hashSqliteG006bDomain(`${PRESERVATION_DOMAIN}AGGREGATE\0`, summaries);
  const transformSet = new Set<string>(SQLITE_SCHEMA_V1_TRANSFORM_TABLES);
  const transformAggregateSha256 = hashSqliteG006bDomain(`${PRESERVATION_DOMAIN}TRANSFORM\0`, summaries.filter((table) => transformSet.has(table.name)));
  const audit = tables.find((table) => table.name === "audit_logs");
  if (!audit) fail("G006B_EVIDENCE_DRIFT", "audit_logs preservation missing");
  return Object.freeze({
    algorithm: "novatrade-sqlite-type-tagged-rowset-sha256-v1",
    domain: PRESERVATION_DOMAIN,
    tables: Object.freeze(tables),
    aggregateSha256,
    transformAggregateSha256,
    audit,
    relationshipOrphanCount: relationshipOrphanCount(db),
  });
}

function relationshipOrphanCount(db: Database.Database): 0 {
  const pairs = [
    ["crawl_units", "crawl_runs", "crawl_run_id"], ["outreach_events", "leads", "lead_id"],
    ["admin_requests", "leads", "lead_id"], ["demos", "leads", "lead_id"],
    ["lead_notes", "leads", "lead_id"], ["ai_lead_verifications", "leads", "lead_id"],
    ["lead_ai_artifacts", "leads", "lead_id"],
  ] as const;
  let count = 0;
  for (const [child, parent, key] of pairs) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(child)} c LEFT JOIN ${quoteIdentifier(parent)} p ON p.id=c.${quoteIdentifier(key)} WHERE p.id IS NULL`).get() as { count: number | bigint };
    count += Number(row.count);
  }
  if (count !== 0) fail("G006B_EVIDENCE_DRIFT", `relationship orphan count ${count}`);
  return 0;
}

function samePreservation(left: PreservationEvidence, right: PreservationEvidence): boolean {
  return sameCanonical(left, right);
}

function receiptRow(db: Database.Database, manifest: CompatibilityBackfillManifest): Record<string, unknown> {
  const rows = db.prepare(`SELECT ${RECEIPT_ROW_COLUMNS.map(quoteIdentifier).join(", ")} FROM compatibility_backfill_receipts WHERE idempotency_key=?`).all(manifest.idempotencyKey) as Array<Record<string, unknown>>;
  if (rows.length !== 1) fail("G006B_EVIDENCE_DRIFT", "exact T028 receipt row missing or duplicated");
  return rows[0]!;
}

function receiptRowSha256(row: Record<string, unknown>): string {
  return sha256Bytes(`${RECEIPT_ROW_DOMAIN}${canonicalRow(RECEIPT_ROW_COLUMNS, row)}`);
}

function parseReceipt(row: Record<string, unknown>): CompatibilityBackfillReceipt {
  let parsed: unknown;
  try { parsed = JSON.parse(String(row.receipt_json)); } catch { return fail("G006B_EVIDENCE_DRIFT", "T028 receipt_json is invalid"); }
  exactKeys(parsed, RECEIPT_KEYS, "T028 receipt_json");
  const receipt = parsed as unknown as CompatibilityBackfillReceipt;
  assertReceiptRecursiveShape(receipt, "T028 receipt_json");
  if (receipt.status !== "completed" || receipt.schemaVersion !== 1 || receipt.sourceEngine !== "sqlite"
      || receipt.checksumAlgorithm !== "novatrade-sqlite-canonical-json-v1"
      || receipt.relationshipOrphanCount !== 0 || receipt.rollback !== "snapshot_restore_only"
      || receipt.activation !== "real activation requires approved compatibility identity and authorized rehearsal snapshot") {
    fail("G006B_EVIDENCE_DRIFT", "T028 fixed receipt literals");
  }
  return receipt;
}

function readonlyBackfillAdapter(db: Database.Database): SqliteBackfillDb {
  const adapter: SqliteBackfillDb = {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
    run: () => fail("G006B_EVIDENCE_DRIFT", "T028 replay attempted a mutation"),
    transaction: <T>(work: (tx: SqliteBackfillDb) => T) => work(adapter),
  };
  return adapter;
}

function verifyT028Pre(db: Database.Database, input: ValidatedInput): { receipt: CompatibilityBackfillReceipt; receiptRowSha256: string } {
  const manifestHash = compatibilityManifestHash(input.manifest);
  const expectedId = `compatibility-backfill-${manifestHash.slice(0, 24)}`;
  const row = receiptRow(db, input.manifest);
  const receipt = parseReceipt(row);
  if (receipt.receiptId !== expectedId || row.id !== expectedId || receipt.manifestHash !== manifestHash) fail("G006B_EVIDENCE_DRIFT", "T028 receipt identity");
  const rowHash = receiptRowSha256(row);
  if (rowHash !== input.expectedReceiptRowSha256) fail("G006B_EVIDENCE_DRIFT", "T028 receipt row hash");
  const replay = runSqliteCompatibilityBackfill(readonlyBackfillAdapter(db), input.manifest);
  if (!sameCanonical(replay, receipt)) fail("G006B_EVIDENCE_DRIFT", "T028 accepted replay differs from receipt_json");
  return { receipt, receiptRowSha256: rowHash };
}

function g023Evidence(input: Pick<ValidatedInput, "manifest" | "seed" | "expectedBindingId" | "expectedConfigurationHash">, receipt: CompatibilityBackfillReceipt): G023Evidence {
  const seedCanonicalJson = canonicalizeCompatibilityConfiguration(input.seed);
  const parsedSeed = parseLegacyWebsiteLeadPlayJson(seedCanonicalJson);
  if (!parsedSeed.ok) fail("G006B_EVIDENCE_DRIFT", `G023 seed ${parsedSeed.reasonCode}`);
  const accepted = bindLegacyWebsiteLeadPlay({
    tenantId: input.manifest.tenantId,
    workspaceId: input.manifest.workspaceId,
    manifest: input.manifest,
    receipt,
    seed: parsedSeed.seed,
  });
  if (!accepted.ok) fail("G006B_EVIDENCE_DRIFT", `G023 binding ${accepted.reasonCode}`);
  const bindingCanonicalJson = canonicalizeCompatibilityConfiguration(accepted.binding);
  if (accepted.binding.bindingId !== input.expectedBindingId
      || accepted.binding.configurationHash !== input.expectedConfigurationHash
      || parsedSeed.seed.configurationHash !== input.expectedConfigurationHash
      || parsedSeed.seed.source.connectorId !== SQLITE_G006B_SOURCE_CARD_ID
      || parsedSeed.seed.source.multiTenantLiveActivationState !== "blocked"
      || accepted.binding.playId !== LEGACY_WEBSITE_LEAD_PLAY_ID
      || accepted.binding.playVersion !== LEGACY_WEBSITE_LEAD_PLAY_VERSION
      || !accepted.binding.compatibilityOnly
      || accepted.binding.defaultForNewTenants) {
    fail("G006B_EVIDENCE_DRIFT", "G023 exact binding literals");
  }
  return Object.freeze({
    playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
    playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
    configurationHash: accepted.binding.configurationHash,
    bindingId: accepted.binding.bindingId,
    seedCanonicalJson,
    seedSha256: sha256Bytes(Buffer.from(seedCanonicalJson, "utf8")),
    bindingCanonicalJson,
    bindingSha256: sha256Bytes(Buffer.from(bindingCanonicalJson, "utf8")),
  });
}

function verifyG023Stored(input: ValidatedInput, value: unknown, receipt: CompatibilityBackfillReceipt): G023Evidence {
  exactKeys(value, ["playId", "playVersion", "configurationHash", "bindingId", "seedCanonicalJson", "seedSha256", "bindingCanonicalJson", "bindingSha256"], "g023");
  const stored = value as unknown as G023Evidence;
  if (typeof stored.seedCanonicalJson !== "string" || typeof stored.bindingCanonicalJson !== "string") fail("G006B_EVIDENCE_DRIFT", "G023 canonical JSON text");
  const seed = parseLegacyWebsiteLeadPlayJson(stored.seedCanonicalJson);
  if (!seed.ok || canonicalizeCompatibilityConfiguration(seed.seed) !== stored.seedCanonicalJson) fail("G006B_EVIDENCE_DRIFT", "stored G023 seed is noncanonical");
  let binding: unknown;
  try { binding = JSON.parse(stored.bindingCanonicalJson); } catch { return fail("G006B_EVIDENCE_DRIFT", "stored G023 binding JSON"); }
  if (canonicalizeCompatibilityConfiguration(binding) !== stored.bindingCanonicalJson) fail("G006B_EVIDENCE_DRIFT", "stored G023 binding is noncanonical");
  const rebound = bindLegacyWebsiteLeadPlay({ tenantId: input.manifest.tenantId, workspaceId: input.manifest.workspaceId, manifest: input.manifest, receipt, seed: seed.seed });
  if (!rebound.ok || canonicalizeCompatibilityConfiguration(rebound.binding) !== stored.bindingCanonicalJson) fail("G006B_EVIDENCE_DRIFT", "stored G023 binding replay");
  const expected = g023Evidence({ ...input, seed: seed.seed }, receipt);
  if (!sameCanonical(expected, stored)) fail("G006B_EVIDENCE_DRIFT", "stored G023 evidence mismatch");
  return stored;
}

function assertAcceptedState(db: Database.Database, expectedPhysical: string): ReturnType<typeof classifySqliteSchemaV1> {
  assertDatabaseConnectionBoundary(db);
  const state = classifySqliteSchemaV1(db);
  if (state.kind !== "accepted-legacy" || state.userVersion !== 0 || state.applicationTableCount !== 37 || state.targetColumnCount !== 27 || state.expectedTargetColumnCount !== 32) fail("G006B_STATE_REJECTED", `${state.kind}: ${state.reason}`);
  if (sqliteInternalCatalogDigest(db) !== SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST) fail("G006B_EVIDENCE_DRIFT", "accepted internal catalog");
  if (sqliteSchemaV1PhysicalManifestDigest(db) !== expectedPhysical) fail("G006B_EVIDENCE_DRIFT", "accepted physical manifest");
  assertSqliteSchemaV1DatabaseHealth(db);
  return state;
}

function assertPreparedState(db: Database.Database): ReturnType<typeof classifySqliteSchemaV1> {
  assertDatabaseConnectionBoundary(db);
  const state = classifySqliteSchemaV1(db);
  if (state.kind !== "prepared-legacy"
      || state.userVersion !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION
      || state.catalogDigest !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST
      || state.applicationTableCount !== 37 || state.targetColumnCount !== 31 || state.expectedTargetColumnCount !== 32
      || sqliteInternalCatalogDigest(db) !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST
      || sqliteSchemaV1PhysicalManifestDigest(db) !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST) {
    fail("G006B_STATE_REJECTED", `${state.kind}: ${state.reason}`);
  }
  assertSqliteSchemaV1DatabaseHealth(db);
  return state;
}

function assertDatabaseConnectionBoundary(db: Database.Database): "delete" | "wal" {
  const databases = db.pragma("database_list") as Array<{ name: string; file: string }>;
  if (databases.some((entry) => entry.name !== "main" && entry.name !== "temp")
      || databases.filter((entry) => entry.name === "main").length !== 1
      || databases.some((entry) => entry.name === "temp" && entry.file !== "")) {
    fail("G006B_STATE_REJECTED", "attached database boundary");
  }
  const tempObjects = db.prepare("SELECT COUNT(*) AS count FROM sqlite_temp_schema").get() as { count: number | bigint };
  if (Number(tempObjects.count) !== 0 || Number(db.pragma("writable_schema", { simple: true })) !== 0) fail("G006B_STATE_REJECTED", "temp or writable_schema boundary");
  const journalMode = String(db.pragma("journal_mode", { simple: true })).toLowerCase();
  const lockingMode = String(db.pragma("locking_mode", { simple: true })).toLowerCase();
  if ((journalMode !== "delete" && journalMode !== "wal") || lockingMode !== "normal") fail("G006B_STATE_REJECTED", `journal/locking mode ${journalMode}/${lockingMode}`);
  return journalMode;
}

function sourceCounts(db: Database.Database): readonly Record<string, CanonicalValue>[] {
  return SOURCE_TABLES.map((table) => {
    const row = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN source_card_id=? THEN 1 ELSE 0 END) AS matching, SUM(CASE WHEN source_card_id IS NULL THEN 1 ELSE 0 END) AS nulls, SUM(CASE WHEN source_card_id IS NOT NULL AND source_card_id<>? THEN 1 ELSE 0 END) AS other FROM ${quoteIdentifier(table)}`).get(SQLITE_G006B_SOURCE_CARD_ID, SQLITE_G006B_SOURCE_CARD_ID) as Record<string, number | bigint | null>;
    return {
      table,
      total: Number(row.total),
      matching: Number(row.matching ?? 0),
      nulls: Number(row.nulls ?? 0),
      other: Number(row.other ?? 0),
    };
  });
}

function healthEvidence(db: Database.Database): Record<string, CanonicalValue> {
  const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const foreignKeys = db.pragma("foreign_key_check") as Array<Record<string, unknown>>;
  return { integrityCheck: integrity.length === 1 ? integrity[0]!.integrity_check : "invalid", foreignKeyFailureCount: foreignKeys.length, orphanCount: relationshipOrphanCount(db) };
}

function databaseEvidence(path: string, native: SqliteG006bNativeIdentity, state: ReturnType<typeof classifySqliteSchemaV1>, physical: string, preservation: PreservationEvidence, manifest: CompatibilityBackfillManifest, dataVersion: number, journalMode: "delete" | "wal"): Record<string, CanonicalValue> {
  return {
    path,
    native: native as unknown as Record<string, CanonicalValue>,
    userVersion: state.userVersion,
    catalogDigest: state.catalogDigest,
    internalCatalogDigest: state.kind === "accepted-legacy" ? SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST : SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST,
    physicalManifestDigest: physical,
    applicationTableCount: state.applicationTableCount,
    targetColumnCount: state.targetColumnCount,
    expectedTargetColumnCount: state.expectedTargetColumnCount,
    tableIdentities: preservation.tables as unknown as readonly CanonicalValue[],
    sourceSnapshotFingerprint: manifest.sourceSnapshotFingerprint,
    dataVersion,
    journalMode,
  };
}

function expectedPostState(preservation: PreservationEvidence, counts: readonly Record<string, CanonicalValue>[], health: Record<string, CanonicalValue>): Record<string, CanonicalValue> {
  return {
    userVersion: SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION,
    catalogDigest: SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST,
    internalCatalogDigest: SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST,
    physicalManifestDigest: SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST,
    applicationTableCount: 37,
    targetColumnCount: 31,
    expectedTargetColumnCount: 32,
    tables: preservation.tables as unknown as readonly CanonicalValue[],
    sourceCounts: counts as unknown as readonly CanonicalValue[],
    integrityCheck: health.integrityCheck!,
    foreignKeyFailureCount: health.foreignKeyFailureCount!,
    orphanCount: health.orphanCount!,
  };
}

function mutationEvidence(): Record<string, CanonicalValue> {
  return {
    tables: SOURCE_TABLES.map((table) => ({ table, column: "source_card_id", declaration: "TEXT", nullable: true, populateOnlyNulls: true })),
    sourceCardId: SQLITE_G006B_SOURCE_CARD_ID,
    targetUserVersion: SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION,
  };
}

function createEnvelope(phase: "prepared" | "committed", payload: Record<string, unknown>): RecordEnvelope {
  const domain = phase === "prepared" ? SQLITE_G006B_PREPARED_DOMAIN : SQLITE_G006B_COMMITTED_DOMAIN;
  const recordSha256 = hashSqliteG006bDomain(domain, payload);
  return Object.freeze({
    format: SQLITE_G006B_RECORD_FORMAT,
    schemaVersion: SQLITE_G006B_RECORD_SCHEMA_VERSION,
    phase,
    handoffId: `g006b:v1:${recordSha256}`,
    recordSha256,
    payload,
  });
}

async function publishEnvelope(input: ValidatedInput, phase: "prepared" | "committed", payload: Record<string, unknown>, ledger: OwnershipLedger): Promise<RecordEnvelope> {
  const envelope = createEnvelope(phase, payload);
  const temporary = phase === "prepared" ? input.preparedTemporaryPath : input.committedTemporaryPath;
  const destination = phase === "prepared" ? input.preparedPath : input.committedPath;
  if (existsSync(temporary)) fail("G006B_PUBLISH_FAILED", `${phase} temp already exists`);
  await writeOwnedDurable(temporary, Buffer.from(canonicalizeSqliteG006bRecord(envelope), "utf8"), ledger);
  await publish(temporary, destination, ledger);
  return readEnvelope(destination, phase);
}

function readEnvelope(path: string, phase: "prepared" | "committed"): RecordEnvelope {
  const raw = readFileSync(path);
  if (raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) fail("G006B_EVIDENCE_DRIFT", `${phase} BOM`);
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) fail("G006B_EVIDENCE_DRIFT", `${phase} invalid UTF-8`);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail("G006B_EVIDENCE_DRIFT", `${phase} invalid JSON`); }
  if (canonicalizeSqliteG006bRecord(parsed) !== text) fail("G006B_EVIDENCE_DRIFT", `${phase} JSON is not exact canonical bytes`);
  exactKeys(parsed, ["format", "schemaVersion", "phase", "handoffId", "recordSha256", "payload"], `${phase} envelope`);
  const envelope = parsed as unknown as RecordEnvelope;
  if (envelope.format !== SQLITE_G006B_RECORD_FORMAT || envelope.schemaVersion !== 1 || envelope.phase !== phase) fail("G006B_EVIDENCE_DRIFT", `${phase} envelope literals`);
  const expected = createEnvelope(phase, envelope.payload);
  if (expected.recordSha256 !== envelope.recordSha256 || expected.handoffId !== envelope.handoffId) fail("G006B_EVIDENCE_DRIFT", `${phase} envelope hash`);
  return envelope;
}

function archiveEntries(directory: string): readonly Record<string, CanonicalValue>[] {
  const expected = [...TABLE_NAMES.map((table: string) => `${table}.json`), "manifest.json"].sort(compareCodeUnits);
  const actual = readdirSync(directory).sort(compareCodeUnits);
  if (actual.length !== 38 || actual.some((name, index) => name !== expected[index])) fail("G006B_EVIDENCE_DRIFT", "archive must contain exactly 37 table files and manifest");
  return actual.map((name) => {
    const path = join(directory, name);
    const stat = statSync(path);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size)) fail("G006B_EVIDENCE_DRIFT", `archive entry ${name}`);
    return { name, size: stat.size, sha256: sha256Bytes(readFileSync(path)) };
  });
}

function archiveTreeHash(entries: readonly Record<string, CanonicalValue>[]): string {
  return hashSqliteG006bDomain(ARCHIVE_DOMAIN, entries);
}

export function computeSqliteG006bArchiveTreeHash(directory: string): string {
  const canonical = realpathSync.native(directory);
  if (canonical !== directory || !statSync(directory).isDirectory()) fail("G006B_INPUT_REJECTED", "archive tree directory path");
  return archiveTreeHash(archiveEntries(directory));
}

function verifyArchive(input: ValidatedInput, archive: Record<string, unknown>): void {
  exactKeys(archive, ["path", "schemaVersion", "manifestSha256", "entries", "treeHash"], "archive evidence");
  if (archive.path !== input.archiveDirectory || archive.schemaVersion !== 3) fail("G006B_EVIDENCE_DRIFT", "archive path/schema");
  try {
    validateDataExportDirectory(input.archiveDirectory);
  } catch (error) {
    fail("G006B_EVIDENCE_DRIFT", `archive contract: ${message(error)}`);
  }
  for (const expected of buildSchema3Export(input.backupPath)) {
    if (!readFileSync(join(input.archiveDirectory, expected.name)).equals(expected.bytes)) {
      fail("G006B_EVIDENCE_DRIFT", `archive entry ${expected.name} differs from pinned backup export`);
    }
  }
  const entries = archiveEntries(input.archiveDirectory);
  const treeHash = archiveTreeHash(entries);
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (treeHash !== archive.treeHash || basename(input.archiveDirectory) !== treeHash || manifestEntry?.sha256 !== archive.manifestSha256 || !sameCanonical(entries, archive.entries)) fail("G006B_EVIDENCE_DRIFT", "archive identity");
}

async function makeBackupAndArchive(
  input: ValidatedInput,
  prePreservation: PreservationEvidence,
  writer: Database.Database,
  lease: NativeDatabaseLease,
  ledger: OwnershipLedger,
): Promise<{ backup: Record<string, CanonicalValue>; archive: Record<string, CanonicalValue> }> {
  if (existsSync(input.backupTemporaryPath) || existsSync(input.archiveStagingDirectory)) fail("G006B_PUBLISH_FAILED", "backup/archive staging residue exists");
  assertAcceptedState(writer, input.expectedAcceptedPhysicalManifestDigest);
  const lockedNative = await lease.inspect();
  if (lockedNative.fileId !== input.expectedSourceIdentity.fileId || lockedNative.volumeSerialNumber !== input.expectedSourceIdentity.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "source file identity under backup lock");
  const serializedBackup = writer.serialize();
  await writeOwnedDurable(input.backupTemporaryPath, serializedBackup, ledger);
  const backupIdentity = await publish(input.backupTemporaryPath, input.backupPath, ledger);
  const backupDb = new Database(input.backupPath, { readonly: true, fileMustExist: true });
  backupDb.pragma("foreign_keys = ON");
  let primary: unknown;
  let output: { backup: Record<string, CanonicalValue>; archive: Record<string, CanonicalValue> } | undefined;
  const cleanup: string[] = [];
  try {
    const state = assertAcceptedState(backupDb, input.expectedAcceptedPhysicalManifestDigest);
    const preservation = capturePreservation(backupDb);
    if (!samePreservation(prePreservation, preservation)) fail("G006B_EVIDENCE_DRIFT", "backup rowsets differ from source");
    verifyT028Pre(backupDb, input);
    await ledger.create(input.archiveStagingDirectory, "directory");
    await exportSchema3IntoOwnedDirectory(input.backupPath, input.archiveStagingDirectory, ledger);
    validateDataExportDirectory(input.archiveStagingDirectory);
    const stagedEntries = archiveEntries(input.archiveStagingDirectory);
    const treeHash = archiveTreeHash(stagedEntries);
    if (basename(input.archiveDirectory) !== treeHash) fail("G006B_INPUT_REJECTED", "archiveDirectory must end in exact content tree hash");
    if (!existsSync(input.archiveDirectory)) await ledger.create(input.archiveDirectory, "directory", "release");
    else await ledger.retainExistingDirectory(input.archiveDirectory);
    const existing = readdirSync(input.archiveDirectory);
    if (existing.some((name) => !stagedEntries.some((entry) => entry.name === name))) fail("G006B_EVIDENCE_DRIFT", "unexpected existing archive entry");
    for (const entry of stagedEntries) {
      const destination = join(input.archiveDirectory, String(entry.name));
      const temporary = `${destination}.g006b.tmp.${input.privateToken}`;
      await writeOwnedDurable(temporary, readFileSync(join(input.archiveStagingDirectory, String(entry.name))), ledger);
      await publish(temporary, destination, ledger);
    }
    await ledger.flushDirectory(input.archiveDirectory);
    validateDataExportDirectory(input.archiveDirectory);
    const finalEntries = archiveEntries(input.archiveDirectory);
    if (!sameCanonical(finalEntries, stagedEntries)) fail("G006B_EVIDENCE_DRIFT", "published archive differs from staging");
    await ledger.releasePersistent(input.archiveDirectory);
    const manifestEntry = finalEntries.find((entry) => entry.name === "manifest.json")!;
    const backup = {
      path: input.backupPath,
      native: backupIdentity as unknown as Record<string, CanonicalValue>,
      userVersion: state.userVersion,
      catalogDigest: state.catalogDigest,
      internalCatalogDigest: SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST,
      physicalManifestDigest: input.expectedAcceptedPhysicalManifestDigest,
      rowsets: preservation.tables as unknown as readonly CanonicalValue[],
    };
    const archive = {
      path: input.archiveDirectory,
      schemaVersion: 3,
      manifestSha256: manifestEntry.sha256,
      entries: finalEntries,
      treeHash,
    };
    output = { backup, archive };
  } catch (error) {
    primary = error;
  } finally {
    try { backupDb.close(); } catch (error) { cleanup.push(`backup close: ${message(error)}`); }
  }
  if (primary instanceof SqliteG006bError) throw new SqliteG006bError(primary.code, message(primary), [...primary.cleanupFailures, ...cleanup]);
  if (primary !== undefined) throw new SqliteG006bError("G006B_PUBLISH_FAILED", message(primary), cleanup);
  if (cleanup.length !== 0) throw new SqliteG006bError("G006B_PUBLISH_FAILED", "artifact cleanup failed", cleanup);
  return output!;
}

function verifyBackup(input: ValidatedInput, value: Record<string, unknown>, preservation: PreservationEvidence): void {
  exactKeys(value, ["path", "native", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest", "rowsets"], "backup evidence");
  if (value.path !== input.backupPath) fail("G006B_EVIDENCE_DRIFT", "backup path");
  const native = inspectNative(input.backupPath);
  if (!sameCanonical(native, value.native)) fail("G006B_EVIDENCE_DRIFT", "backup native identity");
  const db = new Database(input.backupPath, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  try {
    assertAcceptedState(db, input.expectedAcceptedPhysicalManifestDigest);
    const actual = capturePreservation(db);
    if (!samePreservation(actual, preservation) || !sameCanonical(actual.tables, value.rowsets)) fail("G006B_EVIDENCE_DRIFT", "backup rowsets");
    verifyT028Pre(db, input);
  } finally { db.close(); }
}

function verifyPostT028(db: Database.Database, input: ValidatedInput, receipt: CompatibilityBackfillReceipt): void {
  const row = receiptRow(db, input.manifest);
  if (receiptRowSha256(row) !== input.expectedReceiptRowSha256 || !sameCanonical(parseReceipt(row), receipt)) fail("G006B_EVIDENCE_DRIFT", "post T028 receipt row");
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const columns = (db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((entry) => entry.name).filter((column) => column !== "source_card_id");
    const rows = db.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    const expectation = input.manifest.legacyTables.find((entry) => entry.table === table);
    const checksum = compatibilityContentChecksum(rows);
    if (!expectation || rows.length !== expectation.rowCount || rows.length !== receipt.tableCounts[table]
        || checksum !== expectation.contentChecksum || checksum !== receipt.beforeContentChecksums[table]
        || checksum !== receipt.afterContentChecksums[table]) fail("G006B_EVIDENCE_DRIFT", `post T028 projection ${table}`);
    if (table === "audit_logs") {
      if (rows.some((entry) => entry.scope_kind !== "legacy_unscoped" || entry.tenant_id !== null || entry.workspace_id !== null)) fail("G006B_EVIDENCE_DRIFT", "audit scope");
    } else if (COMPATIBILITY_WORKSPACE_TABLES.has(table)) {
      if (rows.some((entry) => entry.tenant_id !== input.manifest.tenantId || entry.workspace_id !== input.manifest.workspaceId)) fail("G006B_EVIDENCE_DRIFT", `${table} scope`);
    } else if (rows.some((entry) => entry.tenant_id !== input.manifest.tenantId)) fail("G006B_EVIDENCE_DRIFT", `${table} scope`);
  }
}

function assertNoWalFrames(databasePath: string): void {
  const walPath = `${databasePath}-wal`;
  const wal = inspectSidecarIfPresent(walPath);
  if (wal && wal.size !== 0) fail("G006B_RECOVERY_REQUIRED", `nonzero WAL remains (${String(wal.size)} bytes)`);
  const shmPath = `${databasePath}-shm`;
  inspectSidecarIfPresent(shmPath);
}

async function verifyPostDatabase(
  input: ValidatedInput,
  preparedPayload: Record<string, unknown>,
  receipt: CompatibilityBackfillReceipt,
  lease: NativeDatabaseLease,
  settledNative: SqliteG006bNativeIdentity,
): Promise<{ database: Record<string, CanonicalValue>; verification: Record<string, unknown> }> {
  const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  let result: { state: ReturnType<typeof classifySqliteSchemaV1>; preservation: PreservationEvidence; counts: readonly Record<string, CanonicalValue>[]; health: Record<string, CanonicalValue>; storedG023: G023Evidence; dataVersion: number; journalMode: "delete" | "wal" };
  try {
    db.exec("BEGIN");
    const dataVersion = Number(db.pragma("data_version", { simple: true }));
    const journalMode = assertDatabaseConnectionBoundary(db);
    const state = assertPreparedState(db);
    const baseline = preparedPayload.preservation as unknown as PreservationEvidence;
    const preservation = capturePreservation(db, baseline);
    if (!samePreservation(baseline, preservation)) fail("G006B_EVIDENCE_DRIFT", "post full-row preservation");
    const counts = sourceCounts(db);
    if (counts.some((count) => count.matching !== count.total || count.nulls !== 0 || count.other !== 0)) fail("G006B_EVIDENCE_DRIFT", "source binding counts");
    verifyPostT028(db, input, receipt);
    const storedG023 = verifyG023Stored(input, preparedPayload.g023, receipt);
    const health = healthEvidence(db);
    const afterDataVersion = Number(db.pragma("data_version", { simple: true }));
    if (dataVersion !== afterDataVersion) fail("G006B_EVIDENCE_DRIFT", "post verification data_version changed");
    result = { state, preservation, counts, health, storedG023, dataVersion, journalMode };
    db.exec("COMMIT");
  } catch (error) {
    if (db.open && db.inTransaction) { try { db.exec("ROLLBACK"); } catch { /* primary is preserved */ } }
    throw error;
  } finally { db.close(); }
  await lease.inspectAndReleaseSidecars();
  const native = await lease.inspect();
  if (!sameCanonical(native, settledNative)) fail("G006B_EVIDENCE_DRIFT", "post snapshot changed settled main bytes");
  const preparedDatabase = preparedPayload.database as Record<string, unknown>;
  const expectedNative = preparedDatabase.native as SqliteG006bNativeIdentity;
  if (native.fileId !== expectedNative.fileId || native.volumeSerialNumber !== expectedNative.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "post database file identity");
  if (result.journalMode !== input.expectedJournalMode || result.journalMode !== preparedDatabase.journalMode) {
    fail("G006B_EVIDENCE_DRIFT", "post journal mode differs from input/PREPARED pin");
  }
  const database = databaseEvidence(input.databasePath, native, result.state, SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST, result.preservation, input.manifest, result.dataVersion, result.journalMode);
  const verification = {
    state: expectedPostState(result.preservation, result.counts, result.health),
    preservation: result.preservation,
    audit: result.preservation.audit,
    receiptRowSha256: input.expectedReceiptRowSha256,
    manifestHash: compatibilityManifestHash(input.manifest),
    foundation: { tenantId: input.manifest.tenantId, workspaceId: input.manifest.workspaceId, ownerAuthIdentityId: input.manifest.ownerAuthIdentityId, policyId: input.manifest.policyId, policyVersion: input.manifest.policyVersion, status: "exact" },
    source: { cardId: SQLITE_G006B_SOURCE_CARD_ID, counts: result.counts },
    g023: { bindingId: result.storedG023.bindingId, configurationHash: result.storedG023.configurationHash, bindingSha256: result.storedG023.bindingSha256 },
    health: result.health,
    relationshipOrphanCount: 0,
  };
  return { database, verification };
}

async function applyMutation(input: ValidatedInput, preparedPayload: Record<string, unknown>, db: Database.Database, lease: NativeDatabaseLease): Promise<void> {
  assertAcceptedState(db, input.expectedAcceptedPhysicalManifestDigest);
  const baseline = preparedPayload.preservation as unknown as PreservationEvidence;
  if (!samePreservation(baseline, capturePreservation(db))) fail("G006B_EVIDENCE_DRIFT", "pre-mutation preservation drift");
  const beforeDdl = await lease.inspect();
  if (beforeDdl.fileId !== input.expectedSourceIdentity.fileId || beforeDdl.volumeSerialNumber !== input.expectedSourceIdentity.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "database FileId changed before DDL");
  for (const table of SOURCE_TABLES) {
    const columns = (db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((row) => row.name);
    if (columns.includes("source_card_id")) fail("G006B_STATE_REJECTED", `${table}.source_card_id already present in pre-state`);
    db.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN source_card_id TEXT`);
    const result = db.prepare(`UPDATE ${quoteIdentifier(table)} SET source_card_id=? WHERE source_card_id IS NULL`).run(SQLITE_G006B_SOURCE_CARD_ID);
    const count = Number((db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number | bigint }).count);
    if (Number(result.changes) !== count) fail("G006B_EVIDENCE_DRIFT", `${table} source backfill changes`);
  }
  db.pragma(`user_version = ${SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION}`);
  assertPreparedState(db);
  const projected = capturePreservation(db, baseline);
  if (!samePreservation(baseline, projected)) fail("G006B_EVIDENCE_DRIFT", "in-transaction preservation");
  const counts = sourceCounts(db);
  if (counts.some((count) => count.matching !== count.total || count.nulls !== 0 || count.other !== 0)) fail("G006B_EVIDENCE_DRIFT", "in-transaction source counts");
  const beforeCommit = await lease.inspect();
  if (beforeCommit.fileId !== beforeDdl.fileId || beforeCommit.volumeSerialNumber !== beforeDdl.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "database FileId changed before COMMIT");
}

function assertPreparedPayload(input: ValidatedInput, payload: Record<string, unknown>): { receipt: CompatibilityBackfillReceipt; g023: G023Evidence } {
  exactKeys(payload, ["operationId", "basis", "source", "database", "t028", "g023", "backup", "archive", "preservation", "mutation", "expectedPostState"], "prepared payload");
  if (payload.operationId !== input.operationId || !sameCanonical(payload.basis, { kind: "legacy-t028" }) || !sameCanonical(payload.source, { cardId: SQLITE_G006B_SOURCE_CARD_ID, authority: "identity-only", grantsProviderExecution: false }) || !sameCanonical(payload.mutation, mutationEvidence())) fail("G006B_EVIDENCE_DRIFT", "prepared fixed binding");
  exactKeys(payload.database, ["path", "native", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest", "applicationTableCount", "targetColumnCount", "expectedTargetColumnCount", "tableIdentities", "sourceSnapshotFingerprint", "dataVersion", "journalMode"], "prepared database");
  const database = payload.database as Record<string, unknown>;
  if (database.path !== input.databasePath || !sameCanonical(database.native, input.expectedSourceIdentity)
      || database.userVersion !== 0 || database.catalogDigest !== ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST
      || database.internalCatalogDigest !== SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST
      || database.physicalManifestDigest !== input.expectedAcceptedPhysicalManifestDigest
      || database.applicationTableCount !== 37 || database.targetColumnCount !== 27 || database.expectedTargetColumnCount !== 32
      || database.sourceSnapshotFingerprint !== input.manifest.sourceSnapshotFingerprint
      || database.journalMode !== input.expectedJournalMode
      || !Number.isSafeInteger(database.dataVersion)) fail("G006B_EVIDENCE_DRIFT", "prepared database evidence");
  exactKeys(payload.t028, ["manifest", "manifestHash", "receipt", "receiptRowSha256"], "prepared t028");
  const t028 = payload.t028 as Record<string, unknown>;
  if (!sameCanonical(t028.manifest, input.manifest) || t028.manifestHash !== compatibilityManifestHash(input.manifest) || t028.receiptRowSha256 !== input.expectedReceiptRowSha256) fail("G006B_EVIDENCE_DRIFT", "prepared T028 evidence");
  exactKeys(t028.receipt, RECEIPT_KEYS, "prepared receipt");
  const receipt = t028.receipt as unknown as CompatibilityBackfillReceipt;
  const g023 = verifyG023Stored(input, payload.g023, receipt);
  const preservation = payload.preservation as unknown as PreservationEvidence;
  if (preservation.aggregateSha256 !== input.expectedPreservationAggregateSha256) fail("G006B_EVIDENCE_DRIFT", "prepared preservation pin");
  if (!sameCanonical(database.tableIdentities, preservation.tables)) fail("G006B_EVIDENCE_DRIFT", "prepared database table identities");
  verifyBackup(input, payload.backup as Record<string, unknown>, preservation);
  const backupDb = new Database(input.backupPath, { readonly: true, fileMustExist: true });
  try {
    const backupReceipt = parseReceipt(receiptRow(backupDb, input.manifest));
    if (!sameCanonical(backupReceipt, receipt)) fail("G006B_EVIDENCE_DRIFT", "prepared receipt differs from verified backup");
  } finally { backupDb.close(); }
  verifyArchive(input, payload.archive as Record<string, unknown>);
  const expectedCounts = SOURCE_TABLES.map((table) => {
    const rowCount = preservation.tables.find((entry) => entry.name === table)?.rowCount;
    if (rowCount === undefined) fail("G006B_EVIDENCE_DRIFT", `${table} missing from preservation`);
    return { table, total: rowCount, matching: rowCount, nulls: 0, other: 0 };
  });
  const expected = expectedPostState(preservation, expectedCounts, { integrityCheck: "ok", foreignKeyFailureCount: 0, orphanCount: 0 });
  if (!sameCanonical(payload.expectedPostState, expected)) fail("G006B_EVIDENCE_DRIFT", "prepared expected post-state");
  return { receipt, g023 };
}

function message(error: unknown): string {
  const value = error instanceof SqliteG006bError ? error.detail : error instanceof Error ? error.message : String(error);
  return value.replace(/^(?:G006B_[A-Z0-9_]+:\s*)+/u, "");
}

export async function inspectSqliteG006bPreFinalizationEvidence(input: SqliteG006bInspectionInput): Promise<SqliteG006bInspectionResult> {
  exactKeys(input, ["databasePath", "manifest", "seed"], "inspection input");
  canonicalExistingFile(input.databasePath, "inspection databasePath");
  validateEmbeddedJsonValue(input.manifest, "inspection manifest");
  exactKeys(input.manifest, MANIFEST_KEYS, "inspection manifest");
  assertManifestRecursiveShape(input.manifest, "inspection manifest");
  validateEmbeddedJsonValue(input.seed, "inspection seed");
  const snapshot = deepFreeze({
    databasePath: input.databasePath,
    manifest: jsonSnapshot(input.manifest),
    seed: jsonSnapshot(input.seed),
  });
  assertInternalPublisher();
  const acquired = await NativeDatabaseLease.acquire(snapshot.databasePath, `${snapshot.databasePath}.g006b.lock`);
  let db: Database.Database | undefined;
  let result: SqliteG006bInspectionResult | undefined;
  let primary: unknown;
  const cleanup: string[] = [];
  try {
    assertNoWalFrames(snapshot.databasePath);
    db = new Database(snapshot.databasePath, { fileMustExist: true });
    db.pragma("foreign_keys = ON");
    db.exec("BEGIN IMMEDIATE");
    assertNoWalFrames(snapshot.databasePath);
    const journalMode = assertDatabaseConnectionBoundary(db);
    const dataVersion = Number(db.pragma("data_version", { simple: true }));
    const physical = sqliteSchemaV1PhysicalManifestDigest(db);
    assertAcceptedState(db, physical);
    const preservation = capturePreservation(db);
    const row = receiptRow(db, snapshot.manifest);
    const receipt = parseReceipt(row);
    const manifestHash = compatibilityManifestHash(snapshot.manifest);
    const replay = runSqliteCompatibilityBackfill(readonlyBackfillAdapter(db), snapshot.manifest);
    if (!sameCanonical(replay, receipt)) fail("G006B_EVIDENCE_DRIFT", "inspection T028 replay");
    const seedCanonicalJson = canonicalizeCompatibilityConfiguration(snapshot.seed);
    const parsedSeed = parseLegacyWebsiteLeadPlayJson(seedCanonicalJson);
    if (!parsedSeed.ok) fail("G006B_EVIDENCE_DRIFT", `inspection G023 seed ${parsedSeed.reasonCode}`);
    const binding = bindLegacyWebsiteLeadPlay({
      tenantId: snapshot.manifest.tenantId,
      workspaceId: snapshot.manifest.workspaceId,
      manifest: snapshot.manifest,
      receipt,
      seed: parsedSeed.seed,
    });
    if (!binding.ok || receipt.receiptId !== `compatibility-backfill-${manifestHash.slice(0, 24)}`) fail("G006B_EVIDENCE_DRIFT", "inspection G023/T028 binding");
    if (Number(db.pragma("data_version", { simple: true })) !== dataVersion) fail("G006B_EVIDENCE_DRIFT", "inspection data_version changed");
    db.exec("ROLLBACK");
    db.close();
    db = undefined;
    const sourceIdentity = await acquired.lease.settle();
    await acquired.lease.captureSidecars(snapshot.databasePath);
    await acquired.lease.inspectAndReleaseSidecars();
    if (!sameCanonical(sourceIdentity, acquired.identity)) fail("G006B_EVIDENCE_DRIFT", "inspection main bytes changed across snapshot close");
    result = deepFreeze({
      sourceIdentity,
      acceptedPhysicalManifestDigest: physical,
      receiptRowSha256: receiptRowSha256(row),
      bindingId: binding.binding.bindingId,
      configurationHash: binding.binding.configurationHash,
      preservationAggregateSha256: preservation.aggregateSha256,
      journalMode,
    });
  } catch (error) {
    primary = error;
  } finally {
    if (db?.open && db.inTransaction) { try { db.exec("ROLLBACK"); } catch (error) { cleanup.push(`inspection rollback: ${message(error)}`); } }
    if (db?.open) { try { db.close(); } catch (error) { cleanup.push(`inspection close: ${message(error)}`); } }
    try { await acquired.lease.releaseSidecarsIfCaptured(); } catch (error) { cleanup.push(`inspection sidecar release: ${message(error)}`); }
    try { await acquired.lease.release(); } catch (error) { cleanup.push(`inspection lease release: ${message(error)}`); }
  }
  if (!primary && cleanup.length === 0 && result) return result;
  if (primary instanceof SqliteG006bError) throw new SqliteG006bError(primary.code, message(primary), [...primary.cleanupFailures, ...cleanup]);
  throw new SqliteG006bError("G006B_STATE_REJECTED", message(primary ?? "inspection cleanup failed"), cleanup);
}

export async function runSqliteG006bPreFinalization(rawInput: SqliteG006bPreFinalizationInput): Promise<SqliteG006bPreFinalizationResult> {
  const input = validateInput(rawInput);
  const cleanup: string[] = [];
  let primary: unknown;
  let lease: NativeDatabaseLease | undefined;
  let writer: Database.Database | undefined;
  let commitInvoked = false;
  let result: SqliteG006bPreFinalizationResult | undefined;
  let commitError: unknown;
  let cleanupPublishedUnverified: SqliteG006bPublishedUnverifiedError | undefined;
  let ledger: OwnershipLedger | undefined;
  try {
    const acquired = await NativeDatabaseLease.acquire(input.databasePath, input.lockPath);
    lease = acquired.lease;
    ledger = new OwnershipLedger(lease);
    if (acquired.identity.fileId !== input.expectedSourceIdentity.fileId
        || acquired.identity.volumeSerialNumber !== input.expectedSourceIdentity.volumeSerialNumber
        || (input.mode === "execute" && !sameCanonical(acquired.identity, input.expectedSourceIdentity))) {
      fail("G006B_EVIDENCE_DRIFT", "source native identity at lease acquisition");
    }
    let prepared: RecordEnvelope;
    let receipt: CompatibilityBackfillReceipt;
    const preparedExists = existsSync(input.preparedPath);
    const committedExists = existsSync(input.committedPath);
    if (input.mode === "execute" && (preparedExists || committedExists)) fail("G006B_STATE_REJECTED", "execute requires absent handoff records");
    if (input.mode === "resume" && (!preparedExists || committedExists)) fail("G006B_PREPARED_RECORD_REQUIRED", "resume requires PREPARED and absent COMMITTED");
    if (input.mode === "replay" && (!preparedExists || !committedExists)) fail("G006B_RECOVERY_REQUIRED", "replay requires PREPARED and COMMITTED");

    if (input.mode === "replay") {
      prepared = readEnvelope(input.preparedPath, "prepared");
      if (prepared.handoffId !== input.expectedPreparedHandoffId) fail("G006B_RECOVERY_REQUIRED", "prepared handoff pin");
      ({ receipt } = assertPreparedPayload(input, prepared.payload));
      const committed = readEnvelope(input.committedPath, "committed");
      if (committed.handoffId !== input.expectedCommittedHandoffId) fail("G006B_RECOVERY_REQUIRED", "committed handoff pin");
      exactKeys(committed.payload, ["operationId", "preparedHandoffId", "preparedRecordSha256", "bindingHash", "database", "verification"], "committed payload");
      if (committed.payload.operationId !== input.operationId || committed.payload.preparedHandoffId !== prepared.handoffId || committed.payload.preparedRecordSha256 !== prepared.recordSha256) fail("G006B_RECOVERY_REQUIRED", "committed/prepared link");
      const settled = await lease.settle();
      await lease.captureSidecars(input.databasePath);
      const verified = await verifyPostDatabase(input, prepared.payload, receipt, lease, settled);
      if (!sameCanonical(committed.payload.database, verified.database) || !sameCanonical(committed.payload.verification, verified.verification)) fail("G006B_RECOVERY_REQUIRED", "committed record differs from reopened post-state");
      const bindingHash = hashSqliteG006bDomain(SQLITE_G006B_BINDING_DOMAIN, prepared.payload);
      if (committed.payload.bindingHash !== bindingHash) fail("G006B_RECOVERY_REQUIRED", "committed binding hash");
      result = deepFreeze({ mode: "replay", status: "replayed", preparedHandoffId: prepared.handoffId, committedHandoffId: committed.handoffId, bindingHash });
    } else if (input.mode === "resume") {
      prepared = readEnvelope(input.preparedPath, "prepared");
      if (prepared.handoffId !== input.expectedPreparedHandoffId) fail("G006B_RECOVERY_REQUIRED", "prepared handoff pin");
      ({ receipt } = assertPreparedPayload(input, prepared.payload));
    } else {
      prepared = undefined as never;
      receipt = undefined as never;
    }

    if (input.mode !== "replay") {
      writer = new Database(input.databasePath, { fileMustExist: true });
      writer.pragma("foreign_keys = ON");
      writer.exec("BEGIN IMMEDIATE");
      assertNoWalFrames(input.databasePath);
      const journalMode = assertDatabaseConnectionBoundary(writer);
      if (journalMode !== input.expectedJournalMode) fail("G006B_EVIDENCE_DRIFT", `journal mode pin ${journalMode}/${input.expectedJournalMode}`);
      let kind = classifySqliteSchemaV1(writer).kind;
      if (input.mode === "execute") {
        const state = assertAcceptedState(writer, input.expectedAcceptedPhysicalManifestDigest);
        const preservation = capturePreservation(writer);
        if (preservation.aggregateSha256 !== input.expectedPreservationAggregateSha256) fail("G006B_EVIDENCE_DRIFT", "source preservation pin");
        const evidence = verifyT028Pre(writer, input);
        const g023 = g023Evidence(input, evidence.receipt);
        const database = databaseEvidence(input.databasePath, input.expectedSourceIdentity, state, input.expectedAcceptedPhysicalManifestDigest, preservation, input.manifest, Number(writer.pragma("data_version", { simple: true })), journalMode);
        const artifacts = await makeBackupAndArchive(input, preservation, writer, lease, ledger);
        const liveNative = await lease.inspect();
        if (liveNative.fileId !== input.expectedSourceIdentity.fileId || liveNative.volumeSerialNumber !== input.expectedSourceIdentity.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "live source FileId changed after backup/archive");
        if (!samePreservation(preservation, capturePreservation(writer))) fail("G006B_EVIDENCE_DRIFT", "live source changed after backup/archive");
        verifyT028Pre(writer, input);
        const zeroSourceCounts = SOURCE_TABLES.map((table) => ({ table, total: preservation.tables.find((entry) => entry.name === table)!.rowCount, matching: preservation.tables.find((entry) => entry.name === table)!.rowCount, nulls: 0, other: 0 }));
        const preparedPayload = {
          operationId: input.operationId,
          basis: { kind: "legacy-t028" },
          source: { cardId: SQLITE_G006B_SOURCE_CARD_ID, authority: "identity-only", grantsProviderExecution: false },
          database,
          t028: { manifest: input.manifest, manifestHash: compatibilityManifestHash(input.manifest), receipt: evidence.receipt, receiptRowSha256: evidence.receiptRowSha256 },
          g023,
          backup: artifacts.backup,
          archive: artifacts.archive,
          preservation,
          mutation: mutationEvidence(),
          expectedPostState: expectedPostState(preservation, zeroSourceCounts, { integrityCheck: "ok", foreignKeyFailureCount: 0, orphanCount: 0 }),
        };
        prepared = await publishEnvelope(input, "prepared", preparedPayload, ledger);
        receipt = evidence.receipt;
        kind = "accepted-legacy";
      }

      if (kind === "accepted-legacy") {
        await applyMutation(input, prepared.payload, writer, lease);
        commitInvoked = true;
        try { writer.exec("COMMIT"); } catch (error) { commitError = error; }
      } else if (kind === "prepared-legacy") {
        commitInvoked = true;
        writer.exec("ROLLBACK");
      } else {
        fail("G006B_RECOVERY_REQUIRED", `prepared record with ambiguous database state ${kind}`);
      }
      writer.close();
      writer = undefined;
      const settled = await lease.settle();
      await lease.captureSidecars(input.databasePath);
      const verified = await verifyPostDatabase(input, prepared.payload, receipt!, lease, settled);
      const bindingHash = hashSqliteG006bDomain(SQLITE_G006B_BINDING_DOMAIN, prepared.payload);
      const committedPayload = {
        operationId: input.operationId,
        preparedHandoffId: prepared.handoffId,
        preparedRecordSha256: prepared.recordSha256,
        bindingHash,
        database: verified.database,
        verification: verified.verification,
      };
      const committed = await publishEnvelope(input, "committed", committedPayload, ledger);
      result = deepFreeze({ mode: input.mode, status: "committed", preparedHandoffId: prepared.handoffId, committedHandoffId: committed.handoffId, bindingHash });
    }
  } catch (error) {
    primary = error;
  } finally {
    if (writer?.open && writer.inTransaction && !commitInvoked) {
      try { writer.exec("ROLLBACK"); } catch (error) { cleanup.push(`writer rollback: ${message(error)}`); }
    }
    if (writer?.open) { try { writer.close(); } catch (error) { cleanup.push(`writer close: ${message(error)}`); } }
    if (ledger) cleanupPublishedUnverified = await ledger.cleanupAll(cleanup);
    if (lease) {
      try { await lease.releaseSidecarsIfCaptured(); } catch (error) { cleanup.push(`sidecar release: ${message(error)}`); }
      try {
        await lease.release();
      } catch (error) {
        if (error instanceof SqliteG006bPublishedUnverifiedError) cleanupPublishedUnverified ??= error;
        cleanup.push(`native lease release: ${message(error)}`);
      }
    }
  }
  if (!primary && cleanup.length === 0 && result) return result;
  const detail = [commitError === undefined ? undefined : `COMMIT returned: ${message(commitError)}`, primary === undefined ? undefined : message(primary)].filter(Boolean).join("; ") || "post-commit cleanup failed";
  if (commitInvoked || (result?.status === "replayed")) throw new SqliteG006bCommittedUnverifiedError(detail, cleanup);
  if (primary instanceof SqliteG006bCommittedUnverifiedError) throw new SqliteG006bCommittedUnverifiedError(message(primary), [...primary.cleanupFailures, ...cleanup]);
  if (primary instanceof SqliteG006bPublishedUnverifiedError || cleanupPublishedUnverified) {
    const published = primary instanceof SqliteG006bPublishedUnverifiedError ? primary : cleanupPublishedUnverified!;
    throw new SqliteG006bPublishedUnverifiedError(
      primary && primary !== published ? `${message(primary)}; ${message(published)}` : message(published),
      [...published.cleanupFailures, ...cleanup],
    );
  }
  if (primary instanceof SqliteG006bError) throw new SqliteG006bError(primary.code, message(primary), [...primary.cleanupFailures, ...cleanup]);
  throw new SqliteG006bError(
    input.mode === "replay" ? "G006B_RECOVERY_REQUIRED" : "G006B_STATE_REJECTED",
    primary === undefined ? `${input.mode} cleanup failed` : message(primary),
    cleanup,
  );
}
