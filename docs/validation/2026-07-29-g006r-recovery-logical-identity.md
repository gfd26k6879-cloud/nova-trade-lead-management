# G-006R recovery logical identity

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Baseline: `9dfd4f5f9119edc86692e9689e1d51f3e655377a`

## Result

The recovery archive contract is version 4. It now separates logical
`rowIdentity` from the source database's `physicalPrimaryKey` and reports
usable `uniqueKeys` separately, including index name, ordered columns, and
null-distinct behavior. Import conflict targets, preserved-reference matching,
and deterministic post-import ordering use the logical identity.

Only five identities changed:

```text
user_market_access: tenant_id, workspace_id, user_id, market_id
place_cache: tenant_id, source_card_id, place_id
places_master: tenant_id, source_card_id, place_id
place_observations: tenant_id, source_card_id, id
api_usage_events: tenant_id, source_card_id, id
```

Every other logical identity remains the schema-3 identity. Canonical identity
encoding is type-tagged and rejects missing, empty, or duplicate components.
Only `user_market_access.workspace_id` may be null; its null token cannot
collide with the string `"null"`. A schema-4 archive fails closed when a
tenant/source component is missing or when the ordered identity is not backed
by an exact physical primary/unique key. PostgreSQL targets must expose the
same exact ordered primary/unique key; the nullable user-market identity must
use `NULLS NOT DISTINCT`.

Schema 3 remains frozen and explicitly selectable for a pre-G-006 SQLite
snapshot. Its original manifest shape and physical-primary identities are
validated as schema 3 and are never reinterpreted as schema 4. It requires a
matching legacy target and is not silently upgraded into a schema-4 restore.

## Synthetic source and PostgreSQL 16 evidence

The focused harness creates and exports a synthetic schema-4 SQLite database,
validates the archive, and restores it to disposable PostgreSQL 16. The SQLite
fixture adds the required tenant/source columns and logical unique indexes only
as a recovery-contract adapter; this card does not change the application
SQLite schema. The restored fixture proves a null-workspace
`user_market_access` grant and a source-scoped place parent/observation survive
the round trip.

The opt-in rehearsal discovered 45 migrations, applied 43, and skipped only
the two named `pg_net`/`pg_cron` scheduler migrations already excluded by the
portable T-029 baseline. The final fresh run passed 14/14 tests in 23.77 s.
It covered archive validation, exact target-key discovery, import conflicts,
post-import matching, rollback, triggers, sequences, hostile `search_path`,
and restored-row assertions.

During fixture strengthening, PostgreSQL correctly rejected an observation
whose synthetic source place lacked its parent and rejected a null-workspace
grant whose synthetic actor lacked tenant-wide membership. Both errors were
fixed only in the fixture by adding the authoritative parent/membership. No
product migration or recovery guard was weakened. The final rehearsal used a
fresh database and passed.

## Commands and outcomes

- `npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 13 passed; one explicitly opt-in PostgreSQL test skipped by default.
  - This includes real synthetic SQLite schema-3 and schema-4 exports, archive
    validation, identity-spoof and duplicate rejection, and target-key checks.
- `T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[unique loopback database] npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 14/14, 23.77 s; 45 discovered / 43 applied / 2 named skips.
- `npm run db:verify:recovery`
  - PASS: 37 application tables match SQLite schema and tracked migrations.
- `npm run typecheck`
  - PASS.
- `npm run lint`
  - PASS.
- `node --check` for all four changed recovery scripts
  - PASS.
- `git diff --check`
  - PASS.

All runs were local and used synthetic fixtures. No remote database, customer
data, credentials, provider call, push, deployment, or production mutation was
used. The disposable PostgreSQL container and its task-owned resources were
removed after the final rehearsal.
