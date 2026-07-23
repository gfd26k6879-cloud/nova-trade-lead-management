import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DATA_EXPORT_FORMAT = "nosite-data-export";
export const DATA_EXPORT_SCHEMA_VERSION = 2;
export const DATA_EXPORT_SANITIZED_COLUMNS = Object.freeze({
  place_cache: Object.freeze(["raw_json:strip_google_reviews"]),
  place_observations: Object.freeze(["raw_json:strip_google_reviews"]),
});

const definitions = [
  { name: "zip_codes", primaryKey: ["zip"] },
  { name: "location_markets", primaryKey: ["id"] },
  { name: "location_cells", primaryKey: ["id"] },
  { name: "settings", primaryKey: ["id"], jsonbColumns: ["niche_weights", "social_hosts", "basic_hosts"], excludedColumns: ["openai_api_key_encrypted", "google_places_api_key_encrypted", "google_maps_browser_api_key_encrypted"] },
  { name: "app_users", primaryKey: ["id"] },
  { name: "user_market_access", primaryKey: ["user_id", "market_id"] },
  { name: "crawl_runs", primaryKey: ["id"], jsonbColumns: ["categories", "selection_json"] },
  { name: "crawl_units", primaryKey: ["id"] },
  { name: "leads", primaryKey: ["id"], jsonbColumns: ["categories", "review_highlights", "website_health", "verification", "ai_website_health"] },
  { name: "lead_notes", primaryKey: ["id"] },
  { name: "outreach_events", primaryKey: ["id"] },
  { name: "admin_requests", primaryKey: ["id"] },
  { name: "demos", primaryKey: ["id"], jsonbColumns: ["config_json"] },
  { name: "place_cache", primaryKey: ["place_id"], jsonbColumns: ["raw_json"] },
  { name: "places_master", primaryKey: ["place_id"], jsonbColumns: ["categories", "review_highlights", "website_health"] },
  { name: "place_observations", primaryKey: ["id"], jsonbColumns: ["raw_json"] },
  { name: "api_usage_events", primaryKey: ["id"], jsonbColumns: ["metadata"] },
  { name: "ai_lead_verifications", primaryKey: ["id"], jsonbColumns: ["social_profiles", "sources", "website_health_json", "raw_json"] },
  { name: "ai_usage_events", primaryKey: ["id"], jsonbColumns: ["metadata"] },
  { name: "lead_ai_artifacts", primaryKey: ["id"], jsonbColumns: ["content_json", "sources_json"] },
  { name: "ai_feedback_events", primaryKey: ["id"] },
  { name: "worker_runs", primaryKey: ["id"], jsonbColumns: ["result_json"] },
  { name: "audit_logs", primaryKey: ["id"], jsonbColumns: ["metadata"] },
];

export const TABLE_CONTRACTS = Object.freeze(definitions.map((definition) => Object.freeze({
  name: definition.name,
  primaryKey: Object.freeze([...(definition.primaryKey ?? [])]),
  jsonbColumns: Object.freeze([...(definition.jsonbColumns ?? [])]),
  excludedColumns: Object.freeze([...(definition.excludedColumns ?? [])]),
})));

export const TABLE_NAMES = Object.freeze(TABLE_CONTRACTS.map(({ name }) => name));
export const TABLE_CONTRACT_BY_NAME = new Map(TABLE_CONTRACTS.map((contract) => [contract.name, contract]));

export function parseCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    index += 1;
  }
  return args;
}

