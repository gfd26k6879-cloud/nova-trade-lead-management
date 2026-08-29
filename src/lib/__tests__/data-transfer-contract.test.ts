import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import {
  DATA_EXPORT_SCHEMA_VERSION,
  LEGACY_DATA_EXPORT_SCHEMA_VERSION,
  LEGACY_SCHEMA_3_TABLE_CONTRACTS,
  TABLE_CONTRACTS,
  TABLE_NAMES,
  authReferenceColumns,
  encodeRowIdentity,
  historicalRowsRequireRestore,
  loadSqliteUniqueKeyMetadata,
  sha256,
  targetColumn,
  validateTenantIntegrity,
  validateDataExportDirectory,
} from "../../../scripts/data-transfer-contract.mjs";
import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";
import { digestRows, importSupabaseData, normalizeValue, validateAuthReferences, validateTargetSchema } from "../../../scripts/import-supabase-data.mjs";
import { verifySqliteDatabase } from "../../../scripts/verify-data-recovery.mjs";
import { SCHEMA_SQL } from "../db/schema";
import { prepareSqliteCompatibilityBackfill } from "../tenancy/compatibility-backfill";

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
    const tableManifests = manifest.tables as Record<string, Record<string, unknown>>;
    const settingsManifest = tableManifests.settings as { columns: string[] };

    expect(manifest.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(manifest.tableOrder).toEqual(TABLE_NAMES);
    expect(validated.tables.size).toBe(TABLE_NAMES.length);
    expect(validated.tables.get("settings")!.rows[0]).toMatchObject({ id: 1 });
    expect(settingsManifest.columns).not.toContain("openai_api_key_encrypted");
    expect(settingsManifest.columns).not.toContain("google_places_api_key_encrypted");
    expect(settingsManifest.columns).not.toContain("google_maps_browser_api_key_encrypted");
    expect(manifest.sanitizedColumns).toEqual({
      place_cache: ["raw_json:strip_google_reviews"],
      place_observations: ["raw_json:strip_google_reviews"],
    });
    expect(tableManifests.user_market_access).toMatchObject({
      physicalPrimaryKey: [],
      rowIdentity: ["tenant_id", "workspace_id", "user_id", "market_id"],
      nullableIdentityColumns: ["workspace_id"],
      uniqueKeys: expect.arrayContaining([
        {
          name: "g006r_user_market_access_null_identity",
          columns: ["tenant_id", "user_id", "market_id"],
          predicate: "workspace_id IS NULL",
          nullsNotDistinct: false,
        },
        {
          name: "g006r_user_market_access_workspace_identity",
          columns: ["tenant_id", "workspace_id", "user_id", "market_id"],
          predicate: "workspace_id IS NOT NULL",
          nullsNotDistinct: false,
        },
      ]),
    });
    expect(tableManifests.place_cache).toMatchObject({
      physicalPrimaryKey: ["place_id"],
      rowIdentity: ["tenant_id", "source_card_id", "place_id"],
      nullableIdentityColumns: [],
    });
    const changedIdentities = new Set(["user_market_access", "place_cache", "places_master", "place_observations", "api_usage_events"]);
    for (const contract of TABLE_CONTRACTS) {
      if (!changedIdentities.has(contract.name)) expect(contract.rowIdentity).toEqual(contract.physicalPrimaryKey);
    }

    for (const table of ["place_cache", "place_observations"]) {
      const [row] = validated.tables.get(table)!.rows;
      const raw = JSON.parse(row.raw_json);
      expect(raw.reviews).toBeUndefined();
      expect(raw.nested?.reviews).toBeUndefined();
      expect(raw.id).toBe("places/legacy");
      expect(raw.editorialSummary).toEqual({ text: "Safe summary" });
      expect(raw.__nositeCache?.reviewInsights?.keywords).toEqual(["responsive"]);
    }
    assertLocaleIndependentUniqueKeyOrdering();
  });

  it("keeps schema 3 as a truthful legacy snapshot instead of reinterpreting it as schema 4", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase({ schema4: false });
    const source = new Database(dbPath);
    source.exec("CREATE UNIQUE INDEX g006r_user_market_access_identity ON user_market_access(tenant_id, workspace_id, user_id, market_id)");
    source.close();
    expect(() => exportSqliteData({ dbPath, outDir })).toThrow(/user_market_access: schema-4 row identity lacks exact SQLite unique enforcement/);

    const manifest = exportSqliteData({ dbPath, outDir, schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION });
    const validated = validateDataExportDirectory(outDir);
    const tableManifests = manifest.tables as Record<string, Record<string, unknown>>;
    expect(manifest.schemaVersion).toBe(LEGACY_DATA_EXPORT_SCHEMA_VERSION);
    expect(tableManifests.user_market_access).toMatchObject({ primaryKey: ["user_id", "market_id"] });
    expect(tableManifests.user_market_access).not.toHaveProperty("rowIdentity");
    expect(validated.contracts).toBe(LEGACY_SCHEMA_3_TABLE_CONTRACTS);
    expect(() => validateTargetSchema(makeTargetSchema(validated), validated)).not.toThrow();
  });

  it("encodes nullable workspace identity distinctly and rejects missing or duplicate logical identities", () => {
    const contract = TABLE_CONTRACTS.find(({ name }) => name === "user_market_access")!;
    const base = {
      tenant_id: "10000000-0000-4000-8000-000000000001",
      user_id: "90000000-0000-4000-8000-000000000001",
      market_id: "market-colorado",
    };
    expect(encodeRowIdentity(contract, { ...base, workspace_id: null }))
      .not.toBe(encodeRowIdentity(contract, { ...base, workspace_id: "null" }));
    expect(() => encodeRowIdentity(contract, base)).toThrow(/workspace_id is missing or empty/);
    expect(() => encodeRowIdentity(contract, { ...base, workspace_id: "" })).toThrow(/workspace_id is missing or empty/);
    const placeContract = TABLE_CONTRACTS.find(({ name }) => name === "place_cache")!;
    expect(() => encodeRowIdentity(placeContract, { tenant_id: null, source_card_id: "google_places_legacy", place_id: "place" }))
      .toThrow(/tenant_id is null/);

    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    const db = new Database(dbPath);
    try {
      db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, 'US', ?)")
        .run(base.market_id, "Colorado", "CO");
      db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, 'US', ?)")
        .run("market-utah", "Utah", "UT");
      db.prepare("INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES (?, NULL, ?, ?)")
        .run(base.tenant_id, base.user_id, base.market_id);
      db.prepare("INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES (?, ?, ?, ?)")
        .run(base.tenant_id, "20000000-0000-4000-8000-000000000001", base.user_id, "market-utah");
      expect(() => db.prepare("INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES (?, NULL, ?, ?)")
        .run(base.tenant_id, base.user_id, base.market_id)).toThrow(/UNIQUE constraint failed/);
    } finally {
      db.close();
    }
    expect(() => verifySqliteDatabase(dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION)).not.toThrow();
    exportSqliteData({ dbPath, outDir });
    const validated = validateDataExportDirectory(outDir);
    expect(validated.manifest.tables.user_market_access.physicalPrimaryKey).toEqual([]);
    expect(validated.tables.get("user_market_access")!.rows).toHaveLength(2);
    expect(validated.tables.get("user_market_access")!.rows.some((row: Record<string, unknown>) => row.workspace_id === null)).toBe(true);
    const manifestPath = path.join(outDir, "manifest.json");
    const predicateManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const nullKey = predicateManifest.tables.user_market_access.uniqueKeys.find(
      (key: { predicate: string | null }) => key.predicate === "workspace_id IS NULL",
    );
    nullKey.predicate = "workspace_id IS NULL AND tenant_id <> ''";
    fs.writeFileSync(manifestPath, JSON.stringify(predicateManifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/user_market_access: rowIdentity is not backed by an exact physical primary or unique key/);

    exportSqliteData({ dbPath, outDir });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.tables.place_cache.rowIdentity = ["place_id"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/place_cache: rowIdentity does not match the recovery contract/);

    exportSqliteData({ dbPath, outDir });
    const duplicateManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const userMarketPath = path.join(outDir, "user_market_access.json");
    const userMarketRows = JSON.parse(fs.readFileSync(userMarketPath, "utf8"));
    const nullWorkspaceRow = userMarketRows.find((row: Record<string, unknown>) => row.workspace_id === null);
    userMarketRows.push({ ...nullWorkspaceRow });
    fs.writeFileSync(userMarketPath, `${JSON.stringify(userMarketRows, null, 2)}\n`);
    refreshManifestEntry(duplicateManifest, "user_market_access", userMarketPath, userMarketRows);
    fs.writeFileSync(manifestPath, JSON.stringify(duplicateManifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/user_market_access: duplicate row identity/);

    exportSqliteData({ dbPath, outDir });
    const missingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const placeCachePath = path.join(outDir, "place_cache.json");
    const missingRows = JSON.parse(fs.readFileSync(placeCachePath, "utf8"));
    missingRows[0].source_card_id = null;
    fs.writeFileSync(placeCachePath, `${JSON.stringify(missingRows, null, 2)}\n`);
    refreshManifestEntry(missingManifest, "place_cache", placeCachePath, missingRows);
    fs.writeFileSync(manifestPath, JSON.stringify(missingManifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/place_cache\[0\]: row identity column source_card_id is null/);

    installAdversarialSqliteIndexDefinitions(dbPath);
    expect(() => verifySqliteDatabase(dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION)).not.toThrow();
    const adversarialManifest = exportSqliteData({ dbPath, outDir });
    const adversarialTables = adversarialManifest.tables as Record<string, { uniqueKeys: Array<{ name: string; predicate: string | null }> }>;
    expect(adversarialTables.user_market_access.uniqueKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "null \"WHERE\" decoy", predicate: "workspace_id IS NULL" }),
      expect.objectContaining({ name: "where", predicate: "workspace_id IS NOT NULL" }),
      expect.objectContaining({ name: "bracket WHERE decoy", predicate: "market_id IS NOT NULL" }),
      expect.objectContaining({ name: "single 'WHERE' decoy", predicate: "tenant_id IS NOT NULL" }),
    ]));
    assertPersistedSqliteIndexStatementRegressions();
    driftAdversarialSqliteNullIndex(dbPath);
    expect(() => exportSqliteData({ dbPath, outDir }))
      .toThrow(/user_market_access: schema-4 row identity lacks exact SQLite unique enforcement/);
    expect(() => verifySqliteDatabase(dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION))
      .toThrow(/user_market_access: schema-4 row identity lacks exact SQLite unique enforcement/);
  }, 10_000);

  it.each([
    [
      "a missing nullable-family member",
      "DROP INDEX g006r_user_market_access_null_identity",
    ],
    [
      "an ordinary four-column nullable index",
      `DROP INDEX g006r_user_market_access_null_identity;
       DROP INDEX g006r_user_market_access_workspace_identity;
       CREATE UNIQUE INDEX invalid_user_market_identity
         ON user_market_access(tenant_id, workspace_id, user_id, market_id)`,
    ],
    [
      "an expression member",
      `DROP INDEX g006r_user_market_access_null_identity;
       CREATE UNIQUE INDEX invalid_user_market_null_identity
         ON user_market_access(tenant_id, lower(user_id), market_id)
         WHERE workspace_id IS NULL`,
    ],
    [
      "reordered columns",
      `DROP INDEX g006r_user_market_access_null_identity;
       CREATE UNIQUE INDEX invalid_user_market_null_identity
         ON user_market_access(user_id, tenant_id, market_id)
         WHERE workspace_id IS NULL`,
    ],
    [
      "predicate drift",
      `DROP INDEX g006r_user_market_access_null_identity;
       CREATE UNIQUE INDEX invalid_user_market_null_identity
         ON user_market_access(tenant_id, user_id, market_id)
         WHERE workspace_id IS NULL AND tenant_id <> ''`,
    ],
  ])("rejects schema-4 SQLite identity enforcement with %s", (_label, mutationSql) => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    const db = new Database(dbPath);
    try {
      db.exec(mutationSql);
    } finally {
      db.close();
    }
    expect(() => exportSqliteData({ dbPath, outDir })).toThrow(/user_market_access: schema-4 row identity lacks exact SQLite unique enforcement/);
    expect(() => verifySqliteDatabase(dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION))
      .toThrow(/user_market_access: schema-4 row identity lacks exact SQLite unique enforcement/);
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

  it("rejects row-count and checksum mismatches", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath, outDir });
    const manifestPath = path.join(outDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.tables.tenants.rows += 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/tenants: row count mismatch/);

    exportSqliteData({ dbPath, outDir });
    const checksumManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    checksumManifest.tables.tenants.sha256 = "0".repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(checksumManifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/tenants: checksum mismatch/);
  });

  it("rejects missing tenant parents, cross-tenant workspaces, and malformed receipt bindings", () => {
    const { dbPath, outDir } = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath, outDir });
    const manifestPath = path.join(outDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const tenantsPath = path.join(outDir, "tenants.json");
    fs.writeFileSync(tenantsPath, "[]\n");
    refreshManifestEntry(manifest, "tenants", tenantsPath, []);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateDataExportDirectory(outDir)).toThrow(/tenant-integrity workspaces: tenant parent is missing/);

    const cross = createSyntheticSqliteDatabase();
    exportSqliteData({ dbPath: cross.dbPath, outDir: cross.outDir });
    const crossManifestPath = path.join(cross.outDir, "manifest.json");
    const crossManifest = JSON.parse(fs.readFileSync(crossManifestPath, "utf8"));
    const crossTenants = JSON.parse(fs.readFileSync(path.join(cross.outDir, "tenants.json"), "utf8"));
    crossTenants.push({ ...crossTenants[0], id: "10000000-0000-4000-8000-000000000002", slug: "synthetic-tenant-b" });
    const crossWorkspaces = JSON.parse(fs.readFileSync(path.join(cross.outDir, "workspaces.json"), "utf8"));
    crossWorkspaces[0].tenant_id = crossTenants[1].id;
    const crossTenantsPath = path.join(cross.outDir, "tenants.json");
    const crossWorkspacesPath = path.join(cross.outDir, "workspaces.json");
    fs.writeFileSync(crossTenantsPath, `${JSON.stringify(crossTenants, null, 2)}\n`);
    fs.writeFileSync(crossWorkspacesPath, `${JSON.stringify(crossWorkspaces, null, 2)}\n`);
    refreshManifestEntry(crossManifest, "tenants", crossTenantsPath, crossTenants);
    refreshManifestEntry(crossManifest, "workspaces", crossWorkspacesPath, crossWorkspaces);
    fs.writeFileSync(crossManifestPath, JSON.stringify(crossManifest));
    expect(() => validateDataExportDirectory(cross.outDir)).toThrow(/tenant-integrity tenant_memberships: workspace crosses tenant boundary/);

    const malformed = new Map([
      ["tenants", { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] }],
      ["workspaces", { rows: [{ id: "20000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001" }] }],
      ["tenant_policies", { rows: [{ id: "50000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001" }] }],
      ["compatibility_backfill_receipts", { rows: [{ id: "receipt", idempotency_key: "key", schema_version: 1, source_engine: "postgres", checksum_algorithm: "wrong", manifest_hash: "a".repeat(64), source_snapshot_fingerprint: "b".repeat(64), tenant_id: "10000000-0000-4000-8000-000000000001", workspace_id: "20000000-0000-4000-8000-000000000001", owner_auth_identity_id: "90000000-0000-4000-8000-000000000001", policy_id: "50000000-0000-4000-8000-000000000001", policy_version: 1, policy_hash: "c".repeat(64), user_count: 0, relationship_orphan_count: 0, status: "completed", table_counts_json: "{}", before_checksums_json: "{}", after_checksums_json: "{}", receipt_json: JSON.stringify({ status: "completed", receiptId: "receipt", idempotencyKey: "key", schemaVersion: 1, sourceEngine: "postgres", checksumAlgorithm: "wrong", manifestHash: "a".repeat(64), sourceSnapshotFingerprint: "b".repeat(64), tenantId: "10000000-0000-4000-8000-000000000001", workspaceId: "20000000-0000-4000-8000-000000000001", ownerAuthIdentityId: "90000000-0000-4000-8000-000000000001", policyId: "50000000-0000-4000-8000-000000000001", policyVersion: 1, policyHash: "c".repeat(64), userCount: 0, tableCounts: {}, beforeContentChecksums: {}, afterContentChecksums: {}, relationshipOrphanCount: 0 }) }] }],
    ]);
    expect(() => validateTenantIntegrity(malformed)).toThrow(/compatibility_backfill_receipts: source engine\/checksum algorithm pair/);

    const malformedEvent = new Map([
      ["tenants", { rows: [{ id: "10000000-0000-4000-8000-000000000001" }] }],
      ["workspaces", { rows: [{ id: "20000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001" }] }],
      ["tenant_deletion_jobs", { rows: [{ id: "80000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001", workspace_id: "20000000-0000-4000-8000-000000000001", status: "completed", scheduled_at: "x", started_at: "x", primary_deleted_at: "x", backup_aging_at: "x", completed_at: "x" }] }],
      ["tenant_deletion_checkpoints", { rows: [{ id: "81000000-0000-4000-8000-000000000001", job_id: "80000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001", workspace_id: "20000000-0000-4000-8000-000000000001", status: "complete", attempt: 0, max_attempts: 3, lease_generation: 0, started_at: "x", completed_at: "x", receipt_hash: "a".repeat(64), exemption_reason: null, exemption_approved: false, reason_code: null, error_code: null, error_fingerprint: null }] }],
      ["tenant_deletion_checkpoint_events", { rows: [{ id: 1, checkpoint_id: "81000000-0000-4000-8000-000000000001", job_id: "80000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000001", status: "complete", attempt: 0, lease_generation: 0, receipt_hash: null, reason_code: null, occurred_at: "x" }] }],
    ]);
    expect(() => validateTenantIntegrity(malformedEvent)).toThrow(/tenant_deletion_checkpoint_events: complete event facts are malformed/);
  });

  it("fails clearly for an unprepared source and exposes all new Auth references", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nosite-unprepared-"));
    temporaryDirectories.push(root);
    const dbPath = path.join(root, "source.db");
    const db = new Database(dbPath);
    db.exec(SCHEMA_SQL);
    db.close();
    expect(() => exportSqliteData({ dbPath, outDir: path.join(root, "export") })).toThrow(/T-028 SQLite preparation is required/);
    expect(authReferenceColumns().get("user_market_access")).toEqual(["user_id", "created_by_user_id"]);
    expect(authReferenceColumns().get("crawl_runs")).toEqual(["created_by_user_id"]);
  });

  it("fails closed for historical rows and missing Auth prerequisites", async () => {
    expect(historicalRowsRequireRestore({ tables: new Map([["tenant_export_jobs", { rows: [{ status: "artifact_created" }] }]]) })).toEqual(["tenant_export_jobs"]);
    expect(historicalRowsRequireRestore({ tables: new Map([
      ["tenant_deletion_jobs", { rows: [{ status: "requested" }] }],
      ["tenant_deletion_checkpoints", { rows: [{ status: "pending" }] }],
    ]) })).toEqual(["tenant_deletion_jobs", "tenant_deletion_checkpoints"]);
    await expect(validateAuthReferences({ unsafe: async () => [] }, { tables: new Map([["tenant_memberships", { rows: [{ auth_identity_id: "90000000-0000-4000-8000-000000000001" }] }]]) })).rejects.toThrow(/Supabase Auth must be restored first/);
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
    const targetSchema = makeTargetSchema(validated);

    expect(() => validateTargetSchema(targetSchema, validated)).not.toThrow();
    expect(targetSchema.get("user_market_access")).toMatchObject({
      physicalPrimaryKey: [],
      uniqueKeys: [{
        columns: ["tenant_id", "workspace_id", "user_id", "market_id"],
        nullsNotDistinct: true,
      }],
    });
    targetSchema.get("user_market_access")!.uniqueKeys[0].nullsNotDistinct = false;
    expect(() => validateTargetSchema(targetSchema, validated)).toThrow(/user_market_access: target lacks the exact unique rowIdentity/);
    targetSchema.get("user_market_access")!.uniqueKeys[0].nullsNotDistinct = true;
    targetSchema.get("place_cache")!.uniqueKeys[0].columns = ["tenant_id", "place_id", "source_card_id"];
    expect(() => validateTargetSchema(targetSchema, validated)).toThrow(/place_cache: target lacks the exact unique rowIdentity/);
    targetSchema.get("place_cache")!.uniqueKeys[0].columns = ["tenant_id", "source_card_id", "place_id"];
    const settings = validated.tables.get("settings")!;
    const settingsContract = TABLE_CONTRACTS.find(({ name }) => name === "settings")!;
    expect(digestRows(settingsContract, settings.rows)).toBe(digestRows(settingsContract, settings.rows));
    targetSchema.delete("ai_feedback_events");
    expect(() => validateTargetSchema(targetSchema, validated)).toThrow(/target table is missing/);
  });

  it("rejects invalid SQLite text for a Postgres JSONB column", () => {
    const contract = TABLE_CONTRACTS.find(({ name }: { name: string }) => name === "crawl_runs")!;
    expect(normalizeValue(contract, "categories", '["dentist"]')).toEqual(["dentist"]);
    expect(() => normalizeValue(contract, "categories", "not-json")).toThrow(/not valid JSON/);
    expect(digestRows(contract, [{ selection_json: '{"z":{"b":2,"a":1},"a":3}' }]))
      .toBe(digestRows(contract, [{ selection_json: { a: 3, z: { a: 1, b: 2 } } }]));
  });

  it("maps SQLite booleans only for boolean PostgreSQL targets", () => {
    const contract = TABLE_CONTRACTS.find(({ name }: { name: string }) => name === "tenant_deletion_checkpoints")!;
    expect(normalizeValue(contract, "required", 1, "boolean")).toBe(true);
    expect(normalizeValue(contract, "required", 0, "boolean")).toBe(false);
    expect(normalizeValue(contract, "required", true, "boolean")).toBe(true);
    expect(normalizeValue(contract, "required", false, "boolean")).toBe(false);
    expect(() => normalizeValue(contract, "required", 2, "boolean")).toThrow(/SQLite 0\/1 or boolean/);
    expect(normalizeValue(contract, "attempt", 1, "integer")).toBe(1);
  });

  it.skipIf(process.env.T029_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "rehearses a two-tenant foundation and historical restore in disposable PostgreSQL16",
    async () => {
      const databaseUrl = process.env.T029_DATABASE_URL;
      expect(databaseUrl).toBeTruthy();
      const parsedUrl = new URL(databaseUrl!);
      expect(["localhost", "127.0.0.1", "::1"]).toContain(parsedUrl.hostname);
      expect(parsedUrl.pathname).toBe("/t029_tenant_foundation_rehearsal");

      const { dbPath, outDir } = createRehearsalSqliteDatabase();
      exportSqliteData({ dbPath, outDir });
      const validated = validateDataExportDirectory(outDir);
      expect(validated.manifest.tableOrder).toHaveLength(37);
      expect(validated.manifest.tables.tenants.rows).toBe(2);
      expect(validated.manifest.tables.tenant_deletion_tombstones.rows).toBe(1);
      expect(validated.manifest.tables.compatibility_backfill_receipts.rows).toBe(1);
      expect(historicalRowsRequireRestore(validated)).toEqual(expect.arrayContaining([
        "tenant_export_jobs",
        "tenant_deletion_jobs",
        "tenant_deletion_checkpoints",
        "tenant_deletion_checkpoint_events",
        "tenant_deletion_tombstones",
        "compatibility_backfill_receipts",
      ]));

      await expect(importSupabaseData({ dir: outDir, databaseUrl, restoreHistorical: false }))
        .rejects.toThrow(/Historical\/stateful rows require --restore-historical/);

      const sql = postgres(databaseUrl!, { ssl: false, prepare: false, max: 1 });
      try {
        await prepareDisposablePostgres(sql);
        await sql.unsafe(`
          ALTER TABLE public.user_market_access
            DROP CONSTRAINT user_market_access_tenant_workspace_user_market_unique;
          ALTER TABLE public.user_market_access
            ADD CONSTRAINT user_market_access_tenant_workspace_user_market_unique
            UNIQUE NULLS NOT DISTINCT (tenant_id, workspace_id, user_id, market_id)
            DEFERRABLE INITIALLY IMMEDIATE;
        `);
        const [deferrableArbiter] = await sql.unsafe(`
          SELECT constraint_record.condeferrable,
                 index_record.indimmediate
            FROM pg_catalog.pg_constraint AS constraint_record
            JOIN pg_catalog.pg_index AS index_record
              ON index_record.indexrelid = constraint_record.conindid
           WHERE constraint_record.conrelid = 'public.user_market_access'::pg_catalog.regclass
             AND constraint_record.conname = 'user_market_access_tenant_workspace_user_market_unique'
        `);
        expect(deferrableArbiter).toEqual({ condeferrable: true, indimmediate: false });
        await expect(importSupabaseData({ dir: outDir, databaseUrl, restoreHistorical: true }))
          .rejects.toThrow(/user_market_access: target lacks the exact unique rowIdentity required by schema 4/);
        await sql.unsafe(`
          ALTER TABLE public.user_market_access
            DROP CONSTRAINT user_market_access_tenant_workspace_user_market_unique;
          ALTER TABLE public.user_market_access
            ADD CONSTRAINT user_market_access_tenant_workspace_user_market_unique
            UNIQUE NULLS NOT DISTINCT (tenant_id, workspace_id, user_id, market_id);
        `);
        await installAdversarialSearchPath(sql);
        const beforeAttempt = await snapshotDisposableTarget(sql, validated);
        const shadowBefore = await snapshotAdversarialShadow(sql);

        const badRoot = fs.mkdtempSync(path.join(os.tmpdir(), "t029-bad-restore-"));
        temporaryDirectories.push(badRoot);
        const badDir = path.join(badRoot, "export");
        fs.cpSync(outDir, badDir, { recursive: true });
        const badFile = path.join(badDir, "tenant_export_jobs.json");
        const badRows = JSON.parse(fs.readFileSync(badFile, "utf8")) as Array<Record<string, unknown>>;
        badRows[0].artifact_storage_ref = "invalid-artifact-ref";
        fs.writeFileSync(badFile, `${JSON.stringify(badRows)}\n`);
        const badManifestPath = path.join(badDir, "manifest.json");
        const badManifest = JSON.parse(fs.readFileSync(badManifestPath, "utf8")) as { tables: Record<string, { rows: number; bytes: number; sha256: string }> };
        refreshManifestEntry(badManifest, "tenant_export_jobs", badFile, badRows);
        fs.writeFileSync(badManifestPath, `${JSON.stringify(badManifest, null, 2)}\n`);

        await expect(importSupabaseData({ dir: badDir, databaseUrl, restoreHistorical: true }))
          .rejects.toThrow(/tenant_export_jobs_artifact_ref_shape_chk/);
        await assertDisposableTriggersEnabled(sql);
        expect(await snapshotDisposableTarget(sql, validated)).toEqual(beforeAttempt);
        expect(await snapshotAdversarialShadow(sql)).toEqual(shadowBefore);

        await importSupabaseData({ dir: outDir, databaseUrl, restoreHistorical: true });
        await assertDisposableRestore(sql, validated);
        expect(await snapshotAdversarialShadow(sql)).toEqual(shadowBefore);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    120_000,
  );
});

