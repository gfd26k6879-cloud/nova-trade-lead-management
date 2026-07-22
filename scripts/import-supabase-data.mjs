import path from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import {
  TABLE_CONTRACTS,
  TABLE_NAMES,
  parseCliArgs,
  quoteIdent,
  validateDataExportDirectory,
} from "./data-transfer-contract.mjs";

const AUTH_REFERENCE_COLUMNS = new Map([
  ["app_users", ["user_id", "created_by", "team_lead_user_id"]],
  ["leads", ["assigned_to_user_id"]],
  ["lead_notes", ["author_user_id"]],
  ["outreach_events", ["actor_user_id"]],
  ["admin_requests", ["created_by_user_id", "assigned_admin_user_id"]],
  ["ai_lead_verifications", ["requested_by_user_id"]],
  ["ai_usage_events", ["actor_user_id"]],
  ["lead_ai_artifacts", ["requested_by_user_id"]],
  ["ai_feedback_events", ["actor_user_id"]],
  ["audit_logs", ["actor_user_id"]],
]);

export async function importSupabaseData({ dir: inputDir, databaseUrl }) {
  const validated = validateDataExportDirectory(inputDir);
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required. Use the Supabase transaction pooler connection string.");
  }

  const sql = postgres(databaseUrl, {
    ssl: "require",
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  try {
    const targetSchema = await loadTargetSchema(sql);
    validateTargetSchema(targetSchema, validated);
    await validateAuthReferences(sql, validated);

    await sql.begin(async (transaction) => {
      for (const contract of TABLE_CONTRACTS) {
        const table = validated.tables.get(contract.name);
        if (!table) throw new Error(`Validated export is missing ${contract.name}`);
        if (table.rows.length === 0) continue;
        await importTable(transaction, contract, table.columns, table.rows);
      }
    });

    return validated.manifest;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function validateTargetSchema(targetSchema, validated) {
  for (const contract of TABLE_CONTRACTS) {
    const target = targetSchema.get(contract.name);
    if (!target) {
      throw new Error(`${contract.name}: target table is missing; reconcile and apply migrations before importing`);
    }
    const exported = validated.tables.get(contract.name);
    if (!exported) throw new Error(`${contract.name}: validated export entry is missing`);

    if (!sameStringArray(target.primaryKey, contract.primaryKey)) {
      throw new Error(`${contract.name}: target primary key does not match the recovery contract`);
    }
    for (const column of [...exported.columns, ...contract.excludedColumns]) {
      if (!target.columns.has(column)) {
        throw new Error(`${contract.name}: target column ${column} is missing; reconcile and apply migrations before importing`);
      }
    }
    for (const column of contract.jsonbColumns) {
      if (target.columns.get(column) !== "jsonb") {
        throw new Error(`${contract.name}.${column}: expected target type jsonb`);
      }
    }
  }
}

export function normalizeValue(contract, column, value) {
  if (!contract.jsonbColumns.includes(column) || value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "string") return JSON.stringify(value);

  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    throw new Error(`${contract.name}.${column}: source value is not valid JSON`);
  }
}

async function loadTargetSchema(sql) {
  const tablePlaceholders = TABLE_NAMES.map((_, index) => `$${index + 1}`).join(", ");
  const columnRows = await sql.unsafe(
    `SELECT table_name, column_name, data_type, ordinal_position
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tablePlaceholders})
      ORDER BY table_name, ordinal_position`,
    [...TABLE_NAMES],
  );
  const primaryKeyRows = await sql.unsafe(
    `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.constraint_schema = tc.constraint_schema
        AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name IN (${tablePlaceholders})
      ORDER BY tc.table_name, kcu.ordinal_position`,
    [...TABLE_NAMES],
  );

  const result = new Map();
  for (const row of columnRows) {
    const table = result.get(row.table_name) ?? { columns: new Map(), primaryKey: [] };
    table.columns.set(String(row.column_name), String(row.data_type));
    result.set(String(row.table_name), table);
  }
  for (const row of primaryKeyRows) {
    const table = result.get(row.table_name);
    if (table) table.primaryKey.push(String(row.column_name));
  }
  return result;
}

async function validateAuthReferences(sql, validated) {
  const referencedIds = new Set();
  for (const [tableName, columns] of AUTH_REFERENCE_COLUMNS) {
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
    const preview = missing.slice(0, 5).join(", ");
    const suffix = missing.length > 5 ? ` and ${missing.length - 5} more` : "";
    throw new Error(`Supabase Auth must be restored first; ${missing.length} referenced user ID(s) are missing (${preview}${suffix})`);
  }
}

async function importTable(sql, contract, columns, rows) {
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
        values.push(normalizeValue(contract, column, row[column]));
      }
      tuples.push(`(${placeholders.join(", ")})`);
    }

    const updateColumns = columns.filter((column) => !contract.primaryKey.includes(column));
    const updateSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(", ")}`
      : "DO NOTHING";
    const query = `
      INSERT INTO ${quoteIdent(contract.name)} (${columns.map(quoteIdent).join(", ")})
      VALUES ${tuples.join(", ")}
      ON CONFLICT (${contract.primaryKey.map(quoteIdent).join(", ")}) ${updateSql}
    `;
    const result = await sql.unsafe(query, values);
    if (Number.isInteger(result.count) && result.count !== batch.length) {
      throw new Error(`${contract.name}: expected ${batch.length} imported rows, received ${result.count}`);
    }
  }
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  const manifest = await importSupabaseData({ dir, databaseUrl: process.env.DATABASE_URL });
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
