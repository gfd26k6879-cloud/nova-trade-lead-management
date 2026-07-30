import { createHash } from "node:crypto";

import { SCHEMA_SQL } from "./schema";

export const SQLITE_SCHEMA_V1_CATALOG_VERSION = 1 as const;
export const SQLITE_SCHEMA_V1_STAGED_USER_VERSION = 6001 as const;
export const SQLITE_SCHEMA_V1_FINAL_USER_VERSION = 6002 as const;
export const SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT = 37 as const;
export const SQLITE_SCHEMA_V1_PRIMARY_SCHEMA = "main" as const;
export const SQLITE_SCHEMA_V1_CATALOG_DIGEST = "080477dd8fce09c3e8d8ca7461f2bc0a8b2222edab26afe7297367bdfe6362cf" as const;
export const SQLITE_SCHEMA_V1_ACCEPTED_SOURCE_DIGEST = "b47346d186f2768f577b6e9b52f6112ee09c5d94b05aad3ef31303343c07a8f8" as const;
export const SQLITE_SCHEMA_V1_DEFINITION_DIGEST = "fd28b893542b08248df08f58706f2947d1c3bef5aeecf920ee19ea2eeeb280d2" as const;

export const SQLITE_SCHEMA_V1_TRANSFORM_TABLES = Object.freeze([
  "settings",
  "user_market_access",
  "leads",
  "place_cache",
  "places_master",
  "place_observations",
  "api_usage_events",
  "ai_usage_events",
  "crawl_runs",
  "crawl_units",
  "lead_notes",
  "outreach_events",
  "admin_requests",
  "demos",
  "ai_lead_verifications",
  "lead_ai_artifacts",
  "ai_feedback_events",
] as const);

export const SQLITE_SCHEMA_V1_PRESERVED_TABLES = Object.freeze(["audit_logs"] as const);

export const SQLITE_SCHEMA_V1_PRESERVATION_TABLES = Object.freeze([
  ...SQLITE_SCHEMA_V1_TRANSFORM_TABLES,
  ...SQLITE_SCHEMA_V1_PRESERVED_TABLES,
  "compatibility_backfill_receipts",
] as const);

interface TablePatch {
  readonly replacements?: readonly (readonly [string, string])[];
  readonly additions: string;
}

const TENANT_FOREIGN_KEY = `CONSTRAINT __TABLE___tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT`;

const WORKSPACE_FOREIGN_KEY = `CONSTRAINT __TABLE___tenant_workspace_fkey
    FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT`;

function scopedForeignKeys(table: string, workspace: boolean): string {
  const constraints = [TENANT_FOREIGN_KEY.replaceAll("__TABLE__", table)];
  if (workspace) constraints.push(WORKSPACE_FOREIGN_KEY.replaceAll("__TABLE__", table));
  return constraints.join(",\n  ");
}

