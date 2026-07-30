import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isProxy } from "node:util/types";

import Database from "better-sqlite3";

import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";
import {
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TABLE_NAMES,
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
type TestFault = "after-prepared-publish" | "after-database-commit" | "writer-primary-and-rollback-sentinel";

export interface SqliteG006bTestBoundary {
  readonly __opaqueSqliteG006bTestBoundary: never;
}

export interface SqliteG006bNativeIdentity {
  readonly volumeSerialNumber: string;
  readonly fileId: string;
  readonly size: number;
  readonly numberOfLinks: number;
  readonly sha256: string;
  readonly fileSystem: "NTFS";
}

export interface SqliteG006bPreFinalizationInput {
  readonly mode: "execute" | "resume";
  readonly operationId: string;
  readonly databasePath: string;
  readonly lockPath: string;
  readonly backupTemporaryPath: string;
  readonly backupPath: string;
  readonly archiveStagingDirectory: string;
  readonly archiveDirectory: string;
  readonly preparedTemporaryPath: string;
  readonly preparedPath: string;
  readonly committedTemporaryPath: string;
  readonly committedPath: string;
  readonly publisherScriptPath: string;
  readonly publisherSha256: string;
  readonly manifest: CompatibilityBackfillManifest;
  readonly seed: LegacyWebsiteLeadPlaySeed;
  readonly expectedSourceIdentity: SqliteG006bNativeIdentity;
  readonly expectedAcceptedPhysicalManifestDigest: string;
  readonly expectedReceiptRowSha256: string;
  readonly expectedBindingId: string;
  readonly expectedConfigurationHash: string;
  readonly expectedPreservationAggregateSha256: string;
  readonly testBoundary?: SqliteG006bTestBoundary;
}

export interface SqliteG006bPreFinalizationResult {
  readonly status: "committed" | "replayed";
  readonly preparedHandoffId: string;
  readonly committedHandoffId: string;
  readonly bindingHash: string;
}

export interface SqliteG006bInspectionInput {
  readonly databasePath: string;
  readonly publisherScriptPath: string;
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
  readonly publisherSha256: string;
}

export type SqliteG006bErrorCode =
  | "G006B_INPUT_REJECTED"
  | "G006B_LOCK_HELD"
  | "G006B_STATE_REJECTED"
  | "G006B_EVIDENCE_DRIFT"
  | "G006B_PUBLISH_FAILED"
  | "G006B_PREPARED_RECORD_REQUIRED"
  | "G006B_RECOVERY_REQUIRED"
  | "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED"
  | "G006B_TEST_BOUNDARY_REJECTED";

export class SqliteG006bError extends Error {
  public readonly code: SqliteG006bErrorCode;
  public readonly cleanupFailures: readonly string[];

  public constructor(code: SqliteG006bErrorCode, detail?: string, cleanupFailures: readonly string[] = []) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SqliteG006bError";
    this.code = code;
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

const testBoundaryStates = new WeakMap<object, TestFault>();

export function createSqliteG006bTestBoundary(fault: TestFault): SqliteG006bTestBoundary {
  if (process.env.NODE_ENV !== "test" || ![
    "after-prepared-publish",
    "after-database-commit",
    "writer-primary-and-rollback-sentinel",
  ].includes(fault)) {
    throw new SqliteG006bError("G006B_TEST_BOUNDARY_REJECTED");
  }
  const boundary = Object.freeze(Object.create(null)) as SqliteG006bTestBoundary;
  testBoundaryStates.set(boundary as object, fault);
  return boundary;
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
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || value.includes("\0")) fail("G006B_INPUT_REJECTED", `${label} must be an exact absolute path`);
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
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || value.includes("\0")) fail("G006B_INPUT_REJECTED", `${label} must be an exact absolute path`);
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

function validateInput(input: SqliteG006bPreFinalizationInput): SqliteG006bPreFinalizationInput {
  if (!input || typeof input !== "object" || isProxy(input)) fail("G006B_INPUT_REJECTED", "input must be a non-proxy record");
  const hasTestBoundary = Object.hasOwn(input as object, "testBoundary");
  const keys = [
    "mode", "operationId", "databasePath", "lockPath", "backupTemporaryPath", "backupPath",
    "archiveStagingDirectory", "archiveDirectory", "preparedTemporaryPath", "preparedPath",
    "committedTemporaryPath", "committedPath", "publisherScriptPath", "publisherSha256", "manifest", "seed",
    "expectedSourceIdentity", "expectedAcceptedPhysicalManifestDigest", "expectedReceiptRowSha256",
    "expectedBindingId", "expectedConfigurationHash", "expectedPreservationAggregateSha256",
    ...(hasTestBoundary ? ["testBoundary"] : []),
  ];
  exactKeys(input, keys, "input");
  if (input.mode !== "execute" && input.mode !== "resume") fail("G006B_INPUT_REJECTED", "mode");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.operationId)) fail("G006B_INPUT_REJECTED", "operationId");
  canonicalExistingFile(input.databasePath, "databasePath");
  canonicalTarget(input.lockPath, "lockPath");
  if (input.lockPath !== `${input.databasePath}.g006b.lock`) fail("G006B_INPUT_REJECTED", "lockPath is not database-specific");
  for (const [pathValue, label] of [
    [input.backupTemporaryPath, "backupTemporaryPath"], [input.backupPath, "backupPath"],
    [input.preparedTemporaryPath, "preparedTemporaryPath"], [input.preparedPath, "preparedPath"],
    [input.committedTemporaryPath, "committedTemporaryPath"], [input.committedPath, "committedPath"],
  ] as const) canonicalTarget(pathValue, label);
  canonicalDirectoryTarget(input.archiveStagingDirectory, "archiveStagingDirectory");
  canonicalDirectoryTarget(input.archiveDirectory, "archiveDirectory");
  canonicalExistingFile(input.publisherScriptPath, "publisherScriptPath");
  for (const [temporary, destination, label] of [
    [input.backupTemporaryPath, input.backupPath, "backup"],
    [input.preparedTemporaryPath, input.preparedPath, "prepared"],
    [input.committedTemporaryPath, input.committedPath, "committed"],
  ] as const) {
    if (dirname(temporary) !== dirname(destination)
        || !basename(temporary).startsWith(`${basename(destination)}.g006b.tmp.`)) {
      fail("G006B_INPUT_REJECTED", `${label} temp must be destination-bound sibling`);
    }
  }
  assertSha(input.publisherSha256, "publisherSha256");
  assertSha(input.expectedAcceptedPhysicalManifestDigest, "expectedAcceptedPhysicalManifestDigest");
  assertSha(input.expectedReceiptRowSha256, "expectedReceiptRowSha256");
  assertSha(input.expectedConfigurationHash, "expectedConfigurationHash");
  assertSha(input.expectedPreservationAggregateSha256, "expectedPreservationAggregateSha256");
  exactKeys(input.expectedSourceIdentity, ["volumeSerialNumber", "fileId", "size", "numberOfLinks", "sha256", "fileSystem"], "expectedSourceIdentity");
  assertNativeIdentity(input.expectedSourceIdentity, "expectedSourceIdentity");
  if (sha256Bytes(readFileSync(input.publisherScriptPath)) !== input.publisherSha256) fail("G006B_EVIDENCE_DRIFT", "publisher script hash");
  if (hasTestBoundary && (input.testBoundary === undefined || !testBoundaryStates.has(input.testBoundary as object))) fail("G006B_TEST_BOUNDARY_REJECTED", "unrecognized boundary");
  assertManifestRecursiveShape(input.manifest, "manifest");
  validateEmbeddedJsonValue(input.seed, "seed");
  return input;
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

