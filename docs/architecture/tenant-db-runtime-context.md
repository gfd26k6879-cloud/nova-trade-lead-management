# Tenant database runtime context (T-030)

## Contract

`withTenantDbContext` in `src/lib/db/index.ts` is the canonical transaction boundary for tenant-owned database work. It preserves the existing `withDbTransaction` API and accepts only a callback receiving the transaction-scoped `DbClient`.

Before the callback starts, the wrapper resolves exactly one already-accepted callback context:

- T-014 member context from `runWithTenantContext` provides tenant, workspace, actor identity, membership, role, role binding, and correlation IDs.
- T-017 worker context from `runWithWorkerTenantContext` provides tenant, workspace, job, run, lease, lease generation, worker/action, principal kind, and correlation IDs. It deliberately provides no membership or role binding.
- T-021 support context is installed only by `authorizeAndRun` in `src/lib/tenancy/support-access.ts` after a durable grant recheck and immutable attempt audit. It provides the exact support actor, grant, tenant/workspace, one permission, approved data classes, correlation/attempt/audit references, and grant window. It provides no membership, role binding, or worker lease.

The wrapper rejects missing, malformed, conflicting, or nested-broadening scope with stable generic `TenantDbContextError` codes. A callback cannot run until every context value has been installed. Nested callbacks are allowed only when their complete effective scope is identical and they reuse the active transaction client.

## PostgreSQL installation

The Postgres adapter installs these allowlisted custom GUCs using parameterized `set_config(name, value, true)` calls inside the existing transaction:

`app.tenant_id`, `app.workspace_id`, `app.actor_id`, `app.membership_id`, `app.role`, `app.role_binding_id`, `app.support_grant_id`, `app.job_id`, `app.run_id`, `app.lease_id`, `app.lease_generation`, `app.worker_name`, `app.worker_action`, `app.worker_principal_kind`, and `app.correlation_id`.

Null or inapplicable fields use an empty transaction-local value. Support contexts populate only `app.tenant_id`, optional `app.workspace_id`, `app.actor_id`, `app.support_grant_id`, and `app.correlation_id`; membership, role, role-binding, and worker fields remain empty. The support ALS is service-installed only, and member/worker/support combinations or nested broadening are rejected.

The support service deliberately does not write `audit_logs` directly: the injected atomic event repository is the durability boundary until a concrete adapter can persist privacy-safe support events without manufacturing tenant membership. The service therefore does not claim that T-015 `audit_logs` alone proves support-row durability.

`set_config(..., true)` means `is_local = true`: the values exist only for the current transaction and are removed on both commit and rollback. The callback receives only the transaction client, so a pooled connection cannot be used by the callback before context installation or after the transaction ends.

## SQLite compatibility

SQLite has no session GUC or RLS equivalent. Its adapter performs a deliberate no-op for GUC installation while the wrapper still requires the accepted ALS context, uses the transaction-scoped client, rejects nested scope broadening, and clears its callback scope on completion. SQLite concurrency and scope assertions are compatibility evidence only; PostgreSQL is authoritative for tenant isolation and RLS evidence.

## Role and cutover boundary

The T-030 rehearsal uses a dedicated LOGIN application role that is `NOSUPERUSER`, `NOBYPASSRLS`, and does not own the synthetic tenant probe table. The migration/admin role owns that table and is never used for runtime checks. This is disposable local PostgreSQL 16 evidence only; remote, staging, and production role ownership, pooler mode, RLS policy state, and connection settings remain unverified and activation-blocked.

This wrapper is the canonical boundary but does not prove that every existing query is tenant-scoped. Later query adapters and the T-027 RLS migration must make tenant-owned queries use this wrapper and prove policy behavior under the restricted runtime role.
