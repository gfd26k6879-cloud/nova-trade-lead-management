import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_SANITIZED_COLUMNS,
  DATA_EXPORT_SCHEMA_VERSION,
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TENANT_INTEGRITY_CONTRACT_VERSION,
  encodeRowIdentity,
  loadSqliteUniqueKeyMetadata,
  parseCliArgs,
  quoteIdent,
  sanitizeRawGoogleReviewJson,
  sha256,
  sqliteKeyMetadataSupportsIdentity,
  tableContractsForSchemaVersion,
} from "./data-transfer-contract.mjs";

export function exportSqliteData({ dbPath: inputDbPath, outDir: inputOutDir, schemaVersion = DATA_EXPORT_SCHEMA_VERSION }) {
  if (process.env.MIGRATE_ENCRYPTED_KEYS === "1") {
    throw new Error("MIGRATE_ENCRYPTED_KEYS is no longer supported. API and browser keys are always excluded from data exports.");
  }

  const dbPath = path.resolve(inputDbPath);
  const outDir = path.resolve(inputOutDir);
  const contracts = tableContractsForSchemaVersion(schemaVersion);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite DB not found: ${dbPath}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const manifest = {
    format: DATA_EXPORT_FORMAT,
    schemaVersion,
    integrityContract: {
      version: TENANT_INTEGRITY_CONTRACT_VERSION,
      rules: ["foundation-parent-closure", "composite-tenant-relationships", "legacy-scope-mappings", "compatibility-receipt-bindings", "immutable-state-facts"],
    },
    exportedAt: new Date().toISOString(),
    source: { kind: "sqlite", file: path.basename(dbPath) },
    tableOrder: contracts.map(({ name }) => name),
    excludedColumns: Object.fromEntries(
      contracts
        .filter(({ excludedColumns }) => excludedColumns.length > 0)
        .map(({ name, excludedColumns }) => [name, [...excludedColumns]]),
    ),
    sanitizedColumns: Object.fromEntries(
      Object.entries(DATA_EXPORT_SANITIZED_COLUMNS).map(([name, columns]) => [name, [...columns]]),
    ),
    tables: {},
  };

  try {
    db.exec("BEGIN");
    for (const contract of contracts) {
      const schema = db.prepare(`PRAGMA table_info(${quoteIdent(contract.name)})`).all();
      if (schema.length === 0) {
        if (contract.dynamicSource) {
          throw new Error(`${contract.name}: T-028 SQLite preparation is required; run prepareSqliteCompatibilityBackfill before exporting`);
        }
        throw new Error(`${contract.name}: expected application table is missing from SQLite`);
      }

      const actualPrimaryKey = schema
        .filter(({ pk }) => Number(pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk))
        .map(({ name }) => String(name));
      const legacySchema3 = schemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION;
      if (legacySchema3 && !sameStringArray(actualPrimaryKey, contract.physicalPrimaryKey)) {
        throw new Error(`${contract.name}: SQLite primary key does not match the recovery contract`);
      }
      const uniqueKeys = legacySchema3 ? [] : loadSqliteUniqueKeyMetadata(db, contract.name);

      const excluded = new Set(contract.excludedColumns);
      const sourceColumns = schema.map(({ name }) => String(name));
      for (const protectedColumn of contract.excludedColumns) {
        if (!sourceColumns.includes(protectedColumn)) {
          throw new Error(`${contract.name}: protected column ${protectedColumn} is missing; initialize the current schema before exporting`);
        }
      }
      const columns = sourceColumns.filter((column) => !excluded.has(column));
      for (const identityColumn of contract.rowIdentity) {
        if (!columns.includes(identityColumn)) {
          throw new Error(`${contract.name}: schema-${schemaVersion} row identity column ${identityColumn} is missing from SQLite`);
        }
      }
      if (!legacySchema3 && !sqliteKeyMetadataSupportsIdentity(actualPrimaryKey, uniqueKeys, contract)) {
        throw new Error(`${contract.name}: schema-${schemaVersion} row identity lacks exact SQLite unique enforcement`);
      }
      const rawCredentialColumns = columns.filter((column) => /(?:^|_)(?:password|secret|credential|access_token|refresh_token|api_key)(?:_|$)/i.test(column));
      if (rawCredentialColumns.length > 0) {
        throw new Error(`${contract.name}: raw credential columns require an explicit exclusion: ${rawCredentialColumns.join(", ")}`);
      }
      const sourceRows = db.prepare(
        `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(contract.name)}`,
      ).all();
      const rows = sourceRows.map((row, rowIndex) => sanitizeExportRow(contract.name, row, rowIndex));
      const identities = new Set();
      for (const [rowIndex, row] of rows.entries()) {
        const identity = encodeRowIdentity(contract, row, `${contract.name}[${rowIndex}]`);
        if (identities.has(identity)) throw new Error(`${contract.name}: duplicate row identity at row ${rowIndex}`);
        identities.add(identity);
      }

      const fileName = `${contract.name}.json`;
      const filePath = path.join(outDir, fileName);
      const payload = `${JSON.stringify(rows, null, 2)}\n`;
      writeAtomic(filePath, payload);
      manifest.tables[contract.name] = legacySchema3 ? {
        file: fileName,
        rows: rows.length,
        columns,
        primaryKey: [...actualPrimaryKey],
        bytes: Buffer.byteLength(payload),
        sha256: sha256(payload),
      } : {
        file: fileName,
        rows: rows.length,
        columns,
        physicalPrimaryKey: [...actualPrimaryKey],
        uniqueKeys,
        rowIdentity: [...contract.rowIdentity],
        nullableIdentityColumns: [...contract.nullableIdentityColumns],
        bytes: Buffer.byteLength(payload),
        sha256: sha256(payload),
      };
    }
    db.exec("COMMIT");

    writeAtomic(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

function sanitizeExportRow(tableName, row, rowIndex) {
  if (!Object.hasOwn(DATA_EXPORT_SANITIZED_COLUMNS, tableName)) return row;
  return {
    ...row,
    raw_json: sanitizeRawGoogleReviewJson(row.raw_json, `${tableName}[${rowIndex}].raw_json`),
  };
}

function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, contents, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const dbPath = String(args.get("db") ?? "nosite-leads.db");
  const outDir = String(args.get("out") ?? "data-export");
  const rawSchemaVersion = args.get("schema-version") ?? DATA_EXPORT_SCHEMA_VERSION;
  const schemaVersion = Number(rawSchemaVersion);
  if (!Number.isInteger(schemaVersion)) throw new Error("--schema-version must be 3 or 4");
  const manifest = exportSqliteData({ dbPath, outDir, schemaVersion });

  console.log(`Exported schema ${schemaVersion} (${manifest.tableOrder.length} tables) to ${path.resolve(outDir)}`);
  console.log("Encrypted API/browser settings columns were excluded.");
  for (const name of manifest.tableOrder) {
    console.log(`${name}: ${manifest.tables[name].rows}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
