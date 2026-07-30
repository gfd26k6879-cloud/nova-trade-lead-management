import path from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import {
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  TABLE_NAMES,
  RESTORE_TRIGGER_PLAN,
  authReferenceColumns,
  encodeRowIdentity,
  historicalRowsRequireRestore,
  parseCliArgs,
  quoteIdent,
  targetColumn,
  targetColumns,
  validateTenantIntegrity,
  validateDataExportDirectory,
} from "./data-transfer-contract.mjs";

const PRESERVED_REFERENCE_TABLES = new Set(["location_markets", "location_cells"]);
const PUBLIC_SCHEMA = "public";

function publicIdent(name) {
  return `${quoteIdent(PUBLIC_SCHEMA)}.${quoteIdent(name)}`;
}

export async function importSupabaseData({ dir: inputDir, databaseUrl, restoreHistorical = false }) {
  const validated = validateDataExportDirectory(inputDir);
  const historicalTables = historicalRowsRequireRestore(validated);
  if (historicalTables.length > 0 && !restoreHistorical) {
    throw new Error(`Historical/stateful rows require --restore-historical: ${historicalTables.join(", ")}`);
  }
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required. Use the Supabase transaction pooler connection string.");
  }

  const database = new URL(databaseUrl);
  const localRehearsal = ["localhost", "127.0.0.1", "::1"].includes(database.hostname)
    && database.pathname === "/t029_tenant_foundation_rehearsal";

  const sql = postgres(databaseUrl, {
    ssl: localRehearsal ? false : "require",
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  try {
    const targetSchema = await loadTargetSchema(sql);
    validateTargetSchema(targetSchema, validated);
    await validateAuthReferences(sql, validated);

    try {
      await sql.begin(async (transaction) => {
        const disabledTriggers = [];
        const nonemptyTables = validated.manifest.tableOrder.filter((table) => validated.tables.get(table)?.rows.length > 0);
        await assertRestorePrivileges(transaction, nonemptyTables, historicalTables);
        if (historicalTables.length > 0) {
          await disableRestoreTriggers(transaction, historicalTables, disabledTriggers);
        }
        for (const contract of validated.contracts) {
          const table = validated.tables.get(contract.name);
          if (!table) throw new Error(`Validated export is missing ${contract.name}`);
          if (table.rows.length === 0) continue;
          await importTable(transaction, contract, table.columns, table.rows, targetSchema);
        }
        await verifyImportedRows(transaction, validated, targetSchema);
        const targetTables = await loadTargetRows(transaction, validated, targetSchema);
        validateTenantIntegrity(targetTables);
        // Flush deferred anchor-FK events while every constraint trigger is still
        // enabled. PostgreSQL rejects ALTER TABLE ENABLE TRIGGER when this
        // transaction has pending trigger events.
        await transaction.unsafe("SET CONSTRAINTS ALL IMMEDIATE");
        await enableRestoreTriggers(transaction, disabledTriggers);
        if (historicalTables.length > 0) await assertRestoreTriggersEnabled(transaction);
        // Identity restart is deliberately the last mutation before commit.
        // ALTER SEQUENCE is transactional here, so any later commit failure
        // rolls it back with the imported rows and trigger state.
        await advanceIdentitySequences(transaction, validated);
      });
    } catch (error) {
      // PostgreSQL rollback restores trigger state. ALTER TABLE cannot safely run in an aborted transaction.
      try {
        await assertRestoreTriggersEnabled(sql);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "restore transaction failed and trigger cleanup verification also failed", { cause: error });
      }
      throw error;
    }
    await assertRestoreTriggersEnabled(sql);

    return validated.manifest;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function validateTargetSchema(targetSchema, validated) {
  const legacySchema3 = validated.manifest.schemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION;
  for (const contract of validated.contracts) {
    const target = targetSchema.get(contract.name);
    if (!target) {
      throw new Error(`${contract.name}: target table is missing; reconcile and apply migrations before importing`);
    }
    const exported = validated.tables.get(contract.name);
    if (!exported) throw new Error(`${contract.name}: validated export entry is missing`);

    if (legacySchema3) {
      if (!sameStringArray(target.physicalPrimaryKey, contract.physicalPrimaryKey)) {
        throw new Error(`${contract.name}: target physical primary key does not match the schema-3 recovery contract`);
      }
    } else if (!targetSupportsRowIdentity(target, contract)) {
      throw new Error(`${contract.name}: target lacks the exact unique rowIdentity required by schema 4`);
    }
    for (const column of [...exported.columns, ...contract.excludedColumns]) {
      const targetName = targetColumn(contract, column);
      if (!target.columns.has(targetName)) {
        throw new Error(`${contract.name}: target column ${targetName} is missing; reconcile and apply migrations before importing`);
      }
    }
    for (const column of contract.jsonbColumns) {
      const targetName = targetColumn(contract, column);
      if (targetDataType(target.columns.get(targetName)) !== "jsonb") {
        throw new Error(`${contract.name}.${column}: expected target type jsonb`);
      }
    }
  }
}

export function normalizeValue(contract, column, value, targetType) {
  if (!contract.jsonbColumns.includes(column) || value === null || value === undefined) {
    if (targetDataType(targetType) === "boolean") {
      if (value === true || value === 1) return true;
      if (value === false || value === 0) return false;
      throw new Error(`${contract.name}.${column}: boolean source value must be SQLite 0/1 or boolean`);
    }
    if (targetDataType(targetType)?.match(/timestamp|date|time/)) return normalizeTimestamp(value);
    return value;
  }
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${contract.name}.${column}: source value is not valid JSON`);
  }
}

async function loadTargetSchema(sql) {
  const tablePlaceholders = TABLE_NAMES.map((_, index) => `$${index + 1}`).join(", ");
  const columnRows = await sql.unsafe(
    `SELECT table_name, column_name, data_type, udt_name, ordinal_position
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tablePlaceholders})
      ORDER BY table_name, ordinal_position`,
    [...TABLE_NAMES],
  );
  const uniqueKeyRows = await sql.unsafe(
    `SELECT table_class.relname AS table_name,
            index_record.indisprimary,
            index_record.indnullsnotdistinct,
            pg_catalog.array_agg(attribute.attname ORDER BY key_column.ordinality) AS columns
       FROM pg_catalog.pg_index index_record
       JOIN pg_catalog.pg_class table_class ON table_class.oid = index_record.indrelid
       JOIN pg_catalog.pg_namespace namespace_record ON namespace_record.oid = table_class.relnamespace
       CROSS JOIN LATERAL pg_catalog.unnest(index_record.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinality)
       JOIN pg_catalog.pg_attribute attribute
         ON attribute.attrelid = table_class.oid
        AND attribute.attnum = key_column.attnum
      WHERE namespace_record.nspname = 'public'
        AND table_class.relname IN (${tablePlaceholders})
        AND index_record.indisunique
        AND index_record.indimmediate
        AND index_record.indisvalid
        AND index_record.indisready
        AND index_record.indpred IS NULL
        AND index_record.indexprs IS NULL
        AND key_column.ordinality <= index_record.indnkeyatts
      GROUP BY table_class.relname, index_record.indexrelid, index_record.indisprimary, index_record.indnullsnotdistinct
      ORDER BY table_class.relname, index_record.indisprimary DESC, index_record.indexrelid`,
    [...TABLE_NAMES],
  );

  const result = new Map();
  for (const row of columnRows) {
    const table = result.get(row.table_name) ?? { columns: new Map(), physicalPrimaryKey: [], uniqueKeys: [] };
    table.columns.set(String(row.column_name), { dataType: String(row.data_type), udtName: String(row.udt_name) });
    result.set(String(row.table_name), table);
  }
  for (const row of uniqueKeyRows) {
    const table = result.get(row.table_name);
    if (!table) continue;
    const key = {
      columns: row.columns.map(String),
      nullsNotDistinct: row.indnullsnotdistinct === true,
    };
    if (row.indisprimary === true) table.physicalPrimaryKey = key.columns;
    else table.uniqueKeys.push(key);
  }
  return result;
}

export async function validateAuthReferences(sql, validated) {
  const referencedIds = new Set();
  for (const [tableName, columns] of authReferenceColumns()) {
    const table = validated.tables.get(tableName);
    if (!table) continue;
    for (const row of table.rows) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value === "string" && value.trim()) referencedIds.add(value.trim());
      }
    }
  }
  if (referencedIds.size === 0) return;

  const ids = [...referencedIds];
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.unsafe(
    `SELECT id::text AS id FROM auth.users WHERE id::text IN (${placeholders})`,
    ids,
  );
  const present = new Set(rows.map(({ id }) => String(id)));
    const missing = ids.filter((id) => !present.has(id));
  if (missing.length > 0) {
    throw new Error(`Supabase Auth must be restored first; ${missing.length} referenced user ID(s) are missing`);
  }
}

function targetDataType(value) {
  return typeof value === "string" ? value : value?.dataType;
}

async function importTable(sql, contract, columns, rows, targetSchema) {
  const batchSize = 200;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = [];
    let valueIndex = 1;

    for (const row of batch) {
      const placeholders = [];
      for (const column of columns) {
        const isJsonb = contract.jsonbColumns.includes(column);
        placeholders.push(`$${valueIndex++}${isJsonb ? "::jsonb" : ""}`);
        const target = targetSchema.get(contract.name);
        values.push(normalizeValue(contract, column, row[column], target?.columns.get(targetColumn(contract, column))));
      }
      tuples.push(`(${placeholders.join(", ")})`);
    }

    const destinationColumns = targetColumns(contract, columns);
    const destinationRowIdentity = targetColumns(contract, contract.rowIdentity);
    const updateColumns = destinationColumns.filter((column) => !destinationRowIdentity.includes(column));
    const updateSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(", ")}`
      : "DO NOTHING";
    const query = `
      INSERT INTO ${publicIdent(contract.name)} (${destinationColumns.map(quoteIdent).join(", ")})${contract.name === "tenant_deletion_checkpoint_events" ? " OVERRIDING SYSTEM VALUE" : ""}
      VALUES ${tuples.join(", ")}
      ON CONFLICT (${destinationRowIdentity.map(quoteIdent).join(", ")}) ${updateSql}
    `;
    const result = await sql.unsafe(query, values);
    if (Number.isInteger(result.count) && result.count !== batch.length) {
      throw new Error(`${contract.name}: expected ${batch.length} imported rows, received ${result.count}`);
    }
  }
}

