import "server-only";

import type { DbClient } from "@/lib/db";
import {
  INTERNAL_WORKER_ACTIONS,
  type InternalWorkerAction,
  type TenantWorkerLeaseRecord,
} from "@/lib/internal-worker-auth";
import type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";
import {
  createTenantWorkerLeaseIssuer,
  createTenantWorkerLeaseResolver,
  type TenantWorkerLeaseIssuer,
} from "@/lib/tenancy/worker-lease-store";

const ISSUER_DATABASE_URL_ENV = "TENANT_WORKER_LEASE_ISSUER_DATABASE_URL";
const RESOLVER_DATABASE_URL_ENV = "TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL";
const POSTGRES_DISPOSERS = new WeakMap<DbClient, () => Promise<void>>();
const ROLE_INSPECTION_KEYS = Object.freeze([
  "currentUser",
  "canLogin",
  "isSuperuser",
  "inheritsPrivileges",
  "canCreateDatabase",
  "canCreateRole",
  "canReplicate",
  "bypassesRls",
  "hasRoleMemberships",
  "ownsCurrentDatabase",
  "isCurrentDatabaseOwnerMember",
  "canCreateDatabaseObjects",
  "hasSchemaUsage",
  "canCreateSchemaObjects",
  "canAcquire",
  "canCancel",
  "canResolve",
  "canValidate",
  "canSelectAnyLeaseColumn",
  "canInsertAnyLeaseColumn",
  "canUpdateAnyLeaseColumn",
  "canReferenceAnyLeaseColumn",
  "canSelectLeaseTable",
  "canInsertLeaseTable",
  "canUpdateLeaseTable",
  "canDeleteLeaseTable",
  "canTruncateLeaseTable",
  "canReferenceLeaseTable",
  "canTriggerLeaseTable",
] as const);

const ROLE_INSPECTION_SQL = `SELECT
  CURRENT_USER AS "currentUser",
  role.rolcanlogin AS "canLogin",
  role.rolsuper AS "isSuperuser",
  role.rolinherit AS "inheritsPrivileges",
  role.rolcreatedb AS "canCreateDatabase",
  role.rolcreaterole AS "canCreateRole",
  role.rolreplication AS "canReplicate",
  role.rolbypassrls AS "bypassesRls",
  database.datdba=role.oid AS "ownsCurrentDatabase",
  pg_catalog.pg_has_role(CURRENT_USER,'pg_database_owner','MEMBER') AS "isCurrentDatabaseOwnerMember",
  pg_catalog.has_database_privilege(CURRENT_USER,CURRENT_DATABASE(),'CREATE') AS "canCreateDatabaseObjects",
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member=role.oid OR membership.roleid=role.oid
  ) AS "hasRoleMemberships",
  pg_catalog.has_schema_privilege(CURRENT_USER,'public','USAGE') AS "hasSchemaUsage",
  pg_catalog.has_schema_privilege(CURRENT_USER,'public','CREATE') AS "canCreateSchemaObjects",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') AS "canAcquire",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') AS "canCancel",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_resolve_tenant_worker_lease(text,text,text)','EXECUTE') AS "canResolve",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_validate_tenant_worker_lease()','EXECUTE') AS "canValidate",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','SELECT') AS "canSelectAnyLeaseColumn",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','INSERT') AS "canInsertAnyLeaseColumn",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','UPDATE') AS "canUpdateAnyLeaseColumn",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','REFERENCES') AS "canReferenceAnyLeaseColumn",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','SELECT') AS "canSelectLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','INSERT') AS "canInsertLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','UPDATE') AS "canUpdateLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','DELETE') AS "canDeleteLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','TRUNCATE') AS "canTruncateLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','REFERENCES') AS "canReferenceLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','TRIGGER') AS "canTriggerLeaseTable"
FROM pg_catalog.pg_roles AS role
JOIN pg_catalog.pg_database AS database ON database.datname=CURRENT_DATABASE()
WHERE role.rolname=CURRENT_USER`;

export interface WorkerLeaseRuntimeEnvironment {
  readonly DATABASE_URL?: string;
  readonly TENANT_WORKER_LEASE_ISSUER_DATABASE_URL?: string;
  readonly TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL?: string;
}

export type WorkerLeaseRuntimeConnectionFactory = (databaseUrl: string) => Promise<DbClient>;

export interface WorkerLeaseIssuerRuntimeOptions {
  readonly env?: WorkerLeaseRuntimeEnvironment;
  readonly connect?: WorkerLeaseRuntimeConnectionFactory;
}

export type WorkerLeaseResolverRuntimeOptions = WorkerLeaseIssuerRuntimeOptions;
export type BoundWorkerLeaseResolver = (selector: string) => Promise<TenantWorkerLeaseRecord | null>;

export class WorkerLeaseRuntimeUnavailableError extends Error {
  readonly code = "WORKER_LEASE_RUNTIME_UNAVAILABLE" as const;

  constructor() {
    super("Worker lease runtime is unavailable");
    this.name = "WorkerLeaseRuntimeUnavailableError";
  }
}

