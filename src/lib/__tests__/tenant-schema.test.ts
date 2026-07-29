import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { MIGRATION_COLUMNS, SCHEMA_SQL } from "@/lib/db/schema";

const VALID_ID = "00000000-0000-4000-8000-000000000001";

function createSchemaDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

function insertTenant(
  db: Database.Database,
  input: Partial<{
    id: string;
    slug: string;
    name: string;
    status: string;
    locale: string;
    timezone: string;
  }> = {},
): void {
  db.prepare(
    `INSERT INTO tenants (id, slug, name, status, locale, timezone)
     VALUES (@id, @slug, @name, COALESCE(@status, 'provisioning'), COALESCE(@locale, 'en-US'), COALESCE(@timezone, 'UTC'))`,
  ).run({
    id: input.id ?? VALID_ID,
    slug: input.slug ?? "acme-materials",
    name: input.name ?? "Acme Materials",
    status: input.status ?? null,
    locale: input.locale ?? null,
    timezone: input.timezone ?? null,
  });
}

describe("SQLite tenants schema", () => {
  it("creates the eight-column fresh schema with defaults, named checks, and the status index", () => {
    const db = createSchemaDatabase();
    try {
      const columns = db.prepare("PRAGMA table_info(tenants)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;
      expect(columns.map((column) => column.name)).toEqual([
        "id",
        "slug",
        "name",
        "status",
        "locale",
        "timezone",
        "created_at",
        "updated_at",
      ]);
      expect(columns.every((column) => column.notnull === 1)).toBe(true);
      expect(columns[0]).toMatchObject({ type: "TEXT", pk: 1 });
      expect(columns.find((column) => column.name === "status")?.dflt_value).toBe("'provisioning'");
      expect(columns.find((column) => column.name === "locale")?.dflt_value).toBe("'en-US'");
      expect(columns.find((column) => column.name === "timezone")?.dflt_value).toBe("'UTC'");
      expect(columns.find((column) => column.name === "created_at")?.dflt_value).toContain("strftime");
      expect(columns.find((column) => column.name === "updated_at")?.dflt_value).toContain("strftime");

      const indexNames = (db.prepare("PRAGMA index_list(tenants)").all() as Array<{ name: string }>).map(
        (index) => index.name,
      );
      expect(indexNames).toContain("idx_tenants_status_created_at");

      const schemaSql = (db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenants'")
        .get() as { sql: string }).sql;
      for (const constraint of [
        "tenants_id_format_chk",
        "tenants_slug_length_chk",
        "tenants_slug_format_chk",
        "tenants_slug_unique",
        "tenants_name_length_chk",
        "tenants_status_chk",
        "tenants_locale_length_chk",
        "tenants_locale_format_chk",
        "tenants_timezone_length_chk",
        "tenants_timezone_format_chk",
      ]) {
        expect(schemaSql).toContain(constraint);
      }
      expect(MIGRATION_COLUMNS.some((migration) => migration.table === "tenants")).toBe(false);
    } finally {
      db.close();
    }
  });

  it("preserves a legacy row while adding the tenant table during upgrade", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        CREATE TABLE leads (
          id TEXT PRIMARY KEY,
          place_id TEXT NOT NULL UNIQUE,
          name TEXT,
          categories TEXT NOT NULL DEFAULT '[]',
          website_status TEXT NOT NULL DEFAULT 'none',
          score REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'new',
          business_type TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.prepare(
        "INSERT INTO leads (id, place_id, name, categories, website_status, score, status, business_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("legacy-lead", "legacy-place", "Legacy Lead", "[]", "none", 7, "new", "industrial");

      runSqliteMigrations(db);
      db.exec(SCHEMA_SQL);

      expect(db.prepare("SELECT name FROM leads WHERE id = ?").get("legacy-lead")).toMatchObject({ name: "Legacy Lead" });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get()).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("accepts canonical UUIDs, defaults, all statuses, and valid names", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db);
      const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(VALID_ID) as Record<string, string>;
      expect(row).toMatchObject({
        id: VALID_ID,
        slug: "acme-materials",
        name: "Acme Materials",
        status: "provisioning",
        locale: "en-US",
        timezone: "UTC",
      });
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      for (const [index, status] of [
        "provisioning",
        "active",
        "suspended",
        "archived",
        "deletion_pending",
        "deleted",
      ].entries()) {
        insertTenant(db, {
          id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
          slug: `status-${index}`,
          status,
        });
      }
      expect(db.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toMatchObject({ count: 7 });

      insertTenant(db, { id: "00000000-0000-4000-8000-000000000009", slug: "trimmed-name", name: "  Trimmed Name  " });
      expect(() => insertTenant(db, { id: "00000000-0000-4000-8000-000000000010", slug: "bad-status", status: "paused" })).toThrow();
      expect(() => insertTenant(db, { id: "00000000-0000-4000-8000-000000000011", slug: "empty-name", name: "   " })).toThrow();
      expect(() => insertTenant(db, { id: "00000000-0000-4000-8000-000000000012", slug: "long-name", name: "x".repeat(181) })).toThrow();
    } finally {
      db.close();
    }
  });

  it("rejects malformed IDs, duplicate or non-normalized slugs, and invalid locales", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db);
      expect(() => insertTenant(db, { id: "00000000-0000-4000-8000-000000000002", slug: "acme-materials" })).toThrow();
      for (const [index, slug] of ["Acme-Materials", "../acme", "acme/materials", "-acme", "acme-"]) {
        expect(() => insertTenant(db, {
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          slug,
        })).toThrow();
      }
      expect(() => insertTenant(db, { id: "not-a-uuid", slug: "valid-id-check" })).toThrow();

      for (const [index, locale] of ["en-US", "zh-Hant-TW", "es-419"].entries()) {
        insertTenant(db, {
          id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          slug: `locale-${index}`,
          locale,
        });
      }
      for (const [index, locale] of ["e", "en_US", "en--US", "en-", "english", "en-123456789"].entries()) {
        expect(() => insertTenant(db, {
          id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          slug: `bad-locale-${index}`,
          locale,
        })).toThrow();
      }
    } finally {
      db.close();
    }
  });

  it("accepts approved timezone shapes and rejects malformed slash, dot, and space forms", () => {
    const db = createSchemaDatabase();
    try {
      for (const [index, timezone] of ["UTC", "America/Denver", "America/Argentina/Buenos_Aires", "Etc/GMT+5"].entries()) {
        insertTenant(db, {
          id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          slug: `timezone-${index}`,
          timezone,
        });
      }
      for (const [index, timezone] of ["America//Denver", "America.Denver", "America/Denver City", "/Denver", "America/5Denver"].entries()) {
        expect(() => insertTenant(db, {
          id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          slug: `bad-timezone-${index}`,
          timezone,
        })).toThrow();
      }
    } finally {
      db.close();
    }
  });

  it("keeps ID and slug immutable and touches updated_at without recursive-trigger failure", () => {
    const db = createSchemaDatabase();
    try {
      db.pragma("recursive_triggers = ON");
      db.prepare(
        `INSERT INTO tenants (id, slug, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        VALID_ID,
        "immutable-tenant",
        "Immutable Tenant",
        "2026-07-27T00:00:00.000Z",
        "2026-07-27T00:00:00.000Z",
      );
      const before = db.prepare("SELECT created_at, updated_at FROM tenants WHERE id = ?").get(VALID_ID) as {
        created_at: string;
        updated_at: string;
      };

      db.prepare("UPDATE tenants SET name = ? WHERE id = ?").run("Renamed Tenant", VALID_ID);
      const after = db.prepare("SELECT created_at, updated_at FROM tenants WHERE id = ?").get(VALID_ID) as {
        created_at: string;
        updated_at: string;
      };
      expect(after.created_at).toBe(before.created_at);
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(after.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      expect(() => db.prepare("UPDATE tenants SET id = ? WHERE id = ?").run(
        "00000000-0000-4000-8000-000000000002",
        VALID_ID,
      )).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE tenants SET slug = ? WHERE id = ?").run(
        "mutable-tenant",
        VALID_ID,
      )).toThrow(/immutable/);
    } finally {
      db.close();
    }
  });

  it("ignores exact duplicate-column migrations but rethrows other migration failures", () => {
    const db = createSchemaDatabase();
    try {
      expect(() => runSqliteMigrations(db)).not.toThrow();

      const failure = { table: "leads", column: "t003_failure", type: "TEXT DEFAULT (" };
      MIGRATION_COLUMNS.push(failure);
      try {
        let thrown: unknown;
        try {
          runSqliteMigrations(db);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toMatch(/syntax|incomplete|near/i);
      } finally {
        MIGRATION_COLUMNS.pop();
      }
    } finally {
      db.close();
    }
  });
});
