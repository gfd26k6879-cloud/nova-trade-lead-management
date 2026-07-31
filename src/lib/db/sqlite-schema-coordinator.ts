import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { isProxy } from "node:util/types";

import Database from "better-sqlite3";

import {
  consumeSqliteG006bPreparedFinalizationHandoffForCoordinator,
  hashSqliteG006bDomain,
  type SqliteG006bPreparedFinalizationHandoff,
} from "./sqlite-g006b-pre-finalization";

import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION,
  SQLITE_SCHEMA_V1_PRIMARY_SCHEMA,
  SQLITE_SCHEMA_V1_SQL,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
  SQLITE_SCHEMA_V1_TRANSFORM_TABLES,
} from "./sqlite-schema-v1";

export const ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST = "07091889ff9806c20356f092d3812ff325f22537c63a56149eea7dab0a529ade" as const;
export const SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST = "90117968b064e6bded92dbf82c18fffa31951c0998c727f662eee56e78721ba6" as const;
export const SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST = "07e10bb5c43d98d6f561d3c0b0f9f39a9ad2d579ed1a73b9e2a7a455367fdf79" as const;
const G006B_PRESERVATION_DOMAIN = "NOVATRADE\0G006B\0B1\0PRESERVATION\0V1\0" as const;

export type SqliteSchemaV1StateKind =
  | "fresh"
  | "accepted-legacy"
  | "prepared-legacy"
  | "staged"
  | "final"
  | "unknown"
  | "partial"
  | "drift";

export interface SqliteSchemaV1State {
  readonly kind: SqliteSchemaV1StateKind;
  readonly userVersion: number;
  readonly catalogDigest: string;
  readonly applicationTableCount: number;
  readonly targetColumnCount: number;
  readonly expectedTargetColumnCount: number;
  readonly reason: string;
}

export interface SqliteSchemaV1PreservationTable {
  readonly columns: readonly string[];
  readonly rowCount: number;
  readonly payloadDigest: string;
}

export interface SqliteSchemaV1PreservationSnapshot {
  readonly tableNames: readonly string[];
  readonly tables: Readonly<Record<string, SqliteSchemaV1PreservationTable>>;
}

export type SqliteSchemaV1CoordinatorErrorCode =
  | "G006A_STATE_REJECTED"
  | "G006A_FINALIZER_REQUIRED"
  | "G006A_FINALIZER_MISMATCH"
  | "G006A_FINALIZER_CONSUMED"
  | "G006A_FINALIZER_POSTCONDITION_FAILED"
  | "G006A_FINALIZER_SQL_REJECTED"
  | "G006A_FINALIZER_PLAN_REJECTED"
  | "G006A_FILE_BACKED_FINALIZATION_REQUIRED"
  | "G006A_DATABASE_PATH_REJECTED"
  | "G006A_FILE_IDENTITY_DRIFT"
  | "G006A_FILE_IDENTITY_UNAVAILABLE"
  | "G006A_CONNECTION_BOUNDARY_REJECTED"
  | "G006A_SQLITE_INTERNAL_CATALOG_DRIFT"
  | "G006A_SQLITE_OWNED_STATE_DRIFT"
  | "G006A_SOURCE_SNAPSHOT_DRIFT"
  | "G006A_CATALOG_DRIFT"
  | "G006A_PHYSICAL_CATALOG_DRIFT"
  | "G006A_APPLICATION_TABLE_COUNT_DRIFT"
  | "G006A_FOREIGN_KEY_CHECK_FAILED"
  | "G006A_INTEGRITY_CHECK_FAILED"
  | "G006A_ROW_COUNT_DRIFT"
  | "G006A_PAYLOAD_DRIFT"
  | "G006A_VERIFIER_BOUNDARY_REJECTED"
  | "G006A_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED";

export class SqliteSchemaV1CoordinatorError extends Error {
  public readonly code: SqliteSchemaV1CoordinatorErrorCode;

  public constructor(code: SqliteSchemaV1CoordinatorErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SqliteSchemaV1CoordinatorError";
    this.code = code;
  }
}

export class SqliteSchemaV1CommittedUnverifiedError extends SqliteSchemaV1CoordinatorError {
  public readonly committed = true as const;
  public readonly status = "committed-unverified-recovery-required" as const;

  public constructor(detail: string) {
    super("G006A_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED", detail);
    this.name = "SqliteSchemaV1CommittedUnverifiedError";
  }
}

export type SqliteSchemaV1ScalarBind = string | number | bigint | null | Buffer;

export type SqliteSchemaV1FinalizerOperation =
  | Readonly<{ kind: "create-table"; sql: string }>
  | Readonly<{ kind: "create-index"; sql: string }>
  | Readonly<{ kind: "create-trigger"; sql: string }>
  | Readonly<{ kind: "insert"; sql: string; binds?: readonly SqliteSchemaV1ScalarBind[] }>
  | Readonly<{ kind: "update"; sql: string; binds?: readonly SqliteSchemaV1ScalarBind[] }>
  | Readonly<{ kind: "delete"; sql: string; binds?: readonly SqliteSchemaV1ScalarBind[] }>
  | Readonly<{ kind: "drop-table"; name: string }>
  | Readonly<{ kind: "drop-index"; name: string }>
  | Readonly<{ kind: "drop-trigger"; name: string }>
  | Readonly<{ kind: "rename-table"; from: string; to: string }>
  | Readonly<{
    kind: "restore-autoincrement-high-water";
    table: typeof SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES[number];
  }>;

export type SqliteSchemaV1FinalizerPlan = readonly SqliteSchemaV1FinalizerOperation[];

export interface SqliteSchemaV1LaterFinalizerCapabilityInput {
  readonly databasePath: string;
  readonly handoffBindingId: string;
  readonly targetCatalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly plan: SqliteSchemaV1FinalizerPlan;
}

declare const sqliteSchemaV1CapabilityType: unique symbol;
export interface SqliteSchemaV1LaterFinalizerCapability {
  readonly [sqliteSchemaV1CapabilityType]: "sqlite-schema-v1-later-finalizer-capability";
}

export interface SqliteSchemaV1FinalizerHandoff {
  readonly capability: SqliteSchemaV1LaterFinalizerCapability;
  readonly handoffBindingId: string;
}

declare const sqliteSchemaV1VerifierBoundaryType: unique symbol;
export interface SqliteSchemaV1FreshVerifierTestBoundary {
  readonly [sqliteSchemaV1VerifierBoundaryType]: "sqlite-schema-v1-fresh-verifier-test-boundary";
}

export interface SqliteSchemaV1CoordinateOptions {
  readonly freshVerifierTestBoundary?: SqliteSchemaV1FreshVerifierTestBoundary;
}

export interface SqliteSchemaV1WholeUpgradeResult {
  readonly status: "finalized" | "replayed";
  readonly state: SqliteSchemaV1State;
}

interface CapabilityState {
  readonly databasePath: string;
  readonly sourceFileLease: FileLeaseState;
  readonly leaseLifecycle: CapabilityLeaseLifecycle;
  readonly handoffBindingId: string;
  readonly sourceState: "accepted-legacy" | "staged";
  readonly sourceUserVersion: number;
  readonly sourceCatalogDigest: string;
  readonly sourceInternalCatalogDigest: string;
  readonly sourcePhysicalManifestDigest: string;
  readonly sourcePreservation: SqliteSchemaV1PreservationSnapshot;
  readonly sourceSqliteOwnedState: SqliteOwnedStateSnapshot;
  readonly targetCatalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly plan: SqliteSchemaV1FinalizerPlan;
}

interface FreshVerifierBoundaryState {
  readonly mode:
    | "fail-verifier-open"
    | "replace-before-verifier"
    | "replace-after-verifier-preservation"
    | "remove-after-verifier-preservation"
    | "replace-before-verifier-return"
    | "remove-before-verifier-return"
    | "wal-mutate-after-verifier-preservation"
    | "wal-mutate-before-verifier-return"
    | "writer-attached-schema"
    | "writer-temp-object"
    | "writer-rollback-sentinel"
    | "writer-close-sentinel"
    | "writer-open-primary-and-cleanup-sentinel";
}

interface SqliteSchemaCatalogRow {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string | null;
}

interface SqliteSchemaCatalogPartition {
  readonly application: readonly SqliteSchemaCatalogRow[];
  readonly internal: readonly SqliteSchemaCatalogRow[];
}

interface PhysicalIndexManifest {
  readonly name: string;
  readonly unique: number;
  readonly origin: string;
  readonly partial: number;
  readonly sql: string | null;
  readonly predicate: string | null;
  readonly columns: readonly Readonly<Record<string, string | number | null>>[];
}

interface PhysicalTableManifest {
  readonly name: string;
  readonly columns: readonly Readonly<Record<string, string | number | null>>[];
  readonly foreignKeys: readonly Readonly<Record<string, string | number | null>>[];
  readonly indexes: readonly PhysicalIndexManifest[];
}

interface PhysicalFileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

interface DescriptorLease {
  descriptor: number | null;
}

interface FileLeaseState {
  readonly descriptorLease: DescriptorLease;
  readonly identity: PhysicalFileIdentity;
  readonly databasePath: string;
  readonly auditId: number;
  readonly purpose: "capability-root" | "replay-root" | "connection";
}

interface CapabilityLeaseLifecycle {
  status: "ready" | "consuming" | "terminal";
  readonly unregisterToken: object;
}

interface SqliteSequenceRow {
  readonly name: string;
  readonly seq: bigint;
}

interface SqliteOwnedStateSnapshot {
  readonly digest: string;
  readonly sequencePresent: boolean;
  readonly sequenceSchemaSql: string | null;
  readonly sequenceRows: readonly SqliteSequenceRow[];
}

const capabilityStates = new WeakMap<object, CapabilityState>();
const consumedCapabilities = new WeakSet<object>();
const freshVerifierBoundaryStates = new WeakMap<object, FreshVerifierBoundaryState>();
const connectionLeaseStates = new WeakMap<Database.Database, FileLeaseState>();
const capabilityLeaseFinalizer = new FinalizationRegistry<DescriptorLease>((lease) => {
  try {
    closeDescriptorLease(lease);
  } catch {
    // GC cleanup is a last-resort fallback; deterministic paths surface close failures.
  }
});
let nextLeaseAuditId = 1;
const leaseAuditEvents: Array<Readonly<{
  id: number;
  event: "open" | "close";
  purpose: FileLeaseState["purpose"];
}>> = [];
const ACCEPTED_LEGACY_TARGET_COLUMN_COUNT = 27;
const PREPARED_LEGACY_TARGET_COLUMN_COUNT = 31;
const PREPARED_LEGACY_EXPECTED_TARGET_COLUMN_COUNT = 32;
const BIGINT_ZERO = BigInt(0);
const SQLITE_INTEGER_MAX = BigInt("9223372036854775807");
const SQLITE_WAL_TEST_ZIP = "g006a-wal-preserved";
const FORBIDDEN_SQL_TOKENS = new Set([
  "ATTACH",
  "COMMIT",
  "DETACH",
  "PRAGMA",
  "RELEASE",
  "ROLLBACK",
  "SAVEPOINT",
  "TEMP",
  "TEMPORARY",
  "VACUUM",
  "WRITABLE_SCHEMA",
  "SQLITE_SCHEMA",
  "SQLITE_MASTER",
  "SQLITE_TEMP_SCHEMA",
  "SQLITE_TEMP_MASTER",
]);