async function advanceIdentitySequences(sql, validated) {
  const table = validated.tables.get("tenant_deletion_checkpoint_events");
  if (!table || table.rows.length === 0) return;
  const maxId = Math.max(...table.rows.map((row) => Number(row.id)));
  if (!Number.isSafeInteger(maxId) || maxId < 1) throw new Error("tenant_deletion_checkpoint_events: restored identity values are invalid");
  await sql.unsafe(`ALTER SEQUENCE ${publicIdent("tenant_deletion_checkpoint_events_id_seq")} RESTART WITH ${maxId + 1}`);
  const sequence = await sql.unsafe(`SELECT last_value, is_called FROM ${publicIdent("tenant_deletion_checkpoint_events_id_seq")}`);
  if (sequence.length !== 1 || Number(sequence[0].last_value) !== maxId + 1 || sequence[0].is_called !== false) {
    throw new Error("tenant_deletion_checkpoint_events: identity sequence restart was not transactional and exact");
  }
}

async function assertRestorePrivileges(sql, nonemptyTables, historicalTables) {
  if (nonemptyTables.length === 0) return;
  const placeholders = nonemptyTables.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.unsafe(
    `SELECT current_user, r.rolsuper, r.rolbypassrls, c.relname, c.relforcerowsecurity, owner.rolname AS owner_name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_roles owner ON owner.oid = c.relowner
       CROSS JOIN pg_catalog.pg_roles r
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relname IN (${placeholders})
        AND r.rolname = current_user`,
    nonemptyTables,
  );
  if (rows.length !== nonemptyTables.length) throw new Error("restore preflight: nonempty target table security metadata is incomplete");
  const current = rows[0];
  if (rows.some((row) => row.relforcerowsecurity) && !current.rolsuper && !current.rolbypassrls) {
    throw new Error("restore preflight: nonempty FORCE ROW LEVEL SECURITY table requires an effective BYPASSRLS or superuser transaction");
  }
  if (historicalTables.length > 0 && !current.rolsuper && rows.filter((row) => historicalTables.includes(row.relname)).some((row) => row.owner_name !== row.current_user)) {
    throw new Error("restore mode: historical restore requires a privileged table-owner transaction");
  }
  if (historicalTables.includes("compatibility_backfill_receipts") && !current.rolsuper && !current.rolbypassrls) {
    throw new Error("restore mode: compatibility receipt restore requires an effective BYPASSRLS or superuser transaction");
  }
}