function assertLocaleIndependentUniqueKeyOrdering() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nosite-key-order-"));
  temporaryDirectories.push(root);
  const db = new Database(path.join(root, "order.db"));
  try {
    db.exec(`
      CREATE TABLE ordering_probe (id TEXT, alternate TEXT);
      CREATE UNIQUE INDEX "a_key" ON ordering_probe(alternate);
      CREATE UNIQUE INDEX "Z_key" ON ordering_probe(id);
    `);
    const localeCompareDescriptor = Object.getOwnPropertyDescriptor(String.prototype, "localeCompare")!;
    Object.defineProperty(String.prototype, "localeCompare", {
      ...localeCompareDescriptor,
      value: () => { throw new Error("localeCompare must not order recovery metadata"); },
    });
    try {
      expect(loadSqliteUniqueKeyMetadata(db, "ordering_probe").map(({ name }: { name: string }) => name))
        .toEqual(["Z_key", "a_key"]);
    } finally {
      Object.defineProperty(String.prototype, "localeCompare", localeCompareDescriptor);
    }
  } finally {
    db.close();
  }
}

function installAdversarialSqliteIndexDefinitions(dbPath: string) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      DROP INDEX g006r_user_market_access_null_identity;
      DROP INDEX g006r_user_market_access_workspace_identity;
      CREATE UNIQUE INDEX "null ""WHERE"" decoy"
        ON user_market_access(tenant_id, user_id, market_id)
        /* WHERE block-comment decoy */
        WHERE workspace_id /* 'WHERE' predicate decoy */ IS NULL;
      CREATE UNIQUE INDEX \`where\`
        ON user_market_access(tenant_id, workspace_id, user_id, market_id)
        -- WHERE line-comment decoy
        WHERE "workspace_id" IS /* \`WHERE\` predicate decoy */ NOT NULL;
      CREATE UNIQUE INDEX [bracket WHERE decoy]
        ON user_market_access(user_id, market_id)
        WHERE market_id IS NOT NULL;
      CREATE UNIQUE INDEX 'single ''WHERE'' decoy'
        ON user_market_access(workspace_id, market_id)
        WHERE tenant_id IS NOT NULL;
    `);
  } finally {
    db.close();
  }
}

