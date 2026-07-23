# Testing and release checks

Use Node 24. The repository rejects other Node majors in the composed release gate.

## Safe local gate

```bash
npm ci
npx playwright install chromium
npm run release:check
```

`release:check` runs TypeScript no-emit, ESLint, the full Vitest suite, a production build, and the public read-only Playwright project. The browser pass starts the built app on a temporary loopback port and never enables authenticated or mutating specs.

## Playwright lanes

| Command | Scope | Required state |
|---|---|---|
| `npm run test:e2e:public` | Public login/trust pages, desktop/mobile overflow, runtime errors | Running target only |
| `npm run test:e2e:auth` | Protected read-only workflow checks | Auth storage state or E2E credentials |
| `npm run test:e2e` | Public plus protected read-only projects | Auth storage state or E2E credentials |
| `npm run test:e2e:launch` | Protected desktop/mobile screenshot pass | Auth storage state or E2E credentials |
| `npm run test:e2e:mutating` | Lead creation, archive, drag, exclusion, and restoration flows | Auth plus explicit mutation opt-in |

Authenticated commands require either:

```bash
E2E_STORAGE_STATE=.auth/admin.json npm run test:e2e
```

or both `E2E_SUPABASE_EMAIL` and `E2E_SUPABASE_PASSWORD`. Missing auth is a hard failure, not a skipped green run.

Mutation suites are excluded by default. A local disposable target requires:

```bash
E2E_ALLOW_MUTATIONS=1 npm run test:e2e:mutating
```

For any non-loopback target, `E2E_ALLOW_REMOTE_MUTATIONS=1` is also required. Use that override only after approving the target, fixture data, rollback, and cleanup. Never point the mutating suite at production by habit.

The public project is release evidence for public rendering only. It does not prove authenticated workflows, production data, migrations, workers, paid APIs, or deployment state.