async function disableRestoreTriggers(sql, tableNames, disabled) {
  for (const tableName of tableNames) {
    const triggerNames = RESTORE_TRIGGER_PLAN[tableName] ?? [];
    const placeholders = triggerNames.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await sql.unsafe(
      `SELECT t.tgname, t.tgenabled
         FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relname = $${triggerNames.length + 1}
          AND NOT t.tgisinternal
          AND t.tgname IN (${placeholders})`,
      [...triggerNames, tableName],
    );
    if (rows.length !== triggerNames.length) throw new Error(`restore mode ${tableName}: exact guard trigger contract is incomplete`);
    for (const triggerName of triggerNames) {
      const row = rows.find((candidate) => candidate.tgname === triggerName);
      if (!row || row.tgenabled !== "O") throw new Error(`restore mode ${tableName}: guard trigger is not enabled before restore`);
      await sql.unsafe(`ALTER TABLE ${publicIdent(tableName)} DISABLE TRIGGER ${quoteIdent(triggerName)}`);
      disabled.push({ tableName, triggerName });
    }
  }
}

async function enableRestoreTriggers(sql, disabledTriggers) {
  for (const { tableName, triggerName } of [...disabledTriggers].reverse()) {
    await sql.unsafe(`ALTER TABLE ${publicIdent(tableName)} ENABLE TRIGGER ${quoteIdent(triggerName)}`);
  }
}