export function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeRawGoogleReviewJson(value, label = "raw_json") {
  if (value === null || value === undefined) return value;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`${label}: invalid JSON cannot be safely redacted: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const sanitized = stripGoogleReviewCollections(parsed);
  return typeof value === "string" ? JSON.stringify(sanitized) : sanitized;
}

export function containsRawGoogleReviews(value) {
  if (Array.isArray(value)) return value.some(containsRawGoogleReviews);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => key.toLowerCase() === "reviews" || containsRawGoogleReviews(nested));
}

function stripGoogleReviewCollections(value) {
  if (Array.isArray(value)) return value.map(stripGoogleReviewCollections);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.toLowerCase() !== "reviews")
      .map(([key, nested]) => [key, stripGoogleReviewCollections(nested)]),
  );
}

export function validateDataExportDirectory(inputDir) {
  const dir = path.resolve(inputDir);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Export manifest not found: ${manifestPath}`);
  }

  const manifest = parseJsonFile(manifestPath, "export manifest");
  assertRecord(manifest, "Export manifest must be a JSON object");
  assertExactKeys(
    manifest,
    ["format", "schemaVersion", "exportedAt", "source", "tableOrder", "excludedColumns", "sanitizedColumns", "tables"],
    "Export manifest",
  );

  if (manifest.format !== DATA_EXPORT_FORMAT) {
    throw new Error(`Unsupported export format: ${String(manifest.format ?? "missing")}`);
  }
  if (manifest.schemaVersion !== DATA_EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported export schema version: ${String(manifest.schemaVersion ?? "missing")}`);
  }
  if (!isIsoDate(manifest.exportedAt)) {
    throw new Error("Export manifest exportedAt must be a valid ISO timestamp");
  }
  assertRecord(manifest.source, "Export manifest source must be an object");
  assertExactKeys(manifest.source, ["kind", "file"], "Export manifest source");
  if (manifest.source.kind !== "sqlite") {
    throw new Error(`Unsupported export source: ${String(manifest.source.kind ?? "missing")}`);
  }
  if (
    typeof manifest.source.file !== "string"
    || !manifest.source.file
    || path.basename(manifest.source.file) !== manifest.source.file
  ) {
    throw new Error("Export manifest source.file must be a base file name");
  }
  assertStringArrayEqual(manifest.tableOrder, TABLE_NAMES, "Export manifest tableOrder");
  assertRecord(manifest.tables, "Export manifest tables must be an object");
  assertExactKeys(manifest.tables, TABLE_NAMES, "Export manifest tables");

  const expectedExclusions = Object.fromEntries(
    TABLE_CONTRACTS
      .filter(({ excludedColumns }) => excludedColumns.length > 0)
      .map(({ name, excludedColumns }) => [name, [...excludedColumns]]),
  );
  assertRecord(manifest.excludedColumns, "Export manifest excludedColumns must be an object");
  assertExactKeys(manifest.excludedColumns, Object.keys(expectedExclusions), "Export manifest excludedColumns");
  for (const [table, columns] of Object.entries(expectedExclusions)) {
    assertStringArrayEqual(manifest.excludedColumns[table], columns, `Export manifest excludedColumns.${table}`);
  }
  assertRecord(manifest.sanitizedColumns, "Export manifest sanitizedColumns must be an object");
  assertExactKeys(manifest.sanitizedColumns, Object.keys(DATA_EXPORT_SANITIZED_COLUMNS), "Export manifest sanitizedColumns");
  for (const [table, columns] of Object.entries(DATA_EXPORT_SANITIZED_COLUMNS)) {
    assertStringArrayEqual(manifest.sanitizedColumns[table], columns, `Export manifest sanitizedColumns.${table}`);
  }

  const tables = new Map();
  for (const contract of TABLE_CONTRACTS) {
    const tableInfo = manifest.tables[contract.name];
    assertRecord(tableInfo, `Manifest entry for ${contract.name} must be an object`);
    assertExactKeys(
      tableInfo,
      ["file", "rows", "columns", "primaryKey", "bytes", "sha256"],
      `Manifest entry for ${contract.name}`,
    );

    const expectedFile = `${contract.name}.json`;
    if (tableInfo.file !== expectedFile) {
      throw new Error(`${contract.name}: expected file ${expectedFile}, received ${String(tableInfo.file)}`);
    }
    assertStringArray(tableInfo.columns, `${contract.name}: columns`);
    assertUnique(tableInfo.columns, `${contract.name}: columns`);
    assertStringArrayEqual(tableInfo.primaryKey, contract.primaryKey, `${contract.name}: primaryKey`);
    for (const column of contract.primaryKey) {
      if (!tableInfo.columns.includes(column)) {
        throw new Error(`${contract.name}: primary key column ${column} is absent from the export`);
      }
    }
    for (const column of contract.excludedColumns) {
      if (tableInfo.columns.includes(column)) {
        throw new Error(`${contract.name}: protected column ${column} must be excluded from exports`);
      }
    }
    assertNonNegativeInteger(tableInfo.rows, `${contract.name}: rows`);
    assertNonNegativeInteger(tableInfo.bytes, `${contract.name}: bytes`);
    if (typeof tableInfo.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(tableInfo.sha256)) {
      throw new Error(`${contract.name}: sha256 must be a lowercase SHA-256 digest`);
    }

    const filePath = path.join(dir, expectedFile);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`${contract.name}: data file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath);
    if (raw.byteLength !== tableInfo.bytes) {
      throw new Error(`${contract.name}: byte count mismatch (manifest ${tableInfo.bytes}, file ${raw.byteLength})`);
    }
    const actualSha = sha256(raw);
    if (actualSha !== tableInfo.sha256) {
      throw new Error(`${contract.name}: checksum mismatch`);
    }

    let rows;
    try {
      rows = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      throw new Error(`${contract.name}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(rows)) {
      throw new Error(`${contract.name}: data file must contain a JSON array`);
    }
    if (rows.length !== tableInfo.rows) {
      throw new Error(`${contract.name}: row count mismatch (manifest ${tableInfo.rows}, file ${rows.length})`);
    }

    const seenPrimaryKeys = new Set();
    for (const [rowIndex, row] of rows.entries()) {
      assertRecord(row, `${contract.name}[${rowIndex}] must be a JSON object`);
      assertExactKeys(row, tableInfo.columns, `${contract.name}[${rowIndex}]`);
      for (const column of contract.excludedColumns) {
        if (Object.hasOwn(row, column)) {
          throw new Error(`${contract.name}[${rowIndex}]: protected column ${column} must be excluded`);
        }
      }
      if (Object.hasOwn(DATA_EXPORT_SANITIZED_COLUMNS, contract.name)) {
        let rawJson;
        try {
          rawJson = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
        } catch (error) {
          throw new Error(`${contract.name}[${rowIndex}].raw_json: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (containsRawGoogleReviews(rawJson)) {
          throw new Error(`${contract.name}[${rowIndex}].raw_json: raw Google reviews must be redacted`);
        }
      }
      const primaryKey = contract.primaryKey.map((column) => {
        const value = row[column];
        if (value === null || value === undefined || value === "") {
          throw new Error(`${contract.name}[${rowIndex}]: primary key column ${column} is empty`);
        }
        return value;
      });
      const encodedPrimaryKey = JSON.stringify(primaryKey);
      if (seenPrimaryKeys.has(encodedPrimaryKey)) {
        throw new Error(`${contract.name}: duplicate primary key at row ${rowIndex}`);
      }
      seenPrimaryKeys.add(encodedPrimaryKey);
    }

    tables.set(contract.name, {
      contract,
      columns: [...tableInfo.columns],
      filePath,
      rows,
    });
  }

  return { dir, manifest, tables };
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to parse ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function assertStringArrayEqual(actual, expected, label) {
  assertStringArray(actual, label);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} does not match the recovery contract`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length || actualKeys.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
