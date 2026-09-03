import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const RUN_DISPOSABLE_TEST = process.env.F01_RUN_DISPOSABLE_PG_TESTS === "1";
const DATABASE_NAME = "f01_lead_rls_rehearsal";
const RUNTIME_ROLE = "f01_lead_rls_runtime";
const RUNTIME_PASSWORD = "f01-disposable-runtime";
const TARGET_TABLES = ["leads", "lead_notes", "outreach_events", "admin_requests", "demos"] as const;
const SKIPPED_SUPABASE_ONLY_MIGRATIONS = new Set([
  "20260514161714_supabase_ai_verification_cron.sql",
  "20260514163203_scheduler_v2_sales_ready_pipeline.sql",
]);

const tenantA = "00000000-0000-4000-8000-000000000f01";
const tenantB = "00000000-0000-4000-8000-000000000f02";
const workspaceA = "10000000-0000-4000-8000-000000000f01";
const workspaceB = "10000000-0000-4000-8000-000000000f02";
const workspaceAOther = "10000000-0000-4000-8000-000000000f03";
const actorA = "20000000-0000-4000-8000-000000000f01";
const actorB = "20000000-0000-4000-8000-000000000f02";
const actorAOther = "20000000-0000-4000-8000-000000000f03";
const membershipA = "30000000-0000-4000-8000-000000000f01";
const membershipB = "30000000-0000-4000-8000-000000000f02";
const membershipAOther = "30000000-0000-4000-8000-000000000f03";
const bindingA = "40000000-0000-4000-8000-000000000f01";
const bindingB = "40000000-0000-4000-8000-000000000f02";
const bindingAOther = "40000000-0000-4000-8000-000000000f03";