async function assertRestoreTriggersEnabled(sql) {
  const entries = Object.entries(RESTORE_TRIGGER_PLAN);
  for (const [tableName, triggerNames] of entries) {
    const placeholders = triggerNames.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await sql.unsafe(
      `SELECT t.tgname, t.tgenabled
         FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = $${triggerNames.length + 1}
          AND t.tgname IN (${placeholders})`,
      [...triggerNames, tableName],
    );
    if (rows.length !== triggerNames.length || rows.some((row) => row.tgenabled !== "O")) {
      throw new Error(`restore trigger cleanup failed for ${tableName}`);
    }
  }
}

async function verifyImportedRows(sql, validated, targetSchema) {
  for (const contract of validated.contracts) {
    const table = validated.tables.get(contract.name);
    const countRows = await sql.unsafe(`SELECT count(*)::integer AS count FROM ${publicIdent(contract.name)}`);
    const targetCount = Number(countRows[0].count);
    if (PRESERVED_REFERENCE_TABLES.has(contract.name)
      ? targetCount < table.rows.length
      : targetCount !== table.rows.length) {
      throw new Error(`${contract.name}: post-import row count does not match archive count`);
    }
    if (table.rows.length === 0) continue;
    const targetRows = await loadTargetRows(sql, validated, targetSchema, contract.name);
    const columnTypes = targetRows.get(contract.name).columnTypes;
    const archiveDigest = digestRows(contract, table.rows, columnTypes);
    const targetRowsForComparison = PRESERVED_REFERENCE_TABLES.has(contract.name)
      ? targetRows.get(contract.name).rows.filter((row) => {
        const targetIdentity = encodeRowIdentity(contract, row);
        return table.rows.some((archiveRow) => encodeRowIdentity(contract, archiveRow) === targetIdentity);
      })
      : targetRows.get(contract.name).rows;
    const targetDigest = digestRows(contract, targetRowsForComparison, columnTypes);
    if (archiveDigest !== targetDigest) {
      const mismatchColumn = findSingleRowDigestMismatch(contract, table.rows, targetRowsForComparison, targetRows.get(contract.name).columnTypes);
      throw new Error(`${contract.name}: post-import checksum mismatch${mismatchColumn ? ` (${mismatchColumn})` : ""}`);
    }
  }
}

