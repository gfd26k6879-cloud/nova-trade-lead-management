# Q-006A foundation repository/service isolation

Status: **Q-006A child-slice runtime gate passed on the second clean disposable PostgreSQL 16 run; the first run is superseded test-contract evidence; parent Q-006 is not accepted**

Date: 2026-08-23

## Scope

This child slice covers only the eight tables protected by T-027: `tenants`, `workspaces`, `tenant_memberships`, `tenant_role_bindings`, `tenant_policies`, `support_access_grants`, `support_access_grant_permissions`, and `support_access_grant_data_classes`. It changes no schema, migration, policy, route, or product API.

The opt-in PostgreSQL test requires an explicitly acknowledged disposable cluster, creates a uniquely named database on a loopback PostgreSQL 16 server, applies all 54 tracked migrations except exactly these two documented Supabase-runtime-only migrations, and then drops the database:

- `20260514161714_supabase_ai_verification_cron.sql`
- `20260514163203_scheduler_v2_sales_ready_pipeline.sql`

It creates a unique `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` runtime role, verifies that it is not the table owner, and explicitly grants schema usage, CRUD table privileges, and execution on the four T-027 helpers. The migrations require the cluster-wide `anon` and `authenticated` bootstrap roles: the harness records which of those roles it created, refuses preexisting roles with unsafe attributes, memberships, or ownership, and drops only roles created by this run. Cleanup force-drops the test database before attempting any role drop and retains roles if database cleanup fails. This separates SQL privileges from RLS authorization and makes the disposable-cluster boundary explicit.

## Coverage

The suite uses the canonical Q-002 two-tenant fixtures and accepted synthetic member-session shapes. It proves matching-tenant reads, wrong-tenant and forged/look-alike IDs, the same workspace slug in both tenants, missing-context fail-closed behavior, exact before/after counts, and cleanup.

Existing `TenantQueryRepository` operations covered are tenant create/get/update; workspace create/get/list/update; membership create/get/list/update; role-binding create/get-current/revoke-current; policy create/get-current; and transactional composition. Runtime writes are denied without changing counts. The feature read service resolves only the context tenant's policy, and lifecycle matching, foreign, and forged transitions produce the same non-enumerating denial.

The full canonical support history is created only inside `withCanonicalTenantFixtures` and is rolled back. Within that transaction, the restricted role proves scoped visibility and denied mutations for the grant, permission, and data-class tables. No delete, bulk, or cursor repository/service API exists for this foundation slice, so none was invented. The membership-administration and support-access services expose ports but no production PostgreSQL adapters; the limit service owns no foundation-table CRUD; provisioning is an operator bootstrap transaction rather than a member-runtime path. Those are truthful exclusions, not accepted Q-006 coverage.

## Commands and results

Earlier pre-runtime producer evidence recorded the following results:

- `npm rebuild better-sqlite3` — pass; the local native module was rebuilt for the active Node runtime.
- `npm run typecheck` — pass.
- `npx eslint src/test/tenants.ts src/lib/__tests__/tenant-foundation-repository-service-isolation-postgres.test.ts` — pass.
- Focused SQLite DB-context/fixture run (`tenant-db-context.test.ts` and `tenant-fixtures.test.ts`) — 17 passed.
- Reviewer-focused run (`tenant-foundation-repository-service-isolation-postgres.test.ts`, `tenant-fixtures.test.ts`, `tenant-queries.test.ts`, and `tenant-lifecycle.test.ts`) — 42 passed and 1 opt-in PostgreSQL test skipped.
- Activation probes — flag without URL, URL without exact flag, and exact flag/URL without the disposable-cluster acknowledgement each fail during test collection; probe output did not disclose the URL credential.
- `git diff --check` — pass.

The first fresh disposable runtime execution failed before the follow-on gate set:

- Exact opt-in PostgreSQL test — exit 1; 1 test file failed and its only test failed. The failure was `AssertionError: promise resolved "{ changes: +0 }" instead of rejecting` at the then-current `expectDeniedStatement` line 552, reached by the `DELETE FROM support_access_grant_permissions WHERE grant_id = ?` denial assertion beginning at line 510. PostgreSQL returned the permitted fail-closed zero-row-write outcome, while the first-run helper accepted only a rejected promise; this was a test expectation mismatch, not evidence that a protected row changed. Vitest reported 3.40 seconds of test time and 3.84 seconds total duration.
- The fresh `npm run typecheck`, focused ESLint, focused 42-test lane, and `git diff --check` were not run. The runtime prerequisite did not pass, and the execution contract required stopping after cleanup when a defect appeared.
- After this run and its verified cleanup, the coordinator changed only the test helper from `expectDeniedStatement` to `expectDeniedOrZeroStatement` so it accepts either a database denial or exactly `{ changes: 0 }`. That first failure is retained as superseded test-contract evidence: it did not show a protected-row mutation or a source defect.

