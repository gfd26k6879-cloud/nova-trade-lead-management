import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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

const G002 = "202607290001_add_location_crawl_tenant_scope.sql";
const G003 = "202607290002_add_lead_crm_tenant_scope.sql";
const G004A = "202607290003_add_ai_tenant_scope_worker_envelope.sql";
const G005 = "202607290004_add_source_cache_usage_tenant_scope.sql";
const G007P1 = "202607310001_tenant_prefix_ai_artifact_indexes.sql";
const migrationSql = readFileSync(join("supabase", "migrations", G005), "utf8");
const g007p1Sql = readFileSync(join("supabase", "migrations", G007P1), "utf8");
const skipped = new Set(["20260514161714_supabase_ai_verification_cron.sql", "20260514163203_scheduler_v2_sales_ready_pipeline.sql"]);
const pinnedPostgres16 = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const tenantA = "00000000-0000-4000-8000-000000000501";
const tenantB = "00000000-0000-4000-8000-000000000502";
const workspaceA = "10000000-0000-4000-8000-000000000501";
const workspaceB = "10000000-0000-4000-8000-000000000502";
const ownerA = "20000000-0000-4000-8000-000000000501";
const ownerB = "20000000-0000-4000-8000-000000000502";
const membershipA = "30000000-0000-4000-8000-000000000501";
const membershipB = "30000000-0000-4000-8000-000000000502";
const bindingA = "40000000-0000-4000-8000-000000000501";
const policyA = "50000000-0000-4000-8000-000000000501";
const policyHash = "e".repeat(64);
const sourceTables = ["place_cache", "places_master", "place_observations", "api_usage_events"] as const;
type PgClient = ReturnType<typeof postgres>;

function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function waitForPostgres(container: string, database: string): void {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-Atc", "SELECT 1"], true) === "1") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`PostgreSQL did not become ready: ${docker(["logs", container], true)}`);
}

async function resetTo(client: PgClient, stopBefore?: string): Promise<{ discovered: number; applied: number; skipped: number }> {
  await client.unsafe(`
    RESET ROLE; RESET search_path;
    DROP SCHEMA IF EXISTS g005_shadow CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='g005_inherited') THEN CREATE ROLE g005_inherited NOLOGIN; END IF;
    END $$;
    GRANT g005_inherited TO authenticated;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT USAGE ON SCHEMA public TO anon,authenticated;
    CREATE TABLE public.worker_runs(
      id text PRIMARY KEY,worker_name text NOT NULL,status text NOT NULL DEFAULT 'running',
      trigger_source text NOT NULL DEFAULT 'unknown',http_status integer,
      result_json jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
      started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = readdirSync(join("supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    if (stopBefore && file >= stopBefore) break;
    if (skipped.has(file)) continue;
    await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
    applied += 1;
    if (file === "202605110001_full_schema.sql") {
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
  }
  return { discovered: files.length, applied, skipped: skipped.size };
}

async function postgresManifest(client: PgClient): Promise<CompatibilityBackfillManifest> {
  const workspaceScoped = new Set([
    "audit_logs", "user_market_access", "crawl_runs", "crawl_units", "lead_notes", "outreach_events",
    "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
  ]);
  const legacyTables: CompatibilityTableExpectation[] = [];
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const expression = workspaceScoped.has(table)
      ? "(to_jsonb(t)-'tenant_id'-'workspace_id')::text"
      : "(to_jsonb(t)-'tenant_id')::text";
    const [row] = await client.unsafe<Array<{ row_count: number; content_checksum: string }>>(`
      SELECT count(*)::integer row_count,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${expression},'|' ORDER BY ${expression}),''),'UTF8')),'hex') content_checksum
      FROM public."${table}" t
    `);
    legacyTables.push({ table, rowCount: Number(row.row_count), contentChecksum: row.content_checksum });
  }
  return {
    schemaVersion: 1,
    sourceEngine: POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g005-postgres-rehearsal-v1",
    sourceSnapshotFingerprint: "f".repeat(64),
    tenantId: tenantA,
    tenantSlug: "g005-legacy",
    tenantName: "G005 Legacy",
    workspaceId: workspaceA,
    workspaceSlug: "g005-workspace",
    workspaceName: "G005 Workspace",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: ownerA,
    policyId: policyA,
    policyVersion: 1,
    policyHash,
    legacyUsers: [{
      legacyUserId: "legacy-owner", authIdentityId: ownerA, expectedEmail: "owner@g005.invalid",
      expectedLegacyRole: "admin", expectedStatus: "active", membershipId: membershipA,
      workspaceId: workspaceA, membershipRole: "owner", membershipStatus: "active", roleBindingId: bindingA, marketAccessIds: [],
    }],
    legacyTables,
  };
}

async function seedLegacySourceGraph(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerA}');
    INSERT INTO public.app_users(id,user_id,email,role,status)
      VALUES ('legacy-owner','${ownerA}','owner@g005.invalid','admin','active');
    INSERT INTO public.leads(id,place_id,name,assigned_to_user_id)
      VALUES ('lead-a','place-shared','Equivalent Business','${ownerA}');
    INSERT INTO public.places_master(place_id,name,categories,review_highlights,website_health)
      VALUES ('place-shared','Equivalent Business','["contractor"]','{"keywords":["quality"]}','{"status":"ok"}');
    INSERT INTO public.place_cache(place_id,raw_json)
      VALUES ('place-shared','{"id":"place-shared","rating":4.5,"review_count":20}');
    INSERT INTO public.place_observations(id,place_id,lead_id,endpoint,sku,raw_json)
      VALUES ('observation-a','place-shared','lead-a','details','places-details','{"rating":4.5}');
    INSERT INTO public.api_usage_events(id,lead_id,endpoint,sku,metadata)
      VALUES ('usage-linked-a','lead-a','details','places-details','{"request":"legacy"}'),
             ('usage-parentless-legacy',NULL,'details','places-details','{"request":"legacy-parentless"}');
  `);
}

