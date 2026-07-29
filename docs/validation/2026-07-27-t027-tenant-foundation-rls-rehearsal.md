# T-027 tenant foundation RLS rehearsal

Status: local implementation evidence for parent review. This is not a production, linked Supabase, staging, deployment, or activation claim.

## Scope

Migration `202607270009_add_tenant_foundation_rls.sql` enables and forces RLS only on these eight accepted foundation tables:

1. `tenants`
2. `workspaces`
3. `tenant_memberships`
4. `tenant_role_bindings`
5. `tenant_policies`
6. `support_access_grants`
7. `support_access_grant_permissions`
8. `support_access_grant_data_classes`

No legacy table and no T-023/T-024 audit, export, or deletion table is targeted by migration 009. The migration does not create a role or grant runtime privileges. Its helpers use only T-030 transaction-local `app.*` GUCs and return boolean results; JWT, request body, header, and caller-selected tenant claims are not consulted.

## Commands and replay

The disposable target was a local Docker `postgres:16` container named `nova-trade-t027-pg16`, created with an ephemeral loopback port and synthetic credentials held only by the command process.

The focused PostgreSQL test is skipped unless the one-purpose opt-in `T027_RUN_DISPOSABLE_RLS_TESTS=1` is present in addition to both database URLs. The safe command shape is:

```powershell
$env:T027_RUN_DISPOSABLE_RLS_TESTS = '1'
$env:DATABASE_URL = '<disposable runtime connection to t027_rls_rehearsal>'
$env:T027_ADMIN_DATABASE_URL = '<disposable admin connection to t027_rls_rehearsal>'
$env:T027_RUNTIME_ROLE = 't027_runtime_app'
npx vitest run src/lib/__tests__/tenant-foundation-rls-postgres.test.ts
```

Before fixtures, the test resolves both connections from the server itself and requires the same database, server address/port, postmaster identity, exact database name `t027_rls_rehearsal`, and PostgreSQL major version 16. It also requires the runtime `current_user` to equal the named runtime role and to be `NOSUPERUSER`, `NOBYPASSRLS`, and distinct from the single owner observed through the admin connection. URL text alone is not trusted.

Portable preamble:

- created synthetic `auth.users`, `anon`, and `authenticated` objects because stock PostgreSQL has no Supabase Auth catalog;
- created the `worker_runs` table shape required by the downstream stale-cleanup index because its scheduler migration is one of the intentionally skipped Supabase runtime migrations;
- replayed the repository SQL migrations in lexicographic filename order with `psql -v ON_ERROR_STOP=1`;
- applied 38 of 40 repository migration files, including all `202607270001` through `202607270009` files unchanged.

Exact skips:

- `20260514161714_supabase_ai_verification_cron.sql` - requires Supabase `pg_net`, `pg_cron`, and Vault runtime objects;
- `20260514163203_scheduler_v2_sales_ready_pipeline.sql` - requires Supabase Cron, Vault, and `net.http_post` runtime objects.

The skipped scheduler's downstream `worker_runs` index migration was applied against the synthetic table shape; no T-027 migration was skipped or weakened. The container was removed after each replay/test attempt and the final receipt was `CLEANUP_CONTAINER=absent`.

The disposable-only activation step created `t027_runtime_app` as `LOGIN NOSUPERUSER NOBYPASSRLS`, granted schema usage, CRUD table privileges, and execute on the four T-027 helpers. This role was not created by migration 009 and was not created outside the disposable container.

Fixture cleanup deletes only the six fixed synthetic grant IDs and their child rows. Because the parent has deferred anchor foreign keys and the T-020 child guards are append-only, triggers are temporarily disabled and re-enabled only on the three exact support-grant tables while that targeted cleanup transaction deletes those IDs; no `TRUNCATE`, broad cascade, or non-synthetic support-access cleanup is used.

## Role and ownership receipt

Observed from the runtime connection:

| Fact | Result |
|---|---|
| `current_user` | `t027_runtime_app` |
| `rolsuper` | `false` |
| `rolbypassrls` | `false` |
| admin `current_user` observed by catalog query | `postgres` in this disposable container; not hardcoded by the test |
| owner of all eight foundation tables | the observed admin owner; all eight tables matched |
| runtime role equals table owner | `false` |
| helper owner | the same observed admin owner; all four helpers matched |
| helper owner RLS bypass property | observed `rolsuper=true`, `rolbypassrls=true`; production requires at least one of these, while runtime remains `false`/`false` |
| helper catalog hardening | all four `prosecdef=true`; all four `proconfig={search_path=pg_catalog, public}` |
| runtime helper execute privilege | explicitly granted only in disposable test setup |
| runtime table privileges | explicitly granted only in disposable test setup |