export function createWorkerLeaseIssuerRuntime(
  options: WorkerLeaseIssuerRuntimeOptions = {},
): TenantWorkerLeaseIssuer {
  const env = options.env ?? runtimeEnvironmentFromProcess();
  const database = requireDedicatedDatabaseUrl(env, ISSUER_DATABASE_URL_ENV);
  const db = createVerifiedDbProvider(database, "issuer", options.connect ?? connectPostgres);
  const issuer = createTenantWorkerLeaseIssuer({
    db,
  });

  return Object.freeze({
    acquire: (input: Parameters<TenantWorkerLeaseIssuer["acquire"]>[0]) =>
      sanitizedRuntimeCall(() => issuer.acquire(input)),
    cancel: (record: Parameters<TenantWorkerLeaseIssuer["cancel"]>[0]) =>
      sanitizedRuntimeCall(() => issuer.cancel(record)),
  });
}

export function createWorkerLeaseResolverRuntime(
  expected: Readonly<{ workerName: SchedulerWorkerName; action: InternalWorkerAction }>,
  options: WorkerLeaseResolverRuntimeOptions = {},
): BoundWorkerLeaseResolver {
  const binding = snapshotWorkerActionBinding(expected);
  if (!binding) throw new WorkerLeaseRuntimeUnavailableError();
  const env = options.env ?? runtimeEnvironmentFromProcess();
  const database = requireDedicatedDatabaseUrl(env, RESOLVER_DATABASE_URL_ENV);
  const db = createVerifiedDbProvider(database, "resolver", options.connect ?? connectPostgres);
  const resolver = createTenantWorkerLeaseResolver({ db });
  const bound = (selector: string) => sanitizedRuntimeCall(() => resolver.resolve(selector, binding));
  return Object.freeze(bound);
}

export function createFailClosedWorkerLeaseResolverRuntime(
  expected: Readonly<{ workerName: SchedulerWorkerName; action: InternalWorkerAction }>,
  options: WorkerLeaseResolverRuntimeOptions = {},
): BoundWorkerLeaseResolver {
  const binding = snapshotWorkerActionBinding(expected);
  let resolver: BoundWorkerLeaseResolver | null = null;

  const lazy = async (selector: string): Promise<TenantWorkerLeaseRecord | null> => {
    if (!binding) return null;
    const candidate = resolver ?? (() => {
      try {
        return createWorkerLeaseResolverRuntime(binding, options);
      } catch {
        return null;
      }
    })();
    if (!candidate) return null;
    try {
      const record = await candidate(selector);
      resolver ??= candidate;
      return record;
    } catch {
      return null;
    }
  };

  return Object.freeze(lazy);
}

function runtimeEnvironmentFromProcess(): WorkerLeaseRuntimeEnvironment {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    TENANT_WORKER_LEASE_ISSUER_DATABASE_URL: process.env.TENANT_WORKER_LEASE_ISSUER_DATABASE_URL,
    TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL: process.env.TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL,
  };
}

function requireDedicatedDatabaseUrl(
  env: WorkerLeaseRuntimeEnvironment,
  ownKey: typeof ISSUER_DATABASE_URL_ENV | typeof RESOLVER_DATABASE_URL_ENV,
): Readonly<{ url: string; role: string }> {
  const own = parseDatabaseUrl(env[ownKey]);
  const peers = [
    ownKey === ISSUER_DATABASE_URL_ENV ? env[RESOLVER_DATABASE_URL_ENV] : env[ISSUER_DATABASE_URL_ENV],
    env.DATABASE_URL,
  ].filter((value): value is string => Boolean(value?.trim())).map(parseDatabaseUrl);
  if (peers.some((peer) => peer.role === own.role || peer.url === own.url)) {
    throw new WorkerLeaseRuntimeUnavailableError();
  }
  return own;
}

function parseDatabaseUrl(value: string | undefined): Readonly<{ url: string; role: string }> {
  const trimmed = value?.trim();
  if (!trimmed) throw new WorkerLeaseRuntimeUnavailableError();
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.username || !parsed.hostname) {
      throw new WorkerLeaseRuntimeUnavailableError();
    }
    const role = decodeURIComponent(parsed.username);
    if (!role || /[\u0000-\u001f\u007f]/u.test(role)) throw new WorkerLeaseRuntimeUnavailableError();
    return Object.freeze({ url: parsed.toString(), role });
  } catch {
    throw new WorkerLeaseRuntimeUnavailableError();
  }
}

function createVerifiedDbProvider(
  database: Readonly<{ url: string; role: string }>,
  capability: "issuer" | "resolver",
  connect: WorkerLeaseRuntimeConnectionFactory,
): () => Promise<DbClient> {
  let connection: Promise<DbClient> | null = null;
  return () => {
    connection ??= Promise.resolve()
      .then(() => connect(database.url))
      .then(async (db) => {
        try {
          await verifyRestrictedRole(db, database.role, capability);
          return db;
        } catch (error) {
          await disposeFailedPostgresConnection(db);
          throw error;
        }
      })
      .catch(() => {
        throw new WorkerLeaseRuntimeUnavailableError();
      });
    return connection;
  };
}

