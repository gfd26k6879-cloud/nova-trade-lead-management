import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { MIGRATION_COLUMNS, SCHEMA_SQL } from "@/lib/db/schema";
import { TENANT_POLICY_ACTIVE_MATERIALS_MODE } from "@/lib/tenancy/types";
import {
  TENANT_POLICY_DEFAULTS,
  createTenantPolicyDefaults,
  tenantPolicyCreationInputSchema,
  tenantPolicySchema,
} from "@/lib/tenancy/schemas";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const POLICY_A = "10000000-0000-4000-8000-000000000001";
const POLICY_COLUMNS = [
  "id", "tenant_id", "version", "locale", "timezone", "export_retention_days",
  "operational_log_retention_days", "raw_source_retention_days", "contact_freshness_days",
  "primary_delete_within_days", "backup_expire_within_days", "tombstone_retention_years",
  "active_materials_mode", "ai_processing_enabled", "source_research_enabled",
  "contact_research_enabled", "outreach_drafting_enabled", "copy_export_enabled",
  "autonomous_send_enabled", "require_source_plan_approval", "require_knowledge_review",
  "require_icp_review", "require_lead_play_review", "require_contact_review", "require_outreach_review",
  "created_at", "updated_at",
] as const;
const RANGES = {
  export_retention_days: [1, 7], operational_log_retention_days: [1, 30], raw_source_retention_days: [1, 180],
  contact_freshness_days: [1, 180], primary_delete_within_days: [1, 30], backup_expire_within_days: [1, 35],
} as const;

function db(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_SQL);
  return database;
}

function tenant(database: Database.Database, id = TENANT_A, slug = "tenant-a"): void {
  database.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(id, slug, `${slug} tenant`);
}

function policy(database: Database.Database, values: Record<string, unknown> = {}): void {
  const row = { id: POLICY_A, tenant_id: TENANT_A, ...values };
  const columns = Object.keys(row);
  database.prepare(`INSERT INTO tenant_policies (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`).run(row);
}

function migrationText(): string {
  return readFileSync(join(process.cwd(), "supabase/migrations/202607270004_add_tenant_policies.sql"), "utf8");
}