export function createSqliteSchemaV1LaterFinalizerCapability(
  input: SqliteSchemaV1LaterFinalizerCapabilityInput,
): SqliteSchemaV1LaterFinalizerCapability {
  const record = readExactPlainRecord(
    input,
    ["databasePath", "handoffBindingId", "targetCatalogDigest", "plan"],
    "G006A_FINALIZER_MISMATCH",
    "capability input",
  );
  const databasePath = canonicalExistingDatabasePath(record.databasePath);
  const handoffBindingId = requireBindingId(record.handoffBindingId);
  if (record.targetCatalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "target catalog digest");
  }
  const plan = copyAndValidateFinalizerPlan(record.plan);

  let inspector: Database.Database | undefined;
  let sourceFileLease: FileLeaseState | undefined;
  let actual: SqliteSchemaV1State | undefined;
  let sourceInternalCatalogDigest: string | undefined;
  let sourcePhysicalManifestDigest: string | undefined;
  let sourcePreservation: SqliteSchemaV1PreservationSnapshot | undefined;
  let sourceSqliteOwnedState: SqliteOwnedStateSnapshot | undefined;
  let failure: unknown;
  try {
    sourceFileLease = openFileLease(databasePath, true, "capability-root");
    inspector = openExactDatabase(databasePath, true, sourceFileLease.identity);
    assertFileLeaseIdentity(sourceFileLease);
    assertConnectionBoundary(inspector, databasePath);
    assertWritableSchemaOff(inspector);
    actual = classifySqliteSchemaV1(inspector);
    if (actual.kind !== "accepted-legacy" && actual.kind !== "staged") {
      throw rejectedState(actual);
    }
    sourceInternalCatalogDigest = expectedInternalCatalogDigest(actual.kind);
    assertSqliteInternalCatalog(inspector, sourceInternalCatalogDigest);
    sourcePhysicalManifestDigest = sqliteSchemaV1PhysicalManifestDigest(inspector);
    if (actual.kind === "staged" && sourcePhysicalManifestDigest !== SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST) {
      throw new SqliteSchemaV1CoordinatorError("G006A_PHYSICAL_CATALOG_DRIFT", sourcePhysicalManifestDigest);
    }
    sourcePreservation = captureSqliteSchemaV1PreservationSnapshot(inspector);
    sourceSqliteOwnedState = captureSqliteOwnedState(inspector);
    assertSqliteSchemaV1DatabaseHealth(inspector);
  } catch (error) {
    failure = error;
  } finally {
    if (inspector) {
      try {
        closeExactDatabase(inspector);
      } catch (error) {
        failure = failure === undefined
          ? error
          : retainCleanupFailure(failure, error, "capability inspector close");
      }
    }
  }
  if (failure !== undefined
      || !sourceFileLease
      || !actual
      || !sourceInternalCatalogDigest
      || !sourcePhysicalManifestDigest
      || !sourcePreservation
      || !sourceSqliteOwnedState) {
    if (sourceFileLease) {
      try {
        closeFileLease(sourceFileLease);
      } catch (error) {
        failure = failure === undefined
          ? error
          : retainCleanupFailure(failure, error, "capability mint root close");
      }
    }
    throw failure === undefined
      ? new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "incomplete capability mint")
      : failure;
  }

  const capability = Object.freeze(Object.create(null)) as SqliteSchemaV1LaterFinalizerCapability;
  const sourceState = actual.kind as "accepted-legacy" | "staged";
  const leaseLifecycle: CapabilityLeaseLifecycle = {
    status: "ready",
    unregisterToken: Object.freeze(Object.create(null)) as object,
  };
  capabilityStates.set(capability as object, Object.freeze({
    databasePath,
    sourceFileLease,
    leaseLifecycle,
    handoffBindingId,
    sourceState,
    sourceUserVersion: actual.userVersion,
    sourceCatalogDigest: actual.catalogDigest,
    sourceInternalCatalogDigest,
    sourcePhysicalManifestDigest,
    sourcePreservation,
    sourceSqliteOwnedState,
    targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
    plan,
  }));
  try {
    capabilityLeaseFinalizer.register(
      capability as object,
      sourceFileLease.descriptorLease,
      leaseLifecycle.unregisterToken,
    );
  } catch (error) {
    capabilityStates.delete(capability as object);
    let failure: unknown = error;
    try {
      closeFileLease(sourceFileLease);
    } catch (closeError) {
      failure = retainCleanupFailure(failure, closeError, "capability registration root close");
    }
    throw failure;
  }
  return capability;
}

export function cancelSqliteSchemaV1LaterFinalizerCapability(
  capability: SqliteSchemaV1LaterFinalizerCapability,
): boolean {
  if (!capability || typeof capability !== "object" || isProxy(capability)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  }
  const capabilityObject = capability as object;
  const state = capabilityStates.get(capabilityObject);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  if (state.leaseLifecycle.status !== "ready") return false;
  consumedCapabilities.add(capabilityObject);
  state.leaseLifecycle.status = "terminal";
  if (!capabilityLeaseFinalizer.unregister(state.leaseLifecycle.unregisterToken)) {
    let failure: unknown = new SqliteSchemaV1CoordinatorError(
      "G006A_FILE_IDENTITY_UNAVAILABLE",
      "capability lease registry invariant",
    );
    try {
      closeFileLease(state.sourceFileLease);
    } catch (closeError) {
      failure = retainCleanupFailure(failure, closeError, "capability cancel root close");
    }
    throw failure;
  }
  closeFileLease(state.sourceFileLease);
  return true;
}

export function createSqliteSchemaV1FreshVerifierTestBoundary(
  mode:
    | "fail-verifier-open"
    | "replace-before-verifier"
    | "replace-after-verifier-preservation"
    | "remove-after-verifier-preservation"
    | "replace-before-verifier-return"
    | "remove-before-verifier-return"
    | "wal-mutate-after-verifier-preservation"
    | "wal-mutate-before-verifier-return"
    | "writer-attached-schema"
    | "writer-temp-object"
    | "writer-rollback-sentinel"
    | "writer-close-sentinel"
    | "writer-open-primary-and-cleanup-sentinel",
): SqliteSchemaV1FreshVerifierTestBoundary {
  if (process.env.NODE_ENV !== "test"
      || ![
        "fail-verifier-open",
        "replace-before-verifier",
        "replace-after-verifier-preservation",
        "remove-after-verifier-preservation",
        "replace-before-verifier-return",
        "remove-before-verifier-return",
        "wal-mutate-after-verifier-preservation",
        "wal-mutate-before-verifier-return",
        "writer-attached-schema",
        "writer-temp-object",
        "writer-rollback-sentinel",
        "writer-close-sentinel",
        "writer-open-primary-and-cleanup-sentinel",
      ].includes(mode)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  const boundary = Object.freeze(Object.create(null)) as SqliteSchemaV1FreshVerifierTestBoundary;
  freshVerifierBoundaryStates.set(boundary as object, Object.freeze({ mode }));
  return boundary;
}

export function classifySqliteSchemaV1(db: Database.Database): SqliteSchemaV1State {
  const userVersion = readUserVersion(db);
  const catalogDigest = sqliteCatalogDigest(db);
  const applicationTableCount = readApplicationTableCount(db);
  const { actual, expected } = countTargetColumns(db);
  const base = { userVersion, catalogDigest, applicationTableCount, targetColumnCount: actual, expectedTargetColumnCount: expected };

  if (applicationTableCount === 0 && readApplicationObjectCount(db) === 0 && userVersion === 0) {
    return { kind: "fresh", ...base, reason: "empty SQLite catalog at user_version 0" };
  }
  if (![
    0,
    SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION,
    SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
    SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  ].includes(userVersion)) {
    return { kind: "unknown", ...base, reason: `unsupported user_version ${userVersion}` };
  }
  if (userVersion === 0 && catalogDigest === ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST) {
    return { kind: "accepted-legacy", ...base, reason: "exact accepted legacy catalog" };
  }
  if (userVersion === SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION
      && catalogDigest === SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST) {
    if (applicationTableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
        || actual !== PREPARED_LEGACY_TARGET_COLUMN_COUNT
        || expected !== PREPARED_LEGACY_EXPECTED_TARGET_COLUMN_COUNT) {
      return { kind: "drift", ...base, reason: "prepared legacy target shape is incomplete" };
    }
    const internalCatalogDigest = sqliteInternalCatalogDigest(db);
    if (internalCatalogDigest !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST) {
      return { kind: "drift", ...base, reason: "prepared legacy internal catalog is noncanonical" };
    }
    const physicalManifestDigest = sqliteSchemaV1PhysicalManifestDigest(db);
    if (physicalManifestDigest !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST) {
      return { kind: "drift", ...base, reason: "prepared legacy physical manifest is noncanonical" };
    }
    return { kind: "prepared-legacy", ...base, reason: "exact prepared legacy catalog" };
  }
  if (catalogDigest === SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
    if (userVersion === SQLITE_SCHEMA_V1_STAGED_USER_VERSION) {
      return { kind: "staged", ...base, reason: "exact staged schema-v1 catalog" };
    }
    if (userVersion === SQLITE_SCHEMA_V1_FINAL_USER_VERSION) {
      return { kind: "final", ...base, reason: "exact finalized schema-v1 catalog" };
    }
    return { kind: "drift", ...base, reason: "final catalog has an unversioned state" };
  }
  if (actual > 0 && actual < expected
      && !(userVersion === 0
        && applicationTableCount === SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
        && actual === ACCEPTED_LEGACY_TARGET_COLUMN_COUNT)) {
    return { kind: "partial", ...base, reason: `only ${actual}/${expected} target columns are present` };
  }
  if (applicationTableCount === SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
      || userVersion === SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION
      || userVersion === SQLITE_SCHEMA_V1_STAGED_USER_VERSION
      || userVersion === SQLITE_SCHEMA_V1_FINAL_USER_VERSION
      || actual === expected) {
    return { kind: "drift", ...base, reason: "known table/version shape has a noncanonical catalog" };
  }
  return { kind: "unknown", ...base, reason: "catalog is neither empty nor a recognized complete schema" };
}

export function createFreshSqliteSchemaV1(db: Database.Database): SqliteSchemaV1State {
  const before = classifySqliteSchemaV1(db);
  if (before.kind !== "fresh") throw rejectedState(before);
  const create = db.transaction(() => {
    const locked = classifySqliteSchemaV1(db);
    if (locked.kind !== "fresh") throw rejectedState(locked);
    db.exec(SQLITE_SCHEMA_V1_SQL);
    db.pragma(`user_version = ${SQLITE_SCHEMA_V1_STAGED_USER_VERSION}`);
    const staged = classifySqliteSchemaV1(db);
    if (staged.kind !== "staged") {
      throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", staged.reason);
    }
    assertSqliteInternalCatalog(db, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
    assertSqliteSchemaV1PhysicalManifest(db);
    assertSqliteSchemaV1DatabaseHealth(db);
    return staged;
  });
  return create.immediate();
}

export function coordinateSqliteSchemaV1WholeUpgrade(
  databasePath: string,
  handoff?: SqliteSchemaV1FinalizerHandoff,
  options: SqliteSchemaV1CoordinateOptions = {},
): SqliteSchemaV1WholeUpgradeResult {
  let testBoundary: FreshVerifierBoundaryState | undefined;
  let absoluteDatabasePath: string | undefined;
  let capabilityState: CapabilityState | undefined;
  let retainedLease: FileLeaseState | undefined;
  let writer: Database.Database | undefined;
  let committed = false;
  let outcome: "finalized" | "replayed" | undefined;
  let preservation: SqliteSchemaV1PreservationSnapshot | undefined;
  let sqliteOwnedState: SqliteOwnedStateSnapshot | undefined;
  let result: SqliteSchemaV1WholeUpgradeResult | undefined;
  let failure: unknown;
  try {
    const resolvedCapability = handoff === undefined
      ? undefined
      : resolveAndConsumeCapabilityHandoff(handoff);
    capabilityState = resolvedCapability?.state;
    retainedLease = capabilityState?.sourceFileLease;
    testBoundary = resolveCoordinateTestBoundary(options);
    absoluteDatabasePath = canonicalExistingDatabasePath(databasePath);
    if (capabilityState && capabilityState.databasePath !== absoluteDatabasePath) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "database path or handoff binding");
    }
    retainedLease ??= openFileLease(absoluteDatabasePath, true, "replay-root");
    if (retainedLease.databasePath !== absoluteDatabasePath) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_DRIFT", "retained lease path mismatch");
    }
    assertFileLeaseIdentity(retainedLease);
    if (!capabilityState) {
      const verified = verifyCommittedSqliteSchemaV1File(
        absoluteDatabasePath,
        retainedLease,
        undefined,
        undefined,
        testBoundary,
      );
      result = { status: "replayed", state: verified };
    } else {
      let writerFailure: unknown;
      try {
        writer = openExactDatabase(
          absoluteDatabasePath,
          false,
          retainedLease.identity,
          testBoundary?.mode === "writer-open-primary-and-cleanup-sentinel"
            ? "primary-and-cleanup-sentinel"
            : undefined,
        );
        assertFileLeaseIdentity(retainedLease);
        applyWriterTestFault(writer, testBoundary);
        assertConnectionBoundary(writer, absoluteDatabasePath);
        forceWritableSchemaOff(writer);
        writer.exec("BEGIN IMMEDIATE");
        forceWritableSchemaOff(writer);
        assertFileLeaseIdentity(retainedLease);
        assertConnectionBoundary(writer, absoluteDatabasePath);
        const locked = classifySqliteSchemaV1(writer);
        if (locked.kind === "final") {
          throw new SqliteSchemaV1CoordinatorError(
            "G006A_FINALIZER_MISMATCH",
            "final database does not accept a finalizer",
          );
        }
        if (locked.kind !== "accepted-legacy" && locked.kind !== "staged") throw rejectedState(locked);
        assertMintTimeSourceSnapshot(writer, locked, capabilityState);
        preservation = capabilityState.sourcePreservation;
        sqliteOwnedState = capabilityState.sourceSqliteOwnedState;
        executeFinalizerPlan(writer, capabilityState.plan, sqliteOwnedState);
        writer.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
        const after = classifySqliteSchemaV1(writer);
        if (after.kind !== "final") {
          throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_POSTCONDITION_FAILED", after.reason);
        }
        assertSqliteInternalCatalog(writer, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
        assertSqliteSchemaV1Preservation(
          preservation,
          captureSqliteSchemaV1PreservationSnapshot(writer, preservation),
        );
        assertSqliteSchemaV1PhysicalManifest(writer);
        assertSqliteOwnedState(sqliteOwnedState, captureSqliteOwnedState(writer));
        assertSqliteSchemaV1DatabaseHealth(writer);
        outcome = "finalized";
        if (!sqliteOwnedState) {
          throw new SqliteSchemaV1CoordinatorError(
            "G006A_SQLITE_OWNED_STATE_DRIFT",
            "missing transaction baseline",
          );
        }
        assertSqliteInternalCatalog(writer, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
        assertSqliteOwnedState(sqliteOwnedState, captureSqliteOwnedState(writer));
        assertFileLeaseIdentity(retainedLease);
        assertConnectionBoundary(writer, absoluteDatabasePath);
        writer.exec("COMMIT");
        committed = true;
        assertSqliteInternalCatalog(writer, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
        assertFileLeaseIdentity(retainedLease);
        assertConnectionBoundary(writer, absoluteDatabasePath);
      } catch (error) {
        writerFailure = error;
        if (writer && !committed && writer.open && writer.inTransaction) {
          try {
            rollbackWriterWithTestFault(writer, testBoundary);
          } catch (rollbackError) {
            writerFailure = retainCleanupFailure(writerFailure, rollbackError, "writer rollback");
          }
        }
      } finally {
        if (writer) {
          const scopedWriter = writer;
          writer = undefined;
          try {
            closeWriterWithTestFault(scopedWriter, testBoundary);
          } catch (closeError) {
            writerFailure = writerFailure === undefined
              ? closeError
              : retainCleanupFailure(writerFailure, closeError, "writer close");
          }
        }
      }
      if (writerFailure !== undefined) throw writerFailure;
      if (!committed || !outcome || !preservation || !sqliteOwnedState) {
        throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writer did not reach a verified commit");
      }
      assertFileLeaseIdentity(retainedLease);
      const verified = verifyCommittedSqliteSchemaV1File(
        absoluteDatabasePath,
        retainedLease,
        preservation,
        sqliteOwnedState,
        testBoundary,
      );
      result = { status: outcome, state: verified };
    }
  } catch (error) {
    failure = error;
  } finally {
    if (retainedLease) {
      try {
        if (capabilityState) {
          terminalizeCapabilityLease(capabilityState);
        } else {
          closeFileLease(retainedLease);
        }
      } catch (error) {
        failure = failure === undefined
          ? error
          : retainCleanupFailure(failure, error, "retained root close");
      }
    }
  }
  if (failure !== undefined) {
    if (committed) throw committedUnverified(failure);
    throw failure;
  }
  if (!result) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "coordinator produced no result");
  }
  return result;
}

