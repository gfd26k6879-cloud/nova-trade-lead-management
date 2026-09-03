# G-007P20A tenant researcher-actor AI-usage index

Date: 2026-08-01

Baseline: `2b0f2e2` (`codex/nova-multitenant-integration`)

Status: accepted locally by Sol; acceptance lineage pending

Implementation commit: `5076979cdef1c43f2ed404cd10c511f727ec642f`

Acceptance commit: `c8c3dba2ce980f2bfcbf7e0f6d71e1bf6a7d83d2`

Sol owns the root-only ledger, registry, handoff, crosswalk, and acceptance
lineage updates.

## Scope and boundary

This packet adds one PostgreSQL btree and no caller, authorization, RLS,
compatibility, or provider change:

```sql
CREATE INDEX idx_g007p20a_ai_usage_tenant_actor_created
  ON public.ai_usage_events (tenant_id,actor_user_id,created_at DESC)
  WHERE actor_user_id IS NOT NULL
    AND request_source IN ('researcher_ai_check','researcher_pitch_pack');
```

The definition is the smallest exact candidate proven by G-007P20 for the two
production researcher-cap sources. The current `getAiUsageForActor` helper is
still unscoped and retains the global actor index. Its generic alternate-source
contract also remains open. G-014 owns the caller tenant cutover and broader
actor optimization; G-021 owns tenant budget authorization. This packet does
not claim either card.

The full tracked chain now discovers 54 migrations, applies 52 portable
migrations, and skips the same two runtime-only scheduler files. Historical
stop-before applied counts remain unchanged while their discovered inventory
is 54.

## Guard and replay contract

Migration `202607310009_tenant_researcher_actor_ai_usage_index.sql` uses an
advisory transaction lock, `SHARE ROW EXCLUSIVE` on `ai_usage_events`,
deterministic object locks on both accepted trigger functions, and catalog
locks on `pg_proc`, `pg_class`, and `pg_attribute`. Its preflight pins:

- the six relevant column types, nullability, defaults, typmods, identity, and
  generated state plus the exact primary key;
- the tenant, tenant/lead, and tenant/verification G-004A/R1 foreign keys;
- exact healthy, table-owned global actor and tenant-created btrees;
- the accepted G-004A/R1 function hashes, language, owner, configuration,
  comments, ACLs, triggers, and normalizer binding footprint; and
- the owner-only table/column ACL, RLS, and no-policy boundary.

Baseline classification requires zero literal `idx_g007p20a_` objects. Final
classification requires exactly one target with exact table owner, btree access
method, three keys/no INCLUDE, native opclasses/collations, descending time
option, predicate, nonunique/nonprimary/nonexclusion/non-replica status,
immediacy, checkxmin, and live/ready/valid health. No `IF NOT EXISTS` repair is
used. Install and postflight are transactional and exact final replay is a
no-op.

## PostgreSQL 16 evidence

The focused test uses the pinned loopback-only PostgreSQL 16 image and
`prepare:false` postgres.js clients. It proves:

- fresh empty install, exact replay, full-chain replay, and injected
  post-install rollback with zero target residue;
- representative missing/spoofed states for both foundation indexes, columns,
  defaults, FKs, functions, triggers, RLS, table/column ACLs, reserved index and
  non-index siblings, and final owner/access-method/key-direction/INCLUDE/
  uniqueness/expression/health/immediacy/checkxmin families;
- a two-client 009-specific lock probe that blocks table writes, function
  configuration, column ACL/default changes, and reserved-prefix index DDL;
- exactly one production source constant and exact daily/monthly caller use of
  that constant, while the helper remains actor/source/lower-bound-only and
  unscoped; and
- a 120,007-row, two-tenant, physically interleaved historical fixture with a
  shared actor, desired/alternate/empty/null sources, null actors, and exact
  before/at-lower-bound controls.

The approved tenant-added parameterized PostgreSQL proxy returns byte-identical
rows and the same SHA-256 digest before and after installation. Its natural
plan uses `idx_g007p20a_ai_usage_tenant_actor_created` with no residual Filter.
The current unscoped desired-source query and unscoped alternate-source query
retain `idx_ai_usage_actor_created`. The tenant alternate-source proxy does not
use P20A and retains `idx_ai_usage_tenant_created`; global created, tenant time,
and global model controls retain their existing indexes. Global created/model,
nullable history, G-004A/R1 functions/triggers, RLS, policies, table/column
ACLs, and full index owner/access-method/opclass/option metadata are unchanged.

