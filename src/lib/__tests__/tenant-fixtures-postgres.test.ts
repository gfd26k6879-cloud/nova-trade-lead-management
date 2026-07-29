import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/db";
import type { TenantQueryRepository } from "@/lib/tenancy/queries";
import {
  CANONICAL_TENANT_FIXTURE_IDS,
  cleanupCanonicalTenantFixtures,
  createCanonicalTenantFixtureTransactionCoordinator,
  setupCanonicalTenantFixtures,
  withCanonicalTenantFixtures,
} from "@/test/tenants";

const adminUrl = process.env.Q002_POSTGRES_ADMIN_URL;
const enabled = process.env.Q002_POSTGRES16 === "1" && Boolean(adminUrl);
const databaseName = `q002_fixture_${process.pid}_${Date.now().toString(36)}`.replace(/[^a-z0-9_]/g, "_");
let admin: Sql | undefined;
let sql: Sql | undefined;

describe.runIf(enabled)("canonical tenant fixture PostgreSQL 16 rehearsal", () => {
  it("uses a unique loopback PG16 database, commits/cleans twice, preserves unrelated rows, and rolls back callback rows", async () => {
    const parsed = new URL(adminUrl!);
    expect(["127.0.0.1", "::1", "localhost"]).toContain(parsed.hostname);
    admin = postgres(adminUrl!, { max: 1, prepare: false, onnotice: () => undefined });
    const version = await admin`SHOW server_version_num`;
    expect(Number(version[0].server_version_num)).toBeGreaterThanOrEqual(160000);
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);
    parsed.pathname = `/${databaseName}`;
    sql = postgres(parsed.toString(), { max: 1, prepare: false, onnotice: () => undefined });
    await installMinimalFixtureSchema(sql);
    const db = postgresDbClient(sql);
    const transaction = fixtureTransaction(db);
    await db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "80000000-0000-4000-8000-000000000099", "unrelated", "Unrelated", "active", "en-US", "UTC", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    );
    for (let pass = 0; pass < 2; pass += 1) {
      await setupCanonicalTenantFixtures({ transaction });
      expect(await db.prepare("SELECT COUNT(*)::int AS count FROM tenants WHERE id IN (?, ?)").get(CANONICAL_TENANT_FIXTURE_IDS.tenants.A, CANONICAL_TENANT_FIXTURE_IDS.tenants.B)).toEqual({ count: 2 });
      await cleanupCanonicalTenantFixtures({ transaction });
      await cleanupCanonicalTenantFixtures({ transaction });
      expect(await db.prepare("SELECT id FROM tenants WHERE id = ?").get("80000000-0000-4000-8000-000000000099")).toEqual({ id: "80000000-0000-4000-8000-000000000099" });
    }
    await withCanonicalTenantFixtures({ transaction }, async (_fixture, scope) => {
      await scope.db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        "80000000-0000-4000-8000-000000000098", "callback", "Callback", "active", "en-US", "UTC", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      );
    });
    expect(await db.prepare("SELECT COUNT(*)::int AS count FROM tenants WHERE id <> ?").get("80000000-0000-4000-8000-000000000099")).toEqual({ count: 0 });
  });
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  if (admin) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }
});

function postgresDbClient(client: Sql | TransactionSql): DbClient {
  const statement = (active: Sql | TransactionSql, query: string) => ({
    get: async <T = Record<string, unknown>>(...params: unknown[]) => (await active.unsafe(rewritePlaceholders(query), params as never[]))[0] as T | undefined,
    all: async <T = Record<string, unknown>>(...params: unknown[]) => await active.unsafe(rewritePlaceholders(query), params as never[]) as T[],
    run: async (...params: unknown[]) => ({ changes: Number((await active.unsafe(rewritePlaceholders(query), params as never[])).count ?? 0) }),
  });
  return {
    prepare: (query) => statement(client, query),
    exec: async (query) => { await client.unsafe(query); },
    withTransaction: async <T>(fn: () => Promise<T>) => {
      if (!("begin" in client)) return fn();
      return await client.begin(async (tx: TransactionSql) => fnWithScopedDb(tx, fn)) as T;
    },
  };
  function fnWithScopedDb<T>(tx: TransactionSql, fn: () => Promise<T>): Promise<T> {
    const scoped = postgresDbClient(tx);
    // The coordinator below supplies this transaction-bound DbClient to the repository.
    currentTransactionDb = scoped;
    return fn().finally(() => { currentTransactionDb = undefined; });
  }
}

