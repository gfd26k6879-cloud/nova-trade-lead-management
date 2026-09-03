# Testing and release checks

Use Node 24. The repository rejects other Node majors in the composed release gate.

## Safe local gate

```bash
npm ci
npx playwright install chromium
npm run release:check
```

`release:check` runs TypeScript no-emit, ESLint, the platform-appropriate Vitest suite, a production build, and the public read-only Playwright project. On Windows that is the full Vitest suite. On other platforms it excludes the three tests that transitively require the accepted Windows/NTFS finalization boundary. The browser pass starts the built app on a temporary loopback port and never enables authenticated or mutating specs.

## Playwright lanes

| Command | Scope | Required state |
|---|---|---|
| `npm run test:e2e:public` | Public login/trust pages, desktop/mobile overflow, runtime errors | Running target only |
| `npm run test:e2e:auth` | Protected read-only workflow checks | Auth storage state or E2E credentials |
| `npm run test:e2e` | Public plus protected read-only projects | Auth storage state or E2E credentials |
| `npm run test:e2e:launch` | Protected desktop/mobile screenshot pass | Auth storage state or E2E credentials |
| `npm run test:e2e:mutating` | Disposable lead workbench, archive, drag, exclusion, and restoration flows | Auth plus explicit mutation opt-in and fixture binding |

Authenticated commands require either:

```bash
E2E_STORAGE_STATE=.auth/admin.json npm run test:e2e
```

or both `E2E_SUPABASE_EMAIL` and `E2E_SUPABASE_PASSWORD`. Missing auth is a hard failure, not a skipped green run.

Mutation suites are excluded by default. A local disposable target requires:

```bash
E2E_ALLOW_MUTATIONS=1 \
E2E_DISPOSABLE_LEAD_ID=lead-e2e-1 \
E2E_DISPOSABLE_LEAD_NAME='[E2E DISPOSABLE] Kanban lead' \
npm run test:e2e:mutating
```

The ID and exact name must identify the same operator-owned fixture. Its name must start with `[E2E DISPOSABLE] `, and it must be unarchived, non-excluded, in the `New` column, and expose `qualification_status=needs_verification` directly on its detail page; a missing or mismatched fixture is a hard failure. Kanban checks use the exact marked name as a search constraint, while cleanup navigates directly to the bound ID and restores exclusion, status, and archive state in `finally`; the suite does not create leads or persist outreach events.

For any non-loopback target, `E2E_ALLOW_REMOTE_MUTATIONS=1` is also required. Use that override only after approving the target, fixture data, rollback, and cleanup. Never point the mutating suite at production by habit.

The public project is release evidence for public rendering only. It does not prove authenticated workflows, production data, migrations, workers, paid APIs, or deployment state.

## L-01 local worker route rehearsal

The five tenant worker routes are proven end to end by the env-gated lane
`src/lib/__tests__/l01-local-worker-routes-postgres.test.ts`. It replays the 63
portable migrations on a disposable PostgreSQL 16 database, seeds a tenant
foundation, provisions restricted `l01_lease_issuer`/`l01_lease_resolver` roles
from the URL credentials (creating and dropping them itself), and drives every
worker route through a real issuer-issued lease while asserting fail-closed
denials. Safe command shape:

```bash
# PostgreSQL 16 on loopback with a disposable database named exactly
# l01_worker_routes_rehearsal, plus the two login roles named in the URLs.
L01_WORKER_ROUTES_RUN_DISPOSABLE_TESTS=1 \
L01_WORKER_ROUTES_ADMIN_DATABASE_URL=postgresql://postgres:pass@127.0.0.1:5432/l01_worker_routes_rehearsal \
TENANT_WORKER_LEASE_ISSUER_DATABASE_URL=postgresql://l01_lease_issuer:pass@127.0.0.1:5432/l01_worker_routes_rehearsal \
TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL=postgresql://l01_lease_resolver:pass@127.0.0.1:5432/l01_worker_routes_rehearsal \
DATABASE_SSL=disable \
npx vitest run src/lib/__tests__/l01-local-worker-routes-postgres.test.ts
```

The lane performs the same migration replay as the F-01/Q-006A lanes and
updates the tracked migration count with them when migrations are added.

## Local runtime tooling (L-01)

`npm run local:seed` (script `scripts/seed-local-tenant.mjs`) provisions the
restricted worker lease issuer/resolver roles and seeds an admin/researcher
tenant foundation on loopback PostgreSQL — including a local Supabase stack at
`127.0.0.1:54322`. Passwords are generated and printed once when unset; the
script verifies each role's exact runtime capability and prints ready
`.env.local` values. It refuses non-loopback targets unless
`LOCAL_SEED_ALLOW_REMOTE=1`.

`npm run local:dispatch` (script `scripts/run-local-workers.mjs`) acquires a
durable lease per worker through the issuer role and calls each of the five
worker routes with the lease selector. Run it against a seeded database and a
running app (`npm run dev` or `next start`) with the same issuer/resolver URLs
in `.env.local`.

## Linux and Windows SQLite lanes

On Linux, `src/lib/__tests__/sqlite-schema-coordinator.test.ts` runs the 12
portable catalog, schema, and hostile-input cases and reports the 26 native
file-identity/finalization cases as skipped. Those 26 cases require the accepted
Windows/NTFS lease boundary; a Linux skip is not a pass and does not replace the
recorded Windows evidence.

Do not run `src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts` on Linux as
acceptance evidence. New platform database behavior must instead use the
explicit disposable-Postgres lane named by its task receipt.

The same boundary is used transitively by
`src/lib/__tests__/sqlite-compatibility-scope.test.ts` and
`src/lib/__tests__/sqlite-g002-operation-permit.test.ts`; the composed release
gate excludes all three outside Windows rather than reporting missing
PowerShell as a product failure.
