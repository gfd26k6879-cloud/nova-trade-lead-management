#!/usr/bin/env node
// L-01 local runtime seed: worker lease issuer/resolver roles and a complete
// admin + researcher tenant foundation on loopback PostgreSQL (local Supabase).
// Idempotent, refuse-by-default against non-loopback targets, and never prints
// secrets that it did not generate in this run.

import { randomBytes, randomUUID } from "node:crypto";
import { env, exit } from "node:process";
import postgres from "postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;

const ISSUER_ROLE = "novatrade_worker_lease_issuer";
const RESOLVER_ROLE = "novatrade_worker_lease_resolver";

// Deterministic local identities so re-seeding converges and the dispatcher
// and browser smoke can rely on stable ids without a database read.
const IDS = Object.freeze({
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "11000000-0000-4000-8000-000000000001",
  adminIdentityId: "12000000-0000-4000-8000-000000000001",
  researcherIdentityId: "12000000-0000-4000-8000-000000000002",
  adminMembershipId: "20000000-0000-4000-8000-000000000001",
  researcherMembershipId: "20000000-0000-4000-8000-000000000002",
  adminBindingId: "30000000-0000-4000-8000-000000000001",
  researcherBindingId: "30000000-0000-4000-8000-000000000002",
  policyId: "40000000-0000-4000-8000-000000000001",
});

// Mirrors worker-lease-runtime.ts role capability gate: the seed proves the
// same exact restricted shape the runtime will require at first use.
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
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member=role.oid OR membership.roleid=role.oid
  ) AS "hasRoleMemberships",
  pg_catalog.has_schema_privilege(CURRENT_USER,'public','USAGE') AS "hasSchemaUsage",
  pg_catalog.has_schema_privilege(CURRENT_USER,'public','CREATE') AS "canCreateSchemaObjects",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') AS "canAcquire",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)','EXECUTE') AS "canCancel",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_resolve_tenant_worker_lease(text,text,text)','EXECUTE') AS "canResolve",
  pg_catalog.has_function_privilege(CURRENT_USER,'public.novatrade_validate_tenant_worker_lease()','EXECUTE') AS "canValidate",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','SELECT') AS "canSelectLeaseTable",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','INSERT') AS "canInsertLeaseTable",
  pg_catalog.has_any_column_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','UPDATE') AS "canUpdateLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','DELETE') AS "canDeleteLeaseTable",
  pg_catalog.has_table_privilege(CURRENT_USER,'public.tenant_worker_dispatch_leases','TRUNCATE') AS "canTruncateLeaseTable"
FROM pg_catalog.pg_roles AS role
JOIN pg_catalog.pg_database AS database ON database.datname=CURRENT_DATABASE()
WHERE role.rolname=CURRENT_USER`;

const SETTINGS_SCHEDULER_COLUMNS = [
  "scheduler_ai_verification_enabled",
  "scheduler_crawl_enabled",
  "scheduler_enrichment_enabled",
  "scheduler_artifact_enabled",
  "scheduler_score_recompute_enabled",
];

function fail(message) {
  console.error(`[seed-local-tenant] ${message}`);
  exit(1);
}

function requiredEnv(name) {
  const value = env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function assertLoopback(databaseUrl) {
  if (env.LOCAL_SEED_ALLOW_REMOTE === "1") return;
  const parsed = new URL(databaseUrl);
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    fail(`refusing to seed non-loopback target ${parsed.hostname}; set LOCAL_SEED_ALLOW_REMOTE=1 only for an approved disposable target`);
  }
}

function optionalSecret(name, generated) {
  const provided = env[name]?.trim();
  if (provided) return { value: provided, generated: false };
  const value = randomBytes(24).toString("base64url");
  generated.push({ name, value });
  return { value, generated: true };
}

function roleConnectionUrl(databaseUrl, role, password) {
  const parsed = new URL(databaseUrl);
  parsed.username = role;
  parsed.password = password;
  return parsed.toString();
}

function assertExactCapability(row, roleName, kind) {
  const safe = row?.canLogin === true && row.isSuperuser === false &&
    row.inheritsPrivileges === false && row.canCreateDatabase === false &&
    row.canCreateRole === false && row.canReplicate === false &&
    row.bypassesRls === false && row.ownsCurrentDatabase === false &&
    row.isCurrentDatabaseOwnerMember === false &&
    row.hasRoleMemberships === false &&
    row.canCreateDatabaseObjects === false && row.canCreateSchemaObjects === false &&
    row.canSelectLeaseTable === false && row.canInsertLeaseTable === false &&
    row.canUpdateLeaseTable === false && row.canDeleteLeaseTable === false &&
    row.canTruncateLeaseTable === false;
  const exact = kind === "issuer"
    ? row?.canAcquire === true && row?.canCancel === true && row?.canResolve === false
    : row?.canAcquire === false && row?.canCancel === false && row?.canResolve === true;
  if (!safe || !exact) {
    fail(`${roleName} does not match the exact restricted ${kind} capability required by the worker lease runtime`);
  }
}

async function assertRoleCapabilities(databaseUrl, role, password, kind) {
  const roleSql = postgres(roleConnectionUrl(databaseUrl, role, password), {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
    connect_timeout: 10,
  });
  try {
    const [row] = await roleSql.unsafe(ROLE_INSPECTION_SQL);
    assertExactCapability(row, role, kind);
  } catch (error) {
    fail(`role ${role} capability inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await roleSql.end({ timeout: 1 });
  }
}

