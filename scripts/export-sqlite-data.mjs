import Database from "better-sqlite3";
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

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--")) args.set(key.slice(2), value);
}

const dbPath = path.resolve(args.get("db") ?? "nosite-leads.db");
const outDir = path.resolve(args.get("out") ?? "data-export");
const migrateEncryptedKeys = process.env.MIGRATE_ENCRYPTED_KEYS === "1";

if (!fs.existsSync(dbPath)) {
  console.error(`SQLite DB not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const manifest = {
  exportedAt: new Date().toISOString(),
  source: dbPath,
  encryptedKeysMigrated: migrateEncryptedKeys,
  tables: {},
};

for (const table of TABLES) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  const rows = exists ? db.prepare(`SELECT * FROM ${table}`).all() : [];

  if (table === "settings" && !migrateEncryptedKeys) {
    for (const row of rows) {
      row.openai_api_key_encrypted = null;
      row.google_places_api_key_encrypted = null;
    }
  }

  const fileName = `${table}.json`;
  fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(rows, null, 2));
  manifest.tables[table] = { file: fileName, rows: rows.length };
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Exported ${TABLES.length} tables to ${outDir}`);
for (const table of TABLES) {
  console.log(`${table}: ${manifest.tables[table].rows}`);
}