/**
 * Consumes G-006B's private, one-shot B2 handoff and owns the complete prepared
 * legacy -> final transaction. No database handle, mutation plan, or callback
 * crosses the G-006B/coordinator boundary.
 */
export function finalizeSqliteSchemaV1PreparedFromG006b(
  handoff: SqliteG006bPreparedFinalizationHandoff,
): SqliteSchemaV1WholeUpgradeResult {
  // Claim first. A recognized capability is terminal on every subsequent path,
  // including malformed evidence and failures before the database is opened.
  const evidence = consumeSqliteG006bPreparedFinalizationHandoffForCoordinator(handoff);
  if (!/^g006b:v1:[0-9a-f]{64}$/u.test(evidence.sourcePreparedHandoffId)
      || !/^g006b:v1:[0-9a-f]{64}$/u.test(evidence.sourceCommittedHandoffId)
      || !/^[0-9a-f]{64}$/u.test(evidence.sourceBindingHash)
      || !/^[0-9a-f]{64}$/u.test(evidence.sourcePreservationAggregateSha256)
      || !/^[0-9a-f]{32}$/u.test(evidence.sourceFileId)
      || !/^[0-9]+$/u.test(evidence.sourceVolumeSerialNumber)
      || evidence.finalizationPreparedHandoffId !== `g006b-finalization:v1:${evidence.finalizationPreparedRecordSha256}`
      || !/^[0-9a-f]{64}$/u.test(evidence.finalizationPreparedRecordSha256)
      || evidence.tenantId.length === 0
      || evidence.workspaceId.length === 0
      || evidence.targetUserVersion !== SQLITE_SCHEMA_V1_FINAL_USER_VERSION
      || evidence.targetCatalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST
      || evidence.targetInternalCatalogDigest !== SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "G-006B handoff evidence pins");
  }

  let retainedLease: FileLeaseState | undefined;
  let writer: Database.Database | undefined;
  let preservation: SqliteSchemaV1PreservationSnapshot | undefined;
  let sqliteOwnedState: SqliteOwnedStateSnapshot | undefined;
  let committed = false;
  let result: SqliteSchemaV1WholeUpgradeResult | undefined;
  let failure: unknown;
  try {
    const absoluteDatabasePath = canonicalExistingDatabasePath(evidence.databasePath);
    retainedLease = openFileLease(absoluteDatabasePath, true, "replay-root");
    assertFileLeaseIdentity(retainedLease);
    try {
      writer = openExactDatabase(absoluteDatabasePath, false, retainedLease.identity);
      assertConnectionBoundary(writer, absoluteDatabasePath);
      forceWritableSchemaOff(writer);
      writer.pragma("foreign_keys = OFF");
      writer.pragma("legacy_alter_table = ON");
      writer.exec("BEGIN IMMEDIATE");
      forceWritableSchemaOff(writer);
      assertFileLeaseIdentity(retainedLease);
      assertConnectionBoundary(writer, absoluteDatabasePath);

      const locked = classifySqliteSchemaV1(writer);
      if (locked.kind !== "prepared-legacy"
          || locked.userVersion !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_USER_VERSION
          || locked.catalogDigest !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_CATALOG_DIGEST) {
        throw rejectedState(locked);
      }
      assertSqliteInternalCatalog(writer, SQLITE_SCHEMA_V1_PREPARED_LEGACY_INTERNAL_CATALOG_DIGEST);
      const preparedPhysical = sqliteSchemaV1PhysicalManifestDigest(writer);
      if (preparedPhysical !== SQLITE_SCHEMA_V1_PREPARED_LEGACY_PHYSICAL_MANIFEST_DIGEST) {
        throw new SqliteSchemaV1CoordinatorError("G006A_PHYSICAL_CATALOG_DRIFT", preparedPhysical);
      }
      assertPreparedLegacyLocationRows(writer);
      assertPreparedLegacyFoundation(writer, evidence.tenantId, evidence.workspaceId);
      const preservationAggregate = g006bPreservationAggregateSha256(writer);
      if (preservationAggregate !== evidence.sourcePreservationAggregateSha256) {
        throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", "G-006B preservation aggregate");
      }
      preservation = captureSqliteSchemaV1PreservationSnapshot(writer);
      sqliteOwnedState = captureSqliteOwnedState(writer);

      rebuildPreparedLegacyTransformTables(writer);
      writer.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);

      const after = classifySqliteSchemaV1(writer);
      if (after.kind !== "final"
          || after.userVersion !== SQLITE_SCHEMA_V1_FINAL_USER_VERSION
          || after.catalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
        throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_POSTCONDITION_FAILED", after.reason);
      }
      assertSqliteInternalCatalog(writer, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
      assertSqliteSchemaV1PhysicalManifest(writer);
      assertSqliteSchemaV1Preservation(
        preservation,
        captureSqliteSchemaV1PreservationSnapshot(writer, preservation),
      );
      assertSqliteOwnedState(sqliteOwnedState, captureSqliteOwnedState(writer));
      assertFinalLegacyLocationRows(writer);
      assertSqliteSchemaV1DatabaseHealth(writer);
      assertFileLeaseIdentity(retainedLease);
      assertConnectionBoundary(writer, absoluteDatabasePath);
      writer.exec("COMMIT");
      committed = true;
    } catch (error) {
      failure = error;
      if (writer?.open && writer.inTransaction) {
        try {
          writer.exec("ROLLBACK");
        } catch (rollbackError) {
          failure = retainCleanupFailure(failure, rollbackError, "G-006B finalizer rollback");
        }
      }
    } finally {
      if (writer) {
        const scopedWriter = writer;
        writer = undefined;
        try {
          closeExactDatabase(scopedWriter);
        } catch (closeError) {
          failure = failure === undefined
            ? closeError
            : retainCleanupFailure(failure, closeError, "G-006B finalizer writer close");
        }
      }
    }
    if (failure !== undefined) throw failure;
    if (!committed || !preservation || !sqliteOwnedState) {
      throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "G-006B finalizer did not commit");
    }
    assertFileLeaseIdentity(retainedLease);
    const verified = verifyCommittedSqliteSchemaV1File(
      absoluteDatabasePath,
      retainedLease,
      preservation,
      sqliteOwnedState,
      undefined,
    );
    result = { status: "finalized", state: verified };
  } catch (error) {
    failure = error;
  } finally {
    if (retainedLease) {
      try {
        closeFileLease(retainedLease);
      } catch (closeError) {
        failure = failure === undefined
          ? closeError
          : retainCleanupFailure(failure, closeError, "G-006B finalizer root close");
      }
    }
  }
  if (failure !== undefined) {
    if (committed) throw committedUnverified(failure);
    throw failure;
  }
  if (!result) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "G-006B finalizer produced no result");
  }
  return result;
}

function canonicalFinalSchemaRows(): readonly SqliteSchemaCatalogRow[] {
  const expected = new Database(":memory:");
  try {
    expected.exec(SQLITE_SCHEMA_V1_SQL);
    return Object.freeze(readSqliteSchemaCatalogPartition(expected).application.map((row) => Object.freeze({ ...row })));
  } finally {
    expected.close();
  }
}

function rebuildPreparedLegacyTransformTables(db: Database.Database): void {
  const expectedRows = canonicalFinalSchemaRows();
  const expectedTables = new Map(expectedRows
    .filter((row) => row.type === "table" && SQLITE_SCHEMA_V1_TRANSFORM_TABLES.some((table) => table === row.name))
    .map((row) => [row.name, row.sql] as const));
  if (expectedTables.size !== SQLITE_SCHEMA_V1_TRANSFORM_TABLES.length
      || [...expectedTables.values()].some((sql) => typeof sql !== "string")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", "canonical G-006B table definitions");
  }

  const temporaryNames = new Map<string, string>();
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const temporary = `__g006b_b2_${table}`;
    const collision = db.prepare("SELECT 1 FROM main.sqlite_schema WHERE name = ?").get(temporary);
    if (collision) {
      throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", `private rebuild collision ${temporary}`);
    }
    db.prepare(`ALTER TABLE ${quoteIdentifier(table)} RENAME TO ${quoteIdentifier(temporary)}`).run();
    temporaryNames.set(table, temporary);
  }

  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const sql = expectedTables.get(table);
    if (typeof sql !== "string") {
      throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", `missing canonical table ${table}`);
    }
    db.exec(sql);
  }

  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const temporary = temporaryNames.get(table)!;
    const sourceColumns = readTableColumns(db, temporary);
    const targetColumns = readTableColumns(db, table);
    const addedColumns = targetColumns.filter((column) => !sourceColumns.includes(column));
    const removedColumns = sourceColumns.filter((column) => !targetColumns.includes(column));
    const expectedAdded = table === "crawl_units" ? ["location_mode"] : [];
    if (!sameStrings(addedColumns, expectedAdded) || removedColumns.length !== 0) {
      throw new SqliteSchemaV1CoordinatorError(
        "G006A_FINALIZER_POSTCONDITION_FAILED",
        `${table} column boundary added=${addedColumns.join(",")} removed=${removedColumns.join(",")}`,
      );
    }
    const sourceProjection = sourceColumns.map(quoteIdentifier).join(", ");
    const targetProjection = table === "crawl_units"
      ? `${sourceProjection}, ${quoteIdentifier("location_mode")}`
      : sourceProjection;
    const selectProjection = table === "crawl_units"
      ? `${sourceProjection}, 'legacy_zip'`
      : sourceProjection;
    db.exec(`INSERT INTO ${quoteIdentifier(table)} (${targetProjection}) SELECT ${selectProjection} FROM ${quoteIdentifier(temporary)}`);
  }

  for (const table of [...SQLITE_SCHEMA_V1_TRANSFORM_TABLES].reverse()) {
    db.prepare(`DROP TABLE ${quoteIdentifier(temporaryNames.get(table)!)}`).run();
  }

  const existingNames = new Set((db.prepare("SELECT name FROM main.sqlite_schema").all() as Array<{ name: string }>).map((row) => row.name));
  for (const row of expectedRows) {
    if ((row.type !== "index" && row.type !== "trigger") || row.sql === null || existingNames.has(row.name)) continue;
    db.exec(row.sql);
    existingNames.add(row.name);
  }
}