async function ensureRestrictedRole(tx, role, password, capabilities) {
  const escapedPassword = String(password).replaceAll("'", "''");
  const [existing] = await tx.unsafe("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1", [role]);
  await tx.unsafe(existing
    ? `ALTER ROLE "${role}" WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`
    : `CREATE ROLE "${role}" LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  const grantSql = capabilities
    .map((capability) => `GRANT EXECUTE ON FUNCTION ${capability} TO "${role}";`)
    .join("\n");
  await tx.unsafe(`
    GRANT USAGE ON SCHEMA public TO "${role}";
    ${grantSql}
    REVOKE ALL ON TABLE public.tenant_worker_dispatch_leases FROM "${role}";
    REVOKE EXECUTE ON FUNCTION public.novatrade_validate_tenant_worker_lease() FROM "${role}";`);
}

async function main() {
  for (const id of Object.values(IDS)) {
    if (!UUID_PATTERN.test(id)) fail(`internal seed identity constant is not a UUID: ${id}`);
  }
  if (!ROLE_NAME_PATTERN.test(ISSUER_ROLE) || !ROLE_NAME_PATTERN.test(RESOLVER_ROLE)) {
    fail("worker lease role names are invalid");
  }
  const databaseUrl = requiredEnv("DATABASE_URL");
  assertLoopback(databaseUrl);

  const tenantSlug = (env.LOCAL_TENANT_SLUG ?? "local-demo").trim().toLowerCase();
  const tenantName = (env.LOCAL_TENANT_NAME ?? "Local Demo Tenant").trim();
  const adminEmail = (env.LOCAL_ADMIN_EMAIL ?? "admin@local.nosite.test").trim().toLowerCase();
  const researcherEmail = (env.LOCAL_RESEARCHER_EMAIL ?? "researcher@local.nosite.test").trim().toLowerCase();

  const generated = [];
  const adminPassword = optionalSecret("LOCAL_ADMIN_PASSWORD", generated);
  const researcherPassword = optionalSecret("LOCAL_RESEARCHER_PASSWORD", generated);
  const issuerPassword = optionalSecret("LOCAL_WORKER_LEASE_ISSUER_PASSWORD", generated);
  const resolverPassword = optionalSecret("LOCAL_WORKER_LEASE_RESOLVER_PASSWORD", generated);

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
    connect_timeout: 10,
  });

  try {
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
    await sql.begin(async (tx) => {
      await ensureRestrictedRole(tx, ISSUER_ROLE, issuerPassword.value, [
        "public.novatrade_acquire_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)",
        "public.novatrade_cancel_tenant_worker_lease(text,text,text,text,text,text,text,text,text,text,text,text)",
      ]);
      await ensureRestrictedRole(tx, RESOLVER_ROLE, resolverPassword.value, [
        "public.novatrade_resolve_tenant_worker_lease(text,text,text)",
      ]);
    });

    await assertRoleCapabilities(databaseUrl, ISSUER_ROLE, issuerPassword.value, "issuer");
    await assertRoleCapabilities(databaseUrl, RESOLVER_ROLE, resolverPassword.value, "resolver");

    await sql.unsafe(SETTINGS_SCHEDULER_COLUMNS
      .map((column) => `ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ${column} integer NOT NULL DEFAULT 1`)
      .join("; "));
    await sql.unsafe("ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id uuid");

    const now = new Date().toISOString();
    await sql.begin(async (tx) => {
      for (const [id, email, password] of [
        [IDS.adminIdentityId, adminEmail, adminPassword.value],
        [IDS.researcherIdentityId, researcherEmail, researcherPassword.value],
      ]) {
        await tx.unsafe(`
          INSERT INTO auth.users (
            id, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
          ) VALUES ($1, $2, public.crypt($3, public.gen_salt('bf')), $4, $5, $6, $7, $7)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            encrypted_password = EXCLUDED.encrypted_password,
            email_confirmed_at = EXCLUDED.email_confirmed_at,
            raw_app_meta_data = EXCLUDED.raw_app_meta_data,
            raw_user_meta_data = EXCLUDED.raw_user_meta_data,
            updated_at = EXCLUDED.updated_at`,
          [id, email, password, now, JSON.stringify({ provider: "email", providers: ["email"] }), "{}", now]);
      }

      await tx.unsafe(`
        INSERT INTO public.tenants (id, slug, name, status, locale, timezone)
        VALUES ($1, $2, $3, 'active', 'en-US', 'UTC')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()`,
      [IDS.tenantId, tenantSlug, tenantName]);
      await tx.unsafe(`
        INSERT INTO public.workspaces (id, tenant_id, slug, name, status)
        VALUES ($1, $2, 'main', 'Main Workspace', 'active')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()`,
      [IDS.workspaceId, IDS.tenantId]);

      for (const [membershipId, identityId, workspaceId] of [
        [IDS.adminMembershipId, IDS.adminIdentityId, null],
        [IDS.researcherMembershipId, IDS.researcherIdentityId, IDS.workspaceId],
      ]) {
        await tx.unsafe(`
          INSERT INTO public.tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status)
          VALUES ($1, $2, $3, $4, 'active')
          ON CONFLICT (id) DO UPDATE SET
            auth_identity_id = EXCLUDED.auth_identity_id,
            workspace_id = EXCLUDED.workspace_id,
            status = EXCLUDED.status,
            updated_at = now()`, [membershipId, IDS.tenantId, identityId, workspaceId]);
      }

      for (const [bindingId, membershipId, role] of [
        [IDS.adminBindingId, IDS.adminMembershipId, "owner"],
        [IDS.researcherBindingId, IDS.researcherMembershipId, "researcher"],
      ]) {
        await tx.unsafe(`
          INSERT INTO public.tenant_role_bindings (id, tenant_id, membership_id, role, valid_from, reason_code)
          VALUES ($1, $2, $3, $4, now() - interval '1 hour', 'initial_provisioning')
          ON CONFLICT (id) DO NOTHING`,
        [bindingId, IDS.tenantId, membershipId, role]);
      }

      await tx.unsafe(`
        INSERT INTO public.tenant_policies (
          id, tenant_id, ai_processing_enabled, source_research_enabled,
          contact_research_enabled, outreach_drafting_enabled, copy_export_enabled
        ) VALUES ($1, $2, true, true, true, true, true)
        ON CONFLICT (tenant_id) DO UPDATE SET
          version = public.tenant_policies.version + 1,
          ai_processing_enabled = EXCLUDED.ai_processing_enabled,
          source_research_enabled = EXCLUDED.source_research_enabled,
          contact_research_enabled = EXCLUDED.contact_research_enabled,
          outreach_drafting_enabled = EXCLUDED.outreach_drafting_enabled,
          copy_export_enabled = EXCLUDED.copy_export_enabled,
          updated_at = now()`, [IDS.policyId, IDS.tenantId]);

      await tx.unsafe("INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
      await tx.unsafe("UPDATE public.settings SET tenant_id = $1 WHERE id = 1", [IDS.tenantId]);

      for (const [userId, email, displayName, role] of [
        [IDS.adminIdentityId, adminEmail, "Local Admin", "admin"],
        [IDS.researcherIdentityId, researcherEmail, "Local Researcher", "researcher"],
      ]) {
        await tx.unsafe(`
          INSERT INTO public.app_users (id, user_id, email, display_name, role, status, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'active', NULL, $6, $6)
          ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at`,
        [randomUUID(), userId, email, displayName, role, now]);
      }
    });

    console.log("[seed-local-tenant] seeded tenant foundation and worker lease roles");
    console.log(`  tenant id: ${IDS.tenantId} (slug ${tenantSlug}); workspace: ${IDS.workspaceId}`);
    console.log(`  admin identity: ${adminEmail} -> ${IDS.adminIdentityId}`);
    console.log(`  researcher identity: ${researcherEmail} -> ${IDS.researcherIdentityId}`);
    if (generated.length > 0) {
      console.log("[seed-local-tenant] generated disposable credentials (save these now; they are not stored anywhere):");
      for (const { name, value } of generated) console.log(`  ${name}=${value}`);
    }
    console.log("[seed-local-tenant] worker lease URLs to add to .env.local:");
    console.log(`  TENANT_WORKER_LEASE_ISSUER_DATABASE_URL=${roleConnectionUrl(databaseUrl, ISSUER_ROLE, issuerPassword.value)}`);
    console.log(`  TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL=${roleConnectionUrl(databaseUrl, RESOLVER_ROLE, resolverPassword.value)}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    await sql.end({ timeout: 1 });
  }
}

void main();
