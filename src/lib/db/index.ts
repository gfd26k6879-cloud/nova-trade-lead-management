import postgres, { type Sql, type TransactionSql } from "postgres";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";
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
  withStatementTimeout?<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T>;
  withTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

let _db: DbClient | null = null;
let _pg: Sql | null = null;
const scopedDbClient = new AsyncLocalStorage<DbClient>();

export async function getDb(): Promise<DbClient> {
  const scoped = scopedDbClient.getStore();
  if (scoped) return scoped;
  if (_db) return _db;

  if (process.env.DATABASE_URL?.trim()) {
    _pg = createPostgresClient();
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
  rebuildSqliteLeadsForEnrichmentStatusConstraint(db);
}

function rebuildSqliteLeadsForEnrichmentStatusConstraint(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql) return;

  const existingColumns = getSqliteColumnNames(db, "leads");
  const statusConstraintIsCurrent = row.sql.includes("'running'") && row.sql.includes("'retry_wait'") && row.sql.includes("'error'");
  const leaseColumnsExist = [
    "enrichment_attempt_count",
    "enrichment_started_at",
    "enrichment_finished_at",
    "enrichment_next_retry_at",
    "enrichment_last_error",
    "enrichment_last_error_code",
    "enrichment_max_attempts",
  ].every((column) => existingColumns.has(column));
  if (statusConstraintIsCurrent && leaseColumnsExist) return;

  const tempTable = "leads__launch_readiness_migration";
  const createLeadsSql = extractCreateTableSql("leads").replace(
    "CREATE TABLE IF NOT EXISTS leads",
    `CREATE TABLE ${tempTable}`,
  );

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`DROP TABLE IF EXISTS ${tempTable}`);
    db.exec(createLeadsSql);
    const nextColumns = getSqliteColumnNames(db, tempTable);
    const copiedColumns = Array.from(existingColumns).filter((column) => nextColumns.has(column));
    const columnSql = copiedColumns.map(quoteSqliteIdentifier).join(", ");
    db.exec(`INSERT INTO ${tempTable} (${columnSql}) SELECT ${columnSql} FROM leads`);
    db.exec("DROP TABLE leads");
    db.exec(`ALTER TABLE ${tempTable} RENAME TO leads`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    try {
      db.exec(`DROP TABLE IF EXISTS ${tempTable}`);
    } catch {
      // Keep the original migration error.
    }
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function getSqliteColumnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function extractCreateTableSql(table: string): string {
  const startMarker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = SCHEMA_SQL.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not find ${table} table schema.`);

  let depth = 0;
  for (let index = start; index < SCHEMA_SQL.length; index++) {
    const char = SCHEMA_SQL[index];
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) {
        return `${SCHEMA_SQL.slice(start, index + 1)};`;
      }
    }
  }
  throw new Error(`Could not parse ${table} table schema.`);
}

function quoteSqliteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
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

  async withStatementTimeout<T>(_timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec("BEGIN IMMEDIATE");
    try {
      const result = await scopedDbClient.run(this, fn);
      await this.exec("COMMIT");
      return result;
    } catch (error) {
      await this.exec("ROLLBACK");
      throw error;
    }
  }
}

class PostgresClient implements DbClient {
  constructor(
    private readonly sql: Sql | TransactionSql,
    private readonly scoped = false,
  ) {}

  prepare(query: string): DbStatement {
    const pgQuery = normalizePostgresQuery(query);
    return {
      get: async <T = Record<string, unknown>>(...params: unknown[]) => {
        return this.runReadQuery(pgQuery, async (sql) => {
          const rows = await sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
          return rows[0] as T | undefined;
        });
      },
      all: async <T = Record<string, unknown>>(...params: unknown[]) => {
        return this.runReadQuery(pgQuery, async (sql) => {
          const rows = await sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
          return rows as unknown as T[];
        });
      },
      run: async (...params) => {
        try {
          const rows = await this.sql.unsafe(pgQuery, normalizePostgresParams(params) as never[]);
      return { changes: rows.count ?? 0 };
        } catch (error) {
          if (isTransientPostgresConnectionError(error)) {
            await resetPostgresClient(this.sql as Sql);
          }
          throw error;
        }
      },
    };
  }

  async exec(query: string): Promise<void> {
    await this.sql.unsafe(query);
  }

  async withStatementTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    const safeTimeoutMs = Math.max(1, Math.min(60_000, Math.floor(timeoutMs)));
    try {
      if (this.scoped) return fn();
      const result = await (this.sql as Sql).begin(async (sql) => {
        await sql.unsafe(`SET LOCAL statement_timeout = ${safeTimeoutMs}`);
        return scopedDbClient.run(new PostgresClient(sql, true), fn);
      });
      return result as T;
    } catch (error) {
      if (isDbStatementTimeoutError(error) || isTransientPostgresConnectionError(error)) {
        await resetPostgresClient(this.sql as Sql);
      }
      throw error;
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.scoped) return fn();
    try {
      const result = await (this.sql as Sql).begin(async (sql) => {
        return scopedDbClient.run(new PostgresClient(sql, true), fn);
      });
      return result as T;
    } catch (error) {
      if (isTransientPostgresConnectionError(error)) {
        await resetPostgresClient(this.sql as Sql);
      }
      throw error;
    }
  }

  private async runReadQuery<T>(
    query: string,
    run: (sql: Sql | TransactionSql) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.sql);
    } catch (error) {
      if (this.scoped || !isReadOnlyQuery(query) || !isTransientPostgresConnectionError(error)) {
        throw error;
      }

      const sql = await resetPostgresClient(this.sql as Sql);
      return run(sql);
    }
  }
}

function createPostgresClient(): Sql {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  return postgres(databaseUrl, {
    ssl: "require",
    prepare: false,
    max: getPostgresMaxConnections(),
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

function getPostgresMaxConnections(): number {
  const configured = Number(process.env.POSTGRES_MAX_CONNECTIONS);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return process.env.VERCEL ? 1 : 5;
}

export async function withDbStatementTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  if (typeof db.withStatementTimeout === "function") {
    return db.withStatementTimeout(timeoutMs, fn);
  }
  return fn();
}

export async function withDbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  if (typeof db.withTransaction === "function") {
    return db.withTransaction(fn);
  }
  return fn();
}

export async function resetDbClient(): Promise<void> {
  const current = _pg;
  _pg = null;
  _db = null;

  if (!current) return;

  try {
    await current.end({ timeout: 1 });
  } catch {
    // The socket may already be gone. The next request will create a fresh client.
  }
}

export function isDbStatementTimeoutError(error: unknown): boolean {
  const maybe = error as { code?: unknown; message?: unknown };
  const message = error instanceof Error ? error.message : String(maybe?.message ?? error ?? "");
  return maybe?.code === "57014" || /canceling statement due to statement timeout|statement timeout/i.test(message);
}

export function isTransientDbError(error: unknown): boolean {
  return isDbStatementTimeoutError(error) || isTransientPostgresConnectionError(error);
}

async function resetPostgresClient(current: Sql): Promise<Sql> {
  if (_pg === current) {
    _pg = null;
    _db = null;
  }

  try {
    await current.end({ timeout: 1 });
  } catch {
    // The socket is already unhealthy; closing best-effort is enough.
  }

  _pg = createPostgresClient();
  _db = new PostgresClient(_pg);
  return _pg;
}

function isReadOnlyQuery(query: string): boolean {
  const normalized = query.trim().toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("WITH");
}

function isTransientPostgresConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connection (closed|terminated)|connection refused|econnreset|etimedout|timeout|socket|server closed the connection/i.test(message);
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
