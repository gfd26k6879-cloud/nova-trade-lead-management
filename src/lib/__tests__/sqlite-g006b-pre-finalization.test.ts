import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  canonicalizeSqliteG006bRecord,
  computeSqliteG006bArchiveTreeHash,
  createSqliteG006bTestBoundary,
  inspectSqliteG006bPreFinalizationEvidence,
  runSqliteG006bPreFinalization,
  type SqliteG006bPreFinalizationInput,
} from "@/lib/db/sqlite-g006b-pre-finalization";
import { classifySqliteSchemaV1 } from "@/lib/db/sqlite-schema-coordinator";
import {
  COMPATIBILITY_TENANT_TABLES,
  SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
  SQLITE_COMPATIBILITY_SOURCE_ENGINE,
  compatibilityContentChecksum,
  prepareSqliteCompatibilityBackfill,
  runSqliteCompatibilityBackfill,
  type CompatibilityBackfillManifest,
  type CompatibilityUserMapping,
  type SqliteBackfillDb,
} from "@/lib/tenancy/compatibility-backfill";
import { createLegacyWebsiteLeadPlaySeed } from "@/lib/tenancy/compatibility-play";
import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";
import { LEGACY_DATA_EXPORT_SCHEMA_VERSION } from "../../../scripts/data-transfer-contract.mjs";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000101";
const OWNER_AUTH_ID = "20000000-0000-4000-8000-000000000101";
const RESEARCHER_AUTH_ID = "20000000-0000-4000-8000-000000000102";
const DISABLED_AUTH_ID = "20000000-0000-4000-8000-000000000103";
const POLICY_HASH = "b".repeat(64);
const PUBLISHER = resolve("scripts/g006b-windows-durable-publish.ps1");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function adapter(db: Database.Database): SqliteBackfillDb {
  const value: SqliteBackfillDb = {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
    run: (sql: string, params: readonly unknown[] = []) => db.prepare(sql).run(...params),
    transaction: <T>(work: (tx: SqliteBackfillDb) => T, mode?: "deferred" | "immediate") => {
      if (mode === "immediate") {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = work(value);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      return db.transaction(() => work(value))();
    },
  };
  return value;
}

function seedLegacyRows(db: Database.Database): void {
  db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES ('market-a', 'Market A', 'US', 'CO')").run();
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-owner', ?, 'owner@example.test', 'admin', 'active')").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-researcher', ?, 'researcher@example.test', 'researcher', 'active')").run(RESEARCHER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-disabled', ?, 'disabled@example.test', 'researcher', 'disabled')").run(DISABLED_AUTH_ID);
  db.prepare("UPDATE app_users SET created_by=?, team_lead_user_id=? WHERE id='legacy-researcher'").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO user_market_access (user_id, market_id, created_by_user_id) VALUES (?, 'market-a', ?)").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_runs (id, categories, status, created_by_user_id) VALUES ('run-1', '[]', 'done', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_units (id, crawl_run_id, zip, category) VALUES ('unit-1', 'run-1', '80202', 'industrial')").run();
  db.prepare("INSERT INTO leads (id, place_id, name, assigned_to_user_id) VALUES ('lead-1', 'place-1', 'Synthetic Materials Co', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO lead_notes (id, lead_id, author_user_id, body) VALUES ('note-1', 'lead-1', ?, 'synthetic note')").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO outreach_events (id, lead_id, channel, actor_user_id) VALUES ('outreach-1', 'lead-1', 'call', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO admin_requests (id, lead_id, request_type, created_by_user_id, assigned_admin_user_id) VALUES ('request-1', 'lead-1', 'quote_request', ?, ?)").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO demos (id, lead_id, slug, published_by_user_id) VALUES ('demo-1', 'lead-1', 'synthetic-demo', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO place_cache (place_id, raw_json) VALUES ('place-1', '{}')").run();
  db.prepare("INSERT INTO places_master (place_id, name) VALUES ('place-1', 'Synthetic Materials Co')").run();
  db.prepare("INSERT INTO place_observations (id, place_id, endpoint, sku, raw_json) VALUES ('observation-1', 'place-1', 'details', 'places-details', '{}')").run();
  db.prepare("INSERT INTO api_usage_events (id, endpoint, sku) VALUES ('api-1', 'details', 'places-details')").run();
  db.prepare("INSERT INTO audit_logs (id, action) VALUES ('audit-1', 't028.rehearsal')").run();
}

