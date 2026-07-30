import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { isProxy } from "node:util/types";

import Database from "better-sqlite3";

import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_PRIMARY_SCHEMA,
  SQLITE_SCHEMA_V1_SQL,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
  SQLITE_SCHEMA_V1_TRANSFORM_TABLES,
} from "./sqlite-schema-v1";

export const ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST = "07091889ff9806c20356f092d3812ff325f22537c63a56149eea7dab0a529ade" as const;
export const SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST = "07e10bb5c43d98d6f561d3c0b0f9f39a9ad2d579ed1a73b9e2a7a455367fdf79" as const;

export type SqliteSchemaV1StateKind =
  | "fresh"
  | "accepted-legacy"
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
  | "G006A_CONNECTION_BOUNDARY_REJECTED"
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
  | Readonly<{ kind: "rename-table"; from: string; to: string }>;

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
  readonly handoffBindingId: string;
  readonly sourceState: "accepted-legacy" | "staged";
  readonly sourceUserVersion: number;
  readonly sourceCatalogDigest: string;
  readonly sourcePhysicalManifestDigest: string;
  readonly sourcePreservation: SqliteSchemaV1PreservationSnapshot;
  readonly targetCatalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly plan: SqliteSchemaV1FinalizerPlan;
}

interface FreshVerifierBoundaryState {
  readonly mode: "fail-verifier-open" | "writer-attached-schema" | "writer-temp-object";
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

const capabilityStates = new WeakMap<object, CapabilityState>();
const consumedCapabilities = new WeakSet<object>();
const freshVerifierBoundaryStates = new WeakMap<object, FreshVerifierBoundaryState>();
const ACCEPTED_LEGACY_TARGET_COLUMN_COUNT = 27;
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
  let actual: SqliteSchemaV1State;
  let sourcePhysicalManifestDigest: string;
  let sourcePreservation: SqliteSchemaV1PreservationSnapshot;
  try {
    inspector = openExactDatabase(databasePath, true);
    assertConnectionBoundary(inspector, databasePath);
    assertWritableSchemaOff(inspector);
    actual = classifySqliteSchemaV1(inspector);
    if (actual.kind !== "accepted-legacy" && actual.kind !== "staged") {
      throw rejectedState(actual);
    }
    sourcePhysicalManifestDigest = sqliteSchemaV1PhysicalManifestDigest(inspector);
    if (actual.kind === "staged" && sourcePhysicalManifestDigest !== SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST) {
      throw new SqliteSchemaV1CoordinatorError("G006A_PHYSICAL_CATALOG_DRIFT", sourcePhysicalManifestDigest);
    }
    sourcePreservation = captureSqliteSchemaV1PreservationSnapshot(inspector);
    assertSqliteSchemaV1DatabaseHealth(inspector);
  } finally {
    if (inspector?.open) inspector.close();
  }

  const capability = Object.freeze(Object.create(null)) as SqliteSchemaV1LaterFinalizerCapability;
  capabilityStates.set(capability as object, Object.freeze({
    databasePath,
    handoffBindingId,
    sourceState: actual.kind,
    sourceUserVersion: actual.userVersion,
    sourceCatalogDigest: actual.catalogDigest,
    sourcePhysicalManifestDigest,
    sourcePreservation,
    targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
    plan,
  }));
  return capability;
}