Implementer validation on Node 24.13.1 and npm 11.8.0:

- final-revision combined G-004A/P20A PostgreSQL matrix: 2/2 passed in
  207.47 seconds (G-004A 122.392 seconds; P20A 84.895 seconds);
- coverage-repaired P20A-only matrix: 1/1 passed in 72.388 seconds;
- G-002: 2/2 passed in 9.37 seconds;
- G-003: 6/6 passed in 177.02 seconds;
- G-005: 1/1 passed in 69.14 seconds;
- canonical tenant fixture Q-002: 1/1 passed in 2.90 seconds;
- T-029 fresh PostgreSQL 16 replay: 19/19 passed in 6.22 seconds and logged
  54/52/2;
- default six reserved test files: 20/20 passed, 11 opt-in PostgreSQL cases
  skipped as designed;
- implementer runtime caller/query regressions: 30/30 passed
  (`researcher-ai.actions` 6, `ai-verification.query` 13, and
  `scheduler.query` 11);
- Fedora-portable SQLite coordinator: 12 passed and 26 Windows-native cases
  skipped; historical native Windows 111/111 evidence is unchanged;
- recovery verification: all 37 application tables match SQLite and tracked
  migrations;
- production build: passed with 11/11 static pages; and
- TypeScript, focused ESLint, JSONL parsing, and `git diff --check`: passed.

Sol independently accepted the exact committed diff after architecture and
quality review reported no P0/P1/P2 finding. Root reruns passed G-004A/P20A
2/2 in 203.57 seconds, G-002 2/2, G-003 6/6, G-005 1/1, and T-029 19/19 at
54/52/2. Root also passed the exact preflight caller/adapter set 23/23
(`researcher-ai.actions`, `ai-verification.query`, and `db-postgres-client`),
the default reserved set 20/20 with 11 opt-in skips, TypeScript, focused
ESLint, recovery verification, Fedora-portable coordinator 12 with 26 native
Windows skips, production build, JSONL parsing, and diff checks.

## Truthful retries and cleanup

Initial guard work compared PostgreSQL vector arrays without accounting for
their zero lower bound; the exact comparisons were corrected to native vector
text. Expected explicit-transaction failures initially omitted test-side
`ROLLBACK` and produced `25P02`; the populated fixture initially combined
parameters with multiple SQL commands and produced `42601`. Both harness
errors were corrected. A physically
time-sorted fixture made the global created index artificially cheaper, so the
fixture was rebuilt with deterministic interleaved timestamps matching P20's
plan conditions. One combined upstream run hit the existing G-004A-R1
catalog-lock race with `40P01`; a fresh identical run passed 2/2 and the failed
run is not acceptance evidence. The first expanded-hostile run reported only
that a promise resolved instead of rejecting, without naming the loop case.
An explicit captured-error assertion then identified `owner`: normal
`ALTER INDEX OWNER` cannot violate PostgreSQL's table-owned index invariant.
The disposable catalog test now creates the otherwise unreachable owner spoof
directly, as it does for health/immediacy/checkxmin flags. An initial G-002
opt-in invocation omitted its required URL and failed before database access;
only its fresh correctly named loopback retry is evidence. Root's first T-029
invocation used a unique database suffix,
but that test requires `/t029_tenant_foundation_rehearsal`; it failed before
the PostgreSQL rehearsal, was removed, and the fresh exact-name retry passed.

The first implementation commit command failed before creating an object
because Git `user.name` and `user.email` were unset. No repository or global
configuration changed. The successful retry supplied the established
`Masih Hedayati <Masihhedayati@icloud.com>` identity one-shot, produced
`5076979cdef1c43f2ed404cd10c511f727ec642f`, and did not rewrite history; local
identity configuration remains unset.
Two initial G-003 containers used `pg_isready`, which returned against the
image entrypoint's temporary bootstrap server before the requested database
was created. The expected bootstrap fast shutdown then produced `ECONNRESET`
before schema work. The accepted fresh retry waited for
`psql -d <target> -Atc 'SELECT 1'` to return `1` before exposing the URL and
passed 6/6.

Every focused test asserts its uniquely named container is removed. The T-029
container, loopback listener, and task-owned processes were also removed. No
hosted Supabase operation, remote migration, deployment, provider call,
production/staging/customer-data access, push, pull request, credential change,
or external communication occurred.