function driftAdversarialSqliteNullIndex(dbPath: string) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      DROP INDEX "null ""WHERE"" decoy";
      CREATE UNIQUE INDEX "null ""WHERE"" decoy"
        ON user_market_access(tenant_id, user_id, market_id)
        /* WHERE block-comment decoy */
        WHERE workspace_id /* 'WHERE' predicate decoy */ IS NULL
          AND tenant_id <> '';
    `);
  } finally {
    db.close();
  }
}

function assertPersistedSqliteIndexStatementRegressions() {
  const terminal = createSyntheticSqliteDatabase();
  appendStoredIndexSql(
    terminal.dbPath,
    "g006r_user_market_access_null_identity",
    "; /* terminal WHERE decoy */ -- WHERE line-comment decoy\n",
  );
  expect(readOnlyIntegrityCheck(terminal.dbPath)).toBe("ok");
  expect(() => verifySqliteDatabase(terminal.dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION)).not.toThrow();
  const terminalManifest = exportSqliteData(terminal);
  expect((terminalManifest.tables as Record<string, { uniqueKeys: Array<{ predicate: string | null }> }>)
    .user_market_access.uniqueKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicate: "workspace_id IS NULL" }),
    ]));

  const malformedSuffixes: Array<[string, RegExp]> = [
    [")", /stored CREATE INDEX has parenthesis underflow/],
    ["(", /stored CREATE INDEX has unbalanced parentheses/],
    [" WHERE workspace_id IS NULL", /stored CREATE INDEX must contain exactly one top-level WHERE/],
    ["; SELECT 1", /stored CREATE INDEX has tokens after its terminal semicolon/],
  ];
  for (const [suffix, expectedError] of malformedSuffixes) {
    const createSql = `CREATE UNIQUE INDEX structural_probe
      ON user_market_access(tenant_id, user_id, market_id)
      WHERE workspace_id IS NULL${suffix}`;
    expect(() => loadSqliteUniqueKeyMetadata(storedIndexMetadataProbe(createSql), "user_market_access"))
      .toThrow(expectedError);
  }

  const forged = createPersistedWrongIndexForgery();
  expect(readOnlyIntegrityCheck(forged.dbPath)).toBe("ok");
  expect(readOnlyNullWorkspaceGrantCount(forged.dbPath)).toBe(2);
  expect(() => exportSqliteData(forged)).toThrow(/stored CREATE INDEX has tokens after its terminal semicolon/);
  expect(() => verifySqliteDatabase(forged.dbPath, TABLE_CONTRACTS, DATA_EXPORT_SCHEMA_VERSION))
    .toThrow(/stored CREATE INDEX has tokens after its terminal semicolon/);
}

function createPersistedWrongIndexForgery() {
  const result = createSyntheticSqliteDatabase();
  const db = new Database(result.dbPath);
  const tenantId = "10000000-0000-4000-8000-000000000001";
  const userId = "90000000-0000-4000-8000-000000000099";
  const marketId = "market-forged-index";
  try {
    db.exec(`
      DROP INDEX g006r_user_market_access_null_identity;
      CREATE UNIQUE INDEX g006r_user_market_access_null_identity
        ON user_market_access(tenant_id, user_id, market_id)
        WHERE workspace_id IS NOT NULL;
    `);
    db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, 'US', ?)")
      .run(marketId, "Forged Index Market", "CO");
    const insertGrant = db.prepare(
      "INSERT INTO user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES (?, NULL, ?, ?)",
    );
    insertGrant.run(tenantId, userId, marketId);
    insertGrant.run(tenantId, userId, marketId);
  } finally {
    db.close();
  }
  appendStoredIndexSql(
    result.dbPath,
    "g006r_user_market_access_null_identity",
    "; WHERE workspace_id IS NULL",
  );
  return result;
}

function appendStoredIndexSql(dbPath: string, indexName: string, suffix: string) {
  const db = new Database(dbPath);
  try {
    db.unsafeMode(true);
    db.pragma("writable_schema = ON");
    const update = db.prepare(`
      UPDATE sqlite_schema
      SET sql = sql || ?
      WHERE type = 'index' AND name = ? AND sql IS NOT NULL
    `).run(suffix, indexName);
    if (update.changes !== 1) throw new Error(`expected one stored index definition for ${indexName}`);
    db.pragma("writable_schema = OFF");
    db.unsafeMode(false);
  } finally {
    db.close();
  }
}

function storedIndexMetadataProbe(createSql: string) {
  return {
    prepare(statement: string) {
      if (statement.startsWith("PRAGMA index_list")) {
        return { all: () => [{ name: "structural_probe", unique: 1, origin: "c", partial: 1 }] };
      }
      if (statement === "SELECT * FROM pragma_index_xinfo(?)") {
        return {
          all: () => [
            { seqno: 0, cid: 0, name: "tenant_id", key: 1 },
            { seqno: 1, cid: 1, name: "user_id", key: 1 },
            { seqno: 2, cid: 2, name: "market_id", key: 1 },
          ],
        };
      }
      if (statement.startsWith("SELECT sql FROM sqlite_schema")) return { get: () => ({ sql: createSql }) };
      throw new Error(`unexpected metadata probe statement: ${statement}`);
    },
  } as unknown as Database.Database;
}

function readOnlyIntegrityCheck(dbPath: string) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return String((db.pragma("integrity_check") as Array<{ integrity_check: string }>)[0]?.integrity_check);
  } finally {
    db.close();
  }
}

function readOnlyNullWorkspaceGrantCount(dbPath: string) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return Number((db.prepare(`
      SELECT COUNT(*) AS count
      FROM user_market_access
      WHERE workspace_id IS NULL AND market_id = 'market-forged-index'
    `).get() as { count: number }).count);
  } finally {
    db.close();
  }
}

function createSyntheticSqliteDatabase({ schema4 = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nosite-data-recovery-"));
  temporaryDirectories.push(root);
  const dbPath = path.join(root, "source.db");
  const outDir = path.join(root, "export");
  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    prepareSqliteCompatibilityBackfill(sqliteAdapter(db));
    if (schema4) installSchema4RecoveryFixture(db);
    db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')").run("10000000-0000-4000-8000-000000000001", "synthetic-tenant", "Synthetic Tenant");
    db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status) VALUES (?, ?, ?, ?, 'active')").run("20000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", "synthetic-workspace", "Synthetic Workspace");
    db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES (?, ?, ?, ?, 'active')").run("30000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000001");
    db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, reason_code, valid_from) VALUES (?, ?, ?, 'owner', 'initial_provisioning', ?)").run("40000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000001", "2026-07-27T00:00:00.000Z");
    db.prepare("INSERT INTO tenant_policies (id, tenant_id) VALUES (?, ?)").run("50000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001");
    db.prepare("UPDATE settings SET openai_api_key_encrypted = ?, google_places_api_key_encrypted = ?, google_maps_browser_api_key_encrypted = ? WHERE id = 1").run("openai-secret", "places-secret", "browser-secret");
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
    const scopedColumns = schema4 ? "tenant_id, " : "";
    const scopedValues = schema4 ? "?, " : "";
    const tenantArgs = schema4 ? ["10000000-0000-4000-8000-000000000001"] : [];
    db.prepare(`INSERT INTO place_cache (${scopedColumns}place_id, raw_json) VALUES (${scopedValues}?, ?)`)
      .run(...tenantArgs, "place-legacy", legacyRawJson);
    if (schema4) {
      db.prepare("INSERT INTO places_master (tenant_id, place_id, name) VALUES (?, ?, ?)")
        .run(tenantArgs[0], "place-legacy", "Legacy Place");
    }
    db.prepare(`INSERT INTO place_observations (id, ${scopedColumns}place_id, endpoint, sku, raw_json) VALUES (?, ${scopedValues}?, ?, ?, ?)`)
      .run("observation-legacy", ...tenantArgs, "place-legacy", "places.details", "details", legacyRawJson);
  } finally {
    db.close();
  }
  return { dbPath, outDir };
}

function installSchema4RecoveryFixture(db: Database.Database) {
  db.exec(`
    DROP TABLE user_market_access;
    CREATE TABLE user_market_access (
      user_id TEXT NOT NULL,
      market_id TEXT NOT NULL REFERENCES location_markets(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_user_id TEXT,
      tenant_id TEXT,
      workspace_id TEXT
    );
  `);
  for (const table of ["place_cache", "places_master", "place_observations", "api_usage_events"]) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN source_card_id TEXT NOT NULL DEFAULT 'google_places_legacy'`);
  }
  db.exec(`
    CREATE UNIQUE INDEX g006r_user_market_access_null_identity
      ON user_market_access(tenant_id, user_id, market_id)
      WHERE workspace_id IS NULL;
    CREATE UNIQUE INDEX g006r_user_market_access_workspace_identity
      ON user_market_access(tenant_id, workspace_id, user_id, market_id)
      WHERE workspace_id IS NOT NULL;
    CREATE UNIQUE INDEX g006r_place_cache_identity
      ON place_cache(tenant_id, source_card_id, place_id);
    CREATE UNIQUE INDEX g006r_places_master_identity
      ON places_master(tenant_id, source_card_id, place_id);
    CREATE UNIQUE INDEX g006r_place_observations_identity
      ON place_observations(tenant_id, source_card_id, id);
    CREATE UNIQUE INDEX g006r_api_usage_events_identity
      ON api_usage_events(tenant_id, source_card_id, id);
  `);
}