function users(): readonly CompatibilityUserMapping[] {
  return [
    { legacyUserId: "legacy-owner", authIdentityId: OWNER_AUTH_ID, expectedEmail: "owner@example.test", expectedLegacyRole: "admin", expectedStatus: "active", membershipId: "30000000-0000-4000-8000-000000000101", workspaceId: WORKSPACE_ID, membershipRole: "owner", membershipStatus: "active", roleBindingId: "40000000-0000-4000-8000-000000000101", marketAccessIds: ["market-a"] },
    { legacyUserId: "legacy-researcher", authIdentityId: RESEARCHER_AUTH_ID, expectedEmail: "researcher@example.test", expectedLegacyRole: "researcher", expectedStatus: "active", membershipId: "30000000-0000-4000-8000-000000000102", workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "active", roleBindingId: "40000000-0000-4000-8000-000000000102", marketAccessIds: [] },
    { legacyUserId: "legacy-disabled", authIdentityId: DISABLED_AUTH_ID, expectedEmail: "disabled@example.test", expectedLegacyRole: "researcher", expectedStatus: "disabled", membershipId: "30000000-0000-4000-8000-000000000103", workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "suspended", roleBindingId: "40000000-0000-4000-8000-000000000103", marketAccessIds: [] },
  ];
}

function manifestFor(db: Database.Database): CompatibilityBackfillManifest {
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g006b-synthetic-v1",
    sourceSnapshotFingerprint: "a".repeat(64),
    tenantId: TENANT_ID,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: "50000000-0000-4000-8000-000000000101",
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers: users(),
    legacyTables: COMPATIBILITY_TENANT_TABLES.map((table) => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      return { table, rowCount: rows.length, contentChecksum: compatibilityContentChecksum(rows) };
    }),
  };
}

function createAcceptedFixture(): { root: string; databasePath: string; manifest: CompatibilityBackfillManifest } {
  const root = mkdtempSync(join(tmpdir(), "g006b-b1-"));
  roots.push(root);
  const databasePath = join(root, "accepted-legacy.db");
  const db = new Database(databasePath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    seedLegacyRows(db);
    prepareSqliteCompatibilityBackfill(adapter(db));
    const manifest = manifestFor(db);
    runSqliteCompatibilityBackfill(adapter(db), manifest);
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    return { root, databasePath, manifest };
  } finally {
    db.close();
  }
}

