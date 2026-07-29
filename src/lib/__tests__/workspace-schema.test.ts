import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { MIGRATION_COLUMNS, SCHEMA_SQL } from "@/lib/db/schema";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";

function createSchemaDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function insertTenant(db: Database.Database, id: string, slug: string): void {
  db.prepare(
    `INSERT INTO tenants (id, slug, name)
     VALUES (?, ?, ?)`,
  ).run(id, slug, `${slug} Tenant`);
}

function insertWorkspace(
  db: Database.Database,
  input: Partial<{
    id: string;
    tenantId: string;
    slug: string;
    name: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }> = {},
): void {
  db.prepare(
    `INSERT INTO workspaces (id, tenant_id, slug, name, status, created_at, updated_at)
     VALUES (@id, @tenantId, @slug, @name, COALESCE(@status, 'provisioning'),
             COALESCE(@createdAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
             COALESCE(@updatedAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
  ).run({
    id: input.id ?? WORKSPACE_A,
    tenantId: input.tenantId ?? TENANT_A,
    slug: input.slug ?? "primary-workspace",
    name: input.name ?? "Primary Workspace",
    status: input.status ?? null,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  });
}

describe("SQLite workspaces schema", () => {
  it("creates the seven-column schema with defaults, named constraints, candidate key, and index", () => {
    const db = createSchemaDatabase();
    try {
      const columns = db.prepare("PRAGMA table_info(workspaces)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;
      expect(columns.map((column) => column.name)).toEqual([
        "id",
        "tenant_id",
        "slug",
        "name",
        "status",
        "created_at",
        "updated_at",
      ]);
      expect(columns.every((column) => column.notnull === 1)).toBe(true);
      expect(columns[0]).toMatchObject({ type: "TEXT", pk: 1 });
      expect(columns.find((column) => column.name === "status")?.dflt_value).toBe("'provisioning'");
      expect(columns.find((column) => column.name === "created_at")?.dflt_value).toContain("strftime");
      expect(columns.find((column) => column.name === "updated_at")?.dflt_value).toContain("strftime");

      const indexNames = (db.prepare("PRAGMA index_list(workspaces)").all() as Array<{ name: string }>).map(
        (index) => index.name,
      );
      expect(indexNames).toContain("idx_workspaces_tenant_status_updated_at");

      const schemaSql = (db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'")
        .get() as { sql: string }).sql;
      for (const constraint of [
        "workspaces_id_format_chk",
        "workspaces_tenant_id_format_chk",
        "workspaces_slug_length_chk",
        "workspaces_slug_format_chk",
        "workspaces_tenant_slug_unique",
        "workspaces_tenant_id_id_unique",
        "workspaces_name_length_chk",
        "workspaces_status_chk",
      ]) {
        expect(schemaSql).toContain(constraint);
      }

      const foreignKey = db.prepare("PRAGMA foreign_key_list(workspaces)").get() as {
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
      };
      expect(foreignKey).toMatchObject({
        table: "tenants",
        from: "tenant_id",
        to: "id",
        on_update: "RESTRICT",
        on_delete: "RESTRICT",
      });
      expect(MIGRATION_COLUMNS.some((migration) => migration.table === "workspaces")).toBe(false);
    } finally {
      db.close();
    }
  });

  it("allows the same slug in different tenants but rejects a duplicate within one tenant", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "tenant-a");
      insertTenant(db, TENANT_B, "tenant-b");
      insertWorkspace(db, { slug: "shared-workspace" });
      insertWorkspace(db, {
        id: "10000000-0000-4000-8000-000000000002",
        tenantId: TENANT_B,
        slug: "shared-workspace",
        name: "Tenant B Workspace",
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE slug = ?").get("shared-workspace")).toMatchObject({
        count: 2,
      });
      expect(() => insertWorkspace(db, { id: "10000000-0000-4000-8000-000000000003", slug: "shared-workspace" })).toThrow(
        /UNIQUE|constraint/i,
      );
    } finally {
      db.close();
    }
  });

  it("rejects orphan workspaces and restricts tenant deletion while a workspace child exists", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "tenant-a");
      expect(() => insertWorkspace(db, { tenantId: "00000000-0000-4000-8000-000000000099" })).toThrow(/FOREIGN KEY|constraint/i);
      insertWorkspace(db);
      expect(() => db.prepare("DELETE FROM tenants WHERE id = ?").run(TENANT_A)).toThrow(/FOREIGN KEY|constraint/i);
    } finally {
      db.close();
    }
  });

  it("accepts the default and every approved lifecycle status, and rejects unknown status", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "tenant-a");
      insertWorkspace(db);
      expect(db.prepare("SELECT status FROM workspaces WHERE id = ?").get(WORKSPACE_A)).toMatchObject({ status: "provisioning" });
      for (const [index, status] of ["active", "paused", "archived", "deletion_pending", "deleted"].entries()) {
        insertWorkspace(db, {
          id: `10000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
          slug: `status-${index}`,
          status,
        });
      }
      expect(db.prepare("SELECT COUNT(*) AS count FROM workspaces").get()).toMatchObject({ count: 6 });
      expect(() => insertWorkspace(db, {
        id: "10000000-0000-4000-8000-000000000008",
        slug: "invalid-status",
        status: "suspended",
      })).toThrow(/CHECK|constraint/i);
    } finally {
      db.close();
    }
  });

  it("rejects malformed UUIDs, non-normalized slugs, and invalid names", () => {
    const db = createSchemaDatabase();
    try {
      insertTenant(db, TENANT_A, "tenant-a");
      expect(() => insertWorkspace(db, { id: "not-a-uuid" })).toThrow(/CHECK|constraint/i);
      expect(() => insertWorkspace(db, { tenantId: "not-a-uuid" })).toThrow(/CHECK|constraint/i);
      ["A-valid", "../workspace", "workspace/name", "-workspace", "workspace-", "workspace--name"].forEach((slug, index) => {
        expect(() => insertWorkspace(db, {
          id: `10000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
          slug,
        })).toThrow(/CHECK|constraint/i);
      });
      expect(() => insertWorkspace(db, {
        id: "10000000-0000-4000-8000-000000000010",
        slug: "blank-name",
        name: "   ",
      })).toThrow(/CHECK|constraint/i);
      expect(() => insertWorkspace(db, {
        id: "10000000-0000-4000-8000-000000000011",
        slug: "long-name",
        name: "x".repeat(121),
      })).toThrow(/CHECK|constraint/i);
    } finally {
      db.close();
    }
  });

  it("blocks tenant, identity, and slug mutation and touches updated_at with recursive triggers enabled", () => {
    const db = createSchemaDatabase();
    try {
      db.pragma("recursive_triggers = ON");
      insertTenant(db, TENANT_A, "tenant-a");
      insertTenant(db, TENANT_B, "tenant-b");
      insertWorkspace(db, {
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T00:00:00.000Z",
      });
      const before = db.prepare("SELECT created_at, updated_at FROM workspaces WHERE id = ?").get(WORKSPACE_A) as {
        created_at: string;
        updated_at: string;
      };

      db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run("Renamed Workspace", WORKSPACE_A);
      const after = db.prepare("SELECT created_at, updated_at FROM workspaces WHERE id = ?").get(WORKSPACE_A) as {
        created_at: string;
        updated_at: string;
      };
      expect(after.created_at).toBe(before.created_at);
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(after.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      expect(() => db.prepare("UPDATE workspaces SET id = ? WHERE id = ?").run(
        "10000000-0000-4000-8000-000000000012",
        WORKSPACE_A,
      )).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE workspaces SET tenant_id = ? WHERE id = ?").run(TENANT_B, WORKSPACE_A)).toThrow(/immutable/);
      expect(() => db.prepare("UPDATE workspaces SET slug = ? WHERE id = ?").run("renamed-workspace", WORKSPACE_A)).toThrow(/immutable/);
    } finally {
      db.close();
    }
  });

  it("preserves a legacy lead row during upgrade, creates tenants/workspaces, and keeps workspaces out of column migrations", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
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
      insertTenant(db, TENANT_A, "tenant-a");
      insertWorkspace(db);

      expect(db.prepare("SELECT name FROM leads WHERE id = ?").get("legacy-lead")).toMatchObject({ name: "Legacy Lead" });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get()).toBeTruthy();
      expect(MIGRATION_COLUMNS.some((migration) => migration.table === "workspaces")).toBe(false);
    } finally {
      db.close();
    }
  });
});