async function prepareUpgrade(client: PgClient): Promise<void> {
  await resetTo(client, G002);
  await seedLegacySourceGraph(client);
  const manifest = await postgresManifest(client);
  await client.unsafe("SELECT public.novatrade_run_compatibility_backfill($1::jsonb)", [JSON.parse(JSON.stringify(manifest))]);
  for (const file of [G002, G003, G004A]) await client.unsafe(readFileSync(join("supabase", "migrations", file), "utf8"));
}

async function addTenantB(client: PgClient): Promise<void> {
  await client.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${ownerB}') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenants(id,slug,name,status) VALUES ('${tenantB}','g005-b','G005 B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES ('${workspaceB}','${tenantB}','g005-b','G005 B','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status)
      VALUES ('${membershipB}','${tenantB}','${ownerB}','${workspaceB}','active') ON CONFLICT DO NOTHING;
    INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-b','${tenantB}','place-shared','Equivalent Business B') ON CONFLICT DO NOTHING;
  `);
}

async function alignReceiptSourceChecksums(client: PgClient): Promise<void> {
  for (const table of sourceTables) {
    const [actual] = await client.unsafe<Array<{ row_count: number; checksum: string }>>(`
      SELECT count(*)::integer row_count,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg((to_jsonb(t)-'tenant_id')::text,'|' ORDER BY (to_jsonb(t)-'tenant_id')::text),''),'UTF8')),'hex') checksum
      FROM public."${table}" t
    `);
    await client.unsafe(`UPDATE public.compatibility_backfill_receipts
      SET table_counts=jsonb_set(table_counts,ARRAY[$1],to_jsonb($2::integer)),
          after_content_checksums=jsonb_set(after_content_checksums,ARRAY[$1],to_jsonb($3::text))`,
      [table, Number(actual.row_count), actual.checksum]);
  }
}

async function expectRejected(work: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(work).rejects.toThrow(pattern);
}

async function expectMigrationRejectedWithoutInstall(client: PgClient, pattern: RegExp): Promise<void> {
  let failure: unknown;
  try { await client.unsafe(migrationSql); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(pattern);
  await client.unsafe("ROLLBACK");
  const [row] = await client.unsafe<Array<{ source_columns: number; function_count: number }>>(`
    SELECT
      (SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('place_cache','places_master','place_observations','api_usage_events') AND column_name='source_card_id') source_columns,
      (SELECT count(*)::integer FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace
        AND proname IN ('novatrade_source_payload_is_safe','novatrade_source_scope_guard')) function_count
  `);
  expect(row.source_columns).toBe(0);
  expect(row.function_count).toBe(0);
}

async function expectReplayRejected(client: PgClient, pattern: RegExp): Promise<void> {
  let failure: unknown;
  try { await client.unsafe(migrationSql); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(pattern);
  await client.unsafe("ROLLBACK");
}

describe("G-005 source cache and usage tenant scope", () => {
  it.skipIf(process.env.G005_RUN_DISPOSABLE_PG_TESTS !== "1")(
    "executes the receipt, replay, catalog, content, tenant, concurrency, and hostile-path matrix on disposable PostgreSQL 16",
    async () => {
      const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
      const container = `g005-pg16-${suffix}`;
      const database = `g005_source_scope_${suffix.replaceAll("-", "_")}`;
      let client: PgClient | undefined;
      expect(docker(["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], true)).toBe("");
      try {
        docker(["run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=postgres", "--env", `POSTGRES_DB=${database}`, pinnedPostgres16]);
        waitForPostgres(container, database);
        const port = docker(["port", container, "5432/tcp"]).split(":").at(-1)!;
        const url = `postgres://postgres:postgres@127.0.0.1:${port}/${database}`;
        const parsed = new URL(url);
        expect(parsed.hostname).toBe("127.0.0.1");
        expect(parsed.pathname).toMatch(/^\/g005_source_scope_[a-z0-9_]+$/);
        client = postgres(url, { max: 1, onnotice: () => undefined });
        const [version] = await client.unsafe<Array<{ version: string }>>("SELECT current_setting('server_version_num') version");
        expect(version.version.startsWith("16")).toBe(true);

        const full = await resetTo(client);
        expect(full).toEqual({ discovered: 46, applied: 44, skipped: 2 });
        await client.unsafe(g007p1Sql);
        await client.unsafe(migrationSql);
        const [catalog] = await client.unsafe<Array<{ source_columns: number; tenant_columns: number; primary_keys: number; source_checks: number; tenant_indexes: number; global_indexes: number; triggers: number; rls_tables: number; policies: number }>>(`
          SELECT
            (SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('place_cache','places_master','place_observations','api_usage_events') AND column_name='source_card_id' AND is_nullable='NO' AND column_default='''google_places_legacy''::text') source_columns,
            (SELECT count(*)::integer FROM pg_catalog.pg_attribute a WHERE (a.attrelid,a.attname) IN (
              ('public.place_cache'::regclass,'tenant_id'),('public.places_master'::regclass,'tenant_id'),
              ('public.place_observations'::regclass,'tenant_id'),('public.api_usage_events'::regclass,'tenant_id'))
              AND NOT a.attisdropped AND a.atttypid='uuid'::regtype AND a.atttypmod=-1 AND a.attnotnull
              AND NOT a.atthasdef AND a.attidentity='' AND a.attgenerated='' AND a.attstorage='p' AND a.attcompression='' AND a.attcollation=0) tenant_columns,
            (SELECT count(*)::integer FROM pg_catalog.pg_constraint WHERE conname IN ('place_cache_pkey','places_master_pkey','place_observations_pkey','api_usage_events_pkey') AND contype='p') primary_keys,
            (SELECT count(*)::integer FROM pg_catalog.pg_constraint WHERE conname IN ('place_cache_source_card_id_chk','places_master_source_card_id_chk','place_observations_source_card_id_chk','api_usage_events_source_card_id_chk') AND contype='c' AND convalidated) source_checks,
            (SELECT count(*)::integer FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid=x.indrelid JOIN pg_catalog.pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=(x.indkey::smallint[])[0] WHERE c.relname IN ('place_cache','places_master','place_observations','api_usage_events') AND a.attname='tenant_id') tenant_indexes,
            (SELECT count(*)::integer FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid=x.indrelid JOIN pg_catalog.pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=(x.indkey::smallint[])[0] WHERE c.relname IN ('place_cache','places_master','place_observations','api_usage_events') AND a.attname<>'tenant_id') global_indexes,
            (SELECT count(*)::integer FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_novatrade_%_scope' AND tgrelid IN ('public.place_cache'::regclass,'public.places_master'::regclass,'public.place_observations'::regclass,'public.api_usage_events'::regclass)) triggers,
            (SELECT count(*)::integer FROM pg_catalog.pg_class WHERE oid IN ('public.place_cache'::regclass,'public.places_master'::regclass,'public.place_observations'::regclass,'public.api_usage_events'::regclass) AND relrowsecurity) rls_tables,
            (SELECT count(*)::integer FROM pg_catalog.pg_policy WHERE polrelid IN ('public.place_cache'::regclass,'public.places_master'::regclass,'public.place_observations'::regclass,'public.api_usage_events'::regclass)) policies
        `);
        expect(catalog).toMatchObject({ source_columns: 4, tenant_columns: 4, primary_keys: 4, source_checks: 4, global_indexes: 0, triggers: 4, rls_tables: 4, policies: 0 });
        expect(catalog.tenant_indexes).toBeGreaterThanOrEqual(4);

        const expectedG007pConstraints = [
          "user_market_access_tenant_workspace_user_market_unique",
          "crawl_runs_tenant_id_id_unique",
          "crawl_units_tenant_id_id_unique",
          "crawl_units_tenant_run_fkey",
          "leads_tenant_id_id_unique",
          "leads_tenant_place_id_unique",
          "lead_notes_tenant_lead_fkey",
          "outreach_events_tenant_lead_fkey",
          "admin_requests_tenant_lead_fkey",
          "demos_tenant_lead_fkey",
          "ai_lead_verifications_tenant_id_id_unique",
          "lead_ai_artifacts_tenant_id_id_unique",
          "ai_lead_verifications_tenant_lead_fkey",
          "lead_ai_artifacts_tenant_lead_fkey",
          "ai_feedback_events_tenant_lead_fkey",
          "ai_feedback_events_tenant_verification_fkey",
          "ai_feedback_events_tenant_artifact_fkey",
          "ai_usage_events_tenant_lead_fkey",
          "ai_usage_events_tenant_verification_fkey",
          "place_cache_pkey",
          "places_master_pkey",
          "place_observations_pkey",
          "api_usage_events_pkey",
          "place_observations_tenant_source_place_fkey",
          "place_observations_tenant_run_fkey",
          "place_observations_tenant_unit_fkey",
          "place_observations_tenant_lead_fkey",
          "api_usage_events_tenant_run_fkey",
          "api_usage_events_tenant_unit_fkey",
          "api_usage_events_tenant_lead_fkey",
        ] as const;
        const g007pConstraints = await client.unsafe<Array<{ conname: string; convalidated: boolean }>>(`
          SELECT conname, convalidated
          FROM pg_catalog.pg_constraint
          WHERE connamespace = 'public'::regnamespace
            AND conname = ANY($1::text[])
          ORDER BY conname
        `, [expectedG007pConstraints]);
        expect(g007pConstraints.map((row) => row.conname)).toEqual([...expectedG007pConstraints].sort());
        expect(g007pConstraints.every((row) => row.convalidated)).toBe(true);

        await client.unsafe("SET enable_seqscan = off");
        try {
          const hotPaths = [
            {
              index: "idx_crawl_units_tenant_retry_ready",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.crawl_units
                WHERE tenant_id = '${tenantA}' AND status = 'pending' AND next_retry_at <= now()
                ORDER BY created_at LIMIT 10`,
            },
            {
              index: "idx_lead_notes_tenant_lead_created",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.lead_notes
                WHERE tenant_id = '${tenantA}' AND lead_id = 'lead-1'
                ORDER BY created_at DESC LIMIT 10`,
            },
            {
              index: "idx_ai_artifacts_tenant_queue",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.lead_ai_artifacts
                WHERE tenant_id = '${tenantA}' AND status = 'queued' AND next_retry_at <= now()
                ORDER BY created_at LIMIT 10`,
            },
            {
              index: "idx_place_observations_tenant_source_place_time",
              sql: `EXPLAIN (COSTS OFF) SELECT id FROM public.place_observations
                WHERE tenant_id = '${tenantA}' AND source_card_id = 'google_places_legacy' AND place_id = 'place-1'
                ORDER BY observed_at DESC LIMIT 10`,
            },
          ] as const;
          for (const hotPath of hotPaths) {
            const plan = await client.unsafe<Record<string, string>[]>(hotPath.sql);
            const renderedPlan = plan.map((row) => Object.values(row)[0]).join("\n");
            if (hotPath.index === "idx_ai_artifacts_tenant_queue") {
              expect(renderedPlan).toMatch(/idx_(?:ai_artifacts|g007p_ai_artifacts)_tenant_/u);
            } else {
              expect(renderedPlan).toContain(hotPath.index);
            }
          }
        } finally {
          await client.unsafe("RESET enable_seqscan");
        }
        for (const role of ["anon", "authenticated"]) {
          for (const table of sourceTables) {
            expect((await client.unsafe("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed", [role, `public.${table}`]))[0].allowed).toBe(false);
          }
          expect((await client.unsafe("SELECT has_function_privilege($1,'public.novatrade_source_payload_is_safe(jsonb)','EXECUTE') allowed", [role]))[0].allowed).toBe(false);
          expect((await client.unsafe("SELECT has_function_privilege($1,'public.novatrade_source_scope_guard()','EXECUTE') allowed", [role]))[0].allowed).toBe(false);
        }

        await prepareUpgrade(client);
        await client.unsafe(migrationSql);
        await client.unsafe(migrationSql);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.api_usage_events WHERE id='usage-parentless-legacy'"))[0].count).toBe(1);
        const placeOnlyObservations = await client.unsafe(`
          INSERT INTO public.place_observations(id,place_id,endpoint,sku,raw_json)
            VALUES ('observation-place-only-omitted','place-shared','details','places-details','{}')
            RETURNING tenant_id::text,source_card_id
        `);
        expect(placeOnlyObservations).toEqual([{ tenant_id: tenantA, source_card_id: "google_places_legacy" }]);
        const explicitNullObservations = await client.unsafe(`
          INSERT INTO public.place_observations(id,tenant_id,place_id,endpoint,sku,raw_json)
            VALUES ('observation-place-only-null',NULL,'place-shared','details','places-details','{}')
            RETURNING tenant_id::text,source_card_id
        `);
        expect(explicitNullObservations).toEqual([{ tenant_id: tenantA, source_card_id: "google_places_legacy" }]);
        await expectRejected(client.unsafe("INSERT INTO public.place_cache(place_id,raw_json) VALUES ('place-without-tenant','{}')"), /G005_TENANT_REQUIRED|null value/);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache WHERE place_id='place-without-tenant'"))[0].count).toBe(0);

        await addTenantB(client);
        await client.unsafe(`INSERT INTO public.places_master(tenant_id,place_id,name) VALUES ('${tenantB}','place-shared','Tenant B Place'); INSERT INTO public.place_cache(tenant_id,place_id,raw_json) VALUES ('${tenantB}','place-shared','{"tenant":"b"}')`);
        const identities = await client.unsafe("SELECT tenant_id::text,source_card_id,place_id,raw_json FROM public.place_cache WHERE place_id='place-shared' ORDER BY tenant_id");
        expect(identities).toHaveLength(2);
        expect(identities.map((row) => row.source_card_id)).toEqual(["google_places_legacy", "google_places_legacy"]);
        expect(identities[0].raw_json).not.toEqual(identities[1].raw_json);
        await expectRejected(client.unsafe("INSERT INTO public.place_observations(id,place_id,endpoint,sku,raw_json) VALUES ('observation-place-ambiguous','place-shared','details','places-details','{}')"), /G005_PLACE_PARENT_REQUIRED/);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_observations WHERE id='observation-place-ambiguous'"))[0].count).toBe(0);

        await client.unsafe(`
          INSERT INTO public.crawl_runs(id,tenant_id,workspace_id,market_id) VALUES ('run-a','${tenantA}','${workspaceA}','market-colorado'),('run-b','${tenantB}','${workspaceB}','market-colorado');
          INSERT INTO public.crawl_units(id,crawl_run_id,zip,category,market_id,location_mode) VALUES ('unit-a','run-a','not-a-zip-a','test','market-colorado','generalized'),('unit-b','run-b','not-a-zip-b','test','market-colorado','generalized');
        `);
        const [observation] = await client.unsafe(`INSERT INTO public.place_observations(id,place_id,crawl_run_id,crawl_unit_id,lead_id,endpoint,sku,raw_json)
          VALUES ('observation-derived','place-shared','run-a','unit-a','lead-a','details','places-details','{"rating":4.7}') RETURNING tenant_id::text,source_card_id`);
        expect(observation).toEqual({ tenant_id: tenantA, source_card_id: "google_places_legacy" });
        await expectRejected(client.unsafe(`INSERT INTO public.place_observations(id,tenant_id,place_id,lead_id,endpoint,sku,raw_json) VALUES ('observation-cross','${tenantB}','place-shared','lead-a','details','places-details','{}')`), /G005_TENANT_MISMATCH/);
        await expectRejected(client.unsafe(`INSERT INTO public.place_observations(id,place_id,crawl_run_id,crawl_unit_id,endpoint,sku,raw_json) VALUES ('observation-pair','place-shared','run-a','unit-b','details','places-details','{}')`), /G005_PARENT_TENANT_MISMATCH|G005_RUN_UNIT_MISMATCH/);
        await expectRejected(client.unsafe(`INSERT INTO public.place_observations(id,place_id,lead_id,endpoint,sku,raw_json) VALUES ('observation-place','wrong-place','lead-a','details','places-details','{}')`), /G005_LEAD_PLACE_MISMATCH/);
        await expectRejected(client.unsafe("INSERT INTO public.api_usage_events(id,endpoint,sku) VALUES ('usage-parentless-new','details','places-details')"), /G005_USAGE_RUNTIME_PARENT_REQUIRED/);
        const [usage] = await client.unsafe("INSERT INTO public.api_usage_events(id,crawl_unit_id,endpoint,sku) VALUES ('usage-derived','unit-a','details','places-details') RETURNING tenant_id::text,source_card_id");
        expect(usage).toEqual({ tenant_id: tenantA, source_card_id: "google_places_legacy" });
        await expectRejected(client.unsafe("UPDATE public.api_usage_events SET lead_id='lead-b' WHERE tenant_id=$1 AND id='usage-derived'", [tenantA]), /G005_(USAGE_SCOPE_IMMUTABLE|PARENT_TENANT_MISMATCH)/);

        for (const payload of [
          { Reviews: [{ text: "not retained" }] },
          { nested: { review_body: "not retained" } },
          { nested: [{ ReviewerName: "not retained" }] },
          { auth: { API_KEY: "not retained" } },
          { nested: { clientSecret: "not retained" } },
        ]) {
          expect((await client.unsafe("SELECT prosrc FROM pg_catalog.pg_proc WHERE oid='public.novatrade_source_payload_is_safe(jsonb)'::regprocedure"))[0].prosrc).toContain("WITH RECURSIVE nodes");
          expect((await client.unsafe("SELECT pg_catalog.jsonb_typeof($1::jsonb) kind,(SELECT pg_catalog.string_agg(pg_catalog.lower(pg_catalog.regexp_replace(key,'[^[:alnum:]]','','g')),',') FROM pg_catalog.jsonb_object_keys($1::jsonb) key) keys", [payload]))[0], JSON.stringify(payload)).toMatchObject({ kind: "object" });
          expect((await client.unsafe("SELECT public.novatrade_source_payload_is_safe($1::jsonb) safe", [payload]))[0].safe, JSON.stringify(payload)).toBe(false);
          await expectRejected(client.unsafe("INSERT INTO public.place_cache(tenant_id,place_id,raw_json) VALUES ($1,$2,$3::jsonb)", [tenantA, `blocked-${randomUUID()}`, payload]), /G005_PROHIBITED_SOURCE_CONTENT/);
          await expectRejected(client.unsafe("UPDATE public.place_cache SET raw_json=$1::jsonb WHERE tenant_id=$2 AND place_id='place-shared'", [payload, tenantA]), /G005_PROHIBITED_SOURCE_CONTENT/);
        }
        await expectRejected(client.unsafe(`UPDATE public.places_master SET review_highlights='{"nested":{"AuthorAttribution":"person"}}' WHERE tenant_id='${tenantA}' AND place_id='place-shared'`), /G005_PROHIBITED_SOURCE_CONTENT/);
        await expectRejected(client.unsafe(`UPDATE public.place_observations SET raw_json='{"Nested":{"AccessToken":"secret"}}' WHERE tenant_id='${tenantA}' AND id='observation-derived'`), /G005_PROHIBITED_SOURCE_CONTENT/);
        await expectRejected(client.unsafe(`UPDATE public.api_usage_events SET metadata='{"Password":"secret"}' WHERE tenant_id='${tenantA}' AND id='usage-derived'`), /G005_PROHIBITED_SOURCE_CONTENT/);

        await prepareUpgrade(client);
        await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; DELETE FROM public.compatibility_backfill_receipts");
        await expectMigrationRejectedWithoutInstall(client, /G005_MATCHING_T028_RECEIPT_REQUIRED/);

        await prepareUpgrade(client);
        await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk; UPDATE public.compatibility_backfill_receipts SET after_content_checksums=jsonb_set(after_content_checksums,'{place_cache}','\"" + "0".repeat(64) + "\"'::jsonb)");
        await expectMigrationRejectedWithoutInstall(client, /G005_MATCHING_T028_RECEIPT_REQUIRED/);

        await prepareUpgrade(client);
        await client.unsafe("ALTER TABLE public.compatibility_backfill_receipts DISABLE TRIGGER trg_novatrade_compatibility_backfill_receipt_guard; ALTER TABLE public.compatibility_backfill_receipts DROP CONSTRAINT compatibility_backfill_receipts_receipt_binding_chk; UPDATE public.place_observations SET lead_id='missing-lead';");
        await alignReceiptSourceChecksums(client);
        await expectMigrationRejectedWithoutInstall(client, /G005_EXISTING_REFERENCE_SCOPE_INVALID/);

        await prepareUpgrade(client);
        await client.unsafe("ALTER TABLE public.place_cache ADD COLUMN source_card_id text");
        let partialFailure: unknown;
        try { await client.unsafe(migrationSql); } catch (error) { partialFailure = error; }
        expect(partialFailure).toBeInstanceOf(Error);
        expect((partialFailure as Error).message).toMatch(/G005_PARTIAL_OR_SPOOFED_CATALOG/);
        await client.unsafe("ROLLBACK");
        expect((await client.unsafe("SELECT count(*)::integer count FROM information_schema.columns WHERE table_schema='public' AND table_name='place_cache' AND column_name='source_card_id'"))[0].count).toBe(1);

        // Activation rejects tenant-column drift before installing any G-005
        // object, and the failed transaction does not repair the spoof.
        await prepareUpgrade(client);
        await client.unsafe(`ALTER TABLE public.place_cache ALTER COLUMN tenant_id SET DEFAULT '${tenantA}'::uuid`);
        await expectMigrationRejectedWithoutInstall(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
        expect((await client.unsafe("SELECT atthasdef FROM pg_catalog.pg_attribute WHERE attrelid='public.place_cache'::regclass AND attname='tenant_id'"))[0].atthasdef).toBe(true);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count).toBe(1);

        for (const [column, value] of [["attidentity", "a"], ["attgenerated", "s"]] as const) {
          await prepareUpgrade(client);
          const beforeCount = Number((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count);
          await client.unsafe(`UPDATE pg_catalog.pg_attribute SET ${column}=$1 WHERE attrelid='public.place_cache'::regclass AND attname='tenant_id'`, [value]);
          await expectMigrationRejectedWithoutInstall(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
          expect((await client.unsafe(`SELECT ${column} value FROM pg_catalog.pg_attribute WHERE attrelid='public.place_cache'::regclass AND attname='tenant_id'`))[0].value).toBe(value);
          expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count).toBe(beforeCount);
        }

        // Preactivation column ACLs fail closed, including effective access
        // inherited by authenticated through a separate role.
        await prepareUpgrade(client);
        await client.unsafe("GRANT SELECT(place_id) ON public.place_cache TO g005_inherited");
        expect((await client.unsafe("SELECT has_column_privilege('authenticated','public.place_cache','place_id','SELECT') allowed"))[0].allowed).toBe(true);
        await expectMigrationRejectedWithoutInstall(client, /G005_BASE_RLS_OR_ACL_INVALID/);
        expect((await client.unsafe("SELECT has_column_privilege('authenticated','public.place_cache','place_id','SELECT') allowed"))[0].allowed).toBe(true);

        // Every target tenant column participates in the exact replay shape.
        // A default is never accepted as an implicit tenant source.
        for (const table of sourceTables) {
          await prepareUpgrade(client);
          await client.unsafe(migrationSql);
          const beforeCount = Number((await client.unsafe(`SELECT count(*)::integer count FROM public.${table}`))[0].count);
          await client.unsafe(`ALTER TABLE public.${table} ALTER COLUMN tenant_id SET DEFAULT '${tenantA}'::uuid`);
          await expectReplayRejected(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
          const [shape] = await client.unsafe<Array<{ has_default: boolean; row_count: number }>>(`
            SELECT
              (SELECT atthasdef FROM pg_catalog.pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='tenant_id') has_default,
              (SELECT count(*)::integer FROM public.${table}) row_count
          `);
          expect(shape).toEqual({ has_default: true, row_count: beforeCount });
        }

        // Disposable-catalog adversaries cover identity/generated flags that
        // PostgreSQL cannot legally attach to a UUID through ordinary DDL.
        for (const [column, value] of [["attidentity", "a"], ["attgenerated", "s"]] as const) {
          await prepareUpgrade(client);
          await client.unsafe(migrationSql);
          const beforeCount = Number((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count);
          await client.unsafe(`UPDATE pg_catalog.pg_attribute SET ${column}=$1 WHERE attrelid='public.place_cache'::regclass AND attname='tenant_id'`, [value]);
          await expectReplayRejected(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
          expect((await client.unsafe(`SELECT ${column} value FROM pg_catalog.pg_attribute WHERE attrelid='public.place_cache'::regclass AND attname='tenant_id'`))[0].value).toBe(value);
          expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count).toBe(beforeCount);
        }

        // Post-install direct and inherited column grants are catalog drift;
        // replay rejects and leaves the pre-existing grant untouched.
        for (const grant of [
          { grantee: "PUBLIC", table: "api_usage_events", column: "id" },
          { grantee: "g005_inherited", table: "place_cache", column: "place_id" },
        ]) {
          await prepareUpgrade(client);
          await client.unsafe(migrationSql);
          await client.unsafe(`GRANT SELECT(${grant.column}) ON public.${grant.table} TO ${grant.grantee}`);
          await expectReplayRejected(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
          expect((await client.unsafe("SELECT has_column_privilege('authenticated',$1,$2,'SELECT') allowed", [`public.${grant.table}`, grant.column]))[0].allowed).toBe(true);
        }

        // Same-name executable overloads for both helpers invalidate the
        // complete public function set and survive the rejected replay.
        for (const functionName of ["novatrade_source_payload_is_safe", "novatrade_source_scope_guard"] as const) {
          await prepareUpgrade(client);
          await client.unsafe(migrationSql);
          await client.unsafe(`CREATE FUNCTION public.${functionName}(spoof text) RETURNS boolean LANGUAGE sql AS 'SELECT true'; GRANT EXECUTE ON FUNCTION public.${functionName}(text) TO authenticated`);
          await expectReplayRejected(client, /G005_PARTIAL_OR_SPOOFED_CATALOG/);
          expect((await client.unsafe("SELECT pg_catalog.to_regprocedure($1) IS NOT NULL present", [`public.${functionName}(text)`]))[0].present).toBe(true);
          expect((await client.unsafe("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed", [`public.${functionName}(text)`]))[0].allowed).toBe(true);
        }

        await prepareUpgrade(client);
        await client.unsafe(migrationSql);
        await client.unsafe(migrationSql);
        for (const signature of ["public.novatrade_source_payload_is_safe(jsonb)", "public.novatrade_source_scope_guard()"]) {
          expect((await client.unsafe("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed", [signature]))[0].allowed).toBe(false);
        }

        await prepareUpgrade(client);
        await client.unsafe("CREATE SCHEMA g005_shadow; CREATE TABLE g005_shadow.place_cache(sentinel text); CREATE TABLE g005_shadow.places_master(sentinel text); CREATE TABLE g005_shadow.place_observations(sentinel text); CREATE TABLE g005_shadow.api_usage_events(sentinel text); SET search_path=g005_shadow,public");
        await client.unsafe(migrationSql);
        expect((await client.unsafe("SELECT count(*)::integer count FROM public.place_cache"))[0].count).toBe(1);
        expect((await client.unsafe("SELECT count(*)::integer count FROM g005_shadow.place_cache"))[0].count).toBe(0);
        expect((await client.unsafe("SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='public.novatrade_source_scope_guard()'::regprocedure"))[0].proconfig).toEqual(["search_path=pg_catalog, public"]);

        await client.unsafe("RESET search_path");
        const migrationClient = postgres(url, { max: 1, onnotice: () => undefined });
        const writerClient = postgres(url, { max: 1, onnotice: () => undefined });
        let replay: Promise<unknown> | undefined;
        try {
          const [{ pid }] = await migrationClient.unsafe<Array<{ pid: number }>>("SELECT pg_catalog.pg_backend_pid() pid");
          replay = Promise.resolve(migrationClient.unsafe(migrationSql.replace("-- G005_WRITER_LOCKS_ACQUIRED", "-- G005_WRITER_LOCKS_ACQUIRED\nSELECT pg_catalog.pg_sleep(2);")));
          let lockCount = 0;
          for (let attempt = 0; attempt < 80 && lockCount !== 9; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            lockCount = Number((await client.unsafe(`SELECT count(*)::integer count FROM pg_catalog.pg_locks WHERE pid=${pid} AND granted AND mode='ShareRowExclusiveLock' AND relation IN ('public.compatibility_backfill_receipts'::regclass,'public.tenants'::regclass,'public.crawl_runs'::regclass,'public.crawl_units'::regclass,'public.leads'::regclass,'public.place_cache'::regclass,'public.places_master'::regclass,'public.place_observations'::regclass,'public.api_usage_events'::regclass)`))[0].count);
          }
          expect(lockCount).toBe(9);
          await writerClient.unsafe("SET lock_timeout='250ms'");
          await expectRejected(writerClient.unsafe("UPDATE public.place_cache SET fetched_at=fetched_at"), /lock timeout/);
          await replay;
        } finally {
          await replay?.catch(() => undefined);
          await migrationClient.end({ timeout: 5 });
          await writerClient.end({ timeout: 5 });
        }

        await client.unsafe("CREATE OR REPLACE FUNCTION public.novatrade_source_payload_is_safe(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS 'SELECT true'");
        let driftFailure: unknown;
        try { await client.unsafe(migrationSql); } catch (error) { driftFailure = error; }
        expect(driftFailure).toBeInstanceOf(Error);
        expect((driftFailure as Error).message).toMatch(/G005_PARTIAL_OR_SPOOFED_CATALOG/);
        await client.unsafe("ROLLBACK");
      } finally {
        await client?.end({ timeout: 5 }).catch(() => undefined);
        docker(["stop", container], true);
        expect(docker(["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], true)).toBe("");
      }
    },
    240_000,
  );
});