The second clean disposable execution and its follow-on gates passed:

- Exact opt-in PostgreSQL test — exit 0; 1 test file and its 1 test passed. Vitest reported 3.41 seconds of test time and 3.83 seconds total duration.
- `npm run typecheck` — exit 0; `tsc --noEmit --pretty false` produced no diagnostics.
- `npx eslint src/test/tenants.ts src/lib/__tests__/tenant-foundation-repository-service-isolation-postgres.test.ts` — exit 0 with no output.
- Focused DB-context/fixture/query/feature/lifecycle lane with all three Q-006A activation variables explicitly unset — exit 0; 5 files passed and the Q-006A opt-in file skipped, with 63 tests passed and 1 skipped across 6 files. Vitest reported 529 ms of test time and 522 ms total duration.
- `git diff --check` — exit 0 with no output.

## First disposable PostgreSQL 16 runtime execution (superseded contract evidence)

- Preflight proved the unique container name `q006a-ctx6a2de995fa19` absent and found no listener on `127.0.0.1:38606`. The complete container listing was empty, so no existing container published the assigned port.
- The cached `docker.io/library/postgres:16.14-alpine` image had immutable image ID `de3a4eab8fdfa507ea92aac488b916b08089e515db49b055fe71dfa271ba3a28`; its repository digests included the required `docker.io/library/postgres@sha256:7a396fd264a2067788b6551122b50f162bf6136312c7fc9d74381cb92c648382`.
- The Docker-compatible runtime created only container `q006a-ctx6a2de995fa19`, immutable container ID `2aa37e7b022e8be857d873b8ca83ec5342cfb890c628ccf05bcc465f149f3e3d`, from that exact image ID. Its anonymous data volume was `7930da6df49e93da62e3d47f4e80e5716d723f30068337fa986c11103069b168`, its only published endpoint was `127.0.0.1:38606`, and it used `POSTGRES_HOST_AUTH_METHOD=trust`.
- The server readiness check passed. `SHOW server_version_num` returned `160014` and `SHOW server_version` returned `16.14`.
- The exact test command set `Q006A_DISPOSABLE_CLUSTER_ACK=I_ACKNOWLEDGE_Q006A_DISPOSABLE_POSTGRES16`, `Q006A_POSTGRES16=1`, and `Q006A_POSTGRES_ADMIN_URL=postgresql://postgres@127.0.0.1:38606/postgres`, connecting only to the disposable loopback server.
- The finally path removed immutable container ID `2aa37e7b022e8be857d873b8ca83ec5342cfb890c628ccf05bcc465f149f3e3d` with its volumes; removal exited 0. Post-cleanup checks found the exact container absent, the exact anonymous volume absent (`volume inspect` exit 125), no listener on port 38606, and no remaining Q-006A/38606 process (`pgrep` exit 1 after excluding the checking shell). Cleanup is complete and certain.

## Second clean disposable PostgreSQL 16 runtime execution

- Preflight proved the new unique container name `q006a-ctxe23a7dffea03` absent. The complete container listing was empty, and `ss -ltnp 'sport = :38606'` returned only its header, proving no listener on `127.0.0.1:38606` before startup.
- The cached `docker.io/library/postgres:16.14-alpine` image again had immutable image ID `de3a4eab8fdfa507ea92aac488b916b08089e515db49b055fe71dfa271ba3a28`. Its repository digests included the required `docker.io/library/postgres@sha256:7a396fd264a2067788b6551122b50f162bf6136312c7fc9d74381cb92c648382`; no pull was allowed.
- The Docker-compatible runtime created only container `q006a-ctxe23a7dffea03`, immutable container ID `d26e925df87b473fd42bb80d1172f4762331aac3d5302fdc416bcf164e5e667f`, from that exact image ID. Its anonymous data volume was `272df285375d0f12a06c87171fd21e06bdc5118510aaa842635bf49082e78c3b`, its only published endpoint was `127.0.0.1:38606`, and its environment contained `POSTGRES_HOST_AUTH_METHOD=trust`.
- `pg_isready -U postgres -d postgres` returned `/var/run/postgresql:5432 - accepting connections`. `SHOW server_version_num` returned `160014`, and `SHOW server_version` returned `16.14`.
- The exact runtime command used `Q006A_DISPOSABLE_CLUSTER_ACK=I_ACKNOWLEDGE_Q006A_DISPOSABLE_POSTGRES16`, `Q006A_POSTGRES16=1`, and `Q006A_POSTGRES_ADMIN_URL=postgresql://postgres@127.0.0.1:38606/postgres`. It passed without a source defect, so the follow-on gates ran.

