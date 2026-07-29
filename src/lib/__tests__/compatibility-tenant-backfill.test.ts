import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import {
  COMPATIBILITY_TENANT_TABLES,
  POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
  POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
  SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
  SQLITE_COMPATIBILITY_SOURCE_ENGINE,
  compatibilityContentChecksum,
  prepareSqliteCompatibilityBackfill,
  runSqliteCompatibilityBackfill,
  type CompatibilityBackfillManifest,
  type CompatibilityTableExpectation,
  type CompatibilityUserMapping,
  type SqliteBackfillDb,
} from "@/lib/tenancy/compatibility-backfill";
import { SCHEMA_SQL } from "@/lib/db/schema";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000101";
const OWNER_AUTH_ID = "20000000-0000-4000-8000-000000000101";
const RESEARCHER_AUTH_ID = "20000000-0000-4000-8000-000000000102";
const DISABLED_AUTH_ID = "20000000-0000-4000-8000-000000000103";
const OWNER_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000101";
const RESEARCHER_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000102";
const OWNER_BINDING_ID = "40000000-0000-4000-8000-000000000101";
const RESEARCHER_BINDING_ID = "40000000-0000-4000-8000-000000000102";
const DISABLED_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000103";
const DISABLED_BINDING_ID = "40000000-0000-4000-8000-000000000103";
const POLICY_ID = "50000000-0000-4000-8000-000000000101";
const SECOND_TENANT_ID = "00000000-0000-4000-8000-000000000202";
const SECOND_POLICY_ID = "50000000-0000-4000-8000-000000000202";
const UNKNOWN_AUTH_ID = "20000000-0000-4000-8000-000000000999";
const POLICY_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

type TestDb = Database.Database;

