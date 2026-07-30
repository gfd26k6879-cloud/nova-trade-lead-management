import { createHash } from "node:crypto";
import { resolve } from "node:path";

import Database from "better-sqlite3";

import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
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
  | "G006A_FILE_BACKED_FINALIZATION_REQUIRED"
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

export interface SqliteSchemaV1MutationResult {
  readonly changes: number;
}

export interface SqliteSchemaV1FinalizerSession {
  readonly createTable: (statement: string) => void;
  readonly createIndex: (statement: string) => void;
  readonly createTrigger: (statement: string) => void;
  readonly insert: (statement: string, parameters?: readonly unknown[]) => SqliteSchemaV1MutationResult;
  readonly update: (statement: string, parameters?: readonly unknown[]) => SqliteSchemaV1MutationResult;
  readonly delete: (statement: string, parameters?: readonly unknown[]) => SqliteSchemaV1MutationResult;
  readonly dropTable: (name: string) => void;
  readonly dropIndex: (name: string) => void;
  readonly dropTrigger: (name: string) => void;
  readonly renameTable: (from: string, to: string) => void;
}

export interface SqliteSchemaV1LaterFinalizerContext {
  readonly handoffBindingId: string;
  readonly sourceState: "accepted-legacy" | "staged";
  readonly sourceCatalogDigest: string;
  readonly targetCatalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly targetUserVersion: typeof SQLITE_SCHEMA_V1_FINAL_USER_VERSION;
  readonly targetSchemaSql: typeof SQLITE_SCHEMA_V1_SQL;
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
  readonly db: Database.Database;
  readonly handoffBindingId: string;
  readonly sourceState: "accepted-legacy" | "staged";
  readonly sourceCatalogDigest: string;
  readonly targetCatalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly execute: (session: SqliteSchemaV1FinalizerSession, context: SqliteSchemaV1LaterFinalizerContext) => void;
}

interface FreshVerifierBoundaryState {
  readonly openReadOnly: (absoluteDatabasePath: string) => Database.Database;
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
  "VACUUM",
  "WRITABLE_SCHEMA",
  "SQLITE_SCHEMA",
  "SQLITE_MASTER",
  "SQLITE_TEMP_SCHEMA",
  "SQLITE_TEMP_MASTER",
]);

export function createSqliteSchemaV1LaterFinalizerCapability(input: {
  readonly db: Database.Database;
  readonly handoffBindingId: string;
  readonly sourceState: "accepted-legacy" | "staged";
  readonly sourceCatalogDigest: string;
  readonly targetCatalogDigest: string;
  readonly execute: (session: SqliteSchemaV1FinalizerSession, context: SqliteSchemaV1LaterFinalizerContext) => void;
}): SqliteSchemaV1LaterFinalizerCapability {
  assertExactBindingId(input.handoffBindingId);
  if (input.targetCatalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "target catalog digest");
  }
  const expectedSourceDigest = input.sourceState === "accepted-legacy"
    ? ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST
    : SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  if (input.sourceCatalogDigest !== expectedSourceDigest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "source catalog digest");
  }
  if (typeof input.execute !== "function") {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "execute callback");
  }
  const actual = classifySqliteSchemaV1(input.db);
  if (actual.kind !== input.sourceState || actual.catalogDigest !== input.sourceCatalogDigest) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "bound database source state");
  }
  const capability = Object.freeze(Object.create(null)) as SqliteSchemaV1LaterFinalizerCapability;
  capabilityStates.set(capability as object, Object.freeze({
    db: input.db,
    handoffBindingId: input.handoffBindingId,
    sourceState: input.sourceState,
    sourceCatalogDigest: input.sourceCatalogDigest,
    targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
    execute: input.execute,
  }));
  return capability;
}

