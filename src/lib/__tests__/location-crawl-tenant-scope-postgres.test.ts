import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  COMPATIBILITY_TENANT_TABLES,
  POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
  POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
  type CompatibilityBackfillManifest,
  type CompatibilityTableExpectation,
} from "@/lib/tenancy/compatibility-backfill";

const TENANT_A = "00000000-0000-4000-8000-000000000101";
const TENANT_B = "00000000-0000-4000-8000-000000000202";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000101";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000202";
const WORKSPACE_B_ALT = "10000000-0000-4000-8000-000000000203";
const OWNER_A = "20000000-0000-4000-8000-000000000101";
const OWNER_B = "20000000-0000-4000-8000-000000000202";
const SUSPENDED_B = "20000000-0000-4000-8000-000000000203";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000101";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000202";
const SUSPENDED_MEMBERSHIP_B = "30000000-0000-4000-8000-000000000203";
const BINDING_A = "40000000-0000-4000-8000-000000000101";
const POLICY_A = "50000000-0000-4000-8000-000000000101";
const POLICY_HASH = "b".repeat(64);

const MIGRATION_PATH = join("supabase", "migrations", "202607290001_add_location_crawl_tenant_scope.sql");
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
const POSTGRES_DEPENDENCIES = [
  "202605110001_full_schema.sql",
  "202605120002_supabase_auth_roles.sql",
  "20260515123000_researcher_workbench_outreach.sql",
  "20260602061959_add_lead_archive_fields.sql",
  "20260520114232_admin_fulfillment_queue.sql",
  "20260602193000_international_markets_and_territories.sql",
  "20260603110615_discovery_items.sql",
  "20260611010000_agile_discovery_blocked_retry.sql",
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

type PgClient = ReturnType<typeof postgres>;

async function resetDatabase(client: PgClient): Promise<void> {
  await client.unsafe(`
    RESET search_path;
    DROP SCHEMA IF EXISTS g002_shadow CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END
    $$;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
  `);
  for (const file of [...POSTGRES_DEPENDENCIES, ...POSTGRES_T028_MIGRATIONS]) {
    await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
  }
}

async function postgresManifest(client: PgClient): Promise<CompatibilityBackfillManifest> {
  const legacyTables: CompatibilityTableExpectation[] = [];
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const workspaceScoped = new Set([
      "audit_logs",
      "user_market_access",
      "crawl_runs",
      "crawl_units",
      "lead_notes",
      "outreach_events",
      "admin_requests",
      "demos",
      "ai_lead_verifications",
      "lead_ai_artifacts",
      "ai_feedback_events",
    ]).has(table);
    const scopeExpression = workspaceScoped
      ? "(to_jsonb(t) - 'tenant_id' - 'workspace_id')::text"
      : "(to_jsonb(t) - 'tenant_id')::text";
    const result = await client.unsafe<Array<{ row_count: number; content_checksum: string }>>(
      `SELECT count(*)::integer AS row_count,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${scopeExpression}, '|' ORDER BY ${scopeExpression}), ''), 'UTF8')), 'hex') AS content_checksum
       FROM public."${table}" AS t`,
    );
    legacyTables.push({
      table,
      rowCount: Number(result[0].row_count),
      contentChecksum: String(result[0].content_checksum),
    });
  }
  return {
    schemaVersion: 1,
    sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g002-postgres-rehearsal-v1",
    sourceSnapshotFingerprint: "a".repeat(64),
    tenantId: TENANT_A,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_A,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_A,
    policyId: POLICY_A,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers: [{
      legacyUserId: "legacy-owner",
      authIdentityId: OWNER_A,
      expectedEmail: "owner@example.test",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: MEMBERSHIP_A,
      workspaceId: WORKSPACE_A,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: BINDING_A,
      marketAccessIds: ["market-a"],
    }],
    legacyTables,
  };
}