const TABLE_PATCHES: Readonly<Record<(typeof SQLITE_SCHEMA_V1_TRANSFORM_TABLES)[number], TablePatch>> = {
  settings: {
    additions: `tenant_id TEXT NOT NULL,
  ${scopedForeignKeys("settings", false)}`,
  },
  user_market_access: {
    replacements: [[",\n  PRIMARY KEY (user_id, market_id)", ""]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("user_market_access", true)}`,
  },
  leads: {
    replacements: [["place_id TEXT NOT NULL UNIQUE", "place_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  CONSTRAINT leads_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT leads_tenant_place_id_unique UNIQUE (tenant_id, place_id),
  ${scopedForeignKeys("leads", false)}`,
  },
  place_cache: {
    replacements: [["place_id TEXT PRIMARY KEY", "place_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  source_card_id TEXT NOT NULL
    CONSTRAINT place_cache_source_card_id_chk CHECK (source_card_id = 'google_places_legacy'),
  CONSTRAINT place_cache_pkey PRIMARY KEY (tenant_id, source_card_id, place_id),
  ${scopedForeignKeys("place_cache", false)}`,
  },
  places_master: {
    replacements: [["place_id TEXT PRIMARY KEY", "place_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  source_card_id TEXT NOT NULL
    CONSTRAINT places_master_source_card_id_chk CHECK (source_card_id = 'google_places_legacy'),
  CONSTRAINT places_master_pkey PRIMARY KEY (tenant_id, source_card_id, place_id),
  ${scopedForeignKeys("places_master", false)}`,
  },
  place_observations: {
    replacements: [["id TEXT PRIMARY KEY", "id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  source_card_id TEXT NOT NULL
    CONSTRAINT place_observations_source_card_id_chk CHECK (source_card_id = 'google_places_legacy'),
  CONSTRAINT place_observations_pkey PRIMARY KEY (tenant_id, source_card_id, id),
  ${scopedForeignKeys("place_observations", false)},
  CONSTRAINT place_observations_tenant_source_place_fkey
    FOREIGN KEY (tenant_id, source_card_id, place_id)
    REFERENCES places_master(tenant_id, source_card_id, place_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT place_observations_tenant_run_fkey
    FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES crawl_runs(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT place_observations_tenant_unit_fkey
    FOREIGN KEY (tenant_id, crawl_unit_id) REFERENCES crawl_units(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT place_observations_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT`,
  },
  api_usage_events: {
    replacements: [["id TEXT PRIMARY KEY", "id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  source_card_id TEXT NOT NULL
    CONSTRAINT api_usage_events_source_card_id_chk CHECK (source_card_id = 'google_places_legacy'),
  CONSTRAINT api_usage_events_pkey PRIMARY KEY (tenant_id, source_card_id, id),
  ${scopedForeignKeys("api_usage_events", false)},
  CONSTRAINT api_usage_events_tenant_run_fkey
    FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES crawl_runs(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT api_usage_events_tenant_unit_fkey
    FOREIGN KEY (tenant_id, crawl_unit_id) REFERENCES crawl_units(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT api_usage_events_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT`,
  },
  ai_usage_events: {
    replacements: [
      ["lead_id TEXT REFERENCES leads(id)", "lead_id TEXT"],
      ["verification_id TEXT REFERENCES ai_lead_verifications(id)", "verification_id TEXT"],
    ],
    additions: `tenant_id TEXT NOT NULL,
  ${scopedForeignKeys("ai_usage_events", false)},
  CONSTRAINT ai_usage_events_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT ai_usage_events_tenant_verification_fkey
    FOREIGN KEY (tenant_id, verification_id) REFERENCES ai_lead_verifications(tenant_id, id)
    ON UPDATE RESTRICT`,
  },
  crawl_runs: {
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  CONSTRAINT crawl_runs_tenant_id_id_unique UNIQUE (tenant_id, id),
  ${scopedForeignKeys("crawl_runs", true)},
  CONSTRAINT crawl_runs_market_id_fkey
    FOREIGN KEY (market_id) REFERENCES location_markets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT`,
  },
  crawl_units: {
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  location_mode TEXT NOT NULL DEFAULT 'legacy_zip'
    CONSTRAINT crawl_units_location_mode_chk
    CHECK (location_mode IN ('legacy_zip', 'platform_cell', 'generalized')),
  CONSTRAINT crawl_units_tenant_id_id_unique UNIQUE (tenant_id, id),
  ${scopedForeignKeys("crawl_units", true)},
  CONSTRAINT crawl_units_tenant_run_fkey
    FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES crawl_runs(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT crawl_units_market_id_fkey
    FOREIGN KEY (market_id) REFERENCES location_markets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT crawl_units_market_cell_fkey
    FOREIGN KEY (market_id, location_cell_id) REFERENCES location_cells(market_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT`,
  },
  lead_notes: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id)", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("lead_notes", true)},
  CONSTRAINT lead_notes_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  outreach_events: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id)", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("outreach_events", true)},
  CONSTRAINT outreach_events_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  admin_requests: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("admin_requests", true)},
  CONSTRAINT admin_requests_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  demos: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id)", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("demos", true)},
  CONSTRAINT demos_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  ai_lead_verifications: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id)", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  CONSTRAINT ai_lead_verifications_tenant_id_id_unique UNIQUE (tenant_id, id),
  ${scopedForeignKeys("ai_lead_verifications", true)},
  CONSTRAINT ai_lead_verifications_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  lead_ai_artifacts: {
    replacements: [["lead_id TEXT NOT NULL REFERENCES leads(id)", "lead_id TEXT NOT NULL"]],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  CONSTRAINT lead_ai_artifacts_tenant_id_id_unique UNIQUE (tenant_id, id),
  ${scopedForeignKeys("lead_ai_artifacts", true)},
  CONSTRAINT lead_ai_artifacts_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE`,
  },
  ai_feedback_events: {
    replacements: [
      ["lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE", "lead_id TEXT NOT NULL"],
      ["verification_id TEXT REFERENCES ai_lead_verifications(id) ON DELETE SET NULL", "verification_id TEXT"],
      ["artifact_id TEXT REFERENCES lead_ai_artifacts(id) ON DELETE SET NULL", "artifact_id TEXT"],
    ],
    additions: `tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  ${scopedForeignKeys("ai_feedback_events", true)},
  CONSTRAINT ai_feedback_events_tenant_lead_fkey
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT ai_feedback_events_tenant_verification_fkey
    FOREIGN KEY (tenant_id, verification_id) REFERENCES ai_lead_verifications(tenant_id, id)
    ON UPDATE RESTRICT,
  CONSTRAINT ai_feedback_events_tenant_artifact_fkey
    FOREIGN KEY (tenant_id, artifact_id) REFERENCES lead_ai_artifacts(tenant_id, id)
    ON UPDATE RESTRICT`,
  },
};

const REPLACED_LEGACY_INDEXES = Object.freeze([
  "idx_lead_notes_lead_created",
  "idx_outreach_events_lead",
  "idx_admin_requests_lead_created",
  "idx_admin_requests_open_unique",
  "idx_places_master_last_seen",
  "idx_places_master_quality",
  "idx_place_observations_place_time",
  "idx_place_observations_run_time",
  "idx_api_usage_created",
  "idx_api_usage_sku_created",
  "idx_api_usage_run_created",
  "idx_api_usage_endpoint_created",
] as const);

export const SQLITE_SCHEMA_V1_INDEX_SQL = `
CREATE UNIQUE INDEX compatibility_tenant_policies_tenant_id_id_unique
  ON tenant_policies(tenant_id, id);
CREATE UNIQUE INDEX location_cells_market_id_id_unique
  ON location_cells(market_id, id);
CREATE UNIQUE INDEX g006r_user_market_access_null_identity
  ON user_market_access(tenant_id, user_id, market_id)
  WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX g006r_user_market_access_workspace_identity
  ON user_market_access(tenant_id, workspace_id, user_id, market_id)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_user_market_access_tenant_market_user
  ON user_market_access(tenant_id, market_id, user_id);
CREATE INDEX idx_crawl_runs_tenant_workspace_status_created
  ON crawl_runs(tenant_id, workspace_id, status, created_at DESC);
CREATE INDEX idx_crawl_units_tenant_run_status
  ON crawl_units(tenant_id, crawl_run_id, status);
CREATE INDEX idx_crawl_units_tenant_workspace_market_status
  ON crawl_units(tenant_id, workspace_id, market_id, status);
CREATE INDEX idx_crawl_units_tenant_retry_ready
  ON crawl_units(tenant_id, status, next_retry_at, created_at)
  WHERE status IN ('pending', 'retry_wait');
CREATE INDEX idx_lead_notes_tenant_lead_created
  ON lead_notes(tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_outreach_events_tenant_lead_created
  ON outreach_events(tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_admin_requests_tenant_lead_created
  ON admin_requests(tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_demos_tenant_lead
  ON demos(tenant_id, lead_id);
CREATE UNIQUE INDEX admin_requests_tenant_lead_open_unique
  ON admin_requests(tenant_id, lead_id, request_type)
  WHERE status IN ('new', 'seen', 'in_progress', 'waiting_on_researcher');
CREATE INDEX idx_ai_verifications_tenant_lead_created
  ON ai_lead_verifications(tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_ai_artifacts_tenant_queue
  ON lead_ai_artifacts(tenant_id, status, next_retry_at, created_at)
  WHERE status IN ('queued', 'error');
CREATE INDEX idx_ai_feedback_tenant_lead_created
  ON ai_feedback_events(tenant_id, lead_id, created_at DESC);
CREATE INDEX idx_ai_usage_tenant_created
  ON ai_usage_events(tenant_id, created_at DESC);
CREATE INDEX idx_places_master_tenant_source_last_seen
  ON places_master(tenant_id, source_card_id, last_seen_at DESC);
CREATE INDEX idx_places_master_tenant_source_quality
  ON places_master(tenant_id, source_card_id, completeness_score DESC, freshness_score DESC);
CREATE INDEX idx_place_observations_tenant_source_place_time
  ON place_observations(tenant_id, source_card_id, place_id, observed_at DESC);
CREATE INDEX idx_place_observations_tenant_source_run_time
  ON place_observations(tenant_id, source_card_id, crawl_run_id, observed_at DESC);
CREATE INDEX idx_place_observations_tenant_source_unit_time
  ON place_observations(tenant_id, source_card_id, crawl_unit_id, observed_at DESC);
CREATE INDEX idx_place_observations_tenant_source_lead_time
  ON place_observations(tenant_id, source_card_id, lead_id, observed_at DESC);
CREATE INDEX idx_api_usage_tenant_source_created
  ON api_usage_events(tenant_id, source_card_id, created_at DESC);
CREATE INDEX idx_api_usage_tenant_source_sku_created
  ON api_usage_events(tenant_id, source_card_id, sku, created_at DESC);
CREATE INDEX idx_api_usage_tenant_source_run_created
  ON api_usage_events(tenant_id, source_card_id, crawl_run_id, created_at DESC);
CREATE INDEX idx_api_usage_tenant_source_unit_created
  ON api_usage_events(tenant_id, source_card_id, crawl_unit_id, created_at DESC);
CREATE INDEX idx_api_usage_tenant_source_lead_created
  ON api_usage_events(tenant_id, source_card_id, lead_id, created_at DESC);
CREATE INDEX idx_api_usage_tenant_source_endpoint_created
  ON api_usage_events(tenant_id, source_card_id, endpoint, created_at DESC);
`;

export const SQLITE_SCHEMA_V1_DELETE_ACTION_SQL = `
CREATE TRIGGER g006a_leads_optional_children_before_delete
BEFORE DELETE ON leads FOR EACH ROW BEGIN
  UPDATE ai_usage_events SET lead_id = NULL WHERE tenant_id = OLD.tenant_id AND lead_id = OLD.id;
  UPDATE place_observations SET lead_id = NULL WHERE tenant_id = OLD.tenant_id AND lead_id = OLD.id;
  UPDATE api_usage_events SET lead_id = NULL WHERE tenant_id = OLD.tenant_id AND lead_id = OLD.id;
END;
CREATE TRIGGER g006a_crawl_runs_optional_children_before_delete
BEFORE DELETE ON crawl_runs FOR EACH ROW BEGIN
  UPDATE place_observations SET crawl_run_id = NULL WHERE tenant_id = OLD.tenant_id AND crawl_run_id = OLD.id;
  UPDATE api_usage_events SET crawl_run_id = NULL WHERE tenant_id = OLD.tenant_id AND crawl_run_id = OLD.id;
END;
CREATE TRIGGER g006a_crawl_units_optional_children_before_delete
BEFORE DELETE ON crawl_units FOR EACH ROW BEGIN
  UPDATE place_observations SET crawl_unit_id = NULL WHERE tenant_id = OLD.tenant_id AND crawl_unit_id = OLD.id;
  UPDATE api_usage_events SET crawl_unit_id = NULL WHERE tenant_id = OLD.tenant_id AND crawl_unit_id = OLD.id;
END;
CREATE TRIGGER g006a_ai_verifications_optional_children_before_delete
BEFORE DELETE ON ai_lead_verifications FOR EACH ROW BEGIN
  UPDATE ai_feedback_events SET verification_id = NULL WHERE tenant_id = OLD.tenant_id AND verification_id = OLD.id;
  UPDATE ai_usage_events SET verification_id = NULL WHERE tenant_id = OLD.tenant_id AND verification_id = OLD.id;
END;
CREATE TRIGGER g006a_ai_artifacts_optional_children_before_delete
BEFORE DELETE ON lead_ai_artifacts FOR EACH ROW BEGIN
  UPDATE ai_feedback_events SET artifact_id = NULL WHERE tenant_id = OLD.tenant_id AND artifact_id = OLD.id;
END;
`;

export const SQLITE_SCHEMA_V1_RECEIPT_SQL = `
CREATE TABLE compatibility_backfill_receipts (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  source_engine TEXT NOT NULL CHECK(source_engine = 'sqlite'),
  checksum_algorithm TEXT NOT NULL CHECK(checksum_algorithm = 'novatrade-sqlite-canonical-json-v1'),
  manifest_hash TEXT NOT NULL CHECK(length(manifest_hash) = 64 AND manifest_hash NOT GLOB '*[^0-9a-f]*'),
  source_snapshot_fingerprint TEXT NOT NULL CHECK(length(source_snapshot_fingerprint) = 64 AND source_snapshot_fingerprint NOT GLOB '*[^0-9a-f]*'),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_auth_identity_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
  policy_hash TEXT NOT NULL CHECK(length(policy_hash) = 64 AND policy_hash NOT GLOB '*[^0-9a-f]*'),
  user_count INTEGER NOT NULL CHECK(user_count >= 0),
  table_counts_json TEXT NOT NULL,
  before_checksums_json TEXT NOT NULL,
  after_checksums_json TEXT NOT NULL,
  relationship_orphan_count INTEGER NOT NULL CHECK(relationship_orphan_count = 0),
  status TEXT NOT NULL CHECK(status = 'completed'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  receipt_json TEXT NOT NULL,
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id),
  FOREIGN KEY (tenant_id, policy_id) REFERENCES tenant_policies(tenant_id, id)
);
CREATE UNIQUE INDEX compatibility_backfill_receipts_key_unique
  ON compatibility_backfill_receipts(idempotency_key);
CREATE TRIGGER trg_t028_compatibility_receipt_no_update
BEFORE UPDATE ON compatibility_backfill_receipts BEGIN
  SELECT RAISE(ABORT, 'compatibility backfill receipts are append-only');
END;
CREATE TRIGGER trg_t028_compatibility_receipt_no_delete
BEFORE DELETE ON compatibility_backfill_receipts BEGIN
  SELECT RAISE(ABORT, 'compatibility backfill receipts are append-only');
END;
CREATE TRIGGER trg_t028_compatibility_receipt_binding
BEFORE INSERT ON compatibility_backfill_receipts BEGIN
  SELECT CASE WHEN json_extract(NEW.receipt_json, '$.receiptId') IS NOT NEW.id
    OR json_extract(NEW.receipt_json, '$.idempotencyKey') IS NOT NEW.idempotency_key
    OR CAST(json_extract(NEW.receipt_json, '$.schemaVersion') AS INTEGER) IS NOT NEW.schema_version
    OR json_extract(NEW.receipt_json, '$.sourceEngine') IS NOT NEW.source_engine
    OR json_extract(NEW.receipt_json, '$.checksumAlgorithm') IS NOT NEW.checksum_algorithm
    OR json_extract(NEW.receipt_json, '$.manifestHash') IS NOT NEW.manifest_hash
    OR json_extract(NEW.receipt_json, '$.sourceSnapshotFingerprint') IS NOT NEW.source_snapshot_fingerprint
    OR json_extract(NEW.receipt_json, '$.tenantId') IS NOT NEW.tenant_id
    OR json_extract(NEW.receipt_json, '$.workspaceId') IS NOT NEW.workspace_id
    OR json_extract(NEW.receipt_json, '$.ownerAuthIdentityId') IS NOT NEW.owner_auth_identity_id
    OR json_extract(NEW.receipt_json, '$.policyId') IS NOT NEW.policy_id
    OR CAST(json_extract(NEW.receipt_json, '$.policyVersion') AS INTEGER) IS NOT NEW.policy_version
    OR json_extract(NEW.receipt_json, '$.policyHash') IS NOT NEW.policy_hash
    OR CAST(json_extract(NEW.receipt_json, '$.userCount') AS INTEGER) IS NOT NEW.user_count
    OR json(NEW.table_counts_json) IS NOT json(json_extract(NEW.receipt_json, '$.tableCounts'))
    OR json(NEW.before_checksums_json) IS NOT json(json_extract(NEW.receipt_json, '$.beforeContentChecksums'))
    OR json(NEW.after_checksums_json) IS NOT json(json_extract(NEW.receipt_json, '$.afterContentChecksums'))
    OR CAST(json_extract(NEW.receipt_json, '$.relationshipOrphanCount') AS INTEGER) IS NOT NEW.relationship_orphan_count
    OR json_extract(NEW.receipt_json, '$.status') IS NOT NEW.status
    THEN RAISE(ABORT, 'compatibility backfill receipt JSON binding mismatch') END;
END;
`;

export const SQLITE_SCHEMA_V1_SQL = buildSqliteSchemaV1Sql();
assertSqliteSchemaV1DefinitionDigest(SQLITE_SCHEMA_V1_SQL);

export function assertSqliteSchemaV1DefinitionDigest(schemaSql: string): void {
  if (sha256(schemaSql) !== SQLITE_SCHEMA_V1_DEFINITION_DIGEST) {
    throw new Error("G006A generated schema-v1 definition digest drift");
  }
}

export function assertAcceptedSqliteSchemaV1Source(sourceSql: string): void {
  if (sha256(sourceSql) !== SQLITE_SCHEMA_V1_ACCEPTED_SOURCE_DIGEST) {
    throw new Error("G006A frozen SCHEMA_SQL digest drift");
  }
  const unscopedSettingsSeed = "INSERT OR IGNORE INTO settings (id) VALUES (1);";
  assertCardinality(sourceSql, unscopedSettingsSeed, 1, "unscoped settings seed");
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
    assertCardinality(sourceSql, marker, 1, `${table} table anchor`);
    const start = sourceSql.indexOf(marker);
    const end = sourceSql.indexOf("\n);", start);
    if (end < 0) throw new Error(`G006A source schema has an unterminated ${table} definition`);
    const definition = sourceSql.slice(start, end);
    for (const [anchor] of TABLE_PATCHES[table].replacements ?? []) {
      assertCardinality(definition, anchor, 1, `${table} replacement anchor ${anchor}`);
    }
  }
  for (const indexName of REPLACED_LEGACY_INDEXES) {
    const matches = sourceSql.match(new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${indexName}\\b`, "gu"));
    if (matches?.length !== 1) {
      throw new Error(`G006A source schema expected one ${indexName} index anchor; found ${matches?.length ?? 0}`);
    }
  }
}

function buildSqliteSchemaV1Sql(): string {
  assertAcceptedSqliteSchemaV1Source(SCHEMA_SQL);
  const unscopedSettingsSeed = "INSERT OR IGNORE INTO settings (id) VALUES (1);";
  assertCardinality(SCHEMA_SQL, unscopedSettingsSeed, 1, "unscoped settings seed");
  let result = SCHEMA_SQL.replace(unscopedSettingsSeed, "");
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    result = replaceTable(result, table, TABLE_PATCHES[table]);
  }
  for (const indexName of REPLACED_LEGACY_INDEXES) result = removeCreateIndex(result, indexName);
  const finalSql = `${result.trimEnd()}\n${SQLITE_SCHEMA_V1_RECEIPT_SQL.trim()}\n${SQLITE_SCHEMA_V1_INDEX_SQL.trim()}\n${SQLITE_SCHEMA_V1_DELETE_ACTION_SQL.trim()}\n`;
  assertFinalSchemaBuild(finalSql, unscopedSettingsSeed);
  return finalSql;
}

function replaceTable(sql: string, table: string, patch: TablePatch): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  assertCardinality(sql, marker, 1, `${table} table anchor`);
  const start = sql.indexOf(marker);
  const end = sql.indexOf("\n);", start);
  if (end < 0) throw new Error(`G006A source schema has an unterminated ${table} definition`);
  let definition = sql.slice(start, end);
  for (const [before, after] of patch.replacements ?? []) {
    assertCardinality(definition, before, 1, `${table} replacement anchor ${before}`);
    definition = definition.replace(before, after);
  }
  const replacement = `${definition},\n  ${patch.additions}\n)`;
  return `${sql.slice(0, start)}${replacement}${sql.slice(end + "\n)".length)}`;
}

function removeCreateIndex(sql: string, indexName: string): string {
  const pattern = new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${indexName}\\b`, "gu");
  const matches = [...sql.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`G006A source schema expected one ${indexName} index anchor; found ${matches.length}`);
  }
  const match = matches[0];
  if (match.index === undefined) throw new Error(`G006A source schema is missing index ${indexName}`);
  const end = sql.indexOf(";", match.index);
  if (end < 0) throw new Error(`G006A source schema has an unterminated index ${indexName}`);
  return `${sql.slice(0, match.index)}${sql.slice(end + 1).replace(/^\r?\n/u, "")}`;
}

function assertFinalSchemaBuild(sql: string, unscopedSettingsSeed: string): void {
  const tableCount = (sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+[a-z_][a-z0-9_]*\s*\(/gu) ?? []).length;
  if (tableCount !== SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT) {
    throw new Error(`G006A final schema expected ${SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT} tables; found ${tableCount}`);
  }
  assertCardinality(sql, unscopedSettingsSeed, 0, "unscoped settings seed");
  for (const indexName of REPLACED_LEGACY_INDEXES) {
    assertCardinality(sql, `INDEX IF NOT EXISTS ${indexName}`, 0, `${indexName} legacy index`);
  }
  for (const table of SQLITE_SCHEMA_V1_TRANSFORM_TABLES) {
    const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
    assertCardinality(sql, marker, 1, `${table} final table anchor`);
    const start = sql.indexOf(marker);
    const end = sql.indexOf("\n);", start);
    const definition = sql.slice(start, end);
    assertCardinality(definition, "tenant_id TEXT NOT NULL", 1, `${table}.tenant_id`);
  }
  const userMarketStart = sql.indexOf("CREATE TABLE IF NOT EXISTS user_market_access (");
  const userMarketEnd = sql.indexOf("\n);", userMarketStart);
  const userMarketDefinition = sql.slice(userMarketStart, userMarketEnd);
  if (userMarketDefinition.includes("PRIMARY KEY")) throw new Error("G006A final user_market_access retained a legacy primary key");
  if (sql.includes("place_id TEXT NOT NULL UNIQUE")) throw new Error("G006A final leads retained global place uniqueness");
}

function assertCardinality(value: string, needle: string, expected: number, label: string): void {
  const actual = value.split(needle).length - 1;
  if (actual !== expected) throw new Error(`G006A source schema expected ${expected} ${label}; found ${actual}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