The exact Vitest runtime result was:

```text
RUN  v4.0.18 /home/Masih/Projects/nova-trade-lead-management

✓ src/lib/__tests__/tenant-foundation-repository-service-isolation-postgres.test.ts (1 test) 3407ms
    ✓ fails closed through the existing foundation contracts and leaves no canonical rows  3201ms

Test Files  1 passed (1)
     Tests  1 passed (1)
  Start at  17:06:52
  Duration  3.83s (transform 228ms, setup 0ms, import 321ms, tests 3.41s, environment 0ms)
```

The focused lane explicitly removed `Q006A_DISPOSABLE_CLUSTER_ACK`, `Q006A_POSTGRES16`, and `Q006A_POSTGRES_ADMIN_URL` and ran these six files: `tenant-db-context.test.ts`, `tenant-fixtures.test.ts`, `tenant-queries.test.ts`, `tenant-features.test.ts`, `tenant-lifecycle.test.ts`, and `tenant-foundation-repository-service-isolation-postgres.test.ts`. Its exact Vitest result was:

```text
RUN  v4.0.18 /home/Masih/Projects/nova-trade-lead-management

✓ src/lib/__tests__/tenant-features.test.ts (14 tests) 35ms
↓ src/lib/__tests__/tenant-foundation-repository-service-isolation-postgres.test.ts (1 test | 1 skipped)
✓ src/lib/__tests__/tenant-db-context.test.ts (7 tests) 33ms
✓ src/lib/__tests__/tenant-lifecycle.test.ts (23 tests) 174ms
✓ src/lib/__tests__/tenant-fixtures.test.ts (10 tests) 181ms
✓ src/lib/__tests__/tenant-queries.test.ts (9 tests) 107ms

Test Files  5 passed | 1 skipped (6)
     Tests  63 passed | 1 skipped (64)
  Start at  17:07:12
  Duration  522ms (transform 1.01s, setup 0ms, import 1.49s, tests 529ms, environment 1ms)
```

## Second-run cleanup

- `docker rm --force --volumes d26e925df87b473fd42bb80d1172f4762331aac3d5302fdc416bcf164e5e667f` returned the exact immutable container ID and exited 0.
- Exact container inspection then returned `no such container` with exit 125. Exact anonymous-volume inspection returned `no such volume` with exit 125.
- `ss -H -ltnp 'sport = :38606'` returned zero rows.
- The first combined process check matched the checking shell because that shell's command line contained the literal port; it was discarded as non-evidence. A separate isolated self-safe `pgrep` check for the activation variables, Q-006A test path, and port returned no rows and exit 1.
- Cleanup is complete: the exact container, its exact anonymous volume, the assigned port listener, and Q-006A processes are all absent.

## Running the disposable PostgreSQL test

Use only a disposable cluster. Set all three values together, including the exact acknowledgement, then run:

```sh
export Q006A_DISPOSABLE_CLUSTER_ACK=I_ACKNOWLEDGE_Q006A_DISPOSABLE_POSTGRES16
export Q006A_POSTGRES16=1
export Q006A_POSTGRES_ADMIN_URL='<loopback PostgreSQL 16 administrative URL>'
npx vitest run src/lib/__tests__/tenant-foundation-repository-service-isolation-postgres.test.ts
```

When both activation variables are absent, the test truthfully skips. A partial or inexact activation, or a missing/inexact disposable-cluster acknowledgement, fails loudly without printing the administrative URL. The test refuses non-loopback hosts and non-16.x servers. It restores `DATABASE_URL`/`DATABASE_SSL`, closes the application pool, force-drops its unique database, and only then drops the unique runtime role and any bootstrap roles created by this run.

## Acceptance boundary

Real PostgreSQL execution was completed twice against the pinned disposable PostgreSQL 16.14 image. The first run's permitted zero-row result exposed only an overly narrow test expectation; after that helper was corrected, the second clean run passed the exact opt-in runtime test and every required follow-on gate, then removed and verified all disposable resources. This receipt completes the Q-006A child-slice runtime gate only; it does not accept parent Q-006, a commit, P41/UI, `.commandcode`, or production.