let currentTransactionDb: DbClient | undefined;
function fixtureTransaction(db: DbClient) {
  return createCanonicalTenantFixtureTransactionCoordinator(async (callback) => db.withTransaction!(async () => {
    const scoped = currentTransactionDb ?? db;
    return callback({ db: scoped, repository: fixtureRepository(scoped) });
  }));
}

function rewritePlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

type FixtureInput = Record<string, unknown>;

function fixtureRepository(db: DbClient): TenantQueryRepository {
  const repository = {
    createTenant: async (input: FixtureInput) => { await db.prepare("INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.slug, input.name, input.status, input.locale, input.timezone, input.createdAt, input.updatedAt); return input; },
    createWorkspace: async (tenantId: string, input: FixtureInput) => { await db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.slug, input.name, input.status, input.createdAt, input.updatedAt); return { ...input, tenantId }; },
    createMembership: async (tenantId: string, input: FixtureInput) => { await db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id, status, invited_by_membership_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.authIdentityId ?? null, input.pendingIdentityRefHash ?? null, input.workspaceId ?? null, input.status, null, input.createdAt, input.updatedAt); return { ...input, tenantId }; },
    createRoleBinding: async (tenantId: string, input: FixtureInput) => { await db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at, assigned_by_membership_id, reason_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, tenantId, input.membershipId, input.role, input.createdAt, input.validFrom, null, input.assignedByMembershipId, input.reasonCode); return { ...input, tenantId }; },
    createTenantPolicy: async (tenantId: string, input: FixtureInput) => { await db.prepare("INSERT INTO tenant_policies (id, tenant_id, ai_processing_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(input.id, tenantId, input.aiProcessingEnabled, input.createdAt, input.updatedAt); return { ...input, tenantId }; },
  } as unknown as TenantQueryRepository;
  return repository;
}

async function installMinimalFixtureSchema(client: Sql): Promise<void> {
  await client.unsafe(`
    CREATE TABLE tenants (id text PRIMARY KEY, slug text NOT NULL, name text NOT NULL, status text NOT NULL, locale text NOT NULL, timezone text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workspaces (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), slug text NOT NULL, name text NOT NULL, status text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE tenant_memberships (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), auth_identity_id text, pending_identity_ref_hash text, workspace_id text REFERENCES workspaces(id), status text NOT NULL, invited_by_membership_id text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE tenant_role_bindings (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), membership_id text NOT NULL REFERENCES tenant_memberships(id), role text NOT NULL, created_at text NOT NULL, valid_from text NOT NULL, revoked_at text, assigned_by_membership_id text, reason_code text NOT NULL);
    CREATE TABLE tenant_policies (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), ai_processing_enabled boolean NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE support_access_grants (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), workspace_id text NOT NULL REFERENCES workspaces(id), support_actor_auth_identity_id text NOT NULL, platform_role text NOT NULL, requested_by_auth_identity_id text NOT NULL, approved_by_auth_identity_id text, approved_at text, revoked_by_auth_identity_id text, revoked_at text, state text NOT NULL, reason_code text NOT NULL, reason text NOT NULL, starts_at text NOT NULL, expires_at text NOT NULL, correlation_id text NOT NULL, audit_event_id text NOT NULL, permission_anchor text NOT NULL, data_class_anchor text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE support_access_grant_permissions (grant_id text NOT NULL REFERENCES support_access_grants(id), permission text NOT NULL);
    CREATE TABLE support_access_grant_data_classes (grant_id text NOT NULL REFERENCES support_access_grants(id), data_class text NOT NULL);
  `);
}