type PublisherInput = Pick<SqliteG006bPreFinalizationInput, "publisherScriptPath">;

function nativeCommand(input: PublisherInput, args: readonly string[]): Record<string, unknown> {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", input.publisherScriptPath, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = `${String(result.stderr).trim()} (exit ${String(result.status)})`;
    if (result.status === 14) throw new SqliteG006bCommittedUnverifiedError(`native publication visible but unverified: ${detail}`);
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

function inspectNative(input: PublisherInput, path: string): SqliteG006bNativeIdentity {
  const value = nativeCommand(input, ["-Mode", "Inspect", "-Path", path]);
  const identity = {
    volumeSerialNumber: value.volumeSerialNumber,
    fileId: value.fileId,
    size: value.size,
    numberOfLinks: value.numberOfLinks,
    sha256: value.sha256,
    fileSystem: value.fileSystem,
  };
  assertNativeIdentity(identity, "native inspection");
  return identity;
}

function flushDirectory(input: SqliteG006bPreFinalizationInput, path: string): void {
  nativeCommand(input, ["-Mode", "FlushDirectory", "-Path", path]);
}

function publish(input: SqliteG006bPreFinalizationInput, source: string, destination: string): SqliteG006bNativeIdentity {
  const bytes = statSync(source).size;
  if (!Number.isSafeInteger(bytes)) fail("G006B_PUBLISH_FAILED", "unsafe file size");
  const sha = sha256Bytes(readFileSync(source));
  nativeCommand(input, [
    "-Mode", "Publish", "-SourcePath", source, "-DestinationPath", destination,
    "-ExpectedSha256", sha, "-ExpectedBytes", String(bytes),
  ]);
  const identity = inspectNative(input, destination);
  if (identity.size !== bytes || identity.sha256 !== sha) fail("G006B_PUBLISH_FAILED", "post-publication bytes");
  return identity;
}

function writeExclusiveDurable(path: string, bytes: Buffer): void {
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function createLock(input: SqliteG006bPreFinalizationInput): number {
  let descriptor: number;
  try {
    descriptor = openSync(input.lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("G006B_LOCK_HELD", input.lockPath);
    throw error;
  }
  try {
    const bytes = Buffer.from(canonicalizeSqliteG006bRecord({
      format: SQLITE_G006B_RECORD_FORMAT,
      operationId: input.operationId,
    }), "utf8");
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    flushDirectory(input, dirname(input.lockPath));
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    try { unlinkSync(input.lockPath); } catch { /* surfaced by the primary create failure */ }
    throw error;
  }
}

function closeOwnedLock(input: SqliteG006bPreFinalizationInput, descriptor: number, cleanup: string[]): void {
  try { closeSync(descriptor); } catch (error) { cleanup.push(`lock close: ${message(error)}`); }
  try { unlinkSync(input.lockPath); } catch (error) { cleanup.push(`lock unlink: ${message(error)}`); }
  try { flushDirectory(input, dirname(input.lockPath)); } catch (error) { cleanup.push(`lock parent flush: ${message(error)}`); }
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

function verifyT028Pre(db: Database.Database, input: SqliteG006bPreFinalizationInput): { receipt: CompatibilityBackfillReceipt; receiptRowSha256: string } {
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

function g023Evidence(input: SqliteG006bPreFinalizationInput, receipt: CompatibilityBackfillReceipt): G023Evidence {
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

function verifyG023Stored(input: SqliteG006bPreFinalizationInput, value: unknown, receipt: CompatibilityBackfillReceipt): G023Evidence {
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

function assertDatabaseConnectionBoundary(db: Database.Database): void {
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
  if (journalMode !== "delete" || lockingMode !== "normal") fail("G006B_STATE_REJECTED", `journal/locking mode ${journalMode}/${lockingMode}`);
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

function databaseEvidence(path: string, native: SqliteG006bNativeIdentity, state: ReturnType<typeof classifySqliteSchemaV1>, physical: string, preservation: PreservationEvidence, manifest: CompatibilityBackfillManifest, dataVersion: number): Record<string, CanonicalValue> {
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

function publishEnvelope(input: SqliteG006bPreFinalizationInput, phase: "prepared" | "committed", payload: Record<string, unknown>): RecordEnvelope {
  const envelope = createEnvelope(phase, payload);
  const temporary = phase === "prepared" ? input.preparedTemporaryPath : input.committedTemporaryPath;
  const destination = phase === "prepared" ? input.preparedPath : input.committedPath;
  if (existsSync(temporary)) fail("G006B_PUBLISH_FAILED", `${phase} temp already exists`);
  writeExclusiveDurable(temporary, Buffer.from(canonicalizeSqliteG006bRecord(envelope), "utf8"));
  publish(input, temporary, destination);
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

function verifyArchive(input: SqliteG006bPreFinalizationInput, archive: Record<string, unknown>): void {
  exactKeys(archive, ["path", "schemaVersion", "manifestSha256", "entries", "treeHash"], "archive evidence");
  if (archive.path !== input.archiveDirectory || archive.schemaVersion !== 3) fail("G006B_EVIDENCE_DRIFT", "archive path/schema");
  validateDataExportDirectory(input.archiveDirectory);
  const entries = archiveEntries(input.archiveDirectory);
  const treeHash = archiveTreeHash(entries);
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (treeHash !== archive.treeHash || basename(input.archiveDirectory) !== treeHash || manifestEntry?.sha256 !== archive.manifestSha256 || !sameCanonical(entries, archive.entries)) fail("G006B_EVIDENCE_DRIFT", "archive identity");
}

async function makeBackupAndArchive(input: SqliteG006bPreFinalizationInput, prePreservation: PreservationEvidence): Promise<{ backup: Record<string, CanonicalValue>; archive: Record<string, CanonicalValue> }> {
  if (existsSync(input.backupTemporaryPath) || existsSync(input.archiveStagingDirectory)) fail("G006B_PUBLISH_FAILED", "backup/archive staging residue exists");
  let writer: Database.Database | undefined;
  let snapshot: Database.Database | undefined;
  try {
    writer = new Database(input.databasePath, { fileMustExist: true });
    writer.pragma("foreign_keys = ON");
    writer.exec("BEGIN IMMEDIATE");
    assertAcceptedState(writer, input.expectedAcceptedPhysicalManifestDigest);
    const lockedNative = inspectNative(input, input.databasePath);
    if (lockedNative.fileId !== input.expectedSourceIdentity.fileId || lockedNative.volumeSerialNumber !== input.expectedSourceIdentity.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "source file identity under backup lock");
    snapshot = new Database(input.databasePath, { readonly: true, fileMustExist: true });
    await snapshot.backup(input.backupTemporaryPath);
    snapshot.close();
    snapshot = undefined;
    writer.exec("ROLLBACK");
    writer.close();
    writer = undefined;
  } catch (error) {
    if (snapshot?.open) snapshot.close();
    if (writer?.open) {
      if (writer.inTransaction) writer.exec("ROLLBACK");
      writer.close();
    }
    throw error;
  }
  const backupIdentity = publish(input, input.backupTemporaryPath, input.backupPath);
  const backupDb = new Database(input.backupPath, { readonly: true, fileMustExist: true });
  backupDb.pragma("foreign_keys = ON");
  try {
    const state = assertAcceptedState(backupDb, input.expectedAcceptedPhysicalManifestDigest);
    const preservation = capturePreservation(backupDb);
    if (!samePreservation(prePreservation, preservation)) fail("G006B_EVIDENCE_DRIFT", "backup rowsets differ from source");
    verifyT028Pre(backupDb, input);
    mkdirSync(input.archiveStagingDirectory);
    exportSqliteData({ dbPath: input.backupPath, outDir: input.archiveStagingDirectory, schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION });
    const manifestPath = join(input.archiveStagingDirectory, "manifest.json");
    const exportManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    exportManifest.exportedAt = ARCHIVE_EXPORTED_AT;
    writeFileSync(manifestPath, `${JSON.stringify(exportManifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    validateDataExportDirectory(input.archiveStagingDirectory);
    const stagedEntries = archiveEntries(input.archiveStagingDirectory);
    const treeHash = archiveTreeHash(stagedEntries);
    if (basename(input.archiveDirectory) !== treeHash) fail("G006B_INPUT_REJECTED", "archiveDirectory must end in exact content tree hash");
    if (!existsSync(input.archiveDirectory)) {
      mkdirSync(input.archiveDirectory);
      flushDirectory(input, dirname(input.archiveDirectory));
    }
    const existing = readdirSync(input.archiveDirectory);
    if (existing.some((name) => !stagedEntries.some((entry) => entry.name === name))) fail("G006B_EVIDENCE_DRIFT", "unexpected existing archive entry");
    for (const entry of stagedEntries) {
      const destination = join(input.archiveDirectory, String(entry.name));
      const temporary = `${destination}.g006b.tmp.${input.operationId}`;
      if (!existsSync(destination)) writeExclusiveDurable(temporary, readFileSync(join(input.archiveStagingDirectory, String(entry.name))));
      else if (!existsSync(temporary)) writeExclusiveDurable(temporary, readFileSync(join(input.archiveStagingDirectory, String(entry.name))));
      publish(input, temporary, destination);
    }
    flushDirectory(input, input.archiveDirectory);
    validateDataExportDirectory(input.archiveDirectory);
    const finalEntries = archiveEntries(input.archiveDirectory);
    if (!sameCanonical(finalEntries, stagedEntries)) fail("G006B_EVIDENCE_DRIFT", "published archive differs from staging");
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
    return { backup, archive };
  } finally {
    backupDb.close();
    if (existsSync(input.archiveStagingDirectory)) rmSync(input.archiveStagingDirectory, { recursive: true });
  }
}

function verifyBackup(input: SqliteG006bPreFinalizationInput, value: Record<string, unknown>, preservation: PreservationEvidence): void {
  exactKeys(value, ["path", "native", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest", "rowsets"], "backup evidence");
  if (value.path !== input.backupPath) fail("G006B_EVIDENCE_DRIFT", "backup path");
  const native = inspectNative(input, input.backupPath);
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

function verifyPostT028(db: Database.Database, input: SqliteG006bPreFinalizationInput, receipt: CompatibilityBackfillReceipt): void {
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

function verifyPostDatabase(input: SqliteG006bPreFinalizationInput, preparedPayload: Record<string, unknown>, receipt: CompatibilityBackfillReceipt): { database: Record<string, CanonicalValue>; verification: Record<string, unknown> } {
  const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  try {
    const state = assertPreparedState(db);
    const baseline = preparedPayload.preservation as unknown as PreservationEvidence;
    const preservation = capturePreservation(db, baseline);
    if (!samePreservation(baseline, preservation)) fail("G006B_EVIDENCE_DRIFT", "post full-row preservation");
    const counts = sourceCounts(db);
    if (counts.some((count) => count.matching !== count.total || count.nulls !== 0 || count.other !== 0)) fail("G006B_EVIDENCE_DRIFT", "source binding counts");
    verifyPostT028(db, input, receipt);
    const storedG023 = verifyG023Stored(input, preparedPayload.g023, receipt);
    const health = healthEvidence(db);
    const native = inspectNative(input, input.databasePath);
    const expectedNative = (preparedPayload.database as Record<string, unknown>).native as SqliteG006bNativeIdentity;
    if (native.fileId !== expectedNative.fileId || native.volumeSerialNumber !== expectedNative.volumeSerialNumber) fail("G006B_EVIDENCE_DRIFT", "post database file identity");
    const database = databaseEvidence(input.databasePath, native, state, SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST, preservation, input.manifest, Number(db.pragma("data_version", { simple: true })));
    const verification = {
      state: expectedPostState(preservation, counts, health),
      preservation,
      audit: preservation.audit,
      receiptRowSha256: input.expectedReceiptRowSha256,
      manifestHash: compatibilityManifestHash(input.manifest),
      foundation: { tenantId: input.manifest.tenantId, workspaceId: input.manifest.workspaceId, ownerAuthIdentityId: input.manifest.ownerAuthIdentityId, policyId: input.manifest.policyId, policyVersion: input.manifest.policyVersion, status: "exact" },
      source: { cardId: SQLITE_G006B_SOURCE_CARD_ID, counts },
      g023: { bindingId: storedG023.bindingId, configurationHash: storedG023.configurationHash, bindingSha256: storedG023.bindingSha256 },
      health,
      relationshipOrphanCount: 0,
    };
    return { database, verification };
  } finally { db.close(); }
}

function mutate(input: SqliteG006bPreFinalizationInput, preparedPayload: Record<string, unknown>): void {
  let db: Database.Database | undefined;
  let committed = false;
  let failure: unknown;
  const cleanup: string[] = [];
  try {
    db = new Database(input.databasePath, { fileMustExist: true });
    db.pragma("foreign_keys = ON");
    db.exec("BEGIN IMMEDIATE");
    const fault = input.testBoundary ? testBoundaryStates.get(input.testBoundary as object) : undefined;
    if (fault === "writer-primary-and-rollback-sentinel") fail("G006B_EVIDENCE_DRIFT", "simulated writer primary failure");
    assertAcceptedState(db, input.expectedAcceptedPhysicalManifestDigest);
    const baseline = preparedPayload.preservation as unknown as PreservationEvidence;
    if (!samePreservation(baseline, capturePreservation(db))) fail("G006B_EVIDENCE_DRIFT", "pre-mutation preservation drift");
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
    db.exec("COMMIT");
    committed = true;
  } catch (error) {
    failure = error;
    if (db?.open && db.inTransaction) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) { cleanup.push(`writer rollback: ${message(rollbackError)}`); }
      if (input.testBoundary && testBoundaryStates.get(input.testBoundary as object) === "writer-primary-and-rollback-sentinel") cleanup.push("writer rollback: simulated cleanup sentinel");
    }
  } finally {
    if (db?.open) {
      try { db.close(); } catch (closeError) { cleanup.push(`writer close: ${message(closeError)}`); }
    }
  }
  if (failure !== undefined) {
    if (committed) throw new SqliteG006bCommittedUnverifiedError(message(failure), cleanup);
    if (failure instanceof SqliteG006bError) throw new SqliteG006bError(failure.code, failure.message, cleanup);
    throw failure;
  }
}

function assertPreparedPayload(input: SqliteG006bPreFinalizationInput, payload: Record<string, unknown>): { receipt: CompatibilityBackfillReceipt; g023: G023Evidence } {
  exactKeys(payload, ["operationId", "basis", "source", "database", "t028", "g023", "backup", "archive", "preservation", "mutation", "expectedPostState"], "prepared payload");
  if (payload.operationId !== input.operationId || !sameCanonical(payload.basis, { kind: "legacy-t028" }) || !sameCanonical(payload.source, { cardId: SQLITE_G006B_SOURCE_CARD_ID, authority: "identity-only", grantsProviderExecution: false }) || !sameCanonical(payload.mutation, mutationEvidence())) fail("G006B_EVIDENCE_DRIFT", "prepared fixed binding");
  exactKeys(payload.database, ["path", "native", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest", "applicationTableCount", "targetColumnCount", "expectedTargetColumnCount", "tableIdentities", "sourceSnapshotFingerprint", "dataVersion"], "prepared database");
  const database = payload.database as Record<string, unknown>;
  if (database.path !== input.databasePath || !sameCanonical(database.native, input.expectedSourceIdentity)
      || database.userVersion !== 0 || database.catalogDigest !== ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST
      || database.internalCatalogDigest !== SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST
      || database.physicalManifestDigest !== input.expectedAcceptedPhysicalManifestDigest
      || database.applicationTableCount !== 37 || database.targetColumnCount !== 27 || database.expectedTargetColumnCount !== 32
      || database.sourceSnapshotFingerprint !== input.manifest.sourceSnapshotFingerprint
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

function removeTransient(path: string, cleanup: string[]): void {
  if (!existsSync(path)) return;
  try { unlinkSync(path); } catch (error) { cleanup.push(`temporary cleanup ${path}: ${message(error)}`); }
}

function removeArchiveTemporaries(input: SqliteG006bPreFinalizationInput, cleanup: string[]): void {
  try {
    if (!existsSync(input.archiveDirectory) || !statSync(input.archiveDirectory).isDirectory()) return;
    const suffix = `.g006b.tmp.${input.operationId}`;
    let removed = false;
    for (const name of readdirSync(input.archiveDirectory)) {
      if (!name.endsWith(suffix)) continue;
      try {
        unlinkSync(join(input.archiveDirectory, name));
        removed = true;
      } catch (error) {
        cleanup.push(`archive temporary cleanup ${name}: ${message(error)}`);
      }
    }
    if (removed) {
      try { flushDirectory(input, input.archiveDirectory); } catch (error) { cleanup.push(`archive temporary parent flush: ${message(error)}`); }
    }
  } catch (error) {
    cleanup.push(`archive temporary enumeration: ${message(error)}`);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function inspectSqliteG006bPreFinalizationEvidence(input: SqliteG006bInspectionInput): SqliteG006bInspectionResult {
  exactKeys(input, ["databasePath", "publisherScriptPath", "manifest", "seed"], "inspection input");
  canonicalExistingFile(input.databasePath, "inspection databasePath");
  canonicalExistingFile(input.publisherScriptPath, "inspection publisherScriptPath");
  exactKeys(input.manifest, MANIFEST_KEYS, "inspection manifest");
  const sourceIdentity = inspectNative(input, input.databasePath);
  const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  try {
    const physical = sqliteSchemaV1PhysicalManifestDigest(db);
    assertAcceptedState(db, physical);
    const preservation = capturePreservation(db);
    const row = receiptRow(db, input.manifest);
    const receipt = parseReceipt(row);
    const manifestHash = compatibilityManifestHash(input.manifest);
    const replay = runSqliteCompatibilityBackfill(readonlyBackfillAdapter(db), input.manifest);
    if (!sameCanonical(replay, receipt)) fail("G006B_EVIDENCE_DRIFT", "inspection T028 replay");
    const seedCanonicalJson = canonicalizeCompatibilityConfiguration(input.seed);
    const parsedSeed = parseLegacyWebsiteLeadPlayJson(seedCanonicalJson);
    if (!parsedSeed.ok) fail("G006B_EVIDENCE_DRIFT", `inspection G023 seed ${parsedSeed.reasonCode}`);
    const binding = bindLegacyWebsiteLeadPlay({
      tenantId: input.manifest.tenantId,
      workspaceId: input.manifest.workspaceId,
      manifest: input.manifest,
      receipt,
      seed: parsedSeed.seed,
    });
    if (!binding.ok || receipt.receiptId !== `compatibility-backfill-${manifestHash.slice(0, 24)}`) fail("G006B_EVIDENCE_DRIFT", "inspection G023/T028 binding");
    return Object.freeze({
      sourceIdentity,
      acceptedPhysicalManifestDigest: physical,
      receiptRowSha256: receiptRowSha256(row),
      bindingId: binding.binding.bindingId,
      configurationHash: binding.binding.configurationHash,
      preservationAggregateSha256: preservation.aggregateSha256,
      publisherSha256: sha256Bytes(readFileSync(input.publisherScriptPath)),
    });
  } finally { db.close(); }
}

export async function runSqliteG006bPreFinalization(rawInput: SqliteG006bPreFinalizationInput): Promise<SqliteG006bPreFinalizationResult> {
  const input = validateInput(rawInput);
  const lockDescriptor = createLock(input);
  const cleanup: string[] = [];
  let primary: unknown;
  try {
    let prepared: RecordEnvelope;
    let receipt: CompatibilityBackfillReceipt;
    if (existsSync(input.committedPath)) {
      if (!existsSync(input.preparedPath)) fail("G006B_RECOVERY_REQUIRED", "committed record exists without prepared record");
      prepared = readEnvelope(input.preparedPath, "prepared");
      ({ receipt } = assertPreparedPayload(input, prepared.payload));
      const committed = readEnvelope(input.committedPath, "committed");
      exactKeys(committed.payload, ["operationId", "preparedHandoffId", "preparedRecordSha256", "bindingHash", "database", "verification"], "committed payload");
      if (committed.payload.operationId !== input.operationId || committed.payload.preparedHandoffId !== prepared.handoffId || committed.payload.preparedRecordSha256 !== prepared.recordSha256) fail("G006B_RECOVERY_REQUIRED", "committed/prepared link");
      const verified = verifyPostDatabase(input, prepared.payload, receipt);
      if (!sameCanonical(committed.payload.database, verified.database) || !sameCanonical(committed.payload.verification, verified.verification)) fail("G006B_RECOVERY_REQUIRED", "committed record differs from reopened post-state");
      const bindingHash = hashSqliteG006bDomain(SQLITE_G006B_BINDING_DOMAIN, prepared.payload);
      if (committed.payload.bindingHash !== bindingHash) fail("G006B_RECOVERY_REQUIRED", "committed binding hash");
      return { status: "replayed", preparedHandoffId: prepared.handoffId, committedHandoffId: committed.handoffId, bindingHash };
    }

    if (existsSync(input.preparedPath)) {
      prepared = readEnvelope(input.preparedPath, "prepared");
      ({ receipt } = assertPreparedPayload(input, prepared.payload));
    } else {
      if (input.mode === "resume") fail("G006B_PREPARED_RECORD_REQUIRED", "resume requires a valid prepared record");
      const native = inspectNative(input, input.databasePath);
      if (!sameCanonical(native, input.expectedSourceIdentity)) fail("G006B_EVIDENCE_DRIFT", "source native identity");
      const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
      db.pragma("foreign_keys = ON");
      let state: ReturnType<typeof classifySqliteSchemaV1>;
      let preservation: PreservationEvidence;
      let evidence: ReturnType<typeof verifyT028Pre>;
      let g023: G023Evidence;
      let database: Record<string, CanonicalValue>;
      try {
        state = assertAcceptedState(db, input.expectedAcceptedPhysicalManifestDigest);
        preservation = capturePreservation(db);
        if (preservation.aggregateSha256 !== input.expectedPreservationAggregateSha256) fail("G006B_EVIDENCE_DRIFT", "source preservation pin");
        evidence = verifyT028Pre(db, input);
        g023 = g023Evidence(input, evidence.receipt);
        database = databaseEvidence(input.databasePath, native, state, input.expectedAcceptedPhysicalManifestDigest, preservation, input.manifest, Number(db.pragma("data_version", { simple: true })));
      } finally { db.close(); }
      const artifacts = await makeBackupAndArchive(input, preservation!);
      const live = new Database(input.databasePath, { readonly: true, fileMustExist: true });
      live.pragma("foreign_keys = ON");
      try {
        assertAcceptedState(live, input.expectedAcceptedPhysicalManifestDigest);
        if (!sameCanonical(inspectNative(input, input.databasePath), input.expectedSourceIdentity)) fail("G006B_EVIDENCE_DRIFT", "live source native identity changed after backup/archive");
        if (!samePreservation(preservation!, capturePreservation(live))) fail("G006B_EVIDENCE_DRIFT", "live source changed after backup/archive");
        verifyT028Pre(live, input);
      } finally { live.close(); }
      const zeroSourceCounts = SOURCE_TABLES.map((table) => ({ table, total: preservation!.tables.find((entry) => entry.name === table)!.rowCount, matching: preservation!.tables.find((entry) => entry.name === table)!.rowCount, nulls: 0, other: 0 }));
      const preparedPayload = {
        operationId: input.operationId,
        basis: { kind: "legacy-t028" },
        source: { cardId: SQLITE_G006B_SOURCE_CARD_ID, authority: "identity-only", grantsProviderExecution: false },
        database: database!,
        t028: { manifest: input.manifest, manifestHash: compatibilityManifestHash(input.manifest), receipt: evidence!.receipt, receiptRowSha256: evidence!.receiptRowSha256 },
        g023: g023!,
        backup: artifacts.backup,
        archive: artifacts.archive,
        preservation: preservation!,
        mutation: mutationEvidence(),
        expectedPostState: expectedPostState(preservation!, zeroSourceCounts, { integrityCheck: "ok", foreignKeyFailureCount: 0, orphanCount: 0 }),
      };
      prepared = publishEnvelope(input, "prepared", preparedPayload);
      receipt = evidence!.receipt;
      if (input.testBoundary && testBoundaryStates.get(input.testBoundary as object) === "after-prepared-publish") fail("G006B_STATE_REJECTED", "simulated crash after prepared publication");
    }

    const current = new Database(input.databasePath, { readonly: true, fileMustExist: true });
    let kind: ReturnType<typeof classifySqliteSchemaV1>["kind"];
    try { kind = classifySqliteSchemaV1(current).kind; } finally { current.close(); }
    if (kind === "accepted-legacy") {
      mutate(input, prepared.payload);
      if (input.testBoundary && testBoundaryStates.get(input.testBoundary as object) === "after-database-commit") throw new SqliteG006bCommittedUnverifiedError("simulated crash after database commit");
    } else if (kind !== "prepared-legacy") {
      fail("G006B_RECOVERY_REQUIRED", `prepared record with ambiguous database state ${kind}`);
    }
    const verified = verifyPostDatabase(input, prepared.payload, receipt!);
    const bindingHash = hashSqliteG006bDomain(SQLITE_G006B_BINDING_DOMAIN, prepared.payload);
    const committedPayload = {
      operationId: input.operationId,
      preparedHandoffId: prepared.handoffId,
      preparedRecordSha256: prepared.recordSha256,
      bindingHash,
      database: verified.database,
      verification: verified.verification,
    };
    const committed = publishEnvelope(input, "committed", committedPayload);
    return { status: "committed", preparedHandoffId: prepared.handoffId, committedHandoffId: committed.handoffId, bindingHash };
  } catch (error) {
    primary = error;
  } finally {
    removeTransient(input.backupTemporaryPath, cleanup);
    removeTransient(input.preparedTemporaryPath, cleanup);
    removeTransient(input.committedTemporaryPath, cleanup);
    removeArchiveTemporaries(input, cleanup);
    closeOwnedLock(input, lockDescriptor, cleanup);
  }
  if (primary instanceof SqliteG006bCommittedUnverifiedError) throw new SqliteG006bCommittedUnverifiedError(primary.message, [...primary.cleanupFailures, ...cleanup]);
  if (primary instanceof SqliteG006bError) throw new SqliteG006bError(primary.code, primary.message, [...primary.cleanupFailures, ...cleanup]);
  throw new SqliteG006bError("G006B_STATE_REJECTED", message(primary), cleanup);
}
