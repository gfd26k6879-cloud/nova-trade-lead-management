import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  __testOnlySqliteSchemaV1PhysicalFileIdentityMatches,
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
  type SqliteSchemaV1FinalizerPlan,
  type SqliteSchemaV1FinalizerHandoff,
} from "@/lib/db/sqlite-schema-coordinator";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_ACCEPTED_SOURCE_DIGEST,
  SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_DEFINITION_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_PRIMARY_SCHEMA,
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
    expect(SQLITE_SCHEMA_V1_PRIMARY_SCHEMA).toBe("main");
    expect(SQLITE_SCHEMA_V1_AUTOINCREMENT_TABLES).toEqual(["tenant_deletion_checkpoint_events"]);
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

  it("requires an exact canonical file path and declarative handoff", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_REQUIRED",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(":memory:")).toThrowError(expect.objectContaining({
        code: "G006A_FILE_BACKED_FINALIZATION_REQUIRED",
      }));
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        databasePath: "",
        handoffBindingId: "g006b:path:empty",
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: [],
      })).toThrowError(expect.objectContaining({ code: "G006A_FILE_BACKED_FINALIZATION_REQUIRED" }));
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        databasePath: join(fixture.directory, "missing.db"),
        handoffBindingId: "g006b:path:missing",
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: [],
      })).toThrowError(expect.objectContaining({ code: "G006A_DATABASE_PATH_REJECTED" }));
      expect(() => createFinalizerHandoff(fixture.path, " ", [])).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_MISMATCH",
      }));
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        databasePath: fixture.path,
        handoffBindingId: "g006b:target:wrong",
        targetCatalogDigest: "0".repeat(64) as typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: [],
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(
        fixture.db as unknown as string,
      )).toThrowError(expect.objectContaining({ code: "G006A_DATABASE_PATH_REJECTED" }));
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects callbacks, accessors, proxies, functions, async values, thenables, symbols, and non-plain plan data", () => {
    const fixture = createTemporaryStagedDatabase();
    let getterCalls = 0;
    let proxyCalls = 0;
    let callbackCalls = 0;
    try {
      const withExecute = {
        databasePath: fixture.path,
        handoffBindingId: "g006b:hostile:callback",
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: [],
        execute: () => { callbackCalls += 1; fixture.db.exec("DELETE FROM zip_codes"); },
      } as unknown as Parameters<typeof createSqliteSchemaV1LaterFinalizerCapability>[0];
      expect(() => createSqliteSchemaV1LaterFinalizerCapability(withExecute)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_MISMATCH",
      }));
      expect(callbackCalls).toBe(0);

      const accessorOperation = Object.defineProperty({}, "kind", {
        enumerable: true,
        get: () => { getterCalls += 1; return "delete"; },
      });
      const proxyPlan = new Proxy([], {
        ownKeys: (target) => { proxyCalls += 1; return Reflect.ownKeys(target); },
      });
      const symbolOperation = { kind: "delete", sql: "DELETE FROM location_markets", [Symbol("hidden")]: true };
      const thenableOperation = {
        kind: "delete",
        sql: "DELETE FROM location_markets",
        then: () => { callbackCalls += 1; },
      };
      const sparsePlan = new Array<unknown>(1);
      const customPlan: unknown[] & { extra?: boolean } = [];
      customPlan.extra = true;
      const accessorPlan: unknown[] = [];
      Object.defineProperty(accessorPlan, "0", {
        configurable: true,
        enumerable: true,
        get: () => { getterCalls += 1; return { kind: "delete", sql: "DELETE FROM location_markets" }; },
      });
      Object.defineProperty(accessorPlan, "length", { value: 1, writable: true });
      const hostilePlans: unknown[] = [
        [accessorOperation],
        accessorPlan,
        proxyPlan,
        sparsePlan,
        customPlan,
        [() => undefined],
        Promise.resolve([]),
        [thenableOperation],
        [symbolOperation],
        [new Error("not declarative")],
        [new Date()],
        [{ kind: "insert", sql: "INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, ?)", binds: [{}] }],
      ];
      for (const [index, plan] of hostilePlans.entries()) {
        expect(() => createSqliteSchemaV1LaterFinalizerCapability({
          databasePath: fixture.path,
          handoffBindingId: `g006b:hostile:${index}`,
          targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
          plan: plan as SqliteSchemaV1FinalizerPlan,
        })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      }
      expect(getterCalls).toBe(0);
      expect(proxyCalls).toBe(0);
      expect(callbackCalls).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("copies caller plans and byte binds before mint returns", () => {
    const fixture = createTemporaryStagedDatabase();
    const byteId = Buffer.from("copied-byte-id");
    const plan: Array<Record<string, unknown>> = [
      {
        kind: "insert",
        sql: "INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, ?)",
        binds: [byteId, "Copied", "US"],
      },
      {
        kind: "delete",
        sql: "DELETE FROM location_markets WHERE id = ?",
        binds: [byteId],
      },
    ];
    try {
      const handoff = createFinalizerHandoff(
        fixture.path,
        "g006b:copy:plan",
        plan as unknown as SqliteSchemaV1FinalizerPlan,
      );
      byteId.fill(0);
      plan[0]!.sql = "PRAGMA writable_schema = ON";
      plan.splice(1, 1);
      expect(coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toMatchObject({
        status: "finalized",
        state: { kind: "final" },
      });
      expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM location_markets").get()).toMatchObject({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects declared plan and bind lengths before proportional inspection or allocation", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const hugePlan = new Array<unknown>(0xffff_ffff);
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        databasePath: fixture.path,
        handoffBindingId: "g006b:bounded:plan",
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: hugePlan as SqliteSchemaV1FinalizerPlan,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));

      const hugeBinds = new Array<never>(32767);
      expect(() => createSqliteSchemaV1LaterFinalizerCapability({
        databasePath: fixture.path,
        handoffBindingId: "g006b:bounded:binds",
        targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
        plan: [{
          kind: "insert",
          sql: "INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, ?)",
          binds: hugeBinds,
        }],
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps opaque capability identity one-shot across copies, wrong bindings, cross-path attempts, failures, and success", () => {
    const first = createTemporaryStagedDatabase();
    const second = createTemporaryStagedDatabase();
    try {
      const original = createFinalizerHandoff(first.path, "g006b:identity:original", []);
      for (const forged of [
        { ...original.capability },
        Object.create(original.capability),
      ]) {
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, {
          capability: forged as typeof original.capability,
          handoffBindingId: original.handoffBindingId,
        })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_REQUIRED" }));
      }

      const wrongBinding = createFinalizerHandoff(first.path, "g006b:identity:binding", []);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, {
        capability: wrongBinding.capability,
        handoffBindingId: `${wrongBinding.handoffBindingId}:wrong`,
      })).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_MISMATCH" }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, wrongBinding)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const crossPath = createFinalizerHandoff(first.path, "g006b:identity:cross-path", []);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(second.path, crossPath)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_MISMATCH",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, crossPath)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const aliasPath = `${first.directory}\\.\\schema.db`;
      const pathAlias = createFinalizerHandoff(first.path, "g006b:identity:path-alias", []);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(aliasPath, pathAlias)).toThrowError(expect.objectContaining({
        code: "G006A_DATABASE_PATH_REJECTED",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, pathAlias)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const failure = createFinalizerHandoff(first.path, "g006b:identity:failure", duplicateMarketPlan("failure"));
      const before = classifySqliteSchemaV1(first.db);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, failure)).toThrow();
      expect(classifySqliteSchemaV1(first.db)).toEqual(before);
      expect(first.db.prepare("SELECT id FROM location_markets WHERE id = 'failure'").get()).toBeUndefined();
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, failure)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      expect(coordinateSqliteSchemaV1WholeUpgrade(first.path, original)).toMatchObject({ status: "finalized" });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(first.path, original)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
      expect(classifySqliteSchemaV1(second.db).kind).toBe("staged");
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it("binds capabilities to bigint physical file identity and rejects same-path exact or poisoned clones before plan execution", () => {
    const exact = createTemporaryStagedDatabase();
    const poisoned = createTemporaryStagedDatabase();
    try {
      const exactIdentity = statSync(exact.path, { bigint: true });
      expect(typeof exactIdentity.ino).toBe("bigint");
      const unsafeInode = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
      const collidingInode = unsafeInode + BigInt(1);
      expect(Number(unsafeInode)).toBe(Number(collidingInode));
      expect(__testOnlySqliteSchemaV1PhysicalFileIdentityMatches(
        { device: exactIdentity.dev, inode: unsafeInode },
        { device: exactIdentity.dev, inode: collidingInode },
      )).toBe(false);
      expect(__testOnlySqliteSchemaV1PhysicalFileIdentityMatches(
        { device: exactIdentity.dev, inode: unsafeInode },
        { device: exactIdentity.dev, inode: unsafeInode },
      )).toBe(true);
      const exactHandoff = createFinalizerHandoff(exact.path, "g006b:identity:exact-clone", []);
      replaceFixtureWithClone(exact);
      expect(statSync(exact.path, { bigint: true }).ino).not.toBe(exactIdentity.ino);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(exact.path, exactHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_FILE_IDENTITY_DRIFT",
      }));
      expect(classifySqliteSchemaV1(exact.db).kind).toBe("staged");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(exact.path, exactHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const poisonedHandoff = createFinalizerHandoff(poisoned.path, "g006b:identity:poisoned-clone", []);
      replaceFixtureWithClone(poisoned, (clone) => {
        clone.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")
          .run("tenant_deletion_checkpoint_events", BigInt(91));
      });
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(poisoned.path, poisonedHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_FILE_IDENTITY_DRIFT",
      }));
      expect(readSequenceHighWater(poisoned.db)).toBe(BigInt(91));
      expect(classifySqliteSchemaV1(poisoned.db).kind).toBe("staged");
    } finally {
      exact.cleanup();
      poisoned.cleanup();
    }
  });

  it("rejects transaction, catalog, multi-statement, TEMP, and attached-schema SQL at mint", () => {
    const fixture = createTemporaryStagedDatabase();
    const attempts: ReadonlyArray<readonly [string, SqliteSchemaV1FinalizerPlan]> = [
      ["begin", [{ kind: "update", sql: "BEGIN IMMEDIATE" }]],
      ["commit", [{ kind: "update", sql: "cOmMiT" }]],
      ["end", [{ kind: "delete", sql: "/* leading */ END" }]],
      ["rollback", [{ kind: "update", sql: "ROLLBACK" }]],
      ["savepoint", [{ kind: "update", sql: "SAVEPOINT caller_owned" }]],
      ["release", [{ kind: "update", sql: "RELEASE caller_owned" }]],
      ["pragma", [{ kind: "update", sql: "/* leading */ PrAgMa user_version = 6002" }]],
      ["attach", [{ kind: "update", sql: "ATTACH DATABASE 'other.db' AS other" }]],
      ["detach", [{ kind: "update", sql: "DETACH DATABASE other" }]],
      ["vacuum", [{ kind: "update", sql: "VACUUM" }]],
      ["multi", [{ kind: "insert", sql: "INSERT INTO location_markets (id, name, country_code) VALUES ('multi', 'Multi', 'US'); DELETE FROM location_markets" }]],
      ["catalog", [{ kind: "update", sql: "UPDATE [sqlite_schema] SET sql = sql" }]],
      ["master", [{ kind: "update", sql: "UPDATE `sqlite_master` SET sql = sql" }]],
      ["sequence", [{ kind: "update", sql: "UPDATE sqlite_sequence SET seq = seq + 1" }]],
      ["quoted-sequence", [{ kind: "delete", sql: "DELETE FROM \"sqlite_sequence\"" }]],
      ["internal-shadow", [{ kind: "create-table", sql: "CREATE TABLE [sqlite_shadow_probe] (id TEXT)" }]],
      ["internal-stat", [{ kind: "delete", sql: "DELETE FROM sqlite_stat1" }]],
      ["writable", [{ kind: "create-table", sql: "CREATE TABLE \"writable_schema\" (id TEXT)" }]],
      ["temp-table", [{ kind: "create-table", sql: "CREATE /*x*/ TeMp TABLE denied (id TEXT)" }]],
      ["temporary-table", [{ kind: "create-table", sql: "CREATE TEMPORARY TABLE denied (id TEXT)" }]],
      ["temp-trigger", [{ kind: "create-trigger", sql: "CREATE TEMP TRIGGER denied AFTER INSERT ON location_markets BEGIN SELECT 1; END" }]],
      ["temp-index-declaration", [{ kind: "create-index", sql: "CREATE TEMP INDEX denied ON location_markets(id)" }]],
      ["temporary-trigger", [{ kind: "create-trigger", sql: "CREATE \"TEMPORARY\" TRIGGER denied AFTER INSERT ON location_markets BEGIN SELECT 1; END" }]],
      ["temp-index", [{ kind: "create-index", sql: "CREATE INDEX denied ON \"temp\" . location_markets(id)" }]],
      ["attached-insert", [{ kind: "insert", sql: "INSERT INTO \"other\" . location_markets (id) VALUES ('x')" }]],
      ["qualified-main", [{ kind: "update", sql: "UPDATE main.location_markets SET name = name" }]],
      ["attached-trigger", [{ kind: "create-trigger", sql: "CREATE TRIGGER denied AFTER INSERT ON aux.location_markets BEGIN SELECT NEW.name; END" }]],
      ["sequence-trigger", [{ kind: "create-trigger", sql: "CREATE TRIGGER denied AFTER INSERT ON location_markets BEGIN UPDATE sqlite_sequence SET seq = 0; END" }]],
      ["quoted-sequence-trigger", [{ kind: "create-trigger", sql: "CREATE TRIGGER denied AFTER INSERT ON location_markets BEGIN UPDATE [sqlite_sequence] SET seq = 0; END" }]],
      ["trigger-multi", [{ kind: "create-trigger", sql: "CREATE TRIGGER denied AFTER INSERT ON location_markets BEGIN SELECT 1; END; DROP TABLE location_markets" }]],
    ];
    try {
      for (const [name, plan] of attempts) {
        expect(() => createFinalizerHandoff(fixture.path, `g006b:sql:${name}`, plan)).toThrowError(expect.objectContaining({
          code: "G006A_FINALIZER_SQL_REJECTED",
        }));
      }
      expect(() => createFinalizerHandoff(fixture.path, "g006b:sql:autoincrement-hidden", [
        { kind: "create-table", sql: "CREATE TABLE g006a_auto_probe (id INTEGER PRIMARY KEY AUTOINCREMENT)" },
        { kind: "drop-table", name: "g006a_auto_probe" },
      ])).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      expect(() => createFinalizerHandoff(fixture.path, "g006b:sql:restore-without-rebuild", [
        { kind: "restore-autoincrement-high-water", table: "tenant_deletion_checkpoint_events" },
      ])).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      expect(() => createFinalizerHandoff(fixture.path, "g006b:sql:restore-with-create-only", [
        {
          kind: "create-table",
          sql: "CREATE TABLE tenant_deletion_checkpoint_events (id INTEGER PRIMARY KEY AUTOINCREMENT)",
        },
        { kind: "restore-autoincrement-high-water", table: "tenant_deletion_checkpoint_events" },
      ])).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      expect(() => createFinalizerHandoff(fixture.path, "g006b:sql:restore-wrong-table", [
        {
          kind: "restore-autoincrement-high-water",
          table: "other_table",
        } as unknown as SqliteSchemaV1FinalizerPlan[number],
      ])).toThrowError(expect.objectContaining({ code: "G006A_FINALIZER_PLAN_REJECTED" }));
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
      expect(Number(fixture.db.pragma("writable_schema", { simple: true }))).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("binds mint-time rows, catalog, physical indexes, and user_version under the writer lock", () => {
    const row = createTemporaryStagedDatabase();
    const value = createTemporaryStagedDatabase();
    const table = createTemporaryStagedDatabase();
    const catalog = createTemporaryStagedDatabase();
    const physical = createTemporaryStagedDatabase();
    const version = createTemporaryStagedDatabase();
    try {
      const rowHandoff = createFinalizerHandoff(row.path, "g006b:drift:row", []);
      row.db.prepare("INSERT INTO zip_codes (zip, city, state, county) VALUES ('80000', 'Drift', 'CO', 'Test')").run();
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(row.path, rowHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_ROW_COUNT_DRIFT",
      }));
      expect(classifySqliteSchemaV1(row.db).kind).toBe("staged");

      value.db.prepare("INSERT INTO zip_codes (zip, city, state, county) VALUES ('80001', 'Original', 'CO', 'Test')").run();
      const valueHandoff = createFinalizerHandoff(value.path, "g006b:drift:value", []);
      value.db.prepare("UPDATE zip_codes SET city = 'Changed' WHERE zip = '80001'").run();
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(value.path, valueHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_PAYLOAD_DRIFT",
      }));

      const tableHandoff = createFinalizerHandoff(table.path, "g006b:drift:table", []);
      table.db.exec("ALTER TABLE zip_codes ADD COLUMN unexpected_g006a TEXT");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(table.path, tableHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_STATE_REJECTED",
      }));

      const catalogHandoff = createFinalizerHandoff(catalog.path, "g006b:drift:catalog", []);
      catalog.db.exec("DROP INDEX idx_ai_usage_tenant_created");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(catalog.path, catalogHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_STATE_REJECTED",
      }));

      insertPartialIndexProbeRows(physical.db);
      const physicalHandoff = createFinalizerHandoff(physical.path, "g006b:drift:physical", []);
      spoofNullWorkspacePartialIndex(physical.db);
      physical.db.close();
      physical.db = new Database(physical.path);
      expect(classifySqliteSchemaV1(physical.db).kind).toBe("staged");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(physical.path, physicalHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_INTEGRITY_CHECK_FAILED",
      }));

      const versionHandoff = createFinalizerHandoff(version.path, "g006b:drift:version", []);
      version.db.pragma("user_version = 99");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(version.path, versionHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_STATE_REJECTED",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(version.path, versionHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
    } finally {
      row.cleanup();
      value.cleanup();
      table.cleanup();
      catalog.cleanup();
      physical.cleanup();
      version.cleanup();
    }
  });

  it("binds exact sqlite_sequence rows at mint and rejects same-file high-water poison under the writer lock", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const handoff = createFinalizerHandoff(fixture.path, "g006b:sequence:mint-drift", []);
      fixture.db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")
        .run("tenant_deletion_checkpoint_events", BigInt(41));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_SQLITE_OWNED_STATE_DRIFT",
      }));
      expect(readSequenceHighWater(fixture.db)).toBe(BigInt(41));
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
    } finally {
      fixture.cleanup();
    }
  });

  it("rebuilds the sole AUTOINCREMENT table only with private mint-time high-water restoration", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      fixture.db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")
        .run("tenant_deletion_checkpoint_events", BigInt(77));
      const rebuild = readAutoincrementRebuildPlan(fixture.db);
      const handoff = createFinalizerHandoff(fixture.path, "g006b:sequence:legitimate-rebuild", rebuild);
      expect(coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toMatchObject({
        status: "finalized",
        state: { kind: "final", catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST },
      });
      expect(readSequenceHighWater(fixture.db)).toBe(BigInt(77));
      expect(sqliteSchemaV1PhysicalManifestDigest(fixture.db)).toBe(SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST);
      expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM tenant_deletion_checkpoint_events").get())
        .toMatchObject({ count: 0 });
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
      expect(snapshot.tableNames).toEqual(expect.arrayContaining(["zip_codes", "audit_logs", "compatibility_backfill_receipts"]));

      const deleteHandoff = createFinalizerHandoff(fixture.path, "g006b:preserve:delete", [
        { kind: "delete", sql: "DELETE FROM zip_codes WHERE zip = ?", binds: ["80000"] },
      ]);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, deleteHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_ROW_COUNT_DRIFT",
      }));
      expect(fixture.db.prepare("SELECT city FROM zip_codes WHERE zip = '80000'").get()).toMatchObject({ city: "Original" });

      const updateHandoff = createFinalizerHandoff(fixture.path, "g006b:preserve:update", [
        { kind: "update", sql: "UPDATE zip_codes SET city = 'Changed' WHERE zip = ?", binds: ["80000"] },
      ]);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, updateHandoff)).toThrowError(expect.objectContaining({
        code: "G006A_PAYLOAD_DRIFT",
      }));
      expect(fixture.db.prepare("SELECT city FROM zip_codes WHERE zip = '80000'").get()).toMatchObject({ city: "Original" });
    } finally {
      fixture.cleanup();
    }
  });

  it("guards database_list and sqlite_temp_schema with closed fault modes and closes the writer", () => {
    for (const mode of ["writer-attached-schema", "writer-temp-object"] as const) {
      const fixture = createTemporaryStagedDatabase();
      try {
        const handoff = createFinalizerHandoff(fixture.path, `g006b:connection:${mode}`, []);
        const boundary = createSqliteSchemaV1FreshVerifierTestBoundary(mode);
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff, {
          freshVerifierTestBoundary: boundary,
        })).toThrowError(expect.objectContaining({ code: "G006A_CONNECTION_BOUNDARY_REJECTED" }));
        expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toThrowError(expect.objectContaining({
          code: "G006A_FINALIZER_CONSUMED",
        }));
        expect(classifySqliteSchemaV1(fixture.db).kind).toBe("staged");
      } finally {
        fixture.cleanup();
      }
    }
    expect(() => createSqliteSchemaV1FreshVerifierTestBoundary(
      (() => new Database(":memory:")) as unknown as "fail-verifier-open",
    )).toThrowError(expect.objectContaining({ code: "G006A_VERIFIER_BOUNDARY_REJECTED" }));
  });

  it("finalizes only after internal exact-path read-only reopen and closes writer and verifier", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const handoff = createFinalizerHandoff(fixture.path, "g006b:success:reopen", [
        {
          kind: "create-trigger",
          sql: `CREATE TRIGGER g006a_structural_token_probe
            AFTER INSERT ON location_markets BEGIN
              SELECT CASE WHEN NEW.name = 'PRAGMA writable_schema COMMIT END TEMP' THEN RAISE(IGNORE) END;
            END`,
        },
        { kind: "drop-trigger", name: "g006a_structural_token_probe" },
      ]);
      expect(coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toMatchObject({
        status: "finalized",
        state: {
          kind: "final",
          catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
          applicationTableCount: 37,
          targetColumnCount: 32,
        },
      });
      fixture.db.close();
      const reopened = new Database(fixture.path, { readonly: true, fileMustExist: true });
      try {
        expect(classifySqliteSchemaV1(reopened)).toMatchObject({ kind: "final" });
        expect(sqliteSchemaV1PhysicalManifestDigest(reopened)).toBe(SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST);
        expect(reopened.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      } finally {
        reopened.close();
      }
      fixture.db = new Database(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("reports committed-but-unverified recovery required when the fresh reopen fails", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const handoff = createFinalizerHandoff(fixture.path, "g006b:reopen:failure", []);
      const boundary = createSqliteSchemaV1FreshVerifierTestBoundary("fail-verifier-open");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff, {
        freshVerifierTestBoundary: boundary,
      })).toThrowError(expect.objectContaining({
        code: "G006A_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
        committed: true,
        status: "committed-unverified-recovery-required",
      }));
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("final");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));
      fixture.db.close();
      const reopened = new Database(fixture.path, { readonly: true, fileMustExist: true });
      try {
        expect(classifySqliteSchemaV1(reopened).kind).toBe("final");
      } finally {
        reopened.close();
      }
      fixture.db = new Database(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("reports committed-but-unverified when an exact clone replaces the file between writer close and verifier open", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      const handoff = createFinalizerHandoff(fixture.path, "g006b:reopen:identity-swap", []);
      fixture.db.close();
      const boundary = createSqliteSchemaV1FreshVerifierTestBoundary("replace-before-verifier");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, handoff, {
        freshVerifierTestBoundary: boundary,
      })).toThrowError(expect.objectContaining({
        code: "G006A_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
        committed: true,
        status: "committed-unverified-recovery-required",
      }));
      expect(existsSync(`${fixture.path}.g006a-verifier-clone`)).toBe(false);
      expect(existsSync(`${fixture.path}.g006a-verifier-original`)).toBe(false);
      fixture.db = new Database(fixture.path);
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("final");
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back ordinary accepted-legacy plan failures and allows a fresh capability", () => {
    const fixture = createTemporaryAcceptedLegacyDatabase();
    try {
      const before = classifySqliteSchemaV1(fixture.db);
      const first = createFinalizerHandoff(fixture.path, "g006b:legacy:failure-1", duplicateMarketPlan("legacy-failure"));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, first)).toThrow();
      expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = 'legacy-failure'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(fixture.db)).toEqual(before);
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, first)).toThrowError(expect.objectContaining({
        code: "G006A_FINALIZER_CONSUMED",
      }));

      const retry = createFinalizerHandoff(fixture.path, "g006b:legacy:failure-2", duplicateMarketPlan("legacy-retry"));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path, retry)).toThrow();
      expect(fixture.db.prepare("SELECT id FROM location_markets WHERE id = 'legacy-retry'").get()).toBeUndefined();
      expect(classifySqliteSchemaV1(fixture.db)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects a persisted wrong physical partial-index spoof after close and reopen", () => {
    const fixture = createTemporaryStagedDatabase();
    try {
      insertFoundation(fixture.db);
      insertPartialIndexProbeRows(fixture.db, false);
      fixture.db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      spoofNullWorkspacePartialIndex(fixture.db);
      fixture.db.close();
      fixture.db = new Database(fixture.path);
      expect(sqliteCatalogDigest(fixture.db)).toBe(SQLITE_SCHEMA_V1_CATALOG_DIGEST);
      expect(classifySqliteSchemaV1(fixture.db).kind).toBe("final");
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(fixture.path)).toThrowError(expect.objectContaining({
        code: "G006A_INTEGRITY_CHECK_FAILED",
      }));
    } finally {
      fixture.cleanup();
    }
  });

  it("replays exact file-backed final state and retains row, payload, scope, and foreign-key guards", () => {
    const payloadDb = createAcceptedLegacyDatabase();
    const countDb = createAcceptedLegacyDatabase();
    const scopeDb = createAcceptedLegacyDatabase();
    const foreignKey = createTemporaryStagedDatabase();
    const replay = createTemporaryStagedDatabase();
    try {
      const payloadBefore = captureSqliteSchemaV1PreservationSnapshot(payloadDb);
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

      foreignKey.db.pragma("foreign_keys = OFF");
      foreignKey.db.prepare(`
        INSERT INTO lead_notes (id, lead_id, author_user_id, body, tenant_id, workspace_id)
        VALUES ('orphan', 'missing', 'actor', 'orphan', ?, NULL)
      `).run(TENANT_A);
      foreignKey.db.pragma("foreign_keys = ON");
      foreignKey.db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      expect(() => assertSqliteSchemaV1DatabaseHealth(foreignKey.db)).toThrowError(expect.objectContaining({
        code: "G006A_FOREIGN_KEY_CHECK_FAILED",
      }));
      expect(() => coordinateSqliteSchemaV1WholeUpgrade(foreignKey.path)).toThrowError(expect.objectContaining({
        code: "G006A_FOREIGN_KEY_CHECK_FAILED",
      }));

      replay.db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      expect(coordinateSqliteSchemaV1WholeUpgrade(replay.path)).toMatchObject({
        status: "replayed",
        state: { kind: "final" },
      });
    } finally {
      payloadDb.close();
      countDb.close();
      scopeDb.close();
      foreignKey.cleanup();
      replay.cleanup();
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
  databasePath: string,
  handoffBindingId: string,
  plan: SqliteSchemaV1FinalizerPlan,
): SqliteSchemaV1FinalizerHandoff {
  return Object.freeze({
    capability: createSqliteSchemaV1LaterFinalizerCapability({
      databasePath,
      handoffBindingId,
      targetCatalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
      plan,
    }),
    handoffBindingId,
  });
}

function duplicateMarketPlan(id: string): SqliteSchemaV1FinalizerPlan {
  const operation = {
    kind: "insert" as const,
    sql: "INSERT INTO location_markets (id, name, country_code) VALUES (?, ?, ?)",
    binds: [id, "Failure", "US"],
  };
  return [operation, { ...operation }];
}

function replaceFixtureWithClone(
  fixture: TemporaryDatabaseFixture,
  mutateClone?: (db: Database.Database) => void,
): void {
  if (fixture.db.open) fixture.db.close();
  const clonePath = join(fixture.directory, "schema-clone.db");
  const originalPath = join(fixture.directory, "schema-original.db");
  copyFileSync(fixture.path, clonePath);
  if (mutateClone) {
    const clone = new Database(clonePath);
    try {
      mutateClone(clone);
    } finally {
      clone.close();
    }
  }
  renameSync(fixture.path, originalPath);
  try {
    renameSync(clonePath, fixture.path);
    rmSync(originalPath, { force: true });
  } catch (error) {
    if (!existsSync(fixture.path) && existsSync(originalPath)) renameSync(originalPath, fixture.path);
    throw error;
  } finally {
    rmSync(clonePath, { force: true });
  }
  fixture.db = new Database(fixture.path);
  fixture.db.pragma("foreign_keys = ON");
}

function readSequenceHighWater(db: Database.Database): bigint {
  const row = db.prepare(`
    SELECT CAST(seq AS TEXT) AS seq_text
    FROM sqlite_sequence
    WHERE name = 'tenant_deletion_checkpoint_events'
  `).get() as { seq_text: string } | undefined;
  if (!row) throw new Error("missing tenant_deletion_checkpoint_events sqlite_sequence row");
  return BigInt(row.seq_text);
}

function readAutoincrementRebuildPlan(db: Database.Database): SqliteSchemaV1FinalizerPlan {
  const table = "tenant_deletion_checkpoint_events";
  const tableRow = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  if (!tableRow?.sql) throw new Error(`missing ${table} table SQL`);
  const objects = db.prepare(`
    SELECT type, sql
    FROM sqlite_schema
    WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL
    ORDER BY CASE type WHEN 'index' THEN 0 ELSE 1 END, name COLLATE BINARY
  `).all(table) as Array<{ type: "index" | "trigger"; sql: string }>;
  const plan: Array<SqliteSchemaV1FinalizerPlan[number]> = [
    { kind: "drop-table", name: table },
    { kind: "create-table", sql: tableRow.sql },
  ];
  for (const object of objects) {
    plan.push(object.type === "index"
      ? { kind: "create-index", sql: object.sql }
      : { kind: "create-trigger", sql: object.sql });
  }
  plan.push({ kind: "restore-autoincrement-high-water", table });
  return plan;
}

function insertPartialIndexProbeRows(db: Database.Database, withFoundation = true): void {
  if (withFoundation) insertFoundation(db);
  const insert = db.prepare(`
    INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id)
    VALUES (?, ?, ?, ?)
  `);
  insert.run(TENANT_A, null, "null-workspace-user", MARKET);
  insert.run(TENANT_A, WORKSPACE_A, "workspace-user", MARKET);
}

function spoofNullWorkspacePartialIndex(db: Database.Database): void {
  const expectedSql = indexSql(db, "g006r_user_market_access_null_identity");
  db.exec(`
    DROP INDEX g006r_user_market_access_null_identity;
    CREATE UNIQUE INDEX g006r_user_market_access_null_identity
      ON user_market_access(tenant_id, user_id, market_id)
      WHERE workspace_id IS NOT NULL;
  `);
  db.unsafeMode(true);
  db.pragma("writable_schema = ON");
  try {
    db.prepare("UPDATE sqlite_schema SET sql = ? WHERE type = 'index' AND name = 'g006r_user_market_access_null_identity'")
      .run(expectedSql);
  } finally {
    db.pragma("writable_schema = OFF");
    db.unsafeMode(false);
  }
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