export function createSqliteSchemaV1FreshVerifierTestBoundary(
  openReadOnly: (absoluteDatabasePath: string) => Database.Database,
): SqliteSchemaV1FreshVerifierTestBoundary {
  if (process.env.NODE_ENV !== "test" || typeof openReadOnly !== "function") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED");
  }
  const boundary = Object.freeze(Object.create(null)) as SqliteSchemaV1FreshVerifierTestBoundary;
  freshVerifierBoundaryStates.set(boundary as object, Object.freeze({ openReadOnly }));
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
  db: Database.Database,
  handoff?: SqliteSchemaV1FinalizerHandoff,
  options: SqliteSchemaV1CoordinateOptions = {},
): SqliteSchemaV1WholeUpgradeResult {
  const capabilityState = handoff ? resolveCapabilityHandoff(db, handoff) : undefined;
  const before = classifySqliteSchemaV1(db);
  if (before.kind === "final") {
    if (capabilityState) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "final database does not accept a finalizer");
    }
    if (isFileBackedDatabase(db)) {
      const state = verifyCommittedSqliteSchemaV1File(db, resolveDatabasePath(db), undefined, options);
      return { status: "replayed", state };
    }
    assertSqliteSchemaV1PhysicalManifest(db);
    assertSqliteSchemaV1DatabaseHealth(db);
    return { status: "replayed", state: before };
  }
  if (before.kind !== "accepted-legacy" && before.kind !== "staged") throw rejectedState(before);
  if (!handoff || !capabilityState) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  }
  if (capabilityState.sourceState !== before.kind
      || capabilityState.sourceCatalogDigest !== before.catalogDigest
      || capabilityState.targetCatalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "classified source state");
  }
  const absoluteDatabasePath = requireFileBackedDatabase(db);
  if (db.inTransaction) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "caller-owned transaction is active");
  }
  forceWritableSchemaOff(db);
  consumedCapabilities.add(handoff.capability as object);

  let preservation: SqliteSchemaV1PreservationSnapshot | undefined;
  const finalize = db.transaction(() => {
    forceWritableSchemaOff(db);
    const locked = classifySqliteSchemaV1(db);
    if ((locked.kind !== "accepted-legacy" && locked.kind !== "staged")
        || locked.kind !== before.kind
        || locked.catalogDigest !== before.catalogDigest) {
      throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "catalog changed before finalizer lock");
    }
    preservation = captureSqliteSchemaV1PreservationSnapshot(db);
    const { session, deactivate } = createFinalizerSession(db);
    try {
      capabilityState.execute(session, {
        handoffBindingId: capabilityState.handoffBindingId,
        sourceState: locked.kind,
        sourceCatalogDigest: locked.catalogDigest,
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        targetUserVersion: SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
        targetSchemaSql: SQLITE_SCHEMA_V1_SQL,
      });
    } finally {
      deactivate();
    }
    db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
    const after = classifySqliteSchemaV1(db);
    if (after.kind !== "final") {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_POSTCONDITION_FAILED", after.reason);
    }
    assertSqliteSchemaV1Preservation(
      preservation,
      captureSqliteSchemaV1PreservationSnapshot(db, preservation),
    );
    assertSqliteSchemaV1PhysicalManifest(db);
    assertSqliteSchemaV1DatabaseHealth(db);
  });
  finalize.immediate();

  if (!preservation) {
    throw new SqliteSchemaV1CommittedUnverifiedError("preservation snapshot unavailable after commit");
  }
  try {
    const verified = verifyCommittedSqliteSchemaV1File(
      db,
      absoluteDatabasePath,
      preservation,
      options,
    );
    return { status: "finalized", state: verified };
  } catch (error) {
    const detail = error instanceof SqliteSchemaV1CoordinatorError ? error.code : "fresh read-only verification failed";
    throw new SqliteSchemaV1CommittedUnverifiedError(detail);
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

function resolveCapabilityHandoff(
  db: Database.Database,
  handoff: SqliteSchemaV1FinalizerHandoff,
): CapabilityState {
  assertExactBindingId(handoff.handoffBindingId);
  if (!handoff.capability || (typeof handoff.capability !== "object" && typeof handoff.capability !== "function")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  }
  const capabilityObject = handoff.capability as object;
  if (consumedCapabilities.has(capabilityObject)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_CONSUMED");
  }
  const state = capabilityStates.get(capabilityObject);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_REQUIRED");
  if (state.db !== db || state.handoffBindingId !== handoff.handoffBindingId) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "database or handoff binding");
  }
  return state;
}

function createFinalizerSession(db: Database.Database): {
  readonly session: SqliteSchemaV1FinalizerSession;
  readonly deactivate: () => void;
} {
  let active = true;
  const assertActive = (): void => {
    if (!active) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "inactive finalizer session");
  };
  const execute = (operation: SqlOperation, statement: string, parameters: readonly unknown[] = []): SqliteSchemaV1MutationResult => {
    assertActive();
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
    const result = prepared.run(...parameters);
    return Object.freeze({ changes: result.changes });
  };
  const executeIdentifierDdl = (statement: string): void => {
    let prepared: Database.Statement;
    try {
      prepared = db.prepare(statement);
    } catch {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "invalid identifier DDL");
    }
    prepared.run();
  };
  const checkedIdentifier = (identifier: string): string => {
    assertActive();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier) || isForbiddenSchemaIdentifier(identifier)) {
      throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "invalid schema identifier");
    }
    return quoteIdentifier(identifier);
  };
  const session = Object.freeze(Object.assign(Object.create(null), {
    createTable: (statement: string): void => { execute("create-table", statement); },
    createIndex: (statement: string): void => { execute("create-index", statement); },
    createTrigger: (statement: string): void => { execute("create-trigger", statement); },
    insert: (statement: string, parameters?: readonly unknown[]): SqliteSchemaV1MutationResult => (
      execute("insert", statement, parameters)
    ),
    update: (statement: string, parameters?: readonly unknown[]): SqliteSchemaV1MutationResult => (
      execute("update", statement, parameters)
    ),
    delete: (statement: string, parameters?: readonly unknown[]): SqliteSchemaV1MutationResult => (
      execute("delete", statement, parameters)
    ),
    dropTable: (name: string): void => { executeIdentifierDdl(`DROP TABLE ${checkedIdentifier(name)}`); },
    dropIndex: (name: string): void => { executeIdentifierDdl(`DROP INDEX ${checkedIdentifier(name)}`); },
    dropTrigger: (name: string): void => { executeIdentifierDdl(`DROP TRIGGER ${checkedIdentifier(name)}`); },
    renameTable: (from: string, to: string): void => {
      executeIdentifierDdl(`ALTER TABLE ${checkedIdentifier(from)} RENAME TO ${checkedIdentifier(to)}`);
    },
  })) as SqliteSchemaV1FinalizerSession;
  return { session, deactivate: () => { active = false; } };
}

