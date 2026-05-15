import postgres, { type Sql } from "postgres";
import path from "path";
import { SCHEMA_SQL, MIGRATION_COLUMNS } from "./schema";
import { classifyBusinessType, isBusinessType } from "@/lib/business-types";
import type Database from "better-sqlite3";

export interface DbRunResult {
  changes: number;
}

export interface DbStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<DbRunResult>;
}

export interface DbClient {
  prepare(query: string): DbStatement;
  exec(query: string): Promise<void>;
}

let _db: DbClient | null = null;
let _pg: Sql | null = null;

export async function getDb(): Promise<DbClient> {
  if (_db) return _db;

  if (process.env.DATABASE_URL?.trim()) {
    _pg = postgres(process.env.DATABASE_URL, {
      ssl: "require",
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
    });
    _db = new PostgresClient(_pg);
    return _db;
  }

  const dbPath = path.join(process.cwd(), "nosite-leads.db");
  const { default: DatabaseFactory } = await import("better-sqlite3");
  const sqlite = new DatabaseFactory(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  // Run additive migrations first so newly referenced index columns exist on upgraded databases.
  runSqliteMigrations(sqlite);
  sqlite.exec(SCHEMA_SQL);
  await backfillLeadBusinessTypes(new SqliteClient(sqlite));

  _db = new SqliteClient(sqlite);
  return _db;
}

function runSqliteMigrations(db: Database.Database): void {
  for (const { table, column, type } of MIGRATION_COLUMNS) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      // Column already exists, safe to ignore.
    }
  }
}

class SqliteClient implements DbClient {
  constructor(private readonly db: Database.Database) {}

  prepare(query: string): DbStatement {
    const stmt = this.db.prepare(query);
    return {
      get: async <T = Record<string, unknown>>(...params: unknown[]) => stmt.get(...params) as T | undefined,
      all: async <T = Record<string, unknown>>(...params: unknown[]) => stmt.all(...params) as T[],
      run: async (...params) => {
        const result = stmt.run(...params);
        return { changes: result.changes };
      },
    };
  }

  async exec(query: string): Promise<void> {
    this.db.exec(query);
  }
}

class PostgresClient implements DbClient {
  constructor(private readonly sql: Sql) {}

  prepare(query: string): DbStatement {
    const pgQuery = normalizePostgresQuery(query);
    return {
      get: async <T = Record<string, unknown>>(...params: unknown[]) => {
        const rows = await this.sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
        return rows[0] as T | undefined;
      },
      all: async <T = Record<string, unknown>>(...params: unknown[]) => {
        const rows = await this.sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
        return rows as unknown as T[];
      },
      run: async (...params) => {
        const rows = await this.sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
        return { changes: rows.count ?? 0 };
      },
    };
  }

  async exec(query: string): Promise<void> {
    await this.sql.unsafe(query);
  }
}

function normalizePostgresParams(params: unknown[]): unknown[] {
  return params.map((param) => {
    if (Array.isArray(param) || (param && typeof param === "object" && !(param instanceof Date))) {
      return JSON.stringify(param);
    }
    return param;
  });
}

function normalizePostgresQuery(query: string): string {
  let normalized = query
    .replace(/datetime\('now', '-5 minutes'\)/g, "(now() - interval '5 minutes')")
    .replace(/datetime\('now', '-' \|\| \? \|\| ' days'\)/g, "(now() - (?::int * interval '1 day'))")
    .replace(/datetime\('now'\)/g, "now()")
    .replace(/datetime\(\?\)/g, "(?::timestamptz)")
    .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
    .replace(/julianday\('now'\) - julianday\(([^)]+)\)/g, "EXTRACT(EPOCH FROM (now() - $1::timestamptz)) / 86400")
    .replace(/julianday\(([^)]+)\)\s*-\s*julianday\(([^)]+)\)/g, "EXTRACT(EPOCH FROM (($1)::timestamptz - ($2)::timestamptz)) / 86400")
    .replace(/julianday\(([^)]+)\)\s*>\s*julianday\(([^)]+)\)/g, "($1)::timestamptz > ($2)::timestamptz")
    .replace(/julianday\(([^)]+)\)\s*<=\s*julianday\(([^)]+)\)/g, "($1)::timestamptz <= ($2)::timestamptz");

  let index = 0;
  normalized = normalized.replace(/\?/g, () => `$${++index}`);
  return normalized;
}

export async function backfillLeadBusinessTypes(db?: DbClient): Promise<void> {
  const client = db ?? await getDb();
  const rows = await client.prepare(
    `SELECT id, primary_type, categories, business_type
     FROM leads
     WHERE business_type IS NULL OR business_type = '' OR business_type = 'local_services'`
  ).all<{ id: string; primary_type: string | null; categories: unknown; business_type: string | null }>();

  if (rows.length === 0) return;

  const update = client.prepare("UPDATE leads SET business_type = ?, updated_at = ? WHERE id = ?");
  const now = nowISO();
  for (const row of rows) {
    if (row.business_type && isBusinessType(row.business_type) && row.business_type !== "local_services") {
      continue;
    }
    const categories = parseCategories(row.categories);
    const businessType = classifyBusinessType({ primaryType: row.primary_type, categories });
    await update.run(businessType, now, row.id);
  }
}

function parseCategories(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export async function closeDb(): Promise<void> {
  if (_pg) {
    await _pg.end({ timeout: 5 });
    _pg = null;
  }
  _db = null;
}
