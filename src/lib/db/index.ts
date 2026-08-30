import postgres, { type Sql, type TransactionSql } from "postgres";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";
import { SCHEMA_SQL, MIGRATION_COLUMNS } from "./schema";
import { classifyBusinessType, isBusinessType } from "@/lib/business-types";
import { getTenantContext, type TenantContext } from "@/lib/tenancy/context";
import { getWorkerTenantContext, type WorkerTenantContext } from "@/lib/tenancy/worker-context";
import { getSupportAccessContext, type SupportAccessContext } from "@/lib/tenancy/support-access";
import { isTenantRole } from "@/lib/permissions";
import type Database from "better-sqlite3";

export interface DbRunResult {
  changes: number;
}

export interface DbStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<DbRunResult>;
}

export interface TenantSessionBootstrapInput {
  readonly authIdentityId: string;
  readonly tenantId: string | null;
  readonly workspaceSelectorProvided: boolean;
  readonly workspaceId: string | null;
}

export interface DbClient {
  prepare(query: string): DbStatement;
  exec(query: string): Promise<void>;
  /** PostgreSQL-only pre-GUC member resolver; SQLite intentionally omits it. */
  resolveTenantSessionBootstrap?(input: TenantSessionBootstrapInput): Promise<readonly Record<string, unknown>[]>;
  withStatementTimeout?<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T>;
  withTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

export type TenantDbContextSource = "member" | "worker" | "support";

export interface TenantDbContext {
  readonly source: TenantDbContextSource;
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly actorId: string | null;
  readonly membershipId: string | null;
  readonly role: string | null;
  readonly roleBindingId: string | null;
  readonly supportGrantId: string | null;
  readonly jobId: string | null;
  readonly runId: string | null;
  readonly leaseId: string | null;
  readonly leaseGeneration: number | null;
  readonly workerName: string | null;
  readonly workerAction: string | null;
  readonly workerPrincipalKind: string | null;
  readonly correlationId: string;
}

export type TenantDbContextErrorCode =
  | "TENANT_DB_CONTEXT_REQUIRED"
  | "TENANT_DB_CONTEXT_INVALID"
  | "TENANT_DB_CONTEXT_CONFLICT"
  | "TENANT_DB_CONTEXT_UNAVAILABLE"
  | "TENANT_DB_CONTEXT_INSTALL_FAILED";

const TENANT_DB_CONTEXT_ERROR_MESSAGES: Readonly<Record<TenantDbContextErrorCode, string>> = {
  TENANT_DB_CONTEXT_REQUIRED: "A tenant database context is required",
  TENANT_DB_CONTEXT_INVALID: "The tenant database context is invalid",
  TENANT_DB_CONTEXT_CONFLICT: "The tenant database context conflicts with the active scope",
  TENANT_DB_CONTEXT_UNAVAILABLE: "A transaction-scoped database client is required",
  TENANT_DB_CONTEXT_INSTALL_FAILED: "The tenant database context could not be installed",
};

export class TenantDbContextError extends Error {
  readonly code: TenantDbContextErrorCode;