function adapter(db: TestDb): SqliteBackfillDb {
  return {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
    run: (sql: string, params: readonly unknown[] = []) => db.prepare(sql).run(...params),
    transaction: <T>(work: (tx: SqliteBackfillDb) => T, mode?: "deferred" | "immediate") => {
      if (mode === "immediate") {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = work(adapter(db));
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      return db.transaction(() => work(adapter(db)))();
    },
  };
}

function createDb(): TestDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, 'US', 'CO')").run("market-a", "Market A");
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES (?, ?, ?, ?, 'active')").run("legacy-owner", OWNER_AUTH_ID, "owner@example.test", "admin");
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES (?, ?, ?, ?, 'active')").run("legacy-researcher", RESEARCHER_AUTH_ID, "researcher@example.test", "researcher");
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES (?, ?, ?, ?, 'disabled')").run("legacy-disabled", DISABLED_AUTH_ID, "disabled@example.test", "researcher");
  db.prepare("UPDATE app_users SET created_by = ?, team_lead_user_id = ? WHERE id = 'legacy-researcher'").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO user_market_access (user_id, market_id, created_by_user_id) VALUES (?, ?, ?)").run(OWNER_AUTH_ID, "market-a", OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_runs (id, categories, status, created_by_user_id) VALUES (?, '[]', 'done', ?)").run("run-1", OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_units (id, crawl_run_id, zip, category) VALUES (?, ?, '80202', 'industrial')").run("unit-1", "run-1");
  db.prepare("INSERT INTO leads (id, place_id, name, assigned_to_user_id) VALUES (?, ?, ?, ?)").run("lead-1", "place-1", "Synthetic Materials Co", OWNER_AUTH_ID);
  db.prepare("INSERT INTO lead_notes (id, lead_id, author_user_id, body) VALUES (?, ?, ?, ?)").run("note-1", "lead-1", OWNER_AUTH_ID, "synthetic note");
  db.prepare("INSERT INTO outreach_events (id, lead_id, channel, actor_user_id) VALUES (?, ?, 'call', ?)").run("outreach-1", "lead-1", OWNER_AUTH_ID);
  db.prepare("INSERT INTO admin_requests (id, lead_id, request_type, created_by_user_id, assigned_admin_user_id) VALUES (?, ?, 'quote_request', ?, ?)").run("request-1", "lead-1", OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO demos (id, lead_id, slug, published_by_user_id) VALUES (?, ?, ?, ?)").run("demo-1", "lead-1", "synthetic-demo", OWNER_AUTH_ID);
  db.prepare("INSERT INTO audit_logs (id, action) VALUES (?, ?)").run("audit-1", "t028.rehearsal");
  return db;
}

function prepareDb(db: TestDb): void {
  const first = prepareSqliteCompatibilityBackfill(adapter(db));
  expect(first.status).toBe("prepared");
  const second = prepareSqliteCompatibilityBackfill(adapter(db));
  expect(second.addedTenantColumns).toEqual([]);
  expect(second.addedWorkspaceColumns).toEqual([]);
  expect(second.receiptTableCreated).toBe(false);
  expect(second.receiptProtectionInstalled).toBe(true);
  expect((db.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((column) => column.name)).toContain("tenant_id");
  expect((db.prepare("PRAGMA table_info(crawl_runs)").all() as Array<{ name: string }>).map((column) => column.name)).toEqual(expect.arrayContaining(["tenant_id", "workspace_id"]));
  expect((db.prepare("PRAGMA table_info(compatibility_backfill_receipts)").all() as Array<{ name: string }>).map((column) => column.name)).toEqual(expect.arrayContaining(["schema_version", "source_engine", "checksum_algorithm", "policy_id", "policy_hash", "created_at", "completed_at"]));
  expect((db.prepare("PRAGMA index_info(compatibility_tenant_policies_tenant_id_id_unique)").all() as Array<{ name: string }>).map((column) => column.name)).toEqual(["tenant_id", "id"]);
}

function manifestFor(db: TestDb, overrides: Partial<CompatibilityBackfillManifest> = {}): CompatibilityBackfillManifest {
  const legacyUsers: readonly CompatibilityUserMapping[] = [
    {
      legacyUserId: "legacy-owner",
      authIdentityId: OWNER_AUTH_ID,
      expectedEmail: "owner@example.test",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: OWNER_MEMBERSHIP_ID,
      workspaceId: WORKSPACE_ID,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: OWNER_BINDING_ID,
      marketAccessIds: ["market-a"],
    },
    {
      legacyUserId: "legacy-researcher",
      authIdentityId: RESEARCHER_AUTH_ID,
      expectedEmail: "researcher@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "active",
      membershipId: RESEARCHER_MEMBERSHIP_ID,
      workspaceId: WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "active",
      roleBindingId: RESEARCHER_BINDING_ID,
      marketAccessIds: [],
    },
    {
      legacyUserId: "legacy-disabled",
      authIdentityId: DISABLED_AUTH_ID,
      expectedEmail: "disabled@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "disabled",
      membershipId: DISABLED_MEMBERSHIP_ID,
      workspaceId: WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "suspended",
      roleBindingId: DISABLED_BINDING_ID,
      marketAccessIds: [],
    },
  ];
  const legacyTables = COMPATIBILITY_TENANT_TABLES.map((table) => {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
    return { table, rowCount: rows.length, contentChecksum: compatibilityContentChecksum(rows) };
  });
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "t028-synthetic-v1",
    sourceSnapshotFingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tenantId: TENANT_ID,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: POLICY_ID,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers,
    legacyTables,
    ...overrides,
  };
}

function scopedCount(db: TestDb, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE tenant_id IS NOT NULL`).get() as { count: number }).count;
}

function close(db: TestDb): void {
  if (db.open) db.close();
}

const POSTGRES_DEPENDENCIES = [
  "202605110001_full_schema.sql",
  "202605120002_supabase_auth_roles.sql",
  "20260515123000_researcher_workbench_outreach.sql",
  "20260602061959_add_lead_archive_fields.sql",
  "20260520114232_admin_fulfillment_queue.sql",
  "20260602193000_international_markets_and_territories.sql",
  "20260603110615_discovery_items.sql",
  "202606160001_launch_readiness_reliability.sql",
  "202607120001_reconcile_researcher_ai_feedback_schema.sql",
] as const;
const POSTGRES_T028_MIGRATIONS = [
  "202607270001_add_tenants_table.sql",
  "202607270002_add_workspaces_table.sql",
  "202607270003_add_tenant_memberships.sql",
  "202607270004_add_tenant_policies.sql",
  "202607270005_add_support_access_grants.sql",
  "202607270006_add_tenant_export_jobs.sql",
  "202607270007_add_tenant_audit_context.sql",
  "202607270008_add_tenant_deletion_jobs.sql",
  "202607270009_add_tenant_foundation_rls.sql",
  "202607270010_add_compatibility_tenant_backfill.sql",
] as const;

async function invokePostgresBackfill(client: ReturnType<typeof postgres>, manifest: CompatibilityBackfillManifest): Promise<Record<string, unknown>> {
  const jsonManifest = JSON.parse(JSON.stringify(manifest));
  const rows = await client.unsafe("SELECT public.novatrade_run_compatibility_backfill($1::jsonb) AS receipt", [jsonManifest]);
  return rows[0].receipt as Record<string, unknown>;
}

async function postgresManifest(client: ReturnType<typeof postgres>): Promise<CompatibilityBackfillManifest> {
  const rows = [] as CompatibilityTableExpectation[];
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const scopeExpression = table === "audit_logs" || table === "user_market_access" || table === "crawl_runs" || table === "crawl_units" || table === "lead_notes" || table === "outreach_events" || table === "admin_requests" || table === "demos" || table === "ai_lead_verifications" || table === "lead_ai_artifacts" || table === "ai_feedback_events"
      ? "(to_jsonb(t) - 'tenant_id' - 'workspace_id')::text"
      : "(to_jsonb(t) - 'tenant_id')::text";
    const result = await client.unsafe(`SELECT count(*)::integer AS row_count, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${scopeExpression}, '|' ORDER BY ${scopeExpression}), ''), 'UTF8')), 'hex') AS content_checksum FROM public."${table}" t`);
    rows.push({ table, rowCount: Number(result[0].row_count), contentChecksum: String(result[0].content_checksum) });
  }
  return {
    schemaVersion: 1,
    sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "t028-postgres-rehearsal-v1",
    sourceSnapshotFingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tenantId: TENANT_ID,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: POLICY_ID,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers: [
      { legacyUserId: "legacy-owner", authIdentityId: OWNER_AUTH_ID, expectedEmail: "owner@example.test", expectedLegacyRole: "admin", expectedStatus: "active", membershipId: OWNER_MEMBERSHIP_ID, workspaceId: WORKSPACE_ID, membershipRole: "owner", membershipStatus: "active", roleBindingId: OWNER_BINDING_ID, marketAccessIds: ["market-a"] },
      { legacyUserId: "legacy-researcher", authIdentityId: RESEARCHER_AUTH_ID, expectedEmail: "researcher@example.test", expectedLegacyRole: "researcher", expectedStatus: "active", membershipId: RESEARCHER_MEMBERSHIP_ID, workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "active", roleBindingId: RESEARCHER_BINDING_ID, marketAccessIds: [] },
      { legacyUserId: "legacy-disabled", authIdentityId: DISABLED_AUTH_ID, expectedEmail: "disabled@example.test", expectedLegacyRole: "researcher", expectedStatus: "disabled", membershipId: DISABLED_MEMBERSHIP_ID, workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "suspended", roleBindingId: DISABLED_BINDING_ID, marketAccessIds: [] },
    ],
    legacyTables: rows,
  };
}

let openDbs: TestDb[] = [];
afterEach(() => {
  for (const db of openDbs) close(db);
  openDbs = [];
});

describe("T-028 SQLite compatibility backfill", () => {
  it("keeps the Postgres migration portable without extension-dependent digest calls", () => {
    const migration = readFileSync("supabase/migrations/202607270010_add_compatibility_tenant_backfill.sql", "utf8");
    expect(migration).not.toMatch(/(?:pg_catalog\.)?digest\s*\(/i);
    expect(migration).not.toMatch(/pgcrypto|CREATE EXTENSION/i);
    expect(migration).toContain("pg_catalog.sha256(pg_catalog.convert_to");
    expect(migration).toContain("LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE");
    expect(migration).toContain("ARRAY['app_users','tenant_memberships','tenant_policies','tenant_role_bindings','tenants','workspaces']::text[]");
    expect(migration).toContain("WHERE x.user_id = user_entry->>'authIdentityId'");
    expect(migration).toContain("FOREIGN KEY (tenant_id, policy_id) REFERENCES public.tenant_policies (tenant_id, id)");
    expect(migration).toContain("novatrade-postgres-jsonb-text-v1");
    for (const field of ["receiptId", "idempotencyKey", "schemaVersion", "userCount", "relationshipOrphanCount", "status"]) {
      expect(migration).toContain(`receipt->>'${field}'`);
    }
    for (const field of ["tableCounts", "beforeContentChecksums", "afterContentChecksums"]) expect(migration).toContain(`receipt->'${field}'`);
  });

  it("uses locale-independent Unicode key ordering for SQLite canonical checksums", () => {
    const first = compatibilityContentChecksum([{ "😀": 3, "é": 2, A: 1, tenant_id: null, workspace_id: null }]);
    const second = compatibilityContentChecksum([{ A: 1, "é": 2, "😀": 3, workspace_id: WORKSPACE_ID, tenant_id: TENANT_ID }]);
    expect(first).toBe("8bdffd6e206dc2a2e08530ea48a2b6ce92f2a93c80ab15e304e239aa108a92f5");
    expect(second).toBe(first);
  });

  it("rejects cross-engine manifests and disabled SQLite foreign keys before mutation", () => {
    const crossEngineDb = createDb();
    openDbs.push(crossEngineDb);
    prepareDb(crossEngineDb);
    expect(() => runSqliteCompatibilityBackfill(adapter(crossEngineDb), manifestFor(crossEngineDb, {
      sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
      checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    }))).toThrow(/T028_SOURCE_ENGINE_CONTRACT_MISMATCH/);
    expect(crossEngineDb.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });

    const unpreparedDb = createDb();
    openDbs.push(unpreparedDb);
    unpreparedDb.pragma("foreign_keys = OFF");
    expect(() => prepareSqliteCompatibilityBackfill(adapter(unpreparedDb))).toThrow(/T028_SQLITE_FOREIGN_KEYS_REQUIRED/);
    expect((unpreparedDb.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((column) => column.name)).not.toContain("tenant_id");

    const runDb = createDb();
    openDbs.push(runDb);
    prepareDb(runDb);
    const manifest = manifestFor(runDb);
    runDb.pragma("foreign_keys = OFF");
    expect(() => runSqliteCompatibilityBackfill(adapter(runDb), manifest)).toThrow(/T028_SQLITE_FOREIGN_KEYS_REQUIRED/);
    expect(runDb.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });
  });

  it("backfills only manifest-selected scope, preserves content, creates exact owner/memberships, and replays the same receipt", () => {
    const db = createDb();
    openDbs.push(db);
    prepareDb(db);
    const manifest = manifestFor(db);
    const first = runSqliteCompatibilityBackfill(adapter(db), manifest);
    expect(first.status).toBe("completed");
    expect(first.sourceEngine).toBe(SQLITE_COMPATIBILITY_SOURCE_ENGINE);
    expect(first.checksumAlgorithm).toBe(SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM);
    expect(first.userCount).toBe(3);
    expect(first.relationshipOrphanCount).toBe(0);
    expect(first.beforeContentChecksums).toEqual(first.afterContentChecksums);
    expect(first.rollback).toBe("snapshot_restore_only");
    expect(first.activation).toContain("approved compatibility identity");
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      const total = (db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count;
      expect(scopedCount(db, table)).toBe(table === "audit_logs" ? 0 : total);
    }

    expect(db.prepare("SELECT tenant_id FROM leads WHERE id = 'lead-1'").get()).toEqual({ tenant_id: TENANT_ID });
    expect(db.prepare("SELECT tenant_id, workspace_id FROM crawl_runs WHERE id = 'run-1'").get()).toEqual({ tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID });
    expect(db.prepare("SELECT role FROM tenant_role_bindings WHERE membership_id = ?").get(OWNER_MEMBERSHIP_ID)).toEqual({ role: "owner" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id = ? AND status = 'active'").get(TENANT_ID)).toEqual({ count: 2 });
    expect(db.prepare("SELECT status FROM tenant_memberships WHERE id = ?").get(DISABLED_MEMBERSHIP_ID)).toEqual({ status: "suspended" });
    expect(db.prepare("SELECT revoked_at IS NOT NULL AS revoked FROM tenant_role_bindings WHERE id = ?").get(DISABLED_BINDING_ID)).toEqual({ revoked: 1 });
    expect(db.prepare("SELECT tenant_id FROM user_market_access WHERE user_id = ?").get(OWNER_AUTH_ID)).toEqual({ tenant_id: TENANT_ID });
    expect(db.prepare("SELECT scope_kind, tenant_id, workspace_id FROM audit_logs WHERE id = 'audit-1'").get()).toEqual({ scope_kind: "legacy_unscoped", tenant_id: null, workspace_id: null });
    const policyForeignKey = (db.prepare("PRAGMA foreign_key_list(compatibility_backfill_receipts)").all() as Array<{ id: number; seq: number; table: string; from: string; to: string }>).filter((foreignKey) => foreignKey.table === "tenant_policies").sort((left, right) => left.seq - right.seq);
    expect(policyForeignKey.map((foreignKey) => [foreignKey.from, foreignKey.to])).toEqual([["tenant_id", "tenant_id"], ["policy_id", "id"]]);
    const malformedReceipt = { ...first, receiptId: "direct-malformed", userCount: 999 };
    expect(() => db.prepare("INSERT INTO compatibility_backfill_receipts (id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint, tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash, user_count, table_counts_json, before_checksums_json, after_checksums_json, relationship_orphan_count, status, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'completed', ?)").run(
      malformedReceipt.receiptId,
      "direct-malformed",
      first.schemaVersion,
      first.sourceEngine,
      first.checksumAlgorithm,
      first.manifestHash,
      first.sourceSnapshotFingerprint,
      first.tenantId,
      first.workspaceId,
      first.ownerAuthIdentityId,
      first.policyId,
      first.policyVersion,
      first.policyHash,
      first.userCount,
      JSON.stringify(first.tableCounts),
      JSON.stringify(first.beforeContentChecksums),
      JSON.stringify(first.afterContentChecksums),
      JSON.stringify(malformedReceipt),
    )).toThrow(/JSON binding mismatch/);

    db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, 'second-tenant', 'Second Tenant', 'active')").run(SECOND_TENANT_ID);
    db.prepare("INSERT INTO tenant_policies (id, tenant_id, version, compatibility_policy_hash) VALUES (?, ?, 1, ?)").run(SECOND_POLICY_ID, SECOND_TENANT_ID, POLICY_HASH);
    const crossTenantReceipt = { ...first, receiptId: "direct-cross-tenant-policy", idempotencyKey: "direct-cross-tenant-policy", policyId: SECOND_POLICY_ID };
    expect(() => db.prepare("INSERT INTO compatibility_backfill_receipts (id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint, tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash, user_count, table_counts_json, before_checksums_json, after_checksums_json, relationship_orphan_count, status, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'completed', ?)").run(
      crossTenantReceipt.receiptId,
      crossTenantReceipt.idempotencyKey,
      first.schemaVersion,
      first.sourceEngine,
      first.checksumAlgorithm,
      first.manifestHash,
      first.sourceSnapshotFingerprint,
      first.tenantId,
      first.workspaceId,
      first.ownerAuthIdentityId,
      SECOND_POLICY_ID,
      first.policyVersion,
      first.policyHash,
      first.userCount,
      JSON.stringify(first.tableCounts),
      JSON.stringify(first.beforeContentChecksums),
      JSON.stringify(first.afterContentChecksums),
      JSON.stringify(crossTenantReceipt),
    )).toThrow(/FOREIGN KEY constraint failed/i);

    db.prepare("UPDATE user_market_access SET user_id = ? WHERE user_id = ?").run(UNKNOWN_AUTH_ID, OWNER_AUTH_ID);
    expect(() => runSqliteCompatibilityBackfill(adapter(db), manifest)).toThrow(/T028_UNMAPPED_AUTH_REFERENCE/);
    db.prepare("UPDATE user_market_access SET user_id = ? WHERE user_id = ?").run(OWNER_AUTH_ID, UNKNOWN_AUTH_ID);
    db.prepare("UPDATE user_market_access SET created_by_user_id = ? WHERE user_id = ?").run(UNKNOWN_AUTH_ID, OWNER_AUTH_ID);
    expect(() => runSqliteCompatibilityBackfill(adapter(db), manifest)).toThrow(/T028_UNMAPPED_AUTH_REFERENCE/);
    db.prepare("UPDATE user_market_access SET created_by_user_id = ? WHERE user_id = ?").run(OWNER_AUTH_ID, OWNER_AUTH_ID);

    const second = runSqliteCompatibilityBackfill(adapter(db), manifest);
    expect(second).toEqual(first);
    expect(db.prepare("SELECT COUNT(*) AS count FROM compatibility_backfill_receipts").get()).toEqual({ count: 1 });
    expect(() => db.prepare("UPDATE compatibility_backfill_receipts SET status = 'completed' WHERE id = ?").run(first.receiptId)).toThrow();
    expect(() => db.prepare("DELETE FROM compatibility_backfill_receipts WHERE id = ?").run(first.receiptId)).toThrow();
    db.prepare("UPDATE leads SET name = 'drifted' WHERE id = 'lead-1'").run();
    expect(() => runSqliteCompatibilityBackfill(adapter(db), manifest)).toThrow(/T028_REPLAY_CHECKSUM_DRIFT/);
  });

  it("uses BEGIN IMMEDIATE to serialize a second SQLite connection", () => {
    const directory = mkdtempSync(join(tmpdir(), "t028-sqlite-"));
    const file = join(directory, "rehearsal.db");
    const first = new Database(file);
    const second = new Database(file);
    second.pragma("busy_timeout = 1");
    try {
      first.exec("CREATE TABLE lock_probe (id INTEGER PRIMARY KEY)");
      expect(() => adapter(first).transaction(() => {
        expect(first.inTransaction).toBe(true);
        expect(() => second.exec("BEGIN IMMEDIATE")).toThrow(/locked/i);
      }, "immediate")).not.toThrow();
      expect(first.inTransaction).toBe(false);
    } finally {
      close(first);
      close(second);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects incompatible pre-existing scope, receipt, index, and trigger objects without residue", () => {
    const missingReceiptDb = createDb();
    openDbs.push(missingReceiptDb);
    missingReceiptDb.exec("CREATE TABLE compatibility_backfill_receipts (id TEXT PRIMARY KEY)");
    expect(() => prepareSqliteCompatibilityBackfill(adapter(missingReceiptDb))).toThrow(/T028_RECEIPT_TABLE_DRIFT|T028_RECEIPT_COLUMN_DRIFT/);
    expect((missingReceiptDb.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((column) => column.name)).not.toContain("tenant_id");

    const indexDb = createDb();
    openDbs.push(indexDb);
    prepareDb(indexDb);
    indexDb.exec("DROP INDEX compatibility_backfill_receipts_key_unique");
    indexDb.exec("CREATE UNIQUE INDEX compatibility_backfill_receipts_key_unique ON compatibility_backfill_receipts(policy_id)");
    expect(() => prepareSqliteCompatibilityBackfill(adapter(indexDb))).toThrow(/T028_RECEIPT_INDEX_DRIFT/);

    const policyIndexDb = createDb();
    openDbs.push(policyIndexDb);
    policyIndexDb.exec("CREATE UNIQUE INDEX compatibility_tenant_policies_tenant_id_id_unique ON tenant_policies(id, tenant_id)");
    expect(() => prepareSqliteCompatibilityBackfill(adapter(policyIndexDb))).toThrow(/T028_POLICY_INDEX_DRIFT/);
    expect((policyIndexDb.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((column) => column.name)).not.toContain("tenant_id");

    const triggerDb = createDb();
    openDbs.push(triggerDb);
    prepareDb(triggerDb);
    triggerDb.exec("DROP TRIGGER trg_t028_compatibility_receipt_no_update");
    triggerDb.exec("CREATE TRIGGER trg_t028_compatibility_receipt_no_update BEFORE UPDATE ON tenants BEGIN SELECT RAISE(ABORT, 'wrong trigger'); END");
    expect(() => prepareSqliteCompatibilityBackfill(adapter(triggerDb))).toThrow(/T028_RECEIPT_TRIGGER_DRIFT/);
  });

  it("rejects a launch-unsafe tenant policy on replay", () => {
    const db = createDb();
    openDbs.push(db);
    prepareDb(db);
    const manifest = manifestFor(db);
    runSqliteCompatibilityBackfill(adapter(db), manifest);
    db.prepare("UPDATE tenant_policies SET version = 2, ai_processing_enabled = 1 WHERE id = ?").run(POLICY_ID);
    expect(() => runSqliteCompatibilityBackfill(adapter(db), manifest)).toThrow(/T028_REPLAY_POLICY_BASELINE_DRIFT/);
  });

  it.each([
    ["unknown user", (manifest: CompatibilityBackfillManifest) => ({ ...manifest, ownerLegacyUserId: "missing-user" })],
    ["mapping drift", (manifest: CompatibilityBackfillManifest) => ({ ...manifest, legacyUsers: manifest.legacyUsers.map((user) => user.legacyUserId === "legacy-owner" ? { ...user, expectedEmail: "changed@example.test" } : user) })],
    ["checksum mismatch", (manifest: CompatibilityBackfillManifest) => ({ ...manifest, legacyTables: manifest.legacyTables.map((table) => table.table === "leads" ? { ...table, contentChecksum: "b".repeat(64) } : table) })],
  ])("rejects %s before mutation and leaves zero residue", (_label, mutate) => {
    const db = createDb();
    openDbs.push(db);
    prepareDb(db);
    const original = manifestFor(db);
    const mutated = mutate(original) as CompatibilityBackfillManifest;
    expect(() => runSqliteCompatibilityBackfill(adapter(db), mutated)).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM compatibility_backfill_receipts").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM leads WHERE tenant_id IS NOT NULL").get()).toEqual({ count: 0 });
  });

  it.each([
    ["market-access identity", "INSERT INTO user_market_access (user_id, market_id) VALUES (?, 'market-a')"],
    ["market-access creator", "UPDATE user_market_access SET created_by_user_id = ? WHERE user_id = '20000000-0000-4000-8000-000000000101'"],
    ["lead assignee", "UPDATE leads SET assigned_to_user_id = ? WHERE id = 'lead-1'"],
  ])("rejects an unmapped %s before mutation with zero residue", (_label, sql) => {
    const db = createDb();
    openDbs.push(db);
    prepareDb(db);
    db.prepare(sql).run(UNKNOWN_AUTH_ID);
    const manifest = manifestFor(db);
    expect(() => runSqliteCompatibilityBackfill(adapter(db), manifest)).toThrow(/T028_UNMAPPED_AUTH_REFERENCE/);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM compatibility_backfill_receipts").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM leads WHERE tenant_id IS NOT NULL").get()).toEqual({ count: 0 });
  });

  it("rejects duplicate identities, idempotency content conflicts, pre-scoped rows, and orphaned relationships", () => {
    const duplicateDb = createDb();
    openDbs.push(duplicateDb);
    prepareDb(duplicateDb);
    const duplicate = manifestFor(duplicateDb);
    expect(() => runSqliteCompatibilityBackfill(adapter(duplicateDb), {
      ...duplicate,
      legacyUsers: duplicate.legacyUsers.map((user) => ({ ...user, authIdentityId: OWNER_AUTH_ID })),
    })).toThrow(/T028_DUPLICATE_IDENTITY_MAPPING/);

    const replayDb = createDb();
    openDbs.push(replayDb);
    prepareDb(replayDb);
    const replayManifest = manifestFor(replayDb);
    runSqliteCompatibilityBackfill(adapter(replayDb), replayManifest);
    expect(() => runSqliteCompatibilityBackfill(adapter(replayDb), { ...replayManifest, sourceSnapshotFingerprint: "b".repeat(64) })).toThrow(/T028_IDEMPOTENCY_CONTENT_CONFLICT/);

    const scopedDb = createDb();
    openDbs.push(scopedDb);
    prepareDb(scopedDb);
    scopedDb.prepare("UPDATE leads SET tenant_id = ? WHERE id = 'lead-1'").run(TENANT_ID);
    expect(() => runSqliteCompatibilityBackfill(adapter(scopedDb), manifestFor(scopedDb))).toThrow(/T028_PREEXISTING_SCOPE_CONFLICT/);
    expect(scopedDb.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });

    const orphanDb = createDb();
    openDbs.push(orphanDb);
    prepareDb(orphanDb);
    orphanDb.prepare("PRAGMA foreign_keys = OFF").run();
    orphanDb.prepare("INSERT INTO lead_notes (id, lead_id, author_user_id, body) VALUES ('orphan-note', 'missing-lead', ?, 'orphan')").run(OWNER_AUTH_ID);
    orphanDb.prepare("PRAGMA foreign_keys = ON").run();
    expect(() => runSqliteCompatibilityBackfill(adapter(orphanDb), manifestFor(orphanDb))).toThrow(/T028_RELATIONSHIP_ORPHANING/);
    expect(orphanDb.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 0 });
  });

  it.skipIf(process.env.T028_RUN_DISPOSABLE_PG_TESTS !== "1")("rehearses the full T-028 PostgreSQL 16 path with concurrency, replay, drift, and rollback checks", async () => {
    const databaseUrl = process.env.T028_DATABASE_URL;
    if (!databaseUrl) throw new Error("T028_DATABASE_URL is required for the disposable PostgreSQL rehearsal");
    const parsed = new URL(databaseUrl);
    if (!(parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") || parsed.pathname.slice(1) !== "t028_compatibility_rehearsal") {
      throw new Error("T-028 integration permits only localhost database t028_compatibility_rehearsal");
    }
    const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    const contender = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    try {
      const version = await client.unsafe<Array<{ server_version_num: string; sha256: string | null; pgcrypto: string | null }>>("SELECT current_setting('server_version_num') AS server_version_num, pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)')::text AS sha256, (SELECT extname FROM pg_catalog.pg_extension WHERE extname = 'pgcrypto') AS pgcrypto");
      expect(String(version[0].server_version_num).startsWith("16")).toBe(true);
      expect(version[0].sha256).toBe("sha256(bytea)");
      expect(version[0].pgcrypto).toBeNull();
      await client.unsafe("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY); DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;");
      for (const file of [...POSTGRES_DEPENDENCIES, ...POSTGRES_T028_MIGRATIONS]) await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
      await client.unsafe(`INSERT INTO auth.users (id) VALUES ('${OWNER_AUTH_ID}'), ('${RESEARCHER_AUTH_ID}'), ('${DISABLED_AUTH_ID}');
        INSERT INTO public.location_markets (id, name, country_code, admin_area1) VALUES ('market-a', 'Market A', 'US', 'CO');
        INSERT INTO public.zip_codes (zip, city, state) VALUES ('80202', 'Denver', 'CO') ON CONFLICT DO NOTHING;
        INSERT INTO public.app_users (id, user_id, email, role, status) VALUES
          ('legacy-owner', '${OWNER_AUTH_ID}', 'owner@example.test', 'admin', 'active'),
          ('legacy-researcher', '${RESEARCHER_AUTH_ID}', 'researcher@example.test', 'researcher', 'active'),
          ('legacy-disabled', '${DISABLED_AUTH_ID}', 'disabled@example.test', 'researcher', 'disabled');
        UPDATE public.app_users SET created_by = '${OWNER_AUTH_ID}', team_lead_user_id = '${OWNER_AUTH_ID}' WHERE id = 'legacy-researcher';
        INSERT INTO public.user_market_access (user_id, market_id, created_by_user_id) VALUES ('${OWNER_AUTH_ID}', 'market-a', '${OWNER_AUTH_ID}');
        INSERT INTO public.crawl_runs (id, categories, status, created_by_user_id) VALUES ('run-1', '[]'::jsonb, 'done', '${OWNER_AUTH_ID}');
        INSERT INTO public.crawl_units (id, crawl_run_id, zip, category) VALUES ('unit-1', 'run-1', '80202', 'industrial');
        INSERT INTO public.leads (id, place_id, name, assigned_to_user_id) VALUES ('lead-1', 'place-1', 'Synthetic Materials Co', '${OWNER_AUTH_ID}');
        INSERT INTO public.lead_notes (id, lead_id, author_user_id, body) VALUES ('note-1', 'lead-1', '${OWNER_AUTH_ID}', 'synthetic note');
        INSERT INTO public.outreach_events (id, lead_id, channel, actor_user_id) VALUES ('outreach-1', 'lead-1', 'call', '${OWNER_AUTH_ID}');
        INSERT INTO public.admin_requests (id, lead_id, request_type, created_by_user_id, assigned_admin_user_id) VALUES ('request-1', 'lead-1', 'quote_request', '${OWNER_AUTH_ID}', '${OWNER_AUTH_ID}');
        INSERT INTO public.demos (id, lead_id, slug, published_by_user_id) VALUES ('demo-1', 'lead-1', 'synthetic-demo', '${OWNER_AUTH_ID}');
        INSERT INTO public.audit_logs (id, action, scope_kind) VALUES ('audit-1', 't028.rehearsal', 'legacy_unscoped');`);
      const manifest = await postgresManifest(client);
      const workspaceScopedTables = new Set(["user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events", "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events"]);
      const assertZeroResidue = async () => {
        for (const id of [TENANT_ID, WORKSPACE_ID, POLICY_ID, OWNER_MEMBERSHIP_ID, RESEARCHER_MEMBERSHIP_ID, DISABLED_MEMBERSHIP_ID, OWNER_BINDING_ID, RESEARCHER_BINDING_ID, DISABLED_BINDING_ID]) {
          const table = id === TENANT_ID ? "tenants" : id === WORKSPACE_ID ? "workspaces" : id === POLICY_ID ? "tenant_policies" : id === OWNER_MEMBERSHIP_ID || id === RESEARCHER_MEMBERSHIP_ID || id === DISABLED_MEMBERSHIP_ID ? "tenant_memberships" : "tenant_role_bindings";
          expect((await client.unsafe(`SELECT count(*)::integer AS count FROM public."${table}" WHERE id = $1`, [id]))[0].count).toBe(0);
        }
        expect((await client.unsafe("SELECT count(*)::integer AS count FROM public.compatibility_backfill_receipts"))[0].count).toBe(0);
        for (const table of COMPATIBILITY_TENANT_TABLES) {
          const scopeSql = table === "audit_logs"
            ? "scope_kind = 'legacy_unscoped' AND tenant_id IS NULL AND workspace_id IS NULL"
            : workspaceScopedTables.has(table)
              ? "tenant_id IS NULL AND workspace_id IS NULL"
              : "tenant_id IS NULL";
          expect((await client.unsafe(`SELECT count(*)::integer AS count FROM public."${table}" WHERE NOT (${scopeSql})`))[0].count).toBe(0);
        }
      };

      await expect(invokePostgresBackfill(client, {
        ...manifest,
        sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
        checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
      })).rejects.toThrow(/T028_SOURCE_ENGINE_CONTRACT_MISMATCH/);
      await assertZeroResidue();

      await client.unsafe("INSERT INTO public.user_market_access (user_id, market_id) VALUES ($1, 'market-a')", [UNKNOWN_AUTH_ID]);
      await expect(invokePostgresBackfill(client, await postgresManifest(client))).rejects.toThrow(/T028_UNMAPPED_AUTH_REFERENCE:user_market_access.user_id/);
      await assertZeroResidue();
      await client.unsafe("DELETE FROM public.user_market_access WHERE user_id = $1", [UNKNOWN_AUTH_ID]);

      await client.unsafe("UPDATE public.user_market_access SET created_by_user_id = $1 WHERE user_id = $2", [UNKNOWN_AUTH_ID, OWNER_AUTH_ID]);
      await expect(invokePostgresBackfill(client, await postgresManifest(client))).rejects.toThrow(/T028_UNMAPPED_AUTH_REFERENCE:user_market_access.created_by_user_id/);
      await assertZeroResidue();
      await client.unsafe("UPDATE public.user_market_access SET created_by_user_id = $1 WHERE user_id = $2", [OWNER_AUTH_ID, OWNER_AUTH_ID]);

      const preActivationFailure = {
        ...manifest,
        idempotencyKey: "t028-postgres-preactivation-failure",
        legacyTables: manifest.legacyTables.map((table) => table.table === "leads" ? { ...table, contentChecksum: "c".repeat(64) } : table),
      };
      await expect(invokePostgresBackfill(client, preActivationFailure)).rejects.toThrow(/T028_CHECKSUM_MISMATCH/);
      await assertZeroResidue();
      const [first, second] = await Promise.all([invokePostgresBackfill(client, manifest), invokePostgresBackfill(contender, manifest)]);
      expect(first).toEqual(second);
      expect((await client.unsafe("SELECT count(*)::integer AS count FROM public.compatibility_backfill_receipts"))[0].count).toBe(1);
      const receiptRow = (await client.unsafe("SELECT source_engine, checksum_algorithm, policy_id::text, policy_version, policy_hash, receipt FROM public.compatibility_backfill_receipts WHERE idempotency_key = $1", [manifest.idempotencyKey]))[0] as unknown as { source_engine: string; checksum_algorithm: string; policy_id: string; policy_version: number; policy_hash: string; receipt: Record<string, unknown> };
      expect(receiptRow.source_engine).toBe(POSTGRES_COMPATIBILITY_SOURCE_ENGINE);
      expect(receiptRow.checksum_algorithm).toBe(POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM);
      expect(receiptRow.policy_id).toBe(POLICY_ID);
      expect(Number(receiptRow.policy_version)).toBe(1);
      expect(receiptRow.policy_hash).toBe(POLICY_HASH);
      expect(receiptRow.receipt).toMatchObject({ sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE, checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM, policyId: POLICY_ID, policyVersion: 1, policyHash: POLICY_HASH });
      const policyConstraint = (await client.unsafe("SELECT pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE conname = 'compatibility_backfill_receipts_policy_fkey'"))[0].definition as string;
      expect(policyConstraint).toContain("FOREIGN KEY (tenant_id, policy_id) REFERENCES tenant_policies(tenant_id, id)");
      await expect(client.unsafe(`WITH source AS (
        SELECT r.*, pg_catalog.gen_random_uuid() AS new_id
        FROM public.compatibility_backfill_receipts r
        WHERE r.idempotency_key = $1
      )
      INSERT INTO public.compatibility_backfill_receipts (
        id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status, receipt
      )
      SELECT new_id, 'malformed-direct', schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status,
        jsonb_set(jsonb_set(receipt, '{receiptId}', to_jsonb(new_id)), '{userCount}', '999'::jsonb)
      FROM source`, [manifest.idempotencyKey])).rejects.toThrow(/compatibility_backfill_receipts_receipt_binding_chk/);

      const restoredSqliteRows = await client.unsafe(`WITH source AS (
        SELECT r.*, pg_catalog.gen_random_uuid() AS new_id, repeat('d', 64) AS historical_manifest_hash
        FROM public.compatibility_backfill_receipts r
        WHERE r.idempotency_key = $1
      )
      INSERT INTO public.compatibility_backfill_receipts (
        id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status, receipt
      )
      SELECT new_id, 'restored-sqlite-history', schema_version, 'sqlite', 'novatrade-sqlite-canonical-json-v1', historical_manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status,
        receipt || jsonb_build_object(
          'receiptId', new_id,
          'idempotencyKey', 'restored-sqlite-history',
          'sourceEngine', 'sqlite',
          'checksumAlgorithm', 'novatrade-sqlite-canonical-json-v1',
          'manifestHash', historical_manifest_hash
        )
      FROM source
      RETURNING source_engine, checksum_algorithm`, [manifest.idempotencyKey]);
      expect(restoredSqliteRows[0]).toMatchObject({ source_engine: SQLITE_COMPATIBILITY_SOURCE_ENGINE, checksum_algorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM });
      await expect(invokePostgresBackfill(client, {
        ...manifest,
        idempotencyKey: "restored-sqlite-history",
        sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
        checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
      })).rejects.toThrow(/T028_SOURCE_ENGINE_CONTRACT_MISMATCH/);

      await expect(client.unsafe(`WITH source AS (
        SELECT r.*, pg_catalog.gen_random_uuid() AS new_id
        FROM public.compatibility_backfill_receipts r
        WHERE r.idempotency_key = $1
      )
      INSERT INTO public.compatibility_backfill_receipts (
        id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status, receipt
      )
      SELECT new_id, 'invalid-engine-pair', schema_version, 'sqlite', 'novatrade-postgres-jsonb-text-v1', manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status,
        receipt || jsonb_build_object('receiptId', new_id, 'idempotencyKey', 'invalid-engine-pair', 'sourceEngine', 'sqlite')
      FROM source`, [manifest.idempotencyKey])).rejects.toThrow(/compatibility_backfill_receipts_engine_algorithm_pair_chk/);

      await client.unsafe("INSERT INTO public.tenants (id, slug, name, status) VALUES ($1, 'second-tenant', 'Second Tenant', 'active')", [SECOND_TENANT_ID]);
      await client.unsafe("INSERT INTO public.tenant_policies (id, tenant_id, version, compatibility_policy_hash) VALUES ($1, $2, 1, $3)", [SECOND_POLICY_ID, SECOND_TENANT_ID, POLICY_HASH]);
      await expect(client.unsafe(`WITH source AS (
        SELECT r.*, pg_catalog.gen_random_uuid() AS new_id
        FROM public.compatibility_backfill_receipts r
        WHERE r.idempotency_key = $1
      )
      INSERT INTO public.compatibility_backfill_receipts (
        id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status, receipt
      )
      SELECT new_id, 'cross-tenant-policy', schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint,
        tenant_id, workspace_id, owner_auth_identity_id, $2::uuid, policy_version, policy_hash,
        user_count, table_counts, before_content_checksums, after_content_checksums,
        relationship_orphan_count, status,
        receipt || jsonb_build_object('receiptId', new_id, 'idempotencyKey', 'cross-tenant-policy', 'policyId', $2::text)
      FROM source`, [manifest.idempotencyKey, SECOND_POLICY_ID])).rejects.toThrow(/compatibility_backfill_receipts_policy_fkey/);
      const privilegeRows = (await client.unsafe("SELECT has_function_privilege('anon', 'public.novatrade_run_compatibility_backfill(jsonb)', 'EXECUTE') AS anon_execute, has_function_privilege('authenticated', 'public.novatrade_run_compatibility_backfill(jsonb)', 'EXECUTE') AS authenticated_execute, has_table_privilege('anon', 'public.compatibility_backfill_receipts', 'SELECT') AS anon_select, has_table_privilege('authenticated', 'public.compatibility_backfill_receipts', 'SELECT') AS authenticated_select, c.relrowsecurity, c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid = 'public.compatibility_backfill_receipts'::regclass"))[0] as unknown as { anon_execute: boolean; authenticated_execute: boolean; anon_select: boolean; authenticated_select: boolean; relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(privilegeRows).toMatchObject({ anon_execute: false, authenticated_execute: false, anon_select: false, authenticated_select: false, relrowsecurity: true, relforcerowsecurity: true });
      for (const role of ["anon", "authenticated"] as const) {
        const observer = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
        try {
          await observer.unsafe(`SET ROLE ${role}; SELECT count(*) FROM public.compatibility_backfill_receipts`);
          throw new Error(`${role} unexpectedly viewed compatibility receipts`);
        } catch (error) {
          expect(String(error)).toMatch(/permission denied|row-level security/);
        } finally {
          await observer.end({ timeout: 5 });
        }
      }
      expect(await invokePostgresBackfill(client, manifest)).toEqual(first);
      expect((await client.unsafe("SELECT m.status, b.revoked_at IS NOT NULL AS revoked FROM public.tenant_memberships m JOIN public.tenant_role_bindings b ON b.membership_id = m.id WHERE m.id = $1", [DISABLED_MEMBERSHIP_ID]))[0]).toMatchObject({ status: "suspended", revoked: true });
      await client.unsafe("UPDATE public.user_market_access SET user_id = $1 WHERE user_id = $2", [UNKNOWN_AUTH_ID, OWNER_AUTH_ID]);
      await expect(invokePostgresBackfill(client, manifest)).rejects.toThrow(/T028_UNMAPPED_AUTH_REFERENCE:user_market_access.user_id/);
      await client.unsafe("UPDATE public.user_market_access SET user_id = $1 WHERE user_id = $2", [OWNER_AUTH_ID, UNKNOWN_AUTH_ID]);
      await client.unsafe("UPDATE public.user_market_access SET created_by_user_id = $1 WHERE user_id = $2", [UNKNOWN_AUTH_ID, OWNER_AUTH_ID]);
      await expect(invokePostgresBackfill(client, manifest)).rejects.toThrow(/T028_UNMAPPED_AUTH_REFERENCE:user_market_access.created_by_user_id/);
      await client.unsafe("UPDATE public.user_market_access SET created_by_user_id = $1 WHERE user_id = $2", [OWNER_AUTH_ID, OWNER_AUTH_ID]);
      expect(await invokePostgresBackfill(client, manifest)).toEqual(first);
      await client.unsafe("UPDATE public.leads SET name = 'drifted' WHERE id = 'lead-1'");
      await expect(invokePostgresBackfill(client, manifest)).rejects.toThrow(/T028_REPLAY_CHECKSUM_DRIFT/);
      await client.unsafe("UPDATE public.tenant_policies SET version = 2, ai_processing_enabled = true WHERE id = $1", [POLICY_ID]);
      await expect(invokePostgresBackfill(client, manifest)).rejects.toThrow(/T028_(POLICY_BASELINE_DRIFT|REPLAY_FOUNDATION_DRIFT)/);
      await expect(invokePostgresBackfill(client, { ...manifest, sourceSnapshotFingerprint: "b".repeat(64) })).rejects.toThrow(/T028_IDEMPOTENCY_CONTENT_CONFLICT/);
      await expect(client.unsafe("UPDATE public.compatibility_backfill_receipts SET status = 'completed' WHERE idempotency_key = $1", [manifest.idempotencyKey])).rejects.toThrow(/append-only/);
      expect((await client.unsafe("SELECT count(*)::integer AS count FROM public.compatibility_backfill_receipts"))[0].count).toBe(2);
    } finally {
      await contender.end({ timeout: 5 });
      await client.end({ timeout: 5 });
    }
  }, 120000);
});
