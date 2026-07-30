import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST,
  assertSqliteSchemaV1DatabaseHealth,
  assertSqliteSchemaV1Preservation,
  captureSqliteSchemaV1PreservationSnapshot,
  classifySqliteSchemaV1,
  coordinateSqliteSchemaV1WholeUpgrade,
  createFreshSqliteSchemaV1,
  createSqliteSchemaV1LaterFinalizerCapability,
  sqliteCatalogDigest,
} from "@/lib/db/sqlite-schema-coordinator";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_ACCEPTED_SOURCE_DIGEST,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_DEFINITION_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_SQL,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
  SQLITE_SCHEMA_V1_TRANSFORM_TABLES,
  assertAcceptedSqliteSchemaV1Source,
} from "@/lib/db/sqlite-schema-v1";
import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  type SqliteBackfillDb,
  prepareSqliteCompatibilityBackfill,
} from "@/lib/tenancy/compatibility-backfill";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const MARKET = "market-colorado";

describe("G-006A staged SQLite schema and coordinator", () => {
  it("builds one deterministic 37-table catalog from the exact frozen source", () => {
    expect(() => assertAcceptedSqliteSchemaV1Source(SCHEMA_SQL)).not.toThrow();
    expect(() => assertAcceptedSqliteSchemaV1Source(`${SCHEMA_SQL} `)).toThrow(/frozen SCHEMA_SQL digest drift/);
    expect(() => assertAcceptedSqliteSchemaV1Source(
      SCHEMA_SQL.replace("CREATE TABLE IF NOT EXISTS settings (", "CREATE TABLE IF NOT EXISTS settings_drift ("),
    )).toThrow(/frozen SCHEMA_SQL digest drift/);
    expect(SQLITE_SCHEMA_V1_ACCEPTED_SOURCE_DIGEST).toBe("b47346d186f2768f577b6e9b52f6112ee09c5d94b05aad3ef31303343c07a8f8");
    expect(SQLITE_SCHEMA_V1_DEFINITION_DIGEST).toBe("fd28b893542b08248df08f58706f2947d1c3bef5aeecf920ee19ea2eeeb280d2");
    expect(SQLITE_SCHEMA_V1_SQL).not.toContain("INSERT OR IGNORE INTO settings (id) VALUES (1)");
    expect(SQLITE_SCHEMA_V1_SQL).not.toContain("PRIMARY KEY (user_id, market_id)");
    expect(SQLITE_SCHEMA_V1_SQL).not.toContain("place_id TEXT NOT NULL UNIQUE");
    expect(SQLITE_SCHEMA_V1_SQL).not.toContain("INDEX IF NOT EXISTS idx_place_observations_place_time");
    expect(SQLITE_SCHEMA_V1_TRANSFORM_TABLES).toEqual([
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
    ]);
    expect(tableDefinitionSql(SQLITE_SCHEMA_V1_SQL, "audit_logs"))
      .toBe(tableDefinitionSql(SCHEMA_SQL, "audit_logs"));

    const first = createEmptyDatabase();
    const second = createEmptyDatabase();
    try {
      const firstState = createFreshSqliteSchemaV1(first);
      const secondState = createFreshSqliteSchemaV1(second);
      expect(firstState).toMatchObject({
        kind: "staged",
        userVersion: SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
        applicationTableCount: SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
        targetColumnCount: 32,
        expectedTargetColumnCount: 32,
        catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
      });
      expect(secondState.catalogDigest).toBe(firstState.catalogDigest);
      expect(sqliteCatalogDigest(first)).toBe("080477dd8fce09c3e8d8ca7461f2bc0a8b2222edab26afe7297367bdfe6362cf");
      expect(first.prepare("SELECT COUNT(*) AS count FROM settings").get()).toMatchObject({ count: 0 });
      expect(first.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get())
        .toMatchObject({ count: 37 });
    } finally {
      first.close();
      second.close();
    }
  });

  it("constructs exact tenant/source keys, compound foreign keys, and scoped indexes", () => {
    const db = createStagedDatabase();
    try {
      expect(tableColumns(db, "settings").find(({ name }) => name === "tenant_id")).toMatchObject({ notnull: 1 });
      expect(primaryKeyColumns(db, "user_market_access")).toEqual([]);
      expect(primaryKeyColumns(db, "place_cache")).toEqual(["tenant_id", "source_card_id", "place_id"]);
      expect(primaryKeyColumns(db, "places_master")).toEqual(["tenant_id", "source_card_id", "place_id"]);
      expect(primaryKeyColumns(db, "place_observations")).toEqual(["tenant_id", "source_card_id", "id"]);
      expect(primaryKeyColumns(db, "api_usage_events")).toEqual(["tenant_id", "source_card_id", "id"]);
      expect(uniqueKeyColumns(db, "leads")).toEqual(expect.arrayContaining([
        ["tenant_id", "id"],
        ["tenant_id", "place_id"],
      ]));
      expect(uniqueKeyColumns(db, "crawl_units")).toContainEqual(["tenant_id", "id"]);
      expect(uniqueKeyColumns(db, "ai_lead_verifications")).toContainEqual(["tenant_id", "id"]);
      expect(foreignKeyColumnSets(db, "lead_notes")).toEqual(expect.arrayContaining([
        ["tenant_id", "workspace_id"],
        ["tenant_id", "lead_id"],
      ]));
      for (const table of [
        "lead_notes",
        "outreach_events",
        "admin_requests",
        "demos",
        "ai_lead_verifications",
        "lead_ai_artifacts",
        "ai_feedback_events",
        "ai_usage_events",
      ]) {
        expect(foreignKeyColumnSets(db, table)).not.toContainEqual(["lead_id"]);
      }
      expect(foreignKeyColumnSets(db, "ai_feedback_events")).not.toContainEqual(["verification_id"]);
      expect(foreignKeyColumnSets(db, "ai_feedback_events")).not.toContainEqual(["artifact_id"]);
      expect(foreignKeyColumnSets(db, "ai_usage_events")).not.toContainEqual(["verification_id"]);
      expect(foreignKeyColumnSets(db, "place_observations")).toEqual(expect.arrayContaining([
        ["tenant_id", "source_card_id", "place_id"],
        ["tenant_id", "crawl_run_id"],
        ["tenant_id", "crawl_unit_id"],
        ["tenant_id", "lead_id"],
      ]));
      expect(indexNames(db, "place_observations")).toEqual(expect.arrayContaining([
        "idx_place_observations_tenant_source_place_time",
        "idx_place_observations_tenant_source_run_time",
        "idx_place_observations_tenant_source_unit_time",
        "idx_place_observations_tenant_source_lead_time",
      ]));
      expect(indexNames(db, "api_usage_events")).toContain("idx_api_usage_tenant_source_endpoint_created");
      expect(indexNames(db, "compatibility_backfill_receipts")).toContain("compatibility_backfill_receipts_key_unique");
      for (const table of ["place_cache", "places_master", "place_observations", "api_usage_events"]) {
        expect(tableColumns(db, table).find(({ name }) => name === "source_card_id"))
          .toMatchObject({ notnull: 1, dflt_value: null });
      }
      expect(() => db.prepare("INSERT INTO settings (id, tenant_id) VALUES (1, ?)").run(TENANT_A)).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });

  it("physically enforces both nullable-workspace user-market identities", () => {
    const db = createStagedDatabase();
    try {
      insertFoundation(db);
      const nullIndex = indexSql(db, "g006r_user_market_access_null_identity");
      const workspaceIndex = indexSql(db, "g006r_user_market_access_workspace_identity");
      expect(nullIndex).toMatch(/\(tenant_id, user_id, market_id\)\s+WHERE workspace_id IS NULL$/);
      expect(workspaceIndex).toMatch(/\(tenant_id, workspace_id, user_id, market_id\)\s+WHERE workspace_id IS NOT NULL$/);
      const insert = db.prepare(`
        INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id)
        VALUES (?, ?, ?, ?)
      `);
      insert.run(TENANT_A, null, "user-1", MARKET);
      expect(() => insert.run(TENANT_A, null, "user-1", MARKET)).toThrow(/UNIQUE/);
      insert.run(TENANT_B, null, "user-1", MARKET);
      insert.run(TENANT_A, WORKSPACE_A, "user-2", MARKET);
      expect(() => insert.run(TENANT_A, WORKSPACE_A, "user-2", MARKET)).toThrow(/UNIQUE/);
      expect(() => insert.run(TENANT_B, WORKSPACE_A, "user-3", MARKET)).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });

  it("rejects cross-tenant parents and invalid fixed source identity", () => {
    const db = createStagedDatabase();
    try {
      insertFoundation(db);
      db.prepare("INSERT INTO leads (id, tenant_id, place_id) VALUES (?, ?, ?)").run("lead-a", TENANT_A, "place-a");
      expect(() => db.prepare(`
        INSERT INTO lead_notes (id, lead_id, author_user_id, body, tenant_id, workspace_id)
        VALUES ('note-b', 'lead-a', 'user-b', 'cross tenant', ?, NULL)
      `).run(TENANT_B)).toThrow(/FOREIGN KEY/);
      expect(() => db.prepare(`
        INSERT INTO place_cache (tenant_id, source_card_id, place_id, raw_json)
        VALUES (?, 'invented_source', 'place-a', '{}')
      `).run(TENANT_A)).toThrow(/CHECK/);
      db.prepare(`
        INSERT INTO places_master (tenant_id, source_card_id, place_id)
        VALUES (?, 'google_places_legacy', 'place-a')
      `).run(TENANT_A);
      expect(() => db.prepare(`
        INSERT INTO place_observations
          (tenant_id, source_card_id, id, place_id, endpoint, sku, raw_json)
        VALUES (?, 'google_places_legacy', 'observation-b', 'place-a', 'places.details', 'details', '{}')
      `).run(TENANT_B)).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });

  it("classifies exact accepted legacy, unknown, partial, and catalog drift states", () => {
    const legacy = createAcceptedLegacyDatabase();
    const unknown = createEmptyDatabase();
    const partial = createEmptyDatabase();
    const drift = createAcceptedLegacyDatabase();
    const stagedDrift = createStagedDatabase();
    try {
      expect(classifySqliteSchemaV1(legacy)).toMatchObject({
        kind: "accepted-legacy",
        userVersion: 0,
        applicationTableCount: 37,
        catalogDigest: ACCEPTED_LEGACY_SQLITE_CATALOG_DIGEST,
      });
      unknown.exec("CREATE TABLE unrelated (id TEXT PRIMARY KEY)");
      expect(classifySqliteSchemaV1(unknown).kind).toBe("unknown");
      partial.exec(SCHEMA_SQL);
      partial.exec("ALTER TABLE settings ADD COLUMN tenant_id TEXT");
      expect(classifySqliteSchemaV1(partial)).toMatchObject({ kind: "partial" });
      drift.exec("CREATE INDEX g006a_drift_probe ON leads(id)");
      expect(classifySqliteSchemaV1(drift)).toMatchObject({ kind: "drift" });
      stagedDrift.exec("DROP INDEX idx_ai_usage_tenant_created");
      expect(classifySqliteSchemaV1(stagedDrift)).toMatchObject({ kind: "drift" });
      legacy.pragma("user_version = 99");
      expect(classifySqliteSchemaV1(legacy)).toMatchObject({ kind: "unknown", userVersion: 99 });
    } finally {
      legacy.close();
      unknown.close();
      partial.close();
      drift.close();
      stagedDrift.close();
    }
  });

  it("requires the typed later-finalizer capability before BEGIN IMMEDIATE or mutation", () => {
    const db = createAcceptedLegacyDatabase();
    const staged = createStagedDatabase();
    try {
      const beforeDigest = sqliteCatalogDigest(db);
      const beforeChanges = db.prepare("SELECT total_changes() AS count").get() as { count: number };
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(db)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_REQUIRED",
      }));
      expect(db.inTransaction).toBe(false);
      expect(sqliteCatalogDigest(db)).toBe(beforeDigest);
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(beforeChanges);
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        sourceState: "accepted-legacy",
        sourceCatalogDigest: beforeDigest,
        targetCatalogDigest: "0".repeat(64),
        execute: () => undefined,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));
      expect(db.inTransaction).toBe(false);

      const stagedBefore = classifySqliteSchemaV1(staged);
      const stagedCapability = createSqliteSchemaV1LaterFinalizerCapability({
        sourceState: "staged",
        sourceCatalogDigest: stagedBefore.catalogDigest,
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        execute: (lockedDb, context) => lockedDb.pragma(`user_version = ${context.targetUserVersion}`),
      });
      expect(coordinateSqliteSchemaV1WholeUpgrade(staged, stagedCapability)).toMatchObject({
        status: "finalized",
        state: { kind: "final", userVersion: SQLITE_SCHEMA_V1_FINAL_USER_VERSION },
      });
    } finally {
      db.close();
      staged.close();
    }
  });

  it("rolls back interrupted finalizers and restarts from the exact legacy state", () => {
    const db = createAcceptedLegacyDatabase();
    try {
      const before = classifySqliteSchemaV1(db);
      const capability = createSqliteSchemaV1LaterFinalizerCapability({
        sourceState: "accepted-legacy",
        sourceCatalogDigest: before.catalogDigest,
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        execute: (lockedDb) => {
          lockedDb.prepare("INSERT INTO location_markets (id, name, country_code) VALUES ('interrupted', 'Interrupted', 'US')").run();
          lockedDb.exec("CREATE INDEX g006a_interrupted_probe ON leads(id)");
          lockedDb.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
          throw new Error("simulated interruption");
        },
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(db, capability)).toThrow(/simulated interruption/);
      expect(db.inTransaction).toBe(false);
      expect(db.prepare("SELECT id FROM location_markets WHERE id = 'interrupted'").get()).toBeUndefined();
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'g006a_interrupted_probe'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(db)).toEqual(before);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(db, capability)).toThrow(/simulated interruption/);
      expect(classifySqliteSchemaV1(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  it("replays an exact final state without invoking a finalizer", () => {
    const db = createStagedDatabase();
    try {
      db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      const before = classifySqliteSchemaV1(db);
      expect(before.kind).toBe("final");
      const result = coordinateSqliteSchemaV1WholeUpgrade(db);
      expect(result).toEqual({ status: "replayed", state: before });
      expect(db.inTransaction).toBe(false);
      expect(classifySqliteSchemaV1(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  it("detects row-count, payload, foreign-key, and integrity guard failures", () => {
    const payloadDb = createAcceptedLegacyDatabase();
    const countDb = createAcceptedLegacyDatabase();
    const scopeDb = createAcceptedLegacyDatabase();
    const foreignKeyDb = createStagedDatabase();
    try {
      const payloadBefore = captureSqliteSchemaV1PreservationSnapshot(payloadDb);
      payloadDb.prepare("UPDATE settings SET max_calls_per_day = max_calls_per_day + 1 WHERE id = 1").run();
      expect(() => assertSqliteSchemaV1Preservation(
        payloadBefore,
        captureSqliteSchemaV1PreservationSnapshot(payloadDb),
      )).toThrowError(expect.objectContaining({ code: "G006A_PAYLOAD_DRIFT" }));

      const countBefore = captureSqliteSchemaV1PreservationSnapshot(countDb);
      countDb.prepare("DELETE FROM settings WHERE id = 1").run();
      expect(() => assertSqliteSchemaV1Preservation(
        countBefore,
        captureSqliteSchemaV1PreservationSnapshot(countDb),
      )).toThrowError(expect.objectContaining({ code: "G006A_ROW_COUNT_DRIFT" }));

      const scopeBefore = captureSqliteSchemaV1PreservationSnapshot(scopeDb);
      scopeDb.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, 'scope-drift', 'Scope Drift', 'active')")
        .run(TENANT_B);
      scopeDb.prepare("UPDATE settings SET tenant_id = ? WHERE id = 1").run(TENANT_B);
      expect(() => assertSqliteSchemaV1Preservation(
        scopeBefore,
        captureSqliteSchemaV1PreservationSnapshot(scopeDb, scopeBefore),
      )).toThrowError(expect.objectContaining({ code: "G006A_PAYLOAD_DRIFT" }));

      foreignKeyDb.pragma("foreign_keys = OFF");
      foreignKeyDb.prepare(`
        INSERT INTO lead_notes (id, lead_id, author_user_id, body, tenant_id, workspace_id)
        VALUES ('orphan', 'missing', 'actor', 'orphan', ?, NULL)
      `).run(TENANT_A);
      foreignKeyDb.pragma("foreign_keys = ON");
      foreignKeyDb.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      expect(() => assertSqliteSchemaV1DatabaseHealth(foreignKeyDb)).toThrowError(expect.objectContaining({
        code: "G006A_FOREIGN_KEY_CHECK_FAILED",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(foreignKeyDb)).toThrowError(expect.objectContaining({
        code: "G006A_FOREIGN_KEY_CHECK_FAILED",
      }));
    } finally {
      payloadDb.close();
      countDb.close();
      scopeDb.close();
      foreignKeyDb.close();
    }
  });
});

function createEmptyDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

function createStagedDatabase(): Database.Database {
  const db = createEmptyDatabase();
  createFreshSqliteSchemaV1(db);
  return db;
}

function createAcceptedLegacyDatabase(): Database.Database {
  const db = createEmptyDatabase();
  db.exec(SCHEMA_SQL);
  prepareSqliteCompatibilityBackfill(sqliteBackfillAdapter(db));
  return db;
}

function sqliteBackfillAdapter(db: Database.Database): SqliteBackfillDb {
  const adapter: SqliteBackfillDb = {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => (
      db.prepare(sql).all(...params) as T[]
    ),
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => (
      db.prepare(sql).get(...params) as T | undefined
    ),
    run: (sql: string, params: readonly unknown[] = []) => db.prepare(sql).run(...params),
    transaction: <T>(work: (transactionDb: SqliteBackfillDb) => T, mode: "deferred" | "immediate" = "deferred") => {
      const transaction = db.transaction(() => work(adapter));
      return mode === "immediate" ? transaction.immediate() : transaction();
    },
  };
  return adapter;
}

function insertFoundation(db: Database.Database): void {
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')")
    .run(TENANT_A, "tenant-a", "Tenant A");
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')")
    .run(TENANT_B, "tenant-b", "Tenant B");
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status) VALUES (?, ?, ?, ?, 'active')")
    .run(WORKSPACE_A, TENANT_A, "workspace-a", "Workspace A");
  db.prepare("INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, 'US')")
    .run(MARKET, "Colorado");
}

function tableColumns(
  db: Database.Database,
  table: string,
): Array<{ name: string; notnull: number; pk: number; dflt_value: string | null }> {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
    name: string;
    notnull: number;
    pk: number;
    dflt_value: string | null;
  }>;
}

function primaryKeyColumns(db: Database.Database, table: string): string[] {
  return tableColumns(db, table)
    .filter(({ pk }) => pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map(({ name }) => name);
}

function uniqueKeyColumns(db: Database.Database, table: string): string[][] {
  const indexes = db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string; unique: number }>;
  return indexes.filter((index) => index.unique === 1).map((index) => (
    (db.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno").all(index.name) as Array<{ name: string }>).map(({ name }) => name)
  ));
}

function foreignKeyColumnSets(db: Database.Database, table: string): string[][] {
  const rows = db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as Array<{ id: number; seq: number; from: string }>;
  const grouped = new Map<number, Array<{ seq: number; from: string }>>();
  for (const row of rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
  return [...grouped.values()].map((group) => group.sort((left, right) => left.seq - right.seq).map(({ from }) => from));
}

function indexNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{ name: string }>).map(({ name }) => name);
}

function indexSql(db: Database.Database, name: string): string {
  return (db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(name) as { sql: string }).sql;
}

function tableDefinitionSql(sql: string, table: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = sql.indexOf(marker);
  const end = sql.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error(`missing ${table} definition`);
  return sql.slice(start, end + "\n);".length);
}