function findSingleRowDigestMismatch(contract, archiveRows, targetRows, columnTypes) {
  if (archiveRows.length !== 1 || targetRows.length !== 1) return null;
  for (const column of Object.keys(archiveRows[0]).sort()) {
    const archiveDigest = digestRows(contract, [{ [column]: archiveRows[0][column] }]);
    const targetDigest = digestRows(contract, [{ [column]: targetRows[0][column] }], new Map([[column, columnTypes.get(column)]]));
    if (archiveDigest !== targetDigest) return column;
  }
  return null;
}

async function loadTargetRows(sql, validated, targetSchema, onlyTable) {
  const result = new Map();
  for (const contract of validated.contracts) {
    if (onlyTable && contract.name !== onlyTable) continue;
    const table = validated.tables.get(contract.name);
    const columns = table.columns;
    const selected = columns.map((column) => `${quoteIdent(targetColumn(contract, column))} AS ${quoteIdent(column)}`).join(", ");
    const order = contract.rowIdentity.map((column) => quoteIdent(targetColumn(contract, column))).join(", ");
    const rows = await sql.unsafe(`SELECT ${selected} FROM ${publicIdent(contract.name)} ORDER BY ${order}`);
    const columnTypes = new Map(columns.map((column) => [column, targetSchema.get(contract.name).columns.get(targetColumn(contract, column))]));
    result.set(contract.name, { rows, columnTypes });
  }
  return result;
}

export function digestRows(contract, rows, columnTypes = new Map()) {
  const normalized = rows.map((row) => {
    const normalizedRow = {};
    for (const column of Object.keys(row).sort()) {
      const type = columnTypes.get(column);
      normalizedRow[column] = normalizeComparedValue(contract, column, row[column], type);
    }
    return stableCanonicalize(normalizedRow);
  }).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return normalized.join("|");
}

function normalizeComparedValue(contract, column, value, targetType) {
  if (value === null || value === undefined) return null;
  if (contract.jsonbColumns.includes(column)) {
    if (typeof value === "string") {
      try { return stableCanonicalize(JSON.parse(value)); } catch { return value; }
    }
    return stableCanonicalize(value);
  }
  const dataType = targetDataType(targetType);
  if (dataType === "boolean") return value === true || value === 1 ? 1 : 0;
  if (dataType && /timestamp|date|time/.test(dataType)) {
    const date = parseTimestamp(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (dataType && /integer|numeric|double precision|real|bigint/.test(dataType) && typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function normalizeTimestamp(value) {
  const date = parseTimestamp(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function parseTimestamp(value) {
  if (value instanceof Date) return value;
  const text = String(value);
  const utcText = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)
    ? text
    : `${text.replace(" ", "T")}Z`;
  return new Date(utcText);
}

function stableCanonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${stableCanonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function targetSupportsRowIdentity(target, contract) {
  if (contract.nullableIdentityColumns.length === 0
    && sameStringArray(target.physicalPrimaryKey, contract.rowIdentity)) return true;
  return target.uniqueKeys.some((key) => sameStringArray(key.columns, contract.rowIdentity)
    && (contract.nullableIdentityColumns.length === 0 || key.nullsNotDistinct === true));
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const dir = path.resolve(String(args.get("dir") ?? "data-export"));
  const validated = validateDataExportDirectory(dir);

  if (args.get("dry-run") === true) {
    console.log(`Validated ${validated.manifest.tableOrder.length} tables from ${dir}; no database connection or writes were made.`);
    return;
  }

  console.log(`Importing export from ${validated.manifest.exportedAt}`);
  const manifest = await importSupabaseData({ dir, databaseUrl: process.env.DATABASE_URL, restoreHistorical: args.get("restore-historical") === true });
  for (const table of manifest.tableOrder) {
    console.log(`${table}: ${manifest.tables[table].rows} rows`);
  }
  console.log("Import committed atomically. Protected settings columns were left unchanged.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