function assertPreparedLegacyLocationRows(db: Database.Database): void {
  const row = db.prepare(`
    SELECT COUNT(*) AS invalid
    FROM crawl_units
    WHERE zip IS NULL OR trim(zip) = '' OR location_cell_id IS NOT NULL
  `).get() as { invalid: number | bigint };
  if (Number(row.invalid) !== 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "prepared crawl units are not legacy-zip rows");
  }
}

function assertPreparedLegacyFoundation(db: Database.Database, tenantId: string, workspaceId: string): void {
  const workspaceTables = new Set([
    "user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events",
    "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
  ]);
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const tenantMismatch = db.prepare(`
      SELECT COUNT(*) AS invalid
      FROM ${quoteIdentifier(table)}
      WHERE tenant_id IS NULL OR tenant_id <> ?
    `).get(tenantId) as { invalid: number | bigint };
    if (Number(tenantMismatch.invalid) !== 0) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", `${table} tenant foundation`);
    }
    if (!workspaceTables.has(table)) continue;
    const workspaceMismatch = db.prepare(`
      SELECT COUNT(*) AS invalid
      FROM ${quoteIdentifier(table)}
      WHERE workspace_id IS NULL OR workspace_id <> ?
    `).get(workspaceId) as { invalid: number | bigint };
    if (Number(workspaceMismatch.invalid) !== 0) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", `${table} workspace foundation`);
    }
  }
  const receipt = db.prepare(`
    SELECT COUNT(*) AS matching
    FROM compatibility_backfill_receipts
    WHERE tenant_id = ? AND workspace_id = ? AND status = 'completed'
  `).get(tenantId, workspaceId) as { matching: number | bigint };
  if (Number(receipt.matching) !== 1) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", "T028 foundation receipt");
  }
}

function g006bPreservationAggregateSha256(db: Database.Database): string {
  const summaries = readApplicationTableNames(db).map((name) => {
    const columns = readTableColumns(db, name);
    const projection = columns.map(quoteIdentifier).join(", ");
    const rows = db.prepare(`SELECT ${projection} FROM ${quoteIdentifier(name)}`).all() as Array<Record<string, unknown>>;
    const encodedRows = rows.map((row) => canonicalRow(columns, row)).sort(compareCodeUnits);
    return {
      name,
      columns,
      rowCount: rows.length,
      payloadSha256: sha256(`${G006B_PRESERVATION_DOMAIN}TABLE\0${name}\0${JSON.stringify(encodedRows)}`),
    };
  });
  return hashSqliteG006bDomain(`${G006B_PRESERVATION_DOMAIN}AGGREGATE\0`, summaries);
}

function assertFinalLegacyLocationRows(db: Database.Database): void {
  const row = db.prepare(`
    SELECT COUNT(*) AS invalid
    FROM crawl_units
    WHERE location_mode <> 'legacy_zip'
       OR zip IS NULL OR trim(zip) = ''
       OR location_cell_id IS NOT NULL
  `).get() as { invalid: number | bigint };
  if (Number(row.invalid) !== 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_POSTCONDITION_FAILED", "legacy-zip location-mode projection");
  }
}

export function captureSqliteSchemaV1PreservationSnapshot(
  db: Database.Database,
  baseline?: SqliteSchemaV1PreservationSnapshot,
): SqliteSchemaV1PreservationSnapshot {
  const currentTableNames = readApplicationTableNames(db);
  if (currentTableNames.length !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_APPLICATION_TABLE_COUNT_DRIFT",
      `${currentTableNames.length}/${SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT}`,
    );
  }
  const tableNames = baseline ? [...baseline.tableNames] : currentTableNames;
  if (baseline && !sameStrings(currentTableNames, tableNames)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_ROW_COUNT_DRIFT", "application table set");
  }
  const tables: Record<string, SqliteSchemaV1PreservationTable> = {};
  for (const table of tableNames) {
    const availableColumns = readTableColumns(db, table);
    const baselineTable = baseline?.tables[table];
    if (baseline && !baselineTable) {
      throw new SqliteSchemaV1CoordinatorError("G006A_PAYLOAD_DRIFT", `${table} baseline missing`);
    }
    const columns = baselineTable ? [...baselineTable.columns] : availableColumns;
    const missingColumn = columns.find((column) => !availableColumns.includes(column));
    if (missingColumn) {
      throw new SqliteSchemaV1CoordinatorError("G006A_PAYLOAD_DRIFT", `${table}.${missingColumn} missing`);
    }
    const selectColumns = columns.map(quoteIdentifier).join(", ");
    const rows = db.prepare(`SELECT ${selectColumns} FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    const encodedRows = rows.map((row) => canonicalRow(columns, row)).sort(compareCodeUnits);
    tables[table] = Object.freeze({
      columns: Object.freeze(columns),
      rowCount: rows.length,
      payloadDigest: sha256(JSON.stringify(encodedRows)),
    });
  }
  return Object.freeze({ tableNames: Object.freeze(tableNames), tables: Object.freeze(tables) });
}

export function assertSqliteSchemaV1Preservation(
  before: SqliteSchemaV1PreservationSnapshot,
  after: SqliteSchemaV1PreservationSnapshot,
): void {
  if (before.tableNames.length !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
      || !sameStrings(before.tableNames, after.tableNames)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_ROW_COUNT_DRIFT", "application table set");
  }
  for (const table of before.tableNames) {
    const expected = before.tables[table];
    const actual = after.tables[table];
    if (!expected || !actual || expected.rowCount !== actual.rowCount) {
      throw new SqliteSchemaV1CoordinatorError("G006A_ROW_COUNT_DRIFT", table);
    }
    if (!sameStrings(expected.columns, actual.columns) || expected.payloadDigest !== actual.payloadDigest) {
      throw new SqliteSchemaV1CoordinatorError("G006A_PAYLOAD_DRIFT", table);
    }
  }
}

export function assertSqliteSchemaV1DatabaseHealth(db: Database.Database): void {
  const tableCount = readApplicationTableCount(db);
  if (tableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_APPLICATION_TABLE_COUNT_DRIFT",
      `${tableCount}/${SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT}`,
    );
  }
  const foreignKeyFailures = db.pragma("foreign_key_check") as Array<Record<string, unknown>>;
  if (foreignKeyFailures.length > 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FOREIGN_KEY_CHECK_FAILED", JSON.stringify(foreignKeyFailures));
  }
  const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new SqliteSchemaV1CoordinatorError("G006A_INTEGRITY_CHECK_FAILED", JSON.stringify(integrity));
  }
}

export function sqliteCatalogDigest(db: Database.Database): string {
  const rows = readSqliteSchemaCatalogPartition(db).application;
  return sha256(JSON.stringify(rows.map((row) => [
    row.type,
    row.name,
    row.tbl_name,
    row.sql?.replace(/\r\n?/gu, "\n") ?? null,
  ])));
}

export function sqliteInternalCatalogDigest(db: Database.Database): string {
  return digestSqliteInternalCatalogRows(readSqliteInternalCatalogRows(db));
}

function readSqliteInternalCatalogRows(
  db: Database.Database,
): readonly SqliteSchemaCatalogRow[] {
  return readSqliteSchemaCatalogPartition(db).internal;
}

function readSqliteSchemaCatalogPartition(db: Database.Database): SqliteSchemaCatalogPartition {
  const rawRows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM main.sqlite_schema
    ORDER BY type COLLATE BINARY, name COLLATE BINARY, tbl_name COLLATE BINARY
  `).all() as Array<Record<string, unknown>>;
  const application: SqliteSchemaCatalogRow[] = [];
  const internal: SqliteSchemaCatalogRow[] = [];
  for (const rawRow of rawRows) {
    if (typeof rawRow.type !== "string"
        || typeof rawRow.name !== "string"
        || typeof rawRow.tbl_name !== "string"
        || (rawRow.sql !== null && typeof rawRow.sql !== "string")) {
      throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", "non-string main.sqlite_schema identity");
    }
    const row = Object.freeze({
      type: rawRow.type,
      name: rawRow.name,
      tbl_name: rawRow.tbl_name,
      sql: rawRow.sql,
    });
    (isSqliteInternalSchemaName(row.name) ? internal : application).push(row);
  }
  if (application.length + internal.length !== rawRows.length) {
    throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", "non-exhaustive main.sqlite_schema partition");
  }
  return Object.freeze({
    application: Object.freeze(application),
    internal: Object.freeze(internal),
  });
}

function isSqliteInternalSchemaName(name: string): boolean {
  return name.toLowerCase().startsWith("sqlite_");
}

function digestSqliteInternalCatalogRows(
  rows: readonly { type: string; name: string; tbl_name: string; sql: string | null }[],
): string {
  return sha256(JSON.stringify(rows.map((row) => [
    row.type,
    row.name,
    row.tbl_name,
    row.sql?.replace(/\r\n?/gu, "\n") ?? null,
  ])));
}

function expectedInternalCatalogDigest(
  state: "accepted-legacy" | "staged" | "final",
): string {
  return state === "accepted-legacy"
    ? SQLITE_SCHEMA_V1_ACCEPTED_LEGACY_INTERNAL_CATALOG_DIGEST
    : SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST;
}

function assertSqliteInternalCatalog(db: Database.Database, expectedDigest: string): void {
  const rows = readSqliteInternalCatalogRows(db);
  if (rows.some((row) => row.name === "sqlite_stat1" || row.name === "sqlite_stat4")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_INTERNAL_CATALOG_DRIFT", "ANALYZE statistics catalog");
  }
  const actualDigest = digestSqliteInternalCatalogRows(rows);
  if (actualDigest !== expectedDigest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_INTERNAL_CATALOG_DRIFT", actualDigest);
  }
}

export function sqliteSchemaV1PhysicalManifestDigest(db: Database.Database): string {
  return sha256(JSON.stringify(readPhysicalManifest(db)));
}

