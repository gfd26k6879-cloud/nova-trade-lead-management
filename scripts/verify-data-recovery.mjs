import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import {
  TABLE_CONTRACTS,
  TABLE_NAMES,
  DYNAMIC_SOURCE_TABLES,
  parseCliArgs,
  quoteIdent,
  validateDataExportDirectory,
} from "./data-transfer-contract.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = parseCliArgs(process.argv.slice(2));

verifyTrackedTableCoverage();
console.log(`Recovery contract: ${TABLE_NAMES.length} application tables match SQLite schema and tracked migrations.`);

const dbArg = args.get("db");
if (typeof dbArg === "string") {
  verifySqliteDatabase(path.resolve(dbArg));
  console.log(`SQLite schema: ${path.resolve(dbArg)} matches the recovery contract (read-only check).`);
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

function verifySqliteDatabase(inputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`SQLite DB not found: ${inputPath}`);
  const db = new Database(inputPath, { readonly: true, fileMustExist: true });
  try {
    for (const contract of TABLE_CONTRACTS) {
      const schema = db.prepare(`PRAGMA table_info(${quoteIdent(contract.name)})`).all();
      if (schema.length === 0) {
        if (contract.dynamicSource) throw new Error(`${contract.name}: T-028 SQLite preparation is required; receipt table is not prepared`);
        throw new Error(`${contract.name}: missing from SQLite database`);
      }
      const primaryKey = schema
        .filter(({ pk }) => Number(pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk))
        .map(({ name }) => String(name));
      if (!sameStringArray(primaryKey, contract.primaryKey)) {
        throw new Error(`${contract.name}: SQLite primary key does not match the recovery contract`);
      }
      const columns = new Set(schema.map(({ name }) => String(name)));
      for (const column of contract.excludedColumns) {
        if (!columns.has(column)) throw new Error(`${contract.name}: protected source column ${column} is missing`);
      }
    }
  } finally {
    db.close();
  }
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
