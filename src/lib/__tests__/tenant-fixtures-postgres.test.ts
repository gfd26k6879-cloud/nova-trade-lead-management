import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/db";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";
import {
  CANONICAL_TENANT_FIXTURE_AUTH_IDENTITIES,
  CANONICAL_TENANT_FIXTURE_COUNTS,
  CANONICAL_TENANT_FIXTURE_IDS,
  type CanonicalTenantFixtureTransactionScope,
  cleanupCanonicalTenantCoreFixtures,
  createCanonicalTenantFixtureTransactionCoordinator,
  setupCanonicalTenantCoreFixtures,
  withCanonicalTenantFixtures,
} from "@/test/tenants";

const adminUrl = process.env.Q002_POSTGRES_ADMIN_URL;
const enabled = process.env.Q002_POSTGRES16 === "1" && Boolean(adminUrl);
const databaseName = `q002_fixture_${process.pid}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const unrelatedTenantId = "80000000-0000-4000-8000-000000000099";
const callbackTenantId = "80000000-0000-4000-8000-000000000098";
const skippedPortableMigrations = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);
let admin: Sql | undefined;
let sql: Sql | undefined;

describe.runIf(enabled)("canonical tenant fixture PostgreSQL 16 rehearsal", () => {
  it("uses the tracked schema and real repository for cleanup-safe commits and rollback-only support history", async () => {
    const parsed = new URL(adminUrl!);
    expect(["127.0.0.1", "::1", "localhost"]).toContain(parsed.hostname);
    expect(databaseName).toMatch(/^q002_fixture_[a-z0-9_]+$/);

    admin = postgres(adminUrl!, { max: 1, prepare: false, onnotice: () => undefined });
    const version = await admin`SHOW server_version_num`;
    const serverVersionNum = Number(version[0].server_version_num);
    expect(serverVersionNum).toBeGreaterThanOrEqual(160000);
    expect(serverVersionNum).toBeLessThan(170000);

    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    parsed.pathname = `/${databaseName}`;
    sql = postgres(parsed.toString(), { max: 1, prepare: false, onnotice: () => undefined });

    const migrationReceipt = await installTrackedMigrationSchema(sql);
    expect(migrationReceipt).toEqual({ discovered: 52, applied: 50, skipped: 2 });
    await seedFixtureAuthUsers(sql);

    const db = boundedPostgresDbClient(sql);
    const transaction = postgresFixtureTransaction(sql);
    const schemaBefore = await schemaProtectionSnapshot(sql);
    expect(schemaBefore.supportHistoryGuards).toEqual([
      { name: "trg_novatrade_support_access_grant_data_classes_guard", enabled: "O" },
      { name: "trg_novatrade_support_access_grant_permissions_guard", enabled: "O" },
    ]);
    expect(schemaBefore.constraints.length).toBeGreaterThan(0);
    expect(schemaBefore.policies.length).toBeGreaterThan(0);
    expect(schemaBefore.triggers.length).toBeGreaterThan(0);

    await db.prepare(
      "INSERT INTO tenants (id, slug, name, status, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(unrelatedTenantId, "unrelated-q002", "Unrelated Q-002", "active", "en-US", "UTC", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    for (let pass = 0; pass < 2; pass += 1) {
      const fixture = await setupCanonicalTenantCoreFixtures({ transaction });
      expect(fixture.tenants).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.tenants);
      expect(fixture.workspaces).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.workspaces);
      expect(fixture.memberships).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.memberships);
      expect(fixture.roleBindings).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.currentRoleBindings);
      expect(fixture.policies).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.policies);
      expect(fixture.supportGrants).toEqual([]);
      expect(await canonicalCoreCounts(db)).toEqual({ tenants: 2, workspaces: 4, memberships: 20, roleBindings: 14, policies: 2, supportGrants: 0 });

      await cleanupCanonicalTenantCoreFixtures({ transaction });
      await cleanupCanonicalTenantCoreFixtures({ transaction });
      expect(await canonicalCoreCounts(db)).toEqual({ tenants: 0, workspaces: 0, memberships: 0, roleBindings: 0, policies: 0, supportGrants: 0 });
      expect(await db.prepare("SELECT id FROM tenants WHERE id = ?").get(unrelatedTenantId)).toEqual({ id: unrelatedTenantId });
      expect(await schemaProtectionSnapshot(sql)).toEqual(schemaBefore);
    }

    await withCanonicalTenantFixtures({ transaction }, async (fixture, scope) => {
      expect(fixture.supportGrants).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.supportGrants);
      await scope.repository.createTenant({
        id: callbackTenantId,
        slug: "callback-q002",
        name: "Callback Q-002",
        status: "active",
        locale: "en-US",
        timezone: "UTC",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    expect(await canonicalCoreCounts(db)).toEqual({ tenants: 0, workspaces: 0, memberships: 0, roleBindings: 0, policies: 0, supportGrants: 0 });
    expect(await db.prepare("SELECT COUNT(*)::int AS count FROM tenants WHERE id = ?").get(callbackTenantId)).toEqual({ count: 0 });
    expect(await db.prepare("SELECT id FROM tenants WHERE id = ?").get(unrelatedTenantId)).toEqual({ id: unrelatedTenantId });
    expect(await schemaProtectionSnapshot(sql)).toEqual(schemaBefore);
  }, 120_000);
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  if (!admin) return;
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
});

function postgresFixtureTransaction(client: Sql) {
  return createCanonicalTenantFixtureTransactionCoordinator(async <T>(
    callback: (scope: CanonicalTenantFixtureTransactionScope) => Promise<T>,
  ): Promise<T> =>
    await client.begin(async (transactionSql) => {
      const db = boundedPostgresDbClient(transactionSql);
      return callback({ db, repository: createTenantQueryRepository(db) });
    }) as T,
  );
}

/**
 * Q-002 cannot instantiate the private application PostgresClient directly.
 * This bounded postgres.js adapter implements the public DbClient statement
 * contract; fixture writes still run through the real tenant repository.
 */
function boundedPostgresDbClient(client: Sql | TransactionSql): DbClient {
  const statement = (query: string) => ({
    get: async <T = Record<string, unknown>>(...params: unknown[]) =>
      (await client.unsafe(rewritePlaceholders(query), params as never[]))[0] as T | undefined,
    all: async <T = Record<string, unknown>>(...params: unknown[]) =>
      await client.unsafe(rewritePlaceholders(query), params as never[]) as T[],
    run: async (...params: unknown[]) => ({
      changes: Number((await client.unsafe(rewritePlaceholders(query), params as never[])).count ?? 0),
    }),
  });
  return {
    prepare: statement,
    exec: async (query) => { await client.unsafe(query); },
  };
}

function rewritePlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(identifier)) throw new Error("Unsafe PostgreSQL identifier.");
  return `"${identifier}"`;
}

async function installTrackedMigrationSchema(client: Sql): Promise<{ discovered: number; applied: number; skipped: number }> {
  await client.unsafe(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END
    $$;
    CREATE TABLE public.worker_runs (
      id text PRIMARY KEY,
      worker_name text NOT NULL,
      status text NOT NULL DEFAULT 'running',
      trigger_source text NOT NULL DEFAULT 'unknown',
      http_status integer,
      result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      error text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrationFiles = readdirSync(join("supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let applied = 0;
  for (const file of migrationFiles) {
    if (skippedPortableMigrations.has(file)) continue;
    await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") {
      await installPortableMigrationCompatibilityColumns(client);
    }
  }
  return { discovered: migrationFiles.length, applied, skipped: skippedPortableMigrations.size };
}

async function installPortableMigrationCompatibilityColumns(client: Sql): Promise<void> {
  await client.unsafe(`
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1;
    ALTER TABLE public.leads
      ADD COLUMN IF NOT EXISTS ai_website_feedback_status text,
      ADD COLUMN IF NOT EXISTS ai_corrected_website_url text,
      ADD COLUMN IF NOT EXISTS ai_false_positive_reason text,
      ADD COLUMN IF NOT EXISTS ai_reviewer_notes text,
      ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz;
  `);
}

async function seedFixtureAuthUsers(client: Sql): Promise<void> {
  const ids = new Set([
    CANONICAL_TENANT_FIXTURE_AUTH_IDENTITIES.supportActor,
    CANONICAL_TENANT_FIXTURE_AUTH_IDENTITIES.sharedAcrossTenants,
    ...Object.values(CANONICAL_TENANT_FIXTURE_IDS.roleIdentityIds).flatMap(Object.values),
    ...Object.values(CANONICAL_TENANT_FIXTURE_IDS.inactiveIdentityIds).flatMap(Object.values),
  ]);
  for (const id of ids) await client`INSERT INTO auth.users (id) VALUES (${id}) ON CONFLICT DO NOTHING`;
}

async function canonicalCoreCounts(db: DbClient): Promise<Record<string, number>> {
  const count = async (table: string, column: string, ids: readonly string[]): Promise<number> => {
    const placeholders = ids.map(() => "?").join(", ");
    const row = await db.prepare(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} IN (${placeholders})`).get<{ count: number }>(...ids);
    return Number(row?.count ?? 0);
  };
  return {
    tenants: await count("tenants", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.tenants)),
    workspaces: await count("workspaces", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.workspaces)),
    memberships: await count("tenant_memberships", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.memberships).flatMap(Object.values)),
    roleBindings: await count("tenant_role_bindings", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.roleBindings).flatMap(Object.values)),
    policies: await count("tenant_policies", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.policies)),
    supportGrants: await count("support_access_grants", "id", Object.values(CANONICAL_TENANT_FIXTURE_IDS.supportGrants)),
  };
}