function createRehearsalSqliteDatabase() {
  const result = createSyntheticSqliteDatabase();
  const db = new Database(result.dbPath);
  const tenantA = "10000000-0000-4000-8000-000000000001";
  const workspaceA = "20000000-0000-4000-8000-000000000001";
  const membershipA = "30000000-0000-4000-8000-000000000001";
  const authA = "90000000-0000-4000-8000-000000000001";
  const tenantB = "10000000-0000-4000-8000-000000000002";
  const workspaceB = "20000000-0000-4000-8000-000000000002";
  const membershipB = "30000000-0000-4000-8000-000000000002";
  const authB = "90000000-0000-4000-8000-000000000002";
  const supportAuth = "90000000-0000-4000-8000-000000000003";
  const policyHash = "a".repeat(64);
  const fixedCreatedAt = "2026-07-27T00:00:00.000Z";
  const hash = "b".repeat(64);
  try {
    db.pragma("foreign_keys = ON");
    db.exec("DROP TRIGGER IF EXISTS trg_novatrade_tenant_policies_guard");
    db.prepare("UPDATE tenant_policies SET compatibility_policy_hash = ?, ai_processing_enabled = 1, require_knowledge_review = 0 WHERE id = ?").run(policyHash, "50000000-0000-4000-8000-000000000001");
    db.exec(SCHEMA_SQL);
    insertRow(db, "location_markets", { id: "market-colorado", name: "Colorado", country_code: "US", admin_area1: "CO", created_at: fixedCreatedAt, updated_at: fixedCreatedAt });
    insertRow(db, "tenant_memberships", { id: "30000000-0000-4000-8000-000000000003", tenant_id: tenantA, auth_identity_id: supportAuth, workspace_id: null, status: "active", created_at: fixedCreatedAt, updated_at: fixedCreatedAt });
    insertRow(db, "user_market_access", { tenant_id: tenantA, workspace_id: null, user_id: supportAuth, market_id: "market-colorado", created_at: fixedCreatedAt });
    insertRow(db, "tenants", { id: tenantB, slug: "synthetic-tenant-b", name: "Synthetic Tenant B", status: "active", created_at: fixedCreatedAt, updated_at: fixedCreatedAt });
    insertRow(db, "workspaces", { id: workspaceB, tenant_id: tenantB, slug: "synthetic-workspace-b", name: "Synthetic Workspace B", status: "active", created_at: fixedCreatedAt, updated_at: fixedCreatedAt });
    insertRow(db, "tenant_memberships", { id: membershipB, tenant_id: tenantB, auth_identity_id: authB, workspace_id: workspaceB, status: "active", created_at: fixedCreatedAt, updated_at: fixedCreatedAt });
    insertRow(db, "tenant_role_bindings", { id: "40000000-0000-4000-8000-000000000002", tenant_id: tenantB, membership_id: membershipB, role: "owner", reason_code: "initial_provisioning", created_at: fixedCreatedAt, valid_from: fixedCreatedAt });
    insertRow(db, "tenant_policies", { id: "50000000-0000-4000-8000-000000000002", tenant_id: tenantB, compatibility_policy_hash: "c".repeat(64), created_at: fixedCreatedAt, updated_at: fixedCreatedAt });

    const grantId = "60000000-0000-4000-8000-000000000001";
    db.exec("BEGIN");
    try {
      insertRow(db, "support_access_grants", {
        id: grantId, tenant_id: tenantA, workspace_id: workspaceA, support_actor_auth_identity_id: supportAuth,
        requested_by_auth_identity_id: authA, state: "pending", reason_code: "fixture-review", reason: "recovery rehearsal",
        starts_at: fixedCreatedAt, expires_at: "2026-07-28T00:00:00.000Z", correlation_id: "t029-support-1",
        audit_event_id: "70000000-0000-4000-8000-000000000001", permission_anchor: "tenant:read", data_class_anchor: "tenant_metadata",
        created_at: fixedCreatedAt, updated_at: fixedCreatedAt,
      });
      insertRow(db, "support_access_grant_permissions", { grant_id: grantId, permission: "tenant:read" });
      insertRow(db, "support_access_grant_data_classes", { grant_id: grantId, data_class: "tenant_metadata" });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?")
      .run(authA, "2026-07-27T00:00:30.000Z", grantId);
    db.prepare("UPDATE tenant_role_bindings SET revoked_at = ? WHERE id = ?")
      .run("2026-07-27T01:00:00.000Z", "40000000-0000-4000-8000-000000000001");

    db.exec("DROP TRIGGER IF EXISTS trg_novatrade_tenant_export_jobs_scope_guard");
    insertRow(db, "tenant_export_jobs", {
      id: "70000000-0000-4000-8000-000000000002", tenant_id: tenantA, workspace_id: workspaceA, requester_auth_identity_id: authA,
      requester_membership_id: membershipA, status: "artifact_created", scope_hash: hash, input_hash: hash, idempotency_key_hash: "d".repeat(64),
      policy_version: "v1.0.0", manifest_version: "3", schema_version: "3", requested_format: "package",
      snapshot_at: "2026-07-27T00:01:00.000Z", artifact_storage_ref: `tenants/${tenantA}/exports/70000000-0000-4000-8000-000000000002/package`, artifact_checksum_sha256: hash,
      included_count: 2, excluded_count: 0, redacted_count: 1, artifact_created_at: "2026-07-27T00:02:00.000Z", expires_at: "2026-07-28T00:02:00.000Z",
      correlation_id: "t029-export-1", audit_event_id: "70000000-0000-4000-8000-000000000003", created_at: fixedCreatedAt, updated_at: "2026-07-27T00:02:00.000Z",
    });

    const deletionJobId = "80000000-0000-4000-8000-000000000001";
    for (const trigger of ["trg_novatrade_tenant_deletion_jobs_insert_guard", "trg_novatrade_tenant_deletion_jobs_clock_on_insert", "trg_novatrade_tenant_deletion_checkpoints_insert_guard", "trg_novatrade_tenant_deletion_checkpoint_events_insert_guard", "trg_novatrade_tenant_deletion_tombstones_insert_guard"]) {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    insertRow(db, "tenant_deletion_jobs", {
      id: deletionJobId, tenant_id: tenantA, workspace_id: workspaceA, scope_kind: "workspace", scope_selector_hash: hash,
      requested_by_auth_identity_id: authA, requested_by_membership_id: membershipA, verified_by_auth_identity_id: authA,
      verified_by_membership_id: membershipA, verified_at: "2026-07-27T00:03:00.000Z", approved_by_auth_identity_id: authA,
      approved_by_membership_id: membershipA, approved_at: "2026-07-27T00:04:00.000Z", status: "completed", policy_version: "v1.0.0",
      policy_snapshot_hash: hash, input_hash: hash, idempotency_key_hash: "e".repeat(64), correlation_id: "t029-delete-1",
      audit_event_id: "80000000-0000-4000-8000-000000000002", created_at: fixedCreatedAt, updated_at: "2026-07-27T00:10:00.000Z",
      scheduled_at: "2026-07-27T00:05:00.000Z", started_at: "2026-07-27T00:06:00.000Z", primary_deleted_at: "2026-07-27T00:08:00.000Z",
      backup_aging_at: "2026-07-27T00:09:00.000Z", completed_at: "2026-07-27T00:10:00.000Z", backup_expiry_target_at: "2026-07-28T00:08:00.000Z",
    });
    const stores = ["cache_idempotency", "search_embeddings", "queues_leases", "agent_context", "extracted_derivatives_previews_scanner", "object_quarantine_storage", "primary_database_negative_verification", "provider_external_copy_requests", "logs_telemetry_aggregates", "backup_aging"];
    for (const [index, storeClass] of stores.entries()) {
      insertRow(db, "tenant_deletion_checkpoints", {
        id: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, job_id: deletionJobId, tenant_id: tenantA, workspace_id: workspaceA,
        store_class: storeClass, required: 1, status: "complete", attempt: 0, max_attempts: 3, opaque_target_hash: hash,
        receipt_hash: hash, started_at: "2026-07-27T00:06:00.000Z", completed_at: "2026-07-27T00:07:00.000Z", updated_at: "2026-07-27T00:07:00.000Z",
      });
    }
    insertRow(db, "tenant_deletion_checkpoint_events", {
      id: 1, checkpoint_id: "81000000-0000-4000-8000-000000000001", tenant_id: tenantA, job_id: deletionJobId,
      status: "running", attempt: 0, lease_generation: 0, receipt_hash: null, reason_code: null, occurred_at: "2026-07-27T00:06:30.000Z",
    });
    insertRow(db, "tenant_deletion_checkpoint_events", {
      id: 2, checkpoint_id: "81000000-0000-4000-8000-000000000001", tenant_id: tenantA, job_id: deletionJobId,
      status: "complete", attempt: 0, lease_generation: 0, receipt_hash: hash, reason_code: null, occurred_at: "2026-07-27T00:07:00.000Z",
    });
    insertRow(db, "tenant_deletion_tombstones", {
      id: "82000000-0000-4000-8000-000000000001", job_id: deletionJobId, tenant_id: tenantA, workspace_id: workspaceA,
      scope_selector_hash: hash, tenant_identity_hash: "f".repeat(64), policy_version: "v1.0.0", retention_until: "2033-07-27T00:00:00.000Z", created_at: fixedCreatedAt,
    });
    db.exec(SCHEMA_SQL);

    const receiptId = "83000000-0000-4000-8000-000000000001";
    const receipt = {
      receiptId, idempotencyKey: "t029-sqlite-rehearsal", schemaVersion: 1, sourceEngine: "sqlite",
      checksumAlgorithm: "novatrade-sqlite-canonical-json-v1", manifestHash: hash, sourceSnapshotFingerprint: hash,
      tenantId: tenantA, workspaceId: workspaceA, ownerAuthIdentityId: authA, policyId: "50000000-0000-4000-8000-000000000001",
      policyVersion: 1, policyHash, userCount: 0, tableCounts: {}, beforeContentChecksums: {}, afterContentChecksums: {}, relationshipOrphanCount: 0, status: "completed",
    };
    insertRow(db, "compatibility_backfill_receipts", {
      id: receiptId, idempotency_key: receipt.idempotencyKey, schema_version: 1, source_engine: receipt.sourceEngine, checksum_algorithm: receipt.checksumAlgorithm,
      manifest_hash: hash, source_snapshot_fingerprint: hash, tenant_id: tenantA, workspace_id: workspaceA, owner_auth_identity_id: authA,
      policy_id: receipt.policyId, policy_version: 1, policy_hash: policyHash, user_count: 0, table_counts_json: "{}", before_checksums_json: "{}",
      after_checksums_json: "{}", relationship_orphan_count: 0, status: "completed", receipt_json: JSON.stringify(receipt), created_at: fixedCreatedAt, completed_at: fixedCreatedAt,
    });
    const foreignKeyProblems = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyProblems.length > 0) throw new Error("T-029 fixture foreign_key_check is not empty");
    const expectedTriggers = [
      "trg_novatrade_tenant_export_jobs_scope_guard", "trg_novatrade_tenant_deletion_jobs_insert_guard",
      "trg_novatrade_tenant_deletion_checkpoints_insert_guard", "trg_novatrade_tenant_deletion_checkpoint_events_insert_guard",
      "trg_novatrade_tenant_deletion_tombstones_insert_guard", "trg_t028_compatibility_receipt_binding",
    ];
    const presentTriggers = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>).map((row) => row.name));
    for (const trigger of expectedTriggers) if (!presentTriggers.has(trigger)) throw new Error(`T-029 fixture trigger missing: ${trigger}`);
  } finally {
    db.close();
  }
  return result;
}

