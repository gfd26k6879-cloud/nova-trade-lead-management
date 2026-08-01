# G-004A-R1 AI-usage transitive lead-delete repair

Date: 2026-08-01

Accepted at: 2026-08-01T01:45:45-06:00

Baseline: `b34ecd87db57a5750128cf2e2d62bbb34e897199`

Branch: `codex/nova-multitenant-integration`

Status: accepted forward repair

Source and validation receipt commit:
`e6e72b2cb04189ef1b445e74ad57e5204685f316`

## Scope and implementation

G-004A-R1 repairs the combined PostgreSQL referential-action failure that
blocked G-007P19. It adds only
`202607310008_harden_ai_usage_transitive_lead_delete.sql`, focused PostgreSQL
coverage, and the migration-count changes required by the new file. Accepted
migration `202607290003_add_ai_tenant_scope_worker_envelope.sql` is unchanged.

The migration installs
`public.novatrade_ai_usage_ri_null_normalize()` and a lexically earlier BEFORE
UPDATE trigger on `ai_usage_events`. The helper permits only PostgreSQL's
nested column-list SET NULL sequence: non-reference data must be byte-for-byte
unchanged, an explicitly nulled reference's old composite parent must already
be absent, and an unchanged sibling is nulled only when its exact old parent is
also absent. The accepted v2 `novatrade_ai_scope_guard()` remains the final
validator and retains source hash `ee67f73c...39e5`. The helper body hash is
`3a4a1c5e56eb32a0fbf36600ab0b2077cdc628d4ded0a562805eb7a6e3de656b`.

Preflight and postflight require the exact helper definition, exactly one
noninternal helper binding, the exact ordered two-trigger set, the accepted v2
definition, both composite foreign keys, columns, RLS, policies, table and
column ACLs, and existing reference alignment. Partial, spoofed, extra-binding,
extra-trigger, or mismatched-row states reject before surviving DDL. The
migration locks the affected tables and `pg_proc`, `pg_class`, and
`pg_attribute`; measured hostile CREATE/REPLACE, COMMENT, GRANT/REVOKE,
configuration, owner, drop, trigger, DML, RLS/policy, and table/column ACL
races were blocked. Rollback injection leaves no partial installation.

The full chain now discovers 53 migrations, applies 51, and skips the same two
runtime-only scheduler files. Sequence `202607310008` is consumed and
`202607310009` is next available.

## PostgreSQL 16 acceptance

The focused matrix used the pinned loopback-only image
`postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`
(PostgreSQL 16.14) and uniquely named `g004a_ai_scope_rehearsal_*` databases.
The legal two-tenant graph was exercised with both relevant foreign-key
creation orders. Deleting the lead of a both-linked usage event succeeds and
ends with both reference columns null while preserving tenant, actor, model,
payload, token/cost metadata, timestamps, and the other tenant's graph.
Lead-only and verification-only parent actions also pass.

Direct lead-only, verification-only, and both-reference nulling or rebinding
still reject with `G004A_USAGE_SCOPE_IMMUTABLE`. Nested payload/actor mutation
rejects with `G004AR1_USAGE_RI_NULL_SHAPE_INVALID`; a nested null while the old
parent remains present rejects. Cross-tenant references and attribution remain
rejected. Existing mismatched both-linked rows reject before DDL. Exact replay,
catalog spoof, extra binding/trigger, trigger ordering, ACL/RLS, ten-lock
serialization, and transactional rollback controls pass.

Validation results:

- corrected implementer PostgreSQL 16 matrix: 1/1 passed in 128.31 seconds;
- independent root PostgreSQL 16 matrix: 1/1 passed in 128.07 seconds;
- upstream G-002 PostgreSQL gate: 2/2 passed in 8.75 seconds;
- upstream G-003 PostgreSQL gate: 6/6 passed in 176.21 seconds;
- upstream G-005 PostgreSQL gate: 1/1 passed in 63.08 seconds;
- T-029 data-transfer contract: 19/19 passed in 6.19 seconds and logged
  53 discovered / 51 applied / 2 skipped;
- canonical tenant-fixture PostgreSQL gate: 1/1 passed in 5.88 seconds;
- TypeScript, focused ESLint, recovery verification, production build, and
  `git diff --check`: passed.

The focused command independently rerun by Sol was:

```text
G004A_RUN_DISPOSABLE_PG_TESTS=1 mise exec node@24.13.1 -- npm test -- --run src/lib/__tests__/ai-tenant-scope-worker-envelope-postgres.test.ts --reporter=verbose
```

Node was 24.13.1 and npm was 11.8.0. Independent security/catalog and
test-quality reviewers both returned PASS with no remaining P0, P1, or P2
finding. The implementer did not accept or commit its own work.

## Truthful retries and platform boundary

The first rollback-injection hook used an invalid nested dollar quote and was
replaced with a transactional division-by-zero injection before the clean
rerun. Initial G-002 invocations omitted the URL and then used a nonconforming
database prefix; a fresh correctly named loopback database passed. One focused
run used stale, swapped lock thresholds; the historical threshold was restored
to eight, the repair threshold to ten, and the repair lock hold increased to
six seconds before the clean runs above.

`npm run release:check` was invoked invalidly on Fedora and reached the paused
Windows-only G-006B lane. Before that boundary, TypeScript, ESLint, recovery,
and 127 Fedora-portable files passed (2,280 tests, 80 skipped). It then failed
with 81 ENOENT errors because `C:\\Windows\\...\\powershell.exe` does not exist
on Fedora. This invocation is not acceptance evidence. The historical native
Windows/NTFS 111/111 result remains authoritative and is neither rerun nor
replaced. G-006C2B remains unopened.

## Cleanup and continuing boundary

Every task-owned container, database, listener, process, temporary directory,
candidate object, and extra worktree was removed. The root acceptance run's
self-cleaning container and loopback port were also gone before acceptance.
Main remains `8225df619a96a088f18ff7f574a36b157d55dd2f`; the annotated handoff tag
object remains `a3f8278f600be87962642842a3fdd7600242cffd` and peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`.

No push, pull request, deployment, hosted Supabase operation, remote migration,
provider call, production/staging/customer-data access, credential change, or
external communication occurred. G-004 remains open because G-004B worker
correlation/redaction is separate. Parent G-007 and P19 remain open. The next
action is to resume the read-only P19 AI-usage reference-index audit on a fresh
53/51/2 PostgreSQL chain; this repair itself makes no index disposition.
