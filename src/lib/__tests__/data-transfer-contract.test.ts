import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  TABLE_CONTRACTS,
  TABLE_NAMES,
  sha256,
  validateDataExportDirectory,
} from "../../../scripts/data-transfer-contract.mjs";
import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";
import { normalizeValue, validateTargetSchema } from "../../../scripts/import-supabase-data.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("data recovery contract", () => {
  it("exports and validates every application table while excluding encrypted settings", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    const manifest = exportSqliteData({ dbPath, outDir });
    const validated = validateDataExportDirectory(outDir);
    const settingsManifest = (manifest.tables as Record<string, { columns: string[] }>).settings;

    expect(manifest.tableOrder).toEqual(TABLE_NAMES);
    expect(validated.tables.size).toBe(23);
    expect(validated.tables.get("settings")!.rows).toEqual([{ id: 1 }]);
    expect(settingsManifest.columns).not.toContain("openai_api_key_encrypted");
    expect(settingsManifest.columns).not.toContain("google_places_api_key_encrypted");
    expect(settingsManifest.columns).not.toContain("google_maps_browser_api_key_encrypted");
    expect(manifest.sanitizedColumns).toEqual({
      place_cache: ["raw_json:strip_google_reviews"],
      place_observations: ["raw_json:strip_google_reviews"],
    });

    for (const table of ["place_cache", "place_observations"]) {
      const [row] = validated.tables.get(table)!.rows;
      const raw = JSON.parse(row.raw_json);
      expect(raw.reviews).toBeUndefined();
      expect(raw.nested?.reviews).toBeUndefined();
      expect(raw.id).toBe("places/legacy");
      expect(raw.editorialSummary).toEqual({ text: "Safe summary" });
      expect(raw.__nositeCache?.reviewInsights?.keywords).toEqual(["responsive"]);
    }
  });

  it("rejects a missing table and a tampered data file", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath, outDir });

    const manifestPath = path.join(outDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.tables.worker_runs;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/unexpected or missing keys/);

    exportSqliteData({ dbPath, outDir });
    fs.appendFileSync(path.join(outDir, "leads.json"), " ");
    expect(() => validateDataExportDirectory(outDir)).toThrow(/byte count mismatch/);
  });

  it("rejects protected columns even when a forged manifest checksum is internally consistent", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath, outDir });

    const manifestPath = path.join(outDir, "manifest.json");
    const settingsPath = path.join(outDir, "settings.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const rows = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    rows[0].openai_api_key_encrypted = "forged-secret";
    const payload = `${JSON.stringify(rows, null, 2)}\n`;
    fs.writeFileSync(settingsPath, payload);
    manifest.tables.settings.columns.push("openai_api_key_encrypted");
    manifest.tables.settings.bytes = Buffer.byteLength(payload);
    manifest.tables.settings.sha256 = sha256(payload);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    expect(() => validateDataExportDirectory(outDir)).toThrow(/protected column openai_api_key_encrypted/);
  });

  it("refuses the legacy encrypted-key export override", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    const previous = process.env.MIGRATE_ENCRYPTED_KEYS;
    process.env.MIGRATE_ENCRYPTED_KEYS = "1";
    try {
      expect(() => exportSqliteData({ dbPath, outDir })).toThrow(/no longer supported/);
    } finally {
      if (previous === undefined) delete process.env.MIGRATE_ENCRYPTED_KEYS;
      else process.env.MIGRATE_ENCRYPTED_KEYS = previous;
    }
  });

  it("validates target table, key, column, and JSONB expectations before import", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath, outDir });
    const validated = validateDataExportDirectory(outDir);
    const targetSchema = new Map(TABLE_CONTRACTS.map((contract) => {
      const exported = validated.tables.get(contract.name)!;
      const columns = new Map([
        ...exported.columns.map((column: string) => [column, contract.jsonbColumns.includes(column) ? "jsonb" : "text"]),
        ...contract.excludedColumns.map((column: string) => [column, "text"]),
        ...contract.jsonbColumns.map((column: string) => [column, "jsonb"]),
      ]);
      return [contract.name, { columns, primaryKey: [...contract.primaryKey] }];
    }));

    expect(() => validateTargetSchema(targetSchema, validated)).not.toThrow();
    targetSchema.delete("ai_feedback_events");
    expect(() => validateTargetSchema(targetSchema, validated)).toThrow(/target table is missing/);
  });

  it("rejects invalid SQLite text for a Postgres JSONB column", () => {
    const contract = TABLE_CONTRACTS.find(({ name }: { name: string }) => name === "crawl_runs")!;
    expect(normalizeValue(contract, "categories", '["dentist"]')).toBe('["dentist"]');
    expect(() => normalizeValue(contract, "categories", "not-json")).toThrow(/not valid JSON/);
  });
});

function createSyntheticSqliteDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nosite-data-recovery-"));
  temporaryDirectories.push(root);
  const dbPath = path.join(root, "source.db");
  const outDir = path.join(root, "export");
  const db = new Database(dbPath);
  try {
    for (const contract of TABLE_CONTRACTS) {
      if (contract.name === "settings") {
        db.exec(`CREATE TABLE settings (
          id INTEGER PRIMARY KEY,
          openai_api_key_encrypted TEXT,
          google_places_api_key_encrypted TEXT,
          google_maps_browser_api_key_encrypted TEXT
        )`);
        continue;
      }
      const columns = contract.primaryKey.map((column: string) => `${column} TEXT NOT NULL`);
      if (contract.name === "place_cache" || contract.name === "place_observations") {
        columns.push("raw_json TEXT NOT NULL");
      }
      const primaryKey = `PRIMARY KEY (${contract.primaryKey.join(", ")})`;
      db.exec(`CREATE TABLE ${contract.name} (${[...columns, primaryKey].join(", ")})`);
    }
    db.prepare(`INSERT INTO settings (
      id, openai_api_key_encrypted, google_places_api_key_encrypted, google_maps_browser_api_key_encrypted
    ) VALUES (1, 'openai-secret', 'places-secret', 'browser-secret')`).run();
    const legacyRawJson = JSON.stringify({
      id: "places/legacy",
      reviews: [{ text: { text: "Raw review text" }, authorAttribution: { displayName: "Private reviewer" } }],
      nested: { reviews: [{ text: { text: "Nested review text" } }] },
      editorialSummary: { text: "Safe summary" },
      __nositeCache: {
        schemaVersion: 1,
        detailsStage: "stage-b",
        reviewInsights: { keywords: ["responsive"], painPoints: [], sentimentRatio: 1, totalReviews: 1 },
      },
    });
    db.prepare("INSERT INTO place_cache (place_id, raw_json) VALUES (?, ?)").run("place-legacy", legacyRawJson);
    db.prepare("INSERT INTO place_observations (id, raw_json) VALUES (?, ?)").run("observation-legacy", legacyRawJson);
  } finally {
    db.close();
  }
  return { dbPath, outDir };
}