async function seedLegacyRows(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users (id) VALUES ('${OWNER_A}');
    INSERT INTO public.location_markets (id, name, country_code, admin_area1)
      VALUES ('market-a', 'Market A', 'US', 'CO');
    INSERT INTO public.location_cells
      (id, market_id, country_code, admin_area1, postal_code, postal_code_normalized, cell_type, cell_label)
      VALUES ('cell-us-co-80202', 'market-a', 'US', 'CO', '80202', '80202', 'zip', 'Denver 80202');
    INSERT INTO public.zip_codes (zip, city, state) VALUES ('80202', 'Denver', 'CO') ON CONFLICT DO NOTHING;
    INSERT INTO public.app_users (id, user_id, email, role, status)
      VALUES ('legacy-owner', '${OWNER_A}', 'owner@example.test', 'admin', 'active');
    INSERT INTO public.user_market_access (user_id, market_id, created_by_user_id)
      VALUES ('${OWNER_A}', 'market-a', '${OWNER_A}');
    INSERT INTO public.crawl_runs (id, categories, status, created_by_user_id, market_id)
      VALUES ('legacy-run', '[]'::jsonb, 'done', '${OWNER_A}', 'market-a');
    INSERT INTO public.crawl_units (id, crawl_run_id, zip, category, market_id, location_cell_id)
      VALUES ('legacy-unit', 'legacy-run', '80202', 'industrial', 'market-a', 'cell-us-co-80202');
  `);
}

async function runT028(client: PgClient): Promise<void> {
  const manifest = await postgresManifest(client);
  await client.unsafe("SELECT public.novatrade_run_compatibility_backfill($1::jsonb)", [JSON.parse(JSON.stringify(manifest))]);
}

async function expectRejected(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(work).rejects.toThrow(pattern);
}

describe("G-002 location and crawl tenant scope", () => {
  it("keeps platform location references global and declares the complete enforcement surface", () => {
    for (const table of ["zip_codes", "location_markets", "location_cells"]) {
      expect(migrationSql).not.toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}[^;]*ADD\\s+COLUMN[^;]*tenant_id`, "i"));
    }
    expect(migrationSql).toContain("G002_UNRECONCILED_T028_SCOPE");
    expect(migrationSql).toContain("compatibility_backfill_receipts");
    expect(migrationSql).toContain("UNIQUE NULLS NOT DISTINCT (tenant_id, workspace_id, user_id, market_id)");
    expect(migrationSql).toContain("FOREIGN KEY (tenant_id, crawl_run_id) REFERENCES public.crawl_runs (tenant_id, id)");
    expect(migrationSql).toContain("SET search_path = pg_catalog, public");
    expect(migrationSql).toContain("REVOKE ALL ON TABLE public.user_market_access, public.crawl_runs, public.crawl_units");
    expect(migrationSql).toContain("WHERE status IN ('pending', 'retry_wait')");
    expect(migrationSql).not.toMatch(/(?:pg_catalog\.)?digest\s*\(|CREATE\s+EXTENSION/i);
  });

  it.skipIf(process.env.G002_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "rehearses fresh install, T-028 gating, tenant isolation, generalized locations, replay, and hardening on PostgreSQL 16",
    async () => {
      const databaseUrl = process.env.G002_DATABASE_URL;
      if (!databaseUrl) throw new Error("G002_DATABASE_URL is required for the disposable PostgreSQL rehearsal");
      const parsed = new URL(databaseUrl);
      if (!(parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") || !/^g002_location_crawl_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) {
        throw new Error("G-002 integration permits only localhost databases with a unique g002_location_crawl_rehearsal_ prefix");
      }
      const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
      try {
        const version = await client.unsafe<Array<{ server_version_num: string }>>("SELECT current_setting('server_version_num') AS server_version_num");
        expect(version[0].server_version_num.startsWith("16")).toBe(true);

        await resetDatabase(client);
        await client.unsafe(migrationSql);
        await client.unsafe(migrationSql);
        const platformTenantColumns = await client.unsafe<Array<{ count: number }>>(`
          SELECT count(*)::integer AS count
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('zip_codes', 'location_markets', 'location_cells')
            AND column_name = 'tenant_id'
        `);
        expect(platformTenantColumns[0].count).toBe(0);

        await resetDatabase(client);
        await seedLegacyRows(client);
        const beforeRejected = await client.unsafe("SELECT to_jsonb(unit) - 'tenant_id' - 'workspace_id' AS row FROM public.crawl_units AS unit WHERE id = 'legacy-unit'");
        await expectRejected(client.unsafe(migrationSql), /G002_UNRECONCILED_T028_SCOPE/);
        await client.unsafe("ROLLBACK");
        const rejectedState = await client.unsafe<Array<{ location_mode: string | null; tenant_not_null: boolean }>>(`
          SELECT
            (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crawl_units' AND column_name = 'location_mode') AS location_mode,
            (SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid = 'public.crawl_units'::regclass AND attname = 'tenant_id') AS tenant_not_null
        `);
        expect(rejectedState[0]).toMatchObject({ location_mode: null, tenant_not_null: false });
        expect((await client.unsafe("SELECT to_jsonb(unit) - 'tenant_id' - 'workspace_id' AS row FROM public.crawl_units AS unit WHERE id = 'legacy-unit'"))[0].row).toEqual(beforeRejected[0].row);

        await runT028(client);
        await client.unsafe("UPDATE public.location_markets SET status = 'paused' WHERE id = 'market-a'");
        await expectRejected(client.unsafe(migrationSql), /G002_ACTIVE_MARKET_ACCESS_REQUIRED/);
        await client.unsafe("ROLLBACK; UPDATE public.location_markets SET status = 'active' WHERE id = 'market-a'");
        await client.unsafe("CREATE SCHEMA g002_shadow; CREATE TABLE g002_shadow.user_market_access (sentinel text); CREATE TABLE g002_shadow.crawl_runs (sentinel text); CREATE TABLE g002_shadow.crawl_units (sentinel text); SET search_path = g002_shadow, public;");
        const preservedBefore = await client.unsafe("SELECT to_jsonb(unit) - 'tenant_id' - 'workspace_id' AS row FROM public.crawl_units AS unit WHERE id = 'legacy-unit'");
        const countsBefore = (await client.unsafe(`
          SELECT
            (SELECT count(*)::integer FROM public.user_market_access) AS access_count,
            (SELECT count(*)::integer FROM public.crawl_runs) AS run_count,
            (SELECT count(*)::integer FROM public.crawl_units) AS unit_count
        `))[0];
        await client.unsafe(migrationSql);
        expect((await client.unsafe("SELECT to_jsonb(unit) - 'tenant_id' - 'workspace_id' - 'location_mode' AS row FROM public.crawl_units AS unit WHERE id = 'legacy-unit'"))[0].row).toEqual(preservedBefore[0].row);
        expect((await client.unsafe(`
          SELECT
            (SELECT count(*)::integer FROM public.user_market_access) AS access_count,
            (SELECT count(*)::integer FROM public.crawl_runs) AS run_count,
            (SELECT count(*)::integer FROM public.crawl_units) AS unit_count
        `))[0]).toEqual(countsBefore);
        expect((await client.unsafe("SELECT location_mode FROM public.crawl_units WHERE id = 'legacy-unit'"))[0].location_mode).toBe("legacy_zip");
        expect((await client.unsafe("SELECT count(*)::integer AS count FROM information_schema.columns WHERE table_schema = 'g002_shadow' AND column_name = 'tenant_id'"))[0].count).toBe(0);
        await client.unsafe("RESET search_path");

        const nullability = await client.unsafe<Array<{ table_name: string; is_nullable: string }>>(`
          SELECT table_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'tenant_id'
            AND table_name IN ('user_market_access', 'crawl_runs', 'crawl_units')
          ORDER BY table_name
        `);
        expect(nullability).toEqual([
          { table_name: "crawl_runs", is_nullable: "NO" },
          { table_name: "crawl_units", is_nullable: "NO" },
          { table_name: "user_market_access", is_nullable: "NO" },
        ]);
        const functionSecurity = await client.unsafe<Array<{ name: string; config: string[]; anon_execute: boolean; authenticated_execute: boolean }>>(`
          SELECT procedure.proname AS name, procedure.proconfig AS config,
            has_function_privilege('anon', procedure.oid, 'EXECUTE') AS anon_execute,
            has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated_execute
          FROM pg_catalog.pg_proc AS procedure
          WHERE procedure.proname IN (
            'novatrade_validate_user_market_access_scope',
            'novatrade_validate_crawl_run_scope',
            'novatrade_inherit_crawl_unit_scope'
          )
          ORDER BY procedure.proname
        `);
        expect(functionSecurity).toHaveLength(3);
        for (const row of functionSecurity) {
          expect(row.config).toContain("search_path=pg_catalog, public");
          expect(row.anon_execute).toBe(false);
          expect(row.authenticated_execute).toBe(false);
        }
        for (const role of ["anon", "authenticated"]) {
          expect((await client.unsafe("SELECT has_table_privilege($1, 'public.user_market_access', 'SELECT') AS allowed", [role]))[0].allowed).toBe(false);
        }

        await client.unsafe(`
          INSERT INTO auth.users (id) VALUES ('${OWNER_B}'), ('${SUSPENDED_B}');
          INSERT INTO public.tenants (id, slug, name, status) VALUES ('${TENANT_B}', 'tenant-b', 'Tenant B', 'active');
          INSERT INTO public.workspaces (id, tenant_id, slug, name, status) VALUES
            ('${WORKSPACE_B}', '${TENANT_B}', 'workspace-b', 'Workspace B', 'active'),
            ('${WORKSPACE_B_ALT}', '${TENANT_B}', 'workspace-b-alt', 'Workspace B Alt', 'active');
          INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES
            ('${MEMBERSHIP_B}', '${TENANT_B}', '${OWNER_B}', '${WORKSPACE_B}', 'active'),
            ('${SUSPENDED_MEMBERSHIP_B}', '${TENANT_B}', '${SUSPENDED_B}', '${WORKSPACE_B}', 'suspended');
          INSERT INTO public.user_market_access (tenant_id, workspace_id, user_id, market_id, created_by_user_id)
            VALUES ('${TENANT_B}', '${WORKSPACE_B}', '${OWNER_B}', 'market-a', '${OWNER_B}');
        `);
        expect((await client.unsafe("SELECT count(*)::integer AS count FROM public.user_market_access WHERE market_id = 'market-a'"))[0].count).toBe(2);
        await expectRejected(client.unsafe("INSERT INTO public.user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES ($1, $2, $3, 'market-a')", [TENANT_B, WORKSPACE_B, OWNER_A]), /G002_ACTIVE_MEMBERSHIP_REQUIRED/);
        await expectRejected(client.unsafe("INSERT INTO public.user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES ($1, $2, $3, 'market-a')", [TENANT_B, WORKSPACE_B_ALT, OWNER_B]), /G002_ACTIVE_MEMBERSHIP_REQUIRED/);
        await expectRejected(client.unsafe("INSERT INTO public.user_market_access (tenant_id, workspace_id, user_id, market_id) VALUES ($1, $2, $3, 'market-a')", [TENANT_B, WORKSPACE_B, SUSPENDED_B]), /G002_ACTIVE_MEMBERSHIP_REQUIRED/);

        await expectRejected(client.unsafe("INSERT INTO public.crawl_runs (id, tenant_id, workspace_id, market_id, categories) VALUES ('cross-tenant-run', $1, $2, 'market-a', '[]'::jsonb)", [TENANT_B, WORKSPACE_A]), /crawl_runs_tenant_workspace_fkey/);
        await client.unsafe("INSERT INTO public.crawl_runs (id, tenant_id, workspace_id, market_id, categories) VALUES ('run-b', $1, $2, 'market-a', '[]'::jsonb)", [TENANT_B, WORKSPACE_B]);
        await expectRejected(client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, zip, category, location_mode) VALUES ('wrong-tenant', 'run-b', $1, $2, 'market-a', '80202', 'industrial', 'legacy_zip')", [TENANT_A, WORKSPACE_B]), /G002_CRAWL_UNIT_TENANT_MISMATCH/);
        await expectRejected(client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, zip, category, location_mode) VALUES ('wrong-workspace', 'run-b', $1, $2, 'market-a', '80202', 'industrial', 'legacy_zip')", [TENANT_B, WORKSPACE_A]), /G002_CRAWL_UNIT_WORKSPACE_MISMATCH/);
        await expectRejected(client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, zip, category, location_mode) VALUES ('wrong-market', 'run-b', $1, $2, 'market-london-gb', 'SW1A', 'industrial', 'generalized')", [TENANT_B, WORKSPACE_B]), /G002_CRAWL_UNIT_MARKET_MISMATCH/);
        await expectRejected(client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, location_cell_id, zip, category, location_mode) VALUES ('wrong-cell', 'run-b', $1, $2, 'market-a', 'cell-gb-london-sw1a', 'SW1A', 'industrial', 'platform_cell')", [TENANT_B, WORKSPACE_B]), /G002_CRAWL_UNIT_CELL_MARKET_MISMATCH/);
        await expectRejected(client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, zip, category, location_mode) VALUES ('missing-zip', 'run-b', $1, $2, 'market-a', '99999', 'industrial', 'legacy_zip')", [TENANT_B, WORKSPACE_B]), /G002_LEGACY_ZIP_REFERENCE_REQUIRED/);
        await client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, location_cell_id, zip, category, location_mode) VALUES ('valid-zip', 'run-b', $1, $2, 'market-a', 'cell-us-co-80202', '80202', 'industrial', 'legacy_zip')", [TENANT_B, WORKSPACE_B]);
        await expectRejected(client.unsafe("UPDATE public.crawl_runs SET tenant_id = $1 WHERE id = 'run-b'", [TENANT_A]), /G002_CRAWL_RUN_SCOPE_IMMUTABLE_WITH_UNITS/);

        await client.unsafe("INSERT INTO public.crawl_runs (id, tenant_id, workspace_id, market_id, categories) VALUES ('run-generalized', $1, $2, 'market-london-gb', '[]'::jsonb)", [TENANT_B, WORKSPACE_B]);
        await client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, zip, category, location_mode) VALUES ('generalized-unit', 'run-generalized', $1, $2, 'market-london-gb', 'NW9 6AA', 'industrial', 'generalized')", [TENANT_B, WORKSPACE_B]);
        await client.unsafe("INSERT INTO public.crawl_units (id, crawl_run_id, tenant_id, workspace_id, market_id, location_cell_id, zip, category, location_mode) VALUES ('platform-cell-unit', 'run-generalized', $1, $2, 'market-london-gb', 'cell-gb-london-sw1a', 'SW1A', 'industrial', 'platform_cell')", [TENANT_B, WORKSPACE_B]);
        expect((await client.unsafe("SELECT location_mode FROM public.crawl_units WHERE id = 'generalized-unit'"))[0].location_mode).toBe("generalized");
        expect((await client.unsafe("SELECT count(*)::integer AS count FROM public.zip_codes WHERE zip IN ('NW9 6AA', 'SW1A')"))[0].count).toBe(0);
        await client.unsafe(migrationSql);
      } finally {
        await client.unsafe("RESET search_path; DROP SCHEMA IF EXISTS g002_shadow CASCADE;").catch(() => undefined);
        await client.end({ timeout: 5 });
      }
    },
    120000,
  );
});
