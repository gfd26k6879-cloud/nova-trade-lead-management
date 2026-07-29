import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const migration = "202607290002_add_lead_crm_tenant_scope.sql";
const migrationSql = readFileSync(join("supabase", "migrations", migration), "utf8");
const skipped = new Set(["20260514161714_supabase_ai_verification_cron.sql", "20260514163203_scheduler_v2_sales_ready_pipeline.sql"]);
const tenantA = "00000000-0000-4000-8000-000000000301";
const tenantB = "00000000-0000-4000-8000-000000000302";

describe("G-003 lead CRM tenant scope", () => {
  it("keeps the receipt gate, compound ownership, hardened helpers, and bounded public projection explicit", () => {
    for (const code of ["G003_UNRECONCILED_T028_SCOPE", "G003_EXACTLY_ONE_MATCHING_T028_RECEIPT_REQUIRED", "G003_T028_RECEIPT_SCOPE_DRIFT", "G003_LEAD_CHILD_ORPHAN_OR_SCOPE_MISMATCH", "G003_LEAD_CHILD_SCOPE_IMMUTABLE", "G003_LEAD_TENANT_IMMUTABLE"]) expect(migrationSql).toContain(code);
    expect(migrationSql).toContain("UNIQUE(tenant_id,place_id)");
    expect(migrationSql).toContain("FOREIGN KEY (tenant_id,lead_id) REFERENCES public.leads(tenant_id,id)");
    expect(migrationSql).toContain("SET search_path = pg_catalog, public");
    expect(migrationSql).toContain("JOIN public.leads l ON (l.tenant_id,l.id)=(d.tenant_id,d.lead_id)");
    expect(migrationSql).toContain("'headline'");
    expect(migrationSql).toContain("REVOKE ALL ON TABLE public.leads,public.lead_notes,public.outreach_events,public.admin_requests,public.demos");
  });

  it.skipIf(process.env.G003_RUN_DISPOSABLE_PG_TESTS !== "1")("rehearses fresh, hostile-path, isolation, immutability, public projection, and replay behavior on PostgreSQL 16", async () => {
    const url = process.env.G003_DATABASE_URL;
    if (!url) throw new Error("G003_DATABASE_URL is required");
    const parsed = new URL(url);
    if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || !/^g003_lead_crm_rehearsal_[a-z0-9_]+$/.test(parsed.pathname.slice(1))) throw new Error("G-003 permits only a uniquely named loopback database");
    const sql = postgres(url, { max: 1, onnotice: () => undefined });
    try {
      expect((await sql.unsafe<Array<{ v: string }>>("SELECT current_setting('server_version_num') v"))[0].v.startsWith("16")).toBe(true);
      await sql.unsafe("DROP SCHEMA IF EXISTS g003_shadow CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$; CREATE TABLE public.worker_runs(id text PRIMARY KEY,worker_name text NOT NULL,status text NOT NULL DEFAULT 'running',trigger_source text NOT NULL DEFAULT 'unknown',http_status integer,result_json jsonb NOT NULL DEFAULT '{}'::jsonb,error text,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now())");
      const files = readdirSync(join("supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
      for (const file of files) { if (skipped.has(file)) continue; await sql.unsafe(readFileSync(join("supabase", "migrations", file), "utf8")); if (file === "202605110001_full_schema.sql") await sql.unsafe("ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS scheduler_ai_verification_enabled integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS scheduler_crawl_enabled integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS scheduler_enrichment_enabled integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS scheduler_artifact_enabled integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS scheduler_score_recompute_enabled integer NOT NULL DEFAULT 1; ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_website_feedback_status text, ADD COLUMN IF NOT EXISTS ai_corrected_website_url text, ADD COLUMN IF NOT EXISTS ai_false_positive_reason text, ADD COLUMN IF NOT EXISTS ai_reviewer_notes text, ADD COLUMN IF NOT EXISTS ai_feedback_at timestamptz"); }
      expect(files).toHaveLength(43); expect(files.length-skipped.size).toBe(41);
      await sql.unsafe("INSERT INTO public.tenants(id,slug,name,status) VALUES ($1,'tenant-a','A','active'),($2,'tenant-b','B','active')", [tenantA, tenantB]);
      await sql.unsafe("CREATE SCHEMA g003_shadow; CREATE TABLE g003_shadow.leads(sentinel text); SET search_path=g003_shadow,public");
      await sql.unsafe("INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('lead-a',$1,'same-place','A'),('lead-b',$2,'same-place','B')", [tenantA,tenantB]);
      await sql.unsafe("RESET search_path");
      await sql.unsafe("INSERT INTO public.outreach_events(id,lead_id,tenant_id,channel) VALUES ('event-a','lead-a',$1,'email')", [tenantA]);
      await expect(sql.unsafe("INSERT INTO public.outreach_events(id,lead_id,tenant_id,channel) VALUES ('event-b','lead-a',$1,'email')", [tenantB])).rejects.toThrow(/G003_LEAD_CHILD_TENANT_MISMATCH/);
      await expect(sql.unsafe("UPDATE public.leads SET tenant_id=$1 WHERE id='lead-a'", [tenantB])).rejects.toThrow(/G003_LEAD_TENANT_IMMUTABLE/);
      await sql.unsafe("INSERT INTO public.demos(id,lead_id,tenant_id,slug,config_json,is_published) VALUES ('demo-a','lead-a',$1,'public-a','{\"headline\":\"safe\",\"secret\":\"no\"}',1),('demo-b','lead-b',$2,'private-b','{}',0)", [tenantA,tenantB]);
      expect(await sql.unsafe("SELECT * FROM public.novatrade_published_demo_public('public-a')")).toEqual([expect.objectContaining({ slug:"public-a", template_id:"default", config_json:{ headline:"safe" }, name:"A" })]);
      expect(await sql.unsafe("SELECT * FROM public.novatrade_published_demo_public('private-b')")).toEqual([]);
      await sql.unsafe("UPDATE public.demos SET revoked_at=now() WHERE id='demo-a'");
      expect(await sql.unsafe("SELECT * FROM public.novatrade_published_demo_public('public-a')")).toEqual([]);
      await sql.unsafe(readFileSync(join("supabase","migrations",migration),"utf8"));
    } finally { await sql.unsafe("RESET search_path; DROP SCHEMA IF EXISTS g003_shadow CASCADE").catch(() => undefined); await sql.end({ timeout: 5 }); }
  }, 120000);
});