type SqlOperation = "create-table" | "create-index" | "create-trigger" | "insert" | "update" | "delete";

function assertAllowedSqlStatement(operation: SqlOperation, statement: string): void {
  if (typeof statement !== "string" || statement.trim().length === 0 || statement.includes("\0")) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "empty or invalid SQL");
  }
  const tokens = tokenizeSql(statement);
  const words = tokens.map((token) => token.toUpperCase());
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
}

function tokenizeSql(statement: string): string[] {
  const tokens: string[] = [];
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
      tokens.push(unescapeQuotedIdentifier(statement.slice(index + 1, end - 1), current));
      index = end;
      continue;
    }
    if (current === "[") {
      const end = statement.indexOf("]", index + 1);
      if (end < 0) throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_SQL_REJECTED", "unterminated bracket identifier");
      tokens.push(statement.slice(index + 1, end));
      index = end + 1;
      continue;
    }
    const word = statement.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
    if (word) {
      tokens.push(word);
      index += word.length;
      continue;
    }
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

function verifyCommittedSqliteSchemaV1File(
  sourceDb: Database.Database,
  absoluteDatabasePath: string,
  preservation: SqliteSchemaV1PreservationSnapshot | undefined,
  options: SqliteSchemaV1CoordinateOptions,
): SqliteSchemaV1State {
  let verifier: Database.Database | undefined;
  try {
    verifier = openFreshReadOnlyVerifier(absoluteDatabasePath, options);
    if (verifier === sourceDb
        || !(verifier as unknown as { readonly?: boolean }).readonly
        || resolve(String(verifier.name)) !== absoluteDatabasePath) {
      throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "not a distinct exact-path read-only connection");
    }
    const state = classifySqliteSchemaV1(verifier);
    if (state.kind !== "final"
        || state.userVersion !== SQLITE_SCHEMA_V1_FINAL_USER_VERSION
        || state.catalogDigest !== SQLITE_SCHEMA_V1_CATALOG_DIGEST
        || state.applicationTableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT
        || state.targetColumnCount !== state.expectedTargetColumnCount) {
      throw new SqliteSchemaV1CoordinatorError("G006A_CATALOG_DRIFT", state.reason);
    }
    assertSqliteSchemaV1PhysicalManifest(verifier);
    if (preservation) {
      assertSqliteSchemaV1Preservation(
        preservation,
        captureSqliteSchemaV1PreservationSnapshot(verifier, preservation),
      );
    }
    assertSqliteSchemaV1DatabaseHealth(verifier);
    return state;
  } finally {
    if (verifier?.open) verifier.close();
  }
}

function openFreshReadOnlyVerifier(
  absoluteDatabasePath: string,
  options: SqliteSchemaV1CoordinateOptions,
): Database.Database {
  const boundary = options.freshVerifierTestBoundary;
  if (!boundary) return new Database(absoluteDatabasePath, { readonly: true, fileMustExist: true });
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "test boundary outside test runtime");
  }
  const state = freshVerifierBoundaryStates.get(boundary as object);
  if (!state) throw new SqliteSchemaV1CoordinatorError("G006A_VERIFIER_BOUNDARY_REJECTED", "unknown test boundary");
  return state.openReadOnly(absoluteDatabasePath);
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

function forceWritableSchemaOff(db: Database.Database): void {
  db.pragma("writable_schema = OFF");
  const writableSchema = Number(db.pragma("writable_schema", { simple: true }));
  if (writableSchema !== 0) {
    throw new SqliteSchemaV1CoordinatorError("G006A_STATE_REJECTED", "writable_schema could not be disabled");
  }
}

function assertExactBindingId(bindingId: string): void {
  if (typeof bindingId !== "string"
      || bindingId.length === 0
      || bindingId.length > 512
      || bindingId.trim() !== bindingId) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FINALIZER_MISMATCH", "handoff binding ID");
  }
}

function requireFileBackedDatabase(db: Database.Database): string {
  if (!isFileBackedDatabase(db)) {
    throw new SqliteSchemaV1CoordinatorError("G006A_FILE_BACKED_FINALIZATION_REQUIRED");
  }
  return resolveDatabasePath(db);
}

function isFileBackedDatabase(db: Database.Database): boolean {
  const state = db as unknown as { readonly memory?: boolean; readonly name?: string };
  return state.memory === false && typeof state.name === "string" && state.name.length > 0 && state.name !== ":memory:";
}

function resolveDatabasePath(db: Database.Database): string {
  return resolve(String((db as unknown as { readonly name: string }).name));
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
