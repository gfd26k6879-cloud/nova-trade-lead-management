# G-006R recovery logical identity

Date: 2026-07-29

Branch: `codex/nova-platform-tenancy`

Baseline: `9dfd4f5f9119edc86692e9689e1d51f3e655377a`

Repair-round rejected source: `9087af7d73b7174a3683b771b877bf40eb0fd1ab`

## Result

The recovery archive contract is version 4. It now separates logical
`rowIdentity` from the source database's `physicalPrimaryKey` and reports
usable `uniqueKeys` separately, including index name, ordered columns, and
normalized predicate/null-distinct behavior. Import conflict targets,
preserved-reference matching, and deterministic post-import ordering use the
logical identity.

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
by exact SQLite uniqueness. A table with no physical primary key reports `[]`
and is not assigned a synthetic empty physical key; logical identity remains
complete and duplicate-free.

SQLite `user_market_access` uses two exact partial unique indexes: the null
workspace member is ordered `(tenant_id, user_id, market_id) WHERE
workspace_id IS NULL`, and the non-null member is ordered `(tenant_id,
workspace_id, user_id, market_id) WHERE workspace_id IS NOT NULL`. An ordinary
four-column unique index cannot enforce null equality and is rejected, as are a
missing member, expression, column reordering, and predicate drift.

PostgreSQL targets must expose the same exact ordered identity through a valid,
ready, immediate primary/unique arbiter. The nullable user-market identity must
use `NULLS NOT DISTINCT`. Deferrable unique constraints have
`pg_index.indimmediate=false` and fail target preflight before `ON CONFLICT`.

Schema 3 remains frozen and explicitly selectable for a pre-G-006 SQLite
snapshot. Its original manifest shape and physical-primary identities are
validated as schema 3 and are never reinterpreted as schema 4. It requires a
matching legacy target and is not silently upgraded into a schema-4 restore.

## Synthetic source and PostgreSQL 16 evidence

The focused harness creates and exports a synthetic schema-4 SQLite database,
validates the archive, and restores it to disposable PostgreSQL 16. The SQLite
fixture adds the required tenant/source columns and logical unique indexes only
as a recovery-contract adapter; this card does not change the application
SQLite schema. Its `user_market_access` table has no physical primary key and
uses the two-member partial family. The focused tests prove two distinct grants,
including null workspace, export and validate; duplicate null identity and all
required index-family drift cases fail. The restored fixture proves a
null-workspace grant and source-scoped place parent/observation survive the
round trip.

The opt-in rehearsal discovered 45 migrations, applied 43, and skipped only
the two named `pg_net`/`pg_cron` scheduler migrations already excluded by the
portable T-029 baseline. The repair-round fresh run passed 19/19 tests in
30.58 s. It replaced the accepted PostgreSQL user-market arbiter with a real
`DEFERRABLE INITIALLY IMMEDIATE` `NULLS NOT DISTINCT` constraint, proved
`condeferrable=true` and `indimmediate=false`, proved import preflight rejected
it, restored the immediate constraint, and completed the full restore. It also
covered archive validation, import conflicts, post-import matching, rollback,
triggers, sequences, hostile `search_path`, and restored-row assertions.

During fixture strengthening, PostgreSQL correctly rejected an observation
whose synthetic source place lacked its parent and rejected a null-workspace
grant whose synthetic actor lacked tenant-wide membership. Both errors were
fixed only in the fixture by adding the authoritative parent/membership. No
product migration or recovery guard was weakened. The final rehearsal used a
fresh database and passed.

## Commands and outcomes

- `npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 18 passed; one explicitly opt-in PostgreSQL test skipped by default;
    final run 24.87 s.
  - This includes real synthetic SQLite schema-3 and schema-4 exports, archive
    validation, no-primary-key multi-row validation, null-safe duplicates, all
    required partial-index drift failures, and target-key checks.
- `T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[unique loopback database] npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 19/19, 30.58 s; 45 discovered / 43 applied / 2 named skips,
    including the real deferrable-arbiter negative.
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

The first repair-round focused run passed 17 tests and reported one stale
expectation: the explicit schema-3 fixture now failed default schema-4 export
at the earlier and correct user-market null-safe enforcement check instead of
the later missing source-card column. Only that expected error assertion was
updated; the fresh focused and PostgreSQL runs above then passed.

The first combined final-check run exposed one test-only implicit `any` in the
new multi-row assertion. The row parameter was typed explicitly; the complete
fresh focused, recovery, typecheck, lint, syntax, and diff-check set then passed
as recorded above.

## Repair round 2: deterministic metadata parsing

Rejected source: `f11cb1abcb6b36734b8dee637bc832aad82811f5`

Unique-key metadata now sorts its canonical JSON with explicit JavaScript
code-unit `<`/`>` comparison. It does not use `localeCompare`, ICU, or the host
default locale. The focused regression temporarily replaces
`String.prototype.localeCompare` with a throwing function and proves valid
SQLite indexes `Z_key` and `a_key` remain ordered exactly `Z_key`, `a_key`.