export function createSqliteSchemaV1FreshVerifierTestBoundary(
  mode: "fail-verifier-open" | "writer-attached-schema" | "writer-temp-object",
): SqliteSchemaV1FreshVerifierTestBoundary {
  if (process.env.NODE_ENV !== "test"
      || !["fail-verifier-open", "writer-attached-schema", "writer-temp-object"].includes(mode)) {
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
  if (![0, SQLITE_SCHEMA_V1_STAGED_USER_VERSION, SQLITE_SCHEMA_V1_FINAL_USER_VERSION].includes(userVersion)) {
    return { kind: "unknown", ...base, reason: `unsupported user_version ${userVersion}` };
  }
  if (userVersion === 0 && catalogDigest === ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST) {
    return { kind: "accepted-legacy", ...base, reason: "exact accepted legacy catalog" };
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
  const testBoundary = resolveCoordinateTestBoundary(options);
  const capabilityState = handoff ? resolveAndConsumeCapabilityHandoff(handoff) : undefined;
  const absoluteDatabasePath = canonicalExistingDatabasePath(databasePath);
  if (capabilityState
      && (capabilityState.databasePath !== absoluteDatabasePath
        || capabilityState.handoffBindingId !== extractHandoffBindingId(handoff))) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "database path or handoff binding");
  }

  let writer: Database.Database | undefined;
  let committed = false;
  let outcome: "finalized" | "replayed" | undefined;
  let preservation: SqliteSchemaV1PreservationSnapshot | undefined;
  let failure: unknown;
  try {
    writer = openExactDatabase(absoluteDatabasePath, false);
    applyWriterTestFault(writer, testBoundary);
    assertConnectionBoundary(writer, absoluteDatabasePath);
    forceWritableSchemaOff(writer);
    writer.exec("BEGIN IMMEDIATE");
    try {
      forceWritableSchemaOff(writer);
      assertConnectionBoundary(writer, absoluteDatabasePath);
      const locked = classifySqliteSchemaV1(writer);
      if (locked.kind === "final") {
        if (capabilityState) {
          throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "final database does not accept a finalizer");
        }
        preservation = captureSqliteSchemaV1PreservationSnapshot(writer);
        assertSqliteSchemaV1PhysicalManifest(writer);
        assertSqliteSchemaV1DatabaseHealth(writer);
        outcome = "replayed";
      } else {
        if (locked.kind !== "accepted-legacy" && locked.kind !== "staged") throw rejectedState(locked);
        if (!capabilityState) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
        assertMintTimeSourceSnapshot(writer, locked, capabilityState);
        preservation = capabilityState.sourcePreservation;
        executeFinalizerPlan(writer, capabilityState.plan);
        writer.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
        const after = classifySqliteSchemaV1(writer);
        if (after.kind !== "final") {
          throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_POSTCONDITION_FAILED", after.reason);
        }
        assertSqliteSchemaV1Preservation(
          preservation,
          captureSqliteSchemaV1PreservationSnapshot(writer, preservation),
        );
        assertSqliteSchemaV1PhysicalManifest(writer);
        assertSqliteSchemaV1DatabaseHealth(writer);
        outcome = "finalized";
      }
      assertConnectionBoundary(writer, absoluteDatabasePath);
      writer.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (writer.inTransaction) writer.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    failure = error;
  } finally {
    if (writer?.open) {
      try {
        writer.close();
      } catch (error) {
        failure ??= error;
      }
    }
  }

  if (failure) {
    if (committed) throw committedUnverified(failure);
    throw failure;
  }
  if (!committed || !outcome || !preservation) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writer did not reach a verified commit");
  }
  try {
    const verified = verifyCommittedSqliteSchemaV1File(
      absoluteDatabasePath,
      preservation,
      testBoundary,
    );
    return { status: outcome, state: verified };
  } catch (error) {
    throw committedUnverified(error);
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
  const rows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type COLLATE BINARY, name COLLATE BINARY
  `).all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
  return sha256(JSON.stringify(rows.map((row) => [
    row.type,
    row.name,
    row.tbl_name,
    row.sql?.replace(/\r\n?/gu, "\n") ?? null,
  ])));
}

export function sqliteSchemaV1PhysicalManifestDigest(db: Database.Database): string {
  return sha256(JSON.stringify(readPhysicalManifest(db)));
}

function assertSqliteSchemaV1PhysicalManifest(db: Database.Database): void {
  const digest = sqliteSchemaV1PhysicalManifestDigest(db);
  if (digest !== SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_PHYSICAL_CATALOG_DRIFT", digest);
  }
}

function resolveAndConsumeCapabilityHandoff(handoff: SqliteSchemaV1FinalizerHandoff): CapabilityState {
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
  if (consumedCapabilities.has(capabilityObject)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_CONSUMED");
  }
  const state = capabilityStates.get(capabilityObject);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  consumedCapabilities.add(capabilityObject);
  if (state.handoffBindingId !== handoffBindingId) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "handoff binding");
  }
  return state;
}

function extractHandoffBindingId(handoff: SqliteSchemaV1FinalizerHandoff | undefined): string {
  if (!handoff) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  const record = readExactPlainRecord(
    handoff,
    ["capability", "handoffBindingId"],
    "G006A_FINALIZER_MISMATCH",
    "handoff",
  );
  return requireBindingId(record.handoffBindingId);
}

type SqlOperation = "create-table" | "create-index" | "create-trigger" | "insert" | "update" | "delete";

interface SqlToken {
  readonly kind: "word" | "identifier" | "symbol";
  readonly value: string;
}

function copyAndValidateFinalizerPlan(value: unknown): SqliteSchemaV1FinalizerPlan {
  const operations = readDenseArray(value, "finalizer plan");
  if (operations.length > 4096) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", "too many operations");
  }
  return Object.freeze(operations.map((operation, index) => copyFinalizerOperation(operation, index)));
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
  throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `operation ${index} kind ${kind}`);
}

function copyScalarBinds(value: unknown, operationIndex: number): readonly SqliteSchemaV1ScalarBind[] {
  const binds = readDenseArray(value, `operation ${operationIndex} binds`);
  if (binds.length > 32766) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `operation ${operationIndex} bind count`);
  }
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

function executeFinalizerPlan(db: Database.Database, plan: SqliteSchemaV1FinalizerPlan): void {
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
    if (FORBIDDEN_SQL_TOKENS.has(word)) {
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
    if (operation === "create-trigger"
        && qualifier
        && (qualifier.kind === "word" || qualifier.kind === "identifier")
        && ["NEW", "OLD"].includes(qualifier.value.toUpperCase())) {
      continue;
    }
    if (qualifier && (qualifier.kind === "word" || qualifier.kind === "identifier")) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "qualified or attached-schema route");
    }
  }
}

function verifyCommittedSqliteSchemaV1File(
  absoluteDatabasePath: string,
  preservation: SqliteSchemaV1PreservationSnapshot,
  testBoundary: FreshVerifierBoundaryState | undefined,
): SqliteSchemaV1State {
  let verifier: Database.Database | undefined;
  try {
    if (testBoundary?.mode === "fail-verifier-open") throw new Error("simulated verifier open failure");
    verifier = openExactDatabase(absoluteDatabasePath, true);
    assertConnectionBoundary(verifier, absoluteDatabasePath);
    assertWritableSchemaOff(verifier);
    const state = classifySqliteSchemaV1(verifier);
    if (state.kind !== "final"
        || state.userVersion !== SQLITE_SCHEMA_V1_FINAL_USER_VERSION
        || state.catalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST
        || state.applicationTableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
        || state.targetColumnCount !== state.expectedTargetColumnCount) {
      throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", state.reason);
    }
    assertSqliteSchemaV1PhysicalManifest(verifier);
    assertSqliteSchemaV1Preservation(
      preservation,
      captureSqliteSchemaV1PreservationSnapshot(verifier, preservation),
    );
    assertSqliteSchemaV1DatabaseHealth(verifier);
    return state;
  } finally {
    if (verifier?.open) verifier.close();
  }
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

function readDenseArray(value: unknown, detail: string): unknown[] {
  if (!value || typeof value !== "object" || isProxy(value) || !Array.isArray(value)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} must be a non-proxy array`);
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} has a non-plain array prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const lengthValue = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_PLAN_REJECTED", `${detail} length`);
    }
    const length = lengthValue;
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
  const physicalDigest = sqliteSchemaV1PhysicalManifestDigest(db);
  if (physicalDigest !== capability.sourcePhysicalManifestDigest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_SOURCE_SNAPSHOT_DRIFT", "source physical manifest");
  }
  assertSqliteSchemaV1Preservation(
    capability.sourcePreservation,
    captureSqliteSchemaV1PreservationSnapshot(db, capability.sourcePreservation),
  );
  assertSqliteSchemaV1DatabaseHealth(db);
}