function captureSqliteOwnedState(db: Database.Database): SqliteOwnedStateSnapshot {
  const schemaRows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name = 'sqlite_sequence'
    ORDER BY type, name
  `).all() as Array<Record<string, unknown>>;
  if (schemaRows.length !== 1
      || schemaRows[0]?.type !== "table"
      || schemaRows[0]?.name !== "sqlite_sequence"
      || schemaRows[0]?.tbl_name !== "sqlite_sequence"
      || schemaRows[0]?.sql !== "CREATE TABLE sqlite_sequence(name,seq)") {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "sqlite_sequence schema presence or SQL");
  }
  const sequenceSchemaSql = String(schemaRows[0].sql);
  const columns = (db.prepare("PRAGMA table_xinfo(sqlite_sequence)").all() as Array<Record<string, unknown>>)
    .map((row) => canonicalMetadataRow(row, ["cid", "name", "type", "notnull", "dflt_value", "pk", "hidden"]));
  const expectedColumns = [
    { cid: 0, name: "name", type: "", notnull: 0, dflt_value: null, pk: 0, hidden: 0 },
    { cid: 1, name: "seq", type: "", notnull: 0, dflt_value: null, pk: 0, hidden: 0 },
  ];
  if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "sqlite_sequence columns");
  }
  const rawRows = db.prepare(`
    SELECT name, CAST(seq AS TEXT) AS seq_text, typeof(seq) AS seq_type
    FROM sqlite_sequence
    ORDER BY name COLLATE BINARY, rowid
  `).all() as Array<{ name: unknown; seq_text: unknown; seq_type: unknown }>;
  const sequenceRows = rawRows.map((row): SqliteSequenceRow => {
    if (typeof row.name !== "string"
        || !SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES.some((table) => table === row.name)
        || row.seq_type !== "integer"
        || typeof row.seq_text !== "string"
        || !/^(0|[1-9][0-9]*)$/u.test(row.seq_text)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "sqlite_sequence row shape");
    }
    const seq = BigInt(row.seq_text);
    if (seq < BIGINT_ZERO || seq > SQLITE_INTEGER_MAX) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "sqlite_sequence range");
    }
    return Object.freeze({ name: row.name, seq });
  });
  if (sequenceRows.length > SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES.length
      || new Set(sequenceRows.map((row) => row.name)).size !== sequenceRows.length) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "duplicate or unknown sqlite_sequence rows");
  }
  for (const table of SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES) {
    const countRow = db.prepare(`
      SELECT CAST(COUNT(*) AS TEXT) AS row_count
      FROM ${quoteIdentifier(table)}
    `).get() as { row_count: unknown };
    const maxRow = db.prepare(`
      SELECT
        CAST(MAX(${quoteIdentifier("id")}) AS TEXT) AS max_id,
        typeof(MAX(${quoteIdentifier("id")})) AS max_type
      FROM ${quoteIdentifier(table)}
    `).get() as { max_id: unknown; max_type: unknown };
    if (typeof countRow.row_count !== "string" || !/^(0|[1-9][0-9]*)$/u.test(countRow.row_count)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", `${table} row count`);
    }
    const rowCount = BigInt(countRow.row_count);
    if ((rowCount === BIGINT_ZERO && (maxRow.max_id !== null || maxRow.max_type !== "null"))
        || (rowCount > BIGINT_ZERO
          && (maxRow.max_type !== "integer"
            || typeof maxRow.max_id !== "string"
            || !/^-?(0|[1-9][0-9]*)$/u.test(maxRow.max_id)))) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", `${table} maximum id`);
    }
    const rawMaximumId = typeof maxRow.max_id === "string" ? BigInt(maxRow.max_id) : BIGINT_ZERO;
    const maximumId = rawMaximumId > BIGINT_ZERO ? rawMaximumId : BIGINT_ZERO;
    const sequence = sequenceRows.find((row) => row.name === table);
    if ((!sequence && rowCount > BIGINT_ZERO) || (sequence && sequence.seq < maximumId)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", `${table} high-water is below table data`);
    }
  }
  const digest = sha256(JSON.stringify({
    schemaRows,
    columns,
    sequenceRows: sequenceRows.map((row) => ({ name: row.name, seq: row.seq.toString() })),
  }));
  return Object.freeze({
    digest,
    sequencePresent: true,
    sequenceSchemaSql,
    sequenceRows: Object.freeze(sequenceRows),
  });
}

function assertSqliteOwnedState(expected: SqliteOwnedStateSnapshot, actual: SqliteOwnedStateSnapshot): void {
  if (!expected.sequencePresent
      || !actual.sequencePresent
      || expected.sequenceSchemaSql !== actual.sequenceSchemaSql
      || expected.digest !== actual.digest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_OWNED_STATE_DRIFT", "sqlite_sequence presence, schema, or rows");
  }
}

function assertSqliteSchemaV1PhysicalManifest(db: Database.Database): void {
  const digest = sqliteSchemaV1PhysicalManifestDigest(db);
  if (digest !== SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_PHYSICAL_CATALOG_DRIFT", digest);
  }
}

interface ResolvedCapabilityHandoff {
  readonly capability: object;
  readonly state: CapabilityState;
}

function resolveAndConsumeCapabilityHandoff(handoff: SqliteSchemaV1FinalizerHandoff): ResolvedCapabilityHandoff {
  const knownCapability = readKnownCapabilityFromHandoff(handoff);
  const knownState = knownCapability ? capabilityStates.get(knownCapability) : undefined;
  const claimed = Boolean(knownCapability && knownState?.leaseLifecycle.status === "ready");
  if (claimed && knownCapability && knownState) {
    knownState.leaseLifecycle.status = "consuming";
    consumedCapabilities.add(knownCapability);
    if (!capabilityLeaseFinalizer.unregister(knownState.leaseLifecycle.unregisterToken)) {
      let failure: unknown = new SqliteSchemaV1CoordinatorError(
        "G006A_FILE_IDENTITY_UNAVAILABLE",
        "capability lease registry invariant",
      );
      try {
        terminalizeCapabilityLease(knownState);
      } catch (closeError) {
        failure = retainCleanupFailure(failure, closeError, "capability claim terminal close");
      }
      throw failure;
    }
  }
  try {
    const record = readExactPlainRecord(
      handoff,
      ["capability", "handoffBindingId"],
      "G006A_FINALIZER_MISMATCH",
      "handoff",
    );
    const handoffBindingId = requireBindingId(record.handoffBindingId);
    if (!record.capability || typeof record.capability !== "object" || isProxy(record.capability)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
    }
    const capabilityObject = record.capability;
    const state = capabilityStates.get(capabilityObject);
    if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
    if (!claimed || capabilityObject !== knownCapability || state !== knownState) {
      if (consumedCapabilities.has(capabilityObject)) {
        throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_CONSUMED");
      }
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
    }
    if (state.handoffBindingId !== handoffBindingId) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "handoff binding");
    }
    return Object.freeze({ capability: capabilityObject, state });
  } catch (error) {
    let failure: unknown = error;
    if (claimed && knownState) {
      try {
        terminalizeCapabilityLease(knownState);
      } catch (closeError) {
        failure = retainCleanupFailure(failure, closeError, "recognized handoff terminal close");
      }
    }
    throw failure;
  }
}

function terminalizeCapabilityLease(state: CapabilityState): void {
  if (state.leaseLifecycle.status === "terminal") return;
  state.leaseLifecycle.status = "terminal";
  closeFileLease(state.sourceFileLease);
}

function readKnownCapabilityFromHandoff(handoff: SqliteSchemaV1FinalizerHandoff): object | undefined {
  if (!handoff || typeof handoff !== "object" || isProxy(handoff)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(handoff, "capability");
    if (!descriptor || !("value" in descriptor) || !descriptor.value || typeof descriptor.value !== "object") return undefined;
    return capabilityStates.has(descriptor.value) ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

type SqlOperation = "create-table" | "create-index" | "create-trigger" | "insert" | "update" | "delete";

interface SqlToken {
  readonly kind: "word" | "identifier" | "symbol";
  readonly value: string;
}

function copyAndValidateFinalizerPlan(value: unknown): SqliteSchemaV1FinalizerPlan {
  const operations = readDenseArray(value, "finalizer plan", 4096);
  const copy = Object.freeze(operations.map((operation, index) => copyFinalizerOperation(operation, index)));
  assertAutoincrementPlan(copy);
  return copy;
}

function copyFinalizerOperation(value: unknown, index: number): SqliteSchemaV1FinalizerOperation {
  const record = readPlainDataRecord(value, "G006A_FINALIZER_PLAN_REJECTED", `operation ${index}`);
  const kind = record.kind;
  if (typeof kind !== "string") {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `operation ${index} kind`);
  }
  if (["create-table", "create-index", "create-trigger"].includes(kind)) {
    assertExactRecordKeys(record, ["kind", "sql"], `operation ${index}`);
    const sql = requireSqlString(record.sql, `operation ${index}`);
    assertAllowedSqlStatement(kind as Extract<SqlOperation, `create-${string}`>, sql);
    return Object.freeze({ kind, sql }) as SqliteSchemaV1FinalizerOperation;
  }
  if (["insert", "update", "delete"].includes(kind)) {
    assertExactRecordKeys(record, ["kind", "sql", "binds"], `operation ${index}`, true);
    const sql = requireSqlString(record.sql, `operation ${index}`);
    assertAllowedSqlStatement(kind as Extract<SqlOperation, "insert" | "update" | "delete">, sql);
    const binds = record.binds === undefined
      ? Object.freeze([]) as readonly SqliteSchemaV1ScalarBind[]
      : copyScalarBinds(record.binds, index);
    return Object.freeze({ kind, sql, binds }) as SqliteSchemaV1FinalizerOperation;
  }
  if (["drop-table", "drop-index", "drop-trigger"].includes(kind)) {
    assertExactRecordKeys(record, ["kind", "name"], `operation ${index}`);
    const name = requireSchemaIdentifier(record.name);
    return Object.freeze({ kind, name }) as SqliteSchemaV1FinalizerOperation;
  }
  if (kind === "rename-table") {
    assertExactRecordKeys(record, ["kind", "from", "to"], `operation ${index}`);
    return Object.freeze({
      kind,
      from: requireSchemaIdentifier(record.from),
      to: requireSchemaIdentifier(record.to),
    });
  }
  if (kind === "restore-autoincrement-high-water") {
    assertExactRecordKeys(record, ["kind", "table"], `operation ${index}`);
    const table = requireAutoincrementTable(record.table);
    return Object.freeze({ kind, table });
  }
  throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `operation ${index} kind ${kind}`);
}

function copyScalarBinds(value: unknown, operationIndex: number): readonly SqliteSchemaV1ScalarBind[] {
  const binds = readDenseArray(value, `operation ${operationIndex} binds`, 32766);
  return Object.freeze(binds.map((bind, bindIndex) => {
    if (bind === null || typeof bind === "string" || typeof bind === "bigint") return bind;
    if (typeof bind === "number" && Number.isFinite(bind)) return bind;
    if (Buffer.isBuffer(bind) && !isProxy(bind)) return Buffer.from(bind);
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_FINALIZER_PLAN_REJECTED",
      `operation ${operationIndex} bind ${bindIndex} is not a copied SQLite scalar`,
    );
  }));
}

function assertAutoincrementPlan(plan: SqliteSchemaV1FinalizerPlan): void {
  const creates = plan.filter((operation): operation is Extract<SqliteSchemaV1FinalizerOperation, { kind: "create-table" }> => (
    operation.kind === "create-table" && sqlContainsKeyword(operation.sql, "AUTOINCREMENT")
  ));
  const restores = plan.filter((operation): operation is Extract<SqliteSchemaV1FinalizerOperation, { kind: "restore-autoincrement-high-water" }> => (
    operation.kind === "restore-autoincrement-high-water"
  ));
  if (creates.length === 0 && restores.length === 0) return;
  if (creates.length !== 1 || restores.length !== 1) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_FINALIZER_PLAN_REJECTED",
      "AUTOINCREMENT rebuild requires exactly one typed high-water restoration",
    );
  }
  const createTarget = readCreateTableTarget(creates[0].sql);
  if (createTarget !== restores[0].table) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_FINALIZER_PLAN_REJECTED",
      "AUTOINCREMENT rebuild target must be the whitelisted high-water table",
    );
  }
  const createIndex = plan.indexOf(creates[0]);
  const restoreIndex = plan.indexOf(restores[0]);
  const rebuildIndex = plan.findIndex((operation) => (
    (operation.kind === "drop-table" && operation.name === restores[0].table)
    || (operation.kind === "rename-table" && operation.from === restores[0].table)
  ));
  if (rebuildIndex < 0 || rebuildIndex >= createIndex || restoreIndex <= createIndex) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_FINALIZER_PLAN_REJECTED",
      "AUTOINCREMENT high-water restoration is only allowed after a table rebuild",
    );
  }
}

function sqlContainsKeyword(statement: string, keyword: string): boolean {
  return tokenizeSql(statement).some((token) => token.kind === "word" && token.value.toUpperCase() === keyword);
}

function readCreateTableTarget(statement: string): string {
  const tokens = tokenizeSql(statement);
  let index = 2;
  const wordAt = (tokenIndex: number): string => (
    tokens[tokenIndex]?.kind === "word" ? tokens[tokenIndex].value.toUpperCase() : ""
  );
  if (wordAt(index) === "IF" && wordAt(index + 1) === "NOT" && wordAt(index + 2) === "EXISTS") index += 3;
  const target = tokens[index];
  if (!target || (target.kind !== "word" && target.kind !== "identifier")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "missing create-table target");
  }
  return target.value;
}

function requireAutoincrementTable(value: unknown): typeof SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES[number] {
  if (typeof value !== "string"
      || !SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES.some((table) => table === value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", "unapproved AUTOINCREMENT high-water table");
  }
  return value as typeof SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES[number];
}

function restoreAutoincrementHighWater(
  db: Database.Database,
  source: SqliteOwnedStateSnapshot,
  table: typeof SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES[number],
): void {
  const expected = source.sequenceRows.find((row) => row.name === table);
  if (!expected) {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
    return;
  }
  const updated = db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?").run(expected.seq, table);
  if (updated.changes === 0) {
    db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)").run(table, expected.seq);
  }
}

function executeFinalizerPlan(
  db: Database.Database,
  plan: SqliteSchemaV1FinalizerPlan,
  sqliteOwnedState: SqliteOwnedStateSnapshot,
): void {
  for (const operation of plan) {
    switch (operation.kind) {
      case "create-table":
      case "create-index":
      case "create-trigger":
        executePreparedMutation(db, operation.kind, operation.sql, []);
        break;
      case "insert":
      case "update":
      case "delete":
        executePreparedMutation(db, operation.kind, operation.sql, operation.binds ?? []);
        break;
      case "drop-table":
        executeIdentifierDdl(db, `DROP TABLE ${quoteIdentifier(requireSchemaIdentifier(operation.name))}`);
        break;
      case "drop-index":
        executeIdentifierDdl(db, `DROP INDEX ${quoteIdentifier(requireSchemaIdentifier(operation.name))}`);
        break;
      case "drop-trigger":
        executeIdentifierDdl(db, `DROP TRIGGER ${quoteIdentifier(requireSchemaIdentifier(operation.name))}`);
        break;
      case "rename-table":
        executeIdentifierDdl(
          db,
          `ALTER TABLE ${quoteIdentifier(requireSchemaIdentifier(operation.from))} RENAME TO ${quoteIdentifier(requireSchemaIdentifier(operation.to))}`,
        );
        break;
      case "restore-autoincrement-high-water":
        restoreAutoincrementHighWater(db, sqliteOwnedState, operation.table);
        break;
    }
  }
}

function executePreparedMutation(
  db: Database.Database,
  operation: SqlOperation,
  statement: string,
  parameters: readonly SqliteSchemaV1ScalarBind[],
): void {
  assertAllowedSqlStatement(operation, statement);
  let prepared: Database.Statement;
  try {
    prepared = db.prepare(statement);
  } catch {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "statement is not one valid SQLite statement");
  }
  if (prepared.reader) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "reader statements are not available");
  }
  prepared.run(...parameters);
}

function executeIdentifierDdl(db: Database.Database, statement: string): void {
  try {
    db.prepare(statement).run();
  } catch (error) {
    if (error instanceof SqliteSchemaV1CoordinatorError) throw error;
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "invalid identifier DDL");
  }
}

function assertAllowedSqlStatement(operation: SqlOperation, statement: string): void {
  if (typeof statement !== "string" || statement.trim().length === 0 || statement.includes("\0")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "empty or invalid SQL");
  }
  const tokens = tokenizeSql(statement);
  const words = tokens.filter((token) => token.kind !== "symbol").map((token) => token.value.toUpperCase());
  for (const word of words) {
    if (FORBIDDEN_SQL_TOKENS.has(word) || word.toLowerCase().startsWith("sqlite_")) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", `forbidden SQL token ${word}`);
    }
  }
  const validPrefix = operation === "create-table"
    ? startsWithWords(words, ["CREATE", "TABLE"])
    : operation === "create-index"
      ? startsWithWords(words, ["CREATE", "INDEX"]) || startsWithWords(words, ["CREATE", "UNIQUE", "INDEX"])
      : operation === "create-trigger"
        ? startsWithWords(words, ["CREATE", "TRIGGER"])
        : operation === "insert"
          ? startsWithWords(words, ["INSERT", "INTO"])
          : operation === "update"
            ? words[0] === "UPDATE"
            : startsWithWords(words, ["DELETE", "FROM"]);
  if (!validPrefix) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", `invalid ${operation} statement boundary`);
  }
  assertSingleStatementTokens(operation, tokens);
  assertMainSchemaTargets(operation, tokens);
  assertNoSchemaQualification(operation, tokens);
}

function tokenizeSql(statement: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  while (index < statement.length) {
    const current = statement[index] ?? "";
    const next = statement[index + 1] ?? "";
    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      index += 2;
      while (index < statement.length && statement[index] !== "\n") index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = statement.indexOf("*/", index + 2);
      if (end < 0) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "unterminated SQL comment");
      index = end + 2;
      continue;
    }
    if (current === "'") {
      index = skipQuotedRegion(statement, index, "'", "'");
      continue;
    }
    if (current === '"' || current === "`") {
      const end = skipQuotedRegion(statement, index, current, current);
      tokens.push({ kind: "identifier", value: unescapeQuotedIdentifier(statement.slice(index + 1, end - 1), current) });
      index = end;
      continue;
    }
    if (current === "[") {
      const end = statement.indexOf("]", index + 1);
      if (end < 0) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "unterminated bracket identifier");
      tokens.push({ kind: "identifier", value: statement.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    const word = statement.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
    if (word) {
      tokens.push({ kind: "word", value: word });
      index += word.length;
      continue;
    }
    if (".;(),".includes(current)) tokens.push({ kind: "symbol", value: current });
    index += 1;
  }
  return tokens;
}