The runtime role therefore was not a superuser, BYPASSRLS role, table owner, or function owner. Because all eight tables are `FORCE ROW LEVEL SECURITY` and the boolean-only `SECURITY DEFINER` helpers query those protected tables, production activation also requires the single table/function owner to be a superuser or `BYPASSRLS` role; otherwise the helper can recurse through its own policies or fail closed. This owner is a narrow trust boundary: the helpers use fixed SQL and fixed `search_path`, accept no caller row arguments, return only booleans, and fail closed on exceptions. The migration itself leaves production runtime activation fail-closed until an explicitly named runtime role is separately provisioned, and the reviewed owner/runtime attributes and privileges are verified.

## Policy inventory and CRUD matrix

Every target table reported `relrowsecurity=true` and `relforcerowsecurity=true`. The test asserted the complete 19-policy inventory by policy name, `PERMISSIVE` mode, `public` role list, command, `qual`, and `with_check`: member/support SELECT policies where applicable, plus a `FOR ALL` false/false deny policy on every table. The membership and role/support-control tables intentionally have no support SELECT policy.

| Runtime shape | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Valid member | Tenant/workspace/policy metadata is tenant/workspace bounded; membership, role-binding, and support-control reads require owner/admin capability | deny | deny | deny |
| Valid support | `tenant:read + tenant_metadata` for tenant/policy metadata, or `workspace:read + workspace_metadata` for active workspace metadata; exact actor/grant/scope/window required | deny | deny | deny |
| Worker context | deny by default; no approved durable foundation relationship exists in T-027 | deny | deny | deny |
| Support, worker, and mixed contexts | representative INSERT/UPDATE/DELETE statements denied; the exact all-table false/false policy inventory covers the remaining foundation tables | deny | deny | deny |
| Missing/malformed/conflicting/stale context | deny | deny | deny | deny |
| `anon` / `authenticated` | no SQL privileges and no rows | no SQL privileges | no SQL privileges | no SQL privileges |

The focused matrix covered synthetic tenants A/B with overlapping names/slugs, active and archived workspaces, active/suspended/revoked memberships, current/revoked/future role bindings, tenant policies, valid/expired/revoked support grants, workspace support scope, and mismatched permission/data-class child rows. It exercised every CRUD verb on all eight tables and checked cross-tenant/workspace reassignment attempts.

Support context additionally requires an active target tenant, an active target workspace when one is present, exact `platform_support` grant actor, approved/unrevoked state, `starts_at <= statement_timestamp() < expires_at`, empty membership/role-binding/worker fields, and exact normalized permission/data-class child rows. Membership identity and support-control rows have no invented support data-class mapping and remain denied.

## Focused test results

Command:

`npx vitest run src/lib/__tests__/tenant-foundation-rls-postgres.test.ts`

Result: **1 file, 6 tests passed** under the restricted disposable PostgreSQL role.

The six tests prove:

- current-user, `NOSUPERUSER`, `NOBYPASSRLS`, non-owner, forced-RLS, policy inventory, and anon/authenticated privilege posture;
- tenant A/B isolation and denial for missing, malformed, suspended, revoked, future, cross-tenant, cross-workspace, mixed member/support/worker, and worker-only contexts;
- INSERT/UPDATE/DELETE denial and parent reassignment protection for every target table, including role bindings and support child tables;
- representative support, worker, and mixed-context INSERT/UPDATE/DELETE denial, with the complete policy inventory proving the same deny-all mutation shape on every foundation table;
- exact support actor, tenant/workspace, grant state/window, permission, data-class, and active-lifecycle checks, including denial for suspended targets and unapproved data-class mappings;
- immediate same-transaction support revocation/expiry behavior and same-transaction role-binding activation behavior using statement-fresh time, followed by pooled transaction-local A -> B -> no-context cleanup.

## Other validation

- `npm run typecheck` - exit 0; no unrelated concurrent draft diagnostics were emitted.
- `npx eslint src/lib/__tests__/tenant-foundation-rls-postgres.test.ts` - exit 0.
- `git diff --check --` - exit 0 for tracked changes; owned new files were separately checked for trailing whitespace with no findings. Git emitted only existing LF-to-CRLF working-copy warnings for unrelated tracked files.
- Full portable PostgreSQL 16 replay through migration 009 - exit 0; the repository contained 40 migration files, with exactly 2 documented skips and 38 applied files.

## Limitations and activation blockers

- This is disposable local PostgreSQL evidence only. No remote, linked Supabase, staging, or production database was accessed or changed.
- Production runtime role name, ownership, `BYPASSRLS`, pooler mode, connection settings, and separately granted table/helper privileges remain unverified and must be reviewed before activation.
- Existing application queries are not proven to run inside `withTenantDbContext`; T-030 and later query-adapter work remain required.
- Worker foundation authority remains intentionally denied until an approved durable relationship exists.
- Supabase Cron/`pg_net`/Vault runtime migrations were not replayed in stock PostgreSQL; their exact names and reason are recorded above.
- A production owner with neither `rolsuper` nor `rolbypassrls` is an activation blocker for this FORCE-RLS design; do not widen the runtime role to compensate. The four hardened boolean helpers are the reviewed narrow trust boundary and their owner capability must be separately verified.
- No credentials, customer data, local SQLite data, remote URLs, commit, push, deployment, or production role change was used.