describe("tenant policy schema", () => {
  it("has the exact enumerated columns, defaults, named checks, FK, unique, index, and no column migration", () => {
    const database = db();
    try {
      const columns = database.prepare("PRAGMA table_info(tenant_policies)").all() as Array<{ name: string; type: string; dflt_value: string | null; notnull: number; pk: number }>;
      expect(columns.map(({ name }) => name)).toEqual(POLICY_COLUMNS);
      expect(columns).toHaveLength(27);
      expect(columns.every(({ notnull }) => notnull === 1)).toBe(true);
      expect(columns[0]).toMatchObject({ type: "TEXT", pk: 1 });
      expect(columns.find(({ name }) => name === "version")?.dflt_value).toBe("1");
      expect(columns.find(({ name }) => name === "locale")?.dflt_value).toBe("'en-US'");
      expect(columns.find(({ name }) => name === "timezone")?.dflt_value).toBe("'UTC'");
      expect(columns.find(({ name }) => name === "autonomous_send_enabled")?.dflt_value).toBe("0");
      expect(columns.find(({ name }) => name === "require_outreach_review")?.dflt_value).toBe("1");
      expect(columns.find(({ name }) => name === "created_at")?.dflt_value).toContain("strftime");
      const sql = (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenant_policies'").get() as { sql: string }).sql;
      for (const name of ["tenant_policies_id_format_chk", "tenant_policies_tenant_id_format_chk", "tenant_policies_version_chk", "tenant_policies_locale_format_chk", "tenant_policies_timezone_format_chk", "tenant_policies_export_retention_days_chk", "tenant_policies_active_materials_mode_chk", "tenant_policies_autonomous_send_enabled_chk", "tenant_policies_tenant_unique", "tenant_policies_created_at_utc_chk", "tenant_policies_updated_at_utc_chk"]) expect(sql).toContain(name);
      expect((database.prepare("PRAGMA foreign_key_list(tenant_policies)").all() as Array<{ table: string; from: string; to: string; on_delete: string }>)).toEqual(expect.arrayContaining([expect.objectContaining({ table: "tenants", from: "tenant_id", to: "id", on_delete: "RESTRICT" })]));
      expect((database.prepare("PRAGMA index_list(tenant_policies)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual(expect.arrayContaining(["idx_tenant_policies_tenant_updated_at"]));
      expect(MIGRATION_COLUMNS.some(({ table }) => table === "tenant_policies")).toBe(false);
    } finally { database.close(); }
  });

  it("enforces ranges, fixed vocabulary, fixed tombstone/send, review defaults, and kill-switch-only flags", () => {
    const database = db();
    try {
      tenant(database); policy(database, { ai_processing_enabled: 1, source_research_enabled: 1, contact_research_enabled: 1, outreach_drafting_enabled: 1, copy_export_enabled: 1 });
      const row = database.prepare("SELECT * FROM tenant_policies").get() as Record<string, unknown>;
      expect(row).toMatchObject({ active_materials_mode: TENANT_POLICY_ACTIVE_MATERIALS_MODE, tombstone_retention_years: 7, autonomous_send_enabled: 0, require_source_plan_approval: 1, require_knowledge_review: 1, require_icp_review: 1, require_lead_play_review: 1, require_contact_review: 1, require_outreach_review: 1 });
      for (const [column, [min, max]] of Object.entries(RANGES)) {
        database.prepare(`UPDATE tenant_policies SET ${column} = ?, version = version + 1`).run(min);
        database.prepare(`UPDATE tenant_policies SET ${column} = ?, version = version + 1`).run(max);
        for (const value of [0, max + 1, 1.5]) expect(() => database.prepare(`UPDATE tenant_policies SET ${column} = ?, version = version + 1`).run(value)).toThrow();
      }
      expect(() => database.prepare("UPDATE tenant_policies SET active_materials_mode = 'retained_forever', version = version + 1").run()).toThrow();
      expect(() => database.prepare("UPDATE tenant_policies SET tombstone_retention_years = 6, version = version + 1").run()).toThrow();
      expect(() => database.prepare("UPDATE tenant_policies SET autonomous_send_enabled = 1, version = version + 1").run()).toThrow();
    } finally { database.close(); }
  });

  it("enforces one policy per tenant, restricted tenant deletion, exact versioning, immutability, and recursive-safe touch", () => {
    const database = db();
    try {
      database.pragma("recursive_triggers = ON"); tenant(database); tenant(database, TENANT_B, "tenant-b"); policy(database);
      expect(() => policy(database, { id: "10000000-0000-4000-8000-000000000002" })).toThrow(/UNIQUE|constraint/i);
      const before = database.prepare("SELECT created_at, updated_at, version FROM tenant_policies WHERE id = ?").get(POLICY_A) as { created_at: string; updated_at: string; version: number };
      database.prepare("UPDATE tenant_policies SET copy_export_enabled = 1, version = ? WHERE id = ?").run(before.version + 1, POLICY_A);
      const after = database.prepare("SELECT * FROM tenant_policies WHERE id = ?").get(POLICY_A) as Record<string, unknown>;
      expect(after.created_at).toBe(before.created_at); expect(after.updated_at).not.toBe(before.updated_at); expect(after.version).toBe(before.version + 1);
      for (const version of [before.version + 1, before.version, before.version + 3]) expect(() => database.prepare("UPDATE tenant_policies SET copy_export_enabled = 0, version = ? WHERE id = ?").run(version, POLICY_A)).toThrow();
      for (const [column, value] of [["id", "10000000-0000-4000-8000-000000000003"], ["tenant_id", TENANT_B], ["created_at", "2026-07-27T00:00:00.000Z"]] as const) expect(() => database.prepare(`UPDATE tenant_policies SET ${column} = ?, version = version + 1 WHERE id = ?`).run(value, POLICY_A)).toThrow(/immutable|constraint/i);
      expect(() => database.prepare("DELETE FROM tenants WHERE id = ?").run(TENANT_A)).toThrow(/FOREIGN KEY|constraint/i);
    } finally { database.close(); }
  });

  it("rejects malformed locale/timezone/timestamps, keeps legacy settings, and applies strict runtime schemas", () => {
    const database = new Database(":memory:");
    try {
      database.pragma("foreign_keys = ON"); database.exec("CREATE TABLE settings (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)"); database.prepare("INSERT INTO settings VALUES (1, 'legacy')").run(); runSqliteMigrations(database); database.exec(SCHEMA_SQL); tenant(database); tenant(database, TENANT_B, "tenant-b"); policy(database);
      for (const [column, value] of [["locale", "en US"], ["timezone", "America//Denver"], ["created_at", "2026-07-27T00:00:00Z"], ["updated_at", "2026-07-27 00:00:00.000Z"]] as const) expect(() => database.prepare(`INSERT INTO tenant_policies (id, tenant_id, ${column}) VALUES (?, ?, ?)`).run("10000000-0000-4000-8000-000000000009", TENANT_B, value)).toThrow();
      expect(database.prepare("SELECT marker FROM settings WHERE id = 1").get()).toEqual({ marker: "legacy" });
      const valid = database.prepare("SELECT * FROM tenant_policies").get() as Record<string, unknown>;
      const camel = { id: valid.id, tenantId: valid.tenant_id, version: valid.version, locale: valid.locale, timezone: valid.timezone, exportRetentionDays: valid.export_retention_days, operationalLogRetentionDays: valid.operational_log_retention_days, rawSourceRetentionDays: valid.raw_source_retention_days, contactFreshnessDays: valid.contact_freshness_days, primaryDeleteWithinDays: valid.primary_delete_within_days, backupExpireWithinDays: valid.backup_expire_within_days, tombstoneRetentionYears: valid.tombstone_retention_years, activeMaterialsMode: valid.active_materials_mode, aiProcessingEnabled: false, sourceResearchEnabled: false, contactResearchEnabled: false, outreachDraftingEnabled: false, copyExportEnabled: false, autonomousSendEnabled: false, requireSourcePlanApproval: true, requireKnowledgeReview: true, requireIcpReview: true, requireLeadPlayReview: true, requireContactReview: true, requireOutreachReview: true, createdAt: valid.created_at, updatedAt: valid.updated_at };
      expect(tenantPolicySchema.safeParse(camel).success).toBe(true); expect(tenantPolicySchema.safeParse({ ...camel, unknown: true }).success).toBe(false); expect(tenantPolicySchema.safeParse({ ...camel, version: 1.5 }).success).toBe(false); expect(tenantPolicySchema.safeParse({ ...camel, autonomousSendEnabled: true }).success).toBe(false);
      expect(tenantPolicySchema.safeParse(Object.fromEntries(Object.entries(camel).filter(([key]) => key !== "locale"))).success).toBe(false);
      const created = tenantPolicyCreationInputSchema.parse({ tenantId: TENANT_A }); expect(created).toMatchObject({ ...TENANT_POLICY_DEFAULTS, tenantId: TENANT_A }); expect(Object.isFrozen(TENANT_POLICY_DEFAULTS)).toBe(true); expect(Object.isFrozen(createTenantPolicyDefaults())).toBe(true); expect(() => Object.defineProperty(TENANT_POLICY_DEFAULTS, "locale", { value: "bad" })).toThrow();
    } finally { database.close(); }
  });

  it("keeps the static field boundary secret-free and preserves Postgres/SQLite vocabulary/default parity", () => {
    const migration = migrationText();
    expect(POLICY_COLUMNS.filter((column) => /json|secret|credential|token|password|api.?key/i.test(column))).toEqual([]);
    expect(migration).toContain("CREATE TABLE public.tenant_policies"); expect(migration).toContain("DEFAULT 'en-US'"); expect(migration).toContain("DEFAULT 'UTC'"); expect(migration).toContain(`DEFAULT '${TENANT_POLICY_ACTIVE_MATERIALS_MODE}'`); expect(migration).toContain("autonomous_send_enabled boolean NOT NULL DEFAULT false"); expect(migration).toContain("REVOKE ALL ON FUNCTION"); expect(migration).not.toMatch(/CREATE POLICY|ENABLE ROW LEVEL SECURITY/);
    expect(SCHEMA_SQL).toContain(`active_materials_mode TEXT NOT NULL DEFAULT '${TENANT_POLICY_ACTIVE_MATERIALS_MODE}'`); expect(MIGRATION_COLUMNS.some(({ table }) => table === "tenant_policies")).toBe(false);
  });
});