function skipQuotedRegion(statement: string, start: number, quote: string, escapeQuote: string): number {
  let index = start + 1;
  while (index < statement.length) {
    if (statement[index] === quote) {
      if (statement[index + 1] === escapeQuote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "unterminated SQL quote");
}

function unescapeQuotedIdentifier(identifier: string, quote: string): string {
  return identifier.replaceAll(`${quote}${quote}`, quote);
}

function startsWithWords(actual: readonly string[], expected: readonly string[]): boolean {
  return expected.every((word, index) => actual[index] === word);
}

function isForbiddenSchemaIdentifier(identifier: string): boolean {
  return FORBIDDEN_SQL_TOKENS.has(identifier.toUpperCase()) || identifier.toLowerCase().startsWith("sqlite_");
}

function assertSingleStatementTokens(operation: SqlOperation, tokens: readonly SqlToken[]): void {
  if (operation !== "create-trigger") {
    const semicolons = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.kind === "symbol" && token.value === ";");
    if (semicolons.length > 1 || (semicolons[0] && semicolons[0].index !== tokens.length - 1)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "multiple SQL statements");
    }
    return;
  }

  const triggerBegin = tokens.findIndex((token) => token.kind === "word" && token.value.toUpperCase() === "BEGIN");
  if (triggerBegin < 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "trigger body boundary");
  }
  let caseDepth = 0;
  let triggerEnd = -1;
  for (let index = triggerBegin + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "word") continue;
    const word = token.value.toUpperCase();
    if (word === "CASE") caseDepth += 1;
    if (word === "END") {
      if (caseDepth > 0) caseDepth -= 1;
      else {
        triggerEnd = index;
        break;
      }
    }
  }
  const trailing = triggerEnd < 0 ? tokens : tokens.slice(triggerEnd + 1);
  if (triggerEnd < 0
      || trailing.length > 1
      || (trailing[0] && (trailing[0].kind !== "symbol" || trailing[0].value !== ";"))) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "multiple SQL statements or malformed trigger");
  }
}

function assertMainSchemaTargets(operation: SqlOperation, tokens: readonly SqlToken[]): void {
  const wordAt = (index: number): string => tokens[index]?.kind === "word" ? tokens[index].value.toUpperCase() : "";
  const skipIfNotExists = (index: number): number => (
    wordAt(index) === "IF" && wordAt(index + 1) === "NOT" && wordAt(index + 2) === "EXISTS" ? index + 3 : index
  );
  if (operation === "create-table") {
    assertUnqualifiedTarget(tokens, skipIfNotExists(2), "table");
    return;
  }
  if (operation === "create-index") {
    let index = wordAt(1) === "UNIQUE" ? 3 : 2;
    index = skipIfNotExists(index);
    assertUnqualifiedTarget(tokens, index, "index");
    const onIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > index && token.kind === "word" && token.value.toUpperCase() === "ON");
    assertUnqualifiedTarget(tokens, onIndex + 1, "index table");
    return;
  }
  if (operation === "create-trigger") {
    const index = skipIfNotExists(2);
    assertUnqualifiedTarget(tokens, index, "trigger");
    const onIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > index && token.kind === "word" && token.value.toUpperCase() === "ON");
    assertUnqualifiedTarget(tokens, onIndex + 1, "trigger table");
    return;
  }
  const targetIndex = operation === "insert" ? 2 : operation === "update" ? 1 : 2;
  assertUnqualifiedTarget(tokens, targetIndex, `${operation} table`);
}

function assertUnqualifiedTarget(tokens: readonly SqlToken[], index: number, detail: string): void {
  const target = tokens[index];
  if (!target || (target.kind !== "word" && target.kind !== "identifier")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", `missing ${detail}`);
  }
  if (tokens[index + 1]?.kind === "symbol" && tokens[index + 1]?.value === ".") {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", `${detail} must be unqualified main schema`);
  }
  if (isForbiddenSchemaIdentifier(target.value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", `forbidden ${detail}`);
  }
}

function assertNoSchemaQualification(operation: SqlOperation, tokens: readonly SqlToken[]): void {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.kind !== "symbol" || tokens[index]?.value !== ".") continue;
    const qualifier = tokens[index - 1];
    if (!qualifier || (qualifier.kind !== "word" && qualifier.kind !== "identifier")) continue;
    if (operation === "create-trigger") {
      const routeIntroducer = tokens[index - 2];
      if (!routeIntroducer
          || routeIntroducer.kind !== "word"
          || !["UPDATE", "INTO", "FROM", "JOIN", "TABLE", "INDEX", "ON"].includes(routeIntroducer.value.toUpperCase())) {
        continue;
      }
    }
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "qualified or attached-schema route");
  }
}

function verifyCommittedSqliteSchemaV1File(
  absoluteDatabasePath: string,
  retainedLease: FileLeaseState,
  preservation: SqliteSchemaV1PreservationSnapshot | undefined,
  sqliteOwnedState: SqliteOwnedStateSnapshot | undefined,
  testBoundary: FreshVerifierBoundaryState | undefined,
): SqliteSchemaV1State {
  let verifier: Database.Database | undefined;
  let verifiedState: SqliteSchemaV1State | undefined;
  let failure: unknown;
  try {
    if (testBoundary?.mode === "fail-verifier-open") throw new Error("simulated verifier open failure");
    if (testBoundary?.mode === "replace-before-verifier") replaceDatabaseFileWithExactCloneForTest(absoluteDatabasePath);
    assertFileLeaseIdentity(retainedLease);
    verifier = openExactDatabase(absoluteDatabasePath, true, retainedLease.identity);
    assertVerifierIdentity(verifier, absoluteDatabasePath, retainedLease);
    assertWritableSchemaOff(verifier);
    const dataVersionBefore = readVerifierDataVersion(verifier);
    verifier.exec("BEGIN DEFERRED");
    try {
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      assertWritableSchemaOff(verifier);
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      const state = classifySqliteSchemaV1(verifier);
      if (!preservation
          && !sqliteOwnedState
          && (state.kind === "accepted-legacy" || state.kind === "staged")) {
        throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
      }
      if (state.kind !== "final"
          || state.userVersion !== SQLITE_SCHEMA_V1_FINAL_USER_VERSION
          || state.catalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST
          || state.applicationTableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
          || state.targetColumnCount !== state.expectedTargetColumnCount) {
        throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", state.reason);
      }
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      assertSqliteInternalCatalog(verifier, SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST);
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      assertSqliteSchemaV1PhysicalManifest(verifier);
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      const verifiedPreservation = captureSqliteSchemaV1PreservationSnapshot(verifier, preservation);
      if (preservation) assertSqliteSchemaV1Preservation(preservation, verifiedPreservation);
      applyVerifierTestFault(verifier, absoluteDatabasePath, testBoundary, "after-preservation");
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      const verifiedSqliteOwnedState = captureSqliteOwnedState(verifier);
      if (sqliteOwnedState) assertSqliteOwnedState(sqliteOwnedState, verifiedSqliteOwnedState);
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      assertSqliteSchemaV1DatabaseHealth(verifier);
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      applyVerifierTestFault(verifier, absoluteDatabasePath, testBoundary, "before-return");
      assertVerifierReadSnapshot(verifier, absoluteDatabasePath, retainedLease);
      verifier.exec("COMMIT");
      const dataVersionAfter = readVerifierDataVersion(verifier);
      if (dataVersionAfter !== dataVersionBefore) {
        throw new SqliteSchemaV1CoordinatorError(
          "G006A_SOURCE_SNAPSHOT_DRIFT",
          `verifier data_version changed ${dataVersionBefore}->${dataVersionAfter}`,
        );
      }
      assertVerifierIdentity(verifier, absoluteDatabasePath, retainedLease);
      verifiedState = state;
    } catch (error) {
      failure = error;
      try {
        if (verifier.open && verifier.inTransaction) verifier.exec("ROLLBACK");
      } catch (rollbackError) {
        failure = retainCleanupFailure(failure, rollbackError, "verifier read rollback");
      }
    }
  } catch (error) {
    if (failure === undefined) failure = error;
  } finally {
    if (verifier) {
      try {
        closeExactDatabase(verifier);
      } catch (closeError) {
        failure = failure === undefined
          ? closeError
          : retainCleanupFailure(failure, closeError, "verifier close");
      }
    }
  }
  try {
    assertFileLeaseIdentity(retainedLease);
  } catch (identityError) {
    failure = failure === undefined
      ? identityError
      : retainCleanupFailure(failure, identityError, "retained root final identity");
  }
  if (failure !== undefined) throw failure;
  if (!verifiedState) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "fresh verifier produced no state");
  }
  return verifiedState;
}

function assertVerifierIdentity(
  verifier: Database.Database,
  absoluteDatabasePath: string,
  retainedLease: FileLeaseState,
): void {
  assertFileLeaseIdentity(retainedLease);
  assertConnectionBoundary(verifier, absoluteDatabasePath);
}

function assertVerifierReadSnapshot(
  verifier: Database.Database,
  absoluteDatabasePath: string,
  retainedLease: FileLeaseState,
): void {
  assertVerifierIdentity(verifier, absoluteDatabasePath, retainedLease);
  if (!verifier.inTransaction) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "fresh verifier is outside its read transaction");
  }
}

function readVerifierDataVersion(verifier: Database.Database): number {
  const value = verifier.pragma("main.data_version", { simple: true }) as unknown;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_SOURCE_SNAPSHOT_DRIFT",
      "fresh verifier main.data_version is not a nonnegative safe integer",
    );
  }
  return value;
}

function retainCleanupFailure(primary: unknown, cleanup: unknown, phase: string): unknown {
  if (!(primary instanceof Error)) return primary;
  try {
    const prior = (primary as Error & { g006aCleanupFailures?: readonly unknown[] }).g006aCleanupFailures ?? [];
    Object.defineProperty(primary, "g006aCleanupFailures", {
      configurable: true,
      value: Object.freeze([...prior, Object.freeze({ phase, error: cleanup })]),
    });
  } catch {
    // Preserve the primary failure even if diagnostic attachment is unavailable.
  }
  return primary;
}

