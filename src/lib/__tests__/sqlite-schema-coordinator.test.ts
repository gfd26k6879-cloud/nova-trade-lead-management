import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  createSqliteSchemaV1FreshVerifierTestBoundary,
  createSqliteSchemaV1LaterFinalizerCapability,
  sqliteCatalogDigest,
  SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST,
  sqliteSchemaV1PhysicalManifestDigest,
  type SqliteSchemaV1FinalizerHandoff,
  type SqliteSchemaV1FinalizerSession,
  type SqliteSchemaV1LaterFinalizerContext,
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
  assertSqliteSchemaV1DefinitionDigest,
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
    expect(() => assertSqliteSchemaV1DefinitionDigest(SQLITE_SCHEMA_V1_SQL)).not.toThrow();
    expect(() => assertSqliteSchemaV1DefinitionDigest(`${SQLITE_SCHEMA_V1_SQL} `))
      .toThrow(/generated schema-v1 definition digest drift/);
    expect(SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST)
      .toBe("07e10bb5c43d98d6f561d3c0b0f9f39a9ad2d579ed1a73b9e2a7a455367fdf79");
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
      expect(sqliteSchemaV1PhysicalManifestDigest(first)).toBe(SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST);
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

  it("requires an exact file-bound handoff before transaction or mutation", () => {
    const legacy = createAcceptedLegacyDatabase();
    const stagedMemory = createStagedDatabase();
    try {
      const beforeDigest = sqliteCatalogDigest(legacy);
      const beforeChanges = legacy.prepare("SELECT total_changes() AS count").get() as { count: number };
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(legacy)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_REQUIRED",
      }));
      expect(legacy.inTransaction).toBe(false);
      expect(sqliteCatalogDigest(legacy)).toBe(beforeDigest);
      expect(legacy.prepare("SELECT total_changes() AS count").get()).toEqual(beforeChanges);
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        db: legacy,
        handoffBindingId: "g006b:legacy:receipt-1",
        sourceState: "accepted-legacy",
        sourceCatalogDigest: beforeDigest,
        targetCatalogDigest: "0".repeat(64),
        execute: () => undefined,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        db: legacy,
        handoffBindingId: " ",
        sourceState: "accepted-legacy",
        sourceCatalogDigest: beforeDigest,
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        execute: () => undefined,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));

      const memoryHandoff = createFinalizerHandoff(stagedMemory, "g006b:memory:denied", () => undefined);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(stagedMemory, memoryHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_FILE_BACKED_FINALIZATION_REQUIRED",
      }));
      expect(classifySqliteSchemaV1(stagedMemory).kind).toBe("staged");
    } finally {
      legacy.close();
      stagedMemory.close();
    }
  });

  it("uses identity-bound one-shot capability state and rejects copies, replacement, and cross-database use", () => {
    const first = createTemporaryStagedDatabase();
    const second = createTemporaryStagedDatabase();
    const bindingId = "g006b:staged:identity-1";
    let originalCalls = 0;
    let replacementCalls = 0;
    try {
      const state = classifySqliteSchemaV1(first.db);
      const input = {
        db: first.db,
        handoffBindingId: bindingId,
        sourceState: "staged" as const,
        sourceCatalogDigest: state.catalogDigest,
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        execute: () => { originalCalls += 1; },
      };
      const capability = createSqliteSchemaV1LaterFinalizerCapability(input);
      input.execute = () => { replacementCalls += 1; };
      expect(Object.keys(capability)).toEqual([]);
      expect(() => Object.assign(capability as object, { execute: input.execute })).toThrow();
      first.db.exec("BEGIN");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.db, {
        capability,
        handoffBindingId: bindingId,
      })).toThrowError(expect.objectContaining({ code: "G006A_STATE_REJECTED" }));
      first.db.exec("ROLLBACK");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.db, {
        capability,
        handoffBindingId: `${bindingId}:wrong`,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));

      const spread = { ...capability } as unknown as typeof capability;
      const prototype = Object.create(capability) as typeof capability;
      for (const forged of [spread, prototype]) {
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.db, {
          capability: forged,
          handoffBindingId: bindingId,
        })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_REQUIRED" }));
      }
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(second.db, {
        capability,
        handoffBindingId: bindingId,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));
      expect(classifySqliteSchemaV1(second.db).kind).toBe("staged");

      const handoff = { capability, handoffBindingId: bindingId };
      expect(coordinateSqliteSchemaV1WholeUpgrade(first.db, handoff)).toMatchObject({
        status: "finalized",
        state: { kind: "final", userVersion: SQLITE_SCHEMA_V1_FINAL_USER_VERSION },
      });
      expect(originalCalls).toBe(1);
      expect(replacementCalls).toBe(0);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.db, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it("rejects transaction control, multi-statement, PRAGMA, writable-schema, and catalog-write routes", () => {
    const attempts: ReadonlyArray<readonly [string, (session: SqliteSchemaV1FinalizerSession) => void]> = [
      ["begin", (session) => { session.update("BEGIN IMMEDIATE"); }],
      ["commit", (session) => { session.update("COMMIT"); }],
      ["end", (session) => { session.delete("/* leading comment */ END"); }],
      ["rollback", (session) => { session.update("ROLLBACK"); }],
      ["savepoint", (session) => { session.update("SAVEPOINT caller_owned"); }],
      ["release", (session) => { session.update("RELEASE caller_owned"); }],
      ["multi", (session) => {
        session.insert("INSERT INTO location_markets (id, name, country_code) VALUES ('multi', 'Multi', 'US'); DELETE FROM location_markets");
      }],
      ["pragma", (session) => { session.update("/* leading */ PRAGMA user_version = 6002"); }],
      ["attach", (session) => { session.update("ATTACH DATABASE 'other.db' AS other"); }],
      ["detach", (session) => { session.update("DETACH DATABASE other"); }],
      ["vacuum", (session) => { session.update("VACUUM"); }],
      ["writable", (session) => { session.createTable('CREATE TABLE "writable_schema" (id TEXT)'); }],
      ["catalog", (session) => { session.update('UPDATE "sqlite_schema" SET sql = sql'); }],
      ["master", (session) => { session.update('UPDATE "sqlite_master" SET sql = sql'); }],
    ];

    for (const [name, attempt] of attempts) {
      const fixture = createTemporaryStagedDatabase();
      try {
        const handoff = createFinalizerHandoff(fixture.db, `g006b:forbidden:${name}`, (session) => {
          session.insert(
            "INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, 'US')",
            [`before-${name}`, `Before ${name}`],
          );
          attempt(session);
        });
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff)).toThrowError(expect.objectContaining({
          code: "G006A_FINALIZER_SQL_REJECTED",
        }));
        expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = ?").get(`before-${name}`)).toBeUndefined();
        expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
        expect(Number(fixture.db.pragma("writable_schema", { simple: true }))).toBe(0);
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff)).toThrowError(expect.objectContaining({
          code: "G006A_FINALIZER_CONSUMED",
        }));
      } finally {
        fixture.cleanup();
      }
    }
  });

  it("rolls back normal callback failure, consumes the handoff, and deactivates escaped sessions", () => {
    const fixture = createTemporaryStagedDatabase();
    let escapedSession: SqliteSchemaV1FinalizerSession | undefined;
    try {
      const before = classifySqliteSchemaV1(fixture.db);
      const handoff = createFinalizerHandoff(fixture.db, "g006b:failure:one-shot", (session) => {
        escapedSession = session;
        session.insert("INSERT INTO location_markets (id, name, country_code) VALUES ('interrupted', 'Interrupted', 'US')");
        throw new Error("simulated interruption");
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff)).toThrow(/simulated interruption/);
      expect(fixture.db.inTransaction).toBe(false);
      expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = 'interrupted'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(fixture.db)).toEqual(before);
      expect(() => escapedSession?.insert(
        "INSERT INTO location_markets (id, name, country_code) VALUES ('escaped', 'Escaped', 'US')",
      )).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_SQL_REJECTED" }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back interrupted accepted-legacy finalizers and permits a fresh bound restart", () => {
    const fixture = createTemporaryAcceptedLegacyDatabase();
    try {
      const before = classifySqliteSchemaV1(fixture.db);
      const first = createFinalizerHandoff(fixture.db, "g006b:legacy:interruption-1", (session) => {
        session.insert("INSERT INTO location_markets (id, name, country_code) VALUES ('legacy-interrupted', 'Interrupted', 'US')");
        throw new Error("legacy interruption one");
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, first)).toThrow(/legacy interruption one/);
      expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = 'legacy-interrupted'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(fixture.db)).toEqual(before);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, first)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const retry = createFinalizerHandoff(fixture.db, "g006b:legacy:interruption-2", (session) => {
        session.insert("INSERT INTO location_markets (id, name, country_code) VALUES ('legacy-retry', 'Retry', 'US')");
        throw new Error("legacy interruption two");
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, retry)).toThrow(/legacy interruption two/);
      expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = 'legacy-retry'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(fixture.db)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  it("preserves source columns and payloads across all 37 application tables", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      fixture.db.prepare("INSERT INTO zip_codes (zip, city, state, county) VALUES ('80000', 'Original', 'CO', 'Test')").run();
      const snapshot = captureSqliteSchemaV1PreservationSnapshot(fixture.db);
      expect(snapshot.tableNames).toHaveLength(37);
      expect(snapshot.tableNames).toContain("zip_codes");
      expect(snapshot.tableNames).toContain("audit_logs");
      expect(snapshot.tableNames).toContain("compatibility_backfill_receipts");

      const deleteHandoff = createFinalizerHandoff(fixture.db, "g006b:preserve:zip-delete", (session) => {
        session.delete("DELETE FROM zip_codes WHERE zip = ?", ["80000"]);
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, deleteHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_ROW_COUNT_DRIFT",
      }));
      expect(fixture.db.prepare("SELECT city FROM zip_codes WHERE zip = '80000'").get()).toMatchObject({ city: "Original" });

      const updateHandoff = createFinalizerHandoff(fixture.db, "g006b:preserve:zip-update", (session) => {
        session.update("UPDATE zip_codes SET city = 'Changed' WHERE zip = ?", ["80000"]);
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, updateHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_PAYLOAD_DRIFT",
      }));
      expect(fixture.db.prepare("SELECT city FROM zip_codes WHERE zip = '80000'").get()).toMatchObject({ city: "Original" });

      const altered = captureSqliteSchemaV1PreservationSnapshot(fixture.db);
      fixture.db.prepare("UPDATE zip_codes SET city = 'Out of band' WHERE zip = '80000'").run();
      expect(() => assertSqliteSchemaV1Preservation(
        altered,
        captureSqliteSchemaV1PreservationSnapshot(fixture.db, altered),
      )).toThrowError(expect.objectContaining({ code: "G006A_PAYLOAD_DRIFT" }));
    } finally {
      fixture.cleanup();
    }
  });

  it("returns finalized only after exact fresh read-only reopen and closes the verifier", () => {
    const fixture = createTemporaryStagedDatabase();
    let verifierOpenCount = 0;
    let verifierCloseCount = 0;
    try {
      const boundary = createSqliteSchemaV1FreshVerifierTestBoundary((databasePath) => {
        verifierOpenCount += 1;
        const verifier = new Database(databasePath, { readonly: true, fileMustExist: true });
        const close = verifier.close.bind(verifier);
        verifier.close = () => {
          verifierCloseCount += 1;
          close();
          return verifier;
        };
        return verifier;
      });
      let callbackSawRawHandle = true;
      let callbackBindingId: string | undefined;
      let escapedSession: SqliteSchemaV1FinalizerSession | undefined;
      const handoff = createFinalizerHandoff(fixture.db, "g006b:success:reopen", (session, context) => {
        escapedSession = session;
        callbackBindingId = context.handoffBindingId;
        callbackSawRawHandle = ["prepare", "exec", "pragma", "transaction"].some((key) => key in session);
        session.createTrigger(`
          CREATE TRIGGER g006a_structural_token_probe
          AFTER INSERT ON location_markets BEGIN
            SELECT CASE WHEN NEW.name = 'PRAGMA writable_schema COMMIT END' THEN RAISE(IGNORE) END;
          END
        `);
        session.dropTrigger("g006a_structural_token_probe");
      });
      const result = coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff, {
        freshVerifierTestBoundary: boundary,
      });
      expect(result).toMatchObject({
        status: "finalized",
        state: {
          kind: "final",
          catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
          applicationTableCount: 37,
          targetColumnCount: 32,
        },
      });
      expect(callbackSawRawHandle).toBe(false);
      expect(callbackBindingId).toBe("g006b:success:reopen");
      expect(verifierOpenCount).toBe(1);
      expect(verifierCloseCount).toBe(1);
      expect(() => escapedSession?.delete("DELETE FROM location_markets")).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_SQL_REJECTED",
      }));

      fixture.db.close();
      const reopened = new Database(fixture.path, { readonly: true, fileMustExist: true });
      try {
        expect(classifySqliteSchemaV1(reopened)).toMatchObject({ kind: "final" });
        expect(sqliteSchemaV1PhysicalManifestDigest(reopened)).toBe(SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST);
        expect(reopened.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      } finally {
        reopened.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("reports committed-but-unverified recovery required when fresh reopen fails", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const handoff = createFinalizerHandoff(fixture.db, "g006b:reopen:failure", () => undefined);
      const boundary = createSqliteSchemaV1FreshVerifierTestBoundary(() => {
        throw new Error("simulated verifier open failure");
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff, {
        freshVerifierTestBoundary: boundary,
      })).toThrowError(expect.objectContaining({
        code: "G006A_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
        committed: true,
        status: "committed-unverified-recovery-required",
      }));
      expect(fixture.db.inTransaction).toBe(false);
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("final");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.db, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
      fixture.db.close();
      const reopened = new Database(fixture.path, { readonly: true, fileMustExist: true });
      try {
        expect(classifySqliteSchemaV1(reopened).kind).toBe("final");
      } finally {
        reopened.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects a persisted wrong physical partial-index spoof after close and reopen", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      insertFoundation(fixture.db);
      const insertAccess = fixture.db.prepare(`
        INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id)
        VALUES (?, ?, ?, ?)
      `);
      insertAccess.run(TENANT_A, null, "null-workspace-user", MARKET);
      insertAccess.run(TENANT_A, WORKSPACE_A, "workspace-user", MARKET);
      fixture.db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      const expectedSql = indexSql(fixture.db, "g006r_user_market_access_null_identity");
      fixture.db.exec(`
        DROP INDEX g006r_user_market_access_null_identity;
        CREATE UNIQUE INDEX g006r_user_market_access_null_identity
          ON user_market_access(tenant_id, user_id, market_id)
          WHERE workspace_id IS NOT NULL;
      `);
      fixture.db.unsafeMode(true);
      fixture.db.pragma("writable_schema = ON");
      fixture.db.prepare("UPDATE sqlite_schema SET sql = ? WHERE type = 'index' AND name = 'g006r_user_market_access_null_identity'")
        .run(expectedSql);
      fixture.db.pragma("writable_schema = OFF");
      fixture.db.unsafeMode(false);
      fixture.db.close();

      const spoofed = new Database(fixture.path);
      fixture.db = spoofed;
      expect(sqliteCatalogDigest(spoofed)).toBe(SQLITE_SCHEMA_V1_CATALOG_DIGEST);
      expect(classifySqliteSchemaV1(spoofed).kind).toBe("final");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(spoofed)).toThrowError(expect.objectContaining({
        code: "G006A_INTEGRITY_CHECK_FAILED",
      }));
    } finally {
      fixture.cleanup();
    }
  });

  it("replays exact final state and detects row-count, payload, and foreign-key failures", () => {
    const payloadDb = createAcceptedLegacyDatabase();
    const countDb = createAcceptedLegacyDatabase();
    const scopeDb = createAcceptedLegacyDatabase();
    const foreignKeyDb = createStagedDatabase();
    try {
      const payloadBefore = captureSqliteSchemaV1PreservationSnapshot(payloadDb);
      expect(payloadBefore.tableNames).toHaveLength(37);
      payloadDb.prepare("UPDATE settings SET max_calls_per_day = max_calls_per_day + 1 WHERE id = 1").run();
      expect(() => assertSqliteSchemaV1Preservation(
        payloadBefore,
        captureSqliteSchemaV1PreservationSnapshot(payloadDb, payloadBefore),
      )).toThrowError(expect.objectContaining({ code: "G006A_PAYLOAD_DRIFT" }));

      const countBefore = captureSqliteSchemaV1PreservationSnapshot(countDb);
      countDb.prepare("DELETE FROM settings WHERE id = 1").run();
      expect(() => assertSqliteSchemaV1Preservation(
        countBefore,
        captureSqliteSchemaV1PreservationSnapshot(countDb, countBefore),
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

      const replay = createStagedDatabase();
      try {
        replay.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
        expect(coordinateSqliteSchemaV1WholeUpgrade(replay)).toMatchObject({ status: "replayed", state: { kind: "final" } });
      } finally {
        replay.close();
      }
    } finally {
      payloadDb.close();
      countDb.close();
      scopeDb.close();
      foreignKeyDb.close();
    }
  });
});