type Db = Sql | TransactionSql;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function installPortableMigrationPrerequisites(admin: Sql): Promise<void> {
  await admin.unsafe(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;
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
}

async function replayMigrations(admin: Sql): Promise<void> {
  const migrations = readdirSync(join("supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    if (SKIPPED_SUPABASE_ONLY_MIGRATIONS.has(migration)) continue;
    await admin.unsafe(readFileSync(join("supabase", "migrations", migration), "utf8"));
    if (migration === "202605110001_full_schema.sql") {
      await admin.unsafe(`
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
}

async function seedTwoTenantGraph(admin: Sql): Promise<void> {
  await admin.unsafe(`
    INSERT INTO auth.users(id) VALUES ('${actorA}'), ('${actorB}'), ('${actorAOther}');
    INSERT INTO public.app_users(id,user_id,email,role,status) VALUES
      ('f01-user-a','${actorA}','f01-a@synthetic.invalid','admin','active'),
      ('f01-user-b','${actorB}','f01-b@synthetic.invalid','admin','active'),
      ('f01-user-a-other','${actorAOther}','f01-a-other@synthetic.invalid','admin','active');
    INSERT INTO public.tenants(id,slug,name,status) VALUES
      ('${tenantA}','f01-tenant-a','F01 Tenant A','active'),
      ('${tenantB}','f01-tenant-b','F01 Tenant B','active');
    INSERT INTO public.workspaces(id,tenant_id,slug,name,status) VALUES
      ('${workspaceA}','${tenantA}','f01-workspace','F01 Workspace A','active'),
      ('${workspaceB}','${tenantB}','f01-workspace','F01 Workspace B','active'),
      ('${workspaceAOther}','${tenantA}','f01-workspace-other','F01 Workspace A Other','active');
    INSERT INTO public.tenant_memberships(id,tenant_id,auth_identity_id,workspace_id,status) VALUES
      ('${membershipA}','${tenantA}','${actorA}','${workspaceA}','active'),
      ('${membershipB}','${tenantB}','${actorB}','${workspaceB}','active'),
      ('${membershipAOther}','${tenantA}','${actorAOther}','${workspaceAOther}','active');
    INSERT INTO public.tenant_role_bindings(id,tenant_id,membership_id,role) VALUES
      ('${bindingA}','${tenantA}','${membershipA}','owner'),
      ('${bindingB}','${tenantB}','${membershipB}','owner'),
      ('${bindingAOther}','${tenantA}','${membershipAOther}','owner');
    INSERT INTO public.leads(id,tenant_id,place_id,name,assigned_to_user_id) VALUES
      ('f01-lead-a','${tenantA}','f01-place-a','Tenant A lead','${actorA}'),
      ('f01-lead-b','${tenantB}','f01-place-b','Tenant B lead','${actorB}');
    INSERT INTO public.lead_notes(id,tenant_id,workspace_id,lead_id,author_user_id,body) VALUES
      ('f01-note-a','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','Tenant A note'),
      ('f01-note-b','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','Tenant B note'),
      ('f01-note-a-other','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','Tenant A other workspace note');
    INSERT INTO public.outreach_events(id,tenant_id,workspace_id,lead_id,actor_user_id,channel,note) VALUES
      ('f01-outreach-a','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','email','Tenant A outreach'),
      ('f01-outreach-b','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','email','Tenant B outreach'),
      ('f01-outreach-a-other','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','email','Tenant A other workspace outreach');
    INSERT INTO public.admin_requests(id,tenant_id,workspace_id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status,summary) VALUES
      ('f01-request-a','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','${actorA}','quote_request','new','Tenant A request'),
      ('f01-request-b','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','${actorB}','quote_request','new','Tenant B request'),
      ('f01-request-a-other','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','${actorAOther}','quote_request','done','Tenant A other workspace request');
    INSERT INTO public.demos(id,tenant_id,workspace_id,lead_id,slug,template_id) VALUES
      ('f01-demo-a','${tenantA}','${workspaceA}','f01-lead-a','f01-demo-a','tenant-a-template'),
      ('f01-demo-b','${tenantB}','${workspaceB}','f01-lead-b','f01-demo-b','tenant-b-template'),
      ('f01-demo-a-other','${tenantA}','${workspaceAOther}','f01-lead-a','f01-demo-a-other','tenant-a-other-template');
  `);
}

async function installMemberContext(db: Db, tenantId = tenantA): Promise<void> {
  const tenantBContext = tenantId === tenantB;
  const settings: Record<string, string> = {
    "app.tenant_id": tenantId,
    "app.workspace_id": tenantBContext ? workspaceB : workspaceA,
    "app.actor_id": tenantBContext ? actorB : actorA,
    "app.membership_id": tenantBContext ? membershipB : membershipA,
    "app.role": "owner",
    "app.role_binding_id": tenantBContext ? bindingB : bindingA,
    "app.support_grant_id": "",
    "app.job_id": "",
    "app.run_id": "",
    "app.lease_id": "",
    "app.lease_generation": "",
    "app.worker_name": "",
    "app.worker_action": "",
    "app.worker_principal_kind": "",
    "app.correlation_id": tenantBContext ? "f01-member-b" : "f01-member-a",
  };
  for (const [name, value] of Object.entries(settings)) {
    await db.unsafe("SELECT pg_catalog.set_config($1, $2, true)", [name, value]);
  }
}

async function inMemberContext<T>(runtime: Sql, callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return (await runtime.begin(async (tx) => {
    await installMemberContext(tx);
    return callback(tx);
  })) as T;
}

async function visibleIds(runtime: Sql, table: string): Promise<string[]> {
  return inMemberContext(runtime, async (tx) => {
    const rows = await tx.unsafe<Array<{ id: string }>>(`SELECT id FROM public.${table} ORDER BY id`);
    return rows.map((row) => row.id);
  });
}

describe.skipIf(!RUN_DISPOSABLE_TEST)("F-01 lead CRM restricted-role RLS", () => {
  const adminUrl = process.env.F01_DATABASE_URL ?? "postgres://invalid";
  const admin = postgres(adminUrl, { max: 1, connect_timeout: 5, onnotice: () => undefined });
  let runtime: Sql | undefined;

  afterAll(async () => {
    try {
      await runtime?.end({ timeout: 5 });
      const roleExists = await admin.unsafe<Array<{ exists: boolean }>>(
        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) AS exists",
        [RUNTIME_ROLE],
      );
      if (roleExists[0]?.exists) {
        await admin.unsafe(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(DATABASE_NAME)} FROM ${quoteIdentifier(RUNTIME_ROLE)}`);
        await admin.unsafe(`DROP OWNED BY ${quoteIdentifier(RUNTIME_ROLE)}`);
        await admin.unsafe(`DROP ROLE ${quoteIdentifier(RUNTIME_ROLE)}`);
      }
      const remainingRole = await admin.unsafe<Array<{ rolname: string }>>(
        "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname=$1",
        [RUNTIME_ROLE],
      );
      expect(remainingRole).toEqual([]);
    } finally {
      await admin.end({ timeout: 5 });
    }
  });

  it("allows workspace A CRUD but cannot read or mutate tenant B or tenant A's other workspace", async () => {
    const parsed = new URL(adminUrl);
    expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
    expect(parsed.pathname.slice(1)).toBe(DATABASE_NAME);
    const [receipt] = await admin.unsafe<Array<{ current_user: string; rolsuper: boolean; server_version_num: number }>>(`
      SELECT current_user, role.rolsuper, current_setting('server_version_num')::integer AS server_version_num
      FROM pg_catalog.pg_roles role WHERE role.rolname=current_user
    `);
    expect(receipt).toMatchObject({ current_user: "postgres", rolsuper: true });
    expect(Math.floor(receipt.server_version_num / 10_000)).toBe(16);

    await installPortableMigrationPrerequisites(admin);
    await replayMigrations(admin);
    await seedTwoTenantGraph(admin);

    await admin.unsafe(`CREATE ROLE ${quoteIdentifier(RUNTIME_ROLE)} LOGIN PASSWORD '${RUNTIME_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.unsafe(`GRANT CONNECT ON DATABASE ${quoteIdentifier(DATABASE_NAME)} TO ${quoteIdentifier(RUNTIME_ROLE)}`);
    await admin.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(RUNTIME_ROLE)}`);
    await admin.unsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ${TARGET_TABLES.map((table) => `public.${table}`).join(",")} TO ${quoteIdentifier(RUNTIME_ROLE)}`);
    await admin.unsafe(`GRANT SELECT ON TABLE public.tenant_memberships TO ${quoteIdentifier(RUNTIME_ROLE)}`);
    await admin.unsafe(`GRANT EXECUTE ON FUNCTION
      public.novatrade_rls_member_context(),
      public.novatrade_assert_lead_actor(uuid,uuid,text,boolean)
      TO ${quoteIdentifier(RUNTIME_ROLE)}`);

    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = RUNTIME_ROLE;
    runtimeUrl.password = RUNTIME_PASSWORD;
    runtime = postgres(runtimeUrl.toString(), { max: 1, connect_timeout: 5, onnotice: () => undefined });
    const [runtimeReceipt] = await runtime.unsafe<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean; rolinherit: boolean }>>(`
      SELECT current_user, rolsuper, rolbypassrls, rolinherit
      FROM pg_catalog.pg_roles WHERE rolname=current_user
    `);
    expect(runtimeReceipt).toEqual({ current_user: RUNTIME_ROLE, rolsuper: false, rolbypassrls: false, rolinherit: false });

    const catalog = await admin.unsafe<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policy_count: number }>>(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,count(p.policyname)::integer AS policy_count
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_catalog.pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
      WHERE n.nspname='public' AND c.relname IN (${TARGET_TABLES.map((table) => `'${table}'`).join(",")})
      GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity ORDER BY c.relname
    `);
    expect(catalog).toEqual(TARGET_TABLES.toSorted().map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true, policy_count: 4 })));

    const expectedVisible: Record<(typeof TARGET_TABLES)[number], string[]> = {
      leads: ["f01-lead-a"],
      lead_notes: ["f01-note-a"],
      outreach_events: ["f01-outreach-a"],
      admin_requests: ["f01-request-a"],
      demos: ["f01-demo-a"],
    };
    for (const table of TARGET_TABLES) expect(await visibleIds(runtime, table), table).toEqual(expectedVisible[table]);

    const noContextRows = await runtime.unsafe<Array<{ id: string }>>("SELECT id FROM public.leads");
    expect(noContextRows).toEqual([]);
    await expect(runtime.unsafe("SET ROLE postgres")).rejects.toThrow(/permission denied|must be member/i);

    const ownInserts = [
        `INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('f01-own-lead','${tenantA}','f01-own-place','own') RETURNING id`,
        `INSERT INTO public.lead_notes(id,tenant_id,workspace_id,lead_id,author_user_id,body) VALUES ('f01-own-note','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','own') RETURNING id`,
        `INSERT INTO public.outreach_events(id,tenant_id,workspace_id,lead_id,actor_user_id,channel,note) VALUES ('f01-own-outreach','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','email','own') RETURNING id`,
        `INSERT INTO public.admin_requests(id,tenant_id,workspace_id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status,summary) VALUES ('f01-own-request','${tenantA}','${workspaceA}','f01-lead-a','${actorA}','${actorA}','website_request','done','own') RETURNING id`,
        `INSERT INTO public.demos(id,tenant_id,workspace_id,lead_id,slug,template_id) VALUES ('f01-own-demo','${tenantA}','${workspaceA}','f01-lead-a','f01-own-demo','own') RETURNING id`,
    ];
    const crossTenantInserts = [
        `INSERT INTO public.leads(id,tenant_id,place_id,name) VALUES ('f01-cross-lead','${tenantB}','f01-cross-place','cross') RETURNING id`,
        `INSERT INTO public.lead_notes(id,tenant_id,workspace_id,lead_id,author_user_id,body) VALUES ('f01-cross-note','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','cross') RETURNING id`,
        `INSERT INTO public.outreach_events(id,tenant_id,workspace_id,lead_id,actor_user_id,channel,note) VALUES ('f01-cross-outreach','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','email','cross') RETURNING id`,
        `INSERT INTO public.admin_requests(id,tenant_id,workspace_id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status,summary) VALUES ('f01-cross-request','${tenantB}','${workspaceB}','f01-lead-b','${actorB}','${actorB}','website_request','new','cross') RETURNING id`,
        `INSERT INTO public.demos(id,tenant_id,workspace_id,lead_id,slug,template_id) VALUES ('f01-cross-demo','${tenantB}','${workspaceB}','f01-lead-b','f01-cross-demo','cross') RETURNING id`,
    ];
    await inMemberContext(runtime, async (tx) => {
      for (const statement of ownInserts) expect(await tx.unsafe(statement)).toHaveLength(1);
    });
    for (const statement of crossTenantInserts) {
      await expect(inMemberContext(runtime, async (tx) => tx.unsafe(statement))).rejects.toThrow(/row-level security|policy|G003_LEAD_PARENT_REQUIRED|G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/i);
    }

    const sameTenantOtherWorkspaceInserts = [
      `INSERT INTO public.lead_notes(id,tenant_id,workspace_id,lead_id,author_user_id,body) VALUES ('f01-cross-workspace-note','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','cross workspace') RETURNING id`,
      `INSERT INTO public.outreach_events(id,tenant_id,workspace_id,lead_id,actor_user_id,channel,note) VALUES ('f01-cross-workspace-outreach','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','email','cross workspace') RETURNING id`,
      `INSERT INTO public.admin_requests(id,tenant_id,workspace_id,lead_id,created_by_user_id,assigned_admin_user_id,request_type,status,summary) VALUES ('f01-cross-workspace-request','${tenantA}','${workspaceAOther}','f01-lead-a','${actorAOther}','${actorAOther}','website_request','new','cross workspace') RETURNING id`,
      `INSERT INTO public.demos(id,tenant_id,workspace_id,lead_id,slug,template_id) VALUES ('f01-cross-workspace-demo','${tenantA}','${workspaceAOther}','f01-lead-a','f01-cross-workspace-demo','cross workspace') RETURNING id`,
    ];
    for (const statement of sameTenantOtherWorkspaceInserts) {
      await expect(inMemberContext(runtime, async (tx) => tx.unsafe(statement))).rejects.toThrow(/row-level security|policy|G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED/i);
    }

    const markers = { leads: "name", lead_notes: "body", outreach_events: "note", admin_requests: "summary", demos: "template_id" } as const;
    const tenantBIds = { leads: "f01-lead-b", lead_notes: "f01-note-b", outreach_events: "f01-outreach-b", admin_requests: "f01-request-b", demos: "f01-demo-b" } as const;
    await inMemberContext(runtime, async (tx) => {
      for (const table of TARGET_TABLES) {
        expect(await tx.unsafe(`UPDATE public.${table} SET ${markers[table]}='cross-tenant-overwrite' WHERE id='${tenantBIds[table]}' RETURNING id`), `${table} cross-tenant update`).toEqual([]);
        expect(await tx.unsafe(`DELETE FROM public.${table} WHERE id='${tenantBIds[table]}' RETURNING id`), `${table} cross-tenant delete`).toEqual([]);
      }
    });

    const workspaceScopedTables = ["lead_notes", "outreach_events", "admin_requests", "demos"] as const;
    const otherWorkspaceIds = {
      lead_notes: "f01-note-a-other",
      outreach_events: "f01-outreach-a-other",
      admin_requests: "f01-request-a-other",
      demos: "f01-demo-a-other",
    } as const;
    await inMemberContext(runtime, async (tx) => {
      for (const table of workspaceScopedTables) {
        expect(await tx.unsafe(`UPDATE public.${table} SET ${markers[table]}='cross-workspace-overwrite' WHERE id='${otherWorkspaceIds[table]}' RETURNING id`), `${table} same-tenant other-workspace update`).toEqual([]);
        expect(await tx.unsafe(`DELETE FROM public.${table} WHERE id='${otherWorkspaceIds[table]}' RETURNING id`), `${table} same-tenant other-workspace delete`).toEqual([]);
      }
    });
    await expect(inMemberContext(runtime, async (tx) => tx.unsafe(`UPDATE public.leads SET tenant_id='${tenantB}' WHERE id='f01-lead-a' RETURNING id`))).rejects.toThrow(/row-level security|policy|immutable/i);

    const ownIds = { leads: "f01-own-lead", lead_notes: "f01-own-note", outreach_events: "f01-own-outreach", admin_requests: "f01-own-request", demos: "f01-own-demo" } as const;
    await inMemberContext(runtime, async (tx) => {
      for (const table of TARGET_TABLES) {
        expect(await tx.unsafe(`UPDATE public.${table} SET ${markers[table]}='own-updated' WHERE id='${ownIds[table]}' RETURNING id`), `${table} own update`).toHaveLength(1);
      }
      for (const table of [...TARGET_TABLES].reverse()) {
        expect(await tx.unsafe(`DELETE FROM public.${table} WHERE id='${ownIds[table]}' RETURNING id`), `${table} own delete`).toHaveLength(1);
      }
    });

    const tenantBState = await admin.unsafe<Array<{ table_name: string; marker: string }>>(`
      SELECT 'leads' table_name,name marker FROM public.leads WHERE id='f01-lead-b'
      UNION ALL SELECT 'lead_notes',body FROM public.lead_notes WHERE id='f01-note-b'
      UNION ALL SELECT 'outreach_events',note FROM public.outreach_events WHERE id='f01-outreach-b'
      UNION ALL SELECT 'admin_requests',summary FROM public.admin_requests WHERE id='f01-request-b'
      UNION ALL SELECT 'demos',template_id FROM public.demos WHERE id='f01-demo-b'
      ORDER BY table_name
    `);
    expect(tenantBState).toEqual([
      { table_name: "admin_requests", marker: "Tenant B request" },
      { table_name: "demos", marker: "tenant-b-template" },
      { table_name: "lead_notes", marker: "Tenant B note" },
      { table_name: "leads", marker: "Tenant B lead" },
      { table_name: "outreach_events", marker: "Tenant B outreach" },
    ]);

    const otherWorkspaceState = await admin.unsafe<Array<{ table_name: string; marker: string }>>(`
      SELECT 'lead_notes' table_name,body marker FROM public.lead_notes WHERE id='f01-note-a-other'
      UNION ALL SELECT 'outreach_events',note FROM public.outreach_events WHERE id='f01-outreach-a-other'
      UNION ALL SELECT 'admin_requests',summary FROM public.admin_requests WHERE id='f01-request-a-other'
      UNION ALL SELECT 'demos',template_id FROM public.demos WHERE id='f01-demo-a-other'
      ORDER BY table_name
    `);
    expect(otherWorkspaceState).toEqual([
      { table_name: "admin_requests", marker: "Tenant A other workspace request" },
      { table_name: "demos", marker: "tenant-a-other-template" },
      { table_name: "lead_notes", marker: "Tenant A other workspace note" },
      { table_name: "outreach_events", marker: "Tenant A other workspace outreach" },
    ]);
  }, 180_000);
});