function readPhysicalManifest(db: Database.Database): readonly PhysicalTableManifest[] {
  return readApplicationTableNames(db).map((table) => {
    const columns = (db.prepare(`PRAGMA table_xinfo(${quoteIdentifier(table)})`).all() as Array<Record<string, unknown>>)
      .map((row) => canonicalMetadataRow(row, ["cid", "name", "type", "notnull", "dflt_value", "pk", "hidden"]));
    const foreignKeys = (db.prepare("SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq").all(table) as Array<Record<string, unknown>>)
      .map((row) => canonicalMetadataRow(row, ["id", "seq", "table", "from", "to", "on_update", "on_delete", "match"]));
    const indexRows = db.prepare(`
      SELECT name, "unique", origin, partial
      FROM pragma_index_list(?)
      ORDER BY name COLLATE BINARY
    `).all(table) as Array<{ name: string; unique: number; origin: string; partial: number }>;
    const indexes = indexRows.map((index): PhysicalIndexManifest => {
      const sqlRow = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(index.name) as { sql: string | null } | undefined;
      const sql = sqlRow?.sql?.replace(/\r\n?/gu, "\n") ?? null;
      const indexColumns = (db.prepare(`
        SELECT seqno, cid, name, "desc", coll, key
        FROM pragma_index_xinfo(?)
        ORDER BY seqno
      `).all(index.name) as Array<Record<string, unknown>>)
        .map((row) => canonicalMetadataRow(row, ["seqno", "cid", "name", "desc", "coll", "key"]));
      return Object.freeze({
        name: index.name,
        unique: Number(index.unique),
        origin: String(index.origin),
        partial: Number(index.partial),
        sql,
        predicate: readCanonicalPartialPredicate(sql),
        columns: Object.freeze(indexColumns),
      });
    });
    return Object.freeze({
      name: table,
      columns: Object.freeze(columns),
      foreignKeys: Object.freeze(foreignKeys),
      indexes: Object.freeze(indexes),
    });
  });
}

function canonicalMetadataRow(
  row: Record<string, unknown>,
  columns: readonly string[],
): Readonly<Record<string, string | number | null>> {
  const result: Record<string, string | number | null> = {};
  for (const column of columns) {
    const value = row[column];
    result[column] = value === null || value === undefined
      ? null
      : typeof value === "number"
        ? value
        : String(value);
  }
  return Object.freeze(result);
}

function readCanonicalPartialPredicate(sql: string | null): string | null {
  if (!sql) return null;
  const match = sql.match(/\sWHERE\s+([\s\S]+)$/iu);
  return match?.[1]?.replace(/\s+/gu, " ").trim() ?? null;
}

function readExactPlainRecord(
  value: unknown,
  keys: readonly string[],
  code: SqliteSchemaV1CoordinatorErrorCode,
  detail: string,
): Record<string, unknown> {
  const record = readPlainDataRecord(value, code, detail);
  assertExactRecordKeys(record, keys, detail, false, code);
  return record;
}

function readPlainDataRecord(
  value: unknown,
  code: SqliteSchemaV1CoordinatorErrorCode,
  detail: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || isProxy(value)) {
    throw new SqliteSchemaV1CoordinatorError(code, `${detail} must be a non-proxy plain data object`);
  }
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new SqliteSchemaV1CoordinatorError(code, `${detail} has a non-plain prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        throw new SqliteSchemaV1CoordinatorError(code, `${detail} contains a symbol key`);
      }
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        throw new SqliteSchemaV1CoordinatorError(code, `${detail}.${key} is not a data property`);
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof SqliteSchemaV1CoordinatorError) throw error;
    throw new SqliteSchemaV1CoordinatorError(code, `${detail} inspection failed`);
  }
}

function assertExactRecordKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  detail: string,
  allowMissing = false,
  code: SqliteSchemaV1CoordinatorErrorCode = "G006A_FINALIZER_PLAN_REJECTED",
): void {
  const keys = Object.keys(record);
  if (keys.some((key) => !allowedKeys.includes(key))
      || (!allowMissing && (keys.length !== allowedKeys.length || allowedKeys.some((key) => !(key in record))))) {
    throw new SqliteSchemaV1CoordinatorError(code, `${detail} has unknown or missing keys`);
  }
}

function readDenseArray(value: unknown, detail: string, maxLength: number): unknown[] {
  if (!value || typeof value !== "object" || isProxy(value) || !Array.isArray(value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} must be a non-proxy array`);
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} has a non-plain array prototype`);
    }
    const lengthValue = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} length`);
    }
    if (lengthValue > maxLength) {
      throw new SqliteSchemaV1CoordinatorError(
        "G006A_FINALIZER_PLAN_REJECTED",
        `${detail} exceeds maximum length ${maxLength}`,
      );
    }
    const length = lengthValue;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const allowed = new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string" || !allowed.has(key)) || ownKeys.length !== allowed.size) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} is sparse or has custom properties`);
    }
    return Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail}[${index}] accessor`);
      }
      return descriptor.value;
    });
  } catch (error) {
    if (error instanceof SqliteSchemaV1CoordinatorError) throw error;
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} inspection failed`);
  }
}