Partial-index predicate extraction now uses a small deterministic scanner over
SQLite's stored index DDL. It tracks parenthesis depth, skips final/top-level
`WHERE` decoys inside single, double, backtick, and bracket quoted regions,
honors doubled quote escapes, and skips line and block comments. Predicate
normalization uses the same quote-aware comment handling. No SQL-parser
dependency was added.

The adversarial source uses an exact required index named with escaped double
quotes, an exact required index whose quoted identifier is `where`, additional
single/bracket-quoted decoys, both comment forms, and predicate-internal decoys.
Export and read-only verification preserve the exact canonical predicates and
accept the complete family. Replacing the null member with a decoy-rich drifted
predicate fails both paths closed. Metadata lookup uses the parameterized
SQLite `pragma_index_xinfo(?)` table-valued form so valid quoted index names do
not pass through an identifier-string interpolator.

Round-2 command evidence:

- `npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 18 passed; one PostgreSQL opt-in skipped; final run 25.76 s.
- `T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[unique loopback database] npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 19/19, 30.50 s; 45 discovered / 43 applied / 2 named skips.
- `npm run db:verify:recovery`
  - PASS: 37 application tables match SQLite schema and tracked migrations.
- `npm run typecheck`
  - PASS.
- `npm run lint`
  - PASS.
- `node --check` for all four recovery scripts
  - PASS.
- `git diff --check`
  - PASS.

The first round-2 focused run passed 17 tests and failed only when the existing
identifier-string interpolation rejected a valid single-quoted index name
before predicate scanning. The lookup was changed to parameter binding; the
fresh focused and PostgreSQL matrices above then passed. All round-2 activity
was local and synthetic. No remote/provider/customer/paid system was accessed
or mutated, and the disposable PostgreSQL resources were removed.

The first combined round-2 final check found two test-only TypeScript inference
gaps on values returned by JavaScript modules. Explicit manifest-key and index
name types were added; the fresh focused, recovery, typecheck, full lint,
four-script syntax, and diff-check run then passed as recorded above.

The final cleanup audit found one stale synthetic `source.db` under an earlier
`nosite-data-recovery-*` temporary directory. Its exact temp-root path and sole
fixture file were verified and removed; no matching recovery/key-order fixture
directories or task-owned Docker container, volume, or network remained.

## Repair round 3: single-statement persisted index DDL

Rejected source: `295dac10b414439d54e07b0d6e2976c074bf0185`

Partial-index predicate extraction now accepts one complete stored SQLite
`CREATE UNIQUE INDEX` statement only. The deterministic scanner requires a
valid create/index/on prefix, one balanced top-level index column list, and
exactly one top-level `WHERE` after that list. It rejects parenthesis underflow
or imbalance, multiple top-level predicates, tokens between the column list
and predicate, and any non-comment token after a terminal semicolon. One
optional terminal semicolon followed only by whitespace or line/block comments
remains valid. Quoted identifiers, doubled quote escapes, comment decoys,
predicate parentheses, code-unit metadata ordering, and exact predicate
normalization remain supported.

The persisted regression creates a physically wrong three-column unique index
whose real predicate is `workspace_id IS NOT NULL`, inserts two rows with the
same null-workspace logical identity, and then uses SQLite's test-only unsafe
mode plus `writable_schema` to append `; WHERE workspace_id IS NULL` to the
stored index DDL. The database is closed and reopened read-only. SQLite reports
`integrity_check = ok` and both duplicate rows remain readable, but export and
read-only recovery verification both reject the tokens after the terminal
semicolon before accepting index-family metadata. A second persisted fixture
proves a legitimate terminal semicolon plus comment/`WHERE` decoys still
exports and verifies with the canonical predicate. Metadata-probe cases cover
underflow, imbalance, a second top-level `WHERE`, and trailing tokens.

Round-3 command evidence:

- `npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 18 passed; one PostgreSQL opt-in skipped; final run 30.12 s.
- `T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[fresh unique loopback PostgreSQL 16] npx vitest run src/lib/__tests__/data-transfer-contract.test.ts --reporter=verbose`
  - PASS: 19/19, 36.30 s; 45 discovered / 43 applied / 2 named skips.
- `npm run db:verify:recovery`
  - PASS: 37 application tables match SQLite schema and tracked migrations.
- `npm run typecheck`
  - PASS.
- `npm run lint`
  - PASS.
- `node --check` for all four recovery scripts
  - PASS.
- `git diff --check`
  - PASS.

The first round-3 full run showed that SQLite rejects a persisted unmatched
parenthesis as malformed schema before application metadata inspection. Those
pure scanner-structure cases were moved to the public metadata-loader seam;
the accepted-by-SQLite semicolon forgery remains a persisted, closed/reopened,
read-only integration case. The next full run reached the original five-second
test timeout after adding the two persisted fixtures, so the existing combined
identity regression received an explicit ten-second ceiling. A focused rerun
and both fresh matrices then passed.

All round-3 activity was local and synthetic. No remote database, provider,
customer data, paid service, deployment, or production system was accessed or
mutated. The fresh PostgreSQL 16 container was removed in the test command's
`finally` cleanup; final task-owned Docker and temporary-fixture audits found
no residue.