function assertConnectionBoundary(db: Database.Database, absoluteDatabasePath: string): void {
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

function openExactDatabase(absoluteDatabasePath: string, readonly: boolean): Database.Database {
  let db: Database.Database | undefined;
  try {
    db = new Database(absoluteDatabasePath, { readonly, fileMustExist: true });
    const state = db as unknown as { readonly memory?: boolean; readonly name?: string; readonly readonly?: boolean };
    if (state.memory !== false
        || state.readonly !== readonly
        || state.name !== absoluteDatabasePath) {
      throw new SqliteSchemaV1CoordinatorError("G006A_CONNECTION_BOUNDARY_REJECTED", "connection mode or path");
    }
    return db;
  } catch (error) {
    if (db?.open) db.close();
    throw error;
  }
}

function committedUnverified(error: unknown): SqliteSchemaV1CommittedUnverifiedError {
  const detail = error instanceof SqliteSchemaV1CoordinatorError
    ? error.code
    : error instanceof Error
      ? error.message
      : "fresh read-only verification failed";
  return new SqliteSchemaV1CommittedUnverifiedError(detail);
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
  return (db.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name COLLATE BINARY
  `).all() as Array<{ name: string }>).map(({ name }) => String(name));
}

function readApplicationTableCount(db: Database.Database): number {
  return readApplicationTableNames(db).length;
}

function readApplicationObjectCount(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get() as { count: number };
  return Number(row.count);
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