  constructor(code: TenantDbContextErrorCode) {
    super(TENANT_DB_CONTEXT_ERROR_MESSAGES[code]);
    this.name = "TenantDbContextError";
    this.code = code;
  }
}

let _db: DbClient | null = null;
let _pg: Sql | null = null;
const scopedDbClient = new AsyncLocalStorage<DbClient>();
const tenantDbContextStorage = new AsyncLocalStorage<TenantDbContext>();

const TENANT_DB_CONTEXT_GUC_NAMES = [
  "app.tenant_id",
  "app.workspace_id",
  "app.actor_id",
  "app.membership_id",
  "app.role",
  "app.role_binding_id",
  "app.support_grant_id",
  "app.job_id",
  "app.run_id",
  "app.lease_id",
  "app.lease_generation",
  "app.worker_name",
  "app.worker_action",
  "app.worker_principal_kind",
  "app.correlation_id",
] as const;

const TENANT_DB_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_DB_TEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

interface TransactionContextInstaller {
  installTransactionLocalContext(entries: readonly (readonly [string, string])[]): Promise<void>;
}

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

export function runSqliteMigrations(db: Database.Database): void {
  for (const { table, column, type } of MIGRATION_COLUMNS) {
    const tableExists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    if (!tableExists) continue;

    try {
      db.exec(`ALTER TABLE ${quoteSqliteIdentifier(table)} ADD COLUMN ${quoteSqliteIdentifier(column)} ${type}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== `duplicate column name: ${column}`) throw error;
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
  private transactionTail: Promise<void> = Promise.resolve();

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

  async installTransactionLocalContext(entries: readonly (readonly [string, string])[]): Promise<void> {
    // SQLite has no transaction-local session variables. The callback-scoped
    // AsyncLocalStorage context below provides the equivalent scope assertion;
    // SQLite is not Postgres RLS evidence.
    void entries;
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (scopedDbClient.getStore() === this) return fn();

    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    let began = false;
    try {
      await this.exec("BEGIN IMMEDIATE");
      began = true;
      const result = await scopedDbClient.run(this, fn);
      await this.exec("COMMIT");
      return result;
    } catch (error) {
      if (began) await this.exec("ROLLBACK");
      throw error;
    } finally {
      release();
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

  async resolveTenantSessionBootstrap(input: TenantSessionBootstrapInput): Promise<Record<string, unknown>[]> {
    return this.prepare(
      `SELECT tenant_id, workspace_id, membership_id, role, role_binding_id
       FROM public.novatrade_resolve_tenant_session(?, ?, ?, ?)`,
    ).all(
      input.authIdentityId,
      input.tenantId,
      input.workspaceSelectorProvided,
      input.workspaceId,
    );
  }

  async installTransactionLocalContext(entries: readonly (readonly [string, string])[]): Promise<void> {
    for (const [name, value] of entries) {
      await this.sql.unsafe(
        "SELECT set_config($1, $2, true)",
        [name, value] as never[],
      );
    }
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
    ssl: process.env.NODE_ENV === "test" && process.env.DATABASE_SSL === "disable" ? false : "require",
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

/**
 * Runs a tenant-owned query only inside a transaction that has first received
 * server-accepted T-014 member, T-017 worker, or T-021 service-installed
 * support authority. A support context cannot be caller-constructed.
 */
export async function withTenantDbContext<T>(callback: (db: DbClient) => Promise<T>): Promise<T> {
  if (arguments.length !== 1 || typeof callback !== "function") {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_INVALID");
  }

  const context = resolveTenantDbContext();
  const active = tenantDbContextStorage.getStore();
  if (active) {
    if (!sameTenantDbContext(active, context)) {
      throw new TenantDbContextError("TENANT_DB_CONTEXT_CONFLICT");
    }
    const transactionDb = scopedDbClient.getStore();
    if (!transactionDb) throw new TenantDbContextError("TENANT_DB_CONTEXT_UNAVAILABLE");
    return tenantDbContextStorage.run(active, () => callback(transactionDb));
  }

  const db = await getDb();
  if (typeof db.withTransaction !== "function") {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_UNAVAILABLE");
  }

  return db.withTransaction(async () => {
    const transactionDb = scopedDbClient.getStore();
    if (!transactionDb) {
      throw new TenantDbContextError("TENANT_DB_CONTEXT_UNAVAILABLE");
    }

    const installer = transactionDb as DbClient & TransactionContextInstaller;
    if (typeof installer.installTransactionLocalContext !== "function") {
      throw new TenantDbContextError("TENANT_DB_CONTEXT_UNAVAILABLE");
    }

    try {
      await installer.installTransactionLocalContext(buildTenantDbContextGucEntries(context));
    } catch {
      throw new TenantDbContextError("TENANT_DB_CONTEXT_INSTALL_FAILED");
    }

    return tenantDbContextStorage.run(context, () => callback(transactionDb));
  });
}

export function getTenantDbContext(): TenantDbContext | null {
  return tenantDbContextStorage.getStore() ?? null;
}

function resolveTenantDbContext(): TenantDbContext {
  const memberContext = getTenantContext();
  const workerContext = getWorkerTenantContext();
  const supportContext = getSupportAccessContext();
  if ((memberContext ? 1 : 0) + (workerContext ? 1 : 0) + (supportContext ? 1 : 0) > 1) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_CONFLICT");
  }
  if (!memberContext && !workerContext && !supportContext) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_REQUIRED");
  }

  if (memberContext) return createMemberDbContext(memberContext);
  if (workerContext) return createWorkerDbContext(workerContext);
  return createSupportDbContext(supportContext as SupportAccessContext);
}

function createMemberDbContext(context: TenantContext): TenantDbContext {
  if (
    !isTenantDbUuid(context.tenantId) ||
    (context.workspaceId !== null && !isTenantDbUuid(context.workspaceId)) ||
    !isTenantDbUuid(context.membershipId) ||
    !isTenantRole(context.role) ||
    !isTenantDbUuid(context.roleBindingId) ||
    !isTenantDbUuid(context.actorAuthIdentityId) ||
    !isTenantDbText(context.correlationId)
  ) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_INVALID");
  }

  return Object.freeze({
    source: "member",
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.actorAuthIdentityId,
    membershipId: context.membershipId,
    role: context.role,
    roleBindingId: context.roleBindingId,
    supportGrantId: null,
    jobId: null,
    runId: null,
    leaseId: null,
    leaseGeneration: null,
    workerName: null,
    workerAction: null,
    workerPrincipalKind: null,
    correlationId: context.correlationId,
  });
}

function createWorkerDbContext(context: WorkerTenantContext): TenantDbContext {
  if (
    !isTenantDbUuid(context.tenantId) ||
    (context.workspaceId !== null && !isTenantDbUuid(context.workspaceId)) ||
    !isTenantDbUuid(context.jobId) ||
    !isTenantDbUuid(context.runId) ||
    !isTenantDbUuid(context.leaseId) ||
    !Number.isSafeInteger(context.leaseGeneration) ||
    context.leaseGeneration < 1 ||
    !isTenantDbText(context.workerName) ||
    !isTenantDbText(context.action) ||
    (context.sourcePrincipalKind !== "cron" && context.sourcePrincipalKind !== "session") ||
    !isTenantDbText(context.correlationId)
  ) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_INVALID");
  }

  return Object.freeze({
    source: "worker",
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: null,
    membershipId: null,
    role: null,
    roleBindingId: null,
    supportGrantId: null,
    jobId: context.jobId,
    runId: context.runId,
    leaseId: context.leaseId,
    leaseGeneration: context.leaseGeneration,
    workerName: context.workerName,
    workerAction: context.action,
    workerPrincipalKind: context.sourcePrincipalKind,
    correlationId: context.correlationId,
  });
}

function createSupportDbContext(context: SupportAccessContext): TenantDbContext {
  if (
    context.source !== "support" ||
    !isTenantDbUuid(context.tenantId) ||
    (context.workspaceId !== null && !isTenantDbUuid(context.workspaceId)) ||
    !isTenantDbUuid(context.supportActorAuthIdentityId) ||
    !isTenantDbUuid(context.supportGrantId) ||
    !isTenantDbUuid(context.auditEventId) ||
    !isTenantDbText(context.correlationId) ||
    !isTenantDbText(context.attemptId) ||
    !isTenantDbText(context.permission) ||
    !Array.isArray(context.dataClasses) ||
    context.dataClasses.length === 0 ||
    !isTenantDbText(context.startsAt) ||
    !isTenantDbText(context.expiresAt)
  ) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_INVALID");
  }

  return Object.freeze({
    source: "support",
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.supportActorAuthIdentityId,
    membershipId: null,
    role: null,
    roleBindingId: null,
    supportGrantId: context.supportGrantId,
    jobId: null,
    runId: null,
    leaseId: null,
    leaseGeneration: null,
    workerName: null,
    workerAction: null,
    workerPrincipalKind: null,
    correlationId: context.correlationId,
  });
}

function buildTenantDbContextGucEntries(context: TenantDbContext): readonly (readonly [string, string])[] {
  const entries: readonly (readonly [string, string])[] = [
    ["app.tenant_id", context.tenantId],
    ["app.workspace_id", context.workspaceId ?? ""],
    ["app.actor_id", context.actorId ?? ""],
    ["app.membership_id", context.membershipId ?? ""],
    ["app.role", context.role ?? ""],
    ["app.role_binding_id", context.roleBindingId ?? ""],
    ["app.support_grant_id", context.supportGrantId ?? ""],
    ["app.job_id", context.jobId ?? ""],
    ["app.run_id", context.runId ?? ""],
    ["app.lease_id", context.leaseId ?? ""],
    ["app.lease_generation", context.leaseGeneration === null ? "" : String(context.leaseGeneration)],
    ["app.worker_name", context.workerName ?? ""],
    ["app.worker_action", context.workerAction ?? ""],
    ["app.worker_principal_kind", context.workerPrincipalKind ?? ""],
    ["app.correlation_id", context.correlationId],
  ];
  if (entries.length !== TENANT_DB_CONTEXT_GUC_NAMES.length) {
    throw new TenantDbContextError("TENANT_DB_CONTEXT_INVALID");
  }
  return entries;
}

function sameTenantDbContext(left: TenantDbContext, right: TenantDbContext): boolean {
  return TENANT_DB_CONTEXT_GUC_NAMES.every((name) => {
    const leftValue = tenantDbContextGucValue(left, name);
    const rightValue = tenantDbContextGucValue(right, name);
    return leftValue === rightValue;
  });
}

function tenantDbContextGucValue(context: TenantDbContext, name: (typeof TENANT_DB_CONTEXT_GUC_NAMES)[number]): string {
  switch (name) {
    case "app.tenant_id": return context.tenantId;
    case "app.workspace_id": return context.workspaceId ?? "";
    case "app.actor_id": return context.actorId ?? "";
    case "app.membership_id": return context.membershipId ?? "";
    case "app.role": return context.role ?? "";
    case "app.role_binding_id": return context.roleBindingId ?? "";
    case "app.support_grant_id": return context.supportGrantId ?? "";
    case "app.job_id": return context.jobId ?? "";
    case "app.run_id": return context.runId ?? "";
    case "app.lease_id": return context.leaseId ?? "";
    case "app.lease_generation": return context.leaseGeneration === null ? "" : String(context.leaseGeneration);
    case "app.worker_name": return context.workerName ?? "";
    case "app.worker_action": return context.workerAction ?? "";
    case "app.worker_principal_kind": return context.workerPrincipalKind ?? "";
    case "app.correlation_id": return context.correlationId;
  }
}

function isTenantDbUuid(value: unknown): value is string {
  return typeof value === "string" && TENANT_DB_UUID_PATTERN.test(value);
}

function isTenantDbText(value: unknown): value is string {
  return typeof value === "string" && TENANT_DB_TEXT_PATTERN.test(value);
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