async function schemaProtectionSnapshot(client: Sql): Promise<{
  constraints: Array<{ table: string; name: string; definition: string }>;
  policies: Array<{ table: string; name: string; command: string; usingExpression: string | null; checkExpression: string | null }>;
  triggers: Array<{ table: string; name: string; enabled: string; definition: string }>;
  supportHistoryGuards: Array<{ name: string; enabled: string }>;
}> {
  const protectedTables = [
    "tenants", "workspaces", "tenant_memberships", "tenant_role_bindings", "tenant_policies",
    "support_access_grants", "support_access_grant_permissions", "support_access_grant_data_classes",
  ];
  const constraints = await client.unsafe<Array<{ table: string; name: string; definition: string }>>(`
    SELECT r.relname AS table, c.conname AS name, pg_catalog.pg_get_constraintdef(c.oid, true) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class r ON r.oid = c.conrelid
    WHERE r.relnamespace = 'public'::regnamespace AND r.relname = ANY($1::text[])
    ORDER BY r.relname, c.conname
  `, [protectedTables]);
  const policies = await client.unsafe<Array<{ table: string; name: string; command: string; usingExpression: string | null; checkExpression: string | null }>>(`
    SELECT r.relname AS table, p.polname AS name, p.polcmd AS command,
           pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS "usingExpression",
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS "checkExpression"
    FROM pg_catalog.pg_policy p
    JOIN pg_catalog.pg_class r ON r.oid = p.polrelid
    WHERE r.relnamespace = 'public'::regnamespace AND r.relname = ANY($1::text[])
    ORDER BY r.relname, p.polname
  `, [protectedTables]);
  const triggers = await client.unsafe<Array<{ table: string; name: string; enabled: string; definition: string }>>(`
    SELECT r.relname AS table, t.tgname AS name, t.tgenabled AS enabled,
           pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class r ON r.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND r.relnamespace = 'public'::regnamespace
      AND r.relname = ANY($1::text[])
    ORDER BY r.relname, t.tgname
  `, [protectedTables]);
  return {
    constraints,
    policies,
    triggers,
    supportHistoryGuards: triggers
      .filter((trigger) => [
        "trg_novatrade_support_access_grant_permissions_guard",
        "trg_novatrade_support_access_grant_data_classes_guard",
      ].includes(trigger.name))
      .map(({ name, enabled }) => ({ name, enabled })),
  };
}
