import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DATA_EXPORT_SCHEMA_VERSION,
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TABLE_NAMES,
  DYNAMIC_SOURCE_TABLES,
  loadSqliteUniqueKeyMetadata,
  parseCliArgs,
  quoteIdent,
  sqliteKeyMetadataSupportsIdentity,
  tableContractsForSchemaVersion,
  validateDataExportDirectory,
} from "./data-transfer-contract.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

// The SQLite tenant membership mutation journal is deliberately outside the
// recovery export contract: it is local admin state (never tenant data), it is
// excluded from the manifest-locked SQLITE_SCHEMA_V1 by its own schema tests,
// and it must never appear in the shared PostgreSQL migrations.
const SQLITE_LOCAL_AUXILIARY_TABLES = Object.freeze(["tenant_membership_mutation_journal"]);

// Postgres-only foundation tables (agent runtime, connector runtime, source
// policy lifecycle, document intake/extraction, worker dispatch) that the
// F-04–F-09 migrations create ahead of their recovery contracts. They hold no
// recovery-manifest contract yet; adding one must remove it from this list.
const POSTGRES_FOUNDATION_TABLES = Object.freeze([
  "agent_prompt_versions",
  "agent_policy_versions",
  "agent_runs",
  "agent_run_lease_history",
  "agent_run_steps",
  "agent_tool_calls",
  "agent_usage_reservations",
  "agent_usage_settlements",
  "connector_versions",
  "connector_accounts",
  "source_policy_versions",
  "source_runs",
  "source_run_units",
  "source_run_lease_history",
  "source_observations",
  "source_usage_reservations",
  "source_usage_settlements",
  "current_source_policy_activations",
  "documents",
  "document_versions",
  "document_upload_reservations",
  "document_version_finalizations",
  "document_scan_jobs",
  "document_scan_outbox",
  "document_scan_lease_history",
  "document_extraction_jobs",
  "document_extraction_lease_history",
  "tenant_worker_dispatch_leases",
]);

function verifyTrackedTableCoverage() {
  const sqliteSchema = fs.readFileSync(path.join(repoRoot, "src/lib/db/schema.ts"), "utf8");
  const sqliteTables = extractCreatedTables(sqliteSchema);
  assertExactTableSet(sqliteTables, "src/lib/db/schema.ts", {
    allowedMissing: new Set(DYNAMIC_SOURCE_TABLES),
    allowedExtra: new Set(SQLITE_LOCAL_AUXILIARY_TABLES),
  });

  const migrationsDir = path.join(repoRoot, "supabase/migrations");
  const migrationSql = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n");
  const migrationTables = extractCreatedTables(migrationSql);
  assertExactTableSet(migrationTables, "supabase/migrations", {
    allowedExtra: new Set(POSTGRES_FOUNDATION_TABLES),
  });
  for (const table of SQLITE_LOCAL_AUXILIARY_TABLES) {
    if (migrationTables.has(table)) {
      throw new Error(`supabase/migrations: SQLite-local auxiliary table ${table} must never be created on PostgreSQL`);
    }
  }
}

export function verifySqliteDatabase(inputPath, tableContracts, selectedSchemaVersion) {
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
        const uniqueKeys = loadSqliteUniqueKeyMetadata(db, contract.name);
        if (!sqliteKeyMetadataSupportsIdentity(primaryKey, uniqueKeys, contract)) {
          throw new Error(`${contract.name}: schema-${selectedSchemaVersion} row identity lacks exact SQLite unique enforcement`);
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

function extractCreatedTables(sql) {
  const tables = new Set();
  const pattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  const commentFree = sql.split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  for (const match of commentFree.matchAll(pattern)) tables.add(match[1]);
  return tables;
}

function assertExactTableSet(actual, label, { allowedMissing = new Set(), allowedExtra = new Set() } = {}) {
  const missing = TABLE_NAMES.filter((table) => !actual.has(table) && !allowedMissing.has(table));
  const unexpected = [...actual].filter((table) => !TABLE_NAMES.includes(table) && !allowedExtra.has(table));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`${label}: recovery table set mismatch; missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`);
  }
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function main() {
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
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();
