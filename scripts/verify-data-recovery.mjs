import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_EXPORT_SCHEMA_VERSION,
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TABLE_NAMES,
  DYNAMIC_SOURCE_TABLES,
  parseCliArgs,
  quoteIdent,
  tableContractsForSchemaVersion,
  validateDataExportDirectory,
} from "./data-transfer-contract.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = parseCliArgs(process.argv.slice(2));
const schemaVersion = Number(args.get("schema-version") ?? DATA_EXPORT_SCHEMA_VERSION);
const contracts = tableContractsForSchemaVersion(schemaVersion);

verifyTrackedTableCoverage();
console.log(`Recovery contract: ${TABLE_NAMES.length} application tables match SQLite schema and tracked migrations.`);

const dbArg = args.get("db");
if (typeof dbArg === "string") {
  verifySqliteDatabase(path.resolve(dbArg), contracts, schemaVersion);
  console.log(`SQLite schema: ${path.resolve(dbArg)} matches recovery schema ${schemaVersion} (read-only check).`);
} else if (dbArg === true) {
  throw new Error("--db requires a SQLite file path");
}

const dirArg = args.get("dir");
if (typeof dirArg === "string") {
  const validated = validateDataExportDirectory(dirArg);
  const totalRows = validated.manifest.tableOrder.reduce(
    (sum, table) => sum + validated.manifest.tables[table].rows,
    0,
  );
  console.log(`Export archive: ${validated.dir} passed manifest, checksum, row, key, and secret-exclusion checks (${totalRows} rows).`);
} else if (dirArg === true) {
  throw new Error("--dir requires an export directory path");
}

function verifyTrackedTableCoverage() {
  const sqliteSchema = fs.readFileSync(path.join(repoRoot, "src/lib/db/schema.ts"), "utf8");
  const sqliteTables = extractCreatedTables(sqliteSchema);
  assertExactTableSet(sqliteTables, "src/lib/db/schema.ts", new Set(DYNAMIC_SOURCE_TABLES));

  const migrationsDir = path.join(repoRoot, "supabase/migrations");
  const migrationSql = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n");
  const migrationTables = extractCreatedTables(migrationSql);
  assertExactTableSet(migrationTables, "supabase/migrations");
}

function verifySqliteDatabase(inputPath, tableContracts, selectedSchemaVersion) {
  if (!fs.existsSync(inputPath)) throw new Error(`SQLite DB not found: ${inputPath}`);
  const db = new Database(inputPath, { readonly: true, fileMustExist: true });
  try {
    for (const contract of tableContracts) {
      const schema = db.prepare(`PRAGMA table_info(${quoteIdent(contract.name)})`).all();
      if (schema.length === 0) {
        if (contract.dynamicSource) throw new Error(`${contract.name}: T-028 SQLite preparation is required; receipt table is not prepared`);
        throw new Error(`${contract.name}: missing from SQLite database`);
      }
      const primaryKey = schema
        .filter(({ pk }) => Number(pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk))
        .map(({ name }) => String(name));
      if (selectedSchemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION
        && !sameStringArray(primaryKey, contract.physicalPrimaryKey)) {
        throw new Error(`${contract.name}: SQLite primary key does not match the recovery contract`);
      }
      const columns = new Set(schema.map(({ name }) => String(name)));
      for (const column of contract.rowIdentity) {
        if (!columns.has(column)) throw new Error(`${contract.name}: schema-${selectedSchemaVersion} row identity column ${column} is missing`);
      }
      if (selectedSchemaVersion !== LEGACY_DATA_EXPORT_SCHEMA_VERSION) {
        const uniqueKeys = loadSqliteUniqueKeys(db, contract.name);
        if (!sameStringArray(primaryKey, contract.rowIdentity)
          && !uniqueKeys.some((key) => sameStringArray(key, contract.rowIdentity))) {
          throw new Error(`${contract.name}: schema-${selectedSchemaVersion} row identity requires an exact SQLite primary or unique key`);
        }
      }
      for (const column of contract.excludedColumns) {
        if (!columns.has(column)) throw new Error(`${contract.name}: protected source column ${column} is missing`);
      }
    }
  } finally {
    db.close();
  }
}

function loadSqliteUniqueKeys(db, tableName) {
  return db.prepare(`PRAGMA index_list(${quoteIdent(tableName)})`).all()
    .filter((index) => Number(index.unique) === 1 && Number(index.partial) === 0 && String(index.origin) !== "pk")
    .map((index) => db.prepare(`PRAGMA index_xinfo(${quoteIdent(String(index.name))})`).all()
      .filter((column) => Number(column.key) === 1)
      .sort((left, right) => Number(left.seqno) - Number(right.seqno)))
    .filter((columns) => columns.length > 0 && columns.every((column) => Number(column.cid) >= 0 && typeof column.name === "string"))
    .map((columns) => columns.map((column) => String(column.name)));
}

function extractCreatedTables(sql) {
  const tables = new Set();
  const pattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(pattern)) tables.add(match[1]);
  return tables;
}

function assertExactTableSet(actual, label, allowedMissing = new Set()) {
  const missing = TABLE_NAMES.filter((table) => !actual.has(table) && !allowedMissing.has(table));
  const unexpected = [...actual].filter((table) => !TABLE_NAMES.includes(table));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`${label}: recovery table set mismatch; missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`);
  }
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
