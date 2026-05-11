import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const TABLES = [
  "zip_codes",
  "settings",
  "crawl_runs",
  "leads",
  "crawl_units",
  "outreach_events",
  "demos",
  "place_cache",
  "places_master",
  "place_observations",
  "api_usage_events",
  "ai_lead_verifications",
  "ai_usage_events",
  "audit_logs",
];

const PRIMARY_KEYS = {
  zip_codes: ["zip"],
  settings: ["id"],
  crawl_runs: ["id"],
  leads: ["id"],
  crawl_units: ["id"],
  outreach_events: ["id"],
  demos: ["id"],
  place_cache: ["place_id"],
  places_master: ["place_id"],
  place_observations: ["id"],
  api_usage_events: ["id"],
  ai_lead_verifications: ["id"],
  ai_usage_events: ["id"],
  audit_logs: ["id"],
};

const JSONB_COLUMNS = new Map([
  ["settings", new Set(["niche_weights", "social_hosts", "basic_hosts"])],
  ["leads", new Set(["categories", "review_highlights", "website_health", "verification", "ai_website_health"])],
  ["demos", new Set(["config_json"])],
  ["place_cache", new Set(["raw_json"])],
  ["places_master", new Set(["categories", "review_highlights", "website_health"])],
  ["place_observations", new Set(["raw_json"])],
  ["api_usage_events", new Set(["metadata"])],
  ["ai_lead_verifications", new Set(["social_profiles", "sources", "website_health_json", "raw_json"])],
  ["ai_usage_events", new Set(["metadata"])],
  ["audit_logs", new Set(["metadata"])],
]);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--")) args.set(key.slice(2), value);
}

const dir = path.resolve(args.get("dir") ?? "data-export");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Use the Supabase transaction pooler connection string.");
  process.exit(1);
}

const manifestPath = path.join(dir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`Export manifest not found: ${manifestPath}`);
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: "require",
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
});

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`Importing export from ${manifest.exportedAt ?? "unknown time"}`);

  for (const table of TABLES) {
    const tableInfo = manifest.tables?.[table];
    const fileName = tableInfo?.file ?? `${table}.json`;
    const filePath = path.join(dir, fileName);
    const rows = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : [];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }

    await importTable(sql, table, rows);
    console.log(`${table}: ${rows.length} rows`);
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function importTable(sql, table, rows) {
  const columns = Object.keys(rows[0]);
  const pk = PRIMARY_KEYS[table];
  if (!pk) throw new Error(`Missing primary key config for ${table}`);

  const batchSize = 200;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = [];
    let valueIndex = 1;

    for (const row of batch) {
      const placeholders = [];
      for (const column of columns) {
        const isJsonb = JSONB_COLUMNS.get(table)?.has(column) ?? false;
        placeholders.push(`$${valueIndex++}${isJsonb ? "::jsonb" : ""}`);
        values.push(normalizeValue(table, column, row[column]));
      }
      tuples.push(`(${placeholders.join(", ")})`);
    }

    const updateColumns = columns.filter((column) => !pk.includes(column));
    const updateSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(", ")}`
      : "DO NOTHING";

    const query = `
      INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
      VALUES ${tuples.join(", ")}
      ON CONFLICT (${pk.map(quoteIdent).join(", ")}) ${updateSql}
    `;
    await sql.unsafe(query, values);
  }
}

function normalizeValue(table, column, value) {
  if ((JSONB_COLUMNS.get(table)?.has(column) ?? false) && typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return JSON.stringify(value);
    }
  }
  if ((JSONB_COLUMNS.get(table)?.has(column) ?? false) && value !== null && value !== undefined) {
    return JSON.stringify(value);
  }
  return value;
}

function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