function requireSqlString(value: unknown, detail: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_000_000) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} SQL`);
  }
  return value;
}

function requireSchemaIdentifier(value: unknown): string {
  if (typeof value !== "string"
      || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)
      || isForbiddenSchemaIdentifier(value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "invalid main-schema identifier");
  }
  return value;
}

function resolveCoordinateTestBoundary(options: SqliteSchemaV1CoordinateOptions): FreshVerifierBoundaryState | undefined {
  const record = readPlainDataRecord(options, "G006A_VERIFIER_BOUNDARY_REJECTED", "coordinate options");
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "freshVerifierTestBoundary")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "unknown coordinate option");
  }
  const boundary = record.freshVerifierTestBoundary;
  if (boundary === undefined) return undefined;
  if (process.env.NODE_ENV !== "test" || !boundary || typeof boundary !== "object" || isProxy(boundary)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  const state = freshVerifierBoundaryStates.get(boundary);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "unknown test boundary");
  return state;
}

function applyWriterTestFault(db: Database.Database, boundary: FreshVerifierBoundaryState | undefined): void {
  if (boundary?.mode === "writer-attached-schema") {
    db.exec("ATTACH DATABASE ':memory:' AS g006a_unexpected_attachment");
  }
  if (boundary?.mode === "writer-temp-object") {
    db.exec("CREATE TEMP TABLE g006a_unexpected_temp_object (id INTEGER)");
  }
}

function rollbackWriterWithTestFault(
  writer: Database.Database,
  boundary: FreshVerifierBoundaryState | undefined,
): void {
  writer.exec("ROLLBACK");
  if (writer.inTransaction) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writer rollback left a transaction open");
  }
  if (boundary?.mode === "writer-rollback-sentinel") {
    if (process.env.NODE_ENV !== "test") {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
    }
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_VERIFIER_BOUNDARY_REJECTED",
      "simulated writer rollback cleanup failure",
    );
  }
}

function closeWriterWithTestFault(
  writer: Database.Database,
  boundary: FreshVerifierBoundaryState | undefined,
): void {
  closeExactDatabase(writer);
  if (writer.open) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writer close left the connection open");
  }
  if (boundary?.mode === "writer-close-sentinel") {
    if (process.env.NODE_ENV !== "test") {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
    }
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_VERIFIER_BOUNDARY_REJECTED",
      "simulated writer close cleanup failure",
    );
  }
}

function applyVerifierTestFault(
  db: Database.Database,
  absoluteDatabasePath: string,
  boundary: FreshVerifierBoundaryState | undefined,
  phase: "after-preservation" | "before-return",
): void {
  const mode = boundary?.mode;
  const shouldReplace = (phase === "after-preservation" && mode === "replace-after-verifier-preservation")
    || (phase === "before-return" && mode === "replace-before-verifier-return");
  const shouldRemove = (phase === "after-preservation" && mode === "remove-after-verifier-preservation")
    || (phase === "before-return" && mode === "remove-before-verifier-return");
  const shouldMutateFromWal = (phase === "after-preservation" && mode === "wal-mutate-after-verifier-preservation")
    || (phase === "before-return" && mode === "wal-mutate-before-verifier-return");
  if (shouldMutateFromWal) {
    if (!db.inTransaction) {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "WAL fault outside verifier read transaction");
    }
    mutatePreservedZipFromSeparateWalWriterForTest(absoluteDatabasePath);
    return;
  }
  if (!shouldReplace && !shouldRemove) return;
  if (db.open) db.close();
  if (shouldReplace) {
    replaceDatabaseFileWithExactCloneForTest(absoluteDatabasePath);
  } else {
    removeDatabasePathForTest(absoluteDatabasePath);
  }
}

function mutatePreservedZipFromSeparateWalWriterForTest(absoluteDatabasePath: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "WAL mutation outside test runtime");
  }
  const writer = new Database(absoluteDatabasePath, { fileMustExist: true });
  try {
    const journalMode = writer.pragma("journal_mode", { simple: true });
    if (typeof journalMode !== "string" || journalMode.toLowerCase() !== "wal") {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "WAL mutation requires WAL mode");
    }
    const mutation = writer.prepare(`
      UPDATE zip_codes
      SET city = city || ':concurrent-wal-drift'
      WHERE zip = ?
    `).run(SQLITE_WAL_TEST_ZIP);
    if (mutation.changes !== 1) {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "missing preserved WAL test row");
    }
  } finally {
    writer.close();
  }
}

function replaceDatabaseFileWithExactCloneForTest(absoluteDatabasePath: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "file replacement outside test runtime");
  }
  const clonePath = `${absoluteDatabasePath}.g006a-verifier-clone`;
  const originalPath = `${absoluteDatabasePath}.g006a-verifier-original`;
  rmSync(clonePath, { force: true });
  rmSync(originalPath, { force: true });
  copyFileSync(absoluteDatabasePath, clonePath);
  renameSync(absoluteDatabasePath, originalPath);
  try {
    renameSync(clonePath, absoluteDatabasePath);
    rmSync(originalPath, { force: true });
  } catch (error) {
    if (!existsSync(absoluteDatabasePath) && existsSync(originalPath)) renameSync(originalPath, absoluteDatabasePath);
    rmSync(clonePath, { force: true });
    throw error;
  }
}

function removeDatabasePathForTest(absoluteDatabasePath: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "file removal outside test runtime");
  }
  const removedPath = `${absoluteDatabasePath}.g006a-verifier-removed`;
  rmSync(removedPath, { force: true });
  renameSync(absoluteDatabasePath, removedPath);
}

function assertMintTimeSourceSnapshot(
  db: Database.Database,
  locked: SqliteSchemaV1State,
  capability: CapabilityState,
): void {
  if (locked.kind !== capability.sourceState
      || locked.userVersion !== capability.sourceUserVersion
      || locked.catalogDigest !== capability.sourceCatalogDigest
      || capability.targetCatalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", "source state, version, or catalog");
  }
  if (capability.sourceInternalCatalogDigest !== expectedInternalCatalogDigest(locked.kind)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SQLITE_INTERNAL_CATALOG_DRIFT", "mint-time internal catalog pin");
  }
  assertSqliteInternalCatalog(db, capability.sourceInternalCatalogDigest);
  const physicalDigest = sqliteSchemaV1PhysicalManifestDigest(db);
  if (physicalDigest !== capability.sourcePhysicalManifestDigest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", "source physical manifest");
  }
  assertSqliteSchemaV1Preservation(
    capability.sourcePreservation,
    captureSqliteSchemaV1PreservationSnapshot(db, capability.sourcePreservation),
  );
  assertSqliteOwnedState(capability.sourceSqliteOwnedState, captureSqliteOwnedState(db));
  assertSqliteSchemaV1DatabaseHealth(db);
}

function assertConnectionBoundary(db: Database.Database, absoluteDatabasePath: string): void {
  assertLeasedFileIdentity(db, absoluteDatabasePath);
  const databases = db.pragma("database_list") as Array<{ seq: number; name: string; file: string }>;
  const main = databases.filter((entry) => entry.name === SQLITE_SCHEMA_V1_PRIMARY_SCHEMA);
  if (main.length !== 1
      || databases.some((entry) => entry.name !== SQLITE_SCHEMA_V1_PRIMARY_SCHEMA && entry.name !== "temp")
      || databases.some((entry) => entry.name === "temp" && entry.file !== "")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "unexpected attached database");
  }
  let mainPath: string;
  try {
    mainPath = realpathSync.native(main[0]?.file ?? "");
  } catch {
    throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "main database path");
  }
  if (mainPath !== absoluteDatabasePath) {
    throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "wrong main database path");
  }
  const tempCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_temp_schema").get() as { count: number };
  if (Number(tempCount.count) !== 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "unexpected temp-schema objects");
  }
}

function forceWritableSchemaOff(db: Database.Database): void {
  db.pragma("writable_schema = OFF");
  assertWritableSchemaOff(db);
}

function assertWritableSchemaOff(db: Database.Database): void {
  if (Number(db.pragma("writable_schema", { simple: true })) !== 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writable_schema is enabled");
  }
}

function requireBindingId(value: unknown): string {
  if (typeof value !== "string"
      || value.length === 0
      || value.length > 512
      || value.trim() !== value) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "handoff binding ID");
  }
  return value;
}

function canonicalExistingDatabasePath(value: unknown): string {
  if (value === ":memory:" || value === "") {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_BACKED_FINALIZATION_REQUIRED");
  }
  if (typeof value !== "string"
      || value.trim() !== value
      || value.includes("\0")
      || !isAbsolute(value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_DATABASE_PATH_REJECTED", "path must be an exact absolute canonical file path");
  }
  try {
    const resolved = resolve(value);
    const canonical = realpathSync.native(resolved);
    if (value !== resolved || resolved !== canonical || !statSync(canonical).isFile()) {
      throw new SqliteSchemaV1CoordinatorError("G006A_DATABASE_PATH_REJECTED", "path alias or non-file target");
    }
    return canonical;
  } catch (error) {
    if (error instanceof SqliteSchemaV1CoordinatorError) throw error;
    throw new SqliteSchemaV1CoordinatorError("G006A_DATABASE_PATH_REJECTED", "database file does not exist");
  }
}

function openExactDatabase(
  absoluteDatabasePath: string,
  readonly: boolean,
  expectedIdentity?: PhysicalFileIdentity,
  testFault?: "primary-and-cleanup-sentinel",
): Database.Database {
  let db: Database.Database | undefined;
  let lease: FileLeaseState | undefined;
  try {
    lease = openFileLease(absoluteDatabasePath, readonly);
    if (expectedIdentity && !sameFileIdentity(lease.identity, expectedIdentity)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_DRIFT", "opened lease differs from mint-time file");
    }
    if (testFault === "primary-and-cleanup-sentinel") {
      if (process.env.NODE_ENV !== "test") {
        throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
      }
      throw new SqliteSchemaV1CoordinatorError(
        "G006A_CONNECTION_BOUNDARY_REJECTED",
        "simulated writer open primary failure",
      );
    }
    db = new Database(absoluteDatabasePath, { readonly, fileMustExist: true });
    const state = db as unknown as { readonly memory?: boolean; readonly name?: string; readonly readonly?: boolean };
    if (state.memory !== false
        || state.readonly !== readonly
        || state.name !== absoluteDatabasePath) {
      throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "connection mode or path");
    }
    connectionLeaseStates.set(db, lease);
    assertLeasedFileIdentity(db, absoluteDatabasePath);
    return db;
  } catch (error) {
    let failure: unknown = error;
    if (db) connectionLeaseStates.delete(db);
    try {
      if (db?.open) db.close();
    } catch (closeError) {
      failure = retainCleanupFailure(failure, closeError, "open database close");
    }
    if (lease) {
      try {
        closeFileLease(lease);
      } catch (closeError) {
        failure = retainCleanupFailure(failure, closeError, "open lease close");
      }
    }
    if (testFault === "primary-and-cleanup-sentinel" && process.env.NODE_ENV === "test") {
      failure = retainCleanupFailure(
        failure,
        new SqliteSchemaV1CoordinatorError(
          "G006A_VERIFIER_BOUNDARY_REJECTED",
          "simulated writer open cleanup failure",
        ),
        "open lease close",
      );
    }
    throw failure;
  }
}

function openFileLease(
  absoluteDatabasePath: string,
  readonly: boolean,
  purpose: FileLeaseState["purpose"] = "connection",
): FileLeaseState {
  if (process.platform !== "win32") {
    throw new SqliteSchemaV1CoordinatorError(
      "G006A_FILE_IDENTITY_UNAVAILABLE",
      "cross-handle replacement exclusion is only proven for Windows SQLite locking",
    );
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(absoluteDatabasePath, readonly ? "r" : "r+");
    const lease: FileLeaseState = {
      descriptorLease: { descriptor },
      identity: readStableFileIdentityFromDescriptor(descriptor),
      databasePath: absoluteDatabasePath,
      auditId: nextLeaseAuditId,
      purpose,
    };
    assertFileLeaseIdentity(lease);
    nextLeaseAuditId += 1;
    if (process.env.NODE_ENV === "test") {
      leaseAuditEvents.push(Object.freeze({ id: lease.auditId, event: "open", purpose }));
    }
    return lease;
  } catch (error) {
    let failure: unknown = error;
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch (closeError) {
        failure = retainCleanupFailure(failure, closeError, "partial file lease close");
      }
    }
    throw failure;
  }
}

function closeDescriptorLease(lease: DescriptorLease): boolean {
  const descriptor = lease.descriptor;
  if (descriptor === null) return false;
  lease.descriptor = null;
  closeSync(descriptor);
  return true;
}

function closeFileLease(lease: FileLeaseState): boolean {
  const descriptor = lease.descriptorLease.descriptor;
  if (descriptor === null) return false;
  lease.descriptorLease.descriptor = null;
  if (process.env.NODE_ENV === "test") {
    leaseAuditEvents.push(Object.freeze({ id: lease.auditId, event: "close", purpose: lease.purpose }));
  }
  closeSync(descriptor);
  return true;
}

function assertFileLeaseIdentity(lease: FileLeaseState): void {
  const descriptor = lease.descriptorLease.descriptor;
  if (descriptor === null) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_UNAVAILABLE", "file lease is closed");
  }
  const descriptorIdentity = readStableFileIdentityFromDescriptor(descriptor);
  if (!sameFileIdentity(descriptorIdentity, lease.identity)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_DRIFT", "leased descriptor identity changed");
  }
  assertPathFileIdentity(lease.databasePath, lease.identity);
}

function closeExactDatabase(db: Database.Database): void {
  const lease = connectionLeaseStates.get(db);
  let failure: unknown;
  try {
    if (db.open) db.close();
  } catch (error) {
    failure = error;
  } finally {
    connectionLeaseStates.delete(db);
    if (lease) {
      try {
        closeFileLease(lease);
      } catch (error) {
        failure = failure === undefined
          ? error
          : retainCleanupFailure(failure, error, "connection lease close");
      }
    }
  }
  if (failure !== undefined) throw failure;
}

function assertLeasedFileIdentity(db: Database.Database, absoluteDatabasePath: string): void {
  const lease = connectionLeaseStates.get(db);
  if (!lease || lease.databasePath !== absoluteDatabasePath) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_UNAVAILABLE", "missing exact-path file lease");
  }
  assertFileLeaseIdentity(lease);
}

function readStableFileIdentityFromDescriptor(descriptor: number): PhysicalFileIdentity {
  const stats = fstatSync(descriptor, { bigint: true });
  if (stats.ino <= BIGINT_ZERO) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_UNAVAILABLE", "filesystem exposes no stable inode/file ID");
  }
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
  });
}

function readStablePathFileIdentity(absoluteDatabasePath: string): PhysicalFileIdentity {
  const stats = statSync(absoluteDatabasePath, { bigint: true });
  if (stats.ino <= BIGINT_ZERO) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_UNAVAILABLE", "filesystem exposes no stable path file ID");
  }
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
  });
}

function assertPathFileIdentity(absoluteDatabasePath: string, expected: PhysicalFileIdentity): void {
  let actual: PhysicalFileIdentity;
  try {
    actual = readStablePathFileIdentity(absoluteDatabasePath);
  } catch (error) {
    if (error instanceof SqliteSchemaV1CoordinatorError) throw error;
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_DRIFT", "database path no longer resolves to the leased file");
  }
  if (!sameFileIdentity(actual, expected)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_IDENTITY_DRIFT", "database path was replaced during the lease");
  }
}

function sameFileIdentity(left: PhysicalFileIdentity, right: PhysicalFileIdentity): boolean {
  return left.device === right.device
    && left.inode === right.inode;
}

/** @internal Exact-comparison regression seam; never used by the coordinator protocol. */
export function __testOnlySqliteSchemaV1PhysicalFileIdentityMatches(
  left: Readonly<{ device: bigint; inode: bigint }>,
  right: Readonly<{ device: bigint; inode: bigint }>,
): boolean {
  return sameFileIdentity(left, right);
}

/** @internal Capability lease lifecycle regression seam. */
export function __testOnlySqliteSchemaV1CapabilityLeaseStatus(
  capability: SqliteSchemaV1LaterFinalizerCapability,
): Readonly<{ lifecycle: "ready" | "consuming" | "terminal"; descriptorOpen: boolean }> {
  if (!capability || typeof capability !== "object" || isProxy(capability)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  }
  const state = capabilityStates.get(capability as object);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  return Object.freeze({
    lifecycle: state.leaseLifecycle.status,
    descriptorOpen: state.sourceFileLease.descriptorLease.descriptor !== null,
  });
}

/** @internal Deterministic lease open/close ordering seam; test runtime only. */
export function __testOnlyResetSqliteSchemaV1LeaseAudit(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  leaseAuditEvents.length = 0;
}

/** @internal Deterministic lease open/close ordering seam; test runtime only. */
export function __testOnlySqliteSchemaV1LeaseAudit(): readonly Readonly<{
  id: number;
  event: "open" | "close";
  purpose: FileLeaseState["purpose"];
}>[] {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  return Object.freeze(leaseAuditEvents.map((event) => Object.freeze({ ...event })));
}

/** @internal Exhaustive schema-name partition seam; test runtime only. */
export function __testOnlySqliteSchemaV1NameIsInternal(name: unknown): boolean {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  if (typeof name !== "string") {
    throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", "non-string main.sqlite_schema name");
  }
  return isSqliteInternalSchemaName(name);
}

function committedUnverified(error: unknown): SqliteSchemaV1CommittedUnverifiedError {
  const detail = error instanceof Error ? error.message : "fresh read-only verification failed";
  let wrapped: unknown = new SqliteSchemaV1CommittedUnverifiedError(detail);
  if (error instanceof Error) {
    const cleanupFailures = (error as Error & {
      g006aCleanupFailures?: readonly Readonly<{ phase: string; error: unknown }>[];
    }).g006aCleanupFailures;
    if (Array.isArray(cleanupFailures)) {
      for (const cleanup of cleanupFailures) {
        wrapped = retainCleanupFailure(wrapped, cleanup.error, cleanup.phase);
      }
    }
  }
  return wrapped as SqliteSchemaV1CommittedUnverifiedError;
}

function countTargetColumns(db: Database.Database): { actual: number; expected: number } {
  let actual = 0;
  let expected = 0;
  const workspaceTables = new Set([
    "user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events",
    "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
  ]);
  const sourceTables = new Set(["place_cache", "places_master", "place_observations", "api_usage_events"]);
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const expectedColumns = ["tenant_id"];
    if (workspaceTables.has(table)) expectedColumns.push("workspace_id");
    if (sourceTables.has(table)) expectedColumns.push("source_card_id");
    if (table === "crawl_units") expectedColumns.push("location_mode");
    expected += expectedColumns.length;
    const columns = new Set(readTableColumns(db, table, false));
    actual += expectedColumns.filter((column) => columns.has(column)).length;
  }
  return { actual, expected };
}

function readTableColumns(db: Database.Database, table: string, required = true): string[] {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  if (required && columns.length === 0) throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", `missing ${table}`);
  return columns.map(({ name }) => String(name));
}

function readUserVersion(db: Database.Database): number {
  const row = (db.pragma("user_version") as Array<{ user_version: number }>)[0];
  return Number(row?.user_version ?? -1);
}

function readApplicationTableNames(db: Database.Database): string[] {
  return readSqliteSchemaCatalogPartition(db).application
    .filter((row) => row.type === "table")
    .map((row) => row.name);
}

function readApplicationTableCount(db: Database.Database): number {
  return readApplicationTableNames(db).length;
}

function readApplicationObjectCount(db: Database.Database): number {
  return readSqliteSchemaCatalogPartition(db).application.length;
}

function canonicalRow(columns: readonly string[], row: Record<string, unknown>): string {
  return JSON.stringify(columns.map((column) => [column, canonicalValue(row[column])]));
}

function canonicalValue(value: unknown): readonly [string, string] {
  if (value === null) return ["null", ""];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SqliteSchemaV1CoordinatorError("G006A_PAYLOAD_DRIFT", "non-finite number");
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (typeof value === "bigint") return ["bigint", value.toString()];
  if (Buffer.isBuffer(value)) return ["blob", value.toString("base64")];
  throw new SqliteSchemaV1CoordinatorError("G006A_PAYLOAD_DRIFT", `unsupported value ${typeof value}`);
}

function rejectedState(state: SqliteSchemaV1State): SqliteSchemaV1CoordinatorError {
  return new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", `${state.kind}: ${state.reason}`);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