function previewArchiveTree(root: string, databasePath: string, backupPath: string): string {
  const preview = join(root, "archive-preview");
  exportSqliteData({ dbPath: databasePath, outDir: preview, schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION });
  const manifestPath = join(preview, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exportedAt: string; source: { file: string } };
  manifest.exportedAt = "1970-01-01T00:00:00.000Z";
  manifest.source.file = basename(backupPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = computeSqliteG006bArchiveTreeHash(preview);
  rmSync(preview, { recursive: true });
  return hash;
}

function operationInput(fixture: ReturnType<typeof createAcceptedFixture>): SqliteG006bPreFinalizationInput {
  const seed = createLegacyWebsiteLeadPlaySeed();
  const inspection = inspectSqliteG006bPreFinalizationEvidence({
    databasePath: fixture.databasePath,
    publisherScriptPath: PUBLISHER,
    manifest: fixture.manifest,
    seed,
  });
  const backupPath = join(fixture.root, "accepted-legacy.g006b.backup.db");
  const treeHash = previewArchiveTree(fixture.root, fixture.databasePath, backupPath);
  return {
    mode: "execute",
    operationId: "synthetic-b1",
    databasePath: fixture.databasePath,
    lockPath: `${fixture.databasePath}.g006b.lock`,
    backupTemporaryPath: `${backupPath}.g006b.tmp.synthetic-b1`,
    backupPath,
    archiveStagingDirectory: join(fixture.root, "archive-staging"),
    archiveDirectory: join(fixture.root, treeHash),
    preparedTemporaryPath: join(fixture.root, "prepared.json.g006b.tmp.synthetic-b1"),
    preparedPath: join(fixture.root, "prepared.json"),
    committedTemporaryPath: join(fixture.root, "committed.json.g006b.tmp.synthetic-b1"),
    committedPath: join(fixture.root, "committed.json"),
    publisherScriptPath: PUBLISHER,
    publisherSha256: inspection.publisherSha256,
    manifest: fixture.manifest,
    seed,
    expectedSourceIdentity: inspection.sourceIdentity,
    expectedAcceptedPhysicalManifestDigest: inspection.acceptedPhysicalManifestDigest,
    expectedReceiptRowSha256: inspection.receiptRowSha256,
    expectedBindingId: inspection.bindingId,
    expectedConfigurationHash: inspection.configurationHash,
    expectedPreservationAggregateSha256: inspection.preservationAggregateSha256,
  };
}

describe("G-006B B1 SQLite pre-finalization", () => {
  it("uses strict recursive canonical JSON with UTF-16 key order and integer-only outer numbers", () => {
    expect(canonicalizeSqliteG006bRecord({ z: 1, A: [true, null], text: "ok" })).toBe('{"A":[true,null],"text":"ok","z":1}');
    expect(() => canonicalizeSqliteG006bRecord({ unsafe: 0.55 })).toThrow(/safe integer/);
    expect(() => canonicalizeSqliteG006bRecord({ negativeZero: -0 })).toThrow(/safe integer/);
    expect(() => canonicalizeSqliteG006bRecord({ lone: "\ud800" })).toThrow(/lone surrogate/);
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => { getterCalls += 1; return 1; } });
    expect(() => canonicalizeSqliteG006bRecord(accessor)).toThrow(/data property/);
    expect(getterCalls).toBe(0);
    expect(() => canonicalizeSqliteG006bRecord(new Proxy({ value: 1 }, {}))).toThrow(/canonical JSON/);
    expect(() => canonicalizeSqliteG006bRecord({ missing: undefined })).toThrow(/canonical JSON/);
  });

  it("publishes PREPARED before mutation, resumes exact pre-state, and replays exact committed post-state", async () => {
    const fixture = createAcceptedFixture();
    const base = operationInput(fixture);
    const interrupted = { ...base, testBoundary: createSqliteG006bTestBoundary("after-prepared-publish") };
    await expect(runSqliteG006bPreFinalization(interrupted)).rejects.toThrow(/simulated crash after prepared publication/);

    const beforeResume = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(beforeResume).kind).toBe("accepted-legacy");
    beforeResume.close();

    const exactPreparedBytes = readFileSync(base.preparedPath);
    writeFileSync(base.preparedPath, Buffer.concat([exactPreparedBytes, Buffer.from("\n")]));
    await expect(runSqliteG006bPreFinalization({ ...base, mode: "resume" })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    writeFileSync(base.preparedPath, exactPreparedBytes);

    const exactBackupBytes = readFileSync(base.backupPath);
    writeFileSync(base.backupPath, Buffer.concat([exactBackupBytes, Buffer.from([0])]));
    await expect(runSqliteG006bPreFinalization({ ...base, mode: "resume" })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    writeFileSync(base.backupPath, exactBackupBytes);

    const writerFault = {
      ...base,
      mode: "resume" as const,
      testBoundary: createSqliteG006bTestBoundary("writer-primary-and-rollback-sentinel"),
    };
    await expect(runSqliteG006bPreFinalization(writerFault)).rejects.toMatchObject({
      code: "G006B_EVIDENCE_DRIFT",
      cleanupFailures: ["writer rollback: simulated cleanup sentinel"],
    });

    const committedFault = {
      ...base,
      mode: "resume" as const,
      testBoundary: createSqliteG006bTestBoundary("after-database-commit"),
    };
    await expect(runSqliteG006bPreFinalization(committedFault)).rejects.toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
    });
    expect(() => readFileSync(base.committedPath)).toThrow();

    const resumed = await runSqliteG006bPreFinalization({ ...base, mode: "resume" });
    expect(resumed.status).toBe("committed");
    const post = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(post)).toMatchObject({ kind: "prepared-legacy", userVersion: 6000, applicationTableCount: 37, targetColumnCount: 31, expectedTargetColumnCount: 32 });
    for (const table of ["place_cache", "places_master", "place_observations", "api_usage_events"]) {
      expect(post.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE source_card_id='google_places_legacy'`).get()).toEqual(
        post.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get(),
      );
    }
    post.close();

    const replay = await runSqliteG006bPreFinalization({ ...base, mode: "resume" });
    expect(replay).toEqual({ ...resumed, status: "replayed" });
    expect(readFileSync(base.preparedPath)[0]).not.toBe(0xef);
    expect(readFileSync(base.committedPath)[0]).not.toBe(0xef);
  }, 120_000);

  it("rejects resume without a valid PREPARED record before any database mutation", async () => {
    const fixture = createAcceptedFixture();
    const input = operationInput(fixture);
    writeFileSync(input.lockPath, "operator-owned-stale-lock");
    await expect(runSqliteG006bPreFinalization({ ...input, mode: "resume" })).rejects.toMatchObject({ code: "G006B_LOCK_HELD" });
    rmSync(input.lockPath);
    await expect(runSqliteG006bPreFinalization({ ...input, mode: "resume" })).rejects.toMatchObject({ code: "G006B_PREPARED_RECORD_REQUIRED" });
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    db.close();
  });
});