function snapshotWorkerActionBinding(
  value: unknown,
): Readonly<{ workerName: SchedulerWorkerName; action: InternalWorkerAction }> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes("workerName") || !keys.includes("action")) return null;
  const workerNameDescriptor = Object.getOwnPropertyDescriptor(value, "workerName");
  const actionDescriptor = Object.getOwnPropertyDescriptor(value, "action");
  if (workerNameDescriptor?.enumerable !== true || !("value" in workerNameDescriptor) ||
      actionDescriptor?.enumerable !== true || !("value" in actionDescriptor)) return null;
  const workerName = workerNameDescriptor.value;
  const action = actionDescriptor.value;
  if (typeof workerName !== "string" ||
      !Object.prototype.hasOwnProperty.call(INTERNAL_WORKER_ACTIONS, workerName) ||
      typeof action !== "string" ||
      INTERNAL_WORKER_ACTIONS[workerName as SchedulerWorkerName] !== action) return null;
  return Object.freeze({
    workerName: workerName as SchedulerWorkerName,
    action: action as InternalWorkerAction,
  });
}

async function verifyRestrictedRole(
  db: DbClient,
  expectedRole: string,
  capability: "issuer" | "resolver",
): Promise<void> {
  const row = await db.prepare(ROLE_INSPECTION_SQL).get<Record<string, unknown>>();
  if (!isExactRoleInspection(row) || row.currentUser !== expectedRole) {
    throw new WorkerLeaseRuntimeUnavailableError();
  }
  const safeRole = row.canLogin === true && row.isSuperuser === false && row.inheritsPrivileges === false &&
    row.canCreateDatabase === false && row.canCreateRole === false && row.canReplicate === false &&
    row.bypassesRls === false && row.hasRoleMemberships === false &&
    row.ownsCurrentDatabase === false && row.isCurrentDatabaseOwnerMember === false &&
    row.canCreateDatabaseObjects === false && row.hasSchemaUsage === true &&
    row.canCreateSchemaObjects === false && row.canValidate === false &&
    row.canSelectAnyLeaseColumn === false && row.canInsertAnyLeaseColumn === false &&
    row.canUpdateAnyLeaseColumn === false && row.canReferenceAnyLeaseColumn === false &&
    row.canSelectLeaseTable === false && row.canInsertLeaseTable === false &&
    row.canUpdateLeaseTable === false && row.canDeleteLeaseTable === false &&
    row.canTruncateLeaseTable === false && row.canReferenceLeaseTable === false &&
    row.canTriggerLeaseTable === false;
  const exactCapability = capability === "issuer"
    ? row.canAcquire === true && row.canCancel === true && row.canResolve === false
    : row.canAcquire === false && row.canCancel === false && row.canResolve === true;
  if (!safeRole || !exactCapability) throw new WorkerLeaseRuntimeUnavailableError();
}

function isExactRoleInspection(value: unknown): value is Record<(typeof ROLE_INSPECTION_KEYS)[number], unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== ROLE_INSPECTION_KEYS.length || keys.some((key) => typeof key !== "string" || !ROLE_INSPECTION_KEYS.includes(key as never))) {
    return false;
  }
  return ROLE_INSPECTION_KEYS.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

async function sanitizedRuntimeCall<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch {
    throw new WorkerLeaseRuntimeUnavailableError();
  }
}

async function disposeFailedPostgresConnection(db: DbClient): Promise<void> {
  const dispose = POSTGRES_DISPOSERS.get(db);
  if (!dispose) return;
  POSTGRES_DISPOSERS.delete(db);
  await dispose();
}

async function connectPostgres(databaseUrl: string): Promise<DbClient> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, {
    ssl: process.env.NODE_ENV === "test" && process.env.DATABASE_SSL === "disable" ? false : "require",
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 5,
  });

  const db: DbClient = Object.freeze({
    prepare: (query: string) => {
      const postgresQuery = bindPostgresParameters(query);
      return Object.freeze({
        get: async <T = Record<string, unknown>>(...params: unknown[]) => {
          const rows = await sql.unsafe(postgresQuery, params as never[]);
          return rows[0] as T | undefined;
        },
        all: async <T = Record<string, unknown>>(...params: unknown[]) => {
          const rows = await sql.unsafe(postgresQuery, params as never[]);
          return rows as unknown as T[];
        },
        run: async (...params: unknown[]) => {
          const rows = await sql.unsafe(postgresQuery, params as never[]);
          return { changes: rows.count ?? 0 };
        },
      });
    },
    exec: async (query: string) => {
      await sql.unsafe(query);
    },
  });
  POSTGRES_DISPOSERS.set(db, () => sql.end({ timeout: 1 }));
  return db;
}

function bindPostgresParameters(query: string): string {
  let parameter = 0;
  return query.replace(/\?/gu, () => `$${++parameter}`);
}