interface TemporaryDatabaseFixture {
  readonly directory: string;
  readonly path: string;
  db: Database.Database;
  cleanup: () => void;
}

function createTemporaryStagedDatabase(): TemporaryDatabaseFixture {
  const directory = mkdtempSync(join(tmpdir(), "novatrade-g006a-"));
  const path = join(directory, "schema.db");
  const fixture: TemporaryDatabaseFixture = {
    directory,
    path,
    db: new Database(path),
    cleanup: () => undefined,
  };
  fixture.db.pragma("foreign_keys = ON");
  createFreshSqliteSchemaV1(fixture.db);
  fixture.cleanup = () => {
    if (fixture.db.open) fixture.db.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return fixture;
}

function createTemporaryAcceptedLegacyDatabase(): TemporaryDatabaseFixture {
  const directory = mkdtempSync(join(tmpdir(), "novatrade-g006a-legacy-"));
  const path = join(directory, "schema.db");
  const fixture: TemporaryDatabaseFixture = {
    directory,
    path,
    db: new Database(path),
    cleanup: () => undefined,
  };
  fixture.db.pragma("foreign_keys = ON");
  fixture.db.exec(SCHEMA_SQL);
  prepareSqliteCompatibilityBackfill(sqliteBackfillAdapter(fixture.db));
  fixture.cleanup = () => {
    if (fixture.db.open) fixture.db.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return fixture;
}

function createFinalizerHandoff(
  db: Database.Database,
  handoffBindingId: string,
  execute: (session: SqliteSchemaV1FinalizerSession, context: SqliteSchemaV1LaterFinalizerContext) => void,
): SqliteSchemaV1FinalizerHandoff {
  const state = classifySqliteSchemaV1(db);
  if (state.kind !== "staged" && state.kind !== "accepted-legacy") {
    throw new Error(`cannot create finalizer handoff from ${state.kind}`);
  }
  return Object.freeze({
    capability: createSqliteSchemaV1LaterFinalizerCapability({
      db,
      handoffBindingId,
      sourceState: state.kind,
      sourceCatalogDigest: state.catalogDigest,
      targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
      execute,
    }),
    handoffBindingId,
  });
}

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