function insertRow(db: Database.Database, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(...columns.map((column) => row[column]));
}

async function prepareDisposablePostgres(sql: ReturnType<typeof postgres>) {
  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  await sql.unsafe("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)");
  await sql.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.worker_runs (
      id text PRIMARY KEY,
      worker_name text NOT NULL,
      status text NOT NULL DEFAULT 'running',
      trigger_source text NOT NULL DEFAULT 'unknown',
      http_status integer,
      result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      error text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const skippedMigrations = new Set([
    "20260514161714_supabase_ai_verification_cron.sql",
    "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
  ]);
  const migrations = fs.readdirSync(path.resolve("supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let appliedMigrations = 0;
  for (const migration of migrations) {
    if (skippedMigrations.has(migration)) continue;
    await sql.unsafe(fs.readFileSync(path.join("supabase/migrations", migration), "utf8"));
    appliedMigrations += 1;
    if (migration === "202605110001_full_schema.sql") {
      await sql.unsafe(`
        ALTER TABLE public.settings
          ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1
      `);
      await sql.unsafe(`
        ALTER TABLE public.leads
          ADD COLUMN IF NOT EXISTS ai_website_feedback_status text,
          ADD COLUMN IF NOT EXISTS ai_corrected_website_url text,
          ADD COLUMN IF NOT EXISTS ai_false_positive_reason text,
          ADD COLUMN IF NOT EXISTS ai_reviewer_notes text,
          ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz
      `);
    }
  }
  expect(migrations).toHaveLength(55);
  expect(appliedMigrations).toBe(53);
  expect(skippedMigrations.size).toBe(2);
  console.log("T-029 portable PG16 migration replay: applied=53, skipped=2 (pg_net/pg_cron/Vault runtime migrations)");
  const extensions = await sql.unsafe("SELECT extname FROM pg_catalog.pg_extension WHERE extname IN ('pgcrypto', 'pg_net', 'pg_cron')");
  expect(extensions).toEqual([]);
  await sql.unsafe("INSERT INTO auth.users (id) VALUES ('90000000-0000-4000-8000-000000000001'), ('90000000-0000-4000-8000-000000000002'), ('90000000-0000-4000-8000-000000000003') ON CONFLICT DO NOTHING");
}

async function installAdversarialSearchPath(sql: ReturnType<typeof postgres>) {
  const shadowSchema = "t029_shadow";
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS \"${shadowSchema}\"`);
  for (const table of TABLE_NAMES) {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS \"${shadowSchema}\".\"${table}\" (LIKE public.\"${table}\" INCLUDING ALL)`);
  }
  await sql.unsafe(`CREATE SEQUENCE IF NOT EXISTS \"${shadowSchema}\".\"tenant_deletion_checkpoint_events_id_seq\" START WITH 700000`);
  await sql.unsafe(`ALTER DATABASE \"t029_tenant_foundation_rehearsal\" SET search_path TO \"${shadowSchema}\", public`);
  await sql.unsafe(`SET search_path TO \"${shadowSchema}\", public`);
}

async function snapshotAdversarialShadow(sql: ReturnType<typeof postgres>) {
  const counts: Record<string, number> = {};
  for (const table of TABLE_NAMES) {
    const rows = await sql.unsafe(`SELECT count(*)::integer AS count FROM \"t029_shadow\".\"${table}\"`);
    counts[table] = Number(rows[0].count);
  }
  const sequence = await sql.unsafe("SELECT last_value, is_called FROM \"t029_shadow\".\"tenant_deletion_checkpoint_events_id_seq\"");
  return { counts, sequence };
}

async function assertDisposableRestore(sql: ReturnType<typeof postgres>, validated: ReturnType<typeof validateDataExportDirectory>) {
  const current = await sql.unsafe("SELECT current_database() AS name");
  expect(current[0].name).toBe("t029_tenant_foundation_rehearsal");
  const policyFlags = await sql.unsafe("SELECT tenant_id, ai_processing_enabled, require_knowledge_review FROM public.tenant_policies ORDER BY tenant_id");
  expect(policyFlags).toEqual([
    { tenant_id: "10000000-0000-4000-8000-000000000001", ai_processing_enabled: true, require_knowledge_review: false },
    { tenant_id: "10000000-0000-4000-8000-000000000002", ai_processing_enabled: false, require_knowledge_review: true },
  ]);
  const grants = await sql.unsafe("SELECT tenant_id::text, workspace_id::text, user_id, market_id FROM public.user_market_access ORDER BY tenant_id, workspace_id NULLS FIRST, user_id, market_id");
  expect(grants).toContainEqual({
    tenant_id: "10000000-0000-4000-8000-000000000001",
    workspace_id: null,
    user_id: "90000000-0000-4000-8000-000000000003",
    market_id: "market-colorado",
  });
  for (const table of validated.manifest.tableOrder) {
    const rows = await sql.unsafe(`SELECT count(*)::integer AS count FROM public.\"${table}\"`);
    const expectedRows = validated.manifest.tables[table].rows;
    if (["location_markets", "location_cells"].includes(table)) {
      expect(Number(rows[0].count), table).toBeGreaterThanOrEqual(expectedRows);
    } else {
      expect(Number(rows[0].count), table).toBe(expectedRows);
    }
  }
  const receiptTypes = await sql.unsafe(`
    SELECT jsonb_typeof(table_counts) AS table_counts_type,
           jsonb_typeof(before_content_checksums) AS before_checksums_type,
           jsonb_typeof(after_content_checksums) AS after_checksums_type,
           jsonb_typeof(receipt) AS receipt_type
      FROM public.compatibility_backfill_receipts
  `);
  expect(receiptTypes).toEqual([{
    table_counts_type: "object",
    before_checksums_type: "object",
    after_checksums_type: "object",
    receipt_type: "object",
  }]);
  const legacyJson = await sql.unsafe(`
    SELECT raw_json->'__nositeCache'->>'schemaVersion' AS schema_version,
           raw_json ? 'reviews' AS has_top_level_reviews,
           raw_json->'nested' ? 'reviews' AS has_nested_reviews
      FROM public.place_cache
     WHERE place_id = 'place-legacy'
  `);
  expect(legacyJson).toEqual([{ schema_version: "1", has_top_level_reviews: false, has_nested_reviews: false }]);
  const maxEventId = Number((await sql.unsafe("SELECT COALESCE(max(id), 0)::bigint AS max_id FROM public.tenant_deletion_checkpoint_events"))[0].max_id);
  const sequence = await sql.unsafe("SELECT last_value, is_called FROM public.\"tenant_deletion_checkpoint_events_id_seq\"");
  expect(sequence).toHaveLength(1);
  expect(Number(sequence[0].last_value)).toBe(maxEventId + 1);
  expect(sequence[0].is_called).toBe(false);
  const generated = await sql.unsafe(`
    INSERT INTO public.tenant_deletion_checkpoint_events
      (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash)
    VALUES ('81000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'complete', 0, 0, '${"b".repeat(64)}')
    RETURNING id
  `);
  expect(Number(generated[0].id)).toBeGreaterThan(maxEventId);
  await assertDisposableTriggersEnabled(sql);
}

async function snapshotDisposableTarget(sql: ReturnType<typeof postgres>, validated: ReturnType<typeof validateDataExportDirectory>) {
  const snapshot: Record<string, { count: number; digest: string }> = {};
  for (const table of validated.manifest.tableOrder) {
    const rows = await sql.unsafe(`SELECT * FROM public.\"${table}\"`);
    snapshot[table] = { count: rows.length, digest: sha256(JSON.stringify(rows)) };
  }
  const sequence = await sql.unsafe("SELECT last_value, is_called FROM public.\"tenant_deletion_checkpoint_events_id_seq\"");
  snapshot.identitySequence = { count: sequence.length, digest: sha256(JSON.stringify(sequence)) };
  return snapshot;
}

async function assertDisposableTriggersEnabled(sql: ReturnType<typeof postgres>) {
  const rows = await sql.unsafe("SELECT c.relname AS table_name, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal AND t.tgname LIKE 'trg_novatrade_%'");
  const guards = new Map(rows.map((row) => [`${row.table_name}:${row.tgname}`, row.tgenabled]));
  for (const [table, names] of Object.entries({
    support_access_grants: ["trg_novatrade_support_access_grants_validate"],
    support_access_grant_permissions: ["trg_novatrade_support_access_grant_permissions_guard"],
    support_access_grant_data_classes: ["trg_novatrade_support_access_grant_data_classes_guard"],
    tenant_export_jobs: ["trg_novatrade_tenant_export_jobs_guard_and_touch"],
    tenant_deletion_jobs: ["trg_novatrade_tenant_deletion_jobs_insert_guard", "trg_novatrade_tenant_deletion_jobs_guard_and_touch"],
    tenant_deletion_checkpoints: ["trg_novatrade_tenant_deletion_checkpoints_insert_guard", "trg_novatrade_tenant_deletion_checkpoints_guard"],
    tenant_deletion_checkpoint_events: ["trg_novatrade_tenant_deletion_checkpoint_events_insert_guard"],
    tenant_deletion_tombstones: ["trg_novatrade_tenant_deletion_tombstones_insert_guard"],
    compatibility_backfill_receipts: ["trg_novatrade_compatibility_backfill_receipt_guard"],
  })) {
    for (const name of names) expect(guards.get(`${table}:${name}`), `${table}:${name}`).toBe("O");
  }
}

type SqliteAdapter = {
  all: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => readonly T[];
  get: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => T | undefined;
  run: (sql: string, params?: readonly unknown[]) => { changes: number };
  transaction: <T>(work: (tx: SqliteAdapter) => T, mode?: "deferred" | "immediate") => T;
};

function sqliteAdapter(db: Database.Database): SqliteAdapter {
  return {
    all: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
    run: (sql: string, params: readonly unknown[] = []) => db.prepare(sql).run(...params) as { changes: number },
    transaction: <T>(work: (tx: ReturnType<typeof sqliteAdapter>) => T, mode?: "deferred" | "immediate") => {
      db.exec(mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const result = work(sqliteAdapter(db));
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function makeTargetSchema(validated: ReturnType<typeof validateDataExportDirectory>) {
  return new Map(validated.contracts.map((contract) => {
    const exported = validated.tables.get(contract.name)!;
    const columns = new Map([
      ...exported.columns.map((column: string) => [targetColumn(contract, column), contract.jsonbColumns.includes(column) ? "jsonb" : "text"]),
      ...contract.excludedColumns.map((column: string) => [column, "text"]),
      ...contract.jsonbColumns.map((column: string) => [targetColumn(contract, column), "jsonb"]),
    ]);
    const tableManifest = validated.manifest.tables[contract.name];
    const physicalPrimaryKey = validated.manifest.schemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION
      ? [...contract.physicalPrimaryKey]
      : [...tableManifest.physicalPrimaryKey];
    const uniqueKeys = sameStringArray(physicalPrimaryKey, contract.rowIdentity)
      ? []
      : [{
        columns: [...contract.rowIdentity],
        nullsNotDistinct: contract.nullableIdentityColumns.length > 0,
      }];
    return [contract.name, { columns, physicalPrimaryKey, uniqueKeys }];
  }));
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function refreshManifestEntry(manifest: { tables: Record<string, { rows: number; bytes: number; sha256: string }> }, table: string, filePath: string, rows: unknown[]) {
  const payload = fs.readFileSync(filePath);
  manifest.tables[table].rows = rows.length;
  manifest.tables[table].bytes = payload.byteLength;
  manifest.tables[table].sha256 = sha256(payload);
}
